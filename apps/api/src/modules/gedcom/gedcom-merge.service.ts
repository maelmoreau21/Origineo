// ══════════════════════════════════════
// GEDCOM Merge Service — Advanced Merge
// ══════════════════════════════════════
// Handles merging a second GEDCOM file into an existing tree:
// 1. Parse incoming GEDCOM into staging data
// 2. Detect duplicates via name/date/gender matching
// 3. Return candidates for user review
// 4. Apply merge decisions (merge, create new, or skip)

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Represents a person parsed from a GEDCOM file,
 * before any merge decision is made.
 */
export interface StagedPerson {
  /** Pointer from GEDCOM file (e.g. @I1@) */
  pointer: string;
  givenNames: string;
  surname: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  notes: string | null;
}

/**
 * A staged family record from a GEDCOM file.
 */
export interface StagedFamily {
  pointer: string;
  husbandPointer: string | null;
  wifePointer: string | null;
  childPointers: string[];
  marriageDate: string | null;
  marriagePlace: string | null;
}

/**
 * A potential duplicate match between a GEDCOM person
 * and an existing database person.
 */
export interface DuplicateCandidate {
  stagedPointer: string;
  staged: StagedPerson;
  existingPersonId: string;
  existingPerson: {
    id: string;
    givenNames: string;
    usageSurname: string | null;
    birthSurname: string | null;
    gender: string;
    birthDate: Date | null;
    birthPlace: string | null;
    deathDate: Date | null;
    deathPlace: string | null;
  };
  /** Confidence score 0-100 */
  confidence: number;
  /** Details of what matched */
  matchReasons: string[];
}

/**
 * Result of the merge analysis phase.
 */
export interface MergeAnalysis {
  sessionId: string;
  totalPersonsInFile: number;
  totalFamiliesInFile: number;
  duplicates: DuplicateCandidate[];
  newPersons: StagedPerson[];
  stagedFamilies: StagedFamily[];
}

/**
 * A user decision for each potential duplicate.
 */
export interface MergeDecision {
  stagedPointer: string;
  action: 'merge' | 'create' | 'skip';
  /** For 'merge': which existing person to merge into */
  mergeIntoPersonId?: string;
}

/**
 * Result of applying merge decisions.
 */
export interface MergeResult {
  personsCreated: number;
  personsMerged: number;
  personsSkipped: number;
  relationshipsCreated: number;
  unionsCreated: number;
}

// In-memory sessions store (TTL'd)
const mergeSessions = new Map<
  string,
  { analysis: MergeAnalysis; createdAt: Date }
>();

// Clean up old sessions (>30 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of mergeSessions) {
    if (now - session.createdAt.getTime() > 30 * 60 * 1000) {
      mergeSessions.delete(key);
    }
  }
}, 5 * 60 * 1000);

@Injectable()
export class GedcomMergeService {
  private readonly logger = new Logger(GedcomMergeService.name);
  private static readonly MERGE_TRANSACTION_MAX_WAIT_MS = 10_000;
  private static readonly MERGE_TRANSACTION_TIMEOUT_MS = 600_000;

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════
  // STEP 1: Analyze — Parse file + detect duplicates
  // ═══════════════════════════════════════

  async analyzeFile(fileBuffer: Buffer, filename: string): Promise<MergeAnalysis> {
    this.logger.log(`Analyzing GEDCOM file for merge: ${filename}`);

    const { readGedcom } = await import('read-gedcom');
    const gedcom = readGedcom(fileBuffer as any);

    const individuals = gedcom.getIndividualRecord();
    const families = gedcom.getFamilyRecord();

    // Parse all individuals into staged persons
    const stagedPersons: StagedPerson[] = [];
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

      stagedPersons.push({
        pointer,
        givenNames: nameParts.givenNames || 'Unknown',
        surname: nameParts.surname || '',
        gender,
        birthDate: birthEvent.getDate().value()?.[0] || null,
        birthPlace: birthEvent.getPlace().value()?.[0] || null,
        deathDate: deathEvent.getDate().value()?.[0] || null,
        deathPlace: deathEvent.getPlace().value()?.[0] || null,
        notes: indi.getNote().value()?.[0] || null,
      });
    }

    // Parse families
    const stagedFamilies: StagedFamily[] = [];
    for (const fam of families.arraySelect()) {
      const pointer = fam.pointer().toString();
      const marriageEvent = fam.getEventMarriage();
      const childValues = fam.getChild().value() || [];

      stagedFamilies.push({
        pointer,
        husbandPointer: this.extractGedcomPointer(fam.getHusband().value()?.[0]),
        wifePointer: this.extractGedcomPointer(fam.getWife().value()?.[0]),
        childPointers: childValues
          .map((c: any) => this.extractGedcomPointer(c))
          .filter((childPtr): childPtr is string => Boolean(childPtr)),
        marriageDate: marriageEvent.getDate().value()?.[0] || null,
        marriagePlace: marriageEvent.getPlace().value()?.[0] || null,
      });
    }

    // Detect duplicates with existing database
    const allExistingPersons = await this.prisma.person.findMany({
      select: {
        id: true,
        givenNames: true,
        usageSurname: true,
        birthSurname: true,
        gender: true,
        birthDate: true,
        birthPlace: true,
        deathDate: true,
        deathPlace: true,
      },
    });

    const duplicates: DuplicateCandidate[] = [];
    const newPersons: StagedPerson[] = [];

    for (const staged of stagedPersons) {
      const candidates = this.findDuplicateCandidates(staged, allExistingPersons);

      if (candidates.length > 0) {
        // Take the best match (highest confidence)
        const best = candidates[0];
        duplicates.push(best);
      } else {
        newPersons.push(staged);
      }
    }

    // Generate session ID and store
    const sessionId = this.generateSessionId();
    const analysis: MergeAnalysis = {
      sessionId,
      totalPersonsInFile: stagedPersons.length,
      totalFamiliesInFile: stagedFamilies.length,
      duplicates,
      newPersons,
      stagedFamilies,
    };

    mergeSessions.set(sessionId, { analysis, createdAt: new Date() });

    this.logger.log(
      `Merge analysis complete: ${duplicates.length} duplicates, ${newPersons.length} new persons`,
    );

    return analysis;
  }

  // ═══════════════════════════════════════
  // STEP 2: Apply — Execute user merge decisions
  // ═══════════════════════════════════════

  async applyMerge(
    sessionId: string,
    decisions: MergeDecision[],
  ): Promise<MergeResult> {
    const session = mergeSessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(
        `Merge session "${sessionId}" not found or expired (30 min TTL)`,
      );
    }

    const { analysis } = session;
    const result: MergeResult = {
      personsCreated: 0,
      personsMerged: 0,
      personsSkipped: 0,
      relationshipsCreated: 0,
      unionsCreated: 0,
    };

    // Build a decision map: pointer → action
    const decisionMap = new Map<string, MergeDecision>();
    for (const d of decisions) {
      decisionMap.set(d.stagedPointer, d);
    }

    // Map GEDCOM pointers → final person UUIDs
    const pointerToUuid = new Map<string, string>();

    await this.prisma.$transaction(async (tx) => {
      // ─── Process duplicates ────────────────────
      for (const dup of analysis.duplicates) {
        const decision = decisionMap.get(dup.stagedPointer);
        if (!decision) {
          // Default: merge if confidence >= 70, else create
          if (dup.confidence >= 70) {
            pointerToUuid.set(dup.stagedPointer, dup.existingPersonId);
            // Optionally update existing person with new data
            await this.mergePersonData(tx, dup.existingPersonId, dup.staged);
            result.personsMerged++;
          } else {
            const newPerson = await this.createPersonFromStaged(tx, dup.staged);
            pointerToUuid.set(dup.stagedPointer, newPerson.id);
            result.personsCreated++;
          }
          continue;
        }

        switch (decision.action) {
          case 'merge': {
            const targetId = decision.mergeIntoPersonId || dup.existingPersonId;
            pointerToUuid.set(dup.stagedPointer, targetId);
            await this.mergePersonData(tx, targetId, dup.staged);
            result.personsMerged++;
            break;
          }
          case 'create': {
            const newPerson = await this.createPersonFromStaged(tx, dup.staged);
            pointerToUuid.set(dup.stagedPointer, newPerson.id);
            result.personsCreated++;
            break;
          }
          case 'skip': {
            result.personsSkipped++;
            break;
          }
        }
      }

      // ─── Process new persons (no duplicate) ────
      for (const staged of analysis.newPersons) {
        const decision = decisionMap.get(staged.pointer);
        if (decision?.action === 'skip') {
          result.personsSkipped++;
          continue;
        }

        const newPerson = await this.createPersonFromStaged(tx, staged);
        pointerToUuid.set(staged.pointer, newPerson.id);
        result.personsCreated++;
      }

      // ─── Process families (batched to avoid transaction timeout) ──────────────────────
      const unionCandidates = new Map<
        string,
        {
          partner1Id: string;
          partner2Id: string;
          startDate: Date | null;
          startPlace: string | null;
        }
      >();
      const relationshipCandidates = new Map<
        string,
        { parentId: string; childId: string; type: 'BIOLOGICAL' }
      >();

      const toPairKey = (partnerA: string, partnerB: string) => {
        return partnerA < partnerB
          ? `${partnerA}|${partnerB}`
          : `${partnerB}|${partnerA}`;
      };

      for (const family of analysis.stagedFamilies) {
        const partner1Id = family.husbandPointer
          ? pointerToUuid.get(family.husbandPointer)
          : null;
        const partner2Id = family.wifePointer
          ? pointerToUuid.get(family.wifePointer)
          : null;

        if (partner1Id && partner2Id && partner1Id !== partner2Id) {
          const pairKey = toPairKey(partner1Id, partner2Id);
          if (!unionCandidates.has(pairKey)) {
            unionCandidates.set(pairKey, {
              partner1Id,
              partner2Id,
              startDate: this.parseGedcomDate(family.marriageDate),
              startPlace: family.marriagePlace || null,
            });
          }
        }

        const parentIds = [partner1Id, partner2Id].filter(
          (parentId): parentId is string => Boolean(parentId),
        );
        if (parentIds.length === 0) continue;

        for (const childPointer of family.childPointers) {
          const childId = pointerToUuid.get(childPointer);
          if (!childId) continue;

          for (const parentId of parentIds) {
            const relationshipKey = `${parentId}|${childId}`;
            if (!relationshipCandidates.has(relationshipKey)) {
              relationshipCandidates.set(relationshipKey, {
                parentId,
                childId,
                type: 'BIOLOGICAL',
              });
            }
          }
        }
      }

      if (unionCandidates.size > 0) {
        const involvedPartnerIds = new Set<string>();
        for (const unionCandidate of unionCandidates.values()) {
          involvedPartnerIds.add(unionCandidate.partner1Id);
          involvedPartnerIds.add(unionCandidate.partner2Id);
        }

        const existingUnions = await tx.union.findMany({
          where: {
            OR: [
              { partner1Id: { in: Array.from(involvedPartnerIds) } },
              { partner2Id: { in: Array.from(involvedPartnerIds) } },
            ],
          },
          select: {
            partner1Id: true,
            partner2Id: true,
          },
        });

        const existingUnionKeys = new Set<string>();
        for (const existingUnion of existingUnions) {
          existingUnionKeys.add(
            toPairKey(existingUnion.partner1Id, existingUnion.partner2Id),
          );
        }

        const unionsToCreate: Array<{
          partner1Id: string;
          partner2Id: string;
          type: 'MARRIAGE';
          startDate: Date | null;
          startPlace: string | null;
        }> = [];

        for (const [pairKey, unionCandidate] of unionCandidates.entries()) {
          if (existingUnionKeys.has(pairKey)) continue;

          unionsToCreate.push({
            partner1Id: unionCandidate.partner1Id,
            partner2Id: unionCandidate.partner2Id,
            type: 'MARRIAGE',
            startDate: unionCandidate.startDate,
            startPlace: unionCandidate.startPlace,
          });
          existingUnionKeys.add(pairKey);
        }

        if (unionsToCreate.length > 0) {
          const createUnionResult = await tx.union.createMany({
            data: unionsToCreate,
          });
          result.unionsCreated += createUnionResult.count;
        }
      }

      if (relationshipCandidates.size > 0) {
        const createRelationshipResult = await tx.relationship.createMany({
          data: Array.from(relationshipCandidates.values()),
          skipDuplicates: true,
        });
        result.relationshipsCreated += createRelationshipResult.count;
      }
    }, {
      maxWait: GedcomMergeService.MERGE_TRANSACTION_MAX_WAIT_MS,
      timeout: GedcomMergeService.MERGE_TRANSACTION_TIMEOUT_MS,
    });

    // Clean up session
    mergeSessions.delete(sessionId);

    this.logger.log(`Merge applied: ${JSON.stringify(result)}`);
    return result;
  }

  // ═══════════════════════════════════════
  // Duplicate Detection Algorithm
  // ═══════════════════════════════════════

  private findDuplicateCandidates(
    staged: StagedPerson,
    existingPersons: any[],
  ): DuplicateCandidate[] {
    const candidates: DuplicateCandidate[] = [];

    for (const existing of existingPersons) {
      let confidence = 0;
      const matchReasons: string[] = [];

      // ─── Given Names Match (0-30 pts) ────────
      const sGiven = this.normalize(staged.givenNames);
      const eGiven = this.normalize(existing.givenNames);

      if (sGiven && eGiven) {
        if (sGiven === eGiven) {
          confidence += 30;
          matchReasons.push(`Prénoms identiques: "${staged.givenNames}"`);
        } else if (sGiven.includes(eGiven) || eGiven.includes(sGiven)) {
          confidence += 20;
          matchReasons.push(`Prénoms partiellement similaires`);
        } else {
          const sim = this.stringSimilarity(sGiven, eGiven);
          if (sim > 0.7) {
            confidence += Math.round(sim * 25);
            matchReasons.push(`Prénoms proches (${Math.round(sim * 100)}%)`);
          }
        }
      }

      // ─── Surname Match (0-30 pts) ────────────
      const sSurname = this.normalize(staged.surname);
      const eSurname = this.normalize(
        existing.usageSurname || existing.birthSurname || '',
      );

      if (sSurname && eSurname) {
        if (sSurname === eSurname) {
          confidence += 30;
          matchReasons.push(`Nom identique: "${staged.surname}"`);
        } else {
          const sim = this.stringSimilarity(sSurname, eSurname);
          if (sim > 0.7) {
            confidence += Math.round(sim * 25);
            matchReasons.push(`Nom proche (${Math.round(sim * 100)}%)`);
          }
        }
      }

      // ─── Gender Match (0-10 pts) ─────────────
      if (
        staged.gender !== 'UNKNOWN' &&
        existing.gender !== 'UNKNOWN' &&
        staged.gender === existing.gender
      ) {
        confidence += 10;
        matchReasons.push('Genre identique');
      }

      // ─── Birth Date Match (0-20 pts) ─────────
      if (staged.birthDate && existing.birthDate) {
        const sBirthDate = this.parseGedcomDate(staged.birthDate);
        const eBirthDate = new Date(existing.birthDate);

        if (sBirthDate && eBirthDate) {
          const daysDiff = Math.abs(
            (sBirthDate.getTime() - eBirthDate.getTime()) / (86400000),
          );

          if (daysDiff === 0) {
            confidence += 20;
            matchReasons.push('Date de naissance identique');
          } else if (daysDiff <= 365) {
            confidence += 10;
            matchReasons.push('Année de naissance proche');
          }
        }
      }

      // ─── Birth Place Match (0-10 pts) ────────
      if (staged.birthPlace && existing.birthPlace) {
        const sPlace = this.normalize(staged.birthPlace);
        const ePlace = this.normalize(existing.birthPlace);

        if (sPlace === ePlace) {
          confidence += 10;
          matchReasons.push(`Lieu de naissance identique: "${staged.birthPlace}"`);
        } else if (sPlace.includes(ePlace) || ePlace.includes(sPlace)) {
          confidence += 5;
          matchReasons.push('Lieu de naissance partiel');
        }
      }

      // Only include candidates above threshold
      if (confidence >= 40) {
        candidates.push({
          stagedPointer: staged.pointer,
          staged,
          existingPersonId: existing.id,
          existingPerson: existing,
          confidence: Math.min(confidence, 100),
          matchReasons,
        });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Return top 3 candidates max per person
    return candidates.slice(0, 3);
  }

  // ─── Data Merge ────────────────────────────

  /**
   * Merge staged GEDCOM data into an existing person record.
   * Only fills in null/empty fields — never overwrites existing data.
   */
  private async mergePersonData(tx: any, personId: string, staged: StagedPerson) {
    const existing = await tx.person.findUnique({ where: { id: personId } });
    if (!existing) return;

    const updates: Record<string, any> = {};

    if (!existing.birthSurname && staged.surname) {
      updates.birthSurname = staged.surname;
    }
    if (!existing.usageSurname && staged.surname) {
      updates.usageSurname = staged.surname;
    }
    if (existing.gender === 'UNKNOWN' && staged.gender !== 'UNKNOWN') {
      updates.gender = staged.gender;
    }
    if (!existing.birthDate && staged.birthDate) {
      updates.birthDate = this.parseGedcomDate(staged.birthDate);
    }
    if (!existing.birthPlace && staged.birthPlace) {
      updates.birthPlace = staged.birthPlace;
    }
    if (!existing.deathDate && staged.deathDate) {
      updates.deathDate = this.parseGedcomDate(staged.deathDate);
    }
    if (!existing.deathPlace && staged.deathPlace) {
      updates.deathPlace = staged.deathPlace;
    }
    if (!existing.notes && staged.notes) {
      updates.notes = staged.notes;
    }

    if (Object.keys(updates).length > 0) {
      await tx.person.update({ where: { id: personId }, data: updates });
    }
  }

  private async createPersonFromStaged(tx: any, staged: StagedPerson) {
    return tx.person.create({
      data: {
        givenNames: staged.givenNames || 'Unknown',
        birthSurname: staged.surname || null,
        usageSurname: staged.surname || null,
        gender: staged.gender,
        birthDate: this.parseGedcomDate(staged.birthDate),
        birthPlace: staged.birthPlace || null,
        deathDate: this.parseGedcomDate(staged.deathDate),
        deathPlace: staged.deathPlace || null,
        notes: staged.notes || null,
      },
    });
  }

  // ─── String Matching Utilities ────────────

  private normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  /**
   * Bigram-based string similarity (0-1).
   * Simple and fast — works well for names.
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = this.getBigrams(a);
    const bigramsB = this.getBigrams(b);

    let intersectionSize = 0;
    const copyB = new Map(bigramsB);

    for (const [bigram, count] of bigramsA) {
      const bCount = copyB.get(bigram) || 0;
      if (bCount > 0) {
        intersectionSize += Math.min(count, bCount);
        copyB.set(bigram, bCount - Math.min(count, bCount));
      }
    }

    const totalSize =
      Array.from(bigramsA.values()).reduce((s, c) => s + c, 0) +
      Array.from(bigramsB.values()).reduce((s, c) => s + c, 0);

    return totalSize === 0 ? 0 : (2 * intersectionSize) / totalSize;
  }

  private getBigrams(str: string): Map<string, number> {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  }

  // ─── GEDCOM Parsing ────────────────────────

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
      const cleaned = dateStr
        .replace(/^(ABT|EST|CAL|BEF|AFT|BET)\s*/i, '')
        .replace(/\s*AND\s*.*$/i, '');
      const date = new Date(cleaned);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  private generateSessionId(): string {
    return `merge_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
