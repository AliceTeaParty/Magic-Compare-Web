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
- 长文件名信息应进 caption、tooltip 或文件列，不应进入 Frame 主标题。主标题服务扫描和排序，VSEditor 导入优先显示 `<episode>-<frame>`。
- 放弃上传不能只是清空前端状态。已经 prepare 的对象前缀属于远端 pending 状态，必须同时取消服务端 job 并清理 pending 对象，避免下次续传读到 stale state。
- CJK 目录名生成 slug 时先转写再 kebab；否则中文/日文目录会退化成 `uploaded-group`，用户要手动补信息。
- 重新选择上传目录应被视为新的上传意图。由目录推断出的 slug / 标题必须刷新，不能让上一个目录的自动填充值静默留在表单里。
- VSEditor 类文件名解析不能写死 `.gen.vpy` 或 `fps_` 前缀；实际素材可能来自 `.m2ts` / `.mkv` / `.mp4` 等源标记，也可能省略开头 fps。
- 上传性能瓶颈经常不是单个 PUT 的带宽，而是 presign / PUT 往返延迟。同一 frame 的 original / thumbnail / alternate 文件可以并发 PUT，但 frame commit 仍应串行，避免 SQLite 写入冲突。
- 可编辑列名必须保持列语义唯一。不要允许备选列重命名为 `Before` / `After` / `Heatmap` 或现有列名，否则全局 heatmap 参考和表格阅读都会变得含糊。
- 上传页局部样式超过三处复用时先抽本地 tokens / primitives。面板 surface、控件圆角、列表行、缩略图这类语义稳定的值不要继续散落在 `sx` 里。

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
