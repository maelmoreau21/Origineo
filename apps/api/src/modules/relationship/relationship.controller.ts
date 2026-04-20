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
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RelationshipService } from './relationship.service';
import { CreateRelationshipDto } from './dto/relationship.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Relationships')
@Controller('relationships')
export class RelationshipController {
  constructor(private readonly relationshipService: RelationshipService) {}

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
}
