"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { submitCheckInAction } from "@/lib/actions";
import { checkInStateLabels } from "@/lib/check-in";

export function CheckInForm({
  periodId,
  scopeType,
  scopeId,
  compact = false,
}: {
  periodId: string;
  scopeType: string;
  scopeId: string;
  compact?: boolean;
}) {
  const [status, setStatus] = useState("SUBMITTED");
  return <ActionForm action={submitCheckInAction} label="提交周期汇报">
    <input type="hidden" name="periodId" value={periodId} />
    <input type="hidden" name="scopeType" value={scopeType} />
    <input type="hidden" name="scopeId" value={scopeId} />
    <div className="fields">
      <label className={compact ? "span-all" : ""}>本次汇报
        <select name="status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="SUBMITTED">提交进展事实</option>
          <option value="NO_CHANGE">确认暂无变化</option>
        </select>
      </label>
      <label className="span-all">{status === "NO_CHANGE" ? "补充说明（选填）" : "进展事实"}
        <textarea name="body" rows={compact ? 2 : 3} maxLength={2000} required={status !== "NO_CHANGE"} placeholder={status === "NO_CHANGE" ? "例如：仍在等待测试结果，本周情况不变" : "写已经发生的进展，不要只写计划"} />
      </label>
      {!compact && status === "SUBMITTED" && <>
        <label>指标说明<input name="metricNote" maxLength={2000} placeholder="可选：当前值或口径说明" /></label>
        <label>下一步<input name="nextStep" maxLength={2000} placeholder="本周期之后要做的事" /></label>
        <label className="span-all">阻塞 / 需要的支持<textarea name="blocker" rows={2} maxLength={2000} placeholder="没有阻塞可留空" /></label>
      </>}
    </div>
    <div className="form-actions">
      <SubmitButton>{status === "NO_CHANGE" ? checkInStateLabels.NO_CHANGE : "提交汇报"}</SubmitButton>
      <span className="muted small">{status === "NO_CHANGE" ? "会留下确认记录，不会当成未汇报，也不会覆盖已有进展事实。" : "未提交前该范围在本周期显示为未汇报，系统不会代写空记录。"}</span>
    </div>
  </ActionForm>;
}
