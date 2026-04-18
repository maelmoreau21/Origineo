// ══════════════════════════════════════
// Relationship DTOs
// ══════════════════════════════════════

import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum RelationshipType {
  BIOLOGICAL = 'BIOLOGICAL',
  ADOPTIVE = 'ADOPTIVE',
  FOSTER = 'FOSTER',
}

export class CreateRelationshipDto {
  @ApiProperty({ description: 'UUID of the parent' })
  @IsUUID()
  parentId: string;

  @ApiProperty({ description: 'UUID of the child' })
  @IsUUID()
  childId: string;

  @ApiPropertyOptional({ enum: RelationshipType, default: RelationshipType.BIOLOGICAL })
  @IsOptional()
  @IsEnum(RelationshipType)
  type?: RelationshipType;
}
