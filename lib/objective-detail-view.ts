import type { CheckInClient } from "./check-in";
import { checkInReportState, scopeKey } from "./check-in";
import { loadCheckInAuthorizer } from "./check-in-permissions";
import { hrefWithOverview, overviewQuery, overviewTaskInclude, parseOverviewSearch, resolveSelectedPeriod } from "./overview";
import { keyResultAchievementRate, progressPercent } from "./okr";
import { publicUser, type Member } from "./tasks";
import type { SearchParams } from "./period-view";

export async function loadObjectiveDetail(db: CheckInClient, user: Member, id: string, params: SearchParams) {
  const search = parseOverviewSearch(params);
  const tree = await resolveSelectedPeriod(db, search);
  const periodSearch = { ...search, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(periodSearch);
  const backHref = hrefWithOverview("/overview", periodSearch);
  const objective = await db.objective.findUnique({
    where: { id },
    include: {
      owner: { select: publicUser },
      period: true,
      keyResults: { orderBy: { createdAt: "asc" }, include: { workPackages: { include: { deliverables: true } } } },
    },
  });
  if (!objective) return null;
  const [tasks, checkIns] = await Promise.all([
    db.task.findMany({ where: { archivedAt: null, keyResult: { objectiveId: objective.id } }, include: overviewTaskInclude }),
    db.checkIn.findMany({
      where: {
        OR: [
          { scopeType: "OBJECTIVE", scopeId: objective.id },
          { scopeType: "KEY_RESULT", scopeId: { in: objective.keyResults.map(item => item.id) } },
        ],
      },
      include: { author: { select: { name: true } }, period: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latestByScope = new Map<string, (typeof checkIns)[number]>();
  for (const row of checkIns.filter(item => item.periodId === tree.selected.id)) {
    const key = scopeKey(row.scopeType, row.scopeId);
    if (!latestByScope.has(key)) latestByScope.set(key, row);
  }
  const canAuthor = await loadCheckInAuthorizer(db, user, [
    { scopeType: "OBJECTIVE", scopeId: objective.id },
    ...objective.keyResults.map(kr => ({ scopeType: "KEY_RESULT" as const, scopeId: kr.id })),
  ]);
  const canWriteObjective = canAuthor("OBJECTIVE", objective.id);
  const krFlags = objective.keyResults.map(item => canAuthor("KEY_RESULT", item.id));
  const achievement = keyResultAchievementRate(objective.keyResults);
  const deliverables = tasks.flatMap(task => task.deliverables.map(item => ({ ...item, taskTitle: task.title, taskId: task.id })));
  const objectiveState = checkInReportState(latestByScope.get(scopeKey("OBJECTIVE", objective.id)));

  const keyResultViews = new Map(objective.keyResults.map(kr => [kr.id, {
    state: checkInReportState(latestByScope.get(scopeKey("KEY_RESULT", kr.id))),
    related: tasks.filter(task => task.keyResultId === kr.id),
    progress: progressPercent(kr.currentValue, kr.targetValue, kr.baselineValue, kr.direction),
  }]));
  return { tree, periodSearch, query, backHref, objective, tasks, checkIns,
    canWriteObjective, krFlags, achievement, deliverables, objectiveState, keyResultViews };
}
