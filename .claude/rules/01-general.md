# 通用开发规范

## 技术栈
- 运行环境：Bun.sh (v1.3.6+)
- 语言：TypeScript（严格模式）
- 包管理：bun

## 绝对红线（零容忍，Code Review 直接打回）

- **禁止 `any`**。不确定类型使用 `unknown`，边界处必须显式 interface 包裹
- **禁止 `as` 强制断言**。数据解析必须用 Zod 做运行时校验，再通过 `z.infer<>` 推导类型
- **禁止裸 `console.log`**。后端必须使用 Pino logger，前端调试完毕后删除日志代码
- **函数位置参数 ≥ 4 个**。3 个参数需重构为 Options Object；≥ 4 个直接打回

## 代码规范

### 行数限制

| 维度 | 黄金标准 | 可接受 | 红线（必须拆分） |
|------|----------|--------|----------------|
| 业务函数逻辑行（不含注释/空行） | ≤ 20 行 | ≤ 35 行 | > 50 行 |
| React 组件文件（含 import/JSX） | ≤ 100 行 | ≤ 150 行 | > 150 行 |

### 类型系统

- 公共导出函数和组件必须显式声明返回类型
- 内部私有函数可依赖 TypeScript 推断，但建议显式
- 接口命名：
  - 前端 Props/Hook 返回：`PascalCase`，语义后缀。如 `UserCardProps`、`UseAuthReturn`
  - 后端 DTO：`PascalCase` + `Command`/`Query`/`Dto`。如 `CreateOrderCommand`、`GetUserQuery`
- 禁止内联 Props 类型（如 `({ name }: { name: string })`），必须提取为具名 interface

### 通用约束

- 优先使用 `const` 和 `let`，禁止 `var`
- 命名规范：
  - 变量/函数：camelCase
  - 常量：UPPER_SNAKE_CASE
  - 类型/接口：PascalCase
  - 文件名：kebab-case

## 项目结构
- 遵循 Bulletproof React 目录组织
- 功能驱动开发，每个功能同时完成前后端

## 禁止事项
- 禁止创建任何文档
- 禁止硬编码敏感信息
- 禁止提交包含密钥的配置文件

## 复用哲学
1. YAGNI (You Aren't Gonna Need It) - 不要为了"可能"复用而抽象
2. 三次法则 - 同一段代码出现第三次时，才考虑抽象
3. 拆分优先于复用 - 先让代码可维护，复用是副产品
4. 渐进式抽象 - 从具体的业务组件开始，发现模式后再提取公共组件
