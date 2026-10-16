import type { CheckInClient } from "./check-in";
import { checkInReportState, scopeKey } from "./check-in";
import { loadCheckInAuthorizer } from "./check-in-permissions";
import { keyResultAchievementRate, taskCompletionRate } from "./okr";
import { countTaskExceptions, expectedTargets, taskExceptionMatch } from "./overview";
import { loadPeriodView, matchesTaskPerson, type SearchParams } from "./period-view";
import { closed, type Member } from "./tasks";

export async function loadOverview(db: CheckInClient, user: Member, params: SearchParams) {
  const period = await loadPeriodView(db, params, user);
  const { tree, search, query, tasks, objectives, checkIns, expected, missingIds,
    unreported, relatedUnreportedTasks, reportStateForTask } = period;
  const keyResults = objectives.flatMap(objective => objective.keyResults);
  const extraOwned = [
    ...expectedTargets("MONTH", tasks, objectives, search),
    ...expectedTargets("QUARTER", tasks, objectives, search),
    ...expectedTargets("WEEK", tasks, objectives, search),
  ].filter(item => !expected.some(row => row.scopeType === item.scopeType && row.scopeId === item.scopeId));
  const pendingTargets = [...unreported, ...extraOwned.filter(item =>
    checkInReportState(checkIns.get(scopeKey(item.scopeType, item.scopeId))) === "UNREPORTED"
  )];
  // These targets were loaded above: their primary owners need no second ownership lookup.
  const ownedKeys = new Set(pendingTargets
    .filter(item => user.role !== "BOSS" && item.ownerId === user.id)
    .map(item => scopeKey(item.scopeType, item.scopeId)));
  const canAuthorOthers = await loadCheckInAuthorizer(db, user, pendingTargets
    .filter(item => !ownedKeys.has(scopeKey(item.scopeType, item.scopeId))));
  const canAuthor = (item: (typeof expected)[number]) =>
    ownedKeys.has(scopeKey(item.scopeType, item.scopeId)) || canAuthorOthers(item.scopeType, item.scopeId);
  const writableFlags = unreported.map(item => canAuthor(item));
  const extraWritable = extraOwned.map(item => {
    const state = checkInReportState(checkIns.get(scopeKey(item.scopeType, item.scopeId)));
    return state === "UNREPORTED" && canAuthor(item);
  });
  const myUnreported = [
    ...unreported.filter((_, index) => writableFlags[index]),
    ...extraOwned.filter((_, index) => extraWritable[index]),
  ];
  const otherUnreported = unreported.filter((_, index) => !writableFlags[index]);
  const exceptions = countTaskExceptions(tasks, reportStateForTask);
  exceptions.unreported = unreported.length;
  const visibleTasks = tasks.filter(task => {
    if (!matchesTaskPerson(task, search.person)) return false;
    if (search.exception === "unreported") return relatedUnreportedTasks.has(task.id);
    return taskExceptionMatch(task, search.exception, reportStateForTask(task));
  });
  const visibleObjectives = objectives.filter(objective => {
    if (!search.exception) return true;
    if (search.exception === "unreported") {
      if (search.kind === "QUARTER") return missingIds.has(objective.id);
      if (search.kind === "MONTH") return objective.keyResults.some(keyResult => missingIds.has(keyResult.id));
      return objective.keyResults.some(keyResult => tasks.some(task => task.keyResultId === keyResult.id && relatedUnreportedTasks.has(task.id)));
    }
    return visibleTasks.some(task => task.keyResult?.objectiveId === objective.id);
  });
  const completion = taskCompletionRate(tasks);
  const achievement = keyResultAchievementRate(keyResults);
  const boss = user.role === "BOSS";
  const kindHelp = search.kind === "WEEK" ? "本周按事项范围汇报。" : search.kind === "MONTH" ? "本月按关键结果复盘。" : "本季按目标评估。";

  const objectiveViews = new Map(objectives.map(objective => [objective.id, {
    rate: keyResultAchievementRate(objective.keyResults),
    related: tasks.filter(task => task.keyResult?.objectiveId === objective.id),
    objectiveState: checkInReportState(checkIns.get(scopeKey("OBJECTIVE", objective.id))),
  }]));
  const keyResultStates = new Map(keyResults.map(kr => [kr.id,
    checkInReportState(checkIns.get(scopeKey("KEY_RESULT", kr.id))),
  ]));
  return { tree, search, query, tasks, objectives, checkIns, expected, extraOwned,
    missingIds, unreported, myUnreported, otherUnreported, exceptions, visibleTasks,
    visibleObjectives, completion, achievement, boss, kindHelp, objectiveViews,
    keyResultStates, activeTaskCount: tasks.filter(task => !closed(task)).length };
}
