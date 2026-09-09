import { PeriodKind, Prisma, PrismaClient } from "@prisma/client";
import { dateFromQuarterLabel, monthBounds, quarterBounds, weekBounds } from "./week";

export type PeriodClient = PrismaClient | Prisma.TransactionClient;

async function ensurePeriod(
  db: PeriodClient,
  kind: PeriodKind,
  label: string,
  startAt: Date,
  endAt: Date,
  parentId?: string | null,
) {
  const row = await db.period.upsert({
    where: { kind_label: { kind, label } },
    create: { kind, label, startAt, endAt, parentId: parentId ?? null },
    update: {},
  });
  if (parentId && row.parentId !== parentId) {
    return db.period.update({ where: { id: row.id }, data: { parentId } });
  }
  return row;
}

export async function ensurePeriodTree(db: PeriodClient, date = new Date()) {
  const quarterInfo = quarterBounds(date);
  const quarter = await ensurePeriod(db, PeriodKind.QUARTER, quarterInfo.label, quarterInfo.startAt, quarterInfo.endAt);
  const monthInfo = monthBounds(date);
  const monthQuarterInfo = quarterBounds(monthInfo.startAt);
  const monthQuarter = await ensurePeriod(db, PeriodKind.QUARTER, monthQuarterInfo.label, monthQuarterInfo.startAt, monthQuarterInfo.endAt);
  const month = await ensurePeriod(db, PeriodKind.MONTH, monthInfo.label, monthInfo.startAt, monthInfo.endAt, monthQuarter.id);
  const weekInfo = weekBounds(date);
  const weekMonthInfo = monthBounds(weekInfo.startAt);
  const weekQuarterInfo = quarterBounds(weekInfo.startAt);
  const weekQuarter = await ensurePeriod(db, PeriodKind.QUARTER, weekQuarterInfo.label, weekQuarterInfo.startAt, weekQuarterInfo.endAt);
  const weekMonth = await ensurePeriod(db, PeriodKind.MONTH, weekMonthInfo.label, weekMonthInfo.startAt, weekMonthInfo.endAt, weekQuarter.id);
  const week = await ensurePeriod(db, PeriodKind.WEEK, weekInfo.label, weekInfo.startAt, weekInfo.endAt, weekMonth.id);
  return { quarter, month, week };
}

export async function resolveQuarterPeriod(db: PeriodClient, cycle?: string) {
  const date = (cycle && dateFromQuarterLabel(cycle)) || new Date();
  const { quarter } = await ensurePeriodTree(db, date);
  return quarter;
}

export async function backfillObjectivePeriods(db: PeriodClient) {
  const objectives = await db.objective.findMany({ where: { periodId: null } });
  for (const objective of objectives) {
    const quarter = await resolveQuarterPeriod(db, objective.cycle);
    await db.objective.update({ where: { id: objective.id }, data: { periodId: quarter.id } });
  }
}

export async function rescheduleTask(db: PeriodClient, taskId: string, schedulePeriodId: string | null, dueAt?: Date | null) {
  return db.task.update({
    where: { id: taskId },
    data: { schedulePeriodId, ...(dueAt !== undefined ? { dueAt } : {}) },
  });
}

export function effectiveKeyResultPeriodId(keyResult: { periodId: string | null; objective: { periodId: string | null } }) {
  return keyResult.periodId ?? keyResult.objective.periodId;
}
