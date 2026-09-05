import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { taskMutationAction } from "@/lib/actions";
import { areaLabels, canConfirm, closed, dateLabel, dateValue, kindLabels, publicUser, taskInclude, timeLabel, today, updateLabels, type TaskRow } from "@/lib/tasks";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TaskBadges } from "@/components/task-card";
import { TaskFields } from "@/components/task-fields";
import { ProgressForm } from "@/components/progress-form";

export const dynamic = "force-dynamic";
function Mutation({ task, operation, children, label }: { task: TaskRow; operation: string; children: React.ReactNode; label?: string }) {
  return <ActionForm action={taskMutationAction} label={label}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /><input type="hidden" name="operation" value={operation} />{children}</ActionForm>;
}
function HistorySnapshot({ raw }: { raw: string }) {
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  return <p className="history-snapshot">{typeof data.ownerName === "string" && `当时主责：${data.ownerName}　`}{typeof data.nextFollowUpAt === "string" && data.nextFollowUpAt && `当时约定跟进：${data.nextFollowUpAt}　`}{typeof data.dueAt === "string" && data.dueAt && `当时完成期限：${data.dueAt}`}</p>;
}
export default async function TaskDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const [task, members, keyResults] = await Promise.all([
    prisma.task.findUnique({ where: { id }, include: { ...taskInclude, updates: { include: { author: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] } } }),
    prisma.user.findMany({ where: { role: "MANAGER" }, select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.keyResult.findMany({ select: { id: true, title: true } }),
  ]);
  if (!task) notFound();
  const owner = canConfirm(user, task);
  const writable = user.role !== "BOSS";
  const active = !task.archivedAt && !closed(task);
  const myContribution = task.collaborators.find(c => c.userId === user.id);
  const available = members.filter(m => m.id !== task.ownerId && !task.collaborators.some(c => c.userId === m.id));
  return <div className="page"><Link className="back-link" href="/tasks">← 任务与协作</Link>
    <header className="page-heading detail-heading"><div><p className="eyebrow">{areaLabels[task.area]} · {kindLabels[task.kind]}{task.scope ? ` · ${task.scope}` : ""}</p><h1>{task.title}</h1><TaskBadges task={task} /></div>{!writable && <span className="readonly-label">老板账号 · 只读</span>}</header>
    {query.created && writable && <p className="form-success" role="status">任务已创建。主负责人可在下方安排协作与关键节点。</p>}
    {task.archivedAt && <div className="notice">任务已归档，历史记录保留。{writable && <Mutation task={task} operation="restore"><SubmitButton secondary>恢复归档任务</SubmitButton></Mutation>}</div>}
    {task.owner.role === "BOSS" && <p className="notice">这是原来分配给老板的历史任务。{writable ? "请在「任务资料与分工」中移交给填报成员，再由新负责人确认进展。" : "请由填报成员接手并继续跟进。"}</p>}
    <div className="detail-grid"><div className="detail-main">
      <section className="surface detail-section"><div className="section-heading"><h2>当前情况</h2><span className="muted small">主负责人：{task.owner.name}</span></div><dl className="summary-grid"><div className="span-all"><dt>完成标准</dt><dd>{task.completionCriteria || "待补充完成标准"}</dd></div><div className="span-all"><dt>最近进展</dt><dd>{task.latestProgress || "尚未记录进展"}</dd></div>{!closed(task) && <div className="span-all"><dt>下一步</dt><dd>{task.nextAction || "待明确下一步动作"}</dd></div>}{task.riskNote && <div className="span-all"><dt>风险与支持</dt><dd className="risk-note">{task.riskNote}</dd></div>}<div><dt>完成期限</dt><dd>{dateLabel(task.dueAt)}</dd></div><div><dt>下次跟进</dt><dd>{closed(task) ? "已结束，无需跟进" : dateLabel(task.nextFollowUpAt)}</dd></div><div><dt>最近确认</dt><dd>{task.lastConfirmedAt ? timeLabel(task.lastConfirmedAt) : "尚未确认"}</dd></div><div><dt>关联关键结果</dt><dd>{task.keyResult?.title || "未关联"}</dd></div></dl></section>
      {owner && !task.archivedAt && <section className="surface detail-section" id="update"><h2>{closed(task) ? "重新开启 / 调整结果" : "更新整体进展"}</h2><p className="section-help">主负责人确认整体情况，协作者在自己的交付中更新。</p><ProgressForm task={{ id: task.id, version: task.version, status: task.status, health: task.health, nextAction: task.nextAction, riskNote: task.riskNote, nextFollowUpAt: dateValue(task.nextFollowUpAt), today: dateValue(today()) }} /></section>}
      <section className="surface detail-section"><div className="section-heading"><h2>协作分工</h2><span className="muted small">{task.collaborators.filter(c => c.done).length}/{task.collaborators.length} 已交付</span></div>
        {!task.collaborators.length && <p className="empty-inline">这项任务目前由主负责人独立推进。</p>}
        <div className="collaborator-list">{task.collaborators.map(c => <article className="collaborator-item" key={c.id}><div className="section-heading"><h3>{c.user.name}{c.userId === user.id ? " · 我的协作" : ""}</h3><span className={`badge ${c.done ? "good" : ""}`}>{c.done ? "已交付" : "待交付"}</span></div><p>{c.deliverable}</p><p className="muted small">交付期限：{dateLabel(c.dueAt)}{c.dueAt && c.dueAt < today() && !c.done && active ? " · 协作已逾期" : ""}</p>{c.note && <p className="contribution-note">{c.note}</p>}{writable && myContribution?.id === c.id && active && <Mutation task={task} operation="contribution" label="更新我的协作"><div className="fields"><label>交付状态<select name="done" defaultValue={String(c.done)}><option value="false">推进中</option><option value="true">已交付</option></select></label><label className="span-all">我的进展<textarea name="note" required maxLength={2000} defaultValue={c.note} rows={2} placeholder="记录自己负责的部分与交付结果" /></label></div><div className="form-actions"><SubmitButton secondary>保存我的协作</SubmitButton></div></Mutation>}{owner && active && <details className="inline-details"><summary>调整这项分工</summary><p className="muted small">移除后不再显示在协作清单中，历史记录保留。</p><Mutation task={task} operation="removeCollaborator"><input type="hidden" name="collaboratorId" value={c.id} /><SubmitButton secondary>移除协作分工</SubmitButton></Mutation></details>}</article>)}</div>
        {owner && active && available.length > 0 && <details className="edit-disclosure"><summary>＋ 安排协作</summary><Mutation task={task} operation="collaborator" label="安排协作"><div className="fields"><label>协作成员<select name="userId" required>{available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>交付期限<input type="date" name="collaboratorDueAt" /></label><label className="span-all">交付内容<input name="deliverable" required maxLength={500} placeholder="例如：提交未来 8 周的销售预测" /></label></div><div className="form-actions"><SubmitButton>安排协作</SubmitButton></div></Mutation></details>}
      </section>
      <section className="surface detail-section"><div className="section-heading"><h2>关键节点</h2><span className="muted small">{task.milestones.filter(m => m.done).length}/{task.milestones.length} 已完成</span></div><p className="section-help">节点帮助判断长期事项走到哪一步，完成节点不会自动结束任务。</p>
        {task.milestones.length ? <ul className="milestone-list">{task.milestones.map(m => <li key={m.id}><span className={`milestone-mark ${m.done ? "complete" : ""}`}>{m.done ? "✓" : "○"}</span><div><p>{m.title}</p><small className="muted">{dateLabel(m.dueAt)}</small></div>{owner && active && <Mutation task={task} operation="toggleMilestone"><input type="hidden" name="milestoneId" value={m.id} /><SubmitButton secondary>{m.done ? "重新开启" : "标记完成"}</SubmitButton></Mutation>}</li>)}</ul> : <p className="empty-inline">尚未设置关键节点。</p>}
        {owner && active && <details className="edit-disclosure"><summary>＋ 添加关键节点</summary><Mutation task={task} operation="milestone" label="添加关键节点"><div className="fields"><label>节点名称<input name="milestoneTitle" required maxLength={160} /></label><label>计划日期<input type="date" name="milestoneDueAt" /></label></div><div className="form-actions"><SubmitButton>添加节点</SubmitButton></div></Mutation></details>}
      </section>
      {writable && !task.archivedAt && <details className="surface edit-disclosure detail-section" id="details"><summary>任务资料与分工</summary><p className="section-help">填报成员可以维护任务资料和移交负责人，变更会留下记录。</p><Mutation task={task} operation="details" label="修改任务资料"><TaskFields members={members} keyResults={keyResults} currentUserId={user.id} task={task} /><div className="form-actions"><SubmitButton>保存任务资料</SubmitButton></div></Mutation>{closed(task) && <div className="archive-action"><p className="muted small">已结束的任务可归档，需要时可以恢复。</p><Mutation task={task} operation="archive"><SubmitButton secondary>归档任务</SubmitButton></Mutation></div>}</details>}
    </div><aside className="surface detail-section history-section"><h2>跟进记录</h2><p className="section-help">按时间保留更新、确认与分工变更。</p><ol className="history-list">{task.updates.map(u => <li key={u.id}><p className="muted small">{timeLabel(u.createdAt)} · {u.author?.name ?? "系统"}</p><span className="history-kind">{updateLabels[u.kind] ?? u.kind}</span><p className="history-body">{u.body}</p><HistorySnapshot raw={u.snapshot} /></li>)}</ol>{!task.updates.length && <p className="empty-inline">还没有跟进记录。</p>}</aside></div>
  </div>;
}
