// ══════════════════════════════════════
// Person Service
// ══════════════════════════════════════

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { Prisma } from '@prisma/client';

type IntegrityLinkMode = 'PARENT_OF_COMPONENT' | 'CHILD_OF_COMPONENT' | 'UNION';
type IntegrityRelationshipType = 'BIOLOGICAL' | 'ADOPTIVE' | 'FOSTER';
type IntegrityUnionType = 'MARRIAGE' | 'PACS' | 'PARTNERSHIP' | 'OTHER';

type QualityRules = {
  requireParentKnown: boolean;
  minBiologicalParentAge: number;
  maxBiologicalParentAge: number;
  maxLifespanYears: number;
};

type IntegritySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type IntegrityAnomaly = {
  id: string;
  code:
    | 'PERSON_DEATH_BEFORE_BIRTH'
    | 'PERSON_LIFESPAN_IMPLAUSIBLE'
    | 'PARENT_BORN_AFTER_CHILD'
    | 'BIO_PARENT_DEAD_BEFORE_CHILD_BIRTH'
    | 'BIO_PARENT_AGE_TOO_YOUNG'
    | 'BIO_PARENT_AGE_TOO_OLD'
    | 'UNION_END_BEFORE_START'
    | 'UNION_START_BEFORE_PARTNER_BIRTH'
    | 'UNION_END_BEFORE_PARTNER_BIRTH'
    | 'QUALITY_PARENT_REQUIRED';
  severity: IntegritySeverity;
  message: string;
  personIds: string[];
  relationshipId?: string;
  unionId?: string;
};

type AnchorSuggestion = {
  anchorPersonId: string;
  anchorLabel: string;
  confidence: number;
  reasons: string[];
};

type RepairLogAction =
  | 'REPAIR_ROOT_DEFAULT'
  | 'CONNECT_COMPONENT'
  | 'REMOVE_DISCONNECTED_COMPONENT'
  | 'UNDO_REPAIR';

type RepairLogEntry = {
  id: string;
  action: RepairLogAction;
  createdAt: string;
  createdBy: string;
  simulate: boolean;
  undoAvailable: boolean;
  undoneAt?: string;
  undoneBy?: string;
  undoneByLogId?: string;
  summary: string;
  payload: Record<string, unknown>;
};

type PersonHistoryEntry = {
  id: string;
  personId: string;
  eventType:
    | 'PERSON_CREATED'
    | 'PERSON_UPDATED'
    | 'PERSON_DELETED'
    | 'ROOT_CHANGED'
    | 'COMPONENT_CONNECTED'
    | 'COMPONENT_REMOVED'
    | 'PERSON_BRANCH_REMOVED'
    | 'TREE_CLEARED';
  actor: string;
  at: string;
  details?: Record<string, unknown>;
};

type TreeQualityViolation = {
  id: string;
  code: 'QUALITY_PARENT_REQUIRED';
  message: string;
  personId: string;
  severity: IntegritySeverity;
};

const TREE_QUALITY_RULES_KEY = 'TREE_QUALITY_RULES';
const TREE_REPAIR_LOGS_KEY = 'TREE_REPAIR_LOGS';
const PERSON_HISTORY_LOGS_KEY = 'PERSON_HISTORY_LOGS';
const DEFAULT_ACTOR = 'system';
const MAX_REPAIR_LOGS = 200;
const MAX_PERSON_HISTORY_LOGS = 5000;
const INTERACTIVE_TRANSACTION_MAX_WAIT_MS = 10_000;
const INTERACTIVE_TRANSACTION_TIMEOUT_MS = 600_000;

type IntegrityPersonSummary = {
  id: string;
  label: string;
  degree: number;
  isRootDefault: boolean;
  givenNames: string;
  usageSurname: string | null;
  birthSurname: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  birthPlace: string | null;
};

type IntegrityComponentInternal = {
  id: string;
  personIds: string[];
  size: number;
  representative: IntegrityPersonSummary;
  isolated: boolean;
  samplePeople: IntegrityPersonSummary[];
};

type IntegrityContext = {
  personsCount: number;
  relationshipsCount: number;
  unionsCount: number;
  isolatedCount: number;
  rootPersonId: string | null;
  rootDefaultIds: string[];
  personById: Map<string, IntegrityPersonSummary>;
  componentByPersonId: Map<string, string>;
  componentsById: Map<string, IntegrityComponentInternal>;
  components: IntegrityComponentInternal[];
  mainComponent: IntegrityComponentInternal | null;
  relationships: Array<{
    id: string;
    parentId: string;
    childId: string;
    type: IntegrityRelationshipType;
  }>;
  unions: Array<{
    id: string;
    partner1Id: string;
    partner2Id: string;
    type: IntegrityUnionType;
    startDate: Date | null;
    endDate: Date | null;
  }>;
};

@Injectable()
export class PersonService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto, actor = DEFAULT_ACTOR) {
    const birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    const deathDate = dto.deathDate ? new Date(dto.deathDate) : null;
    this.validatePersonChronology(birthDate, deathDate);
    const normalizedFields = this.buildNormalizedPersonFields({
      givenNames: dto.givenNames,
      usageSurname: dto.usageSurname,
      birthSurname: dto.birthSurname,
      birthDate,
      deathDate,
    });

    // If setting as root default, unset any existing root
    if (dto.isRootDefault) {
      await this.prisma.person.updateMany({
        where: { isRootDefault: true },
        data: { isRootDefault: false },
      });
    }

    const created = await this.prisma.person.create({
      data: {
        usageSurname: dto.usageSurname,
        birthSurname: dto.birthSurname,
        givenNames: dto.givenNames,
        gender: dto.gender || 'UNKNOWN',
        birthDate,
        birthPlace: dto.birthPlace,
        deathDate,
        deathPlace: dto.deathPlace,
        professions: dto.professions || [],
        notes: dto.notes,
        ...normalizedFields,
        nickname: dto.nickname,
        title: dto.title,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : null,
        baptismPlace: dto.baptismPlace,
        burialDate: dto.burialDate ? new Date(dto.burialDate) : null,
        burialPlace: dto.burialPlace,
        deathCause: dto.deathCause,
        religion: dto.religion,
        physicalDescription: dto.physicalDescription,
        nationality: dto.nationality,
        education: dto.education,
        residences: dto.residences || [],
        isRootDefault: dto.isRootDefault || false,
      },
    });

    await this.appendPersonHistory([
      {
        id: this.makeEventId('person-created'),
        personId: created.id,
        eventType: 'PERSON_CREATED',
        actor,
        at: new Date().toISOString(),
        details: {
          label: this.buildPersonLabel(created),
          isRootDefault: created.isRootDefault,
        },
      },
    ]);

    return created;
  }

  async findAll(page = 1, limit = 20) {
    const safePage = Number.isFinite(page)
      ? Math.max(1, Math.floor(page))
      : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(500, Math.max(1, Math.floor(limit)))
      : 20;
    const skip = (safePage - 1) * safeLimit;

    const [persons, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        skip,
        take: safeLimit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.person.count(),
    ]);

    return {
      data: persons,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findOne(id: string) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        parentRelationships: {
          include: {
            child: {
              include: {
                childRelationships: {
                  include: { parent: true },
                },
              },
            },
          },
        },
        childRelationships: {
          include: { parent: true },
        },
        unionsAsPartner1: {
          include: { partner2: true },
        },
        unionsAsPartner2: {
          include: { partner1: true },
        },
        documents: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person with ID "${id}" not found`);
    }

    return person;
  }

  async findRootDefault() {
    return this.prisma.person.findFirst({
      where: { isRootDefault: true },
    });
  }

  async update(id: string, dto: UpdatePersonDto, actor = DEFAULT_ACTOR) {
    // Verify person exists
    const existingPerson = await this.findOne(id);

    const nextBirthDate =
      dto.birthDate !== undefined
        ? (dto.birthDate ? new Date(dto.birthDate) : null)
        : existingPerson.birthDate;
    const nextDeathDate =
      dto.deathDate !== undefined
        ? (dto.deathDate ? new Date(dto.deathDate) : null)
        : existingPerson.deathDate;
    const nextGivenNames =
      dto.givenNames !== undefined ? dto.givenNames : existingPerson.givenNames;
    const nextUsageSurname =
      dto.usageSurname !== undefined ? dto.usageSurname : existingPerson.usageSurname;
    const nextBirthSurname =
      dto.birthSurname !== undefined ? dto.birthSurname : existingPerson.birthSurname;

    this.validatePersonChronology(nextBirthDate, nextDeathDate);

    // If setting as root default, unset any existing root
    if (dto.isRootDefault) {
      await this.prisma.person.updateMany({
        where: { isRootDefault: true, id: { not: id } },
        data: { isRootDefault: false },
      });
    }

    const data: Prisma.PersonUpdateInput = {};

    if (dto.usageSurname !== undefined) data.usageSurname = dto.usageSurname;
    if (dto.birthSurname !== undefined) data.birthSurname = dto.birthSurname;
    if (dto.givenNames !== undefined) data.givenNames = dto.givenNames;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthDate !== undefined)
      data.birthDate = nextBirthDate;
    if (dto.birthPlace !== undefined) data.birthPlace = dto.birthPlace;
    if (dto.deathDate !== undefined)
      data.deathDate = nextDeathDate;
    if (dto.deathPlace !== undefined) data.deathPlace = dto.deathPlace;
    if (dto.professions !== undefined) data.professions = dto.professions;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.baptismDate !== undefined) data.baptismDate = dto.baptismDate ? new Date(dto.baptismDate) : null;
    if (dto.baptismPlace !== undefined) data.baptismPlace = dto.baptismPlace;
    if (dto.burialDate !== undefined) data.burialDate = dto.burialDate ? new Date(dto.burialDate) : null;
    if (dto.burialPlace !== undefined) data.burialPlace = dto.burialPlace;
    if (dto.deathCause !== undefined) data.deathCause = dto.deathCause;
    if (dto.religion !== undefined) data.religion = dto.religion;
    if (dto.physicalDescription !== undefined) data.physicalDescription = dto.physicalDescription;
    if (dto.nationality !== undefined) data.nationality = dto.nationality;
    if (dto.education !== undefined) data.education = dto.education;
    if (dto.residences !== undefined) data.residences = dto.residences;
    if (dto.isRootDefault !== undefined)
      data.isRootDefault = dto.isRootDefault;
    Object.assign(
      data,
      this.buildNormalizedPersonFields({
        givenNames: nextGivenNames,
        usageSurname: nextUsageSurname,
        birthSurname: nextBirthSurname,
        birthDate: nextBirthDate,
        deathDate: nextDeathDate,
      }),
    );

    const updated = await this.prisma.person.update({
      where: { id },
      data,
    });

    await this.appendPersonHistory([
      {
        id: this.makeEventId('person-updated'),
        personId: updated.id,
        eventType: 'PERSON_UPDATED',
        actor,
        at: new Date().toISOString(),
        details: {
          before: {
            givenNames: existingPerson.givenNames,
            usageSurname: existingPerson.usageSurname,
            birthSurname: existingPerson.birthSurname,
            gender: existingPerson.gender,
            birthDate: existingPerson.birthDate?.toISOString() || null,
            deathDate: existingPerson.deathDate?.toISOString() || null,
            birthPlace: existingPerson.birthPlace,
            deathPlace: existingPerson.deathPlace,
            isRootDefault: existingPerson.isRootDefault,
          },
          after: {
            givenNames: updated.givenNames,
            usageSurname: updated.usageSurname,
            birthSurname: updated.birthSurname,
            gender: updated.gender,
            birthDate: updated.birthDate?.toISOString() || null,
            deathDate: updated.deathDate?.toISOString() || null,
            birthPlace: updated.birthPlace,
            deathPlace: updated.deathPlace,
            isRootDefault: updated.isRootDefault,
          },
        },
      },
    ]);

    return updated;
  }

  async remove(id: string, actor = DEFAULT_ACTOR) {
    const existing = await this.findOne(id);
    const deleted = await this.prisma.person.delete({ where: { id } });
    await this.ensureRootDefaultExists();

    await this.appendPersonHistory([
      {
        id: this.makeEventId('person-deleted'),
        personId: id,
        eventType: 'PERSON_DELETED',
        actor,
        at: new Date().toISOString(),
        details: {
          label: this.buildPersonLabel(existing),
          birthDate: existing.birthDate?.toISOString() || null,
          deathDate: existing.deathDate?.toISOString() || null,
        },
      },
    ]);

    return deleted;
  }

  async removeBranch(
    rootId: string,
    includeRoot = true,
    actor = DEFAULT_ACTOR,
    simulate = false,
  ) {
    await this.findOne(rootId);

    const descendantIds = await this.getDescendantIds(rootId);
    const targetIds = Array.from(
      new Set(includeRoot ? [rootId, ...descendantIds] : descendantIds),
    );

    if (targetIds.length === 0) {
      return {
        rootPersonId: rootId,
        personsDeleted: 0,
        relationshipsDeleted: 0,
        unionsDeleted: 0,
        documentsDeleted: 0,
        includeRoot,
        simulated: simulate,
        affectedPersonIds: [],
      };
    }

    const deletionPlan = await this.computeDeletionPlan(targetIds);

    if (simulate) {
      return {
        rootPersonId: rootId,
        personsDeleted: deletionPlan.personsToDelete,
        relationshipsDeleted: deletionPlan.relationshipsToDelete,
        unionsDeleted: deletionPlan.unionsToDelete,
        documentsDeleted: deletionPlan.documentsToDelete,
        includeRoot,
        simulated: true,
        affectedPersonIds: targetIds,
      };
    }

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(
      async (tx) => {
        const documentsResult = await tx.document.deleteMany({ where: deletionPlan.documentsDeleteWhere });
        const personsResult = await tx.person.deleteMany({ where: { id: { in: targetIds } } });
        return [documentsResult.count, personsResult.count] as const;
      },
      {
        maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
        timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      },
    );

    await this.ensureRootDefaultExists();

    await this.appendPersonHistory([
      {
        id: this.makeEventId('person-branch-removed'),
        personId: rootId,
        eventType: 'PERSON_BRANCH_REMOVED',
        actor,
        at: new Date().toISOString(),
        details: {
          includeRoot,
          personsDeleted,
          relationshipsDeleted: deletionPlan.relationshipsToDelete,
          unionsDeleted: deletionPlan.unionsToDelete,
          documentsDeleted,
        },
      },
    ]);

    return {
      rootPersonId: rootId,
      personsDeleted,
      relationshipsDeleted: deletionPlan.relationshipsToDelete,
      unionsDeleted: deletionPlan.unionsToDelete,
      documentsDeleted,
      includeRoot,
      simulated: false,
      affectedPersonIds: targetIds,
    };
  }

  async removeAll(actor = DEFAULT_ACTOR) {
    const [personsBefore, relationshipsBefore, unionsBefore] = await this.prisma.$transaction([
      this.prisma.person.count(),
      this.prisma.relationship.count(),
      this.prisma.union.count(),
    ]);

    if (personsBefore === 0) {
      return {
        personsDeleted: 0,
        relationshipsDeleted: 0,
        unionsDeleted: 0,
        documentsDeleted: 0,
      };
    }

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(
      async (tx) => {
        const documentsResult = await tx.document.deleteMany({});
        const personsResult = await tx.person.deleteMany({});
        return [documentsResult.count, personsResult.count] as const;
      },
      {
        maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
        timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      },
    );

    await this.appendPersonHistory([
      {
        id: this.makeEventId('tree-cleared'),
        personId: 'TREE',
        eventType: 'TREE_CLEARED',
        actor,
        at: new Date().toISOString(),
        details: {
          personsDeleted,
          relationshipsDeleted: relationshipsBefore,
          unionsDeleted: unionsBefore,
          documentsDeleted,
        },
      },
    ]);

    return {
      personsDeleted,
      relationshipsDeleted: relationshipsBefore,
      unionsDeleted: unionsBefore,
      documentsDeleted,
    };
  }

  async getIntegrityReport() {
    const [context, qualityRules, repairLogs] = await Promise.all([
      this.buildIntegrityContext(),
      this.getQualityRules(),
      this.getRepairLogs(20),
    ]);

    const rootSummary = context.rootPersonId
      ? context.personById.get(context.rootPersonId) || null
      : null;
    const rootInMainComponent = Boolean(
      context.rootPersonId &&
      context.mainComponent &&
      context.componentByPersonId.get(context.rootPersonId) === context.mainComponent.id,
    );

    const anomalies = this.collectTemporalAnomalies(context, qualityRules);
    const qualityViolations = this.collectQualityViolations(context, qualityRules);

    const disconnectedComponents = context.mainComponent
      ? context.components
          .filter((component) => component.id !== context.mainComponent!.id)
          .map((component) => {
            const anchorSuggestions = this.buildAnchorSuggestions(
              component,
              context.mainComponent!,
              context,
            );

            return {
              id: component.id,
              size: component.size,
              isolated: component.isolated,
              representativePersonId: component.representative.id,
              representativeLabel: component.representative.label,
              samplePeople: component.samplePeople,
              anchorSuggestions,
            };
          })
      : [];

    const suggestions: string[] = [];

    if (!context.rootPersonId && context.mainComponent) {
      suggestions.push(
        'Aucune personne racine par défaut n\'est définie: appliquez la correction automatique de racine.',
      );
    }

    if (
      context.rootPersonId &&
      context.mainComponent &&
      context.componentByPersonId.get(context.rootPersonId) !== context.mainComponent.id
    ) {
      suggestions.push(
        'La racine actuelle est dans un composant secondaire: recalez la racine sur le composant principal.',
      );
    }

    if (disconnectedComponents.length > 0) {
      suggestions.push(
        `${disconnectedComponents.length} composant(s) déconnecté(s) détecté(s): rattachez-les ou supprimez-les.`,
      );
    }

    if (context.isolatedCount > 0) {
      suggestions.push(
        `${context.isolatedCount} personne(s) totalement isolée(s): vérifiez les imports GEDCOM incomplets.`,
      );
    }

    if (anomalies.length > 0) {
      suggestions.push(
        `${anomalies.length} incohérence(s) temporelle(s) détectée(s): corrigez les dates problématiques.`,
      );
    }

    if (qualityViolations.length > 0) {
      suggestions.push(
        `${qualityViolations.length} violation(s) de règles qualité détectée(s).`,
      );
    }

    const healthGraphNodes = context.components.map((component) => {
      const suggestionsForComponent = disconnectedComponents.find(
        (item) => item.id === component.id,
      )?.anchorSuggestions;

      return {
        id: component.id,
        label: component.representative.label,
        size: component.size,
        isMain: context.mainComponent?.id === component.id,
        isolated: component.isolated,
        representativePersonId: component.representative.id,
        bestSuggestionConfidence:
          suggestionsForComponent && suggestionsForComponent.length > 0
            ? suggestionsForComponent[0].confidence
            : null,
      };
    });

    const healthGraphEdges = disconnectedComponents
      .filter((component) => component.anchorSuggestions.length > 0 && context.mainComponent)
      .map((component) => ({
        from: component.id,
        to: context.mainComponent!.id,
        confidence: component.anchorSuggestions[0].confidence,
      }));

    return {
      generatedAt: new Date().toISOString(),
      totalPersons: context.personsCount,
      totalRelationships: context.relationshipsCount,
      totalUnions: context.unionsCount,
      connectedComponents: context.components.length,
      isolatedPersons: context.isolatedCount,
      root: {
        personId: context.rootPersonId,
        label: rootSummary?.label || null,
        inMainComponent: rootInMainComponent,
      },
      mainComponent: context.mainComponent
        ? {
            id: context.mainComponent.id,
            size: context.mainComponent.size,
            representativePersonId: context.mainComponent.representative.id,
            representativeLabel: context.mainComponent.representative.label,
            samplePeople: context.mainComponent.samplePeople,
          }
        : null,
      disconnectedComponents,
      anomalies,
      qualityRules,
      qualityViolations,
      healthGraph: {
        nodes: healthGraphNodes,
        edges: healthGraphEdges,
      },
      repairLogsPreview: repairLogs,
      suggestions,
    };
  }

  async getQualityRules(): Promise<QualityRules> {
    const persisted = await this.getJsonSetting<Partial<QualityRules>>(
      TREE_QUALITY_RULES_KEY,
      {},
    );

    return {
      requireParentKnown: Boolean(persisted.requireParentKnown),
      minBiologicalParentAge: this.clampNumber(persisted.minBiologicalParentAge, 12, 10, 35),
      maxBiologicalParentAge: this.clampNumber(persisted.maxBiologicalParentAge, 80, 40, 120),
      maxLifespanYears: this.clampNumber(persisted.maxLifespanYears, 120, 60, 140),
    };
  }

  async updateQualityRules(
    input: Partial<QualityRules>,
    actor = DEFAULT_ACTOR,
  ): Promise<QualityRules> {
    const current = await this.getQualityRules();

    const next: QualityRules = {
      requireParentKnown:
        input.requireParentKnown === undefined
          ? current.requireParentKnown
          : Boolean(input.requireParentKnown),
      minBiologicalParentAge: this.clampNumber(
        input.minBiologicalParentAge,
        current.minBiologicalParentAge,
        10,
        35,
      ),
      maxBiologicalParentAge: this.clampNumber(
        input.maxBiologicalParentAge,
        current.maxBiologicalParentAge,
        40,
        120,
      ),
      maxLifespanYears: this.clampNumber(
        input.maxLifespanYears,
        current.maxLifespanYears,
        60,
        140,
      ),
    };

    if (next.minBiologicalParentAge >= next.maxBiologicalParentAge) {
      throw new BadRequestException(
        'La règle minBiologicalParentAge doit être inférieure à maxBiologicalParentAge.',
      );
    }

    await this.setJsonSetting(TREE_QUALITY_RULES_KEY, next);

    await this.appendRepairLogs([
      {
        id: this.makeEventId('quality-rules-update'),
        action: 'UNDO_REPAIR',
        createdAt: new Date().toISOString(),
        createdBy: actor,
        simulate: false,
        undoAvailable: false,
        summary: 'Mise à jour des règles qualité',
        payload: {
          kind: 'QUALITY_RULES',
          previous: current,
          next,
        },
      },
    ]);

    return next;
  }

  async getRepairLogs(limit = 100): Promise<RepairLogEntry[]> {
    const logs = await this.getJsonSetting<RepairLogEntry[]>(TREE_REPAIR_LOGS_KEY, []);
    return [...logs].reverse().slice(0, Math.max(1, Math.min(500, limit)));
  }

  async undoRepairLog(
    logId: string,
    actor = DEFAULT_ACTOR,
    simulate = false,
  ) {
    const logs = await this.getJsonSetting<RepairLogEntry[]>(TREE_REPAIR_LOGS_KEY, []);
    const targetIndex = logs.findIndex((entry) => entry.id === logId);
    if (targetIndex < 0) {
      throw new NotFoundException(`Repair log with ID "${logId}" not found`);
    }

    const target = logs[targetIndex];
    if (!target.undoAvailable) {
      throw new BadRequestException('Cette action de réparation ne peut pas être annulée.');
    }

    if (target.undoneAt) {
      throw new BadRequestException('Cette action a déjà été annulée.');
    }

    if (target.action === 'REPAIR_ROOT_DEFAULT') {
      const previousRootIds = Array.isArray(target.payload.previousRootIds)
        ? (target.payload.previousRootIds as string[])
        : [];

      if (simulate) {
        return {
          changed: true,
          simulated: true,
          logId,
          action: target.action,
          restoreRootIds: previousRootIds,
        };
      }

      await this.prisma.$transaction(
        async (tx) => {
          await tx.person.updateMany({
            where: { isRootDefault: true },
            data: { isRootDefault: false },
          });

          if (previousRootIds.length > 0) {
            await tx.person.updateMany({
              where: { id: { in: previousRootIds } },
              data: { isRootDefault: true },
            });
          }
        },
        {
          maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
          timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
        },
      );

      await this.ensureRootDefaultExists();

      const undoLogId = this.makeEventId('undo-repair-root');
      const now = new Date().toISOString();

      logs[targetIndex] = {
        ...target,
        undoneAt: now,
        undoneBy: actor,
        undoneByLogId: undoLogId,
      };

      logs.push({
        id: undoLogId,
        action: 'UNDO_REPAIR',
        createdAt: now,
        createdBy: actor,
        simulate: false,
        undoAvailable: false,
        summary: `Annulation de ${target.summary}`,
        payload: {
          targetLogId: target.id,
          restoredRootIds: previousRootIds,
        },
      });

      await this.setJsonSetting(TREE_REPAIR_LOGS_KEY, logs.slice(-MAX_REPAIR_LOGS));

      return {
        changed: true,
        simulated: false,
        action: target.action,
        undoLogId,
      };
    }

    if (target.action === 'CONNECT_COMPONENT') {
      const linkKind = String(target.payload.linkKind || '');
      const linkId = String(target.payload.linkId || '');
      if (!linkId || (linkKind !== 'UNION' && linkKind !== 'RELATIONSHIP')) {
        throw new BadRequestException('Journal de réparation invalide: lien manquant.');
      }

      if (simulate) {
        return {
          changed: true,
          simulated: true,
          logId,
          action: target.action,
          linkKind,
          linkId,
        };
      }

      if (linkKind === 'UNION') {
        await this.prisma.union.delete({ where: { id: linkId } });
      } else {
        await this.prisma.relationship.delete({ where: { id: linkId } });
      }

      const undoLogId = this.makeEventId('undo-connect-component');
      const now = new Date().toISOString();

      logs[targetIndex] = {
        ...target,
        undoneAt: now,
        undoneBy: actor,
        undoneByLogId: undoLogId,
      };

      logs.push({
        id: undoLogId,
        action: 'UNDO_REPAIR',
        createdAt: now,
        createdBy: actor,
        simulate: false,
        undoAvailable: false,
        summary: `Annulation de ${target.summary}`,
        payload: {
          targetLogId: target.id,
          linkKind,
          linkId,
        },
      });

      await this.setJsonSetting(TREE_REPAIR_LOGS_KEY, logs.slice(-MAX_REPAIR_LOGS));

      return {
        changed: true,
        simulated: false,
        action: target.action,
        undoLogId,
      };
    }

    throw new BadRequestException('Ce type d\'action ne supporte pas l\'annulation.');
  }

  async getPersonHistory(personId: string, limit = 120) {
    const logs = await this.getJsonSetting<PersonHistoryEntry[]>(PERSON_HISTORY_LOGS_KEY, []);
    const filtered = logs
      .filter((entry) => entry.personId === personId)
      .slice(-Math.max(1, Math.min(500, limit)));
    return [...filtered].reverse();
  }

  async repairRootDefaultToMainComponent(options?: {
    simulate?: boolean;
    actor?: string;
  }) {
    const simulate = Boolean(options?.simulate);
    const actor = options?.actor || DEFAULT_ACTOR;

    const context = await this.buildIntegrityContext();

    if (!context.mainComponent) {
      return {
        changed: false,
        simulated: simulate,
        reason: 'No persons available',
      };
    }

    let targetRootId = context.rootPersonId;
    const currentRootInMain = Boolean(
      targetRootId &&
      context.componentByPersonId.get(targetRootId) === context.mainComponent.id,
    );

    if (!targetRootId || !currentRootInMain) {
      targetRootId = context.mainComponent.representative.id;
    }

    if (!targetRootId) {
      return {
        changed: false,
        simulated: simulate,
        reason: 'No candidate root found',
      };
    }

    const alreadyConsistent =
      context.rootDefaultIds.length === 1 && context.rootDefaultIds[0] === targetRootId;

    if (alreadyConsistent) {
      return {
        changed: false,
        simulated: simulate,
        personId: targetRootId,
        label: context.personById.get(targetRootId)?.label || null,
      };
    }

    if (!simulate) {
      await this.prisma.$transaction([
        this.prisma.person.updateMany({
          where: { isRootDefault: true },
          data: { isRootDefault: false },
        }),
        this.prisma.person.update({
          where: { id: targetRootId },
          data: { isRootDefault: true },
        }),
      ]);

      const logId = this.makeEventId('repair-root-default');
      await this.appendRepairLogs([
        {
          id: logId,
          action: 'REPAIR_ROOT_DEFAULT',
          createdAt: new Date().toISOString(),
          createdBy: actor,
          simulate: false,
          undoAvailable: true,
          summary: `Racine par défaut déplacée vers ${context.personById.get(targetRootId)?.label || targetRootId}`,
          payload: {
            previousRootIds: context.rootDefaultIds,
            newRootId: targetRootId,
          },
        },
      ]);

      await this.appendPersonHistory([
        {
          id: this.makeEventId('person-root-changed'),
          personId: targetRootId,
          eventType: 'ROOT_CHANGED',
          actor,
          at: new Date().toISOString(),
          details: {
            previousRootIds: context.rootDefaultIds,
            newRootId: targetRootId,
          },
        },
      ]);
    }

    return {
      changed: true,
      simulated: simulate,
      previousRootIds: context.rootDefaultIds,
      personId: targetRootId,
      label: context.personById.get(targetRootId)?.label || null,
    };
  }

  async connectDisconnectedComponent(input: {
    componentPersonId: string;
    anchorPersonId?: string;
    linkMode?: IntegrityLinkMode;
    relationshipType?: IntegrityRelationshipType;
    unionType?: IntegrityUnionType;
    simulate?: boolean;
    actor?: string;
  }) {
    const linkMode = input.linkMode || 'PARENT_OF_COMPONENT';
    const relationshipType = input.relationshipType || 'FOSTER';
    const unionType = input.unionType || 'OTHER';
    const simulate = Boolean(input.simulate);
    const actor = input.actor || DEFAULT_ACTOR;

    const context = await this.buildIntegrityContext();
    if (!context.mainComponent) {
      throw new BadRequestException('Impossible de rattacher un composant: arbre vide.');
    }

    const componentId = context.componentByPersonId.get(input.componentPersonId);
    if (!componentId) {
      throw new NotFoundException(`Person with ID "${input.componentPersonId}" not found`);
    }

    if (componentId === context.mainComponent.id) {
      throw new BadRequestException(
        'Cette personne est déjà dans le composant principal.',
      );
    }

    const targetComponent = context.componentsById.get(componentId);
    if (!targetComponent) {
      throw new BadRequestException('Composant cible introuvable.');
    }

    let anchorPersonId = input.anchorPersonId?.trim() || null;
    if (!anchorPersonId) {
      const rootInMain =
        context.rootPersonId &&
        context.componentByPersonId.get(context.rootPersonId) === context.mainComponent.id;

      anchorPersonId = rootInMain
        ? context.rootPersonId
        : context.mainComponent.representative.id;
    }

    if (!anchorPersonId) {
      throw new BadRequestException('Aucune personne d\'ancrage disponible.');
    }

    const anchorComponentId = context.componentByPersonId.get(anchorPersonId);
    if (anchorComponentId !== context.mainComponent.id) {
      throw new BadRequestException(
        'La personne d\'ancrage doit appartenir au composant principal.',
      );
    }

    if (anchorPersonId === input.componentPersonId) {
      throw new BadRequestException('Impossible de relier une personne à elle-même.');
    }

    if (linkMode === 'UNION') {
      const existingUnion = await this.prisma.union.findFirst({
        where: {
          OR: [
            { partner1Id: anchorPersonId, partner2Id: input.componentPersonId },
            { partner1Id: input.componentPersonId, partner2Id: anchorPersonId },
          ],
        },
        select: { id: true },
      });

      if (existingUnion) {
        throw new BadRequestException('Une union existe déjà entre ces deux personnes.');
      }

      if (simulate) {
        return {
          created: 'UNION',
          simulated: true,
          anchorPersonId,
          componentPersonId: input.componentPersonId,
          componentId: targetComponent.id,
          componentSize: targetComponent.size,
          unionType,
        };
      }

      const createdUnion = await this.prisma.union.create({
        data: {
          partner1Id: anchorPersonId,
          partner2Id: input.componentPersonId,
          type: unionType,
        },
      });

      await this.appendRepairLogs([
        {
          id: this.makeEventId('connect-component-union'),
          action: 'CONNECT_COMPONENT',
          createdAt: new Date().toISOString(),
          createdBy: actor,
          simulate: false,
          undoAvailable: true,
          summary: `Rattachement composant ${targetComponent.id} via union`,
          payload: {
            linkKind: 'UNION',
            linkId: createdUnion.id,
            componentId: targetComponent.id,
            anchorPersonId,
            componentPersonId: input.componentPersonId,
          },
        },
      ]);

      await this.appendPersonHistory([
        {
          id: this.makeEventId('component-connected-union'),
          personId: input.componentPersonId,
          eventType: 'COMPONENT_CONNECTED',
          actor,
          at: new Date().toISOString(),
          details: {
            mode: 'UNION',
            anchorPersonId,
            unionId: createdUnion.id,
          },
        },
      ]);

      return {
        created: 'UNION',
        simulated: false,
        anchorPersonId,
        componentPersonId: input.componentPersonId,
        componentId: targetComponent.id,
        componentSize: targetComponent.size,
        linkId: createdUnion.id,
      };
    }

    const parentId =
      linkMode === 'PARENT_OF_COMPONENT' ? anchorPersonId : input.componentPersonId;
    const childId =
      linkMode === 'PARENT_OF_COMPONENT' ? input.componentPersonId : anchorPersonId;

    const existingRelationship = await this.prisma.relationship.findFirst({
      where: {
        parentId,
        childId,
      },
      select: { id: true },
    });

    if (existingRelationship) {
      throw new BadRequestException(
        'Cette relation parent-enfant existe déjà entre ces deux personnes.',
      );
    }

    if (simulate) {
      return {
        created: 'RELATIONSHIP',
        simulated: true,
        anchorPersonId,
        componentPersonId: input.componentPersonId,
        componentId: targetComponent.id,
        componentSize: targetComponent.size,
        linkMode,
        relationshipType,
      };
    }

    const createdRelationship = await this.prisma.relationship.create({
      data: {
        parentId,
        childId,
        type: relationshipType,
      },
    });

    await this.appendRepairLogs([
      {
        id: this.makeEventId('connect-component-relationship'),
        action: 'CONNECT_COMPONENT',
        createdAt: new Date().toISOString(),
        createdBy: actor,
        simulate: false,
        undoAvailable: true,
        summary: `Rattachement composant ${targetComponent.id} via parenté`,
        payload: {
          linkKind: 'RELATIONSHIP',
          linkId: createdRelationship.id,
          componentId: targetComponent.id,
          anchorPersonId,
          componentPersonId: input.componentPersonId,
          linkMode,
          relationshipType,
        },
      },
    ]);

    await this.appendPersonHistory([
      {
        id: this.makeEventId('component-connected-relationship'),
        personId: input.componentPersonId,
        eventType: 'COMPONENT_CONNECTED',
        actor,
        at: new Date().toISOString(),
        details: {
          mode: linkMode,
          anchorPersonId,
          relationshipType,
          relationshipId: createdRelationship.id,
        },
      },
    ]);

    return {
      created: 'RELATIONSHIP',
      simulated: false,
      anchorPersonId,
      componentPersonId: input.componentPersonId,
      componentId: targetComponent.id,
      componentSize: targetComponent.size,
      linkId: createdRelationship.id,
      linkMode,
      relationshipType,
    };
  }

  async removeDisconnectedComponent(
    personId: string,
    options?: { simulate?: boolean; actor?: string },
  ) {
    const simulate = Boolean(options?.simulate);
    const actor = options?.actor || DEFAULT_ACTOR;

    const context = await this.buildIntegrityContext();

    if (!context.mainComponent) {
      throw new BadRequestException('Impossible de supprimer un composant: arbre vide.');
    }

    const componentId = context.componentByPersonId.get(personId);
    if (!componentId) {
      throw new NotFoundException(`Person with ID "${personId}" not found`);
    }

    if (componentId === context.mainComponent.id) {
      throw new BadRequestException(
        'Suppression refusée: cette personne appartient au composant principal.',
      );
    }

    const component = context.componentsById.get(componentId);
    if (!component) {
      throw new BadRequestException('Composant cible introuvable.');
    }

    const targetIds = component.personIds;
    const deletionPlan = await this.computeDeletionPlan(targetIds);

    if (simulate) {
      return {
        componentId: component.id,
        componentSize: component.size,
        personsDeleted: deletionPlan.personsToDelete,
        relationshipsDeleted: deletionPlan.relationshipsToDelete,
        unionsDeleted: deletionPlan.unionsToDelete,
        documentsDeleted: deletionPlan.documentsToDelete,
        simulated: true,
      };
    }

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(
      async (tx) => {
        const documentsResult = await tx.document.deleteMany({
          where: deletionPlan.documentsDeleteWhere,
        });
        const personsResult = await tx.person.deleteMany({ where: { id: { in: targetIds } } });
        return [documentsResult.count, personsResult.count] as const;
      },
      {
        maxWait: INTERACTIVE_TRANSACTION_MAX_WAIT_MS,
        timeout: INTERACTIVE_TRANSACTION_TIMEOUT_MS,
      },
    );

    await this.ensureRootDefaultExists();

    await this.appendRepairLogs([
      {
        id: this.makeEventId('remove-disconnected-component'),
        action: 'REMOVE_DISCONNECTED_COMPONENT',
        createdAt: new Date().toISOString(),
        createdBy: actor,
        simulate: false,
        undoAvailable: false,
        summary: `Suppression du ${component.id}`,
        payload: {
          componentId: component.id,
          componentSize: component.size,
          representativePersonId: component.representative.id,
          personsDeleted,
          relationshipsDeleted: deletionPlan.relationshipsToDelete,
          unionsDeleted: deletionPlan.unionsToDelete,
          documentsDeleted,
        },
      },
    ]);

    await this.appendPersonHistory([
      {
        id: this.makeEventId('component-removed'),
        personId: component.representative.id,
        eventType: 'COMPONENT_REMOVED',
        actor,
        at: new Date().toISOString(),
        details: {
          componentId: component.id,
          personsDeleted,
          relationshipsDeleted: deletionPlan.relationshipsToDelete,
          unionsDeleted: deletionPlan.unionsToDelete,
          documentsDeleted,
        },
      },
    ]);

    return {
      componentId: component.id,
      componentSize: component.size,
      personsDeleted,
      relationshipsDeleted: deletionPlan.relationshipsToDelete,
      unionsDeleted: deletionPlan.unionsToDelete,
      documentsDeleted,
      simulated: false,
    };
  }

  private async buildIntegrityContext(): Promise<IntegrityContext> {
    const [persons, relationships, unions] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        select: {
          id: true,
          givenNames: true,
          usageSurname: true,
          birthSurname: true,
          isRootDefault: true,
          birthDate: true,
          deathDate: true,
          birthPlace: true,
        },
      }),
      this.prisma.relationship.findMany({
        select: {
          id: true,
          parentId: true,
          childId: true,
          type: true,
        },
      }),
      this.prisma.union.findMany({
        select: {
          id: true,
          partner1Id: true,
          partner2Id: true,
          type: true,
          startDate: true,
          endDate: true,
        },
      }),
    ]);

    const personById = new Map<string, IntegrityPersonSummary>();
    const adjacency = new Map<string, Set<string>>();

    for (const person of persons) {
      const label = this.buildPersonLabel(person);
      personById.set(person.id, {
        id: person.id,
        label,
        degree: 0,
        isRootDefault: person.isRootDefault,
        givenNames: person.givenNames,
        usageSurname: person.usageSurname,
        birthSurname: person.birthSurname,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        birthPlace: person.birthPlace,
      });
      adjacency.set(person.id, new Set<string>());
    }

    for (const relationship of relationships) {
      const parentNeighbors = adjacency.get(relationship.parentId);
      const childNeighbors = adjacency.get(relationship.childId);
      if (!parentNeighbors || !childNeighbors) continue;

      parentNeighbors.add(relationship.childId);
      childNeighbors.add(relationship.parentId);
    }

    for (const union of unions) {
      const partner1Neighbors = adjacency.get(union.partner1Id);
      const partner2Neighbors = adjacency.get(union.partner2Id);
      if (!partner1Neighbors || !partner2Neighbors) continue;

      partner1Neighbors.add(union.partner2Id);
      partner2Neighbors.add(union.partner1Id);
    }

    for (const [personId, neighbors] of adjacency.entries()) {
      const summary = personById.get(personId);
      if (!summary) continue;
      summary.degree = neighbors.size;
    }

    const visited = new Set<string>();
    const componentByPersonId = new Map<string, string>();
    const components: IntegrityComponentInternal[] = [];

    for (const person of persons) {
      if (visited.has(person.id)) continue;

      const queue = [person.id];
      const componentPersonIds: string[] = [];
      visited.add(person.id);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        componentPersonIds.push(currentId);

        const neighbors = adjacency.get(currentId) || new Set<string>();
        for (const neighborId of neighbors) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }

      const representative = this.pickComponentRepresentative(componentPersonIds, personById);
      const isolated =
        componentPersonIds.length === 1 &&
        (personById.get(componentPersonIds[0])?.degree || 0) === 0;

      const samplePeople = componentPersonIds
        .map((personId) => personById.get(personId))
        .filter((person): person is IntegrityPersonSummary => Boolean(person))
        .sort((a, b) => {
          if (b.degree !== a.degree) return b.degree - a.degree;
          return a.label.localeCompare(b.label, 'fr');
        })
        .slice(0, 8);

      const component: IntegrityComponentInternal = {
        id: `component-${components.length + 1}`,
        personIds: componentPersonIds,
        size: componentPersonIds.length,
        representative,
        isolated,
        samplePeople,
      };

      components.push(component);
      for (const personId of componentPersonIds) {
        componentByPersonId.set(personId, component.id);
      }
    }

    const rootDefaultIds = persons
      .filter((person) => person.isRootDefault)
      .map((person) => person.id);
    const rootPersonId = rootDefaultIds[0] || null;

    let mainComponent: IntegrityComponentInternal | null = null;
    for (const component of components) {
      if (!mainComponent) {
        mainComponent = component;
        continue;
      }

      if (component.size > mainComponent.size) {
        mainComponent = component;
        continue;
      }

      if (component.size < mainComponent.size) {
        continue;
      }

      if (rootPersonId) {
        const rootInCurrent = componentByPersonId.get(rootPersonId) === component.id;
        const rootInMain = componentByPersonId.get(rootPersonId) === mainComponent.id;
        if (rootInCurrent && !rootInMain) {
          mainComponent = component;
          continue;
        }
      }

      if (component.id < mainComponent.id) {
        mainComponent = component;
      }
    }

    const componentsById = new Map<string, IntegrityComponentInternal>(
      components.map((component) => [component.id, component]),
    );

    const isolatedCount = components.reduce(
      (acc, component) => acc + (component.isolated ? component.size : 0),
      0,
    );

    return {
      personsCount: persons.length,
      relationshipsCount: relationships.length,
      unionsCount: unions.length,
      isolatedCount,
      rootPersonId,
      rootDefaultIds,
      personById,
      componentByPersonId,
      componentsById,
      components,
      mainComponent,
      relationships: relationships.map((relationship) => ({
        id: relationship.id,
        parentId: relationship.parentId,
        childId: relationship.childId,
        type: relationship.type as IntegrityRelationshipType,
      })),
      unions: unions.map((union) => ({
        id: union.id,
        partner1Id: union.partner1Id,
        partner2Id: union.partner2Id,
        type: union.type as IntegrityUnionType,
        startDate: union.startDate,
        endDate: union.endDate,
      })),
    };
  }

  private buildPersonLabel(person: {
    givenNames: string;
    usageSurname: string | null;
    birthSurname: string | null;
  }) {
    const surname = person.usageSurname || person.birthSurname || '';
    return `${person.givenNames}${surname ? ` ${surname}` : ''}`.trim();
  }

  private pickComponentRepresentative(
    personIds: string[],
    personById: Map<string, IntegrityPersonSummary>,
  ) {
    const ordered = personIds
      .map((personId) => personById.get(personId))
      .filter((person): person is IntegrityPersonSummary => Boolean(person))
      .sort((a, b) => {
        if (b.degree !== a.degree) return b.degree - a.degree;
        return a.label.localeCompare(b.label, 'fr');
      });

    if (ordered.length === 0) {
      throw new BadRequestException('Unable to resolve component representative.');
    }

    return ordered[0];
  }

  async getConnectivitySnapshot() {
    const context = await this.buildIntegrityContext();
    const disconnectedComponents = context.mainComponent
      ? context.components.filter((component) => component.id !== context.mainComponent!.id)
      : [];

    return {
      totalPersons: context.personsCount,
      connectedComponents: context.components.length,
      disconnectedComponents: disconnectedComponents.length,
      isolatedPersons: context.isolatedCount,
      mainComponentSize: context.mainComponent?.size || 0,
    };
  }

  private collectTemporalAnomalies(
    context: IntegrityContext,
    qualityRules: QualityRules,
  ): IntegrityAnomaly[] {
    const anomalies: IntegrityAnomaly[] = [];

    for (const person of context.personById.values()) {
      if (person.birthDate && person.deathDate && person.deathDate < person.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-person-death-before-birth'),
          code: 'PERSON_DEATH_BEFORE_BIRTH',
          severity: 'HIGH',
          message: `${person.label}: décès antérieur à la naissance.`,
          personIds: [person.id],
        });
      }

      if (person.birthDate && person.deathDate) {
        const years = this.yearDiff(person.birthDate, person.deathDate);
        if (years > qualityRules.maxLifespanYears) {
          anomalies.push({
            id: this.makeEventId('anomaly-person-lifespan'),
            code: 'PERSON_LIFESPAN_IMPLAUSIBLE',
            severity: 'MEDIUM',
            message: `${person.label}: longévité de ${years} ans (limite ${qualityRules.maxLifespanYears}).`,
            personIds: [person.id],
          });
        }
      }
    }

    for (const relationship of context.relationships) {
      const parent = context.personById.get(relationship.parentId);
      const child = context.personById.get(relationship.childId);
      if (!parent || !child) continue;

      if (parent.birthDate && child.birthDate && parent.birthDate > child.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-parent-born-after-child'),
          code: 'PARENT_BORN_AFTER_CHILD',
          severity: 'HIGH',
          message: `${parent.label} est né après ${child.label}.`,
          personIds: [parent.id, child.id],
          relationshipId: relationship.id,
        });
      }

      if (
        relationship.type === 'BIOLOGICAL' &&
        parent.deathDate &&
        child.birthDate &&
        parent.deathDate < child.birthDate
      ) {
        anomalies.push({
          id: this.makeEventId('anomaly-bio-parent-dead-before-child'),
          code: 'BIO_PARENT_DEAD_BEFORE_CHILD_BIRTH',
          severity: 'HIGH',
          message: `${parent.label} est décédé avant la naissance de ${child.label}.`,
          personIds: [parent.id, child.id],
          relationshipId: relationship.id,
        });
      }

      if (relationship.type === 'BIOLOGICAL' && parent.birthDate && child.birthDate) {
        const ageAtBirth = this.yearDiff(parent.birthDate, child.birthDate);
        if (ageAtBirth < qualityRules.minBiologicalParentAge) {
          anomalies.push({
            id: this.makeEventId('anomaly-parent-too-young'),
            code: 'BIO_PARENT_AGE_TOO_YOUNG',
            severity: 'MEDIUM',
            message: `${parent.label} avait ${ageAtBirth} ans à la naissance de ${child.label}.`,
            personIds: [parent.id, child.id],
            relationshipId: relationship.id,
          });
        }

        if (ageAtBirth > qualityRules.maxBiologicalParentAge) {
          anomalies.push({
            id: this.makeEventId('anomaly-parent-too-old'),
            code: 'BIO_PARENT_AGE_TOO_OLD',
            severity: 'LOW',
            message: `${parent.label} avait ${ageAtBirth} ans à la naissance de ${child.label}.`,
            personIds: [parent.id, child.id],
            relationshipId: relationship.id,
          });
        }
      }
    }

    for (const union of context.unions) {
      const partner1 = context.personById.get(union.partner1Id);
      const partner2 = context.personById.get(union.partner2Id);

      if (union.startDate && union.endDate && union.endDate < union.startDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-union-end-before-start'),
          code: 'UNION_END_BEFORE_START',
          severity: 'HIGH',
          message: `Union ${union.id}: date de fin antérieure à la date de début.`,
          personIds: [union.partner1Id, union.partner2Id],
          unionId: union.id,
        });
      }

      if (union.startDate && partner1?.birthDate && union.startDate < partner1.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-union-start-before-partner1-birth'),
          code: 'UNION_START_BEFORE_PARTNER_BIRTH',
          severity: 'MEDIUM',
          message: `Union ${union.id}: début avant la naissance de ${partner1.label}.`,
          personIds: [partner1.id],
          unionId: union.id,
        });
      }

      if (union.startDate && partner2?.birthDate && union.startDate < partner2.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-union-start-before-partner2-birth'),
          code: 'UNION_START_BEFORE_PARTNER_BIRTH',
          severity: 'MEDIUM',
          message: `Union ${union.id}: début avant la naissance de ${partner2.label}.`,
          personIds: [partner2.id],
          unionId: union.id,
        });
      }

      if (union.endDate && partner1?.birthDate && union.endDate < partner1.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-union-end-before-partner1-birth'),
          code: 'UNION_END_BEFORE_PARTNER_BIRTH',
          severity: 'HIGH',
          message: `Union ${union.id}: fin avant la naissance de ${partner1.label}.`,
          personIds: [partner1.id],
          unionId: union.id,
        });
      }

      if (union.endDate && partner2?.birthDate && union.endDate < partner2.birthDate) {
        anomalies.push({
          id: this.makeEventId('anomaly-union-end-before-partner2-birth'),
          code: 'UNION_END_BEFORE_PARTNER_BIRTH',
          severity: 'HIGH',
          message: `Union ${union.id}: fin avant la naissance de ${partner2.label}.`,
          personIds: [partner2.id],
          unionId: union.id,
        });
      }
    }

    return anomalies.slice(0, 500);
  }

  private collectQualityViolations(
    context: IntegrityContext,
    qualityRules: QualityRules,
  ): TreeQualityViolation[] {
    if (!qualityRules.requireParentKnown) {
      return [];
    }

    const childSet = new Set(context.relationships.map((relationship) => relationship.childId));

    const violations: TreeQualityViolation[] = [];
    for (const person of context.personById.values()) {
      if (childSet.has(person.id)) continue;

      violations.push({
        id: this.makeEventId('quality-parent-required'),
        code: 'QUALITY_PARENT_REQUIRED',
        message: `${person.label}: aucun parent connu.`,
        personId: person.id,
        severity: 'LOW',
      });
    }

    return violations.slice(0, 500);
  }

  private buildAnchorSuggestions(
    component: IntegrityComponentInternal,
    mainComponent: IntegrityComponentInternal,
    context: IntegrityContext,
  ): AnchorSuggestion[] {
    const representative = context.personById.get(component.representative.id);
    if (!representative) return [];

    const candidates = mainComponent.personIds
      .map((personId) => context.personById.get(personId))
      .filter((person): person is IntegrityPersonSummary => Boolean(person));

    const scored = candidates
      .map((candidate) => {
        const score = this.computeAnchorConfidence(representative, candidate);
        return {
          anchorPersonId: candidate.id,
          anchorLabel: candidate.label,
          confidence: score.confidence,
          reasons: score.reasons,
        };
      })
      .filter((item) => item.confidence >= 20)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    return scored;
  }

  private computeAnchorConfidence(
    source: IntegrityPersonSummary,
    candidate: IntegrityPersonSummary,
  ) {
    let confidence = 0;
    const reasons: string[] = [];

    const sourceGiven = this.normalizeText(source.givenNames);
    const candidateGiven = this.normalizeText(candidate.givenNames);
    if (sourceGiven && candidateGiven) {
      if (sourceGiven === candidateGiven) {
        confidence += 30;
        reasons.push('Prénoms identiques');
      } else {
        const similarity = this.stringSimilarity(sourceGiven, candidateGiven);
        if (similarity > 0.6) {
          const points = Math.round(similarity * 28);
          confidence += points;
          reasons.push(`Prénoms proches (${Math.round(similarity * 100)}%)`);
        }
      }
    }

    const sourceSurname = this.normalizeText(source.usageSurname || source.birthSurname || '');
    const candidateSurname = this.normalizeText(
      candidate.usageSurname || candidate.birthSurname || '',
    );
    if (sourceSurname && candidateSurname) {
      if (sourceSurname === candidateSurname) {
        confidence += 35;
        reasons.push('Nom identique');
      } else {
        const similarity = this.stringSimilarity(sourceSurname, candidateSurname);
        if (similarity > 0.62) {
          const points = Math.round(similarity * 30);
          confidence += points;
          reasons.push(`Nom proche (${Math.round(similarity * 100)}%)`);
        }
      }
    }

    if (source.birthDate && candidate.birthDate) {
      const yearsDiff = Math.abs(source.birthDate.getFullYear() - candidate.birthDate.getFullYear());
      if (yearsDiff === 0) {
        confidence += 20;
        reasons.push('Même année de naissance');
      } else if (yearsDiff <= 2) {
        confidence += 14;
        reasons.push(`Année de naissance proche (${yearsDiff} an(s))`);
      } else if (yearsDiff <= 5) {
        confidence += 7;
        reasons.push(`Année de naissance relativement proche (${yearsDiff} ans)`);
      }
    }

    const sourcePlace = this.normalizeText(source.birthPlace || '');
    const candidatePlace = this.normalizeText(candidate.birthPlace || '');
    if (sourcePlace && candidatePlace) {
      if (sourcePlace === candidatePlace) {
        confidence += 15;
        reasons.push('Lieu de naissance identique');
      } else {
        const similarity = this.stringSimilarity(sourcePlace, candidatePlace);
        if (similarity > 0.7) {
          const points = Math.round(similarity * 12);
          confidence += points;
          reasons.push(`Lieu de naissance proche (${Math.round(similarity * 100)}%)`);
        }
      }
    }

    return {
      confidence: Math.max(0, Math.min(100, confidence)),
      reasons,
    };
  }

  private async computeDeletionPlan(targetIds: string[]) {
    const [relationshipsToDelete, unionsToDeleteRows] =
      await this.prisma.$transaction([
        this.prisma.relationship.count({
          where: {
            OR: [{ parentId: { in: targetIds } }, { childId: { in: targetIds } }],
          },
        }),
        this.prisma.union.findMany({
          where: {
            OR: [{ partner1Id: { in: targetIds } }, { partner2Id: { in: targetIds } }],
          },
          select: { id: true },
        }),
      ]);

    const unionIds = unionsToDeleteRows.map((row) => row.id);
    const documentsDeleteWhere: Prisma.DocumentWhereInput = {
      OR: [
        { personId: { in: targetIds } },
        ...(unionIds.length > 0 ? [{ unionId: { in: unionIds } }] : []),
      ],
    };

    const documentsToDelete = await this.prisma.document.count({
      where: documentsDeleteWhere,
    });

    return {
      personsToDelete: targetIds.length,
      relationshipsToDelete,
      unionsToDelete: unionIds.length,
      documentsToDelete,
      documentsDeleteWhere,
    };
  }

  private buildNormalizedPersonFields(input: {
    givenNames?: string | null;
    usageSurname?: string | null;
    birthSurname?: string | null;
    birthDate?: Date | null;
    deathDate?: Date | null;
  }) {
    const givenNamesNormalized = input.givenNames
      ? this.normalizeText(input.givenNames) || null
      : null;
    const surname = input.usageSurname || input.birthSurname || null;
    const surnameNormalized = surname ? this.normalizeText(surname) || null : null;
    const primaryNameNormalized =
      this.normalizeText([input.givenNames, surname].filter(Boolean).join(' ')) ||
      null;

    return {
      givenNamesNormalized,
      surnameNormalized,
      primaryNameNormalized,
      birthYear: input.birthDate?.getFullYear() || null,
      deathYear: input.deathDate?.getFullYear() || null,
    };
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

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = this.getBigrams(a);
    const bigramsB = this.getBigrams(b);

    let intersection = 0;
    const copyB = new Map(bigramsB);
    for (const [bg, countA] of bigramsA.entries()) {
      const countB = copyB.get(bg) || 0;
      if (countB <= 0) continue;
      const add = Math.min(countA, countB);
      intersection += add;
      copyB.set(bg, countB - add);
    }

    const sizeA = Array.from(bigramsA.values()).reduce((acc, value) => acc + value, 0);
    const sizeB = Array.from(bigramsB.values()).reduce((acc, value) => acc + value, 0);
    const total = sizeA + sizeB;
    return total > 0 ? (2 * intersection) / total : 0;
  }

  private getBigrams(value: string) {
    const map = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i += 1) {
      const token = value.slice(i, i + 2);
      map.set(token, (map.get(token) || 0) + 1);
    }
    return map;
  }

  private yearDiff(start: Date, end: Date) {
    const millis = end.getTime() - start.getTime();
    return Math.floor(millis / (365.25 * 24 * 3600 * 1000));
  }

  private clampNumber(value: unknown, fallback: number, min: number, max: number) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  private makeEventId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async getJsonSetting<T>(key: string, fallback: T): Promise<T> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) return fallback;
    try {
      return (setting.value as T) || fallback;
    } catch {
      return fallback;
    }
  }

  private async setJsonSetting(key: string, value: unknown) {
    const payload = value as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: payload,
      },
      update: {
        value: payload,
      },
    });
  }

  private async appendRepairLogs(entries: RepairLogEntry[]) {
    if (entries.length === 0) return;
    const current = await this.getJsonSetting<RepairLogEntry[]>(TREE_REPAIR_LOGS_KEY, []);
    const next = [...current, ...entries].slice(-MAX_REPAIR_LOGS);
    await this.setJsonSetting(TREE_REPAIR_LOGS_KEY, next);
  }

  private async appendPersonHistory(entries: PersonHistoryEntry[]) {
    if (entries.length === 0) return;
    const current = await this.getJsonSetting<PersonHistoryEntry[]>(PERSON_HISTORY_LOGS_KEY, []);
    const next = [...current, ...entries].slice(-MAX_PERSON_HISTORY_LOGS);
    await this.setJsonSetting(PERSON_HISTORY_LOGS_KEY, next);
  }

  private validatePersonChronology(
    birthDate: Date | null,
    deathDate: Date | null,
  ) {
    if (birthDate && deathDate && deathDate < birthDate) {
      throw new BadRequestException(
        'Incohérence de dates: la date de décès ne peut pas être antérieure à la date de naissance.',
      );
    }
  }

  private async ensureRootDefaultExists() {
    const rootDefault = await this.prisma.person.findFirst({
      where: { isRootDefault: true },
      select: { id: true },
    });

    if (rootDefault) return;

    const fallback = await this.prisma.person.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (fallback) {
      await this.prisma.person.update({
        where: { id: fallback.id },
        data: { isRootDefault: true },
      });
    }
  }

  private async getDescendantIds(personId: string): Promise<string[]> {
    const results = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT child_id AS id
        FROM relationships
        WHERE parent_id = ${personId}::uuid

        UNION

        SELECT r.child_id AS id
        FROM relationships r
        INNER JOIN descendants d ON r.parent_id = d.id
      )
      SELECT DISTINCT id FROM descendants
    `;

    return results.map((row) => row.id);
  }
}
