import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { TaskCard } from "@/components/task-card";
import { closed, dateLabel, followUpState, needsAttention, publicUser, sortTasks, taskInclude, timeLabel, today, updateLabels } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireSession();
  const params = await searchParams;
  const [allTasks, members, updates] = await Promise.all([
    prisma.task.findMany({ include: taskInclude }),
    prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.taskUpdate.findMany({ where: { task: { archivedAt: null } }, include: { author: { select: { name: true } }, task: { select: { id: true, title: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const active = sortTasks(allTasks.filter(t => !closed(t) && !t.archivedAt));
  const attention = active.filter(t => needsAttention(t));
  const owned = active.filter(t => t.ownerId === user.id);
  const collaborating = active.filter(t => t.ownerId !== user.id && t.collaborators.some(c => c.userId === user.id));
  const followUps = owned.filter(t => followUpState(t) !== "scheduled");
  const weekDay = today();
  weekDay.setUTCDate(weekDay.getUTCDate() - ((weekDay.getUTCDay() + 6) % 7));
  const since = new Date(weekDay.getTime() - 8 * 3600_000);
  const recentDone = allTasks.filter(t => t.status === "DONE" && t.completedAt && t.completedAt >= since);
  const boss = user.role === "BOSS";
  return <div className="page">
    <header className="page-heading"><div><p className="eyebrow">{boss ? "部门全貌" : "我的工作台"} · {dateLabel(today())}</p><h1>{boss ? "当前重点，责任清楚" : `${user.name}，今天跟进这些事`}</h1><p className="muted">{boss ? "查看重点、分工与风险。周期汇报、未汇报和下钻在「周期汇报」。" : "集中处理到期跟进、主责任务和协作交付。本周 / 本月 / 本季汇报在「周期汇报」。"}</p></div><div className="heading-actions">{boss ? <span className="readonly-label">老板账号 · 只读</span> : <Link className="button" href="/tasks/new">＋ 新建任务</Link>}<Link className="button secondary" href="/overview">周期汇报</Link></div></header>
    {params.error === "read-only" && <p className="form-error" role="alert">老板账号仅可查看，数据未修改。</p>}
    <section className="stats-grid" aria-label="当前工作概况">
      <Link className="stat" href={boss ? "/tasks" : "/tasks?relation=owned"}><span>{boss ? "未结束任务" : "我主责的"}</span><strong>{boss ? active.length : owned.length}</strong><small>跨周持续跟进</small></Link>
      <Link className="stat" href={boss ? "/tasks?filter=attention" : "/tasks?relation=collaborating"}><span>{boss ? "需关注事项" : "我协作的"}</span><strong>{boss ? attention.length : collaborating.length}</strong><small>{boss ? "风险、阻塞或逾期" : "按自己的交付内容推进"}</small></Link>
      <Link className="stat" href={boss ? "/tasks?filter=done" : "/tasks?relation=owned&filter=followup"}><span>{boss ? "本周完成" : "需要我跟进"}</span><strong>{boss ? recentDone.length : followUps.length}</strong><small>{boss ? "以完成记录时间统计" : "今日到期或待确认安排"}</small></Link>
      <div className="stat"><span>填报成员</span><strong>{members.filter(m => m.role !== "BOSS").length}</strong><small>业务 · 团队 · 库存</small></div>
    </section>
    {boss ? <>
      <section className="section-block"><div className="section-heading"><h2>优先关注</h2><Link href="/tasks?filter=attention">查看全部 →</Link></div>
        {attention.length ? <div className="attention-list">{attention.slice(0, 4).map(t => <Link key={t.id} href={`/tasks/${t.id}`} className="attention-item"><span className="attention-dot" /><div><strong>{t.title}</strong><p>{t.riskNote || "已超过约定完成期限，请确认当前情况。"}</p><small>{t.owner.name} · 下一步：{t.nextAction || "待明确"}</small></div><span className="attention-date">跟进 {dateLabel(t.nextFollowUpAt)}</span></Link>)}</div> : <div className="quiet-state"><span className="badge good">暂无已标记风险</span><p>未设置跟进日期的事项仍需负责人补充，不能据此判断全部正常。</p></div>}
      </section>
      <section className="section-block"><div className="section-heading"><h2>各自负责什么</h2><Link href="/tasks">任务清单 →</Link></div><div className="people-grid">{members.filter(m => m.role !== "BOSS" || active.some(t => t.ownerId === m.id)).sort((a, b) => Number(a.role === "BOSS") - Number(b.role === "BOSS")).map(m => {
        const own = active.filter(t => t.ownerId === m.id);
        const assisting = active.filter(t => t.collaborators.some(c => c.userId === m.id));
        return <section key={m.id} className="person-column"><header><div className="person-name"><span className="avatar">{m.name.slice(-2)}</span><div><h3>{m.name}</h3><p>{m.role === "BOSS" ? "历史任务 · 待移交" : `主责 ${own.length} 项 · 协作 ${assisting.length} 项`}</p></div></div><Link href={`/tasks?person=${m.id}`}>查看 →</Link></header>{own.length ? own.slice(0, 3).map(t => <TaskCard task={t} key={t.id} compact />) : <p className="empty-inline">暂无未结束的主责任务</p>}{assisting.length > 0 && <p className="collab-summary">参与协作：{assisting.map(t => <Link href={`/tasks/${t.id}`} key={t.id}>{t.title}</Link>)}</p>}{own.length > 3 && <Link className="text-link" href={`/tasks?person=${m.id}`}>还有 {own.length - 3} 项主责任务</Link>}</section>;
      })}</div></section>
    </> : <>
      <section className="section-block"><div className="section-heading"><h2>需要我确认</h2><span className="muted small">暂无变化也可以留下确认记录</span></div>{followUps.length ? <div className="task-grid">{followUps.map(t => <TaskCard task={t} key={t.id} />)}</div> : <div className="quiet-state"><span className="badge good">当前没有到期跟进</span><p>其余事项按约定日期继续推进。</p></div>}</section>
      <section className="section-block"><div className="section-heading"><h2>我主责的</h2><Link href="/tasks?relation=owned">查看全部 →</Link></div>{owned.length ? <div className="task-grid">{owned.filter(t => !followUps.some(f => f.id === t.id)).map(t => <TaskCard task={t} key={t.id} />)}{owned.length === followUps.length && <p className="empty-inline">主责任务已列在上方的跟进清单中。</p>}</div> : <div className="empty-state"><h3>还没有主责任务</h3><p>从一件明确的事项开始，约定交付内容与下次跟进时间。</p><Link className="button secondary" href="/tasks/new">新建任务</Link></div>}</section>
      <section className="section-block"><div className="section-heading"><h2>我协作的</h2><span className="muted small">个人交付与整体任务分别跟进</span></div>{collaborating.length ? <div className="task-grid">{collaborating.map(t => <TaskCard task={t} key={t.id} userId={user.id} />)}</div> : <p className="empty-inline">目前没有安排给你的协作交付。</p>}</section>
    </>}
    <section className="section-block"><div className="section-heading"><h2>最近的变化</h2><span className="muted small">全部门 · 最近 8 条记录</span></div><div className="activity-list">{updates.map(u => <div className="activity-item" key={u.id}><span className="activity-time">{timeLabel(u.createdAt)}</span><div><p><span className="muted">{u.author?.name ?? "系统"} · {updateLabels[u.kind] ?? u.kind}</span></p><Link href={`/tasks/${u.taskId}`}>{u.task.title}</Link><p className="small muted">{u.body}</p></div></div>)}{!updates.length && <p className="empty-inline">任务的创建、进展与协作记录会显示在这里。</p>}</div></section>
  </div>;
}
