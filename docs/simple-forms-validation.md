# 第 5 项：让填写更容易上手

工作目录：`/Users/mac/orca/workspaces/okr-dashboard/codex`；分支：`feat/simple-forms`（基于 `feat/member-admin`）。未切换分支、未 commit、未 push。未修改 schema、迁移或 Playwright 配置，未使用或创建 `prisma/dev.db`，未连接线上数据库。业务测试只使用独立临时 SQLite 库。参考了 Next.js 包内 forms / use-client 指南，以及已确认原型的 `renderF`。

## 业务与表单

新建只需 title、completionCriteria、ownerId；负责人默认当前用户。area 默认 OTHER、priority 默认 1（兼容 0）、dueAt/keyResultId 可空、nextAction 空白时保存「明确推进计划」。其余放入默认折叠的「更多设置（选填）」。有 dueAt 自动推导 SHORT_TERM，无 dueAt 推导 LONG_TERM，编辑资料同样适用；不再提供任务类型选择框。

| mood | 用户选项 | status | health | 额外要求 |
| --- | --- | --- | --- | --- |
| ok | 顺利推进 | IN_PROGRESS | ON_TRACK | 进展、下一步 |
| risk | 有风险 | IN_PROGRESS | AT_RISK | 进展、风险原因及支持、下一步 |
| wait | 在等别人 | WAITING | ON_TRACK | 进展、下一步；waitingOn 选填，追加「（在等：…）」 |
| stuck | 卡住了 | BLOCKED | AT_RISK | 进展、卡点及支持、下一步 |
| done | 做完了 | DONE | ON_TRACK | 最后结果；无需下一步或跟进日 |
| same | 没变化 | 保留 | 保留 | 仅确认、调整跟进日；保留已有事实、风险与下一步 |
| cancel | 不做了（取消，次要入口） | CANCELLED | ON_TRACK | 取消原因；无需下一步或跟进日 |

mood 字段存在时优先采用它，非法或空值报错；没有 mood 时兼容旧 updateKind/status/health。所有校验和状态映射都在服务端。

followPreset 使用 `today(now)` 的 Asia/Shanghai 业务日：tomorrow +1 天，in3days +3 天（默认），nextMonday 为下一个周一（周一当天选则 +7 天），custom 校验 nextFollowUpAt 是有效日期且不早于今天。跨月、跨年使用日历加天。旧表单没有 followPreset 但有 nextFollowUpAt 时，保留显式日期语义。

## 自动周汇报

`mutateTask(..., "progress")` 在原事务内完成版本 CAS、任务更新、原有一条 TaskUpdate，然后使用 `ensurePeriodTree(tx)` 为当前上海业务周新增一条 TASK CheckIn。same 为 NO_CHANGE，其余为 SUBMITTED；body 使用本次摘要，blocker 使用风险说明（包括 same 时保留的风险），nextStep 使用下一步，authorId 为操作者。不会调用会额外写任务历史的 submitCheckIn。测试确认每次进展仅新增一条 TaskUpdate，CheckIn 失败时任务、版本和历史全部回滚。

主负责人详情页隐藏单独周汇报表单，显示「本周更新进展即视为已汇报」；其他获授权汇报人仍保留独立入口。submitCheckIn 和所有历史记录继续有效；KR / 目标汇报入口保持。总览的任务项改为「暂无变化」按钮（携带 taskId/version，默认 3 天后跟进）及「更新进展」链接。按钮遵循主负责人权限，已结束任务可进入详情调整结果；自动记录始终属于当前业务周，不补写历史周。

## 用户文案替换

| 旧 | 新 |
| --- | --- |
| 任务名称 / 完成标准 / 主负责人（新建及资料表单） | 这件事是什么？ / 做到什么算完成？ / 谁负责？ |
| 本次更新 + 任务状态 + 风险情况 | 现在怎么样？及按选择展示的输入框 |
| 下一步动作 / 下次跟进日期 | 下一步做什么？ / 什么时候再看一眼？ |
| 重点 / 常规 | 重要 / 一般 |
| 无行 = 未汇报、没有对应 Check-in 就是未汇报、系统不会代写空记录 | 本周更新进展会自动记录；暂无变化也可以完成本周汇报 |
| 未汇报 | 任务：本周还没写进展；关键结果：本月还没复盘；目标：本季还没评估 |
| RACI 负责人 R / 问责人 A、R/A 等界面说明 | 主责汇报人 / 督办确认人 |
| 情况待确认 | 刚创建 / 刚接手，待更新进展 |
| 下钻只读展示，不改 WBS 结构 | 协作子项与交付物清单（只读查看） |
| 确认暂无变化与未汇报不是一回事 | 没有变化？点击「暂无变化」即可完成本周汇报 |
| 任务完成率与 KR 达成率分开看 | 事项推进进度 / 业务指标达成度 |
| 目标方向与起点不一致 | 带提升 100→150、成本 35%→25% 示例的校验提示 |
| 周期汇报和任务进展是两套记录，都要写 | 本周更新进展即视为已汇报，不用再写一遍 |

页面、组件源码检索已不含「无行」「WBS」「RACI」「R / A」「R/A」「情况待确认」「未汇报」。URL、枚举和数据字段保留。新建、进展、独立汇报及详情协作/节点输入补充了就地帮助与「例：」示例；日期与选择框的例子写在帮助文字中。

## 测试与现有断言调整

新增 `tests/simple-forms.test.ts`，共 14 个测试：最简创建与默认值、创建/编辑 kind、四种日期及上海跨日和周一边界、6 个 mood 映射与自动汇报（same 单列）、取消和风险必填、等待信息拼接、same 不覆盖事实、更新后本周缺口减少、旧参数和旧独立汇报兼容、陈旧版本拒绝、汇报失败事务回滚、周/月/季文案。

新增 `e2e/simple-forms.spec.ts`，3 个测试覆盖 4 个验收场景：只回答 3 个问题创建；卡住了必须有原因；进展后待写数量减少；总览一键暂无变化。沿用现有独立 e2e/test.db 配置，登录后等待主页和用户信息再导航。

现有单测只因产品文案改变调整以下 3 处断言：

1. `tests/foundation.test.ts`：UNREPORTED 标签从「未汇报」改为「本周还没写进展」，仍验证没有记录时状态为 UNREPORTED，并与 NO_CHANGE 区分。
2. `tests/check-in.test.ts`：越权报错匹配 `/RACI/` 改为 `/主责汇报人/`，仍要求协作者提交被拒绝。
3. `tests/integrity.test.ts`：同样替换错误文字匹配，仍保护分工/移交权限边界。

`tests/fixtures/legacy-page-views.ts` 的唯一标签字符串同步更新，完整视图对照继续保护原查询与统计口径。未调整其他原有断言。

旧 e2e 仅适配入口与选择器，断言保持原样：

1. 创建并更新进展场景：先展开更多设置再填下一步/期限；旧 updateKind/status 两个选择器换成 mood=ok。
2. 周汇报缺口减少场景：旧 body 输入+提交改成任务卡片的「暂无变化」按钮，仍验证数量减少（通过 progress 自动生成 CheckIn）。
3. UX-01 无期限任务场景：填写选填项前展开更多设置，仍验证任务进入当前周总览。

## 验收结果

| 命令 | 最终结果 |
| --- | --- |
| Node 25.8.1 `npm test` | exit 0，82 / 82 通过 |
| `npm run lint` | exit 0，无错误 |
| Node 25.8.1 `npm run build` | exit 0，编译、类型检查、页面生成通过 |
| Node 20.20.2 `npm test` | exit 0，82 / 82 通过 |
| Node 20.20.2 `npm run build` | exit 0，编译、类型检查、页面生成通过 |
| `npm run test:e2e` | exit 1，开发服务器启动前受阻，未执行浏览器用例 |
| `playwright test --list` | exit 0，识别 3 个文件共 11 个用例 |
| `git diff --check` | exit 0 |

构建显式指定 `DATABASE_URL=file:$PWD/e2e/test.db`，所有业务页面为动态渲染，未使用默认开发库。Node 20 使用本机已有的 `/Users/mac/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node`（v20.20.2），通过 PATH 注入，不更改全局 Node 配置。

复跑期间曾因同时执行 build（包含 prisma generate）和 test，在 Client 重新生成窗口出现 `.prisma/client/default` 加载失败；已在构建结束后单独重跑，最终两种 Node 单测均全部通过。无需修改应用或测试断言来解决。

e2e 的确切阻碍：`TurbopackInternalError: unable to start FSEvent stream`，随后 `Process from config.webServer was not able to start. Exit code: 1`。未修改 playwright.config.ts，也未绕过环境限制。浏览器渲染、交互与 e2e 断言尚未完成，需总控补跑。其余无已知未完成项。

最终日志末尾：

Node v25.8.1：npm test

```text
ℹ tests 82
ℹ suites 0
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26854.006541
```

npm run lint（exit 0）

```text
> okr-dashboard@0.1.0 lint
> eslint

```

Node v25.8.1：npm run build（exit 0）

```text

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

Node v20.20.2：npm test

```text
1..82
# tests 82
# suites 0
# pass 82
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 26304.98325
```

Node v20.20.2：npm run build（exit 0）

```text

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

npm run test:e2e（exit 1，环境阻碍）

```text
[WebServer]     at <unknown> (TurbopackInternalError: unable to start FSEvent stream) {
[WebServer]   location: undefined
[WebServer] }
Error: Process from config.webServer was not able to start. Exit code: 1

```

playwright test --list（exit 0）

```text
Total: 11 tests in 3 files
```


## 建议提交拆分

1. 服务端规则、自动周汇报及单测（含必要文案断言同步）。
2. 简化表单、总览入口、就地指引和页面文案，及 e2e 场景适配。
3. README 与本验收记录。

## 改动文件

- `README.md`
- `app/(main)/guide/page.tsx`
- `app/(main)/okrs/[id]/page.tsx`
- `app/(main)/overview/page.tsx`
- `app/(main)/page.tsx`
- `app/(main)/tasks/[id]/page.tsx`
- `app/(main)/tasks/new/page.tsx`
- `app/(main)/tasks/page.tsx`
- `components/check-in-form.tsx`
- `components/filling-guide.tsx`
- `components/follow-up-fields.tsx`
- `components/progress-form.tsx`
- `components/task-card.tsx`
- `components/task-fields.tsx`
- `docs/simple-forms-validation.md`
- `e2e/simple-forms.spec.ts`
- `e2e/smoke.spec.ts`
- `lib/actions.ts`
- `lib/check-in.ts`
- `lib/okr-service.ts`
- `lib/overview.ts`
- `lib/task-service.ts`
- `tests/check-in.test.ts`
- `tests/fixtures/legacy-page-views.ts`
- `tests/foundation.test.ts`
- `tests/integrity.test.ts`
- `tests/simple-forms.test.ts`
