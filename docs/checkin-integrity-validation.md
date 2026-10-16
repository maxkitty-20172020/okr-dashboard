# 周期汇报与 RACI 完整性修复交付记录

日期：2026-10-16。目录：`/Users/mac/orca/workspaces/okr-dashboard/codex`。分支：`fix/checkin-integrity`，基于 `origin/main e94e6f6`。修改留在工作区，未 commit / push，未访问线上或其他工作区。

## 文件与设计

| 任务 | 文件 | 设计及理由 |
| --- | --- | --- |
| 周期范围 | `lib/overview.ts`、`tests/integrity.test.ts` | 生命周期条件 `createdAt < endAt && (status 不为 DONE/CANCELLED || completedAt >= startAt)` 与原排期 / 期限 / 月季目标关联取并集。全局排除已归档、周期开始前已取消。显式处理 `completedAt=null`，避免 SQL 三值逻辑误删原显式排期。 |
| RACI 同步 | `lib/task-service.ts`、`tests/integrity.test.ts` | 创建写 R/A；移交删旧主责 R/A、写新主责 R/A；新主责原为协作者时移除 C；协作增删同步 C。均沿用任务与审计同一事务，保持已有版本检查和移交前交付检查。 |
| 回填 | `lib/foundation-backfill.ts`、`lib/wbs.ts`、`prisma/backfill.ts`、`package.json`、`tests/backfill.test.ts`、`scripts/rehearse-backfill.ts` | `applyFoundationBackfill` 改为共用只读计划与执行器。CLI 在一个事务内规划及应用，预览只规划。按当前任务 owner 清理不匹配 R/A，保留其他 RACI 与业务行。按现有规则补周期、目标关联和交付物；保留目标原 updatedAt，已有非法 cycle 仍按基础逻辑回填到当前季度。 |
| OKR 加固 | `lib/okr-service.ts`、`lib/actions.ts`、`app/(main)/okrs/page.tsx`、`tests/okr-service.test.ts` | 独立服务层重查账号角色、校验 owner、长度、季度、有限数值、方向和区间；删除检查及删除本身同一事务，避免 Cascade / SetNull 丢关联。actions 只解析、调用服务和刷新 / 错误跳转；页面仅替换错误文案映射，未知错误码回退。 |
| 使用及验收文档 | `README.md`、本文 | 给出回填、上线次序和复现方法。 |

`/overview` 与周期视图 `/tasks` 都继续使用 `tasksInPeriod`。两页的未汇报来自相同 `expectedTargets` / `unreportedScopeIds` / `relatedTaskIdsForUnreported`，取消任务不要求周汇报；完成率继续排除取消任务。异常芯片沿用未结束任务风险、逾期与待确认条件，无须改动这两个页面。测试覆盖共享数据查询及统计，没有声称浏览器交互验收通过。

## 新增测试清单

新增 13 项，原有 36 项及其断言均未修改。

`tests/integrity.test.ts`（3 项）：

1. 创建、协作增删及移交在事务中同步 RACI，旧负责人失去汇报权限。含 C 不能代交、未交付不能移交、移交后旧主责变协作者、移除 / 再加协作者、审计失败时协作与 RACI 整体回滚。
2. 无期限的跨周未结束任务、本周完成任务进入周汇报及统计，上周结束任务退出。含归档、创建时间上界、上周取消、完成率 50%、未汇报下钻、风险 / 待确认芯片。
3. 原有排期、期限和季度关联仍取并集，取消时间为空时保留显式排期。

`tests/backfill.test.ts`（3 项）：

1. 回填 CLI dry-run 不写入、修复历史移交 R/A、幂等并保留所有业务字段。含原任务、进展审计、Check-in、协作、目标业务字段和 updatedAt、KR、原交付物保持不变；新增交付物不重复，I 角色保留。
2. 回填中途失败会回滚同一事务内的周期、RACI 及目标关联。通过临时库触发器在交付物写入处强制失败。
3. 模拟线上 15 条无排期未结束任务，三次回填输出与周期可见性正确。

`tests/okr-service.test.ts`（7 项）：

1. 目标创建和修改校验成员、长度及季度，并关联正确 Period。
2. KR 创建修改拒绝非有限数、无效方向、错误区间及超长文本。
3. 老板不能执行任何 OKR 写入，伪造角色及失效账号也被服务层拦截。
4. 目标和 KR 有关联任务（包括归档）时拒删，任务和关联完整保留。
5. 多态 Check-in 阻止删除目标、KR 以及含 KR 汇报的目标。
6. 空目标及 KR 可删除，Check-in 的 scopeType 必须匹配才阻止删除。
7. 不存在的目标或 KR 返回业务错误。

每项主任务均先运行失败测试再修复：周期查询初始缺少两条任务；任务创建初始缺少 R/A；回填初始缺少 npm script；OKR 初始缺少服务模块。所有测试仅使用独立临时库和已有迁移，无数据库重置。

## 15 条任务回填演练

复现：`npx tsx scripts/rehearse-backfill.ts`。脚本强制新建并清理临时库，忽略调用者的数据库配置。构造 4 账号、15 条未结束任务（全部无 schedulePeriodId，其中 13 条无 dueAt）、无 RACI、1 个已有关联季度的目标。

实际输出：

```text
fixture: users=4, openTasks=15, schedulePeriodId=null:15, dueAt=null:13, raci=0
{"mode":"dry-run","changes":{"periodsCreated":2,"periodsUpdated":0,"objectivePeriodsUpdated":0,"raciCreated":30,"raciDeleted":0,"deliverablesCreated":0},"total":32}
{"mode":"applied","changes":{"periodsCreated":2,"periodsUpdated":0,"objectivePeriodsUpdated":0,"raciCreated":30,"raciDeleted":0,"deliverablesCreated":0},"total":32}
{"mode":"applied","changes":{"periodsCreated":0,"periodsUpdated":0,"objectivePeriodsUpdated":0,"raciCreated":0,"raciDeleted":0,"deliverablesCreated":0},"total":0}
verified: 2026-W42 tasks=15, R/A=30, businessFields=unchanged, secondRun=0
```

## 验收命令及输出

默认 Node：v25.8.1。Node 20：v20.20.2。以下五项均退出码 0。build 显式使用临时路径 `DATABASE_URL=file:/tmp/okr-integrity-build-unopened.db`；未使用 / 创建 `prisma/dev.db`。

`npm test` 最后几行：

```text
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4648.203833
```

`npm run lint` 完整输出，无错误和警告：

```text
> okr-dashboard@0.1.0 lint
> eslint
```

`DATABASE_URL=file:/tmp/okr-integrity-build-unopened.db npm run build`：

```text
✓ Compiled successfully in 693ms
  Finished TypeScript in 1382ms ...
✓ Generating static pages using 9 workers (3/3) in 63ms
```

Node 20 测试使用已下载的 Node 20 bin 目录置于 PATH 首位，运行的是同一条 `npm test`：

```bash
env PATH="/Users/mac/.npm/_npx/ebaba8b9e55fd0a9/node_modules/node/bin:$PATH" npm test
```

末尾输出：

```text
1..49
# tests 49
# suites 0
# pass 49
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3621.851792
```

首次按示例使用 `npx -y -p node@20 -c 'npm test'` 时，外层 npm 的 call 参数传入子测试，嵌套的 `npx prisma migrate deploy` 报 EUSAGE。改用上面直接切换 Node PATH 的方式后 49 项通过；未改动旧测试来适配此启动器问题。

`DATABASE_URL=file:/tmp/okr-integrity-build-unopened.db npx -y -p node@20 -c 'npm run build'`：

```text
✓ Compiled successfully in 927ms
  Finished TypeScript in 1140ms ...
✓ Generating static pages using 9 workers (3/3) in 76ms
```

两次 build 的最后几行相同：

```text
├ ƒ /tasks/[id]
├ ƒ /tasks/new
└ ƒ /week

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

`git diff --check` 通过。schema、迁移、已有测试、锁文件无变动；未新增依赖。

## 上线步骤（尚未执行）

1. 由总控审查、提交并按现有部署流程发布源码；使用线上 Node 20。保留原 `.env`、AUTH_SECRET 和真实 DATABASE_URL。
2. 暂停业务写入 / 停止旧服务，运行 `./scripts/backup-db.sh`，确认备份路径与 integrity_check 成功后继续。失败则停止升级。
3. `npm ci` → `npx prisma migrate deploy` → `npx prisma generate` → `npm run build`。本次无新增迁移；不运行 seed 或 reset。
4. `npm run db:backfill -- --dry-run`，核对分类数量；随后 `npm run db:backfill`。若任何一步报错，停止，保留备份和错误输出。正式失败将回滚整批变更。
5. 再执行 `npm run db:backfill`，确认 `total=0`。同一批数据、同一当前周期下应无再次修改。
6. 按现有流程启动 / 重启 systemd 服务并恢复写入。用成员账号核对本周 /overview、待我汇报、未汇报异常到 /tasks 的下钻；检查旧主责 / 新主责权限；用老板账号确认只读。

预期线上影响：未归档且在本周结束前创建的 15 条未结束任务将纳入本周范围，不再要求先补排期或 dueAt；原有排期 / dueAt / 目标季度匹配继续纳入。历史未汇报缺口会真实出现，已有 6 条 Check-in 不变且不会补造空行。本周完成纳入完成率，上周完成在无其他显式条件时不纳入，取消不参与完成率。18 条任务按各自当前 owner 补齐 R/A，历史移交的旧 R/A 被清理；活跃协作者补 C。目标已存在 periodId 的保持不变；已有交付物保留，仅复制缺失项。真实变更数量以线上 dry-run 为准，演练数量不是线上统计。

## 建议提交拆分

| 顺序 | 中文提交说明 | 文件 |
| --- | --- | --- |
| 1 | 修复周期任务纳入范围并同步任务 RACI 分工 | `lib/overview.ts`、`lib/task-service.ts`、`tests/integrity.test.ts` |
| 2 | 增加事务化幂等回填及只读预览和临时库演练 | `lib/foundation-backfill.ts`、`lib/wbs.ts`、`prisma/backfill.ts`、`package.json`、`scripts/rehearse-backfill.ts`、`tests/backfill.test.ts` |
| 3 | 抽离 OKR 写服务并保护关联任务和汇报记录 | `lib/okr-service.ts`、`lib/actions.ts`、`app/(main)/okrs/page.tsx`、`tests/okr-service.test.ts` |
| 4 | 补充完整性修复上线及验收记录 | `README.md`、`docs/checkin-integrity-validation.md` |

无未完成的代码项、无阻碍。未部署、未接触真实库、未做真实浏览器交互验收。当前只读计划与执行器仍沿用项目原有上海业务日期边界和非法历史 cycle 回退规则；本次没有更改这些口径。以后跨入新周 / 月 / 季运行回填可能新增新周期，这不属于对同一批数据的重复修改。
