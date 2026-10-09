import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import { CancelRegistrationDto } from './dto/cancel-registration.dto.js';
import { CreateRegistrationDto } from './dto/create-registration.dto.js';
import {
  ListRegistrationsQueryDto,
  ListWorkshopRegistrationsQueryDto,
} from './dto/list-registrations-query.dto.js';
import { RegistrationResponseDto } from './dto/registration-response.dto.js';
import { RegistrationsService } from './registrations.service.js';

@ApiTags('registrations')
@ApiBearerAuth()
@Controller()
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Roles(Role.MANAGER, Role.STAFF)
  @Get('workshops/:workshopId/registrations')
  findForWorkshop(
    @Param('workshopId', ParseUUIDPipe) workshopId: string,
    @Query() query: ListWorkshopRegistrationsQueryDto,
  ) {
    return this.registrations.findForWorkshop(workshopId, query);
  }

  @Roles(Role.MANAGER, Role.STAFF)
  @Post('workshops/:workshopId/registrations')
  @ApiCreatedResponse({ type: RegistrationResponseDto })
  register(
    @Param('workshopId', ParseUUIDPipe) workshopId: string,
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.registrations.register(workshopId, dto, actor);
  }

  @Roles(Role.MANAGER, Role.STAFF)
  @Get('registrations')
  findAll(@Query() query: ListRegistrationsQueryDto) {
    return this.registrations.findAll(query);
  }

  @Roles(Role.MANAGER, Role.STAFF)
  @Post('registrations/:id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: RegistrationResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRegistrationDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.registrations.cancel(id, dto, actor);
  }
}
