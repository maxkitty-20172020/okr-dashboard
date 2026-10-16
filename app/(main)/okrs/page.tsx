import { okrErrorMessages } from "@/lib/okr-service";
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
      {params.error && <p className="form-error" role="alert">{Object.hasOwn(okrErrorMessages, params.error) ? okrErrorMessages[params.error as keyof typeof okrErrorMessages] : "修改未保存，请刷新页面后重试。"}</p>}
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
