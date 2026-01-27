# 数据库自动初始化

## 功能特性

✅ **自动创建数据库** - 如果数据库不存在，自动创建
✅ **自动运行迁移** - 如果表不存在，自动运行迁移创建表
✅ **幂等性** - 多次运行不会出错，已存在则跳过
✅ **优雅的日志** - 清晰的初始化过程日志输出
✅ **零配置** - 应用启动时自动执行，无需手动操作

## 工作原理

当调用 `createDatabase()` 时，会自动执行以下步骤：

1. **检查数据库是否存在**
   - 连接到 `postgres` 默认数据库
   - 查询目标数据库是否存在
   - 如果不存在，创建数据库

2. **检查表是否存在**
   - 连接到目标数据库
   - 查询 `providers` 表是否存在
   - 如果不存在，运行迁移

3. **运行迁移（幂等）**
   - 使用 Drizzle 的迁移系统
   - 自动跟踪已运行的迁移
   - 只运行新的迁移

## 使用方法

### 1. 配置环境变量

创建 `.env` 文件：

\`\`\`bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_gateway
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
\`\`\`

### 2. 应用启动时自动初始化

在你的应用中调用 `createDatabase()`：

\`\`\`typescript
import { createDatabase } from '@x-llm-gateway/database';

const db = createDatabase({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'llm_gateway',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
});

// 数据库会在后台自动初始化
// 你可以立即使用 db 对象，初始化会异步完成
\`\`\`

### 3. 测试初始化功能

运行测试脚本：

\`\`\`bash
bun run packages/database/test-init.ts
\`\`\`

## 日志输出示例

### 首次运行（数据库不存在）

\`\`\`
🔍 检查数据库状态...
📦 数据库 "llm_gateway" 不存在，正在创建...
✅ 数据库 "llm_gateway" 创建成功
📋 数据表不存在，正在运行迁移...
🔄 开始运行数据库迁移...
✅ 数据库迁移完成
✅ 数据库初始化完成

🚀 数据库已就绪，应用可以正常运行
\`\`\`

### 再次运行（数据库已存在）

\`\`\`
🔍 检查数据库状态...
✅ 数据库 "llm_gateway" 已存在
✅ 数据表已存在，检查是否有新迁移...
🔄 开始运行数据库迁移...
ℹ️  没有新的迁移需要运行
✅ 数据库初始化完成

🚀 数据库已就绪，应用可以正常运行
\`\`\`

## 迁移管理

### 迁移文件位置

\`\`\`
packages/database/src/migrations/
├── 0000_initial_schema.sql    # 初始 schema
├── 0001_xxx.sql               # 后续迁移
└── meta/
    ├── _journal.json          # 迁移记录
    └── 0000_snapshot.json     # Schema 快照
\`\`\`

### 添加新迁移

1. 修改 `packages/database/src/schema/` 中的 schema 定义
2. 运行 Drizzle Kit 生成迁移：
   \`\`\`bash
   cd packages/database
   bun run drizzle-kit generate:pg
   \`\`\`
3. 重启应用，新迁移会自动运行

## 故障排查

### 问题：数据库连接失败

**错误**: `FATAL: database "llm_gateway" does not exist`

**解决**:
- 确保 PostgreSQL 服务正在运行
- 检查 `.env` 文件中的数据库配置
- 确保 PostgreSQL 用户有创建数据库的权限

### 问题：权限不足

**错误**: `permission denied to create database`

**解决**:
\`\`\`sql
-- 授予用户创建数据库的权限
ALTER USER postgres CREATEDB;
\`\`\`

### 问题：迁移失败

**错误**: `Migration failed`

**解决**:
1. 检查迁移 SQL 文件语法
2. 手动连接数据库查看错误详情
3. 如果需要，手动回滚：
   \`\`\`sql
   DROP TABLE IF EXISTS providers;
   \`\`\`

## 手动操作（可选）

如果你想手动创建数据库和表：

\`\`\`bash
# 1. 创建数据库
createdb -h localhost -U postgres llm_gateway

# 2. 运行迁移
cd packages/database
bun run drizzle-kit push:pg
\`\`\`

## 技术细节

- **数据库驱动**: `postgres` (postgres.js)
- **ORM**: Drizzle ORM
- **迁移工具**: Drizzle Kit
- **连接池**: 最大 10 个连接
- **超时设置**: 连接超时 10 秒，空闲超时 20 秒

## 注意事项

⚠️ **生产环境建议**:
- 使用专用的数据库用户（不要使用 postgres 超级用户）
- 启用 SSL 连接
- 定期备份数据库
- 监控数据库性能和连接数

⚠️ **开发环境**:
- 可以使用 Docker 快速启动 PostgreSQL
- 建议使用 `.env.local` 存储本地配置
- 不要将 `.env` 文件提交到 Git
