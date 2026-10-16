import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { createObjective, updateObjective, deleteObjective, createKeyResult, updateKeyResult, deleteKeyResult, OkrError } from "../lib/okr-service";

const folder = mkdtempSync(join(tmpdir(), "okr-service-"));
const file = join(folder, "test.db");
const db = new PrismaClient({ datasourceUrl: `file:${file}` });
const actor = { id: "member", name: "成员", role: "MANAGER" };
const objectiveInput = { title: "经营目标", description: "完成标准", cycle: "2026-Q4", ownerId: "member" };
const krInput = { title: "指标", unit: "%", direction: "INCREASE", baselineValue: 0, targetValue: 100, currentValue: 30 };
before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: `file:${file}` }, stdio: "pipe" });
  await db.user.createMany({ data: ["member", "boss"].map(id => ({ id, name: id, email: `${id}@test.local`, passwordHash: "unused", role: id === "boss" ? "BOSS" : "MANAGER" })) });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });
const errorCode = (code: string) => (error: unknown) => error instanceof OkrError && error.code === code && !!error.message;

test("目标创建和修改校验成员、长度及季度，并关联正确 Period", async () => {
  const invalid = [
    { ownerId: "boss" }, { ownerId: "missing" }, { ownerId: "" },
    { title: "" }, { title: "字".repeat(161) }, { description: "字".repeat(2001) },
    { cycle: "2026-Q5" }, { cycle: "2026-Q0" }, { cycle: "2026-Q11" }, { cycle: "26-Q1" }, { cycle: "" },
  ];
  for (const extra of invalid) {
    await assert.rejects(createObjective(db, actor, { ...objectiveInput, ...extra }), OkrError);
  }
  const objective = await createObjective(db, actor, { ...objectiveInput, title: "字".repeat(160), description: "字".repeat(2000) });
  assert.equal((await db.period.findUniqueOrThrow({ where: { id: objective.periodId! } })).label, "2026-Q4");
  const before = await db.objective.findUniqueOrThrow({ where: { id: objective.id } });
  for (const extra of invalid) await assert.rejects(updateObjective(db, actor, objective.id, { ...objectiveInput, ...extra }), OkrError);
  assert.deepEqual(await db.objective.findUniqueOrThrow({ where: { id: objective.id } }), before);
  await updateObjective(db, actor, objective.id, { ...objectiveInput, cycle: "2027-Q1" });
  const updated = await db.objective.findUniqueOrThrow({ where: { id: objective.id }, include: { period: true } });
  assert.equal(updated.period?.label, "2027-Q1");
});

test("KR 创建修改拒绝非有限数、无效方向、错误区间及超长文本", async () => {
  const objective = await createObjective(db, actor, objectiveInput);
  const invalid = [
    { title: "" }, { title: "字".repeat(161) }, { unit: "字".repeat(21) }, { direction: "OTHER" }, { direction: "" },
    { baselineValue: NaN }, { targetValue: Infinity }, { currentValue: -Infinity }, { currentValue: "" }, { currentValue: "abc" },
    { targetValue: 0 }, { targetValue: -1 }, { direction: "DECREASE" },
  ];
  for (const extra of invalid) await assert.rejects(createKeyResult(db, actor, objective.id, { ...krInput, ...extra }), OkrError);
  const kr = await createKeyResult(db, actor, objective.id, { ...krInput, title: "字".repeat(160), unit: "字".repeat(20) });
  const before = await db.keyResult.findUniqueOrThrow({ where: { id: kr.id } });
  for (const extra of invalid) await assert.rejects(updateKeyResult(db, actor, kr.id, { ...krInput, ...extra }), OkrError);
  assert.deepEqual(await db.keyResult.findUniqueOrThrow({ where: { id: kr.id } }), before);
  await updateKeyResult(db, actor, kr.id, { ...krInput, direction: "DECREASE", baselineValue: 35, targetValue: 25, currentValue: 30 });
  assert.equal((await db.keyResult.findUniqueOrThrow({ where: { id: kr.id } })).direction, "DECREASE");
});

test("老板不能执行任何 OKR 写入，伪造角色及失效账号也被服务层拦截", async () => {
  const objective = await createObjective(db, actor, objectiveInput);
  const kr = await createKeyResult(db, actor, objective.id, krInput);
  const before = { objectives: await db.objective.findMany(), krs: await db.keyResult.findMany() };
  for (const user of [{ id: "boss", role: "BOSS" }, { id: "boss", role: "MANAGER" }, { id: "missing", role: "MANAGER" }]) {
    const forged = { ...user, name: "伪造" };
    for (const op of [
      () => createObjective(db, forged, objectiveInput), () => updateObjective(db, forged, objective.id, objectiveInput), () => deleteObjective(db, forged, objective.id),
      () => createKeyResult(db, forged, objective.id, krInput), () => updateKeyResult(db, forged, kr.id, krInput), () => deleteKeyResult(db, forged, kr.id),
    ]) await assert.rejects(op(), errorCode("read-only"));
  }
  assert.deepEqual({ objectives: await db.objective.findMany(), krs: await db.keyResult.findMany() }, before);
});

test("目标和 KR 有关联任务（包括归档）时拒删，任务和关联完整保留", async () => {
  const objective = await createObjective(db, actor, objectiveInput);
  const kr = await createKeyResult(db, actor, objective.id, krInput);
  const task = await db.task.create({ data: { title: "归档事项", ownerId: actor.id, keyResultId: kr.id, archivedAt: new Date() } });
  await assert.rejects(deleteKeyResult(db, actor, kr.id), errorCode("kr-linked"));
  await assert.rejects(deleteObjective(db, actor, objective.id), errorCode("objective-linked"));
  assert.deepEqual(await db.task.findUniqueOrThrow({ where: { id: task.id } }), task);
  assert.equal(await db.keyResult.count({ where: { id: kr.id } }), 1);
});

test("多态 Check-in 阻止删除目标、KR 以及含 KR 汇报的目标", async () => {
  for (const scopeType of ["OBJECTIVE", "KEY_RESULT"] as const) {
    const objective = await createObjective(db, actor, objectiveInput);
    const kr = await createKeyResult(db, actor, objective.id, krInput);
    const checkIn = await db.checkIn.create({ data: { periodId: objective.periodId!, scopeType, scopeId: scopeType === "OBJECTIVE" ? objective.id : kr.id, authorId: actor.id, status: "NO_CHANGE", body: "确认" } });
    await assert.rejects(deleteObjective(db, actor, objective.id), errorCode("objective-linked"));
    if (scopeType === "KEY_RESULT") await assert.rejects(deleteKeyResult(db, actor, kr.id), errorCode("kr-linked"));
    assert.deepEqual(await db.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } }), checkIn);
    assert.equal(await db.keyResult.count({ where: { id: kr.id } }), 1);
  }
});

test("空目标及 KR 可删除，Check-in 的 scopeType 必须匹配才阻止删除", async () => {
  const objective = await createObjective(db, actor, objectiveInput);
  const kr = await createKeyResult(db, actor, objective.id, krInput);
  await db.checkIn.create({ data: { periodId: objective.periodId!, scopeType: "TASK", scopeId: kr.id, authorId: actor.id, status: "NO_CHANGE", body: "不同范围同 ID" } });
  await deleteKeyResult(db, actor, kr.id);
  assert.equal(await db.keyResult.count({ where: { id: kr.id } }), 0);
  await createKeyResult(db, actor, objective.id, krInput);
  await deleteObjective(db, actor, objective.id);
  assert.equal(await db.objective.count({ where: { id: objective.id } }), 0);
  assert.equal(await db.keyResult.count({ where: { objectiveId: objective.id } }), 0);
});

test("不存在的目标或 KR 返回业务错误", async () => {
  for (const op of [
    () => updateObjective(db, actor, "missing", objectiveInput), () => deleteObjective(db, actor, "missing"),
    () => createKeyResult(db, actor, "missing", krInput), () => updateKeyResult(db, actor, "missing", krInput), () => deleteKeyResult(db, actor, "missing"),
  ]) await assert.rejects(op(), errorCode("missing"));
});
