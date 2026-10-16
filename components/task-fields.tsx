import type { Task } from "@prisma/client";
import { areaLabels, dateValue, today, type Member } from "@/lib/tasks";
import { FollowUpFields } from "./follow-up-fields";

export function TaskFields({ members, keyResults, currentUserId, task }: { members: Member[]; keyResults: { id: string; title: string }[]; currentUserId: string; task?: Task }) {
  return <div className="fields">
    <label className="span-all">1. 这件事是什么？<span className="field-hint">写一个具体要做的动作，一句话就够。</span><input name="title" defaultValue={task?.title} placeholder="例：确认旺季备货与出货排期" required maxLength={160} /></label>
    <label className="span-all">2. 做到什么算完成？<span className="field-hint">让别人知道交付什么、做到什么程度算完成。</span><textarea name="completionCriteria" defaultValue={task?.completionCriteria} placeholder="例：拿到供应商排期，定下 11 月补货数量" required maxLength={2000} rows={2} /></label>
    <label>3. 谁负责？<span className="field-hint">默认由你负责，也可交给其他成员。例：李明。</span><select name="ownerId" defaultValue={task?.ownerId ?? currentUserId} required>
      {task && !members.some(m => m.id === task.ownerId) && <option value="">请选择接手成员</option>}
      {members.map(m => <option key={m.id} value={m.id}>{m.id === currentUserId ? `我（${m.name}）` : m.name}</option>)}
    </select></label>
    {!task && <FollowUpFields today={dateValue(today())} />}
    <details className="span-all edit-disclosure">
      <summary>更多设置（选填）</summary>
      <div className="fields">
        <label>属于哪块？<span className="field-hint">方便按领域查找，默认其他事项。例：库存管理。</span><select name="area" defaultValue={task?.area ?? "OTHER"}>{Object.entries(areaLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>重要程度<span className="field-hint">需要优先关注时选重要。例：旺季备货选重要。</span><select name="priority" defaultValue={task?.priority ?? 1}><option value="1">一般</option><option value="2">重要</option>{task?.priority === 0 && <option value="0">低优先（原设置）</option>}</select></label>
        <label>最晚什么时候完成？<span className="field-hint">不确定可以留空。例：供应商承诺的交付日。</span><input name="dueAt" type="date" defaultValue={dateValue(task?.dueAt)} /></label>
        <label>关联范围<span className="field-hint">写涉及的站点、产品线或 SKU。</span><input name="scope" defaultValue={task?.scope} maxLength={160} placeholder="例：英国站 · 收纳线" /></label>
        <label>为哪个目标做的？<span className="field-hint">可以不关联。例：改善核心产品运营效率。</span><select name="keyResultId" defaultValue={task?.keyResultId ?? ""}><option value="">不关联</option>{keyResults.map(kr => <option value={kr.id} key={kr.id}>{kr.title}</option>)}</select></label>
        {!task && <label className="span-all">下一步做什么？<span className="field-hint">暂时留空会记为「明确推进计划」。</span><input name="nextAction" placeholder="例：与采购确认供应商出货档期" maxLength={2000} /></label>}
      </div>
    </details>
  </div>;
}
