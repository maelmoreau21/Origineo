// ══════════════════════════════════════
// GEDCOM Service — Import/Export .ged
// ══════════════════════════════════════

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PersonService } from '../person/person.service';

type PlaceLike = {
  name: string;
  subdivision: string | null;
  region: string | null;
  country: string | null;
} | null;

/**
 * GEDCOM Service handles importing and exporting genealogy data
 * in the GEDCOM 5.5.1 format (.ged files).
 *
 * Import: Parses .ged file → creates Person, Relationship, Union records
 * Export: Queries database → generates .ged file content
 */
@Injectable()
export class GedcomService {
  private readonly logger = new Logger(GedcomService.name);
  private static readonly IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;
  private static readonly IMPORT_TRANSACTION_TIMEOUT_MS = 600_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly personService: PersonService,
  ) {}

  /**
   * Import a GEDCOM file into the database.
   * Uses read-gedcom for tolerant parsing.
   */
  async importGedcom(treeId: string, fileBuffer: Buffer, filename: string) {
    this.logger.log(`Importing GEDCOM file: ${filename}`);

    const beforeConnectivity = await this.personService.getConnectivitySnapshot(treeId);

    try {
      // Dynamic import of read-gedcom (ESM module)
      const { readGedcom } = await import('read-gedcom');
      const gedcom = readGedcom(fileBuffer as any);

      const individuals = gedcom.getIndividualRecord();
      const families = gedcom.getFamilyRecord();

      // Map GEDCOM pointers (@I1@, etc.) to our UUIDs
      const pointerToUuid = new Map<string, string>();
      const stats = { personsCreated: 0, relationshipsCreated: 0, unionsCreated: 0 };

      // Phase 1: Create all individuals
      await this.prisma.$transaction(async (tx) => {
        for (const indi of individuals.arraySelect()) {
          const pointer = indi.pointer().toString();
          const name = indi.getName().value()?.[0] || '';
          const nameParts = this.parseGedcomName(name);

          const sex = indi.getSex().value()?.[0];
          let gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' = 'UNKNOWN';
          if (sex === 'M') gender = 'MALE';
          else if (sex === 'F') gender = 'FEMALE';

          const birthEvent = indi.getEventBirth();
          const deathEvent = indi.getEventDeath();
          const birthDate = this.parseGedcomDate(birthEvent.getDate().value()?.[0]);
          const deathDate = this.parseGedcomDate(deathEvent.getDate().value()?.[0]);
          const [birthPlaceId, deathPlaceId] = await Promise.all([
            this.findOrCreatePlaceId(tx, birthEvent.getPlace().value()?.[0]),
            this.findOrCreatePlaceId(tx, deathEvent.getPlace().value()?.[0]),
          ]);

          const person = await tx.person.create({
            data: {
              treeId,
              givenNames: nameParts.givenNames || 'Unknown',
              birthSurname: nameParts.surname || null,
              usageSurname: nameParts.surname || null,
              gender,
              birthDate,
              birthPlaceId,
              deathDate,
              deathPlaceId,
              notes: indi.getNote().value()?.[0] || null,
              ...this.normalizedPersonFields({
                givenNames: nameParts.givenNames || 'Unknown',
                usageSurname: nameParts.surname || null,
                birthSurname: nameParts.surname || null,
                birthDate,
                deathDate,
              }),
            },
          });

          pointerToUuid.set(pointer, person.id);
          stats.personsCreated++;
        }

        // Phase 2: Create families (unions + relationships) in batches
        const unionCandidates = new Map<
          string,
          {
            partner1Id: string;
            partner2Id: string;
            type: 'MARRIAGE';
            startDate: Date | null;
            startPlace: string | null;
            treeId: string;
          }
        >();
        const relationshipCandidates = new Map<
          string,
          {
            parentId: string;
            childId: string;
            type: 'BIOLOGICAL';
          }
        >();

        const toPairKey = (partnerA: string, partnerB: string) => {
          return partnerA < partnerB
            ? `${partnerA}|${partnerB}`
            : `${partnerB}|${partnerA}`;
        };

        for (const fam of families.arraySelect()) {
          const husbandPtr = this.extractGedcomPointer(
            fam.getHusband().value()?.[0],
          );
          const wifePtr = this.extractGedcomPointer(
            fam.getWife().value()?.[0],
          );

          const partner1Id = husbandPtr ? pointerToUuid.get(husbandPtr) : null;
          const partner2Id = wifePtr ? pointerToUuid.get(wifePtr) : null;

          // Queue union if both partners exist
          if (partner1Id && partner2Id && partner1Id !== partner2Id) {
            const marriageEvent = fam.getEventMarriage();

            const pairKey = toPairKey(partner1Id, partner2Id);
            if (!unionCandidates.has(pairKey)) {
              unionCandidates.set(pairKey, {
                partner1Id,
                partner2Id,
                type: 'MARRIAGE',
                startDate: this.parseGedcomDate(marriageEvent.getDate().value()?.[0]),
                startPlace: marriageEvent.getPlace().value()?.[0] || null,
                treeId,
              });
            }
          }

          const parentIds = [partner1Id, partner2Id].filter(
            (parentId): parentId is string => Boolean(parentId),
          );
          if (parentIds.length === 0) continue;

          // Queue parent-child relationships
          const childPtrs = fam.getChild().value() || [];
          for (const childPtr of childPtrs) {
            const normalizedChildPtr = this.extractGedcomPointer(childPtr);
            if (!normalizedChildPtr) continue;

            const childId = pointerToUuid.get(normalizedChildPtr);
            if (!childId) continue;

            for (const parentId of parentIds) {
              const relationKey = `${parentId}|${childId}`;
              if (!relationshipCandidates.has(relationKey)) {
                relationshipCandidates.set(relationKey, {
                  parentId,
                  childId,
                  type: 'BIOLOGICAL',
                });
              }
            }
          }
        }

        if (unionCandidates.size > 0) {
          const createdUnions = await tx.union.createMany({
            data: Array.from(unionCandidates.values()),
          });
          stats.unionsCreated += createdUnions.count;
        }

        if (relationshipCandidates.size > 0) {
          const createdRelationships = await tx.relationship.createMany({
            data: Array.from(relationshipCandidates.values()),
            skipDuplicates: true,
          });
          stats.relationshipsCreated += createdRelationships.count;
        }
      }, {
        maxWait: GedcomService.IMPORT_TRANSACTION_MAX_WAIT_MS,
        timeout: GedcomService.IMPORT_TRANSACTION_TIMEOUT_MS,
      });

      const afterConnectivity = await this.personService.getConnectivitySnapshot(treeId);

      const disconnectedDelta =
        afterConnectivity.disconnectedComponents - beforeConnectivity.disconnectedComponents;
      const isolatedDelta =
        afterConnectivity.isolatedPersons - beforeConnectivity.isolatedPersons;

      const integrityAlert = disconnectedDelta > 0 || isolatedDelta > 0
        ? {
            type: 'IMPORT_CONNECTIVITY_ALERT',
            message:
              `${disconnectedDelta > 0 ? `${disconnectedDelta} composant(s) déconnecté(s) créé(s). ` : ''}` +
              `${isolatedDelta > 0 ? `${isolatedDelta} personne(s) isolée(s) créée(s).` : ''}`,
            before: beforeConnectivity,
            after: afterConnectivity,
          }
        : null;

      this.logger.log(`GEDCOM import complete: ${JSON.stringify(stats)}`);
      return {
        ...stats,
        integrityAlert,
      };
    } catch (error) {
      this.logger.error(`GEDCOM import failed: ${error}`);
      throw new BadRequestException(
        `Failed to import GEDCOM file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Export the entire database (or a branch) as GEDCOM 5.5.1 format.
   */
  async exportGedcom(treeId: string, rootPersonId?: string, maxGenerations?: number) {
    let persons;
    let relationships;
    let unions;

    if (rootPersonId && maxGenerations) {
      // Export a specific branch
      const personIds = await this.collectBranchPersonIds(
        treeId,
        rootPersonId,
        maxGenerations,
      );

      persons = await this.prisma.person.findMany({
        where: { treeId, id: { in: personIds } },
        include: { birthPlace: true, deathPlace: true },
      });
      relationships = await this.prisma.relationship.findMany({
        where: {
          parentId: { in: personIds },
          childId: { in: personIds },
        },
      });
      unions = await this.prisma.union.findMany({
        where: {
          treeId,
          partner1Id: { in: personIds },
          partner2Id: { in: personIds },
        },
      });
    } else {
      // Export everything
      persons = await this.prisma.person.findMany({
        where: { treeId },
        include: { birthPlace: true, deathPlace: true },
      });
      const personIds = persons.map((person) => person.id);
      relationships = await this.prisma.relationship.findMany({
        where: {
          parentId: { in: personIds },
          childId: { in: personIds },
        },
      });
      unions = await this.prisma.union.findMany({ where: { treeId } });
    }

    return this.generateGedcomContent(
      persons.map((person) => this.serializePerson(person)),
      relationships,
      unions,
    );
  }

  /**
   * Generate GEDCOM 5.5.1 file content from database records.
   */
  private generateGedcomContent(
    persons: any[],
    relationships: any[],
    unions: any[],
  ): string {
    const lines: string[] = [];

    // Header
    lines.push('0 HEAD');
    lines.push('1 SOUR Origineo');
    lines.push('2 VERS 0.1.0');
    lines.push('2 NAME Origineo');
    lines.push('1 GEDC');
    lines.push('2 VERS 5.5.1');
    lines.push('2 FORM LINEAGE-LINKED');
    lines.push('1 CHAR UTF-8');

    // Individual records
    const personPointers = new Map<string, string>();
    persons.forEach((person, idx) => {
      const pointer = `@I${idx + 1}@`;
      personPointers.set(person.id, pointer);

      lines.push(`0 ${pointer} INDI`);

      const surname = person.birthSurname || person.usageSurname || '';
      const givenNames = person.givenNames || '';
      lines.push(`1 NAME ${givenNames} /${surname}/`);
      if (givenNames) lines.push(`2 GIVN ${givenNames}`);
      if (surname) lines.push(`2 SURN ${surname}`);

      if (person.gender === 'MALE') lines.push('1 SEX M');
      else if (person.gender === 'FEMALE') lines.push('1 SEX F');
      else lines.push('1 SEX U');

      if (person.birthDate || person.birthPlace) {
        lines.push('1 BIRT');
        if (person.birthDate) {
          lines.push(`2 DATE ${this.formatGedcomDate(person.birthDate)}`);
        }
        if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
      }

      if (person.deathDate || person.deathPlace) {
        lines.push('1 DEAT');
        if (person.deathDate) {
          lines.push(`2 DATE ${this.formatGedcomDate(person.deathDate)}`);
        }
        if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
      }

      if (person.notes) {
        lines.push(`1 NOTE ${person.notes}`);
      }
    });

    // Family records
    unions.forEach((union, idx) => {
      const pointer = `@F${idx + 1}@`;
      const husband = personPointers.get(union.partner1Id);
      const wife = personPointers.get(union.partner2Id);

      lines.push(`0 ${pointer} FAM`);
      if (husband) lines.push(`1 HUSB ${husband}`);
      if (wife) lines.push(`1 WIFE ${wife}`);

      if (union.startDate || union.startPlace) {
        lines.push('1 MARR');
        if (union.startDate) {
          lines.push(`2 DATE ${this.formatGedcomDate(union.startDate)}`);
        }
        if (union.startPlace) lines.push(`2 PLAC ${union.startPlace}`);
      }

      // Add children for this union
      const childIds = new Set<string>();
      for (const rel of relationships) {
        if (
          (rel.parentId === union.partner1Id ||
            rel.parentId === union.partner2Id) &&
          relationships.some(
            (r2) =>
              r2.childId === rel.childId &&
              r2.parentId !== rel.parentId &&
              (r2.parentId === union.partner1Id ||
                r2.parentId === union.partner2Id),
          )
        ) {
          childIds.add(rel.childId);
        }
      }

      childIds.forEach((childId) => {
        const childPointer = personPointers.get(childId);
        if (childPointer) lines.push(`1 CHIL ${childPointer}`);
      });
    });

    // Trailer
    lines.push('0 TRLR');

    return lines.join('\n');
  }

  /**
   * Collect all person IDs in a branch starting from a root person.
   */
  private async collectBranchPersonIds(
    treeId: string,
    rootId: string,
    maxGenerations: number,
  ): Promise<string[]> {
    const results = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE branch AS (
        SELECT id, 0 AS generation
        FROM persons
        WHERE id = ${rootId}::uuid
          AND tree_id = ${treeId}::uuid

        UNION ALL

        SELECT p.id, b.generation + 1
        FROM persons p
        INNER JOIN relationships r ON (r.parent_id = p.id OR r.child_id = p.id)
        INNER JOIN branch b ON (r.child_id = b.id OR r.parent_id = b.id)
        WHERE b.generation < ${maxGenerations}
          AND p.id != b.id
          AND p.tree_id = ${treeId}::uuid
      )
      SELECT DISTINCT id FROM branch
    `;

    return results.map((r) => r.id);
  }

  // ─── Utility Methods ────────────────────────

  private parseGedcomName(name: string): {
    givenNames: string;
    surname: string;
  } {
    const match = name.match(/^(.*?)\s*\/(.*?)\//);
    if (match) {
      return {
        givenNames: match[1].trim(),
        surname: match[2].trim(),
      };
    }
    return { givenNames: name.trim(), surname: '' };
  }

  private extractGedcomPointer(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === 'object') {
      const maybeRecord = value as {
        pointer?: (() => unknown) | unknown;
        value?: unknown;
        toString?: () => string;
      };

      if (typeof maybeRecord.pointer === 'function') {
        const nested = this.extractGedcomPointer(maybeRecord.pointer());
        if (nested) return nested;
      } else if (typeof maybeRecord.pointer === 'string') {
        const nested = this.extractGedcomPointer(maybeRecord.pointer);
        if (nested) return nested;
      }

      if (Array.isArray(maybeRecord.value) && maybeRecord.value.length > 0) {
        const nested = this.extractGedcomPointer(maybeRecord.value[0]);
        if (nested) return nested;
      }

      if (typeof maybeRecord.toString === 'function') {
        const text = maybeRecord.toString().trim();
        if (text && text !== '[object Object]') {
          return text;
        }
      }
    }

    return null;
  }

  private parseGedcomDate(dateStr?: string | null): Date | null {
    if (!dateStr) return null;
    try {
      // GEDCOM dates can be: "1 JAN 1900", "JAN 1900", "1900", "ABT 1900", etc.
      const cleaned = dateStr
        .replace(/^(ABT|EST|CAL|BEF|AFT|BET)\s*/i, '')
        .replace(/\s*AND\s*.*$/i, '');

      const date = new Date(cleaned);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private normalizedPersonFields(input: {
    givenNames?: string | null;
    usageSurname?: string | null;
    birthSurname?: string | null;
    birthDate?: Date | null;
    deathDate?: Date | null;
  }) {
    const surname = input.usageSurname || input.birthSurname || null;
    return {
      givenNamesNormalized: input.givenNames
        ? this.normalizeText(input.givenNames) || null
        : null,
      surnameNormalized: surname ? this.normalizeText(surname) || null : null,
      primaryNameNormalized:
        this.normalizeText([input.givenNames, surname].filter(Boolean).join(' ')) ||
        null,
      birthYear: input.birthDate?.getFullYear() || null,
      deathYear: input.deathDate?.getFullYear() || null,
    };
  }

  private async findOrCreatePlaceId(tx: any, value?: string | null) {
    const parsed = this.parsePlaceString(value);
    if (!parsed) return null;

    const existing = await tx.place.findFirst({
      where: parsed,
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.place.create({
      data: parsed,
      select: { id: true },
    });
    return created.id;
  }

  private parsePlaceString(value?: string | null) {
    const parts = (value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return null;

    return {
      name: parts[0],
      subdivision: parts.length >= 4 ? parts[1] : null,
      region:
        parts.length === 3
          ? parts[1]
          : parts.length >= 4
          ? parts.slice(2, -1).join(', ')
          : null,
      country: parts.length >= 2 ? parts[parts.length - 1] : null,
    };
  }

  private serializePerson<T extends { birthPlace?: PlaceLike; deathPlace?: PlaceLike }>(
    person: T,
  ) {
    return {
      ...person,
      birthPlace: this.formatPlace(person.birthPlace || null),
      deathPlace: this.formatPlace(person.deathPlace || null),
    };
  }

  private formatPlace(place: PlaceLike) {
    if (!place) return null;
    return [place.name, place.subdivision, place.region, place.country]
      .filter(Boolean)
      .join(', ');
  }

  private normalizeText(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatGedcomDate(date: Date | string): string {
    const d = new Date(date);
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}
