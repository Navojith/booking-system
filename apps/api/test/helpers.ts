import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const PASSWORD = 'Passw0rd!x';

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  token: string;
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, 'http://localhost:5173');
  await app.init();
  return app;
}

export async function resetDb(prisma: PrismaService) {
  await prisma.auditLog.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.workshop.deleteMany();
  await prisma.location.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(
  prisma: PrismaService,
  role: Role,
  email = `${role.toLowerCase()}@test.dev`,
) {
  return prisma.user.create({
    data: { email, fullName: `${role} User`, role, passwordHash: await argon2.hash(PASSWORD) },
  });
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
}

/** Creates a user per role and logs each in. */
export async function seedRoles(app: INestApplication, prisma: PrismaService) {
  const out = {} as Record<Role, TestUser>;
  for (const role of ['ADMIN', 'MANAGER', 'STAFF'] as const) {
    const user = await createUser(prisma, role);
    const res = await login(app, user.email);
    out[role] = { id: user.id, email: user.email, role, token: res.body.accessToken as string };
  }
  return out;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
