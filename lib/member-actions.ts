"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, requireSession } from "./auth";
import { prisma } from "./prisma";
import { changeOwnPassword, createMember, disableMember, enableMember, MemberError, resetPassword, updateMember } from "./member-service";
import type { ActionState } from "./task-service";

function text(form: FormData, key: string) { return String(form.get(key) ?? ""); }
export async function memberAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireSession();
  const id = text(form, "id");
  try {
    switch (text(form, "operation")) {
      case "create": await createMember(prisma, actor, { name: text(form, "name"), login: text(form, "login"), password: text(form, "password"), role: text(form, "role") }); break;
      case "update": await updateMember(prisma, actor, id, { name: text(form, "name"), role: text(form, "role") }); break;
      case "reset": await resetPassword(prisma, actor, id, text(form, "password")); break;
      case "disable": await disableMember(prisma, actor, id); break;
      case "enable": await enableMember(prisma, actor, id); break;
      default: throw new MemberError("操作无效，请刷新页面");
    }
  } catch (error) {
    if (error instanceof MemberError) return { error: error.message };
    console.error("Member operation failed", error instanceof Error ? error.name : "Unknown error");
    return { error: "操作未保存，请稍后重试" };
  }
  revalidatePath("/", "layout");
  return { success: "已保存" };
}
export async function changeOwnPasswordAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireSession({ allowPasswordChange: true });
  try {
    const user = await changeOwnPassword(prisma, actor, text(form, "currentPassword"), text(form, "newPassword"));
    await createSession(user);
  } catch (error) {
    if (error instanceof MemberError) return { error: error.message };
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/account?changed=1");
}
