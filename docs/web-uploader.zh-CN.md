# Web 上传工作台

这份文档记录当前推荐的上传入口：`internal-site` 的 `/upload` 页面。

## 入口

- 页面：`/upload`
- 预选 Case：`/upload?case=<caseSlug>`
- 入口按钮：Internal Catalog 和 Case Workspace 中的 `上传对比`

## 当前能力

- 页面使用 `素材 -> 配对 -> 生成 -> 上传` 四阶段任务带；生成阶段先完成全量预检，再进入逐帧衍生与上传。
- 未选择目录时只显示目标 Case 和素材入口；扫描完成后切换为 Group 配置侧栏与配对检查区；生成或上传时再显示进度详情。
- 选择本地目录，推荐 Chrome / Edge 使用 `showDirectoryPicker()`。
- 浏览器不支持目录选择 API 时，退回 `<input webkitdirectory>`。
- 扫描平铺或常见 before / after 目录结构。
- 从文件或目录后缀推断 `Before`、`Src`、`After`、`Rip`、`Flt`、`NoDeband`、`Degrain` 等对比列；文件名里的显式后缀优先于目录提示。
- `out` / `output` / `after` 作为主 `After`；没有这些变量时优先用 `rip`，并把 `flt` / `filter` / `filtered` 保留为独立比较列。
- 基准列、主比较列和备选列的表头都可以在上传前编辑；上传开始后锁定。列名必须全局唯一，且不能命名为 `Heatmap`。
- VSEditor 文件名允许带 `.gen.vpy` / `.m2ts` 等 source marker，也允许省略 marker。
- VSEditor 文件名默认显示为 `<episode>-<frame>`；配对预览可以切换到 `<文件名前缀> - <frame>`，并把选择写入最终上传标题。
- 右侧 `配对预览` 可展开单行预览，并在上传前拖拽调整 frame 顺序。
- 上传前可以选择 Group 默认打开的 Viewer 模式：滑动、A/B 或热图。
- Heatmap 参考是全局设置，只检查需要自动生成 heatmap 的 frame，并只显示这些 frame 都存在的列。
- 首次 PUT 前会完成全部文件的配对、变量确认、图片解码、尺寸检查、SHA-256、heatmap 配置和 frame 数检查。
- 预检通过后使用 `stream-v2`：一帧生成完成就立即走 `prepare -> presigned PUT -> commit`，不等待整个 Group 的缩略图和 heatmap 全部生成。
- 上传中可以暂停；放弃上传会取消浏览器请求、取消 active job，并清理未提交的 pending 对象前缀。

## 数据与性能边界

- `File` / `Blob` 不进入 React state；页面只保存轻量 render model。
- 图片生成在 worker 中执行，避免阻塞主线程。
- 当前固定使用 1 个生成 worker；每个 worker 最多保留一帧衍生结果，全局 PUT 最多 6 路、单帧最多 3 路。
- 右侧缩略图只在行接近视口或展开时创建 object URL，并在卸载时释放。
- 重排序、Frame 标题模式、列名修改、Heatmap 参考变化都会使预检结果失效，保证远端 job 的输入哈希与当前计划一致。
- 上传 commit 仍串行收口，减少 SQLite 写入冲突。
- 浏览器生成的缩略图和 heatmap 只保留到对应 frame 提交或失败；提交后立即释放 Blob。暂停会终止 worker 和 PUT，继续时跳过服务端已提交 frame。
- 未声明 `stream-v2` 的调用继续发送完整 frame 快照，原有 API 合约保持不变。

## 命名与 slug

- Web 上传会从目录名或公共前缀推断 group slug 和标题。
- 中文会转拼音，假名会转 romaji，然后再统一 kebab-case。
- 手动编辑 slug 时仍遵守内部 slug 规则：小写字母、数字、单连字符。
- 公开 `publicSlug` 仍由发布流程生成，不由上传页直接写入。

## 相关实现

- 页面：`apps/internal-site/app/upload/page.tsx`
- 工作台：`apps/internal-site/components/web-uploader/`
- 上传 API：`apps/internal-site/app/api/ops/group-upload-*`
- 上传服务：`apps/internal-site/lib/server/uploads/`
