// ══════════════════════════════════════
// GEDCOM Module — Import/Export/Merge
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { GedcomService } from './gedcom.service';
import { GedcomMergeService } from './gedcom-merge.service';
import { GedcomController } from './gedcom.controller';
import { PersonModule } from '../person/person.module';

@Module({
  imports: [PersonModule],
  controllers: [GedcomController],
  providers: [GedcomService, GedcomMergeService],
  exports: [GedcomService, GedcomMergeService],
})
export class GedcomModule {}
