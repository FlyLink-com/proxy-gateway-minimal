# API Compatibility

Phase 1 keeps the existing `proxy-gateway-minimal` API surface stable.

Still supported:

- `GET /api/health`
- `POST /api/ss/start`
- `POST /api/ss/stop`
- `POST /api/http-proxy/start`
- `POST /api/http-proxy/stop`
- `POST /api/proxy/start`
- `POST /api/proxy/stop`
- `GET /api/proxy/overview`
- `GET /api/proxy/status`
- `GET /api/proxy/test`
- `GET /api/proxy/servers`
- `GET /api/nginx/status`
- `GET /api/ping/:host`
- `POST /api/system-proxy/:action`
- `POST /api/env-proxy/on`
- `POST /api/env-proxy/off`
- `GET /api/env-proxy/status`
- `POST /api/autostart/on`
- `POST /api/autostart/off`
- `GET /api/autostart/status`

New:

- `GET /api/status`
- `GET /api/network/status`
- `POST /api/network/repair`
- `POST /api/network/reset`
- `GET /sub/clash.yaml`
- `GET /api/subscription/status`

Control routes require the console token. `GET /api/health` and `GET /proxy.pac` remain public.

## Subscription Admin Contract

The structural refactor keeps the subscription HTTP contract stable while moving business rules behind `SubscriptionCore` and persistence behind `SubscriptionStore`.

Admin routes:

- `GET /api/admin/subscriptions`
- `POST /api/admin/subscriptions`
- `GET /api/admin/subscriptions/:id`
- `PATCH /api/admin/subscriptions/:id`
- `POST /api/admin/subscriptions/:id/renew`
- `POST /api/admin/subscriptions/:id/disable`
- `POST /api/admin/subscriptions/:id/enable`
- `POST /api/admin/subscriptions/:id/reset-token`
- `POST /api/admin/subscriptions/:id/temp-link`
- `POST /api/admin/subscriptions/:id/node`
- `GET /api/admin/nodes`
- `GET /api/admin/overview`

Public subscription route:

- `GET /sub/clash.yaml?token=...`

Compatibility rules:

- Admin route paths and response shapes remain compatible with the React admin shell.
- `POST /api/admin/subscriptions` may include `nodeId`; when omitted, the backend keeps using the first configured named node.
- Default-primary tenants receive the configured V2 subscription node set in future subscription YAML output.
- `POST /api/admin/subscriptions/:id/node` is an operator-only maintenance and canary mechanism. It accepts a configured node `id` or `name`, does not change tenant tokens or subscription URLs, and can scope that tenant's future subscription YAML output to the selected non-default node.
- `GET /api/admin/overview` returns flat UI fields (`total`, `active`, `expiring`, `disabled`, `expired`) and keeps the legacy `counts` object for compatibility.
- Primary `pgsub_` tokens and temporary `pgtmp_` tokens are still stored as hashes.
- Full subscription URLs are still visible only on create, reset, or temporary-link creation.
- Adding a second production node to `config/proxy-servers.json`, migrating production tenant `nodeId` values, or emitting a new production node remains Risk A production node-config work.
- `/sub/clash.yaml` depends on `SubscriptionCore`, `SubscriptionStore`, node config, and secrets. It must not depend on future platform or payment availability.
- Public proxy config summaries redact protocol credentials, including
  Shadowsocks passwords, VLESS/TUIC UUIDs, TUIC tokens, and Hysteria2
  obfuscation passwords.
- SQLite remains the production store adapter in this phase; future stores must implement the `SubscriptionStore` method contract.
