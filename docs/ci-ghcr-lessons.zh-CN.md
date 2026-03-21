# CI / GHCR 接入复盘

这份文档记录本仓库首次接入 GitHub Actions CI 与 GHCR 发布链路时暴露出的真实问题，以及后续维护时应遵守的约束。

它不是 workflow 模板，而是“为什么这些 workflow 要这样写”的补充说明。

## 先看结论

- `repo` 不承载任何生产数据库内容。
- `repo` 不承载任何生产 published bundle。
- 公开仓库里只允许存在 demo 样本，真实业务数据必须来自运行时导入与发布流程。
- CI 不能假设仓库 checkout 自带可用数据，必须自己生成 demo 数据闭环。
- Docker smoke 通过，不代表 `pnpm public:export` 一定通过，因为两者走的是不同执行路径。

## 这次暴露出的核心问题

### 1. 单测会因为实现收紧而失效

`apps/public-site/lib/content.ts` 现在列举 public slug 时，不只是读目录名，还会进一步读取并校验 manifest。

因此测试如果只 mock `readdir`、不 mock `readFile`，就会得到空数组，而不是原先预期的 slug 列表。

经验教训：

- 只要实现已经从“目录存在即可”变成“目录 + manifest 校验”，测试就必须同步补齐 mock。
- 不要把“以前只看目录名”的断言继续保留到新的实现上。

### 2. 根目录脚本不能依赖 app 局部 tsconfig 的 `@/*` 别名

`pnpm public:export` 实际执行的是：

```bash
tsx scripts/export-public.ts
```

这条链路是从仓库根目录直接跑脚本，而不是走 Next.js 构建。

因此，如果它依赖的 `apps/internal-site` 服务端模块里继续使用仅在 `apps/internal-site/tsconfig.json` 中声明的 `@/*` 别名，就可能在 `tsx` 直接执行时出现 `MODULE_NOT_FOUND`。

经验教训：

- 任何会被根目录脚本直接 import 到的模块，不要依赖 app 局部路径别名。
- 这类模块优先使用相对路径导入，或者移动到真正的共享包中。

### 3. Docker smoke 和 `public:export` 不是同一条验证路径

GHCR workflow 的 smoke 主要验证：

- `docker build`
- `rustfs`
- `rustfs-init`
- `internal-site` 容器能启动

CI 的 `public-export-demo` 还会额外验证：

- `pnpm db:push`
- `pnpm db:seed`
- `pnpm public:export`

所以出现“docker 过了，ci 没过”并不奇怪，它通常说明：

- 容器启动链路没问题
- 但脚本执行链路、demo 导出链路、或 manifest / publish 逻辑仍有问题

经验教训：

- 不要把 Docker smoke 的通过理解成“公开导出链路也一定健康”。
- `public:export` 必须单独验证。

### 4. CI 里的 demo 数据必须运行时生成

这个仓库的边界是：

- 生产数据不能进 repo
- 生产 published bundle 不能进 repo
- demo 才是仓库内置样本

因此 CI 里的 demo 导出验证不能依赖 checkout 后已经存在的数据库或发布目录，而应从空环境开始执行：

```bash
pnpm db:push
pnpm db:seed
pnpm public:export
```

经验教训：

- CI 的 `DATABASE_URL=file:./dev.db` 只是 runner 工作目录里的临时 SQLite。
- 这个库应当视为空库，其有效内容必须由 seed 生成。

### 5. `docker compose` 的变量插值发生在宿主侧

`rustfs-init` 的命令里如果直接写：

```sh
"$MAGIC_COMPARE_S3_BUCKET"
```

`docker compose` 可能会先在宿主环境里插值，再把结果传给容器。

如果宿主环境没定义这个变量，容器里拿到的就会是空字符串，即使 service 的 `environment:` 里其实已经提供了默认值。

经验教训：

- 想让变量在容器内 shell 中再展开时，应使用：

```sh
"$$MAGIC_COMPARE_S3_BUCKET"
```

- 这类问题看起来像“容器 env 没配”，其实根因常常是 compose 提前插值。

### 6. GitHub runner 不适合直接复用本地 bind mount 目录

首次接入时，`rustfs` 在 CI 中报过：

- `Permission denied (os error 13)`

根因不是 RustFS 本身，而是 workflow 直接复用了本地开发用的：

- `./docker-data/rustfs:/data`
- `./docker-data/internal-data:/app/data`

这类 bind mount 在 GitHub runner 上容易受到宿主目录权限、用户映射、路径语义影响。

经验教训：

- CI / smoke 不要直接复用本地开发 bind mount。
- 基础 compose 更适合直接使用 Docker named volumes。
- 本地如果需要可见的宿主机目录，再通过开发专用 override 显式切回 bind mount。

当前 CI 专用入口是：

- `docker/ci.compose.override.yml`

### 7. `rustfs-init` 脚本要尽量显式

在 CI 和 Docker 里，把一整段对象存储初始化逻辑直接塞进 compose 的单行命令，不利于排错，也容易让本地和 CI 出现两套行为。

经验教训：

- `rustfs-init` 更适合收敛到仓库内的独立脚本
- compose 只负责把 endpoint、bucket、credentials 接进去
- CI override 应尽量只覆盖 volume，而不是重复覆盖初始化逻辑
- 对 S3-compatible bucket 初始化这类场景，轻量 `minio/mc` 比通用 `aws-cli` 更贴近用途

### 8. GitHub Actions JavaScript actions 版本也会成为噪音源

首次运行时，`actions/checkout@v4`、`actions/setup-node@v4` 触发了 Node 20 deprecation warning。

这不是业务失败根因，但会干扰判断。

经验教训：

- workflow 里的基础 action 版本也要及时升级。
- 不要等 warning 演变成默认行为切换后再处理。

## 当前推荐做法

部署与 CI 相关工作优先参考这些文件：

- `.github/workflows/ci.yml`
- `.github/workflows/ghcr-docker.yml`
- `docker/ci.compose.override.yml`
- `docker/rustfs-init.sh`
- `docs/workflow-guide.md`

如果未来继续改 CI / GHCR：

- 先确认修改的是“容器启动验证路径”还是“脚本导出验证路径”
- 先确认数据来源是否仍然只有 demo
- 先确认 compose 命令里的变量到底是宿主侧展开还是容器侧展开

## 一句话版本

这次接入 GitHub Actions 不是把 workflow 写上去就结束，而是把之前只在本地或 Next 构建路径里“碰巧没炸”的问题全部暴露出来了。

真正要记住的不是某一条修复命令，而是：

- demo 与生产数据必须隔离
- 根目录脚本不要依赖 app 局部别名
- CI 不要复用本地 bind mount
- Docker smoke 通过不代表导出链路通过
