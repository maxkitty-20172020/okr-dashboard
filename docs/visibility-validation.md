# 第 8 项：事项可见范围与移交权限交付记录

基线：`feat/visibility`，HEAD `7efbeee`。修改保留在工作区，没有 commit / push。

本次不修改 schema、迁移、依赖或 Playwright 配置，不执行数据库重置，不使用或创建 `prisma/dev.db`。单测使用自动清理的临时 SQLite 库；新 e2e 显式连接既有独立测试库 `e2e/test.db`。

## 实现与全部调用点

唯一可见性策略：`lib/task-visibility.ts`。

- `visibleTaskWhere(user)`：老板无额外条件；成员为 ownerId 本人 OR active=true 的协作本人 OR CREATED 更新的 authorId 本人。
- `canViewTask(user, task)`：同模块的内存判断，输入含协作与更新记录。
- `TASK_NOT_VISIBLE`：不可见 / 不存在事项的统一写入提示「这项事项不存在或你无权查看」。

| 调用点 | 作用与页面 |
| --- | --- |
| `lib/tasks-view.ts::loadTaskList` | 普通列表先在 Prisma 查询限制可见性，再搜索、关系、人员、状态筛选及计数；周期列表转下列周期服务 |
| `lib/dashboard-view.ts::loadDashboard` | 任务集合、最近 8 条动态均先限制可见性；所有栏目、计数及结论从该集合计算 |
| `lib/overview.ts::tasksInPeriod` | 周月季任务查询与现有周期条件取 AND；由 `loadPeriodView` 传入当前用户 |
| `lib/period-view.ts::loadPeriodView` | 复用 tasksInPeriod；从返回的汇报映射移除不可见 / 不在本周期集合的 TASK 记录 |
| `lib/dashboard-view.ts::loadRedesignDashboard` | 向 loadPeriodView 传用户，工作台周进展条沿用原主责口径 |
| `lib/overview-service.ts::loadOverview` | 向 loadPeriodView 传用户；统计、异常、列表、目标卡片关联事项只基于可见任务 |
| `lib/tasks-view.ts::loadTaskList`（周期） | 向 loadPeriodView 传用户，保障异常筛选与周期下钻同口径 |
| `lib/objective-detail-view.ts::loadObjectiveDetail` | 限制目标详情关联事项、交付物、每个关键结果的关联列表与数量；目标 / 关键结果本身不隐藏 |
| `lib/task-detail-view.ts::loadTaskDetail` | 用 canViewTask 拒绝不可见详情，返回 null，由页面使用现有 notFound |
| `lib/task-service.ts::mutateTask` | 事务中用 canViewTask 校验后才检查版本 / 业务权限并写入；含进展 same（一键暂无变化） |
| `lib/check-in.ts::canAuthorCheckIn`（TASK） | 可见性先于主责 / RACI 汇报权限，RACI 本身不能扩大任务可见范围 |
| `lib/check-in.ts::submitCheckIn`（TASK） | 事务中先确认可见性、再确认汇报权限，统一拒绝不可见事项，无写入和历史副作用 |
| `lib/check-in-permissions.ts::loadCheckInAuthorizer`（TASK） | 批量权限查询复用 where；目标 / KR 继承权限不变 |
| `app/(main)/okrs/page.tsx` | 目标看板 Prisma _count 的关联事项数量使用可见性 where |
| `app/(main)/guide/page.tsx` | 指南中的填写案例链接也只从可见事项选择 |

`tasksInPeriod` 保留无用户时的内部全量计算接口，以兼容原周期计算测试与冻结的旧页面对照 fixture；所有实际页面入口均显式传入当前用户。`loadPeriodView` 同理。`lib/redesign-view.ts::weeklyOverview` 在可见事项范围上只向成员返回本人分组，老板保留全部分组。部门目标与 KR 的汇报、增删改权限未改。

## 修改权限与 transfer

- 主负责人独占 details / archive / restore；服务端检查与页面入口一致，协作者和仅为创建者的成员均不可操作。
- `transfer` 已进入 `taskMutationAction` 白名单，单独按数据库重查当前未停用 BOSS 身份，不放宽 requireWriter / writableUser。
- 老板详情新增 `components/boss-transfer-form.tsx`：用 ChoiceChips 选择另一位未停用填报成员，展示指定确认句及「确认移交」，其他业务写入表单继续隐藏，保留只看不改标记。
- transfer 只改 ownerId、清空 lastConfirmedAt，并正常更新 version / updatedAt。额外提交的资料 / 进展字段被忽略。
- 老板 transfer 与成员 details 移交共用事务内 transferOwner：拒绝接手人的未完成有效协作；已完成协作转 inactive 并移除 C；删除原负责人 R/A、建立新负责人 R/A。历史 kind=TRANSFER，body 为「陈总 将负责人由 A 移交给 B」，snapshot 记录新负责人。
- 携带版本号并使用原 compare-and-swap。版本冲突时任务、分工、RACI 和历史整体回滚。允许老板为已结束 / 已归档及原老板名下事项移交，保留原状态与归档。

## 测试与现有测试调整

`tests/visibility.test.ts` 新增 6 组真实临时数据库测试：

1. 数据库 where 与内存判断一致：主责、有效协作、创建者、老板全部可见；协作移除后不可见。
2. 普通 / 搜索 / 状态 / 周期异常列表、工作台动态与周条、周月季总览、目标详情及 KR 关联列表只包含可见事项；成员仅有本人周分组。
3. 不可见事项的全部成员 mutate operation、TASK 的 SUBMITTED / NO_CHANGE、总览同一 progress same 操作拒绝；RACI 无法绕过，失败不产生记录 / 版本变化。
4. 协作者与仅创建者不可 details / archive / restore；主负责人归档 / 恢复可用；替别人创建后创建者正常读取详情。
5. 老板 transfer 更新负责人 / 确认标记、历史 / RACI / C 同步，新负责人能更新；原非创建主负责人失去可见权，创建者仍可见；成员 details 移交同样遵循该规则。
6. 未完成协作、旧版本、老板 / 停用 / 不存在接手人、同一负责人、伪造老板身份被拒；老板其他全部任务写操作及创建继续拒绝。

既有单测仅以下规则变化涉及断言调整：

- `tests/tasks.test.ts`：无关成员伪造 contribution，原先断言「只有此任务的协作者」，现在断言统一不可见提示；仍验证越权提交被拒。
- `tests/redesign-2.test.ts`：两处成员分组断言不再包含王芳 / other；统计、待写数和确认权限断言保留，并补老板仍看到 other 的断言。保持已写移出、空组不显示的原意。
- `tests/page-views.test.ts`：没有修改断言，也没有修改冻结的旧页面 fixture。给既有 TASK R/A 案例及 40 条性能测试数据补明确 CREATED 测试记录，使它们在成员视角可见，继续验证旧页面计算、汇报授权和消除 N+1 的原意。

新 e2e：`e2e/visibility.spec.ts` 两条。独立准备非 okr1 创建的 okr1 主责事项；登录等待跳转后检查 okr2 直达不存在、列表 / 搜索无该事项；老板移交后 okr2 能读取并更新，okr1 直达不存在且列表无该事项。新建浏览器 context 隔离账号。

现有 e2e 调整清单只有 `e2e/redesign-2.spec.ts`：成员列表筛选测试删除操作成员下拉的步骤，改断言该控件不存在；清除筛选后的同一控件检查也改为不存在。搜索、领域、关系、数量、清除与周期参数保留的断言不变。其余 e2e 账号 / 数据 / 断言未改。

## 验收结果

最终命令输出见工作区内被 Git 忽略的 `test-results/visibility/`。下表记录最终验收；早期曾因构建生成 Prisma Client 与测试启动重叠出现找不到 `.prisma/client/default`，已以最终复验结果为准。

| 环境 / 命令 | 结果 |
| --- | --- |
| Node 25.8.1 · npm test | 105 tests / 105 pass / 0 fail |
| npm run lint | 退出 0，无 ESLint 错误或警告 |
| Node 25.8.1 · npm run build | 退出 0；编译、TypeScript、静态页及路由生成完成 |
| Node 20.20.2 · npm test | 退出 0；105 tests / 105 pass / 0 fail |
| Node 20.20.2 · npm run build | 退出 0；编译、TypeScript、静态页及路由生成完成 |
| npm run test:e2e | 测试服务启动失败：TurbopackInternalError: unable to start FSEvent stream；未进入浏览器测试 |
| npx playwright test --list | 29 tests in 6 files（包含新增两条） |
| git diff --check | 通过 |

最终输出摘录：

```text
Node 25 npm test:
ℹ tests 105
ℹ pass 105
ℹ fail 0
ℹ duration_ms 35155.660666

Node 20 npm test:
# tests 105
# pass 105
# fail 0
# duration_ms 28228.819959

npm run lint:
> okr-dashboard@0.1.0 lint
> eslint
（退出 0，无其他输出）

两个版本 npm run build 的最后几行均为:
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

npm run test:e2e:
Error [TurbopackInternalError]: unable to start FSEvent stream
Error: Process from config.webServer was not able to start. Exit code: 1

npx playwright test --list:
Total: 29 tests in 6 files
```

Node 20 使用本机已有缓存二进制，通过 PATH 指向 `/Users/mac/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin`；未修改依赖或包管理配置。

## 建议提交拆分

1. `feat: enforce task visibility and owner-only edits`：唯一策略、所有读取 / 写入入口、成员筛选与分组，以及相关可见性与既有测试适配。
2. `feat: allow boss to transfer task ownership`：transfer、共用移交规则、老板卡片、历史文案，以及对应单测和 e2e。
3. `docs: document task visibility and transfer validation`：README、设计规范、本交付记录。

共享文件中建议按 hunk 拆分前两笔；也可合并为一笔功能提交，再单独提交文档。由总控审查后执行，本次未提交。

未完成：沙箱中真实浏览器 e2e 验收；需在能正常启动 Next 开发服务的环境原样运行 npm run test:e2e。无其他待确认业务规则。
