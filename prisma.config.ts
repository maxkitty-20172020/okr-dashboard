import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 6 检测到配置文件后不再自动读取 .env，需在此显式加载。
// dotenv 默认保留已有环境变量，测试和部署可用 DATABASE_URL 指向独立数据库。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
