# InkFrame Studio

「作家风格 → 短剧生成」工作流网站的可运行实现。文本、分镜、异步镜头任务和成片合成都通过可替换边界组织，默认配置可在本地联调。

- 接口文档：见 [`docs/API.md`](docs/API.md)（按功能分组，含使用规范与代码示例）
- 环境变量：见 [`.env.example`](.env.example)
- 设计规范：见 [`docs/设计规范.md`](docs/设计规范.md)（统一 UI 令牌与组件约定）
- 认证与权限：登录 / 注册 / 会话 / 角色（ADMIN · USER）/ 后台管理
- 商业化迭代方案：见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（总架构师方案 + 开发/测试协作闭环）

## 已实现

- Next.js App Router + TypeScript + Tailwind 基础骨架
- 四阶段工作台：创作简报、风格卡、风格化剧本、分镜提示词
- `WriterStyle` / `DirectorStyle` / `GeneratedProject` / `Shot` 类型模型
- 作家风格卡：鲁迅、张爱玲、王小波
- 导演视觉卡：王家卫、新海诚、诺兰；包含 palette、descriptor、LoRA 标识
- `POST /api/generate`：根据主题与两张风格卡生成可回看的剧本、3 场景、6 个分镜提示词
- `POST /api/styles/distill`：上传 `.txt` 样本文章，输出 9 轴 `WriterStyle` 风格卡
- `GET /api/styles` / `POST /api/styles`：读取数据库风格库、保存用户自定义作家/导演风格卡
- `GET /api/projects` / `GET /api/projects/:id`：项目回看接口
- `POST /api/video/jobs` / `GET /api/video/jobs/:id`：异步视频 Job 与 Provider 状态接口
- `POST /api/projects/:id/render`：按镜头顺序下载完成素材并使用 ffmpeg 合成最终短剧，结果写回 `Project.finalVideoUrl`
- `lib/pipeline.ts` 拆分为四个可观测节点：风格蒸馏 → 剧本生成 → 剧本解析 → 分镜生成；`runPipeline` 返回逐阶段 `trace`
- `lib/store.ts` 已迁移为 SQLite + Prisma 持久化：`saveProject` / `getProject` / `listProjects` / `saveWriterStyle` 落库，API 进程重启后数据保留
- 视频任务持久化：新增 `VideoJob` 数据模型，`lib/jobs.ts` 落库
- 异步视频 worker（`lib/worker.ts`）：POST 非阻塞返回 202，后台 worker 驱动 `queued → processing → complete | failed`，并同步更新 `Shot.status` 状态机
- 队列适配：配置 `REDIS_URL` 时使用 BullMQ/Redis，未配置时使用同一套处理器的单进程 fallback，便于本地开发
- 模型接口全部预留（`lib/ai/` + `lib/video.ts`）：文本模型（OpenAI 兼容）、视频 Provider（Runway / 可灵 / Seedance）、PenShot 均以 Provider 抽象隔离，默认走本地无模型实现，配置环境变量后自动切换
- 成片合成：`ffmpeg-static` 提供跨平台本地 ffmpeg，只有所有镜头均有完成素材地址时才允许合成
- LLM 用量：保存 Chat Completions 实际 token 用量；供应商未返回 usage 时保留估算标记。后台可按模型配置输入/输出 USD 每百万 token 单价，以微美元精度记录估算费用
- 前端已接入后端：侧栏「我的项目」加载真实项目并可回看、剧本页展示四阶段 `trace`、分镜页展示镜头状态并轮询视频任务进度
- 本地 localStorage 持久化最近一次生成结果
- 角色一致性提示、正向 prompt、负向 prompt 的数据字段已预留
- `prisma/schema.prisma`：WriterStyle、DirectorStyle、Project、Script、Scene、Shot、VideoJob 数据模型（已落库）

- 用户体系：`User` 数据模型 + 注册 / 登录 / 退出 / 当前用户接口（HMAC 签名会话 Cookie，密码 scrypt 哈希）
- 权限控制：角色 RBAC（`USER` / `ADMIN`），项目按用户归属隔离，受保护接口统一鉴权
- 后台管理：`/admin` 用户管理页 + `/api/admin/*` 接口（改角色、禁用、删除；首个注册账号自动成为管理员）
- 后台模型配置：`/admin/settings` 页面 + `SystemSetting` 表（密钥 AES-256-GCM 加密/脱敏 + 连通性测试），运行时按 DB 配置 > 环境变量 > 本地回退解析
- 支付与余额：`/account` 个人中心支持 Mock / 支付宝扫码 / 微信 Native 扫码充值；支付订单、异步回调、回调验签、幂等入账和钱包流水均持久化到 `PaymentOrder` / `WalletTransaction`
- 后台支付配置：`/admin/settings/payments` 可维护支付渠道、余额强制扣款、支付宝 RSA2 和微信支付 V3 所需参数；真实回调地址必须是公网 HTTPS
- 后台仪表盘：`/api/admin/stats` 统计 + `/admin` 统计卡片
- 操作审计日志：`AuditLog` 模型 + `/admin/audit` 页面 + `/api/admin/audit`（记录配置修改/用户变更/项目创建）
- 健康检查：`/api/health`
- 安全加固：接口限流（登录/注册/生成，429+Retry-After）、同源校验、安全响应头（nosniff / X-Frame-Options / Referrer-Policy）、SameSite=Lax 会话 Cookie
- 单测基线：Vitest + `lib/__tests__`（security / rate-limit / pipeline 共 9 用例），`npm test` 一键回归
- 集成测试：store / settings 用独立 SQLite 测试库断言（持久化 / 归属隔离 / 越权 / 密钥脱敏 / DB>env）
- E2E：Playwright 覆盖「注册→生成→回看→后台」浏览器主链路

## 本地部署

```bash
npm install
npx prisma generate
npx prisma db push
```

开发模式：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

E2E（浏览器主链路，需先构建并下载 Playwright 浏览器）：

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

生产部署（构建后启动）：

```bash
npm run build
npm run start
```

打开 `http://localhost:3000`。

### 支付配置

本地测试时在后台选择 `Mock`，进入个人中心点击「充值」，创建订单后点击「模拟支付完成」即可验证余额入账和钱包流水。生产环境建议先设置 `SETTINGS_ENCRYPTION_KEY`，再在 `/admin/settings/payments` 填写：

- 支付宝：App ID、RSA2 应用私钥、支付宝公钥、异步通知地址 `https://你的域名/api/payments/callback/alipay`
- 微信支付：App ID、商户号、证书序列号、商户私钥、API v3 密钥、微信支付平台证书、回调地址 `https://你的域名/api/payments/callback/wechat`

将 `PAYMENT_PROVIDER` 设置为 `alipay` 或 `wechat` 后，个人中心会生成对应的扫码订单；支付平台异步通知成功验签后才会给用户余额入账。`BILLING_ENFORCE_BALANCE=true` 时，已配置价格的模型会在用量记录时扣除余额；默认 `false` 只记录成本，便于开发联调。

Docker 部署：

```bash
docker compose up --build -d
```

（SQLite 数据通过 `inkframe-data` 卷持久化，见 `docker-compose.yml`）

> 需要模型的接口默认无需任何 Key 即可运行（本地确定性实现）；如需接入真实模型，复制 `.env.example` 为 `.env` 并填写对应变量，详见 [docs/API.md §6](docs/API.md#6-模型接入预留)。

### PenShot 接入（可选）

```powershell
$env:PENSHOT_API_URL = "http://localhost:8000"
npm.cmd run dev
```

PenShot 官方提供 Docker、Python SDK 与 REST API；本项目不复制其源码，保持一层薄适配，方便升级上游版本。

## 后续接入点

- 生产环境继续补充 Redis 高可用、队列监控和失败重试策略
- 结构化日志与日志轮转、SQLite 定期备份
- 提升测试覆盖：补充 API 集成测试与 E2E，向 ≥70% 覆盖演进
- 预留的视频 Provider 端点/请求体以各家官方文档为准，接入前需核对最新协议
