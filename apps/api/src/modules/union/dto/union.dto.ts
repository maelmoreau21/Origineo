// ══════════════════════════════════════
// Union DTOs
// ══════════════════════════════════════

import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

enum UnionType {
  MARRIAGE = 'MARRIAGE',
  PACS = 'PACS',
  PARTNERSHIP = 'PARTNERSHIP',
  OTHER = 'OTHER',
}

enum UnionEndReason {
  DIVORCE = 'DIVORCE',
  DEATH = 'DEATH',
  ANNULMENT = 'ANNULMENT',
  OTHER = 'OTHER',
}

export class CreateUnionDto {
  @ApiProperty({ description: 'UUID of the tree this union belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({ description: 'UUID of partner 1' })
  @IsUUID()
  partner1Id: string;

  @ApiProperty({ description: 'UUID of partner 2' })
  @IsUUID()
  partner2Id: string;

  @ApiPropertyOptional({ enum: UnionType, default: UnionType.MARRIAGE })
  @IsOptional()
  @IsEnum(UnionType)
  type?: UnionType;

  @ApiPropertyOptional({ example: '1975-06-21' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 'Paris, France' })
  @IsOptional()
  @IsString()
  startPlace?: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: UnionEndReason })
  @IsOptional()
  @IsEnum(UnionEndReason)
  endReason?: UnionEndReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateUnionDto extends PartialType(CreateUnionDto) {}
