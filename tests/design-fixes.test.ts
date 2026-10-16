import assert from "node:assert/strict";
import { test } from "node:test";
import { displayAccount, formatDate, formatMetric, formatPeriod, formatShortDate, formatWeek, independentDeliverables } from "../lib/display";
import { dashboardHeadline } from "../lib/dashboard-view";
import type { TaskRow } from "../lib/tasks";

test("日常周期格式：普通周、跨年周、月、季度和未知标签", () => {
  assert.equal(formatPeriod("2026-W42"), "第 42 周（10/12–10/18）");
  assert.equal(formatPeriod("2026-W01"), "2026 年第 1 周（12/29–1/4）");
  assert.equal(formatPeriod("2020-W53"), "2020 年第 53 周（12/28–1/3）");
  assert.equal(formatPeriod("2026-10"), "2026 年 10 月");
  assert.equal(formatPeriod("2026-01"), "2026 年 1 月");
  assert.equal(formatPeriod("2026-Q4"), "2026 年第 4 季度");
  assert.equal(formatWeek(new Date("2026-10-12T00:00:00Z")), "第 42 周（10/12–10/18）");
  assert.equal(formatPeriod("未知周期"), "未知周期");
});
test("日期与单位显示可读，空日期有说明", () => {
  assert.equal(formatDate("2026-10-12"), "2026 年 10 月 12 日");
  assert.equal(formatDate(null), "未设置");
  assert.equal(formatShortDate("2027-01-04"), "1/4");
  assert.equal(formatShortDate(null), "未定");
  assert.equal(formatMetric(30, "%"), "30%");
  assert.equal(formatMetric(25, "万元"), "25万元");
});
test("账号只去内部域名后缀，真实邮箱保持原样", () => {
  assert.equal(displayAccount("okr1@okr.local"), "okr1");
  assert.equal(displayAccount("lm@OKR.LOCAL"), "lm");
  assert.equal(displayAccount("lm@example.com"), "lm@example.com");
  assert.equal(displayAccount("okr.local@example.com"), "okr.local@example.com");
  assert.equal(displayAccount("okr1"), "okr1");
  assert.equal(displayAccount(""), "");
});
test("其他交付只列有效独立记录，按负责人加交付标题匹配协作镜像", () => {
  const items = [
    { id: "mirror", active: true, ownerUserId: "a", title: "排期" },
    { id: "different-owner", active: true, ownerUserId: "b", title: "排期" },
    { id: "different-title", active: true, ownerUserId: "a", title: "预测" },
    { id: "unassigned", active: true, ownerUserId: null, title: "验收" },
    { id: "inactive", active: false, ownerUserId: null, title: "历史" },
  ];
  assert.deepEqual(independentDeliverables(items, [{ userId: "a", deliverable: "排期" }]).map(row => row.id), ["different-owner", "different-title", "unassigned"]);
  assert.equal(items.length, 5);
});
test("所有成员结论分支，人名直接连接在等你的", () => {
  const me = { id: "me", name: "李明", role: "MANAGER" };
  const now = new Date("2026-10-16T02:00:00Z");
  const delivery = { id: "delivery", ownerId: "other", owner: { name: "王芳" }, status: "IN_PROGRESS", health: "ON_TRACK", archivedAt: null, collaborators: [{ active: true, userId: "me", done: false, deliverable: "排期", dueAt: now }] } as unknown as TaskRow;
  const owned = { ...delivery, id: "owned", ownerId: "me", nextFollowUpAt: null, collaborators: [] } as unknown as TaskRow;
  for (const rows of [[delivery], [delivery, owned], [delivery, { ...delivery, id: "second" }]]) {
    const result = dashboardHeadline(rows, me, now).text;
    assert.ok(result.includes("王芳在等你的「排期」"));
    assert.ok(!result.includes("王芳 在等"));
  }
});
