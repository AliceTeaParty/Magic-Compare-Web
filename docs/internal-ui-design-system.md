# 共享 UI 设计基线

内部工作台与公开 Viewer 统一以 [Material Design 3](https://m3.material.io/) 的信息架构、颜色角色和组件状态为设计基线，使用 MUI 作为 React 实现层。公开站直接复用内部 Viewer 的主题、导航几何和检查交互，再移除内部目的地、写操作与发布管理信息。

## 主题

- 颜色由 `SchemeExpressive` 和一个 seed color 生成，组件只消费 `primary`、`secondary`、`tertiary`、状态色与 `surfaceContainer*` 语义角色。
- 默认提供鸢尾、泻湖、珊瑚三组主题色，并允许输入自定义十六进制 seed。
- 明暗模式首次访问跟随系统；内部站与公开站的用户切换由 MUI color schemes 持久化，两站使用同一套 scheme。
- Surface 层级负责区分导航、页面、列表和浮层。常规页面不使用渐变、阴影或嵌套卡片制造层级。

## 导航与页面

- 手机使用 top app bar 和 temporary drawer。
- 中等宽度使用 80px navigation rail。
- 页面标题统一使用固定高度的 `InternalPageHeader`。返回、标题和 actions 均有稳定布局槽，异步状态和按钮显隐不得推动相邻元素。
- Case 目录、Case workspace、Upload 共用同一 app shell；viewer 在该 shell 的内容区内全宽显示。
- 公开 Viewer 使用只读 app shell：导航仅保留 Logo、主题控制和版本，内容区继续使用相同的全宽 workbench、header、stage、filmstrip 和 details pane。
- 两站导航 Logo 和 favicon 分别由 `MAGIC_COMPARE_INTERNAL_*` 与 `MAGIC_COMPARE_PUBLIC_*` URL 变量配置，空值使用仓库内置资源。

## 公开站边界

- 公开站只读取 published manifest 和公开素材 URL，不引入 SQLite、S3 内部访问或 `/api/ops/*`。
- Viewer 的对比模式、缩放、胶片条、详情 Drawer 和使用引导与内部站保持一致。
- 内部 Group 跳转、发布状态、公开 Slug、上传和部署不进入公开站。
- 公开站的 404 与 footer 使用相同的 surface、排版和状态颜色，不保留独立旧主题。

## 控件与反馈

- 页面命令使用 Material Symbols 对应的 MUI Icons；只有命令含义不明确时同时显示文字。
- 空状态可以使用 Microsoft Fluent Emoji，不能用 Emoji 代替错误、成功、上传阶段等功能状态图标。
- 模式切换使用 connected segmented control。编辑、保存、暂停等状态切换必须复用固定尺寸的控制槽。
- 高频图标按钮和拖拽把手使用至少 40px 的命中区域；目录卡片等单一目的表面把整个表面作为导航目标。
- 尚未适用的次级动作退出焦点和点击顺序；若它稍后出现会推动主动作，则保留不可见布局槽，并把主动作放在槽前。
- 临时反馈只显示最新一条 Snackbar；需要用户处理的错误保留在页面内容流中。
- Snackbar 只报告当前操作或当前环境；不重复提示用户已经满足的浏览器条件。
- 删除等不可逆动作使用统一 Dialog，明确对象与影响；取消抽屉或 Dialog 时恢复已提交数据，不保留隐形草稿。
- Viewer 只在素材仍可到达时显示 loading skeleton；图片请求失败后停止进度动画并标明 Before / After 错误，不用空表面冒充画面。
- 动效只表达状态或空间关系，使用 M3 standard easing，不对位置稳定的控件添加装饰性位移。

## 交互判断

- 优先减少决定数量和无效操作，主动作保持可发现，恢复路径放在空结果附近。
- 相关控件使用共同容器、间距和状态层表达关系，不依赖卡片上浮或尺寸变化。
- 400ms 内先反馈已接收操作；超过该时长的生成、上传、部署和保存使用组件原生 loading 或进度状态。
- 使用常见的 Web 与 Material 交互模型：整卡导航、返回上一级、exclusive toggle、temporary drawer、Dialog 和 Snackbar。

## 响应式检查

- 主要检查宽度为 390px、840px 和 1440px。
- 每次涉及交互布局的改动至少检查明暗模式、长标题、菜单/抽屉打开、保存/取消/失败与页面返回。
- 不允许横向溢出、内容被 app bar 或 navigation rail 遮挡、滚动条引发标题栏横向位移。

## 资源来源

- 颜色与组件规范：[Material Design 3](https://m3.material.io/)
- React 组件与主题能力：[MUI](https://mui.com/material-ui/)
- 交互取舍：[Laws of UX](https://lawsofux.com/)
- 空状态插图：[Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)，MIT License
