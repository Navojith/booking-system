import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/dto/transforms.js';

export class CancelRegistrationDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
