import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateWorkshopDto } from './dto/create-workshop.dto.js';
import { ListWorkshopsQueryDto } from './dto/list-workshops-query.dto.js';
import { UpdateWorkshopDto } from './dto/update-workshop.dto.js';
import { WorkshopResponseDto } from './dto/workshop-response.dto.js';
import { canTransition, isClosed } from './workshop-status.js';

const WITH_LOCATION = { location: true } as const;

const snapshot = (w: Prisma.WorkshopGetPayload<object>) => ({
  code: w.code,
  title: w.title,
  description: w.description,
  instructor: w.instructor,
  locationId: w.locationId,
  startsAt: w.startsAt.toISOString(),
  endsAt: w.endsAt.toISOString(),
  capacity: w.capacity,
  status: w.status,
});

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ListWorkshopsQueryDto): Promise<PaginatedResponseDto<WorkshopResponseDto>> {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('"from" must not be after "to"');
    }
    const { workshop } = this.txHost.tx;

    const where: Prisma.WorkshopWhereInput = {
      status: query.status,
      locationId: query.locationId,
      ...((query.from || query.to) && { startsAt: { gte: query.from, lte: query.to } }),
      // Compares two columns of the same row (seatsTaken < capacity) via a field reference.
      ...(query.hasSeats === true && { seatsTaken: { lt: workshop.fields.capacity } }),
      ...(query.hasSeats === false && { seatsTaken: { gte: workshop.fields.capacity } }),
      ...(query.q && {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: query.q, mode: 'insensitive' } },
          { instructor: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [field, dir] = query.sort.split(':') as ['startsAt' | 'title' | 'code', 'asc' | 'desc'];
    const [rows, total] = await Promise.all([
      workshop.findMany({
        where,
        include: WITH_LOCATION,
        orderBy: [{ [field]: dir }, { id: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      workshop.count({ where }),
    ]);
    return PaginatedResponseDto.of(rows.map((w) => WorkshopResponseDto.from(w)), total, query);
  }

  async findOne(id: string): Promise<WorkshopResponseDto> {
    const row = await this.txHost.tx.workshop.findUnique({ where: { id }, include: WITH_LOCATION });
    if (!row) throw new NotFoundException('Workshop not found');
    return WorkshopResponseDto.from(row);
  }

  @Transactional()
  async create(dto: CreateWorkshopDto, actor: AuthUser): Promise<WorkshopResponseDto> {
    this.assertTimeOrder(dto.startsAt, dto.endsAt);
    await this.assertLocationExists(dto.locationId);

    const taken = await this.txHost.tx.workshop.findUnique({ where: { code: dto.code } });
    if (taken) {
      throw new AppException(HttpStatus.CONFLICT, 'CODE_TAKEN', `Workshop code ${dto.code} is already in use`);
    }

    const row = await this.txHost.tx.workshop.create({
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description,
        instructor: dto.instructor,
        locationId: dto.locationId,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        capacity: dto.capacity,
        status: dto.status ?? 'SCHEDULED',
        createdById: actor.id,
        updatedById: actor.id,
      },
      include: WITH_LOCATION,
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'WORKSHOP_CREATED',
      entityType: 'WORKSHOP',
      entityId: row.id,
      after: snapshot(row),
    });
    return WorkshopResponseDto.from(row);
  }

  @Transactional()
  async update(
    id: string,
    dto: UpdateWorkshopDto,
    expectedVersion: number,
    actor: AuthUser,
  ): Promise<WorkshopResponseDto> {
    const current = await this.txHost.tx.workshop.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Workshop not found');
    this.assertVersion(current.version, expectedVersion);

    if (isClosed(current.status)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'WORKSHOP_CLOSED',
        `A ${current.status.toLowerCase()} workshop can no longer be edited`,
      );
    }
    if (dto.status && dto.status !== current.status && !canTransition(current.status, dto.status)) {
      throw this.badTransition(current.status, dto.status);
    }
    this.assertTimeOrder(dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt);
    if (dto.locationId) await this.assertLocationExists(dto.locationId);
    if (dto.capacity !== undefined && dto.capacity < current.seatsTaken) {
      throw this.capacityBelowSeats(current.seatsTaken);
    }

    // Single conditional write: the version guard rejects a concurrent edit, and the
    // seatsTaken guard rejects a capacity cut that raced with a new registration.
    const { count } = await this.txHost.tx.workshop.updateMany({
      where: {
        id,
        version: expectedVersion,
        ...(dto.capacity !== undefined && { seatsTaken: { lte: dto.capacity } }),
      },
      data: {
        title: dto.title,
        description: dto.description,
        instructor: dto.instructor,
        locationId: dto.locationId,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        capacity: dto.capacity,
        status: dto.status,
        updatedById: actor.id,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      const latest = await this.txHost.tx.workshop.findUniqueOrThrow({ where: { id } });
      this.assertVersion(latest.version, expectedVersion);
      throw this.capacityBelowSeats(latest.seatsTaken);
    }
    const updated = await this.txHost.tx.workshop.findUniqueOrThrow({ where: { id } });
    await this.audit.record({
      actorId: actor.id,
      action: 'WORKSHOP_UPDATED',
      entityType: 'WORKSHOP',
      entityId: id,
      before: snapshot(current),
      after: snapshot(updated),
    });
    // Extra capacity goes to the waitlist first, in order.
    if (updated.status === 'SCHEDULED' && updated.startsAt > new Date()) {
      await this.promoteWaitlist(id, updated.capacity - updated.seatsTaken, actor);
    }
    return this.findOne(id);
  }

  /** Moves up to `seats` of the oldest waitlisted attendees into open seats. */
  private async promoteWaitlist(workshopId: string, seats: number, actor: AuthUser) {
    if (seats <= 0) return;
    const promoted = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      UPDATE "Registration" SET status = 'ACTIVE', "promotedAt" = now()
      WHERE id IN (
        SELECT id FROM "Registration"
        WHERE "workshopId" = ${workshopId} AND status = 'WAITLISTED'
        ORDER BY "registeredAt" ASC, id ASC
        LIMIT ${seats} FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (promoted.length === 0) return;
    await this.txHost.tx.workshop.update({
      where: { id: workshopId },
      data: { seatsTaken: { increment: promoted.length } },
    });
    for (const { id } of promoted) {
      await this.audit.record({
        actorId: actor.id,
        action: 'REGISTRATION_PROMOTED',
        entityType: 'REGISTRATION',
        entityId: id,
        before: { status: 'WAITLISTED' },
        after: { status: 'ACTIVE' },
      });
    }
  }

  @Transactional()
  async cancel(id: string, expectedVersion: number | undefined, actor: AuthUser) {
    const current = await this.txHost.tx.workshop.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Workshop not found');
    if (expectedVersion !== undefined) this.assertVersion(current.version, expectedVersion);
    if (!canTransition(current.status, 'CANCELLED')) {
      throw this.badTransition(current.status, 'CANCELLED');
    }

    // Registrations are intentionally left untouched: staff contact attendees themselves.
    const { count } = await this.txHost.tx.workshop.updateMany({
      where: { id, version: current.version },
      data: { status: 'CANCELLED', updatedById: actor.id, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new AppException(HttpStatus.PRECONDITION_FAILED, 'STALE_VERSION', this.staleMessage);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'WORKSHOP_CANCELLED',
      entityType: 'WORKSHOP',
      entityId: id,
      before: { status: current.status },
      after: { status: 'CANCELLED' },
    });
    return this.findOne(id);
  }

  private readonly staleMessage =
    'This workshop was changed by someone else. Reload it and try again.';

  private assertVersion(actual: number, expected: number) {
    if (actual !== expected) {
      throw new AppException(HttpStatus.PRECONDITION_FAILED, 'STALE_VERSION', this.staleMessage);
    }
  }

  private assertTimeOrder(startsAt: Date, endsAt: Date) {
    if (endsAt <= startsAt) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_TIME_RANGE',
        'The workshop must end after it starts',
      );
    }
  }

  private async assertLocationExists(locationId: string) {
    const found = await this.txHost.tx.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!found) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'LOCATION_NOT_FOUND', 'Unknown location');
    }
  }

  private capacityBelowSeats(seatsTaken: number) {
    return new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CAPACITY_BELOW_SEATS_TAKEN',
      `Capacity cannot be lower than the ${seatsTaken} seats already taken`,
    );
  }

  private badTransition(from: string, to: string) {
    return new AppException(
      HttpStatus.CONFLICT,
      'INVALID_STATUS_TRANSITION',
      `A ${from.toLowerCase()} workshop cannot become ${to.toLowerCase()}`,
    );
  }
}
