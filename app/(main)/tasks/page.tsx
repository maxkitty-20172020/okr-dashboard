import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/task-card";
import { PeriodSwitcher } from "@/components/period-switcher";
import { areaLabels, closed, followUpState, needsAttention, publicUser, sortTasks, today } from "@/lib/tasks";
import { CHECKIN_UNREPORTED, checkInReportState, expectedCheckInScope, latestCheckInMap, scopeKey, unreportedScopeIds } from "@/lib/check-in";
import {
  expectedTargets,
  hrefWithOverview,
  objectivesForQuarter,
  overviewQuery,
  overviewTaskInclude,
  parseOverviewSearch,
  relatedTaskIdsForUnreported,
  resolveSelectedPeriod,
  taskExceptionMatch,
  tasksInPeriod,
  type OverviewTask,
} from "@/lib/overview";

export const dynamic = "force-dynamic";
type Params = { q?: string; person?: string; area?: string; filter?: string; relation?: string; kind?: string; period?: string; exception?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireSession();
  const params = await searchParams;
  const search = parseOverviewSearch(params);
  const hasPeriodView = Boolean(params.kind || params.period || params.exception);
  const archived = params.filter === "archived";
  const tree = hasPeriodView ? await resolveSelectedPeriod(prisma, search) : null;
  const periodSearch = tree ? { ...search, kind: tree.selected.kind, period: tree.selected.label } : search;
  const query = overviewQuery(periodSearch);
  const [all, members, periodTasks, objectives, checkIns] = await Promise.all([
    hasPeriodView ? Promise.resolve([] as OverviewTask[]) : prisma.task.findMany({ where: params.filter === "done" ? {} : { archivedAt: archived ? { not: null } : null }, include: overviewTaskInclude }),
    prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    tree ? tasksInPeriod(prisma, tree.selected, tree.quarter.id) : Promise.resolve([] as OverviewTask[]),
    tree ? objectivesForQuarter(prisma, tree.quarter.id) : Promise.resolve([]),
    tree ? latestCheckInMap(prisma, tree.selected.id) : Promise.resolve(new Map()),
  ]);
  const expected = tree ? expectedTargets(periodSearch.kind, periodTasks, objectives, periodSearch) : [];
  const missingIds = tree ? new Set(await unreportedScopeIds(prisma, tree.selected.id, expectedCheckInScope(periodSearch.kind), expected.map(item => item.scopeId))) : new Set<string>();
  const relatedUnreported = tree ? relatedTaskIdsForUnreported(periodSearch.kind, periodTasks, missingIds) : new Set<string>();
  const source = hasPeriodView ? periodTasks : all;
  const tasks = sortTasks(source.filter(t => {
    if (params.q && ![t.title, t.scope, t.completionCriteria, t.owner.name, t.latestProgress].join(" ").toLowerCase().includes(params.q.toLowerCase())) return false;
    if (params.person && t.ownerId !== params.person && !t.collaborators.some(c => c.userId === params.person)) return false;
    if (params.area && t.area !== params.area) return false;
    if (params.relation === "owned" && t.ownerId !== user.id) return false;
    if (params.relation === "collaborating" && !t.collaborators.some(c => c.userId === user.id)) return false;
    if (search.exception === "unreported" && tree) return relatedUnreported.has(t.id);
    if (search.exception) {
      const state = expectedCheckInScope(periodSearch.kind) === "TASK" ? checkInReportState(checkIns.get(scopeKey("TASK", t.id))) : CHECKIN_UNREPORTED;
      return taskExceptionMatch(t, search.exception, state);
    }
    if (params.filter === "done") {
      const monday = today(); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      return t.status === "DONE" && !!t.completedAt && t.completedAt >= new Date(monday.getTime() - 8 * 3600_000);
    }
    if (params.filter === "closed") return closed(t);
    if (params.filter === "attention") return needsAttention(t);
    if (params.filter === "followup") return !closed(t) && followUpState(t) !== "scheduled";
    return archived || !closed(t);
  }));
  const exceptionLabel = search.exception === "risk" ? "风险" : search.exception === "overdue" ? "逾期" : search.exception === "unreported" ? "未汇报" : search.exception === "pending" ? "待确认" : "";
  return <div className="page">
    {hasPeriodView && <Link className="back-link" href={hrefWithOverview("/overview", periodSearch)}>← 周期汇报</Link>}
    <header className="page-heading"><div><p className="eyebrow">{hasPeriodView ? "周期下钻" : "共享清单"}</p><h1>{exceptionLabel ? `${exceptionLabel}事项` : "任务与协作"}</h1><p className="muted">{hasPeriodView ? "筛选条件写在地址栏里，返回周期总览时会保留。" : "按事项持续跟进。同一任务只统计一次，主责与协作清楚呈现。"}</p></div>{user.role !== "BOSS" && <Link href="/tasks/new" className="button">＋ 新建任务</Link>}</header>
    {tree && <PeriodSwitcher pathname="/tasks" search={periodSearch} tree={tree} />}
    <form className="filters surface" action="/tasks">
      {hasPeriodView && <input type="hidden" name="kind" value={periodSearch.kind} />}
      {hasPeriodView && <input type="hidden" name="period" value={periodSearch.period} />}
      {search.exception && <input type="hidden" name="exception" value={search.exception} />}
      <label className="search-field">搜索<input type="search" name="q" defaultValue={params.q} placeholder="任务、产品、负责人…" /></label>
      <label>成员<select name="person" defaultValue={params.person ?? ""}><option value="">全部成员</option>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
      <label>责任领域<select name="area" defaultValue={params.area ?? ""}><option value="">全部领域</option>{Object.entries(areaLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>查看范围<select name="filter" defaultValue={params.filter ?? ""}><option value="">未结束</option><option value="attention">需关注</option><option value="followup">待跟进确认</option><option value="done">本周完成</option><option value="closed">全部已结束</option><option value="archived">已归档</option></select></label>
      {user.role !== "BOSS" && <label>与我相关<select name="relation" defaultValue={params.relation ?? ""}><option value="">全部任务</option><option value="owned">我主责的</option><option value="collaborating">我协作的</option></select></label>}
      <button className="button secondary" type="submit">筛选</button>
      <Link href={hasPeriodView ? hrefWithOverview("/tasks", { kind: periodSearch.kind, period: periodSearch.period }) : "/tasks"} className="text-link">重置</Link>
    </form>
    {search.exception && <p className="notice">当前查看：{exceptionLabel}。{tree ? `周期 ${tree.selected.label}。` : ""}<Link href={hrefWithOverview("/tasks", { kind: periodSearch.kind, period: periodSearch.period, person: search.person, area: search.area, q: search.q, relation: search.relation, filter: search.filter })}>去掉异常筛选</Link></p>}
    <div className="section-heading"><h2>{archived ? "归档任务" : "任务清单"} <span className="count">{tasks.length}</span></h2><span className="muted small">{hasPeriodView ? "与周期总览使用同一套筛选" : "风险优先 · 到期跟进优先"}</span></div>
    {tasks.length ? <div className="task-grid">{tasks.map(t => <TaskCard key={t.id} task={t} userId={user.id} query={query} />)}</div> : <div className="empty-state"><h3>这个范围内还没有任务</h3><p>可以调整筛选条件，或创建一件新的事项。</p><Link className="button secondary" href={hasPeriodView ? hrefWithOverview("/overview", periodSearch) : "/tasks"}>返回{hasPeriodView ? "周期汇报" : "未结束任务"}</Link></div>}
  </div>;
}
