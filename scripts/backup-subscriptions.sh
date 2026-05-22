#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${SUBSCRIPTION_DB_PATH:-/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite}"
BACKUP_DIR="${SUBSCRIPTION_BACKUP_DIR:-/opt/proxy-gateway-minimal/.proxy-gateway/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="${1:-${BACKUP_DIR}/subscriptions-${STAMP}.sqlite}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required" >&2
  exit 1
fi

if [ ! -f "${DB_PATH}" ]; then
  echo "database not found: ${DB_PATH}" >&2
  exit 1
fi

mkdir -p "$(dirname "${BACKUP_PATH}")"
sqlite3 "${DB_PATH}" ".backup '${BACKUP_PATH}'"
chmod 600 "${BACKUP_PATH}"
echo "${BACKUP_PATH}"
