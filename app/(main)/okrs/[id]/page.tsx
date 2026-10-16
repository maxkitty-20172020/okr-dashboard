import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { CheckInForm } from "@/components/check-in-form";
import { ProgressBar } from "@/components/progress-bar";
import { TaskCard } from "@/components/ui/task-card";
import { checkInStateLabels, reportStateLabel, periodKindLabels } from "@/lib/check-in";
import { hrefWithOverview } from "@/lib/overview";
import { loadObjectiveDetail } from "@/lib/objective-detail-view";
import { dateLabel, timeLabel } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function ObjectiveDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireSession();
  const { id } = await params;
  const view = await loadObjectiveDetail(prisma, user, id, await searchParams);
  if (!view) notFound();
  const { tree, periodSearch, query, backHref, objective, tasks, checkIns,
    canWriteObjective, krFlags, achievement, deliverables, objectiveState, keyResultViews } = view;

  return <div className="page">
    <Link className="back-link" href={backHref}>← 返回每周进展</Link>
    <header className="page-heading detail-heading">
      <div>
        <p className="eyebrow">{objective.cycle} · {objective.owner.name}{objective.period ? ` · ${objective.period.label}` : ""}</p>
        <h1>{objective.title}</h1>
        <p className="muted">{objective.description || "查看关键结果，以及为这个目标推进的事项。"}</p>
      </div>
      {
        user.role === "BOSS"
          ? <span className="readonly-label">只看不改</span>
          : <span className={
            `badge ${objectiveState === "UNREPORTED" ? "amber" : objectiveState === "NO_CHANGE" ? "accent" : "good"}`
          }>
            {reportStateLabel(objectiveState, "OBJECTIVE")}
          </span>
      }
    </header>

    <section className="stats-grid" aria-label="目标达成">
      <div className="stat"><span>业务指标达成度</span><strong>{Math.round(achievement)}%</strong><small>按指标进度，不是任务完成率</small></div>
      <Link className="stat" href={hrefWithOverview("/tasks", periodSearch)}><span>关联任务</span><strong>{tasks.length}</strong><small>含例行任务以外的目标事项</small></Link>
      <div className="stat"><span>交付物</span><strong>{deliverables.length}</strong><small>事项下的交付记录</small></div>
      <div className="stat">
        <span>本周期汇报</span>
        <strong>{reportStateLabel(objectiveState, "OBJECTIVE")}</strong>
        <small>{periodKindLabels[tree.selected.kind]} {tree.selected.label}</small>
      </div>
    </section>

    {
      canWriteObjective
      && <section className="surface detail-section">
        <h2>目标{periodKindLabels[tree.selected.kind]}</h2>
        <p className="section-help">季评估通常写在目标范围。没有变化也可以确认，系统会保留本季评估记录。</p>
        <CheckInForm periodId={tree.selected.id} scopeType="OBJECTIVE" scopeId={objective.id} />
      </section>
    }

    {(tasks.length > 0 || deliverables.length > 0) && <section className="section-block">
      <div className="section-heading"><h2>为这个目标在推进的事项</h2><Link href={hrefWithOverview("/tasks", periodSearch)}>任务清单 →</Link></div>
      {
        tasks.length
          ? <div className="task-grid">
            {tasks.map(task => <TaskCard key={task.id} task={task} query={query} description={task.riskNote || task.latestProgress} />)}
          </div>
          : <p className="empty-inline">还没有挂到这个目标下的任务。</p>
      }
      {
        deliverables.length > 0
        && <div className="collaborator-list" style={{ marginTop: 16 }}>
          {
            deliverables.map(
              item =>
                <article className="collaborator-item" key={item.id}>
                  <div className="section-heading">
                    <h3>{item.title}</h3>
                    <span className={`badge ${item.done ? "good" : ""}`}>{item.done ? "已交付" : "待交付"}</span>
                  </div>
                  <p className="muted small">
                    <Link href={`/tasks/${item.taskId}${query}`}>{item.taskTitle}</Link> · {item.owner?.name ?? "未指定"} · {dateLabel(item.dueAt)}
                  </p>
                </article>
            )
          }
        </div>
      }
    </section>}

    {objective.keyResults.length > 0 && <section className="section-block">
      <div className="section-heading"><h2>关键结果</h2></div>
      <div className="goal-grid">{objective.keyResults.map((keyResult, index) => {
        const { state, related, progress } = keyResultViews.get(keyResult.id)!;
        return <article key={keyResult.id} className="surface detail-section">
          <div className="section-heading">
            <h3>{keyResult.title}</h3>
            <span className={`badge ${state === "UNREPORTED" ? "amber" : state === "NO_CHANGE" ? "accent" : "good"}`}>
              {reportStateLabel(state, "KEY_RESULT")}
            </span>
          </div>
          <p className="muted small">
            {keyResult.direction === "DECREASE" ? "降低" : "提升"} · 当前 {
              keyResult.currentValue
            } / 目标 {keyResult.targetValue} {keyResult.unit} · 起点 {keyResult.baselineValue}
          </p>
          <ProgressBar value={progress} />
          <p className="muted small">关联任务 {related.length} · 工作包 {keyResult.workPackages.length}</p>
          {krFlags[index] && <CheckInForm periodId={tree.selected.id} scopeType="KEY_RESULT" scopeId={keyResult.id} compact />}
        </article>;
      })}</div>
    </section>}

    {checkIns.length > 0 && <section className="surface detail-section">
      <h2>进展历史</h2>
      <p className="section-help">按提交时间保留。提交复盘或评估后，这里就会显示记录。</p>
      <ol className="history-list">
        {
          checkIns.map(
            item =>
              <li key={item.id}>
                <p className="muted small">
                  {timeLabel(item.createdAt)} · {
              item.author.name
            } · {item.scopeType === "OBJECTIVE" ? "目标" : "关键结果"} · {periodKindLabels[item.period.kind]} {item.period.label}
                </p>
                <span className="history-kind">{checkInStateLabels[item.status]}</span>
                <p className="history-body">{item.body}</p>
              </li>
          )
        }
      </ol>
    </section>}
  </div>;
}
