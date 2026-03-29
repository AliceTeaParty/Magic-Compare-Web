# UI/UX TODO

这份文档记录当前 Web 站点 UI/UX 审计后的待办项，作为后续逐项实现和勾选的唯一清单。

范围以 `internal-site` 的 catalog、case workspace、group viewer 为主，结论基于本地开发环境与 Playwright 实机走查。

## 使用方式

- 完成某一项后，直接把对应的 `- [ ]` 改成 `- [x]`
- 如果实现中发现原问题判断有误，先更新该条描述，再进入开发
- 新增 UI/UX 问题时，按优先级插入本清单，不另起散落文档

## P1

- [ ] Catalog 增加 `search + status filter + updated sort`
  当前 catalog 只有卡片流，case 数量上来后会强迫用户逐卡扫描，缺少快速分流能力。
  当前先不做。这项属于信息增强。

- [ ] Viewer header 增加常驻的 `Back to workspace`
  现在返回 workspace 的主入口藏在 details drawer 内，手机端尤其不利于快速回退。

- [ ] 重构 viewer 工具栏的信息层级
  将模式切换和页面级动作明确分组，降低纯图标按钮的理解成本，尤其是滚动到 stage 的动作。

- [ ] 重新梳理 workspace 中 group 行的操作优先级
  当前 `Internal / Public / Open` 和页面级主按钮同时争夺注意力，需要更明确地区分状态、跳转和次级动作。

## P2

- [x] 统一 internal UI chrome 的产品语言
  统一 `Internal catalog`、`Case workspace`、`Deploy Pages`、`Back to catalog`、`Open workspace` 等公共界面文案的语言策略，不影响内容标题自身语言。

- [x] 提升 catalog 卡片的信息辨识度
  目前摘要内容重复，导致列表更像样式样张而不是工作台；优先展示最近变更、备注或风险提示等真实工作信息。

- [x] 给 viewer 的首次使用提示增加可复看入口或常驻弱提示
  当前 1 秒轻提示过于瞬时，第一次没看到后几乎没有低打扰的重新发现机制。

## P3

- [x] 补齐站点 favicon
  当前本地走查仍会请求 `favicon.ico` 并返回 `404`，不影响核心任务，但会拉低完成度。

## 审计上下文

- 审计日期：`2026-03-29`
- 审计环境：本地 `internal-site` 开发服务器 + Playwright MCP
- 审计页面：
  - `/`
  - `/cases/dandadan`
  - `/cases/dandadan/groups/rip`
- 审计视口：
  - `1440x960`
  - `390x844`
