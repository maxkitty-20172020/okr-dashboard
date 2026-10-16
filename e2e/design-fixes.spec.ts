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
  await page.locator('[name="title"]').fill(`设计修复-${Date.now()}`);
  await page.locator('[name="completionCriteria"]').fill("完成设计验收");
  await page.getByRole("button", { name: "记下来", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/?]+\?created=1$/);
  return new URL(page.url()).pathname;
}
async function assertTargets(page: Page) {
  const small = await page.locator('a:visible, button:visible, summary:visible').evaluateAll(elements => elements.flatMap(el => {
    const height = el.getBoundingClientRect().height;
    // Next's development toolbar belongs to the framework, outside the product UI.
    const root = el.getRootNode();
    const inDevTools = el.closest('nextjs-portal') || (root instanceof ShadowRoot && root.host.closest('nextjs-portal'));
    return inDevTools || height >= 44 ? [] : [{ text: el.getAttribute('aria-label') || el.textContent?.trim(), height }];
  }));
  expect(small, `short targets on ${page.url()}`).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("账号菜单是可聚焦按钮，三项带图标，能展开、收起并退出", async ({ page }) => {
  await login(page);
  const menu = page.getByRole("button", { name: "账号菜单", exact: true });
  await expect(menu).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(".user-menu-content");
  await expect(panel.getByRole("link", { name: "修改密码" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "填写指南" })).toBeVisible();
  await expect(panel.locator("svg")).toHaveCount(3);
  await menu.press("Space");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await panel.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("折叠操作入口统一按钮角色，键盘可展开目标表单", async ({ page }) => {
  await login(page);
  await page.goto("/okrs");
  const add = page.getByRole("button", { name: "＋ 新增目标", exact: true });
  await expect(add).toBeVisible();
  await expect(add).toHaveAttribute("aria-expanded", "false");
  await add.press("Enter");
  await expect(add).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "保存目标", exact: true })).toBeVisible();
  for (const summary of await page.locator("summary").all()) await expect(summary).toHaveAttribute("role", "button");
  await expect(page.locator(".objective-card").first().locator(".progress-track")).toHaveCount(1);
  await expect(page.locator('.goal-kr-list').first()).toContainText(/当前 \d+(?:\.\d+)?% \/ 目标 \d+(?:\.\d+)?%/);
});

for (const account of ["okr1", "okr"]) {
  test(`周月季精简及日常周期、短账号显示 ${account}`, async ({ page }) => {
    await login(page, account);
    for (const kind of ["WEEK", "MONTH", "QUARTER"]) {
      await page.goto(`/overview?kind=${kind}`);
      await expect(page.locator(".stats-grid, .task-grid, .goal-grid")).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText("本周期任务");
      await expect(page.locator("main")).not.toContainText("目标与关键结果");
      if (kind === "WEEK") {
        await expect(page.getByRole("region", { name: "本周进展", exact: true })).toHaveCount(1);
        await expect(page.locator(".pending-group")).toHaveCount(await page.locator(".week-band .pending-group").count());
      }
      if (account === "okr") {
        await expect(page.locator("body")).not.toContainText("仅主负责人可一键确认自己的事项");
        await expect(page.getByText("只看不改", { exact: true })).toHaveCount(1);
      }
    }
    for (const path of ["/overview?period=2026-W42", "/overview?kind=QUARTER&period=2026-Q4", "/okrs", "/account", ...(account === "okr" ? ["/members"] : [])]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(/\d{4}-[WQ]\d|@okr\.local/);
    }
  });
}

test("QA-03 风险、卡住与取消在必填框下方提示，阻止提交后显示 Field 错误", async ({ page }) => {
  await login(page);
  await create(page);
  const update = page.locator("#update");
  for (const mood of ["有风险", "卡住了", "不做了（取消）"]) {
    if (mood === "不做了（取消）") await update.getByRole("button", { name: mood, exact: true }).click();
    await update.getByRole("radio", { name: mood, exact: true }).check();
    const input = update.locator(mood === "不做了（取消）" ? '[name="summary"]' : '[name="riskNote"]');
    await input.fill("");
    const field = input.locator("xpath=../..");
    await expect(field.locator(".required-hint")).toContainText("必填：");
    await update.getByRole("button", { name: "保存进展", exact: true }).click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(field.getByRole("alert")).toBeVisible();
  }
});

test("QA-04 顶部成员胶囊关闭只去掉 person", async ({ page }) => {
  await login(page, "okr");
  await page.goto("/tasks");
  const person = await page.locator('[name="person"] option').filter({ hasText: "李明" }).getAttribute("value");
  await page.goto(`/tasks?person=${person}&kind=WEEK&exception=risk&area=BUSINESS&q=备货`);
  await expect(page.locator(".task-filters > .person-filter")).toContainText("正在看：李明");
  await page.getByRole("link", { name: "取消成员筛选" }).click();
  await expect(page).not.toHaveURL(/person=/);
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(params)).toEqual({ kind: "WEEK", exception: "risk", area: "BUSINESS", q: "备货" });
});

for (const account of ["okr1", "okr"]) {
  test(`390px 所有可见链接按钮至少44px ${account}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await assertTargets(page);
    await login(page, account);
    const detail = account === "okr1" ? await create(page) : undefined;
    const paths = ["/", "/tasks", "/overview", "/overview?kind=MONTH", "/overview?kind=QUARTER", "/okrs", "/account", "/guide", ...(detail ? ["/tasks/new", detail] : ["/members"])];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator('.page-heading a[href="/tasks/new"], .dashboard-heading a[href="/tasks/new"]')).toBeHidden();
      if (path === "/overview") {
        const tabs = await page.locator(".period-tabs").boundingBox();
        const arrows = await page.locator(".period-arrows").boundingBox();
        expect(Math.abs(tabs!.y - arrows!.y)).toBeLessThan(1);
      }
      await assertTargets(page);
      // Cover controls inside disclosures as well as the collapsed page.
      for (const disclosure of await page.locator("main summary").all()) {
        if (await disclosure.isVisible() && await disclosure.getAttribute("aria-expanded") === "false") await disclosure.click();
      }
      await assertTargets(page);
      await page.getByRole("button", { name: "账号菜单", exact: true }).click();
      await assertTargets(page);
    }
  });
}

for (const account of ["okr1", "okr"]) {
  test(`协作者与老板详情无重复交付、周期卡和快照 ${account}`, async ({ page }) => {
    await login(page, account);
    await page.goto("/tasks?q=确认旺季备货与出货排期");
    await page.locator(".task-card-link").filter({ hasText: "确认旺季备货与出货排期" }).click();
    const collaboration = page.locator("section").filter({ has: page.getByRole("heading", { name: "协作分工", exact: true }) });
    await expect(collaboration.locator(".collaborator-item")).toHaveCount(2);
    await expect(collaboration.getByRole("heading", { name: "其他交付", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "其他交付与分组", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^(周更新|周期汇报)$/ })).toHaveCount(0);
    await expect(page.locator("#checkin")).toHaveCount(0);
    await expect(page.locator(".summary-grid")).toContainText("本周进展状态");
    await expect(page.locator(".history-section .section-help")).toHaveText("这件事的所有变化都记在这里。");
    await expect(page.locator(".history-section .history-snapshot")).toHaveCount(0);
    if (account === "okr") await expect(page.getByText("只看不改", { exact: true })).toHaveCount(1);
  });
}
