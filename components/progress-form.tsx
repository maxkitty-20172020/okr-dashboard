"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { taskMutationAction } from "@/lib/actions";
import { FollowUpFields } from "./follow-up-fields";

type Props = { id: string; version: number; status: string; health: string; nextAction: string; riskNote: string; nextFollowUpAt: string; today: string };
export function ProgressForm({ task }: { task: Props }) {
  const [mood, setMood] = useState("");
  const ending = mood === "done" || mood === "cancel";
  const existingClosed = task.status === "DONE" || task.status === "CANCELLED";
  const risk = mood === "risk" || mood === "stuck";
  return <ActionForm action={taskMutationAction} label="更新整体进展">
    <input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="version" value={task.version} /><input type="hidden" name="operation" value="progress" />
    <div className="fields">
      <label className="span-all">现在怎么样？<span className="field-hint">先选当前情况，再写需要补充的信息。例：在等别人。</span>
        <select name="mood" value={mood} onChange={e => setMood(e.target.value)} required>
          <option value="" disabled>请选择当前情况</option><option value="ok">顺利推进</option><option value="risk">有风险</option><option value="wait">在等别人</option><option value="stuck">卡住了</option><option value="done">做完了</option>{!existingClosed && <option value="same">没变化</option>}
          {mood === "cancel" && <option value="cancel">不做了（取消）</option>}
        </select>
      </label>
      {mood && <>
        {mood === "same" ? <p className="span-all section-help">只确认情况没变，不覆盖已有进展事实，同时记录本周进展。</p> : <label className="span-all">{mood === "done" ? "最后结果" : mood === "cancel" ? "取消原因" : "这次有什么新进展？"}<span className="field-hint">写已经发生的事，一两句就够。</span>
          <textarea key={ending ? mood : "progress"} name="summary" rows={3} maxLength={2000} required placeholder={mood === "done" ? "例：B 版点击率更高，已全量替换主图" : mood === "cancel" ? "例：产品停售，本次备货不再推进" : "例：两版主图第一周数据出来了，B 版点击率更高"} />
        </label>}
        {risk && <label className="span-all">{mood === "stuck" ? "卡在哪、需要谁帮什么？" : "哪里可能出问题、需要什么支持？"}<span className="field-hint">必填，把需要协助的人和事情说清楚。</span><textarea name="riskNote" defaultValue={task.riskNote} rows={2} maxLength={2000} required placeholder="例：供应商没回复排期，需要采购联系备选供应商" /></label>}
        {mood === "wait" && <label className="span-all">在等谁、等什么？（选填）<span className="field-hint">会一起记入本次进展，方便后续追踪。</span><input name="waitingOn" maxLength={500} placeholder="例：赵强核对库存数" /></label>}
        {!ending && <>
          {mood !== "same" && <label className="span-all">下一步做什么？<span className="field-hint">已带出上次的下一步，按现在的计划修改即可。</span><input name="nextAction" defaultValue={task.nextAction} maxLength={2000} required placeholder="例：周五收集点击率与转化数据" /></label>}
          <FollowUpFields today={task.today} currentDate={task.nextFollowUpAt} />
        </>}
      </>}
    </div>
    <div className="form-actions"><SubmitButton>{mood === "same" ? "确认暂无变化" : "保存进展"}</SubmitButton><button className="text-link" type="button" onClick={() => setMood(mood === "cancel" ? "" : "cancel")}>不做了（取消）</button></div>
    <p className="section-help">本周更新进展即视为已汇报，不用再写一遍。每次更新均保留历史记录。</p>
  </ActionForm>;
}

export function NoChangeButton({ taskId, version }: { taskId: string; version: number }) {
  return <ActionForm action={taskMutationAction} label="确认暂无变化">
    <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="version" value={version} />
    <input type="hidden" name="operation" value="progress" /><input type="hidden" name="mood" value="same" /><input type="hidden" name="followPreset" value="in3days" />
    <SubmitButton secondary>暂无变化</SubmitButton><span className="field-hint">记录本周进展，3 天后再看一眼。</span>
  </ActionForm>;
}
