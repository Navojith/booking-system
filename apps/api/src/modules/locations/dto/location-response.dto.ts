import { ApiProperty } from '@nestjs/swagger';

export class LocationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
}
