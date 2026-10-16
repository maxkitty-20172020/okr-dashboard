import { type PeriodClient } from "./period";
import { executeFoundationPlan, planFoundationBackfill } from "./foundation-backfill";

export async function backfillDeliverablesFromCollaborators(db: PeriodClient) {
  const collaborators = await db.taskCollaborator.findMany();
  for (const row of collaborators) {
    const existing = await db.deliverable.findFirst({
      where: { taskId: row.taskId, ownerUserId: row.userId, title: row.deliverable },
    });
    if (existing) continue;
    await db.deliverable.create({
      data: {
        taskId: row.taskId,
        ownerUserId: row.userId,
        title: row.deliverable,
        dueAt: row.dueAt,
        done: row.done,
        note: row.note,
        active: row.active,
      },
    });
  }
}

export async function applyFoundationBackfill(db: PeriodClient) {
  return executeFoundationPlan(db, await planFoundationBackfill(db));
}
