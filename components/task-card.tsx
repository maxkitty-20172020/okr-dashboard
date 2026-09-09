import Link from "next/link";
import { areaLabels, closed, dateLabel, followUpState, overdue, statusLabels, timeLabel, type TaskRow } from "@/lib/tasks";

export function TaskBadges({ task }: { task: TaskRow }) {
  const late = overdue(task);
  const follow = followUpState(task);
  return <div className="badges">
    {task.archivedAt && <span className="badge">已归档</span>}
    <span className={`badge ${task.status === "BLOCKED" ? "danger" : task.status === "DONE" ? "good" : ""}`}>{statusLabels[task.status]}</span>
    {!closed(task) && <span className={`badge ${task.health === "AT_RISK" || late ? "danger" : task.lastConfirmedAt ? "good" : ""}`}>{late ? "已逾期" : task.health === "AT_RISK" ? "有风险" : task.lastConfirmedAt ? "按计划" : "情况待确认"}</span>}
    {follow === "missing" && <span className="badge amber">待设置跟进日期</span>}
    {follow === "late" && <span className="badge amber">跟进确认已到期</span>}
    {follow === "today" && <span className="badge amber">今天需跟进</span>}
    {task.priority === 2 && <span className="badge accent">重点</span>}
  </div>;
}
export function TaskCard({ task, userId, compact = false, query = "" }: { task: TaskRow; userId?: string; compact?: boolean; query?: string }) {
  const contribution = task.collaborators.find(c => c.userId === userId);
  return <article className={`task-card ${compact ? "compact" : ""}`}>
    <div className="task-kicker"><span>{areaLabels[task.area]}{task.scope ? ` · ${task.scope}` : ""}</span><span>{task.owner.name} · 主责</span></div>
    <Link href={`/tasks/${task.id}${query}`} className="task-title">{task.title}</Link>
    <TaskBadges task={task} />
    <p className="task-progress">{task.latestProgress || "尚未记录进展"}</p>
    {!closed(task) && <p className="task-next"><span>下一步</span>{task.nextAction || "待主负责人补充"}</p>}
    {task.riskNote && !closed(task) && <p className="risk-note">{task.riskNote}</p>}
    {contribution ? <div className="contribution"><span>我的协作 · {contribution.done ? "已交付" : "待交付"}</span><p>{contribution.deliverable}</p><small>协作期限：{dateLabel(contribution.dueAt)}</small></div> : task.collaborators.length > 0 && <p className="muted small">协作：{task.collaborators.map(c => `${c.user.name}${c.done ? "（已交付）" : ""}`).join("、")}</p>}
    <footer className="task-dates"><span>下次跟进 {closed(task) ? "—" : dateLabel(task.nextFollowUpAt)}</span><span>完成期限 {dateLabel(task.dueAt)}</span></footer>
    {!compact && <p className="muted small">{task.lastConfirmedAt ? `${timeLabel(task.lastConfirmedAt)} 主负责人已确认` : "尚未由主负责人确认"}{task.kind === "LONG_TERM" ? ` · 节点 ${task.milestones.filter(m => m.done).length}/${task.milestones.length}` : ""}</p>}
  </article>;
}
