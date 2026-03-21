# UI 改进经验与教训（2026-03-21）

这份文档记录 2026-03-21 这一轮 UI 调整后，当前仓库里已经验证有效的前端结论、实现约束与踩坑经验。

它的用途不是复述需求，而是帮助后续继续迭代时：

- 不把已经修好的 viewer / workspace 细节做坏
- 不把临时兼容方案重新误当成主链路
- 在继续打磨交互时，优先沿用当前已经稳定的方向

## 1. Viewer 的核心约束已经比较明确

### 主舞台必须保持自控

- `Swipe`、`A / B`、`Heatmap` 三种模式都不应依赖黑盒 compare 组件自行推导尺寸。
- 主舞台尺寸、裁切、缩放、旋转和 media rect 必须由我们自己控制。
- 任何“组件自己很聪明地决定大小”的方案，后续都很容易在大量 frame、移动端旋转、fit view 或 heatmap overlay 场景中出问题。

### 胶片带必须是真滚动，不是轮播假象

- 现在胶片带的稳定方向是：原生横向滚动 + 自绘 thumb。
- 拖拽、触控板和滚轮应统一驱动同一个 scroll state。
- 可以继续增强惯性、边缘阻尼和 thumb 视觉，但不要退回“carousel 轨道 + 模拟拖拽”的思路。

### fit view 的正确方向是“原位适配”

- 这轮已经确认：fit view 不应该再叠一层新的 viewer。
- 正确做法是：
  - 只缩放当前主舞台组件
  - 保持版面其余部分不参与缩放
  - 在需要时滚动页面，让舞台进入更好的观察位置
- 这比额外浮一层 viewer 更可维护，也更不容易状态错位。

## 2. 目前最容易回退的细节

### 标题栏不要压得太紧

- group viewer 顶部标题行一旦 `line-height` 太低、底部 padding 太小，就会出现：
  - `g`、`y` 这种下探字母被下边框压住
  - 方括号、日文/中文混排下半部被裁掉一点
- 当前经验是：标题行高和底部余量要略偏保守，不能只看英文大写字母。

### 控件组要按“同一层级同一高度”处理

- `Swipe / A / B / Heatmap / A-B side select / details icon` 这些控件放在同一工具栏时，视觉高度必须统一。
- workspace 中的 `Internal / Public` 切换控件如果明显高于左右 chip / `Open`，会显得突兀。
- 后续再调 toolbar / workspace 时，优先看“视觉基线一致”，而不是单个控件看起来够不够显眼。

### 子标题字重要明确弱于主标题、强于正文

- 右侧栏的 `Group navigator / Frame details / Asset metadata` 这类区块标题，`500` 左右是当前更合适的区间。
- 如果过轻，会和正文糊在一起；如果过重，又会抢走主内容焦点。

## 3. 颜色和背景系统的结论

### 背景必须比种子色本身更暗

- 直接使用 `#152B59` 作为大面积底色，实际观感还是会偏亮。
- 当前更稳的做法是继续使用它的更低 tone 派生色，保证页面背景比种子色本身再暗一档。
- 同时 radial 高光必须克制，否则很容易把底色“抬灰”。

### 表面层次要靠 tone 与透明度，而不是靠堆很多不同蓝色

- 现在主题更稳定的方向是：
  - 同一深色种子派生出 `default / paper / raised / elevated`
  - 用透明度和边框做层次
  - 避免再混入过多额外蓝色 surface

## 4. Workspace / Catalog 的布局经验

### 标题区和内容区必须同宽

- catalog 和 case workspace 在宽屏下，如果标题区比下面内容区窄，会显得像“模板页 + 临时插入内容块”。
- 当前经验是：标题区宽度应直接跟随下方主要内容列宽，不额外收窄。

### description 要预留空间，不要因空值改变节奏

- case 卡片和 group 条目如果 description 可空，布局不能因为“这一条没描述”就把下方 chip / 按钮向上顶。
- 最稳的做法仍然是给 description 保底高度，让条目纵向节奏保持稳定。

### group 可见性切换是一组控件

- `Internal / Public` 是一个状态切换组，不是两个彼此独立的按钮。
- 外层加一个轻底座是对的，但高度必须控制住，避免比同一行其它元素更厚重。

## 5. 与图片交互相关的经验

### 禁止浏览器原生图片拖拽干扰 viewer

- 胶片带和主舞台里，图片本身都必须禁用浏览器原生拖拽。
- 否则会出现：
  - 拖胶片带时触发浏览器图片拖拽/新窗口/搜索
  - 拖 `Swipe` 时被浏览器默认行为抢走事件

### heatmap 必须共享同一 media rect

- heatmap overlay 如果和 base image 各自独立 `object-fit: contain`，极容易出现两侧亮边或边缘错位。
- 正确方向已经明确：base 和 overlay 共用同一套 media rect 与定位计算。

### A / B 缩放只缩图片，不缩布局

- 桌面端 `Ctrl + wheel`、移动端双指缩放，目标都应是舞台内部图片内容。
- 不应该把整个 viewer 容器一起缩放，也不应该影响工具栏、胶片带和侧栏布局。

## 6. 兼容链路的原则

### 能删的旧链路要删，不能靠“先兼容一下”长期拖着

- 这轮已经把 internal 的动态图片路由从主链路里拿掉。
- 当前保留的公开 `/cases/[caseSlug]/groups/[groupSlug] -> /g/[publicSlug]` 只是明确标记的 `legacy-compat route`。
- 后续如果再引入兼容方案，必须满足两点：
  - 标注明确用途
  - 不得伪装成新的正常主链路

## 7. 当前建议的后续打磨顺序

如果后面继续做 UI 优化，建议优先级按下面顺序走：

1. 真机和窄屏验收 mobile viewer 手感
2. 胶片带 thumb、惯性和 hover 视觉微调
3. workspace / catalog 的空状态与 loading 动效统一
4. 再考虑更细的字体层级和标题栏节奏

不要优先去做：

- 再次替换主舞台比较组件
- 把胶片带改回轮播式轨道
- 恢复图片走站内动态代理的旧读图链路

## 相关文件

- `packages/ui/src/viewer/group-viewer-workbench.tsx`
- `packages/ui/src/theme/magic-theme-provider.tsx`
- `packages/ui/src/theme/magic-color-tokens.ts`
- `apps/internal-site/components/case-workspace-board.tsx`
- `apps/internal-site/components/case-directory-grid.tsx`
