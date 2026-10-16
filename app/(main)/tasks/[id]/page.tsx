import { independentDeliverables } from "@/lib/display";
import { Disclosure } from "@/components/ui/disclosure";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { taskMutationAction } from "@/lib/actions";
import { areaLabels, dateLabel, dateValue, timeLabel, today, updateLabels, type TaskRow } from "@/lib/tasks";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TaskBadges } from "@/components/ui/task-card";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Timeline } from "@/components/ui/timeline";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { MilestoneToggle } from "@/components/milestone-toggle";
import { BossTransferForm } from "@/components/boss-transfer-form";
import { TaskDetailsForm } from "@/components/transfer-confirmation";
import { ProgressForm } from "@/components/progress-form";
import { checkInStateLabels, periodKindLabels } from "@/lib/check-in";
import { loadTaskDetail } from "@/lib/task-detail-view";

export const dynamic = "force-dynamic";
function Mutation({ task, operation, children, label }: { task: TaskRow; operation: string; children: React.ReactNode; label?: string }) {
  return <ActionForm action={taskMutationAction} label={label}>
    <input type="hidden" name="taskId" value={task.id} />
    <input type="hidden" name="version" value={task.version} />
    <input type="hidden" name="operation" value={operation} />
    {children}
  </ActionForm>;
}
export default async function TaskDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const view = await loadTaskDetail(prisma, user, id, query);
  if (!view) notFound();
  const { returnQuery, backHref, task, members, keyResults, checkIns,
    owner, writable, currentWeekReportState, active, myContribution, available,
    taskClosed, overdueCollaboratorIds, deliveredCount,
    completedMilestoneCount } = view;
  const activeDeliverables = independentDeliverables(task.deliverables, task.collaborators);
  return <div className="page task-detail-page"><Link className="back-link" href={backHref}>← 全部事项</Link>
    <header className="page-heading detail-heading">
      <div>
        <TaskBadges task={task} full />
        <h1>{task.title}</h1>
        <p className="muted">{areaLabels[task.area]} · {task.owner.name}{task.scope ? ` · ${task.scope}` : ""}</p>
      </div>
    </header>
    {query.created && writable && <p className="form-success" role="status">事项已创建。主负责人可在下方安排协作与关键节点。</p>}
    {
      task.archivedAt
      && <div className="notice">事项已归档，历史记录保留。{
        owner
        && <Mutation task={task} operation="restore"><SubmitButton secondary>恢复归档事项</SubmitButton></Mutation>
      }
      </div>
    }
    {task.owner.role === "BOSS" && <p className="notice">这是原来分配给老板的历史事项。{user.role === "BOSS" ? "请在「移交负责人」中指定填报成员接手。" : "请联系老板移交给填报成员。"}</p>}
    {(task.health === "AT_RISK" || task.status === "BLOCKED") && !taskClosed && <Notice tone="risk">需要支持：{task.riskNote || "待主负责人补充"}</Notice>}
    {user.role === "BOSS" && <BossTransferForm task={task} members={members} />}
    <div className="detail-grid"><div className="detail-main">
      {
        owner && !task.archivedAt
        && <section className="surface detail-section detail-primary" id="update">
          <h2>{taskClosed ? "重新开启 / 调整结果" : "更新进展"}</h2>
          <p className="section-help">主负责人确认整体情况，协作者在自己的交付中更新。</p>
          <ProgressForm task={
            {
              id: task.id,
              version: task.version,
              status: task.status,
              health: task.health,
              nextAction: task.nextAction,
              riskNote: task.riskNote,
              nextFollowUpAt: dateValue(task.nextFollowUpAt),
              today: dateValue(today())
            }
          } />
        </section>
      }
      {writable && myContribution && active && <section className="surface detail-section detail-primary"><h2>我的交付</h2><p>{myContribution.deliverable}</p><p className="muted small">期限 {dateLabel(myContribution.dueAt)}</p><Mutation task={task} operation="contribution" label="更新我的协作"><ChoiceChips name="done" legend="交付状态" help="选择你负责的交付是否完成。例：已交付。" defaultValue={String(myContribution.done)} options={[{ value: "false", label: "推进中" }, { value: "true", label: "已交付" }]} /><div className="fields"><label className="span-all">我的进展<span className="field-hint">写自己已交付的部分，方便主负责人衔接。</span><textarea name="note" required maxLength={2000} defaultValue={myContribution.note} rows={2} placeholder="例：已提交未来 8 周销量预测" /></label></div><div className="form-actions"><SubmitButton>保存我的协作</SubmitButton></div></Mutation></section>}
      <section className="surface detail-section">
        <div className="section-heading">
          <h2>当前情况</h2>
          <span className="muted small">主负责人：{task.owner.name}</span>
        </div>
        <dl className="summary-grid">
          <div className="span-all"><dt>做到什么算完成</dt><dd>{task.completionCriteria || "待补充完成标准"}</dd></div>
          <div className="span-all"><dt>最新进展</dt><dd>{task.latestProgress || "尚未记录进展"}</dd></div>
          {
            !taskClosed && <div className="span-all"><dt>下一步</dt><dd>{task.nextAction || "待明确下一步动作"}</dd></div>
          }
          {
            task.riskNote
            && <div className="span-all"><dt>风险与支持</dt><dd className="risk-note">{task.riskNote}</dd></div>
          }
          <div><dt>完成期限</dt><dd>{dateLabel(task.dueAt)}</dd></div>
          <div><dt>下次跟进</dt><dd>{taskClosed ? "已结束，无需跟进" : dateLabel(task.nextFollowUpAt)}</dd></div>
          <div><dt>最近确认</dt><dd>{task.lastConfirmedAt ? timeLabel(task.lastConfirmedAt) : "尚未确认"}</dd></div>
          <div>
            <dt>关联目标</dt>
            <dd>
              {
                task.keyResult
                  ? <Link href={`/okrs/${task.keyResult.objectiveId}${returnQuery}`}>{task.keyResult.title}</Link>
                  : "未关联"
              }
            </dd>
          </div>
          <div>
            <dt>本周进展状态</dt>
            <dd>
              <span className={
                `badge ${currentWeekReportState === "UNREPORTED" ? "amber" : currentWeekReportState === "NO_CHANGE" ? "accent" : "good"}`
              }>
                {checkInStateLabels[currentWeekReportState]}
              </span>
            </dd>
          </div>
        </dl>
      </section>
      <section className="surface detail-section">
        <div className="section-heading">
          <h2>协作分工</h2>
          <span className="muted small">{deliveredCount}/{task.collaborators.length} 已交付</span>
        </div>
        {!task.collaborators.length && <p className="empty-inline">这项事项目前由主负责人独立推进。</p>}
        <div className="collaborator-list">
          {
            task.collaborators.map(
              c =>
                <article className="collaborator-item" key={c.id}>
                  <div className="section-heading">
                    <h3>{c.user.name}{c.userId === user.id ? " · 我的协作" : ""}</h3>
                    <span className={`badge ${c.done ? "good" : ""}`}>{c.done ? "已交付" : "待交付"}</span>
                  </div>
                  <p>{c.deliverable}</p>
                  <p className="muted small">交付期限：{dateLabel(c.dueAt)}
                    {overdueCollaboratorIds.has(c.id) ? " · 协作已逾期" : ""}
                  </p>
                  {c.note && <p className="contribution-note">{c.note}</p>}
                  {
                    owner && active
                    && <Disclosure className="inline-details" title={<>调整这项分工</>}>
                      <p className="muted small">移除后不再显示在协作清单中，历史记录保留。</p>
                      <Mutation task={task} operation="removeCollaborator">
                        <input type="hidden" name="collaboratorId" value={c.id} />
                        <Button variant="danger">移除协作分工</Button>
                      </Mutation>
                    </Disclosure>
                  }
                </article>
            )
          }
        </div>
        {
          owner && active && available.length > 0
          && <Disclosure className="edit-disclosure" title={<>＋ 安排协作</>}>
            <Mutation task={task} operation="collaborator" label="安排协作">
              <div className="fields">
                {available.length <= 6 ? <ChoiceChips name="userId" legend="协作成员" help="选需要一起推进的同事。" defaultValue={available[0]?.id} required options={available.map(m => ({ value: m.id, label: m.name }))} /> : <label>协作成员<span className="field-hint">选需要一起推进的同事。</span><select name="userId" required>{available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
                <label>交付期限<span className="field-hint">选对方交付的日期，可留空。例：本周五。</span><input type="date" name="collaboratorDueAt" /></label>
                <label className="span-all">交付内容<span className="field-hint">写对方需要交给你的具体结果。</span><input name="deliverable" required maxLength={500} placeholder="例：提交未来 8 周的销售预测" />
                </label>
              </div>
              <div className="form-actions"><SubmitButton>安排协作</SubmitButton></div>
            </Mutation>
          </Disclosure>
        }
      {activeDeliverables.length > 0 && <div className="other-deliveries">
        <h3>其他交付</h3>
        {
          activeDeliverables.length
            ? <div className="collaborator-list">
              {
                activeDeliverables.map(
                  item =>
                    <article className="collaborator-item" key={item.id}>
                      <div className="section-heading">
                        <h3>{item.title}</h3>
                        <span className={`badge ${item.done ? "good" : ""}`}>{item.done ? "已交付" : "待交付"}</span>
                      </div>
                      <p className="muted small">{item.owner?.name ?? "未指定负责人"} · 期限 {dateLabel(item.dueAt)}</p>
                      {item.note && <p className="contribution-note">{item.note}</p>}
                    </article>
                )
              }
            </div>
            : <p className="empty-inline">还没有独立交付物记录。协作交付仍列在上方。</p>
        }
      </div>}
      </section>
      <section className="surface detail-section">
        <div className="section-heading">
          <h2>关键节点</h2>
          <span className="muted small">{completedMilestoneCount}/{task.milestones.length} 已完成</span>
        </div>
        <p className="section-help">节点帮助判断长期事项走到哪一步，完成节点不会自动结束事项。</p>
        {
          task.milestones.length
            ? <ul className="milestone-list">
              {
                task.milestones.map(
                  m =>
                    <li key={m.id}>
                      <span className={`milestone-mark ${m.done ? "complete" : ""}`}>{m.done ? "✓" : "○"}</span>
                      <div><p>{m.title}</p><small className="muted">{dateLabel(m.dueAt)}</small></div>
                      {
                        owner && active
                        && <MilestoneToggle taskId={task.id} version={task.version} id={m.id} title={m.title} done={m.done} />
                      }
                    </li>
                )
              }
            </ul>
            : <p className="empty-inline">尚未设置关键节点。</p>
        }
        {
          owner && active
          && <Disclosure className="edit-disclosure" title={<>＋ 添加关键节点</>}>
            <Mutation task={task} operation="milestone" label="添加关键节点">
              <div className="fields">
                <label>节点名称<span className="field-hint">用一个结果标记推进阶段。</span><input name="milestoneTitle" required maxLength={160} placeholder="例：确认首批补货数量" /></label>
                <label>计划日期<span className="field-hint">预计达成节点的日期，可留空。例：本月月底。</span><input type="date" name="milestoneDueAt" /></label>
              </div>
              <div className="form-actions"><SubmitButton>添加节点</SubmitButton></div>
            </Mutation>
          </Disclosure>
        }
      </section>
      {
        owner && !task.archivedAt
        && <Disclosure className="surface edit-disclosure detail-section" id="details" title={<>事项资料与分工</>}>
          <p className="section-help">主负责人可以维护事项资料和移交负责人，变更会留下记录。</p>
          <TaskDetailsForm members={members} keyResults={keyResults} currentUserId={user.id} task={task} />
          {
            taskClosed
            && <div className="archive-action">
              <p className="muted small">已结束的事项可归档，需要时可以恢复。</p>
              <Mutation task={task} operation="archive"><Button variant="danger">归档事项</Button></Mutation>
            </div>
          }
        </Disclosure>
      }
    </div><aside className="surface detail-section history-section"><h2>动态</h2><p className="section-help">这件事的所有变化都记在这里。</p>
        <Timeline items={[
          ...checkIns.map(item => ({ id: `report-${item.id}`, who: item.author.name, action: `${periodKindLabels[item.period.kind]} · ${checkInStateLabels[item.status]}`, time: timeLabel(item.createdAt), body: [item.body, item.metricNote, item.blocker, item.nextStep].filter(Boolean).join("；"), at: item.createdAt.getTime() })),
          ...task.updates.map(item => ({ id: item.id, who: item.author?.name ?? "系统", action: updateLabels[item.kind] ?? "调整事项", time: timeLabel(item.createdAt), body: item.body, at: item.createdAt.getTime() })),
        ].sort((a, b) => b.at - a.at)} />
      </aside></div>
  </div>;
}
