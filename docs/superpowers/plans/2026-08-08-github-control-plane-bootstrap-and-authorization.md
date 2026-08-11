# GitHub Control-Plane Bootstrap And Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the source-only, fail-closed bootstrap, credential-rotation, forced-command transport, boot cleanup, and controller-closeout authorization foundation required before any GitHub-managed Japan control-plane deployment can be enabled.

**Architecture:** A strict canonical-JSON contract layer feeds durable, compare-and-swap host state machines. Provider-approved static prepare and activation adapters have no argv surface and fixed write roots; each unprivileged forced-command shim can invoke only one exact no-argument temporary sudo rule, which starts a tiny reviewed native root relay to a fixed root-only Unix socket. An `Accept=no` systemd service accepts FD 3 inside its complete sandbox before the clean-environment Node parser starts. A sealed-descriptor controller invokes OpenSSH with a closed option set. Rotation, temporary GitHub updater issuance, activation cleanup, replay retention, accepted-plan custody, and controller-closeout attachment are separate monotonic journals. The normal deployment forced command exposes only one authorization admission plus closed inventory/status families and delegates admitted transaction execution to the later host-transaction implementation.

**Tech Stack:** Node.js ESM and `node:test`; Linux C17 with the prerequisite native N-API bridge; OpenSSH client/server forced-command contracts; systemd services/timers/cgroups; canonical UTF-8 JSON; SHA-256 and HMAC-SHA-256; durable file, directory-fsync, and compare-and-swap primitives from the prerequisite foundation plan.

## Global Constraints

- **Risk: A.** This is security/production authorization infrastructure. Implementation remains a source-only Draft PR slice until read-only inventory, target-matched disposable-Linux validation, independent review, exact operator approval, and a later production Gate are complete.
- **Process:** TDD for every task; no host mutation during implementation. The approved design is `docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md`. The prerequisite is `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`.
- **Expected PR count:** One shared source-only Draft PR containing the foundation, bootstrap/authorization, host-transaction, controller, integration, and rollout slices. Each task below is one reviewable commit; do not create a second bootstrap PR.
- **Dependency order inside that PR:** the sole task-level DAG is Foundation -> Host/Database Tasks 0-1 -> Source Integration Task 2 -> Artifact/Workflow Tasks 1-2 -> Bootstrap Tasks 1-8 -> Host/Database Tasks 2-10 -> Receipt/Recovery Tasks 1-3 -> Artifact/Workflow Tasks 3-8 -> Host/Database Task 11A's closed-broker plus branded host-inventory-reader provider checkpoint -> Bootstrap Tasks 9-10 -> Receipt/Recovery Task 4 -> Artifact/Workflow Tasks 9-10 -> the remainder of Host/Database Task 11 plus Tasks 12-13 -> Receipt/Recovery Tasks 5-8 -> Artifact/Workflow Tasks 11-13 -> Bootstrap Task 11 -> Source Integration Tasks 1 and 3 -> Host/Database Task 14A's source-only G1a installer contract, then Task 14B -> Source Integration Tasks 4-9. Bootstrap Task 9 additionally consumes Artifact Task 8's real owner-return-shape cross-test. The Host installer is not bundled or called by Bootstrap. A missing adjacent-owner export is a checkpoint failure, never permission to add a duplicate local contract or fixture-only production adapter.
- **Validation:** Run targeted RED/GREEN tests at each step, then the complete bootstrap test set, native disposable-Linux tests, `npm test`, and `git diff --check origin/master...HEAD`. Target-matched Linux evidence is required before the Draft may become Ready.
- **Production/AWS impact:** None. Do not dispatch a workflow; access GitHub Environment/provider/production hosts; create users, keys, Apps, installations, tokens, sudoers, units, or secrets; run an installer; or enable/start a unit. Test only with injected adapters, temporary directories, and disposable Linux fixtures.
- The prerequisite foundation must already export:
  - `server/services/deployment/canonical-json.mjs`: `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, and `sha256Hex(bytes)`, where every contract is `{ schemaId, maxBytes, fieldOrder, nested, arrays, validate }` and parsing/serialization returns an exact value/`Buffer` without key normalization.
  - `server/services/deployment/durable-store.mjs`: `createDurableStore({ contracts, fsOps, native })`, returning only `publishImmutable(logicalId, bytes)`, `casCanonical(logicalId, expectedSha256, nextBytes)`, `unlinkVerified(logicalId, expectedSha256)`, and `readbackExact(logicalId, expectedSha256)`. `fsOps.rootFd` is created only by the fixed production dependency factory; Bootstrap registers closed semantic logical IDs to fixed relative path/size/mode contracts, and no caller supplies a root or record path.
  - `ops/control-plane-deploy/native/index.mjs`: `probeLinuxCapabilities`, `createSealedMemfd`, `createBoundedCapture`, `spawnWithExactFileDescriptors`, `durableReadLogical`, `durablePublishNoReplace`, `durableCompareAndSwap`, `durableUnlinkVerified`, `createDatabaseIdentityLease`, `sendDatabaseCapability`, `receiveDatabaseCapability`, `inspectSqliteMainHandle`, `durableWriteFile`, `durableSwapSymlink`, and `durableUnlink`. Every durable-store mutation delegates to its one corresponding atomic native method rather than a JavaScript read/check/write sequence.
- It also exports `createBoundedCapture({ label, maxBytes, inheritableFd }) -> { writeFd, readAll, close }`. This is an anonymous `pipe2(O_CLOEXEC)` capture; overflow fails closed without returning partial bytes, and only its fixed child write slot is inherited.
- Before Task 1, the foundation unit tests and its target-matched disposable-Linux feasibility test must pass. Bootstrap code must consume those interfaces; it must not reimplement canonical JSON, sealed memfd, exact-FD spawn, OFD leasing, descriptor passing, or durable file primitives.
- The complete Foundation eligibility vector is exactly `memfdOwnerMode0600`, `memfdFullSeals`, `sealedOpenSshDescriptorHandoff`, `exactDescriptorInheritance`, `atomicLogicalStateTransitions`, `openat2BeneathNoFollow`, `ofdIdentityLease`, `reviewedSpawnProfileRegistry`, `scmRightsPeerBound`, `sqliteActualMainHandle`, `directoryFsyncDurability`, `systemdTemplateIsolation`, `systemdPersistentTimer`, and `cgroupKillReadback`, in that order. Every protected-value materializer and root helper requires all fourteen values to be literal `true`; false, unknown, missing, reordered, or extra fields stop before secret access or mutation.
- Native executable/profile IDs are added only through Foundation's frozen registry extension. This slice owns `ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json`, updates its exact SHA-256 in `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`, and uses Foundation's `hardened-c17-pie-v1` standalone-target compiler. It does not define a second flag vector, modify the N-API export table/dispatcher ABI, or accept a runtime executable/profile selector.
- New JavaScript service modules live only under `server/services/deployment/`. New native sources live only under `ops/control-plane-deploy/native/`. Existing `JAPAN_CI_*`, runtime-config workflows, `ops/edge-node/bootstrap.sh`, `scripts/restore-subscriptions.sh`, and workstation SSH helpers are not reusable authorization paths.
- Fixed principals are `github-control-deploy` and locked `github-control-bootstrap`. Forced-command entry shims are `/usr/local/libexec/proxy-gateway-control-plane-deploy-entry` and `/usr/local/libexec/proxy-gateway-control-plane-bootstrap-entry`; each accepts no argv/original command, clears its environment, and can `execve` only `/usr/bin/sudo -n -- <its-fixed-root-relay>` through its exact root-owned temporary sudoers record. The tiny reviewed native root relay accepts no argv/environment/selector and connects only to its compiled root-only Unix socket. The deploy relay parses no JSON/OIDC. The bootstrap relay has no general JSON parser and recognizes only the bounded canonical public `bootstrap_activation_ready_v1` frame shape so that one already-authorized activation can enter its fixed authenticated phase; it extracts no authority, path, operation, Gate, or secret and rejects/does not extend on every other first-frame shape. Before any protocol-socket connect each relay opens its own fixed root-owned mode-`0600` regular lock file with `O_NOFOLLOW`, validates owner/group/mode/link identity, and takes `flock(LOCK_EX | LOCK_NB)`; one busy lock safely rejects, a successful relay holds the FD through its outermost cleanup, and process death releases it. It then creates the socket with `SOCK_NONBLOCK`, captures the one absolute `CLOCK_MONOTONIC` pre-auth deadline before `connect()`, and spends the same ten-second budget on backlog wait, connect completion, and authorization-ready relay; `EINPROGRESS` is resolved only by `poll(POLLOUT)` plus `getsockopt(SO_ERROR)`. Only a complete valid activation-ready frame changes the bootstrap relay deadline to the fixed 910-second authenticated bound. The `Accept=no` service owns the listen socket; `node-helper-entry` calls `accept4(3, ...)` inside the complete root sandbox and then starts the fixed Node parser. The activation cgroup starts only `/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry bootstrap-operation-v1`; no caller-selectable launcher exists. No shim, relay, protocol service, or helper accepts a caller-selected path, URL, unit, executable, environment, socket, or systemd operation.
- Every root/systemd Node helper starts only through `/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry <fixed-helper-id>`. That native entry rejects unknown/extra argv and inherited descriptors, calls `clearenv()`, then `execve()`s `/usr/bin/node --jitless <fixed-script>` with exactly `PATH=/usr/sbin:/usr/bin`, `LANG=C.UTF-8`, and `LC_ALL=C.UTF-8`; systemd `Environment=`, `EnvironmentFile=`, manager environment, and environment-generator values are therefore not authority. Every helper is fixed-path, least-write-root, timeout-bounded, installed-byte-contract-bound, and tested with hostile manager environment. Socket activation grants only one reviewed protocol surface. This plan only creates reviewed source/unit/manifest bytes and tests; it never copies them into host paths, runs an installer, reloads systemd, enables/starts a unit, creates a principal, or accesses a host.
- Persistent bootstrap state is rooted at `/var/lib/proxy-gateway-control-plane/bootstrap/v1`. Installed immutable contracts are rooted at `/usr/lib/proxy-gateway-control-plane/contracts/v1`. Temporary challenge bytes exist only in sealed memory. A test may substitute the persistent root only through an injected `createDurableStore` instance; production CLIs always use the fixed root.
- Bootstrap generations match `^bg1\.[0-9]{20}\.[0-9a-f]{32}$`; rotation IDs match `^br1\.[0-9a-f]{64}$`; activation IDs match `^ba1\.[0-9a-f]{64}$`; updater reservation IDs match `^uir1\.[0-9a-f]{64}$`; every receipt, HMAC, state, contract, journal, and record digest is lowercase 64-hex.
- Canonical schemas reject unknown, missing, duplicate, and out-of-order fields; non-UTF-8, BOM, CR, NUL, floats, unsafe integers, duplicate keys, non-canonical escapes, and trailing bytes. No parser normalizes attacker-controlled bytes before checking canonical identity.
- Static prepare may write only the immutable generation, prepare envelope, rotation fence/journal, and `hostBundleContentReceipt`. It cannot install a key/sudoers entry, issue an updater, modify GitHub, execute a rotation, touch a database/service/release pointer, or create normal deployment authority.
- Activation is record-last and one-use. Its lease moves only `staging -> armed -> in_progress -> terminal -> cleanup_pending`, then cleanup substeps `cgroup_empty -> triple_removed -> cleanup_evidence_published -> lease_removed`. Reboot is cleanup-only for every nonempty activation state and never re-arms or resumes a privileged mutation.
- The activation deadline is at most 15 minutes. GitHub installation tokens retain their one-hour platform expiry, while the controller use deadline is bounded by activation expiry. Token bytes and App private-key bytes exist only in sealed anonymous memory and never enter state, stdout, stderr, argv, environment, or a filesystem path.
- Rotation uses a durable admission fence. `rotationId` hashes only the pre-existing provider authorization receipt, predecessor tuple, proposed generation, target, static contract digests, and nonce. Activation records/attempts, updater dynamic issuance, final receipt, and closeout point forward and never feed back into `rotationId`.
- Host protocol request types are exactly `execute_auth`, `inventory_normal`, `inventory_compatibility`, `bootstrap_activation`, `status`, `status_terminal_bundle_chunk`, `status_closeout_upload_started`, `status_closeout_ack`, `status_recover_challenge`, and `status_recover`. There is no generic command or path. The two inventory codecs are independently typed, read-only, and usable before a Production Gate exists; neither accepts a Gate, deployment-plan, or transaction selector. `bootstrap_activation` has its own Gate-bound request/final-response ABI, is accepted only by the fixed bootstrap-principal composition, and can invoke only the already reviewed `createBootstrapRootLauncher.run(exactOperationEnvelopeBytes, { onAuthorized })` after current activation-record, expiry, ephemeral-principal, rotation-fence, and approval-receipt bindings are re-read. The owner-internal `bootstrap_activation_ready_v1` phase frame is emitted after those readbacks but before any claim/CAS/mutation; it is consumed inside transport and is never an operator/controller response. Compatibility inventory remains exactly one response and can never emit ready. Activation is never encoded, decoded, or dispatched as compatibility inventory. Ordinary status and exact contiguous terminal-bundle chunks are read-only; recovery challenge/status are also read-only with respect to retained host state. Only bootstrap activation, execute admission, and closeout-started/ack may mutate their disjoint owner state. An inventory, recovery, or bundle request never executes, ACKs, attaches a lease, or rewrites a historical receipt.
- Execute admission accepts only bounded exact canonical `deploymentPlanBytes`, `productionGateReceiptBytes`, Artifact-owned `authorizationRecordBytes`, and one-use GitHub `oidcTokenBytes`. The host validates all four independently, cross-checks their hashes and semantics against each other and installed expectations, then durably publishes/fsyncs/readbacks the fixed accepted-plan object before `ready_for_artifact`. The signed token's issuer, helper-derived audience, repository, event, Environment, direct-workflow `workflow_ref`/`workflow_sha`, source ref/SHA, run ID/attempt, JTI, and expiry must match the authorization. One atomic replay-ledger CAS consumes the Production Gate receipt digest, OIDC JTI digest, token digest, and transaction reservation before ready; any validation or CAS failure writes nothing and receives no artifact.
- Closeout upload-start and ACK each require their own transition-specific, one-use GitHub OIDC audience and atomically consume that transition's JTI in the same closeout-state CAS. A valid SSH key or authorization tuple without the transition token is read-only and performs zero writes.
- Accepted artifacts cross the admission/transaction boundary only through the fixed root-owned custody socket and a closed descriptor/capability adapter. The durable accepted record binds transaction ID, authorization reservation, exact size, SHA-256, EOF observation, and fixed semantic object ID; detach occurs only after readback, and reboot recovery can reopen only that exact accepted object. No caller supplies a path, socket, FD slot, unit, or executable.
- A first request frame is at most 65,536 bytes. Pre-authentication is hard-limited to one absolute 10-second monotonic deadline captured before the nonblocking Unix-socket connect, and an admitted artifact or status-bundle continuation to one absolute 300-second relay deadline; connect completion or byte progress never refreshes either. Bootstrap transport additionally freezes `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS=900000`, `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS=910000`, and `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS=925000` in `control-plane-transport-contract.mjs`: only a valid complete owner-ready frame switches the bootstrap relay from the original deadline to the exact 910-second bound, activation transport requires the exact 925-second request bound, and the protocol service has `RuntimeMaxSec=930`. Both protocol sockets use a fixed backlog of 16. Separate per-principal kernel locks cap each compiled relay at exactly one active-or-pending authenticated task before socket connect; this bound remains effective even if the parser/session limiter is unavailable, and crash releases the lock automatically. The long-lived root-only session-limit broker independently enforces one capacity-4/refill-one-per-10-seconds volatile token bucket plus one active slot for each fixed principal before protected bytes are parsed. Normal inventory/status, challenge, bootstrap ready/result, closeout CAS acknowledgements, recovery responses, and each 768-byte raw terminal-bundle chunk are at most 2,048 bytes and one canonical line. All bundle chunks for one terminal object stream through one authenticated session and consume one broker token/service start. Raw remote stdout/stderr, host paths, endpoint, public key, token, private material, provider payload, database identifiers, and customer data never appear in receipts or errors.
- Controller closeout is monotonic `not_started -> upload_started -> upload_committed_observed`. The finalizer may attach an overdue lease only after the immutable terminal receipt's fixed `controllerCloseoutAckDeadline = terminalPublishedAt + 120 seconds`; it is idempotent, never deletes a lease, and runs from a persistent timer at least every 30 seconds.
- Every file create, replacement, and unlink must use the prerequisite durable primitives and include file fsync, atomic publication, parent-directory fsync, readback, and exact identity verification. Every state transition is compare-and-swap against the previously read digest. A mismatch, unknown state, unexpected path, multiple provider resource, or uncertain token outcome remains fenced.
- Every test injects time, randomness, provider calls, process spawning, and stores. No test reads a developer credential or network endpoint. Test failures and fixtures contain only aggregate-safe synthetic values.

## File Structure

- `server/services/deployment/control-plane-bootstrap-contract.mjs` owns exact receipt/HMAC/scope contracts; `control-plane-bootstrap-store.mjs` owns semantic durable IDs; `control-plane-bootstrap-state-machine.mjs` owns activation/rotation/closeout transitions; `control-plane-bootstrap-activation-publisher.mjs` owns the compatibility activation receipt and content-to-activation typed edge.
- `server/services/deployment/control-plane-bootstrap-updater.mjs` and `control-plane-authorization-adapters.mjs` own updater issuance, metadata scope attestation, Environment/host tuple adapters, dual HMAC evidence, and receipt publication.
- Artifact-owned `server/services/deployment/control-plane-production-authorization.mjs` remains the sole canonical production-authorization record/schema/audience owner. `control-plane-authorization-verifier.mjs` imports that validator and audience derivation and owns only host-side OIDC/installed-state verification; `control-plane-accepted-plan-store.mjs` owns the fixed durable plan/Gate/authorization cross-check object; `control-plane-admission-replay-ledger.mjs` owns atomic Gate/JTI/token/transaction reservation, terminal binding, and deterministic retention compaction. None receives an artifact capability.
- `server/services/deployment/control-plane-bootstrap-systemd-broker.mjs`, `control-plane-transport-contract.mjs`, `control-plane-host-protocol.mjs`, `control-plane-github-oidc-verifier.mjs`, `control-plane-bootstrap-maintenance.mjs`, `control-plane-session-limit-broker.mjs`, `control-plane-ordinary-status-store.mjs`, `control-plane-recovery-challenge-broker.mjs`, and `control-plane-accepted-artifact-handoff.mjs` own the fixed bootstrap manager grammar, strict known-hosts/sealed credential lifecycle, exact two-phase/status codecs, the sole production GitHub Actions OIDC trust factory, capability-gated deterministic retention, cross-process principal rate/active-session leases, post-publication ordinary status, cross-process volatile challenges, and fixed accepted-artifact custody.
- `server/services/deployment/control-plane-controller-closeout-store.mjs` owns the bounded closeout index, transition-specific closeout-OIDC replay CAS, and finalizer-facing terminal eligibility interface.
- `ops/control-plane-deploy/native/src/{bootstrap-entry,deploy-entry,bootstrap-root-relay,deploy-root-relay,node-helper-entry,secure-ssh-transport}.c` owns the two exact sudo entry shims, two bounded root relays, exact clean-environment Node execution, and fixed SSH implementations; `ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json` plus its reviewed-manifest digest is the only Bootstrap-owned extension to Foundation's compile-time executable/profile registry.
- `ops/control-plane-deploy/contracts/`, `ssh/`, and `sudoers/` own immutable layout/App/authorization templates, exact no-argument generation-/activation-bound privilege records, and activation-lease/typed-edge schemas; `ops/control-plane-deploy/systemd/` owns the two root-only `Accept=no` protocol sockets/services, bootstrap systemd broker, cleanup, preflight, long-lived session-limit broker, challenge broker, accepted-artifact custody, finalizer timer, authorization target, and candidate drop-in. There is no general shell, Node, systemd, environment-preserving, argument-bearing, or alternate-executable sudo authority. The bootstrap record is activation-bound and cleanup removes it; the deploy record is generation-bound and rotation/revocation replaces or removes it through the same verified authorization lifecycle.
- `scripts/control-plane-bootstrap-*.mjs`, `control-plane-deploy-root.mjs`, `control-plane-boot-preflight.mjs`, `control-plane-closeout-finalizer.mjs`, and `control-plane-recovery-challenge-broker.mjs` are zero-argument fixed adapters only.
- `server/tests/control-plane-{bootstrap,authorization,admission-replay-ledger,transport,host-protocol,recovery-challenge-broker,accepted-artifact-handoff,controller-closeout}*.test.mjs` own unit/contract/fault matrices; `integration/control-plane-deploy/bootstrap-clean-linux.test.mjs` owns target-matched systemd/cgroup/SSH recovery proof.
- `package.json` adds only the explicit disposable-Linux validation script. No workflow, production configuration, secret, account, unit enablement, or dispatch file is created by this plan.

---

### Task 1: Canonical bootstrap receipt and hash-DAG contracts

**Files:**
- Create: `server/services/deployment/control-plane-bootstrap-contract.mjs`
- Test: `server/tests/control-plane-bootstrap-contract.test.mjs`

**Interfaces:**
- Export constants `BOOTSTRAP_OPERATIONS`, `DEPLOY_ENVIRONMENT_SECRET_NAMES`, `DEPLOY_ENVIRONMENT_VARIABLE_NAMES`, `BOOTSTRAP_STATE_ROOT`, `BOOTSTRAP_CONTRACT_ROOT`, and closed ordered key arrays for every schema.
- Export `parseStaticPrepareEnvelope(bytes)`, `computeRotationId(envelope)`, `createHostBundleContentReceipt(input)`, `parseHostBundleContentReceipt(bytes)`, `createHostActivationReceipt(input)`, `parseHostActivationReceipt(bytes)`, `createBootstrapReceipt(input)`, and `parseBootstrapReceipt(bytes)`.
- Export controller-side `createAuthorizationBindingHmac(input, bindingKey)` and `verifyGitHubAuthorizationTuple(input, bindingKey)`; host-side `createHostAuthorizationReadbackHmac(input, hostEvidenceKey)` and `verifyHostAuthorizationReadback(input, hostEvidenceKey)`; and keyless `crossCheckAuthorizationEvidence(githubEvidence, hostEvidence, expected)`. The two keys never enter the same authority/process; only aggregate-safe generation/HMAC/key-generation digests cross the boundary.
- Export `validateDeployEnvironmentInventory({ environmentSecretNames, environmentVariableNames, repositorySecretNames, repositoryVariableNames, organizationSecretNames, organizationVariableNames, variables })`; it accepts exactly the reserved Environment names, rejects a same-name repository/organization fallback, requires credential ID `japan-control-plane-github-deploy-v1`, and returns only aggregate booleans/digests. The separate HMAC creator validates the protected user as exactly `github-control-deploy`.
- Each creator returns `{ bytes, sha256 }`; each parser returns a deeply frozen value plus the digest of the exact accepted bytes.

- [ ] **Step 1: Write failing receipt-domain and canonical-order tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeRotationId,
  createHostBundleContentReceipt,
  parseHostBundleContentReceipt,
} from '../services/deployment/control-plane-bootstrap-contract.mjs';

const d = (n) => n.toString(16).padStart(64, '0');
const prepare = Object.freeze({
  schema: 'github_control_plane_static_prepare_v1',
  bootstrapAuthorizationGateReceiptSha256: d(1),
  previousBootstrapGeneration: null,
  previousBootstrapReceiptSha256: null,
  proposedBootstrapGeneration: 'bg1.00000000000000000001.0123456789abcdef0123456789abcdef',
  target: 'japan-control-plane',
  hostLayoutContractSha256: d(2),
  bootstrapStaticContractSha256: d(3),
  githubBootstrapUpdaterAppContractSha256: d(4),
  nonceHex: '00112233445566778899aabbccddeeff',
  stagedBundleManifestSha256: d(5),
  hostExecutionContentSha256: d(6),
  ownershipModeContractSha256: d(7),
  createdAt: '2026-08-08T00:00:00.000Z',
  expiresAt: '2026-08-08T00:15:00.000Z',
});

test('rotationId excludes dynamic activation, updater, final receipt, and closeout data', () => {
  const expected = computeRotationId(prepare);
  assert.match(expected, /^br1\.[0-9a-f]{64}$/);
  assert.throws(
    () => computeRotationId({ ...prepare, activationRecordSha256: d(9) }),
    /unknown_field/,
  );
  assert.equal(computeRotationId(prepare), expected);
});

test('hostBundleContentReceipt accepts only exact canonical bytes and ordered keys', () => {
  const receipt = createHostBundleContentReceipt({
    bootstrapAuthorizationGateReceiptSha256: d(1),
    rotationId: computeRotationId(prepare),
    bootstrapGeneration: prepare.proposedBootstrapGeneration,
    previousBootstrapGeneration: null,
    previousBootstrapReceiptSha256: null,
    rotationPrepareJournalSha256: d(5),
    target: 'japan-control-plane',
    releaseUnit: 'control-plane-app',
    stagedBundleManifestSha256: d(6),
    hostExecutionContentSha256: d(7),
    ownershipModeContractSha256: d(8),
    createdAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:15:00.000Z',
  });
  assert.equal(parseHostBundleContentReceipt(receipt.bytes).sha256, receipt.sha256);
  const reordered = Buffer.from(`${JSON.stringify({
    rotationId: computeRotationId(prepare),
    schemaVersion: '1',
    receiptType: 'host_bundle_content',
    bootstrapAuthorizationGateReceiptSha256: d(1),
    bootstrapGeneration: prepare.proposedBootstrapGeneration,
    previousBootstrapGeneration: null,
    previousBootstrapReceiptSha256: null,
    rotationPrepareJournalSha256: d(5),
    target: 'japan-control-plane',
    releaseUnit: 'control-plane-app',
    stagedBundleManifestSha256: d(6),
    hostExecutionContentSha256: d(7),
    ownershipModeContractSha256: d(8),
    createdAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:15:00.000Z',
  })}\n`);
  assert.throws(() => parseHostBundleContentReceipt(reordered), /canonical_field_order/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-contract.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `control-plane-bootstrap-contract.mjs`.

- [ ] **Step 3: Implement closed schemas, forward-only hashes, and authorization tuple verification**

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex,
} from './canonical-json.mjs';

export const BOOTSTRAP_OPERATIONS = Object.freeze([
  'prepare_genesis',
  'prepare_rotation',
  'rotation_status',
  'resume_prepared_rotation',
  'abort_prepared_rotation',
]);

export const DEPLOY_ENVIRONMENT_SECRET_NAMES = Object.freeze([
  'JAPAN_CONTROL_DEPLOY_HOST',
  'JAPAN_CONTROL_DEPLOY_PORT',
  'JAPAN_CONTROL_DEPLOY_USER',
  'JAPAN_CONTROL_DEPLOY_PRIVATE_KEY',
  'JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS',
  'JAPAN_CONTROL_DEPLOY_BINDING_KEY',
  'JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY',
]);

export const DEPLOY_ENVIRONMENT_VARIABLE_NAMES = Object.freeze([
  'JAPAN_CONTROL_DEPLOY_CREDENTIAL_ID',
  'JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION',
  'JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256',
  'JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256',
  'JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256',
  'JAPAN_CONTROL_DEPLOY_METADATA_APP_ID',
  'JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID',
]);

export const HOST_BUNDLE_CONTENT_FIELDS = Object.freeze([
  'schemaVersion', 'receiptType', 'rotationId',
  'bootstrapAuthorizationGateReceiptSha256', 'bootstrapGeneration',
  'previousBootstrapGeneration', 'previousBootstrapReceiptSha256',
  'rotationPrepareJournalSha256', 'target', 'releaseUnit',
  'stagedBundleManifestSha256', 'hostExecutionContentSha256',
  'ownershipModeContractSha256', 'createdAt', 'expiresAt',
]);

export const HOST_ACTIVATION_FIELDS = Object.freeze([
  'schemaVersion', 'receiptType', 'rotationId',
  'bootstrapAuthorizationGateReceiptSha256', 'bootstrapGeneration',
  'previousBootstrapGeneration', 'previousBootstrapReceiptSha256',
  'rotationPrepareJournalSha256', 'parentContentReceiptSha256',
  'activationMode', 'compatibilityArtifactSha256',
  'activeHostExecutionSha256', 'activeRollbackReleaseSha256',
  'applicationRecoveryBindingSha256', 'createdAt', 'expiresAt',
]);

export const BOOTSTRAP_RECEIPT_FIELDS = Object.freeze([
  'schemaVersion', 'receiptType', 'rotationId', 'bootstrapGeneration',
  'previousBootstrapGeneration', 'previousBootstrapReceiptSha256',
  'rotationPrepareJournalSha256', 'generationTransitionSha256',
  'parentContentReceiptSha256', 'parentActivationReceiptSha256',
  'bootstrapAuthorizationGateReceiptSha256', 'bootstrapActivationRecordSha256',
  'githubMetadataAppContractSha256', 'githubBootstrapUpdaterAppContractSha256',
  'githubBootstrapUpdaterIssuanceChainSha256', 'expectedAuthorizationScopeNamesSha256',
  'githubAuthorizationBindingHmacSha256', 'hostAuthorizationReadbackHmacSha256',
  'hostAuthorizationEvidenceKeyGeneration', 'bootstrapRecoveryContractSha256',
  'hostExecutionStaticContentSha256', 'criticalIdentityFenceContractSha256',
  'receiptRecoveryChallengeContractSha256', 'receiptRecoveryWorkflowSha256',
  'receiptRecoveryControllerSha256', 'receiptRecoveryParserRegistrySha256', 'createdAt',
]);

const ROTATION_KEYS = Object.freeze([
  'schema',
  'bootstrapAuthorizationGateReceiptSha256',
  'previousBootstrapGeneration',
  'previousBootstrapReceiptSha256',
  'proposedBootstrapGeneration',
  'target',
  'hostLayoutContractSha256',
  'bootstrapStaticContractSha256',
  'githubBootstrapUpdaterAppContractSha256',
  'nonceHex',
]);

const ROTATION_ID_CONTRACT = Object.freeze({
  schemaId: 'github_control_plane_static_prepare_v1',
  maxBytes: 8_192,
  fieldOrder: ROTATION_KEYS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateRotationIdEnvelope,
});

const STATIC_PREPARE_CONTRACT = Object.freeze({
  schemaId: 'github_control_plane_static_prepare_request_v1',
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    ...ROTATION_KEYS,
    'stagedBundleManifestSha256', 'hostExecutionContentSha256',
    'ownershipModeContractSha256', 'createdAt', 'expiresAt',
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateStaticPrepareRequest,
});

const AUTHORIZATION_BINDING_CONTRACT = Object.freeze({
  schemaId: 'github_control_plane_authorization_binding_v1',
  maxBytes: 8_192,
  fieldOrder: Object.freeze([
    'schema', 'environmentName', 'environmentProtectionPolicySha256',
    'expectedSecretNamesSha256', 'expectedVariableNamesSha256',
    'exactScopeNoFallbackAttestationSha256', 'metadataAppIdentityPermissionSha256',
    'credentialId', 'generation', 'host', 'user', 'port',
    'deploymentPublicKeyFingerprint', 'knownHostsEndpointKeyTupleSha256',
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateAuthorizationBinding,
});

const AUTHORIZATION_POINTER_CONTRACT = Object.freeze({
  schemaId: 'github_control_plane_authorization_pointer_v1',
  maxBytes: 2_048,
  fieldOrder: Object.freeze([
    'schema', 'generation', 'bootstrapReceiptSha256',
    'authorizationBindingHmacSha256', 'scopeContractSha256',
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateAuthorizationPointer,
});

const HOST_AUTHORIZATION_READBACK_CONTRACT = Object.freeze({
  schemaId: 'host_authorization_readback_v1',
  maxBytes: 8_192,
  fieldOrder: Object.freeze([
    'schema', 'generation', 'installedAccountContractSha256',
    'sudoersContractSha256', 'authorizedKeyRestrictionSha256',
    'deploymentPublicKeyFingerprint', 'launcherBindingSha256',
    'pinnedHostKeyContractSha256', 'hostAuthorizationEvidenceKeyGeneration',
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateHostAuthorizationReadback,
});

export function computeRotationId(envelope) {
  serializeCanonicalJsonBytes(envelope, STATIC_PREPARE_CONTRACT);
  const rotationEnvelope = Object.fromEntries(ROTATION_KEYS.map((key) => [key, envelope[key]]));
  return `br1.${sha256Hex(serializeCanonicalJsonBytes(rotationEnvelope, ROTATION_ID_CONTRACT))}`;
}

export function createAuthorizationBindingHmac(input, bindingKey) {
  if (!Buffer.isBuffer(bindingKey) || bindingKey.length !== 32) {
    throw new TypeError('binding_key_must_be_32_bytes');
  }
  if (input.environmentName !== 'vultr-japan-production') throw new Error('environment_name_mismatch');
  if (input.credentialId !== 'japan-control-plane-github-deploy-v1') throw new Error('credential_id_mismatch');
  if (input.user !== 'github-control-deploy') throw new Error('deploy_user_mismatch');
  const bytes = serializeCanonicalJsonBytes(input, AUTHORIZATION_BINDING_CONTRACT);
  return createHmac('sha256', bindingKey).update(bytes).digest('hex');
}

export function createHostAuthorizationReadbackHmac(input, hostEvidenceKey) {
  if (!Buffer.isBuffer(hostEvidenceKey) || hostEvidenceKey.length !== 32) {
    throw new TypeError('host_evidence_key_must_be_32_bytes');
  }
  const bytes = serializeCanonicalJsonBytes(input, HOST_AUTHORIZATION_READBACK_CONTRACT);
  return createHmac('sha256', hostEvidenceKey).update(bytes).digest('hex');
}

export function verifyGitHubAuthorizationTuple(input, bindingKey) {
  const actual = Buffer.from(createAuthorizationBindingHmac(input.binding, bindingKey), 'hex');
  const expected = Buffer.from(input.authorizationBindingHmacSha256, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('authorization_binding_mismatch');
  }
  const outer = sha256Hex(serializeCanonicalJsonBytes(input.pointer, AUTHORIZATION_POINTER_CONTRACT));
  if (outer !== input.authorizationStateSha256) throw new Error('authorization_state_mismatch');
  return Object.freeze({
    generation: input.binding.generation,
    authorizationBindingHmacSha256: input.authorizationBindingHmacSha256,
    authorizationStateSha256: input.authorizationStateSha256,
  });
}

export function verifyHostAuthorizationReadback(input, hostEvidenceKey) {
  const actual = Buffer.from(createHostAuthorizationReadbackHmac(input.binding, hostEvidenceKey), 'hex');
  const expected = Buffer.from(input.hostAuthorizationReadbackHmacSha256, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('host_authorization_binding_mismatch');
  }
  return Object.freeze({
    generation: input.binding.generation,
    hostAuthorizationReadbackHmacSha256: input.hostAuthorizationReadbackHmacSha256,
    hostAuthorizationEvidenceKeyGeneration: input.binding.hostAuthorizationEvidenceKeyGeneration,
  });
}

export function crossCheckAuthorizationEvidence(githubEvidence, hostEvidence, expected) {
  if (githubEvidence.generation !== expected.generation || hostEvidence.generation !== expected.generation) {
    throw new Error('authorization_generation_crosscheck_mismatch');
  }
  if (githubEvidence.authorizationBindingHmacSha256 !== expected.authorizationBindingHmacSha256 ||
      hostEvidence.hostAuthorizationReadbackHmacSha256 !== expected.hostAuthorizationReadbackHmacSha256 ||
      hostEvidence.hostAuthorizationEvidenceKeyGeneration !== expected.hostAuthorizationEvidenceKeyGeneration) {
    throw new Error('authorization_safe_digest_crosscheck_mismatch');
  }
  return Object.freeze({ crossChecked: true });
}

export function validateDeployEnvironmentInventory(input) {
  const actual = [...input.environmentSecretNames].sort();
  const expected = [...DEPLOY_ENVIRONMENT_SECRET_NAMES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('environment_secret_scope_mismatch');
  const actualVariables = [...input.environmentVariableNames].sort();
  const expectedVariables = [...DEPLOY_ENVIRONMENT_VARIABLE_NAMES].sort();
  if (JSON.stringify(actualVariables) !== JSON.stringify(expectedVariables)) {
    throw new Error('environment_variable_scope_mismatch');
  }
  const reserved = new Set([...DEPLOY_ENVIRONMENT_SECRET_NAMES, ...DEPLOY_ENVIRONMENT_VARIABLE_NAMES]);
  for (const name of [
    ...input.repositorySecretNames, ...input.repositoryVariableNames,
    ...input.organizationSecretNames, ...input.organizationVariableNames,
  ]) if (reserved.has(name)) throw new Error('wider_scope_fallback_present');
  if (input.variables.JAPAN_CONTROL_DEPLOY_CREDENTIAL_ID !== 'japan-control-plane-github-deploy-v1') {
    throw new Error('credential_id_mismatch');
  }
  validateGeneration(input.variables.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION);
  for (const name of DEPLOY_ENVIRONMENT_VARIABLE_NAMES.slice(2, 5)) validateSha256(input.variables[name]);
  return Object.freeze({ reservedSecretNamesExact: true, reservedVariableTupleValid: true });
}
```

Implement the three receipt creators/parsers with literal ordered-key arrays and explicit domain/regex/nullable checks. Do not share a permissive object-spread parser between domains.

- [ ] **Step 4: Add negative DAG, tuple, and byte-canonicality cases**

Add table tests for all three receipt domains: unknown/missing/duplicate/out-of-order keys, wrong type tag, invalid UTF-8/BOM/CR/NUL, replayed parent, cross-target substitution, wrong predecessor, self-digest field, dynamic value fed into `rotationId`, wrong HMAC, wrong outer digest, wrong credential ID, and invalid generation/rotation/digest grammar.

Run the targeted test now; expected RED is the first unimplemented validator/edge-marker assertion. Add only the validators and typed-edge logic needed for this batch, then rerun before Step 5.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-contract.test.mjs`

Expected: PASS, including every negative table row.

- [ ] **Step 6: Commit the contract slice**

```bash
git add server/services/deployment/control-plane-bootstrap-contract.mjs server/tests/control-plane-bootstrap-contract.test.mjs
git commit -m "feat: define control-plane bootstrap receipt contracts"
```

---

### Task 2: Durable static prepare with a fixed no-argument adapter

**Files:**
- Create: `server/services/deployment/control-plane-bootstrap-store.mjs`
- Create: `scripts/control-plane-bootstrap-static-prepare.mjs`
- Create: `ops/control-plane-deploy/contracts/host-layout-v1.json`
- Create: `ops/control-plane-deploy/contracts/bootstrap-static-v1.json`
- Test: `server/tests/control-plane-bootstrap-store.test.mjs`

**Interfaces:**
- Export `createBootstrapStore({ native, durableStore, now, randomBytes })`. Every returned operation first requires the complete fourteen-feature Foundation vector; production dependency construction performs the same gate before opening the fixed root directory capability.
- The returned object exposes `prepareStaticBundle(requestBytes)`, `readRotation(rotationId, expectedDigest)`, `compareAndSwapRotation(rotationId, expectedDigest, nextRecord)`, `writeImmutableEvidence(kind, id, value)`, and `removeLease(kind, id, expectedDigest)`. Task 3 adds activation methods only after its exact lease contract exists.
- `prepareStaticBundle` is the only static-prepare mutation and returns one aggregate-safe canonical `hostBundleContentReceipt` line.
- `node scripts/control-plane-bootstrap-static-prepare.mjs` accepts zero argv, reads one canonical request of at most 65,536 bytes from stdin, uses the fixed persistent root, writes one receipt to stdout, and maps all failures to one safe canonical error line on stderr.
- `host-layout-v1.json` is the static ordered path/ownership contract: source logical ID, exact destination, owner `root`, group `root`, and mode. It deliberately contains no not-yet-built SHA. It includes both forced-command shims, both native root relays, the fixed clean-environment Node helper entry, the in-cgroup operation, every static-prepare/activation/updater/cleanup/preflight/finalizer/session-limit-broker/challenge-broker/accepted-artifact/systemd-broker executable, the Host-owned staged runtime provider `server/services/deployment/control-plane-host-inventory-readers.mjs`, activation-lease/typed-edge/Artifact production-authorization/replay/accepted-plan/accepted-artifact/closeout-index contracts, both protocol socket/service pairs, cleanup/preflight/finalizer/session-limit-broker/challenge-broker/accepted-artifact/systemd-broker service units and sockets, finalizer timer, authorization target, candidate authorization drop-in, deploy/bootstrap authorized-key option templates, the activation-bound bootstrap sudoers evidence contract, the generation-bound deploy sudoers contract, and immutable contract root. It also declares two distinct root:root mode-`0600`, regular, single-link relay lock files at `/var/lib/proxy-gateway-control-plane/bootstrap/v1/relay-locks/deploy-root-relay.lock` and `/var/lib/proxy-gateway-control-plane/bootstrap/v1/relay-locks/bootstrap-root-relay.lock`, plus the root-owned deployment home/transaction-custody bindings and locked bootstrap home with no untracked key/sudo rule. After all sources are built, the source-integration slice creates the separate content-addressed staged bundle manifest. Static prepare verifies the staged manifest digest, complete content digest, and this ownership/mode contract digest; the final bootstrap receipt binds all of those static bytes. Static prepare does not install anything. The Host plan remains the sole host-bundle installer owner: its one-shot post-merge `control-plane-host-bundle-installer.mjs` is the fresh-G1a staging tool itself and is deliberately not installed inside the bundle. G1a installs and reads back this layout, while Bootstrap consumes only the exact Host-owned installed-content/readback result and never defines or invokes a second installer.

- [ ] **Step 1: Write a failing allowlisted-write and crash-matrix test**

```js
test('static prepare publishes only generation, envelope, fence, journal, and content receipt', async () => {
  const writes = [];
  const store = createBootstrapStore({
    native: eligibleNativeHarness(),
    durableStore: createRecordingDurableStore(writes),
    now: () => Date.parse('2026-08-08T00:00:00.000Z'),
    randomBytes: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
  });
  const result = await store.prepareStaticBundle(validPrepareBytes());
  assert.deepEqual(writes.filter(({ operation }) => operation === 'publish').map(({ logicalId }) => logicalId.kind), [
    'rotationJournal',
    'rotationFence',
    'bootstrapGeneration',
    'staticPrepareEnvelope',
    'hostBundleContentReceipt',
  ]);
  assert.equal(writes.filter((entry) => entry.operation === 'cas' && logicalKindOf(entry) === 'rotationJournal').length, 1);
  assert.equal(writes.some(({ logicalId }) => /authorizedKey|sudoers|releasePointer|database/.test(logicalId.kind)), false);
});

test('static prepare ineligibility opens no root and performs no durable operation', async () => {
  const calls = [];
  assert.throws(
    () => createProductionBootstrapDependencies(createDependencyHarness({ calls, capabilityEligible: false })),
    /linux_capability_ineligible/,
  );
  assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
});

test('preparing journal binds the byte-exact recoverable fence under an advancing clock', async () => {
  const clock = advancingClock([
    '2026-08-08T00:00:00.000Z',
    '2026-08-08T00:00:00.001Z',
  ]);
  const durableStore = createFaultingDurableStore({ crashAfter: 'rotationJournal:readback' });
  const store = createBootstrapStore({
    native: eligibleNativeHarness(),
    durableStore,
    now: clock.now,
    randomBytes: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
  });
  await assert.rejects(store.prepareStaticBundle(validPrepareBytes()), /injected_crash/);
  const journal = durableStore.readPublishedCanonical('rotationJournal');
  const recoveredFenceBytes = serializeCanonicalJsonBytes(
    journal.value.fence,
    BOOTSTRAP_STORE_CONTRACTS.rotationFence,
  );
  assert.equal(sha256Hex(recoveredFenceBytes), journal.value.fenceSha256);
  assert.equal(journal.value.createdAt, journal.value.fence.createdAt);
  assert.equal(clock.callCount, 1);
  assert.equal(durableStore.hasPublished('rotationFence'), false);
});
```

- [ ] **Step 2: Run the store test and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-store.test.mjs`

Expected: FAIL because `createBootstrapStore` is not implemented.

- [ ] **Step 3: Implement immutable publication and journal-last linkage**

```js
export function createBootstrapStore({ native, durableStore, now, randomBytes }) {
  return Object.freeze({
    async prepareStaticBundle(requestBytes) {
      requireAllFoundationCapabilities(native.probeLinuxCapabilities());
      const request = parseStaticPrepareEnvelope(requestBytes);
      const rotationId = computeRotationId(request.value);
      const ids = createBootstrapLogicalIds(request.value.proposedBootstrapGeneration, rotationId);
      const prepareStartedAt = now();
      const fence = createFence(rotationId, prepareStartedAt);
      const fenceBytes = serializeCanonicalJsonBytes(
        fence,
        BOOTSTRAP_STORE_CONTRACTS.rotationFence,
      );
      const preparingJournalBytes = serializeCanonicalJsonBytes(
        createPreparingJournal({
          rotationId,
          requestSha256: request.sha256,
          request: request.value,
          nonceBytes: randomBytes(16),
          createdAt: prepareStartedAt,
          fence,
          fenceSha256: sha256Hex(fenceBytes),
        }),
        BOOTSTRAP_STORE_CONTRACTS.rotationJournal,
      );
      const generationBytes = serializeCanonicalJsonBytes(
        createGenerationRecord(request.value),
        BOOTSTRAP_STORE_CONTRACTS.generation,
      );
      const envelopeBytes = serializeCanonicalJsonBytes(request.value, STATIC_PREPARE_CONTRACT);
      await durableStore.publishImmutable(ids.rotationJournal, preparingJournalBytes);
      await durableStore.readbackExact(ids.rotationJournal, sha256Hex(preparingJournalBytes));
      await durableStore.publishImmutable(ids.rotationFence, fenceBytes);
      await durableStore.readbackExact(ids.rotationFence, sha256Hex(fenceBytes));
      await durableStore.publishImmutable(ids.generation, generationBytes);
      await durableStore.readbackExact(ids.generation, sha256Hex(generationBytes));
      await durableStore.publishImmutable(ids.prepareEnvelope, envelopeBytes);
      await durableStore.readbackExact(ids.prepareEnvelope, sha256Hex(envelopeBytes));
      const preparedJournalBytes = serializeCanonicalJsonBytes(
        createPreparedJournal({
          preparingJournalBytes,
          generationSha256: sha256Hex(generationBytes),
          prepareEnvelopeSha256: sha256Hex(envelopeBytes),
          fenceSha256: sha256Hex(fenceBytes),
          preparedAt: now(),
        }),
        BOOTSTRAP_STORE_CONTRACTS.rotationJournal,
      );
      await durableStore.casCanonical(ids.rotationJournal, sha256Hex(preparingJournalBytes), preparedJournalBytes);
      await durableStore.readbackExact(ids.rotationJournal, sha256Hex(preparedJournalBytes));
      const receipt = createHostBundleContentReceipt({
        rotationId,
        bootstrapAuthorizationGateReceiptSha256: request.value.bootstrapAuthorizationGateReceiptSha256,
        bootstrapGeneration: request.value.proposedBootstrapGeneration,
        previousBootstrapGeneration: request.value.previousBootstrapGeneration,
        previousBootstrapReceiptSha256: request.value.previousBootstrapReceiptSha256,
        rotationPrepareJournalSha256: sha256Hex(preparedJournalBytes),
        target: 'japan-control-plane',
        releaseUnit: 'control-plane-app',
        stagedBundleManifestSha256: request.value.stagedBundleManifestSha256,
        hostExecutionContentSha256: request.value.hostExecutionContentSha256,
        ownershipModeContractSha256: request.value.ownershipModeContractSha256,
        createdAt: request.value.createdAt,
        expiresAt: request.value.expiresAt,
      });
      await durableStore.publishImmutable(ids.contentReceipt(receipt.sha256), receipt.bytes);
      await durableStore.readbackExact(ids.contentReceipt(receipt.sha256), receipt.sha256);
      return Object.freeze({ rotationId, ...receipt });
    },
    async readRotation(rotationId, expectedDigest) {
      const bytes = await durableStore.readbackExact(rotationLogicalId(rotationId), expectedDigest);
      return Object.freeze({ value: parseCanonicalJsonBytes(bytes, ROTATION_JOURNAL_CONTRACT), sha256: expectedDigest });
    },
    async compareAndSwapRotation(rotationId, expectedDigest, nextRecord) {
      const bytes = serializeCanonicalJsonBytes(nextRecord, ROTATION_JOURNAL_CONTRACT);
      await durableStore.casCanonical(rotationLogicalId(rotationId), expectedDigest, bytes);
      await durableStore.readbackExact(rotationLogicalId(rotationId), sha256Hex(bytes));
      return Object.freeze({ value: nextRecord, sha256: sha256Hex(bytes) });
    },
    async writeImmutableEvidence(kind, id, value) {
      const contract = evidenceContract(kind);
      const bytes = serializeCanonicalJsonBytes(value, contract);
      await durableStore.publishImmutable(evidenceLogicalId(kind, id), bytes);
      await durableStore.readbackExact(evidenceLogicalId(kind, id), sha256Hex(bytes));
      return Object.freeze({ value, sha256: sha256Hex(bytes) });
    },
    async removeLease(kind, id, expectedDigest) {
      await durableStore.unlinkVerified(leaseLogicalId(kind, id), expectedDigest);
      return Object.freeze({ removed: true });
    },
  });
}
```

The concrete implementation must preflight absence and predecessor state before the first write. It samples the clock once into `prepareStartedAt`, constructs the complete fence bytes before any mutation, and makes the first durable object a `preparing` journal that binds the complete canonical request, exact fence value and digest, rotation ID, nonce, and expiry. If a crash occurs before fence publication, boot preflight may perform its sole deterministic repair: publish/read back those byte-exact fence bytes from the verified journal; it never calls the clock to reconstruct them. Every later partial boundary therefore has journal plus fence; generation/envelope follow, one CAS advances the journal to `prepared`, and the content receipt is last. Recovery either completes the same bytes or remains fenced; it never silently deletes an uncertain fence.

- [ ] **Step 4: Implement the no-argument CLI with bounded input and safe output**

```js
const input = await readBoundedStdin(65_536);
if (process.argv.length !== 2) throw new Error('arguments_forbidden');
const store = createBootstrapStore(createProductionBootstrapDependencies());
const receipt = await store.prepareStaticBundle(input);
process.stdout.write(receipt.bytes);
```

The production dependency factory first calls `requireAllFoundationCapabilities(native.probeLinuxCapabilities())`; only after all fourteen literal values pass may it open `/var/lib/proxy-gateway-control-plane/bootstrap/v1` once as its reviewed directory capability and call `createDurableStore({ contracts: BOOTSTRAP_LOGICAL_RECORD_CONTRACTS, fsOps: { rootFd }, native })`. It does not pass `rootDirectory`, read a path/account/command/executable from environment variables, or implement a JavaScript read/check/write mutation. Contract tests table-drive false, missing, reordered, and extra capability fields and require root-open/native-store call counts zero; eligible tests spy on `durablePublishNoReplace`, `durableCompareAndSwap`, and `durableUnlinkVerified` and require exactly one corresponding native atomic call per store mutation.

- [ ] **Step 5: Add fault injection after every durable boundary**

Inject failure before/after each file fsync, publication rename, parent fsync, and readback. Assert: no key/sudo/GitHub/database/service/pointer operation occurs; exact replay is idempotent; a mismatched replay rejects; a partial tuple retains the fence; an unexpected file or symlink rejects; and genesis/rotation predecessor rules fail closed.

Run the store test and observe the first crash-convergence assertion fail, then implement only the recovery/readback branch for this matrix before Step 6.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-contract.test.mjs server/tests/control-plane-bootstrap-store.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit static prepare**

```bash
git add server/services/deployment/control-plane-bootstrap-store.mjs scripts/control-plane-bootstrap-static-prepare.mjs ops/control-plane-deploy/contracts/host-layout-v1.json ops/control-plane-deploy/contracts/bootstrap-static-v1.json server/tests/control-plane-bootstrap-store.test.mjs
git commit -m "feat: add durable control-plane static prepare"
```

---

### Task 3: Ephemeral activation and cleanup-only state machine

**Files:**
- Create: `server/services/deployment/control-plane-bootstrap-activation-contract.mjs`
- Modify: `server/services/deployment/control-plane-bootstrap-store.mjs`
- Create: `server/services/deployment/control-plane-bootstrap-state-machine.mjs`
- Create: `server/services/deployment/control-plane-bootstrap-activation-publisher.mjs`
- Create: `scripts/control-plane-bootstrap-activation.mjs`
- Create: `ops/control-plane-deploy/contracts/bootstrap-activation-lease-v1.json`
- Create: `ops/control-plane-deploy/contracts/bootstrap-typed-edge-v1.json`
- Create: `ops/control-plane-deploy/ssh/github-control-bootstrap-authorized-key-options`
- Create: `ops/control-plane-deploy/sudoers/github-control-bootstrap-ephemeral`
- Test: `server/tests/control-plane-bootstrap-activation-contract.test.mjs`
- Test: `server/tests/control-plane-bootstrap-state-machine.test.mjs`
- Test: `server/tests/control-plane-bootstrap-activation-publisher.test.mjs`

**Interfaces:**
- From `control-plane-bootstrap-activation-contract.mjs`, export `ACTIVATION_LEASE_FIELDS`, `ACTIVATION_LEASE_CONTRACT`, `activationLeaseLogicalId(activationId)`, `createActivationStagingLease(request)`, `parseActivationLease(bytes)`, and `createActivationRecord(request)`. `activationLeaseLogicalId` returns only `{ kind: 'activationStateLease', id: activationId }`; the registered store contract validates the `ba1` grammar and maps it to mode-`0600` `activations/by-id/<validated-id>/lease.json`. No caller supplies the relative path.
- Extend `createBootstrapStore` with `readActivation(activationId, expectedDigest)` and `compareAndSwapActivation(activationId, expectedDigest, nextRecord)` by importing this exact contract/logical-ID function; both methods serialize, CAS, and read back the exact digest and expose no alternate contract/path.
- `ACTIVATION_LEASE_FIELDS` is exactly `schema`, `activationId`, `state`, `cleanupSubstep`, `bootstrapAuthorizationGateReceiptSha256`, `bootstrapActivationGateReceiptSha256`, `hostBundleContentReceiptSha256`, `hostExecutionContentSha256`, `rollbackReleaseManifestSha256`, `applicationRecoveryBindingSha256`, `activationMode`, `compatibilityArtifactSha256`, `rotationId`, `rotationJournalSha256`, `operation`, `target`, `currentGeneration`, `proposedGeneration`, `createdAt`, `expiresAt`, `authorizedKeyPath`, `authorizedKeySha256`, `sudoersPath`, `sudoersSha256`, `publicKeyFingerprint`, `activationRecordPath`, `activationRecordState`, `activationRecordSha256`, `activationCgroupUnit`, `cleanupReason`, `terminalResultSha256`, and `cleanupEvidenceSha256`, in that order. Every nullable field is present as canonical `null`; unknown fields reject.
- Export `ACTIVATION_STATES`, `CLEANUP_SUBSTEPS`, `parseActivationRequest(bytes)`, and `createBootstrapActivationMachine({ native, store, clock, cgroup, installedPaths, cleanupEvidenceReader, rotationJournalReader })`. Every stateful method requires the complete Foundation vector before reading installed paths or state.
- The machine exposes `stage(requestBytes)`, `claim(activationId, expectedLeaseSha256)`, `writeTerminal(activationId, expectedLeaseSha256, result)`, `beginCleanup(activationId, reason)`, and `resumeCleanup(activationId)`.
- `stage` writes in the strict order lease `staging`, authorized-key entry, root-owned sudoers mode `0440`, immutable activation record, then lease CAS `armed`. The sudoers bytes are exactly `github-control-bootstrap ALL=(root) NOPASSWD:NOSETENV: /usr/local/libexec/proxy-gateway-control-plane-bootstrap-root-relay\n`; any argument, wildcard, second command, `SETENV`, shell/Node/systemd path, owner/mode drift, or unbound digest rejects before publication.
- From `control-plane-bootstrap-activation-publisher.mjs`, export `ACTIVATION_EDGE_CONTRACT`, `hostActivationEdgeLogicalId(contentReceiptSha256)`, and `createCompatibilityActivationPublisher({ native, store, hostReadback, clock })`. Its `publish({ contentReceiptBytes, activationGateReceiptBytes, activationMode, compatibilityArtifactSha256 })` requires the complete Foundation vector before host readback/store access, independently re-hashes the activated host execution, healthy rollback release, and application recovery binding; reserves then consumes the exact unexpired `host_bundle_content_to_host_activation` edge; publishes/readbacks the complete `hostActivationReceipt`; and cannot create deployment authorization. `activationMode` is exactly `compatibility_deploy` or `existing_release_activation`, with a compatibility artifact digest required only for the former.
- `node scripts/control-plane-bootstrap-activation.mjs` accepts zero argv and bounded canonical stdin. Its production dependency factory probes all fourteen capabilities before opening the bootstrap root, key directory, sudoers directory, or any installed record. It can stage the activation triple only; it cannot invoke the root launcher or advance a rotation journal.

- [ ] **Step 1: Write failing exact activation-lease contract tests**

```js
test('staging lease closes every cleanup identity before the first privileged file write', () => {
  const lease = createActivationStagingLease(validActivationRequest());
  assert.deepEqual(Object.keys(lease), ACTIVATION_LEASE_FIELDS);
  assert.deepEqual(activationLeaseLogicalId(lease.activationId), {
    kind: 'activationStateLease',
    id: lease.activationId,
  });
  assert.equal(lease.state, 'staging');
  assert.equal(lease.activationRecordState, 'absent_not_published');
  assert.equal(lease.activationRecordSha256, null);
  assert.match(lease.authorizedKeySha256, /^[0-9a-f]{64}$/);
  assert.match(lease.sudoersSha256, /^[0-9a-f]{64}$/);
  assert.equal(lease.activationCgroupUnit, `proxy-gateway-control-bootstrap-activation@${lease.activationId.slice(4)}.service`);
});
```

Run: `node --test server/tests/control-plane-bootstrap-activation-contract.test.mjs`

Expected: FAIL because the contract module and exact schema do not exist. Implement the ordered contract, strict `ba1` logical-ID mapper, fixed paths, activation-ID-derived unit, 15-minute TTL check, mode-specific compatibility digest rule, and creator; rerun until PASS.

```js
export function activationLeaseLogicalId(activationId) {
  if (!/^ba1\.[0-9a-f]{64}$/.test(activationId)) throw new Error('activation_id_invalid');
  return Object.freeze({ kind: 'activationStateLease', id: activationId });
}

export function createActivationStagingLease(request) {
  validateActivationRequest(request);
  return Object.freeze({
    schema: 'control_plane_bootstrap_activation_lease_v1',
    activationId: request.activationId,
    state: 'staging',
    cleanupSubstep: null,
    bootstrapAuthorizationGateReceiptSha256: request.bootstrapAuthorizationGateReceiptSha256,
    bootstrapActivationGateReceiptSha256: request.bootstrapActivationGateReceiptSha256,
    hostBundleContentReceiptSha256: request.hostBundleContentReceiptSha256,
    hostExecutionContentSha256: request.hostExecutionContentSha256,
    rollbackReleaseManifestSha256: request.rollbackReleaseManifestSha256,
    applicationRecoveryBindingSha256: request.applicationRecoveryBindingSha256,
    activationMode: request.activationMode,
    compatibilityArtifactSha256: request.activationMode === 'compatibility_deploy' ? request.compatibilityArtifactSha256 : null,
    rotationId: request.rotationId,
    rotationJournalSha256: request.rotationJournalSha256,
    operation: request.operation,
    target: 'japan-control-plane',
    currentGeneration: request.currentGeneration,
    proposedGeneration: request.proposedGeneration,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    authorizedKeyPath: '/var/lib/github-control-bootstrap/.ssh/authorized_keys',
    authorizedKeySha256: request.authorizedKeySha256,
    sudoersPath: '/etc/sudoers.d/github-control-bootstrap-ephemeral',
    sudoersSha256: request.sudoersSha256,
    publicKeyFingerprint: request.publicKeyFingerprint,
    activationRecordPath: `/var/lib/proxy-gateway-control-plane/bootstrap/v1/activations/by-id/${request.activationId}/record.json`,
    activationRecordState: 'absent_not_published',
    activationRecordSha256: null,
    activationCgroupUnit: `proxy-gateway-control-bootstrap-activation@${request.activationId.slice(4)}.service`,
    cleanupReason: null,
    terminalResultSha256: null,
    cleanupEvidenceSha256: null,
  });
}
```

- [ ] **Step 2: Write failing record-last and deadline tests**

```js
test('activation is record-last and arms only after exact readback', async () => {
  const calls = [];
  const machine = createBootstrapActivationMachine(createHarness({ calls }));
  const staged = await machine.stage(validActivationBytes({ expiresInMs: 900_000 }));
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'lease:create:staging',
    'authorized_key:create:fsync:parent_fsync:readback',
    'sudoers:create_0440:fsync:parent_fsync:readback',
    'activation_record:create:fsync:parent_fsync:readback',
    'lease:cas:staging:armed',
  ]);
  assert.equal(staged.state, 'armed');
});

test('activation longer than fifteen minutes is rejected before the staging lease', async () => {
  const calls = [];
  const machine = createBootstrapActivationMachine(createHarness({ calls }));
  await assert.rejects(machine.stage(validActivationBytes({ expiresInMs: 900_001 })), /activation_ttl_exceeded/);
  assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
});

test('activation ineligibility reads and writes no installed path or durable record', async () => {
  const calls = [];
  const machine = createBootstrapActivationMachine(createHarness({ calls, capabilityEligible: false }));
  await assert.rejects(machine.stage(validActivationBytes()), /linux_capability_ineligible/);
  assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
});
```

- [ ] **Step 3: Run the activation tests and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-state-machine.test.mjs`

Expected: FAIL because the activation machine does not exist.

- [ ] **Step 4: Implement exact activation record and one-use lease transitions**

```js
const ALLOWED = Object.freeze({
  staging: new Set(['armed', 'cleanup_pending']),
  armed: new Set(['in_progress', 'cleanup_pending']),
  in_progress: new Set(['terminal', 'cleanup_pending']),
  terminal: new Set(['cleanup_pending']),
  cleanup_pending: new Set(['cleanup_pending']),
});

async function casState(store, lease, nextState, extra) {
  if (!ALLOWED[lease.value.state]?.has(nextState)) throw new Error('activation_transition_forbidden');
  const next = Object.freeze({ ...lease.value, state: nextState, ...extra });
  return store.compareAndSwapActivation(lease.value.activationId, lease.sha256, next);
}

export function createActivationRecord(request) {
  return Object.freeze({
    schema: 'github_control_plane_bootstrap_activation_v1',
    activationId: request.activationId,
    stagingLeaseSha256: request.stagingLeaseSha256,
    activationRecordPath: '/var/lib/proxy-gateway-control-plane/bootstrap/v1/activations/active/record.json',
    authorizedKeyPath: '/var/lib/github-control-bootstrap/.ssh/authorized_keys',
    authorizedKeySha256: request.authorizedKeySha256,
    sudoersPath: '/etc/sudoers.d/github-control-bootstrap-ephemeral',
    sudoersSha256: request.sudoersSha256,
    publicKeyFingerprint: request.publicKeyFingerprint,
    bootstrapAuthorizationGateReceiptSha256: request.bootstrapAuthorizationGateReceiptSha256,
    bootstrapActivationGateReceiptSha256: request.bootstrapActivationGateReceiptSha256,
    operation: request.operation,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    target: 'japan-control-plane',
    rotationId: request.rotationId,
    currentGeneration: request.currentGeneration,
    proposedGeneration: request.proposedGeneration,
    rotationJournalSha256: request.rotationJournalSha256,
  });
}
```

`createActivationStagingLease` fills every frozen field before publication: both Gate receipt digests; content/host-execution/rollback/application-recovery bindings; rotation/journal/operation/target/generations; creation/expiry; exact key/sudoers/record paths, expected bytes digests, fingerprint, and activation-ID-derived cgroup; `activationRecordState='absent_not_published'`; and null record/cleanup/terminal fields. Reject an activation record containing its own digest. Serialize the immutable record first; only the lease, prepare journal, attempt-chain record, and cleanup evidence may bind its digest.

- [ ] **Step 5: Add RED crash tests for record-last cleanup identity**

Inject a crash (a) after the staging lease and before the key, (b) after the key, (c) after sudoers, (d) after immutable record readback, and (e) before the `armed` CAS. For (b) and (c), assert cleanup uses only the pre-published lease's exact path/digest/fingerprint fields, proves the record `absent_not_published`, removes only matching bytes, publishes evidence, and removes the lease last. For (d), assert cleanup first verifies the immutable record and CASes `activationRecordState='present_verified'` with its digest. Run the state-machine test and observe the first unsupported record-last crash fail before adding each recovery branch.

- [ ] **Step 6: Implement cleanup-only reboot convergence**

`resumeCleanup` must use this closed table:

| Observed lease | Required next action |
|---|---|
| `staging` | CAS `cleanup_pending` with `activationRecordState=present_verified` and digest, or `absent_not_published` and null digest |
| `armed` | CAS `cleanup_pending`; never claim |
| `in_progress` | retain/recreate fence, terminate exact activation cgroup, prove empty, then CAS `cleanup_pending` |
| `terminal` | verify terminal result, then CAS `cleanup_pending` |
| `cleanup_pending` | resume the last durable cleanup substep |
| lease absent | return `clean_noop` only when key, sudoers, record, activation cgroup, and every activation-bound nonterminal journal are all absent, and retained cleanup evidence is either `none_expected` under an empty history index or an exact verified `cleanup_complete` record |

Implement substeps in strict order: prove cgroup empty; remove/read back key, sudoers, and immutable record; publish immutable cleanup evidence; remove/read back the state lease last. An absent lease with any triple member, matching or unexpected cgroup, activation-bound nonterminal journal, missing required retained evidence, invalid evidence, or evidence/history mismatch is `manual_intervention_required`, never `clean_noop`. Unknown states, path/digest drift, extra key entry, or wrong cgroup identity also fail closed.

- [ ] **Step 7: Add crash, reboot, and clean-boot table tests**

Cover every failure before/after staging lease, key, sudoers, record, armed CAS, in-progress CAS, terminal CAS, cgroup termination, each triple unlink, cleanup evidence, and lease unlink. Cover `staging` with no record as `absent_not_published`; all other absent/mismatch combinations reject. Add one positive `clean_noop` boot-manager test for an entirely absent lease/triple/cgroup/nonterminal-journal tuple with legal retained evidence, then one negative case for each single residue and invalid/missing evidence. Prove no reboot path invokes the privileged operation or clears a nonterminal rotation fence.

Run and observe RED at the first unsupported boundary, then add cleanup convergence one boundary at a time until the table is GREEN.

- [ ] **Step 8: Write RED typed-edge and compatibility activation publication tests**

```js
test('compatibility activation consumes content-to-activation edge exactly once', async () => {
  const publisher = createCompatibilityActivationPublisher(createActivationPublisherHarness());
  const published = await publisher.publish(validCompatibilityActivationInput());
  assert.deepEqual(published.trace, [
    'native:probe_all_fourteen_capabilities',
    'content_receipt:parse_exact',
    'activation_gate:verify_exact',
    'host_bindings:rehash',
    'edge:publish_reserved',
    'activation_receipt:publish_readback',
    'edge:cas_reserved_consumed',
  ]);
  await assert.rejects(publisher.publish(validCompatibilityActivationInput()), /activation_edge_consumed/);
});
```

Run: `node --test server/tests/control-plane-bootstrap-activation-publisher.test.mjs`

Expected: FAIL because the publisher is absent. Implement a bounded semantic edge ID, canonical `reserved -> consumed` typed-edge contract, exact parent/child receipt digests, and idempotent recovery for crashes after edge reservation and after receipt publication. An edge may point only `hostBundleContentReceipt -> hostActivationReceipt`; it cannot point to a bootstrap/final receipt or authorize execution.

- [ ] **Step 9: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-activation-contract.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-activation-publisher.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit activation state machine and compatibility publisher**

```bash
git add server/services/deployment/control-plane-bootstrap-activation-contract.mjs server/services/deployment/control-plane-bootstrap-store.mjs server/services/deployment/control-plane-bootstrap-state-machine.mjs server/services/deployment/control-plane-bootstrap-activation-publisher.mjs scripts/control-plane-bootstrap-activation.mjs ops/control-plane-deploy/contracts/bootstrap-activation-lease-v1.json ops/control-plane-deploy/contracts/bootstrap-typed-edge-v1.json ops/control-plane-deploy/ssh/github-control-bootstrap-authorized-key-options ops/control-plane-deploy/sudoers/github-control-bootstrap-ephemeral server/tests/control-plane-bootstrap-activation-contract.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-activation-publisher.test.mjs
git commit -m "feat: add one-use bootstrap activation state machine"
```

---

### Task 4: Native forced-command sudo shims, root relays, clean-environment helper, and installed authorization contracts

**Files:**
- Create: `ops/control-plane-deploy/native/src/bootstrap-entry.c`
- Create: `ops/control-plane-deploy/native/src/deploy-entry.c`
- Create: `ops/control-plane-deploy/native/src/bootstrap-root-relay.c`
- Create: `ops/control-plane-deploy/native/src/deploy-root-relay.c`
- Create: `ops/control-plane-deploy/native/src/node-helper-entry.c`
- Create: `ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json`
- Modify: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Create: `ops/control-plane-deploy/ssh/github-control-deploy-authorized-key-options`
- Create: `ops/control-plane-deploy/sudoers/github-control-deploy-root-relay`
- Create: `server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

**Interfaces:**
- Consume Foundation's exact `compileReviewedNativeRegistry({ sourceRoot, manifestPath, outputDirectory })` contract. Its frozen result is the Foundation build plan, including `manifestSha256`, `registrySha256`, `standaloneTargets` with fixed `targetId`/`outputName`/source bindings, and the sole compile profile `hardened-c17-pie-v1`; Bootstrap does not add `standaloneTargetPaths` or any other return field. Foundation's reviewed build adapter materializes every plan target beneath the one fixed `ops/control-plane-deploy/native/build/standalone/` root. The Bootstrap fragment contributes standalone target IDs `control-plane-bootstrap-entry-v1`, `control-plane-deploy-entry-v1`, `control-plane-bootstrap-root-relay-v1`, `control-plane-deploy-root-relay-v1`, and `control-plane-node-helper-entry-v1`; none is a new N-API export. Bootstrap never spells, removes, or overrides an individual compiler/linker flag.
- Both unprivileged forced-command entry programs accept `argc == 1`, require empty or absent `SSH_ORIGINAL_COMMAND`, close all inherited descriptors above stderr, clear the environment, and `execve()` exactly `/usr/bin/sudo -n --` plus their one compiled root-relay path. They do not parse or relay protocol bytes, invoke Node/a shell/systemd, preserve environment, or accept a caller-selected command. Each exact root-owned mode-`0440` sudoers record permits only that no-argument relay and includes no wildcard, `SETENV`, shell, editor, manager, or second command.
- Each root relay accepts `argc == 1`, requires `getuid()==0 && geteuid()==0`, an empty fixed environment, and only stdin/stdout/stderr. Before any protocol-socket connect it opens its one compiled relay-lock path with `O_RDONLY | O_CLOEXEC | O_NOFOLLOW`, requires a regular single-link root:root mode-`0600` inode, and takes `flock(LOCK_EX | LOCK_NB)`. Busy, symlink, owner/group/mode/link, open, or lock drift rejects before `socket()`; success holds that FD until the relay's outermost cleanup, so each principal has at most one active-or-pending authenticated relay and crash releases the slot in-kernel. It then captures one absolute `CLOCK_MONOTONIC` deadline and creates the socket as `SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK`; a successful immediate `connect()` proceeds, while only `EINPROGRESS` may enter `poll(POLLOUT)` bounded by that same deadline and then `getsockopt(SOL_SOCKET, SO_ERROR)`. Timeout, backlog saturation, any other connect result, peer error, relay error, or cleanup error closes the socket and lock FDs. The remaining authorization-ready work shares the unrefreshed ten-second deadline. The deploy relay changes to one absolute 300-second deadline only after its reviewed ready frame. The bootstrap relay changes to the exact `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS=910000` only after one complete canonical `bootstrap_activation_ready_v1` frame whose exact ordered public fields are `type`, `requestId`, and `activationId`; compatibility inventory, a partial/duplicate/wrong/cross-binding frame, or any other response does not extend the deadline. Bootstrap activation cleanup removes its ephemeral sudoers record; deploy rotation owns the generation-bound deploy record and proves replacement/removal. Neither relay can open a systemd manager socket.
- `node-helper-entry.c` is the sole Node bootstrap for every root/systemd helper in this plan. It accepts exactly one reviewed helper ID from a static table, validates whether exactly systemd listen FD 3 is required, calls `accept4(3, ..., SOCK_CLOEXEC)` itself for the two `Accept=no` protocol services, verifies `SO_PEERCRED` as root, and replaces FD 3 with only that accepted connection before Node can parse a byte. It closes every other descriptor, clears the environment, and `execve()`s `/usr/bin/node --jitless` plus one fixed script with the exact three-variable environment. The helper/parser may install a local no-later guard but cannot refresh or extend the root relay's single pre-connect absolute `CLOCK_MONOTONIC` ten-second deadline. Systemd supplies `SupplementaryGroups=`; the helper and Node parser only read back/assert an empty supplementary-group vector and never attempt `setgroups` after capabilities are cleared. Node receives neither the helper selector nor systemd/manager environment.
- Authorized-key option fragments are single lines beginning with `restrict,command="<fixed-entry>"` and include no key bytes. The bootstrap template additionally includes an expiry field supplied and validated by the activation writer.
- Root authority is a closed chain: forced key -> unprivileged shim -> exact temporary no-argument sudo rule -> tiny reviewed native root relay -> fixed root-only AF_UNIX socket -> `Accept=no` root sandbox service -> reviewed helper `accept4` on FD 3 -> fixed Node parser. Tests prove every digest/mode/owner/lifecycle edge, no direct sudo-to-Node path, no broad sudo/systemd authority, and no alternate socket or executable.

- [ ] **Step 1: Write failing compile/run and static-contract tests**

```js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import { sha256Hex } from '../services/deployment/canonical-json.mjs';
import { compileReviewedNativeRegistry } from '../../scripts/control-plane-native-registry.mjs';

const ENTRY_BINARIES = new Map();
let compiledRegistry;
let nativeTestOutputDirectory;

const FOUNDATION_PUBLIC_NATIVE_EXPORTS = Object.freeze([
  'createBoundedCapture',
  'createDatabaseIdentityLease',
  'createSealedMemfd',
  'durableCompareAndSwap',
  'durablePublishNoReplace',
  'durableReadLogical',
  'durableSwapSymlink',
  'durableUnlink',
  'durableUnlinkVerified',
  'durableWriteFile',
  'inspectSqliteMainHandle',
  'probeLinuxCapabilities',
  'receiveDatabaseCapability',
  'sendDatabaseCapability',
  'spawnWithExactFileDescriptors',
]);

test.before(async () => {
  nativeTestOutputDirectory = await mkdtemp(join(tmpdir(), 'control-plane-bootstrap-registry-'));
  compiledRegistry = await compileReviewedNativeRegistry({
    sourceRoot: 'ops/control-plane-deploy/native',
    manifestPath: 'ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json',
    outputDirectory: nativeTestOutputDirectory,
  });
  const outputRoot = await realpath('ops/control-plane-deploy/native/build/standalone');
  for (const executableId of [
    'control-plane-bootstrap-entry-v1',
    'control-plane-deploy-entry-v1',
    'control-plane-bootstrap-root-relay-v1',
    'control-plane-deploy-root-relay-v1',
  ]) {
    const target = compiledRegistry.standaloneTargets.find(({ targetId }) => targetId === executableId);
    if (!target) throw new Error('compiled_standalone_target_missing');
    const binaryPath = await realpath(join(outputRoot, target.outputName));
    if (!binaryPath.startsWith(`${outputRoot}${sep}`) || ((await stat(binaryPath)).mode & 0o777) !== 0o555) {
      throw new Error('compiled_standalone_target_invalid');
    }
    ENTRY_BINARIES.set(executableId, binaryPath);
  }
});

test.after(async () => {
  if (nativeTestOutputDirectory) await rm(nativeTestOutputDirectory, { recursive: true, force: true });
});

function runNative(executableId, args, extraEnvironment) {
  const binary = ENTRY_BINARIES.get(executableId);
  if (!binary || !Array.isArray(args)) throw new Error('native_test_selector_rejected');
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      env: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', ...extraEnvironment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => resolve({ code: null, errorCode: error.code, stdout: '', stderr: '' }));
    child.once('close', (code) => resolve({ code, errorCode: null, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
  });
}

test('both entry programs reject argv and original-command input with their fixed diagnostic', async (t) => {
  for (const entry of [
    { executableId: 'control-plane-bootstrap-entry-v1', diagnostic: 'bootstrap_entry_rejected\n' },
    { executableId: 'control-plane-deploy-entry-v1', diagnostic: 'deploy_entry_rejected\n' },
  ]) {
    await t.test(`${entry.executableId}: original command`, async () => {
      const result = await runNative(entry.executableId, [], {
        SSH_ORIGINAL_COMMAND: 'attacker-command',
        PATH: '/tmp/attacker',
      });
      assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, {
        code: 64, stdout: '', stderr: entry.diagnostic,
      });
    });
    await t.test(`${entry.executableId}: extra argv`, async () => {
      const result = await runNative(entry.executableId, ['unexpected'], {});
      assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, {
        code: 64, stdout: '', stderr: entry.diagnostic,
      });
    });
  }
});

test('reviewed manifest binds the Bootstrap fragment and standalone targets without ABI growth', async () => {
  const fragmentPath = 'ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json';
  const fragmentBytes = await readFile(fragmentPath);
  const manifest = JSON.parse(await readFile('ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json', 'utf8'));
  assert.deepEqual(manifest.fragments.find(({ name }) => name === 'bootstrap-authorization-v1.json'), {
    kind: 'native_extension',
    name: 'bootstrap-authorization-v1.json',
    sha256: sha256Hex(fragmentBytes),
  });
  assert.deepEqual(compiledRegistry.standaloneTargets.map(({ targetId }) => targetId).filter((id) => id.endsWith('-entry-v1')), [
    'control-plane-bootstrap-entry-v1',
    'control-plane-deploy-entry-v1',
    'control-plane-node-helper-entry-v1',
  ]);
  assert.deepEqual(compiledRegistry.standaloneTargets.map(({ targetId }) => targetId).filter((id) => id.endsWith('-root-relay-v1')), [
    'control-plane-bootstrap-root-relay-v1',
    'control-plane-deploy-root-relay-v1',
  ]);
  const native = await import('../../ops/control-plane-deploy/native/index.mjs');
  assert.deepEqual(Object.keys(native).sort(), FOUNDATION_PUBLIC_NATIVE_EXPORTS);
});

test('forced entries can execute only exact sudo/root relays and Node stays behind the sandbox', async () => {
  const bootstrapSource = await readFile('ops/control-plane-deploy/native/src/bootstrap-entry.c', 'utf8');
  const deploySource = await readFile('ops/control-plane-deploy/native/src/deploy-entry.c', 'utf8');
  const bootstrapRelaySource = await readFile('ops/control-plane-deploy/native/src/bootstrap-root-relay.c', 'utf8');
  const deployRelaySource = await readFile('ops/control-plane-deploy/native/src/deploy-root-relay.c', 'utf8');
  const helperSource = await readFile('ops/control-plane-deploy/native/src/node-helper-entry.c', 'utf8');
  assert.match(bootstrapSource, /\/usr\/bin\/sudo/);
  assert.match(deploySource, /\/usr\/bin\/sudo/);
  assert.match(bootstrapSource, /proxy-gateway-control-plane-bootstrap-root-relay/);
  assert.match(deploySource, /proxy-gateway-control-plane-deploy-root-relay/);
  assert.doesNotMatch(bootstrapSource + deploySource, /\/usr\/bin\/node|systemd|\.sock/);
  assert.match(bootstrapRelaySource, /bootstrap-protocol\.sock/);
  assert.match(deployRelaySource, /host-protocol\.sock/);
  assert.doesNotMatch(bootstrapRelaySource + deployRelaySource, /\/usr\/bin\/node|sudo|systemd|execv?p/);
  for (const relaySource of [bootstrapRelaySource, deployRelaySource]) {
    assert.match(relaySource, /PREAUTH_DEADLINE_MS\s*=\s*10000/);
    assert.match(relaySource, /socket\(AF_UNIX,\s*SOCK_STREAM\s*\|\s*SOCK_CLOEXEC\s*\|\s*SOCK_NONBLOCK/);
    assert.match(relaySource, /preauth_deadline\s*=\s*started\s*\+\s*PREAUTH_DEADLINE_MS/);
    assert.match(relaySource, /errno\s*!=\s*EINPROGRESS/);
    assert.match(relaySource, /\.events\s*=\s*POLLOUT/);
    assert.match(relaySource, /poll\(&descriptor/);
    assert.match(relaySource, /getsockopt\([^;]+SOL_SOCKET\s*,\s*SO_ERROR/);
    assert.match(relaySource, /clock_gettime\(CLOCK_MONOTONIC/);
    assert.match(relaySource, /O_NOFOLLOW/);
    assert.match(relaySource, /flock\([^;]+LOCK_EX\s*\|\s*LOCK_NB/);
    assert.match(relaySource, /S_ISREG/);
    assert.doesNotMatch(relaySource, /IDLE_TIMEOUT_MS|SESSION_TIMEOUT_MS|last_progress|CLOCK_REALTIME/);
  }
  assert.match(deployRelaySource, /ARTIFACT_DEADLINE_MS\s*=\s*300000/);
  assert.match(deployRelaySource, /deadline\s*=\s*accepted_at\s*\+\s*ARTIFACT_DEADLINE_MS/);
  assert.doesNotMatch(deployRelaySource, /bootstrap_activation_ready_v1|BOOTSTRAP_ACTIVATION_AUTHENTICATED/);
  assert.match(bootstrapRelaySource, /BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS\s*=\s*910000/);
  assert.match(bootstrapRelaySource, /bootstrap_activation_ready_v1/);
  assert.match(bootstrapRelaySource, /match_bootstrap_activation_ready/);
  assert.match(bootstrapRelaySource, /deadline\s*=\s*authorized_at\s*\+\s*BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS/);
  assert.match(helperSource, /clearenv\(\)/);
  assert.match(helperSource, /\/usr\/bin\/node/);
  assert.match(helperSource, /accept4\(3,/);
  assert.match(helperSource, /SO_PEERCRED/);
  assert.match(helperSource, /"deploy-protocol-v1"[^\n]+"root"/);
  assert.match(helperSource, /"bootstrap-protocol-v1"[^\n]+"root"/);
  assert.match(helperSource, /getpwnam\(peer_user\)/);
  assert.doesNotMatch(helperSource, /getenv\("PATH"\)|NODE_OPTIONS|execvp|system\(/);
  const deploySudoers = await readFile('ops/control-plane-deploy/sudoers/github-control-deploy-root-relay', 'utf8');
  assert.equal(deploySudoers, 'github-control-deploy ALL=(root) NOPASSWD:NOSETENV: /usr/local/libexec/proxy-gateway-control-plane-deploy-root-relay\n');
  assert.doesNotMatch(deploySudoers, /\*|ALL\s*$|(?:^|:)SETENV:|\/bin\/(?:ba)?sh|systemctl|node/);
});

test('compiled relays enforce their exact absolute phase boundaries without progress refresh', async () => {
  const deploy = await createRelayBoundaryHarness({ executableId: 'control-plane-deploy-root-relay-v1' });
  await deploy.assertPreauthBoundary({ beforeMs: 9_999, atMs: 10_000, trickleBytes: true });
  await deploy.assertArtifactBoundary({ beforeMs: 299_999, atMs: 300_000, trickleBytes: true });
  assert.deepEqual(deploy.deadlineAssignments(), [
    'session_start_plus_10000',
    'ready_for_artifact_plus_300000',
  ]);

  const bootstrap = await createRelayBoundaryHarness({ executableId: 'control-plane-bootstrap-root-relay-v1' });
  await bootstrap.assertPreauthBoundary({ beforeMs: 9_999, atMs: 10_000, trickleBytes: true });
  await bootstrap.writeBootstrapActivationReady(validBootstrapActivationReadyFrame());
  await bootstrap.assertAuthenticatedBoundary({ beforeMs: 909_999, atMs: 910_000, trickleBytes: true });
  assert.deepEqual(bootstrap.deadlineAssignments(), [
    'session_start_plus_10000',
    'validated_bootstrap_activation_ready_plus_910000',
  ]);
  for (const ready of [partialReadyFrame(), wrongReadyTypeFrame(), crossBindingReadyFrame(), duplicateReadyFrame()]) {
    const rejected = await createRelayBoundaryHarness({ executableId: 'control-plane-bootstrap-root-relay-v1' });
    await rejected.writeServerFrame(ready);
    await rejected.assertNoDeadlineExtensionAt(10_000);
  }
});

test('relay kernel lock caps each principal at one pending or active task and crash releases it', async () => {
  for (const executableId of [
    'control-plane-bootstrap-root-relay-v1',
    'control-plane-deploy-root-relay-v1',
  ]) {
    const harness = await createRelayLockHarness({ executableId });
    const first = await harness.openAuthenticatedRelay({ holdBeforeConnect: true });
    await assert.rejects(harness.openAuthenticatedRelay(), /root_relay_rejected/);
    assert.equal(harness.protocolSocketConnectCalls, 0);
    await harness.killRelay(first);
    const replacement = await harness.openAuthenticatedRelay({ holdBeforeConnect: true });
    assert.equal(replacement.lockAcquired, true);
    await harness.killRelay(replacement);
    for (const drift of ['symlink', 'owner', 'group', 'mode', 'hardlink']) {
      await assert.rejects(harness.openWithLockDrift(drift), /root_relay_rejected/);
      assert.equal(harness.protocolSocketConnectCalls, 0);
    }
    await harness.assertAllDescriptorsClosed();
  }
});

test('nonblocking relay connect is bounded across a full backlog and closes every FD', async () => {
  for (const executableId of [
    'control-plane-bootstrap-root-relay-v1',
    'control-plane-deploy-root-relay-v1',
  ]) {
    const harness = await createRelayConnectHarness({ executableId, listenBacklog: 16 });
    await harness.fillKernelListenBacklogWithRootPeers(16);
    const before = await harness.snapshotProcessFds();
    for (let ordinal = 17; ordinal <= 32; ordinal += 1) {
      await assert.rejects(
        harness.openAuthenticatedRelay({ ordinal, advanceToMs: 10_000 }),
        /root_relay_rejected/,
      );
      await harness.releaseKernelRelayLockForNextAttempt();
    }
    await harness.assertEveryCompiledRelayClosed();
    assert.deepEqual(await harness.snapshotProcessFds(), before);
    assert.deepEqual(harness.connectTrace(17), [
      'open:fixed_relay_lock:O_NOFOLLOW',
      'fstat:root_root_regular_0600_single_link',
      'flock:LOCK_EX|LOCK_NB',
      'clock_gettime:CLOCK_MONOTONIC',
      'socket:SOCK_STREAM|SOCK_CLOEXEC|SOCK_NONBLOCK',
      'connect:EINPROGRESS',
      'poll:POLLOUT:absolute_preauth_deadline',
      'getsockopt:SO_ERROR',
      'close:socket',
      'close:relay_lock',
    ]);
  }
});
```

- [ ] **Step 2: Run the native contract test and verify RED**

Run on disposable Linux with Foundation's six reviewed offline header/toolchain custody variables: `node scripts/build-control-plane-native.mjs && node --test server/tests/control-plane-bootstrap-systemd-contract.test.mjs`. The test-only relay harness links the already reviewed source with deterministic monotonic-clock/socket/FD shims; it does not alter the production compiler profile or registry digest. It advances to the shared `9,999/10,000` pre-auth boundary, deploy's `299,999/300,000` admitted boundary, and bootstrap's `909,999/910,000` authenticated boundary while continuously supplying bytes, proving that connect completion or read/write progress moves none of them. Only one exact request-bound canonical `bootstrap_activation_ready_v1` frame selects the latter; partial, wrong-type, duplicate, cross-binding, compatibility-inventory, and final-response-first frames remain on the original ten-second deadline. The harness proves first/second same-principal concurrency, crash release, fixed-lock symlink/owner/group/mode/link rejection before `socket()`, fills the fixed 16-entry kernel listen backlog with root-only fixture peers, proves the 17th and later compiled-relay connection attempts fail by the same absolute deadline, and snapshots FD identity before/after every immediate-connect, `EINPROGRESS`, timeout, `SO_ERROR`, relay, and close failure. The normal registry build still compiles both production relays independently and executes their fixed-socket/diagnostic smoke tests.

Expected: FAIL because native entry sources and authorization contracts do not exist.

- [ ] **Step 3: Implement the exact sudo shims and separate root relays in C17**

`bootstrap-entry.c` and `deploy-entry.c` contain only the same closed shim shape with different compile-time relay/diagnostic literals. The complete shim is small enough to audit: it rejects argv and `SSH_ORIGINAL_COMMAND`, closes inherited descriptors, clears the environment, and executes one literal no-argument sudo transition. It never contains a socket path or protocol loop.

```c
static const char *const ROOT_RELAY =
    "/usr/local/libexec/proxy-gateway-control-plane-bootstrap-root-relay";

int main(int argc, char **argv) {
    (void)argv;
    const char *original = getenv("SSH_ORIGINAL_COMMAND");
    if (argc != 1 || (original != NULL && original[0] != '\0')
        || close_range(3U, ~0U, 0U) != 0 || clearenv() != 0) {
        fputs("bootstrap_entry_rejected\n", stderr);
        return 64;
    }
    char *const sudo_argv[] = {
        "/usr/bin/sudo", "-n", "--", (char *)ROOT_RELAY, NULL
    };
    char *const clean_env[] = {
        "PATH=/usr/sbin:/usr/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", NULL
    };
    execve(sudo_argv[0], sudo_argv, clean_env);
    fputs("bootstrap_entry_rejected\n", stderr);
    return 70;
}
```

`deploy-entry.c` substitutes only the exact deploy relay and `deploy_entry_rejected`; source tests byte-check both argv arrays and reject `-E`, `-u`, arguments after the relay, a shell, Node, `systemctl`, an alternate relay, or environment preservation. `bootstrap-root-relay.c` then implements the fixed bootstrap socket relay:

```c
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

enum {
    FIRST_FRAME_LIMIT = 65536,
    SESSION_INPUT_LIMIT = 268500992,
    RESPONSE_FRAME_LIMIT = 2048,
    MAX_RESPONSE_FRAMES = 342,
    SESSION_OUTPUT_LIMIT = RESPONSE_FRAME_LIMIT * MAX_RESPONSE_FRAMES,
    PREAUTH_DEADLINE_MS = 10000,
    BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS = 910000
};

static const char *const SOCKET_PATH =
    "/run/proxy-gateway-control-plane/bootstrap-protocol.sock";
static const char *const RELAY_LOCK_PATH =
    "/var/lib/proxy-gateway-control-plane/bootstrap/v1/relay-locks/bootstrap-root-relay.lock";

static int64_t monotonic_ms(void) {
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return -1;
    return (int64_t)value.tv_sec * 1000 + value.tv_nsec / 1000000;
}

static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL);
    return flags < 0 || fcntl(fd, F_SETFL, flags | O_NONBLOCK) != 0 ? -1 : 0;
}

static int acquire_relay_lock(void) {
    int fd = open(RELAY_LOCK_PATH, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return -1;
    struct stat identity;
    if (fstat(fd, &identity) != 0 || !S_ISREG(identity.st_mode)
            || identity.st_uid != 0 || identity.st_gid != 0
            || (identity.st_mode & 07777) != 0600 || identity.st_nlink != 1
            || flock(fd, LOCK_EX | LOCK_NB) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

static int write_all_before_deadline(
        int fd, const unsigned char *bytes, size_t length, int64_t deadline) {
    while (length > 0) {
        int64_t now = monotonic_ms();
        if (now < 0 || now >= deadline) return -1;
        struct pollfd descriptor = { .fd = fd, .events = POLLOUT, .revents = 0 };
        int ready = poll(&descriptor, 1, (int)(deadline - now));
        if (ready < 0 && errno == EINTR) continue;
        if (ready <= 0 || (descriptor.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) return -1;
        ssize_t written = write(fd, bytes, length);
        if (written < 0 && errno == EINTR) continue;
        if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
        if (written <= 0) return -1;
        bytes += (size_t)written;
        length -= (size_t)written;
    }
    return 0;
}

static int connect_fixed_socket(int64_t preauth_deadline) {
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0) return -1;
    struct sockaddr_un address;
    memset(&address, 0, sizeof address);
    address.sun_family = AF_UNIX;
    size_t length = strlen(SOCKET_PATH);
    if (length == 0 || length >= sizeof address.sun_path) {
        close(fd);
        return -1;
    }
    memcpy(address.sun_path, SOCKET_PATH, length + 1);
    if (connect(fd, (const struct sockaddr *)&address, sizeof address) != 0) {
        if (errno != EINPROGRESS) {
            close(fd);
            return -1;
        }
        for (;;) {
            int64_t now = monotonic_ms();
            if (now < 0 || now >= preauth_deadline) {
                close(fd);
                return -1;
            }
            struct pollfd descriptor = { .fd = fd, .events = POLLOUT, .revents = 0 };
            int ready = poll(&descriptor, 1, (int)(preauth_deadline - now));
            if (ready < 0 && errno == EINTR) continue;
            if (ready <= 0 || (descriptor.revents & POLLNVAL) != 0) {
                close(fd);
                return -1;
            }
            if ((descriptor.revents & (POLLOUT | POLLERR | POLLHUP)) == 0) continue;
            int socket_error = 0;
            socklen_t socket_error_length = sizeof socket_error;
            if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &socket_error, &socket_error_length) != 0
                    || socket_error_length != sizeof socket_error || socket_error != 0) {
                close(fd);
                return -1;
            }
            break;
        }
    }
    return fd;
}

enum {
    BOOTSTRAP_REQUEST_ID_BYTES = 69,
    BOOTSTRAP_ACTIVATION_ID_BYTES = 68,
    BOOTSTRAP_REQUEST_PREFIX_CAPTURE_BYTES = 256
};

struct bootstrap_ready_binding {
    unsigned char request_id[BOOTSTRAP_REQUEST_ID_BYTES];
    unsigned char activation_id[BOOTSTRAP_ACTIVATION_ID_BYTES];
    bool present;
};

static bool lower_hex_64(const unsigned char *bytes) {
    for (size_t index = 0; index < 64; index += 1) {
        if (!((bytes[index] >= '0' && bytes[index] <= '9')
                || (bytes[index] >= 'a' && bytes[index] <= 'f'))) return false;
    }
    return true;
}

static bool capture_bootstrap_activation_binding(
        const unsigned char *frame_prefix, size_t prefix_bytes,
        struct bootstrap_ready_binding *binding) {
    static const unsigned char prefix[] =
        "{\"type\":\"bootstrap_activation\",\"requestId\":\"";
    static const unsigned char middle[] = "\",\"activationId\":\"";
    static const unsigned char suffix[] = "\",\"activationRecordSha256\":\"";
    size_t offset = sizeof prefix - 1;
    size_t required = offset + BOOTSTRAP_REQUEST_ID_BYTES + sizeof middle - 1
        + BOOTSTRAP_ACTIVATION_ID_BYTES + sizeof suffix - 1;
    if (prefix_bytes < required || memcmp(frame_prefix, prefix, sizeof prefix - 1) != 0) return false;
    const unsigned char *request_id = frame_prefix + offset;
    if (memcmp(request_id, "bar1.", 5) != 0 || !lower_hex_64(request_id + 5)) return false;
    offset += BOOTSTRAP_REQUEST_ID_BYTES;
    if (memcmp(frame_prefix + offset, middle, sizeof middle - 1) != 0) return false;
    offset += sizeof middle - 1;
    const unsigned char *activation_id = frame_prefix + offset;
    if (memcmp(activation_id, "ba1.", 4) != 0 || !lower_hex_64(activation_id + 4)) return false;
    offset += BOOTSTRAP_ACTIVATION_ID_BYTES;
    if (memcmp(frame_prefix + offset, suffix, sizeof suffix - 1) != 0) return false;
    memcpy(binding->request_id, request_id, sizeof binding->request_id);
    memcpy(binding->activation_id, activation_id, sizeof binding->activation_id);
    binding->present = true;
    return true;
}

static bool match_bootstrap_activation_ready(
        const unsigned char *frame, size_t frame_bytes,
        const struct bootstrap_ready_binding *binding) {
    static const unsigned char prefix[] =
        "{\"type\":\"bootstrap_activation_ready_v1\",\"requestId\":\"";
    static const unsigned char middle[] = "\",\"activationId\":\"";
    static const unsigned char suffix[] = "\"}\n";
    size_t expected = sizeof prefix - 1 + BOOTSTRAP_REQUEST_ID_BYTES
        + sizeof middle - 1 + BOOTSTRAP_ACTIVATION_ID_BYTES + sizeof suffix - 1;
    size_t offset = 0;
    if (!binding->present || frame_bytes != expected
            || memcmp(frame, prefix, sizeof prefix - 1) != 0) return false;
    offset += sizeof prefix - 1;
    if (memcmp(frame + offset, binding->request_id, sizeof binding->request_id) != 0) return false;
    offset += sizeof binding->request_id;
    if (memcmp(frame + offset, middle, sizeof middle - 1) != 0) return false;
    offset += sizeof middle - 1;
    if (memcmp(frame + offset, binding->activation_id, sizeof binding->activation_id) != 0) return false;
    offset += sizeof binding->activation_id;
    return memcmp(frame + offset, suffix, sizeof suffix - 1) == 0;
}

static int relay_session(int socket_fd, int64_t preauth_deadline) {
    unsigned char buffer[16384];
    unsigned char request_prefix[BOOTSTRAP_REQUEST_PREFIX_CAPTURE_BYTES];
    unsigned char server_frame[RESPONSE_FRAME_LIMIT];
    struct bootstrap_ready_binding ready_binding = { .present = false };
    uint64_t input_total = 0;
    uint64_t output_total = 0;
    size_t first_frame_bytes = 0;
    size_t request_prefix_bytes = 0;
    size_t output_frame_bytes = 0;
    unsigned int output_frame_count = 0;
    bool request_frame_complete = false;
    bool server_frame_complete = false;
    bool activation_ready_seen = false;
    bool input_open = true;
    if (set_nonblocking(STDIN_FILENO) != 0 || set_nonblocking(STDOUT_FILENO) != 0) return -1;
    int64_t deadline = preauth_deadline;

    for (;;) {
        int64_t now = monotonic_ms();
        if (now < 0 || now >= deadline) return -1;
        int timeout = (int)(deadline - now);
        struct pollfd descriptors[2] = {
            { .fd = STDIN_FILENO, .events = input_open ? POLLIN : 0, .revents = 0 },
            { .fd = socket_fd, .events = POLLIN, .revents = 0 }
        };
        int ready = poll(descriptors, 2, timeout);
        if (ready < 0 && errno == EINTR) continue;
        if (ready <= 0) return -1;

        if (input_open && (descriptors[0].revents & (POLLIN | POLLHUP)) != 0) {
            ssize_t count = read(STDIN_FILENO, buffer, sizeof buffer);
            if (count < 0 && errno == EINTR) continue;
            if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
            if (count < 0) return -1;
            if (count == 0) {
                input_open = false;
                if (shutdown(socket_fd, SHUT_WR) != 0 && errno != ENOTCONN) return -1;
            } else {
                input_total += (uint64_t)count;
                if (input_total > SESSION_INPUT_LIMIT) return -1;
                if (!request_frame_complete) {
                    for (ssize_t index = 0; index < count && !request_frame_complete; index += 1) {
                        if (request_prefix_bytes < sizeof request_prefix) {
                            request_prefix[request_prefix_bytes++] = buffer[index];
                        }
                        first_frame_bytes += 1;
                        if (first_frame_bytes > FIRST_FRAME_LIMIT) return -1;
                        if (buffer[index] == '\n') {
                            request_frame_complete = true;
                            (void)capture_bootstrap_activation_binding(
                                request_prefix, request_prefix_bytes, &ready_binding);
                        }
                    }
                }
                if (write_all_before_deadline(socket_fd, buffer, (size_t)count, deadline) != 0) return -1;
            }
        }

        if ((descriptors[1].revents & (POLLIN | POLLHUP)) != 0) {
            ssize_t count = read(socket_fd, buffer, sizeof buffer);
            if (count < 0 && errno == EINTR) continue;
            if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
            if (count < 0) return -1;
            if (count == 0) break;
            output_total += (uint64_t)count;
            if (output_total > SESSION_OUTPUT_LIMIT) return -1;
            for (ssize_t index = 0; index < count; index += 1) {
                if (output_frame_bytes >= RESPONSE_FRAME_LIMIT) return -1;
                server_frame[output_frame_bytes] = buffer[index];
                output_frame_bytes += 1;
                if (buffer[index] == '\n') {
                    bool ready_frame = match_bootstrap_activation_ready(
                        server_frame, output_frame_bytes, &ready_binding);
                    output_frame_bytes = 0;
                    output_frame_count += 1;
                    if (output_frame_count > MAX_RESPONSE_FRAMES) return -1;
                    if (!server_frame_complete) {
                        server_frame_complete = true;
                        if (ready_frame) {
                            int64_t authorized_at = monotonic_ms();
                            if (authorized_at < 0) return -1;
                            deadline = authorized_at
                                + BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS;
                            activation_ready_seen = true;
                        }
                    } else if (ready_frame || !activation_ready_seen
                            || output_frame_count > 2) {
                        return -1;
                    }
                }
            }
            if (write_all_before_deadline(STDOUT_FILENO, buffer, (size_t)count, deadline) != 0) return -1;
        }
        if ((descriptors[0].revents & (POLLERR | POLLNVAL)) != 0
                || (descriptors[1].revents & (POLLERR | POLLNVAL)) != 0) return -1;
    }
    bool response_sequence_complete = activation_ready_seen
        ? output_frame_count == 2 : output_frame_count == 1;
    return request_frame_complete && server_frame_complete && response_sequence_complete
        && output_frame_bytes == 0 ? 0 : -1;
}

int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1 || getuid() != 0 || geteuid() != 0) {
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 64;
    }
    if (close_range(3U, ~0U, 0U) != 0 || clearenv() != 0) {
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 70;
    }
    int lock_fd = acquire_relay_lock();
    if (lock_fd < 0) {
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 70;
    }
    int64_t started = monotonic_ms();
    if (started < 0) {
        close(lock_fd);
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 70;
    }
    int64_t preauth_deadline = started + PREAUTH_DEADLINE_MS;
    int socket_fd = connect_fixed_socket(preauth_deadline);
    if (socket_fd < 0 || relay_session(socket_fd, preauth_deadline) != 0) {
        if (socket_fd >= 0) close(socket_fd);
        close(lock_fd);
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 70;
    }
    int socket_close_result = close(socket_fd);
    int lock_close_result = close(lock_fd);
    if (socket_close_result != 0 || lock_close_result != 0) {
        fputs("bootstrap_root_relay_rejected\n", stderr);
        return 70;
    }
    return 0;
}
```

Implement `deploy-root-relay.c` as a complete separate fixed relay; it differs in both compiled socket identity and diagnostic and shares no caller-controlled selector with the bootstrap relay:

```c
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>

enum {
    FIRST_FRAME_LIMIT = 65536,
    SESSION_INPUT_LIMIT = 268500992,
    RESPONSE_FRAME_LIMIT = 2048,
    MAX_RESPONSE_FRAMES = 342,
    SESSION_OUTPUT_LIMIT = RESPONSE_FRAME_LIMIT * MAX_RESPONSE_FRAMES,
    PREAUTH_DEADLINE_MS = 10000,
    ARTIFACT_DEADLINE_MS = 300000
};

static const char *const SOCKET_PATH =
    "/run/proxy-gateway-control-plane/host-protocol.sock";
static const char *const RELAY_LOCK_PATH =
    "/var/lib/proxy-gateway-control-plane/bootstrap/v1/relay-locks/deploy-root-relay.lock";

static int64_t monotonic_ms(void) {
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return -1;
    return (int64_t)value.tv_sec * 1000 + value.tv_nsec / 1000000;
}

static int set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL);
    return flags < 0 || fcntl(fd, F_SETFL, flags | O_NONBLOCK) != 0 ? -1 : 0;
}

static int acquire_relay_lock(void) {
    int fd = open(RELAY_LOCK_PATH, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return -1;
    struct stat identity;
    if (fstat(fd, &identity) != 0 || !S_ISREG(identity.st_mode)
            || identity.st_uid != 0 || identity.st_gid != 0
            || (identity.st_mode & 07777) != 0600 || identity.st_nlink != 1
            || flock(fd, LOCK_EX | LOCK_NB) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

static int write_all_before_deadline(
        int fd, const unsigned char *bytes, size_t length, int64_t deadline) {
    while (length > 0) {
        int64_t now = monotonic_ms();
        if (now < 0 || now >= deadline) return -1;
        struct pollfd descriptor = { .fd = fd, .events = POLLOUT, .revents = 0 };
        int ready = poll(&descriptor, 1, (int)(deadline - now));
        if (ready < 0 && errno == EINTR) continue;
        if (ready <= 0 || (descriptor.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) return -1;
        ssize_t written = write(fd, bytes, length);
        if (written < 0 && errno == EINTR) continue;
        if (written < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
        if (written <= 0) return -1;
        bytes += (size_t)written;
        length -= (size_t)written;
    }
    return 0;
}

static int connect_fixed_socket(int64_t preauth_deadline) {
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0) return -1;
    struct sockaddr_un address;
    memset(&address, 0, sizeof address);
    address.sun_family = AF_UNIX;
    size_t length = strlen(SOCKET_PATH);
    if (length == 0 || length >= sizeof address.sun_path) {
        close(fd);
        return -1;
    }
    memcpy(address.sun_path, SOCKET_PATH, length + 1);
    if (connect(fd, (const struct sockaddr *)&address, sizeof address) != 0) {
        if (errno != EINPROGRESS) {
            close(fd);
            return -1;
        }
        for (;;) {
            int64_t now = monotonic_ms();
            if (now < 0 || now >= preauth_deadline) {
                close(fd);
                return -1;
            }
            struct pollfd descriptor = { .fd = fd, .events = POLLOUT, .revents = 0 };
            int ready = poll(&descriptor, 1, (int)(preauth_deadline - now));
            if (ready < 0 && errno == EINTR) continue;
            if (ready <= 0 || (descriptor.revents & POLLNVAL) != 0) {
                close(fd);
                return -1;
            }
            if ((descriptor.revents & (POLLOUT | POLLERR | POLLHUP)) == 0) continue;
            int socket_error = 0;
            socklen_t socket_error_length = sizeof socket_error;
            if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &socket_error, &socket_error_length) != 0
                    || socket_error_length != sizeof socket_error || socket_error != 0) {
                close(fd);
                return -1;
            }
            break;
        }
    }
    return fd;
}

static int relay_session(int socket_fd, int64_t preauth_deadline) {
    unsigned char buffer[16384];
    uint64_t input_total = 0;
    uint64_t output_total = 0;
    size_t first_frame_bytes = 0;
    size_t output_frame_bytes = 0;
    unsigned int output_frame_count = 0;
    bool request_frame_complete = false;
    bool server_frame_complete = false;
    bool input_open = true;
    if (set_nonblocking(STDIN_FILENO) != 0 || set_nonblocking(STDOUT_FILENO) != 0) return -1;
    int64_t deadline = preauth_deadline;

    for (;;) {
        int64_t now = monotonic_ms();
        if (now < 0 || now >= deadline) return -1;
        int timeout = (int)(deadline - now);
        struct pollfd descriptors[2] = {
            { .fd = STDIN_FILENO, .events = input_open ? POLLIN : 0, .revents = 0 },
            { .fd = socket_fd, .events = POLLIN, .revents = 0 }
        };
        int ready = poll(descriptors, 2, timeout);
        if (ready < 0 && errno == EINTR) continue;
        if (ready <= 0) return -1;

        if (input_open && (descriptors[0].revents & (POLLIN | POLLHUP)) != 0) {
            ssize_t count = read(STDIN_FILENO, buffer, sizeof buffer);
            if (count < 0 && errno == EINTR) continue;
            if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
            if (count < 0) return -1;
            if (count == 0) {
                input_open = false;
                if (shutdown(socket_fd, SHUT_WR) != 0 && errno != ENOTCONN) return -1;
            } else {
                input_total += (uint64_t)count;
                if (input_total > SESSION_INPUT_LIMIT) return -1;
                if (!request_frame_complete) {
                    for (ssize_t index = 0; index < count && !request_frame_complete; index += 1) {
                        first_frame_bytes += 1;
                        if (first_frame_bytes > FIRST_FRAME_LIMIT) return -1;
                        if (buffer[index] == '\n') request_frame_complete = true;
                    }
                }
                if (write_all_before_deadline(socket_fd, buffer, (size_t)count, deadline) != 0) return -1;
            }
        }

        if ((descriptors[1].revents & (POLLIN | POLLHUP)) != 0) {
            ssize_t count = read(socket_fd, buffer, sizeof buffer);
            if (count < 0 && errno == EINTR) continue;
            if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue;
            if (count < 0) return -1;
            if (count == 0) break;
            output_total += (uint64_t)count;
            if (output_total > SESSION_OUTPUT_LIMIT) return -1;
            for (ssize_t index = 0; index < count; index += 1) {
                output_frame_bytes += 1;
                if (output_frame_bytes > RESPONSE_FRAME_LIMIT) return -1;
                if (buffer[index] == '\n') {
                    output_frame_bytes = 0;
                    output_frame_count += 1;
                    if (output_frame_count > MAX_RESPONSE_FRAMES) return -1;
                    if (!server_frame_complete) {
                        int64_t accepted_at = monotonic_ms();
                        if (accepted_at < 0) return -1;
                        deadline = accepted_at + ARTIFACT_DEADLINE_MS;
                        server_frame_complete = true;
                    }
                }
            }
            if (write_all_before_deadline(STDOUT_FILENO, buffer, (size_t)count, deadline) != 0) return -1;
        }
        if ((descriptors[0].revents & (POLLERR | POLLNVAL)) != 0
                || (descriptors[1].revents & (POLLERR | POLLNVAL)) != 0) return -1;
    }
    return request_frame_complete && server_frame_complete && output_frame_bytes == 0 ? 0 : -1;
}

int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1 || getuid() != 0 || geteuid() != 0) {
        fputs("deploy_root_relay_rejected\n", stderr);
        return 64;
    }
    if (close_range(3U, ~0U, 0U) != 0 || clearenv() != 0) {
        fputs("deploy_root_relay_rejected\n", stderr);
        return 70;
    }
    int lock_fd = acquire_relay_lock();
    if (lock_fd < 0) {
        fputs("deploy_root_relay_rejected\n", stderr);
        return 70;
    }
    int64_t started = monotonic_ms();
    if (started < 0) {
        close(lock_fd);
        fputs("deploy_root_relay_rejected\n", stderr);
        return 70;
    }
    int64_t preauth_deadline = started + PREAUTH_DEADLINE_MS;
    int socket_fd = connect_fixed_socket(preauth_deadline);
    if (socket_fd < 0 || relay_session(socket_fd, preauth_deadline) != 0) {
        if (socket_fd >= 0) close(socket_fd);
        close(lock_fd);
        fputs("deploy_root_relay_rejected\n", stderr);
        return 70;
    }
    int socket_close_result = close(socket_fd);
    int lock_close_result = close(lock_fd);
    if (socket_close_result != 0 || lock_close_result != 0) {
        fputs("deploy_root_relay_rejected\n", stderr);
        return 70;
    }
    return 0;
}
```

Implement `node-helper-entry.c` as the only reviewed clean-environment bridge from systemd to Node:

```c
#define _GNU_SOURCE
#include <errno.h>
#include <limits.h>
#include <pwd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

struct helper_contract {
    const char *id;
    const char *script;
    int socket_fd_required;
    const char *peer_user;
};

static const struct helper_contract HELPERS[] = {
    { "bootstrap-protocol-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-bootstrap-root.mjs", 1, "root" },
    { "deploy-protocol-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-deploy-root.mjs", 1, "root" },
    { "bootstrap-operation-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-bootstrap-operation.mjs", 0, NULL },
    { "bootstrap-cleanup-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-bootstrap-cleanup.mjs", 0, NULL },
    { "bootstrap-systemd-broker-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-bootstrap-systemd-broker.mjs", 1, NULL },
    { "session-limit-broker-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-session-limit-broker.mjs", 1, NULL },
    { "recovery-challenge-broker-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-recovery-challenge-broker.mjs", 1, NULL },
    { "accepted-artifact-custody-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-accepted-artifact-custody.mjs", 1, NULL },
    { "boot-preflight-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-boot-preflight.mjs", 0, NULL },
    { "closeout-finalizer-v1", "/usr/lib/proxy-gateway-control-plane/scripts/control-plane-closeout-finalizer.mjs", 0, NULL }
};

static const struct helper_contract *find_helper(const char *id) {
    size_t count = sizeof HELPERS / sizeof HELPERS[0];
    for (size_t index = 0; index < count; index += 1) {
        if (strcmp(id, HELPERS[index].id) == 0) return &HELPERS[index];
    }
    return NULL;
}

static int exact_socket_activation(int required) {
    const char *pid_text = getenv("LISTEN_PID");
    const char *fds_text = getenv("LISTEN_FDS");
    if (!required) return (pid_text == NULL || pid_text[0] == '\0')
        && (fds_text == NULL || strcmp(fds_text, "0") == 0);
    if (pid_text == NULL || fds_text == NULL || strcmp(fds_text, "1") != 0) return 0;
    errno = 0;
    char *end = NULL;
    long observed_pid = strtol(pid_text, &end, 10);
    return errno == 0 && end != pid_text && *end == '\0'
        && observed_pid > 0 && observed_pid <= INT_MAX
        && (pid_t)observed_pid == getpid();
}

static int exact_peer_and_timeout(const char *peer_user) {
    if (peer_user == NULL) return 1;
    struct passwd *account = getpwnam(peer_user);
    struct ucred peer;
    socklen_t peer_length = sizeof peer;
    struct timeval timeout = { .tv_sec = 10, .tv_usec = 0 };
    int connection = accept4(3, NULL, NULL, SOCK_CLOEXEC);
    if (account == NULL || connection < 0
        || getsockopt(connection, SOL_SOCKET, SO_PEERCRED, &peer, &peer_length) != 0
        || peer_length != sizeof peer || peer.pid <= 0 || peer.uid != account->pw_uid
        || setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof timeout) != 0
        || setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof timeout) != 0
        || dup3(connection, 3, 0) != 3 || close(connection) != 0) return 0;
    return 1;
}

int main(int argc, char **argv) {
    const struct helper_contract *helper =
        argc == 2 ? find_helper(argv[1]) : NULL;
    if (helper == NULL || !exact_socket_activation(helper->socket_fd_required)
        || !exact_peer_and_timeout(helper->peer_user)) {
        fputs("node_helper_entry_rejected\n", stderr);
        return 64;
    }
    unsigned int first_closed = helper->socket_fd_required ? 4U : 3U;
    if (close_range(first_closed, ~0U, 0U) != 0 || clearenv() != 0) {
        fputs("node_helper_entry_rejected\n", stderr);
        return 70;
    }
    char *const clean_env[] = {
        "PATH=/usr/sbin:/usr/bin",
        "LANG=C.UTF-8",
        "LC_ALL=C.UTF-8",
        NULL
    };
    char *const node_argv[] = {
        "/usr/bin/node", "--jitless", (char *)helper->script, NULL
    };
    execve(node_argv[0], node_argv, clean_env);
    fputs("node_helper_entry_rejected\n", stderr);
    return 70;
}
```

Register exactly these five source/output tuples through the reviewed Foundation fragment and standalone-target compiler, not a second directory or public ABI:

| targetId | outputName | source |
| --- | --- | --- |
| `control-plane-bootstrap-entry-v1` | `proxy-gateway-control-plane-bootstrap-entry` | `src/bootstrap-entry.c` |
| `control-plane-deploy-entry-v1` | `proxy-gateway-control-plane-deploy-entry` | `src/deploy-entry.c` |
| `control-plane-bootstrap-root-relay-v1` | `proxy-gateway-control-plane-bootstrap-root-relay` | `src/bootstrap-root-relay.c` |
| `control-plane-deploy-root-relay-v1` | `proxy-gateway-control-plane-deploy-root-relay` | `src/deploy-root-relay.c` |
| `control-plane-node-helper-entry-v1` | `proxy-gateway-control-plane-node-helper-entry` | `src/node-helper-entry.c` |

For each tuple, compute `sourceSha256` from the completed LF-terminated source during the implementation step, write that exact lowercase digest into the canonical fragment, and make the test independently rehash the source before compile; no illustrative or pre-change digest is accepted. Update the ordered `fragments` entry in `reviewed-native-registry-manifest.json` with kind `native_extension`, basename `bootstrap-authorization-v1.json`, and the exact canonical fragment SHA-256. The compiler's `sourceRoot` is the native root `ops/control-plane-deploy/native`; it opens only the fixed `registry/reviewed-native-registry-manifest.json`, resolves fragment paths beneath `registry/`, and resolves standalone `source` values beneath the native root. Foundation alone expands `hardened-c17-pie-v1` into its reviewed complete compiler/linker vector and compiles the declared standalone targets; Bootstrap neither copies that vector nor modifies it. The validator rejects unknown keys, duplicate target/output/profile IDs, sources outside `ops/control-plane-deploy/native/src/`, source digest drift, an unbound fragment digest, a runtime selector, arbitrary source, alternate compile profile, or attempted ABI/export declaration. The existing build still requires all six reviewed offline header/toolchain custody variables including `CONTROL_PLANE_NODE_HEADERS_DIR`, copies no headers, performs no download, and keeps `FOUNDATION_PUBLIC_NATIVE_EXPORTS` byte-for-byte unchanged.

- [ ] **Step 4: Add the exact authorized-key and temporary sudoers contracts**

```text
restrict,command="/usr/local/libexec/proxy-gateway-control-plane-deploy-entry",no-user-rc,no-X11-forwarding,no-agent-forwarding,no-port-forwarding,no-pty
```

The bootstrap activation writer renders the expiry and exact bootstrap-entry command into the ephemeral authorized-key line, then hashes the complete line and its exact no-argument bootstrap-root-relay sudoers bytes before record publication. The deploy authorization generation binds its own exact root-owned mode-`0440` line `github-control-deploy ALL=(root) NOPASSWD:NOSETENV: /usr/local/libexec/proxy-gateway-control-plane-deploy-root-relay`; rotation/revocation proves the prior line replaced or absent. Tests reject newline/key-option/sudoers injection, multiple entries, principals other than the two fixed names, arguments after an entry or relay, writable owner/mode, `SSH_ORIGINAL_COMMAND`, `SETENV`, wildcard/second command, direct Node/systemd/shell authority, and any non-fixed socket.

- [ ] **Step 5: Run native and static tests and verify GREEN**

Run on disposable Linux with Foundation's six reviewed offline header/toolchain custody variables: `node scripts/build-control-plane-native.mjs && node --test server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit native entry boundaries**

```bash
git add ops/control-plane-deploy/native/src/bootstrap-entry.c ops/control-plane-deploy/native/src/deploy-entry.c ops/control-plane-deploy/native/src/bootstrap-root-relay.c ops/control-plane-deploy/native/src/deploy-root-relay.c ops/control-plane-deploy/native/src/node-helper-entry.c ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json ops/control-plane-deploy/ssh/github-control-deploy-authorized-key-options ops/control-plane-deploy/sudoers/github-control-deploy-root-relay server/tests/control-plane-bootstrap-systemd-contract.test.mjs
git commit -m "feat: add fixed control-plane ssh entry boundaries"
```

---
### Task 5: Fixed bootstrap root launcher, cgroup deadline, and cleanup unit

**Files:**
- Modify: `server/services/deployment/control-plane-bootstrap-activation-contract.mjs`
- Create: `server/services/deployment/control-plane-transport-contract.mjs` (three frozen activation timing exports only; Task 8 extends this same owner file)
- Create: `scripts/control-plane-bootstrap-root.mjs`
- Create: `scripts/control-plane-bootstrap-operation.mjs`
- Create: `scripts/control-plane-bootstrap-cleanup.mjs`
- Create: `scripts/control-plane-bootstrap-systemd-broker.mjs`
- Create: `server/services/deployment/control-plane-bootstrap-systemd-broker.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-cleanup.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-systemd-broker.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-systemd-broker.service`
- Create: `integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`
- Modify: `package.json`
- Modify: `server/services/deployment/control-plane-bootstrap-state-machine.mjs`
- Modify: `server/tests/control-plane-bootstrap-state-machine.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-activation-contract.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

**Interfaces:**
- From `control-plane-bootstrap-activation-contract.mjs`, export `BOOTSTRAP_OPERATION_ENVELOPE_FIELDS`, `createBootstrapOperationEnvelope(input)`, and `parseBootstrapOperationEnvelope(bytes)`. The exact ordered fields are `schema`, `activationId`, `activationRecordSha256`, `bootstrapAuthorizationGateReceiptSha256`, `bootstrapActivationGateReceiptSha256`, `rotationId`, `rotationJournalSha256`, `operation`, `target`, `currentGeneration`, `proposedGeneration`, `requestedAt`, and `expiresAt`; the creator fixes `schema="github_control_plane_bootstrap_operation_v1"` and `target="japan-control-plane"`. Its bytes are the one exact mutation request passed through the later `bootstrap_activation` frame without reconstruction.
- Export `createBootstrapRootLauncher({ native, machine, systemdBroker, clock })` with `run(operationEnvelopeBytes, { onAuthorized })`. Export `BOOTSTRAP_SYSTEMD_BROKER_OPERATIONS`, `createBootstrapSystemdBrokerClient({ socketClient, clock, sleep })`, and `createBootstrapSystemdBroker({ native, execFile, clock, sleep, cgroupReader, peerVerifier })`. The launcher and broker each require the complete fourteen-feature Foundation vector before parsing a mutation request or making a manager call. `run` accepts only the exact canonical bytes from `parseBootstrapOperationEnvelope` plus one exact options object whose sole key is the no-argument function `onAuthorized`; it reopens the immutable record, armed lease, current rotation fence/journal, and installed bootstrap principal, byte-compares all thirteen envelope fields including both Gate receipt digests, and requires `requestedAt <= now < min(requestedAt + 60 seconds, expiresAt)`. After every current readback passes and immediately before the first activation claim/CAS/mutation, it awaits `onAuthorized()` exactly once. A throw, disconnect, timeout, false return, extra option, callback argument/selector, stale readback, or second invocation performs zero claim/CAS/mutation. Task 5 tests this seam with a synthetic fixed callback; Task 9 is its sole production caller and supplies only the owner-internal ready-frame writer. The launcher never accepts compatibility inventory bytes or a reconstructed object. The client exposes only `startBootstrapActivation`, `waitForBootstrapTerminal`, `requestBootstrapCleanup`, and `terminateAndProveEmpty`; the broker accepts only `start_activation`, `read_activation`, `start_cleanup`, and `terminate_activation` canonical requests on fixed socket ID `control-plane-bootstrap-systemd-broker-v1`. Task 5 depends only on the activation terminal record; Task 7 later wires the in-cgroup operation body without changing this launcher interface.
- `run` accepts only the five `BOOTSTRAP_OPERATIONS`, validates the immutable activation record and current journal digest, CASes `armed -> in_progress` while binding the accepted envelope digest, and starts exactly one activation-ID-bound privileged cgroup with a monotonic deadline no later than wall-clock expiry.
- `node scripts/control-plane-bootstrap-operation.mjs` accepts no argv/stdin. Inside the fixed cgroup it re-reads the fixed active lease, immutable activation record, accepted-envelope digest, journal, and expiry, then invokes only the bound rotation operation. It cannot select an operation or path.
- Export `runBootstrapCleanup({ native, machine, closeoutCoordinator })`; it requires the complete Foundation vector before any cleanup CAS. The no-argument cleanup script first converges the fixed active lease/cgroup/triple, then lets the outside-cgroup coordinator advance only an exact operation-terminal rotation journal.
- `node scripts/control-plane-bootstrap-root.mjs` and `node scripts/control-plane-bootstrap-cleanup.mjs` reject argv and environment overrides. The cleanup launcher is outside the activation cgroup.
- The bootstrap protocol process runs only behind the exact shim -> no-argument sudo -> native root relay -> root-only `Accept=no` socket -> reviewed helper chain; `sshd` and sudo never execute the Node parser. Systemd starts the service with `SupplementaryGroups=` and an empty capability set. After the native helper accepts FD 3 and authenticates the root relay, Node sets `umask(0077)`, calls only `process.getgroups()` to assert the supplementary-group vector is empty, changes to `/`, requires the exact fixed locale/PATH environment, deletes every non-allowlisted variable, and refuses any FD other than the connected socket. It never invokes the setgroups API after capabilities are cleared. It has no child-process/systemd-manager adapter; its only lifecycle authority is `createBootstrapSystemdBrokerClient` over the fixed root socket. Store construction supplies only fixed directory capabilities and closed logical IDs.
- Add `npm run test:control-plane-bootstrap-sandbox-linux` for the target-matched disposable image. Task 5 creates the harness with bootstrap activation/cleanup/broker denial probes; Tasks 9 and 10 extend the same file before their units are implemented, preserving per-task RED evidence. It never points at a host or persists installed state outside the disposable image.

- [ ] **Step 1: Write failing claim, broker-grammar, sandbox, second-use, and expiry tests**

```js
test('root launcher claims armed activation exactly once and uses the fixed cgroup contract', async () => {
  const calls = [];
  const launcher = createBootstrapRootLauncher(createRootHarness({ calls }));
  const onAuthorized = async (...args) => {
    assert.deepEqual(args, []);
    calls.push('bootstrap_activation_ready:write_confirmed');
    return true;
  };
  const result = await launcher.run(validBootstrapEnvelopeBytes(), { onAuthorized });
  assert.equal(result.state, 'terminal');
  assert.match(result.terminalResultSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'activation:readback',
    'journal:readback',
    'rotation_fence:readback',
    'installed_bootstrap_principal:readback',
    'expiry:recheck',
    'bootstrap_activation_ready:write_confirmed',
    'lease:cas:armed:in_progress',
    `systemd_broker:start:proxy-gateway-control-bootstrap-activation@${syntheticActivationHex}.service`,
    'cleanup:request',
  ]);
  await assert.rejects(
    launcher.run(validBootstrapEnvelopeBytes(), { onAuthorized }),
    /activation_not_armed/,
  );
});

test('root launcher requires the fresh exact activation and approval envelope', async () => {
  for (const drift of [
    'activationId', 'activationRecordSha256', 'bootstrapAuthorizationGateReceiptSha256',
    'bootstrapActivationGateReceiptSha256', 'rotationId', 'rotationJournalSha256',
    'operation', 'target', 'currentGeneration', 'proposedGeneration', 'expiresAt',
  ]) {
    const harness = createRootHarness();
    await assert.rejects(
      offerBootstrapEnvelopeWithDrift(harness, drift, authorizedCallback(harness)),
      /bootstrap_operation_binding_invalid/,
    );
    assert.equal(harness.claimCalls, 0);
  }
  const stale = createRootHarness({ requestAgeMs: 60_001 });
  await assert.rejects(
    stale.launcher.run(validBootstrapEnvelopeBytes(), { onAuthorized: authorizedCallback(stale) }),
    /bootstrap_operation_request_stale/,
  );
  assert.equal(stale.claimCalls, 0);
});

test('root launcher performs zero mutation until the fixed authorization callback succeeds', async () => {
  for (const callbackMode of ['throw', 'disconnect', 'false']) {
    const harness = createRootHarness({ callbackMode });
    await assert.rejects(
      harness.launcher.run(validBootstrapEnvelopeBytes(), {
        onAuthorized: failingAuthorizedCallback(harness, callbackMode),
      }),
      /bootstrap_activation_ready_not_confirmed/,
    );
    assert.equal(harness.calls.some((call) => /lease:cas|systemd_broker:start|rotation:mutate/.test(call)), false);
    assert.equal(harness.onAuthorizedCalls, 1);
  }
});

test('expiry between claim and host CAS prevents the mutation and requests cleanup', async () => {
  const harness = createRootHarness({ advanceAfterClaimMs: 900_001 });
  const launcher = createBootstrapRootLauncher(harness);
  await assert.rejects(
    launcher.run(validBootstrapEnvelopeBytes(), { onAuthorized: authorizedCallback(harness) }),
    /activation_expired/,
  );
  assert.equal(harness.calls.includes('rotation:mutate'), false);
  assert.equal(harness.calls.at(-1), 'cleanup:request');
});

test('bootstrap systemd broker rejects every caller-selected manager field', async () => {
  for (const field of ['unit', 'executable', 'uid', 'property', 'command', 'environment']) {
    const calls = [];
    const broker = createBootstrapSystemdBroker(createSystemdBrokerHarness({ calls }));
    await assert.rejects(broker.handle(encodeBrokerRequest({ operation: 'start_cleanup', [field]: 'synthetic' }), rootInstalledPeer()), /systemd_broker_request_invalid/);
    assert.deepEqual(calls, []);
  }
});
```

In this RED batch also table-drive the four accepted broker operations and add static unit assertions for every exact capability, device, Protect*, address-family, namespace, syscall, path, timeout, output, and manager-socket directive listed in Steps 3-4. The first run fails on the missing broker/unit files, before any implementation is added.

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

On target-matched disposable Linux also run: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: FAIL because the root and cleanup launchers are absent.

- [ ] **Step 3: Implement fixed envelope validation and cgroup launch**

At this checkpoint `control-plane-transport-contract.mjs` contains only the following frozen owner constants; Task 8 adds its remaining exports without renaming or restating them. The launcher imports `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS`; no Bootstrap module accepts a bound.

```js
export const BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS = 900_000;
export const BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS = 910_000;
export const BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS = 925_000;
```

```js
export function createBootstrapRootLauncher({ native, machine, systemdBroker, clock }) {
  return Object.freeze({
    async run(operationEnvelopeBytes, options) {
      requireAllFoundationCapabilities(native.probeLinuxCapabilities());
      if (options === null || typeof options !== 'object'
          || Object.getPrototypeOf(options) !== Object.prototype
          || Reflect.ownKeys(options).length !== 1
          || Reflect.ownKeys(options)[0] !== 'onAuthorized'
          || typeof options.onAuthorized !== 'function') {
        throw new Error('bootstrap_activation_authorized_callback_invalid');
      }
      const request = parseBootstrapOperationEnvelope(operationEnvelopeBytes);
      const activation = await machine.readAndVerify(request.activationId);
      const authorizationReadback = await machine.readCurrentAuthorizationBinding(request.activationId);
      verifyActivationBinding({ activation, authorizationReadback, request });
      verifyFreshBootstrapOperationRequest({
        activation,
        request,
        now: clock.wallNow(),
        maximumRequestAgeMs: 60_000,
      });
      try {
        if (await options.onAuthorized() !== true) {
          throw new Error('bootstrap_activation_ready_not_confirmed');
        }
      } catch {
        throw new Error('bootstrap_activation_ready_not_confirmed');
      }
      const claimed = await machine.claim(activation.value.activationId, activation.leaseSha256);
      try {
        const freshRemainingMs = Math.min(
          BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS,
          Date.parse(activation.value.expiresAt) - clock.wallNow(),
        );
        if (freshRemainingMs < 1_000) throw new Error('activation_expired_after_claim');
        const runtimeMaxSec = Math.floor(freshRemainingMs / 1_000);
        await systemdBroker.startBootstrapActivation({
          activationId: claimed.value.activationId,
          runtimeMaxSec,
        });
        await systemdBroker.waitForBootstrapTerminal(
          claimed.value.activationId,
          runtimeMaxSec * 1_000,
        );
        return await machine.readTerminal(claimed.value.activationId);
      } finally {
        await systemdBroker.requestBootstrapCleanup();
      }
    },
  });
}
```

The launcher and cleanup service cannot open `/run/systemd/private` or the D-Bus manager socket. They call a root-only socket-activated broker whose parser derives the one activation instance and complete property vector internally. The broker never accepts a unit, executable, UID, property, command, or environment. Its positive `start_activation` branch is exact:

```js
export const BOOTSTRAP_SYSTEMD_BROKER_OPERATIONS = Object.freeze([
  'start_activation',
  'read_activation',
  'start_cleanup',
  'terminate_activation',
]);

export function createBootstrapSystemdBroker({ native, execFile, clock, sleep, cgroupReader, peerVerifier }) {
  return Object.freeze({
    async handle(requestBytes, peer) {
      requireAllFoundationCapabilities(native.probeLinuxCapabilities());
      peerVerifier.requireInstalledRootClient(peer);
      const request = parseBootstrapSystemdBrokerRequest(requestBytes);
      const unit = request.activationId === null ? null : fixedActivationUnit(request.activationId);
      if (request.operation === 'start_activation') {
        await execFile('/usr/bin/systemd-run', [
          '--quiet', '--no-block', '--collect', `--unit=${unit}`,
          '--property=Type=exec', `--property=RuntimeMaxSec=${request.runtimeMaxSec}s`,
          '--property=KillMode=control-group', '--property=SendSIGKILL=yes',
          '--property=User=root', '--property=Group=root', '--property=UMask=0077',
          '--property=NoNewPrivileges=yes', '--property=PrivateDevices=yes', '--property=PrivateTmp=yes',
          '--property=ProtectSystem=strict', '--property=ProtectHome=yes',
          '--property=ProtectKernelTunables=yes', '--property=ProtectKernelModules=yes',
          '--property=ProtectKernelLogs=yes', '--property=ProtectControlGroups=yes',
          '--property=ProtectClock=yes', '--property=ProtectHostname=yes',
          '--property=ProtectProc=invisible', '--property=ProcSubset=pid',
          '--property=RestrictNamespaces=yes', '--property=RestrictRealtime=yes',
          '--property=LockPersonality=yes', '--property=MemoryDenyWriteExecute=yes',
          '--property=RestrictSUIDSGID=yes', '--property=RemoveIPC=yes',
          '--property=CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER',
          '--property=AmbientCapabilities=', '--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6',
          '--property=SystemCallArchitectures=native', '--property=SystemCallFilter=@system-service',
          '--property=SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged',
          '--property=InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt',
          '--property=ReadWritePaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /var/lib/github-control-bootstrap/.ssh /etc/sudoers.d',
          '--property=StandardOutput=null', '--property=StandardError=null',
          '--property=OnSuccess=proxy-gateway-control-bootstrap-cleanup.service',
          '--property=OnFailure=proxy-gateway-control-bootstrap-cleanup.service',
          '/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry', 'bootstrap-operation-v1',
        ], fixedExecOptions());
        return encodeBootstrapSystemdBrokerResponse({ operation: request.operation, state: 'started' });
      }
      if (request.operation === 'read_activation') {
        return encodeBootstrapSystemdBrokerResponse(await readExactUnitState(execFile, unit));
      }
      if (request.operation === 'start_cleanup') {
        await execFile('/usr/bin/systemctl', ['start', '--no-block', 'proxy-gateway-control-bootstrap-cleanup.service'], fixedExecOptions());
        return encodeBootstrapSystemdBrokerResponse({ operation: request.operation, state: 'started' });
      }
      await execFile('/usr/bin/systemctl', ['kill', '--kill-whom=all', '--signal=TERM', unit], fixedExecOptions());
      await sleep(2_000);
      if (!(await cgroupReader.isEmpty(unit))) {
        await execFile('/usr/bin/systemctl', ['kill', '--kill-whom=all', '--signal=KILL', unit], fixedExecOptions());
      }
      if (!(await cgroupReader.isEmpty(unit))) throw new Error('bootstrap_cgroup_not_empty');
      return encodeBootstrapSystemdBrokerResponse({ operation: request.operation, state: 'empty' });
    },
  });
}
```

`parseBootstrapSystemdBrokerRequest` uses distinct closed contracts: start requires exact `activationId` plus integer `runtimeMaxSec` in `1..900`; read/terminate require only exact `activationId`; cleanup has neither field and canonical null is not accepted as a substitute. `createBootstrapSystemdBrokerClient` owns the fixed socket capability, byte-compares the operation and activation binding in every response, implements the bounded read poll, and exposes no raw request method. A test advances the wall clock by 999 ms, 1,000 ms, and the full remaining interval during `machine.claim()`: the launcher always recomputes after claim, floors seconds, never rounds past `expiresAt`, and the less-than-one-second branch calls cleanup without one broker start.

- [ ] **Step 4: Add the fixed cleanup unit**

```ini
[Unit]
Description=Proxy Gateway control-plane bootstrap activation cleanup
DefaultDependencies=no
Requires=proxy-gateway-control-bootstrap-systemd-broker.socket
After=local-fs.target proxy-gateway-control-boot-preflight.service proxy-gateway-control-bootstrap-systemd-broker.socket
Before=proxy-gateway-candidate.service

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry bootstrap-cleanup-v1
User=root
Group=root
UMask=0077
TimeoutStartSec=180
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_DAC_OVERRIDE CAP_FOWNER
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadWritePaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /var/lib/github-control-bootstrap/.ssh /etc/sudoers.d
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
```

The broker units are exact:

```ini
[Socket]
ListenStream=/run/proxy-gateway-control-plane/bootstrap-systemd-broker.sock
SocketMode=0600
SocketUser=root
SocketGroup=root
RemoveOnStop=true

[Install]
WantedBy=sockets.target
```

```ini
[Service]
Type=simple
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry bootstrap-systemd-broker-v1
TimeoutStartSec=10
User=root
Group=root
UMask=0077
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/dbus/system_bus_socket /root /home /media /mnt
StandardOutput=null
StandardError=null
```

Only this broker profile can connect to `/run/systemd/private`; it has no `ReadWritePaths`, and D-Bus remains inaccessible. The unit is installed but not enabled or started in this source-only slice. Contract and target-Linux denial tests run each non-broker helper under its real unit and require operation-specific errno: `EROFS` for ProtectSystem writes, `ENOENT` for hidden `/dev/kmsg`, `EAFNOSUPPORT` for AF_INET/AF_INET6, `EACCES` for each InaccessiblePaths manager/root path, and `EPERM` for `mount`, `reboot`, `bpf`, `ptrace`, `keyctl`, and namespace creation. Every case also snapshots attempted unit and filesystem state to prove no side effect. The broker test proves an arbitrary unit/property/executable request is rejected before `execFile`, while each of its four canonical operations reaches only the expected fixed manager call.

- [ ] **Step 5: Execute the previously written rejection, kill/readback, and real-denial batches**

Cover wrong operation, activation digest, key fingerprint, provider receipt, target, predecessor, `rotationId`, journal digest, expired record, second claim, and injected failure before each rotation CAS. For controller loss and deadline, assert the exact cgroup receives TERM then bounded KILL, every descendant is absent, fence remains, triple cleanup completes, evidence is durable, and lease is removed last.

Run the full batch after each minimal Step 3-4 addition; retain the recorded Step 2 RED, make one rejection/kill/readback row GREEN at a time, and do not weaken a prior row.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-contract.test.mjs server/tests/control-plane-bootstrap-store.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

On target-matched disposable Linux: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the root/cleanup boundary**

```bash
git add server/services/deployment/control-plane-bootstrap-activation-contract.mjs server/services/deployment/control-plane-transport-contract.mjs scripts/control-plane-bootstrap-root.mjs scripts/control-plane-bootstrap-operation.mjs scripts/control-plane-bootstrap-cleanup.mjs scripts/control-plane-bootstrap-systemd-broker.mjs server/services/deployment/control-plane-bootstrap-systemd-broker.mjs ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-cleanup.service ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-systemd-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-systemd-broker.service integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs package.json server/services/deployment/control-plane-bootstrap-state-machine.mjs server/tests/control-plane-bootstrap-activation-contract.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs
git commit -m "feat: bound bootstrap activation and cleanup"
```

---

### Task 6: Temporary GitHub updater issuance and uncertain-token recovery

**Files:**
- Create: `server/services/deployment/control-plane-bootstrap-updater.mjs`
- Create: `server/services/deployment/control-plane-authorization-adapters.mjs`
- Create: `scripts/control-plane-bootstrap-updater.mjs`
- Create: `ops/control-plane-deploy/contracts/updater-app-v1.json`
- Create: `ops/control-plane-deploy/contracts/metadata-app-v1.json`
- Create: `ops/control-plane-deploy/contracts/host-authorization-v1.json`
- Create: `server/tests/control-plane-bootstrap-updater.test.mjs`
- Create: `server/tests/control-plane-authorization-adapters.test.mjs`

**Interfaces:**
- Export `UPDATER_STATES`, `TOKEN_OUTCOME_STATES`, `createUpdaterReservationId(input)`, `validateUpdaterStaticContract(value)`, and `createBootstrapUpdater({ native, store, provider, sealedMemory, clock, randomBytes })`. Every stateful method requires the complete fourteen-feature Foundation vector before store/provider/sealed-memory access.
- The updater exposes `reserve(input)`, `issue(reservationId)`, `recover(reservationId)`, `revoke(reservationId)`, and `publishIssuanceChain(reservationId)`.
- The provider interface is closed: `readDedicatedApp`, `createOneUseKey`, `readOneUseKey`, `installRepository`, `readRepositoryInstallation`, `mintInstallationToken`, `revokeInstallationToken`, `deleteRepositoryInstallation`, and `deleteOneUseKey`. Every method internally fixes owner, repository, Environment, REST method/path, redirect policy, and payload schema.
- `control-plane-authorization-adapters.mjs` exports production factories `createGitHubUpdaterProvider({ native, api })`, `createEnvironmentAuthorizationWriter({ native, api })`, `createMetadataScopeAttestor({ native, api, sealedMemory })`, `createHostAuthorizationWriter({ native, store, hostEvidenceKeyProvider })`, and `createBootstrapReceiptPublisher({ native, store })`. Each public method probes the full Foundation vector before it opens an App/key/token capability, provider API, host-evidence key closure, or durable record. Each factory accepts a capability-scoped API object, never a base URL/token/path, and exposes only the exact injected interfaces consumed by updater/rotation.
- `metadata-app-v1.json` fixes repository `Metadata/Environments/Secrets/Variables: read`, organization `Secrets/Variables: read`, exact App/installation/repository scope, and absence of every write/Actions/contents/deployments/admin/attestation/OIDC/host permission. The attestor seals the App key/token, lists names only, proves exact Environment/no wider fallback, and returns only contract/scope digests.
- `host-authorization-v1.json` fixes the root-only evidence-key generation and canonical installed account/sudoers/authorized-key/launcher/pinned-host-key message. `hostEvidenceKeyProvider` creates/reads only its mode-`0600` root-owned logical record and never returns key bytes outside the HMAC closure.
- `node scripts/control-plane-bootstrap-updater.mjs` accepts zero argv and first probes all fourteen capabilities; only then may its production factory open a fixed sealed descriptor role or provider/key materializer. It never accepts a URL, repository, Environment, App, permission, secret name, or provider command from argv/stdin.

- [ ] **Step 1: Write failing reservation-before-mutation tests**

```js
test('updater persists staging reservation before the first provider mutation', async () => {
  const calls = [];
  const updater = createBootstrapUpdater(createUpdaterHarness({ calls }));
  const reservation = await updater.reserve(validUpdaterInput());
  calls.length = 0;
  await updater.issue(reservation.reservationId);
  assert.deepEqual(calls.slice(0, 6), [
    'native:probe_all_fourteen_capabilities',
    'provider:read_app',
    'provider:read_zero_key',
    'provider:read_zero_installation',
    'journal:cas:updater_issuance_staging',
    'provider:create_one_use_key',
  ]);
});

test('lost token response records may-have-minted and proves installation/key absence', async () => {
  const calls = [];
  const updater = createBootstrapUpdater(createUpdaterHarness({ calls, loseMintResponse: true }));
  const reservation = await updater.reserve(validUpdaterInput());
  await assert.rejects(updater.issue(reservation.reservationId), /token_outcome_unknown/);
  assert.deepEqual(calls.slice(-5), [
    'journal:cas:token_outcome_unknown_may_have_minted',
    'provider:delete_installation',
    'provider:read_installation_absent',
    'provider:delete_one_use_key',
    'provider:read_key_absent',
  ]);
  assert.equal(findPersistedTokenBytes(calls), false);
});

test('updater and authorization materializers stop before any protected value when ineligible', async () => {
  for (const entrypoint of ineligibleUpdaterAndAuthorizationEntrypoints()) {
    const calls = [];
    await assert.rejects(entrypoint(createUpdaterHarness({ calls, capabilityEligible: false })), /linux_capability_ineligible/);
    assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
  }
});
```

- [ ] **Step 2: Run updater tests and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-updater.test.mjs server/tests/control-plane-authorization-adapters.test.mjs`

Expected: FAIL with a missing updater module.

- [ ] **Step 3: Implement the static capability and reservation identity**

```js
export const TOKEN_OUTCOME_STATES = Object.freeze([
  'token_mint_pending',
  'token_mint_confirmed',
  'token_not_minted_confirmed',
  'token_outcome_unknown_may_have_minted',
]);

export function createUpdaterReservationId(input) {
  const bytes = serializeCanonicalJsonBytes(input, UPDATER_RESERVATION_CONTRACT);
  return `uir1.${sha256Hex(bytes)}`;
}

async function persistBeforeProviderMutation(store, journal, next) {
  return store.compareAndSwapRotation(journal.value.rotationId, journal.sha256, next);
}
```

The static updater contract contains only controller digest, fixed repository/Environment, App role/schema, exact permission manifest, exact REST allowlist, cleanup/recovery procedures, and time bounds. A test must reject `rotationId`, provider receipt, App/installation/key ID, token metadata, issuance time, final receipt, or closeout field in that static contract.

- [ ] **Step 4: Implement append-before-next-mutation issuance**

The exact normal sequence is: prove one dedicated App and zero key/installations; CAS the updater-attempt subjournal to `updater_issuance_staging`; create one-use key; append/read back key ID; create exact repository installation; append/read back installation ID and exact permissions; CAS `token_mint_pending`; mint; hold bytes in sealed memory; CAS safe issued/expiry metadata to `token_mint_confirmed`; publish/read back the ordered issuance-chain digest. This service returns evidence but never CASes the top-level rotation journal; Task 7 is the sole owner of its one `activation_armed -> updater_issued` CAS before any Environment write.

Platform expiry must be the GitHub-returned value and no more than one hour from issuance. `controllerUseDeadline` must be the earlier activation expiry and no more than 15 minutes. Every API mutation rechecks that deadline before invocation.

- [ ] **Step 5: Implement closed uncertain-outcome recovery**

On a definite rejected POST, record `token_not_minted_confirmed`. On response loss or uncertain metadata append, record `token_outcome_unknown_may_have_minted`, never enumerate a token, then delete/read back absent the exact installation and key before writing invalidation proof. A crash between provider mutation and append may inspect only the reservation's exact locator and accept a unique zero-or-one next resource; zero is absent, one is cleaned, multiple or unrelated resources remain fenced for manual intervention.

- [ ] **Step 6: Add permissions, endpoint, crash, and redaction matrices**

Reject missing `Actions: read`, any extra permission, another repository/Environment, redirect, GraphQL, caller URL, non-allowlisted method/path/name/payload, pre-existing key/installation, zero/multiple App, wrong locator, platform-expiry drift, use-deadline drift, token bytes in any persisted/output object, and platform expiry used as cleanup proof. Inject crash before/after every provider call and journal CAS.

Run the batch and observe RED before adding each permission/uncertain-outcome branch; implement one closed branch per rerun.

- [ ] **Step 7: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-updater.test.mjs server/tests/control-plane-bootstrap-store.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit updater issuance**

```bash
git add server/services/deployment/control-plane-bootstrap-updater.mjs server/services/deployment/control-plane-authorization-adapters.mjs scripts/control-plane-bootstrap-updater.mjs ops/control-plane-deploy/contracts/updater-app-v1.json ops/control-plane-deploy/contracts/metadata-app-v1.json ops/control-plane-deploy/contracts/host-authorization-v1.json server/tests/control-plane-bootstrap-updater.test.mjs server/tests/control-plane-authorization-adapters.test.mjs
git commit -m "feat: add bounded bootstrap updater issuance"
```

---

### Task 7: Genesis and N-to-N+1 rotation commit/abort recovery

**Files:**
- Modify: `server/services/deployment/control-plane-bootstrap-state-machine.mjs`
- Modify: `server/services/deployment/control-plane-bootstrap-store.mjs`
- Modify: `server/services/deployment/control-plane-bootstrap-updater.mjs`
- Modify: `scripts/control-plane-bootstrap-root.mjs`
- Modify: `server/tests/control-plane-bootstrap-state-machine.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-updater.test.mjs`

**Interfaces:**
- Export `ROTATION_STATES`, `createBootstrapRotationMachine({ native, store, updater, environmentWriter, hostAuthorizationWriter, receiptPublisher, activationMachine, clock, bindingHmac })`, and `createBootstrapCloseoutCoordinator({ native, store, updater, activationMachine, closeoutPublisher, systemdBroker, clock })`. Every public operation requires the complete Foundation vector before journal/provider/host/Environment/receipt/cgroup access.
- The machine exposes `prepareGenesis(input)`, `prepareRotation(input)`, `status(input)`, `resumePreparedRotation(input)`, `abortPreparedRotation(input)`, and `waitForOperationTerminal(activationId, timeoutMs)`.
- `ROTATION_STATES` is frozen in this exact order: `rotation_prepared`, `activation_armed`, `updater_issued`, `github_updater_cleanup_pending`, `rotation_committed_cleanup_pending`, `rotation_aborted_cleanup_pending`, `rotation_cleanup_complete`, `rotation_closed`, and `rotation_aborted_closed`. `rotation_closed` is the committed terminal only; `rotation_aborted_closed` is the exact-N-restored abort terminal only. Neither terminal has an outgoing transition, and a receipt/status response must preserve the distinction.
- `environmentWriter` exposes only `readCurrentAuthorizationTuple`, `stageNextAuthorizationTuple`, `compareAndSwapAuthorizationTuple`, and `proveExactTuple`; it uses the updater's fixed reserved Environment/name allowlist and cannot delete or name an arbitrary setting.
- `hostAuthorizationWriter` treats the deploy authorized-key line, exact root-owned mode-`0440` deploy-root-relay sudoers line, and immutable authorization record as one generation-bound triple. It stages/readbacks N+1, atomically activates N+1, then removes/readbacks absent N as the journal dictates; no state exposes a key without its exact sudoers/record bindings, and abort restores the complete exact-N triple. The line grants only `/usr/local/libexec/proxy-gateway-control-plane-deploy-root-relay` with no argv/environment and is never widened to Node, systemd, or a shell.
- The in-cgroup rotation machine may stop at `rotation_committed_cleanup_pending` or `github_updater_cleanup_pending` and must exit after writing its operation-terminal record. Only `createBootstrapCloseoutCoordinator`, invoked by the root cleanup service outside that cgroup, may prove the cgroup empty, remove the activation triple, combine GitHub/host cleanup evidence, CAS `rotation_cleanup_complete`/`rotation_closed`, and unlink the fence.

- [ ] **Step 1: Write a failing complete rotation-order test**

```js
test('N to N+1 closes only after host and GitHub cleanup proofs', async () => {
  const calls = [];
  const harness = createRotationHarness({ calls });
  const rotation = createBootstrapRotationMachine(harness);
  const operationTerminal = await rotation.prepareRotation(validRotationInput());
  assert.equal(operationTerminal.state, 'rotation_committed_cleanup_pending');
  assert.equal(calls.includes('activation:cgroup_empty'), false);
  await harness.systemdBroker.markOperationExited();
  const terminal = await createBootstrapCloseoutCoordinator(harness).run(operationTerminal.rotationId);
  assert.equal(terminal.state, 'rotation_closed');
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'journal:read:rotation_prepared',
    'activation:verify_and_mark_armed',
    'journal:cas:activation_armed',
    'updater:issue_and_publish_chain',
    'journal:cas:updater_issued',
    'host:install_pending_n_plus_one_key_sudoers_record',
    'host:remove_n_key_sudoers_record_and_prove_absent',
    'receipt:construct_pending_n_plus_one_without_edge_consumption',
    'environment:cas_n_plus_one_tuple_and_readback',
    'host:activate_pending_receipt_current_pointer',
    'receipt:consume_activation_to_final_edge',
    'host:rehash_n_plus_one_and_cross_check_dual_hmac',
    'journal:cas:rotation_committed_cleanup_pending',
    'updater:revoke_and_prove',
    'operation:terminal_and_exit',
    'native:probe_all_fourteen_capabilities',
    'activation:cgroup_empty',
    'activation:triple_cleanup_and_prove',
    'closeout:publish_combined',
    'journal:cas:rotation_cleanup_complete',
    'journal:cas:rotation_closed',
    'fence:unlink_and_readback',
  ]);
});

test('rotation state vocabulary distinguishes committed and aborted terminals', () => {
  assert.deepEqual(ROTATION_STATES, [
    'rotation_prepared', 'activation_armed', 'updater_issued',
    'github_updater_cleanup_pending', 'rotation_committed_cleanup_pending',
    'rotation_aborted_cleanup_pending', 'rotation_cleanup_complete',
    'rotation_closed', 'rotation_aborted_closed',
  ]);
  assert.equal(Object.isFrozen(ROTATION_STATES), true);
});

test('rotation and outside-cgroup closeout stop before every authority when ineligible', async () => {
  for (const run of ineligibleRotationEntrypoints()) {
    const calls = [];
    await assert.rejects(run(createRotationHarness({ calls, capabilityEligible: false })), /linux_capability_ineligible/);
    assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
  }
});
```

- [ ] **Step 2: Run the state-machine test and verify RED**

Run: `node --test server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-updater.test.mjs`

Expected: FAIL because the rotation machine is absent.

- [ ] **Step 3: Implement the closed transition dispatcher**

```js
export const ROTATION_STATES = Object.freeze([
  'rotation_prepared',
  'activation_armed',
  'updater_issued',
  'github_updater_cleanup_pending',
  'rotation_committed_cleanup_pending',
  'rotation_aborted_cleanup_pending',
  'rotation_cleanup_complete',
  'rotation_closed',
  'rotation_aborted_closed',
]);

const ROTATION_NEXT = Object.freeze({
  rotation_prepared: new Set(['activation_armed']),
  activation_armed: new Set(['updater_issued', 'rotation_aborted_cleanup_pending']),
  updater_issued: new Set(['rotation_committed_cleanup_pending', 'github_updater_cleanup_pending', 'rotation_aborted_cleanup_pending']),
  github_updater_cleanup_pending: new Set(['rotation_committed_cleanup_pending', 'rotation_aborted_cleanup_pending']),
  rotation_committed_cleanup_pending: new Set(['rotation_cleanup_complete']),
  rotation_aborted_cleanup_pending: new Set(['rotation_cleanup_complete']),
  rotation_cleanup_complete: new Set(['rotation_closed', 'rotation_aborted_closed']),
  rotation_closed: new Set(),
  rotation_aborted_closed: new Set(),
});

async function advanceRotation(store, journal, nextState, evidence) {
  if (!ROTATION_NEXT[journal.value.state]?.has(nextState)) throw new Error('rotation_transition_forbidden');
  if (journal.value.state === 'github_updater_cleanup_pending') {
    if (journal.value.cleanupResumeState === 'before_commit' &&
        nextState === 'rotation_committed_cleanup_pending' &&
        !journal.value.replacementIssuanceChainSha256) throw new Error('replacement_issuance_required');
    if (journal.value.cleanupResumeState === 'after_commit' &&
        nextState !== 'rotation_committed_cleanup_pending') throw new Error('committed_cleanup_resume_state_mismatch');
  }
  if (journal.value.state === 'rotation_cleanup_complete') {
    const expected = journal.value.operationOutcome === 'aborted' ? 'rotation_aborted_closed' : 'rotation_closed';
    if (nextState !== expected) throw new Error('rotation_close_outcome_mismatch');
  }
  const next = Object.freeze({ ...journal.value, state: nextState, evidence });
  return store.compareAndSwapRotation(journal.value.rotationId, journal.sha256, next);
}
```

Before each Environment call, host CAS, pointer publication, receipt publication, and terminal commit, re-read the activation/journal tuple and recheck expiry. Require the exact content parent and compatibility activation parent plus their unconsumed typed edge. Install pending N+1 authorization, remove/prove absence of N authorization, construct pending final bytes without authority/edge consumption, CAS/read back the complete GitHub N+1 tuple, then activate that exact digest as the host current pointer and consume `activation-to-final` exactly once. Only then re-hash installed state, cross-check GitHub and root-keyed host HMACs/key generation, and CAS `rotation_committed_cleanup_pending`. A replacement issuance invalidates/deletes the old pending bytes and recomputes both pending receipt and GitHub tuple. If updater cleanup becomes uncertain after commit, the independent updater-cleanup journal retains that pending fact; the top-level rotation remains `rotation_committed_cleanup_pending` and never cycles back through `github_updater_cleanup_pending`.

- [ ] **Step 4: Implement resume and abort without a deployment-key fallback**

`resume_prepared_rotation` must require a new activation receipt/fingerprint and the same original provider authorization receipt, `rotationId`, current journal digest, and proposed generation. Append each consumed/abandoned attempt to `bootstrapActivationAttemptChainSha256`.

`abort_prepared_rotation` is permitted only after exact N is restored and read back on host and Environment, any staged N+1 final receipt is invalidated, and updater installation/key absence is proven. The in-cgroup operation writes `rotation_aborted_cleanup_pending` plus an abort-terminal record and exits. The outside closeout coordinator proves activation cgroup/triple cleanup, publishes combined abort evidence, CASes `rotation_cleanup_complete` with `operationOutcome=aborted`, then `rotation_aborted_closed`, and removes the fence last. Committed success alone uses `rotation_closed`. If the N deployment key has already been retired, no deployment key can recover rotation; only a fresh provider-approved bootstrap activation can resume/abort.

- [ ] **Step 5: Add crash/replay/concurrency matrices**

Inject failure before/after every transition in the ordered test. Cover genesis with predecessor, non-genesis without predecessor, reuse of an N parent, stale/current Environment tuple drift, partial Environment update, wrong HMAC/outer pointer, receipt substitution, operation replay, rotation/status/recovery overlap, and prepare while artifact/journal/unattached closeout lease exists. Prove every partial state is either exact-resumable or durably fenced.

Run this matrix and record the first unsupported transition as RED; add one transition/recovery rule per rerun.

- [ ] **Step 6: Add updater-loss closeout tests**

When anonymous updater credentials disappear, assert `github_updater_cleanup_pending`, explicit `cleanupResumeState`, and fence retention. For `before_commit`, provider cleanup proof plus a fresh activation must append a replacement issuance chain while the top-level journal remains pending, then may advance only to committed cleanup or exact-N abort; for `after_commit`, it advances only to `rotation_committed_cleanup_pending`. A later injected provider-owner recovery must delete/read back absent the exact one-use key/installation, provide canonical proof bound to the same rotation/issuance chain, and require a fresh bootstrap activation. One-hour token expiry alone never advances the journal.

Run and observe RED for precommit loss first, implement it, rerun; then repeat RED/GREEN for postcommit loss.

- [ ] **Step 7: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-contract.test.mjs server/tests/control-plane-bootstrap-store.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-updater.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit rotation**

```bash
git add server/services/deployment/control-plane-bootstrap-state-machine.mjs server/services/deployment/control-plane-bootstrap-store.mjs server/services/deployment/control-plane-bootstrap-updater.mjs scripts/control-plane-bootstrap-root.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-updater.test.mjs
git commit -m "feat: close control-plane bootstrap rotation"
```

---

### Task 8: Sealed-descriptor OpenSSH transport and strict known-hosts contract

**Files:**
- Modify: `server/services/deployment/control-plane-transport-contract.mjs`
- Create: `ops/control-plane-deploy/native/src/secure-ssh-transport.c`
- Modify: `ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json`
- Modify: `ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json`
- Create: `server/tests/control-plane-transport-contract.test.mjs`
- Create: `server/tests/control-plane-transport-redaction.test.mjs`
- Create: `server/tests/fixtures/control-plane-fixed-credential.mjs`

**Interfaces:**
- Export `DEPLOY_CREDENTIAL_ID`, `BOOTSTRAP_CREDENTIAL_ID`, `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS`, `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS`, `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, `FIXED_CREDENTIAL_MATERIAL_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_CONTRACT`, `TRANSPORT_FAILURE_DIAGNOSTIC_CODES`, `encodeBootstrapActivationReadyFrame({ requestId, activationId })`, `validateBootstrapActivationReadyFrame(bytes, expected)`, `createFixedCredentialExpectation(input)`, `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, `assertKnownHostsRecordExpectation({ binding, material })`, `validateFixedCredentialMaterial(material, expectation)`, `validateTransportEnvelope(envelope)`, `createConnectionFrame({ host, port })`, and `createSecureSshTransport({ native, clock, secretMaterializer })`. The three activation timing constants are exactly `900000`, `910000`, and `925000` milliseconds respectively and are the sole source for launcher, relay/source cross-test, and controller request bounds. The ready encoder accepts exact `bar1.<64-lower-hex>` request and `ba1.<64-lower-hex>` activation IDs and emits the canonical LF-terminated exact ordered fields `type`, `requestId`, `activationId` with fixed `type="bootstrap_activation_ready_v1"`; the validator byte-compares both expected IDs, accepts no extra/alternate field, and returns only that frozen safe value. The two credential constants are exactly `japan-control-plane-github-deploy-v1` and `japan-control-plane-github-bootstrap-v1`; the frozen diagnostic set is exactly `ssh_authentication_failed`, `ssh_host_key_rejected`, `ssh_protocol_failed`, `ssh_timeout`, and `ssh_child_failed`.
- `FIXED_CREDENTIAL_MATERIAL_FIELDS` is exactly `credentialId`, `host`, `port`, `user`, `authorizationGeneration`, `bootstrapReceiptSha256`, `knownHostsFingerprint`, `knownHostsTupleSha256`, `expiresAt`, `privateKeyBytes`, and `knownHostsBytes`, in that order. `FIXED_CREDENTIAL_EXPECTATION_FIELDS` is exactly `credentialId`, `principal`, `authorizationGeneration`, `bootstrapReceiptSha256`, `knownHostsFingerprint`, `knownHostsTupleSha256`, `expiresAt`, and `observedAt`, in that order. `FIXED_CREDENTIAL_EXPECTATION_CONTRACT` is the sole closed in-memory expectation schema. `createFixedCredentialExpectation({ credentialId, authorizationGeneration, bootstrapReceiptSha256, knownHostsFingerprint, knownHostsTupleSha256, expiresAt, observedAt })` derives `principal` only from the two fixed credential IDs, validates the exact generation/receipt/known-host/time tuple, returns one frozen exact-eight-field value, and privately brands it. There is no caller-supplied `principal`, `user`, `now`, `expiresAfter`, host alias, raw expectation object, or alternate factory.
- `deriveKnownHostsBinding({ host, port, knownHostsBytes })` accepts exactly one LF-terminated `[host]:port ssh-ed25519 base64-key` record matching the supplied literal endpoint and port. It strict-decodes and canonical-re-encodes base64, parses the SSH wire blob as length-11 `ssh-ed25519` plus one length-32 public key and EOF, computes the `SHA256:` public fingerprint and complete tuple digest, and returns one privately branded frozen exact-four-field `{ host, port, knownHostsFingerprint, knownHostsTupleSha256 }`. `assertKnownHostsRecordExpectation({ binding, material })` accepts only that brand and byte-compares all four fields to the exact material. Every alternate syntax, noncanonical encoding, embedded type/length, endpoint, or digest rejects.
- `validateFixedCredentialMaterial(material, expectation)` accepts only an expectation branded by `createFixedCredentialExpectation`, requires all eleven material fields in exact order, derives and asserts the known-host binding again from the material bytes, and byte-compares the fixed ID/principal, generation, receipt, fingerprint, tuple, and expiry. It requires `observedAt < expiresAt`, a bounded future expiry, and owned nonempty non-aliased mutable Buffers; unknown keys, inherited prototypes, accessors/symbols, aliasing, expiration, raw/cloned expectation, or any mismatch rejects before spawn. Artifact and Receipt producer fixtures import these real exports and never copy either field list or construct an expectation literal. This is a private producer-to-transport custody interface, never a public operation argument or return value.
- `createSecureSshTransport({ native, clock, secretMaterializer })` returns exactly the five-method frozen object `{ execute, request, requestStatusBundle, requestBootstrap, close }`. `request({ credentialId, requestBytes, timeoutMs })` requires `DEPLOY_CREDENTIAL_ID` and uses the fixed deploy-principal one-response status executable; `requestStatusBundle({ credentialId, requestBytes, timeoutMs, consumeFrame })` requires `DEPLOY_CREDENTIAL_ID`, exact timeout `30000`, the fixed bundle-stream executable, and an owner-private frame consumer. `requestBootstrap({ credentialId, requestBytes, timeoutMs })` requires `BOOTSTRAP_CREDENTIAL_ID`, internally classifies only the exact canonical leading request type emitted by the two owner encoders, and uses the fixed ephemeral-bootstrap executable. Compatibility inventory requires the existing exact `timeoutMs=10000`, accepts exactly one non-ready response, and rejects a ready/second frame. Bootstrap activation requires exact `timeoutMs=BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, extracts only the bounded request/activation correlation IDs, reads exactly ready then terminal, validates and consumes the ready frame internally, and returns an outer envelope whose `responseBytes` contains only the final `bootstrap_activation_response_v1`; wrong/missing/partial/duplicate/cross-binding ready, terminal-first, third frame, EOF, timeout, or caller-selected alternate timeout closes the child and returns only the safe failure envelope. Neither request kind nor deadline is a caller selector: the canonical owner request bytes determine the branch and mismatch rejects before credential capture/spawn. `execute({ credentialId, authFrameBytes, expectedReady, artifactCapability, artifactSize })` requires `DEPLOY_CREDENTIAL_ID` and uses the fixed deploy-principal two-phase executable. `expectedReady` is the exact frozen six-field controller value `{ transactionId, productionGateReceiptSha256, deploymentPlanSha256, authorizationRecordSha256, artifactSize, artifactSha256 }`; transport calls the real ready encoder internally and seals those exact expected bytes for the native byte comparison. The first operation fixes the transport to that one credential ID for its lifetime, runs the complete capability probe, and invokes `secretMaterializer.materializeFixedCredential(credentialId)` exactly once. That call returns one frozen exact-key `{ material, expectation }` capture: `material` is the exact eleven-field object and `expectation` is the brand returned by `createFixedCredentialExpectation`. Transport calls `validateFixedCredentialMaterial(material, expectation)`, seals connection/private-key/known-hosts originals, proves the sealed originals and their digests, and only then zeroes every materializer-owned Buffer in the capture operation's outermost `finally`. A raw material return or expectation literal rejects. Materialization is not a destructive one-shot environment read; the protected producer retains its sealed source until capture succeeds or fails, and every failure zeroes both sides. Later operations cannot switch credential families. Each operation reads owned temporary bytes from those protected sealed originals, creates fresh per-operation sealed clones, and zeroes/closes/readbacks every clone in its outermost `finally`; execute, any number of polls, one terminal-bundle stream, both closeout requests, and the recovery requests therefore share no mutable request/key Buffer or child FD. `close()` is idempotent, zeroes any retained metadata Buffer, closes and proves absent every original FD, and permanently makes all four operation methods reject `transport_closed` before probing, materializing, cloning, or spawning. There is no `dispose` alias.
- Every operation returns one frozen outer `{ exitCode, responseBytes, diagnosticCode }`. `validateTransportEnvelope` accepts only a frozen ordinary object with exactly those three own keys and no symbols/accessors. Success is exactly `exitCode === 0`, an owned non-aliased response `Buffer` of at most 2,048 bytes, and `diagnosticCode === null`. Failure is exactly a bounded nonzero integer exit code, an empty owned response `Buffer`, and one member of `TRANSPORT_FAILURE_DIAGNOSTIC_CODES`; timeout/signal outcomes map to fixed nonzero exit codes before validation. Node cannot freeze a nonempty `Buffer`, so this contract never claims deep freezing of byte storage. No consumer may pass that envelope to a response validator or treat it as bytes; it must first call `validateTransportEnvelope`, then pass only a successful envelope's `responseBytes` to the exact codec. The bootstrap materializer resolves the sole armed, unexpired activation internally; no caller supplies an activation ID to select key material. A false/unknown probe is a program stop with materializer call count zero and no fallback. None of the public methods accepts username, host, port, profile, activation ID, executable/FD slot, private-key bytes, known-hosts bytes, or another protected value from its caller.
- The C executable reads fixed descriptor slots assigned internally by `spawnWithExactFileDescriptors`; callers cannot select a slot or executable path.

- [ ] **Step 1: Write failing known-hosts, descriptor, option, timeout, and redaction tests**

```js
test('known-hosts accepts one exact endpoint/port/ed25519 record', () => {
  const bytes = Buffer.from('[deploy.example.invalid]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJC\n');
  const binding = deriveKnownHostsBinding({
    host: 'deploy.example.invalid',
    port: 2222,
    knownHostsBytes: bytes,
  });
  assert.deepEqual(binding, {
    host: 'deploy.example.invalid',
    port: 2222,
    knownHostsFingerprint: 'SHA256:LgZpRzWEAbVvBimxTv69/UB88PD8jyOSDqfozr+iNX0',
    knownHostsTupleSha256: 'a28df72760b53a10add6a1f86d6007955dff3e45c605d9bcc71da4b3aa78d99c',
  });
  for (const invalid of [
    Buffer.from('@cert-authority [deploy.example.invalid]:2222 ssh-ed25519 AAAA\n'),
    Buffer.from('|1|hash|hash ssh-ed25519 AAAA\n'),
    Buffer.from('*.example.invalid ssh-ed25519 AAAA\n'),
    Buffer.from('[deploy.example.invalid]:2222,alias ssh-ed25519 AAAA\n'),
    Buffer.from('[deploy.example.invalid]:2222 ssh-rsa AAAA\n'),
    Buffer.from('[deploy.example.invalid]:2222 ssh-ed25519 AAAA\r\n'),
    Buffer.from('[deploy.example.invalid]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAHw==\n'),
    Buffer.from('[deploy.example.invalid]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ=\n'),
  ]) assert.throws(() => deriveKnownHostsBinding({
    host: 'deploy.example.invalid', port: 2222, knownHostsBytes: invalid,
  }));
});

test('credential producers conform to exact material and branded expectation ABIs', () => {
  assert.deepEqual(FIXED_CREDENTIAL_MATERIAL_FIELDS, [
    'credentialId', 'host', 'port', 'user', 'authorizationGeneration',
    'bootstrapReceiptSha256', 'knownHostsFingerprint',
    'knownHostsTupleSha256', 'expiresAt', 'privateKeyBytes', 'knownHostsBytes',
  ]);
  assert.deepEqual(FIXED_CREDENTIAL_EXPECTATION_FIELDS, [
    'credentialId', 'principal', 'authorizationGeneration',
    'bootstrapReceiptSha256', 'knownHostsFingerprint',
    'knownHostsTupleSha256', 'expiresAt', 'observedAt',
  ]);
  const material = validFixedCredentialMaterial();
  const expectation = createFixedCredentialExpectation(validCredentialExpectationInput(material));
  assert.strictEqual(validateFixedCredentialMaterial(material, expectation), material);
  assert.throws(() => validateFixedCredentialMaterial(material, Object.freeze({ ...expectation })), /credential_expectation_unverified/);
  for (const alias of ['user', 'principal', 'now', 'expiresAfter']) {
    assert.throws(() => createFixedCredentialExpectation({
      ...validCredentialExpectationInput(material), [alias]: 'forbidden',
    }), /credential_expectation_invalid/);
  }
  for (const mutation of credentialAbiMutations(material)) {
    assert.throws(() => validateFixedCredentialMaterial(mutation, expectation), /credential_material_invalid/);
  }
});

test('Artifact and Receipt consume the same real branded credential fixture', () => {
  for (const consumer of ['artifact', 'receipt']) {
    const capture = createRealFixedCredentialFixture({ consumer });
    assert.deepEqual(Object.keys(capture.material), FIXED_CREDENTIAL_MATERIAL_FIELDS);
    assert.deepEqual(Object.keys(capture.expectation), FIXED_CREDENTIAL_EXPECTATION_FIELDS);
    assert.strictEqual(validateFixedCredentialMaterial(capture.material, capture.expectation), capture.material);
  }
});

test('transport uses only closed executable, descriptors, and environment IDs', async () => {
  const calls = [];
  const transport = createSecureSshTransport(createTransportHarness({ calls }));
  const result = await transport.request(validTransportInput());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.diagnosticCode, null);
  assert.ok(Buffer.isBuffer(result.responseBytes));
  assert.ok(result.responseBytes.length <= 2_048);
  assert.deepEqual(calls.at(-1), {
    executableId: 'control-plane-ssh-deploy-status-v1',
    descriptorRoles: ['connection', 'identity', 'knownHosts', 'request', 'response', 'diagnostics'],
    environmentId: 'control-plane-ssh-clean-v1',
    timeoutMs: 10_000,
  });
});

test('transport response buffer is owned and does not alias native capture storage', async () => {
  const captureBytes = validStatusBytes();
  const transport = createSecureSshTransport(createTransportHarness({ calls: [], captureBytes }));
  const result = await transport.request(validTransportInput());
  assert.notStrictEqual(result.responseBytes, captureBytes);
  const accepted = Buffer.from(result.responseBytes);
  captureBytes.fill(0x78);
  assert.deepEqual(result.responseBytes, accepted);
});

test('transport result enforces disjoint success and failure envelopes', async () => {
  const transport = createSecureSshTransport(createTransportHarness({
    calls: [],
    childResult: { exitCode: 255, signal: null },
    captureBytes: validStatusBytes(),
    diagnosticBytes: Buffer.from('synthetic failure'),
    classifiedDiagnostic: 'ssh_authentication_failed',
  }));
  const failure = await transport.request(validTransportInput());
  assert.equal(failure.exitCode, 255);
  assert.deepEqual(failure.responseBytes, Buffer.alloc(0));
  assert.equal(failure.diagnosticCode, 'ssh_authentication_failed');
  for (const invalid of [
    { exitCode: 0, responseBytes: Buffer.alloc(0), diagnosticCode: 'ssh_child_failed' },
    { exitCode: 1, responseBytes: Buffer.alloc(0), diagnosticCode: null },
    { exitCode: 1, responseBytes: Buffer.from('not-empty'), diagnosticCode: 'ssh_child_failed' },
    { exitCode: 256, responseBytes: Buffer.alloc(0), diagnosticCode: 'ssh_child_failed' },
  ]) assert.throws(() => validateTransportEnvelope(Object.freeze(invalid)), /transport_envelope_invalid/);
});

test('native eligibility is proved before any protected value is materialized', async () => {
  const calls = [];
  const transport = createSecureSshTransport(createTransportHarness({ calls, capabilityEligible: false }));
  await assert.rejects(
    transport.request({ credentialId: 'japan-control-plane-github-deploy-v1', requestBytes: validStatusBytes(), timeoutMs: 10_000 }),
    /linux_capability_ineligible/,
  );
  assert.deepEqual(calls, ['native:probe_capabilities']);
});

test('public transport surface rejects raw secret and selector fields', async () => {
  const transport = createSecureSshTransport(createTransportHarness({ calls: [] }));
  for (const forbidden of ['host', 'port', 'user', 'activationId', 'privateKeyBytes', 'knownHostsBytes', 'executableId', 'inheritableFd']) {
    await assert.rejects(transport.request({
      credentialId: DEPLOY_CREDENTIAL_ID,
      requestBytes: validStatusBytes(),
      timeoutMs: 10_000,
      [forbidden]: 'synthetic-forbidden',
    }), /transport_request_unknown_field/);
  }
  await assert.rejects(transport.request({ credentialId: BOOTSTRAP_CREDENTIAL_ID, requestBytes: validStatusBytes(), timeoutMs: 10_000 }), /credential_id_mismatch/);
});

test('one sealed fixed credential serves many isolated operations until idempotent close', async () => {
  const calls = [];
  const clones = [];
  const transport = createSecureSshTransport(createTransportHarness({ calls, clones }));
  assert.deepEqual(Object.keys(transport), ['execute', 'request', 'requestStatusBundle', 'requestBootstrap', 'close']);
  await transport.execute(validExecuteInput());
  await transport.request(validTransportInput({ requestBytes: firstPollBytes }));
  await transport.request(validTransportInput({ requestBytes: uploadStartedBytes }));
  await transport.request(validTransportInput({ requestBytes: ackBytes }));
  await transport.request(validTransportInput({ requestBytes: finalPollBytes }));
  assert.equal(calls.filter((value) => value === 'native:probe_capabilities').length, 1);
  assert.equal(calls.filter((value) => value === `materialize:${DEPLOY_CREDENTIAL_ID}`).length, 1);
  assert.equal(clones.length, 5);
  for (const clone of clones) {
    assert.equal(clone.keyBytes.every((byte) => byte === 0), true);
    assert.equal(clone.knownHostsBytes.every((byte) => byte === 0), true);
    assert.equal(clone.requestBytes.every((byte) => byte === 0), true);
    assert.equal(clone.closedAndReadBack, true);
  }
  await transport.close();
  await transport.close();
  assert.equal(calls.filter((value) => value === 'originals:closed_and_readback').length, 1);
  await assert.rejects(transport.request(validTransportInput()), /transport_closed/);
  assert.equal(calls.at(-1), 'originals:closed_and_readback');
});

test('bootstrap activation timing constants and ready codec are exact', () => {
  assert.equal(BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS, 900_000);
  assert.equal(BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS, 910_000);
  assert.equal(BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS, 925_000);
  const expected = Object.freeze({
    requestId: `bar1.${'1'.repeat(64)}`,
    activationId: `ba1.${'2'.repeat(64)}`,
  });
  const ready = encodeBootstrapActivationReadyFrame(expected);
  assert.deepEqual(validateBootstrapActivationReadyFrame(ready, expected), {
    type: 'bootstrap_activation_ready_v1',
    requestId: expected.requestId,
    activationId: expected.activationId,
  });
});

test('bootstrap transport consumes owner-ready and returns only the final activation response', async () => {
  const calls = [];
  const transport = createSecureSshTransport(createTransportHarness({
    calls,
    bootstrapFrames: [validBootstrapActivationReadyFrame(), validBootstrapActivationFinalFrame()],
  }));
  const envelope = await transport.requestBootstrap({
    credentialId: BOOTSTRAP_CREDENTIAL_ID,
    requestBytes: validCanonicalBootstrapActivationRequestBytes(),
    timeoutMs: BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS,
  });
  assert.deepEqual(envelope.responseBytes, validBootstrapActivationFinalFrame());
  assert.equal(envelope.responseBytes.includes(Buffer.from('bootstrap_activation_ready_v1')), false);
  assert.deepEqual(calls.filter((call) => call.startsWith('bootstrap_frame:')), [
    'bootstrap_frame:ready_validate_and_consume',
    'bootstrap_frame:terminal_return',
  ]);
});

test('compatibility inventory stays one short bootstrap response and cannot emit ready', async () => {
  const transport = createSecureSshTransport(createTransportHarness({
    calls: [], bootstrapFrames: [validCompatibilityInventoryResponseFrame()],
  }));
  const envelope = await transport.requestBootstrap({
    credentialId: BOOTSTRAP_CREDENTIAL_ID,
    requestBytes: validCanonicalCompatibilityInventoryRequestBytes(),
    timeoutMs: 10_000,
  });
  assert.deepEqual(envelope.responseBytes, validCompatibilityInventoryResponseFrame());
  await assert.rejects(transport.requestBootstrap({
    credentialId: BOOTSTRAP_CREDENTIAL_ID,
    requestBytes: validCanonicalCompatibilityInventoryRequestBytes(),
    timeoutMs: BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS,
  }), /bootstrap_request_timeout_invalid/);
});

test('wrong activation phase frame or timeout fails closed before exposing response bytes', async () => {
  for (const fault of [
    'missing_ready', 'partial_ready', 'wrong_type', 'cross_request', 'cross_activation',
    'duplicate_ready', 'terminal_first', 'third_frame', 'eof_after_ready',
  ]) {
    const harness = createTransportHarness({ calls: [], bootstrapPhaseFault: fault });
    const transport = createSecureSshTransport(harness);
    const envelope = await transport.requestBootstrap(validBootstrapActivationTransportInput());
    assert.notEqual(envelope.exitCode, 0);
    assert.deepEqual(envelope.responseBytes, Buffer.alloc(0));
    assert.equal(envelope.diagnosticCode, 'ssh_protocol_failed');
    await transport.close();
  }
  const harness = createTransportHarness({ calls: [] });
  await assert.rejects(
    createSecureSshTransport(harness).requestBootstrap({
      ...validBootstrapActivationTransportInput(), timeoutMs: 910_000,
    }),
    /bootstrap_request_timeout_invalid/,
  );
  assert.equal(harness.calls.some((call) => call.startsWith('materialize:')), false);
});

test('capture proves sealed originals before producer zeroize and every operation uses a clone', async () => {
  const calls = [];
  const producerOwned = validFixedCredentialMaterial();
  const transport = createSecureSshTransport(createTransportHarness({ calls, producerOwned }));
  try {
    await transport.request(validTransportInput({ requestBytes: firstPollBytes }));
    await transport.request(validTransportInput({ requestBytes: finalPollBytes }));
  } finally {
    await transport.close();
  }
  assert.deepEqual(calls.slice(0, 6), [
    'native:probe_capabilities',
    `materialize:${DEPLOY_CREDENTIAL_ID}`,
    'credential:validate_exact_eleven_fields',
    'originals:seal_and_digest_readback',
    'producer_buffers:zeroize_outer_finally',
    'operation_clone:create',
  ]);
  assert.equal(producerOwned.privateKeyBytes.every((byte) => byte === 0), true);
  assert.equal(producerOwned.knownHostsBytes.every((byte) => byte === 0), true);
  assert.equal(calls.filter((entry) => entry === 'operation_clone:create').length, 2);
  assert.equal(calls.filter((entry) => entry === 'operation_clone:closed_and_zeroized').length, 2);
});

test('recovery uses two fresh requests from one capture and fixed ID cannot switch', async () => {
  const calls = [];
  const transport = createSecureSshTransport(createTransportHarness({ calls }));
  try {
    await transport.request(validTransportInput({ requestBytes: recoveryChallengeBytes }));
    await transport.request(validTransportInput({ requestBytes: recoveryStatusBytes }));
    await assert.rejects(transport.requestBootstrap(validBootstrapTransportInput()), /credential_id_mismatch/);
  } finally {
    await transport.close();
  }
  assert.equal(calls.filter((value) => value === `materialize:${DEPLOY_CREDENTIAL_ID}`).length, 1);
  assert.equal(calls.filter((value) => value === 'operation_clone:closed_and_zeroized').length, 2);
});

test('transport envelope rejects inherited, extra, accessor, symbol, and illegal success diagnostics', () => {
  const responseBytes = Buffer.from('{}\n');
  const valid = Object.freeze({ exitCode: 0, responseBytes, diagnosticCode: null });
  assert.equal(validateTransportEnvelope(valid), valid);
  for (const invalid of [
    Object.freeze(Object.assign(Object.create({ inherited: true }), valid)),
    Object.freeze({ ...valid, extra: true }),
    Object.freeze(Object.defineProperty({ exitCode: 0, responseBytes }, 'diagnosticCode', { get: () => null })),
    Object.freeze(Object.assign({ ...valid }, { [Symbol('extra')]: true })),
    Object.freeze({ ...valid, diagnosticCode: 'ssh_child_failed' }),
  ]) assert.throws(() => validateTransportEnvelope(invalid), /transport_envelope_invalid/);
});
```

`server/tests/fixtures/control-plane-fixed-credential.mjs` is the only test fixture for this custody boundary. Its `createRealFixedCredentialFixture({ consumer })` accepts only `artifact` or `receipt`, constructs the real eleven-field material, derives the real known-host binding, and calls the production `createFixedCredentialExpectation`; it never exports a brand constructor or literal expectation. Artifact and Receipt conformance tests import this exact file and call the real `validateFixedCredentialMaterial`, so a copied field list, unbranded clone, `user`/`expiresAfter` variant, or host-key omission cannot pass.

In the same RED batch, enumerate the expected child descriptor set and every literal SSH disable option; add timeout/signal, malformed/oversized response, bounded-diagnostics, close-before-first-use, close-during-failure, cleanup-failure, materializer exact-key/prototype/alias/expiry tests, native-profile/source/fragment digest, all-Bootstrap-standalone-target, all fixed-executable-profile, unchanged-public-ABI, and synthetic-secret redaction cases. The first run must fail because the module/source/registry entries are absent, not because the test is skipped.

- [ ] **Step 2: Run transport tests and verify RED**

Run: `node --test server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs`

Expected: FAIL because Task 5's constants-only transport owner does not yet export the credential/ready/transport surfaces and the native source is missing.

- [ ] **Step 3: Implement strict parsing and sealed descriptor orchestration**

```js
import { createHash } from 'node:crypto';
import { sha256Hex } from './canonical-json.mjs';

function assertExactPlainOwnDataFields(value, fields, errorCode) {
  if (value === null || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== fields.length
      || Object.keys(value).some((key, index) => key !== fields[index])
      || Object.values(Object.getOwnPropertyDescriptors(value)).some(
        (descriptor) => descriptor.get || descriptor.set,
      )) {
    throw new Error(errorCode);
  }
}

export const FIXED_CREDENTIAL_MATERIAL_FIELDS = Object.freeze([
  'credentialId', 'host', 'port', 'user', 'authorizationGeneration',
  'bootstrapReceiptSha256', 'knownHostsFingerprint',
  'knownHostsTupleSha256', 'expiresAt', 'privateKeyBytes', 'knownHostsBytes',
]);

export const FIXED_CREDENTIAL_EXPECTATION_FIELDS = Object.freeze([
  'credentialId', 'principal', 'authorizationGeneration',
  'bootstrapReceiptSha256', 'knownHostsFingerprint',
  'knownHostsTupleSha256', 'expiresAt', 'observedAt',
]);

const EXPECTATION_INPUT_FIELDS = Object.freeze([
  'credentialId', 'authorizationGeneration', 'bootstrapReceiptSha256',
  'knownHostsFingerprint', 'knownHostsTupleSha256', 'expiresAt', 'observedAt',
]);
const FIXED_PRINCIPALS = Object.freeze({
  [DEPLOY_CREDENTIAL_ID]: 'github-control-deploy',
  [BOOTSTRAP_CREDENTIAL_ID]: 'github-control-bootstrap',
});
const brandedCredentialExpectations = new WeakSet();
const brandedKnownHostsBindings = new WeakSet();

export const FIXED_CREDENTIAL_EXPECTATION_CONTRACT = Object.freeze({
  schemaId: 'fixed-credential-expectation-v1',
  maxBytes: 2_048,
  fieldOrder: FIXED_CREDENTIAL_EXPECTATION_FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    const observed = Date.parse(value.observedAt);
    const expires = Date.parse(value.expiresAt);
    if (FIXED_PRINCIPALS[value.credentialId] !== value.principal
        || !Number.isSafeInteger(value.authorizationGeneration)
        || value.authorizationGeneration < 1
        || !/^[0-9a-f]{64}$/.test(value.bootstrapReceiptSha256)
        || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(value.knownHostsFingerprint)
        || !/^[0-9a-f]{64}$/.test(value.knownHostsTupleSha256)
        || !Number.isFinite(observed) || !Number.isFinite(expires)
        || expires <= observed || expires - observed > 900_000) {
      throw new Error('credential_expectation_invalid');
    }
  },
});

export function createFixedCredentialExpectation(input) {
  assertExactPlainOwnDataFields(input, EXPECTATION_INPUT_FIELDS, 'credential_expectation_invalid');
  const value = Object.freeze({
    credentialId: input.credentialId,
    principal: FIXED_PRINCIPALS[input.credentialId],
    authorizationGeneration: input.authorizationGeneration,
    bootstrapReceiptSha256: input.bootstrapReceiptSha256,
    knownHostsFingerprint: input.knownHostsFingerprint,
    knownHostsTupleSha256: input.knownHostsTupleSha256,
    expiresAt: input.expiresAt,
    observedAt: input.observedAt,
  });
  FIXED_CREDENTIAL_EXPECTATION_CONTRACT.validate(value);
  assertExactPlainOwnDataFields(value, FIXED_CREDENTIAL_EXPECTATION_FIELDS, 'credential_expectation_invalid');
  brandedCredentialExpectations.add(value);
  return value;
}

function parseExactKnownHostsRecord({ host, port, knownHostsBytes }) {
  if (typeof host !== 'string' || host.length < 1 || host.length > 253
      || /[\x00-\x20\x7f\]\\`$;&|<>]/.test(host) || host.startsWith('-')
      || !Number.isSafeInteger(port) || port < 1 || port > 65_535
      || !Buffer.isBuffer(knownHostsBytes) || knownHostsBytes.length < 1
      || knownHostsBytes.length > 1_024) {
    throw new Error('known_hosts_record_invalid');
  }
  const prefix = `[${host}]:${port} ssh-ed25519 `;
  const text = knownHostsBytes.toString('ascii');
  if (!knownHostsBytes.equals(Buffer.from(text, 'ascii')) || !text.startsWith(prefix)
      || !text.endsWith('\n') || text.slice(0, -1).includes('\n') || text.includes('\r')) {
    throw new Error('known_hosts_record_invalid');
  }
  const encoded = text.slice(prefix.length, -1);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('known_hosts_record_invalid');
  }
  const blob = Buffer.from(encoded, 'base64');
  try {
    if (blob.toString('base64') !== encoded || blob.length !== 51
        || blob.readUInt32BE(0) !== 11
        || blob.subarray(4, 15).toString('ascii') !== 'ssh-ed25519'
        || blob.readUInt32BE(15) !== 32 || 19 + blob.readUInt32BE(15) !== blob.length) {
      throw new Error('known_hosts_record_invalid');
    }
    return Object.freeze({
      fingerprint: `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`,
      tupleSha256: sha256Hex(knownHostsBytes),
    });
  } finally {
    blob.fill(0);
  }
}

export function deriveKnownHostsBinding(input) {
  assertExactPlainOwnDataFields(input, ['host', 'port', 'knownHostsBytes'], 'known_hosts_record_invalid');
  const { host, port, knownHostsBytes } = input;
  const parsed = parseExactKnownHostsRecord({ host, port, knownHostsBytes });
  const binding = Object.freeze({
    host,
    port,
    knownHostsFingerprint: parsed.fingerprint,
    knownHostsTupleSha256: parsed.tupleSha256,
  });
  brandedKnownHostsBindings.add(binding);
  return binding;
}

export function assertKnownHostsRecordExpectation(input) {
  assertExactPlainOwnDataFields(input, ['binding', 'material'], 'known_hosts_binding_mismatch');
  const { binding, material } = input;
  if (!brandedKnownHostsBindings.has(binding)
      || binding.host !== material.host || binding.port !== material.port
      || binding.knownHostsFingerprint !== material.knownHostsFingerprint
      || binding.knownHostsTupleSha256 !== material.knownHostsTupleSha256) {
    throw new Error('known_hosts_binding_mismatch');
  }
  return binding;
}

export function validateFixedCredentialMaterial(material, expectation) {
  if (!brandedCredentialExpectations.has(expectation)) {
    throw new Error('credential_expectation_unverified');
  }
  assertExactPlainOwnDataFields(material, FIXED_CREDENTIAL_MATERIAL_FIELDS, 'credential_material_invalid');
  if (material.credentialId !== expectation.credentialId
      || material.user !== expectation.principal
      || material.authorizationGeneration !== expectation.authorizationGeneration
      || material.bootstrapReceiptSha256 !== expectation.bootstrapReceiptSha256
      || material.knownHostsFingerprint !== expectation.knownHostsFingerprint
      || material.knownHostsTupleSha256 !== expectation.knownHostsTupleSha256
      || material.expiresAt !== expectation.expiresAt
      || !Buffer.isBuffer(material.privateKeyBytes) || material.privateKeyBytes.length < 1
      || !Buffer.isBuffer(material.knownHostsBytes) || material.knownHostsBytes.length < 1
      || material.privateKeyBytes === material.knownHostsBytes) {
    throw new Error('credential_material_invalid');
  }
  const binding = deriveKnownHostsBinding({
    host: material.host,
    port: material.port,
    knownHostsBytes: material.knownHostsBytes,
  });
  assertKnownHostsRecordExpectation({ binding, material });
  return material;
}

function closeEveryResource(resources) {
  let failed = false;
  for (const resource of resources) {
    try { resource.close(); } catch { failed = true; }
  }
  if (failed) throw new Error('transport_resource_close_failed');
}

export const TRANSPORT_FAILURE_DIAGNOSTIC_CODES = Object.freeze([
  'ssh_authentication_failed',
  'ssh_host_key_rejected',
  'ssh_protocol_failed',
  'ssh_timeout',
  'ssh_child_failed',
]);

export function validateTransportEnvelope(envelope) {
  if (Object.getPrototypeOf(envelope) !== Object.prototype || !Object.isFrozen(envelope)
      || Reflect.ownKeys(envelope).length !== 3
      || Object.keys(envelope).join(',') !== 'exitCode,responseBytes,diagnosticCode'
      || Object.values(Object.getOwnPropertyDescriptors(envelope)).some((descriptor) => descriptor.get || descriptor.set)
      || !Number.isSafeInteger(envelope.exitCode)
      || envelope.exitCode < 0 || envelope.exitCode > 255
      || !Buffer.isBuffer(envelope.responseBytes) || envelope.responseBytes.length > 2_048) {
    throw new Error('transport_envelope_invalid');
  }
  const success = envelope.exitCode === 0;
  if ((success && envelope.diagnosticCode !== null)
      || (!success && (envelope.responseBytes.length !== 0
        || !TRANSPORT_FAILURE_DIAGNOSTIC_CODES.includes(envelope.diagnosticCode)))) {
    throw new Error('transport_envelope_invalid');
  }
  return envelope;
}

async function requestSecureSsh(input, native, executableId) {
  const resources = [];
  let diagnosticBytes;
  try {
    if (!['control-plane-ssh-deploy-status-v1', 'control-plane-ssh-bootstrap-status-v1'].includes(executableId)) {
      throw new Error('ssh_request_profile_invalid');
    }
    const bootstrapRequest = executableId === 'control-plane-ssh-bootstrap-status-v1'
      ? classifyOwnerBootstrapRequestBytes(input.requestBytes) : null;
    const requiredTimeoutMs = bootstrapRequest?.kind === 'bootstrap_activation'
      ? BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS : 10_000;
    if (bootstrapRequest !== null && input.timeoutMs !== requiredTimeoutMs) {
      throw new Error('bootstrap_request_timeout_invalid');
    }
    const knownHostsBinding = deriveKnownHostsBinding({
      host: input.host,
      port: input.port,
      knownHostsBytes: input.knownHostsBytes,
    });
    assertKnownHostsRecordExpectation({ binding: knownHostsBinding, material: input });
    const connection = native.createSealedMemfd({ label: 'connection-v1', bytes: createConnectionFrame(input), inheritableFd: 3 });
    resources.push(connection);
    const identity = native.createSealedMemfd({ label: 'identity-v1', bytes: input.privateKeyBytes, inheritableFd: 4 });
    resources.push(identity);
    const knownHosts = native.createSealedMemfd({ label: 'known-hosts-v1', bytes: input.knownHostsBytes, inheritableFd: 5 });
    resources.push(knownHosts);
    const request = native.createSealedMemfd({ label: 'request-v1', bytes: input.requestBytes, inheritableFd: 6 });
    resources.push(request);
    const response = native.createBoundedCapture({
      label: 'response-v1',
      maxBytes: bootstrapRequest?.kind === 'bootstrap_activation' ? 4_096 : 2_048,
      inheritableFd: 1,
    });
    resources.push(response);
    const diagnostics = native.createBoundedCapture({ label: 'diagnostics-v1', maxBytes: 2_048, inheritableFd: 2 });
    resources.push(diagnostics);
    const result = await native.spawnWithExactFileDescriptors({
      executableId,
      descriptors: [
        { sourceFd: connection.fd, childFd: 3 },
        { sourceFd: identity.fd, childFd: 4 },
        { sourceFd: knownHosts.fd, childFd: 5 },
        { sourceFd: request.fd, childFd: 6 },
        { sourceFd: response.writeFd, childFd: 1 },
        { sourceFd: diagnostics.writeFd, childFd: 2 },
      ],
      environmentId: 'control-plane-ssh-clean-v1',
      timeoutMs: bootstrapRequest !== null
        ? requiredTimeoutMs : Math.min(input.timeoutMs, 30_000),
    });
    let responseBytes = Buffer.from(response.readAll());
    diagnosticBytes = diagnostics.readAll();
    const exitCode = normalizeBoundedSshExit(result);
    let diagnosticCode = null;
    if (exitCode === 0 && bootstrapRequest !== null) {
      const capturedBootstrapBytes = responseBytes;
      try {
        responseBytes = consumeValidatedBootstrapResponseFrames({
          responseBytes: capturedBootstrapBytes,
          bootstrapRequest,
        });
      } finally {
        capturedBootstrapBytes.fill(0);
      }
    } else if (exitCode !== 0) {
      responseBytes.fill(0);
      responseBytes = Buffer.alloc(0);
      diagnosticCode = classifyAndDiscardSshDiagnostics(result, diagnosticBytes);
    }
    return validateTransportEnvelope(Object.freeze({ exitCode, responseBytes, diagnosticCode }));
  } finally {
    diagnosticBytes?.fill(0);
    input.privateKeyBytes.fill(0);
    input.knownHostsBytes.fill(0);
    input.requestBytes.fill(0);
    closeEveryResource(resources.reverse());
  }
}
```

`requestSecureSsh` receives only a per-operation clone created by the factory; it never receives or closes the retained originals. The factory implementation is a closed state machine `uninitialized -> open -> closing -> closed`. Its private `ensureCredential(credentialId)` probes once, calls only `secretMaterializer.materializeFixedCredential(credentialId)`, requires exact capture keys `material,expectation`, validates the eleven-field material against the branded eight-field expectation, seals three originals, records their exact lengths/digests, then zeroes all materializer buffers in an outermost `finally`. Its private `cloneCredentialForOperation()` uses positional reads of the retained sealed FDs into fixed-size owned Buffers, verifies their digests, creates new sealed memfds, and zeroes the read buffers immediately; no unsealed byte survives the call. A serialized operation mutex prevents `close()` racing a clone/spawn and prevents parallel children from sharing any FD or request storage. `.request` fixes `control-plane-ssh-deploy-status-v1`, `.requestStatusBundle` fixes `control-plane-ssh-deploy-status-bundle-v1`, `.requestBootstrap` fixes `control-plane-ssh-bootstrap-status-v1`, and `.execute` fixes `control-plane-ssh-deploy-execute-v1`; a successful `.execute().responseBytes` is only the exact `artifact_accepted_v1` response, while terminality is learned only through a later independent `.request()` status poll. The bundle method sends one request, incrementally validates at most 342 LF frames of at most 2,048 bytes each through its private consumer, never concatenates raw transport output, and returns only the ordinary fixed success/failure envelope with an empty `responseBytes`; the assembled bundle is owned by `readTerminalBundleBytes`. Bootstrap native mode likewise incrementally bounds complete LF frames instead of concatenating them: inventory admits exactly one frame; activation admits exactly two, passes the first only through the private ready validator, zeroes it immediately, and copies only the second into the successful envelope. Its wall timeout is the exact request-type-derived 10,000 or 925,000 milliseconds; SSH timeout and kill/cleanup margins remain inside the fixed 930-second unit lifetime, while the server-side relay expires first at 910 seconds after ready. In each operation's `finally`, every cloned handle is best-effort closed, every temporary Buffer is overwritten, `/proc/self/fd/<n>` absence is read back for each former descriptor, and any cleanup failure changes the result to the fixed safe failure envelope. `close()` takes the same mutex, performs that sequence once for the retained originals, overwrites retained connection-frame metadata, and caches only the closed state; repeated calls are no-ops. `control-plane-transport-contract.test.mjs` exports a shared consumer conformance fixture used by Artifact, Receipt/Recovery, and Source Integration to prove the real expectation/binding/material lifecycle, success/failure invariant, envelope-vs-`responseBytes` handling, single-session bundle stream, owner-internal bootstrap ready/terminal handling, and rejection of any direct validator call on the envelope.

The native foundation verifies `MFD_CLOEXEC | MFD_ALLOW_SEALING` creation and `F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL`. The exact-FD spawn adapter clears close-on-exec only for its internal allowlisted child slots and closes every unrelated descriptor.

- [ ] **Step 4: Implement the fixed C OpenSSH wrapper**

```c
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

enum { FD_CONNECTION = 3, FD_IDENTITY = 4, FD_KNOWN_HOSTS = 5, FD_REQUEST = 6, FD_ARTIFACT = 7, FD_EXPECTED_READY = 8, FD_EXECUTION_CONTROL = 9 };
enum { MAX_REQUEST = 65536, MAX_RESPONSE = 2048, MAX_ARTIFACT = 268435456 };

static long long monotonic_milliseconds(void) {
    struct timespec value;
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return -1;
    return (long long)value.tv_sec * 1000LL + value.tv_nsec / 1000000LL;
}

static int read_exact(int fd, void *buffer, size_t length) {
    unsigned char *cursor = buffer;
    while (length > 0) {
        ssize_t count = read(fd, cursor, length);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return -1;
        cursor += (size_t)count;
        length -= (size_t)count;
    }
    return 0;
}

static int write_exact(int fd, const void *buffer, size_t length) {
    const unsigned char *cursor = buffer;
    while (length > 0) {
        ssize_t count = write(fd, cursor, length);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return -1;
        cursor += (size_t)count;
        length -= (size_t)count;
    }
    return 0;
}

static int read_bounded_to_eof(int fd, unsigned char *buffer, size_t maximum, size_t *length) {
    size_t used = 0;
    for (;;) {
        unsigned char byte;
        ssize_t count = read(fd, used < maximum ? buffer + used : &byte, used < maximum ? maximum - used : 1);
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) return -1;
        if (count == 0) {
            *length = used;
            return 0;
        }
        if (used == maximum) return -1;
        used += (size_t)count;
    }
}

static int poll_one(int fd, short events, int diagnostics_fd, long long deadline) {
    for (;;) {
        long long now = monotonic_milliseconds();
        if (now < 0 || now >= deadline) return -2;
        int remaining = (int)(deadline - now);
        struct pollfd descriptors[2] = {
            { .fd = fd, .events = events, .revents = 0 },
            { .fd = diagnostics_fd, .events = POLLIN, .revents = 0 },
        };
        int count = poll(descriptors, 2, remaining);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return count == 0 ? -2 : -1;
        if (descriptors[1].revents & (POLLIN | POLLHUP)) {
            unsigned char discard[512];
            while (read(diagnostics_fd, discard, sizeof discard) > 0) { }
        }
        if (descriptors[0].revents & (events | POLLHUP)) return 0;
        if (descriptors[0].revents & (POLLERR | POLLNVAL)) return -1;
    }
}

static int write_with_deadline(int fd, const unsigned char *buffer, size_t length,
                               int diagnostics_fd, long long deadline) {
    while (length > 0) {
        int ready = poll_one(fd, POLLOUT, diagnostics_fd, deadline);
        if (ready != 0) return ready;
        ssize_t count = write(fd, buffer, length);
        if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (count <= 0) return -1;
        buffer += (size_t)count;
        length -= (size_t)count;
    }
    return 0;
}

static int read_frame_with_deadline(int fd, unsigned char *buffer, size_t maximum,
                                    size_t *length, int diagnostics_fd, long long deadline) {
    size_t used = 0;
    while (used < maximum) {
        int ready = poll_one(fd, POLLIN, diagnostics_fd, deadline);
        if (ready != 0) return ready;
        ssize_t count = read(fd, buffer + used, 1);
        if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (count <= 0) return -1;
        used += 1;
        if (buffer[used - 1] == '\n') {
            *length = used;
            return 0;
        }
    }
    return -1;
}

static int read_response_to_eof(int fd, unsigned char *buffer, size_t maximum,
                                size_t *length, int diagnostics_fd, long long deadline) {
    size_t used = 0;
    for (;;) {
        int ready = poll_one(fd, POLLIN, diagnostics_fd, deadline);
        if (ready == -2) return -2;
        if (ready != 0) return -1;
        unsigned char overflow;
        ssize_t count = read(fd, used < maximum ? buffer + used : &overflow,
                             used < maximum ? maximum - used : 1);
        if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (count < 0) return -1;
        if (count == 0) {
            *length = used;
            return used == 0 || buffer[used - 1] != '\n' ? -1 : 0;
        }
        if (used == maximum) return -1;
        used += (size_t)count;
    }
}

static int stream_response_frames_to_eof(int fd, int diagnostics_fd, long long deadline) {
    unsigned char frame[MAX_RESPONSE];
    size_t frame_length = 0;
    unsigned int frame_count = 0;
    for (;;) {
        int ready = poll_one(fd, POLLIN, diagnostics_fd, deadline);
        if (ready == -2) return -2;
        if (ready != 0) return -1;
        unsigned char byte;
        ssize_t count = read(fd, &byte, 1);
        if (count < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (count < 0) return -1;
        if (count == 0) {
            memset(frame, 0, sizeof frame);
            return frame_count > 0 && frame_length == 0 ? 0 : -1;
        }
        if (frame_length >= sizeof frame) return -1;
        frame[frame_length++] = byte;
        if (byte == '\n') {
            frame_count += 1;
            if (frame_count > 342
                || write_with_deadline(STDOUT_FILENO, frame, frame_length,
                                       diagnostics_fd, deadline) != 0) return -1;
            memset(frame, 0, frame_length);
            frame_length = 0;
        }
    }
}

static uint64_t decode_u64_be(const unsigned char bytes[8]) {
    uint64_t value = 0;
    for (size_t index = 0; index < 8; index += 1) value = (value << 8) | bytes[index];
    return value;
}

static int allowed_host_byte(unsigned char value) {
    return isalnum(value) || value == '.' || value == '-' || value == ':';
}

static int read_connection_frame(int fd, char *host, size_t host_size, char *port, size_t port_size) {
    uint8_t host_length = 0;
    uint16_t network_port = 0;
    unsigned char trailing = 0;
    if (read_exact(fd, &host_length, sizeof host_length) != 0) return -1;
    if (host_length == 0 || (size_t)host_length >= host_size) return -1;
    if (read_exact(fd, host, host_length) != 0) return -1;
    host[host_length] = '\0';
    if (host[0] == '-') return -1;
    for (size_t index = 0; index < host_length; index += 1) {
        if (!allowed_host_byte((unsigned char)host[index])) return -1;
    }
    if (read_exact(fd, &network_port, sizeof network_port) != 0) return -1;
    unsigned int host_port = ntohs(network_port);
    if (host_port == 0 || snprintf(port, port_size, "%u", host_port) >= (int)port_size) return -1;
    ssize_t extra = read(fd, &trailing, sizeof trailing);
    if (extra < 0 && errno == EINTR) extra = read(fd, &trailing, sizeof trailing);
    return extra == 0 ? 0 : -1;
}

static int spawn_fixed_ssh(char *const ssh_argv[], char *const envp[],
                           int child_input[2], int child_output[2], int child_diagnostics[2],
                           pid_t *child) {
    if (pipe2(child_input, O_CLOEXEC) != 0 || pipe2(child_output, O_CLOEXEC) != 0
        || pipe2(child_diagnostics, O_CLOEXEC | O_NONBLOCK) != 0) return -1;
    posix_spawn_file_actions_t actions;
    if (posix_spawn_file_actions_init(&actions) != 0) return -1;
    int result = posix_spawn_file_actions_adddup2(&actions, child_input[0], STDIN_FILENO)
        || posix_spawn_file_actions_adddup2(&actions, child_output[1], STDOUT_FILENO)
        || posix_spawn_file_actions_adddup2(&actions, child_diagnostics[1], STDERR_FILENO)
        || posix_spawn_file_actions_addclose(&actions, FD_CONNECTION)
        || posix_spawn_file_actions_addclosefrom_np(&actions, FD_REQUEST);
    if (result == 0) result = posix_spawn(child, "/usr/bin/ssh", &actions, NULL, ssh_argv, envp);
    posix_spawn_file_actions_destroy(&actions);
    if (result != 0) return -1;
    close(child_input[0]);
    close(child_output[1]);
    close(child_diagnostics[1]);
    return 0;
}

static int wait_child(pid_t child, int diagnostics_fd, long long deadline) {
    for (;;) {
        int status = 0;
        pid_t result = waitpid(child, &status, WNOHANG);
        if (result == child) {
            if (WIFEXITED(status)) return WEXITSTATUS(status);
            return 255;
        }
        if (result < 0 && errno != EINTR) return 255;
        unsigned char discard[512];
        while (read(diagnostics_fd, discard, sizeof discard) > 0) { }
        if (monotonic_milliseconds() >= deadline) {
            kill(child, SIGKILL);
            while (waitpid(child, &status, 0) < 0 && errno == EINTR) { }
            return 124;
        }
        struct timespec pause = { .tv_sec = 0, .tv_nsec = 10000000 };
        nanosleep(&pause, NULL);
    }
}

static int copy_artifact(int child_stdin, int diagnostics_fd, long long deadline) {
    unsigned char encoded_size[8];
    unsigned char trailing;
    if (read_exact(FD_EXECUTION_CONTROL, encoded_size, sizeof encoded_size) != 0) return -1;
    ssize_t extra = read(FD_EXECUTION_CONTROL, &trailing, 1);
    if (extra < 0 && errno == EINTR) extra = read(FD_EXECUTION_CONTROL, &trailing, 1);
    if (extra != 0) return -1;
    uint64_t remaining = decode_u64_be(encoded_size);
    if (remaining == 0 || remaining > MAX_ARTIFACT) return -1;
    unsigned char block[65536];
    while (remaining > 0) {
        size_t requested = remaining < sizeof block ? (size_t)remaining : sizeof block;
        ssize_t count = read(FD_ARTIFACT, block, requested);
        if (count < 0 && errno == EINTR) continue;
        if (count <= 0) return -1;
        if (write_with_deadline(child_stdin, block, (size_t)count, diagnostics_fd, deadline) != 0) return -1;
        memset(block, 0, (size_t)count);
        remaining -= (uint64_t)count;
    }
    ssize_t artifact_extra = read(FD_ARTIFACT, &trailing, 1);
    if (artifact_extra < 0 && errno == EINTR) artifact_extra = read(FD_ARTIFACT, &trailing, 1);
    return artifact_extra == 0 ? 0 : -1;
}

static int run_fixed_ssh_protocol(char *const ssh_argv[], char *const envp[], const char *protocol_mode,
                                  int request_fd, int artifact_fd, int expected_ready_fd,
                                  int execution_control_fd) {
    if (artifact_fd != FD_ARTIFACT || expected_ready_fd != FD_EXPECTED_READY
        || execution_control_fd != FD_EXECUTION_CONTROL) return 64;
    unsigned char request[MAX_REQUEST];
    size_t request_length = 0;
    if (read_bounded_to_eof(request_fd, request, sizeof request, &request_length) != 0
        || request_length == 0 || request[request_length - 1] != '\n') return 64;

    int child_input[2] = { -1, -1 };
    int child_output[2] = { -1, -1 };
    int child_diagnostics[2] = { -1, -1 };
    pid_t child = -1;
    if (spawn_fixed_ssh(ssh_argv, envp, child_input, child_output, child_diagnostics, &child) != 0) return 70;
    long long now = monotonic_milliseconds();
    long long deadline = now + (strcmp(protocol_mode, "execute") == 0
        ? 300000LL : strcmp(protocol_mode, "status-bundle") == 0
        ? 30000LL : strcmp(protocol_mode, "bootstrap") == 0
        ? 925000LL : 15000LL);
    int outcome = 70;
    unsigned char response[MAX_RESPONSE];
    size_t response_length = 0;
    if (write_with_deadline(child_input[1], request, request_length, child_diagnostics[0], deadline) != 0) goto finish;
    memset(request, 0, request_length);

    if (strcmp(protocol_mode, "execute") == 0) {
        unsigned char expected[MAX_RESPONSE];
        size_t expected_length = 0;
        if (read_bounded_to_eof(expected_ready_fd, expected, sizeof expected, &expected_length) != 0
            || expected_length == 0 || expected[expected_length - 1] != '\n') goto finish;
        if (read_frame_with_deadline(child_output[0], response, sizeof response, &response_length,
                                     child_diagnostics[0], deadline) != 0
            || response_length != expected_length
            || memcmp(response, expected, expected_length) != 0) {
            memset(expected, 0, expected_length);
            goto finish;
        }
        memset(expected, 0, expected_length);
        memset(response, 0, response_length);
        if (copy_artifact(child_input[1], child_diagnostics[0], deadline) != 0) goto finish;
    } else if (strcmp(protocol_mode, "status") != 0
               && strcmp(protocol_mode, "status-bundle") != 0
               && strcmp(protocol_mode, "bootstrap") != 0) {
        goto finish;
    }
    if (close(child_input[1]) != 0) goto finish;
    child_input[1] = -1;
    if (strcmp(protocol_mode, "status-bundle") == 0) {
        if (stream_response_frames_to_eof(child_output[0], child_diagnostics[0], deadline) != 0) goto finish;
    } else if (strcmp(protocol_mode, "bootstrap") == 0) {
        if (stream_one_or_two_frames_to_eof(
                child_output[0], child_diagnostics[0], deadline, 2) != 0) goto finish;
    } else if (read_response_to_eof(child_output[0], response, sizeof response, &response_length,
                                    child_diagnostics[0], deadline) != 0) goto finish;
    outcome = wait_child(child, child_diagnostics[0], deadline);
    child = -1;
    if (outcome == 0 && strcmp(protocol_mode, "status-bundle") != 0
        && strcmp(protocol_mode, "bootstrap") != 0
        && write_exact(STDOUT_FILENO, response, response_length) != 0) outcome = 70;

finish:
    memset(request, 0, sizeof request);
    memset(response, 0, sizeof response);
    if (child_input[1] >= 0) close(child_input[1]);
    if (child_output[0] >= 0) close(child_output[0]);
    if (child_diagnostics[0] >= 0) close(child_diagnostics[0]);
    if (child > 0) {
        kill(child, SIGKILL);
        while (waitpid(child, NULL, 0) < 0 && errno == EINTR) { }
    }
    if (outcome == 124) fputs("ssh_timeout\n", stderr);
    else if (outcome != 0) fputs("ssh_protocol_failed\n", stderr);
    return outcome;
}

int main(int argc, char **process_argv) {
    const char *ssh_user = NULL;
    const char *protocol_mode = NULL;
    if (argc == 2 && strcmp(process_argv[1], "deploy-status-v1") == 0) {
        ssh_user = "github-control-deploy";
        protocol_mode = "status";
    } else if (argc == 2 && strcmp(process_argv[1], "deploy-status-bundle-v1") == 0) {
        ssh_user = "github-control-deploy";
        protocol_mode = "status-bundle";
    } else if (argc == 2 && strcmp(process_argv[1], "bootstrap-status-v1") == 0) {
        ssh_user = "github-control-bootstrap";
        protocol_mode = "bootstrap";
    } else if (argc == 2 && strcmp(process_argv[1], "deploy-execute-v1") == 0) {
        ssh_user = "github-control-deploy";
        protocol_mode = "execute";
    } else {
        fputs("transport_contract_rejected\n", stderr);
        return 64;
    }
    char host[254];
    char port[6];
    if (read_connection_frame(FD_CONNECTION, host, sizeof host, port, sizeof port) != 0) {
        fputs("transport_contract_rejected\n", stderr);
        return 64;
    }
    if (close(FD_CONNECTION) != 0) return 70;
    char destination[300];
    if (snprintf(destination, sizeof destination, "%s@%s", ssh_user, host) >= (int)sizeof destination) return 64;
    char *const ssh_argv[] = {
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", port,
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=yes", "-o", "PasswordAuthentication=no",
        "-o", "KbdInteractiveAuthentication=no", "-o", "PreferredAuthentications=publickey",
        "-o", "ProxyCommand=none", "-o", "ProxyJump=none", "-o", "KnownHostsCommand=none",
        "-o", "PermitLocalCommand=no", "-o", "ControlMaster=no", "-o", "ControlPath=none",
        "-o", "PKCS11Provider=none", "-o", "SecurityKeyProvider=none",
        "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "RequestTTY=no",
        "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1", "-o", "NumberOfPasswordPrompts=0",
        "-o", "UpdateHostKeys=no", "-o", "GlobalKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR",
        "-i", "/proc/self/fd/4", "-o", "UserKnownHostsFile=/proc/self/fd/5", destination, NULL
    };
    char *const envp[] = { "PATH=/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", NULL };
    return run_fixed_ssh_protocol(ssh_argv, envp, protocol_mode,
                                  FD_REQUEST, FD_ARTIFACT,
                                  FD_EXPECTED_READY, FD_EXECUTION_CONTROL);
}
```

Implement `read_connection_frame` in the same file as a fixed length-prefixed binary parser: one unsigned-byte host length `1..253`, that many ASCII hostname/IP bytes, one unsigned-16-bit network-order port `1..65535`, then EOF. Reject control bytes, whitespace, shell metacharacters, leading `-`, embedded NUL, and trailing bytes. Do not invoke a shell or read `~/.ssh/config`.

`run_fixed_ssh_protocol` above is the complete implementation used by the reviewed build. It uses `pipe2(O_CLOEXEC)` plus `posix_spawn_file_actions` to start `/usr/bin/ssh` with its stdin/stdout/stderr bound to internal anonymous pipes, preserves only already-reviewed identity/known-hosts descriptors 4 and 5, explicitly closes descriptor 3, and closes every descriptor from 6 upward in the SSH child. In deploy-status mode it writes the bounded frame from FD 6, closes child stdin, returns one canonical response of at most 2,048 bytes, and drains/discards child stderr. Bootstrap mode incrementally forwards only one or two complete LF frames of at most 2,048 bytes each; the JS transport's owner-validated request type and exact 10,000/925,000-ms outer bound decide whether one inventory frame or ready-plus-terminal is legal, privately validate/zero ready, and expose at most one final frame. In status-bundle mode it writes exactly one bounded request, closes child stdin, incrementally forwards one through 342 complete LF frames of at most 2,048 bytes each under one absolute 30-second deadline, and rejects a partial/zero/343rd frame or aggregate stdout substitution; it never opens a second SSH/service session. In execute mode it writes auth, reads at most 2,048 bytes and byte-compares FD 8, copies exactly the big-endian unsigned-64-bit size from fixed FD 9 out of artifact capability FD 7, rejects zero/oversize/early EOF or an extra byte, closes child stdin, then returns only the bounded `artifact_accepted_v1` frame. Monotonic deadlines kill/reap the child; every buffer is overwritten and every pipe is closed on all exits. It never sends artifact bytes before the ready comparison and never detaches locally; detachment is acknowledged only by the verified host launcher.

Extend only `native/registry/bootstrap-authorization-v1.json` with one reviewed standalone target for `secure-ssh-transport.c`, referencing Foundation's frozen `hardened-c17-pie-v1` profile, and four closed `spawnProfiles` that all name that target. Their exact executable ID/fixed-argument/user-mode bindings are `control-plane-ssh-deploy-status-v1 -> ["deploy-status-v1"] -> github-control-deploy/status`, `control-plane-ssh-deploy-status-bundle-v1 -> ["deploy-status-bundle-v1"] -> github-control-deploy/status-bundle`, `control-plane-ssh-bootstrap-status-v1 -> ["bootstrap-status-v1"] -> github-control-bootstrap/status`, and `control-plane-ssh-deploy-execute-v1 -> ["deploy-execute-v1"] -> github-control-deploy/execute`; only Foundation's compiled registry can supply those fixed arguments, and the public transport methods cannot pass argv. The fragment also registers the fixed `control-plane-ssh-clean-v1` environment profile. Fixed status/bundle/bootstrap child slots are `1,2,3,4,5,6`; execute additionally permits `7,8,9`. Compute and bind the exact completed LF-terminated `secure-ssh-transport.c` source digest in this implementation step, recompute the canonical extension digest, and replace only that fragment's SHA-256 in `reviewed-native-registry-manifest.json`; no digest copied from an earlier source shape is accepted. Tests independently rehash source, fragment, build plan, output, and receipt. Assert all six Bootstrap standalone targets (the two Task 4 shims, two Task 4 root relays, the Task 4 Node helper, and this transport target), all four fixed SSH spawn profiles, the two forced-command authorized-key entry identities, and the unchanged Foundation public ABI. Reject unknown/floating arguments and any extra target/profile field. This slice does not edit `control-plane-native.c`, add an N-API export, or add a caller-selected executable/path/slot.

- [ ] **Step 5: Execute the previously written descriptor, option, timeout, and redaction matrix**

On disposable Linux, enumerate `/proc/<child>/fd` and prove only stdio plus fixed descriptors survive. Assert every required SSH disable option exactly once and reject config/env overrides. Add noncanonical/invalid base64, wrong embedded SSH type, non-32-byte key, trailing blob bytes, fingerprint mismatch, and endpoint/key tuple-digest mismatch cases. Inject spawn failure, timeout, signal, malformed response, oversized response/diagnostics, and close failure. Search captured process diagnostics and canonical outputs for synthetic private key, host, known-hosts key, binding key, token, and request body; all must be absent.

Retain the Step 2 RED evidence, run the matrix after each minimal Step 3-4 addition, and make one cleanup/limit row GREEN per rerun without weakening prior rows.

- [ ] **Step 6: Run targeted/native tests and verify GREEN**

Run on disposable Linux with Foundation's six reviewed offline header/toolchain custody variables: `node scripts/build-control-plane-native.mjs && node --test server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit transport**

```bash
git add server/services/deployment/control-plane-transport-contract.mjs ops/control-plane-deploy/native/src/secure-ssh-transport.c ops/control-plane-deploy/native/registry/bootstrap-authorization-v1.json ops/control-plane-deploy/native/registry/reviewed-native-registry-manifest.json server/tests/fixtures/control-plane-fixed-credential.mjs server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs
git commit -m "feat: add sealed control-plane ssh transport"
```

---

### Task 9: Closed forced-command host protocol and status/recovery family

**Prerequisite:** Receipt/Recovery Tasks 1-3, Artifact/Workflow Tasks 3-8, and Host/Database Task 11A's closed-broker plus branded host-inventory-reader provider checkpoint are committed on this same branch and GREEN, as required by the global DAG. Tasks 1-8 above do not depend on them; this task must not create a substitute while any owner is absent. Before the first RED, import Artifact's real `validateDeploymentPlanBytes`, `validateProductionGateReceipt`, `validateProductionAuthorizationRecord`, and `deriveProductionAuthorizationOidcAudience`; Receipt's real `HOST_TERMINAL_BUNDLE_V1_CONTRACT`, `buildHostTerminalBundle`, and `validateHostTerminalBundleBytes`; Host's real `ACCEPTED_START_EVIDENCE_FIELDS`, `ACCEPTED_START_EVIDENCE_CONTRACT`, `canonicalizeAcceptedStartEvidence`, `createAcceptedStartEvidenceReader`, `createControlPlaneHostInventoryReaders`, and `assertControlPlaneHostInventoryReaders`; and Transport's real three activation timing constants plus `encodeBootstrapActivationReadyFrame`/`validateBootstrapActivationReadyFrame` in cross-plan owner-shape tests. Create canonical bytes/branded providers through each real owner and record that all providers pass without any Task 9 file present; Task 9 then makes only the consumer half GREEN.

**Files:**
- Create: `server/services/deployment/control-plane-host-protocol.mjs`
- Create: `server/services/deployment/control-plane-github-oidc-verifier.mjs`
- Create: `server/services/deployment/control-plane-authorization-verifier.mjs`
- Create: `server/services/deployment/control-plane-admission-replay-ledger.mjs`
- Create: `server/services/deployment/control-plane-bootstrap-maintenance.mjs`
- Create: `server/services/deployment/control-plane-accepted-plan-store.mjs`
- Create: `server/services/deployment/control-plane-session-limit-broker.mjs`
- Create: `server/services/deployment/control-plane-recovery-challenge-broker.mjs`
- Create: `server/services/deployment/control-plane-transaction-ingress.mjs`
- Create: `server/services/deployment/control-plane-accepted-artifact-handoff.mjs`
- Modify: `scripts/control-plane-bootstrap-root.mjs`
- Create: `scripts/control-plane-deploy-root.mjs`
- Create: `scripts/control-plane-session-limit-broker.mjs`
- Create: `scripts/control-plane-recovery-challenge-broker.mjs`
- Create: `scripts/control-plane-accepted-artifact-custody.mjs`
- Create: `ops/control-plane-deploy/contracts/admission-replay-ledger-v1.json`
- Create: `ops/control-plane-deploy/contracts/accepted-plan-v1.json`
- Create: `ops/control-plane-deploy/contracts/accepted-artifact-v1.json`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-challenge-broker.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-challenge-broker.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-session-limit-broker.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-session-limit-broker.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-deploy-protocol.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-deploy-protocol.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-protocol.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-protocol.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-accepted-artifact.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-accepted-artifact.service`
- Create: `server/tests/control-plane-host-protocol.test.mjs`
- Create: `server/tests/control-plane-github-oidc-verifier.test.mjs`
- Create: `server/tests/control-plane-authorization-verifier.test.mjs`
- Create: `server/tests/control-plane-admission-replay-ledger.test.mjs`
- Create: `server/tests/control-plane-bootstrap-maintenance.test.mjs`
- Create: `server/tests/control-plane-session-limit-broker.test.mjs`
- Create: `server/tests/control-plane-recovery-challenge-broker.test.mjs`
- Create: `server/tests/control-plane-transaction-ingress.test.mjs`
- Create: `server/tests/control-plane-accepted-artifact-handoff.test.mjs`
- Modify: `server/tests/control-plane-transport-redaction.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-systemd-contract.test.mjs`
- Modify: `integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

**Interfaces:**
- `control-plane-host-protocol.mjs` exports `HOST_REQUEST_TYPES`, `TERMINAL_BUNDLE_CHUNK_BYTES`, `TERMINAL_BUNDLE_MAX_BYTES`, `TERMINAL_BUNDLE_MAX_CHUNKS`, `parseHostRequestFrame(bytes)`, `encodeExecuteAuthFrame({ deploymentPlanBytes, productionGateReceiptBytes, authorizationRecordBytes, oidcTokenBytes })`, `encodeNormalInventoryRequestFrame(value)`, `encodeNormalInventoryResponseFrame(value)`, `validateNormalInventoryResponseFrame(bytes, expected)`, `encodeCompatibilityInventoryRequestFrame(value)`, `encodeCompatibilityInventoryResponseFrame(value)`, `validateCompatibilityInventoryResponseFrame(bytes, expected)`, `encodeBootstrapActivationRequestFrame(value)`, `encodeBootstrapActivationResponseFrame(value)`, `validateBootstrapActivationResponseFrame(bytes, expected)`, `encodeStatusRequestFrame(value)`, `encodeStatusResponseFrame(value)`, `validateStatusResponseFrame(bytes, expected)`, `assertValidatedOrdinaryStatus(value)`, `encodeTerminalBundleChunkRequest(value)`, `encodeTerminalBundleChunkResponse(value)`, `validateTerminalBundleChunkResponse(bytes, expected)`, `readTerminalBundleBytes(input)`, `encodeReadyForArtifactFrame(value)`, `validateReadyForArtifactFrame(bytes, expected)`, `encodeArtifactAcceptedFrame(value)`, `validateArtifactAcceptedFrame(bytes, expected)`, `encodeCloseoutUploadStartedFrame(value)`, `encodeCloseoutAckFrame(value)`, `encodeRecoveryChallengeRequest(value)`, `validateRecoveryChallengeResponse(bytes, expected)`, `encodeRecoveryStatusRequest(value)`, `validateRecoveredStatusResponse(bytes, expected)`, and `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })`. The execute and bootstrap-activation encoders alone base64-encode their owned raw inputs; callers never construct either encoder's `*Base64` fields.
- For its controller-only `readTerminalBundleBytes` helper, this module imports only `DEPLOY_CREDENTIAL_ID` and `validateTransportEnvelope` from `control-plane-transport-contract.mjs`; that transport module imports no protocol codec, so the dependency is acyclic. Host-side codec/router construction does not instantiate a transport.
- The exact caller-visible response contract/type IDs are `normal_inventory_response_v1`, `compatibility_inventory_response_v1`, `bootstrap_activation_response_v1`, `status_response_v1`, `ready_for_artifact_v1`, and `artifact_accepted_v1`. Transport additionally owns the non-caller-visible `bootstrap_activation_ready_v1` phase frame; Host protocol imports its real encoder and never redefines its fields or validator. Every response/phase encoder produces one canonical LF-terminated frame of at most 2,048 bytes. Request encoders, including execute/bootstrap-activation/closeout/recovery requests carrying bounded owner bytes, produce one canonical LF-terminated frame of at most 65,536 bytes. Validators apply the matching bound, parse exact bytes, reject cross-type/unknown fields, byte-compare all expected bindings, and return a deeply frozen value. Tests separately prove request 65,536/65,537 and response 2,048/2,049 boundaries. There is no generic response decoder.
- Normal inventory request input is exactly `{ requestId, inventoryGateId, sourceCommit }`; compatibility inventory request input is exactly `{ requestId, compatibilityInventoryGateId, sourceCommit, activationId, hostBundleContentReceiptSha256 }`. Their encoders fix `type` to `inventory_normal` or `inventory_compatibility`. Neither shape contains `gateId`, Production Gate receipt bytes/digest, `deploymentPlanSha256`, or `transactionId`. Each response is separately typed and echoes only its exact request binding plus `observedAt`, a strict `inventoryEvidenceSha256`, and canonical `inventoryEvidenceBytesBase64` whose decoded bytes are at most 768 bytes and are validated by the corresponding fixed host inventory evidence contract. Cross-kind frames, an `activationId` in normal inventory, or final bootstrap/rotation fields in compatibility inventory reject before any state reader. Compatibility `activationId` is evidence byte-compared by the Host owner and never a path/object selector. The Host/Database provider checkpoint owns `control-plane-host-inventory-readers.mjs` and exports `createControlPlaneHostInventoryReaders(deps)` plus `assertControlPlaneHostInventoryReaders(value)`: the factory returns one privately branded frozen exact `{ normalInventoryReader, compatibilityInventoryReader }`, and each member is frozen exact `{ read(request) }`. Bootstrap imports only the assertion, accepts only that same branded pair as `hostInventoryReaders`, and internally dispatches to its two exact members. A cloned pair, separately injected readers, extra method, or cross-kind reader rejects at router construction. Both handlers perform zero CAS/execute/ACK/artifact operations.
- `bootstrap_activation` is an independent mutation ABI and never aliases either inventory contract. `encodeBootstrapActivationRequestFrame({ requestId, activationId, activationRecordSha256, bootstrapActivationGateReceiptSha256, operationEnvelopeBytes })` accepts exactly those five caller keys, fixes `type="bootstrap_activation"`, owns/copies the canonical operation-envelope bytes, and emits exact ordered wire fields `type`, `requestId`, `activationId`, `activationRecordSha256`, `bootstrapActivationGateReceiptSha256`, and `operationEnvelopeBytesBase64`. `requestId` is fixed to `bar1.<64-lower-hex>` so Transport and the bootstrap relay can correlate the non-secret ready frame without accepting a selector. The envelope must parse through Task 5's owner `parseBootstrapOperationEnvelope` and byte-equal the outer activation/record/Gate bindings; it carries the original provider Gate digest, one fresh activation Gate digest, rotation/journal/operation/target/generation tuple, `requestedAt`, and `expiresAt`. The launcher reopens the same immutable activation record, armed lease, rotation fence/journal, and installed principal; proves both Gate digests, exact record/rotation/journal/operation tuple, `requestedAt <= now < min(requestedAt + 60 seconds, expiresAt)`, and one-use state; then calls the router's no-argument `onAuthorized` once before CAS. That callback writes and awaits the Transport-owned exact `{ type, requestId, activationId }` ready frame and returns literal `true`; a failed/false/duplicate callback performs zero claim/CAS/mutation. A digest-only lookalike without the installed record, a stale request, compatibility inventory evidence, a deployment key, or an already claimed activation writes neither ready nor mutation. The final success response has exact ordered fields `type`, `requestType`, `requestId`, `activationId`, `activationState`, and `terminalResultSha256`; it fixes `type="bootstrap_activation_response_v1"`, `requestType="bootstrap_activation"`, `activationState="terminal"`, and exposes only the safe terminal-result receipt digest—never operation output, paths, journal bytes, keys, provider data, or manager state. Transport consumes ready internally and exposes only this final response to its caller.
- `ready_for_artifact_v1` has exactly ordered fields `type`, `transactionId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `authorizationRecordSha256`, `artifactSize`, and `artifactSha256`. Every field is controller-precomputable, so Artifact builds the exact expected bytes with `encodeReadyForArtifactFrame(value)` before `.execute()` and the C continuation can byte-compare without trusting a host-derived selector. The host-only replay-ledger reservation and accepted-plan digests are deliberately absent. `artifact_accepted_v1` preserves the approved exact five-field acknowledgment ABI: `gateId`, `deploymentPlanSha256`, `transactionId`, `acceptedAt`, and `accepted`, in that order; it has no extra `type` field. `validateArtifactAcceptedFrame(bytes, { gateId, deploymentPlanSha256, transactionId })` byte-compares those three selectors, requires `accepted === true`, and validates bounded canonical UTC `acceptedAt`. Artifact size/hash, accepted-record digest, accepted-plan digest, invocation digest, custody generation, EOF proof, path, FD, unit, and command remain durable host evidence and cannot be added to this acknowledgment.
- The closeout specialization of `status_response_v1` has exact ordered fields `type`, `requestType`, `transactionId`, `closeoutState`, `closeoutRecordSha256`, `transitionBindingSha256`, `oidcJtiSha256`, and `oidcTokenSha256`. The last three are required 64-hex only for closeout responses and cannot appear on ordinary status. Upload-start fixes `requestType=status_closeout_upload_started` and `closeoutState=upload_started`; ACK fixes `requestType=status_closeout_ack` and `closeoutState=upload_committed_observed`. `validateStatusResponseFrame(responseBytes, expected)` byte-compares all eight fields, so Receipt can prove distinct binding/JTI/token consumption without receiving raw OIDC bytes.
- `encodeStatusRequestFrame({ requestId, gateId, deploymentPlanSha256, transactionId })` accepts exactly those four caller keys and fixes `type="status"`; `requestId` is correlation only and never authority. Its ordinary `status_response_v1` keeps exactly sixteen ordered evidence fields: `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `controllerRecoveryId`, `immutableTerminal`, `durableRejection`, `resultCode`, `hostFinalState`, `terminalReceiptSha256`, `closeoutState`, `closeoutRecordSha256`, `terminalBundleSha256`, and `terminalBundleSize`. `validateStatusResponseFrame(bytes, expected)` requires the exact four-field expected tuple, byte-compares it, privately brands the returned frozen value, and enforces the closed nonterminal/durable-rejection/five-terminal nullability matrix. `assertValidatedOrdinaryStatus(value)` accepts only that same module-private `WeakSet` reference and is the sole Receipt/final-status and terminal-bundle admission assertion; a recovered-status value or clone rejects. Only an immutable terminal has a 64-hex terminal-bundle digest and integer size in `1..262144`; both are canonical null otherwise. `controllerRecoveryId` is host evidence resolved from the accepted plan, never a request selector. Closeout-only binding/JTI/token fields cannot appear.
- `control-plane-ordinary-status-store.mjs` exports exactly `createOrdinaryStatusStore({ acceptedPlanStore, admissionReplayLedger, terminalObjectReader, closeoutStore, ordinaryRuntimeStateReader, criticalPostPublicationProofReader, assertCriticalPostPublicationProof, clock })` and `createOrdinaryStatusReader({ ordinaryStatusStore })`. The store is privately branded and exposes only its fixed-source `readTransactionSnapshot({ gateId, deploymentPlanSha256, transactionId })` and `readTerminalBundleBytes({ gateId, deploymentPlanSha256, transactionId, terminalBundleSha256 })`; the reader rejects a clone and returns exactly `{ read, readTerminalBundleForStream }`. Both paths independently reopen/readback the accepted plan, replay reservation/terminal binding, Receipt-owned immutable terminal objects, closeout index/object, finalizer unit and cgroup, unchanged critical fence, global identity lease, and business-mutation lease through fixed readers; neither accepts a path, unit, cgroup, lease, fence, object ID, proof, final state, or clock from a request.
- For the four noncritical Host final states, `ordinaryRuntimeStateReader` applies their Host-owned post-terminal runtime/custody predicates before `immutableTerminal=true`. For `critical_manual_intervention_required` only, the store obtains `expectedCriticalIdentityFenceSha256` from the immutable terminal, calls Host's exact `createCriticalPostPublicationProofReader(...).readAndVerify({ transactionId, expectedCriticalIdentityFenceSha256 })`, and passes that same reference unchanged to `assertCriticalPostPublicationProof`. That Host brand proves the external finalizer inactive, its cgroup absent, every transaction/recovery/recorder/custody/migration unit/cgroup inactive, the fence unchanged, and both global identity and business leases freshly exclusive-held/readback/released/reacquired free. Only after that assertion may the reader produce the sixteen-field critical immutable terminal or expose bundle bytes. While quiescence is legitimately pending it returns the closed transaction-scoped nonterminal `resultCode="terminal_quiescence_pending"` with `immutableTerminal=false`, `durableRejection=false`, `hostFinalState=null`, and every receipt/closeout/bundle field null. Fence/identity drift returns `resultCode="terminal_quiescence_rejected"`, `durableRejection=true`, but remains the same already-admitted transaction with `immutableTerminal=false`, `hostFinalState=null`, and no receipt/closeout/bundle fields; that flag is a durable transaction-scoped observation, never a pre-admission/no-transaction rejection. Ordinary bounded polls continue, and only a later same-reference Host post-publication proof may converge it to the branded immutable `critical_manual_intervention_required` terminal plus bundle. If the controller deadline expires first, classification is only `controller_incomplete_no_production_claim`; it is never `admission_rejected_no_transaction`. Bootstrap defines no durable pre-admission rejection response or private brand, so that classifier row remains ownerless/unreachable in this program and any bare boolean or arbitrary ordinary rejection fails closed to controller no-claim. The Host proof object is never serialized or added to the publication-time receipt. Controller validation then issues only Bootstrap's private ordinary-status brand, and Receipt's later final validator must pass that exact reference through `assertValidatedOrdinaryStatus`; publication and post-publication proofs never substitute for one another.
- The read-only terminal bundle is a separate bounded status family, not an enlarged ordinary response. `TERMINAL_BUNDLE_CHUNK_BYTES`, `TERMINAL_BUNDLE_MAX_BYTES`, and `TERMINAL_BUNDLE_MAX_CHUNKS` are exactly `768`, `262144`, and `342`. `encodeTerminalBundleChunkRequest({ requestId, gateId, deploymentPlanSha256, transactionId, terminalBundleSha256, offset })` accepts exactly those six caller fields, fixes `type="status_terminal_bundle_chunk"`, and requires `offset === 0`; this is the sole authenticated stream-opening request, not a random-access chunk selector. A `terminal_bundle_chunk_v1` response has exactly ordered fields `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `terminalBundleSha256`, `totalBytes`, `offset`, `chunkSha256`, `chunkBytesBase64`, and `eof`; it fixes `requestType="status_terminal_bundle_chunk"` and remains at most 2,048 bytes even with every identifier at its real maximum. `validateTerminalBundleChunkResponse(bytes, expected)` requires the same request bindings plus the next exact contiguous offset and `totalBytes`, and rejects unknown fields, noncanonical base64, wrong per-chunk digest, state/digest/size drift, or malformed EOF. The host streams one through 342 frames and closes; it never accepts a second request frame in that session.
- `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs }) -> Promise<Object.freeze({ bytes, sha256 })>` is the only controller-side assembler. It requires `timeoutMs === 30000` and the private brand from this module's ordinary-status validator; the status must be immutable terminal and carry the exact Gate/deployment-plan/transaction/recovery/bundle digest/size evidence. It derives one `requestId="tbs1." + sha256Hex(canonical validated-status bundle binding)`, encodes exactly one offset-zero request, and calls `transport.requestStatusBundle({ credentialId: DEPLOY_CREDENTIAL_ID, requestBytes, timeoutMs, consumeFrame })` exactly once. Its private consumer validates each complete frame immediately with `validateTerminalBundleChunkResponse`, advances the expected offset, and retains only decoded owned chunk bytes. After the stream closes it validates the returned transport envelope and requires success with empty `responseBytes`. It accepts only contiguous one-time offsets; every non-final decoded chunk is exactly 768 bytes, the final chunk is the exact remainder, and EOF, one through 342 chunks, total length, and aggregate digest must all agree. Thus a maximum bundle consumes one SSH authentication, one `Accept=no` service start, and one session-limit token—not 342 of any of them. It returns an owned raw canonical bundle Buffer and its verified digest. Receipt Task 2 is the sole envelope owner: `buildHostTerminalBundle(...) -> { value, bytes, sha256 }` constructs it and `validateHostTerminalBundleBytes(bytes, expected) -> { value, bytes, sha256 }` parses and validates it under `HOST_TERMINAL_BUNDLE_V1_CONTRACT`. Task 11's `ordinaryStatusReader` imports the real builder, reads only the exact transaction's four Receipt-owned fixed logical objects plus verified Bootstrap closeout-index binding, and otherwise treats bundle bytes as opaque. Errors are only `terminal_bundle_status_unverified`, `terminal_bundle_status_not_terminal`, `terminal_bundle_transport_failed`, `terminal_bundle_chunk_invalid`, `terminal_bundle_incomplete`, or `terminal_bundle_digest_mismatch`. The helper never accepts or returns a path/logical ID/object reader, never closes the shared transport, and never interprets terminal bytes. The same controller-lifetime transport may first recover, then issue an ordinary status request, then open this one bundle stream; recovery does not create another credential capture. Receipt remains the sole owner of `createControllerCloseoutAdapter({ runnerMaterialStore, actionsArtifactClient, requestOidcToken, clock })` and its exact method surface `validateTerminal`, `createNoClaimEvidence`, `cleanupAndReadBackRunnerMaterial`, `toControllerCloseoutInput`, `expectedBindings`, `createUploadStartedRequest`, `validateUploadStartedResponse`, `writeImmutableLocalFile`, `uploadActionsArtifact`, `readBackExactActionsArtifact`, `deleteLocalFileAndReadBackAbsent`, `createAckRequest`, `validateAckResponse`, `createCommittedStatusRequest`, and `validateUploadCommittedObserved`. Bootstrap and Artifact may only consume that frozen ABI. Upload-start validation, ACK validation, and the later ordinary committed-status validation consume three distinct complete transport envelopes; ACK can never substitute for final status, and `createCommittedStatusRequest` must use the exact four-field ordinary status selector owned here.
- `validateRecoveredStatusResponse(bytes, expected)` has a distinct private recovery brand and can never satisfy `assertValidatedOrdinaryStatus` or `readTerminalBundleBytes`. `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })` accepts only the exact recovery-branded reference, projects only its `gateId`, `deploymentPlanSha256`, and `transactionId`, validates the new correlation-only request ID, and returns exactly `Object.freeze({ requestBytes, expected })`, where `expected` is the frozen exact `{ requestId, gateId, deploymentPlanSha256, transactionId }` and `requestBytes = encodeStatusRequestFrame(expected)`. The required controller sequence is recovery envelope validation, this helper, one ordinary `.request()`, `validateStatusResponseFrame(responseBytes, expected)`, then—and only if that ordinary brand is immutable terminal—`readTerminalBundleBytes` on the same transport. A recovered response cannot directly open a bundle stream or be cast/spread into an ordinary status.
- `control-plane-authorization-verifier.mjs` imports, without schema wrapping or remapping, Artifact-owned `validateProductionAuthorizationRecord({ bytes, expected, now })` and `deriveProductionAuthorizationOidcAudience(authorizationRecordSha256)` from `control-plane-production-authorization.mjs`. It exports exactly `VERIFIED_INSTALLED_EXPECTATION_FIELDS`, `createAuthorizationVerifier({ oidcVerifier, installedStateReader, clock })`, and `assertVerifiedInstalledExpectation(value)`; the factory exposes only `verify({ authorizationRecordBytes, oidcTokenBytes })`. `VERIFIED_INSTALLED_EXPECTATION_FIELDS` is exactly `bootstrapGeneration`, `bootstrapReceiptSha256`, `bootstrapStateSha256`, `authorizationBindingHmacSha256`, `authorizationGeneration`, `databaseContractsSha256`, and `hostExecutionContractSha256`, in that order. The verifier first reads host-authoritative expectations, calls the Artifact validator, uses only `validated.value` as the claims/installed-state input, and uses only `validated.sha256` as the authorization-record digest and audience input. The wrapper object itself is never spread, treated as authorization, or rehashed into a competing identity. `installedStateReader.verifyProductionAuthorization({ authorization: validated.value, expected })` returns the plan-bound `{ artifactSize, artifactSha256, installedExpectation }`; the verifier exact-field/value checks that projection against both authoritative readback and `validated.value`, copies/freezes it, and privately brands the result. It returns the exact authorization value, safe artifact pair, branded `installedExpectation`, `authorizationRecordSha256: validated.sha256`, OIDC JTI SHA-256, and token SHA-256. `control-plane-accepted-plan-store.mjs` calls `assertVerifiedInstalledExpectation` on the same object before publication and cannot accept a clone or router literal. There is no request-supplied expected tuple, Bootstrap authorization schema, alternate audience literal, mapper, reconstructed record, or closeout export; raw token bytes are zeroed in the outermost `finally`.
- The verifier fixes issuer `https://token.actions.githubusercontent.com`, the helper-derived audience, and exact byte-equality between verified OIDC claims and the Artifact-owned authorization value: repository, `eventName`, Environment subject, direct-workflow `workflow_ref` and `workflow_sha`, `sourceRef`, `sourceSha`, run ID, `runAttempt`, and `runnerEnvironment`. It never substitutes reusable-workflow-only `job_workflow_ref`/`job_workflow_sha`. The Artifact validator plus host-installed expectation—not a second Bootstrap constant table—enforces `workflow_dispatch`, `vultr-japan-production`, protected `refs/heads/master`, attempt `1`, and `github-hosted`. Time checks require nonnegative safe integers, both `iat < exp` and `nbf < exp`, `nbf <= now + 30`, `iat <= now + 30`, `exp > now`, and `0 < exp - iat <= 300`; they deliberately impose no ordering between `nbf` and `iat`, so both a redacted real claim with `nbf < iat` and a valid future-not-before claim with `iat < nbf <= now + 30` are accepted. Nonempty JTI, record expiry, and the installed `deploymentPlanSha256`/bootstrap/host-execution tuple are also mandatory. Any claim, plan/artifact resolution, or installed-state mismatch performs zero durable writes and requests no artifact.
- `control-plane-github-oidc-verifier.mjs` is the sole production GitHub Actions token trust owner and exports `GITHUB_ACTIONS_OIDC_ISSUER`, `GITHUB_ACTIONS_OIDC_DISCOVERY_URL`, `GITHUB_ACTIONS_OIDC_ALLOWED_ALGORITHMS`, and `createGitHubActionsOidcVerifier({ fetchFn, crypto, clock }) -> { verify({ tokenBytes, audience }) }`. Constants are exactly `https://token.actions.githubusercontent.com`, its same-origin `/.well-known/openid-configuration`, and `['RS256']`. The factory rejects a token over 32,768 bytes, non-three-part/canonical base64url JWT, duplicate JSON keys, unknown/critical headers, missing or ambiguous `kid`, any `alg` other than RS256, a non-HTTPS/cross-origin issuer or JWKS URI, redirects, non-JSON, compressed/oversize (65,536-byte) discovery/JWKS bodies, more than 16 keys, duplicate `kid`, non-RSA/signing keys, and signature failure. Fetch uses `redirect:'error'`, fixed Accept, a 5-second abort deadline, and no caller headers/proxy URL. A successful same-origin JWKS is cached for at most 300 seconds using the injected monotonic clock; expiry, unknown key, fetch/parse/signature error, or clock regression fails closed with no stale-key/network fallback. Local crypto tests sign synthetic RS256 tokens, inject all fetch responses, and make no network request. `scripts/control-plane-deploy-root.mjs` constructs this exact verifier and injects it into both production-authorization and closeout verification; no other module fetches OIDC metadata or verifies a JWT signature.
- `control-plane-admission-replay-ledger.mjs` exports `ADMISSION_REPLAY_FIELDS`, `ADMISSION_REPLAY_ENTRY_FIELDS`, `ADMISSION_REPLAY_CONTRACT`, `admissionReplayLedgerLogicalId()`, and `createAdmissionReplayLedger({ durableStore, clock })` with `reserveAdmission(...)`, `bindAcceptedArtifact(...)`, `bindTerminal({ transactionId, finalState, terminalRecordSha256, closeoutIndexSha256 })`, `listProtectedNonterminalTransactionIds()`, `readLedgerIdentity()`, `compactEligible({ expectedLedgerSha256, now, maintenanceCapability })`, and `readReservation(transactionId)`. The single mode-`0600` canonical ledger holds at most 128 sorted entries. Top-level fields are exactly `schema`, `version`, and `entries`. `ADMISSION_REPLAY_ENTRY_FIELDS` is exactly `state`, `productionGateReceiptSha256`, `authorizationRecordSha256`, `oidcJtiSha256`, `oidcTokenSha256`, `transactionId`, `target`, `deploymentPlanSha256`, `acceptedPlanSha256`, `artifactSha256`, `artifactSize`, `reservedAt`, `replayRejectUntil`, `acceptedArtifactRecordSha256`, `acceptedAt`, `finalState`, `terminalRecordSha256`, `closeoutIndexSha256`, `terminalAt`, `ordinaryRetainUntil`, and `critical`, in that order. Its closed state is `reserved | artifact_accepted | terminal`; all future-phase fields are present as canonical null and the validator enforces the complete phase/nullability matrix. `reserveAdmission` performs one CAS that simultaneously consumes the Production Gate receipt digest, authorization-record digest, OIDC JTI digest, token digest, and transaction ID/deployment-plan reservation before `ready_for_artifact`; `replayRejectUntil` is exactly `reservedAt + 24 hours`; alternate plan-field aliases reject.
- `bindTerminal({ transactionId, finalState, terminalRecordSha256, closeoutIndexSha256 })` is the only transition to terminal and CAS-binds the immutable Host/Receipt completion edge; it accepts only Host final-state algebra values such as `deployed_validated` and rejects controller labels, derives `critical` from that frozen algebra, and sets `ordinaryRetainUntil = terminalAt + 30 days` for every terminal entry. `listProtectedNonterminalTransactionIds()` returns the exact sorted set Host recovery must protect and never triggers compaction. `compactEligible` first calls `assertBootstrapMaintenanceCapability`, then deterministically sorts by terminal time then transaction ID and removes only entries that are both terminal and retention-eligible. Every replay dimension remains rejecting for at least 24 hours and every terminal entry remains at least 30 days. Active/nonterminal entries, the newest terminal entry for each target, and the newest critical terminal entry are never eligible, regardless of age; an older critical entry becomes eligible only after its own 30-day deadline and only while a newer critical entry remains protected. Compaction uses the exact digest from `readLedgerIdentity()` in one CAS, never runs as a JavaScript read/delete/write sequence, and returns the same digest on a no-op. A full ledger cannot reserve until a separately verified maintenance CAS succeeds; quota/lock/CAS loss writes nothing. Crash-before/after CAS, duplicate terminal bind, concurrent reservation/compaction, reboot, 24-hour boundary, 30-day boundary, newest-target, newest-critical, old-critical removal, capability forgery, and 128/129-entry tests are mandatory.
- `control-plane-bootstrap-maintenance.mjs` exports only `createBootstrapMaintenanceCoordinator({ native, clock })` and `assertBootstrapMaintenanceCapability(value)`. The factory creates one frozen private-`WeakSet` capability only after the complete Foundation probe and returns exactly `{ runAdmissionPreflight, runTerminalCloseoutPreflight }`. `runAdmissionPreflight({ admissionReplayLedger })` takes and reads back the fixed global maintenance lock, obtains `readLedgerIdentity()`, and invokes the capability-gated replay `compactEligible` once before a new reservation when capacity requires it. `runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })` takes the same lock, obtains the replay nonterminal set and the closeout store's branded `readCompactionPreflight({ protectedNonterminalTransactionIds })`, then invokes both capability-gated CAS compactors before terminal/closeout publication. It releases/readbacks the lock in an outermost `finally`. No timer, generic cleanup call, direct `compactEligible`, Host transaction, Receipt publisher, request, or caller-provided time/capability can enter production; `clock.now()` is captured once per run. Exact no-op, stale digest, crash-before/after each CAS, concurrent admission/terminal preflights, restart, forged capability, and lock-loss tests are mandatory.
- `control-plane-accepted-plan-store.mjs` exports `createAcceptedPlanStore({ durableStore, clock })` with only `publishAcceptedPlan({ deploymentPlan, productionGateReceipt, authorization, installedExpectation })` and `readAcceptedPlan(transactionId)`. The host first validates plan bytes to obtain the owner-returned `deploymentPlan.value.gateId`; it passes that exact ID with the raw Gate bytes to Artifact's real Gate validator, never derives a competing ID parser. The store constructs one fixed canonical object binding `gateId`, `deploymentPlanSha256`, Production Gate receipt digest, authorization-record digest, transaction/source/artifact/bootstrap/host-execution identities, and `acceptedAt`; it publishes immutable, file-fsyncs, parent-fsyncs, reads back exact bytes/digest, and cross-checks every owner validator result before replay reservation or ready. An exact duplicate is idempotent; any differing byte for the transaction rejects. It receives no path, logical ID, clock override, or artifact capability.
- Export `createHostProtocolRouter({ native, validateDeploymentPlanBytes, validateProductionGateReceipt, authorizationVerifier, acceptedPlanStore, admissionReplayLedger, bootstrapMaintenance, sessionLimitClient, hostInventoryReaders, artifactReceiver, acceptedArtifactHandoff, ordinaryStatusReader, closeoutStore, terminalVerifier, challengeBrokerClient, recoveryReader, oidcVerifier, clock })` with `handleStatusFrame(firstFrameBytes)` and `handleSession(io)`. Construction calls Host-owned `assertControlPlaneHostInventoryReaders(hostInventoryReaders)` once and retains only that exact branded `{ normalInventoryReader, compatibilityInventoryReader }` reference; independent reader arguments do not exist. It also requires the one exact `bootstrapMaintenance` returned by `createBootstrapMaintenanceCoordinator({ native, clock })`; no router path can construct, replace, clone, or pass a capability/time to it. Both methods require the complete fourteen-feature Foundation vector, then call only the already deploy-principal-bound `sessionLimitClient.acquire()` before any retained-state access, owner-byte/OIDC decoding, replay CAS, artifact receiver, or broker call; the outermost `finally` releases that connection-bound lease. This deploy composition accepts only `execute_auth`, `inventory_normal`, and the status/closeout/recovery families; it rejects `inventory_compatibility` and `bootstrap_activation` before a reader, launcher, or mutation. No request field or router argument selects a principal. Closeout handlers pass only the injected fixed `terminalVerifier` into the owner verifier; a request cannot provide terminal/source expectations. Host inventory readers have only read ports and are not aliases of `ordinaryStatusReader`.
- Export separately `createBootstrapProtocolRouter({ native, sessionLimitClient, hostInventoryReaders, bootstrapRootLauncher })` with only `handleSession(io)`. It asserts the same Host-branded pair, requires the fixed bootstrap-principal session client, and accepts exactly `inventory_compatibility` or `bootstrap_activation`; every deploy/status/normal-inventory type rejects before owner access. Compatibility inventory reads once, emits exactly one compatibility response, closes, and never constructs an authorization callback. For activation the router decodes one owned operation-envelope Buffer, parses and byte-compares all outer bindings, creates one closure-bound no-argument `onAuthorized` that can only `await io.writeFrame(encodeBootstrapActivationReadyFrame({ requestId: frame.requestId, activationId: frame.activationId }))` and return literal `true`, and calls `bootstrapRootLauncher.run(operationEnvelopeBytes, { onAuthorized })` exactly once with those same bytes. The closure is not exported, request-selectable, reusable, or shared. A ready write rejection propagates before launcher CAS; after a successful callback, the launcher may run for at most `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS`. The router zeroes the operation Buffer in the outermost `finally` and emits the final `bootstrap_activation_response_v1` only after terminal readback. The launcher—and not compatibility inventory, the router, callback, or a caller—is the sole mutation authority.
- `execute_auth` decodes strict canonical base64 into owned bounded `deploymentPlanBytes`, `productionGateReceiptBytes`, `authorizationRecordBytes`, and `oidcTokenBytes`; validates each with its real owner; cross-checks Gate/plan/authorization/installed source, target, transaction, artifact, bootstrap, host-execution, run, and expiry semantics; then unconditionally calls the injected singleton `bootstrapMaintenance.runAdmissionPreflight({ admissionReplayLedger })` before the first accepted-plan write. Only after that preflight returns may it publish/fsync/readback the accepted-plan object, atomically reserve every replay dimension, and write the exact bounded `ready_for_artifact_v1`. A full 128-entry ledger either compacts an eligible retained terminal under the maintenance capability/lock or rejects the attempted 129th reservation before accepted-plan publication; a no-op preflight is still called and proven. It receives exactly the verified plan-bound size/hash through `artifactReceiver`, proves EOF/no extra byte, and calls `acceptedArtifactHandoff.acceptAndStart({ authorization, artifact, acceptedPlan, reservation, artifactCapability })`. It returns only the approved five-field acceptance acknowledgment; no caller command/unit/path/socket/FD is forwarded. `artifactReceiver` has exact `begin({ transactionId, expectedSize, expectedSha256, reservationSha256 }) -> { write(bytes), commitAfterEof(), abort() }` and never exposes a path.
- `control-plane-transaction-ingress.mjs` exports `createArtifactReceiver({ ingressStore, native, clock })`. `commitAfterEof()` returns an opaque no-path capability bound to the transaction ID, reservation digest, exact unsigned-64-bit size, streaming SHA-256, EOF proof, and fixed semantic object ID; early EOF, extra byte, timeout, mismatch, or reboot before acceptance produces an authenticated rejection and removes/readbacks the bounded pending object.
- `control-plane-accepted-artifact-handoff.mjs` is the single adapter imported by this plan and the host-transaction plan. It exports only Bootstrap-owned `ACCEPTED_ARTIFACT_FIELDS`, `createAcceptedArtifactHandoff({ native, ingressStore, admissionReplayLedger, acceptedStartProjectionStore, custodyClient, transactionBrokerClient, clock })` with `acceptAndStart({ authorization, artifact, acceptedPlan, reservation, artifactCapability })`, and `createAcceptedArtifactConsumer({ ingressStore, native, peerVerifier })` with `receive({ transactionId, acceptedArtifactRecordSha256 })`. It imports Host broker provider exports `ACCEPTED_START_EVIDENCE_FIELDS`, `ACCEPTED_START_EVIDENCE_CONTRACT`, and `canonicalizeAcceptedStartEvidence`; Bootstrap does not copy or re-export that field list/contract, and Host does not import Bootstrap. Both entrypoints require the complete Foundation vector before touching the accepted capability or store. The accepted fields are exactly `schema`, `transactionId`, `authorizationReservationSha256`, `acceptedPlanSha256`, `artifactObjectId`, `artifactCapabilityIdentitySha256`, `artifactSize`, `artifactSha256`, `eofVerified`, `acceptedAt`, and `custodyGeneration`. The producer publishes/readbacks that mode-`0600` record, commits its digest through `admissionReplayLedger.bindAcceptedArtifact`, and transfers exactly one descriptor with `SCM_RIGHTS` through fixed socket ID `control-plane-accepted-artifact-v1`.
- Only after independent readback of the accepted-artifact record, accepted-plan object, authorization reservation, and artifact-capability identity does Bootstrap pass the exact four source digests to Host-owned `canonicalizeAcceptedStartEvidence`. It then calls only `acceptedStartProjectionStore.publishImmutable({ transactionId, canonicalEvidence })`, where `canonicalEvidence` is the exact owner return. That store uses a fixed projection logical-ID namespace distinct from every accepted record/plan/reservation, publishes/file-fsyncs/parent-fsyncs/readbacks the exact canonical bytes, and permits only a byte-identical duplicate; it never embeds the projection in, aliases, or mutates any of the four source objects. Host's `createAcceptedStartEvidenceReader` independently reopens those same four source objects plus the projection before broker start. The Host-owned evidence is exactly `{ acceptedArtifactRecordSha256, acceptedPlanSha256, authorizationReservationSha256, artifactCapabilityIdentitySha256 }`. `transactionInvocationSha256` is exactly SHA-256 over UTF-8 domain `control-plane-transaction-start-accepted-v1`, one NUL byte, then the owner-returned canonical four-field bytes. The handoff calls only Host-owned `transactionBrokerClient.startAcceptedTransaction({ transactionId, invocationSha256 })`; the broker uses its reader/canonicalizer to recompute and rejects before start on any mismatch. Crash before/after each source read, projection write/fsync/parent-fsync/readback, exact duplicate, one-field duplicate drift, source mutation after projection, and reboot tests prove the projection remains independent and immutable. The consumer verifies `SO_PEERCRED`, accepted-record bytes, descriptor identity/size/SHA/EOF, and returns an opaque capability. After detach or reboot, custody reopens only the fixed accepted object named by the durable record and repeats the same verification; no public API accepts a path, socket, FD slot, unit, operation, or executable, and neither handoff nor custody can open a systemd manager socket.
- `inventory_normal`, `inventory_compatibility`, `status`, and `status_terminal_bundle_chunk` are read-only and respond only through their distinct exact encoders. Normal inventory is reachable only in the deploy composition; compatibility inventory is reachable only in the bootstrap composition; both consume their member from the same Host-branded pair. Inventory has no Production Gate/deployment-plan/transaction selector. Ordinary status selects only exact `gateId`/`deploymentPlanSha256`/`transactionId` while `requestId` is correlation. A terminal-bundle request additionally binds the terminal bundle digest and opens exactly one response stream: the host reads the immutable bundle once and emits its one through 342 exact contiguous 768-byte chunks on that same authenticated connection before closing; it cannot enumerate or select a logical object, choose an offset, or open another session. `status_closeout_upload_started` and `status_closeout_ack` are the only closeout CAS operations, and each first requires its own transition-specific one-use OIDC assertion. `status_recover_challenge` issues a volatile 60-second one-use HMAC challenge through `challengeBroker`. `status_recover` consumes that challenge after recovery-audience OIDC verification and reads exactly one retained terminal record; it cannot execute, ACK, CAS, attach a lease, or rewrite state.
- Bootstrap owns the only closeout transition contract imported by Receipt. `control-plane-host-protocol.mjs` exports `CLOSEOUT_TRANSITIONS`, `CLOSEOUT_TRANSITION_BINDING_FIELDS`, `createCloseoutTransitionBinding(input) -> { value, bytes, sha256 }`, `deriveCloseoutTransitionOidcAudience({ transition, bindingSha256 })`, `encodeCloseoutUploadStartedFrame({ binding, oidcTokenBytes })`, `encodeCloseoutAckFrame({ binding, oidcTokenBytes })`, `verifyCloseoutTransitionOidc({ frame, oidcVerifier, terminalVerifier, clock }) -> { binding, bindingSha256, oidcJtiSha256, oidcTokenSha256 }`, and `assertVerifiedCloseoutTransition(value)`. `terminalVerifier.verifyCloseoutBinding(binding)` reads and validates the exact immutable terminal tuple and returns only its `sourceRef`, `sourceSha`, `eventName`, and `runnerEnvironment` claim expectations; no caller supplies them. Verification brands the frozen result in a module-private `WeakSet`; the assertion returns safe fields only for that exact object, so a reconstructed lookalike cannot reach a CAS. Keeping codecs, verifier, brand, and assertion in this one module avoids an import cycle; Receipt imports only these owner exports and defines no schema, audience, mapper, frame builder, or verifier.
- `CLOSEOUT_TRANSITIONS` is exactly `upload_started`, then `upload_committed_observed`. `CLOSEOUT_TRANSITION_BINDING_FIELDS` is exactly `schemaVersion`, `domain`, `transition`, `repository`, `workflowPath`, `workflowRef`, `workflowSha`, `environment`, `runId`, `runAttempt`, `controllerRecoveryId`, `terminalReceiptSha256`, `expectedCloseoutRecordSha256`, and `actionsArtifactObservationSha256`, in that order. Values fix `schemaVersion="1"`, `domain="controller-closeout-transition"`, the production repository/workflow/ref/Environment tuple, 40-hex workflow SHA, attempt `1`, and exact recovery/terminal/expected-record bindings. Source identity remains transitively bound by the immutable terminal receipt and deployment plan; it is not duplicated as a second transition field. `actionsArtifactObservationSha256` is canonical null only for `upload_started` and required 64-hex only for `upload_committed_observed`.
- The sole audience grammar is `gccgw-control-plane-closeout-${transition}:${bindingSha256}`, where `bindingSha256` hashes the complete canonical binding above. The two request codecs use one flat canonical shape: `type`, all binding fields in that exact order, `bindingSha256`, `audience`, and `oidcTokenBytesBase64`; there is no nested binding object or simplified terminal/artifact-only audience. `type` is respectively `status_closeout_upload_started` or `status_closeout_ack` and must agree with `transition`. The token is strict canonical base64, omitted values reject before store access, owned bytes are zeroed after verification, and no response/error contains it.
- `verifyCloseoutTransitionOidc` recomputes the binding bytes/digest/audience and applies the fixed issuer/signature/repository/event/Environment/workflow/ref/SHA/run/attempt/recovery/clock checks, while terminal-receipt verification proves the source/plan identity. `closeoutStore.casUploadStartedAuthorized(verifiedTransition)` and `casAckAuthorized(verifiedTransition)` atomically consume the binding digest, OIDC JTI digest, token digest, expected closeout-record digest, and state transition in one canonical CAS. Missing/invalid OIDC, a key-only request, cross-transition token, reused binding/JTI/token, expected-record drift, or CAS loss writes nothing anywhere.
- `control-plane-session-limit-broker.mjs` exports only `SESSION_LIMIT_PRINCIPALS`, `createSessionLimitBroker({ native, clock, peerVerifier })`, and `createSessionLimitBrokerClient({ socketPathId, fixedPrincipal })`. `SESSION_LIMIT_PRINCIPALS` is exactly `github-control-deploy`, then `github-control-bootstrap`; the client factory rejects every other principal and returns the frozen exact surface `{ acquire, close }`, with `acquire()` accepting no arguments. Only the two fixed root scripts construct it with their literal principal; no parsed frame, environment value, CLI argument, or router dependency can select or override that identity. The long-lived broker owns the single cross-process truth for both principals across all `Accept=no` parser invocations: independent volatile token buckets have capacity four and refill exactly one token per ten monotonic seconds, and each principal has exactly one active connection-bound lease. An acquire consumes one token, succeeds only when that principal has no lease, and holds a broker connection open until the lease's idempotent `release()` closes it; EOF, peer death, broker shutdown, or client close releases the slot. The broker verifies `SO_PEERCRED`, caps queued/partially framed clients at 16, applies one absolute ten-second acquisition deadline without byte-progress refresh, parses one <=256-byte canonical request, and never reads a protected deployment value. Restart loses all tokens/leases and forces every connected parser to fail closed; it persists nothing and exports no refill, reset, principal, capacity, or clock mutation port. Cross-process simultaneous acquire, fourth/fifth token, 9,999/10,000-ms refill, slowloris, 16/17 clients, flood, disconnect, restart, and principal-isolation tests are mandatory.
- `proxy-gateway-control-session-limit-broker.socket` is one fixed root-owned mode-`0600`, `Accept=no` socket. Its long-lived hardened service receives the listening socket through `node-helper-entry session-limit-broker-v1`, accepts all bounded broker clients itself, and is required before either protocol socket becomes reachable. Each deploy/bootstrap protocol socket has `Backlog=16`; each parser service has the fixed `[Unit]` tuple `StartLimitIntervalSec=60`, `StartLimitBurst=16`, and `StartLimitAction=none`. The per-principal native relay `flock` remains the stronger pre-connect one-active-or-pending bound even if this broker/parser layer is down. One maximum terminal-bundle read consumes one kernel relay lock, one broker token, one active lease, and one deploy parser start while streaming all 342 frames; it never consumes 342 tokens or starts. `control-plane-bootstrap-systemd-contract.test.mjs` reads these exact unit relationships and rejects a missing/writable/symlink relay lock, per-connection broker activation, `Accept=yes`, a generic broker socket, a request-supplied principal, or a start-limit tuple below the fixed admissible rate.
- Export `createVolatileChallengeBroker({ native, clock, randomBytes, challengeContract })` and `createChallengeBrokerClient({ socketPathId })`. Construction first proves the complete Foundation vector and only then calls injected `randomBytes(32)` exactly once to generate the root-only HMAC key internally; there is no caller-supplied key/materializer or pre-probe protected value. Before every issue, the broker purges expired entries, enforces a hard map capacity of 64, and consumes one token from a per-principal volatile bucket of capacity 4 refilled at one token per 15 seconds. It inserts only after purge/cap/rate checks. The long-lived broker implements only `issue({ canonicalChallengeBodyBytes, expiresAt })` and `consume({ challengeId, challengeHmacSha256, now }) -> { canonicalChallengeBodyBytes }`; it strictly parses the body, HMACs/stores those exact bytes, deletes atomically on consume, and returns them for byte comparison with the second request/current readback. It holds its 256-bit HMAC key and one-use map only in process memory and zeroes the key on shutdown. Its fixed root-only Unix socket allows two independent forced-command processes to share a 60-second challenge. Restart invalidates all challenges; no challenge/key enters durable store. Slowloris, 64/65 capacity, purge-before-insert, per-principal isolation, refill boundary, flood, restart, and concurrent consume tests are mandatory.
- `scripts/control-plane-deploy-root.mjs` and `scripts/control-plane-bootstrap-root.mjs` accept zero argv and receive only the accepted connected socket as FD 3 through the reviewed clean-environment helper. The deploy script constructs exactly one `createBootstrapMaintenanceCoordinator({ native, clock })` capability and injects that same reference into its sole `createHostProtocolRouter` with the fixed deploy session client; it neither clones nor constructs maintenance inside a handler. The bootstrap script constructs only `createBootstrapProtocolRouter` with the fixed bootstrap session client and the existing `createBootstrapRootLauncher`. Normal inventory/status-family requests write one response and close; compatibility inventory writes one response and closes; activation alone writes internal ready then final terminal. Execute-auth enforces a 10-second pre-auth deadline, runs the admission maintenance preflight before any accepted-plan write, writes ready only after publication/reservation, consumes the exact artifact continuation under a separate 300-second deadline in the same connection, detaches only after verification, attempts the five-field acknowledgment, and closes. Bootstrap activation calls `run` once; transport consumes its safe three-field ready phase and returns only the safe six-field activation response to the caller. Sudo launches only the tiny native root relay; neither `sshd` nor sudo directly launches either Node script.
- The unprivileged forced-command C shims can execute only their exact no-argument sudo/root-relay transition. Each root relay first holds its own validated fixed `flock`, then can connect only to its fixed root-owned mode-`0600` protocol socket with the pre-connect absolute deadline. `Accept=no` systemd activation starts one root service inside its complete sandbox; `node-helper-entry` validates `LISTEN_PID/FDS`, calls `accept4(3, ...)`, verifies the fixed root peer, and replaces FD 3 with only that connection before Node parses a byte. Neither helper nor parser can refresh or extend the relay-enforced absolute deadline. The Node parser applies `umask(0077)`, asserts `process.getgroups()` is empty without calling `setgroups`, uses `/`, enforces the exact locale/PATH allowlist plus phase bounds/token bucket/single slot, and never imports `child_process`, opens a systemd manager socket, or receives a unit/path/executable. Transaction start uses only the Host fixed broker client, and every durable mutation uses fixed directory capabilities plus semantic logical IDs. Target-Linux tests read back locks, groups, environment, cwd, and `/proc/self/fd`, then require `EACCES` for a wrong relay/socket and `EPERM` for manager, process-spawn, mount, namespace, ptrace, keyctl, and privilege-escalation attempts, with pre/post state unchanged.

The production verifier directly consumes the Artifact owner:

```js
import {
  deriveProductionAuthorizationOidcAudience,
  validateProductionAuthorizationRecord,
} from './control-plane-production-authorization.mjs';
import { sha256Hex } from './canonical-json.mjs';

function verifyProductionAuthorizationOidcClaims({ claims, authorization, audience, now }) {
  const exact = Object.freeze({
    iss: 'https://token.actions.githubusercontent.com',
    aud: audience,
    sub: `repo:${authorization.repository}:environment:${authorization.environment}`,
    repository: authorization.repository,
    event_name: authorization.eventName,
    environment: authorization.environment,
    workflow_ref: authorization.workflowRef,
    workflow_sha: authorization.workflowSha,
    ref: authorization.sourceRef,
    sha: authorization.sourceSha,
    run_id: authorization.runId,
    run_attempt: String(authorization.runAttempt),
    runner_environment: authorization.runnerEnvironment,
  });
  for (const [name, value] of Object.entries(exact)) {
    if (claims[name] !== value) throw new Error('production_authorization_oidc_claim_invalid');
  }
  const nowSeconds = Math.floor(now / 1_000);
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf)
      || !Number.isSafeInteger(claims.exp) || claims.iat < 0 || claims.nbf < 0
      || claims.exp <= claims.iat || claims.exp <= claims.nbf
      || claims.iat > nowSeconds + 30
      || claims.nbf > nowSeconds + 30 || claims.exp <= nowSeconds
      || claims.exp - claims.iat > 300
      || !/^[A-Za-z0-9._:-]{1,128}$/.test(claims.jti)) {
    throw new Error('production_authorization_oidc_time_or_jti_invalid');
  }
}

export const VERIFIED_INSTALLED_EXPECTATION_FIELDS = Object.freeze([
  'bootstrapGeneration', 'bootstrapReceiptSha256', 'bootstrapStateSha256',
  'authorizationBindingHmacSha256', 'authorizationGeneration',
  'databaseContractsSha256', 'hostExecutionContractSha256',
]);
const verifiedInstalledExpectations = new WeakSet();

function brandInstalledExpectation({ installedExpectation, authorization, expected }) {
  if (installedExpectation === null || typeof installedExpectation !== 'object'
      || Object.getPrototypeOf(installedExpectation) !== Object.prototype
      || Object.keys(installedExpectation).some(
        (field, index) => field !== VERIFIED_INSTALLED_EXPECTATION_FIELDS[index],
      ) || Reflect.ownKeys(installedExpectation).length !== VERIFIED_INSTALLED_EXPECTATION_FIELDS.length
      || Object.values(Object.getOwnPropertyDescriptors(installedExpectation)).some(
        (descriptor) => descriptor.get || descriptor.set,
      )) {
    throw new Error('installed_expectation_invalid');
  }
  const value = Object.freeze(Object.fromEntries(VERIFIED_INSTALLED_EXPECTATION_FIELDS.map((field) => {
    if (installedExpectation[field] !== authorization[field]
        || installedExpectation[field] !== expected[field]) {
      throw new Error('installed_expectation_invalid');
    }
    return [field, installedExpectation[field]];
  })));
  verifiedInstalledExpectations.add(value);
  return value;
}

export function assertVerifiedInstalledExpectation(value) {
  if (!verifiedInstalledExpectations.has(value)) throw new Error('installed_expectation_unverified');
  return value;
}

export function createAuthorizationVerifier({ oidcVerifier, installedStateReader, clock }) {
  return Object.freeze({
    async verify({ authorizationRecordBytes, oidcTokenBytes }) {
      if (!Buffer.isBuffer(oidcTokenBytes)) throw new Error('production_authorization_oidc_token_invalid');
      const ownedTokenBytes = oidcTokenBytes;
      try {
        const expected = await installedStateReader.readProductionAuthorizationExpectation();
        const validated = validateProductionAuthorizationRecord({
          bytes: authorizationRecordBytes,
          expected,
          now: clock.nowIso(),
        });
        const authorization = validated.value;
        const authorizationRecordSha256 = validated.sha256;
        if (authorizationRecordSha256 !== sha256Hex(authorizationRecordBytes)) {
          throw new Error('production_authorization_digest_invalid');
        }
        const audience = deriveProductionAuthorizationOidcAudience(authorizationRecordSha256);
        const claims = await oidcVerifier.verify({ tokenBytes: ownedTokenBytes, audience });
        verifyProductionAuthorizationOidcClaims({ claims, authorization, audience, now: clock.now() });
        const installed = await installedStateReader.verifyProductionAuthorization({ authorization, expected });
        const installedExpectation = brandInstalledExpectation({
          installedExpectation: installed.installedExpectation,
          authorization,
          expected,
        });
        return Object.freeze({
          authorization,
          artifact: Object.freeze({ artifactSize: installed.artifactSize, artifactSha256: installed.artifactSha256 }),
          installedExpectation,
          authorizationRecordSha256,
          oidcJtiSha256: sha256Hex(Buffer.from(claims.jti, 'utf8')),
          oidcTokenSha256: sha256Hex(ownedTokenBytes),
        });
      } finally {
        ownedTokenBytes.fill(0);
      }
    },
  });
}
```

The sole production JWT trust factory is implemented in its own module; the helpers named below are private to that file and are tested directly through the public factory:

```js
export const GITHUB_ACTIONS_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_ACTIONS_OIDC_DISCOVERY_URL =
  'https://token.actions.githubusercontent.com/.well-known/openid-configuration';
export const GITHUB_ACTIONS_OIDC_ALLOWED_ALGORITHMS = Object.freeze(['RS256']);

export function createGitHubActionsOidcVerifier({ fetchFn, crypto, clock }) {
  let cachedJwks = null;

  async function readCurrentJwks() {
    const now = clock.monotonicNow();
    if (cachedJwks !== null && now < cachedJwks.loadedAt) {
      throw new Error('github_oidc_clock_regressed');
    }
    if (cachedJwks !== null && now >= cachedJwks.loadedAt && now < cachedJwks.expiresAt) {
      return cachedJwks.keys;
    }
    const discovery = await fetchBoundedJson(fetchFn, GITHUB_ACTIONS_OIDC_DISCOVERY_URL, {
      maximumBytes: 65_536,
      timeoutMs: 5_000,
      redirect: 'error',
    });
    if (discovery.issuer !== GITHUB_ACTIONS_OIDC_ISSUER
        || discovery.jwks_uri !== `${GITHUB_ACTIONS_OIDC_ISSUER}/.well-known/jwks`
        || Reflect.ownKeys(discovery).some((key) => forbiddenDiscoveryKey(key))) {
      throw new Error('github_oidc_discovery_invalid');
    }
    const jwks = await fetchBoundedJson(fetchFn, discovery.jwks_uri, {
      maximumBytes: 65_536,
      timeoutMs: 5_000,
      redirect: 'error',
    });
    const keys = validateClosedRs256Jwks(jwks, { maximumKeys: 16 });
    cachedJwks = Object.freeze({ loadedAt: now, expiresAt: now + 300_000, keys });
    return keys;
  }

  return Object.freeze({
    async verify({ tokenBytes, audience }) {
      const token = parseBoundedCanonicalJwt(tokenBytes, { maximumBytes: 32_768 });
      if (token.header.alg !== 'RS256' || typeof token.header.kid !== 'string'
          || token.header.kid.length < 1 || token.header.kid.length > 128
          || Object.hasOwn(token.header, 'crit')) {
        throw new Error('github_oidc_header_invalid');
      }
      const keys = await readCurrentJwks();
      const matches = keys.filter((key) => key.kid === token.header.kid);
      if (matches.length !== 1) throw new Error('github_oidc_key_not_unique');
      if (!crypto.verify('RSA-SHA256', token.signingInput, matches[0].publicKey, token.signature)) {
        throw new Error('github_oidc_signature_invalid');
      }
      if (token.claims.iss !== GITHUB_ACTIONS_OIDC_ISSUER || token.claims.aud !== audience) {
        throw new Error('github_oidc_issuer_or_audience_invalid');
      }
      return Object.freeze({ ...token.claims });
    },
  });
}
```

`fetchBoundedJson` always sends only `Accept: application/json`, uses an injected abort timer, requires one `200` HTTPS response from the exact requested origin, rejects redirects/content encoding/content-type drift before reading, caps bytes while streaming, and calls `parseJsonRejectDuplicateKeys`. `parseBoundedCanonicalJwt` accepts exactly three unpadded canonical base64url segments, rejects duplicate JSON keys/non-plain objects/extra protected-header fields/non-integer time claims, and returns owned signing/signature buffers that are overwritten after verification. `validateClosedRs256Jwks` accepts exactly one `keys` array, distinct nonempty `kid`, `kty=RSA`, `use=sig`, `alg=RS256`, canonical base64url modulus/exponent, and imports public keys only through injected `crypto`; it rejects `x5u`, private parameters, and unknown key members. Tests use a local injected response object and generated synthetic RSA keypair to prove signature success plus redirect, stale-cache, cross-origin, algorithm confusion, duplicate-key, duplicate-JSON-key, malformed-base64url, body-bound, timeout, and no-stale-fallback failures without a socket or proxy.

The closeout owner implementation is concrete and shared, rather than prose-only:

```js
import { serializeCanonicalJsonBytes, sha256Hex } from './canonical-json.mjs';

export const CLOSEOUT_TRANSITIONS = Object.freeze([
  'upload_started',
  'upload_committed_observed',
]);

export const CLOSEOUT_TRANSITION_BINDING_FIELDS = Object.freeze([
  'schemaVersion', 'domain', 'transition', 'repository', 'workflowPath',
  'workflowRef', 'workflowSha', 'environment',
  'runId', 'runAttempt', 'controllerRecoveryId', 'terminalReceiptSha256',
  'expectedCloseoutRecordSha256', 'actionsArtifactObservationSha256',
]);

const SHA256 = /^[0-9a-f]{64}$/;
const CLOSEOUT_TRANSITION_BINDING_CONTRACT = Object.freeze({
  schemaId: 'controller-closeout-transition-v1',
  maxBytes: 2_048,
  fieldOrder: CLOSEOUT_TRANSITION_BINDING_FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== '1' || value.domain !== 'controller-closeout-transition'
        || !CLOSEOUT_TRANSITIONS.includes(value.transition)
        || value.repository !== 'gccwebos-com/proxy-gateway-minimal'
        || value.workflowPath !== '.github/workflows/japan-control-plane-production-deploy.yml'
        || value.workflowRef !== 'gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-control-plane-production-deploy.yml@refs/heads/master'
        || !/^[0-9a-f]{40}$/.test(value.workflowSha)
        || value.environment !== 'vultr-japan-production'
        || !/^[1-9][0-9]{0,19}$/.test(value.runId) || value.runAttempt !== 1
        || !/^cr1\.[0-9a-f]{64}$/.test(value.controllerRecoveryId)
        || !SHA256.test(value.terminalReceiptSha256)
        || !SHA256.test(value.expectedCloseoutRecordSha256)) {
      throw new Error('closeout_transition_binding_invalid');
    }
    if (value.transition === 'upload_started' && value.actionsArtifactObservationSha256 !== null) {
      throw new Error('closeout_transition_observation_forbidden');
    }
    if (value.transition === 'upload_committed_observed' && !SHA256.test(value.actionsArtifactObservationSha256)) {
      throw new Error('closeout_transition_observation_required');
    }
  },
});

function encodeCanonicalBase64(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 32_768) {
    throw new Error('closeout_transition_oidc_token_invalid');
  }
  return bytes.toString('base64');
}

function createCloseoutFrameContract(type, transition) {
  return Object.freeze({
    schemaId: `${type}-v1`,
    maxBytes: 65_536,
    fieldOrder: Object.freeze(['type', ...CLOSEOUT_TRANSITION_BINDING_FIELDS, 'bindingSha256', 'audience', 'oidcTokenBytesBase64']),
    nested: Object.freeze({}),
    arrays: Object.freeze({}),
    validate(value) {
      if (value.type !== type || value.transition !== transition || !SHA256.test(value.bindingSha256)) {
        throw new Error('closeout_transition_frame_invalid');
      }
      const bindingValue = Object.freeze(Object.fromEntries(
        CLOSEOUT_TRANSITION_BINDING_FIELDS.map((field) => [field, value[field]]),
      ));
      const bindingBytes = serializeCanonicalJsonBytes(bindingValue, CLOSEOUT_TRANSITION_BINDING_CONTRACT);
      const bindingSha256 = sha256Hex(bindingBytes);
      const audience = deriveCloseoutTransitionOidcAudience({ transition, bindingSha256 });
      let tokenBytes;
      try {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.oidcTokenBytesBase64)) {
          throw new Error('closeout_transition_frame_invalid');
        }
        tokenBytes = Buffer.from(value.oidcTokenBytesBase64, 'base64');
        if (tokenBytes.length < 1 || tokenBytes.length > 32_768
            || tokenBytes.toString('base64') !== value.oidcTokenBytesBase64
            || bindingSha256 !== value.bindingSha256 || value.audience !== audience) {
          throw new Error('closeout_transition_frame_invalid');
        }
      } finally {
        tokenBytes?.fill(0);
      }
    },
  });
}

const CLOSEOUT_TRANSITION_FRAME_CONTRACTS = Object.freeze({
  status_closeout_upload_started: createCloseoutFrameContract('status_closeout_upload_started', 'upload_started'),
  status_closeout_ack: createCloseoutFrameContract('status_closeout_ack', 'upload_committed_observed'),
});

export function createCloseoutTransitionBinding(input) {
  const value = Object.freeze({
    schemaVersion: '1',
    domain: 'controller-closeout-transition',
    transition: input.transition,
    repository: input.repository,
    workflowPath: input.workflowPath,
    workflowRef: input.workflowRef,
    workflowSha: input.workflowSha,
    environment: input.environment,
    runId: input.runId,
    runAttempt: input.runAttempt,
    controllerRecoveryId: input.controllerRecoveryId,
    terminalReceiptSha256: input.terminalReceiptSha256,
    expectedCloseoutRecordSha256: input.expectedCloseoutRecordSha256,
    actionsArtifactObservationSha256: input.actionsArtifactObservationSha256,
  });
  const bytes = serializeCanonicalJsonBytes(value, CLOSEOUT_TRANSITION_BINDING_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function deriveCloseoutTransitionOidcAudience({ transition, bindingSha256 }) {
  if (!CLOSEOUT_TRANSITIONS.includes(transition) || !/^[0-9a-f]{64}$/.test(bindingSha256)) {
    throw new Error('closeout_transition_audience_invalid');
  }
  return `gccgw-control-plane-closeout-${transition}:${bindingSha256}`;
}

function encodeCloseoutTransitionFrame(type, requiredTransition, { binding, oidcTokenBytes }) {
  if (binding.value.transition !== requiredTransition || sha256Hex(binding.bytes) !== binding.sha256) {
    throw new Error('closeout_transition_binding_invalid');
  }
  const audience = deriveCloseoutTransitionOidcAudience({
    transition: requiredTransition,
    bindingSha256: binding.sha256,
  });
  const value = Object.freeze({
    type,
    ...binding.value,
    bindingSha256: binding.sha256,
    audience,
    oidcTokenBytesBase64: encodeCanonicalBase64(oidcTokenBytes),
  });
  const frameBytes = Buffer.concat([
    serializeCanonicalJsonBytes(value, CLOSEOUT_TRANSITION_FRAME_CONTRACTS[type]),
    Buffer.from('\n'),
  ]);
  if (frameBytes.length > 65_536) throw new Error('closeout_transition_frame_too_large');
  return frameBytes;
}

export const encodeCloseoutUploadStartedFrame = (input) =>
  encodeCloseoutTransitionFrame('status_closeout_upload_started', 'upload_started', input);
export const encodeCloseoutAckFrame = (input) =>
  encodeCloseoutTransitionFrame('status_closeout_ack', 'upload_committed_observed', input);

const verifiedCloseoutTransitions = new WeakSet();

function verifyCloseoutOidcClaims({ claims, binding, terminal, audience, now }) {
  const exact = Object.freeze({
    iss: 'https://token.actions.githubusercontent.com',
    aud: audience,
    sub: `repo:${binding.repository}:environment:${binding.environment}`,
    repository: binding.repository,
    event_name: terminal.eventName,
    environment: binding.environment,
    workflow_ref: binding.workflowRef,
    workflow_sha: binding.workflowSha,
    ref: terminal.sourceRef,
    sha: terminal.sourceSha,
    run_id: binding.runId,
    run_attempt: String(binding.runAttempt),
    runner_environment: terminal.runnerEnvironment,
  });
  for (const [name, expected] of Object.entries(exact)) {
    if (claims[name] !== expected) throw new Error('closeout_transition_oidc_claim_invalid');
  }
  const nowSeconds = Math.floor(now / 1_000);
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf)
      || !Number.isSafeInteger(claims.exp) || claims.iat < 0 || claims.nbf < 0
      || claims.exp <= claims.iat || claims.exp <= claims.nbf
      || claims.iat > nowSeconds + 30 || claims.nbf > nowSeconds + 30
      || claims.exp <= nowSeconds || claims.exp - claims.iat > 300
      || !/^[A-Za-z0-9._:-]{1,128}$/.test(claims.jti)) {
    throw new Error('closeout_transition_oidc_time_or_jti_invalid');
  }
}

export async function verifyCloseoutTransitionOidc({ frame, oidcVerifier, terminalVerifier, clock }) {
  const contract = CLOSEOUT_TRANSITION_FRAME_CONTRACTS[frame?.type];
  if (contract === undefined) throw new Error('closeout_transition_type_invalid');
  contract.validate(frame);
  serializeCanonicalJsonBytes(frame, contract);
  const bindingValue = Object.freeze(Object.fromEntries(
    CLOSEOUT_TRANSITION_BINDING_FIELDS.map((field) => [field, frame[field]]),
  ));
  const bindingBytes = serializeCanonicalJsonBytes(bindingValue, CLOSEOUT_TRANSITION_BINDING_CONTRACT);
  const bindingSha256 = sha256Hex(bindingBytes);
  const audience = deriveCloseoutTransitionOidcAudience({
    transition: bindingValue.transition,
    bindingSha256,
  });
  if (frame.bindingSha256 !== bindingSha256 || frame.audience !== audience) {
    throw new Error('closeout_transition_binding_invalid');
  }
  const terminal = await terminalVerifier.verifyCloseoutBinding(bindingValue);
  let tokenBytes;
  try {
    tokenBytes = Buffer.from(frame.oidcTokenBytesBase64, 'base64');
    if (tokenBytes.length < 1 || tokenBytes.length > 32_768
        || tokenBytes.toString('base64') !== frame.oidcTokenBytesBase64) {
      throw new Error('closeout_transition_oidc_token_invalid');
    }
    const claims = await oidcVerifier.verify({ tokenBytes, audience });
    verifyCloseoutOidcClaims({ claims, binding: bindingValue, terminal, audience, now: clock.now() });
    const verified = Object.freeze({
      binding: bindingValue,
      bindingSha256,
      oidcJtiSha256: sha256Hex(Buffer.from(claims.jti, 'utf8')),
      oidcTokenSha256: sha256Hex(tokenBytes),
    });
    verifiedCloseoutTransitions.add(verified);
    return verified;
  } finally {
    tokenBytes?.fill(0);
  }
}

export function assertVerifiedCloseoutTransition(value) {
  if (value === null || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
      || !verifiedCloseoutTransitions.has(value)) {
    throw new Error('closeout_transition_not_verified');
  }
  return value;
}
```

- [ ] **Step 1: Write failing closed-type and exact response-codec tests**

```js
test('router accepts only the ten closed execute, inventory, activation, and status families', () => {
  assert.deepEqual(HOST_REQUEST_TYPES, [
    'execute_auth',
    'inventory_normal',
    'inventory_compatibility',
    'bootstrap_activation',
    'status',
    'status_terminal_bundle_chunk',
    'status_closeout_upload_started',
    'status_closeout_ack',
    'status_recover_challenge',
    'status_recover',
  ]);
  assert.throws(() => parseHostRequestFrame(Buffer.from('{"type":"command","argv":["id"]}\n')), /request_type_rejected/);
});

test('normal and compatibility inventory codecs are distinct and pre-Production-Gate', () => {
  const normal = encodeNormalInventoryRequestFrame(validNormalInventoryRequest());
  const compatibility = encodeCompatibilityInventoryRequestFrame(validCompatibilityInventoryRequest());
  for (const bytes of [normal, compatibility]) {
    const value = parseHostRequestFrame(bytes).value;
    assert.equal(Object.hasOwn(value, 'gateId'), false);
    assert.equal(Object.hasOwn(value, 'deploymentPlanSha256'), false);
    assert.equal(Object.hasOwn(value, 'transactionId'), false);
  }
  assert.throws(() => validateCompatibilityInventoryResponseFrame(
    encodeNormalInventoryResponseFrame(validNormalInventoryResponse()),
    expectedCompatibilityInventory(),
  ), /inventory_response_type_rejected/);
  assert.throws(() => validateNormalInventoryResponseFrame(
    encodeCompatibilityInventoryResponseFrame(validCompatibilityInventoryResponse()),
    expectedNormalInventory(),
  ), /inventory_response_type_rejected/);
});

test('routers consume only the Host-owned branded inventory pair', async () => {
  const hostInventoryReaders = createControlPlaneHostInventoryReaders(hostInventoryHarness());
  assert.deepEqual(Object.keys(hostInventoryReaders), [
    'normalInventoryReader', 'compatibilityInventoryReader',
  ]);
  assert.deepEqual(Object.keys(hostInventoryReaders.normalInventoryReader), ['read']);
  assert.deepEqual(Object.keys(hostInventoryReaders.compatibilityInventoryReader), ['read']);
  assert.throws(
    () => createHostProtocolRouter(createProtocolHarness({
      hostInventoryReaders: Object.freeze({ ...hostInventoryReaders }),
    })),
    /host_inventory_readers_not_verified/,
  );
  assert.throws(
    () => createBootstrapProtocolRouter(createBootstrapProtocolHarness({
      normalInventoryReader: hostInventoryReaders.normalInventoryReader,
      compatibilityInventoryReader: hostInventoryReaders.compatibilityInventoryReader,
    })),
    /host_inventory_readers_required/,
  );
  const deploy = createHostProtocolRouter(createProtocolHarness({ hostInventoryReaders }));
  const bootstrap = createBootstrapProtocolRouter(createBootstrapProtocolHarness({ hostInventoryReaders }));
  await assert.rejects(deploy.handleSession(validCompatibilityInventorySession()), /deploy_request_type_rejected/);
  await assert.rejects(bootstrap.handleSession(validNormalInventorySession()), /bootstrap_request_type_rejected/);
});

test('deploy router consumes only the singleton owner-branded maintenance capability', () => {
  const bootstrapMaintenance = createBootstrapMaintenanceCoordinator(maintenanceHarness());
  assert.throws(
    () => createHostProtocolRouter(createProtocolHarness({
      bootstrapMaintenance: Object.freeze({ ...bootstrapMaintenance }),
    })),
    /bootstrap_maintenance_not_verified/,
  );
  assert.doesNotThrow(() => createHostProtocolRouter(createProtocolHarness({ bootstrapMaintenance })));
});

test('bootstrap activation is Gate-bound and never compatibility inventory', async () => {
  const operationEnvelopeBytes = createBootstrapOperationEnvelope(validBootstrapOperationInput()).bytes;
  const requestBytes = encodeBootstrapActivationRequestFrame({
    requestId: `bar1.${'1'.repeat(64)}`,
    activationId: validBootstrapOperationInput().activationId,
    activationRecordSha256: validBootstrapOperationInput().activationRecordSha256,
    bootstrapActivationGateReceiptSha256: validBootstrapOperationInput().bootstrapActivationGateReceiptSha256,
    operationEnvelopeBytes,
  });
  const calls = [];
  const bootstrap = createBootstrapProtocolRouter(createBootstrapProtocolHarness({ calls }));
  const session = bootstrapSession(requestBytes);
  await bootstrap.handleSession(session);
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'session_limit:acquire:github-control-bootstrap',
    'bootstrap_root_launcher:validate_current_record_gate_expiry_principal_fence',
    'io:write:bootstrap_activation_ready_v1',
    'bootstrap_root_launcher:claim_and_run:same_exact_operation_envelope_bytes',
    'io:write:bootstrap_activation_response_v1',
    'session_limit:release:github-control-bootstrap',
  ]);
  assert.equal(session.writtenFrames.length, 2);
  assert.deepEqual(validateBootstrapActivationReadyFrame(session.writtenFrames[0], {
    requestId: `bar1.${'1'.repeat(64)}`,
    activationId: validBootstrapOperationInput().activationId,
  }).type, 'bootstrap_activation_ready_v1');
  const responseBytes = session.writtenFrames[1];
  assert.deepEqual(Object.keys(validateBootstrapActivationResponseFrame(responseBytes, {
    requestId: `bar1.${'1'.repeat(64)}`,
    activationId: validBootstrapOperationInput().activationId,
  })), [
    'type', 'requestType', 'requestId', 'activationId', 'activationState', 'terminalResultSha256',
  ]);
  assert.throws(
    () => validateCompatibilityInventoryResponseFrame(responseBytes, expectedCompatibilityInventory()),
    /inventory_response_type_rejected/,
  );
  const deploy = createHostProtocolRouter(createProtocolHarness({ calls: [] }));
  await assert.rejects(deploy.handleSession(bootstrapSession(requestBytes)), /deploy_request_type_rejected/);
});

test('stale or drifted bootstrap approval evidence performs zero mutation', async () => {
  for (const drift of [
    'activationId', 'activationRecordSha256', 'bootstrapActivationGateReceiptSha256',
    'operationEnvelopeBytesBase64', 'requestedAt', 'expiresAt',
  ]) {
    const calls = [];
    const bootstrap = createBootstrapProtocolRouter(createBootstrapProtocolHarness({ calls, drift }));
    await assert.rejects(bootstrap.handleSession(driftedBootstrapActivationSession(drift)));
    assert.equal(calls.includes('io:write:bootstrap_activation_ready_v1'), false);
    assert.equal(calls.some((call) => /machine:claim|systemd_broker:start|rotation:mutate/.test(call)), false);
  }
});

test('bootstrap activation ready failure or disconnect performs zero mutation', async () => {
  for (const readyFailure of ['write_rejected', 'disconnect', 'timeout_at_10000']) {
    const calls = [];
    const bootstrap = createBootstrapProtocolRouter(createBootstrapProtocolHarness({ calls }));
    await assert.rejects(
      bootstrap.handleSession(bootstrapSession(validBootstrapActivationRequestBytes(), { readyFailure })),
      /bootstrap_activation_ready_not_confirmed/,
    );
    assert.equal(calls.some((call) => /machine:claim|systemd_broker:start|rotation:mutate/.test(call)), false);
  }
});

test('recovery status cannot execute, ack, cas, attach, or rewrite host state', async () => {
  const calls = [];
  const router = createHostProtocolRouter(createProtocolHarness({ calls }));
  await router.handleStatusFrame(validRecoverFrame());
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'challenge:consume',
    'oidc:verify_recovery_audience',
    'retained_index:read_exact_one',
    'terminal_record:read_exact',
  ]);
});

test('ready, accepted, and status responses have non-interchangeable exact codecs', () => {
  const ready = encodeReadyForArtifactFrame(validReadyValue());
  assert.equal(validateReadyForArtifactFrame(ready, expectedReady()).type, 'ready_for_artifact_v1');
  assert.throws(() => validateArtifactAcceptedFrame(ready, expectedAccepted()), /response_type_rejected/);
  const accepted = encodeArtifactAcceptedFrame(validAcceptedValue());
  const acceptedValue = validateArtifactAcceptedFrame(accepted, expectedAccepted());
  assert.deepEqual(Object.keys(acceptedValue), [
    'gateId', 'deploymentPlanSha256', 'transactionId', 'acceptedAt', 'accepted',
  ]);
  assert.equal(acceptedValue.accepted, true);
  const status = encodeStatusResponseFrame(validStatusValue());
  const statusValue = validateStatusResponseFrame(status, expectedStatus());
  assert.deepEqual(Object.keys(statusValue), [
    'type', 'requestType', 'requestId', 'gateId', 'deploymentPlanSha256',
    'transactionId', 'controllerRecoveryId', 'immutableTerminal',
    'durableRejection', 'resultCode', 'hostFinalState',
    'terminalReceiptSha256', 'closeoutState', 'closeoutRecordSha256',
    'terminalBundleSha256', 'terminalBundleSize',
  ]);
  assert.equal(statusValue.type, 'status_response_v1');
});

test('transport envelope is never substituted for bounded response bytes', () => {
  const responseBytes = encodeStatusResponseFrame(validStatusValue());
  const envelope = validateTransportEnvelope(Object.freeze({ exitCode: 0, responseBytes, diagnosticCode: null }));
  assert.ok(Buffer.isBuffer(envelope.responseBytes));
  assert.ok(envelope.responseBytes.length <= 2_048);
  assert.throws(() => validateStatusResponseFrame(envelope, expectedStatus()), /response_bytes_required/);
  assert.equal(validateStatusResponseFrame(envelope.responseBytes, expectedStatus()).type, 'status_response_v1');
});

test('ordinary status authority is only Gate plan and transaction; requestId is correlation', () => {
  const expected = Object.freeze({
    requestId: `status1.${'1'.repeat(64)}`,
    gateId: `pg1.${'2'.repeat(40)}.runtime-contract.${'3'.repeat(64)}`,
    deploymentPlanSha256: '4'.repeat(64),
    transactionId: `dpt1.${'5'.repeat(64)}`,
  });
  const frame = encodeStatusRequestFrame(expected);
  assert.deepEqual(Object.keys(parseHostRequestFrame(frame).value), [
    'type', 'requestId', 'gateId', 'deploymentPlanSha256', 'transactionId',
  ]);
  for (const forbidden of ['controllerRecoveryId', 'productionGateReceiptSha256', 'planSha256']) {
    assert.throws(() => encodeStatusRequestFrame({ ...expected, [forbidden]: 'synthetic' }), /status_request_unknown_field/);
  }
});

test('terminal bundle reader owns one authenticated contiguous stream and returns opaque exact bytes', async () => {
  const bundle = validTerminalBundleBytes({ totalBytes: 3_017 });
  const transport = terminalBundleTransportHarness({ bundle });
  const status = validateStatusResponseFrame(
    encodeStatusResponseFrame(validTerminalStatus({
      terminalBundleSha256: sha256Hex(bundle),
      terminalBundleSize: bundle.length,
    })),
    expectedStatus(),
  );
  const complete = await readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30_000 });
  assert.deepEqual(complete.bytes, bundle);
  assert.equal(complete.sha256, sha256Hex(bundle));
  assert.deepEqual(transport.calls, [{
    method: 'requestStatusBundle',
    credentialId: DEPLOY_CREDENTIAL_ID,
    timeoutMs: 30_000,
    requestCount: 1,
    responseFrameCount: 4,
  }]);
  await assert.rejects(readTerminalBundleBytes({
    transport: terminalBundleTransportHarness({ bundle, driftOffsetAt: 1 }),
    validatedStatus: status,
    timeoutMs: 30_000,
  }), /terminal_bundle_chunk_invalid/);
  assert.equal(Object.hasOwn(complete, 'path'), false);
});

test('maximum terminal bundle uses one service start token and exactly 342 streamed frames', async () => {
  const bundle = Buffer.alloc(TERMINAL_BUNDLE_MAX_BYTES, 0x5a);
  const transport = terminalBundleTransportHarness({ bundle });
  const status = validatedMaximumTerminalStatus(bundle);
  const complete = await readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30_000 });
  assert.equal(complete.bytes.length, 262_144);
  assert.deepEqual(transport.calls, [{
    method: 'requestStatusBundle',
    credentialId: DEPLOY_CREDENTIAL_ID,
    timeoutMs: 30_000,
    requestCount: 1,
    responseFrameCount: 342,
  }]);
  assert.deepEqual(transport.sessionLimitEvents, ['acquire:github-control-deploy', 'release:github-control-deploy']);
  assert.equal(transport.acceptNoServiceStarts, 1);
});

test('long-lived limiter enforces one cross-process slot and absolute bucket boundaries', async () => {
  const broker = createSessionLimitBroker(sessionLimitHarness({
    principals: SESSION_LIMIT_PRINCIPALS,
    capacity: 4,
    refillMilliseconds: 10_000,
  }));
  const deployA = broker.createClient({ fixedPrincipal: 'github-control-deploy', processId: 4101 });
  const deployB = broker.createClient({ fixedPrincipal: 'github-control-deploy', processId: 4102 });
  const bootstrap = broker.createClient({ fixedPrincipal: 'github-control-bootstrap', processId: 4103 });
  const lease = await deployA.acquire();
  await assert.rejects(deployB.acquire(), /session_active/);
  const independent = await bootstrap.acquire();
  await lease.release();
  await independent.release();
  await consumeRemainingInitialTokens(deployA, 3);
  await assert.rejects(deployA.acquire(), /session_rate_limited/);
  broker.clock.advance(9_999);
  await assert.rejects(deployA.acquire(), /session_rate_limited/);
  broker.clock.advance(1);
  await (await deployA.acquire()).release();
  assert.equal(broker.maximumActiveObserved('github-control-deploy'), 1);
});

test('limiter rejects slowloris and flood before protected parsing and releases on crash', async () => {
  const harness = crossProcessSessionLimitHarness();
  await harness.openPartialClients(16, { trickleUntilMs: 9_999 });
  await assert.rejects(harness.openPartialClient(), /session_client_capacity/);
  harness.clock.advance(1);
  await harness.assertAllPartialClientsClosed(/session_acquire_deadline/);
  const crashed = await harness.acquireFromProcess(4201, 'github-control-deploy');
  await harness.killProcess(4201);
  assert.equal(await harness.activeLeaseCount('github-control-deploy'), 0);
  await harness.flood({ attempts: 100 });
  assert.equal(harness.protectedParserCalls, 0);
  await crashed.release();
});

test('one controller transport recovers polls and streams the bundle without recapture', async () => {
  const transport = controllerLifetimeTransportHarness();
  const recoveredEnvelope = await transport.request(validRecoveryRequest());
  const recovered = validateRecoveredStatusResponse(recoveredEnvelope.responseBytes, expectedRecovery());
  await assert.rejects(readTerminalBundleBytes({
    transport, validatedStatus: recovered, timeoutMs: 30_000,
  }), /terminal_bundle_status_unverified/);
  const postRecovery = createPostRecoveryStatusRequest({
    validatedRecoveredStatus: recovered,
    requestId: `status1.${'a'.repeat(64)}`,
  });
  const statusEnvelope = await transport.request({
    credentialId: DEPLOY_CREDENTIAL_ID,
    requestBytes: postRecovery.requestBytes,
    timeoutMs: 10_000,
  });
  const status = validateStatusResponseFrame(statusEnvelope.responseBytes, postRecovery.expected);
  await readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30_000 });
  assert.deepEqual(transport.operationKinds, ['recovery', 'status', 'status-bundle']);
  assert.equal(transport.materializeFixedCredentialCalls, 1);
  assert.equal(transport.statusBundleSessions, 1);
});

test('critical ordinary status is terminal only after the Host post-publication brand', async () => {
  const pending = createCrossProcessOrdinaryStatusHarness({ finalizerActive: true });
  assert.deepEqual(await pending.reader.read(validCriticalStatusSelector()), {
    ...validCriticalPendingStatus(),
    immutableTerminal: false,
    durableRejection: false,
    resultCode: 'terminal_quiescence_pending',
    hostFinalState: null,
    terminalReceiptSha256: null,
    closeoutState: null,
    closeoutRecordSha256: null,
    terminalBundleSha256: null,
    terminalBundleSize: null,
  });
  const rejected = createCrossProcessOrdinaryStatusHarness({ criticalFenceUnchanged: false });
  const rejectedStatus = await rejected.reader.read(validCriticalStatusSelector());
  assert.deepEqual(rejectedStatus, {
    ...validCriticalPendingStatus(),
    immutableTerminal: false,
    durableRejection: true,
    resultCode: 'terminal_quiescence_rejected',
    hostFinalState: null,
    terminalReceiptSha256: null,
    closeoutState: null,
    closeoutRecordSha256: null,
    terminalBundleSha256: null,
    terminalBundleSize: null,
  });
  assert.equal(rejected.existingAcceptedTransaction, true);
  assert.equal(classifyOrdinaryPoll(rejectedStatus), 'continue_bounded_poll');
  assert.throws(() => classifyAsAdmissionRejectedNoTransaction(rejectedStatus), /pre_admission_rejection_unreachable/);
  const quiescent = createCrossProcessOrdinaryStatusHarness({
    finalizerActive: false,
    finalizerCgroupPresent: false,
    allTransactionUnitsInactive: true,
    criticalFenceUnchanged: true,
    globalIdentityLeaseFree: true,
    businessMutationLeaseFree: true,
  });
  const terminal = await quiescent.reader.read(validCriticalStatusSelector());
  assert.equal(terminal.immutableTerminal, true);
  assert.equal(terminal.hostFinalState, 'critical_manual_intervention_required');
  assert.deepEqual(quiescent.calls.slice(-3), [
    'host_critical_proof:read_and_verify',
    'host_critical_proof:assert_same_reference',
    'ordinary_status:encode_eligible',
  ]);
  assert.equal(Object.hasOwn(terminal, 'criticalPostPublicationProof'), false);
  assert.equal(classifyOrdinaryPoll(terminal), 'immutable_critical_terminal');
});

test('768-byte raw terminal chunks fit the 2048-byte envelope at real maximum IDs', () => {
  assert.equal(TERMINAL_BUNDLE_CHUNK_BYTES, 768);
  assert.equal(TERMINAL_BUNDLE_MAX_BYTES, 262_144);
  assert.equal(TERMINAL_BUNDLE_MAX_CHUNKS, 342);
  const response = encodeTerminalBundleChunkResponse({
    requestId: `tbs1.${'a'.repeat(64)}`,
    gateId: `pg1.${'b'.repeat(40)}.runtime-contract.${'c'.repeat(64)}`,
    deploymentPlanSha256: 'c'.repeat(64),
    transactionId: `dpt1.${'d'.repeat(64)}`,
    terminalBundleSha256: 'e'.repeat(64),
    totalBytes: 262_144,
    offset: 261_120,
    chunkBytes: Buffer.alloc(768, 0xff),
    eof: false,
  });
  assert.equal(response.length, 1_746);
  assert.ok(response.length <= 2_048, response.length);
  assert.equal(response.at(-1), 0x0a);
  assert.throws(() => encodeTerminalBundleChunkResponse({
    ...validMaximumTerminalChunkResponse(),
    chunkBytes: Buffer.alloc(769, 0xff),
  }), /terminal_bundle_chunk_invalid/);
});

test('closeout frame binds the full flat tuple and changes digest for every field', () => {
  const original = createCloseoutTransitionBinding(validCloseoutBinding({ transition: 'upload_started', actionsArtifactObservationSha256: null }));
  const frame = encodeCloseoutUploadStartedFrame({ binding: original, oidcTokenBytes: syntheticOidcTokenBytes() });
  const parsed = parseHostRequestFrame(frame).value;
  assert.equal(Object.hasOwn(parsed, 'binding'), false);
  assert.equal(parsed.bindingSha256, original.sha256);
  for (const field of CLOSEOUT_TRANSITION_BINDING_FIELDS.slice(2)) {
    const changed = createCloseoutTransitionBinding(driftCloseoutBinding(original.value, field));
    assert.notEqual(changed.sha256, original.sha256, field);
  }
  assert.throws(() => encodeCloseoutAckFrame({ binding: original, oidcTokenBytes: syntheticOidcTokenBytes() }), /closeout_transition_binding_invalid/);
});
```

- [ ] **Step 2: Run protocol tests and verify RED**

Run: `node --test server/tests/control-plane-host-protocol.test.mjs`

Expected: FAIL because the protocol module is absent.

- [ ] **Step 3: Write RED Artifact-authorization/OIDC and atomic replay-ledger tests**

```js
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  buildProductionAuthorizationRecord,
  validateProductionAuthorizationRecord,
} from '../services/deployment/control-plane-production-authorization.mjs';

test('admission verifies exact record and atomically consumes every replay dimension before ready', async () => {
  const calls = [];
  const router = createHostProtocolRouter(createProtocolHarness({ calls }));
  await router.handleSession(validExecuteSession());
  assert.deepEqual(calls.slice(0, 16), [
    'native:probe_all_fourteen_capabilities',
    'installed_state:read_authoritative_expectation',
    'artifact_authorization:validate_exact_bytes_and_derive_audience',
    'oidc:verify_signature_issuer_and_exact_claims',
    'installed_state:verify_exact_tuple',
    'deployment_plan:validate_exact_canonical_bytes',
    'production_gate:validate_exact_canonical_bytes',
    'plan_gate_authorization:cross_check',
    'bootstrap_maintenance:lock_acquire_readback',
    'bootstrap_maintenance:ledger_identity_read',
    'bootstrap_maintenance:compact_eligible_or_noop',
    'bootstrap_maintenance:lock_release_readback',
    'accepted_plan:publish_file_fsync_parent_fsync',
    'accepted_plan:readback_exact',
    'ledger:cas_gate_record_jti_token_transaction',
    'io:write:ready_for_artifact_v1',
  ]);
});

test('admission maintenance handles the 128th to 129th boundary before accepted-plan write', async () => {
  const compactableCalls = [];
  const compactable = createHostProtocolRouter(createProtocolHarness({
    calls: compactableCalls,
    replayEntries: 128,
    eligibleReplayEntries: 1,
  }));
  await compactable.handleSession(validExecuteSession());
  assert.ok(
    compactableCalls.indexOf('bootstrap_maintenance:compact_removed:1')
      < compactableCalls.indexOf('accepted_plan:publish_file_fsync_parent_fsync'),
  );
  assert.equal(compactableCalls.includes('ledger:cas_gate_record_jti_token_transaction'), true);

  const fullCalls = [];
  const full = createHostProtocolRouter(createProtocolHarness({
    calls: fullCalls,
    replayEntries: 128,
    eligibleReplayEntries: 0,
  }));
  await assert.rejects(full.handleSession(validExecuteSession()), /admission_replay_capacity/);
  assert.equal(fullCalls.includes('bootstrap_maintenance:compact_noop'), true);
  assert.equal(fullCalls.some((call) => /accepted_plan:publish|ledger:cas|io:write:ready/.test(call)), false);
});

test('OIDC claim drift and a competing replay CAS perform zero writes and read zero artifact bytes', async () => {
  for (const drift of ['issuer', 'signature', 'audience', 'repository', 'event', 'environment', 'workflowPath', 'workflowRef', 'workflowSha', 'ref', 'sha', 'sourceRef', 'sourceSha', 'runId', 'runAttempt', 'expiry']) {
    const calls = [];
    const router = createHostProtocolRouter(createProtocolHarness({ calls, oidcDrift: drift }));
    await assert.rejects(router.handleSession(validExecuteSession()), /authorization_rejected/);
    assert.equal(calls.some((call) => /ledger:cas|artifact:begin|io:write:ready/.test(call)), false);
  }
});

test('replay ledger binds terminal and compacts only deterministic eligible entries', async () => {
  const ledger = createAdmissionReplayLedger(replayRetentionHarness({ maximumEntries: 128 }));
  await ledger.bindTerminal({
    transactionId: syntheticTransactionId,
    finalState: 'deployed_validated',
    terminalRecordSha256: '6'.repeat(64),
    closeoutIndexSha256: '7'.repeat(64),
  });
  assert.deepEqual(await ledger.listProtectedNonterminalTransactionIds(), []);
  const maintenance = createBootstrapMaintenanceCoordinator(maintenanceHarness({
    now: ordinaryTerminalAtPlus({ days: 29, hours: 23, minutes: 59, seconds: 59 }),
  }));
  const beforeThirtyDays = await maintenance.runAdmissionPreflight({
    admissionReplayLedger: ledger,
  });
  assert.equal(beforeThirtyDays.removedCount, 0);
  await assertProtectedAcrossCompaction(ledger, [
    'active_nonterminal', 'newest_terminal_for_target', 'newest_critical_terminal',
  ]);
  for (const controllerLabel of [
    ['validated', 'deployment'].join('_'),
    ['validated', 'critical', 'failure'].join('_'),
    ['controller', 'incomplete', 'no', 'production', 'claim'].join('_'),
  ]) {
    await assert.rejects(ledger.bindTerminal({
      transactionId: anotherSyntheticTransactionId(),
      finalState: controllerLabel,
      terminalRecordSha256: '8'.repeat(64),
      closeoutIndexSha256: '9'.repeat(64),
    }), /terminal_final_state_invalid/);
  }
});

test('authorization verifier imports the Artifact owner and defines no parallel contract', async () => {
  const source = await readFile('server/services/deployment/control-plane-authorization-verifier.mjs', 'utf8');
  assert.match(source, /validateProductionAuthorizationRecord/);
  assert.match(source, /deriveProductionAuthorizationOidcAudience/);
  assert.doesNotMatch(source, /POSTAPPROVAL_AUTHORIZATION_FIELDS|production-authorization-v1\.schema|gccgw-control-plane(?:-deploy)?:/);
  assert.equal(existsSync('ops/control-plane-deploy/contracts/postapproval-authorization-v1.json'), false);
});

test('Artifact Task 8 bytes reach the consumer without wrapper or digest drift', async () => {
  const created = buildProductionAuthorizationRecord(validProductionAuthorizationInput());
  const providerResult = validateProductionAuthorizationRecord({
    bytes: created.bytes,
    expected: validInstalledExpectation(),
    now: syntheticNow,
  });
  assert.deepEqual(providerResult.value, created.value);
  assert.equal(providerResult.sha256, sha256Hex(created.bytes));
  const verified = await createAuthorizationVerifier(realOwnerConsumerHarness(created)).verify({
    authorizationRecordBytes: Buffer.from(created.bytes),
    oidcTokenBytes: syntheticSignedProductionToken(created),
  });
  assert.deepEqual(verified.authorization, providerResult.value);
  assert.equal(verified.authorizationRecordSha256, providerResult.sha256);
});

test('authorization wrapper uses validated.value for claims and validated.sha256 for identity', async () => {
  const owner = buildProductionAuthorizationRecord(validProductionAuthorizationInput());
  const distinctWrapper = Object.freeze({
    value: owner.value,
    sha256: owner.sha256,
  });
  const harness = strictOwnerWrapperHarness({ distinctWrapper });
  const verified = await createAuthorizationVerifier(harness).verify({
    authorizationRecordBytes: Buffer.from(owner.bytes),
    oidcTokenBytes: syntheticSignedProductionToken(owner),
  });
  assert.strictEqual(harness.claimAuthorization, distinctWrapper.value);
  assert.equal(harness.derivedAudienceDigest, distinctWrapper.sha256);
  assert.equal(verified.authorizationRecordSha256, distinctWrapper.sha256);
  assert.notStrictEqual(harness.claimAuthorization, distinctWrapper);
});

test('installed expectation is the sole branded projection accepted by the plan store', async () => {
  const built = buildProductionAuthorizationRecord(validProductionAuthorizationInput());
  const verified = await createAuthorizationVerifier(realOwnerConsumerHarness(built)).verify({
    authorizationRecordBytes: Buffer.from(built.bytes),
    oidcTokenBytes: syntheticSignedProductionToken(built),
  });
  assert.deepEqual(Object.keys(verified.installedExpectation), VERIFIED_INSTALLED_EXPECTATION_FIELDS);
  assert.strictEqual(
    assertVerifiedInstalledExpectation(verified.installedExpectation),
    verified.installedExpectation,
  );
  await assert.rejects(publishAcceptedPlanWith({
    installedExpectation: Object.freeze({ ...verified.installedExpectation }),
  }), /installed_expectation_unverified/);
});

test('direct-workflow OIDC accepts redacted real nbf-before-iat and bounded nbf-after-iat shapes', async () => {
  const iat = 1_786_000_000;
  const claims = Object.freeze({
    iss: GITHUB_ACTIONS_OIDC_ISSUER,
    aud: syntheticAudience,
    sub: 'repo:gccwebos-com/proxy-gateway-minimal:environment:vultr-japan-production',
    repository: 'gccwebos-com/proxy-gateway-minimal',
    event_name: 'workflow_dispatch',
    environment: 'vultr-japan-production',
    workflow_ref: 'gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-control-plane-production-deploy.yml@refs/heads/master',
    workflow_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ref: 'refs/heads/master',
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    run_id: '123456789',
    run_attempt: '1',
    runner_environment: 'github-hosted',
    jti: 'redacted-real-shape-jti',
    nbf: iat - 5,
    iat,
    exp: iat + 300,
  });
  await assert.doesNotReject(createAuthorizationVerifier(realShapeAuthorizationHarness({
    claims,
    authorization: authorizationMatchingRedactedClaims(claims),
    now: (iat + 1) * 1_000,
  })).verify({
    authorizationRecordBytes: syntheticAuthorizationRecordBytes(),
    oidcTokenBytes: syntheticOidcTokenBytes(),
  }));
  const futureNotBefore = Object.freeze({
    ...claims,
    jti: 'redacted-future-not-before-jti',
    nbf: iat + 2,
  });
  await assert.doesNotReject(createAuthorizationVerifier(realShapeAuthorizationHarness({
    claims: futureNotBefore,
    authorization: authorizationMatchingRedactedClaims(futureNotBefore),
    now: (iat + 1) * 1_000,
  })).verify({
    authorizationRecordBytes: syntheticAuthorizationRecordBytes(),
    oidcTokenBytes: syntheticOidcTokenBytes(),
  }));
  assert.equal(Object.hasOwn(claims, 'job_workflow_ref'), false);
  assert.equal(Object.hasOwn(claims, 'job_workflow_sha'), false);
});

test('GitHub OIDC trust factory is fixed, local, and fail closed', async () => {
  const fetches = [];
  const verifier = createGitHubActionsOidcVerifier(localRs256Harness({ fetches }));
  const claims = await verifier.verify({ tokenBytes: validLocallySignedToken(), audience: syntheticAudience });
  assert.equal(claims.aud, syntheticAudience);
  assert.deepEqual(fetches.map(({ url, redirect, accept }) => ({ url, redirect, accept })), [
    { url: GITHUB_ACTIONS_OIDC_DISCOVERY_URL, redirect: 'error', accept: 'application/json' },
    { url: `${GITHUB_ACTIONS_OIDC_ISSUER}/.well-known/jwks`, redirect: 'error', accept: 'application/json' },
  ]);
  for (const drift of ['redirect', 'cross_origin_jwks', 'alg_none', 'alg_es256', 'duplicate_kid', 'duplicate_json_key', 'oversize', 'expired_cache_fetch_failure', 'bad_signature']) {
    await assert.rejects(createGitHubActionsOidcVerifier(localRs256Harness({ drift })).verify({
      tokenBytes: driftedLocallySignedToken(drift),
      audience: syntheticAudience,
    }));
  }
});

test('closeout token is zeroed and only a branded distinct transition can CAS once', async () => {
  const tokenBytes = syntheticOidcTokenBytes();
  const oidcVerifier = localCloseoutOidcVerifier();
  const closeoutStore = createCloseoutStoreSpy();
  const frameBytes = encodeCloseoutUploadStartedFrame({
    binding: createCloseoutTransitionBinding(validCloseoutBinding({
      transition: 'upload_started',
      actionsArtifactObservationSha256: null,
    })),
    oidcTokenBytes: tokenBytes,
  });
  tokenBytes.fill(0);
  const parsed = parseHostRequestFrame(frameBytes).value;
  const verified = await verifyCloseoutTransitionOidc({
    frame: parsed,
    oidcVerifier,
    terminalVerifier: exactTerminalVerifier(),
    clock: fixedClock(),
  });
  assert.strictEqual(assertVerifiedCloseoutTransition(verified), verified);
  await closeoutStore.casUploadStartedAuthorized(verified);
  await assert.rejects(closeoutStore.casUploadStartedAuthorized(verified), /closeout_transition_replayed/);
  await assert.rejects(
    closeoutStore.casUploadStartedAuthorized(Object.freeze({ ...verified })),
    /closeout_transition_not_verified/,
  );
  assert.equal(oidcVerifier.lastOwnedToken.every((byte) => byte === 0), true);
});

test('execute frame accepts only exact owner bytes and cannot supply aliases or expectations', async () => {
  const encoded = encodeExecuteAuthFrame({
    deploymentPlanBytes: syntheticDeploymentPlanBytes(),
    productionGateReceiptBytes: syntheticProductionGateReceiptBytes(),
    authorizationRecordBytes: syntheticAuthorizationRecordBytes(),
    oidcTokenBytes: syntheticOidcTokenBytes(),
  });
  assert.deepEqual(Object.keys(parseHostRequestFrame(encoded).value), [
    'type',
    'deploymentPlanBytesBase64',
    'productionGateReceiptBytesBase64',
    'authorizationRecordBytesBase64',
    'oidcTokenBytesBase64',
  ]);
  for (const field of ['expected', 'expectedBindings', 'artifactSize', 'artifactSha256', 'planSha256', 'deploymentPlanSha256', 'gateId']) {
    const calls = [];
    const router = createHostProtocolRouter(createProtocolHarness({ calls }));
    await assert.rejects(router.handleSession(executeSessionWithExtraField(field)), /execute_auth_unknown_field/);
    assert.deepEqual(calls, ['native:probe_all_fourteen_capabilities']);
  }
});

test('receiver aborts only pending bytes; durable handoff and ACK loss converge through status', async (t) => {
  for (const boundary of executeFaultBoundaries()) {
    await t.test(boundary, async () => {
      const calls = [];
      const router = createHostProtocolRouter(createProtocolHarness({ calls, failAt: boundary }));
      await assert.rejects(router.handleSession(validExecuteSession()));
      const abortForbiddenBoundaryReached = calls.some((entry) => /artifact:commit_after_eof|handoff:attempt|accepted_record:publish|ledger:bind|custody:send|broker:start/.test(entry));
      assert.equal(calls.includes('receiver:abort'), !abortForbiddenBoundaryReached);
      if (abortForbiddenBoundaryReached) assert.equal(calls.includes('status:durable_readback_available'), true);
    });
  }
  const ackLost = createProtocolHarness({ failAt: 'io:write:artifact_accepted_v1' });
  await ackLost.router.handleSession(validExecuteSession());
  assert.equal(ackLost.calls.includes('receiver:abort'), false);
  assert.equal((await ackLost.router.handleStatusFrame(validStatusFrame())).length <= 2_048, true);
});
```

Run: `node --test server/tests/control-plane-github-oidc-verifier.test.mjs server/tests/control-plane-authorization-verifier.test.mjs server/tests/control-plane-admission-replay-ledger.test.mjs server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-session-limit-broker.test.mjs server/tests/control-plane-host-protocol.test.mjs`

Expected: FAIL because the verifier and replay ledger are absent. Import the Artifact validator/audience helper, implement the fixed issuer/audience/claim matrix, installed-state readback, token zeroing, bounded replay indexes, and one CAS that adds all five unique dimensions. Add a source test that rejects any Bootstrap-owned authorization schema, field-order array, literal deploy audience, or mapper. Observe RED independently for each drift and for same-Gate, same-record, same-JTI, same-token, same-transaction, stale-ledger-digest, and full-ledger races before making each case GREEN.

- [ ] **Step 4: Implement exact frame dispatch and reserve-before-ready session**

```js
export const HOST_REQUEST_TYPES = Object.freeze([
  'execute_auth',
  'inventory_normal',
  'inventory_compatibility',
  'bootstrap_activation',
  'status',
  'status_terminal_bundle_chunk',
  'status_closeout_upload_started',
  'status_closeout_ack',
  'status_recover_challenge',
  'status_recover',
]);

export function createHostProtocolRouter(deps) {
  const inventoryReaders = assertControlPlaneHostInventoryReaders(deps.hostInventoryReaders);
  const bootstrapMaintenance = assertBootstrapMaintenanceCapability(deps.bootstrapMaintenance);
  const statusHandlers = Object.freeze({
    inventory_normal: async (frame) =>
      encodeNormalInventoryResponseFrame(await inventoryReaders.normalInventoryReader.read(frame)),
    status: async (frame) => encodeStatusResponseFrame(await deps.ordinaryStatusReader.read(frame)),
    status_closeout_upload_started: async (frame) => encodeUploadStartedResponseFrame(await handleUploadStarted(frame, deps)),
    status_closeout_ack: async (frame) => encodeCloseoutAckResponseFrame(await handleCloseoutAck(frame, deps)),
    status_recover_challenge: async (frame) => encodeRecoveryChallengeResponseFrame(await handleRecoveryChallenge(frame, deps)),
    status_recover: async (frame) => encodeRecoveredStatusResponseFrame(await handleRecoveryStatus(frame, deps)),
  });
  return Object.freeze({
    async handleStatusFrame(bytes) {
      requireAllFoundationCapabilities(deps.native.probeLinuxCapabilities());
      const permit = await deps.sessionLimitClient.acquire();
      try {
        if (bytes.length > 65_536) throw new Error('first_frame_too_large');
        const frame = parseHostRequestFrame(bytes);
        if (frame.value.type === 'execute_auth') throw new Error('execute_requires_session');
        if (frame.value.type === 'status_terminal_bundle_chunk') throw new Error('terminal_bundle_requires_session');
        if (!Object.hasOwn(statusHandlers, frame.value.type)) throw new Error('deploy_request_type_rejected');
        const encoded = await statusHandlers[frame.value.type](frame.value);
        if (encoded.length > 2_048) throw new Error('response_too_large');
        return encoded;
      } finally {
        await permit.release();
      }
    },
    async handleSession(io) {
      requireAllFoundationCapabilities(deps.native.probeLinuxCapabilities());
      const permit = await deps.sessionLimitClient.acquire();
      try {
        const bytes = await io.readFirstFrame(65_536, { deadlineAt: io.preauthDeadlineAt });
        const frame = parseHostRequestFrame(bytes);
        if (frame.value.type === 'execute_auth') {
          return await handleExecuteSession(frame.value, io, deps, bootstrapMaintenance);
        }
        if (frame.value.type === 'status_terminal_bundle_chunk') {
          return await handleTerminalBundleStream(frame.value, io, deps);
        }
        if (!Object.hasOwn(statusHandlers, frame.value.type)) throw new Error('deploy_request_type_rejected');
        const encoded = await statusHandlers[frame.value.type](frame.value);
        if (encoded.length > 2_048) throw new Error('response_too_large');
        await io.writeFrame(encoded);
      } finally {
        await permit.release();
      }
    },
  });
}

export function createBootstrapProtocolRouter(deps) {
  const inventoryReaders = assertControlPlaneHostInventoryReaders(deps.hostInventoryReaders);
  return Object.freeze({
    async handleSession(io) {
      requireAllFoundationCapabilities(deps.native.probeLinuxCapabilities());
      const permit = await deps.sessionLimitClient.acquire();
      try {
        const bytes = await io.readFirstFrame(65_536, { deadlineAt: io.preauthDeadlineAt });
        const frame = parseHostRequestFrame(bytes).value;
        if (frame.type === 'inventory_compatibility') {
          return await io.writeFrame(encodeCompatibilityInventoryResponseFrame(
            await inventoryReaders.compatibilityInventoryReader.read(frame),
          ));
        }
        if (frame.type !== 'bootstrap_activation') throw new Error('bootstrap_request_type_rejected');
        const operationEnvelopeBytes = decodeBootstrapActivationEnvelope(frame);
        try {
          const operation = parseBootstrapOperationEnvelope(operationEnvelopeBytes);
          crossCheckBootstrapActivationFrameAndEnvelope(frame, operation);
          let readyWritten = false;
          const onAuthorized = async () => {
            if (readyWritten) throw new Error('bootstrap_activation_ready_duplicate');
            await io.writeFrame(encodeBootstrapActivationReadyFrame({
              requestId: frame.requestId,
              activationId: frame.activationId,
            }));
            readyWritten = true;
            return true;
          };
          const terminal = await deps.bootstrapRootLauncher.run(
            operationEnvelopeBytes,
            { onAuthorized },
          );
          if (!readyWritten) throw new Error('bootstrap_activation_ready_missing');
          const encoded = encodeBootstrapActivationResponseFrame({
            requestId: frame.requestId,
            activationId: frame.activationId,
            activationState: terminal.state,
            terminalResultSha256: terminal.terminalResultSha256,
          });
          if (encoded.length > 2_048) throw new Error('response_too_large');
          return await io.writeFrame(encoded);
        } finally {
          operationEnvelopeBytes.fill(0);
        }
      } finally {
        await permit.release();
      }
    },
  });
}

async function handleTerminalBundleStream(frame, io, deps) {
  await io.requirePhaseDeadline({ phase: 'status_bundle', maximumMs: 30_000 });
  const bundle = await deps.ordinaryStatusReader.readTerminalBundleForStream(frame);
  const ownedBytes = bundle.bytes;
  try {
    if (!Buffer.isBuffer(ownedBytes) || ownedBytes.length < 1
        || ownedBytes.length > TERMINAL_BUNDLE_MAX_BYTES
        || sha256Hex(ownedBytes) !== frame.terminalBundleSha256
        || bundle.sha256 !== frame.terminalBundleSha256) {
      throw new Error('terminal_bundle_source_invalid');
    }
    let offset = 0;
    let frameCount = 0;
    while (offset < ownedBytes.length) {
      const end = Math.min(offset + TERMINAL_BUNDLE_CHUNK_BYTES, ownedBytes.length);
      const chunkBytes = Buffer.from(ownedBytes.subarray(offset, end));
      try {
        const encoded = encodeTerminalBundleChunkResponse({
          requestId: frame.requestId,
          gateId: frame.gateId,
          deploymentPlanSha256: frame.deploymentPlanSha256,
          transactionId: frame.transactionId,
          terminalBundleSha256: frame.terminalBundleSha256,
          totalBytes: ownedBytes.length,
          offset,
          chunkBytes,
          eof: end === ownedBytes.length,
        });
        if (encoded.length > 2_048 || ++frameCount > TERMINAL_BUNDLE_MAX_CHUNKS) {
          throw new Error('terminal_bundle_response_limit');
        }
        await io.writeFrame(encoded);
      } finally {
        chunkBytes.fill(0);
      }
      offset = end;
    }
  } finally {
    ownedBytes.fill(0);
  }
}
```

For `execute_auth`, `handleSession` does not use the one-frame handler:

```js
async function handleExecuteSession(frame, io, deps, bootstrapMaintenance) {
  const owned = decodeExactExecuteAuthBuffers(frame);
  let receiver = null;
  let receivePhase = 'not_started';
  try {
    await io.requirePhaseDeadline({ phase: 'preauth', maximumMs: 10_000 });
    const verified = await deps.authorizationVerifier.verify({
      authorizationRecordBytes: owned.authorizationRecordBytes,
      oidcTokenBytes: owned.oidcTokenBytes,
    });
    const deploymentPlan = deps.validateDeploymentPlanBytes({
      bytes: owned.deploymentPlanBytes,
      runContext: runContextFromVerifiedAuthorization(verified.authorization),
      now: deps.clock.nowIso(),
    });
    const productionGateReceipt = deps.validateProductionGateReceipt({
      productionGateId: deploymentPlan.value.gateId,
      bytes: owned.productionGateReceiptBytes,
      now: deps.clock.nowIso(),
      expectedRepository: deploymentPlan.value.repository,
      expectedSourceCommit: deploymentPlan.value.sourceCommit,
    });
    crossCheckPlanGateAuthorizationInstalled({ deploymentPlan, productionGateReceipt, verified });
    await bootstrapMaintenance.runAdmissionPreflight({
      admissionReplayLedger: deps.admissionReplayLedger,
    });
    const acceptedPlan = await deps.acceptedPlanStore.publishAcceptedPlan({
      deploymentPlan,
      productionGateReceipt,
      authorization: Object.freeze({ value: verified.authorization, sha256: verified.authorizationRecordSha256 }),
      installedExpectation: verified.installedExpectation,
    });
    const reservation = await deps.admissionReplayLedger.reserveAdmission({
      authorization: verified.authorization,
      artifact: verified.artifact,
      acceptedPlanSha256: acceptedPlan.sha256,
      authorizationRecordSha256: verified.authorizationRecordSha256,
      oidcJtiSha256: verified.oidcJtiSha256,
      oidcTokenSha256: verified.oidcTokenSha256,
    });
    receiver = await deps.artifactReceiver.begin({
      transactionId: verified.authorization.transactionId,
      expectedSize: verified.artifact.artifactSize,
      expectedSha256: verified.artifact.artifactSha256,
      reservationSha256: reservation.sha256,
    });
    receivePhase = 'pending';
    await io.writeFrame(encodeReadyForArtifactFrame(createReadyValue({
      authorization: verified.authorization,
      artifact: verified.artifact,
      authorizationRecordSha256: verified.authorizationRecordSha256,
    })));
    await io.requirePhaseDeadline({ phase: 'artifact', maximumMs: 300_000 });
    await io.readExactAndEof(verified.artifact.artifactSize, (chunk) => receiver.write(chunk));
    receivePhase = 'commit_attempted';
    const artifactCapability = await receiver.commitAfterEof();
    receivePhase = 'committed';
    // From this boundary onward, cleanup is reconciliation/status-driven; never abort.
    receivePhase = 'handoff_attempted';
    const accepted = await deps.acceptedArtifactHandoff.acceptAndStart({
      authorization: verified.authorization,
      artifact: verified.artifact,
      acceptedPlan,
      reservation,
      artifactCapability,
    });
    receivePhase = 'durable_started';
    const acceptedFrame = encodeArtifactAcceptedFrame({
      gateId: deploymentPlan.value.gateId,
      deploymentPlanSha256: deploymentPlan.sha256,
      transactionId: verified.authorization.transactionId,
      acceptedAt: accepted.acceptedAt,
      accepted: true,
    });
    try {
      await io.writeFrame(acceptedFrame);
    } catch {
      // ACK loss is transport-only. Durable accepted/start state remains pollable by status.
    }
  } catch (error) {
    if (receiver !== null && receivePhase === 'pending') await receiver.abort();
    throw error;
  } finally {
    for (const bytes of Object.values(owned)) bytes.fill(0);
  }
}
```

The `execute_auth` frame carries only strict canonical base64 fields `deploymentPlanBytesBase64`, `productionGateReceiptBytesBase64`, `authorizationRecordBytesBase64`, and `oidcTokenBytesBase64`, in that order after `type`. Their decoded maxima are respectively 24,576, 4,096, 4,096, and 8,192 bytes, so the maximum canonical full frame plus LF remains below 65,536 bytes; tests encode the four real maxima together and reject one byte over each or over the aggregate. `expected`, `expectedBindings`, direct Gate/plan/artifact selectors, digest aliases, and installed-state fields are unknown-field rejections. Decoding rejects noncanonical base64; every owned decoded buffer is zeroed in the outermost `finally`; the router never logs or normalizes a protected value. Fault injection covers every read/validate/publish/fsync/readback/reserve/ready/stream/EOF/accepted-record/ledger/custody/broker/ACK boundary. Only `pending`, before the first `commitAfterEof` invocation, may call `receiver.abort`; once commit is attempted, disconnect, timeout, thrown custody/broker uncertainty, and ACK write failure retain durable state and require an ordinary status poll. Reboot reconciliation proves the same rule.

The cross-process limiter is active before either pre-auth parser. Its exact socket and long-lived broker service are:

```ini
[Unit]
Description=Proxy Gateway control-plane session limiter socket

[Socket]
ListenStream=/run/proxy-gateway-control-plane/session-limit-broker.sock
Accept=no
SocketUser=root
SocketGroup=root
SocketMode=0600
RemoveOnStop=true
Backlog=16
Service=proxy-gateway-control-session-limit-broker.service

[Install]
WantedBy=proxy-gateway-control-authorization.target
```

```ini
[Unit]
Description=Proxy Gateway control-plane session limiter
Requires=proxy-gateway-control-session-limit-broker.socket
After=local-fs.target proxy-gateway-control-session-limit-broker.socket

[Service]
Type=simple
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry session-limit-broker-v1
User=root
Group=root
SupplementaryGroups=
WorkingDirectory=/
UMask=0077
TimeoutStartSec=10
TimeoutStopSec=5
KillMode=control-group
Restart=on-failure
RestartSec=1
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt /opt /var/lib/proxy-gateway-control-plane
```

The two pre-auth parser socket units are exact. Each socket is systemd-owned with `Accept=no`; the reviewed helper accepts one queued connection, verifies `SO_PEERCRED`, replaces listening FD 3 with only that connected socket, and only then execs Node inside the already active service sandbox. The service exits after one session; systemd queues and starts the next bounded invocation. Both parser services first hold one connection-bound lease from the long-lived limiter and abort if that broker connection closes. Deploy files are:

```ini
[Unit]
Description=Proxy Gateway deploy forced-command protocol socket

[Socket]
ListenStream=/run/proxy-gateway-control-plane/host-protocol.sock
Accept=no
SocketUser=root
SocketGroup=root
SocketMode=0600
RemoveOnStop=true
Backlog=16
Service=proxy-gateway-control-deploy-protocol.service

[Install]
WantedBy=proxy-gateway-control-authorization.target
```

```ini
[Unit]
Description=Proxy Gateway deploy forced-command protocol parser
Requires=proxy-gateway-control-deploy-protocol.socket proxy-gateway-control-session-limit-broker.socket
After=local-fs.target proxy-gateway-control-deploy-protocol.socket proxy-gateway-control-session-limit-broker.socket
StartLimitIntervalSec=60
StartLimitBurst=16
StartLimitAction=none

[Service]
Type=exec
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry deploy-protocol-v1
User=root
Group=root
SupplementaryGroups=
WorkingDirectory=/
UMask=0077
TimeoutStartSec=315
RuntimeMaxSec=315
TimeoutStopSec=5
KillMode=control-group
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadOnlyPaths=/opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases
ReadWritePaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /var/lib/proxy-gateway-control-plane/transactions/v1
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
```

Bootstrap files differ only in the literal socket/principal/helper ID and have their own complete profile:

```ini
[Unit]
Description=Proxy Gateway bootstrap forced-command protocol socket

[Socket]
ListenStream=/run/proxy-gateway-control-plane/bootstrap-protocol.sock
Accept=no
SocketUser=root
SocketGroup=root
SocketMode=0600
RemoveOnStop=true
Backlog=16
Service=proxy-gateway-control-bootstrap-protocol.service

[Install]
WantedBy=proxy-gateway-control-authorization.target
```

```ini
[Unit]
Description=Proxy Gateway bootstrap forced-command protocol parser
Requires=proxy-gateway-control-bootstrap-protocol.socket proxy-gateway-control-session-limit-broker.socket
After=local-fs.target proxy-gateway-control-bootstrap-protocol.socket proxy-gateway-control-session-limit-broker.socket
StartLimitIntervalSec=60
StartLimitBurst=16
StartLimitAction=none

[Service]
Type=exec
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry bootstrap-protocol-v1
User=root
Group=root
SupplementaryGroups=
WorkingDirectory=/
UMask=0077
TimeoutStartSec=30
RuntimeMaxSec=930
TimeoutStopSec=5
KillMode=control-group
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadWritePaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /var/lib/github-control-bootstrap/.ssh /etc/sudoers.d
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
```

Static and real-denial tests require: neither unprivileged account nor an unrelated local account can connect directly to either root-only socket (`EACCES`); each account's exact sudo rule can invoke only its own no-argument root relay; a cross-relay, alternate argv/environment, forged/missing `LISTEN_PID/FDS`, non-root `SO_PEERCRED`, second inherited FD, oversized first frame, aggregate/session overflow, 10-second pre-auth deadline, 300-second deploy continuation, or 910-second authenticated activation deadline rejects before the prohibited next phase. The systemd contract test byte-checks that `bootstrap-protocol-v1` starts only `scripts/control-plane-bootstrap-root.mjs`, that this script composes only `createBootstrapProtocolRouter`, and that the composition accepts exactly read-only `inventory_compatibility` or Gate-bound `bootstrap_activation`; it rejects normal inventory, deploy/status families, and any compatibility-to-activation dispatch before owner access. It also cross-checks Transport's exact `900000/910000/925000` exports against launcher/relay/request behavior, requires bootstrap `RuntimeMaxSec=930`, proves compatibility inventory remains one frame under 10 seconds, and proves only the request-bound ready frame enables the second activation frame. A per-principal token bucket and one active slot reject slowloris/flood attempts before protected parsing, and release the slot in an outermost `finally`. Inside both units, direct manager/D-Bus access, arbitrary exec, mount, namespace, ptrace, keyctl, and privilege escalation return their exact sandbox errno with file/unit/mount/cgroup snapshots unchanged; the bootstrap unit additionally rejects AF_INET/AF_INET6. The deploy unit's sole network exception is the spec-required OIDC discovery/JWKS path: its address families permit TLS/DNS, but the only code with a network adapter is `createGitHubActionsOidcVerifier`, whose fixed same-origin URLs, no redirect/proxy/caller headers, size/deadline, and local-crypto tests reject any other destination before fetch. A target network-namespace test records all connect destinations and proves exactly the fixed issuer on port 443 during a cache miss and zero connects on cache hit or invalid request. A positive root-relay test proves one exact relay reaches exactly one parser session.

The recovery broker socket is `/run/proxy-gateway-control-plane/recovery-challenge.sock`, owned `root:root` mode `0600`. Its `.socket` uses `ListenStream`, `SocketMode=0600`, `RemoveOnStop=true`; its service is `Type=simple`, receives only the systemd socket FD, and has the exact hardened profile defined below. These units are pulled in by the authorization target in Task 10; they are not started in this source-only slice.

```ini
[Service]
Type=simple
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry recovery-challenge-broker-v1
TimeoutStartSec=10
User=root
Group=root
UMask=0077
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
StandardOutput=null
StandardError=null
```

Use one literal contract per request/response type. Unknown fields and cross-type fields reject. Artifact bytes follow only after the authenticated ready frame in the same session.

- [ ] **Step 5: Write RED accepted-artifact custody, detach, and reboot tests**

```js
test('accepted artifact is durably bound before fixed custody transfer and detach', async () => {
  const calls = [];
  const handoff = createAcceptedArtifactHandoff(createHandoffHarness({ calls }));
  await handoff.acceptAndStart(validAcceptedArtifactInput());
  assert.deepEqual(calls, [
    'capability:verify_transaction_reservation_size_sha_eof',
    'accepted_plan:readback_exact',
    'accepted_record:publish_fsync_readback_0600',
    'replay_ledger:bind_accepted_record_cas',
    'custody:send_one_fd_fixed_socket_verify_peer',
    'four_source_objects:readback_exact',
    'host_owner:canonicalize_accepted_start_evidence',
    'accepted_start_projection:publish_fsync_readback',
    'invocation:domain_hash_owner_canonical_bytes',
    'transaction_broker:independent_reopen_and_recompute',
    'transaction_broker:start_accepted_transaction',
    'transaction_broker:prove_active',
  ]);
});

test('broker independently recomputes the exact four-field accepted-start digest', async () => {
  const evidence = Object.freeze({
    acceptedArtifactRecordSha256: '1'.repeat(64),
    acceptedPlanSha256: '2'.repeat(64),
    authorizationReservationSha256: '3'.repeat(64),
    artifactCapabilityIdentitySha256: '4'.repeat(64),
  });
  assert.deepEqual(Object.keys(evidence), ACCEPTED_START_EVIDENCE_FIELDS);
  const canonical = canonicalizeAcceptedStartEvidence(evidence);
  const invocationSha256 = sha256Hex(Buffer.concat([
    Buffer.from('control-plane-transaction-start-accepted-v1\0', 'utf8'),
    canonical.bytes,
  ]));
  await assert.doesNotReject(transactionBrokerHarness({ evidence }).startAcceptedTransaction({
    transactionId: syntheticTransactionId,
    invocationSha256,
  }));
  for (const field of ACCEPTED_START_EVIDENCE_FIELDS) {
    await assert.rejects(transactionBrokerHarness({ evidence: { ...evidence, [field]: '5'.repeat(64) } })
      .startAcceptedTransaction({ transactionId: syntheticTransactionId, invocationSha256 }), /invocation_digest_mismatch/);
  }
});

test('consumer reopens only the durable accepted object after custody restart', async () => {
  const consumer = createAcceptedArtifactConsumer(createConsumerHarness({ restarted: true }));
  const capability = await consumer.receive(validAcceptedRecordSelector());
  assert.equal(capability.eofVerified, true);
  assert.equal(capability.sha256, syntheticArtifactSha256);
});
```

Run: `node --test server/tests/control-plane-transaction-ingress.test.mjs server/tests/control-plane-accepted-artifact-handoff.test.mjs`

On target-matched disposable Linux, first extend and run: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: FAIL because the handoff/custody adapter and real challenge/custody unit profiles are absent. Implement the fixed accepted-object semantic ID, mode-`0600` record, record/ledger readback, one-FD `SCM_RIGHTS` message, `SO_PEERCRED` check, exact size/hash/EOF revalidation, Host fixed-broker start, and reopen-after-reboot branch. Add RED cases for early/trailing bytes, wrong descriptor identity/size/SHA, wrong peer, two FDs, arbitrary socket/path/unit/operation/FD fields, crash before record, crash before ledger bind, disconnect after bind, broker-start failure, and reboot with missing/drifted accepted object.

The custody units are exact source files:

```ini
[Socket]
ListenStream=/run/proxy-gateway-control-plane/accepted-artifact.sock
SocketMode=0600
SocketUser=root
SocketGroup=root
RemoveOnStop=true

[Install]
WantedBy=proxy-gateway-control-authorization.target
```

```ini
[Service]
Type=simple
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry accepted-artifact-custody-v1
TimeoutStartSec=10
User=root
Group=root
UMask=0077
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadWritePaths=/var/lib/proxy-gateway-control-plane/transactions/v1
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
StandardOutput=null
StandardError=null
```

The root service receives only its systemd socket FD, the fixed transaction-store root, and the fixed Host broker socket capability; the transaction consumer is a separately sandboxed root helper owned by the host-transaction plan. It cannot connect to the manager sockets or open AF_INET/AF_INET6. No unit is installed, enabled, or started by this source-only PR.

- [ ] **Step 6: Write RED transition-OIDC/recovery tests, observe failure, then implement one branch at a time**

First add one RED test per issuer/signature/audience/claim/expiry drift, cross-transition/reused JTI, valid-key-without-token, expected-record drift, and CAS race against an injected atomic-store spy; run `node --test server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-authorization-verifier.test.mjs` and record the first missing transition branch. Then implement `status_closeout_upload_started`, which requires exact terminal receipt/current closeout digest plus a fresh `upload_started`-audience OIDC token and calls only `casUploadStartedAuthorized`, atomically writing state and binding/JTI/token digests. Make that batch GREEN before implementing `status_closeout_ack`, which requires exact GitHub artifact digest/retention readback plus a different fresh `upload_committed_observed`-audience token and calls only `casAckAuthorized`. No reset exists; every rejection leaves closeout bytes and replay indexes unchanged. Task 10 later proves the concrete durable CAS against this frozen spy contract.

The recovery challenge binds recovery ID, original run/attempt, repository, workflow path/ref/SHA, Environment, current controller/parser/bootstrap digests, nonce, and expiry no later than 60 seconds. `status_recover` requires the challenge-audience OIDC token and byte-equal preapproved tuple, rejects stale/reused challenge, multiple index records, active rotation fence, missing parser, and nonterminal record, then returns one aggregate-safe retained record without mutation.

- [ ] **Step 7: Add bounds, replay, CAS, recovery, and redaction matrices**

Cover combined execute input maxima and 65,536/65,537-byte frame boundaries; 2,048/2,049-byte response boundary; 768/769-byte raw chunk and 262,144/262,145-byte bundle boundaries; empty, 8,192/8,193-byte execute OIDC and 32,768/32,769-byte closeout OIDC bodies; extra line/frame; wrong schema/domain/order; normal/compatibility/status/ACK codec substitution; status for unknown transaction; closeout transition replay; wrong-receipt early ACK; upload-start after finalizer attachment; valid `nbf < iat` and `iat < nbf <= now + 30` shapes plus negative/expired/over-skew OIDC intervals; accepted-plan publish/readback crash; receiver faults before/after commit; ACK loss; 10-second pre-auth and 300-second artifact deadlines; per-principal bucket/single-slot slowloris and flood; challenge purge-before-insert, 64/65 capacity, reuse/expiry/HMAC/OIDC audience/repository/event/Environment/workflow path/ref/SHA drift; replay 128/129 quota, 24-hour replay rejection, 30-day ordinary retention, protected active/latest-target/latest-critical entries, bind-terminal/compactor crash/race/reboot; zero/multiple retained records; dropped parser; old-key request; fence present; and every forbidden side effect. A false/missing/reordered capability vector must leave `randomBytes` at call count zero; eligible construction calls it exactly once with `32`, and shutdown zeroes the retained key. On disposable target-matched Linux, execute the real challenge-broker and custody units and require `EROFS` for disallowed ProtectSystem writes, `ENOENT` for hidden `/dev/kmsg`, `EAFNOSUPPORT` for AF_INET/AF_INET6, `EACCES` for manager/D-Bus/InaccessiblePaths, and `EPERM` for arbitrary-unit escalation plus `mount`, `reboot`, `bpf`, `ptrace`, `keyctl`, and namespace creation; compare pre/post file, unit, socket, mount, and cgroup snapshots. Then prove the custody client can invoke only `transactionBrokerClient.startAcceptedTransaction` and the challenge broker can perform only its two in-memory operations. Assert safe error codes contain none of the synthetic protected inputs.

Run and observe RED for each behavior family before implementing its parser/CAS/broker branch; keep execute-stream tests separate from status/recovery tests.

- [ ] **Step 8: Run protocol tests and verify GREEN**

Run: `node --test server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-github-oidc-verifier.test.mjs server/tests/control-plane-authorization-verifier.test.mjs server/tests/control-plane-admission-replay-ledger.test.mjs server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-session-limit-broker.test.mjs server/tests/control-plane-recovery-challenge-broker.test.mjs server/tests/control-plane-transaction-ingress.test.mjs server/tests/control-plane-accepted-artifact-handoff.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs`

On target-matched disposable Linux: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit host protocol, admission, and artifact custody**

```bash
git add server/services/deployment/control-plane-host-protocol.mjs server/services/deployment/control-plane-github-oidc-verifier.mjs server/services/deployment/control-plane-authorization-verifier.mjs server/services/deployment/control-plane-admission-replay-ledger.mjs server/services/deployment/control-plane-bootstrap-maintenance.mjs server/services/deployment/control-plane-accepted-plan-store.mjs server/services/deployment/control-plane-session-limit-broker.mjs server/services/deployment/control-plane-recovery-challenge-broker.mjs server/services/deployment/control-plane-transaction-ingress.mjs server/services/deployment/control-plane-accepted-artifact-handoff.mjs scripts/control-plane-bootstrap-root.mjs scripts/control-plane-deploy-root.mjs scripts/control-plane-session-limit-broker.mjs scripts/control-plane-recovery-challenge-broker.mjs scripts/control-plane-accepted-artifact-custody.mjs ops/control-plane-deploy/contracts/admission-replay-ledger-v1.json ops/control-plane-deploy/contracts/accepted-plan-v1.json ops/control-plane-deploy/contracts/accepted-artifact-v1.json ops/control-plane-deploy/systemd/proxy-gateway-control-session-limit-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-session-limit-broker.service ops/control-plane-deploy/systemd/proxy-gateway-control-deploy-protocol.socket ops/control-plane-deploy/systemd/proxy-gateway-control-deploy-protocol.service ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-protocol.socket ops/control-plane-deploy/systemd/proxy-gateway-control-bootstrap-protocol.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-challenge-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-challenge-broker.service ops/control-plane-deploy/systemd/proxy-gateway-control-accepted-artifact.socket ops/control-plane-deploy/systemd/proxy-gateway-control-accepted-artifact.service integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-github-oidc-verifier.test.mjs server/tests/control-plane-authorization-verifier.test.mjs server/tests/control-plane-admission-replay-ledger.test.mjs server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-session-limit-broker.test.mjs server/tests/control-plane-recovery-challenge-broker.test.mjs server/tests/control-plane-transaction-ingress.test.mjs server/tests/control-plane-accepted-artifact-handoff.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs
git commit -m "feat: add closed control-plane host protocol"
```

---

### Task 10: Boot preflight and persistent controller-closeout finalizer

**Prerequisite:** Task 9 and Artifact/Workflow Task 8 are GREEN. Receipt/Recovery may still be represented by an injected `terminalVerifier` fixture in unit tests, but no second terminal schema, reader, publisher, or closeout verifier may be created here.

**Files:**
- Create: `server/services/deployment/control-plane-controller-closeout-store.mjs`
- Modify: `server/services/deployment/control-plane-bootstrap-maintenance.mjs`
- Create: `ops/control-plane-deploy/contracts/controller-closeout-index-v1.json`
- Create: `scripts/control-plane-boot-preflight.mjs`
- Create: `scripts/control-plane-closeout-finalizer.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-boot-preflight.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-closeout-finalizer.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-closeout-finalizer.timer`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-authorization.target`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-candidate.service.d/10-control-plane-authorization.conf`
- Modify: `server/services/deployment/control-plane-bootstrap-store.mjs`
- Create: `server/tests/control-plane-controller-closeout-store.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-state-machine.test.mjs`
- Modify: `server/tests/control-plane-bootstrap-systemd-contract.test.mjs`
- Modify: `integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

**Interfaces:**
- Export `createControllerCloseoutStore({ native, durableStore, terminalVerifier, retentionReader })` with the sole publication handoff `registerPendingLease({ transactionId, leaseId, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, leaseSha256 }) -> { indexSha256, indexEntrySha256 }`, plus `listPendingLeaseIds()`, `readLease(id)`, `verifyTerminalEligibility(id)`, `readCloseout(id)`, `casUploadStartedAuthorized(verifiedTransition)`, `casAckAuthorized(verifiedTransition)`, `casLeaseAttached(id, expectedSha256, next)`, `readCompactionPreflight({ protectedNonterminalTransactionIds })`, and `compactEligible({ retentionProof, now, maintenanceCapability })`. The module directly imports `assertVerifiedCloseoutTransition` and `assertBootstrapMaintenanceCapability`; the closeout CAS methods reject an unbranded/reconstructed transition before capability probing or store access, while `compactEligible` rejects an unbranded store-private `retentionProof` or maintenance capability before reading the index. Each then requires the complete Foundation vector before its branded CAS and never receives a verifier, raw token, path, delete selector, or retention override. Export `createBootPreflight({ native, store })` with `run()` and `createControllerCloseoutFinalizer({ native, closeoutStore, hostStateReader, clock })` with `run()`. Each other production entrypoint likewise requires the complete fourteen-feature Foundation vector before reading a protected record or attempting a CAS.
- Receipt-owned `createTransactionBoundTerminalCloseoutStore` first durably publishes and readbacks its terminal body, outer terminal record, initial closeout lease, and initial closeout record. Its unique terminal publisher then calls only `registerPendingLease` with the six safe bindings above. Bootstrap never publishes, reconstructs, or accepts bytes for any of those four Receipt-owned objects and exposes no per-object publication methods. Registration maintains one mode-`0600`, maximum-1,024-entry/1-MiB canonical logical-ID index and performs one CAS adding the exact transaction/object bindings. An exact duplicate returns the same two digests idempotently; any transaction or object digest drift, unverified/nonterminal source, full index, or competing CAS rejects without changing the index. A crash after Receipt publication but before index CAS is repaired only by re-verifying those same four durable objects and retrying this exact call; no filesystem walk or caller path is allowed.
- `casUploadStartedAuthorized` and `casAckAuthorized` accept only the verified transition object returned by Task 9. Each atomically adds the transition JTI/token digest to the bounded closeout replay set in the same canonical CAS that changes closeout state; they have no key-only overload.
- `readCompactionPreflight({ protectedNonterminalTransactionIds })` accepts only the exact sorted output of the replay ledger, reads/fsync-verifies the closeout index, and asks only the fixed `retentionReader` for active finalizer/cgroup, recovery, and parser-retention transaction IDs. It merges those with every nonterminal/active entry, every entry younger than 35 days, the newest entry per target, the newest critical entry, and every entry whose critical/recovery/parser evidence remains retained. It returns one frozen privately `WeakSet`-branded `retentionProof`; a private `WeakMap` binds that object to the exact index digest and deterministic sorted protected set, so no caller receives or edits a delete list. `compactEligible({ retentionProof, now, maintenanceCapability })` verifies both brands, uses the bound exact index digest in one canonical CAS, and removes only the deterministic complement. A no-op returns the same digest. Index drift, lock loss, concurrent recovery/parser retention, 34d23:59:59/35d boundaries, latest-target/latest-critical, active finalizer/cgroup, crash/reboot, and forged/cloned proof tests are mandatory. Receipt consumes only retained index evidence and never receives either maintenance brand.
- Boot preflight reads the fixed bootstrap root, classifies any activation lease as a known cleanup-only state, and verifies every rotation fence/journal/receipt linkage. For a verified nonterminal journal whose deterministic fence is missing, its sole mutation is to recreate/fsync/read back that exact fence through the durable store; every other missing/mismatched/unknown state fails closed. The separately ordered bootstrap-cleanup service converges a recognized activation lease. Preflight never chooses N/N+1, resumes rotation, clears a fence, or modifies application/database/release state.
- Finalizer scans only the bounded Gate-owned closeout index. It CAS-attaches `controller_closeout_abandoned_attached` only when the immutable transaction terminal and N-generation evidence are verified; exact lock/guard/current-pointer readback is compatible; no artifact reservation, nonterminal/recovery journal, or ambiguous status exists; `controllerCloseoutAckDeadline` has passed; and closeout remains `not_started` or `upload_started`. It never deletes, shortens retention, ACKs, uploads, or rewrites a receipt.
- Both scripts accept zero argv and fixed roots. The timer is `Persistent=true`, `OnBootSec=30s`, and `OnUnitActiveSec=30s`.

- [ ] **Step 1: Write failing deadline, registration, reboot, clean-boot, and sandbox tests**

```js
test('finalizer attaches only after terminal receipt plus fixed 120 second deadline', async () => {
  const calls = [];
  const finalizer = createControllerCloseoutFinalizer(createFinalizerHarness({ calls, nowOffsetMs: 120_000 }));
  const result = await finalizer.run();
  assert.equal(result.attached, 1);
  assert.deepEqual(calls, [
    'native:probe_all_fourteen_capabilities',
    'lease:read',
    'terminal_body:readback',
    'outer_record:readback',
    'deadline:verify',
    'closeout:read:not_started',
    'lease:cas:controller_closeout_abandoned_attached',
    'lease:readback',
  ]);
  assert.equal((await finalizer.run()).attached, 0);
});

test('a receipt rewrite or early deadline never attaches', async () => {
  for (const options of [{ nowOffsetMs: 119_999 }, { receiptDigestDrift: true }]) {
    const harness = createFinalizerHarness(options);
    await assert.rejects(createControllerCloseoutFinalizer(harness).run());
    assert.equal(harness.calls.some((value) => value.includes('lease:cas')), false);
  }
});

test('terminal publisher registers one bounded exact closeout index tuple', async () => {
  const store = createControllerCloseoutStore(createCloseoutStoreHarness());
  const input = validPendingLeaseRegistration();
  const first = await store.registerPendingLease(input);
  const second = await store.registerPendingLease(input);
  assert.equal(first.indexSha256, second.indexSha256);
  assert.equal(first.indexEntrySha256, second.indexEntrySha256);
  await assert.rejects(store.registerPendingLease({ ...input, leaseSha256: differentSha256 }), /closeout_index_binding_mismatch/);
  await assert.rejects(store.registerPendingLease({ ...input, transactionId: differentTransactionId }), /closeout_index_binding_mismatch/);
});

test('a reconstructed closeout-verification lookalike performs zero store calls', async () => {
  const calls = [];
  const store = createControllerCloseoutStore(createCloseoutStoreHarness({ calls }));
  await assert.rejects(
    store.casUploadStartedAuthorized(Object.freeze(validVerifiedTransitionFields())),
    /closeout_transition_not_verified/,
  );
  assert.deepEqual(calls, []);
});

test('closeout compaction requires both brands and protects every 35-day class', async () => {
  const store = createControllerCloseoutStore(closeoutRetentionHarness());
  const replay = createAdmissionReplayLedger(replayRetentionHarness({ maximumEntries: 128 }));
  const maintenance = createBootstrapMaintenanceCoordinator(maintenanceHarness({
    now: terminalAtPlus({ days: 35 }),
  }));
  const result = await maintenance.runTerminalCloseoutPreflight({
    admissionReplayLedger: replay,
    controllerCloseoutStore: store,
  });
  assert.deepEqual(result.protectedReasons, [
    'active_nonterminal', 'younger_than_35_days', 'latest_for_target',
    'latest_critical', 'recovery_retained', 'parser_retained',
  ]);
  const proof = await store.readCompactionPreflight({
    protectedNonterminalTransactionIds: await replay.listProtectedNonterminalTransactionIds(),
  });
  await assert.rejects(store.compactEligible({
    retentionProof: Object.freeze({ ...proof }),
    now: terminalAtPlus({ days: 35 }),
    maintenanceCapability: forgedMaintenanceCapability(),
  }), /maintenance_or_retention_capability_invalid/);
});
```

Before running, also table-drive every preflight/finalizer state and every exact unit directive listed in Step 4, including `clean_noop`, each single residue, invalid retained cleanup evidence, 1,024/1,025 index entries, 1-MiB/one-byte-over index bytes, competing registration/ACK/finalizer CAS, and each real denied operation. These tests are authored while the modules/units are absent.

- [ ] **Step 2: Run finalizer/systemd tests and verify RED**

Run: `node --test server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs`

On target-matched disposable Linux, first extend and run: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: FAIL because preflight/finalizer code and units are absent.

- [ ] **Step 3: Implement terminal-body/outer-record/lease verification**

```js
export function createControllerCloseoutFinalizer({ native, closeoutStore: store, hostStateReader, clock }) {
  return Object.freeze({
    async run() {
      requireAllFoundationCapabilities(native.probeLinuxCapabilities());
      let attached = 0;
      for (const leaseId of await store.listPendingLeaseIds()) {
        const lease = await store.readLease(leaseId);
        const terminal = await store.verifyTerminalEligibility(leaseId);
        if (terminal.value.controllerCloseoutAckDeadline !== lease.value.controllerCloseoutAckDeadline) {
          throw new Error('ack_deadline_binding_mismatch');
        }
        await hostStateReader.verifyTerminalReadback(leaseId, terminal.value);
        if (clock.now() < Date.parse(lease.value.controllerCloseoutAckDeadline)) continue;
        const closeout = await store.readCloseout(leaseId);
        if (!['not_started', 'upload_started'].includes(closeout.value.state)) continue;
        const next = createAttachedCloseoutLease(lease.value, closeout.sha256, clock.now());
        await store.casLeaseAttached(leaseId, lease.sha256, next);
        attached += 1;
      }
      return Object.freeze({ scanned: true, attached });
    },
  });
}
```

The immutable terminal body contains the initial closeout lease ID/timestamps but no self digest. Its digest is bound by the separately durable outer replay record and independent lease. Crash tests must cover body fsync/hash, outer record publication, initial lease publication, and attachment CAS.

- [ ] **Step 4: Add exact service and timer units**

```ini
[Unit]
Description=Proxy Gateway control-plane closeout lease finalizer
After=local-fs.target proxy-gateway-control-boot-preflight.service

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry closeout-finalizer-v1
User=root
Group=root
UMask=0077
TimeoutStartSec=20
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadOnlyPaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1
ReadOnlyPaths=/opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases
ReadWritePaths=/var/lib/proxy-gateway-control-plane/transactions/v1
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
```

```ini
[Unit]
Description=Run control-plane closeout finalizer every 30 seconds

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=1s
Persistent=true
Unit=proxy-gateway-control-closeout-finalizer.service

[Install]
WantedBy=timers.target
```

The boot-preflight service is a narrow oneshot, ordered after local filesystems and before bootstrap cleanup, closeout finalizer, normal deployment admission, and the application service. It may durably recreate only a verified missing rotation fence under the bootstrap root; only `proxy-gateway-control-bootstrap-cleanup.service` may write activation cleanup evidence. None of these units is enabled or started in this source-only slice.

```ini
[Unit]
Description=Proxy Gateway control-plane boot state preflight
DefaultDependencies=no
After=local-fs.target
Before=proxy-gateway-control-bootstrap-cleanup.service proxy-gateway-control-closeout-finalizer.service proxy-gateway-candidate.service

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/proxy-gateway-control-plane-node-helper-entry boot-preflight-v1
User=root
Group=root
UMask=0077
TimeoutStartSec=20
StandardOutput=null
StandardError=null
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
PrivateDevices=yes
PrivateTmp=yes
PrivateNetwork=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
ReadWritePaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1
RestrictAddressFamilies=AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictSUIDSGID=yes
RemoveIPC=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@mount @reboot @swap @raw-io @obsolete @debug @module @clock @keyring @privileged
IPAddressDeny=any
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /root /home /media /mnt
```

Ordering is pulled in, not merely declared. Add this target and candidate drop-in:

```ini
[Unit]
Description=Proxy Gateway control-plane authorization prerequisites
Requires=proxy-gateway-control-bootstrap-systemd-broker.socket proxy-gateway-control-boot-preflight.service proxy-gateway-control-bootstrap-cleanup.service
Wants=proxy-gateway-control-deploy-protocol.socket proxy-gateway-control-bootstrap-protocol.socket proxy-gateway-control-recovery-challenge-broker.socket proxy-gateway-control-accepted-artifact.socket proxy-gateway-control-closeout-finalizer.timer
After=proxy-gateway-control-bootstrap-systemd-broker.socket proxy-gateway-control-boot-preflight.service proxy-gateway-control-bootstrap-cleanup.service
Before=proxy-gateway-candidate.service
```

```ini
[Unit]
Requires=proxy-gateway-control-authorization.target
After=proxy-gateway-control-authorization.target
```

The host layout/install contract places the target and drop-in under `/usr/lib/systemd/system`; the candidate service therefore pulls preflight/cleanup and the persistent timer/socket on boot. Contract tests use `systemd-analyze verify` plus an isolated manager transaction to prove the pulled order. Source implementation does not enable/start them.


- [ ] **Step 5: Execute the previously written reboot/finalizer/real-sandbox matrices**

Cover crash after terminal body/outer/lease/closeout publication but before bounded-index registration and prove exact repair; reboot before/after ack deadline; `not_started`, `upload_started`, and `upload_committed_observed`; duplicate timer invocations; concurrent exact ACK; wrong receipt; early/failed CAS; unknown journal; lingering activation cgroup; missing cleanup evidence; and retained attached lease. Add an isolated boot-manager case where activation lease/key/sudoers/record/cgroup/nonterminal journal are all absent and retained cleanup evidence is legal: cleanup returns `clean_noop`, authorization target succeeds, and candidate may start. Then add one case per residue or invalid/missing evidence and prove cleanup/target/candidate fail closed. Under the real preflight/finalizer profiles, require `EROFS` for disallowed ProtectSystem writes, `ENOENT` for hidden `/dev/kmsg`, `EAFNOSUPPORT` for AF_INET/AF_INET6, `EACCES` for manager/D-Bus/InaccessiblePaths, and `EPERM` for arbitrary-unit escalation plus `mount`, `reboot`, `bpf`, `ptrace`, `keyctl`, and namespace creation, with byte/unit/mount/cgroup pre/post snapshots unchanged; positive tests prove preflight can write only its fixed fence logical ID and finalizer only its exact lease CAS. Assert ACK wins only with exact artifact proof, attachment never deletes, and later recovery remains readable.

Run and observe RED by state family before adding its finalizer/preflight transition; rerun after each minimal branch.

- [ ] **Step 6: Run targeted tests and verify GREEN**

Run: `node --test server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-host-protocol.test.mjs`

On target-matched disposable Linux: `node --test integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit boot/finalizer units**

```bash
git add server/services/deployment/control-plane-controller-closeout-store.mjs server/services/deployment/control-plane-bootstrap-maintenance.mjs ops/control-plane-deploy/contracts/controller-closeout-index-v1.json scripts/control-plane-boot-preflight.mjs scripts/control-plane-closeout-finalizer.mjs ops/control-plane-deploy/systemd/proxy-gateway-control-boot-preflight.service ops/control-plane-deploy/systemd/proxy-gateway-control-closeout-finalizer.service ops/control-plane-deploy/systemd/proxy-gateway-control-closeout-finalizer.timer ops/control-plane-deploy/systemd/proxy-gateway-control-authorization.target ops/control-plane-deploy/systemd/proxy-gateway-candidate.service.d/10-control-plane-authorization.conf integration/control-plane-deploy/bootstrap-sandbox-linux.test.mjs server/services/deployment/control-plane-bootstrap-store.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs
git commit -m "feat: converge bootstrap and closeout state at boot"
```

Only after this Task 10 commit is GREEN may Receipt/Recovery Task 4 import the frozen closeout transition contract and implement its real terminal publisher/index handoff. The executable dependency order is therefore Bootstrap Tasks 1-8, Artifact/Workflow Task 8, Bootstrap Tasks 9-10, then Receipt/Recovery Task 4; Task 11 still waits for all cross-slice owners named below.

---

### Task 11: Disposable-Linux bootstrap/transport recovery integration

**Files:**
- Create: `server/services/deployment/control-plane-ordinary-status-store.mjs`
- Create: `server/tests/control-plane-ordinary-status-store.test.mjs`
- Create: `integration/control-plane-deploy/bootstrap-clean-linux.test.mjs`
- Modify: `package.json`
- Modify: `server/tests/control-plane-bootstrap-systemd-contract.test.mjs`
- Modify: `server/tests/control-plane-transport-redaction.test.mjs`

**Interfaces:**
- Add `npm run test:control-plane-bootstrap-linux`, which runs only `integration/control-plane-deploy/bootstrap-clean-linux.test.mjs` and refuses execution unless the foundation capability probe reports real Linux/systemd/cgroup v2/memfd/seals/`close_range` support.
- This task starts only at the global `Artifact 11-13 -> Bootstrap 11` checkpoint: Receipt/Recovery Tasks 1-8, Host/Database Task 11A plus the remainder of Task 11 and Tasks 12-13, and Artifact/Workflow Tasks 3-13 (including the complete controller, terminal-bundle consumer, closeout, and final-status sink) must be present and individually GREEN on the same branch. The harness imports every real public consumer/provider interface and exact cross-plan contract, including Host's branded `createControlPlaneHostInventoryReaders`/`assertControlPlaneHostInventoryReaders`; it does not replace terminal bundles, transport lifecycle, authorization, inventory readers, terminal/controller/transaction, closeout, or final-status behavior with Bootstrap-local fixtures. Host Task 14A's one-shot source-only G1a installer is later in the DAG and is neither copied nor invoked here.
- At this checkpoint implement the Task 9-frozen `createOrdinaryStatusStore`/`createOrdinaryStatusReader` interface against the real Host `createCriticalPostPublicationProofReader` and `assertCriticalPostPublicationProof`, then run `server/tests/control-plane-ordinary-status-store.test.mjs` before the Linux harness. Task 9's router used only an injected interface fixture and did not create this downstream consumer early. The real unit test forks independent parser/finalizer processes and proves active finalizer, present cgroup, fence drift, blocked global identity/business lease, recovery/recorder/custody/migration activity, and a cloned Host proof all withhold the sixteen-field critical terminal. Both `terminal_quiescence_pending` and transaction-scoped `terminal_quiescence_rejected` remain immutable-false/no-bundle poll states; only the same Host-branded reference after complete inactive/free readback allows the immutable `critical_manual_intervention_required` terminal plus bundle. A bounded-poll deadline produces only `controller_incomplete_no_production_claim`, never a pre-admission rejection. The test also proves the controller-side status brand reaches Receipt unchanged and never serializes the Host proof.
- The integration harness takes no production endpoint or credential. It constructs synthetic principals and state inside a disposable target-matched Linux image, uses a local loopback `sshd` test namespace, and tears down its exact test units/users/directories through the disposable-image reset.
- The default `npm test` remains networkless and does not require root/systemd; it still runs every `server/tests/*.test.mjs` unit/contract test.

- [ ] **Step 1: Add a failing package-script and capability-gate test**

```js
test('clean Linux harness requires every proved native/systemd capability', async () => {
  const receipt = buildCapabilityReceipt(() => probeLinuxCapabilities());
  assert.equal(receipt.schemaVersion, '1');
  assert.equal(receipt.receiptType, 'control_plane_linux_feasibility');
  assert.equal(receipt.eligible, true);
  assert.deepEqual(Object.keys(receipt.features), [
    'memfdOwnerMode0600',
    'memfdFullSeals',
    'sealedOpenSshDescriptorHandoff',
    'exactDescriptorInheritance',
    'atomicLogicalStateTransitions',
    'openat2BeneathNoFollow',
    'ofdIdentityLease',
    'reviewedSpawnProfileRegistry',
    'scmRightsPeerBound',
    'sqliteActualMainHandle',
    'directoryFsyncDurability',
    'systemdTemplateIsolation',
    'systemdPersistentTimer',
    'cgroupKillReadback',
  ]);
});
```

- [ ] **Step 2: Run on target-matched disposable Linux and verify RED**

Run: `npm run test:control-plane-bootstrap-linux`

Expected: FAIL because the script/integration harness is absent.

- [ ] **Step 3: Implement clean genesis and forced-command scenarios**

Build the native binaries through Foundation's reviewed registry fragment/manifest and frozen standalone-target compiler, materialize the final layout only inside the disposable root, create both exact root:root mode-`0600` regular single-link relay lock files plus synthetic locked principals, start only the local test `sshd`, and exercise: static prepare; exact activation-lease/operation-envelope fields; record-last key/sudoers/record crashes; compatibility content-to-activation typed edge; exact forced shim -> no-argument temporary sudo -> per-principal `flock` -> pre-connect absolute deadline -> tiny native root relay -> root-only AF_UNIX -> `Accept=no` sandbox/helper FD-3 path for both principals; rejection of direct socket, cross-relay, wildcard/argument/environment/Node/systemd sudo authority; independent compatibility inventory versus Gate-bound `bootstrap_activation` routing; updater provider stub with sealed token; genesis receipt; activation cgroup empty; key/sudoers/record/lease absent; cleanup evidence present; clean-boot `clean_noop`; rotation fence absent only after committed `rotation_closed`; exact-N abort ending only at `rotation_aborted_closed`; and normal deploy key rejecting an activation/original command/PTY/forwarding/environment injection. This fixture validates the layout but does not import or emulate Host Task 14A's production G1a installer.

- [ ] **Step 4: Implement crash/reboot and transport scenarios**

For each activation state (`staging`, `armed`, `in_progress`, `terminal`, every `cleanup_pending` substep), power-cycle the disposable image at the durable boundary, run boot preflight/cleanup, and assert cleanup-only convergence. Prove each lease-absent residue blocks the authorization target while the entirely absent tuple plus legal retained evidence returns `clean_noop`. Exercise first/second concurrent compiled relay per principal, crash-released `flock`, lock symlink/owner/group/mode/link drift, a kernel backlog filled to 16 plus the 17th and later attempts, immediate connect, `EINPROGRESS`, `SO_ERROR`, connection loss, activation expiry with descendants, unknown journal, closeout-index repair, finalizer reboot before/after deadline, the single pre-connect 9,999/10,000-ms boundary, 300-second deploy boundary, and bootstrap's exact owner-internal ready transition with 900,000-ms operation max, 910,000-ms authenticated relay deadline, 925,000-ms controller request timeout, and 930-second protocol lifetime. Prove all record/Gate/expiry/principal/fence readbacks occur before ready, ready write rejection/disconnect/10-second timeout performs zero claim or mutation, wrong/partial/duplicate/cross-binding/final-first ready never extends the original deadline, valid ready is swallowed by transport, a 900-second terminal succeeds, and post-ready timeout/crash converges only through the existing cleanup/recovery state. Also exercise one parser slot, token-bucket refill, slowloris, and challenge-map purge/cap/flood. Snapshot `/proc/self/fd` and lock state around every failure. For transport, inspect child FDs/options, pin the loopback host key, and reject a changed key. Prove two separately credential-fixed five-method transport instances: the deploy instance materializes its exact eleven-field deploy capture once for execute, polls, 768-byte terminal-bundle chunks, both closeout transitions, and recovery; the bootstrap instance independently materializes its exact eleven-field bootstrap capture once for `bootstrap_activation`. Each operation uses a fresh zeroized clone, each instance has idempotent `close`, and tests prove original-FD absence, cross-credential rejection, and post-close rejection. Prove no raw-secret selector and synthetic key/token/endpoint bytes absent from files, journal, stdout, and stderr.

- [ ] **Step 5: Implement N-to-N+1 and updater uncertainty scenarios**

Run complete N-to-N+1, crash at every journal transition, token POST response loss, controller loss after token mint, provider recovery cleanup, fresh activation resume, exact abort-to-N, dual cleanup proof, final receipt/HMAC/outer-state readback, and the exact direct-workflow Artifact authorization/OIDC claim matrix with `nbf < iat`. Prove exact plan/Gate/authorization/OIDC owner validation; the singleton maintenance lock/read/eligible-compact/no-op always runs before accepted-plan publication; a compactable full 128-entry ledger permits the 129th attempt only after CAS/readback while a noncompactable full ledger performs zero accepted-plan/reservation/ready writes. Then prove accepted-plan publication/readback and atomic Gate/record/JTI/token/transaction reservation precede `ready_for_artifact`; verify the approved five-field accepted acknowledgment, four-field ordinary status selector, Host-branded normal/compatibility readers, Transport-internal three-field activation ready consumed exactly once, and caller-visible six-field bootstrap-activation response. Read the Receipt-owned terminal bundle only through contiguous 768-byte raw chunks in <=2-KiB responses and Bootstrap's aggregate helper; validate its four exact objects through Receipt; transfer the accepted artifact through fixed custody; read back four source objects; publish the Host-canonical accepted-start projection; and prove broker-independent invocation digest recomputation. Disconnect or lose ACK at every boundary, reboot custody, and recover the same durable state without `receiver.abort` after commit/handoff. Import Receipt's exact `createControllerCloseoutAdapter` surface: terminal validation receives only Bootstrap's `{ bytes, sha256 }` bundle wrapper; upload-start validation, ACK validation, and the later ordinary committed-status validation consume three distinct complete transport envelopes; ACK never becomes final status. Race transition-specific OIDC tokens, JTI reuse, bounded closeout-index handoff, replay `bindTerminal`, compactor crash/race/retention, finalizer, read-only inventory/recovery challenge/status, and parser-retention rejection. Assert compatibility inventory never activates or emits ready, stale/drifted activation evidence writes nothing, a deployment key cannot activate, a key-only request performs zero state writes, and there is never a deployment-key fallback while fenced.

- [ ] **Step 6: Run all bootstrap validation**

Run on target-matched disposable Linux:

```bash
npm run test:control-plane-bootstrap-linux
node --test --test-concurrency=1 server/tests/control-plane-bootstrap-contract.test.mjs server/tests/control-plane-bootstrap-store.test.mjs server/tests/control-plane-bootstrap-activation-contract.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-bootstrap-activation-publisher.test.mjs server/tests/control-plane-bootstrap-updater.test.mjs server/tests/control-plane-bootstrap-systemd-contract.test.mjs server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-github-oidc-verifier.test.mjs server/tests/control-plane-authorization-verifier.test.mjs server/tests/control-plane-admission-replay-ledger.test.mjs server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-session-limit-broker.test.mjs server/tests/control-plane-ordinary-status-store.test.mjs server/tests/control-plane-recovery-challenge-broker.test.mjs server/tests/control-plane-transaction-ingress.test.mjs server/tests/control-plane-accepted-artifact-handoff.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs
```

Expected: PASS with zero skips in the integration test.

- [ ] **Step 7: Run repository regression and diff checks**

Run:

```bash
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

Expected: all tests PASS; diff check has no output; status contains only the intended source-only Draft PR files. Do not dispatch, enable, start, install, connect to production, or write GitHub Environment/provider state.

- [ ] **Step 8: Commit integration coverage**

```bash
git add server/services/deployment/control-plane-ordinary-status-store.mjs server/tests/control-plane-ordinary-status-store.test.mjs integration/control-plane-deploy/bootstrap-clean-linux.test.mjs package.json server/tests/control-plane-bootstrap-systemd-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs
git commit -m "test: prove bootstrap authorization recovery on clean linux"
```

---

## Source-Only Draft PR Exit Gate

- [ ] Every task commit is present and reviewable; the shared PR remains Draft.
- [ ] Foundation and bootstrap unit/native/disposable-Linux commands above pass on the exact recorded toolchain with zero integration skips.
- [ ] A schema inventory proves every critical retained receipt parser remains registered across rotation.
- [ ] Static inspection proves the only root chain is forced shim -> exact no-argument temporary sudo -> validated per-principal kernel `flock` -> one pre-connect absolute deadline -> tiny reviewed native relay -> fixed root-only AF_UNIX -> `Accept=no` sandbox/helper FD 3; there is no caller path/executable/FD slot/unit/URL/repository/Environment/secret-name selector, direct sudo-to-Node route, broad sudo/systemd authority, or generic SSH command.
- [ ] Exact codec/authorization evidence proves raw plan/Gate/authorization/OIDC first-frame validation, singleton admission maintenance before any accepted-plan write including the 128/129 boundary, durable accepted-plan readback before ready, direct-workflow OIDC claims/time semantics, approved five-field accepted acknowledgment, four-field ordinary status selector, Host-branded separate pre-Gate normal/compatibility inventory codecs, disjoint fresh-Gate `bootstrap_activation`, owner-internal three-field ready plus caller-visible six-field safe terminal response, exact `900000/910000/925000` timing and `RuntimeMaxSec=930`, ready-before-mutation/disconnect-zero-write behavior, and one-response compatibility inventory. It also proves 768/262144/342 terminal-bundle bounds, phase-aware ACK loss, atomic replay consumption/terminal binding/retention compaction, Host-canonical four-field invocation proof, fixed accepted-artifact custody across detach/reboot, transaction-scoped critical quiescence polling, and transition-specific one-use closeout OIDC; key-only/stale-activation/cross-principal mutation tests show zero writes.
- [ ] Secret-scanning/redaction tests prove synthetic private key, binding key, App key, installation token, host, known-hosts key, provider payload, and raw remote output are absent from persisted/output evidence.
- [ ] The PR body records Risk A, source-only scope, exact commits/tests, production impact `none`, prohibited actions, target-matched Linux evidence, and the next read-only inventory/operator-approval Gate.
- [ ] Stop. Do not mark Ready, merge, install, enable, dispatch, rotate credentials, access the production host, or modify GitHub Environment/provider state under this plan.
