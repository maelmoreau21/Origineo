import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateCitationDto,
  CreateCitationLinkDto,
  CreateRepositoryDto,
  CreateSourceDto,
  UpdateCitationDto,
  UpdateRepositoryDto,
  UpdateSourceDto,
} from './dto/source.dto';
import { SourceService } from './source.service';

@ApiTags('Sources')
@Controller('sources')
export class SourceController {
  constructor(private readonly sourceService: SourceService) {}

  @Post('repositories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an archive repository' })
  async createRepository(@Body() dto: CreateRepositoryDto) {
    return {
      success: true,
      data: await this.sourceService.createRepository(dto),
    };
  }

  @Get('repositories')
  @ApiOperation({ summary: 'List archive repositories' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllRepositories(
    @Query('treeId') treeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findAllRepositories(
        treeId,
        this.parsePositiveInt(page, 1),
        this.parsePositiveInt(limit, 20, 500),
      ),
    };
  }

  @Get('repositories/:id')
  @ApiOperation({ summary: 'Get an archive repository' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findOneRepository(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findOneRepository(treeId, id),
    };
  }

  @Patch('repositories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an archive repository' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async updateRepository(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateRepositoryDto,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.updateRepository(treeId, id, dto),
    };
  }

  @Delete('repositories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an archive repository' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async removeRepository(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.sourceService.removeRepository(treeId, id);
    return { success: true, message: 'Repository deleted successfully' };
  }

  @Post('citations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a citation/proof excerpt' })
  async createCitation(@Body() dto: CreateCitationDto) {
    return {
      success: true,
      data: await this.sourceService.createCitation(dto),
    };
  }

  @Get('citations')
  @ApiOperation({ summary: 'List citations' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'sourceId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllCitations(
    @Query('treeId') treeId: string,
    @Query('sourceId') sourceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findAllCitations(
        treeId,
        this.parsePositiveInt(page, 1),
        this.parsePositiveInt(limit, 20, 500),
        sourceId,
      ),
    };
  }

  @Get('citations/:citationId/links')
  @ApiOperation({ summary: 'List links for a citation' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findLinksForCitation(
    @Param('citationId', ParseUUIDPipe) citationId: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findLinksForCitation(treeId, citationId),
    };
  }

  @Get('citations/:id')
  @ApiOperation({ summary: 'Get a citation' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findOneCitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findOneCitation(treeId, id),
    };
  }

  @Patch('citations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a citation' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async updateCitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateCitationDto,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.updateCitation(treeId, id, dto),
    };
  }

  @Delete('citations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a citation' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async removeCitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.sourceService.removeCitation(treeId, id);
    return { success: true, message: 'Citation deleted successfully' };
  }

  @Post('citation-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a citation to a person or union' })
  async linkCitation(@Body() dto: CreateCitationLinkDto) {
    return {
      success: true,
      data: await this.sourceService.linkCitation(dto),
    };
  }

  @Get('persons/:personId/citations')
  @ApiOperation({ summary: 'List citations linked to a person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findCitationsByPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findCitationsByPerson(treeId, personId),
    };
  }

  @Get('unions/:unionId/citations')
  @ApiOperation({ summary: 'List citations linked to a union' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findCitationsByUnion(
    @Param('unionId', ParseUUIDPipe) unionId: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findCitationsByUnion(treeId, unionId),
    };
  }

  @Delete('citation-links/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a citation link' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async unlinkCitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.sourceService.unlinkCitation(treeId, id);
    return { success: true, message: 'Citation link deleted successfully' };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a register/source' })
  async createSource(@Body() dto: CreateSourceDto) {
    return {
      success: true,
      data: await this.sourceService.createSource(dto),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List registers/sources' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'repositoryId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllSources(
    @Query('treeId') treeId: string,
    @Query('repositoryId') repositoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findAllSources(
        treeId,
        this.parsePositiveInt(page, 1),
        this.parsePositiveInt(limit, 20, 500),
        repositoryId,
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a register/source' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findOneSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.findOneSource(treeId, id),
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a register/source' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateSourceDto,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.sourceService.updateSource(treeId, id, dto),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a register/source' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async removeSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.sourceService.removeSource(treeId, id);
    return { success: true, message: 'Source deleted successfully' };
  }

  private assertTreeId(treeId?: string) {
    if (!treeId) {
      throw new BadRequestException('treeId is required.');
    }
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

    return Math.min(parsed, max);
  }
}
