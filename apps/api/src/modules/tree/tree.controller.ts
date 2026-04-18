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
    @Query('ancestors') ancestors?: number,
    @Query('descendants') descendants?: number,
  ) {
    return {
      success: true,
      data: await this.treeService.getTree(
        rootPersonId,
        ancestors || 4,
        descendants || 2,
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
}
