# 提交与分支规范

## 原则

分步、可以在开发中提交，不把多阶段内容堆成一次提交。用简洁的 git 提交流程处理，重点放在一条清晰、可审阅的 commit message。
`main` 视为生产发布分支，禁止作为日常开发分支直接提交。

推荐命令习惯：

```bash
git switch -c codex/<topic>
git add -A
git diff --cached --check
git commit -m "refactor: improve web upload frame processing"
git show --stat --format=fuller HEAD
```

说明：

- `git add -A` 或 `git add .` 足够，不要把时间浪费在逐文件手点暂存上
- 真正需要精力的是 commit message，要把“为什么改、改了哪一类链路”说清楚

## 提交要求

1. **开发工作必须先切到非 `main` 分支**，不要再直接在 `main` 上提交功能、修复或样式改动。
2. **每次提交只解决一类问题**，避免把重构、功能、样式、修复混在一起。
3. **提交信息必须可读、可回溯**，让人一眼看出这一提交做了什么。

## 提交信息格式

建议使用：

```text
<type>: <summary>
```

对于复杂变更，不能只用一行说明；简单改动可以只写一行。
说明本次提交覆盖的关键链路：

```text
refactor: ...

- ...
- ...
```

常用 `type`：

- `feat`：新功能
- `fix`：修复
- `refactor`：重构
- `style`：样式与结构整理
- `docs`：文档
- `chore`：配置、脚本、依赖调整
- `test`：测试

### 多行提交说明

复杂变更使用真实换行写正文。推荐用 heredoc，提交消息在 shell 和 Git 中都保持原样：

```bash
git commit -F - <<'EOF'
refactor: ...

- ...
- ...
EOF
```

也可以用多个 `-m` 参数，每个参数表示一个段落。
如果当前提交尚未推送，可以用同样的 `git commit --amend -F - <<'EOF'` 方式修正正文；已有多个本地提交时，逐个 reword 后再推送。

## 禁止事项

- 不要最后一次性提交所有改动。
- 不要使用模糊提交信息，或是只用一行简要概括。
- 不要写成“update”“fix stuff”“wip”这类无法审阅的提交信息。
- 不要跳过已完成步骤的提交，导致历史无法回溯。
