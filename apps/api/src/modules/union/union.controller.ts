// ══════════════════════════════════════
// Union Controller
// ══════════════════════════════════════

import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UnionService } from './union.service';
import {
  AttachUnionDocumentDto,
  CreateSpouseUnionDto,
  CreateUnionDto,
  UpdateUnionDto,
} from './dto/union.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Unions')
@Controller('unions')
export class UnionController {
  constructor(private readonly unionService: UnionService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a union (marriage, PACS, etc.)' })
  async create(@Body() dto: CreateUnionDto) {
    this.assertTreeId(dto.treeId);
    return { success: true, data: await this.unionService.create(dto) };
  }

  @Post('person/:personId/spouse')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Associate a spouse/partner union to a person' })
  @ApiQuery({ name: 'treeId', required: true })
  async createForPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
    @Body() dto: CreateSpouseUnionDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.unionService.createForPerson(treeId, personId, dto),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all unions (paginated)' })
  @ApiQuery({ name: 'treeId', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('treeId') treeId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.unionService.findAll(treeId, page, limit) };
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'Get all unions for a person' })
  @ApiQuery({ name: 'treeId', required: true })
  async findByPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.unionService.findByPerson(treeId, personId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a union by ID' })
  @ApiQuery({ name: 'treeId', required: true })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.unionService.findOne(treeId, id) };
  }

  @Post(':id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach an existing document to a union' })
  @ApiQuery({ name: 'treeId', required: true })
  async attachDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: AttachUnionDocumentDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.unionService.attachDocument(treeId, id, dto),
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a union' })
  @ApiQuery({ name: 'treeId', required: true })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateUnionDto,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.unionService.update(treeId, id, dto) };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a union' })
  @ApiQuery({ name: 'treeId', required: true })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.unionService.remove(treeId, id);
    return { success: true, message: 'Union deleted successfully' };
  }

  private assertTreeId(treeId?: string) {
    if (!treeId) {
      throw new BadRequestException('treeId is required.');
    }
  }
}
