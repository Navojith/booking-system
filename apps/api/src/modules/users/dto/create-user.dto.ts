import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../../common/dto/transforms.js';
import { Role } from '../../../generated/prisma/enums.js';

export class CreateUserDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
