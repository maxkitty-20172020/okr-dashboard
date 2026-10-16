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
      <label className={compact ? "span-all" : ""}>本次汇报<span className="field-hint">选择有新进展或暂无变化。例：提交进展事实。</span>
        <select name="status" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="SUBMITTED">提交进展事实</option>
          <option value="NO_CHANGE">确认暂无变化</option>
        </select>
      </label>
      <label className="span-all">{status === "NO_CHANGE" ? "补充说明（选填）" : "进展事实"}
        <span className="field-hint">写这个周期已经发生的变化，一两句就够。</span>
        <textarea name="body" rows={compact ? 2 : 3} maxLength={2000} required={status !== "NO_CHANGE"} placeholder={status === "NO_CHANGE" ? "例：仍在等待测试结果，本周情况不变" : "例：主图已替换，本月点击率提升 18%"} />
      </label>
      {!compact && status === "SUBMITTED" && <>
        <label>指标说明<span className="field-hint">补充当前数值与统计方法，可以留空。</span><input name="metricNote" maxLength={2000} placeholder="例：本月广告成本占比 25%" /></label>
        <label>下一步<span className="field-hint">写后续准备做的事，可以留空。</span><input name="nextStep" maxLength={2000} placeholder="例：下月复核广告转化" /></label>
        <label className="span-all">阻塞 / 需要的支持<span className="field-hint">写需要谁提供什么支持，没有可留空。</span><textarea name="blocker" rows={2} maxLength={2000} placeholder="例：需要采购确认到货日" /></label>
      </>}
    </div>
    <div className="form-actions">
      <SubmitButton>{status === "NO_CHANGE" ? checkInStateLabels.NO_CHANGE : "提交汇报"}</SubmitButton>
      <span className="muted small">{status === "NO_CHANGE" ? "会记录本周期确认，保留已有进展事实。" : "提交后会记录为本周期已汇报。"}</span>
    </div>
  </ActionForm>;
}
