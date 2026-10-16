# 设计缺陷集中修复交付（第 9 项）

日期：2026-10-16。工作目录：`/Users/mac/orca/workspaces/okr-dashboard/codex`。分支：`feat/design-fixes`，基线 `cf047e4`。初始 `pwd`、`git status -sb` 确认为此目录、此分支、干净工作区。未切分支，未 commit / push。

已阅读 `AGENTS.md`、`docs/design/redesign-spec.md`（包括第 7 节可见范围与移交）、全部 `components/ui/*`，以及本机 Next 16.4.2 的 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`、`01-app/02-guides/forms.md`。已对照审计目录中的手机进展页、电脑协作者详情截图；未把旧版审计截图作为本次修复的验收证据。

## 12 项改动及文件

| 项 | 实现 | 主要文件 |
| --- | --- | --- |
| 1 | 账号入口改为有边框的胶囊按钮：姓名末字圆头像、姓名、角色小字、旋转箭头；hover、focus-visible、`aria-label="账号菜单"`。菜单三项均有 SVG 图标，退出前分隔线、退出风险色。所有原生操作折叠入口统一复用 Disclosure，保留原生 Enter / Space 和可访问按钮角色、aria-expanded / aria-controls。 | `components/ui/disclosure.tsx`、`components/ui/icon.tsx`、`components/app-shell.tsx`、`components/okr-board.tsx`、`components/task-fields.tsx`、`components/progress-form.tsx`、成员及事项详情页、`app/globals.css` |
| 2 | 只保留「协作分工」主区块；有效 Deliverable 若不能按负责人 + 交付标题对应协作记录，才列入下方「其他交付」，为空不显示。非主负责人不再渲染周更新 / 周期汇报卡，本周状态仅在当前情况显示徽章。动态删除快照字段，内容保留，说明改为「这件事的所有变化都记在这里。」 | `app/(main)/tasks/[id]/page.tsx`、`lib/display.ts`、`components/ui/timeline.tsx` |
| 3 | 每周进展只保留周期切换、深色条、异常胶囊和底部两个链接；深色条内按成员分组，可折叠，事项只出现一次。成员分组沿用本人分组规则，其他可见待写事项仍在深色条中列出，不改变总量 / 可见范围 / 确认权限。移除四统计卡、重复成员列表、事项网格、目标区块。月 / 季只列该周期未复盘的关键结果 / 未评估的目标及现有授权提交入口。保留原有额外复盘与确认的折叠入口。老板不显示成员一键确认提示。 | `app/(main)/overview/page.tsx`、`components/ui/week-band.tsx` |
| 4 | 周 / 月 / 季统一中文日常写法，跨年周标 ISO 年；日期统一中文年月日或月/日。周期切换、下钻提示、目标卡、目标详情 / 汇报历史共用 lib 格式化；日期控件值和 URL 参数保持机器格式。目标周期编辑改为年份和季度可读控件，仍提交原 `cycle` 字段与原值格式。 | `lib/display.ts`、`lib/tasks.ts`、`components/ui/task-card.tsx`、`components/period-switcher.tsx`、`components/quarter-field.tsx`、目标相关页、`tests/design-fixes.test.ts` |
| 5 | 页面标签、表单标签、失败提示、历史类型映射、新生成系统动态中的「任务」统一为「事项」。已有 TaskUpdate.body、用户内容和历史数据不做替换或回写。 | `app/layout.tsx`、事项新建 / 详情 / 不存在页、目标详情、`components/transfer-confirmation.tsx`、`lib/tasks.ts`、`lib/actions.ts`、`lib/check-in.ts`、`lib/task-service.ts`、`lib/member-service.ts`、`lib/okr-service.ts`、`lib/overview-service.ts` |
| 6 | `displayAccount()` 仅隐藏内部域名后缀；账号页、成员卡及相关表单可访问名称显示短账号，外部邮箱保持原样。登录帮助 / 占位和新增成员帮助按要求调整；密码重复帮助删除。 | `lib/display.ts`、`components/login-form.tsx`、`components/ui/field.tsx`、`app/account/page.tsx`、`app/(main)/members/page.tsx` |
| 7 | 产品链接统一至少 44px，文字链接 inline-flex 垂直居中；按钮、小按钮、深色条确认按钮、选项胶囊至少 44px。涵盖动态事项链接、周期箭头 / 回当前、取消、查看事项 / 目标入口；聚焦描边统一。 | `app/globals.css`、`e2e/design-fixes.spec.ts` |
| 8 | 成员启用时不显示状态徽章；停用时只显示「已停用」。角色、主责数量、启停操作继续保留。 | `app/(main)/members/page.tsx` |
| 9 | 单关键结果目标隐藏目标级进度条，只展示关键结果进度条。新增目标按钮放页面标题右侧，展开后才显示表单。当前 / 目标 / 起点值均单位紧贴。 | `components/okr-board.tsx`、`components/quarter-field.tsx`、`app/(main)/okrs/[id]/page.tsx`、`lib/display.ts`、`app/globals.css` |
| 10 | <720px 顶栏不再渲染当前页名，保留品牌和账号按钮；各页面标题区新建按钮隐藏，底部＋保留。周期切换首行左周/月/季、右44px箭头；周期名称独立居中一行，回当前周期为单独文字入口。 | `components/app-shell.tsx`、`components/period-switcher.tsx`、`app/globals.css` |
| 11 | 所有成员结论共用的人名模板移除名字后的空格，覆盖有跟进、有交付、多个交付等分支。 | `lib/dashboard-view.ts`、`tests/design-fixes.test.ts` |
| 12 | QA-03：选有风险 / 卡住了 / 不做了时，在对应必填输入框下直接提示；原生校验拦截后设置 Field.error、风险色边框 / 文字、aria-invalid 和 alert，编辑或切换选项清除过期错误。QA-04：person 筛选区顶部显示「正在看：姓名 ✕」，关闭仅移除 person，保留其他参数；成员提交搜索也保留已有 person。 | `components/progress-form.tsx`、`components/ui/field.tsx`、`app/(main)/tasks/page.tsx`、`e2e/design-fixes.spec.ts` |

「只看不改」只由顶栏账号按钮呈现一次；账号资料、成员角色使用「老板」，页面内重复提示移除。老板移交卡继续保留。

## 新增组件与纯函数

- `Disclosure`：原生 details / summary，secondary / text 按钮外观、开合图标、键盘操作、ARIA 状态，接收服务端渲染 children；不导入数据库或改变表单提交。
- `Icon`：密码、指南、退出三个无外部资源 SVG 图标。
- `QuarterField`：人类可读的年份 / 季度输入，提交原有隐藏字段 `cycle`。
- `lib/display.ts`：`formatPeriod`、`formatWeek`、`formatDate`、`formatShortDate`、`displayAccount`、`formatMetric`、`independentDeliverables`。新增 `tests/design-fixes.test.ts` 共 5 项测试，覆盖跨年、空日期、单位、外部邮箱、镜像去重及结论分支。
- `Field` 新增 `hintBelow`，`help` 变为可选，保留原有 error API。

## 文案替换清单（旧 → 新）

| 旧 | 新 |
| --- | --- |
| 创建任务 / 调整任务 / 归档任务 / 恢复任务 | 创建事项 / 调整事项 / 归档事项 / 恢复事项 |
| 短期任务 / 任务名称 / 任务版本 / 任务状态 | 短期事项 / 事项名称 / 事项版本 / 事项状态 |
| 任务资料与分工 / 保存任务资料 | 事项资料与分工 / 保存事项资料 |
| 返回筛选后的任务清单 / 任务与协作（详情返回链接） | ← 全部事项 |
| 关联任务 / 任务清单 / 例行任务 / 任务完成率 | 关联事项 / 事项清单 / 例行事项 / 事项完成率 |
| 没有找到这条任务 / 返回任务清单 | 没有找到这条事项 / 返回事项清单 |
| 任务已创建 / 任务已归档 / 已结束的任务 | 事项已创建 / 事项已归档 / 已结束的事项 |
| 任务保存失败 / 任务版本无效 / 任务已被更新 | 事项保存失败 / 事项版本无效 / 事项已被更新 |
| 此任务的协作者 / 未结束任务 / 本周按任务范围汇报 | 此事项的协作者 / 未结束事项 / 本周按事项范围汇报 |
| 其他交付与分组 | 协作分工下的「其他交付」子列表（存在时） |
| 更新进展会自动记录为本周汇报，旧汇报记录继续保留。 | 这件事的所有变化都记在这里。 |
| 已启用 | 不显示状态徽章 |
| 页面内只看不改 | 移除；账号资料中的角色显示「老板」 |
| 填写你的短账号或邮箱。 / 例：liming（登录） | 填写管理员给你的账号 / 例：okr1 |
| 填写你的登录密码。 / 例：你的登录密码 | 删除重复帮助 / 你的密码 |
| 使用短账号或邮箱登录。 / 例：liming（新增成员） | 用于登录，建议用姓名拼音缩写，例：lm / 例：lm |
| 王芳 在等你的「…」 | 王芳在等你的「…」 |
| 2026-W42 / 2026-10 / 2026-Q4 | 第 42 周（10/12–10/18）/ 2026 年 10 月 / 2026 年第 4 季度 |
| 2026-W01 | 2026 年第 1 周（12/29–1/4） |
| 2026-10-12（系统展示日期） | 2026 年 10 月 12 日；卡片简写 10/12 |
| okr1@okr.local（账号展示） | okr1 |
| 当前 30 / 目标 25 % | 当前 30% / 目标 25% |
| 周期格式无效，请使用 YYYY-Q1 至 YYYY-Q4… | 周期格式无效，请选择有效年份和季度。修改未保存。 |
| 四张统计卡 / 重复还没写列表 / 本周期任务 / 目标与关键结果区块 | 删除，保留深色条已写 X/Y与底部「看全部事项 →」「看目标 →」 |

错误消息及新系统动态中其余「任务」均按同一规则逐字换为「事项」，标识符、枚举、字段名、路由、筛选值及业务条件不替换。新协作 / 节点系统动态的日期也采用日常格式；原有历史正文保持原文，包括其中可能出现的旧用词、日期或邮箱。

## 现有单测调整（仅指定文案）

1. `tests/dashboard-redesign.test.ts`：三条完整结论断言只去掉「王芳」后的空格；最早交付排序、余项数量、有无跟进分支的验证不变。
2. `tests/member-service.test.ts`：停用被阻止的异常文案「请先移交 4 项未结束任务」→「…事项」；数量、拒绝条件、保留历史等断言不变。
3. `tests/fixtures/legacy-page-views.ts`：旧视图对照夹具的 kindHelp 同步「本周按事项范围汇报」，保持全量字段 / 查询口径对照；没有修改 `tests/page-views.test.ts` 的断言或业务期望。

## e2e 调整清单

- `e2e/smoke.spec.ts`：用户名入口选择器移到 `.user-menu > summary`；待写卡定位 `.pending-group .week-item`；保留周期参数的事项链接移到 `.week-band`；保存资料按钮文案改为「保存事项资料」。登录、权限、计数、移交和参数断言不变。
- `e2e/simple-forms.spec.ts`：用户名入口同上；待写计数从已删除统计卡移至异常胶囊；事项卡选择器移到 `.week-item`。保留原「更新进展」锚点及 `#update` 断言，没有替换成较弱的链接检查。
- `e2e/redesign-2.spec.ts`：成员折叠和待写项移到深色条、计数移到异常胶囊，原开合、计数减少、历史写入断言保留；成员卡 aria 名称使用短账号。原「已启用」文字断言改为无启停状态徽章，并验证展开后仍有「停用成员」操作，保持新建账号启用状态的检查意图。
- `e2e/members.spec.ts`：成员卡与重置密码表单名称去内部邮箱后缀；用户名入口定位更新。改密、会话失效、停用、权限和登录限速断言不变。
- `e2e/visibility.spec.ts`：不存在页文案「任务」→「事项」，可见权及移交断言不变。
- 新增 `e2e/design-fixes.spec.ts` 10 项：账号菜单键盘开合 / 图标 / 退出；Disclosure 按钮角色；成员 / 老板的周月季精简及周期 / 账号展示；QA-03；QA-04 参数保留；协作者 / 老板的详情去重及快照移除；成员 / 老板 390px 遍历可见 a/button/summary 高度 ≥44px、横向溢出、展开控件与手机导航检查。
- `npx playwright test --list` 可发现全套 39 项 / 7 文件；不代表测试执行通过。

## 验收结果与限制

本次没有创建 / 使用 `prisma/dev.db`，没有 reset、schema 修改或新增迁移。单测沿用临时目录的隔离库；补充 e2e 仅使用原配置定义的 `e2e/test.db`，以 `migrate deploy` 初始化已有迁移，未改生产数据。构建显式传入该隔离库的 DATABASE_URL，防止回退到开发库。

Node 20 通过 npm 临时工具缓存取得（20.20.2），未修改 package.json、package-lock 或系统 Node。原环境 Node 为 25.8.1。

标准 `npm run test:e2e` 失败于 Next 开发服务器启动：`TurbopackInternalError: unable to start FSEvent stream`。未进入测试断言。

另用一次性配置导入原配置，仅把服务命令换为已构建的生产服务；服务和原全局隔离库 setup 能正常完成，当时已编写的 8 个新增测试均被 Chromium 启动失败阻断：`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.…: Permission denied (1100)`。一次性配置已删除，原 `playwright.config.ts` 未修改。没有绕过沙箱或改断言使其通过。

因此：真实浏览器交互、390px 触控尺寸 / 无溢出和修复后截图尚未验收。源码 / 单测 / 构建证据不能替代这些检查；须由总控在可启动浏览器的环境运行全套 `npm run test:e2e` 并补 1440 / 390 截图。现有历史正文不重写是本次明确约束，可能继续带旧词或机器日期；系统标签和新动态已统一。

原始命令输出位于本目录 `validation/`，以下由最终验证命令尾部生成。

| 命令 | 结果 |
| --- | --- |
| `npm test`（Node 25.8.1） | 退出 0，110 / 110 通过 |
| `npm run lint` | 退出 0，无警告 / 错误 |
| `DATABASE_URL=file:…/e2e/test.db npm run build`（Node 25.8.1） | 退出 0，编译与类型检查通过 |
| `npm exec --yes --package=node@20 -- npm test`（Node 20.20.2） | 退出 0，110 / 110 通过 |
| `DATABASE_URL=file:…/e2e/test.db npm exec --yes --package=node@20 -- npm run build` | 退出 0，编译与类型检查通过 |
| `npm run test:e2e` | 退出 1，开发服务器 FSEvent 环境错误 |
| 一次性生产服务配置 + 新增 e2e | 退出 1，Chromium 沙箱权限错误；无业务断言实际执行 |
| `npx playwright test --list` | 退出 0，39 项 / 7 文件 |
| `git diff --check` | 退出 0 |

npm test 末尾：

```text
✔ transfer 拒绝未完成协作、旧版本、老板/停用目标、同一负责人、伪造身份；老板其他写入仍拒绝 (39.070542ms)
ℹ tests 110
ℹ suites 0
ℹ pass 110
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 29455.851958
```

npm run lint 末尾：

```text

> okr-dashboard@0.1.0 lint
> eslint

```

npm run build 末尾：

```text
└ ƒ /week


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

Node 20 npm test 末尾：

```text
  ...
1..110
# tests 110
# suites 0
# pass 110
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 36575.228917
```

Node 20 npm run build 末尾：

```text
└ ƒ /week


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

npm run test:e2e 末尾：

```text
[WebServer]     at <unknown> (TurbopackInternalError: unable to start FSEvent stream) {
[WebServer]   location: undefined
[WebServer] }
Error: Process from config.webServer was not able to start. Exit code: 1

```

测试发现 末尾：

```text
Total: 39 tests in 7 files
```



## 建议提交拆分（本次不提交）

1. `fix(ui): unify disclosure and touch targets`：Disclosure / Icon、账号按钮、Field 必填提示、响应式和44px点击区域、账号展示。
2. `fix(design): simplify progress and task detail views`：每周 / 月季布局、深色条分组、详情去重、目标按钮和进度条、周期 / 数值格式、事项文案及结论空格。
3. `test(design): cover display fixes and document acceptance`：新增纯函数单测与 e2e、现有测试选择器 / 文案调整、本交付与验证日志。

提交时请一起包含相互依赖的组件及 lib；可先按第1/2步划分再运行完整验收，避免拆分出不能构建的中间提交。
