# Runbook

## Deploy

1. Fill `.env` from `.env.example`.
2. Run:
   - `docker compose -f deploy/docker-compose.yml up -d --build`
3. Check:
   - `docker compose -f deploy/docker-compose.yml ps`
   - `curl http://localhost:8080/health`

## Update

1. Pull latest code.
2. Rebuild:
   - `docker compose -f deploy/docker-compose.yml up -d --build`

## Backup

- PostgreSQL volume: `pgdata`.
- Recommend daily dump:
  - `docker exec <db_container> pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql`

## Incident checks

- API down: inspect `api` logs.
- Payments mismatch: replay webhook with valid signature.
- Users blocked unexpectedly: check `packages/worker` interval logs.
