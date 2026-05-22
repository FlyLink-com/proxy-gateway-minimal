#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: restore-subscriptions.sh /path/to/subscriptions-backup.sqlite" >&2
  exit 1
fi

BACKUP_PATH="$1"
DB_PATH="${SUBSCRIPTION_DB_PATH:-/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite}"
DB_DIR="$(dirname "${DB_PATH}")"
PRE_RESTORE_BACKUP="${DB_PATH}.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -f "${BACKUP_PATH}" ]; then
  echo "backup not found: ${BACKUP_PATH}" >&2
  exit 1
fi

sudo systemctl stop proxy-gateway-console.service

mkdir -p "${DB_DIR}"
if [ -f "${DB_PATH}" ]; then
  cp -p "${DB_PATH}" "${PRE_RESTORE_BACKUP}"
fi

install -m 600 "${BACKUP_PATH}" "${DB_PATH}"
sudo chown proxy-gateway:proxy-gateway "${DB_PATH}"
sudo systemctl start proxy-gateway-console.service

echo "restored ${DB_PATH}"
if [ -f "${PRE_RESTORE_BACKUP}" ]; then
  echo "previous database saved at ${PRE_RESTORE_BACKUP}"
fi
