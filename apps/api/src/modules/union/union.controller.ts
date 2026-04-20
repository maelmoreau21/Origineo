// ══════════════════════════════════════
// Union Controller
// ══════════════════════════════════════

import {
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
import { CreateUnionDto, UpdateUnionDto } from './dto/union.dto';
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
    return { success: true, data: await this.unionService.create(dto) };
  }

  @Get()
  @ApiOperation({ summary: 'List all unions (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return { success: true, data: await this.unionService.findAll(page, limit) };
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'Get all unions for a person' })
  async findByPerson(@Param('personId', ParseUUIDPipe) personId: string) {
    return { success: true, data: await this.unionService.findByPerson(personId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a union by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.unionService.findOne(id) };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a union' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnionDto,
  ) {
    return { success: true, data: await this.unionService.update(id, dto) };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a union' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.unionService.remove(id);
    return { success: true, message: 'Union deleted successfully' };
  }
}
