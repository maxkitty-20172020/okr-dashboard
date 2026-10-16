import { execFileSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  const rootDir = path.resolve(__dirname, "..");
  const testDbPath = path.resolve(__dirname, "test.db");
  const dbUrl = `file:${testDbPath}`;

  // 清理旧的测试数据库文件
  const filesToClean = [
    testDbPath,
    `${testDbPath}-journal`,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`,
  ];
  for (const file of filesToClean) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
    }
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    AUTH_SECRET: "playwright-smoke-test-secret-long-string-1234567890",
  };

  console.log("\n[Playwright Global Setup] 初始化独立测试数据库:", testDbPath);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: rootDir,
    env,
    stdio: "pipe",
  });

  execFileSync("npm", ["run", "db:seed"], {
    cwd: rootDir,
    env,
    stdio: "pipe",
  });
  console.log("[Playwright Global Setup] 独立测试数据库准备完毕。\n");
}
