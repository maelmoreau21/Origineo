// ══════════════════════════════════════
// Origineo API — Root Module
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PersonModule } from './modules/person/person.module';
import { RelationshipModule } from './modules/relationship/relationship.module';
import { UnionModule } from './modules/union/union.module';
import { EventModule } from './modules/event/event.module';
import { TreeModule } from './modules/tree/tree.module';
import { SearchModule } from './modules/search/search.module';
import { GedcomModule } from './modules/gedcom/gedcom.module';
import { DocumentModule } from './modules/document/document.module';
import { SourceModule } from './modules/source/source.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PersonModule,
    RelationshipModule,
    UnionModule,
    EventModule,
    TreeModule,
    SearchModule,
    GedcomModule,
    DocumentModule,
    SourceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
