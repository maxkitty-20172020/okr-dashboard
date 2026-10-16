import Link from "next/link";
import type { Period } from "@prisma/client";
import { adjacentPeriodDate, hrefWithOverview, type OverviewSearch } from "@/lib/overview";
import { isoWeekLabel, monthBounds, quarterBounds } from "@/lib/week";
import { formatPeriod } from "@/lib/display";

const kinds = [{ kind: "WEEK" as const, caption: "周" }, { kind: "MONTH" as const, caption: "月" }, { kind: "QUARTER" as const, caption: "季" }];
export function PeriodSwitcher({ pathname, search, tree }: { pathname: string; search: OverviewSearch; tree: { week: Period; month: Period; quarter: Period; selected: Period } }) {
  const selected = tree.selected;
  const labelFor = (kind: OverviewSearch["kind"]) => kind === "MONTH" ? tree.month.label : kind === "QUARTER" ? tree.quarter.label : tree.week.label;
  const shared = { ...search, period: undefined };
  return <div className="period-switcher">
    <div className="period-tabs" role="tablist" aria-label="周期类型">{kinds.map(item => <Link key={item.kind} role="tab" aria-selected={search.kind === item.kind} className={`period-tab ${search.kind === item.kind ? "active" : ""}`} href={hrefWithOverview(pathname, { ...shared, kind: item.kind, period: labelFor(item.kind) })}>{item.caption}</Link>)}</div>
    <span className="period-arrows"><Link className="button secondary" aria-label="上一期" href={hrefWithOverview(pathname, { ...search, period: shiftedLabel(selected, -1) })}>‹</Link><Link className="button secondary" aria-label="下一期" href={hrefWithOverview(pathname, { ...search, period: shiftedLabel(selected, 1) })}>›</Link></span>
    <p className="period-current">{formatPeriod(selected.label)}</p>
    <Link className="text-link period-reset" href={hrefWithOverview(pathname, shared)}>回到当前周期</Link>
  </div>;
}
function shiftedLabel(selected: Period, delta: number) {
  const date = adjacentPeriodDate(selected.kind, selected.startAt, delta);
  if (selected.kind === "WEEK") return isoWeekLabel(date);
  if (selected.kind === "MONTH") return monthBounds(date).label;
  return quarterBounds(date).label;
}
