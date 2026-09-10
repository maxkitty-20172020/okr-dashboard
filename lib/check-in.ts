import { CheckInScopeType, CheckInStatus, PeriodKind, Prisma, PrismaClient, RaciRole, RaciSubjectType } from "@prisma/client";
import { snapshot, type Member } from "./tasks";

export const CHECKIN_UNREPORTED = "UNREPORTED" as const;
export type CheckInReportState = typeof CHECKIN_UNREPORTED | CheckInStatus;
export class CheckInError extends Error {}
export type CheckInClient = PrismaClient | Prisma.TransactionClient;

export const checkInStateLabels: Record<CheckInReportState, string> = {
  UNREPORTED: "未汇报",
  SUBMITTED: "已提交",
  NO_CHANGE: "确认暂无变化",
};

export const periodKindLabels: Record<PeriodKind, string> = {
  WEEK: "周更新",
  MONTH: "月复盘",
  QUARTER: "季评估",
};

export const scopeTypeLabels: Record<CheckInScopeType, string> = {
  TASK: "任务",
  KEY_RESULT: "关键结果",
  OBJECTIVE: "目标",
  DEPT: "部门",
};

const scopeTypes = new Set<string>(Object.values(CheckInScopeType));
const checkInStatuses = new Set<string>(Object.values(CheckInStatus));

export function checkInReportState(checkIn: { status: CheckInStatus } | null | undefined): CheckInReportState {
  return checkIn?.status ?? CHECKIN_UNREPORTED;
}

export function expectedCheckInScope(kind: PeriodKind): CheckInScopeType {
  if (kind === PeriodKind.MONTH) return CheckInScopeType.KEY_RESULT;
  if (kind === PeriodKind.QUARTER) return CheckInScopeType.OBJECTIVE;
  return CheckInScopeType.TASK;
}

export function parseCheckInScopeType(value: string): CheckInScopeType {
  if (!scopeTypes.has(value)) throw new CheckInError("汇报范围无效，请刷新页面。");
  return value as CheckInScopeType;
}

export function parseCheckInStatus(value: string): CheckInStatus {
  if (!checkInStatuses.has(value)) throw new CheckInError("汇报状态无效，请重新选择。");
  return value as CheckInStatus;
}

export function scopeKey(scopeType: CheckInScopeType, scopeId?: string | null) {
  return `${scopeType}:${scopeId ?? ""}`;
}

export async function findLatestCheckIn(
  db: CheckInClient,
  periodId: string,
  scopeType: CheckInScopeType,
  scopeId?: string | null,
) {
  return db.checkIn.findFirst({
    where: { periodId, scopeType, scopeId: scopeId ?? null },
    orderBy: { createdAt: "desc" },
  });
}

export async function checkInStateForScope(
  db: CheckInClient,
  periodId: string,
  scopeType: CheckInScopeType,
  scopeId?: string | null,
) {
  return checkInReportState(await findLatestCheckIn(db, periodId, scopeType, scopeId));
}

export async function latestCheckInMap(db: CheckInClient, periodId: string) {
  const rows = await db.checkIn.findMany({
    where: { periodId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const map = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = scopeKey(row.scopeType, row.scopeId);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

export async function unreportedScopeIds(
  db: CheckInClient,
  periodId: string,
  scopeType: CheckInScopeType,
  scopeIds: string[],
) {
  const map = await latestCheckInMap(db, periodId);
  return scopeIds.filter(id => checkInReportState(map.get(scopeKey(scopeType, id))) === CHECKIN_UNREPORTED);
}

async function hasRaciRA(db: CheckInClient, userId: string, subjectType: RaciSubjectType, subjectId: string) {
  const row = await db.raciAssignment.findFirst({
    where: { subjectType, subjectId, userId, role: { in: [RaciRole.R, RaciRole.A] } },
  });
  return !!row;
}

export async function canAuthorCheckIn(
  db: CheckInClient,
  actor: Pick<Member, "id" | "role">,
  scopeType: CheckInScopeType,
  scopeId?: string | null,
) {
  if (actor.role === "BOSS") return false;
  if (scopeType === CheckInScopeType.DEPT || !scopeId) return false;

  if (scopeType === CheckInScopeType.TASK) {
    const task = await db.task.findUnique({ where: { id: scopeId }, select: { ownerId: true } });
    if (!task) return false;
    return task.ownerId === actor.id || hasRaciRA(db, actor.id, RaciSubjectType.TASK, scopeId);
  }

  if (scopeType === CheckInScopeType.KEY_RESULT) {
    const keyResult = await db.keyResult.findUnique({
      where: { id: scopeId },
      select: {
        objective: { select: { ownerId: true } },
        tasks: { select: { id: true, ownerId: true } },
        workPackages: { select: { id: true } },
      },
    });
    if (!keyResult) return false;
    if (keyResult.objective.ownerId === actor.id) return true;
    if (keyResult.tasks.some(task => task.ownerId === actor.id)) return true;
    for (const task of keyResult.tasks) {
      if (await hasRaciRA(db, actor.id, RaciSubjectType.TASK, task.id)) return true;
    }
    for (const workPackage of keyResult.workPackages) {
      if (await hasRaciRA(db, actor.id, RaciSubjectType.WORK_PACKAGE, workPackage.id)) return true;
    }
    return false;
  }

  const objective = await db.objective.findUnique({
    where: { id: scopeId },
    select: {
      ownerId: true,
      keyResults: {
        select: {
          workPackages: { select: { id: true } },
        },
      },
    },
  });
  if (!objective) return false;
  if (objective.ownerId === actor.id) return true;
  for (const keyResult of objective.keyResults) {
    for (const workPackage of keyResult.workPackages) {
      if (await hasRaciRA(db, actor.id, RaciSubjectType.WORK_PACKAGE, workPackage.id)) return true;
    }
  }
  return false;
}

export async function submitCheckIn(db: PrismaClient, actor: Pick<Member, "id" | "role">, input: {
  periodId: string;
  scopeType: string;
  scopeId?: string | null;
  status: string;
  body: string;
  metricNote?: string | null;
  blocker?: string | null;
  nextStep?: string | null;
}) {
  const current = await db.user.findUnique({ where: { id: actor.id }, select: { id: true, name: true, role: true } });
  if (!current || current.role === "BOSS") throw new CheckInError("老板账号仅可查看，不能修改数据。");

  const scopeType = parseCheckInScopeType(input.scopeType);
  const status = parseCheckInStatus(input.status);
  const scopeId = input.scopeId?.trim() || null;
  if (scopeType !== CheckInScopeType.DEPT && !scopeId) throw new CheckInError("请选择要汇报的对象。");
  if (!(await canAuthorCheckIn(db, current, scopeType, scopeId))) {
    throw new CheckInError("只能为自己主责或担任 RACI 负责人 / 问责人的范围提交汇报。账号角色与 RACI 分工不是一回事。");
  }

  const period = await db.period.findUnique({ where: { id: input.periodId } });
  if (!period) throw new CheckInError("周期不存在，请刷新页面。");

  const clip = (value: string | null | undefined, label: string, max = 2000) => {
    const text = (value ?? "").trim();
    if (text.length > max) throw new CheckInError(`${label}过长，请控制在 ${max} 字以内。`);
    return text;
  };
  const body = status === CheckInStatus.NO_CHANGE
    ? clip(input.body, "说明") || "确认暂无变化"
    : clip(input.body, "进展事实");
  if (status === CheckInStatus.SUBMITTED && !body) throw new CheckInError("请填写进展事实。");

  const metricNote = clip(input.metricNote, "指标说明") || null;
  const blocker = clip(input.blocker, "阻塞") || null;
  const nextStep = clip(input.nextStep, "下一步") || null;

  return db.$transaction(async tx => {
    const checkIn = await tx.checkIn.create({
      data: {
        periodId: period.id,
        scopeType,
        scopeId,
        authorId: current.id,
        status,
        body,
        metricNote,
        blocker,
        nextStep,
      },
    });
    if (scopeType === CheckInScopeType.TASK && scopeId) {
      const task = await tx.task.findUnique({ where: { id: scopeId }, include: { owner: true } });
      if (task) {
        await tx.taskUpdate.create({
          data: {
            taskId: task.id,
            authorId: current.id,
            kind: status === CheckInStatus.NO_CHANGE ? "NO_CHANGE" : "CHECKIN",
            body,
            snapshot: snapshot(task),
          },
        });
      }
    }
    return checkIn;
  });
}
