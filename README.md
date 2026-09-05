# OKR 面板

老板与管理层共用的周任务 / OKR 进度面板。当前版本在本机运行，代码放在 GitHub 私有仓库，方便换电脑继续迭代。

## 本机启动

```bash
git clone https://github.com/maxkitty-20172020/okr-dashboard.git
cd okr-dashboard
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

`.env` 里的 `AUTH_SECRET` 请改成一段随机字符串。`DATABASE_URL` 默认使用本地 SQLite 文件 `prisma/dev.db`，这个文件不会进 Git。

## 演示账号

初始密码均为 `okr12345`：

- 老板：`boss@okr.local`（陈总）
- 管理层：`li@okr.local`（李明）、`wang@okr.local`（王芳）、`zhao@okr.local`（赵强）

改姓名或账号：编辑 `prisma/seed.ts`，然后重新执行 `npx prisma db seed`。

## 换电脑继续开发

```bash
git pull
npm install
cp .env.example .env   # 若这台电脑还没有 .env
npx prisma migrate dev
npx prisma db seed     # 仅在需要重新灌入演示数据时
npm run dev
```

SQLite 数据在本机，不会随 Git 同步。换电脑后是一份新的本地数据；以后若要多人同时在线使用，再部署并换成 Postgres。

## 功能

- 登录后查看全部 Objective / Key Result 进度
- 按自然周填写、更新、删除任务
- 新增和编辑 OKR
- 四位管理层看到同一份数据

## 常用命令

```bash
npm run dev          # 本地开发
npm run db:seed      # 重新写入演示数据
npm run build        # 生产构建
```
