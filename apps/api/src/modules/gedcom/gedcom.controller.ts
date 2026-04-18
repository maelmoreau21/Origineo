// ══════════════════════════════════════
// GEDCOM Controller
// ══════════════════════════════════════

import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { GedcomService } from './gedcom.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('GEDCOM')
@Controller('gedcom')
export class GedcomController {
  constructor(private readonly gedcomService: GedcomService) {}

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import a GEDCOM (.ged) file' })
  async importGedcom(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.toLowerCase().endsWith('.ged')) {
      throw new BadRequestException('File must be a .ged file');
    }

    return {
      success: true,
      data: await this.gedcomService.importGedcom(file.buffer, file.originalname),
      message: 'GEDCOM file imported successfully',
    };
  }

  @Public()
  @Get('export')
  @ApiOperation({ summary: 'Export tree as GEDCOM 5.5.1 file' })
  @ApiQuery({ name: 'rootPersonId', required: false, description: 'Root person UUID for partial export' })
  @ApiQuery({ name: 'maxGenerations', required: false, type: Number })
  async exportGedcom(
    @Res() res: Response,
    @Query('rootPersonId') rootPersonId?: string,
    @Query('maxGenerations') maxGenerations?: number,
  ) {
    const content = await this.gedcomService.exportGedcom(
      rootPersonId,
      maxGenerations,
    );

    const filename = rootPersonId
      ? `origineo_branch_${rootPersonId.slice(0, 8)}.ged`
      : 'origineo_full_export.ged';

    res.setHeader('Content-Type', 'text/x-gedcom; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
