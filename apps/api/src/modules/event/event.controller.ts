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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  AttachEventParticipantDto,
  CreateEventDto,
  ReplaceEventParticipantsDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventService } from './event.service';

@ApiTags('Events')
@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an event with optional participants' })
  async create(@Body() dto: CreateEventDto) {
    return { success: true, data: await this.eventService.create(dto) };
  }

  @Get()
  @ApiOperation({ summary: 'List events for a tree' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('treeId') treeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.eventService.findAll(
        treeId,
        this.parsePositiveInt(page, 1),
        this.parsePositiveInt(limit, 20, 500),
      ),
    };
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'List events linked to a person' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findByPerson(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.eventService.findByPerson(
        treeId,
        personId,
        this.parsePositiveInt(page, 1),
        this.parsePositiveInt(limit, 20, 500),
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an event by ID' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.eventService.findOne(treeId, id) };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an event and optionally replace participants' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: UpdateEventDto,
  ) {
    this.assertTreeId(treeId);
    return { success: true, data: await this.eventService.update(treeId, id, dto) };
  }

  @Post(':id/participants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach or update one participant on an event' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async attachParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: AttachEventParticipantDto,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.eventService.attachParticipant(treeId, id, dto),
    };
  }

  @Put(':id/participants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replace all participants for an event' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async replaceParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() dto: ReplaceEventParticipantsDto,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.eventService.replaceParticipants(treeId, id, dto),
    };
  }

  @Delete(':id/participants/:personId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detach a participant from an event' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.eventService.removeParticipant(treeId, id, personId),
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an event' })
  @ApiQuery({ name: 'treeId', required: true, type: String })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    await this.eventService.remove(treeId, id);
    return { success: true, message: 'Event deleted successfully' };
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
