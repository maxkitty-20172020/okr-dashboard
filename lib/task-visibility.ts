import type { Prisma } from "@prisma/client";
import type { Member } from "./tasks";

type Viewer = Pick<Member, "id" | "role">;
export const TASK_NOT_VISIBLE = "这项事项不存在或你无权查看";

/** The only task visibility policy. Keep its database and in-memory forms together. */
export function visibleTaskWhere(user: Viewer): Prisma.TaskWhereInput {
  if (user.role === "BOSS") return {};
  return { OR: [
    { ownerId: user.id },
    { collaborators: { some: { userId: user.id, active: true } } },
    { updates: { some: { kind: "CREATED", authorId: user.id } } },
  ] };
}

export function canViewTask(user: Viewer, task: {
  ownerId: string;
  collaborators: { userId: string; active: boolean }[];
  updates: { kind: string; authorId: string | null }[];
}) {
  return user.role === "BOSS" || task.ownerId === user.id
    || task.collaborators.some(row => row.active && row.userId === user.id)
    || task.updates.some(row => row.kind === "CREATED" && row.authorId === user.id);
}

/** Explicit "see everything" viewer for scripts and tests; never use it for a signed-in request. */
export const SYSTEM_VIEWER = { id: "system", name: "系统", role: "BOSS" } as const;
