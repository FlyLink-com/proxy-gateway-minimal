#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" != "--apply" ]; then
  cat >&2 <<'USAGE'
usage: sudo bash ops/edge-node/bootstrap.sh --apply

This script prepares provider-neutral edge-node runtime materials.
It does not copy secrets, restore SQLite, start services, change DNS, or cut
traffic over. Run it only under an approved Risk A execution record.
USAGE
  exit 2
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "bootstrap.sh must run as root via sudo" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

APP_DIR="${APP_DIR:-/opt/proxy-gateway-minimal}"
APP_USER="${APP_USER:-proxy-gateway}"
APP_GROUP="${APP_GROUP:-proxy-gateway}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-proxy-gateway-public.conf}"
REMOVE_DEFAULT_NGINX_SITE="${REMOVE_DEFAULT_NGINX_SITE:-false}"

require_file() {
  local path="$1"
  if [ ! -f "${path}" ]; then
    echo "required file missing: ${path}" >&2
    exit 1
  fi
}

require_file "${SCRIPT_DIR}/systemd/proxy-gateway-console.service"
require_file "${SCRIPT_DIR}/systemd/proxy-gateway-ss.service"
require_file "${SCRIPT_DIR}/nginx/proxy-gateway-public.conf"

if [ ! -f "${REPO_ROOT}/package.json" ]; then
  echo "repository root not found from ${SCRIPT_DIR}" >&2
  exit 1
fi

if [ "${REPO_ROOT}" != "${APP_DIR}" ] && [ "${ALLOW_REPO_ROOT_MISMATCH:-false}" != "true" ]; then
  echo "repository checkout is ${REPO_ROOT}, expected APP_DIR=${APP_DIR}" >&2
  echo "move the checkout to APP_DIR or set ALLOW_REPO_ROOT_MISMATCH=true explicitly" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx sqlite3 shadowsocks-libev

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found; install approved Node.js 20+ or 22+ runtime first" >&2
  exit 1
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}" "${APP_DIR}/.proxy-gateway/backups" /etc/proxy-gateway
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.proxy-gateway" 2>/dev/null || true
chmod 750 "${APP_DIR}/.proxy-gateway"

cd "${REPO_ROOT}"
npm ci
npm ci --prefix admin
npm run admin:build

install -m 0644 "${SCRIPT_DIR}/systemd/proxy-gateway-console.service" \
  /etc/systemd/system/proxy-gateway-console.service
install -m 0644 "${SCRIPT_DIR}/systemd/proxy-gateway-ss.service" \
  /etc/systemd/system/proxy-gateway-ss.service
install -m 0644 "${SCRIPT_DIR}/nginx/proxy-gateway-public.conf" \
  "/etc/nginx/sites-available/${NGINX_SITE_NAME}"
ln -sf "/etc/nginx/sites-available/${NGINX_SITE_NAME}" \
  "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"

if [ "${REMOVE_DEFAULT_NGINX_SITE}" = "true" ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

systemctl daemon-reload
nginx -t

cat <<'DONE'
edge-node build materials installed.

Next steps, under separate approval:
- create /opt/proxy-gateway-minimal/.env from ops/edge-node/templates/env.example;
- create /etc/proxy-gateway/ss-server.json from ops/edge-node/templates/ss-server.json.example;
- restore approved SQLite backup and verify integrity;
- start or restart services only after secrets/data are approved and installed.
DONE
