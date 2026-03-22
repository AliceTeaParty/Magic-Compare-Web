# 从 VSEditor 平铺目录到上传成功

本文档给出从 VSEditor 平铺导图目录到 internal-site 导入成功的最短路径。
重点是先做预演、再上传，并在失败后可以直接续传，而不是每次从头开始。

## 1. 起点目录

典型输入目录类似：

```text
~/Downloads/test-example/
  24_demo_00001_100_src.png
  24_demo_00001_100_output.png
  24_demo_00001.gen.vpy-100-rip.png
```

现在 uploader 可以直接从这种平铺目录开始，不需要你手动：

- 新建 `groups/` / `frames/`
- 手改 `before.png` / `after.png`
- 手写最小 `case.yaml` / `group.yaml`
- 手工生成 heatmap

## 2. 启动方式

在已激活 uploader Python 环境的终端里执行：

```bash
magic-compare-uploader
```

第一步会询问素材目录，例如：

```text
~/Downloads/test-example
```

如果当前终端已经在该目录，也可以直接回车使用默认值。

## 3. `.env` 与连接方式

向导会在工作目录里准备：

```text
<work-dir>/.env
```

它来自 `tools/uploader/.env.example`。最常用字段：

```text
MAGIC_COMPARE_SITE_URL=http://localhost:3000
MAGIC_COMPARE_API_URL=
MAGIC_COMPARE_S3_BUCKET=magic-compare-assets
MAGIC_COMPARE_S3_REGION=us-east-1
MAGIC_COMPARE_S3_ENDPOINT=http://localhost:9000
MAGIC_COMPARE_S3_ACCESS_KEY_ID=rustfsadmin
MAGIC_COMPARE_S3_SECRET_ACCESS_KEY=rustfsadmin
MAGIC_COMPARE_S3_FORCE_PATH_STYLE=true
MAGIC_COMPARE_S3_INTERNAL_PREFIX=internal-assets
MAGIC_COMPARE_CF_ACCESS_CLIENT_ID=
MAGIC_COMPARE_CF_ACCESS_CLIENT_SECRET=
```

说明：

- 本地开发时，`MAGIC_COMPARE_SITE_URL=http://localhost:3000` 通常就够了
- 本地目标允许无认证直连
- 如果目标是受 Cloudflare Access 保护的远端内部站，只支持 Service Token
- uploader 不再自动安装或调用 `cloudflared`
- uploader 相关变量只保留在自己的工作目录 `.env` 里，不再混入网站运行时模板

## 4. 向导现在会先做什么

在真正上传前，向导会先做一轮预演：

- 解析 before / after / heatmap / misc
- 统计帧数和待上传对象数
- 报告被忽略的垃圾文件和忽略原因
- 对关键图片做快速解码校验
- 预览目标路径是否冲突

如果预演阶段出现阻塞错误，例如：

- `before` / `after` 是损坏图片
- 命名导致目标 object key 冲突
- 平铺目录根本无法识别出合法 frame

向导会先停下来，不会直接进入上传。

## 5. 自动识别规则

默认命名规则保持不变：

- `src` / `source` 识别为 `before`
- `out` 优先作为 `after`
- 其次 `output`
- 其他未选中的输出图归为 `misc`

额外行为：

- 已有显式 `heatmap` 文件时直接使用
- 没有显式 `heatmap` 时，工作目录阶段会自动生成
- 隐藏文件、系统垃圾、明显 sidecar 会进入 ignored 列表，而不是把整次导入搞挂

## 6. 选择 case 与生成工作目录

向导会先默认用当前年份搜索已有 case，例如：

```text
2026
```

此时你可以：

- 直接回车：优先复用同年份 case，没有则准备新建
- 输入编号：复用某个已有 case
- 输入 `/`：重新搜索其他关键词

随后 uploader 会生成结构化工作目录，例如：

```text
~/Downloads/test-example-case
```

如果目录已存在，会让你选择：

- 覆盖
- 新建时间戳目录
- 取消

这样做是为了避免把旧的 metadata、upload session 和人工修订记录静默覆盖掉。

## 7. metadata 确认

向导会生成并打开：

- `case.yaml`（仅在新建 case 时）
- `group.yaml`

如果复用已有 case，服务器已有的 case metadata 会保留，不会被这次导入偷偷覆盖。

## 8. 结构化计划、上传与同步

metadata 确认后，向导会再跑一次针对结构化工作目录的计划：

- 这次的计划结果才是实际上传依据
- 如果结构化目录里仍然有阻塞错误，会先报错，不会进入上传

上传阶段特性：

- 自动写入 `<work-dir>/.magic-compare/upload-session.json`
- 默认断点续传
- 已存在且 metadata 指纹一致的对象会自动跳过
- 仅网络类问题会重试，配置错误不会盲重试

真正上传完成后，才会调用 internal-site 的 `import-sync`。

## 9. 常用命令补充

只看计划，不上传：

```bash
magic-compare-uploader plan ~/Downloads/test-example --case-slug 2026 --group-slug test-example
```

对结构化工作目录做 dry-run：

```bash
magic-compare-uploader sync ~/Downloads/test-example-case --dry-run
```

强制忽略旧 session，从头重来：

```bash
magic-compare-uploader sync ~/Downloads/test-example-case --reset-session
```

输出机器可读 JSON：

```bash
magic-compare-uploader plan ~/Downloads/test-example --report-json /tmp/uploader-plan.json
```

## 10. 失败后如何复盘

优先看三处：

1. 终端里的 plan / upload summary
2. `<work-dir>/.magic-compare/upload-session.json`
3. `--report-json` 输出的结构化报告

一般场景：

- 图片损坏：先修源文件，再重跑 `plan`
- 上传到一半网络抖动：直接重跑 `sync`
- 想强制全量重传：用 `--reset-session`
- 远端 401/403：检查 Service Token 和 internal-site Access 策略
