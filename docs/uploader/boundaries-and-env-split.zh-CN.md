# Uploader 与网站边界整理记录

这份记录总结本轮把 Python uploader 与 TS/JS 网站显式拆开的原因、做法与后续约束。
重点不是“目录变好看了”，而是避免同一个 `.env`、同一组文档、同一套心智模型继续跨语言串味。

## 1. 这次为什么要拆

- `tools/uploader` 是本地优先的 Python 导入工具，不是网站运行时的一部分。
- `apps/internal-site` / `apps/public-site` 是 TS/JS 网站与发布链路，不应该继续承担 uploader 的配置入口说明。
- 把 uploader 变量混进根 `.env.example`，会让人误以为“站点本身必须理解 Cloudflare Access token 和 uploader API 推导逻辑”。
- 把 uploader 说明放在 `tools/uploader/README.md`，会让 Python 工具文档和代码耦在一起，后续做网站整理时也更容易漏改。

## 2. 本轮落地结果

- uploader 专用模板移到 `tools/uploader/.env.example`
- 根 `.env.example` 只保留网站、Docker、发布和 Pages 相关变量
- uploader 说明文档移到 `docs/uploader/README.md`
- VSEditor 导入流程文档移到 `docs/uploader/vseditor-workflow.zh-CN.md`

## 3. 后续约束

- 新增 uploader 变量时，优先更新 `tools/uploader/.env.example`，不要再回写到根 `.env.example`
- 新增 uploader 使用说明、排障经验或导入规范时，优先写到 `docs/uploader/`
- 网站 README 可以保留 uploader 导航，但不要再承载 uploader 的完整配置细节
- 如果网站端需要消费 uploader 产物，应通过 manifest / API / 对象存储边界交互，而不是共享一份“全仓通用 env 模板”
