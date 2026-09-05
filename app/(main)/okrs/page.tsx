import { OkrBoard } from "@/components/okr-board";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentCycle } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function OkrsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
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
      {params.error && <p className="form-error" role="alert">{params.error === "range" ? "目标方向与起点不一致：提升的目标须高于起点，降低的目标须低于起点。修改未保存。" : "请填写有效的起点值、当前值和目标值。修改未保存。"}</p>}
      <OkrBoard
        currentUserId={session.id}
        users={users}
        objectives={objectives}
        cycle={currentCycle()}
        readOnly={session.role === "BOSS"}
      />
    </div>
  );
}
