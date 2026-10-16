import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { timeLabel, updateLabels } from "@/lib/tasks";
import { dashboardDate, loadRedesignDashboard } from "@/lib/dashboard-view";
import { Headline } from "@/components/ui/headline";
import { WeekBand } from "@/components/ui/week-band";
import { Lane } from "@/components/ui/lane";
import { TaskCard } from "@/components/ui/task-card";
import { PersonCard } from "@/components/ui/person-card";
import { Timeline } from "@/components/ui/timeline";
import { Notice } from "@/components/ui/notice";
export const dynamic = "force-dynamic";
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireSession();
  const params = await searchParams;
  const { boss, active, lanes, headline, week, currentPeople, updates } = await loadRedesignDashboard(prisma, user);
  const titles = boss ? ["需要你出面", "今天该有回音", "还没定期限"] : ["今天要跟进", "等我交付", "我负责 · 还没定期限"];
  const helps = boss ? ["受阻或有风险，需要协调支持", "今天或已经到约定的跟进日", "继续明确完成时间"] : ["今天、已过期或还没安排跟进", "先把约定的交付给到对方", "把长期事项一步步向前推进"];
  const groups = [lanes.first, lanes.second, lanes.third];
  return <div className="page dashboard-page"><header className="dashboard-heading"><div><p className="eyebrow">{dashboardDate()}</p><Headline {...headline} /></div>{!boss && <Link className="button primary lg" href="/tasks/new">记一件事</Link>}</header>
    {params.error === "no-permission" && <Notice tone="risk">无权限管理成员</Notice>}
    {params.error === "read-only" && <Notice tone="risk">老板账号仅可查看，数据未修改。</Notice>}
    <WeekBand {...week} boss={boss} />
    {boss && <section className="person-cards" aria-label="成员分工">{currentPeople.map(person => {
      const owned = active.filter(task => task.ownerId === person.id);
      return <PersonCard key={person.id} id={person.id} name={person.name} owned={owned.length} assisting={active.filter(task => task.collaborators.some(c => c.userId === person.id)).length} blocked={owned.some(task => task.status === "BLOCKED" || task.health === "AT_RISK")} />;
    })}</section>}
    <div className="dashboard-lanes"><fieldset className="lane-switch"><legend className="sr-only">工作台栏目</legend>{groups.map((tasks, i) => <label key={i}><input type="radio" name="dashboardLane" value={String(i)} defaultChecked={i === 0} /><span>{[boss ? "需要出面" : "今天跟进", boss ? "该有回音" : "等我交付", "没定期限"][i]} {tasks.length}</span></label>)}</fieldset><div className="lanes-grid">{groups.map((tasks, i) => <Lane key={i} id={`lane-${i}`} title={titles[i]} count={tasks.length} help={helps[i]} empty={i === 0 && !boss ? "今天没有要跟进的事。" : undefined}>{tasks.map(task => {
      const description = boss ? i === 0 ? task.riskNote : task.latestProgress : i === 0 ? `下一步：${task.nextAction || "待明确"}` : i === 1 ? `我要交：${task.collaborators.find(c => c.userId === user.id && !c.done)?.deliverable}` : task.latestProgress;
      return <TaskCard key={task.id} task={task} description={description} />;
    })}</Lane>)}</div></div>
    <section className="surface detail-section"><h2>最近动态</h2><Timeline items={updates.map(update => ({ id: update.id, who: update.author?.name ?? "系统", action: updateLabels[update.kind] ?? update.kind, time: timeLabel(update.createdAt), title: update.task.title, href: `/tasks/${update.taskId}`, body: update.body }))} /></section>
  </div>;
}
