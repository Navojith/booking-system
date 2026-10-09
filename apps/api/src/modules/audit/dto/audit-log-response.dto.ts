import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  requestId: string | null;
  createdAt: Date;
  actor: { id: string; fullName: string };
}

export class AuditActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

export class AuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: ['USER', 'WORKSHOP', 'REGISTRATION'] }) entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty({ type: AuditActorDto }) actor!: AuditActorDto;
  @ApiPropertyOptional({ type: Object, nullable: true }) before!: unknown;
  @ApiPropertyOptional({ type: Object, nullable: true }) after!: unknown;
  @ApiPropertyOptional({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(r: AuditRow): AuditLogResponseDto {
    return Object.assign(new AuditLogResponseDto(), {
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: { id: r.actor.id, fullName: r.actor.fullName },
      before: r.before,
      after: r.after,
      requestId: r.requestId,
      createdAt: r.createdAt,
    });
  }
}
