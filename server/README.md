# Server Workspace

This file is a responsibility and navigation entry point. It does not establish
global, release, deployment, runtime, or production authority.

## Responsibility

`server/` owns the Node.js control-plane application: HTTP middleware and
routes, domain services, persistence adapters, edge integration contracts, and
the runtime composition used by the application process.

## Entry Points

- [index.mjs](index.mjs) loads the environment and starts the process.
- [start.mjs](start.mjs) contains the shared startup lifecycle.
- [app.mjs](app.mjs) composes the Express application and routes.
- [state.mjs](state.mjs) composes the current runtime dependencies.
- [routes](routes) and [services](services) contain HTTP adapters and domain or
  integration services; [tests](tests) contains the Node test suite.

## Development

Run `npm run server` from the repository root for the local service. Keep new
behavior in the smallest owning route or service and use `state.mjs` only for
composition when possible.

## Validation

Run the focused `node --test server/tests/<name>.test.mjs` command for the
changed boundary, then `npm test` and
`git diff --check origin/master...HEAD`.

## Admin login

For the default-private boundary and explicitly approved public cookie-auth
ingress, see [Admin public login hardening](../docs/ADMIN_PUBLIC_LOGIN_HARDENING.md).
Source availability does not open a production endpoint.

The manual aggregate ledger read at
`GET /api/admin/platform/user-monitor/usage-ledger-summary` requires the existing
Admin session and both `users.read` and `runtime.read`. It accepts no query/body
parameters and returns `no-store` aggregate fields only. A single bounded child
reads the runtime-owned control database; injected stores are unavailable rather
than falling back to another file. See [Admin usage ledger](../docs/ADMIN_USAGE_LEDGER.md)
for recorded-usage semantics, limits, source evidence and the separate production gate.

`GET /api/admin/operations/order-status-summary` is a platform aggregate of the
current status of orders created inside a UTC window. It is not a count of
status transitions, and it is not revenue, net revenue, settled receipt,
refund, or renewal. The route is registered only when
`ADMIN_AUTHORIZATION_ENABLED` is exactly true, then requires the existing Admin
session and `operations.read`. It does not walk accounts and does not use
`ADMIN_USER_COMMERCE_ENABLED`.

`from` and `to` are both omitted or both canonical UTC instants
(`YYYY-MM-DDTHH:mm:ss.sssZ`). The filter is half-open: `created_at >= from`
and `created_at < to`. The default window is the last 30×24 hours ending at
the server clock. The maximum span is 31×24 hours. Invalid query parameters
are rejected before the database is opened. A well-shaped instant that is not
a real Gregorian UTC time, including month 13, 30 February, or hour 25, is
`invalid_query` and does not open the database.

Recharge rows come from `platform_payment_orders`, grouped by the stored
`status`, `currency`, and `currency_exponent`. Each group reports the order
count and the sum of `amount_minor` as order-amount minor units. Coins
commerce rows come from `platform_coin_commerce_orders` joined to
`platform_coin_commerce_offer_versions.delivery_kind`, grouped by the stored
`payment_status` and `delivery_kind`. Each group reports the order count and
the sum of `amount_units` as Coins. `subscription_plan` and `data_pack` stay
separate. Catalog `reference_amount_minor` is not summed. Receipts are not
relabeled into the status groups. An empty window is an empty group list. A
missing table, an unmatched offer version, or a sum outside the safe integer
range fails the whole read as `source_unavailable` rather than a partial or
zero total.

`platform_payment_orders` is indexed by `(account_id, created_at, payment_order_ref)`.
`platform_coin_commerce_orders` has no `created_at` index. This windowed
aggregate can scan. This change does not add an index or migration.

`GET /api/admin/operations/recharge-confirmation-gross` sums the quote
`amount_minor` of recharge orders whose first authoritative charge confirmation
falls in a UTC window. It is payment-confirmation gross in minor units. It is
not revenue, net revenue, bank settlement, or profit. Coins credit is not
required. The route is registered only when `ADMIN_AUTHORIZATION_ENABLED` is
exactly true, then requires the existing Admin session and `operations.read`.
It does not walk accounts and does not use `ADMIN_USER_COMMERCE_ENABLED`.

A receipt qualifies only when `verification_result` is `verified`,
`canonical_state` is `payment_succeeded`, and `charge_certainty` is
`confirmed_charged`. The order is counted once, on the earliest qualifying
receipt ordered by `accepted_at` then `receipt_ref`. Later capture, callback,
and query successes do not add another amount. `from` and `to` filter that
first `accepted_at` with the same half-open UTC rules as the order-status
summary, including calendar validity. The clock is not the confirmation time.
Every qualifying receipt, including one outside the requested window, must
have an `accepted_at` that passes that same calendar check. A shape match such
as month 13, 30 February, or hour 25 makes the whole read
`source_unavailable`.

`payment_verified` and `credited` are both confirmed charges and stay distinct
statuses; this aggregate adds their quote minor units inside the same currency
and `currency_exponent` group. `reconciliation_required` is omitted from the
gross, `freshness` becomes `partial`, and `reconciliationExcluded.orderCount`
reports how many such orders were left out. A quote mismatch, a non-canonical
confirmation timestamp, or any other current status alongside a qualifying
receipt fails the whole read as `source_unavailable`. An empty window with no
exclusion is an empty group list and `freshness` `fresh`. A sum outside the
safe integer range fails the whole read.

`platform_payment_receipts` is indexed by
`(payment_order_ref, accepted_at, receipt_ref)`. The observed plan walks that
index for the qualifying pass and searches it again by `payment_order_ref` and
`accepted_at` to choose the first receipt. `verification_result`,
`canonical_state`, and `charge_certainty` are residual filters, not index keys.
A later migration could add a partial index limited to confirmed receipts;
every receipt insert would maintain it. This change does not add that index
or any payment DDL.

## Subscription website metadata

Successful Clash YAML responses from `routes/subscription.mjs` include
`Profile-Web-Page-Url: https://www.gccwebos.com/` for compatible clients' website
entry. This fixed public URL is independent of the request host, subscription
source and lifecycle metadata. It does not change YAML, credentials, usage or
expiry; rejected subscription requests do not receive the header. The client
controls where the entry appears and must refresh the remote subscription to
receive updated metadata. This source contract does not establish deployment
or acceptance in every Clash client/version.

Authenticated expired YAML subscriptions return a credential-free, reject-only
notice and a fixed Portal website header; unknown/disabled/revoked/rotated links
remain errors. This does not re-enable an expired subscription or push an update
to a client's cached configuration. See [expiry notice and flag contract](../docs/SUBSCRIPTION_EXPIRY_NOTICE.md).

Legacy monthly/yearly third-party distribution additionally requires verified
current entitlement evidence and an exact supported quota, including the
approved legacy numeric-zero tier mapping (not an unlimited-traffic grant).
Missing or revoked bindings never imply eligibility. See [legacy subscription eligibility](../docs/THIRD_PARTY_LEGACY_SUBSCRIPTION_ELIGIBILITY.md)
for source behavior, tests and the separate production boundary.

The opt-in `SUBSCRIPTION_DISTRIBUTION_ENABLED` policy replaces the appended-node
model with a per-tier choice between owned nodes and selected imported nodes.
It preserves subscription links and validates subscription lifecycle before
selection. An authorized third-party-only selection does not require an owned
runtime credential or application receipt; owned selection retains those gates.
The system-owned source stores only display/distribution overrides. Its explicit
schema migration lives in the existing imported-source database and is never
applied on application startup. See [distribution routing](../docs/SUBSCRIPTION_DISTRIBUTION_ROUTING.md)
for limits, Admin APIs, source validation and the separate BWH supply cutover.

## Release identity

`CONTROL_PLANE_RELEASE_IDENTITY_PATH` is optional at the application boundary.
If absent, bearer-protected `/api/status` reports `releaseIdentity.state` as
`unavailable`; this does not verify the running release. If configured, the
service reads one canonical identity file once during startup and fails closed
if the path or file is invalid or linked, if it changes while being read, or,
on POSIX, if it is group- or other-writable. The identity is never added to the
public `/api/health` response.

## Xray CLI statistics format

The strict `xray api statsquery` reader has a CLI-protobuf-specific adapter:
an existing named statistics row that omits `value` means the protobuf scalar
default zero. The generic `parseStrictXrayUserCounters` contract is unchanged.
Missing rows, directions, identities or root `stat` are not invented; null,
invalid values, duplicate JSON keys/directions and unsafe sums still fail.
Empty statistics mean no observations, not zero usage for every configured user.

Both the recovery local-source reader and the `collectionScope` collector in
`state.mjs` consume this strict CLI boundary. Updating a recovery overlay does
not prove the sustained production collector uses the corrected source. The
Hy2/TUIC HTTP readers and legacy direct strict-parser recovery command are not
changed. Source tests are not production Xray-version or restoration evidence;
see [the dated source validation record](../docs/production-incident-records/2026-09-29-xray-cli-zero-compatibility-source.md).

## Boundary

Optional output labels are documented in
[Subscription display names](../docs/SUBSCRIPTION_DISPLAY_NAMES.md). They never
replace internal node/channel names or credential-material lookup keys.

The standalone full-metering collector retains its default five-source scope.
An explicitly approved `local-three-v1` activation can collect the original
three local channel references while reporting deferred SGP coverage as
paused/unknown. It requires a new journal and preserves existing identity and
history checks; it neither starts services nor changes billing rights. See
[the full metering runbook](../docs/FULL_METERING_RECOVERY_RUNBOOK.md#explicit-local-three-source-scope-source-only-2026-10-07)
for config, pending-recovery, validation and production boundaries.

This workspace does not own frontend builds, provider configuration, host
provisioning, or production deployment. The presence of runtime adapters or
mutation-capable services in source does not authorize their use; production,
auth-model, schema, and runtime changes retain their existing risk gates.
