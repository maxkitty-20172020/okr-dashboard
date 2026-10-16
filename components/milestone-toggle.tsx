"use client";
import { ActionForm } from "./action-form";
import { Button } from "./ui/button";
import { taskMutationAction } from "@/lib/actions";
export function MilestoneToggle({ taskId, version, id, title, done }: { taskId: string; version: number; id: string; title: string; done: boolean }) {
  return <ActionForm action={taskMutationAction} label={`关键节点 ${title}`}><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="version" value={version} /><input type="hidden" name="operation" value="toggleMilestone" /><input type="hidden" name="milestoneId" value={id} /><Button variant="text" size="sm" aria-label={`${done ? "重新开启" : "标记完成"}节点：${title}`} aria-pressed={done}><span className={`milestone-checkbox ${done ? "checked" : ""}`} aria-hidden="true">{done ? "✓" : ""}</span>{done ? "重新开启" : "标记完成"}</Button></ActionForm>;
}
