# Magic Compare Workflow Guide

这份文档面向继续接手仓库的开发者、CI 线程和部署线程，整理当前仓库的真实工作流、关键约束和已经踩过的坑。

它不是产品需求文档，而是一份“如何不把现有链路做坏”的工程说明。

## 这份文档基于哪些资料

本轮整理前已阅读：

- `docs/project-overview-guide.md`
- `docs/demo-vs-real-case-flow.zh-CN.md`
- `docs/ui-improvements/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/ui-improvements/2026-03-20-frontend-refresh.zh-CN.md`
- `README.zh-CN.md`

另外还核对了当前仓库中的运行入口与部署文件：

- `.env.example`
- `package.json`
- `apps/internal-site/package.json`
- `docker-compose.yml`
- `docker/internal-site.Dockerfile`
- `scripts/export-public.ts`
- `scripts/deploy-public.ts`
- `scripts/sync-published.mjs`
- `apps/internal-site/lib/server/public-site/runtime.ts`

## 先看结论

- `internal-site` 是带服务端能力的 Next.js 站点，不是纯前端。
- `public-site` 是静态导出目标，构建产物可直接推到 Cloudflare Pages。
- 内部原图、缩略图和 heatmap 已经统一走 S3-compatible 存储，不再使用 `.runtime` 或 `public/internal-assets`。
- demo 是受控样本，不代表真实业务导入流程。
- 真实内容的链路是：`uploader -> S3 -> import-sync -> internal-site -> case-publish -> public-export/public-deploy`。
- `public-export` 和 `public-deploy` 必须显式触发，它们不是 `case-publish` 的隐式副作用。

## 当前架构中的真实分工

### internal-site

`internal-site` 负责：

- internal catalog
- case workspace
- group viewer
- `app/api/ops/*` 内部接口
- SQLite / Prisma metadata
- S3 内部素材读写
- publish bundle 生成
- public-site 静态导出与 Pages 部署触发

它是“内部工作站点 + 服务端控制面”。

### public-site

`public-site` 负责：

- 读取 `content/published/groups/*/manifest.json`
- 静态导出公开页面
- 公开访问 `/g/[publicSlug]`

它不承担上传、数据库写入或内部管理逻辑。

## 三类数据分别存在哪里

### 1. 内部 metadata

默认在 SQLite：

- 宿主机本地开发：`DATABASE_URL=file:./dev.db`
- Docker：`MAGIC_COMPARE_DOCKER_DATABASE_URL=file:/app/data/sqlite/internal-site.db`

### 2. 内部素材

统一在 S3-compatible 存储：

- bucket 由 `MAGIC_COMPARE_S3_BUCKET` 指定
- endpoint 由 `MAGIC_COMPARE_S3_ENDPOINT` 指定
- 浏览器访问图片时使用 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL`
- key 前缀默认是 `internal-assets`

重要约束：

- 不要再把内部素材写回 `.runtime`
- 不要再依赖 `apps/internal-site/public/internal-assets`

### 3. 已发布 bundle

发布后的公开 bundle 落在：

- `MAGIC_COMPARE_PUBLISHED_ROOT/groups/[publicSlug]/manifest.json`
- `MAGIC_COMPARE_PUBLISHED_ROOT/groups/[publicSlug]/assets/*`

如果 `MAGIC_COMPARE_PUBLISHED_ROOT` 留空：

- 宿主机默认用仓库内的 `content/published`

Docker compose 会自动把它指向持久化卷路径：

- `/app/data/published`

### 4. 公开站静态导出结果

由 `public-export` 生成到：

- `MAGIC_COMPARE_PUBLIC_EXPORT_DIR`

如果留空：

- 宿主机默认导出到 `dist/public-site`

Docker compose 会把它指向：

- `/app/data/public-export`

## demo 和真实业务对象的区别

这一点很重要，不能混。

### demo 是什么

demo 是仓库内置样本，用于：

- 首次启动后立刻有一组可看的内容
- internal-site UI 联调
- public-site 静态导出回归验证
- Docker 启动后的最小可用演示

当前固定标识：

- case slug: `demo-grain-study`
- group slug: `banding-check`
- public slug: `demo-grain-study--banding-check`

### demo 不是正常导入流程

demo 来自：

- `apps/internal-site/prisma/demo-assets/`

由以下命令维护：

```bash
pnpm db:seed
```

`db:seed` 会：

1. 确保 demo metadata 存在
2. 把 demo 素材上传到 S3
3. 重建或修复 demo 的 case / group / frame / asset
4. 刷新 demo 的 published bundle

### 真实 case / group 来自哪里

真实内容来自：

- `magic-compare-uploader`
- `POST /api/ops/import-sync`

它们不是仓库样本，而是实际工作数据。

更详细的区别参见：

- `docs/demo-vs-real-case-flow.zh-CN.md`

## 本地开发的最小闭环

当前最小依赖不是只有 Next.js。

### internal-site 本地开发至少需要

- `next dev`
- 一个可用的 SQLite 数据库
- 一个可用的 S3-compatible 存储

也就是说，本地只起 `pnpm dev:internal` 但没有 S3，不算完整开发环境。

### 推荐启动顺序

```bash
cp .env.example .env
docker compose up -d rustfs rustfs-init
pnpm install
pnpm db:push
pnpm dev:internal
```

当前行为：

- `pnpm dev:internal` 会在数据库为空时自动执行首次 `db:push + db:seed`
- 但 demo seed 依赖 S3，所以 `rustfs` 必须先可用

如果没有先起 S3，最常见现象是：

- demo 页面可打开，但图片 404
- 或 seed 直接失败

## Docker 生产运行的真实路径

### 推荐入口

```bash
docker compose up -d rustfs rustfs-init internal-site
```

如果是本地开发，并且你需要直接查看宿主机里的持久化目录，可改用：

```bash
docker compose -f docker-compose.yml -f docker/dev.compose.override.yml up -d --build rustfs rustfs-init internal-site
```

或者直接使用根脚本：

```bash
pnpm docker:dev:up
```

compose 当前会做这些事：

- 启动 `rustfs`
- 用轻量 `rustfs-init` sidecar 自动确保 bucket 存在
- 运行一次性的 `internal-site-init`，完成 `db:push` 和 `db:seed`
- 启动 `internal-site`

说明：

- 基础 `docker-compose.yml` 默认通过 `MAGIC_COMPARE_INTERNAL_SITE_IMAGE` 拉取 GHCR 运行时镜像
- `docker/dev.compose.override.yml` 才会把 `internal-site` / `internal-site-init` 切换成本地 `build`
- `internal-site` 容器本身只负责：

```bash
pnpm --filter @magic-compare/internal-site start
```

### 当前 Docker 里的持久化目录

- 默认 compose：Docker named volumes
  - `rustfs-data:/data`
  - `internal-data:/app/data`
- 本地开发可选：
  - `docker/dev.compose.override.yml`
  - 该 override 会把数据重新映射回 `./docker-data/**`

所以这些内容不会因为容器重启而丢失：

- SQLite
- published bundle
- public export 目录
- S3 数据

### Docker 中最容易踩的坑

#### 1. 不能把宿主机的 S3 endpoint 直接给容器用

宿主机本地开发时：

- `MAGIC_COMPARE_S3_ENDPOINT=http://localhost:9000`

但容器内不能继续用这个地址，因为容器里的 `localhost` 指向它自己。

Docker compose 已经单独提供：

- `MAGIC_COMPARE_DOCKER_S3_ENDPOINT=http://rustfs:9000`

#### 2. Docker 数据库路径必须走 Docker 专用 env

宿主机用：

- `DATABASE_URL=file:./dev.db`

Docker 用：

- `MAGIC_COMPARE_DOCKER_DATABASE_URL=file:/app/data/sqlite/internal-site.db`

否则数据库会落在容器内部临时层，不利于持久化和排障。

## 上传链路的真实顺序

当前 uploader 是一站式中文 CLI。

真实导入链路是：

1. 扫描源素材目录
2. 自动识别 `before / after / misc / heatmap`
3. 生成工作目录与 metadata
4. 打开编辑器确认 `case.yaml / group.yaml`
5. 生成缩略图和 heatmap
6. 直接上传内部素材到 S3-compatible 存储
7. 构造 `ImportManifest`
8. 调用 `POST /api/ops/import-sync`
9. internal-site upsert case / group / frame / asset

关键约束：

- uploader 现在不再把图先落到 internal-site 本地目录
- 内部图片 URL 仍然保留逻辑路径 `/internal-assets/...`
- 浏览器实际访问图片时，会由 internal/public 站点将逻辑路径解析成 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL` 下的公网绝对 URL
- public-export/public-deploy 不再打包图片，Pages 只发布静态页面和 manifest

## 发布、导出、部署三件事要分清

### 1. publish case

作用：

- 把当前 case 中 `isPublic=true` 的内容写成 published bundle

入口：

- `POST /api/ops/case-publish`

结果：

- `content/published` 或 `MAGIC_COMPARE_PUBLISHED_ROOT` 更新

它**不会**自动部署公开站。

### 2. public export

作用：

- 从已发布 bundle 重新构建整个公开静态站

入口：

- `pnpm public:export`
- `POST /api/ops/public-export`

结果：

- 导出到 `MAGIC_COMPARE_PUBLIC_EXPORT_DIR`

### 3. public deploy

作用：

- 先做一次 fresh export
- 再调用 Wrangler 上传到 Cloudflare Pages

入口：

- `pnpm public:deploy`
- `POST /api/ops/public-deploy`

依赖 env：

- `MAGIC_COMPARE_CF_PAGES_PROJECT_NAME`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

必要时还可以有：

- `MAGIC_COMPARE_CF_PAGES_BRANCH`

## public-site 的真实路由约束

公开站的规范入口是：

- `/g/[publicSlug]`

例如：

- `/g/demo-grain-study--banding-check`

兼容路径：

- `/cases/[caseSlug]/groups/[groupSlug]`

目前是页面级自动跳转，用于兼容旧分享习惯；它不是公开站的规范数据结构入口。

因此：

- 不要在新的部署或分享流程中继续把 `/cases/.../groups/...` 当主地址
- CI / Pages smoke test 应优先验证 `/g/[publicSlug]`

## 已经踩过的坑

### 1. `next start` + 本地 `public/` 新增文件会 404

这条旧链路已经废弃。现在内部素材统一走 S3，避免运行中写本地静态资源目录的缓存问题。

经验教训：

- 运行时会新增的内部素材，不要再放 `public/`

### 2. `public-site` 开启 `output: "export"` 后，动态路由必须能静态枚举

公开站的构建依赖：

- 已存在的 published groups
- `generateStaticParams()`

如果 published bundle 为空，构建或部署容易报出误导性错误。

经验教训：

- `public-export` / `public-deploy` 前先确保至少有一个 published group

### 3. public export / deploy 不能并发

之前重复点击触发过：

- `.next` 缓存冲突
- 部署流程互相踩目录

当前已经有服务端串行锁，但 CI 侧仍然不应该主动并发触发两个 public 部署任务。

### 4. demo 的图片可见性依赖 S3，不是只依赖 seed

以前容易误以为“只要数据库有 demo 记录，viewer 就会正常”。

实际上：

- demo metadata 在库里
- demo 图片在 S3

两者缺一不可。

### 5. viewer 主舞台与胶片带不能再回到黑盒轮播

这条是前端重要经验：

- 主舞台尺寸必须自控
- 胶片带底层必须是真滚动
- `fit` 必须是原位适配
- heatmap 必须和基底图共享同一 media rect

更详细说明见：

- `docs/ui-improvements/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/ui-improvements/2026-03-20-frontend-refresh.zh-CN.md`

## 给 CI / Docker 发布线程的建议

如果另一条线程要维护 `.github/workflows/ci.yml` 和 `.github/workflows/ghcr-docker.yml`，建议遵守这些边界：

补充复盘文档：

- `docs/ci-ghcr-lessons.zh-CN.md`

### CI 验证优先级

`ci.yml` 当前分成两个 job。

第一段 `verify` 优先验证：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

第二段 `public-export-demo` 负责补上 demo 导出闭环：

```bash
docker compose -f docker-compose.yml -f docker/ci.compose.override.yml up -d rustfs rustfs-init
pnpm db:push
pnpm db:seed
pnpm public:export
```

关键约束：

- CI 不应假设 checkout 后已经有 published group
- 应从临时 SQLite 和运行时 seed 出来的 demo 数据开始验证
- `MAGIC_COMPARE_HIDE_DEMO=false` 应显式写入 CI 环境
- 导出成功后最好保留日志和导出产物，便于排错

### Docker 镜像构建与发布入口

当前标准入口：

```bash
pnpm docker:build:internal
```

等价于：

```bash
docker build -f docker/internal-site.Dockerfile -t magic-compare/internal-site .
```

`ghcr-docker.yml` 当前建议分成两段：

1. `smoke`

- 先用 `docker compose` 跑通 `rustfs -> rustfs-init -> internal-site`
- 只验证运行路径和健康探活，不替代 `public:export`
- 失败时保留 compose 日志

2. `publish`

- 只有 `smoke` 成功后才推 GHCR
- `main` 标签只允许从 `main` 分支发布
- 手动触发如果不在 `main`，也不应覆盖 `main` 镜像标签

### 不要在 CI 里假设这些目录永远存在

- `content/published`
- `dist/public-site`
- `apps/public-site/public/published`

它们都可能在构建前为空，需要由导出流程生成。

### 对 public deploy 的建议

- `publish case` 和 `public deploy` 应拆开
- Pages 部署 job 不要并发
- 优先把 export 结果作为可观察产物保留下来，便于排错
- CI 中不要直接复用本地 `docker-data` bind mount；优先走基础 compose 的 named volumes，必要时再叠加专用 override

## 推荐的协作顺序

### 做前端或 viewer

先看：

- `docs/project-overview-guide.md`
- `docs/ui-improvements/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/ui-improvements/2026-03-20-frontend-refresh.zh-CN.md`

### 做 uploader 或导入链路

先看：

- `docs/vseditor-workflow.zh-CN.md`
- `docs/demo-vs-real-case-flow.zh-CN.md`
- `tools/uploader/README.md`

### 做部署、Docker、Pages、CI

先看：

- `README.zh-CN.md`
- `.env.example`
- `docker-compose.yml`
- `docker/dev.compose.override.yml`
- `docker/ci.compose.override.yml`
- `docker/internal-site.Dockerfile`
- `apps/internal-site/lib/server/public-site/runtime.ts`
- `docs/ci-ghcr-lessons.zh-CN.md`

## 一句话版本

把这个仓库理解成三段最安全：

1. `uploader + S3` 负责把真实素材变成内部可读内容
2. `internal-site` 负责管理、查看、发布和导出
3. `public-site` 只负责静态消费已发布 bundle

只要不把这三段重新揉成一团，就不容易回到之前那些 404、空导出、并发部署和 viewer 布局失控的问题里。
