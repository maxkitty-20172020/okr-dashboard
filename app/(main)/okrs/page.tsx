import { OkrBoard } from "@/components/okr-board";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentCycle } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function OkrsPage() {
  const session = await requireSession();
  const [users, objectives] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.objective.findMany({
      include: { owner: true, keyResults: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <OkrBoard
        currentUserId={session.id}
        users={users}
        objectives={objectives}
        cycle={currentCycle()}
      />
    </div>
  );
}
