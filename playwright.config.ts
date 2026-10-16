import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3000;
const testDbPath = path.resolve(__dirname, "e2e/test.db");

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.spec.ts"],
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: `DATABASE_URL="file:${testDbPath}" AUTH_SECRET="playwright-smoke-test-secret-long-string-1234567890" npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
