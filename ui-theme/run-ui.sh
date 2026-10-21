#!/usr/bin/env bash
# Runs the eSignet OIDC UI container with the modern theme mounted in (no image rebuild).
# Usage: ./run-ui.sh   (expects eSignet on the host at :8088)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="$HERE/../repos/esignet-go/docker-compose/nginx.conf"
docker rm -f esignet-ui >/dev/null 2>&1 || true
docker run -d --name esignet-ui --user root --add-host esignet:host-gateway -p 3000:3000 \
  -v "$NGINX_CONF:/etc/nginx/nginx.conf" \
  -v "$HERE/variables.css:/usr/share/nginx/html/theme/variables.css:ro" \
  -e container_user=mosip -e DEFAULT_LANG=en -e DEFAULT_TITLE="eSignet" \
  -e DEFAULT_FONT_URL="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" \
  -e 'DEFAULT_WELLKNOWN=%5B%7B%22name%22%3A%22OpenID%20Configuration%22%2C%22value%22%3A%22%2F.well-known%2Fopenid-configuration%22%7D%5D' \
  mosipdev/oidc-ui:develop-go >/dev/null
echo "esignet-ui started on http://localhost:3000 with the modern theme"
