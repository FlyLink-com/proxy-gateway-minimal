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
- `GET /api/admin/nodes`
- `GET /api/admin/overview`

Public subscription route:

- `GET /sub/clash.yaml?token=...`

Compatibility rules:

- Admin route paths and response shapes remain compatible with the React admin shell.
- Primary `pgsub_` tokens and temporary `pgtmp_` tokens are still stored as hashes.
- Full subscription URLs are still visible only on create, reset, or temporary-link creation.
- `/sub/clash.yaml` depends on `SubscriptionCore`, `SubscriptionStore`, node config, and secrets. It must not depend on future platform or payment availability.
- SQLite remains the production store adapter in this phase; future stores must implement the `SubscriptionStore` method contract.
