"use server";

import { compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, requireSession, requireWriter } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTask, mutateTask, TaskError, type ActionState } from "@/lib/task-service";
import { resolveQuarterPeriod } from "@/lib/period";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  const raw = text(formData, key);
  const value = Number(raw);
  if (!raw || !Number.isFinite(value)) redirect("/okrs?error=number");
  return value;
}

function normalizeLogin(raw: string) {
  const value = raw.toLowerCase();
  if (!value) {
    return value;
  }
  return value.includes("@") ? value : `${value}@okr.local`;
}

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = normalizeLogin(text(formData, "email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请输入账号和密码" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "账号或密码不正确" };
  }

  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createObjectiveAction(formData: FormData) {
  const session = await requireWriter();
  const title = text(formData, "title");
  const description = text(formData, "description");
  const cycle = text(formData, "cycle");
  const ownerId = text(formData, "ownerId") || session.id;

  if (!title || !cycle) {
    return;
  }

  const period = await resolveQuarterPeriod(prisma, cycle);
  await prisma.objective.create({
    data: { title, description, cycle, ownerId, periodId: period.id },
  });
  revalidatePath("/", "layout");
}

export async function updateObjectiveAction(formData: FormData) {
  await requireWriter();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const description = text(formData, "description");
  const cycle = text(formData, "cycle");
  const ownerId = text(formData, "ownerId");

  if (!id || !title || !cycle || !ownerId) {
    return;
  }

  const period = await resolveQuarterPeriod(prisma, cycle);
  await prisma.objective.update({
    where: { id },
    data: { title, description, cycle, ownerId, periodId: period.id },
  });
  revalidatePath("/", "layout");
}

export async function deleteObjectiveAction(formData: FormData) {
  await requireWriter();
  const id = text(formData, "id");
  if (!id) {
    return;
  }
  await prisma.objective.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function createKeyResultAction(formData: FormData) {
  await requireWriter();
  const objectiveId = text(formData, "objectiveId");
  const title = text(formData, "title");
  const unit = text(formData, "unit") || "%";
  const currentValue = numberValue(formData, "currentValue");
  const targetValue = numberValue(formData, "targetValue");
  const baselineValue = numberValue(formData, "baselineValue");
  const direction = text(formData, "direction") || "INCREASE";
  const validRange = direction === "DECREASE" ? baselineValue > targetValue : direction === "INCREASE" && baselineValue < targetValue;

  if (!validRange) redirect("/okrs?error=range");
  if (!objectiveId || !title) return;

  await prisma.keyResult.create({
    data: { objectiveId, title, unit, currentValue, targetValue, baselineValue, direction },
  });
  revalidatePath("/", "layout");
}

export async function updateKeyResultAction(formData: FormData) {
  await requireWriter();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const unit = text(formData, "unit") || "%";
  const currentValue = numberValue(formData, "currentValue");
  const targetValue = numberValue(formData, "targetValue");
  const baselineValue = numberValue(formData, "baselineValue");
  const direction = text(formData, "direction") || "INCREASE";
  const validRange = direction === "DECREASE" ? baselineValue > targetValue : direction === "INCREASE" && baselineValue < targetValue;

  if (!validRange) redirect("/okrs?error=range");
  if (!id || !title) return;

  await prisma.keyResult.update({
    where: { id },
    data: { title, unit, currentValue, targetValue, baselineValue, direction },
  });
  revalidatePath("/", "layout");
}

export async function deleteKeyResultAction(formData: FormData) {
  await requireWriter();
  const id = text(formData, "id");
  if (!id) {
    return;
  }
  await prisma.keyResult.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function saveTaskAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  let id: string;
  try {
    id = await createTask(prisma, session, formData);
  } catch (error) {
    if (error instanceof TaskError) return { error: error.message };
    console.error("Task creation failed", error instanceof Error ? error.name : "Unknown error");
    return { error: "任务保存失败，请稍后重试。" };
  }
  revalidatePath("/", "layout");
  redirect(`/tasks/${id}?created=1`);
}

export async function taskMutationAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const operation = text(formData, "operation");
  const operations = ["details", "progress", "collaborator", "contribution", "removeCollaborator", "milestone", "toggleMilestone", "archive", "restore"] as const;
  const selected = operations.find(item => item === operation);
  if (!selected) return { error: "操作无效，请刷新页面。" };
  try {
    await mutateTask(prisma, session, formData, selected);
  } catch (error) {
    if (error instanceof TaskError) return { error: error.message };
    console.error("Task update failed", error instanceof Error ? error.name : "Unknown error");
    return { error: "修改未保存，请刷新页面后重试。" };
  }
  revalidatePath("/", "layout");
  return { success: "已保存，跟进记录已更新。" };
}
