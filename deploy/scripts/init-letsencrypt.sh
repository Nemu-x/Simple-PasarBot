#!/bin/sh
set -e

if [ -z "$DOMAIN" ] || [ -z "$CERTBOT_EMAIL" ]; then
  echo "DOMAIN and CERTBOT_EMAIL are required"
  exit 1
fi

mkdir -p ./deploy/certbot/www ./deploy/certbot/conf

docker compose -f deploy/docker-compose.yml up -d nginx

docker compose -f deploy/docker-compose.yml run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$CERTBOT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

docker compose -f deploy/docker-compose.yml restart nginx
echo "Certificate created for $DOMAIN"
