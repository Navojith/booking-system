import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { WorkshopStatus } from '../../../generated/prisma/enums.js';

export const WORKSHOP_SORTS = [
  'startsAt:asc',
  'startsAt:desc',
  'title:asc',
  'title:desc',
  'code:asc',
  'code:desc',
] as const;
export type WorkshopSort = (typeof WORKSHOP_SORTS)[number];

export class ListWorkshopsQueryDto extends PaginationQueryDto {
  /** Inclusive lower bound on the start time (ISO-8601). */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** Inclusive upper bound on the start time (ISO-8601). */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsEnum(WorkshopStatus)
  status?: WorkshopStatus;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** true = only workshops with a free seat; false = only full ones. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasSeats?: boolean;

  /** Free-text match on code, title or instructor. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: WORKSHOP_SORTS, default: 'startsAt:asc' })
  @IsOptional()
  @IsIn(WORKSHOP_SORTS)
  sort: WorkshopSort = 'startsAt:asc';
}
