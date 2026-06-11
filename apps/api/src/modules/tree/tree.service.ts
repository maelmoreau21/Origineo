// ══════════════════════════════════════
// Tree Service — Recursive CTE Queries
// ══════════════════════════════════════

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface TreePerson {
  id: string;
  generation: number;
}

type PlaceLike = {
  name: string;
  subdivision: string | null;
  region: string | null;
  country: string | null;
} | null;

interface TreeWindowOptions {
  includeSiblings?: boolean;
  includeSpouses?: boolean;
  limit?: number;
}

@Injectable()
export class TreeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the full tree data for a root person with configurable depth.
   * Uses recursive CTEs for efficient multi-generation queries.
   */
  async getTree(
    treeId: string,
    rootPersonId: string,
    ancestorGenerations = 4,
    descendantGenerations = 2,
    options: TreeWindowOptions = {},
  ) {
    const includeSiblings = options.includeSiblings ?? true;
    const includeSpouses = options.includeSpouses ?? true;
    const limit = Math.max(25, Math.min(5000, Math.floor(options.limit || 1200)));

    // Verify root person exists
    const rootPerson = await this.prisma.person.findFirst({
      where: { id: rootPersonId, treeId },
    });

    if (!rootPerson) {
      throw new NotFoundException(
        `Person with ID "${rootPersonId}" not found`,
      );
    }

    // Fetch ancestors via recursive CTE
    const ancestors = await this.getAncestors(treeId, rootPersonId, ancestorGenerations);

    // Fetch descendants via recursive CTE
    const descendants = await this.getDescendants(treeId, rootPersonId, descendantGenerations);

    // Collect all unique person IDs
    const allPersonIds = new Set<string>();
    allPersonIds.add(rootPersonId);
    ancestors.forEach((a) => allPersonIds.add(a.id));
    descendants.forEach((d) => allPersonIds.add(d.id));

    // Include siblings of the root person (children of root's parents)
    const rootParents = ancestors.filter(a => a.generation === 1).map(a => a.id);
    if (includeSiblings && rootParents.length > 0) {
      const siblingRels = await this.prisma.relationship.findMany({
        where: {
          parentId: { in: rootParents },
          child: { is: { treeId } },
        },
        select: { childId: true },
      });
      siblingRels.forEach(r => allPersonIds.add(r.childId));
    }

    const personIds = Array.from(allPersonIds);

    // Fetch all unions involving these persons (no AND constraint)
    const initialUnions = includeSpouses
      ? await this.prisma.union.findMany({
          where: {
            treeId,
            OR: [
              { partner1Id: { in: personIds } },
              { partner2Id: { in: personIds } },
            ],
          },
        })
      : [];

    initialUnions.forEach((u) => {
      allPersonIds.add(u.partner1Id);
      allPersonIds.add(u.partner2Id);
    });

    // Also include co-parents of any child in the tree
    if (includeSpouses) {
      const childRelationships = await this.prisma.relationship.findMany({
        where: {
          childId: { in: personIds },
          parent: { is: { treeId } },
        },
      });
      childRelationships.forEach((r) => allPersonIds.add(r.parentId));
    }

    const collectedPersonIds = Array.from(allPersonIds);
    const limitedPersonIds = this.applyWindowLimit(
      rootPersonId,
      collectedPersonIds,
      limit,
    );

    // Fetch full person records and re-apply the tree guard before loading edges.
    const persons = await this.prisma.person.findMany({
      where: { treeId, id: { in: limitedPersonIds } },
      include: {
        birthPlace: true,
        deathPlace: true,
      },
    });
    const updatedPersonIds = persons.map((person) => person.id);
    const visiblePersonIds = new Set(updatedPersonIds);

    // Fetch all relationships between the updated person set
    const relationships = await this.prisma.relationship.findMany({
      where: {
        AND: [
          { parentId: { in: updatedPersonIds } },
          { childId: { in: updatedPersonIds } },
        ],
      },
    });

    // Fetch all unions between the updated person set
    const unions = await this.prisma.union.findMany({
      where: {
        treeId,
        AND: [
          { partner1Id: { in: updatedPersonIds } },
          { partner2Id: { in: updatedPersonIds } },
        ],
      },
    });

    const unionsByPerson = new Map<string, (typeof unions)[number][]>();
    for (const union of unions) {
      const p1Unions = unionsByPerson.get(union.partner1Id) || [];
      p1Unions.push(union);
      unionsByPerson.set(union.partner1Id, p1Unions);

      const p2Unions = unionsByPerson.get(union.partner2Id) || [];
      p2Unions.push(union);
      unionsByPerson.set(union.partner2Id, p2Unions);
    }

    const parentsByChild = new Map<string, string[]>();
    const childrenByParent = new Map<string, string[]>();
    for (const relationship of relationships) {
      const parentList = parentsByChild.get(relationship.childId) || [];
      parentList.push(relationship.parentId);
      parentsByChild.set(relationship.childId, parentList);

      const childList = childrenByParent.get(relationship.parentId) || [];
      childList.push(relationship.childId);
      childrenByParent.set(relationship.parentId, childList);
    }

    // Build generation map
    const generationMap = new Map<string, number>();
    generationMap.set(rootPersonId, 0);
    ancestors.forEach((a) => generationMap.set(a.id, -a.generation));
    descendants.forEach((d) => generationMap.set(d.id, d.generation));

    // Build nodes
    const nodes = persons.map((person) => {
      return {
        person: this.serializePerson(person),
        generation: generationMap.get(person.id) || 0,
        unions: unionsByPerson.get(person.id) || [],
        parents: parentsByChild.get(person.id) || [],
        children: childrenByParent.get(person.id) || [],
        visible: true,
      };
    });

    return {
      rootPersonId,
      nodes,
      relationships: relationships.map((relationship) => ({
        ...relationship,
        visible: true,
      })),
      unions: unions.map((union) => ({
        ...union,
        visible: true,
      })),
      stats: {
        rootPersonId,
        requestedAncestors: ancestorGenerations,
        requestedDescendants: descendantGenerations,
        visiblePersons: visiblePersonIds.size,
        totalCollectedPersons: collectedPersonIds.length,
        visibleRelationships: relationships.length,
        visibleUnions: unions.length,
        limit,
        truncated: collectedPersonIds.length > visiblePersonIds.size,
        includesSiblings: includeSiblings,
        includesSpouses: includeSpouses,
      },
    };
  }

  private applyWindowLimit(rootPersonId: string, ids: string[], limit: number) {
    if (ids.length <= limit) return ids;

    const result = [rootPersonId];
    for (const id of ids) {
      if (id === rootPersonId) continue;
      if (result.length >= limit) break;
      result.push(id);
    }
    return result;
  }

  /**
   * Recursive CTE to fetch ancestors up to N generations.
   */
  private async getAncestors(
    treeId: string,
    personId: string,
    maxGenerations: number,
  ): Promise<TreePerson[]> {
    if (maxGenerations <= 0) return [];

    const results = await this.prisma.$queryRaw<TreePerson[]>`
      WITH RECURSIVE ancestors AS (
        SELECT p.id, 1 AS generation
        FROM persons p
        INNER JOIN relationships r ON r.parent_id = p.id
        WHERE r.child_id = ${personId}::uuid
          AND p.tree_id = ${treeId}::uuid

        UNION ALL

        SELECT p.id, a.generation + 1
        FROM persons p
        INNER JOIN relationships r ON r.parent_id = p.id
        INNER JOIN ancestors a ON r.child_id = a.id
        WHERE a.generation < ${maxGenerations}
          AND p.tree_id = ${treeId}::uuid
      )
      SELECT DISTINCT ON (id) * FROM ancestors ORDER BY id, generation
    `;

    return results;
  }

  /**
   * Recursive CTE to fetch descendants up to N generations.
   */
  private async getDescendants(
    treeId: string,
    personId: string,
    maxGenerations: number,
  ): Promise<TreePerson[]> {
    if (maxGenerations <= 0) return [];

    const results = await this.prisma.$queryRaw<TreePerson[]>`
      WITH RECURSIVE descendants AS (
        SELECT p.id, 1 AS generation
        FROM persons p
        INNER JOIN relationships r ON r.child_id = p.id
        WHERE r.parent_id = ${personId}::uuid
          AND p.tree_id = ${treeId}::uuid

        UNION ALL

        SELECT p.id, d.generation + 1
        FROM persons p
        INNER JOIN relationships r ON r.child_id = p.id
        INNER JOIN descendants d ON r.parent_id = d.id
        WHERE d.generation < ${maxGenerations}
          AND p.tree_id = ${treeId}::uuid
      )
      SELECT DISTINCT ON (id) * FROM descendants ORDER BY id, generation
    `;

    return results;
  }

  /**
   * Calculate the relationship path between two persons.
   * Uses bidirectional BFS to find the shortest path.
   */
  async getRelationshipPath(treeId: string, personAId: string, personBId: string) {
    // Verify both persons exist
    const [personA, personB] = await Promise.all([
      this.prisma.person.findFirst({ where: { id: personAId, treeId } }),
      this.prisma.person.findFirst({ where: { id: personBId, treeId } }),
    ]);

    if (!personA) throw new NotFoundException(`Person A not found`);
    if (!personB) throw new NotFoundException(`Person B not found`);

    // BFS from person A
    const visited = new Map<string, { from: string | null; distance: number }>();
    visited.set(personAId, { from: null, distance: 0 });
    const queue: string[] = [personAId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentDist = visited.get(currentId)!.distance;

      // Limit search depth to prevent infinite loops
      if (currentDist > 20) continue;

      if (currentId === personBId) {
        // Build path
        const path: string[] = [];
        let cursor: string | null = personBId;
        while (cursor) {
          path.unshift(cursor);
          cursor = visited.get(cursor)!.from;
        }

        // Fetch all persons in path
        const pathPersons = await this.prisma.person.findMany({
          where: { treeId, id: { in: path } },
          include: {
            birthPlace: true,
            deathPlace: true,
          },
        });

        return {
          found: true,
          distance: currentDist,
          path: path.map((pid) => {
            const person = pathPersons.find((p) => p.id === pid);
            return person ? this.serializePerson(person) : null;
          }),
        };
      }

      // Get all connected persons (parents + children + partners)
      const [parentRels, childRels, unionRels] = await Promise.all([
        this.prisma.relationship.findMany({
          where: { childId: currentId, parent: { is: { treeId } } },
          select: { parentId: true },
        }),
        this.prisma.relationship.findMany({
          where: { parentId: currentId, child: { is: { treeId } } },
          select: { childId: true },
        }),
        this.prisma.union.findMany({
          where: {
            treeId,
            OR: [{ partner1Id: currentId }, { partner2Id: currentId }],
          },
          select: { partner1Id: true, partner2Id: true },
        }),
      ]);

      const neighbors = [
        ...parentRels.map((r) => r.parentId),
        ...childRels.map((r) => r.childId),
        ...unionRels.map((u) =>
          u.partner1Id === currentId ? u.partner2Id : u.partner1Id,
        ),
      ];

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.set(neighborId, {
            from: currentId,
            distance: currentDist + 1,
          });
          queue.push(neighborId);
        }
      }
    }

    return { found: false, distance: -1, path: [] };
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
}
