# 2026-03-28 可维护性整治记录

这份记录总结最近一轮围绕上传链路、viewer/workspace 副作用边界做的结构整理，以及通过 MCP Vector Search 重新确认的热点。  
它是经验存档，不是当前硬约束；真正生效的流程规则仍以 `docs/workflow-guide.md` 等常青文档为准。

## 这轮为什么要做

相对 `main` 的最近改动里，几个热点文件已经明显开始往“单文件事务层”方向膨胀：

- `apps/internal-site/lib/server/uploads/upload-service.ts`
- `tools/uploader/src/upload_executor.py`
- `tools/uploader/src/wizard.py`
- `apps/internal-site/components/case-workspace/workspace-action-helpers.ts`
- `apps/internal-site/components/case-workspace/use-workspace-notifications.ts`
- `packages/ui/src/viewer/group-viewer-workbench.tsx`

MCP Vector Search 在重构前给出的信号很一致：长函数、重复副作用样板、状态推进和 UI 编排混在一起。

## 这轮实际收敛了什么

### 上传链路

- `upload-service.ts` 只保留 start / prepare / commit / complete 主流程
- `upload-service-helpers.ts` 吸收了作业装载、group 清空、presign 组装、frame guard、complete 收尾
- `upload_executor.py` 改成 runtime state + frame context 模式，session 写入、重试统计、per-frame prepare/upload/commit 拆开
- `wizard.py` 拆成 case 选择、工作目录准备、structured plan 校验、上传执行与结果打印四段

### viewer / workspace

- `group-viewer-workbench.tsx` 把媒体偏好、cookie 持久化、viewport sync、键盘快捷键、A/B outside-click 拆到局部 hook
- `viewer-toolbar.tsx` 把 A/B inspect controls 抽成独立组件
- `workspace-action-helpers.ts` 统一成 transition + optimistic mutation + notification 的共用路径
- `use-workspace-notifications.ts` 把 queue / timer 和 saving toast API 分开

## 这轮验证过什么

- `pnpm --filter @magic-compare/ui typecheck`
- `pnpm --filter @magic-compare/internal-site build`
- `pnpm --filter @magic-compare/internal-site test`
- `cd tools/uploader && python -m unittest discover -s tests`

## 这轮留下的经验

### 1. 上传事务最容易再次塌缩成“大一统服务”

一旦把“找 job / 校验 frame / 删旧前缀 / 写 Prisma / 刷 cover”重新写回主流程函数，文件会很快重新长回去。  
更稳的做法是让主流程只保留阶段顺序，把 guard 和副作用细节留给 helper。

### 2. viewer 容器组件最怕混进副作用实现细节

`group-viewer-workbench.tsx` 这种壳组件如果同时管理 cookie、媒体查询、键盘、A/B active 状态和布局，就会很快失去可读性。  
把副作用拆到 workbench 局部 hook 后，主组件更容易保持“数据编排 + JSX 外壳”的角色。

### 3. optimistic UI 的问题通常不是算法，而是样板分叉

workspace action 里最容易坏的不是请求本身，而是：

- live ref 和 React state 何时一起替换
- rollback 是否漏掉
- saving toast 是否重复或漏关
- transition 包装是否不一致

把这些共性样板集中后，后续再加 action 的风险会小很多。

### 4. uploader 的可维护性关键在“frame 上下文”而不是再加 if/else

frame 级上传现在已经不是简单循环。  
它同时要处理：

- resume
- prepare
- presigned PUT 多线程上传
- commit
- 本地 session 写回
- 失败聚合

继续靠一个主函数串着这些分支，只会让恢复上传逻辑越来越难改。用 runtime state / frame context 这类轻量对象承载上下文会更稳。

## 后续如果再继续整治，优先看哪里

- `apps/internal-site/lib/server/publish/publish-case-service.ts`
- `apps/internal-site/lib/server/content/case-maintenance.ts`
- viewer 其余 workbench 子模块是否还存在重复副作用
- uploader 里是否还需要把部分 dict 会话结构收紧成更明确的数据类型
