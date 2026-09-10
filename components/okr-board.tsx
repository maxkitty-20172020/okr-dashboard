import type { KeyResult, Objective, User } from "@prisma/client";
import Link from "next/link";
import {
  createKeyResultAction,
  createObjectiveAction,
  deleteKeyResultAction,
  deleteObjectiveAction,
  updateKeyResultAction,
  updateObjectiveAction,
} from "@/lib/actions";
import { ProgressBar } from "@/components/progress-bar";
import { progressPercent } from "@/lib/okr";

type ObjectiveRow = Objective & {
  owner: User;
  keyResults: KeyResult[];
};

export function OkrBoard({
  currentUserId,
  users,
  objectives,
  cycle,
  readOnly = false,
}: {
  currentUserId: string;
  users: User[];
  objectives: ObjectiveRow[];
  cycle: string;
  readOnly?: boolean;
}) {

  if (readOnly) return <div className="page"><header className="page-heading"><div><p className="eyebrow">经营结果</p><h1>目标与结果</h1><p className="muted">查看目标、当前值与关键结果，老板账号无需填写。可下钻到任务、交付物和 Check-in。</p></div><span className="readonly-label">老板账号 · 只读</span></header><div className="space-y-4">{objectives.map(o => <article key={o.id} className="surface detail-section"><p className="muted small">{o.cycle} · {o.owner.name}</p><h2><Link href={`/okrs/${o.id}`}>{o.title}</Link></h2><p className="section-help">{o.description}</p><div className="space-y-4">{o.keyResults.map(kr => <div key={kr.id}><div className="section-heading"><span>{kr.title}</span><span className="muted small">{kr.direction === "DECREASE" ? "降低" : "提升"} · 当前 {kr.currentValue} / 目标 {kr.targetValue} {kr.unit}</span></div><ProgressBar value={progressPercent(kr.currentValue, kr.targetValue, kr.baselineValue, kr.direction)} /><p className="muted small">起点 {kr.baselineValue} {kr.unit}</p></div>)}</div><Link className="text-link" href={`/okrs/${o.id}`}>查看任务与汇报 →</Link></article>)}{!objectives.length && <div className="empty-state">还没有设置目标与关键结果。</div>}</div></div>;
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs tracking-[0.18em] text-muted uppercase">Objectives</p>
        <h1 className="mt-2 font-serif text-4xl italic">目标与结果</h1>
        <p className="mt-2 text-muted">先写目标，再补可量化的关键结果。当前周期 {cycle}</p>
      </header>

      <form action={createObjectiveAction} className="rounded-2xl border border-line bg-card p-5">
        <h2 className="text-lg font-medium">新增 Objective</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-muted">目标</span>
            <input
              name="title"
              required
              placeholder="这个季度最重要的结果是什么"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-muted">说明</span>
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none ring-gold/40 focus:ring-2"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">周期</span>
            <input
              name="cycle"
              defaultValue={cycle}
              required
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
            />
          </label>
          <label>
            <span className="mb-1 block text-sm text-muted">负责人</span>
            <select
              name="ownerId"
              defaultValue={currentUserId}
              className="w-full rounded-lg border border-line bg-white px-3 py-2"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm text-[#f7f1e6]">
          保存目标
        </button>
      </form>

      <div className="space-y-5">
        {objectives.map((objective) => (
          <article key={objective.id} className="rounded-2xl border border-line bg-card p-5">
            <p className="mb-3 text-sm"><Link className="text-link" href={`/okrs/${objective.id}`}>查看任务、交付物与汇报 →</Link></p>
            <form action={updateObjectiveAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={objective.id} />
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm text-muted">目标</span>
                <input
                  name="title"
                  defaultValue={objective.title}
                  required
                  className="w-full rounded-lg border border-line bg-white px-3 py-2"
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm text-muted">说明</span>
                <textarea
                  name="description"
                  defaultValue={objective.description}
                  rows={2}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2"
                />
              </label>
              <label>
                <span className="mb-1 block text-sm text-muted">周期</span>
                <input
                  name="cycle"
                  defaultValue={objective.cycle}
                  required
                  className="w-full rounded-lg border border-line bg-white px-3 py-2"
                />
              </label>
              <label>
                <span className="mb-1 block text-sm text-muted">负责人</span>
                <select
                  name="ownerId"
                  defaultValue={objective.ownerId}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm text-[#f7f1e6]">
                  更新目标
                </button>
              </div>
            </form>
            <form action={deleteObjectiveAction} className="mt-2">
              <input type="hidden" name="id" value={objective.id} />
              <button type="submit" className="text-sm text-danger">
                删除这个目标及其关键结果
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-muted">关键结果</h3>
              {objective.keyResults.map((kr) => (
                <div key={kr.id} className="rounded-xl bg-paper p-4">
                  <div className="mb-3">
                    <ProgressBar value={progressPercent(kr.currentValue, kr.targetValue, kr.baselineValue, kr.direction)} />
                  </div>
                  <form action={updateKeyResultAction} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="id" value={kr.id} />
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-xs text-muted">KR</span>
                      <input
                        name="title"
                        defaultValue={kr.title}
                        required
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">当前值</span>
                      <input
                        name="currentValue"
                        type="number"
                        step="any"
                        defaultValue={kr.currentValue}
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">目标值</span>
                      <input
                        name="targetValue"
                        type="number"
                        step="any"
                        defaultValue={kr.targetValue}
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label><span className="mb-1 block text-xs text-muted">起点值</span><input className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" name="baselineValue" type="number" step="any" defaultValue={kr.baselineValue} required /></label>
                    <label><span className="mb-1 block text-xs text-muted">目标方向</span><select className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" name="direction" defaultValue={kr.direction}><option value="INCREASE">提升（目标高于起点）</option><option value="DECREASE">降低（目标低于起点）</option></select></label>
                    <label>
                      <span className="mb-1 block text-xs text-muted">单位</span>
                      <input
                        name="unit"
                        defaultValue={kr.unit}
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex items-end gap-3 md:col-span-3">
                      <button type="submit" className="rounded-lg bg-ink px-3 py-2 text-sm text-[#f7f1e6]">
                        更新 KR
                      </button>
                    </div>
                  </form>
                  <form action={deleteKeyResultAction} className="mt-2">
                    <input type="hidden" name="id" value={kr.id} />
                    <button type="submit" className="text-xs text-danger">
                      删除 KR
                    </button>
                  </form>
                </div>
              ))}

              <form action={createKeyResultAction} className="grid gap-3 rounded-xl border border-dashed border-line p-4 md:grid-cols-4">
                <input type="hidden" name="objectiveId" value={objective.id} />
                <label className="md:col-span-2">
                  <span className="mb-1 block text-xs text-muted">新 KR</span>
                  <input
                    name="title"
                    required
                    placeholder="可量化的结果"
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-muted">当前值</span>
                  <input
                    name="currentValue"
                    type="number"
                    step="any"
                    defaultValue={0}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs text-muted">目标值</span>
                  <input
                    name="targetValue"
                    type="number"
                    step="any"
                    defaultValue={100}
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label><span className="mb-1 block text-xs text-muted">起点值</span><input className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" name="baselineValue" type="number" step="any" defaultValue={0} required /></label>
                <label><span className="mb-1 block text-xs text-muted">目标方向</span><select className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" name="direction" defaultValue="INCREASE"><option value="INCREASE">提升（目标高于起点）</option><option value="DECREASE">降低（目标低于起点）</option></select></label>
                <label>
                  <span className="mb-1 block text-xs text-muted">单位</span>
                  <input
                    name="unit"
                    defaultValue="%"
                    className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex items-end md:col-span-3">
                  <button type="submit" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                    添加 KR
                  </button>
                </div>
              </form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
