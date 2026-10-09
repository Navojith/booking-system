import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ETagInterceptor, parseIfMatch } from '../../common/interceptors/etag.interceptor.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Role } from '../../generated/prisma/enums.js';
import { CreateWorkshopDto } from './dto/create-workshop.dto.js';
import { ListWorkshopsQueryDto } from './dto/list-workshops-query.dto.js';
import { UpdateWorkshopDto } from './dto/update-workshop.dto.js';
import { WorkshopResponseDto } from './dto/workshop-response.dto.js';
import { WorkshopsService } from './workshops.service.js';

const IF_MATCH = {
  name: 'If-Match',
  description: 'ETag of the workshop being edited, e.g. W/"3"',
  required: true,
} as const;

@ApiTags('workshops')
@ApiBearerAuth()
@UseInterceptors(ETagInterceptor)
@Controller('workshops')
export class WorkshopsController {
  constructor(private readonly workshops: WorkshopsService) {}

  @Roles(Role.MANAGER, Role.STAFF)
  @Get()
  findAll(@Query() query: ListWorkshopsQueryDto) {
    return this.workshops.findAll(query);
  }

  @Roles(Role.MANAGER, Role.STAFF)
  @Get(':id')
  @ApiOkResponse({ type: WorkshopResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.workshops.findOne(id);
  }

  @Roles(Role.MANAGER)
  @Post()
  @ApiCreatedResponse({ type: WorkshopResponseDto })
  create(@Body() dto: CreateWorkshopDto, @CurrentUser() actor: AuthUser) {
    return this.workshops.create(dto, actor);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  @ApiHeader(IF_MATCH)
  @ApiOkResponse({ type: WorkshopResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkshopDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    const version = parseIfMatch(ifMatch);
    if (version === undefined) {
      throw new AppException(
        HttpStatus.PRECONDITION_REQUIRED,
        'IF_MATCH_REQUIRED',
        'Send the workshop ETag in the If-Match header',
      );
    }
    return this.workshops.update(id, dto, version, actor);
  }

  @Roles(Role.MANAGER)
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiHeader({ ...IF_MATCH, required: false })
  @ApiOkResponse({ type: WorkshopResponseDto })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.workshops.cancel(id, parseIfMatch(ifMatch), actor);
  }
}
