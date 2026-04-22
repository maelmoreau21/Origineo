// ══════════════════════════════════════
// Document Controller — File Upload/Download
// ══════════════════════════════════════

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
  BadRequestException,
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
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document for a person or union' })
  @ApiQuery({ name: 'personId', required: false })
  @ApiQuery({ name: 'unionId', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'description', required: false })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('personId') personId?: string,
    @Query('unionId') unionId?: string,
    @Query('category') category?: string,
    @Query('description') description?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return {
      success: true,
      data: await this.documentService.upload(
        file,
        personId,
        unionId,
        category,
        description,
      ),
    };
  }

  @Get('person/:personId')
  @ApiOperation({ summary: 'List all documents for a person' })
  async findByPerson(@Param('personId', ParseUUIDPipe) personId: string) {
    return {
      success: true,
      data: await this.documentService.findByPerson(personId),
    };
  }

  @Get('union/:unionId')
  @ApiOperation({ summary: 'List all documents for a union' })
  async findByUnion(@Param('unionId', ParseUUIDPipe) unionId: string) {
    return {
      success: true,
      data: await this.documentService.findByUnion(unionId),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.documentService.findOne(id),
    };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a document file' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { absolutePath, document } =
      await this.documentService.getFilePath(id);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.filename)}"`,
    );
    res.sendFile(absolutePath);
  }

  @Get(':id/view')
  @ApiOperation({ summary: 'View a document inline (images, PDFs)' })
  async view(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { absolutePath, document } =
      await this.documentService.getFilePath(id);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(document.filename)}"`,
    );
    res.sendFile(absolutePath);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a document (file + record)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return {
      success: true,
      data: await this.documentService.remove(id),
    };
  }

  @Post('profile-photo/:personId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace a profile photo for a person' })
  async uploadProfilePhoto(
    @Param('personId', ParseUUIDPipe) personId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return {
      success: true,
      data: await this.documentService.uploadProfilePhoto(personId, file),
    };
  }

  @Get('profile-photo/:personId')
  @ApiOperation({ summary: 'View profile photo for a person (inline)' })
  async viewProfilePhoto(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Res() res: Response,
  ) {
    const result = this.documentService.getProfilePhotoPath(personId);
    if (!result) {
      res.status(404).json({ message: 'No profile photo found' });
      return;
    }

    const ext = result.filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(result.absolutePath);
  }

  @Get('profile-photo/:personId/exists')
  @ApiOperation({ summary: 'Check if a person has a profile photo' })
  async hasProfilePhoto(@Param('personId', ParseUUIDPipe) personId: string) {
    return {
      success: true,
      data: { hasPhoto: this.documentService.hasProfilePhoto(personId) },
    };
  }
}
