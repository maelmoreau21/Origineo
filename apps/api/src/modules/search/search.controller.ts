// ══════════════════════════════════════
// Search Controller
// ══════════════════════════════════════

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search persons by text and advanced filters (dates, place, gender)' })
  @ApiQuery({ name: 'q', required: false, description: 'Free text query (name, place, notes, professions)' })
  @ApiQuery({ name: 'place', required: false, description: 'Filter by birth/death place' })
  @ApiQuery({ name: 'gender', required: false, description: 'MALE | FEMALE | OTHER | UNKNOWN' })
  @ApiQuery({ name: 'birthDateFrom', required: false, description: 'Birth date lower bound (YYYY-MM-DD)' })
  @ApiQuery({ name: 'birthDateTo', required: false, description: 'Birth date upper bound (YYYY-MM-DD)' })
  @ApiQuery({ name: 'deathDateFrom', required: false, description: 'Death date lower bound (YYYY-MM-DD)' })
  @ApiQuery({ name: 'deathDateTo', required: false, description: 'Death date upper bound (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async search(
    @Query('q') q?: string,
    @Query('place') place?: string,
    @Query('gender') gender?: string,
    @Query('birthDateFrom') birthDateFrom?: string,
    @Query('birthDateTo') birthDateTo?: string,
    @Query('deathDateFrom') deathDateFrom?: string,
    @Query('deathDateTo') deathDateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = this.parsePositiveInt(page, 1, 1_000_000);
    const parsedLimit = this.parsePositiveInt(limit, 20, 100);

    return {
      success: true,
      data: await this.searchService.search(
        {
          q,
          place,
          gender,
          birthDateFrom,
          birthDateTo,
          deathDateFrom,
          deathDateTo,
        },
        parsedPage,
        parsedLimit,
      ),
    };
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

    return Math.min(parsed, max);
  }
}
