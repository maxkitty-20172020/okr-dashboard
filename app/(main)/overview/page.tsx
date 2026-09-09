import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/task-card";
import { CheckInForm } from "@/components/check-in-form";
import { PeriodSwitcher } from "@/components/period-switcher";
import { ProgressBar } from "@/components/progress-bar";
import {
  canAuthorCheckIn,
  checkInReportState,
  checkInStateLabels,
  expectedCheckInScope,
  latestCheckInMap,
  periodKindLabels,
  scopeKey,
  scopeTypeLabels,
  unreportedScopeIds,
} from "@/lib/check-in";
import { keyResultAchievementRate, taskCompletionRate } from "@/lib/okr";
import {
  countTaskExceptions,
  expectedTargets,
  hrefWithOverview,
  objectivesForQuarter,
  overviewQuery,
  parseOverviewSearch,
  relatedTaskIdsForUnreported,
  resolveSelectedPeriod,
  taskExceptionMatch,
  tasksInPeriod,
} from "@/lib/overview";
import { closed } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  const raw = parseOverviewSearch(await searchParams);
  const tree = await resolveSelectedPeriod(prisma, raw);
  const search = { ...raw, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(search);
  const [tasks, objectives, checkIns] = await Promise.all([
    tasksInPeriod(prisma, tree.selected, tree.quarter.id),
    objectivesForQuarter(prisma, tree.quarter.id),
    latestCheckInMap(prisma, tree.selected.id),
  ]);
  const keyResults = objectives.flatMap(objective => objective.keyResults);
  const expected = expectedTargets(search.kind, tasks, objectives, search);
  const missingIds = new Set(await unreportedScopeIds(prisma, tree.selected.id, expectedCheckInScope(search.kind), expected.map(item => item.scopeId)));
  const unreported = expected.filter(item => missingIds.has(item.scopeId));
  const writableFlags = await Promise.all(unreported.map(item => canAuthorCheckIn(prisma, user, item.scopeType, item.scopeId)));
  const myUnreported = unreported.filter((_, index) => writableFlags[index]);
  const otherUnreported = unreported.filter((_, index) => !writableFlags[index]);
  const reportStateForTask = (task: (typeof tasks)[number]) => {
    if (expectedCheckInScope(search.kind) === "TASK") return checkInReportState(checkIns.get(scopeKey("TASK", task.id)));
    if (expectedCheckInScope(search.kind) === "KEY_RESULT") return checkInReportState(task.keyResultId ? checkIns.get(scopeKey("KEY_RESULT", task.keyResultId)) : undefined);
    return checkInReportState(task.keyResult ? checkIns.get(scopeKey("OBJECTIVE", task.keyResult.objectiveId)) : undefined);
  };
  const exceptions = countTaskExceptions(tasks, reportStateForTask);
  exceptions.unreported = unreported.length;
  const relatedUnreportedTasks = relatedTaskIdsForUnreported(search.kind, tasks, missingIds);
  const visibleTasks = tasks.filter(task => {
    if (search.person && task.ownerId !== search.person && !task.collaborators.some(row => row.userId === search.person)) return false;
    if (search.exception === "unreported") return relatedUnreportedTasks.has(task.id);
    return taskExceptionMatch(task, search.exception, reportStateForTask(task));
  });
  const visibleObjectives = objectives.filter(objective => {
    if (!search.exception) return true;
    if (search.exception === "unreported") {
      if (search.kind === "QUARTER") return missingIds.has(objective.id);
      if (search.kind === "MONTH") return objective.keyResults.some(keyResult => missingIds.has(keyResult.id));
      return objective.keyResults.some(keyResult => tasks.some(task => task.keyResultId === keyResult.id && relatedUnreportedTasks.has(task.id)));
    }
    return visibleTasks.some(task => task.keyResult?.objectiveId === objective.id);
  });
  const completion = taskCompletionRate(tasks);
  const achievement = keyResultAchievementRate(keyResults);
  const boss = user.role === "BOSS";
  const kindHelp = search.kind === "WEEK" ? "本周按任务范围汇报。" : search.kind === "MONTH" ? "本月按关键结果复盘。" : "本季按目标评估。";

  return <div className="page">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{boss ? "部门全貌" : "周期工作台"} · {periodKindLabels[search.kind]}</p>
        <h1>{boss ? "从目标与异常下钻到任务" : "本周期该汇报的事项"}</h1>
        <p className="muted">{kindHelp}没有对应 Check-in 就是未汇报，系统不会代写空记录。确认暂无变化与未汇报不是一回事。任务完成率与 KR 达成率分开看。</p>
      </div>
      {boss ? <span className="readonly-label">老板账号 · 只读</span> : <Link className="button" href="/tasks/new">＋ 新建任务</Link>}
    </header>

    <PeriodSwitcher pathname="/overview" search={search} tree={tree} />

    <section className="stats-grid" aria-label="周期结果">
      <div className="stat"><span>任务完成率</span><strong>{Math.round(completion)}%</strong><small>含例行任务，不含已取消 / 已归档</small></div>
      <div className="stat"><span>KR 达成率</span><strong>{Math.round(achievement)}%</strong><small>按指标进度，不是任务完成率</small></div>
      <Link className="stat" href={hrefWithOverview("/tasks", search)}><span>本周期任务</span><strong>{tasks.filter(task => !closed(task)).length}</strong><small>未结束 · 可下钻清单</small></Link>
      <Link className="stat" href={hrefWithOverview("/overview", { ...search, exception: "unreported" })}><span>未汇报</span><strong>{unreported.length}</strong><small>{scopeTypeLabels[expectedCheckInScope(search.kind)]}范围 · {checkInStateLabels.UNREPORTED}</small></Link>
    </section>

    <section className="exception-chips" aria-label="异常下钻">
      {(Object.keys(exceptionChipLabels) as (keyof typeof exceptionChipLabels)[]).map(key => {
        const active = search.exception === key;
        const href = hrefWithOverview("/tasks", { ...search, exception: active ? undefined : key });
        return <Link key={key} href={href} className={`chip ${active ? "active" : ""} ${key === "risk" || key === "overdue" ? "warn" : ""}`}>
          {exceptionChipLabels[key]} <strong>{exceptions[key]}</strong>
        </Link>;
      })}
      {search.exception && <Link className="text-link" href={hrefWithOverview("/overview", { ...search, exception: undefined })}>清除异常筛选</Link>}
    </section>

    <section className="section-block">
      <div className="section-heading">
        <h2>目标与关键结果</h2>
        <Link href={hrefWithOverview("/okrs", search)}>目标看板 →</Link>
      </div>
      {visibleObjectives.length ? <div className="goal-grid">{visibleObjectives.map(objective => {
        const rate = keyResultAchievementRate(objective.keyResults);
        const related = tasks.filter(task => task.keyResult?.objectiveId === objective.id);
        const objectiveState = checkInReportState(checkIns.get(scopeKey("OBJECTIVE", objective.id)));
        return <article key={objective.id} className="surface detail-section">
          <p className="muted small">{objective.cycle} · {objective.owner.name}</p>
          <h3><Link href={`/okrs/${objective.id}${query}`}>{objective.title}</Link></h3>
          <p className="section-help">{objective.description || "下钻可查看关联任务、交付物与汇报历史。"}</p>
          <ProgressBar value={rate} />
          <p className="muted small">KR 达成率 {Math.round(rate)}% · 关联任务 {related.length} · {checkInStateLabels[objectiveState]}</p>
          <ul className="goal-kr-list">{objective.keyResults.map(keyResult => {
            const state = checkInReportState(checkIns.get(scopeKey("KEY_RESULT", keyResult.id)));
            return <li key={keyResult.id}><span>{keyResult.title}</span><span className={`badge ${state === "UNREPORTED" ? "amber" : state === "NO_CHANGE" ? "accent" : "good"}`}>{checkInStateLabels[state]}</span></li>;
          })}</ul>
          {related.length > 0 && <p className="collab-summary">关联任务：{related.slice(0, 4).map(task => <Link key={task.id} href={`/tasks/${task.id}${query}`}>{task.title}</Link>)}{related.length > 4 ? ` 等 ${related.length} 项` : ""}</p>}
        </article>;
      })}</div> : <div className="quiet-state"><p>这个周期还没有可下钻的目标，或当前异常筛选下没有匹配项。</p></div>}
    </section>

    <section className="section-block">
      <div className="section-heading">
        <h2>{boss ? "未汇报范围" : "待我汇报"}</h2>
        <span className="muted small">{checkInStateLabels.UNREPORTED} ≠ {checkInStateLabels.NO_CHANGE}</span>
      </div>
      {boss ? (
        unreported.length ? <div className="unreported-list">{unreported.map(item => <UnreportedRow key={`${item.scopeType}:${item.scopeId}`} item={item} />)}</div> : <div className="quiet-state"><span className="badge good">本周期没有未汇报项</span><p>已提交或确认暂无变化的范围不会出现在这里。</p></div>
      ) : (
        <>
          {myUnreported.length ? <div className="unreported-list">{myUnreported.map(item => <article key={`${item.scopeType}:${item.scopeId}`} className="surface detail-section">
            <UnreportedRow item={item} />
            <CheckInForm periodId={tree.selected.id} scopeType={item.scopeType} scopeId={item.scopeId} compact />
          </article>)}</div> : <div className="quiet-state"><span className="badge good">没有需要你提交的未汇报项</span><p>你主责或担任 RACI 负责人 / 问责人的范围，在本周期都已提交或确认暂无变化。</p></div>}
          {otherUnreported.length > 0 && <details className="edit-disclosure"><summary>部门其他未汇报（{otherUnreported.length}）</summary><div className="unreported-list">{otherUnreported.map(item => <UnreportedRow key={`${item.scopeType}:${item.scopeId}`} item={item} />)}</div></details>}
        </>
      )}
    </section>

    <section className="section-block">
      <div className="section-heading">
        <h2>本周期任务 <span className="count">{visibleTasks.length}</span></h2>
        <Link href={hrefWithOverview("/tasks", search)}>打开筛选后的任务清单 →</Link>
      </div>
      {visibleTasks.length ? <div className="task-grid">{visibleTasks.slice(0, 8).map(task => <TaskCard key={task.id} task={task} userId={user.id} query={query} />)}</div> : <p className="empty-inline">当前筛选下没有任务。可清除异常芯片或换一个周期。</p>}
    </section>
  </div>;
}

const exceptionChipLabels = {
  risk: "风险",
  overdue: "逾期",
  unreported: "未汇报",
  pending: "待确认",
} as const;

function UnreportedRow({ item }: { item: { href: string; title: string; ownerName: string; scopeType: string; subtitle?: string } }) {
  return <div className="unreported-row">
    <span className="badge amber">{checkInStateLabels.UNREPORTED}</span>
    <div>
      <Link href={item.href}>{item.title}</Link>
      <p className="muted small">{scopeTypeLabels[item.scopeType as keyof typeof scopeTypeLabels]} · {item.ownerName}{item.subtitle ? ` · ${item.subtitle}` : ""}</p>
    </div>
  </div>;
}
