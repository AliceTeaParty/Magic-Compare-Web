# 2026-03-28 上传体验与吞吐优化记录

这份记录保存本轮 uploader 体验优化时确认过的取舍和经验。  
它是临时设计记忆，不代替 `docs/workflow-guide.md` 或 `docs/uploader/README.md` 里的当前规范。

## 为什么只给 wizard 做复杂进度

- `wizard` 面向人工操作，用户更在意“现在卡在哪一帧、是不是还在传、是否有失败重试”
- `sync` 更偏脚本化入口，保持轻量状态输出更稳，不值得为了 Rich 实时 UI 把命令行接口复杂化

所以这轮共享执行器内部的进度事件模型，但只让 `wizard` 消费并渲染。

## 为什么进度按文件数，不按字节

- 当前上传是 frame 级 prepare / commit，操作者更关心“哪一帧完成了没有”，不是纯下载器式字节吞吐
- original 和 thumbnail 都真实消耗上传时间，所以总进度按文件数统计更贴近体感
- 字节级进度要引入更复杂的流式统计、线程安全聚合和 UI 刷新，收益没有这轮需求高

因此这轮采用：

- 总体文件进度条
- 当前 frame 状态行
- skipped / retried / failed 统计

不显示字节速度和 ETA。

## 这轮吞吐优化的边界

这次只做到“中等提速”：

- 共享 `httpx.Client`
- 文件流式 PUT，避免整文件读入内存
- frame 内自适应并发
- 单 frame lookahead prepare

没有做：

- 多 frame 同时上传
- 多 frame 同时 commit
- 更复杂的跨 frame 队列状态机

原因是恢复上传和失败回滚目前仍是 frame 级语义，跨 frame 并发会明显抬高状态复杂度。
