// ══════════════════════════════════════
// Person Service
// ══════════════════════════════════════

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { Prisma } from '@prisma/client';

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
    const skip = (page - 1) * limit;

    const [persons, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.person.count(),
    ]);

    return {
      data: persons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
    return this.prisma.person.delete({ where: { id } });
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
}
