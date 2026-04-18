// ══════════════════════════════════════
// Union Module
// ══════════════════════════════════════

import { Module } from '@nestjs/common';
import { UnionService } from './union.service';
import { UnionController } from './union.controller';

@Module({
  controllers: [UnionController],
  providers: [UnionService],
  exports: [UnionService],
})
export class UnionModule {}
