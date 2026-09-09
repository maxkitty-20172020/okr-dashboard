import { CheckInScopeType, CheckInStatus, Prisma, PrismaClient } from "@prisma/client";

export const CHECKIN_UNREPORTED = "UNREPORTED" as const;
export type CheckInReportState = typeof CHECKIN_UNREPORTED | CheckInStatus;

export const checkInStateLabels: Record<CheckInReportState, string> = {
  UNREPORTED: "未汇报",
  SUBMITTED: "已提交",
  NO_CHANGE: "确认暂无变化",
};

export function checkInReportState(checkIn: { status: CheckInStatus } | null | undefined): CheckInReportState {
  return checkIn?.status ?? CHECKIN_UNREPORTED;
}

export async function findLatestCheckIn(
  db: PrismaClient | Prisma.TransactionClient,
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
  db: PrismaClient | Prisma.TransactionClient,
  periodId: string,
  scopeType: CheckInScopeType,
  scopeId?: string | null,
) {
  return checkInReportState(await findLatestCheckIn(db, periodId, scopeType, scopeId));
}
