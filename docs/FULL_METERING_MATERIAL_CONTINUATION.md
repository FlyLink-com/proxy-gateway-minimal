# Controlled material-change metering continuation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_material_continuation
  superseded_by: null
  last_verified_at: 2026-09-23
  production_authority: false
```

Risk: B for this isolated source implementation; A for the incident and any
production recovery. Process: one implementation/test/runbook PR, then separate
exact production approval. Expected PR count: 1. Refs #437; does not close the
incident. `release_unit: control-plane-app`, `identity_impact: true` (collector
identity resolution); Identity Gate remains pending. No production action is
authorized by this document, and no runtime identity is issued by this code.

## Evidence and scope

PR #742 is merged at `6dc690b111c0e71643da39eede367a3ea697e524` and prevents
legacy recovery from deriving unsupported desired identities. Its previous
299-test Aliyun evidence remains valid for that unchanged source boundary,
not for this new continuation. It does not establish a deployed repair.

The previously authorized, consumed 2026-09-23 16:31 UTC aggregate read found
151 checkpoint identities: 136 active unchanged, 10 retained unchanged, five
active with changed material. These are protocol identities, not five accounts.
Ownership checks preceded material classification; later billing/source fields
were not independently proven by that classification. It also confirmed two
unbound removal candidates in each Japan Hy2/TUIC runtime. It did not read SGP
host statistics or establish a healthy full Identity Gate. This implementation
does not repeat that production read or remove those runtime entries.

Only a proven material difference with otherwise identical ownership, channel,
source, request, entitlement and complete billing binding may be accepted.
A later billing end with unchanged material is not a material continuation;
that admission is `docs/FULL_METERING_BILLING_WINDOW_CONTINUATION.md`.
Historical totals, original activation, retained identities and checkpoints are
preserved. Missing intervals are unknown (`null`), never zero or a historical
debit. No database schema, Coins, order, entitlement, map-retention policy,
credential issuance, timer or runtime configuration change is included.

## Explicit admission and storage

Ordinary `--collect` still rejects changed material. There is no automatic flag,
fallback reset or public API. The Linux CLI adds exactly this argument grammar:

```text
--continue-material --config <existing-private-config-path> --config-sha256 <sha256>
  --material-approval <private-approval-path> --material-approval-sha256 <sha256>
```

The approval is operator-owned, non-symlink, owner-only, bounded to 64 KiB,
duplicate-key checked, and pinned by its raw-file SHA-256. Config and approval
are reread during binding checks and sample writes. This custody plus an exact
operator-approved execution packet provides authority; a digest alone is not
authorization. Existing config is unchanged, preserving its journal scope.

The private JSON has exactly these fields (never publish actual values):

- `version: 1`, current `activationId`, and `context` with the existing database
  identity and scope digests;
- exact `previousSequence` and digest of the logical previous checkpoint;
- canonical UTC `notBefore` / exclusive `expiresAt`, at most 24 hours apart;
- `changes`: 1..32 unique channel/ref pairs with the complete old and current
  binding identity digests. The declared set must exactly equal the changed
  active checkpoint identities. An ownership or billing change is not a
  material continuation and fails even if its hash is included.

Admission happens inside the existing single-writer lock and refuses any pending
intent without replaying it. Current bindings are read before and after the
existing trusted, non-clearing source driver, and again before durable writes.
The driver still checks live runtime, protected material and actual generation.
The approval window is rechecked before commit.

The complete old logical checkpoint is durably archived as private
`material-before-<checkpoint-digest>.json` before creating the new WAL intent.
An existing matching orphan may be read, never overwritten; a corrupt one stops
the operation. This archive is evidence, not permission to roll accounting back.
The complete approval and its semantic digest enter private
`materialContinuations` history in both WAL and checkpoint and survive later
ordinary collection. Stdout contains counts only, not approval payloads or refs.

## Counter and crash semantics

| Situation | Accounting behavior |
| --- | --- |
| Same actual generation, approved material changes | Carry prior usage, baseline affected identities at the current real counters with no new charge; other identities continue normal increments |
| Cumulative source lacks an affected real counter pair | Reject; do not invent a zero observation |
| Successful complete TUIC snapshot, affected identity has no active connections | Keep usage, close old connections using existing tombstones, wait for real new connections; their first observation baselines only |
| Actual runtime generation changed | Reuse existing full-source generation transition; all identities in that source baseline, gap remains unknown; other unchanged sources continue |
| Source read, ownership, material, billing, window or checkpoint verification fails | No new intent or sample writes; do not clear guards or retry the consumed production packet |
| New intent already durable at interruption | Recover that exact intent once through existing idempotent sample IDs; do not submit the approval as a new continuation |

Optional counter-state `materialBoundaries` stores carry evidence, at most 128
per source across actual generations, including evidence needed by retired
identities. It does not fabricate a generation or reset accumulated usage.
Private checkpoint history is also bounded to 128 continuations. Hitting a
bound stops; it does not drop audit history.

The new command is **write-capable**, since unaffected identities may legitimately
record increments. It is never a read-only diagnostic. A process hard exit can
leave the original writer lock; production lock handling requires confirming
the writer has exited and explicit bounded recovery authority. Tests remove
only their own known empty temporary lock after the child process has exited.

Before any new WAL intent, the old journal/database can remain in place. Once
intent or samples are committed, retain the new compatible helper and recover
forward. An old strict helper cannot parse the new optional evidence. Do not
restore an old checkpoint/database, delete pending, or restart initialization to
make rollback appear successful. Runtime-config rollback is separate and must
remain consistent with the current verified materials and billing bindings.

## Source validation and next production boundary

Three new suites cover pure transitions, exact admission and real SQLite/child
process crashes. Targeted command:

```sh
node --test server/tests/full-metering*.test.mjs
```

TDD: the new API first failed its expected export cases; orchestration initially
failed all 13 new-mode cases; TUIC empty snapshots initially failed three cases.
The implemented suites cover changed/higher/lower counters, unaffected peers,
expiry/replay/partial sets/billing drift, complete empty TUIC snapshots, archive
immutability, private approval retention, real generations, and six real hard
exits across `pending_durable`, `samples_committed`, `checkpoint_durable`.
All fixtures are synthetic and disposable; no production data or credentials
are used. Exact pass/fail counts and exact-head GitHub Linux checks belong in
the PR validation receipt. Windows source checks are not Linux custody evidence.

Before production promotion, separately bind the exact source/artifact and
helper installation, existing candidate runtime deltas, current five affected
bindings including billing/material, real generation/source provenance,
checkpoint/pending/lock state, fresh host-local backups and rollback/recovery
state machine. Reuse unaffected #742 evidence; do not repeat a whole-project
inventory or any consumed packet. An operator must approve the exact bounded
write-capable continuation and service actions. No collection activation is
included in this source PR. After authorized recovery, verify distinct natural
runs and sample/checkpoint progress, retain aggregate Identity Gate before/after
evidence, and add a Deploy Note. Until then the production incident stays open.
