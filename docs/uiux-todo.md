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
- Dialog 不是普通表单套壳。`新建 Case` 这类高频 internal 操作要继承工作台 surface、divider、字段密度和 action hierarchy，不能退回默认浅色 MUI 弹窗。
- 版本号、commit hash 属于低权重运行信息。它应和 footer copyright 同级显示，不应因为字号、字重或间距看起来像另一个品牌或状态标签。
- 同级路由的页头必须复用同一高度和 divider 坐标。全局导航已经能回到父级时，工作区不再重复返回按钮；为单页另设 compact header 会让目录与工作区切换时分割线上下跳动。
- 长目录与短工作区切换时要为根滚动容器设置 `scrollbar-gutter: stable`。只统一 header 高度仍会因滚动条出现与消失造成约 17px 的可用宽度变化，让 divider 右端和页面级动作横向抖动。
- 数量和状态摘要不要伪装成筛选器。`1 Group`、`0 公开` 这类只读指标属于 Case 设置元数据，使用图标与低权重文本即可；放在列表标题旁或使用描边 Chip 都会让它们看起来可以点击。
- 高频工作台条目适合拆成身份区和固定操作底栏。标题、描述在上层，素材标签、帧数、公开范围和行级动作在独立 tonal footer；编辑态替换固定宽度的右侧动作组，不能在常态预留一个看得见的空按钮位。
- 选中态必须成对使用主题的 container / on-container 角色。直接使用饱和 `main` 色容易在个性化 seed 和深色模式下变成突兀色块；hover 只增加 state layer，不改变尺寸和位置。
- Slug、发布状态等不可编辑信息不应放进 disabled TextField。禁用输入框会暗示“当前不可编辑”，并引入多余的 label、outline 和低对比文字；带图标的只读 metadata row 更符合实际语义。
- Case 设置在宽屏作为 sticky supporting pane，在窄屏作为右侧 Drawer；两种容器复用同一份表单内容和草稿状态，避免响应式切换时重建表单、丢失输入或产生 hydration 分支。
- Navigation rail 的品牌标记按 rail 全宽居中，不能沿用 extended rail 的左内边距；同一内容进入 modal drawer 时则需要恢复标准 leading inset，避免贴住屏幕边缘。
- 同一个全局动作只保留一个入口。上传已经是 navigation rail destination，目录、工作区和空状态不再重复放上传按钮；依赖当前 Case 数据的部署动作由工作区注册状态和回调，导航只负责展示，避免复制请求逻辑。
- 异步保存、部署等短期状态使用固定定位的 Snackbar / Alert，不进入列表文档流。否则“正在保存”出现和消失会推动全部 Group，造成内容位置变化。
- 删除确认框必须让动作名称成为主标题，删除范围和后果作为较小、较轻的 supporting text；Case 和 Group 复用同一组件，避免两套字号和字重再次分叉。
- Inline editor 的新长度上限不能在进入编辑态时裁切旧数据。完整展示超限值、显示计数并禁用保存，只有用户主动修正后才写回，避免“打开再保存”静默破坏元数据。

## P1

- [x] 修复高频工作流的目标尺寸、状态反馈和移动端动作换行
      Catalog 卡片使用整面导航；Group 编辑前后的动作坐标保持不变；上传菜单按会话状态进入交互树；异步按钮显示 loading；删除使用统一确认 Dialog。

- [x] Catalog 增加 `search + status filter + updated sort`
      目录使用客户端搜索、状态筛选和更新时间排序，直接复用服务端首屏返回的完整 Case 列表。

- [x] Viewer header 增加常驻的 `Back to workspace`
      Internal viewer header 提供固定的工作区返回入口，details drawer 保留 Group 导航。

- [x] 重构 viewer 工具栏的信息层级
      模式切换使用 connected control，主图、引导和详情操作使用固定图标槽，A/B 控件占用固定次级行。

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
