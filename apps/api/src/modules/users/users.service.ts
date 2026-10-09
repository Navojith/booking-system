import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import * as argon2 from 'argon2';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      isActive: query.isActive,
      ...(query.search && {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.txHost.tx.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.txHost.tx.user.count({ where }),
    ]);
    return PaginatedResponseDto.of(rows.map((u) => UserResponseDto.from(u)), total, query);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.txHost.tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return UserResponseDto.from(user);
  }

  @Transactional()
  async create(dto: CreateUserDto, actor: AuthUser): Promise<UserResponseDto> {
    const existing = await this.txHost.tx.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'A user with this email already exists');
    }
    const user = await this.txHost.tx.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password),
        mustChangePassword: true,
        createdById: actor.id,
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      after: { email: user.email, fullName: user.fullName, role: user.role },
    });
    return UserResponseDto.from(user);
  }

  @Transactional()
  async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserResponseDto> {
    const user = await this.txHost.tx.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const roleChanges = dto.role !== undefined && dto.role !== user.role;
    const deactivates = dto.isActive === false && user.isActive;

    if (id === actor.id && (roleChanges || deactivates)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CANNOT_MODIFY_SELF',
        'You cannot change your own role or deactivate your own account',
      );
    }

    if (user.role === Role.ADMIN && user.isActive && (roleChanges || deactivates)) {
      const activeAdmins = await this.txHost.tx.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'LAST_ADMIN',
          'The last active administrator cannot be demoted or deactivated',
        );
      }
    }

    const updated = await this.txHost.tx.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        isActive: dto.isActive,
        // Invalidates outstanding access tokens so the change applies immediately.
        ...((roleChanges || dto.isActive !== undefined) && { tokenVersion: { increment: 1 } }),
      },
    });
    if (deactivates) await this.revokeSessions(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: id,
      before: { fullName: user.fullName, role: user.role, isActive: user.isActive },
      after: { fullName: updated.fullName, role: updated.role, isActive: updated.isActive },
    });
    return UserResponseDto.from(updated);
  }

  /**
   * Sets a new password and invalidates every existing session of the user.
   * `temporary` marks it as admin-issued, forcing the user to choose their own at next login.
   */
  @Transactional()
  async setPassword(
    id: string,
    newPassword: string,
    temporary: boolean,
    actorId: string,
  ): Promise<void> {
    const found = await this.txHost.tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('User not found');
    await this.txHost.tx.user.update({
      where: { id },
      data: {
        passwordHash: await argon2.hash(newPassword),
        mustChangePassword: temporary,
        tokenVersion: { increment: 1 },
      },
    });
    await this.revokeSessions(id);
    // Never log the password itself, only that it changed and whether it was admin-issued.
    await this.audit.record({
      actorId,
      action: temporary ? 'USER_PASSWORD_RESET' : 'USER_PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: id,
    });
  }

  private async revokeSessions(userId: string) {
    await this.txHost.tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
