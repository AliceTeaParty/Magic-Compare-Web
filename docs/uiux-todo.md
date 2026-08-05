# UI/UX TODO

这份文档记录当前 Web 站点 UI/UX 审计后的待办项，作为后续逐项实现和勾选的唯一清单。

范围以 `internal-site` 的 catalog、case workspace、group viewer 为主，结论基于本地开发环境与 Playwright 实机走查。

## 使用方式

- 完成某一项后，直接把对应的 `- [ ]` 改成 `- [x]`
- 如果实现中发现原问题判断有误，先更新该条描述，再进入开发
- 新增 UI/UX 问题时，按优先级插入本清单，不另起散落文档

## 前端细节修复经验

- Inline edit 不应在编辑态改变真实盒模型。下划线、焦点线这类 affordance 优先用伪元素绘制，并在非编辑态预留相同空间，避免 `border` / `padding` 切换造成 1px 位移。
- 同一位置的按钮状态切换必须固定控制槽尺寸。`Edit` 切换为保存/取消图标时，按钮组宽高、行高和对齐方式应保持稳定，避免文本、chips、页面按钮和下方列表一起抖动。
- `contentEditable` 更像“文档正文”而不是表单控件。Case summary 和 Group metadata 应复用同一套文本 affordance，限制长度和同步 draft 状态放在逻辑层，视觉层保持自然 inline。
- 验证布局位移时要等页面入场动画结束后再量坐标。否则会把 motion 动画误判为编辑态布局回流。
- 保存动作不应触发整页刷新或 replay 入口动画，除非确实需要重新拉取服务端数据。局部 optimistic state 能覆盖的元数据编辑应优先局部更新。
- Web 上传这类工作台页面要避免把说明文案当作结构。标题下的长说明会稀释操作层级；常态帮助信息应进入 toast 或空状态，页面只保留字段标签、状态、错误和主动作。
- 上传流程按真实状态渐进展开：未选目录时只要求目标 Case 和素材来源；扫描完成后再显示 Group 元数据与配对检查；生成和上传开始后才出现进度详情。不要让尚未发生的步骤长期占据空面板。
- 上传任务带必须直接映射扫描、配对、资源生成和上传状态，错误落在实际失败阶段。阶段摘要只报告目录名、Frame 数、问题数或进度，不能用一条泛化状态掩盖失败位置。
- 扫描完成后，配对表是上传页的主工作区，Group 信息是 sticky supporting pane。移动端仍要保留每行状态图标；状态是只读结果，不使用看似可点击的 Chip。
- `defaultMode` 会进入最终 Group payload，必须在上传前提供滑动、A/B、热图的显式选择，不能把真实业务字段硬编码在组件 state 中。
- 圆角要体现父子关系：外层面板可以接近站内卡片圆角，输入、列表行、缩略预览必须更小；不要让子元素继承 pill 或比父容器更圆。
- 低饱和或粉色渐变的 primary button 不一定适合白字。按钮文字颜色必须按实际背景验证，必要时为该按钮显式指定深色文字。
- 大目录预览不要提前创建所有 object URL。只为当前展开或可见的行生成预览，并在切换/卸载时释放，避免上传页在预演阶段吃掉大量内存。
- 拖拽重排序如果影响最终上传顺序，必须同步更新上传计划并清空已生成的缓存产物。否则 UI 顺序和实际 commit 顺序会分叉。
- 表格级选项必须表达真实可上传数据。Heatmap 这类全局参考只展示每一行都存在的列，不能在缺列行里静默 fallback 到 After。
- VSEditor 导入默认以 `<episode>-<frame>` 保持 Frame 列可扫描；当结构化推断不符合实际命名时，提供显式的文件名模式，使用 `<文件名前缀> - <frame>` 作为最终标题。
- 放弃上传不能只是清空前端状态。已经 prepare 的对象前缀属于远端 pending 状态，必须同时取消服务端 job 并清理 pending 对象，避免下次续传读到 stale state。
- CJK 目录名生成 slug 时先转写再 kebab；否则中文/日文目录会退化成 `uploaded-group`，用户要手动补信息。
- 重新选择上传目录应被视为新的上传意图。由目录推断出的 slug / 标题必须刷新，不能让上一个目录的自动填充值静默留在表单里。
- VSEditor 类文件名解析不能写死 `.gen.vpy` 或 `fps_` 前缀；实际素材可能来自 `.m2ts` / `.mkv` / `.mp4` 等源标记，也可能省略开头 fps。
- 上传性能瓶颈经常不是单个 PUT 的带宽，而是 presign / PUT 往返延迟。同一 frame 的 original / thumbnail / alternate 文件可以并发 PUT，但 frame commit 仍应串行，避免 SQLite 写入冲突。
- 可编辑列名必须保持列语义唯一。不要允许备选列重命名为 `Before` / `After` / `Heatmap` 或现有列名，否则全局 heatmap 参考和表格阅读都会变得含糊。
- 上传页局部样式超过三处复用时先抽本地 tokens / primitives。面板 surface、控件圆角、列表行、缩略图这类语义稳定的值不要继续散落在 `sx` 里。
- 站点级 header action 要同源。Catalog、Case workspace、Upload 的返回、上传、部署、新建入口应共享相近高度、圆角和文案权重，避免某一页出现“嵌套胶囊按钮”或孤立按钮组。
- Dialog 不是普通表单套壳。`新建 Case` 这类高频 internal 操作要继承工作台 surface、divider、字段密度和 action hierarchy；标题必须显式高于 supporting text，不能依赖页面继承字号。
- 版本号、commit hash 属于低权重运行信息。它应从构建环境进入持久导航的 utility 区，与 footer copyright 同级显示；短版本常驻，完整 build identity 放入 tooltip。
- 同级路由的页头必须复用同一高度和 divider 坐标。全局导航已经能回到父级时，工作区不再重复返回按钮；为单页另设 compact header 会让目录与工作区切换时分割线上下跳动。
- 长目录与短工作区切换时要为根滚动容器设置 `scrollbar-gutter: stable`。只统一 header 高度仍会因滚动条出现与消失造成约 17px 的可用宽度变化，让 divider 右端和页面级动作横向抖动。
- 数量和状态摘要不要伪装成筛选器。`1 Group`、`0 公开` 这类只读指标属于 Case 设置元数据，使用图标与低权重文本即可；放在列表标题旁或使用描边 Chip 都会让它们看起来可以点击。
- 高频工作台条目适合拆成身份区和固定操作底栏。标题、描述在上层，素材标签、帧数、公开范围和行级动作在独立 tonal footer；编辑态替换固定宽度的右侧动作组，不能在常态预留一个看得见的空按钮位。
- 选中态必须成对使用主题的 container / on-container 角色。直接使用饱和 `main` 色容易在个性化 seed 和深色模式下变成突兀色块；hover 只增加 state layer，不改变尺寸和位置。
- Slug、发布状态等不可编辑信息不应放进 disabled TextField。禁用输入框会暗示“当前不可编辑”，并引入多余的 label、outline 和低对比文字；带图标的只读 metadata row 更符合实际语义。
- Case 设置在宽屏作为 sticky supporting pane，在窄屏作为右侧 Drawer；两种容器复用同一份表单内容和草稿状态，避免响应式切换时重建表单、丢失输入或产生 hydration 分支。
- Navigation rail 的品牌标记按 rail 全宽居中，不能沿用 extended rail 的左内边距；同一内容进入 modal drawer 时则需要恢复标准 leading inset，避免贴住屏幕边缘。
- 同一个全局动作只保留一个入口。上传已经是 navigation rail destination，目录、工作区和空状态不再重复放上传按钮；公开站点部署由应用外壳统一发起，不读取当前路由的 Case 或 Group 状态。
- 全局导航在所有桌面断点保持 `80px` rail，不因窗口变宽扩展为带横向标签的侧栏。移动端使用 modal drawer，并以整行 container 表示当前目的地；两种形态复用同一导航顺序和动作状态。
- 部署入口始终占用固定导航位置并使用主题主色。它执行不带 `caseId` 的全站部署，仅在请求进行中临时禁用，空 Group 页面和非 Case 路由不会改变可用性。
- 当前 Case 工作区入口同样始终占用固定导航位置。没有 Case 上下文时显示禁用态，进入 Case 及其 Viewer 子路由后原位启用和选中，避免全局目的地顺序变化。
- 异步保存、部署等短期状态由应用外壳上的单一 Provider 管理，并通过 Portal 固定到视口；页面只负责推送消息，不各自渲染通知层。否则 transformed 路由容器会把 `position: fixed` 变成局部定位，或让多个队列在不同位置重复出现。
- 删除确认框必须让动作名称成为主标题，删除范围和后果作为较小、较轻的 supporting text；Case 和 Group 复用同一组件，避免两套字号和字重再次分叉。
- Inline editor 的新长度上限不能在进入编辑态时裁切旧数据。完整展示超限值、显示计数并禁用保存，只有用户主动修正后才写回，避免“打开再保存”静默破坏元数据。
- 字段长度限制要用真实 Case 校准。Group 标题允许 20 个字符；单行省略不能只写在文字节点上，所在的每层 flex/grid track 都要允许收缩，并设置 `min-width: 0` 与明确的 overflow 边界，否则移动端右侧动作仍会被长标题推出屏幕。
- Viewer 的模式专属控件必须占用固定 contextual slot。A/B 缩放和热图透明度在同一位置替换，首次提示悬浮在主图上方；不能用隐藏整行或在主图下方插入控件来维持稳定，否则会浪费空间或推动胶片条。
- Viewer 的可用变量、当前变量和默认主显示素材是三种不同语义。工具栏和详情面板必须复用 `getComparisonTargetAssets` 等数据解析入口，不能用 `isPrimaryDisplay` 推断完整变量集合，否则三列上传会把 `Flt` 等可选变量写丢。
- 窄屏 Viewer 工具栏按模式、工具、变量、模式上下文分行，每一行都限制在容器宽度内。桌面打开过的 supporting pane 偏好不能在移动端恢复成首屏遮挡 Drawer；移动端关闭后仍允许用户主动打开。
- Viewer 桌面端按“视图工具、模式”排列两个三联组；移动端只保留帮助和详情两联组，并把它放进标题行右侧。标题与描述始终单行省略，不能为了容纳工具造成换行或 header 高度跳变。
- Viewer 标题列使用零 flex 基准并限制为可用剩余宽度，宽屏和窄屏都由 CSS 单行省略。页面已经设置 `scrollbar-gutter: stable` 时，帮助和移动详情 Drawer 应关闭 MUI 的额外 scroll lock 补偿，避免重复增加 body 右内边距。
- 同一 Case 内切换 Group 属于 Viewer 数据更新，不是整页层级跳转。普通点击先从内部 dataset API 读取并缓存目标 Group，再原位更新 Viewer 和 History URL；不替换 Server Component 页面树。新标签页、直接访问和跨层级导航仍使用标准路由。这样详情栏、模式和检查状态不会因 Group slug 改变而重置，前进后退也能复用同一缓存。
- 同级异步导航要合并 hover、focus、touch 与 click 产生的重复请求，并用递增序号只提交最后一次选择。加载期间重新点击当前项应取消待提交目标；否则慢请求可能在用户改变主意后把界面反向切回。
- 路由加载只能有一个全局反馈源。根级 `loading.tsx` 不得再把页面替换成带内边距的嵌套骨架；顶边进度条延迟短暂显示，让已预取的快速切换直接完成，慢请求仍及时反馈。
- Popover、Menu、Select 这类锚定面板不应锁定文档滚动；短暂选择不值得让整页横向位移。Drawer、Dialog 这类阻断式面板使用共享的根节点滚动锁，并以引用计数支持嵌套；锁定期间保留根节点的 stable scrollbar gutter，不再向 `body` 或 `main` 注入宽度补偿。
- 同一 supporting pane 在宽屏 `aside` 和窄屏 Drawer 中必须复用内容结构与 surface 层级。Drawer 可以因触控和模态语义使用更宽面板、全高滚动、遮罩与滑入动效，但外层 surface 不能与内部 tonal list 使用同一角色，否则列表底色会消失。
- 移动端 Viewer 详情与帮助使用模态 Drawer 时由共享根节点锁阻止背景滚动，不能保留一条挤压内容宽度的页面滚动条。发布状态使用足量内边距的低强调状态容器，公开 Slug 直接承担文字链接语义。
- Viewer 胶片条是高频扫描工具，缩略图密度应高于普通内容卡片。选中态使用主题 container / on-container，图片 `alt` 留空并由按钮提供唯一名称，避免读屏名称重复；hover 只改变 state layer，不抬升卡片。
- Internal Viewer 不单独提供返回按钮。全局侧栏在 Case 路由下增加当前“工作区”目的地，桌面 rail 与移动 drawer 复用同一导航模型，避免同一层级出现两套返回方式。
- 服务端时间戳进入浏览器后再用 `Intl.DateTimeFormat` 按用户 locale 与 time zone 格式化；hydration 期间保留固定高度，不展示可能错误的 UTC 值。

## P1

- [x] 修复高频工作流的目标尺寸、状态反馈和移动端动作换行
      Catalog 卡片使用整面导航；Group 编辑前后的动作坐标保持不变；上传菜单按会话状态进入交互树；异步按钮显示 loading；删除使用统一确认 Dialog。

- [x] Catalog 增加 `search + status filter + updated sort`
      目录使用客户端搜索、状态筛选和更新时间排序，直接复用服务端首屏返回的完整 Case 列表。

- [x] 全局侧栏增加当前 Case 的工作区入口
      Case 工作区和 Viewer 共用侧栏目的地，Viewer header 只保留 Group 标识；details drawer 保留 Group 导航。

- [x] 重构 viewer 工具栏的信息层级
      模式切换使用 connected control，主图、引导和详情操作使用固定图标槽；A/B 和热图控件共用固定 contextual slot，移动端分行避免边缘裁切。

- [x] 重新梳理 workspace 中 group 行的操作优先级
      可见性作为 container 色状态控件，打开作为行主动作，编辑和删除改为带 tooltip 的次级图标动作；身份区与操作底栏分层，编辑前后动作坐标保持不变。

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

## Case 工作区复核

- 复核日期：`2026-08-04`
- 复核环境：本地 `internal-site` 开发服务器 + in-app browser + Chrome DevTools
- 复核页面：`/`、`/cases/ikoku-nikki`、`/cases/uploadtest2`
- 已验证状态：浅色、深色、Group 编辑、取消编辑、Group/Case 删除确认框、`390x844` 移动抽屉、目录与工作区 header 坐标、生产构建

## 对比图复核

- 复核日期：`2026-08-05`
- 复核环境：本地 `internal-site` 开发服务器 + in-app browser
- 复核页面：`/cases/ikoku-nikki/groups/tv`、`/cases/ultraman-tiga/groups/tv`、`/cases/ultraman-tiga/groups/movie`、`/cases/ultraman-gaia/groups/movie`
- 已验证状态：浅色、深色、`Src / Rip / Flt` 三变量切换、滑动、A/B、热图、详情侧栏、当前 Case 工作区导航、浏览器本地时间、桌面 `112px` header、Group dataset 原位切换、浏览器前进后退、单一局部加载反馈、窄屏无横向溢出、宽窄侧栏 surface 层级、颜色面板和嵌套 Drawer 无滚动条位移、模式切换不推动主图与胶片条

## 上传工作台复核

- 复核日期：`2026-08-05`
- 复核环境：本地 `internal-site` 开发服务器 + in-app browser
- 复核页面：`/upload`
- 已验证状态：浅色、深色、未选择目录、四阶段任务带、桌面 `1440x1000`、移动端 `390x844`、无横向溢出
