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

## Production server checklist (Hostinger VPS)

1. Install Docker + Compose plugin.
2. Clone repo and create `.env` with strong secrets.
3. Set domain DNS A record to server IP.
4. Open only ports `22`, `80`, `443` in firewall.
5. Run stack with:
   - `docker compose -f deploy/docker-compose.yml up -d --build`
6. Put reverse proxy (Nginx/Caddy/Traefik) in front of `api:8080` and issue TLS cert.
7. Configure Platega webhook URL to:
   - `https://<your-domain>/payments/webhook`
8. For this repo (Nginx + Certbot):
   - `docker compose -f deploy/docker-compose.yml up -d --build`
   - `DOMAIN=<your-domain> CERTBOT_EMAIL=<email> sh deploy/scripts/init-letsencrypt.sh`

## PostgreSQL production notes

- Use managed backups for volume `pgdata` (snapshot + SQL dump).
- Never expose `5432` publicly in production; keep DB internal-only.
- Migrations are idempotent through `schema_migrations`.
- Certificates are auto-renewed by `certbot` service every 12h.

## Incident checks

- API down: inspect `api` logs.
- Payments mismatch: replay webhook with valid signature.
- Users blocked unexpectedly: check `packages/worker` interval logs.
