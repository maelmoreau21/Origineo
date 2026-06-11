// ══════════════════════════════════════
// Tree Module — Dynamic Tree Navigation
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { TreeService } from './tree.service';
import { TreeController } from './tree.controller';
import { PersonModule } from '../person/person.module';

@Module({
  imports: [PersonModule],
  controllers: [TreeController],
  providers: [TreeService],
  exports: [TreeService],
})
export class TreeModule {}
