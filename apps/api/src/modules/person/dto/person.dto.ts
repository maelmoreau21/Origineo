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

  // ─── Nouveaux champs professionnels (Heredis-like) ───
  @ApiPropertyOptional({ example: 'Le Grand' })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ example: 'Dr.' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '1950-04-01' })
  @IsOptional()
  @IsDateString()
  baptismDate?: string;

  @ApiPropertyOptional({ example: 'Cathédrale Notre-Dame' })
  @IsOptional()
  @IsString()
  baptismPlace?: string;

  @ApiPropertyOptional({ example: '2020-11-05' })
  @IsOptional()
  @IsDateString()
  burialDate?: string;

  @ApiPropertyOptional({ example: 'Cimetière du Père Lachaise' })
  @IsOptional()
  @IsString()
  burialPlace?: string;

  @ApiPropertyOptional({ example: 'Crise cardiaque' })
  @IsOptional()
  @IsString()
  deathCause?: string;

  @ApiPropertyOptional({ example: 'Catholique' })
  @IsOptional()
  @IsString()
  religion?: string;

  @ApiPropertyOptional({ example: 'Yeux bleus, cheveux bruns, 1m80' })
  @IsOptional()
  @IsString()
  physicalDescription?: string;

  @ApiPropertyOptional({ example: 'Française' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ example: 'Doctorat en Histoire' })
  @IsOptional()
  @IsString()
  education?: string;

  @ApiPropertyOptional({ example: ['12 rue des Prés, Lyon', 'Paris'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  residences?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRootDefault?: boolean;
}

export class UpdatePersonDto extends PartialType(CreatePersonDto) {}
