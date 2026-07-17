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

The policy in this section supersedes every earlier root-only-final-owner,
`trusted_root_concurrency_not_machine_proven`, incomplete code-closure, and
marker-only authorization formulation for this design. The root-owned,
same-FD-validated binding is authoritative for bootstrap-observed final-file
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

The entrypoint is a root:root regular file, mode `0755`, `nlink=1`. Runner,
contract, frame, and state are root:root regular files, mode `0644`,
`nlink=1`. The binding is root:root regular, mode `0600`, `nlink=1`.
State/backup/temporary are root:root directories with exact mode `0700`. The
lock is pre-created by bootstrap as root:root regular mode `0600`, `nlink=1`;
`flock` never creates it. The authorization file is root:root regular mode
`0600`, `nlink=1`, beneath a root-controlled component chain. The account is
exactly `gccgw-japan-repair-ci`; its home is the fixed root:root mode-`0755`
directory and its shell is the fixed root:root regular `/usr/bin/dash`, mode
`0755`, `nlink=1`, with an exact SHA-256. The principal cannot modify its
home, `.ssh`, effective authorization file, or an alternate authorization
source. The dedicated sudoers file is root:root regular mode `0440`,
`nlink=1`, with an exact content SHA-256.

Bootstrap stages rollback and reads back the entire code, tool, binding, state,
account, SSH, and sudo closure before SSH authorization exists. Adding the
canonical authorization line is the final bootstrap mutation. Removing that
line is the first rollback mutation, followed by removal and parent-directory
fsync of the exact dedicated sudoers file. Runner self-validation is defense
in depth because static ESM imports execute before runner code; exact bootstrap
manifest/readback plus the trusted host-root boundary are primary authority.

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

`codeManifest` keys are exactly `contract, entrypoint, frame, runner, state` in
that order. Every value has exact key order
`path, sizeBytes, sha256, type, uid, gid, mode, nlink`, uses its fixed path and
metadata, has positive safe-integer size and `type="file"`, and binds a
primitive lowercase 64-hex SHA-256 derived from the exact merged commit.
Entrypoint is at most 16384 bytes; each ESM module is at most 1048576 bytes.
Bootstrap verifies the installed bytes before authorization. A syntax-aware
source test recursively enumerates the static ESM
imports from runner/contract/frame/state and requires exactly that four-module
subgraph. Static imports may be only a reviewed exact `node:` builtin allowlist
or one of those relative manifest paths. Bare packages, absolute/file/data
URLs, query/hash specifiers, `node:module`, `createRequire`, CommonJS
`require`, and unlisted local modules are rejected.

The only dynamic-code exception is the already frozen runner callsite that
imports `scripts/traffic-accounting-natural-observation.mjs` from the verified
artifact extraction root. It is allowed only after exact artifact
size/hash/central-directory-manifest/safe-extraction validation and remains
under that separate artifact authority. Every other dynamic import is
rejected.

`toolManifest` keys are exactly
`dash, env, flock, node, sudo, systemctl, unzip, visudo`. Their fixed paths are
`/usr/bin/dash`, `/usr/bin/env`, `/usr/bin/flock`, `/usr/bin/node`,
`/usr/bin/sudo`, `/usr/bin/systemctl`, `/usr/bin/unzip`, and
`/usr/sbin/visudo`, respectively. Every value has exact order
`path, sizeBytes, sha256, type, uid, gid, mode, nlink, capabilitySha256`; it
binds a root:root regular file, positive safe-integer size no greater than
268435456 bytes, lowercase content SHA-256, and lowercase SHA-256 of the raw
`security.capability` value, hashing empty bytes when absent. `sudo` alone
has mode `04755`; every other entry has mode `0755`; every entry has
`nlink=1` and no file capability. Entrypoint bytes begin exactly
`#!/usr/bin/dash`. Symlinks, alternate resolved paths, package binaries, and
metadata/digest drift block bootstrap. The root-owned OS/runtime/library base
beneath those binaries remains an explicit platform trust boundary.

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
values file/root/root/`0755`/`1` plus one lowercase 64-hex digest. Bootstrap
binds exact passwd uid/home/shell, proves the home chain root-controlled,
proves the principal cannot replace an authorization source, and proves one
occurrence of the public key and canonical line. Login-shell path, metadata,
and SHA equal `toolManifest.dash` exactly apart from the tool-only capability
field.

The account is exclusive to this repair identity for the bounded lifecycle.
Its effective authorization file has exactly one active nonblank/noncomment
entry: the canonical bound line. Its password is locked and its complete
per-account sshd policy is public-key-only. Password, keyboard-interactive,
host-based, GSSAPI, Kerberos, TrustedUserCAKeys,
AuthorizedPrincipalsFile/Command, AuthorizedKeysCommand, additional
AuthorizedKeysFile expansion, and address/host-dependent authorization
branches are disabled or absent. `PermitUserEnvironment` is false and the
accepted client-environment name set is empty. Bootstrap rejects an unresolved
Include, Match, or conditional branch instead of sampling one `sshd -T -C`
tuple.

The canonical aggregate SSH topology has exact key order:

```text
schemaVersion, type, username, uid, homeDirectory, loginShell,
passwordLocked, authenticationMethods, pubkeyAuthentication,
passwordAuthentication, keyboardInteractiveAuthentication,
hostbasedAuthentication, gssapiAuthentication, kerberosAuthentication,
permitUserEnvironment, acceptedEnvironmentNames,
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
`authorizedKeysFiles=[authorizedKeysFile]`, both command fields `"none"`, both
principals/CA arrays empty, both entry/key counts `1`, address-dependent branch
count `0`, and lowercase 64-hex closure/coverage digests.
`effectiveConfigSha256` is the SHA-256 of UTF-8
`JSON.stringify(canonicalTopology) + "\n"`. Bootstrap and Task 8 closeout use
the same reviewed parser/builder and exact bytes.

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

The Match record uses `schemaVersion="1"` and exact type
`japan_ci_sshd_match_coverage`. Every `conditions` element has exact keys
`name, patterns`; `name` is one lowercase literal from `user, group, host,
address, localaddress, localport, rdomain, localnetwork, all`, occurs at most
once per branch, and remains in source order. Each pattern has exact keys
`negated, value`; `negated` is boolean and `value` is a nonempty printable
ASCII token with no whitespace, comma, backslash, control byte, or Unicode
normalization. Literal `*` and `?` wildcard bytes are preserved; duplicate
name/pattern pairs fail. `patterns` is always an explicit JSON array; condition
`all` is exactly `{"name":"all","patterns":[]}`, while every other
condition has at least one pattern. `variableDimensions` is unique and fixed-order
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
variation, alias expansion, alternate RunAs, another effective rule, SETENV,
or broad sudo are rejected.

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
comparison. Bootstrap and Task 8 recompute both records.
The effective-policy record uses `schemaVersion="1"` and exact type
`japan_ci_sudo_effective_policy`; its source-closure digest is derived by the
shared trusted-read builder, never accepted as caller input.

`paths` keys and order are exactly:

```text
authorizedKeys, backupDirectory, currentMap, lockFile, materialStore,
mihomoConfig, naturalObservation, producerStatus, stateDirectory,
sudoersFile, temporaryRoot
```

Every path is a distinct canonical POSIX absolute primitive string; fixed
authorization/state/backup/temporary/lock/sudoers paths equal the values above.
`pathPolicies` has the same keys/order. Every policy value has exact key order
`type, uid, gid, mode, nlink`: uid/gid/mode are nonnegative safe integers;
mode is permission bits only in `0..0777` with no group/other write; files use
`type="file"`, integer `nlink=1`; directories use `type="directory"`, JSON
`nlink=null`. Fixed roles cannot be relaxed by binding data.

`sudoersFile` is root:root regular mode `0440`, `nlink=1`, and its exact
content SHA-256 equals `sudoAuthorization.sudoersFileSha256`.

`currentMap` is regular, `nlink=1`, exact mode `0600`, with uid/gid frozen from
bootstrap. Material store, Mihomo config, natural observation, and producer
status are regular files with `nlink=1`; bootstrap freezes exact observed
uid/gid/mode. Their mode is exactly `0400` or `0600`: owner-only readable,
non-executable, and never group/other accessible. Bootstrap stops on any other
observed mode and does not normalize live metadata; a separate
permission-hardening Gate is required before bootstrap can resume.

The root-owned, same-FD binding is authority for observed final uid/gid/mode,
not client input. Every ancestor remains root-owned and non-writable by
group/other. A non-root final owner is permitted only when the role minimum and
exact bootstrap policy both pass. Writer inventory enumerates every OS
principal with target write capability and every known service/timer/process
writer, proves known active writers quiesced, and binds aggregate-only evidence.
`writerFreeze` keys/order are `knownWriterCount, evidenceSha256, residualRisk`
with exact values `0`, one lowercase 64-hex digest, and
`bound_writer_concurrency_not_machine_proven`. The count covers known active
writers; it does not claim owner-write permission vanished. The residual
explicitly covers unobserved root or bound-owner same-inode mutation.

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
3. validate final lstat type and exact uid/gid/mode/nlink;
4. open with `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, plus `O_DIRECTORY` for a
   directory;
5. `fstat` with bigint stats, repeat final policy, and require exact bigint
   dev+ino equality with lstat;
6. call synchronous `consumeOpened(fd, openedStats)` before close when supplied;
   it consumes only that verified fd and never closes it;
7. fstat after consumption and require unchanged dev, ino, and size; and
8. close exactly once in `finally` after every successful open. Close failure
   fails closed even when an earlier operation also failed.

Code/tool manifest modes compare the low 12 Unix permission/special bits.
Every non-sudo code/tool rejects setuid, setgid, and sticky bits; sudo requires
setuid and rejects setgid/sticky drift. Runtime `pathPolicies` compare only the
low 9 permission bits and separately reject every special bit.

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
all five code-manifest files, all eight tool-manifest files, login-shell
equality, and every binding path against policy before any operation. Bootstrap
does the same before authorization. Every file is read from its verified
descriptor under its role ceiling. Same-FD fstat size must equal manifest
`sizeBytes`; readers consume exactly that many bytes and confirm zero-byte EOF
before SHA-256 comparison. Early EOF, size mismatch, ceiling+1, and a trailing
byte fail closed. Runtime coverage includes the already executed entrypoint as
defense in depth; bootstrap manifest coverage is the primary pre-execution
authority.

`capabilitySha256` is a bootstrap-only native same-FD `fgetxattr`
attestation because Node has no built-in same-FD xattr API. Bootstrap maps only
absent `ENODATA`/`ENOATTR` to SHA-256 of zero bytes and fails every other
error. Runtime makes no claim to revalidate xattrs; it still checks every
tool's path/content/type/uid/gid/mode/nlink. A capability change remains inside
the explicit trusted host-root/capability residual.

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
or legacy-helper calls. The source entrypoint remains uninstalled. Bootstrap
and workflow dispatch are prohibited until Task 8 removes the v1 path and
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
owner will never mutate the same inode concurrently. The bootstrap inventory
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
GitHub. Before mutation, closeout rebuilds and revalidates the exact canonical
account-wide SSH topology and sudo source/effective policy with the same
reviewed parsers used by bootstrap. It requires exactly one authorization line
matching public-key blob hash, full line hash, and terminal marker; exactly one
effective no-argument sudo rule; and no other rule. Marker-only selection or
removal is forbidden. Closeout creates a durable SSH replacement, revalidates
both topologies and sources after temporary creation, fsyncs and atomically
replaces the sole effective authorization file, fsyncs its parent, then removes
the exact dedicated sudoers file and fsyncs that parent. It finally proves both
the public-key blob absent from the sole effective SSH source and the dedicated
sudo rule absent. Any SSH/sudo topology drift, alternate source, duplicate,
readback ambiguity, or mutation after temporary creation is
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

## Source-Only TDD And Review

Implementation order is:

1. closed frame protocol;
2. durable one-time claim and monotonic journal;
3. direct-mode contract and receipts;
4. exact schema-3 binding, installed code/eight-tool closure, account-wide SSH
   Include/Match topology, canonical sudo source/effective policy, same-FD
   reads, and pre-migration fail-closed CLI;
5. use-time-revalidated read-only inspection;
6. crash-durable claim, backup, apply, and observation;
7. use-time-revalidated rollback and replay;
8. non-marker-only SSH-plus-sudo terminal closeout plus atomic strict-frame CLI
   migration;
9. manual GitHub workflow and secret ordering;
10. dormant public-identity hygiene and runbook reconciliation.

Task 4 RED/GREEN coverage includes exact entrypoint bytes, recursive
syntax-aware four-module ESM closure (for example `vm.SourceTextModule` under
the bound Node test runtime) and reviewed builtin allowlist, the sole
verified-artifact dynamic-import exception, all five code-manifest entries and
eight tool-manifest entries with capability digests, recursive canonical key
order, complete SSH topology/Include/Match preimages, canonical sudo
source/effective-policy builders, no-argument rule semantics, and bounded
public-key parser, shared same-FD 1 MiB source-closure reads, exact Match nested
condition/pattern grammar, bootstrap-only native capability attestation with no
runtime xattr claim, exact manifest sizes/role ceilings/ceiling+1, early EOF,
trailing byte, low-12-bit special-mode drift and required sudo setuid, explicit
Match pattern arrays/`all` form, exact empty post-closeout authorization file,
absent parent-fsynced sudoers file, exact fd propagation, bigint dev/ino,
partial reads, EINTR, confirmed EOF, `65536/65537`, fatal UTF-8, BOM,
duplicate/reordered/trailing bytes, open flags, post-read drift, exactly-once
close, environment/EUID rejection ordering, schema-1 rejection, exact
pre-migration stderr/exit/call counts, pre-created lock enforcement, observed
metadata role minimums, and the exact bound-writer residual. Tasks 5-8 add
operation-specific immediate reopen/fstat/digest assertions at every use.

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
   entrypoint plus four-module `codeManifest`, eight-binary `toolManifest`
   including raw capability digests,
   binding and expected claim digest, fixed account/passwd/home/shell,
   canonical complete sshd topology and Include/Match preimages, sole
   authorization source and line/blob, canonical sudo source/effective policy,
   fixed dedicated sudoers file/rule, lock/state/path metadata, writer
   inventory, host-key/endpoint digests,
   master-only Environment policy, exact five secrets, rollback, and cleanup
   readback. Bootstrap stages the rollback procedure first; reads back the
   entire installed closure before authorization; and adds the exact
   authorization line last. Its first rollback mutation removes that line,
   followed by removal and parent-directory fsync of the exact sudoers file.
   Any path, content/capability digest, SSH/sudo topology, role-mode,
   Include/Match/include-source coverage, or readback ambiguity blocks
   bootstrap. The initial validation operation is `inspect`;
   no runtime-config write is authorized by bootstrap.
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
