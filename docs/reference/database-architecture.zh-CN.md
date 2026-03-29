# SQLite 数据库架构说明

这份文档说明 `internal-site` 当前 SQLite + Prisma 的真实职责边界，重点覆盖上传作业、派生字段维护和需要由 `init-db.ts` 补齐的 SQLite 特有约束。

它的目标不是枚举所有业务字段，而是帮助后续维护者判断“数据模型该放在哪里、约束该由谁负责、为什么当前上传链路这样查和这样写”。

## 先看结论

- `schema.prisma` 是模型定义和 Prisma Client 生成来源，但它不是 SQLite 全部约束的完整表达。
- `prisma/init-db.ts` 是当前仓库的增量建库/修库入口，`pnpm db:push` 运行的是它，不是 `prisma db push`。
- 上传链路遵循 `start -> frame prepare -> frame commit -> complete`，数据库查询职责已经拆成摘要查询、单 frame 查询和收尾查询。
- SQLite 继续可用，但必须接受“一个数据库文件上并发 writer 不会因为数据量小就自动变快”的事实，所以约束设计和查询收口要尽量明确。

## SQLite 与 Prisma 的职责边界

### `schema.prisma` 负责什么

- 定义 `Case / Group / Frame / Asset / GroupUploadJob / FrameUploadJob` 的主模型和关系。
- 定义 Prisma 能直接表达的唯一键、普通索引和级联删除。
- 作为 TypeScript 侧类型和查询 API 的来源。

### `prisma/init-db.ts` 负责什么

- 在本地开发、Docker bootstrap 和 CI 初始化时创建缺失表。
- 以**增量兼容**方式补列、补索引，而不是要求开发者重建本地库。
- 补 Prisma 无法表达的 SQLite 特有约束，例如部分唯一索引。
- 在建立新约束前清理旧数据，使老库能平滑进入新不变式。

### 为什么两处必须同步维护

如果只改 `schema.prisma`：

- Prisma Client 类型会更新。
- 但老的 SQLite 文件不一定会自动得到新增列或 SQLite 方言专属索引。

如果只改 `init-db.ts`：

- 运行时数据库可能是对的。
- 但 Prisma Client 类型、查询形状和代码注释会落后，后续维护者很难判断什么才是权威模型。

这也是为什么本仓库的数据库变更必须同时检查这两处文件。

## 主表职责

### `Case`

- 保存 case 级 metadata。
- 保存派生字段 `coverAssetId`、`publishedAt`、`status`。
- 不直接记录上传过程中的 frame 级中间态。

### `Group`

- 保存 group 的业务 metadata、公开状态和内部对象存储根路径 `storageRoot`。
- `lastUploadInputHash` 只用于判断一次新上传是否可复用已提交 frame。

### `Frame` / `Asset`

- 只保存**已提交**的当前权威内容。
- `prepare` 阶段不会先写这里；只有 `commit` 成功后才替换对应 frame 行和 asset 行。

### `GroupUploadJob`

- 表示一次 group 级上传会话。
- 保存输入快照、期望 frame 数、已提交 frame 数、过期时间和当前作业状态。
- 只允许同一个 `groupId` 同时存在一个 `active` job。

### `FrameUploadJob`

- 表示某个上传 job 下单个 frame 的状态。
- 保存 frame 快照、prepare 产物、待提交前缀和 commit 时间。
- `(groupUploadJobId, frameOrder)` 是稳定定位一帧上传状态的键。

## Upload Job 当前不变式

### 1. 同一 group 最多一个 active job

- `GroupUploadJob_groupId_active_key` 是 SQLite 部分唯一索引。
- 这个约束只约束 `status = 'active'` 的行，不影响历史 `completed` 或 `cancelled` 记录共存。
- Prisma 目前无法表达这个 SQLite 方言特性，所以索引只能放在 `init-db.ts`。

### 2. `expiresAt` 是真实控制字段，不是摆设

- `start` 之前会先取消当前 group 下所有已过期 active job。
- 后续 resume 查询也会显式过滤过期作业。
- 这样做的目的，是防止本地断点续传把一条早已失效的 job 当成仍可恢复的有效会话。

### 3. `prepare/commit` 只查单个 frame job

- `start` 只需要活跃 job 摘要和 frame 状态列表。
- `prepare/commit` 直接按 `(groupUploadJobId, frameOrder)` 查询目标 `FrameUploadJob`。
- `complete` 只需要 job 自身最小元信息与未提交 frame 计数。

这样做的原因很直接：上传链路频繁、单次读路径固定，SQLite 没必要反复水合整棵 job + case + group + frameJobs 大对象。

## 索引设计与原因

### `Case(updatedAt)`

用途：

- 支撑 case 列表或搜索结果按最近更新时间排序。

原因：

- 这是稳定且常见的列表排序维度。
- 索引成本低，收益明确。

### `Group(caseId, isPublic)`

用途：

- 支撑 `syncCasePublicationState()` 的 public group 计数查询。

原因：

- 上传重置、删除、公开开关切换都会频繁碰到这个计数。
- 查询条件固定，没有必要每次扫完整个 case 下的 group。

### `GroupUploadJob(groupId, status, expiresAt, updatedAt)`

用途：

- 支撑活跃作业查找、按过期时间清理和按更新时间选最新 job。

原因：

- 上传入口首先按 group 查 active job，这是最核心的上传元数据查询。
- 把 `expiresAt` 放进索引是因为过期取消和 resume 过滤都会碰它。

## 为什么不在这轮加 `order` 唯一约束

这轮没有给 `Group(caseId, order)` 或 `Frame(groupId, order)` 加唯一约束，原因不是忘了，而是刻意不做：

- 现有代码仍显式容忍历史重复 order。
- 直接加唯一约束会把一次数据库整理升级成数据修复工程。
- 当前收益最高的问题是上传作业状态和派生字段维护，而不是历史 order 清洗。

如果后续要加这类约束，应该单独立项，先做数据修复，再做约束迁移。

## 维护查询为什么要收窄

### `recomputeCaseCoverAsset()`

现在只读取：

- group/frame 的顺序
- asset 的 `id / kind / isPrimaryDisplay`

原因：

- 这个函数经常在上传替换、group 删除、公开状态变更后调用。
- cover 选择本质是排序 + 标记判断，不需要 frame 文案或图片 URL。
- 对 SQLite 来说，少读无关列比“代码看起来一次性拿全了”更重要。

### 上传服务 helpers

现在拆成三类读取：

- 活跃 job 摘要
- 单 frame job
- complete 阶段最小 job 生命周期信息

原因：

- 减少上传主流程里“大 include + JS 内二次查找”的隐式复杂度。
- 让状态 guard、过期取消和 frame 定位都落在稳定 helper 中。

## 与并发写入的关系

这轮没有引入数据库队列，也没有切换到其他数据库。

需要明确的是：

- SQLite 仍然是单文件数据库。
- 即使业务数据量不大，并发写事务也会争同一个 writer 锁窗口。
- 这也是为什么上传链路里应该优先缩短事务、减少无关查询、把状态不变式做清楚，而不是假设“小库天然没有竞争问题”。

## 维护建议

- 改模型字段时，先改 `schema.prisma`，再判断是否需要在 `init-db.ts` 补增量迁移逻辑。
- 任何依赖 SQLite 方言能力的约束，都要在文档里明确写出“为什么不在 Prisma 里声明”。
- 改上传链路时，优先保持 `upload-service.ts` 主流程薄、helper 负责窄查询和副作用顺序。
- 改派生字段维护逻辑时，先确认查询是否真的需要拉整棵对象树。
