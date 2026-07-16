# GitHub Japan Additive Repair CI/CD Design

> Status:
> - Type: Approved source-only design for a future Risk A production action
> - Design approval: Confirmed by the operator in the active Codex task on 2026-07-16
> - Source change risk: C for this design document; implementation is B; production execution is A
> - Capability: `github-japan-runtime-config-additive-repair-cicd@v1`
> - Release unit: `japan-runtime-config`
> - Production state: `not_deployed`
> - Identity impact: `true`
> - Identity gate: `surface=japan-tuic`, `state=pending`
> - Expected PR count: One source-only CI/CD PR containing design, implementation, tests, and runbook updates
> - Production authority: None. This document does not create credentials, change GitHub settings, access a host, apply a map, deploy an application, restart a service, or approve production execution.

## Decision

The first GitHub-managed production operation will be a narrowly bounded
`japan-runtime-config` repair. It will apply only the already reviewed
`additive_missing_only` Japan TUIC usage-map candidate and use that operation as
the first quantitative proof of the GitHub production execution path.

The existing `Production Deploy Dry Run` workflow remains non-mutating and
credential-free. A separate manual workflow will own the production execution
lane. Preserving the dry-run lane keeps artifact preparation independent from
production authority and prevents an established safe workflow from silently
acquiring host access.

This phase does not deploy `control-plane-app`, change a release pointer,
restart a service, alter traffic routing, or expose a percentage of customer
traffic. A later control-plane canary requires its own design and exact Risk A
Gate after this runtime-config operation has closed successfully.

## Problem And Current Boundary

The repository has a reviewed additive TUIC map helper and a successful
production dry-run artifact, but its GitHub deployment foundation is
intentionally incomplete:

- `.github/workflows/production-deploy-dry-run.yml` validates and packages but
  never contacts production;
- `vultr-japan-production` currently has no credential, protection rule, or
  deployment branch policy;
- repository secrets are empty;
- the current production action is approved only for additive binding repair,
  not application deployment or service restart.

The project is mature enough to introduce a guarded GitHub production lane,
but maturity does not remove the first-trust problem. GitHub must receive a
dedicated, temporary, non-operator SSH identity, and the target host must bind
that identity to one forced command. Both mutations remain separate exact Risk
A actions.

## Frozen Scope

### Included

- One manual GitHub Actions workflow bound to `vultr-japan-production`.
- A no-credential artifact, artifact Git tree, and workflow-identity preflight.
- A dedicated temporary SSH key that is not an operator key.
- A host-side forced-command runner with no interactive shell.
- Stable aggregate inventory, protected-map backup, atomic additive apply,
  natural collector observation, automatic rollback, and cleanup readback.
- Aggregate-only GitHub job summaries and a production Change Record or Deploy
  Note for `japan-runtime-config`.
- Contract, unit, failure-injection, and redaction tests written before the
  implementation they govern.

### Excluded

- `control-plane-app`, Portal, Admin, company-site, subscription-rendering, SGP,
  or attribution deployment.
- Release pointer changes, application install, dependency install on the
  target, service or timer restart, and manual collector invocation.
- Stale binding deletion or retention resolution.
- Schema, SQLite, firewall, DNS, Nginx, systemd, provider, instance, network,
  billing, or account mutation.
- General SSH, PTY, port forwarding, agent forwarding, SCP subsystems, arbitrary
  remote commands, or reusable deployment-shell access.
- Reuse or upload of an interactive operator private key.
- Raw endpoint, host, UUID, runtime principal, credential reference, protected
  map, material-store record, controller response, environment value, database
  row, customer data, or secret in logs or artifacts.

## Frozen Production Input

The production execution Gate must bind all of the following values:

```yaml
gate_basis: japan-tuic-identity-additive-repair-20260716-002
planned_execution_gate_id: github-actions-japan-tuic-additive-repair-20260716-001
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

The artifact manifest identifies the ZIP as `control-plane-app` because it is a
source package containing the reviewed helper. In this operation the ZIP is a
temporary, immutable tool carrier only. It is not installed as the active
application, no release pointer is changed, and the production mutation remains
`japan-runtime-config`.

The final execution Gate must separately name:

- the workflow-definition commit merged after this design;
- the forced-command runner SHA-256;
- the exact GitHub artifact run and wrapper identity;
- the dedicated CI public-key fingerprint;
- the already established redacted target endpoint and host-key identities;
- the backup and rollback class without exposing paths or contents.

A changed workflow commit, runner digest, artifact identity, target identity,
credential identity, or command set invalidates the Gate.

`gate_basis` preserves the earlier review of source, artifact, and aggregate
counts. It is not CI execution authority. The planned execution Gate ID is a
one-time workflow binding and remains `not_approved` until the later exact Gate
is presented and explicitly approved after CI identity bootstrap.

## Architecture

```text
manual workflow_dispatch on protected master
  -> no-secret workflow, artifact digest, and artifact Git tree preflight
  -> vultr-japan-production environment boundary
  -> required reviewer with prevent self-review
  -> exact run-bound JAPAN_CI_APPROVAL_BUNDLE
  -> temporary dedicated SSH identity
  -> pinned host key
  -> forced-command runner, stdin artifact transport only
  -> stable aggregate dry-run
  -> protected backup
  -> atomic additive apply
  -> natural collector observation window
  -> accept or restore backup
  -> revoke host authorization and remove temporary material
  -> delete GitHub temporary secrets and read back
  -> aggregate-only receipt
```

### 1. Existing Dry-Run Lane

`Production Deploy Dry Run` remains unchanged in authority. It continues to
produce and validate reviewed artifacts without secrets or host access. The new
workflow consumes an explicitly named artifact from an explicitly named run;
it does not rebuild from a moving branch during production execution.

### 2. Production Workflow

The source PR adds a dedicated workflow with these properties:

- trigger: manual `workflow_dispatch` only;
- ref: `refs/heads/master` only;
- environment: `vultr-japan-production`;
- permissions: read-only repository and artifact access only;
- concurrency: one non-cancellable Japan runtime-config execution at a time;
- no `pull_request_target`, scheduled trigger, push-triggered production job,
  reusable caller, OIDC token, repository write, package write, or deployment
  write permission;
- no dispatcher-controlled approval, confirmation, Gate, commit, artifact, or
  target inputs;
- all Actions used by the production workflow are pinned to reviewed immutable
  identities;
- job and individual command timeouts are finite and fail closed;
- debug tracing and raw response output are disabled.

The workflow uses two jobs. `preflight` has no Environment binding and cannot
see production secrets. Only after it validates the frozen artifact and
workflow identities may the dependent `execute` job enter
`vultr-japan-production`. Safe preflight outputs are limited to booleans and
immutable public identities already named by the Gate.

The dispatch is intentionally input-free. Authorization comes only from the
protected Environment and the one-time `JAPAN_CI_APPROVAL_BUNDLE` described
below; typed confirmation text is not authorization.

### 3. CI Identity Bootstrap

An exact bootstrap Gate will authorize one bounded setup session:

1. Generate a new key pair in a restricted temporary local directory.
2. Record only the public-key fingerprint and key type.
3. Install one marked `authorized_keys` entry on the already approved target
   principal. The entry forces the reviewed runner and disables PTY, agent
   forwarding, port forwarding, X11 forwarding, and arbitrary commands.
4. Install the exact runner bytes and verify their SHA-256 and mode.
5. Configure the Environment branch boundary for protected `master`, a
   **required reviewer** distinct from the dispatcher, and **prevent
   self-review**.
6. Store only the five minimum temporary connection secrets: `JAPAN_CI_HOST`,
   `JAPAN_CI_PORT`, `JAPAN_CI_USER`, `JAPAN_CI_PRIVATE_KEY`, and
   `JAPAN_CI_KNOWN_HOSTS`.
7. Remove and verify the local private-key copy after GitHub secret creation.

The bootstrap must stop if the existing target principal cannot run the exact
repair and revoke only its own marked authorization without receiving broader
shell or sudo authority. It must not create a new production user, generic
sudoers rule, daemon, runner service, network rule, or provider resource.

Bootstrap fails closed if GitHub cannot enforce the protected branch, required
reviewer, or prevent self-review controls. Process text or dispatcher-provided
confirmation is not a substitute.

### 3A. One-Time Execution Approval

The dispatcher starts the input-free workflow at the exact reviewed `master`
commit. After the secretless preflight establishes the immutable workflow run,
an approval authority distinct from the dispatcher creates
`JAPAN_CI_APPROVAL_BUNDLE` as the sixth temporary Environment secret. Its
closed JSON object contains exactly `schemaVersion`, `gateId`, `repository`,
`workflowRef`, `workflowCommit`, `runId`, `runAttempt`, `artifactSha256`,
`target`, and `expiresAt`. The expiry may be no more than 30 minutes after
creation.

The required reviewer approves only that pending Environment deployment. The
execute job validates the bundle before reading any connection secret. Exact
`runId` plus `runAttempt` makes the approval single-use: a rerun, edit, stale
commit, different artifact, different target, expired bundle, or extra field
fails closed and requires a new exact Risk A Gate.

### 4. Artifact Transport

The GitHub-hosted runner downloads the already reviewed artifact and sidecars,
checks out the exact source commit independently, then verifies source,
manifest, file name, size, SHA-256, ZIP entry safety, and the canonical artifact
Git tree before any secret-bearing step. Tree verification compares the
archive commit marker, complete path set, Git blob identities, and executable
modes with `47a2a9583fb44cb905e91aade02ae5aa3d635d94`. The same SHA-256 is
rechecked immediately before transport.

The archive is streamed over standard input to the forced command. No SCP,
rsync, remote shell string, or user-controlled destination path is accepted.
The target runner writes only to its Gate-owned temporary directory, verifies
the stream digest again, extracts only the expected source tree, and invokes
the reviewed helper from that temporary tree. It never switches the active
application release.

### 5. Forced-Command Runner

The runner has one operation and no command router. It ignores the SSH client's
requested command and performs the frozen sequence. It accepts no host path,
count, strategy, script, or command override from workflow input.

Sensitive input paths are resolved from reviewed target-local configuration
inside the runner and are never returned. Runner output uses a versioned,
aggregate-only JSON schema. Unknown exceptions map to fixed error categories;
stderr, input content, absolute paths, and command output are not forwarded.

## Quantitative Rollout Model

This runtime-config operation does not expose traffic percentages. Its
progressive rollout unit is the production Gate phase:

| Phase | Production mutation | Promotion criterion |
| --- | ---: | --- |
| Artifact preflight | 0% | All immutable identities agree. |
| Stable target snapshot | 0% | Two aggregate snapshots from one stable generation agree. |
| Candidate dry-run | 0% | Every approved count matches exactly. |
| Protected backup | 0% | Content and owner/mode rollback evidence is complete. |
| Atomic apply | 100% of the approved three additions | One protected-file replacement adds three and changes/removes zero. |
| Natural observation | No additional mutation | A new timer-driven observation satisfies the acceptance matrix. |
| Closeout | No additional mutation | Host and GitHub credential cleanup is verified. |

Splitting the three additions into `1 + 2` is forbidden in v1. It would require
selecting raw principals, create a deliberately incomplete intermediate map,
and expand the approved mutation. The helper's atomic additive candidate is the
smallest safe unit.

## Quantitative Metrics And Thresholds

### Immutable Identity

| Metric | Required value |
| --- | --- |
| Tool source commit | `47a2a9583fb44cb905e91aade02ae5aa3d635d94` |
| Tool artifact run | `29495150692` |
| Tool artifact file | `proxy-gateway-control-plane-cumulative-20260716-003.zip` |
| Tool artifact size | `4744340` bytes |
| Tool artifact SHA-256 | `d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd` |
| Workflow commit | Exact value from the future execution Gate |
| Runner SHA-256 | Exact value from the future bootstrap and execution Gates |
| CI public-key fingerprint | Exact value from the future bootstrap and execution Gates |
| Endpoint and host key | Exact redacted identities from the future execution Gate |

### Stable Pre-Apply Candidate

Two consecutive reports must have the same stable generation and these exact
candidate values:

```yaml
add: 3
remove: 0
deferred_remove: 27
changed: 0
missing_material: 0
projected_map: 82
candidate_ready: true
```

The following before-state values come from the previously reviewed aggregate
Gate packet and satisfy the Identity Gate invariants. They are execution
expectations, not a claim about live state before the workflow observes it:

```yaml
runtime_count: 55
mapped_count: 52
missing: 3
stale: 27
changed: 0
missing_material: 0
derived_map_count: 79
```

If live stable inventory does not reproduce every expected value, the workflow
stops before backup or apply and the old Gate is not retried.

### Apply Invariants

- exactly one protected map file is replaced atomically;
- `add=3`, `remove=0`, `changed=0`, `deferred_remove=27`;
- final projected map count is `82`;
- stale entries remain present;
- final mode is `0600`;
- owner and group match the pre-apply file;
- no application, service, timer, database, or infrastructure identity changes;
- the protected file digest changes exactly once between accepted before and
  after states, without printing either digest if it could become a stable
  protected-material oracle. The receipt records only `changed=true`.

### Post-Apply Identity Gate

The accepted aggregate result is:

```yaml
runtime_count: 55
mapped_count: 55
missing: 0
stale: 27
changed: 0
missing_material: 0
retention_state: pending
state: degraded
```

`state=degraded` is mandatory while stale entries remain. Neither workflow
success nor `missing=0` may be reported as identity healthy or retention
complete.

### Natural Observation Window

The workflow must not invoke the collector service or restart its timer. It
records a pre-apply aggregate baseline and waits for a timer-originated
observation whose timestamp is later than the accepted apply boundary.

Acceptance requires:

- timer remains enabled and active;
- timer and service restart-count deltas remain zero;
- at least one new natural collector invocation is observed;
- `collectorCount` does not fall below or differ from the accepted baseline;
- the Japan TUIC collector reports `unresolvedCount=0`;
- total unresolved count does not increase from the accepted baseline;
- no omitted collector or producer appears;
- aggregate provenance is conserved;
- the existing natural-observation validator returns `passed=true` for the
  approved evidence shape;
- no public/private, protected-identity, or accounting-mode boundary regresses.

The wait budget is `2 * live observed timer interval + 60 seconds`, capped at
12 minutes. The runner derives the interval from read-only live timer metadata
and stops if it cannot obtain one stable positive interval. Historical timer
records are context only and never supply the current interval.

## Backup And Rollback

Before apply, the runner creates a Gate-bound backup of the current protected
map and records only safe booleans and owner/mode equality. The backup is not
uploaded to GitHub and its path, content, digest, identifiers, and record count
are not printed.

Pre-apply failures stop without rollback because no production byte has
changed. After apply, any of the following triggers immediate restoration:

- post-apply count or invariant mismatch;
- owner, group, or mode mismatch;
- target file replacement uncertainty;
- natural observation timeout or failed acceptance;
- timer/service state or restart-count change;
- output-redaction or receipt-validation failure that makes acceptance
  evidence untrustworthy.

Rollback restores only the protected map from the just-created backup. It does
not restart services, delete stale entries, or change adjacent files. After
restore, the runner must prove aggregate counts and owner/mode equal the
accepted before state. An indeterminate rollback is reported as
`rollback_verification_failed` and escalated; it is never labeled successful.

Credential-cleanup failure after a validated apply does not rewrite the map.
The host authorization is revoked first; remaining GitHub cleanup is reported
as an incomplete security closeout requiring a new cleanup Gate.

## Cleanup

The forced runner's `finally` path:

1. removes its Gate-owned extracted source and received artifact;
2. removes only its marked public-key authorization entry;
3. verifies that the marked entry and temporary directory are absent;
4. emits aggregate cleanup booleans only.

The protected backup is intentionally retained for the approved rollback
retention period and is not treated as temporary material.

After the workflow ends, the operator-side controller deletes all six temporary Environment secrets,
including `JAPAN_CI_APPROVAL_BUNDLE`, through a separately
allowed GitHub mutation, then reads back only secret-name absence. The workflow
does not receive a broad GitHub administration token merely so that it can
delete its own secret.

The final receipt distinguishes:

```text
production_result = applied_validated | rolled_back_validated | stopped_pre_apply | indeterminate
host_credential_cleanup = verified | failed
github_credential_cleanup = verified | failed
closeout = complete | incomplete
```

## Failure Handling

Every step fails closed. Fixed safe error categories include:

- `workflow_identity_mismatch`
- `artifact_identity_mismatch`
- `target_identity_mismatch`
- `restricted_identity_rejected`
- `stable_snapshot_unavailable`
- `expected_count_mismatch`
- `backup_failed`
- `atomic_apply_failed`
- `post_apply_invariant_failed`
- `natural_observation_timeout`
- `natural_observation_failed`
- `rollback_verification_failed`
- `host_cleanup_failed`
- `github_cleanup_failed`
- `receipt_validation_failed`

No automatic retry may cross an authentication, identity, snapshot, apply, or
rollback boundary. A stopped or failed production attempt requires a new exact
Gate if any input, command, target, credential, artifact, or runtime assumption
changes.

## Test Strategy

Implementation follows red-green-refactor. The source-only PR must include:

### Workflow Contract Tests

- manual trigger and protected-master guard;
- exact Environment and concurrency binding;
- minimal permissions and no OIDC/write permission;
- immutable artifact and workflow identity checks before secret use;
- no push, schedule, `pull_request_target`, arbitrary reusable caller, or
  uncontrolled input interpolation;
- no general SSH command, SCP, rsync, PTY, service restart, deployment, schema,
  database, provider, or stale-delete command;
- finite timeouts, non-cancellable production concurrency, and aggregate-only
  summary upload;
- all production Actions pinned to immutable identities.

### Runner Unit Tests

- rejects every expected-count drift before writing;
- preserves stale entries and existing bindings;
- adds exactly the missing candidate and atomically replaces the map;
- preserves owner/group and enforces mode `0600`;
- refuses unstable generations, missing material, changed bindings, unsafe
  paths, invalid archive entries, or unknown inputs;
- restores the exact backup after injected apply and observation failures;
- removes only its own marked authorization and temporary directory;
- never echoes protected fixtures, paths, identifiers, stderr, or input.

### Observation Tests

- accepts one genuinely post-apply natural invocation;
- rejects a manually triggered or pre-apply observation;
- rejects collector-count regression, new unresolved results, provenance loss,
  omitted producers, restart deltas, timer-state changes, and deadline expiry;
- preserves a pre-existing unrelated unresolved baseline only when it does not
  increase and Japan TUIC remains zero.

### Required Validation

Before the source PR can become Ready:

```text
git diff --check origin/master...HEAD
targeted workflow and runner tests
npm test
npm run admin:test
npm run admin:build
npm run cloudflare:site:validate
npm run project-state:check
```

GitHub CodeQL, dependency review, code-quality scanning, and repository CI must
complete before the production bootstrap Gate. A successful source CI run is
not production approval.

## Gate Sequence

### Gate 1: Source-Only PR

Authorizes only repository files, tests, and documentation. It creates no
credential or production access and cannot run a production job successfully
while Environment secrets are absent.

### Gate 2: CI Identity Bootstrap

Names the workflow commit, runner digest, target identities, key fingerprint,
Environment secret names, exact GitHub and host mutations, cleanup commands,
and readback. It prohibits provider, instance, network, service, schema,
database, application, and adjacent credential changes.

### Gate 3: Quantitative Production Execution

Names every frozen identity and metric in this design. It authorizes exactly
one manual workflow run and the `additive_missing_only` mutation. It includes
natural observation, automatic map rollback, host authorization revocation,
GitHub secret deletion, and aggregate receipt publication.

The earlier SSH-oriented Gate remains useful evidence for the reviewed source,
artifact, and candidate counts, but it is not reused as CI execution authority
because the access path, credential, workflow, runner, commands, and cleanup
model have changed.

### Gate 4: Control-Plane Canary, Later

Only after this operation has `closeout=complete` may a separate design propose
`control-plane-app` canary deployment. It must define candidate isolation,
traffic exposure, service restart, health windows, rollback, and release
identity independently. Nothing in this design pre-approves that Gate.

## Acceptance Criteria

The first GitHub production verification is complete only when:

1. the source-only PR is merged with all required checks passing;
2. both production Gates are approved with exact immutable identities;
3. the workflow performs no mutation before a stable exact candidate exists;
4. apply adds three, removes zero, changes zero, and preserves 27 stale entries;
5. post-apply Identity Gate has `missing=0`, `stale=27`, and `state=degraded`;
6. at least one bounded natural observation passes without a restart or manual
   collector invocation;
7. either the applied state or restored backup is independently validated;
8. host authorization and GitHub temporary secrets are absent on readback;
9. logs and artifacts contain only approved aggregate evidence;
10. a short production Change Record records source, artifact, target class,
    backup, before/after Identity Gate, retention state, validation, rollback
    result, and cleanup result without protected material.

If any item is false or indeterminate, the operation is not complete and no
control-plane canary Gate is submitted.
