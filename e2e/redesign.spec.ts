import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, account = "okr1") {
  await page.goto("/login");
  await page.locator('[name="email"]').fill(account);
  await page.locator('[name="password"]').fill("okr12345");
  await page.getByRole("button", { name: "进入面板" }).click();
  await expect(page).toHaveURL("/");
}
async function create(page: Page) {
  await page.goto("/tasks/new");
  const title = `页面重做-${Date.now()}`;
  await page.getByRole("textbox", { name: /1. 这件事是什么/ }).fill(title);
  await page.getByRole("textbox", { name: /2. 做到什么算完成/ }).fill("拿到供应商排期与补货数量");
  await expect(page.getByRole("radio", { name: "我（李明）", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "记下来", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+\?created=1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  return page.url();
}
for (const account of ["okr1", "okr"]) {
  test(`工作台${account === "okr" ? "老板" : "成员"}结论、三栏、本周进展`, async ({ page }) => {
    await login(page, account);
    await expect(page.locator(".headline h1")).toContainText(account === "okr" ? "件事在推进" : "今天");
    const titles = account === "okr" ? ["需要你出面", "今天该有回音", "还没定期限"] : ["今天要跟进", "等我交付", "我负责 · 还没定期限"];
    for (const name of titles) await expect(page.getByRole("heading", { level: 2, name: new RegExp(name) })).toBeVisible();
    await expect(page.getByRole("region", { name: "本周进展", exact: true })).toContainText(/已写 \d+ \/ \d+/);
    if (account === "okr") {
      await expect(page.locator('main form')).toHaveCount(0);
      await expect(page.locator('a[href="/tasks/new"]')).toHaveCount(0);
    }
  });
}
test("新建事项只答三题，详情卡住了必填原因并保存", async ({ page }) => {
  await login(page);
  await create(page);
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
});
for (const account of ["okr1", "okr"]) {
  test(`390px ${account}底部导航和页面无横向滚动`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, account);
    const nav = page.getByRole("navigation", { name: "手机导航" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link")).toHaveCount(account === "okr" ? 4 : 5);
    for (const tab of ["今天跟进", "等我交付", "没定期限"]) {
      if (account === "okr" && tab !== "没定期限") continue;
      await page.getByRole("radio", { name: new RegExp(tab) }).check();
      await expect(page.locator(".lane:visible")).toHaveCount(1);
    }
    const paths = account === "okr" ? ["/", "/tasks", "/overview", "/okrs", "/members", "/account", "/guide"] : ["/", "/tasks/new", "/tasks", "/overview", "/okrs", "/account", "/guide"];
    if (account !== "okr") {
      const detail = await create(page);
      paths.push(new URL(detail).pathname);
    }
    for (const path of paths) {
      await page.goto(path);
      await expect(nav).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    }
    await nav.getByRole("link", { name: "我的", exact: true }).click();
    await expect(page).toHaveURL("/account");
    await expect(page.getByRole("form", { name: "修改密码", exact: true })).toBeVisible();
  });
}
test("原生 radio：三题可提交且进展可选卡住了", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await login(page);
    await create(page);
    const update = page.locator("#update");
    await update.getByRole("radio", { name: "卡住了", exact: true }).check();
    await expect(update.locator('[name="riskNote"]')).toBeVisible();
    await update.locator('[name="summary"]').fill("原生控件提交");
    await update.getByRole("button", { name: "保存进展" }).click();
    await expect(update.locator('[name="riskNote"]:invalid')).toHaveCount(1);
    await expect(page.locator(".summary-grid")).not.toContainText("原生控件提交");
    await page.locator("#update").getByRole("radio", { name: "卡住了", exact: true }).check();
    await page.locator('#update [name="summary"]').fill("原生控件提交");
    await page.locator('#update [name="riskNote"]').fill("需要采购支持");
    await page.locator("#update").getByRole("button", { name: "保存进展" }).click();
    await expect(page.locator(".summary-grid")).toContainText("需要采购支持");
  } finally { await context.close(); }
});
