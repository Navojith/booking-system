/**
 * Production bootstrap: `node dist/bootstrap.js`. Idempotent and safe to re-run.
 *
 * - Creates the first ADMIN from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 *   (optional BOOTSTRAP_ADMIN_NAME) only when no admin exists yet. The password is
 *   temporary: the admin must change it on first sign-in.
 * - Creates the centre's locations (there is no API for them) only when none exist.
 *   Override the defaults with BOOTSTRAP_LOCATIONS='[{"name":"..","address":".."}]'.
 *
 * Unlike prisma/seed.ts it creates no demo users or workshops.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma/client.js';

const DEFAULT_LOCATIONS = [
  { name: 'Downtown Campus', address: '12 Main Street' },
  { name: 'Lakeside Studio', address: '88 Shore Road' },
  { name: 'North Hub', address: '301 Birch Avenue' },
];

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().transform((e) => e.trim().toLowerCase()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).max(128),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).max(100).default('Administrator'),
  BOOTSTRAP_LOCATIONS: z
    .string()
    .optional()
    .transform((v) => (v ? JSON.parse(v) : DEFAULT_LOCATIONS))
    .pipe(z.array(z.object({ name: z.string().min(1), address: z.string().min(1) })).min(1)),
});

async function main() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid bootstrap environment: ${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

  try {
    if ((await prisma.user.count({ where: { role: 'ADMIN' } })) === 0) {
      await prisma.user.create({
        data: {
          email: env.BOOTSTRAP_ADMIN_EMAIL,
          fullName: env.BOOTSTRAP_ADMIN_NAME,
          role: 'ADMIN',
          passwordHash: await argon2.hash(env.BOOTSTRAP_ADMIN_PASSWORD),
          mustChangePassword: true,
        },
      });
      console.log(`Created admin ${env.BOOTSTRAP_ADMIN_EMAIL} (must change password on first sign-in)`);
    } else {
      console.log('An admin already exists; skipping admin creation');
    }

    if ((await prisma.location.count()) === 0) {
      await prisma.location.createMany({ data: env.BOOTSTRAP_LOCATIONS });
      console.log(`Created ${env.BOOTSTRAP_LOCATIONS.length} locations`);
    } else {
      console.log('Locations already exist; skipping');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
