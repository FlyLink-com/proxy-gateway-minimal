# Japan Control-Plane Deployment Foundation and Linux Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the strict canonical-byte, durable-filesystem, and Linux-native capability foundation, and stop the program unless the target-matched Linux environment can prove every kernel, SQLite-handle, descriptor-custody, and systemd primitive required by the approved deployment design.

**Architecture:** Pure Node.js modules own canonical contracts and dependency-injected durable state, while every state-changing durable operation is one native fixed-logical-ID transaction rather than a JavaScript read-then-write sequence. A small Node-API C addon exposes only the four closed logical read/publish-no-replace/CAS/verified-unlink operations under OFD locks, sealed anonymous memory, exact descriptor inheritance, directory-FD durability, authenticated `SCM_RIGHTS`, and actual SQLite main-handle proof. One digest-bound build-time registry owns logical records, spawn profiles, the frozen standalone compiler profile, and reviewed standalone targets; later Bootstrap sources may add one reviewed extension fragment and manifest entry without a runtime registration path, caller-selected compile input, or public native ABI change. A future pinned mature full-Sigstore owner must be the sole attestation authority shared by Foundation-lock and Artifact verification before any immutable lock may be published; only a later resolver consuming that private-branded result may authorize the OCI image, Node headers, and complete native toolchain for either builder. A future complete content-addressed offline npm cache/vendor closure is a second independent provider before any native build. Under the current boundary, only the owning predecessor plan may prepare, test, push, open, and review the exact 11-file authority-bootstrap as an inert source-only Draft; it must remain Draft and may not be marked Ready or merged. Its partial verifier cannot publish, authorize, or unblock the GitHub-hosted `ubuntu-24.04` stop/go harness. No later plan may replace either missing provider or a failed native proof with path, process, service-name, REST-metadata, or synthetic inference.

**Tech Stack:** Node.js 22 ESM, `node:test`, Node-API C, `node-gyp@11.4.2`, GitHub-hosted `ubuntu-24.04`, Linux `memfd_create`, `openat2`, OFD locks, Unix-domain sockets, SQLite, systemd, and PowerShell for local orchestration only.

> **Security hold:** The predecessor Foundation-lock verifier covers only
> diagnostic DSSE signature, Fulcio chain, Rekor entry/inclusion, OIDC,
> predicate, and subject observations. It does not completely validate embedded
> CT/SCT evidence, cannot mint a private authority brand, and every compatibility
> `verify` call ends in fixed `full_sigstore_owner_unavailable`. Consequently
> publication postverification, resolver/exporter output, dependency/native
> build, the Linux receipt, and every `eligible:true` transition are unreachable.
> Under the current post-#593 authorization boundary, only the exact 11-file
> authority-bootstrap's owning predecessor plan may prepare, test, push, open,
> and review that source-only Draft. It MUST remain Draft and may not be marked
> Ready or merged. This Foundation plan may not create that Draft or execute any
> Foundation task, command, commit, or handoff. Resumption of Foundation Tasks
> 1+ requires a separately approved provider/topology addendum that puts one
> pinned mature
> full-Sigstore owner with official positive/adversarial CT/SCT vectors on the
> protected path before lock publication and serves both Foundation and
> Artifact, plus a separately approved complete content-addressed offline npm
> cache/vendor closure, successful immutable-lock publication/postverification,
> and a separately approved Risk-A resume. This plan approves no package,
> version, file, API, pin,
> asset, publication, expanded bootstrap inventory, or extra predecessor PR.
> After the bootstrap source checkpoint, every Settings/Release/publication and
> main-Ready path must stop with `full_sigstore_owner_topology_unapproved` until
> that future topology is explicitly approved; the proposed extra predecessor is
> excluded from the currently approved implementation-PR count and must not be
> created or merged under this plan.

## Global Constraints

- This entire plan, including Foundation Tasks 1+, is a dormant future serial slice and is not currently reachable. Current authorization ends at review of the exact 11-file authority-bootstrap source-only Draft created only by its owning predecessor plan; that Draft must remain Draft and may not be marked Ready or merged. A separately authorized future predecessor merge, the unified full-Sigstore owner, successful immutable-lock publication/postverification, the complete hash-verified offline npm closure, and a separately approved Risk-A resume are all required before any Foundation task, worktree, branch, packet, RED/GREEN command, validation command, staging command, or commit command below may run. This plan creates no GitHub Environment, credential, Release asset, production-host installation or systemd activation, production connection, deployment, schema change, or rollback. Only after all future prerequisites may its sole privileged mutation be the bounded, always-removed eligibility fixture on the disposable GitHub-hosted runner defined below.
- Production deployment remains `workflow_dispatch` only. Merge, push, pull request, schedule, repository dispatch, and reusable workflow calls never promote `control-plane-app`.
- Release unit is exactly `control-plane-app`; main source PR state remains `production_state: not_deployed` and `identity_impact: false`.
- Root Node engine support remains `>=20.10.0 <21 || 22.x || 23.x || 24.x || 25.x || 26.x`; repository CI for this capability uses Node 22.
- No Redis, queue, cluster, daemon, interactive shell, SCP, rsync, PTY, forwarding, self-hosted Actions runner, operator key, or runtime-config repair identity is introduced.
- The future authoritative Foundation execution environment is a `pull_request`-only, no-secret GitHub-hosted `ubuntu-24.04` VM with only `contents: read` and `attestations: read`; it is not executable while either security hold above is open. It uses exact-SHA action references and has exactly two explicit `${{ github.token }}` consumers: pinned checkout of the pull-request head SHA with `token: ${{ github.token }}` plus `persist-credentials: false`, then Foundation's fixed no-selector exporter with `GITHUB_TOKEN: ${{ github.token }}`. Raw and parsed tests count exactly those two occurrences and reject an implicit checkout default, persisted credentials, job-level token, a third consumer, or token exposure to any later step. The workflow deliberately has **no job-level container**, because the real systemd PID 1, D-Bus, persistent timer, delegated cgroup, and kill/readback proofs must run against that disposable VM host. After the unified full-Sigstore owner has authorized a published v2 lock, its exact OCI platform manifest is used by fixed, bounded `docker run --rm` phases. The later dependency/native build and aggregate-receipt phases receive no GitHub or Actions token. The build phase may run only after a separately approved, published, complete content-addressed offline npm cache/vendor closure has been hash-verified; it performs exactly `npm ci --offline --ignore-scripts` with network disabled, proves zero network attempts and a closed cache inventory, compiles every reviewed native/standalone target without any host compiler, and writes a canonical output manifest plus fixed standalone host-probe wrapper into the fresh fixed host-probe directory. While provider placement remains unapproved, every Settings/publisher/resolver/exporter caller hard-stops with `full_sigstore_owner_topology_unapproved`; only after topology approval may an absent owner reach `full_sigstore_owner_unavailable`. No evidence file or container may be created, and missing offline closure hard-stops before `npm ci` or compiler execution. The unprivileged validator opens that regular single-link runner-owned `0555` wrapper with `O_NOFOLLOW`, validates its digest, verifies the pre-existing standard `/usr/local/bin` parent is root-owned and runner-nonwritable and the fixed basename is absent, duplicates only that held descriptor onto stdin, and exact-spawns the sole promotion command `/usr/bin/sudo -n -- /usr/bin/install -T -o root -g root -m 0555 /proc/self/fd/0 /usr/local/bin/control-plane-foundation-host-probe-root`. It never depends on sudo preserving FD 3 or above and never creates a privileged parent directory. Only after independent no-follow readback proves the fixed target is `root:root 0555`, regular, single-link, and digest-identical may the workflow make the other two and only two sudo calls: the same root-owned absolute target with `run`, then final `always()` `cleanup`, both with empty environment input and `/dev/null` stdin. The wrapper accepts no selector or flag beyond those exact root verbs and installs only the fixed root-owned transient unit/worker set below. A final tokenless invocation of the same exact container validates the root-owned host result, recomputes the complete build/result binding, and emits the aggregate receipt before cleanup removes and reads back absent every fixture, unit, timer, cgroup, result, runtime root, and the promoted executable itself. The exporter would write the exact canonical lock and immutable-publication evidence into a fresh runner-owned directory, and every later phase would consume them through the sole future published-lock resolver. The job has no `push`, `workflow_dispatch`, schedule, environment, artifact/cache upload, SSH, provider, Release write, production host, or deployment operation. Local Windows or WSL observations and a synthetic all-true fixture may aid unit development but can never mint the private real-probe brand or satisfy this receipt. Missing or drifted immutable lock/attestation evidence, absent or drifted offline dependency closure, a container-reference/output-manifest mismatch, a host probe that did not observe real systemd/cgroup state, cleanup or absence failure, or an owner resolver failure is a hard stop, not permission to use network, host build tools, or a synthetic fixture.
- The future Foundation Linux workflow has a closed token-expression/context
  allowlist, not merely a count. The raw duplicate-rejecting scanner and parsed
  recursive scalar walker agree that the only token-bearing values are exact
  `${{ github.token }}` at pinned checkout's `with.token` (with sibling
  `persist-credentials: false`) and the fixed exporter's `env.GITHUB_TOKEN`.
  They reject `github['token']`, case/whitespace aliases, `toJSON`/`fromJSON`/
  `format`, `secrets`, token-bearing env/output aliases, argv/stdin/run or an
  unapproved with/env placement, YAML alias/merge/duplicate tricks, and any
  third occurrence. Every subsequent step is recursively tokenless and
  secretless.
- Stop-code precedence is exact: before a future provider/topology addendum is
  approved, Settings, Release, publisher, resolver, exporter, workflow, and
  main-Ready entrypoints fail first with
  `full_sigstore_owner_topology_unapproved`; only after an approved topology
  exists may an absent/unready owner reach `full_sigstore_owner_unavailable`.
  The predecessor compatibility verifier itself always uses the latter fixed
  code. Neither code permits an output or fallback.
- The authoritative Foundation workflow document has exactly the ordered root keys `name,on,permissions,jobs`, exact workflow/root permissions `contents: read` then `attestations: read`, and the sole ordered job key `foundation-linux`. That host job has exactly the ordered keys `runs-on,timeout-minutes,permissions,steps`, fixes `ubuntu-24.04`, fixes `timeout-minutes: 30`, repeats the same exact read permissions, and retains the already frozen complete step/sudo lifecycle. Root `concurrency` is deliberately absent because this PR-only evidence job grants no production serialization authority. Raw and parsed tests independently reject root `defaults`, `env`, `run-name`, any extra/case/duplicate/anchor/alias/merge key or reusable trigger, and reject job `env`, `defaults`, `container`, `services`, reusable `uses`, any second job, or any other unlisted runtime authority before trusting the step block.
- A separate `pull_request`-only Foundation toolchain inventory job is approved solely to generate candidate review evidence. It has the same no-secret, `contents: read`, exact-head, GitHub-hosted `ubuntu-24.04` boundary; invokes no compiler, linker, make, Python, node-gyp, lifecycle script, or project build; uploads no artifact/cache; and writes no Release, package, container, Environment, host, provider, or production state. It emits one canonical safe manifest and aggregate digests only. The inventory result is not a build input and never satisfies Foundation eligibility. Publishing the reviewed immutable toolchain asset is unreachable until the future unified full-Sigstore owner is independently approved, on the protected publication path, and GREEN; publishing a complete content-addressed offline npm cache/vendor closure is another separately approved hard Gate. Neither Gate nor any added file is part of the current 11-file bootstrap.
- No production `.env`, SQLite file, protected config, credential, endpoint, raw log, or customer data enters a source fixture or artifact.
- Native APIs accept closed logical IDs, directory FDs, and authenticated capabilities; they never accept an external absolute path, executable path, arbitrary FD slot, unit name, UID, or shell fragment. Durable state publish, CAS, and verified unlink resolve only a reviewed logical-record registry and hold one inter-process OFD lock from current-byte reread through digest comparison, atomic rename-or-unlink, parent `fsync`, and exact readback.
- `createSealedMemfd` must apply mode `0600` and verify regular-file type, effective-UID ownership, and exact permission bits before writing the first protected byte. A permission or ownership failure closes the descriptor and is a program stop; no named-file or unverified-descriptor fallback exists.
- Failure of atomic fixed-logical-ID state transitions, `memfd` owner/mode plus full seals, exact FD inheritance, `openat2` no-follow traversal, OFD locks, `SCM_RIGHTS`, `SO_PEERCRED`, actual SQLite main-handle proof, cgroup containment, or boot-persistent systemd ordering is a program stop. No fallback to path equality or JavaScript read-then-write is permitted.
- The five downstream plans consume the exact interfaces in this file and remain ineligible until the final Linux feasibility receipt reports every required capability as `true`.

---

## File Structure

**FUTURE ONLY — consume after a separately authorized authority-bootstrap predecessor merge:**

- `server/services/deployment/strict-json-scan.mjs` — rejects duplicate object keys and malformed JSON token structure before `JSON.parse`; this main plan verifies but never recreates or rewrites it.
- `server/services/deployment/canonical-json.mjs` — predecessor baseline with exactly and only `parseCanonicalJsonBytes`, `serializeCanonicalJsonBytes`, and `sha256Hex`; the main PR modifies this existing owner in Task 1 instead of expanding the authority-bootstrap PR.
- `server/tests/control-plane-canonical-json.test.mjs` — predecessor baseline conformance for the exact three-export codec; the main PR modifies this existing test in Task 1 with runtime-fixture RED/GREEN coverage.
- `.github/workflows/control-plane-foundation-toolchain-inventory.yml` — exact-SHA, PR-only, no-secret inventory evidence; no build or artifact publication.
- `.github/workflows/control-plane-foundation-toolchain-publish.yml` — protected-master, protected-Environment immutable-lock publisher source whose current exact job order is the inert `topology-preflight -> publish -> verify-publication` chain. The first no-token `permissions: {}` job always fails fixed `full_sigstore_owner_topology_unapproved`; both downstream jobs use default-success `needs` and are therefore skipped. Merging it does not authorize dispatch or publication.
- `scripts/control-plane-foundation-toolchain-inventory.mjs` — fixed-role read-only inventory controller that emits only canonical review-safe evidence.
- `scripts/control-plane-foundation-toolchain-publication.mjs` — canonical v2 lock schema/publication parser, bounded publisher contract, and Foundation-lock diagnostic runner for DSSE/Fulcio/Rekor/OIDC/predicate/subject observations only. It validates no complete CT/SCT trust, mints no brand, and its compatibility verifier always throws `full_sigstore_owner_unavailable`; it contains no later live Release resolver/pin.
- `server/tests/control-plane-foundation-toolchain-inventory.test.mjs`
- `server/tests/control-plane-foundation-toolchain-inventory-workflow.test.mjs`
- `server/tests/control-plane-foundation-toolchain-publication.test.mjs` — locks the canonical body plus diagnostic-only signature/Fulcio/Rekor/OIDC/predicate/subject observations, no-brand closure, fixed `full_sigstore_owner_unavailable`, and CT/SCT/caller-trust negatives.
- `server/tests/control-plane-foundation-toolchain-publication-workflow.test.mjs` — raw-, parsed-, and runtime-dispatch-locks the current `topology-preflight -> publish -> verify-publication` source as inert: the absolute first fixed workflow-owned no-token job fails, the write and readback jobs are skipped, and instrumented GitHub Release/attestation sinks observe zero writes. It also proves the future separate read-only `verify-publication` job cannot complete, emit a completion digest, or authorize publication while the unified full-Sigstore owner is unavailable.

**Create in the main implementation PR:**
- `server/services/deployment/durable-store.mjs` — logical-record-only immutable publish, CAS, readback, and durable unlink.
- `ops/control-plane-deploy/native/binding.gyp` — one pinned Node-API addon target.
- `ops/control-plane-deploy/native/index.mjs` — closed JavaScript wrapper and platform refusal.
- `ops/control-plane-deploy/native/src/control-plane-native.c` — module registration and argument validation.
- `ops/control-plane-deploy/native/src/secure-memory.c` — sealed `memfd` and exact child descriptor inheritance.
- `ops/control-plane-deploy/native/src/durable-fs.c` — directory-FD `openat2`, write/fsync/rename/unlink/parent-fsync/readback operations.
- `ops/control-plane-deploy/native/src/database-capability.c` — OFD lease, peer credential, `SCM_RIGHTS`, and SQLite main-handle proof primitives.
- `server/services/deployment/foundation-contract.mjs` — single frozen source for the four atomic logical-record exports, complete native-wrapper export set, exact standalone compiler flags, and 14-feature feasibility vector.
- `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json` — ordered build-time allowlist and exact digests for every reviewed registry fragment; no fragment may exist outside this directory.
- `ops/control-plane-deploy/native/registry/foundation-profiles.json` — Foundation-owned fixed executable/environment IDs and descriptor-slot contracts.
- `ops/control-plane-deploy/native/registry/foundation-logical-records.json` — Foundation-owned fixed logical-record path/lock/mode/size contracts.
- `ops/control-plane-deploy/native/registry/foundation-compile-profiles.json` — the frozen `hardened-c17-pie-v1` compiler identity and exact flag vector.
- `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json` — reviewed first-party C source digests, compile-profile bindings, and fixed standalone output names.
- `ops/control-plane-deploy/native/src/foundation-profile-probe.c` — one reviewed standalone C probe selected only through compiled executable profiles. Its unprivileged real `main` has a zero-argument promotion-only mode that holds its validated wrapper FD on stdin across the one fixed `sudo install`; the independently validated root-owned copy accepts exactly `run` or `cleanup` with `/dev/null` stdin. Root-only installed worker modes are selected only by fixed root-owned basenames, not caller arguments. It emits no stdout and writes only the bounded canonical host result consumed by Task 6.
- `ops/control-plane-deploy/native/src/native-contract-test.c` — syscall-level negative and crash-boundary tests.
- `scripts/build-control-plane-native.mjs` — pinned local build controller for only the first-party addon and manifest-reviewed standalone C targets, with no download or dependency-addon build behavior.
- `scripts/control-plane-native-registry.mjs` — resolves manifest-listed fragments only under `native/registry/`, resolves standalone `src/*.c` only under the native root, and emits a build-temporary C registry plus closed build plan; it is not a runtime API.
- `scripts/control-plane-node-headers-contract.mjs` — verifies the canonical Node headers tree, version, ABI, and expected digest without downloading.
- `scripts/control-plane-linux-capability-probe.mjs` — aggregate-only target feasibility receipt.
- `scripts/control-plane-native-toolchain-contract.mjs` — verifies the canonical toolchain tree and the compile-profile-pinned compiler digest before any compiler starts.
- `scripts/control-plane-foundation-toolchain-lock.mjs` — future sole resolver for a canonical v2 lock that was verified by the unified Foundation/Artifact full-Sigstore owner, plus exact OCI closure, Node headers, ordered role files, complete executable closure, and offline npm closure identity. Its fixed no-selector `export-builder-input` CLI is currently unreachable and must throw `full_sigstore_owner_topology_unapproved` before output; only after topology approval may an absent owner produce `full_sigstore_owner_unavailable`. No success path exists until that owner, subsequent lock publication, and the separately approved content-addressed offline npm cache/vendor closure are all GREEN.
- `integration/control-plane-deploy/foundation-linux.test.mjs` — target-matched Linux/systemd integration harness.
- `server/tests/control-plane-durable-store.test.mjs`
- `server/tests/control-plane-native-contract.test.mjs`
- `server/tests/control-plane-native-registry.test.mjs`
- `server/tests/control-plane-node-headers-contract.test.mjs`
- `server/tests/control-plane-native-toolchain-contract.test.mjs`
- `server/tests/control-plane-foundation-toolchain-lock.test.mjs` — proves both builders consume one published-lock authority and reject independent digest tuples, alternate OCI digests, and forged brands.
- `server/tests/control-plane-linux-capability-probe.test.mjs`
- `server/tests/control-plane-foundation-linux-workflow.test.mjs` — locks the PR-only GitHub-hosted Linux harness to its source-only boundary.
- `.github/workflows/control-plane-foundation-linux.yml` — exact-SHA, PR-only `ubuntu-24.04` Foundation receipt gate.

**Modify:**

- `server/services/deployment/canonical-json.mjs` — Foundation main Task 1 adds only `CANONICAL_JSON_INLINE_RUNTIME_SHA256` and `createCanonicalJsonInlineRuntimeFixture` to the predecessor's unchanged three-function behavior.
- `server/tests/control-plane-canonical-json.test.mjs` — Foundation main Task 1 freezes the final five-export namespace, fresh strict-VM differential fixture, and source-drift negatives.
- `package.json` — add pinned development build tooling and focused validation scripts.
- `package-lock.json` — lock `node-gyp@11.4.2` and its integrity graph.
- `.gitignore` — ignore only the native build output under `ops/control-plane-deploy/native/build/`.

## Shared Interfaces

```js
// server/services/deployment/foundation-contract.mjs
export const ATOMIC_LOGICAL_RECORD_EXPORTS = Object.freeze([
  "durableReadLogical",
  "durablePublishNoReplace",
  "durableCompareAndSwap",
  "durableUnlinkVerified"
]);

export const FOUNDATION_NATIVE_EXPORTS = Object.freeze([
  "createBoundedCapture",
  "createDatabaseIdentityLease",
  "createSealedMemfd",
  "durableCompareAndSwap",
  "durablePublishNoReplace",
  "durableReadLogical",
  "durableSwapSymlink",
  "durableUnlink",
  "durableUnlinkVerified",
  "durableWriteFile",
  "inspectSqliteMainHandle",
  "probeLinuxCapabilities",
  "receiveDatabaseCapability",
  "sendDatabaseCapability",
  "spawnWithExactFileDescriptors"
]);

export const HARDENED_C17_PIE_V1_FLAGS = Object.freeze([
  "-std=c17",
  "-O2",
  "-fPIE",
  "-pie",
  "-fstack-protector-strong",
  "-Wl,-z,relro,-z,now",
  "-Wall",
  "-Wextra",
  "-Werror"
]);

export const REQUIRED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);
```

The four arrays above are the only normative lists. Tests import and compare
them rather than maintaining shortened copies: the atomic list has exactly four
entries, the wrapper list has every one of the 15 JavaScript exports below, the
compile profile has exactly nine ordered flags, and the feasibility vector has
exactly 14 ordered booleans. The Node-API module
exports the same 15 callable operations but does not export a registry mutator,
compiler control, or runtime extension function.

At a separately authorized future authority-bootstrap merge boundary,
`canonical-json.mjs` has exactly and
only the three module-namespace exports `parseCanonicalJsonBytes`,
`serializeCanonicalJsonBytes`, and `sha256Hex`. Foundation main Task 1 modifies
that same module and test; after its GREEN commit, the final namespace is frozen
to these five and only these exports, in module-namespace key order:
`CANONICAL_JSON_INLINE_RUNTIME_SHA256`,
`createCanonicalJsonInlineRuntimeFixture`,
`parseCanonicalJsonBytes`, `serializeCanonicalJsonBytes`, and `sha256Hex`.
The first symbol is one committed lowercase 64-hex literal for the reviewed
runtime bytes. The zero-argument fixture is the only executable-code transport;
it returns exact ordered `{bytes,sha256}`, never a function, renderer, contract,
dependency, selector, or caller-owned object.

```js
// server/services/deployment/canonical-json.mjs after Foundation main Task 1
// Main Task 1 also exports the literal CANONICAL_JSON_INLINE_RUNTIME_SHA256.
export function createCanonicalJsonInlineRuntimeFixture() {}
export function parseCanonicalJsonBytes(bytes, contract) {}
export function serializeCanonicalJsonBytes(value, contract) {}
export function sha256Hex(bytes) {}

// consumer-owned contract shape; not a canonical-json.mjs export
const EXAMPLE_CONTRACT = Object.freeze({
  schemaId: "control-plane-example-v1",
  maxBytes: 16_384,
  fieldOrder: ["schemaVersion", "logicalId", "sha256"],
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1") throw new Error("canonical_schema_version_invalid");
    if (!/^[a-z0-9-]{1,64}$/.test(value.logicalId)) throw new Error("canonical_logical_id_invalid");
    if (!/^[0-9a-f]{64}$/.test(value.sha256)) throw new Error("canonical_sha256_invalid");
  }
});
```

`fieldOrder`, `nested`, and `arrays` are executable parts of every canonical
contract, not documentation hints. `nested[fieldName]` names the contract for a
direct child object; a string `arrays[fieldName]` selects an object-element
contract from the same `nested` registry. A primitive-array descriptor is a
frozen `{ elementType }` record, where `elementType` is exactly `string`,
`boolean`, `safeInteger`, or `null`; domain restrictions remain in that
contract's `validate`. Every object level must have exactly its `fieldOrder`,
and every object or array value must have an explicit `nested`/`arrays`
declaration. Undeclared structured values, missing or unknown fields, sparse
arrays, invalid element types, and a missing/unknown child contract are closed
failures.

```js
// server/services/deployment/durable-store.mjs
export function createDurableStore({ contracts, fsOps, native }) {
  return {
    publishImmutable(logicalId, bytes) {},
    casCanonical(logicalId, expectedSha256, nextBytes) {},
    unlinkVerified(logicalId, expectedSha256) {},
    readbackExact(logicalId, expectedSha256) {}
  };
}
```

```js
// ops/control-plane-deploy/native/index.mjs
export function probeLinuxCapabilities() {}
export function createSealedMemfd({ label, bytes, inheritableFd }) {}
export function createBoundedCapture({ label, maxBytes, inheritableFd }) {}
export function spawnWithExactFileDescriptors({ executableId, descriptors, environmentId, timeoutMs }) {}
export function durableReadLogical({ directoryFd, logicalId, expectedSha256 }) {}
export function durablePublishNoReplace({ directoryFd, logicalId, bytes }) {}
export function durableCompareAndSwap({ directoryFd, logicalId, expectedSha256, nextBytes }) {}
export function durableUnlinkVerified({ directoryFd, logicalId, expectedSha256 }) {}
export function createDatabaseIdentityLease({ lockFd, mode, ownerToken }) {}
export function sendDatabaseCapability({ socketFd, databaseFd, identityLeaseFd, expectedPeer, invocationSha256 }) {}
export function receiveDatabaseCapability({ socketFd, expectedPeer, expectedInvocationSha256 }) {}
export function inspectSqliteMainHandle({ databaseToken, expectedDatabaseIdentityHmacSha256, hmacKeyFd }) {}
export function durableWriteFile({ directoryFd, name, bytes, mode }) {}
export function durableSwapSymlink({ directoryFd, name, targetName }) {}
export function durableUnlink({ directoryFd, name }) {}
```

`durableReadLogical`, `durablePublishNoReplace`, `durableCompareAndSwap`, and
`durableUnlinkVerified` accept only logical IDs present in the compiled reviewed
record registry; they never accept a relative or absolute path. The three
mutation primitives return a closed outcome plus the verified resulting digest
or absence state. Publish accepts an existing record only when its bytes are
exactly equal. CAS accepts either the exact expected predecessor or an exact-byte
already-applied successor; every other predecessor is a mismatch. Verified
unlink returns `already_absent` only when a registered durable unlink replay
marker binds the same logical ID and expected predecessor digest; an absent
record without that exact marker is a mismatch, not idempotent success.

The only extension surface for logical records, `executableId`, `environmentId`,
compile profiles, and standalone targets is the tracked build-time
`reviewed-native-registry-manifest.json`. Every fragment is a direct child of
`ops/control-plane-deploy/native/registry/`; nested, absolute, traversing,
symlinked, environment-selected, or out-of-directory fragments are rejected.
Each ordered manifest entry binds the fragment basename, kind, and exact SHA-256.
An unlisted fragment in that directory and a listed fragment with digest drift
both stop the build. Bootstrap may add its reviewed C source, one canonical
registry fragment, and that fragment's manifest entry. It must reuse the frozen
compile profile and build adapter; it cannot edit Foundation fragments, add a
second fragment directory, add flags or output paths, or grow the N-API/JavaScript
ABI. `spawnWithExactFileDescriptors` remains the sole public spawn export.

### Task 1: Add The Foundation-Owned Canonical Runtime Fixture — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** Task 1 is a dormant schedule,
> not current execution authority. Do not create a Foundation worktree, branch,
> or packet; edit its source; run any RED, GREEN, validation, staging, or commit
> command below; or create a Task 1 commit. Retain the commands only as the
> future schedule after every Global Constraints prerequisite and a separately
> approved Risk-A resume are satisfied.

**Files:**

- Future-only consume unchanged after a separately authorized authority-bootstrap predecessor merge: `server/services/deployment/strict-json-scan.mjs`
- Modify the existing predecessor-owned three-export module: `server/services/deployment/canonical-json.mjs`
- Modify the existing predecessor-owned baseline test: `server/tests/control-plane-canonical-json.test.mjs`

**Interfaces:**

- Consumes: the authority-bootstrap module's exact three exports `parseCanonicalJsonBytes`, `serializeCanonicalJsonBytes`, and `sha256Hex`, its unchanged sibling duplicate-key scanner, only `Buffer`, `TextDecoder`, literal `node:crypto`, and frozen in-process contracts. The normal ESM codec may import only its sibling scanner plus `node:crypto`; the new strict CommonJS runtime body is self-contained and has exactly one literal `require("node:crypto")`.
- Produces exactly and only: literal `CANONICAL_JSON_INLINE_RUNTIME_SHA256`; arity-zero `createCanonicalJsonInlineRuntimeFixture() -> Object.freeze({bytes,sha256})` with exact key order; `parseCanonicalJsonBytes(bytes, contract)`; `serializeCanonicalJsonBytes(value, contract)`; and `sha256Hex(bytes)`. Every fixture call returns a fresh owned Buffer with byte-identical LF-only content, exactly one trailing LF, length `1..65_536`, and digest equal to both its wrapper `sha256` and the exported constant. It accepts no argument, dependency, contract, path, environment, token, renderer, or selector.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Preserve the baseline corpus and write failing runtime-fixture tests**

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createContext, Script } from "node:vm";
import * as canonicalJson from "../services/deployment/canonical-json.mjs";

const {
  CANONICAL_JSON_INLINE_RUNTIME_SHA256,
  createCanonicalJsonInlineRuntimeFixture,
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} = canonicalJson;

const CANONICAL_JSON_EXPORTS = Object.freeze([
  "CANONICAL_JSON_INLINE_RUNTIME_SHA256",
  "createCanonicalJsonInlineRuntimeFixture",
  "parseCanonicalJsonBytes",
  "serializeCanonicalJsonBytes",
  "sha256Hex"
]);

const METADATA_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-metadata-v1",
  maxBytes: 128,
  fieldOrder: Object.freeze(["owner", "enabled"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (!/^[a-z]{1,16}$/.test(value.owner) || typeof value.enabled !== "boolean") {
      throw new Error("foundation-fixture-metadata-v1_domain_invalid");
    }
  }
});

const CHECK_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-check-v1",
  maxBytes: 256,
  fieldOrder: Object.freeze(["checkId", "metadata", "tags"]),
  nested: Object.freeze({ metadata: METADATA_CONTRACT }),
  arrays: Object.freeze({
    tags: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    if (!/^[a-z0-9-]{1,16}$/.test(value.checkId)
        || (Array.isArray(value.tags)
          && value.tags.every((tag) => typeof tag === "string")
          && !value.tags.every((tag) => /^[a-z]{1,12}$/.test(tag)))) {
      throw new Error("foundation-fixture-check-v1_domain_invalid");
    }
  }
});

const PROFILE_CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-profile-v1",
  maxBytes: 128,
  fieldOrder: Object.freeze(["name", "generation"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (!/^[a-z]{1,16}$/.test(value.name)
        || !Number.isSafeInteger(value.generation)
        || value.generation < 0) {
      throw new Error("foundation-fixture-profile-v1_domain_invalid");
    }
  }
});

const CONTRACT = Object.freeze({
  schemaId: "foundation-fixture-v1",
  maxBytes: 2048,
  fieldOrder: Object.freeze(["schemaVersion", "logicalId", "count", "profile", "checks", "labels"]),
  nested: Object.freeze({
    profile: PROFILE_CONTRACT,
    "check-v1": CHECK_CONTRACT
  }),
  arrays: Object.freeze({
    checks: "check-v1",
    labels: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    if (value.schemaVersion !== "1"
        || !/^[a-z0-9-]{1,16}$/.test(value.logicalId)
        || !Number.isSafeInteger(value.count)
        || value.count < 0
        || (Array.isArray(value.labels)
          && value.labels.every((label) => typeof label === "string")
          && !value.labels.every((label) => /^[a-z]{1,12}$/.test(label)))) {
      throw new Error("foundation-fixture-v1_domain_invalid");
    }
  }
});

test("rejects duplicate keys before JSON.parse", () => {
  assert.throws(
    () => parseCanonicalJsonBytes(
      Buffer.from('{"schemaVersion":"1","logicalId":"a","logicalId":"b","count":1,"profile":{},"checks":[],"labels":[]}'),
      CONTRACT
    ),
    /canonical_json_duplicate_key/
  );
});

test("serializes the frozen field order without newline", () => {
  const bytes = serializeCanonicalJsonBytes(
    {
      labels: ["stable"],
      checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
      profile: { generation: 7, name: "linux" },
      count: 1,
      logicalId: "alpha",
      schemaVersion: "1"
    },
    CONTRACT
  );
  assert.equal(bytes.toString("utf8"), '{"schemaVersion":"1","logicalId":"alpha","count":1,"profile":{"name":"linux","generation":7},"checks":[{"checkId":"build","metadata":{"owner":"ops","enabled":true},"tags":["native"]}],"labels":["stable"]}');
  assert.equal(sha256Hex(bytes).length, 64);
});

test("deep object key permutations produce the same exact bytes", () => {
  const first = serializeCanonicalJsonBytes({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  }, CONTRACT);
  const permuted = serializeCanonicalJsonBytes({
    labels: ["stable"],
    checks: [{ tags: ["native"], metadata: { enabled: true, owner: "ops" }, checkId: "build" }],
    profile: { generation: 7, name: "linux" },
    count: 1,
    logicalId: "alpha",
    schemaVersion: "1"
  }, CONTRACT);
  assert.deepEqual(first, permuted);

  const semanticallyDifferent = serializeCanonicalJsonBytes({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "release", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  }, CONTRACT);
  assert.notDeepEqual(first, semanticallyDifferent);
});

test("rejects deep missing, deep unknown, and invalid array elements", () => {
  const valid = {
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: { name: "linux", generation: 7 },
    checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: ["native"] }],
    labels: ["stable"]
  };
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, profile: { name: "linux" } }, CONTRACT),
    /foundation-fixture-profile-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true, extra: false }, tags: ["native"] }]
    }, CONTRACT),
    /foundation-fixture-metadata-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: [null] }, CONTRACT),
    /foundation-fixture-check-v1_object_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, labels: [1] }, CONTRACT),
    /foundation-fixture-v1_labels_array_element_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({
      ...valid,
      checks: [{ checkId: "build", metadata: { owner: "ops", enabled: true }, tags: [1] }]
    }, CONTRACT),
    /foundation-fixture-check-v1_tags_array_element_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, rootExtra: true }, CONTRACT),
    /foundation-fixture-v1_fields_invalid/
  );
  const sparseChecks = new Array(1);
  assert.throws(
    () => serializeCanonicalJsonBytes({ ...valid, checks: sparseChecks }, CONTRACT),
    /foundation-fixture-v1_checks_array_sparse/
  );
  const missingChildContract = Object.freeze({
    ...CONTRACT,
    nested: Object.freeze({ profile: PROFILE_CONTRACT })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, missingChildContract),
    /foundation-fixture-v1_checks_array_contract_invalid/
  );
  const undeclaredChecks = Object.freeze({
    ...CONTRACT,
    arrays: Object.freeze({
      labels: Object.freeze({ elementType: "string" })
    })
  });
  assert.throws(
    () => serializeCanonicalJsonBytes(valid, undeclaredChecks),
    /foundation-fixture-v1_checks_structured_contract_missing/
  );
});

test("freezes the exact namespace and returns a fresh hash-bound runtime fixture", () => {
  assert.deepEqual(Object.keys(canonicalJson), CANONICAL_JSON_EXPORTS);
  assert.equal(createCanonicalJsonInlineRuntimeFixture.length, 0);
  assert.throws(
    () => createCanonicalJsonInlineRuntimeFixture("selector"),
    /canonical_json_inline_runtime_arguments_invalid/
  );

  const first = createCanonicalJsonInlineRuntimeFixture();
  const second = createCanonicalJsonInlineRuntimeFixture();
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(Object.keys(first), ["bytes", "sha256"]);
  assert.equal(Buffer.isBuffer(first.bytes), true);
  assert.equal(first.bytes === second.bytes, false);
  assert.deepEqual(first.bytes, second.bytes);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.sha256, CANONICAL_JSON_INLINE_RUNTIME_SHA256);
  assert.equal(createHash("sha256").update(first.bytes).digest("hex"), first.sha256);
  assert.ok(first.bytes.length > 0 && first.bytes.length <= 65_536);
  assert.equal(first.bytes.includes(0x0d), false);
  assert.equal(first.bytes.at(-1), 0x0a);
  assert.notEqual(first.bytes.at(-2), 0x0a);

  const stableBytes = Buffer.from(second.bytes);
  first.bytes.fill(0);
  assert.deepEqual(createCanonicalJsonInlineRuntimeFixture().bytes, stableBytes);
});

function runCanonicalJsonInlineRuntimeInFreshVm(bytes) {
  const requestedModules = [];
  const context = createContext({
    Buffer,
    TextDecoder,
    require(specifier) {
      requestedModules.push(specifier);
      if (specifier !== "node:crypto") {
        throw new Error("canonical_json_inline_runtime_require_forbidden");
      }
      return Object.freeze({ createHash });
    }
  }, {
    codeGeneration: Object.freeze({ strings: false, wasm: false })
  });
  new Script(bytes.toString("utf8"), {
    filename: "canonical-json-inline-runtime.cjs"
  }).runInContext(context, { timeout: 1_000 });
  const probe = new Script(`Object.freeze({
    runtime: CANONICAL_JSON_INLINE_RUNTIME,
    parseCanonicalJsonBytes,
    serializeCanonicalJsonBytes,
    sha256Hex
  })`).runInContext(context, { timeout: 1_000 });
  assert.deepEqual(requestedModules, ["node:crypto"]);
  return Object.freeze({ context, ...probe });
}

const CANONICAL_JSON_REALM_FIXTURE_BUILDER = new Script(`(() => {
  const metadataContract = Object.freeze({
    schemaId: "foundation-fixture-metadata-v1",
    maxBytes: 128,
    fieldOrder: Object.freeze(["owner", "enabled"]),
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate(value) {
      if (!/^[a-z]{1,16}$/.test(value.owner) || typeof value.enabled !== "boolean") {
        throw new Error("foundation-fixture-metadata-v1_domain_invalid");
      }
    }
  });
  const checkContract = Object.freeze({
    schemaId: "foundation-fixture-check-v1",
    maxBytes: 256,
    fieldOrder: Object.freeze(["checkId", "metadata", "tags"]),
    nested: Object.freeze({ metadata: metadataContract }),
    arrays: Object.freeze({ tags: Object.freeze({ elementType: "string" }) }),
    validate(value) {
      if (!/^[a-z0-9-]{1,16}$/.test(value.checkId)
          || (Array.isArray(value.tags)
            && value.tags.every((tag) => typeof tag === "string")
            && !value.tags.every((tag) => /^[a-z]{1,12}$/.test(tag)))) {
        throw new Error("foundation-fixture-check-v1_domain_invalid");
      }
    }
  });
  const profileContract = Object.freeze({
    schemaId: "foundation-fixture-profile-v1",
    maxBytes: 128,
    fieldOrder: Object.freeze(["name", "generation"]),
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate(value) {
      if (!/^[a-z]{1,16}$/.test(value.name)
          || !Number.isSafeInteger(value.generation)
          || value.generation < 0) {
        throw new Error("foundation-fixture-profile-v1_domain_invalid");
      }
    }
  });
  const contract = Object.freeze({
    schemaId: "foundation-fixture-v1",
    maxBytes: 2048,
    fieldOrder: Object.freeze([
      "schemaVersion", "logicalId", "count", "profile", "checks", "labels"
    ]),
    nested: Object.freeze({
      profile: profileContract,
      "check-v1": checkContract
    }),
    arrays: Object.freeze({
      checks: "check-v1",
      labels: Object.freeze({ elementType: "string" })
    }),
    validate(value) {
      if (value.schemaVersion !== "1"
          || !/^[a-z0-9-]{1,16}$/.test(value.logicalId)
          || !Number.isSafeInteger(value.count)
          || value.count < 0
          || (Array.isArray(value.labels)
            && value.labels.every((label) => typeof label === "string")
            && !value.labels.every((label) => /^[a-z]{1,12}$/.test(label)))) {
        throw new Error("foundation-fixture-v1_domain_invalid");
      }
    }
  });
  const value = Object.freeze({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: Object.freeze({ name: "linux", generation: 7 }),
    checks: Object.freeze([Object.freeze({
      checkId: "build",
      metadata: Object.freeze({ owner: "ops", enabled: true }),
      tags: Object.freeze(["native"])
    })]),
    labels: Object.freeze(["stable"])
  });
  return Object.freeze({ contract, value });
})()`, { filename: "canonical-json-inline-runtime-fixture-builder.test.cjs" });

function createCanonicalJsonRealmFixture(context) {
  return CANONICAL_JSON_REALM_FIXTURE_BUILDER.runInContext(context, {
    timeout: 1_000
  });
}

test("runs the exact lexical runtime in a strict fresh VM with normal-module parity", () => {
  const fixture = createCanonicalJsonInlineRuntimeFixture();
  const probe = runCanonicalJsonInlineRuntimeInFreshVm(fixture.bytes);
  assert.equal(Object.isFrozen(probe.runtime), true);
  assert.deepEqual(
    Array.from(Object.keys(probe.runtime)),
    ["parseCanonicalJsonBytes", "serializeCanonicalJsonBytes", "sha256Hex"]
  );
  assert.equal(probe.runtime.parseCanonicalJsonBytes, probe.parseCanonicalJsonBytes);
  assert.equal(probe.runtime.serializeCanonicalJsonBytes, probe.serializeCanonicalJsonBytes);
  assert.equal(probe.runtime.sha256Hex, probe.sha256Hex);

  const value = Object.freeze({
    schemaVersion: "1",
    logicalId: "alpha",
    count: 1,
    profile: Object.freeze({ name: "linux", generation: 7 }),
    checks: Object.freeze([Object.freeze({
      checkId: "build",
      metadata: Object.freeze({ owner: "ops", enabled: true }),
      tags: Object.freeze(["native"])
    })]),
    labels: Object.freeze(["stable"])
  });
  const realmFixture = createCanonicalJsonRealmFixture(probe.context);
  const expected = serializeCanonicalJsonBytes(value, CONTRACT);
  const observed = probe.serializeCanonicalJsonBytes(
    realmFixture.value,
    realmFixture.contract
  );
  assert.deepEqual(Buffer.from(observed), expected);
  assert.equal(probe.sha256Hex(observed), sha256Hex(expected));
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      probe.parseCanonicalJsonBytes(observed, realmFixture.contract)
    )),
    JSON.parse(JSON.stringify(value))
  );
});

test("rejects host-realm records and succeeds only with realm-local fixtures", () => {
  const probe = runCanonicalJsonInlineRuntimeInFreshVm(
    createCanonicalJsonInlineRuntimeFixture().bytes
  );
  const realmFixture = createCanonicalJsonRealmFixture(probe.context);
  const hostValue = JSON.parse(JSON.stringify(realmFixture.value));
  assert.throws(
    () => probe.serializeCanonicalJsonBytes(hostValue, realmFixture.contract),
    /foundation-fixture-v1_object_invalid/
  );
  assert.doesNotThrow(
    () => probe.serializeCanonicalJsonBytes(realmFixture.value, realmFixture.contract)
  );
});

function captureCanonicalJsonFailure(operation) {
  let observed;
  try {
    operation();
  } catch (error) {
    observed = Object.freeze({
      name: error?.name,
      constructorName: error?.constructor?.name,
      message: error?.message
    });
  }
  assert.ok(observed, "canonical_json_expected_failure_missing");
  return observed;
}

test("the fresh VM differentially cross-rejects the canonical fault corpus", () => {
  const execution = runCanonicalJsonInlineRuntimeInFreshVm(
    createCanonicalJsonInlineRuntimeFixture().bytes
  );
  const normalParseFaults = canonicalJsonInlineRuntimeFaultCorpus(CONTRACT);
  const runtimeParseFaults = canonicalJsonInlineRuntimeRealmFaultCorpus(
    execution.context
  );
  assert.deepEqual(
    Array.from(runtimeParseFaults, ({ caseId }) => caseId),
    normalParseFaults.map(({ caseId }) => caseId)
  );
  for (let index = 0; index < normalParseFaults.length; index += 1) {
    const { bytes, pattern } = normalParseFaults[index];
    const runtimeFault = runtimeParseFaults[index];
    const normalFailure = captureCanonicalJsonFailure(
      () => parseCanonicalJsonBytes(bytes, CONTRACT)
    );
    const runtimeFailure = captureCanonicalJsonFailure(
      () => execution.runtime.parseCanonicalJsonBytes(
        runtimeFault.bytes,
        runtimeFault.contract
      )
    );
    assert.match(normalFailure.message, pattern);
    assert.deepEqual(runtimeFailure, normalFailure);
  }
  const normalValueFaults = canonicalJsonInlineRuntimeValueFaultCorpus(CONTRACT);
  const runtimeValueFaults = canonicalJsonInlineRuntimeRealmValueFaultCorpus(
    execution.context
  );
  assert.deepEqual(
    Array.from(runtimeValueFaults, ({ caseId }) => caseId),
    normalValueFaults.map(({ caseId }) => caseId)
  );
  for (let index = 0; index < normalValueFaults.length; index += 1) {
    const { value, contract, pattern } = normalValueFaults[index];
    const runtimeFault = runtimeValueFaults[index];
    const normalFailure = captureCanonicalJsonFailure(
      () => serializeCanonicalJsonBytes(value, contract)
    );
    const runtimeFailure = captureCanonicalJsonFailure(
      () => execution.runtime.serializeCanonicalJsonBytes(
        runtimeFault.value,
        runtimeFault.contract
      )
    );
    assert.match(normalFailure.message, pattern);
    assert.deepEqual(runtimeFailure, normalFailure);
  }
});

test("source drift, forbidden authority, and dynamic code mutations all reject", () => {
  const fixture = createCanonicalJsonInlineRuntimeFixture();
  for (const mutation of canonicalJsonInlineRuntimeSourceMutations(fixture.bytes)) {
    assert.throws(
      () => assertCanonicalJsonInlineRuntimeFixtureForTest({
        bytes: mutation.bytes,
        sha256: mutation.sha256 ?? fixture.sha256
      }),
      mutation.pattern
    );
  }
});
```

The six test-local corpus/mutation/assertion helpers invoked above are
implemented in that same test file as frozen test data and closure checks, not
module exports. `canonicalJsonInlineRuntimeFaultCorpus` covers duplicate keys at
root and depth, noncanonical order/whitespace/trailing bytes, BOM, invalid UTF-8,
unknown/missing fields, missing nested contracts, arrays of nested objects,
primitive arrays, sparse/invalid elements, unsafe integers, and recursive/root
byte limits. `canonicalJsonInlineRuntimeValueFaultCorpus` applies the same
contract, nested-object, and array failures directly to serialization. Every
positive and negative row runs once through the normal ESM functions and once
through a newly created VM; error class/message and canonical bytes/digest must
match. The two `...Realm...FaultCorpus` helpers execute fixed builder scripts in
that same fresh context and construct every contract, nested/array descriptor,
value, and invalid variant in the VM realm, paired to the host corpus by exact
`caseId`; no host-realm record or contract is passed to the VM codec. The
explicit host-record rejection proves the plain-record realm boundary, while
the realm-local success row models Artifact's inline call, where runtime,
contract, and parsed/value records all share one context.

`assertCanonicalJsonInlineRuntimeFixtureForTest` independently verifies the
committed digest, `1..65_536` byte cap, UTF-8/LF-only form, exactly one trailing
LF, strict first statement, exact declarations, frozen exact runtime keys, and
exactly one literal `require("node:crypto")`. The mutation table covers changed,
missing, doubled, or CRLF terminators; empty/oversize/hash-drift bytes; another
or computed `require`; static/dynamic `import`; `process`, `globalThis`,
environment, filesystem, path, URL/fetch, HTTP(S), DNS, socket, child-process,
secret, credential, and token access; `eval`, `Function`, WebAssembly, and other
dynamic-code construction; an application free identifier; a changed runtime
key/reference; and any caller-supplied or baked-in contract, selector, renderer,
path, or dependency used to construct or choose the source.
Hash mutations reject before VM execution, while each forbidden-authority row is
also re-hashed in test and must still fail the independent source-closure check.
The only non-lexical names allowed by that check are the fixed CommonJS
`require`, standard ECMAScript intrinsics, `Buffer`, and `TextDecoder`; no
application or caller binding is in the allowlist.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the focused test and verify RED without changing the bootstrap baseline**

Run:

```powershell
node --test server/tests/control-plane-canonical-json.test.mjs
```

Expected: the predecessor's existing duplicate/canonical codec rows still pass,
while the new namespace/factory rows fail because
`CANONICAL_JSON_INLINE_RUNTIME_SHA256` and
`createCanonicalJsonInlineRuntimeFixture` do not yet exist. Any failure in the
three inherited exports or scanner is a hard stop; do not repair or alter their
behavior while adding the two Foundation main-PR exports.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the two-export runtime extension in the existing module**

The following excerpt is the approved predecessor ordinary-module codec core.
Keep `strict-json-scan.mjs` unchanged and preserve these three export behaviors
while modifying the existing `canonical-json.mjs` and its existing test to add
the hash-frozen inline-runtime literal/factory specified immediately below. This
is a Foundation main-PR implementation step, not authority-bootstrap scope:

```js
// strict-json-scan.mjs
export function assertNoDuplicateObjectKeys(text) {
  const stack = [];
  let index = 0;
  let pendingKey = false;

  function skipWhitespace() {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1;
  }

  function readString() {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") { index += 2; continue; }
      if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      }
      if (text.charCodeAt(index) < 0x20) throw new Error("canonical_json_control_character");
      index += 1;
    }
    throw new Error("canonical_json_unterminated_string");
  }

  while (index < text.length) {
    skipWhitespace();
    const token = text[index];
    if (token === "{") { stack.push({ type: "object", keys: new Set(), expectingKey: true }); index += 1; continue; }
    if (token === "[") { stack.push({ type: "array" }); index += 1; continue; }
    if (token === "}" || token === "]") { stack.pop(); index += 1; continue; }
    if (token === ",") {
      const top = stack.at(-1);
      if (top?.type === "object") top.expectingKey = true;
      index += 1;
      continue;
    }
    if (token === ":") { pendingKey = false; index += 1; continue; }
    if (token === '"') {
      const value = readString();
      const top = stack.at(-1);
      if (top?.type === "object" && top.expectingKey) {
        if (top.keys.has(value)) throw new Error("canonical_json_duplicate_key");
        top.keys.add(value);
        top.expectingKey = false;
        pendingKey = true;
      }
      continue;
    }
    const delimiter = text.slice(index).search(/[\s,}\]]/);
    index = delimiter < 0 ? text.length : index + delimiter;
  }
  if (stack.length !== 0 || pendingKey) throw new Error("canonical_json_structure_invalid");
}
```

```js
// canonical-json.mjs
import { createHash } from "node:crypto";
import { assertNoDuplicateObjectKeys } from "./strict-json-scan.mjs";

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainRecord(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactFields(value, contract) {
  if (!isPlainRecord(value)) throw new Error(`${contract.schemaId}_object_invalid`);
  const keys = Object.keys(value);
  if (keys.length !== contract.fieldOrder.length
      || contract.fieldOrder.some((key) => !Object.hasOwn(value, key))
      || keys.some((key) => !contract.fieldOrder.includes(key))) {
    throw new Error(`${contract.schemaId}_fields_invalid`);
  }
}

function assertCanonicalScalar(value, schemaId, field) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isSafeInteger(value)) return;
  throw new Error(`${schemaId}_${field}_scalar_invalid`);
}

function assertDenseArray(value, contract, field) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new Error(`${contract.schemaId}_${field}_array_sparse`);
    }
  }
}

function canonicalizePrimitiveArray(value, descriptor, contract, field) {
  if (!isPlainRecord(descriptor)
      || !Object.isFrozen(descriptor)
      || Object.keys(descriptor).length !== 1
      || !Object.hasOwn(descriptor, "elementType")
      || !["string", "boolean", "safeInteger", "null"].includes(descriptor.elementType)) {
    throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
  }
  assertDenseArray(value, contract, field);
  return value.map((element) => {
    const valid = descriptor.elementType === "null"
      ? element === null
      : descriptor.elementType === "safeInteger"
        ? Number.isSafeInteger(element)
        : typeof element === descriptor.elementType;
    if (!valid) throw new Error(`${contract.schemaId}_${field}_array_element_invalid`);
    return element;
  });
}

function canonicalizeObject(value, contract) {
  assertExactFields(value, contract);
  contract.validate(value);
  const ordered = {};
  for (const field of contract.fieldOrder) {
    const fieldValue = value[field];
    if (Object.hasOwn(contract.arrays, field)) {
      if (!Array.isArray(fieldValue)) throw new Error(`${contract.schemaId}_${field}_array_invalid`);
      assertDenseArray(fieldValue, contract, field);
      const descriptor = contract.arrays[field];
      if (typeof descriptor === "string") {
        const elementContract = contract.nested[descriptor];
        if (!elementContract) throw new Error(`${contract.schemaId}_${field}_array_contract_invalid`);
        ordered[field] = fieldValue.map((element) => canonicalizeObject(element, elementContract));
      } else {
        ordered[field] = canonicalizePrimitiveArray(fieldValue, descriptor, contract, field);
      }
      continue;
    }
    if (Object.hasOwn(contract.nested, field)) {
      ordered[field] = canonicalizeObject(fieldValue, contract.nested[field]);
      continue;
    }
    if (Array.isArray(fieldValue) || isPlainRecord(fieldValue)) {
      throw new Error(`${contract.schemaId}_${field}_structured_contract_missing`);
    }
    assertCanonicalScalar(fieldValue, contract.schemaId, field);
    ordered[field] = fieldValue;
  }
  const nestedBytes = Buffer.from(JSON.stringify(ordered), "utf8");
  if (nestedBytes.length > contract.maxBytes) throw new Error(`${contract.schemaId}_too_large`);
  return ordered;
}

export function serializeCanonicalJsonBytes(value, contract) {
  const ordered = canonicalizeObject(value, contract);
  const bytes = Buffer.from(JSON.stringify(ordered), "utf8");
  return bytes;
}

export function parseCanonicalJsonBytes(bytes, contract) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > contract.maxBytes) {
    throw new Error(`${contract.schemaId}_bytes_invalid`);
  }
  const text = DECODER.decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) throw new Error("canonical_json_bom_forbidden");
  assertNoDuplicateObjectKeys(text);
  const value = JSON.parse(text);
  const canonical = serializeCanonicalJsonBytes(value, contract);
  if (!bytes.equals(canonical)) throw new Error("canonical_json_bytes_mismatch");
  return value;
}
```

The inline body is one reviewed LF-only CommonJS source literal, begins with
`"use strict";`, ends with exactly one LF, and is no larger than 65,536 bytes.
It is not assembled from `Function.prototype.toString`, a contract method's
`toString`, interpolated executable fragments, a renderer, `eval`, `Function`,
or caller data. Its only module request is exactly one static literal
`require("node:crypto")`. Within that body, the complete duplicate-key scanner
and canonical parser/serializer are self-contained; lexical
`parseCanonicalJsonBytes`, `serializeCanonicalJsonBytes`, and `sha256Hex` are
defined before exact ordered
`Object.freeze({parseCanonicalJsonBytes,serializeCanonicalJsonBytes,sha256Hex})`
is assigned to lexical `CANONICAL_JSON_INLINE_RUNTIME`. It has no application
free variable, environment, filesystem, network, dynamic-code, path, token,
secret, caller dependency, or selector used to construct or choose its source.
After VM load, the lexical parse/serialize calls still accept only their
ordinary explicit frozen contract argument. This runtime transports only the
canonical codec: it owns no DSSE, Fulcio, Rekor, SCT, OIDC, Sigstore, trust,
attestation, publication, or deployment decision.

The module stores those reviewed bytes privately and exports their final actual
lowercase SHA-256 as the literal
`CANONICAL_JSON_INLINE_RUNTIME_SHA256`; a placeholder or install-time digest is
forbidden. `createCanonicalJsonInlineRuntimeFixture()` explicitly rejects a
nonzero `arguments.length`, revalidates the private bytes against the literal,
and returns a newly allocated Buffer in frozen exact ordered
`{bytes,sha256}`. Mutating one returned Buffer cannot mutate the private source
or any later result. The normal ESM exports and inline lexical functions share
one reviewed algorithm but the emitted body is a reviewed literal, never a
runtime reconstruction of either exported function.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Run the focused test and verify GREEN**

Run: `node --test server/tests/control-plane-canonical-json.test.mjs`

Expected: PASS, including the exact five-export namespace; zero arity and
argument rejection; frozen exact fixture keys; fresh Buffer ownership; literal,
wrapper, and recomputed hash equality; LF/cap checks; strict fresh-VM lexical
runtime execution; explicit host-realm record rejection plus realm-local
success; separately constructed host/VM normal-runtime differential parity;
duplicate key, BOM,
invalid UTF-8, whitespace, root/deep field-order, root/deep missing and unknown
fields, undeclared structured values, nested-object/array contract faults,
sparse/invalid array elements, primitive-array descriptors, unsafe integer,
recursive max-byte, semantic-equality permutation, semantic-difference, and root
max-byte cases; plus every forbidden-authority and source-drift mutation.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Commit the Foundation-owned runtime fixture extension**

```powershell
git diff --exit-code -- server/services/deployment/strict-json-scan.mjs
git add server/services/deployment/canonical-json.mjs server/tests/control-plane-canonical-json.test.mjs
git diff --cached --check
git commit -m "feat: add canonical inline runtime fixture"
```

Expected: the scanner remains byte-identical to the authority-bootstrap
predecessor; the commit changes exactly the existing `canonical-json.mjs` and
its existing test, adding only the two runtime-fixture exports/tests while
preserving the predecessor's three-function behavior. There is no generated
fourth source, copied runtime fragment, consumer-owned serializer, or change to
the approved authority-bootstrap 11-file inventory.

This checkpoint is a strict provider edge. Artifact Task 6 may later import only
`CANONICAL_JSON_INLINE_RUNTIME_SHA256` and
`createCanonicalJsonInlineRuntimeFixture` for executable transport, must
recompute the fixture digest before embedding the exact bytes unchanged, and
must keep using the normal ESM exports for ordinary in-process calls. It may not
copy/reconstruct the scanner or serializer, compose executable source from any
function or contract `toString`, accept a caller runtime, or treat the fixture
as attestation or publication authority. Artifact Task 6 cannot begin until
this Foundation main Task 1 commit is complete.

### Task 2: Logical Durable Store — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** Task 2 is a dormant schedule,
> not current execution authority. Do not create a Foundation worktree, branch,
> or packet; edit its source; run any RED, GREEN, validation, staging, or commit
> command below; or create a Task 2 commit. Retain the commands only as the
> future schedule after every Global Constraints prerequisite, future Task 1,
> and a separately approved Risk-A resume are satisfied.

**Files:**

- Create: `server/services/deployment/foundation-contract.mjs`
- Create: `server/services/deployment/durable-store.mjs`
- Test: `server/tests/control-plane-durable-store.test.mjs`

**Interfaces:**

- Consumes: Task 1 `sha256Hex` plus the Foundation native fixed-logical-ID
  `durableReadLogical`, `durablePublishNoReplace`,
  `durableCompareAndSwap`, and `durableUnlinkVerified` operations implemented
  in Task 4.
- Produces: immutable publish, exact CAS, exact readback, and exact durable
  unlink without exposing a caller-selected path or performing a mutation as a
  JavaScript read followed by a second native write.
- Produces the frozen Foundation contract arrays shown in Shared Interfaces so
  this task and every later task consume the same four atomic exports, 15 native
  exports, nine compiler flags, and 14 feasibility features.
- The `contracts` map is a closed allowlist keyed by the same reviewed logical
  IDs compiled into the native record registry. It supplies only schema and
  byte-limit validation; it contains no relative path, mode override, lock
  name, or rename target.
- The only constructor signature is
  `createDurableStore({ contracts, fsOps, native })`. There is no positional,
  single-adapter, inferred-default, or overload form; every test harness must
  destructure those exact three dependencies and pass the named object.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Write failing atomic-delegation and idempotency tests**

```js
import { ATOMIC_LOGICAL_RECORD_EXPORTS } from "../services/deployment/foundation-contract.mjs";

test("publishes only through the fixed logical record map", async () => {
  const calls = [];
  const store = createDurableStore({
    contracts: new Map([["foundation-test-rotation-journal-v1", { maxBytes: 4096 }]]),
    fsOps: createMemoryFs(),
    native: createRecordingNative(calls)
  });
  const result = await store.publishImmutable("foundation-test-rotation-journal-v1", Buffer.from("{}"));
  assert.equal(result.sha256.length, 64);
  assert.equal(result.outcome, "created");
  assert.deepEqual(calls.map(({ operation }) => operation), ["durablePublishNoReplace"]);
  await assert.rejects(() => store.publishImmutable("../../escape", Buffer.from("{}")), /durable_logical_id_unknown/);
});

test("accepts only the named dependency object with all four atomic exports", () => {
  const harness = createAtomicHarness();
  assert.throws(
    () => createDurableStore({ contracts: harness.contracts, native: harness.native }),
    /durable_store_dependencies_invalid/
  );
  assert.throws(() => createDurableStore({
    contracts: harness.contracts,
    fsOps: harness.fsOps,
    native: harness.native,
    rootPath: "forbidden"
  }), /durable_store_dependencies_invalid/);
  for (const operation of ATOMIC_LOGICAL_RECORD_EXPORTS) {
    const native = { ...harness.native, [operation]: undefined };
    assert.throws(() => createDurableStore({
      contracts: harness.contracts,
      fsOps: harness.fsOps,
      native
    }), /durable_store_dependencies_invalid/);
  }
});

test("CAS is one native transaction and never read-then-write", async () => {
  const calls = [];
  const { contracts, fsOps, native } = createAtomicHarness({ calls });
  const store = createDurableStore({ contracts, fsOps, native });
  const result = await store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    Buffer.from('{"state":"armed"}\n')
  );
  assert.equal(result.outcome, "replaced");
  assert.deepEqual(calls.map(({ operation }) => operation), ["durableCompareAndSwap"]);
  assert.equal(calls.some(({ operation }) => operation === "durableReadLogical"), false);
  assert.equal(calls.some(({ operation }) => operation === "durablePublishNoReplace"), false);
});

test("lost-response replay succeeds only for exact successor bytes", async () => {
  const { contracts, fsOps, native } = createAtomicHarness({ casAlreadyApplied: true });
  const store = createDurableStore({ contracts, fsOps, native });
  const next = Buffer.from('{"state":"in_progress"}\n');
  assert.equal((await store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    next
  )).outcome, "already_equal");
  await assert.rejects(() => store.casCanonical(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64),
    Buffer.from('{"state":"different"}\n')
  ), /durable_cas_digest_mismatch/);
});

test("verified unlink never treats unexplained absence as replay success", async () => {
  const absentHarness = createAtomicHarness({ recordAbsent: true, unlinkMarker: null });
  const store = createDurableStore({
    contracts: absentHarness.contracts,
    fsOps: absentHarness.fsOps,
    native: absentHarness.native
  });
  await assert.rejects(() => store.unlinkVerified(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64)
  ), /durable_unlink_evidence_missing/);
  const replayHarness = createAtomicHarness({
    recordAbsent: true,
    unlinkMarker: { logicalId: "foundation-test-rotation-journal-v1", expectedSha256: "a".repeat(64) }
  });
  const replay = createDurableStore({
    contracts: replayHarness.contracts,
    fsOps: replayHarness.fsOps,
    native: replayHarness.native
  });
  assert.equal((await replay.unlinkVerified(
    "foundation-test-rotation-journal-v1",
    "a".repeat(64)
  )).outcome, "already_absent");
});
```

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the focused test and verify RED**

Run: `node --test server/tests/control-plane-durable-store.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `foundation-contract.mjs`; after
that frozen contract exists, `durable-store.mjs` remains missing. After both
modules first exist, the CAS test remains RED if it calls readback plus publish
instead of the one native atomic primitive.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the closed logical record map over atomic native operations**

Create `foundation-contract.mjs` first with the four exact frozen arrays in
Shared Interfaces, then implement the store against its
`ATOMIC_LOGICAL_RECORD_EXPORTS`. Do not duplicate or reorder those constants in
`durable-store.mjs`.

```js
import { sha256Hex } from "./canonical-json.mjs";
import { ATOMIC_LOGICAL_RECORD_EXPORTS } from "./foundation-contract.mjs";

export function createDurableStore({ contracts, fsOps, native }) {
  const dependencyKeys = Object.keys(arguments[0]).sort();
  if (dependencyKeys.length !== 3
      || dependencyKeys[0] !== "contracts"
      || dependencyKeys[1] !== "fsOps"
      || dependencyKeys[2] !== "native"
      || !(contracts instanceof Map)
      || !Number.isSafeInteger(fsOps?.rootFd)
      || fsOps.rootFd < 0
      || !native
      || ATOMIC_LOGICAL_RECORD_EXPORTS.some((name) => typeof native[name] !== "function")) {
    throw new Error("durable_store_dependencies_invalid");
  }
  function contractFor(logicalId) {
    const contract = contracts.get(logicalId);
    if (!contract) throw new Error("durable_logical_id_unknown");
    return contract;
  }
  function validateBytes(contract, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length > contract.maxBytes) {
      throw new Error("durable_record_too_large");
    }
  }
  async function readbackExact(logicalId, expectedSha256) {
    contractFor(logicalId);
    const result = await native.durableReadLogical({
      directoryFd: fsOps.rootFd,
      logicalId,
      expectedSha256
    });
    if (result.sha256 !== expectedSha256 || sha256Hex(result.bytes) !== expectedSha256) {
      throw new Error("durable_readback_digest_mismatch");
    }
    return result.bytes;
  }
  return Object.freeze({
    async publishImmutable(logicalId, bytes) {
      const contract = contractFor(logicalId);
      validateBytes(contract, bytes);
      const sha256 = sha256Hex(bytes);
      const result = await native.durablePublishNoReplace({
        directoryFd: fsOps.rootFd,
        logicalId,
        bytes
      });
      if (!["created", "already_equal"].includes(result.outcome) || result.sha256 !== sha256) {
        throw new Error("durable_publish_result_invalid");
      }
      return Object.freeze({ outcome: result.outcome, sha256 });
    },
    async casCanonical(logicalId, expectedSha256, nextBytes) {
      const contract = contractFor(logicalId);
      validateBytes(contract, nextBytes);
      const nextSha256 = sha256Hex(nextBytes);
      const result = await native.durableCompareAndSwap({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256,
        nextBytes
      });
      if (!["replaced", "already_equal"].includes(result.outcome) || result.sha256 !== nextSha256) {
        throw new Error("durable_cas_result_invalid");
      }
      return Object.freeze({ outcome: result.outcome, sha256: nextSha256 });
    },
    async unlinkVerified(logicalId, expectedSha256) {
      contractFor(logicalId);
      const result = await native.durableUnlinkVerified({
        directoryFd: fsOps.rootFd,
        logicalId,
        expectedSha256
      });
      if (!["removed", "already_absent"].includes(result.outcome) || result.present !== false) {
        throw new Error("durable_unlink_result_invalid");
      }
      return Object.freeze(result);
    },
    readbackExact
  });
}
```

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Run injected atomic-outcome tests and verify GREEN**

Run: `node --test server/tests/control-plane-durable-store.test.mjs`

Expected: PASS for publish created/exact-byte replay/conflict, CAS
replaced/already-equal/predecessor mismatch, verified unlink removed/eligible
already-absent/mismatch, readback, logical-ID rejection, and size cap. The call
trace for each mutation contains exactly one native atomic mutation and no
preceding `durableReadLogical`. Task 4 owns the real forked multi-process,
OFD-lock, rename/unlink, parent-fsync, and crash-boundary proof for those injected
outcomes.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Commit the durable store**

```powershell
git add server/services/deployment/foundation-contract.mjs server/services/deployment/durable-store.mjs server/tests/control-plane-durable-store.test.mjs
git commit -m "feat: add durable deployment state store"
```

### Task 3: Pinned Native Build Surface — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** The Task 3 main implementation
> is a dormant schedule, not current execution authority. Do not create or
> modify a Task 3 file; run its test, native/toolchain build, registry,
> publication, workflow, validation, staging, or commit commands; or create a
> Task 3 commit now. The exact 11-file predecessor's separately approved
> `pull_request`-only read-only inventory remains the current exception: only
> its owning predecessor plan may run it inside the source-only Draft to emit
> `eligible:false` review evidence. That exception is not a Task 3 step and
> grants no build, publication, Ready, or merge authority. Task 3 becomes
> reachable only after the unified full-Sigstore owner, an owner-postverified
> immutable lock, the complete content-addressed offline npm closure, and an
> explicit separately approved Risk-A resume are all satisfied.

**Files:**

- Create: `ops/control-plane-deploy/native/binding.gyp`
- Create: `ops/control-plane-deploy/native/index.mjs`
- Create: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Create: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-profiles.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-logical-records.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-compile-profiles.json`
- Create: `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json`
- Create: `ops/control-plane-deploy/native/src/foundation-profile-probe.c`
- Create: `ops/control-plane-deploy/native/src/native-contract-test.c`
- Create: `scripts/build-control-plane-native.mjs`
- Create: `scripts/control-plane-native-registry.mjs`
- Create: `scripts/control-plane-node-headers-contract.mjs`
- Create: `scripts/control-plane-native-toolchain-contract.mjs`
- Create only after the future unified full-Sigstore owner, subsequent immutable-lock publication, and complete offline npm closure Gates are approved and GREEN: `scripts/control-plane-foundation-toolchain-lock.mjs` — the final published-lock resolver/pin only; it imports the predecessor-owned schema/publication parser from `scripts/control-plane-foundation-toolchain-publication.mjs` and never copies or modifies that predecessor file. The current Task 3 cannot create or exercise this success path.
- Create: `server/tests/control-plane-native-contract.test.mjs`
- Create: `server/tests/control-plane-native-registry.test.mjs`
- Create: `server/tests/control-plane-node-headers-contract.test.mjs`
- Create: `server/tests/control-plane-native-toolchain-contract.test.mjs`
- Create: `server/tests/control-plane-foundation-toolchain-lock.test.mjs`
- Create: `integration/control-plane-deploy/foundation-linux.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**

- Future-only consumes unchanged after a separately authorized
  authority-bootstrap predecessor merge:
  `scripts/control-plane-foundation-toolchain-publication.mjs` and its canonical
  v2 lock schema/publication parser plus a diagnostic-only Foundation-lock
  runner. That runner may report bounded DSSE/Fulcio/Rekor/OIDC/predicate/subject
  observations but does not completely validate embedded CT/SCT evidence,
  creates no expectation/result brand, and its compatibility
  `createFoundationToolchainLockAttestationVerifier({ clock }) -> { verify }`
  always throws `full_sigstore_owner_unavailable`. The predecessor intentionally
  contains no final Release resolver or immutable pin. This task has no current
  success path: a separately approved provider/topology addendum must first put
  one pinned mature full-Sigstore owner, shared unchanged by Foundation and
  Artifact and proven by official positive/adversarial CT/SCT vectors, on the
  protected path before lock publication. A REST bundle, diagnostic result, or
  copied Artifact partial verifier cannot substitute for that provider.
- Future-only consumes: `node-gyp@11.4.2` from the exact lockfile, one complete
  content-addressed offline npm cache/vendor closure published through its own
  separately approved Gate, and exactly one
  `resolvePublishedFoundationToolchain({ lockBytes,
  immutablePublicationEvidence })` owner return. Only the unified full-Sigstore
  owner may privately brand the immutable Release/asset/attestation evidence
  before publication completion. The resolver then requires the canonical v2
  lock bytes, exact `linux/amd64` OCI platform manifest, Node/ABI/N-API identity,
  fixed Node headers tree, ordered six role files, every executable/helper in
  the complete closure, and the hash-closed offline dependency inventory. It may
  then return one frozen private-branded `verifiedFoundationToolchain`
  containing the lock-asset SHA-256, candidate closure digest, verified headers,
  verified toolchain, offline-closure digest, and owner-derived tool environment.
  While topology is unapproved, this resolver and every caller throw
  `full_sigstore_owner_topology_unapproved` before output, `npm ci`, container
  start, or compiler execution; after topology approval, an absent owner throws
  `full_sigstore_owner_unavailable`. No success path exists until both future
  providers are GREEN. Afterward the native builder accepts only
  `assertVerifiedFoundationToolchain(verifiedFoundationToolchain)`; no expected
  header/toolchain digest, custody root/manifest tuple, image identity, or tool
  path may be supplied through environment, CLI, builder contract, registry
  fragment, or caller object. Executable selection, compiler-relative path,
  executable content digests, flags, sources, target IDs, and output names come
  only from the compiled registry joined to that owner return.
- Future-only produces `resolveFixedPublishedFoundationToolchain({ token, fetchFn }) ->
  { lockBytes, immutablePublicationEvidence, verifiedFoundationToolchain }` for
  trusted read-only jobs. It fixes repository, tag, asset, source commit,
  attestation issuer/workflow/ref/SHA, and every API route from the compiled
  published pin, obtains the one immutable asset plus exact single-subject
  attestation itself, then delegates those bytes to
  `resolvePublishedFoundationToolchain(...)`. `fetchFn` is an injected HTTP
  boundary for tests only; no production caller supplies a repository, route,
  URL, tag, asset, digest, evidence object, or expected field.
- Produces: a Linux-only Node-API addon whose callable exports exactly equal
  `FOUNDATION_NATIVE_EXPORTS`; reviewed standalone C binaries under the fixed
  `ops/control-plane-deploy/native/build/standalone/` output root; and one
  canonical build receipt binding registry, profile, every actually executed
  build-tool digest, source, and output digests. The toolchain verifier also
  produces a branded frozen verified-toolchain result, and
  `createVerifiedNativeToolEnvironment(verifiedToolchain)` derives the only
  permitted narrow `PATH` plus fixed `CC`, `CXX`, `AR`, `LD`, `PYTHON`, and
  `MAKE` values from it. No CLI option, environment variable, fixture,
  downstream caller, or registry fragment can select an arbitrary executable
  path, source path, flag, or output path.
- Future-only produces the only builder-transfer entrypoint:
  `node scripts/control-plane-foundation-toolchain-lock.mjs export-builder-input --output-directory <fresh-owned-directory>`.
  The command accepts exactly that literal command and flag, fixes repository,
  immutable Release tag/asset, unified full-Sigstore trust policy, and published-lock pin
  inside the owner module, and uses only a read-only `GITHUB_TOKEN` to resolve
  the live immutable tuple. It writes exactly canonical
  `foundation-toolchain-lock-v2.json` and
  `immutable-publication-evidence.json` as regular `0600` files into a new empty
  no-symlink directory, fsyncs files and directory, independently reads them
  back through the same resolver, then exits zero without printing either body
  or the token. It rejects a caller lock/evidence path, URL, tag, asset, digest,
  repository, ref, workflow, output filename, overwrite, nonempty directory,
  second command/flag, mutable/missing/ambiguous Release, or non-single-subject
  attestation. The current entrypoint always hard-stops before creating its
  output directory or fetching evidence; a diagnostic Foundation result cannot
  reach it. It never compiles, extracts candidate bytes, invokes a package
  manager, or receives Release write authority.

After the future providers are GREEN, the same module contains the real executable boundary, not merely an exported
test function. `runFoundationToolchainLockCli({ argv, env, fetchFn, fsOps })`
accepts only `export-builder-input --output-directory <value>`, requires the
fixed read token only as `env.GITHUB_TOKEN`, calls
`resolveFixedPublishedFoundationToolchain`, performs the new-empty-directory
two-file write/fsync/readback contract above, and returns `0`; every closed safe
error returns `2`. The `import.meta.url === pathToFileURL(process.argv[1]).href`
main wrapper supplies real `process.argv.slice(2)`, `process.env`, global
`fetch`, and fixed filesystem operations, writes only a bounded safe error code
to stderr, and sets `process.exitCode` to the returned nonzero value. It never
prints or returns token, URL, lock, evidence, attestation bundle, or filesystem
contents. Before topology approval, both imported and direct-main entrypoints
return only fixed bounded `full_sigstore_owner_topology_unapproved` and perform
zero fetch or filesystem mutation; after topology approval but before owner
availability they return only `full_sigstore_owner_unavailable`.
- The only standalone compile profile is `hardened-c17-pie-v1`, with this exact
  ordered flag vector and no implicit or caller-appended flag:

  `-std=c17 -O2 -fPIE -pie -fstack-protector-strong -Wl,-z,relro,-z,now -Wall -Wextra -Werror`

  `-o`, the fixed temporary output operand, and the reviewed source operands are
  structural compiler operands added by the adapter; they are not extension
  flags. The adapter passes `shell:false`, never evaluates a response file, and
  rejects a source, output, or argument beginning with `-` unless it is one of
  the nine frozen flags above.
- `scripts/build-control-plane-native.mjs` owns only this repository's first-party
  Node-API addon and manifest-reviewed standalone C targets. It never invokes an
  install script and never discovers or builds `better-sqlite3`, another
  dependency addon, or an unregistered binary. Artifact's later direct
  `better-sqlite3` adapter is a separate owner and contract. That adapter must
  import the same published-lock resolver/assertion surface, consume the exact
  same private-branded `verifiedFoundationToolchain`, use its owner-derived
  narrow tool environment, and bind the same lock-asset/candidate-closure plus
  every tool it actually executes into its own build receipt; Foundation does
  not build or attest `better-sqlite3` for it.
- Foundation owns the base fragments and ordered manifest. Bootstrap extends the
  registry only by adding its reviewed C source, one direct-child canonical
  fragment, and the fragment's digest entry to the same manifest. It reuses
  `hardened-c17-pie-v1` and the existing adapter; there is no runtime registration
  function, plugin search path, second registry root, environment-selected
  fragment, or additional public spawn ABI.

#### Fixed disposable-runner root probe boundary

`foundation-profile-probe` owns both the unprivileged promotion validator and the
only privileged Foundation executable. Its reviewed output basename is exactly
`control-plane-foundation-host-root`, and the container build materializes it,
together with the canonical compiled-output manifest, under this one fresh
runner-owned source root; the fixed root destination and result are also frozen:

```text
/home/runner/work/_temp/control-plane-foundation-host-probe/control-plane-foundation-host-root
/home/runner/work/_temp/control-plane-foundation-host-probe/compiled-output-manifest.json
/usr/local/bin/control-plane-foundation-host-probe-root
/run/control-plane-foundation-eligibility-v1/control-plane-foundation-host-result.json
```

Before promotion, the validator opens the standard, already-present
`/usr/local/bin` parent with `O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC`, requires
it to be a real root-owned directory not writable by the runner, and requires the
fixed destination, result, and runtime root to be absent. The workflow never
creates, repairs, or substitutes that parent. It opens the candidate with
`O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, requires a regular single-link file owned by the
current runner UID with mode `0555`, and validates the candidate plus manifest
bytes/digests through held descriptors. Because only root can create a child of
the verified destination parent, any pre-existing target fails before sudo and
cannot be replaced. A source-path rename or symlink swap after `open` does not
change the held inode.

The unprivileged zero-argument direct main then performs and verifies
`lseek(heldWrapperFd, 0, SEEK_SET)`, duplicates only that held candidate
descriptor onto FD 0, clears close-on-exec only for FD 0, and exact-spawns with
`shell:false`, empty environment input, anonymous bounded child-output capture,
and no extra descriptor:

```text
/usr/bin/sudo -n -- /usr/bin/install -T -o root -g root -m 0555 /proc/self/fd/0 /usr/local/bin/control-plane-foundation-host-probe-root
```

Using stdin avoids any dependence on sudo's default close-from behavior or an FD
number greater than 2. `/usr/bin/install` is permitted only through this complete
literal argv and reads only `/proc/self/fd/0`; no caller path, option, destination,
mode, owner, shell, or environment field exists. Raw sudo/install stdout/stderr
is never forwarded; the validator consumes or discards it within the fixed cap
and emits only its bounded safe code. Nonzero install, failed rewind, short/truncated
stdin copy, or a target created unexpectedly stops before execution. After exit
zero the unprivileged validator independently opens the fixed destination with
`O_RDONLY|O_NOFOLLOW`, requires regular type, link count one, UID/GID 0, mode
`0555`, and exact candidate digest/size, and reads back the unchanged inode. A
runner attempt to write, rename, unlink, or replace the promoted target must fail
with `EACCES`; only then may `run` be selected.

The other two and only two sudo calls use the independently validated root-owned
path and exact root verbs:

```text
/usr/bin/sudo -n -- /usr/local/bin/control-plane-foundation-host-probe-root run </dev/null
/usr/bin/sudo -n -- /usr/local/bin/control-plane-foundation-host-probe-root cleanup </dev/null
```

At the fixed root basename, the real C `main` rejects zero, two, unknown,
prefixed, repeated, or empty verbs. The two separately root-installed worker
basenames instead require zero arguments, effective root, the expected systemd
parent/cgroup, and their exact installed inode digest; they are not valid at the
external root-wrapper basename. Every root mode ignores the complete process
environment, requires `/dev/null` stdin without reading it, never starts a shell,
and only exact-spawns compiled constant argv vectors for `/usr/bin/systemctl`.
Exit `0` means the requested operation and readback completed; exit `1` means a
real systemd/timer/cgroup capability failed; exit `2` means invocation or local
integrity was invalid. Stdout is always empty. Stderr is either empty or one
fixed aggregate-safe ASCII line of at most 96 bytes; paths, IDs, command output,
environment, manifest/result bytes, and syscall text are never emitted.

Across a successful promotion/run/cleanup lifecycle there are exactly three sudo
invocations. The promotion step ID is exactly `promote`; only its zero exit means
the root target passed independent readback. The cleanup command is the last
workflow step with exact
`if: ${{ always() && steps.promote.outcome == 'success' }}` and no
`continue-on-error`. Promotion alone receives the held wrapper FD as stdin;
`run` and `cleanup` receive `/dev/null`. No step maps environment input. Apart
from the one complete fixed `install` promotion, no `sudoers`, generic
`install`, `mkdir`, `cp`, `mv`, `rm`, `systemd-run`, `bash -c`, `sh -c`, `eval`, command
substitution, variable interpolation, caller-selected sudo command, or other
privileged target is permitted. Shell redirection exists only to bind the two
root verbs to `/dev/null`; neither privileged target is a shell.

The root wrapper owns exactly this transient namespace:

```text
/usr/local/bin/control-plane-foundation-host-probe-root
/run/control-plane-foundation-eligibility-v1
/run/control-plane-foundation-eligibility-v1/control-plane-foundation-template-worker
/run/control-plane-foundation-eligibility-v1/control-plane-foundation-timer-worker
/run/control-plane-foundation-eligibility-v1/control-plane-foundation-host-result.json
/run/systemd/system/control-plane-foundation-eligibility-v1@.service
/run/systemd/system/control-plane-foundation-eligibility-v1-tick.service
/run/systemd/system/control-plane-foundation-eligibility-v1-tick.timer
/sys/fs/cgroup/system.slice/control-plane-foundation-eligibility-v1@alpha.service
/sys/fs/cgroup/system.slice/control-plane-foundation-eligibility-v1@beta.service
```

The only instantiated template units are
`control-plane-foundation-eligibility-v1@alpha.service` and
`control-plane-foundation-eligibility-v1@beta.service`; the only timer/service
pair is `control-plane-foundation-eligibility-v1-tick.timer` and
`control-plane-foundation-eligibility-v1-tick.service`. No `%i` value reaches an
executable. The wrapper copies its already executing `/proc/self/exe` inode into
the two fixed worker basenames, and those root-installed basename modes accept
zero arguments only. The root directory and workers are `root:root`, mode
`0700` and `0500`; the three unit files are new regular single-link
`root:root 0644` files whose complete canonical bytes and digests are compiled
constants. Every create is no-follow/no-replace, followed by file and parent
`fsync`, descriptor readback, owner/mode/link-count/digest validation, and an
unchanged-inode check immediately before the fixed manager call. All subsequent
reads and deletes use the held parent/entry descriptors, never a pathname
re-resolution vulnerable to a swap.

`run` first independently re-hashes `/proc/self/exe`, verifies its fixed absolute
root-owned path/type/owner/mode/link count, and proves the entire runtime/unit/
result namespace absent. It then installs and reads back the exact bytes, daemon-reloads
the real host manager, starts the two fixed template instances, proves distinct
fixed cgroups, exercises fixed cgroup kill plus empty-and-absent readback, starts
the fixed persistent timer, daemon-reloads and observes the root-owned timer
marker after the required manager lifecycle. The `/usr/bin/systemctl` argv
vectors, signal, waits, unit names, and deadlines are compiled constants; no
generic systemd operation or unit selector is exposed. On success it exclusively
writes canonical `control-plane-foundation-host-result.json` as a regular
single-link `root:root 0400` file, at most 4,096 bytes, containing only schema,
executed-binary/unit-set digests, and the three closed booleans
`systemdTemplateIsolation`, `systemdPersistentTimer`, and
`cgroupKillReadback`; it fsyncs and independently reads back the same inode.

The final tokenless container reads that exact root-owned result before cleanup,
checks its canonical bytes, owner/mode/link count, executable/unit digests, and
build-manifest binding, and only then may mint the private real-probe brand.
After successful promotion readback, regardless of run, host-result readback,
aggregation, cancellation-visible failure, or a partially installed fixture,
the promotion-gated last workflow step invokes `cleanup`. An export, build,
install, or promotion-readback failure never executes the untrusted target and
instead leaves the disposable VM ineligible. Cleanup stops/kills only the four fixed units,
waits for both fixed cgroups to become empty and absent, unlinks only the three
exact unit files, two installed workers, timer marker, root directory, and fixed
result, fsyncs each parent, daemon-reloads, and reads back unit inactive/not-found
plus every fixed runtime/result path absent. Only after all those checks pass,
the still-running cleanup process opens `/usr/local/bin` no-follow, verifies
its own installed inode/digest again, unlinks exactly
`control-plane-foundation-host-probe-root` as the final mutation, fsyncs the
parent, and reads back that pathname absent before returning zero. The executing
inode remains valid only for that process; no second root-wrapper invocation is
possible or required. Unknown pre-existing content, changed root-owned bytes, a nonempty
foreign directory, lingering descendant, or unverifiable state fails closed
instead of broadening deletion. Cleanup failure makes the job ineligible even
if an earlier aggregate line said `eligible:true`.

#### Approved 2026-08-09 Toolchain Inventory Bootstrap

Before this main plan may begin, a separately authorized future merge of the
authority-bootstrap predecessor must have implemented the separately named
Foundation toolchain inventory workflow and controller. This plan then verifies
and consumes those exact files; it
does not recreate or recommit them. The controller has no CLI selector and observes only
the fixed Node headers root plus the six fixed tool roles `CC`, `CXX`, `AR`,
`LD`, `PYTHON`, and `MAKE` resolved from the reviewed inventory contract. It
must not execute any observed file. It recursively rejects symlinks, nonregular
entries, duplicate realpaths, unknown fields, and path escape; hashes bytes in
stable POSIX-relative order; and emits one canonical JSON line containing only
schema/type, source commit, fixed workflow identity, Node version/ABI/N-API,
the ordered role-to-content-digest table, headers tree digest, candidate
toolchain tree digest, and candidate bundle digest. No absolute path, runner
name, hostname, UID, PID, device/inode, environment value, or raw command output
may appear.

The workflow is `pull_request` to `master` only, runs on `ubuntu-24.04`, uses
the reviewed exact-SHA checkout/setup-node actions, checks out
`${{ github.event.pull_request.head.sha }}` with persisted credentials disabled,
and runs only the inventory-focused tests and controller. It has no dependency
install, compiler, node-gyp, project build, environment, secret expression,
cache, artifact upload, GitHub write permission, SSH, provider, Release,
package, container, host, or production operation. The controller's stdout is
review evidence only. The workflow and controller must label the result
`eligible:false` and `authority:"inventory_only"`; no downstream code accepts
that schema as a toolchain, build, Artifact Gate, or production receipt.

After the predecessor's fresh inventory run, stop. Human review verifies the
exact run/head and candidate digests. Creating or publishing the immutable
Foundation toolchain asset is a separate, later Gate and is not authorized by
this plan update. Only after that Gate has its own explicit approval and exact
readback may this main PR rebase, add the final published-lock resolver/pin, and
allow Task 3 to continue to the actual build. The inventory/publisher/canonical
scanner remain unchanged predecessor-owned files throughout. The predecessor's
three-export `canonical-json.mjs` and baseline test change only in Foundation
main Task 1 to add the two runtime-fixture exports/tests before Artifact Task 6.

#### Approved 2026-08-09 v2 Complete-Closure Correction

The v1 candidate digest is retained as historical review evidence but is not a
publishable toolchain identity: it binds six role files and Node headers, while
the build contract requires every compiler-internal executable/helper to be
immutable as well. Version 2 therefore uses one complete OCI platform manifest
as the closure boundary. The only allowed image is
`docker.io/library/node:22.23.1-bookworm@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed`
for `linux/amd64`. The platform-manifest digest binds the full root filesystem;
the inventory additionally hashes the fixed Node headers tree and ordered six
role files from inside that exact image. A different tag, digest, platform,
runtime identity, role path/digest, or headers tree is a new candidate requiring
another inventory and review.

The authority-bootstrap predecessor modifies the existing inventory
workflow/controller rather than creating a parallel authority; this main plan
consumes those exact merged bytes unchanged. It remains `pull_request` to `master`, `contents: read`,
GitHub-hosted `ubuntu-24.04`, no secret/environment/write permission, no setup
Node, no dependency install, no compiler/tool execution, no cache/artifact, and
no publication. Its job-level `container` is the exact image reference above.
The canonical v2 line contains `schemaVersion:"2"`, `closureKind:
"oci_platform_manifest"`, exact image/tag/manifest/platform fields, Node
identity, the ordered role table, headers digest, and a domain-separated
`candidateClosureSha256`; it remains `authority:"inventory_only"` and
`eligible:false`.

The same predecessor adds one separate
`.github/workflows/control-plane-foundation-toolchain-publish.yml`; the main PR
verifies but never edits or recommits it. It is `workflow_dispatch` only, runs
only from `refs/heads/master`, and accepts
exactly `source_commit`, decimal `inventory_run_id`, lowercase 64-hex
`candidate_closure_sha256`, and confirmation
`publish Foundation toolchain lock`. At the current exact-11-file boundary the
workflow-level permission map is `{}` and the ordered jobs are exactly
`topology-preflight`, `publish`, `verify-publication`. The absolute first
`topology-preflight` job also has `permissions: {}`, no token/expression,
Environment, checkout, setup/download action, repository command, output, or
GitHub API call; its sole fixed workflow-owned inline body emits bounded
`full_sigstore_owner_topology_unapproved` and exits nonzero. `publish` has exact
`needs: topology-preflight`, no job `if`, `always()`, `failure()`,
`cancelled()`, or `continue-on-error`, so default-success semantics skip its
protected write job. `verify-publication` has exact `needs: publish` and the same
default-success rule, so it is unreachable too. The current workflow is thus
executable-inert even if mistakenly dispatched; it cannot reach a Release or
attestation write. Only a later separately approved Risk A change after unified-
owner placement may replace this fixed guard. Its future trusted read-only
preflight checks out the trusted master workflow source, retrieves the exact successful inventory run,
extracts exactly one canonical v2 receipt, verifies run/head/workflow/receipt and
input equality, and can produce one canonical lock body only after the future
unified full-Sigstore owner is installed on the protected path. A separately
authorized future 11-file bootstrap merge would not authorize dispatch,
publication, or a write attempt; its publisher source remains inert. In the
future contract, the publisher is a
distinct job bound to `artifact-publication` with only `actions:read`,
`contents:write`, `id-token:write`, and `attestations:write`; it has no checkout
or setup-node and cannot execute repository/candidate/build code.

The predecessor publication module does **not** own Foundation-lock attestation
authority. Its diagnostic runner accepts only an injected clock and reads the
reviewed GitHub Fulcio roots, Rekor keys, expected OIDC issuer, repository,
direct workflow path, and predicate type from module-private constants whose
aggregate digest is fixed by tests. It may report DSSE signature, certificate
chain/window and GitHub-hosted claims, exact repository and publisher workflow/
ref/SHA, Rekor signed-entry/inclusion/time, predicate, and exact subject
observations. It does not completely validate embedded CT/SCT trust, creates no
private expectation or result brand, and cannot label any observation verified,
complete, eligible, authoritative, or publication-safe. Compatibility
`createFoundationToolchainLockAttestationVerifier({ clock }).verify(...)`
always throws fixed `full_sigstore_owner_unavailable` after diagnostics and
never returns. No caller may inject or select trust, wrap diagnostics as
authority, copy Artifact's partial verifier, ignore SCT, or fabricate a brand.
The future unified owner must replace this missing authority for both Foundation
and Artifact rather than bless the predecessor diagnostics.

Only after that unified owner is approved, GREEN, and present before publication,
the future fixed release tag is
`control-plane-foundation-toolchain-v2-{candidateClosureSha256}` and the sole
asset is
`foundation-toolchain-lock-v2-{candidateClosureSha256}.json`. The future publisher
requires the repository immutable-release API to return `enabled:true`, creates
a draft, uploads and attests that exact asset, publishes the draft, then reads
back `immutable:true`, the exact target commit, exactly one asset, and GitHub's
`sha256:` digest matching the local bytes. It never enables/disables immutable
releases and never replaces/deletes/clobbers an existing object. Any partial or
conflicting state fails closed for manual investigation. The 11-file source
change and v2 inventory run may be reviewed now, but no release write, asset,
attestation, or digest emission is authorized. The current workflow must stop
before its write job. A future dispatch still requires a new explicit Risk A
approval after the unified owner is on the protected path.

In the future authorized flow, after the write-capability job, a separate read-only `verify-publication` job
checks out the exact protected-master publisher source with persisted
credentials disabled, receives only `contents: read` and `attestations: read`,
fetches the immutable Release/sole asset/bundle, and calls the unified full-
Sigstore owner. The write job's asset/digest readback alone cannot mark the Gate
complete. The current predecessor diagnostics always end in
`full_sigstore_owner_unavailable`, so the read-only job must emit no completion
digest and cannot authorize the resolver or build. Only the future owner may
reproduce the canonical lock bytes, release target, publisher workflow SHA,
exact single subject, complete signature/Fulcio/Rekor/CT/SCT closure, and its
private brand before emitting a bounded safe completion digest.
It has no Release write, Environment, OIDC, package, build, host, or production
authority. A failed verification leaves the immutable object untouched and
stops for manual investigation.

The exact release target commit is the inventory receipt's independently
revalidated `sourceCommit`; it is passed from the read-only preflight as an
opaque output. The write-capability job must not substitute its later workflow
dispatch SHA or resolve a mutable branch/tag for that target.

After unified-owner postverification, the canonical published lock is the only authority consumed by a build. It
contains the exact image reference/platform, Node/ABI/N-API identity,
header-tree digest, ordered role paths/digests, complete closure digest, and
candidate closure digest. A tracked builder contract may bind the lock asset's
content digest but must not repeat any of those values as independently
accepted fields. The resolver rejects a lock whose immutable Release target,
asset name/digest, single-subject attestation, inventory receipt, or any
materialized byte disagrees. Unit fixtures may construct synthetic lock bytes
only behind the test module boundary; no production resolver accepts an
`inventory_only` receipt, caller assertion, or fixture brand.

**Corrected ordering hold:** the master-only publisher source may first land
through the predecessor source-only authority-bootstrap PR containing only the
v2 inventory, protected publisher, lock schema/publication parser plus the same
module's non-authoritative Foundation-lock diagnostics, canonical codec, and
no-production tests. Its approved inventory remains exactly the 11 files listed
under `FUTURE ONLY — consume after a separately authorized authority-bootstrap
predecessor merge` above. The
canonical-codec portion changes exactly
`server/services/deployment/strict-json-scan.mjs`,
`server/services/deployment/canonical-json.mjs`, and
`server/tests/control-plane-canonical-json.test.mjs`; at that merge boundary the
module exports exactly and only `parseCanonicalJsonBytes`,
`serializeCanonicalJsonBytes`, and `sha256Hex`, with no inline-runtime hash or
factory. Foundation main Task 1 later modifies the existing module/test to add
exactly those two exports and becomes the runtime-fixture provider before
Artifact Task 6, without adding a twelfth bootstrap file. The predecessor
contains no full-Sigstore owner, final published-lock resolver or pin, offline
npm closure, native build, deployment, SSH, host, database, credential,
Environment setting, or Release mutation; merging it authorizes no publication.

Before immutable-release settings, publisher dispatch, or any write, a new
explicit Risk A provider/topology addendum must select, land on the protected
publication path, and prove one pinned mature full-Sigstore owner shared by
Foundation and Artifact, with private brand and official positive/adversarial
CT/SCT vectors. The current exactly-one-bootstrap-plus-one-main-PR topology does
not establish how that missing protected-master provider lands, so this plan
must not invent or execute an extra PR, file, package, pin, or API. Only after
that owner is GREEN may a separately approved publication Gate create and
full-owner-postverify the immutable lock. A second separately approved Gate must
publish and hash-verify the complete content-addressed offline npm cache/vendor
closure. Only after both readbacks may the main implementation add the final
resolver/pin and run `npm ci --offline --ignore-scripts`; until then Task 3,
Task 6, every build/receipt, and every `eligible:true` path are unreachable. No
PR-branch publication, synthetic lock/cache, copied digest tuple, alternate
authority, partial-verifier wrapper, network fallback, or post-merge eligibility
waiver is permitted.

The topology stop is literal `full_sigstore_owner_topology_unapproved`. A
possible extra predecessor PR is only a future proposal, is excluded from the
currently approved implementation-PR count, and must not be created, reviewed as
approved, or merged without that new addendum and explicit operator approval.
The approved 11-file bootstrap remains unchanged and cannot absorb the owner.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Write failing closed-export, registry, compiler, and standalone-target tests**

```js
import {
  ATOMIC_LOGICAL_RECORD_EXPORTS,
  FOUNDATION_NATIVE_EXPORTS,
  HARDENED_C17_PIE_V1_FLAGS,
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";

test("native wrapper exports the closed operation set", async () => {
  const native = await import("../../ops/control-plane-deploy/native/index.mjs");
  assert.deepEqual(FOUNDATION_NATIVE_EXPORTS, [
    "createBoundedCapture",
    "createDatabaseIdentityLease",
    "createSealedMemfd",
    "durableCompareAndSwap",
    "durablePublishNoReplace",
    "durableReadLogical",
    "durableSwapSymlink",
    "durableUnlink",
    "durableUnlinkVerified",
    "durableWriteFile",
    "inspectSqliteMainHandle",
    "probeLinuxCapabilities",
    "receiveDatabaseCapability",
    "sendDatabaseCapability",
    "spawnWithExactFileDescriptors"
  ]);
  assert.deepEqual(Object.keys(native).sort(), FOUNDATION_NATIVE_EXPORTS);
  assert.deepEqual(ATOMIC_LOGICAL_RECORD_EXPORTS, [
    "durableReadLogical",
    "durablePublishNoReplace",
    "durableCompareAndSwap",
    "durableUnlinkVerified"
  ]);
  assert.equal(ATOMIC_LOGICAL_RECORD_EXPORTS.every((name) => typeof native[name] === "function"), true);
  assert.deepEqual(HARDENED_C17_PIE_V1_FLAGS, [
    "-std=c17", "-O2", "-fPIE", "-pie", "-fstack-protector-strong",
    "-Wl,-z,relro,-z,now", "-Wall", "-Wextra", "-Werror"
  ]);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
});

test("reviewed fragment extends fixed IDs and targets without extending ABI or flags", async () => {
  const fixture = registryFixture({
    extraFragment: bootstrapProfileFragmentFixture()
  });
  const compiled = compileReviewedNativeRegistryFixture(fixture);
  assert.equal(compiled.sourceRoot, "ops/control-plane-deploy/native");
  assert.equal(
    compiled.manifestPath,
    "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json"
  );
  assert.deepEqual(compiled.executableIds, [
    "foundation-fd-probe",
    "foundation-openssh-handoff-probe",
    "foundation-response-probe",
    "control-plane-ssh-deploy-status-v1"
  ]);
  assert.deepEqual(compiled.environmentIds, [
    "empty",
    "control-plane-ssh-clean-v1"
  ]);
  assert.deepEqual(compiled.compileProfiles.map(({ compileProfileId, flags }) => ({
    compileProfileId,
    flags
  })), [{
    compileProfileId: "hardened-c17-pie-v1",
    flags: HARDENED_C17_PIE_V1_FLAGS
  }]);
  assert.deepEqual(compiled.standaloneTargetIds, [
    "foundation-native-contract-test",
    "foundation-profile-probe",
    "control-plane-ssh-command-v1"
  ]);
  assert.equal(compiled.publicNativeExports.includes("registerExecutable"), false);
  assert.equal(compiled.manifestSha256, sha256Hex(fixture.manifestBytes));
  assert.match(compiled.registrySha256, /^[0-9a-f]{64}$/);
  assert.equal(compiled.generatedHeaderPath.endsWith("compiled-native-registry.h"), true);
  assert.equal(compiled.buildPlanPath.endsWith("reviewed-standalone-build-plan.json"), true);
});

test("resolves standalone source from native root and never registry/src", () => {
  const fixture = registryFixture();
  const compiled = compileReviewedNativeRegistryFixture(fixture);
  const target = compiled.standaloneTargets.find(
    ({ targetId }) => targetId === "foundation-profile-probe"
  );
  assert.equal(target.source, "src/foundation-profile-probe.c");
  assert.equal(target.resolvedSourcePath, fixture.nativeSourcePath);

  assert.throws(
    () => compileReviewedNativeRegistryFixture(
      registryFixture({ registryShadowSource: true })
    ),
    /native_registry_entry_unregistered/
  );
  assert.throws(
    () => compileReviewedNativeRegistryFixture(
      registryFixture({ omitNativeSource: true })
    ),
    /native_standalone_source_missing/
  );
});

test("standalone output manifest binds reviewed input and produced bytes", async () => {
  const result = await runSyntheticReviewedBuild();
  assert.deepEqual(result.outputs.map(({ targetId }) => targetId), [
    "foundation-native-contract-test",
    "foundation-profile-probe"
  ]);
  for (const output of result.outputs) {
    assert.match(output.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(output.compilerSha256, /^[0-9a-f]{64}$/);
    assert.match(output.outputSha256, /^[0-9a-f]{64}$/);
    assert.equal(output.compileProfileId, "hardened-c17-pie-v1");
    assert.equal(output.path.startsWith("ops/control-plane-deploy/native/build/standalone/"), true);
  }
});
```

Add table-driven RED rows for all of the following, with one exact fixed error
code per row:

- an unregistered direct-child fragment, registered fragment digest drift,
  duplicate ID, unknown field, wrong fragment kind, nested/absolute/traversing
  fragment name, fragment symlink, second registry root, a production
  `sourceRoot` other than `ops/control-plane-deploy/native`, a production
  `manifestPath` other than
  `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`,
  or a runtime registration export;
- an unknown or duplicate compile profile, any of the nine flags missing,
  reordered, duplicated, or changed, an extra flag, compiler relative-path
  drift, compiler content-digest drift, toolchain-ID drift, and a compiler tree
  whose canonical manifest or recomputed root digest does not match;
- a missing, extra, symlinked, duplicated-realpath, out-of-tree, non-executable,
  or digest-drifted `cc`, `c++`, `ar`, `ld`, `python3`, or `make`; an unlisted or
  changed transitive executable; a forged verified-toolchain object; an ambient
  `PATH` component; any `CC`/`CXX`/`AR`/`LD`/`PYTHON`/`MAKE` override; an
  `inventory_only` receipt, absent/mutable/unattested publication, forged lock
  brand, wrong lock asset digest, alternate `0557ac14...` OCI digest, builder
  contract containing image/header/toolchain authority fields, or an
  independently supplied expected-digest/root/manifest tuple; and a receipt
  that omits the published-lock/candidate-closure binding, omits or reorders one
  verified executable digest, or accepts a Node/node-gyp/tool executable changed
  between pre-build verification and final receipt publication;
- a Foundation diagnostic described as authoritative/verified/complete/eligible,
  any expectation or result brand, a compatibility `verify` call that returns
  instead of throwing exact `full_sigstore_owner_unavailable`, absent/malformed/
  invalid/unowned embedded SCT or CT log proof, `insecure-ignore-sct`, a wrapped
  diagnostic, caller-supplied trust/time, or a REST subject/digest row treated as
  proof; the diagnostic corpus still covers signature mutation, changed Fulcio
  root or Rekor key, certificate/OIDC/repository/workflow/ref/SHA/runner drift,
  malformed Rekor entry/inclusion/time, predicate drift, and zero/multiple/wrong
  subjects without ever minting authority;
- current publisher raw/parsed/runtime rows that reorder or bypass the absolute-
  first `topology-preflight`, add token/read/API/output authority to it, change
  its fixed error/nonzero result, add `continue-on-error`, give `publish`
  anything other than exact default-success `needs: topology-preflight`, give
  `verify-publication` anything other than exact default-success `needs:
  publish`, or add `always()`/`failure()`/`cancelled()`/an alternate write job.
  A realistic dispatch harness instruments Release create/upload/publish/delete
  and attestation calls and proves preflight `failure`, both downstream jobs
  `skipped`, no completion digest, and exactly zero Release/attestation writes;
  a post-write verifier failure is not the safety boundary;
- an unregistered source, absolute source, source not matching `src/*.c`, source
  traversal/symlink/content-digest drift, any unregistered `registry/src/`
  directory or shadow source, unregistered standalone target,
  unknown profile binding, caller-selected
  executable path or descriptor slot, output-name drift, output traversal,
  output-root/component symlink, duplicate output, response-file operand,
  environment interpolation, and a
  standalone binary whose final digest does not match its build receipt;
- any Node-API ABI or wrapper-export growth or shrinkage after adding a reviewed
  standalone target. The expected value remains N-API 9 and the exact 15-entry
  `FOUNDATION_NATIVE_EXPORTS` list.
- an absent, incomplete, unhashed, mutable, network-fetched, or path-selected
  offline npm cache/vendor closure; `npm ci` without exact `--offline
  --ignore-scripts`; any package-manager network attempt; cache inventory,
  tarball integrity, lockfile, or content-address drift; or any npm/cache source
  added to the current 11-file bootstrap;
- the fixed builder-input CLI with an unknown/duplicate/missing flag, a caller
  source/tag/asset/digest/path selector, missing read token, stale/mutable or
  multi-asset publication, wrong single-subject attestation, nonempty/symlinked
  output directory, partial first-file write, readback drift, or any output
  other than the exact two canonical `0600` files. Current-boundary tests prove
  imported and child-main calls fail first with bounded
  `full_sigstore_owner_topology_unapproved` before fetch, directory creation,
  file output, container start, `npm ci`, or compiler execution; an explicitly
  approved topology with a missing owner instead yields fixed
  `full_sigstore_owner_unavailable`. Future-provider
  fixtures may prove an exact two-file round-trip only after the unified owner's
  official CT/SCT suite and offline-closure Gate are explicitly approved; no
  synthetic fixture can mark the current checkpoint GREEN.

The Bootstrap fixture is synthetic and recreates the same temporary native-root
layout: its manifest-listed fragment is a direct child of `registry/`, while its
standalone C source is a direct child of `src/`. Bootstrap owns the later tracked
source, fragment, and manifest entry.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the contract test and verify RED**

Run:

```powershell
node --test server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs server/tests/control-plane-foundation-toolchain-lock.test.mjs
```

Expected: FAIL because `ops/control-plane-deploy/native/index.mjs` and the
reviewed registry/toolchain compilers do not exist.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the canonical registry schemas and closed compiler output**

`reviewed-native-registry-manifest.json` has exactly
`schemaVersion`, `registryId`, and ordered `fragments`. Each fragment entry has
exactly `kind`, `name`, and `sha256`; `name` is a basename for a regular,
non-symlink direct child of `ops/control-plane-deploy/native/registry/`.
Fragment resolution always uses the manifest's fixed registry directory; it
never uses the native source root. The compiler enumerates that directory and
permits only the manifest itself plus the regular direct-child fragments listed
by it. Any other file, symlink, or subdirectory—including `registry/src/`—is
`native_registry_entry_unregistered`. It also rejects duplicate manifest
entries and requires exactly one Foundation fragment of each base kind:

- `logical_records`: fixed logical ID, record/lock/replay-marker relative names,
  byte cap, and mode;
- `spawn_profiles`: fixed executable/environment IDs, standalone target ID,
  fixed arguments, descriptor-role table, timeout cap, and fixed environment;
- `compile_profiles`: compile profile ID, toolchain ID, fixed compiler-relative
  path, exact compiler SHA-256, and ordered flags;
- `standalone_targets`: target ID, compile profile ID, fixed output basename,
  one `source`, and its exact `sourceSha256`.

Target IDs and output basenames match `^[a-z0-9][a-z0-9-]{0,63}$`; an output
has no suffix, separator, leading dot, or second destination field. Reviewed
standalone `source` values match exactly
`^src/[a-z0-9][a-z0-9-]{0,63}\.c$`, for example
`source: "src/foundation-profile-probe.c"`. They are resolved relative to
`ops/control-plane-deploy/native`, never relative to its `registry` directory or
the repository root. The resolved file must be a regular non-symlink direct
child of `ops/control-plane-deploy/native/src/`, and its bytes must match
`sourceSha256`. The one Foundation compiler relative path is exactly `bin/cc`;
neither extensions nor callers may override it.

A downstream manifest entry may have kind `native_extension`. That one fragment
has exactly `schemaVersion`, `fragmentType`, `ownerId`, `logicalRecords`,
`spawnProfiles`, and `standaloneTargets`; it cannot declare a compile profile.
Thus Bootstrap's registry change is exactly one `native_extension` fragment plus
one manifest entry even when its fixed profiles refer to several reviewed C
targets. The same global duplicate-ID, source-digest, target, output, descriptor,
and environment checks are applied after folding the extension into the four
base tables.

`foundation-compile-profiles.json` contains exactly one profile,
`hardened-c17-pie-v1`. During implementation, measure the compiler from the
reviewed toolchain tree and record its real lowercase 64-hex digest in that
fragment; never insert a sentinel digest. Its flags must byte-equal
`HARDENED_C17_PIE_V1_FLAGS`. The compiler-relative path is a fixed POSIX path in
the fragment, and resolving it beneath the already verified toolchain root must
remain beneath that root without symlinks.

`foundation-standalone-targets.json` initially declares exactly
`foundation-profile-probe` and `foundation-native-contract-test`. Each spawn
profile points to one of those target IDs rather than a path. Output basenames
are fixed registry values and are materialized only beneath
`ops/control-plane-deploy/native/build/standalone/`. After creating each tracked
C source at `src/foundation-profile-probe.c` and `src/native-contract-test.c`,
compute and record the actual `sourceSha256`, then compute and record the actual
fragment digest in the reviewed manifest.

The production registry entrypoint is
`compileReviewedNativeRegistry({ sourceRoot, manifestPath, outputDirectory })`.
The first two arguments must byte-equal these repository-relative constants:

```js
const NATIVE_SOURCE_ROOT = "ops/control-plane-deploy/native";
const NATIVE_REGISTRY_MANIFEST =
  "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json";
```

The compiler derives the repository root from `import.meta.url`, rejects any
different source or manifest argument, requires `outputDirectory` to be the
adapter-created fresh build directory, and resolves the two namespaces
independently:

- fragment `name` -> `dirname(NATIVE_REGISTRY_MANIFEST)/name`, requiring a
  manifest-listed direct child of `registry/` with the bound fragment digest;
- standalone `source` -> `NATIVE_SOURCE_ROOT/source`, requiring a regular
  no-symlink `src/*.c` file with the bound `sourceSha256`.

Joining standalone `source` to the manifest directory (and therefore resolving
it as `registry/src/*.c`) is an explicit contract failure. The entrypoint
accepts no caller-selected compiler, flag, source, or output-name parameter. It
returns this frozen shape:

```js
Object.freeze({
  sourceRoot,
  manifestPath,
  manifestSha256,
  registrySha256,
  generatedHeaderPath, // <owned build temp>/compiled-native-registry.h
  buildPlanPath,       // <owned build temp>/reviewed-standalone-build-plan.json
  executableIds,
  environmentIds,
  logicalRecordIds,
  compileProfiles,
  standaloneTargets, // each binds source, sourceSha256, resolvedSourcePath
  publicNativeExports: FOUNDATION_NATIVE_EXPORTS
});
```

The canonical build plan contains only the compiled values described above; its
profile flags and target source/output values are byte-for-byte projections of
the digest-bound fragments. `manifestSha256` is the digest of the exact canonical
manifest bytes; `registrySha256` binds that digest plus the ordered verified
fragment digests and compiled table bytes. The generated C header binds `registrySha256` and
the same fixed logical/spawn tables. Fixture compilation uses a test-only helper
that creates the identical `ops/control-plane-deploy/native/{registry,src}`
layout under a temporary repository root and then applies the same two fixed
repository-relative constants. That helper is not exported by the build CLI or
runtime wrapper.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Add the pinned Node-API build and toolchain contracts**

```json
{
  "targets": [
    {
      "target_name": "control_plane_native",
      "sources": [
        "src/control-plane-native.c"
      ],
      "defines": ["NAPI_VERSION=9", "_GNU_SOURCE"],
      "cflags": ["-std=c17", "-Wall", "-Wextra", "-Werror", "-fstack-protector-strong"]
    }
  ]
}
```

The binding remains one `control_plane_native` target with N-API 9. Adding the
standalone adapter changes neither `binding.gyp` target count nor the Node-API C
registration/export table. `server/tests/control-plane-native-contract.test.mjs`
loads the addon after every build and compares ABI and all 15 exports with the
frozen contract.

`verifyNodeHeadersTree` and `verifyNativeToolchainTree` parse their canonical
manifests with the shared codec, reject symlinks and unlisted or missing entries,
and recompute stable POSIX-relative path/mode/size/content tree digests. The
headers verifier additionally binds `nodeVersion` and `nodeModuleAbi`. The
toolchain verifier additionally requires the registry's fixed toolchain ID,
requires exact regular non-symlink executable entries for `bin/cc`, `bin/c++`,
`bin/ar`, `bin/ld`, `bin/python3`, and `bin/make`, resolves each beneath the
verified tree, and rehashes each executable before any subprocess starts. The
`bin/cc` digest must also equal the profile's `compilerSha256`. The returned
branded object exposes the verified tree digest, narrow `binDirectory`, and
fixed path/digest pairs `compiler`, `cxx`, `archiver`, `linker`, `python`, and
`make`; it never accepts an executable override. The canonical toolchain
manifest also lists the complete executable closure those drivers may start
(for example assembler/compiler-internal helpers), in fixed POSIX-relative path
order with a digest for each. `executableDigests` is that ordered closed table,
and `assertExecutableClosureUnchanged()` rehashes the table before every direct
spawn. A helper absent from the verified tree/manifest or reachable only from
an ambient path is a build failure.

`createVerifiedNativeToolEnvironment(verifiedToolchain)` accepts only that
module-branded result and returns exactly `PATH`, `CC`, `CXX`, `AR`, `LD`,
`PYTHON`, and `MAKE`. `PATH` is the one verified toolchain `bin/` directory;
every other value is the corresponding verified absolute path. It rejects an
extra executable, a missing role, duplicate realpath, digest drift between
verification and spawn, an ambient path component, or a forged/caller-created
object. Tests also prove that `node-gyp` receives the same fixed compiler,
C++ compiler, archiver, linker, Python, and make identities as the standalone
adapter. No command may fall back to an ambient `cc`, `c++`, `ar`, `ld`,
`python`, `make`, or shell.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Implement the first-party addon and standalone build adapter**

```js
// scripts/build-control-plane-native.mjs
import { spawnSync } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync,
  readFileSync, renameSync, rmSync, statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileReviewedNativeRegistry,
  writeRepositoryStandaloneBuildReceipt
} from "./control-plane-native-registry.mjs";
import {
  assertCompileProfilesBoundToFoundationToolchain,
  assertVerifiedFoundationToolchain
} from "./control-plane-foundation-toolchain-lock.mjs";
import { sha256Hex } from "../server/services/deployment/canonical-json.mjs";

export function buildControlPlaneNative(buildInput) {
const forbidden = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
  "http_proxy", "https_proxy", "all_proxy",
  "npm_config_proxy", "npm_config_https_proxy"
];
for (const name of forbidden) {
  if (process.env[name]) throw new Error("native_build_proxy_forbidden");
}
if (process.platform !== "linux") throw new Error("native_build_linux_required");
const NATIVE_SOURCE_ROOT = "ops/control-plane-deploy/native";
const NATIVE_REGISTRY_MANIFEST =
  "ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = join(repositoryRoot, NATIVE_SOURCE_ROOT);
const standaloneOutputRoot = join(nativeRoot, "build/standalone");
const foundationToolchain = assertVerifiedFoundationToolchain(
  buildInput.verifiedFoundationToolchain
);
const verifiedHeaders = foundationToolchain.nodeHeaders;
const headersDirectory = verifiedHeaders.directory;
const buildTemp = mkdtempSync(join(tmpdir(), "control-plane-native-build-"));
try {
  const nativeRegistry = compileReviewedNativeRegistry({
    sourceRoot: NATIVE_SOURCE_ROOT,
    manifestPath: NATIVE_REGISTRY_MANIFEST,
    outputDirectory: buildTemp
  });
  const toolchain = foundationToolchain.toolchain;
  assertCompileProfilesBoundToFoundationToolchain({
    compileProfiles: nativeRegistry.compileProfiles,
    foundationToolchain
  });
  const toolEnvironment = foundationToolchain.toolEnvironment;
  const nodeExecutable = realpathSync(process.execPath);
  const nodeGypEntrypoint = realpathSync(join(
    repositoryRoot,
    "node_modules/node-gyp/bin/node-gyp.js"
  ));
  const buildToolEvidence = Object.freeze({
    nodeSha256: sha256Hex(readFileSync(nodeExecutable)),
    nodeGypEntrypointSha256: sha256Hex(readFileSync(nodeGypEntrypoint)),
    toolchainExecutableDigests: toolchain.executableDigests
  });

  function runChecked(executable, args, code) {
    toolchain.assertExecutableClosureUnchanged();
    const result = spawnSync(executable, args, {
      shell: false,
      stdio: "inherit",
      env: Object.freeze({
        LANG: "C",
        LC_ALL: "C",
        ...toolEnvironment,
        TMPDIR: buildTemp,
        npm_config_devdir: buildTemp,
        npm_config_nodedir: headersDirectory,
        npm_config_python: toolEnvironment.PYTHON,
        CONTROL_PLANE_NATIVE_REGISTRY_HEADER: nativeRegistry.generatedHeaderPath,
        CONTROL_PLANE_NATIVE_REGISTRY_SHA256: nativeRegistry.registrySha256
      })
    });
    if (result.status !== 0) throw new Error(code);
  }

  runChecked(nodeExecutable, [
    nodeGypEntrypoint,
    "rebuild",
    "--directory",
    nativeRoot,
    "--nodedir",
    headersDirectory
  ], "native_addon_build_failed");

  if (!existsSync(standaloneOutputRoot)) {
    mkdirSync(standaloneOutputRoot, { recursive: false, mode: 0o755 });
  }
  const outputMetadata = lstatSync(standaloneOutputRoot);
  if (outputMetadata.isSymbolicLink()
      || !outputMetadata.isDirectory()
      || realpathSync(standaloneOutputRoot) !== standaloneOutputRoot) {
    throw new Error("native_standalone_output_root_invalid");
  }
  for (const target of nativeRegistry.standaloneTargets) {
    const profile = nativeRegistry.compileProfiles.find(
      ({ compileProfileId }) => compileProfileId === target.compileProfileId
    );
    if (!profile) throw new Error("native_standalone_profile_unknown");
    const temporaryOutput = join(buildTemp, `standalone-${target.outputName}`);
    runChecked(toolEnvironment.CC, [
      ...profile.flags,
      "-o",
      temporaryOutput,
      target.resolvedSourcePath
    ], "native_standalone_build_failed");
    const temporaryMetadata = lstatSync(temporaryOutput);
    if (temporaryMetadata.isSymbolicLink() || !temporaryMetadata.isFile()) {
      throw new Error("native_standalone_output_invalid");
    }
    chmodSync(temporaryOutput, 0o555);
    const finalOutput = join(standaloneOutputRoot, target.outputName);
    if (existsSync(finalOutput) && lstatSync(finalOutput).isSymbolicLink()) {
      throw new Error("native_standalone_output_symlink_forbidden");
    }
    renameSync(temporaryOutput, finalOutput);
  }
  toolchain.assertExecutableClosureUnchanged();
  if (sha256Hex(readFileSync(nodeExecutable)) !== buildToolEvidence.nodeSha256
      || sha256Hex(readFileSync(nodeGypEntrypoint))
        !== buildToolEvidence.nodeGypEntrypointSha256) {
    throw new Error("native_build_tool_changed_during_build");
  }
  writeRepositoryStandaloneBuildReceipt({
    buildToolEvidence,
    foundationToolchain,
    nativeRegistry,
    toolchain,
    verifiedHeaders
  });
} finally {
  rmSync(buildTemp, { recursive: true, force: true });
}
}
```

The code sketch names `writeRepositoryStandaloneBuildReceipt`; implement and
import it from `scripts/control-plane-native-registry.mjs`. It derives the same
repository and fixed standalone output root from `import.meta.url`, accepts no
path parameter, hashes each final
regular non-symlink mode-`0555` output after rename, rejects a missing/extra
output or any output-root/file symlink, and
writes one canonical `standalone-build-receipt.json` beneath the fixed build
root. The receipt binds `foundationToolchainLockSha256`,
`foundationCandidateClosureSha256`, `manifestSha256`, `registrySha256`, the verified Node
headers tree/version/ABI identity, Node executable digest, locked node-gyp
entrypoint digest, toolchain tree digest, the ordered complete executable-closure
digest table (including fixed `CC`, `CXX`, `AR`, `LD`, `PYTHON`, and `MAKE`),
target ID, compile-profile ID, exact flag-vector digest, fixed `source`,
`sourceSha256`, output basename, and output digest. It contains no absolute path.
Every tool the adapter can execute is therefore digest-bound; there is no
receipt field that can be supplied by an unverified environment value.

After both future provider Gates, the adapter builds every registered standalone target in manifest order;
there is no target selector. Registry validation has already proved that all
resolved sources are direct regular children of the fixed native `src/` root
and no source was resolved beneath `registry/src/`,
all fixed outputs remain beneath the fixed output root, and every source digest
matches. Before each `spawnSync`, assert again that the compiler path, exact nine
flags, generated `-o` operand, output, and source operands equal the compiled
plan. `runChecked` uses only the exact environment shown: locale, the verified
seven-field native tool environment, owned temporary/header locations, and the
two registry bindings. It never spreads `process.env`. Before each direct spawn
it rehashes the complete manifest-listed executable closure. The Node binary,
node-gyp entrypoint, the private-branded published-lock owner return, verified
headers result, and complete toolchain evidence are carried into the receipt writer; no adapter may
reconstruct or shorten them. Immediately before receipt publication, rehash the
complete tool closure, Node binary, and node-gyp entrypoint again and require
byte equality with the pre-build evidence.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 6: Pin the development tool and scripts**

Add exact `node-gyp: "11.4.2"` to `devDependencies`, regenerate `package-lock.json`, and add:

```json
{
  "control-plane:native:build": "node scripts/build-control-plane-native.mjs",
  "control-plane:native:test": "node --test --test-concurrency=1 server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs server/tests/control-plane-foundation-toolchain-lock.test.mjs",
  "control-plane:foundation:linux": "node --test --test-concurrency=1 integration/control-plane-deploy/foundation-linux.test.mjs"
}
```

Unit verifier tests may create temporary synthetic published-lock/header/toolchain
fixtures behind a test-only helper and temporary registry profiles whose
expected digests match those fixtures. The production resolver cannot import or
accept that helper or use it to clear the current hold. The future authoritative Linux integration instead consumes the
pre-provisioned, target-matched closure named by the immutable published v2
lock; every expected identity is derived only from that verified lock and the
compiler bytes must match the lock-bound `hardened-c17-pie-v1` compiler digest.
It does not derive an authorization digest from whatever tree happens to be
present or from a tracked builder contract. The harness accepts only the unified
owner's private-branded return after official CT/SCT and protected-publication
checkpoints, records every
attempted network syscall as a failure, rejects any executed build tool outside
the verified manifest closure, verifies the fixed `CC`/`CXX`/`AR`/`LD`/`PYTHON`/
`MAKE` paths, narrow `PATH`, the published-lock/candidate-closure binding and
every executable digest in the canonical build receipt, both standalone
outputs, and then loads the addon and rechecks N-API 9 plus the exact 15
exports. The Artifact-owned dependency-addon adapter must pass the same
owner-return/tool-environment conformance fixture before it may build
`better-sqlite3`.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 7: Stop until both future providers are GREEN, then build offline in disposable Linux**

Current expected result: STOP before the first filesystem output, container, npm,
or compiler operation with `full_sigstore_owner_topology_unapproved`. The 11-file
bootstrap diagnostics and an empty runner cache cannot satisfy this checkpoint.
Only after the separately approved unified full-Sigstore owner has completed
lock publication/postverification and the separately published content-addressed
offline npm cache/vendor closure has passed exact hash/inventory readback may the
following future command block execute:

Run:

```bash
npm ci --offline --ignore-scripts
node --test server/tests/control-plane-node-headers-contract.test.mjs
node --test server/tests/control-plane-native-toolchain-contract.test.mjs
node --test server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-contract.test.mjs
npm run control-plane:foundation:linux
```

Future expected result: all commands exit 0 with networking disabled and zero
network attempts, after exact lockfile/cache inventory/tarball hashes have been
verified. A clean runner without that complete closure hard-stops rather than
pretending `npm ci` is hermetic. Wrong Node
version/ABI/header digest, registry manifest/fragment/source digest, compile
profile/flag/compiler digest, any fixed build-tool path/digest, executable-closure
entry, narrow environment, toolchain tree, standalone output, output receipt, or
native ABI/export set, offline cache/vendor byte, or dependency inventory fails before acceptance. An unregistered fragment,
profile, source, target, flag, build tool, compiler, or output never reaches its
compiler.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 8: Commit the native build surface only after Step 7 is GREEN**

Current expected result: unreachable. Do not commit or represent Task 3 complete
while either security hold is open.

```powershell
git add package.json package-lock.json .gitignore ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/index.mjs ops/control-plane-deploy/native/src/control-plane-native.c ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json ops/control-plane-deploy/native/registry/foundation-profiles.json ops/control-plane-deploy/native/registry/foundation-logical-records.json ops/control-plane-deploy/native/registry/foundation-compile-profiles.json ops/control-plane-deploy/native/registry/foundation-standalone-targets.json ops/control-plane-deploy/native/src/foundation-profile-probe.c ops/control-plane-deploy/native/src/native-contract-test.c scripts/build-control-plane-native.mjs scripts/control-plane-native-registry.mjs scripts/control-plane-node-headers-contract.mjs scripts/control-plane-native-toolchain-contract.mjs scripts/control-plane-foundation-toolchain-lock.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-node-headers-contract.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs server/tests/control-plane-foundation-toolchain-lock.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "build: add pinned control-plane native addon"
```

### Task 4: Sealed Memory, Exact Spawn, and Durable Directory-FD Operations — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** Task 4 is a dormant schedule,
> not current execution authority. Do not create or modify a Task 4 file; run
> its RED/GREEN tests, native build, syscall/fault-injection, workflow,
> validation, staging, or commit commands; or create a Task 4 commit now. Retain
> the commands only for a future run after the unified full-Sigstore owner, an
> owner-postverified immutable lock, the complete content-addressed offline npm
> closure, and an explicit separately approved Risk-A resume are all satisfied.

**Files:**

- Create: `ops/control-plane-deploy/native/src/secure-memory.c`
- Create: `ops/control-plane-deploy/native/src/durable-fs.c`
- Modify: `ops/control-plane-deploy/native/src/native-contract-test.c`
- Modify: `ops/control-plane-deploy/native/registry/foundation-standalone-targets.json`
- Modify: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Modify: `ops/control-plane-deploy/native/binding.gyp`
- Modify: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Test: `server/tests/control-plane-native-contract.test.mjs`
- Test: `server/tests/control-plane-native-registry.test.mjs`
- Modify: `integration/control-plane-deploy/foundation-linux.test.mjs`

**Interfaces:**

- Produces: sealed anonymous input bytes whose owner and mode are verified before
  the first byte write; bounded anonymous output capture; closed reviewed
  executable/environment IDs; exact inherited FD slots; fixed-logical-ID atomic
  read/publish-no-replace/CAS/verified-unlink; `openat2` beneath/no-symlink
  enforcement; and parent-fsync durability.
- Every compiled spawn profile declares each child slot's expected descriptor
  kind. Immediately before `posix_spawn`, secret slots are re-`fstat`ed and must
  still be Foundation-created, effective-UID-owned, mode `0600`, regular sealed
  memfds with the complete seal set. This is the mandatory handoff check reused
  by Bootstrap's fixed OpenSSH status/bootstrap/execute profiles; those profiles
  may extend the reviewed build registry but not the spawn ABI.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Add failing pre-write protection, atomic-race, and inheritance tests**

Because `native-contract-test.c` is a manifest-reviewed standalone source, every
intentional edit in this task must be followed by recomputing its source digest
in `foundation-standalone-targets.json` and that fragment's digest in
`reviewed-native-registry-manifest.json` before invoking the build. The negative
digest-drift cases use isolated fixtures; weakening or bypassing the tracked
digest contract to obtain RED is forbidden.

```js
test("sealed memfd carries every required seal and only the reviewed child slot", async () => {
  const secret = Buffer.from("synthetic-key-material");
  const handle = native.createSealedMemfd({ label: "ssh-key", bytes: secret, inheritableFd: 7 });
  assert.equal(handle.ownerModeVerified, true);
  assert.equal(handle.mode, 0o600);
  assert.match(handle.sealsSha256, /^[0-9a-f]{64}$/);
  const result = native.spawnWithExactFileDescriptors({
    executableId: "foundation-fd-probe",
    descriptors: [{ sourceFd: handle.fd, childFd: 7 }],
    environmentId: "empty",
    timeoutMs: 5_000
  });
  assert.equal(result.exitCode, 0);
  handle.close();
});

test("memfd permission failure closes before the first protected byte", async () => {
  for (const fault of ["fchmod", "fstat", "wrong_uid", "wrong_mode", "not_regular"]) {
    const result = await runNativeMemfdFault({ fault, sentinel: "must-not-be-written" });
    assert.equal(result.accepted, false);
    assert.equal(result.bytesWritten, 0);
    assert.equal(result.descriptorClosed, true);
  }
});

test("one predecessor has one winner across forked native CAS callers", async () => {
  const race = await runForkedLogicalCasRace({
    logicalId: "foundation-test-rotation-journal-v1",
    expectedSha256: "a".repeat(64),
    successors: [Buffer.from('{"winner":1}\n'), Buffer.from('{"winner":2}\n')]
  });
  assert.equal(race.filter(({ outcome }) => outcome === "replaced").length, 1);
  assert.equal(race.filter(({ code }) => code === "durable_cas_digest_mismatch").length, 1);
  assert.equal(race.finalBytes.equals(race.winnerBytes), true);
});

test("reviewed OpenSSH descriptor roles accept sealed and reject unprotected handoff", async () => {
  const accepted = await runReviewedSecretHandoffProbe({
    executableId: "foundation-openssh-handoff-probe"
  });
  assert.equal(accepted.spawned, true);
  assert.equal(accepted.ownerModeRechecked, true);
  assert.equal(accepted.fullSealsRechecked, true);

  const result = await runReviewedSecretHandoffProbe({
    executableId: "foundation-openssh-handoff-probe",
    fault: "mode_0644"
  });
  assert.equal(result.spawned, false);
  assert.equal(result.secretBytesRead, 0);
  assert.equal(result.code, "native_secret_descriptor_contract_invalid");
});

test("bounded capture returns an anonymous response and fails closed at its byte limit", async () => {
  const capture = native.createBoundedCapture({ label: "ssh-response", maxBytes: 2_048, inheritableFd: 8 });
  const result = native.spawnWithExactFileDescriptors({
    executableId: "foundation-response-probe",
    descriptors: [{ sourceFd: capture.writeFd, childFd: 8 }],
    environmentId: "empty",
    timeoutMs: 5_000
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(capture.readAll(), Buffer.from('{"result":"synthetic_ok"}'));
  capture.close();
  assert.throws(
    () => native.createBoundedCapture({ label: "oversize", maxBytes: 2_049, inheritableFd: 8 }),
    /native_capture_contract_invalid/
  );
});
```

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the native test and verify RED**

Run: `npm run control-plane:native:test`

Expected: FAIL with `native_operation_not_implemented`; the new pre-write test
must initially show that mode/owner validation is absent, and the fork test must
show that a read-then-write implementation can admit two successors.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the syscall contract**

First add exactly `src/secure-memory.c` and `src/durable-fs.c` to the
`binding.gyp` source list; the later database source remains absent until Task 5.
Update the reviewed `native-contract-test.c` digest and its enclosing fragment
digest, but do not add a compile profile, flag, standalone output, build-script
branch, or public export.

```c
int fd = memfd_create(label, MFD_CLOEXEC | MFD_ALLOW_SEALING);
if (fd < 0) return throw_errno(env, "native_memfd_create_failed");
if (fchmod(fd, S_IRUSR | S_IWUSR) != 0) {
  close(fd);
  return throw_errno(env, "native_memfd_mode_failed");
}
struct stat metadata;
if (fstat(fd, &metadata) != 0
    || !S_ISREG(metadata.st_mode)
    || metadata.st_uid != geteuid()
    || (metadata.st_mode & 0777) != 0600) {
  close(fd);
  return throw_code(env, "native_memfd_owner_mode_invalid");
}
if (write_all(fd, bytes, length) != 0 || fsync(fd) != 0) {
  close(fd);
  return throw_errno(env, "native_memfd_write_failed");
}
const int seals = F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE;
if (fcntl(fd, F_ADD_SEALS, seals) != 0 || fcntl(fd, F_GET_SEALS) != seals) {
  close(fd);
  return throw_code(env, "native_memfd_seal_failed");
}
```

The `fchmod` and `fstat` block is before `write_all` on every path. Tests inject
each syscall/type/uid/mode failure and require descriptor close with zero bytes
written. `probeLinuxCapabilities` performs the same check with a dummy byte and
reports `memfdOwnerMode0600` separately from `memfdFullSeals`; protected-value
materializers may run only after both are true.

Use `posix_spawn_file_actions_addclosefrom_np` when available, otherwise
enumerate `/proc/self/fd` and add explicit closes before spawn. Map
`executableId` and `environmentId` through the compiled reviewed registry;
reject every unknown ID and every child FD outside its fixed descriptor-role
table. Recheck secret-source provenance, effective UID, exact mode, regular-file
type, and full seals immediately before `dup2`/spawn. The Linux harness exercises
the Foundation OpenSSH-handoff probe without network access; Bootstrap must run
the same assertion over each real fixed OpenSSH profile after adding its reviewed
registry fragment.

Implement `createBoundedCapture` with an anonymous `pipe2(O_CLOEXEC)` pair. The native handle exposes only the reviewed child `writeFd`, a parent-only `readAll()` that rejects overflow before returning bytes, and an idempotent `close()`. It must never create a named file, inherit the parent read end, accept an unreviewed FD slot, or return partial bytes after overflow.

For non-state filesystem operations use a previously opened directory FD plus
`openat2` with:

```c
struct open_how how = {
  .flags = O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW,
  .mode = requested_mode,
  .resolve = RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS
};
```

Write, `fsync` the file, `renameat2`, `fsync` the parent FD, reopen with no-follow
flags, and byte-compare before success. `durableUnlink` and
`durableSwapSymlink` also parent-fsync and read back absence/identity. These
generic helpers are not valid state-machine mutation APIs and reject logical
state registry IDs.

Implement all four `ATOMIC_LOGICAL_RECORD_EXPORTS` over the compiled fixed
logical-record registry: `durableReadLogical`, `durablePublishNoReplace`,
`durableCompareAndSwap`, and `durableUnlinkVerified`. Each entry fixes its
relative record path, lock path, replay-marker path, byte cap, and mode.
`durableReadLogical` takes a shared OFD lock, opens only the registered record,
reads bounded exact bytes, compares both its computed and returned digest with
`expectedSha256`, and releases the lock only after successful readback; it never
accepts or returns a path. Each of the three mutation calls:

1. opens the registered lock beneath the supplied root directory FD and acquires
   one exclusive `F_OFD_SETLKW` lock using a separately opened file description;
2. while still holding that lock, reopens the registered record with
   `openat2(RESOLVE_BENEATH | RESOLVE_NO_MAGICLINKS | RESOLVE_NO_SYMLINKS)`, reads
   bounded exact bytes, and compares the current SHA-256 with the expected
   predecessor where applicable;
3. publishes a same-parent temporary file and atomically renames it, or performs
   the verified unlink. Before unlink, it durably publishes the registered
   replay marker binding logical ID and expected predecessor digest. Initial publish uses `RENAME_NOREPLACE`; an existing
   record is idempotent only when byte-equal. CAS with an unexpected predecessor
   is idempotent only when the current bytes equal `nextBytes`; otherwise it
   fails without mutation;
4. `fsync`s the affected parent, reopens and byte-compares the resulting record
   or proves absence, then releases the OFD lock last.

There is no unlocked interval between reread and rename/unlink, and no native
primitive accepts a caller path, lock name, mode, or temporary name. A crash
after rename/unlink but before parent `fsync` is reconciled by the next same-byte
call under the same lock, which repeats the durability barrier and readback. A
different successor never becomes an idempotent replay. An already absent
record is replay-safe only when its exact unlink marker is durable and matches
the supplied predecessor digest; missing or mismatched marker evidence fails
closed. A later publish of that logical record clears the prior marker only
under the same lock after the new record and parent durability readback succeed.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Run syscall, forked-concurrency, crash, and handoff fault injection and verify GREEN**

Run:

```bash
npm run control-plane:native:build
npm run control-plane:native:test
```

Expected: PASS for pre-write `fchmod`/`fstat`/uid/mode/type failure; missing
seal; protected-value materializer blocked by either false probe bit; inherited
extra FD; caller-selected FD; Bootstrap/OpenSSH descriptor-role mismatch;
capture overflow; inherited capture read end; partial capture; symlink ancestor;
magic link; name traversal; all four atomic exports present; `durableReadLogical`
shared-lock/digest/unknown-ID rejection; and fixed-logical-ID rejection. Fork at least two
independent processes against the same predecessor and prove one CAS winner.
Inject process death before/after lock, current reread, temp-file `fsync`, atomic
rename or unlink, parent `fsync`, and result readback; exact replay converges,
different bytes fail, no lock remains held after process death, and no partial
record is accepted.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Commit secure memory and durable FS**

```powershell
git add ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/src/secure-memory.c ops/control-plane-deploy/native/src/durable-fs.c ops/control-plane-deploy/native/src/control-plane-native.c ops/control-plane-deploy/native/src/native-contract-test.c ops/control-plane-deploy/native/registry/foundation-standalone-targets.json ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-native-registry.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "feat: add sealed transport and durable fs primitives"
```

### Task 5: Database Identity Lease, Capability Custody, and Actual SQLite Handle Proof — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** Task 5 is a dormant schedule,
> not current execution authority. Do not create or modify a Task 5 file; run
> its RED/GREEN tests, native build, database/race, workflow, validation,
> staging, or commit commands; or create a Task 5 commit now. Retain the
> commands only for a future run after the unified full-Sigstore owner, an
> owner-postverified immutable lock, the complete content-addressed offline npm
> closure, and an explicit separately approved Risk-A resume are all satisfied.

**Files:**

- Create: `ops/control-plane-deploy/native/src/database-capability.c`
- Modify: `ops/control-plane-deploy/native/binding.gyp`
- Modify: `ops/control-plane-deploy/native/src/control-plane-native.c`
- Test: `server/tests/control-plane-native-contract.test.mjs`
- Test: `integration/control-plane-deploy/foundation-linux.test.mjs`

**Interfaces:**

- Produces: the exact four database-native methods consumed by the host/database plan.
- Stop condition: if the addon cannot bind the SQLite connection actually used to the received capability and expose `actualHandleProofSha256`, mark the program `ineligible_native_sqlite_handle` and execute no later plan.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Write the failing peer, lease, and actual-handle tests**

```js
test("received capability proves the exact SQLite main handle", async () => {
  const lease = native.createDatabaseIdentityLease({ lockFd: fixtures.lockFd, mode: "exclusive", ownerToken: "tx-1" });
  native.sendDatabaseCapability({
    socketFd: fixtures.parentSocketFd,
    databaseFd: fixtures.databaseFd,
    identityLeaseFd: lease.leaseFd,
    expectedPeer: { uid: process.getuid(), pid: fixtures.childPid },
    invocationSha256: "a".repeat(64)
  });
  const received = native.receiveDatabaseCapability({
    socketFd: fixtures.childSocketFd,
    expectedPeer: { uid: process.getuid(), cgroupSha256: "b".repeat(64) },
    expectedInvocationSha256: "a".repeat(64)
  });
  const proof = native.inspectSqliteMainHandle({
    databaseToken: fixtures.openSqliteFromReceivedFd(received.databaseFd),
    expectedDatabaseIdentityHmacSha256: fixtures.identityHmac,
    hmacKeyFd: fixtures.hmacKeyFd
  });
  assert.match(proof.actualHandleProofSha256, /^[0-9a-f]{64}$/);
  lease.close();
});
```

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the target Linux test and verify RED**

Run: `npm run control-plane:foundation:linux`

Expected: FAIL with `ineligible_native_sqlite_handle` until the actual connection-handle proof exists.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the custody contract**

Add exactly `src/database-capability.c` to the existing `binding.gyp` source
list before implementing the custody exports.

Use `F_OFD_SETLK` for the single global database-identity lease, `sendmsg`/`recvmsg` with exactly two `SCM_RIGHTS` FDs, and `SO_PEERCRED` plus a fixed cgroup identity readback. The receive side rejects extra ancillary data, wrong FD count, wrong UID/PID/cgroup, stale invocation digest, unlocked lease, or a database FD whose `fstat` identity differs.

The actual SQLite proof must be calculated inside the exact connection wrapper used for operations. It binds the received database FD identity, the SQLite main database handle identity, logical database ID, invocation digest, lease proof, and root-keyed HMAC. A proof obtained by reopening a caller path or inspecting a different process FD is invalid.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Exercise WAL and replacement races**

Run: `npm run control-plane:foundation:linux`

Expected: PASS for WAL/SHM creation through the validated parent capability and FAIL for path replacement, symlink swap, inode swap, logical-role swap, duplicated lease FD after guardian death, wrong peer, extra FD, handle mismatch, and lease gap.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Commit database capability custody**

```powershell
git add ops/control-plane-deploy/native/binding.gyp ops/control-plane-deploy/native/src/database-capability.c ops/control-plane-deploy/native/src/control-plane-native.c server/tests/control-plane-native-contract.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
git commit -m "feat: prove database capability custody"
```

### Task 6: Aggregate Linux Feasibility Receipt and Program Gate — FUTURE ONLY — CURRENT REACHABILITY STOP

> **FUTURE ONLY — CURRENT REACHABILITY STOP:** Task 6 is a dormant schedule,
> not current execution authority. Do not create or modify a Task 6 file; run
> its RED/GREEN tests, build, Linux host probe, workflow, repository validation,
> staging, or commit commands; or create a Task 6 commit now. Retain the
> commands only for a future run after the unified full-Sigstore owner, an
> owner-postverified immutable lock, the complete content-addressed offline npm
> closure, and an explicit separately approved Risk-A resume are all satisfied.

**Files:**

- Create: `scripts/control-plane-linux-capability-probe.mjs`
- Create: `server/tests/control-plane-linux-capability-probe.test.mjs`
- Create: `server/tests/control-plane-foundation-linux-workflow.test.mjs`
- Create: `.github/workflows/control-plane-foundation-linux.yml`
- Modify: `integration/control-plane-deploy/foundation-linux.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Future-only consumes: all preceding native and durable-store tests, the unified full-Sigstore-owner-verified published lock, complete hash-verified offline npm closure, exact lock-derived container build/output manifest, and a same-job host result produced only by the reviewed standalone runner against the real GitHub-hosted VM's systemd/cgroup environment. The current task stops before workflow execution.
- Future-only produces: one aggregate-only authoritative receipt with no path, kernel release, hostname, UID, process ID, device/inode, config, or credential value, plus one PR-only GitHub-hosted Linux check that never persists or publishes that receipt. The production builder accepts only a module-private real-probe brand minted after full-owner lock verification, offline dependency closure, native output-manifest, host systemd/timer/cgroup, and cross-phase digest validation; an arbitrary callback, partial diagnostic, object, synthetic all-true map, copied brand, empty runner cache, or unit-test fixture can never set `eligible:true` in the workflow.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 1: Write the closed capability receipt test**

```js
import {
  REQUIRED_LINUX_FEATURES
} from "../services/deployment/foundation-contract.mjs";

const EXPECTED_LINUX_FEATURES = Object.freeze([
  "memfdOwnerMode0600",
  "memfdFullSeals",
  "sealedOpenSshDescriptorHandoff",
  "exactDescriptorInheritance",
  "atomicLogicalStateTransitions",
  "openat2BeneathNoFollow",
  "ofdIdentityLease",
  "reviewedSpawnProfileRegistry",
  "scmRightsPeerBound",
  "sqliteActualMainHandle",
  "directoryFsyncDurability",
  "systemdTemplateIsolation",
  "systemdPersistentTimer",
  "cgroupKillReadback"
]);

test("reports only the closed aggregate feature map from a validated probe", async () => {
  const validatedProbe = await targetMatchedLinuxHarnessFixture().runCompleteMatrix();
  const receipt = buildCapabilityReceipt(validatedProbe);
  assert.deepEqual(REQUIRED_LINUX_FEATURES, EXPECTED_LINUX_FEATURES);
  assert.equal(REQUIRED_LINUX_FEATURES.length, 14);
  assert.deepEqual(Object.keys(receipt.features), REQUIRED_LINUX_FEATURES);
  assert.equal(Object.values(receipt.features).every(Boolean), true);
  assert.equal(JSON.stringify(receipt).includes("/"), false);
  assert.throws(
    () => buildCapabilityReceipt(Object.freeze({
      features: Object.fromEntries(REQUIRED_LINUX_FEATURES.map((name) => [name, true])),
    })),
    /linux_capability_probe_brand_invalid/,
  );
});
```

`targetMatchedLinuxHarnessFixture()` is test-only and must traverse the same
validator with deterministic native/systemd/cgroup boundary doubles; it is not
imported by the CLI or workflow. Source and workflow tests reject the strings
`createAllPassProbe`, `allTrue`, a caller-supplied aggregate callback, or any
production import from a test helper.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 2: Run the probe test and verify RED**

Run: `node --test server/tests/control-plane-linux-capability-probe.test.mjs`

Expected: FAIL because the probe controller does not exist.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 3: Implement the fail-closed aggregate probe**

```js
import { REQUIRED_LINUX_FEATURES } from "../server/services/deployment/foundation-contract.mjs";

const validatedLinuxCapabilityObservations = new WeakSet();

function validateAndBrandAuthoritativeObservation({
  nativeObservation,
  hostSystemdObservation,
  buildEvidence,
}) {
  validateExactNativeObservation(nativeObservation, buildEvidence);
  validateExactHostSystemdObservation(hostSystemdObservation, buildEvidence);
  const observation = Object.freeze(mergeClosedFeatureMap(
    nativeObservation,
    hostSystemdObservation,
  ));
  validatedLinuxCapabilityObservations.add(observation);
  return observation;
}

export function buildCapabilityReceipt(observed) {
  if (!validatedLinuxCapabilityObservations.has(observed)) {
    throw new Error("linux_capability_probe_brand_invalid");
  }
  const features = Object.fromEntries(
    REQUIRED_LINUX_FEATURES.map((name) => [name, observed[name] === true])
  );
  return Object.freeze({
    schemaVersion: "1",
    receiptType: "control_plane_linux_feasibility",
    eligible: Object.values(features).every(Boolean),
    features
  });
}
```

`validateAndBrandAuthoritativeObservation` is module-private and is called only by
the production CLI after it independently reads the fixed build manifest and
the root-owned host-probe result from its own fixed fresh directory. It is not a
public adapter or test seam. The CLI writes exactly one canonical JSON line to
stdout and exits `0`; a genuine false capability exits `1`, while invocation,
canonical-byte, binding, mode/owner/digest, or local integrity failure exits `2`.
Failure writes one fixed bounded code to stderr; it never prints raw syscall
errors, paths, IDs, or host details.

The aggregate CLI and the standalone promotion/root wrapper are real direct-main
processes. Source tests require the aggregate ESM guard to compare
`import.meta.url` with `pathToFileURL(process.argv[1]).href`, pass only real
argv/environment and fixed filesystem ports, and set `process.exitCode` rather
than call `process.exit`. Linux process tests spawn the compiled binary itself:
the runner-owned zero-argument mode reaches only fixed promotion, and the
independently validated root-owned path reaches only `run|cleanup`. Extra
promotion arguments, missing/extra/duplicate/unknown root verbs, wrong EUID/path,
non-`/dev/null` root stdin, and every integrity fault exit only `1` or `2` as
classified above and emit at most the fixed bounded safe line. Importing the ESM
entrypoint performs no operation. No production
entrypoint accepts an injected operations object, root path, unit name, digest,
timeout, UID, environment selector, or arbitrary filesystem/systemd port.

Append `server/tests/control-plane-linux-capability-probe.test.mjs` to the existing
`control-plane:native:test` command in `package.json`; do not change the pinned
registry, toolchain, or native-contract test entries.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 4: Observe the current Foundation hard stop; run only after both future Gates**

Run:

```bash
npm run control-plane:native:test
npm run control-plane:foundation:linux
```

Current expected result: do not run the live gate. The resolver/exporter must
return fixed `full_sigstore_owner_topology_unapproved` before output or container start,
and missing offline npm closure must stop before `npm ci`; no receipt exists.
Only after the unified full-Sigstore owner, protected lock publication/readback,
and offline closure Gate are all GREEN may both commands exit 0 and the receipt
report `eligible:true`. Any false feature then stops execution before every later
Master DAG stage. An eligible receipt permits only the next checkpoint, Host/DB
Tasks 0-1; it does not permit a direct jump to Artifact, Bootstrap, later Host/
DB, Receipt, or rollout work.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 5: Write the PR-only Linux-harness test, then implement and verify GREEN**

The test reads `.github/workflows/control-plane-foundation-linux.yml` as text and
must reject a mutable action reference, a runner other than `ubuntu-24.04`, any
event other than `pull_request` to `master`, `push`, `workflow_dispatch`,
schedule, `pull_request_target`, an Environment, secret expression, write
permission, self-hosted runner, artifact/cache upload, SSH/provider/deploy
command, or a checkout that is not
`${{ github.event.pull_request.head.sha }}` with explicit
`token: ${{ github.token }}` and `persist-credentials: false`.

Before any parsed job or step assertion, a duplicate-rejecting raw scanner must
freeze the complete root and sole host-job mapping. The parsed test independently
deep-compares the same closed topology:

```js
const FOUNDATION_WORKFLOW_ROOT_KEYS = Object.freeze([
  "name", "on", "permissions", "jobs",
]);
const FOUNDATION_WORKFLOW_JOB_KEYS = Object.freeze(["foundation-linux"]);
const FOUNDATION_HOST_JOB_KEYS = Object.freeze([
  "runs-on", "timeout-minutes", "permissions", "steps",
]);
const FOUNDATION_READ_PERMISSION_KEYS = Object.freeze([
  "contents", "attestations",
]);
const FOUNDATION_READ_PERMISSIONS = Object.freeze({
  contents: "read",
  attestations: "read",
});

assert.deepEqual(extractRawRootKeys(workflowSource), FOUNDATION_WORKFLOW_ROOT_KEYS);
assert.deepEqual(
  extractRawJobKeys(workflowSource, "foundation-linux"),
  FOUNDATION_HOST_JOB_KEYS,
);
assert.deepEqual(Object.keys(workflow), FOUNDATION_WORKFLOW_ROOT_KEYS);
assert.equal(workflow.name, "Control Plane Foundation Linux");
assert.deepEqual(workflow.on, {
  pull_request: { branches: ["master"] },
});
assert.deepEqual(Object.keys(workflow.permissions), FOUNDATION_READ_PERMISSION_KEYS);
assert.deepEqual(workflow.permissions, FOUNDATION_READ_PERMISSIONS);
assert.deepEqual(Object.keys(workflow.jobs), FOUNDATION_WORKFLOW_JOB_KEYS);

const hostJob = workflow.jobs["foundation-linux"];
assert.deepEqual(Object.keys(hostJob), FOUNDATION_HOST_JOB_KEYS);
assert.equal(hostJob["runs-on"], "ubuntu-24.04");
assert.equal(hostJob["timeout-minutes"], 30);
assert.deepEqual(Object.keys(hostJob.permissions), FOUNDATION_READ_PERMISSION_KEYS);
assert.deepEqual(hostJob.permissions, FOUNDATION_READ_PERMISSIONS);
for (const forbidden of [
  "env", "defaults", "container", "services", "uses", "environment",
]) {
  assert.equal(Object.hasOwn(hostJob, forbidden), false);
}
```

The raw-root negative table injects `defaults`, `env`, `run-name`,
`concurrency`, differently cased keys, duplicate keys, anchors, aliases, merge
keys, and every other unlisted indentation-zero field. It also injects
`on.workflow_call`, `workflow_run`, `repository_dispatch`, and a reusable
caller while keeping the apparent `pull_request` block unchanged. The parsed
table independently rejects every such event/value drift. The raw and parsed
host-job tables inject a second job, `env`, `defaults`, `container`,
`services`, reusable-job `uses`, `environment`, an alternate/local runner,
an alternate timeout, an extra permission, a reordered key, and any other
unlisted runtime field. Each row must fail before the complete existing steps
or sudo assertions are trusted; root/job deep equality supplements rather than
replaces the raw duplicate/alias/merge rejection.

It requires exactly one **host** job named `foundation-linux`, permissions
exactly `contents: read` then `attestations: read`, literal
`runs-on: ubuntu-24.04`, literal `timeout-minutes: 30`, and the exact complete
ordered step block below. Every
toolchain-bearing phase must invoke the exact image
`docker.io/library/node:22.23.1-bookworm@sha256:175215a1f306ed5df592434b99cc2019f70624373fe49cb659240a618a846aed`
through a fixed `docker run --rm` template; no mutable/second image, host
compiler, host package manager, host project Node/npm command, or setup-node
step is allowed. The first repository command is the containerized Foundation
`export-builder-input --output-directory` operation against a new fixed
runner-owned directory. The pinned checkout and that exporter are the exact two
token consumers: checkout explicitly receives `token: ${{ github.token }}` with
`persist-credentials: false`, and the exporter explicitly receives
`GITHUB_TOKEN: ${{ github.token }}`. Raw-source and parsed tests count exactly
two `${{ github.token }}` mappings and reject checkout's implicit token default,
persisted credentials, a job token, a third consumer, or token in dependency/
native build, host probe, aggregate, cleanup, or any second command. This is a
closed expression/context allowlist: before step semantics are trusted, the raw
scanner enumerates every expression and token-like lexeme while the parsed
recursive walker records each scalar's full key context; both deep-compare only
checkout `with.token` and exporter `env.GITHUB_TOKEN`. Negative rows cover
`github['token']`/`github["token"]`, case/whitespace drift,
`toJSON(github.token)`, `fromJSON`, `format`, `secrets.*`, aliases through `env`,
`needs.*.outputs`, `steps.*.outputs`, argv, stdin, `run`, a nonapproved with/env
key, YAML anchor/alias/merge/duplicate evasion, and any later token. Even the
exporter may receive the token only through that exact env scalar; its fixed run
body cannot echo, interpolate, or forward it through argv, stdin, or output.
Every later step is recursively tokenless and secretless. The later
containerized build requires `npm ci --offline --ignore-scripts` and
`npm run control-plane:native:test`, receives no GitHub/Actions credential, and
may read only the separately published, content-addressed, exact-hash offline npm
cache/vendor closure with networking disabled. Tests require its closed inventory,
lockfile/tarball/content digests, zero network attempts, and hard STOP when the
closure is absent or drifted. It then emits the fixed compiled-output manifest
and standalone host-probe runner into a separate fresh mount. The host step first validates the exact manifest,
regular-file ownership/mode, binary digests, and lock identity without executing
candidate JavaScript. It executes the compiled validator with zero arguments;
that process holds the validated wrapper FD on stdin through the exact fixed
promotion command, independently reads back the root-owned target, and exits.
Only a successful promotion permits the later exact root-owned `run` call to
create and verify a real systemd template instance, a persistent timer across
service-manager reload, and delegated cgroup kill/readback.
The final tokenless container phase consumes the exact host result and runs
`npm run control-plane:foundation:linux` to mint the private real-probe brand
and aggregate receipt. Complete workflow-block tests require that exact order
and reject a synthetic feature map, `createAllPassProbe`, skipped host step,
job-container substitution, or aggregate execution before host evidence.

The same test parses the complete raw host-job block rather than matching a
convenient line, and the native source test parses the complete compiled spawn
vector. Together they require exactly three runtime sudo calls in order. First,
the zero-argument unprivileged validator exact-spawns only:

```text
/usr/bin/sudo -n -- /usr/bin/install -T -o root -g root -m 0555 /proc/self/fd/0 /usr/local/bin/control-plane-foundation-host-probe-root
```

Its stdin is the already open `O_NOFOLLOW` wrapper FD and no FD at 3 or above is
inherited. The workflow then contains exactly two literal `/usr/bin/sudo`
invocations, both targeting only
`/usr/local/bin/control-plane-foundation-host-probe-root`: first `run`, then
the final `cleanup`, both with `-n --`, no preceding environment assignment, and
`/dev/null` stdin. The promotion and `run` steps have no `env` map; cleanup is
last, has exact
`if: ${{ always() && steps.promote.outcome == 'success' }}`, has no
`continue-on-error`, and targets the same independently validated root-owned
executable with the sole other verb. A failed/skipped/nonzero promotion therefore
allows neither root verb and leaves any pre-existing target untouched. Raw-source tests reject a
fourth or hidden sudo call, a runner-writable sudo target, `/proc/self/fd/3`,
`sudo -C`, preserved high FD, YAML alias/anchor/merge or duplicate job/step/env/
permissions key, case/whitespace/quote evasion, a variable or expression in any
path/verb, an unknown flag, `sudo -E`, `sudo -u`, `env`, `sudoers`, a second or
generic `install`, `mkdir`, `systemd-run`, generic `systemctl`, `cp|mv|rm`, a shell target,
`bash -c|sh -c|eval`, command substitution, non-wrapper promotion stdin, data on
run/cleanup stdin, or any command after cleanup. They also prove the no-job-
container rule and all fixed digest-bound Docker export/build/aggregate phases
remain unchanged.

After both future provider Gates are GREEN, implement the matching exact-root,
one-`foundation-linux`-host-job workflow with the repository's reviewed exact-SHA
`actions/checkout` reference, explicit token and non-persistence inputs, no
`actions/setup-node`, literal `timeout-minutes: 30`, and no other root key,
job runtime key, or job. Before topology approval, the source-level exporter call
must stop with `full_sigstore_owner_topology_unapproved` and zero output. After
topology approval but before owner availability it stops with
`full_sigstore_owner_unavailable`. In the future flow, the
exporter must finish before dependency installation, verify the live immutable
Release and exact single-subject attestation through the unified owner, and write exactly
`foundation-toolchain-lock-v2.json` plus
`immutable-publication-evidence.json` under the fixed fresh directory. The
subsequent phases receive that directory through one fixed internal binding,
re-resolve both files, verify the container/Node/header/tool closure and compiled
output manifest against the owner return, and fail before emitting a receipt if
either file or either cross-phase digest is absent, noncanonical, stale,
mutable, wrong-subject, or mismatched. Tests cover missing evidence, one-byte
evidence/output/host-result drift, an alternate container digest, exporter or
build failure, token presence after export, host compiler/package/project use,
PID1/D-Bus/cgroup unavailability, fake/empty systemd results, a timer that did
not survive the required manager lifecycle, cgroup kill without absence
readback, and a caller-supplied all-true map. The workflow exists only to prove
the Foundation receipt in a disposable GitHub-hosted VM; it never uploads or
exposes the receipt and never makes a GitHub setting, production host, provider,
or deployment mutation.

The Linux harness additionally exercises the wrapper as a real process, not an
export-only or inert fixture. Positive promotion proves candidate
runner-owner/`0555`/single-link/digest validation, FD-0-only handoff, the
pre-existing `/usr/local/bin` parent identity/ownership/non-writability, fixed
basename absence, exact `install` argv, and independent target
`root:root 0555`/single-link/digest readback. Positive `run` proves the executed
`/proc/self/exe` digest and fixed root-owned path; exclusive root-owned `0700`
runtime root; exact two `0500` workers;
exact three `0644` unit files; fixed alpha/beta unit and cgroup separation;
persistent tick observation; cgroup kill/empty/absence; and the sole bounded
canonical `root:root 0400` result followed by independent readback. Positive
`cleanup` proves all units inactive/not-found, both cgroups absent, every runtime/
result path absent, and the root wrapper itself unlinked last with parent-fsync
and absence readback. Fault rows cover source swap after validated open (the
installed digest must still equal the held FD), source symlink/hardlink, install
stdin truncation/early EOF/nonzero exit, missing/symlink/non-root-owned/writable
`/usr/local/bin` parent with zero sudo, target pre-existence with zero sudo and
zero replacement, target owner/mode/link/digest/readback mismatch with zero
`run`, and a post-promotion runner write/rename/unlink/swap that must return
`EACCES`. They also cover worker, unit, and result owner/mode/link/digest drift;
path escape; failure before and after each install/fsync/readback/manager/start/
timer/kill/result boundary; a stuck descendant; cleanup cancellation at every
unlink; self-unlink attempted before another absence proof; self parent-fsync/
absence failure; and any run/cleanup env or stdin byte. Every fault asserts no
broad deletion, no foreign unit action, no `eligible:true`, bounded aggregate-
safe stderr, no stdout/secret/environment/path leakage, and no root execution
before exact promotion readback. Workflow fixtures make each step fail in turn:
pre-install/pre-existing-target failures prove both root verbs are skipped and no
new target/runtime path exists; an install-success/readback-failure also skips
both root verbs and never executes the root-owned quarantined target; after
successful promotion they prove the promotion-
gated always-cleanup remains selected and its nonzero exit fails the job.

Run: `node --test server/tests/control-plane-foundation-linux-workflow.test.mjs`

Expected: GREEN locally for source-level closure, including exactly two explicit
token consumers and the current topology/owner/offline-closure hard-stop rows.
The actual `ubuntu-24.04` receipt must not be evaluated merely because the main
Draft source PR is opened; while the holds remain, the workflow is ineligible and
must stop before export. After all future Gates, the job is successful
only after the final fixed cleanup returns zero and proves the result, transient
unit files, workers, timer marker, runtime root, units, cgroups, and promoted
`/usr/local/bin` target absent with parent-fsync readback; an earlier
`eligible:true` line cannot override cleanup failure.
Root or host-job key/order/value drift, root defaults/environment/run-name or
reusable-call authority, a second job, or an unlisted job runtime field is
ineligible even when the unchanged step block would otherwise pass.

`memfdOwnerMode0600` is true only when `fchmod(0600)` plus regular-file,
effective-UID, and exact-mode `fstat` checks completed before the dummy byte was
written. `sealedOpenSshDescriptorHandoff` is true only after both an accepted
sealed descriptor and each rejected owner/mode/type/seal fault prove the
reviewed secret descriptor role was rechecked immediately before exact-FD
spawn. The probe enumerates every compiled profile that owns a secret role, so
after Bootstrap adds its reviewed fixed OpenSSH profiles the registry digest and
this feature cannot pass until every new profile completes the same handoff
matrix without a network connection.
`atomicLogicalStateTransitions` is true only after the real forked
single-predecessor race and every crash boundary pass. The receipt must not
collapse these into generic `memfdFullSeals`, `ofdIdentityLease`, or
`directoryFsyncDurability` booleans.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 6: Run repository regression validation**

Run:

```powershell
node --test server/tests/control-plane-canonical-json.test.mjs server/tests/control-plane-durable-store.test.mjs server/tests/control-plane-node-headers-contract.test.mjs server/tests/control-plane-native-toolchain-contract.test.mjs server/tests/control-plane-foundation-toolchain-lock.test.mjs server/tests/control-plane-native-registry.test.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs server/tests/control-plane-foundation-linux-workflow.test.mjs
npm test
git diff --check origin/master...HEAD
```

Expected: all commands exit 0.

- [ ] **FUTURE ONLY — CURRENT REACHABILITY STOP — Step 7: Commit the Foundation gate**

Current expected result: unreachable because Task 3 and the live Task 6 receipt
are not GREEN. A source test that proves the hard stop does not authorize this
completion commit.

```powershell
git add .github/workflows/control-plane-foundation-linux.yml scripts/control-plane-linux-capability-probe.mjs server/tests/control-plane-foundation-linux-workflow.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs package.json
git commit -m "test: gate control-plane linux feasibility"
```

## Self-Review

- Spec coverage: canonical bytes, native fixed-logical-ID atomic durable records,
  pre-write memfd owner/mode verification plus full seals, reviewed OpenSSH
  descriptor handoff, bounded anonymous output capture, exact descriptors,
  manifest-only registry extension, frozen digest-pinned compiler/profile/source/
  standalone-output contracts without public-ABI growth, one future unified
  full-Sigstore owner before one published v2 lock, plus one complete offline
  npm closure, as the only route to Foundation/Artifact build authority, no-follow
  directory capabilities, actual SQLite handle identity, single global OFD
  lease, authenticated capability custody, and systemd/cgroup feasibility each
  have an owning task and negative tests.
- Deferred-marker scan: every source file, interface, command, expected failure, and stop condition is explicit.
- Type consistency: downstream plans consume the exact canonical, durable-store, and native export names declared in Shared Interfaces.
- Safety boundary: the Foundation uses only synthetic fixtures in disposable Linux and performs no GitHub or production operation.

## Execution Handoff

There is no current execution handoff. Under the post-#593 boundary, only the
authority-bootstrap's owning predecessor plan may prepare, test, push, open,
and review its exact 11-file source-only Draft. That Draft MUST remain Draft and
may not be marked Ready or merged; this Foundation plan may not create it. No
Foundation Task 1+ worktree, branch, packet, RED/GREEN command, validation,
staging, commit, or handoff may run now. Stop with
`full_sigstore_owner_topology_unapproved`; do not create or merge a proposed
extra predecessor, change Settings, dispatch publication, add a live resolver,
build, or mark the main PR Ready. Only a future explicitly approved topology
that lands the unified Foundation/Artifact full-Sigstore owner before
publication, a subsequent full-owner-verified immutable-lock publication and
postverification, a separately published/hash-verified complete offline npm
closure, and a separately approved Risk-A resume may enable this plan's final
aggregate receipt. Continue only if that receipt then reports `eligible:true`
and binds the immutable lock, candidate closure, offline dependency closure, and
Artifact's shared owner. It cannot be recorded as `eligible:true` using
diagnostic, synthetic, inventory-only, REST-only, or network-fetched evidence. Follow
the Master DAG exactly: execute Host/DB Tasks 0-1, then Source Integration Task 2,
then Artifact Tasks 1-2. Do not jump directly from Foundation to the Artifact
plan or execute an entire child plan early. A false or unavailable native feature
ends the implementation attempt without activating any production capability.
