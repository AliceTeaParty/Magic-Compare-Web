# Magic Compare Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

Magic Compare Web 是一个面向压制组图片对比展示场景的 monorepo。

项目包含两个部署目标：

- `internal-site`：内部目录、case 工作区、对比 viewer、排序操作和发布操作。
- `public-site`：静态、只读的公开 group 页面，直接消费 `content/published` 中的发布产物。

这个仓库有明确边界：它不是视频预览器，不是在线 VapourSynth 运行器，也不是站内评审或评论系统。当前范围聚焦在“看”和“发”。

## 当前状态

仓库已经完成初始化，并通过基础验证：

- `pnpm install` 可正常安装依赖。
- `pnpm db:push` 会初始化 SQLite schema。
- `pnpm db:seed` 会向内部数据库写入一组 demo case，并准备对应的内部演示素材。
- `pnpm sync:published` 会把发布产物复制到 `apps/public-site/public/published`。
- `pnpm build` 可同时构建两个 Next.js 应用。
- `pnpm test` 可通过共享 schema 与 viewer 逻辑测试。

当前自带的演示数据为：

- 内部站 case slug：`demo-grain-study`
- 内部 group slug：`banding-check`
- 公开 group slug：`demo-grain-study--banding-check`

## Monorepo 结构

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

### apps/internal-site

内部站承担的职责：

- 展示 case 目录页
- 展示 case 工作区
- 展示内部 group viewer
- 接收 uploader 发来的导入 manifest
- 调整 case 下的 group 顺序
- 调整 group 下的 frame 顺序
- 将公开产物发布到 `content/published`

关键实现区域：

- `app/`：Next.js App Router 路由
- `components/`：内部站专用 UI，例如 case 目录和工作区列表
- `lib/server/repositories/`：基于 Prisma Client 的读写数据访问层
- `lib/server/publish/`：负责过滤公开内容并写出 manifest 的发布流程
- `lib/server/storage/`：发布产物相关的文件系统辅助逻辑
- `prisma/schema.prisma`：Prisma 数据模型
- `prisma/init-db.ts`：`pnpm db:push` 使用的 SQLite 初始化脚本

### apps/public-site

公开站承担的职责：

- 静态生成已发布的 group 页面
- 只读取 `content/published/groups/*/manifest.json`
- 不提供目录页、不提供上传 UI、也不暴露写接口

关键实现区域：

- `app/g/[publicSlug]/page.tsx`：SSG 公开 group viewer 入口
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
- 把源图暂存到 `apps/internal-site/public/internal-assets`
- 生成缩略图
- 构造导入用的 `ImportManifest`
- 把 manifest 提交到 `POST /api/ops/import-sync`

上传工具另有独立文档：`tools/uploader/README.md`。

如果你要从 VSEditor 已保存的平铺导图目录开始整理并导入，可直接参考：

- `tools/uploader/VSEDITOR-WORKFLOW.zh-CN.md`

## 数据模型

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

## 路由

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

## Viewer 行为

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

## 导入流程

当前导入流程是典型的 filesystem-first 方案。

1. 按 uploader 目录约定准备本地 case 目录。
2. uploader 扫描目录，并校验必需文件是否齐全。
3. uploader 将源图复制到 `apps/internal-site/public/internal-assets/...`。
4. uploader 在暂存文件旁生成缩略图。
5. uploader 构造 `ImportManifest`。
6. uploader 将 manifest 提交到 `POST /api/ops/import-sync`。
7. 内部站 upsert case 与 group 元数据，删除被替换 group 的现有 frame 和 asset 记录，再按 manifest 重建。

当前重要限制：

- uploader 默认假设自己运行在这个仓库内部，因为当前暂存路径会直接写入 `apps/internal-site/public/internal-assets`

## 发布流程

当前发布流程是显式触发、以 case 为范围执行的。

1. 内部站调用 `POST /api/ops/case-publish`。
2. 发布流程加载完整 case，并过滤 `group.isPublic`、`frame.isPublic` 与 `asset.isPublic`。
3. 每个公开 group 都会获得稳定的 `publicSlug`。若此前不存在，则由 `caseSlug--groupSlug` 推导；若冲突则追加短后缀。
4. 公开资产会从内部暂存目录复制到 `content/published/groups/[publicSlug]/assets`。
5. 系统会为每个公开 group 写出带 `schemaVersion` 的 `manifest.json`。
6. `pnpm sync:published` 会将 `content/published` 复制到 `apps/public-site/public/published`，供公开站部署目标使用。

当前重要规则：

- 任何公开 frame 只要缺少 `before` 或 `after`，发布就会失败

## 本地开发

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
pnpm db:seed
pnpm sync:published
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

## 构建与测试

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

## Demo 资产与发布产物

仓库中已提交一组公开演示产物：

- `content/published/groups/demo-grain-study--banding-check/manifest.json`
- 同目录下对应的 SVG 资产

这些内容用于：

- `public-site` 的静态生成
- 本地校验发布产物结构
- seed 与 bootstrap 时的参考内容

## 当前限制

- Prisma migration 还没有接入；当前 SQLite 初始化依赖手写脚本。
- 内部资产暂存仍是 repo-local，还不是远程对象存储方案。
- 公开站当前直接消费同仓库中的发布产物；外部部署的同步仍然是构建前步骤，还不是独立流水线。
- uploader 还不支持远程二进制上传；当前模式是本地暂存文件，再通过 HTTP 同步元数据。
- v1 暂无浏览器端上传 UI。
- 站内仍没有讨论、打分、标注或评审流程。

## 推荐下一步

- 等当前环境中的 Prisma schema engine 问题解决后，补上正式 migration 流程
- 将内部资产从应用 public 目录迁移到对象存储或专门的托管路径
- 在 UI 中补充更明确的排序失败与发布失败错误反馈
- 为内部排序和发布流程补端到端测试
