// ══════════════════════════════════════
// Search Service — Full-text with pg_trgm
// ══════════════════════════════════════

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SearchResult {
  id: string;
  usage_surname: string | null;
  birth_surname: string | null;
  given_names: string;
  gender: string;
  birth_date: Date | null;
  birth_place: string | null;
  death_date: Date | null;
  death_place: string | null;
  similarity: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full-text search across persons using PostgreSQL trigram similarity.
   * Searches across given_names, birth_surname, usage_surname, birth_place, and death_place.
   */
  async search(query: string, page = 1, limit = 20) {
    if (!query || query.trim().length === 0) {
      return { persons: [], total: 0, page, limit };
    }

    const offset = (page - 1) * limit;
    const searchTerm = query.trim();

    // Use pg_trgm similarity for fuzzy matching
    const results = await this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        p.*,
        GREATEST(
          COALESCE(similarity(p.given_names, ${searchTerm}), 0),
          COALESCE(similarity(p.birth_surname, ${searchTerm}), 0),
          COALESCE(similarity(p.usage_surname, ${searchTerm}), 0),
          COALESCE(similarity(p.birth_place, ${searchTerm}), 0)
        ) AS similarity
      FROM persons p
      WHERE
        p.given_names % ${searchTerm}
        OR p.birth_surname % ${searchTerm}
        OR p.usage_surname % ${searchTerm}
        OR p.birth_place % ${searchTerm}
        OR p.given_names ILIKE ${'%' + searchTerm + '%'}
        OR p.birth_surname ILIKE ${'%' + searchTerm + '%'}
        OR p.usage_surname ILIKE ${'%' + searchTerm + '%'}
      ORDER BY similarity DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Count total results
    const countResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM persons p
      WHERE
        p.given_names % ${searchTerm}
        OR p.birth_surname % ${searchTerm}
        OR p.usage_surname % ${searchTerm}
        OR p.birth_place % ${searchTerm}
        OR p.given_names ILIKE ${'%' + searchTerm + '%'}
        OR p.birth_surname ILIKE ${'%' + searchTerm + '%'}
        OR p.usage_surname ILIKE ${'%' + searchTerm + '%'}
    `;

    const total = Number(countResult[0]?.count || 0);

    return {
      persons: results,
      total,
      page,
      limit,
    };
  }
}
