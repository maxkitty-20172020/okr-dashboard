import { Prisma, PrismaClient, RaciRole, RaciSubjectType } from "@prisma/client";

export class RaciError extends Error {}
export type RaciClient = PrismaClient | Prisma.TransactionClient;

export async function assignRaci(db: RaciClient, input: {
  subjectType: RaciSubjectType;
  subjectId: string;
  role: RaciRole;
  userId: string;
}) {
  if (input.role === RaciRole.A || input.role === RaciRole.R) {
    const existing = await db.raciAssignment.findMany({
      where: { subjectType: input.subjectType, subjectId: input.subjectId, role: input.role },
    });
    if (existing.some(row => row.userId !== input.userId)) {
      throw new RaciError(input.role === RaciRole.A ? "该对象已有问责人 A，v1 最多一名。" : "该对象已有负责人 R，v1 最多一名。");
    }
  }
  return db.raciAssignment.upsert({
    where: { subjectType_subjectId_role_userId: input },
    create: input,
    update: {},
  });
}

export async function ensureTaskRaciDefaults(db: RaciClient, task: {
  id: string;
  ownerId: string;
  collaborators?: { userId: string; active: boolean }[];
}) {
  await assignRaci(db, { subjectType: RaciSubjectType.TASK, subjectId: task.id, role: RaciRole.R, userId: task.ownerId });
  await assignRaci(db, { subjectType: RaciSubjectType.TASK, subjectId: task.id, role: RaciRole.A, userId: task.ownerId });
  for (const collaborator of task.collaborators ?? []) {
    if (!collaborator.active || collaborator.userId === task.ownerId) continue;
    await assignRaci(db, { subjectType: RaciSubjectType.TASK, subjectId: task.id, role: RaciRole.C, userId: collaborator.userId });
  }
}

export async function backfillTaskRaci(db: RaciClient) {
  const tasks = await db.task.findMany({
    select: { id: true, ownerId: true, collaborators: { select: { userId: true, active: true } } },
  });
  for (const task of tasks) {
    await ensureTaskRaciDefaults(db, task);
  }
}

export async function listSubjectRaci(db: RaciClient, subjectType: RaciSubjectType, subjectId: string) {
  return db.raciAssignment.findMany({
    where: { subjectType, subjectId },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });
}
