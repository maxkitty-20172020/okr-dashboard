export function progressPercent(current: number, target: number) {
  if (target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (current / target) * 100));
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
