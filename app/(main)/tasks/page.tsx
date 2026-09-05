import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/task-card";
import { areaLabels, closed, followUpState, needsAttention, publicUser, sortTasks, taskInclude, today } from "@/lib/tasks";

export const dynamic = "force-dynamic";
type Params = { q?: string; person?: string; area?: string; filter?: string; relation?: string };
export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireSession();
  const params = await searchParams;
  const archived = params.filter === "archived";
  const [all, members] = await Promise.all([
    prisma.task.findMany({ where: params.filter === "done" ? {} : { archivedAt: archived ? { not: null } : null }, include: taskInclude }),
    prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
  ]);
  const tasks = sortTasks(all.filter(t => {
    if (params.q && ![t.title, t.scope, t.completionCriteria, t.owner.name, t.latestProgress].join(" ").toLowerCase().includes(params.q.toLowerCase())) return false;
    if (params.person && t.ownerId !== params.person && !t.collaborators.some(c => c.userId === params.person)) return false;
    if (params.area && t.area !== params.area) return false;
    if (params.relation === "owned" && t.ownerId !== user.id) return false;
    if (params.relation === "collaborating" && !t.collaborators.some(c => c.userId === user.id)) return false;
    if (params.filter === "done") {
      const monday = today(); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      return t.status === "DONE" && !!t.completedAt && t.completedAt >= new Date(monday.getTime() - 8 * 3600_000);
    }
    if (params.filter === "closed") return closed(t);
    if (params.filter === "attention") return needsAttention(t);
    if (params.filter === "followup") return !closed(t) && followUpState(t) !== "scheduled";
    return archived || !closed(t);
  }));
  return <div className="page"><header className="page-heading"><div><p className="eyebrow">共享清单</p><h1>任务与协作</h1><p className="muted">按事项持续跟进。同一任务只统计一次，主责与协作清楚呈现。</p></div>{user.role !== "BOSS" && <Link href="/tasks/new" className="button">＋ 新建任务</Link>}</header>
    <form className="filters surface" action="/tasks"><label className="search-field">搜索<input type="search" name="q" defaultValue={params.q} placeholder="任务、产品、负责人…" /></label><label>成员<select name="person" defaultValue={params.person ?? ""}><option value="">全部成员</option>{members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>责任领域<select name="area" defaultValue={params.area ?? ""}><option value="">全部领域</option>{Object.entries(areaLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>查看范围<select name="filter" defaultValue={params.filter ?? ""}><option value="">未结束</option><option value="attention">需关注</option><option value="followup">待跟进确认</option><option value="done">本周完成</option><option value="closed">全部已结束</option><option value="archived">已归档</option></select></label>{user.role !== "BOSS" && <label>与我相关<select name="relation" defaultValue={params.relation ?? ""}><option value="">全部任务</option><option value="owned">我主责的</option><option value="collaborating">我协作的</option></select></label>}<button className="button secondary" type="submit">筛选</button><Link href="/tasks" className="text-link">重置</Link></form>
    <div className="section-heading"><h2>{archived ? "归档任务" : "任务清单"} <span className="count">{tasks.length}</span></h2><span className="muted small">风险优先 · 到期跟进优先</span></div>
    {tasks.length ? <div className="task-grid">{tasks.map(t => <TaskCard key={t.id} task={t} userId={user.id} />)}</div> : <div className="empty-state"><h3>这个范围内还没有任务</h3><p>可以调整筛选条件，或创建一件新的事项。</p><Link className="button secondary" href="/tasks">查看未结束任务</Link></div>}
  </div>;
}
