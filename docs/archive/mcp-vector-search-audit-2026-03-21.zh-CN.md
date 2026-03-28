# mcp-vector-search 更新后的代码库状态与经验（2026-03-21）

这份文档记录在更新 `mcp-vector-search` 之后，对当前仓库做的一轮代码状态梳理、热点识别和实际重构结论。

它的用途不是复述某次对话，而是帮助后续继续做清理、压行数和结构重构时：

- 先看清当前真正的复杂度热点
- 区分“可以直接删的冗余”和“虽然肥但仍在主链路上的活代码”
- 记住这次已经验证过的边界，避免重复踩坑

文档对应状态：

- commit: `93b390e`
- worktree: clean
- 分析工具：更新后的 `mcp-vector-search`

## 1. 当前仓库状态

### 仓库整体结构没有大问题

当前仓库仍然是比较清晰的 monorepo：

- `apps/internal-site`: 内部工作台、导入、发布、公开导出、部署入口
- `apps/public-site`: 静态公开站点
- `packages/compare-core`: viewer 状态和舞台计算
- `packages/ui`: 共享 UI 与 viewer workbench
- `packages/shared-utils`: 通用工具
- `tools/uploader`: 导入工具链

更新后的 `mcp-vector-search` 给出的摘要是：

- Total Files: `277`
- Total Functions: `368`
- Total Classes: `18`
- Average File Complexity: `1.42`
- Average Health Score: `0.90`
- Code Smells: `53 warnings`
- Circular dependencies: `0`

结论：

- 当前问题不是依赖图打结
- 当前问题主要是局部职责堆积和局部重复实现

### 这轮已经落地的安全缩减

这次已经确认并提交的低风险缩减包括：

- 把两个 app 里重复的 workspace `.env` 加载逻辑抽成共享 helper
- 把两个 app 完全相同的根布局壳抽成共享 `MagicRootLayoutShell`
- 把两个脚本里的重复 env 解析逻辑收敛到 `scripts/lib/workspace-env.mjs`
- GHCR 发布镜像收缩为 `linux/amd64`，不再保留无实际用途的 `arm64` 产物

经验上，这类“重复代码去重”是当前最稳的缩减来源，因为：

- 行数能明显下降
- 行为边界清晰
- 回归风险相对可控

## 2. 更新后的热点识别结果

这次 `mcp-vector-search` 返回的热点结果明显比之前更接近真实源码，而不是被生成目录噪音带偏。

当前最值得关注的热点有：

1. `packages/compare-core/src/state/use-viewer-controller.ts`
2. `apps/internal-site/lib/server/publish/publish-case.ts`
3. `packages/shared-utils/src/workspace-env.ts`
4. `scripts/lib/workspace-env.mjs`
5. `tools/uploader/src/auth.py`
6. `tools/uploader/src/cli.py`

这份结果的一个重要意义是：

- 现在能更快看出“热点在真实业务代码里，而不是构建产物里”
- 后续如果继续做重构，可以更放心地把工具输出当成优先级参考，而不是只当辅助噪音

## 3. 这轮确认下来的真实结论

### 主要债务是职责集中，不是废弃代码泛滥

这轮检查后，最重要的判断是：

- 仓库里并没有很多“完全没人用、可以一刀删掉”的整块模块
- 更大的问题是少数文件承载了太多职责

尤其明显的是：

- `apps/internal-site/lib/server/repositories/content-repository.ts`
- `apps/internal-site/lib/server/publish/publish-case.ts`
- `packages/ui/src/viewer/group-viewer-workbench.tsx`
- `apps/internal-site/components/case-workspace-board.tsx`

这些文件的问题不是“死”，而是“活得太重”。

### `content-repository.ts` 已经是后端 God file

这个文件同时承担了：

- case 列表查询
- case 搜索
- workspace 数据聚合
- viewer 数据聚合
- import manifest 写入
- group 重排
- frame 重排
- group 可见性切换
- group 删除与发布副作用处理

后续如果继续往这里加逻辑，只会让回归风险和测试成本继续上升。

更合理的拆分方向是：

- `content-queries.ts`
- `import-service.ts`
- `group-service.ts`

### `publish-case.ts` 仍然是单函数式发布流水线

这个模块现在把下面几件事放在一个主函数里：

- 公开 slug 分配
- publishable group / frame / asset 过滤
- before / after 资产校验
- manifest 组装
- 发布目录重置与落盘
- case 发布状态回写

这类代码短期还能工作，但不利于：

- 单元测试
- 局部复用
- 后续把 publish 行为拆成 preview / dry-run / publish 等模式

建议后续至少拆成：

- `ensurePublicSlug`
- `buildPublishManifest`
- `publishGroup`

### 大组件不是废弃代码，但已经是维护热点

目前最明显的前端大组件是：

- `packages/ui/src/viewer/group-viewer-workbench.tsx`
- `apps/internal-site/components/case-workspace-board.tsx`

它们现在仍然是主链路组件，不应贸然删除。

但后续应该按职责切块，而不是继续在原文件里叠逻辑。建议优先拆出：

- 工具栏
- 通知层
- 列表项 / 行项目
- 独立交互 hook

### 真正接近“可删”的只有兼容链路

当前最接近废弃代码定义的，是：

- `scripts/write-public-route-aliases.mjs`

它明确服务于旧公开链接兼容：

- `/cases/[caseSlug]/groups/[groupSlug]`
- 跳转到 `/g/[publicSlug]`

因此它不属于“误删就没影响”的冗余，而是“只有在业务上确认不再需要旧链接时，才可以整段砍掉”的兼容代码。

结论是：

- 现在不能把它当普通死代码直接删
- 但它应当始终被视为兼容支线，而不是主链路

## 4. 这次真正踩到的坑

### 共享包出口必须区分 browser-safe 和 Node-only

这次做 env loader 去重时，曾把 `workspace-env.ts` 从 `@magic-compare/shared-utils` 根出口直接 re-export。

结果是：

- `packages/ui` 会经由 `@magic-compare/shared-utils` 根入口拿到 Node-only helper
- Next.js 构建 public-site 时把 `node:fs`、`node:path`、`node:url` 带进了前端图
- `next build` 直接失败

这个问题的教训非常明确：

- 浏览器可达共享包的根出口必须只暴露 browser-safe API
- 任何依赖 `node:*` 的 helper 都应该走单独 subpath export
- “只是服务端会用到”不是足够条件，必须看它会不会从共享包根入口被前端间接看到

当前已经采用的修正方式是：

- 保留 `@magic-compare/shared-utils` 根出口给浏览器安全工具
- 把 Node-only 的 env helper 放到 `@magic-compare/shared-utils/workspace-env`

这条经验以后必须继续遵守。

### 工具准确度提高后，更适合拿来排优先级，不适合代替判断

更新后的 `mcp-vector-search` 这次明显更靠谱，但它仍然不是最终裁决者。

比较合适的用法是：

- 用它先找热点
- 再用实际代码阅读确认哪些是结构债务，哪些只是文件大但合理

不要直接把热点文件等同于“应该立刻重写”。

## 5. 当前建议的后续顺序

如果后面继续做“压行数 + 减维护成本”，建议优先级如下：

1. 拆 `apps/internal-site/lib/server/repositories/content-repository.ts`
2. 拆 `apps/internal-site/lib/server/publish/publish-case.ts`
3. 拆 `packages/ui/src/viewer/group-viewer-workbench.tsx`
4. 拆 `apps/internal-site/components/case-workspace-board.tsx`
5. 业务确认后，再决定是否删除 `scripts/write-public-route-aliases.mjs`

不建议优先做的事：

- 到处零碎改小 util，追求表面上的“文件更短”
- 在没确认兼容需求前直接删 legacy alias 生成脚本
- 把 Node-only helper 再次从共享包根出口暴露出去

## 6. 一句话版本

更新后的 `mcp-vector-search` 已经足够帮助我们更快找准真实热点。

当前仓库最大的问题不是循环依赖，也不是大量废弃代码，而是：

- 少数核心文件承担了过多职责
- 兼容链路需要明确标识，不要伪装成主链路
- 共享包出口必须严格区分前端安全 API 和 Node-only API

## 相关文件

- `apps/internal-site/lib/server/repositories/content-repository.ts`
- `apps/internal-site/lib/server/publish/publish-case.ts`
- `packages/ui/src/viewer/group-viewer-workbench.tsx`
- `apps/internal-site/components/case-workspace-board.tsx`
- `packages/shared-utils/src/workspace-env.ts`
- `scripts/lib/workspace-env.mjs`
- `scripts/write-public-route-aliases.mjs`
