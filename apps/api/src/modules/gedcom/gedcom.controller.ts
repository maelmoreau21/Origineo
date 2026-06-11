// ══════════════════════════════════════
// GEDCOM Controller — Import/Export/Merge
// ══════════════════════════════════════

import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { Response } from 'express';
import { GedcomService } from './gedcom.service';
import { GedcomMergeService, MergeDecision } from './gedcom-merge.service';
import { GedcomJobService } from './gedcom-job.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('GEDCOM')
@Controller('gedcom')
export class GedcomController {
  constructor(
    private readonly gedcomService: GedcomService,
    private readonly gedcomMergeService: GedcomMergeService,
    private readonly gedcomJobService: GedcomJobService,
  ) {}

  // ─── Basic Import (overwrite mode) ─────────
  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a GEDCOM (.ged/.gedcom) file (creates all new)' })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  async importGedcom(
    @UploadedFile() file: Express.Multer.File,
    @Query('treeId') treeId: string,
  ) {
    this.assertGedcomFile(file);
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.gedcomService.importGedcom(treeId, file.buffer, file.originalname),
      message: 'GEDCOM file imported successfully',
    };
  }

  // ─── Merge Step 1: Analyze ─────────────────
  @Post('merge/analyze')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Analyze a GEDCOM file for merge: detect duplicates and return candidates',
  })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  async mergeAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Query('treeId') treeId: string,
  ) {
    this.assertGedcomFile(file);
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.gedcomMergeService.analyzeFile(
        treeId,
        file.buffer,
        file.originalname,
      ),
    };
  }

  // ─── Merge Step 2: Apply decisions ─────────
  @Post('merge/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Apply merge decisions for a previously analyzed GEDCOM file',
  })
  async mergeApply(
    @Body()
    body: {
      sessionId: string;
      decisions: MergeDecision[];
    },
  ) {
    if (!body.sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    return {
      success: true,
      data: await this.gedcomMergeService.applyMerge(
        body.sessionId,
        body.decisions || [],
      ),
      message: 'Merge applied successfully',
    };
  }

  @Post('jobs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a persisted GEDCOM import or merge job' })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  @ApiQuery({ name: 'mode', required: false, enum: ['import', 'merge'] })
  async createJob(
    @UploadedFile() file: Express.Multer.File,
    @Query('treeId') treeId: string,
    @Query('mode') mode: 'import' | 'merge' = 'import',
  ) {
    this.assertGedcomFile(file);
    this.assertTreeId(treeId);

    return {
      success: true,
      data: await this.gedcomJobService.createJob(
        treeId,
        file.buffer,
        file.originalname,
        mode,
      ),
      message: 'GEDCOM job created',
    };
  }

  @Get('jobs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a GEDCOM job status' })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  async getJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.gedcomJobService.getJob(treeId, id),
    };
  }

  @Get('jobs/:id/candidates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get duplicate candidates for a GEDCOM job' })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getJobCandidates(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.gedcomJobService.getCandidates(
        treeId,
        id,
        this.parsePositiveInt(page, 1, 10_000),
        this.parsePositiveInt(limit, 25, 100),
      ),
    };
  }

  @Post('jobs/:id/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply decisions for a GEDCOM job' })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  async applyJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('treeId') treeId: string,
    @Body() body: { decisions?: MergeDecision[] },
  ) {
    this.assertTreeId(treeId);
    return {
      success: true,
      data: await this.gedcomJobService.applyJob(treeId, id, body.decisions || []),
      message: 'GEDCOM job applied',
    };
  }

  // ─── Export ────────────────────────────────
  @Get('export')
  @ApiOperation({ summary: 'Export tree as GEDCOM 5.5.1 file' })
  @ApiQuery({
    name: 'rootPersonId',
    required: false,
    description: 'Root person UUID for partial export',
  })
  @ApiQuery({ name: 'treeId', required: true, description: 'Tree UUID' })
  @ApiQuery({ name: 'maxGenerations', required: false, type: Number })
  async exportGedcom(
    @Res() res: Response,
    @Query('treeId') treeId: string,
    @Query('rootPersonId') rootPersonId?: string,
    @Query('maxGenerations') maxGenerations?: number,
  ) {
    this.assertTreeId(treeId);
    const content = await this.gedcomService.exportGedcom(
      treeId,
      rootPersonId,
      maxGenerations,
    );

    const filename = rootPersonId
      ? `origineo_branch_${rootPersonId.slice(0, 8)}.ged`
      : 'origineo_full_export.ged';

    res.setHeader('Content-Type', 'text/x-gedcom; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(content);
  }

  private assertGedcomFile(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.ged') && !name.endsWith('.gedcom')) {
      throw new BadRequestException('File must be a .ged or .gedcom file');
    }
  }

  private assertTreeId(treeId?: string) {
    if (!treeId) {
      throw new BadRequestException('treeId is required');
    }
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
    max: number,
  ) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
  }
}
