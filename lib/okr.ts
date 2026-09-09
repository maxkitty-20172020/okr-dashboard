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

/** Closed/cancelled work is excluded. Routine tasks (null keyResultId) still count here. */
export function taskCompletionRate(tasks: { status: string; archivedAt?: Date | null }[]) {
  const relevant = tasks.filter(task => !task.archivedAt && task.status !== "CANCELLED");
  if (relevant.length === 0) {
    return 0;
  }
  return (relevant.filter(task => task.status === "DONE").length / relevant.length) * 100;
}

/** KR achievement is metric progress, not task completion. */
export function keyResultAchievementRate(keyResults: { currentValue: number; targetValue: number; baselineValue?: number; direction?: string }[]) {
  return average(keyResults.map(kr => progressPercent(kr.currentValue, kr.targetValue, kr.baselineValue ?? 0, kr.direction ?? "INCREASE")));
}

export function routineTasks<T extends { keyResultId: string | null }>(tasks: T[]) {
  return tasks.filter(task => !task.keyResultId);
}

export function tasksLinkedToKeyResult<T extends { keyResultId: string | null }>(tasks: T[]) {
  return tasks.filter(task => !!task.keyResultId);
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
