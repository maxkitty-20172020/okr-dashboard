"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { taskMutationAction } from "@/lib/actions";
import { statusLabels } from "@/lib/tasks";

type Props = { id: string; version: number; status: string; health: string; nextAction: string; riskNote: string; nextFollowUpAt: string; today: string };
export function ProgressForm({ task }: { task: Props }) {
  const [mode, setMode] = useState("PROGRESS");
  const [status, setStatus] = useState(task.status);
  const ending = status === "DONE" || status === "CANCELLED";
  const existingClosed = task.status === "DONE" || task.status === "CANCELLED";
  return <ActionForm action={taskMutationAction} label="更新整体进展">
    <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /><input type="hidden" name="operation" value="progress" />
    <div className="fields">
      <label className="span-all">本次更新<select name="updateKind" value={mode} onChange={e => setMode(e.target.value)}><option value="PROGRESS">有新进展 / 调整状态</option>{!existingClosed && <option value="NO_CHANGE">确认暂无变化</option>}</select></label>
      {mode === "PROGRESS" && <><label>任务状态<select name="status" value={status} onChange={e => setStatus(e.target.value)}>{Object.entries(statusLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>风险情况<select name="health" defaultValue={task.health}><option value="ON_TRACK">按计划</option><option value="AT_RISK">有风险</option></select></label></>}
      <label className="span-all">{mode === "NO_CHANGE" ? "补充说明（选填）" : ending ? "完成结果 / 取消原因" : "本次进展"}<textarea name="summary" rows={3} maxLength={2000} required={mode !== "NO_CHANGE"} placeholder={mode === "NO_CHANGE" ? "例如：仍在等待测试结果，预计日期不变" : "说明已经发生的变化和交付结果"} /></label>
      {mode === "PROGRESS" && !ending && <><label className="span-all">下一步动作<input name="nextAction" defaultValue={task.nextAction} maxLength={2000} required /></label><label className="span-all">风险 / 阻塞原因与需要的支持<textarea name="riskNote" defaultValue={task.riskNote} rows={2} maxLength={2000} placeholder="有风险或受阻时必填：卡在哪里，需要谁提供什么支持" /></label></>}
      {(mode === "NO_CHANGE" || !ending) && <label>下次跟进日期<input type="date" name="nextFollowUpAt" defaultValue={task.nextFollowUpAt >= task.today ? task.nextFollowUpAt : task.today} min={task.today} required /></label>}
    </div>
    <div className="form-actions"><SubmitButton>{mode === "NO_CHANGE" ? "确认暂无变化" : "保存进展"}</SubmitButton><span className="muted small">{mode === "NO_CHANGE" ? "仅更新确认记录和跟进日期，整体状态保持不变。" : "每次更新均保留历史记录。"}</span></div>
  </ActionForm>;
}
