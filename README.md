# Kenora — Workshop Registration Service

Internal tool for a community centre: staff register attendees into workshops, managers run the workshop schedule, admins manage user accounts. Registrations are never deleted, and a workshop can never be over-booked, even under concurrent requests.

- **API:** NestJS 12, Prisma 7, PostgreSQL 16 (`apps/api`)
- **Web:** React 19, Vite, Redux Toolkit, TanStack Query/Router (`apps/web`)
- Design notes and assumptions: [`docs/DESIGN.md`](docs/DESIGN.md) · plan: [`docs/PLAN.md`](docs/PLAN.md)

## Quick start

Requires Node.js >= 24.15, pnpm 10.11 (`corepack enable`) and Docker.

```bash
pnpm install                                   # also runs `prisma generate`
docker compose up -d db                        # Postgres 16 on localhost:54329
cp apps/api/.env.example apps/api/.env         # set JWT_ACCESS_SECRET to a long random string
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm dev                                       # api :3000, web :5173
```

On Windows PowerShell use `Copy-Item apps/api/.env.example apps/api/.env`.

| App | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/docs |

## Seeded logins (dev only)

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | admin@kenora.dev | Admin123! | Manage users only |
| Manager | manager@kenora.dev | Manager123! | Create/edit/cancel workshops; register and cancel attendees |
| Staff | staff@kenora.dev | Staff123! | View workshops; register and cancel attendees |

These accounts exist for local demos and must not be used in a real deployment. Passwords an admin sets for new or reset users are temporary: the user must choose their own on first sign-in.

## Scripts

```bash
pnpm test                       # unit + web tests
pnpm --filter api test:e2e      # API e2e tests (starts Postgres via Testcontainers, needs Docker)
pnpm lint && pnpm typecheck
pnpm build
docker compose down -v          # stop and wipe the database
```

## How the key rules are enforced

- **Access control** is deny-by-default on the backend: global guards reject any route without `@Public()` or `@Roles()`. A table-driven e2e test checks every endpoint against every role.
- **Capacity** is claimed with one atomic conditional `UPDATE … WHERE seatsTaken < capacity`, backed by a database `CHECK`. An e2e test sends 50 parallel requests at a 20-seat workshop and asserts exactly 20 succeed.
- **History:** cancelling flips a status and records who/when; nothing is deleted. The activity log is append-only (enforced by a database trigger).

## Docs

- [`docs/DESIGN.md`](docs/DESIGN.md) — one-page design and assumptions
- [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) — dev setup and troubleshooting
- [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) · [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md)
