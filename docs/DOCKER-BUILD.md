# Docker 镜像构建指南

本项目使用 GitHub Actions 自动构建和推送 Docker 镜像到 GitHub Container Registry (GHCR)。

## 触发条件

以下情况会自动触发镜像构建：

- **Push 到 main/master 分支**: 构建并推送 `latest` 标签
- **Push 到其他分支**: ci/docker, feat/**, fix/**
- **Push 版本标签 (v\*)**: 构建并推送版本标签，如 `v1.0.0`, `v1.0`, `v1`
- **Pull Request**: 仅构建不推送（用于验证）

## 镜像仓库

镜像推送到 **GitHub Container Registry**：

```
ghcr.io/xartifact/x-llm-gateway
```

无需额外配置，使用 GitHub 自动提供的 `GITHUB_TOKEN` 即可。

## 镜像标签规则

| 触发事件            | 生成的标签                     |
| ------------------- | ------------------------------ |
| Push 到 main/master | `latest`, `main`, `sha-xxxxxx` |
| Push tag v1.0.0     | `1.0.0`, `1.0`, `1`, `latest`  |
| Push 到 feat/xxx    | `feat-xxx`                     |
| Pull Request        | `pr-123`                       |

## 支持的架构

- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64, 如 Apple Silicon, AWS Graviton)

## 使用镜像

### 拉取镜像

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

### 指定版本

```bash
# 使用特定版本
docker pull ghcr.io/xartifact/x-llm-gateway:v1.0.0

# 使用分支版本
docker pull ghcr.io/xartifact/x-llm-gateway:ci-docker
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

### 拉取镜像失败（401 Unauthorized）

GitHub Container Registry 需要登录：

```bash
# 使用 GitHub Token 登录
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

或者配置 docker-compose：

```yaml
services:
  gateway:
    image: ghcr.io/xartifact/x-llm-gateway:latest
    pull_policy: always
```

## 参考文档

- [GitHub Actions 文档](https://docs.github.com/cn/actions)
- [GitHub Container Registry](https://docs.github.com/cn/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
