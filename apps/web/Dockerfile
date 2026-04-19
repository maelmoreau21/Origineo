# syntax=docker/dockerfile:1

# ══════════════════════════════════════
# Origineo Web — Multi-stage Dockerfile
# ══════════════════════════════════════

# ─── Base ────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ─── Dependencies ────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

# ─── Development ─────────────────────
FROM deps AS development
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/apps/web
# Install package-local dependencies so `next` binary is available in the app
RUN pnpm --dir /app/apps/web install --frozen-lockfile || pnpm --dir /app/apps/web install
EXPOSE 3000
CMD ["pnpm","--dir","/app/apps/web","exec","--","next","dev","-H","0.0.0.0","-p","3000"]

# ─── Builder ─────────────────────────
FROM deps AS builder
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ─── Production ──────────────────────
FROM node:22-alpine AS production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
WORKDIR /app

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
