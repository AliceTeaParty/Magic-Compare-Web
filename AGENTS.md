# AGENTS.md

## 工作方式

- 先读真实实现，再下结论。优先级是 `package.json` 脚本、`apps/` / `packages/` / `scripts/` / Docker 实现、`docs/` 常驻文档，最后才是 README。
- 用户要求“分析”时先给证据驱动的现状和优先级，不要直接改代码；用户要求“修复/实现/提交”时完成改动、验证和清楚交代结果。
- 命令分步执行，不要把大量命令用 `&&`、`;` 或长脚本串成一坨。尤其是 git、workflow、registry、发布相关操作，要保留可见检查点。
- 不要凭记忆做框架细节。Next.js、MUI、Prisma、dnd-kit、Cloudflare 等实现细节优先查官方文档或项目 MCP 指南。
- `mcp-vector-search` 只能作为定位和审查线索；复杂度、dead-code、AI review 结果都必须回到源码、测试或浏览器验证复核。
- 测试投入要匹配风险：关键链路、状态机、viewer/workspace 交互值得测试；弃用横幅、低风险文案等细枝末节不需要专门测试。

## 常用命令

根目录脚本以 `package.json` 为准；这里只保留日常入口：

```bash
# 开发
pnpm dev:internal   # internal-site；检查环境并同步 schema
pnpm dev:bootstrap  # internal-site；创建或修复 demo 数据与素材
pnpm dev:public     # public-site 源码开发服务器 :3001
pnpm dev:all        # internal-site :3000 + 部署产物监看服务器 :3001
pnpm dev:doctor all # 只检查 Node/pnpm、端口、SQLite、S3 与公开内容

# 数据与公开站
pnpm db:push        # 初始化或同步 internal-site SQLite schema
pnpm db:seed        # 写入 demo；配置完整时上传素材并刷新 published bundle
pnpm public:export  # 导出 public-site
pnpm public:deploy  # 导出并部署 public-site

# 验证
pnpm check          # format、lint、typecheck、Vitest
pnpm test:e2e       # 本地 Chromium 冒烟
```

单站调试使用 `pnpm dev:internal`（internal-site）或 `pnpm dev:public`（public-site 源码开发）。`pnpm dev:all` 的 3001 直接服务 `output/public-site`，用于监看内部站部署完成后的静态产物。单包验证使用 `pnpm --filter <package> <script>`，其中 `<script>` 为 `lint`、`typecheck` 或 `test`。需要分项检查时运行 `pnpm lint`、`pnpm typecheck` 或 `pnpm test`。

`pnpm format:check` 只检查当前变更；需要查看全仓库既有格式欠账时使用 `pnpm format:check:all`。MCP 相关命令见 `docs/mcp-usage-guide.md`。`public:export` 与 `public:deploy` 共享构建目录，需按顺序执行。

Next 开发服务器使用各应用的 `.next-dev`，Playwright 使用 `.next-e2e`，生产构建、Docker 与公开部署使用 `.next`。`dev:all` 的公开监看服务器只读 `output/public-site`，部署完成后直接看到新的静态文件。不要为了运行检查、构建或浏览器冒烟停止开发服务器。

## 架构边界

仓库分三条独立责任线，不能混用：

- `apps/internal-site/`：带服务端能力的 Next.js 内部工作站。负责 case catalog、case workspace、group viewer、`/api/ops/*`、SQLite/Prisma metadata、S3/R2 内部素材访问、publish bundle 生成，以及显式 public export/deploy 触发。
- `apps/public-site/`：静态导出站点。只读取 published root（宿主机默认 `output/published`）下的 `groups/*/manifest.json` 并服务 `/g/[publicSlug]`，没有 catalog、上传 UI 或写接口。

共享包：

- `packages/compare-core`：viewer dataset、asset lookup、模式计算、heatmap fallback、viewer state。
- `packages/content-schema`：实体、manifest 和枚举的 Zod schema 与类型。
- `packages/ui`：共享 MUI dark theme、viewer workbench、stage、filmstrip、sidebar。
- `packages/shared-utils`：通用工具。Node-only helper 必须走明确 subpath，避免进浏览器 bundle。

## P0 约束

- 不要把内部素材写进 `public/`。Next 静态目录会被缓存，运行时写入容易 404；内部素材使用 S3/R2。
- `case-publish` 不能隐式触发 `public:export` 或 `public:deploy`。公开导出和部署必须是显式动作。
- 不要并发执行 `public:export` 和 `public:deploy`；它们共享构建目录。
- 不要把 `internal-site` 的服务端写能力搬进 `public-site`。
- 修改 `app/api/ops/case-publish`、`lib/server/publish/`、`lib/server/public-site/`、manifest schema 或 `compare-core` asset/mode 逻辑时，要额外确认 public-site fresh export 后的可见行为。
- 不要把生产数据、发布 bundle 或运行时数据库当作普通源码写入仓库。

## 前端和 UX 要求

- 当前开发重点是补齐 Web 能力，尤其是 Case workspace、viewer 和 `/upload` Web 上传工作台。
- UI 应保持精确、安静、工作台感。不要把内部工具做成营销 landing page，也不要用装饰性卡片、夸张圆角、无意义动效稀释信息层级。
- 对比图页面以图像检查为核心；toolbar、filmstrip、details、guide 都应服务快速判断，不应遮挡主图或制造状态歧义。
- loading / fallback 必须诚实：不要用模糊或错误图片冒充目标图片；原图仍是检查的最终依据。
- Inline edit 类交互要像文档编辑一样自然：编辑态不能造成布局位移、整页刷新闪烁、按钮跳动或保存路径抖动。
- 做前端改动时优先使用 in-app browser 验证当前页面；检查 console、hydration、窄屏、保存/取消/失败路径，不要只测“打开编辑”。

## 数据与发布文档入口

- 总工作流和踩坑：`docs/workflow-guide.md`
- API 合约：`docs/reference/api-endpoints.zh-CN.md`
- demo 与真实导入边界：`docs/reference/demo-vs-real.zh-CN.md`
- 提交规范：`docs/commit-guide.md`
- MCP 工具顺序：`docs/mcp-usage-guide.md`
- UI/UX 待办与经验：`docs/uiux-todo.md`
- Web 上传文档：`docs/web-uploader.zh-CN.md`

阅读 `docs/` 时，先看标题和前 10 行判断相关性；真正修改或调试该主题时再读完整文档。

## 代码与注释

- 优先最小必要改动，复用已有组件、hook、repository、schema 和 helper。
- 不引入新依赖，除非现有工具和平台能力明显不足，并在说明中写清原因。
- 函数超过 10 行或有副作用时需要函数头注释；注释解释“为什么”，不要复述代码。
- 业务规则、边界条件、兼容 shim、性能取舍要用短注释标明。
- 如果需要很多注释才能看懂，先重构结构。
- 修复前端 UI/UX 问题时，必须在修复代码处加注释说明问题和修复原因，方便后续审查和回溯。

## Git 规则

- `main` 是生产分支，不在 `main` 上直接提交日常开发。
- 分支命名使用 `codex/<topic>`。
- 提交格式：`<type>: <summary>`，常用 `feat` / `fix` / `refactor` / `style` / `docs` / `chore`。
- 一个提交只解决一类问题。代码改动需要文档同步时，相关文档和代码放在同一提交；不相关改动不要混提交。
- 提交前至少运行与改动范围匹配的检查；无法运行时要说明原因和剩余风险。

## 禁止事项

- 不要只读 README 或记忆就断言当前行为。
- 不要未经确认删除、重置或覆盖用户已有改动。
- 不要把 `mcp-vector-search` 或 lint 建议当作自动重构命令。
- 不要在同一改动里同时改 publish 输出逻辑和 public export/deploy 运行逻辑。
- 不要为了边缘或临时功能增加脆弱测试。
