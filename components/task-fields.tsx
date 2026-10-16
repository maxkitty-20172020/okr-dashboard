import type { Task } from "@prisma/client";
import { areaLabels, dateValue, today, type Member } from "@/lib/tasks";
import { FollowUpFields } from "./follow-up-fields";
import { ChoiceChips } from "./ui/choice-chips";
import { Field } from "./ui/field";
export function TaskFields({ members, keyResults, currentUserId, task }: { members: Member[]; keyResults: { id: string; title: string }[]; currentUserId: string; task?: Task }) {
  const ownerOptions = members.map(m => ({ value: m.id, label: m.id === currentUserId ? `我（${m.name}）` : m.name }));
  const missingOwner = task && !members.some(m => m.id === task.ownerId);
  return <div className="fields task-fields">
    <Field className="span-all" label="1. 这件事是什么？" help="写一个具体要做的动作，一句话就够。"><input name="title" defaultValue={task?.title} placeholder="例：确认旺季备货与出货排期" required maxLength={160} /></Field>
    <Field className="span-all" label="2. 做到什么算完成？" help="写清交付什么、做到什么程度算完成。"><textarea name="completionCriteria" defaultValue={task?.completionCriteria} placeholder="例：拿到供应商排期，定下 11 月补货数量" required maxLength={2000} rows={2} /></Field>
    <div className="span-all">{members.length > 6 ? <Field label="3. 谁负责？" help="默认由你负责，也可交给其他成员。例：李明。"><select name="ownerId" defaultValue={missingOwner ? "" : task?.ownerId ?? currentUserId} required>{missingOwner && <option value="">请选择接手成员</option>}{ownerOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field> : <ChoiceChips name="ownerId" legend="3. 谁负责？" help="默认由你负责，也可交给其他成员。例：李明。" defaultValue={missingOwner ? "" : task?.ownerId ?? currentUserId} required options={ownerOptions} />}</div>
    {!task && <FollowUpFields today={dateValue(today())} />}
    <details className="span-all edit-disclosure"><summary>更多设置（选填）</summary><div className="fields">
      <ChoiceChips className="span-all" name="area" legend="属于哪块？" help="方便按领域查找。例：库存管理。" defaultValue={task?.area ?? "OTHER"} options={Object.entries(areaLabels).map(([value, label]) => ({ value, label }))} />
      <Field label="最晚什么时候完成？" help="不确定可以留空。例：供应商承诺的交付日。"><input name="dueAt" type="date" defaultValue={dateValue(task?.dueAt)} /></Field>
      <Field label="为哪个目标做的？" help="可以不关联。例：改善核心产品运营效率。"><select name="keyResultId" defaultValue={task?.keyResultId ?? ""}><option value="">不关联</option>{keyResults.map(kr => <option value={kr.id} key={kr.id}>{kr.title}</option>)}</select></Field>
      <ChoiceChips className="span-all" name="priority" legend="重要程度" help="需要优先关注时选重要。例：旺季备货选重要。" defaultValue={String(task?.priority ?? 1)} options={[{ value: "1", label: "一般" }, { value: "2", label: "重要" }, ...(task?.priority === 0 ? [{ value: "0", label: "低优先（原设置）" }] : [])]} />
      <Field className="span-all" label="关联范围" help="写涉及的站点、产品线或 SKU。"><input name="scope" defaultValue={task?.scope} maxLength={160} placeholder="例：英国站 · 收纳线" /></Field>
      {!task && <Field className="span-all" label="下一步做什么？" help="暂时留空会记为「明确推进计划」。"><input name="nextAction" placeholder="例：与采购确认供应商出货档期" maxLength={2000} /></Field>}
    </div></details>
  </div>;
}
