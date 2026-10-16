# 页面重做第一批交付记录

范围：设计规范 §1–3、§4.1–4.3、§5。分支 `feat/redesign-1`，基线含 `5c93de7`。未执行 commit / push，修改全部留在工作区。

## 实现与边界

- 全局系统字体、设计令牌及旧 CSS 兼容别名；移除 next/font Google 字体。
- 桌面顶栏、390px 手机底部导航；成员 5 项、老板 4 项；账号页补充指南、成员管理及退出入口，保留原改密流程。
- 工作台采用一句话结论、周进展条、老板成员卡、互斥三栏和最近 8 条动态。手机原生 radio 切换栏目。
- 新建事项三题、默认负责人和跟进预设、折叠选填、手机吸底提交。
- 详情页将主负责人更新 / 协作者交付前置；风险提示、信息卡、协作、节点清单、时间线、资料与移交确认；老板不渲染业务表单。
- 所有 action、operation、字段名及枚举值保留。`mood=ok/risk/wait/stuck/done/same/cancel`，`followPreset=tomorrow/in3days/nextMonday/custom`，交付 `done=false/true`。
- ChoiceChips 无脚本可提交；跟进自选日期、进展补充字段和手机栏目由 CSS `:has` 控制。脚本增强必填反馈与保存状态，无脚本仍由原服务端验证。无脚本移交需要勾选额外确认。
- 详情返回保留 person / area / q / relation / filter；只有带原周期上下文才添加周期参数。本周进展状态独立于来源的月 / 季周期。
- 未修改 schema、迁移、已有单测断言、playwright.config.ts、依赖文件；未创建或使用 prisma/dev.db。测试使用明确指定的独立临时数据库。

## 基础组件及全部 props

均位于 `components/ui/`。`?` 表示可选。

| 组件 | Props | 状态 |
| --- | --- | --- |
| Button | 原生 ButtonHTMLAttributes（含 children、type、disabled、className、onClick、aria-* 等）；variant?: primary/secondary/danger/text；size?: lg/sm；pending?: boolean | 默认、悬停、按下、聚焦、保存中、禁用；同时识别 useFormStatus 与手动 action pending |
| StatusBadge | children: ReactNode；tone?: ok/risk/wait/plain/today/done | 所有状态含文字，done 带 ✓ |
| ChoiceChips | name: string；legend: ReactNode；help?: string；options: ChoiceOption[]；defaultValue?: string；value?: string；required?: boolean；onChange?: (value: string) => void；className?: string | 原生 radio；默认、选中、风险选中、完成选中、悬停、聚焦、禁用 |
| Field | label: string；help: string；error?: string；children: ReactNode；className?: string | 默认、聚焦、错误；为输入追加 aria-describedby / aria-invalid |
| TaskCard | task: TaskRow；description?: string；query?: string；action?: ReactNode | 整卡链接、悬停、聚焦、风险文案、完成淡化、可选独立次操作区；老板调用不传操作 |
| Lane | id: string；title: string；count: number；help: string；empty?: string；children: ReactNode | 有事项 / 空；手机由外层原生 radio 切换 |
| WeekBand | written: number；total: number；pending: WeekBandItem[]；boss: boolean | 待写、全部写完、成员可确认 / 老板只读；已结束未写任务仅展示，不提供无效写入 |
| Headline | text: string；supplement?: string | 有 / 无补充行 |
| PersonCard | id: string；name: string；owned: number；assisting: number；blocked: boolean | 正常 / 有事卡住；进入 person 筛选 |
| Timeline | items: TimelineItem[]；empty?: string | 动态列表 / 空；detail 用于保留原快照与历史指标 |
| Notice | tone?: ok/risk/plain；children: ReactNode；dismissible?: boolean | 成功、错误、提示、可关闭 |

附属类型与导出：

- `ChoiceOption = { value: string; label: string; tone?: risk|done; disabled?: boolean }`。
- `WeekBandItem = { id: string; title: string; ownerName: string; version: number; canConfirm: boolean; href: string }`。
- `TimelineItem = { id: string; who: string; action: string; time: string; title?: string; href?: string; body?: string; detail?: ReactNode }`。
- `TaskBadges({ task: TaskRow; full?: boolean })`：状态 / 风险 / 跟进 / 重要，full 补期限；`shortDate(date: Date|null): string`。
- 支持组件：`TaskDetailsForm(TaskFieldsProps & {task: Task})` 提交资料与移交确认；`MilestoneToggle({taskId, version, id, title, done})` 使用真实按钮显示勾选状态，沿用 toggleMilestone；`PendingContext` / `useActionPending()` 避免重复提交。

## 工作台计算函数与规则对应

位于 `lib/dashboard-view.ts`，保留原 `loadDashboard` 的返回字段供旧测试与调用使用。

| 签名 | 规则 |
| --- | --- |
| `dashboardLanes(tasks: TaskRow[], user: Member, now = new Date())` | §4.1：先排除结束、归档；成员主责今天/已过/未设置 → 未交付协作 → 主责无期限；老板受阻/风险 → 今天/已过 → 无期限。Set 保证每项只进入首个匹配栏；结论的协作与回音总数独立计算。 |
| `dashboardHeadline(tasks: TaskRow[], user: Member, now = new Date()): {text: string; supplement: string}` | §4.1：成员有跟进、有交付、两者皆无全部分支；按协作交付期限升序，空期限最后，余项数不含已展示一项。老板风险并集、首条卡点截断 60 字，无风险时回音仅计今天/已过。 |
| `dashboardWeekProgress(period: Awaited<ReturnType<typeof loadPeriodView>>, user: Member)` | §4.1：直接复用周总览 expected / missingIds；成员只取主责，老板全量；返回 total/written/pending；完成事项保留在范围内，但无“暂无变化”操作。 |
| `dashboardDate(now = new Date()): string` | §4.1：上海业务日期、星期、ISO 周号。 |
| `loadRedesignDashboard(db: CheckInClient, user: Member)` | 并行读取原视图、`loadPeriodView(db,{kind:"WEEK"})`、未停用成员；组合上述结果。 |

`tests/dashboard-redesign.test.ts` 新增 10 项测试：覆盖所有结论分支、最早交付与余项、仅期限逾期不算风险、卡点截断、两种三栏去重、周范围、上海日期/年边界，以及真实 Prisma 周总览一致性、停用成员排除、非周期返回筛选不引入周期参数。

## 既有 e2e 适配逐项

没有修改已有断言文本与意图，也未修改任何已有单测断言。

1. `simple-forms.spec.ts`：负责人从 `option:checked` 换成 `label:has(input[name="ownerId"]:checked)`，仍断言默认是李明。
2. `simple-forms.spec.ts`：创建按钮定位文本“创建任务”换成“记下来”。
3. `simple-forms.spec.ts`：mood 下拉选 stuck 换成 `getByRole("radio", {name:"卡住了"}).check()`。
4. `smoke.spec.ts`：退出前展开顶栏用户菜单，再通过 button 角色定位“退出登录”。
5. `smoke.spec.ts`：两处创建按钮选择器改为“记下来”。
6. `smoke.spec.ts`：mood 下拉选 ok 换成“顺利推进”radio。
7. `smoke.spec.ts`：移交负责人下拉选王芳换成同名 radio；按新交互补充勾选移交确认，然后仍验证原负责人不能汇报。

新增 `e2e/redesign.spec.ts` 6 项：成员 / 老板结论及三栏、三题创建与受阻原因必填、两种角色 390px 底部导航及页面横向溢出、无 JS 三题提交与进展服务端拒绝 / 成功。`--list` 共发现 17 项 / 4 个文件。

## 与规范的差异、未验证项

- 关键节点采用带勾选外观与 aria-pressed 的真实提交按钮，沿用服务端 toggle 语义；保留无脚本单击操作，未使用会单独改变本地状态的 checkbox。
- 原独立周期汇报入口、额外交付 / 分组、历史快照继续保留，避免删去既有权限与历史信息；这些是详情页的补充区域。
- 顶栏身份沿用“管理成员 · 可填报”和“老板 · 只读”，老板增加“只看不改”；保持已有角色断言，未改变角色或权限。
- 第二批页面保留旧 class / 结构与相应 CSS；账号页仅补手机导航目的入口。
- 截图由总控完成。本机 e2e 在 dev 服务启动阶段出现 `TurbopackInternalError: unable to start FSEvent stream`，退出码 1，未进入浏览器执行。未改 Playwright 配置。
- 因而不能声称浏览器交互、390px 无横向滚动、无 JS 提交、旧页面视觉兼容已通过；均已写入 e2e，待总控在可用环境运行，并截图工作台 / 新建 / 详情的 1440px 与 390px 视口。

## 建议提交拆分

1. `feat(ui): add redesign tokens, primitives and responsive navigation`：字体与令牌、components/ui、pending、AppShell / NavLinks、账号导航补充、loading/error。
2. `feat(dashboard): rebuild role-based workbench and weekly progress`：工作台、dashboard-view、新单测。
3. `feat(tasks): redesign task creation and detail forms`：TaskFields / FollowUpFields / ProgressForm、资料移交、节点组件、两个任务页面、详情视图。
4. `test(e2e): adapt selectors and cover redesign flows`：旧 e2e 选择器、新 e2e、交付记录。

建议先拆 CSS 的公共令牌 / 导航 / 基础组件，再把工作台与表单样式分别归到对应提交。

## 文件清单

- `app/(main)/error.tsx`
- `app/(main)/loading.tsx`
- `app/(main)/page.tsx`
- `app/(main)/tasks/[id]/page.tsx`
- `app/(main)/tasks/new/page.tsx`
- `app/account/page.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `components/action-form.tsx`
- `components/app-shell.tsx`
- `components/follow-up-fields.tsx`
- `components/form-pending.tsx`
- `components/milestone-toggle.tsx`
- `components/nav-links.tsx`
- `components/progress-form.tsx`
- `components/task-fields.tsx`
- `components/transfer-confirmation.tsx`
- `components/ui/button.tsx`
- `components/ui/choice-chips.tsx`
- `components/ui/field.tsx`
- `components/ui/headline.tsx`
- `components/ui/lane.tsx`
- `components/ui/notice.tsx`
- `components/ui/person-card.tsx`
- `components/ui/status-badge.tsx`
- `components/ui/task-card.tsx`
- `components/ui/timeline.tsx`
- `components/ui/week-band.tsx`
- `docs/design/redesign-batch1-handoff.md`
- `docs/design/validation/redesign-batch1.txt`
- `e2e/redesign.spec.ts`
- `e2e/simple-forms.spec.ts`
- `e2e/smoke.spec.ts`
- `lib/dashboard-view.ts`
- `lib/task-detail-view.ts`
- `tests/dashboard-redesign.test.ts`

## 最终验收结果

- Node 25.8.1：`npm test` 为 92 passed / 0 failed；`npm run lint` 退出码 0；`npm run build` 退出码 0。
- Node 20.20.2：通过缓存中的独立 node 可执行文件置于 PATH 前端运行，`npm test` 为 92 passed / 0 failed，`npm run build` 退出码 0。
- `npx tsc --noEmit`、`git diff --check` 通过。
- `npm run test:e2e -- --list`：17 tests in 4 files。
- `npm run test:e2e`：退出码 1，开发服务器 FSEvent stream 启动错误，没有执行浏览器用例；不可记为 e2e 通过。
- 命令最后几行原文见 [validation/redesign-batch1.txt](validation/redesign-batch1.txt)。

```text
Node 25: tests 92 | pass 92 | fail 0 | skipped 0
Node 20: tests 92 | pass 92 | fail 0 | skipped 0
Build (both): ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
E2E: Error: Process from config.webServer was not able to start. Exit code: 1
```
