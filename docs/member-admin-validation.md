# 成员管理交付与验收记录（2026-10-16）

工作目录 `/Users/mac/orca/workspaces/okr-dashboard/codex`，分支 `feat/member-admin`，基线 `origin/main eee3cd2`。起始工作区干净；未切换分支，未提交或推送，未访问线上系统或应用数据库，未使用或创建 `prisma/dev.db`，未执行数据库重置。

## 验收结论

代码与迁移已实现；单元、lint、TypeScript、生产构建及迁移演练通过。**浏览器验收未通过，不能作为可上线的完整验收结果。** `npm run test:e2e` 的 8 项测试在启动 Chromium 时全部失败，均未执行页面断言：

```text
FATAL:base/apple/mach_port_rendezvous_mac.cc:159
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>: Permission denied (1100)
8 failed
```

macOS 当前执行沙箱禁止 Chromium Mach bootstrap 注册，且本次环境禁止提升权限，故停止浏览器重试。初次 Next dev 的 FSEvent 和 EMFILE 问题通过测试服务器改用 webpack + Watchpack 轮询解决，测试服务器与独立数据库初始化已成功。此配置只影响 e2e 启动，不修改默认开发/构建命令。

总控须在允许 Playwright Chromium 启动的环境重跑 `npm run test:e2e`；新成员端到端测试尚无真实页面执行证据，浏览器渲染、交互与表单 Cookie 轮换仍待该验收确认。

## 改动文件清单

- `AGENTS.md`
- `README.md`
- `app/(main)/members/page.tsx`
- `app/(main)/page.tsx`
- `app/(main)/tasks/new/page.tsx`
- `app/account/page.tsx`
- `components/app-shell.tsx`
- `components/nav-links.tsx`
- `docs/member-admin-validation.md`
- `e2e/members.spec.ts`
- `lib/actions.ts`
- `lib/auth.ts`
- `lib/login-credentials.ts`
- `lib/member-actions.ts`
- `lib/member-service.ts`
- `lib/member-view.ts`
- `lib/session-token.ts`
- `lib/task-detail-view.ts`
- `lib/task-service.ts`
- `playwright.config.ts`
- `prisma/migrations/20261016120000_member_admin/migration.sql`
- `prisma/schema.prisma`
- `proxy.ts`
- `scripts/rehearse-member-migration.ts`
- `tests/member-service.test.ts`
- `tests/tasks.test.ts`

`AGENTS.md` 仅为 Next dev 自动将规则标题从一级调整为二级，按文件内指令保留自动生成块。

已有 `tests/tasks.test.ts` 只在临时库初始化时追加新迁移，未修改任何现有断言。未新增依赖或 UI 库。

## 迁移 SQL

`prisma/migrations/20261016120000_member_admin/migration.sql`：

```sql
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
```

不重建表，不删除或修改已有字段、哈希、账号、任务或关系。旧用户新增字段默认 null / null / false。

## 关键设计

1. 所有成员管理事务先按操作者 ID 查库确认未停用的 BOSS；客户端传入的角色不作为授权依据。事务结束前校验至少一位未停用老板，禁止自停用和自降级。停用统计所有状态非 DONE/CANCELLED 的主责任务，数量大于零时整体回滚并提示先移交。
2. 原有 compact / normalizeLogin 抽到 `lib/login-credentials.ts`，登录与成员服务共用，登录路径的密码恰好规范化一次，保留中间空格和旧账号密码行为。新增/重置密码用 bcrypt cost 10。新增密码按规范化后的 Unicode 字符数校验 8–72 字符。
3. `getSession` 与 proxy 共用 `sessionFromToken`：验签后查库读取当前身份，停用立即失效。iat 使用秒单位但保留毫秒小数，并与 passwordChangedAt 的毫秒修订号一起校验；同秒甚至同毫秒连续重置均不会放行旧 token。未改密的旧格式 JWT 继续有效。proxy 同样检查失效状态并清除旧 Cookie，防止 /login 与 / 重定向循环。
4. passwordChangedAt 同时作为会话撤销边界，停用也推进该时间，保证再次启用不会复活旧 Cookie；不修改密码哈希、不额外要求改密。本人改密需当前密码且新旧不同，清除 mustChangePassword，Action 重新签发本设备 Cookie，其余设备失效。
5. 强制改密统一在 requireSession 拦截，涵盖主页面与业务 Action；`/account` 放在 (main) 外且显式允许改密会话，避免重定向循环。管理页面服务查询位于 `lib/member-view.ts`，操作位于成员服务/Action。
6. 任务负责人及协作者的服务端选择校验与新建/编辑/协作选项均排除已停用用户。筛选、任务、进展、Check-in 等历史用户关系不删除且继续显示姓名。老板原有 requireWriter / writableUser 业务写入限制保留。

## 测试范围与命令回执

新增 `tests/member-service.test.ts` 共 12 项测试，覆盖：所有管理操作的非老板/伪造角色/停用老板拒绝；账号规范化、重复与格式；姓名/角色校验；密码字符数边界、cost 10；最后老板、自停用/自降级；未结束任务数量与移交；启停和原密码；重置旧 token 失效；本人当前密码/新旧不同/新 token；同秒精度、旧格式 token 与查库角色；停用者任务分工和下拉排除；不存在目标及失败原子性。完整测试套件为 68 项。

新增 `e2e/members.spec.ts` 已编写老板创建、新成员强制改密、工作台、成员无管理权限、其他设备会话失效、老板重置、停用及登录限流流程。登录辅助函数在访问下一页前显式等待 URL 跳转完成；独立浏览器上下文设置本机 baseURL。此测试未实际进入浏览器执行。

默认环境 Node v25.8.1：

```text
$ npm test
ℹ tests 68
ℹ suites 0
ℹ pass 68
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 39970.725375
(exit 0)

$ npm run lint
> okr-dashboard@0.1.0 lint
> eslint
(exit 0)

$ npm run build

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
(exit 0，编译、TypeScript、静态页生成均通过)

$ npm run test:e2e
8 failed
(Chromium 启动被沙箱拒绝，未进入页面断言，exit 1)
```

Node v20.20.2 通过临时 `npm exec --package=node@20` 安装并将该可执行文件目录置于 PATH 首位后运行，未改变项目依赖：

```text
$ npm test
  ...
1..68
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 35189.632584
(exit 0)

$ npm run build

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
(exit 0，编译、TypeScript、静态页生成均通过)
```

`npx tsc --noEmit` 与 `git diff --check` 均 exit 0。完整本机命令日志暂存 `/tmp/okr-member-{test,lint,build,e2e,node20-test,node20-build,migration}.log`。

## 临时库迁移演练

```bash
npx tsx scripts/rehearse-member-migration.ts
```

脚本从当前 origin/main 提取旧迁移及旧 schema 到临时目录，先 migrate deploy，再写入 4 个账号、3 项任务、3 条进展；然后拷入本次新迁移并再次 migrate deploy。逐表查询迁移前的全部原有列，迁移后逐值比较，不输出密码哈希。最终删除临时库。结果：

```text
origin/main: eee3cd2
Applied old migrations, inserted 4 users + 3 tasks + 3 progress records, then deployed 20261016120000_member_admin.
PASS: 12 application tables preserved across all original columns.
PASS: 4/4 original passwords, short accounts and full-width/whitespace password normalization authenticate (8 checks).
PASS: all existing users disabledAt=null, passwordChangedAt=null, mustChangePassword=false.
PASS: PRAGMA integrity_check=ok; foreign_key_check=0 violations.
Temporary database removed on exit; no configured application database used.
```

## 上线步骤（本次未执行）

1. 先在允许 Chromium 的本机/CI 环境通过全部 e2e，再由总控审查本工作区。
2. 按现有流程暂停业务写入，保留原 DATABASE_URL、AUTH_SECRET；执行 `./scripts/backup-db.sh`，确认备份完整性检查成功。
3. 部署审查后的代码，使用 Node 20.9+ 执行：

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
```

4. 按现有流程重启 systemd。用已有老板和填报账号验证原密码/短账号登录、业务权限、历史任务显示，并验证成员管理与首次改密流程。无需 seed、reset 或改动原账号密码。

**上线需要执行 prisma migrate deploy，本次有新迁移。** 先迁移再运行新版，不要仅替换代码和重启。

## 建议提交拆分

1. `feat(auth): add member state migration and revocable password sessions`：schema、迁移、登录规范化、auth/session-token、login Action 与 proxy。
2. `feat(members): add boss administration and account password flow`：member service/view/actions、页面、导航、首页无权限提示和停用任务分工拦截。
3. `test(members): cover permissions sessions and safe upgrades`：新单元/e2e、旧测试初始化追加迁移、迁移演练脚本、Playwright 轮询配置、README 与本记录，包含 Next 自动 AGENTS 标题变动。

无 git commit / git push；代码保留待审查。未完成：真实浏览器验收。其余无待确认的产品规则。
