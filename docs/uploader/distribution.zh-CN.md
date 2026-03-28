# Uploader 分发说明

本文档记录 uploader 二进制分发的构建入口、CI 产物和手工构建边界。
重点是降低 Python 环境门槛，而不是把 uploader 变成跨平台交叉编译系统。

## 1. 当前产物范围

当前仓库支持两种 PyInstaller 布局：

- `--onefile`：便于发给别人，但 macOS 冷启动会有解包开销
- `--onedir`：目录稍大一些，但本地启动更快，适合开发和自测
- `--onedir --archive zip`：先打成一个 zip 分发，使用者手动解压一次，后续启动仍然走快启动目录版

Windows 产物会额外生成同名 `.cmd` 启动器：

- `magic-compare-uploader-windows-amd64.exe`
- `magic-compare-uploader-windows-amd64.cmd`

推荐把 `.cmd` 当成最终给组员双击启动的入口。这样上传失败时窗口不会立即关闭，能直接看到连接拒绝、地址配置错误等提示。

注意：

- `--onefile` 没有“首次解包后永久缓存”的官方开关
- `--runtime-tmpdir` 只能改解包目录，不能把它变成持久缓存
- 需要反复本地测试时，优先用 `--layout onedir`
- 想兼顾“单文件分发体验”和“后续启动速度”时，优先分发 `onedir zip`，不要继续纠结 `onefile` 缓存

CI 默认产出 3 个 `onedir zip` 目标：

- `magic-compare-uploader-windows-amd64.zip`
- `magic-compare-uploader-linux-amd64.zip`
- `magic-compare-uploader-macos-arm64.zip`

`linux/arm64` 暂不放进托管 CI，而是保留同仓脚本和手工构建说明。

## 2. 本地构建入口

先安装 uploader 运行依赖和 build extra：

```bash
cd tools/uploader
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[build]"
```

然后执行：

```bash
python scripts/build-binary.py
```

默认行为：

- 自动识别当前原生平台和架构
- 默认使用 `--layout onefile`
- 输出到 `tools/uploader/dist/`
- 产物名称显式带平台和架构，便于发布和人工分发

例如在 macOS/arm64 上，默认产物是：

```text
tools/uploader/dist/magic-compare-uploader-macos-arm64
```

如需本地快速启动版：

```bash
python scripts/build-binary.py --layout onedir
```

对应可执行文件路径会变成：

```text
tools/uploader/dist/magic-compare-uploader-macos-arm64/magic-compare-uploader-macos-arm64
```

如需“发给别人一个包，但运行不再慢启动”：

```bash
python scripts/build-binary.py --layout onedir --archive zip
```

对应产物会变成：

```text
tools/uploader/dist/magic-compare-uploader-macos-arm64.zip
```

使用方式：

1. 解压 zip
2. Windows 上优先运行解压目录里的 `.cmd`
3. 其他平台运行解压目录里的可执行文件

这样解压成本只发生一次，不会像 `onefile` 那样每次冷启动都重复解包。

## 3. 指定标签名称

如需显式指定命名标签，可以传：

```bash
python scripts/build-binary.py --platform linux --arch amd64
```

注意：

- 这只影响产物命名，不会做交叉编译
- 如需指定目录布局，可再加 `--layout onedir` 或 `--layout onefile`
- 如需分发 zip 包，可再加 `--archive zip`，但只能和 `--layout onedir` 搭配
- 要得到真正可运行的 `linux/arm64` 二进制，仍然要在 `linux/arm64` 原生环境里执行这个脚本

## 4. CI 入口

仓库内单独的 binary workflow：

```text
.github/workflows/uploader-binaries.yml
```

触发方式：

- `workflow_dispatch`
- `push` tag `v*`

CI 每个目标会：

- 安装 `tools/uploader[build]`
- 执行 `python scripts/build-binary.py --layout onedir --archive zip`
- 校验解压目录中的二进制 `--help`
- 在 Linux 目标上额外跑一条 `plan` smoke
- 上传对应 zip artifact
- 在 tag push 时自动创建 GitHub Release 并附加这些 zip

## 5. linux/arm64 手工构建

在原生 `linux/arm64` 主机或容器里：

```bash
cd tools/uploader
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[build]"
python scripts/build-binary.py --platform linux --arch arm64
```

预期产物：

```text
tools/uploader/dist/magic-compare-uploader-linux-arm64
```

## 6. 经验约束

- uploader 分发目标是“让使用者少装 Python”，不是把仓库改造成复杂发布系统
- build script 只负责原生平台打包；跨平台构建交给 CI runner 或原生机器
- 功能验证至少要保留一条 `plan` smoke，因为 `--help` 只能证明二进制能启动，不能证明核心命令可用
