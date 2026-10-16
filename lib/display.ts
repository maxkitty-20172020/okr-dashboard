import { isoWeekLabel } from "./week";

/** UI only: stored period labels and URL parameters keep their original values. */
export function formatPeriod(label: string): string {
  const week = /^(\d{4})-W(\d{2})$/.exec(label);
  if (week) {
    const year = Number(week[1]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const start = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (Number(week[2]) - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    const yearText = start.getUTCFullYear() !== end.getUTCFullYear() ? `${year} 年` : "";
    return `${yearText}第 ${Number(week[2])} 周（${formatShortDate(start)}–${formatShortDate(end)}）`;
  }
  const quarter = /^(\d{4})-Q([1-4])$/.exec(label);
  if (quarter) return `${quarter[1]} 年第 ${quarter[2]} 季度`;
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) return `${month[1]} 年 ${Number(month[2])} 月`;
  return label;
}

export function formatShortDate(value: Date | string | null | undefined, empty = "未定"): string {
  if (!value) return empty;
  const date = new Date(value);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "未设置";
  const date = new Date(value);
  return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
}

export function formatWeek(start: Date): string {
  return formatPeriod(isoWeekLabel(start));
}

export function displayAccount(account: string): string {
  return account.replace(/@okr\.local$/i, "");
}

export function formatMetric(value: number, unit: string): string {
  return `${value}${unit}`;
}

/** Mirrors use task + owner + title; keep genuinely independent deliveries. */
export function independentDeliverables<T extends { active: boolean; ownerUserId: string | null; title: string }>(items: T[], collaborators: { userId: string; deliverable: string }[]): T[] {
  return items.filter(item => item.active && !collaborators.some(row => row.userId === item.ownerUserId && row.deliverable === item.title));
}
