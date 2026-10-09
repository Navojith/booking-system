import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, createUser, login, PASSWORD, resetDb } from './helpers.js';

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
    c.startsWith('kenora_rt='),
  );
const refreshWith = (app: INestApplication, cookie: string) =>
  request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0]);

describe('auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it('logs in, normalising email case, and sets an httpOnly refresh cookie', async () => {
    await createUser(prisma, 'STAFF', 'staff@test.dev');
    const res = await login(app, ' STAFF@test.dev ');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'staff@test.dev', role: 'STAFF' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
    expect(cookieOf(res)).toMatch(/SameSite=Strict/i);
  });

  it('gives the same generic error for unknown email and wrong password', async () => {
    await createUser(prisma, 'STAFF', 'staff@test.dev');
    const wrongPw = await login(app, 'staff@test.dev', 'wrong-password');
    const unknown = await login(app, 'nobody@test.dev');
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.detail).toBe(unknown.body.detail);
  });

  it('rejects login for deactivated users', async () => {
    const u = await createUser(prisma, 'STAFF');
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect((await login(app, u.email)).status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const u = await createUser(prisma, 'MANAGER');
    const first = cookieOf(await login(app, u.email))!;

    const second = await refreshWith(app, first);
    expect(second.status).toBe(200);
    const secondCookie = cookieOf(second)!;
    expect(secondCookie).not.toBe(first);

    // Replaying the already-rotated token is treated as theft...
    expect((await refreshWith(app, first)).status).toBe(401);
    // ...and takes the whole family down, including the newest token.
    expect((await refreshWith(app, secondCookie)).status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const u = await createUser(prisma, 'STAFF');
    const cookie = cookieOf(await login(app, u.email))!;
    const out = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie.split(';')[0]);
    expect(out.status).toBe(204);
    expect((await refreshWith(app, cookie)).status).toBe(401);
  });

  it('refresh without a cookie is 401', async () => {
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('invalidates an existing access token as soon as the user is deactivated', async () => {
    const u = await createUser(prisma, 'STAFF');
    const { accessToken } = (await login(app, u.email)).body;
    const me = () => request(app.getHttpServer()).get('/api/v1/auth/me').set(bearer(accessToken));
    expect((await me()).status).toBe(200);
    await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect((await me()).status).toBe(401);
  });

  it('changing password logs out other sessions and requires the current password', async () => {
    const u = await createUser(prisma, 'STAFF');
    const first = await login(app, u.email);
    const token = first.body.accessToken as string;
    const cookie = cookieOf(first)!;

    const wrong = await request(app.getHttpServer())
      .patch('/api/v1/auth/me/password')
      .set(bearer(token))
      .send({ currentPassword: 'nope', newPassword: 'BrandNew123!' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');

    const ok = await request(app.getHttpServer())
      .patch('/api/v1/auth/me/password')
      .set(bearer(token))
      .send({ currentPassword: PASSWORD, newPassword: 'BrandNew123!' });
    expect(ok.status).toBe(204);

    expect((await refreshWith(app, cookie)).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/auth/me').set(bearer(token))).status).toBe(
      401,
    );
    expect((await login(app, u.email, 'BrandNew123!')).status).toBe(200);
  });
});
