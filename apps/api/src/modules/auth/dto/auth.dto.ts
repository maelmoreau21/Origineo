// ══════════════════════════════════════
// Auth DTOs
// ══════════════════════════════════════

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@origineo.app' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'admin@origineo.app' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Admin User' })
  @IsOptional()
  @IsString()
  displayName?: string;
}
