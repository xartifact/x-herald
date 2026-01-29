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
- 数据库：SQLite (libsql)
- 所有数据库操作使用类型安全的查询

## 架构原则
- 遵循 Clean Architecture
- 业务逻辑与框架解耦
- 使用中间件处理横切关注点（认证、日志、错误处理）
