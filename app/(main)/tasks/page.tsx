import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/task-card";
import { PeriodSwitcher } from "@/components/period-switcher";
import { areaLabels } from "@/lib/tasks";
import { hrefWithOverview } from "@/lib/overview";
import { loadTaskList, type TaskListParams } from "@/lib/tasks-view";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<TaskListParams> }) {
  const user = await requireSession();
  const params = await searchParams;
  const { search, hasPeriodView, archived, tree, periodSearch, query, members,
    tasks, exceptionLabel } = await loadTaskList(prisma, user, params);
  return <div className="page">
    {hasPeriodView && <Link className="back-link" href={hrefWithOverview("/overview", periodSearch)}>← 周期汇报</Link>}
    <header className="page-heading">
      <div>
        <p className="eyebrow">{hasPeriodView ? "周期下钻" : "共享清单"}</p>
        <h1>{exceptionLabel ? `${exceptionLabel}事项` : "任务与协作"}</h1>
        <p className="muted">{hasPeriodView ? "筛选条件写在地址栏里，返回周期总览时会保留。" : "按事项持续跟进。同一任务只统计一次，主责与协作清楚呈现。"}</p>
      </div>
      {user.role !== "BOSS" && <Link href="/tasks/new" className="button">＋ 新建任务</Link>}
    </header>
    {tree && <PeriodSwitcher pathname="/tasks" search={periodSearch} tree={tree} />}
    <form className="filters surface" action="/tasks">
      {hasPeriodView && <input type="hidden" name="kind" value={periodSearch.kind} />}
      {hasPeriodView && <input type="hidden" name="period" value={periodSearch.period} />}
      {search.exception && <input type="hidden" name="exception" value={search.exception} />}
      <label className="search-field">搜索<input type="search" name="q" defaultValue={params.q} placeholder="任务、产品、负责人…" /></label>
      <label>成员<select name="person" defaultValue={params.person ?? ""}>
        <option value="">全部成员</option>
        {members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
      </select>
      </label>
      <label>责任领域<select name="area" defaultValue={params.area ?? ""}>
        <option value="">全部领域</option>
        {Object.entries(areaLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      </label>
      <label>查看范围<select name="filter" defaultValue={params.filter ?? ""}>
        <option value="">未结束</option>
        <option value="attention">需关注</option>
        <option value="followup">待跟进确认</option>
        <option value="done">本周完成</option>
        <option value="closed">全部已结束</option>
        <option value="archived">已归档</option>
      </select>
      </label>
      {
        user.role !== "BOSS"
        && <label>与我相关<select name="relation" defaultValue={params.relation ?? ""}>
          <option value="">全部任务</option>
          <option value="owned">我主责的</option>
          <option value="collaborating">我协作的</option>
        </select>
        </label>
      }
      <button className="button secondary" type="submit">筛选</button>
      <Link
        href={
          hasPeriodView
            ? hrefWithOverview("/tasks", { kind: periodSearch.kind, period: periodSearch.period })
            : "/tasks"
        }
        className="text-link">重置</Link>
    </form>
    {
      search.exception
      && <p className="notice">当前查看：{exceptionLabel}。{tree ? `周期 ${tree.selected.label}。` : ""}
        <Link href={
          hrefWithOverview(
            "/tasks",
            {
              kind: periodSearch.kind,
              period: periodSearch.period,
              person: search.person,
              area: search.area,
              q: search.q,
              relation: search.relation,
              filter: search.filter
            }
          )
        }>去掉异常筛选</Link>
      </p>
    }
    <div className="section-heading">
      <h2>{archived ? "归档任务" : "任务清单"} <span className="count">{tasks.length}</span></h2>
      <span className="muted small">{hasPeriodView ? "与周期总览使用同一套筛选" : "风险优先 · 到期跟进优先"}</span>
    </div>
    {
      tasks.length
        ? <div className="task-grid">
          {tasks.map(t => <TaskCard key={t.id} task={t} userId={user.id} query={query} />)}
        </div>
        : <div className="empty-state">
          <h3>这个范围内还没有任务</h3>
          <p>可以调整筛选条件，或创建一件新的事项。</p>
          <Link
            className="button secondary"
            href={hasPeriodView ? hrefWithOverview("/overview", periodSearch) : "/tasks"}>返回{hasPeriodView ? "周期汇报" : "未结束任务"}
          </Link>
        </div>
    }
  </div>;
}
