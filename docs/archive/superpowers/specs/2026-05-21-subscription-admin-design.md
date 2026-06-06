# Subscription Admin Design

## Goal

Add a subscription management admin surface on top of the already working AWS Singapore subscription service. This phase does not add payment, public sign-up, or per-user proxy isolation. It turns the current single-subscription service into an operator-managed multi-subscription workflow.

## Current Baseline

- `master` already contains the reusable module packaging work.
- The AWS Singapore node is live and usable through Karing/Clash clients.
- The existing `public/index.html` is a developer/operations console, not a product admin panel.
- Current subscription behavior is single-token and single-node.

## Admin Shell Decision

Use `satnaing/shadcn-admin` as the admin shell reference, not as a wholesale vendor drop.

Source: <https://github.com/satnaing/shadcn-admin>

Why this shell:

- It is a Vite + React + TypeScript dashboard built with shadcn/ui.
- It already has a sidebar layout, light/dark mode, global search, responsive behavior, and multiple page patterns.
- It is MIT licensed.
- It is explicitly a reusable dashboard UI collection rather than a full starter, which matches our need to adapt selected layout and component patterns into this project.

Integration rule:

- Copy/adapt only the layout and component patterns needed for this project.
- Keep the proxy gateway backend and route contracts owned by this repository.
- Do not introduce Clerk, external auth services, or unrelated demo pages in the first admin shell phase.
- Follow shadcn/ui composition rules when adding components: use `Sidebar`, `Table`, `Card`, `Badge`, `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Tabs`, `Alert`, `Empty`, `Skeleton`, and `sonner` rather than custom equivalents.

## Product Positioning

Split the UI into three surfaces:

- **Admin Console**: normal operator surface for subscription users and node status.
- **Operations Console**: service health, local/remote node diagnostics, deployment status, and restart/repair actions.
- **API Playground**: developer-only endpoint checks. This should move out of the primary workflow.

The first usable screen should be the admin console, not a marketing page and not a raw API test page.

## First Admin Navigation

The shell should provide these top-level sections:

- **Overview**
  - High-level service status.
  - Active subscriptions count.
  - Expiring soon count.
  - Disabled/expired count.
  - Current node summary.

- **Subscriptions**
  - Main page for daily management.
  - Tenant list with status, expiry, node, last used time, and actions.
  - Create subscription flow.
  - Copy subscription link.
  - Renew, disable, enable, and reset token actions.

- **Nodes**
  - Shows `aws-singapore` as the current production node.
  - Shows host, region, protocol, status, and health check result.
  - First phase is read-only.

- **Diagnostics**
  - Keeps existing health and network checks.
  - Moves detailed operational tests out of the subscription workflow.

- **API Playground**
  - Keeps endpoint-level checks for development.
  - Clearly marked as developer tooling.

- **Settings**
  - Admin token / console settings.
  - Default subscription duration.
  - Public subscription host.
  - Future node credential mode.

## Subscription Management MVP

The MVP uses independent subscription tokens while sharing the current AWS Singapore proxy node credentials.

Supported actions:

- Create subscription user.
- List subscription users.
- Search/filter users by name and status.
- Copy user-specific subscription URL.
- Renew subscription by setting a new expiry date.
- Disable subscription.
- Re-enable subscription.
- Reset subscription token.
- Delete user only when explicitly confirmed.
- Record `last_used_at` whenever a valid subscription is fetched.

Status model:

- `active`: enabled and not expired.
- `expiring`: enabled and expires within the configured warning window.
- `expired`: expiry time has passed.
- `disabled`: operator disabled the user.

Important limitation:

- In this MVP, disabling a user prevents future subscription refreshes but does not guarantee immediate disconnect if the user already cached the shared Shadowsocks credential in a client.
- Immediate per-user cut-off requires the later isolated-credential phase.

## Future Isolation Upgrade

The data model and admin UI must reserve room for per-user proxy credentials.

Future credential modes:

- `shared-node`: current MVP mode. All users receive the same node credential.
- `per-user-password`: each user receives a generated password on a proxy service that supports multiple users.
- `per-user-port`: each user receives a dedicated port and credential.

The admin UI should show a credential mode field but can display `shared-node` as read-only in the MVP.

## Data Model

Use SQLite for the first backend implementation because this service runs as a small single-node admin system.

Tables:

```text
tenants
- id
- display_name
- status
- expires_at
- note
- created_at
- updated_at

subscription_tokens
- id
- tenant_id
- token_hash
- token_prefix
- revoked_at
- last_used_at
- created_at

nodes
- id
- name
- region
- host
- port
- method
- credential_mode
- status
- created_at
- updated_at

audit_events
- id
- actor
- action
- tenant_id
- created_at
- metadata_json
```

Token storage:

- Store only token hashes.
- Show full raw token only once at creation/reset time.
- Keep `token_prefix` for operator identification without exposing the full token.

## API Contract

Admin routes remain protected by the existing console auth model in the first phase.

Routes:

```text
GET    /api/admin/subscriptions
POST   /api/admin/subscriptions
GET    /api/admin/subscriptions/:id
PATCH  /api/admin/subscriptions/:id
POST   /api/admin/subscriptions/:id/renew
POST   /api/admin/subscriptions/:id/disable
POST   /api/admin/subscriptions/:id/enable
POST   /api/admin/subscriptions/:id/reset-token
DELETE /api/admin/subscriptions/:id

GET    /api/admin/nodes
GET    /api/admin/overview
GET    /sub/clash.yaml?token=<tenant-token>
```

Create request:

```json
{
  "displayName": "customer-a",
  "expiresAt": "2026-06-21T00:00:00.000Z",
  "note": "manual subscription"
}
```

Create response:

```json
{
  "tenant": {
    "id": "tenant_...",
    "displayName": "customer-a",
    "status": "active",
    "expiresAt": "2026-06-21T00:00:00.000Z",
    "nodeName": "aws-singapore"
  },
  "subscriptionUrl": "https://example.com/sub/clash.yaml?token=raw-token-visible-once"
}
```

Subscription fetch behavior:

- Valid active token returns Clash YAML for the tenant's allowed node.
- Disabled token returns `403`.
- Expired token returns `403`.
- Unknown token returns `401`.
- Valid fetch updates `last_used_at`.

## Frontend-First Delivery

Because the single-user service already works, the next implementation should start with the admin shell and mock data.

Reason:

- The main uncertainty is the operator workflow, not whether the proxy can run.
- The UI will define the real daily actions: create, copy, renew, disable, reset.
- The backend should be built against a validated flow rather than speculative endpoints.

Frontend phase:

- Add a Vite/React admin app directory.
- Adapt the shadcn admin shell layout.
- Implement `Subscriptions` with mock rows and local state.
- Implement dialogs/sheets for create, renew, disable, and reset token.
- Keep API calls behind a small client module so mock data can later be swapped for real endpoints.

Backend phase:

- Add SQLite persistence and admin routes after the UI workflow is reviewed.
- Replace mock client methods with real HTTP calls.

## Branch Plan

Use short-lived branches:

```text
plan/subscription-admin
feat/admin-console-shell
feat/subscription-admin-core
feat/admin-console-api-integration
ops/aws-subscription-admin-deploy
```

Policy:

- `plan/*`: design and plans only.
- `feat/*`: one feature area per branch.
- `polish/*`: small finishing tasks after core workflows are stable.
- `test/*`: isolated test hardening.
- `docs/*`: documentation-only changes.
- `ops/*`: deployment and infrastructure work.

Do not open many feature branches during early development. Use multiple small branches mainly during polishing, when task boundaries are stable.

## Non-Goals

- No payment integration.
- No public sign-up.
- No user self-service portal.
- No per-user traffic billing.
- No hard device count enforcement.
- No immediate user disconnect guarantee in the shared-node MVP.
- No wholesale replacement of the current backend.

## Verification Plan

Design branch:

- Spec review for contradictions and scope creep.
- No runtime tests required beyond confirming the repo remains clean.

Admin shell branch:

- `npm test` for existing backend tests.
- Frontend build/test command selected by the shell implementation.
- Browser verification for desktop and mobile layouts.
- Mock subscription workflow verification: create, copy, renew, disable, reset.

Backend branch:

- Unit tests for SQLite repository behavior.
- Unit tests for token hash/verification and status calculation.
- Route tests for admin CRUD.
- Route tests for subscription fetch: valid, unknown, disabled, expired.
- Full `npm test`.

Deployment branch:

- Remote service health check.
- Valid tenant subscription fetch from AWS.
- Invalid/expired/disabled token checks from AWS.
- Karing/Clash import check using a generated tenant URL.

## Implementation Note

The first implementation branch creates a separate `admin/` Vite React app. The existing `public/index.html` remains the legacy operations/API console until the admin app is ready to replace or sit beside it in deployment.
