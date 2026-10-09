import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, resetDb, seedRoles, TestUser } from './helpers.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const future = (days: number) => new Date(Date.now() + days * DAY);

describe('registrations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: Record<Role, TestUser>;
  let locationId: string;
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
    locationId = (await prisma.location.create({ data: { name: 'A', address: 'a st' } })).id;
  });

  const makeWorkshop = (over: Record<string, unknown> = {}) =>
    prisma.workshop.create({
      data: {
        code: `W-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Pottery',
        instructor: 'Elena',
        locationId,
        startsAt: future(2),
        endsAt: new Date(future(2).getTime() + 2 * HOUR),
        capacity: 2,
        createdById: users.MANAGER.id,
        updatedById: users.MANAGER.id,
        ...over,
      },
    });
  const register = (workshopId: string, email: string, role: Role = 'STAFF', name = 'Ann Lee') =>
    http()
      .post(`/api/v1/workshops/${workshopId}/registrations`)
      .set(bearer(users[role].token))
      .send({ attendeeName: name, attendeeEmail: email });
  const cancel = (id: string, role: Role = 'STAFF', body: object = {}) =>
    http().post(`/api/v1/registrations/${id}/cancel`).set(bearer(users[role].token)).send(body);
  const seats = async (id: string) =>
    (await prisma.workshop.findUniqueOrThrow({ where: { id } })).seatsTaken;

  describe('register', () => {
    it('records the attendee, the actor and takes a seat', async () => {
      const w = await makeWorkshop();
      const res = await register(w.id, '  Ann@Example.COM ', 'STAFF', '  Ann Lee ');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        attendeeName: 'Ann Lee',
        attendeeEmail: 'ann@example.com',
        status: 'ACTIVE',
        registeredBy: { id: users.STAFF.id },
        cancelledBy: null,
        workshop: { id: w.id, code: w.code },
      });
      expect(await seats(w.id)).toBe(1);
    });

    it('lets managers register too', async () => {
      const w = await makeWorkshop();
      expect((await register(w.id, 'a@x.com', 'MANAGER')).status).toBe(201);
    });

    it('rejects a full workshop with WORKSHOP_FULL', async () => {
      const w = await makeWorkshop({ capacity: 1 });
      expect((await register(w.id, 'a@x.com')).status).toBe(201);
      const res = await register(w.id, 'b@x.com');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WORKSHOP_FULL');
      expect(await seats(w.id)).toBe(1);
    });

    it('rejects the same attendee twice, case-insensitively, without leaking a seat', async () => {
      const w = await makeWorkshop();
      await register(w.id, 'a@x.com');
      const res = await register(w.id, 'A@X.com');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_REGISTERED');
      expect(await seats(w.id)).toBe(1);
    });

    it('reports a duplicate (not "full") when the workshop is full', async () => {
      const w = await makeWorkshop({ capacity: 1 });
      await register(w.id, 'a@x.com');
      expect((await register(w.id, 'a@x.com')).body.code).toBe('ALREADY_REGISTERED');
    });

    it.each([
      ['cancelled', { status: 'CANCELLED' }],
      ['draft', { status: 'DRAFT' }],
      ['completed', { status: 'COMPLETED' }],
      ['already started', { startsAt: new Date(Date.now() - HOUR), endsAt: future(1) }],
    ])('refuses a %s workshop with WORKSHOP_NOT_OPEN', async (_label, over) => {
      const w = await makeWorkshop(over);
      const res = await register(w.id, 'a@x.com');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WORKSHOP_NOT_OPEN');
      expect(await seats(w.id)).toBe(0);
    });

    it('404s for an unknown workshop', async () => {
      const res = await register('00000000-0000-4000-8000-000000000000', 'a@x.com');
      expect(res.status).toBe(404);
    });

    it('validates the body', async () => {
      const w = await makeWorkshop();
      const res = await http()
        .post(`/api/v1/workshops/${w.id}/registrations`)
        .set(bearer(users.STAFF.token))
        .send({ attendeeName: '', attendeeEmail: 'nope', extra: 1 });
      expect(res.status).toBe(400);
      expect(await seats(w.id)).toBe(0);
    });
  });

  describe('cancel', () => {
    it('keeps the row, records who/when/why and frees the seat', async () => {
      const w = await makeWorkshop();
      const reg = (await register(w.id, 'a@x.com', 'STAFF')).body;
      const res = await cancel(reg.id, 'MANAGER', { reason: ' changed plans ' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        registeredBy: { id: users.STAFF.id },
        cancelledBy: { id: users.MANAGER.id },
        cancelReason: 'changed plans',
      });
      expect(res.body.cancelledAt).toBeTruthy();
      expect(await seats(w.id)).toBe(0);
      expect(await prisma.registration.count({ where: { workshopId: w.id } })).toBe(1);
    });

    it('rejects a second cancel without freeing another seat', async () => {
      const w = await makeWorkshop();
      const a = (await register(w.id, 'a@x.com')).body;
      await register(w.id, 'b@x.com');
      await cancel(a.id);
      const again = await cancel(a.id);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_CANCELLED');
      expect(await seats(w.id)).toBe(1);
    });

    it('makes the freed seat bookable and allows re-registering as a new row', async () => {
      const w = await makeWorkshop({ capacity: 1 });
      const a = (await register(w.id, 'a@x.com')).body;
      await cancel(a.id);
      const again = await register(w.id, 'a@x.com');
      expect(again.status).toBe(201);
      expect(again.body.id).not.toBe(a.id);
      expect(await prisma.registration.count({ where: { workshopId: w.id } })).toBe(2);
    });

    it('404s for an unknown registration', async () => {
      expect((await cancel('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });

    it('still frees the seat when the workshop itself was cancelled', async () => {
      const w = await makeWorkshop();
      const a = (await register(w.id, 'a@x.com')).body;
      await prisma.workshop.update({ where: { id: w.id }, data: { status: 'CANCELLED' } });
      expect((await cancel(a.id)).status).toBe(201);
      expect(await seats(w.id)).toBe(0);
    });
  });

  describe('history', () => {
    it('lists the roster with full history and filters by status', async () => {
      const w = await makeWorkshop({ capacity: 5 });
      const a = (await register(w.id, 'a@x.com')).body;
      await register(w.id, 'b@x.com');
      await cancel(a.id);

      const all = await http()
        .get(`/api/v1/workshops/${w.id}/registrations`)
        .set(bearer(users.STAFF.token));
      expect(all.status).toBe(200);
      expect(all.body).toMatchObject({ total: 2, page: 1 });

      const active = await http()
        .get(`/api/v1/workshops/${w.id}/registrations?status=ACTIVE`)
        .set(bearer(users.MANAGER.token));
      expect(active.body.items.map((r: { attendeeEmail: string }) => r.attendeeEmail)).toEqual([
        'b@x.com',
      ]);

      const cancelled = await http()
        .get(`/api/v1/workshops/${w.id}/registrations?status=CANCELLED`)
        .set(bearer(users.MANAGER.token));
      expect(cancelled.body.items).toHaveLength(1);
      expect(cancelled.body.items[0].cancelledBy.id).toBe(users.STAFF.id);
    });

    it('404s the roster of an unknown workshop', async () => {
      const res = await http()
        .get('/api/v1/workshops/00000000-0000-4000-8000-000000000000/registrations')
        .set(bearer(users.STAFF.token));
      expect(res.status).toBe(404);
    });

    it('finds one person across workshops by (partial) email', async () => {
      const w1 = await makeWorkshop({ capacity: 5 });
      const w2 = await makeWorkshop({ capacity: 5 });
      await register(w1.id, 'ann@x.com');
      await register(w2.id, 'ann@x.com');
      await register(w2.id, 'bob@x.com');

      const res = await http()
        .get('/api/v1/registrations?email=ANN@')
        .set(bearer(users.STAFF.token));
      expect(res.body.total).toBe(2);
      expect(new Set(res.body.items.map((r: { workshop: { id: string } }) => r.workshop.id))).toEqual(
        new Set([w1.id, w2.id]),
      );

      const one = await http()
        .get(`/api/v1/registrations?workshopId=${w2.id}&email=ann@x.com`)
        .set(bearer(users.STAFF.token));
      expect(one.body.total).toBe(1);
    });

    it('paginates', async () => {
      const w = await makeWorkshop({ capacity: 5 });
      for (const e of ['a', 'b', 'c']) await register(w.id, `${e}@x.com`);
      const res = await http()
        .get(`/api/v1/workshops/${w.id}/registrations?pageSize=2&page=2`)
        .set(bearer(users.STAFF.token));
      expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('capacity edits', () => {
    it('refuses to lower capacity below the seats taken', async () => {
      const w = await makeWorkshop({ capacity: 5 });
      await register(w.id, 'a@x.com');
      await register(w.id, 'b@x.com');
      const res = await http()
        .patch(`/api/v1/workshops/${w.id}`)
        .set(bearer(users.MANAGER.token))
        .set('If-Match', 'W/"1"')
        .send({ capacity: 1 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('CAPACITY_BELOW_SEATS_TAKEN');
    });
  });
});
