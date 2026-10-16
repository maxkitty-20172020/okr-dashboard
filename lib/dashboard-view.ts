import { loadPeriodView } from "./period-view";
import { today as todayForDashboard } from "./tasks";
import type { CheckInClient } from "./check-in";
import {
  closed, completedThisWeek, followUpState, needsAttention, publicUser,
  sortTasks, taskInclude, type Member,
} from "./tasks";

export async function loadDashboard(db: CheckInClient, user: Member) {
  const [allTasks, members, updates] = await Promise.all([
    db.task.findMany({ include: taskInclude }),
    db.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    db.taskUpdate.findMany(
      {
        where: { task: { archivedAt: null } },
        include: { author: { select: { name: true } }, task: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 8
      }
    ),
  ]);
  const active = sortTasks(allTasks.filter(t => !closed(t) && !t.archivedAt));
  const attention = active.filter(t => needsAttention(t));
  const owned = active.filter(t => t.ownerId === user.id);
  const collaborating = active.filter(t => t.ownerId !== user.id && t.collaborators.some(c => c.userId === user.id));
  const followUps = owned.filter(t => followUpState(t) !== "scheduled");
  const recentDone = allTasks.filter(t => completedThisWeek(t));
  const boss = user.role === "BOSS";

  const people = members
    .filter(m => m.role !== "BOSS" || active.some(t => t.ownerId === m.id))
    .sort((a, b) => Number(a.role === "BOSS") - Number(b.role === "BOSS"));
  const personViews = new Map(people.map(m => [m.id, {
    own: active.filter(t => t.ownerId === m.id),
    assisting: active.filter(t => t.collaborators.some(c => c.userId === m.id)),
  }]));
  const remainingOwned = owned.filter(t => !followUps.some(f => f.id === t.id));
  return {
    active, attention, owned, collaborating, followUps, recentDone, boss,
    updates, people, personViews, remainingOwned,
    memberCount: members.filter(m => m.role !== "BOSS").length
  };
}

/** First matching lane wins; report and headline counts are independent of display deduplication. */
export function dashboardLanes(tasks: import("./tasks").TaskRow[], user: Member, now = new Date()) {
  const active = tasks.filter(task => !closed(task) && !task.archivedAt);
  const risk = (task: (typeof active)[number]) => task.status === "BLOCKED" || task.health === "AT_RISK";
  const due = (task: (typeof active)[number]) => ["today", "late"].includes(followUpState(task, now));
  const boss = user.role === "BOSS";
  const first = active.filter(task => boss ? risk(task) : task.ownerId === user.id && followUpState(task, now) !== "scheduled");
  const used = new Set(first.map(task => task.id));
  const deliveries = active.filter(task => task.collaborators.some(c => c.active && c.userId === user.id && !c.done));
  const second = active.filter(task => !used.has(task.id) && (boss ? due(task) : deliveries.some(row => row.id === task.id)));
  second.forEach(task => used.add(task.id));
  const third = active.filter(task => !used.has(task.id) && !task.dueAt && (boss || task.ownerId === user.id));
  return { first, second, third, active, deliveries, replyCount: active.filter(due).length };
}

export function dashboardHeadline(tasks: import("./tasks").TaskRow[], user: Member, now = new Date()): { text: string; supplement: string } {
  const lanes = dashboardLanes(tasks, user, now);
  if (user.role === "BOSS") {
    return lanes.first.length ? {
      text: `${lanes.active.length} 件事在推进，${lanes.first.length} 件卡住了，需要你出面。`,
      supplement: `${lanes.first[0].owner.name}：${lanes.first[0].riskNote.slice(0, 60)}`,
    } : { text: `${lanes.active.length} 件事在推进，没有卡住的。`, supplement: `今天该有回音的 ${lanes.replyCount} 件。` };
  }
  const deliveries = lanes.deliveries.map(task => ({ task, contribution: task.collaborators.find(c => c.active && c.userId === user.id && !c.done)! }))
    .sort((a, b) => (a.contribution.dueAt?.getTime() ?? Infinity) - (b.contribution.dueAt?.getTime() ?? Infinity));
  const first = deliveries[0];
  const delivery = first ? `${first.task.owner.name} 在等你的「${first.contribution.deliverable}」${deliveries.length > 1 ? `，还有 ${deliveries.length - 1} 项等你交付` : ""}。` : "";
  if (lanes.first.length) return { text: `今天有 ${lanes.first.length} 件事要跟进。${delivery}`, supplement: "" };
  if (first) return { text: `今天没有到期的跟进，${delivery}`, supplement: "" };
  return { text: "今天没有要跟进的事。", supplement: "可以推进还没定期限的事项。" };
}

/** Scope is exactly /overview's WEEK expected targets, narrowed only by primary owner. */
export function dashboardWeekProgress(period: Awaited<ReturnType<typeof import("./period-view").loadPeriodView>>, user: Member) {
  const expected = period.expected.filter(item => user.role === "BOSS" || item.ownerId === user.id);
  const pending = expected.filter(item => period.missingIds.has(item.scopeId)).map(item => {
    const task = period.tasks.find(task => task.id === item.scopeId)!;
    return { id: task.id, title: item.title, ownerName: item.ownerName, href: item.href, version: task.version,
      canConfirm: user.role !== "BOSS" && task.ownerId === user.id && !closed(task) && !task.archivedAt };
  });
  return { total: expected.length, written: expected.length - pending.length, pending };
}

export function dashboardDate(now = new Date()) {
  const day = todayForDashboard(now);
  const thursday = new Date(day);
  thursday.setUTCDate(day.getUTCDate() + 3 - (day.getUTCDay() + 6) % 7);
  const week = Math.ceil(((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${day.getUTCMonth() + 1} 月 ${day.getUTCDate()} 日 周${"日一二三四五六"[day.getUTCDay()]} · 第 ${week} 周`;
}
export async function loadRedesignDashboard(db: CheckInClient, user: Member) {
  const [legacy, period, people] = await Promise.all([
    loadDashboard(db, user), loadPeriodView(db, { kind: "WEEK" }),
    db.user.findMany({ where: { disabledAt: null, role: { not: "BOSS" } }, select: publicUser, orderBy: { createdAt: "asc" } }),
  ]);
  return { ...legacy, lanes: dashboardLanes(legacy.active, user), headline: dashboardHeadline(legacy.active, user),
    week: dashboardWeekProgress(period, user), currentPeople: people };
}
