# 安全加固第 1 项验收记录

日期：2026-10-16（Asia/Shanghai）。分支：`chore/security`；基线：`18697184e65f01b30175e315602c4acac7736707`。

全部开发、验收在指定 codex 工作区内完成，未访问线上服务器，未修改其他工作区，未合并 main、未开 PR。原有 25 个测试文件及断言未修改；新增 11 个测试，总计 36 个。未修改 `lib/task-service.ts`、`lib/check-in.ts`、`lib/overview.ts`、`prisma/schema.prisma`。未创建或使用 `prisma/dev.db`，所有数据库验证均使用已清理的临时数据库。

## 任务与文件

| 项目 | 修改文件与行为 |
| --- | --- |
| 1. 依赖安全升级 | `package.json`、`package-lock.json`：Next.js / ESLint 配置固定到 npm 查询时最新稳定 16.x `16.4.2`；执行不带 `--force` 的 `npm audit fix`，用 npm 11.11.0 更新锁文件，`npm ci` 成功。 |
| 2. Prisma 配置迁移 | `package.json`、`prisma.config.ts`：移除旧配置，将 seed 命令写入 migrations.seed；显式导入 dotenv/config，保留外部环境变量优先级，保留 Prisma 6 和 schema 中的数据源定义。 |
| 3. Cookie | `lib/auth.ts`：仅 NODE_ENV=production 时设置 secure。 |
| 4. 登录限流 | `lib/actions.ts`、`lib/login-limit.ts`、`tests/login-limit.test.ts`：规范化账号和 XFF 首值组成键，滚动十分钟内第五次失败锁定十分钟；成功清零，锁定请求不延长时间，过期记录按需清理。7 个单元测试覆盖边界和隔离。 |
| 5. 在线备份 | `scripts/backup-db.sh`、`tests/backup-db.test.ts`：Python sqlite3 backup API、只读源库、校验成功后原子发布、文件权限 0600、成功后保留最近 30 份；默认读取根 .env，相对路径基于 prisma/，支持绝对路径。4 个测试覆盖 WAL、路径、轮换、损坏库、缺失库、同秒不覆盖和不执行 .env shell 内容。 |
| 6. CI | `.github/workflows/ci.yml`：Ubuntu + Node 20，依次 npm ci、prisma generate、test、lint、build。 |
| 7. 文档 | `README.md`：部署地址、Python 运行要求、npm ci、每次上线前必须备份、Prisma 配置及限流边界；本记录保留验收证据。 |

## 依赖版本对照

以下为锁文件实际版本；Next 相关 SWC / env / ESLint 插件同步升级。

| 依赖 | 升级前 | 升级后 |
| --- | --- | --- |
| next | 16.3.4 | 16.4.2 |
| eslint-config-next | 16.3.4 | 16.4.2 |
| @next/env、@next/swc-*、@next/eslint-plugin-next | 16.3.4 | 16.4.2 |
| sharp、@img/sharp-*（不含 libvips） | 0.35.4 | 0.35.5 |
| @img/sharp-libvips-* | 1.3.3 | 1.3.4 |
| brace-expansion（顶层） | 1.1.18 | 1.1.21 |
| brace-expansion（typescript-estree 下） | 5.0.9 | 5.0.12 |
| source-map-js | 1.2.1 | 1.2.2 |
| dotenv | 16.6.1（原为传递依赖） | 18.0.8（显式开发依赖） |
| prisma / @prisma/client | 6.19.3 | 6.19.3（保留） |
| react / react-dom | 19.2.8 | 19.2.8（保留） |

其他原有直接依赖版本未变。dotenv 用于 Prisma CLI，部署构建流程需要安装开发依赖（使用 npm ci）。

## 审计与保留漏洞

基线完整审计：1 critical、11 high；最终完整审计：0 critical、8 high；最终 `npm audit --omit=dev`：0 critical、3 high。audit 与 audit fix 因仍有 high 返回退出码 1，满足本次生产依赖无 critical 的验收条件。

剩余是两条传递依赖链的计数，并非 8 个独立根因：

- `deepmerge-ts@7.1.5`（递归对象合并导致栈耗尽，GHSA-ggr8-5vv4-36mx）→ `@prisma/config@6.19.3` → `prisma@6.19.3`：3 high。npm 的自动修复建议为 Prisma 7.10.1，与禁止升级 Prisma 7 冲突。Prisma 同时是 @prisma/client 的 peer，因此 omit=dev 审计仍会报告此链。未强制覆盖传递依赖到不兼容主版本。
- `braces@3.0.3`（深层模式导致栈耗尽，GHSA-vfj7-8cjw-p6xm）→ `micromatch@4.0.8` → `fast-glob@3.3.1` → `@next/eslint-plugin-next@16.4.2` → `eslint-config-next@16.4.2`：开发依赖链计 5 high。npm 建议回退 eslint-config-next 到 14.2.35，破坏与 Next 16 的匹配关系，且不符合本次升级要求，故保留。

依据：npm audit 实际回执；审计会随公告和上游版本变化。未使用 --force 或 overrides。

## 验收命令及输出

本机：Node v25.8.1、npm 11.11.0、Python 3.9.6；兼容性：额外使用 Node v20.20.2。

### npm ci

退出码：0。最后输出：

```text

added 404 packages, and audited 405 packages in 9s

154 packages are looking for funding
  run `npm fund` for details

8 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

### npx prisma generate

退出码：0。最后输出：

```text

Prisma config detected, skipping environment variable loading.
Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client (v6.19.3) to ./node_modules/@prisma/client in 163ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Want to turn off tips and other hints? https://pris.ly/tip-4-nohints
```

### npm test

退出码：0。最后输出：

```text
ℹ tests 36
ℹ suites 0
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1533.160542
```

### npm run lint

退出码：0。最后输出：

```text
> okr-dashboard@0.1.0 lint
> eslint
```

### npm run build

退出码：0。最后输出：

```text
├ ƒ /tasks/[id]
├ ƒ /tasks/new
└ ƒ /week


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

构建关键输出：

```text
✓ Compiled successfully in 5.7s
  Finished TypeScript in 2.4s ...
```

### Node 20: npm test

退出码：0。最后输出：

```text
1..36
# tests 36
# suites 0
# pass 36
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1222.80975
```

### Node 20: npm run build

退出码：0。最后输出：

```text
├ ƒ /tasks/[id]
├ ƒ /tasks/new
└ ƒ /week


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

构建关键输出：

```text
✓ Compiled successfully in 1176ms
  Finished TypeScript in 1385ms ...
```

### npm audit --omit=dev

退出码：1。最后输出：

```text
    prisma  6.13.0-dev.1 - 7.10.0 || 8.0.0-rc.3 - 8.1.0-dev.4
    Depends on vulnerable versions of @prisma/config
    node_modules/prisma

3 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force
```

### 临时库：migrate deploy、db:seed 两次、backup-db.sh、外部 DATABASE_URL 优先

退出码：0。最后输出：

```text
      
All migrations have been successfully applied.
PASS: 自动加载 .env，迁移成功；seed 初始化且二次跳过；外部 DATABASE_URL 优先。
PASS: 直接执行 backup-db.sh，临时库备份含 4 个用户且 integrity_check=ok。
```

Node 20 通过 npm 包提供的实际 Node 二进制执行，将其目录置于 PATH 首位，使 npm / tsx / Next / 测试内启动的 npx 均使用 Node 20。复现：

```bash
TASK_NODE20_BIN="$(npx -y -p node@20 -- node -p 'process.execPath')"
PATH="$(dirname "$TASK_NODE20_BIN"):$PATH" node -v
PATH="$(dirname "$TASK_NODE20_BIN"):$PATH" npm test
PATH="$(dirname "$TASK_NODE20_BIN"):$PATH" npm run build
```

额外检查：`git diff --check`、`bash -n scripts/backup-db.sh` 均通过；原有三个测试文件和四个受保护业务文件与基线完全一致；未遗留根 .env 或 prisma/dev.db。

## 边界

本次无未完成的本机开发验收项。Node 20 验收在本机 macOS 完成；GitHub Actions 的 Ubuntu 作业需由推送触发后在远端观察，本记录不将其表述为已通过。未连接线上服务器，也未执行线上部署或数据库操作。

限流仅适用于单进程内存，重启清零，不支持多进程共享；客户端 IP 优先取 nginx 以 $remote_addr 覆盖的 X-Real-IP，回退取 X-Forwarded-For 最后一个值（首值可被伪造）。总控已核验线上 nginx 设置了 X-Real-IP $remote_addr，而 X-Forwarded-For 使用 $proxy_add_x_forwarded_for。

## 提交与推送阻碍

代码完成后，`git add` 被本机权限阻止，未能创建工作树索引锁：

```text
fatal: Unable to create '/Users/mac/orca/okr-dashboard/.git/worktrees/codex/index.lock': Operation not permitted
```

未生成新提交，也未执行推送；分支 HEAD 仍是基线 `18697184e65f01b30175e315602c4acac7736707`。所有修改保留在当前 codex 工作区。无人值守环境无法获取额外权限，按任务要求在此停止，不尝试绕过文件系统权限。

恢复 Git 写权限后，可按依赖升级、Prisma 配置迁移、Cookie、登录限流、备份脚本、CI、文档分别提交，最后执行 `git push -u origin chore/security`。
