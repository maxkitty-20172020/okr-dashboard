import { WeekBoard } from "@/components/week-board";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekFromParam } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const weekStart = weekFromParam(params.week);

  const [users, keyResults, tasks] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.keyResult.findMany({
      include: { objective: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.weeklyTask.findMany({
      where: { weekStart },
      include: { owner: true, keyResult: { include: { objective: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <WeekBoard
        weekStart={weekStart}
        currentUserId={session.id}
        users={users}
        keyResults={keyResults}
        tasks={tasks}
      />
    </div>
  );
}
