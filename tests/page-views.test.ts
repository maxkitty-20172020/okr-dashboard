import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient, type PeriodKind } from "@prisma/client";
import { canAuthorCheckIn, scopeKey } from "../lib/check-in";
import { loadCheckInAuthorizer, type CheckInTarget } from "../lib/check-in-permissions";
import { loadDashboard } from "../lib/dashboard-view";
import { loadObjectiveDetail } from "../lib/objective-detail-view";
import { keyResultAchievementRate, progressPercent, statusLabel } from "../lib/okr";
import { loadOverview } from "../lib/overview-service";
import { exceptionLabels, type OverviewSearch } from "../lib/overview";
import { loadTaskDetail, parseHistorySnapshot } from "../lib/task-detail-view";
import { loadTaskList, type TaskListParams } from "../lib/tasks-view";
import { today, type Member } from "../lib/tasks";
import { ensurePeriodTree } from "../lib/period";
import {
  legacyDashboard, legacyObjectiveDetail, legacyOverview, legacyTaskDetail, legacyTaskList,
} from "./fixtures/legacy-page-views";

const folder = mkdtempSync(join(tmpdir(), "okr-page-views-"));
const databaseUrl = `file:${join(folder, "views.db")}`;
const db = new PrismaClient({ datasourceUrl: databaseUrl, log: [{ emit: "event", level: "query" }] });
let selects = 0;
db.$on("query", event => { if (/^SELECT\b/i.test(event.query)) selects++; });
let boss: Member;
let member: Member;
let other: Member;
let periods: Record<PeriodKind, string>;

before(async () => {
  const options = { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" as const };
  execFileSync("npx", ["prisma", "migrate", "deploy"], options);
  // Execute the real seed, with an explicit disposable database URL.
  execFileSync("npx", ["tsx", "prisma/seed.ts"], options);
  boss = (await db.user.findUniqueOrThrow({ where: { email: "okr@okr.local" } }));
  member = (await db.user.findUniqueOrThrow({ where: { email: "okr1@okr.local" } }));
  other = (await db.user.findUniqueOrThrow({ where: { email: "okr2@okr.local" } }));
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const tree = await ensurePeriodTree(db);
  periods = { WEEK: tree.week.label, MONTH: tree.month.label, QUARTER: tree.quarter.label };
});

after(async () => {
  mock.timers.reset();
  await db.$disconnect();
  rmSync(folder, { recursive: true, force: true });
});

/** Compare every legacy model field, including full nested rows, order, maps and URLs. */
function sameLegacyFields(actual: object, expected: object, label: string) {
  for (const key of Object.keys(expected)) {
    assert.deepEqual(Reflect.get(actual, key), Reflect.get(expected, key), `${label}: ${key}`);
  }
}

const kinds: PeriodKind[] = ["WEEK", "MONTH", "QUARTER"];
const exceptions = [undefined, ...Object.keys(exceptionLabels)] as OverviewSearch["exception"][];

test("真实 seed：老板 / okr1 × 周月季 × 四异常及无异常，完整视图与原页面一致", async () => {
  let comparisons = 0;
  for (const actor of [boss, member]) {
    for (const kind of kinds) {
      for (const exception of exceptions) {
        const params = { kind, period: periods[kind], exception };
        const legacy = await legacyOverview(db, actor, params);
        const actual = await loadOverview(db, actor, params);
        sameLegacyFields(actual, legacy, `overview ${actor.role} ${kind} ${exception}`);
        sameLegacyFields(await loadTaskList(db, actor, params), await legacyTaskList(db, actor, params), "tasks seed");
        for (const objective of actual.objectives) {
          assert.deepEqual(actual.objectiveViews.get(objective.id), {
            rate: keyResultAchievementRate(objective.keyResults),
            related: actual.tasks.filter(task => task.keyResult?.objectiveId === objective.id),
            objectiveState: actual.checkIns.get(scopeKey("OBJECTIVE", objective.id))?.status ?? "UNREPORTED",
          });
          for (const kr of objective.keyResults) {
            assert.equal(actual.keyResultStates.get(kr.id), actual.checkIns.get(scopeKey("KEY_RESULT", kr.id))?.status ?? "UNREPORTED");
          }
        }
        assert.equal(actual.activeTaskCount, actual.tasks.filter(t => t.status !== "DONE" && t.status !== "CANCELLED").length);
        assert.equal(actual.achievement, 50);
        assert.equal(actual.completion, 0);
        assert.equal(actual.boss, actor.role === "BOSS");
        if (actor.role === "BOSS") assert.equal(actual.myUnreported.length, 0);
        comparisons += 2;
      }
    }
  }
  console.log(`SEED_PARITY: ${comparisons} full view comparisons passed (30 overview + 30 tasks)`);
  for (const actor of [boss, member]) {
    selects = 0;
    await legacyOverview(db, actor, { kind: "WEEK", period: periods.WEEK });
    const before = selects;
    selects = 0;
    await loadOverview(db, actor, { kind: "WEEK", period: periods.WEEK });
    console.log(`SEED_OVERVIEW_SELECTS ${actor.role}: ${before} -> ${selects}`);
  }
});

test("补充非空筛选数据：完成、取消、归档、逾期、未确认、历史完成时间边界", async () => {
  const { week, quarter } = await ensurePeriodTree(db);
  const day = today();
  const earlier = new Date(day.getTime() - 10 * 86400_000);
  const monday = new Date(day);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const start = new Date(monday.getTime() - 8 * 3600_000);
  const data = [
    { id: "view-overdue", title: "检索范围 QUERY", dueAt: earlier, priority: 2 },
    { id: "view-pending", title: "情况未确认", nextFollowUpAt: null },
    { id: "view-confirmed", title: "确认无变化", lastConfirmedAt: day, nextFollowUpAt: new Date(day.getTime() + 86400_000) },
    { id: "view-done", title: "本周完成", status: "DONE" as const, completedAt: start },
    { id: "view-old-done", title: "上周完成", status: "DONE" as const, completedAt: new Date(start.getTime() - 1) },
    { id: "view-cancelled", title: "本周取消", status: "CANCELLED" as const, completedAt: day },
    { id: "view-archived", title: "归档完成", status: "DONE" as const, completedAt: start, archivedAt: day },
  ];
  for (const row of data) {
    await db.task.create({ data: { ownerId: member.id, createdAt: earlier, schedulePeriodId: week.id, area: "OTHER", ...row } });
  }
  await db.taskCollaborator.create({
    data: { taskId: "view-overdue", userId: other.id, deliverable: "inactive", active: false },
  });
  await db.checkIn.create({
    data: {
      periodId: week.id, scopeType: "TASK", scopeId: "view-confirmed", authorId: member.id,
      status: "NO_CHANGE", body: "确认暂无变化",
    }
  });
  const objective = await db.objective.create({
    data: {
      id: "view-objective", ownerId: other.id, title: "权限目标", cycle: quarter.label, periodId: quarter.id,
    }
  });
  for (const id of ["task-owned", "task-ra", "wp-ra", "collaborator-only"]) {
    await db.keyResult.create({ data: { id, objectiveId: objective.id, title: id, targetValue: 100 } });
  }
  for (const [id, ownerId] of [["task-owned", member.id], ["task-ra", other.id], ["collaborator-only", other.id]]) {
    await db.task.create({
      data: {
        id: `permission-${id}`, ownerId, keyResultId: id, title: id,
        // Archived, completed and outside period, still relevant to authorization.
        status: "DONE", completedAt: earlier, archivedAt: day, createdAt: earlier,
      }
    });
  }
  await db.taskCollaborator.create({
    data: {
      taskId: "permission-collaborator-only", userId: member.id, deliverable: "only C",
    }
  });
  // R/A grants write authority only after visibility; creation keeps this parity fixture visible.
  await db.taskUpdate.create({ data: { taskId: "permission-task-ra", authorId: member.id, kind: "CREATED", body: "创建权限测试事项", snapshot: "{}" } });
  await db.workPackage.create({ data: { id: "permission-wp", title: "WP", keyResultId: "wp-ra" } });
  await db.raciAssignment.createMany({
    data: [
      { subjectType: "TASK", subjectId: "permission-task-ra", userId: member.id, role: "R" },
      { subjectType: "TASK", subjectId: "permission-collaborator-only", userId: member.id, role: "C" },
      { subjectType: "WORK_PACKAGE", subjectId: "permission-wp", userId: member.id, role: "A" },
      { subjectType: "TASK", subjectId: "view-pending", userId: other.id, role: "I" },
      // Dangling polymorphic RACI must not grant nonexistent subjects.
      { subjectType: "TASK", subjectId: "does-not-exist", userId: member.id, role: "R" },
    ]
  });
  for (const scopeType of ["KEY_RESULT", "OBJECTIVE"] as const) {
    await db.checkIn.create({
      data: {
        periodId: week.id, scopeType, scopeId: scopeType === "OBJECTIVE" ? objective.id : "wp-ra",
        authorId: other.id, status: "NO_CHANGE", body: "周范围跨层汇报",
      }
    });
  }
  assert.ok((await loadTaskList(db, member, { filter: "done" })).tasks.some(t => t.id === "view-done"));
  assert.ok(!(await loadTaskList(db, member, { filter: "done" })).tasks.some(t => t.id === "view-old-done"));
  assert.ok((await loadTaskList(db, member, { filter: "archived" })).tasks.some(t => t.id === "view-archived"));
  assert.ok((await loadTaskList(db, member, { exception: "overdue", period: periods.WEEK })).tasks.some(t => t.id === "view-overdue"));
  assert.ok(!(await loadTaskList(db, member, { person: other.id })).tasks.some(t => t.id === "view-overdue"));
});

test("总览 person 筛选与四异常在非空边界数据上保持原有统计口径", async () => {
  let comparisons = 0;
  for (const actor of [boss, member]) for (const kind of kinds) {
    for (const exception of exceptions) for (const person of [undefined, member.id, other.id, "missing"]) {
      const params = { kind, period: periods[kind], exception, person };
      const actual = await loadOverview(db, actor, params);
      sameLegacyFields(actual, await legacyOverview(db, actor, params), "overview extended");
      if (person) assert.ok(actual.visibleTasks.every(t => t.ownerId === person || t.collaborators.some(c => c.userId === person)));
      comparisons++;
    }
  }
  console.log(`EXTENDED_OVERVIEW_PARITY: ${comparisons} full comparisons passed`);
});

test("任务所有 filter / 异常优先级、q、person、area、relation 及周期下钻保持一致", async () => {
  const filters = [undefined, "attention", "followup", "done", "closed", "archived", "unknown"];
  const variations: TaskListParams[] = [
    {}, { person: member.id }, { person: other.id }, { person: "missing" },
    { q: "query" }, { q: "李明" }, { q: " QUERY " }, { q: "  " },
    { person: ` ${member.id} ` }, { area: "OTHER" }, { area: "INVENTORY" },
    { relation: "owned" }, { relation: "collaborating" },
    { q: "确认", person: member.id, area: "OTHER", relation: "owned" },
  ];
  const periodCases: TaskListParams[] = [
    {}, { exception: "invalid" }, { exception: "toString" }, { exception: "constructor" }, { kind: "invalid", period: "invalid" },
    ...kinds.flatMap(kind => exceptions.map(exception => ({ kind, period: periods[kind], exception }))),
  ];
  let comparisons = 0;
  for (const actor of [boss, member]) for (const period of periodCases) {
    for (const filter of filters) for (const variation of variations) {
      const params = { ...period, filter, ...variation };
      sameLegacyFields(await loadTaskList(db, actor, params), await legacyTaskList(db, actor, params), JSON.stringify(params));
      comparisons++;
    }
  }
  console.log(`EXTENDED_TASKS_PARITY: ${comparisons} full comparisons passed`);
});

test("批量权限与 canAuthorCheckIn 逐项一致，包括 R/A、C/I、无效对象及跨周期归属", async () => {
  const targets: CheckInTarget[] = [
    ...(await db.task.findMany()).map(t => ({ scopeType: "TASK" as const, scopeId: t.id })),
    ...(await db.keyResult.findMany()).map(kr => ({ scopeType: "KEY_RESULT" as const, scopeId: kr.id })),
    ...(await db.objective.findMany()).map(o => ({ scopeType: "OBJECTIVE" as const, scopeId: o.id })),
    ...(["TASK", "KEY_RESULT", "OBJECTIVE", "DEPT"] as const).map(scopeType => ({ scopeType, scopeId: "does-not-exist" })),
  ];
  for (const actor of [boss, member, other]) {
    const canAuthor = await loadCheckInAuthorizer(db, actor, targets);
    for (const target of targets) {
      assert.equal(canAuthor(target.scopeType, target.scopeId),
        await canAuthorCheckIn(db, actor, target.scopeType, target.scopeId), `${actor.id} ${JSON.stringify(target)}`);
    }
    assert.equal(canAuthor("TASK", null), false);
    assert.equal(canAuthor("KEY_RESULT", ""), false);
  }
  const canAuthor = await loadCheckInAuthorizer(db, member, targets);
  for (const id of ["task-owned", "task-ra", "wp-ra"]) assert.equal(canAuthor("KEY_RESULT", id), true);
  assert.equal(canAuthor("KEY_RESULT", "collaborator-only"), false);
  assert.equal(canAuthor("OBJECTIVE", "view-objective"), true);
  // Remove WP authority: owning a linked task / TASK R/A alone does not authorize its objective.
  await db.raciAssignment.deleteMany({ where: { subjectId: "permission-wp", userId: member.id } });
  const withoutWP = await loadCheckInAuthorizer(db, member, targets);
  assert.equal(withoutWP("OBJECTIVE", "view-objective"), false);
  assert.equal(withoutWP("KEY_RESULT", "task-owned"), true);
  assert.equal(withoutWP("KEY_RESULT", "task-ra"), true);
});

test("N+1 查询次数随任务数增长被消除（真实 Prisma SELECT 事件）", async () => {
  const scopes: CheckInTarget[] = [];
  for (let index = 0; index < 40; index++) {
    const task = await db.task.create({ data: { title: `scale ${index}`, ownerId: other.id } });
    // Visible non-owner keeps exercising both ownership and RACI queries.
    await db.taskUpdate.create({ data: { taskId: task.id, authorId: member.id, kind: "CREATED", body: "性能测试创建", snapshot: "{}" } });
    scopes.push({ scopeType: "TASK", scopeId: task.id });
  }
  const counts: { size: number; before: number; after: number }[] = [];
  for (const size of [1, 40]) {
    selects = 0;
    await Promise.all(scopes.slice(0, size).map(t => canAuthorCheckIn(db, member, t.scopeType, t.scopeId)));
    const before = selects;
    selects = 0;
    await loadCheckInAuthorizer(db, member, scopes.slice(0, size));
    counts.push({ size, before, after: selects });
  }
  assert.equal(counts[0].before, 2);
  assert.equal(counts[0].after, 2);
  // Prisma batches concurrent findUnique calls; findFirst RACI lookups still grow per task.
  assert.ok(counts[1].before >= 40);
  assert.equal(counts[1].after, 2);
  console.log(`AUTHORIZATION_SELECTS: ${JSON.stringify(counts)}`);
  selects = 0;
  await loadCheckInAuthorizer(db, boss, scopes);
  assert.equal(selects, 0);
  selects = 0;
  await legacyOverview(db, member, { kind: "WEEK", period: periods.WEEK });
  const before = selects;
  selects = 0;
  await loadOverview(db, member, { kind: "WEEK", period: periods.WEEK });
  assert.ok(selects < before);
  console.log(`SCALED_OVERVIEW_SELECTS MANAGER: ${before} -> ${selects}`);
});

test("首页及详情页模型、状态 fallback、快照解析保持一致", async () => {
  for (const actor of [boss, member]) {
    sameLegacyFields(await loadDashboard(db, actor), await legacyDashboard(db, actor), "dashboard");
    for (const kind of kinds) {
      const params = { kind, period: periods[kind], exception: "unreported", person: member.id };
      for (const id of ["view-overdue", "view-done", "view-archived"]) {
        const actual = await loadTaskDetail(db, actor, id, params);
        assert.ok(actual);
        sameLegacyFields(actual, (await legacyTaskDetail(db, actor, id, params))!, "task detail");
        assert.equal(actual.deliveredCount, actual.task.collaborators.filter(c => c.done).length);
        assert.equal(actual.completedMilestoneCount, actual.task.milestones.filter(m => m.done).length);
        assert.deepEqual(actual.activeDeliverables, actual.task.deliverables.filter(d => d.active));
      }
      for (const objective of await db.objective.findMany()) {
        const actual = await loadObjectiveDetail(db, actor, objective.id, params);
        assert.ok(actual);
        sameLegacyFields(actual, (await legacyObjectiveDetail(db, actor, objective.id, params))!, "objective detail");
        for (const kr of actual.objective.keyResults) {
          assert.deepEqual(actual.keyResultViews.get(kr.id), {
            state: actual.checkIns.find(
              c => c.periodId === actual.tree.selected.id && c.scopeType === "KEY_RESULT" && c.scopeId === kr.id
            )?.status ?? "UNREPORTED",
            related: actual.tasks.filter(t => t.keyResultId === kr.id),
            progress: progressPercent(kr.currentValue, kr.targetValue, kr.baselineValue, kr.direction),
          });
        }
      }
    }
    assert.equal(await loadTaskDetail(db, actor, "missing", {}), null);
    assert.equal(await loadObjectiveDetail(db, actor, "missing", {}), null);
  }
  assert.equal(statusLabel("DONE"), "已完成");
  assert.equal(statusLabel("IN_PROGRESS"), "进行中");
  for (const status of ["TODO", "WAITING", "BLOCKED", "CANCELLED", "unknown"]) assert.equal(statusLabel(status), "未开始");
  assert.deepEqual(parseHistorySnapshot('{"ownerName":"李明"}'), { ownerName: "李明" });
  assert.equal(parseHistorySnapshot("invalid"), null);
  assert.equal(parseHistorySnapshot("null"), null);
});
