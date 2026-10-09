import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import { AuditService } from './audit.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.STAFF)
  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto, @CurrentUser() viewer: AuthUser) {
    return this.audit.findAll(query, viewer);
  }
}
