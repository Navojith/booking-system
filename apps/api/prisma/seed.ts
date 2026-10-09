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
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
