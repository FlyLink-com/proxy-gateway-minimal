# Lead Durability Foundation Design

## Decision

Replace Draft PR #476 with one source-only Risk A proposal that persists only
the existing Lead review queue. Do not add the parallel operations event ledger,
generic operations summaries, lifecycle event semantics, provider automation,
or production schema initialization from #476.

## Risk and authority

- Risk: A because this source adds SQLite schema containing private Lead data.
- Execution authority: repository source changes and local synthetic SQLite
  validation only.
- Production/AWS/provider/runtime impact: none.
- A future production action requires a fresh read-only inventory, immutable
  backup and restore proof, explicit operator approval, schema readback,
  protected-route validation, and a retention-aware backup policy.

## Scope

Add one additive-only `platform_leads` table plus status/creation and expiry
indexes to the existing subscription control store. Expose a narrow store port
to the existing Lead review queue and wire the runtime-created queue to the
already-owned control store.

The protected and public HTTP contracts remain unchanged:

- public submission returns only acceptance status;
- protected list returns the existing summary shape without `message`;
- protected detail remains the existing private Lead shape;
- status updates retain the original `createdAt` and refresh `updatedAt`.

## Retention and erasure contract

The approved retention period is exactly 90 days from `updatedAt`. Each stored
row carries a normalized `expires_at` timestamp calculated as
`updatedAt + 90 * 24 * 60 * 60 * 1000`.

Before enqueue, list, read, or status update, the queue asks the store to delete
rows whose `expires_at <= now`. An expired Lead is never returned and behaves as
`not_found`. The queue also exposes an explicit `purgeExpiredLeads()` operation
for an operator-controlled future maintenance cadence. This source proposal
does not create a scheduler or claim production execution.

Physical deletion occurs at the next queue interaction or explicit purge. A
future production gate must define a purge cadence that meets the approved
retention deadline. Backups containing Lead rows must not outlive the same
90-day boundary; restoring a backup requires an immediate purge before service
traffic resumes.

Deletion removes the whole Lead row, including organization, email, direction,
stage, message, source, and timestamps. There is no tombstone, archive, event
copy, analytics copy, or automatic backfill in this slice.

## Store boundary

The control store adds only these methods:

- `upsertLead(lead, { expiresAt })`
- `getLead(id)`
- `listLeads({ status })`
- `purgeExpiredLeads({ now })`

The queue continues to own input normalization, ID generation, status
validation, summary projection, and retention calculation. The SQLite adapter
owns additive schema, row mapping, persistence, filtering, and deletion.
Without an injected store, the queue preserves its current in-memory behavior
for controlled-open and unit-test consumers.

## Schema safety

Initialization may create only:

- `platform_leads`;
- `platform_leads_status_created_idx`;
- `platform_leads_expires_at_idx`.

It uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. It does
not alter, delete, rename, truncate, or backfill any existing table. A synthetic
legacy fixture must prove its sentinel row is unchanged and that repeated
initialization is idempotent.

## Failure behavior

- Invalid Lead data remains `validation_error` without echoing private input.
- Missing or expired Leads remain `not_found` with the existing safe message.
- SQLite constraint failures remain sanitized through the existing store error
  mapping.
- A status update must not recreate an expired Lead.
- Store-backed restart must preserve unexpired Leads and status changes.

## Explicit non-goals

- No `platform_operations_events` table or event vocabulary.
- No generic operations-summary endpoint or Admin UI changes.
- No Access Request, Delivery, first-use, attribution, campaign, billing, CRM,
  warehouse, queue, Redis, or microservice work.
- No account linkage or lifecycle inference; Issue #438 remains the lifecycle
  owner and Issue #439 plus the existing attribution ledger remain the
  commercial-event owners.
- No production database access, deployment, provider mutation, or backup
  creation.

## Validation

Run focused Lead queue, control-store, route, and runtime-state tests; then run
`npm test`, `npm run project-state:check`, document-authority validation, and
`git diff --check origin/master...HEAD` on the exact branch head.
