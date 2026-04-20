// ══════════════════════════════════════
// Relationship Controller
// ══════════════════════════════════════

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RelationshipService } from './relationship.service';
import { CreateRelationshipDto } from './dto/relationship.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Relationships')
@Controller('relationships')
export class RelationshipController {
  constructor(private readonly relationshipService: RelationshipService) {}

  @Get()
  @ApiOperation({ summary: 'List all relationships (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = this.parsePositiveInt(page, 1);
    const parsedLimit = this.parsePositiveInt(limit, 100, 1000);

    return {
      success: true,
      data: await this.relationshipService.findAll(parsedPage, parsedLimit),
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a parent-child relationship' })
  async create(@Body() dto: CreateRelationshipDto) {
    return {
      success: true,
      data: await this.relationshipService.create(dto),
    };
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'Get all relationships for a person' })
  async findByPerson(@Param('personId', ParseUUIDPipe) personId: string) {
    return {
      success: true,
      data: await this.relationshipService.findByPerson(personId),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a relationship' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.relationshipService.remove(id);
    return { success: true, message: 'Relationship deleted successfully' };
  }

  private parsePositiveInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

    return Math.min(parsed, max);
  }
}
