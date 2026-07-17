# GitHub Japan Additive Repair Native Direct Design

> Status:
> - Type: Approved source-only design for a future Risk A production action
> - Selected mode: Mode 1, GitHub-native direct execution for a single operator
> - Design approval: The operator explicitly selected Mode 1 in the active Codex task on 2026-07-17
> - Source baseline: `master@9982d378f93dd506c24c137197293f6942dc45ee`
> - Risk: A (source-only implementation, production impact none)
> - Capability: `github-japan-runtime-config-additive-repair-cicd@v3`
> - Release unit: `japan-runtime-config`
> - Production state: `not_deployed`
> - Identity impact: `true`
> - Identity gate: `surface=japan-tuic`, `state=pending`
> - Planned execution Gate: `github-actions-japan-tuic-additive-repair-20260717-001`, `not_approved`
> - Expected PR count: One source-only implementation PR containing design, plan, code, tests, and runbook reconciliation
> - Production authority: None. This document does not change GitHub settings, install an SSH identity, dispatch a workflow, access production, mutate runtime config, deploy an application, restart a service, or approve production execution.

## Supersession Boundary

This design supersedes the mandatory offline-signature architecture in
`docs/superpowers/specs/2026-07-16-github-japan-additive-repair-offline-approval-design.md`
and its implementation plan. The earlier public Ed25519 key and key ID may
remain as dormant public material, but neither the workflow nor production
runner may require, load, or verify them in Mode 1. The offline private key
remains outside the repository and is not accessed, copied, rotated, or deleted
by this work.

The frozen artifact, additive-only mutation, aggregate Identity Gate, backup,
rollback, natural observation, output-redaction, and no-application-deploy
boundaries remain unchanged. No earlier bootstrap or execution approval is
reusable for this design.

## Decision And Trust Model

GitHub Actions becomes both the execution plane and the procedural approval
plane for this single-operator repository. The production host remains the
technical enforcement plane for the exact operation and its one-time claim.

This is intentionally not described as independent approval or two-person
review. In a private GitHub Team repository with one operator and no Environment
reviewer enforcement, a Gate ID, workflow input, public nonce, or host claim
cannot prove that a separate human approved the action. The trust root is the
single operator's GitHub account together with protected `master`, the
`vultr-japan-production` Environment, and the restricted CI SSH identity.

Mode 1 therefore provides:

- a manual and auditable dispatch boundary;
- an exact, closed production capability rather than a general deployment
  shell;
- one durable execution slot that cannot be replaced by supplying a different
  nonce;
- repeatable read-only inspection before or after the claim while host
  authorization remains installed;
- crash-aware backup, journal, rollback, and fail-closed recovery evidence.

Mode 1 does not provide cryptographic separation between the dispatcher and
approval authority. If that property is required later, a new design must
reactivate an offline or independent approval authority under a separate PR and
Gate.

## Frozen Production Input

```yaml
gate_basis: japan-tuic-identity-additive-repair-20260716-002
planned_execution_gate_id: github-actions-japan-tuic-additive-repair-20260717-001
planned_execution_gate_state: not_approved
release_unit: japan-runtime-config
surface: japan-tuic
strategy: additive_missing_only
tool_source_commit: 47a2a9583fb44cb905e91aade02ae5aa3d635d94
tool_artifact_run: 29495150692
tool_artifact_file: proxy-gateway-control-plane-cumulative-20260716-003.zip
tool_artifact_size: 4744340
tool_artifact_sha256: d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd
tool_artifact_entry_count: 1217
tool_artifact_entry_manifest_sha256: 39695581ec714c792540a2ffca6e040631f913be6b3839f14e78aad619b2609d
execution_nonce: 88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b
expected_nonce_sha256: af3b8363d75cf920ca5dea15835c1d6e33684997bc05fa48e2da6e7804e33029
candidate:
  add: 3
  remove: 0
  deferred_remove: 27
  changed: 0
  missing_material: 0
  projected_map: 82
before_identity:
  expected: 55
  mapped: 52
  missing: 3
  stale: 27
  changed: 0
  missing_material: 0
after_identity:
  expected: 55
  mapped: 55
  missing: 0
  stale: 27
  changed: 0
  missing_material: 0
  retention_state: pending
  state: degraded
```

`stale=27` remains deferred. The workflow may not remove stale entries. The
target is not declared identity-healthy because stale is non-zero.

## User Operations

The manual workflow exposes exactly one choice input named `operation`:

- `inspect`: repeatable and read-only;
- `execute`: attempts the single fixed production write slot.

The workflow has no free-form host, path, command, artifact, strategy, count,
Gate ID, or nonce input. The Gate ID, artifact, counts, target, and execution
claim construction are frozen in reviewed source. An internal `closeout` frame
is never user-selectable.

Inspection may verify the artifact, runner binding, durable claim/journal
state, stable candidate or current aggregate Identity Gate, timer state, and
natural observation. It must not claim the execution slot, create a backup,
apply, roll back, modify authorization, or mutate GitHub material.
It may create and remove bounded mode-`0700`/`0600` scratch solely to receive
and inspect the frozen artifact; scratch is not ledger, journal, backup, target,
authorization, or production state, and cleanup is verified before return.

## Fixed One-Time Execution Claim

The execution nonce is a frozen public 64-hex value in reviewed source, not an
authorization secret or workflow input. The host binding contains its exact
`expectedNonceSha256`. The execution claim binds that nonce, the fixed Gate ID,
merged workflow commit, frozen artifact SHA-256, target, release unit, surface,
and strategy through canonical bytes. The binding also contains the expected
SHA-256 of those canonical claim bytes.

The runner must reject:

- a workflow commit different from the root-owned binding;
- a nonce whose SHA-256 differs from `expectedNonceSha256`, even if that nonce
  has never appeared in the ledger;
- a computed claim digest different from the root-owned expected digest;
- any alternative Gate ID, artifact, target, release unit, surface, or
  strategy;
- a second claim after the exact claim ledger entry exists.

Every `execute` call acquires the host lock and reads the ledger and journal
before it evaluates the frozen old `before_identity`. If the exact claim is
already present, the call becomes read-only `replay_reconciled`: backup, apply,
rollback, and authorization mutation are each called zero times. It validates
only the durable journal and current aggregate state appropriate to the stored
phase. This ordering prevents a successful prior repair from being mistaken
for a retryable old pre-state failure.

The workflow does not accept an arbitrary 64-hex nonce. This prevents a caller
from bypassing one-time execution by choosing a fresh nonce. The durable host
ledger names and stores only digests and fixed state; receipts never expose the
raw nonce.

The claim is never released. A failure after claim does not authorize a new
execution slot and does not automatically continue the write. Repeatable
`inspect` reconciles the durable journal. Any nonterminal claimed state requires
a separate exact recovery or rollback Gate.

A durable `prepared` journal with no ledger entry remains unclaimed. `inspect`
classifies it as `ready_unclaimed_revalidation_required` and performs no write.
There is no automatic retry. A new exact Production Execution Gate may approve
a fresh dispatch against the same fixed slot only after the runner repeats both
stable snapshots and confirms the slot is still unclaimed. `stopped_pre_claim`
retains host authorization for that decision; abandoning the flow requires a
separate exact cleanup Gate. Closeout is not permitted for a nonterminal
prepared state.

## Closed Transport

GitHub sends a bounded binary frame over stdin to the forced command. The
frame contains:

- fixed magic and schema version;
- operation (`inspect`, `execute`, or internal `closeout`);
- exact merged workflow commit;
- canonical fixed execution-claim fields for `execute` and `closeout`;
- the exact frozen ZIP bytes for `inspect` and `execute` only.

`runAttempt` is a canonical positive decimal string matching
`^[1-9][0-9]*$`. Inspect accepts any such attempt and its control has exactly
`operation`, `runAttempt`, `schemaVersion`, and `workflowCommit`. Execute and
internal closeout accept only attempt `"1"` and additionally carry the frozen
`executionGateId` and `executionNonce`. No control accepts an extra key.

The reader enforces exact lengths, a maximum control payload, the frozen
artifact length, max-plus-one EOF detection, and rejection of truncation,
unknown operations, duplicate or extra control fields, noncanonical JSON, and
all trailing bytes. It never interprets a remote command or path from the
frame.

The workflow passes the selected operation to Node through a step environment
variable. It never interpolates workflow input into shell source.

## GitHub Workflow Boundary

The workflow remains `workflow_dispatch` only, `master` only, with minimal
read permissions, pinned actions, a non-cancelling concurrency group, and the
`vultr-japan-production` Environment.

### Secretless preflight

Before any SSH material is referenced, the preflight job:

1. checks out the exact workflow commit;
2. checks out frozen source commit
   `47a2a9583fb44cb905e91aade02ae5aa3d635d94` in a separate directory;
3. downloads artifact run `29495150692` by immutable identity;
4. verifies manifest, size, SHA-256, archive identity, and exact Git tree;
5. validates the closed operation and builds no production connection.

### Protected operate job

The Environment-bound job independently repeats the exact workflow checkout,
frozen source checkout, artifact download, manifest/hash validation, and Git
tree validation. Only after those checks pass may one step materialize exactly
these five Environment secrets:

- `JAPAN_CI_HOST`
- `JAPAN_CI_PORT`
- `JAPAN_CI_USER`
- `JAPAN_CI_PRIVATE_KEY`
- `JAPAN_CI_KNOWN_HOSTS`

Exactly one shell step references the five secrets. Inside that step a `trap`
sets `umask 077`, materializes mode-`0600` files under `RUNNER_TEMP`, performs
the operation SSH call and any permitted internal closeout call, then removes
and reads back absence before the step exits. The step never enables shell
tracing. Strict OpenSSH options include `IdentityAgent=none`,
`ProxyCommand=none`, `ProxyJump=none`, and `ControlMaster=no`. There is no
`JAPAN_CI_APPROVAL_BUNDLE` or signing-key secret.

The workflow reports only validated aggregate receipts. It never prints SSH
stderr, endpoints, key material, protected paths, raw configs, runtime
principals, database rows, or provider responses.

## Production Host Binding

The later CI Identity Bootstrap Gate must install a dedicated SSH public key
whose `authorized_keys` entry invokes one exact noninteractive `sudo -n`
command and is restricted by at least:

```text
restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command="/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint"
```

The exact forced-command runner and binding are root-owned, not writable by the
CI principal, and identified by reviewed SHA-256 values. The binding contains
only fixed paths and identities, including:

- merged workflow commit;
- expected execution-claim digest;
- frozen Gate/artifact/target identities;
- current map, material, observation, timer/service, temporary, state, backup,
  and authorization paths;
- a writer-freeze record with `knownWriterCount=0`, the exact bootstrap
  inventory evidence SHA-256, and residual classification
  `trusted_root_concurrency_not_machine_proven`;
- the unique authorization marker.

No client-controlled path or command is accepted. The principal receives no
general shell, PTY, SCP, rsync, sudo expansion, forwarding, service control,
provider access, or unrelated file access.

Bootstrap binds and reads back the exact numeric effective UID expected by the
runner. Sudoers permits only the no-argument absolute entrypoint above. That
root-owned, digest-bound entrypoint executes `/usr/bin/env -i`, then absolute
`/usr/bin/flock`, `/usr/bin/node`, installed runner, and binding paths. No
argument variation or general command is allowed.
Sudoers uses `env_reset`, grants no `SETENV`, and fixes `secure_path`. A
root-owned, digest-bound wrapper clears or rejects `NODE_OPTIONS`, `NODE_PATH`,
and every other interpreter-control environment variable before starting the
runner. Runner, binding, state,
ledger, backup, authorization, target, and helper path components have frozen
owners and modes, no symlink component, and no group/other write access. State,
ledger, and backup directories are root-owned mode `0700`. Sensitive files are
opened with `O_NOFOLLOW` where supported and verified from the open descriptor
with `fstat`; path-only prechecks are insufficient.

## Journal-First State Machine

All durable files use exclusive creation or atomic replacement, file `fsync`,
and parent-directory `fsync`. `inspect`, `execute`, and `closeout` acquire the
same root-owned lock for their complete host operation, independently of GitHub
concurrency. A lock conflict performs zero state or target writes;
`inspect` returns `inspection_blocked` and write operations fail closed.
Journal transitions carry a
monotonic sequence and compare-and-swap expectation; they reject stale-writer
updates, terminal regression, phase/result contradictions, and invalid backup
or claim relationships.

Allowed phases are:

```text
prepared
  -> claimed
  -> backup_ready
  -> apply_intent
  -> applied
  -> observing
  -> applied_validated

apply_intent | applied | observing
  -> rollback_intent
  -> rolled_back_validated

any claimed nonterminal phase
  -> indeterminate
```

Before the lock permits any claim or state write, the host independently
verifies the received ZIP's exact size, SHA-256, entry count `1217`, canonical
central-directory manifest SHA-256
`39695581ec714c792540a2ffca6e040631f913be6b3839f14e78aad619b2609d`,
entry path safety, regular/directory classification, symlink/special-file
absence, and strict EOF, then extracts it into a new private temporary
directory. The manifest canonical bytes preserve archive order and encode each
entry as uint32 big-endian UTF-8 name length, uint32 big-endian external
attributes, uint64 big-endian compressed length, uint64 big-endian
uncompressed length, then raw UTF-8 name bytes. GitHub's two preflight checks
are not a Host attestation and cannot replace this verification.

Before the claim, two stable frozen candidate snapshots and aggregate
`before_identity` are required. The runner writes a durable `prepared` journal,
creates and fsyncs the exclusive claim entry, then advances to `claimed`. If a
crash occurs between those writes, the next `inspect` reconciles the existing
claim plus `prepared` journal as claimed and nonterminal; it never treats the
slot as unused.

The backup identity is derived internally from the claim digest. The backup is
exclusive-created, metadata-preserving, hash-verified, file-fsynced, and
directory-fsynced before the journal reaches `backup_ready`. Backup paths are
never emitted.

The frozen artifact helper cannot be changed by this PR. Its rename is only the
write boundary, not a durable success boundary. Before spawning it, the runner
requires a durable backup and durable `apply_intent`, then under the shared
lock: verifies the map's immediate parent is root-owned and not group/other
writable; rejects every `${basename}.<digits>.tmp` residue without deleting it;
and opens
the current target with `O_NOFOLLOW` to confirm regular file, link count,
owner, mode, and digest equal the durable backup's recorded original.

The host root boundary is trusted. The runner cannot prove that an unrelated
root process will never write concurrently. The bootstrap inventory and exact
Production Gate therefore freeze every known legitimate map writer for this
bounded repair lifecycle; execute rechecks target/parent metadata and digest
immediately before helper spawn. An unknown or compromised root writer remains
an explicitly accepted Mode 1 residual risk, not a machine-proven absence.

After the helper returns successfully, the runner requires helper-temp absence,
opens the target with `O_NOFOLLOW`, verifies regular file, `nlink=1`, expected
owner/mode/hash and the exact post-apply aggregate state, then fsyncs the target
file and immediate parent directory. Only after those checks may the journal
advance from `apply_intent` to durable `applied`. A helper failure or timeout
does not delete residue or retry; it remains nonterminal for an exact cleanup
or recovery Gate. A file/directory fsync failure may enter durable
`rollback_intent` within the approved execution, otherwise it is
`indeterminate`. Artifact reception and the runner's restore path are likewise
file- and directory-fsynced. Crashes after helper rename but before target
fsync, after target fsync but before directory fsync, or after directory fsync
but before the `applied` journal all remain `apply_intent`; inspect performs
zero writes and apply is never retried automatically.

## Validation, Rollback, And Observation

After apply, the runner requires:

- exact additive candidate with no removal or changed entry;
- aggregate after identity exactly as frozen above;
- preserved owner, group, and mode;
- active/enabled natural collection timer with unchanged restart counters;
- a later natural collector invocation, without manual collector invocation;
- Japan TUIC unresolved count `0`, no omitted collector/producer, and conserved
  provenance.

If post-apply validation fails and the durable backup is available, the runner
writes `rollback_intent`, restores through an fsynced atomic replacement, and
verifies the exact before identity and metadata. Only verified rollback may
produce `rolled_back_validated`. Any uncertain apply or rollback is
`indeterminate` and retains authorization, journal, claim, and backup for a
separately approved recovery.

The workflow never deploys an application, switches a release pointer,
installs dependencies, restarts a service or timer, invokes the collector
manually, deletes stale entries, changes schema/database state, or expands
provider/network/infrastructure scope.

## Closeout And Receipt Loss

Host authorization is not removed in the main `inspect` or `execute` call. A
second internal `closeout` frame is permitted only after a durable terminal
state (`applied_validated` or `rolled_back_validated`) has been validated by
GitHub. Closeout removes only the exact marked CI authorization using an
fsynced atomic replacement and verifies absence.

If authorization removal succeeds but the closeout receipt is lost, GitHub
cannot reconnect through that identity to prove cleanup. The result is
`cleanup_indeterminate`, not success. Readback or remediation then requires a
new exact cleanup Gate and an independently authorized access path.

The workflow cannot delete or prove deletion of GitHub Environment secrets.
It reports `github_cleanup_pending`; deleting the five secrets and reading back
their absence is a later controller action under a separate exact Gate.

## Receipt Classes

Internal durable records and external receipts use exact keys; absent values
are JSON `null`, never omitted or replaced by extra fields.

The claim record keys are:

```text
schemaVersion, type, claimSha256, nonceSha256, workflowCommit, claimedAt
```

Its `schemaVersion` is string `"3"`; `type` is
`japan_tuic_additive_repair_claim`; both digests are lowercase 64-hex strings;
`workflowCommit` is lowercase 40-hex; and `claimedAt` is canonical time.

The backup record keys are:

```text
schemaVersion, type, claimSha256, originalMapSha256, backupSha256,
mode, uid, gid, createdAt
```

Its `schemaVersion` is `"3"`; `type` is
`japan_tuic_additive_repair_backup`; all three digests are lowercase 64-hex;
`mode`, `uid`, and `gid` are nonnegative integers; and `createdAt` is canonical
time.

The journal record keys are:

```text
schemaVersion, type, sequence, phase, claimSha256, workflowCommit,
artifactSha256, preparedAt, updatedAt, backupSha256,
originalMapSha256, applyBoundary, terminalResult, error
```

Its `schemaVersion` is `"3"`; `type` is
`japan_tuic_additive_repair_journal`; `sequence` is a nonnegative integer;
`phase` is one transition-matrix label; `workflowCommit` is lowercase 40-hex;
`artifactSha256` is the frozen lowercase 64-hex digest; timestamps are canonical
strings; digest/time/result/error fields described as nullable are exactly a
validated string or JSON null, never another primitive.

The exact transition matrix is:

```text
prepared -> claimed
claimed -> backup_ready | indeterminate
backup_ready -> apply_intent | indeterminate
apply_intent -> applied | rollback_intent | indeterminate
applied -> observing | rollback_intent | indeterminate
observing -> applied_validated | rollback_intent | indeterminate
rollback_intent -> rolled_back_validated | indeterminate
applied_validated | rolled_back_validated | indeterminate -> no transition
```

`claimSha256` is null only for `prepared`; backup/original digests are non-null
from `backup_ready`; `applyBoundary` is non-null from `apply_intent` through
apply/rollback phases. `terminalResult` is non-null only when phase is
`applied_validated`, `rolled_back_validated`, or `indeterminate`, and must equal
that phase. A terminal record never regresses.

Inspect receipt keys are exactly:

```text
schemaVersion, type, inspectionResult, journalPhase, terminalResult,
candidate, identity, error
```

`inspectionResult` is one of
`ready_unclaimed_revalidation_required`, `claimed_nonterminal`,
`terminal_reconciled`, `indeterminate_reconciled`, or `inspection_blocked`.
`schemaVersion` is `"3"`; `type` is
`japan_tuic_additive_repair_inspection`; `journalPhase` is a phase string or
null; candidate and identity are exact frozen aggregate objects or null; error
is a safe error string or null. `terminal_reconciled` uses terminal result
`applied_validated` or `rolled_back_validated`;
`indeterminate_reconciled` uses `journalPhase=indeterminate` and
`terminalResult=indeterminate` and is never closeout-eligible.

Execute receipt keys are exactly:

```text
schemaVersion, type, productionResult, journalPhase, terminalResult,
closeoutEligible, rollbackVerified, candidate, identity,
naturalObservation, error
```

`productionResult` is one of `applied_validated`, `rolled_back_validated`,
`stopped_pre_claim`, `replay_reconciled`, or `indeterminate`.
`schemaVersion` is `"3"`; `type` is
`japan_tuic_additive_repair_execution`; `journalPhase` and `terminalResult` are
validated strings or null; both eligibility fields are booleans; candidate,
identity, and natural observation are their exact aggregate object schemas or
null; error is a safe error string or null.
`closeoutEligible` is true if and only if the durable journal phase and
`terminalResult` both equal `applied_validated` or both equal
`rolled_back_validated`. A nonterminal `replay_reconciled` never permits
closeout. `rollbackVerified` is true only for `rolled_back_validated`.

Closeout receipt keys are exactly:

```text
schemaVersion, type, closeoutResult, terminalResult,
hostAuthorizationCleanup, githubCleanup, error
```

`closeoutResult` is `authorization_removed`, `cleanup_indeterminate`, or
`closeout_blocked`. `authorization_removed` requires terminal result
`applied_validated` or `rolled_back_validated`, host cleanup `verified`, GitHub
cleanup `pending`, and null error. `cleanup_indeterminate` uses host cleanup
`unknown`; `closeout_blocked` uses `retained`. Neither is reported as success.
`schemaVersion` is `"3"`; `type` is
`japan_tuic_additive_repair_closeout`; `terminalResult` is a validated string
or null; `hostAuthorizationCleanup` is `verified`, `unknown`, or `retained`;
`githubCleanup` is always `pending`; error is a safe error string or null.

### Exact External Receipt Matrix

In the tables below, `candidate` means the exact frozen candidate object;
`before` and `after` mean the exact frozen aggregate Identity Gate objects;
`observation` means the exact validated natural-observation aggregate; and
`safe` means a primitive string from the fixed vocabulary below. No other
object/null combination is accepted.

Inspect receipts use this exact matrix:

| inspectionResult | journalPhase | terminalResult | candidate | identity | error |
| --- | --- | --- | --- | --- | --- |
| `ready_unclaimed_revalidation_required` | null or `prepared` | null | candidate | before | null |
| `claimed_nonterminal` | `prepared`, `claimed`, `backup_ready`, `apply_intent`, `applied`, `observing`, or `rollback_intent` | null | null | null | null |
| `terminal_reconciled` | `applied_validated` | `applied_validated` | null | after | null |
| `terminal_reconciled` | `rolled_back_validated` | `rolled_back_validated` | null | before | null |
| `indeterminate_reconciled` | `indeterminate` | `indeterminate` | null | null | null or safe |
| `inspection_blocked` | null | null | null | null | safe, non-null |

The `claimed_nonterminal`/`prepared` row is the claim-created but journal-not-
yet-advanced crash window. Empty state and unclaimed `prepared` use the ready
row. Any artifact, target, restricted-identity, stable-snapshot,
scratch-cleanup, or current-aggregate validation failure uses the blocked row
with null phase, terminal, and aggregates. In particular, a durable terminal
whose current aggregate no longer matches is blocked, never reconciled.

Execute receipts use this exact matrix:

| productionResult | journalPhase / terminalResult | closeoutEligible | rollbackVerified | candidate | identity | naturalObservation | error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `applied_validated` | `applied_validated` / `applied_validated` | true | false | candidate | after | observation | null |
| `rolled_back_validated` | `rolled_back_validated` / `rolled_back_validated` | true | true | candidate | before | null | safe, non-null |
| `stopped_pre_claim` | null / null or `prepared` / null | false | false | null | null | null | safe, non-null |
| `replay_reconciled` | any claimed nonterminal phase / null, exact applied terminal pair, or exact rolled-back terminal pair | derived from the terminal pair | true only for the rolled-back terminal pair | null | terminal replay uses after/before; nonterminal uses null | null | null |
| `indeterminate` | null / null, any claimed nonterminal phase / null, or `indeterminate` / `indeterminate` | false | false | null | null | null | see below |

Claimed nonterminal phases include `prepared` only for the claim-created crash
window, then `claimed`, `backup_ready`, `apply_intent`, `applied`, `observing`,
and `rollback_intent`. Replay never accepts the indeterminate pair.
`closeoutEligible` is true if and only if the journal/terminal pair is the exact
applied or rolled-back terminal pair. `rollbackVerified` is true if and only if
that pair is the exact rolled-back terminal pair, including terminal replay.
For a durable `indeterminate` pair, error is null or safe; every other
indeterminate shape requires safe non-null error. If terminal replay fails
current aggregate validation, it becomes `indeterminate` with both phase
fields null, both flags false, all aggregate fields null, and the applicable
safe error. The failed receipt never exposes the durable terminal pair and is
never closeout-eligible.

Closeout receipts use this exact matrix:

| closeoutResult | terminalResult | hostAuthorizationCleanup | githubCleanup | error |
| --- | --- | --- | --- | --- |
| `authorization_removed` | `applied_validated` or `rolled_back_validated` | `verified` | `pending` | null |
| `cleanup_indeterminate` | null, `applied_validated`, or `rolled_back_validated` | `unknown` | `pending` | safe, non-null |
| `closeout_blocked` | null, `applied_validated`, `rolled_back_validated`, or `indeterminate` | `retained` | `pending` | safe, non-null |

`closeout_blocked`/`retained` is permitted only when exit `75` proves the
entrypoint body did not run, or the host created no authorization-replacement
temporary, performed no authorization mutation, and readback proves the unique
marker is still present. Once replacement-temporary creation succeeds, or
marker/readback is not exact, every write, fsync, rename, directory-fsync, or
readback failure is `cleanup_indeterminate`/`unknown`; it is never downgraded
to retained.

The operation-specific safe subsets are exact. Inspect blocked permits
`artifact_identity_mismatch`, `backup_failed`, `execution_claim_mismatch`,
`host_lock_busy`, `natural_observation_failed`,
`natural_observation_timeout`, `post_apply_invariant_failed`,
`receipt_validation_failed`, `restricted_identity_rejected`,
`rollback_verification_failed`, `stable_snapshot_unavailable`,
`target_identity_mismatch`, or `workflow_identity_mismatch`. Execute failure
permits that set plus `atomic_apply_failed`, but never
`closeout_receipt_lost` or `host_cleanup_failed`. Closeout
cleanup-indeterminate permits only `closeout_receipt_lost`,
`host_cleanup_failed`, or `receipt_validation_failed`. Closeout blocked permits
only `execution_claim_mismatch`, `host_cleanup_failed`, `host_lock_busy`,
`receipt_validation_failed`, `restricted_identity_rejected`, or
`workflow_identity_mismatch`.

The receipt CLI accepts exact `--operation`, `--input`, and canonical decimal
`--ssh-status` in `0..255`. The input argument is syntactically required, but
status `75` and every other nonzero status must not open or parse it. Status
`75` synthesizes inspect `inspection_blocked`/`host_lock_busy`, execute
`indeterminate`/`host_lock_busy` with null phases and false flags, or closeout
`closeout_blocked`/`host_lock_busy` with null terminal and retained
authorization. Any other nonzero status synthesizes inspect blocked or execute
indeterminate with `receipt_validation_failed`, or closeout
`cleanup_indeterminate`/`unknown` with `closeout_receipt_lost`. No such receipt
is success or closeout-eligible.

Status `0` requires an existing nonempty input no larger than 65536 bytes whose
bytes are exactly UTF-8 canonical JSON followed by one LF byte, with no CR,
prefix, suffix, second line, or additional trailing byte. A missing,
oversized, noncanonical, multiline, invalid, or contradictory input synthesizes
the same operation-specific evidence as other nonzero status without printing
raw input or error. Validated host evidence and synthesized evidence are each
emitted as one canonical JSON line. Invalid CLI shape or status remains a fixed
safe stderr failure and nonzero CLI exit.

The fixed safe error vocabulary is:

```text
artifact_identity_mismatch, atomic_apply_failed, backup_failed,
closeout_receipt_lost, execution_claim_mismatch, host_cleanup_failed,
host_lock_busy, natural_observation_failed, natural_observation_timeout,
post_apply_invariant_failed, receipt_validation_failed,
restricted_identity_rejected, rollback_verification_failed,
stable_snapshot_unavailable, target_identity_mismatch,
workflow_identity_mismatch
```

Canonical timestamps must match `YYYY-MM-DDTHH:mm:ss.sssZ`, parse to a finite
instant, and equal `new Date(value).toISOString()` exactly. Raw nonce, endpoint,
path, SID/account, environment, provider, runtime identity, and raw error text
are forbidden in durable records and receipts.

## Source-Only TDD And Review

Implementation order is:

1. closed frame protocol;
2. durable one-time claim and monotonic journal;
3. direct-mode contract and receipts;
4. crash-durable host operations and runner state machine;
5. manual GitHub workflow and secret ordering;
6. dormant public-identity hygiene and runbook reconciliation.

Each behavior begins with a failing focused test, then minimal implementation,
focused regression, and commit. Before merge, the exact PR head must pass
focused tests, `npm test`, `git diff --check`, GitHub CI, CodeQL/code scanning,
dependency/security checks available to the repository, and independent
security review. A successful source PR remains `not_deployed`.

## Post-Merge Gate Sequence

From successful bootstrap until terminal closeout, `master` is operationally
frozen at the bound merged commit. If `master` advances, all operations stop;
the old commit is not dispatched through an alternate ref. A new exact rebind
Gate must review the intervening commits and update the host binding before
inspection can resume. This keeps repeatable inspection available without
silently trusting a different workflow commit.

1. **Exact CI Identity Bootstrap Gate:** bind the merged workflow commit,
   runner/binding hashes, expected claim digest, host-key/endpoint digests,
   master-only Environment policy, exact five secrets, forced-command entry,
   rollback, and cleanup readback. The initial validation operation is
   `inspect`; no runtime-config write is authorized by bootstrap.
   Installing the binding, authorization, and five secrets nevertheless makes
   `execute` technically reachable to the trusted GitHub operator. The later
   Production Gate is a procedural control, not a separate host arming step.
2. **Repeatable inspect validation:** establish current aggregate state and
   confirm the execution slot is unclaimed. This is monitoring inside this
   repair flow, not a permanent monitoring system.
3. **Exact Quantitative Production Execution Gate:** approve one dispatch of
   `operation=execute` on the bound merged commit and frozen artifact/counts.
   This is a procedural single-operator Gate; the host enforces the closed
   capability and one-time slot, not independent human approval. Execute is
   accepted only for GitHub `run_attempt == 1`; a rerun is rejected. Inspect
   remains repeatable.
4. **Terminal closeout:** run only after a validated terminal receipt. Preserve
   claim, journal, and backup retention evidence.
5. **Exact GitHub cleanup Gate:** delete the five Environment secrets and read
   back absence. A later long-term monitoring workflow, app deployment, or
   control-plane gray release requires its own design and Gate.

## Rejected Alternatives

- **Mandatory offline signature:** stronger authority separation, but rejected
  for this first deployment because the operator selected GitHub-native Mode 1.
- **Second self-controlled GitHub account:** does not create an independent
  human approval boundary.
- **Arbitrary nonce workflow input:** rejected because a fresh nonce would
  bypass the one-time claim.
- **General SSH deployment account:** rejected because it expands capability
  beyond the exact additive repair.
- **Automatic retry after claim:** rejected because a crash may have crossed
  the write boundary.
- **Workflow self-deletion of Environment secrets:** rejected because the
  workflow does not receive GitHub administrative authority.
