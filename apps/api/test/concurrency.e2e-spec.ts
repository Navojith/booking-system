import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, resetDb, seedRoles, TestUser } from './helpers.js';

const DAY = 24 * 3_600_000;

/**
 * The capacity rule against a real Postgres: parallel requests must never push
 * `seatsTaken` past `capacity`, and the counter must always equal the active rows.
 */
describe('capacity under concurrency', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: Record<Role, TestUser>;
  let locationId: string;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    users = await seedRoles(app, prisma);
    locationId = (await prisma.location.create({ data: { name: 'A', address: 'a st' } })).id;
  });
  afterAll(async () => {
    await app.close();
  });

  const makeWorkshop = (capacity: number) =>
    prisma.workshop.create({
      data: {
        code: `C-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Race',
        instructor: 'Elena',
        locationId,
        startsAt: new Date(Date.now() + 2 * DAY),
        endsAt: new Date(Date.now() + 2 * DAY + 3_600_000),
        capacity,
        createdById: users.MANAGER.id,
        updatedById: users.MANAGER.id,
      },
    });
  const register = (workshopId: string, email: string, role: Role = 'STAFF') =>
    request(app.getHttpServer())
      .post(`/api/v1/workshops/${workshopId}/registrations`)
      .set(bearer(users[role].token))
      .send({ attendeeName: 'Racer', attendeeEmail: email });

  async function expectConsistent(workshopId: string) {
    const w = await prisma.workshop.findUniqueOrThrow({ where: { id: workshopId } });
    const active = await prisma.registration.count({ where: { workshopId, status: 'ACTIVE' } });
    expect(w.seatsTaken).toBe(active);
    expect(w.seatsTaken).toBeLessThanOrEqual(w.capacity);
    return w;
  }

  it('50 parallel registrations for 20 seats: exactly 20 succeed', async () => {
    const w = await makeWorkshop(20);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        register(w.id, `p${i}@x.com`, i % 2 ? 'STAFF' : 'MANAGER'),
      ),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 409)).toHaveLength(30);
    for (const r of results.filter((r) => r.status === 409)) {
      expect(r.body.code).toBe('WORKSHOP_FULL');
    }
    const after = await expectConsistent(w.id);
    expect(after.seatsTaken).toBe(20);
  });

  it('the same attendee submitted 10 times in parallel books exactly one seat', async () => {
    const w = await makeWorkshop(5);
    const results = await Promise.all(Array.from({ length: 10 }, () => register(w.id, 'same@x.com')));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of results.filter((r) => r.status !== 201)) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('ALREADY_REGISTERED');
    }
    expect((await expectConsistent(w.id)).seatsTaken).toBe(1);
  });

  it('the same registration cancelled 10 times in parallel frees exactly one seat', async () => {
    const w = await makeWorkshop(5);
    await register(w.id, 'keep@x.com');
    const target = (await register(w.id, 'drop@x.com')).body;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/registrations/${target.id}/cancel`)
          .set(bearer(users.STAFF.token))
          .send({}),
      ),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect((await expectConsistent(w.id)).seatsTaken).toBe(1);
  });

  it('mixed registers and cancels never over-book or drift', async () => {
    const w = await makeWorkshop(5);
    const seeded = await Promise.all(
      Array.from({ length: 5 }, (_, i) => register(w.id, `s${i}@x.com`)),
    );
    expect(seeded.every((r) => r.status === 201)).toBe(true);

    // Free three seats while 15 newcomers fight for whatever is available.
    const cancels = seeded.slice(0, 3).map((s) =>
      request(app.getHttpServer())
        .post(`/api/v1/registrations/${s.body.id}/cancel`)
        .set(bearer(users.STAFF.token))
        .send({}),
    );
    const registers = Array.from({ length: 15 }, (_, i) => register(w.id, `n${i}@x.com`));
    const [cancelled, registered] = await Promise.all([
      Promise.all(cancels),
      Promise.all(registers),
    ]);

    expect(cancelled.every((r) => r.status === 201)).toBe(true);
    const ok = registered.filter((r) => r.status === 201).length;
    expect(ok).toBeLessThanOrEqual(5);
    expect(registered.filter((r) => r.status !== 201).every((r) => r.status === 409)).toBe(true);
    await expectConsistent(w.id);
  });

  it('the CHECK constraint blocks over-booking even if the app logic is bypassed', async () => {
    const w = await makeWorkshop(2);
    await expect(
      prisma.workshop.update({ where: { id: w.id }, data: { seatsTaken: 3 } }),
    ).rejects.toThrow();
  });
});
