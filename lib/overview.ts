import { PeriodKind, Prisma, PrismaClient, type Period } from "@prisma/client";
import { addWeeks, dateFromQuarterLabel, startOfBusinessWeek } from "./week";
import { ensurePeriodTree, type PeriodClient } from "./period";
import { closed, followUpState, overdue, publicUser } from "./tasks";
import { CHECKIN_UNREPORTED, expectedCheckInScope, type CheckInReportState } from "./check-in";

export const exceptionLabels = {
  risk: "风险",
  overdue: "逾期",
  unreported: "未汇报",
  pending: "待确认",
} as const;

export type ExceptionKey = keyof typeof exceptionLabels;
export type OverviewSearch = {
  kind: PeriodKind;
  period: string;
  exception?: ExceptionKey;
  person?: string;
  area?: string;
  q?: string;
  relation?: string;
  filter?: string;
};

export const overviewTaskInclude = {
  owner: { select: publicUser },
  collaborators: { where: { active: true }, include: { user: { select: publicUser } }, orderBy: { id: "asc" } },
  milestones: { orderBy: { createdAt: "asc" } },
  keyResult: { select: { id: true, title: true, objectiveId: true } },
  deliverables: { where: { active: true }, include: { owner: { select: publicUser } }, orderBy: { id: "asc" } },
  workPackages: { include: { deliverables: { where: { active: true } } }, orderBy: { sortOrder: "asc" } },
  schedulePeriod: { select: { id: true, kind: true, label: true } },
} satisfies Prisma.TaskInclude;

export type OverviewTask = Prisma.TaskGetPayload<{ include: typeof overviewTaskInclude }>;

export function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseOverviewSearch(params: Record<string, string | string[] | undefined>): OverviewSearch {
  const kindRaw = firstParam(params.kind)?.toUpperCase();
  const kind = kindRaw === "MONTH" || kindRaw === "QUARTER" || kindRaw === "WEEK" ? kindRaw : PeriodKind.WEEK;
  const exceptionRaw = firstParam(params.exception);
  const exception = exceptionRaw && exceptionRaw in exceptionLabels ? exceptionRaw as ExceptionKey : undefined;
  return {
    kind,
    period: firstParam(params.period)?.trim() ?? "",
    exception,
    person: firstParam(params.person)?.trim() || undefined,
    area: firstParam(params.area)?.trim() || undefined,
    q: firstParam(params.q)?.trim() || undefined,
    relation: firstParam(params.relation)?.trim() || undefined,
    filter: firstParam(params.filter)?.trim() || undefined,
  };
}

export function overviewQuery(search: Partial<OverviewSearch>) {
  const params = new URLSearchParams();
  if (search.kind) params.set("kind", search.kind);
  if (search.period) params.set("period", search.period);
  if (search.exception) params.set("exception", search.exception);
  if (search.person) params.set("person", search.person);
  if (search.area) params.set("area", search.area);
  if (search.q) params.set("q", search.q);
  if (search.relation) params.set("relation", search.relation);
  if (search.filter) params.set("filter", search.filter);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function hrefWithOverview(path: string, search: Partial<OverviewSearch>) {
  return `${path}${overviewQuery(search)}`;
}

export function dateForPeriodLabel(kind: PeriodKind, label?: string, now = new Date()) {
  if (!label) return now;
  if (kind === PeriodKind.WEEK) {
    const match = /^(\d{4})-W(\d{2})$/.exec(label);
    if (match) {
      const week1Monday = startOfBusinessWeek(new Date(Date.UTC(Number(match[1]), 0, 4)));
      return new Date(week1Monday.getTime() + (Number(match[2]) - 1) * 7 * 86400_000);
    }
  }
  if (kind === PeriodKind.MONTH) {
    const match = /^(\d{4})-(\d{2})$/.exec(label);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  }
  return dateFromQuarterLabel(label) ?? now;
}

export function adjacentPeriodDate(kind: PeriodKind, startAt: Date, delta: number) {
  if (kind === PeriodKind.WEEK) return addWeeks(startAt, delta);
  if (kind === PeriodKind.MONTH) return new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + delta, 1));
  return new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + delta * 3, 1));
}

export async function resolveSelectedPeriod(db: PeriodClient, search: OverviewSearch, now = new Date()) {
  const date = dateForPeriodLabel(search.kind, search.period || undefined, now);
  const tree = await ensurePeriodTree(db, date);
  const selected = search.kind === PeriodKind.MONTH ? tree.month : search.kind === PeriodKind.QUARTER ? tree.quarter : tree.week;
  return { ...tree, selected };
}

export async function descendantPeriodIds(db: PeriodClient, periodId: string) {
  const ids = [periodId];
  const queue = [periodId];
  while (queue.length) {
    const parentId = queue.shift()!;
    const children = await db.period.findMany({ where: { parentId }, select: { id: true } });
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

export async function tasksInPeriod(db: PrismaClient | Prisma.TransactionClient, period: Period, quarterId?: string | null) {
  const periodIds = await descendantPeriodIds(db, period.id);
  const or: Prisma.TaskWhereInput[] = [
    { schedulePeriodId: { in: periodIds } },
    { dueAt: { gte: period.startAt, lt: period.endAt } },
  ];
  if (period.kind !== PeriodKind.WEEK && quarterId) {
    or.push({ keyResult: { objective: { periodId: quarterId } } });
  }
  return db.task.findMany({
    where: { archivedAt: null, OR: or },
    include: overviewTaskInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function objectivesForQuarter(db: PrismaClient | Prisma.TransactionClient, quarterId: string) {
  return db.objective.findMany({
    where: { periodId: quarterId },
    include: {
      owner: { select: publicUser },
      keyResults: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function taskExceptionMatch(task: OverviewTask, exception: ExceptionKey | undefined, reportState?: CheckInReportState) {
  if (!exception) return true;
  if (exception === "risk") return !closed(task) && (task.health === "AT_RISK" || task.status === "BLOCKED");
  if (exception === "overdue") return overdue(task);
  if (exception === "pending") return !closed(task) && (!task.lastConfirmedAt || followUpState(task) === "late" || followUpState(task) === "missing");
  return reportState === CHECKIN_UNREPORTED;
}

export function countTaskExceptions(tasks: OverviewTask[], reportStateForTask: (task: OverviewTask) => CheckInReportState) {
  return {
    risk: tasks.filter(task => taskExceptionMatch(task, "risk")).length,
    overdue: tasks.filter(task => taskExceptionMatch(task, "overdue")).length,
    pending: tasks.filter(task => taskExceptionMatch(task, "pending")).length,
    unreported: tasks.filter(task => taskExceptionMatch(task, "unreported", reportStateForTask(task))).length,
  };
}

export function relatedTaskIdsForUnreported(
  kind: PeriodKind,
  tasks: OverviewTask[],
  unreportedIds: Set<string>,
) {
  const scope = expectedCheckInScope(kind);
  if (scope === "TASK") return new Set(tasks.filter(task => unreportedIds.has(task.id)).map(task => task.id));
  if (scope === "KEY_RESULT") return new Set(tasks.filter(task => task.keyResultId && unreportedIds.has(task.keyResultId)).map(task => task.id));
  return new Set(tasks.filter(task => task.keyResult && unreportedIds.has(task.keyResult.objectiveId)).map(task => task.id));
}

export type ExpectedTarget = {
  scopeType: "TASK" | "KEY_RESULT" | "OBJECTIVE";
  scopeId: string;
  title: string;
  ownerId: string;
  ownerName: string;
  href: string;
  subtitle?: string;
};

export function expectedTargets(
  kind: PeriodKind,
  tasks: OverviewTask[],
  objectives: Awaited<ReturnType<typeof objectivesForQuarter>>,
  search: OverviewSearch,
): ExpectedTarget[] {
  const query = overviewQuery({ ...search, kind, period: search.period });
  if (kind === PeriodKind.WEEK) {
    return tasks.filter(task => task.status !== "CANCELLED").map(task => ({
      scopeType: "TASK",
      scopeId: task.id,
      title: task.title,
      ownerId: task.ownerId,
      ownerName: task.owner.name,
      href: `/tasks/${task.id}${query}`,
      subtitle: task.keyResult?.title,
    }));
  }
  if (kind === PeriodKind.MONTH) {
    return objectives.flatMap(objective => objective.keyResults.map(keyResult => ({
      scopeType: "KEY_RESULT" as const,
      scopeId: keyResult.id,
      title: keyResult.title,
      ownerId: objective.ownerId,
      ownerName: objective.owner.name,
      href: `/okrs/${objective.id}${query}`,
      subtitle: objective.title,
    })));
  }
  return objectives.map(objective => ({
    scopeType: "OBJECTIVE",
    scopeId: objective.id,
    title: objective.title,
    ownerId: objective.ownerId,
    ownerName: objective.owner.name,
    href: `/okrs/${objective.id}${query}`,
    subtitle: objective.cycle,
  }));
}
