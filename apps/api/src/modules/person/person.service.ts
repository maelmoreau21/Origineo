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

type IntegrityPersonSummary = {
  id: string;
  label: string;
  degree: number;
  isRootDefault: boolean;
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
};

@Injectable()
export class PersonService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto) {
    const birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    const deathDate = dto.deathDate ? new Date(dto.deathDate) : null;
    this.validatePersonChronology(birthDate, deathDate);

    // If setting as root default, unset any existing root
    if (dto.isRootDefault) {
      await this.prisma.person.updateMany({
        where: { isRootDefault: true },
        data: { isRootDefault: false },
      });
    }

    return this.prisma.person.create({
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
        isRootDefault: dto.isRootDefault || false,
      },
    });
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
          include: { child: true },
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

  async update(id: string, dto: UpdatePersonDto) {
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
    if (dto.isRootDefault !== undefined)
      data.isRootDefault = dto.isRootDefault;

    return this.prisma.person.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const deleted = await this.prisma.person.delete({ where: { id } });
    await this.ensureRootDefaultExists();
    return deleted;
  }

  async removeBranch(rootId: string, includeRoot = true) {
    await this.findOne(rootId);

    const descendantIds = await this.getDescendantIds(rootId);
    const targetIds = Array.from(
      new Set(includeRoot ? [rootId, ...descendantIds] : descendantIds),
    );

    if (targetIds.length === 0) {
      return {
        personsDeleted: 0,
        relationshipsDeleted: 0,
        unionsDeleted: 0,
        documentsDeleted: 0,
        includeRoot,
      };
    }

    const [relationshipsDeleted, unionsToDelete] = await this.prisma.$transaction([
      this.prisma.relationship.count({
        where: {
          OR: [
            { parentId: { in: targetIds } },
            { childId: { in: targetIds } },
          ],
        },
      }),
      this.prisma.union.findMany({
        where: {
          OR: [
            { partner1Id: { in: targetIds } },
            { partner2Id: { in: targetIds } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const unionIds = unionsToDelete.map((union) => union.id);
    const unionsDeleted = unionIds.length;

    const documentsDeleteWhere: Prisma.DocumentWhereInput = {
      OR: [
        { personId: { in: targetIds } },
        ...(unionIds.length > 0 ? [{ unionId: { in: unionIds } }] : []),
      ],
    };

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(async (tx) => {
      const documentsResult = await tx.document.deleteMany({ where: documentsDeleteWhere });
      const personsResult = await tx.person.deleteMany({ where: { id: { in: targetIds } } });
      return [documentsResult.count, personsResult.count] as const;
    });

    await this.ensureRootDefaultExists();

    return {
      personsDeleted,
      relationshipsDeleted,
      unionsDeleted,
      documentsDeleted,
      includeRoot,
    };
  }

  async removeAll() {
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

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(async (tx) => {
      const documentsResult = await tx.document.deleteMany({});
      const personsResult = await tx.person.deleteMany({});
      return [documentsResult.count, personsResult.count] as const;
    });

    return {
      personsDeleted,
      relationshipsDeleted: relationshipsBefore,
      unionsDeleted: unionsBefore,
      documentsDeleted,
    };
  }

  async getIntegrityReport() {
    const context = await this.buildIntegrityContext();

    const rootSummary = context.rootPersonId
      ? context.personById.get(context.rootPersonId) || null
      : null;
    const rootInMainComponent = Boolean(
      context.rootPersonId &&
      context.mainComponent &&
      context.componentByPersonId.get(context.rootPersonId) === context.mainComponent.id,
    );

    const disconnectedComponents = context.mainComponent
      ? context.components
          .filter((component) => component.id !== context.mainComponent!.id)
          .map((component) => ({
            id: component.id,
            size: component.size,
            isolated: component.isolated,
            representativePersonId: component.representative.id,
            representativeLabel: component.representative.label,
            samplePeople: component.samplePeople,
          }))
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
      suggestions,
    };
  }

  async repairRootDefaultToMainComponent() {
    const context = await this.buildIntegrityContext();

    if (!context.mainComponent) {
      return {
        changed: false,
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
        reason: 'No candidate root found',
      };
    }

    const alreadyConsistent =
      context.rootDefaultIds.length === 1 && context.rootDefaultIds[0] === targetRootId;

    if (alreadyConsistent) {
      return {
        changed: false,
        personId: targetRootId,
        label: context.personById.get(targetRootId)?.label || null,
      };
    }

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

    return {
      changed: true,
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
  }) {
    const linkMode = input.linkMode || 'PARENT_OF_COMPONENT';
    const relationshipType = input.relationshipType || 'FOSTER';
    const unionType = input.unionType || 'OTHER';

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

      const createdUnion = await this.prisma.union.create({
        data: {
          partner1Id: anchorPersonId,
          partner2Id: input.componentPersonId,
          type: unionType,
        },
      });

      return {
        created: 'UNION',
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

    const createdRelationship = await this.prisma.relationship.create({
      data: {
        parentId,
        childId,
        type: relationshipType,
      },
    });

    return {
      created: 'RELATIONSHIP',
      anchorPersonId,
      componentPersonId: input.componentPersonId,
      componentId: targetComponent.id,
      componentSize: targetComponent.size,
      linkId: createdRelationship.id,
      linkMode,
      relationshipType,
    };
  }

  async removeDisconnectedComponent(personId: string) {
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

    const [relationshipsDeleted, unionsToDelete] = await this.prisma.$transaction([
      this.prisma.relationship.count({
        where: {
          OR: [
            { parentId: { in: targetIds } },
            { childId: { in: targetIds } },
          ],
        },
      }),
      this.prisma.union.findMany({
        where: {
          OR: [
            { partner1Id: { in: targetIds } },
            { partner2Id: { in: targetIds } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const unionIds = unionsToDelete.map((union) => union.id);
    const unionsDeleted = unionIds.length;

    const documentsDeleteWhere: Prisma.DocumentWhereInput = {
      OR: [
        { personId: { in: targetIds } },
        ...(unionIds.length > 0 ? [{ unionId: { in: unionIds } }] : []),
      ],
    };

    const [documentsDeleted, personsDeleted] = await this.prisma.$transaction(async (tx) => {
      const documentsResult = await tx.document.deleteMany({ where: documentsDeleteWhere });
      const personsResult = await tx.person.deleteMany({ where: { id: { in: targetIds } } });
      return [documentsResult.count, personsResult.count] as const;
    });

    await this.ensureRootDefaultExists();

    return {
      componentId: component.id,
      componentSize: component.size,
      personsDeleted,
      relationshipsDeleted,
      unionsDeleted,
      documentsDeleted,
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
        },
      }),
      this.prisma.relationship.findMany({
        select: {
          parentId: true,
          childId: true,
        },
      }),
      this.prisma.union.findMany({
        select: {
          partner1Id: true,
          partner2Id: true,
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
