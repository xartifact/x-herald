FROM oven/bun:1 AS base
WORKDIR /app

# ---- 构建 ----
FROM base AS builder

ARG GIT_HASH=unknown
ENV GIT_HASH=${GIT_HASH}

# 复制 workspace 根配置
COPY package.json bun.lock* bun.lockb* ./

# 复制所有 workspace 包的 package.json（bun 需要全部来解析依赖）
COPY apps/tanstack/package.json ./apps/tanstack/
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY packages/ui/package.json ./packages/ui/

# 安装所有依赖（包括 workspace）
RUN bun install --registry=https://registry.npmjs.org

# 复制源代码
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# 构建 tanstack SPA（Vite → dist/）
RUN cd apps/tanstack && bun run build

# ---- 生产运行 ----
FROM oven/bun:1 AS runner
WORKDIR /app

# 安装 CA 证书（修复 TLS 证书验证问题）
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 复制 workspace 根配置（bun runtime 需要）
COPY package.json ./package.json
COPY packages/shared/package.json ./packages/shared/
COPY packages/engine/package.json ./packages/engine/
COPY packages/ui/package.json ./packages/ui/
COPY apps/tanstack/package.json ./apps/tanstack/

# 安装生产依赖
RUN bun install --production --no-save --registry=https://registry.npmjs.org

# 复制 engine 源码（Bun 直接运行 TS）
COPY packages/engine/src ./packages/engine/src
COPY packages/shared/src ./packages/shared/src
COPY packages/ui/src ./packages/ui/src

# 复制 tanstack SPA 构建产物
COPY --from=builder /app/apps/tanstack/dist ./apps/tanstack/dist

# 复制迁移文件
COPY packages/engine/src/db/migrations /app/migrations

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_MIGRATIONS_FOLDER=/app/migrations

CMD ["bun", "packages/engine/src/server.ts"]
