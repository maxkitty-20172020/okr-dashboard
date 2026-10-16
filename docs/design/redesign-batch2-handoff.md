# 页面重做第二批交付记录

范围：规范 §4.4–§4.7、账号页 §2，以及第二批所需的 §3 / §5。工作目录 `/Users/mac/orca/workspaces/okr-dashboard/codex`，分支 `feat/redesign-2`，起始 HEAD `a4d3747`，起始工作区干净。未切换分支，未执行 git commit / git push；修改留在工作区待总控审查。

已阅读 `AGENTS.md`、唯一设计规范、第一批交接记录、`components/ui/*`，并查看第一批桌面和手机工作台截图。编码前查阅本地 Next 16.4.2 的 `node_modules/next/dist/docs/01-app/02-guides/forms.md` 与 `01-app/03-api-reference/03-file-conventions/page.md`，沿用 Promise params/searchParams 和现有 Server Actions。

## 页面与规范对应

| 页面 | 规范 | 本批结果 |
| --- | --- | --- |
| `/tasks` | §4.4 | 标题“全部事项”；搜索、成员下拉、领域/查看范围/与我相关链接胶囊；深色激活态和当前结果数量；清除筛选；复用 TaskCard 网格。周期下钻提示显示“第 N 周”及异常名称，带返回入口。 |
| `/overview` | §4.5 | 标题“每周进展”；周/月/季胶囊、上一期/下一期；周视图复用全员 WeekBand，按实际主负责人分组显示还没写的任务，各组原生 details 折叠；本人可复用 NoChangeButton 一键确认。异常胶囊下钻到任务清单。月/季保留原内容与原权限，提示“月度看关键结果、季度看目标”。 |
| `/okrs` | §4.6 | 统一目标卡：标题、负责人、季度、业务指标达成度、关键结果、非归档关联事项数；新增/编辑折叠；编辑表单改用 Field / ChoiceChips / Button。 |
| `/okrs/[id]` | §4.6 | 目标达成信息、前置“为这个目标在推进的事项”TaskCard、关键结果、原周期表单与进展历史；无内容的列表/历史区不渲染卡片。 |
| `/members` | §4.7 | 成员账号卡：姓名、账号、角色/状态徽章、主责未结束数；“＋ 新增成员”展开表单；改名/角色、重置密码、启用/停用收进管理折叠区。 |
| `/account` | §2、§4.7 | 标题“我的”；姓名、账号、角色；修改密码；老板成员管理入口、指南、退出。保留强制改密会话和原提交流程。 |
| `/login` | §4.7 | `--bg` 底、居中品牌卡；Field 账号/密码、“进入看板”Button、Notice 错误反馈。 |
| `/guide` | §4.7 | 三段：记一件事、更新进展、本周进展；每段有明确标注“填写示意”的示意卡片，示意不混充真实任务数据。真实案例链接仍来自数据库查询。 |

所有页面复用第一批令牌、字体、导航及 `components/ui`，没有新增另一套基础组件。身份标识统一为“只看不改 / 填报成员”。第一批任务详情里剩余的一句旧身份说明同步替换。

成员分工：周列表仅由真实待写任务主负责人产生分组；老板没有主责任务时不会出现老板空组。`/members` 是账号管理，保留老板账号卡供管理自身姓名/角色/密码；不把账号清单当作任务分工清单。

## 业务边界与新增 lib 计算

- 未修改任何 server action、operation、业务服务、schema、迁移或既有单测断言；未修改依赖或 `playwright.config.ts`。
- 查询参数 `kind / period / exception / person / area / q / relation / filter` 保留。搜索表单保留其他激活项；链接只替换对应维度；清除筛选在普通列表返回 `/tasks`，周期下钻只保留规范化的 kind / period。
- 目标表单沿用原 action 和字段：目标 `id / title / description / cycle / ownerId`；关键结果 `id / objectiveId / title / currentValue / targetValue / baselineValue / direction / unit`；没有修改字段枚举或服务端验证。负责人和方向使用原生 radio，仍作为普通字段提交。
- 成员 `operation=create/update/reset/enable/disable`、`id / name / login / password / role`；账号改密 `currentPassword / newPassword`；登录 `email / password` 均不变。
- 周确认直接复用第一批 NoChangeButton：原 `taskMutationAction`，`operation=progress`、`mood=same`、`taskId / version`、`followPreset=in3days`。没有新增写入路径。
- 周计数直接取原 `loadOverview` 的 expected/missingIds，全员范围不改。原本额外允许提交的复盘/督办确认保留在独立折叠入口中，避免丢失权限对应的操作。
- 未使用或创建 `prisma/dev.db`。验收单测自行使用明确指定的独立临时数据库。e2e 未能启动 webServer，未进入其测试初始化与浏览器阶段。

新增 `lib/redesign-view.ts`：

| 函数 | 用途与测试 |
| --- | --- |
| `weeklyOverview(view, user, now?)` | 全员周计数、按实际 owner 分组、本人/老板/已结束/归档/历史周期按钮权限，以及额外复盘入口去重。使用上海业务周边界。 |
| `taskFilterHref(params, patch)` | 保留全部查询参数，只更新目标维度，正确编码中文和特殊字符。 |
| `periodDrillLabel(label)` | 将 `2026-W42` 展示成“第 42 周”，不改变 URL 值。 |
| `objectiveTaskCount(keyResults)` | 汇总查询得到的非归档事项数，空关键结果为零。达成度仍复用原 `keyResultAchievementRate / progressPercent`。 |

新增 `tests/redesign-2.test.ts` 共 7 项；覆盖分组/计数变化、空组省略、老板实际主责、跨上海周边界、历史/结束/归档保护、额外汇报能力保留、查询参数和特殊字符、周标签、目标关联数。既有 92 项单测断言未变，总计 99 项。

## 删除与保留的旧样式 / 组件

删除组件：

- `components/task-card.tsx`：所有第二批调用已改用 `components/ui/task-card.tsx`。
- `components/filling-guide.tsx`：指南重做后无任何引用，删除旧五段侧栏。

`app/globals.css` 删除旧 CSS：

- 旧 sidebar、sidebar-bottom、旧 brand/nav/user/main 布局及其 850px 断点覆盖。
- 旧 attention-list/item/dot/date、people-grid/person-column、activity-list/item/time。
- 旧 task-card、task-kicker/title/progress/next/dates、compact、contribution 等专属规则。
- 旧 filters/search-field 的下拉筛选样式，改为现有 Field 和链接胶囊布局。
- 旧 guide-list / guide-index / guide-actions 专属规则。
- 旧按钮、字段、状态、周期切换、异常胶囊、进度条的硬编码配色；共享布局仅保留仍被页面引用的部分，统一改用现有令牌。移除旧棕金渐变进度条。
- `--paper / --card / --forest / --danger / --gold / --gold-strong` 和对应 @theme 兼容别名。根布局背景改用 bg-bg。

保留 `.badge / .readonly-label` 等已有详情页仍引用的类，以及协作、节点、历史、表单、布局的必要规则；它们已使用统一令牌，不再保留旧主题。CSS 清理后对第一批样式的影响仍需总控浏览器回归，不能用静态检查替代。

## 既有 e2e 调整逐条

只改定位、文案与展开折叠区的操作；未删除断言，未改变断言意图、账号生命周期、权限与数据验证。

1. `members.spec.ts` 登录 helper 按钮“进入面板”改为“进入看板”。
2. `members.spec.ts` 新增成员前先展开“＋ 新增成员”，原表单名和创建断言不变。
3. `members.spec.ts` 重置密码前，原 `row.locator("summary")` 改为先定位“管理 测试成员”，再展开“重置密码”。仍断言重置导致旧会话失效。
4. `members.spec.ts` 登录失败信息由 `.text-danger` 改为 `.ui-notice[role=alert]`；仍逐次断言原错误文字、第五次限流、停用不能登录和按钮可用。
5. `members.spec.ts` 失败循环里的按钮点击和 enabled 定位统一使用“进入看板”。
6. `redesign.spec.ts` 登录 helper 按钮文案改为“进入看板”。
7. `simple-forms.spec.ts` 登录 helper 按钮文案改为“进入看板”。
8. `smoke.spec.ts` 目标只读文案断言“老板账号 · 只读”改为“只看不改”。
9. `smoke.spec.ts` 老板不出现新增目标表单的定位由 `form:has-text("新增 Objective")` 改为 `form:has-text("保存目标")`，仍断言表单数量为 0。
10. `smoke.spec.ts` 原周列表中的“待我汇报”卡片计数定位，前后两处改为 `.pending-group .ui-task-card:has(button)`，只统计本人可一键提交的待写卡片，仍断言提交后数量减少。

新增 `e2e/redesign-2.spec.ts` 10 项：筛选胶囊/数量/清除/周期上下文；按成员折叠分组和暂无变化后计数减少；老板新增成员和管理折叠区；390px 成员 `/tasks /overview /account` 及老板 `/tasks /overview /members /account` 共 7 项横向滚动检查（成员管理页还展开新增与账号操作后检查）。全套发现 27 tests / 5 files。

## 验收结果与命令最后几行

完整输出见 `docs/design/validation/redesign-batch2-*.txt`；命令与退出码汇总见 `validation/redesign-batch2-results.txt`。

| 环境 / 命令 | 结果 |
| --- | --- |
| Node 25.8.1 `npm test` | 退出 0，99 passed / 0 failed |
| Node 25.8.1 `npm run lint` | 退出 0，无 lint 问题 |
| Node 25.8.1 `npm run build` | 退出 0 |
| Node 20.20.2 `npm test` | 退出 0，99 passed / 0 failed |
| Node 20.20.2 `npm run build` | 退出 0 |
| `npx tsc --noEmit` | 退出 0，无输出 |
| `git diff --check` | 退出 0，无输出 |
| `npm run test:e2e -- --list` | 退出 0，27 tests / 5 files |
| `npm run test:e2e` | 退出 1，webServer 的 FSEvent stream 启动失败，未执行浏览器用例 |

Node 20 使用已缓存的独立可执行文件，通过 PATH 前置运行，没有安装或修改依赖：

```sh
PATH=/Users/mac/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin:$PATH npm test
PATH=/Users/mac/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin:$PATH npm run build
```

```text
Node 25 npm test:
ℹ tests 99
ℹ pass 99
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0

Node 20 npm test:
# tests 99
# pass 99
# fail 0
# cancelled 0
# skipped 0
# todo 0

npm run lint:
> okr-dashboard@0.1.0 lint
> eslint

npm run build (both):
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

npm run test:e2e -- --list:
Total: 27 tests in 5 files

npm run test:e2e:
Error [TurbopackInternalError]: unable to start FSEvent stream
Error: Process from config.webServer was not able to start. Exit code: 1
```

## 与规范的差异及未完成验收

- 现有 progress same 操作只写当前周，不接受历史 periodId。为避免在查看历史时误记当前周，历史/未来周显示原计数和分组，但隐藏一键“暂无变化”。已结束和归档事项同样只展示。当前周本人一键操作完整复用第一批实现。
- 为保持原有业务能力，周视图额外保留可授权提交的复盘/督办确认折叠入口；月/季原内容保留。没有内容时不生成该折叠卡。
- 激活胶囊中的数量表示当前全部筛选组合的结果数；未激活选项不预先估算数量。
- 规范截图尚未补充。按任务安排由总控完成所有第二批页面的 1440px / 390px 截图，并回归第一批页面，尤其是共享 CSS 清理后的表现。
- e2e 被本机 Turbopack FSEvent 启动问题阻止，因此未验证真实浏览器中的筛选、提交、成员生命周期、折叠交互、390px 无横向滚动、焦点和点击区域；不能记为通过。未修改 `playwright.config.ts` 或通过替换断言掩盖失败。
- 除上述浏览器验收外，没有已知未完成代码项或需要人工补充的业务定义。

## 建议提交拆分

1. `feat(tasks): redesign task filters and weekly progress`：`/tasks`、`/overview`、PeriodSwitcher、lib/redesign-view、对应新单测。查询参数、全员计数、分组与一键确认放在同组便于审查。
2. `feat(okrs): redesign goal cards and editing forms`：两个目标页面、OkrBoard、CheckInForm，字段与 action 对照审查。
3. `feat(account): redesign member and account pages`：成员、账号、登录、指南、LoginForm、第一批详情身份文案同步。
4. `refactor(ui): remove obsolete redesign compatibility styles`：globals.css、根布局背景、删除旧 TaskCard / FillingGuide；这组依赖前三组完成迁移。
5. `test(e2e): cover redesign batch two and record validation`：新增 e2e、四个既有 e2e 的定位/文案适配、本交接及验收日志。

如果按上述顺序拆分，共享 CSS 可先暂存布局新增，再在第 4 组暂存旧样式删除；最终整体工作区为本次验收对象。

## 新增文件

- `lib/redesign-view.ts`
- `tests/redesign-2.test.ts`
- `e2e/redesign-2.spec.ts`
- `docs/design/redesign-batch2-handoff.md`
- `docs/design/validation/redesign-batch2-results.txt`
- `docs/design/validation/redesign-batch2-node25-test.txt`
- `docs/design/validation/redesign-batch2-node25-build.txt`
- `docs/design/validation/redesign-batch2-node20-test.txt`
- `docs/design/validation/redesign-batch2-node20-build.txt`
- `docs/design/validation/redesign-batch2-lint.txt`
- `docs/design/validation/redesign-batch2-typecheck.txt`
- `docs/design/validation/redesign-batch2-e2e-list.txt`
- `docs/design/validation/redesign-batch2-e2e.txt`

## 修改文件

- `app/(main)/tasks/page.tsx`
- `app/(main)/overview/page.tsx`
- `app/(main)/okrs/page.tsx`
- `app/(main)/okrs/[id]/page.tsx`
- `app/(main)/members/page.tsx`
- `app/(main)/guide/page.tsx`
- `app/(main)/tasks/[id]/page.tsx`（只同步身份说明）
- `app/account/page.tsx`
- `app/login/page.tsx`
- `app/layout.tsx`（移除旧背景令牌别名）
- `app/globals.css`
- `components/okr-board.tsx`
- `components/check-in-form.tsx`
- `components/period-switcher.tsx`
- `components/login-form.tsx`
- `e2e/members.spec.ts`
- `e2e/redesign.spec.ts`
- `e2e/simple-forms.spec.ts`
- `e2e/smoke.spec.ts`

## 删除文件

- `components/task-card.tsx`
- `components/filling-guide.tsx`
