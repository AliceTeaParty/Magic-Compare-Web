# 2026-03-26 R2 / Frame Upload Rewrite Notes

这份临时记录用于保存本轮“外置 R2 + frame 级 presigned 上传”重构中已经验证过的工程经验，避免下一轮再次踩同样的坑。

## 已确认

- Cloudflare API 本身不负责生成 presigned PUT URL；真正的签名动作仍然要由 internal-site 使用 S3-compatible SDK 在服务端完成。
- `group` 适合做作业和收尾管理，`frame` 适合做最小上传与替换粒度。直接把整个 group 当成单次事务，恢复成本太高。
- 只靠本地 session 不够，恢复时必须以服务端保存的 `groupUploadJob` / `frameUploadJob` 状态为准，否则会误判哪些 frame 已经提交。
- “输入变化时立即清空整组再重传”虽然激进，但能明显减少新旧 frame 混杂、残留对象和已公开 bundle 悬挂的问题。
- 删除 group 时不能再根据 `caseSlug/groupSlug` 猜 bucket 路径，必须依赖数据库里保存的 `storageRoot`。

## 这次特意保留的边界

- 不做历史数据兼容；旧 `/internal-assets/<case>/<group>/...` 路径只作为内部 seed/旧数据容忍，不再是新上传方案。
- uploader 不再拥有任何对象存储凭据，也不再决定最终 logical asset URL。
- group 默认内部草稿；公开状态只能在 internal-site 内部站上调整。
- case 删除只允许空 case，不做递归删 group，避免扩大误删范围。

## 下次改动前应先复核

- Prisma schema 与 `prisma/init-db.ts` 是否同时更新。
- `apps/internal-site/lib/server/storage/internal-assets.ts` 的 logical path 规范有没有被新逻辑绕开。
- Docker / CI 是否仍然残留本地对象存储假设。
- uploader 的 `--reset-session` 是否仍然会触发服务端整组重置，而不是只清本地文件。
