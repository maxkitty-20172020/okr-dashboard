import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/ui/task-card";
import { CheckInForm } from "@/components/check-in-form";
import { NoChangeButton } from "@/components/progress-form";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ProgressBar } from "@/components/progress-bar";
import { reportStateLabel, expectedCheckInScope, periodKindLabels, scopeTypeLabels } from "@/lib/check-in";
import { exceptionLabels, hrefWithOverview } from "@/lib/overview";
import { WeekBand } from "@/components/ui/week-band";
import { StatusBadge } from "@/components/ui/status-badge";
import { weeklyOverview } from "@/lib/redesign-view";
import { loadOverview } from "@/lib/overview-service";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  const view = await loadOverview(prisma, user, await searchParams);
  const { tree, search, query, unreported, myUnreported, otherUnreported,
    exceptions, visibleTasks, visibleObjectives, completion, achievement, boss,
    tasks, kindHelp, objectiveViews, keyResultStates, activeTaskCount,
  } = view;
  const week = search.kind === "WEEK" ? weeklyOverview(view, user) : null;
  const extraReports = week?.extraReports ?? [];

  return <div className="page">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{boss ? "部门全貌" : "周期工作台"} · {periodKindLabels[search.kind]}</p>
        <h1>每周进展</h1>
        <p className="muted">{search.kind === "WEEK" ? "按成员看还没写的事项。更新进展或确认暂无变化，会自动记录本周进展。" : `月度看关键结果、季度看目标。${kindHelp}`}</p>
      </div>
      {boss ? <span className="readonly-label">只看不改</span> : <Link className="button" href="/tasks/new">＋ 记一件事</Link>}
    </header>

    <PeriodSwitcher pathname="/overview" search={search} tree={tree} />

    {week && <>
      <WeekBand {...week} boss={boss} />
      {week.groups.length > 0 && <section className="section-block" aria-label="按成员分组的还没写事项">
        <div className="section-heading"><h2>还没写 <span className="count" data-testid="weekly-missing">{week.pending.length}</span></h2><span className="muted small">仅主负责人可一键确认自己的事项</span></div>
        <div className="member-pending-groups">{week.groups.map(group => <details open className="pending-group" key={group.ownerId} data-owner={group.ownerId}>
          <summary>{group.ownerName} <span className="count">还没写 {group.items.length}</span></summary>
          <div className="task-grid unreported-list">{group.items.map(item => {
            const task = tasks.find(task => task.id === item.id)!;
            return <TaskCard key={item.id} task={task} query={query} description={task.riskNote || task.latestProgress} action={item.canConfirm ? <div className="form-actions"><NoChangeButton taskId={item.id} version={item.version} /><Link className="text-link" href={`${item.href}#update`}>更新进展</Link></div> : undefined} />;
          })}</div>
        </details>)}</div>
      </section>}
    </>}

    <section className="stats-grid" aria-label="周期结果">
      <div className="stat"><span>事项推进进度</span><strong>{Math.round(completion)}%</strong><small>含例行任务，不含已取消 / 已归档</small></div>
      <div className="stat"><span>业务指标达成度</span><strong>{Math.round(achievement)}%</strong><small>看业务指标达到目标的程度</small></div>
      <Link className="stat" href={hrefWithOverview("/tasks", search)}><span>本周期任务</span><strong>{activeTaskCount}</strong><small>未结束 · 可下钻清单</small></Link>
      <Link className="stat" href={hrefWithOverview("/overview", { ...search, exception: "unreported" })}>
        <span>{reportStateLabel("UNREPORTED", expectedCheckInScope(search.kind))}</span>
        <strong>{unreported.length}</strong>
        <small>
          {scopeTypeLabels[expectedCheckInScope(search.kind)]}范围 · {reportStateLabel("UNREPORTED", expectedCheckInScope(search.kind))}
        </small>
      </Link>
    </section>

    {week && !boss && extraReports.length > 0 && <details className="edit-disclosure surface detail-section"><summary>其他可提交的复盘与确认</summary><div className="unreported-list">{extraReports.map(item => <article key={`${item.scopeType}:${item.scopeId}`}><UnreportedRow item={item} /><CheckInForm periodId={tree.selected.id} scopeType={item.scopeType} scopeId={item.scopeId} compact /></article>)}</div></details>}

    <section className="exception-chips" aria-label="异常下钻">
      {(Object.keys(exceptionLabels) as (keyof typeof exceptionLabels)[]).map(key => {
        const active = search.exception === key;
        const href = hrefWithOverview("/tasks", { ...search, exception: active ? undefined : key });
        return <Link key={key} href={href} className={`chip ${active ? "active" : ""} ${key === "risk" || key === "overdue" ? "warn" : ""}`}>
          {key === "unreported" ? reportStateLabel("UNREPORTED", expectedCheckInScope(search.kind)) : key === "pending" ? "待更新" : exceptionLabels[key]} <strong>{exceptions[key]}</strong>
        </Link>;
      })}
      {search.exception && <Link className="text-link" href={hrefWithOverview("/overview", { ...search, exception: undefined })}>清除异常筛选</Link>}
    </section>

    {visibleObjectives.length > 0 && <section className="section-block">
      <div className="section-heading">
        <h2>目标与关键结果</h2>
        <Link href={hrefWithOverview("/okrs", search)}>目标看板 →</Link>
      </div>
      <div className="goal-grid">{visibleObjectives.map(objective => {
        const { rate, related, objectiveState } = objectiveViews.get(objective.id)!;
        return <article key={objective.id} className="surface detail-section">
          <p className="muted small">{objective.cycle} · {objective.owner.name}</p>
          <h3><Link href={`/okrs/${objective.id}${query}`}>{objective.title}</Link></h3>
          <p className="section-help">{objective.description || "下钻可查看关联任务、交付物与汇报历史。"}</p>
          <ProgressBar value={rate} />
          <p className="muted small">业务指标达成度 {Math.round(rate)}% · 关联任务 {related.length} · {reportStateLabel(objectiveState, "OBJECTIVE")}</p>
          <ul className="goal-kr-list">{objective.keyResults.map(keyResult => {
            const state = keyResultStates.get(keyResult.id)!;
            return <li key={keyResult.id}>
              <span>{keyResult.title}</span>
              <span className={`badge ${state === "UNREPORTED" ? "amber" : state === "NO_CHANGE" ? "accent" : "good"}`}>
                {reportStateLabel(state, "KEY_RESULT")}
              </span>
            </li>;
          })}</ul>
          {
            related.length > 0
            && <p className="collab-summary">关联任务：{
              related.slice(0, 4).map(
                task => <Link key={task.id} href={`/tasks/${task.id}${query}`}>{task.title}</Link>
              )
            }
              {related.length > 4 ? ` 等 ${related.length} 项` : ""}
            </p>
          }
        </article>;
      })}</div>
    </section>}

    {!week && <section className="section-block">
      <div className="section-heading">
        <h2>{boss ? "待补充进展与复盘" : "待我汇报"}</h2>
        <span className="muted small">本周更新进展即视为已汇报</span>
      </div>
      {boss ? (
        unreported.length
          ? <div className="unreported-list">
            {unreported.map(item => <UnreportedRow key={`${item.scopeType}:${item.scopeId}`} item={item} />)}
          </div>
          : <div className="quiet-state">
            <StatusBadge tone="ok">本周期进展已记录</StatusBadge>
            <p>已提交或确认暂无变化的范围不会出现在这里。</p>
          </div>
      ) : (
        <>
          {
            myUnreported.length
              ? <div className="unreported-list">
                {
                  myUnreported.map(
                    item =>
                      <article key={`${item.scopeType}:${item.scopeId}`} className="surface detail-section">
                        <UnreportedRow item={item} />
                        {item.scopeType === "TASK" ? <div className="form-actions">
                          {tasks.find(task => task.id === item.scopeId && task.ownerId === user.id && !task.archivedAt && task.status !== "DONE" && task.status !== "CANCELLED") && <NoChangeButton taskId={item.scopeId} version={tasks.find(task => task.id === item.scopeId)!.version} />}
                          <Link href={`/tasks/${item.scopeId}${query}#update`}>更新进展</Link>
                        </div> : <CheckInForm periodId={tree.selected.id} scopeType={item.scopeType} scopeId={item.scopeId} compact />}
                      </article>
                  )
                }
              </div>
              : <div className="quiet-state">
                <span className="badge good">你需要提交的进展与复盘已记录</span>
                <p>你负责汇报或督办确认的事项，在本周期都已提交或确认暂无变化。</p>
              </div>
          }
          {
            otherUnreported.length > 0
            && <details className="edit-disclosure">
              <summary>部门其他待补充事项（{otherUnreported.length}）</summary>
              <div className="unreported-list">
                {
                  otherUnreported.map(item => <UnreportedRow key={`${item.scopeType}:${item.scopeId}`} item={item} />)
                }
              </div>
            </details>
          }
        </>
      )}
    </section>}

    {visibleTasks.length > 0 && <section className="section-block">
      <div className="section-heading">
        <h2>本周期任务 <span className="count">{visibleTasks.length}</span></h2>
        <Link href={hrefWithOverview("/tasks", search)}>打开筛选后的任务清单 →</Link>
      </div>
      <div className="task-grid">
            {
              visibleTasks.slice(0, 8).map(
                task => <TaskCard key={task.id} task={task} query={query} description={task.riskNote || task.latestProgress} />
              )
            }
          </div>
    </section>}
  </div>;
}

function UnreportedRow({ item }: { item: { href: string; title: string; ownerName: string; scopeType: string; subtitle?: string } }) {
  return <div className="unreported-row">
    <span className="badge amber">{reportStateLabel("UNREPORTED", item.scopeType as keyof typeof scopeTypeLabels)}</span>
    <div>
      <Link href={item.href}>{item.title}</Link>
      <p className="muted small">
        {scopeTypeLabels[item.scopeType as keyof typeof scopeTypeLabels]} · {item.ownerName}
        {item.subtitle ? ` · ${item.subtitle}` : ""}
      </p>
    </div>
  </div>;
}
