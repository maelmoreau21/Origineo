// ══════════════════════════════════════
// Person Controller
// ══════════════════════════════════════

import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Request,
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
import { CreatePersonDto, CreateRelativeDto, UpdatePersonDto } from './dto/person.dto';
import {
  ConnectDisconnectedComponentDto,
  UpdateQualityRulesDto,
} from './dto/tree-integrity.dto';
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
  async create(@Request() req: any, @Body() dto: CreatePersonDto) {
    return {
      success: true,
      data: await this.personService.create(dto, req.user?.email),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all persons (paginated)' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('treeId') treeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);
    const parsedPage = this.parsePositiveInt(page, 1);
    const parsedLimit = this.parsePositiveInt(limit, 20, 500);

    return {
      success: true,
      data: await this.personService.findAll(treeId, parsedPage, parsedLimit),
    };
  }

  @Get('root')
  @ApiOperation({ summary: 'Get the default root person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findRoot(@Query('treeId') treeId: string) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.findRootDefault(treeId),
    };
  }

  @Get('integrity/report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get integrity report for disconnected components and isolated persons' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async getIntegrityReport(@Query('treeId') treeId: string) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.getIntegrityReport(treeId),
    };
  }

  @Get('integrity/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tree quality rules' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async getQualityRules(@Query('treeId') treeId: string) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.getQualityRules(treeId),
    };
  }

  @Post('integrity/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update tree quality rules' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async updateQualityRules(
    @Request() req: any,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateQualityRulesDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.updateQualityRules(treeId, dto, req.user?.email),
    };
  }

  @Get('integrity/logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tree repair logs' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRepairLogs(
    @Query('treeId') treeId: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);
    const parsedLimit = this.parsePositiveInt(limit, 40, 500);
    return {
      success: true,
      data: await this.personService.getRepairLogs(treeId, parsedLimit),
    };
  }

  @Post('integrity/logs/:id/undo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Undo a repair log entry if reversible' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'simulate', required: false, type: Boolean })
  async undoRepairLog(
    @Request() req: any,
    @Param('id') id: string,
    @Query('treeId') treeId: string,
    @Query('simulate') simulate?: string,
  ) {
    this.assertTreeId(treeId);
    const shouldSimulate = simulate === undefined
      ? false
      : this.parseBooleanQuery(simulate, 'simulate');

    return {
      success: true,
      data: await this.personService.undoRepairLog(treeId, id, req.user?.email, shouldSimulate),
    };
  }

  @Post('integrity/repair-root')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-assign default root to main connected component' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'simulate', required: false, type: Boolean })
  async repairRootDefault(
    @Request() req: any,
    @Query('treeId') treeId: string,
    @Query('simulate') simulate?: string,
  ) {
    this.assertTreeId(treeId);
    const shouldSimulate = simulate === undefined
      ? false
      : this.parseBooleanQuery(simulate, 'simulate');

    return {
      success: true,
      data: await this.personService.repairRootDefaultToMainComponent({
        treeId,
        simulate: shouldSimulate,
        actor: req.user?.email,
      }),
    };
  }

  @Post('integrity/connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect a disconnected component to main component' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async connectComponent(
    @Request() req: any,
    @Query('treeId') treeId: string,
    @Body() dto: ConnectDisconnectedComponentDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.connectDisconnectedComponent({
        ...dto,
        treeId,
        actor: req.user?.email,
      }),
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
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'simulate', required: false, type: Boolean })
  async removeDisconnectedComponent(
    @Request() req: any,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
    @Query('confirm') confirm?: string,
    @Query('simulate') simulate?: string,
  ) {
    this.assertTreeId(treeId);
    if (confirm !== 'DELETE_COMPONENT') {
      throw new BadRequestException(
        'Missing confirmation token. Use confirm=DELETE_COMPONENT.',
      );
    }

    const shouldSimulate = simulate === undefined
      ? false
      : this.parseBooleanQuery(simulate, 'simulate');

    return {
      success: true,
      data: await this.personService.removeDisconnectedComponent(treeId, personId, {
        simulate: shouldSimulate,
        actor: req.user?.email,
      }),
      message: 'Disconnected component deleted successfully',
    };
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get person modification history' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPersonHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);
    const parsedLimit = this.parsePositiveInt(limit, 120, 500);
    return {
      success: true,
      data: await this.personService.getPersonHistory(treeId, id, parsedLimit),
    };
  }

  @Post(':id/relatives')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a relative and attach it to the selected person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async createRelative(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: CreateRelativeDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.createRelative(treeId, id, dto, req.user?.email),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a person by ID with relationships' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.findOne(treeId, id),
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdatePersonDto,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.personService.update(treeId, id, dto, req.user?.email),
    };
  }

  @Delete(':id/branch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a branch from a person (descendants + optional root person)' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'includeRoot', required: false, type: Boolean, description: 'true by default. If false, keeps selected person and deletes descendants only.' })
  @ApiQuery({ name: 'simulate', required: false, type: Boolean, description: 'Preview impacted persons, relationships, unions and documents without deleting.' })
  async removeBranch(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Query('includeRoot') includeRoot?: string,
    @Query('simulate') simulate?: string,
  ) {
    this.assertTreeId(treeId);
    const shouldIncludeRoot = includeRoot === undefined
      ? true
      : this.parseBooleanQuery(includeRoot, 'includeRoot');
    const shouldSimulate = simulate === undefined
      ? false
      : this.parseBooleanQuery(simulate, 'simulate');

    return {
      success: true,
      data: await this.personService.removeBranch(
        treeId,
        id,
        shouldIncludeRoot,
        req.user?.email,
        shouldSimulate,
      ),
      message: shouldSimulate
        ? 'Branch delete preview generated'
        : shouldIncludeRoot
        ? 'Branch deleted successfully'
        : 'Descendants deleted successfully',
    };
  }

  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete the entire tree (all persons and linked entities)' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({
    name: 'confirm',
    required: true,
    type: String,
    description: 'Safety confirmation token. Must be DELETE_ALL.',
  })
  async removeAll(
    @Request() req: any,
    @Query('treeId') treeId: string,
    @Query('confirm') confirm?: string,
  ) {
    this.assertTreeId(treeId);
    if (confirm !== 'DELETE_ALL') {
      throw new BadRequestException('Missing confirmation token. Use confirm=DELETE_ALL.');
    }

    return {
      success: true,
      data: await this.personService.removeAll(treeId, req.user?.email),
      message: 'Tree deleted successfully',
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async remove(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.personService.remove(treeId, id, req.user?.email);
    return { success: true, message: 'Person deleted successfully' };
  }

  private assertTreeId(treeId?: string) {
    if (!treeId) {
      throw new BadRequestException('treeId is required.');
    }
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
