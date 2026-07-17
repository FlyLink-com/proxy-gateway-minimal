# GitHub Japan Additive Repair Offline Approval Design

> Status:
> - Type: Superseded source-only redesign retained as historical evidence
> - Superseded by: `docs/superpowers/specs/2026-07-17-github-japan-additive-repair-native-direct-design.md`
> - Design approval: All five sections were explicitly approved by the operator in the active Codex task on 2026-07-16
> - Source baseline: `master@9982d378f93dd506c24c137197293f6942dc45ee`
> - Source change risk: C for this document; B for the future implementation PR; A for credential creation, bootstrap, and production execution
> - Capability: `github-japan-runtime-config-additive-repair-cicd@v2`
> - Release unit: `japan-runtime-config`
> - Production state: `not_deployed`
> - Identity impact: `true`
> - Identity gate: `surface=japan-tuic`, `state=pending`
> - Planned execution Gate: `github-actions-japan-tuic-additive-repair-20260716-002`, `not_approved`
> - Expected PR count: One source-only redesign PR containing this spec, the implementation plan, implementation, tests, and runbook reconciliation
> - Production authority: None. This document does not generate a key, change GitHub settings, access a host, install a runner, create a nonce ledger, dispatch a workflow, mutate runtime config, deploy an application, restart a service, or approve production execution.

## Supersession Boundary

> The operator selected GitHub-native Mode 1 on 2026-07-17. The offline
> signature design below is no longer the active implementation authority.
> Its generated public identity may remain dormant, but the selected workflow
> and runner must not depend on it.

This design supersedes only the approval-enforcement, retry, and credential
cleanup model in
`docs/superpowers/specs/2026-07-16-github-japan-additive-repair-cicd-design.md`
and the matching operational text in `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`.

The earlier design assumed a protected Environment with a required reviewer
distinct from the dispatcher and prevent-self-review enabled. The current
private GitHub Team repository cannot provide that enforcement. The artifact,
source, additive-only mutation, aggregate identity, backup, rollback, natural
observation, output-redaction, and no-application-deploy boundaries remain in
force unless this document explicitly tightens them.

The old bootstrap approval cannot authorize this redesigned model. Every
credential-creation, host, GitHub, or production mutation described here still
requires its new exact Gate.

## Verified GitHub Constraint

Read-only inventory on 2026-07-16 observed:

```yaml
repository_visibility: private
default_branch: master
organization_plan: team
filled_seats: 1
repository_collaborators: 1
environment: vultr-japan-production
environment_protection_rules: 0
environment_branch_policy_present: false
environment_secrets: 0
environment_variables: 0
```

[GitHub documents](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
that required reviewers and prevent-self-review are not available for private
repositories on GitHub Team. Registering a second self-controlled personal
account would not create an independent human control and is not the selected
design. The repository remains private and on the Team plan.

## Decision

GitHub is the execution plane, not the approval authority. A dedicated Ed25519
private key stored only on the operator's encrypted removable drive becomes the
offline approval authority. The production host is the final enforcement
plane: it independently validates the signed approval and atomically consumes
a nonce immediately before the first authorized write phase.

The model is single-operator, dual-authority-domain operation. It is not
described as two-person review. Separation comes from the fact that GitHub,
the dispatcher, the CI SSH credential, and the production host never receive
the signing private key.

The workflow supports a repeatable, read-only `inspect` operation and a signed,
one-time `execute` operation. Inspection, monitoring, signature verification,
artifact verification, stable snapshots, candidate dry-runs, and natural
observation do not consume a write nonce. A production write can be authorized
only once.

## Frozen Production Input

The redesign does not change the reviewed repair input:

```yaml
gate_basis: japan-tuic-identity-additive-repair-20260716-002
planned_execution_gate_id: github-actions-japan-tuic-additive-repair-20260716-002
planned_execution_gate_state: not_approved
release_unit: japan-runtime-config
surface: japan-tuic
strategy: additive_missing_only
tool_source_commit: 47a2a9583fb44cb905e91aade02ae5aa3d635d94
tool_artifact_run: 29495150692
tool_artifact_file: proxy-gateway-control-plane-cumulative-20260716-003.zip
tool_artifact_size_bytes: 4744340
tool_artifact_sha256: d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd
expected:
  add: 3
  remove: 0
  deferred_remove: 27
  changed: 0
  missing_material: 0
  projected_map: 82
```

The artifact is a temporary immutable tool carrier. It is not installed as the
active application, and its manifest release-unit classification does not
expand this production action beyond `japan-runtime-config`.

## Frozen Scope

### Included

- One manual GitHub Actions workflow bound to `vultr-japan-production`.
- A default, repeatable `inspect` operation limited to this repair session.
- A signed, one-time `execute` operation.
- A dedicated offline Ed25519 signing identity on the encrypted removable
  drive.
- A separate temporary CI SSH identity bound to one forced command.
- A root-owned nonce ledger containing nonce SHA-256 identities only.
- A separate root-owned aggregate-only Gate journal for interruption recovery.
- Stable aggregate inventory, candidate dry-run, protected backup, atomic
  additive apply, natural observation, automatic rollback, and bounded
  cleanup.
- TDD, failure injection, redaction tests, exact-head GitHub checks, and
  aggregate production receipts.

### Excluded

- A second GitHub account, GitHub Enterprise, a required reviewer, or a custom
  deployment-protection service.
- A permanent or scheduled production monitoring workflow.
- `control-plane-app`, Portal, Admin, company-site,
  `subscription-rendering`, SGP, or attribution deployment.
- Release-pointer changes, dependency installation on the target, application
  installation, service or timer restart, or manual collector invocation.
- Stale binding deletion or retention resolution.
- Schema, SQLite, database, firewall, DNS, Nginx, systemd, provider, instance,
  network, billing, or account mutation.
- General SSH, PTY, agent forwarding, port forwarding, X11 forwarding, SCP,
  rsync, arbitrary remote commands, or user-controlled host paths.
- Reuse of an operator SSH identity as a CI identity.
- Any signing private key, raw endpoint, host, runtime principal, credential
  reference, protected map, material-store record, raw config, environment
  value, database row, or customer data in GitHub input, logs, artifacts, or
  receipts.

## Trust Architecture

```text
encrypted removable drive
  -> local Ed25519 signer
  -> public signed approval Bundle
  -> workflow_dispatch on exact master
  -> secretless source/artifact preflight and execute-signature validation
  -> vultr-japan-production connection-material boundary
  -> pinned SSH host identity
  -> forced-command framed protocol
  -> host-side signature and immutable-identity validation
  -> repeatable read-only inspection
  -> atomic nonce claim before backup
  -> protected backup and additive-only apply
  -> natural observation, accept or rollback
  -> aggregate terminal receipt
  -> host authorization and GitHub secret cleanup
```

The five Environment secrets remain transport material only:

- `JAPAN_CI_HOST`
- `JAPAN_CI_PORT`
- `JAPAN_CI_USER`
- `JAPAN_CI_PRIVATE_KEY`
- `JAPAN_CI_KNOWN_HOSTS`

The signed approval Bundle is a public `workflow_dispatch` input, not an
Environment secret. The workflow must not echo it because it remains replayable
for read-only inspection and, until expiry and nonce claim, for the approved
write.

## Offline Signing Identity

The production approval key is Ed25519. Its private half is generated directly
on the already approved encrypted removable drive under a future exact local
key-generation Gate. No deliberate persistent copy may be made in the
repository, GitHub, a normal local-disk file, the CI runner, or the production
host.

The signer:

- accepts an explicit private-key path and a closed payload source;
- reads the key into one process only;
- writes only the public Bundle;
- never accepts production SSH material;
- never prints the key path, key bytes, environment, or raw exception;
- zeroes mutable key buffers under its control, drops key-object references,
  and exits without claiming guaranteed operating-system memory erasure; and
- requires operator readback that the removable drive is locked after signing.

The public key and its key ID are safe to publish. The implementation PR must
commit the exact public key and exact key ID; placeholders are forbidden. The
same public key is installed into the root-owned host binding during bootstrap.
The key ID is the lowercase SHA-256 of the SubjectPublicKeyInfo DER bytes.

Loss of the private key fails closed and prevents future write approvals. Key
recovery means generating a replacement under a new Gate, changing the pinned
public identity through a source PR, and rebinding the host under a new
bootstrap Gate. There is no recovery secret or bypass key.

## Signed Approval Protocol

The Bundle schema version is `2`. Its outer JSON object contains exactly:

```json
{
  "payloadBase64Url": "...",
  "signatureBase64Url": "..."
}
```

The Ed25519 signature covers the decoded payload bytes exactly. The verifier
does not reserialize an object before signature verification. This avoids
cross-runtime JSON canonicalization ambiguity. The complete Bundle must be no
larger than 8 KiB.

After signature verification, the decoded payload must be UTF-8 compact JSON
with no insignificant whitespace. Every value is a JSON string. The signer
serializes keys in the table order below; the verifier reconstructs that exact
ordered compact form after parsing and requires byte equality with the signed
payload.

| Key | Exact constraint |
| --- | --- |
| `schemaVersion` | `2` |
| `keyId` | Lowercase SHA-256 of the approved SPKI DER bytes |
| `authorizationClass` | `production_write_once` |
| `gateId` | `github-actions-japan-tuic-additive-repair-20260716-002` |
| `repository` | `gccwebos-com/proxy-gateway-minimal` |
| `ref` | `refs/heads/master` |
| `workflowPath` | `.github/workflows/japan-runtime-config-additive-repair.yml` |
| `workflowCommit` | Exact lowercase 40-hex merged commit approved by the execution Gate |
| `releaseUnit` | `japan-runtime-config` |
| `target` | `vultr-japan-production` |
| `surface` | `japan-tuic` |
| `strategy` | `additive_missing_only` |
| `artifactSourceCommit` | `47a2a9583fb44cb905e91aade02ae5aa3d635d94` |
| `artifactRunId` | `29495150692` |
| `artifactFile` | `proxy-gateway-control-plane-cumulative-20260716-003.zip` |
| `artifactSizeBytes` | `4744340` |
| `artifactSha256` | `d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd` |
| `add` | `3` |
| `remove` | `0` |
| `deferredRemove` | `27` |
| `changed` | `0` |
| `missingMaterial` | `0` |
| `projectedMap` | `82` |
| `approvalNonce` | Cryptographically random 256-bit lowercase hex |
| `issuedAt` | Canonical ISO timestamp |
| `expiresAt` | Canonical ISO timestamp |

Extra or missing keys, duplicate JSON keys, non-canonical Base64URL, an invalid
nonce, an unknown key, a key-ID mismatch, field drift, or a signature mismatch
fails closed.

The write authorization lifetime is at most 30 minutes. Expiry is evaluated in
the secretless preflight and again immediately before nonce claim. Once the
nonce has been claimed, expiry does not interrupt natural observation or force
rollback.

The GitHub run ID does not exist when the offline Bundle is signed and is not a
signed field. The final receipt records `runId` and `runAttempt`. Exact workflow
commit binding, workflow concurrency, the unique signed nonce, and the atomic
host ledger jointly provide one-write semantics across GitHub reruns.

## Workflow Operations

The workflow remains manual and master-only. It has two closed
`workflow_dispatch` operation values and defaults to `inspect`.

### `inspect`

`inspect` is read-only and repeatable within the temporary repair session. It
does not require a current write approval and never claims a nonce. It may:

- validate the workflow, artifact, tree, host runner, and target binding;
- obtain two stable aggregate snapshots;
- run the fixed additive helper without `--apply`;
- inspect aggregate Identity Gate, timer, service, and natural-observation
  state; and
- return the aggregate Gate journal after a claimed execution.

It may not create a backup, change the protected map, roll back, revoke the CI
identity, delete GitHub material, or invoke an arbitrary diagnostic. This
operation is not a permanent monitoring product. It ceases to be available when
the temporary CI identity is cleaned up.

### `execute`

`execute` requires the signed Bundle. GitHub verifies the signature and all
immutable public identities before a step receives SSH material. The host
validates them again using its independently pinned public key and binding.

The host repeats all `inspect` checks. Only a complete match can transition to
nonce claim, backup, and apply. The workflow-level concurrency group remains
non-cancellable and admits only one Japan repair execution at a time. The host
ledger provides the final atomic concurrency decision.

The workflow permissions remain:

```yaml
permissions:
  actions: read
  contents: read
```

There is no push, pull-request, schedule, reusable caller, OIDC write,
repository write, deployment write, package write, or broad GitHub
administration token.

## Framed SSH Protocol And Host Runner

The SSH `authorized_keys` entry ignores `SSH_ORIGINAL_COMMAND` and invokes only
the reviewed forced runner. The stdin protocol has a fixed magic, version,
bounded Bundle length, bounded Bundle bytes, and the frozen ZIP bytes. The
parser rejects trailing control fields, oversized frames, unknown operations,
truncated input, and mismatched artifact length or digest.

The user-visible dispatch enum contains only `inspect` and `execute`. The host
frame enum additionally contains `closeout`, which the workflow constructs
internally only after it has validated a terminal receipt. `closeout` requires
the same signed Bundle, a claimed ledger entry, and a terminal matching Gate
journal; it can remove only the marked CI authorization. It cannot inspect or
change runtime config.

The protocol enum is not a shell command router. It selects only the reviewed
`inspect`, `execute`, or terminal-only `closeout` state machine. No
client-supplied host path, helper path, count, target, strategy, script, or
command is accepted.

Both modes verify the artifact size, SHA-256, ZIP entry set, ZIP entry type,
Git-tree identity, and executable modes before invoking a helper. Temporary
files use Gate-owned mode-`0700` directories and mode-`0600` files. Raw helper
stdout and stderr never cross the forced-command boundary.

## Nonce Ledger And Gate Journal

The nonce ledger directory is root-owned mode `0700`. A ledger entry is named
only by the lowercase SHA-256 of the raw approved nonce and is created
atomically with exclusive-create semantics. Its content does not contain the
raw nonce, a path, endpoint, credential, protected digest, or customer data.

Ledger absence may be checked repeatedly. Immediately before the protected
backup, the runner rechecks approval expiry and atomically creates the entry.
Competing executions may both observe absence, but only one exclusive create
can succeed. A present ledger entry prohibits a new write and produces a
read-only reconciliation result.

Ledger entries are retained for at least 30 days. This repair does not delete
them.

The Gate journal is separate from the ledger. It is a root-owned, atomically
replaced, aggregate-only JSON record keyed to the nonce digest. It may contain
only:

- schema and Gate identity;
- fixed phase and production-result enums;
- approved aggregate counts;
- booleans for nonce claimed, backup created, apply attempted, observation
  passed, rollback verified, and cleanup state; and
- fixed safe error categories.

The journal exists to distinguish retryable pre-claim failures from claimed,
applied, rolled-back, terminal, and indeterminate states after interruption. It
does not become a database or historical identity map and is retained after
closeout.

## State Machine And Failure Handling

### Before nonce claim

Signature, artifact, target, stable-snapshot, or candidate failures stop as
`stopped_pre_claim_retryable`. No backup or protected-map write occurs. The CI
host authorization and five Environment connection secrets remain available so
the operator can repeat `inspect` without another bootstrap. An unexpired
Bundle may be retried after a repeatable check passes.

### At nonce claim

An existing entry or an exclusive-create race loss prohibits mutation and
returns read-only status. A newly created entry is never automatically released.
The next operation is creation of the protected backup.

### After claim, before apply

A backup failure or process interruption is `stopped_after_claim`. The nonce
remains consumed even when the protected map is unchanged. A new production
write requires a new signed Bundle. Read-only inspection remains allowed.

### After apply attempt

Post-apply invariant failure, owner/group/mode drift, natural-observation
failure, timeout, timer/service restart delta, or output-evidence uncertainty
triggers immediate restoration from the Gate-bound backup. A verified restore
is `rolled_back_validated`. An unverified restore is `indeterminate` and stops
all further mutation.

### Successful apply

Success is `applied_validated` only when the post-apply Identity Gate and a new
timer-driven natural observation satisfy every frozen threshold. Because
`stale=27` remains, the final state is `degraded`; neither workflow success nor
`missing=0` may be called healthy or retention-complete.

## Cleanup

Every attempt removes its received artifact and extracted temporary source.

A pre-claim retryable failure must not remove the host CI authorization or the
five Environment connection secrets. Removing them would convert a harmless
inspection failure into a bootstrap loop.

After GitHub validates a terminal `applied_validated` or
`rolled_back_validated` receipt, it opens one second SSH session and sends the
internal `closeout` frame. The host revalidates the Bundle, claimed ledger
entry, and terminal journal before it removes only the marked host authorization
and verifies its absence. The operator-side controller then deletes the five
Environment secrets and reads back name absence. The workflow does not receive
a broad GitHub administration token to delete its own secrets.

If the SSH connection ends before GitHub receives a valid terminal receipt,
the host authorization remains. The operator may rerun `inspect` to read the
aggregate journal and current aggregate state. It must not blindly re-run
`execute`. Indeterminate recovery or cleanup requires a new exact Gate.

The nonce ledger, Gate journal, and protected backup are not deleted by the
temporary-material cleanup.

## Key And Gate Sequence

### 1. Formal design and plan

This document is committed and reviewed first. No credential is generated.

### 2. Offline Signing Key Generation Gate

After the written implementation plan is approved, a separate exact local Gate
may authorize only generation of one Ed25519 private key directly on the
unlocked encrypted removable drive, export of its public key and key ID, process
cleanup readback, and relocking of the drive. It authorizes no GitHub or
production mutation.

### 3. Source-only implementation PR

One TDD PR implements the protocol, commits the public key and key ID, updates
the workflow/contract/runner/tests/runbook, and retains
`production_state: not_deployed`. It does not create a CI SSH identity, write an
Environment secret, access a host, or dispatch the workflow.

All exact-head GitHub CI, CodeQL, code-quality, dependency, code-scanning,
secret-scanning, and vulnerability findings must be complete and non-actionable
before merge.

### 4. Redesigned CI Identity Bootstrap Gate

A new exact Risk A Gate names the merged workflow commit, runner digest,
signing-key ID, target and host-key digests, CI SSH fingerprint, root-owned
binding, ledger/journal identities, five Environment secret names, exact
allowed mutations, cleanup, and readback.

It may install the reviewed runner, public approval key, empty ledger/journal
directories, one marked forced-command SSH authorization, Environment branch
restriction to protected master, and the five connection secrets. It may run
`inspect` only. It may not claim a nonce or change runtime config.

### 5. Quantitative Production Execution Gate

Only after bootstrap `inspect` reproduces the frozen candidate may a separate
exact Risk A Gate approve the planned execution Gate ID, exact workflow commit,
public-key ID, CI fingerprint, endpoint and host-key digests, artifact identity,
counts, backup class, acceptance matrix, rollback, cleanup, and stop conditions.
The operator then signs the Bundle on the removable drive and dispatches
`execute`.

### 6. Later control-plane canary

No result in this design authorizes a `control-plane-app` deploy or canary. That
work remains a separate design and exact Risk A Gate after this repair closes.

## TDD And Verification

### Signature protocol

Test fixtures use a test-only Ed25519 key. Tests cover valid signatures, every
field mutation, wrong public key, wrong key ID, extra and missing fields,
duplicate fields, non-canonical Base64URL, oversized Bundles, invalid nonce,
future issue time, expiry, and TTL greater than 30 minutes. Signer tests prove
that only the Bundle is written and protected input is never echoed.

### Workflow contract

Static tests require manual master-only dispatch, default `inspect`, the exact
two-operation enum, read-only permissions, pinned Actions, secretless preflight,
and Environment access only in the host-bound job. They prove that `inspect`
cannot reach nonce claim, backup, apply, or rollback, and that `execute`
validates the Bundle before any step receives SSH material.

Tests forbid push, pull-request, schedule, reusable callers, OIDC write,
repository/deployment/package write, debug tracing, SCP, rsync, arbitrary remote
commands, service restart, dependency installation on the host, and raw receipt
output.

### Host runner and failure injection

Tests cover framed-input bounds, exact archive identity, inspect zero-write
behavior, atomic nonce races, existing-nonce read-only fallback, pre-claim
credential retention, post-claim interruption, backup failure, apply failure,
observation timeout, verified rollback, indeterminate rollback, atomic journal
updates, disconnected receipt recovery, terminal-only authorization cleanup,
and safe fixed-error redaction.

### Source PR commands

The implementation plan must include focused approval, contract, runner, and
workflow tests followed by:

```text
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
git diff --check origin/master...HEAD
```

The Cloudflare command remains validation/dry-run only and must not deploy.

## Quantitative Acceptance

Bootstrap `inspect` must prove:

```yaml
host_authorization_marker: 1
environment_connection_secrets: 5
nonce_ledger_entries: 0
add: 3
remove: 0
deferred_remove: 27
changed: 0
missing_material: 0
projected_map: 82
production_writes: 0
service_restart_delta: 0
```

An accepted `execute` must prove:

```yaml
nonce_ledger_entries: 0 -> 1
mapped: 52 -> 55
missing: 3 -> 0
stale: 27 -> 27
changed: 0
missing_material: 0
timer_restart_delta: 0
service_restart_delta: 0
natural_observation: passed
identity_state: degraded
host_authorization_marker: 1 -> 0
environment_connection_secrets: 5 -> 0
application_deployments: 0
application_restarts: 0
schema_or_database_mutations: 0
provider_or_network_mutations: 0
```

## Stop Conditions

Stop before mutation for any signature, public-key, workflow, source, artifact,
target, stable-snapshot, candidate, expiry, framing, or redaction mismatch.

Stop after claim without automatic nonce release for backup failure or process
interruption. Roll back only from the Gate-bound backup after an apply attempt.
Stop and escalate for any rollback uncertainty. Preserve the production result
but mark closeout incomplete for host-authorization or GitHub-secret cleanup
failure.

No error, timeout, scan failure, or operator impatience expands the allowed
surface or converts `inspect` into `execute`.

## Design Completion Criteria

This design contains no unresolved production path, endpoint, credential value,
or unbounded recovery behavior. Exact key and host identities are intentionally
outputs of later approved Gates and must be inserted as exact values in the
implementation PR and Gate packets before use.

The next action after this document is committed and reviewed is to write the
TDD implementation plan. It is not key generation, bootstrap, workflow
dispatch, or production execution.
