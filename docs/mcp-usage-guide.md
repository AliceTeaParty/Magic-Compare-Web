# MCP 使用指南

本文档约束本仓库开发时的 MCP 使用顺序与查询策略。
目标是先证据后实现，减少凭记忆编码和重复造轮子。

## 目标

优先使用现有 MCP 获取权威信息，减少猜测、减少过时实现。

## 工具分工

- **next-js_docs**：查询 Next.js 官方文档。凡是路由、App Router、静态生成、Server Actions、构建、部署、缓存等问题，优先查这里。
- **context7**：查询最新第三方库文档。用于 React、MUI、Prisma、Zod、dnd-kit、Motion 等实现细节。
- **mcp-vector-search**：搜索当前代码库。先查现有目录、组件、命名、已有模式，再决定新增或修改方案。（结果为空/error 时尝试 `mcp-vector-search index`）
- **cloudflare_api**: These MCP servers allow your MCP client to read configurations from your Cloudflare account, process information, make suggestions based on data, and even make those suggested changes for you.

## 根脚本快捷方式

- `pnpm mcp:doctor`：先检查 CLI 依赖和本地环境是否正常。
- `pnpm mcp:status`：查看当前索引、统计和健康状态。
- `pnpm mcp:index`：重跑索引主入口；结果异常或索引缺失时先用它。
- `pnpm mcp:index:kg`：只补知识图谱阶段。
- `pnpm mcp:search -- "<query>"`：走语义搜索，适合先找现有实现。
- `pnpm mcp:complexity`：快速看当前热点文件/函数。
- `pnpm mcp:dead-code`：做一轮死代码候选排查。

## 使用原则

1. **先搜代码，再写代码**。先用 `mcp-vector-search` 确认仓库已有结构、命名和复用点。
2. **先查官方，再下结论**。Next.js 优先 `next-js_docs`；Cloudflare 优先 `cloudflare_api`；其他库优先 `context7`。
3. **避免凭记忆实现框架细节**。
4. **优先复用现有模式**。已有组件、schema、工具函数优先延用，不重复造轮子。
5. **把查询结果转成实现约束**。查到的信息要落实到代码结构、类型、路由、API 约定中。

## 禁止事项

- 不看仓库现状就直接大改目录。
- 不查文档就凭经验写。
- 引入新依赖前不先确认现有方案是否已足够。
