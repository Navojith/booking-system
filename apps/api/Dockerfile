# syntax=docker/dockerfile:1
# Build context: repository root  (docker build -f apps/api/Dockerfile .)
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY apps/api apps/api
# openssl is needed by the Prisma engines at generate time
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter api...
RUN pnpm --filter api build
# Production-only dependency tree (postinstall regenerates the Prisma client)
RUN pnpm --filter api deploy --legacy --prod /out \
 && cp -r apps/api/dist /out/dist

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
# Migrations: `npx prisma migrate deploy` (run as a Job / init step, see deploy/k8s)
CMD ["node", "dist/main.js"]
