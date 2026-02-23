FROM oven/bun:1 AS base
WORKDIR /app

# ---- 安装依赖 ----
FROM base AS deps
COPY package.json bun.lock* bun.lockb* ./
COPY apps/web/package.json ./apps/web/
RUN bun install --frozen-lockfile

# ---- 构建 ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build:web

# ---- 生产运行 ----
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 输出（含最小 node_modules）
COPY --from=builder /app/apps/web/.next/standalone ./
# 静态资源（standalone 不自动包含）
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# 公共资源
COPY --from=builder /app/apps/web/public ./apps/web/public
# 迁移文件（复制到固定路径）
COPY --from=builder /app/apps/web/src/core/db/migrations /app/migrations

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_MIGRATIONS_FOLDER=/app/migrations

CMD ["bun", "apps/web/server.js"]
