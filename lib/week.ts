const SHANGHAI_OFFSET_MS = 8 * 3600_000;

export function startOfWeek(date = new Date()): Date {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diff);
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  const next = new Date(weekStart);
  next.setUTCDate(next.getUTCDate() + weeks * 7);
  return next;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekFromParam(param?: string | string[]): Date {
  const raw = Array.isArray(param) ? param[0] : param;
  if (!raw) {
    return startOfWeek();
  }
  return startOfWeek(parseLocalDate(raw));
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addWeeks(weekStart, 1);
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);
  return `${toISODate(weekStart)} 至 ${toISODate(weekEnd)}`;
}

export function currentCycle(date = new Date()): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

/** Asia/Shanghai calendar date stored as UTC-midnight, matching lib/tasks.ts `today()`. */
export function businessDate(date = new Date()): Date {
  return new Date(new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10) + "T00:00:00.000Z");
}

export function startOfBusinessWeek(date = new Date()): Date {
  const day = businessDate(date);
  const weekday = day.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + diff));
}

export function parseQuarterLabel(cycle: string): { year: number; quarter: number } | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(cycle.trim());
  if (!match) {
    return null;
  }
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

export function dateFromQuarterLabel(cycle: string): Date | null {
  const parsed = parseQuarterLabel(cycle);
  if (!parsed) {
    return null;
  }
  return new Date(Date.UTC(parsed.year, (parsed.quarter - 1) * 3, 1));
}

export function isoWeekLabel(weekStart: Date): string {
  const thursday = new Date(weekStart);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const week1Monday = startOfBusinessWeek(new Date(Date.UTC(isoYear, 0, 4)));
  const weekNum = Math.round((weekStart.getTime() - week1Monday.getTime()) / (7 * 86400_000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

export function quarterBounds(date = new Date()) {
  const day = businessDate(date);
  const quarter = Math.floor(day.getUTCMonth() / 3);
  const startAt = new Date(Date.UTC(day.getUTCFullYear(), quarter * 3, 1));
  const endAt = new Date(Date.UTC(day.getUTCFullYear(), quarter * 3 + 3, 1));
  return { startAt, endAt, label: `${day.getUTCFullYear()}-Q${quarter + 1}` };
}

export function monthBounds(date = new Date()) {
  const day = businessDate(date);
  const startAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const endAt = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  return { startAt, endAt, label: `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}` };
}

export function weekBounds(date = new Date()) {
  const startAt = startOfBusinessWeek(date);
  return { startAt, endAt: addWeeks(startAt, 1), label: isoWeekLabel(startAt) };
}

export function currentQuarterLabel(date = new Date()) {
  return quarterBounds(date).label;
}
