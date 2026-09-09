import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { ensureTaskRaciDefaults } from "../lib/raci";
import { ensurePeriodTree } from "../lib/period";
import {
  canAuthorCheckIn,
  CHECKIN_UNREPORTED,
  checkInReportState,
  checkInStateForScope,
  CheckInError,
  submitCheckIn,
  unreportedScopeIds,
} from "../lib/check-in";
import { dateForPeriodLabel, hrefWithOverview, parseOverviewSearch, tasksInPeriod } from "../lib/overview";
import { isoWeekLabel, weekBounds } from "../lib/week";

const folder = mkdtempSync(join(tmpdir(), "okr-checkin-tests-"));
const file = join(folder, "test.db");
const db = new PrismaClient({ datasourceUrl: `file:${file}` });
const actors = {
  owner: { id: "owner", name: "业务负责人", role: "MANAGER" as const },
  collaborator: { id: "collaborator", name: "库存负责人", role: "MANAGER" as const },
  other: { id: "other", name: "团队负责人", role: "MANAGER" as const },
  boss: { id: "boss", name: "老板", role: "BOSS" as const },
};

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
      { id: "boss", name: "老板", email: "boss@test.local", passwordHash: "unused", role: "BOSS" },
    ],
  });
});
after(async () => {
  await db.$disconnect();
  rmSync(folder, { recursive: true, force: true });
});

test("老板不能提交 Check-in，伪造角色也无效", async () => {
  const { week } = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const task = await db.task.create({ data: { title: "老板不可写", ownerId: "owner" } });
  await ensureTaskRaciDefaults(db, { id: task.id, ownerId: "owner" });
  const before = await db.checkIn.count();
  await assert.rejects(submitCheckIn(db, actors.boss, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "SUBMITTED", body: "不该写入",
  }), CheckInError);
  await assert.rejects(submitCheckIn(db, { ...actors.boss, role: "MANAGER" }, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "NO_CHANGE", body: "伪造角色",
  }), /仅可查看/);
  assert.equal(await db.checkIn.count(), before);
});

test("NO_CHANGE 与 SUBMITTED 可区分，缺行仍是未汇报", async () => {
  const { week } = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const task = await db.task.create({ data: { title: "待汇报", ownerId: "owner" } });
  await ensureTaskRaciDefaults(db, { id: task.id, ownerId: "owner" });
  assert.equal(await checkInStateForScope(db, week.id, "TASK", task.id), CHECKIN_UNREPORTED);
  assert.equal(checkInReportState(null), "UNREPORTED");
  await assert.rejects(submitCheckIn(db, actors.owner, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "SUBMITTED", body: "   ",
  }), /进展事实/);
  assert.equal(await db.checkIn.count({ where: { scopeId: task.id } }), 0);

  await submitCheckIn(db, actors.owner, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "NO_CHANGE", body: "",
  });
  assert.equal(await checkInStateForScope(db, week.id, "TASK", task.id), "NO_CHANGE");
  const noChange = await db.checkIn.findFirstOrThrow({ where: { scopeId: task.id }, orderBy: { createdAt: "desc" } });
  assert.equal(noChange.body, "确认暂无变化");
  assert.notEqual(noChange.status, "UNREPORTED");

  await submitCheckIn(db, actors.owner, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "SUBMITTED", body: "主图测试已收集一周数据。", nextStep: "确定采用方案",
  });
  assert.equal(await checkInStateForScope(db, week.id, "TASK", task.id), "SUBMITTED");
  assert.equal(await db.checkIn.count({ where: { scopeId: task.id, periodId: week.id } }), 2);
});

test("只有主责或 RACI R/A 可写，协作者 C 不能代交", async () => {
  const { week } = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const task = await db.task.create({
    data: {
      title: "协作事项",
      ownerId: "owner",
      collaborators: { create: { userId: "collaborator", deliverable: "提供预测", active: true } },
    },
    include: { collaborators: true },
  });
  await ensureTaskRaciDefaults(db, task);
  assert.equal(await canAuthorCheckIn(db, actors.owner, "TASK", task.id), true);
  assert.equal(await canAuthorCheckIn(db, actors.collaborator, "TASK", task.id), false);
  assert.equal(await canAuthorCheckIn(db, actors.other, "TASK", task.id), false);
  assert.equal(await canAuthorCheckIn(db, actors.boss, "TASK", task.id), false);
  await assert.rejects(submitCheckIn(db, actors.collaborator, {
    periodId: week.id, scopeType: "TASK", scopeId: task.id, status: "SUBMITTED", body: "协作者越权",
  }), /RACI/);
});

test("未汇报检测不写入空行，并可按周期列出缺口", async () => {
  const { week } = await ensurePeriodTree(db, new Date("2026-09-09T04:00:00.000Z"));
  const reported = await db.task.create({ data: { title: "已汇报", ownerId: "owner", schedulePeriodId: week.id } });
  const silent = await db.task.create({ data: { title: "未汇报", ownerId: "owner", schedulePeriodId: week.id } });
  await ensureTaskRaciDefaults(db, { id: reported.id, ownerId: "owner" });
  await ensureTaskRaciDefaults(db, { id: silent.id, ownerId: "owner" });
  await submitCheckIn(db, actors.owner, {
    periodId: week.id, scopeType: "TASK", scopeId: reported.id, status: "SUBMITTED", body: "进展已写。",
  });
  const missing = await unreportedScopeIds(db, week.id, "TASK", [reported.id, silent.id]);
  assert.deepEqual(missing, [silent.id]);
  assert.equal(await db.checkIn.count({ where: { scopeId: silent.id } }), 0);
});

test("目标负责人可写 KR / Objective 汇报，任务完成率查询不串周", async () => {
  const date = new Date("2026-09-09T04:00:00.000Z");
  const current = await ensurePeriodTree(db, date);
  const next = await ensurePeriodTree(db, new Date("2026-09-16T04:00:00.000Z"));
  const objective = await db.objective.create({
    data: { title: "效率目标", cycle: current.quarter.label, periodId: current.quarter.id, ownerId: "owner" },
  });
  const keyResult = await db.keyResult.create({ data: { title: "ACOS", targetValue: 25, baselineValue: 35, currentValue: 30, direction: "DECREASE", objectiveId: objective.id } });
  const thisWeek = await db.task.create({ data: { title: "本周事项", ownerId: "owner", schedulePeriodId: current.week.id, keyResultId: keyResult.id } });
  await db.task.create({ data: { title: "下周事项", ownerId: "other", schedulePeriodId: next.week.id, keyResultId: keyResult.id } });
  assert.equal(await canAuthorCheckIn(db, actors.owner, "KEY_RESULT", keyResult.id), true);
  assert.equal(await canAuthorCheckIn(db, actors.owner, "OBJECTIVE", objective.id), true);
  assert.equal(await canAuthorCheckIn(db, actors.other, "OBJECTIVE", objective.id), false);
  assert.equal(await canAuthorCheckIn(db, actors.other, "KEY_RESULT", keyResult.id), true);
  await submitCheckIn(db, actors.owner, {
    periodId: current.week.id, scopeType: "KEY_RESULT", scopeId: keyResult.id, status: "SUBMITTED", body: "广告成本按计划下降。", metricNote: "当前 30%",
  });
  const weekTasks = await tasksInPeriod(db, current.week, current.quarter.id);
  assert.equal(weekTasks.some(task => task.id === thisWeek.id), true);
  assert.equal(weekTasks.some(task => task.title === "下周事项"), false);
});

test("周期标签解析与下钻 URL 保留筛选", () => {
  const date = dateForPeriodLabel("WEEK", "2026-W37");
  assert.equal(isoWeekLabel(weekBounds(date).startAt), "2026-W37");
  assert.equal(dateForPeriodLabel("MONTH", "2026-09").toISOString().slice(0, 7), "2026-09");
  const search = parseOverviewSearch({ kind: "MONTH", period: "2026-09", exception: "unreported", person: "owner" });
  assert.equal(search.kind, "MONTH");
  assert.equal(search.exception, "unreported");
  assert.equal(hrefWithOverview("/tasks", search), "/tasks?kind=MONTH&period=2026-09&exception=unreported&person=owner");
  assert.equal(parseOverviewSearch({ exception: "nope" }).exception, undefined);
});
