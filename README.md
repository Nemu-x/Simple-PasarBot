# Simple PasarBot

MVP for Telegram VPN subscriptions with PasarGuard integration.

## Quick start

1. Copy env:
   - `cp .env.example .env`
2. Start stack:
   - `docker compose -f deploy/docker-compose.yml up -d --build`
3. API health:
   - `http://localhost:8080/health`

## Current MVP scope

- Trial subscriptions by Telegram ID.
- Channel check gate (request payload flag for now).
- Payment request creation and webhook verification flow.
- Subscription blocking for expired/traffic-overlimit.
- PasarGuard user sync and info endpoint hooks.
- Telegram bot commands: `/start`, `/trial`, `/cabinet`, `/buy`.

## Core endpoints

- `GET /plans`
- `POST /trial/start`
- `GET /cabinet/:telegramId`
- `POST /payments/create`
- `POST /payments/webhook`
- `GET /admin/subscriptions`
- `POST /admin/subscriptions/reconcile`
- `GET /admin/pasarguard/info`
