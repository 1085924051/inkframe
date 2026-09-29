# Iteration 12 — 视频 Provider 提交前配置校验

## 目标

当用户选择 Runway、可灵或 Seedance 但尚未配置 API Key 时，在创建异步视频任务之前立即返回可操作错误，避免队列中出现必然失败的任务。

## 实现

- 新增 `validateVideoProviderConfig()`，只读取本地模型配置，不发网络请求。
- `mock-video` 保持可直接联调。
- 未知 Provider 或缺少 API Key 返回 HTTP 400。
- 前端保留已成功提交的镜头，并在错误中提示到后台模型配置填写缺失字段。

## 验证

- Vitest：43 项测试通过。
- TypeScript：`npx.cmd tsc --noEmit` 通过。
- 生产构建：`npm.cmd run build` 通过。

## 边界

配置校验只负责本地字段完整性；Provider 的真实连通性和鉴权仍由后台配置检查及异步 worker 处理。
