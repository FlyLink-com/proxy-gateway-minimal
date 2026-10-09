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
- identity_impact: true. The collector's legacy-primary resource resolution now
  recognizes strictly completed reset chains. Runtime principals, material
  bindings, protected usage maps and edge credentials remain unchanged.
- The independent collector is part of the `control-plane-app` release scope;
  its exact source closure and target must be recorded separately from the app.
  Production Identity Gate before/after and retention evidence remain pending.
- Source-only status: the implementation and synthetic tests do not approve a
  production migration, enablement, real-account reset, merge or deployment.

The existing `refreshSubscription` action renews edge credential material but
preserves the download artifact. The new `resetSubscriptionLink` operation rotates
the **download artifact** and updates the existing order's delivery URL. They are
not interchangeable operations.

### Legacy refresh retirement (source-only, 2026-10-09)

The public `POST /api/portal/access-requests/refresh` route is retired. After
the existing Portal session/CSRF checks, it returns HTTP 410 with only
`{"error":"subscription_refresh_retired"}`. It does not read an order, call
`refreshSubscription`, rotate runtime credentials, change material, advance a
checkpoint or invoke another lifecycle method. Missing order/service, caller
flags, another owner's reference and a reset-shaped body cannot opt back in.
Anonymous/invalid sessions still fail authentication; console auth is not a
Portal session. Malformed JSON and early denials remain non-cacheable and do
not expose parser details. There is no redirect, retry hint or automatic
fallback to reset-link: consent and a new idempotency key cannot be invented.

Old desktop/mobile/HTTP clients using refresh must migrate to the separately
confirmed reset-link flow. Existing downloads, order reveal, disable, renewal
and the new reset route are not removed. The separate mobile repository is not
changed by this patch. An old client can receive an unsupported-action error;
it must not claim that credentials or links changed.

This is an HTTP entry-point containment fix, **not automatic metering repair**.
The internal credential rotation service remains for existing domain tests and
future controlled lifecycle integration. Current repository call-site inventory
found its only non-test `refreshSubscription` caller in this HTTP route, now
removed. Future internal callers, operator scripts or direct material changes
are not prevented by HTTP retirement. Legitimate material rotation still needs
an independently verified metering handoff; ordinary collection must continue
to reject unexplained material changes. Two changed entries per protocol do not
prove the same users or operation caused previous incidents.

#### Validation / production checklist

- Risk A envelope, minimal backend source patch; `release_unit: control-plane-app`,
  `identity_impact: false` for retirement itself. No frontend, schema, collector,
  runtime material, identity-map or accounting modifications. Existing #764
  identity-impact gates remain applicable when deploying that separate change.
- Synthetic tests: valid header/cookie sessions, missing/invalid session, console
  bearer, CSRF, force flags, absent service, path variants and malformed JSON;
  all denials execute zero lifecycle calls. Existing reset-to-collection and
  cross-database reset tests must remain passing. No production test credentials.
- Before promotion, bind the exact current `server/app.mjs` and
  `server/routes/user-portal.mjs` plus intended backend composition, preserve
  fresh rollback references, validate an isolated candidate and obtain approval
  for the bounded app restart. Do not reuse the previous #764 artifact hash after
  adding these files or deploy whole master over the mixed production release.
- Verify retired response with an authorized session and no service effects;
  check healthy existing download/reveal and independent reset acceptance.
  Observe natural metering only after its separately approved recovery. This
  patch cannot turn failed/inactive collection into a recovery receipt.
- Rollback must retain retirement (forward-correct the guard or an explicitly
  approved equivalent restriction). Blindly reverting to the old route reopens
  the known rotation path. Never restore a database/checkpoint to roll back this
  stateless route patch, resurrect reset links or charge unknown historical use.

Source implementation and synthetic validation are not a production Deploy Note.

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

The public browser session label is the signed-in email. The loaded access-record
owner is the account id, so those two values are not the same identifier. A
completed reset is applied on the current page when the response has a visible
URL, the same request, a `subscription_link_reset` event, and an owner that
matches the loaded record or the session label. The previous link is replaced
immediately. A slower read that started earlier cannot write over that result.
The read-only `重新获取` action calls order reveal and never calls reset. Its
failure stays distinct from an unconfirmed reset and keeps the last confirmed
link. This display sync does not change authorization, idempotency, cooldown,
resource inheritance, or the reset route.

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

The full-metering inspector uses the same completed-chain proof for a legacy
primary binding, including a retained primary superseded by durable credentials.
Exact original-artifact matches still work without the opt-in reset schema.
Mismatches without a valid chain fail closed; tenant, owner, request, material and
uniqueness checks are not relaxed. The separately approved legacy VLESS recovery
plan retains its exact-reference contract. Schema metadata accepts exact SQLite
flags in both numeric modes without changing the caller's SafeIntegers policy.

The stable full-metering identity excludes the download artifact. A link reset
alone must continue ordinary collection without rebuilding a checkpoint, starting
a zero baseline, changing entitlement/usage or retrospectively charging traffic.
This compatibility fix is not a diagnosis or repair of an existing production
`full_metering_binding_changed` failure.

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

1. Bind the exact reviewed source/artifacts, active backend, independent collector
   and Portal targets, active schema and private database paths using limited
   read-only inventory. Bind the collector's actual runtime dependency closure;
   an application upgrade alone does not update an independently installed reader.
2. Validate the explicit schema operation, old-schema/default-off behavior, reset,
   renewal, recovery and feature-off rollback in an owned synthetic environment.
3. Back up the two affected databases consistently and verify restoration offline.
   Bind short write coordination if needed; do not copy production data locally.
4. Obtain approval for the exact collector/schema/backend/Portal promotion and
   verification. This does not authorize an unrelated metering restart or recovery.
5. Install and verify the compatible independent collector first, including
   old-schema behavior. Install the additive schema, then the backend with the
   feature initially off. Enable the backend feature before the Portal control.
   Verify a specifically approved test account: cancel, reset, old artifact
   variants rejected, new render usable, resources/usage unchanged, reveal and
   subsequent renewal intact. Verify unchanged stable identity, aggregate
   retention state and continuous natural metering. No unapproved customer resets.
6. Append a Deploy Note with exact source, release units, target, backup and
   observed validation, aggregate Identity Gate before/after and retention state.
   Do not infer deployment from source tests or Vercel build.

For the previously inventoried #759 collector closure, the minimal compatible
overlay replaces `scripts/lib/traffic-vless-recovery-baseline.mjs` and adds
`server/services/platform/portal-subscription-link-reset-store.mjs`. The latter
imports only `node:crypto`; no new package or native ABI is required. The recorded
41-file closure becomes 42 files if all other files are unchanged. Rebind the
actual final hashes and test imports plus synthetic collection from the isolated
closure before promotion; do not substitute a Windows SQLite native module into
the Linux deployment. These counts describe the recorded source baseline, not a
fresh production inventory or an approved executable artifact.

## Rollback and stop conditions

Prefer disabling new resets and hiding the Portal action while retaining the
compatible delivery reader, renewal-chain support and independent collector.
After a completed reset, reverting to the old collector is not a safe feature-off
rollback. Retain the additive journal
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
- `full-metering-subscription-link-reset.test.mjs`: actual reset and read-only
  inspector, ordinary collector/sample-writer continuity across two resets for
  durable, legacy-primary and retained-primary bindings; invalid chains fail
  before statistics, checkpoint or accounting changes. Sources are synthetic,
  not real protocol processes or production traffic.
- `admin/src/test/user-portal.test.tsx`: confirmation/cancellation, double click,
  uncertain retry, updated delivery and truthful reissue/reset messaging.
  Synthetic fixtures also cover session-label versus record-owner display,
  stale reads, and read-only reread failure.

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

## Collector compatibility regression, 2026-10-09

The real synthetic reset plus read-only inspector reproduced
`baseline_binding_invalid` for legacy-primary and retained-primary bindings before
the fix (18 passed, 2 failed). The inspector now accepts only verified completed
reset lineage in the full-metering lane; the old VLESS recovery contract is not
relaxed. The schema check also handles exact `1n` flags from SafeIntegers readers.

After the fix, `node --test server/tests/full-metering-subscription-link-reset.test.mjs`
passed 22/22, including two actual resets followed by ordinary collector/sample
writer calls, invalid-lineage stop conditions, unchanged old VLESS behavior and
unchanged caller integer mode. A separate run of reset-store, durable recovery,
feature-off and Commerce fulfillment tests passed 111/111. The affected 12-file
collector/reset regression run passed 195/195; these runs overlap and must not be
added into a unique-test total. Documentation authority validation covered 416
documents; diff checks passed.

These are local synthetic source results. This increment has not completed
independent review, final-source Linux validation, isolated deployment-closure
validation or production promotion. No production timer, checkpoint, database or
accounting state was changed by these tests, and production metering recovery is
not established by them.
