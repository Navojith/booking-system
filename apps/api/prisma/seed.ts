import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Role } from '../src/generated/prisma/enums.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Dev-only credentials (documented in the README).
const USERS: { email: string; fullName: string; role: Role; password: string }[] = [
  { email: 'admin@kenora.dev', fullName: 'Alex Admin', role: 'ADMIN', password: 'Admin123!' },
  { email: 'manager@kenora.dev', fullName: 'Morgan Manager', role: 'MANAGER', password: 'Manager123!' },
  { email: 'staff@kenora.dev', fullName: 'Sam Staff', role: 'STAFF', password: 'Staff123!' },
];

const LOCATIONS = [
  { name: 'Downtown Campus', address: '12 Main Street' },
  { name: 'Lakeside Studio', address: '88 Shore Road' },
  { name: 'North Hub', address: '301 Birch Avenue' },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Offsets are relative to "now" so the demo data is always current. */
const WORKSHOPS = [
  { code: 'POT-101', title: 'Wheel Throwing Basics', instructor: 'Elena Marsh', loc: 0, day: 1, hour: 10, capacity: 12, status: 'SCHEDULED' },
  { code: 'COD-201', title: 'Intro to Web Development', instructor: 'Priya Nair', loc: 2, day: 2, hour: 18, capacity: 20, status: 'SCHEDULED' },
  { code: 'FIT-110', title: 'Morning Mobility & Stretch', instructor: 'Jordan Blake', loc: 1, day: 2, hour: 7, capacity: 15, status: 'SCHEDULED' },
  { code: 'POT-102', title: 'Glazing Techniques', instructor: 'Elena Marsh', loc: 0, day: 3, hour: 14, capacity: 8, status: 'SCHEDULED' },
  { code: 'COD-202', title: 'JavaScript for Beginners', instructor: 'Priya Nair', loc: 2, day: 4, hour: 18, capacity: 20, status: 'SCHEDULED' },
  { code: 'FIT-111', title: 'Beginner Yoga', instructor: 'Jordan Blake', loc: 1, day: 5, hour: 9, capacity: 18, status: 'SCHEDULED' },
  { code: 'PHO-100', title: 'Photography Fundamentals', instructor: 'Sam Okafor', loc: 0, day: 8, hour: 17, capacity: 10, status: 'SCHEDULED' },
  { code: 'COD-301', title: 'Build a REST API', instructor: 'Priya Nair', loc: 2, day: 9, hour: 18, capacity: 16, status: 'SCHEDULED' },
  { code: 'FIT-120', title: 'Strength Foundations', instructor: 'Jordan Blake', loc: 1, day: 10, hour: 8, capacity: 12, status: 'CANCELLED' },
  { code: 'POT-201', title: 'Hand-building Sculpture', instructor: 'Elena Marsh', loc: 0, day: 12, hour: 11, capacity: 10, status: 'DRAFT' },
] as const;

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        passwordHash: await argon2.hash(u.password),
      },
    });
  }
  console.log(`Seeded ${USERS.length} users`);

  const manager = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@kenora.dev' } });
  const locations = [];
  for (const l of LOCATIONS) {
    locations.push(
      await prisma.location.upsert({ where: { name: l.name }, update: {}, create: l }),
    );
  }

  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (const w of WORKSHOPS) {
    const startsAt = new Date(base.getTime() + w.day * DAY + w.hour * HOUR);
    await prisma.workshop.upsert({
      where: { code: w.code },
      update: {},
      create: {
        code: w.code,
        title: w.title,
        instructor: w.instructor,
        locationId: locations[w.loc].id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * HOUR),
        capacity: w.capacity,
        status: w.status,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
  }
  console.log(`Seeded ${LOCATIONS.length} locations and ${WORKSHOPS.length} workshops`);

  await seedRegistrations(manager.id);
}

const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jack', 'Kira', 'Liam', 'Maya', 'Noah', 'Opal', 'Pete', 'Quinn', 'Rosa', 'Sven', 'Tara'];

/** Fills some workshops (one nearly full, one full) and adds a cancellation for history. */
async function seedRegistrations(managerId: string) {
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: 'staff@kenora.dev' } });
  // code -> how many active attendees to seed
  const FILL: Record<string, (cap: number) => number> = {
    'POT-101': (cap) => cap - 1, // nearly full
    'POT-102': (cap) => cap, // full
    'COD-201': () => 6,
    'FIT-111': () => 3,
  };

  for (const [code, count] of Object.entries(FILL)) {
    const w = await prisma.workshop.findUniqueOrThrow({ where: { code } });
    if ((await prisma.registration.count({ where: { workshopId: w.id } })) > 0) continue;
    const n = count(w.capacity);

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const name = `${FIRST[i % FIRST.length]} ${code.slice(0, 3)}${i}`;
        await tx.registration.create({
          data: {
            workshopId: w.id,
            attendeeName: name,
            attendeeEmail: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
            status: 'ACTIVE',
            registeredById: i % 2 ? staff.id : managerId,
          },
        });
      }
      // One cancelled booking so the history view has something to show.
      await tx.registration.create({
        data: {
          workshopId: w.id,
          attendeeName: 'Casey Cancelled',
          attendeeEmail: 'casey.cancelled@example.com',
          status: 'CANCELLED',
          registeredById: staff.id,
          cancelledById: staff.id,
          cancelledAt: new Date(),
          cancelReason: 'Schedule clash',
        },
      });
      await tx.workshop.update({ where: { id: w.id }, data: { seatsTaken: n } });
    });
  }
  console.log('Seeded sample registrations');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
