import Link from "next/link";
import type { Period } from "@prisma/client";
import { adjacentPeriodDate, hrefWithOverview, type OverviewSearch } from "@/lib/overview";
import { periodKindLabels } from "@/lib/check-in";
import { formatWeekRange, isoWeekLabel, monthBounds, quarterBounds } from "@/lib/week";

const kinds = [
  { kind: "WEEK" as const, caption: "周" },
  { kind: "MONTH" as const, caption: "月" },
  { kind: "QUARTER" as const, caption: "季" },
];

export function PeriodSwitcher({
  pathname,
  search,
  tree,
}: {
  pathname: string;
  search: OverviewSearch;
  tree: { week: Period; month: Period; quarter: Period; selected: Period };
}) {
  const selected = tree.selected;
  const labelFor = (kind: OverviewSearch["kind"]) => (kind === "MONTH" ? tree.month.label : kind === "QUARTER" ? tree.quarter.label : tree.week.label);
  const range = selected.kind === "WEEK"
    ? formatWeekRange(selected.startAt)
    : `${selected.startAt.toISOString().slice(0, 10).replaceAll("-", "/")} 至 ${new Date(selected.endAt.getTime() - 86400_000).toISOString().slice(0, 10).replaceAll("-", "/")}`;
  const shared = { ...search, period: undefined };
  return <div className="period-switcher">
    <div className="period-tabs" role="tablist" aria-label="周期类型">
      {kinds.map(item => {
        const active = search.kind === item.kind;
        return <Link key={item.kind} role="tab" aria-selected={active} className={`period-tab ${active ? "active" : ""}`} href={hrefWithOverview(pathname, { ...shared, kind: item.kind, period: labelFor(item.kind) })}>
          {item.caption}
        </Link>;
      })}
    </div>
    <div className="period-nav">
      <Link className="text-link" href={hrefWithOverview(pathname, shared)}>回到当前周期</Link>
      <span className="period-current">{periodKindLabels[selected.kind]} · {selected.label}<small>{range}</small></span>
      <span className="period-arrows">
        <Link href={hrefWithOverview(pathname, { ...search, period: shiftedLabel(selected, -1) })}>← 上一期</Link>
        <Link href={hrefWithOverview(pathname, { ...search, period: shiftedLabel(selected, 1) })}>下一期 →</Link>
      </span>
    </div>
  </div>;
}

function shiftedLabel(selected: Period, delta: number) {
  const date = adjacentPeriodDate(selected.kind, selected.startAt, delta);
  if (selected.kind === "WEEK") return isoWeekLabel(date);
  if (selected.kind === "MONTH") return monthBounds(date).label;
  return quarterBounds(date).label;
}
