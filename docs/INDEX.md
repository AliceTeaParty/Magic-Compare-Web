# docs/INDEX.md

文档索引，按场景快速定位目标文档。每次新增或移动文档后同步更新本文件。

## 按场景查找

| 场景 | 首选文档 |
|---|---|
| 理解整体工作流、约束与已知坑 | [workflow-guide.md](workflow-guide.md) |
| API 对接、上传链路开发 | [reference/api-endpoints.zh-CN.md](reference/api-endpoints.zh-CN.md) |
| demo 与真实导入内容如何区别 | [reference/demo-vs-real.zh-CN.md](reference/demo-vs-real.zh-CN.md) |
| 提交/分支规范 | [commit-guide.md](commit-guide.md) |
| MCP 工具使用优先级 | [mcp-usage-guide.md](mcp-usage-guide.md) |
| Uploader 操作说明（面向组员） | [uploader/README.md](uploader/README.md) |
| 从 VSEditor 平铺目录开始上传 | [uploader/vseditor-workflow.zh-CN.md](uploader/vseditor-workflow.zh-CN.md) |
| Uploader 与网站边界划分 | [uploader/boundaries-and-env-split.zh-CN.md](uploader/boundaries-and-env-split.zh-CN.md) |
| Uploader 分发与构建 | [uploader/distribution.zh-CN.md](uploader/distribution.zh-CN.md) |

## 文档分层

### 常青规范（高可信度，低变更频率）

直接读、优先信。

- [workflow-guide.md](workflow-guide.md) — 工作流、架构分工、数据存储、已知坑，当前最权威的单文档
- [commit-guide.md](commit-guide.md) — 提交粒度、分支规则、message 格式
- [mcp-usage-guide.md](mcp-usage-guide.md) — MCP 工具分工与使用原则

### 时效性参考（需随代码同步更新）

准确但会随实现变化；读前先确认文档日期和代码是否一致。

- [reference/api-endpoints.zh-CN.md](reference/api-endpoints.zh-CN.md) — internal-site 全部 `/api/ops/*` 端点清单
- [reference/demo-vs-real.zh-CN.md](reference/demo-vs-real.zh-CN.md) — demo 与真实 case/group 流程对比

### Uploader 用户文档

面向使用 uploader 上传素材的组员，受众独立。

- [uploader/README.md](uploader/README.md)
- [uploader/vseditor-workflow.zh-CN.md](uploader/vseditor-workflow.zh-CN.md)
- [uploader/boundaries-and-env-split.zh-CN.md](uploader/boundaries-and-env-split.zh-CN.md)
- [uploader/distribution.zh-CN.md](uploader/distribution.zh-CN.md)

### 历史存档（仅供追溯）

已解决的问题与过时的规划。**不要把 archive/ 的内容当作当前约束来遵守。**

- [archive/2026-03-26-r2-frame-upload-rewrite-notes.zh-CN.md](archive/2026-03-26-r2-frame-upload-rewrite-notes.zh-CN.md)
- [archive/2026-03-28-maintainability-cleanup-notes.zh-CN.md](archive/2026-03-28-maintainability-cleanup-notes.zh-CN.md)
- [archive/2026-03-28-uploader-progress-and-throughput-notes.zh-CN.md](archive/2026-03-28-uploader-progress-and-throughput-notes.zh-CN.md)
- [archive/uploader-frontend-roadmap-2026-03-21.zh-CN.md](archive/uploader-frontend-roadmap-2026-03-21.zh-CN.md)
- [archive/ci-ghcr-lessons.zh-CN.md](archive/ci-ghcr-lessons.zh-CN.md)
- [archive/browser-smoke-and-ci-prep.zh-CN.md](archive/browser-smoke-and-ci-prep.zh-CN.md)
- [archive/mcp-vector-search-audit-2026-03-21.zh-CN.md](archive/mcp-vector-search-audit-2026-03-21.zh-CN.md)
- [archive/mcp-vector-search-usable-commands-2026-03-21.zh-CN.md](archive/mcp-vector-search-usable-commands-2026-03-21.zh-CN.md)
- [archive/project-overview-guide.md](archive/project-overview-guide.md)
- [archive/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md](archive/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md)
- [archive/2026-03-21-viewer-and-workspace-lessons.zh-CN.md](archive/2026-03-21-viewer-and-workspace-lessons.zh-CN.md)
- [archive/2026-03-20-frontend-refresh.zh-CN.md](archive/2026-03-20-frontend-refresh.zh-CN.md)
- [archive/2026-03-21-footer-and-runtime-config-notes.zh-CN.md](archive/2026-03-21-footer-and-runtime-config-notes.zh-CN.md)

## 维护约定

- 新增文档：在本文件对应分层中补一行。
- 移动/重命名文档：同一提交内修复所有引用，并更新本文件。
- 升级存档：若 archive/ 中的某个结论被采纳为当前规范，将其结论提取到对应常青文档，原 archive 文件保留不动。
