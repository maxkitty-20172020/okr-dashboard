import type { CheckInClient } from "./check-in";
import { checkInReportState, expectedCheckInScope, latestCheckInMap, scopeKey } from "./check-in";
import {
  expectedTargets, objectivesForQuarter, overviewQuery, parseOverviewSearch,
  relatedTaskIdsForUnreported, resolveSelectedPeriod, tasksInPeriod,
  type OverviewTask,
} from "./overview";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Shared period scope and missing-report calculation for overview and task drill-down. */
export async function loadPeriodView(db: CheckInClient, params: SearchParams) {
  const raw = parseOverviewSearch(params);
  const tree = await resolveSelectedPeriod(db, raw);
  const search = { ...raw, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(search);
  const [tasks, objectives, checkIns] = await Promise.all([
    tasksInPeriod(db, tree.selected, tree.quarter.id),
    objectivesForQuarter(db, tree.quarter.id),
    latestCheckInMap(db, tree.selected.id),
  ]);
  const expected = expectedTargets(search.kind, tasks, objectives, search);
  const scope = expectedCheckInScope(search.kind);
  const missingIds = new Set(expected
    .filter(item => checkInReportState(checkIns.get(scopeKey(scope, item.scopeId))) === "UNREPORTED")
    .map(item => item.scopeId));
  const unreported = expected.filter(item => missingIds.has(item.scopeId));
  const relatedUnreportedTasks = relatedTaskIdsForUnreported(search.kind, tasks, missingIds);
  const reportStateForTask = (task: OverviewTask) => {
    if (scope === "TASK") return checkInReportState(checkIns.get(scopeKey("TASK", task.id)));
    if (scope === "KEY_RESULT") {
      return checkInReportState(task.keyResultId ? checkIns.get(scopeKey("KEY_RESULT", task.keyResultId)) : undefined);
    }
    return checkInReportState(task.keyResult ? checkIns.get(scopeKey("OBJECTIVE", task.keyResult.objectiveId)) : undefined);
  };
  return {
    tree, search, query, tasks, objectives, checkIns, expected, missingIds,
    unreported, relatedUnreportedTasks, reportStateForTask,
  };
}

export function matchesTaskPerson(task: OverviewTask, person?: string) {
  return !person || task.ownerId === person || task.collaborators.some(row => row.userId === person);
}
