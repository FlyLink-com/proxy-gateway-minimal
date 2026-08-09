# GitHub Control-Plane Host Transaction And Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the source-only host transaction, closed two-database contract, writer fencing, coherent backup, additive migration evidence, persisted-data rollback proof, and deterministic recovery required by the approved GitHub control-plane production deployment design.

**Architecture:** A root-owned host transaction consumes the already-reviewed deployment plan and the Foundation layer's durable/native primitives. It resolves exactly two logical SQLite databases, holds one global database-identity OFD lease plus the business-mutation lease, transfers only authenticated file capabilities, quiesces the complete writer set, publishes a coherent two-database backup pair, applies at most the reviewed additive migrations in fixed order, and classifies recovery from the in-database ledger rather than an external journal hint. Candidate and rollback releases share one canonical writer-registry and persisted-data pair contract; code rollback is automatic, database restore is never automatic.

**Tech Stack:** Node.js ESM, `better-sqlite3` 12.10.0, built-in `node:test`, JSON Schema, the shared canonical-JSON and receipt modules under `server/services/deployment/`, Foundation native bindings under `ops/control-plane-deploy/native/`, and hardened systemd oneshot/template units.

## Global Constraints

- Risk: A.
- Process: source-only TDD implementation, clean Linux integration, exact-head CI/CodeQL, independent review, then a separate compatibility/bootstrap/inventory/Artifact Gate/Production Gate sequence. This plan never performs those later gates.
- Expected PR count: one source-only Draft PR slice. Keep the tasks as reviewable commits in that PR; do not split design, code, tests, and runbook evidence across separate PRs.
- Validation: focused RED/GREEN tests per task, the complete database/host integration matrix, `npm test`, `npm pack --dry-run`, `git diff --check origin/master...HEAD`, exact-head CI, CodeQL, and clean target-matching Linux validation.
- Production/AWS impact: none. Do not access Vultr, AWS, GitHub Environments, production SSH, production SQLite, protected configuration, production credentials, or production systemd in this plan.
- Precondition: the earlier Foundation checkpoint on this same source-only Draft branch must pass and expose `probeLinuxCapabilities`, `createSealedMemfd`, `createBoundedCapture`, `spawnWithExactFileDescriptors`, `durableReadLogical`, `durablePublishNoReplace`, `durableCompareAndSwap`, `durableUnlinkVerified`, `createDatabaseIdentityLease`, `sendDatabaseCapability`, `receiveDatabaseCapability`, `inspectSqliteMainHandle`, `durableWriteFile`, `durableSwapSymlink`, and `durableUnlink` from `ops/control-plane-deploy/native/index.mjs`, plus `createDurableStore({ contracts, fsOps, native })` from `server/services/deployment/durable-store.mjs`. Its aggregate receipt must contain exactly the 14 reviewed feature keys in Task 0, every value `true`, and `eligible: true`. No merge is required between slices. If any exact export, atomic durable-store behavior, receipt feature, or target-matching Linux proof is absent at the recorded checkpoint, stop before Task 1; do not recreate or weaken native feasibility here.
- Import only `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, and `sha256Hex(bytes)` from `server/services/deployment/canonical-json.mjs`. Canonical contracts use exactly `{ schemaId, maxBytes, fieldOrder, nested, arrays, validate }`. This plan owns the database constants, `canonicalizeDatabaseContracts`, and validator that adjacent plans import; it must not define a competing canonicalizer or receipt schema.
- Cross-plan execution is one exact source-only DAG on the same Draft branch: Foundation; Host Tasks 0-1; Integration Task 2; Artifact Tasks 1-2; Bootstrap Tasks 1-8; Host Tasks 2-10; Receipt Tasks 1-3; Artifact Tasks 3-8; the Task 11A closed-broker plus branded host-inventory-reader provider checkpoint; Bootstrap Tasks 9-10; Receipt Task 4; Artifact Tasks 9-10; the rest of Host Task 11 plus Host Tasks 12-13; Receipt Tasks 5-8; Artifact Tasks 11-13; Bootstrap Task 11; Integration Tasks 1 and 3; Host Task 14A source-only G1a installer contract, then Host Task 14B; then Integration Tasks 4-9. Receipt work is deliberately split at Tasks 1-3 and Task 4: both Host providers become independently GREEN and committed before Bootstrap 9-10 or Receipt 4 consumers exist, while the consumer-dependent remainder of Task 11 waits for the later checkpoints. Task 14A waits for Integration Task 1's final staged-manifest validator and Bootstrap's final host-layout bytes, but performs no host staging.
- Production resolves exactly `subscription-runtime` from `SUBSCRIPTION_DB_PATH` and `subscription-control` from `SUBSCRIPTION_CONTROL_DB_PATH`. Both values must resolve internally to explicit absolute existing persistent files outside every release, and their host-keyed physical identities must differ. No fallback, `CONTROL_DB_PATH`, shared file, release-local file, or implicit creation is accepted.
- `candidate-start.mjs` is the sole production-capable application entrypoint and fixes `schemaStartupMode: "existing_schema_only"` internally. `server/index.mjs`, `daemon.mjs`, `gccgw server start`, package aliases, copied scripts, and direct Node calls must fail before a production database opens unless they are classified as local/synthetic-only.
- Every production database open uses an authenticated capability, an actual-main-handle proof, a shared global database-identity lease for the full handle lifetime, and a before/after `critical_identity_fence` check. No production API accepts a database path.
- The writer universe is disjoint and exhaustive: one application writer, three reviewed auxiliary writers, three gated operator mutations, and two fixed migration entrypoints. Unknown, overlapping, dynamically resolved, or uncovered launch surfaces fail registry verification.
- Auxiliary writers use stop/drain/restore plus durable no-loss/no-duplicate semantics. Application lifetime uses the application permit. Operator DML uses the shared business-mutation lease and guard. Migration uses the exclusive lease, exact phase, fixed UID/unit/cgroup, and inherited database capability. Do not apply auxiliary pause semantics to another category.
- Hold write-exclusion locks on both SQLite databases across both online backups. Publish the pair manifest only after both backups close, fsync, rename, parent-fsync, final read-only reopen, identity readback, and `quick_check=ok`. Close/read back both backup handles and both write-lock connections before starting either migration.
- Version 1 permits `schemaMode: "none"` or an exact reviewed transactional backward-compatible additive change. Drop, rename, destructive rewrite, incompatible constraint, identity impact, or direct migration execution is rejected.
- The authoritative migration evidence is a row in `control_plane_schema_migration_ledger` committed in the same SQLite transaction as DDL. `commit_pending` and `commit_observed` are non-authoritative journal hints.
- Never change the existing exact three-column `platform_schema_migrations` table. Existing wallet/commerce/payment/authority validators depend on it. The deployment ledger is a separate table and is created only inside an approved additive transaction.
- SQLite has no cross-file transaction. Process the databases in the fixed order `subscription-runtime`, then `subscription-control`. Once either database newly commits, a later failure can produce only a schema-only previous-release state, code rollback, or critical state; it can never be reported as unchanged.
- Candidate acceptance may write business data. After that point automation may switch code back, but it must never overwrite either live database from backup. Backup restoration requires a new explicit database-recovery Risk A Gate.
- Persisted-data compatibility is exact-pair evidence for candidate and rollback source/artifact/tree/runtime/dependency identities. Tests use synthetic rows only and exercise every registered enum, JSON shape, lifecycle state, cross-record invariant, and rollback writeback. `dataCompatibilityImpact` must remain `false`.
- All journal, registry, manifest, test, and receipt output is bounded and aggregate-only. Never emit paths, device/inode values, environment contents, endpoint values, tokens, credential references, SQLite rows, UUIDs, controller payloads, or customer data.
- This Host slice must not edit `docs/CURRENT_RELEASE_STATE.md` or `RELEASE_MANIFEST.md`, add a Deploy Note, or claim that source, host-staging, or production facts are true. This Host-slice boundary does not prohibit the later Integration-owned source-state reconciliation from recording an independently verified merged-source fact in `RELEASE_MANIFEST.md` while preserving `production_state: not_deployed`; production facts and the one Deploy Note still require their separate post-deployment evidence.

## Foundation Contract Consumed By This Plan

The Foundation implementation owns the C/N-API feasibility. Before this slice advances past Task 0 on the same source-only branch, its reviewed checkpoint must implement semantics equivalent to the following excerpt and prove them against the exact Linux architecture, libc, kernel, filesystem, Node ABI, `better-sqlite3`, WAL, and SHM combination. This excerpt is an audit criterion only; this plan does not edit the native source.

```c
struct msghdr message = {0};
char control[CMSG_SPACE(sizeof(int) * 2)] = {0};
struct cmsghdr *header;

message.msg_control = control;
message.msg_controllen = sizeof(control);
header = CMSG_FIRSTHDR(&message);
header->cmsg_level = SOL_SOCKET;
header->cmsg_type = SCM_RIGHTS;
header->cmsg_len = CMSG_LEN(sizeof(int) * 2);
memcpy(CMSG_DATA(header), descriptors, sizeof(int) * 2);

struct flock lease = {
  .l_type = F_WRLCK,
  .l_whence = SEEK_SET,
  .l_start = 0,
  .l_len = 0
};
if (fcntl(identity_lease_fd, F_OFD_SETLKW, &lease) == -1) return -1;
```

For each logical database, `descriptors` is exactly `[databaseFd, identityLeaseFd]`. There is no third descriptor, backup descriptor, path descriptor, or caller-selected descriptor slot. `createDatabaseIdentityLease(...)` returns a closure-internal wrapper with `leaseFd`, `proofSha256`, `openFileDescriptionProofSha256`, `readbackHeld()`, and idempotent `close()`; only the custody closure may dereference `leaseFd`, while public results expose digests only. The Foundation proof must also demonstrate that the application adapter can open `better-sqlite3` from the received capability without breaking WAL/SHM placement, and that `inspectSqliteMainHandle` proves the exact main handle used by SQLite. A path precheck followed by an unrelated SQLite open does not satisfy the precondition.

## Files And Responsibilities

### New contract and implementation files

| File | Responsibility |
| --- | --- |
| `schemas/control-plane-database-contract-v1.schema.json` | Closed exact-two database plan contract and schema-mode grammar. |
| `schemas/control-plane-writer-registry-v1.schema.json` | Canonical per-release production writer-registry grammar. |
| `schemas/control-plane-persisted-data-contract-v1.schema.json` | Exact candidate/rollback persisted-data registry and aggregate result grammar. |
| `schemas/control-plane-host-transaction-journal-v1.schema.json` | Bounded canonical accepted/stage/migration-hint/nonterminal journal grammar. |
| `ops/control-plane-deploy/writer-registry.sources.json` | Reviewed nine-record writer declaration independent of static discovery. |
| `ops/control-plane-deploy/persisted-data-registry.json` | Closed mutable-table/domain/scenario registry. |
| `server/services/deployment/database-contract.mjs` | Constants, strict normalization, owner-private canonical contract-set bytes/digest, migration/recovery classification, and terminal-vector validation shared with receipt/recovery. |
| `server/services/deployment/subscription-runtime-schema.mjs` | Explicit runtime schema bootstrap for synthetic/local use and exact existing-schema validation. |
| `server/services/deployment/subscription-control-schema.mjs` | Explicit base control schema bootstrap for synthetic/local use and exact existing-schema validation. |
| `server/services/deployment/sqlite-schema-identity.mjs` | Aggregate-only canonical SQLite schema identity and exact identity assertion. |
| `server/services/deployment/database-capability-custody.mjs` | Authenticated transaction-local custody protocol over Foundation SCM_RIGHTS/OFD primitives. |
| `server/services/deployment/database-binding-session.mjs` | Open an existing SQLite database from inherited capability and prove its actual main handle. |
| `server/services/deployment/writer-admission.mjs` | Category-specific application, auxiliary, operator, and migration permit/lease/guard admission. |
| `server/services/deployment/writer-registry.mjs` | Declaration-independent launch-surface discovery, canonical registry generation, and exact comparison. |
| `server/services/deployment/sqlite-backup-pair.mjs` | Two-lock coherent online backup, durability/readback, and pair-manifest publication. |
| `server/services/deployment/sqlite-migration-ledger.mjs` | Deployment-ledger DDL, exact row validation, insertion, and recovery classification. |
| `server/services/deployment/sqlite-migration-runner.mjs` | Capability-only additive migration transaction in fixed logical order. |
| `server/services/deployment/migration-entrypoints.mjs` | Fixed runtime/control migration selection with no caller-selected module or path. |
| `server/services/deployment/persisted-data-compatibility.mjs` | Closed registry validation and exact candidate/rollback bidirectional synthetic proof. |
| `server/services/deployment/persisted-data-driver.mjs` | Synthetic per-release write/read/process/writeback driver used by the pair verifier. |
| `server/services/deployment/database-transaction.mjs` | Database sub-transaction orchestration used by the host transaction and recovery chain. |
| `server/services/deployment/host-transaction-journal.mjs` | Domain adapter over the Foundation four-method durable store for journal, guard, and migration hints. |
| `server/services/deployment/control-plane-host-transaction.mjs` | Eight-stage admitted host transaction state machine. |
| `server/services/deployment/fixed-health-validator.mjs` | Starts the sole network-capable validation unit and consumes only its bounded aggregate result. |
| `server/services/deployment/fixed-systemd-broker.mjs` | Closed phase/operation broker that maps authenticated transaction requests to fixed unit sets and never accepts a unit, executable, UID, cgroup, or path. |
| `server/services/deployment/control-plane-host-inventory-readers.mjs` | Sole branded normal/compatibility host-inventory provider over fixed read-only data sources, with no selector or mutation surface. |
| `server/services/deployment/host-recovery.mjs` | Phase-chained convergence, code rollback, schema-only classification, and critical escalation. |
| `server/services/deployment/control-plane-host-bundle-installer.mjs` | Source-only G1a installer/stager contract that validates the final staged manifest, content receipt, and host layout before strict root-owned no-replace publication/readback. |
| `scripts/control-plane-writer-registry.mjs` | No-secret canonical writer discovery/verification CLI. |
| `scripts/control-plane-persisted-data-pair-check.mjs` | Clean synthetic exact-release pair verifier CLI. |
| `scripts/control-plane-persisted-data-driver.mjs` | Fixed child entrypoint for one exact release's synthetic compatibility operations. |
| `scripts/control-plane-migrate-subscription-runtime.mjs` | Zero-path, capability-only runtime migration entrypoint. |
| `scripts/control-plane-migrate-subscription-control.mjs` | Zero-path, capability-only control migration entrypoint. |
| `scripts/control-plane-application-guardian.mjs` | Fixed service guardian retaining shared leases and supervising the application child. |
| `scripts/control-plane-auxiliary-writer-adapter.mjs` | Fixed reviewed auxiliary writer adapter with permit and exactly-once checkpoint handling. |
| `scripts/control-plane-business-mutation-adapter.mjs` | Fixed three-entry operator mutation adapter with guard and shared leases. |
| `scripts/control-plane-host-transaction.mjs` | No-argument admitted transaction child reading only its inherited durable identity. |
| `scripts/control-plane-fixed-health-validator.mjs` | Fixed no-argument public/local validation child; caller cannot provide a URL or output sink. |
| `scripts/control-plane-fixed-systemd-broker.mjs` | Socket-activated root adapter for the closed systemd operation grammar. |
| `scripts/control-plane-host-recovery.mjs` | Fixed recovery-phase entrypoint invoked only by reviewed systemd units. |
| `scripts/control-plane-host-integration.mjs` | Seven-scenario clean synthetic host/database integration harness. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-transaction@.service` | Bounded detached host-local transaction template. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-validation@.service` | Bounded network-capable validation unit that durably publishes only an aggregate result. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.socket` | Root-owned, `proxy-gateway-control-broker` group `0660` AF_UNIX activation socket for fixed unit operations. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.service` | Fixed-operation root broker with access only to the systemd manager socket and fixed read-only transaction phase/accepted-start evidence projections. |
| `ops/control-plane-deploy/systemd/proxy-gateway-candidate.service.d/50-control-plane-application-guardian.conf` | Replace the candidate command with the exact lease-retaining guardian. |
| `ops/control-plane-deploy/systemd/gccgw-traffic-usage-collect.service.d/50-control-plane-writer-adapter.conf` | Bind the traffic collector to its reviewed auxiliary adapter. |
| `ops/control-plane-deploy/systemd/gccgw-sgp-tuic-delta-usage-sidecar.service.d/50-control-plane-writer-adapter.conf` | Bind the delta sidecar to its reviewed auxiliary adapter. |
| `ops/control-plane-deploy/systemd/gccgw-platform-lead-retention.service.d/50-control-plane-writer-adapter.conf` | Bind lead retention to its reviewed auxiliary adapter. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery.path` | Boot/path trigger for any retained guard or nonterminal journal. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-dispatch.service` | Select the one durable nonterminal transaction and queue fence/reconcile. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-fence@.service` | Stop/fence/drain and select the exact old/new release without starting it. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-start@.service` | Publish/read back the selected-release permit and perform a distinct fresh start. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-validate@.service` | Validate working release, service, local/public health, database, and restart bounds. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-auxiliary-restore@.service` | Restore the exact prior auxiliary state and exactly-once checkpoints. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-finalize@.service` | Remove/read back the guard and publish the non-critical terminal record. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-critical-state-recorder@.service` | Persist only `critical_finalize_pending` while retaining fences and quiescence. |
| `ops/control-plane-deploy/systemd/proxy-gateway-control-critical-terminal-finalizer.service` | External critical-terminal publication after every other transaction/runtime writer unit, handle, and permit is quiescent; the active finalizer holds the global identity/business leases and unchanged fence through durable publication, exits, and leaves the later ordinary-status readback to prove finalizer inactive and leases free. |

### New tests

| File | Responsibility |
| --- | --- |
| `server/tests/control-plane-database-foundation-contract.test.mjs` | Verify all consumed Foundation exports and stop on unsupported native semantics. |
| `server/tests/control-plane-database-contract.test.mjs` | Exact two-entry grammar and terminal matrix. |
| `server/tests/control-plane-sqlite-schema-identity.test.mjs` | Stable schema-only identities and secret/row exclusion. |
| `server/tests/control-plane-database-binding-session.test.mjs` | Capability-only open, actual-handle proof, fence/lease lifetime, and close behavior. |
| `server/tests/control-plane-database-capability-custody.test.mjs` | Peer/unit/cgroup/phase/permit authentication and SCM_RIGHTS lifecycle. |
| `server/tests/control-plane-writer-admission.test.mjs` | Four-category guard/permit/lease semantics and direct-invocation rejection. |
| `server/tests/control-plane-writer-registry.test.mjs` | Independent discovery, nine-record equality, aliases, dormant bindings, and bypass detection. |
| `server/tests/control-plane-sqlite-backup-pair.test.mjs` | Two-lock coherence and every file/directory durability fault boundary. |
| `server/tests/control-plane-sqlite-migration-runner.test.mjs` | Atomic DDL/ledger, idempotence, fixed order, partial commit, and post-COMMIT recovery. |
| `server/tests/control-plane-persisted-data-compatibility.test.mjs` | All mutable domains and bidirectional candidate/rollback writeback. |
| `server/tests/control-plane-database-transaction.test.mjs` | Backup-to-schema handoff, handle closure, terminal vector, and recovery classification. |
| `server/tests/control-plane-host-transaction-database.test.mjs` | Eight host stages, pointer/permit barriers, candidate acceptance, and rollback. |
| `server/tests/control-plane-host-transaction-journal.test.mjs` | Exact CAS/domain mapping over the frozen Foundation durable-store surface. |
| `server/tests/control-plane-fixed-health-validator.test.mjs` | Fixed endpoint/unit identity, timeout, aggregate result, and no caller-selected network input. |
| `server/tests/control-plane-fixed-systemd-broker.test.mjs` | Closed operation grammar, peer/phase binding, fixed unit mapping, arbitrary-unit denial, and Task 11 real-profile denials. |
| `server/tests/control-plane-host-inventory-readers.test.mjs` | Branded exact reader pair, fixed-source normal/compatibility evidence, activation byte-compare, and zero-selector/zero-mutation proof. |
| `server/tests/control-plane-host-recovery.test.mjs` | Phase chaining, reboot convergence, single rollback attempt, and critical finalization. |
| `server/tests/control-plane-host-bundle-installer.test.mjs` | Final manifest/layout/content verification, strict allowlist, root ownership/mode, no-replace/fsync/readback, and source-PR no-execution proof. |
| `server/tests/control-plane-host-systemd-contract.test.mjs` | Unit graph, exact phase sandboxes, real denied path/unit/database/syscall/address-family probes, fixed commands, and no dependency cycle. |
| `server/tests/control-plane-host-integration.test.mjs` | Seven required clean synthetic end-to-end scenarios. |

### Adjacent-owner contracts consumed without modification

- Bootstrap Tasks 9-10 own `server/services/deployment/control-plane-accepted-artifact-handoff.mjs`, the accepted-plan/admission writer, and the replay-ledger quota/terminal compactor. Bootstrap validates the exact canonical deployment-plan bytes and Production Gate receipt bytes delivered by Artifact, publishes the closed immutable `accepted-plan` object with no-replace durability, fsyncs its parent, and independently reads it back before artifact acceptance. That object contains only the approved plan/Gate payload and their existing bindings; it never contains the later accepted-record digest, authorization-reservation digest, artifact-capability identity, or invocation digest. After artifact acceptance, Bootstrap uses the separate Host-owned accepted-start projection to bind those later facts to `acceptedPlanSha256`. Host owns no accepted-plan writer and must stop if this Bootstrap publication/readback is absent.
- Bootstrap Task 9 exports `createAcceptedArtifactConsumer({ ingressStore, native, peerVerifier })`. Its only Host-facing method is `receive({ transactionId, acceptedArtifactRecordSha256 })`, which returns one opaque pathless capability with idempotent `close()` only after internally verifying the durable accepted record/readback, peer, descriptor identity, transaction, unsigned-64-bit size, SHA-256, and EOF. Host does not duplicate or widen the capability shape. A live duplicate rejects, while reboot recovery reopens only the fixed accepted object after the prior unit/cgroup is independently inactive and repeats no-follow verification. On the producer side, Bootstrap injects the Host-owned narrow `transactionBrokerClient` and may call only `startAcceptedTransaction({ transactionId, invocationSha256 })`; handoff/custody code receives neither a systemd manager nor a manager/broker socket capability and cannot name a unit.
- The start digest is exactly `SHA-256(UTF8("control-plane-transaction-start-accepted-v1") || 0x00 || canonicalEvidenceBytes)`, where `canonicalEvidenceBytes` has exact field order `acceptedArtifactRecordSha256`, `acceptedPlanSha256`, `authorizationReservationSha256`, then `artifactCapabilityIdentitySha256`, with four lowercase 64-hex values and no extra key. Bootstrap computes the request value only after all four source objects/proofs are durable and read back. The Host fixed broker independently reads the same four fixed admission projections and recomputes the digest; wrong, stale, missing, cross-transaction, reordered, or noncanonical evidence rejects before any manager call. Neither side accepts a precomputed component, path, unit, or extra field from the caller.
- Bootstrap alone exports and implements replay-ledger `bindTerminal(...)`, `compactEligible(...)`, and its quota/retention policy. It imports Host Task 1's single executable `HOST_FINAL_STATES` algebra and `isCriticalHostFinalState`, rejects every `bindTerminal` value outside that owner enum, and branches retention on the real state: `deployed_validated`, `stopped_pre_switch`, `schema_committed_previous_release_validated`, and `rolled_back` use the Bootstrap ordinary-terminal retention rule, while `critical_manual_intervention_required` uses only Bootstrap's separately protected critical-terminal rule. It must not introduce aliases such as `success`, `failure`, `terminal`, or `critical`. Active/reserved/artifact-accepted entries and Host's nonterminal `critical_finalize_pending` are never eligible; a critical terminal is never routed through the ordinary branch. Host consumes only the protected-transaction listing and terminal binding through the owner interface; it does not copy any owner entry/age/retention constant, implement a second compactor, or delete admission state. A terminal bind occurs only after Receipt's durable terminal tuple and Bootstrap closeout index are both read back.
- Receipt Task 2 owns `server/services/deployment/control-plane-terminal-closeout-store.mjs` and `server/services/deployment/control-plane-host-terminal-publisher.mjs`. Host creates exactly one `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })` for the transaction, then passes it to `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector })`. `bootstrapMaintenance` is the one Bootstrap-owned `createBootstrapMaintenanceCoordinator({ native, clock })` instance for the process and `admissionReplayLedger` is the same Bootstrap-owned ledger instance later used for terminal binding; normal finalize, phase-chained recovery finalize, and external critical finalize must pass those same two references unchanged. Before any Receipt-owned write the publisher may call only `bootstrapMaintenance.runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore: bootstrapCloseoutStore })`. The transaction-bound store is the only Host-facing terminal writer/reader and exposes exactly `publishTerminalReceiptBody`, `publishTerminalOuterRecord`, `publishInitialCloseoutRecord`, `publishInitialCloseoutLease`, `readTerminalReceiptBody`, `readTerminalOuterRecord`, `readInitialCloseoutRecord`, and `readInitialCloseoutLease`; callers cannot provide a transaction, logical ID, path, raw reader, or expected digest to those methods. Receipt fixes each semantic logical ID internally, performs its own bounded independent read, derives and validates the expected digest from the canonical publication bytes or the durable adjacent-object binding, and confirms it through Foundation `readbackExact`. `bootstrapCloseoutStore` is exactly Bootstrap Task 10's `createControllerCloseoutStore(...)` instance, and the publisher may use from it only `registerPendingLease({ transactionId, leaseId, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, leaseSha256 }) -> { indexSha256, indexEntrySha256 }` after all four Receipt-owned objects are durable and read back. Its only Host finalization method is `publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence }) -> { finalState, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, closeoutLeaseSha256, closeoutIndexSha256 }`. Receipt remains the unique serializer, digest verifier, writer, reader, and publisher of terminal objects; Host never constructs or injects a terminal reader, never writes an index, never calls either owner compactor directly, and never defines a competing receipt/store protocol.
- Receipt Task 2 imports the Host Task 1 owner exports `HOST_FINAL_STATES`, `isHostFinalState`, `isCriticalHostFinalState`, and `validateDatabaseTerminalVector` at its recorded checkpoint and validates exactly that returned aggregate before publishing. Host and Receipt share no second Host/database enum, classifier, canonicalizer, or field order: Host supplies the Task 1 result unchanged, and Receipt independently rejects any incomplete non-critical vector, result drift, or host-state mismatch.
- Host Task 11A solely owns `server/services/deployment/control-plane-host-inventory-readers.mjs`. It exports only `createControlPlaneHostInventoryReaders(dependencies)` and `assertControlPlaneHostInventoryReaders(value)`. The factory returns one module-private-`WeakSet`-branded frozen exact object `{ normalInventoryReader, compatibilityInventoryReader }`; each member is frozen and has exactly `{ read(request) }`. Bootstrap Task 9 must accept this pair, pass the same reference through `assertControlPlaneHostInventoryReaders`, and inject its two members into the fixed router; it may not accept two unrelated caller-created readers or implement a fallback inventory provider.
- This plan imports those exact exports after their same-branch owner checkpoints. It does not modify either adjacent-owner file, invent a fallback adapter, or continue when an export is absent.

### Existing files that must change because they are production consumers or bypasses

| File | Required change |
| --- | --- |
| `server/services/subscriptions/repository.mjs` | Remove unconditional parent creation, WAL mutation, and `CREATE TABLE IF NOT EXISTS`; require explicit startup mode and injected production connection. |
| `server/services/platform/subscription-control-db.mjs` | Replace `initializeSchema` boolean/default with explicit startup mode; remove implicit table/column alteration from existing-schema mode. |
| `server/services/platform/coin-wallet-store.mjs` | Use the shared injected control connection in production. |
| `server/services/platform/coin-commerce-store.mjs` | Use the shared injected control connection in production. |
| `server/services/platform/payment-store.mjs` | Use the shared injected control connection in production. |
| `server/state.mjs` | Remove production path fallbacks; accept exactly two database sessions and reuse one control handle across all nested stores. |
| `server/start.mjs` | Carry fixed startup mode and sessions without reopening paths. |
| `server/services/platform/coin-commerce-production-runtime.mjs` | Require the production application guardian/session contract. |
| `candidate-start.mjs` | Fix `existing_schema_only`, receive inherited capabilities, and remain the sole production entrypoint. |
| `server/index.mjs` | Become local-only and reject production database configuration before opening SQLite. |
| `daemon.mjs` | Become local-only and reject production database configuration before launching a child. |
| `server/services/daemon-launcher.mjs` | Stop spawning `server/index.mjs` as a production-capable alias. |
| `bin/gccgw.mjs` | Remove package-apply schema initialization and direct production server startup; route the three operator mutations through the fixed adapter. |
| `bin/proxy-gateway.mjs` | Preserve CLI forwarding but provide no independent production startup bypass. |
| `server/services/cli/router.mjs` | Canonicalize operator aliases to three logical registry entries and the fixed adapter. |
| `package.json` | Add verification scripts, keep aliases canonical, and remove direct schema-apply/start bypasses. |
| `scripts/traffic-usage-collect-once.mjs` | Receive a control session through the auxiliary adapter instead of constructing runtime state/path stores. |
| `scripts/mihomo-connection-delta-usage-sidecar.mjs` | Receive a control session through the auxiliary adapter. |
| `scripts/platform-lead-retention.mjs` | Receive a control session and durable checkpoint through the auxiliary adapter. |
| `server/services/platform/lead-retention-operations.mjs` | Remove direct production path opens while retaining synthetic/read-only dependency injection. |
| `scripts/platform-issue-subscription.mjs` | Receive both exact sessions; eliminate the second/fallback control open through `createRuntimeState`. |
| `scripts/platform-issue-portal-entry.mjs` | Receive only the exact control session from the operator adapter. |
| `scripts/platform-issue-portal-initial-account.mjs` | Receive only the exact control session from the operator adapter. |
| `server/services/platform/coin-wallet-migrations.mjs` | Make mutation injected-connection-only; preserve exact existing ledger compatibility. |
| `server/services/platform/coin-wallet-reference-index-migrations.mjs` | Make mutation injected-connection-only. |
| `server/services/platform/coin-commerce-migrations.mjs` | Make mutation injected-connection-only. |
| `server/services/platform/payment-store-migrations.mjs` | Require the plan-bound injected transaction for mutation. |
| `server/services/platform/account-resource-authority-migrations.mjs` | Make apply/rollback injected-connection-only and disallow production rollback through this workflow. |
| `server/services/platform/account-resource-authority-commerce-migrations.mjs` | Make mutation injected-connection-only. |
| `scripts/platform-coin-wallet-schema.mjs` | Retain validate/dry-run; remove direct production apply. |
| `scripts/platform-coin-wallet-reference-index-schema.mjs` | Retain validate/dry-run; remove direct production apply. |
| `scripts/platform-coin-commerce-schema.mjs` | Retain validate/dry-run; remove direct production apply. |
| `scripts/platform-account-resource-authority-schema.mjs` | Retain validate/dry-run; remove direct production apply/rollback. |
| `scripts/aws-staging-runtime-usage-proof.mjs` | Remove arbitrary-path SQLite recording; remain observation-only. |
| `scripts/aws-staging-hysteria2-usage-proof.mjs` | Remove arbitrary-path SQLite recording; remain observation-only. |
| `scripts/tuic-per-credential-usage-proof.mjs` | Remove arbitrary-path SQLite recording; remain observation-only. |
| `scripts/vless-xray-stats-usage-proof.mjs` | Remove arbitrary-path SQLite recording; remain observation-only. |
| `server/services/edge/material-handoff-readonly-control-store.mjs` | Use a query-only identity-proven session instead of a path open. |
| `scripts/backup-subscriptions.sh` | Stop advertising a single-file production backup; delegate only to the separate gated pair-backup contract. |
| `scripts/restore-subscriptions.sh` | Refuse normal deployment use and require a separately approved database-recovery adapter with the exclusive identity lease and critical-fence handling. |
| `ops/systemd/gccgw-platform-lead-retention.service` | Execute the fixed auxiliary adapter rather than the direct script. |
| `ops/systemd/gccgw-platform-lead-retention.timer` | Preserve schedule/persistence while binding the reviewed service identity. |

### Existing database modules discovered and classified, but not changed solely for this plan

These files remain library-only or synthetic-only unless static discovery finds a production launch edge. The registry test must prove that status; do not edit them merely because they import `better-sqlite3`.

- `server/services/platform/partner-attribution-event-ledger.mjs`
- `server/services/platform/partner-settlement-candidate-engine.mjs`
- `server/services/platform/partner-attribution-store.mjs`
- `server/services/platform/partner-attribution-pilot-fixtures.mjs`
- `server/services/platform/portal-attribution-binding.mjs`
- `scripts/start-local-coin-commerce-validation.mjs`

`scripts/start-local-coin-commerce-validation.mjs` must continue accepting zero arguments and creating both databases only under its own `mkdtemp` root. If discovery finds a package, systemd, CLI, or direct executable edge to any file in this section, move that file into the required-change table and fail the PR until it is gated or removed.

---

### Task 0: Verify The Foundation Stop/Go Contract

**Files:**
- Create: `server/tests/control-plane-database-foundation-contract.test.mjs`

**Interfaces:**
- Consumes the 15 exact Foundation native exports, `createDurableStore({ contracts, fsOps, native })`, its four-method atomic API, and the exact 14-feature feasibility receipt listed below.
- Produces no implementation module and no commit when the Foundation contract is absent.

- [ ] **Step 1: Add the exact export/behavior contract test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import * as native from "../../ops/control-plane-deploy/native/index.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";
import { createDurableStore } from "../services/deployment/durable-store.mjs";
import { buildCapabilityReceipt } from "../../scripts/control-plane-linux-capability-probe.mjs";

const REQUIRED_NATIVE_EXPORTS = Object.freeze([
  "probeLinuxCapabilities",
  "createSealedMemfd",
  "createBoundedCapture",
  "spawnWithExactFileDescriptors",
  "durableReadLogical",
  "durablePublishNoReplace",
  "durableCompareAndSwap",
  "durableUnlinkVerified",
  "createDatabaseIdentityLease",
  "sendDatabaseCapability",
  "receiveDatabaseCapability",
  "inspectSqliteMainHandle",
  "durableWriteFile",
  "durableSwapSymlink",
  "durableUnlink"
]);

const REQUIRED_FOUNDATION_FEATURES = Object.freeze([
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

function createAtomicDurableNativeFixture(calls) {
  let current = null;
  return Object.freeze({
    async durablePublishNoReplace({ bytes }) {
      calls.push("durablePublishNoReplace");
      current = Buffer.from(bytes);
      return { outcome: "created", sha256: sha256Hex(current) };
    },
    async durableReadLogical({ expectedSha256 }) {
      calls.push("durableReadLogical");
      assert.equal(sha256Hex(current), expectedSha256);
      return { bytes: Buffer.from(current), sha256: expectedSha256 };
    },
    async durableCompareAndSwap({ expectedSha256, nextBytes }) {
      calls.push("durableCompareAndSwap");
      assert.equal(sha256Hex(current), expectedSha256);
      current = Buffer.from(nextBytes);
      return { outcome: "replaced", sha256: sha256Hex(current) };
    },
    async durableUnlinkVerified({ expectedSha256 }) {
      calls.push("durableUnlinkVerified");
      assert.equal(sha256Hex(current), expectedSha256);
      current = null;
      return { outcome: "removed", present: false };
    },
  });
}

test("database plan consumes the complete reviewed Foundation contract", async () => {
  for (const name of REQUIRED_NATIVE_EXPORTS) {
    assert.equal(typeof native[name], "function", name);
  }
  const calls = [];
  const store = createDurableStore({
    contracts: new Map([["host-database-foundation-probe-v1", { maxBytes: 4096 }]]),
    fsOps: { rootFd: 41 },
    native: createAtomicDurableNativeFixture(calls),
  });
  assert.deepEqual(Object.keys(store), [
    "publishImmutable", "casCanonical", "unlinkVerified", "readbackExact",
  ]);
  const created = await store.publishImmutable(
    "host-database-foundation-probe-v1",
    Buffer.from("{}"),
  );
  await store.readbackExact("host-database-foundation-probe-v1", created.sha256);
  assert.deepEqual(calls, ["durablePublishNoReplace", "durableReadLogical"]);

  const receipt = buildCapabilityReceipt(native.probeLinuxCapabilities);
  assert.equal(receipt.eligible, true);
  assert.deepEqual(Object.keys(receipt.features), REQUIRED_FOUNDATION_FEATURES);
  assert.equal(Object.values(receipt.features).every((value) => value === true), true);
});
```

The test-only exact native double records only operation names, returns the SHA-256 of supplied bytes, and never performs a JavaScript read-then-write CAS. The Foundation-owned durable-store suite remains authoritative for `created`/`already_equal`, `replaced`/`already_equal`, verified-unlink replay, predecessor mismatch, fsync, and power-loss behavior; this downstream test prevents constructor, method, export, or 14-feature drift.

- [ ] **Step 2: Run the Foundation contract and target Linux capability suite**

Run:

```bash
node --test server/tests/control-plane-database-foundation-contract.test.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs server/tests/control-plane-durable-store.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
```

Expected: all pass on the target-matching clean Linux builder. If the native suite skips the actual-handle/WAL/OFD/SCM_RIGHTS assertions, fails, or does not exist, stop this slice and return to the earlier Foundation checkpoint on the same Draft branch.

- [ ] **Step 3: Record the same-branch Foundation checkpoint and commit the downstream contract test**

Record only the exact same-branch Foundation checkpoint commit and passing test names in the Draft PR body. Do not claim a merge prerequisite and do not copy host identities or runtime values. Commit the test that prevents later interface drift:

```bash
git add server/tests/control-plane-database-foundation-contract.test.mjs
git commit -m "test: bind database plan to foundation contract"
```

### Task 1: Add The Closed Database Contract And Terminal Matrix

**Files:**
- Create: `schemas/control-plane-database-contract-v1.schema.json`
- Create: `server/services/deployment/database-contract.mjs`
- Create: `server/tests/control-plane-database-contract.test.mjs`

**Interfaces:**
- Export `CONTROL_PLANE_DATABASE_LOGICAL_IDS` as exactly `subscription-runtime`, then `subscription-control`.
- Export `DATABASE_SCHEMA_MODES` as exactly `none`, then `additive_compatible`.
- Export `DATABASE_MIGRATION_START_STATES` as exactly `none_unchanged`, `pending_pre`, then `already_committed_post`.
- Export `DATABASE_TERMINAL_RESULTS` as exactly `unchanged_none`, `additive_not_committed_pre`, `additive_already_committed_expected_post`, then `additive_committed_expected_post_this_transaction`.
- Export `DATABASE_LEDGER_RESULTS` as exactly `not_applicable`, `absent_expected`, then `exact_present`, and `DATABASE_COMMIT_ORIGINS` as exactly `none`, `preexisting`, then `this_transaction`.
- Export the sole executable Host terminal-state enum `HOST_FINAL_STATES` as exactly `deployed_validated`, `stopped_pre_switch`, `schema_committed_previous_release_validated`, `rolled_back`, then `critical_manual_intervention_required`; also export `isHostFinalState(value)` and `isCriticalHostFinalState(value)` as predicates over that same frozen array. No Host, Bootstrap, Receipt, Artifact, or Integration module may define a second final-state array or substitute generic `success`/`failure`/`terminal`/`critical` aliases.
- Export `normalizeDatabaseContracts(value)`, `canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }`, `classifyDatabaseRecoveryVector({ contracts, ledgerObservations })`, and `validateDatabaseTerminalVector({ contracts, results, deploymentState })`.
- The schema requires exactly two ordered entries and no additional properties. JSON Schema validates field grammar; `normalizeDatabaseContracts` additionally enforces cross-field equality, ordered logical roles, distinct physical HMACs, and schema-mode conditionals.
- `canonicalizeDatabaseContracts` first calls `normalizeDatabaseContracts(value)`, then serializes `{ schemaVersion: "1", databaseContracts }` with an owner-private canonical contract and returns exactly the frozen normalized pair, bytes, and `sha256Hex(bytes)`. The private contract is not exported; only this database owner contains the 14-entry field order.
- Artifact release declaration, immutable deployment plan, artifact assembly, and source integration must call `canonicalizeDatabaseContracts(...)` separately for inventory, release, and plan inputs, require exact byte equality, and bind/verify one `databaseContractsSha256` equal to the helper's `sha256`. They must also preserve `databaseContracts` from the helper return without reshaping it. A length-two array with merely unique arbitrary IDs is invalid. Consumers may not redeclare the two logical IDs, import/copy the owner-private canonical contract, copy the 14-field order, or implement count-only/`JSON.stringify` equality.

Artifact and source-integration RED tests freeze this only permitted consumer pattern before their implementations:

```js
const inventoryDatabaseSet = canonicalizeDatabaseContracts(inventoryReceipt.databaseContracts);
const releaseDatabaseSet = canonicalizeDatabaseContracts(releaseDeclaration.databaseContracts);
const planDatabaseSet = canonicalizeDatabaseContracts(deploymentPlan.databaseContracts);
if (!inventoryDatabaseSet.bytes.equals(releaseDatabaseSet.bytes)
  || !inventoryDatabaseSet.bytes.equals(planDatabaseSet.bytes)
  || inventoryDatabaseSet.sha256 !== releaseDeclaration.databaseContractsSha256
  || inventoryDatabaseSet.sha256 !== deploymentPlan.databaseContractsSha256) {
  throw new Error("database_contract_set_binding_invalid");
}
const databaseContracts = planDatabaseSet.databaseContracts;
const databaseContractsSha256 = planDatabaseSet.sha256;
```

Those downstream tests also source-scan their Artifact/Integration modules and fail on a local 14-field list, a second canonical contract, direct `serializeCanonicalJsonBytes` use for database contracts, or `JSON.stringify(databaseContracts)`. Inventory, release declaration, immutable plan, artifact manifest, and source-validation packet carry the same `databaseContractsSha256`; only the database owner produces its bytes.

The normalized entry shape is exact:

```js
{
  logicalId,
  configuredSource,
  configuredSourceGenerationHmacSha256,
  physicalDatabaseIdentityHmacSha256,
  inventorySchemaIdentitySha256,
  migrationPreSchemaIdentitySha256,
  expectedPostMigrationSchemaIdentitySha256,
  schemaTransitionContractSha256,
  migrationStartState,
  schemaMode,
  schemaGateId,
  schemaContract,
  migrationEntryPointContract,
  migrationEntryPointSha256
}
```

`validateDatabaseTerminalVector` returns one exact aggregate-safe object. Receipt/recovery consumes these bytes and must not reshape or reclassify them:

```js
{
  logicalDatabaseCount: 2,
  uniquePhysicalDatabaseCount: 2,
  physicalDatabaseIdentitiesDistinct: true,
  databaseTerminalVectorComplete,
  entries: [{
    logicalId,
    configuredSourceGenerationHmacSha256,
    physicalDatabaseIdentityHmacSha256,
    inventorySchemaIdentitySha256,
    migrationPreSchemaIdentitySha256,
    expectedPostMigrationSchemaIdentitySha256,
    schemaTransitionContractSha256,
    migrationStartState,
    actualSchemaIdentitySha256,
    authoritativeLedgerResult,
    commitOrigin,
    terminalResult,
    actualOpenedHandleBindingVerified
  }]
}
```

For every non-critical terminal state, `databaseTerminalVectorComplete` is `true` and `entries` has exactly the two logical IDs in contract order. For `critical_manual_intervention_required` only, it may be `false`; then `entries` is the ordered safely classified subset and contains fewer than two entries. Counts and distinctness remain the already plan-bound exact-two physical database contract, not a claim that an unclassified database was opened. Every present entry still requires actual-opened-handle proof and the exact four-value terminal grammar.

`classifyDatabaseRecoveryVector` accepts `ledgerObservations` as an ordered zero-to-two safe set with exact keys `{ logicalId, actualSchemaIdentitySha256, authoritativeLedgerResult, actualOpenedHandleBindingVerified, ledgerRow }`. It verifies any present ledger row internally, derives `terminalResult`/`commitOrigin`, echoes the corresponding contract-bound HMAC/schema/start fields, and returns the aggregate object above with `databaseTerminalVectorComplete` true only for two safely classified entries. It never copies a ledger row into its return value. `validateDatabaseTerminalVector` then applies the host-state matrix to that exact aggregate object.

- [ ] **Step 1: Write failing database grammar and matrix tests**

Cover these assertions before implementation:

1. Exactly two entries in fixed logical order and exact configured sources.
2. A wrong `configuredSource`, swapped logical order, duplicate physical-identity HMAC, extra field, or third database contract is rejected. The plan contains no host path; absolute/existing/outside-release and same-file checks belong to Task 10's trusted inventory/pre-write actual-handle proof.
3. `none` requires `none_unchanged`, equal inventory/pre/post identities, and null Gate/entrypoint fields.
4. `additive_compatible` requires `pending_pre` or `already_committed_post`, a non-null exact Gate, entrypoint contract, and entrypoint digest.
5. `pending_pre + absent ledger + pre shape` classifies `additive_not_committed_pre`.
6. `pending_pre + exact ledger + post shape` classifies `additive_committed_expected_post_this_transaction` even when `commit_observed` is absent.
7. `already_committed_post + exact ledger + post shape` classifies `additive_already_committed_expected_post` and never calls migration.
8. A partial ledger/shape, wrong transition digest, wrong source commit, unknown enum, uppercase hash, or extra field rejects.
9. `deployed_validated` and `rolled_back` allow no `additive_not_committed_pre` value.
10. `schema_committed_previous_release_validated` requires at least one `additive_committed_expected_post_this_transaction`.
11. `stopped_pre_switch` permits no newly committed result but may retain an exact `additive_already_committed_expected_post` start.
12. `critical_finalize_pending` is rejected as terminal; `critical_manual_intervention_required` is the only critical terminal label.
13. `unchanged_none` binds `not_applicable/none/actual=pre`; `additive_not_committed_pre` binds `absent_expected/none/actual=pre`; `additive_already_committed_expected_post` binds `exact_present/preexisting/actual=post`; and `additive_committed_expected_post_this_transaction` binds `exact_present/this_transaction/actual=post`.
14. Every present result exactly echoes its contract HMAC/schema/transition/start fields and requires `actualOpenedHandleBindingVerified: true`; extra result/envelope keys reject.
15. Non-critical states require the complete ordered two-entry vector. Critical may carry only an ordered safely classified subset with `databaseTerminalVectorComplete: false`; no fifth result label or unproved entry is accepted.
16. Input result IDs are validated before normalization: one known plus one unknown, one missing, duplicate, swapped, or an unknown critical-subset ID rejects. A critical incomplete subset may be empty, runtime-only, or control-only, but its input order must equal the corresponding subsequence of the contract order; `complete: true` always means both exact IDs.
17. `canonicalizeDatabaseContracts` returns only `databaseContracts`, `bytes`, and `sha256`; cloned inventory/release/plan values produce identical bytes/digest, a valid field drift changes the digest, invalid order/shape rejects through normalization, and the private canonical contract is absent from module exports.
18. `HOST_FINAL_STATES` has the one exact five-value order, both exported predicates derive from that array, `critical_finalize_pending` and every generic alias reject, and a source scan across Host/Bootstrap/Receipt/Artifact/Integration rejects any second executable final-state array.

Add this table-driven boundary test before implementation:

```js
import * as databaseContractModule from "../services/deployment/database-contract.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";

const {
  CONTROL_PLANE_DATABASE_LOGICAL_IDS,
  HOST_FINAL_STATES,
  canonicalizeDatabaseContracts,
  isCriticalHostFinalState,
  isHostFinalState,
} = databaseContractModule;

test("host final states have one exact executable owner", () => {
  assert.deepEqual(HOST_FINAL_STATES, [
    "deployed_validated",
    "stopped_pre_switch",
    "schema_committed_previous_release_validated",
    "rolled_back",
    "critical_manual_intervention_required",
  ]);
  assert.equal(HOST_FINAL_STATES.every(isHostFinalState), true);
  assert.equal(isCriticalHostFinalState(HOST_FINAL_STATES[4]), true);
  for (const rejected of [
    "critical_finalize_pending", "success", "failure", "terminal", "critical",
  ]) {
    assert.equal(isHostFinalState(rejected), false, rejected);
  }
});

test("database contract canonical bytes have one private owner", () => {
  const input = databaseContractsFixture();
  const inventory = canonicalizeDatabaseContracts(structuredClone(input));
  const release = canonicalizeDatabaseContracts(structuredClone(input));
  const plan = canonicalizeDatabaseContracts(structuredClone(input));
  assert.deepEqual(Object.keys(inventory), ["databaseContracts", "bytes", "sha256"]);
  assert.deepEqual(inventory.databaseContracts.map(({ logicalId }) => logicalId), CONTROL_PLANE_DATABASE_LOGICAL_IDS);
  assert.equal(inventory.sha256, sha256Hex(inventory.bytes));
  assert.equal(release.bytes.equals(inventory.bytes), true);
  assert.equal(plan.bytes.equals(inventory.bytes), true);
  assert.equal(release.sha256, inventory.sha256);
  assert.equal(plan.sha256, inventory.sha256);
  assert.equal("DATABASE_CONTRACTS_CANONICAL_CONTRACT" in databaseContractModule, false);
  assert.equal("DATABASE_CONTRACT_ENTRY_CANONICAL_CONTRACT" in databaseContractModule, false);

  const drifted = structuredClone(input);
  drifted[0].physicalDatabaseIdentityHmacSha256 = ["f", "e", "d"]
    .map((character) => character.repeat(64))
    .find((candidate) => !input.some(
      ({ physicalDatabaseIdentityHmacSha256 }) => physicalDatabaseIdentityHmacSha256 === candidate,
    ));
  assert.notEqual(canonicalizeDatabaseContracts(drifted).sha256, inventory.sha256);
  assert.throws(
    () => canonicalizeDatabaseContracts([input[1], input[0]]),
    /database_contract_(?:logical_id|order)_invalid/,
  );
});

test("terminal vector rejects unknown, missing, duplicate, and reordered logical IDs", () => {
  const contracts = databaseContractsFixture();
  const valid = terminalVectorFixture({ contracts, deploymentState: "deployed_validated" });
  const runtime = structuredClone(valid.entries[0]);
  const control = structuredClone(valid.entries[1]);
  const cases = [
    ["known-plus-unknown", { ...valid, entries: [runtime, { ...control, logicalId: "unknown-database" }] }],
    ["missing", { ...valid, entries: [runtime] }],
    ["duplicate", { ...valid, entries: [runtime, { ...runtime }] }],
    ["swapped", { ...valid, entries: [control, runtime] }],
  ];
  for (const [name, results] of cases) {
    assert.throws(
      () => validateDatabaseTerminalVector({ contracts, results, deploymentState: "deployed_validated" }),
      /database_terminal_vector_(?:logical_id|cardinality|order)_invalid/,
      name,
    );
  }
});

test("critical incomplete vector accepts only an ordered known proper subset", () => {
  const contracts = databaseContractsFixture();
  const complete = terminalVectorFixture({ contracts, deploymentState: "critical_manual_intervention_required" });
  for (const entries of [[], [complete.entries[0]], [complete.entries[1]]]) {
    const validated = validateDatabaseTerminalVector({
      contracts,
      results: { ...complete, databaseTerminalVectorComplete: false, entries },
      deploymentState: "critical_manual_intervention_required",
    });
    assert.deepEqual(validated.entries.map(({ logicalId }) => logicalId), entries.map(({ logicalId }) => logicalId));
  }
  assert.throws(() => validateDatabaseTerminalVector({
    contracts,
    results: {
      ...complete,
      databaseTerminalVectorComplete: false,
      entries: [{ ...complete.entries[0], logicalId: "unknown-database" }],
    },
    deploymentState: "critical_manual_intervention_required",
  }), /database_terminal_vector_logical_id_invalid/);
  assert.throws(() => validateDatabaseTerminalVector({
    contracts,
    results: { ...complete, databaseTerminalVectorComplete: false, entries: complete.entries },
    deploymentState: "critical_manual_intervention_required",
  }), /database_terminal_vector_cardinality_invalid/);
});
```

- [ ] **Step 2: Run the focused test to witness RED**

Run: `node --test server/tests/control-plane-database-contract.test.mjs`

Expected: failure because `server/services/deployment/database-contract.mjs` does not exist.

- [ ] **Step 3: Implement the strict JSON Schema and pure validator**

Use a 64-lowercase-hex pattern and `additionalProperties: false` at every object level. Implement conditional checks in JavaScript rather than relying on non-portable JSON Schema data equality extensions.

```js
import {
  serializeCanonicalJsonBytes,
  sha256Hex,
} from "./canonical-json.mjs";

const DATABASE_CONTRACT_FIELD_ORDER = Object.freeze([
  "logicalId",
  "configuredSource",
  "configuredSourceGenerationHmacSha256",
  "physicalDatabaseIdentityHmacSha256",
  "inventorySchemaIdentitySha256",
  "migrationPreSchemaIdentitySha256",
  "expectedPostMigrationSchemaIdentitySha256",
  "schemaTransitionContractSha256",
  "migrationStartState",
  "schemaMode",
  "schemaGateId",
  "schemaContract",
  "migrationEntryPointContract",
  "migrationEntryPointSha256",
]);

function validateCanonicalDatabaseContractEntry(value) {
  assertExactKeys(value, DATABASE_CONTRACT_FIELD_ORDER);
}

const DATABASE_CONTRACT_ENTRY_CANONICAL_CONTRACT = Object.freeze({
  schemaId: "control-plane-database-contract-entry-v1",
  maxBytes: 16 * 1024,
  fieldOrder: DATABASE_CONTRACT_FIELD_ORDER,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate: validateCanonicalDatabaseContractEntry,
});

const DATABASE_CONTRACTS_CANONICAL_CONTRACT = Object.freeze({
  schemaId: "control-plane-database-contract-set-v1",
  maxBytes: 32 * 1024,
  fieldOrder: Object.freeze(["schemaVersion", "databaseContracts"]),
  nested: Object.freeze({
    "database-contract-entry-v1": DATABASE_CONTRACT_ENTRY_CANONICAL_CONTRACT,
  }),
  arrays: Object.freeze({
    databaseContracts: "database-contract-entry-v1",
  }),
  validate(value) {
    assertExactKeys(value, ["schemaVersion", "databaseContracts"]);
    if (value.schemaVersion !== "1") throw contractError("database_contract_set_version_invalid");
    normalizeDatabaseContracts(value.databaseContracts);
  },
});

export const CONTROL_PLANE_DATABASE_LOGICAL_IDS = Object.freeze([
  "subscription-runtime",
  "subscription-control"
]);

export function canonicalizeDatabaseContracts(value) {
  const databaseContracts = normalizeDatabaseContracts(value);
  const bytes = serializeCanonicalJsonBytes({
    schemaVersion: "1",
    databaseContracts,
  }, DATABASE_CONTRACTS_CANONICAL_CONTRACT);
  return Object.freeze({
    databaseContracts,
    bytes,
    sha256: sha256Hex(bytes),
  });
}

export const DATABASE_TERMINAL_RESULTS = Object.freeze([
  "unchanged_none",
  "additive_not_committed_pre",
  "additive_already_committed_expected_post",
  "additive_committed_expected_post_this_transaction"
]);

export const DATABASE_LEDGER_RESULTS = Object.freeze([
  "not_applicable",
  "absent_expected",
  "exact_present"
]);

export const DATABASE_COMMIT_ORIGINS = Object.freeze([
  "none",
  "preexisting",
  "this_transaction"
]);

export const HOST_FINAL_STATES = Object.freeze([
  "deployed_validated",
  "stopped_pre_switch",
  "schema_committed_previous_release_validated",
  "rolled_back",
  "critical_manual_intervention_required"
]);

export function isHostFinalState(value) {
  return HOST_FINAL_STATES.includes(value);
}

export function isCriticalHostFinalState(value) {
  return value === HOST_FINAL_STATES[4];
}

const DATABASE_RESULT_KEYS = Object.freeze([
  "logicalId",
  "configuredSourceGenerationHmacSha256",
  "physicalDatabaseIdentityHmacSha256",
  "inventorySchemaIdentitySha256",
  "migrationPreSchemaIdentitySha256",
  "expectedPostMigrationSchemaIdentitySha256",
  "schemaTransitionContractSha256",
  "migrationStartState",
  "actualSchemaIdentitySha256",
  "authoritativeLedgerResult",
  "commitOrigin",
  "terminalResult",
  "actualOpenedHandleBindingVerified"
]);

export function validateDatabaseTerminalVector({ contracts, results, deploymentState }) {
  const normalizedContracts = normalizeDatabaseContracts(contracts);
  if (!isHostFinalState(deploymentState)) {
    throw contractError("database_deployment_state_invalid");
  }
  assertExactKeys(results, [
    "logicalDatabaseCount",
    "uniquePhysicalDatabaseCount",
    "physicalDatabaseIdentitiesDistinct",
    "databaseTerminalVectorComplete",
    "entries"
  ]);
  if (results.logicalDatabaseCount !== 2 ||
      results.uniquePhysicalDatabaseCount !== 2 ||
      results.physicalDatabaseIdentitiesDistinct !== true ||
      !Array.isArray(results.entries)) {
    throw contractError("database_terminal_vector_identity_invalid");
  }
  const critical = isCriticalHostFinalState(deploymentState);
  const complete = results.databaseTerminalVectorComplete;
  if (typeof complete !== "boolean" || (!critical && !complete)) {
    throw contractError("database_terminal_vector_incomplete");
  }

  const contractIds = normalizedContracts.map(({ logicalId }) => logicalId);
  const contractIdSet = new Set(contractIds);
  const byLogicalId = new Map();
  for (const result of results.entries) {
    assertExactKeys(result, DATABASE_RESULT_KEYS);
    if (!contractIdSet.has(result.logicalId)) {
      throw contractError("database_terminal_vector_logical_id_invalid");
    }
    if (byLogicalId.has(result.logicalId)) {
      throw contractError("database_terminal_vector_cardinality_invalid");
    }
    byLogicalId.set(result.logicalId, result);
  }
  const inputIds = results.entries.map(({ logicalId }) => logicalId);
  const expectedSubsetIds = contractIds.filter((logicalId) => byLogicalId.has(logicalId));
  if (inputIds.length !== expectedSubsetIds.length ||
      inputIds.some((logicalId, index) => logicalId !== expectedSubsetIds[index])) {
    throw contractError("database_terminal_vector_order_invalid");
  }
  if ((complete && inputIds.length !== contractIds.length) ||
      (!complete && (!critical || inputIds.length >= contractIds.length))) {
    throw contractError("database_terminal_vector_cardinality_invalid");
  }

  const ordered = normalizedContracts.filter(({ logicalId }) => byLogicalId.has(logicalId)).map((contract) => {
    const result = byLogicalId.get(contract.logicalId);
    if (!DATABASE_TERMINAL_RESULTS.includes(result.terminalResult) ||
        !DATABASE_LEDGER_RESULTS.includes(result.authoritativeLedgerResult) ||
        !DATABASE_COMMIT_ORIGINS.includes(result.commitOrigin) ||
        result.actualOpenedHandleBindingVerified !== true) {
      throw contractError("database_terminal_result_invalid");
    }
    assertResultMatchesContract({ contract, result });
    return Object.freeze({ ...result });
  });
  if (ordered.length !== results.entries.length || (complete && ordered.length !== normalizedContracts.length)) {
    throw contractError("database_terminal_vector_cardinality_invalid");
  }

  const newlyCommitted = ordered.filter((result) =>
    result.terminalResult === "additive_committed_expected_post_this_transaction"
  ).length;
  if (deploymentState === "stopped_pre_switch" && newlyCommitted !== 0) {
    throw contractError("stopped_state_has_new_schema_commit");
  }
  if (deploymentState === "schema_committed_previous_release_validated" && newlyCommitted === 0) {
    throw contractError("schema_only_state_without_new_commit");
  }
  if ((deploymentState === HOST_FINAL_STATES[0] || deploymentState === HOST_FINAL_STATES[3]) &&
      ordered.some((result) => result.terminalResult === "additive_not_committed_pre")) {
    throw contractError("selected_runtime_has_uncommitted_schema");
  }
  return Object.freeze({
    logicalDatabaseCount: 2,
    uniquePhysicalDatabaseCount: 2,
    physicalDatabaseIdentitiesDistinct: true,
    databaseTerminalVectorComplete: complete,
    entries: Object.freeze(ordered)
  });
}
```

For a critical receipt, do not invent a fifth database terminal value. The shared receipt schema must carry `databaseTerminalVectorComplete: false` when a database could not be safely classified and must reject every success claim; safely classified entries still use only the four constants above.

- [ ] **Step 4: Run the contract tests to witness GREEN**

Run: `node --test server/tests/control-plane-database-contract.test.mjs`

Expected: pass; normalized inventory/release/plan clones have identical owner-generated bytes and `databaseContractsSha256`, drift/order cases reject or change the digest as specified, and neither private canonical contract is exported.

- [ ] **Step 5: Commit the database contract**

```bash
git add schemas/control-plane-database-contract-v1.schema.json server/services/deployment/database-contract.mjs server/tests/control-plane-database-contract.test.mjs
git commit -m "feat: define closed deployment database contract"
```

### Task 2: Separate Schema Bootstrap From Existing-Schema Startup

**Files:**
- Create: `server/services/deployment/subscription-runtime-schema.mjs`
- Create: `server/services/deployment/subscription-control-schema.mjs`
- Modify: `server/services/subscriptions/repository.mjs`
- Modify: `server/services/platform/subscription-control-db.mjs`
- Modify: `server/tests/subscription-repository.test.mjs`
- Modify: `server/tests/platform-subscription-control-db.test.mjs`
- Create: `server/tests/control-plane-sqlite-schema-identity.test.mjs`
- Create: `server/services/deployment/sqlite-schema-identity.mjs`

**Interfaces:**
- `initializeSubscriptionRuntimeSchema({ database })` and `initializeSubscriptionControlSchema({ database })` are synthetic/local bootstrap functions. They are not imported by any production entrypoint or production mutation CLI.
- `validateSubscriptionRuntimeSchema({ database })` and `validateSubscriptionControlSchema({ database })` return only `{ ok, schemaContract, reasonCodes }` with sorted closed reason codes.
- Store constructors require `schemaStartupMode: "initialize_schema" | "existing_schema_only"`. The production mode also requires an injected open database and never accepts `dbPath`.
- `readSqliteSchemaIdentity({ database, logicalId })` returns `{ logicalId, schemaIdentitySha256, applicationId, userVersion, schemaVersion, schemaObjectCount }` and no row/path/file value.
- `assertSqliteSchemaIdentity({ database, logicalId, expectedSchemaIdentitySha256 })` returns the same safe summary or throws a closed code.

- [ ] **Step 1: Add failing mode-separation and identity tests**

Add tests proving:

- runtime `existing_schema_only` refuses a missing file/table and creates nothing;
- control `existing_schema_only` refuses a missing base table and never runs `ensureTableColumns`;
- the legacy portal-column fixture remains unchanged and fails validation rather than receiving an implicit `ALTER TABLE`;
- an injected connection remains owned by the caller in both modes;
- `initialize_schema` still builds fresh synthetic/local fixtures explicitly;
- both modes require an explicit string enum; the old `initializeSchema` boolean rejects;
- schema identity changes on table, index, trigger, view, column, foreign-key, `application_id`, `user_version`, or `schema_version` drift, including SQL differences inside quoted literals, collations, `CHECK` expressions, and trigger bodies;
- inserting/updating/deleting rows does not change schema identity;
- the safe identity result contains no table rows, database path, SQL parameter, or fixture sentinel.

- [ ] **Step 2: Run focused tests to witness RED**

Run:

```bash
node --test server/tests/subscription-repository.test.mjs server/tests/platform-subscription-control-db.test.mjs server/tests/control-plane-sqlite-schema-identity.test.mjs
```

Expected: failure because both constructors still initialize implicitly and the schema modules do not exist.

- [ ] **Step 3: Extract explicit initialization and exact validation**

Move the current runtime DDL from `repository.mjs` and the current base-control DDL from `subscription-control-db.mjs` into their explicit schema modules. Keep the current table/index definitions byte-reviewed. Move the two `ensureTableColumns` calls into an explicit reviewed migration path; never call them from `existing_schema_only`.

```js
export function createSqliteSubscriptionStore({
  dbPath,
  database,
  schemaStartupMode
} = {}) {
  assertSchemaStartupMode(schemaStartupMode);
  if (schemaStartupMode === "existing_schema_only" && !database) {
    throw storeError("existing_schema_connection_required");
  }
  const ownsDatabase = !database;
  const db = database ?? new Database(dbPath);
  db.pragma("busy_timeout = 2000");
  if (schemaStartupMode === "initialize_schema") {
    initializeSubscriptionRuntimeSchema({ database: db });
  } else {
    const validation = validateSubscriptionRuntimeSchema({ database: db });
    if (!validation.ok) throw storeError("subscription_runtime_schema_not_ready");
  }
  return buildSubscriptionStore({ database: db, ownsDatabase });
}
```

Do not run `PRAGMA journal_mode = WAL` in `existing_schema_only`; validate the reviewed journal contract without changing it. `busy_timeout` and `foreign_keys=ON` may be connection-local, but their behavior must be tested and must not mutate schema.

- [ ] **Step 4: Implement canonical schema identity**

Use `serializeCanonicalJsonBytes` and `sha256Hex` with this domain and field order:

```js
const SCHEMA_IDENTITY_CONTRACT = Object.freeze({
  schemaId: "control-plane-sqlite-schema-identity-v1",
  maxBytes: 1024 * 1024,
  fieldOrder: [
    "schemaVersion",
    "logicalId",
    "applicationId",
    "userVersion",
    "schemaVersionValue",
    "objects"
  ],
  nested: Object.freeze({}),
  arrays: Object.freeze({ objects: "schema-object-v1" }),
  validate: validateSchemaIdentityPayload
});
```

Build `objects` from sorted `sqlite_schema` rows framed as exact `{ type, name, tableName, rootPage, sqlUtf8OrNull }` plus sorted `table_xinfo`, `foreign_key_list`, and `index_xinfo` metadata. Hash SQLite's returned `sqlite_schema.sql` as exact UTF-8 bytes with an explicit `null` marker; never perform general whitespace or case normalization because quoted literals, collations, expressions, and trigger bodies are semantic. Determinism comes only from typed field framing and row/metadata sorting. Never query a business table.

- [ ] **Step 5: Run focused tests to witness GREEN**

Run:

```bash
node --test server/tests/subscription-repository.test.mjs server/tests/platform-subscription-control-db.test.mjs server/tests/control-plane-sqlite-schema-identity.test.mjs
```

Expected: pass.

- [ ] **Step 6: Commit explicit schema startup**

```bash
git add server/services/deployment/subscription-runtime-schema.mjs server/services/deployment/subscription-control-schema.mjs server/services/deployment/sqlite-schema-identity.mjs server/services/subscriptions/repository.mjs server/services/platform/subscription-control-db.mjs server/tests/subscription-repository.test.mjs server/tests/platform-subscription-control-db.test.mjs server/tests/control-plane-sqlite-schema-identity.test.mjs
git commit -m "refactor: separate schema bootstrap from runtime startup"
```

### Task 3: Implement Capability Custody And Actual-Handle Sessions

**Files:**
- Create: `server/services/deployment/database-capability-custody.mjs`
- Create: `server/services/deployment/database-binding-session.mjs`
- Create: `server/tests/control-plane-database-capability-custody.test.mjs`
- Create: `server/tests/control-plane-database-binding-session.test.mjs`

**Interfaces:**
- `createDatabaseCapabilityCustody({ transactionId, contracts, native, journalStore, permitStore, peerInspector, lockFd, ownerToken })` exact-validates those dependency keys and rejects any injected `leaseFd`, `identityLeaseFd`, `guardianLeaseFd`, or other `*LeaseFd` key. Its closure is the sole owner of `identityLease`. It returns `start()`, `handoff(request)`, `downgradeForGuardian(request)`, `revoke(request)`, and `close()`. `start()` returns `{ mode: "exclusive", identityLeaseProofSha256, identityLeaseOpenFileDescriptionProofSha256 }`; `downgradeForGuardian` returns `{ mode: "shared", identityLeaseProofSha256, identityLeaseOpenFileDescriptionProofSha256, handoffProofSha256 }`; neither exposes a raw FD.
- `openExistingSchemaSession({ logicalId, capabilityClient, expectedBinding, expectedSchemaIdentitySha256, access })` accepts `access: "query_only" | "operational"` and returns `{ database, logicalId, actualHandleProofSha256, schemaIdentitySha256, close }`.
- Production callers never receive a database path, raw device/inode, HMAC key, or the identity-lease FD. The application guardian retains the lease FD; candidate code receives only the database capability and an opaque `databaseToken` accepted by `inspectSqliteMainHandle`.
- Each logical-database handoff carries exactly two `SCM_RIGHTS` descriptors in order: `databaseFd`, then the custody closure's current `identityLease.leaseFd`. The runtime and control handoffs are separate messages; both lease descriptors must produce the same actual global identity-lease open-file-description proof. A request, authorization result, or dependency object containing any lease-FD field rejects before `sendmsg`; no such field is ever consulted. A third descriptor, backup FD, path FD, reordered pair, duplicate database FD, missing lease FD, wrong/unlocked closure lease, changed open-file-description proof, or ancillary trailing bytes rejects and closes every received descriptor before SQLite open.
- The wrapper consumes Foundation methods only through the following exact calls:

```js
native.createDatabaseIdentityLease({ lockFd, mode, ownerToken });
native.sendDatabaseCapability({
  socketFd,
  databaseFd,
  identityLeaseFd,
  expectedPeer,
  invocationSha256
});
native.receiveDatabaseCapability({
  socketFd,
  expectedPeer,
  expectedInvocationSha256
});
native.inspectSqliteMainHandle({
  databaseToken,
  expectedDatabaseIdentityHmacSha256,
  hmacKeyFd
});
```

- [ ] **Step 1: Write failing custody authentication tests**

Use injected native/socket/systemd doubles. Assert rejection before any database open for wrong transaction, logical ID, operation, UID, unit, cgroup, invocation digest, journal phase, permit, guard, critical fence, shared-vs-exclusive mode, and stale release. Exact-key tests inject `leaseFd`, `identityLeaseFd`, and `guardianLeaseFd` separately into the request, authorized result, and constructor dependencies and require rejection before the native send spy. Assert each successful logical-database request sends exactly the ordered two-FD pair `authorized.databaseFd, identityLease.leaseFd`; runtime and control observe the same actual `identityLeaseOpenFileDescriptionProofSha256`. Native fixtures that report the closure lease unlocked, wrong mode, a different OFD proof, or a request-supplied lease FD fail before `sendmsg`. A one/three/reordered/duplicate/trailing-ancillary descriptor vector fails closed with no leak. Assert revoke/close is idempotent and bounded.

- [ ] **Step 2: Write failing actual-handle session tests**

Cover query-only write rejection, operational DML, schema mismatch, physical HMAC mismatch, wrong logical role, handle substitution after a valid path check, capability close before readiness, guardian death, and a second open that creates an ambiguous main handle. Require one safe actual-handle proof digest and no raw handle metadata.

- [ ] **Step 3: Run focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-database-capability-custody.test.mjs server/tests/control-plane-database-binding-session.test.mjs
```

Expected: failure because both modules do not exist.

- [ ] **Step 4: Implement the authenticated custody wrapper**

```js
export function createDatabaseCapabilityCustody(dependencies) {
  assertExactCustodyDependenciesWithoutLeaseFdInjection(dependencies);
  const active = new Map();
  let identityLease = null;
  return Object.freeze({
    async start() {
      if (identityLease) throw custodyError("database_custody_already_started");
      identityLease = dependencies.native.createDatabaseIdentityLease({
        lockFd: dependencies.lockFd,
        mode: "exclusive",
        ownerToken: dependencies.ownerToken
      });
      return Object.freeze({
        mode: "exclusive",
        identityLeaseProofSha256: identityLease.proofSha256,
        identityLeaseOpenFileDescriptionProofSha256:
          identityLease.openFileDescriptionProofSha256
      });
    },
    async handoff(request) {
      if (!identityLease) throw custodyError("database_custody_not_started");
      assertExactCustodyRequestWithoutLeaseFdInjection(request);
      const authorized = await authorizeCustodyRequest(dependencies, request);
      assertAuthorizedCustodyResultHasNoLeaseFd(authorized);
      const held = await identityLease.readbackHeld();
      assertCurrentGlobalIdentityLease({ identityLease, held });
      const proof = dependencies.native.sendDatabaseCapability({
        socketFd: authorized.socketFd,
        databaseFd: authorized.databaseFd,
        identityLeaseFd: identityLease.leaseFd,
        expectedPeer: authorized.expectedPeer,
        invocationSha256: authorized.invocationSha256
      });
      assertLeaseOFDHandoffProof({ held, proof });
      active.set(authorized.capabilityId, authorized.close);
      return Object.freeze({
        logicalId: authorized.logicalId,
        handoffProofSha256: proof.handoffProofSha256
      });
    },
    async downgradeForGuardian(request) {
      if (!identityLease) throw custodyError("database_custody_not_started");
      assertExactCustodyRequestWithoutLeaseFdInjection(request);
      const authorized = await authorizeGuardianDowngrade(dependencies, request);
      assertAuthorizedCustodyResultHasNoLeaseFd(authorized);
      const priorOFDProofSha256 = identityLease.openFileDescriptionProofSha256;
      const shared = dependencies.native.createDatabaseIdentityLease({
        lockFd: identityLease.leaseFd,
        mode: "shared",
        ownerToken: dependencies.ownerToken
      });
      identityLease = shared;
      const held = await identityLease.readbackHeld();
      assertCurrentGlobalIdentityLease({
        identityLease,
        held,
        expectedMode: "shared",
        expectedOpenFileDescriptionProofSha256: priorOFDProofSha256
      });
      const proof = dependencies.native.sendDatabaseCapability({
        socketFd: authorized.socketFd,
        databaseFd: authorized.databaseFd,
        identityLeaseFd: identityLease.leaseFd,
        expectedPeer: authorized.expectedPeer,
        invocationSha256: authorized.invocationSha256
      });
      assertLeaseOFDHandoffProof({ held, proof });
      return Object.freeze({
        mode: "shared",
        identityLeaseProofSha256: identityLease.proofSha256,
        identityLeaseOpenFileDescriptionProofSha256:
          identityLease.openFileDescriptionProofSha256,
        handoffProofSha256: proof.handoffProofSha256
      });
    },
    async revoke({ capabilityId }) {
      const close = active.get(capabilityId);
      if (!close) return Object.freeze({ revoked: true });
      active.delete(capabilityId);
      await close();
      return Object.freeze({ revoked: true });
    },
    async close() {
      for (const close of active.values()) await close();
      active.clear();
      if (identityLease) await identityLease.close();
      identityLease = null;
    }
  });
}
```

Authenticate `SO_PEERCRED`, systemd unit/cgroup/invocation, transaction permit, journal phase, logical database, and operation on every request. Re-read the journal and critical fence after lease acquisition. Do not cache an authorization across phase changes.

`identityLease.readbackHeld()` is a Foundation wrapper operation over the closure-owned descriptor; it returns only `{ locked: true, mode, openFileDescriptionProofSha256 }` and never a raw FD. `sendDatabaseCapability` returns the same safe OFD proof in its handoff proof so custody can compare actual native observations. For the downgrade call, the Foundation wrapper must consume the prior lease wrapper, apply `F_OFD_SETLK` shared mode to that same open-file description with no unlocked interval, invalidate the old wrapper, and return the replacement wrapper. The closure assigns that replacement before any send and still transmits only `identityLease.leaseFd`. If target-matching native tests cannot prove held-lock readback, same-OFD runtime/control transfer, wrong/unlocked rejection, and single-close ownership, Task 0 fails and this code is not implemented.

- [ ] **Step 5: Implement existing-schema sessions**

Receive capability through the Foundation wrapper, construct the exact Foundation-proven `databaseToken`/SQLite connection, call `inspectSqliteMainHandle` before the first SQLite statement, set `query_only` when requested, read schema identity, and call the logical schema validator. On every failure close the SQLite connection, received database FD, and local capability copy in reverse order. The application/auxiliary/operator guardian, not the store, owns the shared lease lifetime.

- [ ] **Step 6: Run focused and Foundation integration tests**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-database-foundation-contract.test.mjs server/tests/control-plane-database-capability-custody.test.mjs server/tests/control-plane-database-binding-session.test.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs integration/control-plane-deploy/foundation-linux.test.mjs
```

Expected: pass on target-matching Linux. A Windows-only mock pass is insufficient.

- [ ] **Step 7: Commit capability custody**

```bash
git add server/services/deployment/database-capability-custody.mjs server/services/deployment/database-binding-session.mjs server/tests/control-plane-database-capability-custody.test.mjs server/tests/control-plane-database-binding-session.test.mjs
git commit -m "feat: bind sqlite sessions to inherited capabilities"
```

### Task 4: Assemble One Existing-Schema Runtime From Two Shared Sessions

**Files:**
- Create: `server/services/deployment/writer-admission.mjs`
- Create: `server/tests/control-plane-writer-admission.test.mjs`
- Modify: `server/services/platform/coin-wallet-store.mjs`
- Modify: `server/services/platform/coin-commerce-store.mjs`
- Modify: `server/services/platform/payment-store.mjs`
- Modify: `server/state.mjs`
- Modify: `server/start.mjs`
- Modify: `server/services/platform/coin-commerce-production-runtime.mjs`
- Modify: `candidate-start.mjs`
- Modify: `server/index.mjs`
- Modify: `daemon.mjs`
- Modify: `server/services/daemon-launcher.mjs`
- Modify: `bin/gccgw.mjs`
- Modify: `bin/proxy-gateway.mjs`
- Modify: `server/tests/state.test.mjs`
- Modify: `server/tests/coin-commerce-production-entry.test.mjs`
- Modify: `server/tests/daemon-launcher.test.mjs`
- Modify: `server/tests/package-entry.test.mjs`

**Interfaces:**
- `openApplicationWriter({ permit, custodyClient, contracts, expectedRelease, criticalFenceReader })` returns exactly `{ subscriptionRuntime, subscriptionControl, readiness, close }`.
- `subscriptionRuntime` and `subscriptionControl` are binding sessions from Task 3. `subscriptionControl.database` is injected into the base control store and every enabled wallet/commerce/payment/authority component; no nested component opens its own connection.
- `createRuntimeState` accepts `{ schemaStartupMode, databaseSessions }`. When `schemaStartupMode` is `existing_schema_only`, both sessions are mandatory and every path option/environment fallback is rejected before store construction.
- Local-only state creation uses `initialize_schema` plus explicit temp paths; it cannot silently select production mode from environment.

- [ ] **Step 1: Write failing single-ownership assembly tests**

Add tests proving:

- production state opens exactly two SQLite connections, not one and not three;
- wallet, commerce, payment, authority, portal, usage, and base control operations receive the identical control connection;
- production state rejects missing sessions, same-session physical identity, a `dbPath`, `CONTROL_DB_PATH`, default `.proxy-gateway` paths, or an environment-selected startup mode;
- closing state closes owned sessions once after all borrowed stores stop; borrowed test sessions remain caller-owned;
- every enabled nested schema is validate-only and a missing nested schema fails before listener readiness;
- `candidate-start.mjs` sends readiness only after both actual-handle and schema proofs;
- `server/index.mjs`, `daemon.mjs`, `gccgw server start`, `npm start`, and `npm run server` reject production database environment before a mocked SQLite constructor is called.

- [ ] **Step 2: Run focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-writer-admission.test.mjs server/tests/state.test.mjs server/tests/coin-commerce-production-entry.test.mjs server/tests/daemon-launcher.test.mjs server/tests/package-entry.test.mjs
```

Expected: failure because state still derives fallback paths and nested stores still reopen the control database.

- [ ] **Step 3: Implement category-specific application admission**

```js
export async function openApplicationWriter({
  permit,
  custodyClient,
  contracts,
  expectedRelease,
  criticalFenceReader
}) {
  assertApplicationPermit({ permit, expectedRelease });
  await assertFenceAbsent(criticalFenceReader);
  const subscriptionRuntime = await openExistingSchemaSession({
    logicalId: "subscription-runtime",
    capabilityClient: custodyClient,
    expectedBinding: contracts[0],
    expectedSchemaIdentitySha256: contracts[0].expectedPostMigrationSchemaIdentitySha256,
    access: "operational"
  });
  try {
    const subscriptionControl = await openExistingSchemaSession({
      logicalId: "subscription-control",
      capabilityClient: custodyClient,
      expectedBinding: contracts[1],
      expectedSchemaIdentitySha256: contracts[1].expectedPostMigrationSchemaIdentitySha256,
      access: "operational"
    });
    return buildApplicationWriter({ subscriptionRuntime, subscriptionControl });
  } catch (error) {
    await subscriptionRuntime.close();
    throw error;
  }
}
```

The application guardian owns the business/shared identity leases and stops the child cgroup if it exits. Candidate code gets neither lease FD nor a path.

- [ ] **Step 4: Refactor state and nested stores to borrow the two sessions**

```js
const productionSessions = options.databaseSessions;
if (options.schemaStartupMode === "existing_schema_only") {
  assertExactProductionSessions(productionSessions);
  rejectProductionPathOptions(options, env);
}

const subscriptionStore = createSqliteSubscriptionStore({
  database: productionSessions.subscriptionRuntime.database,
  schemaStartupMode: "existing_schema_only"
});
const platformControlStore = createSqliteSubscriptionControlStore({
  database: productionSessions.subscriptionControl.database,
  schemaStartupMode: "existing_schema_only"
});
const coinsWalletStore = coinsWalletEnabled
  ? createSqliteCoinWalletStore({ database: productionSessions.subscriptionControl.database })
  : null;
```

Apply the same injected control database to commerce and payment. The component stores must continue not closing injected connections.

- [ ] **Step 5: Make `candidate-start.mjs` the sole production entrypoint**

Fix the mode in source and consume only inherited application-writer state:

```js
const writer = await receiveApplicationWriterFromGuardian();
const handle = await startProductionProxyGateway({
  runtimeOptions: {
    schemaStartupMode: "existing_schema_only",
    databaseSessions: writer
  }
});
await writer.readiness.acknowledge({
  runtimeHandleProofSha256: writer.subscriptionRuntime.actualHandleProofSha256,
  controlHandleProofSha256: writer.subscriptionControl.actualHandleProofSha256
});
installProcessHandlers(composeClose(handle, writer));
```

Keep `server/index.mjs` and daemon paths for local development only. Reject `SUBSCRIPTION_DB_PATH`, `SUBSCRIPTION_CONTROL_DB_PATH`, the production permit FD slots, or a production application permit before loading the production runtime.

- [ ] **Step 6: Run focused tests to witness GREEN**

Run the Step 2 command again.

Expected: pass.

- [ ] **Step 7: Commit the two-session runtime assembly**

```bash
git add server/services/deployment/writer-admission.mjs server/tests/control-plane-writer-admission.test.mjs server/services/platform/coin-wallet-store.mjs server/services/platform/coin-commerce-store.mjs server/services/platform/payment-store.mjs server/state.mjs server/start.mjs server/services/platform/coin-commerce-production-runtime.mjs candidate-start.mjs server/index.mjs daemon.mjs server/services/daemon-launcher.mjs bin/gccgw.mjs bin/proxy-gateway.mjs server/tests/state.test.mjs server/tests/coin-commerce-production-entry.test.mjs server/tests/daemon-launcher.test.mjs server/tests/package-entry.test.mjs
git commit -m "refactor: assemble production from bound database sessions"
```

### Task 5: Build The Independent Canonical Writer Registry

**Files:**
- Create: `schemas/control-plane-writer-registry-v1.schema.json`
- Create: `ops/control-plane-deploy/writer-registry.sources.json`
- Create: `server/services/deployment/writer-registry.mjs`
- Create: `scripts/control-plane-writer-registry.mjs`
- Create: `server/tests/control-plane-writer-registry.test.mjs`

**Interfaces:**
- Export the exact shared-codec descriptor `WRITER_REGISTRY_CONTRACT`, plus `discoverProductionWriters({ sourceRoot })`, `canonicalizeWriterRegistry(registry)`, and `verifyWriterRegistry({ discovered, declared })`. Consumers parse durable bytes only with `parseCanonicalJsonBytes(bytes, WRITER_REGISTRY_CONTRACT)`; they never reconstruct this descriptor.
- `scripts/control-plane-writer-registry.mjs --verify --source-root . --declaration ops/control-plane-deploy/writer-registry.sources.json` writes one bounded aggregate JSON line and exits `0` only on exact equality.
- Discovery roots are fixed in code: root/package commands, `bin`, the CLI router, `candidate-start.mjs`, direct executable scripts, systemd service/timer/drop-in files, and every import/call path that can open either database for DML or DDL. The declaration is never an input to discovery.
- Final canonical records contain exactly `category`, `logicalId`, sorted `aliases`, `entrypoint`, `entrypointSha256`, sorted `logicalDatabaseIds`, `startupMode`, `adapterContract`, `permitContract`, `leaseContract`, and `expectedHostBinding`.

The declaration has these nine logical records:

| Category | Logical ID | Databases | Reviewed host binding |
| --- | --- | --- | --- |
| application | `control-plane-application` | runtime, control | `proxy-gateway-candidate.service` |
| auxiliary | `traffic-usage-collector` | control | `gccgw-traffic-usage-collect.timer`, `gccgw-traffic-usage-collect.service` |
| auxiliary | `mihomo-connection-delta-usage-sidecar` | control | `gccgw-sgp-tuic-delta-usage-sidecar.timer`, `gccgw-sgp-tuic-delta-usage-sidecar.service` |
| auxiliary | `platform-lead-retention` | control | `gccgw-platform-lead-retention.timer`, `gccgw-platform-lead-retention.service` |
| gated_business_mutation | `platform-issue-subscription` | runtime, control | fixed operator adapter |
| gated_business_mutation | `platform-issue-portal-entry` | control | fixed operator adapter |
| gated_business_mutation | `platform-issue-portal-initial-account` | control | fixed operator adapter |
| migration | `subscription-runtime-migration` | runtime | fixed transient migration unit/cgroup |
| migration | `subscription-control-migration` | control | fixed transient migration unit/cgroup |

- [ ] **Step 1: Write failing synthetic discovery tests**

Build tiny source fixtures that cover a package alias, CLI alias, direct script, service/timer, dormant unit, imported constructor, dynamic import, duplicate owner, same entrypoint reused by two host bindings, and an unresolved computed database path. Assert canonical sorting and exact entrypoint digest. Assert a dynamic/unresolved/unknown surface fails rather than disappearing.

- [ ] **Step 2: Write a failing repository audit test**

Run discovery on the real source tree and assert it currently reports the known safe aggregate violations without including their path text in the returned summary:

- implicit runtime/control schema paths;
- direct operator script paths;
- four usage-proof recorders;
- package apply initialization;
- four direct schema-apply CLIs;
- direct restore/backup helpers;
- production-capable server/daemon aliases.

- [ ] **Step 3: Run focused tests to witness RED**

Run: `node --test server/tests/control-plane-writer-registry.test.mjs`

Expected: failure because registry discovery does not exist.

- [ ] **Step 4: Implement conservative source discovery**

Use a small tracked tokenizer for static `import`, literal dynamic `import`, package commands, router records, `ExecStart`, and known SQLite/store constructors. Do not use regex alone to claim the JavaScript call graph is complete. Reject computed entrypoints and computed database constructor imports. Treat reused source modules as separate launch surfaces when their host bindings differ; collapse only aliases that reach the same reviewed logical entrypoint.

```js
export function verifyWriterRegistry({ discovered, declared }) {
  const discoveredBytes = serializeCanonicalJsonBytes(discovered, WRITER_REGISTRY_CONTRACT);
  const declaredBytes = serializeCanonicalJsonBytes(declared, WRITER_REGISTRY_CONTRACT);
  if (!discoveredBytes.equals(declaredBytes)) {
    throw writerRegistryError("writer_registry_mismatch");
  }
  return Object.freeze({
    writerCount: discovered.writers.length,
    writerRegistrySha256: sha256Hex(discoveredBytes),
    verified: true
  });
}
```

- [ ] **Step 5: Run synthetic tests and retain the real-source RED audit**

Run: `node --test server/tests/control-plane-writer-registry.test.mjs`

Expected: synthetic discovery passes; the explicit real-source audit still fails on known bypasses. Task 6 closes them.

- [ ] **Step 6: Commit the verifier with a passing known-violation audit**

The default test suite must not be left red or skipped. In this task, the real-source audit passes only by asserting the exact closed set of known violation codes and their count. Task 6 replaces that assertion with exact nine-record equality and zero violations. Commit:

```bash
git add schemas/control-plane-writer-registry-v1.schema.json ops/control-plane-deploy/writer-registry.sources.json server/services/deployment/writer-registry.mjs scripts/control-plane-writer-registry.mjs server/tests/control-plane-writer-registry.test.mjs
git commit -m "feat: discover production database writers"
```

### Task 6: Gate Every Production Writer And Remove Bypasses

**Files:**
- Modify: `server/services/deployment/writer-admission.mjs`
- Create: `scripts/control-plane-application-guardian.mjs`
- Create: `scripts/control-plane-auxiliary-writer-adapter.mjs`
- Create: `scripts/control-plane-business-mutation-adapter.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-candidate.service.d/50-control-plane-application-guardian.conf`
- Create: `ops/control-plane-deploy/systemd/gccgw-traffic-usage-collect.service.d/50-control-plane-writer-adapter.conf`
- Create: `ops/control-plane-deploy/systemd/gccgw-sgp-tuic-delta-usage-sidecar.service.d/50-control-plane-writer-adapter.conf`
- Create: `ops/control-plane-deploy/systemd/gccgw-platform-lead-retention.service.d/50-control-plane-writer-adapter.conf`
- Modify: `scripts/traffic-usage-collect-once.mjs`
- Modify: `scripts/mihomo-connection-delta-usage-sidecar.mjs`
- Modify: `scripts/platform-lead-retention.mjs`
- Modify: `server/services/platform/lead-retention-operations.mjs`
- Modify: `scripts/platform-issue-subscription.mjs`
- Modify: `scripts/platform-issue-portal-entry.mjs`
- Modify: `scripts/platform-issue-portal-initial-account.mjs`
- Modify: `server/services/cli/router.mjs`
- Modify: `bin/gccgw.mjs`
- Modify: `package.json`
- Modify: `scripts/aws-staging-runtime-usage-proof.mjs`
- Modify: `scripts/aws-staging-hysteria2-usage-proof.mjs`
- Modify: `scripts/tuic-per-credential-usage-proof.mjs`
- Modify: `scripts/vless-xray-stats-usage-proof.mjs`
- Modify: `server/services/edge/material-handoff-readonly-control-store.mjs`
- Modify: `scripts/backup-subscriptions.sh`
- Modify: `scripts/restore-subscriptions.sh`
- Modify: `ops/systemd/gccgw-platform-lead-retention.service`
- Modify: `ops/systemd/gccgw-platform-lead-retention.timer`
- Modify: `server/tests/traffic-usage-collect-once.test.mjs`
- Modify: `server/tests/mihomo-connection-delta-usage-sidecar.test.mjs`
- Modify: `server/tests/platform-lead-retention-operations.test.mjs`
- Modify: `server/tests/platform-issue-subscription-cli.test.mjs`
- Modify: `server/tests/platform-issue-portal-entry-cli.test.mjs`
- Modify: `server/tests/platform-issue-portal-initial-account-cli.test.mjs`
- Modify: `server/tests/cli-router.test.mjs`
- Modify: `server/tests/gccgw-install-bootstrap-cli.test.mjs`
- Modify: `server/tests/aws-staging-runtime-usage-proof-script.test.mjs`
- Modify: `server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs`
- Modify: `server/tests/tuic-per-credential-usage-proof-script.test.mjs`
- Modify: `server/tests/vless-xray-stats-usage-proof-script.test.mjs`
- Modify: `server/tests/edge-material-handoff-preflight.test.mjs`
- Modify: `server/tests/environment-foundation.test.mjs`
- Modify: `server/tests/control-plane-writer-registry.test.mjs`
- Modify: `server/tests/control-plane-writer-admission.test.mjs`

**Interfaces:**
- `openAuxiliaryWriter({ logicalId, permit, custodyClient, checkpointStore })` opens only the declared control database and retains shared leases until its handles close.
- `openGatedBusinessMutation({ logicalId, guardReader, businessLease, custodyClient })` supports exactly the three declared logical IDs and returns only their declared sessions.
- `createWriterQuiescenceCoordinator({ systemdBrokerClient, registry, admission, checkpointStore, clock })` returns `quiesceAll({ transactionId, priorState })`, `restoreAll({ transactionId, selectedRelease, priorState })`, and `readback({ transactionId })`. It may request only `transaction_quiesce`, `transaction_restore_auxiliary`, and `readback_fixed_units`; no generic systemd adapter or unit name enters the module. `quiesceAll` snapshots exact timer/service state, closes permits, drains existing shared holders, asks the broker to stop only the registry-bound literal unit set, obtains the exclusive business lease, and returns a frozen proof retained through backup/schema/switch.
- Direct scripts export dependency-injected `main({ sessions, input, output })`; their direct-execution branch must obtain the fixed inherited adapter contract or fail before SQLite.
- `scripts/control-plane-auxiliary-writer-adapter.mjs` and `scripts/control-plane-business-mutation-adapter.mjs` accept only a fixed logical ID and inherited fixed FD slots. They reject all database-path flags/environment values.

- [ ] **Step 1: Add failing category boundary tests**

Assert:

- a pre-guard operator holding the shared business lease drains normally before backup;
- a racing/post-guard operator fails before receiving a database FD;
- direct, copied, or stale operator scripts fail before mocked SQLite construction;
- auxiliary attempts during a closed permit are durably delayed, then processed exactly once after restore;
- auxiliary state restoration preserves the exact prior enabled/active pair without triggering an extra run;
- application, auxiliary, operator, and migration adapters cannot impersonate each other's permit or lease mode;
- writer quiescence emits only the three frozen broker operations; a unit/action/property field or arbitrary service is rejected before a broker call;
- all four usage-proof scripts reject `*_RECORD=true` with a closed observation-only result and no database open;
- material handoff gets `query_only` and cannot mutate;
- package apply no longer creates either database;
- backup/restore shell scripts contain no default production path and refuse normal deployment use.

- [ ] **Step 2: Run the focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-writer-admission.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/mihomo-connection-delta-usage-sidecar.test.mjs server/tests/platform-lead-retention-operations.test.mjs server/tests/platform-issue-subscription-cli.test.mjs server/tests/platform-issue-portal-entry-cli.test.mjs server/tests/platform-issue-portal-initial-account-cli.test.mjs server/tests/aws-staging-runtime-usage-proof-script.test.mjs server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs server/tests/tuic-per-credential-usage-proof-script.test.mjs server/tests/vless-xray-stats-usage-proof-script.test.mjs server/tests/edge-material-handoff-preflight.test.mjs server/tests/gccgw-install-bootstrap-cli.test.mjs
```

Expected: fail on direct path opens and missing adapters.

- [ ] **Step 3: Implement the operator and auxiliary adapters**

```js
const OPERATOR_DATABASES = Object.freeze({
  "platform-issue-subscription": Object.freeze([
    "subscription-runtime",
    "subscription-control"
  ]),
  "platform-issue-portal-entry": Object.freeze(["subscription-control"]),
  "platform-issue-portal-initial-account": Object.freeze(["subscription-control"])
});

export async function openGatedBusinessMutation(input) {
  const logicalDatabaseIds = OPERATOR_DATABASES[input.logicalId];
  if (!logicalDatabaseIds) throw writerError("operator_entrypoint_not_reviewed");
  await assertGuardAbsent(input.guardReader);
  const businessLease = await input.businessLease.acquireShared(input.logicalId);
  try {
    await assertGuardAbsent(input.guardReader);
    return await openDeclaredSessions({ ...input, logicalDatabaseIds, businessLease });
  } catch (error) {
    await businessLease.close();
    throw error;
  }
}
```

The auxiliary adapter records a durable pending checkpoint before a closed-permit attempt exits. Restore claims that checkpoint once under the new permit, completes the work once, and atomically records completion.

- [ ] **Step 4: Install fixed source drop-ins**

Use exact fixed commands; no shell, environment-selected executable, or database path:

```ini
[Service]
ExecStart=
ExecStart=/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-auxiliary-writer-adapter.mjs traffic-usage-collector
```

The application drop-in similarly replaces `ExecStart` with `/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-application-guardian.mjs`. Task 14A's sole Host-owned G1a installer contract binds the final Integration staged-manifest/content receipt to Bootstrap's exact host layout and performs only root-owned no-replace/fsync/readback under a later fresh external Gate; this source PR implements/tests that API but does not invoke it or install these files.

- [ ] **Step 5: Remove direct path mutation surfaces**

Refactor `platform-issue-subscription` to use the exact runtime/control sessions instead of calling `createRuntimeState`. Keep dry-run parsing safe and database-free. Remove mutation modes from usage-proof scripts. Replace package-apply database creation with the closed error `database_bootstrap_gate_required`. Keep schema validation and synthetic fixture injection available to tests.

Add `control-plane:writer-registry:verify` to `package.json` as the exact fixed command `node scripts/control-plane-writer-registry.mjs --verify --source-root . --declaration ops/control-plane-deploy/writer-registry.sources.json`; it accepts no package-script passthrough selector in CI.

- [ ] **Step 6: Make the real-source registry equality test pass**

Run:

```bash
node scripts/control-plane-writer-registry.mjs --verify --source-root . --declaration ops/control-plane-deploy/writer-registry.sources.json
node --test server/tests/control-plane-writer-registry.test.mjs server/tests/control-plane-writer-admission.test.mjs server/tests/cli-router.test.mjs server/tests/environment-foundation.test.mjs
```

Expected: writer count `9`, exact registry equality, no uncovered/direct path mutation surface, all tests pass.

- [ ] **Step 7: Run all modified writer tests**

Run the Step 2 command again.

Expected: pass.

- [ ] **Step 8: Commit the closed writer set**

```bash
git add server/services/deployment/writer-admission.mjs scripts/control-plane-application-guardian.mjs scripts/control-plane-auxiliary-writer-adapter.mjs scripts/control-plane-business-mutation-adapter.mjs ops/control-plane-deploy/systemd/proxy-gateway-candidate.service.d/50-control-plane-application-guardian.conf ops/control-plane-deploy/systemd/gccgw-traffic-usage-collect.service.d/50-control-plane-writer-adapter.conf ops/control-plane-deploy/systemd/gccgw-sgp-tuic-delta-usage-sidecar.service.d/50-control-plane-writer-adapter.conf ops/control-plane-deploy/systemd/gccgw-platform-lead-retention.service.d/50-control-plane-writer-adapter.conf scripts/traffic-usage-collect-once.mjs scripts/mihomo-connection-delta-usage-sidecar.mjs scripts/platform-lead-retention.mjs server/services/platform/lead-retention-operations.mjs scripts/platform-issue-subscription.mjs scripts/platform-issue-portal-entry.mjs scripts/platform-issue-portal-initial-account.mjs server/services/cli/router.mjs bin/gccgw.mjs package.json scripts/aws-staging-runtime-usage-proof.mjs scripts/aws-staging-hysteria2-usage-proof.mjs scripts/tuic-per-credential-usage-proof.mjs scripts/vless-xray-stats-usage-proof.mjs server/services/edge/material-handoff-readonly-control-store.mjs scripts/backup-subscriptions.sh scripts/restore-subscriptions.sh ops/systemd/gccgw-platform-lead-retention.service ops/systemd/gccgw-platform-lead-retention.timer server/tests/traffic-usage-collect-once.test.mjs server/tests/mihomo-connection-delta-usage-sidecar.test.mjs server/tests/platform-lead-retention-operations.test.mjs server/tests/platform-issue-subscription-cli.test.mjs server/tests/platform-issue-portal-entry-cli.test.mjs server/tests/platform-issue-portal-initial-account-cli.test.mjs server/tests/cli-router.test.mjs server/tests/gccgw-install-bootstrap-cli.test.mjs server/tests/aws-staging-runtime-usage-proof-script.test.mjs server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs server/tests/tuic-per-credential-usage-proof-script.test.mjs server/tests/vless-xray-stats-usage-proof-script.test.mjs server/tests/edge-material-handoff-preflight.test.mjs server/tests/environment-foundation.test.mjs server/tests/control-plane-writer-registry.test.mjs server/tests/control-plane-writer-admission.test.mjs
git commit -m "feat: gate the complete production writer set"
```

### Task 7: Publish A Coherent Two-Database Backup Pair

**Files:**
- Create: `server/services/deployment/sqlite-backup-pair.mjs`
- Create: `server/tests/control-plane-sqlite-backup-pair.test.mjs`

**Interfaces:**
- Export `createCoherentBackupPair({ gateId, transactionId, contracts, sessions, backupRoot, durable, clock, faultInjector })`.
- `sessions` contains one identity-proven write-exclusion session and one fixed `openBackupSource()` capability per logical database. The caller already holds the recovery guard, exclusive business-mutation lease, and exclusive global database-identity lease.
- `backupRoot` is a Foundation-proven directory capability. It creates safe Gate-owned names internally; no caller or plan supplies a host path.
- Return exactly:

```js
{
  schemaVersion: "1",
  logicalDatabaseCount: 2,
  uniquePhysicalDatabaseCount: 2,
  backups: [
    {
      logicalId: "subscription-runtime",
      backupIdentitySha256,
      schemaIdentitySha256,
      sizeBytes,
      quickCheck: true
    },
    {
      logicalId: "subscription-control",
      backupIdentitySha256,
      schemaIdentitySha256,
      sizeBytes,
      quickCheck: true
    }
  ],
  pairManifestSha256,
  rollbackReady: true
}
```

- [ ] **Step 1: Write failing lock/coherence tests**

Use two distinct synthetic WAL databases and injected session/FS primitives. Prove:

- both `BEGIN IMMEDIATE` write-exclusion locks are acquired in logical order before either backup starts;
- a same-file runtime/control fixture rejects before the first backup;
- an application, auxiliary, operator, unknown writer, active migration unit, nonempty migration cgroup, open migration handle, or missing exclusive lease rejects before the first backup;
- a write scheduled during backup is durably delayed and later processed once, not surfaced only as `SQLITE_BUSY` and not discarded;
- both backups observe one business checkpoint while both locks remain held;
- migration admission remains false until both backup readback handles and both lock connections close and their locks are proven released.

- [ ] **Step 2: Write failing durability fault tests**

Inject failure immediately before and after each boundary: SQLite backup completion, backup handle close, temporary-file fsync, temporary read-only reopen, temporary identity readback, temporary `quick_check`, temporary readback close, atomic rename, parent-directory fsync, final read-only reopen, final identity readback, final `quick_check`, pair-manifest temporary write, manifest fsync, manifest rename, manifest parent-fsync, final manifest readback, lock-connection close, and lock-release readback. No failure before final readback may return `rollbackReady: true` or allow schema work.

- [ ] **Step 3: Run focused tests to witness RED**

Run: `node --test --test-concurrency=1 server/tests/control-plane-sqlite-backup-pair.test.mjs`

Expected: failure because the backup module does not exist.

- [ ] **Step 4: Implement the fixed two-lock protocol**

```js
export async function createCoherentBackupPair(input) {
  const contracts = normalizeDatabaseContracts(input.contracts);
  assertDistinctBoundSessions({ contracts, sessions: input.sessions });
  const locks = [];
  const published = [];
  try {
    for (const contract of contracts) {
      const session = input.sessions[contract.logicalId];
      session.lockDatabase.exec("BEGIN IMMEDIATE");
      locks.push(session);
    }
    await assertBackupWindowClosed(input);
    for (const contract of contracts) {
      published.push(await backupOneDatabase({ ...input, contract }));
    }
    const manifest = buildBackupPairManifest({
      gateId: input.gateId,
      transactionId: input.transactionId,
      contracts,
      backups: published,
      createdAt: input.clock().toISOString()
    });
    const manifestBytes = serializeCanonicalJsonBytes(manifest, BACKUP_PAIR_CONTRACT);
    const pairManifestSha256 = await input.durable.publishPairManifest(manifestBytes);
    await closeBackupReadbackHandles(published);
    await releaseAndProveSqliteLocks(locks);
    return buildSafeBackupResult({ published, pairManifestSha256 });
  } catch (error) {
    await closeWithoutClaim({ published, locks });
    throw backupError("database_backup_pair_not_durable", error);
  }
}
```

`backupOneDatabase` must close/fsync the SQLite-produced temporary file, independently reopen that temporary file read-only, verify its identity/schema plus `quick_check=ok`, and close/read back that handle before rename. It then atomically renames and parent-fsyncs, independently reopens the final name, repeats identity/schema/`quick_check`, and closes the final readback handle. The pair manifest cannot be published until both databases have passed both reopen barriers.

`backupOneDatabase` calls the fixed `openBackupSource()` to create a separate identity-proven SQLite source connection while both lock connections retain `BEGIN IMMEDIATE`; it runs the SQLite online backup API from that source and closes it before final publication. It then uses Foundation durability primitives, independently opens the final backup read-only, and requires `PRAGMA quick_check` to return exactly one row `ok`.

- [ ] **Step 5: Run focused tests to witness GREEN**

Run: `node --test --test-concurrency=1 server/tests/control-plane-sqlite-backup-pair.test.mjs`

Expected: pass.

- [ ] **Step 6: Commit coherent backup**

```bash
git add server/services/deployment/sqlite-backup-pair.mjs server/tests/control-plane-sqlite-backup-pair.test.mjs
git commit -m "feat: publish coherent sqlite backup pairs"
```

### Task 8: Add Atomic Migration Ledger And Capability-Only Entrypoints

**Files:**
- Create: `schemas/control-plane-host-transaction-journal-v1.schema.json`
- Create: `server/services/deployment/host-transaction-journal.mjs`
- Create: `server/tests/control-plane-host-transaction-journal.test.mjs`
- Create: `server/services/deployment/sqlite-migration-ledger.mjs`
- Create: `server/services/deployment/sqlite-migration-runner.mjs`
- Create: `server/services/deployment/migration-entrypoints.mjs`
- Create: `scripts/control-plane-migrate-subscription-runtime.mjs`
- Create: `scripts/control-plane-migrate-subscription-control.mjs`
- Create: `server/tests/control-plane-sqlite-migration-runner.test.mjs`
- Modify: `server/services/platform/coin-wallet-migrations.mjs`
- Modify: `server/services/platform/coin-wallet-reference-index-migrations.mjs`
- Modify: `server/services/platform/coin-commerce-migrations.mjs`
- Modify: `server/services/platform/payment-store-migrations.mjs`
- Modify: `server/services/platform/account-resource-authority-migrations.mjs`
- Modify: `server/services/platform/account-resource-authority-commerce-migrations.mjs`
- Modify: `scripts/platform-coin-wallet-schema.mjs`
- Modify: `scripts/platform-coin-wallet-reference-index-schema.mjs`
- Modify: `scripts/platform-coin-commerce-schema.mjs`
- Modify: `scripts/platform-account-resource-authority-schema.mjs`
- Modify: `server/tests/platform-coin-wallet-migrations.test.mjs`
- Modify: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`
- Modify: `server/tests/platform-coin-commerce-migrations.test.mjs`
- Modify: `server/tests/platform-payment-store-migrations.test.mjs`
- Modify: `server/tests/platform-account-resource-authority-migrations.test.mjs`
- Modify: `server/tests/platform-account-resource-authority-commerce-migrations.test.mjs`
- Modify: `server/tests/platform-coin-wallet-schema-cli.test.mjs`
- Modify: `server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs`
- Modify: `server/tests/platform-coin-commerce-schema-cli.test.mjs`
- Modify: `server/tests/platform-account-resource-authority-schema-cli.test.mjs`

**Interfaces:**
- `createHostTransactionJournalStore({ durableStoreContracts, openTransactionFsOps, native, readJournalRecordBytes, listProtectedNonterminalTransactionIds, acceptedPlanContract, contract, clock })` wraps, but never expands, the Foundation store. For each already validated transaction ID it calls exactly `createDurableStore({ contracts: durableStoreContracts, fsOps: openTransactionFsOps({ transactionId }), native })`; the returned four-method store is the sole Host writer for `journal.nonterminal` and `recovery.guard`. `accepted-plan.json` is Bootstrap-owned, already published/fsynced/read back, and read-only to Host. `openTransactionFsOps` returns only the pre-opened validated root descriptor contract and accepts no relative path. `readJournalRecordBytes({ transactionId, logicalId, maxBytes })` is the module-owned fixed-root, no-follow, bounded read adapter for the accepted plan, nonterminal journal, and guard only; its bytes are hashed and immediately confirmed by `readbackExact`. A source test rejects `publishImmutable`, `casCanonical`, `unlinkVerified`, or replacement against `accepted-plan`. Receipt publication creates its separate durable terminal objects without deleting Host state; only after the six-digest tuple, Bootstrap closeout index, and Bootstrap `bindTerminal` are all read back may Host verified-unlink/read back absence of `journal.nonterminal`. No example or implementation may call a legacy durable-store factory, pass positional constructor arguments, or implement CAS as a JavaScript read followed by publish.
- `listProtectedNonterminalTransactionIds()` is injected from Bootstrap's replay-ledger owner at the later consumer checkpoint. It returns only owner-validated unique active nonterminal IDs, including `critical_finalize_pending` but excluding every terminal state. Host may read the corresponding journal state but owns no replay quota, age window, terminal-retention decision, `bindTerminal`, or `compactEligible` implementation. Bootstrap independently protects terminal critical entries from compaction without returning them to Host recovery. Task 8 uses a strict fixture for this interface and Task 11B replaces it with the exact Bootstrap export; no Host-local directory enumeration or literal replay limit is permitted.
- The journal store exports `readAccepted(transactionId) -> { acceptedPlan, acceptedPlanSha256 }`, `initializeNonterminal({ transactionId, acceptedPlanSha256, acceptedArtifactRecordSha256, authorizationReservationSha256, artifactCapabilityIdentitySha256, invocationSha256 })`, `beginStage({ context, stage })`, `completeStage({ context, stage })`, `recordStageFailure({ context, stage, safeCode })`, `readNonterminal(transactionId)`, `listNonterminal()`, `ensureRecoveryGuard(transactionId)`, `removeRecoveryGuard(transactionId)`, `removeNonterminalAfterTerminalBind({ transactionId, expectedJournalSha256, terminalRecordSha256, closeoutIndexSha256 })`, `recordCommitPending({ transactionId, logicalId, migrationId, migrationChecksumSha256 })`, and `recordCommitObservedHint({ transactionId, logicalId, migrationId, migrationChecksumSha256 })`. The terminal-removal method first verifies the Bootstrap terminal binding and exact current journal predecessor, then calls only `unlinkVerified` plus absent readback; a crash before it leaves the journal protected for idempotent recovery. `readAccepted` parses and freezes only Bootstrap's immutable approved plan/Gate object plus its readback digest. It rejects any accepted-record, reservation, capability-identity, invocation, or other post-acceptance field in that object and performs no accepted-start projection read. Task 11's Host-owned reader separately verifies those later facts. Every Host mutation serializes canonical bytes, uses only `publishImmutable`/`casCanonical`/`unlinkVerified`, then uses `readbackExact`; raw errors and paths never enter state.
- `ensureMigrationLedgerInTransaction({ database })` requires `database.inTransaction === true`.
- `readMigrationLedgerRow({ database, logicalId, migrationId })` returns an exact safe contract row or null; it never serializes arbitrary rows.
- `insertMigrationLedgerRow({ database, contract, sourceCommit, appliedAt })` requires an active transaction and exact reviewed values.
- `classifyMigrationOutcome({ contract, actualSchemaIdentitySha256, ledgerRow })` returns `{ terminalResult, commitOrigin }`.
- `applyAdditiveMigration({ database, contract, sourceCommit, migrateInTransaction, clock })` is injected-connection-only and commits DDL plus the deployment-ledger row in one outer SQLite transaction.
- `runMigrationEntrypoint({ logicalId, inheritedCapability, plan, journal, native })` accepts only one of the two fixed logical IDs and no database path.

The journal adapter reads only bounded aggregate-safe state, verifies the just-read digest through Foundation, and performs every transition by exact CAS:

```js
import { createDurableStore } from "./durable-store.mjs";

export function createHostTransactionJournalStore(dependencies) {
  function durableFor(transactionId) {
    assertTransactionId(transactionId);
    return createDurableStore({
      contracts: dependencies.durableStoreContracts,
      fsOps: dependencies.openTransactionFsOps({ transactionId }),
      native: dependencies.native,
    });
  }

  async function readRecord(transactionId, logicalId, recordContract) {
    assertTransactionId(transactionId);
    const bytes = await dependencies.readJournalRecordBytes({
      transactionId,
      logicalId,
      maxBytes: recordContract.maxBytes
    });
    const sha256 = sha256Hex(bytes);
    const durable = durableFor(transactionId);
    await durable.readbackExact(logicalId, sha256);
    return Object.freeze({
      value: parseCanonicalJsonBytes(bytes, recordContract),
      bytes,
      sha256,
      durable
    });
  }

  async function casJournal(transactionId, transition) {
    const current = await readRecord(transactionId, "transaction-journal", dependencies.contract);
    const next = transitionJournal(current.value, transition, dependencies.clock());
    const nextBytes = serializeCanonicalJsonBytes(next, dependencies.contract);
    const written = await current.durable.casCanonical(
      "transaction-journal",
      current.sha256,
      nextBytes
    );
    await current.durable.readbackExact("transaction-journal", written.sha256);
    return Object.freeze({ ...next, journalSha256: written.sha256 });
  }

  async function readNonterminal(transactionId) {
    return (await readRecord(
      transactionId,
      "transaction-journal",
      dependencies.contract
    )).value;
  }

  return Object.freeze({
    async readAccepted(transactionId) {
      const accepted = await readRecord(
        transactionId,
        "accepted-plan",
        dependencies.acceptedPlanContract
      );
      return Object.freeze({
        acceptedPlan: deepFreezeAcceptedPlan(accepted.value),
        acceptedPlanSha256: accepted.sha256
      });
    },
    async initializeNonterminal({
      transactionId,
      acceptedPlanSha256,
      acceptedArtifactRecordSha256,
      authorizationReservationSha256,
      artifactCapabilityIdentitySha256,
      invocationSha256
    }) {
      const durable = durableFor(transactionId);
      const initial = buildInitialJournal({
        transactionId,
        acceptedPlanSha256,
        acceptedArtifactRecordSha256,
        authorizationReservationSha256,
        artifactCapabilityIdentitySha256,
        invocationSha256,
        startedAt: dependencies.clock().toISOString()
      });
      const bytes = serializeCanonicalJsonBytes(initial, dependencies.contract);
      const written = await durable.publishImmutable("transaction-journal", bytes);
      await durable.readbackExact("transaction-journal", written.sha256);
      await publishAndReadbackRecoveryGuard({ durable, transactionId });
      return Object.freeze({ ...initial, journalSha256: written.sha256 });
    },
    async beginStage({ context, stage }) {
      const journal = await casJournal(context.transactionId, { operation: "begin_stage", stage });
      return freezeContext({ ...context, ...journal });
    },
    async completeStage({ context, stage }) {
      const journal = await casJournal(context.transactionId, { operation: "complete_stage", stage });
      return freezeContext({ ...context, ...journal });
    },
    recordStageFailure({ context, stage, safeCode }) {
      return casJournal(context.transactionId, { operation: "stage_failure", stage, safeCode });
    },
    recordCommitPending(input) {
      return casJournal(input.transactionId, { operation: "commit_pending", ...input });
    },
    recordCommitObservedHint(input) {
      return casJournal(input.transactionId, { operation: "commit_observed", ...input });
    },
    readNonterminal,
    async listNonterminal() {
      const ids = await dependencies.listProtectedNonterminalTransactionIds();
      assertOwnerValidatedProtectedTransactionIds(ids);
      return Promise.all(ids.map(readNonterminal));
    }
  });
}
```

The implementation also defines the listed guard/remove methods with the fixed constant guard bytes and the same publish/readback or unlink/readback barrier. `transitionJournal` is a closed table over the eight host stages plus migration hints; it rejects unknown, repeated, skipped, backward, or post-terminal operations before CAS. A raw bounded read is never logged or returned by a CLI. Tests prove `readAccepted` returns exactly the immutable accepted-plan value and digest, reject each later accepted-start field inside that value, and source-scan this module to ensure it neither reads the accepted-start projection, publishes `accepted-plan`, nor defines replay-retention/quota/compaction constants. Every owner-returned nonterminal ID, including `critical_finalize_pending`, remains protected across Host restart and terminal-publication faults.

The deployment ledger SQL is exact:

```sql
create table control_plane_schema_migration_ledger (
  logical_database_id text not null,
  migration_id text not null,
  migration_checksum_sha256 text not null,
  source_commit text not null,
  pre_schema_identity_sha256 text not null,
  expected_post_schema_identity_sha256 text not null,
  schema_transition_contract_sha256 text not null,
  schema_contract text not null,
  applied_at text not null,
  primary key (logical_database_id, migration_id),
  check (logical_database_id in ('subscription-runtime', 'subscription-control')),
  check (length(migration_checksum_sha256) = 64),
  check (length(source_commit) = 40),
  check (length(pre_schema_identity_sha256) = 64),
  check (length(expected_post_schema_identity_sha256) = 64),
  check (length(schema_transition_contract_sha256) = 64)
) without rowid
```

- [ ] **Step 1: Write failing ledger atomicity tests**

Cover:

- the ledger cannot be created outside an active approved transaction;
- DDL failure leaves neither schema object nor deployment-ledger row;
- ledger insertion failure rolls back DDL and any legacy `platform_schema_migrations` row;
- successful DDL and ledger appear together after reopen;
- exact replay is a no-op; a changed checksum/source/pre/post/transition/schema contract is critical;
- the first deployment ledger may coexist with the unchanged exact three-column `platform_schema_migrations` table;
- `schemaMode: none` never creates the deployment ledger;
- a direct/stale/wrong-phase/wrong-UID/wrong-unit/shared-lease invocation fails before database open;
- a migration process that exits while a child, cgroup, inherited capability, SQLite handle, or exclusive lease remains cannot advance.
- each logical database has a durable/read-back `commit_pending` containing only logical ID, reviewed migration ID, and checksum before its SQLite transaction starts;
- a crash immediately before SQLite COMMIT classifies from absent-ledger/pre-schema, while a crash immediately after COMMIT but before `recordCommitObservedHint` classifies from exact-ledger/post-schema as committed;
- failure to persist `commit_observed` does not undo or hide an authoritative SQLite commit, and a present hint never overrides ledger/schema.

- [ ] **Step 2: Write failing recovery classification tests**

Test all exact vectors:

- `none_unchanged` plus equal pre/post/actual -> `unchanged_none`, `commitOrigin: "none"`;
- `pending_pre` plus absent ledger/pre shape -> `additive_not_committed_pre`, `commitOrigin: "none"`;
- `pending_pre` plus exact ledger/post shape -> `additive_committed_expected_post_this_transaction`, `commitOrigin: "this_transaction"` even if external `commit_observed` is missing;
- `already_committed_post` plus exact ledger/post shape -> `additive_already_committed_expected_post`, `commitOrigin: "preexisting"`;
- every mixed/partial/unreadable combination -> closed critical classification, never unchanged.

- [ ] **Step 3: Run focused tests to witness RED**

Run: `node --test --test-concurrency=1 server/tests/control-plane-host-transaction-journal.test.mjs server/tests/control-plane-sqlite-migration-runner.test.mjs`

Expected: failure because migration ledger/runner modules do not exist.

- [ ] **Step 4: Implement one outer SQLite transaction**

```js
export function applyAdditiveMigration({
  database,
  contract,
  sourceCommit,
  migrateInTransaction,
  clock
}) {
  assertPendingAdditiveContract(contract);
  const apply = database.transaction(() => {
    assertSqliteSchemaIdentity({
      database,
      logicalId: contract.logicalId,
      expectedSchemaIdentitySha256: contract.migrationPreSchemaIdentitySha256
    });
    ensureMigrationLedgerInTransaction({ database });
    migrateInTransaction({ database, contract });
    assertSqliteSchemaIdentity({
      database,
      logicalId: contract.logicalId,
      expectedSchemaIdentitySha256: contract.expectedPostMigrationSchemaIdentitySha256
    });
    insertMigrationLedgerRow({
      database,
      contract,
      sourceCommit,
      appliedAt: clock().toISOString()
    });
  });
  apply.immediate();
  return classifyCommittedMigration({ database, contract });
}
```

The coordinator must call and read back `recordCommitPending` immediately before each database's fixed migration unit starts. After `applyAdditiveMigration` returns and every capability/handle/unit/cgroup close barrier passes, it may call `recordCommitObservedHint`; that CAS is diagnostic only. Recovery ignores either hint until it has fenced all mutation, opened an actual-handle-proven query-only session, and classified the authoritative ledger/schema pair.

The expected post identity includes the deployment-ledger table when the migration creates it. The migration transition digest binds the exact pre shape, post shape, ledger schema, migration bytes, logical role, and entrypoint digest.

- [ ] **Step 5: Refactor existing migration modules**

Add a low-level `migrate...InTransaction({ database, contract })` to each existing migration module that mutates schema. It must require an already active outer transaction and must not accept `dbPath`. Synthetic compatibility wrappers may open their own temp database and transaction in tests; production entrypoints call only the in-transaction function.

Retain validate/dry-run in the four existing schema CLIs. Remove direct `apply` and `rollback` production modes. The fixed new migration scripts accept zero user arguments, require the inherited capability/admission contract, and emit one aggregate result.

- [ ] **Step 6: Add fixed-order two-database execution tests**

Prove runtime always precedes control. Inject runtime commit followed by control failure and assert the vector is:

```js
[
  {
    logicalId: "subscription-runtime",
    terminalResult: "additive_committed_expected_post_this_transaction",
    commitOrigin: "this_transaction"
  },
  {
    logicalId: "subscription-control",
    terminalResult: "additive_not_committed_pre",
    commitOrigin: "none"
  }
]
```

Assert the host outcome is eligible only for `schema_committed_previous_release_validated` after previous-code validation; it is never `stopped_pre_switch`. A later fresh plan must classify runtime `already_committed_post`, skip it, and may run only control.

- [ ] **Step 7: Run all migration tests to witness GREEN**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-transaction-journal.test.mjs server/tests/control-plane-sqlite-migration-runner.test.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs server/tests/platform-coin-commerce-migrations.test.mjs server/tests/platform-payment-store-migrations.test.mjs server/tests/platform-account-resource-authority-migrations.test.mjs server/tests/platform-account-resource-authority-commerce-migrations.test.mjs server/tests/platform-coin-wallet-schema-cli.test.mjs server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs server/tests/platform-coin-commerce-schema-cli.test.mjs server/tests/platform-account-resource-authority-schema-cli.test.mjs
```

Expected: pass.

- [ ] **Step 8: Re-run writer registry verification**

Run: `node scripts/control-plane-writer-registry.mjs --verify --source-root . --declaration ops/control-plane-deploy/writer-registry.sources.json`

Expected: the only production DDL surfaces are the two fixed migration entrypoints, writer count remains `9`.

- [ ] **Step 9: Commit atomic migration evidence**

```bash
git add schemas/control-plane-host-transaction-journal-v1.schema.json server/services/deployment/host-transaction-journal.mjs server/tests/control-plane-host-transaction-journal.test.mjs server/services/deployment/sqlite-migration-ledger.mjs server/services/deployment/sqlite-migration-runner.mjs server/services/deployment/migration-entrypoints.mjs scripts/control-plane-migrate-subscription-runtime.mjs scripts/control-plane-migrate-subscription-control.mjs server/tests/control-plane-sqlite-migration-runner.test.mjs server/services/platform/coin-wallet-migrations.mjs server/services/platform/coin-wallet-reference-index-migrations.mjs server/services/platform/coin-commerce-migrations.mjs server/services/platform/payment-store-migrations.mjs server/services/platform/account-resource-authority-migrations.mjs server/services/platform/account-resource-authority-commerce-migrations.mjs scripts/platform-coin-wallet-schema.mjs scripts/platform-coin-wallet-reference-index-schema.mjs scripts/platform-coin-commerce-schema.mjs scripts/platform-account-resource-authority-schema.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs server/tests/platform-coin-commerce-migrations.test.mjs server/tests/platform-payment-store-migrations.test.mjs server/tests/platform-account-resource-authority-migrations.test.mjs server/tests/platform-account-resource-authority-commerce-migrations.test.mjs server/tests/platform-coin-wallet-schema-cli.test.mjs server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs server/tests/platform-coin-commerce-schema-cli.test.mjs server/tests/platform-account-resource-authority-schema-cli.test.mjs
git commit -m "feat: commit migrations with authoritative sqlite evidence"
```

### Task 9: Prove Exact Candidate/Rollback Persisted-Data Compatibility

**Files:**
- Create: `schemas/control-plane-persisted-data-contract-v1.schema.json`
- Create: `ops/control-plane-deploy/persisted-data-registry.json`
- Create: `server/services/deployment/persisted-data-compatibility.mjs`
- Create: `server/services/deployment/persisted-data-driver.mjs`
- Create: `scripts/control-plane-persisted-data-pair-check.mjs`
- Create: `scripts/control-plane-persisted-data-driver.mjs`
- Create: `server/tests/control-plane-persisted-data-compatibility.test.mjs`

**Interfaces:**
- Export `canonicalizePersistedDataRegistry(value)` and `verifyPersistedDataBackwardPair({ candidateRelease, rollbackRelease, registry, createSyntheticPair, spawnDriver })`.
- Export `runPersistedDataDriver({ role, operation, sessions, scenarioIds, clock })` from the driver module.
- Pair roles and order are fixed: `candidate_write`, `rollback_read_process_writeback`, then `candidate_read_process_writeback`.
- `scripts/control-plane-persisted-data-pair-check.mjs` accepts zero argv and receives the exact pair request through fixed sealed FD `3`; it spawns each exact release driver with only synthetic database FDs and fixed sealed request/response slots.
- The aggregate result contains exactly `{ schemaVersion, scenarioCount, candidateWriteCount, rollbackReadCount, rollbackWritebackCount, candidateReadbackCount, dataCompatibilityPairSha256, accepted }`.

The closed registry covers every mutable business table exactly once:

| Scenario ID | Logical database | Tables |
| --- | --- | --- |
| `subscription-tenant-lifecycle-v1` | runtime | `subscription_tenants` |
| `subscription-audit-event-v1` | runtime | `subscription_audit_events` |
| `subscription-temp-link-lifecycle-v1` | runtime | `subscription_temp_links` |
| `subscription-artifact-lifecycle-v1` | runtime | `subscription_artifacts` |
| `platform-lead-lifecycle-v1` | control | `platform_leads` |
| `platform-account-entitlement-issuance-v1` | control | `platform_accounts`, `platform_entitlements`, `platform_issuance_requests`, `platform_issued_subscription_links` |
| `platform-traffic-quota-accounting-v1` | control | `platform_quota_counters`, `platform_usage_samples`, `platform_usage_rollups`, `platform_usage_counter_cursors` |
| `platform-device-binding-lifecycle-v1` | control | `platform_device_bindings` |
| `platform-subscription-revocation-audit-v1` | control | `platform_revocation_events`, `platform_audit_events` |
| `platform-edge-runtime-control-v1` | control | `platform_edge_registered_nodes`, `platform_edge_apply_receipts`, `platform_edge_desired_state_notifications`, `platform_edge_agent_leases` |
| `platform-portal-access-delivery-v1` | control | `platform_portal_access_requests`, `platform_portal_edge_credentials`, `platform_portal_entries` |
| `platform-portal-authentication-v1` | control | `platform_portal_totp_credentials`, `platform_portal_password_credentials`, `platform_portal_passkey_credentials`, `platform_portal_second_factor_challenges`, `platform_portal_sessions` |
| `coin-wallet-lot-hold-ledger-v1` | control | `platform_coin_wallets`, `platform_coin_lots`, `platform_coin_holds`, `platform_coin_hold_allocations`, `platform_coin_operation_receipts`, `platform_coin_credit_origins`, `platform_coin_ledger_entries` |
| `coin-commerce-order-fulfillment-v1` | control | `platform_coin_commerce_offer_versions`, `platform_coin_commerce_quotes`, `platform_coin_commerce_orders`, `platform_coin_commerce_operation_receipts`, `platform_coin_commerce_order_events`, `platform_coin_commerce_fulfillment_commands`, `platform_coin_commerce_fulfillment_receipts` |
| `payment-order-receipt-v1` | control | `platform_payment_orders`, `platform_payment_receipts` |
| `account-resource-authority-v1` | control | `platform_account_resource_authorities` |
| `account-resource-commerce-binding-v1` | control | `platform_commerce_authority_quote_bindings` |

`platform_schema_migrations` and `control_plane_schema_migration_ledger` belong to schema evidence and are excluded from business persisted-data scenarios. The static verifier must recognize that explicit exclusion and reject any other omitted mutable table.

- [ ] **Step 1: Write failing registry completeness tests**

Extract table names from the reviewed schema definitions and mutation call sites. Assert each mutable business table maps to one scenario, no scenario overlaps, and every scenario declares persisted enum/JSON/lifecycle/cross-record invariants plus candidate/rollback operations. Add a synthetic unregistered `UPDATE` and assert closed failure.

- [ ] **Step 2: Write failing exact-pair behavior tests**

For each of the 17 scenarios, use synthetic values only and assert:

1. candidate writes every supported record and transition;
2. rollback reads, lists, validates, and processes it without destructive reinterpretation;
3. rollback performs its allowed writeback;
4. candidate reads and processes that writeback;
5. row counts and lifecycle outcomes match the scenario contract;
6. no driver output contains the synthetic secret/customer sentinel;
7. changing candidate source/artifact/tree/runtime/dependency identity changes the pair digest;
8. changing rollback identity changes the pair digest;
9. changing a scenario, enum, JSON shape, transition, or driver digest changes the pair digest;
10. a release without the contract is ineligible rather than assumed compatible.

- [ ] **Step 3: Run focused tests to witness RED**

Run: `node --test --test-concurrency=1 server/tests/control-plane-persisted-data-compatibility.test.mjs`

Expected: failure because registry and driver modules do not exist.

- [ ] **Step 4: Implement canonical registry and pair digest**

```js
export async function verifyPersistedDataBackwardPair(input) {
  const registry = canonicalizePersistedDataRegistry(input.registry);
  const fixtures = await input.createSyntheticPair(registry);
  const candidateWrite = await input.spawnDriver({
    release: input.candidateRelease,
    role: "candidate_write",
    fixtures,
    registry
  });
  const rollbackRound = await input.spawnDriver({
    release: input.rollbackRelease,
    role: "rollback_read_process_writeback",
    fixtures,
    registry
  });
  const candidateReadback = await input.spawnDriver({
    release: input.candidateRelease,
    role: "candidate_read_process_writeback",
    fixtures,
    registry
  });
  assertCompleteCompatibility({ registry, candidateWrite, rollbackRound, candidateReadback });
  const pairBytes = serializeCanonicalJsonBytes(
    buildPairContract(input, registry),
    PERSISTED_DATA_PAIR_CONTRACT
  );
  return Object.freeze({
    schemaVersion: "1",
    scenarioCount: registry.scenarios.length,
    candidateWriteCount: candidateWrite.completedCount,
    rollbackReadCount: rollbackRound.readCount,
    rollbackWritebackCount: rollbackRound.writebackCount,
    candidateReadbackCount: candidateReadback.readbackCount,
    dataCompatibilityPairSha256: sha256Hex(pairBytes),
    accepted: true
  });
}
```

The pair contract binds full candidate/rollback source commit, artifact digest, release-tree manifest digest, runtime contract, dependency contract, registry digest, and both driver digests. Results expose only counts/digest/accepted.

- [ ] **Step 5: Implement the fixed driver protocol**

The child driver accepts no path or environment-selected operation. Parse one canonical request from sealed FD `3`, use the already-open synthetic runtime/control FD slots, execute only the role/scenario list in the request, serialize one bounded canonical response to fixed FD `6`, then close every session. Reject production database bindings and any non-synthetic fixture marker.

- [ ] **Step 6: Run focused and mutation-coverage tests to witness GREEN**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-persisted-data-compatibility.test.mjs server/tests/subscription-repository.test.mjs server/tests/platform-subscription-control-db.test.mjs server/tests/platform-coin-wallet-store.test.mjs server/tests/platform-coin-commerce-store.test.mjs server/tests/platform-payment-store.test.mjs
```

Expected: pass.

- [ ] **Step 7: Commit persisted-data compatibility**

```bash
git add schemas/control-plane-persisted-data-contract-v1.schema.json ops/control-plane-deploy/persisted-data-registry.json server/services/deployment/persisted-data-compatibility.mjs server/services/deployment/persisted-data-driver.mjs scripts/control-plane-persisted-data-pair-check.mjs scripts/control-plane-persisted-data-driver.mjs server/tests/control-plane-persisted-data-compatibility.test.mjs
git commit -m "feat: prove persisted data rollback compatibility"
```

### Task 10: Compose The Database Sub-Transaction

**Files:**
- Create: `server/services/deployment/database-transaction.mjs`
- Create: `server/tests/control-plane-database-transaction.test.mjs`

**Interfaces:**
- Export `createDatabaseTransactionCoordinator({ native, journalStore, custody, writerQuiescence, systemdBrokerClient, backupPair, migrationRunner, clock, faultInjector })`.
- The coordinator returns `preflight(plan)`, `quiesceAndBackup(context)`, `applySchema(context)`, `classifyForRecovery(context)`, `handoffApplication(context)`, and `close(context)`.
- Each method consumes/returns a frozen aggregate context; only the durable host journal owns stage persistence.
- `applySchema` cannot be called until `backupPair.rollbackReady === true`, all backup/readback/lock handles are closed, both SQLite write locks are released, and the custody helper still holds the exclusive global identity lease.
- `handoffApplication` downgrades/transfers only the exact two-database steady-state runtime capabilities and shared identity leases after the complete terminal database vector is validated; `close` then closes/readbacks every transaction-only database FD, identity-lease FD, socket, backup/migration handle, and exclusive lease without closing the selected runtime's legitimate handles. Its aggregate proof feeds the five-state terminal barrier in Task 11. A partial first/second database commit, unreadable ledger, failed previous-release validation, or rollback mismatch can never cross this normal-completion barrier.

- [ ] **Step 1: Write failing sequencing tests**

Assert exact call order and fail closed on:

- missing/extra/shared/release-local database;
- config generation, symlink target, file identity, logical-role, observed schema, ledger, or start-state drift at initial inventory or final pre-write recheck;
- the exact rollback release's legacy initializer has any pending base-table, index, or add-column work against either observed schema; the first automated deployment stays ineligible until a separate schema/bootstrap Gate resolves it;
- service/aux/operator/migration writer not quiesced;
- backup pair incomplete or not durable;
- migration starting while any backup/readback/lock handle remains;
- guard, custody unit/socket, exclusive business lease, or exclusive identity lease lost between database migrations and pointer switch;
- a nominal-success migration with a lingering child/cgroup/capability/handle;
- application handoff before a complete committed-post vector;
- close that leaks a connection, capability, socket, or lease.
- close that confuses selected-runtime permits/actual handles with transaction-transient custody, either by leaking a transaction descriptor or by terminating the validated steady-state runtime handle pair;
- any migration launch other than `transaction_start_runtime_migration`, `transaction_start_control_migration`, or `readback_fixed_units`, including a caller-supplied unit/action/property.

- [ ] **Step 2: Write failing recovery vector tests**

Test these state transitions:

- no new commit + pointer unchanged + previous release validates -> `stopped_pre_switch`;
- first DB newly committed + second stays pre + pointer unchanged + previous release validates -> `schema_committed_previous_release_validated`;
- both additive contracts committed-post + candidate accepted -> handoff eligible;
- post-switch rejection -> code rollback path, live databases unchanged;
- unreadable/partial ledger or failed previous-release validation -> `critical_finalize_pending` and no terminal receipt.

- [ ] **Step 3: Run focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-database-transaction.test.mjs server/tests/control-plane-sqlite-backup-pair.test.mjs server/tests/control-plane-sqlite-migration-runner.test.mjs
```

Expected: failure because the coordinator does not exist.

- [ ] **Step 4: Implement the explicit stateful coordinator**

```js
export function createDatabaseTransactionCoordinator(dependencies) {
  return Object.freeze({
    async quiesceAndBackup(context) {
      assertDatabasePhase(context, "quiesce_and_backup");
      const fenced = await dependencies.writerQuiescence.quiesceAll({
        transactionId: context.transactionId,
        priorState: context.priorWriterState
      });
      const custodyProof = await dependencies.custody.start();
      assertExclusiveCustodyLease(custodyProof);
      const sessions = await openWriteExclusionSessions({
        context,
        custodyClient: dependencies.custody
      });
      const backupPair = await dependencies.backupPair({
        ...context,
        sessions,
        custodyProof
      });
      assertBackupHandlesClosed(backupPair);
      return freezeContext({ ...context, fenced, custodyProof, backupPair });
    },
    async applySchema(context) {
      assertSchemaAdmissionReady(context);
      const results = [];
      for (const contract of normalizeDatabaseContracts(context.plan.databaseContracts)) {
        if (contract.schemaMode === "additive_compatible" && contract.migrationStartState === "pending_pre") {
          await dependencies.journalStore.recordCommitPending({
            transactionId: context.transactionId,
            logicalId: contract.logicalId,
            migrationId: contract.migrationEntryPointContract,
            migrationChecksumSha256: contract.migrationEntryPointSha256
          });
        }
        const { observation, migrationOutcome } = await runOneSchemaContract({
          dependencies,
          context,
          contract
        });
        results.push(observation);
        if (migrationOutcome.commitOrigin === "this_transaction") {
          await dependencies.journalStore.recordCommitObservedHint({
            transactionId: context.transactionId,
            logicalId: contract.logicalId,
            migrationId: contract.migrationEntryPointContract,
            migrationChecksumSha256: contract.migrationEntryPointSha256
          });
        }
      }
      return freezeContext({
        ...context,
        databaseRecoveryResults: classifyDatabaseRecoveryVector({
          contracts: context.plan.databaseContracts,
          ledgerObservations: results
        })
      });
    }
  });
}
```

At each boundary, re-read durable journal/guard/permit state rather than trusting the previous in-memory object. Recovery opens new query-only identity-proven sessions only after all migration units/cgroups/handles are inactive.

- [ ] **Step 5: Run focused tests to witness GREEN**

Run the Step 3 command again.

Expected: pass.

- [ ] **Step 6: Commit database transaction orchestration**

```bash
git add server/services/deployment/database-transaction.mjs server/tests/control-plane-database-transaction.test.mjs
git commit -m "feat: orchestrate the closed database transaction"
```

### Task 11: Implement The Eight-Stage Host Transaction

**Closed broker and host-inventory provider checkpoint files:**
- Create: `server/services/deployment/fixed-systemd-broker.mjs`
- Create: `server/services/deployment/control-plane-host-inventory-readers.mjs`
- Create: `scripts/control-plane-fixed-systemd-broker.mjs`
- Create: `server/tests/control-plane-fixed-systemd-broker.test.mjs`
- Create: `server/tests/control-plane-host-inventory-readers.test.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.socket`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.service`

**Consumer-dependent remainder files:**
- Create: `server/services/deployment/control-plane-host-transaction.mjs`
- Create: `server/services/deployment/fixed-health-validator.mjs`
- Create: `scripts/control-plane-host-transaction.mjs`
- Create: `scripts/control-plane-fixed-health-validator.mjs`
- Create: `server/tests/control-plane-host-transaction-database.test.mjs`
- Create: `server/tests/control-plane-fixed-health-validator.test.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-transaction@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-validation@.service`

**Interfaces:**
- Export `HOST_TRANSACTION_STAGES` as exactly `live_compare`, `read_only_inventory`, `candidate_preparation`, `quiesce_and_backup`, `additive_schema`, `atomic_switch`, `acceptance`, then `finalize`.
- Export `createHostTransactionRunner({ journalStore, acceptedStartEvidenceReader, native, acceptedArtifactConsumer, systemdBrokerClient, releaseStore, inventoryValidator, candidateValidator, databaseTransaction, healthValidator, terminalPublisher, replayLedger, clock, faultInjector })`.
- The runner exposes `runAcceptedTransaction({ transactionId })`; it first reads only `{ acceptedPlan, acceptedPlanSha256 }` from the Task 8 journal adapter, then separately calls the Host-owned accepted-start evidence reader with that expected digest. It never accepts a plan/evidence object from argv/environment and never reads a later accepted-record/reservation/capability/invocation field from `acceptedPlan`.
- `acceptedArtifactConsumer` is exactly the instance returned by Bootstrap Task 9's `createAcceptedArtifactConsumer({ ingressStore, native, peerVerifier })`. The runner may call only `receive({ transactionId, acceptedArtifactRecordSha256 })`; no path, archive bytes, descriptor slot, socket selector, or fallback reader enters this constructor.
- `terminalPublisher` is exactly the instance returned by Receipt Task 2's `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector })`, where `terminalCloseoutStore` is Receipt's `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`, `bootstrapCloseoutStore` is Bootstrap Task 10's `createControllerCloseoutStore(...)`, `bootstrapMaintenance` is the one process-wide Bootstrap maintenance coordinator, and `admissionReplayLedger` is the same owner ledger injected into the runner for terminal binding. Receipt's store alone fixes terminal logical IDs, independently reads and validates their digests, and the publisher first performs the one owner maintenance preflight, then the four transaction-bound writes/readbacks followed by one `registerPendingLease(...)` call; production supplies a no-op `faultInjector`. Normal, phase-chained recovery, and external critical finalizers may call only `publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })`; after its six-digest tuple and closeout index are durable/read back, Host may call only the same `admissionReplayLedger.bindTerminal({ transactionId, finalState, terminalRecordSha256, closeoutIndexSha256 })`. Host cannot inject a reader, call transaction-bound reader/writer methods directly during finalization, supply a logical ID/path/digest, invoke `compactEligible`, or define a second receipt/replay/store protocol.
- Export `FIXED_SYSTEMD_OPERATIONS` as exactly `transaction_start_accepted`, `transaction_quiesce`, `transaction_start_runtime_migration`, `transaction_start_control_migration`, `transaction_start_candidate`, `transaction_start_validation`, `transaction_restore_auxiliary`, `recovery_start_fence`, `recovery_start_application`, `recovery_start_validation`, `recovery_restore_auxiliary`, `recovery_record_critical`, `recovery_finalize_critical`, then `readback_fixed_units`. The provider also exports `ACCEPTED_START_EVIDENCE_FIELDS`, `ACCEPTED_START_EVIDENCE_CONTRACT`, `canonicalizeAcceptedStartEvidence(value) -> { value, bytes, sha256, invocationSha256 }`, `createAcceptedStartEvidenceReader({ durableReader }) -> { readAndVerify({ transactionId, expectedAcceptedPlanSha256 }) }`, and `assertAcceptedStartEvidenceCapability(value)`; the exact field order is the four-field order frozen above and no other plan owns a competing serializer. `readAndVerify` returns one frozen private-`WeakSet`-branded capability with exactly `transactionId`, the four evidence fields, and `invocationSha256`; the assertion rejects every reconstructed/spread/lookalike object and returns the same reference. Export `createFixedSystemdBroker({ acceptedStartEvidenceReader, journalStore, systemdManager, peerInspector })`, `createFixedSystemdBrokerClient({ socketCapability, peerVerifier })`, and `createAcceptedTransactionBrokerClient({ fixedSystemdBrokerClient })`. The last export returns exactly `{ startAcceptedTransaction({ transactionId, invocationSha256 }) }` and hard-wires the operation to `transaction_start_accepted`; Bootstrap handoff/custody never receives the underlying client or socket. Every broker request is exactly `{ operation, transactionId, invocationSha256 }`; the broker maps the operation to a literal reviewed unit/action and accepts no unit, executable, path, UID, cgroup, property, mode, or environment field.
- `acceptedStartEvidenceReader.readAndVerify({ transactionId, expectedAcceptedPlanSha256 })` no-follow reads and durably reads back the fixed Host-owned `accepted-start-evidence` projection, byte-compares its `acceptedPlanSha256` with the Task 8 immutable accepted-plan digest, canonicalizes all four fields, recomputes the domain-separated invocation digest, and returns the branded capability above. Bootstrap imports only `canonicalizeAcceptedStartEvidence`, publishes/fsyncs/reads back that projection only after independently validating its four owner source objects/proofs, and sends the helper-returned invocation digest. For `transaction_start_accepted`, the broker reads Task 8's accepted-plan digest, asks its reader for the branded capability, passes that exact reference through `assertAcceptedStartEvidenceCapability` without copying/destructuring/rebuilding it, constant-time compares its invocation digest with the request, and only then derives/starts the literal transaction unit. Wrong, stale, reordered, duplicate, cross-transaction, changed, unbranded, or accepted-plan-mismatched evidence rejects before a manager call.
- The closed broker provider imports only Host Tasks 0-10/Foundation contracts and systemd adapters. Its tests, implementation, real socket/service denial proof, GREEN run, and commit do not import or instantiate Bootstrap Task 9 accepted-artifact consumers, Bootstrap Task 10 closeout stores, Receipt Task 4 adapters, terminal publishers, or Host transaction/recovery consumers.
- `createControlPlaneHostInventoryReaders({ releaseEvidenceReader, currentReleaseEvidenceReader, hostEvidenceReader, bootstrapEvidenceReader, runtimeEvidenceReader, writerEvidenceReader, databaseAggregateIdentityReader, armedCompatibilityActivationReader, clock })` returns one module-private-`WeakSet`-branded frozen object with exact keys `normalInventoryReader`, then `compatibilityInventoryReader`; `assertControlPlaneHostInventoryReaders(value)` accepts only that original reference and returns it unchanged. Each member is independently frozen and has exactly one method, `read(request)`. The first six source ports expose only no-argument `read()`, `databaseAggregateIdentityReader` exposes only no-argument `readExactPair()`, and `armedCompatibilityActivationReader` exposes only no-argument `readArmed()`. No dependency exposes a path, root, logical ID, unit, environment, database handle, mutable store, CAS, execute, ACK, artifact, or resource lookup.
- `normalInventoryReader.read(request)` accepts only the Bootstrap-decoded exact request `{ type: "inventory_normal", requestId, inventoryGateId, sourceCommit }`. `compatibilityInventoryReader.read(request)` accepts only `{ type: "inventory_compatibility", requestId, compatibilityInventoryGateId, sourceCommit, activationId, hostBundleContentReceiptSha256 }`. Each performs a fresh fixed read of release, current pointer identity, installed host contract, bootstrap state, runtime identity, writer-registry identity, and the one ordered exact-two aggregate database identity; it emits only the matching encoder input that echoes the request binding plus `observedAt`, lowercase `inventoryEvidenceSha256`, and canonical `inventoryEvidenceBytesBase64` whose decoded aggregate-safe bytes are at most 768 bytes. The compatibility path constant-time byte-compares `activationId` and `hostBundleContentReceiptSha256` against the already armed fixed activation evidence; neither value is passed to any reader and neither can select a generation, directory, release, bundle, credential, or database. Normal structurally rejects `activationId`; compatibility structurally omits final bootstrap/authorization/rotation fields. Both paths are read-only and fail before the first source read on an unknown/extra/cross-kind request.
- Bootstrap Task 9's composition receives only the branded pair, calls `assertControlPlaneHostInventoryReaders` on that exact reference, and then injects its two members into `createHostProtocolRouter`. The router cannot accept two independent reader dependencies, reconstruct the pair, or fall back to a generic inventory callback. This provider checkpoint occurs before that consumer integration.
- `createFixedHealthValidator({ systemdBrokerClient, aggregateResultStore, clock })` returns only `validateTransaction({ transactionId, selectedRelease })` and `validateRecovery({ transactionId, selectedRelease })`. The first is hard-wired to `transaction_start_validation`, the second to `recovery_start_validation`; neither accepts an operation, URL, command, host, path, or body. Both return the fixed local/public status counts, restart delta, and elapsed/deadline labels from one canonical bounded aggregate result.
- `scripts/control-plane-host-transaction.mjs` accepts zero argv. It imports `createAcceptedArtifactConsumer` from `server/services/deployment/control-plane-accepted-artifact-handoff.mjs`; `createAcceptedStartEvidenceReader` from `server/services/deployment/fixed-systemd-broker.mjs`; `createTransactionBoundTerminalCloseoutStore` from `server/services/deployment/control-plane-terminal-closeout-store.mjs`; `createHostTerminalPublisher` from `server/services/deployment/control-plane-host-terminal-publisher.mjs`; and `createControllerCloseoutStore`, `createAdmissionReplayLedger`, and `createBootstrapMaintenanceCoordinator` only from their Bootstrap owner modules. After deriving its Gate-bound transaction identity from systemd, it constructs the fixed accepted-start reader, one transaction-bound terminal store with exactly `{ transactionId, durableStore: createDurableStore({ contracts, fsOps, native }) }`, one owner admission replay ledger, and one owner bootstrap maintenance coordinator. It passes the Receipt store, Bootstrap store, coordinator, and that same ledger to the unique publisher; injects that reader/publisher plus the identical owner replay-ledger reference into the runner; and calls `runAcceptedTransaction` once. The transaction composition constructs or injects no Receipt terminal-object reader and never performs the later critical post-publication status proof; the runner never receives `bootstrapCloseoutStore` or `bootstrapMaintenance` separately and never asks for `compactEligible`. Missing adjacent-owner exports are a same-branch checkpoint stop.

#### Task 11A: Commit The Closed Broker And Host Inventory Provider Checkpoint Before Their Consumers

- [ ] **Provider Step 1: Write closed operation, peer, mapping, and denial tests**

In `server/tests/control-plane-fixed-systemd-broker.test.mjs`, table-drive every `FIXED_SYSTEMD_OPERATIONS` member against its sole literal manager action, including `transaction_start_accepted -> proxy-gateway-control-transaction@%i.service`. Assert the request has exactly `operation`, `transactionId`, and `invocationSha256`; validate peer UID/unit/cgroup and durable phase where applicable; reject unknown/extra fields and arbitrary unit/executable/path/property selectors before the manager spy. Freeze the accepted-start field order/canonical bytes, reject uppercase hashes, unknown/missing/reordered fields, and prove Bootstrap-facing canonicalization and reader re-canonicalization are byte-equal. The reader must reject a mismatched expected `acceptedPlanSha256`, independently recompute the domain-separated digest from the exact four-field durable fixture, and privately brand its return. The broker must pass that same object reference to `assertAcceptedStartEvidenceCapability`; reconstructed/spread/lookalike evidence, every one-field mutation, stale reader result, cross-transaction replay, wrong digest, or readback failure rejects before the manager spy. Instantiate `createAcceptedTransactionBrokerClient` only over a recording fixed client and prove it exposes only `startAcceptedTransaction({ transactionId, invocationSha256 })`. A source-boundary test rejects imports from accepted-artifact, controller-closeout, terminal-closeout, host-terminal-publisher, host-transaction, or host-recovery modules.

In `server/tests/control-plane-host-inventory-readers.test.mjs`, assert the factory and assertion exports are the only module exports; the returned exact pair and each exact one-method reader are frozen and privately branded; a clone, spread, swapped member, independently created pair, or reader lookalike rejects. Table-drive normal and compatibility exact request shapes, unknown/extra/cross-kind fields, every fixed-source failure, noncanonical source evidence, unsafe string, and evidence-size 768/769. On success, prove exactly one no-argument read of release, current, host, bootstrap, runtime, writer, and exact-two aggregate database identity; no dependency receives a request value. Compatibility additionally reads the one fixed armed activation evidence and constant-time byte-compares both `activationId` and `hostBundleContentReceiptSha256`; wrong/stale/changed evidence fails without a second lookup and no request value ever becomes a source key. Assert both returned encoder inputs echo only their exact request binding plus `observedAt`, `inventoryEvidenceSha256`, and `inventoryEvidenceBytesBase64`; compatibility contains no final bootstrap/authorization/rotation field, normal contains no activation field, and every test records zero mutation/CAS/execute/ACK/artifact/database-open/path/unit/selector calls. A Bootstrap-consumer conformance fixture must accept only the original pair through `assertControlPlaneHostInventoryReaders`.

- [ ] **Provider Step 2: Run the provider-only test to witness RED**

```bash
node --test server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs
```

Expected: fail because both provider modules do not exist; no Bootstrap 9-10, Receipt 4, or Host transaction consumer is imported to obtain this RED.

- [ ] **Provider Step 3: Implement only the fixed broker provider and hardened socket/service**

Implement the provider-owned accepted-start evidence contract/canonicalizer/reader/private brand, three broker/client exports, domain-separated recomputation, and exact operation table above. The provider derives every unit from validated closed state, uses `SO_PEERCRED` plus fixed manager readback, emits aggregate safe errors, and exposes no manager or broker socket to its narrow accepted-transaction client. Also implement the separately branded host-inventory reader pair over only the eight fixed read ports above. It builds bounded aggregate evidence from fresh no-argument reads, enforces the exact-two database identity result, fixes normal versus compatibility shaping internally, and treats compatibility activation values as comparison evidence only. It has no generic reader registry, resource resolver, path, selector, mutation, transport, or router implementation. Install only the broker socket/service in this checkpoint; transaction, validation, recovery, accepted-artifact, inventory router, and terminal units remain absent. The broker provider never invokes the `systemd-run` executable and has no generic start-transient API: even the two migration operations map to literal reviewed manager calls and fixed properties compiled into the broker.

- [ ] **Provider Step 4: Run provider-only GREEN and real denial validation**

```bash
node --test server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs
systemd-analyze verify ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.service
```

Expected: pass on target-matching Linux; the real broker process denies arbitrary unit start, caller access to `/run/systemd/private` and D-Bus, forbidden manager/property overrides, non-`AF_UNIX` sockets, and undeclared filesystem writes without requiring a Bootstrap or Receipt module. The inventory provider proves deterministic fixed-source evidence and zero mutation/selection authority without opening a host or external transport.

- [ ] **Provider Step 5: Commit the independently GREEN provider checkpoint**

```bash
git add server/services/deployment/fixed-systemd-broker.mjs server/services/deployment/control-plane-host-inventory-readers.mjs scripts/control-plane-fixed-systemd-broker.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.service
git commit -m "feat: add closed host control providers"
```

Stop this Task 11 branch here and execute Bootstrap Tasks 9-10, Receipt Task 4, and Artifact Tasks 9-10 in DAG order. Bootstrap Task 9 must consume the just-committed branded inventory pair; do not begin the following consumer-dependent remainder until all those checkpoints are present.

#### Task 11B: Resume The Consumer-Dependent Host Transaction

- [ ] **Step 1: Write failing artifact-handoff, stage-order, and pre-mutation tests**

Assert:

- Bootstrap's accepted-plan object must already exist, be canonical, fsynced, and independently read back; it contains only exact deployment-plan/Production Gate content and yields `acceptedPlanSha256`. Any accepted-record, authorization-reservation, artifact-capability-identity, or invocation field inside accepted-plan rejects. Missing writer output, wrong Gate/plan, or readback mismatch stops before the separate accepted-start read, accepted-artifact receive, and every journal/release/service/permit/database/backup mutation;
- the separately injected Host reader no-follow reads the four-field accepted-start projection, byte-compares its `acceptedPlanSha256` to Task 8's digest, canonicalizes/recomputes the invocation digest, and returns only its private-branded capability. The runner passes only that capability's `transactionId` and `acceptedArtifactRecordSha256` to the exact Bootstrap consumer; that consumer must finish durable-record readback plus transaction, unsigned-64-bit size, SHA-256, EOF, peer, and descriptor verification before it returns the opaque artifact capability and before Host initializes nonterminal state or creates a candidate;
- a transaction, size, SHA-256, EOF, or readback mismatch makes the consumer reject and close its received descriptor/capability internally, while Host stops before any release, journal, service, permit, database, or backup mutation;
- controller detach/disconnect after acceptance cannot cancel the host-local acquisition or transaction; reboot before the first runner starts recovers only through Bootstrap's inactive-old-unit plus no-follow durable revalidation rule; a live duplicate runner is rejected while the first keeps custody; and the acquired `close()` is invoked in `finally` on success, pre-quiesce stop, recovery handoff, and every thrown path;
- an unknown/out-of-order/repeated/skipped stage is rejected;
- expected-current label plus installed manifest/tree/source/artifact/runtime/dependency/data-pair/registry proof must all match before candidate creation;
- missing `config/proxy-servers.json`, unsupported Node, low capacity, checksum drift, archive traversal/link/device/special entry, duplicate/case/Unicode collision, expansion/ratio violation, dependency/runtime mismatch, native load failure, or config mismatch stops before live writer quiescence;
- candidate code/native validation before backup runs only under the isolated validation UID/namespace with synthetic fixtures and no protected config/live DB/runtime/network access;
- the application UID cannot write candidate/rollback releases or protected config;
- initial nonterminal journal and recovery guard are atomically durable/read back before candidate path or later mutation.
- a checksum/config/capacity/native rejection before `quiesce_and_backup` performs candidate-local cleanup, leaves application/auxiliary permits and units untouched, and publishes `stopped_pre_switch` without queueing fence/reconcile;
- every failure at or after `quiesce_and_backup` reaches recovery through exactly one systemd `OnFailure` edge, never an in-process duplicate queue.
- accepted-plan publication/fsync/readback precedes the later accepted-artifact/readback, authorization reservation, kernel-derived artifact capability identity, admission-ledger binding, and separate accepted-start projection publication/readback. Only then may Bootstrap call exactly one `transactionBrokerClient.startAcceptedTransaction({ transactionId, invocationSha256 })` with the Host canonicalizer's digest. The broker reads the accepted-plan digest, obtains the Host reader's branded evidence capability without reconstructing it, and constant-time compares that capability's recomputed digest before its manager call. The narrow adapter emits only `transaction_start_accepted`, derives `proxy-gateway-control-transaction@%i.service` from the validated transaction ID inside the broker, proves it active, and returns no unit name. A source/spy test rejects a copied/lookalike evidence object, direct systemd manager calls, `/run/systemd/private`, D-Bus, raw broker-socket access, `systemd-run`, a generic transient-unit adapter, a caller operation/unit/path field, or any second start before the manager spy is called.

Use one table to prove the accepted-capability fail-closed boundary before any mutation:

```js
for (const corruption of [
  "transaction",
  "size",
  "sha256",
  "eof",
  "accepted_record_readback",
]) {
  test(`host rejects accepted artifact ${corruption} mismatch before mutation`, async () => {
    const harness = hostTransactionHarness({
      acceptedArtifactConsumer: bootstrapConsumerFixture({ corruption }),
    });
    await assert.rejects(
      () => harness.runner.runAcceptedTransaction({ transactionId }),
      /accepted_artifact_(?:record|descriptor|transaction|size|sha256|eof|readback)_invalid/,
    );
    assert.equal(harness.consumerRejectedCapabilityCloseCount(), 1);
    assert.equal(harness.nonterminalInitializationCount(), 0);
    assert.equal(harness.productionMutationCount(), 0);
  });
}
```

Separate tests hold the first received capability while a second runner attempts the same record, simulate controller close immediately after producer acceptance, restart custody before the first runner, and inject every runner exit. They assert the duplicate rejects without closing the first capability, reboot repeats durable record/object readback before return, and each returned capability records one idempotent `close()` call.

- [ ] **Step 2: Write failing switch/acceptance/finalization tests**

Assert:

- the journal persists/fsyncs `pointer_switch_pending` before `durableSwapSymlink`;
- current symlink parent fsync and exact readback precede application permit publication;
- permit publication/fsync/readback precedes release of the exclusive business lease;
- application start is fresh, not satisfied by a previously active process;
- actual-handle readiness precedes listener/DML readiness;
- health validates service state, exact working release, restart-count delta, config, both database identities/schemas/integrity, feature flags, local endpoint, fixed public probe, and deadline;
- transaction calls only `validateTransaction`, recovery calls only `validateRecovery`, and neither method can cross phase or forward a broker operation;
- auxiliary permit/readback and exact prior state restore occur only after application acceptance;
- no extra timer run occurs during restore;
- custody duplicate/socket close and inactive readback precede guard removal;
- guard absence fsync/readback precedes the single canonical terminal record;
- finalization passes `context.databaseRecoveryResults` through `validateDatabaseTerminalVector({ contracts: context.plan.databaseContracts, results: context.databaseRecoveryResults, deploymentState: context.terminalResult })` before `terminalPublisher`; recovery uses the same call for its selected terminal state;
- a Receipt-owned publisher spy observes exactly one `publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })` call, followed only after its tuple/index readback by one Bootstrap-owned `replayLedger.bindTerminal(...)`; source scans reject Host-local canonical JSON serialization, receipt hashing, replay quota/retention constants, `compactEligible`, or alternate terminal/replay-store writes;
- a composition spy observes exactly one `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })` call with those two keys and no caller-supplied raw reader, logical ID, path, or digest; Receipt independently reads each of its four fixed semantic objects and rejects any digest/readback mismatch before `registerPendingLease(...)`, while a source scan rejects an injected reader factory or direct Foundation read from Host;
- only `finalize` may publish `deployed_validated`.

Before any non-critical call to the Receipt-owned publisher, `assertNormalTerminalPublicationBarrier(...)` must prove: the Task 1 exact two-database vector is complete and valid for the selected host state; every backup, backup-readback, migration, write-exclusion, transaction-only SQLite, capability, and accepted-artifact custody handle is closed/read back; no migration or exclusive business/global-identity lease remains; the writer quiescence barrier has either restored the exact prior auxiliary state or installed the exact selected-runtime state; the selected application has a fresh permit and its two actual-main-handle bindings are verified; and all pointer/permit/backup/ledger changes are already durable. This does not require the selected steady-state application or reviewed auxiliary writers to close their legitimate runtime permits/handles, and it does not weaken the first-database-commit/second-database-failure, code-only rollback, or no-automatic-database-restore rules.

Freeze this five-state, two-observation-point matrix in Host tests and pass its exact state/evidence relationship to Receipt Task 2; the receipt publisher must not collapse steady-state runtime handles into transaction-transient custody:

| Host final state | Selected runtime at terminal publication | Steady-state runtime permits / actual DB handles | Transaction, backup, migration, and artifact-custody state before publication | Required independent ordinary-status readback after publisher unit exits |
| --- | --- | --- | --- | --- |
| `deployed_validated` | candidate active and validated | candidate/application and reviewed auxiliary runtime permits/handles may remain active; both actual-main-handle proofs are required | all exclusive/write/backup/migration handles and accepted-artifact custody closed; no exclusive business/global-identity lease | transaction/finalize/custody/migration units inactive, transient handles absent, selected candidate/runtime handles still match |
| `stopped_pre_switch` | exact previous runtime active and revalidated | previous application/auxiliary runtime permits/handles may remain active | no live writer was disturbed on pre-quiesce stop, or the exact prior state was restored; all transaction-transient custody closed | transaction/recovery/custody units inactive and previous runtime identity/handles unchanged |
| `schema_committed_previous_release_validated` | previous code active against the exact classified mixed/post schema vector | previous application/auxiliary runtime permits/handles may remain active and must pass compatibility validation | both database results classified, all migration/backup/exclusive handles closed, no database restore | recovery/custody/migration units inactive and previous runtime exact-handle/schema evidence still matches |
| `rolled_back` | rollback code active and validated; databases remain live, never restored | rollback application/auxiliary runtime permits/handles may remain active | candidate permits/handles drained, rollback permit durable, all transaction-transient custody closed | recovery/custody/migration units inactive and rollback runtime exact-handle evidence still matches |
| `critical_manual_intervention_required` | no application or auxiliary runtime selected | no runtime permit or database handle may remain | external finalizer is allowed to be active and to hold the exclusive global identity/business leases plus unchanged `critical_identity_fence` through durable terminal publication | exact `createCriticalPostPublicationProofReader` brand: finalizer unit inactive/cgroup absent, every transaction/recovery/recorder/custody/migration unit inactive, both leases freshly acquired/read back/released/reacquired free, and fence unchanged; no runtime handle appears |

The Receipt Task 2 validator observes the publication-time column and may therefore accept an active publisher/finalizer that holds only the state-authorized transient authority. The controller's later ordinary status is a distinct read-only proof of the last column; for the critical row Bootstrap must first consume the exact Host-branded capability described in Task 12, and Receipt final validation requires the downstream Bootstrap status brand unchanged. It never retroactively rewrites the receipt and must withhold terminal success/critical display until that proof passes. The other four rows retain their state-specific runtime-handle versus transaction-transient closure rules and do not acquire the critical proof brand.

- [ ] **Step 3: Re-run the committed broker contract and write failing consumer sandbox tests**

Keep the independently committed provider test GREEN while adding RED consumer tests. Table-drive every `FIXED_SYSTEMD_OPERATIONS` value against its one literal action as an immutable provider regression. Reject an unknown operation, wrong phase, stale invocation digest, any of the four changed durable digest components, accepted-plan/accepted-record readback failure, wrong peer/cgroup, extra request key, arbitrary unit, or attempted unit/action override before the manager spy is called. Separately instantiate `createAcceptedTransactionBrokerClient` and prove its sole request is `{ operation: "transaction_start_accepted", transactionId, invocationSha256 }`, its second call for the same live transaction rejects, and neither Bootstrap handoff nor custody can access the raw client/socket. On a disposable target-matching Linux host, install the source units and prove with real processes that each consumer phase profile gets `EACCES`/`EPERM` for its denied path, direct `/run/systemd/private` and `/run/dbus/system_bus_socket` access, arbitrary-unit start, forbidden `mount`/`reboot`/`bpf` syscall, and non-validation `AF_INET`; assert the probe leaves no file, unit, mount, database write, or cgroup behind. Do not reimplement or modify the provider to make a consumer test pass.

Freeze this broker mapping in code and in the table-driven test; `%i` always comes from the validated request transaction and every prior-state choice is read from the durable journal:

| Operation | Sole manager action |
| --- | --- |
| `transaction_start_accepted` | independently read/verify the four durable accepted-start components, recompute the domain-separated invocation digest, then derive/start/read back active `proxy-gateway-control-transaction@%i.service`; no caller unit, caller component, generic `systemd-run`, or second live start |
| `transaction_quiesce` | stop/read back inactive `proxy-gateway-candidate.service` plus the three registry-fixed auxiliary timer/service pairs |
| `transaction_start_runtime_migration` | start/read back the literal runtime migration transient-unit profile and executable for `%i` |
| `transaction_start_control_migration` | start/read back the literal control migration transient-unit profile and executable for `%i` |
| `transaction_start_candidate` | start/read back fresh `proxy-gateway-candidate.service` under the journal-selected candidate permit |
| `transaction_start_validation` | start/read back `proxy-gateway-control-validation@%i.service` |
| `transaction_restore_auxiliary` | restore/read back only the journal-recorded prior enabled/active state of the three fixed auxiliary pairs |
| `recovery_start_fence` | start `proxy-gateway-control-recovery-fence@%i.service` |
| `recovery_start_application` | start/read back fresh `proxy-gateway-candidate.service` under the journal-selected recovery permit |
| `recovery_start_validation` | start/read back `proxy-gateway-control-validation@%i.service` |
| `recovery_restore_auxiliary` | restore/read back only the durable prior enabled/active state of the three fixed auxiliary pairs |
| `recovery_record_critical` | start `proxy-gateway-control-critical-state-recorder@%i.service` |
| `recovery_finalize_critical` | start `proxy-gateway-control-critical-terminal-finalizer.service` after proving exactly one pending `%i` |
| `readback_fixed_units` | query only the literal application, auxiliary, migration, validation, transaction, recovery, recorder, custody, and finalizer unit/cgroup set |

- [ ] **Step 4: Run focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-transaction-database.test.mjs server/tests/control-plane-fixed-health-validator.test.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-database-transaction.test.mjs
```

Expected: the independently committed broker provider test remains GREEN; the command is RED only because the host transaction, fixed validator, Receipt composition, and consumer unit profiles do not yet exist.

- [ ] **Step 5: Implement accepted capability custody and monotonic durable stage transitions**

```js
export const HOST_TRANSACTION_STAGES = Object.freeze([
  "live_compare",
  "read_only_inventory",
  "candidate_preparation",
  "quiesce_and_backup",
  "additive_schema",
  "atomic_switch",
  "acceptance",
  "finalize"
]);

export function createHostTransactionRunner(dependencies) {
  return Object.freeze({
    async runAcceptedTransaction({ transactionId }) {
      const accepted = await dependencies.journalStore.readAccepted(transactionId);
      const acceptedStartEvidence =
        await dependencies.acceptedStartEvidenceReader.readAndVerify({
          transactionId,
          expectedAcceptedPlanSha256: accepted.acceptedPlanSha256
        });
      assertAcceptedStartEvidenceCapability(acceptedStartEvidence);
      const acquired = await dependencies.acceptedArtifactConsumer.receive({
        transactionId,
        acceptedArtifactRecordSha256:
          acceptedStartEvidence.acceptedArtifactRecordSha256
      });
      let acquiredClosed = false;
      const closeAcquired = async () => {
        if (acquiredClosed) return;
        await acquired.close();
        const units = await dependencies.systemdBrokerClient.readbackFixedUnits({
          transactionId,
          invocationSha256: acceptedStartEvidence.invocationSha256
        });
        assertAcceptedArtifactCustodyInactive(units);
        acquiredClosed = true;
      };
      try {
        const initial = await dependencies.journalStore.initializeNonterminal({
          transactionId,
          acceptedPlanSha256: accepted.acceptedPlanSha256,
          acceptedArtifactRecordSha256:
            acceptedStartEvidence.acceptedArtifactRecordSha256,
          authorizationReservationSha256:
            acceptedStartEvidence.authorizationReservationSha256,
          artifactCapabilityIdentitySha256:
            acceptedStartEvidence.artifactCapabilityIdentitySha256,
          invocationSha256: acceptedStartEvidence.invocationSha256
        });
        let context = freezeContext({
          plan: accepted.acceptedPlan,
          acceptedPlanSha256: accepted.acceptedPlanSha256,
          acceptedStartEvidence,
          ...initial,
          artifactCapability: acquired
        });
        for (const [stageIndex, stage] of HOST_TRANSACTION_STAGES.entries()) {
          context = await dependencies.journalStore.beginStage({ context, stage });
          try {
            context = await runStage({ dependencies, context, stage });
            if (stage === "candidate_preparation") {
              await closeAcquired();
              context = freezeContext({ ...context, artifactCapability: null });
            }
            context = await dependencies.journalStore.completeStage({ context, stage });
          } catch (error) {
            await dependencies.journalStore.recordStageFailure({
              context,
              stage,
              safeCode: classifyHostFailure(error)
            });
            if (stageIndex < HOST_TRANSACTION_STAGES.indexOf("quiesce_and_backup")) {
              await closeAcquired();
              const stopped = await finalizeUnmutatedPreQuiesceStop({ dependencies, context });
              assertNormalTerminalPublicationBarrier(stopped);
              const terminal = await dependencies.terminalPublisher.publishTerminal({
                plan: stopped.plan,
                finalState: "stopped_pre_switch",
                terminalPublishedAt: stopped.terminalPublishedAt,
                databaseContracts: stopped.plan.databaseContracts,
                databaseResults: stopped.databaseRecoveryResults,
                terminalEvidence: stopped.terminalEvidence
              });
              await dependencies.replayLedger.bindTerminal({
                transactionId,
                finalState: terminal.finalState,
                terminalRecordSha256: terminal.terminalRecordSha256,
                closeoutIndexSha256: terminal.closeoutIndexSha256
              });
              await dependencies.journalStore.removeNonterminalAfterTerminalBind({
                transactionId,
                expectedJournalSha256: stopped.journalSha256,
                terminalRecordSha256: terminal.terminalRecordSha256,
                closeoutIndexSha256: terminal.closeoutIndexSha256
              });
              return terminal;
            }
            throw hostTransactionError("host_transaction_entered_recovery");
          }
        }
        return context.terminalResult;
      } finally {
        await closeAcquired();
      }
    }
  });
}
```

Task 8's owner-validated accepted-plan value is the immutable `plan` reference in runner context; the runner does not assume or dereference a nested `.plan`, `.productionGateReceipt`, accepted-record, reservation, capability-identity, or invocation field. It never augments that value. The Host reader's branded evidence capability is likewise carried by reference; only its safe fields are copied into the durable initial journal, and broker code may not copy them at all. The Bootstrap consumer is the sole verifier of the accepted-record/artifact-capability shape; Host treats a successful return as opaque and `candidate_preparation` passes only that capability to `releaseStore`, with no path reconstruction. Candidate preparation is the last permitted consumer: it closes the capability and proves the Bootstrap custody unit/socket inactive before completing the stage, while the `finally` path remains an idempotent fault barrier. No normal terminal publication may occur while accepted-artifact custody remains active. Every `beginStage`, mutation intent, stage completion, and terminal record uses the shared canonical contract and Foundation durable store. A GitHub disconnect or cancellation does not terminate the host-local unit. Receipt Task 2's publisher owns the successful `publishTerminal({ plan, finalState: "deployed_validated", terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })` serialization/publication too; the `finalize` stage then performs the same post-readback Bootstrap `bindTerminal` and verified nonterminal-unlink calls shown in the pre-quiesce path. Failure before `bindTerminal` leaves the transaction protected/nonterminal and recovery reuses the already-durable Receipt tuple rather than republishing it; failure after binding but before unlink leaves the same journal protected until its exact terminal binding is re-read and the verified unlink completes.

`finalizeUnmutatedPreQuiesceStop` removes only candidate-local temporary state, proves no production service/unit/permit/pointer/database/schema value changed, revalidates the exact previous application and prior auxiliary state from the read-only baseline, removes/readbacks the guard if it was created, validates a complete no-new-commit database vector, and only then asks `terminalPublisher` for `stopped_pre_switch`. It never calls service stop/start or writer permit close/open.

- [ ] **Step 6: Integrate the committed broker provider and implement phase-specific transaction sandboxes**

Import the Task 11A provider without changing or reimplementing its operation grammar, peer checks, socket, or service. The broker unit snippets below are the frozen provider contract; this step implements only consumer composition and phase-specific profiles. All service files in Tasks 11-12 include this exact common fragment; a contract test parses the installed units rather than searching text:

```ini
[Service]
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
ProcSubset=pid
RestrictSUIDSGID=true
RestrictRealtime=true
RestrictNamespaces=true
LockPersonality=true
SystemCallArchitectures=native
SystemCallErrorNumber=EPERM
SystemCallFilter=@system-service @file-system memfd_create fcntl sendmsg recvmsg
SystemCallFilter=~@mount @swap @reboot @module @raw-io @obsolete bpf kexec_load open_by_handle_at
AmbientCapabilities=
LimitCORE=0
StandardOutput=null
StandardError=null
```

The transaction template adds these exact phase authorities:

```ini
[Unit]
Description=Proxy Gateway control-plane transaction %i
After=local-fs.target
OnFailure=proxy-gateway-control-recovery-fence@%i.service

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-host-transaction.mjs
UMask=0077
RuntimeMaxSec=900
TimeoutStopSec=20
KillMode=control-group
ProtectSystem=strict
ReadWritePaths=/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane /opt/proxy-gateway-minimal-candidate/releases /opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/backups
ReadOnlyPaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/shared/config
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /root /home /media /mnt
CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER
RestrictAddressFamilies=AF_UNIX
```

The transaction is the only root phase that can mutate candidate release, pointer, live database, or backup roots. It cannot reach the systemd manager directly; all fixed lifecycle operations cross the broker socket. The Bootstrap-owned forced-command shim, exact no-argument sudo launcher, native root relay, and fixed root-only ingress socket end at durable accepted-plan/admission publication plus the narrow `startAcceptedTransaction({ transactionId, invocationSha256 })` call. That parser/relay chain has no manager socket, D-Bus, `systemd-run`, generic broker client, or unit selector. The Host root launcher, not the SSH principal, may instantiate only the Gate-derived safe `%i` name and fixed command. The installed unit digest is bound into bootstrap receipt, release declaration, plan, journal, and receipt. This unit never performs the public probe and therefore remains `AF_UNIX`-only.

The separate validation unit uses the fixed no-argument validator and is the only transaction/recovery unit allowed Internet address families:

```ini
[Unit]
Description=Proxy Gateway fixed control-plane validation %i
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=proxy-gateway-validation
Group=proxy-gateway-validation
ExecStart=/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-fixed-health-validator.mjs
RuntimeMaxSec=125
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ProtectSystem=strict
ReadWritePaths=/var/lib/proxy-gateway-control-plane/transactions/v1/%i/validation /run/proxy-gateway-control-plane/validation/%i
ReadOnlyPaths=/var/lib/proxy-gateway-control-plane/transactions/v1/%i /usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /opt/proxy-gateway-minimal-candidate/shared/config /opt/proxy-gateway-minimal-candidate/backups /root /home /media /mnt
CapabilityBoundingSet=
SystemCallFilter=@network-io
```

The broker is socket-activated, runs as root, and is deliberately filesystem-blind to production data:

```ini
[Socket]
ListenStream=/run/proxy-gateway-control-plane/systemd-broker.sock
SocketUser=root
SocketGroup=proxy-gateway-control-broker
SocketMode=0660
DirectoryMode=0750
RemoveOnStop=true

[Service]
User=root
Group=root
ExecStart=/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-fixed-systemd-broker.mjs
ProtectSystem=strict
ReadWritePaths=/run/proxy-gateway-control-plane
ReadOnlyPaths=/var/lib/proxy-gateway-control-plane/transactions/v1
InaccessiblePaths=/opt/proxy-gateway-minimal-candidate /var/lib/proxy-gateway-control-plane/bootstrap /root /home /media /mnt
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX
```

Only the fixed-operation broker can access `/run/systemd/private` or `/run/dbus/system_bus_socket`. It obtains PID/UID from `SO_PEERCRED` and asks the manager's fixed `GetUnitByPID` method for the peer unit/cgroup; the caller cannot name that unit. Peer UID/cgroup, transaction ID, independently recomputed invocation digest, current durable phase, and exact request keys must all match before the broker maps an operation to its literal unit action. The broker has no general `systemd-run` executable path or caller-configurable transient-unit surface; the Bootstrap root parser/relay and every Host consumer are denied both manager sockets. The validator derives the transaction from systemd identity, uses only the compiled local route and `https://portal.gccwebos.com/api/health`, has no database/config/release write authority, and writes one bounded aggregate result to the fixed result store. The parent validates that result against service identity, working release, restart count, database/feature evidence obtained separately over `AF_UNIX`, and the 120-second acceptance contract.

- [ ] **Step 7: Run focused and real-unit tests to witness GREEN**

Run the Step 4 command again, then run `systemd-analyze verify` on the transaction and validation units plus the already committed broker socket/service, followed by the target-Linux denied-operation harness from Step 3. The provider regression must remain GREEN without provider source changes.

Expected: pass.

- [ ] **Step 8: Commit the host transaction**

```bash
git add server/services/deployment/control-plane-host-transaction.mjs server/services/deployment/fixed-health-validator.mjs scripts/control-plane-host-transaction.mjs scripts/control-plane-fixed-health-validator.mjs server/tests/control-plane-host-transaction-database.test.mjs server/tests/control-plane-fixed-health-validator.test.mjs ops/control-plane-deploy/systemd/proxy-gateway-control-transaction@.service ops/control-plane-deploy/systemd/proxy-gateway-control-validation@.service
git commit -m "feat: run durable control plane host transactions"
```

### Task 12: Implement Phase-Chained Recovery, Code Rollback, And Critical Finalization

**Files:**
- Create: `server/services/deployment/host-recovery.mjs`
- Create: `scripts/control-plane-host-recovery.mjs`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery.path`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-dispatch.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-fence@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-start@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-validate@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-auxiliary-restore@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-finalize@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-critical-state-recorder@.service`
- Create: `ops/control-plane-deploy/systemd/proxy-gateway-control-critical-terminal-finalizer.service`
- Create: `server/tests/control-plane-host-recovery.test.mjs`
- Create: `server/tests/control-plane-host-systemd-contract.test.mjs`

**Interfaces:**
- Export `HOST_RECOVERY_PHASES` as exactly `fence_and_reconcile`, `application_start`, `application_validation`, `auxiliary_writer_restore`, `finalize`, `record_critical`, then `finalize_critical`.
- Export `createHostRecoveryRunner({ journalStore, native, systemdBrokerClient, databaseTransaction, writerAdmission, releaseStore, healthValidator, terminalPublisher, replayLedger, clock, faultInjector })`.
- Export `createCriticalPostPublicationProofReader({ fixedUnitStateReader, criticalIdentityFenceStore, globalIdentityLeaseProbe, businessMutationLeaseProbe, clock }) -> { readAndVerify({ transactionId, expectedCriticalIdentityFenceSha256 }) }` and `assertCriticalPostPublicationProof(value, { transactionId, expectedCriticalIdentityFenceSha256 })`. The injected fixed ports expose only `fixedUnitStateReader.readCriticalPostPublicationInactivity({ transactionId })`, `criticalIdentityFenceStore.readExact({ transactionId })`, and each lease probe's no-argument `acquireFreshExclusive()`; the returned opaque lease exposes only `readbackHeld()`, `close()`, and `readbackReleased()`. `readAndVerify` accepts exactly those two caller keys and returns one frozen module-private-`WeakSet`-branded capability with exactly `transactionId`, `criticalIdentityFenceSha256`, and `observedAt`; the assertion rejects a copied, spread, serialized, reconstructed, stale, or cross-transaction lookalike and returns the same reference. The capability contains no unit/cgroup selector, lease FD/OFD proof, path, raw fence bytes, writer identity, or database value.
- Expose `dispatchNonterminal()`, `runPhase({ transactionId, phase })`, and `finalizeCritical()`.
- `systemdBrokerClient` is exactly the Task 11 closed-operation client; recovery code has no direct systemd-manager adapter. Each transaction-specific recovery phase unit constructs `terminalPublisher` exactly as Task 11 does: Receipt's transaction-bound terminal writer/reader is bound to that unit's validated `transactionId`; Bootstrap's closeout store contributes only its owner methods; and the unit passes the same process-wide `bootstrapMaintenance` and the same `admissionReplayLedger` reference used by the normal transaction composition into Receipt's exact `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector })`. Recovery calls only `publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })` and receives the six-digest tuple.
- `healthValidator` is exactly the Task 11 fixed validator and recovery may call only `validateRecovery({ transactionId, selectedRelease })`; it cannot invoke the transaction validation operation.
- `scripts/control-plane-host-recovery.mjs` imports `createTransactionBoundTerminalCloseoutStore`, `createHostTerminalPublisher`, and Bootstrap's `createControllerCloseoutStore`, `createAdmissionReplayLedger`, and `createBootstrapMaintenanceCoordinator` only from their owner modules, and the fixed broker client only from `server/services/deployment/fixed-systemd-broker.mjs`. For the single validated transaction assigned to the phase unit it constructs exactly `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`; obtains the same owner ledger and process-wide maintenance coordinator used by the normal composition; calls `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector })` with all six exact dependencies; and then constructs `createHostRecoveryRunner` with that identical ledger as its `replayLedger`. Receipt performs the independent fixed-object reads and digest validation internally, and dispatch itself never reads terminal bytes or constructs a publisher. Normal recovery, recorder handoff, and external critical finalization share this one composition and define no alternate terminal reader, publisher, index writer, replay compactor, or systemd adapter.
- Recovery accepts final states only through Task 1's `isHostFinalState`/`isCriticalHostFinalState` predicates. The normal transaction finalizer alone selects `HOST_FINAL_STATES[0]`; recovery may select only the remaining non-critical members before the final critical member, and only the external finalizer may select the critical member. `critical_finalize_pending` is durable but nonterminal and is absent from `HOST_FINAL_STATES`; Task 12 defines no second terminal-state array.

- [ ] **Step 1: Write failing convergence tests at every mutation boundary**

Inject SIGTERM, SIGKILL, runtime timeout, service failure, and simulated reboot immediately before/after journal write/fsync, guard/permit publish/remove, service stop/start, backup close/fsync/rename, migration COMMIT, migration capability revoke, pointer rename/fsync/readback, auxiliary restore, and terminal publication. Recovery must be idempotent and converge without replaying admission or migration.

Add one real-provider terminal-maintenance composition matrix shared by `server/tests/control-plane-host-transaction-database.test.mjs` and `server/tests/control-plane-host-recovery.test.mjs`. Construct the actual Bootstrap `createAdmissionReplayLedger`, `createControllerCloseoutStore`, and `createBootstrapMaintenanceCoordinator`, then construct Receipt's actual publisher with the exact same coordinator and ledger references for all three rows: normal `deployed_validated`, phase-chained recovery `rolled_back`, and external critical `critical_manual_intervention_required`. Prove `runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })` occurs exactly once before the first Receipt write in every row; the identical ledger is later used for `bindTerminal`; no Host path calls a compactor, supplies maintenance time/capability/digest, or swaps a fake coordinator between paths.

For each of those three paths, fill the real Bootstrap closeout index with 1,024 valid protected entries and prove a 1,025th terminal publication fails closed before the first Receipt write when no entry is eligible. Then make exactly one owner-eligible entry available and prove the real coordinator compacts by deterministic CAS, readbacks the index at 1,024 entries, and permits the 1,025th registration. Repeat across crash-before-CAS, crash-after-CAS, stale digest, lock contention/loss, and reconstructed-after-reboot cases; replay must converge without changing `terminalPublishedAt` or any Receipt digest. These are provider-backed 1,024/1,025 tests, not structural fakes or a count-only Host index.

- [ ] **Step 2: Write failing state-specific rollback tests**

Cover:

- pre-schema failure restores the exact prior pointer/permit/application/auxiliary state and returns `stopped_pre_switch` only after validation;
- additive failure with zero new commits verifies all pre/post start states and may return `stopped_pre_switch`;
- runtime newly commits, control fails, pointer remains old: previous release starts under a new permit, validates the exact mixed schema vector, and returns `schema_committed_previous_release_validated`;
- post-switch rejection closes candidate/aux permits, drains all candidate holders, atomically switches only code to rollback, publishes rollback permit, starts and validates rollback, restores auxiliary state, and returns `rolled_back` while the GitHub result remains failure;
- rollback validation failure records `critical_finalize_pending`, retains guard, closes permits, leaves no application/auxiliary/migration/custody process or DB handle, and never restores a database;
- recovery allows one code-rollback attempt only.
- the durable recovery deadline is exactly four minutes from the first fence/reconcile transition across every retry and reboot; no phase restart resets it. Phase selection first reads and validates the persisted phase. After expiry, an exact ordinary nonterminal phase may transition only to `record_critical`, and persisted `critical_finalize_pending` may transition only to external `finalize_critical`; every other phase/edge rejects before broker, release, database, pointer, or receipt work.
- reboot tests persist a deadline just before and just after expiry, terminate every in-memory runner, and reconstruct from durable state. The pre-expiry case keeps its remaining original budget; the post-expiry case cannot restart fence/application/validation/restore/normal-finalize, records `critical_finalize_pending` once, and after a second reboot can invoke only the external critical finalizer. Neither case rewrites `recoveryStartedAt` or gains a new four-minute window.

- [ ] **Step 3: Write failing external critical-finalizer tests**

Require application/auxiliary/migration/custody/transaction/recovery/recorder units and cgroups inactive/absent; every database capability/handle closed; permits closed; guard retained; exclusive business lease and the one global database-identity lease acquired/read back. While the external finalizer itself remains active and holds both leases, publish/read back `critical_identity_fence`, then call the same Receipt-owned publisher exactly once with `{ plan, finalState: "critical_manual_intervention_required", terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence }`. That publisher must be the six-dependency instance carrying the same `bootstrapMaintenance` and `admissionReplayLedger` references already exercised by normal/recovery; its maintenance preflight completes before Receipt validates the held-lease/fence publication proof and before any Receipt write. Receipt must not require the active finalizer or its two leases to be inactive/free at that moment. Keep both leases through the returned six-digest tuple readback, Bootstrap `bindTerminal`, and verified nonterminal-journal unlink; release/read back them only after all three barriers are durable. A later ordinary status must withhold the record until systemd independently proves the finalizer inactive and reacquires/releases both leases under the unchanged fence. A source test rejects any recovery-local receipt builder, canonical serializer, digest calculation, alternate terminal write, direct compactor, replaced coordinator/ledger, or publication-time `leasesFree` assertion.

The later proof is owned only by `createCriticalPostPublicationProofReader`. Its fixed `fixedUnitStateReader.readCriticalPostPublicationInactivity({ transactionId })` port must prove the external finalizer unit inactive, its cgroup absent, and every transaction/recovery/recorder/custody/migration unit and cgroup for that transaction inactive/absent; the port accepts no unit or cgroup from the caller. The reader then reads the exact durable critical fence, byte-compares its digest with `expectedCriticalIdentityFenceSha256`, and runs this closed lease sequence:

1. acquire a fresh nonblocking exclusive global database-identity lease and a fresh nonblocking exclusive business-mutation lease through the two fixed no-argument probe ports;
2. read back both held in exclusive mode and reread the same critical fence unchanged while both are held;
3. close in reverse order and read back both released;
4. freshly reacquire/read back/release each exclusive lease once more to prove both are free after release, then reread the fence unchanged;
5. only after all checks succeed, brand and return the exact three-field capability.

Every acquisition is an opaque closure with only `readbackHeld()`, `close()`, and `readbackReleased()`; no raw lease FD or open-file-description token crosses the reader boundary, and an outer `finally` closes every partially acquired probe. An active finalizer, present cgroup, live fixed unit, blocked/wrong/shared/unlocked lease, changed OFD within a probe, held/release/free readback failure, fence drift, reboot-stale fence, or clock regression rejects without a brand. Tests must also prove `assertCriticalPostPublicationProof` accepts the exact returned reference and rejects a structurally identical frozen object.

Bootstrap's ordinary-status store is the only consumer of this reader. For `critical_manual_intervention_required`, it supplies the immutable terminal fence digest as `expectedCriticalIdentityFenceSha256`, calls `readAndVerify`, passes the same reference through `assertCriticalPostPublicationProof`, and withholds `immutableTerminal`, terminal-bundle access, and closeout state unless the assertion succeeds. The Host proof object is never serialized onto the status wire. Bootstrap's ordinary-status codec may create its own controller-facing private brand only after this Host brand has been accepted; Receipt's terminal/final-status validators must require that exact Bootstrap-branded value unchanged. Thus the Receipt publication-time body continues to prove the active finalizer/held leases, while the later final controller result transitively requires the distinct Host post-publication brand and cannot substitute either observation point for the other.

- [ ] **Step 4: Run focused tests to witness RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-host-transaction-database.test.mjs server/tests/control-plane-host-recovery.test.mjs server/tests/control-plane-host-systemd-contract.test.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs
```

Expected: the actual Bootstrap maintenance/closeout and Receipt publisher provider tests remain GREEN; failure is only because the recovery modules/units and three-path Host composition do not yet exist.

- [ ] **Step 5: Implement phase-specific recovery without stop/start in one systemd transaction**

```js
export async function runRecoveryPhase({ dependencies, transactionId, phase }) {
  const context = await dependencies.journalStore.readNonterminal(transactionId);
  const persistedPhase = readPersistedRecoveryPhase(context);
  assertRecoveryPhaseAllowed({ context, persistedPhase, requestedPhase: phase });
  if (isRecoveryDeadlineExpired({ context, now: dependencies.clock(), maxElapsedMs: 240000 })) {
    assertExpiredRecoveryTransition({ persistedPhase, requestedPhase: phase });
  }
  if (phase === "fence_and_reconcile") return fenceAndReconcile(dependencies, context);
  if (phase === "application_start") return startSelectedApplication(dependencies, context);
  if (phase === "application_validation") return validateSelectedApplication(dependencies, context);
  if (phase === "auxiliary_writer_restore") return restoreAuxiliaryWriters(dependencies, context);
  if (phase === "finalize") return finalizeRecoveredTransaction(dependencies, context);
  if (phase === "record_critical") return recordCriticalPending(dependencies, context);
  if (phase === "finalize_critical") return finalizeCriticalTransaction(dependencies, context);
  throw recoveryError("recovery_phase_invalid");
}
```

`assertExpiredRecoveryTransition` is a closed edge table, not a broad exemption: an allowed ordinary persisted phase plus requested `record_critical` is the only deadline-expiry recording edge; persisted `critical_finalize_pending` plus requested `finalize_critical` is the only external-finalization edge. In particular, checking the deadline before reading the durable phase, treating every expired call alike, retrying a normal phase, or allowing `finalize_critical` directly from an ordinary phase is a test failure. `recordCriticalPending` durably CAS-publishes/fsyncs/reads back `critical_finalize_pending` before it asks the fixed broker for `recovery_finalize_critical`.

Fence/reconcile asks only the broker's fixed stop/readback operations, drains holders, and selects the exact release but never starts it. Application start occurs in a distinct later unit through `recovery_start_application`. Validation occurs after that start job and starts only the fixed validation unit through `recovery_start_validation`. Auxiliary restore occurs only after validation through `recovery_restore_auxiliary`. Finalization occurs only after restore/readback. Every non-critical terminal path first calls `validateDatabaseTerminalVector(...)`, then calls the Receipt-owned publisher exactly as follows:

```js
const terminal = await dependencies.terminalPublisher.publishTerminal({
  plan: context.plan,
  finalState: context.selectedTerminalState,
  terminalPublishedAt: context.terminalPublishedAt,
  databaseContracts: context.plan.databaseContracts,
  databaseResults: context.databaseRecoveryResults,
  terminalEvidence: context.terminalEvidence,
});
await dependencies.replayLedger.bindTerminal({
  transactionId: context.transactionId,
  finalState: terminal.finalState,
  terminalRecordSha256: terminal.terminalRecordSha256,
  closeoutIndexSha256: terminal.closeoutIndexSha256,
});
await dependencies.journalStore.removeNonterminalAfterTerminalBind({
  transactionId: context.transactionId,
  expectedJournalSha256: context.journalSha256,
  terminalRecordSha256: terminal.terminalRecordSha256,
  closeoutIndexSha256: terminal.closeoutIndexSha256,
});
return terminal;
```

The external critical finalizer uses the same publish-then-owner-bind sequence. Bootstrap's `bindTerminal` records the critical label but preserves it from ordinary compaction; any crash before the bind leaves the accepted/nonterminal/critical evidence protected, and restart performs exact readback/reuse. Host never calls Bootstrap's `compactEligible`, never supplies retention time, and never converts a nonterminal or critical record into an ordinary eligible entry.

- [ ] **Step 6: Add the exact systemd chain**

The fence unit contains:

```ini
[Unit]
Description=Proxy Gateway control-plane recovery fence %i
After=local-fs.target
OnSuccess=proxy-gateway-control-recovery-application-start@%i.service
OnFailure=proxy-gateway-control-critical-state-recorder@%i.service
StartLimitBurst=3

[Service]
Type=oneshot
User=root
Group=root
ExecStart=/usr/bin/node /usr/local/libexec/proxy-gateway-control-plane/control-plane-host-recovery.mjs fence_and_reconcile
RuntimeMaxSec=60
Restart=on-failure
RestartSec=2
KillMode=control-group
UMask=0077
ProtectSystem=strict
ReadWritePaths=/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane /opt/proxy-gateway-minimal-candidate/current
ReadOnlyPaths=/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/releases /opt/proxy-gateway-minimal-candidate/backups /opt/proxy-gateway-minimal-candidate/shared/config
InaccessiblePaths=/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /root /home /media /mnt
CapabilityBoundingSet=CAP_DAC_OVERRIDE CAP_FOWNER
RestrictAddressFamilies=AF_UNIX
```

Application validation contains the required network ordering:

```ini
[Unit]
Wants=network-online.target
After=network-online.target proxy-gateway-control-recovery-application-start@%i.service
OnSuccess=proxy-gateway-control-recovery-auxiliary-restore@%i.service
OnFailure=proxy-gateway-control-recovery-fence@%i.service
```

Each phase script accepts only the one fixed phase token shown in its unit and derives transaction `%i` from its own systemd identity. The systemd contract test must prove no ordering cycle and that no unit can select an arbitrary executable, service, UID, cgroup, path, or transaction. In addition to the exact common Task 11 fragment, each Task 12 service has this phase-specific sandbox; all listed paths are literal unit properties, not documentation aliases:

| Service | `User` / `Group` | `ReadWritePaths` | `ReadOnlyPaths` | `InaccessiblePaths` | `CapabilityBoundingSet` | address families / syscall delta |
| --- | --- | --- | --- | --- | --- | --- |
| `proxy-gateway-control-recovery-dispatch.service` | `proxy-gateway-control-dispatch` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1 /run/proxy-gateway-control-plane` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |
| `proxy-gateway-control-recovery-fence@.service` | `root` / `root` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane /opt/proxy-gateway-minimal-candidate/current` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/releases /opt/proxy-gateway-minimal-candidate/backups /opt/proxy-gateway-minimal-candidate/shared/config` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /root /home /media /mnt` | `CAP_DAC_OVERRIDE CAP_FOWNER` | `AF_UNIX`; common filter only |
| `proxy-gateway-control-recovery-application-start@.service` | `proxy-gateway-control-start` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane` | `/usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /opt/proxy-gateway-minimal-candidate/shared/config /opt/proxy-gateway-minimal-candidate/backups /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |
| `proxy-gateway-control-recovery-application-validate@.service` | `proxy-gateway-control-validate` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane` | `/usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /opt/proxy-gateway-minimal-candidate/shared/config /opt/proxy-gateway-minimal-candidate/backups /root /home /media /mnt` | empty | `AF_UNIX`; common filter only; the separately sandboxed fixed validator owns `AF_INET`/`AF_INET6` |
| `proxy-gateway-control-recovery-auxiliary-restore@.service` | `proxy-gateway-control-restore` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |
| `proxy-gateway-control-recovery-finalize@.service` | `proxy-gateway-control-finalize` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1 /opt/proxy-gateway-minimal-candidate/current /opt/proxy-gateway-minimal-candidate/releases` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate/shared/state /opt/proxy-gateway-minimal-candidate/shared/config /opt/proxy-gateway-minimal-candidate/backups /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |
| `proxy-gateway-control-critical-state-recorder@.service` | `proxy-gateway-control-recorder` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1/%i /run/proxy-gateway-control-plane` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |
| `proxy-gateway-control-critical-terminal-finalizer.service` | `proxy-gateway-control-finalizer` / `proxy-gateway-control-broker` | `/var/lib/proxy-gateway-control-plane/transactions/v1 /run/proxy-gateway-control-plane` | `/var/lib/proxy-gateway-control-plane/bootstrap/v1 /usr/lib/proxy-gateway-control-plane/contracts/v1` | `/run/systemd/private /run/dbus/system_bus_socket /opt/proxy-gateway-minimal-candidate /root /home /media /mnt` | empty | `AF_UNIX`; common filter only |

The install manifest creates the seven dedicated service users without login shells, home directories, supplementary groups, or ambient capabilities; their sole primary group is `proxy-gateway-control-broker`. That group grants only the broker socket plus mode-`0770` transaction directories and mode-`0660` canonical journal files under `/var/lib/proxy-gateway-control-plane/transactions/v1`; per-unit mount namespaces narrow those shared modes to the exact row above, and no production release/config/database/backup object is group-readable or writable. Fence and the normal transaction remain root only because they own pointer/durability and exact capability-custody transitions; they still have the bounded capability sets and path denials above. Dispatcher, start, validation coordinator, auxiliary restore, finalize, recorder, and external finalizer obtain only the fixed journal, Unix-socket, and lease capabilities provisioned for their phase and cannot open a database path or reach systemd directly.

Add parsed-unit tests for every row and run each installed profile on target-matching Linux with a test-only fixed probe binary. For every service, attempt a write to `/etc/control-plane-denied`, direct access to both systemd-manager sockets, an arbitrary `sshd.service` start, `mount`, `reboot`, `bpf`, and `AF_INET`; for each non-transaction phase also attempt to open/write the live database root. For transaction and fence, prove the live database path is likewise inaccessible and that only the exact pre-opened capability remains usable. Validate `EACCES`/`EPERM`, unchanged hashes/metadata, no manager call, no mount, no unit-state change, no database/WAL/SHM change, and no leftover cgroup. The fixed validation unit is the sole `AF_INET` positive control and still fails every filesystem, direct-systemd, arbitrary-unit, database, and privileged-syscall probe.

- [ ] **Step 7: Implement boot/path dispatch and bounded critical handling**

`proxy-gateway-control-recovery.path` contains both `PathExistsGlob=/var/lib/proxy-gateway-control-plane/transactions/v1/*/recovery.guard` and `PathExistsGlob=/var/lib/proxy-gateway-control-plane/transactions/v1/*/journal.nonterminal` and starts the fixed no-argument dispatcher. The dispatcher service is also directly `WantedBy=multi-user.target`, so boot scans even when no path event is generated. It consumes only Bootstrap's owner-validated protected-nonterminal ID listing through `journalStore.listNonterminal()`; it does not enumerate admission directories, reproduce the replay quota, or compact anything. It rejects multiple active transactions as critical, recreates/fsyncs/reads back a missing guard before any action, and then requests only `recovery_start_fence` through the broker. Tests cover journal present/guard missing at boot, guard present/journal present, stale terminal-only state, multiple nonterminals, and proof that active/nonterminal/critical entries remain protected across compactor attempts and reboot. The critical recorder persists/readbacks `critical_finalize_pending` and may then request only `recovery_finalize_critical`; another recovery phase may request `recovery_record_critical` to enter it. The recorder has no pointer-switch, application-service-start, database-open/write, compaction, or network authority. The external critical finalizer is outside all transaction cgroups and has no database-open/write authority.

```ini
[Path]
PathExistsGlob=/var/lib/proxy-gateway-control-plane/transactions/v1/*/recovery.guard
PathExistsGlob=/var/lib/proxy-gateway-control-plane/transactions/v1/*/journal.nonterminal
Unit=proxy-gateway-control-recovery-dispatch.service

[Install]
WantedBy=multi-user.target
```

The dispatch service itself also has `[Install] WantedBy=multi-user.target`; its boot invocation performs the same bounded scan and missing-guard repair/readback before returning.

- [ ] **Step 8: Run recovery/systemd tests to witness GREEN**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-recovery.test.mjs server/tests/control-plane-host-systemd-contract.test.mjs server/tests/control-plane-host-transaction-database.test.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs
systemd-analyze verify ops/control-plane-deploy/systemd/proxy-gateway-control-transaction@.service ops/control-plane-deploy/systemd/proxy-gateway-control-validation@.service ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.socket ops/control-plane-deploy/systemd/proxy-gateway-control-systemd-broker.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery.path ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-dispatch.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-fence@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-start@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-validate@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-auxiliary-restore@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-finalize@.service ops/control-plane-deploy/systemd/proxy-gateway-control-critical-state-recorder@.service ops/control-plane-deploy/systemd/proxy-gateway-control-critical-terminal-finalizer.service
```

Expected: pass, including reboot-persistent deadline edges and the branded critical post-publication matrix (active finalizer/present cgroup/fence drift/wrong lease mode or OFD/release failure/free-probe failure/lookalike all reject; exact inactive/fresh-exclusive/readback/release/reacquire/free/unchanged-fence proof alone succeeds), followed by the target-Linux real denied-operation matrix for every Task 11-12 profile with no residual mutation.

- [ ] **Step 9: Commit recovery chain**

```bash
git add server/services/deployment/host-recovery.mjs scripts/control-plane-host-recovery.mjs ops/control-plane-deploy/systemd/proxy-gateway-control-recovery.path ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-dispatch.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-fence@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-start@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-application-validate@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-auxiliary-restore@.service ops/control-plane-deploy/systemd/proxy-gateway-control-recovery-finalize@.service ops/control-plane-deploy/systemd/proxy-gateway-control-critical-state-recorder@.service ops/control-plane-deploy/systemd/proxy-gateway-control-critical-terminal-finalizer.service server/tests/control-plane-host-recovery.test.mjs server/tests/control-plane-host-systemd-contract.test.mjs
git commit -m "feat: converge host transactions through durable recovery"
```

### Task 13: Add The Seven-Scenario Clean Host Integration Harness

**Files:**
- Create: `scripts/control-plane-host-integration.mjs`
- Create: `server/tests/control-plane-host-integration.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Export `CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS` in this exact order: `successful_promotion`, `health_rejection_code_rollback`, `first_database_commit_second_database_failure`, `sqlite_commit_before_external_observation_crash`, `auxiliary_writer_attempt_during_backup`, `controller_connection_interruption`, `forced_process_and_boot_recovery`.
- Export `CONTROL_PLANE_HOST_INTEGRATION_DEFINITIONS`, `createCleanHostIntegrationHarness({ scenarioId, definition })`, `runControlPlaneHostIntegrationScenario({ scenarioId, createHarness })`, and `runAllControlPlaneHostIntegrationScenarios({ createHarness })`.
- Consume only database owner `canonicalizeDatabaseContracts(value)` for the synthetic inventory, release declaration, and immutable plan database arrays. The harness requires all three returned `bytes` values and all three `sha256` values to be equal, requires each carried `databaseContractsSha256` to equal that helper digest, and passes forward only the helper-returned normalized `databaseContracts`; it contains no 14-field order or second database canonical contract.
- `createHarness({ scenarioId, definition })` returns exactly `{ execute(), close() }`. `execute()` returns the aggregate-only observation consumed below; `close()` removes the scenario's unique temporary root and returns `{ tempRootAbsent: true }`. Neither method accepts a path, unit, database, endpoint, command, credential, or production selector.
- CLI accepts zero arguments, creates and removes its own temp root, and writes one aggregate line: `{ schemaVersion: "1", scenarioCount: 7, passedCount: 7, failedCount: 0, accepted: true, contractSha256 }`. Any argv exits `2` before fixture creation.
- `package.json` exports `control-plane:host:integration` as exactly `node scripts/control-plane-host-integration.mjs`.

- [ ] **Step 1: Write the complete failing seven-scenario test before implementation**

Write this table-driven test first. It imports the still-missing exports, invokes the real clean synthetic fixture for every row, and asserts the fixed fault/terminal contract rather than replacing the fixture with an echo stub:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROL_PLANE_HOST_INTEGRATION_DEFINITIONS,
  CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS,
  createCleanHostIntegrationHarness,
  runAllControlPlaneHostIntegrationScenarios,
  runControlPlaneHostIntegrationScenario,
} from "../../scripts/control-plane-host-integration.mjs";

const EXPECTED = Object.freeze([
  ["successful_promotion", "none", "deployed_validated", "not_required"],
  ["health_rejection_code_rollback", "acceptance_fixed_health_reject", "rolled_back", "code_rollback"],
  ["first_database_commit_second_database_failure", "after_runtime_commit_before_control_commit", "schema_committed_previous_release_validated", "schema_only_previous_release"],
  ["sqlite_commit_before_external_observation_crash", "after_sqlite_commit_before_commit_observed", "schema_committed_previous_release_validated", "ledger_classified_previous_release"],
  ["auxiliary_writer_attempt_during_backup", "auxiliary_attempt_while_backup_locks_held", "deployed_validated", "delayed_exactly_once"],
  ["controller_connection_interruption", "controller_disconnect_after_artifact_accepted", "deployed_validated", "host_local_continuation"],
  ["forced_process_and_boot_recovery", "kill_after_atomic_switch_then_boot", "deployed_validated", "boot_resume_candidate"],
]);

test("runs the seven closed host scenarios in frozen order", async () => {
  assert.deepEqual(CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS, EXPECTED.map(([id]) => id));
  assert.deepEqual(
    CONTROL_PLANE_HOST_INTEGRATION_DEFINITIONS.map(
      ({ scenarioId, faultPoint, expectedFinalState, expectedRecoveryDisposition }) =>
        [scenarioId, faultPoint, expectedFinalState, expectedRecoveryDisposition],
    ),
    EXPECTED,
  );
  const report = await runAllControlPlaneHostIntegrationScenarios({
    createHarness: createCleanHostIntegrationHarness,
  });
  assert.deepEqual(
    report.results.map(({ scenarioId, finalState, recoveryDisposition, passed }) =>
      [scenarioId, finalState, recoveryDisposition, passed]),
    EXPECTED.map(([scenarioId, , finalState, recoveryDisposition]) =>
      [scenarioId, finalState, recoveryDisposition, true]),
  );
  assert.deepEqual(
    { scenarioCount: report.scenarioCount, passedCount: report.passedCount,
      failedCount: report.failedCount, accepted: report.accepted },
    { scenarioCount: 7, passedCount: 7, failedCount: 0, accepted: true },
  );
  assert.match(report.contractSha256, /^[0-9a-f]{64}$/);
});

test("rejects unknown scenarios before allocating a fixture", async () => {
  let created = 0;
  await assert.rejects(
    () => runControlPlaneHostIntegrationScenario({
      scenarioId: "unknown",
      createHarness() { created += 1; throw new Error("must_not_run"); },
    }),
    /host_integration_scenario_id_invalid/,
  );
  assert.equal(created, 0);
});
```

The test fixture must contain synthetic candidate/rollback release directories, an atomic current symlink, two physically distinct SQLite files plus a same-file rejection case, protected-config-shaped data with no endpoint/credential value, Bootstrap-compatible accepted-artifact custody, the closed systemd broker/client, Receipt's transaction-bound terminal store and unique publisher, fake loopback/public health, Foundation `createDurableStore({ contracts, fsOps, native })`, database owner `canonicalizeDatabaseContracts`, and a deterministic fault injector. The test rejects any real release/config/database root, direct systemd adapter, non-loopback network destination, secret-like value, copied database field-order array, or inventory/release/plan canonical-byte/digest mismatch.

- [ ] **Step 2: Run the complete test and record the expected RED**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-integration.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-host-integration.mjs`, or a named missing-export failure if the empty module checkpoint exists. Record this RED before adding any scenario definition, harness, runner, or CLI implementation.

- [ ] **Step 3: Implement the seven definitions and the minimal real fixture runner**

Use this exact scenario table; no caller may inject another ID or alter a fault point/expected state:

| Order | `scenarioId` | `faultPoint` | Expected host final state | Expected recovery disposition |
| ---: | --- | --- | --- | --- |
| 1 | `successful_promotion` | `none` | `deployed_validated` | `not_required` |
| 2 | `health_rejection_code_rollback` | `acceptance_fixed_health_reject` | `rolled_back` | `code_rollback` |
| 3 | `first_database_commit_second_database_failure` | `after_runtime_commit_before_control_commit` | `schema_committed_previous_release_validated` | `schema_only_previous_release` |
| 4 | `sqlite_commit_before_external_observation_crash` | `after_sqlite_commit_before_commit_observed` | `schema_committed_previous_release_validated` | `ledger_classified_previous_release` |
| 5 | `auxiliary_writer_attempt_during_backup` | `auxiliary_attempt_while_backup_locks_held` | `deployed_validated` | `delayed_exactly_once` |
| 6 | `controller_connection_interruption` | `controller_disconnect_after_artifact_accepted` | `deployed_validated` | `host_local_continuation` |
| 7 | `forced_process_and_boot_recovery` | `kill_after_atomic_switch_then_boot` | `deployed_validated` | `boot_resume_candidate` |

Implement the closed runner and fixture invocation as follows:

```js
export const CONTROL_PLANE_HOST_INTEGRATION_DEFINITIONS = Object.freeze([
  Object.freeze({ scenarioId: "successful_promotion", faultPoint: "none", expectedFinalState: "deployed_validated", expectedRecoveryDisposition: "not_required" }),
  Object.freeze({ scenarioId: "health_rejection_code_rollback", faultPoint: "acceptance_fixed_health_reject", expectedFinalState: "rolled_back", expectedRecoveryDisposition: "code_rollback" }),
  Object.freeze({ scenarioId: "first_database_commit_second_database_failure", faultPoint: "after_runtime_commit_before_control_commit", expectedFinalState: "schema_committed_previous_release_validated", expectedRecoveryDisposition: "schema_only_previous_release" }),
  Object.freeze({ scenarioId: "sqlite_commit_before_external_observation_crash", faultPoint: "after_sqlite_commit_before_commit_observed", expectedFinalState: "schema_committed_previous_release_validated", expectedRecoveryDisposition: "ledger_classified_previous_release" }),
  Object.freeze({ scenarioId: "auxiliary_writer_attempt_during_backup", faultPoint: "auxiliary_attempt_while_backup_locks_held", expectedFinalState: "deployed_validated", expectedRecoveryDisposition: "delayed_exactly_once" }),
  Object.freeze({ scenarioId: "controller_connection_interruption", faultPoint: "controller_disconnect_after_artifact_accepted", expectedFinalState: "deployed_validated", expectedRecoveryDisposition: "host_local_continuation" }),
  Object.freeze({ scenarioId: "forced_process_and_boot_recovery", faultPoint: "kill_after_atomic_switch_then_boot", expectedFinalState: "deployed_validated", expectedRecoveryDisposition: "boot_resume_candidate" }),
]);

export const CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS = Object.freeze(
  CONTROL_PLANE_HOST_INTEGRATION_DEFINITIONS.map(({ scenarioId }) => scenarioId),
);

const REQUIRED_TRUE_OBSERVATIONS = Object.freeze([
  "backupPairVerified",
  "databaseContractBytesEqual",
  "databaseContractsSha256Bound",
  "writerRegistryExact",
  "auxiliaryCheckpointNoLossNoDuplicate",
  "migrationCustodyClosedBeforeRestart",
  "runtimeStateMatchesTerminal",
  "persistedDataPairVerified",
  "acceptedArtifactBindingsVerified",
  "acceptedArtifactLiveDuplicateRejected",
  "acceptedArtifactClosedExactlyOnce",
  "phaseSandboxDenialMatrixVerified",
  "receiptPublishedByReceiptOwner",
  "terminalDigestTupleVerified",
  "aggregateOutputsRedacted",
]);

const HOST_INTEGRATION_OBSERVATION_KEYS = Object.freeze([
  "scenarioId",
  "finalState",
  "recoveryDisposition",
  ...REQUIRED_TRUE_OBSERVATIONS,
  "secretLikeMatches",
]);

export async function createCleanHostIntegrationHarness({ scenarioId, definition }) {
  assertClosedScenarioDefinition({ scenarioId, definition });
  const fixture = await createDisposableControlPlaneFixture({
    scenarioId,
    faultScript: Object.freeze([definition.faultPoint]),
    releaseMode: "synthetic_candidate_and_rollback",
    databaseMode: "two_distinct_sqlite_plus_same_file_negative",
    configurationMode: "protected_shape_without_values",
    bootstrapMode: "accepted_artifact_capability",
    terminalMode: "receipt_transaction_bound_store_and_unique_publisher",
    systemdMode: "closed_in_process_broker_plus_real_denial_contract",
    healthMode: "loopback_fake_local_and_public",
  });
  return Object.freeze({
    execute: () => fixture.executeAcceptedTransactionAndRecover(),
    close: () => fixture.disposeAndReadBackAbsent(),
  });
}

export async function runControlPlaneHostIntegrationScenario({ scenarioId, createHarness }) {
  const definition = definitionForExactScenarioId(scenarioId);
  const harness = await createHarness({ scenarioId, definition });
  let observation;
  let cleanup;
  try {
    observation = await harness.execute();
  } finally {
    cleanup = await harness.close();
  }
  assertExactKeys(observation, HOST_INTEGRATION_OBSERVATION_KEYS);
  for (const field of REQUIRED_TRUE_OBSERVATIONS) {
    if (observation[field] !== true) throw hostIntegrationError("host_integration_invariant_failed");
  }
  if (cleanup?.tempRootAbsent !== true
    || observation.scenarioId !== scenarioId
    || observation.finalState !== definition.expectedFinalState
    || observation.recoveryDisposition !== definition.expectedRecoveryDisposition
    || observation.secretLikeMatches !== 0) {
    throw hostIntegrationError("host_integration_result_invalid");
  }
  return Object.freeze({
    scenarioId,
    finalState: observation.finalState,
    recoveryDisposition: observation.recoveryDisposition,
    passed: true,
  });
}

export async function runAllControlPlaneHostIntegrationScenarios({ createHarness }) {
  const results = [];
  for (const scenarioId of CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS) {
    results.push(await runControlPlaneHostIntegrationScenario({ scenarioId, createHarness }));
  }
  return Object.freeze({
    schemaVersion: "1",
    scenarioCount: results.length,
    passedCount: results.filter(({ passed }) => passed).length,
    failedCount: results.filter(({ passed }) => !passed).length,
    accepted: results.every(({ passed }) => passed),
    contractSha256: hostIntegrationContractSha256(),
    results: Object.freeze(results),
  });
}
```

`createDisposableControlPlaneFixture(...)` is implemented in the same script and composes the actual modules completed in Tasks 0-12. Its accepted enum values are exactly those shown above. For every scenario it creates a fresh `mkdtemp` root, calls the Bootstrap consumer rather than opening an artifact path, instantiates the Foundation store with `createDurableStore({ contracts, fsOps, native })`, canonicalizes the inventory/release/plan database arrays only through `canonicalizeDatabaseContracts`, gives terminal reads/writes only to Receipt's transaction-bound wrapper and unique publisher, invokes the host transaction/recovery entrypoints through the fixed broker, and removes/readbacks the root in `disposeAndReadBackAbsent()`. The observation is exact-key, aggregate-only, and contains no path or nested evidence.

- [ ] **Step 4: Re-run the complete test and verify GREEN**

Run:

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-integration.test.mjs
```

Expected: PASS; all seven rows execute in frozen order, every required observation is true, inventory/release/plan database bytes and `databaseContractsSha256` agree through the owner helper, both schema-only crash cases are ledger-classified, the writer attempt is processed exactly once, controller interruption does not stop host-local convergence, boot recovery resumes the selected candidate, and all seven temporary roots are absent.

- [ ] **Step 5: Add and run the zero-argument CLI**

Run: `node scripts/control-plane-host-integration.mjs`

Expected: stdout is exactly one canonical JSON line containing only `schemaVersion`, `scenarioCount`, `passedCount`, `failedCount`, `accepted`, and `contractSha256`, with scenario count `7`, passed count `7`, failed count `0`, and `accepted: true`; stderr is empty and exit is `0`. Run `node scripts/control-plane-host-integration.mjs unexpected`; expected exit `2`, one fixed safe stderr code, empty stdout, and zero fixture allocations.

- [ ] **Step 6: Commit clean integration only after RED and GREEN evidence exist**

```bash
git add scripts/control-plane-host-integration.mjs server/tests/control-plane-host-integration.test.mjs package.json
git commit -m "test: exercise host transaction recovery scenarios"
```

### Task 14: Implement The Source-Only G1a Installer Contract, Align Runbooks, And Complete Validation

**Files:**
- Create: `server/services/deployment/control-plane-host-bundle-installer.mjs`
- Create: `server/tests/control-plane-host-bundle-installer.test.mjs`
- Modify: `docs/SUBSCRIPTION_CONTROL_DATABASE.md`
- Modify: `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md`
- Modify: `docs/CLI_PRODUCTION_PROVISIONING_SOP.md`
- Modify: `docs/PRODUCTION_DR.md`
- Modify: `ops/README.md`

#### Task 14A: Implement The Source-Only G1a Host Bundle Installer Contract

**Precondition:** Integration Task 1's final `validateStagedHostBundleManifestBytes(...)`, tracked staged manifest, and content-addressed source set are committed and GREEN; Bootstrap's final `host-layout-v1.json` and `parseHostBundleContentReceipt(bytes)` are committed and GREEN. This checkpoint implements only the one-shot installer/stager source and synthetic tests. It does not run against a host, open provider access, stage content, enable a unit, or consume the user's future G1a approval.

**Interfaces:**
- Export only `createControlPlaneHostBundleInstaller(dependencies)`. It returns a frozen exact object with the sole method `installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding })`. The method requires exactly those three caller keys. `stagedManifestBytes` and `contentReceiptBytes` are owned copies bounded by their owner contracts; `approvalBinding` is the original opaque fresh-G1a capability accepted only through the external Gate owner's injected assertion. None may contain or select a source root, destination, path, logical ID, unit, credential, release, database, or provider resource.
- Production dependencies internally fix the merged-source bundle reader, the root-owned staging-directory capability, the exact Bootstrap `host-layout-v1.json` bytes, Integration's real `validateStagedHostBundleManifestBytes`, Bootstrap's real `parseHostBundleContentReceipt`, the G1a approval assertion, and Foundation native durability operations. The source reader exposes only `readExact(logicalId)` for logical IDs already enumerated by the validated manifest/layout join; the root installer exposes only `publishRootOwnedNoReplace(entry, bytes)`, `readbackExact(entry, expectedSha256)`, and `fsyncAndReadbackParents()`. The exported method accepts no dependency override.
- The installer is the sole G1a host-bundle installer/stager owner. It requires canonical byte equality among Integration's manifest entries, the Bootstrap layout's complete ordered source/destination/owner/group/mode mapping, and the content receipt's manifest/layout/content digests. It enforces the strict complete destination allowlist, root UID/GID, exact modes, regular files only, no symlink/hardlink/device/socket/FIFO, no traversal/case/Unicode collision, no undeclared/missing/duplicate entry, and no write outside the fixed disabled staging root.
- Each file publication uses the Foundation no-replace primitive with no-follow resolution, fsyncs the regular file and every newly created parent, independently reopens/lstats/readbacks the bytes/digest/size/UID/GID/mode, and then fsyncs/readbacks the complete parent chain. An already-existing byte-and-metadata-identical object may be reported only as the primitive's verified `already_equal` outcome; any drift fails without replacement. The method returns only a frozen aggregate-safe receipt `{ hostLayoutSha256, stagedHostBundleManifestSha256, hostBundleContentReceiptSha256, stagedFileCount, readbackComplete }`; it returns no path, bytes, owner identity, nonce, or capability.
- The installer cannot enable/start/reload a service or socket, write an authorized key/sudoers/environment/credential, change a release/current pointer, open a database, activate Bootstrap, publish GitHub state, or make a compatibility/production claim. It is invoked only after merge by a separately opened, fresh, exact external G1a Risk A Gate with provider inventory and approval binding. This source PR never calls `installAndReadBack` outside synthetic temporary-root tests and never stages production content.

- [ ] **Installer Step 1: Write RED manifest/layout/allowlist and durability tests**

In `server/tests/control-plane-host-bundle-installer.test.mjs`, import the real Integration manifest validator and Bootstrap content-receipt parser plus the final tracked synthetic fixture bytes. Assert the module has the sole factory export, the factory result is frozen/exact, and the method rejects missing/unknown caller keys or an unbranded/stale/cross-source approval before opening the fixed source or staging capability. Table-drive manifest/content/layout digest drift, missing/extra/duplicate/reordered entries, logical-ID/destination mismatch, owner/group/mode drift, size/digest drift, symlink/hardlink/special file, source mutation between read/readback, path traversal, case/Unicode collision, and destination outside the strict allowlist. At every file and parent fsync/readback boundary inject a crash, reconstruct against the same temporary root, and require created-or-verified-equal convergence with no replacement. Existing unequal bytes or metadata must remain untouched and fail closed.

Record the native calls for one success and require, in manifest order, root-owned no-replace publication, file fsync, independent no-follow readback, metadata readback, and parent fsync/readback for every entry before the aggregate receipt. Prove the receipt has exactly the five keys above; all source/destination selectors remain internal; and service/unit/credential/release/database/network/provider/GitHub mutation counters stay zero. Add a source scan that rejects any second installer/stager export or any call to `installAndReadBack` from a workflow, normal source-validation CLI, Bootstrap inventory handler, host transaction, or recovery path.

- [ ] **Installer Step 2: Run RED**

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-bundle-installer.test.mjs
```

Expected: module-not-found or missing-export failure only. No root/provider/production fixture is opened.

- [ ] **Installer Step 3: Implement the exact one-shot installer/stager**

Import the two owner validators rather than copying their schemas or field orders. Join the validated manifest and host layout by their complete ordered logical-ID set; derive every source and destination internally; read and re-read every source before the first root publication; then execute only the strict no-replace/fsync/readback sequence above. Zero owned input copies in the outermost `finally`, close both fixed capabilities idempotently, and map faults to bounded aggregate-safe error codes. Do not add a CLI, generic filesystem adapter, dynamic destination resolver, partial-install success, activation step, or cleanup/delete method.

- [ ] **Installer Step 4: Run GREEN and synthetic crash replay**

```bash
node --test --test-concurrency=1 server/tests/control-plane-host-bundle-installer.test.mjs
git diff --check -- server/services/deployment/control-plane-host-bundle-installer.mjs server/tests/control-plane-host-bundle-installer.test.mjs
```

Expected: pass entirely under disposable synthetic roots; every root is removed/read back absent by the test harness, and no external Gate or host action occurs.

- [ ] **Installer Step 5: Commit the source-only G1a provider**

```bash
git add server/services/deployment/control-plane-host-bundle-installer.mjs server/tests/control-plane-host-bundle-installer.test.mjs
git commit -m "feat: add gated host bundle installer contract"
```

Stop after the local source checkpoint. The later G1a operator Gate is not a task in this source plan and requires a fresh separate approval after merge.

#### Task 14B: Align Runbooks And Complete Source-Only Validation

**Interfaces:**
- Consumes from `server/services/deployment/database-contract.mjs` exactly `CONTROL_PLANE_DATABASE_LOGICAL_IDS`, `DATABASE_TERMINAL_RESULTS`, `HOST_FINAL_STATES`, `isHostFinalState`, `isCriticalHostFinalState`, `canonicalizeDatabaseContracts`, and `validateDatabaseTerminalVector`; from `server/services/deployment/writer-registry.mjs` exactly `WRITER_REGISTRY_CONTRACT`, `discoverProductionWriters`, `canonicalizeWriterRegistry`, and `verifyWriterRegistry`; and from `server/services/deployment/persisted-data-compatibility.mjs` exactly `canonicalizePersistedDataRegistry` and `verifyPersistedDataBackwardPair`. Documentation copies no enum, validator, database 14-field order, or canonical contract into executable source. `normalizeDatabaseContracts` remains database-owner/Receipt-internal; Artifact and Integration executable modules import only `canonicalizeDatabaseContracts` for inventory/release/plan equality and digest binding.
- Consumes `HOST_TRANSACTION_STAGES` from `server/services/deployment/control-plane-host-transaction.mjs`; `FIXED_SYSTEMD_OPERATIONS`, `createAcceptedTransactionBrokerClient`, `ACCEPTED_START_EVIDENCE_FIELDS`, `ACCEPTED_START_EVIDENCE_CONTRACT`, `canonicalizeAcceptedStartEvidence`, `createAcceptedStartEvidenceReader`, and `assertAcceptedStartEvidenceCapability` from `server/services/deployment/fixed-systemd-broker.mjs`; `createControlPlaneHostInventoryReaders` and `assertControlPlaneHostInventoryReaders` from `server/services/deployment/control-plane-host-inventory-readers.mjs`; `HOST_RECOVERY_PHASES`, `createCriticalPostPublicationProofReader`, and `assertCriticalPostPublicationProof` from `server/services/deployment/host-recovery.mjs`; `createControlPlaneHostBundleInstaller` from `server/services/deployment/control-plane-host-bundle-installer.mjs`; and `CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS` plus `runAllControlPlaneHostIntegrationScenarios` from `scripts/control-plane-host-integration.mjs`.
- Consumes the Receipt Task 2 checkpoint that imports Host Task 1's exact Host-state predicates/`validateDatabaseTerminalVector`, plus `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })` from `server/services/deployment/control-plane-terminal-closeout-store.mjs` and `createHostTerminalPublisher` from `server/services/deployment/control-plane-host-terminal-publisher.mjs`; Bootstrap's accepted-plan/admission publication, `createAcceptedArtifactConsumer` from `server/services/deployment/control-plane-accepted-artifact-handoff.mjs`, `createControllerCloseoutStore(...).registerPendingLease(...)` from `server/services/deployment/control-plane-controller-closeout-store.mjs`, `createBootstrapMaintenanceCoordinator(...)`, owner replay-ledger `bindTerminal`/protected-nonterminal listing, and ordinary-status consumption of Host's branded critical post-publication proof; and Foundation's `createDurableStore({ contracts, fsOps, native })` from `server/services/deployment/durable-store.mjs`. Receipt alone performs the independent fixed-object read and digest validation; Bootstrap alone owns replay quota/retention/compaction and the controller-facing ordinary-status brand; Task 14 documents no alternate Host reader, installer, or compactor.
- Produces in `docs/SUBSCRIPTION_CONTROL_DATABASE.md`: the fixed ordered database pair, owner-only `canonicalizeDatabaseContracts` byte/digest authority, inventory/release/plan byte equality and `databaseContractsSha256` binding, explicit existing-schema startup, actual-handle identity/custody, coherent pair backup, four terminal results, additive ledger authority, and separately gated database-restore semantics.
- Produces in `docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md` and `docs/CLI_PRODUCTION_PROVISIONING_SOP.md`: the exact three guarded business-mutation entrypoints, validate-only legacy schema CLIs, two capability-only migration entrypoints, closed writer registry, guard/lease behavior, and no caller-selected production path/unit/command.
- Produces in `docs/PRODUCTION_DR.md`: five host terminal states, code-only automatic rollback, prohibition on automatic database restore, critical fencing, lost-runner/boot recovery, and the later database-recovery Risk A Gate.
- Produces in `ops/README.md`: the eight-stage transaction, seven-phase recovery chain, fixed systemd broker, branded fixed-source inventory readers, phase-specific sandbox ownership, seven-scenario source-only validation, the source-only G1a installer contract, and the statement that no host installation or production authority is created by this PR. It names the post-merge fresh G1a Risk A Gate as the only place that may invoke the installer.
- Produces for the rollout/docs integration owner this exact aggregate handoff, copied as a review checklist rather than a new source file: `{ databaseLogicalIds: CONTROL_PLANE_DATABASE_LOGICAL_IDS, databaseContractCanonicalizer: "canonicalizeDatabaseContracts", databaseContractsCanonicalBytesEqualAcross: ["inventory", "release", "plan"], databaseContractsSha256: canonicalizeDatabaseContracts(databaseContracts).sha256, writerCount: 9, databaseTerminalResults: DATABASE_TERMINAL_RESULTS, hostFinalStates: HOST_FINAL_STATES, deployTrigger: "manual_deploy_click", postApprovalAutomation: ["deploy", "validate", "code_rollback"], automaticDatabaseRestore: false, databaseRestoreAuthority: "separate_risk_a_gate_only", sourcePrProductionAuthority: false }`. The arrays are references to the owner exports for review rendering, not new executable enums; the digest expression means the exact 64-lowercase-hex helper output for the reviewed pair, never a copied literal or separately serialized value. The rollout/docs integration plan is the sole owner of `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`; this task consumes that path read-only and does not stage it.
- Produces these exact success outputs: writer verification writes one canonical line with exactly the ordered keys `writerCount`, `writerRegistrySha256`, and `verified`, values `9`, a 64-lowercase-hex digest, and `true`; host integration writes one canonical line with exactly the ordered keys `schemaVersion`, `scenarioCount`, `passedCount`, `failedCount`, `accepted`, and `contractSha256`, values `"1"`, `7`, `7`, `0`, `true`, and a 64-lowercase-hex digest. Both keep stderr empty and exit `0`. Focused tests and `npm test` exit `0`; `git diff --check origin/master...HEAD` exits `0` with no output. Any CLI failure emits only its fixed safe code and no raw evidence.
- Consumes `docs/DEPLOYMENT_FLOW.md` read-only as superseded historical AWS material; it is neither current Japan execution authority nor a modification/staging target.

- [ ] **Step 1: Update documentation to current source behavior**

Apply the produced semantics above to their owning files. Across the five files, document `candidate-start.mjs` as the only production application path; exact-pair persisted-data compatibility and the compatibility-baseline requirement; the Host-owned branded read-only inventory pair; and source PR, G1a root-owned no-replace staging, host-bundle activation, fresh inventory, Artifact Gate, Production Gate, manual Deploy click, automated deploy/validate/code-rollback, and final read-only validation as separate approvals/outcomes. State that the installer source exists but has not been invoked and that G1a requires a fresh external Risk A Gate. Include the exact rollout handoff block in the Draft PR review notes for the rollout/docs owner; do not create another handoff file or edit its runbook.

Do not state that GitHub production deployment is enabled, that a host bundle is installed, that the previous release is compatible, or that production databases have a particular schema. Those remain fresh-inventory facts.

- [ ] **Step 2: Run all new focused tests**

```bash
node --test --test-concurrency=1 server/tests/control-plane-database-foundation-contract.test.mjs server/tests/control-plane-database-contract.test.mjs server/tests/control-plane-sqlite-schema-identity.test.mjs server/tests/control-plane-database-capability-custody.test.mjs server/tests/control-plane-database-binding-session.test.mjs server/tests/control-plane-writer-admission.test.mjs server/tests/control-plane-writer-registry.test.mjs server/tests/control-plane-sqlite-backup-pair.test.mjs server/tests/control-plane-host-transaction-journal.test.mjs server/tests/control-plane-sqlite-migration-runner.test.mjs server/tests/control-plane-persisted-data-compatibility.test.mjs server/tests/control-plane-database-transaction.test.mjs server/tests/control-plane-accepted-artifact-handoff.test.mjs server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-host-transaction-database.test.mjs server/tests/control-plane-fixed-health-validator.test.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-host-recovery.test.mjs server/tests/control-plane-host-systemd-contract.test.mjs server/tests/control-plane-host-integration.test.mjs server/tests/control-plane-host-bundle-installer.test.mjs
```

Expected: pass.

- [ ] **Step 3: Run existing database/writer regressions**

```bash
node --test --test-concurrency=1 server/tests/subscription-repository.test.mjs server/tests/platform-subscription-control-db.test.mjs server/tests/state.test.mjs server/tests/coin-commerce-production-entry.test.mjs server/tests/platform-coin-wallet-migrations.test.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs server/tests/platform-coin-commerce-migrations.test.mjs server/tests/platform-payment-store-migrations.test.mjs server/tests/platform-account-resource-authority-migrations.test.mjs server/tests/platform-account-resource-authority-commerce-migrations.test.mjs server/tests/platform-coin-wallet-schema-cli.test.mjs server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs server/tests/platform-coin-commerce-schema-cli.test.mjs server/tests/platform-account-resource-authority-schema-cli.test.mjs server/tests/platform-issue-subscription-cli.test.mjs server/tests/platform-issue-portal-entry-cli.test.mjs server/tests/platform-issue-portal-initial-account-cli.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/mihomo-connection-delta-usage-sidecar.test.mjs server/tests/platform-lead-retention-operations.test.mjs server/tests/edge-material-handoff-preflight.test.mjs server/tests/gccgw-install-bootstrap-cli.test.mjs server/tests/cli-router.test.mjs server/tests/environment-foundation.test.mjs
```

Expected: pass.

- [ ] **Step 4: Verify canonical registry, package, and full suite**

```bash
node scripts/control-plane-writer-registry.mjs --verify --source-root . --declaration ops/control-plane-deploy/writer-registry.sources.json
node scripts/control-plane-host-integration.mjs
npm test
npm pack --dry-run
git diff --check origin/master...HEAD
git status --short --branch
```

Expected: registry writer count `9`; integration `7/7`; full tests pass; package dry-run contains every declared runtime/schema/systemd/script file and no test fixture/credential; diff check passes; only intended source-PR files are changed.

- [ ] **Step 5: Run clean target-matching Linux validation**

Use the exact Node ABI, architecture, libc, kernel features, filesystem, and offline-built `better-sqlite3`/native layer selected by the fresh inventory contract. Re-run Task 0, all new focused tests, the zero-argument integration harness, package verification, power-loss/fsync fault suite, `systemd-analyze verify`, and every real denied path/unit/database/syscall/address-family profile from Tasks 11-12. No production secret, route, config, row, or host is used.

- [ ] **Step 6: Run exact-head CI, CodeQL, and independent review**

Keep the PR Draft until exact-head CI, CodeQL, offline native/package verification, semantic review, and security review pass. The PR body must state `identity_impact: false`, `dataCompatibilityImpact: false`, `release_unit: control-plane-app`, source-only scope, no production access, and the remaining compatibility/bootstrap/inventory/Artifact/Production Gates.

- [ ] **Step 7: Commit runbook alignment**

```bash
git add docs/SUBSCRIPTION_CONTROL_DATABASE.md docs/OPERATOR_CLI_PLATFORM_BOUNDARY.md docs/CLI_PRODUCTION_PROVISIONING_SOP.md docs/PRODUCTION_DR.md ops/README.md
git commit -m "docs: align control plane transaction runbooks"
```

## Dependency Order And PR Boundary

1. Foundation completes its native, canonical JSON, and durable-store checkpoint on this same source-only Draft branch. A missing export or failed actual-handle/WAL/OFD/SCM_RIGHTS target-Linux proof stops the DAG; no inter-slice merge is required.
2. Host Tasks 0-1 complete and export the database contract owner plus `canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }`.
3. Integration Task 2 consumes that helper for its contract checkpoint.
4. Artifact Tasks 1-2 consume that helper for inventory/release/plan canonical-byte equality and `databaseContractsSha256`; they do not import `normalizeDatabaseContracts` or copy the private 14-field order.
5. Bootstrap Tasks 1-8 complete their pre-acceptance custody and durable ingress checkpoints.
6. Host Tasks 2-10 complete explicit schema startup, actual-handle custody, the closed writer set, coherent backup, migration evidence, journal, persisted-data compatibility, and database orchestration.
7. Receipt Tasks 1-3 import Host Task 1's exact `HOST_FINAL_STATES`, predicates, database terminal enum, and `validateDatabaseTerminalVector` without copying them; Receipt Task 2 records that checkpoint and establishes the Receipt-owned transaction-bound closeout store and unique terminal publisher contracts.
8. Artifact Tasks 3-8 complete the artifact, plan, manifest, and pre-broker workflow checkpoints.
9. Only Host Task 11A runs next: write provider-only RED tests, implement the closed broker provider and sole branded fixed-source host-inventory reader pair, obtain provider-only GREEN plus real denial/zero-mutation evidence, and commit exactly its seven provider files. This independently committable checkpoint imports neither Bootstrap Task 9/10 nor Receipt Task 4 consumers.
10. Bootstrap Tasks 9-10 consume the narrow `startAcceptedTransaction({ transactionId, invocationSha256 })` provider and its `canonicalizeAcceptedStartEvidence` export; accept/assert the exact original `createControlPlaneHostInventoryReaders(...)` pair for router injection; durably publish/read back the accepted plan/admission/source objects plus the provider-owned four-field projection; and establish the accepted-artifact consumer, replay-ledger owner, maintenance coordinator, plus controller closeout store. Bootstrap does not implement a second projection contract, broker reader, or inventory provider.
11. Receipt Task 4 integrates its Bootstrap-bound closeout lease/index contract.
12. Artifact Tasks 9-10 consume those accepted/closeout contracts.
13. Resume Host Task 11B and then Host Tasks 12-13. They compose `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`, the Receipt-owned six-dependency publisher with the same `bootstrapMaintenance` and `admissionReplayLedger` references on normal/recovery/critical paths, Bootstrap accepted-plan/accepted-artifact/closeout exports, and the already committed broker; Task 12 additionally exports `createCriticalPostPublicationProofReader` plus `assertCriticalPostPublicationProof` and completes the actual-provider 1,024/1,025 three-path matrix. They do not modify the provider checkpoint, inject a publication-time terminal reader, or implement replay quota/retention/compaction.
14. Receipt Tasks 5-8 complete recovery/terminal receipt validation and final-status consumers. Their publication validator continues to accept the critical finalizer's held-lease evidence, while their later final-status path requires the unchanged Bootstrap private status brand that is issued only after Bootstrap accepts Host's critical post-publication proof brand.
15. Artifact Tasks 11-13 complete receipt/result and rollback-aware workflow integration.
16. Bootstrap Task 11 completes its final cross-owner contract checkpoint: its ordinary-status store constructs the exact Host `createCriticalPostPublicationProofReader(...)`, calls `readAndVerify({ transactionId, expectedCriticalIdentityFenceSha256 })` only for the critical Host state, passes the returned reference unchanged to `assertCriticalPostPublicationProof`, and creates no controller-facing terminal/status brand before that succeeds. It imports `HOST_FINAL_STATES`/predicates for replay terminal binding and compaction, never copies the five-state array, and leaves normal four-state runtime/custody readback semantics intact.
17. Integration Tasks 1 and 3 complete their remaining pre-document source integration checkpoints, including the final tracked staged manifest/validator consumed by Host Task 14A.
18. Host Task 14A implements/tests the sole source-only G1a installer against Integration's final manifest/content and Bootstrap's host layout without invoking it; Task 14B provides database/host terminal semantics and the rollout handoff without editing the rollout owner's deployment runbook.
19. Integration Tasks 4-9 complete the source-only Draft PR, including the full cross-plan harness and review gates.

The sequence above is the only execution order: Receipt work is split at Tasks 1-3 and Task 4, and no combined Receipt prerequisite may delay the independently GREEN Task 11A broker/inventory provider checkpoint. Host Task 14A waits for Integration Task 1 and cannot become an early or alternate manifest owner. Artifact/workflow integration consumes the database-owned canonical `writer-registry.json`; it must not create the writer-registry module, CLI, schema, or test. For database contracts, Artifact and Integration import only `canonicalizeDatabaseContracts`, apply it independently to inventory/release/plan values, require exact helper-byte equality, carry only the helper-returned normalized pair, and bind one identical `databaseContractsSha256`; they must not copy the private contract or 14-field order. A count-only, arbitrary-two-ID, local field-order, or `JSON.stringify` check is insufficient and must fail its checkpoint.

The implementation release cannot serve as its own first automatic rollback baseline. If the installed previous release lacks the canonical writer/lease/guard/persisted-data contract, a separate approved compatibility artifact/manual deployment Gate must establish and validate that baseline before automatic deployment is eligible. Host installation/activation, credential setup, fresh inventory, durable Artifact Gate publication, manual Deploy click, Environment approval, production execution, and Deploy Note are later Risk A operations outside this PR.

## Design Blockers And High-Risk Assumptions

- **Native actual-handle feasibility:** `better-sqlite3` has no public existing-FD/actual-main-FD API. Foundation must prove the exact target mechanism including WAL/SHM and unique main-handle binding. Failure is a hard stop, not permission to use a path assertion.
- **One shared control connection:** current state opens base control plus optional wallet/commerce/payment connections by path. The refactor must preserve transaction ownership, close ordering, feature-gated validation, and concurrency behavior on one borrowed connection.
- **Implicit DDL:** runtime always creates tables; control defaults to create and performs `ALTER TABLE` through `ensureTableColumns`. Any remaining production call to those branches violates the design even when DDL is idempotent.
- **Existing ledger compatibility:** multiple nested validators require the exact three-column `platform_schema_migrations`. Altering it would break current schema evidence; use the separate deployment ledger.
- **Cross-file partial commit:** there is no atomic two-database commit. The first-commit/second-failure vector and schema-only previous-release terminal are mandatory.
- **Backup durability:** SQLite backup completion alone is insufficient. Target filesystem file fsync, rename, directory fsync, final reopen, pair-manifest durability, and power-loss simulation must pass.
- **Writer completeness:** current source lacks tracked base templates for some production auxiliary units and contains path-capable proof/restore/package helpers. Static source discovery plus fresh active/dormant host join must both pass; current process absence is not evidence.
- **Operator double-open:** `platform-issue-subscription` currently opens an explicit control store and then constructs runtime state, which can open another fallback control database. The adapter must inject both exact sessions.
- **Persisted meaning:** additive DDL does not prove rollback safety. Any new enum/JSON/lifecycle interpretation absent from the exact-pair registry makes automatic rollback ineligible.
- **Critical receipt completeness:** do not invent a fifth per-database terminal value for unreadable/partial state. Mark the vector incomplete, retain the critical fence, and allow only the state-specific critical receipt path after every other writer/handle is quiescent while the active external finalizer holds/readbacks both exclusive leases and the unchanged fence through publication. Lease-free/finalizer-inactive evidence belongs only to the later independent ordinary status.
- **Automatic restore prohibition:** legacy `restore-subscriptions.sh` directly overwrites one database. It cannot be part of this deployment transaction. Any future restore needs a separately approved recovery design for both logical databases and all post-candidate writes.
- **Fresh inventory:** historical paths, unit state, database shape, Node ABI, and runtime facts may be stale. No source test or prior record substitutes for the later read-only inventory and exact Production Gate.
