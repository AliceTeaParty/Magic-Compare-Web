# commit-guide.md

## 原则

小步提交，随做随提交，不要把多个阶段内容堆到最后一次提交。

## 提交要求

1. **每完成一个独立步骤就提交一次**。
2. **直接提交到当前主分支**，不要等待最后统一整理。
3. **每次提交只解决一类问题**，避免把重构、功能、样式、修复混在一起。
4. **提交前先自检**：能运行、类型通过、没有明显破坏已有结构。
5. **提交信息必须可读、可回溯**，让人一眼看出这一提交做了什么。

## 推荐提交粒度

适合单独提交的内容示例：

* 初始化目录或基础配置
* 新增一组 schema / 类型
* 新增一个页面骨架
* 接通一个 API
* 完成一个 viewer 子功能
* 完成缩略图带
* 完成排序持久化
* 修复一个明确 bug
* 做一次样式整理或命名清理

## 提交信息格式

建议使用：

```text
<type>: <summary>
```

常用 `type`：

* `feat`：新功能
* `fix`：修复
* `refactor`：重构
* `style`：样式与结构整理
* `docs`：文档
* `chore`：配置、脚本、依赖调整
* `test`：测试

## 示例

* `feat: scaffold internal-site routes and viewer shell`
* `feat: add shared zod schemas for case group frame asset`
* `fix: fallback to before-after when heatmap is missing`
* `refactor: move publish logic into internal-site server lib`
* `style: refine filmstrip spacing and selected states`
* `docs: add uploader directory contract`

## 禁止事项

* 不要最后一次性提交所有改动。
* 不要使用模糊提交信息，如 `update`、`fix stuff`、`wip`。
* 不要把无关改动塞进同一提交。
* 不要跳过已完成步骤的提交，导致历史无法回溯。
