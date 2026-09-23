# 维护审查：触发条件与多余防御

本次复核以单实例 internal-site、现有 API/CLI 调用链和真实 CI 配置为边界。
下列结论修正首次维护方案中的过强推断；没有复现或没有可达调用链，不等于已经证明不可能。

## 当前约束下不可能发生

| 原先担心的情况                                              | 约束与证据                                                                                                                               | 处理                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 旧 export/deploy 任务结束时清掉另一个任务的锁               | `operation-lock.ts` 的状态是模块私有；持锁期间的新调用直接抛出冲突，不存在替换锁所有者的路径。                                           | 删除 Promise 身份比较，仅保留占用标识和 `finally` 释放。                      |
| 运行中的部署回调产生未知阶段，需要将负索引钳制为 0          | 回调来自 `runtime-service.ts`，阶段由 `PublicDeployStage` 限定；运行中的任务由服务自己新建。磁盘恢复的任务只读取或标记中断，不恢复执行。 | 复用 `PUBLIC_DEPLOY_STAGES`，删除重复阶段列表及 `Math.max` 兜底。             |
| CI 不同浏览器 matrix job 共用 SQLite，互相污染              | 每个 job 都有独立 checkout、server 和数据库；每个 job 仅选择一个浏览器 suite，public 项目只读公开站。                                    | 撤回跨浏览器 CI 数据污染结论。                                                |
| 第二个正常启动的 Playwright 实例覆盖第一个的 public fixture | 当前固定使用 3100/3101/3102，且 `reuseExistingServer: false`；第二次正常启动会因端口占用被拒绝。                                         | 不为当前 harness 新增运行互斥、动态端口或完整目录隔离。将来支持并发时再设计。 |
| tag push 因源码路径不匹配而被 GHCR workflow 拒绝            | GitHub 不对 tag push 评估 `paths`。                                                                                                      | 删除 GHCR 的整个无效 `paths` 列表，保留 `v*` 和手动触发。                     |
| 公开站生产构建使用 Turbopack 的 build cache                 | `apps/public-site/package.json` 固定运行 `next build --webpack`；部署也调用该脚本并清除继承的 `TURBOPACK`。                              | 删除无效的 `turbopackFileSystemCacheForBuild` 及注释，保留实际构建缓存卷。    |

这里的“不可能”仅指表中给出的当前约束；更改端口、启动方式、运行模型或调用接口后需要重新评估。

GitHub 规则依据：[Workflow syntax — paths](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore)。

## 证据不足或不属于当前缺陷

- **手机目录上传需要兼容修复**：该流程不属于当前手机端使用场景。此前把桌面上传用例套进手机矩阵是测试范围错误；通过 Playwright 注入宿主机目录不能作为手机上传能力的证据。已移除本地/CI 手机上传操作、空库上传入口与手机上传截图，保留桌面验证，不追加手机上传兼容逻辑。

- **测试数据累积导致当前 CI 失败**：本地一次运行的内部测试会共用数据库，但项目、重试的 slug 有区分。尚未证明数据累积引起已见的 WebKit 超时或截图差异；不据此扩展成每个测试独立启动整套服务。
- **Dependabot 未扫描根 Compose 导致漏更第三方镜像**：根 Compose 只有项目自身的镜像引用；RustFS、AWS CLI 位于已经扫描的 `/docker`。当前没有漏掉第三方镜像更新的证据。
- **Node 当前已发生版本分裂**：当前检出的一致性正常；Node 26 是尚未合并的机器人 PR。保留升级策略修正，不把候选 PR 描述为已上线故障。
- **Prisma CLI 依赖漏洞可由线上请求触发**：只确认锁文件依赖和审计告警，未找到应用请求可达的递归对象输入。Prisma 7 是已决定的独立迁移，不是紧急线上故障修复。
- **public-site 混入内部写能力、镜像缺失构建依赖**：当前源码未发现这两项问题，不为它们重拆应用或依赖分类。
- **SQLite 初始化需要新增通用迁移系统才能安全重跑**：当前初始化主要是可重跑的增量 DDL，重复上传任务清理已有事务，init 失败会阻止主服务启动。没有证据要求立即替换；Prisma 7 的实际兼容需求单独验证。

## 可以发生的问题，按最小必要范围保留

| 问题                           | 真实触发条件                                                             | 维护范围                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 部署错误跳过                   | 修改素材公开域名、对象前缀或遗漏的构建脚本/资源；现有成功指纹仍相同。    | 补齐现有指纹输入和针对性验证。                                                                                                                 |
| manifest 被删掉或截断          | `resetPublishedGroup` 后写入失败，或写文件期间进程退出。                 | 使用同目录临时文件和 rename，保留旧 manifest 直到新文件完整写入；不引入全树不可变版本体系。                                                    |
| API publish 与 deploy 交错     | 同一单实例可以收到不同 API 请求；现有操作锁只覆盖 export/deploy。        | 针对实际写入口协调进程内互斥；不为禁止并发的 CLI 运维流程设计租约、PID 心跳和进程树恢复系统。                                                  |
| 导出覆盖失败丢失本地预览       | 删除旧目录后，复制中断或磁盘写入失败。                                   | 先写临时目录再替换，必要时保留一个恢复目录；不扩展为多版本 release 管理。                                                                      |
| 数据库已经保存，但后续同步失败 | metadata/visibility/delete 的数据库操作与 bundle/S3 操作分开提交。       | 按具体操作处理已提交结果和可重试的派生同步；暂不引入通用 journal、后台 worker 或统一 `202` API。S3 删除失败需单独处理，不能先删除资产再删 DB。 |
| 补丁变更未触发 PR/main CI      | 主 CI 的路径过滤漏了 `patches/**`。                                      | 修正主 CI 触发；此问题不适用于 tag-only GHCR 的路径过滤。                                                                                      |
| CI 未通过仍发布版本镜像        | GHCR publish 仅依赖同 workflow 的 smoke；首次审查的 alpha.4 记录已证实。 | 保留已确认的发布门禁与 main 保护目标。                                                                                                         |

文件写入、进程退出和网络失败是真实边界，不能标为“不可能”。以上风险可由源码建立触发路径，但不代表已经发生过生产事故。

## 本次代码范围与验证

已按独立提交完成冗余防御删除、manifest 原子写入、Compose 版本修正、CI/发布门禁、导出恢复与指纹补齐，以及 Prisma 7 迁移。保存后的同步警告和按 Case slug 修复命令也已实现。
保留文件缺失、非法外部输入、失败解锁、重复部署点击、进程中断和日志输出上限等有实际用途的处理。

- 锁验证覆盖重叠调用被拒绝、成功与失败后可以再次操作；部署运行时的 18 个定向测试通过。
- 全仓 `pnpm check` 和文档变更后的 `pnpm format:check` 通过。
- fresh export 在测试临时副本中构建，Chromium 与移动 WebKit 的两张原图加载验证均通过（2/2）。首次因本机缺少浏览器未能启动，安装匹配版本后重跑通过。

### 执行验证

- `pnpm check`：format、lint、全仓类型检查和单元测试通过；新增故障路径后的 internal-site 定向复验为 52 文件、232 测试通过。
- 工作区浏览器回归：12/12 通过，覆盖桌面 Chromium、移动 Chromium、移动 WebKit 的保存、取消、失败回滚和已保存但同步失败的警告；警告后的值刷新后仍然存在。
- Prisma 7 用临时 SQLite 验证旧整数毫秒日期、新写入日期以及 active upload partial unique index；没有修改真实数据库。
- actionlint 语法检查通过。ShellCheck 的 SC2086 对应固定 Compose 参数的有意拆词，SC2016 对应 Markdown 反引号字面值；这两项没有真实错误，不为消除提示改变逻辑。
- Prisma CLI 仍带来 deepmerge-ts/mysql2 的 3 项审计公告。当前 SQLite 业务调用链不加载这些 CLI/MySQL 路径，记录为不可达，没有追加未经验证的 major override。

- fresh export：46 项通过、10 项按平台跳过，覆盖桌面 Chromium 与移动 WebKit 的静态原图、viewer 和交互。
- Linux/amd64 Docker 构建与容器内 db:push、Prisma 查询通过。保留 pnpm 的完整生产依赖图，没有手工删除 CLI 传递包。
- 完整本地浏览器首次回归：190 通过、22 按平台跳过；上传列名编辑超时已由 trace 定位为拖拽结束后 15ms 的合成点击，被 dnd-kit 有意保留 50ms 的 click 拦截器吞掉。测试等待该既定清理窗口；产品保护保持原样。远端 CI 与定向复验结果由维护 PR 记录。

### 追加的方向键修复

三变量 A/B 的上、下方向键原先都调用无方向参数的正向轮询函数，因此 ↑ 也走 Src→Rip→Flt。现在键盘层传入明确方向：↓ 正向、↑ 反向；点击和 Enter 保持正向。两变量仍在两张图之间切换。单元测试验证状态顺序，浏览器回归检查实际显示标签及 Src/Flt 往返，并以 fresh export 验证公开站行为。

### 保存警告后的多余刷新

Firefox CI trace 发现：警告返回后额外触发 `router.refresh()`，紧接着 reload 会取消尚在进行的 RSC 请求，Next 随后回退到 document 导航，与 reload 相互中断。元数据响应已经包含已提交的值，因此删除只在 warning 时触发的刷新。保留原有删除、顺序和可见性操作所需的派生状态刷新。

## 本轮前端审计对应的数据边界

- S3 继续使用 `groups/<opaque-group-id>/<frame-number>/<revision-id>/oN.ext` 与 `tN.ext`。组名、文件名及自定义 Before/After 后缀不进入对象键；换素材创建新 revision，数据库提交后才删除旧版本，因此无需为自定义列名迁移对象结构。
- SQLite 继续保存逻辑路径，公开域名由运行时配置解析。2026-09-22 本地只读检查覆盖 17 个 Case、26 个 Group、1382 个 Frame、4238 个 Asset：`integrity_check` 返回 `ok`，外键检查无结果，同图组重复 Frame 顺序及同组重复 active 上传任务均为 0。此结果仅代表本地审核数据。
- 上传提交以条件更新抢占 Frame job，并在同一事务替换 Frame/Asset 和增加已完成计数。该路径中的重复 commit 不会重复增加计数，无需另建幂等表或存储层锁。
- 图组可自定义默认模式已撤下。共享 `DEFAULT_VIEWER_MODE` 固定为 A/B，上传、导入、内部 Viewer 与公开 manifest 统一采用该值；已有数据库列及旧 manifest 字段保留为读取兼容，不做破坏性迁移。浏览器中用户主动选择的当前查看模式仍可记忆。
- 原图、缩略图及旧预生成 Heatmap 数据保留。预生成 Heatmap 标记 Deprecated；当前实时分析是首选，未触发生产数据迁移或自动清理。

### 2026-09-23 加载数据调整

- `Asset.imagePlaceholderJson` 保存上传/导入时从缩略图生成的 8px WebP 和 Material 源色。SQLite 只新增可空列，不改素材路径；公开发布直接复用，Viewer 页面查询不执行 S3 读取。
- 删除本轮临时引入的按需占位图 API、客户端请求 hook 和旧扫描加载图案。内部/公开 Viewer 都直接读取内嵌预览；生成失败保留中性底色，原图仍正常加载。
- 旧数据先备份数据库，再显式运行 `DATABASE_URL=file:/绝对路径/数据库 pnpm --filter @magic-compare/internal-site exec tsx scripts/backfill-asset-placeholders.ts`。末尾可加图组 slug 限定范围；只补空字段，四并发读取缩略图，失败计数输出并保留后续重试机会，不触发发布。
- 本地审核数据库先备份到忽略的 `output/backups/internal-site-before-placeholders-20260923.db`，再完成 4238/4238 个 Asset 的预览补录，失败 0；SQLite 完整性检查为 `ok`，外键检查无结果。该数据操作没有发布公开站。
- 最新工作区 `pnpm check` 通过；完整内部/公开浏览器回归为 128 通过、31 项按平台跳过。静态公开站在隔离副本中重新导出，桌面 Chromium 与移动 WebKit 回归为 51 通过、13 项按平台跳过，覆盖 Heatmap 菜单居中、同行色阶及默认 A/B。Linux Docker 视觉回归 10/10 通过。
