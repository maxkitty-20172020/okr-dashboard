import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { quarterBounds } from "../lib/week";
import { ensurePeriodTree } from "../lib/period";
import { tasksInPeriod } from "../lib/overview";
import { SYSTEM_VIEWER } from "../lib/task-visibility";

// Always creates its own temporary database; never uses the caller's DATABASE_URL.
async function main() {
  const folder = mkdtempSync(join(tmpdir(), "okr-backfill-rehearsal-"));
  const databaseUrl = `file:${join(folder, "rehearsal.db")}`;
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
    await db.user.createMany({ data: ["boss", "member1", "member2", "member3"].map(id => ({ id, name: id, email: `${id}@fixture.local`, passwordHash: "unused", role: id === "boss" ? "BOSS" : "MANAGER" })) });
    const now = new Date();
    const quarter = await db.period.create({ data: { kind: "QUARTER", ...quarterBounds(now) } });
    await db.objective.create({ data: { title: "已有季度目标", cycle: quarter.label, periodId: quarter.id, ownerId: "member1" } });
    await db.task.createMany({ data: Array.from({ length: 15 }, (_, i) => ({
      id: `task-${i}`, title: `未结束事项 ${i + 1}`, ownerId: `member${i % 3 + 1}`,
      status: "IN_PROGRESS" as const, createdAt: new Date(now.getTime() - 86400_000 * 14),
      dueAt: i < 13 ? null : new Date(now.getTime() + 86400_000 * 14),
      latestProgress: `保留进展 ${i + 1}`, version: i,
    })) });
    const businessBefore = { tasks: await db.task.findMany(), objectives: await db.objective.findMany() };
    assert.equal(await db.raciAssignment.count(), 0);
    console.log("fixture: users=4, openTasks=15, schedulePeriodId=null:15, dueAt=null:13, raci=0");
    function run(...args: string[]) {
      const output = execFileSync("npm", ["run", "db:backfill", "--", ...args], { env, encoding: "utf8", stdio: "pipe" });
      const line = output.trim().split("\n").at(-1)!;
      console.log(line);
      return JSON.parse(line) as { total: number; changes: Record<string, number> };
    }
    const dry = run("--dry-run");
    assert.equal(await db.raciAssignment.count(), 0);
    assert.equal(await db.period.count(), 1);
    const first = run();
    assert.deepEqual(first.changes, dry.changes);
    assert.equal(first.changes.raciCreated, 30);
    const second = run();
    assert.equal(second.total, 0);
    assert.deepEqual({ tasks: await db.task.findMany(), objectives: await db.objective.findMany() }, businessBefore);
    const { week } = await ensurePeriodTree(db, now);
    assert.equal((await tasksInPeriod(db, week, quarter.id, SYSTEM_VIEWER)).length, 15);
    console.log(`verified: ${week.label} tasks=15, R/A=30, businessFields=unchanged, secondRun=0`);
  } finally {
    await db.$disconnect();
    rmSync(folder, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
