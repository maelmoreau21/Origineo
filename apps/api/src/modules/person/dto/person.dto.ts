// ══════════════════════════════════════
// Person DTOs
// ══════════════════════════════════════

import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

export class CreatePersonDto {
  @ApiPropertyOptional({ example: 'Dupont' })
  @IsOptional()
  @IsString()
  usageSurname?: string;

  @ApiPropertyOptional({ example: 'Martin' })
  @IsOptional()
  @IsString()
  birthSurname?: string;

  @ApiProperty({ example: 'Jean Marie' })
  @IsString()
  givenNames: string;

  @ApiPropertyOptional({ enum: Gender, default: Gender.UNKNOWN })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1950-03-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'Paris, France' })
  @IsOptional()
  @IsString()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '2020-11-01' })
  @IsOptional()
  @IsDateString()
  deathDate?: string;

  @ApiPropertyOptional({ example: 'Lyon, France' })
  @IsOptional()
  @IsString()
  deathPlace?: string;

  @ApiPropertyOptional({ example: ['Instituteur', 'Écrivain'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  professions?: string[];

  @ApiPropertyOptional({ example: 'Ancien combattant de la 2e GM.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRootDefault?: boolean;
}

export class UpdatePersonDto extends PartialType(CreatePersonDto) {}
