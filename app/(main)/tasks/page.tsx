import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/ui/task-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PeriodSwitcher } from "@/components/period-switcher";
import { reportStateLabel, expectedCheckInScope } from "@/lib/check-in";
import { areaLabels } from "@/lib/tasks";
import { hrefWithOverview } from "@/lib/overview";
import { periodDrillLabel, taskFilterHref } from "@/lib/redesign-view";
import { loadTaskList, type TaskListParams } from "@/lib/tasks-view";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<TaskListParams> }) {
  const user = await requireSession();
  const params = await searchParams;
  const { search, hasPeriodView, archived, tree, periodSearch, query, members, tasks, exceptionLabel: rawLabel } = await loadTaskList(prisma, user, params);
  const exceptionLabel = search.exception === "unreported" ? reportStateLabel("UNREPORTED", expectedCheckInScope(search.kind)) : search.exception === "pending" ? "待更新" : rawLabel;
  const href = (patch: Partial<TaskListParams>) => taskFilterHref(params, patch);
  const clearHref = hasPeriodView ? hrefWithOverview("/tasks", { kind: periodSearch.kind, period: periodSearch.period }) : "/tasks";
  const chips = (name: "area" | "filter" | "relation", title: string, options: [string, string][]) => <div className="filter-group" role="group" aria-label={title}><span className="field-label">{title}</span><div className="link-chips">{options.map(([value, label]) => {
    const active = (params[name] ?? "") === value;
    return <Link key={value} className={`chip ${active ? "active" : ""}`} aria-current={active ? "true" : undefined} href={href({ [name]: value })}>{label}{active && <strong>{tasks.length}</strong>}</Link>;
  })}</div></div>;
  return <div className="page">
    {hasPeriodView && <Link className="back-link" href={hrefWithOverview("/overview", periodSearch)}>← 返回每周进展</Link>}
    <header className="page-heading"><div><p className="eyebrow">共享清单</p><h1>全部事项</h1><p className="muted">按成员、领域和查看范围，找到要跟进的事。</p></div>{user.role !== "BOSS" && <Link href="/tasks/new" className="button">＋ 记一件事</Link>}</header>
    {hasPeriodView && <Notice>周期下钻：{periodDrillLabel(tree?.selected.label ?? "")} · {exceptionLabel || "周期事项"}</Notice>}
    {tree && <PeriodSwitcher pathname="/tasks" search={periodSearch} tree={tree} />}
    <section className="surface detail-section task-filters" aria-label="事项筛选">
      <form key={JSON.stringify(params)} className="filter-search" action="/tasks">
        {(["kind", "period", "exception", "area", "filter", "relation"] as const).map(name => params[name] ? <input key={name} type="hidden" name={name} value={params[name]} /> : null)}
        <Field label="搜索" help="按事项、范围或负责人查找。"><input type="search" name="q" defaultValue={params.q} placeholder="例：旺季备货" /></Field>
        <Field label="成员" help="查看主责或协作的事项。"><select name="person" defaultValue={params.person ?? ""}><option value="">全部成员</option>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></Field>
        <Button variant="secondary">筛选</Button>
      </form>
      {chips("area", "领域", [["", "全部领域"], ...Object.entries(areaLabels)])}
      {chips("filter", "查看范围", [["", "未结束"], ["attention", "需关注"], ["followup", "待跟进"], ["done", "本周完成"], ["closed", "已结束"], ["archived", "已归档"]])}
      {user.role !== "BOSS" && chips("relation", "与我相关", [["", "全部"], ["owned", "我主责的"], ["collaborating", "我协作的"]])}
      <div className="active-filters"><span className="muted small">当前 {tasks.length} 项</span>{params.q && <span className="chip active">搜索：{params.q} <strong>{tasks.length}</strong></span>}{params.person && <span className="chip active">{members.find(m => m.id === params.person)?.name ?? "所选成员"} <strong>{tasks.length}</strong></span>}<Link className="text-link" href={clearHref}>清除筛选</Link>{search.exception && <Link className="text-link" href={href({ exception: undefined })}>去掉异常筛选</Link>}</div>
    </section>
    <div className="section-heading"><h2>{archived ? "已归档事项" : "事项清单"} <span className="count">{tasks.length}</span></h2><span className="muted small">风险优先 · 到期跟进优先</span></div>
    {tasks.length ? <div className="task-grid">{tasks.map(task => <TaskCard key={task.id} task={task} query={query} description={task.riskNote || task.latestProgress} />)}</div> : <p className="lane-empty">这个范围内还没有事项，可以调整筛选条件。</p>}
  </div>;
}
