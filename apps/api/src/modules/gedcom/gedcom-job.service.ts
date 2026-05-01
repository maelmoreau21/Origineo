import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GedcomMergeService,
  MergeDecision,
  StagedFamily,
  StagedPerson,
} from './gedcom-merge.service';
import { PersonService } from '../person/person.service';

type GedcomJobModeInput = 'import' | 'merge' | 'IMPORT' | 'MERGE';

@Injectable()
export class GedcomJobService {
  private readonly logger = new Logger(GedcomJobService.name);
  private static readonly JOB_TRANSACTION_MAX_WAIT_MS = 10_000;
  private static readonly JOB_TRANSACTION_TIMEOUT_MS = 600_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gedcomMergeService: GedcomMergeService,
    private readonly personService: PersonService,
  ) {}

  async createJob(fileBuffer: Buffer, filename: string, mode: GedcomJobModeInput) {
    const jobMode = this.normalizeMode(mode);

    try {
      const analysis = await this.gedcomMergeService.analyzeFile(
        fileBuffer,
        filename,
      );
      const stagedPersons = this.collectUniqueStagedPersons([
        ...analysis.duplicates.map((duplicate) => duplicate.staged),
        ...analysis.newPersons,
      ]);

      const job = await this.prisma.$transaction(
        async (tx) => {
          const createdJob = await tx.gedcomJob.create({
            data: {
              mode: jobMode,
              status: 'READY',
              filename,
              totalPersons: analysis.totalPersonsInFile,
              totalFamilies: analysis.totalFamiliesInFile,
              duplicateCount: analysis.duplicates.length,
              newPersonCount: analysis.newPersons.length,
              summary: {
                source: 'read-gedcom',
                candidateThreshold: 40,
              },
            },
          });

          if (stagedPersons.length > 0) {
            await tx.gedcomStagedPerson.createMany({
              data: stagedPersons.map((person) => ({
                jobId: createdJob.id,
                pointer: person.pointer,
                givenNames: person.givenNames || 'Unknown',
                surname: person.surname || null,
                gender: person.gender,
                birthDateRaw: person.birthDate,
                birthPlace: person.birthPlace,
                deathDateRaw: person.deathDate,
                deathPlace: person.deathPlace,
                notes: person.notes,
                normalizedGivenNames: this.normalize(person.givenNames) || null,
                normalizedSurname: this.normalize(person.surname || '') || null,
                birthYear: this.extractYear(person.birthDate),
              })),
            });
          }

          if (analysis.stagedFamilies.length > 0) {
            await tx.gedcomStagedFamily.createMany({
              data: analysis.stagedFamilies.map((family) => ({
                jobId: createdJob.id,
                pointer: family.pointer,
                husbandPointer: family.husbandPointer,
                wifePointer: family.wifePointer,
                childPointers: family.childPointers,
                marriageDateRaw: family.marriageDate,
                marriagePlace: family.marriagePlace,
              })),
            });
          }

          const stagedRows = await tx.gedcomStagedPerson.findMany({
            where: { jobId: createdJob.id },
            select: { id: true, pointer: true },
          });
          const stagedIdByPointer = new Map(
            stagedRows.map((row) => [row.pointer, row.id]),
          );

          for (const duplicate of analysis.duplicates) {
            const stagedPersonId = stagedIdByPointer.get(duplicate.stagedPointer);
            if (!stagedPersonId) continue;

            const candidates = new Map<
              string,
              { confidence: number; matchReasons: string[] }
            >();
            candidates.set(duplicate.existingPersonId, {
              confidence: duplicate.confidence,
              matchReasons: duplicate.matchReasons,
            });
            for (const candidate of duplicate.candidates || []) {
              candidates.set(candidate.existingPersonId, {
                confidence: candidate.confidence,
                matchReasons: candidate.matchReasons,
              });
            }

            const sortedCandidates = Array.from(candidates.entries()).sort(
              (a, b) => b[1].confidence - a[1].confidence,
            );
            const best = sortedCandidates[0];
            if (best) {
              await tx.gedcomStagedPerson.update({
                where: { id: stagedPersonId },
                data: {
                  bestExistingPersonId: best[0],
                  bestConfidence: best[1].confidence,
                },
              });
            }

            await tx.gedcomDuplicateCandidate.createMany({
              data: sortedCandidates.map(([existingPersonId, candidate]) => ({
                stagedPersonId,
                existingPersonId,
                confidence: candidate.confidence,
                matchReasons: candidate.matchReasons,
              })),
              skipDuplicates: true,
            });
          }

          return createdJob;
        },
        {
          maxWait: GedcomJobService.JOB_TRANSACTION_MAX_WAIT_MS,
          timeout: GedcomJobService.JOB_TRANSACTION_TIMEOUT_MS,
        },
      );

      return this.getJob(job.id);
    } catch (error) {
      this.logger.error(`GEDCOM job creation failed: ${error}`);
      throw new BadRequestException(
        `Failed to create GEDCOM job: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async getJob(jobId: string) {
    const job = await this.prisma.gedcomJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException(`GEDCOM job "${jobId}" not found`);
    }
    return job;
  }

  async getCandidates(jobId: string, page = 1, limit = 25) {
    await this.getJob(jobId);
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const skip = (safePage - 1) * safeLimit;

    const where = {
      jobId,
      candidates: { some: {} },
    };
    const [stagedRows, total] = await this.prisma.$transaction([
      this.prisma.gedcomStagedPerson.findMany({
        where,
        include: { candidates: { orderBy: { confidence: 'desc' } } },
        orderBy: [{ bestConfidence: 'desc' }, { givenNames: 'asc' }],
        skip,
        take: safeLimit,
      }),
      this.prisma.gedcomStagedPerson.count({ where }),
    ]);

    const existingPersonIds = Array.from(
      new Set(
        stagedRows.flatMap((row) =>
          row.candidates.map((candidate) => candidate.existingPersonId),
        ),
      ),
    );
    const existingPersons = existingPersonIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: existingPersonIds } },
        })
      : [];
    const existingById = new Map(
      existingPersons.map((person) => [person.id, person]),
    );

    return {
      data: stagedRows.flatMap((row) =>
        row.candidates.map((candidate) => ({
          id: candidate.id,
          stagedPersonId: row.id,
          stagedPointer: row.pointer,
          staged: this.toStagedDto(row),
          existingPersonId: candidate.existingPersonId,
          existingPerson: existingById.get(candidate.existingPersonId) || null,
          confidence: candidate.confidence,
          matchReasons: Array.isArray(candidate.matchReasons)
            ? candidate.matchReasons
            : [],
        })),
      ),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async applyJob(jobId: string, decisions: MergeDecision[]) {
    const beforeConnectivity = await this.personService.getConnectivitySnapshot();
    const job = await this.prisma.gedcomJob.findUnique({
      where: { id: jobId },
      include: {
        stagedPersons: {
          include: { candidates: { orderBy: { confidence: 'desc' } } },
          orderBy: { pointer: 'asc' },
        },
        stagedFamilies: { orderBy: { pointer: 'asc' } },
      },
    });

    if (!job) throw new NotFoundException(`GEDCOM job "${jobId}" not found`);
    if (job.status === 'DONE') {
      throw new BadRequestException(`GEDCOM job "${jobId}" is already done`);
    }

    const result = {
      personsCreated: 0,
      personsMerged: 0,
      personsSkipped: 0,
      relationshipsCreated: 0,
      unionsCreated: 0,
    };
    const pointerToUuid = new Map<string, string>();
    const decisionByPointer = new Map(decisions.map((d) => [d.stagedPointer, d]));
    const decisionById = new Map(
      decisions
        .filter((d) => 'stagedPersonId' in d && (d as any).stagedPersonId)
        .map((d) => [(d as any).stagedPersonId as string, d]),
    );

    await this.prisma.gedcomJob.update({
      where: { id: jobId },
      data: { status: 'APPLYING', error: null },
    });

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const stagedRow of job.stagedPersons) {
            const staged = this.toStagedDto(stagedRow);
            const decision =
              decisionById.get(stagedRow.id) ||
              decisionByPointer.get(stagedRow.pointer) ||
              this.defaultDecision(job.mode, stagedRow);

            if (decision.action === 'skip') {
              result.personsSkipped++;
              await this.persistDecision(tx, stagedRow.id, decision, null);
              continue;
            }

            if (decision.action === 'merge') {
              const targetId =
                decision.mergeIntoPersonId || stagedRow.bestExistingPersonId;
              if (targetId) {
                pointerToUuid.set(stagedRow.pointer, targetId);
                await this.mergePersonData(tx, targetId, staged);
                result.personsMerged++;
                await this.persistDecision(tx, stagedRow.id, decision, targetId);
                continue;
              }
            }

            const created = await this.createPersonFromStaged(tx, staged);
            pointerToUuid.set(stagedRow.pointer, created.id);
            result.personsCreated++;
            await this.persistDecision(
              tx,
              stagedRow.id,
              { ...decision, action: 'create' },
              created.id,
            );
          }

          const relationStats = await this.applyFamilies(
            tx,
            job.stagedFamilies,
            pointerToUuid,
          );
          result.relationshipsCreated = relationStats.relationshipsCreated;
          result.unionsCreated = relationStats.unionsCreated;
        },
        {
          maxWait: GedcomJobService.JOB_TRANSACTION_MAX_WAIT_MS,
          timeout: GedcomJobService.JOB_TRANSACTION_TIMEOUT_MS,
        },
      );

      const afterConnectivity =
        await this.personService.getConnectivitySnapshot();
      const integrityAlert = this.buildIntegrityAlert(
        beforeConnectivity,
        afterConnectivity,
      );

      await this.prisma.gedcomJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          summary: { ...result, integrityAlert },
        },
      });

      return { ...result, integrityAlert };
    } catch (error) {
      await this.prisma.gedcomJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private normalizeMode(mode: GedcomJobModeInput): 'IMPORT' | 'MERGE' {
    const normalized = mode.toString().toUpperCase();
    if (normalized === 'IMPORT' || normalized === 'MERGE') return normalized;
    throw new BadRequestException('mode must be import or merge');
  }

  private collectUniqueStagedPersons(persons: StagedPerson[]) {
    const map = new Map<string, StagedPerson>();
    for (const person of persons) map.set(person.pointer, person);
    return Array.from(map.values());
  }

  private defaultDecision(
    mode: 'IMPORT' | 'MERGE',
    stagedRow: { bestConfidence: number | null; bestExistingPersonId: string | null; pointer: string },
  ): MergeDecision {
    if (
      mode === 'MERGE' &&
      stagedRow.bestExistingPersonId &&
      (stagedRow.bestConfidence || 0) >= 70
    ) {
      return {
        stagedPointer: stagedRow.pointer,
        action: 'merge',
        mergeIntoPersonId: stagedRow.bestExistingPersonId,
      };
    }
    return { stagedPointer: stagedRow.pointer, action: 'create' };
  }

  private async persistDecision(
    tx: any,
    stagedPersonId: string,
    decision: MergeDecision,
    resultPersonId: string | null,
  ) {
    await tx.gedcomStagedPerson.update({
      where: { id: stagedPersonId },
      data: {
        decision: decision.action.toUpperCase(),
        mergeIntoPersonId: decision.action === 'merge' ? resultPersonId : null,
        createdPersonId: decision.action === 'create' ? resultPersonId : null,
      },
    });
  }

  private async mergePersonData(tx: any, personId: string, staged: StagedPerson) {
    const existing = await tx.person.findUnique({ where: { id: personId } });
    if (!existing) return;

    const updates: Record<string, any> = {};
    if (!existing.birthSurname && staged.surname) updates.birthSurname = staged.surname;
    if (!existing.usageSurname && staged.surname) updates.usageSurname = staged.surname;
    if (existing.gender === 'UNKNOWN' && staged.gender !== 'UNKNOWN') {
      updates.gender = staged.gender;
    }
    if (!existing.birthDate && staged.birthDate) {
      updates.birthDate = this.parseGedcomDate(staged.birthDate);
    }
    if (!existing.birthPlace && staged.birthPlace) updates.birthPlace = staged.birthPlace;
    if (!existing.deathDate && staged.deathDate) {
      updates.deathDate = this.parseGedcomDate(staged.deathDate);
    }
    if (!existing.deathPlace && staged.deathPlace) updates.deathPlace = staged.deathPlace;
    if (!existing.notes && staged.notes) updates.notes = staged.notes;

    const next = { ...existing, ...updates };
    Object.assign(updates, this.normalizedPersonFields({
      givenNames: next.givenNames,
      usageSurname: next.usageSurname,
      birthSurname: next.birthSurname,
      birthDate: next.birthDate,
      deathDate: next.deathDate,
    }));

    await tx.person.update({ where: { id: personId }, data: updates });
  }

  private async createPersonFromStaged(tx: any, staged: StagedPerson) {
    const birthDate = this.parseGedcomDate(staged.birthDate);
    const deathDate = this.parseGedcomDate(staged.deathDate);
    return tx.person.create({
      data: {
        givenNames: staged.givenNames || 'Unknown',
        birthSurname: staged.surname || null,
        usageSurname: staged.surname || null,
        gender: staged.gender,
        birthDate,
        birthPlace: staged.birthPlace || null,
        deathDate,
        deathPlace: staged.deathPlace || null,
        notes: staged.notes || null,
        ...this.normalizedPersonFields({
          givenNames: staged.givenNames || 'Unknown',
          usageSurname: staged.surname || null,
          birthSurname: staged.surname || null,
          birthDate,
          deathDate,
        }),
      },
    });
  }

  private async applyFamilies(
    tx: any,
    families: Array<
      Pick<StagedFamily, 'husbandPointer' | 'wifePointer' | 'childPointers' | 'marriagePlace'> & {
        marriageDate?: string | null;
        marriageDateRaw?: string | null;
      }
    >,
    pointerToUuid: Map<string, string>,
  ) {
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
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

    for (const family of families) {
      const partner1Id = family.husbandPointer
        ? pointerToUuid.get(family.husbandPointer)
        : null;
      const partner2Id = family.wifePointer
        ? pointerToUuid.get(family.wifePointer)
        : null;

      if (partner1Id && partner2Id && partner1Id !== partner2Id) {
        const key = pairKey(partner1Id, partner2Id);
        if (!unionCandidates.has(key)) {
          unionCandidates.set(key, {
            partner1Id,
            partner2Id,
            startDate: this.parseGedcomDate(
              family.marriageDateRaw ?? family.marriageDate,
            ),
            startPlace: family.marriagePlace || null,
          });
        }
      }

      const parentIds = [partner1Id, partner2Id].filter(
        (parentId): parentId is string => Boolean(parentId),
      );
      for (const childPointer of family.childPointers) {
        const childId = pointerToUuid.get(childPointer);
        if (!childId) continue;
        for (const parentId of parentIds) {
          relationshipCandidates.set(`${parentId}|${childId}`, {
            parentId,
            childId,
            type: 'BIOLOGICAL',
          });
        }
      }
    }

    let unionsCreated = 0;
    if (unionCandidates.size > 0) {
      const involvedIds = Array.from(
        new Set(
          Array.from(unionCandidates.values()).flatMap((union) => [
            union.partner1Id,
            union.partner2Id,
          ]),
        ),
      );
      const existingUnions = await tx.union.findMany({
        where: {
          OR: [
            { partner1Id: { in: involvedIds } },
            { partner2Id: { in: involvedIds } },
          ],
        },
        select: { partner1Id: true, partner2Id: true },
      });
      const existingKeys = new Set(
        existingUnions.map((union: any) =>
          pairKey(union.partner1Id, union.partner2Id),
        ),
      );
      const unionsToCreate = Array.from(unionCandidates.entries())
        .filter(([key]) => !existingKeys.has(key))
        .map(([, union]) => ({
          ...union,
          type: 'MARRIAGE' as const,
        }));
      if (unionsToCreate.length > 0) {
        const created = await tx.union.createMany({ data: unionsToCreate });
        unionsCreated = created.count;
      }
    }

    let relationshipsCreated = 0;
    if (relationshipCandidates.size > 0) {
      const created = await tx.relationship.createMany({
        data: Array.from(relationshipCandidates.values()),
        skipDuplicates: true,
      });
      relationshipsCreated = created.count;
    }

    return { relationshipsCreated, unionsCreated };
  }

  private toStagedDto(row: any): StagedPerson {
    return {
      pointer: row.pointer,
      givenNames: row.givenNames,
      surname: row.surname || '',
      gender: row.gender,
      birthDate: row.birthDateRaw,
      birthPlace: row.birthPlace,
      deathDate: row.deathDateRaw,
      deathPlace: row.deathPlace,
      notes: row.notes,
    };
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
        ? this.normalize(input.givenNames) || null
        : null,
      surnameNormalized: surname ? this.normalize(surname) || null : null,
      primaryNameNormalized:
        this.normalize([input.givenNames, surname].filter(Boolean).join(' ')) ||
        null,
      birthYear: input.birthDate?.getFullYear() || null,
      deathYear: input.deathDate?.getFullYear() || null,
    };
  }

  private buildIntegrityAlert(before: any, after: any) {
    const disconnectedDelta =
      after.disconnectedComponents - before.disconnectedComponents;
    const isolatedDelta = after.isolatedPersons - before.isolatedPersons;
    if (disconnectedDelta <= 0 && isolatedDelta <= 0) return null;

    return {
      type: 'GEDCOM_JOB_CONNECTIVITY_ALERT',
      message:
        `${disconnectedDelta > 0 ? `${disconnectedDelta} composant(s) deconnecte(s) cree(s). ` : ''}` +
        `${isolatedDelta > 0 ? `${isolatedDelta} personne(s) isolee(s) creee(s).` : ''}`,
      before,
      after,
    };
  }

  private normalize(str?: string | null) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractYear(value?: string | null) {
    if (!value) return null;
    const match = value.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    return match ? Number(match[1]) : null;
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
}
