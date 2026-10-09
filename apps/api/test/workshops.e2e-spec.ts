import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, resetDb, seedRoles, TestUser } from './helpers.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (days: number, hours = 10) =>
  new Date(Date.UTC(2030, 0, 1) + days * DAY + hours * HOUR).toISOString();

describe('workshops', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: Record<Role, TestUser>;
  let locationId: string;
  let otherLocationId: string;
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
    otherLocationId = (await prisma.location.create({ data: { name: 'B', address: 'b st' } })).id;
  });

  const body = (over: object = {}) => ({
    code: 'pot-1',
    title: 'Pottery',
    instructor: 'Elena',
    locationId,
    startsAt: at(1),
    endsAt: at(1, 12),
    capacity: 10,
    ...over,
  });
  const create = (over: object = {}) =>
    http().post('/api/v1/workshops').set(bearer(users.MANAGER.token)).send(body(over));
  const get = (id: string, role: Role = 'STAFF') =>
    http().get(`/api/v1/workshops/${id}`).set(bearer(users[role].token));
  const patch = (id: string, data: object, ifMatch?: string) => {
    const r = http().patch(`/api/v1/workshops/${id}`).set(bearer(users.MANAGER.token));
    return (ifMatch ? r.set('If-Match', ifMatch) : r).send(data);
  };

  describe('create', () => {
    it('creates with normalised code, derived seats and an ETag', async () => {
      const res = await create();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        code: 'POT-1',
        status: 'SCHEDULED',
        capacity: 10,
        seatsTaken: 0,
        seatsAvailable: 10,
        version: 1,
        location: { id: locationId, name: 'A' },
      });
      expect(res.headers.etag).toBe('W/"1"');
    });

    it('409s on a duplicate code', async () => {
      await create();
      const res = await create({ code: 'POT-1' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CODE_TAKEN');
    });

    it.each([
      ['capacity of zero', { capacity: 0 }],
      ['a bad code', { code: '!!' }],
      ['an unknown field', { nope: 1 }],
      ['a non-date start', { startsAt: 'tomorrow-ish' }],
    ])('400s for %s', async (_label, over) => {
      expect((await create(over)).status).toBe(400);
    });

    it('422s when it ends before it starts', async () => {
      const res = await create({ startsAt: at(1, 12), endsAt: at(1, 10) });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_TIME_RANGE');
    });

    it('422s for an unknown location', async () => {
      const res = await create({ locationId: '00000000-0000-4000-8000-000000000000' });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('LOCATION_NOT_FOUND');
    });
  });

  describe('edit (If-Match)', () => {
    it('requires If-Match (428)', async () => {
      const w = (await create()).body;
      const res = await patch(w.id, { title: 'New' });
      expect(res.status).toBe(428);
      expect(res.body.code).toBe('IF_MATCH_REQUIRED');
    });

    it('updates, bumps the version and returns the new ETag', async () => {
      const w = (await create()).body;
      const res = await patch(w.id, { title: 'New', capacity: 15 }, 'W/"1"');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'New', capacity: 15, version: 2, seatsAvailable: 15 });
      expect(res.headers.etag).toBe('W/"2"');
    });

    it('412s on a stale version, so the second editor cannot overwrite the first', async () => {
      const w = (await create()).body;
      await patch(w.id, { title: 'First' }, 'W/"1"').expect(200);
      const res = await patch(w.id, { title: 'Second' }, 'W/"1"');
      expect(res.status).toBe(412);
      expect(res.body.code).toBe('STALE_VERSION');
      expect((await get(w.id)).body.title).toBe('First');
    });

    it('lets only one of two simultaneous edits win', async () => {
      const w = (await create()).body;
      const results = await Promise.all([
        patch(w.id, { title: 'A' }, 'W/"1"'),
        patch(w.id, { title: 'B' }, 'W/"1"'),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
    });

    it('refuses to cut capacity below the seats already taken', async () => {
      const w = (await create({ capacity: 10 })).body;
      await prisma.workshop.update({ where: { id: w.id }, data: { seatsTaken: 6 } });
      const res = await patch(w.id, { capacity: 5 }, 'W/"1"');
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('CAPACITY_BELOW_SEATS_TAKEN');
      await patch(w.id, { capacity: 6 }, 'W/"1"').expect(200);
    });

    it('validates the merged time range on a partial update', async () => {
      const w = (await create()).body;
      const res = await patch(w.id, { endsAt: at(0) }, 'W/"1"');
      expect(res.status).toBe(422);
    });

    it('rejects `code` changes (immutable)', async () => {
      const w = (await create()).body;
      expect((await patch(w.id, { code: 'X-1' }, 'W/"1"')).status).toBe(400);
    });

    it('follows the status machine: DRAFT -> SCHEDULED -> COMPLETED, then frozen', async () => {
      const w = (await create({ status: 'DRAFT' })).body;
      expect(w.status).toBe('DRAFT');
      await patch(w.id, { status: 'COMPLETED' }, 'W/"1"').expect(409);
      await patch(w.id, { status: 'SCHEDULED' }, 'W/"1"').expect(200);
      await patch(w.id, { status: 'COMPLETED' }, 'W/"2"').expect(200);
      const frozen = await patch(w.id, { title: 'Nope' }, 'W/"3"');
      expect(frozen.status).toBe(422);
      expect(frozen.body.code).toBe('WORKSHOP_CLOSED');
    });

    it('404s for an unknown workshop', async () => {
      const res = await patch('00000000-0000-4000-8000-000000000000', {}, 'W/"1"');
      expect(res.status).toBe(404);
    });
  });

  describe('cancel', () => {
    it('cancels once; a second cancel is a 409', async () => {
      const w = (await create()).body;
      const res = await http()
        .post(`/api/v1/workshops/${w.id}/cancel`)
        .set(bearer(users.MANAGER.token));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', version: 2 });
      const again = await http()
        .post(`/api/v1/workshops/${w.id}/cancel`)
        .set(bearer(users.MANAGER.token));
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('honours a stale If-Match', async () => {
      const w = (await create()).body;
      const res = await http()
        .post(`/api/v1/workshops/${w.id}/cancel`)
        .set(bearer(users.MANAGER.token))
        .set('If-Match', 'W/"9"');
      expect(res.status).toBe(412);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // 1 Jan + offsets. POT-1 open, POT-2 full, COD-1 on another day/location, OLD cancelled.
      await create({ code: 'POT-1', title: 'Pottery Basics', startsAt: at(1), endsAt: at(1, 12) });
      const full = (
        await create({ code: 'POT-2', title: 'Glazing', instructor: 'Zed', startsAt: at(2), endsAt: at(2, 12), capacity: 2 })
      ).body;
      await prisma.workshop.update({ where: { id: full.id }, data: { seatsTaken: 2 } });
      await create({ code: 'COD-1', title: 'Coding', locationId: otherLocationId, startsAt: at(9), endsAt: at(9, 12) });
      const old = (await create({ code: 'OLD-1', title: 'Old', startsAt: at(3), endsAt: at(3, 12) })).body;
      await http().post(`/api/v1/workshops/${old.id}/cancel`).set(bearer(users.MANAGER.token));
    });

    const search = (qs: string, role: Role = 'STAFF') =>
      http().get(`/api/v1/workshops?${qs}`).set(bearer(users[role].token));
    const codes = (res: request.Response) => res.body.items.map((w: { code: string }) => w.code);

    it('lists in start-time order with pagination metadata', async () => {
      const res = await search('');
      expect(res.status).toBe(200);
      expect(codes(res)).toEqual(['POT-1', 'POT-2', 'OLD-1', 'COD-1']);
      expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 4 });
    });

    it('filters by date range (inclusive)', async () => {
      const res = await search(`from=${encodeURIComponent(at(1))}&to=${encodeURIComponent(at(2, 23))}`);
      expect(codes(res)).toEqual(['POT-1', 'POT-2']);
    });

    it('400s when from is after to', async () => {
      const res = await search(`from=${encodeURIComponent(at(5))}&to=${encodeURIComponent(at(1))}`);
      expect(res.status).toBe(400);
    });

    it('filters by status and location', async () => {
      expect(codes(await search('status=CANCELLED'))).toEqual(['OLD-1']);
      expect(codes(await search(`locationId=${otherLocationId}`))).toEqual(['COD-1']);
    });

    it('hasSeats=true hides full workshops; hasSeats=false shows only full ones', async () => {
      expect(codes(await search('hasSeats=true'))).toEqual(['POT-1', 'OLD-1', 'COD-1']);
      expect(codes(await search('hasSeats=false'))).toEqual(['POT-2']);
    });

    it('combines the "this week with seats" filters', async () => {
      const res = await search(
        `status=SCHEDULED&hasSeats=true&from=${encodeURIComponent(at(0))}&to=${encodeURIComponent(at(7))}`,
      );
      expect(codes(res)).toEqual(['POT-1']);
    });

    it('free-text searches code, title and instructor', async () => {
      expect(codes(await search('q=glaz'))).toEqual(['POT-2']);
      expect(codes(await search('q=zed'))).toEqual(['POT-2']);
      expect(codes(await search('q=cod-'))).toEqual(['COD-1']);
    });

    it('sorts and paginates', async () => {
      const res = await search('sort=title:desc&pageSize=2&page=2');
      expect(codes(res)).toEqual(['POT-2', 'COD-1']);
      expect(res.body.total).toBe(4);
    });

    it('rejects unknown sort values and bad booleans', async () => {
      expect((await search('sort=capacity:asc')).status).toBe(400);
      expect((await search('hasSeats=maybe')).status).toBe(400);
    });

    it('serves managers and staff alike', async () => {
      expect((await search('', 'MANAGER')).status).toBe(200);
    });
  });

  it('lists locations for staff', async () => {
    const res = await http().get('/api/v1/locations').set(bearer(users.STAFF.token));
    expect(res.status).toBe(200);
    expect(res.body.map((l: { name: string }) => l.name)).toEqual(['A', 'B']);
  });

  it('keeps DB-level capacity invariants even if application code is bypassed', async () => {
    const w = (await create({ capacity: 2 })).body;
    await expect(
      prisma.workshop.update({ where: { id: w.id }, data: { seatsTaken: 3 } }),
    ).rejects.toThrow();
    await expect(
      prisma.workshop.update({ where: { id: w.id }, data: { capacity: 0 } }),
    ).rejects.toThrow();
  });
});
