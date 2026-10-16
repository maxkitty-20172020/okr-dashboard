// Frozen page calculations from 7dfdcc39da57a8840d8a44d53f9906ae8b1779fe.
// Keep these independent of the new view services: this is the behavior oracle.
import type { PrismaClient } from "@prisma/client";
import {
  canAuthorCheckIn, checkInReportState, expectedCheckInScope,
  latestCheckInMap, scopeKey, unreportedScopeIds, CHECKIN_UNREPORTED,
} from "../../lib/check-in";
import { keyResultAchievementRate, taskCompletionRate } from "../../lib/okr";
import {
  hrefWithOverview, countTaskExceptions, expectedTargets, objectivesForQuarter, overviewQuery,
  parseOverviewSearch, relatedTaskIdsForUnreported, resolveSelectedPeriod,
  taskExceptionMatch, tasksInPeriod, overviewTaskInclude, type OverviewTask,
} from "../../lib/overview";
import { canConfirm, taskInclude, closed, followUpState, needsAttention, publicUser, sortTasks, today, type Member } from "../../lib/tasks";
import { listSubjectRaci } from "../../lib/raci";
import type { TaskListParams } from "../../lib/tasks-view";
import { SYSTEM_VIEWER } from "../../lib/task-visibility";

export async function legacyOverview(prisma: PrismaClient, user: Member, params: Record<string, string | string[] | undefined>) {
  const raw = parseOverviewSearch(params);
  const tree = await resolveSelectedPeriod(prisma, raw);
  const search = { ...raw, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(search);
  const [tasks, objectives, checkIns] = await Promise.all([
    tasksInPeriod(prisma, tree.selected, tree.quarter.id, SYSTEM_VIEWER),
    objectivesForQuarter(prisma, tree.quarter.id),
    latestCheckInMap(prisma, tree.selected.id),
  ]);
  const keyResults = objectives.flatMap(objective => objective.keyResults);
  const expected = expectedTargets(search.kind, tasks, objectives, search);
  const extraOwned = [
    ...expectedTargets("MONTH", tasks, objectives, search),
    ...expectedTargets("QUARTER", tasks, objectives, search),
    ...expectedTargets("WEEK", tasks, objectives, search),
  ].filter(item => !expected.some(row => row.scopeType === item.scopeType && row.scopeId === item.scopeId));
  const missingIds = new Set(await unreportedScopeIds(prisma, tree.selected.id, expectedCheckInScope(search.kind), expected.map(item => item.scopeId)));
  const unreported = expected.filter(item => missingIds.has(item.scopeId));
  const writableFlags = await Promise.all(unreported.map(item => canAuthorCheckIn(prisma, user, item.scopeType, item.scopeId)));
  const extraWritable = await Promise.all(extraOwned.map(async item => {
    const state = checkInReportState(checkIns.get(scopeKey(item.scopeType, item.scopeId)));
    return state === "UNREPORTED" && await canAuthorCheckIn(prisma, user, item.scopeType, item.scopeId);
  }));
  const myUnreported = [
    ...unreported.filter((_, index) => writableFlags[index]),
    ...extraOwned.filter((_, index) => extraWritable[index]),
  ];
  const otherUnreported = unreported.filter((_, index) => !writableFlags[index]);
  const reportStateForTask = (task: (typeof tasks)[number]) => {
    if (expectedCheckInScope(search.kind) === "TASK") return checkInReportState(checkIns.get(scopeKey("TASK", task.id)));
    if (expectedCheckInScope(search.kind) === "KEY_RESULT") return checkInReportState(
      task.keyResultId ? checkIns.get(scopeKey("KEY_RESULT", task.keyResultId)) : undefined
    );
    return checkInReportState(task.keyResult ? checkIns.get(scopeKey("OBJECTIVE", task.keyResult.objectiveId)) : undefined);
  };
  const exceptions = countTaskExceptions(tasks, reportStateForTask);
  exceptions.unreported = unreported.length;
  const relatedUnreportedTasks = relatedTaskIdsForUnreported(search.kind, tasks, missingIds);
  const visibleTasks = tasks.filter(task => {
    if (search.person && task.ownerId !== search.person && !task.collaborators.some(row => row.userId === search.person)) return false;
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

  return {
    tree, search, query, tasks, objectives, checkIns, expected, extraOwned,
    missingIds, unreported, myUnreported, otherUnreported, exceptions,
    visibleTasks, visibleObjectives, completion, achievement, boss, kindHelp
  };
}

export async function legacyTaskList(prisma: PrismaClient, user: Member, params: TaskListParams) {
  const search = parseOverviewSearch(params);
  const hasPeriodView = Boolean(params.kind || params.period || params.exception);
  const archived = params.filter === "archived";
  const tree = hasPeriodView ? await resolveSelectedPeriod(prisma, search) : null;
  const periodSearch = tree ? { ...search, kind: tree.selected.kind, period: tree.selected.label } : search;
  const query = overviewQuery(periodSearch);
  const [all, members, periodTasks, objectives, checkIns] = await Promise.all([
    hasPeriodView
      ? Promise.resolve([] as OverviewTask[])
      : prisma.task.findMany(
        {
          where: params.filter === "done" ? {} : { archivedAt: archived ? { not: null } : null },
          include: overviewTaskInclude
        }
      ),
    prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    tree ? tasksInPeriod(prisma, tree.selected, tree.quarter.id, SYSTEM_VIEWER) : Promise.resolve([] as OverviewTask[]),
    tree ? objectivesForQuarter(prisma, tree.quarter.id) : Promise.resolve([]),
    tree ? latestCheckInMap(prisma, tree.selected.id) : Promise.resolve(new Map()),
  ]);
  const expected = tree ? expectedTargets(periodSearch.kind, periodTasks, objectives, periodSearch) : [];
  const missingIds = tree
    ? new Set(
      await unreportedScopeIds(
        prisma,
        tree.selected.id,
        expectedCheckInScope(periodSearch.kind),
        expected.map(item => item.scopeId)
      )
    )
    : new Set<string>();
  const relatedUnreported = tree ? relatedTaskIdsForUnreported(periodSearch.kind, periodTasks, missingIds) : new Set<string>();
  const source = hasPeriodView ? periodTasks : all;
  const tasks = sortTasks(source.filter(t => {
    if (params.q
      && ![t.title, t.scope, t.completionCriteria, t.owner.name, t.latestProgress].join(" ").toLowerCase().includes(
        params.q.toLowerCase()
      )) return false;
    if (params.person && t.ownerId !== params.person && !t.collaborators.some(c => c.userId === params.person)) return false;
    if (params.area && t.area !== params.area) return false;
    if (params.relation === "owned" && t.ownerId !== user.id) return false;
    if (params.relation === "collaborating" && !t.collaborators.some(c => c.userId === user.id)) return false;
    if (search.exception === "unreported" && tree) return relatedUnreported.has(t.id);
    if (search.exception) {
      const state = expectedCheckInScope(periodSearch.kind) === "TASK" ? checkInReportState(checkIns.get(scopeKey("TASK", t.id))) : CHECKIN_UNREPORTED;
      return taskExceptionMatch(t, search.exception, state);
    }
    if (params.filter === "done") {
      const monday = today(); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      return t.status === "DONE" && !!t.completedAt && t.completedAt >= new Date(monday.getTime() - 8 * 3600_000);
    }
    if (params.filter === "closed") return closed(t);
    if (params.filter === "attention") return needsAttention(t);
    if (params.filter === "followup") return !closed(t) && followUpState(t) !== "scheduled";
    return archived || !closed(t);
  }));
  const exceptionLabel = search.exception === "risk"
    ? "风险"
    : search.exception === "overdue"
      ? "逾期"
      : search.exception === "unreported" ? "本周还没写进展" : search.exception === "pending" ? "待确认" : "";
  return { search, hasPeriodView, archived, tree, periodSearch, query, members, tasks, exceptionLabel };
}

export async function legacyDashboard(prisma: PrismaClient, user: Member) {
  const [allTasks, members, updates] = await Promise.all([
    prisma.task.findMany({ include: taskInclude }),
    prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.taskUpdate.findMany(
      {
        where: { task: { archivedAt: null } },
        include: { author: { select: { name: true } }, task: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 8
      }
    ),
  ]);
  const active = sortTasks(allTasks.filter(t => !closed(t) && !t.archivedAt));
  const attention = active.filter(t => needsAttention(t));
  const owned = active.filter(t => t.ownerId === user.id);
  const collaborating = active.filter(t => t.ownerId !== user.id && t.collaborators.some(c => c.userId === user.id));
  const followUps = owned.filter(t => followUpState(t) !== "scheduled");
  const weekDay = today();
  weekDay.setUTCDate(weekDay.getUTCDate() - ((weekDay.getUTCDay() + 6) % 7));
  const since = new Date(weekDay.getTime() - 8 * 3600_000);
  const recentDone = allTasks.filter(t => t.status === "DONE" && t.completedAt && t.completedAt >= since);
  const boss = user.role === "BOSS";
  const people = members.filter(m => m.role !== "BOSS" || active.some(t => t.ownerId === m.id))
    .sort((a, b) => Number(a.role === "BOSS") - Number(b.role === "BOSS"));
  const personViews = new Map(people.map(m => [m.id, {
    own: active.filter(t => t.ownerId === m.id),
    assisting: active.filter(t => t.collaborators.some(c => c.userId === m.id)),
  }]));
  return {
    active, attention, owned, collaborating, followUps, recentDone, boss,
    updates, people, personViews,
    remainingOwned: owned.filter(t => !followUps.some(f => f.id === t.id)),
    memberCount: members.filter(m => m.role !== "BOSS").length
  };
}
export async function legacyTaskDetail(prisma: PrismaClient, user: Member, id: string, query: Record<string, string | string[] | undefined>) {
  const search = parseOverviewSearch(query);
  const tree = await resolveSelectedPeriod(prisma, search);
  const periodSearch = { ...search, kind: tree.selected.kind, period: tree.selected.label };
  const returnQuery = overviewQuery(periodSearch);
  const backHref = query.kind || query.period || query.exception ? hrefWithOverview("/tasks", periodSearch) : "/tasks";
  const [task, members, keyResults, checkIns, raci] = await Promise.all([
    prisma.task.findUnique(
      {
        where: { id },
        include: {
          ...taskInclude,
          keyResult: { select: { id: true, title: true, objectiveId: true } },
          deliverables: { include: { owner: { select: publicUser } }, orderBy: { id: "asc" } },
          workPackages: {
            include: { deliverables: { include: { owner: { select: publicUser } } } },
            orderBy: { sortOrder: "asc" }
          },
          updates: {
            include: { author: { select: { name: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }]
          }
        }
      }
    ),
    prisma.user.findMany({ where: { role: "MANAGER" }, select: publicUser, orderBy: { createdAt: "asc" } }),
    prisma.keyResult.findMany({ select: { id: true, title: true } }),
    prisma.checkIn.findMany(
      {
        where: { scopeType: "TASK", scopeId: id },
        include: { author: { select: { name: true } }, period: true },
        orderBy: { createdAt: "desc" }
      }
    ),
    listSubjectRaci(prisma, "TASK", id),
  ]);
  if (!task) return null;
  const owner = canConfirm(user, task);
  const writable = user.role !== "BOSS";
  const canCheckIn = await canAuthorCheckIn(prisma, user, "TASK", task.id);
  const latestThisPeriod = checkIns.find(item => item.periodId === tree.selected.id);
  const reportState = checkInReportState(latestThisPeriod);
  const active = !task.archivedAt && !closed(task);
  const myContribution = task.collaborators.find(c => c.userId === user.id);
  const available = members.filter(m => m.id !== task.ownerId && !task.collaborators.some(c => c.userId === m.id));
  return {
    tree, returnQuery, backHref, task, members, keyResults, checkIns, raci,
    owner, writable, canCheckIn, reportState, active, myContribution, available
  };
}
export async function legacyObjectiveDetail(prisma: PrismaClient, user: Member, id: string, params: Record<string, string | string[] | undefined>) {
  const search = parseOverviewSearch(params);
  const tree = await resolveSelectedPeriod(prisma, search);
  const periodSearch = { ...search, kind: tree.selected.kind, period: tree.selected.label };
  const query = overviewQuery(periodSearch);
  const backHref = hrefWithOverview("/overview", periodSearch);
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: publicUser },
      period: true,
      keyResults: { orderBy: { createdAt: "asc" }, include: { workPackages: { include: { deliverables: true } } } },
    },
  });
  if (!objective) return null;
  const [tasks, checkIns] = await Promise.all([
    prisma.task.findMany({ where: { archivedAt: null, keyResult: { objectiveId: objective.id } }, include: overviewTaskInclude }),
    prisma.checkIn.findMany({
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
  const canWriteObjective = await canAuthorCheckIn(prisma, user, "OBJECTIVE", objective.id);
  const krFlags = await Promise.all(objective.keyResults.map(item => canAuthorCheckIn(prisma, user, "KEY_RESULT", item.id)));
  const achievement = keyResultAchievementRate(objective.keyResults);
  const deliverables = tasks.flatMap(task => task.deliverables.map(item => ({ ...item, taskTitle: task.title, taskId: task.id })));
  const objectiveState = checkInReportState(latestByScope.get(scopeKey("OBJECTIVE", objective.id)));
  return {
    tree, periodSearch, query, backHref, objective, tasks, checkIns,
    canWriteObjective, krFlags, achievement, deliverables, objectiveState
  };
}
