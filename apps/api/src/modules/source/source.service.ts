import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCitationDto,
  CreateCitationLinkDto,
  CreateRepositoryDto,
  CreateSourceDto,
  UpdateCitationDto,
  UpdateRepositoryDto,
  UpdateSourceDto,
} from './dto/source.dto';

@Injectable()
export class SourceService {
  constructor(private readonly prisma: PrismaService) {}

  async createRepository(dto: CreateRepositoryDto) {
    await this.assertTreeExists(dto.treeId);

    return this.prisma.repository.create({
      data: {
        treeId: dto.treeId,
        name: dto.name,
        type: dto.type,
        url: dto.url || null,
      },
    });
  }

  async findAllRepositories(treeId: string, page = 1, limit = 20) {
    await this.assertTreeExists(treeId);
    const pagination = this.normalizePagination(page, limit);

    const [repositories, total] = await this.prisma.$transaction([
      this.prisma.repository.findMany({
        where: { treeId },
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          _count: { select: { sources: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.repository.count({ where: { treeId } }),
    ]);

    return this.withPagination(repositories, total, pagination.page, pagination.limit);
  }

  async findOneRepository(treeId: string, id: string) {
    const repository = await this.prisma.repository.findFirst({
      where: { id, treeId },
      include: {
        sources: {
          include: {
            _count: { select: { citations: true } },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository with ID "${id}" not found`);
    }

    return repository;
  }

  async updateRepository(treeId: string, id: string, dto: UpdateRepositoryDto) {
    await this.findOneRepository(treeId, id);
    this.assertTreeIdIsStable(treeId, dto.treeId, 'repository');

    return this.prisma.repository.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.url !== undefined && { url: dto.url || null }),
      },
    });
  }

  async removeRepository(treeId: string, id: string) {
    await this.findOneRepository(treeId, id);
    return this.prisma.repository.delete({ where: { id } });
  }

  async createSource(dto: CreateSourceDto) {
    await this.assertTreeExists(dto.treeId);
    await this.assertRepositoryExists(dto.treeId, dto.repositoryId);

    return this.prisma.source.create({
      data: {
        treeId: dto.treeId,
        repositoryId: dto.repositoryId,
        title: dto.title,
        text: dto.text || null,
      },
      include: {
        repository: true,
      },
    });
  }

  async findAllSources(
    treeId: string,
    page = 1,
    limit = 20,
    repositoryId?: string,
  ) {
    await this.assertTreeExists(treeId);
    if (repositoryId) {
      await this.assertRepositoryExists(treeId, repositoryId);
    }

    const pagination = this.normalizePagination(page, limit);
    const where = {
      treeId,
      ...(repositoryId && { repositoryId }),
    };

    const [sources, total] = await this.prisma.$transaction([
      this.prisma.source.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        include: {
          repository: true,
          _count: { select: { citations: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.source.count({ where }),
    ]);

    return this.withPagination(sources, total, pagination.page, pagination.limit);
  }

  async findOneSource(treeId: string, id: string) {
    const source = await this.prisma.source.findFirst({
      where: { id, treeId },
      include: {
        repository: true,
        citations: {
          include: {
            links: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!source) {
      throw new NotFoundException(`Source with ID "${id}" not found`);
    }

    return source;
  }

  async updateSource(treeId: string, id: string, dto: UpdateSourceDto) {
    await this.findOneSource(treeId, id);
    this.assertTreeIdIsStable(treeId, dto.treeId, 'source');

    if (dto.repositoryId) {
      await this.assertRepositoryExists(treeId, dto.repositoryId);
    }

    return this.prisma.source.update({
      where: { id },
      data: {
        ...(dto.repositoryId !== undefined && { repositoryId: dto.repositoryId }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.text !== undefined && { text: dto.text || null }),
      },
      include: {
        repository: true,
      },
    });
  }

  async removeSource(treeId: string, id: string) {
    await this.findOneSource(treeId, id);
    return this.prisma.source.delete({ where: { id } });
  }

  async createCitation(dto: CreateCitationDto) {
    await this.assertTreeExists(dto.treeId);
    await this.assertSourceExists(dto.treeId, dto.sourceId);

    return this.prisma.citation.create({
      data: {
        treeId: dto.treeId,
        sourceId: dto.sourceId,
        page: dto.page || null,
        transcription: dto.transcription || null,
        confidenceScore: dto.confidenceScore,
      },
      include: this.citationInclude(),
    });
  }

  async findAllCitations(
    treeId: string,
    page = 1,
    limit = 20,
    sourceId?: string,
  ) {
    await this.assertTreeExists(treeId);
    if (sourceId) {
      await this.assertSourceExists(treeId, sourceId);
    }

    const pagination = this.normalizePagination(page, limit);
    const where = {
      treeId,
      ...(sourceId && { sourceId }),
    };

    const [citations, total] = await this.prisma.$transaction([
      this.prisma.citation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        include: this.citationInclude(),
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.citation.count({ where }),
    ]);

    return this.withPagination(citations, total, pagination.page, pagination.limit);
  }

  async findOneCitation(treeId: string, id: string) {
    const citation = await this.prisma.citation.findFirst({
      where: { id, treeId },
      include: this.citationInclude(),
    });

    if (!citation) {
      throw new NotFoundException(`Citation with ID "${id}" not found`);
    }

    return citation;
  }

  async updateCitation(treeId: string, id: string, dto: UpdateCitationDto) {
    await this.findOneCitation(treeId, id);
    this.assertTreeIdIsStable(treeId, dto.treeId, 'citation');

    if (dto.sourceId) {
      await this.assertSourceExists(treeId, dto.sourceId);
    }

    return this.prisma.citation.update({
      where: { id },
      data: {
        ...(dto.sourceId !== undefined && { sourceId: dto.sourceId }),
        ...(dto.page !== undefined && { page: dto.page || null }),
        ...(dto.transcription !== undefined && {
          transcription: dto.transcription || null,
        }),
        ...(dto.confidenceScore !== undefined && {
          confidenceScore: dto.confidenceScore,
        }),
      },
      include: this.citationInclude(),
    });
  }

  async removeCitation(treeId: string, id: string) {
    await this.findOneCitation(treeId, id);
    return this.prisma.citation.delete({ where: { id } });
  }

  async linkCitation(dto: CreateCitationLinkDto) {
    this.assertSingleTarget(dto.personId, dto.unionId);
    await this.findOneCitation(dto.treeId, dto.citationId);

    if (dto.personId) {
      await this.assertPersonExists(dto.treeId, dto.personId);
      await this.assertCitationLinkDoesNotExist({
        citationId: dto.citationId,
        personId: dto.personId,
      });
    }

    if (dto.unionId) {
      await this.assertUnionExists(dto.treeId, dto.unionId);
      await this.assertCitationLinkDoesNotExist({
        citationId: dto.citationId,
        unionId: dto.unionId,
      });
    }

    return this.prisma.citationLink.create({
      data: {
        treeId: dto.treeId,
        citationId: dto.citationId,
        personId: dto.personId || null,
        unionId: dto.unionId || null,
      },
      include: this.citationLinkInclude(),
    });
  }

  async findLinksForCitation(treeId: string, citationId: string) {
    await this.findOneCitation(treeId, citationId);

    return this.prisma.citationLink.findMany({
      where: { treeId, citationId },
      include: this.citationLinkInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCitationsByPerson(treeId: string, personId: string) {
    await this.assertPersonExists(treeId, personId);

    return this.prisma.citationLink.findMany({
      where: { treeId, personId },
      include: this.citationLinkInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCitationsByUnion(treeId: string, unionId: string) {
    await this.assertUnionExists(treeId, unionId);

    return this.prisma.citationLink.findMany({
      where: { treeId, unionId },
      include: this.citationLinkInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async unlinkCitation(treeId: string, id: string) {
    const link = await this.prisma.citationLink.findFirst({
      where: { id, treeId },
    });

    if (!link) {
      throw new NotFoundException(`Citation link with ID "${id}" not found`);
    }

    return this.prisma.citationLink.delete({ where: { id } });
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

  private async assertRepositoryExists(treeId: string, repositoryId: string) {
    const repository = await this.prisma.repository.findFirst({
      where: { id: repositoryId, treeId },
      select: { id: true },
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository with ID "${repositoryId}" not found`,
      );
    }
  }

  private async assertSourceExists(treeId: string, sourceId: string) {
    const source = await this.prisma.source.findFirst({
      where: { id: sourceId, treeId },
      select: { id: true },
    });

    if (!source) {
      throw new NotFoundException(`Source with ID "${sourceId}" not found`);
    }
  }

  private async assertPersonExists(treeId: string, personId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, treeId },
      select: { id: true },
    });

    if (!person) {
      throw new NotFoundException(`Person with ID "${personId}" not found`);
    }
  }

  private async assertUnionExists(treeId: string, unionId: string) {
    const union = await this.prisma.union.findFirst({
      where: { id: unionId, treeId },
      select: { id: true },
    });

    if (!union) {
      throw new NotFoundException(`Union with ID "${unionId}" not found`);
    }
  }

  private async assertCitationLinkDoesNotExist(where: {
    citationId: string;
    personId?: string;
    unionId?: string;
  }) {
    const existing = await this.prisma.citationLink.findFirst({ where });

    if (existing) {
      throw new ConflictException('This citation link already exists');
    }
  }

  private assertSingleTarget(personId?: string, unionId?: string) {
    const targetCount = [personId, unionId].filter(Boolean).length;
    if (targetCount !== 1) {
      throw new BadRequestException(
        'Exactly one target must be provided: personId or unionId.',
      );
    }
  }

  private assertTreeIdIsStable(
    currentTreeId: string,
    requestedTreeId: string | undefined,
    entityName: string,
  ) {
    if (requestedTreeId && requestedTreeId !== currentTreeId) {
      throw new BadRequestException(
        `treeId cannot be changed during ${entityName} update.`,
      );
    }
  }

  private normalizePagination(page = 1, limit = 20) {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(500, Math.max(1, Math.floor(limit)))
      : 20;

    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  private withPagination<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ) {
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private citationInclude() {
    return {
      source: {
        include: {
          repository: true,
        },
      },
      links: {
        include: {
          person: {
            select: {
              id: true,
              treeId: true,
              givenNames: true,
              usageSurname: true,
              birthSurname: true,
              birthDate: true,
              deathDate: true,
            },
          },
          union: {
            select: {
              id: true,
              treeId: true,
              type: true,
              startDate: true,
              endDate: true,
              partner1Id: true,
              partner2Id: true,
            },
          },
        },
      },
    };
  }

  private citationLinkInclude() {
    return {
      citation: {
        include: {
          source: {
            include: {
              repository: true,
            },
          },
        },
      },
      person: {
        select: {
          id: true,
          treeId: true,
          givenNames: true,
          usageSurname: true,
          birthSurname: true,
          birthDate: true,
          deathDate: true,
        },
      },
      union: {
        select: {
          id: true,
          treeId: true,
          type: true,
          startDate: true,
          endDate: true,
          partner1Id: true,
          partner2Id: true,
        },
      },
    };
  }
}
