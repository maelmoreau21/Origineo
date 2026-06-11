# ══════════════════════════════════════
# Origineo Web — Multi-stage Dockerfile
# ══════════════════════════════════════

# ─── Base ────────────────────────────
FROM mirror.gcr.io/library/node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ─── Dependencies ────────────────────
FROM base AS deps
# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
# Copy all package.json files to satisfy pnpm workspace requirements
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile || pnpm install

# ─── Development ─────────────────────
FROM deps AS development
COPY . .
WORKDIR /app/apps/web
# Ensure local dependencies are installed
RUN pnpm install
EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]

# ─── Builder ─────────────────────────
FROM deps AS builder
COPY . .
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ─── Production ──────────────────────
FROM mirror.gcr.io/library/node:22-alpine AS production
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
