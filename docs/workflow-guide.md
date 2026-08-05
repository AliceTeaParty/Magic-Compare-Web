# Magic Compare Workflow Guide

这份文档面向继续接手仓库的开发者、CI 线程和部署线程，整理当前仓库的真实工作流、关键约束和已经踩过的坑。

它不是产品需求文档，而是一份“如何不把现有链路做坏”的工程说明。

## 先看结论

- `internal-site` 是带服务端能力的 Next.js 站点，不是纯前端。
- `public-site` 是静态导出目标，构建产物可直接推到 Cloudflare Pages。
- 内部原图、缩略图和 heatmap 已经统一走 S3-compatible 存储，不再使用 `.runtime` 或 `public/internal-assets`。
- demo 是受控样本，不代表真实业务导入流程。
- 真实内容的推荐链路是：`Web upload -> group-upload-start -> frame prepare/upload/commit -> group-upload-complete -> internal-site -> case-publish -> public-export/public-deploy`。
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

数据库边界、上传作业不变式和 SQLite 特有索引的说明，统一见：

- `docs/reference/database-architecture.zh-CN.md`

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
- 根目录 `pnpm debug:viewer-demo` 可直接把这些样本素材挂到本地 `127.0.0.1:9000`，执行一次 `public:export`，再启动一个只针对 viewer/UI 联调的静态 smoke 环境

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

- `/upload` Web 上传工作台
- `POST /api/ops/group-upload-start`
- `POST /api/ops/group-upload-frame-prepare`
- `POST /api/ops/group-upload-frame-commit`
- `POST /api/ops/group-upload-complete`
- `POST /api/ops/group-upload-cancel`

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
pnpm dev
```

当前行为：

- `pnpm dev` 先检查 Node/pnpm、端口、SQLite 与 S3 配置，再直接执行幂等 schema sync
- 默认启动不会 seed，也不会向远端对象存储重复上传 demo 素材
- 需要创建或修复 demo 时使用 `pnpm dev:bootstrap`
- `pnpm dev:all` 同时启动 internal-site 3000 和 public-site 3001；单站仍可使用 `dev:internal`、`dev:public`

如果没有配置外部对象存储，doctor 会警告，internal-site 仍可用于 Case 管理；上传、素材检查和发布需要完整 S3/R2 配置。

两个应用的 Next 开发产物写入 `.next-dev`。`pnpm build`、`pnpm typecheck`、Docker 构建和公开部署继续使用 `.next`，因此生产构建不再删除运行中开发服务器的缓存。类型检查使用 `next typegen + tsc`，不会执行页面数据收集和静态导出。

提交前使用 `pnpm check` 统一执行格式检查、lint、类型检查和 Vitest。本地 Chromium 冒烟测试使用 `pnpm test:e2e`；它使用 `output/playwright/e2e` 下的隔离 SQLite、固定公开 manifest 和 `.next-e2e`，报告与附件写入 `output/playwright/`，可以在日常 `.next-dev` 服务器运行时执行，不进入默认 CI。

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
- `internal-site` 常驻进程直接由 Node 启动 Next，不保留 pnpm 包装进程：

```bash
node apps/internal-site/node_modules/next/dist/bin/next start apps/internal-site --hostname 0.0.0.0
```

- 常驻服务默认使用 512MiB old-space 和 `MALLOC_ARENA_MAX=2`；Compose 不设置容器级内存或 swap 硬上限，短时构建峰值可使用宿主机余量
- public-site 构建固定使用 Next 16 的 Webpack builder，默认 2 个 worker、1024MiB old-space；Wrangler 使用 512MiB。两者均为按需子进程，任务结束后退出，相关参数可通过 `.env` 独立调整
- `/api/healthz` 返回无缓存 `204`，健康检查每 90 秒调用一次，不查询 SQLite 或渲染页面

### 当前 Docker 里的持久化目录

- 默认 compose：Docker named volume
  - `internal-data:/app/data`
- 如需把数据直接写到宿主机目录，在 `.env` 里设置：
  - `MAGIC_COMPARE_INTERNAL_DATA_MOUNT=./docker-data/internal-data`

所以这些内容不会因为容器重启而丢失：

- SQLite
- published bundle
- public export 目录
- public deploy 任务状态与上次成功指纹

public-site 的 Next.js 构建缓存使用独立挂载点：

- 容器路径：`/app/apps/public-site/.next`
- 默认 Docker named volume：`public-build-cache`
- 可选宿主机路径：`MAGIC_COMPARE_PUBLIC_BUILD_CACHE_MOUNT`

其他会重复写入的构建目录也使用 named volume：

- `public-build-output`：Next 静态导出暂存目录
- `public-build-published`：构建前同步的 published 静态资源
- `public-deploy-cache`：Wrangler 本地缓存

这些目录不能放在容器 writable diff layer。构建仍由部署动作按需启动，完成后进程退出；持久化的只有磁盘文件，不长期占用 CPU 或内存。

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

当前推荐入口是 `internal-site` 的 `/upload` Web 工作台。

Web 上传链路是：

1. 浏览器扫描本地目录，识别 `Before / After / Rip / NoDeband / Degrain` 等列并生成配对计划
2. 在右侧 `配对预览` 中确认问题、列名、顺序和全局 heatmap 参考
3. worker 完整解码全部源图，检查同帧尺寸并计算 SHA-256；这个阶段不创建远端 job，也不 PUT
4. 预检通过后以 `stream-v2` 调用 `POST /api/ops/group-upload-start`
5. 1 到 3 个 worker 逐帧生成缩略图和缺失 heatmap
6. 一帧生成完成后立即调用 prepare，全局最多 6 路、单帧最多 3 路 PUT
7. 该 frame 的 PUT 全部成功后串行 commit，并释放衍生 Blob
8. 全部 frame 完成后调用 `POST /api/ops/group-upload-complete`
9. 暂停会终止 worker 和 PUT；放弃还会调用 cancel 清理未提交 pending 前缀

关键约束：

- Web 上传不把图先落到 internal-site 本地目录，也不调用服务器二进制上传代理
- Web 上传的 `File` / `Blob` 不进入 React state；React 只保存轻量渲染模型
- Web 上传的 heatmap 参考是全局设置，只能选择所有 frame 都存在的列
- Web 上传的 VSEditor 行标题使用 `<episode>-<frame>`，长片名保留在 caption / tooltip 中
- 远端内部站只支持 Cloudflare Service Token，不再走 `cloudflared` 人工登录链路
- 新上传对象统一放在 `/groups/<group-storage-uuid>/<frame-order>/<frame-revision-uuid>/...`
- 已存在的 case metadata 仍以数据库为准；Web 上传不会覆盖已有 case 的 title / summary / tags
- group 默认内部草稿；公开开关不再来自 `case.yaml` / `group.yaml`
- 浏览器实际访问图片时，会由 internal/public 站点将逻辑路径解析成 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL` 下的公网绝对 URL
- 生产环境里的 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL` 应指向 Cloudflare 代理的图片域名，不应直接使用裸 `r2.dev` 或 `cloudflarestorage.com` 桶域名
- public-export/public-deploy 不再打包图片，Pages 只发布静态页面和 manifest
- `public-site` 公开页默认不应被搜索引擎索引；页面层防爬通过 metadata / `robots.txt` 声明，真正的图片拦截和限流交给 Cloudflare

## 页脚版本信息

- internal-site 和 public-site 的全局 footer 通过 `packages/ui` 共享。
- Next config 在构建时读取根 `package.json` 的 `version` 和当前 git 短 hash，注入为 `MAGIC_COMPARE_APP_VERSION` / `MAGIC_COMPARE_COMMIT_SHA`。
- footer 显示为 `v<version>-<hash>`；如果构建环境没有 git 信息，只显示 `v<version>`。
- 版本文本必须和 copyright 使用同级字号、字重和颜色，不要做成独立 badge 或高对比标签。

### 上传链路当前的内部分层

避免把 frame 级事务重新堆回一个文件，当前职责划分应保持如下：

- `app/api/ops/group-upload-*`：只做 route 入口和错误转义，不写事务编排
- `lib/server/uploads/upload-service.ts`：只保留 start / prepare / commit / complete / cancel 主流程
- `lib/server/uploads/upload-service-helpers.ts`：承接作业装载、group 重置、presign 组装、frame 状态 guard、complete 收尾
- `lib/server/storage/internal-assets.ts`：只负责 S3-compatible 读写、presign、按前缀删除，不负责业务状态切换
- `components/web-uploader/`：只负责浏览器目录扫描、预览、生成、上传 runner 和轻量状态展示

新增上传逻辑时，优先把“副作用顺序”塞进 helper，而不是继续往 route 或单个主流程函数里追加分支。

### 近期维护约束

最近几轮重构之后，下面这些边界不要再回退：

- 不要恢复 internal-site 二进制上传代理；上传工具只能拿 presigned URL 后直传对象存储
- 不要在 `upload-service.ts` 里混入大段 Prisma 明细和对象存储清理细节；新增分支优先落到 helper
- 新的上传体验优先补齐 `/upload` Web 工作台
- 不要把 viewer 的键盘、cookie、viewport、A/B outside-click 副作用重新塞回 `group-viewer-workbench.tsx`
- 不要让 workspace action 自己管理 toast timer、optimistic rollback、transition 样板；复用 action helper 和 notification hook

## 发布、导出、部署三件事要分清

### 1. publish case

作用：

- 把当前 case 中 `isPublic=true` 的内容写成 published bundle

入口：

- `POST /api/ops/case-publish`

结果：

- `content/published` 或 `MAGIC_COMPARE_PUBLISHED_ROOT` 更新

发布只查询公开 Group、Frame 和 manifest 所需字段。新上传或 manifest 导入在对象检查成功后写入 `Asset.storageValidatedAt`；旧素材首次发布以 8 路并发检查未记录的原图和缩略图，后续发布信任 UUID 不可变路径，不再重复读取 R2。日志记录查询、校验和总耗时以及信任/新增校验数量。

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

- 可选先重新 publish 某一个 case
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

当前 internal-site workspace 入口：

- 全局导航固定保留“部署”入口
- 全局入口调用不带 `caseId` 的 `POST /api/ops/public-deploy`，只部署已经发布的 bundle
- `POST` 返回 `202` 和任务 id；`GET /api/ops/public-deploy?jobId=...` 返回可恢复的阶段状态
- Case publish 仍由显式 publish 操作负责，不会因为打开某个工作区而隐式改变全站部署内容
- 浏览器已经授予通知权限且页面在后台时才发送完成通知，部署点击本身不会弹权限请求

### 部署缓存与性能记录

public deploy 会为以下输入计算指纹：

- published bundle 文件树
- public-site 与相关共享包源码
- lockfile、公开站配置、Pages 项目和 branch

指纹与上次成功部署一致时直接返回“公开站点已是最新版本”。失败、中断和 Cloudflare 未接受的任务不会更新成功指纹。

部署任务记录这些真实阶段：

- 检查发布内容
- 可选生成 Case 发布内容
- 同步并构建公开页面
- 整理部署文件
- 上传到 Cloudflare Pages

Wrangler 输出真实文件计数时，任务接口返回上传 `completed / total`；构建阶段没有真实总量，只返回阶段状态和已用时间。每次任务完成后，服务端输出一条 `[public-deploy]` 结构化日志，并把总耗时和阶段耗时写入 `/app/data/deploy-state/latest-job.json`。

internal-site 即使运行在开发模式，也会让 public-site 子构建显式使用 `NODE_ENV=production`，避免 Next.js 生产构建继承 `development` 或自定义值。界面中的失败摘要最多显示 180 个字符；完整命令输出仍保留在任务记录和服务端日志中，供排查使用。

性能验收以 Homelab 生产容器为准：镜像升级后的第一次运行记录冷构建，随后在相同代码和内容下分别记录热构建与无变化跳过。本地开发机只用于确认缓存命中和行为正确，不作为发布耗时结论。

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
- viewer 采用 stage-first 布局；首屏可以看不完整个 stage，但滚动到 stage 区后它必须完整落入一个浏览器 viewport
- 胶片带必须始终排在 stage 下方，不能靠固定高度壳体、负 margin 或层叠技巧与主舞台抢空间
- 工具栏里的 `fit`/`Scroll the compare stage into view` 语义是“自动滚动到合适观察位置”，不是再次切换 stage 尺寸
- heatmap 必须和基底图共享同一 media rect

更详细说明见：

- `docs/archive/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/archive/2026-03-20-frontend-refresh.zh-CN.md`

### 6. 发版前先分清“功能提交”和“发版提交”

`v1.9.1` 的经验是：功能修正和版本号 / CHANGELOG 可以连续完成，但不要揉进同一个提交。

推荐顺序：

1. 先提交功能、UI、文档修正。
2. 再提交 `CHANGELOG.md` 和根 `package.json` 的发版元数据。
3. 在发版提交上打 `vX.Y.Z` annotated tag。
4. 分步推送 `main` 和 tag。
5. 用 `gh run list` 确认 `CI`、`GHCR Docker`、`Dependency Graph` 等远端任务状态。
6. 如果 GitHub Release 没有自动生成，用 CHANGELOG 对应版本段创建 release notes。

经验教训：

- 本地 `pnpm lint`、`pnpm typecheck`、`pnpm test` 都通过，只代表源码状态；tag 推送后仍要看 GitHub Actions，因为 Docker/GHCR 是远端路径。
- 页脚 commit hash 来自构建时 git 状态，dev server 已经启动时不会自动刷新这类构建时 metadata。
- GitHub push 可能返回 Dependabot 漏洞摘要，这不是发版失败；但应作为后续安全维护项单独处理。

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
docker build --platform linux/amd64 -f docker/internal-site.Dockerfile -t magic-compare/internal-site .
```

`ghcr-docker.yml` 当前建议分成两段：

1. `smoke`

- 使用 Node 24 runtime 的 actions：`setup-buildx-action@v4`、`build-push-action@v7`、`upload-artifact@v7`
- 只构建 `linux/amd64`，与 Intel N100 / Debian 12 目标机一致，不安装 QEMU
- 构建上下文排除文档，保留 Web workspace、共享包、发布内容与运行脚本
- Buildx 先构建并 `load` 本地 smoke 镜像，通过 `type=gha,mode=max` 缓存完整构建层
- `docker compose --no-build` 跑通 `internal-site-init -> internal-site`，确保 smoke 测试的是 Buildx 产物
- 只验证运行路径和健康探活，不替代 `public:export`
- 如果 smoke 需要验证 demo seed，必须同时显式提供对象存储配置和 `MAGIC_COMPARE_HIDE_DEMO=false`
- 如果要补浏览器 smoke，至少额外验证 viewer 主图和 thumb 的 `naturalWidth > 0`
- 不要把 `HTTP 200` 或 `img.complete === true` 当成图片真加载的充分证据
- 失败时保留 compose 日志
- 本地 `load` 不保留 attestation，因此 smoke 构建显式关闭 provenance；正式发布构建仍保留 BuildKit 默认 provenance

2. `publish`

- 只有 `smoke` 成功后才推 GHCR
- 使用 `login-action@v4`、`metadata-action@v6`、`build-push-action@v7`，避免 Node 20 action runtime
- 复用 `ghcr-docker-amd64` smoke 缓存，避免在独立 runner 上重新安装依赖和完整编译
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

### 做 Web 上传或导入链路

先看：

- `docs/web-uploader.zh-CN.md`
- `docs/reference/database-architecture.zh-CN.md`
- `docs/reference/demo-vs-real.zh-CN.md`

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

1. `Web upload + S3` 负责把真实素材变成内部可读内容
2. `internal-site` 负责管理、查看、发布和导出
3. `public-site` 只负责静态消费已发布 bundle

只要不把这三段重新揉成一团，就不容易回到之前那些 404、空导出、并发部署和 viewer 布局失控的问题里。
