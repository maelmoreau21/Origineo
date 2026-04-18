// ══════════════════════════════════════
// Search Controller
// ══════════════════════════════════════

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search persons by name, place, etc. (fuzzy matching)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @Query('q') query: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return {
      success: true,
      data: await this.searchService.search(query, page || 1, limit || 20),
    };
  }
}
