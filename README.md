# 运营部 · 任务与进展

用于业务、团队和库存管理的部门事项看板。成员记录任务及协作交付，老板查看部门全貌。

已部署在 [okr.zungyunai.top](https://okr.zungyunai.top)。线上使用腾讯云 Ubuntu 22.04、Node.js 20、systemd 和 nginx HTTPS 反向代理，Next.js 监听 `127.0.0.1:3001`。

## 启动与升级

运行环境需要 Node.js 20.9 或更高版本，以及 `python3`（数据库在线备份和测试使用，不依赖 sqlite3 命令行工具）。全新安装：

```bash
npm ci
cp .env.example .env  # 已有配置请保留，不要覆盖
npx prisma migrate deploy
npx prisma generate
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。保留原来的 `AUTH_SECRET` 和 `DATABASE_URL`；新安装时将 `AUTH_SECRET` 改为随机字符串。

已有数据升级使用 `prisma migrate deploy`，不要使用数据库重置命令。迁移保留任务 ID、原负责人、原所属周、状态和目标关联；旧任务的完成时间沿用原记录更新时间，并在历史记录中说明。不会给旧任务自动生成虚假的进度确认。

SQLite 默认位于 `prisma/dev.db`。升级前应使用 SQLite backup 方式备份，运行期间不要仅复制主文件而遗漏 WAL。代码提交到 Git 不会同步数据库。

**每次上线前必须先执行 `scripts/backup-db.sh`，确认成功后再升级和迁移：**

```bash
./scripts/backup-db.sh
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
# 按服务器现有流程重启 systemd 服务
```

脚本读取项目根目录 `.env` 的 `DATABASE_URL`；`file:./dev.db` 相对 `prisma/`，也支持绝对路径。备份默认保存为 `~/okr-backups/okr-YYYYMMDD-HHMMSS.db`，完成后执行 `PRAGMA integrity_check`，失败会以非零状态退出，且不清理旧备份；成功后只保留最近 30 份。同一秒重复执行会报错，避免覆盖已有备份。可用 `BACKUP_DIR=/其他目录 ./scripts/backup-db.sh` 覆盖输出目录。全新空库请先完成安装，之后每次上线均需备份。

Prisma 6 的 seed 配置位于 `prisma.config.ts`，显式加载根目录 `.env`，外部设置的 `DATABASE_URL` 优先。保留 Prisma 6，不执行数据库重置。

生产环境的会话 Cookie 仅通过 HTTPS 发送。登录按规范化账号 + 客户端 IP 计数（优先取 nginx 设置的 `X-Real-IP`，否则取 `X-Forwarded-For` 最后一个值），十分钟内失败五次锁定十分钟，成功清零；该限制仅保存在单进程内存中，重启清零，不支持多进程共享。nginx 须设置 `proxy_set_header X-Real-IP $remote_addr;`（线上已配置）。

## 周期、WBS、RACI 与 Check-in

数据模型见上一版：Period（周 / 月 / 季）、WorkPackage / Deliverable、RACI（与账号角色分开）、Check-in（无行 = 未汇报）。本版在此之上提供周期汇报页面与老板下钻，不改表结构，也不做数据库重置。

- **Period**：周 / 月 / 季树（Week→Month→Quarter）。季度标签与原 `cycle` 字符串一致（如 `2026-Q3`），月份为 `2026-09`，周为 ISO 周标签（如 `2026-W37`），日历与 `lib/week.ts` 对齐，业务时区仍为 Asia/Shanghai。
- **Check-in**：周更新按任务、月复盘按关键结果、季评估按目标。`SUBMITTED` 为提交进展事实，`NO_CHANGE` 为确认暂无变化。任务进展审计仍用 `TaskUpdate`。
- 例行任务可以不挂 `keyResultId`：计入任务完成率，不计入 KR 达成率。

`TaskCollaborator` / `TaskMilestone` 保留；协作者交付文案会复制一份到 `Deliverable`，原协作行不删除。完整 WBS 编辑、成员邀请和通知仍不在本版。

## 周期汇报与老板下钻

- **周期总览** [`/overview`](/overview)：周更新 / 月复盘 / 季评估，用 `ensurePeriodTree` 保证当前周、月、季存在。地址参数 `kind`、`period`、`exception`、`person` 可原样带回。
- **Check-in**：范围为任务 / 关键结果 / 目标。没有对应行就是「未汇报」，不会自动生成空记录。「确认暂无变化」(`NO_CHANGE`) 与未汇报不是一回事。
- **管理层**：可为主责，或担任 RACI 负责人 R / 问责人 A 的范围提交汇报。账号角色（老板只读 / 管理层可写）与 RACI 分工不是一回事。
- **老板**：同一总览只读。异常芯片（风险 / 逾期 / 未汇报 / 待确认）进入筛选后的 [`/tasks`](/tasks)，再进入任务详情查看协作、交付物和 Check-in 历史；返回时保留周期与筛选。
- **目标下钻** [`/okrs/[id]`](/okrs)：关联任务、交付物、KR / 目标汇报。任务完成率与 KR 达成率分开显示。

### 主要路由

| 路径 | 说明 |
| --- | --- |
| `/` | 工作台 / 部门全貌 |
| `/overview?kind=WEEK&period=2026-W37` | 周期汇报总览 |
| `/tasks?kind=WEEK&period=2026-W37&exception=unreported` | 带周期与异常筛选的任务清单 |
| `/tasks/[id]?kind=WEEK&period=2026-W37` | 任务详情（含 Check-in、交付物；返回保留筛选） |
| `/okrs/[id]?kind=QUARTER&period=2026-Q3` | 目标下钻 |

## 初次体验

仅空数据库可以初始化演示数据：

```bash
npm run db:seed
```

- 老板：`okr`（陈总），只读。
- 填报成员：`okr1`（李明）、`okr2`（王芳）、`okr3`（赵强）。
- 演示密码：`okr12345`，支持短账号或完整邮箱登录。

`seed` 检测到已有账号会直接退出，不会重置任务或改名。页面按实际账号动态显示，没有三人或四人上限。账号邀请和成员管理页面尚未包含在这一版。

## 第一版工作流程

1. 创建任务：填写责任领域、主负责人、完成标准、下一步动作和跟进日期；完成期限可暂时留空。
2. 安排协作：主负责人指定协作者、交付内容和期限。协作者只能更新自己的交付。
3. 持续跟进：主负责人记录整体进展，或选择「确认暂无变化」。暂无变化只记录确认并调整跟进日期，不覆盖已有进展事实。
4. 长期事项按关键节点推进，节点或个人交付完成都不会自动把整体任务标为完成。
5. 完成或取消后可以归档，也可以恢复或重新开启，历史记录持续保留。

首页及任务清单按所有未结束事项查询，不按自然周隔断任务；周期汇报页按周 / 月 / 季查看。旧 `/week` 链接会转到任务清单。周完成数仅统计完成时间位于本周的任务。日期以 Asia/Shanghai 为业务时区。

风险、整体逾期和跟进确认到期分别显示。刚创建或移交的任务显示「情况待确认」，不会自动宣称按计划。

## 权限与保存

- 老板账号：读取总览、任务详情及目标，所有业务写入在服务端禁止。
- 填报成员：可创建任务、维护资料和调整分工；主负责人更新整体进展、安排协作和关键节点；协作者更新自己的交付。
- 移交会清除当前确认标记，由新负责人重新确认。原老板名下的历史任务保留，由填报成员移交接手。
- 每次更新与历史记录在同一事务保存。表单携带版本号，旧页面提交会提示刷新，不会覆盖别人刚保存的修改。
- 任务采用归档保留机制；原有目标编辑功能仍保留。

目标支持「提升」和「降低」两种方向及起点值。例如 ACOS 起点 35、目标 25、当前 30 的进度为 50%。不能将不同指标的百分比简单当作部门总体表现。

本版包含页面内到期跟进提示；定时外部通知、周期任务自动生成和独立复盘快照安排在后续版本。多人异地使用请访问已部署的同一服务，并做好数据库备份。

## 验证

```bash
npm ci
npx prisma generate
npm test
npm run lint
npm run build
```

测试使用独立临时 SQLite 数据库，覆盖迁移保留、跨周任务、多人协作、老板写入拦截、跟进确认、并发版本冲突、日期校验、归档恢复、降低类指标，以及 Period 树、目标周期回填、RACI 默认值、Check-in 未汇报 / 暂无变化 / 老板不可写，和任务完成率 / KR 达成率。

新增测试覆盖登录限流的滚动窗口、锁定时长、成功清零和账号/IP 隔离，以及备份脚本的 WAL 在线备份、完整性检查、路径解析和轮换。备份测试使用临时项目和临时数据库，输出目录由 `BACKUP_DIR` 指定，不写入 `~/okr-backups`。GitHub Actions 在 Node.js 20 上依次执行上述命令。
