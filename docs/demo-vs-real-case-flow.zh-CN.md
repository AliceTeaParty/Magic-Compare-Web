# Demo 与真实 Case / Group 流程差异

这份文档专门说明仓库内置 demo 与真实导入内容在数据来源、写入方式、发布方式上的区别。

## 先看结论

- `demo` 是仓库内置的开发 / 演示样本，不代表正常业务导入流程。
- 真实 `case / group` 来自 uploader 或内部 API，同步后才进入数据库与对象存储。
- `demo` 的目标是让仓库开箱即用，方便本地开发、UI 联调、公开站静态导出验证。
- 真实内容的目标是支撑日常工作流，数据生命周期由导入、排序、发布、删除驱动。

## 为什么要单独保留 demo

demo 解决的是“第一次拉仓库后，站点里什么都没有”的问题。它主要服务以下场景：

- 本地 `pnpm db:seed` 后，internal-site 立即有一组可点开的 viewer 内容。
- `public-site` 可以始终有一组静态样本用于导出和回归测试。
- 前端做 UI 调试时，不需要先手工准备一套真实素材。

如果没有 demo，那么：

- internal-site 初始页会是空目录。
- public-site 的静态导出在没有已发布内容时不方便验证。
- 许多 UI / export / deploy 改动会缺少一个稳定样本。

## demo 的处理流程

### 1. demo 原始素材来自仓库

demo 的原始文件固定存放在：

- `apps/internal-site/prisma/demo-assets/`

这些文件是 seed 的稳定输入，不依赖 uploader，也不依赖当前 `content/published` 中是否已经有最新发布产物。

### 2. seed 会把 demo 写入数据库与 S3

执行：

```bash
pnpm db:seed
```

会发生这些事情：

1. 检查数据库中是否已经存在固定 slug 的 demo case：`demo-grain-study`
2. 将 `apps/internal-site/prisma/demo-assets/` 中的文件上传到内部资产存储
3. 用固定 manifest 结构修复或重建 demo case / group / frame / asset
4. 需要时重新生成 demo 的 published bundle

也就是说，demo 是一种“受控样本数据”，由 seed 负责维持为仓库定义的标准状态。

### 3. demo 的 slug 和结构是固定的

当前 demo 约定：

- case slug：`demo-grain-study`
- group slug：`banding-check`
- public slug：`demo-grain-study--banding-check`

这几个值应视为内置样本标识，不应拿它们去模拟真实导入策略。

## 真实 case / group 的处理流程

### 1. 真实内容来自 uploader 或内部接口

真实内容通常从：

- `magic-compare-uploader`
- `POST /api/ops/import-sync`

进入系统。

素材来源不是仓库内置文件，而是你本地实际导出的图片目录，例如：

- VSEditor 导图目录
- 手工整理好的 compare 素材目录

### 2. uploader 负责解析、生成 metadata、上传素材

真实导入时，uploader 会：

1. 扫描原始文件名
2. 识别 `before / after / misc / heatmap`
3. 生成工作目录与 metadata
4. 上传原图、缩略图、heatmap 到 S3-compatible 存储
5. 生成 import manifest
6. 调用 internal-site 的 `import-sync`

这里的数据是“用户输入驱动”的，而不是像 demo 一样由仓库写死。

### 3. 真实内容进入数据库后可以继续演化

真实 `case / group` 后续会继续经历：

- group 排序
- frame 浏览
- 发布到 `content/published`
- public export
- public deploy
- group 删除

它们是正常业务对象。与之相对，demo 更接近“系统样本”。

## 两套流程的核心区别

### 数据来源不同

- demo：仓库内置素材 + 固定 manifest
- 真实内容：外部导入素材 + 动态生成 manifest

### 写入触发点不同

- demo：`pnpm db:seed`
- 真实内容：uploader / `import-sync`

### 目标不同

- demo：保证开发、演示、静态导出验证可立即使用
- 真实内容：承载实际 compare 工作流

### 生命周期不同

- demo：可被 seed 幂等修复回标准状态
- 真实内容：由用户导入、发布、删除驱动，不会被 seed 自动重置

### slug 策略不同

- demo：固定 slug，便于代码、文档、截图和回归验证
- 真实内容：按真实 case / group metadata 和发布逻辑生成

## 为什么不要把 demo 当成真实导入样板

如果直接把 demo 当作真实导入流程样板，会得出几个错误结论：

- “图片是不是从 `content/published` 回流导入的？”
  不是。真实内容不会从 `content/published` 回流。

- “是不是所有 case 都会被 `db:seed` 改写？”
  不是。只有固定 demo 由 seed 维护。

- “是不是所有 group 都有固定 public slug？”
  不是。真实 group 的 public slug 来自发布流程。

- “删除 demo 后真实 case 会不会也被 seed 重建？”
  不会。seed 只关心 demo。

## 当前推荐理解方式

可以把系统分成两层：

### 系统样本层

- 只有 demo
- 由仓库维护
- 用于 bootstrap、UI 验证、公开站样本导出

### 业务内容层

- 所有真实 case / group
- 由 uploader 和内部站维护
- 用于真实导入、查看、排序、发布与删除

## 开发时应该怎么用

### 你在调 internal-site UI

优先使用 demo：

```bash
pnpm db:push
pnpm db:seed
pnpm dev:internal
```

这样能最快得到一组稳定可用的数据。

### 你在调真实导入链路

不要依赖 demo，直接跑 uploader：

```bash
magic-compare-uploader
```

这样验证的是实际导入和资产写入流程。

### 你在调公开站导出

两者都可以用：

- demo：验证最小闭环
- 真实 case：验证实际发布内容

但 demo 仍然更适合作为“固定回归样本”。

## 相关文件

- demo seed：`apps/internal-site/prisma/seed.ts`
- demo 原始素材：`apps/internal-site/prisma/demo-assets/`
- 真实导入入口：`tools/uploader/`
- published bundle：`content/published/groups/`
- 公开站读取逻辑：`apps/public-site/lib/content.ts`
