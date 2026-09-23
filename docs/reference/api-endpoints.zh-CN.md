# Internal Site API 端点清单

本文档按当前代码实现整理 `apps/internal-site` 暴露的全部服务端 API 端点，以 `apps/internal-site/app/api/ops/*` 为准。
它只描述现在真实存在的请求入口、请求体、主要返回值和关键副作用，不推测未来接口。

## 范围与约束

- 业务操作 API 位于 `apps/internal-site/app/api/ops/*`；另有不读取业务状态的 `GET /api/healthz`。
- ops 写操作使用 `POST`；部署任务查询使用 `GET /api/ops/public-deploy`。
- 新上传链路里的二进制文件不会再发到 internal-site；`group-upload-frame-prepare` 返回的是对象存储 presigned PUT URL，客户端随后直传到 S3-compatible 存储。
- 当前代码里没有单独的 route-level 鉴权中间件；远程调用通常由部署侧入口控制。

## 错误约定

- Zod 参数校验失败返回 `400`；其他明确的无效输入也返回 `400`。
- 目标 Case、Group 或上传作业不存在时返回 `404`；重复创建、陈旧状态或未满足前置条件时返回 `409`。
- Frame commit 的对象存储校验失败返回 `502`，响应只包含存储错误码和上游 HTTP 状态；服务端日志额外记录 job、frame、阶段和对象存储 request ID。
- 数据库提交前的未分类异常会记录服务端日志并返回 `500`。
- `case-update`、`group-update`、`group-visibility`、`group-reorder`、`group-delete` 若数据库已提交而后续公开内容同步、素材清理或派生状态更新失败，仍返回 `200` 和原有结果字段，并附带 `warnings: string[]`。客户端保留已保存的数据并显示警告；无警告时省略该字段。
- `group-delete.removedPublishedBundle` 仅在公开目录成功删除后为 `true`。S3 清理失败会记录原 storageRoot，仍继续公开目录和项目状态清理。

## 端点总览

| 路径                                       | 作用                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `GET /api/healthz`                         | 返回无缓存 204，供容器健康检查                 |
| `POST /api/ops/case-create`                | 新建一个空的 internal case                     |
| `POST /api/ops/case-update`                | 修改 case summary                              |
| `POST /api/ops/case-delete`                | 删除空 case                                    |
| `POST /api/ops/group-viewer`               | 返回单个 group 的 viewer dataset               |
| `POST /api/ops/group-update`               | 修改 group 标题和描述                          |
| `POST /api/ops/group-visibility`           | 切换 group 的 `isPublic` 状态                  |
| `POST /api/ops/group-delete`               | 删除一个 group 及其桶内图像前缀、已发布 bundle |
| `POST /api/ops/group-reorder`              | 调整一个 case 内 group 顺序                    |
| `POST /api/ops/group-upload-start`         | 启动或恢复一个 group 上传作业                  |
| `POST /api/ops/group-upload-frame-prepare` | 为单个 frame 申请 presigned PUT URL            |
| `POST /api/ops/group-upload-frame-commit`  | 提交单个 frame，切换数据库到新 revision        |
| `POST /api/ops/group-upload-complete`      | 在全部 frame 提交后完成整个 group 上传         |
| `POST /api/ops/group-upload-cancel`        | 放弃 active 上传作业并清理未提交 pending 前缀  |
| `POST /api/ops/public-deploy`              | 导出并部署完整 public-site                     |

## Case 相关端点

### `POST /api/ops/case-create`

实现：`apps/internal-site/app/api/ops/case-create/route.ts`

请求体：

```json
{
  "slug": "new-case",
  "title": "New Case",
  "summary": "Draft summary"
}
```

成功响应：

```json
{
  "caseSlug": "new-case",
  "title": "New Case",
  "summary": "Draft summary",
  "status": "draft"
}
```

说明：

- 只创建一个空的 `draft` case，不创建 group、frame 或对象存储内容。
- `slug` 使用 `SlugSchema`，因此不允许 `bad--case` 这类 public slug 分隔符形式。
- 如果 slug 已存在，返回 `409` 和 `{ "error": "Case already exists." }`。
- 创建 case 不会触发 publish、public export 或 deploy。

### `POST /api/ops/case-delete`

实现：`apps/internal-site/app/api/ops/case-delete/route.ts`

请求体：

```json
{
  "caseSlug": "2026"
}
```

成功响应：

```json
{
  "caseSlug": "2026",
  "deleted": true
}
```

说明：

- 只允许删除空 case。
- 如果 case 下仍有任意 group，会返回 `409`，错误消息为 `Case must be empty before deletion.`。
- 这个接口不会递归清理 group，也不会触发对象存储递归删除。

### `POST /api/ops/case-update`

实现：`apps/internal-site/app/api/ops/case-update/route.ts`

请求体：

```json
{
  "caseSlug": "2026",
  "summary": "Updated summary"
}
```

成功响应：

```json
{
  "caseSlug": "2026",
  "summary": "Updated summary"
}
```

说明：

- 当前只修改 `Case.summary`，不修改 slug、title、status 或发布状态。
- `summary` 会 trim 后保存，允许为空字符串。
- 如果 case 不存在，返回 `404` 和 `{ "error": "Case not found." }`。

## Group / Frame 工作区端点

### `POST /api/ops/group-viewer`

实现：`apps/internal-site/app/api/ops/group-viewer/route.ts`

请求体：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group"
}
```

成功响应：

```json
{
  "dataset": {
    "caseMeta": {
      "slug": "2026",
      "title": "2026",
      "summary": "",
      "tags": [],
      "status": "internal",
      "publishedAt": null
    },
    "group": {
      "id": "group-1",
      "slug": "test-group",
      "title": "Test Group",
      "description": "",
      "defaultMode": "a-b",
      "tags": [],
      "isPublic": false,
      "frames": []
    },
    "siblingGroups": [],
    "publishStatus": {
      "status": "internal"
    }
  }
}
```

说明：

- 这是只读接口，供 internal-site 的 Group viewer 导航加载另一组 dataset，不修改数据库或发布状态。
- `caseSlug` 和 `groupSlug` 必须为非空字符串；校验失败返回 `400`。
- 找不到对应 group 时返回 `404` 和 `{ "error": "Group not found." }`。

素材的微型 WebP 马赛克和源色随 dataset 内嵌。上传、导入时预生成并保存在 Asset 元数据；导入在改写数据库前以四并发处理缩略图。公开 manifest 复用同一数据；Viewer 不再发起独立的占位图请求。

### `POST /api/ops/group-update`

实现：`apps/internal-site/app/api/ops/group-update/route.ts`

请求体：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "title": "Test Group",
  "description": "Updated description"
}
```

成功响应：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "title": "Test Group",
  "description": "Updated description"
}
```

说明：

- 当前只修改 `Group.title` 和 `Group.description`，不修改 slug、排序、公开状态或素材；公开 Group 的 manifest 会同步刷新。
- `title` trim 后必须非空；`description` trim 后允许为空。
- 如果 group 不存在，返回 `404` 和 `{ "error": "Group not found." }`。

### `POST /api/ops/group-visibility`

实现：`apps/internal-site/app/api/ops/group-visibility/route.ts`

请求体：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "isPublic": true
}
```

成功响应：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "isPublic": true
}
```

说明：

- 切换 group 的公开资格时会同步刷新 published manifest；改为内部时会删除对应 bundle。

### `POST /api/ops/group-delete`

实现：`apps/internal-site/app/api/ops/group-delete/route.ts`

请求体：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group"
}
```

成功响应：

```json
{
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "groupTitle": "Test Group",
  "removedPublishedBundle": true,
  "publicSlug": "2026/test-group"
}
```

说明：

- 删除 group 时会同步删除该 group 的对象存储前缀 `storageRoot`。
- 如果 group 已发布，还会同步删除对应 published bundle。
- 删除完成后，服务端会重算 case cover，并同步修正 case 发布状态。

### `POST /api/ops/group-reorder`

实现：`apps/internal-site/app/api/ops/group-reorder/route.ts`

请求体：

```json
{
  "caseId": "case-1",
  "groupIds": ["group-2", "group-1", "group-3"]
}
```

成功响应：

```json
{
  "ok": true
}
```

说明：

- `groupIds` 必须无重复，并且完整包含该 Case 当前全部 Group。
- 缺失、重复或混入其他 Case 的 Group ID 时返回 `409`，且不会写入顺序或刷新 manifest。
- 校验通过后按 `groupIds` 数组顺序写入 `order`。
- Case 含公开 Group 时会同步刷新 published manifest。

## Frame 级上传事务端点

当前上传工作流固定为：

1. `POST /api/ops/group-upload-start`
2. 对每个 frame 调用 `POST /api/ops/group-upload-frame-prepare`
3. 客户端把文件直传到 prepare 返回的 presigned PUT URL
4. 每个 frame 上传完成后调用 `POST /api/ops/group-upload-frame-commit`
5. 全部 frame 提交完成后调用 `POST /api/ops/group-upload-complete`

如果用户在 Web 上传中选择放弃，客户端会调用 `POST /api/ops/group-upload-cancel` 取消 active job 并清理未提交 pending 对象。

### `POST /api/ops/group-upload-start`

实现：`apps/internal-site/app/api/ops/group-upload-start/route.ts`

请求体：

```json
{
  "case": {
    "slug": "2026",
    "title": "2026",
    "summary": "",
    "tags": [],
    "coverAssetLabel": "After"
  },
  "group": {
    "slug": "test-group",
    "title": "Test Group",
    "description": "",
    "order": 0,
    "defaultMode": "a-b",
    "tags": []
  },
  "frames": [
    {
      "order": 0,
      "title": "Frame 1",
      "caption": "",
      "assets": [
        {
          "slot": "before",
          "kind": "before",
          "label": "Before",
          "note": "",
          "width": 1920,
          "height": 1080,
          "isPrimaryDisplay": true,
          "original": {
            "extension": ".png",
            "contentType": "image/png",
            "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "size": 123456
          },
          "thumbnail": {
            "extension": ".webp",
            "contentType": "image/webp",
            "sha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            "size": 23456
          }
        },
        {
          "slot": "after",
          "kind": "after",
          "label": "After",
          "note": "",
          "width": 1920,
          "height": 1080,
          "isPrimaryDisplay": false,
          "original": {
            "extension": ".png",
            "contentType": "image/png",
            "sha256": "1111111111111111111111111111111111111111111111111111111111111111",
            "size": 123123
          },
          "thumbnail": {
            "extension": ".webp",
            "contentType": "image/webp",
            "sha256": "2222222222222222222222222222222222222222222222222222222222222222",
            "size": 23123
          }
        }
      ]
    }
  ],
  "forceRestart": false
}
```

字段说明：

- `case.slug`、`group.slug`、`frame.order` 是恢复上传和定位目标的关键键。
- `case.coverAssetLabel` 可以为空。
- Viewer 统一预设为 `a-b`。`group.defaultMode` 仅为旧客户端与 manifest 保留，上传输入统一归一化为 `a-b`，不再提供自定义图组默认模式。
- `frames[].assets` 当前最少需要两个 asset。
- `forceRestart` 可选，默认 `false`。
- 不带 `protocol` 时使用完整 frame 快照，兼容既有调用方。
- Web 工作台使用 `protocol: "stream-v2"`；start 中只提交已经完整预检的源文件描述，缩略图和自动 heatmap 在逐帧 prepare 时补齐。

`stream-v2` 的 frame 形状：

```json
{
  "protocol": "stream-v2",
  "frames": [
    {
      "order": 0,
      "title": "Frame 1",
      "caption": "",
      "assets": [
        {
          "slot": "slot-001",
          "kind": "before",
          "label": "Src",
          "note": "",
          "width": 1920,
          "height": 1080,
          "isPrimaryDisplay": true,
          "original": {
            "extension": ".png",
            "contentType": "image/png",
            "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "size": 123456
          }
        },
        {
          "slot": "slot-002",
          "kind": "after",
          "label": "Rip",
          "note": "",
          "width": 1920,
          "height": 1080,
          "isPrimaryDisplay": true,
          "original": {
            "extension": ".png",
            "contentType": "image/png",
            "sha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            "size": 123123
          }
        }
      ],
      "generatedHeatmap": {
        "slot": "slot-003",
        "beforeSlot": "slot-001",
        "afterSlot": "slot-002"
      }
    }
  ]
}
```

成功响应：

```json
{
  "groupUploadJobId": "job-1",
  "inputHash": "7b4c...",
  "expectedFrameCount": 24,
  "committedFrameCount": 12,
  "canComplete": false,
  "frameStates": [
    { "frameOrder": 0, "status": "committed" },
    { "frameOrder": 1, "status": "committed" },
    { "frameOrder": 2, "status": "pending" }
  ]
}
```

说明：

- 如果 case 已存在，当前代码不会用上传端 metadata 覆盖 case 标题、摘要、标签；已有 case 仍以数据库为准。
- 如果 group 已存在，title / description / order / tags 会按本次输入更新；默认模式统一写为 `a-b`。
- 同一 group 在输入哈希未变化、且存在活动 job 时会直接恢复现有 job。
- 输入变化或显式传入 `forceRestart=true` 时，服务端会清空整个 group 当前数据并重建上传 job；输入哈希相同的活动 job 会直接恢复。
- 如果目标 group 之前是公开状态，启动上传时会立刻降回 `isPublic=false`，并删除对应已发布 bundle，避免公开站点看到半替换内容。
- 当前实现里，route 只负责 schema 校验和错误包装；具体 resume / reset / visibility downgrade 由 `lib/server/uploads/upload-service.ts` 和 `upload-group-lifecycle.ts` 分层完成。

### `POST /api/ops/group-upload-frame-prepare`

实现：`apps/internal-site/app/api/ops/group-upload-frame-prepare/route.ts`

请求体：

```json
{
  "groupUploadJobId": "job-1",
  "frameOrder": 12
}
```

成功响应：

```json
{
  "groupUploadJobId": "job-1",
  "frameOrder": 12,
  "pendingPrefix": "/groups/9e16.../13/78cc...",
  "files": [
    {
      "slot": "before",
      "variant": "original",
      "logicalPath": "/groups/9e16.../13/78cc.../o1.png",
      "uploadUrl": "https://<bucket-endpoint>/...",
      "expiresInSeconds": 600,
      "contentType": "image/png"
    },
    {
      "slot": "before",
      "variant": "thumbnail",
      "logicalPath": "/groups/9e16.../13/78cc.../t1.webp",
      "uploadUrl": "https://<bucket-endpoint>/...",
      "expiresInSeconds": 600,
      "contentType": "image/webp"
    }
  ]
}
```

说明：

- `frameOrder` 使用 frame 的业务顺序值，不是数据库主键。
- `pendingPrefix` 的中间层目录使用 `frameOrder + 1`，因此 `frameOrder=12` 时路径里会出现 `/13/`。
- 已准备且描述未变化的 frame 会复用原有 `pendingPrefix` 与资产清单，只重新签发 URL；不会删除已上传对象或生成新 revision。
- 已准备但描述变化时返回 `409`。删除 pending 前缀只发生在显式 cancel、强制重启或过期任务清理。
- 如果该 frame 已经是 `committed`，这个接口会返回 `409`，避免重复 prepare。
- presign 组装和对象路径命名都在服务端完成，客户端不自行决定最终 bucket key。
- `stream-v2` 必须在 prepare 请求中附带该 frame 的完整生成描述；服务端会与 start 的源摘要、尺寸、slot 和 heatmap 计划逐项核对。
- prepare 的 presign 和 commit 前的对象签名读取都使用有界并发；SQLite commit 仍按 frame 串行。

### `POST /api/ops/group-upload-frame-commit`

实现：`apps/internal-site/app/api/ops/group-upload-frame-commit/route.ts`

请求体：

```json
{
  "groupUploadJobId": "job-1",
  "frameOrder": 12
}
```

成功响应：

```json
{
  "groupUploadJobId": "job-1",
  "frameOrder": 12,
  "status": "committed"
}
```

说明：

- commit 前，服务端会对该 frame 的所有 original / thumbnail 逻辑路径做对象存在性和图像合理性检查。
- 对已 `committed` 的同一 frame 重复调用会直接返回既有 `committed` 结果，不重复读取对象存储或写入数据库。
- commit 会以条件状态更新声明该 frame；声明、替换旧 frame、创建新 asset 行和递增 `committedFrameCount` 在同一事务中完成，并发重复请求只会有一个请求写入。
- 新写入的 frame 当前会带 `isPublic=true`，但 group 的公开与否仍由 group 自身 `isPublic` 决定。
- commit 成功后，旧 committed revision 的桶前缀会被删除。
- 可重试的 commit 失败不会重建 prepared revision；客户端应先重试同一 commit，再在 PUT 失败时重新申请同一路径的 presigned URL。

### `POST /api/ops/group-upload-complete`

实现：`apps/internal-site/app/api/ops/group-upload-complete/route.ts`

请求体：

```json
{
  "groupUploadJobId": "job-1"
}
```

成功响应：

```json
{
  "groupUploadJobId": "job-1",
  "caseSlug": "2026",
  "groupSlug": "test-group",
  "committedFrameCount": 24
}
```

说明：

- 只有当当前 job 里的所有 frame 都已经 `committed` 时，complete 才会成功。
- complete 成功后，group upload job 会标记为 `completed`，group 会记录本次 `inputHash`，然后重算 case cover 和 case 发布状态。
- 如果还有任意 frame 未提交，会返回 `409`，错误消息为 `Not every frame in the upload job has been committed.`。

### `POST /api/ops/group-upload-cancel`

实现：`apps/internal-site/app/api/ops/group-upload-cancel/route.ts`

请求体：

```json
{
  "groupUploadJobId": "job-1"
}
```

成功响应：

```json
{
  "groupUploadJobId": "job-1",
  "status": "cancelled",
  "deletedPendingPrefixCount": 2
}
```

说明：

- 只接受仍为 active 且未过期的 upload job。
- 服务端会把未 committed 的 frame jobs 标记为 `cancelled`，再把 group upload job 标记为 `cancelled`。
- 服务端会删除这些未提交 frame job 的 `pendingPrefix` 对象前缀。
- 已经 committed 的 frame 内容不会被删除；cancel 是放弃本次 active 上传会话，不是删除 group。

## Public 站点导出与部署端点

### `POST /api/ops/public-deploy`

实现：`apps/internal-site/app/api/ops/public-deploy/route.ts`

请求体：无。

成功响应：

```json
{
  "stdout": "...",
  "stderr": "",
  "buildOutputDir": "/abs/path/apps/public-site/out",
  "exportDir": "/abs/path/output/public-site",
  "projectName": "magic-compare-public",
  "branch": "main"
}
```

说明：

- 部署任务读取完整的当前 published root，不接收 Case 上下文。
- 如果没有配置 Cloudflare Pages 所需环境变量，启动请求会返回 `500` 并记录服务端日志。
- 已有部署任务运行时，重复请求返回当前任务并标记 `reused=true`。

## 当前没有的端点

以下能力当前已经不再由 internal-site 提供单独 API：

- 不再存在 `POST /api/ops/internal-asset-upload`
- 不再存在旧的 `POST /api/ops/import-sync`
- 不再提供仅供旧上传器使用的 case 列表、case group 列表与 case 搜索端点
- 不再提供没有界面调用方的 frame 排序与 public export HTTP 端点；公开导出使用 `pnpm public:export`
- case summary 和 group title / description 已有专门 metadata 端点；当前没有 slug / status / asset 级任意修改端点
- 不存在“直接覆盖/删除单个对象”的上传工具专用端点

## 代码定位

- 路由入口：`apps/internal-site/app/api/ops/*`
- 上传契约：`apps/internal-site/lib/server/uploads/contracts.ts`
- 上传事务实现：`apps/internal-site/lib/server/uploads/upload-service.ts`
- 上传生命周期：`apps/internal-site/lib/server/uploads/upload-group-lifecycle.ts`
- 上传作业状态：`apps/internal-site/lib/server/uploads/upload-job-repository.ts`
- 上传对象操作：`apps/internal-site/lib/server/uploads/upload-storage-operations.ts`
- case / group 变更实现：`apps/internal-site/lib/server/content/mutation-service.ts`
- 发布实现：`apps/internal-site/lib/server/publish/publish-case-service.ts`
- public export / deploy 实现：`apps/internal-site/lib/server/public-site/runtime/runtime-service.ts`
