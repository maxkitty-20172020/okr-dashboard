import type { Prisma, Task, TaskStatus } from "@prisma/client";

export const publicUser = { id: true, name: true, role: true } as const;
export const taskInclude = {
  owner: { select: publicUser },
  collaborators: { where: { active: true }, include: { user: { select: publicUser } }, orderBy: { id: "asc" } },
  milestones: { orderBy: { createdAt: "asc" } },
  keyResult: { select: { id: true, title: true } },
} satisfies Prisma.TaskInclude;
export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
export type Member = { id: string; name: string; role: string };
export const statusLabels: Record<TaskStatus, string> = { TODO: "未开始", IN_PROGRESS: "进行中", WAITING: "等待中", BLOCKED: "受阻", DONE: "已完成", CANCELLED: "已取消" };
export const areaLabels = { BUSINESS: "业务管理", PEOPLE: "团队管理", INVENTORY: "库存管理", OTHER: "其他事项" };
export const kindLabels = { SHORT_TERM: "短期任务", LONG_TERM: "长期事项" };
export const updateLabels: Record<string, string> = { CREATED: "创建任务", MIGRATED: "历史迁入", PROGRESS: "更新进展", NO_CHANGE: "确认暂无变化", CHECKIN: "周期汇报", DETAILS: "调整任务", COLLABORATION: "协作记录", MILESTONE: "节点记录", ARCHIVED: "归档任务", RESTORED: "恢复任务" };

// Business dates are UTC-midnight date-only values. Day boundaries are always Shanghai time.
export function today(now = new Date()) {
  return new Date(new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10) + "T00:00:00.000Z");
}
export function dateValue(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}
export function dateLabel(value: Date | string | null | undefined) {
  return value ? dateValue(value).replaceAll("-", "/") : "未设置";
}
export function timeLabel(value: Date | string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function closed(task: Pick<Task, "status">) { return task.status === "DONE" || task.status === "CANCELLED"; }
export function overdue(task: Pick<Task, "status" | "dueAt">, now = new Date()) {
  return !closed(task) && !!task.dueAt && task.dueAt < today(now);
}
export function followUpState(task: Pick<Task, "status" | "nextFollowUpAt">, now = new Date()) {
  if (closed(task)) return "closed";
  if (!task.nextFollowUpAt) return "missing";
  const day = today(now).getTime();
  return task.nextFollowUpAt.getTime() < day ? "late" : task.nextFollowUpAt.getTime() === day ? "today" : "scheduled";
}
export function needsAttention(task: Task, now = new Date()) {
  return !closed(task) && (task.status === "BLOCKED" || task.health === "AT_RISK" || overdue(task, now));
}
export function sortTasks<T extends Task>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || b.priority - a.priority || (a.nextFollowUpAt?.getTime() ?? Infinity) - (b.nextFollowUpAt?.getTime() ?? Infinity) || b.createdAt.getTime() - a.createdAt.getTime());
}
export function canConfirm(user: Member, task: Pick<Task, "ownerId">) { return user.role !== "BOSS" && user.id === task.ownerId; }
export function snapshot(task: Task & { owner?: { name: string } }) {
  return JSON.stringify({ title: task.title, status: task.status, health: task.health, ownerId: task.ownerId, ownerName: task.owner?.name, dueAt: dateValue(task.dueAt), nextFollowUpAt: dateValue(task.nextFollowUpAt), nextAction: task.nextAction, riskNote: task.riskNote, latestProgress: task.latestProgress });
}
