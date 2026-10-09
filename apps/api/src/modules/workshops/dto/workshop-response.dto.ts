import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkshopStatus } from '../../../generated/prisma/enums.js';
import { LocationResponseDto } from '../../locations/dto/location-response.dto.js';

export class WorkshopResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() instructor!: string;
  @ApiProperty({ type: LocationResponseDto }) location!: LocationResponseDto;
  @ApiProperty() startsAt!: Date;
  @ApiProperty() endsAt!: Date;
  @ApiProperty() capacity!: number;
  @ApiProperty() seatsTaken!: number;
  @ApiProperty() seatsAvailable!: number;
  @ApiProperty({ enum: WorkshopStatus, enumName: 'WorkshopStatus' }) status!: WorkshopStatus;
  /** Optimistic-concurrency token; also sent as the `ETag` header. */
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(w: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    instructor: string;
    location: { id: string; name: string; address: string };
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    seatsTaken: number;
    status: WorkshopStatus;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): WorkshopResponseDto {
    return Object.assign(new WorkshopResponseDto(), {
      id: w.id,
      code: w.code,
      title: w.title,
      description: w.description,
      instructor: w.instructor,
      location: { id: w.location.id, name: w.location.name, address: w.location.address },
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      capacity: w.capacity,
      seatsTaken: w.seatsTaken,
      seatsAvailable: w.capacity - w.seatsTaken,
      status: w.status,
      version: w.version,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    });
  }
}
