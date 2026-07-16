# Lead Durability Schema Gate

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: source_only_lead_schema_gate
  superseded_by: null
  last_verified_at: 2026-07-16
  production_authority: false
```

> Status:
> - Risk: A
> - Execution authority: repository source and local synthetic SQLite only
> - Production/AWS/provider/runtime authority: none
> - GitHub lane: Issue #475; replacement for Draft PR #476

## Intent

Persist the existing Lead review queue across control-plane restarts without
creating the parallel operations event model proposed by Draft PR #476. This
gate covers one private control-plane table, its two indexes, the existing Lead
queue store port, and local synthetic validation.

It does not authorize production database initialization, deployment, provider
access, customer-data access, lifecycle inference, campaign automation, or a
new summary endpoint.

## Exact additive schema

Source initialization may create only:

- `platform_leads`;
- `platform_leads_status_created_idx`;
- `platform_leads_expires_at_idx`.

`platform_leads` contains the existing normalized Lead fields plus a private
retention deadline:

- `id`, `status`, `organization`, `email`, `direction`, `stage`, `message`, and
  `source`;
- `created_at`, `updated_at`, and `expires_at`.

Initialization uses only `CREATE TABLE IF NOT EXISTS` and
`CREATE INDEX IF NOT EXISTS`. This slice does not use `ALTER TABLE`, backfill,
rename, truncate, or delete against an existing business table. Repeated
initialization must be idempotent and must preserve legacy rows.

## Privacy, retention, and erasure

Lead organization, email, direction, stage, and message are private
control-plane data. The approved retention period is exactly 90 days from the
normalized `updatedAt` value. Each insert or status update stores
`expires_at = updatedAt + 90 days`.

The queue purges `expires_at <= now` before enqueue, list, protected read, and
status update. An expired Lead is not returned and uses the existing safe
`not_found` response. The queue also exposes an explicit purge operation for a
future operator-controlled maintenance cadence.

Deletion removes the whole Lead row. This slice creates no tombstone, archive,
event copy, analytics copy, or automatic backfill. Public submission responses
remain acceptance-only; protected list responses retain the current summary
shape and do not expose `message`.

Physical deletion occurs at the next queue interaction or explicit purge. A
future production gate must establish a purge cadence that meets the approved
deadline. A backup containing Lead rows must not outlive the same 90-day
boundary. After any restore, expired Lead rows must be purged before service
traffic resumes.

## Local synthetic dry-run

1. Create a synthetic legacy control database with a sentinel table and row.
2. Initialize the current control store twice.
3. Verify the sentinel table definition and row are unchanged.
4. Verify the exact Lead table and two approved indexes exist.
5. Insert a synthetic Lead, close the store, reopen it, and verify the Lead is
   preserved.
6. Update status and verify `createdAt` is unchanged while the retention
   deadline moves with `updatedAt`.
7. Advance synthetic time to the exact 90-day boundary and verify the Lead is
   deleted and returns `not_found`.
8. Restart runtime state against one synthetic control database and verify the
   protected queue restores the unexpired Lead.
9. Run focused tests, the full server suite, project-state validation, document
   authority validation, and diff checking.

## Stop conditions

Stop without publication or promotion if any of the following occurs:

- an existing table definition or row changes during initialization;
- any schema object beyond the approved Lead table and indexes is required;
- restart loses an unexpired Lead or recreates an expired Lead;
- status update changes the original creation timestamp;
- an expired Lead remains visible through a queue or HTTP response;
- public or protected HTTP response shapes change;
- implementation requires an operations event table, summary endpoint,
  lifecycle inference, backfill, destructive SQL, or external dependency;
- focused or full validation regresses.

## Future production gate

This source gate grants no production authority. A future production proposal
must include all of the following for the exact release artifact:

1. fresh read-only inventory of the database path, owner, service, free space,
   current schema, and existing backup mechanism;
2. explicit operator approval tied to the exact target and mutation boundary;
3. immutable pre-change backup plus verified restore procedure;
4. a Lead-aware backup expiry policy no longer than 90 days;
5. a purge cadence and post-restore purge that meet the approved retention
   deadline;
6. staging or clean synthetic validation, schema readback, protected route
   validation, and rollback readiness;
7. a Deploy Note if production initialization or deployment occurs.

No raw SQLite rows, emails, messages, credentials, tokens, subscription URLs,
or customer data may appear in gate evidence.

## Rollback boundary

Source rollback reverts the feature commit and restores the previous
application artifact. Before any future production initialization, preserve the
approved backup and restore procedure.

Automatic `DROP TABLE`, destructive rollback, or retention bypass is forbidden.
If a production-created Lead table contains rows, schema removal or restoration
requires a separate Risk A approval and a verified privacy/retention decision.

## Excluded ownership

- Issue #438 remains the owner of account/access/delivery lifecycle semantics.
- Issue #439 and the existing attribution ledger remain the owners of
  commercial and promotion event semantics.
- This gate does not create `platform_operations_events`, an operations summary
  API, Admin UI changes, CRM, payment, AppsFlyer, warehouse, Redis, queue, or
  microservice behavior.
