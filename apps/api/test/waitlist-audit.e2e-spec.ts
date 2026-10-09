import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, resetDb, seedRoles, TestUser } from './helpers.js';

const HOUR = 3_600_000;
const start = () => new Date(Date.now() + 48 * HOUR);

describe('waitlist and audit log', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: Record<Role, TestUser>;
  let workshopId: string;
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
    const location = await prisma.location.create({ data: { name: 'A', address: 'a st' } });
    workshopId = (
      await prisma.workshop.create({
        data: {
          code: 'W-1',
          title: 'Pottery',
          instructor: 'Elena',
          locationId: location.id,
          startsAt: start(),
          endsAt: new Date(start().getTime() + 2 * HOUR),
          capacity: 1,
          createdById: users.MANAGER.id,
          updatedById: users.MANAGER.id,
        },
      })
    ).id;
  });

  const register = (email: string, joinWaitlist?: boolean) =>
    http()
      .post(`/api/v1/workshops/${workshopId}/registrations`)
      .set(bearer(users.STAFF.token))
      .send({ attendeeName: 'Ann', attendeeEmail: email, joinWaitlist });
  const cancel = (id: string) =>
    http().post(`/api/v1/registrations/${id}/cancel`).set(bearer(users.STAFF.token)).send({});
  const seats = async () => (await prisma.workshop.findUniqueOrThrow({ where: { id: workshopId } })).seatsTaken;

  it('queues on a full workshop only when asked, without taking a seat', async () => {
    await register('a@x.dev').expect(201);
    await register('b@x.dev').expect(409);
    const res = await register('b@x.dev', true).expect(201);
    expect(res.body.status).toBe('WAITLISTED');
    expect(await seats()).toBe(1);
    await register('b@x.dev', true).expect(409); // already queued
  });

  it('promotes the oldest waiter when an active registration is cancelled', async () => {
    const a = await register('a@x.dev').expect(201);
    const b = await register('b@x.dev', true).expect(201);
    const c = await register('c@x.dev', true).expect(201);

    await cancel(a.body.id).expect(200);

    const rows = await prisma.registration.findMany({ where: { workshopId } });
    const byEmail = Object.fromEntries(rows.map((r) => [r.attendeeEmail, r]));
    expect(byEmail['b@x.dev'].status).toBe('ACTIVE');
    expect(byEmail['b@x.dev'].promotedAt).not.toBeNull();
    expect(byEmail['c@x.dev'].status).toBe('WAITLISTED');
    expect(await seats()).toBe(1);
    expect(b.body.id).toBe(byEmail['b@x.dev'].id);
    expect(c.body.id).toBe(byEmail['c@x.dev'].id);
  });

  it('cancelling a waitlisted registration does not free a seat', async () => {
    await register('a@x.dev').expect(201);
    const b = await register('b@x.dev', true).expect(201);
    await cancel(b.body.id).expect(200);
    expect(await seats()).toBe(1);
  });

  it('frees the seat when nobody is waiting', async () => {
    const a = await register('a@x.dev').expect(201);
    await cancel(a.body.id).expect(200);
    expect(await seats()).toBe(0);
  });

  it('writes audit entries and scopes them by role', async () => {
    const a = await register('a@x.dev').expect(201);
    await register('b@x.dev', true).expect(201);
    await cancel(a.body.id).expect(200);

    const staff = await http().get('/api/v1/audit-logs').set(bearer(users.STAFF.token)).expect(200);
    const actions = staff.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'REGISTRATION_CREATED',
        'REGISTRATION_WAITLISTED',
        'REGISTRATION_CANCELLED',
        'REGISTRATION_PROMOTED',
      ]),
    );
    expect(staff.body.items.every((i: { entityType: string }) => i.entityType !== 'USER')).toBe(true);

    // Admin has no workshop access, so sees none of it and cannot ask for it.
    const admin = await http()
      .get('/api/v1/audit-logs?entityType=REGISTRATION')
      .set(bearer(users.ADMIN.token))
      .expect(200);
    expect(admin.body.total).toBe(0);
  });

  it('logs account changes for admins only', async () => {
    await http()
      .post('/api/v1/users')
      .set(bearer(users.ADMIN.token))
      .send({ email: 'new@x.dev', fullName: 'New Person', role: 'STAFF', password: 'Passw0rd!xyz' })
      .expect(201);
    const admin = await http().get('/api/v1/audit-logs').set(bearer(users.ADMIN.token)).expect(200);
    expect(admin.body.items[0]).toMatchObject({ action: 'USER_CREATED', entityType: 'USER' });
    expect(JSON.stringify(admin.body)).not.toContain('Passw0rd');
    const manager = await http().get('/api/v1/audit-logs').set(bearer(users.MANAGER.token)).expect(200);
    expect(manager.body.items.some((i: { entityType: string }) => i.entityType === 'USER')).toBe(false);
  });

  it('promotes waiters when capacity is raised', async () => {
    await register('a@x.dev').expect(201);
    await register('b@x.dev', true).expect(201);
    await register('c@x.dev', true).expect(201);
    const w = await http().get(`/api/v1/workshops/${workshopId}`).set(bearer(users.MANAGER.token));
    await http()
      .patch(`/api/v1/workshops/${workshopId}`)
      .set(bearer(users.MANAGER.token))
      .set('If-Match', `W/"${w.body.version}"`)
      .send({ capacity: 2 })
      .expect(200);
    const rows = await prisma.registration.findMany({ where: { workshopId } });
    const status = Object.fromEntries(rows.map((r) => [r.attendeeEmail, r.status]));
    expect(status).toEqual({ 'a@x.dev': 'ACTIVE', 'b@x.dev': 'ACTIVE', 'c@x.dev': 'WAITLISTED' });
    expect(await seats()).toBe(2);
  });

  it('lists the waitlist oldest first', async () => {
    await register('a@x.dev').expect(201);
    await register('b@x.dev', true).expect(201);
    await register('c@x.dev', true).expect(201);
    const res = await http()
      .get(`/api/v1/workshops/${workshopId}/registrations?status=WAITLISTED`)
      .set(bearer(users.STAFF.token))
      .expect(200);
    expect(res.body.items.map((r: { attendeeEmail: string }) => r.attendeeEmail)).toEqual([
      'b@x.dev',
      'c@x.dev',
    ]);
  });

  it('records the request id and refuses to alter or delete audit rows', async () => {
    await register('a@x.dev').set('x-request-id', 'req-123').expect(201);
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'REGISTRATION_CREATED' } });
    expect(row.requestId).toBe('req-123');
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'X' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it('requires authentication', async () => {
    await http().get('/api/v1/audit-logs').expect(401);
  });
});
