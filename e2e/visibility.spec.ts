import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";

// Explicitly use the same isolated database as global-setup; never the application URL.
const db = new PrismaClient({ datasourceUrl: `file:${resolve(__dirname, "test.db")}` });
const hiddenId = "e2e-visibility-private";
const transferId = "e2e-visibility-transfer";
async function login(page: Page, account: string) {
  await page.goto("/login");
  await page.locator('[name="email"]').fill(account);
  await page.locator('[name="password"]').fill("okr12345");
  await Promise.all([page.waitForURL("/"), page.getByRole("button", { name: "进入看板", exact: true }).click()]);
}
test.beforeAll(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: "okr1@okr.local" } });
  const creator = await db.user.findUniqueOrThrow({ where: { email: "okr3@okr.local" } });
  for (const [id, title] of [[hiddenId, "可见权限测试：李明独有"], [transferId, "可见权限测试：老板移交"]]) {
    await db.task.create({ data: { id, title, ownerId: owner.id, completionCriteria: "交付权限验收结果", nextAction: "等待接手", updates: { create: { kind: "CREATED", authorId: creator.id, body: "由赵强创建交给李明", snapshot: "{}" } } } });
  }
});
test.afterAll(async () => { await db.$disconnect(); });

test("okr2 直达不可见事项显示不存在，全部事项和搜索不泄露标题", async ({ page }) => {
  await login(page, "okr2");
  await page.goto(`/tasks/${hiddenId}`);
  await expect(page.locator("h1")).toHaveText("没有找到这条事项");
  await expect(page.locator("main")).not.toContainText("可见权限测试：李明独有");
  await page.goto("/tasks");
  await expect(page.locator(`a[href^="/tasks/${hiddenId}"]`)).toHaveCount(0);
  await expect(page.locator('[name="person"]')).toHaveCount(0);
  await page.locator('[name="q"]').fill("可见权限测试：李明独有");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await expect(page.locator(".ui-task-card")).toHaveCount(0);
});

test("老板移交后新负责人可见可更新，非创建者原负责人失去可见权", async ({ page, browser, baseURL }) => {
  await login(page, "okr");
  await page.goto(`/tasks/${transferId}`);
  const transfer = page.getByRole("form", { name: "移交负责人", exact: true });
  await transfer.getByRole("radio", { name: "王芳", exact: true }).check();
  await expect(transfer).toContainText("确定移交给【王芳】吗？移交后由对方负责更新进展。");
  await transfer.getByRole("button", { name: "确认移交", exact: true }).click();
  await expect(page.locator(".detail-heading")).toContainText("王芳");
  await expect(page.locator(".history-section")).toContainText("陈总 将负责人由 李明 移交给 王芳");
  for (const account of ["okr2", "okr1"]) {
    const context = await browser.newContext({ baseURL });
    try {
      const member = await context.newPage();
      await login(member, account);
      await member.goto(`/tasks/${transferId}`);
      if (account === "okr2") {
        await expect(member.locator("h1")).toHaveText("可见权限测试：老板移交");
        await member.locator("#update").getByRole("radio", { name: "顺利推进", exact: true }).check();
        await member.locator('#update [name="summary"]').fill("王芳已接手并推进");
        await member.locator('#update [name="nextAction"]').fill("提交验收结果");
        await member.locator("#update").getByRole("button", { name: "保存进展", exact: true }).click();
        await expect(member.locator(".summary-grid")).toContainText("王芳已接手并推进");
      } else {
        await expect(member.locator("h1")).toHaveText("没有找到这条事项");
        await member.goto("/tasks");
        await expect(member.locator(`a[href^="/tasks/${transferId}"]`)).toHaveCount(0);
      }
    } finally { await context.close(); }
  }
});
