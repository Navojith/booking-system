import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaClientKnownRequestError } from '../../generated/prisma/internal/prismaNamespace.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CancelRegistrationDto } from './dto/cancel-registration.dto.js';
import { CreateRegistrationDto } from './dto/create-registration.dto.js';
import {
  ListRegistrationsQueryDto,
  ListWorkshopRegistrationsQueryDto,
} from './dto/list-registrations-query.dto.js';
import { RegistrationResponseDto } from './dto/registration-response.dto.js';

const INCLUDE = {
  workshop: { select: { id: true, code: true, title: true, startsAt: true } },
  registeredBy: { select: { id: true, fullName: true } },
  cancelledBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Claims a seat and records the registration in one transaction. The seat claim is a
   * single conditional UPDATE: Postgres row-locks the workshop, so concurrent requests
   * serialise and each re-checks `seatsTaken < capacity` against the committed value.
   * The CHECK constraint on Workshop is a second line of defence.
   */
  @Transactional()
  async register(
    workshopId: string,
    dto: CreateRegistrationDto,
    actor: AuthUser,
  ): Promise<RegistrationResponseDto> {
    const { workshop, registration } = this.txHost.tx;

    // Cheap pre-check so a duplicate is reported as such even when the workshop is full.
    // The partial unique index remains the authority for races (see P2002 below).
    const existing = await registration.findFirst({
      where: { workshopId, attendeeEmail: dto.attendeeEmail, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existing) throw this.alreadyRegistered();

    const claimed = await workshop.updateMany({
      where: {
        id: workshopId,
        status: 'SCHEDULED',
        startsAt: { gt: new Date() },
        seatsTaken: { lt: workshop.fields.capacity },
      },
      data: { seatsTaken: { increment: 1 } },
    });
    // Open but full: queue the attendee if they asked to, otherwise report it.
    const waitlisted = claimed.count === 0;
    if (waitlisted) {
      await this.explainClaimFailure(workshopId);
      if (!dto.joinWaitlist) throw this.workshopFull();
    }

    try {
      const row = await registration.create({
        data: {
          workshopId,
          attendeeName: dto.attendeeName,
          attendeeEmail: dto.attendeeEmail,
          status: waitlisted ? 'WAITLISTED' : 'ACTIVE',
          registeredById: actor.id,
        },
        include: INCLUDE,
      });
      await this.audit.record({
        actorId: actor.id,
        action: waitlisted ? 'REGISTRATION_WAITLISTED' : 'REGISTRATION_CREATED',
        entityType: 'REGISTRATION',
        entityId: row.id,
        after: { workshopId, attendeeEmail: row.attendeeEmail, status: row.status },
      });
      return RegistrationResponseDto.from(row);
    } catch (e) {
      // Throwing rolls the whole transaction back, releasing the claimed seat.
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw this.alreadyRegistered();
      }
      throw e;
    }
  }

  /**
   * Cancelling an active registration frees the seat in the same transaction, and hands it
   * straight to the oldest waitlisted attendee when there is one. The row is kept as history.
   */
  @Transactional()
  async cancel(
    id: string,
    dto: CancelRegistrationDto,
    actor: AuthUser,
  ): Promise<RegistrationResponseDto> {
    const { registration } = this.txHost.tx;

    const current = await registration.findUnique({
      where: { id },
      select: { workshopId: true, status: true },
    });
    if (!current) throw new NotFoundException('Registration not found');

    // Matching the status in the WHERE makes a double-cancel (even a concurrent one) a no-op.
    const flipped = await registration.updateMany({
      where: { id, status: current.status },
      data: {
        status: 'CANCELLED',
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancelReason: dto.reason || null,
      },
    });
    if (current.status === 'CANCELLED' || flipped.count === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_CANCELLED',
        'This registration has already been cancelled',
      );
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'REGISTRATION_CANCELLED',
      entityType: 'REGISTRATION',
      entityId: id,
      before: { status: current.status },
      after: { status: 'CANCELLED', reason: dto.reason || null },
    });
    // A waitlisted attendee never held a seat, so there is nothing to free.
    if (current.status === 'ACTIVE') await this.releaseSeat(current.workshopId, actor);
    return this.findOne(id);
  }

  /** Promotes the oldest waitlisted attendee into the freed seat, or frees it if none. */
  private async releaseSeat(workshopId: string, actor: AuthUser) {
    const { workshop } = this.txHost.tx;
    const open = await workshop.findFirst({
      where: { id: workshopId, status: 'SCHEDULED', startsAt: { gt: new Date() } },
      select: { id: true },
    });
    if (open) {
      // SKIP LOCKED: two simultaneous cancels each take a different waiter, never the same one.
      const promoted = await this.txHost.tx.$queryRaw<{ id: string }[]>`
        UPDATE "Registration" SET status = 'ACTIVE', "promotedAt" = now()
        WHERE id = (
          SELECT id FROM "Registration"
          WHERE "workshopId" = ${workshopId} AND status = 'WAITLISTED'
          ORDER BY "registeredAt" ASC, id ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING id`;
      if (promoted[0]) {
        // The seat passes to the promoted attendee, so seatsTaken stays as it is.
        await this.audit.record({
          actorId: actor.id,
          action: 'REGISTRATION_PROMOTED',
          entityType: 'REGISTRATION',
          entityId: promoted[0].id,
          before: { status: 'WAITLISTED' },
          after: { status: 'ACTIVE' },
        });
        return;
      }
    }
    await workshop.update({ where: { id: workshopId }, data: { seatsTaken: { decrement: 1 } } });
  }

  async findForWorkshop(
    workshopId: string,
    query: ListWorkshopRegistrationsQueryDto,
  ): Promise<PaginatedResponseDto<RegistrationResponseDto>> {
    const exists = await this.txHost.tx.workshop.findUnique({
      where: { id: workshopId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Workshop not found');
    return this.list({ workshopId, status: query.status }, query);
  }

  async findAll(query: ListRegistrationsQueryDto): Promise<PaginatedResponseDto<RegistrationResponseDto>> {
    return this.list(
      {
        workshopId: query.workshopId,
        status: query.status,
        ...(query.email && { attendeeEmail: { contains: query.email, mode: 'insensitive' } }),
        ...((query.from || query.to) && { registeredAt: { gte: query.from, lte: query.to } }),
      },
      query,
    );
  }

  private async list(
    where: Prisma.RegistrationWhereInput,
    page: { page: number; pageSize: number; skip: number },
  ) {
    const queue = where.status === 'WAITLISTED';
    const { registration } = this.txHost.tx;
    const [rows, total] = await Promise.all([
      registration.findMany({
        where,
        include: INCLUDE,
        // Newest first, except the waitlist which is a queue (next in line first).
        // id breaks ties so pages never overlap.
        orderBy: [{ registeredAt: queue ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.pageSize,
      }),
      registration.count({ where }),
    ]);
    return PaginatedResponseDto.of(
      rows.map((r) => RegistrationResponseDto.from(r)),
      total,
      page,
    );
  }

  private async findOne(id: string) {
    const row = await this.txHost.tx.registration.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return RegistrationResponseDto.from(row);
  }

  /** The conditional UPDATE matched nothing: throws if the workshop is missing or closed. */
  private async explainClaimFailure(workshopId: string): Promise<void> {
    const w = await this.txHost.tx.workshop.findUnique({ where: { id: workshopId } });
    if (!w) throw new NotFoundException('Workshop not found');
    if (w.status !== 'SCHEDULED' || w.startsAt <= new Date()) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'WORKSHOP_NOT_OPEN',
        'Registration is closed for this workshop',
      );
    }
  }

  private workshopFull() {
    return new AppException(
      HttpStatus.CONFLICT,
      'WORKSHOP_FULL',
      'Sorry, this workshop has just filled up',
    );
  }

  private alreadyRegistered() {
    return new AppException(
      HttpStatus.CONFLICT,
      'ALREADY_REGISTERED',
      'This person is already registered for this workshop',
    );
  }
}
