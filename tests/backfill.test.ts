import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const folder = mkdtempSync(join(tmpdir(), "okr-backfill-"));
const file = join(folder, "test.db");
const env = { ...process.env, DATABASE_URL: `file:${file}` };
const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
before(async () => {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
  await db.user.createMany({ data: ["owner", "old", "helper"].map(id => ({ id, name: id, email: `${id}@test.local`, passwordHash: "unused" })) });
});
after(async () => { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); });
function run(...args: string[]) {
  const output = execFileSync("npm", ["run", "db:backfill", "--", ...args], { env, encoding: "utf8", stdio: "pipe" });
  const line = output.trim().split("\n").at(-1)!;
  return JSON.parse(line) as { mode: string; total: number; changes: Record<string, number> };
}
async function snapshot() {
  return {
    users: await db.user.findMany(), tasks: await db.task.findMany(), updates: await db.taskUpdate.findMany(),
    checkIns: await db.checkIn.findMany(), collaborators: await db.taskCollaborator.findMany(),
    objectives: await db.objective.findMany(), keyResults: await db.keyResult.findMany(),
    periods: await db.period.findMany(), raci: await db.raciAssignment.findMany(), deliverables: await db.deliverable.findMany(),
  };
}
test("回填 CLI dry-run 不写入、修复历史移交 R/A、幂等并保留所有业务字段", async () => {
  const objective = await db.objective.create({ data: { ownerId: "owner", title: "历史目标", cycle: "2026-Q4" } });
  const kr = await db.keyResult.create({ data: { objectiveId: objective.id, title: "指标", targetValue: 100 } });
  const task = await db.task.create({ data: { ownerId: "owner", title: "历史移交", keyResultId: kr.id, latestProgress: "事实", version: 7, collaborators: { create: { userId: "helper", deliverable: "历史交付", note: "已交付", done: true } } } });
  await db.taskUpdate.create({ data: { taskId: task.id, authorId: "old", kind: "DETAILS", body: "移交" } });
  await db.raciAssignment.createMany({ data: ["R", "A", "I"].map(role => ({ subjectType: "TASK" as const, subjectId: task.id, userId: "old", role: role as "R" | "A" | "I" })) });
  // Existing Check-in / Deliverable must survive unchanged.
  const period = await db.period.create({ data: { kind: "QUARTER", label: "2025-Q1", startAt: new Date("2025-01-01"), endAt: new Date("2025-04-01") } });
  await db.checkIn.create({ data: { periodId: period.id, scopeType: "TASK", scopeId: task.id, authorId: "old", status: "SUBMITTED", body: "历史汇报" } });
  await db.deliverable.create({ data: { taskId: task.id, title: "已存在的交付", ownerUserId: "old" } });
  const before = await snapshot();
  const dry = run("--dry-run");
  assert.equal(dry.mode, "dry-run");
  assert.ok(dry.total > 0);
  assert.deepEqual(await snapshot(), before);
  const applied = run();
  assert.equal(applied.mode, "applied");
  assert.deepEqual(applied.changes, dry.changes);
  assert.equal(applied.changes.raciDeleted, 2);
  const after = await snapshot();
  for (const key of ["users", "tasks", "updates", "checkIns", "collaborators", "keyResults"] as const) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(after.deliverables.find(d => d.id === before.deliverables[0].id), before.deliverables[0]);
  assert.deepEqual(after.objectives.map(row => ({ ...row, periodId: null })), before.objectives);
  assert.ok(after.objectives[0].periodId);
  assert.deepEqual(after.raci.map(r => `${r.role}:${r.userId}`).sort(), ["A:owner", "C:helper", "I:old", "R:owner"]);
  assert.equal(after.deliverables.filter(d => d.title === "历史交付").length, 1);
  const second = run();
  assert.equal(second.total, 0);
  assert.deepEqual(await snapshot(), after);
});

test("回填中途失败会回滚同一事务内的周期、RACI 及目标关联", async () => {
  await db.task.create({ data: { title: "回滚演练", ownerId: "owner", collaborators: { create: { userId: "helper", deliverable: "强制失败" } } } });
  await db.objective.create({ data: { title: "未回填目标", cycle: "2027-Q2", ownerId: "owner" } });
  await db.$executeRawUnsafe("CREATE TRIGGER reject_backfill BEFORE INSERT ON Deliverable BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  const before = await snapshot();
  try {
    assert.throws(() => run(), /Command failed/);
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER reject_backfill");
  }
});

test("模拟线上 15 条无排期未结束任务，三次回填输出与周期可见性正确", () => {
  const output = execFileSync("npx", ["tsx", "scripts/rehearse-backfill.ts"], { encoding: "utf8", stdio: "pipe" });
  assert.match(output, /openTasks=15/);
  assert.match(output, /tasks=15, R\/A=30, businessFields=unchanged, secondRun=0/);
});
