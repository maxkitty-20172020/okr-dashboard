import Link from "next/link";
import type { ReactNode } from "react";
import { areaLabels, closed, followUpState, statusLabels, today, type TaskRow } from "@/lib/tasks";
import { StatusBadge, type Tone } from "./status-badge";
export const shortDate = (date: Date | null) => date ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}` : "未定";
export function TaskBadges({ task, full = false }: { task: TaskRow; full?: boolean }) {
  const follow = followUpState(task);
  const tone: Tone = task.status === "DONE" ? "done" : task.status === "BLOCKED" || task.health === "AT_RISK" ? "risk" : task.status === "WAITING" ? "wait" : task.status === "IN_PROGRESS" ? "ok" : "plain";
  const followLabel = follow === "today" ? "跟进 今天" : follow === "late" ? `晚了 ${Math.round((today().getTime() - task.nextFollowUpAt!.getTime()) / 86400000)} 天` : `跟进 ${shortDate(task.nextFollowUpAt)}`;
  return <div className="badges"><StatusBadge tone={tone}>{statusLabels[task.status]}</StatusBadge>{task.health === "AT_RISK" && task.status !== "BLOCKED" && !closed(task) && <StatusBadge tone="risk">有风险</StatusBadge>}{!closed(task) && <StatusBadge tone={follow === "today" ? "today" : follow === "late" ? "risk" : "plain"}>{followLabel}</StatusBadge>}{full && <StatusBadge>期限 {shortDate(task.dueAt)}</StatusBadge>}{task.priority === 2 && <StatusBadge>重要</StatusBadge>}{task.archivedAt && <StatusBadge>已归档</StatusBadge>}</div>;
}
export function TaskCard({ task, description, query = "", action }: { task: TaskRow; description?: string; query?: string; action?: ReactNode }) {
  return <article className={`ui-task-card ${task.status === "DONE" ? "is-done" : ""}`}><Link href={`/tasks/${task.id}${query}`} className="task-card-link"><TaskBadges task={task} /><h3>{task.title}</h3><p className={task.status === "BLOCKED" || task.health === "AT_RISK" ? "risk-note" : "muted"}>{description || task.latestProgress || "尚未记录进展"}</p><footer><span>{areaLabels[task.area]} · {task.owner.name}</span><span>期限 {shortDate(task.dueAt)}</span></footer></Link>{action && <div className="task-card-action">{action}</div>}</article>;
}
