import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class EventParticipantInputDto {
  @ApiProperty({ description: 'UUID of the linked person' })
  @IsUUID()
  personId: string;

  @ApiProperty({
    description: 'Role of the person in this event',
    example: 'WITNESS',
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}

export class CreateEventDto {
  @ApiProperty({ description: 'UUID of the tree this event belongs to' })
  @IsUUID()
  treeId: string;

  @ApiProperty({
    description: 'Free event type, for example CENSUS or MILITARY_SERVICE',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({
    description: 'Normalized date when known exactly',
    example: '1730-01-01',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  date?: string | null;

  @ApiPropertyOptional({
    description: 'Original fuzzy date text, for example "vers 1730"',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  dateRaw?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'UUID of the normalized place',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  placeId?: string | null;

  @ApiPropertyOptional({
    type: [EventParticipantInputDto],
    description: 'People linked to this event and their role',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique((participant: EventParticipantInputDto) => participant.personId)
  @ValidateNested({ each: true })
  @Type(() => EventParticipantInputDto)
  participants?: EventParticipantInputDto[];
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class AttachEventParticipantDto extends EventParticipantInputDto {}

export class ReplaceEventParticipantsDto {
  @ApiProperty({ type: [EventParticipantInputDto] })
  @IsArray()
  @ArrayUnique((participant: EventParticipantInputDto) => participant.personId)
  @ValidateNested({ each: true })
  @Type(() => EventParticipantInputDto)
  participants: EventParticipantInputDto[];
}
