// ══════════════════════════════════════
// Document DTOs
// ══════════════════════════════════════

import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum DocumentCategory {
  BIRTH_CERTIFICATE = 'BIRTH_CERTIFICATE',
  DEATH_CERTIFICATE = 'DEATH_CERTIFICATE',
  MARRIAGE_CERTIFICATE = 'MARRIAGE_CERTIFICATE',
  PHOTO = 'PHOTO',
  OFFICIAL_DOCUMENT = 'OFFICIAL_DOCUMENT',
  OTHER = 'OTHER',
}

export class UploadDocumentDto {
  @ApiPropertyOptional({ description: 'UUID of the person (for individual documents)' })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional({ description: 'UUID of the union (for couple documents)' })
  @IsOptional()
  @IsUUID()
  unionId?: string;

  @ApiPropertyOptional({ enum: DocumentCategory, default: DocumentCategory.OTHER })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiPropertyOptional({ description: 'Description of the document' })
  @IsOptional()
  @IsString()
  description?: string;
}
