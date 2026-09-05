import type { Task } from "@prisma/client";
import { areaLabels, dateValue, kindLabels, today, type Member } from "@/lib/tasks";

export function TaskFields({ members, keyResults, currentUserId, task }: { members: Member[]; keyResults: { id: string; title: string }[]; currentUserId: string; task?: Task }) {
  return <div className="fields">
    <label className="span-all">任务名称<input name="title" defaultValue={task?.title} placeholder="例如：完成旺季备货方案并确认出货排期" required maxLength={160} /></label>
    <label>责任领域<select name="area" defaultValue={task?.area ?? "BUSINESS"}>{Object.entries(areaLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>任务类型<select name="kind" defaultValue={task?.kind ?? "SHORT_TERM"}>{Object.entries(kindLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>主负责人<select name="ownerId" defaultValue={task?.ownerId ?? currentUserId} required>
      {task && !members.some(m => m.id === task.ownerId) && <option value="">请选择接手成员</option>}
      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select></label>
    <label>优先级<select name="priority" defaultValue={task?.priority ?? 1}><option value="2">重点</option><option value="1">常规</option><option value="0">低优先</option></select></label>
    <label className="span-all">完成标准<textarea name="completionCriteria" defaultValue={task?.completionCriteria} placeholder="明确交付什么、做到什么程度才算完成" required maxLength={2000} rows={2} /></label>
    <label>完成期限<span className="field-hint">尚未确定可以留空</span><input name="dueAt" type="date" defaultValue={dateValue(task?.dueAt)} /></label>
    <label>关联范围<span className="field-hint">可填站点、产品线、团队或 SKU</span><input name="scope" defaultValue={task?.scope} maxLength={160} placeholder="例如：英国站 · 收纳线" /></label>
    {!task && <>
      <label className="span-all">下一步动作<input name="nextAction" placeholder="例如：与采购确认供应商出货档期" required maxLength={2000} /></label>
      <label>下次跟进日期<input name="nextFollowUpAt" type="date" min={dateValue(today())} defaultValue={dateValue(today())} required /></label>
    </>}
    <label>关联关键结果<span className="field-hint">可不关联</span><select name="keyResultId" defaultValue={task?.keyResultId ?? ""}><option value="">不关联</option>{keyResults.map(kr => <option value={kr.id} key={kr.id}>{kr.title}</option>)}</select></label>
  </div>;
}
