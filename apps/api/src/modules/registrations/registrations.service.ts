import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaClientKnownRequestError } from '../../generated/prisma/internal/prismaNamespace.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
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
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>) {}

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
    if (claimed.count === 0) await this.explainClaimFailure(workshopId);

    try {
      const row = await registration.create({
        data: {
          workshopId,
          attendeeName: dto.attendeeName,
          attendeeEmail: dto.attendeeEmail,
          status: 'ACTIVE',
          registeredById: actor.id,
        },
        include: INCLUDE,
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

  /** Cancelling frees the seat in the same transaction; the row itself is kept as history. */
  @Transactional()
  async cancel(
    id: string,
    dto: CancelRegistrationDto,
    actor: AuthUser,
  ): Promise<RegistrationResponseDto> {
    const { registration, workshop } = this.txHost.tx;

    const current = await registration.findUnique({ where: { id }, select: { workshopId: true } });
    if (!current) throw new NotFoundException('Registration not found');

    // `status: ACTIVE` in the WHERE makes a double-cancel (even a concurrent one) a no-op.
    const flipped = await registration.updateMany({
      where: { id, status: 'ACTIVE' },
      data: {
        status: 'CANCELLED',
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancelReason: dto.reason || null,
      },
    });
    if (flipped.count === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_CANCELLED',
        'This registration has already been cancelled',
      );
    }
    await workshop.update({
      where: { id: current.workshopId },
      data: { seatsTaken: { decrement: 1 } },
    });
    return this.findOne(id);
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
    const { registration } = this.txHost.tx;
    const [rows, total] = await Promise.all([
      registration.findMany({
        where,
        include: INCLUDE,
        // Newest first; id breaks ties so pages never overlap.
        orderBy: [{ registeredAt: 'desc' }, { id: 'asc' }],
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

  /** The conditional UPDATE matched nothing: say whether it is missing, closed or full. */
  private async explainClaimFailure(workshopId: string): Promise<never> {
    const w = await this.txHost.tx.workshop.findUnique({ where: { id: workshopId } });
    if (!w) throw new NotFoundException('Workshop not found');
    if (w.status !== 'SCHEDULED' || w.startsAt <= new Date()) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'WORKSHOP_NOT_OPEN',
        'Registration is closed for this workshop',
      );
    }
    throw new AppException(
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
