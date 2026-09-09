import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createTask, mutateTask, TaskError } from "../lib/task-service";
import { closed, followUpState, needsAttention, overdue, taskInclude, today, dateValue } from "../lib/tasks";
import { progressPercent } from "../lib/okr";

const folder = mkdtempSync(join(tmpdir(), "okr-task-tests-"));
const file = join(folder, "test.db");
const db = new PrismaClient({ datasourceUrl: `file:${file}` });
const actors = {
  owner: { id: "owner", name: "业务负责人", role: "MANAGER" },
  collaborator: { id: "collaborator", name: "库存负责人", role: "MANAGER" },
  other: { id: "other", name: "团队负责人", role: "MANAGER" },
  boss: { id: "boss", name: "老板", role: "BOSS" },
};
function form(data: Record<string, string | number>) {
  const f = new FormData(); Object.entries(data).forEach(([k, v]) => f.set(k, String(v))); return f;
}
const later = (days = 7) => dateValue(new Date(today().getTime() + days * 86400_000));
function basic(overrides: Record<string, string | number> = {}) {
  return { title: "旺季备货", area: "INVENTORY", kind: "LONG_TERM", ownerId: actors.owner.id, completionCriteria: "确认需求与出货排期", nextAction: "确认销售预测", nextFollowUpAt: later(), dueAt: later(30), ...overrides };
}
async function create() { return createTask(db, actors.owner, form(basic())); }
async function mutate(id: string, operation: Parameters<typeof mutateTask>[3], actor = actors.owner, extra: Record<string, string | number> = {}) {
  const t = await db.task.findUniqueOrThrow({ where: { id } });
  return mutateTask(db, actor, form({ taskId: id, version: t.version, ...extra }), operation);
}
async function progress(id: string, extra: Record<string, string | number> = {}) {
  return mutate(id, "progress", actors.owner, { updateKind: "PROGRESS", status: "WAITING", health: "ON_TRACK", summary: "测试仍在运行", nextAction: "按期收集结果", nextFollowUpAt: later(), ...extra });
}

before(async () => {
  const initial = readFileSync("prisma/migrations/20260905063634_init/migration.sql", "utf8");
  const migration = readFileSync("prisma/migrations/20260905110000_persistent_tasks/migration.sql", "utf8")
    + readFileSync("prisma/migrations/20260905123000_normalize_history_dates/migration.sql", "utf8")
    + readFileSync("prisma/migrations/20260909080000_period_wbs_raci_checkin/migration.sql", "utf8");
  execFileSync("python3", ["-c", `import sqlite3,sys,json
p=json.loads(sys.stdin.read())
c=sqlite3.connect(sys.argv[1]); c.executescript(p['initial'])
for u in p['actors']:
 c.execute('INSERT INTO User (id,name,email,passwordHash,role) VALUES (?,?,?,?,?)',(u['id'],u['name'],u['id']+'@test.local','unused',u['role']))
c.execute('INSERT INTO WeeklyTask (id,title,status,weekStart,ownerId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',('legacy','跨周历史任务','IN_PROGRESS',1704067200000,'owner',1704067200000,1704067200000))
c.execute('INSERT INTO WeeklyTask (id,title,status,weekStart,ownerId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',('legacy-done','历史完成任务','DONE',1704067200000,'boss',1704067200000,1704153600000))
c.execute('INSERT INTO Objective (id,title,description,cycle,ownerId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',('obj-q1','历史目标','','2024-Q1','owner',1704067200000,1704067200000))
c.commit(); c.executescript(p['migration']); assert not c.execute('PRAGMA foreign_key_check').fetchall(); c.close()`, file], { input: JSON.stringify({ initial, migration, actors: Object.values(actors) }) });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

test("迁移保留跨周任务、历史负责人及完成记录", async () => {
  const rows = await db.task.findMany({ where: { archivedAt: null }, include: taskInclude });
  assert.equal(rows.length, 2);
  const old = rows.find(t => t.id === "legacy")!;
  assert.equal(old.ownerId, "owner"); assert.equal(dateValue(old.legacyWeekStart), "2024-01-01");
  assert.equal(old.lastConfirmedAt, null); assert.equal(old.nextFollowUpAt, null);
  assert.equal(rows.filter(t => !closed(t)).length, 1);
  const done = rows.find(t => t.id === "legacy-done")!;
  assert.equal(done.ownerId, "boss"); assert.equal(done.completedAt?.getTime(), 1704153600000);
  assert.equal(await db.taskUpdate.count(), 2);
  const raci = await db.raciAssignment.findMany({ where: { subjectType: "TASK", subjectId: "legacy" } });
  assert.deepEqual(raci.map(row => `${row.role}:${row.userId}`).sort(), ["A:owner", "R:owner"]);
  const objective = await db.objective.findUniqueOrThrow({ where: { id: "obj-q1" }, include: { period: true } });
  assert.equal(objective.cycle, "2024-Q1");
  assert.equal(objective.period?.kind, "QUARTER");
  assert.equal(objective.period?.label, "2024-Q1");
});

test("同一事项多人协作，个人交付不完成整体任务", async () => {
  const id = await create();
  await mutate(id, "collaborator", actors.owner, { userId: "collaborator", deliverable: "提供销售预测", collaboratorDueAt: later(3) });
  await mutate(id, "contribution", actors.collaborator, { done: "true", note: "预测清单已交付" });
  const t = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  assert.equal(t.status, "TODO"); assert.equal(t.lastConfirmedAt, null); assert.equal(t.collaborators[0].done, true);
  assert.equal(await db.task.count({ where: { id } }), 1);
  assert.equal(t.collaborators[0].note, "预测清单已交付");
  await assert.rejects(mutate(id, "progress", actors.collaborator), /主负责人/);
  await assert.rejects(mutate(id, "contribution", actors.other, { done: "true", note: "伪造提交" }), /只有此任务的协作者/);
});

test("暂无变化只确认跟进，不虚增任务进度、不覆盖事实记录", async () => {
  const id = await create(); await progress(id);
  const before = await db.task.findUniqueOrThrow({ where: { id } });
  await mutate(id, "progress", actors.owner, { updateKind: "NO_CHANGE", nextFollowUpAt: later(14), summary: "仍在等待" });
  const after = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(after.status, "WAITING"); assert.equal(after.latestProgress, before.latestProgress);
  assert.equal(after.dueAt?.getTime(), before.dueAt?.getTime()); assert.equal(after.nextAction, before.nextAction);
  assert.equal(dateValue(after.nextFollowUpAt), later(14)); assert.ok(after.lastConfirmedAt);
  const log = await db.taskUpdate.findFirstOrThrow({ where: { taskId: id, kind: "NO_CHANGE" } });
  assert.equal(log.body, "仍在等待"); assert.equal(JSON.parse(log.snapshot).nextFollowUpAt, later(14));
});

test("老板在服务端被禁止创建及所有写入，伪造角色也无效", async () => {
  const id = await create();
  await assert.rejects(createTask(db, actors.boss, form(basic())), TaskError);
  const count = await db.taskUpdate.count();
  for (const operation of ["details", "progress", "collaborator", "contribution", "removeCollaborator", "milestone", "toggleMilestone", "archive", "restore"] as const) {
    await assert.rejects(mutateTask(db, { ...actors.boss, role: "MANAGER" }, form({ taskId: id, version: 0 }), operation), /仅可查看/);
  }
  assert.equal(await db.taskUpdate.count(), count);
});

test("过期版本提交整体回滚，保留已经提交的协作", async () => {
  const id = await create();
  const stale = form({ taskId: id, version: 0, userId: "other", deliverable: "旧页面安排" });
  await mutate(id, "collaborator", actors.owner, { userId: "collaborator", deliverable: "最新安排" });
  await assert.rejects(mutateTask(db, actors.owner, stale, "collaborator"), /刚被其他人更新/);
  const t = await db.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
  assert.equal(t.collaborators.length, 1); assert.equal(t.version, 1);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id } }), 2);
});

test("风险、等待、逾期确认分别表达，按上海日期判定", async () => {
  const id = await create(); await progress(id);
  let t = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(needsAttention(t), false); assert.equal(followUpState(t), "scheduled");
  await assert.rejects(progress(id, { status: "BLOCKED", riskNote: "" }), /阻塞原因/);
  await progress(id, { status: "BLOCKED", riskNote: "需要采购协调供应商" });
  t = await db.task.findUniqueOrThrow({ where: { id } }); assert.equal(t.health, "AT_RISK"); assert.equal(needsAttention(t), true);
  const now = new Date("2026-09-05T16:00:00Z");
  assert.equal(dateValue(today(now)), "2026-09-06");
  assert.equal(followUpState({ status: "WAITING", nextFollowUpAt: new Date("2026-09-05T00:00:00Z") }, now), "late");
  assert.equal(overdue({ status: "WAITING", dueAt: new Date("2026-09-06T00:00:00Z") }, now), false);
});

test("服务端拒绝无效日期、过期跟进及老板被安排为负责人", async () => {
  const invalidInputs: Record<string, string>[] = [ { dueAt: "2026-02-30" }, { nextFollowUpAt: "2020-01-01" }, { ownerId: "boss" }, { title: "" } ];
  for (const data of invalidInputs) {
    await assert.rejects(createTask(db, actors.owner, form(basic(data))), TaskError);
  }
});

test("完成、归档、恢复和重新开启都保留历史", async () => {
  const id = await create();
  await assert.rejects(mutate(id, "archive"), /先完成或取消/);
  await progress(id, { status: "DONE", summary: "排期确认单已交付" });
  let t = await db.task.findUniqueOrThrow({ where: { id } }); assert.ok(t.completedAt); assert.equal(t.nextFollowUpAt, null);
  await mutate(id, "archive"); await assert.rejects(progress(id), /先恢复/);
  await mutate(id, "restore"); await progress(id, { status: "IN_PROGRESS", summary: "新增补充需求，重新开启" });
  t = await db.task.findUniqueOrThrow({ where: { id } }); assert.equal(t.completedAt, null); assert.equal(t.archivedAt, null);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id } }), 5);
});

test("节点完成独立记录，移交负责人要求重新确认", async () => {
  const id = await create(); await progress(id);
  await mutate(id, "milestone", actors.owner, { milestoneTitle: "确认销售预测", milestoneDueAt: later() });
  const milestone = await db.taskMilestone.findFirstOrThrow({ where: { taskId: id } });
  await mutate(id, "toggleMilestone", actors.owner, { milestoneId: milestone.id });
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).status, "WAITING");
  await mutate(id, "details", actors.owner, basic({ ownerId: "other" }));
  const t = await db.task.findUniqueOrThrow({ where: { id } }); assert.equal(t.ownerId, "other"); assert.equal(t.lastConfirmedAt, null);
  await assert.rejects(progress(id), /主负责人/);
});

test("降低类指标使用起点，ACOS 35→25 的 30% 为完成一半", () => {
  assert.equal(progressPercent(35, 25, 35, "DECREASE"), 0);
  assert.equal(progressPercent(30, 25, 35, "DECREASE"), 50);
  assert.equal(progressPercent(25, 25, 35, "DECREASE"), 100);
  assert.equal(progressPercent(40, 25, 35, "DECREASE"), 0);
  assert.equal(progressPercent(28, 35), 80);
});


test("历史迁入与新进展按同一时间类型排序", async () => {
  const id = await create();
  const newest = await db.taskUpdate.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  assert.equal(newest.taskId, id);
  const types = await db.$queryRawUnsafe<{ kind: string; count: bigint }[]>(`SELECT typeof(createdAt) AS kind, COUNT(*) AS count FROM TaskUpdate GROUP BY typeof(createdAt)`);
  assert.deepEqual(types.map(row => row.kind), ["integer"]);
});
