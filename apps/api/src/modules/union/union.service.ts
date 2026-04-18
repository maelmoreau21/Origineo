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

    return this.prisma.union.create({
      data: {
        partner1Id: dto.partner1Id,
        partner2Id: dto.partner2Id,
        type: dto.type || 'MARRIAGE',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        startPlace: dto.startPlace,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
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
    await this.findOne(id);

    return this.prisma.union.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
        ...(dto.startPlace !== undefined && { startPlace: dto.startPlace }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
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
}
