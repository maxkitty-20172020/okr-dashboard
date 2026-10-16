import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardDate, dashboardHeadline, dashboardLanes, dashboardWeekProgress } from "../lib/dashboard-view";
import type { Member, TaskRow } from "../lib/tasks";
import type { loadPeriodView } from "../lib/period-view";
const now = new Date("2026-10-16T02:00:00Z");
const day = new Date("2026-10-16T00:00:00Z");
const later = new Date("2026-10-20T00:00:00Z");
const me = { id: "me", name: "李明", role: "MANAGER" } as const satisfies Member;
const boss = { id: "boss", name: "陈总", role: "BOSS" } as const satisfies Member;
function task(id: string, patch: Partial<TaskRow> = {}): TaskRow {
  return { id, title: id, ownerId: "me", owner: me, area: "OTHER", kind: "LONG_TERM", scope: "", completionCriteria: "", latestProgress: "", nextAction: "推进", riskNote: "", priority: 1, keyResultId: null, keyResult: null, nextFollowUpAt: later, dueAt: null, status: "IN_PROGRESS", health: "ON_TRACK", createdAt: day, updatedAt: day, completedAt: null, archivedAt: null, lastConfirmedAt: null, schedulePeriodId: null, legacyWeekStart: null, version: 1, collaborators: [], milestones: [], ...patch };
}
function delivery(id: string, dueAt: Date | null = null, done = false) {
  return task(id, { ownerId: "other", owner: { id: "other", name: "王芳", role: "MANAGER" }, collaborators: [{ id: `c-${id}`, taskId: id, userId: "me", user: me, deliverable: `交付${id}`, dueAt, done, note: "", active: true, updatedAt: day }] });
}
test("§4.1 成员：今天跟进计入今天、已过、未设置，不含未来及结束/归档", () => {
  const rows = [task("today", { nextFollowUpAt: day }), task("late", { nextFollowUpAt: new Date("2026-10-15") }), task("missing", { nextFollowUpAt: null }), task("future"), task("done", { status: "DONE" }), task("cancel", { status: "CANCELLED" }), task("archive", { archivedAt: day })];
  assert.equal(dashboardHeadline(rows, me, now).text, "今天有 3 件事要跟进。");
});
test("§4.1 成员：有跟进及交付，取协作最早期限，额外显示余项", () => {
  const rows = [task("follow", { nextFollowUpAt: day }), delivery("无期限"), delivery("较晚", later), delivery("最早", day)];
  assert.equal(dashboardHeadline(rows, me, now).text, "今天有 1 件事要跟进。王芳 在等你的「交付最早」，还有 2 项等你交付。");
  assert.equal(dashboardHeadline([rows[0], rows[3]], me, now).text, "今天有 1 件事要跟进。王芳 在等你的「交付最早」。");
});
test("§4.1 成员：无跟进但有交付，以及两者都无", () => {
  assert.equal(dashboardHeadline([delivery("预测")], me, now).text, "今天没有到期的跟进，王芳 在等你的「交付预测」。");
  assert.deepEqual(dashboardHeadline([task("future"), delivery("done", day, true)], me, now), { text: "今天没有要跟进的事。", supplement: "可以推进还没定期限的事项。" });
  assert.equal(dashboardHeadline([delivery("closed", day, false) ].map(t => ({ ...t, status: "DONE" as const })), me, now).text, "今天没有要跟进的事。");
});
test("§4.1 老板：受阻和风险并集，排除仅完成期限逾期，卡点截断60字", () => {
  const rows = [task("blocked", { status: "BLOCKED", health: "AT_RISK", riskNote: "卡".repeat(80) }), task("risk", { health: "AT_RISK" }), task("overdue", { dueAt: new Date("2026-10-01") }), task("done", { status: "DONE", health: "AT_RISK" })];
  assert.deepEqual(dashboardHeadline(rows, boss, now), { text: "3 件事在推进，2 件卡住了，需要你出面。", supplement: `李明：${"卡".repeat(60)}` });
});
test("§4.1 老板：无风险，回音只计今天与已过，不含未设置", () => {
  assert.deepEqual(dashboardHeadline([task("today", { nextFollowUpAt: day }), task("late", { nextFollowUpAt: new Date("2026-10-15") }), task("none", { nextFollowUpAt: null }), task("later")], boss, now), { text: "4 件事在推进，没有卡住的。", supplement: "今天该有回音的 2 件。" });
  assert.deepEqual(dashboardHeadline([], boss, now), { text: "0 件事在推进，没有卡住的。", supplement: "今天该有回音的 0 件。" });
});
test("§4.1 成员三栏：首匹配优先，已交付和停用协作不计，主协作重叠不重复", () => {
  const overlap = delivery("overlap", day); overlap.ownerId = me.id; overlap.owner = me; overlap.nextFollowUpAt = day;
  const inactive = delivery("inactive"); inactive.collaborators[0].active = false;
  const rows = [overlap, delivery("assist"), task("undated"), task("dated", { dueAt: later }), delivery("delivered", day, true), inactive, task("closed", { status: "CANCELLED" })];
  const lanes = dashboardLanes(rows, me, now);
  assert.deepEqual(lanes.first.map(t => t.id), ["overlap"]);
  assert.deepEqual(lanes.second.map(t => t.id), ["assist"]);
  assert.deepEqual(lanes.third.map(t => t.id), ["undated"]);
  assert.equal(new Set([...lanes.first, ...lanes.second, ...lanes.third].map(t => t.id)).size, 3);
});
test("§4.1 老板三栏：风险先于回音、回音先于无期限，归档和结束排除", () => {
  const rows = [task("risk", { health: "AT_RISK", nextFollowUpAt: day }), task("reply", { nextFollowUpAt: day }), task("missing", { nextFollowUpAt: null }), task("future"), task("deadline", { dueAt: later }), task("archive", { archivedAt: day }), task("done", { status: "DONE" })];
  const lanes = dashboardLanes(rows, boss, now);
  assert.deepEqual(lanes.first.map(t => t.id), ["risk"]);
  assert.deepEqual(lanes.second.map(t => t.id), ["reply"]);
  assert.deepEqual(lanes.third.map(t => t.id), ["missing", "future"]);
  assert.equal(new Set([...lanes.first, ...lanes.second, ...lanes.third].map(t => t.id)).size, 4);
});
test("§4.1 本周进展：沿用周总览expected，成员仅主责，老板全部；结束未写无写按钮", () => {
  const tasks = [task("own"), delivery("assist"), task("done", { status: "DONE" })];
  const expected = tasks.map(t => ({ scopeId: t.id, ownerId: t.ownerId, ownerName: t.owner.name, title: t.title, href: `/tasks/${t.id}?kind=WEEK` }));
  const period = { tasks, expected, missingIds: new Set(["own", "done"]) } as unknown as Awaited<ReturnType<typeof loadPeriodView>>;
  const member = dashboardWeekProgress(period, me);
  assert.equal(member.total, 2); assert.equal(member.written, 0);
  assert.deepEqual(member.pending.map(t => [t.id, t.canConfirm]), [["own", true], ["done", false]]);
  const all = dashboardWeekProgress(period, boss);
  assert.equal(all.total, 3); assert.equal(all.written, 1); assert.ok(all.pending.every(t => !t.canConfirm));
  assert.deepEqual(dashboardWeekProgress({ ...period, expected: [] }, me), { total: 0, written: 0, pending: [] });
});
test("§4.1 上海日期和 ISO 周：跨UTC日期、周日和年边界", () => {
  assert.equal(dashboardDate(now), "10 月 16 日 周五 · 第 42 周");
  assert.equal(dashboardDate(new Date("2026-10-15T17:00:00Z")), "10 月 16 日 周五 · 第 42 周");
  assert.equal(dashboardDate(new Date("2027-01-03T02:00:00Z")), "1 月 3 日 周日 · 第 53 周");
});

test("§4.1 真实周范围与总览一致：跨周、当周完成、取消、归档和暂无变化", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { PrismaClient } = await import("@prisma/client");
  const { ensurePeriodTree } = await import("../lib/period");
  const { loadRedesignDashboard } = await import("../lib/dashboard-view");
  const { loadPeriodView } = await import("../lib/period-view");
  const folder = mkdtempSync(join(tmpdir(), "okr-redesign-"));
  const url = `file:${join(folder, "dashboard.db")}`;
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const actor = await db.user.create({ data: { id: me.id, name: me.name, email: "me@test.local", role: "MANAGER", passwordHash: "unused" } });
    const reader = await db.user.create({ data: { id: boss.id, name: boss.name, email: "boss@test.local", role: "BOSS", passwordHash: "unused" } });
    const disabled = await db.user.create({ data: { name: "停用", email: "disabled@test.local", role: "MANAGER", passwordHash: "unused", disabledAt: new Date() } });
    const { week } = await ensurePeriodTree(db);
    const old = new Date(week.startAt.getTime() - 86400000);
    for (const row of [{ id: "carry" }, { id: "done", status: "DONE" as const, completedAt: week.startAt }, { id: "old-done", status: "DONE" as const, completedAt: old }, { id: "cancel", status: "CANCELLED" as const, completedAt: week.startAt }, { id: "archive", archivedAt: new Date() }, { id: "legacy-boss", ownerId: reader.id }]) {
      await db.task.create({ data: { ownerId: actor.id, title: row.id, createdAt: old, ...row } });
    }
    await db.checkIn.create({ data: { periodId: week.id, scopeType: "TASK", scopeId: "carry", authorId: actor.id, status: "NO_CHANGE", body: "暂无变化" } });
    const overview = await loadPeriodView(db, { kind: "WEEK" });
    const memberView = await loadRedesignDashboard(db, actor);
    const bossView = await loadRedesignDashboard(db, reader);
    assert.equal(bossView.week.total, overview.expected.length);
    assert.deepEqual(overview.expected.map(t => t.scopeId).sort(), ["carry", "done", "legacy-boss"]);
    assert.equal(memberView.week.total, 2); assert.equal(memberView.week.written, 1);
    assert.deepEqual(memberView.week.pending.map(t => [t.id, t.canConfirm]), [["done", false]]);
    assert.ok(!bossView.currentPeople.some(person => person.id === disabled.id));
    assert.ok(bossView.week.pending.every(task => !task.canConfirm));
    const { loadTaskDetail } = await import("../lib/task-detail-view");
    const detail = await loadTaskDetail(db, actor, "carry", { person: actor.id, area: "OTHER", relation: "owned", filter: "attention", q: "供 应" });
    const back = new URL(detail!.backHref, "http://test.local");
    assert.equal(back.searchParams.get("person"), actor.id); assert.equal(back.searchParams.get("q"), "供 应");
    assert.equal(back.searchParams.get("filter"), "attention"); assert.equal(back.searchParams.get("relation"), "owned");
    assert.equal(back.searchParams.get("area"), "OTHER"); assert.equal(back.searchParams.has("kind"), false);
  } finally { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); }
});
