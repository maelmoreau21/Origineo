// ══════════════════════════════════════
// Tree Integrity DTOs
// ══════════════════════════════════════

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

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
}
