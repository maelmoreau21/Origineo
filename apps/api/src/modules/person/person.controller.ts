// ══════════════════════════════════════
// Person Controller
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
import { PersonService } from './person.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Persons')
@Controller('persons')
export class PersonController {
  constructor(private readonly personService: PersonService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new person' })
  async create(@Body() dto: CreatePersonDto) {
    return {
      success: true,
      data: await this.personService.create(dto),
    };
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all persons (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return {
      success: true,
      data: await this.personService.findAll(page || 1, limit || 20),
    };
  }

  @Public()
  @Get('root')
  @ApiOperation({ summary: 'Get the default root person' })
  async findRoot() {
    return {
      success: true,
      data: await this.personService.findRootDefault(),
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a person by ID with relationships' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.personService.findOne(id),
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a person' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
  ) {
    return {
      success: true,
      data: await this.personService.update(id, dto),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a person' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.personService.remove(id);
    return { success: true, message: 'Person deleted successfully' };
  }
}
