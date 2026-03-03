# Docker 镜像构建指南

本项目使用 GitHub Actions 自动构建和推送 Docker 镜像到多个镜像仓库。

## 触发条件

以下情况会自动触发镜像构建：

- **Push 到 main/master 分支**: 构建并推送 `latest` 标签
- **Push 版本标签 (v\*)**: 构建并推送版本标签，如 `v1.0.0`, `v1.0`, `v1`
- **Pull Request**: 仅构建不推送（用于验证）

## 支持的镜像仓库

构建的镜像会推送到以下仓库：

1. **Docker Hub**: `xartifact/x-llm-gateway`
2. **GitHub Container Registry (GHCR)**: `ghcr.io/xartifact/x-llm-gateway`

## 配置步骤

### 1. 配置 Docker Hub（可选）

如果你希望推送到 Docker Hub，需要在 GitHub 仓库设置中添加以下 Secrets：

1. 前往仓库 Settings → Secrets and variables → Actions
2. 添加以下 Secrets：
   - `DOCKERHUB_USERNAME`: 你的 Docker Hub 用户名
   - `DOCKERHUB_TOKEN`: Docker Hub Access Token（推荐）或密码

**创建 Docker Hub Access Token**：

1. 登录 [Docker Hub](https://hub.docker.com)
2. Account Settings → Security → New Access Token
3. 生成 Token 并复制到 GitHub Secrets

### 2. GitHub Container Registry（默认）

GitHub Container Registry 无需额外配置，使用自动提供的 `GITHUB_TOKEN` 即可。

## 镜像标签规则

| 触发事件            | 生成的标签                                 |
| ------------------- | ------------------------------------------ |
| Push 到 main/master | `latest`, `main` 或 `master`, `sha-xxxxxx` |
| Push tag v1.0.0     | `1.0.0`, `1.0`, `1`, `latest`              |
| Pull Request        | `pr-123`                                   |

## 支持的架构

- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64, 如 Apple Silicon, AWS Graviton)

## 使用镜像

### 从 Docker Hub 拉取

```bash
docker pull xartifact/x-llm-gateway:latest
```

### 从 GitHub Container Registry 拉取

```bash
docker pull ghcr.io/xartifact/x-llm-gateway:latest
```

### 使用 docker-compose

```yaml
services:
  gateway:
    image: ghcr.io/xartifact/x-llm-gateway:latest
    env_file:
      - .env.local
    ports:
      - "3000:3000"
```

## 本地构建

如果你想在本地构建镜像：

```bash
# 构建镜像
docker build -t x-llm-gateway:latest .

# 运行容器
docker run -d \
  --name x-llm-gateway \
  --env-file .env.local \
  -p 3000:3000 \
  x-llm-gateway:latest
```

## 故障排查

### 构建失败

1. 检查 Dockerfile 是否存在语法错误
2. 查看 Actions 日志中的详细错误信息
3. 确保所有依赖文件已提交到仓库

### 推送失败

1. 检查 Secrets 是否正确配置
2. 确保 Token 未过期
3. 确认仓库权限设置正确

## 参考文档

- [GitHub Actions 文档](https://docs.github.com/cn/actions)
- [Docker Buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
- [Docker Hub 文档](https://docs.docker.com/docker-hub/)
