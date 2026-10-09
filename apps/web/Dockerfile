# syntax=docker/dockerfile:1
# Build context: repository root  (docker build -f apps/web/Dockerfile .)
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY apps/web apps/web
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter web... --ignore-scripts
RUN pnpm --filter web exec vite build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# The official image renders /etc/nginx/templates/*.template with envsubst at start-up.
ENV API_UPSTREAM=http://api:3000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
