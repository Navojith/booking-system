import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../generated/prisma/enums.js';
import { LocationResponseDto } from './dto/location-response.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('locations')
@ApiBearerAuth()
@Roles(Role.MANAGER, Role.STAFF)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @ApiOkResponse({ type: [LocationResponseDto] })
  findAll() {
    return this.locations.findAll();
  }
}
