import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditLogResponseDto } from './dto/audit-log-response.dto.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

export type AuditEntityType = 'USER' | 'WORKSHOP' | 'REGISTRATION';

interface AuditEntry {
  actorId: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/** Admin only sees account activity; Manager/Staff only see workshop activity. */
const VISIBLE_ENTITIES: Record<Role, AuditEntityType[]> = {
  [Role.ADMIN]: ['USER'],
  [Role.MANAGER]: ['WORKSHOP', 'REGISTRATION'],
  [Role.STAFF]: ['WORKSHOP', 'REGISTRATION'],
};

@Injectable()
export class AuditService {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly cls: ClsService,
  ) {}

  /** Call inside the same transaction as the change so both commit or neither does. */
  async record(entry: AuditEntry): Promise<void> {
    const req = this.cls.get<Request | undefined>('request');
    await this.txHost.tx.auditLog.create({
      data: {
        ...entry,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        requestId: req ? String(req.id ?? req.headers['x-request-id'] ?? '') || null : null,
        ip: req?.ip ?? null,
      },
    });
  }

  async findAll(
    query: ListAuditLogsQueryDto,
    viewer: AuthUser,
  ): Promise<PaginatedResponseDto<AuditLogResponseDto>> {
    const visible = VISIBLE_ENTITIES[viewer.role];
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType && visible.includes(query.entityType) ? query.entityType : { in: visible },
      entityId: query.entityId,
      actorId: query.actorId,
      action: query.action,
      ...((query.from || query.to) && { createdAt: { gte: query.from, lte: query.to } }),
    };
    // A requested type outside the viewer's scope must yield nothing, not everything visible.
    if (query.entityType && !visible.includes(query.entityType)) where.entityType = { in: [] };

    const { auditLog } = this.txHost.tx;
    const [rows, total] = await Promise.all([
      auditLog.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.pageSize,
      }),
      auditLog.count({ where }),
    ]);
    return PaginatedResponseDto.of(rows.map((r) => AuditLogResponseDto.from(r)), total, query);
  }
}
