"use client";
import { useState } from "react";
import { TaskFields } from "./task-fields";
import { ActionForm } from "./action-form";
import { Button } from "./ui/button";
import { taskMutationAction } from "@/lib/actions";
import type { ComponentProps } from "react";
export function TaskDetailsForm(props: ComponentProps<typeof TaskFields> & { task: NonNullable<ComponentProps<typeof TaskFields>["task"]> }) {
  const [nextOwner, setNextOwner] = useState(props.task.ownerId);
  const changed = nextOwner !== props.task.ownerId;
  const name = props.members.find(member => member.id === nextOwner)?.name ?? "接手成员";
  return <div onChange={event => {
    const input = event.target as HTMLInputElement;
    if (input.name === "ownerId") setNextOwner(input.value);
  }}><ActionForm action={taskMutationAction} label="修改任务资料"><input type="hidden" name="taskId" value={props.task.id} /><input type="hidden" name="version" value={props.task.version} /><input type="hidden" name="operation" value="details" /><TaskFields {...props} />
    <div className={`transfer-confirmation ${changed ? "is-changing" : ""}`}><label><input key={nextOwner} type="checkbox" required={changed} />确定移交给【<span>{name}</span>】吗？移交后你将不再负责更新进展。</label></div>
    <noscript><p className="section-help">如变更了负责人，请勾选确认移交：移交后你将不再负责更新进展。</p><label><input type="checkbox" required />我已确认任务资料及负责人；如果移交，原负责人将不再负责更新进展。</label></noscript>
    <div className="form-actions"><Button>保存任务资料</Button></div></ActionForm></div>;
}
