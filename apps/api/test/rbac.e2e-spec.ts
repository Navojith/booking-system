import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, resetDb, seedRoles, TestUser } from './helpers.js';

type Method = 'get' | 'post' | 'patch';
const ID = '00000000-0000-4000-8000-000000000000';

/**
 * Role matrix: every guarded endpoint x every role. `allowed` roles must NOT get
 * 401/403; all other roles must get exactly 403. Extend this table as modules land.
 */
const MATRIX: { method: Method; path: string; body?: object; allowed: Role[] }[] = [
  { method: 'get', path: '/users', allowed: ['ADMIN'] },
  { method: 'get', path: `/users/${ID}`, allowed: ['ADMIN'] },
  { method: 'post', path: '/users', body: {}, allowed: ['ADMIN'] },
  { method: 'patch', path: `/users/${ID}`, body: {}, allowed: ['ADMIN'] },
  { method: 'post', path: `/users/${ID}/reset-password`, body: {}, allowed: ['ADMIN'] },
  { method: 'get', path: '/locations', allowed: ['MANAGER', 'STAFF'] },
  { method: 'get', path: '/workshops', allowed: ['MANAGER', 'STAFF'] },
  { method: 'get', path: `/workshops/${ID}`, allowed: ['MANAGER', 'STAFF'] },
  { method: 'post', path: '/workshops', body: {}, allowed: ['MANAGER'] },
  { method: 'patch', path: `/workshops/${ID}`, body: {}, allowed: ['MANAGER'] },
  { method: 'post', path: `/workshops/${ID}/cancel`, body: {}, allowed: ['MANAGER'] },
  { method: 'get', path: `/workshops/${ID}/registrations`, allowed: ['MANAGER', 'STAFF'] },
  { method: 'post', path: `/workshops/${ID}/registrations`, body: {}, allowed: ['MANAGER', 'STAFF'] },
  { method: 'get', path: '/registrations', allowed: ['MANAGER', 'STAFF'] },
  { method: 'post', path: `/registrations/${ID}/cancel`, body: {}, allowed: ['MANAGER', 'STAFF'] },
  { method: 'get', path: '/auth/me', allowed: ['ADMIN', 'MANAGER', 'STAFF'] },
  { method: 'patch', path: '/auth/me/password', body: {}, allowed: ['ADMIN', 'MANAGER', 'STAFF'] },
];

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF'];

describe('role matrix', () => {
  let app: INestApplication;
  let users: Record<Role, TestUser>;

  beforeAll(async () => {
    app = await createApp();
    const prisma = app.get(PrismaService);
    await resetDb(prisma);
    users = await seedRoles(app, prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  for (const { method, path, body, allowed } of MATRIX) {
    describe(`${method.toUpperCase()} ${path}`, () => {
      it('rejects unauthenticated requests with 401', async () => {
        const res = await request(app.getHttpServer())[method](`/api/v1${path}`).send(body);
        expect(res.status).toBe(401);
      });

      for (const role of ROLES) {
        if (allowed.includes(role)) {
          it(`lets ${role} through`, async () => {
            const res = await request(app.getHttpServer())
              [method](`/api/v1${path}`)
              .set(bearer(users[role].token))
              .send(body);
            expect([401, 403]).not.toContain(res.status);
          });
        } else {
          it(`refuses ${role} with 403`, async () => {
            const res = await request(app.getHttpServer())
              [method](`/api/v1${path}`)
              .set(bearer(users[role].token))
              .send(body);
            expect(res.status).toBe(403);
            expect(res.headers['content-type']).toContain('application/problem+json');
          });
        }
      }
    });
  }

  it('keeps health endpoints public', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
  });
});
