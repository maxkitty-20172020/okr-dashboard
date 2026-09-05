"use server";

import { TaskStatus } from "@prisma/client";
import { compare } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLocalDate, toISODate, weekFromParam } from "@/lib/week";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  const raw = text(formData, key);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请输入邮箱和密码" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: "邮箱或密码不正确" };
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
  const session = await requireSession();
  const title = text(formData, "title");
  const description = text(formData, "description");
  const cycle = text(formData, "cycle");
  const ownerId = text(formData, "ownerId") || session.id;

  if (!title || !cycle) {
    return;
  }

  await prisma.objective.create({
    data: { title, description, cycle, ownerId },
  });
  revalidatePath("/", "layout");
}

export async function updateObjectiveAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const description = text(formData, "description");
  const cycle = text(formData, "cycle");
  const ownerId = text(formData, "ownerId");

  if (!id || !title || !cycle || !ownerId) {
    return;
  }

  await prisma.objective.update({
    where: { id },
    data: { title, description, cycle, ownerId },
  });
  revalidatePath("/", "layout");
}

export async function deleteObjectiveAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  if (!id) {
    return;
  }
  await prisma.objective.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function createKeyResultAction(formData: FormData) {
  await requireSession();
  const objectiveId = text(formData, "objectiveId");
  const title = text(formData, "title");
  const unit = text(formData, "unit") || "%";
  const currentValue = numberValue(formData, "currentValue");
  const targetValue = numberValue(formData, "targetValue");

  if (!objectiveId || !title || targetValue <= 0) {
    return;
  }

  await prisma.keyResult.create({
    data: { objectiveId, title, unit, currentValue, targetValue },
  });
  revalidatePath("/", "layout");
}

export async function updateKeyResultAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  const title = text(formData, "title");
  const unit = text(formData, "unit") || "%";
  const currentValue = numberValue(formData, "currentValue");
  const targetValue = numberValue(formData, "targetValue");

  if (!id || !title || targetValue <= 0) {
    return;
  }

  await prisma.keyResult.update({
    where: { id },
    data: { title, unit, currentValue, targetValue },
  });
  revalidatePath("/", "layout");
}

export async function deleteKeyResultAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  if (!id) {
    return;
  }
  await prisma.keyResult.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function createTaskAction(formData: FormData) {
  const session = await requireSession();
  const title = text(formData, "title");
  const ownerId = text(formData, "ownerId") || session.id;
  const keyResultId = text(formData, "keyResultId") || null;
  const week = text(formData, "week");
  const status = text(formData, "status") as TaskStatus;
  const weekStart = weekFromParam(week);

  if (!title) {
    return;
  }

  await prisma.weeklyTask.create({
    data: {
      title,
      ownerId,
      keyResultId,
      weekStart,
      status: Object.values(TaskStatus).includes(status) ? status : TaskStatus.TODO,
    },
  });
  revalidatePath("/", "layout");
  redirect(`/week?week=${toISODate(weekStart)}`);
}

export async function updateTaskStatusAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  const status = text(formData, "status") as TaskStatus;
  const week = text(formData, "week");

  if (!id || !Object.values(TaskStatus).includes(status)) {
    return;
  }

  await prisma.weeklyTask.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/", "layout");
  if (week) {
    redirect(`/week?week=${toISODate(parseLocalDate(week))}`);
  }
}

export async function deleteTaskAction(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  const week = text(formData, "week");
  if (!id) {
    return;
  }
  await prisma.weeklyTask.delete({ where: { id } });
  revalidatePath("/", "layout");
  if (week) {
    redirect(`/week?week=${toISODate(parseLocalDate(week))}`);
  }
}
