#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${GCCGW_ROOT:-/opt/proxy-gateway-minimal-candidate/current}"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

cd "$ROOT_DIR"

: "${EDGE_AGENT_BASE_URL:?EDGE_AGENT_BASE_URL is required}"
: "${EDGE_AGENT_NODE_REF:?EDGE_AGENT_NODE_REF is required}"
: "${EDGE_AGENT_CHANNEL_REFS:?EDGE_AGENT_CHANNEL_REFS is required}"

if [[ -z "${EDGE_AGENT_TOKEN:-}" && -z "${EDGE_AGENT_TOKEN_FILE:-}" ]]; then
  echo '{"ok":false,"error":"edge_agent_token_required","redacted":true}' >&2
  exit 1
fi

exec "$NODE_BIN" agent/production-edge-agent.mjs
