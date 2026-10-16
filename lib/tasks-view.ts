import type { CheckInClient } from "./check-in";
import { CHECKIN_UNREPORTED, checkInReportState, expectedCheckInScope, scopeKey } from "./check-in";
import { exceptionLabels, overviewQuery, overviewTaskInclude, parseOverviewSearch, taskExceptionMatch } from "./overview";
import { loadPeriodView, matchesTaskPerson } from "./period-view";
import { closed, completedThisWeek, followUpState, needsAttention, publicUser, sortTasks, type Member } from "./tasks";

export type TaskListParams = {
  q?: string; person?: string; area?: string; filter?: string; relation?: string;
  kind?: string; period?: string; exception?: string;
};

export async function loadTaskList(db: CheckInClient, user: Member, params: TaskListParams) {
  const search = parseOverviewSearch(params);
  const hasPeriodView = Boolean(params.kind || params.period || params.exception);
  const archived = params.filter === "archived";
  const [period, all, members] = await Promise.all([
    hasPeriodView ? loadPeriodView(db, params) : null,
    hasPeriodView ? [] : db.task.findMany({
      where: params.filter === "done" ? {} : { archivedAt: archived ? { not: null } : null },
      include: overviewTaskInclude,
    }),
    db.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
  ]);
  const tree = period?.tree ?? null;
  const periodSearch = period?.search ?? search;
  const query = overviewQuery(periodSearch);
  const relatedUnreported = period?.relatedUnreportedTasks ?? new Set<string>();
  const checkIns = period?.checkIns ?? new Map();
  const source = period?.tasks ?? all;
  const tasks = sortTasks(source.filter(t => {
    if (params.q
      && ![t.title, t.scope, t.completionCriteria, t.owner.name, t.latestProgress].join(" ").toLowerCase().includes(
        params.q.toLowerCase()
      )) return false;
    if (!matchesTaskPerson(t, params.person)) return false;
    if (params.area && t.area !== params.area) return false;
    if (params.relation === "owned" && t.ownerId !== user.id) return false;
    if (params.relation === "collaborating" && !t.collaborators.some(c => c.userId === user.id)) return false;
    if (search.exception === "unreported" && tree) return relatedUnreported.has(t.id);
    if (search.exception) {
      const state = expectedCheckInScope(periodSearch.kind) === "TASK" ? checkInReportState(checkIns.get(scopeKey("TASK", t.id))) : CHECKIN_UNREPORTED;
      return taskExceptionMatch(t, search.exception, state);
    }
    if (params.filter === "done") {
      return completedThisWeek(t);
    }
    if (params.filter === "closed") return closed(t);
    if (params.filter === "attention") return needsAttention(t);
    if (params.filter === "followup") return !closed(t) && followUpState(t) !== "scheduled";
    return archived || !closed(t);
  }));
  const exceptionLabel = search.exception && Object.hasOwn(exceptionLabels, search.exception) ? exceptionLabels[search.exception] : "";
  return { search, hasPeriodView, archived, tree, periodSearch, query, members, tasks, exceptionLabel };
}
