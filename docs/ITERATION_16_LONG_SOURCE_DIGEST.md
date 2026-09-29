# Iteration 16 — 长文本剧情拆分与 vLLM 兼容

## 页面故障定位

3001 的 API 和页面 HTML 均正常，但页面引用的 Next 静态 CSS/JS 返回 404。原因是开发服务器运行时执行了 `next build`，生产构建覆盖了开发服务器使用的 `.next` 产物。停止旧进程并重新运行 `npm.cmd run dev -- --hostname 0.0.0.0 --port 3001` 后，CSS/JS 资源均返回 200。

开发服务器运行期间不要执行 `npm.cmd run build`；构建验收时先停止 dev，构建完成后再重新启动 dev。

## 长文本处理

- 浏览器改用 `multipart/form-data` 上传文本，避免把全文复制到 JSON 字符串中。
- 服务端按约 12,000 字符切块，保留总字数、块数和章节信号。
- 本地预处理全量扫描章节标题和约束候选，不把几百万字直接塞进单次模型请求。
- 模型只接收代表性片段和本地信号，输出主要剧情、Story Bible、角色、章节/故事弧、叙事视角和分集参数。
- 自动回填项目形态、集数、单集目标字数、剧本长度和叙事视角。
- 结果持久化到 WriterStyle 的 `sourceDigestJson`，后续可作为长篇项目的约束输入。
- 无 LLM 时保留本地确定性摘要和集数估算；接入 vLLM 后使用模型汇总结果覆盖这些字段。

## vLLM 配置

vLLM 提供 OpenAI 兼容接口，因此直接填写现有文本模型配置即可：

```text
LLM_API_URL=http://127.0.0.1:8000/v1
LLM_API_KEY=EMPTY
LLM_MODEL=Qwen/Qwen2.5-32B-Instruct
```

服务端必须开启 Chat Completions 兼容接口，并使用支持结构化 JSON 输出的指令模型。当前实现最多接受 2,000 万字符，超过后应按卷拆分导入。

## 验证

- TypeScript：通过。
- 原有 43 项测试保持通过。
- 新增长文本分块与本地摘要测试。
