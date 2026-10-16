import type { CheckInClient } from "./check-in";
import {
  closed, completedThisWeek, followUpState, needsAttention, publicUser,
  sortTasks, taskInclude, type Member,
} from "./tasks";

export async function loadDashboard(db: CheckInClient, user: Member) {
  const [allTasks, members, updates] = await Promise.all([
    db.task.findMany({ include: taskInclude }),
    db.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } }),
    db.taskUpdate.findMany(
      {
        where: { task: { archivedAt: null } },
        include: { author: { select: { name: true } }, task: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 8
      }
    ),
  ]);
  const active = sortTasks(allTasks.filter(t => !closed(t) && !t.archivedAt));
  const attention = active.filter(t => needsAttention(t));
  const owned = active.filter(t => t.ownerId === user.id);
  const collaborating = active.filter(t => t.ownerId !== user.id && t.collaborators.some(c => c.userId === user.id));
  const followUps = owned.filter(t => followUpState(t) !== "scheduled");
  const recentDone = allTasks.filter(t => completedThisWeek(t));
  const boss = user.role === "BOSS";

  const people = members
    .filter(m => m.role !== "BOSS" || active.some(t => t.ownerId === m.id))
    .sort((a, b) => Number(a.role === "BOSS") - Number(b.role === "BOSS"));
  const personViews = new Map(people.map(m => [m.id, {
    own: active.filter(t => t.ownerId === m.id),
    assisting: active.filter(t => t.collaborators.some(c => c.userId === m.id)),
  }]));
  const remainingOwned = owned.filter(t => !followUps.some(f => f.id === t.id));
  return {
    active, attention, owned, collaborating, followUps, recentDone, boss,
    updates, people, personViews, remainingOwned,
    memberCount: members.filter(m => m.role !== "BOSS").length
  };
}
