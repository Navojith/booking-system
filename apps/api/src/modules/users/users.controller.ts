import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query() query: ListUsersQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.update(id, dto, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.users.setPassword(id, dto.newPassword, true, actor.id);
  }
}
