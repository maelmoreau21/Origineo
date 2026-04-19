// ══════════════════════════════════════
// Relationship Service
// ══════════════════════════════════════

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRelationshipDto } from './dto/relationship.dto';

@Injectable()
export class RelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRelationshipDto) {
    // Prevent self-relationship
    if (dto.parentId === dto.childId) {
      throw new BadRequestException('A person cannot be their own parent');
    }

    // Verify both persons exist
    const [parent, child] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: dto.parentId } }),
      this.prisma.person.findUnique({ where: { id: dto.childId } }),
    ]);

    if (!parent) {
      throw new NotFoundException(`Parent with ID "${dto.parentId}" not found`);
    }
    if (!child) {
      throw new NotFoundException(`Child with ID "${dto.childId}" not found`);
    }

    this.validateRelationshipChronology(parent, child, dto.type || 'BIOLOGICAL');

    // Check for circular relationships
    const wouldCreateCycle = await this.checkCycle(dto.childId, dto.parentId);
    if (wouldCreateCycle) {
      throw new BadRequestException(
        'This relationship would create a circular dependency',
      );
    }

    return this.prisma.relationship.create({
      data: {
        parentId: dto.parentId,
        childId: dto.childId,
        type: dto.type || 'BIOLOGICAL',
      },
      include: {
        parent: true,
        child: true,
      },
    });
  }

  private validateRelationshipChronology(
    parent: { birthDate: Date | null; deathDate: Date | null },
    child: { birthDate: Date | null; deathDate: Date | null },
    relationshipType: string,
  ) {
    if (parent.birthDate && child.birthDate && parent.birthDate > child.birthDate) {
      throw new BadRequestException(
        'Incohérence de filiation: un parent ne peut pas être né après son enfant.',
      );
    }

    if (
      relationshipType === 'BIOLOGICAL' &&
      parent.deathDate &&
      child.birthDate &&
      parent.deathDate < child.birthDate
    ) {
      throw new BadRequestException(
        'Incohérence de filiation biologique: le parent ne peut pas être décédé avant la naissance de l\'enfant.',
      );
    }

    if (child.birthDate && child.deathDate && child.deathDate < child.birthDate) {
      throw new BadRequestException(
        'Incohérence de dates enfant: la date de décès ne peut pas être antérieure à la date de naissance.',
      );
    }
  }

  async findByPerson(personId: string) {
    return {
      asParent: await this.prisma.relationship.findMany({
        where: { parentId: personId },
        include: { child: true },
      }),
      asChild: await this.prisma.relationship.findMany({
        where: { childId: personId },
        include: { parent: true },
      }),
    };
  }

  async remove(id: string) {
    const relationship = await this.prisma.relationship.findUnique({
      where: { id },
    });

    if (!relationship) {
      throw new NotFoundException(`Relationship with ID "${id}" not found`);
    }

    return this.prisma.relationship.delete({ where: { id } });
  }

  /**
   * Check if adding parent -> child would create a cycle.
   * We traverse upward from the proposed parent to see if we reach the child.
   */
  private async checkCycle(
    proposedChildId: string,
    proposedParentId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [proposedChildId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (currentId === proposedParentId) {
        return true; // Cycle detected
      }

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Find all children of current (i.e., go downward from current)
      const childRelations = await this.prisma.relationship.findMany({
        where: { parentId: currentId },
        select: { childId: true },
      });

      for (const rel of childRelations) {
        if (!visited.has(rel.childId)) {
          queue.push(rel.childId);
        }
      }
    }

    return false;
  }
}
