FROM oven/bun:1 AS base
WORKDIR /app

# ---- 构建 ----
FROM base AS builder

ARG GIT_HASH=unknown
ENV GIT_HASH=${GIT_HASH}

# 复制所有 package.json 文件（workspace 需要全部 package.json 来解析依赖）
COPY package.json bun.lock* bun.lockb* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY packages/ui/package.json ./packages/ui/

# 安装所有依赖（包括 workspace）
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# 设置环境变量以支持构建
ENV NODE_ENV=production

# 构建应用
RUN cd apps/web && bun run build

# ---- 生产运行 ----
FROM oven/bun:1 AS runner
WORKDIR /app

# 安装 CA 证书（修复 TLS 证书验证问题）
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 输出（含最小 node_modules）
COPY --from=builder /app/apps/web/.next/standalone ./
# 静态资源（standalone 不自动包含）
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# 迁移文件（复制到固定路径）
COPY --from=builder /app/apps/web/src/core/db/migrations /app/migrations

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_MIGRATIONS_FOLDER=/app/migrations

CMD ["bun", "apps/web/server.js"]
