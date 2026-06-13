# Traffic Accounting and Quota Gateway Plan

Last updated: 2026-06-06, Asia/Shanghai.

This document defines the repo-only plan for adding per-subscription traffic
accounting, quota enforcement, and abuse containment to the current
subscription-control platform.

It does not authorize production, AWS, Vultr, Aliyun, DNS, Nginx, firewall,
Mihomo, SQLite, payment, subscription issuance, account, password, token, or
customer-data mutation.

## Current Facts

The current repository can issue user-portal orders and bind edge credentials,
but it does not yet meter real proxy traffic per order.

Known current behavior:

- subscription responses set `Subscription-Userinfo` with fixed
  `upload=0`, `download=0`, and `total=0`, while only `expire` reflects the
  subscription lifecycle;
- `platform_entitlements.traffic_limit_bytes` stores a traffic limit, not used
  traffic;
- `platform_quota_counters` stores generic counters and can be reused for
  rollups, but it is not a durable usage ledger;
- issued subscription bindings can map active tenant/artifact records back to
  account, entitlement, request, and node facts;
- edge credential refs already provide the right anchor for order-scoped
  runtime credentials;
- the billing contract already models usage debit decisions, but no storage or
  collector currently feeds those decisions.

Therefore, time-based expiry and disable/revoke can be represented, but traffic
abuse cannot yet be detected or limited reliably.

## Goal

Add a minimal, durable, per-order traffic accounting path:

```text
edge runtime observation
  -> edgeCredentialRef usage sample
  -> control-plane usage ledger
  -> rollup against entitlement traffic limit
  -> quota decision
  -> controlled disable/revoke gate
  -> subscription userinfo header reflects used/limit/expiry
```

The authoritative business decision remains in the control plane. The node or
runtime collector only reports usage and applies approved credential lifecycle
state.

## Non-Goals

This plan does not include:

- payment provider integration;
- customer billing UI;
- public Admin exposure;
- raw node log ingestion;
- raw runtime config exposure;
- production traffic cutover;
- node aggregate traffic as a substitute for per-order accounting;
- forced quota enforcement before a staging proof maps runtime usage to
  `edgeCredentialRef`.

## Recommended Architecture

### 0. Subscription Output Identity Anchor Review

A redacted review of an external Clash/Mihomo subscription profile on
2026-06-06 confirmed the important boundary for this project:

- a client profile can carry runtime identity anchors, such as VLESS UUID,
  TUIC UUID/password, Hysteria2 auth/password, or Shadowsocks password;
- the profile itself is not a traffic ledger and does not report used bytes;
- static fields such as node name, host, public key, short ID, SNI, group name,
  or routing rules are not sufficient quota identities;
- shared credentials across multiple rendered nodes can still be useful for
  one order, but shared credentials across different orders would make
  per-order abuse containment impossible;
- therefore, every issued order that needs quota enforcement must receive a
  unique runtime credential mapped to an internal `edgeCredentialRef`.

For this repository, subscription output is only the delivery vehicle for the
runtime credential. The accounting identity is:

```text
order/access request
  -> edgeCredentialRef
  -> protected runtime credential material
  -> rendered client profile credential
  -> runtime usage observation
  -> ledger sample and rollup
```

Public, admin, test, and report outputs must never expose the raw runtime
credential material. They may expose safe refs, digests, counts, and aggregate
usage numbers only.

### 1. Durable Usage Ledger

Add a schema-gated usage ledger separate from generic quota counters.

Suggested tables:

```text
platform_usage_samples
  id
  source_ref
  channel_ref
  edge_credential_ref
  account_id
  entitlement_id
  request_id
  observed_at
  interval_started_at
  interval_ended_at
  upload_bytes
  download_bytes
  total_bytes
  sample_digest
  created_at

platform_usage_rollups
  edge_credential_ref
  account_id
  entitlement_id
  request_id
  channel_ref
  upload_bytes
  download_bytes
  total_bytes
  last_observed_at
  updated_at
```

Rules:

- samples are append-only and idempotent by `sample_digest`;
- rollups are derived from samples;
- unsafe raw runtime payloads are not stored;
- unresolved samples fail closed and are kept out of quota decisions;
- all public/admin outputs use safe refs and aggregate numbers only.

`platform_quota_counters` can still hold monthly issuance counters or coarse
period counters, but it should not be the only source of truth for traffic
usage.

### 2. Usage Collector Interface

Introduce a small collector interface:

```ts
type UsageCollector = {
  collect(input: {
    channelRef: string;
    since?: string;
  }): Promise<SafeUsageObservation[]>;
};
```

`SafeUsageObservation` must contain only:

- channel ref;
- edge credential ref;
- observation timestamps;
- upload/download byte counts;
- a safe source ref;
- enough normalized fields for the control-plane service to derive an
  idempotency digest.

It must not contain:

- subscription URLs;
- credential material;
- raw UUID/password values when treated as runtime material;
- raw Mihomo config;
- raw logs;
- customer personal data.

### 3. Runtime Capability Gate

The first implementation must prove that the runtime can expose usage at the
same identity granularity used by issuance.

Required AWS staging gate:

```text
create synthetic credential
  -> apply to staging Mihomo
  -> produce synthetic traffic
  -> collector observes usage for the same edgeCredentialRef
  -> control DB records sample and rollup
  -> subscription header shows non-zero used bytes and correct total/expire
```

If the runtime can only expose node-level aggregate traffic, the implementation
must stop at diagnostic reporting. Node aggregate traffic is not acceptable for
per-order quota disablement because it cannot distinguish one abusive order
from another.

### 4. Quota Decision Service

Add a control-plane service that:

1. resolves `edgeCredentialRef` to the active issued binding;
2. stores an idempotent usage sample;
3. updates usage rollups;
4. compares `total_bytes` with `traffic_limit_bytes`;
5. returns one of:
   - `within_quota`;
   - `over_quota_disable_required`;
   - `unmetered_no_limit`;
   - `unresolved_binding`;
   - `collector_not_supported`.

When over quota, the service must not directly mutate the node runtime. It must
request the existing controlled lifecycle path:

```text
mark order/link disabled
  -> desired credential set excludes the credential
  -> edge reconciliation apply gate revokes runtime credential
  -> receipt records applied/failed state
```

### 5. Subscription Header Backfill

After the ledger exists, subscription routes should set:

```text
Subscription-Userinfo:
  upload=<rollup.upload_bytes>;
  download=<rollup.download_bytes>;
  total=<entitlement.traffic_limit_bytes>;
  expire=<entitlement.valid_until epoch seconds>
```

If no ledger data exists yet:

- `upload=0` and `download=0` are allowed;
- `total` should use `traffic_limit_bytes` if configured;
- `expire` stays tied to lifecycle state;
- disabled or revoked links must still fail closed before rendering YAML.

## Implementation Phases

Status as of 2026-06-06:

- Phase 1 repo-only usage sample storage, rollups, quota decisions, and
  traffic-aware subscription header backfill are implemented locally;
- Phase 2 repo-only Mihomo TUIC usage collector dry-run adapter is implemented
  locally using dependency-injected safe snapshots; it accepts only observations
  that explicitly include `edgeCredentialRef` and fails closed for node
  aggregate-only snapshots;
- AWS staging Gate 6C proved the control-plane usage anchor chain from
  synthetic order issuance to `edgeCredentialRef`, rendered per-order
  credential output, and usage ledger rollup without exposing raw runtime
  material;
- repo-only Gate 7 preparation added a loopback-only Mihomo external-controller
  usage snapshot reader and a redacted staging proof script; the reader converts
  supported per-credential runtime entries into existing collector observations
  and fails closed when a runtime exposes only aggregate node counters;
- AWS staging Gate 7 proved the loopback-only controller boundary but the
  current Mihomo TUIC metrics surface returned aggregate/connection-level usage
  only, so the collector correctly reported `collector_not_supported` with
  `node_aggregate_only` and did not write usage ledger samples;
- repo-only atomic usage calculation now normalizes runtime counter models into
  ledger-ready delta observations: direct delta/read-and-clear observations pass
  through, cumulative counters require a prior cursor before charging bytes, and
  counter resets fail closed without writing usage;
- repo-only Hysteria2 usage collector adapter is implemented locally against
  the official `GET /traffic?clear=1` client-stat model: Hy2 client IDs must be
  issued as safe `edgeCredentialRef` anchors, and `tx`/`rx` are normalized into
  upload/download usage observations;
- real runtime traffic collection, production migration, and quota-driven
  runtime disable/revoke remain unimplemented until a runtime can expose real
  per-credential usage observations and a schema-gated cursor store is approved.

### Phase 1: Repo-Only Schema and Service Tests

Risk: B for local code, A for any later production migration.

Scope:

- add usage sample and rollup schema to the control DB module;
- add repository methods for idempotent samples and rollup lookup;
- add pure service tests for binding resolution, duplicate sample rejection,
  rollup updates, and quota decision results;
- update subscription-route tests to expect traffic limit in
  `Subscription-Userinfo`.

Validation:

```powershell
npm test -- --test-name-pattern usage
npm test
git diff --check
```

### Phase 2: Collector Adapter Dry Run

Risk: A for staging runtime inspection.

Scope:

- add a Mihomo TUIC usage collector adapter with dependency-injected snapshot
  read functions;
- add tests with synthetic safe observations and aggregate-only fail-closed
  behavior;
- prove the collector output can be recorded by the traffic accounting service;
- no live runtime mutation;
- no raw config or raw log output.

Validation:

```powershell
node --test server\tests\edge-mihomo-tuic-usage-collector.test.mjs
npm test
git diff --check
```

### Phase 2B: Runtime Usage Atomic Calculator

Risk: B for repo-only pure code, A for any persistent cursor migration or live
runtime integration.

Scope:

- normalize multiple runtime accounting modes into one ledger input shape keyed
  by `edgeCredentialRef`;
- accept already-delta or read-and-clear samples as atomic observations;
- convert cumulative counters into positive byte deltas only when a prior cursor
  exists;
- initialize new cumulative cursors without charging historical bytes;
- detect counter resets and fail closed without ledger writes;
- keep raw runtime payloads, credential material, tokens, URLs, and configs out
  of return values.

Current status:

- repo-only pure calculator and targeted tests are implemented locally;
- durable cursor storage is intentionally not implemented here because it is a
  schema/migration gate;
- live collector integration remains blocked by the runtime capability proof,
  not by the ledger normalization model.

Validation:

```powershell
node --test server\tests\edge-runtime-usage-atomic-calculator.test.mjs
npm test
git diff --check
```

### Phase 3: AWS Staging Proof

Risk: A.

Scope:

- AWS staging only;
- synthetic account/order only;
- no Vultr or Aliyun mutation;
- no customer data;
- no production secrets;
- run synthetic traffic and verify per-credential usage mapping.

Recommended first runtime:

- Hysteria2, because its traffic stats API exposes a client-ID keyed byte map
  and supports read-and-clear sampling;
- TUIC through Mihomo remains a connectivity channel until it can expose
  per-credential counters instead of node aggregate traffic;
- Xray/VLESS remains the second candidate for a stable TCP accounting model
  because its stats API can expose user-level uplink/downlink counters when
  users are configured with unique accounting identities.

Hy2 staging proof requirements:

- synthetic Hy2 client ID equals a safe internal `edgeCredentialRef`;
- the traffic stats API is loopback-only and protected by runtime secret
  material that is never printed or committed;
- the collector calls clear-mode stats so each sample is a delta observation;
- one synthetic order records usage without affecting another synthetic order;
- over-quota result remains a control-plane lifecycle decision, not a direct
  runtime mutation.

Pass condition:

- one synthetic order produces a non-zero usage rollup tied to its
  `edgeCredentialRef`;
- a second synthetic order remains distinguishable;
- quota-over-limit decision disables only the intended synthetic credential;
- edge reconciliation receipt is applied;
- subscription header reflects used bytes, limit, and expiry.

Fail condition:

- the collector only sees node aggregate traffic;
- the collector cannot map runtime usage to `edgeCredentialRef`;
- duplicate samples inflate rollups;
- quota decision mutates runtime without the reconciliation gate.

### Phase 4: Production Gate

Risk: A.

Production remains blocked until:

- AWS staging proof passes;
- rollback plan is documented;
- DB backup and migration plan are reviewed;
- per-order usage mapping is proven without raw secret output;
- operator approval names the exact release, artifact hash, target host, and
  rollback release.

## Open Questions

1. Whether the current Mihomo TUIC runtime can expose per-user or per-credential
   counters without changing the runtime model.
2. Whether quota should be enforced by hard disable immediately or by a warning
   threshold before disable.
3. Whether prepaid traffic balance and package traffic limit should share one
   ledger or remain separate until payment integration is approved.

## Decision

Continue to reject node aggregate quota enforcement. It would create a false
sense of safety and could disable the wrong customer order.

The common repo model is now:

```text
runtime-specific snapshot
  -> adapter emits safe per-edgeCredentialRef counter
  -> atomic calculator produces ledger-safe delta
  -> traffic accounting service records sample and rollup
  -> quota decision requests lifecycle/reconciliation action
```

The next implementation gate is not another shared calculator. It is either:

- a schema-gated durable cursor store for cumulative runtimes; or
- a runtime-specific proof that Hy2, TUIC, VLESS/Xray, or another edge can emit
  per-credential counters suitable for this model.

Current recommendation: run the next AWS staging proof with Hysteria2 first.
It is the smallest step from the current repo model because its clear-mode
traffic stats can feed the delta accounting path without adding a durable cursor
schema.
