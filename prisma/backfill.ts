import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { planFoundationBackfill } from "../lib/foundation-backfill";
import { applyFoundationBackfill } from "../lib/wbs";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--dry-run")) throw new Error("仅支持 --dry-run 参数。");
  if (!process.env.DATABASE_URL) throw new Error("请显式配置 DATABASE_URL，回填不会使用默认数据库。");
  const db = new PrismaClient();
  try {
    const dryRun = args.includes("--dry-run");
    const changes = await db.$transaction(async tx => dryRun
      ? (await planFoundationBackfill(tx)).changes
      : applyFoundationBackfill(tx), { timeout: 120_000 });
    console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "applied", changes, total: Object.values(changes).reduce((sum, count) => sum + count, 0) }));
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error("回填失败，事务未提交：", error instanceof Error ? error.message : "未知错误");
  process.exitCode = 1;
});
