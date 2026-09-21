# Portal current-resource integration repair

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_current_resource_repair
  superseded_by: null
  last_verified_at: 2026-09-20
  production_authority: false
```

Date: 2026-09-20. Risk: A (backend production promotion). One implementation PR.
Release unit: `control-plane-app`. Identity impact: false.
Production state: not deployed.

## Intent and scope

The mobile Portal calls `/api/portal/resources/current/overview`. The deployed
state composition only constructs its wallet-first reader inside the explicitly
disabled deferred runtime. This leaves an authenticated production request with
no reader and a 503, even when its account has an existing issued subscription.

Add an authenticated current-resource facade outside that dormant branch. Read
the account's persisted commercial model: legacy accounts use their current
entitlement, issued binding and owned Portal access request; wallet-first
accounts retain the existing isolated projection/delivery path. Do not turn on
the deferred runtime or reinterpret a wallet-first account as legacy.

The legacy overview uses the current binding's accounting cycle and usage
samples. No sample means pending, not zero; old samples mean stale. No current
entitlement means none; an ambiguous or inconsistent current chain requires
reconciliation. The public DTO contains neither internal references nor a
subscription URL. The mobile parser needs a paired compatibility update: legacy
quota zero retains `totalBytes: 0` and `monthlyTrafficGb: 0`, with null remaining
bytes and an unset-quota label, while keeping actual measured usage. Positive
byte quotas may be fractional GiB. This does not declare unlimited service or
change any enforcement/charging rule. All other DTO fields remain unchanged.

Legacy setup re-reads the already-issued, account-owned subscription through
the existing reveal service. It never refreshes credentials or issues new
resources. Its session/resource-bound acknowledgement only confirms the UI
import step; it does not create a new business-delivery or settlement record.
Repeating this read/ack is safe and replacement or expiry invalidates the old
handoff. Authentication, no-query selection and no-store response headers stay
in place.

Before historical PR #419, refreshing could rotate a subscription artifact
without updating the issued-link hash. Only that mismatch may be resolved by
read-only runtime evidence: globally unique issued tenant ownership, exact
active/expiring tenant and expiry, a same-tenant rotated original, and the unique
active artifact matching the current Portal request. Missing/ambiguous proof
remains reconciliation_required. This proves current ownership, not a complete
historical replacement chain; no record is repaired or rewritten. The opaque
resource reference includes the current artifact so old UI handoffs expire.

Excluded: schema changes, new identities, subscription rotation, commercial
rules, balances/rights adjustments, main collector activation and DNS. The
paired mobile change is limited to quota parsing/presentation; its normal
static promotion must retain API, referral and payment routes unchanged.

## Validation and promotion checklist

- [x] SQLite synthetic tests: account/model ownership, current vs expired/future
  entitlement, ambiguous/mismatched bindings, pending/zero/stale usage.
- [x] Real state composition with deferred runtime disabled plus authenticated
  HTTP overview, setup and acknowledgement; no resource or business writes.
- [ ] Same mobile DTO/parser compatibility and source regression tests.
- [ ] Independent review, exact-head CI and source/dependency artifact lineage.
- [ ] Fresh aggregate-only production inventory proves the legacy data shape
  is compatible; no customer rows, credentials or subscription material exported.
- [ ] New immutable candidate and execution record, isolated validation, fresh
  current/PID/collector readback, source/dependency/receipt hash binding.
- [ ] Preserve stopped main/legacy collectors; pause/resume only the originally
  running writer(s), take a new database snapshot before switching backend.
- [ ] Roll back to the freshly verified previous release if candidate startup,
  health, schema or current-resource acceptance fails. Do not replay a consumed
  execution package. Static Portal deployment remains unchanged.
- [ ] Check aggregate current-resource outcomes and the authenticated endpoint,
  record exact production verification boundaries in the PR Deploy Note.

Source evidence: 40 focused store/facade cases and 11 real-composition/existing
route cases passed. The initial full Windows suite was 5,134 tests: 4,998 passed,
80 failed and 56 skipped; one new documentation metadata failure was fixed and
rechecked, the other 79 match the prior source environment's non-green baseline.
This is not a Linux/production pass. Final exact-head CI is still required.

User authorized repair and update in this task. This source document records
scope, not authority to bypass the existing exact production package gates.
