# 公开内容修复

当 Case 元数据已经保存、但 manifest 同步失败时，在没有其他发布、导出或部署进程运行的情况下执行：

```bash
pnpm --filter @magic-compare/internal-site exec tsx scripts/repair-publication.ts <caseSlug>
```

命令先重新生成该 Case 当前公开图组的 manifest；随后扫描 `groups/*/manifest.json`，仅处理 `manifest.case.slug` 与参数完全一致的公开 URL 命名空间。仍属于当前公开 Group id 的 bundle 会保留，其余已隐藏或已删除 Group 的 bundle 会移除。

无法解析或缺少 manifest 的目录没有可靠的 Case 身份，命令会保留并在结果的 `skippedUnidentifiedDirectories` 中报告。命令不会处理对象存储素材，也不会导出或部署 public-site。
