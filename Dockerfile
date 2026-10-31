# ==============================================================================
# Stage 1: Build Svelte 5 + SvelteKit Static SPA (Node 24 LTS Alpine)
# ==============================================================================
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ==============================================================================
# Stage 2: Build Rust Backend (Axum + SQLx) with LTO & Strip
# ==============================================================================
FROM rust:1-slim-bookworm AS backend-builder
WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/Cargo.toml backend/Cargo.lock* ./
COPY backend/migrations ./migrations
COPY backend/src ./src

RUN cargo build --release

# ==============================================================================
# Stage 3: Ultra-Lightweight Runtime Image (~15-25 MB RAM at runtime)
# ==============================================================================
FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1001 origineo \
    && mkdir -p /app/storage/persons /app/storage/unions /app/static \
    && chown -R origineo:origineo /app

COPY --from=backend-builder /app/backend/target/release/origineo-api /app/origineo-api
COPY --from=frontend-builder /app/frontend/build /app/static

USER origineo

ENV PORT=8080 \
    STATIC_DIR=/app/static \
    STORAGE_PATH=/app/storage \
    RUST_LOG=origineo_api=info,tower_http=info

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["/app/origineo-api"]
