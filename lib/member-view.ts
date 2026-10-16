import type { PrismaClient } from "@prisma/client";
import { requireBoss, unfinishedTasks } from "./member-service";

export async function loadMembers(db: PrismaClient, actor: { id: string }) {
  await requireBoss(db, actor);
  return db.user.findMany({ select: { id: true, name: true, email: true, role: true, disabledAt: true, createdAt: true,
    _count: { select: { tasks: { where: unfinishedTasks } } } }, orderBy: { createdAt: "asc" } });
}
