// ══════════════════════════════════════
// Person Module
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { PersonService } from './person.service';
import { PersonController } from './person.controller';
import { TreeIntegrityService } from './tree-integrity.service';

@Module({
  controllers: [PersonController],
  providers: [PersonService, TreeIntegrityService],
  exports: [PersonService, TreeIntegrityService],
})
export class PersonModule {}
