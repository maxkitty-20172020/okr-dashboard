"use client";
import { useState } from "react";
import { taskMutationAction } from "@/lib/actions";
import type { Member } from "@/lib/tasks";
import { ActionForm } from "./action-form";
import { Button } from "./ui/button";
import { ChoiceChips } from "./ui/choice-chips";

export function BossTransferForm({ task, members }: { task: { id: string; version: number; ownerId: string }; members: Member[] }) {
  const candidates = members.filter(member => member.id !== task.ownerId);
  const [ownerId, setOwnerId] = useState("");
  const selected = candidates.find(member => member.id === ownerId);
  return <section className="surface detail-section" aria-label="移交负责人">
    <h2>移交负责人</h2>
    {candidates.length ? <ActionForm key={task.version} action={taskMutationAction} label="移交负责人">
      <input type="hidden" name="operation" value="transfer" />
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="version" value={task.version} />
      <ChoiceChips name="ownerId" legend="交给谁负责？" required options={candidates.map(member => ({ value: member.id, label: member.name }))} onChange={setOwnerId} />
      <p>{selected ? `确定移交给【${selected.name}】吗？移交后由对方负责更新进展。` : "请选择接手的填报成员。"}</p>
      <div className="form-actions"><Button>确认移交</Button></div>
    </ActionForm> : <p className="section-help">暂无其他未停用的填报成员。</p>}
  </section>;
}
