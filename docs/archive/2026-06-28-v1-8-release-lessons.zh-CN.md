# v1.8.0 发版经验与教训

本文记录 v1.8.0 对比图、Case workspace、uploader 收尾和 CI 发版流程中的经验。
它是一次性复盘材料，不替代 `docs/workflow-guide.md`、`docs/commit-guide.md` 或具体 workflow 文件。

## 经验

- 发版前先确认触发面。`main` push、version tag、manual dispatch 的用途不同；Docker 镜像这类发布产物应默认跟随版本 tag，而不是每次 `main` push 都打包。
- 已弃用工具只保留必要维护。Python uploader 进入 FINAL 后，修复应限于兼容性、安全性或阻塞旧流程的问题，不应继续用测试和 CI 约束细枝末节文案。
- 测试要服务关键风险。上传代理、workspace metadata mutation、viewer 交互状态这类功能值得测试；启动横幅上的弃用提示属于发布提示，文档和人工检查比专门断言更合适。
- 工作流职责要保持单一。普通 CI 负责验证，GHCR workflow 负责版本镜像，uploader-binaries workflow 只在确实需要补发 legacy 二进制时手动运行。
- 发版记录要覆盖整个版本。CHANGELOG 不应只写最后一轮 UI 修改；应覆盖自上一版本以来的产品能力、性能修复、文档、工具和发布策略变化。

## 教训

- UI 快速迭代时容易把“看起来能编辑”误当成“保存路径也稳定”。后续 workspace 编辑类功能必须同时检查打开、保存、失败回滚、窄屏和 hydration。
- 不要把临时体验文案过度测试化。过细的测试会增加维护成本，并把注意力从真正的业务风险转移到易变 copy。
- 发 tag 前要先审视自动化副作用。v1.8.0 发布时，binary 和 Docker workflow 的自动触发面过宽，导致发布后还需要补做 CI 收敛。
- 旧上传器与未来 Web 上传的边界要更明确。FINAL 标记不只是文案，也意味着后续设计讨论应默认投向 Web workspace，而不是继续扩展 CLI。

## 后续原则

- 版本发布产物只由版本 tag 触发；需要临时验证时使用 `workflow_dispatch`。
- 已弃用组件的 workflow 默认手动触发，除非确有补发二进制的计划。
- 每次发布前检查 `.github/workflows/` 的触发条件，确认不会因为 `main` 与 tag 连续 push 造成重复打包。
- 新功能测试优先覆盖状态机、数据写入、网络边界和失败回滚；不要为低风险展示文案增加专门断言。
