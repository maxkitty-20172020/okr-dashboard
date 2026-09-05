export function progressPercent(current: number, target: number, baseline = 0, direction = "INCREASE") {
  if (![current, target, baseline].every(Number.isFinite) || (direction === "DECREASE" ? baseline <= target : baseline >= target)) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((current - baseline) / (target - baseline)) * 100));
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function roleLabel(role: string) {
  return role === "BOSS" ? "老板" : "管理层";
}

export function statusLabel(status: string) {
  if (status === "DONE") {
    return "已完成";
  }
  if (status === "IN_PROGRESS") {
    return "进行中";
  }
  return "未开始";
}
