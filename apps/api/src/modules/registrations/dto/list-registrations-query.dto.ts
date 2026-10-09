import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { NormalizeEmail } from '../../../common/dto/transforms.js';
import { RegistrationStatus } from '../../../generated/prisma/enums.js';

/** Roster of one workshop: optionally narrowed by status. */
export class ListWorkshopRegistrationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus;
}

/** Cross-workshop history lookup ("what has this person booked?"). */
export class ListRegistrationsQueryDto extends ListWorkshopRegistrationsQueryDto {
  /** Case-insensitive partial match on the attendee email. */
  @IsOptional()
  @NormalizeEmail()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  workshopId?: string;

  /** Inclusive lower bound on when the registration was made. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** Inclusive upper bound on when the registration was made. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
