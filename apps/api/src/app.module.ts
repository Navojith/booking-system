import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { PasswordChangeGuard } from './common/guards/password-change.guard.js';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { RegistrationsModule } from './modules/registrations/registrations.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WorkshopsModule } from './modules/workshops/workshops.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PrismaService } from './prisma/prisma.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
        autoLogging: process.env.NODE_ENV !== 'test',
      },
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          cls.set('requestId', req.headers['x-request-id'] ?? req.id);
          cls.set('ip', req.ip);
        },
      },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PrismaService }),
        }),
      ],
    }),
    // Login has a stricter per-route limit; skipped in tests so role matrices can run freely.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    WorkshopsModule,
    RegistrationsModule,
  ],
  providers: [
    // Order matters: throttle -> authenticate -> authorise -> force password change.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
