**页面业务逻辑抽取与格式化交付记录（2026-10-16）**

工作目录：`/Users/mac/orca/workspaces/okr-dashboard/codex`。分支保持 `refactor/extract-logic`，HEAD 保持 `7dfdcc39da57a8840d8a44d53f9906ae8b1779fe`。未 commit、push、切换分支、合并或变基。开始时工作区干净。已阅读 AGENTS.md、README.md，以及本机 Next.js 16.4.2 的 layouts-and-pages、fetching-data 文档。

页面保留现有 JSX 标签、组件、属性名、静态属性、class、style、文本与 URL 构造；仅将计算改为读取 lib 视图模型。所有页面中的 filter / sort / find / some / flatMap 业务计算已移出；slice 展示数量、日期格式化、数字取整、标签与条件展示留在页面。保留原始参数与修剪后参数的使用差异，以及异常筛选优先于 filter 的原有规则。

新增文件：

| 文件 | 职责 |
| --- | --- |
| `lib/period-view.ts` | 周期、任务、目标、Check-in、未汇报范围共用加载；成员筛选 |
| `lib/overview-service.ts` | 总览视图、异常、待我汇报、完成率、达成率、目标卡片数据 |
| `lib/tasks-view.ts` | 任务清单的全部筛选、排序与周期下钻 |
| `lib/check-in-permissions.ts` | RACI 与归属批量快照，内存判断汇报权限 |
| `lib/dashboard-view.ts` | 首页的任务分组、成员责任分组与统计 |
| `lib/task-detail-view.ts` | 任务详情权限、可选协作者、汇报状态、交付与节点统计、快照解析 |
| `lib/objective-detail-view.ts` | 目标详情权限、汇报状态、关联任务、交付与指标计算 |
| `tests/page-views.test.ts` | 临时数据库、真实 seed、完整模型对照、权限与 SQL 计数测试 |
| `tests/fixtures/legacy-page-views.ts` | 从基线 7dfdcc3 页面保留的独立旧计算，作为行为对照 |
| `docs/extract-logic-validation.md` | 本交付记录 |

修改文件：

- `app/(main)/overview/page.tsx`
- `app/(main)/tasks/page.tsx`
- `app/(main)/page.tsx`
- `app/(main)/tasks/[id]/page.tsx`
- `app/(main)/okrs/[id]/page.tsx`
- `lib/tasks.ts`：共用本周完成时间判定及格式化。
- `lib/okr.ts`：statusLabel 复用 statusLabels，保留原三状态及未知值回退文案。
- `lib/task-service.ts`：仅格式化。

异常文案统一读取现有 `lib/overview.ts` 的 exceptionLabels；该文件本身未改动。未修改任何已有测试或其断言、Prisma schema、迁移、依赖清单或锁文件。

主要函数签名（均导出，异步函数返回 Promise；视图模型由 TypeScript 推导）：

```ts
loadOverview(db: CheckInClient, user: Member, params: SearchParams)
loadTaskList(db: CheckInClient, user: Member, params: TaskListParams)
loadPeriodView(db: CheckInClient, params: SearchParams)
loadDashboard(db: CheckInClient, user: Member)
loadTaskDetail(db: CheckInClient, user: Member, id: string, query: SearchParams)
loadObjectiveDetail(db: CheckInClient, user: Member, id: string, params: SearchParams)
loadCheckInAuthorizer(
  db: CheckInClient,
  actor: Pick<Member, "id" | "role">,
  targets: CheckInTarget[],
) // Promise<(scopeType: CheckInScopeType, scopeId?: string | null) => boolean>
matchesTaskPerson(task: OverviewTask, person?: string): boolean
completedThisWeek(task: Pick<Task, "status" | "completedAt">, now?: Date): boolean
parseHistorySnapshot(raw: string): Record<string, unknown> | null
```

CheckInClient 为 PrismaClient 或事务客户端；SearchParams 为 `Record<string, string | string[] | undefined>`；TaskListParams 保留 q/person/area/filter/relation/kind/period/exception 参数；CheckInTarget 为 scopeType/scopeId。

权限优化保留任务主责、TASK R/A、KR 所属目标主责、KR 关联任务主责与 TASK R/A、WORK_PACKAGE R/A 等原有继承规则。任务主责或 TASK R/A 不自动授予父目标权限。C/I、老板、无效对象不授予权限。权限所需关联不受周期、完成或归档筛选限制。服务复用已加载的主责信息，只为待汇报且非本人主责的范围批量取权限；没有循环查库。

以下为 Prisma query 事件统计的实际 SELECT 次数，包含 Prisma 自动合并并发 findUnique 的效果；两种 Node 版本的最终运行结果相同：

| 场景 | 重构前 | 重构后 |
| --- | ---: | ---: |
| 真实 seed，老板周总览，完整加载 | 36 | 34 |
| 真实 seed，okr1 周总览，完整加载 | 46 | 36 |
| 1 个非本人主责任务，权限检查 | 2 | 2 |
| 40 个非本人主责任务，权限检查 | 42 | 2 |
| 扩展数据含额外 40 个任务，okr1 周总览，完整加载 | 88 | 40 |
| 老板批量权限检查 | 0 | 0 |

完整加载含周期树与关联数据查询，因此不是仅 RACI 查询次数。批量权限的 RACI 查询至多一次；归属关系按范围类型批量取出，不再逐条查找。

每次运行均迁移到独立临时 SQLite，再执行真实 `prisma/seed.ts`；全部 Prisma 命令显式使用临时 DATABASE_URL。测试结束断开连接并删除临时库。未使用 prisma/dev.db、未 reset、未执行线上操作。build 同样显式设置指向工作区不存在的 `.validation/unused.db` 的 DATABASE_URL，没有创建或读取业务库。

每个 Node 版本均通过以下逐字段 deepEqual 对照，包含嵌套行、顺序、Map、Set、权限、统计与 URL：

- 真实 seed：老板与 okr1 × 周/月/季 × 无异常及四异常，共 30 个总览 + 30 个任务清单模型。
- 扩展总览：再交叉 person（全部、本人、他人、无效 ID），120 个模型。
- 扩展任务清单：全部 filter（默认、attention、followup、done、closed、archived，含未知值）、q/person/area/relation、周期、异常组合，3920 个模型。
- 上述合计每次 4100 个完整模型对照；另覆盖首页、两个详情页、批量权限与原 canAuthorCheckIn 的逐项对照。
- 边界数据包含已取消、已归档、完成周起点前 1ms / 起点时刻、过期跟进、NO_CHANGE、周期外任务、R/A 与 C/I、失效对象、工作包权限继承。

5 个页面与 7dfdcc3 的 JSX 标签、属性名、静态属性、class/style、编译后的 JSX 文本检查通过；17 个涉及格式化的文件编译后 JavaScript AST 完全一致，包含 JSX 文本与字面量，超过 160 字符的行数为 0。未增加 prettier 或其他依赖。

验收结果：Node v25.8.1 下 npm test、npm run lint、npm run build 均 exit 0；Node v20.20.2 下 npm test、npm run build 均 exit 0。两次 npm test 均 56/56，失败、跳过均为 0。Node 20 对 MockTimers 的 experimental 提示来自测试时钟 API，不影响通过。

最终命令输出末尾：

`node25-test.log`：

```text
✔ 历史迁入与新进展按同一时间类型排序 (14.189042ms)
ℹ tests 56
ℹ suites 0
ℹ pass 56
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36434.069917
```

`lint.log`：

```text

> okr-dashboard@0.1.0 lint
> eslint

```

`node25-build.log`：

```text


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

`node20-test.log`：

```text
1..56
# tests 56
# suites 0
# pass 56
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 35651.081959
```

`node20-build.log`：

```text


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

完整原始输出与结构检查留在 [.validation/](../.validation/)。`git diff --check`、保护文件无差异检查、格式化补丁反向 check 均通过。

建议由总控拆成两个提交：

1. `refactor: extract page view services and batch check-in permissions`：业务逻辑抽取、共用标签、权限批处理、单元与行为对照测试、交付记录。
2. `style: wrap long lines without changing behavior`：独立纯格式化提交。已保留 [.validation/format-only.patch](../.validation/format-only.patch)；总控可先反向应用该补丁形成第一个提交，再正向应用形成第二个提交。补丁包含新增服务与测试文件的格式化，已通过反向检查与编译 AST 一致性验证。`.validation/` 为本机审查证据，不建议随源码提交。

没有未完成的指定验收项或阻碍。没有执行真实浏览器交互验收。本次固定对照基线为 7dfdcc3；运行期间 origin/main 引用已前进到 a102bd5，当前分支显示 behind 4，本工作区没有 fetch、合并或变基，留待总控统一整合。
