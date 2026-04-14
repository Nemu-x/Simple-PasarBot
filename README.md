# Simple PasarBot

MVP for Telegram VPN subscriptions with PasarGuard integration.

## Quick start

1. Copy env:
   - `cp .env.example .env`
2. Update at least:
   - `DATABASE_URL`
   - `BOT_TOKEN`
   - `PASARGUARD_BASE_URL`
   - `PASARGUARD_API_KEY`
   - `PLATEGA_API_KEY`
   - `PLATEGA_WEBHOOK_SECRET`
   - `DOMAIN`
   - `CERTBOT_EMAIL`
2. Start stack:
   - `docker compose -f deploy/docker-compose.yml up -d --build`
3. API health:
   - `https://<your-domain>/health`

PostgreSQL migrations are applied automatically by API container startup (`npm run migrate`).

## TLS with Nginx + Certbot

1. Start services:
   - `docker compose -f deploy/docker-compose.yml up -d --build`
2. Issue certificate once:
   - `DOMAIN=your-domain.com CERTBOT_EMAIL=you@example.com sh deploy/scripts/init-letsencrypt.sh`
3. Certbot container then renews certificates automatically every 12 hours.

## Current MVP scope

- Trial subscriptions by Telegram ID.
- RU/EN localization for bot and API responses.
- Channel check gate (request payload flag for now).
- Payment request creation and webhook verification flow.
- Subscription blocking for expired/traffic-overlimit.
- PasarGuard user sync and info endpoint hooks.
- Telegram bot commands: `/start`, `/trial`, `/cabinet`, `/buy`, `/lang`, `/instructions`.
- User receives subscription URL + configurable instruction per platform + QR code.

## Core endpoints

- `GET /plans`
- `POST /trial/start`
- `GET /cabinet/:telegramId`
- `POST /users/language`
- `POST /payments/create`
- `POST /payments/webhook`
- `GET /admin/subscriptions`
- `POST /admin/subscriptions/reconcile`
- `GET /admin/instructions`
- `POST /admin/instructions`
- `POST /admin/plans`
- `DELETE /admin/plans/:id`
- `GET /admin/pasarguard/info`
