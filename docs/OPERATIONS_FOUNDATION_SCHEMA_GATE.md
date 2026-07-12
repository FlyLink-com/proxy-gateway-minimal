# Operations Foundation Schema Gate

Last updated: 2026-07-12, Asia/Shanghai.

> Status:
> - Type: Risk A source and local-validation gate
> - Execution authority: Local synthetic SQLite fixtures only
> - Production authority: None
> - Deployment authority: None

GitHub index card: Issue #475.

## Intent

Provide the smallest durable data boundary needed for an internal operations
workbench: Lead review, linked lifecycle events, first-use evidence, and safe
summary counts. This gate does not create a CRM, data warehouse, payment path,
live attribution provider, or automatic campaign-budget controller.

## Exact Schema Boundary

The source change may create only:

- `platform_leads` and `platform_leads_status_created_idx`;
- `platform_operations_events` and its type/time, Lead, and Account indexes.

Initialization uses `CREATE TABLE IF NOT EXISTS` and
`CREATE INDEX IF NOT EXISTS`. It must not alter, delete, rename, truncate, or
backfill an existing business table. Existing account, entitlement, request,
delivery, usage, quota, credential, and audit rows are outside this gate.

## Data Boundary

The Lead table is private control-plane data. Admin Lead APIs retain their
existing protected behavior. Operations events store only safe references,
allowlisted event types, timestamps, idempotency keys, and privacy-checked
metadata. Summary output contains counts and missing-link counts only.

The event layer must not store or return email addresses, messages,
subscription URLs, credentials, raw provider payloads, raw runtime config,
raw SQLite rows, or customer-private values.

## Local Dry-run Checklist

1. Create a synthetic legacy control database without the two new tables.
2. Preserve a sentinel row in an existing table.
3. Initialize the current control store.
4. Verify the sentinel is unchanged.
5. Verify exactly the additive operations tables and indexes are available.
6. Initialize the store again and verify no schema or event duplication.
7. Close and reopen the database and verify Lead state remains available.
8. Run focused lifecycle and data-quality tests before the full suite.

## Stop Conditions

Stop without promotion if any of the following occurs:

- an existing table or row changes during initialization;
- a table or index name conflicts with an unexpected existing object;
- restart loses Lead data or duplicates events;
- unsafe metadata is accepted;
- existing Portal, traffic-accounting, Admin, or state tests regress;
- implementation requires data backfill, `ALTER TABLE`, or destructive SQL.

## Future Production Gate

This document does not authorize production execution. A future deployment
requires a fresh read-only inventory, exact database path and service owner,
an immutable backup with restore verification, available disk-space check,
service stop/restart boundaries if needed, schema readback, protected endpoint
validation, and explicit operator approval tied to the exact release artifact.

## Rollback

Before any future production initialization, preserve an immutable database
backup and its restore procedure. Source rollback reverts the feature PR and
restores the previous application artifact. Newly created tables are retained
by default; automatic `DROP TABLE` is forbidden because the tables may contain
new operational records. Destructive schema removal requires a separate Risk A
approval and verified data-retention decision.
