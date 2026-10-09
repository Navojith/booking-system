import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, login, resetDb, seedRoles, TestUser } from './helpers.js';

describe('users (admin)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: Record<Role, TestUser>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    users = await seedRoles(app, prisma);
  });

  const create = (body: object) =>
    http().post('/api/v1/users').set(bearer(users.ADMIN.token)).send(body);

  it('creates a user who can then log in, without leaking the hash', async () => {
    const res = await create({
      email: 'New.Person@Test.dev',
      fullName: ' New Person ',
      role: 'STAFF',
      password: 'Sup3rSecret!',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'new.person@test.dev', fullName: 'New Person' });
    expect(res.body.passwordHash).toBeUndefined();
    expect((await login(app, 'new.person@test.dev', 'Sup3rSecret!')).status).toBe(200);
  });

  it('returns 409 EMAIL_TAKEN for a duplicate email', async () => {
    const res = await create({
      email: users.STAFF.email,
      fullName: 'Dup',
      role: 'STAFF',
      password: 'Sup3rSecret!',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('validates input and reports field errors as problem+json', async () => {
    const res = await create({ email: 'x', role: 'BOSS', password: 'short', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('lists with filters and pagination', async () => {
    const res = await http()
      .get('/api/v1/users?role=STAFF&pageSize=5')
      .set(bearer(users.ADMIN.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5, total: 1 });
    expect(res.body.items[0].email).toBe(users.STAFF.email);
  });

  it('role change applies immediately to the target user’s existing token', async () => {
    const patch = await http()
      .patch(`/api/v1/users/${users.STAFF.id}`)
      .set(bearer(users.ADMIN.token))
      .send({ role: 'MANAGER' });
    expect(patch.status).toBe(200);
    expect(patch.body.role).toBe('MANAGER');
    const old = await http().get('/api/v1/auth/me').set(bearer(users.STAFF.token));
    expect(old.status).toBe(401);
  });

  it('deactivating a user kills their sessions', async () => {
    const cookie = (
      (await login(app, users.MANAGER.email)).headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    await http()
      .patch(`/api/v1/users/${users.MANAGER.id}`)
      .set(bearer(users.ADMIN.token))
      .send({ isActive: false })
      .expect(200);
    expect((await http().post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await login(app, users.MANAGER.email)).status).toBe(401);
  });

  it('prevents an admin from demoting or deactivating themselves', async () => {
    const demote = await http()
      .patch(`/api/v1/users/${users.ADMIN.id}`)
      .set(bearer(users.ADMIN.token))
      .send({ role: 'STAFF' });
    expect(demote.status).toBe(422);
    expect(demote.body.code).toBe('CANNOT_MODIFY_SELF');
    const deactivate = await http()
      .patch(`/api/v1/users/${users.ADMIN.id}`)
      .set(bearer(users.ADMIN.token))
      .send({ isActive: false });
    expect(deactivate.status).toBe(422);
  });

  it('admin password reset invalidates sessions and sets the new password', async () => {
    await http()
      .post(`/api/v1/users/${users.STAFF.id}/reset-password`)
      .set(bearer(users.ADMIN.token))
      .send({ newPassword: 'ResetByAdmin1!' })
      .expect(204);
    expect((await http().get('/api/v1/auth/me').set(bearer(users.STAFF.token))).status).toBe(401);
    expect((await login(app, users.STAFF.email, 'ResetByAdmin1!')).status).toBe(200);
  });

  it('forces a password change after create or admin reset until the user picks their own', async () => {
    const email = 'temp@test.dev';
    await http()
      .post('/api/v1/users')
      .set(bearer(users.ADMIN.token))
      .send({ email, fullName: 'Temp User', role: 'STAFF', password: 'TempPass123!' })
      .expect(201);

    const session = await login(app, email, 'TempPass123!');
    expect(session.status).toBe(200);
    expect(session.body.user.mustChangePassword).toBe(true);
    const token = session.body.accessToken as string;

    // Everything except /me and the password change is refused.
    const blocked = await http().get('/api/v1/workshops').set(bearer(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await http().get('/api/v1/auth/me').set(bearer(token)).expect(200);

    // Reusing the temporary password is rejected.
    const same = await http()
      .patch('/api/v1/auth/me/password')
      .set(bearer(token))
      .send({ currentPassword: 'TempPass123!', newPassword: 'TempPass123!' });
    expect(same.body.code).toBe('PASSWORD_UNCHANGED');

    await http()
      .patch('/api/v1/auth/me/password')
      .set(bearer(token))
      .send({ currentPassword: 'TempPass123!', newPassword: 'MyOwnPass123!' })
      .expect(204);

    const after = await login(app, email, 'MyOwnPass123!');
    expect(after.body.user.mustChangePassword).toBe(false);
    await http().get('/api/v1/workshops').set(bearer(after.body.accessToken)).expect(200);

    // An admin reset flags the account again.
    const target = after.body.user.id as string;
    await http()
      .post(`/api/v1/users/${target}/reset-password`)
      .set(bearer(users.ADMIN.token))
      .send({ newPassword: 'ResetByAdmin1!' })
      .expect(204);
    expect((await login(app, email, 'ResetByAdmin1!')).body.user.mustChangePassword).toBe(true);
  });

  it('404s for an unknown user', async () => {
    const res = await http()
      .get('/api/v1/users/00000000-0000-4000-8000-000000000000')
      .set(bearer(users.ADMIN.token));
    expect(res.status).toBe(404);
  });
});
