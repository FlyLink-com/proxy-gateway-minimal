# Edge-Agent Future-Order Candidate Startup Diagnostic

Date: 2026-06-11

Risk: A

Scope:

- Vultr Japan control-plane host: read-only diagnostic.
- Vultr Singapore data plane: no mutation, no restart.
- No live order creation.
- No DNS, Nginx, provider firewall, runtime service, account, payment, or
  credential mutation.

## Context

The previous approved retry for `edge-agent-future-order-runtime-20260611-001`
crossed the candidate release-local envfile boundary, but the candidate still
did not remain active under the real `proxy-gateway-candidate.service` path. The
gate rolled back to `edge-agent-production-activation-20260610-005-worktree`.

This diagnostic gate was opened to classify the next failure without another
blind production restart.

## Read-Only Checks

The diagnostic verified:

- Japan current release remains
  `edge-agent-production-activation-20260610-005-worktree`;
- `proxy-gateway-candidate.service` is active on the rollback release;
- the candidate release directory for
  `edge-agent-future-order-runtime-20260611-001` exists;
- the candidate package has `package.json`, `server/app.mjs`, `node_modules`,
  and `better-sqlite3`;
- recent failure classification does not point to module import, SQLite,
  permission, or port-conflict failure;
- recent failure classification points to proxy config validation before the
  server remains active.

No raw journal lines, environment values, config values, SQLite rows, tokens,
private keys, or credentials were output or recorded.

## Finding

The redacted classifier narrowed the candidate startup failure to:

- channel: `channel-sgp-a-vless-reality-tcp`;
- field: `host`;
- error class: required proxy config field missing after runtime placeholder
  resolution.

The candidate `config/proxy-servers.json` contains six channels and uses runtime
placeholders for Vultr and Singapore material. Placeholder presence checks found:

- total placeholders: `20`;
- placeholders present in the active service environment: `10`;
- placeholders missing from the active service environment: `10`;
- missing placeholders are all Singapore keys.

The missing Singapore key names were:

- `SGP_VLESS_REALITY_HOST`;
- `SGP_VLESS_REALITY_UUID`;
- `SGP_VLESS_REALITY_SNI`;
- `SGP_HY2_HOST`;
- `SGP_HY2_PASSWORD`;
- `SGP_HY2_SNI`;
- `SGP_TUIC_HOST`;
- `SGP_TUIC_UUID`;
- `SGP_TUIC_PASSWORD`;
- `SGP_TUIC_SNI`.

Only key names are recorded here; no values were output.

## Root Cause

The candidate package expects Singapore static channel material under the
`SGP_*` placeholder names listed above, but the active protected environment
visible to the Japan service does not provide those names. When `current` is
switched to the candidate release, the candidate proxy config resolves the
Singapore VLESS `host` placeholder to an empty value and fails proxy config
validation before the service remains active.

This is not a schema migration failure, SQLite lock, Node module packaging
failure, port conflict, or systemd permission failure.

## Current State

- Production remains on
  `edge-agent-production-activation-20260610-005-worktree`.
- The real production control DB is still not migrated for
  `platform_edge_desired_state_notifications`.
- No SGP runtime service was restarted or mutated by this diagnostic.

## Next Gate

Do not retry the runtime/schema upgrade yet.

The next exact Risk A gate should do one of the following, then prove it with a
candidate temp-start before any production symlink switch:

1. register the missing `SGP_*` protected environment keys from
   operator-protected runtime material, without outputting values; or
2. rebuild the candidate proxy config/template to use the already approved
   protected key names that exist on Japan.

Validation for that next gate must include:

- `edge-agent-future-order-runtime-20260611-001` temp-starts against candidate
  config with temporary DB paths and an alternate loopback port;
- placeholder missing count is zero;
- Japan public Admin and public internal agent routes remain blocked;
- no live order creation;
- no raw env/log/config/SQLite/credential output.
