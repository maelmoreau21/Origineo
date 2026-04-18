// ══════════════════════════════════════
// Prisma Service — Database Connection (Prisma 7)
// ══════════════════════════════════════
// Prisma 7 requires driver adapters for runtime connections.
// The pg Pool adapter is used for PostgreSQL direct connections.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://origineo:origineo_secret_change_me@localhost:5432/origineo';

    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
