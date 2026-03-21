# Footer 与运行时配置排查记录

日期：2026-03-21

## 当前状态

- internal/public 两个 layout 都已经显式调用 `loadWorkspaceEnv()`，不再完全依赖 Next 自动读取 monorepo 根 `.env`。
- footer 文案来自 `resolveFooterConfig(process.env)`，并不是前端硬编码。
- `published/groups/*/manifest.json` 里的图片 URL 是发布时写死的静态产物；改了 `MAGIC_COMPARE_S3_PUBLIC_BASE_URL` 后必须重新 publish。
- Docker 部署链路已经收敛到：部署机只需要 `docker-compose.yml`、`.env` 和可拉取镜像；compose 不再依赖宿主机挂载 `./docker/*.sh`。

## 本次排查前确认的事实

- 根 `.env` 中已存在 footer 配置：
  - `MAGIC_COMPARE_FOOTER_YEAR_START`
  - `MAGIC_COMPARE_FOOTER_AUTHOR`
  - `MAGIC_COMPARE_FOOTER_JOIN_US_LABEL`
  - `MAGIC_COMPARE_FOOTER_JOIN_US_URL`
- 当前用户反馈是：页面底部仍显示默认值 `© 2026 Magic Compare.`
- 这意味着问题更可能出在“运行中的 internal-site 没吃到最新 env”或“读取时机 / 构建缓存”上，而不是 footer 组件根本没实现。

## 经验教训

- 对 monorepo 下的 Next app，不要默认相信根 `.env` 会被每个 app 在所有运行方式下自动读到；显式加载更稳。
- `published` 目录下的 manifest 只要一生成，就是静态快照；看到 `127.0.0.1` 之类旧值时，先确认是不是旧 manifest，而不是直接怀疑 viewer。
- 部署面向使用者时，`docker-compose.yml` 不应该再暴露 repo 内部脚本路径；脚本可以存在于仓库里，但依赖应内收进镜像或 compose 内联逻辑。
- UI 配置问题和静态产物问题很容易混淆，排查前最好先分清：
  1. runtime env 读取链路
  2. build/export 生成链路
  3. 浏览器实际访问到的是运行时页面，还是历史静态产物
