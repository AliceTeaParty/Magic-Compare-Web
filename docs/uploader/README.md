# 🎞️ 压制组上传工具说明

这份文档面向上传对比图素材的组员。

---

## ✨ 工具功能

`tools/uploader` 是本项目的本地上传工具，用来把压制组的对比图截帧上传至内部站点。

它主要负责三件事：

1. **预演检查**：先扫目录、查命名、查坏图、查会不会撞路径。
2. **直传素材**：向 `internal-site` 申请 frame 级 presigned URL，再把原图和缩略图直传到对象存储。
3. **提交结果**：按 frame 提交，再在整组完成后通知 `internal-site` 切换数据库内容。

现在 uploader 的核心流程固定是：

```text
plan -> group-upload-start -> per-frame prepare/upload/commit -> group-upload-complete
```

也就是说，**先检查，再申请上传，再按 frame 直传并提交**。

---

## 🧭 建议记住

> **建议 1：第一次处理一批新素材时，先跑 `plan`。**

> **建议 2：上传中断后，直接重跑 `sync`，不急着删临时目录重来。**

原因：

- `plan` 测试有没有坏图、垃圾文件、命名冲突。
- `sync` 默认支持续传，从上一个已经完整提交的 frame 继续。

---

## 🚀 开始方式

### 中文向导

```bash
magic-compare-uploader
```

向导会依次做这些事：

- 选择素材目录
- 识别 `before / after / heatmap / misc`
- 执行上传计划预演
- 生成工作目录和项目元数据
- 打开编辑器确认 `case.yaml` / `group.yaml`
- 显示总体文件进度、当前 frame 和重试/失败统计
- 按 frame 直传并提交到站点

---

<details>
<summary><strong>🧪 什么时候先跑 <code>plan</code></strong></summary>

以下情况建议先单独跑预演：

- 素材目录里夹了很多无关文件
- 怀疑有坏图、空图、伪装扩展名
- 想先确认最终会上传到哪里
- 想在自动化或脚本里先检查，再决定是否继续

常用命令：

```bash
magic-compare-uploader plan /path/to/source
```

也可以显式指定 case / group slug：

```bash
magic-compare-uploader plan /path/to/source --case-slug 2026 --group-slug out
```

如果你已经有结构化工作目录，也可以 dry-run：

```bash
magic-compare-uploader sync /path/to/work-dir --dry-run
```

`plan` 会告诉你什么：

- 待上传对象数量
- 被忽略的文件数量和原因
- 有没有关键图片损坏
- 有没有目标路径冲突
- 预计 case / group / frame 的数量

退出码：

- `0`：可以继续
- `1`：有阻塞错误，先修
- `2`：运行时异常

</details>

---

## 📁 工作目录是什么，为什么重要

向导或结构化流程都会用到一个工作目录，例如：

```text
<你的素材目录>-case/
```

上传完成且用不到了直接删除即可。

---

## 🔁 续传、跳过和重来

现在 uploader 会自动把上传状态保存到：

```text
<work-dir>/.magic-compare/upload-session.json
```

### 默认行为

- 同一目录执行 `sync`：会尝试续传
- 网络异常：自动重试
- 已完整提交的 frame：自动跳过
- 当前未完成的 frame：会重新申请新的 presigned URL 再上传

### 什么时候用 `--reset-session`

彻底清理从头开始上传：

```bash
magic-compare-uploader sync /path/to/work-dir --reset-session
```

---

<details>
<summary><strong>🖼️ 图片要求与自动忽略规则</strong></summary>

关键图片会被重点校验：

- `before`
- `after`
- `heatmap`

本地侧会做快速解码检查：

- raster 图片：Pillow `verify/load`
- SVG：轻量 XML + `<svg>` 检查

服务端在 import / publish 时还会再做一次轻量 sanity check。  
这不是复杂安全系统，只是为了尽早拦住“文件存在但其实不是正常图片”的情况。

自动忽略的常见文件：

- `.DS_Store`
- `Thumbs.db`
- `._*`
- 编辑器临时文件
- `.txt` / `.json` / `.yaml` 这类 sidecar
- 已生成的 `thumb-*`

它们会出现在报告里，不是静默吞掉。

</details>

---

<details>
<summary><strong>⚙️ <code>.env</code> 里最常用的字段</strong></summary>

工作目录 `.env` 模板来自：

```text
tools/uploader/.env.example
```

远端内部站最小配置只需要这 3 个字段：

```text
MAGIC_COMPARE_SITE_URL=https://magic-compare-internal.example.com/
MAGIC_COMPARE_CF_ACCESS_CLIENT_ID=*.access
MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET=*
```

补充说明：

- 本地开发通常只需要 `MAGIC_COMPARE_SITE_URL=http://localhost:3000`
- `MAGIC_COMPARE_API_URL` 只有在接口地址需要手动覆盖时才填写
- uploader 现在不需要 `S3_*` 凭据；对象上传统一走 `internal-site` 签发的 presigned URL

</details>

---

<details>
<summary><strong>🧱 其他常用命令</strong></summary>

1. 只生成 manifest，不上传：

```bash
magic-compare-uploader manifest /path/to/work-dir -o manifest.json
```

2. 删除一个 group：

```bash
magic-compare-uploader delete-group --case-slug 2026 --group-slug out --work-dir /path/to/work-dir
```

这个操作会删：

- group
- frame
- asset
- 关联的内部图片目录

执行前会再次确认，不是静默删除。

</details>

---

<details>
<summary><strong>🩹 出问题时先看哪里</strong></summary>

情况 1：`plan` 就报错

- 图片是不是坏了
- 文件名是不是根本没法识别
- 有没有路径冲突
- metadata 是否写坏

情况 2：上传到一半失败

```bash
magic-compare-uploader sync /path/to/work-dir
```

不要第一时间删工作目录。

情况 3：远端返回 `401` / `403`

- `MAGIC_COMPARE_CF_ACCESS_CLIENT_ID`
- `MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET`
- internal-site 的 Access 策略

情况 4：感觉跳过得太多

```text
<work-dir>/.magic-compare/upload-session.json
```

明确要全量重传时再用：

```bash
magic-compare-uploader sync /path/to/work-dir --reset-session
```

</details>
