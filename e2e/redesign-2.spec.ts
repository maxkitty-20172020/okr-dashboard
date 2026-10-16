import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, account = "okr1") {
  await page.goto("/login");
  await page.locator('[name="email"]').fill(account);
  await page.locator('[name="password"]').fill("okr12345");
  await page.getByRole("button", { name: "进入看板" }).click();
  await expect(page).toHaveURL("/");
}
async function create(page: Page) {
  await page.goto("/tasks/new");
  const title = `第二批待写-${Date.now()}`;
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="completionCriteria"]').fill("核实本周待写列表和暂无变化操作");
  await page.getByRole("button", { name: "记下来", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+\?created=1$/);
  return { title, id: new URL(page.url()).pathname.split("/").pop()! };
}
test("全部事项筛选胶囊、数量、查询参数与清除筛选", async ({ page }) => {
  await login(page);
  const { title, id } = await create(page);
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("全部事项");
  await page.locator('[name="q"]').fill(title);
  await expect(page.locator('[name="person"]')).toHaveCount(0);
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const area = page.getByRole("group", { name: "领域", exact: true });
  await area.getByRole("link", { name: "其他事项" }).click();
  await expect(area.getByRole("link", { name: "其他事项 1", exact: true })).toHaveAttribute("aria-current", "true");
  await page.getByRole("group", { name: "与我相关", exact: true }).getByRole("link", { name: "我主责的" }).click();
  await expect(page).toHaveURL(/relation=owned/);
  expect(new URL(page.url()).searchParams.get("q")).toBe(title);
  await expect(page.locator(`.ui-task-card a[href^="/tasks/${id}?"]`)).toHaveCount(1);
  await page.getByRole("group", { name: "查看范围", exact: true }).getByRole("link", { name: "已结束", exact: true }).click();
  await expect(page.locator(".ui-task-card")).toHaveCount(0);
  await page.getByRole("link", { name: "清除筛选", exact: true }).click();
  await expect(page).toHaveURL("/tasks");
  await expect(page.locator('[name="q"]')).toHaveValue("");
  await expect(page.locator('[name="person"]')).toHaveCount(0);
  await expect(page.getByRole("group", { name: "查看范围" }).getByRole("link", { name: /^未结束/ })).toHaveAttribute("aria-current", "true");
  // Clearing drill-down filters keeps only its kind/period context.
  await page.goto("/tasks?kind=WEEK&exception=unreported&area=OTHER&relation=owned");
  await expect(page.getByRole("status")).toContainText("周期下钻");
  await page.getByRole("link", { name: "清除筛选", exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has("area"));
  const params = new URL(page.url()).searchParams;
  expect([...params.keys()].sort()).toEqual(["kind", "period"]);
  expect(params.get("kind")).toBe("WEEK");
});
test("周视图按成员折叠分组，一键暂无变化后待写数量减少", async ({ page }) => {
  await login(page);
  const { title, id } = await create(page);
  await page.goto("/overview?kind=WEEK");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("每周进展");
  const group = page.locator(".pending-group").filter({ has: page.locator(`a[href^="/tasks/${id}?"]`) });
  await expect(group.locator("summary")).toContainText("李明");
  const card = group.locator(".week-item").filter({ hasText: title });
  await expect(card).toBeVisible();
  await group.locator("summary").click(); await expect(card).toBeHidden();
  await group.locator("summary").click(); await expect(card).toBeVisible();
  const counter = page.locator('.exception-chips a[href*="exception=unreported"] strong');
  const before = Number(await counter.textContent());
  const band = page.getByRole("region", { name: "本周进展", exact: true });
  const bandBefore = await band.locator(".week-numbers").textContent();
  await card.getByRole("button", { name: "暂无变化", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(counter).toHaveText(String(before - 1));
  await expect(band.locator(".week-numbers")).not.toHaveText(bandBefore!);
  await page.goto(`/tasks/${id}`);
  await expect(page.locator(".history-section")).toContainText("确认暂无变化");
});
test("老板在新成员卡片布局中新增成员，操作默认折叠", async ({ page }) => {
  await login(page, "okr");
  await page.goto("/members");
  await expect(page.locator(".member-create")).not.toHaveAttribute("open");
  await page.getByText("＋ 新增成员", { exact: true }).click();
  const form = page.getByRole("form", { name: "新增成员", exact: true });
  const account = `redesign2-${Date.now()}`;
  await form.locator('[name="name"]').fill("第二批测试成员");
  await form.locator('[name="login"]').fill(account);
  await form.locator('[name="password"]').fill("Temporary123");
  await expect(form.getByRole("radio", { name: "填报成员", exact: true })).toBeChecked();
  await form.getByRole("button", { name: "新增成员", exact: true }).click();
  const card = page.getByRole("article", { name: `成员 ${account}`, exact: true });
  await expect(card).toContainText("第二批测试成员");
  await expect(card.locator(".status-badge").filter({ hasText: /^已启用$|^已停用$/ })).toHaveCount(0);
  await expect(card).toContainText("填报成员");
  await expect(card).toContainText("主责未结束 0 项");
  await expect(card.locator(".member-actions")).not.toHaveAttribute("open");
  await card.getByLabel("管理 第二批测试成员", { exact: true }).click();
  await expect(card.getByRole("button", { name: "保存姓名和角色" })).toBeVisible();
  await expect(card.getByRole("button", { name: "停用成员", exact: true })).toBeVisible();
});
for (const account of ["okr1", "okr"]) {
  for (const path of ["/tasks", "/overview", ...(account === "okr" ? ["/members"] : []), "/account"]) {
    test(`390px ${account} ${path} 无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page, account);
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "手机导航", exact: true })).toBeVisible();
      if (path === "/members") {
        await page.getByText("＋ 新增成员", { exact: true }).click();
        await page.locator(".member-actions > summary").first().click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
