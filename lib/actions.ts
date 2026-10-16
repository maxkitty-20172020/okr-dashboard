"use server";

import { authenticateCredentials, compact, normalizeLogin } from "./login-credentials";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTask, mutateTask, TaskError, type ActionState } from "@/lib/task-service";
import { createObjective, updateObjective, deleteObjective, createKeyResult, updateKeyResult, deleteKeyResult, OkrError } from "@/lib/okr-service";
import { type Member } from "@/lib/tasks";
import { CheckInError, submitCheckIn } from "@/lib/check-in";
import { loginIp, loginLimiter } from "@/lib/login-limit";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loginAction(_prev: { error?: string } | null, formData: FormData) {
  const login = text(formData, "email");
  const email = normalizeLogin(login);
  const password = String(formData.get("password") ?? "");

  if (!email || !compact(password)) {
    return { error: "请输入账号和密码" };
  }

  const requestHeaders = await headers();
  const ip = loginIp(requestHeaders.get("x-real-ip"), requestHeaders.get("x-forwarded-for"));
  const lockedError = { error: "登录失败次数过多，请 10 分钟后重试" };
  if (loginLimiter.isLocked(email, ip)) return lockedError;

  const user = await authenticateCredentials(prisma, login, password);
  if (!user) {
    if (loginLimiter.recordFailure(email, ip)) return lockedError;
    return { error: "账号或密码不正确" };
  }

  await createSession(user);
  loginLimiter.reset(email, ip);
  redirect(user.mustChangePassword ? "/account" : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

function objectiveInput(form: FormData, defaultOwner = "") {
  return { title: text(form, "title"), description: text(form, "description"), cycle: text(form, "cycle"), ownerId: text(form, "ownerId") || defaultOwner };
}
function keyResultInput(form: FormData) {
  return { title: text(form, "title"), unit: text(form, "unit"), direction: text(form, "direction"), baselineValue: text(form, "baselineValue"), currentValue: text(form, "currentValue"), targetValue: text(form, "targetValue") };
}
async function okrWrite(operation: (actor: Member) => Promise<unknown>) {
  const session = await requireSession();
  let errorCode: string | undefined;
  try {
    await operation(session);
  } catch (error) {
    if (!(error instanceof OkrError)) throw error;
    errorCode = error.code;
  }
  if (errorCode) redirect(`/okrs?error=${encodeURIComponent(errorCode)}`);
  revalidatePath("/", "layout");
}

export async function createObjectiveAction(form: FormData) {
  await okrWrite(actor => createObjective(prisma, actor, objectiveInput(form, actor.id)));
}
export async function updateObjectiveAction(form: FormData) {
  await okrWrite(actor => updateObjective(prisma, actor, text(form, "id"), objectiveInput(form)));
}
export async function deleteObjectiveAction(form: FormData) {
  await okrWrite(actor => deleteObjective(prisma, actor, text(form, "id")));
}
export async function createKeyResultAction(form: FormData) {
  await okrWrite(actor => createKeyResult(prisma, actor, text(form, "objectiveId"), keyResultInput(form)));
}
export async function updateKeyResultAction(form: FormData) {
  await okrWrite(actor => updateKeyResult(prisma, actor, text(form, "id"), keyResultInput(form)));
}
export async function deleteKeyResultAction(form: FormData) {
  await okrWrite(actor => deleteKeyResult(prisma, actor, text(form, "id")));
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
  const operations = ["details", "progress", "collaborator", "contribution", "removeCollaborator", "milestone", "toggleMilestone", "archive", "restore", "transfer"] as const;
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

export async function submitCheckInAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  try {
    const checkIn = await submitCheckIn(prisma, session, {
      periodId: text(formData, "periodId"),
      scopeType: text(formData, "scopeType"),
      scopeId: text(formData, "scopeId") || null,
      status: text(formData, "status"),
      body: text(formData, "body"),
      metricNote: text(formData, "metricNote") || null,
      blocker: text(formData, "blocker") || null,
      nextStep: text(formData, "nextStep") || null,
    });
    revalidatePath("/", "layout");
    return { success: checkIn.status === "NO_CHANGE" ? "已确认暂无变化，本周期进展已记录。" : "周期汇报已提交。" };
  } catch (error) {
    if (error instanceof CheckInError) return { error: error.message };
    console.error("Check-in failed", error instanceof Error ? error.name : "Unknown error");
    return { error: "汇报未保存，请刷新页面后重试。" };
  }
}
