// ══════════════════════════════════════
// GEDCOM Module — Import/Export/Merge
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { GedcomService } from './gedcom.service';
import { GedcomMergeService } from './gedcom-merge.service';
import { GedcomJobService } from './gedcom-job.service';
import { GedcomController } from './gedcom.controller';
import { PersonModule } from '../person/person.module';

@Module({
  imports: [PersonModule],
  controllers: [GedcomController],
  providers: [GedcomService, GedcomMergeService, GedcomJobService],
  exports: [GedcomService, GedcomMergeService, GedcomJobService],
})
export class GedcomModule {}
