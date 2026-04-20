// ══════════════════════════════════════
// Tree Integrity DTOs
// ══════════════════════════════════════

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsUUID, Max, Min } from 'class-validator';

enum IntegrityLinkMode {
  PARENT_OF_COMPONENT = 'PARENT_OF_COMPONENT',
  CHILD_OF_COMPONENT = 'CHILD_OF_COMPONENT',
  UNION = 'UNION',
}

enum IntegrityRelationshipType {
  BIOLOGICAL = 'BIOLOGICAL',
  ADOPTIVE = 'ADOPTIVE',
  FOSTER = 'FOSTER',
}

enum IntegrityUnionType {
  MARRIAGE = 'MARRIAGE',
  PACS = 'PACS',
  PARTNERSHIP = 'PARTNERSHIP',
  OTHER = 'OTHER',
}

export class ConnectDisconnectedComponentDto {
  @ApiPropertyOptional({
    description: 'A person UUID that belongs to a disconnected component.',
  })
  @IsUUID()
  componentPersonId: string;

  @ApiPropertyOptional({
    description: 'Anchor person UUID from the main component. If omitted, root/main representative is used.',
  })
  @IsOptional()
  @IsUUID()
  anchorPersonId?: string;

  @ApiPropertyOptional({
    enum: IntegrityLinkMode,
    default: IntegrityLinkMode.PARENT_OF_COMPONENT,
  })
  @IsOptional()
  @IsEnum(IntegrityLinkMode)
  linkMode?: IntegrityLinkMode;

  @ApiPropertyOptional({
    enum: IntegrityRelationshipType,
    default: IntegrityRelationshipType.FOSTER,
  })
  @IsOptional()
  @IsEnum(IntegrityRelationshipType)
  relationshipType?: IntegrityRelationshipType;

  @ApiPropertyOptional({
    enum: IntegrityUnionType,
    default: IntegrityUnionType.OTHER,
  })
  @IsOptional()
  @IsEnum(IntegrityUnionType)
  unionType?: IntegrityUnionType;

  @ApiPropertyOptional({
    description: 'If true, only simulate without writing changes to database.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  simulate?: boolean;
}

export class UpdateQualityRulesDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireParentKnown?: boolean;

  @ApiPropertyOptional({ default: 12, minimum: 10, maximum: 35 })
  @IsOptional()
  @Min(10)
  @Max(35)
  minBiologicalParentAge?: number;

  @ApiPropertyOptional({ default: 80, minimum: 40, maximum: 120 })
  @IsOptional()
  @Min(40)
  @Max(120)
  maxBiologicalParentAge?: number;

  @ApiPropertyOptional({ default: 120, minimum: 60, maximum: 140 })
  @IsOptional()
  @Min(60)
  @Max(140)
  maxLifespanYears?: number;
}
