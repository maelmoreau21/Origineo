// ══════════════════════════════════════
// Union Service
// ══════════════════════════════════════

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnionDto, UpdateUnionDto } from './dto/union.dto';

@Injectable()
export class UnionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUnionDto) {
    if (dto.partner1Id === dto.partner2Id) {
      throw new BadRequestException('A person cannot form a union with themselves');
    }

    // Verify both persons exist
    const [p1, p2] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: dto.partner1Id } }),
      this.prisma.person.findUnique({ where: { id: dto.partner2Id } }),
    ]);

    if (!p1) throw new NotFoundException(`Partner 1 with ID "${dto.partner1Id}" not found`);
    if (!p2) throw new NotFoundException(`Partner 2 with ID "${dto.partner2Id}" not found`);

    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    this.validateUnionChronology(startDate, endDate);
    this.validateUnionPartnerChronology(startDate, endDate, p1, p2);

    return this.prisma.union.create({
      data: {
        partner1Id: dto.partner1Id,
        partner2Id: dto.partner2Id,
        type: dto.type || 'MARRIAGE',
        startDate,
        startPlace: dto.startPlace,
        endDate,
        endReason: dto.endReason,
        notes: dto.notes,
      },
      include: {
        partner1: true,
        partner2: true,
      },
    });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [unions, total] = await this.prisma.$transaction([
      this.prisma.union.findMany({
        skip,
        take: limit,
        include: { partner1: true, partner2: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.union.count(),
    ]);

    return { data: unions, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const union = await this.prisma.union.findUnique({
      where: { id },
      include: {
        partner1: true,
        partner2: true,
        documents: true,
      },
    });

    if (!union) throw new NotFoundException(`Union with ID "${id}" not found`);
    return union;
  }

  async findByPerson(personId: string) {
    return this.prisma.union.findMany({
      where: {
        OR: [{ partner1Id: personId }, { partner2Id: personId }],
      },
      include: { partner1: true, partner2: true },
    });
  }

  async update(id: string, dto: UpdateUnionDto) {
    const existingUnion = await this.findOne(id);

    const startDate =
      dto.startDate !== undefined
        ? (dto.startDate ? new Date(dto.startDate) : null)
        : existingUnion.startDate;
    const endDate =
      dto.endDate !== undefined
        ? (dto.endDate ? new Date(dto.endDate) : null)
        : existingUnion.endDate;

    this.validateUnionChronology(startDate, endDate);
    this.validateUnionPartnerChronology(
      startDate,
      endDate,
      existingUnion.partner1,
      existingUnion.partner2,
    );

    return this.prisma.union.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.startDate !== undefined && {
          startDate,
        }),
        ...(dto.startPlace !== undefined && { startPlace: dto.startPlace }),
        ...(dto.endDate !== undefined && {
          endDate,
        }),
        ...(dto.endReason !== undefined && { endReason: dto.endReason }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { partner1: true, partner2: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.union.delete({ where: { id } });
  }

  private validateUnionChronology(
    startDate: Date | null,
    endDate: Date | null,
  ) {
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        'Incohérence d\'union: la date de fin ne peut pas être antérieure à la date de début.',
      );
    }
  }

  private validateUnionPartnerChronology(
    startDate: Date | null,
    endDate: Date | null,
    partner1: { birthDate: Date | null },
    partner2: { birthDate: Date | null },
  ) {
    if (startDate && partner1.birthDate && startDate < partner1.birthDate) {
      throw new BadRequestException(
        'Incohérence d\'union: la date de début est antérieure à la naissance du partenaire 1.',
      );
    }

    if (startDate && partner2.birthDate && startDate < partner2.birthDate) {
      throw new BadRequestException(
        'Incohérence d\'union: la date de début est antérieure à la naissance du partenaire 2.',
      );
    }

    if (endDate && partner1.birthDate && endDate < partner1.birthDate) {
      throw new BadRequestException(
        'Incohérence d\'union: la date de fin est antérieure à la naissance du partenaire 1.',
      );
    }

    if (endDate && partner2.birthDate && endDate < partner2.birthDate) {
      throw new BadRequestException(
        'Incohérence d\'union: la date de fin est antérieure à la naissance du partenaire 2.',
      );
    }
  }
}
