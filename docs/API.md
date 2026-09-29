# InkFrame Studio 接口文档

> 本文档覆盖 InkFrame Studio 的全部 HTTP 接口，按功能分组，并给出使用规范与代码示例。
> 所有接口均为 JSON 通信（`Content-Type: application/json`），本地开发默认地址为 `http://localhost:3000`。

## 目录

1. [通用约定](#1-通用约定)
2. [项目与剧本生成](#2-项目与剧本生成)
3. [作家风格蒸馏](#3-作家风格蒸馏)
4. [项目回看](#4-项目回看)
5. [视频生成任务](#5-视频生成任务)
6. [模型接入（预留）](#6-模型接入预留)
7. [认证与账号](#7-认证与账号)
8. [后台管理（管理员）](#8-后台管理管理员)

---

## 1. 通用约定

- **基础地址**：`http://localhost:3000`（生产部署替换为实际域名）。
- **请求体**：除 `GET` 外，请求体使用 `application/json`。
- **响应体**：统一返回 JSON；成功时返回业务数据，失败时返回 `{ "error": "错误说明" }` 并附对应 HTTP 状态码。
- **认证**：本地能力无需认证；「预留」的模型接口按各家服务要求使用环境变量中的 API Key（见 [模型接入](#6-模型接入预留)）。

### 统一错误格式

| HTTP 状态码 | 含义 |
| --- | --- |
| `200` | 查询/生成成功 |
| `202` | 任务已受理（异步） |
| `400` | 请求参数不合法 |
| `404` | 资源不存在（项目 / 镜头 / 任务） |
| `500` | 服务端内部错误 |
| `429` | 触发限流（`Retry-After` 头给出重试秒数） |

> 安全约定：登录/注册/生成接口按 IP 限流（登录 10 次/分、注册 5 次/分、生成 30 次/分）；响应统一附带 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy` 等安全头；会话 Cookie 为 `SameSite=Lax`。

---

## 2. 项目与剧本生成

### 2.1 `POST /api/generate` —— 生成风格化剧本与分镜

根据「主题 + 作家风格 + 导演视觉」生成一个完整项目：剧本、场景、分镜提示词，并持久化。

**请求体（JSON）**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `topic` | string | 否 | 故事主题，缺省使用默认主题 |
| `writerId` | string | 否 | 作家风格卡 id（`luxun` / `zhangailing` / `wangxiaobo` 或自定义 id） |
| `directorId` | string | 否 | 导演视觉卡 id（`wong-kar-wai` / `makoto-shinkai` / `nolan`） |
| `writerStyle` | object | 否 | 蒸馏出的自定义作家风格（含 `id`、`name`、`summary`、`tags`、`axes` 等） |

**请求示例**

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"一个人决定在周五下午说出真话","writerId":"luxun","directorId":"wong-kar-wai"}'
```

```javascript
const response = await fetch("/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ topic: "一个人决定在周五下午说出真话", writerId: "luxun", directorId: "wong-kar-wai" }),
});
const data = await response.json();
console.log(data.project.id, data.project.shots.length, data.trace);
```

**响应示例（200）**

```json
{
  "project": {
    "id": "cmub5fwnx0001uqk0xksi7row",
    "title": "一个人决定在周五下午说出真话 · 风格化短剧",
    "topic": "一个人决定在周五下午说出真话",
    "logline": "当……撞上一个无法继续沉默的下午……",
    "script": "【场景一｜办公室｜傍晚】\n\n……",
    "scenes": [
      { "number": 1, "title": "周五，五点四十", "content": "……", "mood": "压抑 / 安静" }
    ],
    "shots": [
      { "id": "shot-……", "scene": 1, "duration": "04s", "size": "远景", "camera": "平视", "movement": "缓慢推进", "imagePrompt": "……", "videoPrompt": "……", "negativePrompt": "text, subtitle, watermark", "status": "draft" }
    ],
    "engine": "local"
  },
  "trace": [
    { "stage": "distill", "at": "2026-09-21T09:00:00.000Z", "summary": "作家风格「鲁迅」 → 语气剖面 107 字符" },
    { "stage": "script", "at": "2026-09-21T09:00:00.001Z", "summary": "剧本 250 字（鲁迅 × 王家卫）" },
    { "stage": "parse", "at": "2026-09-21T09:00:00.002Z", "summary": "剧本解析为 3 个场景" },
    { "stage": "shots", "at": "2026-09-21T09:00:00.003Z", "summary": "分镜生成 6 个镜头提示词" }
  ]
}
```

---

## 3. 作家风格蒸馏

### 3.1 `POST /api/styles/distill` —— 上传样本蒸馏作家风格卡

将一段样本文本压缩为 9 轴作家风格卡，并持久化。默认使用无模型的启发式打分，配置 LLM 后走真实模型。

**请求体（JSON）**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sample` | string | 是 | 样本文本，至少 80 个字符 |
| `name` | string | 否 | 风格卡名称，缺省为「我的作家风格」 |

**请求示例**

```bash
curl -X POST http://localhost:3000/api/styles/distill \
  -H "Content-Type: application/json" \
  -d '{"name":"我的风格","sample":"这是一段用于蒸馏作家风格的样本文章，字数需要超过八十个字符……"}'
```

```javascript
const file = document.querySelector("input[type=file]").files[0];
const sample = await file.text();
const response = await fetch("/api/styles/distill", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ""), sample }),
});
const data = await response.json();
console.log(data.style); // WriterStyle
```

**响应示例（200）**

```json
{
  "style": {
    "id": "custom-2e38ce75-f9e3-42e6-a367-ec7480df4f8f",
    "name": "我的风格",
    "era": "来自样本蒸馏",
    "summary": "从 120 个字符中提取出的个人文字气质。",
    "tags": ["样本蒸馏", "个人风格", "可编辑"],
    "axes": [
      { "label": "冷峻度", "value": 71 },
      { "label": "讽刺性", "value": 58 }
    ],
    "sample": "这是一段用于蒸馏……",
    "source": "distilled"
  }
}
```

**错误示例（400）**

```json
{ "error": "样本文章至少需要 80 个字符" }
```

---

## 4. 项目回看

### 4.1 `GET /api/projects` —— 项目列表

返回已持久化的项目摘要，按创建时间倒序。

**请求示例**

```bash
curl http://localhost:3000/api/projects
```

```javascript
const data = await (await fetch("/api/projects")).json();
console.log(data.projects); // ProjectSummary[]
```

**响应示例（200）**

```json
{
  "projects": [
    { "id": "cmub5fwnx0001uqk0xksi7row", "title": "……", "topic": "……", "logline": "……", "sceneCount": 3, "shotCount": 6, "createdAt": "2026-09-21T09:00:00.000Z" }
  ]
}
```

### 4.2 `GET /api/projects/:id` —— 项目详情

返回单个项目的完整数据（含剧本、场景、镜头与镜头状态）。

**路径参数**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 项目 id |

**请求示例**

```bash
curl http://localhost:3000/api/projects/cmub5fwnx0001uqk0xksi7row
```

```javascript
const data = await (await fetch("/api/projects/cmub5fwnx0001uqk0xksi7row")).json();
console.log(data.project.shots.map((shot) => shot.status));
```

**响应示例（200）**：与 [`/api/generate` 的 `project`](#21-post-apigenerate--生成风格化剧本与分镜) 结构一致。

**错误示例（404）**

```json
{ "error": "项目不存在" }
```

---

## 5. 视频生成任务

### 5.1 `POST /api/video/jobs` —— 提交视频生成任务

为某个镜头提交异步视频生成任务，立即返回 `202` 与任务 id，不阻塞请求。后台 worker 会把任务推进到终态。

**请求体（JSON）**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `projectId` | string | 是 | 项目 id |
| `shotId` | string | 是 | 镜头 id |
| `provider` | string | 否 | 视频 Provider，缺省 `mock-video`，可选 `runway` / `kling` / `seedance` |

**请求示例**

```bash
curl -X POST http://localhost:3000/api/video/jobs \
  -H "Content-Type: application/json" \
  -d '{"projectId":"cmub5fwnx0001uqk0xksi7row","shotId":"shot-……","provider":"mock-video"}'
```

```javascript
const response = await fetch("/api/video/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId, shotId, provider: "mock-video" }),
});
console.log(response.status); // 202
```

**响应示例（202）**

```json
{
  "job": {
    "id": "cmub5g3mk0007uqk0nsg2vdgc",
    "shotId": "shot-……",
    "provider": "mock-video",
    "status": "queued",
    "progress": 0,
    "createdAt": "2026-09-21T09:00:00.000Z",
    "updatedAt": "2026-09-21T09:00:00.000Z"
  }
}
```

**错误示例（404）**

```json
{ "error": "项目或镜头不存在" }
```

### 5.2 `GET /api/video/jobs/:id` —— 查询任务状态

轮询任务状态：`queued → processing → complete | failed`。

**路径参数**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 任务 id |
| `projectId` | string | 任务所属项目 id；用于校验当前用户对任务的访问权限 |

**请求示例**

```bash
curl 'http://localhost:3000/api/video/jobs/cmub5g3mk0007uqk0nsg2vdgc?projectId=cmub5fwnx0001uqk0xksi7row'
```

```javascript
async function waitForJob(jobId, projectId) {
  while (true) {
    const { job } = await (await fetch(`/api/video/jobs/${jobId}?projectId=${encodeURIComponent(projectId)}`)).json();
    if (job.status === "complete" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}
```

**响应示例（200，进行中）**

```json
{ "job": { "id": "……", "status": "processing", "progress": 50, "outputUrl": null } }
```

**响应示例（200，完成）**

```json
{ "job": { "id": "……", "status": "complete", "progress": 100, "outputUrl": "/demo/shot-preview.mp4" } }
```

**错误示例（404）**

```json
{ "error": "任务不存在" }
```

---

## 6. 模型接入（预留）

所有「需要模型」的能力都已抽象为 Provider，默认使用**本地无模型实现**保证可运行；配置对应环境变量后自动切换为真实模型，失败自动回退本地。环境变量见 `.env.example`。

### 6.1 文本模型（OpenAI 兼容 Chat Completions）

| 环境变量 | 说明 |
| --- | --- |
| `LLM_API_URL` | OpenAI 兼容接口地址，例如 `https://api.openai.com` |
| `LLM_API_KEY` | API Key |
| `LLM_MODEL` | 模型名，缺省 `gpt-4o-mini` |

生效范围：剧本生成（`/api/generate`）、作家风格蒸馏（`/api/styles/distill`）。请求协议为 `POST {LLM_API_URL}/chat/completions`，消息体 `{ model, messages, temperature }`。

### 6.2 视频生成 Provider

| Provider | 环境变量 | 说明 |
| --- | --- | --- |
| `mock-video` | 无 | 默认，返回演示视频地址，不调用真实模型 |
| `runway` | `RUNWAY_API_KEY`、`RUNWAY_API_URL`（可选） | Runway 图生视频（预留） |
| `kling` | `KLING_API_KEY`、`KLING_API_URL`（可选） | 可灵 Kling 图生视频（预留） |
| `seedance` | `SEEDANCE_API_KEY`、`SEEDANCE_API_URL`（可选）、`SEEDANCE_MODEL` | 字节 Seedance 视频生成（预留） |

> 预留 Provider 的端点与请求体以各家官方文档为准，代码已给出骨架与状态映射；未配置 Key 时提交会返回失败任务并记录错误。

### 6.3 PenShot 分镜服务（可选）

| 环境变量 | 说明 |
| --- | --- |
| `PENSHOT_API_URL` | PenShot 服务地址，例如 `http://localhost:8000` |

配置后 `/api/generate` 的「剧本 → 分镜」段会调用 PenShot 的 REST API，未配置时使用本地 fallback。

---

## 7. 认证与账号

认证采用 httpOnly Cookie 会话（`inkframe_session`，HMAC 签名，7 天有效）。除登录/注册外，其余接口均需登录；未登录返回 `401`。

### 7.1 `POST /api/auth/register` —— 注册

首个注册账号自动成为**管理员**（用于引导后台），后续账号为普通用户。

**请求体**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `email` | string | 是 | 邮箱（格式校验） |
| `name` | string | 是 | 昵称，至少 2 字 |
| `password` | string | 是 | 密码，至少 6 位 |

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","name":"管理员","password":"123456"}'
```

```javascript
await fetch("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, name, password }),
});
```

**响应（200）**

```json
{ "user": { "id": "…", "email": "admin@example.com", "name": "管理员", "role": "ADMIN" } }
```

**错误**：`400` 参数不合法；`409` 邮箱已注册。

### 7.2 `POST /api/auth/login` —— 登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"123456"}'
```

**响应（200）**：同注册，返回 `{ user }` 并写入会话 Cookie。
**错误**：`401` 邮箱或密码错误；`403` 账号被禁用。

### 7.3 `POST /api/auth/logout` —— 退出登录

```javascript
await fetch("/api/auth/logout", { method: "POST" });
```

**响应（200）**：`{ "ok": true }`，清除会话 Cookie。

### 7.4 `GET /api/auth/me` —— 当前用户

```bash
curl http://localhost:3000/api/auth/me
```

**响应**：已登录返回 `{ "user": { "id","email","name","role" } }`；未登录返回 `{ "user": null }`。

---

## 8. 后台管理（管理员）

以下接口均要求登录且角色为 `ADMIN`，否则 `401` / `403`。

### 8.1 `GET /api/admin/users` —— 用户列表

```bash
curl http://localhost:3000/api/admin/users
```

**响应（200）**

```json
{ "users": [ { "id":"…", "email":"…", "name":"…", "role":"USER", "status":"active", "projectCount":2, "createdAt":"…" } ] }
```

### 8.2 `PATCH /api/admin/users/:id` —— 修改角色 / 状态

```javascript
await fetch("/api/admin/users/<id>", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "ADMIN", status: "active" }),
});
```

**说明**：`role` 取值 `USER | ADMIN`；`status` 取值 `active | disabled`。为防止锁死系统，不能降级/禁用/删除自己。

### 8.3 `DELETE /api/admin/users/:id` —— 删除用户

```javascript
await fetch("/api/admin/users/<id>", { method: "DELETE" });
```

**响应（200）**：`{ "ok": true }`。删除用户后其项目保留（归属置空，仅管理员可见）。

### 8.4 `GET /api/admin/settings` / `PUT /api/admin/settings` —— 模型 API 配置

管理员配置文本模型、PenShot、视频 Provider 的接口。运行时解析顺序：DB 配置 > 环境变量 > 本地回退。

```bash
# 读取（密钥脱敏）
curl http://localhost:3000/api/admin/settings

# 保存
curl -X PUT http://localhost:3000/api/admin/settings \
  -H "Content-Type: application/json" \
  -d '{"LLM_API_URL":"https://api.example.com","LLM_API_KEY":"sk-xxx","LLM_MODEL":"gpt-4o-mini"}'
```

**GET 响应（200）**

```json
{ "settings": [ { "key":"LLM_API_KEY", "label":"文本模型 API Key", "group":"text", "isSecret":true, "value":"sk-t••••••7890", "configured":true, "source":"db" } ], "encryptionEnabled": false }
```

**PUT 响应（200）**：`{ "ok": true, "warning": "未设置 SETTINGS_ENCRYPTION_KEY，密钥将以明文存储", "settings": […], "encryptionEnabled": false }`

### 8.5 `POST /api/admin/settings/test` —— 测试文本模型连通性

```javascript
const r = await fetch("/api/admin/settings/test", { method: "POST" });
// -> { "ok": true, "message": "连通成功", "reply": "正常" }  或  { "ok": false, "error": "…" }
```

### 8.6 `GET /api/admin/stats` —— 后台仪表盘统计

```bash
curl http://localhost:3000/api/admin/stats
```

**响应（200）**

```json
{ "stats": { "users": 2, "activeUsers": 2, "projects": 0, "projects7d": 0, "scenes": 0, "shots": 0, "jobs": 0, "jobStatus": {} } }
```

### 8.7 `GET /api/admin/audit` —— 操作审计日志

```bash
curl "http://localhost:3000/api/admin/audit?limit=100"
```

**响应（200）**

```json
{ "logs": [ { "id":"…", "actorName":"Admin", "action":"settings.save", "targetType":"system", "targetId":null, "detail":"更新 1 项配置", "createdAt":"…" } ] }
```

---

## 9. 健康检查

### 9.1 `GET /api/health` —— 服务与数据库健康

```bash
curl http://localhost:3000/api/health
```

**响应（200）**：`{ "ok": true, "service": "inkframe-studio", "db": "up", "time": "…" }`；数据库不可用时返回 `503 { "ok": false, "db": "down" }`。
