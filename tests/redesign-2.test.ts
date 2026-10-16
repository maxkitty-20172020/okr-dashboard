import assert from "node:assert/strict";
import { test } from "node:test";
import { objectiveTaskCount, periodDrillLabel, taskFilterHref, weeklyOverview } from "../lib/redesign-view";
import { weekBounds } from "../lib/week";
import type { loadOverview } from "../lib/overview-service";

type WeeklyInput = Parameters<typeof weeklyOverview>[0];
const now = new Date("2026-10-16T02:00:00Z");
const me = { id: "me", name: "李明", role: "MANAGER" };
const boss = { id: "boss", name: "陈总", role: "BOSS" };
const rows = [
  { id: "a", ownerId: "me", ownerName: "李明" },
  { id: "b", ownerId: "other", ownerName: "王芳" },
  { id: "c", ownerId: "me", ownerName: "李明", status: "DONE" },
];
function view(missing = ["a", "b", "c"], period = weekBounds(now).label): WeeklyInput {
  return {
    expected: rows.map(row => ({ scopeType: "TASK", scopeId: row.id, title: row.id, ownerId: row.ownerId, ownerName: row.ownerName, href: `/tasks/${row.id}?kind=WEEK&period=${period}` })),
    missingIds: new Set(missing),
    tasks: rows.map(row => ({ ...row, version: 4, status: row.status ?? "IN_PROGRESS", archivedAt: null })),
    search: { kind: "WEEK", period }, myUnreported: [],
  } as unknown as WeeklyInput;
}
test("§4.5 全员周范围保持原口径，按实际主负责人分组，老板无任务时不建空组", () => {
  const result = weeklyOverview(view(), me, now);
  assert.equal(result.total, 3); assert.equal(result.written, 0);
  assert.deepEqual(result.groups.map(group => [group.ownerName, group.items.map(item => item.id)]), [["李明", ["a", "c"]], ["王芳", ["b"]]]);
  assert.deepEqual(result.pending.map(item => [item.id, item.canConfirm, item.version]), [["a", true, 4], ["b", false, 4], ["c", false, 4]]);
  assert.ok(result.pending[0].href.includes("kind=WEEK"));
});
test("§4.5 写过的事项移出分组、计数减少；全部写过时不生成空组", () => {
  const result = weeklyOverview(view(["b"]), me, now);
  assert.equal(result.written, 2); assert.equal(result.pending.length, 1);
  assert.deepEqual(result.groups.map(group => group.ownerId), ["other"]);
  const complete = weeklyOverview(view([]), me, now);
  assert.equal(complete.written, 3); assert.deepEqual(complete.groups, []);
});
test("§4.5 老板本人确实主责时才列组，仍无写操作；历史周和归档事项不能误记当前周", () => {
  const input = view();
  input.expected[0].ownerId = boss.id; input.expected[0].ownerName = boss.name;
  input.tasks[0].ownerId = boss.id;
  const result = weeklyOverview(input, boss, now);
  assert.equal(result.groups[0].ownerId, boss.id);
  assert.ok(result.pending.every(item => !item.canConfirm));
  assert.ok(weeklyOverview(view(undefined, "2026-W41"), me, now).pending.every(item => !item.canConfirm));
  const archived = view(); archived.tasks[0].archivedAt = now;
  assert.equal(weeklyOverview(archived, me, now).pending[0].canConfirm, false);
});
test("§4.5 当前周识别使用上海周边界，不把周五误判成下一周", () => {
  assert.equal(weeklyOverview(view(), me, now).pending[0].canConfirm, true);
  const sundayUtc = new Date("2026-10-18T16:01:00Z");
  assert.equal(weekBounds(sundayUtc).label, "2026-W43");
  assert.equal(weeklyOverview(view(undefined, "2026-W43"), me, sundayUtc).pending[0].canConfirm, true);
});
test("§4.5 保留原有额外复盘与督办确认入口，避免主责周事项重复表单", () => {
  const input = view();
  input.myUnreported = [
    input.expected[0], input.expected[1],
    { ...input.expected[0], scopeType: "KEY_RESULT", scopeId: "kr" },
  ] as Awaited<ReturnType<typeof loadOverview>>["myUnreported"];
  assert.deepEqual(weeklyOverview(input, me, now).extraReports.map(item => item.scopeId), ["b", "kr"]);
});
test("§4.4 胶囊只替换目标参数，保留周期、异常、成员、领域、搜索和关联筛选", () => {
  const params = { kind: "WEEK", period: "2026-W42", exception: "risk", person: "a", area: "OTHER", q: "备货 & 排期", relation: "owned", filter: "attention" };
  const url = new URL(taskFilterHref(params, { area: "BUSINESS" }), "http://localhost");
  assert.deepEqual(Object.fromEntries(url.searchParams), { ...params, area: "BUSINESS" });
  const removed = new URL(taskFilterHref(params, { exception: undefined, filter: "" }), "http://localhost");
  assert.equal(removed.searchParams.has("exception"), false); assert.equal(removed.searchParams.has("filter"), false);
  assert.equal(removed.searchParams.get("period"), "2026-W42");
  assert.equal(taskFilterHref({}, {}), "/tasks");
  assert.equal(periodDrillLabel("2026-W42"), "第 42 周");
  assert.equal(periodDrillLabel("2026-W03"), "第 3 周");
  assert.equal(periodDrillLabel("2026-10"), "2026-10");
});
test("§4.6 目标关联事项数按关键结果的非归档计数求和，空目标为零", () => {
  assert.equal(objectiveTaskCount([]), 0);
  assert.equal(objectiveTaskCount([{ _count: { tasks: 2 } }, { _count: { tasks: 0 } }, { _count: { tasks: 3 } }]), 5);
});
