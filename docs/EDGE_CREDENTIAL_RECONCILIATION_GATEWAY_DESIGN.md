# Edge Credential Reconciliation Gateway Design

Last updated: 2026-06-05, Asia/Shanghai.

## Purpose

This document defines the repo-only design for an edge credential
reconciliation gateway. The gateway reconciles subscription-control-plane
desired credential state with a node runtime such as Mihomo TUIC.

The design is intentionally narrow:

- the subscription control plane owns order lifecycle, quotas, expiry,
  revocation, audit, and channel policy;
- the edge node owns only local runtime application: read current managed
  credentials, reconcile them to desired state, validate config, activate the
  runtime, and return a redacted receipt;
- no node-side business decision is introduced.

This document is not production approval. Production mutation still requires
Risk A read-only inventory, dry-run, exact operator approval, validation, and
rollback evidence.

## Current Problem

The repository can model multi-channel policy and TUIC per-order lifecycle
capability, but the production apply path still correctly fails closed until a
runtime adapter exists. Without an execution gateway, the system can create or
display orders while the edge node may still have stale credentials.

That creates four unacceptable states:

- an expired order can remain usable because the node credential was not
  revoked;
- a disabled order can remain usable because only the control-plane record was
  disabled;
- a successful order can fail to connect because the node credential was never
  applied;
- a rotated credential can leave both old and new credentials active.

## Design Principle

Use full desired-state reconciliation instead of ad hoc per-order delta writes.

The control plane periodically or event-triggered computes:

```text
desired credentials for channel X = all currently active, non-revoked orders
```

The node gateway then makes its managed credential set equal to that desired
set.

This keeps the model simple:

- new order: desired set contains a new credential;
- expired order: desired set no longer contains that credential;
- disabled order: desired set no longer contains that credential;
- rotation: desired set contains the replacement credential;
- retry: applying the same desired set again is idempotent.

## Architecture

```text
User Portal / Admin
  -> Order and subscription records
  -> Control-plane lifecycle service
  -> CredentialDesiredStateBuilder
  -> CredentialReconciliationGateway
  -> Node executor for channel-lab-b-tuic
  -> MihomoTuicCredentialApplier
  -> redacted apply receipt
  -> EdgeApplyReceiptStore
```

### Control Plane Responsibilities

The control plane is authoritative for:

- order status;
- plan duration and expiry;
- disable/revoke decisions;
- monthly quota policy;
- logical channel selection;
- desired credential generation;
- apply receipt persistence;
- audit trail.

The control plane must not directly splice raw Mihomo config or expose raw node
runtime config through public routes.

### Node Gateway Responsibilities

The node gateway is authoritative only for local application:

- read current managed credentials from the node runtime config;
- compare current managed credentials with desired credentials;
- add missing desired credentials;
- revoke managed credentials absent from desired state;
- rotate credentials whose stable reference matches but digest differs;
- write a candidate config;
- run config validation;
- activate the service through the approved activation surface;
- return a redacted receipt.

The node gateway must not decide whether an order is active, expired, paid,
disabled, over quota, or allowed.

## Gateway Interface

The gateway exposes a small command/API contract:

```ts
interface CredentialReconciliationGateway {
  plan(input: ReconcileInput): RedactedReconcilePlan;
  apply(input: ReconcileInput, approval: ApplyApproval): RedactedApplyReceipt;
  reconcile(channelRef: string): RedactedDriftReport;
  rollback(channelRef: string, backupRef: string, approval: ApplyApproval): RedactedApplyReceipt;
}
```

### ReconcileInput

```ts
type ReconcileInput = {
  channelRef: string;
  runtime: "mihomo-tuic";
  activationSurface: "explicit-restart";
  desiredStateRef: string;
  desiredCredentials: DesiredCredential[];
};
```

### DesiredCredential

The desired credential object is the minimal node-execution payload:

```ts
type DesiredCredential = {
  credentialRef: string;
  orderRef: string;
  userRef: string;
  expiresAt: string;
  material: {
    type: "tuic-v5";
    uuid: string;
    password: string;
  };
};
```

Rules:

- `credentialRef` is stable for idempotency.
- `orderRef` and `userRef` are non-secret references only.
- `material` is sensitive and must never be printed in logs, receipts, docs, or
  chat output.
- output must use digests and counts, not raw credential values.

## Node-Side Apply Flow

For `channel-lab-b-tuic`, the first production candidate uses explicit
`mihomo-tuic.service` restart.

```text
1. Acquire single-writer lock for channel-lab-b-tuic.
2. Read current protected Mihomo TUIC config.
3. Extract the managed credential section.
4. Build desired managed credential section from ReconcileInput.
5. Compute diff:
   - desired exists, current missing -> add
   - current exists, desired missing -> revoke
   - both exist, digest changed -> rotate
   - both exist, digest same -> unchanged
6. Write a candidate config to a protected temporary path.
7. Run Mihomo config-test against the candidate config.
8. If config-test fails, keep current config and return failed receipt.
9. Back up current config to a protected backup path.
10. Atomically replace the managed runtime config.
11. Restart mihomo-tuic.service only if activation requires restart.
12. Validate service active and UDP 443 listener present.
13. Return redacted receipt.
```

## Managed Section Boundary

The node applier must only modify the managed TUIC credential section. It must
not rewrite unrelated runtime configuration, transport settings, DNS settings,
or other protocol channels.

Preferred implementation:

- parse the config using a structured YAML parser;
- locate a single managed proxy/server entry by explicit channel identity;
- replace only that entry's managed users list;
- preserve unrelated fields;
- write through a temporary file and atomic rename.

String replacement is not acceptable for production apply unless the runtime
config is first normalized into a dedicated generated include file owned by the
gateway.

## State and Receipts

The control plane records edge apply state separately from the order state.

Suggested receipt states:

- `pending`: desired-state generation succeeded, node apply not yet completed;
- `applied`: node accepted and activated the desired state;
- `failed`: node did not apply the desired state;
- `rolled_back`: node restored a previous backup after failed apply;
- `drift_detected`: reconcile found unmanaged difference requiring operator
  review.

The receipt may include:

- `channelRef`;
- `desiredStateRef`;
- action counts;
- credential refs;
- redacted digests;
- config-test status;
- service status;
- backup reference;
- rollback reference;
- timestamp.

The receipt must not include:

- raw passwords;
- raw UUIDs if treated as credential material for the runtime;
- subscription URLs;
- tokens;
- raw Mihomo config;
- raw logs;
- SQLite rows;
- customer data.

## Concurrency and Idempotency

The node executor must use a single-writer lock per channel. If the lock cannot
be acquired, apply fails or queues according to the caller's policy.

Idempotency rules:

- same `desiredStateRef` applied twice returns unchanged/applied;
- same credential refs with same digest do not trigger a restart;
- same credential refs with changed digest are treated as rotation;
- a failed config-test never mutates the active config;
- a failed restart triggers rollback if rollback was approved in the apply
  gate.

## Reconcile Strategy

Reconcile compares the control-plane desired credential digest set with the
node managed credential digest set.

It reports:

- missing credentials;
- stale credentials;
- digest mismatches;
- unmanaged credentials inside the managed section;
- service/config validation status.

Reconcile is safe to run read-only. It should be allowed before production
apply approval and after apply validation.

## First Implementation Scope

The first repo implementation should stay intentionally small:

- one logical channel at a time: `channel-aliyun-a-tuic` for Aliyun local edge
  validation, or `channel-lab-b-tuic` for Japan TUIC validation;
- one runtime: Mihomo TUIC v5;
- one activation surface: explicit restart of `mihomo-tuic.service`;
- full desired-state snapshot apply, not order-by-order deltas;
- CLI-first gateway, not public API;
- redacted outputs only;
- local tests and dry-run plans before any production gate.

## Aliyun Local Edge First Phase

Aliyun can host a local data-plane channel beside the subscription control
plane, but the logical boundaries must stay separate.

Required separation:

- control-plane service: owns users, orders, subscription state, quotas, and
  desired-state generation;
- local edge runtime service: owns only TUIC runtime traffic;
- credential reconciliation gateway: converts desired-state snapshots into
  local runtime changes after a production apply gate;
- runtime config path: separate from the control-plane app config and env.

This first phase reduces cross-node transport complexity because the gateway can
be implemented as a local CLI/runtime adapter instead of SSH or Cloudflare
Tunnel. It does not remove Risk A gates. Writing Mihomo config, replacing
runtime files, running config-test, and restarting `mihomo-tuic.service` remain
production mutation.

Current repository support:

- `buildCredentialReconciliationPlan(...)` computes add, revoke, rotate, and
  unchanged actions from safe desired/current digests only.
- `buildCredentialReconciliationApplyPlan(...)` remains blocked unless the
  production execution flag is present and a runtime adapter is injected.
- `createMihomoTuicExplicitRestartAdapter(...)` provides the repo-only adapter
  core for explicit restart activation. It accepts protected material through an
  injected resolver, writes only through injected protected runtime functions,
  runs config-test before backup/replace/restart, and returns a redacted
  receipt.
- The ordinary CLI path does not read raw credential material and does not
  directly perform systemd or protected file operations. Production wiring must
  wrap the adapter in an exact-approved runtime script or host package.

Non-goals for the first implementation:

- public Cloudflare or HTTP management endpoint;
- hot reload via Mihomo external controller;
- multi-node fan-out;
- payment integration;
- public Admin exposure;
- copying production secrets into the repository;
- live order creation during deployment validation.

## Cloudflare Position

Cloudflare can be added later as a safety and coordination layer, but it should
not be required for the first implementation.

Possible future use:

- Cloudflare Access and Tunnel for private management ingress;
- Durable Objects for per-channel serialization;
- Queues for retry and dead-letter handling.

Cloudflare still would not replace the node-side executor because the node-side
executor must modify protected local runtime configuration, validate it, restart
the service, and produce a receipt.

## Validation Plan

Repository validation:

```powershell
node --test server\tests\edge-credential-reconciliation-gateway.test.mjs
node --test server\tests\edge-tuic-credential-lifecycle.test.mjs
node --test server\tests\subscription-channel-policy.test.mjs
npm test
git diff --check
```

Production validation requires a later exact Risk A approval and must include:

- read-only node inventory;
- protected backup existence;
- redacted config-test result;
- dry-run desired-state plan;
- explicit restart approval for `mihomo-tuic.service`;
- service active validation;
- UDP 443 listener validation;
- no raw credentials, raw config, logs, tokens, URLs, or SQLite rows in output;
- rollback readiness.

## Acceptance Criteria

The design is implemented when:

- control-plane desired-state generation is deterministic and test-covered;
- gateway `plan` is read-only and redacted;
- gateway `apply` is blocked without explicit production mutation approval;
- node applier performs locked, structured, atomic config updates;
- config-test failure leaves the active config unchanged;
- explicit restart is performed only after config-test passes;
- expired or disabled credentials are removed from the managed runtime state;
- apply receipts are persisted without secrets;
- reconcile can detect drift without mutating the node.

Until these criteria pass, order expiry metadata remains advisory in the
control plane and must not be treated as proof that the edge node has revoked a
credential.
