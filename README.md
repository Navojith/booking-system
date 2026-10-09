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

## Docker and Kubernetes

```bash
docker compose --profile full up --build       # db + migrate + api + web -> http://localhost:8080
WEB_PORT=8088 docker compose --profile full up -d   # if 8080 is taken
```

The web image is nginx serving the built SPA and proxying `/api` to the API (`API_UPSTREAM`, default `http://api:3000`), so the browser sees one origin. Images build from the repo root:

```bash
docker build -f apps/api/Dockerfile -t kenora-api .
docker build -f apps/web/Dockerfile -t kenora-web .
```

Kubernetes manifests are in [`deploy/k8s`](deploy/k8s): namespace, config/secret template, Postgres StatefulSet (demo only; use a managed database in production), API and web Deployments with probes, and an Ingress. Push the images, set the `images:` tags in `kustomization.yaml`, create the real secret (see `config.yaml`), then:

```bash
kubectl apply -k deploy/k8s
kubectl apply -f deploy/k8s/migrate-job.yaml   # re-create per release: applies Prisma migrations
```

The production images do not include the demo seed. Instead, `node dist/bootstrap.js` (`pnpm --filter api bootstrap`) creates the first admin and the centre's three locations, and is safe to re-run (it skips whatever already exists). It needs `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; the password is temporary and the admin must change it on first sign-in. Optional: `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_LOCATIONS` (JSON array of `{name, address}`) to replace the default sites.

```bash
docker compose --profile full run --rm -e BOOTSTRAP_ADMIN_EMAIL=you@example.com -e BOOTSTRAP_ADMIN_PASSWORD=temp-pass-123 api node dist/bootstrap.js
kubectl apply -f deploy/k8s/bootstrap-job.yaml   # after creating the kenora-bootstrap secret (see the file)
```

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
