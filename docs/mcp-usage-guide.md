# MCP 使用指南

本文档约束本仓库开发时的 MCP 使用顺序与查询策略。
目标是先证据后实现，减少凭记忆编码和重复造轮子。

> 最近核对：2026-06-27，`mcp-vector-search version 4.1.14 (build 401)`。

## 目标

优先使用现有 MCP 获取权威信息，减少猜测、减少过时实现。

## 工具分工

- **next-js_docs**：查询 Next.js 官方文档。凡是路由、App Router、静态生成、Server Actions、构建、部署、缓存等问题，优先查这里。
- **context7**：查询最新第三方库文档。用于 React、MUI、Prisma、Zod、dnd-kit、Motion 等实现细节。
- **cloudflare_api**: These MCP servers allow your MCP client to read configurations from your Cloudflare account, process information, make suggestions based on data, and even make those suggested changes for you.
- **mcp-vector-search**：仓库内辅助定位工具，用于语义搜索、复杂度线索、死代码候选、知识图谱和调用影响面初筛。它的输出只能作为参考信号，不能替代人工阅读源码、测试、浏览器验证或官方文档确认。

## 根脚本快捷方式

- `pnpm mcp:doctor`：先检查 CLI 依赖和本地环境是否正常。
- `pnpm mcp:status`：查看当前索引、统计和健康状态。
- `pnpm mcp:index`：重跑索引主入口；结果异常或索引缺失时先用它。
- `pnpm mcp:index:kg`：只补知识图谱阶段。
- `pnpm mcp:search -- "<query>"`：走语义搜索，适合先找现有实现。当前 CLI 默认使用 hybrid search、query expansion、MMR 和 rerank；如结果过散，可加 `-- --files "*.ts"`、`-- --language typescript`、`-- --no-rerank` 或 `-- --search-mode bm25` 做收窄。
- `pnpm mcp:complexity`：快速看当前热点文件/函数。复杂度评级只是重构候选线索，不是 P 级优先级或验收标准。
- `pnpm mcp:dead-code`：做一轮死代码候选排查。删除前必须用 `rg`、类型检查、测试和实际调用链复核。

## mcp-vector-search 当前可用重点

`mcp-vector-search` 更新较快；参数以本机 `--help` 为准。当前 4.1.14 版本中，常用入口包括：

```bash
mcp-vector-search setup
mcp-vector-search search "error handling"
mcp-vector-search search --files "*.tsx" --language typescript "viewer stage image loading"
mcp-vector-search search --similar "packages/ui/src/viewer/workbench/viewer-stage.tsx" --json --limit 5
mcp-vector-search analyze complexity --top 20
mcp-vector-search analyze complexity --changed-only --top 20
mcp-vector-search analyze complexity --json > analysis.json
mcp-vector-search analyze dead-code
mcp-vector-search index kg
mcp-vector-search kg calls "<function_name>"
mcp-vector-search visualize
mcp-vector-search wiki
```

## 使用原则

1. **先查官方，再下结论**。Next.js 优先 `next-js_docs`；Cloudflare 优先 `cloudflare_api`；其他库优先 `context7`。
2. **避免凭记忆实现框架细节**。
3. **优先复用现有模式**。已有组件、schema、工具函数优先延用，不重复造轮子。
4. **把查询结果转成实现约束**。查到的信息要落实到代码结构、类型、路由、API 约定中。
5. **mcp-vector-search 结果必须二次确认**。复杂度、dead-code、review、chat 输出都只算“提示”；进入实现或评审结论前，必须回到源码、测试输出、运行时页面或官方文档。
6. **用 changed-only 控制范围**。针对当前改动做体检时优先 `mcp-vector-search analyze complexity --changed-only --top 20`，避免被 `.next`、vendor 或历史热点噪音带偏。

## 禁止事项

- 不看仓库现状就直接大改目录。
- 不查文档就凭经验写。
- 引入新依赖前不先确认现有方案是否已足够。
- 不把 `mcp-vector-search` 的复杂度等级、dead-code 候选、AI review 或 chat 回答当作最终裁决。
- 不因为工具提示 D/F、dead-code 或 code smell 就直接重构/删除；必须先确认真实用户路径、模块边界和测试覆盖。
