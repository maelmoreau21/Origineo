import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateRepositoryDto {
  @ApiProperty({ description: 'UUID of the tree this repository belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({ example: 'Archives departementales de la Manche' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'DEPARTMENTAL_ARCHIVES' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'https://www.archives-manche.fr/' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}

export class UpdateRepositoryDto extends PartialType(CreateRepositoryDto) {}

export class CreateSourceDto {
  @ApiProperty({ description: 'UUID of the tree this source belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({ description: 'UUID of the archive repository' })
  @IsUUID()
  repositoryId: string;

  @ApiProperty({ example: 'Etat civil, naissances 1873-1882' })
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Free text describing the register or source content',
  })
  @IsOptional()
  @IsString()
  text?: string;
}

export class UpdateSourceDto extends PartialType(CreateSourceDto) {}

export class CreateCitationDto {
  @ApiProperty({ description: 'UUID of the tree this citation belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({ description: 'UUID of the source/register' })
  @IsUUID()
  sourceId: string;

  @ApiPropertyOptional({ example: 'Vue 42 / page 17' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Transcription of the act or relevant passage',
  })
  @IsOptional()
  @IsString()
  transcription?: string;

  @ApiPropertyOptional({
    description: 'Confidence score from 0 to 100',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidenceScore?: number;
}

export class UpdateCitationDto extends PartialType(CreateCitationDto) {}

export class CreateCitationLinkDto {
  @ApiProperty({ description: 'UUID of the tree this link belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({ description: 'UUID of the citation to link' })
  @IsUUID()
  citationId: string;

  @ApiPropertyOptional({ description: 'UUID of a linked person' })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional({ description: 'UUID of a linked union' })
  @IsOptional()
  @IsUUID()
  unionId?: string;
}
