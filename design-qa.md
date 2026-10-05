# Design QA

## Scope

- 营销首页与产品介绍流程
- 活动 Banner 与活动管理
- 后台模型渠道、模型价格和用量统计

## Automated verification

- `npx tsc --noEmit`：通过
- `npm test -- --run`：19 个测试套件、54 个测试通过
- `npm run build`：通过
- `GET /`：HTTP 200
- `GET /api/health`：HTTP 200，数据库正常
- `GET /api/campaigns`：HTTP 200

## Browser verification

当前环境的浏览器连接不可用，因此暂未完成真实截图与交互检查；代码已通过生产构建和接口冒烟验证。
