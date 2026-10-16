import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { getRounds, hash } from "bcryptjs";
import { SignJWT } from "jose";
import { changeOwnPassword, createMember, disableMember, enableMember, MemberError, resetPassword, updateMember } from "../lib/member-service";
import { authenticateCredentials, compact, normalizeLogin } from "../lib/login-credentials";
import { sessionFromToken, sessionIsCurrent, signSessionToken } from "../lib/session-token";
import { createTask, mutateTask, TaskError } from "../lib/task-service";
import { loadTaskDetail } from "../lib/task-detail-view";
import { loadMembers } from "../lib/member-view";

const folder = mkdtempSync(join(tmpdir(), "okr-members-"));
const db = new PrismaClient({ datasourceUrl: `file:${join(folder, "test.db")}` });
const boss = { id: "boss", name: "老板", role: "BOSS" };
const manager = { id: "member", name: "成员", role: "MANAGER" };
const input = { name: "新成员", login: "new", password: "password123", role: "MANAGER" };
let passwordHash: string;
before(async () => {
  process.env.AUTH_SECRET = "member-unit-test-secret-do-not-use-in-production";
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${join(folder, "test.db")}` }, stdio: "pipe" });
  passwordHash = await hash("password123", 10);
});
beforeEach(async () => {
  await db.taskUpdate.deleteMany(); await db.raciAssignment.deleteMany(); await db.task.deleteMany(); await db.user.deleteMany();
  await db.user.createMany({ data: [boss, manager, { id: "other", name: "另一成员", role: "MANAGER" }].map(u => ({ ...u, role: u.role as "BOSS" | "MANAGER", email: `${u.id}@okr.local`, passwordHash })) });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });

const memberError = (message?: RegExp) => (error: unknown) => error instanceof MemberError && (!message || message.test(error.message));
async function user(id: string) { return db.user.findUniqueOrThrow({ where: { id } }); }
function form(data: Record<string, string | number>) {
  const result = new FormData(); for (const [k, v] of Object.entries(data)) result.set(k, String(v)); return result;
}
const taskData = { title: "分工", area: "OTHER", kind: "SHORT_TERM", ownerId: "member", completionCriteria: "交付", nextAction: "推进", nextFollowUpAt: "2099-01-01" };

test("所有管理操作重查数据库权限，拒绝非老板、伪造角色、不存在及已停用老板", async () => {
  const disabledBoss = await db.user.create({ data: { name: "停用老板", email: "off@okr.local", passwordHash, role: "BOSS", disabledAt: new Date() } });
  const before = await db.user.findMany();
  for (const actor of [manager, { ...manager, role: "BOSS" }, { ...boss, id: "missing" }, disabledBoss]) {
    for (const operation of [
      () => createMember(db, actor, input), () => updateMember(db, actor, manager.id, { name: "变更", role: "BOSS" }),
      () => resetPassword(db, actor, manager.id, "temporary123"), () => disableMember(db, actor, manager.id),
      () => enableMember(db, actor, manager.id), () => loadMembers(db, actor),
    ]) await assert.rejects(operation(), memberError());
  }
  assert.deepEqual(await db.user.findMany(), before);
  // A forged MANAGER role cannot hide a database BOSS, either.
  const forgedBoss = { ...boss, role: "MANAGER" };
  await updateMember(db, forgedBoss, manager.id, { name: "已更新", role: "MANAGER" });
  assert.equal((await user(manager.id)).name, "已更新");
});

test("新增支持规范化短账号、初始密码以及完整邮箱，bcrypt cost 10，强制改密", async () => {
  const created = await createMember(db, boss, { ...input, login: "　ＮＥ Ｗ\u200b　", password: "　ｐａｓｓｗｏｒｄ１２３\ufeff " });
  assert.equal(created.email, "new@okr.local"); assert.equal(created.mustChangePassword, true);
  assert.equal(created.disabledAt, null); assert.equal(created.passwordChangedAt, null); assert.equal(getRounds(created.passwordHash), 10);
  assert.equal((await authenticateCredentials(db, " ＮＥ Ｗ ", "　ｐａｓｓｗｏｒｄ１２３ "))?.id, created.id);
  const second = await createMember(db, boss, { ...input, login: "Owner@Example.COM", role: "BOSS" });
  assert.equal(second.email, "owner@example.com"); assert.equal(second.role, "BOSS");
  assert.equal(compact("　ａ b\u200b　"), "a b"); assert.equal(normalizeLogin("ＯＫＲ １"), "okr1@okr.local");
  assert.equal(await authenticateCredentials(db, "new", "wrong"), null);
  // Removing zero-width characters may expose a combining sequence. Login
  // must normalize exactly once, as the original loginAction did.
  const rawPassword = "a\u200b\u0301password123";
  const combining = await createMember(db, boss, { ...input, login: "combining", password: rawPassword });
  assert.equal((await authenticateCredentials(db, "combining", rawPassword))?.id, combining.id);
});

test("重复账号、姓名、角色、账号格式严格验证，失败不产生记录", async () => {
  await assert.rejects(createMember(db, boss, { ...input, login: "ＭＥＭＢＥＲ " }), memberError(/账号已存在/));
  for (const extra of [{ name: "" }, { name: "字".repeat(41) }, { role: "ADMIN" }, { login: "" }, { login: "bad@" }, { login: "@okr.local" }, { login: "a..b@okr.local" }, { login: "a@@b.com" }]) {
    await assert.rejects(createMember(db, boss, { ...input, ...extra }), memberError());
  }
  assert.equal(await db.user.count(), 3);
  await createMember(db, boss, { ...input, name: "字".repeat(40) });
});

test("创建、重置、自改密码均在 compact 后校验 8–72 字符长度", async () => {
  for (const password of ["1234567", "x".repeat(73), "　１２３４５６７　"]) {
    await assert.rejects(createMember(db, boss, { ...input, password }), memberError(/密码/));
    await assert.rejects(resetPassword(db, boss, manager.id, password), memberError(/密码/));
    await assert.rejects(changeOwnPassword(db, manager, "password123", password), memberError(/密码/));
  }
  for (const password of ["x".repeat(8), "x".repeat(72), "字".repeat(72)]) {
    await resetPassword(db, boss, manager.id, password);
    assert.ok(await authenticateCredentials(db, "member", password));
  }
});

test("不能停用自己、不能自降级，最后一位活跃老板始终保留；有第二位老板也不能自降级", async () => {
  await assert.rejects(disableMember(db, boss, boss.id), memberError(/不能停用自己/));
  await assert.rejects(updateMember(db, boss, boss.id, { name: "老板", role: "MANAGER" }), memberError(/至少保留/));
  const second = await createMember(db, boss, { ...input, role: "BOSS" });
  await assert.rejects(updateMember(db, boss, boss.id, { name: "老板", role: "MANAGER" }), memberError(/不能把自己/));
  await disableMember(db, boss, second.id);
  assert.equal(await db.user.count({ where: { role: "BOSS", disabledAt: null } }), 1);
  await assert.rejects(disableMember(db, second, boss.id), memberError());
  await enableMember(db, boss, second.id);
  await updateMember(db, second, boss.id, { name: "原老板", role: "MANAGER" });
  assert.equal(await db.user.count({ where: { role: "BOSS", disabledAt: null } }), 1);
  await assert.rejects(updateMember(db, second, second.id, { name: "最后老板", role: "MANAGER" }), memberError(/至少保留/));
});

test("未结束任务按数量阻止停用，完成和取消任务不阻止，任务与历史姓名保留", async () => {
  for (const status of ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE", "CANCELLED"] as const) {
    await db.task.create({ data: { title: status, status, ownerId: manager.id } });
  }
  await assert.rejects(disableMember(db, boss, manager.id), memberError(/请先移交 4 项未结束任务/));
  await db.task.updateMany({ where: { status: { notIn: ["DONE", "CANCELLED"] } }, data: { ownerId: "other" } });
  await disableMember(db, boss, manager.id);
  assert.equal(await db.task.count(), 6);
  assert.equal((await db.task.findFirstOrThrow({ where: { ownerId: manager.id }, include: { owner: true } })).owner.name, manager.name);
  assert.equal((await loadMembers(db, boss)).find(u => u.id === "other")?._count.tasks, 4);
});

test("停用立即使会话及凭据失效，启用可用原密码登录", async () => {
  const token = await signSessionToken(await user(manager.id));
  assert.ok(await sessionFromToken(db, token));
  await disableMember(db, boss, manager.id);
  assert.equal(await sessionFromToken(db, token), null);
  assert.equal(await authenticateCredentials(db, "member", "password123"), null);
  await assert.rejects(changeOwnPassword(db, manager, "password123", "newpassword123"), memberError());
  await enableMember(db, boss, manager.id);
  assert.ok(await authenticateCredentials(db, "member", "password123"));
  assert.equal(await sessionFromToken(db, token), null);
});

test("重置密码后旧 token 失效，新密码规范化可登录且强制改密", async () => {
  const token = await signSessionToken(await user(manager.id));
  const changed = await resetPassword(db, boss, manager.id, "　Ｔｅｍｐ１２３４５　");
  assert.ok(changed.passwordChangedAt); assert.equal(changed.mustChangePassword, true);
  assert.equal(await sessionFromToken(db, token), null);
  assert.equal(await authenticateCredentials(db, "member", "password123"), null);
  const logged = await authenticateCredentials(db, "member", "Temp12345");
  assert.ok(logged);
  assert.equal((await sessionFromToken(db, await signSessionToken(logged)))?.mustChangePassword, true);
});

test("本人改密要求当前密码、新旧不同；当前新 token 有效、其他设备 token 失效，老板也可改密", async () => {
  for (const actor of [manager, boss]) {
    const old = await signSessionToken(await user(actor.id));
    await assert.rejects(changeOwnPassword(db, actor, "wrong", "newpassword123"), memberError(/当前密码/));
    await assert.rejects(changeOwnPassword(db, actor, "password123", "　ｐａｓｓｗｏｒｄ１２３　"), memberError(/不能与当前/));
    const changed = await changeOwnPassword(db, actor, "　ｐａｓｓｗｏｒｄ１２３　", "　ＮｅｗＰａｓｓ１２３　");
    assert.equal(changed.mustChangePassword, false);
    assert.equal(await sessionFromToken(db, old), null);
    const current = await sessionFromToken(db, await signSessionToken(changed));
    assert.equal(current?.id, actor.id); assert.equal(current?.mustChangePassword, false);
    assert.ok(await authenticateCredentials(db, `${actor.id}`, "NewPass123"));
  }
});

test("会话秒级比较保留毫秒精度，同秒旧 token、缺失 iat、旧修订号均拒绝", async () => {
  const changedAt = new Date("2026-10-16T00:00:00.500Z");
  const record = { disabledAt: null, passwordChangedAt: changedAt };
  assert.equal(sessionIsCurrent({ iat: changedAt.getTime() / 1000 - 0.001 }, record), false);
  assert.equal(sessionIsCurrent({ iat: Math.floor(changedAt.getTime() / 1000) }, record), false);
  assert.equal(sessionIsCurrent({}, { ...record, passwordChangedAt: null }), false);
  assert.equal(sessionIsCurrent({ iat: changedAt.getTime() / 1000, passwordRevision: changedAt.getTime() }, record), true);
  assert.equal(sessionIsCurrent({ iat: changedAt.getTime() / 1000 + 1, passwordRevision: 0 }, record), false);
  const original = await user(manager.id);
  const legacyToken = await new SignJWT({ id: original.id, name: original.name, email: original.email, role: "BOSS" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  assert.equal((await sessionFromToken(db, legacyToken))?.role, "MANAGER");
  await resetPassword(db, boss, manager.id, "temporary123");
  assert.equal(await sessionFromToken(db, legacyToken), null);
  assert.equal(await sessionFromToken(db, "invalid"), null);
});

test("停用成员不能作为主负责人或协作者，停用操作者与老板业务写入仍被拒绝，下拉列表排除停用者", async () => {
  const id = await createTask(db, manager, form(taskData));
  await disableMember(db, boss, "other");
  await assert.rejects(createTask(db, manager, form({ ...taskData, ownerId: "other" })), TaskError);
  for (const [operation, data] of [["details", { ...taskData, ownerId: "other" }], ["collaborator", { userId: "other", deliverable: "交付" }]] as const) {
    await assert.rejects(mutateTask(db, manager, form({ taskId: id, version: 0, ...data }), operation), TaskError);
  }
  await assert.rejects(createTask(db, { ...manager, id: "other" }, form(taskData)), TaskError);
  await assert.rejects(createTask(db, { ...boss, role: "MANAGER" }, form(taskData)), TaskError);
  const detail = await loadTaskDetail(db, manager, id, {});
  assert.ok(detail); assert.equal(detail.members.some(m => m.id === "other"), false);
  assert.equal(detail.available.some(m => m.id === "other"), false);
});

test("更新姓名角色和启停不修改密码，缺失目标与无效输入原子拒绝", async () => {
  await updateMember(db, boss, manager.id, { name: "新姓名", role: "BOSS" });
  assert.equal((await user(manager.id)).passwordHash, passwordHash);
  await updateMember(db, boss, manager.id, { name: "新姓名", role: "MANAGER" });
  for (const extra of [{ name: "" }, { name: "字".repeat(41) }, { role: "ROOT" }]) {
    await assert.rejects(updateMember(db, boss, manager.id, { name: "有效", role: "MANAGER", ...extra }), MemberError);
  }
  for (const operation of [() => updateMember(db, boss, "missing", input), () => resetPassword(db, boss, "missing", input.password), () => disableMember(db, boss, "missing"), () => enableMember(db, boss, "missing")]) {
    await assert.rejects(operation(), memberError(/不存在/));
  }
  assert.equal((await user(manager.id)).name, "新姓名");
});
