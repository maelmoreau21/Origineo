// ══════════════════════════════════════
// Search Service — Full-text with pg_trgm
// ══════════════════════════════════════

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export interface SearchFilters {
  q?: string;
  place?: string;
  gender?: string;
  birthDateFrom?: string;
  birthDateTo?: string;
  deathDateFrom?: string;
  deathDateTo?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Multi-criteria search across persons.
   * - Text query uses pg_trgm + ILIKE fuzzy matching
   * - Optional filters: place, gender, birth/death date ranges
   */
  async search(treeId: string, filters: SearchFilters, page = 1, limit = 20) {
    const safePage = Number.isFinite(page)
      ? Math.max(1, Math.floor(page))
      : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.floor(limit)))
      : 20;

    const offset = (safePage - 1) * safeLimit;
    const searchTerm = this.normalizeOptionalString(filters.q);
    const normalizedSearchTerm = searchTerm
      ? this.normalizeForIndex(searchTerm)
      : null;
    const place = this.normalizeOptionalString(filters.place);
    const gender = this.normalizeGender(filters.gender);
    const birthDateFrom = this.parseOptionalDate(filters.birthDateFrom, 'birthDateFrom');
    const birthDateTo = this.parseOptionalDate(filters.birthDateTo, 'birthDateTo');
    const deathDateFrom = this.parseOptionalDate(filters.deathDateFrom, 'deathDateFrom');
    const deathDateTo = this.parseOptionalDate(filters.deathDateTo, 'deathDateTo');

    if (birthDateFrom && birthDateTo && birthDateFrom > birthDateTo) {
      throw new BadRequestException('birthDateFrom must be before or equal to birthDateTo');
    }

    if (deathDateFrom && deathDateTo && deathDateFrom > deathDateTo) {
      throw new BadRequestException('deathDateFrom must be before or equal to deathDateTo');
    }

    const hasCriteria = Boolean(
      searchTerm
      || place
      || gender
      || birthDateFrom
      || birthDateTo
      || deathDateFrom
      || deathDateTo,
    );

    if (!hasCriteria) {
      return { persons: [], total: 0, page: safePage, limit: safeLimit };
    }

    const birthPlaceSql = Prisma.sql`concat_ws(', ', bp.name, bp.subdivision, bp.region, bp.country)`;
    const deathPlaceSql = Prisma.sql`concat_ws(', ', dp.name, dp.subdivision, dp.region, dp.country)`;
    const conditions: Prisma.Sql[] = [Prisma.sql`p.tree_id = ${treeId}::uuid`];

    if (searchTerm) {
      const likePattern = `%${searchTerm}%`;
      const normalizedLikePattern = `%${normalizedSearchTerm}%`;
      conditions.push(Prisma.sql`
        (
          p.primary_name_normalized % ${normalizedSearchTerm}
          OR p.surname_normalized % ${normalizedSearchTerm}
          OR p.given_names_normalized % ${normalizedSearchTerm}
          OR p.primary_name_normalized ILIKE ${normalizedLikePattern}
          OR p.surname_normalized ILIKE ${normalizedLikePattern}
          OR p.given_names_normalized ILIKE ${normalizedLikePattern}
          OR p.birth_year::text = ${normalizedSearchTerm}
          OR p.death_year::text = ${normalizedSearchTerm}
          OR
          p.given_names % ${searchTerm}
          OR p.birth_surname % ${searchTerm}
          OR p.usage_surname % ${searchTerm}
          OR bp.name % ${searchTerm}
          OR bp.subdivision % ${searchTerm}
          OR bp.region % ${searchTerm}
          OR bp.country % ${searchTerm}
          OR dp.name % ${searchTerm}
          OR dp.subdivision % ${searchTerm}
          OR dp.region % ${searchTerm}
          OR dp.country % ${searchTerm}
          OR p.given_names ILIKE ${likePattern}
          OR p.birth_surname ILIKE ${likePattern}
          OR p.usage_surname ILIKE ${likePattern}
          OR ${birthPlaceSql} ILIKE ${likePattern}
          OR ${deathPlaceSql} ILIKE ${likePattern}
          OR p.notes ILIKE ${likePattern}
          OR EXISTS (
            SELECT 1
            FROM unnest(p.professions) profession
            WHERE profession ILIKE ${likePattern}
          )
        )
      `);
    }

    if (place) {
      const placePattern = `%${place}%`;
      conditions.push(
        Prisma.sql`(
          ${birthPlaceSql} ILIKE ${placePattern}
          OR ${deathPlaceSql} ILIKE ${placePattern}
        )`,
      );
    }

    if (gender) {
      conditions.push(Prisma.sql`p.gender = ${gender}`);
    }

    if (birthDateFrom) {
      conditions.push(Prisma.sql`p.birth_date >= ${birthDateFrom}`);
    }

    if (birthDateTo) {
      conditions.push(Prisma.sql`p.birth_date <= ${birthDateTo}`);
    }

    if (deathDateFrom) {
      conditions.push(Prisma.sql`p.death_date >= ${deathDateFrom}`);
    }

    if (deathDateTo) {
      conditions.push(Prisma.sql`p.death_date <= ${deathDateTo}`);
    }

    const whereClause = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const similarityExpression = searchTerm
      ? Prisma.sql`
        GREATEST(
          COALESCE(similarity(p.primary_name_normalized, ${normalizedSearchTerm}), 0),
          COALESCE(similarity(p.surname_normalized, ${normalizedSearchTerm}), 0),
          COALESCE(similarity(p.given_names_normalized, ${normalizedSearchTerm}), 0),
          COALESCE(similarity(p.given_names, ${searchTerm}), 0),
          COALESCE(similarity(p.birth_surname, ${searchTerm}), 0),
          COALESCE(similarity(p.usage_surname, ${searchTerm}), 0),
          COALESCE(similarity(${birthPlaceSql}, ${searchTerm}), 0),
          COALESCE(similarity(${deathPlaceSql}, ${searchTerm}), 0)
        )
      `
      : Prisma.sql`0::double precision`;

    const orderByClause = searchTerm
      ? Prisma.sql`ORDER BY similarity DESC, p.updated_at DESC`
      : Prisma.sql`ORDER BY p.birth_date DESC NULLS LAST, p.updated_at DESC`;

    const results = await this.prisma.$queryRaw<SearchResult[]>(Prisma.sql`
      SELECT
        p.*,
        CASE WHEN bp.id IS NULL THEN NULL ELSE ${birthPlaceSql} END AS birth_place,
        CASE WHEN dp.id IS NULL THEN NULL ELSE ${deathPlaceSql} END AS death_place,
        ${similarityExpression} AS similarity
      FROM persons p
      LEFT JOIN places bp ON bp.id = p.birth_place_id
      LEFT JOIN places dp ON dp.id = p.death_place_id
      ${whereClause}
      ${orderByClause}
      LIMIT ${safeLimit}
      OFFSET ${offset}
    `);

    const countResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) as count
      FROM persons p
      LEFT JOIN places bp ON bp.id = p.birth_place_id
      LEFT JOIN places dp ON dp.id = p.death_place_id
      ${whereClause}
    `);

    const total = Number(countResult[0]?.count || 0);

    return {
      persons: results,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  private normalizeOptionalString(value?: string | null) {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeForIndex(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeGender(value?: string | null) {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    const allowed = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'];
    return allowed.includes(normalized) ? normalized : null;
  }

  private parseOptionalDate(value: string | undefined, label: string) {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date for ${label}`);
    }

    return parsed;
  }
}
