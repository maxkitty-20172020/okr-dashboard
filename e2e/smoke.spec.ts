import { test, expect } from "@playwright/test";

test.describe("自动化冒烟测试与权限边界", () => {
  test.beforeEach(async ({ context }) => {
    // 每次测试前清理 Cookie，确保测试之间会话完全隔离
    await context.clearCookies();
  });

  // 1. 三种账号登录与退出
  test("三种账号登录与退出 (老板 okr、成员 okr1、okr2)", async ({ page }) => {
    const accounts = [
      { email: "okr", name: "陈总", roleText: "老板 · 只读" },
      { email: "okr1", name: "李明", roleText: "管理成员 · 可填报" },
      { email: "okr2", name: "王芳", roleText: "管理成员 · 可填报" },
    ];

    for (const acc of accounts) {
      await page.goto("/login");
      await page.fill('input[name="email"]', acc.email);
      await page.fill('input[name="password"]', "okr12345");
      await page.click('button[type="submit"]');

      await expect(page).not.toHaveURL(/\/login/);
      // 验证侧边栏用户名与身份
      const userText = page.locator(".signed-user");
      await expect(userText).toContainText(acc.name);
      await expect(userText).toContainText(acc.roleText);

      // 退出登录
      await page.click('button.logout, button:has-text("退出登录")');
      await expect(page).toHaveURL(/\/login/);
    }
  });

  // 2. 老板执行写操作被拒绝
  test("老板账号只读且写操作被服务端拒绝", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "okr");
    await page.fill('input[name="password"]', "okr12345");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);

    // 1) 尝试直接访问新建任务页面 /tasks/new，系统在服务端通过 requireWriter 拦截重定向
    await page.goto("/tasks/new");
    await expect(page).not.toHaveURL(/\/tasks\/new$/);

    // 2) 检查任务详情页展示「老板账号 · 只读」且不提供进展更新或 Check-in 表单
    await page.goto("/tasks");
    const firstTask = page.locator('a[href^="/tasks/"]').first();
    await firstTask.click();
    await expect(page.locator(".readonly-label")).toContainText("老板账号 · 只读");
    await expect(page.locator("#update")).toHaveCount(0);
    await expect(page.locator("#checkin form")).toHaveCount(0);

    // 3) 检查目标看板 /okrs 为只读，无新增 Objective 表单
    await page.goto("/okrs");
    await expect(page.locator('form:has-text("新增 Objective")')).toHaveCount(0);
    await expect(page.locator(".readonly-label")).toContainText("老板账号 · 只读");
  });

  // 3. 成员创建任务并更新进展
  test("成员创建任务并更新进展", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "okr1");
    await page.fill('input[name="password"]', "okr12345");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);

    // 创建新任务
    await page.goto("/tasks/new");
    const taskTitle = `冒烟测试任务-${Date.now()}`;
    await page.fill('input[name="title"]', taskTitle);
    await page.fill('textarea[name="completionCriteria"]', "通过冒烟测试并更新进展");
    await page.fill('input[name="nextAction"]', "执行第二轮回归测试");
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await page.fill('input[name="dueAt"]', futureDate.toISOString().slice(0, 10));

    await Promise.all([
      page.waitForURL(url => url.pathname.startsWith("/tasks/") && url.pathname !== "/tasks/new"),
      page.click('button[type="submit"]:has-text("创建任务")'),
    ]);

    // 验证跳转到任务详情
    await expect(page.locator("h1")).toContainText(taskTitle);

    // 主负责人更新进展
    const updateSec = page.locator("#update");
    await updateSec.locator('select[name="updateKind"]').selectOption("PROGRESS");
    await updateSec.locator('select[name="status"]').selectOption("IN_PROGRESS");
    await updateSec.locator('textarea[name="summary"]').fill("自动化测试脚本已创建并执行首次验证。");
    await updateSec.locator('input[name="nextAction"]').fill("持续监控构建流水线");
    await updateSec.locator('button[type="submit"]').click();

    // 验证进展更新记录在「跟进与汇报」历史中展示
    await expect(page.locator(".history-section")).toContainText("自动化测试脚本已创建并执行首次验证。");
  });

  // 4. 提交 Check-in 后「未汇报」数量减少
  test("提交 Check-in 后「未汇报」数量减少", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "okr1");
    await page.fill('input[name="password"]', "okr12345");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/overview?kind=WEEK");

    // 获取当前待我汇报的项
    const unreportedCards = page.locator(".unreported-list article");
    const countBefore = await unreportedCards.count();

    if (countBefore > 0) {
      // 提交第一条未汇报任务的 Check-in
      const targetCard = unreportedCards.first();
      await targetCard.locator('textarea[name="body"]').fill("本周期冒烟测试完成，数据指标正常。");
      await targetCard.locator('button[type="submit"]').click();

      // 等待提交完成与页面刷新
      await page.waitForTimeout(1000);

      // 验证未汇报项数量减少或已不再包含刚提交的表单
      const countAfter = await page.locator(".unreported-list article").count();
      expect(countAfter).toBeLessThan(countBefore);
    }
  });

  // 5. 从任务详情返回总览时保留周期筛选参数
  test("从任务详情返回总览时保留周期与筛选参数", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "okr1");
    await page.fill('input[name="password"]', "okr12345");
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);

    // 1) 在周期总览页带上周期与异常筛选参数
    await page.goto("/overview?kind=WEEK&exception=unreported");

    // 2) 点击任务卡片中的任务标题进入详情（排除 /tasks/new 和导航链接）
    const taskLink = page.locator('article a[href^="/tasks/"]').first();
    const href = await taskLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("kind=WEEK");
    expect(href).toContain("exception=unreported");

    await Promise.all([
      page.waitForURL(/\/tasks\/[a-z0-9_-]+/),
      taskLink.click(),
    ]);

    // 3) 检查任务详情页面的返回链接携带了筛选参数
    const backLink = page.locator("a.back-link");
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", /kind=WEEK/);
    await expect(backLink).toHaveAttribute("href", /exception=unreported/);

    // 4) 点击返回链接，验证返回页面保留了周期与筛选参数
    await Promise.all([
      page.waitForURL(url => url.searchParams.get("kind") === "WEEK" && url.searchParams.get("exception") === "unreported"),
      backLink.click(),
    ]);
  });

  // 6. 已知失败场景 (a) - 标注 test.fixme
  test.fixme(
    "新建不填完成期限的任务，应出现在本周总览的待我汇报中 (引用: UX-01)",
    async ({ page }) => {
      // 注释引用: [UX-01] 新建无期限任务因 schedulePeriodId 和 dueAt 均为空，未被 tasksInPeriod 纳入当前周
      await page.goto("/login");
      await page.fill('input[name="email"]', "okr1");
      await page.fill('input[name="password"]', "okr12345");
      await page.click('button[type="submit"]');

      await page.goto("/tasks/new");
      const title = `UX-01-验证任务-${Date.now()}`;
      await page.fill('input[name="title"]', title);
      await page.fill('textarea[name="completionCriteria"]', "验证未填期限是否出现在待我汇报");
      await page.fill('input[name="nextAction"]', "检查周总览");
      await page.fill('input[name="dueAt"]', ""); // 留空完成期限

      await Promise.all([
        page.waitForURL(url => url.pathname.startsWith("/tasks/") && url.pathname !== "/tasks/new"),
        page.click('button[type="submit"]:has-text("创建任务")'),
      ]);

      // 进入本周总览
      await page.goto("/overview?kind=WEEK");
      // 预期：作为本周创建且正在进行的事项，应出现在待我汇报或本周期任务列表中
      // 实际：由于 tasksInPeriod 遗漏无期限任务，该断言会失败
      await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 3000 });
    }
  );

  // 7. 已知失败场景 (b) - 标注 test.fixme
  test.fixme(
    "移交任务给他人后，原负责人不应再拥有该任务的 Check-in 提交权限 (引用: UX-02)",
    async ({ page }) => {
      // 注释引用: [UX-02] 移交负责人仅修改 ownerId，未同步清理 RaciAssignment 中原负责人的 R/A，导致原负责人仍能提交周汇报
      await page.goto("/login");
      await page.fill('input[name="email"]', "okr1");
      await page.fill('input[name="password"]', "okr12345");
      await page.click('button[type="submit"]');

      // 找到李明（okr1）作为主责且已回填 RACI 的演示任务
      await page.goto("/tasks");
      await page.click('a:has-text("验证核心产品主图方案")');

      // 移交给王芳
      await page.click("#details");
      await page.selectOption('#details select[name="ownerId"]', { label: "王芳" });
      await page.click('#details button:has-text("保存任务资料")');
      await page.waitForTimeout(1000);

      // 预期：原主责李明已不再是主责，不应再看到或能够提交 #checkin 汇报表单
      // 实际：由于 hasRaciRA 仍匹配到李明的历史 R/A 记录，表单依然存在，该断言会失败
      await expect(page.locator("#checkin form")).toHaveCount(0);
    }
  );
});
