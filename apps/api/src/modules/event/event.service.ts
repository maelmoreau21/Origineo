import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AttachEventParticipantDto,
  CreateEventDto,
  EventParticipantInputDto,
  ReplaceEventParticipantsDto,
  UpdateEventDto,
} from './dto/event.dto';

const eventInclude = Prisma.validator<Prisma.EventInclude>()({
  place: true,
  participants: {
    include: { person: true },
    orderBy: { createdAt: 'asc' },
  },
});

@Injectable()
export class EventService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto) {
    const date = this.parseOptionalDate(dto.date);
    const dateRaw = this.normalizeNullableString(dto.dateRaw);
    const notes = this.normalizeNullableString(dto.notes);
    const type = this.normalizeRequiredString(dto.type, 'type');
    const participants = this.normalizeParticipants(dto.participants || []);

    this.assertEventHasDate(date, dateRaw);
    await this.assertTreeExists(dto.treeId);
    await this.assertPlaceExists(dto.placeId);

    return this.prisma.$transaction(async (tx) => {
      await this.assertParticipantsBelongToTree(tx, dto.treeId, participants);

      return tx.event.create({
        data: {
          type,
          date,
          dateRaw,
          notes,
          tree: { connect: { id: dto.treeId } },
          ...(dto.placeId
            ? { place: { connect: { id: dto.placeId } } }
            : {}),
          ...(participants.length > 0
            ? {
                participants: {
                  create: participants.map((participant) => ({
                    role: participant.role,
                    person: { connect: { id: participant.personId } },
                  })),
                },
              }
            : {}),
        },
        include: eventInclude,
      });
    });
  }

  async findAll(treeId: string, page = 1, limit = 20) {
    await this.assertTreeExists(treeId);

    const safePage = this.clampPositiveInt(page, 1, Number.MAX_SAFE_INTEGER);
    const safeLimit = this.clampPositiveInt(limit, 20, 500);
    const skip = (safePage - 1) * safeLimit;

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where: { treeId },
        skip,
        take: safeLimit,
        include: eventInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.event.count({ where: { treeId } }),
    ]);

    return {
      data: events,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findOne(treeId: string, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, treeId },
      include: eventInclude,
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${id}" not found`);
    }

    return event;
  }

  async findByPerson(treeId: string, personId: string, page = 1, limit = 20) {
    await this.assertPersonBelongsToTree(treeId, personId);

    const safePage = this.clampPositiveInt(page, 1, Number.MAX_SAFE_INTEGER);
    const safeLimit = this.clampPositiveInt(limit, 20, 500);
    const skip = (safePage - 1) * safeLimit;
    const where = {
      treeId,
      participants: { some: { personId } },
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip,
        take: safeLimit,
        include: eventInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: events,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async update(treeId: string, id: string, dto: UpdateEventDto) {
    if (dto.treeId && dto.treeId !== treeId) {
      throw new BadRequestException('treeId cannot be changed during event update.');
    }

    const existingEvent = await this.findOne(treeId, id);
    const nextDate =
      dto.date !== undefined ? this.parseOptionalDate(dto.date) : existingEvent.date;
    const nextDateRaw =
      dto.dateRaw !== undefined
        ? this.normalizeNullableString(dto.dateRaw)
        : existingEvent.dateRaw;
    const participants =
      dto.participants !== undefined
        ? this.normalizeParticipants(dto.participants)
        : undefined;

    this.assertEventHasDate(nextDate, nextDateRaw);

    if (dto.placeId !== undefined) {
      await this.assertPlaceExists(dto.placeId);
    }

    return this.prisma.$transaction(async (tx) => {
      if (participants !== undefined) {
        await this.assertParticipantsBelongToTree(tx, treeId, participants);
      }

      return tx.event.update({
        where: { id },
        data: {
          ...(dto.type !== undefined && {
            type: this.normalizeRequiredString(dto.type, 'type'),
          }),
          ...(dto.date !== undefined && { date: nextDate }),
          ...(dto.dateRaw !== undefined && { dateRaw: nextDateRaw }),
          ...(dto.notes !== undefined && {
            notes: this.normalizeNullableString(dto.notes),
          }),
          ...(dto.placeId !== undefined && {
            place: dto.placeId
              ? { connect: { id: dto.placeId } }
              : { disconnect: true },
          }),
          ...(participants !== undefined && {
            participants: {
              deleteMany: {},
              ...(participants.length > 0
                ? {
                    create: participants.map((participant) => ({
                      role: participant.role,
                      person: { connect: { id: participant.personId } },
                    })),
                  }
                : {}),
            },
          }),
        },
        include: eventInclude,
      });
    });
  }

  async attachParticipant(
    treeId: string,
    eventId: string,
    dto: AttachEventParticipantDto,
  ) {
    await this.findOne(treeId, eventId);
    await this.assertPersonBelongsToTree(treeId, dto.personId);

    const role = this.normalizeRequiredString(dto.role, 'role');
    return this.prisma.eventParticipant.upsert({
      where: {
        eventId_personId: {
          eventId,
          personId: dto.personId,
        },
      },
      create: {
        event: { connect: { id: eventId } },
        person: { connect: { id: dto.personId } },
        role,
      },
      update: { role },
      include: { person: true },
    });
  }

  async replaceParticipants(
    treeId: string,
    eventId: string,
    dto: ReplaceEventParticipantsDto,
  ) {
    await this.findOne(treeId, eventId);
    const participants = this.normalizeParticipants(dto.participants);

    return this.prisma.$transaction(async (tx) => {
      await this.assertParticipantsBelongToTree(tx, treeId, participants);
      await tx.eventParticipant.deleteMany({ where: { eventId } });

      if (participants.length > 0) {
        await tx.eventParticipant.createMany({
          data: participants.map((participant) => ({
            eventId,
            personId: participant.personId,
            role: participant.role,
          })),
        });
      }

      return tx.event.findUniqueOrThrow({
        where: { id: eventId },
        include: eventInclude,
      });
    });
  }

  async removeParticipant(treeId: string, eventId: string, personId: string) {
    await this.findOne(treeId, eventId);

    const result = await this.prisma.eventParticipant.deleteMany({
      where: { eventId, personId },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        `Participant "${personId}" is not attached to event "${eventId}"`,
      );
    }

    return { eventId, personId };
  }

  async remove(treeId: string, id: string) {
    await this.findOne(treeId, id);
    return this.prisma.event.delete({ where: { id } });
  }

  private async assertTreeExists(treeId: string) {
    const tree = await this.prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });

    if (!tree) {
      throw new NotFoundException(`Tree with ID "${treeId}" not found`);
    }
  }

  private async assertPlaceExists(placeId?: string | null) {
    if (!placeId) return;

    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });

    if (!place) {
      throw new NotFoundException(`Place with ID "${placeId}" not found`);
    }
  }

  private async assertPersonBelongsToTree(treeId: string, personId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, treeId },
      select: { id: true },
    });

    if (!person) {
      throw new NotFoundException(
        `Person with ID "${personId}" not found in tree "${treeId}"`,
      );
    }
  }

  private async assertParticipantsBelongToTree(
    tx: Prisma.TransactionClient,
    treeId: string,
    participants: EventParticipantInputDto[],
  ) {
    if (participants.length === 0) return;

    const personIds = participants.map((participant) => participant.personId);
    const persons = await tx.person.findMany({
      where: { treeId, id: { in: personIds } },
      select: { id: true },
    });
    const foundIds = new Set(persons.map((person) => person.id));
    const missingIds = personIds.filter((personId) => !foundIds.has(personId));

    if (missingIds.length > 0) {
      throw new NotFoundException(
        `Participant person(s) not found in tree "${treeId}": ${missingIds.join(', ')}`,
      );
    }
  }

  private normalizeParticipants(participants: EventParticipantInputDto[]) {
    const seenPersonIds = new Set<string>();

    return participants.map((participant) => {
      if (seenPersonIds.has(participant.personId)) {
        throw new BadRequestException(
          `Person "${participant.personId}" is attached more than once to this event.`,
        );
      }

      seenPersonIds.add(participant.personId);
      return {
        personId: participant.personId,
        role: this.normalizeRequiredString(participant.role, 'role'),
      };
    });
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('date must be a valid ISO date.');
    }

    return parsed;
  }

  private assertEventHasDate(date: Date | null, dateRaw: string | null) {
    if (!date && !dateRaw) {
      throw new BadRequestException('Either date or dateRaw must be provided.');
    }
  }

  private normalizeNullableString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredString(value: string, fieldName: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} cannot be empty.`);
    }

    return normalized;
  }

  private clampPositiveInt(value: number, fallback: number, max: number) {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.min(Math.floor(value), max);
  }
}
