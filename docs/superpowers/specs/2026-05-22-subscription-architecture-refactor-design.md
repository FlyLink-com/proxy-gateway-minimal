# Subscription Architecture Refactor Design

## Goal

Restructure the subscription system into a modular monolith without changing runtime behavior, public routes, database technology, or deployment topology.

The subscription delivery path must stay independent from future platform, payment, or admin UI failures. Existing subscription tokens should continue to refresh through `/sub/clash.yaml` as long as the subscription database, node config, and app secrets are restored.

## Non-Goals

- Do not split into multiple services or repositories.
- Do not add payment, user accounts, public signup, or a platform API.
- Do not migrate away from SQLite in this phase.
- Do not expose admin APIs or admin UI through public Nginx.
- Do not change existing admin or public API paths.

## Target Boundaries

### Subscription Core

The subscription core owns business behavior:

- Create, renew, disable, enable, and read subscription tenants.
- Reset primary tokens and create temporary links.
- Resolve primary and temporary subscription tokens.
- Return node summaries through `listNodes()` and overview metrics through `overview()`.
- Serialize tenant-facing and admin-facing DTOs.

HTTP routes and future integrations call the core. They do not implement subscription rules.

### Subscription Store

The store is a persistence contract used by the core. The current SQLite implementation remains the production adapter and keeps the existing table structure.

The core must depend only on the store method contract, not on `better-sqlite3`, SQL statements, or SQLite row shapes.

### HTTP API Layer

Express routes stay as thin adapters:

- Read params, query values, and request bodies.
- Call the subscription core.
- Map known errors to HTTP status codes.
- Return the existing JSON response shapes.

### Platform Integration Boundary

Future platform or payment systems are only callers of the subscription core contract. They can request operations such as opening, renewing, disabling, or querying a subscription, but they must not read or write the subscription database directly.

## Data Flow

Admin UI or future platform flow:

```text
caller -> /api/admin/* or internal integration -> SubscriptionCore -> SubscriptionStore -> SQLite
```

Public subscription refresh flow:

```text
client -> /sub/clash.yaml?token=... -> SubscriptionCore -> SubscriptionStore -> Clash generator
```

Platform outage must not affect the public subscription refresh flow.

## Compatibility Requirements

These public routes remain unchanged:

- `GET /sub/clash.yaml?token=...`
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

Existing token behavior remains unchanged:

- Primary `pgsub_` tokens are visible once and stored as hashes.
- Temporary `pgtmp_` links are stored as hashes and expire independently.
- Resetting a primary token invalidates the previous primary token without deleting temporary links.
- Valid subscription refresh updates `lastUsedAt`.

## Recovery Boundary

The minimum recoverable subscription service consists of:

- Git-tracked application code.
- Subscription SQLite database.
- `.env` values, including `CONSOLE_TOKEN`, `SS_PASSWORD`, and subscription public base URL.
- Proxy node config.
- Nginx allowlist and public path config.
- systemd service files for the app and Shadowsocks service.

Platform records, payment state, and admin UI availability are not required for existing subscription refreshes.

## Verification

The refactor is acceptable only if:

- Existing backend tests continue to pass.
- Admin UI tests and build continue to pass.
- New contract tests prove the core uses a store contract rather than SQLite internals.
- HTTP response shapes remain compatible.
- `/sub/clash.yaml` works with tenant tokens without platform dependencies.
