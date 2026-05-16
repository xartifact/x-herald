# 后端开发规范

## 技术栈
- 框架：Hono (v4.11.6)
- 运行环境：Bun.sh
- 集成：Hono 接管 Next.js API 路由

## API 规范
- 遵循 RESTful API 设计规范
- 路由组织按功能模块划分
- 统一错误处理和响应格式

## 数据库
- ORM：Drizzle ORM
- 数据库：PostgreSQL / PGlite
- 所有数据库操作使用类型安全的查询

## Handler 规范

- **Handler 函数体不超过 25 行**（提取参数 + 委托 Service + 返回响应）
- 超过 25 行说明在 Handler 内写了业务逻辑，必须拆分到 Service 层
- Handler 只做三件事：① 解析并校验请求 → ② 调用 Service → ③ 返回响应

```typescript
// ✅ Handler 标准结构
app.post('/orders', async (c): Promise<Response> => {
  const body = CreateOrderBody.parse(await c.req.json()); // ① 校验（Zod）
  const userId = c.get('userId');
  const order = await orderService.create({ userId, ...body }); // ② 委托
  return c.json({ success: true, data: order }, 201); // ③ 响应
});
```

## 分层隔离

- **Service 层严禁引入 `hono` 或 `Context` 类型**。Service 函数只接收 DTO，返回 DTO
- 数据库客户端（db）通过函数参数或 DI 传入 Service，不通过 Context 泄漏
- 禁止将 Hono Context 作为参数传递给任何 Service 函数

## 中间件规范

- **中间件逻辑不超过 20 行**。复杂鉴权逻辑必须委托给 AuthService
- 中间件只处理横切关注点：Auth、CORS、RequestId、全局错误捕获、日志
- 禁止在业务路由中间件中执行同步数据库写入

## 错误处理

- 使用 `app.onError` 全局捕获，禁止在 Handler 中即兴拼装错误 JSON
- Service 层抛出领域错误（`DomainError` 子类）或 `HTTPException`
- **禁止返回 `null` / `undefined` 表示业务错误**（如"未找到"）——必须 throw 错误，由全局处理器转为对应 HTTP 状态码
- 客户端始终收到统一结构：`{ success: true, data }` 或 `{ success: false, error, code }`

## 日志

- **禁止裸 `console.log`**，统一使用 Pino logger
- 使用子 logger 标注模块：`const logger = rootLogger.child({ module: 'xxx' })`
- 未预期错误用 `logger.error({ err }, ...)`，业务警告用 `logger.warn`

## 环境变量

- **禁止在业务代码中直接使用 `process.env.XXX`**
- 所有环境变量必须在 `src/core/config/` 下统一读取、校验（使用 Zod）并导出

## 架构原则
- 遵循 Clean Architecture
- 业务逻辑与框架解耦
- 使用中间件处理横切关注点（认证、日志、错误处理）
