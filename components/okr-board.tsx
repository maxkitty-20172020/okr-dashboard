import { formatPeriod, formatMetric } from "@/lib/display";
import { QuarterField } from "@/components/quarter-field";
import { Disclosure } from "@/components/ui/disclosure";
import type { KeyResult, Objective, User } from "@prisma/client";
import Link from "next/link";
import { createKeyResultAction, createObjectiveAction, deleteKeyResultAction, deleteObjectiveAction, updateKeyResultAction, updateObjectiveAction } from "@/lib/actions";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { StatusBadge } from "@/components/ui/status-badge";
import { keyResultAchievementRate, progressPercent } from "@/lib/okr";
import { objectiveTaskCount } from "@/lib/redesign-view";

type ObjectiveRow = Objective & { owner: User; keyResults: (KeyResult & { _count: { tasks: number } })[] };
function ObjectiveFields({ objective, users, cycle, ownerId }: { objective?: Objective; users: User[]; cycle: string; ownerId: string }) {
  return <div className="fields">
    <Field className="span-all" label="目标" help="写这个季度最重要的结果。"><input name="title" required defaultValue={objective?.title} placeholder="例：提高核心产品的盈利能力" /></Field>
    <Field className="span-all" label="说明" help="补充为什么做、希望带来什么变化。"><textarea name="description" rows={2} defaultValue={objective?.description} placeholder="例：优化产品结构，减少低效投入" /></Field>
    <QuarterField cycle={objective?.cycle ?? cycle} />
    <ChoiceChips name="ownerId" legend="负责人" help="选择维护这个目标的人。" defaultValue={objective?.ownerId ?? ownerId} options={users.map(user => ({ value: user.id, label: user.name }))} />
  </div>;
}
function KeyResultFields({ result }: { result?: KeyResult }) {
  return <div className="fields">
    <Field className="span-all" label={result ? "关键结果" : "新的关键结果"} help="写一个可量化的业务结果。"><input name="title" required defaultValue={result?.title} placeholder="例：核心产品转化率达到 15%" /></Field>
    <Field label="当前值" help="填写最新实际数值。"><input name="currentValue" type="number" step="any" defaultValue={result?.currentValue ?? 0} placeholder="例：12" /></Field>
    <Field label="目标值" help="填写期末希望达到的数值。"><input name="targetValue" type="number" step="any" defaultValue={result?.targetValue ?? 100} placeholder="例：15" /></Field>
    <Field label="起点值" help="填写开始时的数值，用来计算达成度。"><input name="baselineValue" type="number" step="any" required defaultValue={result?.baselineValue ?? 0} placeholder="例：10" /></Field>
    <Field label="单位" help="填写数值使用的单位。"><input name="unit" defaultValue={result?.unit ?? "%"} placeholder="例：%" /></Field>
    <ChoiceChips name="direction" legend="目标方向" help="数值提升还是降低。例：成本选降低。" defaultValue={result?.direction ?? "INCREASE"} options={[{ value: "INCREASE", label: "提升（目标高于起点）" }, { value: "DECREASE", label: "降低（目标低于起点）" }]} />
  </div>;
}
export function OkrBoard({ currentUserId, users, objectives, cycle, readOnly = false }: { currentUserId: string; users: User[]; objectives: ObjectiveRow[]; cycle: string; readOnly?: boolean }) {
  return <div className="page">
    <header className="page-heading"><div><p className="eyebrow">经营结果 · {formatPeriod(cycle)}</p><h1>目标</h1><p className="muted">先写目标，再补可量化的关键结果。打开目标查看为它推进的事项。</p></div>{!readOnly && <Disclosure className="objective-create edit-disclosure" title={<>＋ 新增目标</>}><form action={createObjectiveAction}><ObjectiveFields users={users} cycle={cycle} ownerId={currentUserId} /><div className="form-actions"><Button size="lg">保存目标</Button></div></form></Disclosure>}</header>
    {objectives.length > 0 && <div className="goal-grid section-block">{objectives.map(objective => <article className="surface detail-section objective-card" key={objective.id}>
      <p className="muted small">{formatPeriod(objective.cycle)} · {objective.owner.name}</p>
      <h2><Link href={`/okrs/${objective.id}`}>{objective.title}</Link></h2>
      {objective.description && <p className="section-help">{objective.description}</p>}
      {objective.keyResults.length > 1 && <ProgressBar value={keyResultAchievementRate(objective.keyResults)} />}
      <div className="section-heading"><p className="muted small">业务指标达成度 {Math.round(keyResultAchievementRate(objective.keyResults))}%</p><StatusBadge>关联事项 {objectiveTaskCount(objective.keyResults)}</StatusBadge></div>
      {objective.keyResults.length > 0 && <ul className="goal-kr-list">{objective.keyResults.map(result => <li key={result.id}><div><strong>{result.title}</strong><p className="muted small">当前 {formatMetric(result.currentValue, result.unit)} / 目标 {formatMetric(result.targetValue, result.unit)} · 起点 {formatMetric(result.baselineValue, result.unit)} · {result.direction === "DECREASE" ? "降低" : "提升"}</p><ProgressBar value={progressPercent(result.currentValue, result.targetValue, result.baselineValue, result.direction)} /></div></li>)}</ul>}
      <Link className="text-link" href={`/okrs/${objective.id}`}>查看事项与进展 →</Link>
      {!readOnly && <Disclosure className="edit-disclosure" title={<>编辑目标与关键结果</>}>
        <form action={updateObjectiveAction}><input type="hidden" name="id" value={objective.id} /><ObjectiveFields objective={objective} users={users} cycle={cycle} ownerId={currentUserId} /><div className="form-actions"><Button>更新目标</Button></div></form>
        <form action={deleteObjectiveAction} className="form-actions"><input type="hidden" name="id" value={objective.id} /><Button variant="danger">删除这个目标及其关键结果</Button></form>
        {objective.keyResults.map(result => <Disclosure key={result.id} className="edit-disclosure" title={<>{result.title}</>}><form action={updateKeyResultAction}><input type="hidden" name="id" value={result.id} /><KeyResultFields result={result} /><div className="form-actions"><Button>更新关键结果</Button></div></form><form action={deleteKeyResultAction} className="form-actions"><input type="hidden" name="id" value={result.id} /><Button variant="danger">删除关键结果</Button></form></Disclosure>)}
        <Disclosure className="edit-disclosure" title={<>＋ 添加关键结果</>}><form action={createKeyResultAction}><input type="hidden" name="objectiveId" value={objective.id} /><KeyResultFields /><div className="form-actions"><Button variant="secondary">添加关键结果</Button></div></form></Disclosure>
      </Disclosure>}
    </article>)}</div>}
    {!objectives.length && <p className="lane-empty section-block">还没有设置目标与关键结果。</p>}
  </div>;
}
