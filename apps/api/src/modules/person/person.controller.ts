// ══════════════════════════════════════
// Person Controller
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
import { PersonService } from './person.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { ConnectDisconnectedComponentDto } from './dto/tree-integrity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

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

  @Get()
  @ApiOperation({ summary: 'List all persons (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = this.parsePositiveInt(page, 1);
    const parsedLimit = this.parsePositiveInt(limit, 20, 500);

    return {
      success: true,
      data: await this.personService.findAll(parsedPage, parsedLimit),
    };
  }

  @Get('root')
  @ApiOperation({ summary: 'Get the default root person' })
  async findRoot() {
    return {
      success: true,
      data: await this.personService.findRootDefault(),
    };
  }

  @Get('integrity/report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get integrity report for disconnected components and isolated persons' })
  async getIntegrityReport() {
    return {
      success: true,
      data: await this.personService.getIntegrityReport(),
    };
  }

  @Post('integrity/repair-root')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-assign default root to main connected component' })
  async repairRootDefault() {
    return {
      success: true,
      data: await this.personService.repairRootDefaultToMainComponent(),
    };
  }

  @Post('integrity/connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect a disconnected component to main component' })
  async connectComponent(@Body() dto: ConnectDisconnectedComponentDto) {
    return {
      success: true,
      data: await this.personService.connectDisconnectedComponent(dto),
    };
  }

  @Delete('integrity/component/:personId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a disconnected component using any person ID from that component' })
  @ApiQuery({
    name: 'confirm',
    required: true,
    type: String,
    description: 'Safety confirmation token. Must be DELETE_COMPONENT.',
  })
  async removeDisconnectedComponent(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('confirm') confirm?: string,
  ) {
    if (confirm !== 'DELETE_COMPONENT') {
      throw new BadRequestException(
        'Missing confirmation token. Use confirm=DELETE_COMPONENT.',
      );
    }

    return {
      success: true,
      data: await this.personService.removeDisconnectedComponent(personId),
      message: 'Disconnected component deleted successfully',
    };
  }

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

  @Delete(':id/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a branch from a person (descendants + optional root person)' })
  @ApiQuery({ name: 'includeRoot', required: false, type: Boolean, description: 'true by default. If false, keeps selected person and deletes descendants only.' })
  async removeBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeRoot') includeRoot?: string,
  ) {
    const shouldIncludeRoot = includeRoot === undefined
      ? true
      : this.parseBooleanQuery(includeRoot, 'includeRoot');

    return {
      success: true,
      data: await this.personService.removeBranch(id, shouldIncludeRoot),
      message: shouldIncludeRoot
        ? 'Branch deleted successfully'
        : 'Descendants deleted successfully',
    };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete the entire tree (all persons and linked entities)' })
  @ApiQuery({
    name: 'confirm',
    required: true,
    type: String,
    description: 'Safety confirmation token. Must be DELETE_ALL.',
  })
  async removeAll(@Query('confirm') confirm?: string) {
    if (confirm !== 'DELETE_ALL') {
      throw new BadRequestException('Missing confirmation token. Use confirm=DELETE_ALL.');
    }

    return {
      success: true,
      data: await this.personService.removeAll(),
      message: 'Tree deleted successfully',
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

  private parsePositiveInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

    return Math.min(parsed, max);
  }

  private parseBooleanQuery(value: string, fieldName: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;

    throw new BadRequestException(`${fieldName} must be true/false (or 1/0).`);
  }
}
