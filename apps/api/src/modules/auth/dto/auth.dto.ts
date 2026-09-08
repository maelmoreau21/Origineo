// ══════════════════════════════════════
// Origineo — Auth DTOs
// ══════════════════════════════════════

import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum ManagedUserRole {
  ADMIN = 'ADMIN',
  VISITOR = 'VISITOR',
}

export class LoginDto {
  @ApiProperty({ example: 'admin@origineo.local' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'admin123456' })
  @IsString()
  password: string;
}

export class CreateManagedUserDto {
  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'MotDePasseSecurise123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Jean Dupont' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: ManagedUserRole, default: ManagedUserRole.VISITOR })
  @IsOptional()
  @IsEnum(ManagedUserRole)
  role?: 'ADMIN' | 'VISITOR';
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ManagedUserRole })
  @IsEnum(ManagedUserRole)
  role: 'ADMIN' | 'VISITOR';
}

export class UpdateUserStatusDto {
  @ApiProperty({ default: true, description: 'Définir sur false pour désactiver le compte, true pour réactiver.' })
  @IsBoolean()
  active: boolean;
}
