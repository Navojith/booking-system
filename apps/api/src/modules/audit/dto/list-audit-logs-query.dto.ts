import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import type { AuditEntityType } from '../audit.service.js';

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['USER', 'WORKSHOP', 'REGISTRATION'])
  entityType?: AuditEntityType;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
