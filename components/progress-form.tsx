"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { taskMutationAction } from "@/lib/actions";
import { FollowUpFields } from "./follow-up-fields";
import { ChoiceChips } from "./ui/choice-chips";
import { Field } from "./ui/field";
type Props = { id: string; version: number; status: string; health: string; nextAction: string; riskNote: string; nextFollowUpAt: string; today: string };
export function ProgressForm({ task }: { task: Props }) {
  const [mood, setMood] = useState("");
  const existingClosed = task.status === "DONE" || task.status === "CANCELLED";
  const ending = mood === "done" || mood === "cancel";
  const risk = mood === "risk" || mood === "stuck";
  return <ActionForm action={taskMutationAction} label="更新整体进展" className="progress-form">
    <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /><input type="hidden" name="operation" value="progress" />
    <ChoiceChips name="mood" legend="现在怎么样？" help="先选当前情况，再补充信息。例：在等别人。" required onChange={setMood} options={[{ value: "ok", label: "顺利推进" }, { value: "risk", label: "有风险", tone: "risk" }, { value: "wait", label: "在等别人" }, { value: "stuck", label: "卡住了", tone: "risk" }, { value: "done", label: "做完了", tone: "done" }, ...(!existingClosed ? [{ value: "same", label: "没变化" }] : [])]} />
    <div className="progress-fields fields">
      <div className="progress-summary span-all"><Field label={mood === "done" ? "最后结果" : mood === "cancel" ? "取消原因" : "这次有什么新进展？"} help="写已经发生的事，一两句就够；做完写最后结果，取消写原因。"><textarea name="summary" rows={3} maxLength={2000} required={!!mood && mood !== "same"} disabled={mood === "same"} placeholder="例：两版主图第一周数据出来了，B 版点击率更高" /></Field></div>
      <div className="progress-risk span-all"><Field label={mood === "risk" ? "哪里可能出问题、需要什么支持？" : "卡在哪、需要谁帮什么？"} help="必填，把需要协助的人和事情说清楚。"><textarea name="riskNote" defaultValue={task.riskNote} rows={2} maxLength={2000} required={risk} disabled={!!mood && !risk} placeholder="例：供应商没回复排期，需要采购联系备选供应商" /></Field></div>
      <div className="progress-wait span-all"><Field label="在等谁、等什么？（选填）" help="会一起记入本次进展，方便后续追踪。"><input name="waitingOn" disabled={!!mood && mood !== "wait"} maxLength={500} placeholder="例：赵强核对库存数" /></Field></div>
      <div className="progress-next span-all"><Field label="下一步做什么？" help="已带出上次的下一步，按现在的计划修改即可。"><input name="nextAction" defaultValue={task.nextAction} maxLength={2000} required={!!mood && mood !== "same" && !ending} disabled={ending || mood === "same"} placeholder="例：周五收集点击率与转化数据" /></Field></div>
      <div className="progress-follow span-all"><FollowUpFields today={task.today} currentDate={task.nextFollowUpAt} /></div>
      <p className="progress-same span-all section-help">只确认情况没变，不覆盖已有进展事实，同时记录本周进展。</p>
    </div>
    <details className="cancel-disclosure"><summary className="text-link">不做了（取消）</summary><ChoiceChips name="mood" legend="取消事项" options={[{ value: "cancel", label: "不做了（取消）", tone: "risk" }]} onChange={setMood} /><p className="small muted">选中后在上方说明取消原因。</p></details>
    <div className="form-actions"><SubmitButton>{mood === "same" ? "确认暂无变化" : "保存进展"}</SubmitButton></div>
    <p className="section-help">这次更新会自动算作本周进展。本周更新进展即视为已汇报，每次更新均保留历史记录。</p>
  </ActionForm>;
}
export function NoChangeButton({ taskId, version }: { taskId: string; version: number }) {
  return <ActionForm action={taskMutationAction} label="确认暂无变化"><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="operation" value="progress" /><input type="hidden" name="mood" value="same" /><input type="hidden" name="followPreset" value="in3days" /><SubmitButton secondary>暂无变化</SubmitButton><span className="field-hint">记录本周进展，3 天后再看一眼。</span></ActionForm>;
}
