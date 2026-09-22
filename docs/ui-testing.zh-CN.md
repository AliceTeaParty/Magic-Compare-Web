# UI 回归测试

UI 改动以真实浏览器中的操作结果、盒模型和截图为验收依据。`pnpm check` 检查源码、类型和 Vitest；浏览器测试是独立 CI 门禁。

## 日常入口

```bash
pnpm check
pnpm test:e2e
pnpm test:e2e:export
pnpm test:e2e:visual:docker
```

前三项顺序执行。浏览器开发测试和静态导出测试共用 3102 素材服务，不能同时运行；3100/3101 是 E2E 应用，3104 是 E2E 静态产物。已有 3000/3001 开发服务器可以保持运行。

首次运行安装所需浏览器：`pnpm exec playwright install chromium webkit firefox`。Linux CI 使用 `--with-deps`。Docker 截图命令使用固定的 `mcr.microsoft.com/playwright:v1.62.1-noble`；需要可用 Docker。

定位单个交互：

```bash
pnpm exec playwright test viewer.spec.ts --project=internal-mobile-chromium
pnpm exec playwright test workspace.spec.ts --project=internal-chromium
pnpm exec playwright test upload.spec.ts --project=internal-chromium
pnpm test:e2e:ci --project=internal-desktop-firefox --project=public-desktop-firefox
pnpm test:e2e:ci --project=internal-ios-webkit --project=public-ios-webkit
pnpm test:e2e:empty --project=internal-ios-webkit
```

## PR 浏览器矩阵

`.github/workflows/ci.yml` 在每个 PR 和 main 更新运行，且可由其他工作流在同一提交调用；不使用路径过滤，避免必需的 `CI Gate` 因配置、补丁或文档改动被跳过。`CI Gate` 总结 Verify、Compose、浏览器矩阵、静态导出和视觉回归五项的实际结果，任一项失败或跳过都会阻断。

`.github/workflows/browser-ui.yml` 是 CI 调用的可复用工作流，也支持每周和手动执行。每组分别测试 internal/public，并用另一份空数据库检查首次使用入口。版本 tag 或手动镜像检查会先调用同一套 CI；tag 在通过运行时 smoke 后，才将该 smoke 使用的 Docker 归档加载、打 tag 并推送 GHCR，发布阶段不会重新构建镜像。

| 组                    | Runner       | 浏览器与设备配置                            |
| --------------------- | ------------ | ------------------------------------------- |
| Desktop Chrome Stable | Ubuntu 24.04 | Google Chrome 正式稳定版，`channel: chrome` |
| Desktop Firefox       | Ubuntu 24.04 | Playwright Firefox                          |
| Desktop WebKit        | macOS 15     | Playwright WebKit，Desktop Safari 配置      |
| Android Chrome        | Ubuntu 24.04 | Chrome 正式稳定版，Pixel 7 视口与触摸模拟   |
| iOS WebKit            | macOS 15     | Playwright WebKit，iPhone 13 视口与触摸模拟 |

五组运行各自站点的完整功能用例，包括手机上的项目管理、上传和部署面板。`fail-fast: false` 保留其他浏览器结果；每组按需安装浏览器，缓存 pnpm，使用 `.node-version`，上传独立 HTML/JSON 报告、失败截图与 trace，保留 14 天。GitHub job summary 展示通过、失败、flaky 和跳过数量。静态导出和固定 Linux 图像基准是独立任务。

Playwright WebKit 使用带补丁的 WebKit，不是 Safari 应用；手机配置是设备模拟，不是 iOS/Android 真机。macOS WebKit 更接近 Safari 的平台行为，依据 [Playwright 浏览器说明](https://playwright.dev/docs/browsers#webkit)。Chrome 通道使用已安装的正式浏览器；CI 在临时 runner 安装，个人机器可直接使用已有 Chrome。

## 覆盖范围与证据边界

| 场景         | 验证内容                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewer 布局  | 首次进入、横图/竖图/方图、横竖屏尺寸变化、侧栏及引导；舞台相对内容区中心偏差不超过 1 CSS px，无页面横向溢出；原图与舞台边界误差不超过 0.125 CSS px |
| 对比操作     | 滑动方向与复位、A/B 的 ↓ Src→Rip→Flt 与 ↑ Src→Flt→Rip 循环、缩放复位、热图透明度、模式偏好恢复                                                     |
| 胶卷         | 长列表虚拟窗口、键盘滚动到首尾、鼠标拖动、手机轻触、从缩略图/标题/间隙起手的触摸滚动、纵向页面滚动、取消后继续操作                                 |
| 图片生命周期 | 原图 SSR 发现、解码完成、失败提示、换帧恢复、迟到请求不覆盖较新的选择                                                                              |
| 工作台       | 创建项目、保存设置；图组 inline edit 取消、连续保存、行高稳定、失败回滚、重新编辑恢复                                                              |
| 全局与列表   | 桌面导航、手机抽屉及断点切换；明暗、全部预设和自定义主题色恢复；项目搜索、标签搜索、状态筛选、排序和空结果                                         |
| 项目管理     | 新建描述验证、失败保留草稿与取消；空项目列表、空工作区、项目删除确认、图组排序/删除、公开状态失败回滚与重新发布                                    |
| 上传         | 真实目录输入、生成缩略图、上传及数据库提交、完成请求失败后继续且不重复 PUT、打开上传后的图组                                                       |
| 上传控件     | 无项目入口、目标项目、无效配对和重新选择、Frame 标题模式、预览展开/折叠、拖动排序、桌面列名保存/取消、热图参考列、暂停和放弃                       |
| 部署面板     | 恢复执行中任务、收起/重开、避免重复任务、失败重试、无需更新、完成链接和通知；任务 API 用模拟响应                                                   |
| 视觉         | 桌面 Chromium 与手机 WebKit；明暗主题、珊瑚色，横图/奇数竖图舞台；项目列表、工作区、设置面板、上传入口与配对表全页截图                             |
| 静态产物     | 隔离副本运行实际 `public:export`，用静态服务器重新执行公开 viewer 测试                                                                             |

连续触摸拖动用 Chromium CDP 注入，由浏览器参与原生滚动和 pointer cancellation。WebKit 项目覆盖真实 touch tap、布局、模式、截图；其中鼠标操作只证明对应交互逻辑，不能当作 iPhone 连续手势证据。不适用的设备用例明确 skip。发布前仍需在真实 iPhone 检查横向拖动、斜向起手、纵向页面滚动和动态地址栏。

数据库按本次测试进程隔离，生成在 `output/playwright/e2e`。测试素材为固定中心线、四角标记与颜色图，包含 24 帧和奇数尺寸。测试脚本拒绝向开发数据库写入夹具。

浏览器用例自动检查未捕获异常与 hydration 错误。唯一排除项是 trace 已确认的 Next 开发工具在 WebKit 页面卸载时读取 `__nextjs_original-stack-frames` 的跨域错误，必须同时匹配开发工具调用栈、端点与错误内容；应用异常仍会失败。

`test:e2e:empty` 使用空数据库启动同一个内部站，验证空项目列表和没有可选项目时的上传页面。其报告分别保存在 `empty-report`、`empty-test-results`、`empty-results.json`，不会覆盖常规测试证据。测试种子时间固定，保证项目卡片日期截图稳定。

上传使用进程内 HTTP 存储替身，应用 API、生成流程和 SQLite 都是真实实现；替身不验证 S3 签名。真实 S3 的签名、Range 和上传协议由既有 Compose/RustFS CI 检查负责，生产端点仍需部署后的单独验证。测试不会导入生产素材、发布生产 bundle 或触发部署。

静态导出复制当前源码到临时目录，只链接已安装依赖，所有构建和产物目录均在副本中。Docker 视觉测试复制当前 Git 工作区，包括未提交源码，排除环境文件和运行时数据。

## 视觉基准更新

```bash
pnpm test:e2e:visual:docker --update-snapshots
```

更新只在显式参数下回写 `tests/e2e/screenshots`。逐张检查正常/奇数尺寸、明/暗、桌面/手机图片，确认原图已加载、四角完整、分界线和把手合理后再提交。截图样式只排除 Next 开发调试浮标，保留全部产品界面。CI 不更新基准；浏览器升级需同步 Docker 镜像并重新审查截图。直接 `pnpm test:e2e:visual` 用于相同 Linux 环境，macOS 的渲染差异不应回写为 Linux 基准。

全页截图先等待页面壳恢复完成，再通过通知的关闭按钮清除临时提示，避免遮挡表单。保留默认光标样式，防止截图工具在 React hydration 前改写输入框的 style；截图时不聚焦输入框。

正常容差最多 30 个差异像素、单像素阈值 0.15。不要通过扩大整图容差掩盖裁切、底色或位置错误；先检查实际图、预期图和差异图。

报告与 trace 在 `output/playwright/playwright-report` 和 `output/playwright/test-results`；Docker 运行的副本在 `visual-playwright-report` 和 `visual-test-results`。失败排查先看截图/trace，再判断是应用、夹具还是环境。CI 重试一次仍将 flaky 视为失败，禁止 `.only`。

## 新增回归的规则

- 修复 Bug 时先补能在旧实现上失败的行为断言；布局问题读取实际盒模型，不能只查 `sx` 文本。
- 使用角色和可访问名称定位。仅缺少语义的舞台几何边界使用稳定 `data-testid`。
- 等待可观察状态、请求或图片解码；不使用固定 sleep 掩盖时序问题。
- 网络失败测试在加载前安装路由，避免预加载缓存让断言失真。
- 不把测试夹具导出到开发或生产的 `public/`。生成素材由专用测试服务提供。
- 共享 viewer 改动同时验收 internal/public；资产、manifest 或发布相关改动额外验收 fresh export。

### UI 与用例对应表

新增页面、弹窗或操作时同步维护此表。复用的图标、排版和装饰组件由所在页面的视觉截图验证；状态计算与手势边界同时保留 Vitest 用例。

| UI 入口/组件                                                                                                      | 功能用例                                                                                                                          | 视觉用例                     |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 内部 `/`：Catalog、卡片、筛选/排序、新建弹窗                                                                      | `catalog.spec.ts`、`workspace.spec.ts`、`empty.spec.ts`                                                                           | `internal.visual.spec.ts`    |
| 内部 `/cases/[caseSlug]`：工作区、设置、inline edit、排序、公开状态、删除弹窗                                     | `workspace.spec.ts`、`workspace-actions.spec.ts`                                                                                  | `internal.visual.spec.ts`    |
| 内部 `/upload`：入口、配置、配对、预览、列编辑、进度、操作菜单                                                    | `upload-controls.spec.ts`、`upload.spec.ts`、`empty.spec.ts`                                                                      | `internal.visual.spec.ts`    |
| 全局导航、主题、抽屉、断点切换、404                                                                               | `navigation.spec.ts`、`internal-site.spec.ts`                                                                                     | 两套 visual spec 的页面壳    |
| 全局部署面板与通知                                                                                                | `deploy.spec.ts`；保存/上传错误用例也验证通知                                                                                     | 功能用例保留失败截图与 trace |
| 内部 group viewer、公开 `/g/[publicSlug]`：三种模式、工具栏、缩放、采样提示、详情、引导、胶卷、图片 loading/error | `viewer.spec.ts`、`viewer-controls.spec.ts`、`heatmap.spec.ts`、`public-site.spec.ts`；内部详情切组见 `workspace-actions.spec.ts` | `viewer.visual.spec.ts`      |
| 公开 `/` 与不存在的图组                                                                                           | `navigation.spec.ts`；静态导出复跑同一套公开用例                                                                                  | 功能用例保留失败截图与 trace |

这张表记录 UI 入口的实际覆盖，不把访问过页面等同于所有状态组合均已验证。实机连续手势、系统原生文件/颜色选择器、外部部署服务和所有可能的数据组合仍有独立验收边界。

## 前端演进边界

内部站目前是同一个 Next.js 应用承载页面和 `/api/ops/*`，服务端页面直接调用 repository 取得初始数据，因此尚未分成独立部署的前端和后端服务。浏览器写操作已经通过 API；公开站独立静态导出，只消费 manifest。

共享 viewer 位于 `packages/ui`，通过 dataset 接收数据；模式与几何计算位于 `packages/compare-core`，数据契约位于 `packages/content-schema`。优化舞台、胶卷、主题和交互可以集中在这些共享包，同时用 internal/public 两套浏览器测试验收。将来确实需要独立后端时，优先把服务端页面的数据读取替换成明确的 API 适配层，保留 viewer 的 dataset 边界。

滑动对比已经由自有 React/CSS 组件实现，原图定位、裁切、分界线和手势都有独立模块。本次保留这条渲染路径，修正居中、原生触摸滚动、主题底色、方形边缘和小数尺寸测量。没有证据表明这些问题需要整套 Canvas 重写；若未来引入新的渲染器，应先通过同一套布局、交互、原图加载和视觉回归，再比较性能与图像显示效果。

## 实时热图回归

`heatmap.spec.ts` 在同一五组浏览器和 fresh export 中运行真实 Web Worker，覆盖 Rip/Flt 重算、离开后返回、纯热图/叠加/原图、灵敏度、区域分数保持、热点跳转 A/B 放大、读取失败后的匹配预生成回退与重试，以及旧请求晚到不能覆盖新帧。合成微差像素仅替换分析请求，计算链路保持真实。Vitest 另外验证暗渐变/文字、动画线条、色度变化、透明度、正负交替误差、单点异常值、噪声阈值和区域排序。算法与使用边界见 [热图检查](heatmap-inspection.zh-CN.md)。

## 部署更新与图片运行时恢复

`/build.json` 返回版本号和 commit：内部站禁用响应缓存，公开站在静态导出时生成同名文件。页面在路由变化、重新聚焦以及可见页面的每分钟检查中读取最新标识，网络失败或旧站点没有该文件时保持可用。新构建出现后提供“刷新版本”入口，不会自动中断上传或编辑。刷新使用带随机时间参数的当前页面 URL，保留原有查询参数、hash 与主题偏好；新文档释放旧 viewer、worker 和内存队列。它不是清空浏览器全部 HTTP 缓存的操作，图片内容更新仍应使用新的资源 URL。

舞台图片以资源 URL 创建新的 DOM 节点，同帧 Rip/Flt 切换及热图替换也适用。回调验证节点身份及预期 URL，并在 decode 完成后再次检查；历史成功缓存不再作为当前节点已解码的依据。

`runtime-recovery.spec.ts` 覆盖同版本不同 commit、重新聚焦检查、用户刷新后偏好保留、无自动刷新循环、缺少版本文件，以及同帧换列后旧节点的 load/error/decode 回调。人为注入晚到事件用于验证隔离边界，真实延迟请求仍由 `viewer.spec.ts` 覆盖。所有用例加入五组浏览器和静态导出矩阵。

视觉测试固定构建标识为夹具数据，版本号格式变化仍受截图检查，普通发版不再要求更新每张全页图。舞台背景与标题使用同一主题层，视觉断言比较实际背景颜色，而非固定灰色。
