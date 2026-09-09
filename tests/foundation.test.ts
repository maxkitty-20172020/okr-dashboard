import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient, RaciRole, RaciSubjectType } from "@prisma/client";
import { isoWeekLabel, monthBounds, quarterBounds, startOfBusinessWeek, weekBounds } from "../lib/week";
import { backfillObjectivePeriods, effectiveKeyResultPeriodId, ensurePeriodTree, rescheduleTask } from "../lib/period";
import { assignRaci, backfillTaskRaci, ensureTaskRaciDefaults, listSubjectRaci, RaciError } from "../lib/raci";
import { CHECKIN_UNREPORTED, checkInReportState, checkInStateForScope, checkInStateLabels } from "../lib/check-in";
import { keyResultAchievementRate, progressPercent, routineTasks, taskCompletionRate, tasksLinkedToKeyResult } from "../lib/okr";
import { backfillDeliverablesFromCollaborators } from "../lib/wbs";

const folder = mkdtempSync(join(tmpdir(), "okr-foundation-tests-"));
const file = join(folder, "test.db");
const db = new PrismaClient({ datasourceUrl: `file:${file}` });

before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${file}` },
    stdio: "pipe",
  });
  await db.user.createMany({
    data: [
      { id: "owner", name: "业务负责人", email: "owner@test.local", passwordHash: "unused", role: "MANAGER" },
      { id: "collaborator", name: "库存负责人", email: "collaborator@test.local", passwordHash: "unused", role: "MANAGER" },
      { id: "other", name: "团队负责人", email: "other@test.local", passwordHash: "unused", role: "MANAGER" },
    ],
  });
});
after(async () => {
  await db.$disconnect();
  rmSync(folder, { recursive: true, force: true });
});

test("ISO 周标签与现有周一起点一致，季度月份标签为 2026-Q3 / 2026-09", () => {
  const date = new Date("2026-09-09T04:00:00.000Z");
  const week = weekBounds(date);
  assert.equal(week.label, "2026-W37");
  assert.equal(isoWeekLabel(startOfBusinessWeek(date)), "2026-W37");
  assert.equal(toTime(week.startAt), toTime(new Date("2026-09-07T00:00:00.000Z")));
  assert.equal(monthBounds(date).label, "2026-09");
  assert.equal(quarterBounds(date).label, "2026-Q3");
  assert.equal(weekBounds(new Date("2026-09-02T00:00:00.000Z")).label, "2026-W36");
});

test("ensurePeriodTree 建立 Week→Month→Quarter，且幂等", async () => {
  const date = new Date("2026-09-09T04:00:00.000Z");
  const first = await ensurePeriodTree(db, date);
  const second = await ensurePeriodTree(db, date);
  assert.equal(first.quarter.label, "2026-Q3");
  assert.equal(first.month.label, "2026-09");
  assert.equal(first.week.label, "2026-W37");
  assert.equal(first.month.parentId, first.quarter.id);
  assert.equal(first.week.parentId, first.month.id);
  assert.equal(second.week.id, first.week.id);
  assert.equal(await db.period.count({ where: { kind: "WEEK", label: "2026-W37" } }), 1);
});

test("跨月周的父节点是周一起点所在月，不删除任务", async () => {
  const spanning = await ensurePeriodTree(db, new Date("2026-09-02T00:00:00.000Z"));
  const weekMonth = await db.period.findUniqueOrThrow({ where: { id: spanning.week.parentId! } });
  assert.equal(spanning.week.label, "2026-W36");
  assert.equal(weekMonth.label, "2026-08");
  assert.equal(spanning.month.label, "2026-09");
});

test("Objective.periodId 从 cycle 回填，无法解析时用当前季度", async () => {
  const dated = await db.objective.create({ data: { title: "有周期目标", cycle: "2026-Q3", ownerId: "owner" } });
  const fallback = await db.objective.create({ data: { title: "无格式目标", cycle: "legacy-cycle", ownerId: "owner" } });
  assert.equal(dated.periodId, null);
  await backfillObjectivePeriods(db);
  const filled = await db.objective.findUniqueOrThrow({ where: { id: dated.id }, include: { period: true } });
  const other = await db.objective.findUniqueOrThrow({ where: { id: fallback.id }, include: { period: true } });
  assert.equal(filled.period?.kind, "QUARTER");
  assert.equal(filled.period?.label, "2026-Q3");
  assert.equal(filled.cycle, "2026-Q3");
  assert.ok(other.periodId);
  assert.equal(other.cycle, "legacy-cycle");
  const kr = await db.keyResult.create({
    data: { title: "指标", targetValue: 10, objectiveId: filled.id },
    include: { objective: true },
  });
  assert.equal(effectiveKeyResultPeriodId(kr), filled.periodId);
});

test("RACI 默认 owner=R+A，协作者为 C，且同一对象最多一名 A/R", async () => {
  const task = await db.task.create({
    data: {
      title: "协作事项",
      ownerId: "owner",
      collaborators: { create: [{ userId: "collaborator", deliverable: "提供销售预测", active: true }, { userId: "other", deliverable: "已退出", active: false }] },
    },
    include: { collaborators: true },
  });
  await ensureTaskRaciDefaults(db, task);
  await backfillTaskRaci(db);
  const rows = await listSubjectRaci(db, RaciSubjectType.TASK, task.id);
  assert.deepEqual(rows.map(row => `${row.role}:${row.userId}`).sort(), ["A:owner", "C:collaborator", "R:owner"]);
  await assert.rejects(assignRaci(db, {
    subjectType: RaciSubjectType.TASK,
    subjectId: task.id,
    role: RaciRole.A,
    userId: "other",
  }), RaciError);
  await backfillDeliverablesFromCollaborators(db);
  const deliverables = await db.deliverable.findMany({ where: { taskId: task.id }, orderBy: { title: "asc" } });
  assert.equal(deliverables.length, 2);
  assert.equal(deliverables[0].title, "已退出");
  assert.equal(deliverables[0].active, false);
  assert.equal(deliverables[1].title, "提供销售预测");
  assert.equal(deliverables[1].ownerUserId, "collaborator");
});

test("Check-in 无行即为未汇报", async () => {
  const { week } = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const task = await db.task.create({ data: { title: "待汇报事项", ownerId: "owner" } });
  assert.equal(checkInReportState(null), CHECKIN_UNREPORTED);
  assert.equal(checkInStateLabels.UNREPORTED, "未汇报");
  assert.equal(await checkInStateForScope(db, week.id, "TASK", task.id), "UNREPORTED");
  await db.checkIn.create({
    data: { periodId: week.id, scopeType: "TASK", scopeId: task.id, authorId: "owner", status: "NO_CHANGE", body: "确认暂无变化" },
  });
  assert.equal(await checkInStateForScope(db, week.id, "TASK", task.id), "NO_CHANGE");
  assert.equal(await checkInStateForScope(db, week.id, "DEPT", null), "UNREPORTED");
});

test("任务完成率与 KR 达成率分开，例行任务只计入完成率", () => {
  const tasks = [
    { status: "DONE", archivedAt: null, keyResultId: "kr1" },
    { status: "TODO", archivedAt: null, keyResultId: null },
    { status: "DONE", archivedAt: null, keyResultId: null },
    { status: "CANCELLED", archivedAt: null, keyResultId: "kr1" },
    { status: "DONE", archivedAt: new Date(), keyResultId: "kr1" },
  ];
  assert.equal(taskCompletionRate(tasks), (2 / 3) * 100);
  assert.equal(routineTasks(tasks).length, 2);
  assert.equal(tasksLinkedToKeyResult(tasks).length, 3);
  const keyResults = [
    { currentValue: 30, targetValue: 25, baselineValue: 35, direction: "DECREASE" },
    { currentValue: 50, targetValue: 100, baselineValue: 0, direction: "INCREASE" },
  ];
  assert.equal(progressPercent(30, 25, 35, "DECREASE"), 50);
  assert.equal(keyResultAchievementRate(keyResults), 50);
});

test("更改 schedulePeriodId 不会删除或归档跨周期任务", async () => {
  const firstWeek = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const nextWeek = await ensurePeriodTree(db, new Date("2026-09-16T04:00:00.000Z"));
  const task = await db.task.create({
    data: { title: "跨周保留事项", ownerId: "owner", status: "IN_PROGRESS", schedulePeriodId: firstWeek.week.id },
  });
  const before = await db.task.count();
  const moved = await rescheduleTask(db, task.id, nextWeek.week.id, new Date("2026-09-20T00:00:00.000Z"));
  assert.equal(moved.id, task.id);
  assert.equal(moved.schedulePeriodId, nextWeek.week.id);
  assert.equal(moved.archivedAt, null);
  assert.equal(moved.status, "IN_PROGRESS");
  assert.equal(await db.task.count({ where: { id: task.id } }), 1);
  assert.equal(await db.task.count(), before);
  assert.ok(await db.period.findUnique({ where: { id: firstWeek.week.id } }));
});

function toTime(date: Date) {
  return date.getTime();
}
