import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegistrationStatus } from '../../../generated/prisma/enums.js';

export class PersonRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

export class RegistrationWorkshopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() title!: string;
  @ApiProperty() startsAt!: Date;
}

interface RegistrationRow {
  id: string;
  attendeeName: string;
  attendeeEmail: string;
  status: RegistrationStatus;
  registeredAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  promotedAt: Date | null;
  workshop: { id: string; code: string; title: string; startsAt: Date };
  registeredBy: { id: string; fullName: string };
  cancelledBy: { id: string; fullName: string } | null;
}

export class RegistrationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: RegistrationWorkshopRefDto }) workshop!: RegistrationWorkshopRefDto;
  @ApiProperty() attendeeName!: string;
  @ApiProperty() attendeeEmail!: string;
  @ApiProperty({ enum: RegistrationStatus, enumName: 'RegistrationStatus' })
  status!: RegistrationStatus;
  @ApiProperty({ type: PersonRefDto }) registeredBy!: PersonRefDto;
  @ApiProperty() registeredAt!: Date;
  @ApiPropertyOptional({ type: PersonRefDto, nullable: true }) cancelledBy!: PersonRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) cancelledAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Date }) promotedAt!: Date | null;

  static from(r: RegistrationRow): RegistrationResponseDto {
    return Object.assign(new RegistrationResponseDto(), {
      id: r.id,
      workshop: {
        id: r.workshop.id,
        code: r.workshop.code,
        title: r.workshop.title,
        startsAt: r.workshop.startsAt,
      },
      attendeeName: r.attendeeName,
      attendeeEmail: r.attendeeEmail,
      status: r.status,
      registeredBy: { id: r.registeredBy.id, fullName: r.registeredBy.fullName },
      registeredAt: r.registeredAt,
      cancelledBy: r.cancelledBy && { id: r.cancelledBy.id, fullName: r.cancelledBy.fullName },
      cancelledAt: r.cancelledAt,
      cancelReason: r.cancelReason,
      promotedAt: r.promotedAt,
    });
  }
}
