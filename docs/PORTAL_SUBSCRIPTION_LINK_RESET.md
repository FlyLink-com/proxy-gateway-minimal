# Portal subscription link reset

Last verified: 2026-10-09. Source implementation; not a production receipt.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_subscription_link_reset
  superseded_by: null
  last_verified_at: 2026-10-09
  production_authority: false
```

## Scope and intent

- Risk: A (download credentials and an explicit control-database schema addition).
- Expected PR count: one implementation PR, separate from third-party YAML distribution.
- Release units: `control-plane-app`, `portal-static`; frontend_surface: `portal`.
- identity_impact: false. Runtime principals, material bindings, protected usage maps,
  collector configuration and edge credentials are not changed by this operation.
- Source-only status: the implementation and synthetic tests do not approve a
  production migration, enablement, real-account reset, merge or deployment.

The existing `refreshSubscription` action renews edge credential material but
preserves the download artifact. The new `resetSubscriptionLink` operation rotates
the **download artifact** and updates the existing order's delivery URL. They are
not interchangeable operations.

The Portal confirmation explains that the old subscription link stops working,
the user must import the new link, and the plan, expiry and used traffic are
unchanged. Cancellation makes no reset request. A downloaded client configuration
is not remotely deleted by resetting a URL; this action does not revoke its edge
credentials. It also does not reset independent legacy tenant-token URLs.

An operation key (not the delivery URL) is retained in browser session storage
only after confirmation. An uncertain result can be retried after closing the
dialog or reloading in the same browser tab without issuing another rotation.
Unavailable browser storage is reported explicitly; in that case keep the page
open to retain its in-memory retry key.

This slice supports the existing legacy Portal access-request delivery path.
Wallet-first current-resource delivery and the independent data-pack draft retain
their own authorization paths; this endpoint must not bypass those model gates.
The separate mobile repository is not modified by this PR.

## Contract and resource preservation

`POST /api/portal/access-requests/reset-link` accepts exactly:

```json
{"requestRef":"synthetic_order","idempotencyKey":"synthetic-operation-01","confirmed":true}
```

The authenticated browser/header session supplies ownership. Query parameters,
body session/owner overrides, client-provided replacement URLs and missing explicit
confirmation are rejected. Cookie requests retain the existing origin/CSRF
checks. Success and error responses carry `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`; errors contain only classified codes.

Success returns the existing request summary with its new visible-once URL and
`subscription_link_reset` event. Ordinary material reissue must not be labelled as
old-link invalidation. Order reveal returns the updated URL after the dialog closes.
New reset operations have a five-minute cooldown; a retry of the same operation
does not rotate again or consume that cooldown.

Preserved objects include account, tenant, entitlement, order, expiry, quota,
usage samples, edge credential references and runtime materials. Only download
artifact status/identity, delivery fields and the reset journal change. The
original issued binding is retained. Renewal and fulfillment recovery recognize
the current artifact only through a completed, owner/request/tenant-bound reset
chain from that original binding; prepared or broken chains are not evidence.

## Cross-database recovery

The dedicated `platform_portal_subscription_link_resets` journal holds a prepared
operation before the runtime database can rotate the artifact. A control-database
IMMEDIATE transaction checks order ownership, source fields and validity, holds
the order write lock across the runtime commit, then updates only delivery fields
and marks the journal completed in the same control transaction.

If runtime commit succeeds but the process dies before control commit, the
prepared row survives. Retrying the same owner/order/idempotency operation uses the
same replacement artifact and URL. It never creates a second replacement or
reactivates revoked/expired resources. A different pending operation or changed
source fails closed. Do not delete a prepared journal row to force another reset.

The journal contains protected delivery material, just as the existing delivery
record does. It is not an audit export. Do not print rows, URLs, secrets or backups;
preserve the control database's existing restricted ownership/permissions.

## Explicit installation and production checklist

The feature defaults off: `USER_PORTAL_SUBSCRIPTION_LINK_RESET_ENABLED` is absent
or false. Normal startup never creates the reset table. Enabling the feature with
missing/incompatible schema fails startup before accepting reset operations.

The separate schema helper requires an explicit existing database path. Its
default mode checks only; `--apply` explicitly installs only the reset journal:

```text
node scripts/prepare-portal-subscription-link-reset-schema.mjs --db <approved-control-db>
node scripts/prepare-portal-subscription-link-reset-schema.mjs --db <approved-control-db> --apply
```

These commands are documentation, not permission to execute on production.

Before production execution:

1. Bind the exact reviewed source/artifacts, active backend and Portal targets,
   active schema and private database paths using limited read-only inventory.
2. Validate the explicit schema operation, old-schema/default-off behavior, reset,
   renewal, recovery and feature-off rollback in an owned synthetic environment.
3. Back up the two affected databases consistently and verify restoration offline.
   Bind short write coordination if needed; do not copy production data locally.
4. Obtain approval for the exact schema/backend/Portal promotion and verification.
5. Install the additive schema before enabling the backend feature. Enable the
   Portal only when its endpoint is available; do not show an active control ahead
   of the backend. Verify a specifically approved test account: cancel, reset,
   old artifact variants rejected, new render usable, resources/usage unchanged,
   reveal and subsequent renewal intact. No unapproved customer resets.
6. Append a Deploy Note with exact source, release units, target, backup and
   observed validation. Do not infer deployment from source tests or Vercel build.

## Rollback and stop conditions

Prefer disabling new resets and hiding the Portal action while retaining the
compatible delivery reader and renewal-chain support. Retain the additive journal
and artifact revocation history. Never roll back only one database, restore an old
URL as active, or replay usage/payments to undo a completed reset. A pre-migration
database restore is permissible only before any subsequent business mutations and
under a separate exact recovery approval. Otherwise use a forward fix that keeps
all committed usage and payment state.

Stop if ownership, expiry, current artifact, schema, pending recovery or linked
resources cannot be proven. An uncertain response is not proof that the old URL
still works. Runtime configuration rebuilds, protocol service restarts, historical
usage charging and third-party pool changes are out of scope.

## Validation index

- `subscription-link-reset-core.test.mjs`: strict source/replacement ownership,
  single active artifact, replay, revocation, expiry and URL canonicalization.
- `portal-subscription-link-reset-store.test.mjs`: explicit schema, cooldown,
  immutable resources, narrow delivery updates and completed-chain evidence.
- `portal-subscription-link-reset-durable.test.mjs`: real two-file SQLite process
  interruption and cross-connection write locking.
- `portal-subscription-link-reset-feature-off.test.mjs`: a separate Node process
  reopens the committed synthetic databases with reset disabled, keeps the new
  URL usable and the old URL revoked, and verifies order reveal plus prior
  fulfillment recovery, subsequent renewal and idempotent replay.
- `portal-subscription-link-reset-service.test.mjs`: resources and nonzero usage
  retained, uncertain completion retry, owner/confirmation checks and no migration.
- `portal-subscription-link-reset-state.test.mjs`: default-off and explicit
  startup prerequisites.
- `portal-subscription-link-reset-routes.test.mjs`: session/CSRF/body boundaries,
  privacy headers, classified errors and no raw parser errors.
- `portal-subscription-link-reset-e2e.test.mjs`: real route/core/store synthetic
  delivery/render/reveal integration (not a live proxy connectivity test).
- `platform-coin-commerce-subscription-fulfillment.test.mjs`: renewal and retry
  after multiple completed rotations without changing original issued bindings.
- `admin/src/test/user-portal.test.tsx`: confirmation/cancellation, double click,
  uncertain retry, updated delivery and truthful reissue/reset messaging.

Run the source validation environment check, full `npm test`, Admin tests/build,
Portal web build/verifier, frontend boundary check, documentation authority check
and diff checks before considering Source/Merge readiness. Record actual counts
and independent review separately; this document alone does not assert they passed.

## Source validation observed on 2026-10-09

- New reset core/store/durable/service/state/route/E2E plus full Commerce
  fulfillment regression: 134 passed.
- Final Admin test run: 82 files, 1300 passed. Admin build, desktop Portal build
  and Portal verifier passed. Frontend boundary and TypeScript checks passed.
- Source environment preflight, documentation authority strict check and diff
  checks passed. Builds retain the existing large-chunk warning.
- Full `npm test` was run but **did not pass**: 11 existing Windows/CRLF/platform
  failures were reproduced by targeted runs against an unchanged baseline tree.
  They cover artifact workflow LF matching (2), project contract/path fixtures
  (3), cross-drive release identity (1), native gate workflow LF matching (1),
  source closure LF markers (2), and platform-specific environment fixtures (2).
  The relevant tests/modules/workflows were unchanged by this PR. Baseline
  commit `40c7cc2390923a8c5904f349962ea1a85cdab6b6` and the existing baseline
  validation worktree both had tree `1625bd90c1ebe229d90d87f00a72caf6fe292c27`.
  This is a recorded full-suite failure, not a waiver or a green CI claim.
- Independent review, exact-head hosted CI, signed-in browser/device acceptance,
  production schema installation and deployment are not completed by this record.

## Supplemental feature-off rollback validation, 2026-10-09

`node --test server/tests/portal-subscription-link-reset-feature-off.test.mjs`
passed one new isolated regression after the #763 lockfile integration. It uses
two temporary synthetic SQLite files and an actual second Node process, not a
same-process service replacement. The parent completes synthetic fulfillment and
link reset, closes both databases, and the child reopens the committed state with
`subscriptionLinkResetEnabled: false`.

The child confirms all six old artifact URL forms remain HTTP 410, all six new
forms render HTTP 200, order reveal retains the new URL, and new/repeated reset
requests return non-cacheable 503. The original completed fulfillment command is
recoverable without an extra extension. A distinct synthetic renewal extends the
same resource exactly once; replay does not extend it again. The reset journal,
original issued-binding reference, account, nonzero usage samples/rollup and the
two-artifact active/rotated state are retained. The child emits aggregate test
results only; requests use loopback, never the synthetic node addresses.

This verifies disabling new resets while retaining compatible reader and renewal
code. It does not validate restoring an older application binary, reversing the
schema, production backup restoration, real payment capture or client-device
acceptance. The first fixture run correctly excluded a usage sample preceding
the paid billing cycle; its synthetic initial-fulfillment time was corrected
before the passing run. No product code or production state changed in this
supplemental validation.
