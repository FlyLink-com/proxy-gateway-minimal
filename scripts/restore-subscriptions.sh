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
SERVICE_NAME="${SUBSCRIPTION_SERVICE_NAME:-proxy-gateway-console.service}"

service_property() {
  local property="$1"
  sudo systemctl show -p "${property}" --value "${SERVICE_NAME}" 2>/dev/null || true
}

SERVICE_USER="${SUBSCRIPTION_SERVICE_USER:-$(service_property User)}"
SERVICE_GROUP="${SUBSCRIPTION_SERVICE_GROUP:-$(service_property Group)}"
if [ -n "${SERVICE_USER}" ] && [ -z "${SERVICE_GROUP}" ]; then
  SERVICE_GROUP="$(id -gn "${SERVICE_USER}" 2>/dev/null || printf '%s' "${SERVICE_USER}")"
fi

if [ ! -f "${BACKUP_PATH}" ]; then
  echo "backup not found: ${BACKUP_PATH}" >&2
  exit 1
fi

sudo systemctl stop "${SERVICE_NAME}"

mkdir -p "${DB_DIR}"
if [ -f "${DB_PATH}" ]; then
  cp -p "${DB_PATH}" "${PRE_RESTORE_BACKUP}"
fi

install -m 600 "${BACKUP_PATH}" "${DB_PATH}"
if [ -n "${SERVICE_USER}" ]; then
  sudo chown "${SERVICE_USER}:${SERVICE_GROUP:-${SERVICE_USER}}" "${DB_PATH}"
fi
sudo systemctl start "${SERVICE_NAME}"

echo "restored ${DB_PATH}"
if [ -f "${PRE_RESTORE_BACKUP}" ]; then
  echo "previous database saved at ${PRE_RESTORE_BACKUP}"
fi
