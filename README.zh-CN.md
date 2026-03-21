# Magic Compare Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

<p align="center">
  <strong>用 Slider、A/B、Heatmap 三种模式专注查看图像差异</strong>
</p>
<p align="center">
  面向压制组图片评审流程构建，从本地导入到公开发布页面，围绕对比与交付这一条链路展开。
</p>
<p align="center">
  <a href="#quick-start">快速开始</a> ·
  <a href="#workflow-overview">查看流程</a> ·
  <a href="./tools/uploader/README.md">Uploader 文档</a> ·
  <a href="./docs/viewer-stage-and-filmstrip-notes.zh-CN.md">Viewer 复盘</a>
</p>

<table>
  <tr>
    <td width="33%" align="center">
      <img src="./apps/internal-site/prisma/demo-assets/001-before.svg" alt="Slider 模式预览" width="49%" />
      <img src="./apps/internal-site/prisma/demo-assets/001-after.svg" alt="Slider 模式预览 after" width="49%" />
      <br />
      <strong>Slider</strong>
      <br />
      <sub>通过拖动滑块查看前后版本差异，适合观察去色带、纹理恢复和边缘处理。</sub>
    </td>
    <td width="33%" align="center">
      <img src="./apps/internal-site/prisma/demo-assets/002-before.svg" alt="A/B 模式预览 before" width="49%" />
      <img src="./apps/internal-site/prisma/demo-assets/002-after.svg" alt="A/B 模式预览 after" width="49%" />
      <br />
      <strong>A/B</strong>
      <br />
      <sub>在两个版本之间快速切换，适合逐帧确认处理决策，不需要离开当前 viewer。</sub>
    </td>
    <td width="33%" align="center">
      <img src="./apps/internal-site/prisma/demo-assets/001-heatmap.svg" alt="Heatmap 模式预览" width="100%" />
      <br />
      <strong>Heatmap</strong>
      <br />
      <sub>高亮差异区域与变化强度，当肉眼直看不够明显时，可快速定位处理影响范围。</sub>
    </td>
  </tr>
</table>

Magic Compare Web 是一个面向压制组图片对比展示场景的 monorepo。

项目包含两个部署目标：

- `internal-site`：带服务端能力的 Next.js 内部站，负责目录、case 工作区、viewer、发布、公开导出和 Pages 部署。
- `public-site`：静态导出目标，只读消费 `content/published` 中的发布产物。

这个仓库有明确边界：它不是视频预览器，不是在线 VapourSynth 运行器，也不是站内评审或评论系统。当前范围聚焦在“看”和“发”。

## ✨ 亮点

- `Slider` 适合在同一帧里直接查看 before/after 差异。
- `A/B` 适合在两个版本之间快速切换，做处理选择判断。
- `Heatmap` 适合强调变化区域与差异强度。
- 内部导入到公开发布的链路已经打通，可直接从本地素材生成 review case。
- 公开站直接消费 `content/published` 中的静态发布产物。
- 内部原图、缩略图和 heatmap 统一走 S3-compatible 存储。
- 公开站支持显式静态导出和 Cloudflare Pages 直传部署。

<a id="quick-start"></a>

## 🚀 快速开始

```bash
cp .env.example .env
docker compose up -d rustfs rustfs-init
pnpm install
pnpm db:push
pnpm db:seed
pnpm public:export

# terminal 1
pnpm dev:internal

# terminal 2
pnpm dev:public
```

本地访问入口：

- internal-site：`http://localhost:3000`
- public-site：`http://localhost:3001`
- demo 公开页面：`http://localhost:3001/g/demo-grain-study--banding-check`

当前 demo 内容：

- 内部站 case slug：`demo-grain-study`
- 内部 group slug：`banding-check`
- 公开 group slug：`demo-grain-study--banding-check`

💡 说明：

- `pnpm db:push` 当前实际执行的是 `apps/internal-site/prisma/init-db.ts`，因为当前本地环境里 `prisma db push` 自身会失败。

## 🐳 Docker 与存储

- `docker/internal-site.Dockerfile` 会构建一个完整工作区镜像，镜像内可以直接触发公开站静态导出和 Pages 部署。
- `docker-compose.yml` 示例会拉起：
  - `internal-site`
  - 作为 S3-compatible 后端的 `rustfs`
  - 启动时自动建 bucket 的 `rustfs-init`
- `rustfs` 现在默认以低占用模式启动：console 默认关闭、日志级别默认为 `warn`、默认内存上限为 `512m`
- 如需启用 RustFS WebUI，可在 `.env` 中显式设置 `MAGIC_COMPARE_RUSTFS_CONSOLE_ENABLE=true`
- 内部原图、缩略图和 heatmap 统一由 `MAGIC_COMPARE_S3_*` 配置的对象存储承载
- 发布产物继续写到 `MAGIC_COMPARE_PUBLISHED_ROOT`
- 公开静态导出目录由 `MAGIC_COMPARE_PUBLIC_EXPORT_DIR` 控制

<a id="workflow-overview"></a>

## 🔄 工作流总览

### 📥 导入流程

1. 按 uploader 的目录约定准备本地 case 目录。
2. 运行 uploader，扫描目录并校验必需文件。
3. 将原图、缩略图和自动 heatmap 直接上传到 S3-compatible 存储。
5. 构造 `ImportManifest` 并提交到 `POST /api/ops/import-sync`。
6. 由内部站 upsert case 与 group 元数据，并为被替换 group 重建 frame 与 asset 记录。

结果：

- 导入后的 review 数据可直接在 internal-site 工作区查看
- 内部素材通过 `/internal-assets/...` 动态读取，真实对象落在 S3-compatible 存储
- uploader 的详细使用方式见 `tools/uploader/README.md`
- demo 与真实内容处理流程的区别见 `docs/demo-vs-real-case-flow.zh-CN.md`

### 📦 发布流程

1. 在内部站触发 `POST /api/ops/case-publish`。
2. 按 `group.isPublic`、`frame.isPublic`、`asset.isPublic` 过滤 case 中可公开内容。
3. 为每个公开 group 复用或生成稳定的 `publicSlug`。
4. 将公开资产复制到 `content/published/groups/[publicSlug]/assets`。
5. 为每个公开 group 写出带 `schemaVersion` 的 `manifest.json`。
6. 在需要时触发 `pnpm public:export` 或 `POST /api/ops/public-export`，生成新的静态公开站点。
7. 在需要时触发 `pnpm public:deploy` 或 `POST /api/ops/public-deploy`，直传到 Cloudflare Pages。

结果：

- 发布产物落在 `content/published`
- `apps/public-site` 以静态内容方式消费这些产物
- 公开部署目标保持只读

## ✅ 当前已可用

仓库已经完成初始化，并通过基础验证：

- `pnpm install` 可正常安装依赖。
- `pnpm db:push` 会初始化 SQLite schema。
- `pnpm db:seed` 会向内部数据库写入一组 demo case，并把对应演示素材上传到 S3-compatible 存储。
- `pnpm public:export` 默认会把公开静态站导出到 `dist/public-site`。
- `pnpm build` 可同时构建两个 Next.js 应用。
- `pnpm test` 可通过共享 schema 与 viewer 逻辑测试。

当前自带的演示数据为：

- 内部站 case slug：`demo-grain-study`
- 内部 group slug：`banding-check`
- 公开 group slug：`demo-grain-study--banding-check`

## 🧱 Monorepo 结构

```text
apps/
  internal-site/
  public-site/

packages/
  compare-core/
  content-schema/
  shared-utils/
  ui/

tools/
  uploader/

content/
  published/
```

## 🧠 技术细节

<details>
<summary><strong>🏗️ 架构说明</strong></summary>

### apps/internal-site

内部站承担的职责：

- 展示 case 目录页
- 展示 case 工作区
- 展示内部 group viewer
- 接收 uploader 发来的导入 manifest
- 调整 case 下的 group 顺序
- 调整 group 下的 frame 顺序
- 将公开产物发布到 `content/published`
- 显式导出和部署公开静态站

关键实现区域：

- `app/`：Next.js App Router 路由
- `components/`：内部站专用 UI，例如 case 目录和工作区列表
- `lib/server/repositories/`：基于 Prisma Client 的读写数据访问层
- `lib/server/publish/`：负责过滤公开内容并写出 manifest 的发布流程
- `lib/server/storage/`：S3 内部素材与公开产物写出逻辑
- `lib/server/public-site/`：公开站静态导出与 Cloudflare Pages 部署逻辑
- `prisma/schema.prisma`：Prisma 数据模型
- `prisma/init-db.ts`：`pnpm db:push` 使用的 SQLite 初始化脚本

### apps/public-site

公开站承担的职责：

- 静态导出已发布的 group 页面
- 只读取 `content/published/groups/*/manifest.json`
- 不提供目录页、不提供上传 UI、也不暴露写接口

关键实现区域：

- `app/g/[publicSlug]/page.tsx`：SSG / static export 公开 group viewer 入口
- `lib/content.ts`：发布 manifest 读取逻辑

### packages/content-schema

共享的 Zod schema 与 TypeScript 类型，覆盖：

- case
- group
- frame
- asset
- import manifest
- publish manifest
- `CaseStatus`、`ViewerMode`、`AssetKind` 等枚举

当前需要特别注意的规则：

- 内部 `slug` 统一使用 kebab-case，并使用单连字符
- 公开 `publicSlug` 允许使用双连字符作为分隔，例如 `case--group`

### packages/compare-core

共享的 viewer 核心逻辑：

- viewer dataset 结构
- asset 查找辅助函数
- 可用模式计算
- heatmap 降级解析
- 客户端 viewer controller 状态

### packages/ui

共享的 viewer 工作台与主题：

- 深色现代风格的 MUI 主题
- group viewer 外壳
- 顶部工具栏
- 主图舞台
- 胶片缩略图带
- 右侧信息栏

### tools/uploader

Python CLI，负责：

- 校验本地 case 目录
- 把源图、缩略图和 heatmap 直接上传到 S3-compatible 存储
- 生成缩略图
- 构造导入用的 `ImportManifest`
- 把 manifest 提交到 `POST /api/ops/import-sync`

上传工具另有独立文档：`tools/uploader/README.md`。

如果你要从 VSEditor 已保存的平铺导图目录开始整理并导入，可直接参考：

- `docs/VSEDITOR-WORKFLOW.zh-CN.md`
- `docs/demo-vs-real-case-flow.zh-CN.md`

</details>

<details>
<summary><strong>🗂️ 数据模型</strong></summary>

当前实现使用四个核心内容实体。

### Case

Case 是顶层容器。

字段：

- `id`
- `slug`
- `title`
- `subtitle`
- `summary`
- `tags[]`
- `status`
- `coverAssetId`
- `publishedAt`
- `updatedAt`

### Group

Group 是公开分享的最小单元。

字段：

- `id`
- `caseId`
- `slug`
- `publicSlug`
- `title`
- `description`
- `order`
- `defaultMode`
- `isPublic`
- `tags[]`

### Frame

Frame 对应胶片缩略图带中的一个位置。一个 group 可以包含多个 frame。

字段：

- `id`
- `groupId`
- `title`
- `caption`
- `order`
- `isPublic`

### Asset

Asset 是挂在某个 frame 下的一个具体图片变体。

字段：

- `id`
- `frameId`
- `kind`
- `label`
- `imageUrl`
- `thumbUrl`
- `width`
- `height`
- `note`
- `isPublic`
- `isPrimaryDisplay`

当前语义规则：

- 每个 frame 都必须有 `before` 和 `after`
- `before` 和 `after` 是默认主显示资产
- `heatmap` 是可选项
- `crop` 和 `misc` 是可选项

</details>

<details>
<summary><strong>🛣️ 路由</strong></summary>

### 内部站

- `/`
- `/cases/[caseSlug]`
- `/cases/[caseSlug]/groups/[groupSlug]`
- `POST /api/ops/import-sync`
- `POST /api/ops/group-reorder`
- `POST /api/ops/frame-reorder`
- `POST /api/ops/case-publish`

### 公开站

- `/g/[publicSlug]`

公开站刻意不提供索引页。

</details>

<details>
<summary><strong>🖼️ Viewer 行为</strong></summary>

共享 viewer 采用约定好的工作台结构：

- 顶部轻工具栏
- 中间主图舞台
- 下方胶片缩略图带
- 可折叠右侧信息栏

当前 v1 支持的 viewer 模式：

- `before-after`
- `a-b`
- `heatmap`

当前 heatmap 降级规则：

- 如果 frame 没有 heatmap 资产，公开站直接隐藏 heatmap 入口
- 在内部站中，heatmap 会以不可用状态显示，并在右栏中给出提示
- 如果当前 frame 不支持 heatmap，viewer 模式会先回退到 `group.defaultMode`
- 如果 `group.defaultMode` 同样依赖 heatmap，最终回退到 `before-after`

当前支持的键盘操作：

- 左右方向键切换 frame
- `1` 切换到 before/after
- `2` 切换到 A/B
- `3` 切换到 heatmap
- `i` 切换右栏开合

</details>

<details>
<summary><strong>📥 导入流程细节</strong></summary>

当前导入流程是“本地处理 + S3 上传”方案。

1. 按 uploader 目录约定准备本地 case 目录。
2. uploader 扫描目录，并校验必需文件是否齐全。
3. uploader 将原图、缩略图和自动 heatmap 上传到 S3-compatible 存储。
5. uploader 构造 `ImportManifest`。
6. uploader 将 manifest 提交到 `POST /api/ops/import-sync`。
7. 内部站 upsert case 与 group 元数据，删除被替换 group 的现有 frame 和 asset 记录，再按 manifest 重建。

</details>

<details>
<summary><strong>📦 发布流程细节</strong></summary>

当前发布流程是显式触发、以 case 为范围执行的。

1. 内部站调用 `POST /api/ops/case-publish`。
2. 发布流程加载完整 case，并过滤 `group.isPublic`、`frame.isPublic` 与 `asset.isPublic`。
3. 每个公开 group 都会获得稳定的 `publicSlug`。若此前不存在，则由 `caseSlug--groupSlug` 推导；若冲突则追加短后缀。
4. 公开资产会从内部 S3 资产复制到 `content/published/groups/[publicSlug]/assets`。
5. 系统会为每个公开 group 写出带 `schemaVersion` 的 `manifest.json`。
6. `pnpm public:export` 会生成新的公开静态站点，并镜像到 `MAGIC_COMPARE_PUBLIC_EXPORT_DIR`。
7. `pnpm public:deploy` 会通过 Wrangler 把这份静态站点直传到 Cloudflare Pages。

当前重要规则：

- 任何公开 frame 只要缺少 `before` 或 `after`，发布就会失败

</details>

<details>
<summary><strong>🛠️ 本地开发细节</strong></summary>

### 1. 安装依赖

```bash
pnpm install
```

### 2. 初始化 SQLite

```bash
pnpm db:push
```

说明：

- `pnpm db:push` 当前实际执行的是 `apps/internal-site/prisma/init-db.ts`
- Prisma 仍然是运行时 ORM
- 这样做是因为当前本地环境里 `prisma db push` 自身会失败，因此先用这个方式完成 SQLite 初始化

### 3. 写入 demo 数据

```bash
docker compose up -d rustfs rustfs-init
pnpm db:seed
pnpm public:export
```

### 4. 启动 internal-site 和 public-site

分别在两个终端中执行：

```bash
pnpm dev:internal
pnpm dev:public
```

建议本地访问地址：

- internal-site：`http://localhost:3000`
- public-site：`http://localhost:3001`，或你单独启动时使用的其他端口

</details>

<details>
<summary><strong>🧪 构建、测试与常用命令</strong></summary>

| 任务 | 命令 |
| --- | --- |
| 构建两个应用 | `pnpm build` |
| 运行全部测试 | `pnpm test` |
| 运行工作区类型检查 | `pnpm typecheck` |
| 启动 internal-site | `pnpm dev:internal` |
| 启动 public-site | `pnpm dev:public` |
| 初始化 SQLite | `pnpm db:push` |
| 写入 demo 数据 | `pnpm db:seed` |
| 导出公开静态站 | `pnpm public:export` |
| 部署到 Cloudflare Pages | `pnpm public:deploy` |

构建整个工作区：

```bash
pnpm build
```

运行所有测试：

```bash
pnpm test
```

运行工作区类型检查：

```bash
pnpm typecheck
```

</details>

## 🧾 Demo 资产与发布产物

仓库中已提交一组公开演示产物：

- `content/published/groups/demo-grain-study--banding-check/manifest.json`
- 同目录下对应的 SVG 资产

这些内容用于：

- `public-site` 的静态生成
- 本地校验发布产物结构
- seed 与 bootstrap 时的参考内容

## ⚠️ 当前限制

- Prisma migration 还没有接入；当前 SQLite 初始化依赖手写脚本。
- 公开站在导出前仍依赖同一份仓库 checkout 中的发布产物目录。
- Cloudflare Pages 部署默认假设目标项目已存在，并且环境中已经准备好 Wrangler 所需凭据。
- v1 暂无浏览器端上传 UI。
- 站内仍没有讨论、打分、标注或评审流程。

## 🔗 相关文档

- [Uploader README](./tools/uploader/README.md)
- [VSEditor 平铺导图工作流](./docs/VSEDITOR-WORKFLOW.zh-CN.md)
- [Demo 与真实 Case / Group 流程差异](./docs/demo-vs-real-case-flow.zh-CN.md)
- [CI / GHCR 接入复盘](./docs/ci-ghcr-lessons.zh-CN.md)
- [English root README](./README.md)

## 🛣️ 后续方向

- 等当前环境中的 Prisma schema engine 问题解决后，补上正式 migration 流程
- 将内部资产从应用 public 目录迁移到对象存储或专门的托管路径
- 在 UI 中补充更明确的排序失败与发布失败错误反馈
- 为内部排序和发布流程补端到端测试

## 📄 许可证

本仓库基于 [MIT License](./LICENSE) 发布。
