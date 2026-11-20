# D1 Stage 1B — G4 Agent writer-epoch contract / Muse BWH handoff

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_d1_stage1b_agent_epoch_handoff
  superseded_by: null
  last_verified_at: 2026-11-20
  production_authority: false
```

Date: 2026-11-20. Source: Worker stage 1A Draft PR #894,
stage 1B Draft PR #895 (stacked on #894), staging baseline PR #893.
Deployment principal: **gccltd.co2026@gmail.com** Primary Cloudflare
account only. This document is a **code integration task**, not authority
to mutate production BWH or import production data.

## Scope actually implemented by the Worker

The following Worker D1 write-bearing operations reject non-D1 authority,
missing or stale writer epochs, and stop on a changed epoch in the same
D1 transaction as each mutation:

| Route | Mutation surface | Epoch source |
| --- | --- | --- |
| `POST /v1/accounts/:accountId/second-factor-challenges` | Challenge + idempotency record, same D1 batch | `x-writer-epoch` (Stage 1A) |
| `GET /v1/agent/desired-state` | Nonce cleanup/insertion, Agent credential heartbeat, manifest claim insert/expiration | `x-writer-epoch` (Stage 1B) |
| `POST /v1/agent/receipts` | Same Agent authentication writes, apply receipt, claim completion update | `x-writer-epoch` (Stage 1B) |

G4 uses `createEpochFencedD1`: `.run()` wraps every DML in a single
D1 `.batch([epochFence, businessStatement])`; `.batch()` prepends the same
guard to all mutation batches. Reads remain SELECT-only. DML via
`.all()`/`.first()` and raw `.exec()` are rejected. A query-level
preflight check is not considered sufficient; all mutations need their
own atomic fence, even during concurrent cutover.

Agent credentials and node/channel scope are checked before disclosing epoch
errors. Credential expiry cleanup uses the same transaction fence.

The default D1 authority migration `0005_writer_authority_guard_slice.sql`
is **synthetic/local only**, initialized as
`{authority: BWH, phase: BWH_ACTIVE, epoch: 1}`. Remote E4 and Staging D1
have not been granted D1_ACTIVE. There is **no public HTTP operation**
to promote authority. BWH remains the sole real production business writer.

## Wire contract Muse must implement on source side

`x-writer-epoch` is a decimal ASCII integer from 1 to 2147483647, no
leading zeroes. It is not authentication. Existing scoped bearer token,
Agent request nonce, timestamp, key ID, nodeRef, and idempotency rules
remain necessary. The epoch comes from a *durable coordinator receipt*,
never a client-generated counter, request parameter default, or guess.

Once a staged D1 authority handover is explicitly verified, Muse's
BWH Agent transport must attach the same `x-writer-epoch` header to both
`fetchDesiredState` and `submitReceipt` on every call. The normal
G4 Agent client currently does **not** emit this header; this PR only
adds it in synthetic integration-test transport. Do not enable live BWH
Agent traffic against G4 D1 endpoints until Muse implements, tests and
coordinates that header. Before cutover, `GET /v1/agent/desired-state`
**must not** be used as a shadow read: it writes nonce and claim state.

The Worker returns generic JSON errors under
`{error:{code,message}}` with these stable codes:

- `400 writer_epoch_required`: absent/malformed epoch.
- `409 writer_epoch_stale`: stale/future epoch or transactional
  authority change during an in-flight request.
- `503 writer_authority_not_d1`: BWH_ACTIVE/FROZEN/RECOVERY state.
- `503 writer_authority_unavailable`: authority record missing or invalid.
- Existing 401 authentication, 409 idempotency and 410 lease-expiry
  responses are independent.

**No 5xx or D1 outage authorizes a local BWH write fallback after D1
activation.** In particular, deploying the old unfenced Worker version
after production D1 activation would violate the single-writer safety
contract; rollback must include epoch and fence compatibility, not merely
a code-version rollback.

## Muse code task — BWH offline branch / Draft PR

1. Enumerate every BWH `subscription-control.sqlite` mutation, including
   raw `better-sqlite3` calls, account/session/credential writes,
   wallet/ledger/order/payment callback, subscription entitlement,
   identity deletion, gateway control paths, scheduler jobs and Agent
   persistence. Classify writer domain and any exceptions; do not assume
   HTTP middleware covers non-HTTP writers.
2. Introduce a durable BWH authority state record and monotonic epoch.
   Enforce the current epoch + BWH_ACTIVE **in the same SQLite transaction
   as business mutations**, and fence old/background processes across
   restarts. Re-use existing idempotency/ledger semantics; never duplicate
   wallet transactions on retries.
3. Implement a non-executing freeze contract that can later drain active
   transactions and return a signed/traceable freeze receipt containing:
   authority state, epoch, source snapshot/checkpoint identity, durable
   high-watermark, outstanding-job count, timestamp and writer quiescence
   assertion. This task **does not execute** a real production freeze.
4. Add a source-side dry-run interface to enumerate deltas by PK and
   content fingerprint, including deletes, without exporting raw
   credentials to D1. Leave actual E4 data import for later stages.
5. Adapt the Agent transport to forward the coordinator-issued epoch,
   but leave production transport disabled until an approved staged
   handover; test retries after lost acknowledgment and frozen authority.
6. Provide deterministic local tests of late queued jobs, concurrent
   callbacks, process restart while frozen, interrupted source snapshot,
   epoch mismatch, and stale process after D1 activation. No secrets
   or production SQLite files should enter the test artifacts.

Minimum source entry points to inspect first:
`server/services/platform/subscription-control-db.mjs`,
`server/services/platform/coin-commerce-store.mjs`,
`server/services/platform/portal-subscription-link-reset-store.mjs`,
`server/services/platform/d1-identity-binding-repository.mjs`,
`agent/g4/agent-client.mjs`, and any current scheduler/payment handlers.
This is a seed list, **not** an exhaustive audited writer inventory.

## Boundary and acceptance criteria

Phase 1B protects the *G4 HTTP-request D1 mutation path*. It does **not**
secure ad-hoc raw D1 clients, direct calls to repository constructors with
unwrapped D1, Auth Portal/Admin Durable Object storage, potential future
Worker routes, or the BWH production process. Portal/Admin DO session state
is not the same business-control SQLite authority but needs a distinct
lifecycle/security review before production enablement. The full migration
single-writer decision remains pending Muse BWH fencing, a reconciled
cross-side state protocol and final cutover rehearsals.

Acceptance evidence for this Worker slice:
- Miniflare tests cover default BWH, FROZEN and RECOVERY denial, stale
  and malformed epochs, no nonce/claim/receipt on a rejected request,
  idempotent legitimate replay, D1 transaction rollback and a
  between-preflight-and-transaction epoch flip.
- Code review confirms no direct G4 request-path mutation bypasses the
  `createEpochFencedD1` adapter.
- Cloudflare Primary-account Staging version + D1 binding readback matches
  expected resource, and no E4 DDL or BWH write-authority changes occurred.

**Not authorized by this handoff:** BWH production commands, mutation of
existing BWH database, E4 importing/DDL, remote Durable Object migrations,
D1_ACTIVE activation, Ready or merge of the Draft PRs.
