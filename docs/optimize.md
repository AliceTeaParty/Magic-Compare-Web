# Magic-Compare-Web 工程体检报告

对仓库结构、代码质量、文档健康度的全面体检，按风险/收益/改动范围排序。

---

## 一、仓库结构与主要模块职责

```
Magic-Compare-Web (~28K LOC, monorepo)
├── apps/
│   ├── internal-site/   (15K LOC, 204 files)  — Next.js 15 服务端应用：Case 管理、工作区、查看器、15 个 API 端点、发布管线
│   └── public-site/     (1.4K LOC, 82 files)  — 纯静态导出站点：读 manifest.json → 渲染查看器，无写 API
├── packages/
│   ├── content-schema/  (423 LOC)   — Zod schema + TS 类型：Case/Group/Frame/Asset/Manifest
│   ├── shared-utils/    (155 LOC)   — 工具函数：slug 构建、排序、日期格式化
│   ├── compare-core/    (1.1K LOC)  — 查看器状态管理 (useViewerController) + 数据/Stage 工具
│   └── ui/              (4.8K LOC)  — 共享 MUI 暗色主题、查看器 Workbench (Stage/Filmstrip/Sidebar)
├── tools/uploader/      (5.4K LOC, Python) — CLI：扫描本地图片目录 → presigned PUT → 调 API 完成导入
├── scripts/             — clean、sync-published、export-public、deploy-public、route-aliases
├── docker/              — Dockerfile + compose (dev/ci override)
└── docs/                — 23 篇文档，含 INDEX.md 索引、workflow-guide、api-endpoints 等
```

**架构边界总体评价：** 包依赖图无环，public-site 未反向导入 internal-site，S3 Client 限于 storage 层内——这些硬边界守得很好。

---

## 二、最复杂、最脆弱、最值得重构的 5 个区域

### 1. Upload 状态机（风险 HIGH / 收益 HIGH / 改动范围 MEDIUM）

| 文件 | LOC |
|------|-----|
| `apps/internal-site/lib/server/uploads/upload-service-helpers.ts` | 681 |
| `apps/internal-site/lib/server/uploads/upload-service.ts` | 427 |
| `tools/uploader/src/upload_executor.py` | 826 |

**问题：**
- `upload-service-helpers.ts` 包含 15 条直接 Prisma 查询 + 多步事务，`clearGroupForRestart()` (L268-315) 依赖 frame→group→job 的更新顺序，如 frame 成功但 group 失败会产生不一致状态
- `upload_executor.py` 用 ThreadPoolExecutor + RLock，20+ 嵌套闭包共享 `UploadRuntimeState`，异常处理仅捕获 `str(error)` 丢失 traceback
- Upload 状态用字符串字面量 `"pending"/"committed"/"failed"`，无类型守卫或判别联合
- Python 端的 resume 逻辑 (L322) 通过 `frame.order == frame_order` 匹配，int/str 类型不一致时静默跳过

### 2. Viewer Stage 渲染与手势交互（风险 MEDIUM / 收益 HIGH / 改动范围 MEDIUM）

| 文件 | LOC |
|------|-----|
| `packages/ui/src/viewer/workbench/viewer-stage.tsx` | 855 |
| `packages/ui/src/viewer/group-viewer-workbench.tsx` | 438 |
| `packages/ui/src/viewer/workbench/stage-pan-zoom-gestures.ts` | 366 |
| `packages/ui/src/viewer/workbench/filmstrip-drag-physics.ts` | 348 |

**问题：**
- `viewer-stage.tsx` 单文件 855 行，SwipeCompareStage (L230-434) 混合指针捕获、多指追踪与拖拽数学，`setPointerCapture` 无 try-catch
- `PositionedStageMedia` (L133-224) 含 12 层嵌套三元运算符用于 transform 计算
- `group-viewer-workbench.tsx` 含 8 个 useState + useViewerController 的 10+ 状态，总计 18+ 个状态变量协调，缺少不变量验证（如 `abStageActive=true` 但 `mode !== "a-b"` 时会怎样？）
- useEffect 依赖跨 7 个 hook，变更一处易产生连锁 re-render

### 3. Python Wizard 交互向导（风险 LOW / 收益 MEDIUM / 改动范围 MEDIUM）

| 文件 | LOC |
|------|-----|
| `tools/uploader/src/wizard.py` | 865 |
| `tools/uploader/src/source_parser.py` | 657 |
| `tools/uploader/src/commands.py` | 570 |

**问题：**
- `wizard.py` 是全仓最大单文件，9 个嵌套辅助函数管理状态转移，`_choose_case()` (L321-399) 有 4 层 while→if→if 嵌套
- 各 stage 函数直接变异共享 `UploaderConfig`，与 `rich` 终端 UI 紧耦合
- `source_parser.py` 有 4 层帧匹配逻辑

### 4. API 路由错误处理模板（风险 MEDIUM / 收益 MEDIUM / 改动范围 SMALL）

15 个 `/api/ops/*/route.ts` 全部使用同一 catch 模式：
```typescript
catch (error) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Generic fallback." },
    { status: 400 },
  );
}
```
- 所有错误一律返回 400，不区分验证错误 vs 运行时异常 vs 资源不存在
- 部分路由 (`group-upload-start` 等) 额外处理了 ZodError → 400，但 500 级错误也被吞为 400
- 无服务端日志记录错误上下文
- 客户端无法区分可重试 vs 永久性失败

### 5. Publish 管线 + content-repository 伪抽象层（风险 MEDIUM / 收益 MEDIUM / 改动范围 LARGE）

| 文件 | LOC |
|------|-----|
| `apps/internal-site/lib/server/repositories/content-repository.ts` | 28 (仅 re-export) |
| `apps/internal-site/lib/server/publish/publish-case-service.ts` | — |
| `apps/internal-site/lib/server/content/mutation-service.ts` | 223 |
| `apps/internal-site/lib/server/content/query-service.ts` | — |

**问题：**
- `content-repository.ts` 实际只是 barrel re-export，不是真正的抽象层——所有 8 个 service 文件直接 `import { prisma }` 执行共计 **44 条 Prisma 查询**
- publish-case-service.ts (L14-98) 含 85 行不可拆分的异步操作链
- `import-service.ts` 的 `applyImportManifest()` (L104-197) 有 3 层嵌套循环

---

## 三、重复逻辑、命名混乱、过长函数、跨层耦合、死代码、注释失效

### 重复逻辑

| 位置 | 问题 | 状态 |
|------|------|------|
| `import-service.ts:10-40` vs `upload-service-helpers.ts:114-127` | 存储路径推断与路径生成逻辑相似但分散 | 待处理 |
| ~~`content/mappers.ts` vs `build-publish-manifest.ts`~~ | ~~两个相同的 asset kind 映射函数~~ | **已修复** (8c99be5) |
| ~~`upload-service-helpers.ts:35-86`~~ | ~~多个 Prisma select 常量结构相似~~ | **已修复** — 提取 `baseJobFields` 基础字段集 |
| ~~15 个 API route~~ | ~~完全相同的 try/catch 错误处理 boilerplate~~ | **已修复** (83c89bd) — `withApiRoute()` wrapper |
| ~~两个 app 的 `runtime-config.ts`~~ | ~~`HIDE_DEMO_ENV_NAME` / `PUBLISHED_ROOT_ENV_NAME` 常量重复声明~~ | **已修复** — 提升至 `shared-utils` |
| ~~`magic-theme-provider.tsx`~~ | ~~transition 字符串重复 3 次、heading fontFamily 重复 5 次~~ | **已修复** — 提取 `interactiveTransition()` + `DISPLAY_HEADING_FAMILY` |

### 命名混乱

| 问题 | 示例 |
|------|------|
| "published" vs "public" 混用 | `resolvePublishedGroupUrl()` / `getPublishedGroupDirectory()` / `getPublishedManifest()` (published) vs `public-export` / `public-deploy` / `publicSlug` (public) |
| subtitle 幽灵字段 | 14 个文件引用 `subtitle`，`import-service.ts:101` / `query-service.ts:92` / `build-publish-manifest.ts:149` 三处注释说"已弃用但保留"——但 schema 和 seed 仍然写入 |

### 过长函数 (>80 行)

| 文件 | 函数 | LOC | 说明 |
|------|------|-----|------|
| `wizard.py` | 整体模块 | 865 | 应拆为 orchestrator + stage handlers |
| `viewer-stage.tsx` | `SwipeCompareStage` | ~200 | 指针捕获 + 拖拽数学混合 |
| `upload_executor.py` | `execute_upload()` | ~300 | 线程池状态机 |
| `upload-service-helpers.ts` | `ensureCaseAndGroup()` | 105 | L408-512，4 层嵌套条件 |
| `import-service.ts` | `applyImportManifest()` | 94 | 3 层嵌套循环 |
| `init-db.ts` | `initializeSqliteSchema()` | 123 | SQL DDL 字符串，可拆出 |

### 跨层耦合

- **Repository 层形同虚设：** 44 条 Prisma 查询分散在 8 个 service 文件中，`content-repository.ts` 仅做 re-export
- **mappers.ts 直接使用 Prisma 类型：** 从 `@prisma/client` 导入行类型，而非通过 domain 类型隔离
- **env 散落：** `public-site/url.ts:17`、`runtime/commands.ts:33-34` 直接 `process.env[]` 而非通过 `runtime-config.ts`

### 死代码 / 待清理

| 项目 | 位置 | 状态 |
|------|------|------|
| `subtitle` 字段 | schema、seed、import、publish、query 共 14 文件 | 注释标记"已弃用"但仍在 schema 中占位 |
| `tools/others/` 目录 | 根目录 | 空目录占位 |

### 注释失效

| 文件 | 行 | 问题 |
|------|-----|------|
| `import-service.ts:101-102` | "keeps deprecated case fields like `subtitle` populated" | 三处重复说明同一件事 |
| `build-publish-manifest.ts:149-150` | "The public manifest contract still carries subtitle" | 同上 |
| `query-service.ts:92` | "intentionally omits deprecated `subtitle` propagation" | 同上——该清理字段本身而不是维护三处注释 |

---

## 四、文档过期或缺失

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `.env.example` 缺 4 个变量 | `MAGIC_COMPARE_SITE_URL`、`MAGIC_COMPARE_API_URL`、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET` 在 `.env` 中有但 `.env.example` 中未列出 | MEDIUM |
| packages/ 无 README | `compare-core`、`content-schema`、`shared-utils`、`ui` 四个包均无 README（内部包可接受，但缺少一句话职责描述不利于新成员上手） | LOW |
| 缺少架构图 | 无模块依赖图或数据流图 | LOW |
| 无端到端测试文档 | upload → publish → export 全链路缺少测试说明 | LOW |

**文档总体评价：** 文档质量很高——23 篇 markdown 全部路径有效，API 端点文档与实现完全匹配，命令文档与 package.json 一致，归档文档正确分离。

---

## 五、低风险清理任务清单

按 "风险↓ / 收益↓" 排序：

| # | 任务 | 风险 | 收益 | 范围 | 文件 | 状态 |
|---|------|------|------|------|------|------|
| 1 | ~~提取 API 路由错误处理为 `withApiRoute()`~~ | LOW | HIGH | 15 route files | `apps/internal-site/app/api/ops/*/route.ts` | **已完成** (83c89bd) |
| 2 | ~~合并两个 asset-kind 映射函数~~ | LOW | LOW | 2 files | `mappers.ts`, `build-publish-manifest.ts` | **已完成** (8c99be5) |
| 3 | 补全 `.env.example` 缺失的 4 个变量 | LOW | MEDIUM | 1 file | `.env.example` | |
| 4 | 删除空 `tools/others/` 目录 | LOW | LOW | 1 dir | `tools/others/` | |
| 5 | ~~收敛 `subtitle` 弃用注释~~ | LOW | LOW | 3 files | `import-service.ts`, `query-service.ts`, `build-publish-manifest.ts` | **已完成** (8c99be5) |
| 6 | 补充 4 个 packages/ 的一行 README 描述 | LOW | LOW | 4 files | `packages/*/README.md` | |
| 7 | 将 `public-site/url.ts` 和 `runtime/commands.ts` 的直接 `process.env` 迁入 `runtime-config.ts` | LOW | LOW | 3 files | 上述路径 | |

---

## 六、高收益重构但需谨慎推进的任务清单

按 "收益↓ / 风险↓" 排序：

| # | 任务 | 风险 | 收益 | 范围 | 关键文件 | 注意事项 | 状态 |
|---|------|------|------|------|----------|----------|------|
| 1 | **Upload 状态机类型化**：用 TypeScript discriminated union 替代字符串字面量状态，Python 端用 Enum 替代 str | MEDIUM | HIGH | ~10 files | `upload-service-helpers.ts`, `upload-service.ts`, `upload_executor.py`, `contracts.ts` | 需同步 TS 和 Python 两端；先加类型约束再逐步迁移 | |
| 2 | ~~**拆分 `viewer-stage.tsx`**~~ | MEDIUM | HIGH | 3-5 new files | `packages/ui/src/viewer/workbench/viewer-stage.tsx` | 855 → 387 行 | **已完成** (0971aa5) |
| 3 | **Repository 层实体化**：将 44 条 Prisma 查询收归 repository 方法，services 只调 repository | HIGH | HIGH | ~10 files | `content-repository.ts` + 8 service files | 改动面最大，需逐个迁移并保持测试绿灯；分 4-5 个 PR 推进 |
| 4 | **拆分 `wizard.py`**：拆为 orchestrator + 独立 stage module（choose_case、confirm_plan、resolve_layout 等） | LOW | MEDIUM | 3-5 new files | `tools/uploader/src/wizard.py` | Python 端相对独立，风险较低；已有 23 个测试文件覆盖 |
| 5 | **`subtitle` 字段正式下线**：从 schema、seed、import、publish 全链路移除，schema 版本号 bump | MEDIUM | LOW | 14 files | `content-schema/src/index.ts` 起，向上 14 文件 | 需确认无外部消费者依赖此字段；建议先在 PublishManifest 中标为 optional → 下个版本删除 |
| 6 | **API 错误分级**：区分 400 (validation) / 404 (not found) / 409 (conflict) / 500 (runtime)，增加服务端错误日志 | MEDIUM | MEDIUM | 15 route files + 共享 error types | `apps/internal-site/app/api/ops/*/route.ts` | 与任务 5.1 (`withApiRoute` 提取) 配合做 |

---

**总体评价：** 架构清晰、文档质量高、类型安全性好。核心债务集中在 upload 状态机的类型安全、viewer stage 的文件体积、以及 repository 层的虚假抽象。低风险清理可以立即执行；高收益重构建议按 upload 类型化 → viewer 拆分 → repository 实体化的顺序逐步推进。
