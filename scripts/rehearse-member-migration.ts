import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { authenticateCredentials } from "../lib/login-credentials";

async function main() {
  const folder = mkdtempSync(join(tmpdir(), "okr-member-migration-"));
  const dbUrl = `file:${join(folder, "rehearsal.db")}`;
  const db = new PrismaClient({ datasourceUrl: dbUrl });
  const env = { ...process.env, DATABASE_URL: dbUrl };
  const oldFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", "origin/main", "prisma/migrations", "prisma/schema.prisma"], { encoding: "utf8" }).trim().split("\n");
  assert.ok(!oldFiles.some(file => file.includes("member_admin")), "origin/main must be the pre-member-management version");
  try {
    for (const file of oldFiles) {
      const destination = join(folder, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, execFileSync("git", ["show", `origin/main:${file}`]));
    }
    const deploy = () => execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(folder, "prisma/schema.prisma")], { cwd: folder, env, encoding: "utf8", stdio: "pipe" });
    deploy();
    const passwordHash = await hash("okr12345", 10);
    for (const [i, id] of ["okr", "okr1", "okr2", "okr3"].entries()) {
      await db.$executeRaw`INSERT INTO "User" (id,name,email,passwordHash,role) VALUES (${id},${`旧用户${i}`},${`${id}@okr.local`},${passwordHash},${i === 0 ? "BOSS" : "MANAGER"})`;
    }
    for (const [i, status] of ["IN_PROGRESS", "DONE", "CANCELLED"].entries()) {
      await db.$executeRaw`INSERT INTO "WeeklyTask" (id,title,status,ownerId,createdAt,updatedAt) VALUES (${`task${i}`},${`旧任务${i}`},${status},${`okr${i + 1}`},${1728000000000},${1728000000000})`;
      await db.$executeRaw`INSERT INTO "TaskUpdate" (id,taskId,authorId,kind,body) VALUES (${`update${i}`},${`task${i}`},${`okr${i + 1}`},${"PROGRESS"},${`旧进展${i}`})`;
    }
    // Compare every pre-existing column of every application table; the new
    // columns and Prisma's newly recorded migration are the only differences.
    const tables = await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name`);
    const snapshots = [];
    for (const { name } of tables) {
      const columns = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${name}")`);
      const sql = `SELECT ${columns.map(c => `"${c.name}"`).join(",")} FROM "${name}" ORDER BY id`;
      snapshots.push({ name, sql, rows: await db.$queryRawUnsafe(sql) });
    }
    cpSync("prisma/migrations/20261016120000_member_admin", join(folder, "prisma/migrations/20261016120000_member_admin"), { recursive: true });
    const output = deploy();
    assert.match(output, /20261016120000_member_admin/);
    for (const snapshot of snapshots) assert.deepEqual(await db.$queryRawUnsafe(snapshot.sql), snapshot.rows, `${snapshot.name} data changed`);
    const users = await db.user.findMany();
    for (const user of users) {
      assert.equal(user.disabledAt, null); assert.equal(user.passwordChangedAt, null); assert.equal(user.mustChangePassword, false);
      assert.ok(await authenticateCredentials(db, user.email, "okr12345"));
      assert.ok(await authenticateCredentials(db, user.id, "　ｏｋｒ１２３４５　"));
    }
    const foreignKeys = await db.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check");
    assert.equal(foreignKeys.length, 0);
    const integrity = await db.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    assert.equal(integrity[0].integrity_check, "ok");
    console.log(`origin/main: ${execFileSync("git", ["rev-parse", "--short", "origin/main"], { encoding: "utf8" }).trim()}`);
    console.log("Applied old migrations, inserted 4 users + 3 tasks + 3 progress records, then deployed 20261016120000_member_admin.");
    console.log(`PASS: ${snapshots.length} application tables preserved across all original columns.`);
    console.log("PASS: 4/4 original passwords, short accounts and full-width/whitespace password normalization authenticate (8 checks).");
    console.log("PASS: all existing users disabledAt=null, passwordChangedAt=null, mustChangePassword=false.");
    console.log("PASS: PRAGMA integrity_check=ok; foreign_key_check=0 violations.");
    console.log("Temporary database removed on exit; no configured application database used.");
  } finally { await db.$disconnect(); rmSync(folder, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
