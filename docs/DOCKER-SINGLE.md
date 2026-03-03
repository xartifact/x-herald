# 单 Docker 镜像部署指南

使用预构建的 Docker 镜像快速部署 x-llm-gateway。

## 快速开始

### 1. 准备数据库

本镜像不包含 PostgreSQL，你需要自行准备数据库。

**使用 Docker 启动 PostgreSQL（可选）:**

```bash
docker run -d \
  --name postgres \
  -e POSTGRES_DB=llm_gateway \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

**或使用现有数据库**，确保数据库已创建并可访问。

### 2. 创建环境变量文件

创建 `.env` 文件：

```bash
cat > .env << 'EOF'
# 服务器配置
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# 数据库配置（修改为你的数据库信息）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_gateway
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# 管理员密码
ADMIN_PASSWORD=admin
EOF
```

### 3. 启动应用

```bash
docker run -d \
  --name x-llm-gateway \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/xartifact/x-llm-gateway:latest
```

### 4. 验证部署

```bash
# 查看日志
docker logs -f x-llm-gateway

# 健康检查
curl http://localhost:3000/api/health
```

## 常用命令

### 更新到最新版本

```bash
# 拉取最新镜像
docker pull ghcr.io/xartifact/x-llm-gateway:latest

# 停止并删除旧容器
docker stop x-llm-gateway
docker rm x-llm-gateway

# 启动新容器
docker run -d \
  --name x-llm-gateway \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/xartifact/x-llm-gateway:latest
```

### 查看日志

```bash
# 实时日志
docker logs -f x-llm-gateway

# 最近 100 行
docker logs --tail 100 x-llm-gateway
```

### 停止和删除

```bash
# 停止
docker stop x-llm-gateway

# 删除容器
docker rm x-llm-gateway

# 删除镜像
docker rmi ghcr.io/xartifact/x-llm-gateway:latest
```

## 使用 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: x-llm-gateway-postgres
    environment:
      POSTGRES_DB: llm_gateway
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  gateway:
    image: ghcr.io/xartifact/x-llm-gateway:latest
    container_name: x-llm-gateway
    environment:
      NODE_ENV: production
      PORT: 3000
      HOST: 0.0.0.0
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: llm_gateway
      DB_USER: postgres
      DB_PASSWORD: postgres
      DB_SSL: "false"
      ADMIN_PASSWORD: admin
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
```

启动：

```bash
docker-compose up -d
```

## 环境变量说明

| 变量             | 必填 | 默认值     | 说明           |
| ---------------- | ---- | ---------- | -------------- |
| `DB_HOST`        | 是   | -          | 数据库主机地址 |
| `DB_PORT`        | 否   | 5432       | 数据库端口     |
| `DB_NAME`        | 是   | -          | 数据库名称     |
| `DB_USER`        | 是   | -          | 数据库用户名   |
| `DB_PASSWORD`    | 是   | -          | 数据库密码     |
| `DB_SSL`         | 否   | false      | 是否启用 SSL   |
| `ADMIN_PASSWORD` | 是   | -          | 管理员登录密码 |
| `PORT`           | 否   | 3000       | 应用端口       |
| `HOST`           | 否   | 0.0.0.0    | 监听地址       |
| `NODE_ENV`       | 否   | production | 运行环境       |

## 完整部署示例

### 使用外部数据库

```bash
# 1. 准备环境变量文件
cat > .env << 'EOF'
DB_HOST=your-db-host.amazonaws.com
DB_PORT=5432
DB_NAME=llm_gateway
DB_USER=dbuser
DB_PASSWORD=your-strong-password
DB_SSL=true
ADMIN_PASSWORD=your-admin-password
EOF

# 2. 启动应用
docker run -d \
  --name x-llm-gateway \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/xartifact/x-llm-gateway:latest

# 3. 查看日志确认启动成功
docker logs -f x-llm-gateway
```

### 使用特定版本

```bash
# 使用 v1.0.0 版本
docker run -d \
  --name x-llm-gateway \
  --env-file .env \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/xartifact/x-llm-gateway:v1.0.0
```

## 访问应用

启动成功后访问：

- **管理后台**: http://localhost:3000/admin/login
- **API 接口**: http://localhost:3000/api
- **健康检查**: http://localhost:3000/api/health

默认管理员账号密码：`admin` / `.env` 中设置的 `ADMIN_PASSWORD`
