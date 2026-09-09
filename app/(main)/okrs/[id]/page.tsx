import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { CheckInForm } from "@/components/check-in-form";
import { ProgressBar } from "@/components/progress-bar";
import { TaskCard } from "@/components/task-card";
import { canAuthorCheckIn, checkInReportState, checkInStateLabels, periodKindLabels, scopeKey } from "@/lib/check-in";
import { hrefWithOverview, overviewQuery, overviewTaskInclude, parseOverviewSearch, resolveSelectedPeriod } from "@/lib/overview";
import { keyResultAchievementRate, progressPercent } from "@/lib/okr";
import { dateLabel, publicUser, timeLabel } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function ObjectiveDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  const { id } = await params;
  const search = parseOverviewSearch(await searchParams);
  const tree = await resolveSelectedPeriod(prisma, search);
  const periodSearch = { ...search, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(periodSearch);
  const backHref = hrefWithOverview("/overview", periodSearch);
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: publicUser },
      period: true,
      keyResults: { orderBy: { createdAt: "asc" }, include: { workPackages: { include: { deliverables: true } } } },
    },
  });
  if (!objective) notFound();
  const [tasks, checkIns] = await Promise.all([
    prisma.task.findMany({ where: { archivedAt: null, keyResult: { objectiveId: objective.id } }, include: overviewTaskInclude }),
    prisma.checkIn.findMany({
      where: {
        OR: [
          { scopeType: "OBJECTIVE", scopeId: objective.id },
          { scopeType: "KEY_RESULT", scopeId: { in: objective.keyResults.map(item => item.id) } },
        ],
      },
      include: { author: { select: { name: true } }, period: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latestByScope = new Map<string, (typeof checkIns)[number]>();
  for (const row of checkIns.filter(item => item.periodId === tree.selected.id)) {
    const key = scopeKey(row.scopeType, row.scopeId);
    if (!latestByScope.has(key)) latestByScope.set(key, row);
  }
  const canWriteObjective = await canAuthorCheckIn(prisma, user, "OBJECTIVE", objective.id);
  const krFlags = await Promise.all(objective.keyResults.map(item => canAuthorCheckIn(prisma, user, "KEY_RESULT", item.id)));
  const achievement = keyResultAchievementRate(objective.keyResults);
  const deliverables = tasks.flatMap(task => task.deliverables.map(item => ({ ...item, taskTitle: task.title, taskId: task.id })));
  const objectiveState = checkInReportState(latestByScope.get(scopeKey("OBJECTIVE", objective.id)));

  return <div className="page">
    <Link className="back-link" href={backHref}>← 返回周期汇报</Link>
    <header className="page-heading detail-heading">
      <div>
        <p className="eyebrow">{objective.cycle} · {objective.owner.name}{objective.period ? ` · ${objective.period.label}` : ""}</p>
        <h1>{objective.title}</h1>
        <p className="muted">{objective.description || "从目标下钻到关键结果、任务、交付物和 Check-in。"}</p>
      </div>
      {user.role === "BOSS" ? <span className="readonly-label">老板账号 · 只读</span> : <span className={`badge ${objectiveState === "UNREPORTED" ? "amber" : objectiveState === "NO_CHANGE" ? "accent" : "good"}`}>{checkInStateLabels[objectiveState]}</span>}
    </header>

    <section className="stats-grid" aria-label="目标达成">
      <div className="stat"><span>KR 达成率</span><strong>{Math.round(achievement)}%</strong><small>按指标进度，不是任务完成率</small></div>
      <Link className="stat" href={hrefWithOverview("/tasks", periodSearch)}><span>关联任务</span><strong>{tasks.length}</strong><small>含例行任务以外的目标事项</small></Link>
      <div className="stat"><span>交付物</span><strong>{deliverables.length}</strong><small>任务下的 Deliverable</small></div>
      <div className="stat"><span>本周期汇报</span><strong>{checkInStateLabels[objectiveState]}</strong><small>{periodKindLabels[tree.selected.kind]} {tree.selected.label}</small></div>
    </section>

    {canWriteObjective && <section className="surface detail-section"><h2>目标{periodKindLabels[tree.selected.kind]}</h2><p className="section-help">季评估通常写在目标范围。确认暂无变化会留下记录，不会变成未汇报。</p><CheckInForm periodId={tree.selected.id} scopeType="OBJECTIVE" scopeId={objective.id} /></section>}

    <section className="section-block">
      <div className="section-heading"><h2>关键结果</h2></div>
      <div className="goal-grid">{objective.keyResults.map((keyResult, index) => {
        const state = checkInReportState(latestByScope.get(scopeKey("KEY_RESULT", keyResult.id)));
        const related = tasks.filter(task => task.keyResultId === keyResult.id);
        return <article key={keyResult.id} className="surface detail-section">
          <div className="section-heading"><h3>{keyResult.title}</h3><span className={`badge ${state === "UNREPORTED" ? "amber" : state === "NO_CHANGE" ? "accent" : "good"}`}>{checkInStateLabels[state]}</span></div>
          <p className="muted small">{keyResult.direction === "DECREASE" ? "降低" : "提升"} · 当前 {keyResult.currentValue} / 目标 {keyResult.targetValue} {keyResult.unit} · 起点 {keyResult.baselineValue}</p>
          <ProgressBar value={progressPercent(keyResult.currentValue, keyResult.targetValue, keyResult.baselineValue, keyResult.direction)} />
          <p className="muted small">关联任务 {related.length} · 工作包 {keyResult.workPackages.length}</p>
          {krFlags[index] && <CheckInForm periodId={tree.selected.id} scopeType="KEY_RESULT" scopeId={keyResult.id} compact />}
        </article>;
      })}</div>
      {!objective.keyResults.length && <p className="empty-inline">这个目标还没有关键结果。</p>}
    </section>

    <section className="section-block">
      <div className="section-heading"><h2>关联任务与交付</h2><Link href={hrefWithOverview("/tasks", periodSearch)}>任务清单 →</Link></div>
      {tasks.length ? <div className="task-grid">{tasks.map(task => <TaskCard key={task.id} task={task} userId={user.id} query={query} />)}</div> : <p className="empty-inline">还没有挂到这个目标下的任务。</p>}
      {deliverables.length > 0 && <div className="collaborator-list" style={{ marginTop: 16 }}>{deliverables.map(item => <article className="collaborator-item" key={item.id}><div className="section-heading"><h3>{item.title}</h3><span className={`badge ${item.done ? "good" : ""}`}>{item.done ? "已交付" : "待交付"}</span></div><p className="muted small"><Link href={`/tasks/${item.taskId}${query}`}>{item.taskTitle}</Link> · {item.owner?.name ?? "未指定"} · {dateLabel(item.dueAt)}</p></article>)}</div>}
    </section>

    <section className="surface detail-section">
      <h2>Check-in 历史</h2>
      <p className="section-help">按提交时间保留。没有行就是未汇报。</p>
      <ol className="history-list">{checkIns.map(item => <li key={item.id}><p className="muted small">{timeLabel(item.createdAt)} · {item.author.name} · {item.scopeType === "OBJECTIVE" ? "目标" : "关键结果"} · {periodKindLabels[item.period.kind]} {item.period.label}</p><span className="history-kind">{checkInStateLabels[item.status]}</span><p className="history-body">{item.body}</p></li>)}</ol>
      {!checkIns.length && <p className="empty-inline">这个目标还没有周期汇报。</p>}
    </section>
  </div>;
}
