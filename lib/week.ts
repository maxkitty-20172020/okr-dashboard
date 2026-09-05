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
