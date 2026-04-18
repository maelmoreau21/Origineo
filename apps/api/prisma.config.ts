// ══════════════════════════════════════
// Prisma 7 Configuration
// ══════════════════════════════════════
// Connection URLs must be defined here per Prisma 7 requirements.
// See: https://pris.ly/d/config-datasource

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async url() {
      return process.env.DATABASE_URL || 'postgresql://origineo:origineo_secret_change_me@localhost:5432/origineo';
    },
  },
});
