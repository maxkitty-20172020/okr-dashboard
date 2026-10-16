import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string, destination = "/") {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(url => url.pathname === destination),
    page.getByRole("button", { name: "进入看板" }).click(),
  ]);
}
async function changePassword(page: Page, current: string, next: string) {
  const form = page.getByRole("form", { name: "修改密码", exact: true });
  await form.locator('[name="currentPassword"]').fill(current);
  await form.locator('[name="newPassword"]').fill(next);
  await Promise.all([
    page.waitForURL(/\/account\?changed=1/),
    form.getByRole("button", { name: "保存新密码" }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText("密码已修改");
}

test("老板建成员 → 强制改密 → 工作台 → 重置会话失效 → 停用不能登录，成员无管理权限", async ({ page, browser }) => {
  test.setTimeout(90000);
  await login(page, "okr", "okr12345");
  await page.getByRole("link", { name: "成员", exact: true }).click();
  const account = `member-e2e-${Date.now()}`;
  await page.getByText("＋ 新增成员", { exact: true }).click();
  const create = page.getByRole("form", { name: "新增成员", exact: true });
  await create.locator('[name="name"]').fill("测试成员");
  await create.locator('[name="login"]').fill(account);
  await create.locator('[name="password"]').fill("　Ｔｅｍｐ１２３４５　");
  await create.getByRole("button", { name: "新增成员" }).click();
  const row = page.getByRole("article", { name: `成员 ${account}@okr.local`, exact: true });
  await expect(row).toContainText("测试成员");
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const member = await context.newPage();
  try {
    await login(member, `　${account.toUpperCase()}　`, "Temp12345", "/account");
    await expect(member.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("首次登录或密码已被重置，请先设置新密码");
    for (const path of ["/", "/tasks", "/overview", "/okrs", "/guide", "/members"]) {
      await member.goto(path);
      await expect(member).toHaveURL(/\/account$/);
    }
    await changePassword(member, "Temp12345", "MemberNew123");
    await member.getByRole("link", { name: "进入工作台", exact: true }).click();
    await expect(member).toHaveURL("/");
    await expect(member.locator(".signed-user")).toContainText("测试成员");
    await expect(member.getByRole("link", { name: "成员", exact: true })).toHaveCount(0);
    await member.goto("/members");
    await expect(member).toHaveURL(/\/\?error=no-permission/);
    await expect(member.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText("无权限");

    // A second browser keeps an older cookie; own change preserves only the
    // newly issued cookie, and the old cookie must reach /login without looping.
    const oldCookie = await context.cookies();
    await member.goto("/account");
    await changePassword(member, "MemberNew123", "MemberNext123");
    await member.goto("/"); await expect(member).toHaveURL("/");
    const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      await otherContext.addCookies(oldCookie);
      const other = await otherContext.newPage();
      await other.goto("/"); await expect(other).toHaveURL(/\/login$/);
    } finally { await otherContext.close(); }

    await row.getByLabel("管理 测试成员", { exact: true }).click();
    await row.getByText("重置密码", { exact: true }).click();
    const reset = row.getByRole("form", { name: `重置密码 ${account}@okr.local`, exact: true });
    await reset.locator('[name="password"]').fill("ResetTemp123");
    await reset.getByRole("button", { name: "设置临时密码" }).click();
    await expect(reset.getByRole("status")).toHaveText("已保存");
    await member.goto("/tasks"); await expect(member).toHaveURL(/\/login$/);
    await login(member, account, "ResetTemp123", "/account");
    await changePassword(member, "ResetTemp123", "MemberFinal123");

    await row.getByRole("button", { name: "停用成员" }).click();
    await expect(row.getByRole("button", { name: "启用成员" })).toBeVisible();
    await member.goto("/"); await expect(member).toHaveURL(/\/login$/);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await member.locator('[name="email"]').fill(account);
      await member.locator('[name="password"]').fill("MemberFinal123");
      await member.getByRole("button", { name: "进入看板" }).click();
      await expect(member.locator(".ui-notice[role=alert]")).toHaveText(attempt === 5 ? "登录失败次数过多，请 10 分钟后重试" : "账号或密码不正确");
      await expect(member).toHaveURL(/\/login$/);
      await expect(member.getByRole("button", { name: "进入看板" })).toBeEnabled();
    }
  } finally { await context.close(); }
});
