import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { ensurePeriodTree } from "../lib/period";
import { countTaskExceptions, expectedTargets, relatedTaskIdsForUnreported, tasksInPeriod } from "../lib/overview";
import { canAuthorCheckIn, submitCheckIn, unreportedScopeIds } from "../lib/check-in";
import { taskCompletionRate } from "../lib/okr";
import { createTask, mutateTask } from "../lib/task-service";
import { dateValue, today } from "../lib/tasks";

const folder = mkdtempSync(join(tmpdir(), "okr-integrity-"));
const file = join(folder, "test.db");
const db = new PrismaClient({ datasourceUrl: `file:${file}` });
const owner = { id: "owner", name: "负责人", role: "MANAGER" };
before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${file}` }, stdio: "pipe" });
  await db.user.createMany({ data: ["owner", "next", "boss"].map(id => ({ id, name: id, email: `${id}@test.local`, passwordHash: "unused", role: id === "boss" ? "BOSS" : "MANAGER" })) });
});

function form(data: Record<string, string | number>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(data)) result.set(key, String(value));
  return result;
}
const basic = { title: "分工同步", ownerId: "owner", area: "OTHER", kind: "SHORT_TERM", completionCriteria: "验收", nextAction: "执行", nextFollowUpAt: dateValue(new Date(today().getTime() + 86400_000)) };
async function mutate(id: string, operation: Parameters<typeof mutateTask>[3], fields: Record<string, string | number>, actor = owner) {
  const task = await db.task.findUniqueOrThrow({ where: { id } });
  return mutateTask(db, actor, form({ taskId: id, version: task.version, ...fields }), operation);
}
async function roles(id: string) {
  return (await db.raciAssignment.findMany({ where: { subjectType: "TASK", subjectId: id } })).map(r => `${r.role}:${r.userId}`).sort();
}

test("创建、协作增删及移交在事务中同步 RACI，旧负责人失去汇报权限", async () => {
  const id = await createTask(db, owner, form(basic));
  assert.deepEqual(await roles(id), ["A:owner", "R:owner"]);
  await mutate(id, "collaborator", { userId: "next", deliverable: "交付" });
  assert.deepEqual(await roles(id), ["A:owner", "C:next", "R:owner"]);
  const { week } = await ensurePeriodTree(db);
  await assert.rejects(submitCheckIn(db, { id: "next", role: "MANAGER" }, { periodId: week.id, scopeType: "TASK", scopeId: id, status: "NO_CHANGE", body: "" }), /主责汇报人/);
  await assert.rejects(mutate(id, "details", { ...basic, ownerId: "next" }), /未完成/);
  assert.deepEqual(await roles(id), ["A:owner", "C:next", "R:owner"]);
  await mutate(id, "contribution", { note: "已交付", done: "true" }, { id: "next", name: "新负责人", role: "MANAGER" });
  await mutate(id, "details", { ...basic, ownerId: "next" });
  assert.deepEqual(await roles(id), ["A:next", "R:next"]);
  assert.equal(await canAuthorCheckIn(db, owner, "TASK", id), false);
  assert.equal(await canAuthorCheckIn(db, { id: "next", role: "MANAGER" }, "TASK", id), true);
  const next = { id: "next", name: "新负责人", role: "MANAGER" };
  await mutate(id, "collaborator", { userId: "owner", deliverable: "移交后协作" }, next);
  assert.deepEqual(await roles(id), ["A:next", "C:owner", "R:next"]);
  assert.equal(await canAuthorCheckIn(db, owner, "TASK", id), false);
  const c = await db.taskCollaborator.findUniqueOrThrow({ where: { taskId_userId: { taskId: id, userId: "owner" } } });
  await mutate(id, "removeCollaborator", { collaboratorId: c.id }, next);
  assert.deepEqual(await roles(id), ["A:next", "R:next"]);
  await mutate(id, "collaborator", { userId: "owner", deliverable: "重新安排" }, next);
  assert.deepEqual(await roles(id), ["A:next", "C:owner", "R:next"]);
  const before = await db.task.findUniqueOrThrow({ where: { id } });
  const raciBefore = await roles(id);
  const historyBefore = await db.taskUpdate.findMany({ where: { taskId: id } });
  const collaboratorBefore = await db.taskCollaborator.findMany({ where: { taskId: id } });
  await db.$executeRawUnsafe("CREATE TRIGGER reject_task_audit BEFORE INSERT ON TaskUpdate BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  try {
    await assert.rejects(mutate(id, "contribution", { note: "已交付", done: "true" }));
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER reject_task_audit");
  }
  assert.deepEqual(await db.task.findUniqueOrThrow({ where: { id } }), before);
  assert.deepEqual(await roles(id), raciBefore);
  assert.deepEqual(await db.taskUpdate.findMany({ where: { taskId: id } }), historyBefore);
  assert.deepEqual(await db.taskCollaborator.findMany({ where: { taskId: id } }), collaboratorBefore);
  await mutate(id, "contribution", { note: "已交付", done: "true" });
  const transferBefore = await db.task.findUniqueOrThrow({ where: { id } });
  const transferCollaboratorsBefore = await db.taskCollaborator.findMany({ where: { taskId: id } });
  await db.$executeRawUnsafe("CREATE TRIGGER reject_task_audit BEFORE INSERT ON TaskUpdate BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  try {
    await assert.rejects(mutate(id, "details", { ...basic, ownerId: "owner" }, next));
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER reject_task_audit");
  }
  assert.deepEqual(await db.task.findUniqueOrThrow({ where: { id } }), transferBefore);
  assert.deepEqual(await roles(id), raciBefore);
  assert.deepEqual(await db.taskCollaborator.findMany({ where: { taskId: id } }), transferCollaboratorsBefore);
  // Keep this fixture out of the separate period statistics scenario.
  await db.task.update({ where: { id }, data: { archivedAt: new Date() } });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

test("无期限的跨周未结束任务、本周完成任务进入周汇报及统计，上周结束任务退出", async () => {
  const { week, quarter } = await ensurePeriodTree(db, new Date("2026-10-16T04:00:00Z"));
  const createdAt = new Date(week.startAt.getTime() - 86400_000 * 10);
  const base = { ownerId: owner.id, createdAt };
  const open = await db.task.create({ data: { ...base, title: "无期限未结束", status: "BLOCKED", health: "AT_RISK" } });
  const done = await db.task.create({ data: { ...base, title: "本周完成", status: "DONE", completedAt: week.startAt } });
  const previous = await db.task.create({ data: { ...base, title: "上周完成", status: "DONE", completedAt: new Date(week.startAt.getTime() - 1) } });
  const cancelled = await db.task.create({ data: { ...base, title: "上周取消", status: "CANCELLED", completedAt: new Date(week.startAt.getTime() - 1), schedulePeriodId: week.id } });
  const future = await db.task.create({ data: { ...base, title: "周期结束才创建", createdAt: week.endAt } });
  const archived = await db.task.create({ data: { ...base, title: "已归档", archivedAt: createdAt } });
  const tasks = await tasksInPeriod(db, week, quarter.id);
  assert.deepEqual(tasks.map(t => t.id).sort(), [open.id, done.id].sort());
  for (const excluded of [previous, cancelled, future, archived]) assert.ok(!tasks.some(t => t.id === excluded.id));
  assert.equal(taskCompletionRate(tasks), 50);
  const targets = expectedTargets("WEEK", tasks, [], { kind: "WEEK", period: week.label });
  const missing = new Set(await unreportedScopeIds(db, week.id, "TASK", targets.map(t => t.scopeId)));
  assert.equal(missing.size, 2);
  assert.equal(await canAuthorCheckIn(db, owner, "TASK", open.id), true);
  assert.deepEqual([...relatedTaskIdsForUnreported("WEEK", tasks, missing)].sort(), [open.id, done.id].sort());
  assert.deepEqual(countTaskExceptions(tasks, () => "UNREPORTED"), { risk: 1, overdue: 0, pending: 1, unreported: 2 });
});

test("原有排期、期限和季度关联仍取并集，取消时间为空时保留显式排期", async () => {
  const { week, month, quarter } = await ensurePeriodTree(db, new Date("2028-05-17T04:00:00Z"));
  const previous = new Date(week.startAt.getTime() - 86400_000 * 10);
  const base = { ownerId: owner.id, createdAt: previous, completedAt: previous, status: "DONE" as const };
  const scheduled = await db.task.create({ data: { ...base, title: "显式排期", schedulePeriodId: week.id } });
  const due = await db.task.create({ data: { ...base, title: "显式期限", dueAt: week.startAt } });
  const nullCancelled = await db.task.create({ data: { ...base, title: "取消但无结束时间", status: "CANCELLED", completedAt: null, schedulePeriodId: week.id } });
  const objective = await db.objective.create({ data: { ownerId: owner.id, title: "季度目标", cycle: quarter.label, periodId: quarter.id } });
  const kr = await db.keyResult.create({ data: { objectiveId: objective.id, title: "指标", targetValue: 100 } });
  const linked = await db.task.create({ data: { ...base, title: "关联季度", keyResultId: kr.id } });
  const weekly = await tasksInPeriod(db, week, quarter.id);
  for (const row of [scheduled, due, nullCancelled]) assert.ok(weekly.some(t => t.id === row.id));
  assert.ok(!weekly.some(t => t.id === linked.id));
  const monthly = await tasksInPeriod(db, month, quarter.id);
  assert.ok(monthly.some(t => t.id === linked.id));
});
