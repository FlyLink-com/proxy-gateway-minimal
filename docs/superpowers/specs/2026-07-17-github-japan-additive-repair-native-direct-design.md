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
> - Production authority: None. This source-only document does not install
>   anything, make a network request, access or mutate GitHub, use SSH, dispatch
>   a workflow, access production, mutate runtime config, deploy an application,
>   restart a service, or approve production execution.

## Supersession Boundary

This design supersedes the mandatory offline-signature architecture in
`docs/superpowers/specs/2026-07-16-github-japan-additive-repair-offline-approval-design.md`
and its implementation plan. The earlier public Ed25519 key and key ID remain
dormant outside this source-only PR. In particular,
`config/japan-production-approval-ed25519-public.pem` and
`config/japan-production-approval-ed25519-key-id.txt` are excluded inputs and
outputs: this work must not open, stat, hash, parse, existence-check, add,
modify, delete, stage, commit, use as a test fixture, or treat either file as a
prerequisite. Neither the Mode 1 workflow nor the production runner may name,
reference, load, verify, or otherwise depend on either file. The offline
private key remains outside the repository and is not accessed, copied,
rotated, or deleted by this work; offline signing remains dormant rather than
an execution dependency.

The frozen artifact, additive-only mutation, aggregate Identity Gate, backup,
rollback, natural observation, output-redaction, and no-application-deploy
boundaries remain unchanged. No earlier CI Identity Bootstrap Gate or execution approval is
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

The policy in this section supersedes every earlier root-only-final-owner,
`trusted_root_concurrency_not_machine_proven`, incomplete code-closure, and
marker-only authorization formulation for this design. The root-owned,
same-FD-validated binding is authoritative for CI Identity Bootstrap
Gate-observed final-file
metadata; the sole writer residual is
`bound_writer_concurrency_not_machine_proven`.

The later CI Identity Bootstrap Gate installs a dedicated SSH public key whose
canonical `authorized_keys` line invokes one exact noninteractive `sudo -n`
command and begins with this exact option sequence:

```text
restrict,no-pty,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,command="/usr/bin/sudo -n -- /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint"
```

No client-controlled path or command is accepted. The principal receives no
general shell, PTY, SCP, rsync, sudo expansion, forwarding, service control,
provider access, or unrelated file access. The fixed dedicated sudoers file
permits only the no-argument absolute entrypoint, uses the exact empty argument
marker `""`, `env_reset`, no `SETENV`, and exact `secure_path`.

### Fixed Installed Closure

Installed paths are exactly:

```text
bootstrap    /usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs
entrypoint   /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint
runner       /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs
contract     /usr/local/libexec/gccgw/japan-tuic-additive-repair-contract.mjs
frame        /usr/local/libexec/gccgw/japan-tuic-additive-repair-frame.mjs
state        /usr/local/libexec/gccgw/japan-tuic-additive-repair-state.mjs
binding      /etc/gccgw/japan-tuic-additive-repair-binding.json
state-dir    /var/lib/gccgw/japan-tuic-additive-repair
backup       /var/lib/gccgw/japan-tuic-additive-repair/backups
temporary    /var/lib/gccgw/japan-tuic-additive-repair/tmp
lock         /var/lib/gccgw/japan-tuic-additive-repair/repair.lock
auth-file    /etc/ssh/authorized_keys/gccgw-japan-repair-ci
account-home /var/lib/gccgw-japan-repair-ci
login-shell  /usr/bin/dash
sudoers      /etc/sudoers.d/gccgw-japan-repair-ci
```

The entrypoint is a root:root regular file, mode `0755`, `nlink=1`. Bootstrap,
contract, frame, runner, and state are root:root regular files, mode `0644`,
`nlink=1`. The binding is root:root regular, mode `0600`, `nlink=1`.
State/backup/temporary are root:root directories with exact mode `0700`. The
lock is pre-created by the CI Identity Bootstrap Gate as root:root regular mode
`0600`, `nlink=1`;
`flock` never creates it. The authorization file is root:root regular mode
`0600`, `nlink=1`, beneath a root-controlled component chain. The account is
exactly `gccgw-japan-repair-ci`; its home is the fixed root:root mode-`0755`
directory and its shell is the fixed root:root regular `/usr/bin/dash`, mode
`0755`, `nlink=1`, with an exact SHA-256. The principal cannot modify its
home, `.ssh`, effective authorization file, or an alternate authorization
source. The dedicated sudoers file is root:root regular mode `0440`,
`nlink=1`, with an exact content SHA-256.

The fixed entrypoint bytes are exactly eight physical lines:

```sh
#!/usr/bin/dash
set -eu
exec /usr/bin/env -i LANG=C.UTF-8 PATH=/usr/bin:/bin \
  /usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 \
  /var/lib/gccgw/japan-tuic-additive-repair/repair.lock \
  /usr/bin/node --disable-proto=throw --import=/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs \
  /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs \
  --binding /etc/gccgw/japan-tuic-additive-repair-binding.json
```

The preload specifier, main runner, and binding path are literal. The entrypoint
has one `exec`, one nonblocking lock, no caller-controlled command or argument,
and no `$SSH_ORIGINAL_COMMAND` use.

The CI Identity Bootstrap Gate stages and same-FD validates its zero-byte
rollback transient first, installs the non-authorization code/tool/path/
account/sudo closure, and stages the exact one-line candidate. A full candidate
snapshot proves live `0/0` plus staged future `1/1` and derives the binding;
only after binding readback does the Gate atomically install those already
validated candidate bytes as its final authorization mutation. A second full
installed snapshot immediately proves live `1/1`. On every post-add failure,
the first rollback mutation atomically installs and fsyncs the already
validated zero-byte transient and proves readback, followed by removal and
parent-directory fsync of the exact dedicated sudoers file.

The pre-import TCB is the kernel/filesystem and trusted root boundary, the
already executing sudo/dash/env/flock/Node chain, the exact entrypoint bytes,
the exact bootstrap preload bytes, and Node's reviewed builtin loader/runtime
base. The bootstrap independently verifies runner, contract, frame, and state
from the binding and the same opened descriptors before Node evaluates the
runner main graph. Runtime checks of the already executing entrypoint,
bootstrap, Node, or other pre-import tools are defense in depth and cannot be
cited as self-authorization. Installation-time same-FD readback plus protected
root-only ancestry is the authority for those already executing TCB bytes.
Before opening authority data the preload requires Linux, numeric EUID `0`, the
exact fixed main/binding argument shape, no `NODE_OPTIONS` or `NODE_PATH` own
property, and no nonempty `SSH_ORIGINAL_COMMAND`. It loads only the fixed
root:root mode-`0600` canonical schema-3 binding through the bounded same-FD
reader and rejects before application evaluation on any invocation, binding,
path, metadata, size, EOF, or digest mismatch.
The preload's normative scope ends at canonical binding/code-envelope parsing
and same-FD verification of the four application modules. It does not derive
SSH or sudo policy, attest tool capabilities or writer inventory, parse frames,
or perform host operations. Those full checks remain in the CI Identity
Bootstrap Gate and the runner validator before their respective authority
surfaces.

### Canonical Schema 3 Binding

Top-level keys and serialization order are exactly:

```text
schemaVersion, gateId, expectedEuid, expectedWorkflowCommit,
expectedNonceSha256, expectedClaimSha256, codeManifest, toolManifest,
sshAuthorization, sudoAuthorization, paths, pathPolicies, units,
writerFreeze, authorizationMarker
```

`schemaVersion="3"`; Gate and nonce digest are the exact V3 constants;
`expectedEuid=0`; workflow commit is primitive lowercase 40-hex. The claim
digest is recomputed from that commit plus the fixed Gate, nonce, artifact,
release unit, strategy, surface, and target.

`codeManifest` keys are exactly
`bootstrap, contract, entrypoint, frame, runner, state` in that order. Every
value has exact key order
`path, sizeBytes, sha256, type, uid, gid, mode, nlink`, uses its fixed path and
metadata, has positive safe-integer size and `type="file"`, and binds a
primitive lowercase 64-hex SHA-256 derived from the exact merged commit.
Entrypoint is at most 16384 bytes; bootstrap is at most 65536 bytes; contract,
frame, runner, and state are each at most 1048576 bytes. The CI Identity
Bootstrap Gate verifies all six installed roles before authorization. At
runtime the bootstrap independently verifies the four not-yet-evaluated
application modules from the canonical binding before Node evaluates the main
graph.

A syntax-aware source test enumerates all six code roles, every static import,
and every dynamic-code/module-loader surface. Bootstrap may statically import
only the exact reviewed `node:` builtin allowlist and has no local static
import, `import()`, CommonJS `require`, `createRequire`, `node:module`, loader
registration, `eval`, or `Function`. The application closure is exactly
runner/contract/frame/state; its static imports may be only the reviewed exact
`node:` builtin allowlist or one of those relative manifest paths. Bare
packages, absolute/file/data URLs, query/hash specifiers, unlisted local
modules, and every other loader or dynamic-code surface are rejected.

The total JavaScript `import()` count across bootstrap, runner, contract,
frame, and state is exactly one: the already frozen runner callsite that
imports `scripts/traffic-accounting-natural-observation.mjs` from the verified
artifact extraction root. It is allowed only after exact artifact
size/hash/central-directory-manifest/safe-extraction validation and remains
under that separate artifact authority. Every other dynamic import is
rejected.

`toolManifest` keys are exactly, in this order:

```text
dash, env, flock, getent, id, node, sudo, systemctl, unzip, visudo
```

Their fixed paths are:

```text
dash      /usr/bin/dash
env       /usr/bin/env
flock     /usr/bin/flock
getent    /usr/bin/getent
id        /usr/bin/id
node      /usr/bin/node
sudo      /usr/bin/sudo
systemctl /usr/bin/systemctl
unzip     /usr/bin/unzip
visudo    /usr/sbin/visudo
```

Every value has exact order
`path, sizeBytes, sha256, type, uid, gid, mode, nlink, capabilitySha256`; it
binds a root:root regular file, positive safe-integer size no greater than
268435456 bytes, lowercase content SHA-256, and lowercase SHA-256 of the raw
`security.capability` value, hashing empty bytes when absent. `sudo` alone
has mode `04755`; every other one of the nine entries has mode `0755`; every entry has
`nlink=1` and no file capability. Entrypoint bytes begin exactly
`#!/usr/bin/dash`. Symlinks, alternate resolved paths, package binaries, and
metadata/digest drift block the CI Identity Bootstrap Gate. The root-owned
OS/runtime/library base
beneath those binaries remains an explicit platform trust boundary.

The schema-3 Gate matrix is therefore six code roles by ten tool roles. A
missing or alternate `getent`/`id`, or any
content, metadata, path, mode, link, or capability drift in either role,
blocks before authorization. Each full candidate, installed, runtime-installed,
or removed snapshot traverses all six code and ten tool entries. Immediate
same-FD pre-exec validation of a bound `getent`, `id`, or `visudo` role is an
additional validation and is not hidden in a full-manifest count.

#### Native authority operations and projection boundary

Production authority exports accept exactly one semantic input and never
accept caller operations:

```js
attestBootstrapCandidateRunnerBinding(input) -> canonicalSchema3Binding
attestBootstrapInstalledRunnerBinding(input) -> canonicalSchema3Binding
attestRuntimeAuthorizationBinding(input) -> canonicalSchema3Binding
attestRemovedAuthorization(input) -> { authorizationRemoved: true }
```

They reject any second argument before native factory creation. Each export
internally calls exactly one matching module-private factory:

```js
createNativeBootstrapAggregateOperations() -> brandedBootstrapOperations
createNativeRuntimeAggregateOperations() -> brandedRuntimeOperations
createNativeRemovedAggregateOperations() -> brandedRemovedOperations
```

Each factory closes over reviewed `node:` builtins and fixed constants,
constructs the path/source/account/process/capability/writer methods itself,
recursively freezes its object, and registers that exact object identity in a
module-private `WeakSet`. Bootstrap operations have exact internal keys
`effectiveUid,pathOperations,sourceOperations,accountOperations,
capabilityOperations,writerOperations`; runtime and removed operations have
exact keys `effectiveUid,pathOperations,sourceOperations,accountOperations`.
No public function brands a caller object. A second argument, shape-identical
object, clone, Proxy, subclass, inherited or extra key, missing key, wrong
authority brand, or capability/writer lookalike rejects before its first
operation.

Raw injected operations remain only on explicitly non-authority projections:

```js
collectBoundAccountEvidence(binding, { accountOperations })
buildCanonicalSshIncludeClosure({ pathOperations, sourceOperations })
buildCanonicalSshMatchCoverage(projectedAccountCore, { pathOperations, sourceOperations })
buildCanonicalSshTopology(projectedAccountCore, binding, { pathOperations, sourceOperations })
buildCanonicalSudoSourceClosure({ pathOperations, sourceOperations })
buildCanonicalSudoEffectivePolicy(projectedAccountCore, { pathOperations, sourceOperations })
```

Those builders reject semantic claims such as source bytes, files, hashes,
ordinals, coordinates, dispositions, rules, aliases, Defaults, tags, counts,
or effective values. They return synthetic projection records that no
authority export accepts. Authority integration tests may replace reviewed
low-level builtin adapters only at module-evaluation time in an isolated
VM/test harness. Production has no setter, factory argument, environment
selector, frame field, binding field, callback, or overload for injected
operations. Public SSH/sudo projections may traverse a graph when directly
tested, but no authority path composes their independent observations.

#### Bound native account producer and private state brands

The sole account is `gccgw-japan-repair-ci`. Native authority derives its
account core from one fixed six-call, shell-free sequence in this exact order:

```text
1 /usr/bin/getent ["passwd", "gccgw-japan-repair-ci"]
2 /usr/bin/getent ["shadow", "gccgw-japan-repair-ci"]
3 /usr/bin/id     ["-u", "--", "gccgw-japan-repair-ci"]
4 /usr/bin/id     ["-g", "--", "gccgw-japan-repair-ci"]
5 /usr/bin/id     ["-G", "--", "gccgw-japan-repair-ci"]
6 /usr/bin/id     ["-G", "-n", "--", "gccgw-japan-repair-ci"]
```

Immediately before every call the factory same-FD revalidates the matching
bound tool. Calls use `shell:false`, `cwd:"/"`, binary output,
`timeout:5000`, `maxBuffer:65536`, no inherited stdio, and exact environment
insertion order `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, `PATH=/usr/bin:/bin`.
Success requires integer status `0`, signal `null`, empty stderr, one bounded
stdout record, and no execution error. The spawn reopens the fixed executable;
Node has no builtin `fexecve`, so this is immediate descriptor validation plus
the explicit bound-root/tool-reopen residual, not same-FD execution.

Passwd and shadow records are delimiter-scanned over their original Buffers.
At most one final LF is removed by index; CR, NUL, a second line, or wrong
field count rejects. Passwd has exactly seven colon ranges and shadow exactly
nine. The implementation never calls `toString`, `TextDecoder`, JSON,
formatting, or interpolation on whole passwd/shadow records, password fields,
GECOS, shadow remainder, stderr, or unsafe `id` output. It decodes only
grammar-validated username, uid, primary gid, home, shell, and selected safe
group tokens. Password lock is derived only from a nonempty shadow password
range beginning with `!` or equal to one byte `*`. Every owning Buffer that
may contain account, authorization, SSH, sudo, basename, preimage, or child
output bytes is registered at allocation and filled with zero in LIFO
`finally` cleanup on success and failure; non-owning `subarray` views never
outlive their owner.

The exact account core keys are
`username,uid,homeDirectory,loginShell,passwordLocked,primaryGroupId,
groupIds,groupNames`. `id -G` and `id -G -n` must have equal nonzero counts,
but positions are never paired. `groupIds` and `groupNames` are independent
canonical sets. `groupIds` is the independently unique,
ascending positive-safe-integer set; `groupNames` is the independently unique
raw-byte-sorted set matching `^[a-z_][a-z0-9_.-]{0,63}$`. Each set contains at
most 256 items, primary gid occurs exactly once in `groupIds`, and two account
observations must have byte-identical canonical scalar and independent set
values even when incidental `id` order differs. The recursively frozen core
has its own private brand. Account-derived group names are transient Match/
sudo selector inputs only; they are never serialized, hashed, logged, copied
into binding/topology/coverage/receipt evidence, or represented as a positional
ID/name mapping. Canonical SSH coverage emits only unique ascending numeric `groupIds`;
source-authored Group patterns exist only in the private coverage preimage
whose digest is retained.

Candidate, installed, and removed authorization evidence use three separate
private brands around a valid account core. Candidate proves live
authorization `0/0` and staged authorization `1/1` with line/blob digests;
installed proves live `1/1` with matching line/blob digests; removed proves a
present zero-byte live authorization file with `0/0`, no line/blob digest, and
`dedicatedSudoersFileAbsent:true`. No caller may select or brand a state.
Each candidate, installed, or removed snapshot calls `readAccount()` exactly
twice: once before any authorization/source read and once after both source
graphs plus the fixed syntax check. One snapshot therefore performs 12 helper
calls and 12 immediate `getent`/`id` role validations, then shares the first
core only after the second observation proves stability.

#### Shared source order, directory handling, and bounded work

Each SSH or sudo graph starts at its fixed root and expands Include events as
depth-first textual insertion. A file receives its first-discovery `ordinal`
only after a successful same-FD open, bounded full read, confirmed EOF,
post-fstat, exactly-once close, and hash, immediately before parsing its
physical lines. The first-discovery `files` Array is the global encoded-path
seen set: a bounded linear scan of `files[*].path` rejects a second discovery,
without allocating a second `Set` container. An `activePaths` stack rejects
cycles before descent. Parser scope crosses child insertion and is not restored
per file.

For SSH final-component globbing and sudo includedir, the parser derives one
canonical literal parent path, trusted-opens it with `0xB0000` as a root-owned,
nonsymlink, non-group/other-writable directory, calls path-based
`readDirectory(path)` exactly once while its fd is open, validates every raw
Buffer basename before filtering, filters and sorts with `Buffer.compare`,
same-FD validates every selected child, then post-fstats and closes the
directory exactly once. This proves the bound-root/writer model plus selected
file identity, not race-free enumeration against malicious root
replace-and-restore.

`readDirectory` returns only an Array of raw Buffer basenames, each `1..255`
bytes, without NUL or `/`, not `.`/`..`, and with fatal UTF-8 exact re-encode.
Duplicate raw identities, non-Buffers, or malformed arrays reject before
filtering. SSH leading-dot and glob rules are applied by the parser. Sudo
ignores names containing `.` or ending `~`; after a fully validated directory
enumeration, zero surviving sudo names is a valid empty textual insertion in
candidate, installed, and removed modes.

Exact independent parser maxima are: `1048576` bytes per file, `16777216`
source bytes per graph, `256` closure files, include depth `32` with root
counted, `16384` physical-line bytes excluding LF, `4096` raw basenames per
directory call, `65536` raw basenames per graph, `256` tokens per line, and
`4096` bytes per general token unless a smaller bound applies. SSH additionally
allows `64` Include patterns, `4096` Match branches, `9` conditions per branch,
`64` patterns per condition, and `255` bytes per Match pattern. Sudo allows
`256` User_Alias definitions, `256` members per alias, `4096` alias-expansion
nodes, `4096` user specs, `256` User_List members per spec, `256` command specs
per spec, and `64` Defaults items per statement. An account has at most `256`
groups. Violations reject before the next inspection, retention, allocation,
or comparison; nothing is truncated or partially emitted.

Every aggregate snapshot creates a new counter object before its first
authorization/SSH/sudo parser allocation. SSH and sudo share that object, but
the two Bootstrap snapshots and two closeout snapshots never share counters.
Before constructing, copying, pushing, or inserting any named retained node,
the exact reserve computes every affected safe-integer next value, rejects
without mutation if a per-kind, per-graph, or snapshot limit would be crossed,
then commits counters before allocation. Allocation failure rejects the whole
snapshot and allowance is not reused.

The exhaustive semantic-node ontology is:

- shared: `fixedEnvelope` (maximum `32` per snapshot), `sourceFile`, and
  `authorizationEntry`;
- SSH: `sshPhysicalDirective`, `sshIncludePattern`,
  `sshSelectedInsertion`, `sshMatchBranch`, `sshMatchCondition`,
  `sshMatchPattern`, `sshAssignment`, and `sshAcceptEnvName`; and
- sudo: `sudoStatement`, `sudoInclude`, `sudoSelectedInsertion`,
  `sudoAliasDefinition`, `sudoAliasMember`, `sudoDefaultsItem`,
  `sudoUserSpec`, `sudoUserHostRunasMember`, `sudoTagTransition`,
  `sudoCommandSpec`, `sudoArgumentToken`, `sudoAliasEdge`, and
  `sudoAliasMemoEntry`.

Each physical directive/statement charges before dispatch; each child,
pattern, condition, assignment, alias/member/edge/memo, Defaults item,
selector/RunAs atom, tag, command, or argument charges before its exact object,
copy, Array push, Map/Set insertion, or traversal-stack retention. A structure
with two listed meanings charges both. Generic token/AST objects are forbidden.
Raw bytes, delimiter indexes, blank/comments, and comparisons are not nodes and
use their dedicated byte/work counters. A node referenced twice remains one
object; copying it charges another node.

Exact aggregate ceilings include `131072` semantic nodes per SSH graph,
`131072` per sudo graph, and the lower shared ceiling `131072` across every
fixed/shared/authorization/SSH/sudo node in one snapshot. Other exact limits
are `65536` glob basename-pattern comparisons per graph, `4194304` wildcard
pattern bytes, `131072` wildcard invocations, `16777216` aligned wildcard
comparisons, `131072` SSH Match account-target comparisons, `65536` sudo
selector comparisons, `16384` sudo command records, `16384` User_Alias edges,
`32768` memoized alias visits, `4194304` canonical bytes per preimage, and
`8388608` retained preimage bytes per snapshot. Canonical emission first runs
an allocation-free exact UTF-8 JSON punctuation/escaping/value/LF measurement,
reserves both preimage budgets, then allocates and verifies the resulting
length. The cumulative snapshot preimage counter never decrements after hash
and zeroization.

The aligned wildcard-comparison ceiling also charges each aligned owning
value-byte comparison used to reject a duplicate SSH Match syntax tuple during
semantic emission, before the duplicate pattern node is retained. The new
pattern compares only with earlier retained pattern events for the same
condition; no raw-range or delimiter rescan is used.

Wildcard pattern bytes are capped at exactly `4194304` per snapshot.

The one shared wildcard grammar permits `?` and zero or one literal `*`.
Pattern validation is one allocation-free left-to-right scan, reserves before
each inspected byte, stores only `starIndex`, and rejects a second or
consecutive star. A match reserves one invocation. With no star, unequal
lengths fail with zero aligned comparisons; equal lengths scan once from the
start. With one star, targets shorter than prefix plus suffix fail with zero
aligned comparisons; otherwise the matcher scans the prefix forward and
suffix backward, reserving each aligned comparison. `?` consumes one byte and
`*` consumes the entire nonoverlapping middle, including zero bytes. No index
is reset or rescanned; there is no regex, recursion, retry/backtracking,
star-retry state, substring, or compiled automaton.

Alias memoization is scoped to one sudo graph after private account-core brand
validation. It uses a function-local
`WeakMap<brandedAccountCore, Map<aliasName,stateOrResult>>`; the outer and
inner Maps charge fixed envelopes, absent aliases charge a memo node before
the first insertion, every resolution charges an alias visit, every edge is
charged before traversal, `visiting` detects cycles, and resolved booleans may
be reused only from that inner Map. `finally` drops every reference. No
account-core or group-name digest is computed, so a later branded core cannot
reuse earlier applicability.

#### Frozen SSH parser and effective-policy rules

SSH roots at `/etc/ssh/sshd_config`. Relative Include paths resolve against
`/etc/ssh`, not the including file. Include is accepted only in global scope;
after any `Match`, including one reached through a child insertion, every
later Include rejects. Include operands are processed left to right. Only `*`
and `?` in the final component are supported; wildcard parents, `[]`,
backslash, braces, `~`, `%`, and `**` reject. A leading dot needs a literal
leading dot; zero glob matches, missing literal files, selected non-files,
duplicates, cycles, or invalid encodings reject.

SSH source is fatal UTF-8 with no BOM, CR, NUL, continuation, quote,
backslash, inline comment, `keyword=value`, empty token, Unicode whitespace,
or non-ASCII directive/Include/Match token. LF splits physical lines and one
final unterminated line is accepted. ASCII space/tab separate tokens; blank
and first-nonseparator-`#` lines are ignored. A directive name matches
`[A-Za-z][A-Za-z0-9]*`, canonicalizes lowercase, and requires an argument.
Unknown directives reject. The reviewed global opaque allowlist remains the
one listed below in this design; opaque directives reject in Match scope.

Match condition names are exactly `user,group,host,address,localaddress,
localport,rdomain,localnetwork,all`. `Match all` is sole and remains Match
scope. Other names occur once, carry one nonempty comma list, and preserve
printable-ASCII case-sensitive pattern bytes. One leading `!` is supported;
`!!`, classes, escapes, controls, whitespace, comma-in-value, and duplicates
reject. User and Group evaluate positive/negative wildcard patterns against
the exact username and transient independent `groupNames` set. Numeric-looking
Group patterns still match names, never GIDs. User and Group are conjunctive;
any resolved false makes a branch `disjoint`, even with variable dimensions.
`all`, or resolved-true User/Group without a variable dimension, is
`exact_user`. Otherwise any host/address/local dimension rejects as unresolved;
`Host *` remains variable.

Match coverage branch `ordinal` is the zero-based encounter counter and the
only total order. `sourceOrdinal` is the source file first-discovery ordinal
and `lineNumber` its one-based physical line. They must resolve to the actual
closure item and parsed Match event, but are provenance only and are not
lexicographically monotonic; a child `(1,5)` may precede a later root `(0,20)`.
Native authority retains the complete coverage and source Group patterns only
in a private canonical preimage; topology/binding retain only its digest.

The one depth-first event stream uses two separate first-value tables. Before
the first Match, only the first global scalar assignment is retained. Across
`exact_user` branches in branch-ordinal order, only the first applicable Match
assignment is retained. Match wins over global, then the frozen default.
Disjoint branches contribute nothing; unresolved branches reject. `AcceptEnv`
is additive and any applicable token fails the required empty result.
`KbdInteractiveAuthentication` and `ChallengeResponseAuthentication` share
one slot. Frozen defaults are: authentication methods `any`; pubkey/password/
keyboard-interactive true; hostbased/GSSAPI/Kerberos/user-environment false;
accepted env empty; force command/chroot `none`; forwarding false; tunnel
false; authorized-key compiled default unresolved; other key/principal/CA
sources `none`. Final safety still requires publickey-only, password and
keyboard false, forwarding disabled, tunnel false, the explicit fixed one-file
authorization source, and no alternate command/principal/CA/environment path.

#### Frozen sudo parser, native syntax check, and rule semantics

The sudo graph roots at `/etc/sudoers`. Exact Include forms are `#include`,
`@include`, `#includedir`, and `@includedir` followed by one canonical absolute
operand and no quote, escape, glob, variable, trailing token, or inline
comment. Direct and directory insertions are depth-first. Missing/unreadable/
replaced/ambiguous paths reject; a fully validated includedir with no surviving
names is an exact empty insertion.

The shared projection seam calls `validateSudoers` only as
`validateSudoers("/usr/sbin/visudo", Object.freeze(["-cf","/etc/sudoers"]))`
and requires exact own `{status:0,signal:null}`. SSH and the sudo closure
projection call it zero times; a sudo effective projection or aggregate
candidate/installed/removed snapshot calls it exactly once. Native authority
uses its private branded method, same-FD revalidates the bound visudo entry,
then executes exactly:

```js
spawnSync("/usr/sbin/visudo", ["-cf", "/etc/sudoers"], {
  shell: false,
  cwd: "/",
  env: {
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: "/usr/sbin:/usr/bin:/sbin:/bin"
  },
  encoding: null,
  timeout: 5000,
  maxBuffer: 65536,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"]
})
```

Success uses only no execution error, integer status `0`, and signal `null`;
stdout/stderr are never decoded or consulted. Captures and temporary Buffers
are zeroed in `finally` on all paths and only a two-key internal receipt or
sanitized rejection is exposed. The spawn reopens the path, so the explicit
bound-root/tool-reopen residual applies.

Before sudo statement allocation, one allocation-free physical-line scan
rejects single quote `0x27` and backslash `0x5c` anywhere. Double quote
`0x22` is lexically eligible only as adjacent `""` or inside the complete
exact token `secure_path="/usr/sbin:/usr/bin:/sbin:/bin"`; the full parser
must then consume that pair as the complete arguments or Defaults token.
Everything else rejects. The exact byte grammar is:

```text
NAME        = %x61-7a *( %x61-7a / DIGIT / "_" / "." / "-" )
ALIAS       = %x41-5a *( %x41-5a / DIGIT / "_" )
UINT        = 1*DIGIT
USER-MEMBER = NAME / "#" UINT / "%" NAME / "%#" UINT / "ALL" / ALIAS
USER-LIST   = USER-MEMBER *( h "," h USER-MEMBER )
RUNAS-ATOM  = NAME / "#" UINT / "ALL"
RUNAS-SPEC  = "(" h RUNAS-ATOM [ h ":" h RUNAS-ATOM ] h ")"
TAG         = "NOPASSWD:" / "PASSWD:" / "SETENV:" / "NOSETENV:"
SAFE-COMMAND-BYTE = %x21 / %x24-26 / %x28-2b / %x2d-39 /
                    %x3b-5b / %x5d-7e
ABS-COMMAND = "/" 1*SAFE-COMMAND-BYTE
ARG-TOKEN   = 1*SAFE-COMMAND-BYTE
ARGUMENTS   = "\"\"" / ARG-TOKEN *( h1 ARG-TOKEN )
COMMAND     = "ALL" / ABS-COMMAND [ h1 ARGUMENTS ]
CMND-SPEC   = [ RUNAS-SPEC h ] *( TAG h ) COMMAND
CMND-LIST   = CMND-SPEC *( h "," h CMND-SPEC )
USER-SPEC   = USER-LIST h1 "ALL" h "=" h CMND-LIST
USER-ALIAS  = "User_Alias" h1 ALIAS h "=" h USER-LIST
DEFAULT-ITEM = "env_reset" / "!env_reset" /
               "secure_path=\"/usr/sbin:/usr/bin:/sbin:/bin\""
DEFAULTS    = "Defaults" h1 DEFAULT-ITEM *( h "," h DEFAULT-ITEM )
```

Here `H` is ASCII space/tab, `h` zero or more, `h1` one or more, and every
production consumes the physical line through optional valid trailing comment
and EOL. The safe byte class excludes quote, `#`, single quote, comma, colon,
backslash, whitespace, controls, and non-ASCII. Line dispatch gives exact
include prefixes priority; `#` plus digit begins a numeric-uid USER-SPEC,
other leading `#` is a full-line comment, and malformed include-looking
prefixes reject. Inline comment is allowed only after a complete Defaults,
User_Alias, or command list and at least one separator.

RunAs and tags are source-ordered per command list. Initial RunAs is `default`,
password tag `PASSWD`, and setenv tag `NOSETENV`; explicit values replace only
their family and persist across comma-separated commands. Every command spec
records its source/line/index, explicit and effective state, command kind, and
argument state before account applicability.

Positive User_List members are literal username, `#uid`, `%group`, `%#gid`,
`ALL`, or defined positive uppercase `User_Alias`. User_Alias definitions are
collected before resolution for forward references; duplicate, undefined,
cyclic, cross-namespace, negated, wildcard, or over-budget expansion rejects.
Aliases only derive account applicability. The sole accepted grant must name
literal `gccgw-japan-repair-ci`; applicable alias/uid/group/gid/ALL grants are
`otherRule`s. Host, RunAs, and command aliases reject.

Only source-ordered global `env_reset`, `!env_reset`, and exact secure path are
supported; last assignment wins and final values must be `env_reset=true` plus
the exact path. Scoped/unknown Defaults, `+=`, and `-=` reject. The one matched
command spec must originate in the dedicated file and be exactly:

```text
gccgw-japan-repair-ci ALL=(root:root) NOPASSWD: /usr/local/libexec/gccgw/japan-tuic-additive-repair-entrypoint ""
```

That file contains only blank/comments plus that one semantic line. The parser
fully consumes every supported spec before applicability. `matchedRuleCount`
counts exact command specs; `otherRuleCount` counts every other command spec
in every applicable supported user spec regardless of command path. Unresolved
applicability rejects before counting. Success requires exact `1/0` installed
counts; the removed verifier requires `0/0`, absent dedicated path, and safe
remaining Defaults/source graph.

`sshAuthorization` keys are exactly:

```text
algorithm, authorizedKeysFile, authorizedKeysLineSha256,
effectiveConfigSha256, homeDirectory, homeDirectoryPolicy, loginShell,
loginShellPolicy, publicKeyBlobSha256, uid, username
```

`algorithm="ssh-ed25519"`; `authorizedKeysFile` equals
`paths.authorizedKeys`; line SHA-256 covers the exact canonical ASCII line
without its LF; blob SHA-256 covers the decoded OpenSSH public-key blob; and
`effectiveConfigSha256` covers the canonical aggregate topology below. `uid`
is a positive safe integer, username is exactly `gccgw-japan-repair-ci`, and
home/shell equal the fixed paths. `homeDirectoryPolicy` keys are exactly
`type,uid,gid,mode,nlink` with values directory/root/root/`0755`/null.
`loginShellPolicy` keys are exactly `type,uid,gid,mode,nlink,sha256` with
values file/root/root/`0755`/`1` plus one lowercase 64-hex digest. The CI
Identity Bootstrap Gate
binds exact passwd uid/home/shell, proves the home chain root-controlled,
proves the principal cannot replace an authorization source, and proves one
occurrence of the public key and canonical line. Login-shell projection is
exact: `loginShell === toolManifest.dash.path`, and login-shell
type/uid/gid/mode/nlink/SHA equal the dash entry. Dash `sizeBytes` and
`capabilitySha256` remain validated by the full tool-manifest entry and are not
fields of `loginShellPolicy`.

The account is exclusive to this repair identity for the bounded lifecycle.
Its effective authorization file has exactly one active nonblank/noncomment
entry: the canonical bound line. Its password is locked and its complete
per-account sshd policy is public-key-only. Password, keyboard-interactive,
host-based, GSSAPI, Kerberos, TrustedUserCAKeys,
AuthorizedPrincipalsFile/Command, AuthorizedKeysCommand, additional
AuthorizedKeysFile expansion, and address/host-dependent authorization
branches are disabled or absent. `PermitUserEnvironment` is false and the
accepted client-environment name set is empty. The CI Identity Bootstrap Gate
rejects an unresolved
Include, Match, or conditional branch instead of sampling one `sshd -T -C`
tuple.

The canonical aggregate SSH topology has exact key order:

```text
schemaVersion, type, username, uid, homeDirectory, loginShell,
passwordLocked, authenticationMethods, pubkeyAuthentication,
passwordAuthentication, keyboardInteractiveAuthentication,
hostbasedAuthentication, gssapiAuthentication, kerberosAuthentication,
permitUserEnvironment, acceptedEnvironmentNames,
forceCommand, chrootDirectory,
disableForwarding, permitTunnel,
authorizedKeysFiles, authorizedKeysCommand, authorizedPrincipalsFiles,
authorizedPrincipalsCommand, trustedUserCAKeys,
activeAuthorizationEntryCount, targetKeyOccurrenceCount,
addressDependentAuthorizationBranchCount, includeClosureSha256,
matchCoverageSha256
```

Fixed values are schema `1`, type
`japan_ci_ssh_authorization_topology`, the binding account fields,
`passwordLocked=true`, `authenticationMethods=["publickey"]`,
`pubkeyAuthentication=true`, every other named authentication boolean false,
`permitUserEnvironment=false`, `acceptedEnvironmentNames=[]`,
`forceCommand="none"`, `chrootDirectory="none"`,
`disableForwarding=true`, `permitTunnel=false`,
`authorizedKeysFiles=[authorizedKeysFile]`, both command fields `"none"`, both
principals/CA arrays empty, both entry/key counts `1`, address-dependent branch
count `0`, and lowercase 64-hex closure/coverage digests.
`effectiveConfigSha256` is the SHA-256 of UTF-8
`JSON.stringify(canonicalTopology) + "\n"`. The CI Identity Bootstrap Gate and
Task 8 closeout use
the same reviewed parser/builder and exact bytes. The Include/Match builder
derives global, Include, account-applicable Match-scoped, and default effective
values for ForceCommand, ChrootDirectory, DisableForwarding, and PermitTunnel.
Any effective session command or chroot other than `none`, any effective
forwarding permission, or any effective tunnel permission blocks the CI
Identity Bootstrap Gate and
closeout so the authorized-key command and fixed absolute host paths remain the
execution authority. Default/explicit deny, global allow, Match-scoped allow,
and unresolved-conditional fixtures are mandatory. Per-key `restrict` and
no-forwarding options remain defense in depth and never substitute for the
account-effective `disableForwarding=true` and `permitTunnel=false` values.

`includeClosureSha256` is derived only from a canonical Include-closure record
with exact keys `schemaVersion, type, rootConfig, files`. Files remain in
resolved OpenSSH expansion order; each item has exact keys
`ordinal, path, sha256, uid, gid, mode, nlink`. Paths are canonical absolute;
every file is root-owned, regular, `nlink=1`, and not group/other writable.
Globs use OpenSSH bytewise lexical expansion. Missing includes, duplicate
canonical paths, cycles, ambiguous encoding, or unresolved expansion fail.
Canonical bytes are UTF-8 `JSON.stringify(record) + "\n"`.

The shared source-closure builder uses `schemaVersion="1"`; type is exactly
`japan_ci_sshd_source_closure` for SSH and
`japan_ci_sudo_source_closure` for sudo. SSH `rootConfig` is exactly
`/etc/ssh/sshd_config`; sudo `rootConfig` is exactly `/etc/sudoers`. Each file
is at most 1 MiB; every ancestor and final inode passes the trusted-path
algorithm; and content is hashed only from the verified descriptor with the
bounded read-to-confirmed-EOF algorithm. Both subsystems reuse the exact shared
file-item builder and JSON+LF serializer; only native expansion order differs.
The builders are operations-driven from the two fixed roots: SSH resolves
native directive/pattern/glob/source order, while sudo resolves native
`include`/`includedir` order and applies the reviewed filename rules. Directory
entries are raw bytes, validated for canonical fatal-UTF-8 round trip, and
sorted bytewise where the native grammar requires it. Missing, duplicate,
cyclic, ambiguous, unsupported, or unresolved expansion fails. SSH glob
zero-match fails; a fully enumerated sudo includedir with zero surviving names
is the frozen empty insertion and does not fail merely for being empty.
Callers cannot submit file lists, ordinals, metadata, bytes, digests, or a
claimed expansion order.

`matchCoverageSha256` is derived only from a canonical Match-coverage record
with exact keys `schemaVersion, type, username, groupIds, branches`. Numeric
group IDs are unique ascending. Branches stay in Include/source order and have
exact keys `ordinal, sourceOrdinal, lineNumber, conditions,
accountDisposition, variableDimensions`; normalized condition tokens retain
directive order. Disposition is only `disjoint` or `exact_user`. A branch that
can match the bound user/group is `exact_user` with an empty variable-dimension
array. Any unresolved host/address/local-address/local-port/group/user negation
or other context dimension fails. The topology builder derives both digests
from these canonical records; callers cannot inject them.
`accountDisposition`, branch order, source coordinates, variable dimensions,
and effective values are parser output, never caller assertions. Disposition is
derived from OpenSSH positive/negative/wildcard User and Group semantics using
the exact bound username and transient independent canonical `groupNames` set;
no GID/name positional mapping exists. Each source coordinate must belong to
the derived closure and name an actual Match line. Branch `ordinal` alone is
strict encounter order; `(sourceOrdinal,lineNumber)` is provenance and need
not be lexicographically monotonic. Global/default/applicable-Match first-value semantics derive every
authentication, authorization, environment, ForceCommand, ChrootDirectory,
DisableForwarding, and PermitTunnel field before comparison to the frozen safe
topology.

The Match record uses `schemaVersion="1"` and exact type
`japan_ci_sshd_match_coverage`. Every `conditions` element has exact keys
`name, patterns`; `name` is one lowercase literal from `user, group, host,
address, localaddress, localport, rdomain, localnetwork, all`, occurs at most
once per branch, and remains in source order. Each pattern has exact keys
`negated, value`; `negated` is boolean and `value` is a nonempty printable
ASCII token with no whitespace, comma, backslash, control byte, or Unicode
normalization. Literal `*` and `?` wildcard bytes are preserved; duplicate
name/pattern pairs fail. `patterns` is always an explicit JSON array. Condition
`all` has exact object shape `{name:"all", patterns:[]}` and exact no-space
`JSON.stringify` bytes `{"name":"all","patterns":[]}`; every other condition
has at least one pattern. `variableDimensions` is unique and fixed-order
`host, address, localaddress, localport, rdomain, localnetwork`, containing
only dimensions present. Unsupported names, ambiguous negation, escapes, or
unparsable wildcard semantics fail closed.

### Canonical Sudo Authorization

`sudoAuthorization` has exact key order:

```text
schemaVersion, type, username, uid, sudoersFile, sudoersFileSha256,
command, commandArguments, runAsUid, runAsGid, nonInteractive,
nopasswd, envReset, setenvAllowed, securePath, otherRuleCount,
sourceClosureSha256, effectivePolicySha256
```

It binds schema `1`, type `japan_ci_sudo_authorization`, the exact SSH account,
fixed sudoers file, fixed entrypoint command, `commandArguments=[]`, run-as
uid/gid `0`, `nonInteractive=true`, `nopasswd=true`, `envReset=true`,
`setenvAllowed=false`, exact secure path
`/usr/sbin:/usr/bin:/sbin:/bin`, and `otherRuleCount=0`. The command
specification uses the exact empty argument marker `""`. Wildcards, argument
variation, applicability of the accepted grant through an alias, alternate
RunAs, another effective rule, SETENV, or broad sudo are rejected. Positive
User_Alias definitions are resolved only to determine applicability; Host,
RunAs, and command aliases reject.

The sudo source-closure record has exact keys `schemaVersion, type, rootConfig,
files`; files use the SSH Include closure's ordered
`ordinal, path, sha256, uid, gid, mode, nlink` item schema with sudoers include
order and duplicate/cycle/unresolved-include rejection. The effective-policy
record has exact keys `schemaVersion, type, username, uid, command,
commandArguments, runAsUid, runAsGid, nonInteractive, nopasswd, envReset,
setenvAllowed, securePath, matchedRuleCount, otherRuleCount,
sourceClosureSha256`, with exact expected values, matched count `1`, and other
count `0`. Both digests cover canonical JSON+LF built by the reviewed parser.
Exact `visudo -cf` success is necessary but never substitutes for semantic
comparison. The CI Identity Bootstrap Gate and Task 8 recompute both records.
The effective-policy record uses `schemaVersion="1"` and exact type
`japan_ci_sudo_effective_policy`; its source-closure digest is derived by the
shared trusted-read builder, never accepted as caller input.
The parser, not the caller, derives the one empty-argument command rule,
RunAs, NOPASSWD/noninteractive tags, env_reset, SETENV prohibition,
secure_path, positive User_Alias applicability, matched-rule count, and
other-rule count from the same trusted closure. Every other command spec in an
applicable supported user spec is counted regardless of command path.
Caller-supplied semantic booleans, counts, rule arrays, or effective-policy
digests are not evidence.

#### Aggregate authorization snapshots and lifecycle totals

Each private candidate, installed, or removed snapshot performs exactly:

1. its full schema-3, six-code, ten-tool, fixed-path validation;
2. first six-call `readAccount` plus six immediate bound-tool validations;
3. state-specific same-FD authorization read or reads;
4. one depth-first SSH graph and derivation;
5. one depth-first sudo graph and derivation;
6. one native fixed `visudo -cf /etc/sudoers` after immediate bound-tool
   validation;
7. second six-call `readAccount` plus six immediate validations; and
8. stable account/set comparison, state predicate, canonical digest
   comparison, and only then any authority callback or return.

Candidate validates every nonderived binding field and derives only the frozen
SSH/sudo digest slots. Installed validates the complete installed binding.
Removed validates the same binding and every still-installed path, changing
only two predicates: the fixed authorization file is present as exact zero
bytes and the binding-named dedicated sudoers path is absent. Candidate reads
live zero bytes plus the fixed staged future line; installed reads one live
line; removed reads live zero bytes. No snapshot makes a second graph
observation or calls a public projection.

The fixed transient paths are:

```text
candidate     /var/lib/gccgw/japan-tuic-additive-repair/tmp/bootstrap-authorization-candidate
rollback-zero /var/lib/gccgw/japan-tuic-additive-repair/tmp/bootstrap-authorization-rollback-zero
```

Each is exclusive-created with no-follow semantics under the already bound
root:root mode-`0700` temporary root, is root:root regular mode `0600`,
`nlink=1`, written/fsynced/re-read/EOF/post-fstat validated through its creation
fd, closed exactly once, then followed by temporary-root fsync. Candidate bytes
are the exact canonical line plus LF; rollback bytes are exactly zero. Neither
transient path nor bytes enter binding or receipts. Candidate topology
substitutes the staged bytes only for the logical fixed authorization source;
every other live source/account/coordinate remains unchanged, so the future
and installed topology preimages are identical only when those exact staged
bytes are atomically installed.

The later Bootstrap Gate holds the exclusive lock, creates and validates the
zero-byte rollback transient first, installs all non-authorization closure
including sudoers, stages the candidate, then calls
`attestBootstrapCandidateRunnerBinding` to prove live `0/0`, staged future
`1/1`, future SSH topology, sudo `1/0`, account, ten tools, capabilities,
writers, and visudo. It installs and same-FD reads back that derived binding,
then as the last authorization mutation atomically renames the already
validated candidate over the live authorization file and fsyncs the parent.
It immediately calls `attestBootstrapInstalledRunnerBinding` to prove live
`1/1` and matching line/blob/topology/sudo facts. No copied, regenerated,
caller-supplied, or separately reopened candidate bytes are accepted.

Failure before the final rename leaves live authorization at zero and removes
both transients before rolling back non-authorization closure. On every failure
after the rename, the first rollback mutation atomically renames the already
validated zero-byte rollback transient over the live authorization file,
fsyncs its parent, and proves zero-byte readback before any sudoers/code/
binding rollback. Failure or ambiguity in that first mutation is indeterminate,
not rolled back.

Candidate plus installed success totals are exact: two snapshots; four
`readAccount`; 24 helper executions plus 24 immediate `getent`/`id`
validations; two SSH graphs; two sudo graphs; two visudo executions plus two
immediate validations; two full six-code traversals with 12 code items; two
full ten-tool traversals with 20 tool items; two capability matrices; two
writer inventories; three authorization reads (live-zero, staged-one,
live-one); and zero public projection calls. Transient cleanup is not a third
snapshot.

`validateRunnerBinding(input,{effectiveUid,pathOperations})` remains the
two-key baseline context and must not claim account/SSH/sudo/xattr freshness.
Before Tasks 5-8 cross an authority surface, the direct-mode runner also calls
`attestRuntimeAuthorizationBinding`, which revalidates all ten tools and
recomputes one installed aggregate snapshot. Runtime proof is always freshly
derived at that use boundary.

Task 8 closeout uses exactly one installed snapshot immediately before its
first authorization mutation and one removed snapshot after both durable
mutations. The installed snapshot proves key `1/1`, sudo `1/0`, account, and
both safe graphs. Closeout then exclusive-creates and same-FD validates the
same fixed zero-byte transient, atomically replaces the live authorization
file, fsyncs its parent, proves zero-byte readback, only then unlinks the exact
dedicated sudoers path and fsyncs that parent. The removed snapshot requires
the same stable account under its separate brand, present zero-byte live
authorization with `0/0` and no line/blob digest, exact no-follow sudoers
absence, safe remaining SSH and sudo graphs, sudo counts `0/0`, and native
visudo success. A zero-survivor `/etc/sudoers.d` includedir is valid. Only
`attestRemovedAuthorization` may return `{authorizationRemoved:true}`.

Installed plus removed closeout totals are exact: four `readAccount`; 24
helper executions and 24 immediate validations; two SSH graphs; two sudo
graphs; two visudo executions and two immediate validations; two full six-code
and two full ten-tool traversals; two live authorization reads; zero
capability matrices; zero writer inventories; and zero public projection
calls. The persistent zero-byte authorization identity plus absent dedicated
sudoers path is the retryable removed state. File absence, marker count, a
prior digest, visudo alone, or an installed collector weakened to accept zero
is never terminal evidence.

Raw sshd/sudoers/authorized-key/passwd/shadow/GECOS/password/helper output,
group names or pairs, basenames, Include/Match tokens, aliases, Defaults, user
specs, tags, command lists, visudo/helper stderr, operation errors, fds,
inode/device values, unredacted source paths, and canonical private preimages
must never enter bindings, receipts, workflow output, logs, artifacts,
exceptions, failure text, or test diagnostics. Task 4C adds no receipt field.
Authority returns only already approved safe primitive fields, fixed counts,
and digests.

`paths` keys and order are exactly:

```text
authorizedKeys, backupDirectory, currentMap, lockFile, materialStore,
mihomoConfig, naturalObservation, producerStatus, stateDirectory,
sudoersFile, temporaryRoot
```

Every path is a distinct canonical POSIX absolute primitive string; fixed
authorization/state/backup/temporary/lock/sudoers paths equal the values above.
Each path must survive strict UTF-8 encode/decode round trip exactly; unpaired
surrogates and any two distinct JavaScript strings with the same encoded path
bytes are rejected. Valid non-ASCII scalar values remain permitted when their
encoded byte identities are distinct.
`pathPolicies` has the same keys/order. Every policy value has exact key order
`type, uid, gid, mode, nlink`: uid/gid/mode are nonnegative safe integers;
mode is permission bits only in `0..0777` with no group/other write; files use
`type="file"`, integer `nlink=1`; directories use `type="directory"`, JSON
`nlink=null`. Directory null is an explicit not-bound sentinel: observed lstat
and fstat link counts must each be positive BigInts and equal during one
validation, but are not compared to null. File policies cannot use null and
continue to require exact integer `1`. Fixed roles cannot be relaxed by binding
data.

`sudoersFile` is root:root regular mode `0440`, `nlink=1`, and its exact
content SHA-256 equals `sudoAuthorization.sudoersFileSha256`.

`currentMap` is regular, `nlink=1`, exact mode `0600`, with uid/gid frozen by
the CI Identity Bootstrap Gate. Material store, Mihomo config, natural
observation, and producer status are regular files with `nlink=1`; the Gate
freezes exact observed
uid/gid/mode. Their mode is exactly `0400` or `0600`: owner-only readable,
non-executable, and never group/other accessible. The Gate stops on any other
observed mode and does not normalize live metadata; a separate
permission-hardening Gate is required before the CI Identity Bootstrap Gate can
resume.

The root-owned, same-FD binding is authority for observed final uid/gid/mode,
not client input. Every ancestor remains root-owned and non-writable by
group/other. A non-root final owner is permitted only when the role minimum and
exact Gate policy both pass. Writer inventory enumerates every OS
principal with target write capability and every known service/timer/process
writer, proves known active writers quiesced, and binds aggregate-only evidence.
`writerFreeze` keys/order are `knownWriterCount, evidenceSha256, residualRisk`
with exact values `0`, one lowercase 64-hex digest, and
`bound_writer_concurrency_not_machine_proven`. The count covers known active
writers; it does not claim owner-write permission vanished. The residual
explicitly covers unobserved root or bound-owner same-inode mutation.
Writer evidence is operations-derived from every owner-write policy, the exact
bound service and timer, and every known writer process. A caller-provided zero
count, role list, inactive flag, or evidence digest is not accepted as proof;
missing/duplicate/unknown coverage or any active known writer fails.

`units` keys/order are exactly `service, timer` with frozen values.
`authorizationMarker` remains the unique safe marker. One named canonical
builder emits every nested object in the order above; binding bytes are exactly
UTF-8 `JSON.stringify(canonicalBinding) + "\n"`.

Schema 1 parsing remains only in a separately named private legacy validator
used by the isolated v1 local-test helper through Task 8. Exported
`validateRunnerBinding` accepts schema 3 only and has no v1 fallback.

### Trusted Path And Same-FD Reads

`validateTrustedPathChain(path, policy, operations, consumeOpened?)` is
synchronous and fail-closed:

1. require canonical POSIX absolute lexical form;
2. use production bigint stats and `lstat` `/` plus each cumulative component
   exactly once; every ancestor is a uid-0 nonsymlink directory without
   group/other write;
3. validate final lstat type and exact uid/gid/mode. For a file, require policy
   and observed `nlink=1` and reject null. For a directory, require policy
   `nlink=null` and a positive BigInt observed nlink without comparing it to
   null;
4. open with `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, plus `O_DIRECTORY` for a
   directory;
5. `fstat` with bigint stats, repeat final policy, and require exact bigint
   dev+ino equality with lstat. File nlink remains exact `1`; directory nlink
   is a positive BigInt equal to the lstat directory nlink;
6. call synchronous `consumeOpened(fd, openedStats)` before close when supplied;
   it consumes only that verified fd and never closes it;
7. fstat after consumption, repeat the complete final type/uid/gid/mode/nlink
   policy including directory-null sentinel semantics, and require unchanged
   dev, ino, and size; and
8. close exactly once in `finally` after every successful open. Close failure
   fails closed even when an earlier operation also failed.

Code/tool manifest modes compare the low 12 Unix permission/special bits.
Every non-sudo code/tool rejects setuid, setgid, and sticky bits; sudo requires
setuid and rejects setgid/sticky drift. Runtime `pathPolicies` compare only the
low 9 permission bits: the policy must be `mode <= 0777` and
`(mode & 0022) === 0`, and both observed stats must satisfy
`(mode & 07000) === 0`; every special bit rejects independently of the low-nine
comparison.

Native Linux operations require exact audited constants `O_RDONLY=0x00000`,
`O_DIRECTORY=0x10000`, `O_NOFOLLOW=0x20000`, and `O_CLOEXEC=0x80000`.
File opens therefore use `0xA0000` and directory opens use `0xB0000`. A missing
or drifted required constant, or a non-Linux native platform, fails closed; no
fallback substitutes zero. Windows tests inject the audited constants and
assert these numeric bitsets independently of the host `fs.constants`, plus an
explicit missing/drifted-constant rejection matrix.

The injected operations contract is exactly `lstat, open, fstat, read, close`.
`read(fd, buffer, offset, length, position)` writes only into the supplied
Buffer slice and returns an integer byte count. Consumers position-read from
zero, continue positive short reads, retry only `EINTR`, require a real
zero-byte EOF, and reject as soon as limit+1 bytes would be observed. Counts
outside `0..length`, wrong-fd use, or any other read shape fail closed. All
path/stat/open/read/consume/close errors expose only
`restricted_identity_rejected`.

`loadRootOwnedBinding({ path, effectiveUid, pathOperations })` accepts only the
fixed binding path, verifies fixed metadata with the trusted-path algorithm,
and reads that same fd. Binding fstat size is `1..65536`; accumulated bytes
must equal it and reach confirmed EOF. Fatal UTF-8 plus exact canonical
JSON-and-one-LF comparison rejects BOM, CR, duplicate/reordered keys, prefix,
suffix, second line, invalid UTF-8, and trailing bytes. Path-based
`stat`/`readFile` is forbidden.

`validateRunnerBinding(input, context)` requires exact context keys
`effectiveUid, pathOperations` and
`input.expectedEuid === context.effectiveUid === 0` numerically. It validates
all six code-manifest files, all ten tool-manifest files, login-shell
equality, and every binding path against policy before any operation. The CI
Identity Bootstrap Gate does the same before authorization. Every file is read from its verified
descriptor under its role ceiling. Same-FD fstat size must equal manifest
`sizeBytes`; readers consume exactly that many bytes and confirm zero-byte EOF
before SHA-256 comparison. Early EOF, size mismatch, ceiling+1, and a trailing
byte fail closed. Runtime coverage includes the already executed entrypoint as
defense in depth. The preload independently parses the fixed canonical binding
and same-FD validates runner, contract, frame, and state before their root
evaluation; it must not call/import the runner validator or trust a caller
assertion. Its runtime checks of entrypoint/bootstrap are drift evidence only.
The CI Identity Bootstrap Gate's install-time readback remains authority for
the already executing TCB bytes.

`capabilitySha256` is a CI Identity Bootstrap Gate-only native same-FD
`fgetxattr` attestation because Node has no built-in same-FD xattr API. The Gate
maps only
absent `ENODATA`/`ENOATTR` to SHA-256 of zero bytes and fails every other
error. Runtime makes no claim to revalidate xattrs; it still checks every
tool's path/content/type/uid/gid/mode/nlink. A capability change remains inside
the explicit trusted host-root/capability residual.
The dry-run matrix binds the exact already opened descriptor and covers both
absence codes, nonempty bytes, wrong fd, unsupported/error codes, non-Buffer
returns, a 65536-byte nonempty value rejected as unexpected, a 65537-byte value
rejected as oversize, and digest mismatch. Only absence may produce the empty
digest; none of the other cases can be treated as absence or silently skipped.

Initial binding validation never replaces use-time validation. Tasks 5-8
re-open and fstat each protected file immediately before every read, helper
spawn, backup, apply, restore, observation, or authorization replacement.
Owner-writable inputs also receive immediate pre/post digests. A helper that
reopens a pathname remains inside the explicit bound-writer residual and is
never described as race-free.

### Pre-Migration CLI And Authorization Parser

The wrapper's `/usr/bin/env -i` is the production environment boundary.
Direct/injected Node checks are defense in depth: before binding load,
operations-factory creation, stdin/artifact read, or output, reject own-property
`NODE_OPTIONS` or `NODE_PATH` even when empty and reject any nonempty
`SSH_ORIGINAL_COMMAND`, including whitespace-only. Only framed stdin selects
an operation; environment and argv never do.

Until Task 8, direct runner invocation emits zero stdout, exact stderr bytes
`{"schemaVersion":"3","type":"japan_tuic_additive_repair_pre_migration","error":"restricted_identity_rejected"}\n`,
and exits exactly `1`, with zero binding-load, operations-factory, stdin-read,
or legacy-helper calls. The source entrypoint remains uninstalled. The CI
Identity Bootstrap Gate and workflow dispatch are prohibited until Task 8 removes the v1 path and
atomically enables the strict frame CLI.

The shared Task 8 `authorized_keys` parser is bounded to one 16384-byte ASCII
line plus one LF and rejects CR, NUL, extra lines/tokens, duplicate options,
escapes, and unknown options. It requires the exact option sequence shown
above, then `ssh-ed25519`, one canonical base64 token, and the exact terminal
marker. Decode/re-encode reproduces the token exactly. The decoded SSH wire
blob contains exact length-prefixed `ssh-ed25519`, one 32-byte Ed25519 key, and
EOF. Both line token and embedded algorithm match before blob and line SHA-256
comparison. The parser never evaluates options or shell text.

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

The host root boundary and root-owned binding are trusted. The runner cannot
prove that an unobserved root process or the binding's exact non-root final
owner will never mutate the same inode concurrently. The CI Identity Bootstrap
Gate inventory
and exact Production Gate enumerate every principal with write capability and
every known service/timer/process writer, prove known active writers quiesced,
and bind that aggregate evidence for this bounded lifecycle. Execute reopens
and fstats the target/parent, then checks immediate metadata and pre/post digest
at each use boundary. The exact residual remains
`bound_writer_concurrency_not_machine_proven`; helper pathname reopen is not
described as race-free.

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
GitHub. Immediately before its first authorization mutation, closeout calls
the private installed authority once. That snapshot freshly revalidates all
ten tools, the stable account, and the exact canonical account-wide SSH
topology and sudo source/effective policy. It requires exactly one authorization line
matching public-key blob hash, full line hash, and terminal marker; exactly one
effective no-argument sudo rule; no other rule; effective global and
Match-scoped ForceCommand/ChrootDirectory both `none`; and account-applicable
`DisableForwarding=true` and `PermitTunnel=false`. Marker-only selection or
removal is forbidden. Any forwarding/tunnel permission blocks closeout.
Closeout creates and same-FD validates the fixed zero-byte transient, fsyncs
and atomically replaces the sole effective authorization file, fsyncs its
parent, proves the live zero-byte readback, then removes the exact dedicated
sudoers file and fsyncs that parent. Only after both mutations does it call the
private removed authority once. That snapshot proves the public-key blob
absent from the present zero-byte sole effective SSH source, the dedicated
sudoers path/rule absent, the remaining sudo graph at `0/0`, and native visudo
success. A fully enumerated zero-survivor includedir is valid. Any SSH/sudo
topology drift, alternate source, duplicate, readback ambiguity, or mutation
after temporary creation is
`cleanup_indeterminate`, never `authorization_removed`.

The post-closeout authorization file is exactly a zero-byte root:root regular
file, mode `0600`, `nlink=1`. Closeout fsyncs the file and its parent, then
same-FD reads back size zero and SHA-256 of empty bytes. Deleting the file,
retaining whitespace/comments, or any other representation is not success. The
dedicated sudoers file must be absent after exact unlink and parent-directory
fsync.

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
temporary, performed no authorization mutation, and readback proves the exact
canonical line still matches blob hash, line hash, marker, and unchanged
canonical SSH and sudo topologies. Once replacement-temporary creation
succeeds, or any line/topology/readback predicate is not exact, every SSH or
sudo write, unlink, fsync, rename, directory-fsync, or readback failure is
`cleanup_indeterminate`/`unknown`; it is never downgraded to retained.

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

## Task 4C Formal Transcription Gates

The final independent policy review of
`.superpowers/sdd/task-4c-policy-synthesis.md` is PASS with Critical `0`,
Important `0`, Minor `0`. That result permits this synchronized source-only
transcription; it does not authorize implementation, Bootstrap, identity
access, Tasks 5-8 dispatch, or production action. Task 4C implementation and
review must satisfy all fourteen gates together:

1. Bind the exact ten-tool order, paths, modes, six-code/ten-tool manifest and
   capability matrices, fixtures, and call counts.
2. Keep authority exports at one semantic input with internally created,
   recursively frozen, private-branded native aggregates; raw/unbranded,
   Proxy/clone/wrong-brand, capability, and writer providers reject before
   their first operation.
3. Limit raw injected operations to non-authority projections and an isolated
   module-evaluation adapter harness; production has no setter, overload,
   factory argument, environment, frame, callback, or binding seam.
4. Use the exact six-call Buffer-delimited account producer with full
   `finally` zeroization, independent canonical `groupIds`/`groupNames`, two
   stable observations, a private account-core brand, and separate candidate,
   installed, and removed authorization brands.
5. Use the fixed candidate/rollback-zero transients with exact metadata,
   same-FD durability, logical-path future topology, live `0/0`, staged `1/1`,
   installed `1/1`, authorization-last installation, and key-first rollback.
6. Freeze Bootstrap candidate+installed totals at four account reads, 24
   helper executions and validations, two SSH/sudo graphs, two visudo calls,
   two full code/tool/capability/writer passes, three authorization reads, and
   zero public builders.
7. Freeze closeout installed+removed brands and totals at 24 helper calls and
   validations, two SSH/sudo graphs, two visudo, present zero-byte
   authorization, absent dedicated sudoers, accepted zero-survivor
   includedir, and zero capability/writer/public-builder calls.
8. Use the exact native visudo path, same-FD pre-exec validation, shell/cwd/env/
   timeout/maxBuffer/binary-stdio envelope, status-only sanitized decision,
   capture zeroization, and explicit path-reopen residual.
9. Separate source first-discovery ordinal from Match encounter ordinal;
   coordinates prove provenance but carry no monotonic-order authority.
10. Freeze SSH relative Include base, glob/lexer/Match scope and grammar,
    independent group sets, first-Match/global/default layering,
    opaque-in-Match rejection, and private-only source Group-pattern preimage.
11. Freeze the byte-level sudo EBNF/state machine, include/`#uid`/comment
    dispatch, quote/single-quote/backslash precheck, corrected command byte
    classes, RunAs/tag/argument persistence, EOL consumption, User_Alias-only
    applicability, global supported Defaults, includedir residual, and exact
    rule counts.
12. Enforce every file/graph/account/work bound, exhaustive node ontology and
    pre-retention charge, shared `131072` snapshot ceiling, zero/one-star
    prefix/suffix matcher and its byte/invocation/comparison budgets,
    account-identity WeakMap alias memo, premeasured preimage reservation, and
    per-kind/global max/max+1 adversarial tests.
13. Prohibit all raw authorization/account/source/parser/helper evidence from
    receipts and diagnostics, including whole passwd/shadow/GECOS/password/
    stderr decoding, serialized group names or positional ID/name mappings,
    and native Match patterns.
14. Distinguish Bootstrap binding from Task 8 use-time revalidation; require
    runtime installed re-attestation, the retryable removed-state identity,
    and full post-removal proof before `authorizationRemoved:true`.

## Source-Only TDD And Review

Implementation order is:

1. closed frame protocol;
2. durable one-time claim and monotonic journal;
3. direct-mode contract and receipts;
4. exact schema-3 binding, candidate-then-installed six-code/ten-tool account/
   SSH/sudo authorization evidence, same-FD reads, and pre-migration
   fail-closed CLI;
5. use-time-revalidated read-only inspection;
6. crash-durable claim, backup, apply, and observation;
7. use-time-revalidated rollback and replay;
8. non-marker-only SSH-plus-sudo terminal closeout plus atomic strict-frame CLI
   migration;
9. manual GitHub workflow and secret ordering;
10. static dormant-identity non-use hygiene and runbook reconciliation, with
    both identity files remaining outside the source-only PR.

Task 4 RED/GREEN coverage includes the exact eight-line fixed `--import=`
entrypoint and a tampered-module sentinel proving preload rejection occurs
before root evaluation. Syntax-aware enumeration covers all six code roles,
every static import, the bootstrap's exact builtin-only graph and forbidden
local/loader/dynamic-code surfaces, the exact four-module application graph,
and exactly one total JavaScript `import()` at the runner's verified-artifact
callsite.

An end-to-end six-code/ten-tool manifest matrix covers exact role order,
paths, metadata, digests, capability fields, recursive canonical key order,
per-role ceilings (including bootstrap `65536/65537`), same-FD size/read/hash/
confirmed-EOF behavior, early EOF, trailing byte, wrong fd, post-read metadata
drift, and exactly-once close. Code/tool low-12 mode rules, required sudo
setuid, runtime `mode <= 0777`/no `0022`/no observed `07000`, and the audited
Linux `0xA0000`/`0xB0000` file/directory flags are tested independently of
Windows host constants; missing or drifted required constants reject.

Operations-driven SSH and sudo fixtures derive every native source closure from
same-FD reads capped at 1 MiB with confirmed EOF. They cover missing,
duplicate, cyclic, ambiguous, and unresolved expansion; sudo empty-argument
source semantics; derived Match disposition, encounter ordinal, and provenance
coordinates; positive,
negative, and wildcard User/Group cases; and global/default/applicable-Match
effective-value derivation. Caller-supplied source, order, disposition,
effective booleans, rule counts, or digests are rejected as evidence.

The integration matrix also covers bounded public-key parsing, exact Match
nested grammar and `all` bytes, canonical sudo source/effective policy,
CI Identity Bootstrap Gate-only capability `ENODATA`/`ENOATTR` absence plus bytes/wrong-fd/error/
oversize/digest failures, writer evidence for every writable owner, bound unit,
and known process, strict surrogate UTF-8 path rejection with valid scalar
round trips, bigint dev/ino, partial reads, EINTR, fatal UTF-8, BOM,
duplicate/reordered/trailing binding bytes, directory-nlink null-sentinel
semantics, login-shell/dash projection, pre-created lock enforcement, exact
pre-migration stderr/exit/call counts, and the exact bound-writer residual.
Task 8 cannot enable framed dispatch until every Task 4 matrix is GREEN and all
reviewer findings are closed. Tasks 5-8 add operation-specific immediate
reopen/fstat/digest assertions at every use.

Each behavior begins with a failing focused test, then minimal implementation,
focused regression, and commit. Before merge, the exact PR head must pass
focused tests, `npm test`, `git diff --check`, GitHub CI, CodeQL/code scanning,
dependency/security checks available to the repository, and independent
security review. A successful source PR remains `not_deployed`.

## Post-Merge Gate Sequence

From successful CI Identity Bootstrap Gate until terminal closeout, `master` is operationally
frozen at the bound merged commit. If `master` advances, all operations stop;
the old commit is not dispatched through an alternate ref. A new exact rebind
Gate must review the intervening commits and update the host binding before
inspection can resume. This keeps repeatable inspection available without
silently trusting a different workflow commit.

1. **Exact CI Identity Bootstrap Gate:** bind the merged workflow commit,
   the exact six-role `codeManifest` in
   `bootstrap, contract, entrypoint, frame, runner, state` order, the fixed
   eight-line `--import=` entrypoint, and the exact ten-binary `toolManifest`
   including raw capability digests,
   binding and expected claim digest, fixed account/passwd/home/shell,
   canonical complete sshd topology and Include/Match preimages with global and
   Match-scoped ForceCommand/ChrootDirectory both exactly `none`,
   account-applicable DisableForwarding exactly `true` and PermitTunnel exactly
   `false`, sole
   authorization source and line/blob, canonical sudo source/effective policy,
   fixed dedicated sudoers file/rule, lock/state/path metadata, writer
   inventory, host-key/endpoint digests,
   master-only Environment policy, exact five secrets, rollback, and cleanup
   readback. The Gate treats entrypoint/bootstrap/Node/root as the pre-import
   TCB, verifies bootstrap at install time, and records runtime bootstrap
   self-checks only as defense in depth. It proves the bootstrap has only the
   reviewed builtin static imports and none of local import, `import()`,
   require/createRequire, eval, or loader registration; it also proves bootstrap
   same-FD-validates runner/contract/frame/state before root evaluation. The
   Gate stages the zero-byte rollback transient first, installs the complete
   non-authorization closure, stages the one-line candidate, and runs the full
   candidate aggregate snapshot. That snapshot proves live authorization
   `0/0`, staged future `1/1`, exact account, SSH/sudo graphs, ten tools,
   capability/writer evidence, and native visudo before installing and
   same-FD reading back the candidate-derived binding. The Gate then atomically
   installs the already validated authorization candidate as its final
   authorization mutation and immediately runs the independent installed
   aggregate snapshot proving live `1/1`. Its first post-add rollback mutation
   atomically installs and fsyncs the already validated zero-byte rollback
   transient, proves zero-byte readback, and only then removes and
   parent-directory-fsyncs the exact sudoers file.
   Gate capability dry-run evidence covers absent xattr, unexpected
   bytes, wrong fd, unsupported/error, oversize, and digest mismatch before
   authorization. Any path, content/capability digest, SSH/sudo topology, role-mode,
   Include/Match/include-source coverage, or readback ambiguity blocks
   the Gate. The initial validation operation is `inspect`;
   no runtime-config write is authorized by the Gate.
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
