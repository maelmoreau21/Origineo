-- ══════════════════════════════════════════════
-- Origineo — PostgreSQL Initialization Script
-- ══════════════════════════════════════════════

-- UUID generation support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigram-based full-text search (fuzzy matching)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE origineo TO origineo;
