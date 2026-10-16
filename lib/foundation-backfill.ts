import { PeriodKind, Prisma, RaciRole } from "@prisma/client";
import { type PeriodClient } from "./period";
import { dateFromQuarterLabel, monthBounds, quarterBounds, weekBounds } from "./week";

type PeriodSpec = { kind: PeriodKind; label: string; startAt: Date; endAt: Date; parentKey: string | null; id?: string; updateParent: boolean };
const periodKey = (kind: PeriodKind, label: string) => `${kind}:${label}`;

/** Read-only plan shared by preview and execution. No business rows are removed. */
export async function planFoundationBackfill(db: PeriodClient, now = new Date()) {
  const [periods, objectives, tasks, raci, collaborators, deliverables] = await Promise.all([
    db.period.findMany(), db.objective.findMany({ where: { periodId: null } }),
    db.task.findMany({ select: { id: true, ownerId: true } }),
    db.raciAssignment.findMany({ where: { subjectType: "TASK" } }),
    db.taskCollaborator.findMany(), db.deliverable.findMany(),
  ]);
  const existingPeriods = new Map(periods.map(p => [periodKey(p.kind, p.label), p]));
  const specs = new Map<string, PeriodSpec>();
  function add(kind: PeriodKind, bounds: { label: string; startAt: Date; endAt: Date }, parentKey: string | null = null) {
    const key = periodKey(kind, bounds.label);
    const existing = existingPeriods.get(key);
    const parent = parentKey ? existingPeriods.get(parentKey) : undefined;
    specs.set(key, { kind, ...bounds, parentKey, id: existing?.id, updateParent: !!existing && !!parentKey && (!parent || existing.parentId !== parent.id) });
    return key;
  }
  function tree(date: Date) {
    const quarter = add("QUARTER", quarterBounds(date));
    const month = monthBounds(date);
    add("MONTH", month, add("QUARTER", quarterBounds(month.startAt)));
    const week = weekBounds(date);
    const weekMonth = monthBounds(week.startAt);
    add("WEEK", week, add("MONTH", weekMonth, add("QUARTER", quarterBounds(week.startAt))));
    return quarter;
  }
  tree(now);
  const objectiveUpdates = objectives.map(objective => ({ id: objective.id, updatedAt: objective.updatedAt, periodKey: tree(dateFromQuarterLabel(objective.cycle) ?? now) }));
  const owners = new Map(tasks.map(t => [t.id, t.ownerId]));
  const raciDeletes = raci.filter(r => owners.has(r.subjectId) && (r.role === "R" || r.role === "A") && r.userId !== owners.get(r.subjectId)).map(r => r.id);
  const raciCreates: Prisma.RaciAssignmentCreateManyInput[] = [];
  const raciKeys = new Set(raci.map(r => JSON.stringify([r.subjectId, r.role, r.userId])));
  function assignment(subjectId: string, role: RaciRole, userId: string) {
    const key = JSON.stringify([subjectId, role, userId]);
    if (raciKeys.has(key)) return;
    raciKeys.add(key);
    raciCreates.push({ subjectType: "TASK", subjectId, role, userId });
  }
  for (const task of tasks) {
    assignment(task.id, "R", task.ownerId);
    assignment(task.id, "A", task.ownerId);
  }
  const deliverableKeys = new Set(deliverables.map(d => JSON.stringify([d.taskId, d.ownerUserId, d.title])));
  const deliverableCreates: Prisma.DeliverableCreateManyInput[] = [];
  for (const row of collaborators) {
    if (row.active && row.userId !== owners.get(row.taskId)) assignment(row.taskId, "C", row.userId);
    const key = JSON.stringify([row.taskId, row.userId, row.deliverable]);
    if (deliverableKeys.has(key)) continue;
    deliverableKeys.add(key);
    deliverableCreates.push({ taskId: row.taskId, ownerUserId: row.userId, title: row.deliverable, dueAt: row.dueAt, done: row.done, note: row.note, active: row.active });
  }
  const periodPlans = [...specs.entries()];
  const changes = {
    periodsCreated: periodPlans.filter(([, p]) => !p.id).length,
    periodsUpdated: periodPlans.filter(([, p]) => p.updateParent).length,
    objectivePeriodsUpdated: objectiveUpdates.length,
    raciCreated: raciCreates.length,
    raciDeleted: raciDeletes.length,
    deliverablesCreated: deliverableCreates.length,
  };
  return { periodPlans, objectiveUpdates, raciCreates, raciDeletes, deliverableCreates, changes };
}

export async function executeFoundationPlan(db: PeriodClient, plan: Awaited<ReturnType<typeof planFoundationBackfill>>) {
  const ids = new Map(plan.periodPlans.filter(([, p]) => p.id).map(([key, p]) => [key, p.id!]));
  // Parents are always created before children, regardless of input ordering.
  for (const kind of ["QUARTER", "MONTH", "WEEK"] as const) {
    for (const [key, p] of plan.periodPlans) {
      if (p.kind !== kind) continue;
      const parentId = p.parentKey ? ids.get(p.parentKey)! : null;
      if (!p.id) {
        const created = await db.period.create({ data: { kind: p.kind, label: p.label, startAt: p.startAt, endAt: p.endAt, parentId } });
        ids.set(key, created.id);
      } else if (p.updateParent) {
        await db.period.update({ where: { id: p.id }, data: { parentId } });
      }
    }
  }
  for (const objective of plan.objectiveUpdates) {
    await db.objective.update({ where: { id: objective.id }, data: { periodId: ids.get(objective.periodKey)!, updatedAt: objective.updatedAt } });
  }
  if (plan.raciDeletes.length) await db.raciAssignment.deleteMany({ where: { id: { in: plan.raciDeletes } } });
  if (plan.raciCreates.length) await db.raciAssignment.createMany({ data: plan.raciCreates });
  if (plan.deliverableCreates.length) await db.deliverable.createMany({ data: plan.deliverableCreates });
  return plan.changes;
}
