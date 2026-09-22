FROM oven/bun:1 AS base
WORKDIR /app

# 版本信息在此固化：`runner` 阶段的 ENV 决定容器内 /api/health 与 WebUI 报告的
# version / commitHash / buildRef，因此三个变量都声明在 base，供 builder（注入
# SPA bundle）与 runner（运行网关）共用。此前 builder 用 `GIT_COMMIT_HASH`、CI
# 传 `GIT_HASH`，名字不一致导致 ARG 永远取默认值，生产版本号一直是 dev/unknown。
ARG APP_VERSION=dev
ARG GIT_COMMIT_HASH=unknown
ARG BUILD_REF=unknown
ENV APP_VERSION=${APP_VERSION}
ENV GIT_COMMIT_HASH=${GIT_COMMIT_HASH}
ENV BUILD_REF=${BUILD_REF}

# ---- 构建 ----
FROM base AS builder

COPY package.json bun.lock* bun.lockb* ./

COPY apps/web/package.json ./apps/web/
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/ai-agent/package.json ./packages/ai-agent/
COPY apps/cli/package.json ./apps/cli/

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && bun install --ignore-scripts

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:${PATH}"

RUN cd apps/web && bun run build

# ---- 生产运行 ----
FROM base AS runner

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/gateway/node_modules /app/apps/gateway/node_modules
COPY --from=builder /app/packages/db/node_modules /app/packages/db/node_modules
COPY --from=builder /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=builder /app/packages/ui/node_modules /app/packages/ui/node_modules
COPY --from=builder /app/packages/ai-agent/node_modules /app/packages/ai-agent/node_modules

COPY apps/gateway/src ./apps/gateway/src
COPY apps/gateway/middleware ./apps/gateway/middleware
COPY apps/gateway/services ./apps/gateway/services
COPY packages/db/package.json ./packages/db/
COPY packages/db/src ./packages/db/src
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src
COPY packages/ui/package.json ./packages/ui/
COPY packages/ui/src ./packages/ui/src
COPY packages/ai-agent/package.json ./packages/ai-agent/
COPY packages/ai-agent/src ./packages/ai-agent/src

COPY --from=builder /app/apps/web/dist ./apps/web/dist

COPY packages/db/migrations ./packages/db/migrations

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["bun", "apps/gateway/src/server.ts"]
