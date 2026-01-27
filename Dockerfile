FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
COPY apps/backend/package.json /temp/prod/apps/backend/
COPY apps/web/package.json /temp/prod/apps/web/
COPY packages/shared/package.json /temp/prod/packages/shared/
COPY packages/database/package.json /temp/prod/packages/database/
COPY packages/config/package.json /temp/prod/packages/config/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build
FROM base AS build
COPY --from=install /temp/prod/node_modules node_modules
COPY . .
RUN bun run build

# Production
FROM oven/bun:1-slim AS release
WORKDIR /app

# Copy built application
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

# Copy migrations
COPY --from=build /app/packages/database/src/migrations ./packages/database/src/migrations

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
