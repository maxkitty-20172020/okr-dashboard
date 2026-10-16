import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { CheckInForm } from "@/components/check-in-form";
import { PeriodSwitcher } from "@/components/period-switcher";
import { reportStateLabel, expectedCheckInScope } from "@/lib/check-in";
import { exceptionLabels, hrefWithOverview } from "@/lib/overview";
import { WeekBand } from "@/components/ui/week-band";
import { StatusBadge } from "@/components/ui/status-badge";
import { Disclosure } from "@/components/ui/disclosure";
import { weeklyOverview } from "@/lib/redesign-view";
import { loadOverview } from "@/lib/overview-service";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  const view = await loadOverview(prisma, user, await searchParams);
  const { tree, search, unreported, myUnreported, exceptions, boss } = view;
  const week = search.kind === "WEEK" ? weeklyOverview(view, user) : null;
  const scope = expectedCheckInScope(search.kind);
  const missing = unreported.filter(item => item.scopeType === scope);
  return <div className="page overview-page">
    <header className="page-heading"><div><p className="eyebrow">{boss ? "部门全貌" : "周期工作台"}</p><h1>每周进展</h1><p className="muted">{week ? "按成员看还没写的事项。更新进展或确认暂无变化，会自动记录本周进展。" : search.kind === "MONTH" ? `看看哪些关键结果还没复盘。${boss ? "" : "负责人可直接填写，没变化也可以一键确认。"}` : `看看哪些目标还没评估。${boss ? "" : "负责人可直接填写，没变化也可以一键确认。"}`}</p></div>{!boss && <Link className="button" href="/tasks/new">＋ 记一件事</Link>}</header>
    <PeriodSwitcher pathname="/overview" search={search} tree={tree} />
    {week && <WeekBand {...week} boss={boss} />}
    {week && !boss && week.extraReports.length > 0 && <Disclosure className="edit-disclosure surface detail-section" title="其他可提交的复盘与确认"><div className="unreported-list">{week.extraReports.map(item => <article key={`${item.scopeType}:${item.scopeId}`}><Link href={item.href}>{item.title}</Link><CheckInForm periodId={tree.selected.id} scopeType={item.scopeType} scopeId={item.scopeId} compact /></article>)}</div></Disclosure>}
    {week ? <section className="exception-chips" aria-label="异常下钻">{(Object.keys(exceptionLabels) as (keyof typeof exceptionLabels)[]).map(key => <Link key={key} href={hrefWithOverview("/tasks", { ...search, exception: search.exception === key ? undefined : key })} className={`chip ${search.exception === key ? "active" : ""} ${key === "risk" || key === "overdue" ? "warn" : ""}`}>
      {key === "unreported" ? "还没写" : key === "pending" ? "待更新" : exceptionLabels[key]} <strong>{exceptions[key]}</strong>
    </Link>)}</section> : <section className="section-block" aria-label={search.kind === "MONTH" ? "还没复盘" : "还没评估"}>
      <div className="section-heading"><h2>{search.kind === "MONTH" ? "还没复盘的关键结果" : "还没评估的目标"} <span className="count">{missing.length}</span></h2></div>
      {missing.length ? <div className="unreported-list">{missing.map(item => <article key={`${item.scopeType}:${item.scopeId}`} className="surface detail-section"><StatusBadge tone="today">{reportStateLabel("UNREPORTED", scope)}</StatusBadge><h3><Link href={item.href}>{item.title}</Link></h3><p className="muted small">{item.ownerName}</p>{!boss && myUnreported.some(row => row.scopeId === item.scopeId && row.scopeType === item.scopeType) && <CheckInForm periodId={tree.selected.id} scopeType={item.scopeType} scopeId={item.scopeId} compact />}</article>)}</div> : <p className="quiet-state">这个周期都已记录。</p>}
    </section>}
    <footer className="overview-links"><Link href={hrefWithOverview("/tasks", search)}>看全部事项 →</Link><Link href={hrefWithOverview("/okrs", search)}>看目标 →</Link></footer>
  </div>;
}
