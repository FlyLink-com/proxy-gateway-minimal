# Portal Wallet, Orders, And Profile Read-Only Integration Design

## Status

- Risk: B
- Process: two stacked source-only PRs with red-green TDD; production identity,
  migration, activation, and deployment remain separate gates
- Expected PR count: 2 stacked B PRs after the base branch is reconciled
- Frontend surface: `portal`
- Release units: `control-plane-app`, then `portal-static`
- Identity impact: false
- Production/AWS impact: none
- Design state: approved and implemented as a source reference
- Implementation state: implemented / source-only / not_deployed
- Implementation base:
  `c3d92ed3c4691f2512e80da3dffcab17e027b928`
- Implementation base state: local source-only checkpoint, not deployed

This design continues the existing Portal Commerce work. It does not authorize
schema changes, provider calls, balance mutations, recharge-order creation,
wallet settlement, fulfillment, GitHub writes, artifact publication, or
production deployment.

## Production Surface Identity Record

```yaml
frontend_surface: portal
identity_state: verified_at_2026-07-26
current_live_reverified: false
deployment_or_artifact:
  serving_tree_observation:
    observed_at: 2026-07-26
    comparison: documented_9_of_9_path_and_sha256_match
  github_artifact:
    workflow: Release Artifact
    run_id: 30192261447
    job_id: 89767530524
    artifact_id: 8628968166
    artifact_name: portal-static-cb69e18071c1
    artifact_file: globalcircle-portal-cb69e18071c1.zip
    artifact_file_sha256: 6aa3316ff5b6446f6392703d89b3cc2c195a63b4a52512f407cc22840ff055fb
    artifact_digest: sha256:ef3554b6244af8f45fc1d6ee0a5c2478bea3c32c1168c3ce8e21165da50366a4
    build_result: success
    verified_file_count: 9
source_commit: cb69e18071c108de13e6cdc63037f2d251873298
entry: admin/portal/index.html
bootstrap: admin/src/portal-main.tsx
shell: admin/src/features/user-portal/user-portal-page.tsx
stylesheet: admin/src/portal-static-preserve.css
output: admin/dist-portal
forbidden_inputs:
  - admin/index.html
  - admin/src/main.tsx
  - admin/src/App.tsx
  - PortalPreviewRoute
  - local or mock Portal client
  - fixture or demo account as production data
  - admin/src/styles.css
  - admin/dist
  - admin/dist-site
  - PR 526 CommerceWorkspace or parallel navigation
```

The artifact-to-source chain was independently read back from GitHub in this
audit. The 9/9 production serving-tree comparison is a dated 2026-07-26
execution record; it was not repeated against the live host in this audit.
`docs/CURRENT_RELEASE_STATE.md` still labels `portal-static` as
`deployed_unreconciled`, but its evidence cutoff predates that dated record.

This is sufficient to continue B-grade source-only integration in the
recorded Portal shell. It is not proof that the current live files still match,
and it does not authorize static publication or production switching. Those
actions require an independent current-live Risk A gate.

Admin remains `unknown` and is outside this work.

## Problem Statement

At implementation base
`c3d92ed3c4691f2512e80da3dffcab17e027b928`, the Portal checkpoint had four
gaps:

1. The Wallet view is mounted in the real Portal shell, but its balances are
   `--`, its activity area has no data, and recharge remains disabled.
2. Existing order history is incorrectly rendered inside
   `个人与安全 / Profile and security`.
3. Coins consumption orders support create, detail, and cancel, but not an
   account-owned history list.
4. Coins recharge orders have no durable Payment Store, schema, list contract,
   or Portal route.

The implementation must expose only data that the server can prove for the
authenticated Portal account. Missing domains remain visibly unavailable; they
must not be converted into synthetic zero balances, empty order lists, fixture
records, or enabled actions.

## Options Considered

### Option A: One Shell With Domain-Separated Read Adapters

Keep `UserPortalPage` as the only shell and navigation owner. Add an Orders
view, keep Wallet reachable only from the top Coins entry, and introduce
separate Wallet and Commerce-order read contracts. Each domain owns its own
`loading`, `ready`, `empty`, `unavailable`, and `error` state.

Benefits:

- preserves the repository-recorded candidate Portal chain and current shell;
- keeps Wallet, Commerce orders, recharge orders, and legacy orders separate;
- can expose real Wallet and consumption-order data without a schema change;
- creates module boundaries that can later be moved or independently refined.

Cost:

- the recharge-order tab must honestly remain unavailable in this stage;
- the first version of “All orders” is grouped by domain rather than pretending
  to offer one globally sorted cross-domain feed.

### Option B: UI-Only Rearrangement

Add the Orders navigation item, move the existing order component out of
Profile, and leave Wallet and both Coins order domains unavailable.

This is the smallest change, but it does not satisfy the requested Wallet and
Coins-consumption read integration.

### Option C: Unified Orders And Wallet Aggregator First

Build one backend aggregation API for Wallet, legacy orders, Coins consumption
orders, and Coins recharge orders before changing the UI.

This would provide the cleanest global sorting and pagination, but the recharge
domain has no durable source. Implementing it now would expand the task into a
Payment Store and schema migration, which is a separate Risk A gate.

## Decision

Use Option A.

The work is divided into four testable slices and two release-unit review
units:

1. Orders navigation and Profile separation.
2. Wallet summary and safe ledger reads.
3. Coins consumption-order list and details.
4. Explicit unavailable state for Coins recharge orders.

The Wallet and order server GET contracts form the first
`control-plane-app` PR. The Portal clients, IA, and panels form a
`portal-static` PR stacked on the first. They are kept separate so a static
frontend release unit never silently carries a control-plane application
change.

No slice enables a recharge, payment-provider, balance-adjustment, or
fulfillment action.

## Information Architecture

### Existing Shell

There remains exactly one authenticated Portal shell:

```text
admin/portal/index.html
  -> admin/src/portal-main.tsx
  -> UserPortalPage
```

The desktop navigation order becomes:

```text
开始使用
概览
用量
商城
订单
推荐奖励
个人中心
支持
```

Rules:

- `订单` is one first-level navigation item.
- Wallet is not duplicated in the left navigation. The top Coins balance entry
  remains its single entry point.
- Coins payment remains a Marketplace checkout step, not a global navigation
  item.
- No second shell, Commerce workspace, Payment Logs view, partner console, or
  Admin navigation is added.

### Mobile Deferred

Mobile navigation, breakpoints, responsive layout, and mobile interaction
validation are explicitly outside the `portal-static` B PR.

The Orders item is still added to the existing shared navigation source, but
this PR does not introduce mobile-only DOM, conditional navigation, new
breakpoint rules, horizontal scrolling, or another responsive abstraction.
Existing mobile-specific CSS remains unchanged. However, the shared navigation
DOM and new base component styles also run at mobile widths, so mobile behavior
is affected but intentionally unverified. The handoff must not claim mobile
completion or mobile production readiness.

Mobile layout and browser QA require a later bounded B task before production
promotion. Any mobile issue observed during this source work is recorded for
that task rather than repaired opportunistically here.

### Orders

The Orders view has four filters:

```text
全部
Coins 消费订单
Coins 充值订单
历史订单
```

`全部` initially renders domain sections. It does not merge client-side rows
into a fake globally sorted list.

- Coins consumption orders: real account-owned list from the Commerce Store.
- Coins recharge orders: `unavailable` with an accurate explanation until the
  durable recharge-order source passes its own gate.
- Historical orders: reuse the existing subscription and legacy payment-order
  presentation. Existing frontend-only or externally supplied legacy data must
  not be described as a newly verified backend history source.

The visible term is always `Coins 消费订单`, not `Coins 交易订单`.

Wallet ledger entries are not orders. An entry may link to an order through a
safe related-order reference, but neither domain substitutes for the other.

### Personal Center

Rename the first-level label to `个人中心 / Personal center`.

The first-level view owns two independently testable internal subviews:

- profile information, which is the default;
- security settings, reached through an internal tab/control.

The two modules are not rendered as one combined profile form. They remain
inside the same first-level Portal view for this stage, so Security does not
become a second shell or a new first-level navigation item. Order tables,
order filters, payment details, and purchase entry points are removed from
Personal Center.

Existing authenticator, passkey, forced-security-setup, and session controls
retain their behavior. Forced security setup remains a shell-level gate, not a
profile subview. The change establishes a component boundary for future
profile editing; it does not add an editable profile API.

## Read Contracts

### Wallet Summary

Add a Wallet-specific optional client to `UserPortalClient`; do not place
Wallet reads behind the Commerce feature switch.

```text
GET /api/portal/coins/wallet
```

The server derives `accountId` only from `X-Portal-Session`. The client never
sends an account identifier.

The safe response contains:

- wallet state: `not_created`, `active`, `frozen`, or `closed`;
- available `paid_coins`, `bonus_coins`, and `reward_coins`;
- aggregate spendable, held, and pending units;
- the Wallet version suitable for stale-response protection.

The current store does not provide held and pending totals per coin type.
Therefore the UI must not label aggregate held/pending totals as
reward-specific states.

A server-confirmed `not_created` wallet may display a real zero with a
“wallet not created” state. Network, parser, disabled-feature, or server errors
continue to display unavailable values, never a synthetic zero.

### Wallet Ledger

```text
GET /api/portal/coins/wallet/ledger
  ?limit=
  &afterOccurredAt=
  &afterEntryRef=
```

The Store's existing bounded descending cursor is reused. The Portal response
is a new safe projection and must not return internal wallet, lot, actor,
source, idempotency, or request-digest fields.

The projected entry contains only reviewed display data:

- safe entry reference;
- a strict state-transition category from:
  `credit`, `pending_to_available`, `available_to_held`,
  `held_to_available`, `held_to_consumed`, `held_to_expired`, or
  `available_to_expired`;
- coin type resolved server-side;
- affected `amountUnits`;
- `availableDeltaUnits`, `pendingDeltaUnits`, and `heldDeltaUnits`, derived
  server-side for transitions that preserve the source bucket;
- `totalDeltaUnits`, derived server-side for every reviewed category;
- optional safe related-order reference;
- occurrence timestamp.

The Store query resolves coin type with the ledger row in one bounded query.
It must not perform one lot lookup per entry or expose `lotRef`. Unknown wallet
states, coin types, or ledger categories fail closed in both route projection
and client parser.

The existing ledger records `credit` without persisting whether that credit
entered the available or pending bucket. A later confirmation may also change
the current lot state, so that historical bucket cannot be reconstructed from
the joined lot. For `credit`, all three bucket deltas are therefore `null` and
only `totalDeltaUnits = amountUnits` is authoritative. The UI labels it as an
overall credit and does not invent an available/pending split. The other six
transition categories return numeric bucket deltas and a numeric total delta.
Persisting credit availability for historical reconstruction would require a
separate schema migration and Risk A gate.

Wallet and ledger routes are gated by
`USER_PORTAL_ROUTES_ENABLED + COINS_WALLET_ENABLED`. They do not create a
Wallet, Quote, order, or ledger entry.

The route error contract is exact:

```text
wallet_request_invalid  -> 400, retryable=false
wallet_session_invalid  -> 401, retryable=false
wallet_unavailable      -> 503, retryable=true
```

The TypeScript client rejects unknown error codes, retryability mismatches,
extra fields, and malformed bodies. A current-generation
`wallet_session_invalid` result returns through the existing Portal logout/auth
journey; an older in-flight result cannot invalidate a newer session.

When Wallet is disabled, its protected namespace falls through to the existing
console-auth boundary. The HTTP Wallet client recognizes only that boundary's
exact `401 + {"error":"Unauthorized"}` response as
`wallet_unavailable`; every variation remains a request failure. A mounted
Wallet route never uses that fallback for an invalid Portal session, so the
two cases stay distinguishable without adding a capability endpoint.

When the authoritative Wallet state is `not_created`, the ledger response is a
successful empty page and remains zero-write.

### Coins Consumption Orders

Reuse the existing safe `PortalCoinOrder` detail DTO and add:

```text
store.listOrders({
  accountId,
  limit,
  afterCreatedAt?,
  afterOrderRef?
})

GET /api/portal/commerce/orders
  ?limit=
  &afterCreatedAt=
  &afterOrderRef=
```

The collection GET shares the existing path with the create POST but performs
no write. It is gated by the existing Portal and Commerce feature switches.

Requirements:

- account ownership is derived from the Portal session;
- results are bounded and deterministically ordered by
  `createdAt DESC, orderRef DESC`;
- the client uses a strict parser and rejects unknown or malformed states;
- cross-account detail access remains not-found;
- no new index, table, or column is added in this PR.

The Orders client keeps the existing structured Commerce error contract.
Current-generation `commerce_session_invalid` returns through the Portal's
existing logout/auth journey. For the new collection GET only, an exact
`401 + {"error":"Unauthorized"}` console-auth fallback is interpreted as
`commerce_unavailable`, covering a disabled Commerce route without weakening
parsing for catalog, checkout, detail, create, or cancel.

If later scale requires an `account_id + created_at + order_ref` index, that
migration is a separate Risk A task.

### Coins Recharge Orders

No read contract is invented in this PR.

The current source has no durable Coins recharge-order table, Payment Store,
callback inbox, or recharge list/detail route. Wallet ledger rows cannot
reconstruct provider currency, quoted amount, provider state, refunds, or
chargebacks.

This conclusion is bound to implementation base
`c3d92ed3c4691f2512e80da3dffcab17e027b928`; it must be re-inventoried if the
base stack is reconciled onto newer source.

The Orders UI therefore renders an explicit unavailable state:

```text
充值订单数据源尚未接入
```

Real recharge-order list/detail work begins only after a separate Risk A design
and approval for the Payment Store/schema, callbacks, reconciliation, wallet
credit, refund, and chargeback lifecycle.

## Component Boundaries

Keep shell state and view routing in:

```text
admin/src/features/user-portal/user-portal-page.tsx
```

Preferred domain modules:

```text
admin/src/features/user-portal/wallet/
  api-contract.ts
  wallet-client.ts
  portal-wallet-panel.tsx

admin/src/features/user-portal/orders/
  portal-orders-panel.tsx

admin/src/features/user-portal/profile/
  portal-personal-center-panel.tsx
  portal-profile-panel.tsx
  portal-security-panel.tsx
```

Commerce order DTOs and reads remain under the existing `commerce/` module.
Legacy `SubscriptionManager` behavior may first be extracted without changing
its semantics. Component extraction follows passing behavior tests and must
not become a broad visual rewrite.

Styles stay under:

```text
admin/src/portal-static-preserve.css
admin/src/styles/portal-static-preserve/
```

No component imports `admin/src/styles.css`.

## State And Error Handling

- Every read domain has independent `loading`, `ready`, `empty`,
  `unavailable`, and `error` states.
- `empty` is used only after a successful authoritative response.
- A disabled feature or missing runtime capability is `unavailable`, not
  `empty`.
- Session changes invalidate in-flight results through the existing generation
  guard pattern.
- Authentication failures return to the existing Portal auth journey.
- Retry buttons repeat only safe GET requests.
- No Wallet, ledger, or order data is persisted in localStorage.
- No fixture, demo account, checkout Quote, or sessionStorage order reference
  is used as history.

## Security And Privacy

- The browser supplies only `X-Portal-Session` and pagination values.
- Account ownership is always derived server-side.
- Pagination is bounded and validated.
- Ledger responses omit actor, source, wallet, lot, and operation-receipt
  internals.
- Responses contain no provider credentials, checkout URLs, user identifiers,
  subscription URLs, or raw customer evidence.
- No Admin capability, arbitrary balance editor, transfer, withdrawal,
  exchange, trading, or third-party payment behavior is introduced.

## TDD Sequence

1. Add failing Portal tests for the Orders navigation, exact navigation order,
   Orders/Profile separation, and legacy payment-detail back navigation.
2. Add failing Wallet Store route tests using only an owned disposable SQLite
   fixture, followed by strict client-parser tests.
3. Render real Wallet summary and ledger states; prove unavailable errors never
   become zero balances.
4. Add failing Commerce Store list tests, session-owned route tests, strict
   client tests, and Orders UI tests.
5. Add a negative test proving the Coins recharge-order section stays
   unavailable and performs no request.
6. Extract Profile and Security modules after the navigation and behavior tests
   are green.

No production database, copied production data, provider endpoint, or shared
test account is used.

## Acceptance Criteria

1. The authenticated page contains exactly one `portal-v2-shell`.
2. Desktop navigation has one Orders entry in the approved order.
3. Wallet remains reachable from exactly one top Coins entry and is absent from
   the left navigation.
4. Personal Center defaults to the profile subview; its separate security
   subview does not share a combined profile form, and neither contains an
   order table or payment detail.
5. Existing historical-order behavior is reachable from Orders without
   opening a new purchase flow.
6. Wallet summary and ledger display only authoritative, session-owned data.
7. Coins consumption history is account-owned, bounded, paginated, and
   fail-closed.
8. Coins recharge orders display `unavailable`; no fake row, zero count, or
   request is produced.
9. No balance mutation, recharge action, provider call, schema change,
    fulfillment action, Admin change, deployment, or production switch occurs.
10. Desktop Chinese and English labels, focus behavior, and theme variables are
    covered. Mobile and responsive completion are explicitly unclaimed.
11. The PR and handoff states are labelled
    `control-plane-app / source-only / not_deployed` and
    `portal-static / frontend_surface=portal / source-only / not_deployed`.

## Validation

Focused tests run first, then:

```powershell
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:portal:verify
npm test
npm run docs:authority:check
git diff --check c3d92ed3c4691f2512e80da3dffcab17e027b928...HEAD
git diff --check origin/master...HEAD
```

Before final `npm test`, port `3457` is subject to an ownership gate. No
listener means validation may continue. A listener may be stopped only when
its command line contains both the exact validation script
`start-local-coin-commerce-validation.mjs` and this exact worktree path.
Unknown, multiple, or unreadable ownership stops validation without
terminating any process. This operational gate is not a product-code change.

## Stop Conditions

Stop and open a separate Risk A gate if implementation requires:

- a table, column, index, migration, or production schema apply;
- a durable recharge/payment order;
- callback, reconciliation, wallet credit, refund, or chargeback mutation;
- provider credentials or a real provider request;
- production feature activation, artifact publication, deployment, or switch.

Mobile-only navigation, responsive breakpoint, or viewport-specific fixes are
deferred to the later mobile B task rather than added to this PR.

Also stop before opening a PR until the local 42-commit base stack is
reconciled. A normal PR from this branch directly to `origin/master` would
include the entire source-only stack rather than only this B change.
