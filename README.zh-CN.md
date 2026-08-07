# Magic Compare Web

[English](./README.md) | [简体中文](./README.zh-CN.md)

Magic Compare Web 是一个用于图像对比查看和发布的 monorepo，面向压制组及相近评审流程，重点是集中检查 before/after 差异，不提供视频处理或站内讨论流程。

## 项目范围

- `internal-site`：带服务端能力的目录、Case 工作区、viewer、Web 上传、发布、导出和部署操作。
- `public-site`：根据已发布 manifest 生成的静态只读页面。
- `packages/`：共享 viewer 逻辑、内容 schema、UI 和工具函数。

## 快速开始

```bash
cp .env.example .env
# 填写必要的 MAGIC_COMPARE_S3_* 配置。
pnpm install
pnpm dev
```

本地入口：

- 内部站：<http://localhost:3000>
- 公开站：<http://localhost:3001>
- Demo 页面：<http://localhost:3001/g/demo-grain-study--banding-check>

需要修复 demo 数据时使用 `pnpm dev:bootstrap`；需要同时运行两个站点时使用 `pnpm dev:all`。

## 工作流

### 上传

打开 `/upload`，检查配对计划后，对选中的图片集执行预检和上传。浏览器行为与当前上传协议以 Web 上传文档为准。

### 发布

在内部站发布 Case，需要时再显式导出或部署公开站。发布、导出和部署是三个独立动作。

## 仓库结构

```text
apps/internal-site/   带服务端能力的内部工作区
apps/public-site/     静态公开 viewer
packages/              共享 schema、viewer 逻辑、UI 和工具函数
output/published/      生成的 published manifest 与 demo 内容
docs/                  工作流、API、部署和 UI 文档
```

## 常用命令

| 任务                   | 命令                 |
| ---------------------- | -------------------- |
| 启动内部站             | `pnpm dev`           |
| 同时启动两个站点       | `pnpm dev:all`       |
| 修复 demo 后启动       | `pnpm dev:bootstrap` |
| 构建两个应用           | `pnpm build`         |
| 运行检查和测试         | `pnpm check`         |
| 运行浏览器冒烟         | `pnpm test:e2e`      |
| 初始化 SQLite          | `pnpm db:push`       |
| 写入 demo 数据         | `pnpm db:seed`       |
| 导出公开站             | `pnpm public:export` |
| 部署公开站             | `pnpm public:deploy` |
| 启动本地 Docker 运行时 | `pnpm docker:dev:up` |

## 配置

复制 `.env.example` 为 `.env`。内部素材使用 S3-compatible 存储；本地 Docker 开发使用 Compose 配置和 named volumes。运行时、存储和部署细节见工作流指南。

## 相关文档

- [工作流与部署指南](./docs/workflow-guide.md)
- [Web 上传工作台](./docs/web-uploader.zh-CN.md)
- [API 合约参考](./docs/reference/api-endpoints.zh-CN.md)
- [数据库架构](./docs/reference/database-architecture.zh-CN.md)
- [Demo 与真实 Case / Group 流程差异](./docs/reference/demo-vs-real.zh-CN.md)
- [UI/UX 待办与经验](./docs/uiux-todo.md)
- [提交规范](./docs/commit-guide.md)
- [English README](./README.md)

## 许可证

本仓库基于 [GNU General Public License v3.0](./LICENSE) 发布。
