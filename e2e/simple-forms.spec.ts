import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('[name="email"]').fill("okr1");
  await page.locator('[name="password"]').fill("okr12345");
  await page.getByRole("button", { name: "进入看板" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".signed-user")).toContainText("李明");
}
async function create(page: Page) {
  await page.goto("/tasks/new");
  const title = `简易填写-${Date.now()}`;
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="completionCriteria"]').fill("拿到供应商排期与补货数量");
  await expect(page.locator('label:has(input[name="ownerId"]:checked)')).toContainText("李明");
  await page.getByRole("button", { name: "记下来", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+\?created=1$/);
  await expect(page.locator("h1")).toHaveText(title);
  return { title, id: new URL(page.url()).pathname.split("/").pop()! };
}
function pendingCount(page: Page) {
  return page.locator('.stats-grid a[href*="exception=unreported"] strong');
}

test.beforeEach(async ({ page }) => { await login(page); });

test("只填三个问题即可创建事项，选填默认折叠且当前用户负责", async ({ page }) => {
  await create(page);
  await expect(page.locator(".summary-grid")).toContainText("明确推进计划");
  await expect(page.locator("#update")).toContainText("本周更新进展即视为已汇报");
  await expect(page.locator("#checkin form")).toHaveCount(0);
  await page.goto("/tasks/new");
  await expect(page.locator('details:has(> summary:text-is("更多设置（选填）"))')).not.toHaveAttribute("open");
  await expect(page.locator('[name="kind"]')).toHaveCount(0);
});

test("卡住了不写原因无法保存，补写后保存且周期待写数量减少", async ({ page }) => {
  const { id } = await create(page);
  await page.goto("/overview?kind=WEEK");
  const countBefore = Number(await pendingCount(page).textContent());
  await page.goto(`/tasks/${id}`);
  const update = page.locator("#update");
  await update.getByRole("radio", { name: "卡住了", exact: true }).check();
  await update.locator('[name="summary"]').fill("供应商尚未确认排期");
  await update.getByRole("button", { name: "保存进展" }).click();
  expect(await update.locator('[name="riskNote"]').evaluate(el => (el as HTMLTextAreaElement).validity.valueMissing)).toBe(true);
  await expect(page.locator(".summary-grid")).toContainText("尚未记录进展");
  await update.locator('[name="riskNote"]').fill("需要采购联系备选供应商");
  await update.getByRole("button", { name: "保存进展" }).click();
  await expect(update.getByRole("status")).toContainText("已保存");
  await expect(page.locator(".summary-grid")).toContainText("需要采购联系备选供应商");
  await page.goto("/overview?kind=WEEK");
  await expect(pendingCount(page)).toHaveText(String(countBefore - 1));
  await expect(page.locator(`.unreported-list article:has(a[href^="/tasks/${id}"])`)).toHaveCount(0);
});

test("周期总览一键暂无变化记录本周进展并移除待写项", async ({ page }) => {
  const { id } = await create(page);
  await page.goto("/overview?kind=WEEK");
  const countBefore = Number(await pendingCount(page).textContent());
  const card = page.locator(`.unreported-list article:has(a[href^="/tasks/${id}"])`);
  await expect(card.getByRole("link", { name: "更新进展", exact: true })).toHaveAttribute("href", new RegExp(`/tasks/${id}.*#update$`));
  await card.getByRole("button", { name: "暂无变化", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(pendingCount(page)).toHaveText(String(countBefore - 1));
  await page.goto(`/tasks/${id}`);
  await expect(page.locator(".summary-grid")).toContainText("尚未记录进展");
  await expect(page.locator(".history-section")).toContainText("确认暂无变化");
});
