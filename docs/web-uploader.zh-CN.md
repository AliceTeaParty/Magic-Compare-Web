# Web 上传工作台

这份文档记录当前推荐的上传入口：`internal-site` 的 `/upload` 页面。

旧 Python uploader 已进入 FINAL / 弃用维护期。除兼容性、安全性或阻塞旧流程的问题外，新的上传能力默认补到 Web 工作台。

## 入口

- 页面：`/upload`
- 预选 Case：`/upload?case=<caseSlug>`
- 入口按钮：Internal Catalog 和 Case Workspace 中的 `上传对比`

## 当前能力

- 选择本地目录，推荐 Chrome / Edge 使用 `showDirectoryPicker()`。
- 浏览器不支持目录选择 API 时，退回 `<input webkitdirectory>`。
- 扫描平铺或常见 before / after 目录结构。
- 识别 `Before`、`After`、`Rip`、`NoDeband`、`Degrain` 等对比列。
- `out` / `output` / `after` 作为主 `After`；`rip` 保持独立 `Rip` 列，不和 `After` 混淆。
- `Before`、`After` 和备选列的表头都可以在上传前编辑；上传开始后锁定。
- VSEditor 文件名允许带 `.gen.vpy` / `.m2ts` 等 source marker，也允许省略 marker。
- VSEditor 文件名会显示为 `<episode>-<frame>`，长片名保留在 caption、文件名 tooltip 和目录信息里。
- 右侧 `配对预览` 可展开单行预览，并在上传前拖拽调整 frame 顺序。
- Heatmap 参考是全局设置，只显示每个 frame 都存在的列，避免部分行静默 fallback。
- 生成缩略图和缺失 heatmap 后，走 `group-upload-start -> prepare -> presigned PUT -> commit -> complete`。
- 上传中可以暂停；放弃上传会取消浏览器请求、取消 active job，并清理未提交的 pending 对象前缀。

## 数据与性能边界

- `File` / `Blob` 不进入 React state；页面只保存轻量 render model。
- 图片生成在 worker 中执行，避免阻塞主线程。
- 右侧缩略图只在行接近视口或展开时创建 object URL，并在卸载时释放。
- 重排序、列名修改、Heatmap 参考变化都会清空已生成缓存，保证 UI 顺序和最终上传顺序一致。
- 上传 commit 仍串行收口，减少 SQLite 写入冲突。

## 命名与 slug

- Web 上传会从目录名或公共前缀推断 group slug 和标题。
- 中文会转拼音，假名会转 romaji，然后再统一 kebab-case。
- 手动编辑 slug 时仍遵守内部 slug 规则：小写字母、数字、单连字符。
- 公开 `publicSlug` 仍由发布流程生成，不由上传页直接写入。

## 仍未迁移的 legacy CLI 能力

以下能力仍属于旧 Python uploader，当前 Web 工作台不承诺完全等价：

- YAML 工作目录和外部编辑器确认。
- `--report-json`、`--reset-session` 等 CLI 运维参数。
- `delete-case` / `delete-group` 命令式维护入口。
- 面向无浏览器环境的离线批处理。

这些能力后续是否迁移，应按真实使用频率重新评估，不默认照搬 CLI。

## 相关实现

- 页面：`apps/internal-site/app/upload/page.tsx`
- 工作台：`apps/internal-site/components/web-uploader/`
- 上传 API：`apps/internal-site/app/api/ops/group-upload-*`
- 上传服务：`apps/internal-site/lib/server/uploads/`
- 旧 CLI 文档：`docs/uploader/`
