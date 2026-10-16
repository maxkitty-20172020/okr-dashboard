import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "okr-backup-tests-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "prisma"));
  copyFileSync("scripts/backup-db.sh", join(root, "scripts/backup-db.sh"));
  const backups = join(root, "backups");
  const run = () => spawnSync("bash", [join(root, "scripts/backup-db.sh")], {
    cwd: tmpdir(), env: { ...process.env, BACKUP_DIR: backups }, encoding: "utf8",
  });
  return { root, backups, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("在线备份包含未 checkpoint 的 WAL 数据，相对路径、完整性和 30 份轮换正确", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, ".env"), 'DATABASE_URL="file:./fixture.db" # 相对 prisma/\n');
    mkdirSync(f.backups);
    for (let i = 1; i <= 31; i++) {
      writeFileSync(join(f.backups, `okr-200001${String(i).padStart(2, "0")}-000000.db`), "old");
    }
    writeFileSync(join(f.backups, "keep.txt"), "unrelated");
    // 父 Python 连接保持打开，子进程执行真实脚本时 WAL 中仍有已提交的数据。
    const result = execFileSync("python3", ["-c", `
import os, sqlite3, subprocess, sys
from pathlib import Path
root = Path(sys.argv[1])
db = sqlite3.connect(root / 'prisma/fixture.db')
db.execute('PRAGMA journal_mode=WAL')
db.execute('PRAGMA wal_autocheckpoint=0')
db.execute('CREATE TABLE sample (value TEXT)')
db.execute("INSERT INTO sample VALUES ('WAL 中的数据')")
db.commit()
assert (root / 'prisma/fixture.db-wal').stat().st_size > 0
result = subprocess.run(['bash', str(root / 'scripts/backup-db.sh')], env={**os.environ, 'BACKUP_DIR': sys.argv[2]}, capture_output=True, text=True, check=True)
print(result.stdout, end='')
db.close()
`, f.root, f.backups], { encoding: "utf8", cwd: tmpdir() });
    assert.match(result, /integrity_check: ok/);
    const copies = readdirSync(f.backups).filter(name => /^okr-.*\.db$/.test(name)).sort();
    assert.equal(copies.length, 30);
    assert.equal(copies.includes("okr-20000101-000000.db"), false);
    assert.equal(copies.includes("okr-20000102-000000.db"), false);
    assert.equal(readFileSync(join(f.backups, "keep.txt"), "utf8"), "unrelated");
    const latest = join(f.backups, copies.at(-1)!);
    assert.equal(statSync(latest).mode & 0o777, 0o600);
    const content = execFileSync("python3", ["-c", "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute('PRAGMA integrity_check').fetchone()[0]); print(c.execute('SELECT value FROM sample').fetchone()[0])", latest], { encoding: "utf8" });
    assert.equal(content.trim(), "ok\nWAL 中的数据");
  } finally { f.cleanup(); }
});

test("支持绝对路径、空格和单引号 .env 配置，同秒重复备份不覆盖", () => {
  const f = fixture();
  try {
    const db = join(f.root, "absolute space.db");
    execFileSync("python3", ["-c", "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('CREATE TABLE sample (id INTEGER)'); c.close()", db]);
    writeFileSync(join(f.root, ".env"), `export DATABASE_URL='file:${db}'\n`);
    const first = f.run();
    assert.equal(first.status, 0, first.stderr);
    const file = readdirSync(f.backups)[0];
    const before = readFileSync(join(f.backups, file));
    // 若跨秒则允许新备份；无论如何原来的备份不可改变。
    const second = f.run();
    assert.ok(second.status === 0 || (second.status === 1 && /File exists/.test(second.stderr)));
    assert.deepEqual(readFileSync(join(f.backups, file)), before);
    assert.equal(readdirSync(f.backups).some(name => name.startsWith(".okr-backup-")), false);
  } finally { f.cleanup(); }
});

test("备份的 integrity_check 失败时返回非零，不发布损坏备份或轮换旧备份", () => {
  const f = fixture();
  try {
    const db = join(f.root, "prisma/corrupt.db");
    execFileSync("python3", ["-c", `
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.executescript('CREATE TABLE sample (id INTEGER); CREATE INDEX bad_index ON sample(id); INSERT INTO sample VALUES (1);')
page = c.execute("SELECT rootpage FROM sqlite_master WHERE name='bad_index'").fetchone()[0]
page_size = c.execute('PRAGMA page_size').fetchone()[0]
c.close()
# 损坏索引页的页类型，避免依赖系统 SQLite 是否允许 writable_schema。
with open(sys.argv[1], 'r+b') as file:
    file.seek((page - 1) * page_size)
    file.write(bytes([0]))
`, db]);
    writeFileSync(join(f.root, ".env"), "DATABASE_URL=file:./corrupt.db\n");
    mkdirSync(f.backups);
    const old = join(f.backups, "okr-20000101-000000.db");
    writeFileSync(old, "keep");
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /备份失败/);
    assert.deepEqual(readdirSync(f.backups), ["okr-20000101-000000.db"]);
    assert.equal(readFileSync(old, "utf8"), "keep");
  } finally { f.cleanup(); }
});

test("缺失源数据库时拒绝创建空库，且不执行 .env 中的 shell 内容", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, ".env"), `DATABASE_URL=file:./missing.db\nOTHER=$(touch '${join(f.root, "must-not-exist")}')\n`);
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /数据库不存在/);
    assert.equal(existsSync(join(f.root, "prisma/missing.db")), false);
    assert.equal(existsSync(join(f.root, "must-not-exist")), false);
    assert.equal(existsSync(f.backups), false);
  } finally { f.cleanup(); }
});
