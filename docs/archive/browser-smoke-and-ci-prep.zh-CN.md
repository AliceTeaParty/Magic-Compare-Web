# 浏览器 Smoke 与 CI 准备

这份文档记录 2026-03-21 在真实浏览器环境下回归 viewer / workspace 时确认下来的前置条件、假阳性来源与后续 CI 准备项。
目标是避免再次出现“页面能开，但图片其实没真加载”的误判。

## 这轮已确认的事实

- `/cases/2026/groups/out` 是当前仓库里更适合做压力回归的内部 viewer 路径。
- 本地浏览器 smoke 应优先以 `pnpm docker:dev:up` 拉起的 Docker 链路为基线，而不是一边跑本地 `next dev`、一边手工拼 S3 / SQLite 环境。
- 宿主机 `3000` 端口如果还被本地 dev 进程占着，浏览器可能打到错误服务，看起来像“Docker 起了但页面不对”。
- `HTTP 200`、`img.complete === true` 都不等于图片已真实加载；必须额外检查 `naturalWidth > 0`。
- 当前仓库里的 `docker-data/rustfs` 对 `2026/out` 这组数据不能直接当成“原始 PNG 备份”重放。
  把对象内部的 `part.1` 重新上传到当前 S3 兼容服务，只会得到浏览器不可解码的假图。

## 本地浏览器 Smoke 的最小可靠流程

1. 先确认宿主机没有本地 dev 占着 `3000`。
2. 用仓库标准入口拉起环境：

```bash
pnpm docker:dev:up
```

3. 先验路由，再验图片：

```bash
curl -I http://127.0.0.1:3000/cases/2026/groups/out
curl -I http://127.0.0.1:9000/magic-compare-assets/internal-assets/2026/out/001/after.png
```

4. 在浏览器里至少确认：
   - 主图 `naturalWidth > 0`
   - filmstrip thumb `naturalWidth > 0`
   - 页面没有 `Application error`
   - console / pageerror 为空

## 建议固定的浏览器 QA Inventory

- workspace:
  - `Internal / Public` 单击只切换一次
  - `Open` 能进入 viewer
- internal viewer:
  - `Swipe / A / B / Heatmap` 来回切换不报错
  - `Open details (I)` 按钮和键盘都只切换一次
  - `A / B` 能从 `1x` 连续到 `8x`
  - `ctrl+wheel` 或真实触控缩放后无异常覆盖层、无 console error
  - 连续切换 20 帧后，details 区域仍和当前帧一致
- 负向检查:
  - 不接受只看 `200 OK`
  - 不接受只看 DOM 里出现了 `<img>`
  - 不接受只看页面标题或 URL 正常

## 为未来 CI 留的准备

- 浏览器 smoke 应作为独立阶段，排在容器健康探活之后。
- CI 不应直接复用不透明的 `docker-data/rustfs` 作为“真实图片来源”。
  更稳的做法是准备一套可重复生成或可直接上传的已知有效素材。
- 如果需要压测 viewer，而真实素材暂时不可稳定恢复，可以在 CI 里临时生成同尺寸的合成 PNG 再上传到测试桶。
  这类素材只用于 smoke / 压测，不应提交进仓库。
- CI 里的浏览器断言至少应包含：
  - `naturalWidth > 0`
  - 无 `Application error`
  - 无 `pageerror`
  - 无 console `error`
  - `A / B` 到 `8x`
  - 至少一次 20 帧切换后 details 标题仍对得上

## 这轮最值得保留的经验

- 浏览器测试里最危险的假阳性不是“页面打不开”，而是“页面看起来打开了”。
- 以后只要涉及 viewer 图片链路，就先确认路由命中了正确服务，再确认图片是真的被浏览器解码了。
