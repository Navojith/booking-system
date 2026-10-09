import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  // DB check is added once PrismaModule exists (Phase 1).
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([]);
  }
}
