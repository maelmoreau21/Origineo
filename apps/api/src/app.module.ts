// ══════════════════════════════════════
// Origineo API — Root Module
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PersonModule } from './modules/person/person.module';
import { RelationshipModule } from './modules/relationship/relationship.module';
import { UnionModule } from './modules/union/union.module';
import { TreeModule } from './modules/tree/tree.module';
import { SearchModule } from './modules/search/search.module';
import { GedcomModule } from './modules/gedcom/gedcom.module';
import { DocumentModule } from './modules/document/document.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PersonModule,
    RelationshipModule,
    UnionModule,
    TreeModule,
    SearchModule,
    GedcomModule,
    DocumentModule,
  ],
})
export class AppModule {}

