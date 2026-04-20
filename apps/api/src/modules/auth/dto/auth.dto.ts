// ══════════════════════════════════════
// Auth DTOs
// ══════════════════════════════════════

import {
  IsArray,
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
  @ApiProperty({ example: 'root' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'root' })
  @IsString()
  password: string;
}

export class CreateManagedUserDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Admin User' })
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
  @ApiProperty({ default: true, description: 'Set false to deactivate the account, true to reactivate.' })
  @IsBoolean()
  active: boolean;
}

export class LdapConfigDto {
  @ApiProperty({ default: false })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ example: 'ldap://ad.example.local:389' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: 'CN=svc-origineo,OU=Service Accounts,DC=example,DC=local' })
  @IsOptional()
  @IsString()
  bindDn?: string;

  @ApiPropertyOptional({ example: 'superSecretBindPassword' })
  @IsOptional()
  @IsString()
  bindPassword?: string;

  @ApiPropertyOptional({ example: 'OU=Users,DC=example,DC=local' })
  @IsOptional()
  @IsString()
  userSearchBase?: string;

  @ApiPropertyOptional({ example: '(|(sAMAccountName={{username}})(mail={{username}}))' })
  @IsOptional()
  @IsString()
  userSearchFilter?: string;

  @ApiPropertyOptional({ example: 'memberOf', default: 'memberOf' })
  @IsOptional()
  @IsString()
  groupAttribute?: string;

  @ApiPropertyOptional({ type: [String], example: ['CN=Origineo_Admins,OU=Groups,DC=example,DC=local'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminGroupDns?: string[];

  @ApiPropertyOptional({ type: [String], example: ['CN=Origineo_Users,OU=Groups,DC=example,DC=local'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userGroupDns?: string[];
}
