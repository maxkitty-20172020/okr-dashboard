import { visibleTaskWhere } from "./task-visibility";
import type { CheckInScopeType } from "@prisma/client";
import { scopeKey, type CheckInClient } from "./check-in";
import type { Member } from "./tasks";

export type CheckInTarget = { scopeType: CheckInScopeType; scopeId: string };

/** Request-local permission snapshot, with the same inheritance as canAuthorCheckIn.
 * Do not restrict linked tasks by period, status or archive: those restrictions
 * belong to the view, and have never restricted Check-in authorization.
 */
export async function loadCheckInAuthorizer(
  db: CheckInClient,
  actor: Pick<Member, "id" | "role">,
  targets: CheckInTarget[],
) {
  if (actor.role === "BOSS") return () => false;
  const ids = (scope: CheckInScopeType) => targets
    .filter(target => target.scopeType === scope)
    .map(target => target.scopeId);
  const taskIds = ids("TASK");
  const krIds = ids("KEY_RESULT");
  const objectiveIds = ids("OBJECTIVE");
  const [tasks, keyResults, objectives] = await Promise.all([
    taskIds.length ? db.task.findMany({
      where: { id: { in: taskIds }, AND: [visibleTaskWhere(actor)] },
      select: { id: true, ownerId: true },
    }) : [],
    krIds.length ? db.keyResult.findMany({
      where: { id: { in: krIds } },
      select: {
        id: true,
        objective: { select: { ownerId: true } },
        tasks: { select: { id: true, ownerId: true } },
        workPackages: { select: { id: true } },
      },
    }) : [],
    objectiveIds.length ? db.objective.findMany({
      where: { id: { in: objectiveIds } },
      select: {
        id: true,
        ownerId: true,
        keyResults: { select: { workPackages: { select: { id: true } } } },
      },
    }) : [],
  ]);
  const relatedTaskIds = [...taskIds, ...keyResults.flatMap(kr => kr.tasks.map(task => task.id))];
  const workPackageIds = [
    ...keyResults.flatMap(kr => kr.workPackages.map(wp => wp.id)),
    ...objectives.flatMap(objective => objective.keyResults.flatMap(kr => kr.workPackages.map(wp => wp.id))),
  ];
  const assignments = relatedTaskIds.length || workPackageIds.length
    ? await db.raciAssignment.findMany({
      where: {
        userId: actor.id,
        role: { in: ["R", "A"] },
        OR: [
          { subjectType: "TASK", subjectId: { in: relatedTaskIds } },
          { subjectType: "WORK_PACKAGE", subjectId: { in: workPackageIds } },
        ],
      },
      select: { subjectType: true, subjectId: true },
    }) : [];
  const raci = new Set(assignments.map(row => `${row.subjectType}:${row.subjectId}`));
  const allowed = new Set<string>();
  for (const task of tasks) {
    if (task.ownerId === actor.id || raci.has(`TASK:${task.id}`)) allowed.add(scopeKey("TASK", task.id));
  }
  for (const kr of keyResults) {
    if (kr.objective.ownerId === actor.id
      || kr.tasks.some(task => task.ownerId === actor.id || raci.has(`TASK:${task.id}`))
      || kr.workPackages.some(wp => raci.has(`WORK_PACKAGE:${wp.id}`))) {
      allowed.add(scopeKey("KEY_RESULT", kr.id));
    }
  }
  for (const objective of objectives) {
    // Owning a task / TASK RACI grants its KR, but not the parent objective.
    if (objective.ownerId === actor.id
      || objective.keyResults.some(kr => kr.workPackages.some(wp => raci.has(`WORK_PACKAGE:${wp.id}`)))) {
      allowed.add(scopeKey("OBJECTIVE", objective.id));
    }
  }
  return (scopeType: CheckInScopeType, scopeId?: string | null) => allowed.has(scopeKey(scopeType, scopeId));
}
