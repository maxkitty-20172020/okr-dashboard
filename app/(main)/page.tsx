import { prisma } from "@/lib/prisma";
import { average, progressPercent, statusLabel } from "@/lib/okr";
import { formatWeekRange, startOfWeek } from "@/lib/week";
import { ProgressBar } from "@/components/progress-bar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const weekStart = startOfWeek();
  const [objectives, tasks, users] = await Promise.all([
    prisma.objective.findMany({
      include: { owner: true, keyResults: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.weeklyTask.findMany({
      where: { weekStart },
      include: { owner: true, keyResult: true },
      orderBy: [{ owner: { name: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const krPercents = objectives.flatMap((objective) =>
    objective.keyResults.map((kr) => progressPercent(kr.currentValue, kr.targetValue)),
  );
  const overall = average(krPercents);
  const doneCount = tasks.filter((task) => task.status === "DONE").length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-xs tracking-[0.18em] text-muted uppercase">Leadership view</p>
        <h1 className="mt-2 font-serif text-4xl italic">总览</h1>
        <p className="mt-2 text-muted">所有人看到同一份进度。本周 {formatWeekRange(weekStart)}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="进行中的目标" value={`${objectives.length}`} hint="当前季度 Objective" />
        <StatCard label="关键结果平均进度" value={`${Math.round(overall)}%`} hint="按 KR 完成度平均" />
        <StatCard
          label="本周任务完成"
          value={`${doneCount}/${tasks.length}`}
          hint={`${users.length} 人共同填写`}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">目标进度</h2>
        {objectives.length === 0 ? (
          <EmptyCard text="还没有 Objective。去「OKR 编辑」添加第一条目标。" />
        ) : (
          <div className="space-y-4">
            {objectives.map((objective) => {
              const percent = average(
                objective.keyResults.map((kr) =>
                  progressPercent(kr.currentValue, kr.targetValue),
                ),
              );
              return (
                <article key={objective.id} className="rounded-2xl border border-line bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted">
                        {objective.cycle} · {objective.owner.name}
                      </p>
                      <h3 className="mt-1 text-xl">{objective.title}</h3>
                      {objective.description ? (
                        <p className="mt-1 max-w-3xl text-sm text-muted">{objective.description}</p>
                      ) : null}
                    </div>
                    <p className="font-serif text-3xl italic">{Math.round(percent)}%</p>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={percent} />
                  </div>
                  <ul className="mt-5 grid gap-3 md:grid-cols-2">
                    {objective.keyResults.map((kr) => {
                      const krPercent = progressPercent(kr.currentValue, kr.targetValue);
                      return (
                        <li key={kr.id} className="rounded-xl bg-paper px-4 py-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span>{kr.title}</span>
                            <span className="shrink-0 text-muted">
                              {kr.currentValue}/{kr.targetValue} {kr.unit}
                            </span>
                          </div>
                          <div className="mt-2">
                            <ProgressBar value={krPercent} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">本周任务</h2>
        {tasks.length === 0 ? (
          <EmptyCard text="本周还没有任务。去「本周任务」给自己加一条。" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper/80 text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">负责人</th>
                  <th className="px-4 py-3 font-medium">任务</th>
                  <th className="px-4 py-3 font-medium">关联 KR</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t border-line">
                    <td className="px-4 py-3 whitespace-nowrap">{task.owner.name}</td>
                    <td className="px-4 py-3">{task.title}</td>
                    <td className="px-4 py-3 text-muted">{task.keyResult?.title ?? "未关联"}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={task.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-serif text-4xl italic">{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-10 text-center text-muted">
      {text}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "DONE"
      ? "bg-[#e5efe8] text-forest"
      : status === "IN_PROGRESS"
        ? "bg-[#f4ead6] text-gold-strong"
        : "bg-[#eeeae2] text-muted";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
