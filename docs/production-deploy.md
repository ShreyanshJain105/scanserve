# Production Deployment

This guide assumes single-host Docker Compose deployment using the production images and `.env.prod`.

## 1) Build or pull images
Option A: build locally
```bash
TAG=latest scripts/build-prod-images.sh
```

Option B: pull from registry (if published)
```bash
docker pull <registry>/scan2serve-api:<tag>
docker pull <registry>/scan2serve-web:<tag>
docker pull <registry>/scan2serve-gateway:<tag>
```

## 2) Configure environment
```bash
cp .env.prod.example .env.prod
```

Fill **all REQUIRED** values in `.env.prod`. At minimum:
- `DATABASE_URL`, `POSTGRES_*`, `JWT_SECRET`, `INTERNAL_API_KEY`
- `CLIENT_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`
- `S3_*` if using bundled MinIO
- `CLICKHOUSE_*` and `REDIS_*` if using bundled services

### ClickHouse admin password (REQUIRED)
Before first boot, update `clickhouse-users/admin.xml` with a strong password and set the matching `CLICKHOUSE_BOOTSTRAP_*` if you use bootstrapping scripts.

## 3) Boot the stack
```bash
scripts/prod-compose.sh
```

This runs:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## 4) Verify health
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected healthy services:
- `api` healthy
- `web` healthy
- `gateway` healthy
 - `grafana` healthy (optional monitoring at `/grafana/`)

## 5) Migrations and seeds (optional)
Run migrations:
```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @scan2serve/api db:migrate:deploy
```

Seed admin user:
```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @scan2serve/api db:seed
```

Sample data (optional):
```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @scan2serve/api db:seed:sample
```

Note: For production, prefer running migrations via CI/CD or a dedicated migration job.

## 6) Run migrations + seed
```bash
scripts/prod-migrate.sh
```

Note: `scripts/prod-migrate.sh` now also runs `db:seed:sample` for demo data.
