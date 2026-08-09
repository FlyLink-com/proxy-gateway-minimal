# GitHub Control-Plane Receipt Recovery And Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement canonical Japan control-plane terminal receipts, normal GitHub controller closeout, and a separately approved read-only receipt-recovery workflow that can publish one durable recovered result without reusing production approval, mutating the host, or rewriting the original Actions run.

**Architecture:** The host owns terminal truth and a separate monotonic closeout record; an ordinary bounded status names one immutable terminal-bundle digest/size, and the original controller retrieves that exact bundle through Bootstrap-owned 768-byte read-only chunks on the same sealed transport before validating its Receipt-owned canonical bytes. The controller then uploads one immutable `controller_closeout` payload, verifies the Actions artifact, acknowledges the host, and independently reads the committed closeout state. A distinct manual recovery workflow first proves the exact failed original attempt through read-only Actions APIs, obtains a volatile host challenge, mints challenge-audience OIDC, and reads one retained record through the current parser registry. A no-secret publisher job revalidates the recovered artifact and resumes one immutable Release-asset/attestation pair. All JSON byte parsing and hashing come from the shared canonical JSON foundation, and all GitHub publication comes from the shared immutable publisher.

**Tech Stack:** Node.js ESM, Node test runner, strict canonical UTF-8 JSON, JSON Schema, GitHub Actions workflow YAML, GitHub Actions REST API, GitHub OIDC, the existing fixed SSH forced-command boundary, and the shared database terminal-vector validator.

## Global Constraints

- Risk: A, because this slice defines production closeout authority, recovery authentication, receipt schemas, and a protected workflow. This implementation remains source-only and grants no production execution approval.
- Process: implement every task RED -> observed expected failure -> minimal GREEN -> focused regression -> dedicated commit, then run the complete local validation matrix. Do not dispatch either deployment or recovery, request a protected Environment approval, access a production host, publish a Release, create an attestation, or write a Deploy Note while executing this plan.
- Expected PR count: 1 source-only Draft PR slice containing these modules, schemas, workflow source, and tests. Keep it in the same implementation PR as the foundation/host/database/GitHub-publisher slices; do not open a second receipt-recovery PR.
- Validation: focused Node tests listed per task, the combined receipt/recovery suite, `npm test`, and `git diff --check origin/master...HEAD`. GitHub-hosted CI, CodeQL, protected dry-run, and production execution are later gates and are not substitutes for these local checks.
- Production/AWS impact: none during implementation. `production_state: not_deployed`; `release_unit: control-plane-app`; `identity_impact: false` for this controller-only slice.
- Execute `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md` and Host/DB Tasks 0-10 first in the same source branch. Tasks 1-3 consume only Foundation's canonical JSON/durable-store contracts and Host/DB's frozen database contract; they do not import Bootstrap Task 9 host-protocol code or require Artifact Task 7's publisher to exist.
- Execute Bootstrap Tasks 9-10 before Task 4. Task 4 is the first Receipt task allowed to check or import `server/services/deployment/control-plane-host-protocol.mjs`; it also consumes the already completed Bootstrap transport contract and must not copy their request-type enum, transition tuple, audience grammar, response codec, or sealed-descriptor transport.
- Execute Host/DB Tasks 11-13 and Artifact Task 7 before Task 5. Tasks 5-8 may then consume the completed host terminal/recovery integration evidence and `scripts/github-immutable-release-publisher.mjs`; they must not create another Host reader, SSH route, Release/asset/attestation client, or publication state machine.
- The recovery confirmation phrase is exactly `recover japan control-plane receipt`. Case changes, surrounding whitespace, Unicode lookalikes, line breaks, and any fifth dispatch input are rejected.
- The recovery workflow dispatch surface contains exactly `controller_recovery_id`, `original_run_id`, `original_run_attempt`, and `confirmation`.
- The recovery workflow never reads the repository artifact-retention setting. That endpoint requires repository Administration read authority and is outside this least-privilege contract.
- Every recovery artifact upload fixes `retention-days: 35`. A present original artifact is eligible only when its Actions artifact response has one exact `created_at`, `expires_at`, and `digest`, the expiry is in the future, and `expires_at - created_at >= 35 days`.
- The normal production workflow's original `controller_closeout` upload also fixes `retention-days: 35`; Artifact Task 12 implements that exact workflow setting, while Integration Task 6 only verifies the already committed owner bytes and real tests without changing them. The repository default is never substituted.
- Actions artifact `digest` is the archive digest in exact form `sha256:<64 lowercase hex>`. It is never compared directly with the canonical JSON payload SHA-256. The downloaded archive must contain exactly one expected file; that file is canonical-validated and separately hashed as `payloadSha256`.
- The 24-hour recovery window uses only the attempt-specific `updated_at` returned for `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}` after `status === "completed"` and an allowed closed conclusion. `run_started_at`, `created_at`, workflow-level latest-attempt metadata, artifact timestamps, and host terminal time never substitute for attempt `updated_at`.
- Allowed original native conclusions are exactly `cancelled`, `failure`, `timed_out`, `stale`, and `startup_failure`. Reject `success`, `neutral`, `skipped`, `action_required`, `null`, an in-progress status, another attempt, an unknown conclusion, a future `updated_at`, or age greater than 24 hours.
- An immutable uploaded `controller_closeout` payload that contains a host terminal receipt always binds that receipt's initial `controllerCloseoutArtifactState: not_started`. It is never rewritten after upload. A no-transaction admission response has no host lease and uses `null`; only the separate host closeout record may transition `not_started -> upload_started -> upload_committed_observed` through exact monotonic CAS.
- The original controller artifact name is exactly `control-plane-controller-closeout-{controllerRecoveryId}-{originalRunId}-{originalRunAttempt}`. Its archive contains exactly one file named `controller-closeout-{payloadSha256}.json`.
- The original closeout sequence is fixed for a validated terminal branch only: validate one ordinary terminal status; on that same Bootstrap transport retrieve its exact named terminal bundle through contiguous 768-byte read-only chunks and validate the receipt/outer record/initial closeout/lease/index tuple; remove and read back raw/candidate/secret-linked temporary files; use the Bootstrap-owned full tuple/audience/frame builders to mint a fresh `upload_started` transition-specific OIDC assertion; send `status_closeout_upload_started` through the transport's `.request(...)`; upload the immutable payload; read back exact Actions artifact metadata and downloaded payload; delete and read back the runner payload file; mint a distinct `upload_committed_observed` assertion through the same Bootstrap contract; send `status_closeout_ack` through `.request(...)` and validate that complete ACK envelope; then issue a separate read-only ordinary `status` request and validate its independently read-back host closeout state as `upload_committed_observed`. The immutable controller payload continues to bind the initial `not_started` record; only the host record advances by CAS. The Artifact controller closes the one transport in its outer `finally`. A no-claim branch performs neither bundle retrieval, host transition, fixed-tag reservation, nor committed-state readback.
- The host local finalizer alone may attach an overdue unacknowledged closeout after the fixed 120-second deadline. Receipt recovery never starts the finalizer, resets the deadline, changes lease state, sends closeout ACK, or performs a journal/lease CAS.
- `controller_closeout_pending` is valid only before the exact acknowledgement deadline. `controller_closeout_acknowledged_released` requires matching `upload_committed_observed` evidence. `controller_closeout_abandoned_attached` requires deadline expiry, durable terminal attachment, inactive finalizer, and exact terminal/lease binding. An overdue unattached lease never yields a normal or recovered production claim.
- Terminal publication and final controller validation are different observation points. For `critical_manual_intervention_required`, the immutable terminal receipt proves publication while the external finalizer is still active and holds both exclusive business/global-identity leases under the unchanged critical fence. Receipt validation must not require those transient authorities to be inactive/free at publication. Only after publication may Bootstrap's ordinary-status reader call Host `createCriticalPostPublicationProofReader(...).readAndVerify(...)`, pass that same private-branded reference through `assertCriticalPostPublicationProof(...)`, and issue its own private ordinary-status brand. The Receipt final validator accepts that unchanged transitive brand only for the critical row; it never accepts serialized proof fields or adds them to the terminal receipt. Non-critical rows follow Bootstrap's frozen ordinary-status state matrix and do not manufacture or require the critical proof. The terminal bundle and the state-appropriate later ordinary status are both mandatory; neither substitutes for the other or rewrites the receipt.
- Recovery does not have a fixed host-request count. On one Bootstrap transport with exact frozen surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`, it sends `status_recover_challenge` and `status_recover` through `.request(...)`; those responses yield only the current private-branded terminal selector/digest, never retained Receipt bytes and never a terminal-bundle-reader brand. Receipt passes that exact recovery brand only to Bootstrap `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })`, which returns `{ requestBytes, expected }` with exact expected `{ requestId, gateId, deploymentPlanSha256, transactionId }`. The controller sends that ordinary status request through the same `.request(...)` and passes only successful `responseBytes` plus `expected` to `validateStatusResponseFrame`; a critical/post-finalizer response that is not yet eligible is polled with bounded fresh request IDs until immutable terminal or the fixed deadline, never locally rebranded. Only the resulting Bootstrap ordinary-status brand may enter `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs: 30000 })`, whose single `.requestStatusBundle(...)` operation authenticates once and internally consumes one through at most 342 contiguous 768-byte frames for a maximum 262,144-byte bundle. Critical eligibility therefore transitively includes Host `assertCriticalPostPublicationProof`; non-critical rows follow the frozen ordinary-status matrix without that Host proof. The workflow controller closes the same transport in one outer `finally`. The volatile challenge is root-HMAC authenticated, rate-limited, and expires after 60 seconds without persistence; challenge/status select exactly one retained terminal identity and perform no retained-state mutation.
- Recovery uses the current protected deploy material only through one transport-owned call to `secretMaterializer.materializeFixedCredential("japan-control-plane-github-deploy-v1")` after the frozen Linux capability vector is fully true. `materializeFixedCredential` is the materializer's only method; it returns exactly frozen `{ material, expectation }`. `material` has Bootstrap's exact eleven `FIXED_CREDENTIAL_MATERIAL_FIELDS`; `expectation` has the exact eight `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, is created only by `createFixedCredentialExpectation({ credentialId, authorizationGeneration, bootstrapReceiptSha256, knownHostsFingerprint, knownHostsTupleSha256, expiresAt, observedAt })`, and carries Bootstrap's private brand. The producer derives the real known-host binding with `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, calls `assertKnownHostsRecordExpectation({ binding, material })`, then `validateFixedCredentialMaterial(material, expectation)`; it never supplies `principal`, `user`, `now`, `expiresAfter`, or a raw/cloned expectation. Bootstrap captures/seals that one producer original, zeroes its mutable Buffers in the capture `finally`, creates a fresh non-aliased clone for every actual `.request(...)`/`.requestStatusBundle(...)` operation, zeroes/closes each operation clone, and zeroes/closes retained originals on idempotent `.close()` in the controller's outer `finally`. Recovery must not rematerialize, cache/clone the credential itself, or define another dispose function. `materializeDeploy`, `materializeBootstrap`, caller-selected activation/key selectors, and a second Environment materialization are forbidden. No recovery controller function reads or passes host, port, username, private-key bytes, or known-hosts bytes. Any false or unknown first capability probe stops before materialization with materializer-call and Environment-read count zero. Recovery does not define a second key, read `JAPAN_CONTROL_DEPLOY_BINDING_KEY` or `JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY`, or accept an old bootstrap generation.
- Recovery never sends `execute_auth`, `status_closeout_upload_started`, or `status_closeout_ack`; never starts/stops a service; never changes a pointer, database, journal, guard, permit, backup, release, credential, or host record; and never selects a second retained record.
- Receipt recovery never owns the four-minute host transaction-recovery clock or phase graph. It consumes only Host-owned terminal evidence. Host must first read and validate the persisted recovery phase; after the durable deadline expires, only an exact ordinary nonterminal phase -> `record_critical` edge or persisted `critical_finalize_pending` -> external `finalize_critical` edge is permitted. Every other expired edge rejects before broker, release, database, pointer, receipt, or recovery-publication work, and reboot tests prove the original deadline is not reset.
- Before normal finalize, Host recovery finalize, or external critical finalize publishes any Receipt-owned terminal/closeout object, the composition must call only Bootstrap `createBootstrapMaintenanceCoordinator({ native, clock }).runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })`. That capability-gated coordinator holds/readbacks its one fixed global maintenance lock, captures one owner clock value, and drives only Bootstrap's deterministic CAS compactors; Receipt/Host never call `compactEligible` or supply a capability/time/digest directly. Closeout-index compaction protects every entry younger than 35 days, every active/nonterminal entry, the newest terminal for each target, the newest critical terminal, every parser-required terminal, and every transaction protected by recovery. A full protected index fails closed. Replay 128/129 and closeout-index 1,024/1,025 boundaries, stale CAS, crash before/after either CAS, restart, and concurrent preflight are owner-conformance tests before publication can continue.
- The workflow path is exactly `.github/workflows/control-plane-receipt-recovery.yml`, it runs only from protected current `refs/heads/master`, and every challenge binds the workflow path/ref/SHA, current source commit, GitHub-hosted runner, `workflow_dispatch`, Environment `vultr-japan-production`, current bootstrap tuple, current recovery controller digest, and current parser-registry digest.
- Workflow-source checks are defense in depth, not proof of GitHub Environment configuration. Capability remains disabled until a separate GitHub settings Gate proves required reviewers, self-review prevention, and protected-branch-only deployment for `vultr-japan-production`.
- The original run evidence must identify workflow path `.github/workflows/japan-control-plane-production-deploy.yml`, the exact repository/owner, `workflow_dispatch` event, protected `master` ref, head SHA, run ID, and run attempt indexed by the retained host record. A completed non-success run from another workflow, repository, ref, commit, or attempt is ineligible.
- Deployment, recovery, and bootstrap rotation share concurrency group `japan-control-plane-production-authority` with `cancel-in-progress: false`.
- The protected recovery job permissions are exactly `actions: read`, `contents: read`, `attestations: read`, and `id-token: write`. It has no repository write permission.
- The isolated recovered-result publisher job has no Environment, SSH material, production OIDC audience, or host route. Its permissions are exactly `actions: read`, `contents: write`, `id-token: write`, and `attestations: write`.
- Normal closeout imports two non-interchangeable Bootstrap-owned OIDC transition bindings. `upload_started` binds its current closeout-record digest and has `actionsArtifactObservationSha256: null`; `upload_committed_observed` binds the post-upload observation digest. Each binding includes the same full repository/workflow path/ref/SHA/Environment/run/attempt/controller-recovery/terminal/expected-closeout tuple and has a distinct audience, token, and verified JTI. Source identity remains transitively bound by the immutable terminal receipt and Deployment Plan and is not duplicated in this transition tuple. Neither token nor JTI is persisted in a receipt, artifact, diagnostic, or summary. Recovery OIDC remains challenge-audience status-only and can never satisfy either closeout transition.
- No-claim states create only a run-attempt-scoped `recovery_attempt_no_claim` artifact. They create no fixed tag, Release asset, attestation, Deploy Note, original-run update, or reservation of a later validated result.
- A validated recovered result uses tag `control-plane-recovered-closeout-{controllerRecoveryId}` and a filename derived from the recovered canonical payload SHA-256. Conflicting or multiple assets/attestations fail closed; a single exact missing half resumes only that half.
- Each logical database capability handoff is Host/Foundation-owned and contains exactly two `SCM_RIGHTS` descriptors in order: `databaseFd`, then `identityLeaseFd`. Receipt serializes only the aggregate result returned by Host's exact `validateDatabaseTerminalVector(...)`; it never accepts a third descriptor, copies the database state matrix, opens a database, or treats an FD/path as receipt evidence.
- Raw SSH stdout/stderr, OIDC tokens, private keys, known-host contents, host paths, environment values, config, URLs, PIDs, database rows, customer data, and credentials never enter artifacts, logs, summaries, errors, fixtures, or test snapshots.
- Do not modify `bin/gccgw.mjs`, add a user-facing local CLI command, add a dependency, change an Admin/Portal source file, or alter production configuration. The scripts in this plan are workflow-only entrypoints.

---

## Execution Preconditions

Before Task 1, prepare the clean implementation worktree from current `origin/master`, complete Foundation plus Host/DB Tasks 0-10 in the same branch, and run:

```powershell
git fetch origin
git rev-parse origin/master
git merge-base HEAD origin/master
git status --short --branch
Test-Path server/services/deployment/canonical-json.mjs
Test-Path server/services/deployment/durable-store.mjs
Test-Path server/services/deployment/database-contract.mjs
```

Expected:

- the branch is the one source-only Draft PR branch based on the observed current `origin/master`;
- the worktree contains only the already reviewed design/plan and prerequisite source commits;
- all three `Test-Path` commands return `True`; and
- no production workflow is running under the shared concurrency group.

If one of these three prerequisite files is absent or has a different export surface than the Interfaces below, reconcile Foundation or Host/DB Tasks 0-10 before writing compatibility code. Do not advance Bootstrap/Artifact work early and do not add a local substitute.

## File Map

**Create:**

- `server/services/deployment/control-plane-receipt-contract.mjs` — closed state algebra, host receipt/record/closeout and canonical terminal-bundle validation, state mapping, and safe validation errors.
- `server/services/deployment/control-plane-receipt-parser-registry.mjs` — exact schema/parser lookup and retained-record coverage checks.
- `server/services/deployment/control-plane-terminal-closeout-store.mjs` — Receipt-owned, transaction-bound, fixed-logical-object terminal/initial-closeout durable writer and reader.
- `server/services/deployment/control-plane-host-terminal-publisher.mjs` — Bootstrap-maintenance-gated deterministic terminal body/outer-record/initial-closeout/lease/index publication with crash-boundary replay.
- `server/services/deployment/control-plane-controller-closeout.mjs` — immutable controller payload, separate Actions artifact observation, and canonical controller final-status construction/validation.
- `server/services/deployment/control-plane-controller-closeout-adapter.mjs` — Receipt-owned granular adapter consumed by the Artifact-owned production controller; it owns validation of Bootstrap-returned terminal-bundle bytes, closeout validation, transition frames, runner-local evidence, and exact Actions artifact readback, but not the production controller, chunk reader, or transport.
- `server/services/deployment/control-plane-receipt-recovery.mjs` — recovery ID/input validation, attempt eligibility, artifact state classification, challenge/selector/bundle/final-status orchestration, and recovered/no-claim envelopes.
- `scripts/control-plane-controller-closeout.mjs` — workflow-only normal-closeout codec/validator entrypoint.
- `scripts/control-plane-receipt-recovery-controller.mjs` — workflow-only preflight and bounded authenticated read-only recovery entrypoint.
- `scripts/control-plane-recovered-closeout-publisher.mjs` — fixed-envelope adapter over the shared immutable publisher.
- `.github/workflows/control-plane-receipt-recovery.yml` — manual preflight, independently approved protected recovery, artifact upload, and isolated publication jobs.
- `schemas/control-plane-host-terminal-receipt-v1.schema.json` — immutable inner host terminal receipt.
- `schemas/control-plane-host-terminal-record-v1.schema.json` — outer replay/receipt-digest binding.
- `schemas/control-plane-host-closeout-record-v1.schema.json` — separately CAS-updated artifact state/disposition record.
- `schemas/control-plane-controller-closeout-v1.schema.json` — immutable original controller closeout payload.
- `schemas/control-plane-controller-final-status-v1.schema.json` — aggregate-only terminal/no-claim controller output consumed unchanged by the controller CLI and Deploy Note.
- `schemas/control-plane-receipt-recovery-challenge-v1.schema.json` — safe volatile challenge response envelope.
- `schemas/control-plane-recovered-closeout-v1.schema.json` — canonical validated recovered result.
- `schemas/control-plane-recovery-attempt-no-claim-v1.schema.json` — attempt-scoped diagnostic with no publication authority.
- `server/tests/helpers/control-plane-receipt-fixtures.mjs` — synthetic aggregate-safe canonical fixtures.
- `server/tests/control-plane-receipt-contract.test.mjs` — schema, canonical byte, terminal-bundle, parser registry, terminal matrix, and binding tests.
- `server/tests/control-plane-terminal-closeout-store.test.mjs` — transaction binding, fixed logical-object surface, fsync/readback, replay, and cross-transaction rejection tests.
- `server/tests/control-plane-host-terminal-publisher.test.mjs` — normal/recovery/critical publication ordering, Bootstrap index registration, crash replay, and mismatch tests.
- `server/tests/control-plane-controller-closeout.test.mjs` — result mapping, immutable payload, final-status schema, controller-output-to-Deploy-Note fixture, and artifact-observation tests.
- `server/tests/control-plane-controller-closeout-adapter.test.mjs` — exact adapter surface, Bootstrap terminal-bundle reader conformance, Receipt bundle validation, transition-specific OIDC, fixed transport-request shape, and closeout order tests.
- `server/tests/control-plane-receipt-recovery.test.mjs` — input/ID/attempt/artifact/challenge/status/recovered/no-claim tests.
- `server/tests/control-plane-recovered-closeout-publisher.test.mjs` — fixed tag/name and resumable-pair adapter tests.
- `server/tests/control-plane-receipt-recovery-workflow.test.mjs` — dispatch, permissions, concurrency, Environment, retention, job-isolation, and forbidden-path tests.

**Consumed without modification by this plan:**

- `server/services/deployment/canonical-json.mjs`
- `server/services/deployment/control-plane-host-protocol.mjs`
- `server/services/deployment/control-plane-transport-contract.mjs`
- `server/services/deployment/database-contract.mjs`
- `scripts/github-immutable-release-publisher.mjs`
- `.github/workflows/japan-control-plane-production-deploy.yml`
- `schemas/README.md`
- `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- `bin/gccgw.mjs`

Artifact Tasks 11-12 implement the production controller/CLI composition and wire it into the production-deploy workflow using this Receipt-owned normal-closeout adapter. Integration Task 6 performs no-change conformance against those exact committed owner files and real tests; it neither implements nor rewires them. The rollout/documentation task may document the resulting behavior, but this receipt slice does not edit the Artifact-owned controller or workflow.

## Cross-Slice Owned Interfaces

- Host Tasks 11-12 create one Receipt-owned `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`, then consume `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector }).publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })` and no alternate receipt writer. The injected Foundation store is already rooted at the validated transaction directory. Production composition fixes `faultInjector` to a no-op; normal finalize, phase-chained recovery, and external critical finalize all use this same method. Before its first Receipt-owned write, the publisher calls only `bootstrapMaintenance.runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore: bootstrapCloseoutStore })`; it has no direct compactor/capability/clock/digest port.
- Bootstrap Task 10 consumes `HOST_TERMINAL_STORE_LOGICAL_IDS`, `validatePublishedTerminalTuple(...)`, and the returned terminal digest tuple. Receipt durably writes and reads back the body, outer record, initial closeout record, and initial lease; Bootstrap's later `createControllerCloseoutStore(...)` supplies `readCompactionPreflight({ protectedNonterminalTransactionIds })`, `compactEligible({ retentionProof, now, maintenanceCapability })`, the injected `registerPendingLease(...)` port, finalizer reads, and CAS methods. Bootstrap's `createBootstrapMaintenanceCoordinator({ native, clock })` is the sole production caller of both compactors and exposes only `runAdmissionPreflight`/`runTerminalCloseoutPreflight`; Receipt consumes only the latter. `registerPendingLease` alone owns the mode-`0600`, maximum-1,024-entry/1-MiB closeout index and returns `{ indexSha256, indexEntrySha256 }`; neither Receipt nor Host serializes a second index. Receipt Task 2 tests these ports with exact structural fakes and imports no Bootstrap Task 9-10 source.
- Bootstrap Task 9 imports Receipt Task 2's sole `buildHostTerminalBundle(...)` to assemble opaque bytes from the four exact fixed store objects and index digest. Bootstrap alone owns `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs: 30000 })`, its chunk protocol, and the private validated-status brand; Receipt alone owns `HOST_TERMINAL_BUNDLE_V1_CONTRACT` and `validateHostTerminalBundleBytes(...)`.
- Artifact Task 11 consumes `createControllerCloseoutAdapter(...)` and its exact methods declared in Task 4, implements `server/services/deployment/control-plane-production-controller.mjs` plus its CLI, and Artifact Task 12 wires that composition into `.github/workflows/japan-control-plane-production-deploy.yml`. For a terminal status the Artifact controller preserves the privately branded Bootstrap value unchanged, passes that same object to both `readTerminalBundleBytes(...)` and Receipt `validateTerminal({ status, terminalBundle, plan, artifactAccepted })`, and passes only canonical `null` or the unchanged five-field Bootstrap acceptance validator value as `artifactAccepted`. It implements neither a host reader nor a bundle parser. Receipt owns the adapter and canonical closeout contracts only; Integration Task 6 only verifies the exact owner composition without modifying it.
- Artifact's controller CLI and Deploy Note consume only `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus(...)`, and `validateControllerFinalStatus(...)` from Task 3. Artifact alone owns `finalStatusSink.writeExact({ bytes, sha256 })`; it writes the returned bytes unchanged and may not define or reconstruct another final-status object. Receipt never accepts a final-status path or writes that file.
- Every Host/Bootstrap/Artifact consumer imports these exports. Copying logical IDs, terminal builders, transition audiences, OIDC-record fields, state tables, or replay rules into another module is forbidden.

## Closed State And Result Types

| Type | Exact values |
| --- | --- |
| Host final state | `deployed_validated`, `stopped_pre_switch`, `schema_committed_previous_release_validated`, `rolled_back`, `critical_manual_intervention_required` |
| Host nonterminal state | `critical_finalize_pending`, `critical_nonterminal_manual_intervention_required` |
| Per-database terminal result | imported from `DATABASE_TERMINAL_RESULTS`; never redeclared here |
| Host artifact state | `not_started`, `upload_started`, `upload_committed_observed` |
| Host closeout disposition | `controller_closeout_pending`, `controller_closeout_acknowledged_released`, `controller_closeout_abandoned_attached` |
| Normal controller result | `validated_deployment`, `validated_stopped_pre_switch`, `validated_schema_only_change`, `validated_rolled_back`, `validated_critical_failure`, `admission_rejected_no_transaction`, `receipt_invalid_no_production_claim`, `controller_incomplete_no_production_claim` |
| Recovery terminal result | `recovered_validated_deployment`, `recovered_validated_stopped_pre_switch`, `recovered_validated_schema_only_change`, `recovered_validated_rolled_back`, `recovered_validated_critical_failure` |
| Recovery no-claim reason | `recovery_not_terminal_no_claim`, `recovery_receipt_invalid_no_claim` |
| Original artifact classification | `present_exact`, `absent_proved`, `ambiguous_no_claim`, `invalid_no_claim` |
| Shared publisher observation | `none`, `asset_only`, `attestation_only`, `complete`, `conflict` |

Host-to-controller mapping is fixed:

```js
const HOST_TO_CONTROLLER_RESULT = Object.freeze({
  deployed_validated: "validated_deployment",
  stopped_pre_switch: "validated_stopped_pre_switch",
  schema_committed_previous_release_validated: "validated_schema_only_change",
  rolled_back: "validated_rolled_back",
  critical_manual_intervention_required: "validated_critical_failure",
});

const HOST_TO_RECOVERED_RESULT = Object.freeze({
  deployed_validated: "recovered_validated_deployment",
  stopped_pre_switch: "recovered_validated_stopped_pre_switch",
  schema_committed_previous_release_validated: "recovered_validated_schema_only_change",
  rolled_back: "recovered_validated_rolled_back",
  critical_manual_intervention_required: "recovered_validated_critical_failure",
});
```

No function may infer a host final state from an Actions conclusion, runner loss, artifact presence, artifact absence, elapsed time, or a closeout disposition.

---

### Task 1: Freeze Receipt Schemas And Closed State Algebra

**Files:**
- Create: `schemas/control-plane-host-terminal-receipt-v1.schema.json`
- Create: `schemas/control-plane-host-terminal-record-v1.schema.json`
- Create: `schemas/control-plane-host-closeout-record-v1.schema.json`
- Create: `schemas/control-plane-controller-closeout-v1.schema.json`
- Create: `schemas/control-plane-receipt-recovery-challenge-v1.schema.json`
- Create: `schemas/control-plane-recovered-closeout-v1.schema.json`
- Create: `schemas/control-plane-recovery-attempt-no-claim-v1.schema.json`
- Create: `server/services/deployment/control-plane-receipt-contract.mjs`
- Create: `server/tests/helpers/control-plane-receipt-fixtures.mjs`
- Create: `server/tests/control-plane-receipt-contract.test.mjs`

**Interfaces:**
- Consumes: `serializeCanonicalJsonBytes`, `parseCanonicalJsonBytes`, and `sha256Hex` from `server/services/deployment/canonical-json.mjs`.
- Consumes without copying or re-exporting: `DATABASE_TERMINAL_RESULTS`, `HOST_FINAL_STATES`, `isHostFinalState`, `isCriticalHostFinalState`, and `validateDatabaseTerminalVector` from `server/services/deployment/database-contract.mjs`.
- Produces: `HOST_NONTERMINAL_STATES`, `HOST_CLOSEOUT_ARTIFACT_STATES`, `HOST_CLOSEOUT_DISPOSITIONS`, `CONTROLLER_RESULTS`, `RECOVERED_RESULTS`, `RECOVERY_NO_CLAIM_REASONS`, and `ORIGINAL_ARTIFACT_CLASSIFICATIONS` as frozen arrays. Every terminal-state fixture and branch iterates the imported Host-owned `HOST_FINAL_STATES`; no synthetic maintenance/final-state label is accepted.
- Produces: strict schemas with `additionalProperties: false` at every object level and explicit ordered canonical contracts matching those schemas.
- Produces: `buildHostTerminalReceipt(input)`, `buildHostTerminalRecord({ receiptSha256, receiptBytes, plan })`, `buildInitialHostCloseoutRecord({ receiptSha256, terminalRecordSha256, plan })`, and `buildInitialHostCloseoutLease({ receiptSha256, terminalRecordSha256, closeoutRecordSha256, plan })`. Each returns `{ value, bytes, sha256 }`; only the terminal receipt body omits its own digest. The Bootstrap-owned store alone constructs the closeout-index entry.
- Produces: `makeHostTerminalReceiptFixture`, `makeHostTerminalRecordFixture`, `makeHostCloseoutRecordFixture`, and `canonicalFixtureBytes` for synthetic tests only.

- [ ] **Step 1 (5 min): Add RED schema/state tests**

Create the test and fixture imports before the implementation exists:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLLER_RESULTS,
  HOST_CLOSEOUT_ARTIFACT_STATES,
  RECOVERED_RESULTS,
} from "../services/deployment/control-plane-receipt-contract.mjs";
import { HOST_FINAL_STATES } from "../services/deployment/database-contract.mjs";

test("receipt state algebra is closed", () => {
  assert.deepEqual(HOST_CLOSEOUT_ARTIFACT_STATES, [
    "not_started",
    "upload_started",
    "upload_committed_observed",
  ]);
  assert.equal(HOST_FINAL_STATES.includes("critical_finalize_pending"), false);
  assert.equal(CONTROLLER_RESULTS.includes("validated_deployment"), true);
  assert.equal(RECOVERED_RESULTS.includes("recovered_validated_deployment"), true);
});
```

In the same test, load every Task 1 schema and recursively assert that every schema node with `type: "object"` has `additionalProperties: false`. Assert the terminal-receipt schema allows the five final states and rejects both nonterminal labels. Add a closure test proving the terminal body has no self digest, while body -> outer -> closeout record -> lease -> Bootstrap index forms the only forward hash chain and no later digest is fed back into an earlier object.

- [ ] **Step 2 (2 min): Run RED and record the expected missing-module failure**

Run:

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `control-plane-receipt-contract.mjs`. A parse failure in the test itself is not the expected RED.

- [ ] **Step 3 (5 min): Add the frozen arrays, strict schemas, and synthetic fixture builders**

Start `control-plane-receipt-contract.mjs` by importing the Host owner and defining only Receipt-owned state constants:

```js
import {
  HOST_FINAL_STATES,
  isHostFinalState,
  isCriticalHostFinalState,
  validateDatabaseTerminalVector,
} from "./database-contract.mjs";

export const HOST_NONTERMINAL_STATES = Object.freeze([
  "critical_finalize_pending",
  "critical_nonterminal_manual_intervention_required",
]);

export const HOST_CLOSEOUT_ARTIFACT_STATES = Object.freeze([
  "not_started",
  "upload_started",
  "upload_committed_observed",
]);

export const HOST_CLOSEOUT_DISPOSITIONS = Object.freeze([
  "controller_closeout_pending",
  "controller_closeout_acknowledged_released",
  "controller_closeout_abandoned_attached",
]);
```

The inner receipt schema must require the grouped fields below in this exact canonical order:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "domain",
    "bindings",
    "artifactBindings",
    "bootstrapBindings",
    "contractBindings",
    "transactionInvocationSha256",
    "databaseResults",
    "terminalEvidence",
    "finalState",
    "terminalPublishedAt",
    "controllerCloseoutAckDeadline",
    "controllerCloseoutLease"
  ]
}
```

Freeze every nested key list in the canonical contract. `bindings` carries the exact Production Gate, controller recovery ID, run/attempt, transaction, target, source commit, release unit, plan, and inventory digests. `artifactBindings`, `bootstrapBindings`, and `contractBindings` are exact transcriptions of the approved Deployment Plan fields. `databaseResults` is exactly the frozen value returned by the imported database validator:

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
    actualOpenedHandleBindingVerified,
  }],
}
```

`transactionInvocationSha256` is the Host-recomputed domain-separated digest over the durable accepted-artifact record, accepted-plan record, authorization reservation, and artifact-capability identity; Receipt accepts it only through Host's owner evidence and never derives it from the five-field artifact acceptance acknowledgment. `authoritativeLedgerResult` is exactly `not_applicable | absent_expected | exact_present`; `commitOrigin` is exactly `none | preexisting | this_transaction`. Every non-critical receipt requires `databaseTerminalVectorComplete: true` and both fixed-order entries. A critical receipt may use `false` and only the ordered safely classified subset returned unchanged by Host's imported `validateDatabaseTerminalVector(...)`; Receipt does not restate a second critical matrix, every included entry still uses an imported terminal result, and no fifth per-database label is introduced. `terminalEvidence` carries only the approved aggregate booleans, labels, counts, elapsed values, status codes, rollback result, publication-time finalizer state, cgroup/unit inactivity, guard/permit/lease facts, and cleanup readbacks. For a critical publication it records the active external finalizer, both exclusive leases held/read back, every runtime/transient database handle absent, and the unchanged durable critical fence; `finalizerInactive`/`leasesFree` are forbidden at this publication point and belong only to the later ordinary status. The receipt lease is exactly `controller_closeout_pending` plus `controllerCloseoutArtifactState: not_started`. The terminal body contains no self digest; the outer record binds the terminal-body digest, the initial closeout record binds the outer record, and the initial closeout lease binds the closeout record. Bootstrap's independently owned index registration binds the resulting four-object tuple without feeding any digest back into the terminal body, outer record, or lease.

Implement the four terminal/closeout builder exports from this Task's Interfaces with `serializeCanonicalJsonBytes(...)` and their frozen contracts. Each builder constructs every field itself, rejects unknown input keys, validates its immediately preceding digest before serialization, and returns `Object.freeze({ value, bytes, sha256: sha256Hex(bytes) })`. The terminal body builder alone computes its digest only for the return object; that digest is absent from `value` and appears first in the outer record. Task 3 adds the final-status contract/builders after immutable controller-closeout semantics are available.

- [ ] **Step 4 (3 min): Run GREEN and schema strictness regression**

Run:

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs
```

Expected: all state/schema/fixture tests pass; mutation attempts against exported arrays fail or leave the values unchanged.

- [ ] **Step 5 (2 min): Commit the closed schema surface**

```powershell
git add schemas/control-plane-host-terminal-receipt-v1.schema.json schemas/control-plane-host-terminal-record-v1.schema.json schemas/control-plane-host-closeout-record-v1.schema.json schemas/control-plane-controller-closeout-v1.schema.json schemas/control-plane-receipt-recovery-challenge-v1.schema.json schemas/control-plane-recovered-closeout-v1.schema.json schemas/control-plane-recovery-attempt-no-claim-v1.schema.json server/services/deployment/control-plane-receipt-contract.mjs server/tests/helpers/control-plane-receipt-fixtures.mjs server/tests/control-plane-receipt-contract.test.mjs
git commit -m "feat(deploy): define terminal receipt contracts"
```

---

### Task 2: Implement Parser Validation And The Concrete Host Terminal Publisher

**Files:**
- Create: `server/services/deployment/control-plane-receipt-parser-registry.mjs`
- Create: `server/services/deployment/control-plane-terminal-closeout-store.mjs`
- Create: `server/services/deployment/control-plane-host-terminal-publisher.mjs`
- Modify: `server/services/deployment/control-plane-receipt-contract.mjs`
- Modify: `server/tests/helpers/control-plane-receipt-fixtures.mjs`
- Modify: `server/tests/control-plane-receipt-contract.test.mjs`
- Create: `server/tests/control-plane-terminal-closeout-store.test.mjs`
- Create: `server/tests/control-plane-host-terminal-publisher.test.mjs`

**Interfaces:**
- Consumes: `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, and `sha256Hex(bytes)` from the canonical JSON foundation.
- Consumes: `validateDatabaseTerminalVector({ contracts, results, deploymentState })`; the receipt validator and publisher never implement a second database matrix.
- Consumes from one Foundation durable store already bound to the validated transaction root: `publishImmutable(logicalId, bytes) -> { outcome: "created" | "already_equal", sha256 }` and `readbackExact(logicalId, expectedSha256) -> Buffer`. There is no second object reader, filesystem walk, path selector, or raw directory capability.
- Consumes as injected structural ports, implemented later by Bootstrap Tasks 9-10, only `bootstrapMaintenance.runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })` and `controllerCloseoutStore.registerPendingLease({ transactionId, leaseId, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, leaseSha256 }) -> { indexSha256, indexEntrySha256 }`. Task 2 imports no Bootstrap module and uses exact fakes for RED/GREEN. Receipt never calls `assertBootstrapMaintenanceCapability`, either `compactEligible`, `readLedgerIdentity`, `readCompactionPreflight`, or an initializer/generic index append.
- Produces: `buildReceiptParserRegistry({ entries }) -> { entries, descriptorBytes, sha256, resolve }`, `resolveReceiptParser(registry, { schemaId, parserSha256 })`, and `validateParserRegistryCoverage(registry, retainedRecords)`.
- Produces: `validateHostTerminalReceiptBytes(bytes, bindings)`, `validateHostTerminalRecord(record, { receiptSha256, plan })`, `validateHostCloseoutRecord(record, { receiptSha256, runId, runAttempt })`, and `mapHostFinalStateToControllerResult(hostFinalState)`.
- Produces from `control-plane-receipt-contract.mjs` the sole canonical terminal-bundle owner surface consumed later by Bootstrap Task 9: `HOST_TERMINAL_BUNDLE_V1_CONTRACT`, `buildHostTerminalBundle({ transactionId, controllerRecoveryId, productionGateReceiptSha256, deploymentPlanSha256, terminalReceiptBytes, terminalRecordBytes, initialCloseoutRecordBytes, initialCloseoutLeaseBytes, closeoutIndexSha256 }) -> Object.freeze({ value, bytes, sha256 })`, and `validateHostTerminalBundleBytes(bytes, expected) -> Object.freeze({ value, bytes, sha256 })`. Bootstrap imports the builder after reading only the four fixed Receipt objects; it treats returned bytes as opaque and exposes only their digest/size through ordinary status.
- The bundle value has exactly ordered fields `schemaVersion`, `domain`, `transactionId`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `terminalReceiptBase64`, `terminalRecordBase64`, `initialCloseoutRecordBase64`, `initialCloseoutLeaseBase64`, `terminalReceiptSha256`, `terminalRecordSha256`, `closeoutRecordSha256`, `closeoutLeaseSha256`, and `closeoutIndexSha256`; it fixes `schemaVersion: "1"` and `domain: "host-terminal-bundle"`. The builder requires exactly its ten named input keys, strict typed/canonical bytes for all four objects, exact Gate/plan/transaction/recovery bindings, exact adjacent digests, and a lowercase index digest. It returns no path, object ID, selector, store handle, or raw database value.
- `validateHostTerminalBundleBytes(bytes, expected)` requires `expected` to have exactly `transactionId`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `terminalBundleSha256`, `terminalBundleSize`, `terminalReceiptSha256`, and `closeoutRecordSha256`. It canonical-parses no more than 262,144 bytes, byte-compares all expected bindings/digest/size, strictly decodes owned copies of the four Base64 fields, revalidates every typed object/adjacent edge/database terminal vector, and returns the canonical value plus owned aggregate bytes/digest. Neither Bootstrap nor Artifact defines another bundle contract/parser.
- Produces from `control-plane-terminal-closeout-store.mjs`: `TERMINAL_CLOSEOUT_LOGICAL_IDS` as exactly `{ terminalReceiptBody: "terminal-receipt.body", terminalOuterRecord: "terminal-record.outer", initialCloseoutRecord: "controller-closeout.record", initialCloseoutLease: "controller-closeout.lease" }` and `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`. The returned frozen object has exactly `publishTerminalReceiptBody(bytes)`, `publishTerminalOuterRecord(bytes)`, `publishInitialCloseoutRecord(bytes)`, `publishInitialCloseoutLease(bytes)`, `readTerminalReceiptBody({ expectedSha256 })`, `readTerminalOuterRecord({ expectedSha256 })`, `readInitialCloseoutRecord({ expectedSha256 })`, and `readInitialCloseoutLease({ expectedSha256 })`. Every publish unconditionally calls Foundation `publishImmutable` and then `readbackExact`; every independent read calls only `readbackExact` with its fixed logical ID and a required digest obtained from a validated adjacent record or validated Bootstrap index entry. No method accepts a transaction, logical ID, path, root, or reader.
- Produces: `HOST_TERMINAL_STORE_LOGICAL_IDS` as an alias of the four frozen Receipt-owned logical IDs and `HOST_TERMINAL_PUBLICATION_STAGES` as exactly `terminal_receipt_body`, `terminal_outer_record`, `initial_closeout_record`, `initial_closeout_lease`, `bounded_closeout_index`.
- Produces: `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector }).publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })`.
- The publisher first calls only `bootstrapMaintenance.runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore: bootstrapCloseoutStore })`. Only after that branded, lock-protected Bootstrap operation returns does it write/read back the four Receipt objects through `terminalCloseoutStore`, then call only `bootstrapCloseoutStore.registerPendingLease(...)`. `faultInjector.after(stage)` exists only in injected tests and receives one value from `HOST_TERMINAL_PUBLICATION_STAGES`; Bootstrap owns compactor crash injection.
- `publishTerminal(...)` returns exactly `{ finalState, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, closeoutLeaseSha256, closeoutIndexSha256 }`; it returns no bytes, path, database value, or protected binding.
- Produces: `validatePublishedTerminalTuple({ terminalReceiptBytes, terminalRecordBytes, closeoutRecordBytes, closeoutLeaseBytes, registrationInput, registrationResult, bindings }) ->` the same frozen digest tuple. `registrationInput` is the exact six-field object passed to Bootstrap and `registrationResult` is exactly `{ indexSha256, indexEntrySha256 }` returned after Bootstrap's internal single CAS/readback; Receipt validates the transaction/object bindings and both digests but never parses or reconstructs index bytes. Host and Bootstrap finalizer import this validator instead of copying adjacent-object link checks.
- Produces test-only `runRegisterPendingLeaseConsumerContract({ createProvider })` and `runTerminalCloseoutMaintenanceConsumerContract({ createProvider })` in `server/tests/helpers/control-plane-receipt-fixtures.mjs`. Task 2 runs them against exact spy providers; Task 4 reruns the unchanged contracts against Bootstrap's real `createControllerCloseoutStore(...)` and `createBootstrapMaintenanceCoordinator(...)` instances.
- Returns: frozen validated values or one safe error with a closed code; it never returns raw offending bytes or a nested field value.

- [ ] **Step 1 (5 min): Add RED canonical/parser/binding and terminal-matrix tests**

Add table tests for BOM, invalid UTF-8, duplicate keys, trailing data, unknown schema ID, wrong parser digest, missing retained parser, receipt self-hash field, deployment-plan/Gate/inventory/run/attempt mismatch, nonterminal state, wrong closeout transition, invalid critical publication predicate, and every value rejected by Host's exact database-terminal-vector validator. Prove non-critical incomplete vectors reject; critical incomplete vectors pass only when the imported validator returns its ordered safely classified subset unchanged and the publication-time proof shows no runtime/transient handle, the unchanged critical fence, the external finalizer active, and both exclusive leases held/read back. Explicitly reject a critical terminal receipt that claims publication-time `finalizerInactive`, `leasesFree`, a third database descriptor, or a locally copied database-state label. Add disposition/deadline rows proving pending is pre-deadline only, acknowledged requires matching committed observation, attached requires deadline expiry and inactive finalizer, and overdue unattached never validates; these closeout-disposition rows do not retroactively change the publication-time receipt.

Add terminal-bundle RED tests that build one exact four-object tuple, require byte-identical deterministic output, and pass its bytes back through `validateHostTerminalBundleBytes(...)`. Reject every missing/extra/reordered field, numeric schema version, noncanonical Base64, a caller-supplied object digest, aggregate bytes over 262,144, wrong aggregate digest/size, wrong transaction/recovery/Gate/deployment-plan/receipt/initial-closeout binding, any inner digest/typed-edge/database-vector mismatch, and any path/logical-ID/store/reader-shaped key.

Use an exact parser entry in the positive case:

```js
const parseCanonicalReceiptFixture = (bytes) => Object.freeze({ byteLength: bytes.length });
const registry = buildReceiptParserRegistry({
  entries: [{
    schemaId: "control-plane-host-terminal-receipt/v1",
    parserSha256: "1".repeat(64),
    parse: parseCanonicalReceiptFixture,
  }],
});

assert.equal(
  resolveReceiptParser(registry, {
    schemaId: "control-plane-host-terminal-receipt/v1",
    parserSha256: "1".repeat(64),
  }).schemaId,
  "control-plane-host-terminal-receipt/v1",
);
```

Assert `validateParserRegistryCoverage` rejects zero or two matching parsers for any unexpired, latest-target, or critical retained record.

- [ ] **Step 2 (5 min): Add RED publisher order, crash-replay, and consumer-contract tests**

Use one deterministic `terminalPublishedAt` and inject a crash after every durable boundary:

```js
for (const failAfter of HOST_TERMINAL_PUBLICATION_STAGES) {
  const harness = createTerminalPublisherHarness({ failAfter });
  await assert.rejects(
    () => harness.publisher.publishTerminal(harness.input),
    new RegExp(`injected_after_${failAfter}`),
  );
  harness.disableFault();
  const resumed = await harness.publisher.publishTerminal(harness.input);
  assert.equal(resumed.finalState, harness.input.finalState);
  assert.deepEqual(harness.durableOrder, [
    "terminal_receipt_body",
    "terminal_outer_record",
    "initial_closeout_record",
    "initial_closeout_lease",
    "bounded_closeout_index",
  ]);
  await harness.assertExactReadback(resumed);
}

assert.deepEqual(Object.keys(harness.lastRegistrationInput), [
  "transactionId",
  "leaseId",
  "terminalReceiptSha256",
  "terminalRecordSha256",
  "closeoutRecordSha256",
  "leaseSha256",
]);
assert.deepEqual(Object.keys(harness.lastRegistrationResult), [
  "indexSha256",
  "indexEntrySha256",
]);
```

Call `runTerminalCloseoutMaintenanceConsumerContract({ createProvider: createMaintenanceSpy })` and `runRegisterPendingLeaseConsumerContract({ createProvider: createRegisterPendingLeaseSpy })` in this RED/GREEN batch. The first invokes only `runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })`, proves both references are passed unchanged before the first Receipt-store call, and forbids any direct compactor/capability/time/digest access. The second invokes only `registerPendingLease(...)`, proves the exact six input keys/two output keys, exact replay, digest drift rejection, transaction drift rejection, and no initializer/index/path method access, and returns the spy's ordered observations for the publisher assertions.

Run the matrix by iterating only Host-owned `HOST_FINAL_STATES`; execute `deployed_validated` through normal finalize, `rolled_back` through phase-chained recovery, and `critical_manual_intervention_required` through the external critical finalizer. In the critical row, keep the finalizer active and both exclusive leases held through all four Receipt-object readbacks plus Bootstrap registration; release them only after the returned tuple is durable. Assert one successful terminal-closeout maintenance preflight precedes every first Receipt write. A preflight failure or lock/CAS uncertainty performs zero Receipt publication/registration; crash after either owner CAS and reboot retries the coordinator and converges before byte-identical publication. Assert replay never changes `terminalPublishedAt`, the 120-second deadline, or any digest; a changed replay input fails before the next write; all four Receipt-owned objects are fsynced/read back before one exact `registerPendingLease(...)`; the later Bootstrap-owned index remains sorted, unique, mode `0600`, and capped at 1,024 entries/1 MiB; and every Bootstrap-finalizer tuple passes `validatePublishedTerminalTuple` only after all five stages are durable. Add a separate store matrix proving constructor transaction drift, a caller-supplied logical ID/path/root key, cross-transaction bytes, a missing/wrong expected digest, oversize bytes, immutable replay conflict, or a malformed Foundation publish/readback result fails before registration. Assert the store dependency surface contains no second reader and the Task 2 test imports no Bootstrap module.

- [ ] **Step 3 (2 min): Run RED for both missing implementations**

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs
```

Expected: module/export failure for the parser registry, transaction-bound store, or `control-plane-host-terminal-publisher.mjs`. Do not weaken canonical byte fixtures or remove a crash point to make RED pass.

- [ ] **Step 4 (5 min): Implement exact parser lookup and state-specific validation**

Implement registry construction with duplicate rejection:

```js
export function buildReceiptParserRegistry({ entries }) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = `${entry.schemaId}:${entry.parserSha256}`;
    if (byKey.has(key) || typeof entry.parse !== "function") {
      throw safeReceiptError("receipt_parser_registry_invalid");
    }
    byKey.set(key, Object.freeze({ ...entry }));
  }
  const listedEntries = Object.freeze([...byKey.values()].sort((left, right) => {
    const leftKey = `${left.schemaId}:${left.parserSha256}`;
    const rightKey = `${right.schemaId}:${right.parserSha256}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  }));
  const descriptorBytes = serializeCanonicalJsonBytes({
    schemaVersion: 1,
    domain: "receipt-parser-registry",
    entries: listedEntries.map(({ schemaId, parserSha256 }) => ({ schemaId, parserSha256 })),
  }, RECEIPT_PARSER_REGISTRY_V1_CONTRACT);
  return Object.freeze({
    entries: listedEntries,
    descriptorBytes,
    sha256: sha256Hex(descriptorBytes),
    resolve(schemaId, parserSha256) {
      return byKey.get(`${schemaId}:${parserSha256}`) ?? null;
    },
  });
}

export function resolveReceiptParser(registry, { schemaId, parserSha256 }) {
  const parser = registry.resolve(schemaId, parserSha256);
  if (!parser) throw safeReceiptError("receipt_parser_unavailable");
  return parser;
}
```

Implement terminal validation by importing Host's exact `validateDatabaseTerminalVector(...)`, accepting only its frozen return unchanged, and selecting the exact publication-time final-state predicate. Receipt does not copy the Host database matrix or classify an entry itself. The critical publication predicate requires no application/auxiliary/runtime/transient database handle or shared identity-lease holder, closed runtime permits, retained/read-back guard and unchanged critical identity fence, the external finalizer still active, and both exclusive business/global-database-identity leases held/read back by that finalizer. It expressly rejects publication-time `finalizerInactive` or `leasesFree`; those are later ordinary-status facts. Non-critical predicates require the exact selected release, state-authorized steady-state permits/actual-main handles, absent guard, closed transaction/migration/custody authority, and their state-specific health/schema/rollback evidence. The inner receipt never contains `terminalReceiptSha256`.

Implement the sole terminal-bundle contract in the same owner module:

```js
export function buildHostTerminalBundle(input) {
  validateExactTerminalBundleBuilderInput(input);
  const tuple = validateTerminalBundleObjectTuple(input);
  const value = Object.freeze({
    schemaVersion: "1",
    domain: "host-terminal-bundle",
    transactionId: input.transactionId,
    controllerRecoveryId: input.controllerRecoveryId,
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    deploymentPlanSha256: input.deploymentPlanSha256,
    terminalReceiptBase64: input.terminalReceiptBytes.toString("base64"),
    terminalRecordBase64: input.terminalRecordBytes.toString("base64"),
    initialCloseoutRecordBase64: input.initialCloseoutRecordBytes.toString("base64"),
    initialCloseoutLeaseBase64: input.initialCloseoutLeaseBytes.toString("base64"),
    terminalReceiptSha256: tuple.terminalReceiptSha256,
    terminalRecordSha256: tuple.terminalRecordSha256,
    closeoutRecordSha256: tuple.closeoutRecordSha256,
    closeoutLeaseSha256: tuple.closeoutLeaseSha256,
    closeoutIndexSha256: input.closeoutIndexSha256,
  });
  const bytes = serializeCanonicalJsonBytes(value, HOST_TERMINAL_BUNDLE_V1_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function validateHostTerminalBundleBytes(bytes, expected) {
  validateExactTerminalBundleExpected(expected);
  const value = parseCanonicalJsonBytes(bytes, HOST_TERMINAL_BUNDLE_V1_CONTRACT);
  const sha256 = sha256Hex(bytes);
  validateTerminalBundleExpectedBindings({ value, bytes, sha256, expected });
  validateDecodedTerminalBundleObjectTuple(value, expected);
  return Object.freeze({ value, bytes: Buffer.from(bytes), sha256 });
}
```

Both helper validators are closed internal functions implemented in this task, not extensibility hooks. They require the exact key sets and invoke the existing Receipt/record/closeout/lease/database validators; `validateDecodedTerminalBundleObjectTuple(...)` performs strict canonical Base64 round-trip before validating owned Buffers.

- [ ] **Step 5 (5 min): Implement the transaction-bound durable store and body/outer publication**

The Receipt-owned store fixes both transaction and logical object before any read or write. Foundation `publishImmutable` itself implements atomic create-or-exact-replay, so Receipt always publishes first and then performs an expected-digest readback; it never probes existence through a second reader:

```js
export function createTransactionBoundTerminalCloseoutStore({
  transactionId,
  durableStore,
}) {
  validateTransactionId(transactionId);
  validateDurableStorePort(durableStore);
  async function publishOrVerify(logicalId, bytes, maxBytes) {
    validateBoundedBytes(bytes, maxBytes);
    const expectedSha256 = sha256Hex(bytes);
    const published = await durableStore.publishImmutable(logicalId, bytes);
    if (!hasExactKeys(published, ["outcome", "sha256"])
        || !["created", "already_equal"].includes(published.outcome)
        || published.sha256 !== expectedSha256) {
      throw safeReceiptError("terminal_publication_result_invalid");
    }
    const readback = await durableStore.readbackExact(logicalId, expectedSha256);
    if (!Buffer.isBuffer(readback)
        || readback.length > maxBytes
        || sha256Hex(readback) !== expectedSha256
        || !readback.equals(bytes)) {
      throw safeReceiptError("terminal_publication_readback_invalid");
    }
    return expectedSha256;
  }
  const publish = (name, contract) => (bytes) => publishOrVerify(
    TERMINAL_CLOSEOUT_LOGICAL_IDS[name], bytes, contract.maxBytes,
  );
  const read = (name, contract) => async (input) => {
    if (!hasExactKeys(input, ["expectedSha256"])) {
      throw safeReceiptError("terminal_read_input_invalid");
    }
    const { expectedSha256 } = input;
    if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
      throw safeReceiptError("terminal_read_expected_digest_invalid");
    }
    const bytes = await durableStore.readbackExact(
      TERMINAL_CLOSEOUT_LOGICAL_IDS[name],
      expectedSha256,
    );
    validateBoundedBytes(bytes, contract.maxBytes);
    if (sha256Hex(bytes) !== expectedSha256) {
      throw safeReceiptError("terminal_readback_digest_invalid");
    }
    return Buffer.from(bytes);
  };
  return Object.freeze({
    publishTerminalReceiptBody: publish("terminalReceiptBody", HOST_TERMINAL_RECEIPT_V1_CONTRACT),
    publishTerminalOuterRecord: publish("terminalOuterRecord", HOST_TERMINAL_RECORD_V1_CONTRACT),
    publishInitialCloseoutRecord: publish("initialCloseoutRecord", HOST_CLOSEOUT_RECORD_V1_CONTRACT),
    publishInitialCloseoutLease: publish("initialCloseoutLease", HOST_CLOSEOUT_LEASE_V1_CONTRACT),
    readTerminalReceiptBody: read("terminalReceiptBody", HOST_TERMINAL_RECEIPT_V1_CONTRACT),
    readTerminalOuterRecord: read("terminalOuterRecord", HOST_TERMINAL_RECORD_V1_CONTRACT),
    readInitialCloseoutRecord: read("initialCloseoutRecord", HOST_CLOSEOUT_RECORD_V1_CONTRACT),
    readInitialCloseoutLease: read("initialCloseoutLease", HOST_CLOSEOUT_LEASE_V1_CONTRACT),
  });
}

export function createHostTerminalPublisher({
  terminalCloseoutStore,
  bootstrapCloseoutStore,
  bootstrapMaintenance,
  admissionReplayLedger,
  clock,
  faultInjector,
}) {
  return Object.freeze({
    async publishTerminal(input) {
      await bootstrapMaintenance.runTerminalCloseoutPreflight({
        admissionReplayLedger,
        controllerCloseoutStore: bootstrapCloseoutStore,
      });
      validateTerminalPublicationTime(input.terminalPublishedAt, clock.now());
      const databaseResults = validateDatabaseTerminalVector({
        contracts: input.databaseContracts,
        results: input.databaseResults,
        deploymentState: input.finalState,
      });
      const receipt = buildHostTerminalReceipt({ ...input, databaseResults });
      const terminalReceiptSha256 = await terminalCloseoutStore.publishTerminalReceiptBody(receipt.bytes);
      await faultInjector?.after("terminal_receipt_body");
      const outer = buildHostTerminalRecord({
        receiptSha256: terminalReceiptSha256,
        receiptBytes: receipt.bytes,
        plan: input.plan,
      });
      const terminalRecordSha256 = await terminalCloseoutStore.publishTerminalOuterRecord(outer.bytes);
      await faultInjector?.after("terminal_outer_record");
      return publishInitialCloseoutAndRegister({
        terminalCloseoutStore,
        bootstrapCloseoutStore,
        input,
        terminalReceiptSha256,
        terminalRecordSha256,
        faultInjector,
      });
    },
  });
}
```

`terminalPublishedAt` is part of the durable terminal context supplied by normal/recovery/critical finalization; the publisher validates it and never calls `clock.now()` to replace it. The builder derives `controllerCloseoutAckDeadline` as exactly 120 seconds later. The wrapper exposes no generic read/write method, root, path, transaction selector, caller logical ID, or reader. Independent finalizer reads use only the four typed read methods: receipt digest from the validated outer record or index entry, outer/lease digests from the validated index entry, and initial closeout-record digest from the validated lease or index entry.

- [ ] **Step 6 (5 min): Publish initial closeout objects, then register only through Bootstrap**

Complete the only permitted post-terminal order:

```js
async function publishInitialCloseoutAndRegister(context) {
  const closeout = buildInitialHostCloseoutRecord({
    receiptSha256: context.terminalReceiptSha256,
    terminalRecordSha256: context.terminalRecordSha256,
    plan: context.input.plan,
  });
  const closeoutRecordSha256 = await context.terminalCloseoutStore
    .publishInitialCloseoutRecord(closeout.bytes);
  await context.faultInjector?.after("initial_closeout_record");

  const lease = buildInitialHostCloseoutLease({
    receiptSha256: context.terminalReceiptSha256,
    terminalRecordSha256: context.terminalRecordSha256,
    closeoutRecordSha256,
    plan: context.input.plan,
  });
  const closeoutLeaseSha256 = await context.terminalCloseoutStore
    .publishInitialCloseoutLease(lease.bytes);
  await context.faultInjector?.after("initial_closeout_lease");

  const registrationInput = Object.freeze({
    transactionId: context.input.plan.transactionId,
    leaseId: context.input.plan.controllerRecoveryId,
    terminalReceiptSha256: context.terminalReceiptSha256,
    terminalRecordSha256: context.terminalRecordSha256,
    closeoutRecordSha256,
    leaseSha256: closeoutLeaseSha256,
  });
  const registered = await context.bootstrapCloseoutStore.registerPendingLease(registrationInput);
  validateBootstrapRegistrationResult(registered, registrationInput);
  await context.faultInjector?.after("bounded_closeout_index");
  return Object.freeze({
    finalState: context.input.finalState,
    terminalReceiptSha256: context.terminalReceiptSha256,
    terminalRecordSha256: context.terminalRecordSha256,
    closeoutRecordSha256,
    closeoutLeaseSha256,
    closeoutIndexSha256: registered.indexSha256,
  });
}
```

Receipt performs no replay/index serialization or CAS. Bootstrap's capability-gated maintenance coordinator owns the fixed lock, one clock observation, replay-ledger identity read, protected-nonterminal set, branded closeout `retentionProof`, and both deterministic CAS compactions. The closeout compactor protects age `<35 days`, active/nonterminal, newest-per-target, newest-critical, parser-required, and recovery-referenced entries. Bootstrap's `registerPendingLease` then owns the sorted unique mode-`0600` index, exact duplicate replay, 1,024-entry/1-MiB bounds, and competing-CAS rejection. `validatePublishedTerminalTuple` canonical-validates the four Receipt-owned byte objects, every adjacent digest, and Bootstrap's exact registration readback before returning the six-digest tuple.

- [ ] **Step 7 (3 min): Run GREEN plus malformed-byte and crash-replay regressions**

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs
```

Expected: valid fixtures, the sole terminal-bundle builder/validator, and all three producer paths pass against the exact structural registration fake; every malformed/cross-bound/nonterminal/dropped-parser/replay-conflict row fails safely; each injected crash resumes to one byte-identical four-object tuple plus one exact registration, and the returned `closeoutIndexSha256` equals the fake's validated readback. Bootstrap Task 9 later imports this exact builder, and Task 10 runs the unchanged registration consumer-contract fixture against its real store.

- [ ] **Step 8 (2 min): Commit parser, publisher, and terminal validation**

```powershell
git add server/services/deployment/control-plane-receipt-contract.mjs server/services/deployment/control-plane-receipt-parser-registry.mjs server/services/deployment/control-plane-terminal-closeout-store.mjs server/services/deployment/control-plane-host-terminal-publisher.mjs server/tests/helpers/control-plane-receipt-fixtures.mjs server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs
git commit -m "feat(deploy): publish terminal receipt evidence"
```

---

### Task 3: Build Immutable Controller Closeout, Final Status, And Separate Artifact Observation

**Files:**
- Create: `schemas/control-plane-controller-final-status-v1.schema.json`
- Create: `server/services/deployment/control-plane-controller-closeout.mjs`
- Create: `server/tests/control-plane-controller-closeout.test.mjs`
- Modify: `server/services/deployment/control-plane-receipt-contract.mjs`
- Modify: `server/tests/helpers/control-plane-receipt-fixtures.mjs`

**Interfaces:**
- Consumes: validated host terminal receipt/record/closeout values and `mapHostFinalStateToControllerResult` from Task 2.
- Consumes: canonical serialize/parse/hash helpers from the foundation.
- Imports Bootstrap's owner assertion `assertValidatedOrdinaryStatus(value)` but no Task 4 module. Task 3 tests obtain a real private-branded ordinary status from Bootstrap's validator and wrap that unchanged reference with an exact `responseSha256`; a synthetic sixteen-field lookalike is forbidden. Task 4 later proves that its real complete-envelope validator produces the same owner-preserving wrapper.
- Produces: `deriveControllerCloseoutArtifactName({ controllerRecoveryId, originalRunId, originalRunAttempt })` and `buildControllerCloseout(input) -> { value, bytes, sha256, artifactName, fileName }`. A terminal controller closeout carries the Receipt-validated `transactionInvocationSha256`; every no-claim closeout carries canonical `null`.
- Produces: `validateControllerCloseoutBytes(bytes, bindings) -> frozen value`.
- Produces: `classifyControllerCloseout(input) -> one CONTROLLER_RESULTS value`. Its admission branch is reserved for a future owner-branded exact `{ preAdmissionDurableRejection: true, admissionAccepted: false }` input; Version 1 has no such producer, so the current Artifact controller never invokes it. Standalone `admissionAccepted: false`, any ordinary-status `durableRejection`, and every admitted-transaction observation reject that branch.
- Produces: `buildActionsArtifactObservation(input) -> { value, bytes, sha256 }` and `validateActionsArtifactObservation(value, expected)`; this observation is ACK/recovery evidence and is never inserted into or used to rewrite `controller_closeout` bytes.
- Produces from the same module and nowhere else: `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus({ controllerCloseoutBytes, closeoutBindings, actionsArtifactObservation, validatedFinalHostStatus, artifactReleaseTag, backupResult, observedAt }) -> { value, bytes, sha256 }`, and `validateControllerFinalStatus(bytes, expected) -> frozen value`. Receipt owns the field order, branch algebra, canonical bytes, build, and validation. Artifact/Integration may import those three exports but may not construct, normalize, extend, or reinterpret final-status values; Artifact alone owns the fixed `finalStatusSink.writeExact({ bytes, sha256 })` side effect and writes the returned wrapper unchanged.
- The final-status value has exactly these ordered fields: `schemaVersion`, `domain`, `resultKind`, `runId`, `runAttempt`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `inventoryReceiptSha256`, `sourceCommit`, `target`, `releaseUnit`, `resultCode`, `terminal`, `validationState`, `hostFinalState`, `terminalReceiptSha256`, `transactionInvocationSha256`, `controllerCloseoutSha256`, `actionsArtifactObservationSha256`, `finalHostStatusSha256`, `artifactReleaseTag`, `backupResult`, `runnerCleanupVerified`, and `observedAt`.
- The `terminal` branch requires one of the five validated controller results, the exact reverse-mapped host final state, `terminal: true`, `validationState: "validated"`, all four terminal/closeout/status digests, the lowercase `transactionInvocationSha256` returned by Receipt terminal validation, a validated Actions observation, `runnerCleanupVerified: true`, and aggregate `artifactReleaseTag`/`backupResult` copied from already validated plan/terminal evidence. `validatedFinalHostStatus` is exactly `{ status, responseSha256 }`: `status` is the unchanged Bootstrap-private ordinary-status reference and must pass `assertValidatedOrdinaryStatus`; `responseSha256` hashes the exact response bytes that produced it. For the critical row, Bootstrap can issue that brand only after it has accepted Host's unchanged `assertCriticalPostPublicationProof` capability; for non-critical rows it enforces the owner state matrix without that capability. Missing the publication-time terminal bundle or this state-appropriate later observation rejects. No Host proof field is serialized. The `no_claim` branch requires one of the three no-production-claim results, `terminal: false`, `validationState: "no_claim"`, `hostFinalState: null`, `terminalReceiptSha256: null`, `transactionInvocationSha256: null`, `actionsArtifactObservationSha256: null`, `finalHostStatusSha256: null`, `artifactReleaseTag: null`, `backupResult: null`, one exact `controllerCloseoutSha256` derived from non-null no-claim closeout bytes, and never becomes Deploy Note eligible.
- `buildControllerFinalStatus` first validates immutable `controllerCloseoutBytes`, derives `resultKind`, `resultCode`, binding fields, and `controllerCloseoutSha256` from those exact bytes, then validates any Actions observation and the exact owner-branded `validatedFinalHostStatus` wrapper without spreading/rebranding its `status`. It accepts no caller-supplied result override. `validateControllerFinalStatus` validates the resulting canonical serialized contract and expected safe bindings for byte-preserving Artifact/Deploy-Note consumption; it is not a substitute Host-proof acquisition API and cannot authorize construction of terminal bytes. Neither builder nor schema accepts a path, raw SSH/HTTP response, stdout/stderr, diagnostic text, URL, environment value, token, key, known-hosts bytes, PID, database row, or arbitrary evidence object.
- Produces test-only `makeControllerFinalStatusFixture(...)` in `server/tests/helpers/control-plane-receipt-fixtures.mjs`. Artifact's real controller-output test writes `buildControllerFinalStatus(...).bytes`; its Deploy Note fixture must pass those unchanged bytes to `validateControllerFinalStatus(...)`, proving controller output -> downloaded final-status artifact -> Deploy Note with no reconstruction.

- [ ] **Step 1 (5 min): Add RED mapping, immutability, metadata, and ordering tests**

Test all five host-final-state mappings and all three no-production-claim controller states. Prove that a live controller may emit `controller_incomplete_no_production_claim`, but runner loss alone produces no synthetic closeout.

Add the immutability assertion:

```js
const built = buildControllerCloseout(validControllerInput());
const before = Buffer.from(built.bytes);
const observation = buildActionsArtifactObservation(validArtifactObservationInput());

assert.equal(built.value.controllerCloseoutArtifactState, "not_started");
assert.equal(
  built.artifactName,
  `control-plane-controller-closeout-${controllerRecoveryId}-${originalRunId}-${originalRunAttempt}`,
);
assert.equal(built.fileName, `controller-closeout-${built.sha256}.json`);
assert.equal(observation.value.apiDigest, `sha256:${"a".repeat(64)}`);
assert.equal(observation.value.payloadSha256, built.sha256);
assert.deepEqual(built.bytes, before);
assert.equal(typeof built.value.terminalReceiptBase64, "string");
assert.equal("artifactId" in built.value, false);
assert.equal("expiresAt" in built.value, false);
```

Add tests rejecting `expiresAt - createdAt < 35 days`, expired observations, uppercase/bare API digests, mismatched payload SHA, wrong run/attempt/name, and an observation serialized into the immutable payload. Recursively assert `additionalProperties: false` for `control-plane-controller-final-status-v1.schema.json`; cover every value of imported Host `HOST_FINAL_STATES` and all three no-claim results, every illegal cross-branch null/non-null combination, missing/mismatched `transactionInvocationSha256`, a caller result override, and every prohibited path/raw-output/secret-shaped key. Prove only `{ preAdmissionDurableRejection: true, admissionAccepted: false }` maps to `admission_rejected_no_transaction`; either field alone, a post-admission durable rejection, or `terminal_quiescence_rejected` with its transaction binding rejects that mapping. The transaction-bound transitional rejection remains inside the fixed bounded ordinary-status poll: a later real Host-proof-backed immutable critical terminal plus its exact validated bundle maps to `validated_critical_failure`, while deadline exhaustion maps to `controller_incomplete_no_production_claim`. Only an actual immutable terminal bundle that reaches Receipt validation and fails may map through `receiptValid: false` to `receipt_invalid_no_production_claim`; the transitional response itself never occupies that result. Build each terminal fixture from the real Bootstrap status validator, preserve exact `{ status, responseSha256 }`, and prove `assertValidatedOrdinaryStatus(status)` returns the same reference. A copied, spread, serialized, recovered-status-branded, closeout-ACK, or structurally identical frozen status must reject before final-status bytes exist. The critical fixture uses Bootstrap's Host-proof-backed ordinary-status harness; publication-time held-lock evidence alone cannot satisfy it, and the returned status/payload contains no proof fields. Every no-claim artifact/name is bound only to the exact run attempt, performs zero host mutation, creates no fixed tag/Release/attestation/Deploy Note, and reserves no identity or name that could block a later validated terminal claim.

Add the real consumer fixture contract:

```js
const controllerOutput = buildControllerFinalStatus(makeControllerFinalStatusFixture()).bytes;
const downloadedFinalStatusArtifact = Buffer.from(controllerOutput);
const noteInput = validateControllerFinalStatus(downloadedFinalStatusArtifact, expectedFinalStatusBindings());
assert.equal(noteInput.resultCode, "validated_deployment");
assert.deepEqual(downloadedFinalStatusArtifact, controllerOutput);
```

Artifact controller and Deploy Note tests later import this exact builder/validator/fixture; they may not use a locally shaped object that merely resembles final status.

- [ ] **Step 2 (2 min): Run RED and confirm the closeout module is missing**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `control-plane-controller-closeout.mjs`.

- [ ] **Step 3 (5 min): Implement closed result mapping and two distinct byte contracts**

Use the Task 2 mapping and classify no-claim paths without inferring a host result:

```js
export function classifyControllerCloseout(input) {
  if (input.preAdmissionDurableRejection === true) {
    if (input.admissionAccepted !== false) {
      throw safeCloseoutError("controller_closeout_pre_admission_rejection_invalid");
    }
    return "admission_rejected_no_transaction";
  }
  if (input.admissionAccepted === false) {
    throw safeCloseoutError("controller_closeout_admission_rejection_unproved");
  }
  if (input.receiptValid === false) return "receipt_invalid_no_production_claim";
  if (input.controllerComplete === false) return "controller_incomplete_no_production_claim";
  return mapHostFinalStateToControllerResult(input.hostFinalState);
}

export function deriveControllerCloseoutArtifactName({
  controllerRecoveryId,
  originalRunId,
  originalRunAttempt,
}) {
  if (!/^cr1\.[0-9a-f]{64}$/.test(controllerRecoveryId)
      || !/^[1-9][0-9]{0,19}$/.test(String(originalRunId))
      || !/^[1-9][0-9]{0,9}$/.test(String(originalRunAttempt))) {
    throw safeCloseoutError("controller_closeout_artifact_binding_invalid");
  }
  return `control-plane-controller-closeout-${controllerRecoveryId}-${originalRunId}-${originalRunAttempt}`;
}

export function buildControllerCloseout(input) {
  const controllerResult = classifyControllerCloseout(input);
  const terminalReceiptSha256 = input.terminalReceiptSha256 ?? null;
  const artifactName = deriveControllerCloseoutArtifactName(input);
  const value = Object.freeze({
    schemaVersion: 1,
    domain: "controller-closeout",
    controllerRecoveryId: input.controllerRecoveryId,
    originalRunId: input.originalRunId,
    originalRunAttempt: input.originalRunAttempt,
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    transactionId: input.transactionId,
    target: input.target,
    releaseUnit: input.releaseUnit,
    sourceCommit: input.sourceCommit,
    deploymentPlanSha256: input.deploymentPlanSha256,
    inventoryReceiptSha256: input.inventoryReceiptSha256,
    bootstrapReceiptSha256: input.bootstrapReceiptSha256,
    terminalReceiptSha256,
    terminalRecordSha256: input.terminalRecordSha256 ?? null,
    transactionInvocationSha256: input.transactionInvocationSha256 ?? null,
    terminalReceiptBase64: input.terminalReceiptBytes === null
      ? null
      : Buffer.from(input.terminalReceiptBytes).toString("base64"),
    terminalRecordBase64: input.terminalRecordBytes === null
      ? null
      : Buffer.from(input.terminalRecordBytes).toString("base64"),
    initialHostCloseoutRecordBase64: input.initialHostCloseoutRecordBytes === null
      ? null
      : Buffer.from(input.initialHostCloseoutRecordBytes).toString("base64"),
    controllerResult,
    controllerCloseoutArtifactState: terminalReceiptSha256 === null ? null : "not_started",
    runnerCleanupVerified: input.runnerCleanupVerified,
    artifactPolicy: Object.freeze({ retentionDays: 35, artifactName }),
  });
  const bytes = serializeCanonicalJsonBytes(value, CONTROLLER_CLOSEOUT_V1_CONTRACT);
  const sha256 = sha256Hex(bytes);
  return Object.freeze({
    value,
    bytes,
    sha256,
    artifactName,
    fileName: `controller-closeout-${sha256}.json`,
  });
}
```

`preAdmissionDurableRejection` is an explicit one-way evidence gate, not an alias for any ordinary status carrying `durableRejection: true`. It may be literal `true` only when a future Artifact controller has validated an owner-branded durable rejection before transaction admission and therefore also supplies `admissionAccepted: false`; Version 1 deliberately provides no such brand or producer, so its controller never invokes this classifier branch. `admissionAccepted: false` by itself rejects. A Bootstrap ordinary status with `resultCode: "terminal_quiescence_rejected"` already names an admitted transaction and must never set this gate. It remains a transitional nonterminal observation inside Artifact's fixed bounded poll and is not passed to Receipt as `receiptValid: false`: a later Host-proof-backed immutable critical terminal plus exact bundle yields `validated_critical_failure`, while deadline exhaustion yields `controller_incomplete_no_production_claim`. `receipt_invalid_no_production_claim` is reserved for a terminal bundle that actually reaches Receipt validation and fails.

Build final status only from validated closeout bytes and safe validator outputs:

```js
const CONTROLLER_TO_HOST_FINAL_STATE = Object.freeze(Object.fromEntries(
  Object.entries(HOST_TO_CONTROLLER_RESULT).map(([hostState, controllerResult]) => [controllerResult, hostState]),
));

export function buildControllerFinalStatus({
  controllerCloseoutBytes,
  closeoutBindings,
  actionsArtifactObservation,
  validatedFinalHostStatus,
  artifactReleaseTag,
  backupResult,
  observedAt,
}) {
  const closeout = validateControllerCloseoutBytes(controllerCloseoutBytes, closeoutBindings);
  const controllerCloseoutSha256 = sha256Hex(controllerCloseoutBytes);
  const hostFinalState = CONTROLLER_TO_HOST_FINAL_STATE[closeout.controllerResult] ?? null;
  const resultKind = hostFinalState === null ? "no_claim" : "terminal";
  let observation = null;
  if (actionsArtifactObservation !== null) {
    validateActionsArtifactObservation(actionsArtifactObservation.value, {
      runId: closeout.originalRunId,
      runAttempt: closeout.originalRunAttempt,
      payloadSha256: controllerCloseoutSha256,
      minimumRetentionDays: 35,
    });
    observation = actionsArtifactObservation;
  }
  validateFinalStatusBranch({
    resultKind,
    closeout,
    hostFinalState,
    observation,
    validatedFinalHostStatus,
    artifactReleaseTag,
    backupResult,
    observedAt,
  });
  const value = Object.freeze({
    schemaVersion: 1,
    domain: "controller-final-status",
    resultKind,
    runId: closeout.originalRunId,
    runAttempt: closeout.originalRunAttempt,
    controllerRecoveryId: closeout.controllerRecoveryId,
    productionGateReceiptSha256: closeout.productionGateReceiptSha256,
    deploymentPlanSha256: closeout.deploymentPlanSha256,
    inventoryReceiptSha256: closeout.inventoryReceiptSha256,
    sourceCommit: closeout.sourceCommit,
    target: closeout.target,
    releaseUnit: closeout.releaseUnit,
    resultCode: closeout.controllerResult,
    terminal: resultKind === "terminal",
    validationState: resultKind === "terminal" ? "validated" : "no_claim",
    hostFinalState,
    terminalReceiptSha256: resultKind === "terminal" ? closeout.terminalReceiptSha256 : null,
    transactionInvocationSha256: resultKind === "terminal"
      ? closeout.transactionInvocationSha256
      : null,
    controllerCloseoutSha256,
    actionsArtifactObservationSha256: observation?.sha256 ?? null,
    finalHostStatusSha256: validatedFinalHostStatus?.responseSha256 ?? null,
    artifactReleaseTag,
    backupResult: resultKind === "terminal" ? backupResult : null,
    runnerCleanupVerified: closeout.runnerCleanupVerified,
    observedAt,
  });
  const bytes = serializeCanonicalJsonBytes(value, CONTROLLER_FINAL_STATUS_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function validateControllerFinalStatus(bytes, expected) {
  const value = parseCanonicalJsonBytes(bytes, CONTROLLER_FINAL_STATUS_CONTRACT);
  validateControllerFinalStatusBindings(value, expected);
  validateFinalStatusBranch(value);
  return deepFreeze(value);
}
```

For a terminal branch, `validatedFinalHostStatus` is exactly the aggregate object returned by Task 4 `validateUploadCommittedObserved(...)` after the one ACK attempt and a separate complete-envelope ordinary `status` readback: `{ status, responseSha256 }`. `status` remains the exact frozen sixteen-field Bootstrap-private reference and is passed unchanged through `assertValidatedOrdinaryStatus`; `responseSha256` hashes those exact post-ACK `responseBytes`. The preceding `validateAckResponse(...)` return is distinct evidence and cannot substitute for this object. `validatedFinalHostStatus` is never the transport envelope, raw response, ACK specialization, flattened/spread status, or independently reconstructed lookalike. For no-claim, it is `null`. `validateFinalStatusBranch` byte-compares the terminal host state, transaction invocation, receipt/closeout/observation/bundle digests, result mapping, plan/source/run bindings, artifact Release tag, backup result, cleanup proof, and observed time through `validatedFinalHostStatus.status`, and requires the owner brand to bind the same terminal receipt/fence. For the critical row that brand is downstream of Host `assertCriticalPostPublicationProof`; for the other four rows no critical proof is requested. It rejects a no-claim carrying terminal evidence and a terminal branch missing either the publication-time terminal bundle or later ordinary-status proof.

The Base64 fields preserve the exact already validated canonical aggregate-safe receipt, outer record, and initial host closeout record inside the single controller artifact; they are not SSH stdout or mutable host state. `buildActionsArtifactObservation` validates and canonicalizes repository, original run/attempt, artifact ID/name, API archive digest, canonical payload digest, byte size, `created_at`, `expires_at`, and a complete readback timestamp. It computes a separate observation SHA-256 used by `status_closeout_ack` and the host's `upload_committed_observed` record. The controller schema is a closed discriminated union: a terminal branch requires terminal/outer-record/initial-closeout bytes and digests, Receipt's exact `transactionInvocationSha256`, and initial `controllerCloseoutArtifactState: not_started`; the controller payload never changes that state after host CAS. `admission_rejected_no_transaction` additionally requires the literal `preAdmissionDurableRejection: true` classification gate and all host receipt/lease/invocation fields to be `null`; a transaction-bound `terminal_quiescence_rejected` cannot enter that row or a receipt-invalid row merely by being observed. Receipt-invalid and controller-incomplete branches can cite only independently validated safe bindings and never a production result.

- [ ] **Step 4 (3 min): Run GREEN and byte-stability tests**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: every mapping and metadata boundary passes; rebuilding with the same values yields byte-identical payload, observation, and final-status digests; adding API metadata never changes the payload bytes; the exact controller output bytes are accepted unchanged by the shared Deploy Note fixture; every no-claim branch remains ineligible.

- [ ] **Step 5 (2 min): Commit controller closeout**

```powershell
git add schemas/control-plane-controller-final-status-v1.schema.json server/services/deployment/control-plane-receipt-contract.mjs server/services/deployment/control-plane-controller-closeout.mjs server/tests/helpers/control-plane-receipt-fixtures.mjs server/tests/control-plane-controller-closeout.test.mjs
git commit -m "feat(deploy): build controller closeout and final status"
```

---

### Task 4: Add The Receipt-Owned Controller Closeout Adapter And Workflow CLI

**Files:**
- Create: `server/services/deployment/control-plane-controller-closeout-adapter.mjs`
- Create: `scripts/control-plane-controller-closeout.mjs`
- Create: `server/tests/control-plane-controller-closeout-adapter.test.mjs`
- Modify: `server/tests/control-plane-controller-closeout.test.mjs`
- Modify: `server/tests/helpers/control-plane-receipt-fixtures.mjs`
- Modify: `server/tests/control-plane-host-terminal-publisher.test.mjs`

**Entry gate:** Bootstrap Tasks 9-10 are complete before this task. Run these Windows/PowerShell checks here, not before Tasks 1-3:

```powershell
Test-Path server/services/deployment/control-plane-host-protocol.mjs
Test-Path server/services/deployment/control-plane-transport-contract.mjs
Test-Path server/services/deployment/control-plane-controller-closeout-store.mjs
Test-Path server/services/deployment/control-plane-bootstrap-maintenance.mjs
node --input-type=module -e "Promise.all([import('./server/services/deployment/control-plane-host-protocol.mjs'), import('./server/services/deployment/control-plane-bootstrap-maintenance.mjs')]).then(([m, maintenance]) => { const expected=['schemaVersion','domain','transition','repository','workflowPath','workflowRef','workflowSha','environment','runId','runAttempt','controllerRecoveryId','terminalReceiptSha256','expectedCloseoutRecordSha256','actionsArtifactObservationSha256']; if (JSON.stringify(m.CLOSEOUT_TRANSITION_BINDING_FIELDS) !== JSON.stringify(expected)) throw new Error('closeout_transition_fields_drift'); for (const name of ['assertValidatedOrdinaryStatus','encodeTerminalBundleChunkRequest','encodeTerminalBundleChunkResponse','validateTerminalBundleChunkResponse','readTerminalBundleBytes']) if (typeof m[name] !== 'function') throw new Error('terminal_bundle_abi_missing'); for (const name of ['createBootstrapMaintenanceCoordinator','assertBootstrapMaintenanceCapability']) if (typeof maintenance[name] !== 'function') throw new Error('maintenance_abi_missing'); })"
```

Expected: all four paths return `True`, and the exact Bootstrap-owned field-order, ordinary-status brand, terminal-bundle helper, and maintenance surfaces exit `0`. Any mismatch stops this task; Receipt does not add a compatibility tuple, status brand, chunk codec/reader, compactor, or substitute registration provider.

**Interfaces:**
- Imports without redefining from Bootstrap-owned `control-plane-host-protocol.mjs`: `CLOSEOUT_TRANSITIONS`, `CLOSEOUT_TRANSITION_BINDING_FIELDS`, `createCloseoutTransitionBinding(input) -> { value, bytes, sha256 }`, `deriveCloseoutTransitionOidcAudience({ transition, bindingSha256 })`, `encodeCloseoutUploadStartedFrame({ binding, oidcTokenBytes })`, `encodeCloseoutAckFrame({ binding, oidcTokenBytes })`, `encodeStatusRequestFrame({ requestId, gateId, deploymentPlanSha256, transactionId })`, `parseHostRequestFrame(bytes)`, `validateStatusResponseFrame(bytes, expected)`, and `assertValidatedOrdinaryStatus(value)`. Receipt defines no transition enum, field list, audience grammar, ordinary-status brand, status/chunk frame shape, chunk reader, or response decoder. Task 4 conformance tests additionally import Bootstrap's `readTerminalBundleBytes(...)` and host-only `encodeTerminalBundleChunkResponse(...)`; production Receipt code imports neither helper.
- The imported full binding tuple is exactly `schemaVersion`, `domain`, `transition`, `repository`, `workflowPath`, `workflowRef`, `workflowSha`, `environment`, `runId`, `runAttempt`, `controllerRecoveryId`, `terminalReceiptSha256`, `expectedCloseoutRecordSha256`, and `actionsArtifactObservationSha256`. Upload-start requires the observation field `null`; ACK requires exact lowercase SHA-256. Both transition requests carry one strict token byte field inside the Bootstrap-owned flat canonical frame, never a nested Receipt-owned OIDC record. The adapter passes the complete frozen `{ value, bytes, sha256 }` binding wrapper to every Bootstrap encoder/validator; a value-only handoff or added source-identity alias is not adapter ABI and cannot replace or extend that wrapper.
- Consumes: controller closeout builders/validators from Task 3, the Task 2 `validateHostTerminalBundleBytes(...)`, and `validateTransportEnvelope(envelope)` from Bootstrap for closeout responses. Artifact invokes Bootstrap `readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30000 })` on the already open `createSecureSshTransport({ native, clock, secretMaterializer })`, passes that same privately branded status plus the exact bundle wrapper to `validateTerminal(...)`, then passes the adapter's later request objects unchanged to that same transport's `.request(...)`. The adapter never constructs or receives a host/key tuple and never calls `.execute()` or `.requestBootstrap()`.
- Consumes for Task 4 conformance only: Bootstrap `createBootstrapMaintenanceCoordinator({ native, clock })` and Task 10 `createControllerCloseoutStore(...)`; the unchanged Task 2 test helpers invoke only real `runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })` and `registerPendingLease(...)` before Host composition. The real coordinator alone calls replay `readLedgerIdentity()`/`compactEligible({ expectedLedgerSha256, now, maintenanceCapability })` and closeout `readCompactionPreflight({ protectedNonterminalTransactionIds })`/`compactEligible({ retentionProof, now, maintenanceCapability })`.
- Produces: `createControllerCloseoutAdapter({ runnerMaterialStore, actionsArtifactClient, requestOidcToken, clock })` with exactly these methods: `validateTerminal`, `createNoClaimEvidence`, `cleanupAndReadBackRunnerMaterial`, `toControllerCloseoutInput`, `expectedBindings`, `createUploadStartedRequest`, `validateUploadStartedResponse`, `writeImmutableLocalFile`, `uploadActionsArtifact`, `readBackExactActionsArtifact`, `deleteLocalFileAndReadBackAbsent`, `createAckRequest`, `validateAckResponse`, `createCommittedStatusRequest`, and `validateUploadCommittedObserved`.
- Bootstrap owns `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs }) -> Promise<Object.freeze({ bytes, sha256 })>`. `timeoutMs` is exactly `30000`; `validatedStatus` must carry Bootstrap's private brand from `validateStatusResponseFrame(...)` and be immutable terminal. The helper fixes the credential ID internally, uses contiguous `TERMINAL_BUNDLE_CHUNK_BYTES: 768` chunks with a maximum of `TERMINAL_BUNDLE_MAX_BYTES: 262144` and `TERMINAL_BUNDLE_MAX_CHUNKS: 342`, validates every complete transport envelope and chunk response before extracting `responseBytes`, enforces the real encoded frame at or below 2,048 bytes, returns one owned canonical bundle Buffer plus its aggregate digest, and does not close the shared transport. Receipt owns no chunk constant, codec, reader, loop, or envelope extraction. Its closed errors are only `terminal_bundle_status_unverified`, `terminal_bundle_status_not_terminal`, `terminal_bundle_transport_failed`, `terminal_bundle_chunk_invalid`, `terminal_bundle_incomplete`, and `terminal_bundle_digest_mismatch`.
- `validateTerminal({ status, terminalBundle, plan, artifactAccepted })` is synchronous and pure. `status` is the unchanged privately branded frozen sixteen-field object returned by Bootstrap `validateStatusResponseFrame(...)`; Artifact must not spread, clone, reconstruct, or append a field to it and passes the same object to `readTerminalBundleBytes(...)`. `terminalBundle` is the exact `{ bytes, sha256 }` returned by that helper. `artifactAccepted` is canonical `null` only when the five-field `artifact_accepted_v1` response may have been lost after durable host acceptance, or the unchanged frozen five-field value returned by Bootstrap `validateArtifactAcceptedFrame(...)`; Receipt never adds an invocation digest to that acknowledgment. The validator requires `status.immutableTerminal === true`, `status.durableRejection === false`, one of the five terminal states, exact transaction/recovery/Gate/deployment-plan/receipt/initial-closeout bindings, a lowercase bundle digest, size in `1..262144`, `terminalBundle.sha256 === status.terminalBundleSha256`, and `terminalBundle.bytes.length === status.terminalBundleSize`.
- `validateTerminal(...)` first requires `status.gateId === plan.gateId`, then calls Task 2 `validateHostTerminalBundleBytes(terminalBundle.bytes, { transactionId: status.transactionId, controllerRecoveryId: status.controllerRecoveryId, productionGateReceiptSha256: plan.productionGateReceiptSha256, deploymentPlanSha256: status.deploymentPlanSha256, terminalBundleSha256: status.terminalBundleSha256, terminalBundleSize: status.terminalBundleSize, terminalReceiptSha256: status.terminalReceiptSha256, closeoutRecordSha256: status.closeoutRecordSha256 })`. It decodes owned bounded copies of the already strict Base64 fields and validates the accepted-plan/accepted-artifact/authorization-reservation/artifact-capability edges plus the Host-recomputed domain-separated transaction invocation binding recorded in the terminal receipt. If `artifactAccepted` is non-null, its exact Gate/plan/transaction/accepted-time selectors must agree; if null, durable terminal/status/receipt evidence remains mandatory and no acknowledgment is synthesized. It returns exactly frozen `{ hostFinalState, transactionInvocationSha256, terminalBundleSha256, terminalBundleSize, terminalReceiptBytes, terminalRecordBytes, initialHostCloseoutRecordBytes, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, closeoutLeaseSha256, closeoutIndexSha256, backupResult }`. The Task 2 validator rechecks every Receipt/outer/initial-closeout/lease/database edge. The adapter validates and discards the owned initial-lease bytes; no path, raw response, bundle bytes, lease bytes, selector, transport, or reader is returned.
- `expectedBindings({ plan })` returns exactly frozen `{ controllerRecoveryId, originalRunId, originalRunAttempt, productionGateReceiptSha256, transactionId, target, releaseUnit, sourceCommit, deploymentPlanSha256, inventoryReceiptSha256, bootstrapReceiptSha256 }`. It accepts no authorization/result override or digest alias and is the sole expected value passed to `validateControllerCloseoutBytes` for this run.
- `cleanupAndReadBackRunnerMaterial({ plan }) -> Promise<true>` accepts exactly that one key and uses only the injected runner store's fixed transaction-bound handles to remove/read back absent the raw artifact, candidate artifact, deployment/recovery OIDC buffers, and SSH-linked temporary material. Any unknown handle, partial cleanup, or surviving byte returns no boolean and blocks closeout. `toControllerCloseoutInput({ plan, terminal, runnerCleanupVerified })` accepts exactly those three keys, requires the literal `true`, and returns the exact frozen `buildControllerCloseout(...)` input with `admissionAccepted: true`, `receiptValid: true`, `controllerComplete: true`, the validated host state, `transactionInvocationSha256`, terminal receipt/record digests, three returned byte fields, and only plan-derived run/Gate/deployment-plan/inventory/bootstrap/source/target/release bindings. Lease/index digests remain validation evidence and are not extra controller-closeout input fields. Neither method accepts a path or result override.
- `createNoClaimEvidence({ plan, resultCode, runnerCleanupVerified })` accepts exactly one of `admission_rejected_no_transaction`, `receipt_invalid_no_production_claim`, or `controller_incomplete_no_production_claim` and returns exactly `{ immutable, closeoutBindings }`. A future Artifact controller may supply the admission result only as the unchanged output of the immediately preceding exact `classifyControllerCloseout({ preAdmissionDurableRejection: true, admissionAccepted: false })` call; Version 1 has no owner brand or producer and never calls that branch. Tests reject a raw admission literal, a transitional status projection, or any caller result override. `immutable` is the complete `{ value, bytes, sha256, artifactName, fileName }` returned by `buildControllerCloseout(...)`, with every host receipt/record/lease field `null`; `closeoutBindings` is the exact value accepted by `validateControllerCloseoutBytes`. It never returns `null` closeout bytes, never uploads an original closeout artifact, never permits a host transition, and may be written only as an exact run-attempt-scoped diagnostic/final-status artifact. It creates no fixed tag, Release asset, attestation, Deploy Note, host record, or reservation.
- `createUploadStartedRequest(...)` and `createAckRequest(...)` each mint one fresh transition-specific OIDC token and return exactly `{ credentialId: "japan-control-plane-github-deploy-v1", requestBytes, timeoutMs: 10000 }`. The Artifact controller passes that object unchanged to `transport.request(...)`.
- `validateUploadStartedResponse({ transportResult, immutable, expected })` and `validateAckResponse({ transportResult, immutable, observation, uploadStartedStatus, expected })` receive the complete transport envelope unchanged, first call Bootstrap-owned `validateTransportEnvelope(transportResult)`, reject every validated failure envelope, and pass only the resulting successful `responseBytes` to `validateStatusResponseFrame(...)`. Each returns its frozen decoded eight-field closeout status plus `responseSha256: sha256Hex(responseBytes)`. ACK validation proves the full second binding and requires its transition binding/JTI/token digests all differ from `uploadStartedStatus`; it does not claim that an independent ordinary status readback occurred.
- `createCommittedStatusRequest({ plan, immutable, observation, ackStatus })` is callable only after exactly one ACK transport attempt. `ackStatus` is either the validated ACK value or canonical `null` when that one request may have committed durably but its response was lost; the controller never resends/replays the ACK. It returns exactly `{ transportRequest, expectedStatus }`, where `transportRequest` is `{ credentialId: "japan-control-plane-github-deploy-v1", requestBytes, timeoutMs: 30000 }` and `expectedStatus` is `{ requestId, gateId, deploymentPlanSha256, transactionId }`. `requestId` is exactly `controller-closeout-final-${immutable.value.originalRunId}-${immutable.value.originalRunAttempt}` and is correlation only; it differs from every pre-closeout poll ID and grants no authority. `requestBytes` comes only from Bootstrap `encodeStatusRequestFrame(expectedStatus)`.
- `validateUploadCommittedObserved({ transportResult, immutable, observation, terminal, ackStatus, expectedStatus })` receives a second, independent complete transport envelope unchanged, validates it through Bootstrap, and passes only successful `responseBytes` to `validateStatusResponseFrame(responseBytes, expectedStatus)`. It immediately passes that exact returned reference through `assertValidatedOrdinaryStatus` and requires the ordinary response's `requestType: "status"`, exact Gate/deployment-plan tuple, `immutableTerminal: true`, `durableRejection: false`, exact controller result/host final state/terminal receipt/invocation binding, unchanged `terminalBundleSha256`/`terminalBundleSize` from `terminal`, and `closeoutState: "upload_committed_observed"`. With non-null `ackStatus`, it also requires the same closeout-record digest; with null it derives no ACK evidence and accepts only the independently read durable committed state bound to the exact observation. Any `upload_started`, pending, mismatched, or absent state fails, and no second ACK is sent. For critical, Bootstrap could issue this private brand only after consuming Host's same-reference `assertCriticalPostPublicationProof`; for non-critical it uses the frozen owner state matrix and no critical proof. The function returns exactly frozen `{ status, responseSha256: sha256Hex(responseBytes) }`, preserving `status` unchanged; only this return value is `validatedFinalHostStatus` for `buildControllerFinalStatus(...)`.
- `readBackExactActionsArtifact({ uploaded, immutable, plan })` returns the complete validated `buildActionsArtifactObservation(...)` wrapper `{ value, bytes, sha256 }`, not `value` alone and not raw REST metadata. `createAckRequest(...)`, `validateUploadCommittedObserved(...)`, and `buildControllerFinalStatus(...)` receive that same wrapper unchanged.
- `writeImmutableLocalFile(immutable) -> localHandle`, `uploadActionsArtifact({ immutable, localHandle }) -> uploadHandle`, and `deleteLocalFileAndReadBackAbsent(localHandle) -> true` use module-private branded handles. The caller cannot read or provide a path, artifact name, filename, bytes, retention, or archive shape; the adapter derives those from `immutable` and hard-wires one file plus `retentionDays: 35`.
- A closeout `status_response_v1` safe value has exactly the ordered fields `type`, `requestType`, `transactionId`, `closeoutState`, `closeoutRecordSha256`, `transitionBindingSha256`, `oidcJtiSha256`, and `oidcTokenSha256`. Upload-start requires `requestType: "status_closeout_upload_started"` and `closeoutState: "upload_started"`; ACK requires `requestType: "status_closeout_ack"` and `closeoutState: "upload_committed_observed"`. The final three fields are required lowercase SHA-256 only for these two responses, and a normal status response cannot satisfy either closeout validator.
- An ordinary `status_response_v1` safe value has exactly the ordered fields `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `controllerRecoveryId`, `immutableTerminal`, `durableRejection`, `resultCode`, `hostFinalState`, `terminalReceiptSha256`, `closeoutState`, `closeoutRecordSha256`, `terminalBundleSha256`, and `terminalBundleSize`. It fixes `requestType: "status"`; Bootstrap validates and privately brands the exact `{ requestId, gateId, deploymentPlanSha256, transactionId }` request tuple and enforces its terminal/rejection/nullability matrix. `controllerRecoveryId` is host evidence resolved from the accepted plan and never a request selector. Only an immutable terminal has a 64-hex terminal-bundle digest and integer size in `1..262144`; both fields are `null` otherwise. Closeout-specialization token/JTI/binding fields cannot appear in this independent readback.
- A terminal-bundle request has caller input exactly `{ requestId, gateId, deploymentPlanSha256, transactionId, terminalBundleSha256, offset }` and Bootstrap fixes `type: "status_terminal_bundle_chunk"`. Its response has exactly ordered fields `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `terminalBundleSha256`, `totalBytes`, `offset`, `chunkSha256`, `chunkBytesBase64`, and `eof`, with `type: "terminal_bundle_chunk_v1"`, `requestType: "status_terminal_bundle_chunk"`, raw decoded chunk length at most 768 bytes, and the complete canonical framed response at most 2,048 bytes. The validator expected object is those six request fields plus `totalBytes`; offsets are exact multiples of 768 except the final short chunk, and no more than 342 responses may be consumed. Neither Receipt nor Artifact implements a second encoder, validator, reader, or chunk state machine.
- A fresh mutable `oidcTokenBytes` exists only between `requestOidcToken(...)` and Bootstrap frame encoding. The adapter hashes it for safe reuse comparison, encodes it once, and zeroes the original buffer in `finally`; Bootstrap transport later zeroes `requestBytes`. Neither token nor JTI enters payload bytes, Actions artifacts, logs, summaries, errors, or durable runner state.
- Only a validated terminal `controller_closeout` may call `createUploadStartedRequest` or `createAckRequest`. All three no-claim results reject both methods before OIDC minting and host transport; they may produce only their bounded diagnostic/final-status artifact with no host CAS.
- Receipt never owns a final-status path or write method. Artifact injects and owns `finalStatusSink.writeExact({ bytes, sha256 })`; both terminal and no-claim branches pass it only the unchanged object returned by `buildControllerFinalStatus(...)` after Receipt validation.
- Produces workflow-only commands: `terminal-validate`, `closeout-build`, `upload-start`, `artifact-readback`, `upload-ack`, and `closeout-validate`.
- Reads: one bounded canonical JSON request from stdin or one exact aggregate-safe file selected by the fixed workflow adapter. `CONTROL_PLANE_CLOSEOUT_TRANSITION_OIDC_TOKEN` is read only for `upload-start`/`upload-ack`, deleted from the process environment before frame encoding, and never accepted in stdin.
- Writes: one canonical safe response to stdout; diagnostics contain only a closed code and exit nonzero.

- [ ] **Step 1 (5 min): Add RED adapter-surface, transition-OIDC, and ordering tests**

First bind Task 2's capability consumer to the real Bootstrap Task 10 provider:

```js
await runRegisterPendingLeaseConsumerContract({
  createProvider: () => createControllerCloseoutStore(
    createBootstrapCloseoutStoreHarness(),
  ),
});
await runTerminalCloseoutMaintenanceConsumerContract({
  createProvider: () => createBootstrapMaintenanceCoordinator({
    native: completeFoundationNativeHarness(),
    clock: fixedClock,
  }),
});
```

These real-provider rows must pass before any adapter assertion. They prove Task 2 remained provider-independent while Bootstrap's actual maintenance coordinator and `registerPendingLease(...)` conform before Host Tasks 11-13 compose them. Fill replay ledger to 128/129 and closeout index to 1,024/1,025 with entries whose `finalState` is always a member of imported Host `HOST_FINAL_STATES`; never use controller results or synthetic maintenance states. Table-drive age 35-days-minus-one-millisecond/exactly-35-days, active/nonterminal, newest-per-target, newest-critical, parser-required, and recovery-referenced protection. An eligible 129th/1,025th operation succeeds only after the owner coordinator's deterministic CAS; an all-protected full store rejects without registration. Inject crash before/after replay CAS and closeout CAS, reconstruct all stores/coordinator as after reboot, and require idempotent convergence with the fixed lock released/read back. Forged retention proof/capability, stale digest, lock loss, direct compactor call, or caller time performs zero Receipt write.

Then require the exact method surface and two distinct transport requests:

```js
const adapter = createControllerCloseoutAdapter(createAdapterHarness());
assert.deepEqual(Object.keys(adapter), [
  "validateTerminal",
  "createNoClaimEvidence",
  "cleanupAndReadBackRunnerMaterial",
  "toControllerCloseoutInput",
  "expectedBindings",
  "createUploadStartedRequest",
  "validateUploadStartedResponse",
  "writeImmutableLocalFile",
  "uploadActionsArtifact",
  "readBackExactActionsArtifact",
  "deleteLocalFileAndReadBackAbsent",
  "createAckRequest",
  "validateAckResponse",
  "createCommittedStatusRequest",
  "validateUploadCommittedObserved",
]);

const terminalHarness = createExactTerminalBundleTransportHarness({
  encodeTerminalBundleChunkResponse,
  terminalBundle: validTerminalBundleOverOneChunk(),
});
const terminalBundle = await readTerminalBundleBytes({
  transport: terminalHarness.transport,
  validatedStatus: terminalHarness.validatedOrdinaryStatus,
  timeoutMs: 30_000,
});
const terminal = adapter.validateTerminal({
  status: terminalHarness.validatedOrdinaryStatus,
  terminalBundle,
  plan,
  artifactAccepted: terminalHarness.validatedArtifactAccepted,
});
assert.equal(terminal.terminalBundleSha256, terminalHarness.bundleSha256);
assert.equal(terminal.terminalBundleSize, terminalHarness.bundleBytes.length);
assert.equal(terminal.terminalReceiptSha256, terminalHarness.terminalReceiptSha256);
assert.equal(terminal.transactionInvocationSha256, terminalHarness.transactionInvocationSha256);
assert.equal(
  terminalHarness.requests.length,
  Math.ceil(terminalHarness.bundleBytes.length / 768),
);
assert.equal(terminalHarness.requests.every((request, index) =>
  request.credentialId === "japan-control-plane-github-deploy-v1"
  && request.timeoutMs === 30_000
  && parseHostRequestFrame(request.requestBytes).value.offset
    === index * 768), true);

const started = await adapter.createUploadStartedRequest(validUploadStartedInput());
const acknowledged = await adapter.createAckRequest(validAckInput());
const committed = adapter.createCommittedStatusRequest(validCommittedStatusInput());
assert.deepEqual(started, {
  credentialId: "japan-control-plane-github-deploy-v1",
  requestBytes: started.requestBytes,
  timeoutMs: 10_000,
});
assert.equal(started.requestBytes.equals(acknowledged.requestBytes), false);
const startedFrame = parseHostRequestFrame(started.requestBytes).value;
const acknowledgedFrame = parseHostRequestFrame(acknowledged.requestBytes).value;
assert.equal(startedFrame.type, "status_closeout_upload_started");
assert.equal(startedFrame.transition, "upload_started");
assert.equal(startedFrame.actionsArtifactObservationSha256, null);
assert.equal(acknowledgedFrame.type, "status_closeout_ack");
assert.equal(acknowledgedFrame.transition, "upload_committed_observed");
assert.equal(acknowledgedFrame.actionsArtifactObservationSha256, validObservation.sha256);
assert.deepEqual(Object.keys(committed), ["transportRequest", "expectedStatus"]);
assert.deepEqual(committed.expectedStatus, {
  requestId: `controller-closeout-final-${originalRunId}-${originalRunAttempt}`,
  gateId,
  deploymentPlanSha256,
  transactionId,
});
const committedFrame = parseHostRequestFrame(committed.transportRequest.requestBytes).value;
assert.equal(committedFrame.type, "status");
assert.equal(committedFrame.requestId, committed.expectedStatus.requestId);
assert.deepEqual(requestedAudiences.map(({ transition }) => transition), [
  "upload_started",
  "upload_committed_observed",
]);
assert.deepEqual(observedTransportEnvelopeKeys, [
  ["diagnosticCode", "exitCode", "responseBytes"],
  ["diagnosticCode", "exitCode", "responseBytes"],
  ["diagnosticCode", "exitCode", "responseBytes"],
]);
assert.notEqual(validatedTransitionDigests[0].oidcTokenSha256, validatedTransitionDigests[1].oidcTokenSha256);
assert.notEqual(validatedTransitionDigests[0].oidcJtiSha256, validatedTransitionDigests[1].oidcJtiSha256);
assert.equal(mintedTokenBuffers.every((bytes) => bytes.every((value) => value === 0)), true);
```

`createExactTerminalBundleTransportHarness(...)` is a test-only fixture in `server/tests/helpers/control-plane-receipt-fixtures.mjs`. It uses the real host-only Bootstrap `encodeTerminalBundleChunkResponse(...)` to emit one valid `terminal_bundle_chunk_v1` per parsed real request; it does not copy the request/response contract, constants, or reader. Make its Receipt-built valid canonical bundle exceed 768 bytes. Prove one transport instance receives contiguous 768-byte offsets, every internal request uses the fixed credential and 30-second timeout, `readTerminalBundleBytes(...)` returns only `{ bytes, sha256 }`, and neither that Bootstrap helper nor pure `validateTerminal(...)` closes/replaces the instance. Bootstrap-helper tests reject an unbranded/nonterminal status, status/bundle digest or size mismatch, zero/oversize size, envelope failure, non-null diagnostic, wrong request ID/transaction/recovery/Gate/deployment-plan/digest/offset, duplicate/reordered/missing/short non-final/over-768-byte chunk, a canonical encoded response over 2,048 bytes, wrong chunk hash, early/late EOF, more than 342 chunks, and aggregate mismatch. Include real maximum-width IDs/digests and 768 raw bytes in the encoded-size boundary case, then prove 769 raw bytes rejects. Receipt tests reject noncanonical bundle bytes/Base64, wrong adjacent digest, invalid Receipt/outer/initial-closeout/lease/database vector, and any attempted path/logical-ID/store/reader input before cleanup, OIDC, closeout CAS, or Actions upload.

Do not mock `readTerminalBundleBytes`, `createCloseoutTransitionBinding`, either Bootstrap transition encoder, `encodeStatusRequestFrame`, `parseHostRequestFrame`, `validateStatusResponseFrame`, or `assertValidatedOrdinaryStatus` in these positive tests; the combined conformance row must round-trip the real Bootstrap reader into the Receipt-owned canonical bundle validator, both real closeout frames, and the real post-ACK ordinary status frame. Reject one token or JTI reused across transitions, wrong/missing expected closeout digest, observation on upload-start, missing observation on ACK, recovery-challenge audience, wrong repository/workflow path/ref/SHA/Environment/run/attempt/recovery ID, nonzero exit, non-null diagnostic, whole-envelope-as-bytes, wrong response type/request ID, reused pre-closeout poll ID, ordinary-status/closeout-specialization interchange, a post-ACK state other than `upload_committed_observed`, changed terminal-bundle digest/size after ACK, ACK response substituted as final status, a flattened/spread/cloned owner status, and a caller-supplied credential ID/timeout/host/key field. For each imported Host final state, assert `validatedFinalHostStatus` has exact keys `status,responseSha256`, the nested status passes `assertValidatedOrdinaryStatus` by reference, and no proof field is present. The critical row succeeds only through Bootstrap's harness that first consumes Host `assertCriticalPostPublicationProof`; held-lock publication evidence, a Host lookalike, or an individual transitional `terminal_quiescence_pending|terminal_quiescence_rejected` response cannot itself yield a terminal bundle or final status, although bounded polling may later obtain the branded immutable critical terminal. The four non-critical rows never call the Host critical-proof reader. Add one response-loss row in which exactly one ACK request is observed, its response is unavailable, `ackStatus` is null, no retry occurs, and the separate ordinary status succeeds only from durable `upload_committed_observed`; a host still at `upload_started` rejects. Assert no-claim invokes neither terminal-bundle retrieval, OIDC, nor transport. Assert the terminal sequence is terminal-status/bundle validation -> cleanup/readback -> upload-start request/validated response -> local immutable write -> 35-day upload/readback -> local delete/readback -> exactly one ACK attempt -> independent read-only ordinary status request/committed-state validation.

Exercise every no-claim result through the exact bytes contract:

```js
const noClaim = adapter.createNoClaimEvidence({
  plan,
  resultCode: "controller_incomplete_no_production_claim",
  runnerCleanupVerified: true,
});
assert.ok(Buffer.isBuffer(noClaim.immutable.bytes));
assert.equal(noClaim.immutable.value.terminalReceiptSha256, null);
assert.equal(
  validateControllerCloseoutBytes(noClaim.immutable.bytes, noClaim.closeoutBindings)
    .controllerResult,
  "controller_incomplete_no_production_claim",
);
const noClaimFinalStatus = buildControllerFinalStatus({
  controllerCloseoutBytes: noClaim.immutable.bytes,
  closeoutBindings: noClaim.closeoutBindings,
  actionsArtifactObservation: null,
  validatedFinalHostStatus: null,
  artifactReleaseTag: null,
  backupResult: null,
  observedAt: fixedObservedAt,
});
await artifactOwnedFinalStatusSink.writeExact({
  bytes: noClaimFinalStatus.bytes,
  sha256: noClaimFinalStatus.sha256,
});
```

Assert the Receipt adapter exposes neither `writeFinalStatusExact` nor a final-status path, and all three no-claim rows use non-null immutable closeout bytes, a `null` observation, a `null` validated final host status, and zero closeout/Actions upload calls before the Artifact-owned sink writes the exact Receipt-built final-status bytes.

- [ ] **Step 2 (5 min): Add RED isolated-process CLI tests**

Spawn a fresh Node process for each command; do not replace global `process.stdout.write` in the Node test process.

```js
const result = spawnSync(
  process.execPath,
  ["scripts/control-plane-controller-closeout.mjs", "closeout-build"],
  { cwd: repositoryRoot, input: canonicalInputBytes, encoding: "utf8" },
);

assert.equal(result.status, 0);
assert.equal(result.stderr, "");
assert.equal(result.stdout.endsWith("\n"), false);
```

Test unknown/missing/extra commands, oversized stdin, non-canonical input, a raw host error, upload ACK before observation, absent transition OIDC, and any request that attempts to set host artifact state directly.

- [ ] **Step 3 (2 min): Run RED and verify adapter and entrypoint are absent**

```powershell
node --test server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-controller-closeout.test.mjs
```

Expected: the real Bootstrap registration-provider conformance row is green, then `ERR_MODULE_NOT_FOUND` for the adapter or a nonzero child-process exit because the script does not exist.

- [ ] **Step 4 (5 min): Implement pure terminal-bundle-to-Receipt validation and Bootstrap-reader conformance**

Keep the Receipt adapter pure and consume only Bootstrap's exact opaque return:

```js
function validateTerminal({ status, terminalBundle, plan, artifactAccepted }) {
  assertValidatedImmutableTerminalStatus(status, plan);
  if (status.gateId !== plan.gateId) {
    throw safeCloseoutError("controller_terminal_gate_binding_invalid");
  }
  assertCanonicalArtifactAcceptedOrLostResponse(artifactAccepted, plan);
  assertExactKeys(terminalBundle, ["bytes", "sha256"]);
  if (!Buffer.isBuffer(terminalBundle.bytes)
      || terminalBundle.sha256 !== status.terminalBundleSha256
      || terminalBundle.bytes.length !== status.terminalBundleSize) {
    throw safeCloseoutError("controller_terminal_bundle_binding_invalid");
  }
  const validated = validateHostTerminalBundleBytes(terminalBundle.bytes, {
    transactionId: status.transactionId,
    controllerRecoveryId: status.controllerRecoveryId,
    productionGateReceiptSha256: plan.productionGateReceiptSha256,
    deploymentPlanSha256: status.deploymentPlanSha256,
    terminalBundleSha256: status.terminalBundleSha256,
    terminalBundleSize: status.terminalBundleSize,
    terminalReceiptSha256: status.terminalReceiptSha256,
    closeoutRecordSha256: status.closeoutRecordSha256,
  });
  return toValidatedTerminalResult({ validated, status, plan, artifactAccepted });
}
```

`assertValidatedImmutableTerminalStatus(...)` requires the exact sixteen owner fields and byte-equal plan/Gate/deployment-plan/run bindings; it never clones or rebrands the owner value. `assertCanonicalArtifactAcceptedOrLostResponse(...)` accepts only canonical `null` or the exact unchanged five-field Bootstrap validator return, never an embellished acknowledgment; it compares the non-null selectors/time with the terminal receipt but obtains `transactionInvocationSha256` only from the validated host receipt/accepted-plan/artifact/reservation/capability chain. `toValidatedTerminalResult(...)` decodes owned copies from the already strict canonical value, returns only the frozen safe `validateTerminal(...)` shape including that invocation digest, and discards the validated owned lease bytes. Neither internal function is exported. The conformance test obtains `terminalBundle` only by `await readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30_000 })`; Artifact performs exactly that same composition and owns the outer `finally { await transport.close(); }`.

- [ ] **Step 5 (5 min): Implement the exact adapter and transition-specific requests**

Use only the imported Bootstrap builders before requesting one-use OIDC:

```js
async function createTransitionRequest(input, encodeFrame, requestOidcToken, tokenReplayGuard) {
  assertValidatedTerminalCloseout(input.immutable);
  const transition = requireExactTransition(input.transition);
  const binding = createCloseoutTransitionBinding(input);
  const audience = deriveCloseoutTransitionOidcAudience({
    transition,
    bindingSha256: binding.sha256,
  });
  let oidcTokenBytes;
  try {
    oidcTokenBytes = await requestOidcToken({
      audience,
      transition,
      bindingSha256: binding.sha256,
    });
    const tokenSha256 = sha256Hex(oidcTokenBytes);
    tokenReplayGuard.reserveDistinct({ transition, tokenSha256 });
    const requestBytes = encodeFrame({ binding, oidcTokenBytes });
    return Object.freeze({
      credentialId: "japan-control-plane-github-deploy-v1",
      requestBytes,
      timeoutMs: 10_000,
    });
  } finally {
    oidcTokenBytes?.fill(0);
  }
}

function requireValidatedTransitionResponse(transportResult, expected) {
  const envelope = validateTransportEnvelope(transportResult);
  if (envelope.exitCode !== 0) {
    throw safeCloseoutError("controller_closeout_transport_response_invalid");
  }
  const value = validateStatusResponseFrame(envelope.responseBytes, expected);
  return Object.freeze({
    ...value,
    responseSha256: sha256Hex(envelope.responseBytes),
  });
}

function requireValidatedOrdinaryStatusResponse(transportResult, expectedStatus) {
  const envelope = validateTransportEnvelope(transportResult);
  if (envelope.exitCode !== 0) {
    throw safeCloseoutError("controller_closeout_final_status_transport_invalid");
  }
  const status = validateStatusResponseFrame(envelope.responseBytes, expectedStatus);
  assertValidatedOrdinaryStatus(status);
  if (status.requestType !== "status") {
    throw safeCloseoutError("controller_closeout_final_status_type_invalid");
  }
  return Object.freeze({
    status,
    responseSha256: sha256Hex(envelope.responseBytes),
  });
}
```

`createUploadStartedRequest` calls the imported builder with `transition: "upload_started"` and `actionsArtifactObservationSha256: null`; `createAckRequest` calls it with `transition: "upload_committed_observed"` and `observation.sha256` from the validated wrapper. Each passes the complete frozen binding wrapper to the Bootstrap frame encoder; no adapter method accepts a value-only binding or appends source-identity aliases. `validateUploadStartedResponse` and `validateAckResponse` receive the complete outer transport envelope, use `requireValidatedTransitionResponse`, byte-compare the full binding, and reject equal transition token/JTI digests. ACK success then authorizes only `createCommittedStatusRequest`; it is not itself the final readback. `validateUploadCommittedObserved` receives a separate complete outer transport envelope, uses `requireValidatedOrdinaryStatusResponse`, validates the exact ordinary-status Gate/deployment-plan/terminal/bundle/closeout matrix through the nested owner reference against immutable/observation/terminal/ACK, and returns the only `validatedFinalHostStatus` accepted by `buildControllerFinalStatus`. Receipt creates no second status brand or flattened projection: it preserves `{ status, responseSha256 }`, and `assertValidatedOrdinaryStatus(status)` rejects every spread/clone/caller lookalike. The adapter's artifact methods enforce the exact filename, one-file archive, `retentionDays: 35`, API archive digest, payload digest, timestamp interval, local deletion/readback, and final host-record digest. `readBackExactActionsArtifact` constructs and validates the entire observation wrapper once; no controller call extracts the inner value before ACK or final-status construction.

The Artifact controller consumes the exact terminal surface in this order. `terminalStatus` is the unchanged privately branded sixteen-field value returned by the prior normal status poll:

```js
const terminalBundle = await readTerminalBundleBytes({
  transport,
  validatedStatus: terminalStatus,
  timeoutMs: 30_000,
});
const terminal = adapter.validateTerminal({
  status: terminalStatus,
  terminalBundle,
  plan,
  artifactAccepted,
});
const runnerCleanupVerified = await adapter.cleanupAndReadBackRunnerMaterial({ plan });
const immutable = buildControllerCloseout(adapter.toControllerCloseoutInput({
  plan,
  terminal,
  runnerCleanupVerified,
}));
const uploadStartedStatus = adapter.validateUploadStartedResponse({
  transportResult: await transport.request(await adapter.createUploadStartedRequest({ plan, immutable })),
  immutable,
  expected: adapter.expectedBindings({ plan }),
});
const localHandle = await adapter.writeImmutableLocalFile(immutable);
const uploaded = await adapter.uploadActionsArtifact({ immutable, localHandle });
const observation = await adapter.readBackExactActionsArtifact({ uploaded, immutable, plan });
await adapter.deleteLocalFileAndReadBackAbsent(localHandle);
const ackRequest = await adapter.createAckRequest({
  plan,
  immutable,
  observation,
  uploadStartedStatus,
});
const ackResult = await transport.request(ackRequest);
let ackStatus = null;
try {
  ackStatus = adapter.validateAckResponse({
    transportResult: ackResult,
    immutable,
    observation,
    uploadStartedStatus,
    expected: adapter.expectedBindings({ plan }),
  });
} catch (error) {
  if (!isPossiblyLostCloseoutResponse(ackResult, error)) throw error;
}
const committedStatusRequest = adapter.createCommittedStatusRequest({
  plan,
  immutable,
  observation,
  ackStatus,
});
const validatedFinalHostStatus = adapter.validateUploadCommittedObserved({
  transportResult: await transport.request(committedStatusRequest.transportRequest),
  immutable,
  observation,
  terminal,
  ackStatus,
  expectedStatus: committedStatusRequest.expectedStatus,
});
const finalStatus = buildControllerFinalStatus({
  controllerCloseoutBytes: immutable.bytes,
  closeoutBindings: adapter.expectedBindings({ plan }),
  actionsArtifactObservation: observation,
  validatedFinalHostStatus,
  artifactReleaseTag: plan.artifact.releaseTag,
  backupResult: terminal.backupResult,
  observedAt: clock.now().toISOString(),
});
await artifactOwnedFinalStatusSink.writeExact({
  bytes: finalStatus.bytes,
  sha256: finalStatus.sha256,
});
```

The tests assert Bootstrap's bundle reader and all three closeout/final-status validators receive complete outer transport envelopes unchanged, and the same observation wrapper reaches the one ACK attempt and independent committed-state validation. When the ACK response is present, `ackStatus.responseSha256` differs from `validatedFinalHostStatus.responseSha256`; `validatedFinalHostStatus.status` is the unchanged Bootstrap owner reference and cannot be flattened. When the response may be lost after durable commit, `ackStatus` remains exact `null`, no second ACK/OIDC token is minted or sent, and only the later ordinary status may prove `upload_committed_observed`; a returned `upload_started`/pending/mismatch fails closed. The initial terminal status, every bundle chunk, upload-start, one ACK attempt, and post-ACK ordinary status use one controller-lifetime transport; its outer `finally` calls the Bootstrap-owned idempotent `.close()` once. The final digest is the SHA-256 of the exact ordinary `status` response bytes after the ACK attempt, never the ACK response. Only the Artifact-owned sink persists final-status bytes.

- [ ] **Step 6 (5 min): Implement the fixed dispatcher with no user CLI registration**

Use an exact command table:

```js
const COMMANDS = Object.freeze({
  "terminal-validate": terminalValidateCommand,
  "closeout-build": closeoutBuildCommand,
  "upload-start": uploadStartCommand,
  "artifact-readback": artifactReadbackCommand,
  "upload-ack": uploadAckCommand,
  "closeout-validate": closeoutValidateCommand,
});

export async function main(argv = process.argv.slice(2), io = process) {
  if (argv.length !== 1 || !Object.hasOwn(COMMANDS, argv[0])) {
    throw safeCliError("controller_closeout_command_invalid");
  }
  const requestBytes = await readBoundedStdin(io.stdin, 65_536);
  const responseBytes = await COMMANDS[argv[0]](requestBytes);
  io.stdout.write(responseBytes);
}
```

`upload-start` and `upload-ack` read/delete the fixed ephemeral OIDC environment value and emit only the adapter's request bytes. `artifact-readback` queries/list-downloads the deterministic artifact, validates exactly one match and one archive member, builds the separate observation, and returns that observation. The CLI never rewrites the uploaded payload, invokes SSH, or exposes a transport constructor.

- [ ] **Step 7 (3 min): Run GREEN for adapter sequencing and transition isolation**

```powershell
node --test server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs
```

Expected: the real Bootstrap maintenance and registration providers pass Task 2's unchanged consumer contracts, including replay 128/129, closeout 1,024/1,025, protection, crash/reboot, lock, and CAS rows using only true Host final states; the exact adapter surface, same-transport terminal-bundle retrieval, Bootstrap-owned chunk assembler and full transition tuple, two unique OIDC audiences/token/JTI digests, token zeroization, every complete chunk/transition/final-status envelope, fixed `.request(...)` shapes, artifact readback wrapper, cleanup, ACK validation, independent ordinary-status request, preserved owner brand, distinct ACK/final `responseSha256` values, unchanged terminal-bundle binding, and committed-record validation all pass; every no-claim/recovery/generic/reused identity row fails before OIDC or mutation.

- [ ] **Step 8 (3 min): Run GREEN and confirm CLI process isolation**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: valid commands emit canonical bytes with no newline; every rejected row emits no payload, raw token, raw input, or host diagnostic.

- [ ] **Step 9 (2 min): Commit the Receipt-owned adapter and normal-closeout CLI**

```powershell
git add server/services/deployment/control-plane-controller-closeout-adapter.mjs scripts/control-plane-controller-closeout.mjs server/tests/helpers/control-plane-receipt-fixtures.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-controller-closeout.test.mjs
git commit -m "feat(deploy): add controller closeout adapter"
```

---

### Task 5: Implement Recovery ID, Input, Attempt, And Artifact Eligibility

**Files:**
- Create: `server/services/deployment/control-plane-receipt-recovery.mjs`
- Create: `server/tests/control-plane-receipt-recovery.test.mjs`

**Entry gate:** Host/DB Tasks 11-13 and Artifact Task 7 are complete before any Task 5-8 RED test. Run:

```powershell
Test-Path server/services/deployment/control-plane-host-transaction.mjs
Test-Path server/services/deployment/host-recovery.mjs
Test-Path scripts/control-plane-host-integration.mjs
Test-Path scripts/github-immutable-release-publisher.mjs
node --test --test-concurrency=1 server/tests/control-plane-host-recovery.test.mjs
```

Expected: all four paths return `True`, and the Host recovery suite proves persisted phase is read before deadline classification, an expired ordinary phase may only enter `record_critical`, persisted `critical_finalize_pending` may only enter external `finalize_critical`, every other expired edge rejects, and reboot never resets the original deadline. A missing Host transaction/recovery/integration implementation, failed phase/deadline test, or missing shared publisher stops Tasks 5-8; Receipt must not add a substitute or advance recovery against an unintegrated terminal producer.

**Interfaces:**
- Consumes: canonical serialize/parse/hash helpers and Task 3 artifact-observation validation.
- Produces: `computeControllerRecoveryId({ productionGateReceiptSha256, transactionId, target, sourceCommit })`.
- Produces: `parseReceiptRecoveryInputs(input)` with exact-key rejection.
- Produces: `validateOriginalRunAttemptEvidence({ runAttempt, expectedRunId, expectedAttempt, now })`.
- Produces: `classifyOriginalCloseoutArtifact({ hostCloseoutRecord, apiObservation, downloadedPayload, expected, now })`.
- Returns: a frozen `present_exact`, `absent_proved`, `ambiguous_no_claim`, or `invalid_no_claim` classification with a safe closed reason.

- [ ] **Step 1 (5 min): Add RED input/ID/24-hour/artifact-table tests**

Add exact input tests:

```js
assert.deepEqual(parseReceiptRecoveryInputs({
  controller_recovery_id: `cr1.${"a".repeat(64)}`,
  original_run_id: "123456789",
  original_run_attempt: "2",
  confirmation: "recover japan control-plane receipt",
}), {
  controllerRecoveryId: `cr1.${"a".repeat(64)}`,
  originalRunId: "123456789",
  originalRunAttempt: 2,
});
```

Reject missing/extra keys, numeric IDs, zero/leading-zero values, uppercase hex, whitespace around confirmation, and all phrase variants.

For each allowed conclusion, accept an attempt whose exact `updated_at` age is 24 hours. Reject 24 hours plus 1 millisecond, a future time, non-completed status, every disallowed conclusion, run/attempt mismatch, and wrong original workflow/repository/owner/event/ref/head SHA. Add a getter that throws if code reads `created_at` or `run_started_at`.

Test the entire artifact table:

| Host artifact state | API result | Expected classification |
| --- | --- | --- |
| `not_started` | complete exact-name absence within 24h | `absent_proved` |
| `not_started` | one present artifact | `invalid_no_claim` |
| `upload_started` | one exact present/unexpired artifact | `present_exact` |
| `upload_started` | absence | `ambiguous_no_claim` |
| `upload_committed_observed` | exact present artifact and matching observation SHA | `present_exact` |
| `upload_committed_observed` | absent, expired, or mismatched observation | `invalid_no_claim` |

Also reject incomplete pagination, multiple exact-name artifacts, archive with zero/two files, wrong archive member name, wrong API `sha256:` digest, wrong canonical payload SHA, interval below 35 days, and any call to a repository retention-settings URL.

- [ ] **Step 2 (2 min): Run RED and confirm the recovery module is absent**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `control-plane-receipt-recovery.mjs`.

- [ ] **Step 3 (5 min): Implement canonical ID, exact attempt evidence, and closed artifact classification**

Compute the ID from exactly six ordered fields:

```js
export function computeControllerRecoveryId(input) {
  const bytes = serializeCanonicalJsonBytes({
    schemaVersion: 1,
    domain: "controller-recovery",
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    transactionId: input.transactionId,
    target: input.target,
    sourceCommit: input.sourceCommit,
  }, CONTROLLER_RECOVERY_ID_V1_CONTRACT);
  return `cr1.${sha256Hex(bytes)}`;
}
```

Use only attempt-specific `updated_at`:

```js
const ALLOWED_CONCLUSIONS = new Set([
  "cancelled",
  "failure",
  "timed_out",
  "stale",
  "startup_failure",
]);

export function validateOriginalRunAttemptEvidence({ runAttempt, expectedRunId, expectedAttempt, now }) {
  if (String(runAttempt.id) !== expectedRunId || String(runAttempt.run_attempt) !== String(expectedAttempt)) {
    throw safeRecoveryError("original_attempt_binding_mismatch");
  }
  if (runAttempt.status !== "completed" || !ALLOWED_CONCLUSIONS.has(runAttempt.conclusion)) {
    throw safeRecoveryError("original_attempt_not_eligible");
  }
  const ageMs = now.getTime() - Date.parse(runAttempt.updated_at);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 86_400_000) {
    throw safeRecoveryError("original_attempt_outside_recovery_window");
  }
  return Object.freeze({ updatedAt: runAttempt.updated_at, conclusion: runAttempt.conclusion });
}
```

For a present artifact, require `apiDigest` form `sha256:<hex>`, future expiry, a minimum 35-day `created_at`/`expires_at` interval, exact run/name/payload bindings, complete archive download, and canonical payload validation. For absence, require complete pagination of the exact run artifact query and the already validated attempt age. Never call or accept repository retention configuration as evidence.

- [ ] **Step 4 (3 min): Run GREEN plus complete boundary matrix**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: all input, age, conclusion, metadata, archive, and state-table rows pass; the mocked fetch log contains no artifact-retention-settings endpoint.

- [ ] **Step 5 (2 min): Commit eligibility logic**

```powershell
git add server/services/deployment/control-plane-receipt-recovery.mjs server/tests/control-plane-receipt-recovery.test.mjs
git commit -m "feat(deploy): gate receipt recovery eligibility"
```

---

### Task 6: Implement Challenge-Gated Bounded Read-Only Recovery And Result Envelopes

**Files:**
- Modify: `server/services/deployment/control-plane-receipt-recovery.mjs`
- Create: `scripts/control-plane-receipt-recovery-controller.mjs`
- Modify: `server/tests/control-plane-receipt-recovery.test.mjs`

**Interfaces:**
- Consumes from Bootstrap host protocol: `encodeRecoveryChallengeRequest`, `validateRecoveryChallengeResponse`, `encodeRecoveryStatusRequest`, `validateRecoveredStatusResponse`, `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId }) -> { requestBytes, expected }`, `validateStatusResponseFrame(responseBytes, expected)`, `assertValidatedOrdinaryStatus(value)`, and `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs: 30000 })`. The distinct recovery private brand can enter only `createPostRecoveryStatusRequest`; it can never satisfy the ordinary assertion or bundle reader.
- Consumes from `control-plane-transport-contract.mjs`: `DEPLOY_CREDENTIAL_ID`, `FIXED_CREDENTIAL_MATERIAL_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_CONTRACT`, `createFixedCredentialExpectation({ credentialId, authorizationGeneration, bootstrapReceiptSha256, knownHostsFingerprint, knownHostsTupleSha256, expiresAt, observedAt })`, `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, `assertKnownHostsRecordExpectation({ binding, material })`, `validateFixedCredentialMaterial(material, expectation)`, `createSecureSshTransport({ native, clock, secretMaterializer })`, and `validateTransportEnvelope(envelope)`. One workflow invocation creates one exact five-method transport, uses `.request(...)` for challenge/recovery/ordinary-status polling, lets only `readTerminalBundleBytes` call `.requestStatusBundle(...)` once, and calls `.close()` exactly once in outer `finally`; it never calls `.execute()` or `.requestBootstrap()`.
- Consumes: parser registry resolution/coverage, Task 2 `validateHostTerminalBundleBytes(...)`, the Host-owned `HOST_FINAL_STATES`, terminal receipt/closeout validation, and artifact classification. Recovery parses no terminal body from `status_recover`; only the bounded bundle is Receipt evidence.
- Produces: `buildRecoveryChallengeRequest(context)`, `buildRecoveredCloseout(input)`, `buildRecoveryAttemptNoClaim(input)`, and `validateRecoveredCloseoutBytes(bytes, bindings)`. Challenge/status byte validation remains owned by the imported host protocol.
- Produces: `recoverReceipt({ preflight, transport, requestOidcToken, parserRegistry, currentBindings, clock })` for dependency-injected orchestration. The controller-owned `clock` exposes exactly `now()`, `monotonicNow()`, and `sleep(milliseconds)`; polling fixes 5,000-millisecond intervals, a 30,000-millisecond absolute post-recovery deadline, and at most seven ordinary status attempts including the immediate attempt. Neither response progress nor a post-finalizer pending state extends that deadline.
- Produces in the workflow-only script: `createRecoverySecretMaterializer({ env, expectedCredential, clock })` whose only public method is `materializeFixedCredential(credentialId)`. `expectedCredential` is the exact aggregate-safe current authorization/bootstrap/known-host/expiry tuple already validated from protected preflight evidence; the constructor does not touch protected values. The method accepts only `DEPLOY_CREDENTIAL_ID`, reads the five fixed protected Environment values once, constructs one ordinary exact eleven-field `material`, derives/asserts the real four-field known-host binding, creates the sole branded exact-eight-field `expectation`, validates both through the real Bootstrap exports, and returns exactly frozen `{ material, expectation }`. Bootstrap invokes it only after a fully true capability probe, seals/captures that wrapper once, zeroes the materializer-owned Buffers in the capture operation's outermost `finally`, gives every actual request/bundle-stream operation a fresh non-aliased clone, zeroes/closes each clone in its operation `finally`, and zeroes/closes retained originals in the controller's outer `finally`/idempotent `.close()`. The workflow controller never invokes the materializer directly. The returned materializer has no `materializeDeploy`, `materializeBootstrap`, close, dispose, host, key, known-hosts, seed, or clone property.
- Produces workflow-only commands: `preflight`, `recover`, `validate-result`, and `cleanup`. `preflight` emits only `preflight_artifact_name` and `preflight_sha256`; `validate-result` emits only `result_kind`, `result_artifact_name`, and `producing_run_attempt` as safe GitHub outputs.
- The workflow CLI constructs `createSecureSshTransport({ native, clock, secretMaterializer })` exactly once and passes that same object through challenge, recovered-selector, bounded ordinary-status polling, and one terminal-bundle stream. Only the transport may call `secretMaterializer.materializeFixedCredential(...)`, retain the fixed protected tuple, or create a fresh internal clone. The shared transport validates the exact `{ material, expectation }` producer ABI, seals connection/key/known-host/request bytes in anonymous descriptors, uses its compiled OpenSSH executable/environment IDs, returns bounded anonymous response bytes, discards raw diagnostics, and closes/zeroes every actual operation handle. The CLI calls only the transport's idempotent `.close()` in outer `finally`; it defines no competing credential dispose, clone, or zeroization path.

- [ ] **Step 1 (5 min): Add RED challenge/status/result and forbidden-side-effect tests**

Use spies to require this minimum ordered lifecycle for an immediately eligible non-critical terminal:

```js
assert.deepEqual(calls.map(({ type }) => type), [
  "status_recover_challenge",
  "request_oidc_token",
  "status_recover",
  "status",
  "request_status_bundle",
]);
assert.equal(calls.some(({ type }) => type === "execute_auth"), false);
assert.equal(calls.some(({ type }) => type === "status_closeout_ack"), false);
assert.equal(calls.some(({ type }) => type === "status_closeout_upload_started"), false);
```

Reject stale/HMAC-invalid challenge, wrong recovery/original/new run tuple, wrong repository/owner/event/Environment/runner/workflow path-ref-SHA, wrong source/bootstrap/controller/parser digest, rotation fence, old key generation, wrong OIDC audience, zero/two retained selectors, missing parser, terminal digest mismatch, and any response claiming a host mutation. Prove `validateRecoveredStatusResponse` returns a distinct private brand: direct use with `assertValidatedOrdinaryStatus` or `readTerminalBundleBytes`, and any spread/clone passed to `createPostRecoveryStatusRequest`, rejects before a bundle stream. The real helper must return exact `{ requestBytes, expected }` and exact expected keys `requestId,gateId,deploymentPlanSha256,transactionId`.

Use a constructor/transport spy to assert one `createSecureSshTransport(...)`, exact public method order `execute,request,requestStatusBundle,requestBootstrap,close`, a variable bounded number of `.request(...)` calls on that same object, exactly one helper-owned `.requestStatusBundle(...)` only after an immutable ordinary-status brand, and one `.close()` in `finally`. Every direct request object contains only `credentialId`, bounded canonical `requestBytes`, and its owner timeout; challenge/recovery use 10 seconds and ordinary status uses 30 seconds. Assert the first request decodes only as `status_recover_challenge`, the second only as `status_recover`, later direct requests only as exact ordinary `status`, every complete result first passes `validateTransportEnvelope`, and only successful `responseBytes` reaches its exact host-protocol validator. `requestStatusBundle` is one 30-second authenticated bounded session whose private consumer sees one through 342 frames; it is never called once per chunk. Assert no call object contains `host`, `port`, `user`, `privateKey`, `privateKeyBytes`, `knownHosts`, `knownHostsBytes`, `command`, `executable`, `path`, `fd`, `sshOptions`, or `proxy`.

For every imported Host `HOST_FINAL_STATES` value, assert the exact recovered result and validate the owner-branded ordinary status plus exact Receipt bundle before envelope construction. The four non-critical rows perform no Host critical-proof read. For critical, feed both `terminal_quiescence_pending` and transaction-bound `terminal_quiescence_rejected` across zero, one, and the maximum permitted poll intervals, then a real Host-proof-backed immutable status; verify fresh correlation IDs, one fixed monotonic deadline, no deadline refresh, and one subsequent bundle session. At/after the deadline either still-transitional result produces only `recovery_not_terminal_no_claim`; neither makes a bundle/publication call, becomes `recovery_receipt_invalid_no_claim`, or can become `admission_rejected_no_transaction`. Only an actual immutable bundle that reaches Receipt validation and fails produces `recovery_receipt_invalid_no_claim`. Exercise bundle sizes 1, 768, 769, and exactly 262,144 bytes, including exactly 342 frames; 0, 262,145, a 343rd frame, early/late EOF, digest drift, or selector drift rejects. For nonterminal or invalid bytes, assert one `recovery_attempt_no_claim` envelope and prove it has no `tag`, `assetName`, `attestation`, `deployNote`, or publication eligibility field set true. Retain the normal closeout ACK-loss row from Task 4 in the combined suite: recovery never sends or replays ACK.

- [ ] **Step 2 (5 min): Add RED capability-before-materialization and fixed-credential tests**

Use the real Bootstrap transport with a false capability and a materializer spy:

```js
let materializerCalls = 0;
const secretMaterializer = {
  async materializeFixedCredential() {
    materializerCalls += 1;
    throw new Error("materializer_must_not_run");
  },
};
const transport = createSecureSshTransport({
  native: createNativeProbe({ memfdFullSeals: false }),
  clock: fixedClock,
  secretMaterializer,
});
await assert.rejects(
  () => transport.request({
    credentialId: "japan-control-plane-github-deploy-v1",
    requestBytes: encodeRecoveryChallengeRequest(validChallengeInput()),
    timeoutMs: 10_000,
  }),
  /control_plane_linux_capability_ineligible/,
);
assert.equal(materializerCalls, 0);
await transport.close();
await transport.close();
assert.equal(materializerCalls, 0);
```

Repeat once for every frozen capability set to false/unknown. With all capabilities true, assert exactly one materializer call and one Environment read/delete for the entire variable-length lifecycle, only the fixed credential ID, and exact capture keys `material,expectation`. Import Bootstrap's real `createRealFixedCredentialFixture({ consumer: "receipt" })` producer-conformance fixture; byte-compare `Object.keys(material)` with `FIXED_CREDENTIAL_MATERIAL_FIELDS`, `Object.keys(expectation)` with `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, run `FIXED_CREDENTIAL_EXPECTATION_CONTRACT.validate(expectation)`, prove `deriveKnownHostsBinding`/`assertKnownHostsRecordExpectation`, and require `validateFixedCredentialMaterial(material, expectation) === material`. Reject a missing/extra/reordered material or expectation field, wrong authorization generation/bootstrap receipt/known-host fingerprint/known-host tuple/expiry/observedAt, aliased Buffer, inherited prototype, wrong derived endpoint/principal, expired material, an expectation clone/lookalike, or any factory input named `principal`, `user`, `now`, or `expiresAfter` before spawn. Assert the one producer original is zeroed after Bootstrap captures sealed originals; each actual challenge/recovery/poll/bundle operation gets a distinct non-aliased internal private-key/known-host clone that is separately zeroed/closed; retained sealed originals remain usable across polling and are zeroed/closed/read back absent by idempotent `transport.close()`. If any later capability recheck fails, assert no rematerialization or next clone/request and outer close still clears retained material. Directly invoking the materializer twice must reject. Reject a variable-derived credential ID, an old generation ID, or any direct protected-value argument before materialization.

- [ ] **Step 3 (2 min): Run RED and capture the first missing recovery export**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: missing export/assertion failure for the post-recovery ordinary-status/bundle lifecycle; Task 5 eligibility tests remain green.

- [ ] **Step 4 (5 min): Implement branded selector -> bounded ordinary status -> one bundle stream**

Keep the orchestrator read-only:

```js
export async function recoverReceipt({
  preflight,
  transport,
  requestOidcToken,
  parserRegistry,
  currentBindings,
  clock,
}) {
  const challengeFrame = encodeRecoveryChallengeRequest(preflight.challengeRequest);
  const challengeEnvelope = validateTransportEnvelope(await transport.request({
    credentialId: "japan-control-plane-github-deploy-v1",
    requestBytes: challengeFrame,
    timeoutMs: 10_000,
  }));
  if (challengeEnvelope.exitCode !== 0) {
    throw safeRecoveryError("recovery_challenge_transport_failed");
  }
  const challenge = validateRecoveryChallengeResponse(
    challengeEnvelope.responseBytes,
    currentBindings,
  );
  let oidcTokenBytes;
  try {
    oidcTokenBytes = await requestOidcToken(challenge.challengeSha256);
    const statusFrame = encodeRecoveryStatusRequest({
      ...preflight.statusRequest,
      challengeSha256: challenge.challengeSha256,
      oidcTokenBytes,
    });
    const statusEnvelope = validateTransportEnvelope(await transport.request({
      credentialId: "japan-control-plane-github-deploy-v1",
      requestBytes: statusFrame,
      timeoutMs: 10_000,
    }));
    if (statusEnvelope.exitCode !== 0) {
      throw safeRecoveryError("recovery_status_transport_failed");
    }
    const validatedRecoveredStatus = validateRecoveredStatusResponse(
      statusEnvelope.responseBytes,
      challenge,
    );
    const pollStartedAt = clock.monotonicNow();
    let ordinaryStatus = null;
    for (let pollIndex = 0; pollIndex < 7; pollIndex += 1) {
      const scheduledAt = pollStartedAt + (pollIndex * 5_000);
      const remaining = scheduledAt - clock.monotonicNow();
      if (remaining > 0) await clock.sleep(remaining);
      if (clock.monotonicNow() - pollStartedAt > 30_000) break;
      const postRecovery = createPostRecoveryStatusRequest({
        validatedRecoveredStatus,
        requestId: derivePostRecoveryRequestId(preflight, pollIndex),
      });
      const ordinaryEnvelope = validateTransportEnvelope(await transport.request({
        credentialId: DEPLOY_CREDENTIAL_ID,
        requestBytes: postRecovery.requestBytes,
        timeoutMs: 30_000,
      }));
      if (ordinaryEnvelope.exitCode !== 0) {
        throw safeRecoveryError("recovery_ordinary_status_transport_failed");
      }
      ordinaryStatus = validateStatusResponseFrame(
        ordinaryEnvelope.responseBytes,
        postRecovery.expected,
      );
      assertValidatedOrdinaryStatus(ordinaryStatus);
      if (ordinaryStatus.immutableTerminal === true) break;
      if (ordinaryStatus.resultCode !== "terminal_quiescence_pending"
          && ordinaryStatus.resultCode !== "terminal_quiescence_rejected") {
        throw safeRecoveryError("recovery_ordinary_status_state_invalid");
      }
    }
    if (ordinaryStatus?.immutableTerminal !== true) {
      return buildRecoveryAttemptNoClaimFromStatus({
        preflight,
        ordinaryStatus,
        observedAt: clock.now().toISOString(),
      });
    }
    const terminalBundle = await readTerminalBundleBytes({
      transport,
      validatedStatus: ordinaryStatus,
      timeoutMs: 30_000,
    });
    const validatedBundle = validateHostTerminalBundleBytes(terminalBundle.bytes, {
      transactionId: ordinaryStatus.transactionId,
      controllerRecoveryId: ordinaryStatus.controllerRecoveryId,
      productionGateReceiptSha256: preflight.productionGateReceiptSha256,
      deploymentPlanSha256: ordinaryStatus.deploymentPlanSha256,
      terminalBundleSha256: ordinaryStatus.terminalBundleSha256,
      terminalBundleSize: ordinaryStatus.terminalBundleSize,
      terminalReceiptSha256: ordinaryStatus.terminalReceiptSha256,
      closeoutRecordSha256: ordinaryStatus.closeoutRecordSha256,
    });
    return classifyRecoveredBundle({
      validatedRecoveredStatus,
      ordinaryStatus,
      validatedBundle,
      preflight,
      parserRegistry,
      observedAt: clock.now().toISOString(),
    });
  } finally {
    oidcTokenBytes?.fill(0);
  }
}
```

`derivePostRecoveryRequestId(preflight, pollIndex)` is module-private and returns exactly `receipt-recovery-final-{recoveryRunId}-{recoveryRunAttempt}-{pollIndex}` after validating numeric run/attempt and integer `0..6`; request IDs are correlation only. `buildRecoveryAttemptNoClaimFromStatus` maps either `terminal_quiescence_pending` or transaction-bound `terminal_quiescence_rejected` at the fixed deadline to `recovery_not_terminal_no_claim`; it never treats either transitional status as an admission rejection or receipt-invalid result. Only an actual immutable terminal/bundle that reaches Receipt validation and fails may produce `recovery_receipt_invalid_no_claim`. No no-claim path performs a bundle read or publication. `classifyRecoveredBundle` first requires the exact ordinary-status owner brand again, byte-compares the recovered selector to the ordinary status and bundle, resolves the retained schema through the current parser registry, and iterates only imported Host `HOST_FINAL_STATES`. It never receives a Host proof object: the critical state is possible only because Bootstrap issued the ordinary brand after Host `assertCriticalPostPublicationProof`.

The workflow-only controller owns one transport lifetime around the complete bounded lifecycle:

```js
async function runProtectedRecovery(context) {
  const secretMaterializer = createRecoverySecretMaterializer({
    env: context.env,
    expectedCredential: context.validatedCurrentCredentialBindings,
    clock: context.clock,
  });
  const transport = createSecureSshTransport({
    native: context.native,
    clock: context.clock,
    secretMaterializer,
  });
  try {
    return await recoverReceipt({
      preflight: context.preflight,
      transport,
      requestOidcToken: context.requestOidcToken,
      parserRegistry: context.parserRegistry,
      currentBindings: context.currentBindings,
      clock: context.clock,
    });
  } finally {
    await transport.close();
  }
}
```

The test spies assert the constructor and close counts are both one on challenge rejection, OIDC rejection, recovered-selector rejection, ordinary pending/rejection/deadline, bundle failure, no-claim, maximum-size bundle, and valid recovery. `recoverReceipt` never constructs a second transport and never closes between operations.

After the host read, the protected job repeats the exact Actions run-attempt/artifact query and byte-compares it with the preapproval evidence; it downloads and validates a present artifact again. Any changed, newly ambiguous, expired, deleted, or mismatched observation fails closed. `buildRecoveredCloseout` accepts only `present_exact` or `absent_proved`, the exact validated terminal bundle, the unchanged Bootstrap ordinary-status brand bound to that bundle, and one of the five recovered results. For critical, that brand exists only downstream of Host `assertCriticalPostPublicationProof`; the Host capability itself and all proof fields remain nonserializable and absent from recovered bytes. It binds both workflow runs/attempts, old native conclusion and `updated_at`, the original transaction source/target commit, host terminal receipt digest, original artifact classification/evidence, current parser/bootstrap/controller identity, and the current recovery workflow path/ref/SHA/source commit/run/attempt as a separate attester identity. It never equates the original transaction target with the current recovery workflow source.

`buildRecoveryAttemptNoClaim` accepts only `recovery_not_terminal_no_claim` or `recovery_receipt_invalid_no_claim`; it binds the exact recovery run attempt and safe reason but carries `publicationEligible: false`. It is named only from that attempt, writes no host state, modifies no original run, creates no fixed tag/Release/attestation/Deploy Note, and reserves no publication identity. A later validated attempt is therefore not blocked by a prior no-claim diagnostic.

- [ ] **Step 5 (5 min): Implement the post-probe materializer and workflow-only composition**

The materializer owns the only protected Environment read but delegates the ABI and custody lifecycle to Bootstrap:

```js
export function createRecoverySecretMaterializer({ env, expectedCredential, clock }) {
  let materialized = false;
  return Object.freeze({
    async materializeFixedCredential(credentialId) {
      if (credentialId !== DEPLOY_CREDENTIAL_ID) {
        throw safeRecoveryError("recovery_credential_id_invalid");
      }
      if (materialized) {
        throw safeRecoveryError("recovery_credential_rematerialization_forbidden");
      }
      materialized = true;
      const protectedMaterial = readFixedDeployMaterialAndDeleteEnvironment(env);
      try {
        const binding = deriveKnownHostsBinding({
          host: protectedMaterial.host,
          port: protectedMaterial.port,
          knownHostsBytes: protectedMaterial.knownHostsBytes,
        });
        const producerOriginal = Object.freeze({
          credentialId: DEPLOY_CREDENTIAL_ID,
          host: binding.host,
          port: binding.port,
          user: protectedMaterial.user,
          authorizationGeneration: expectedCredential.authorizationGeneration,
          bootstrapReceiptSha256: expectedCredential.bootstrapReceiptSha256,
          knownHostsFingerprint: binding.knownHostsFingerprint,
          knownHostsTupleSha256: binding.knownHostsTupleSha256,
          expiresAt: expectedCredential.expiresAt,
          privateKeyBytes: protectedMaterial.privateKeyBytes,
          knownHostsBytes: protectedMaterial.knownHostsBytes,
        });
        if (!Object.keys(producerOriginal).every(
          (field, index) => field === FIXED_CREDENTIAL_MATERIAL_FIELDS[index],
        ) || Object.keys(producerOriginal).length !== FIXED_CREDENTIAL_MATERIAL_FIELDS.length) {
          throw safeRecoveryError("recovery_credential_shape_invalid");
        }
        const expectation = createFixedCredentialExpectation({
          credentialId: DEPLOY_CREDENTIAL_ID,
          authorizationGeneration: expectedCredential.authorizationGeneration,
          bootstrapReceiptSha256: expectedCredential.bootstrapReceiptSha256,
          knownHostsFingerprint: expectedCredential.knownHostsFingerprint,
          knownHostsTupleSha256: expectedCredential.knownHostsTupleSha256,
          expiresAt: expectedCredential.expiresAt,
          observedAt: clock.now().toISOString(),
        });
        if (!Object.keys(expectation).every(
          (field, index) => field === FIXED_CREDENTIAL_EXPECTATION_FIELDS[index],
        ) || Object.keys(expectation).length !== FIXED_CREDENTIAL_EXPECTATION_FIELDS.length) {
          throw safeRecoveryError("recovery_credential_expectation_shape_invalid");
        }
        FIXED_CREDENTIAL_EXPECTATION_CONTRACT.validate(expectation);
        assertKnownHostsRecordExpectation({ binding, material: producerOriginal });
        validateFixedCredentialMaterial(producerOriginal, expectation);
        return Object.freeze({ material: producerOriginal, expectation });
      } catch (error) {
        protectedMaterial.privateKeyBytes.fill(0);
        protectedMaterial.knownHostsBytes.fill(0);
        throw error;
      }
    },
  });
}
```

`readFixedDeployMaterialAndDeleteEnvironment` accepts only `JAPAN_CONTROL_DEPLOY_HOST`, `JAPAN_CONTROL_DEPLOY_PORT`, `JAPAN_CONTROL_DEPLOY_USER`, `JAPAN_CONTROL_DEPLOY_PRIVATE_KEY`, and `JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS`; validates the protected user as `github-control-deploy`; parses the endpoint/known-host tuple through Bootstrap's real parser; deletes all five properties in its own `finally`; and has no exported surface. `expectedCredential` has exactly `authorizationGeneration`, `bootstrapReceiptSha256`, `knownHostsFingerprint`, `knownHostsTupleSha256`, and `expiresAt`, all derived from already validated current protected preflight evidence rather than caller input or duplicated Environment aliases. The CLI passes the public materializer into one `createSecureSshTransport`, never calls `materializeFixedCredential` itself, and in its outer `finally` calls only `transport.close()`. Tests assert `Object.keys(secretMaterializer)` is exactly `["materializeFixedCredential"]`, every capability false/unknown before phase one produces zero materializer/Environment reads, and the single returned capture has exact keys `material,expectation`. The material exact-matches Bootstrap's eleven-field order; the expectation is the sole branded exact-eight-field value from `createFixedCredentialExpectation`; real binding assertion and branded validation both pass. Bootstrap zeroes the producer Buffers after one sealed capture, creates one distinct fresh non-aliased clone for every actual challenge, selector, ordinary-status poll, and terminal-bundle operation, zeroes/closes every operation clone independently, and zeroes/closes retained originals on outer close. A second materializer call and any non-fixed credential ID reject before Environment access.

The CLI writes canonical aggregate-safe preflight/result files, fsyncs and reads them back, then appends only fixed safe name/digest/classification values to the exact `$GITHUB_OUTPUT` file. On the same sealed-descriptor transport it performs challenge, recovered selector, one through seven freshly correlated ordinary-status requests, and exactly one terminal-bundle session only after an immutable terminal; it requests challenge-audience OIDC only after challenge validation and calls that transport's idempotent close exactly once in the controller's outer `finally`. Bootstrap's capture `finally` zeroes the producer-owned original Buffers, each actual operation `finally` zeroes/closes its own fresh clone, and outer close zeroes/closes/readbacks the retained originals. The CLI proves the exact prohibited linked secret paths absent in both internal cleanup and the workflow `cleanup` command.

- [ ] **Step 6 (3 min): Run GREEN for challenge/status and result classification**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: one transport construction, one materializer call, challenge plus selector plus one through seven ordinary-status `.request(...)` calls on the same object, exactly one helper-owned `.requestStatusBundle(...)` only for an immutable terminal, one challenge-audience OIDC request, and one idempotent transport close occur for valid recovery. An invocation that reaches its deadline still pending or transitionally rejected makes no bundle call; a transitional response followed by a branded immutable terminal makes exactly one. All invalid/no-claim cases perform zero publication calls and no write request type.

- [ ] **Step 7 (3 min): Re-run transport redaction and materializer-zero regressions**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs
```

Expected: every false/unknown phase-one capability yields materializer and Environment-read count zero; all-true recovery materializes and real-validates one exact `{ material, expectation }` capture, Bootstrap zeroes the producer original after sealed capture, creates/zeroes one fresh internal clone per actual challenge/selector/poll/bundle operation, zeroes/closes retained originals through one idempotent transport close, and exposes no raw transport field.

- [ ] **Step 8 (2 min): Commit read-only recovery controller**

```powershell
git add server/services/deployment/control-plane-receipt-recovery.mjs scripts/control-plane-receipt-recovery-controller.mjs server/tests/control-plane-receipt-recovery.test.mjs
git commit -m "feat(deploy): recover terminal receipt read only"
```

---

### Task 7: Add The Fixed Recovered-Closeout Publisher Adapter

**Files:**
- Create: `scripts/control-plane-recovered-closeout-publisher.mjs`
- Create: `server/tests/control-plane-recovered-closeout-publisher.test.mjs`

**Interfaces:**
- Consumes: `validateRecoveredCloseoutBytes` from Task 6, `validateActionsArtifactObservation` from Task 3, and Artifact-owned `RECOVERED_CLOSEOUT_ATTESTATION_PREDICATE_CONTRACT` from `server/services/deployment/github-attestation-verifier.mjs`. Receipt imports this exact contract and does not copy its field order or verifier.
- Consumes: `inspectImmutableAssetAttestationPair` and `publishImmutableAssetAttestationPair` from `scripts/github-immutable-release-publisher.mjs`.
- Produces: `deriveRecoveredCloseoutPublication(bytes, bindings, actionsArtifactObservation) -> { tag, assetName, targetCommit, sha256, attestationIdentity, predicateBindings }`.
- Produces: `publishRecoveredCloseout({ bytes, repository, token, fetchFn, attestFn, bindings, actionsArtifactObservation }) -> { state: "complete", releaseId, assetId, sha256 }` or a safe failure.
- Accepts: only a canonical `recovered_closeout` envelope; rejects every `recovery_attempt_no_claim` envelope before any GitHub read/write.
- `targetCommit` is the original transaction source commit validated from the recovered receipt. `attestationIdentity` is constructed internally and has exactly `workflowPath: ".github/workflows/control-plane-receipt-recovery.yml"`, `workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-receipt-recovery.yml@refs/heads/master"`, the current validated recovery workflow/source `workflowSha` and `sourceCommit`, and `predicateType: "https://slsa.dev/provenance/v1"`. These current attester fields may differ from the old `targetCommit`; callers cannot supply or override either identity. `predicateBindings` is canonicalized with the Artifact-owned contract and has exactly `schema`, `repository`, `originalTransactionTargetCommit`, `attesterWorkflowPath`, `attesterWorkflowRef`, `attesterWorkflowSha`, `attesterSourceCommit`, `controllerRecoveryId`, `terminalReceiptSha256`, `recoveredCloseoutSha256`, and `actionsArtifactObservationSha256`. It simultaneously binds the old transaction/receipt, the exact recovered payload and current recovery artifact observation, and the current attester workflow/source. It never invents an original controller-closeout digest for `absent_proved`.

- [ ] **Step 1 (5 min): Add RED fixed-name and resumable-state tests**

Assert the exact derived names:

```js
const publication = deriveRecoveredCloseoutPublication(
  recoveredBytes,
  bindings,
  validRecoveryArtifactObservation,
);
assert.equal(publication.tag, `control-plane-recovered-closeout-${controllerRecoveryId}`);
assert.equal(
  publication.assetName,
  `control-plane-recovered-closeout-${controllerRecoveryId}-${payloadSha256}.json`,
);
assert.equal(publication.targetCommit, recovered.sourceCommit);
assert.deepEqual(publication.attestationIdentity, {
  workflowPath: ".github/workflows/control-plane-receipt-recovery.yml",
  workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-receipt-recovery.yml@refs/heads/master",
  workflowSha: bindings.recoveryWorkflowSha,
  sourceCommit: bindings.recoverySourceCommit,
  predicateType: "https://slsa.dev/provenance/v1",
});
assert.deepEqual(publication.predicateBindings, {
  schema: "control_plane_recovered_closeout_attestation_v1",
  repository: "gccwebos-com/proxy-gateway-minimal",
  originalTransactionTargetCommit: recovered.sourceCommit,
  attesterWorkflowPath: ".github/workflows/control-plane-receipt-recovery.yml",
  attesterWorkflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-receipt-recovery.yml@refs/heads/master",
  attesterWorkflowSha: bindings.recoveryWorkflowSha,
  attesterSourceCommit: bindings.recoverySourceCommit,
  controllerRecoveryId,
  terminalReceiptSha256: recovered.terminalReceiptSha256,
  recoveredCloseoutSha256: payloadSha256,
  actionsArtifactObservationSha256: validRecoveryArtifactObservation.sha256,
});
assert.notEqual(publication.targetCommit, publication.attestationIdentity.sourceCommit);
```

Mock the shared inspector for `none`, `asset_only`, `attestation_only`, `complete`, and `conflict`, and let the shared publisher return only `complete` or fail. Assert the adapter first verifies the exact same-run recovery Actions artifact ID/name/archive digest/payload digest/size/`created_at`/`expires_at`, then forwards the exact canonical bytes/SHA and byte-equal internally derived `attestationIdentity` plus `predicateBindings` to both shared calls through the generic publisher's exact `expected.predicateBindings` verification path. The generic publisher resumes only a matching missing half, performs zero write on `complete`, and fails with zero external write on `conflict`, multiple matches, wrong Actions artifact observation, wrong subject digest, wrong old target commit, wrong current attester source/workflow commit, predicate drift, workflow path/ref/SHA drift, wrong predicate type, no-claim bytes, or caller-supplied tag/name/identity/predicate.

- [ ] **Step 2 (2 min): Run RED and verify the adapter is absent**

```powershell
node --test server/tests/control-plane-recovered-closeout-publisher.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `control-plane-recovered-closeout-publisher.mjs`.

- [ ] **Step 3 (5 min): Implement a fixed adapter over the shared publisher**

```js
export function deriveRecoveredCloseoutPublication(bytes, bindings, actionsArtifactObservation) {
  const recovered = validateRecoveredCloseoutBytes(bytes, bindings);
  const sha256 = sha256Hex(bytes);
  validateActionsArtifactObservation(actionsArtifactObservation.value, {
    runId: bindings.recoveryRunId,
    runAttempt: bindings.recoveryRunAttempt,
    payloadSha256: sha256,
    minimumRetentionDays: 35,
  });
  const tag = `control-plane-recovered-closeout-${recovered.controllerRecoveryId}`;
  const attestationIdentity = Object.freeze({
    workflowPath: ".github/workflows/control-plane-receipt-recovery.yml",
    workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-receipt-recovery.yml@refs/heads/master",
    workflowSha: bindings.recoveryWorkflowSha,
    sourceCommit: bindings.recoverySourceCommit,
    predicateType: "https://slsa.dev/provenance/v1",
  });
  const predicateBindings = Object.freeze({
    schema: "control_plane_recovered_closeout_attestation_v1",
    repository: "gccwebos-com/proxy-gateway-minimal",
    originalTransactionTargetCommit: recovered.sourceCommit,
    attesterWorkflowPath: attestationIdentity.workflowPath,
    attesterWorkflowRef: attestationIdentity.workflowRef,
    attesterWorkflowSha: bindings.recoveryWorkflowSha,
    attesterSourceCommit: bindings.recoverySourceCommit,
    controllerRecoveryId: recovered.controllerRecoveryId,
    terminalReceiptSha256: recovered.terminalReceiptSha256,
    recoveredCloseoutSha256: sha256,
    actionsArtifactObservationSha256: actionsArtifactObservation.sha256,
  });
  validateRecoveredAttestationIdentity({
    targetCommit: recovered.sourceCommit,
    attestationIdentity,
    predicateBindings,
    recovered,
    bindings,
  });
  return Object.freeze({
    tag,
    assetName: `${tag}-${sha256}.json`,
    targetCommit: recovered.sourceCommit,
    sha256,
    attestationIdentity,
    predicateBindings,
  });
}

export async function publishRecoveredCloseout({
  bytes,
  repository,
  token,
  fetchFn,
  attestFn,
  bindings,
  actionsArtifactObservation,
}) {
  const publication = deriveRecoveredCloseoutPublication(
    bytes,
    bindings,
    actionsArtifactObservation,
  );
  const inspection = await inspectImmutableAssetAttestationPair({
    repository,
    ...publication,
    token,
    fetchFn,
  });
  if (inspection.state === "conflict") {
    throw safePublisherError("recovered_closeout_publication_conflict");
  }
  return publishImmutableAssetAttestationPair({
    repository,
    ...publication,
    bytes,
    token,
    fetchFn,
    attestFn,
  });
}
```

`validateRecoveredAttestationIdentity` requires `bindings.recoverySourceCommit === bindings.recoveryWorkflowSha`, protected current `refs/heads/master`, the fixed workflow path/ref above, and the fixed predicate type before the first GitHub read. It separately requires `targetCommit === recovered.sourceCommit`, canonical-validates `predicateBindings` with the imported Artifact-owned contract, and byte-compares its old target/current attester/terminal receipt/recovered-payload/current Actions-observation fields with the recovered receipt, derived payload digest, observation wrapper, and `attestationIdentity`; it never requires the old target to equal the current attester source. Both generic calls receive the same exact `predicateBindings`; the generic publisher passes them unchanged as verifier `expected.predicateBindings`, and the returned attestation must verify that predicate. The CLI reads one same-run downloaded recovered artifact path from fixed workflow environment, queries its exact Actions metadata with `actions: read`, revalidates its archive/payload digest, 35-day timestamp interval, and bindings, and emits only the shared publisher's closed state. It has no SSH/environment-secret lookup and no option for a caller tag, asset name, target commit, attestation identity, predicate, or no-claim override.

- [ ] **Step 4 (3 min): Run GREEN for all partial-pair states**

```powershell
node --test server/tests/control-plane-recovered-closeout-publisher.test.mjs
```

Expected: exact partial states resume monotonically; both shared calls receive the same exact attestation identity and predicate binding object, and the generic verifier receives it as `expected.predicateBindings`; original-target/current-attester substitution, identity/predicate drift, conflicts, and no-claim bytes make zero external writes.

- [ ] **Step 5 (2 min): Commit publisher adapter**

```powershell
git add scripts/control-plane-recovered-closeout-publisher.mjs server/tests/control-plane-recovered-closeout-publisher.test.mjs
git commit -m "feat(deploy): publish recovered closeout immutably"
```

---

### Task 8: Add The Manual Recovery Workflow And Static Contract Tests

**Files:**
- Create: `.github/workflows/control-plane-receipt-recovery.yml`
- Create: `server/tests/control-plane-receipt-recovery-workflow.test.mjs`

**Interfaces:**
- Consumes: the recovery controller and recovered publisher scripts from Tasks 6–7.
- Supplies the existing protected `JAPAN_CONTROL_DEPLOY_HOST`, `JAPAN_CONTROL_DEPLOY_PORT`, `JAPAN_CONTROL_DEPLOY_USER`, `JAPAN_CONTROL_DEPLOY_PRIVATE_KEY`, and `JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS` environment names only to `createRecoverySecretMaterializer`. No workflow/controller field aliases them as `RECOVERY_SSH_*`, constructs a tuple, or passes a protected value to `createSecureSshTransport`/`.request(...)`; these values never become job outputs.
- Produces: one `workflow_dispatch` workflow with `preflight`, `recover`, and `publish_recovered` jobs.
- Produces: a 35-day run-attempt artifact named from the fixed recovery ID/run/attempt; its single file is either `recovered-closeout.json` or `recovery-attempt-no-claim.json`.
- Enforces: shared concurrency, current `master`, exact job permissions, independently approved Environment, `persist-credentials: false`, bounded timeout, `always()` secret-file cleanup/readback, and publisher isolation.

- [ ] **Step 1 (5 min): Add RED workflow-source contract tests**

Read the workflow as text and through the repository's existing workflow-contract helper. Assert:

```js
assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), [
  "controller_recovery_id",
  "original_run_id",
  "original_run_attempt",
  "confirmation",
]);
assert.deepEqual(workflow.concurrency, {
  group: "japan-control-plane-production-authority",
  "cancel-in-progress": false,
});
assert.deepEqual(workflow.jobs.recover.permissions, {
  actions: "read",
  contents: "read",
  attestations: "read",
  "id-token": "write",
});
```

Also assert all three jobs require `refs/heads/master`; `preflight` has no Environment/secrets; `recover` uses only `vultr-japan-production` and the exact current `JAPAN_CONTROL_DEPLOY_*` five-secret plus bootstrap/authorization-variable set; no `RECOVERY_SSH_*`, variable credential ID, direct host/key constructor, `.execute`, or `.requestBootstrap` appears; `publish_recovered` has no Environment/SSH/OIDC-production value and derives the exact source/workflow/predicate attestation identity rather than reading caller inputs; every upload has `retention-days: 35`; no repository retention-settings URL appears; no-claim uploads its diagnostic, skips the publisher, and exits nonzero; and no job invokes deployment/ACK/upload-start commands or a closeout-transition audience.

- [ ] **Step 2 (2 min): Run RED and confirm the workflow file is missing**

```powershell
node --test server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: missing workflow assertion; the test parser itself loads successfully.

- [ ] **Step 3 (5 min): Add the exact three-job workflow skeleton**

Use pinned Actions and this exact authority split:

```yaml
name: Japan control-plane receipt recovery

on:
  workflow_dispatch:
    inputs:
      controller_recovery_id:
        description: Canonical cr1 recovery identifier
        required: true
        type: string
      original_run_id:
        description: Completed original workflow run ID
        required: true
        type: string
      original_run_attempt:
        description: Completed original workflow run attempt
        required: true
        type: string
      confirmation:
        description: Type exactly - recover japan control-plane receipt
        required: true
        type: string

permissions: {}

concurrency:
  group: japan-control-plane-production-authority
  cancel-in-progress: false

jobs:
  preflight:
    if: ${{ github.ref == 'refs/heads/master' }}
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    outputs:
      preflight_artifact_name: ${{ steps.preflight.outputs.preflight_artifact_name }}
      preflight_sha256: ${{ steps.preflight.outputs.preflight_sha256 }}
    permissions:
      actions: read
      contents: read
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          persist-credentials: false
          ref: ${{ github.sha }}
      - name: Validate current master and original attempt
        id: preflight
        env:
          GITHUB_TOKEN: ${{ github.token }}
          CONTROLLER_RECOVERY_ID: ${{ inputs.controller_recovery_id }}
          ORIGINAL_RUN_ID: ${{ inputs.original_run_id }}
          ORIGINAL_RUN_ATTEMPT: ${{ inputs.original_run_attempt }}
          RECOVERY_CONFIRMATION: ${{ inputs.confirmation }}
        run: node scripts/control-plane-receipt-recovery-controller.mjs preflight
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: ${{ steps.preflight.outputs.preflight_artifact_name }}
          path: .control-plane-safe/recovery-preflight.json
          if-no-files-found: error
          retention-days: 35

  recover:
    needs: preflight
    if: ${{ github.ref == 'refs/heads/master' }}
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: vultr-japan-production
    outputs:
      result_kind: ${{ steps.result.outputs.result_kind }}
      result_artifact_name: ${{ steps.result.outputs.result_artifact_name }}
      producing_run_attempt: ${{ steps.result.outputs.producing_run_attempt }}
    permissions:
      actions: read
      contents: read
      attestations: read
      id-token: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          persist-credentials: false
          ref: ${{ github.sha }}
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: ${{ needs.preflight.outputs.preflight_artifact_name }}
          path: .control-plane-safe
      - name: Read one retained terminal record
        id: recover
        env:
          GITHUB_TOKEN: ${{ github.token }}
          JAPAN_CONTROL_DEPLOY_HOST: ${{ secrets.JAPAN_CONTROL_DEPLOY_HOST }}
          JAPAN_CONTROL_DEPLOY_PORT: ${{ secrets.JAPAN_CONTROL_DEPLOY_PORT }}
          JAPAN_CONTROL_DEPLOY_USER: ${{ secrets.JAPAN_CONTROL_DEPLOY_USER }}
          JAPAN_CONTROL_DEPLOY_PRIVATE_KEY: ${{ secrets.JAPAN_CONTROL_DEPLOY_PRIVATE_KEY }}
          JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS: ${{ secrets.JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS }}
          RECOVERY_BOOTSTRAP_GENERATION: ${{ vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION }}
          RECOVERY_BOOTSTRAP_RECEIPT_SHA256: ${{ vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256 }}
          RECOVERY_AUTHORIZATION_BINDING_HMAC_SHA256: ${{ vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256 }}
          RECOVERY_AUTHORIZATION_STATE_SHA256: ${{ vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256 }}
          RECOVERY_PREFLIGHT_SHA256: ${{ needs.preflight.outputs.preflight_sha256 }}
        run: node scripts/control-plane-receipt-recovery-controller.mjs recover
      - name: Classify recovery result
        id: result
        run: node scripts/control-plane-receipt-recovery-controller.mjs validate-result >> "$GITHUB_OUTPUT"
      - name: Remove restricted material and verify absence
        if: ${{ always() }}
        run: node scripts/control-plane-receipt-recovery-controller.mjs cleanup
      - name: Upload recovery result
        id: upload_result
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: ${{ steps.result.outputs.result_artifact_name }}
          path: .control-plane-safe/recovery-result/*.json
          if-no-files-found: error
          retention-days: 35
      - name: Reject a no-claim attempt
        if: ${{ steps.result.outputs.result_kind != 'validated' }}
        run: exit 1

  publish_recovered:
    needs: recover
    if: ${{ github.ref == 'refs/heads/master' && needs.recover.result == 'success' && needs.recover.outputs.result_kind == 'validated' }}
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      actions: read
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          persist-credentials: false
          ref: ${{ github.sha }}
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: ${{ needs.recover.outputs.result_artifact_name }}
          path: .control-plane-safe/recovery-result
      - name: Publish validated recovered closeout
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: node scripts/control-plane-recovered-closeout-publisher.mjs
```

`validate-result` emits exactly three safe lines: `result_kind=validated|no_claim`, `result_artifact_name=receipt-recovery-result-{recoveryRunId}-{producingRunAttempt}`, and `producing_run_attempt={producingRunAttempt}`. The publisher downloads that exact producing artifact through `needs.recover.outputs`, so a publisher-only failed-job rerun can resume a matching partial Release/attestation pair without regenerating different recovered bytes. Rerunning the protected recovery job creates a new attempt-bound envelope; if an older partial fixed-tag publication exists, the generic publisher classifies the different bytes as conflict and makes no write. The no-claim artifact uploads first and then the protected job exits nonzero, so its diagnostic is durable without presenting a green recovery run. `cleanup` removes only exact runner-temporary paths created by the controller, verifies each absent, and never contacts the host. Preflight byte-compares `github.ref`, current `master` SHA, workflow path/ref/SHA, and exact input/run attempt before the protected job becomes eligible.

- [ ] **Step 4 (3 min): Run GREEN and workflow permission/retention regression**

```powershell
node --test server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: dispatch, concurrency, Environment, permissions, pinning, 35-day uploads, no-claim skip, and forbidden-command assertions all pass.

- [ ] **Step 5 (2 min): Commit workflow source and contract test**

```powershell
git add .github/workflows/control-plane-receipt-recovery.yml server/tests/control-plane-receipt-recovery-workflow.test.mjs
git commit -m "feat(deploy): add manual receipt recovery workflow"
```

---

## Source-Only Validation And Integration Handoff

The rollout/docs integration plan exclusively owns `schemas/README.md` and `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`. Hand it these exact schema-index facts without editing either file in this slice:

| Schema | Authority/mutability statement |
| --- | --- |
| `control-plane-host-terminal-receipt-v1.schema.json` | immutable host terminal facts; initial controller artifact state only |
| `control-plane-host-terminal-record-v1.schema.json` | immutable outer replay and receipt-digest binding |
| `control-plane-host-closeout-record-v1.schema.json` | separate monotonic host CAS and disposition record |
| `control-plane-controller-closeout-v1.schema.json` | immutable original Actions payload; never rewritten with upload metadata |
| `control-plane-controller-final-status-v1.schema.json` | aggregate-only terminal/no-claim controller output; exact bytes are the sole Deploy Note input |
| `control-plane-receipt-recovery-challenge-v1.schema.json` | volatile root-HMAC challenge with a 60-second maximum lifetime |
| `control-plane-recovered-closeout-v1.schema.json` | immutable validated recovery claim eligible for fixed publication |
| `control-plane-recovery-attempt-no-claim-v1.schema.json` | attempt-scoped diagnostic with no publication or Deploy Note authority |

The integration documentation must state that present-artifact retention comes from exact `created_at`/`expires_at`/`digest` metadata rather than repository Administration settings, and that only the host closeout record can move to `upload_committed_observed`.

Artifact Task 11 must implement `server/services/deployment/control-plane-production-controller.mjs` and its CLI imports of Bootstrap `readTerminalBundleBytes(...)` plus Receipt-owned `createControllerCloseoutAdapter(...)`, `buildControllerFinalStatus(...)`, and `validateControllerFinalStatus(...)`; Artifact Task 12 must wire that exact controller into `.github/workflows/japan-control-plane-production-deploy.yml`. Receipt does not own or recreate either Artifact file. Integration Task 6 later verifies their exact committed bytes and real owner/cross-owner tests without modifying, staging, or recommitting them. The controller creates one `createSecureSshTransport({ native, clock, secretMaterializer })` for its full status/bundle/closeout lifecycle and closes it exactly once in an outer `finally`. For a terminal ordinary status, Artifact preserves the exact privately branded sixteen-field result unchanged, calls `readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30000 })`, then passes the same `status`, untouched bundle wrapper, and canonical `null` or unchanged five-field `artifactAccepted` value to `validateTerminal({ status, terminalBundle, plan, artifactAccepted })`. Bootstrap alone validates bundle-chunk transport envelopes; Receipt alone parses the canonical terminal bundle and returns the safe terminal result including Host-derived `transactionInvocationSha256`.

The two closeout completion stages remain distinct. First, the controller passes each object returned by `createUploadStartedRequest(...)` and `createAckRequest(...)` unchanged to `transport.request(...)`, then passes each complete transport envelope to `validateUploadStartedResponse(...)` or `validateAckResponse(...)`. The ACK call is exactly `validateAckResponse({ transportResult, immutable, observation, uploadStartedStatus, expected })`; when present it returns only the validated eight-field `status_closeout_ack` value plus `responseSha256` and cannot become final status. A possibly lost response leaves `ackStatus: null` and never causes an ACK retry. Second, after that one ACK attempt, `createCommittedStatusRequest({ plan, immutable, observation, ackStatus })` returns `{ transportRequest, expectedStatus }`, with exact `{ requestId, gateId, deploymentPlanSha256, transactionId }`; request ID is correlation only. Artifact passes the nested request unchanged to `.request(...)`, then calls `validateUploadCommittedObserved({ transportResult, immutable, observation, terminal, ackStatus, expectedStatus })`. That validator returns the independently read-back sixteen-field ordinary status plus its own `responseSha256`; only this distinct object can become `validatedFinalHostStatus`. Bootstrap owns envelope validation inside bundle reads; Receipt owns envelope validation for upload-start, ACK, and the post-ACK ordinary status.

The Actions readback result remains the full `{ value, bytes, sha256 }` observation wrapper through ACK and final-status construction. For a no-claim branch, `createNoClaimEvidence(...)` supplies non-null immutable closeout bytes and exact bindings, while observation and validated final host status are both `null`; it makes no terminal-bundle read, upload-start, closeout artifact upload, ACK, or committed-status request. No controller/workflow path reads or passes host, port, username, private key, or known-hosts bytes. Transport-only labels such as `stopped_pre_apply`, `rolled_back_validated`, or `controller_closeout_pending` cannot become controller closeout results; they must be resolved through the five host final states or the exact no-production-claim results before serialization. A generic `closeoutPublisher.publish({ plan, terminal })`, inner-observation-only handoff, ACK-as-final-status substitution, or `null` controller-closeout shortcut is forbidden. Terminal closeout must execute the fixed bundle/Receipt validation, cleanup, Bootstrap-owned full-tuple OIDC `upload_started`, 35-day immutable upload, Actions readback, local-file deletion, one independently bound ACK attempt, and separate read-only host `upload_committed_observed` observation. Artifact alone owns `finalStatusSink.writeExact({ bytes, sha256 })`; it writes `buildControllerFinalStatus(...)` bytes unchanged, and the final-status artifact and Deploy Note validate those exact bytes without reconstructing a local status object.

The master Receipt checkpoint must use only actual test files owned by these plans:

```powershell
node --test --test-concurrency=1 server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-receipt-recovery.test.mjs server/tests/control-plane-recovered-closeout-publisher.test.mjs server/tests/control-plane-receipt-recovery-workflow.test.mjs server/tests/github-immutable-release-publisher.test.mjs
```

- [ ] **Validation Step 1 (5 min): Run the combined receipt/recovery suite**

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-receipt-recovery.test.mjs server/tests/control-plane-recovered-closeout-publisher.test.mjs server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: all focused tests pass with zero failures.

- [ ] **Validation Step 2 (5 min): Run full repository validation**

```powershell
npm test
```

Expected: zero failures, with only documented platform-condition skips.

- [ ] **Validation Step 3 (3 min): Verify exact diff and worktree scope**

```powershell
git diff --check origin/master...HEAD
git status --short --branch
git rev-parse HEAD
```

Expected: `git diff --check` exits `0`; the branch contains only the one coordinated source-only Draft PR slice; and the exact head is recorded in the handoff.

Do not run `gh workflow run`, `gh run rerun`, `gh release create`, `gh api` write requests, `git push`, SSH, provider commands, or any production probe as part of this validation. Artifact Tasks 11-12 alone compose the Receipt adapter/CLI into the normal controller and production workflow. Integration Task 6 performs only no-change real conformance against those owner files; the later documentation task may update the schema index/runbook but must consume these interfaces without changing their state algebra or permission boundary.
