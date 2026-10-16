import type { CheckInClient } from "./check-in";
import { canAuthorCheckIn, checkInReportState } from "./check-in";
import { hrefWithOverview, overviewQuery, parseOverviewSearch, resolveSelectedPeriod } from "./overview";
import { listSubjectRaci } from "./raci";
import { canConfirm, closed, publicUser, taskInclude, today, type Member } from "./tasks";
import type { SearchParams } from "./period-view";

export async function loadTaskDetail(db: CheckInClient, user: Member, id: string, query: SearchParams) {
  const search = parseOverviewSearch(query);
  const tree = await resolveSelectedPeriod(db, search);
  const periodSearch = { ...search, kind: tree.selected.kind, period: tree.selected.label };
  const returnQuery = overviewQuery(periodSearch);
  const backHref = query.kind || query.period || query.exception ? hrefWithOverview("/tasks", periodSearch)
    : hrefWithOverview("/tasks", { person: search.person, area: search.area, q: search.q, relation: search.relation, filter: search.filter });
  const [task, members, keyResults, checkIns, raci] = await Promise.all([
    db.task.findUnique(
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
    db.user.findMany({ where: { role: "MANAGER", disabledAt: null }, select: publicUser, orderBy: { createdAt: "asc" } }),
    db.keyResult.findMany({ select: { id: true, title: true } }),
    db.checkIn.findMany(
      {
        where: { scopeType: "TASK", scopeId: id },
        include: { author: { select: { name: true } }, period: true },
        orderBy: { createdAt: "desc" }
      }
    ),
    listSubjectRaci(db, "TASK", id),
  ]);
  if (!task) return null;
  const owner = canConfirm(user, task);
  const writable = user.role !== "BOSS";
  const canCheckIn = await canAuthorCheckIn(db, user, "TASK", task.id);
  const latestThisPeriod = checkIns.find(item => item.periodId === tree.selected.id);
  const reportState = checkInReportState(latestThisPeriod);
  const currentWeek = (await resolveSelectedPeriod(db, { kind: "WEEK", period: "" })).week;
  const currentWeekReportState = checkInReportState(checkIns.find(item => item.periodId === currentWeek.id));
  const taskClosed = closed(task);
  const active = !task.archivedAt && !taskClosed;
  const myContribution = task.collaborators.find(c => c.userId === user.id);
  const available = members.filter(m => m.id !== task.ownerId && !task.collaborators.some(c => c.userId === m.id));

  const activeDeliverables = task.deliverables.filter(item => item.active);
  const overdueCollaboratorIds = new Set(task.collaborators
    .filter(c => c.dueAt && c.dueAt < today() && !c.done && active).map(c => c.id));
  return {
    tree, returnQuery, backHref, task, members, keyResults, checkIns, raci,
    owner, writable, canCheckIn, reportState, currentWeek, currentWeekReportState, active, myContribution, available,
    taskClosed, activeDeliverables, overdueCollaboratorIds,
    deliveredCount: task.collaborators.filter(c => c.done).length,
    completedMilestoneCount: task.milestones.filter(m => m.done).length
  };
}

export function parseHistorySnapshot(raw: string): Record<string, unknown> | null {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
