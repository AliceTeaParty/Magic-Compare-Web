# mcp-vector-search 可用命令清单（2026-03-21）

本文档整理了在本仓库内实测通过的 `mcp-vector-search` 命令、可替代写法与已知缺陷。
目标是给后续排查复杂度、查重和调用关系提供一份可直接执行的命令基线。

## 1. 适用范围

- 适用仓库：Magic-Compare-Web
- 测试日期：2026-03-21
- 说明：`mvs` 是 `mcp-vector-search` 的别名，两者等价

## 2. 可直接使用的命令

### 2.1 复杂度与热点分析

```bash
# 完整复杂度分析（控制台输出）
mcp-vector-search analyze complexity

# 只看前 10 个热点
mcp-vector-search analyze complexity --top 10

# 导出 JSON（用于后续脚本处理）
mcp-vector-search analyze complexity --json

# 导出 SARIF（用于 GitHub 集成）
mcp-vector-search analyze complexity --format sarif --output report.sarif

# 导出 Markdown 报告（Top 20 热点）
mcp-vector-search analyze complexity --format markdown --top 20
```

### 2.2 语义搜索与相似实现

```bash
# 搜索错误处理相关实现
mcp-vector-search search "error handling logic"

# 搜索校验相关实现
mcp-vector-search search "validation check"

# 搜索另一种表述的校验逻辑
mcp-vector-search search "validation logic"

# 按文件查相似实现（注意是 --similar 选项，不是 similar 子命令）
mcp-vector-search search --similar "apps/internal-site/app/api/ops/case-search/route.ts" --json --limit 3
```

### 2.3 死代码分析

```bash
# 控制台查看死代码候选
mcp-vector-search analyze dead-code
```

### 2.4 知识图谱与调用关系

```bash
# 推荐：构建知识图谱
mcp-vector-search index kg

# 兼容：旧命令也能用，但会提示 deprecated
mcp-vector-search kg build

# 查询实体关系（entity 必须是实体名，不是自然语言问题）
mcp-vector-search kg query "PublicSiteOperationConflictError"

# 查询函数调用关系（适合评估重构影响范围）
mcp-vector-search kg calls "parse_request"
```

## 3. 不可用或不建议使用的命令

下列写法在当前版本中不可用，或在本仓库内不可靠。

```bash
# 不存在的参数
mcp-vector-search analyze complexity --sarif
mcp-vector-search analyze complexity --all
mcp-vector-search analyze complexity --output-format markdown --top 20
mcp-vector-search analyze dead-code --sarif

# 错误语法（similar 不是子命令）
mcp-vector-search search similar "path/to/function.py:25"

# 用自然语言提问 kg query（会被当成实体名，通常查不到）
mcp-vector-search kg query "find all callers of parse_request"
mcp-vector-search kg query "show all functions in module auth"
mcp-vector-search kg query "find all callers of TechnicalDebtEstimator"
```

## 4. 当前版本已知缺陷

### 4.1 dead-code 机器可读导出不稳定

在本仓库实测中，以下命令会报错并返回非 0 退出码：

```bash
mcp-vector-search analyze dead-code --output json
mcp-vector-search analyze dead-code --output sarif --output-file report.sarif
```

典型错误：

```text
Object of type PosixPath is not JSON serializable
```

建议：

- 当前阶段仅将 `analyze dead-code` 用于控制台人工排查
- 暂不把 dead-code 的 JSON/SARIF 导出接入 CI 质量门禁

## 5. 推荐执行顺序（最小闭环）

```bash
# 1) 先看复杂度热点
mcp-vector-search analyze complexity --top 20

# 2) 输出 JSON，便于后续自动筛选 D/F、长方法等
mcp-vector-search analyze complexity --json > complexity.json

# 3) 语义搜索重复实现线索
mcp-vector-search search "validation logic"
mcp-vector-search search "error handling logic"

# 4) 构建知识图谱并查看调用影响面
mcp-vector-search index kg
mcp-vector-search kg calls "<hotspot_function_name>"
```

## 6. 使用注意事项

- `kg query` 参数应是“实体名”，例如函数名、类名、模块实体名。
- 若 `kg calls` 提示找不到函数，先确认函数名是否和索引中的实体名一致。
- 复杂度报告会包含构建产物噪音时，可结合路径过滤或先清理索引策略后再分析。
- 如果 CLI 升级，建议先运行 `mcp-vector-search --help` 与子命令 `--help` 复核参数变更。
