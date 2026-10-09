import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../../common/dto/transforms.js';

export class CreateRegistrationDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  attendeeName!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  attendeeEmail!: string;

  /** When the workshop is full, queue the attendee instead of failing with WORKSHOP_FULL. */
  @IsOptional()
  @IsBoolean()
  joinWaitlist?: boolean;
}
