# Multi-stage Dockerfile for Vaultra API Container (Spec §8.1, §9.1, §9.3)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @vaultra/shared build && \
    pnpm --filter @vaultra/api exec prisma generate && \
    pnpm --filter @vaultra/api build

FROM node:22-alpine AS runner
RUN addgroup -S vaultra && adduser -S vaultra -G vaultra
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=build --chown=vaultra:vaultra /app/node_modules ./node_modules
COPY --from=build --chown=vaultra:vaultra /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=vaultra:vaultra /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=vaultra:vaultra /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=vaultra:vaultra /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=vaultra:vaultra /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=vaultra:vaultra /app/apps/api/prisma ./apps/api/prisma

RUN mkdir -p /app/apps/api/storage && chown -R vaultra:vaultra /app/apps/api/storage

USER vaultra
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/v1/health/live || exit 1

CMD ["node", "dist/main.js"]

