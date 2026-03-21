# 前端刷新记录（2026-03-20）

这份文档记录本轮整站色系、布局、viewer 交互与移动端优化开始前的已知状态，作为后续实现和回归检查的依据。

## 当前 docs 列表

- `docs/vseditor-workflow.zh-CN.md`
- `docs/demo-vs-real-case-flow.zh-CN.md`
- `docs/mcp-usage-guide.md`
- `docs/project-overview-guide.md`
- `docs/ui-improvements/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`

## 本轮已读取并作为约束的文档

- `docs/project-overview-guide.md`
- `docs/ui-improvements/2026-03-20-viewer-stage-and-filmstrip-notes.zh-CN.md`
- `docs/demo-vs-real-case-flow.zh-CN.md`

## 当前前端状态

### 主题

- 当前全站仍然使用一套偏黄铜 / 冷钢灰的深色主题。
- 主题值大多是手写 hex 与 `alpha(...)`，还没有进入可复用的种子色 + tonal palette 体系。
- catalog、workspace、viewer 虽然共享同一主题文件，但还没有一套稳定的语义 token。

### Catalog / Case Workspace

- catalog 顶部标题区在宽屏下仍然比下方 case 卡片网格窄。
- case workspace 顶部标题区虽然已经做过重排，但版心与下方 groups 区域仍然不够紧密统一。
- 现有 `group-visibility` 能力已经存在，但还需要更强的状态提示与更稳定的节奏排版。

### Group Viewer

- 主舞台已经是自控实现，不再依赖 compare slider 黑盒。
- 胶片带已经改成原生横向滚动，但当前仍然暴露原生滚动条视觉。
- fit view 已改为“原位适配 + scrollIntoView”，不再额外叠一层舞台。
- heatmap 目前仍然是独立 `object-fit: contain` 的叠层，存在潜在边缘不完全对齐风险。
- A / B 目前只有基本切换，没有图片内缩放和平移能力。
- 移动端还没有旋转舞台的专门优化。

## 本轮目标

- 基于下列 5 色种子接入 Material Color Utilities，生成暗色 tonal palette：
  - `#E4C2F2`
  - `#3747A6`
  - `#32498C`
  - `#152B59`
  - `#F2EBC9`
- 以 `#152B59` 作为全站背景根色。
- 优先重做 catalog 与 case workspace 的布局、间距和视觉节奏。
- group viewer 只做必要修复：
  - heatmap 对齐
  - 自绘胶片带滚动条
  - A / B 点击循环切换
  - A / B 图片内缩放 / 平移
  - 小屏竖屏自动旋转舞台
  - fit view 更贴窗口

## 必须保留的 viewer 约束

- 主舞台尺寸由我们自己控制，不交给黑盒轮播 / compare 组件。
- 胶片带底层仍然是真滚动，不回退到轮播模拟。
- fit view 仍然是原位适配，不再回到额外叠层方案。
- heatmap 必须与基底图片共享同一个 media rect，不能各自独立 contain。

## 本轮默认交互约束

- 小屏竖屏视口下自动将舞台媒体层顺时针旋转 90 度。
- `A / B` 的缩放与平移状态在每次切换 frame 或模式时重置。
- 手机端隐藏 fit 按钮。
- 桌面端 `Ctrl + 滚轮` 才拦截缩放；普通滚轮不接管浏览器页面滚动。
