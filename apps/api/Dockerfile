# syntax=docker/dockerfile:1

# ══════════════════════════════════════
# Origineo API — Multi-stage Dockerfile
# ══════════════════════════════════════

# ─── Base ────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ─── Dependencies ────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

# ─── Development ─────────────────────
FROM deps AS development
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 3001
CMD ["pnpm", "run", "start:dev"]

# ─── Builder ─────────────────────────
FROM deps AS builder
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/apps/api
RUN npx prisma generate
RUN pnpm run build

# ─── Production ──────────────────────
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs
WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/node_modules ./node_modules

USER nodejs
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
