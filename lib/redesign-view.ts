import type { loadOverview } from "./overview-service";
import { closed, type Member } from "./tasks";
import { weekBounds } from "./week";

/** Keep the weekly overview's expected/missing scope; group only actual owners. */
export function weeklyOverview(view: Pick<Awaited<ReturnType<typeof loadOverview>>, "expected" | "missingIds" | "tasks" | "search" | "myUnreported">, user: Member, now = new Date()) {
  const currentWeek = view.search.kind === "WEEK" && view.search.period === weekBounds(now).label;
  const tasks = new Map(view.tasks.map(task => [task.id, task]));
  const pending = view.expected.filter(item => view.missingIds.has(item.scopeId)).map(item => {
    const task = tasks.get(item.scopeId)!;
    return { id: item.scopeId, title: item.title, ownerId: item.ownerId, ownerName: item.ownerName,
      href: item.href, version: task.version,
      canConfirm: currentWeek && user.role !== "BOSS" && task.ownerId === user.id && !closed(task) && !task.archivedAt };
  });
  const groups = new Map<string, { ownerId: string; ownerName: string; items: typeof pending }>();
  for (const item of pending) {
    if (!groups.has(item.ownerId)) groups.set(item.ownerId, { ownerId: item.ownerId, ownerName: item.ownerName, items: [] });
    groups.get(item.ownerId)!.items.push(item);
  }
  const extraReports = view.myUnreported.filter(item => item.scopeType !== "TASK" || !view.tasks.some(task => task.id === item.scopeId && task.ownerId === user.id));
  return { extraReports, total: view.expected.length, written: view.expected.length - pending.length, pending, groups: [...groups.values()] };
}

export function objectiveTaskCount(keyResults: { _count: { tasks: number } }[]) {
  return keyResults.reduce((total, row) => total + row._count.tasks, 0);
}

/** Filter links retain every supported URL parameter; clearing retains period context only. */
export function taskFilterHref(params: import("./tasks-view").TaskListParams, patch: Partial<import("./tasks-view").TaskListParams>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) if (value) next.set(key, value);
  return `/tasks${next.size ? `?${next}` : ""}`;
}

export function periodDrillLabel(label: string) {
  return label.replace(/^\d{4}-W0?(\d+)$/, "第 $1 周");
}
