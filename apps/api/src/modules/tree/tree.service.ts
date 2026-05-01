// ══════════════════════════════════════
// Tree Service — Recursive CTE Queries
// ══════════════════════════════════════

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface TreePerson {
  id: string;
  usage_surname: string | null;
  birth_surname: string | null;
  given_names: string;
  gender: string;
  birth_date: Date | null;
  birth_place: string | null;
  death_date: Date | null;
  death_place: string | null;
  professions: string[];
  notes: string | null;
  is_root_default: boolean;
  generation: number;
}

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
    rootPersonId: string,
    ancestorGenerations = 4,
    descendantGenerations = 2,
    options: TreeWindowOptions = {},
  ) {
    const includeSiblings = options.includeSiblings ?? true;
    const includeSpouses = options.includeSpouses ?? true;
    const limit = Math.max(25, Math.min(5000, Math.floor(options.limit || 1200)));

    // Verify root person exists
    const rootPerson = await this.prisma.person.findUnique({
      where: { id: rootPersonId },
    });

    if (!rootPerson) {
      throw new NotFoundException(
        `Person with ID "${rootPersonId}" not found`,
      );
    }

    // Fetch ancestors via recursive CTE
    const ancestors = await this.getAncestors(rootPersonId, ancestorGenerations);

    // Fetch descendants via recursive CTE
    const descendants = await this.getDescendants(rootPersonId, descendantGenerations);

    // Collect all unique person IDs
    const allPersonIds = new Set<string>();
    allPersonIds.add(rootPersonId);
    ancestors.forEach((a) => allPersonIds.add(a.id));
    descendants.forEach((d) => allPersonIds.add(d.id));

    // Include siblings of the root person (children of root's parents)
    const rootParents = ancestors.filter(a => a.generation === 1).map(a => a.id);
    if (includeSiblings && rootParents.length > 0) {
      const siblingRels = await this.prisma.relationship.findMany({
        where: { parentId: { in: rootParents } },
        select: { childId: true },
      });
      siblingRels.forEach(r => allPersonIds.add(r.childId));
    }

    const personIds = Array.from(allPersonIds);

    // Fetch all unions involving these persons (no AND constraint)
    const initialUnions = includeSpouses
      ? await this.prisma.union.findMany({
          where: {
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
        where: { childId: { in: personIds } },
      });
      childRelationships.forEach((r) => allPersonIds.add(r.parentId));
    }

    const collectedPersonIds = Array.from(allPersonIds);
    const updatedPersonIds = this.applyWindowLimit(
      rootPersonId,
      collectedPersonIds,
      limit,
    );
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
        AND: [
          { partner1Id: { in: updatedPersonIds } },
          { partner2Id: { in: updatedPersonIds } },
        ],
      },
    });

    // Fetch full person records
    const persons = await this.prisma.person.findMany({
      where: { id: { in: updatedPersonIds } },
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
        person,
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
    personId: string,
    maxGenerations: number,
  ): Promise<TreePerson[]> {
    if (maxGenerations <= 0) return [];

    const results = await this.prisma.$queryRaw<TreePerson[]>`
      WITH RECURSIVE ancestors AS (
        SELECT p.*, 1 AS generation
        FROM persons p
        INNER JOIN relationships r ON r.parent_id = p.id
        WHERE r.child_id = ${personId}::uuid

        UNION ALL

        SELECT p.*, a.generation + 1
        FROM persons p
        INNER JOIN relationships r ON r.parent_id = p.id
        INNER JOIN ancestors a ON r.child_id = a.id
        WHERE a.generation < ${maxGenerations}
      )
      SELECT DISTINCT ON (id) * FROM ancestors ORDER BY id, generation
    `;

    return results;
  }

  /**
   * Recursive CTE to fetch descendants up to N generations.
   */
  private async getDescendants(
    personId: string,
    maxGenerations: number,
  ): Promise<TreePerson[]> {
    if (maxGenerations <= 0) return [];

    const results = await this.prisma.$queryRaw<TreePerson[]>`
      WITH RECURSIVE descendants AS (
        SELECT p.*, 1 AS generation
        FROM persons p
        INNER JOIN relationships r ON r.child_id = p.id
        WHERE r.parent_id = ${personId}::uuid

        UNION ALL

        SELECT p.*, d.generation + 1
        FROM persons p
        INNER JOIN relationships r ON r.child_id = p.id
        INNER JOIN descendants d ON r.parent_id = d.id
        WHERE d.generation < ${maxGenerations}
      )
      SELECT DISTINCT ON (id) * FROM descendants ORDER BY id, generation
    `;

    return results;
  }

  /**
   * Calculate the relationship path between two persons.
   * Uses bidirectional BFS to find the shortest path.
   */
  async getRelationshipPath(personAId: string, personBId: string) {
    // Verify both persons exist
    const [personA, personB] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: personAId } }),
      this.prisma.person.findUnique({ where: { id: personBId } }),
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
          where: { id: { in: path } },
        });

        return {
          found: true,
          distance: currentDist,
          path: path.map((pid) => pathPersons.find((p) => p.id === pid)),
        };
      }

      // Get all connected persons (parents + children + partners)
      const [parentRels, childRels, unionRels] = await Promise.all([
        this.prisma.relationship.findMany({
          where: { childId: currentId },
          select: { parentId: true },
        }),
        this.prisma.relationship.findMany({
          where: { parentId: currentId },
          select: { childId: true },
        }),
        this.prisma.union.findMany({
          where: {
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
}
