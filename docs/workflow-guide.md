# Magic Compare Workflow Guide

这份文档面向继续接手仓库的开发者、CI 线程和部署线程，整理当前仓库的真实工作流、关键约束和已经踩过的坑。

它不是产品需求文档，而是一份“如何不把现有链路做坏”的工程说明。


## 先看结论

- `internal-site` 是带服务端能力的 Next.js 站点，不是纯前端。
- `public-site` 是静态导出目标，构建产物可直接推到 Cloudflare Pages。
- 内部原图、缩略图和 heatmap 已经统一走 S3-compatible 存储，不再使用 `.runtime` 或 `public/internal-assets`。
- demo 是受控样本，不代表真实业务导入流程。
- 真实内容的链路是：`uploader -> group-upload-start -> frame prepare/upload/commit -> group-upload-complete -> internal-site -> case-publish -> public-export/public-deploy`。
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
- 逻辑路径当前统一落在 `/groups/<group-storage-uuid>/<frame-order>/<frame-revision-uuid>/...`

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

`db:seed` 会在 demo 可见且外部对象存储配置齐全时执行，并且它会：

1. 确保 demo metadata 存在
2. 把 demo 素材上传到 S3
3. 重建或修复 demo 的 case / group / frame / asset
4. 刷新 demo 的 published bundle

### 真实 case / group 来自哪里

真实内容来自：

- `magic-compare-uploader`
- `POST /api/ops/group-upload-start`
- `POST /api/ops/group-upload-frame-prepare`
- `POST /api/ops/group-upload-frame-commit`
- `POST /api/ops/group-upload-complete`

它们不是仓库样本，而是实际工作数据。

更详细的区别参见：

- `docs/reference/demo-vs-real.zh-CN.md`

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
pnpm install
pnpm db:push
pnpm dev:internal
```

当前行为：

- `pnpm dev:internal` 总会先执行 `db:push`
- 只有当 demo 未隐藏且外部 S3/R2 配置齐全时，才会继续 `db:seed`

如果没有配置外部对象存储，internal-site 仍可启动，但不会自动补 demo 图片数据。

## Docker 生产运行的真实路径

### 推荐入口

```bash
docker compose up -d internal-site
```

如果是本地开发，并且你需要直接查看宿主机里的持久化目录，可改用：

```bash
docker compose -f docker-compose.yml -f docker/dev.compose.override.yml up -d --build internal-site
```

或者直接使用根脚本：

```bash
pnpm docker:dev:up
```

compose 当前会做这些事：

- 运行一次性的 `internal-site-init`，完成 `db:push`
- 仅当 demo 可见且外部对象存储配置齐全时，继续 `db:seed`
- 启动 `internal-site`

说明：

- 基础 `docker-compose.yml` 默认通过 `MAGIC_COMPARE_INTERNAL_SITE_IMAGE` 拉取 GHCR 运行时镜像
- `docker/dev.compose.override.yml` 才会把 `internal-site` / `internal-site-init` 切换成本地 `build`
- 数据目录现在统一通过 `.env` 控制；留空时走 Docker named volumes，填写宿主机路径时走 bind mount
- `internal-site` 容器本身只负责：

```bash
pnpm --filter @magic-compare/internal-site start
```

### 当前 Docker 里的持久化目录

- 默认 compose：Docker named volume
  - `internal-data:/app/data`
- 如需把数据直接写到宿主机目录，在 `.env` 里设置：
  - `MAGIC_COMPARE_INTERNAL_DATA_MOUNT=./docker-data/internal-data`

所以这些内容不会因为容器重启而丢失：

- SQLite
- published bundle
- public export 目录

### Docker 中最容易踩的坑

#### 1. compose 不再自带本地对象存储

现在必须显式提供外部 S3-compatible 配置，例如 Cloudflare R2：

- `MAGIC_COMPARE_S3_BUCKET`
- `MAGIC_COMPARE_S3_ENDPOINT`
- `MAGIC_COMPARE_S3_PUBLIC_BASE_URL`
- `MAGIC_COMPARE_S3_ACCESS_KEY_ID`
- `MAGIC_COMPARE_S3_SECRET_ACCESS_KEY`

#### 2. Docker 数据库路径必须走 Docker 专用 env

宿主机用：

- `DATABASE_URL=file:./dev.db`

Docker 用：

- `MAGIC_COMPARE_DOCKER_DATABASE_URL=file:/app/data/sqlite/internal-site.db`

否则数据库会落在容器内部临时层，不利于持久化和排障。

## 上传链路的真实顺序

当前 uploader 是一站式中文 CLI。

真实导入链路是：

1. 预演 `plan`：扫描源素材目录、识别 `before / after / misc / heatmap`、校验关键图片并生成计划
2. 生成工作目录与 metadata
3. 打开编辑器确认 `case.yaml / group.yaml`
4. 生成缩略图和 heatmap
5. 调用 `POST /api/ops/group-upload-start`
6. 按 frame 调用 `POST /api/ops/group-upload-frame-prepare`
7. uploader 用返回的 presigned PUT URL 直接上传该 frame 的原图与缩略图
8. 调用 `POST /api/ops/group-upload-frame-commit`
9. 全部 frame 完成后调用 `POST /api/ops/group-upload-complete`

关键约束：

- uploader 现在不再把图先落到 internal-site 本地目录，也不再调用服务器二进制上传代理
- 远端内部站只支持 Cloudflare Service Token，不再走 `cloudflared` 人工登录链路
- 新上传对象统一放在 `/groups/<group-storage-uuid>/<frame-order>/<frame-revision-uuid>/...`
- 已存在的 case metadata 仍以数据库为准；uploader 不会覆盖已有 case 的 title / summary / tags
- group 默认内部草稿；公开开关不再来自 `case.yaml` / `group.yaml`
- 浏览器实际访问图片时，会由 internal/public 站点将逻辑路径解析成 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL` 下的公网绝对 URL
- public-export/public-deploy 不再打包图片，Pages 只发布静态页面和 manifest
- uploader 的 upload session 固定放在工作目录 `.magic-compare/upload-session.json`

### 上传链路当前的内部分层

避免把 frame 级事务重新堆回一个文件，当前职责划分应保持如下：

- `app/api/ops/group-upload-*`：只做 route 入口和错误转义，不写事务编排
- `lib/server/uploads/upload-service.ts`：只保留 start / prepare / commit / complete 主流程
- `lib/server/uploads/upload-service-helpers.ts`：承接作业装载、group 重置、presign 组装、frame 状态 guard、complete 收尾
- `lib/server/storage/internal-assets.ts`：只负责 S3-compatible 读写、presign、按前缀删除，不负责业务状态切换
- `tools/uploader/src/wizard.py`：只负责交互向导和工作目录确认
- `tools/uploader/src/upload_executor.py`：只负责 start -> per-frame prepare/upload/commit -> complete 的执行状态机

新增上传逻辑时，优先把“副作用顺序”塞进 helper，而不是继续往 route 或单个主流程函数里追加分支。

### 近期维护约束

最近几轮重构之后，下面这些边界不要再回退：

- 不要恢复 internal-site 二进制上传代理；上传工具只能拿 presigned URL 后直传对象存储
- 不要在 `upload-service.ts` 里混入大段 Prisma 明细和对象存储清理细节；新增分支优先落到 helper
- 不要把 viewer 的键盘、cookie、viewport、A/B outside-click 副作用重新塞回 `group-viewer-workbench.tsx`
- 不要让 workspace action 自己管理 toast timer、optimistic rollback、transition 样板；复用 action helper 和 notification hook
- 不要把 uploader 的 session 读写、frame 状态推进和 Rich 输出重新揉进一个超长函数

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

- `docs/archive/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/archive/2026-03-20-frontend-refresh.zh-CN.md`

## 给 CI / Docker 发布线程的建议

如果另一条线程要维护 `.github/workflows/ci.yml` 和 `.github/workflows/ghcr-docker.yml`，建议遵守这些边界：

补充复盘文档：

- `docs/archive/ci-ghcr-lessons.zh-CN.md`
- `docs/archive/browser-smoke-and-ci-prep.zh-CN.md`

### CI 验证优先级

`ci.yml` 当前分成三个主要验证段。

第一段 `verify` 优先验证：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

第二段 `compose-smoke` 负责验证当前 Docker 运行路径：

```bash
docker compose -f docker-compose.yml -f docker/ci.compose.override.yml up -d --build internal-site
```

关键约束：

- CI 不应假设 runner 上存在本地 S3/minio sidecar
- compose smoke 默认不依赖 demo seed；只有显式提供外部对象存储配置时才应该验证 demo
- 运行失败后最好保留 compose 日志，便于排错

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

- 先用 `docker compose` 跑通 `internal-site-init -> internal-site`
- 只验证运行路径和健康探活，不替代 `public:export`
- 如果要补浏览器 smoke，至少额外验证 viewer 主图和 thumb 的 `naturalWidth > 0`
- 不要把 `HTTP 200` 或 `img.complete === true` 当成图片真加载的充分证据
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

- `AGENTS.md`（架构分工、viewer 布局约束）
- `docs/workflow-guide.md`（本文档，"已经踩过的坑"节）

### 做 uploader 或导入链路

先看：

- `docs/uploader/README.md`
- `docs/uploader/vseditor-workflow.zh-CN.md`
- `docs/reference/demo-vs-real.zh-CN.md`
- `docs/uploader/boundaries-and-env-split.zh-CN.md`
- `docs/uploader/distribution.zh-CN.md`

### 做部署、Docker、Pages、CI

先看：

- `README.zh-CN.md`
- `.env.example`
- `docker-compose.yml`
- `docker/dev.compose.override.yml`
- `docker/ci.compose.override.yml`
- `docker/internal-site.Dockerfile`
- `apps/internal-site/lib/server/public-site/runtime.ts`
- `docs/archive/ci-ghcr-lessons.zh-CN.md`

## 一句话版本

把这个仓库理解成三段最安全：

1. `uploader + S3` 负责把真实素材变成内部可读内容
2. `internal-site` 负责管理、查看、发布和导出
3. `public-site` 只负责静态消费已发布 bundle

只要不把这三段重新揉成一团，就不容易回到之前那些 404、空导出、并发部署和 viewer 布局失控的问题里。
