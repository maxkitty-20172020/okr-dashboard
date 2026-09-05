import { Prisma, PrismaClient, TaskArea, TaskHealth, TaskKind, TaskStatus } from "@prisma/client";
import { closed, dateValue, snapshot, taskInclude, today, type Member } from "./tasks";

export class TaskError extends Error {}
export type ActionState = { error?: string; success?: string };
function value(form: FormData, key: string, max = 2000) {
  const v = String(form.get(key) ?? "").trim();
  if (v.length > max) throw new TaskError(`内容过长，请控制在 ${max} 字以内。`);
  return v;
}
function required(form: FormData, key: string, label: string, max = 2000) {
  const v = value(form, key, max);
  if (!v) throw new TaskError(`请填写${label}。`);
  return v;
}
function option<T extends string>(v: string, choices: Record<string, T>, label: string): T {
  if (!Object.values(choices).includes(v as T)) throw new TaskError(`${label}无效，请重新选择。`);
  return v as T;
}
function date(form: FormData, key: string, label: string) {
  const v = value(form, key, 10);
  if (!v) return null;
  const parsed = new Date(v + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(parsed.getTime()) || dateValue(parsed) !== v) throw new TaskError(`${label}不是有效日期。`);
  return parsed;
}
function nextDate(form: FormData) {
  const d = date(form, "nextFollowUpAt", "下次跟进日期");
  if (!d) throw new TaskError("请设置下次跟进日期。");
  if (d < today()) throw new TaskError("下次跟进日期不能早于今天。");
  return d;
}
export async function writableUser(db: PrismaClient, actor: Member) {
  const current = await db.user.findUnique({ where: { id: actor.id }, select: { id: true, name: true, role: true } });
  if (!current || current.role === "BOSS") throw new TaskError("老板账号仅可查看，不能修改数据。");
  return current;
}
async function member(tx: Prisma.TransactionClient, id: string) {
  const u = await tx.user.findUnique({ where: { id } });
  if (!u || u.role === "BOSS") throw new TaskError("请选择一位填报成员，老板不参与任务填报。");
  return u;
}
async function basicData(tx: Prisma.TransactionClient, form: FormData) {
  const ownerId = required(form, "ownerId", "主负责人", 100);
  await member(tx, ownerId);
  const keyResultId = value(form, "keyResultId", 100) || null;
  if (keyResultId && !await tx.keyResult.findUnique({ where: { id: keyResultId } })) throw new TaskError("关联目标已不存在，请重新选择。");
  const priority = Number(value(form, "priority") || "1");
  if (![0, 1, 2].includes(priority)) throw new TaskError("优先级无效。");
  return {
    title: required(form, "title", "任务名称", 160),
    completionCriteria: required(form, "completionCriteria", "完成标准"),
    area: option(value(form, "area"), TaskArea, "责任领域"),
    kind: option(value(form, "kind"), TaskKind, "任务类型"),
    scope: value(form, "scope", 160), ownerId, keyResultId, priority,
    dueAt: date(form, "dueAt", "完成期限"),
  };
}

export async function createTask(db: PrismaClient, actor: Member, form: FormData) {
  const user = await writableUser(db, actor);
  return db.$transaction(async tx => {
    const data = await basicData(tx, form);
    const task = await tx.task.create({ data: { ...data, nextFollowUpAt: nextDate(form), nextAction: required(form, "nextAction", "下一步动作") }, include: { owner: true } });
    await tx.taskUpdate.create({ data: { taskId: task.id, authorId: user.id, kind: "CREATED", body: "创建任务，明确负责人和完成标准。", snapshot: snapshot(task) } });
    return task.id;
  });
}

export async function mutateTask(db: PrismaClient, actor: Member, form: FormData, operation: "details" | "progress" | "collaborator" | "contribution" | "removeCollaborator" | "milestone" | "toggleMilestone" | "archive" | "restore") {
  const user = await writableUser(db, actor);
  const id = required(form, "taskId", "任务", 100);
  const rawVersion = required(form, "version", "任务版本", 20);
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version) || version < 0) throw new TaskError("任务版本无效，请刷新页面。");
  return db.$transaction(async tx => {
    const task = await tx.task.findUnique({ where: { id }, include: taskInclude });
    if (!task) throw new TaskError("任务已不存在。");
    if (task.version !== version) throw new TaskError("这条任务刚被其他人更新，请刷新页面后再提交；本次修改未写入。");
    if (task.archivedAt && operation !== "restore") throw new TaskError("请先恢复归档任务，再进行修改。");
    const ownerOnly = ["progress", "collaborator", "removeCollaborator", "milestone", "toggleMilestone"];
    if (ownerOnly.includes(operation) && task.ownerId !== user.id) throw new TaskError("这项操作需要由主负责人完成。");
    if (closed(task) && ["collaborator", "removeCollaborator", "contribution", "milestone", "toggleMilestone"].includes(operation)) throw new TaskError("任务已经结束，请由主负责人重新开启后再更新协作或节点。");
    let data: Prisma.TaskUpdateInput = {};
    let kind = "DETAILS";
    let body = "";
    if (operation === "details") {
      const basic = await basicData(tx, form);
      const { ownerId, keyResultId, ...fields } = basic;
      const activeCollaborator = task.collaborators.find(c => c.userId === ownerId);
      if (ownerId !== task.ownerId && activeCollaborator && !activeCollaborator.done) throw new TaskError("新负责人还有未完成的协作交付，请先完成该协作或由原负责人移除协作分工。");
      if (activeCollaborator) await tx.taskCollaborator.update({ where: { id: activeCollaborator.id }, data: { active: false } });
      data = { ...fields, ...(ownerId !== task.ownerId ? { lastConfirmedAt: null } : {}), owner: { connect: { id: ownerId } }, keyResult: keyResultId ? { connect: { id: keyResultId } } : { disconnect: true } };
      body = `调整任务资料或分工。原负责人：${task.owner.name}；原完成期限：${dateValue(task.dueAt) || "未设置"}。`;
    } else if (operation === "progress") {
      const noChange = value(form, "updateKind") === "NO_CHANGE";
      if (noChange && closed(task)) throw new TaskError("已结束任务无需确认暂无变化。");
      const status = noChange ? task.status : option(value(form, "status"), TaskStatus, "任务状态");
      const ending = closed({ status });
      const selectedHealth = noChange ? task.health : option(value(form, "health"), TaskHealth, "风险情况");
      const health = status === "BLOCKED" ? TaskHealth.AT_RISK : selectedHealth;
      const riskNote = noChange ? task.riskNote : value(form, "riskNote");
      if (!ending && (health === "AT_RISK" || status === "BLOCKED") && !riskNote) throw new TaskError("请说明风险或阻塞原因，以及需要的支持。");
      const nextFollowUpAt = ending ? null : nextDate(form);
      const summary = noChange ? value(form, "summary") || task.latestProgress || "已确认当前情况，暂无变化。" : required(form, "summary", ending ? "完成结果或取消原因" : "本次进展");
      const nextAction = noChange ? task.nextAction : ending ? "" : required(form, "nextAction", "下一步动作");
      data = { status, health, riskNote, nextFollowUpAt, nextAction, lastConfirmedAt: new Date(), completedAt: ending ? task.completedAt ?? new Date() : null, ...(!noChange ? { latestProgress: summary } : {}) };
      kind = noChange ? "NO_CHANGE" : "PROGRESS";
      body = summary;
    } else if (operation === "collaborator") {
      const userId = required(form, "userId", "协作者", 100);
      const collaborator = await member(tx, userId);
      if (userId === task.ownerId) throw new TaskError("主负责人无需重复添加为协作者。");
      const deliverable = required(form, "deliverable", "协作交付内容", 500);
      const dueAt = date(form, "collaboratorDueAt", "协作期限");
      const existing = task.collaborators.find(c => c.userId === userId);
      if (existing) throw new TaskError("这位成员已在协作中，请先移除原分工再重新安排。");
      await tx.taskCollaborator.upsert({ where: { taskId_userId: { taskId: id, userId } }, create: { taskId: id, userId, deliverable, dueAt }, update: { deliverable, dueAt, done: false, note: "", active: true } });
      kind = "COLLABORATION"; body = `安排 ${collaborator.name} 协作：${deliverable}；期限：${dateValue(dueAt) || "未设置"}。`;
    } else if (operation === "contribution") {
      const c = task.collaborators.find(c => c.userId === user.id);
      if (!c) throw new TaskError("只有此任务的协作者可以更新自己的交付。");
      const note = required(form, "note", "协作进展");
      const done = value(form, "done") === "true";
      await tx.taskCollaborator.update({ where: { id: c.id }, data: { done, note } });
      kind = "COLLABORATION"; body = `${user.name} · ${c.deliverable} · ${done ? "已交付" : "推进中"}：${note}`;
    } else if (operation === "removeCollaborator") {
      const c = task.collaborators.find(c => c.id === value(form, "collaboratorId", 100));
      if (!c) throw new TaskError("协作分工已变更，请刷新页面。");
      await tx.taskCollaborator.update({ where: { id: c.id }, data: { active: false } });
      kind = "COLLABORATION"; body = `移除 ${c.user.name} 的协作分工：${c.deliverable}。历史交付记录保留。`;
    } else if (operation === "milestone") {
      const title = required(form, "milestoneTitle", "节点名称", 160);
      const dueAt = date(form, "milestoneDueAt", "节点日期");
      await tx.taskMilestone.create({ data: { taskId: id, title, dueAt } });
      kind = "MILESTONE"; body = `新增节点：${title}；日期：${dateValue(dueAt) || "未设置"}。`;
    } else if (operation === "toggleMilestone") {
      const m = task.milestones.find(m => m.id === value(form, "milestoneId", 100));
      if (!m) throw new TaskError("节点已不存在。");
      await tx.taskMilestone.update({ where: { id: m.id }, data: { done: !m.done } });
      kind = "MILESTONE"; body = `${m.done ? "重新开启" : "完成"}节点：${m.title}。`;
    } else if (operation === "archive") {
      if (!closed(task)) throw new TaskError("请先完成或取消任务，再归档。");
      data = { archivedAt: new Date() }; kind = "ARCHIVED"; body = "归档任务，保留进展与协作历史。";
    } else if (operation === "restore") {
      if (!task.archivedAt) throw new TaskError("任务没有归档。");
      data = { archivedAt: null }; kind = "RESTORED"; body = "恢复归档任务，原状态保留。";
    }
    // Compare-and-swap protects concurrent forms; every mutation and its audit record commit together.
    const lock = await tx.task.updateMany({ where: { id, version }, data: { version: { increment: 1 } } });
    if (lock.count !== 1) throw new TaskError("任务已被更新，请刷新页面后重试。");
    const updated = await tx.task.update({ where: { id }, data, include: { owner: true } });
    await tx.taskUpdate.create({ data: { taskId: id, authorId: user.id, kind, body, snapshot: snapshot(updated) } });
    return id;
  });
}
