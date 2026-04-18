// ══════════════════════════════════════
// GEDCOM Module — Import/Export
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { GedcomService } from './gedcom.service';
import { GedcomController } from './gedcom.controller';

@Module({
  controllers: [GedcomController],
  providers: [GedcomService],
  exports: [GedcomService],
})
export class GedcomModule {}
