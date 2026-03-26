# 提交与分支规范

本文档定义本仓库的提交粒度、分支使用和合并前自检要求。
目标是降低回归风险，并让每次提交可追溯、可审阅。

## 原则

小步、可以在开发中提交，不把多阶段内容堆成一次提交。用简洁的 git 提交流程处理，重点放在一条清晰、可审阅的 commit message。
`main` 视为生产发布分支，禁止作为日常开发分支直接提交。

推荐命令习惯：

```bash
git switch -c codex/<topic>
git add -A
git commit -m "refactor: switch uploader to frame-level presigned uploads"
```

说明：

- `git add -A` 或 `git add .` 足够，不要把时间浪费在逐文件手点暂存上
- 真正需要精力的是 commit message，要把“为什么改、改了哪一类链路”说清楚
- 如果一个提交说明写不清，通常意味着这次改动粒度还不够干净

## 提交要求

1. **每完成一个独立步骤就提交一次**。
2. **开发工作必须先切到非 `main` 分支**，不要再直接在 `main` 上提交功能、修复或样式改动。
3. **每次提交只解决一类问题**，避免把重构、功能、样式、修复混在一起。
4. **提交前先自检**：能运行、类型通过、没有明显破坏已有结构。
5. **提交信息必须可读、可回溯**，让人一眼看出这一提交做了什么。

## 分支规则

1. **`main` 只用于生产就绪内容**。
2. **所有开发、重构、优化、文档补充都在独立分支上进行**。
3. **一个分支只承载一组相关目标**，不要把完全无关的工作堆在同一分支。
4. **准备合并回 `main` 前，先保证该分支已经通过必要验证**。

## 提交信息格式

建议使用：

```text
<type>: <summary>
```

必要时可以追加 1-3 行补充，说明本次提交覆盖的关键链路：

```text
refactor: switch uploader to frame-level presigned uploads

- remove internal binary upload proxy and import-sync dependency from uploader
- add group-upload start/prepare/commit/complete API flow
- move Docker/runtime defaults to external R2-style S3 storage
```

常用 `type`：

* `feat`：新功能
* `fix`：修复
* `refactor`：重构
* `style`：样式与结构整理
* `docs`：文档
* `chore`：配置、脚本、依赖调整
* `test`：测试

## 禁止事项

* 不要最后一次性提交所有改动。
* 不要使用模糊提交信息，或是只用一行简要概括。
* 不要写成“update”“fix stuff”“wip”这类无法审阅的提交信息。
* 不要跳过已完成步骤的提交，导致历史无法回溯。
* 不要继续把日常开发直接提交到 `main`。
