# 快速启动指南

## 方式一：使用 Docker Compose（推荐）

最简单的方式，自动启动 PostgreSQL 和应用：

\`\`\`bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 启动所有服务（PostgreSQL + 应用）
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
\`\`\`

数据库会自动初始化，无需手动操作！

## 方式二：本地开发

### 1. 启动 PostgreSQL

使用 Docker 只启动数据库：

\`\`\`bash
# 启动 PostgreSQL
docker-compose up -d postgres

# 查看数据库日志
docker-compose logs -f postgres
\`\`\`

或者使用本地 PostgreSQL：

\`\`\`bash
# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql
\`\`\`

### 2. 配置环境变量

\`\`\`bash
# 复制模板
cp .env.example .env

# 编辑配置（如果需要）
vim .env
\`\`\`

### 3. 安装依赖

\`\`\`bash
bun install
\`\`\`

### 4. 启动开发服务器

\`\`\`bash
# 启动 Next.js 开发服务器
bun dev
\`\`\`

**数据库会在应用启动时自动初始化！**

你会看到类似的日志：

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

### 5. 访问应用

- **管理后台**: http://localhost:3000/admin/login
- **API 文档**: http://localhost:3000/api

默认管理员密码：`change-me-in-production`（在 `.env` 中修改）

## 验证数据库

连接到数据库查看表：

\`\`\`bash
# 使用 Docker
docker-compose exec postgres psql -U postgres -d llm_gateway

# 或使用本地 psql
psql -h localhost -U postgres -d llm_gateway

# 查看所有表
\dt

# 查看 providers 表结构
\d providers
\`\`\`

## 常见问题

### 问题：端口被占用

**错误**: `Error: listen EADDRINUSE: address already in use :::3000`

**解决**:
\`\`\`bash
# 修改 .env 中的端口
PORT=3001
\`\`\`

### 问题：数据库连接失败

**错误**: `FATAL: database "llm_gateway" does not exist`

**解决**:
1. 确保 PostgreSQL 正在运行
2. 检查 `.env` 中的数据库配置
3. 应用会自动创建数据库，等待几秒钟

### 问题：权限不足

**错误**: `permission denied to create database`

**解决**:
\`\`\`sql
-- 连接到 postgres 数据库
psql -U postgres

-- 授予创建数据库权限
ALTER USER postgres CREATEDB;
\`\`\`

## 开发工具

### 查看数据库

推荐使用以下工具：

- **pgAdmin**: https://www.pgadmin.org/
- **DBeaver**: https://dbeaver.io/
- **TablePlus**: https://tableplus.com/
- **VS Code 插件**: PostgreSQL (by Chris Kolkman)

### 重置数据库

如果需要重新开始：

\`\`\`bash
# 停止服务
docker-compose down

# 删除数据卷
docker volume rm x-llm-gateway_postgres_data

# 重新启动
docker-compose up -d
\`\`\`

## 下一步

- 📖 阅读 [数据库初始化文档](./packages/database/DATABASE-INIT.md)
- 🔧 查看 [开发路线图](./docs/DEVELOPMENT-ROADMAP.md)
- 📝 了解 [API 文档](./docs/API.md)

## 使用外部数据库

如果你不想使用 Docker Compose 内置的 PostgreSQL，可以配置外部数据库：

### 1. 复制示例配置文件

```bash
# 复制外部数据库配置模板
cp .env.external.example .env.local
```

### 2. 编辑数据库配置

修改 `.env.local` 中的数据库连接信息：

```env
# External Database Configuration
DB_HOST=your-db-host.com      # 外部数据库主机
DB_PORT=5432                   # 端口
DB_NAME=llm_gateway           # 数据库名
DB_USER=your_db_user          # 用户名
DB_PASSWORD=your_secure_password  # 密码
DB_SSL=true                   # 生产环境建议启用 SSL
```

### 3. 启动应用（不含 PostgreSQL）

```bash
# 使用外部数据库配置启动
docker-compose -f docker-compose.external-db.yml up -d

# 查看日志
docker-compose -f docker-compose.external-db.yml logs -f
```

### 文件说明

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 默认配置，包含 PostgreSQL + 应用 |
| `docker-compose.external-db.yml` | 外部数据库配置，只启动应用 |
| `.env.local` | 本地开发环境变量（默认使用内置数据库） |
| `.env.external.example` | 外部数据库配置模板 |

