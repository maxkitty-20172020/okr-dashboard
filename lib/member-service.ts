import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { compact, normalizeLogin } from "./login-credentials";

type Actor = { id: string };
type Client = Prisma.TransactionClient;
export class MemberError extends Error {}
export type MemberInput = { name: string; role: string };
export const unfinishedTasks = { status: { notIn: ["DONE", "CANCELLED"] } } satisfies Prisma.TaskWhereInput;

async function activeUser(tx: Client, actor: Actor) {
  const user = await tx.user.findUnique({ where: { id: actor.id } });
  if (!user || user.disabledAt) throw new MemberError("账号不可用，请重新登录");
  return user;
}
export async function requireBoss(tx: Client, actor: Actor) {
  const user = await activeUser(tx, actor);
  if (user.role !== "BOSS") throw new MemberError("无权限管理成员");
  return user;
}
async function target(tx: Client, id: string) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new MemberError("成员不存在，请刷新页面");
  return user;
}
function memberData(input: MemberInput) {
  const name = input.name.trim();
  if (!name || Array.from(name).length > 40) throw new MemberError("姓名须为 1–40 字");
  if (input.role !== "MANAGER" && input.role !== "BOSS") throw new MemberError("请选择有效角色");
  return { name, role: input.role as Role };
}
function passwordData(raw: string) {
  const password = compact(raw);
  if (Array.from(password).length < 8 || Array.from(password).length > 72) throw new MemberError("密码须为 8–72 字符（规范化后）");
  return password;
}
async function keepBoss(tx: Client) {
  if (!await tx.user.count({ where: { role: "BOSS", disabledAt: null } })) throw new MemberError("至少保留 1 位未停用的老板");
}
async function bossWrite<T>(db: PrismaClient, actor: Actor, operation: (tx: Client) => Promise<T>) {
  return db.$transaction(async tx => {
    await requireBoss(tx, actor);
    const result = await operation(tx);
    await keepBoss(tx);
    return result;
  });
}
// Monotonic at millisecond precision even for two changes in the same tick.
function passwordChangeTime(previous: Date | null) {
  return new Date(Math.max(Date.now(), (previous?.getTime() ?? 0) + 1));
}
export async function createMember(db: PrismaClient, actor: Actor, input: MemberInput & { login: string; password: string }) {
  try {
    return await bossWrite(db, actor, async tx => {
      const data = memberData(input);
      const email = normalizeLogin(input.login);
      if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)
        || email.startsWith(".") || email.includes("..") || email.includes(".@")) throw new MemberError("请输入有效的登录账号或邮箱");
      if (await tx.user.findUnique({ where: { email } })) throw new MemberError("账号已存在");
      return tx.user.create({ data: { ...data, email, passwordHash: await hash(passwordData(input.password), 10), mustChangePassword: true } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new MemberError("账号已存在");
    throw error;
  }
}
export async function updateMember(db: PrismaClient, actor: Actor, id: string, input: MemberInput) {
  return bossWrite(db, actor, async tx => {
    await target(tx, id);
    const data = memberData(input);
    if (id === actor.id && data.role !== "BOSS") throw new MemberError("不能把自己改为填报成员，至少保留 1 位未停用的老板");
    const result = await tx.user.update({ where: { id }, data });
    return result;
  });
}
export async function resetPassword(db: PrismaClient, actor: Actor, id: string, rawPassword: string) {
  return bossWrite(db, actor, async tx => {
    const user = await target(tx, id);
    return tx.user.update({ where: { id }, data: { passwordHash: await hash(passwordData(rawPassword), 10),
      mustChangePassword: true, passwordChangedAt: passwordChangeTime(user.passwordChangedAt) } });
  });
}
export async function disableMember(db: PrismaClient, actor: Actor, id: string) {
  return bossWrite(db, actor, async tx => {
    const user = await target(tx, id);
    if (id === actor.id) throw new MemberError("不能停用自己，至少保留 1 位未停用的老板");
    const count = await tx.task.count({ where: { ownerId: id, ...unfinishedTasks } });
    if (count) throw new MemberError(`请先移交 ${count} 项未结束任务`);
    return tx.user.update({ where: { id }, data: { disabledAt: new Date(),
      // Advance the session revocation boundary so enabling never revives old cookies.
      passwordChangedAt: passwordChangeTime(user.passwordChangedAt) } });
  });
}
export async function enableMember(db: PrismaClient, actor: Actor, id: string) {
  return bossWrite(db, actor, async tx => {
    await target(tx, id);
    return tx.user.update({ where: { id }, data: { disabledAt: null } });
  });
}
export async function changeOwnPassword(db: PrismaClient, actor: Actor, currentPassword: string, newPassword: string) {
  return db.$transaction(async tx => {
    const user = await activeUser(tx, actor);
    if (!await compare(compact(currentPassword), user.passwordHash)) throw new MemberError("当前密码不正确");
    const password = passwordData(newPassword);
    if (await compare(password, user.passwordHash)) throw new MemberError("新密码不能与当前密码相同");
    return tx.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password, 10),
      mustChangePassword: false, passwordChangedAt: passwordChangeTime(user.passwordChangedAt) } });
  });
}
