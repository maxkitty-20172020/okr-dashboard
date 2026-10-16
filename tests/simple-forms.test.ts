import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createTask, followUpDate, mutateTask, TaskError } from "../lib/task-service";
import { dateValue, today } from "../lib/tasks";
import { ensurePeriodTree } from "../lib/period";
import { weekBounds } from "../lib/week";
import { loadOverview } from "../lib/overview-service";
import { reportStateLabel, submitCheckIn } from "../lib/check-in";

const folder = mkdtempSync(join(tmpdir(), "okr-simple-forms-"));
const db = new PrismaClient({ datasourceUrl: `file:${join(folder, "test.db")}` });
const owner = { id: "owner", name: "李明", role: "MANAGER" };
const basic = { title: "确认旺季备货", completionCriteria: "拿到排期和补货数量", ownerId: owner.id };
function form(data: Record<string, string | number>) {
  const f = new FormData();
  for (const [key, value] of Object.entries(data)) f.set(key, String(value));
  return f;
}
async function create(extra: Record<string, string | number> = {}) { return createTask(db, owner, form({ ...basic, ...extra })); }
async function mutate(id: string, extra: Record<string, string | number>, operation: "progress" | "details" = "progress") {
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  return mutateTask(db, owner, form({ taskId: id, version: task.version, ...extra }), operation);
}
const progress = { summary: "排期已收到", nextAction: "确认补货数量" };

before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${join(folder, "test.db")}` }, stdio: "pipe" });
  await db.user.create({ data: { ...owner, role: "MANAGER", email: "owner@test.local", passwordHash: "unused" } });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

test("只填三个问题即可创建，选填有默认值且负责人默认当前用户", async () => {
  const id = await create();
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(task.title, basic.title); assert.equal(task.completionCriteria, basic.completionCriteria);
  assert.equal(task.ownerId, owner.id); assert.equal(task.area, "OTHER"); assert.equal(task.priority, 1);
  assert.equal(task.kind, "LONG_TERM"); assert.equal(task.dueAt, null); assert.equal(task.keyResultId, null);
  assert.equal(task.scope, ""); assert.equal(task.nextAction, "明确推进计划");
  assert.equal(dateValue(task.nextFollowUpAt), dateValue(followUpDate(form({}))));
  assert.equal((await db.task.findUniqueOrThrow({ where: { id: await create({ ownerId: "" }) } })).ownerId, owner.id);
  for (const key of ["title", "completionCriteria"]) await assert.rejects(create({ [key]: "" }), TaskError);
  await assert.rejects(create({ ownerId: "missing" }), TaskError);
});

test("kind 在新建及编辑时只根据期限推导，保留 priority=0，下一步空白有默认值", async () => {
  const id = await create({ dueAt: "2030-02-01", kind: "LONG_TERM", priority: 0, nextAction: "  " });
  let task = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(task.kind, "SHORT_TERM"); assert.equal(task.priority, 0); assert.equal(task.nextAction, "明确推进计划");
  await mutate(id, { ...basic, dueAt: "", kind: "SHORT_TERM" }, "details");
  task = await db.task.findUniqueOrThrow({ where: { id } }); assert.equal(task.kind, "LONG_TERM");
  await mutate(id, { ...basic, dueAt: "2030-02-02" }, "details");
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).kind, "SHORT_TERM");
});

test("四种跟进选项按上海日历计算，周一选下周一为七天后", () => {
  const now = new Date("2026-10-18T16:00:00Z"); // Shanghai Monday
  for (const [preset, expected] of [["tomorrow", "2026-10-20"], ["in3days", "2026-10-22"], ["nextMonday", "2026-10-26"], ["custom", "2026-10-19"]]) {
    assert.equal(dateValue(followUpDate(form({ followPreset: preset, nextFollowUpAt: "2026-10-19" }), now)), expected);
  }
  assert.equal(dateValue(followUpDate(form({ followPreset: "nextMonday" }), new Date("2026-10-18T15:59:59Z"))), "2026-10-19");
  assert.equal(dateValue(followUpDate(form({ followPreset: "tomorrow" }), new Date("2026-10-18T15:59:59Z"))), "2026-10-19");
  assert.equal(dateValue(followUpDate(form({ followPreset: "in3days" }), new Date("2026-12-30T16:00:00Z"))), "2027-01-03");
  assert.throws(() => followUpDate(form({ followPreset: "custom", nextFollowUpAt: "2026-10-18" }), now), /不能早于今天/);
  for (const nextFollowUpAt of ["", "2026-02-30", "invalid"]) assert.throws(() => followUpDate(form({ followPreset: "custom", nextFollowUpAt }), now), TaskError);
  assert.throws(() => followUpDate(form({ followPreset: "invalid" }), now), TaskError);
  assert.equal(weekBounds(new Date("2026-10-18T16:00:00Z")).label, "2026-W43");
});

for (const [mood, status, health] of [
  ["ok", "IN_PROGRESS", "ON_TRACK"], ["risk", "IN_PROGRESS", "AT_RISK"], ["wait", "WAITING", "ON_TRACK"],
  ["stuck", "BLOCKED", "AT_RISK"], ["done", "DONE", "ON_TRACK"], ["cancel", "CANCELLED", "ON_TRACK"],
]) test(`${mood} 映射、同一事务自动记录本周汇报且只增加一条任务历史`, async () => {
  const id = await create();
  const before = await loadOverview(db, owner, { kind: "WEEK" });
  assert.ok(before.missingIds.has(id));
  await mutate(id, { ...progress, mood, riskNote: mood === "risk" || mood === "stuck" ? "需要采购协助" : "", waitingOn: "赵强核对库存数", status: "TODO", health: "AT_RISK", updateKind: "NO_CHANGE" });
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(task.status, status); assert.equal(task.health, health); assert.equal(task.version, 1);
  assert.equal(task.latestProgress, mood === "wait" ? `${progress.summary}（在等：赵强核对库存数）` : progress.summary);
  if (["done", "cancel"].includes(mood)) { assert.ok(task.completedAt); assert.equal(task.nextFollowUpAt, null); assert.equal(task.nextAction, ""); }
  else assert.equal(task.nextAction, progress.nextAction);
  const reports = await db.checkIn.findMany({ where: { scopeType: "TASK", scopeId: id }, include: { period: true } });
  assert.equal(reports.length, 1); assert.equal(reports[0].status, "SUBMITTED"); assert.equal(reports[0].authorId, owner.id);
  assert.equal(reports[0].period.label, weekBounds().label); assert.equal(reports[0].period.kind, "WEEK");
  assert.equal(reports[0].body, task.latestProgress); assert.equal(reports[0].blocker, task.riskNote || null); assert.equal(reports[0].nextStep, task.nextAction || null);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id } }), 2);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id, kind: "CHECKIN" } }), 0);
  const after = await loadOverview(db, owner, { kind: "WEEK" });
  assert.ok(!after.missingIds.has(id)); assert.equal(after.unreported.length, before.unreported.length - 1);
});

test("same 仅确认和调整跟进日，写 NO_CHANGE 且不覆盖任务事实", async () => {
  const id = await create(); await mutate(id, { ...progress, mood: "stuck", riskNote: "采购支持" });
  const before = await db.task.findUniqueOrThrow({ where: { id } });
  await mutate(id, { mood: "same", summary: "等待采购回复", status: "DONE", health: "ON_TRACK", nextAction: "不应写入", riskNote: "不应写入", followPreset: "tomorrow" });
  const after = await db.task.findUniqueOrThrow({ where: { id } });
  for (const key of ["status", "health", "latestProgress", "riskNote", "nextAction", "dueAt"] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(dateValue(after.nextFollowUpAt), dateValue(followUpDate(form({ followPreset: "tomorrow" }))));
  assert.ok(after.lastConfirmedAt);
  const report = await db.checkIn.findFirstOrThrow({ where: { scopeId: id, status: "NO_CHANGE" } });
  assert.equal(report.body, "等待采购回复"); assert.equal(report.nextStep, before.nextAction); assert.equal(report.blocker, before.riskNote);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id, kind: "NO_CHANGE" } }), 1);
  assert.ok(!(await loadOverview(db, owner, { kind: "WEEK" })).missingIds.has(id));
  const fresh = await create(); await mutate(fresh, { mood: "same" });
  assert.equal((await db.checkIn.findFirstOrThrow({ where: { scopeId: fresh } })).status, "NO_CHANGE");
});

test("所有必填与非法选项由服务端拒绝，失败不写进展和汇报", async () => {
  const id = await create();
  const invalid: Record<string, string | number>[] = [
    { ...progress, mood: "risk" }, { ...progress, mood: "stuck", riskNote: "  " },
    { mood: "done" }, { mood: "cancel" }, { mood: "ok", nextAction: "推进" },
    { mood: "wait", summary: "等待回复" }, { ...progress, mood: "invalid" }, { ...progress, mood: "", status: "IN_PROGRESS", health: "ON_TRACK" },
    { ...progress, mood: "ok", followPreset: "custom", nextFollowUpAt: "2020-01-01" },
  ];
  for (const fields of invalid) await assert.rejects(mutate(id, fields), TaskError);
  assert.equal(await db.checkIn.count({ where: { scopeId: id } }), 0);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id } }), 1);
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).version, 0);
  await mutate(id, { mood: "done", summary: "最终交付结果" }); // No next step or follow-up needed
  await assert.rejects(mutate(id, { mood: "same" }), /已结束/);
});

test("旧参数仍可更新状态健康、显式日期及确认暂无变化；独立汇报和历史保留", async () => {
  const id = await create(); const { week } = await ensurePeriodTree(db);
  const old = await submitCheckIn(db, owner, { periodId: week.id, scopeType: "TASK", scopeId: id, status: "SUBMITTED", body: "历史独立汇报" });
  const nextFollowUpAt = dateValue(new Date(today().getTime() + 5 * 86400_000));
  await mutate(id, { ...progress, updateKind: "PROGRESS", status: "WAITING", health: "AT_RISK", riskNote: "需要支持", nextFollowUpAt });
  let task = await db.task.findUniqueOrThrow({ where: { id } });
  assert.equal(task.status, "WAITING"); assert.equal(task.health, "AT_RISK"); assert.equal(dateValue(task.nextFollowUpAt), nextFollowUpAt);
  await mutate(id, { updateKind: "NO_CHANGE", nextFollowUpAt });
  task = await db.task.findUniqueOrThrow({ where: { id } }); assert.equal(task.latestProgress, progress.summary);
  assert.equal(await db.checkIn.count({ where: { scopeId: id } }), 3);
  assert.equal((await db.checkIn.findUniqueOrThrow({ where: { id: old.id } })).body, "历史独立汇报");
});

test("陈旧版本不能产生额外汇报；汇报写入失败时进展和版本也回滚", async () => {
  const id = await create(); await mutate(id, { mood: "same" });
  await assert.rejects(mutateTask(db, owner, form({ taskId: id, version: 0, mood: "same" }), "progress"), /刚被其他人更新/);
  await db.$executeRawUnsafe(`CREATE TRIGGER reject_simple_report BEFORE INSERT ON CheckIn BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
  try { await assert.rejects(mutate(id, { ...progress, mood: "ok" })); }
  finally { await db.$executeRawUnsafe("DROP TRIGGER reject_simple_report"); }
  assert.equal((await db.task.findUniqueOrThrow({ where: { id } })).version, 1);
  assert.equal(await db.checkIn.count({ where: { scopeId: id } }), 1);
  assert.equal(await db.taskUpdate.count({ where: { taskId: id } }), 2);
});

test("待填写文案区分周任务、月关键结果和季目标", () => {
  assert.equal(reportStateLabel("UNREPORTED", "TASK"), "本周还没写进展");
  assert.equal(reportStateLabel("UNREPORTED", "KEY_RESULT"), "本月还没复盘");
  assert.equal(reportStateLabel("UNREPORTED", "OBJECTIVE"), "本季还没评估");
});
