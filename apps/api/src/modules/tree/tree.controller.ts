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

@ApiTags('Tree')
@Controller('tree')
export class TreeController {
  constructor(private readonly treeService: TreeService) {}

  @Get(':rootPersonId')
  @ApiOperation({
    summary: 'Get tree data centered on a person with configurable depth',
  })
  @ApiQuery({ name: 'ancestors', required: false, type: Number, description: 'Number of ancestor generations (default: 4)' })
  @ApiQuery({ name: 'descendants', required: false, type: Number, description: 'Number of descendant generations (default: 2)' })
  @ApiQuery({ name: 'treeId', required: true, type: String, description: 'Tree UUID' })
  @ApiQuery({ name: 'siblings', required: false, type: Boolean, description: 'Include root siblings and shared parents (default: true)' })
  @ApiQuery({ name: 'spouses', required: false, type: Boolean, description: 'Include spouses and co-parents in the active window (default: true)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum visible persons in this tree window (default: 1200, max: 5000)' })
  async getTree(
    @Param('rootPersonId', ParseUUIDPipe) rootPersonId: string,
    @Query('treeId', ParseUUIDPipe) treeId: string,
    @Query('ancestors') ancestors?: string,
    @Query('descendants') descendants?: string,
    @Query('siblings') siblings?: string,
    @Query('spouses') spouses?: string,
    @Query('limit') limit?: string,
  ) {
    const ancestorDepth = this.parseDepth(ancestors, 4, 12);
    const descendantDepth = this.parseDepth(descendants, 2, 12);
    const parsedLimit = this.parseDepth(limit, 1200, 5000);

    return {
      success: true,
      data: await this.treeService.getTree(
        treeId,
        rootPersonId,
        ancestorDepth,
        descendantDepth,
        {
          includeSiblings: this.parseBoolean(siblings, true),
          includeSpouses: this.parseBoolean(spouses, true),
          limit: Math.max(25, parsedLimit),
        },
      ),
    };
  }

  @Get('relationship/:personAId/:personBId')
  @ApiOperation({ summary: 'Calculate the relationship path between two persons' })
  @ApiQuery({ name: 'treeId', required: true, type: String, description: 'Tree UUID' })
  async getRelationshipPath(
    @Param('personAId', ParseUUIDPipe) personAId: string,
    @Param('personBId', ParseUUIDPipe) personBId: string,
    @Query('treeId', ParseUUIDPipe) treeId: string,
  ) {
    return {
      success: true,
      data: await this.treeService.getRelationshipPath(treeId, personAId, personBId),
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

  private parseBoolean(value: string | undefined, fallback: boolean) {
    if (value === undefined) return fallback;
    if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
    return fallback;
  }
}
