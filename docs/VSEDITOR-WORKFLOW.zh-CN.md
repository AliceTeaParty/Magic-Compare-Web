# 从 VSEditor 导图到上传成功

本文档说明，如何在**已经激活好 Python 环境**之后，只输入一次：

```bash
magic-compare-uploader
```

就把一组 VSEditor 已保存到磁盘的图片，从原始平铺目录整理、生成 metadata、自动生成 heatmap，并上传到 Magic Compare Web 内部站。

## 1. 示例目录现状

示例目录是一个典型的 VSEditor 平铺导图目录：

```text
~/Downloads/test-example/
  24_BDMV250725..._2087_src.png
  24_BDMV250725..._2087_output.png
......
  24_BDMV250725..._30516_src.png
  24_BDMV250725..._30516_output.png
  24_Vol.1_00002.gen.vpy-30516-rip.png
```

现在 uploader 已经支持直接从这种目录开始，不需要你手动：

- 新建 `groups/`、`frames/`
- 手动复制成 `before.png` / `after.png`
- 手写最小 `case.yaml` / `group.yaml`
- 手动生成 heatmap

这些都交给向导完成。

## 2. 直接启动向导

在已激活 uploader Python 环境的终端里执行：

```bash
magic-compare-uploader
```

启动后，第一步会询问：

```text
素材目录
```

这里输入：

```text
~/Downloads/test-example
```

如果你当前终端已经 `cd` 到这个目录，也可以直接回车使用默认值。

接下来，向导会为这次导入准备工作目录，并在其中生成一份：

```text
~/Downloads/test-example-case/.env
```

它来自仓库根目录的 `.env.example`。最常用的字段是：

```text
MAGIC_COMPARE_SITE_URL=http://localhost:3000
MAGIC_COMPARE_API_URL=
MAGIC_COMPARE_S3_BUCKET=magic-compare-assets
MAGIC_COMPARE_S3_REGION=us-east-1
MAGIC_COMPARE_S3_ENDPOINT=http://localhost:9000
MAGIC_COMPARE_S3_PUBLIC_BASE_URL=http://127.0.0.1:9000/magic-compare-assets
MAGIC_COMPARE_S3_ACCESS_KEY_ID=rustfsadmin
MAGIC_COMPARE_S3_SECRET_ACCESS_KEY=rustfsadmin
MAGIC_COMPARE_S3_FORCE_PATH_STYLE=true
MAGIC_COMPARE_S3_INTERNAL_PREFIX=internal-assets
MAGIC_COMPARE_CF_ACCESS_TOKEN=
```

说明：

- 本地开发时，`MAGIC_COMPARE_SITE_URL=http://localhost:3000` 就够了
- uploader 现在会把原图、缩略图和自动 heatmap 直接上传到 S3-compatible 存储，不再写入仓库内的 runtime 目录
- 如果本地用 `docker compose up -d rustfs rustfs-init`，上面这组 S3 默认值可以直接使用
- 如果内部站放在 Cloudflare Zero Trust 后面，把它改成真实内部域名，例如 `https://compare-internal.example.com`
- `MAGIC_COMPARE_CF_ACCESS_TOKEN` 不需要手填，CLI 会在登录成功后自动写回

## 3. 工具会自动做什么

### 3.1 自动解析 before / after

工具会递归扫描素材目录中的图片，并按 frame 自动聚合。

默认规则：

- `src` 或 `source` 识别为唯一 `before`
- `out` 优先作为 `after`
- 其次 `output`
- 其余候选按字母序选择第一项作为 `after`
- 未被选中的输出图降级为 `misc`

对当前示例来说：

- `*_src.png` 会成为 `before`
- `*_output.png` 会成为 `after`
- `24_Vol.1_00002.gen.vpy-30516-rip.png` 会被归入 `30516` 这一帧，并作为 `misc`

### 3.2 自动生成 frame 标题

frame 标题会从文件名自动提取，格式固定为：

```text
帧率_剧集号_帧号
```

例如：

```text
******py_3537_src.png
```

会生成：

```text
24_02_3537
```

规则是：

- `24`：文件名开头的两位帧率
- `02`：靠近帧号的剧集编号，自动去前导零后至少补到两位
- `3537`：帧号本身，作为合法整数保存

### 3.3 自动生成 heatmap

如果当前 frame 没有现成的 `heatmap` 文件，工具会基于选中的 `before` 和 `after` 自动生成 `heatmap.png`。

如果尺寸不一致，导入会直接报错，不会偷偷拉伸。

## 4. 选择已有 case 或创建年份 case

解析完素材并准备好工作目录后，工具会先尝试连接内部站，再默认用当前年份搜索已有 case，例如：

```text
2026
```

你会看到一张候选表。

如果 `MAGIC_COMPARE_SITE_URL` 指向的是受 Cloudflare Access 保护的内部站，且当前 `.env` 里还没有可用 token，CLI 会自动：

1. 检查 `cloudflared` 是否存在
2. 在 macOS 上尝试自动安装 `cloudflared`
3. 拉起浏览器访问内部站主页并完成 Access 登录
4. 取回 token
5. 把 token 写进工作目录 `.env` 的 `MAGIC_COMPARE_CF_ACCESS_TOKEN`

整个过程不需要你手动复制 token。

此时有三种用法：

### 4.1 直接回车

默认使用当前年份 case。

- 如果服务器上已经有 `2026` 这个 case，工具会直接复用它
- 如果没有，就自动准备一个新的 `2026` case

### 4.2 输入编号

输入表格里的编号，复用那个已有 case。

这时 uploader 会：

- 使用服务器上已有的 `title / subtitle / summary / tags / status`
- 不覆盖这些 case metadata
- 只把这次导入的 group 加进去

### 4.3 输入 `/`

重新输入搜索关键词，再看另一批候选 case。

## 5. 自动生成的本地工作目录

工具会自动在素材目录同级生成工作目录：

```text
~/Downloads/test-example-case
```

默认 group 目录是：

```text
~/Downloads/test-example-case/groups/001-test-example
```

如果这个工作目录已经存在，工具会询问你：

- 覆盖现有目录
- 新建带时间戳的新目录
- 取消本次导入

这个工作目录除了 metadata 和整理后的图片外，还会保存本次导入所需的 `.env`，所以后续再执行 `sync`、`delete-group` 之类命令时，不需要重复填写站点地址。

## 6. 自动生成并确认 metadata

### 6.1 `case.yaml`

如果本次是新建年份 case，工具会自动生成：

```yaml
slug: 2026
title: 2026
subtitle: ""
summary: <random>
tags: []
status: internal
coverAssetLabel: After
```

然后自动拉起系统编辑器让你确认。

如果本次复用已有 case，则会把服务器已有 metadata 写到本地 `case.yaml` 作为记录，但默认不会打开编辑，也不会拿它去覆盖服务器内容。

### 6.2 `group.yaml`

`group.yaml` 一定会自动生成并打开编辑器确认。

默认内容大致类似：

```yaml
title: Test Example
description: Imported from test-example.
defaultMode: before-after
isPublic: false
tags: []
```

说明：

- `slug` 不写在 `group.yaml` 里，而是来自目录名 `001-test-example`
- 如果目标 case 下已存在同 slug group，工具会先问你：
  - 覆盖旧 group
  - 自动改成 `test-example-2`、`test-example-3` 之类的新 slug

### 6.3 `frame.yaml`

每个 frame 都会自动生成 `frame.yaml`，例如：

```yaml
title: 24_02_3537
caption: fps 24 • episode 02 • frame 3537
```

默认不会逐个打开编辑器，但它们已经落到工作目录里，后续可以自己改。

## 7. 向导实际写出的目录

对当前示例，大致会生成：

```text
~/Downloads/test-example-case/
  case.yaml
  groups/
    001-test-example/
      group.yaml
      frames/
        001-24-02-2087/
          frame.yaml
          assets.yaml
          before.png
          after.png
          heatmap.png
        002-24-02-3537/
          ......
```

其中：

- `assets.yaml` 会记住每个导入资产对应的原始文件名
- `rip.png` 会作为 `misc` 资产保留

## 8. 上传成功后会发生什么

当你确认 `case.yaml` / `group.yaml` 后，向导会继续：

1. 校验生成后的工作目录
2. 生成缩略图
3. 生成 import manifest
4. 调用内部站 `POST /api/ops/import-sync`

成功时，终端会输出：

- `Case slug`
- `Group slug`
- `工作目录`
- 内部站查看地址

例如：

```text
http://localhost:3000/cases/2026/groups/test-example
```

如果你用的是 Zero Trust 受保护域名，这里会显示对应的 HTTPS 内部站地址。

## 9. 这个示例里几条最关键的自动规则

针对 `~/Downloads/test-example`，默认结果是：

- 一个素材目录导入成一个 group
- `*_src.png` -> `before`
- `*_output.png` -> `after`
- `*-rip.png` -> `misc`
- 所有 frame 自动生成 `heatmap.png`
- `24_BDMV250725..._3537_src.png` -> `24_02_3537`
- 默认工作目录 -> `~/Downloads/test-example-case`
- 默认新 case -> `2026`

## 10. 失败时优先检查什么

### 没有识别出 before

检查是不是没有 `src` / `source`，或者同一帧里出现了多个 source 候选。

### 没有识别出 after

检查同一帧是否至少有一个非 source 的输出图，例如 `output`、`out`、`degrain`、`out1`。

### heatmap 生成失败

通常是 `before` 和 `after` 尺寸不一致。

### 不能上传到已有 case

优先检查：

- `test-example-case/.env` 里的 `MAGIC_COMPARE_SITE_URL` 是否正确
- 如果走本地开发，内部站是否已启动
- 如果走 Cloudflare Zero Trust，浏览器是否能正常打开内部站主页
- `cloudflared` 是否已完成登录并把 token 写回 `.env`

## 11. 专家模式仍然保留

如果你已经有一个结构化工作目录，也仍然可以继续使用旧命令：

```bash
magic-compare-uploader scan /path/to/case
magic-compare-uploader manifest /path/to/case
magic-compare-uploader sync /path/to/case
```

但对于 VSEditor 导图，默认推荐始终先用：

```bash
magic-compare-uploader
```
