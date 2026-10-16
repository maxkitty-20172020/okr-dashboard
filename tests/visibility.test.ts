import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { canViewTask, TASK_NOT_VISIBLE, visibleTaskWhere } from "../lib/task-visibility";
import { createTask, mutateTask } from "../lib/task-service";
import { canAuthorCheckIn, submitCheckIn } from "../lib/check-in";
import { loadCheckInAuthorizer } from "../lib/check-in-permissions";
import { loadTaskList } from "../lib/tasks-view";
import { loadRedesignDashboard } from "../lib/dashboard-view";
import { loadOverview } from "../lib/overview-service";
import { loadObjectiveDetail } from "../lib/objective-detail-view";
import { loadTaskDetail } from "../lib/task-detail-view";
import { weeklyOverview } from "../lib/redesign-view";
import { ensurePeriodTree } from "../lib/period";
import { ensureTaskRaciDefaults } from "../lib/raci";

const folder = mkdtempSync(join(tmpdir(), "okr-visibility-"));
const url = `file:${join(folder, "visibility.db")}`;
const db = new PrismaClient({ datasourceUrl: url });
const a = { id: "a", name: "李明", role: "MANAGER" as const };
const b = { id: "b", name: "王芳", role: "MANAGER" as const };
const creator = { id: "creator", name: "赵强", role: "MANAGER" as const };
const boss = { id: "boss", name: "陈总", role: "BOSS" as const };
const disabled = { id: "disabled", name: "停用成员", role: "MANAGER" as const };
const form = (data: Record<string, string | number>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, String(value));
  return result;
};
async function mutate(id: string, actor: typeof a | typeof boss, operation: Parameters<typeof mutateTask>[3], fields: Record<string, string | number> = {}) {
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  return mutateTask(db, actor, form({ taskId: id, version: task.version, ...fields }), operation);
}
async function fresh(owner = a) {
  const task = await db.task.create({ data: { ownerId: owner.id, title: `独有事项-${Math.random()}`, completionCriteria: "完成交付", lastConfirmedAt: new Date() } });
  await ensureTaskRaciDefaults(db, task);
  return task;
}
before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const user of [a, b, creator, boss, disabled]) await db.user.create({ data: { ...user, email: `${user.id}@test.local`, passwordHash: "unused", disabledAt: user.id === disabled.id ? new Date() : null } });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

test("唯一策略：主责、有效协作、创建记录；其他历史和 RACI 不授予可见权，老板全可见", async () => {
  const task = await fresh();
  await db.taskCollaborator.create({ data: { taskId: task.id, userId: b.id, deliverable: "清单" } });
  await db.taskUpdate.create({ data: { taskId: task.id, kind: "CREATED", authorId: creator.id, body: "创建", snapshot: "{}" } });
  for (const user of [a, b, creator, boss, disabled]) {
    const row = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { collaborators: true, updates: true } });
    const allowed = user.id !== disabled.id;
    assert.equal(canViewTask(user, row), allowed);
    assert.equal(!!await db.task.findFirst({ where: { id: task.id, AND: [visibleTaskWhere(user)] } }), allowed);
  }
  await mutate(task.id, a, "removeCollaborator", { collaboratorId: (await db.taskCollaborator.findFirstOrThrow({ where: { taskId: task.id } })).id });
  await db.raciAssignment.create({ data: { subjectType: "TASK", subjectId: task.id, userId: b.id, role: "I" } });
  assert.equal(await loadTaskDetail(db, b, task.id, {}), null);
  const row = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { collaborators: true, updates: true } });
  assert.equal(canViewTask(b, row), false);
  assert.equal(await db.task.count({ where: { id: task.id, AND: [visibleTaskWhere(b)] } }), 0);
});

test("列表、搜索、周期异常、工作台动态/计数、周月季总览及目标关联只包含可见事项", async () => {
  const { quarter } = await ensurePeriodTree(db);
  const objective = await db.objective.create({ data: { title: "部门目标", ownerId: a.id, cycle: quarter.label, periodId: quarter.id, keyResults: { create: { title: "部门关键结果", targetValue: 10 } } }, include: { keyResults: true } });
  const visible = await fresh(b);
  const hidden = await fresh(a);
  for (const task of [visible, hidden]) {
    await db.task.update({ where: { id: task.id }, data: { keyResultId: objective.keyResults[0].id, health: "AT_RISK", riskNote: "需要支持" } });
    await db.taskUpdate.create({ data: { taskId: task.id, authorId: a.id, kind: "PROGRESS", body: task.title, snapshot: "{}" } });
  }
  const assertVisible = (rows: { id: string }[]) => { assert.ok(!rows.some(row => row.id === hidden.id)); };
  for (const params of [{}, { q: hidden.title }, { filter: "archived" }, { filter: "closed" }, { filter: "done" }, { filter: "attention" }, { kind: "WEEK", exception: "risk" }, { kind: "MONTH", exception: "unreported" }, { person: a.id }]) assertVisible((await loadTaskList(db, b, params)).tasks);
  const dashboard = await loadRedesignDashboard(db, b);
  assertVisible(dashboard.active);
  assert.ok(!dashboard.updates.some(row => row.taskId === hidden.id));
  assert.ok(!dashboard.week.pending.some(row => row.id === hidden.id));
  for (const kind of ["WEEK", "MONTH", "QUARTER"]) {
    const view = await loadOverview(db, b, { kind });
    assertVisible(view.tasks); assertVisible(view.visibleTasks);
    assert.ok(view.objectives.some(row => row.id === objective.id));
    assert.ok(!view.objectiveViews.get(objective.id)!.related.some(row => row.id === hidden.id));
    assert.ok(![...view.checkIns.values()].some(row => row.scopeType === "TASK" && row.scopeId === hidden.id));
    if (kind === "WEEK") {
      const week = weeklyOverview(view, b);
      assert.ok(week.groups.every(group => group.ownerId === b.id));
      assert.equal(view.activeTaskCount, view.tasks.filter(row => !["DONE", "CANCELLED"].includes(row.status)).length);
    }
  }
  const detail = await loadObjectiveDetail(db, b, objective.id, {});
  assert.ok(detail); assert.deepEqual(detail.tasks.map(row => row.id), [visible.id]);
  assert.deepEqual(detail.keyResultViews.get(objective.keyResults[0].id)!.related.map(row => row.id), [visible.id]);
  assert.equal(await loadTaskDetail(db, b, hidden.id, {}), null);
  assert.ok(await loadTaskDetail(db, boss, hidden.id, {}));
});

test("不可见事项的全部 mutate、TASK 汇报和总览暂无变化拒绝且不写入；RACI 不能绕过", async () => {
  const task = await fresh();
  await db.raciAssignment.deleteMany({ where: { subjectId: task.id, role: "A" } });
  await db.raciAssignment.create({ data: { subjectType: "TASK", subjectId: task.id, userId: b.id, role: "A" } });
  const count = await db.taskUpdate.count();
  for (const operation of ["details", "progress", "collaborator", "contribution", "removeCollaborator", "milestone", "toggleMilestone", "archive", "restore"] as const) await assert.rejects(mutate(task.id, b, operation), { message: TASK_NOT_VISIBLE });
  await assert.rejects(mutate(task.id, b, "progress", { mood: "same" }), { message: TASK_NOT_VISIBLE });
  const { week } = await ensurePeriodTree(db);
  for (const status of ["SUBMITTED", "NO_CHANGE"]) await assert.rejects(submitCheckIn(db, b, { periodId: week.id, scopeType: "TASK", scopeId: task.id, status, body: "越权" }), { message: TASK_NOT_VISIBLE });
  assert.equal(await canAuthorCheckIn(db, b, "TASK", task.id), false);
  assert.equal((await loadCheckInAuthorizer(db, b, [{ scopeType: "TASK", scopeId: task.id }]))("TASK", task.id), false);
  assert.equal(await db.taskUpdate.count(), count);
  assert.equal(await db.checkIn.count({ where: { scopeId: task.id } }), 0);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: task.id } })).version, 0);
  await assert.rejects(mutateTask(db, b, form({ taskId: "missing", version: 0 }), "progress"), { message: TASK_NOT_VISIBLE });
});

test("协作者及非主责创建者不能改资料、归档或恢复；主负责人仍可操作", async () => {
  const task = await fresh();
  await db.taskCollaborator.create({ data: { taskId: task.id, userId: b.id, deliverable: "清单" } });
  for (const operation of ["details", "archive", "restore"] as const) await assert.rejects(mutate(task.id, b, operation), /主负责人/);
  await mutate(task.id, a, "progress", { mood: "done", summary: "已交付" });
  await mutate(task.id, a, "archive");
  await assert.rejects(mutate(task.id, b, "restore"), /主负责人/);
  await mutate(task.id, a, "restore");
  const id = await createTask(db, creator, form({ title: "替别人创建", completionCriteria: "交付", ownerId: a.id }));
  assert.ok(await loadTaskDetail(db, creator, id, {}));
  await assert.rejects(mutate(id, creator, "details"), /主负责人/);
});

test("老板 transfer 仅改负责人和确认标记，记录历史、同步 R/A/C；原非创建负责人失去可见权", async () => {
  const task = await fresh();
  await db.taskUpdate.create({ data: { taskId: task.id, kind: "CREATED", authorId: creator.id, body: "创建", snapshot: "{}" } });
  await db.taskCollaborator.create({ data: { taskId: task.id, userId: b.id, deliverable: "已交", done: true } });
  await db.raciAssignment.create({ data: { subjectType: "TASK", subjectId: task.id, userId: b.id, role: "C" } });
  await mutate(task.id, boss, "transfer", { ownerId: b.id, title: "恶意覆盖", status: "DONE", dueAt: "2020-01-01" });
  const updated = await db.task.findUniqueOrThrow({ where: { id: task.id } });
  assert.equal(updated.ownerId, b.id); assert.equal(updated.lastConfirmedAt, null); assert.equal(updated.version, 1);
  for (const key of ["title", "completionCriteria", "status", "dueAt", "nextFollowUpAt", "latestProgress", "keyResultId", "archivedAt"] as const) assert.deepEqual(updated[key], task[key]);
  assert.deepEqual((await db.raciAssignment.findMany({ where: { subjectId: task.id } })).map(row => `${row.role}:${row.userId}`).sort(), ["A:b", "R:b"]);
  assert.equal((await db.taskUpdate.findFirstOrThrow({ where: { taskId: task.id, kind: "TRANSFER" } })).body, "陈总 将负责人由 李明 移交给 王芳");
  assert.equal(await loadTaskDetail(db, a, task.id, {}), null);
  assert.ok(await loadTaskDetail(db, creator, task.id, {}));
  await mutate(task.id, b, "progress", { mood: "ok", summary: "已接手推进", nextAction: "继续交付" });
  const ownCreated = await createTask(db, a, form({ title: "自己创建后移交", completionCriteria: "交付" }));
  await mutate(ownCreated, boss, "transfer", { ownerId: b.id });
  assert.ok(await loadTaskDetail(db, a, ownCreated, {}));
  // Member details transfer uses exactly the same policy and audit transaction.
  const handed = await fresh();
  await mutate(handed.id, a, "details", { title: handed.title, completionCriteria: "交付", ownerId: b.id });
  assert.equal(await loadTaskDetail(db, a, handed.id, {}), null);
});

test("transfer 拒绝未完成协作、旧版本、老板/停用目标、同一负责人、伪造身份；老板其他写入仍拒绝", async () => {
  const task = await fresh();
  await db.taskCollaborator.create({ data: { taskId: task.id, userId: b.id, deliverable: "未交付" } });
  await assert.rejects(mutate(task.id, boss, "transfer", { ownerId: b.id }), /未完成的协作/);
  await db.taskCollaborator.updateMany({ where: { taskId: task.id }, data: { active: false } });
  for (const ownerId of [boss.id, disabled.id, "missing"]) await assert.rejects(mutate(task.id, boss, "transfer", { ownerId }), /未停用的填报成员/);
  await assert.rejects(mutate(task.id, boss, "transfer", { ownerId: a.id }), /另一位/);
  await assert.rejects(mutateTask(db, { ...a, role: "BOSS" }, form({ taskId: task.id, version: 0, ownerId: b.id }), "transfer"), /只有老板/);
  const before = await db.task.findUniqueOrThrow({ where: { id: task.id } });
  await mutate(task.id, boss, "transfer", { ownerId: b.id });
  await assert.rejects(mutateTask(db, boss, form({ taskId: task.id, version: before.version, ownerId: a.id }), "transfer"), /刚被其他人更新/);
  for (const operation of ["details", "progress", "collaborator", "contribution", "removeCollaborator", "milestone", "toggleMilestone", "archive", "restore"] as const) await assert.rejects(mutate(task.id, boss, operation), /仅可查看/);
  await assert.rejects(createTask(db, boss, form({ title: "越权" })), /仅可查看/);
  assert.equal(await db.taskUpdate.count({ where: { taskId: task.id } }), 1);
});
