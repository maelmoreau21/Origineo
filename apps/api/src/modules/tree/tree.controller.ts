// ══════════════════════════════════════
// Tree Controller
// ══════════════════════════════════════

import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TreeService } from './tree.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tree')
@Controller('tree')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Public()
  @Get(':rootPersonId')
  @ApiOperation({
    summary: 'Get tree data centered on a person with configurable depth',
  })
  @ApiQuery({ name: 'ancestors', required: false, type: Number, description: 'Number of ancestor generations (default: 4)' })
  @ApiQuery({ name: 'descendants', required: false, type: Number, description: 'Number of descendant generations (default: 2)' })
  async getTree(
    @Param('rootPersonId', ParseUUIDPipe) rootPersonId: string,
    @Query('ancestors') ancestors?: string,
    @Query('descendants') descendants?: string,
  ) {
    const ancestorDepth = this.parseDepth(ancestors, 4, 12);
    const descendantDepth = this.parseDepth(descendants, 2, 12);

    return {
      success: true,
      data: await this.treeService.getTree(
        rootPersonId,
        ancestorDepth,
        descendantDepth,
      ),
    };
  }

  @Public()
  @Get('relationship/:personAId/:personBId')
  @ApiOperation({ summary: 'Calculate the relationship path between two persons' })
  async getRelationshipPath(
    @Param('personAId', ParseUUIDPipe) personAId: string,
    @Param('personBId', ParseUUIDPipe) personBId: string,
  ) {
    return {
      success: true,
      data: await this.treeService.getRelationshipPath(personAId, personBId),
    };
  }

  private parseDepth(value: string | undefined, fallback: number, max: number) {
    if (value === undefined) return fallback;

    const parsed = Number(value);
    if (Number.isNaN(parsed)) return fallback;

    const integer = Math.floor(parsed);
    if (integer < 0) return 0;
    if (integer > max) return max;
    return integer;
  }
}
