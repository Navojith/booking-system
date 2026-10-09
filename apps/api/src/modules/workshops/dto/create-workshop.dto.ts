import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/dto/transforms.js';
import type { WorkshopStatus } from '../../../generated/prisma/enums.js';

export class CreateWorkshopDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,29}$/, {
    message: 'code must be 2-30 characters: letters, digits and dashes (e.g. POT-2026-014)',
  })
  code!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  instructor!: string;

  @IsUUID()
  locationId!: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;

  /** Defaults to SCHEDULED; use DRAFT to hide-from-booking until ready. */
  @IsOptional()
  @IsIn(['DRAFT', 'SCHEDULED'])
  status?: Extract<WorkshopStatus, 'DRAFT' | 'SCHEDULED'>;
}
