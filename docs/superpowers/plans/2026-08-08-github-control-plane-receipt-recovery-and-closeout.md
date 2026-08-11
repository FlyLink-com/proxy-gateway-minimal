# GitHub Control-Plane Receipt Recovery And Closeout Implementation Plan

> **For future agentic workers after the current authorization STOP is separately cleared:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the then-authorized plan task-by-task. This line grants no current Receipt implementation authority. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (future complete plan):** Implement canonical Japan control-plane terminal receipts, normal GitHub controller closeout, and a separately approved read-only receipt-recovery workflow that can produce one durable recovered-result artifact without reusing production approval, mutating the host, or rewriting the original Actions run. The current authorization stops before Task 1; recovered Release/attestation publication remains independently fail-closed until the unified full-Sigstore owner and its publication authority are separately approved.

**Architecture:** The host owns terminal truth and a separate monotonic closeout record; an ordinary bounded status names one immutable terminal-bundle digest/size, and the original controller retrieves that exact bundle through Bootstrap-owned 768-byte read-only chunks on the same sealed transport before validating its Receipt-owned canonical bytes. The controller then uploads one immutable `controller_closeout` payload, verifies the Actions artifact, acknowledges the host, and independently reads the committed closeout state. A distinct manual recovery workflow first proves the exact failed original attempt through read-only Actions APIs, obtains a volatile host challenge, mints challenge-audience OIDC, and reads one retained record through the current parser registry. Its no-secret `publish_recovered` job retains a reviewed future Release/attestation topology, but the current Artifact-owned prepare and postverify bytes both fail with `github_full_sigstore_owner_unavailable` before any publication read, write, file, output, attestation eligibility, or completion. All JSON byte parsing and hashing come from the shared canonical JSON foundation; no current recovered-publication success authority exists.

**Tech Stack:** Node.js ESM, Node test runner, strict canonical UTF-8 JSON, JSON Schema, GitHub Actions workflow YAML, GitHub Actions REST API, GitHub OIDC, the existing fixed SSH forced-command boundary, and the shared database terminal-vector validator.

## Global Constraints

- Risk: A, because this slice defines production closeout authority, recovery authentication, receipt schemas, and a protected workflow. The plan is currently dormant and grants neither source implementation nor production execution approval.
- Current process: **STOP before Task 1** with exact reason `full_sigstore_owner_topology_unapproved`. The independently missing, separately approved content-addressed offline npm cache/vendor closure is a second hard authorization STOP. Every Task 1-8 checkbox, interface/code example, RED/GREEN command, expected result, commit command, implementation-validation command, and implementation handoff below is retained future design only; none may be executed, checked, staged, committed, pushed, opened as a main implementation PR, or reported GREEN/accepted under the current authorization. Only the explicitly enumerated document-only checks remain current.
- Sole current exception: only the separate, already approved exact 11-file authority-bootstrap predecessor may proceed under its own Spec-owned source-only scope and lifecycle. This Receipt plan neither implements, expands, commits, pushes, reviews, readies, merges, nor counts that predecessor as Receipt progress; the exception cannot add an owner/runtime factory, satisfy Foundation, or unlock Receipt Task 1.
- Future process after a new explicit Risk A resume authorization: implement every task RED -> observed expected failure -> minimal GREEN -> focused regression -> dedicated commit, then run the complete local validation matrix. Do not dispatch either deployment or recovery, request a protected Environment approval, access a production host, publish a Release, create an attestation, or write a Deploy Note while executing this future source-only plan.
- Future PR count after the STOP is cleared: 1 main source-only Draft PR slice containing these modules, schemas, workflow source, and tests, after the separately merged narrow authority-bootstrap predecessor. Keep it in the same main implementation PR as the foundation/host/database/GitHub-publisher slices; do not open a second receipt-recovery PR. No Receipt implementation PR or push is currently authorized.
- Current validation is limited to this document's fence balance/parsing, raw authorization-boundary checks, documentation-authority/project-state checks, `git diff --check`, worktree-scope inspection, and hashing; these checks validate only this plan correction and cannot make any Receipt task GREEN. Focused Node task tests, the combined receipt/recovery suite, full `npm test`, dependency installation/fetch, offline/native validation, GitHub-hosted CI, CodeQL, protected dry-run, and production execution remain future gates and cannot substitute for the missing owner/lock/offline-closure authorization.
- Production/AWS impact: none during this document-only correction or any future source-only implementation. `production_state: not_deployed`; `release_unit: control-plane-app`; `identity_impact: false` for this controller-only slice.
- After the current STOP is separately cleared, execute `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md` and Host/DB Tasks 0-10 first in the same source branch. Future Tasks 1-2 consume only Foundation's canonical JSON/durable-store contracts and Host/DB's frozen database contract; they do not import Bootstrap Task 9 host-protocol code or require Artifact Task 7's publisher to exist.
- After that future provider order reaches it, execute Bootstrap Tasks 9-10 before Task 3. Task 3 imports only the completed Bootstrap transport validator, ordinary-status validator, and private ordinary-status assertion required to mint its committed-final-status brand. Task 4 then composes the broader Bootstrap terminal-bundle/transition surfaces. Neither task copies Bootstrap's request-type enum, transition tuple, audience grammar, response codec, status brand, or sealed-descriptor transport.
- Execute Host/DB Tasks 11-13 and Artifact Task 7 before future Task 5. Tasks 5-8 may then consume the completed host terminal/recovery integration evidence and Artifact's fixed recovery authority fixture. The generic `scripts/github-immutable-release-publisher.mjs` state machine is a future, separately approved dormant surface in this revision; Receipt must not call it or create another Host reader, SSH route, Release/asset/attestation client, or publication state machine.
- The recovery confirmation phrase is exactly `recover japan control-plane receipt`. Case changes, surrounding whitespace, Unicode lookalikes, line breaks, and any fifth dispatch input are rejected.
- The recovery workflow dispatch surface contains exactly `controller_recovery_id`, `original_run_id`, `original_run_attempt`, and `confirmation`.
- The recovery workflow never reads the repository artifact-retention setting. That endpoint requires repository Administration read authority and is outside this least-privilege contract.
- Every recovery artifact upload fixes `retention-days: 35` and names one fixed non-hidden regular file under `control-plane-recovery-runner-temp`; no upload uses a hidden-path default, directory upload, glob, symlink, or caller-selected path. Before upload, the workflow-only runner store requires the private non-symlink root and sole expected regular file at mode `0600`, bounded, canonical, aggregate-safe, and free of protected Environment values or credential-shaped fields. Because Actions artifacts do not preserve Unix mode, each download lands in its own fixed non-hidden `download/*` directory; the next owner CLI opens the sole regular non-symlink/non-hardlinked file with no-follow semantics, bounds and canonical-validates it, copies exact bytes by exclusive create into the private mode-`0600` owner path, fsyncs/readbacks, then deletes and proves the landing directory absent before use. It never treats archive mode as trusted or applies chmod through a symlink. A present original artifact is eligible only when its Actions artifact response has one exact `created_at`, `expires_at`, and `digest`, the expiry is in the future, and `expires_at - created_at >= 35 days`.
- The normal production workflow's original `controller_closeout` upload also fixes `retention-days: 35`; Artifact Task 12 implements that exact workflow setting, while Integration Task 6 only verifies the already committed owner bytes and real tests without changing them. The repository default is never substituted.
- Actions artifact `digest` is the archive digest in exact form `sha256:<64 lowercase hex>`. It is never compared directly with the canonical JSON payload SHA-256. The downloaded archive must contain exactly one expected file; that file is canonical-validated and separately hashed as `payloadSha256`.
- The 24-hour recovery window uses only the attempt-specific `updated_at` returned for `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}` after `status === "completed"` and an allowed closed conclusion. `run_started_at`, `created_at`, workflow-level latest-attempt metadata, artifact timestamps, and host terminal time never substitute for attempt `updated_at`.
- Allowed original native conclusions are exactly `cancelled`, `failure`, `timed_out`, `stale`, and `startup_failure`. Reject `success`, `neutral`, `skipped`, `action_required`, `null`, an in-progress status, another attempt, an unknown conclusion, a future `updated_at`, or age greater than 24 hours.
- An immutable uploaded `controller_closeout` payload that contains a host terminal receipt always binds that receipt's initial `controllerCloseoutArtifactState: not_started`. It is never rewritten after upload. A no-transaction admission response has no host lease and uses `null`; only the separate host closeout record may transition `not_started -> upload_started -> upload_committed_observed` through exact monotonic CAS.
- The original controller artifact repository is fixed to exact `gccwebos-com/proxy-gateway-minimal`, and its name is owner-derived as exactly `control-plane-controller-closeout-{controllerRecoveryId}-{originalRunId}-{originalRunAttempt}`. The immutable wrapper name, canonical payload `artifactPolicy.artifactName`, Actions observation name, and derived expected name must all be byte-equal; no workflow/controller/recovery caller reports an expected repository or name. Its archive contains exactly one file named `controller-closeout-{payloadSha256}.json`.
- The original closeout sequence is fixed for a validated terminal branch only: validate one ordinary terminal status; on that same Bootstrap transport retrieve its exact named terminal bundle through contiguous 768-byte read-only chunks and validate the receipt/outer record/initial closeout/lease/index tuple; remove and read back only Receipt-owned closeout staging/local bytes that are no longer needed; use the Bootstrap-owned full tuple/audience/frame builders to mint a fresh `upload_started` transition-specific OIDC assertion; send `status_closeout_upload_started` through the transport's `.request(...)`; upload the immutable payload; read back exact Actions artifact metadata and downloaded payload; delete and read back the runner payload file; mint a distinct `upload_committed_observed` assertion through the same Bootstrap contract; send `status_closeout_ack` through `.request(...)` and validate that complete ACK envelope; then issue a separate read-only ordinary `status` request and validate its independently read-back host closeout state as `upload_committed_observed`. The immutable controller payload continues to bind the initial `not_started` record; only the host record advances by CAS. Receipt never owns or claims cleanup of the raw/candidate artifact, initial/transition/recovery OIDC material, SSH material, or transport. Artifact closes the transport, destroys every OIDC value, closes the artifact stream, and obtains its separate private lifecycle-cleanup brand with exact absence readback before it may durably write the already built final-status wrapper, append GitHub outputs, or emit success. A no-claim branch performs neither bundle retrieval, host transition, fixed-tag reservation, nor committed-state readback but is subject to that same Artifact durable-write gate.
- The host local finalizer alone may attach an overdue unacknowledged closeout after the fixed 120-second deadline. Receipt recovery never starts the finalizer, resets the deadline, changes lease state, sends closeout ACK, or performs a journal/lease CAS.
- `controller_closeout_pending` is valid only before the exact acknowledgement deadline. `controller_closeout_acknowledged_released` requires matching `upload_committed_observed` evidence. `controller_closeout_abandoned_attached` requires deadline expiry, durable terminal attachment, inactive finalizer, and exact terminal/lease binding. An overdue unattached lease never yields a normal or recovered production claim.
- Terminal publication and final controller validation are different observation points. For `critical_manual_intervention_required`, the immutable terminal receipt proves publication while the external finalizer is still active and holds both exclusive business/global-identity leases under the unchanged critical fence. Receipt validation must not require those transient authorities to be inactive/free at publication. Only after publication may Bootstrap's ordinary-status reader call Host `createCriticalPostPublicationProofReader(...).readAndVerify(...)`, pass that same private-branded reference through `assertCriticalPostPublicationProof(...)`, and issue its own private ordinary-status brand. The Receipt final validator accepts that unchanged transitive brand only for the critical row; it never accepts serialized proof fields or adds them to the terminal receipt. Non-critical rows follow Bootstrap's frozen ordinary-status state matrix and do not manufacture or require the critical proof. The terminal bundle and the state-appropriate later ordinary status are both mandatory; neither substitutes for the other or rewrites the receipt.
- The terminal receipt's canonical `terminalPublishedAt` is the sole deployment-time authority. Receipt exact-copies it through the branded terminal result, immutable controller closeout, and terminal final-status branch; every no-claim branch fixes it to `null`. The controller's later `observedAt` is freshness/closeout observation only. Each of the five validated terminal result codes may produce at most one bounded Deploy Note comment. Only exact `validated_deployment` may include `deployed_at`, and only from validated `terminalPublishedAt`; the other four terminal comments use their validated stopped/schema-only/rollback/critical-failure wording and omit `deployed_at`. A no-claim or nonterminal result writes no comment.
- Recovery has a variable but hard-bounded direct host-request count. On one Bootstrap transport with exact frozen surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`, it sends `status_recover_challenge` and `status_recover` through `.request(...)`; those responses yield only the current private-branded terminal selector/digest, never retained Receipt bytes and never a terminal-bundle-reader brand. Receipt passes that exact recovery brand only to Bootstrap `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })`, which returns `{ requestBytes, expected }` with exact expected `{ requestId, gateId, deploymentPlanSha256, transactionId }`. The ordinary-status request loop is literally `pollIndex < 6`, so it can send only indices `0..5`; a separate seventh schedule boundary at `pollStartedAt + 30000` performs no request and can produce only no-claim when no timely immutable terminal exists. Before every sleep and request the controller requires strictly positive remaining time, rejects an early-waking or stalled sleep before another request, clamps each request timeout to `min(30000, remaining)`, and rechecks the monotonic clock after transport completion even if transport ignored its timeout. The absolute deadline is assigned once and never refreshed; scheduler faults, the six-request limit, and completion at or after the deadline yield only `recovery_not_terminal_no_claim` with at most six ordinary requests and zero bundle read/publication. Only a timely resulting Bootstrap ordinary-status brand may enter `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs: 30000 })`, whose separate single `.requestStatusBundle(...)` operation authenticates once and internally consumes one through at most 342 contiguous 768-byte frames for a maximum 262,144-byte bundle. Critical eligibility therefore transitively includes Host `assertCriticalPostPublicationProof`; non-critical rows follow the frozen ordinary-status matrix without that Host proof. The workflow controller closes the same transport in one outer `finally`. The volatile challenge is root-HMAC authenticated, rate-limited, and expires after 60 seconds without persistence; challenge/status select exactly one retained terminal identity and perform no retained-state mutation.
- Recovery uses the current protected deploy material only through one transport-owned call to `secretMaterializer.materializeFixedCredential("japan-control-plane-github-deploy-v1")` after the frozen Linux capability vector is fully true. `materializeFixedCredential` is the materializer's only method; it returns exactly frozen `{ material, expectation }`. `material` has Bootstrap's exact eleven `FIXED_CREDENTIAL_MATERIAL_FIELDS`; `expectation` has the exact eight `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, is created only by `createFixedCredentialExpectation({ credentialId, authorizationGeneration, bootstrapReceiptSha256, knownHostsFingerprint, knownHostsTupleSha256, expiresAt, observedAt })`, and carries Bootstrap's private brand. The producer derives the real known-host binding with `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, calls `assertKnownHostsRecordExpectation({ binding, material })`, then `validateFixedCredentialMaterial(material, expectation)`; it never supplies `principal`, `user`, `now`, `expiresAfter`, or a raw/cloned expectation. Bootstrap captures/seals that one producer original, zeroes its mutable Buffers in the capture `finally`, creates a fresh non-aliased clone for every actual `.request(...)`/`.requestStatusBundle(...)` operation, zeroes/closes each operation clone, and zeroes/closes retained originals on idempotent `.close()` in the controller's outer `finally`. Recovery must not rematerialize, cache/clone the credential itself, or define another dispose function. `materializeDeploy`, `materializeBootstrap`, caller-selected activation/key selectors, and a second Environment materialization are forbidden. No recovery controller function reads or passes host, port, username, private-key bytes, or known-hosts bytes. Any false or unknown first capability probe stops before materialization with materializer-call and Environment-read count zero. Recovery does not define a second key, read `JAPAN_CONTROL_DEPLOY_BINDING_KEY` or `JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY`, or accept an old bootstrap generation.
- Recovery never sends `execute_auth`, `status_closeout_upload_started`, or `status_closeout_ack`; never starts/stops a service; never changes a pointer, database, journal, guard, permit, backup, release, credential, or host record; and never selects a second retained record.
- Receipt recovery never owns the four-minute host transaction-recovery clock or phase graph. It consumes only Host-owned terminal evidence. Host must first read and validate the persisted recovery phase; after the durable deadline expires, only an exact ordinary nonterminal phase -> `record_critical` edge or persisted `critical_finalize_pending` -> external `finalize_critical` edge is permitted. Every other expired edge rejects before broker, release, database, pointer, receipt, or recovery-publication work, and reboot tests prove the original deadline is not reset.
- Before normal finalize, Host recovery finalize, or external critical finalize publishes any Receipt-owned terminal/closeout object, the composition must call only Bootstrap `createBootstrapMaintenanceCoordinator({ native, clock }).runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })`. That capability-gated coordinator holds/readbacks its one fixed global maintenance lock, captures one owner clock value, and drives only Bootstrap's deterministic CAS compactors; Receipt/Host never call `compactEligible` or supply a capability/time/digest directly. Closeout-index compaction protects every entry younger than 35 days, every active/nonterminal entry, the newest terminal for each target, the newest critical terminal, every parser-required terminal, and every transaction protected by recovery. A full protected index fails closed. Replay 128/129 and closeout-index 1,024/1,025 boundaries, stale CAS, crash before/after either CAS, restart, and concurrent preflight are owner-conformance tests before publication can continue.
- The workflow path is exactly `.github/workflows/control-plane-receipt-recovery.yml`, it runs only from protected current `refs/heads/master`, and every challenge binds the workflow path/ref/SHA, current source commit, GitHub-hosted runner, `workflow_dispatch`, Environment `vultr-japan-production`, current bootstrap tuple, current recovery controller digest, and current parser-registry digest.
- Workflow-source checks are defense in depth, not proof of GitHub Environment configuration. Capability remains disabled until a separate GitHub settings Gate proves required reviewers, self-review prevention, protected-branch-only deployment, and disabled admin bypass for `vultr-japan-production`. Every run then re-proves that live authority: token-only preflight calls Artifact Task 6's `readEnvironmentPolicy` and stores its exact current user-only canonical policy bytes and digest without reading approval history, while each protected job's absolute first executable step is Artifact Task 7 Step 6a extension's exact rendered authority-step wrapper byte/hash pair. The wrapper's script contains exactly one hash-frozen `authorityControlBytes` body plus one explicit awaited invocation; that invocation re-reads byte-identical policy, same-run approval history, and exact `/users/{login}` identity before checkout, download, setup, local/repository action, implicit token consumer, protected value, variable, OIDC request, SSH/native construction, or materializer call. The sole accepted approver is a current policy `type:"user"` row with stable decimal ID, normalized lower-case login, and `slug:null`, and is distinct from both dispatch actor identities; Team/unknown reviewers, self approval, bypass, wrong run/attempt, non-master ref, or any drift leaves every later step and protected read at zero. No organization-membership API, PAT, or App credential exists.
- The original run evidence must identify workflow path `.github/workflows/japan-control-plane-production-deploy.yml`, the exact repository/owner, `workflow_dispatch` event, protected `master` ref, head SHA, run ID, and run attempt indexed by the retained host record. A completed non-success run from another workflow, repository, ref, commit, or attempt is ineligible.
- Deployment, recovery, and bootstrap rotation share concurrency group `japan-control-plane-production-authority` with `cancel-in-progress: false`.
- The recovery workflow sets workflow-level `permissions: {}` and has exactly the ordered jobs `preflight`, `recover`, and `publish_recovered`. Their complete permission maps are respectively exact `{ actions: read, contents: read }`, `{ actions: read, attestations: read, contents: read, id-token: write }`, and `{ actions: read, attestations: write, contents: write, id-token: write }`; no inherited or unlisted scope is accepted. Their exact explicit step-token counts are `1/2/4`: preflight policy/readback; absolute-step-zero production authorization plus the later bounded recovery read; and the four frozen publisher token placements. Each protected job's first executable step is Artifact Task 7 Step 6a extension's exact rendered wrapper byte/hash pair; its script contains the authority body once and one explicit awaited invocation. No checkout, download, setup, local/repository action, implicit token consumer, secret/variable/OIDC reference, or other executable step precedes it. The protected recovery job has no repository write permission. The only default-token exception is the pinned read-only `actions/checkout` fetch in `preflight` and, after absolute step zero, in `recover`; both run under `contents: read`, set `persist-credentials: false`, retain no credential, and are intentionally excluded from the `1/2/4` explicit-placement counts. The isolated recovered-result publisher is bound only to `artifact-publication`, is entirely no-checkout/data-only, and has no production Environment, SSH material, production OIDC audience, host route, or repository publisher script. Its current exact `prepare` body raises `github_full_sigstore_owner_unavailable` before any Release/asset or subject/predicate effect and emits no `attest_missing`, so the pinned `actions/attest` row and later `postverify` row are unreachable. Those rows and their explicit tokens, OIDC input, single-subject paths, and permission map are frozen future topology only; they do not authorize execution or claim completion under the current authorization.
- Normal closeout imports two non-interchangeable Bootstrap-owned OIDC transition bindings. `upload_started` binds its current closeout-record digest and has `actionsArtifactObservationSha256: null`; `upload_committed_observed` binds the post-upload observation digest. Each binding includes the same full repository/workflow path/ref/SHA/Environment/run/attempt/controller-recovery/terminal/expected-closeout tuple and has a distinct audience, token, and verified JTI. Source identity remains transitively bound by the immutable terminal receipt and Deployment Plan and is not duplicated in this transition tuple. Neither token nor JTI is persisted in a receipt, artifact, diagnostic, or summary. Recovery OIDC remains challenge-audience status-only and can never satisfy either closeout transition.
- The validated Deployment Plan's exact source-origin tuple `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, and `mainSourceMergeCommitSha` is copied unchanged through `expectedBindings`, both terminal and no-claim controller-closeout bytes, and both terminal and no-claim `CONTROLLER_FINAL_STATUS` bytes. `sourceCommit` remains the independently deployed protected-master commit and may be a later reconciliation descendant of `mainSourceMergeCommitSha`. Receipt performs only closed canonical shape/equality validation of these plan-bound values: it imports no main-source owner resolver, calls no GitHub API, and grants no Deploy Note authority to a no-claim branch.
- An Actions artifact observation identity is the canonical serialization of only immutable repository/run/attempt/artifact ID/name/archive digest/payload digest/size/`created_at`/`expires_at` fields. The complete `readbackAt` timestamp is a required trusted-clock validation input for freshness and retention checks, but is never a field of the observation value, canonical bytes, SHA-256, host ACK, final-status digest, or attestation predicate. Re-reading the same immutable artifact before expiry therefore reproduces byte-identical observation bytes/SHA across normal closeout and host recovery. A future separately approved publisher-only resume would have to preserve the same invariant; current code cannot enter that dormant path, and any stable-field drift still fails closed.
- No-claim states create only a run-attempt-scoped `recovery_attempt_no_claim` artifact. They create no fixed tag, Release asset, attestation, Deploy Note, original-run update, or reservation of a later validated result.
- The tag `control-plane-recovered-closeout-{controllerRecoveryId}`, payload-derived filename, three-stage prepare/pinned-attest/postverify sequence, and states `none`, `asset_only`, `attestation_only`, `complete`, and `conflict` are a future separately approved dormant publication contract only. In the current revision Artifact's exact prepare and postverify bodies both raise `github_full_sigstore_owner_unavailable`; prepare performs zero Release/asset reads or writes, creates zero subject/predicate files, emits zero outputs, and cannot make the pinned attestation eligible, while postverify performs zero publication reads and cannot emit completion. No current GREEN/acceptance row exercises resume or completion, and Receipt adds no `attestFn`, custom Sigstore client, dynamic action, caller-selected subject/predicate, or substitute authority.
- Each logical database capability handoff is Host/Foundation-owned and contains exactly two `SCM_RIGHTS` descriptors in order: `databaseFd`, then `identityLeaseFd`. Receipt serializes only the aggregate result returned by Host's exact `validateDatabaseTerminalVector(...)`; it never accepts a third descriptor, copies the database state matrix, opens a database, or treats an FD/path as receipt evidence.
- Raw SSH stdout/stderr, OIDC tokens, private keys, known-host contents, host paths, environment values, config, URLs, PIDs, database rows, customer data, and credentials never enter artifacts, logs, summaries, errors, fixtures, or test snapshots.
- Do not modify `bin/gccgw.mjs`, add a user-facing local CLI command, add a dependency, change an Admin/Portal source file, or alter production configuration. The scripts in this plan are workflow-only entrypoints. Every such script must export a testable runner and a zero-argument fixed operations factory, use one `pathToFileURL(process.argv[1])` direct-main guard, and set `process.exitCode` to only `0`, `1`, or `2`: `0` only after that command's complete exact readback and, for a finalizing command, its required postverification; `2` only for closed argv/usage rejection before env/fs/fetch/transport access; and `1` for every bounded operation failure. Direct execution never accepts an operations/fetch/fs/transport factory through argv or env, emits no stack/exception/raw input/URL/path/token/credential/host diagnostic, leaves stdout empty on failure, and writes at most one script-specific LF-terminated safe stderr code no longer than 96 bytes.

---

## Current Authorization Gate And Future Execution Preconditions

Current authorization state is closed before Task 1:

| Path | Current exact disposition |
| --- | --- |
| Separate exact 11-file authority-bootstrap predecessor | The sole independently authorized exception; governed only by the approved Spec and excluded from Receipt scope/progress |
| Receipt Tasks 1-8, their source/tests/workflow, task commits, main implementation push/PR, and any RED/GREEN or acceptance claim | STOP with `full_sigstore_owner_topology_unapproved`; future dormant, with zero Receipt implementation writes |
| Dependency install/fetch, full npm/native closure, Foundation eligibility, and complete-plan validation | Independent offline npm closure authorization STOP; no online or synthetic substitute |
| Recovery workflow dispatch/publication | Unreachable behind the global STOP and still independently fail-closed by exact `github_full_sigstore_owner_unavailable`; no dispatch, Release/asset, attestation, completion, or production claim |

Receipt Task 1 may resume only after **all** of the following are separately approved, implemented on protected `master`, independently reviewed, and proven GREEN, followed by a new explicit Risk A authorization naming this Receipt plan: (1) one pinned mature unified full-Sigstore owner serving Foundation and Artifact with a private success brand and official positive/adversarial CT/SCT coverage; (2) publication, immutable readback, and that owner's full postverification of the sole Foundation v2 lock; and (3) publication, hash readback, and zero-network proof of the complete content-addressed offline npm cache/vendor closure. Approval or completion of any subset does not resume Receipt, and the exact 11-file exception cannot supply or absorb any of these providers.

Until that conjunctive resume Gate is recorded, do not create or modify any file listed under Task 1 or later; do not run their RED/GREEN or full npm commands; do not stage, commit, push, open/update a main implementation PR, claim a checkpoint, or hand off implementation. The workflow topology, current recovery owner-unavailable stop, exact job/step/value/token ordering, and literal `pollIndex < 6` contract below remain frozen review material and must not be implemented or weakened to bypass the Gate.

Only after that future resume authorization, prepare the clean implementation worktree from current `origin/master`, complete Foundation plus Host/DB Tasks 0-10 in the same branch, and run the following future precondition inventory. Do not run this block under the current STOP:

```powershell
git fetch origin
git rev-parse origin/master
git merge-base HEAD origin/master
git status --short --branch
Test-Path server/services/deployment/canonical-json.mjs
Test-Path server/services/deployment/durable-store.mjs
Test-Path server/services/deployment/database-contract.mjs
```

Future expected result after the resume Gate:

- the branch is the one main source-only Draft PR branch based on the observed current `origin/master`, after the separately merged narrow authority-bootstrap predecessor;
- the worktree contains only the already reviewed design/plan and prerequisite source commits;
- all three `Test-Path` commands return `True`; and
- no production workflow is running under the shared concurrency group.

If one of these three prerequisite files is absent or has a different export surface than the Interfaces below after the future resume Gate, reconcile Foundation or Host/DB Tasks 0-10 before writing compatibility code. Do not advance Bootstrap/Artifact work early and do not add a local substitute.

## File Map

**Create:**

- `server/services/deployment/control-plane-receipt-contract.mjs` — closed state algebra, host receipt/record/closeout and canonical terminal-bundle validation, state mapping, and safe validation errors.
- `server/services/deployment/control-plane-receipt-parser-registry.mjs` — exact schema/parser lookup and retained-record coverage checks.
- `server/services/deployment/control-plane-terminal-closeout-store.mjs` — Receipt-owned, transaction-bound, fixed-logical-object terminal/initial-closeout durable writer and reader.
- `server/services/deployment/control-plane-host-terminal-publisher.mjs` — Bootstrap-maintenance-gated deterministic terminal body/outer-record/initial-closeout/lease/index publication with crash-boundary replay.
- `server/services/deployment/control-plane-controller-closeout.mjs` — immutable controller payload, separate Actions artifact observation, and canonical controller final-status construction/validation.
- `server/services/deployment/control-plane-controller-closeout-adapter.mjs` — Receipt-owned granular adapter consumed by the Artifact-owned production controller; it owns validation of Bootstrap-returned terminal-bundle bytes, closeout validation, transition frames, runner-local evidence, and exact Actions artifact readback, but not the production controller, chunk reader, or transport.
- `server/services/deployment/control-plane-receipt-recovery.mjs` — recovery ID/input validation, attempt eligibility, artifact state classification, challenge/selector/bundle/final-status orchestration, and recovered/no-claim envelopes.
- `scripts/control-plane-controller-closeout.mjs` — real two-command stateless controller-closeout bytes build/validation entrypoint with a fixed operations factory and direct main; it is never a lifecycle or workflow authority surface.
- `scripts/control-plane-receipt-recovery-controller.mjs` — real workflow-only preflight plus one-process bounded authenticated read-only recovery entrypoint with fixed internal handler chain.
- Artifact Task 6 base's `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT`, plus Artifact Task 7 Step 6a extension's SHA export, zero-argument fixture, authority/prepare/postverify byte/hash triples, two rendered authority-step wrapper byte/hash pairs, and exact ordered 11-key fixture ABI — consumed byte-for-byte by the protected jobs. Receipt does not call Task 6's token/fetch live-refresh parser; current prepare/postverify are owner-unavailable hard stops and Receipt creates no repository publisher script.
- `.github/workflows/control-plane-receipt-recovery.yml` — manual preflight, independently approved protected recovery, artifact upload, and an isolated publisher job whose later publication action rows are currently unreachable.
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
- `server/tests/control-plane-receipt-recovery-workflow.test.mjs` — fixed future tag/name topology, fixed-inline owner hashes, no-checkout publisher isolation, and executable current hard-stop/zero-publication-effect tests; resumable-pair states remain separately approved and dormant.
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
- Artifact's controller CLI and Deploy Note consume only `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus(...)`, `inspectControllerFinalStatus(...)`, and `validateControllerFinalStatus(...)` from Task 3. The exact bytes retain the plan-bound main-source identity tuple independently from the possibly later deployed `sourceCommit`; Receipt does not resolve that identity live. Artifact Task 13 maps all five validated terminal result codes to at most one bounded Deploy Note comment: `validated_deployment` uses validated-success wording and includes `deployed_at: finalStatus.terminalPublishedAt`; `validated_stopped_pre_switch`, `validated_schema_only_change`, `validated_rolled_back`, and `validated_critical_failure` use their exact validated failure/outcome wording and omit `deployed_at`. `finalStatus.observedAt` is never a deployment timestamp. No-claim/nonterminal inputs make zero comment writes. Receipt returns only the already built canonical pending final-status wrapper to Artifact; Artifact Task 11's CLI alone owns `finalStatusSink.writeExact({ bytes, sha256 })`, GitHub outputs, and the success result. Before any of those effects, Artifact must in order close the transport, destroy/read back absent every OIDC value, close the raw/replay artifact stream, and require its existing private one-shot `runnerMaterialStore.lifecycle.finalizeAndReadBackAbsent()` to return literal `true`. Receipt never accepts a final-status path, lifecycle object/result, or write method and writes no file.
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
| Future dormant shared publisher observation (not current acceptance) | `none`, `asset_only`, `attestation_only`, `complete`, `conflict` |

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

> **Current authorization STOP for Task 1 and every later task:** everything from this heading through Task 8—including every proposed file, test, code block, RED/GREEN result, and commit—is future dormant design. Do not create, edit, run, stage, commit, push, hand off, or report any of it GREEN until the conjunctive owner + lock-postverification + offline-closure resume Gate above receives a new explicit Risk A authorization. The separate exact 11-file authority-bootstrap exception does not enter this task.

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
- Produces: strict schemas with `additionalProperties: false` at every object level and explicit ordered canonical contracts matching those schemas. `control-plane-receipt-contract.mjs` is the sole owner and exporter of `CONTROLLER_CLOSEOUT_BINDING_FIELDS` and `CONTROLLER_CLOSEOUT_V1_CONTRACT`; Task 3 imports those exact frozen values and never redeclares the binding tuple, payload field order, nested contract, arrays declaration, or validator.
- The controller-closeout schema fixes the four source-origin fields immediately after `sourceCommit` and before `deploymentPlanSha256`, in this exact order: `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, `mainSourceMergeCommitSha`. The digest is lowercase 64-hex, the PR number is a positive safe integer, both commit identities are lowercase 40-hex, and the schema does not require `sourceCommit === mainSourceMergeCommitSha`; terminal and no-claim closeouts require the same non-null tuple. It fixes `terminalPublishedAt` immediately after `transactionInvocationSha256`: every terminal branch requires the canonical exact value from the validated host receipt, while every no-claim branch requires literal `null`.
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
({
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
});
```

`transactionInvocationSha256` is the Host-recomputed domain-separated digest over the durable accepted-artifact record, accepted-plan record, authorization reservation, and artifact-capability identity; Receipt accepts it only through Host's owner evidence and never derives it from the five-field artifact acceptance acknowledgment. `artifactBindings.releaseTag` is the exact validated Deployment Plan artifact Release tag. `terminalEvidence.backupResult` is the exact aggregate-safe Host backup result string (1-256 characters, no control bytes); neither value is caller text reconstructed during controller closeout. `authoritativeLedgerResult` is exactly `not_applicable | absent_expected | exact_present`; `commitOrigin` is exactly `none | preexisting | this_transaction`. Every non-critical receipt requires `databaseTerminalVectorComplete: true` and both fixed-order entries. A critical receipt may use `false` and only the ordered safely classified subset returned unchanged by Host's imported `validateDatabaseTerminalVector(...)`; Receipt does not restate a second critical matrix, every included entry still uses an imported terminal result, and no fifth per-database label is introduced. `terminalEvidence` carries only the approved aggregate booleans, labels, counts, elapsed values, status codes, rollback result, publication-time finalizer state, cgroup/unit inactivity, guard/permit/lease facts, and cleanup readbacks. For a critical publication it records the active external finalizer, both exclusive leases held/read back, every runtime/transient database handle absent, and the unchanged durable critical fence; `finalizerInactive`/`leasesFree` are forbidden at this publication point and belong only to the later ordinary status. The receipt lease is exactly `controller_closeout_pending` plus `controllerCloseoutArtifactState: not_started`. The terminal body contains no self digest; the outer record binds the terminal-body digest, the initial closeout record binds the outer record, and the initial closeout lease binds the closeout record. Bootstrap's independently owned index registration binds the resulting four-object tuple without feeding any digest back into the terminal body, outer record, or lease.

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
- Produces: `validateHostTerminalReceiptBytes(bytes, bindings) -> frozen canonical receipt value`, `validateHostTerminalRecord(record, { receiptSha256, plan })`, and `validateHostCloseoutRecord(record, { receiptSha256, terminalRecordSha256, runId, runAttempt })`. Also produces `deriveUploadCommittedCloseoutRecordSha256({ controllerCloseoutBytes, observation })`, `mapHostFinalStateToControllerResult(hostFinalState)`, `mapControllerResultToHostFinalState(result)`, `isControllerTerminalResult(result)`, and `isControllerNoClaimResult(result)`. The digest helper canonical-validates the immutable initial record plus stable observation, applies only the fixed `upload_committed_observed` transition in memory, and returns the exact canonical Host-record digest without a path or mutation. These Task 2 exports are the only forward/reverse/result-subset authority and derive from Task 1 `CONTROLLER_RESULTS` plus imported Host `HOST_FINAL_STATES`; later modules never copy either map or a no-claim literal subset.
- Produces from `control-plane-receipt-contract.mjs` the sole canonical terminal-bundle owner surface consumed later by Bootstrap Task 9: `HOST_TERMINAL_BUNDLE_V1_CONTRACT`, `buildHostTerminalBundle({ transactionId, controllerRecoveryId, productionGateReceiptSha256, deploymentPlanSha256, terminalReceiptBytes, terminalRecordBytes, initialCloseoutRecordBytes, initialCloseoutLeaseBytes, closeoutIndexSha256 }) -> Object.freeze({ value, bytes, sha256 })`, and `validateHostTerminalBundleBytes(bytes, expected) -> Object.freeze({ value, bytes, sha256 })`. Bootstrap imports the builder after reading only the four fixed Receipt objects; it treats returned bytes as opaque and exposes only their digest/size through ordinary status.
- The bundle value has exactly ordered fields `schemaVersion`, `domain`, `transactionId`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `terminalReceiptBase64`, `terminalRecordBase64`, `initialCloseoutRecordBase64`, `initialCloseoutLeaseBase64`, `terminalReceiptSha256`, `terminalRecordSha256`, `closeoutRecordSha256`, `closeoutLeaseSha256`, and `closeoutIndexSha256`; it fixes `schemaVersion: "1"` and `domain: "host-terminal-bundle"`. The builder requires exactly its ten named input keys, strict typed/canonical bytes for all four objects, exact Gate/plan/transaction/recovery bindings, exact adjacent digests, and a lowercase index digest. It returns no path, object ID, selector, store handle, or raw database value.
- `validateHostTerminalBundleBytes(bytes, expected)` requires `expected` to have exactly `transactionId`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `terminalBundleSha256`, `terminalBundleSize`, `terminalReceiptSha256`, and `closeoutRecordSha256`. It canonical-parses no more than 262,144 bytes, byte-compares all expected bindings/digest/size, strictly decodes owned copies of the four Base64 fields, revalidates every typed object/adjacent edge/database terminal vector, and returns the canonical value plus owned aggregate bytes/digest. Neither Bootstrap nor Artifact defines another bundle contract/parser.
- Produces from `control-plane-terminal-closeout-store.mjs`: `TERMINAL_CLOSEOUT_LOGICAL_IDS` as exactly `{ terminalReceiptBody: "terminal-receipt.body", terminalOuterRecord: "terminal-record.outer", initialCloseoutRecord: "controller-closeout.record", initialCloseoutLease: "controller-closeout.lease" }` and `createTransactionBoundTerminalCloseoutStore({ transactionId, durableStore })`. The returned frozen object has exactly `publishTerminalReceiptBody(bytes)`, `publishTerminalOuterRecord(bytes)`, `publishInitialCloseoutRecord(bytes)`, `publishInitialCloseoutLease(bytes)`, `readTerminalReceiptBody({ expectedSha256 })`, `readTerminalOuterRecord({ expectedSha256 })`, `readInitialCloseoutRecord({ expectedSha256 })`, and `readInitialCloseoutLease({ expectedSha256 })`. Every publish unconditionally calls Foundation `publishImmutable` and then `readbackExact`; every independent read calls only `readbackExact` with its fixed logical ID and a required digest obtained from a validated adjacent record or validated Bootstrap index entry. No method accepts a transaction, logical ID, path, root, or reader.
- Produces: `HOST_TERMINAL_STORE_LOGICAL_IDS` as an alias of the four frozen Receipt-owned logical IDs and `HOST_TERMINAL_PUBLICATION_STAGES` as exactly `terminal_receipt_body`, `terminal_outer_record`, `initial_closeout_record`, `initial_closeout_lease`, `bounded_closeout_index`.
- Produces: `createHostTerminalPublisher({ terminalCloseoutStore, bootstrapCloseoutStore, bootstrapMaintenance, admissionReplayLedger, clock, faultInjector }).publishTerminal({ plan, finalState, terminalPublishedAt, databaseContracts, databaseResults, terminalEvidence })`.
- The publisher first calls only `bootstrapMaintenance.runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore: bootstrapCloseoutStore })`. Only after that branded, lock-protected Bootstrap operation returns does it write/read back the four Receipt objects through `terminalCloseoutStore`, then call only `bootstrapCloseoutStore.registerPendingLease(...)`. `faultInjector.after(stage)` exists only in injected tests and receives one value from `HOST_TERMINAL_PUBLICATION_STAGES`; Bootstrap owns compactor crash injection.
- `publishTerminal(...)` returns exactly `{ finalState, terminalPublishedAt, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, closeoutLeaseSha256, closeoutIndexSha256 }`; `terminalPublishedAt` is copied only from the just-built and canonical-validated terminal receipt value, never reconstructed from a later clock observation or caller projection. It returns no bytes, path, database value, or protected binding.
- Produces: `validatePublishedTerminalTuple({ terminalReceiptBytes, terminalRecordBytes, closeoutRecordBytes, closeoutLeaseBytes, registrationInput, registrationResult, bindings }) ->` the same frozen digest tuple. `registrationInput` is the exact six-field object passed to Bootstrap and `registrationResult` is exactly `{ indexSha256, indexEntrySha256 }` returned after Bootstrap's internal single CAS/readback; Receipt validates the transaction/object bindings and both digests but never parses or reconstructs index bytes. Host and Bootstrap finalizer import this validator instead of copying adjacent-object link checks.
- Produces test-only `runRegisterPendingLeaseConsumerContract({ createProvider })` and `runTerminalCloseoutMaintenanceConsumerContract({ createProvider })` in `server/tests/helpers/control-plane-receipt-fixtures.mjs`. Task 2 runs them against exact spy providers; Task 4 reruns the unchanged contracts against Bootstrap's real `createControllerCloseoutStore(...)` and `createBootstrapMaintenanceCoordinator(...)` instances.
- Returns: frozen validated values or one safe error with a closed code; it never returns raw offending bytes or a nested field value.

- [ ] **Step 1 (5 min): Add RED canonical/parser/binding and terminal-matrix tests**

Add table tests for BOM, invalid UTF-8, duplicate keys, trailing data, unknown schema ID, wrong parser digest, missing retained parser, receipt self-hash field, deployment-plan/Gate/inventory/run/attempt mismatch, nonterminal state, wrong closeout transition, invalid critical publication predicate, and every value rejected by Host's exact database-terminal-vector validator. Prove non-critical incomplete vectors reject; critical incomplete vectors pass only when the imported validator returns its ordered safely classified subset unchanged and the publication-time proof shows no runtime/transient handle, the unchanged critical fence, the external finalizer active, and both exclusive leases held/read back. Explicitly reject a critical terminal receipt that claims publication-time `finalizerInactive`, `leasesFree`, a third database descriptor, or a locally copied database-state label. Add disposition/deadline rows proving pending is pre-deadline only, acknowledged requires matching committed observation, attached requires deadline expiry and inactive finalizer, and overdue unattached never validates; these closeout-disposition rows do not retroactively change the publication-time receipt. For all five terminal states, assert the returned `terminalPublishedAt` is byte-equal to `receipt.value.terminalPublishedAt`; a caller-rebuilt return, a later clock value, or any mismatch fails before a controller-closeout input can be created.

Add terminal-bundle RED tests that build one exact four-object tuple, require byte-identical deterministic output, and pass its bytes back through `validateHostTerminalBundleBytes(...)`. Reject every missing/extra/reordered field, numeric schema version, noncanonical Base64, any individual Base64 field over exactly 49,152 characters even when the aggregate is otherwise bounded, a caller-supplied object digest, aggregate bytes over 262,144, wrong aggregate digest/size, wrong transaction/recovery/Gate/deployment-plan/receipt/initial-closeout binding, any inner digest/typed-edge/database-vector mismatch, and any path/logical-ID/store/reader-shaped key.

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
export function decodeCanonicalReceiptBase64(value, code, maxCharacters = 49_152) {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 4
      || maxCharacters > 262_144 || maxCharacters % 4 !== 0
      || typeof value !== "string" || value.length < 4 || value.length > maxCharacters
      || value.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    throw new Error(code);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new Error(code);
  }
  return decoded;
}

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

Both helper validators are closed internal functions implemented in this task, not extensibility hooks. They require the exact key sets and invoke the existing Receipt/record/closeout/lease/database validators; `validateDecodedTerminalBundleObjectTuple(...)` calls the single Receipt-owned `decodeCanonicalReceiptBase64(...)` above for every object before validating owned Buffers. Its default remains the frozen 49,152-character per-object bound. Task 3 imports that same function and may pass the already frozen 262,144-character controller-CLI stdin ceiling only for the aggregate closeout wire field; no later task defines a second decoder or a different Base64 grammar.

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
        terminalPublishedAt: receipt.value.terminalPublishedAt,
        terminalReceiptSha256,
        terminalRecordSha256,
        faultInjector,
      });
    },
  });
}
```

`terminalPublishedAt` is part of the durable terminal context supplied by normal/recovery/critical finalization; the publisher validates it and never calls `clock.now()` to replace it. After canonical construction, every downstream return copies only `receipt.value.terminalPublishedAt`. The builder derives `controllerCloseoutAckDeadline` as exactly 120 seconds later. The wrapper exposes no generic read/write method, root, path, transaction selector, caller logical ID, or reader. Independent finalizer reads use only the four typed read methods: receipt digest from the validated outer record or index entry, outer/lease digests from the validated index entry, and initial closeout-record digest from the validated lease or index entry.

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
    terminalPublishedAt: context.terminalPublishedAt,
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

Expected: valid fixtures, the sole terminal-bundle builder/validator, and all three producer paths pass against the exact structural registration fake; every malformed/cross-bound/nonterminal/dropped-parser/replay-conflict row fails safely; each injected crash resumes to one byte-identical four-object tuple plus one exact registration, the returned `terminalPublishedAt` remains the canonical receipt-owned publication time, and the returned `closeoutIndexSha256` equals the fake's validated readback. Bootstrap Task 9 later imports this exact builder, and Task 10 runs the unchanged registration consumer-contract fixture against its real store.

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
- Appends to the existing `control-plane-receipt-contract.mjs` owner and exports exactly once `CONTROLLER_CLOSEOUT_BINDING_FIELDS`, `CONTROLLER_CLOSEOUT_V1_CONTRACT`, and `validateEmbeddedControllerCloseoutTuple(...) -> frozen { receipt, terminalReceiptSha256, terminalRecordSha256, initialHostCloseoutRecordSha256, artifactReleaseTag, backupResult }`. That narrow helper consumes the already implemented Task 2 receipt/record/closeout contracts and validators, revalidates the canonical receipt, outer record, initial closeout record, both adjacent digest edges, and returns the tag/backup strings only from the canonical receipt fields. `control-plane-controller-closeout.mjs` imports those exact owner exports plus the already implemented Receipt-owned `decodeCanonicalReceiptBase64`, Task 2 `deriveUploadCommittedCloseoutRecordSha256`, `mapHostFinalStateToControllerResult`, `mapControllerResultToHostFinalState`, `isControllerTerminalResult`, and `isControllerNoClaimResult`, then compares the result/invocation/publication-time binding. Task 3 never imports or restates `HOST_TO_CONTROLLER_RESULT`, a no-claim result array, a closeout binding list, or a second Base64 codec.
- Consumes: canonical serialize/parse/hash helpers from the foundation.
- Imports Bootstrap's `validateTransportEnvelope`, `validateStatusResponseFrame`, and owner assertion `assertValidatedOrdinaryStatus(value)` but no Task 4 module. The same Task 3 closeout module owns a module-private `WeakMap`: `validateAndBrandCommittedFinalHostStatus({ transportResult, immutable, closeoutBindings, observation, terminal, ackStatus, expectedStatus, readbackAt }) -> frozen { status, responseSha256 }` validates the complete envelope, exact post-ACK ordinary status, deterministic committed closeout/observation/terminal bindings, current observation validity, and response-byte digest before branding. In particular it requires `status.controllerRecoveryId === immutable.value.controllerRecoveryId === closeoutBindings.controllerRecoveryId` before issuing the brand, then stores the exact controller-closeout, observation, and committed-record SHA-256 tuple privately against that two-field proof. `assertValidatedFinalHostStatus(value)` returns only that same reference; the final-status builder additionally requires the private tuple to match the exact closeout bytes and observation supplied to that build. `readbackAt` is an injected-clock validation value and is neither serialized nor branded. Task 3 tests obtain the real proof through this validator. A manually wrapped, copied, pre-ACK, upload-started, pending, wrong-recovery, wrong-observation, cross-closeout, or synthetic sixteen-field value is forbidden. Task 4's public `validateUploadCommittedObserved(...)` delegates unchanged to this owner validator with the exact `closeoutBindings` and `readbackAt: clock.now().toISOString()` and does not mint a second brand.
- Produces: `deriveControllerCloseoutArtifactName({ controllerRecoveryId, originalRunId, originalRunAttempt })`, `buildControllerCloseout(input) -> { value, bytes, sha256, artifactName, fileName }`, and `adoptControllerCloseoutImmutable({ bytes, closeoutBindings }) ->` the same privately branded five-field wrapper for later recovery. Both factories derive the sole artifact name from the canonical closeout value; neither accepts an artifact name. The wrapper is frozen, exact-keyed, backed by owned canonical bytes, and registered in one module-private `WeakSet`; a spread, clone, extra-key wrapper, value/bytes disagreement, mutable byte alias, caller name, or lookalike rejects. A terminal controller closeout carries the Receipt-validated `transactionInvocationSha256` and the exact Receipt-owned `terminalPublishedAt`; every no-claim closeout carries canonical `null` for both fields. Both branches carry the same non-null plan-derived `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, and `mainSourceMergeCommitSha` immediately after `sourceCommit`; the deployed `sourceCommit` is allowed to differ from the main source merge commit.
- Produces: `validateControllerCloseoutBytes(bytes, bindings) -> frozen value`. It exact-compares all four source-origin fields with `bindings`; on a terminal branch it strictly decodes and revalidates the embedded canonical terminal receipt and requires `value.terminalPublishedAt === embeddedTerminalReceipt.terminalPublishedAt`, while a no-claim branch requires both receipt bytes and time `null`. It rejects a missing, extra, reordered, malformed, cloned/rebuilt, or mismatched value and performs no live GitHub lookup or ancestry resolution.
- Produces for the Task 4 stateless bytes entrypoint only: `buildControllerCloseoutFromCanonicalWireBytes(requestBytes) -> owned Buffer` and `validateControllerCloseoutFromCanonicalWireBytes(requestBytes) -> owned Buffer`. The first consumes the exact ordered Task 3 build-input wire object, with only the three terminal `*Bytes` fields represented as strict canonical Base64, converts those fields to owned Buffers, invokes `buildControllerCloseout(...)`, and returns only its canonical closeout bytes. The second consumes exact canonical `{ controllerCloseoutBase64, closeoutBindings }`, invokes `validateControllerCloseoutBytes(...)`, and returns an owned copy of the same validated closeout bytes. Both use the existing canonical JSON and Receipt Base64 authorities, enforce byte-for-byte round trip and exact keys, and return no immutable wrapper, private brand, handle, status, observation, or continuation capability.
- Produces: `classifyControllerCloseout(input) -> one CONTROLLER_RESULTS value`. Its admission branch is reserved for a future owner-branded exact `{ preAdmissionDurableRejection: true, admissionAccepted: false }` input; Version 1 has no such producer, so the current Artifact controller never invokes it. Standalone `admissionAccepted: false`, any ordinary-status `durableRejection`, and every admitted-transaction observation reject that branch.
- Produces fixed `CONTROL_PLANE_REPOSITORY = "gccwebos-com/proxy-gateway-minimal"`, `buildActionsArtifactObservation({ repository, runId, runAttempt, artifactId, artifactName, apiDigest, payloadSha256, size, createdAt, expiresAt, readbackAt }) -> { value, bytes, sha256 }`, `validateActionsArtifactObservation(value, expected)`, the narrow complete-wrapper authority `validateActionsArtifactObservationWrapper(wrapper, expected)`, and the controller-specific owner validator `validateControllerCloseoutArtifactObservationWrapper({ immutable, closeoutBindings, observation, readbackAt })`. The generic wrapper validator requires owner-derived `expected.repository` and `expected.artifactName` alongside the exact run/attempt/payload/freshness bindings; it never supplies a default or accepts either observed field as its own expectation. The controller-specific validator fixes repository authority to `CONTROL_PLANE_REPOSITORY`, first validates the exact branded immutable closeout, derives `expectedArtifactName = deriveControllerCloseoutArtifactName(...)` only from the canonical closeout value validated against `closeoutBindings`, and then requires `immutable.artifactName`, `immutable.value.artifactPolicy.artifactName`, `observation.value.artifactName`, and `expectedArtifactName` to be byte-equal before returning the privately branded same-reference observation. No controller caller can report or override an expected repository or name. Both validators require exact ordered keys `{ value, bytes, sha256 }`, an owned `Buffer`, exact canonical serialization equality between `value` and `bytes`, `sha256Hex(bytes) === sha256`, and all value/freshness bindings; a spread, clone, lookalike, unknown key, correct value paired with forged bytes/digest, or aliased mutable bytes rejects. `readbackAt` is mandatory whenever freshness is validated and must come from the caller's injected trusted clock. It is checked but excluded from the closed canonical `value`, `bytes`, and `sha256`; this stable observation is ACK/recovery evidence and is never inserted into or used to rewrite `controller_closeout` bytes. Publisher predicates may consume only the digest from this owner-validated complete wrapper, never a caller's `sha256` field after value-only validation.
- Produces from the same module and nowhere else: `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus({ controllerCloseoutBytes, closeoutBindings, actionsArtifactObservation, validatedFinalHostStatus, artifactReleaseTag, backupResult, observedAt }) -> { value, bytes, sha256 }`, `inspectControllerFinalStatus(bytes, expectedRun) -> frozen value`, and `validateControllerFinalStatus(bytes, expected) -> frozen value`. Receipt owns the field order, branch algebra, canonical bytes, build, and validation. `inspectControllerFinalStatus` accepts only exact `{ runId, runAttempt }`, validates canonical bytes and the complete terminal/no-claim branch algebra, and grants no source identity or Deploy Note authority; it exists only so the isolated writer can return a no-claim no-op before any GitHub read. `validateControllerFinalStatus` additionally requires the four exact source-origin fields. Artifact/Integration may import these exports but may not construct, normalize, extend, or reinterpret final-status values; Artifact alone owns the fixed `finalStatusSink.writeExact({ bytes, sha256 })` side effect and writes the returned wrapper unchanged. Neither function accepts a GitHub token, fetch function, PR response, comparison response, main-source resolver, or resolver brand.
- The final-status value has exactly these ordered fields: `schemaVersion`, `domain`, `resultKind`, `runId`, `runAttempt`, `controllerRecoveryId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `inventoryReceiptSha256`, `sourceCommit`, `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, `mainSourceMergeCommitSha`, `target`, `releaseUnit`, `resultCode`, `terminal`, `validationState`, `hostFinalState`, `terminalReceiptSha256`, `transactionInvocationSha256`, `terminalPublishedAt`, `controllerCloseoutSha256`, `actionsArtifactObservationSha256`, `finalHostStatusSha256`, `artifactReleaseTag`, `backupResult`, `runnerCleanupVerified`, and `observedAt`.
- The `terminal` branch requires one of the five validated controller results, the exact reverse-mapped host final state, `terminal: true`, `validationState: "validated"`, all four terminal/closeout/status digests, the lowercase `transactionInvocationSha256` and canonical `terminalPublishedAt` returned by Receipt terminal validation, a validated Actions observation, `runnerCleanupVerified: true`, and aggregate `artifactReleaseTag`/`backupResult` copied from already validated plan/terminal evidence. Despite the preserved prerequisite ABI name, this boolean proves only Receipt-owned closeout staging/local material absence; it is not an Artifact lifecycle or secret-cleanup claim. `validatedFinalHostStatus` is exactly `{ status, responseSha256 }`: `status` is the unchanged Bootstrap-private ordinary-status reference and must pass `assertValidatedOrdinaryStatus`; `responseSha256` hashes the exact response bytes that produced it. For the critical row, Bootstrap can issue that brand only after it has accepted Host's unchanged `assertCriticalPostPublicationProof` capability; for non-critical rows it enforces the owner state matrix without that capability. Missing the publication-time terminal bundle or this state-appropriate later observation rejects. No Host proof field is serialized. The `no_claim` branch requires one of the three no-production-claim results, `terminal: false`, `validationState: "no_claim"`, `hostFinalState: null`, `terminalReceiptSha256: null`, `transactionInvocationSha256: null`, `terminalPublishedAt: null`, `actionsArtifactObservationSha256: null`, `finalHostStatusSha256: null`, `artifactReleaseTag: null`, `backupResult: null`, one exact `controllerCloseoutSha256` derived from non-null no-claim closeout bytes, and never becomes Deploy Note eligible. Both branches retain byte-equal non-null values for all four source-origin fields; their presence does not change branch eligibility.
- `buildControllerFinalStatus` first adopts and validates immutable `controllerCloseoutBytes`, derives `resultKind`, `resultCode`, binding fields including the four source-origin fields, owner `terminalPublishedAt`, and `controllerCloseoutSha256` from those exact bytes, then validates any Actions observation and the exact owner-branded `validatedFinalHostStatus` wrapper without spreading/rebranding its `status`. It accepts no caller-supplied result, publication time, or source-origin override. `observedAt` remains only the later controller observation/freshness time and can never replace `terminalPublishedAt`. `inspectControllerFinalStatus` canonical-parses and validates the complete branch plus exact run binding but deliberately does not certify the four source-origin fields; a terminal caller must subsequently invoke `validateControllerFinalStatus` after obtaining its independent owner identity. `validateControllerFinalStatus` repeats canonical/branch/run validation and exact-compares the resulting serialized contract with the four expected source-origin fields for byte-preserving Artifact/Deploy-Note consumption. Neither function is a substitute Host-proof or GitHub main-source-identity acquisition API and neither can authorize construction of terminal bytes. Neither builder nor schema accepts a path, raw SSH/HTTP response, stdout/stderr, diagnostic text, URL, environment value, token, key, known-hosts bytes, PID, database row, arbitrary evidence object, or live resolver output.
- Produces test-only `makeControllerFinalStatusFixture(...)` in `server/tests/helpers/control-plane-receipt-fixtures.mjs`. Artifact's real controller-output test writes `buildControllerFinalStatus(...).bytes`; its Deploy Note fixture must pass those unchanged bytes to `validateControllerFinalStatus(...)`, proving controller output -> downloaded final-status artifact -> Deploy Note with no reconstruction.

- [ ] **Step 1 (5 min): Add RED mapping, immutability, metadata, and ordering tests**

Test all five host-final-state mappings and all three no-production-claim controller states. Prove that a live controller may emit `controller_incomplete_no_production_claim`, but runner loss alone produces no synthetic closeout.

Add the immutability assertion:

```js
const built = buildControllerCloseout(validControllerInput());
const before = Buffer.from(built.bytes);
const observationAtT1 = buildActionsArtifactObservation(validArtifactObservationInput({
  readbackAt: "2026-08-08T00:00:00.000Z",
}));
const observationAtT2 = buildActionsArtifactObservation(validArtifactObservationInput({
  readbackAt: "2026-08-08T00:00:01.000Z",
}));

assert.equal(built.value.controllerCloseoutArtifactState, "not_started");
assert.equal(built.value.terminalPublishedAt, terminalPublishedAt);
assert.equal(
  built.artifactName,
  `control-plane-controller-closeout-${controllerRecoveryId}-${originalRunId}-${originalRunAttempt}`,
);
assert.equal(built.fileName, `controller-closeout-${built.sha256}.json`);
assert.equal(observationAtT1.value.apiDigest, `sha256:${"a".repeat(64)}`);
assert.equal(observationAtT1.value.payloadSha256, built.sha256);
assert.equal("readbackAt" in observationAtT1.value, false);
assert.deepEqual(observationAtT2.bytes, observationAtT1.bytes);
assert.equal(observationAtT2.sha256, observationAtT1.sha256);
assert.deepEqual(built.bytes, before);
assert.equal(typeof built.value.terminalReceiptBase64, "string");
assert.equal("artifactId" in built.value, false);
assert.equal("expiresAt" in built.value, false);
```

Fix the valid recovery-ID fixture as `const controllerRecoveryId = "cr1." + "a".repeat(64);` and add a second syntactically valid but wrong ID `"cr1." + "b".repeat(64)`. `validControllerInput()` emits the one exact `CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS` order. Its five discriminants are always explicit: terminal is `false,true,true,true,<host-final-state>`; admission rejection is `true,false,null,null,null`; receipt invalid is `false,true,false,null,null`; controller incomplete is `false,true,true,false,null`. The seven terminal evidence inputs are three lowercase digests, one canonical timestamp, and three Buffers only for the terminal row, and literal `null` together for every no-claim row. Starting from one real `built` wrapper, reject: `closeoutBindings.controllerRecoveryId` changed only to the wrong valid ID; a wrapper whose `immutable.value.controllerRecoveryId` and `immutable.artifactName` are consistently renamed to that wrong ID but whose canonical bytes remain original; the original canonical value paired with an artifact name derived from the wrong ID; an observation whose only drift is the wrong valid deterministic name; an observation whose only drift is repository away from exact `gccwebos-com/proxy-gateway-minimal`; a spread/frozen clone of either wrapper; and an extra key on either wrapper. Every row must produce zero committed-status brands, ACK requests, final-status bytes, and `present_exact` recovery classifications. The positive row requires all of `built.artifactName`, `built.value.artifactPolicy.artifactName`, `observation.value.artifactName`, and the owner-derived expected name to equal `control-plane-controller-closeout-${controllerRecoveryId}-${originalRunId}-${originalRunAttempt}`, while `observation.value.repository` equals the fixed repository. No test passes an `expected.repository` or `expected.artifactName` literal into the controller-specific validator.

Add a post-ACK owner-brand regression in which the genuine immutable wrapper, closeout bindings, observation, terminal reference, and every other ordinary-status field remain unchanged, but the syntactically valid `status.controllerRecoveryId` is replaced with `"cr1." + "b".repeat(64)`. It must fail before `validatedFinalHostStatusBindings.set(...)`; `assertValidatedFinalHostStatus`, final-status byte construction, and the Artifact-owned final-status sink must remain unreachable. The positive row proves the unchanged ordinary status ID byte-equals both `immutable.value.controllerRecoveryId` and `closeoutBindings.controllerRecoveryId`.

Add tests rejecting `expiresAt - createdAt < 35 days`, `readbackAt < createdAt`, `readbackAt === expiresAt`, later expired readbacks, invalid/non-canonical timestamps, uppercase/bare API digests, mismatched payload SHA, wrong repository/run/attempt/name, and an observation serialized into the immutable payload. Assert the exact observation wrapper keys are `value,bytes,sha256`; reject an aliased/non-Buffer byte field, non-canonical bytes, digest mismatch, unknown wrapper field, or a value/bytes disagreement before final-status serialization. Assert the exact observation field order omits `readbackAt`; two distinct pre-expiry `readbackAt` values over identical stable metadata must produce byte-identical `value`/`bytes`/`sha256`, while changing any stable field must change the identity and fail the expected binding. Recursively assert `additionalProperties: false` for `control-plane-controller-final-status-v1.schema.json`; cover every value of imported Host `HOST_FINAL_STATES` and all three no-claim results, every illegal cross-branch null/non-null combination, missing/mismatched `transactionInvocationSha256`, missing/mismatched/noncanonical `terminalPublishedAt`, a caller result/publication-time override, and every prohibited path/raw-output/secret-shaped key. Each of the five terminal rows must exact-copy `terminalPublishedAt` from the validated terminal receipt through the owner terminal result, controller closeout, and final status; all three no-claim rows require canonical `null`. A rebuilt/cloned terminal result, closeout wrapper, or final-status lookalike, or substituting `observedAt` for the publication time, rejects before final-status bytes or Deploy Note eligibility exist. Fix a fixture where `sourceCommit` is a reconciliation descendant and therefore differs from `mainSourceMergeCommitSha`; require both terminal and every no-claim closeout/final status to preserve exact `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, and `mainSourceMergeCommitSha` bytes. Reject a missing, extra, reordered, uppercase, malformed, or mismatched source-origin field in the closeout schema, `closeoutBindings`, final-status schema, and `expected`; reject any caller attempt to replace those four values or inject a GitHub resolver/fetch result. Prove only `{ preAdmissionDurableRejection: true, admissionAccepted: false }` maps to `admission_rejected_no_transaction`; either field alone, a post-admission durable rejection, or `terminal_quiescence_rejected` with its transaction binding rejects that mapping. The transaction-bound transitional rejection remains inside the fixed bounded ordinary-status poll: a later real Host-proof-backed immutable critical terminal plus its exact validated bundle maps to `validated_critical_failure`, while deadline exhaustion maps to `controller_incomplete_no_production_claim`. Only an actual immutable terminal bundle that reaches Receipt validation and fails may map through `receiptValid: false` to `receipt_invalid_no_production_claim`; the transitional response itself never occupies that result. Build each terminal fixture from the real Bootstrap status validator, preserve exact `{ status, responseSha256 }`, and prove `assertValidatedOrdinaryStatus(status)` returns the same reference. A copied, spread, serialized, recovered-status-branded, closeout-ACK, or structurally identical frozen status must reject before final-status bytes exist. Mint one real committed proof for closeout/observation pair A, then prove the final-status builder rejects that same branded two-field object with pair B even when `hostFinalState` and `terminalReceiptSha256` match; independently mutate the closeout bytes, observation SHA-256, deterministic committed-record SHA-256, derived artifact name, canonical recovery ID, and owner publication time. The critical fixture uses Bootstrap's Host-proof-backed ordinary-status harness; publication-time held-lock evidence alone cannot satisfy it, and the returned status/payload contains no proof fields. Every no-claim artifact/name is bound only to the exact run attempt, performs zero host mutation, creates no fixed tag/Release/attestation/Deploy Note, and reserves no identity or name that could block a later validated terminal claim.

Add the real consumer fixture contract:

```js
const controllerOutput = buildControllerFinalStatus(makeControllerFinalStatusFixture()).bytes;
const downloadedFinalStatusArtifact = Buffer.from(controllerOutput);
const inspected = inspectControllerFinalStatus(downloadedFinalStatusArtifact, expectedRunBindings());
const noteInput = validateControllerFinalStatus(downloadedFinalStatusArtifact, expectedFinalStatusBindings());
assert.equal(inspected.resultKind, "terminal");
assert.equal(noteInput.resultCode, "validated_deployment");
assert.equal(noteInput.terminalPublishedAt, terminalPublishedAt);
assert.notEqual(noteInput.terminalPublishedAt, noteInput.observedAt);
assert.deepEqual(Object.keys(noteInput), CONTROLLER_FINAL_STATUS_CONTRACT.fieldOrder);
assert.notEqual(noteInput.sourceCommit, noteInput.mainSourceMergeCommitSha);
assert.equal(noteInput.mainSourceIdentitySha256, mainSourceIdentitySha256);
assert.equal(noteInput.mainSourcePrNumber, mainSourcePrNumber);
assert.equal(noteInput.mainSourceHeadSha, mainSourceHeadSha);
assert.equal(noteInput.mainSourceMergeCommitSha, mainSourceMergeCommitSha);
assert.deepEqual(downloadedFinalStatusArtifact, controllerOutput);
```

Lock the three executable canonical contracts and every validation boundary before implementation. The test imports `CONTROLLER_CLOSEOUT_BINDING_FIELDS` and `CONTROLLER_CLOSEOUT_V1_CONTRACT` only from `control-plane-receipt-contract.mjs`; it imports the observation/final-status contracts, the two wire-byte owner functions, and all three validators only from `control-plane-controller-closeout.mjs`:

```js
const CONTRACT_KEYS = Object.freeze([
  "schemaId", "maxBytes", "fieldOrder", "nested", "arrays", "validate",
]);

test("Task 3 canonical contracts have one executable owner and exact field order", () => {
  for (const contract of [
    CONTROLLER_CLOSEOUT_V1_CONTRACT,
    ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT,
    CONTROLLER_FINAL_STATUS_CONTRACT,
  ]) {
    assert.deepEqual(Object.keys(contract), CONTRACT_KEYS);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.fieldOrder), true);
    assert.equal(Object.isFrozen(contract.nested), true);
    assert.equal(Object.isFrozen(contract.arrays), true);
    assert.equal(typeof contract.validate, "function");
  }
  assert.deepEqual(
    Object.keys(CONTROLLER_CLOSEOUT_V1_CONTRACT.nested),
    ["artifactPolicy"],
  );
  assert.deepEqual(
    Object.keys(CONTROLLER_CLOSEOUT_V1_CONTRACT.nested.artifactPolicy),
    CONTRACT_KEYS,
  );
  assert.equal(Object.isFrozen(CONTROLLER_CLOSEOUT_V1_CONTRACT.nested.artifactPolicy), true);
  assert.deepEqual(
    CONTROLLER_CLOSEOUT_V1_CONTRACT.nested.artifactPolicy.fieldOrder,
    ["retentionDays", "artifactName"],
  );
  assert.deepEqual(CONTROLLER_CLOSEOUT_V1_CONTRACT.arrays, {});
  assert.deepEqual(ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT.nested, {});
  assert.deepEqual(ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT.arrays, {});
  assert.deepEqual(CONTROLLER_FINAL_STATUS_CONTRACT.nested, {});
  assert.deepEqual(CONTROLLER_FINAL_STATUS_CONTRACT.arrays, {});
  assert.deepEqual(
    Object.keys(buildControllerCloseout(validControllerInput()).value),
    CONTROLLER_CLOSEOUT_V1_CONTRACT.fieldOrder,
  );
  assert.deepEqual(
    Object.keys(buildActionsArtifactObservation(validArtifactObservationInput()).value),
    ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT.fieldOrder,
  );
  assert.deepEqual(Object.keys(noteInput), CONTROLLER_FINAL_STATUS_CONTRACT.fieldOrder);
  const expectedBuildInputFields = [
    "preAdmissionDurableRejection",
    "admissionAccepted",
    "receiptValid",
    "controllerComplete",
    "hostFinalState",
    ...CONTROLLER_CLOSEOUT_BINDING_FIELDS,
    "terminalReceiptSha256",
    "terminalRecordSha256",
    "transactionInvocationSha256",
    "terminalPublishedAt",
    "terminalReceiptBytes",
    "terminalRecordBytes",
    "initialHostCloseoutRecordBytes",
    "runnerCleanupVerified",
  ];
  const noClaimInput = validControllerInput({
    controllerComplete: false,
    hostFinalState: null,
    terminalReceiptSha256: null,
    terminalRecordSha256: null,
    transactionInvocationSha256: null,
    terminalPublishedAt: null,
    terminalReceiptBytes: null,
    terminalRecordBytes: null,
    initialHostCloseoutRecordBytes: null,
  });
  assert.deepEqual(Object.keys(validControllerInput()), expectedBuildInputFields);
  assert.deepEqual(Object.keys(noClaimInput), expectedBuildInputFields);
});

function reorderFirstTwoCanonicalFields(value) {
  const entries = Object.entries(value);
  return Buffer.from(JSON.stringify(Object.fromEntries([
    entries[1], entries[0], ...entries.slice(2),
  ])), "utf8");
}

test("Task 3 parsers reject reordered, extra, and malformed bytes", () => {
  const immutable = buildControllerCloseout(validControllerInput());
  const observation = buildActionsArtifactObservation(validArtifactObservationInput());
  const finalStatus = buildControllerFinalStatus(makeControllerFinalStatusFixture());
  for (const [wrapper, contract, validate] of [
    [immutable, CONTROLLER_CLOSEOUT_V1_CONTRACT,
      (bytes) => validateControllerCloseoutBytes(bytes, validCloseoutBindings())],
    [observation, ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT,
      (bytes) => parseCanonicalJsonBytes(bytes, ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT)],
    [finalStatus, CONTROLLER_FINAL_STATUS_CONTRACT,
      (bytes) => inspectControllerFinalStatus(bytes, expectedRunBindings())],
  ]) {
    assert.throws(() => validate(reorderFirstTwoCanonicalFields(wrapper.value)), /canonical_json_/);
    const extra = Buffer.from(JSON.stringify({ ...wrapper.value, extra: true }), "utf8");
    assert.throws(() => validate(extra), /canonical_json_/);
    assert.throws(() => validate(Buffer.from('{"schemaVersion":', "utf8")), /canonical_json_/);
    assert.throws(
      () => serializeCanonicalJsonBytes({ ...wrapper.value, extra: true }, contract),
      /canonical_json_/,
    );
  }
  const reversedPolicy = Object.freeze({
    artifactName: immutable.value.artifactPolicy.artifactName,
    retentionDays: immutable.value.artifactPolicy.retentionDays,
  });
  const nestedReordered = Buffer.from(JSON.stringify(Object.freeze({
    ...immutable.value,
    artifactPolicy: reversedPolicy,
  })), "utf8");
  const nestedExtra = Buffer.from(JSON.stringify(Object.freeze({
    ...immutable.value,
    artifactPolicy: Object.freeze({
      ...immutable.value.artifactPolicy,
      callerExpectedName: immutable.artifactName,
    }),
  })), "utf8");
  assert.throws(
    () => validateControllerCloseoutBytes(nestedReordered, validCloseoutBindings()),
    /canonical_json_/,
  );
  assert.throws(
    () => validateControllerCloseoutBytes(nestedExtra, validCloseoutBindings()),
    /canonical_json_/,
  );
  const bindings = validCloseoutBindings();
  const bindingEntries = Object.entries(bindings);
  for (const invalidBindings of [
    Object.fromEntries([bindingEntries[1], bindingEntries[0], ...bindingEntries.slice(2)]),
    { ...bindings, callerArtifactName: immutable.artifactName },
    { ...bindings, controllerRecoveryId: `cr1.${"b".repeat(64)}` },
  ]) {
    assert.throws(
      () => validateControllerCloseoutBytes(immutable.bytes, invalidBindings),
      /controller_closeout_/,
    );
  }
});

const CONTROLLER_CLOSEOUT_TEST_WIRE_BYTE_FIELDS = Object.freeze([
  "terminalReceiptBytes",
  "terminalRecordBytes",
  "initialHostCloseoutRecordBytes",
]);

function canonicalControllerCloseoutBuildWireBytes(input) {
  assert.deepEqual(Object.keys(input), [
    "preAdmissionDurableRejection",
    "admissionAccepted",
    "receiptValid",
    "controllerComplete",
    "hostFinalState",
    ...CONTROLLER_CLOSEOUT_BINDING_FIELDS,
    "terminalReceiptSha256",
    "terminalRecordSha256",
    "transactionInvocationSha256",
    "terminalPublishedAt",
    "terminalReceiptBytes",
    "terminalRecordBytes",
    "initialHostCloseoutRecordBytes",
    "runnerCleanupVerified",
  ]);
  const wire = Object.fromEntries(Object.entries(input).map(([field, value]) => [
    field,
    CONTROLLER_CLOSEOUT_TEST_WIRE_BYTE_FIELDS.includes(field) && value !== null
      ? Buffer.from(value).toString("base64")
      : value,
  ]));
  return Buffer.from(JSON.stringify(wire), "utf8");
}

function canonicalControllerCloseoutValidateWireBytes(closeoutBytes, closeoutBindings) {
  return Buffer.from(JSON.stringify({
    controllerCloseoutBase64: Buffer.from(closeoutBytes).toString("base64"),
    closeoutBindings,
  }), "utf8");
}

function noClaimControllerInput(branch) {
  return validControllerInput({
    ...branch,
    hostFinalState: null,
    terminalReceiptSha256: null,
    terminalRecordSha256: null,
    transactionInvocationSha256: null,
    terminalPublishedAt: null,
    terminalReceiptBytes: null,
    terminalRecordBytes: null,
    initialHostCloseoutRecordBytes: null,
  });
}

test("Task 3 wire owners execute terminal and all no-claim rows without exporting a brand", () => {
  assert.equal(typeof buildControllerCloseoutFromCanonicalWireBytes, "function");
  assert.equal(typeof validateControllerCloseoutFromCanonicalWireBytes, "function");
  assert.equal(buildControllerCloseoutFromCanonicalWireBytes.length, 1);
  assert.equal(validateControllerCloseoutFromCanonicalWireBytes.length, 1);
  const rows = [
    validControllerInput(),
    noClaimControllerInput({
      preAdmissionDurableRejection: true,
      admissionAccepted: false,
      receiptValid: null,
      controllerComplete: null,
    }),
    noClaimControllerInput({
      preAdmissionDurableRejection: false,
      admissionAccepted: true,
      receiptValid: false,
      controllerComplete: null,
    }),
    noClaimControllerInput({
      preAdmissionDurableRejection: false,
      admissionAccepted: true,
      receiptValid: true,
      controllerComplete: false,
    }),
  ];
  for (const input of rows) {
    const direct = buildControllerCloseout(input);
    const requestBytes = canonicalControllerCloseoutBuildWireBytes(input);
    const first = buildControllerCloseoutFromCanonicalWireBytes(requestBytes);
    const second = buildControllerCloseoutFromCanonicalWireBytes(requestBytes);
    assert.equal(Buffer.isBuffer(first), true);
    assert.deepEqual(first, direct.bytes);
    assert.notEqual(first, second);
    first[0] ^= 1;
    assert.deepEqual(second, direct.bytes);
    const validated = validateControllerCloseoutFromCanonicalWireBytes(
      canonicalControllerCloseoutValidateWireBytes(second, validCloseoutBindings()),
    );
    assert.equal(Buffer.isBuffer(validated), true);
    assert.deepEqual(validated, second);
    assert.notEqual(validated, second);
    assert.deepEqual(Object.keys(direct), ["value", "bytes", "sha256", "artifactName", "fileName"]);
    assert.equal(Object.hasOwn(validated, "value"), false);
  }
});

test("Task 3 wire owners reject structural, Base64, and binding drift before byte release", () => {
  const input = validControllerInput();
  const validBuildWire = canonicalControllerCloseoutBuildWireBytes(input);
  const validBuildObject = JSON.parse(validBuildWire.toString("utf8"));
  const built = buildControllerCloseoutFromCanonicalWireBytes(validBuildWire);
  const validValidateObject = {
    controllerCloseoutBase64: built.toString("base64"),
    closeoutBindings: validCloseoutBindings(),
  };
  const buildEntries = Object.entries(validBuildObject);
  const bindingEntries = Object.entries(validValidateObject.closeoutBindings);
  for (const invalidBytes of [
    reorderFirstTwoCanonicalFields(validBuildObject),
    Buffer.from(JSON.stringify({ ...validBuildObject, extra: true }), "utf8"),
    Buffer.from(JSON.stringify(Object.fromEntries([
      ...buildEntries.slice(0, -4),
      ["terminalReceiptBytes", `${validBuildObject.terminalReceiptBytes}= `],
      ...buildEntries.slice(-3),
    ])), "utf8"),
    Buffer.from(JSON.stringify({
      ...validBuildObject,
      terminalReceiptBytes: "A".repeat(49_156),
    }), "utf8"),
    Buffer.from(validBuildWire.toString("utf8").replace(
      '"preAdmissionDurableRejection":false',
      '"preAdmissionDurableRejection":false,"preAdmissionDurableRejection":false',
    ), "utf8"),
  ]) {
    assert.throws(
      () => buildControllerCloseoutFromCanonicalWireBytes(invalidBytes),
      /canonical_json_|controller_closeout_build_wire_/,
    );
  }
  for (const invalidObject of [
    Object.fromEntries([
      ["closeoutBindings", validValidateObject.closeoutBindings],
      ["controllerCloseoutBase64", validValidateObject.controllerCloseoutBase64],
    ]),
    { ...validValidateObject, lifecycle: "upload-start" },
    {
      ...validValidateObject,
      controllerCloseoutBase64: `${validValidateObject.controllerCloseoutBase64}=`,
    },
    {
      ...validValidateObject,
      controllerCloseoutBase64: Buffer.from("{}", "utf8").toString("base64"),
    },
    {
      ...validValidateObject,
      controllerCloseoutBase64: "A".repeat(262_148),
    },
    {
      ...validValidateObject,
      closeoutBindings: Object.fromEntries([
        bindingEntries[1], bindingEntries[0], ...bindingEntries.slice(2),
      ]),
    },
    {
      ...validValidateObject,
      closeoutBindings: {
        ...validValidateObject.closeoutBindings,
        controllerRecoveryId: `cr1.${"b".repeat(64)}`,
      },
    },
  ]) {
    assert.throws(
      () => validateControllerCloseoutFromCanonicalWireBytes(
        Buffer.from(JSON.stringify(invalidObject), "utf8"),
      ),
      /canonical_json_|controller_closeout_/,
    );
  }
  const duplicateValidateWire = canonicalControllerCloseoutValidateWireBytes(
    built,
    validCloseoutBindings(),
  ).toString("utf8").replace(
    '"controllerCloseoutBase64":',
    '"controllerCloseoutBase64":"e30=","controllerCloseoutBase64":',
  );
  assert.throws(
    () => validateControllerCloseoutFromCanonicalWireBytes(
      Buffer.from(duplicateValidateWire, "utf8"),
    ),
    /canonical_json_|controller_closeout_/,
  );
});

test("controller closeout build gate rejects result/evidence cross-branches before branding", () => {
  assert.throws(
    () => buildControllerCloseout(validControllerInput({
      terminalReceiptSha256: null,
      terminalRecordSha256: null,
      transactionInvocationSha256: null,
      terminalPublishedAt: null,
      terminalReceiptBytes: null,
      terminalRecordBytes: null,
      initialHostCloseoutRecordBytes: null,
    })),
    /controller_closeout_terminal_build_evidence_invalid/,
  );
  assert.throws(
    () => buildControllerCloseout(validControllerInput({ controllerComplete: false })),
    /controller_closeout_build_branch_invalid/,
  );
});

test("controller artifact selector rejects wrong repository, wrong name, and wrapper clones", () => {
  const immutable = buildControllerCloseout(validControllerInput());
  const closeoutBindings = validCloseoutBindings();
  const observationInput = validArtifactObservationInput();
  const observation = buildActionsArtifactObservation(observationInput);
  const validInput = Object.freeze({
    immutable,
    closeoutBindings,
    observation,
    readbackAt: observationInput.readbackAt,
  });
  assert.equal(
    validateControllerCloseoutArtifactObservationWrapper(validInput),
    observation,
  );
  const wrongRepository = buildActionsArtifactObservation(validArtifactObservationInput({
    repository: "gccwebos-com/proxy-gateway-minimal-fork",
  }));
  const wrongName = buildActionsArtifactObservation(validArtifactObservationInput({
    artifactName: `${immutable.artifactName}-wrong`,
  }));
  for (const invalidInput of [
    Object.freeze({ ...validInput, observation: wrongRepository }),
    Object.freeze({ ...validInput, observation: wrongName }),
    Object.freeze({ ...validInput, immutable: Object.freeze({ ...immutable }) }),
    Object.freeze({ ...validInput, observation: Object.freeze({ ...observation }) }),
    Object.freeze({
      ...validInput,
      observation: Object.freeze({ ...observation, callerExpectedName: immutable.artifactName }),
    }),
  ]) {
    assert.throws(
      () => validateControllerCloseoutArtifactObservationWrapper(invalidInput),
      /controller_closeout_|actions_artifact_observation_/,
    );
  }
});

test("canonical contracts reject primitive coercion without invoking caller code", () => {
  let coercions = 0;
  const coercing = Object.freeze({
    toString() {
      coercions += 1;
      return "1";
    },
  });
  const closeout = buildControllerCloseout(validControllerInput()).value;
  const observation = buildActionsArtifactObservation(validArtifactObservationInput()).value;
  const finalStatus = buildControllerFinalStatus(makeControllerFinalStatusFixture()).value;
  for (const [value, contract, field] of [
    [closeout, CONTROLLER_CLOSEOUT_V1_CONTRACT, "originalRunId"],
    [observation, ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT, "runId"],
    [finalStatus, CONTROLLER_FINAL_STATUS_CONTRACT, "runId"],
  ]) {
    for (const invalid of [1, ["1"], coercing]) {
      assert.throws(
        () => serializeCanonicalJsonBytes({ ...value, [field]: invalid }, contract),
        /canonical_json_|controller_|actions_artifact_/,
      );
    }
  }
  assert.equal(coercions, 0);
  assert.throws(
    () => deriveControllerCloseoutArtifactName({
      controllerRecoveryId,
      originalRunId: coercing,
      originalRunAttempt: 1,
    }),
    /controller_closeout_artifact_binding_invalid/,
  );
  assert.equal(coercions, 0);
});

test("exact input gates reject symbols, hidden fields, and accessors before reading", () => {
  const validObservation = buildActionsArtifactObservation(validArtifactObservationInput());
  const expected = validArtifactObservationExpected();
  const withSymbol = { ...expected };
  withSymbol[Symbol("override")] = true;
  const withHidden = { ...expected };
  Object.defineProperty(withHidden, "override", { value: true, enumerable: false });
  let getterReads = 0;
  const withGetter = { ...expected };
  Object.defineProperty(withGetter, "runId", {
    enumerable: true,
    get() {
      getterReads += 1;
      return expected.runId;
    },
  });
  for (const invalid of [withSymbol, withHidden, withGetter]) {
    assert.throws(
      () => validateActionsArtifactObservation(validObservation.value, invalid),
      /actions_artifact_observation_expected_invalid/,
    );
  }
  const closeoutInput = { ...validControllerInput() };
  Object.defineProperty(closeoutInput, "callerResult", { value: "validated_deployment" });
  assert.throws(
    () => buildControllerCloseout(closeoutInput),
    /controller_closeout_build_input_invalid/,
  );
  assert.equal(getterReads, 0);
});

test("artifact observation freshness is validation-only and closed at every edge", () => {
  const createdAt = "2026-08-08T00:00:00.000Z";
  const expiresAt = "2026-09-12T00:00:00.000Z";
  const buildAt = (readbackAt) => buildActionsArtifactObservation(
    validArtifactObservationInput({ createdAt, expiresAt, readbackAt }),
  );
  assert.deepEqual(buildAt(createdAt).bytes, buildAt("2026-09-11T23:59:59.999Z").bytes);
  for (const readbackAt of [
    "2026-08-07T23:59:59.999Z",
    expiresAt,
    "2026-08-08T00:00:00Z",
    "not-a-time",
  ]) {
    assert.throws(() => buildAt(readbackAt), /actions_artifact_observation_/);
  }
  assert.throws(
    () => buildActionsArtifactObservation(validArtifactObservationInput({
      createdAt,
      expiresAt: "2026-09-11T23:59:59.999Z",
      readbackAt: createdAt,
    })),
    /actions_artifact_observation_/,
  );
  for (const patch of [
    { artifactId: "1" },
    { artifactId: 0 },
    { artifactId: Number.MAX_SAFE_INTEGER + 1 },
    { apiDigest: `sha256:${"A".repeat(64)}` },
    { apiDigest: "a".repeat(64) },
  ]) {
    assert.throws(
      () => buildActionsArtifactObservation(validArtifactObservationInput(patch)),
      /actions_artifact_observation_/,
    );
  }
  assert.throws(
    () => validateActionsArtifactObservation(
      { ...buildAt(createdAt).value, readbackAt: createdAt },
      validArtifactObservationExpected({ readbackAt: createdAt }),
    ),
    /canonical_json_|actions_artifact_observation_/,
  );
  const expected = validArtifactObservationExpected({ readbackAt: createdAt });
  const entries = Object.entries(expected);
  for (const invalidExpected of [
    Object.fromEntries([entries[1], entries[0], ...entries.slice(2)]),
    { ...expected, callerExpectedName: expected.artifactName },
    Object.fromEntries(entries.slice(0, -1)),
  ]) {
    assert.throws(
      () => validateActionsArtifactObservation(buildAt(createdAt).value, invalidExpected),
      /actions_artifact_observation_expected_invalid/,
    );
  }
});

test("final status contract rejects every terminal/no-claim cross-branch value", () => {
  const terminalWrapper = buildControllerFinalStatus(makeControllerFinalStatusFixture());
  const terminal = terminalWrapper.value;
  const noClaim = buildControllerFinalStatus(makeControllerFinalStatusFixture({
    resultCode: "controller_incomplete_no_production_claim",
  })).value;
  for (const invalid of [
    { ...terminal, terminal: false },
    { ...terminal, terminalPublishedAt: null },
    { ...terminal, actionsArtifactObservationSha256: null },
    { ...noClaim, terminal: true },
    { ...noClaim, terminalReceiptSha256: "a".repeat(64) },
    { ...noClaim, artifactReleaseTag: "control-plane-app-forged" },
  ]) {
    assert.throws(
      () => serializeCanonicalJsonBytes(invalid, CONTROLLER_FINAL_STATUS_CONTRACT),
      /controller_final_status_/,
    );
  }
  const terminalBuildInput = makeControllerFinalStatusFixture();
  for (const forgedMetadata of [
    { artifactReleaseTag: `${terminalWrapper.value.artifactReleaseTag}-forged` },
    { backupResult: `${terminalWrapper.value.backupResult}-forged` },
  ]) {
    assert.throws(
      () => buildControllerFinalStatus(Object.freeze({
        ...terminalBuildInput,
        ...forgedMetadata,
      })),
      /controller_final_status_committed_proof_mismatch/,
    );
  }
  const expected = expectedFinalStatusBindings();
  const entries = Object.entries(expected);
  for (const invalidExpected of [
    Object.fromEntries([entries[1], entries[0], ...entries.slice(2)]),
    { ...expected, sourceResolverResult: Object.freeze({ trusted: true }) },
    { ...expected, mainSourceHeadSha: "f".repeat(40) },
  ]) {
    assert.throws(
      () => validateControllerFinalStatus(terminalWrapper.bytes, invalidExpected),
      /controller_final_status_|main_source_/,
    );
  }
});
```

Artifact controller and Deploy Note tests later import this exact builder/validator/fixture; they may not use a locally shaped object that merely resembles final status. Task 13 table-drives every terminal/no-claim/nonterminal result and proves each of the five validated terminal rows can write at most one bounded comment. `validated_deployment` alone includes `deployed_at` byte-equal to `noteInput.terminalPublishedAt`; `validated_stopped_pre_switch`, `validated_schema_only_change`, `validated_rolled_back`, and `validated_critical_failure` each emit their exact validated stopped/schema-only/rollback/critical-failure wording and have no `deployed_at` key or timestamp text. No-claim and nonterminal rows write zero comments. A clone, missing/mismatched publication time, `observedAt`, writer-clock substitution, duplicate-comment attempt, unbounded body, wrong wording, or `deployed_at` on any non-deployment row makes zero writes.

- [ ] **Step 2 (2 min): Run RED and confirm the closeout module is missing**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `control-plane-controller-closeout.mjs`.

- [ ] **Step 3 (5 min): Implement closed result mapping and two distinct byte contracts**

First append the controller-closeout contract to its Task 1 owner module. This is the only definition of its payload field order; the Task 3 module imports this exact frozen object:

```js
// server/services/deployment/control-plane-receipt-contract.mjs
export const CONTROLLER_CLOSEOUT_BINDING_FIELDS = Object.freeze([
  "controllerRecoveryId",
  "originalRunId",
  "originalRunAttempt",
  "productionGateReceiptSha256",
  "transactionId",
  "target",
  "releaseUnit",
  "sourceCommit",
  "mainSourceIdentitySha256",
  "mainSourcePrNumber",
  "mainSourceHeadSha",
  "mainSourceMergeCommitSha",
  "deploymentPlanSha256",
  "inventoryReceiptSha256",
  "bootstrapReceiptSha256",
]);

const CONTROLLER_CLOSEOUT_ARTIFACT_POLICY_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-closeout-artifact-policy-v1",
  maxBytes: 256,
  fieldOrder: Object.freeze(["retentionDays", "artifactName"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.retentionDays !== 35
      || typeof value.artifactName !== "string"
      || value.artifactName.length < 1 || value.artifactName.length > 255
      || !/^[A-Za-z0-9_.-]+$/u.test(value.artifactName)) {
      throw new Error("controller_closeout_artifact_policy_invalid");
    }
  },
});

const CONTROLLER_CLOSEOUT_TERMINAL_EVIDENCE_FIELDS = Object.freeze([
  "terminalReceiptSha256",
  "terminalRecordSha256",
  "transactionInvocationSha256",
  "terminalPublishedAt",
  "terminalReceiptBase64",
  "terminalRecordBase64",
  "initialHostCloseoutRecordBase64",
]);

function isCanonicalReceiptTimestamp(value) {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isReceiptLowerHex(value, size) {
  return typeof value === "string"
    && new RegExp(`^[0-9a-f]{${size}}$`, "u").test(value);
}

function isCanonicalReceiptBase64(value) {
  try {
    decodeCanonicalReceiptBase64(value, "controller_closeout_base64_invalid");
    return true;
  } catch {
    return false;
  }
}

export const CONTROLLER_CLOSEOUT_V1_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-closeout-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze([
    "schemaVersion",
    "domain",
    "controllerRecoveryId",
    "originalRunId",
    "originalRunAttempt",
    "productionGateReceiptSha256",
    "transactionId",
    "target",
    "releaseUnit",
    "sourceCommit",
    "mainSourceIdentitySha256",
    "mainSourcePrNumber",
    "mainSourceHeadSha",
    "mainSourceMergeCommitSha",
    "deploymentPlanSha256",
    "inventoryReceiptSha256",
    "bootstrapReceiptSha256",
    "terminalReceiptSha256",
    "terminalRecordSha256",
    "transactionInvocationSha256",
    "terminalPublishedAt",
    "terminalReceiptBase64",
    "terminalRecordBase64",
    "initialHostCloseoutRecordBase64",
    "controllerResult",
    "controllerCloseoutArtifactState",
    "runnerCleanupVerified",
    "artifactPolicy",
  ]),
  nested: Object.freeze({
    artifactPolicy: CONTROLLER_CLOSEOUT_ARTIFACT_POLICY_CONTRACT,
  }),
  arrays: Object.freeze({}),
  validate(value) {
    const digestFields = [
      "productionGateReceiptSha256",
      "mainSourceIdentitySha256",
      "deploymentPlanSha256",
      "inventoryReceiptSha256",
      "bootstrapReceiptSha256",
    ];
    if (value.schemaVersion !== 1
      || value.domain !== "controller-closeout"
      || typeof value.controllerRecoveryId !== "string"
      || !/^cr1\.[0-9a-f]{64}$/u.test(value.controllerRecoveryId)
      || typeof value.originalRunId !== "string"
      || !/^[1-9][0-9]{0,19}$/u.test(value.originalRunId)
      || !Number.isSafeInteger(value.originalRunAttempt)
      || value.originalRunAttempt < 1 || value.originalRunAttempt > 9_999_999_999
      || typeof value.transactionId !== "string"
      || !/^dpt1\.[0-9a-f]{64}$/u.test(value.transactionId)
      || value.target !== "japan-control-plane"
      || value.releaseUnit !== "control-plane-app"
      || !isReceiptLowerHex(value.sourceCommit, 40)
      || !Number.isSafeInteger(value.mainSourcePrNumber) || value.mainSourcePrNumber < 1
      || !isReceiptLowerHex(value.mainSourceHeadSha, 40)
      || !isReceiptLowerHex(value.mainSourceMergeCommitSha, 40)
      || digestFields.some((field) => !isReceiptLowerHex(value[field], 64))
      || !CONTROLLER_RESULTS.includes(value.controllerResult)
      || value.runnerCleanupVerified !== true) {
      throw new Error("controller_closeout_value_invalid");
    }
    const terminal = value.terminalReceiptSha256 !== null;
    if (terminal) {
      if (!CONTROLLER_CLOSEOUT_TERMINAL_EVIDENCE_FIELDS.every((field) => value[field] !== null)
        || !isReceiptLowerHex(value.terminalReceiptSha256, 64)
        || !isReceiptLowerHex(value.terminalRecordSha256, 64)
        || !isReceiptLowerHex(value.transactionInvocationSha256, 64)
        || !isCanonicalReceiptTimestamp(value.terminalPublishedAt)
        || !isCanonicalReceiptBase64(value.terminalReceiptBase64)
        || !isCanonicalReceiptBase64(value.terminalRecordBase64)
        || !isCanonicalReceiptBase64(value.initialHostCloseoutRecordBase64)
        || value.controllerCloseoutArtifactState !== "not_started") {
        throw new Error("controller_closeout_terminal_evidence_invalid");
      }
    } else if (CONTROLLER_CLOSEOUT_TERMINAL_EVIDENCE_FIELDS.some((field) => value[field] !== null)
        || value.controllerCloseoutArtifactState !== null) {
      throw new Error("controller_closeout_no_claim_evidence_invalid");
    }
  },
});

const EMBEDDED_CONTROLLER_CLOSEOUT_TUPLE_FIELDS = Object.freeze([
  "terminalReceiptBase64",
  "terminalRecordBase64",
  "initialHostCloseoutRecordBase64",
  "bindings",
]);

function assertExactReceiptOwnKeys(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(code);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
      || keys.some((field, index) => typeof field !== "string" || field !== fields[index])) {
    throw new Error(code);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) {
      throw new Error(code);
    }
  }
}

export function validateEmbeddedControllerCloseoutTuple(input) {
  assertExactReceiptOwnKeys(
    input,
    EMBEDDED_CONTROLLER_CLOSEOUT_TUPLE_FIELDS,
    "embedded_controller_closeout_tuple_input_invalid",
  );
  assertExactReceiptOwnKeys(
    input.bindings,
    CONTROLLER_CLOSEOUT_BINDING_FIELDS,
    "embedded_controller_closeout_binding_invalid",
  );
  const terminalReceiptBytes = decodeCanonicalReceiptBase64(
    input.terminalReceiptBase64,
    "embedded_controller_closeout_receipt_base64_invalid",
  );
  const terminalRecordBytes = decodeCanonicalReceiptBase64(
    input.terminalRecordBase64,
    "embedded_controller_closeout_record_base64_invalid",
  );
  const initialHostCloseoutRecordBytes = decodeCanonicalReceiptBase64(
    input.initialHostCloseoutRecordBase64,
    "embedded_controller_closeout_initial_record_base64_invalid",
  );
  const receiptBindings = Object.freeze({
    productionGateReceiptSha256: input.bindings.productionGateReceiptSha256,
    controllerRecoveryId: input.bindings.controllerRecoveryId,
    runId: input.bindings.originalRunId,
    runAttempt: input.bindings.originalRunAttempt,
    transactionId: input.bindings.transactionId,
    target: input.bindings.target,
    releaseUnit: input.bindings.releaseUnit,
    sourceCommit: input.bindings.sourceCommit,
    deploymentPlanSha256: input.bindings.deploymentPlanSha256,
    inventoryReceiptSha256: input.bindings.inventoryReceiptSha256,
    bootstrapReceiptSha256: input.bindings.bootstrapReceiptSha256,
  });
  const receipt = validateHostTerminalReceiptBytes(terminalReceiptBytes, receiptBindings);
  const terminalReceiptSha256 = sha256Hex(terminalReceiptBytes);
  const terminalRecord = parseCanonicalJsonBytes(
    terminalRecordBytes,
    HOST_TERMINAL_RECORD_V1_CONTRACT,
  );
  validateHostTerminalRecord(terminalRecord, Object.freeze({
    receiptSha256: terminalReceiptSha256,
    plan: input.bindings,
  }));
  const terminalRecordSha256 = sha256Hex(terminalRecordBytes);
  const initialHostCloseoutRecord = parseCanonicalJsonBytes(
    initialHostCloseoutRecordBytes,
    HOST_CLOSEOUT_RECORD_V1_CONTRACT,
  );
  validateHostCloseoutRecord(initialHostCloseoutRecord, Object.freeze({
    receiptSha256: terminalReceiptSha256,
    terminalRecordSha256,
    runId: input.bindings.originalRunId,
    runAttempt: input.bindings.originalRunAttempt,
  }));
  const artifactReleaseTag = receipt.artifactBindings.releaseTag;
  const backupResult = receipt.terminalEvidence.backupResult;
  if (typeof artifactReleaseTag !== "string" || artifactReleaseTag.length < 1
      || artifactReleaseTag.length > 255 || /[\u0000-\u001f\u007f]/u.test(artifactReleaseTag)
      || typeof backupResult !== "string" || backupResult.length < 1
      || backupResult.length > 256 || /[\u0000-\u001f\u007f]/u.test(backupResult)) {
    throw new Error("embedded_controller_closeout_terminal_metadata_invalid");
  }
  return Object.freeze({
    receipt,
    terminalReceiptSha256,
    terminalRecordSha256,
    initialHostCloseoutRecordSha256: sha256Hex(initialHostCloseoutRecordBytes),
    artifactReleaseTag,
    backupResult,
  });
}
```

The appended owner code reuses the one Task 2-private Receipt Base64 decoder and the already implemented Task 2 receipt/record/closeout contracts and validators. It validates only the three byte objects later embedded in `controller_closeout`, both adjacent digest edges, and all exact run/Gate/plan/inventory/bootstrap/source bindings; it neither accepts nor fabricates an initial lease/index value or a second schema/codec.

Then start `control-plane-controller-closeout.mjs` with one explicit import of that owner and real imports for every external call used below. `ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT` and `CONTROLLER_FINAL_STATUS_CONTRACT` are defined and exported only by this module:

```js
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex,
} from "./canonical-json.mjs";
import {
  CONTROLLER_CLOSEOUT_BINDING_FIELDS,
  CONTROLLER_CLOSEOUT_V1_CONTRACT,
  decodeCanonicalReceiptBase64,
  deriveUploadCommittedCloseoutRecordSha256,
  isControllerNoClaimResult,
  isControllerTerminalResult,
  mapControllerResultToHostFinalState,
  mapHostFinalStateToControllerResult,
  validateEmbeddedControllerCloseoutTuple,
} from "./control-plane-receipt-contract.mjs";
import {
  assertValidatedOrdinaryStatus,
  validateStatusResponseFrame,
} from "./control-plane-host-protocol.mjs";
import { validateTransportEnvelope } from "./control-plane-transport-contract.mjs";

function safeCloseoutError(code) {
  return new Error(code);
}
```

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
  if (typeof controllerRecoveryId !== "string"
      || !/^cr1\.[0-9a-f]{64}$/u.test(controllerRecoveryId)
      || typeof originalRunId !== "string"
      || !/^[1-9][0-9]{0,19}$/u.test(originalRunId)
      || !Number.isSafeInteger(originalRunAttempt)
      || originalRunAttempt < 1 || originalRunAttempt > 9_999_999_999) {
    throw safeCloseoutError("controller_closeout_artifact_binding_invalid");
  }
  return `control-plane-controller-closeout-${controllerRecoveryId}-${originalRunId}-${originalRunAttempt}`;
}

function validateControllerCloseoutResultBranch(value) {
  const terminal = isControllerTerminalResult(value.controllerResult);
  const noClaim = isControllerNoClaimResult(value.controllerResult);
  const carriesTerminalEvidence = value.terminalReceiptSha256 !== null;
  if ((!terminal && !noClaim) || terminal !== carriesTerminalEvidence) {
    throw safeCloseoutError("controller_closeout_result_branch_invalid");
  }
  return Object.freeze({ terminal, noClaim });
}

const builtControllerCloseoutImmutables = new WeakSet();
const validatedControllerCloseoutValueEvidence = new WeakMap();
const validatedControllerCloseoutImmutableEvidence = new WeakMap();

function projectControllerCloseoutBindings(value) {
  return Object.freeze(Object.fromEntries(
    CONTROLLER_CLOSEOUT_BINDING_FIELDS.map((field) => [field, value[field]]),
  ));
}

function mintControllerCloseoutImmutable({ value, bytes }) {
  validateControllerCloseoutResultBranch(value);
  const evidence = validatedControllerCloseoutValueEvidence.get(value);
  if (evidence === undefined) {
    throw safeCloseoutError("controller_closeout_value_unvalidated");
  }
  const expectedArtifactName = deriveControllerCloseoutArtifactName({
    controllerRecoveryId: value.controllerRecoveryId,
    originalRunId: value.originalRunId,
    originalRunAttempt: value.originalRunAttempt,
  });
  const canonicalBytes = serializeCanonicalJsonBytes(value, CONTROLLER_CLOSEOUT_V1_CONTRACT);
  if (!Buffer.isBuffer(bytes) || !bytes.equals(canonicalBytes) ||
      value.artifactPolicy.artifactName !== expectedArtifactName) {
    throw safeCloseoutError("controller_closeout_immutable_binding_invalid");
  }
  const ownedBytes = Buffer.from(canonicalBytes);
  const sha256 = sha256Hex(ownedBytes);
  const immutable = Object.freeze({
    value,
    bytes: ownedBytes,
    sha256,
    artifactName: expectedArtifactName,
    fileName: `controller-closeout-${sha256}.json`,
  });
  builtControllerCloseoutImmutables.add(immutable);
  validatedControllerCloseoutImmutableEvidence.set(immutable, evidence);
  return immutable;
}

const CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS = Object.freeze([
  "preAdmissionDurableRejection",
  "admissionAccepted",
  "receiptValid",
  "controllerComplete",
  "hostFinalState",
  ...CONTROLLER_CLOSEOUT_BINDING_FIELDS,
  "terminalReceiptSha256",
  "terminalRecordSha256",
  "transactionInvocationSha256",
  "terminalPublishedAt",
  "terminalReceiptBytes",
  "terminalRecordBytes",
  "initialHostCloseoutRecordBytes",
  "runnerCleanupVerified",
]);

function validateControllerCloseoutBuildInput(input) {
  assertExactOwnKeys(
    input,
    CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS,
    "controller_closeout_build_input_invalid",
  );
  const admissionRejected = input.preAdmissionDurableRejection === true
    && input.admissionAccepted === false
    && input.receiptValid === null && input.controllerComplete === null
    && input.hostFinalState === null;
  const receiptInvalid = input.preAdmissionDurableRejection === false
    && input.admissionAccepted === true && input.receiptValid === false
    && input.controllerComplete === null && input.hostFinalState === null;
  const controllerIncomplete = input.preAdmissionDurableRejection === false
    && input.admissionAccepted === true && input.receiptValid === true
    && input.controllerComplete === false && input.hostFinalState === null;
  const terminal = input.preAdmissionDurableRejection === false
    && input.admissionAccepted === true && input.receiptValid === true
    && input.controllerComplete === true && input.hostFinalState !== null;
  if (![admissionRejected, receiptInvalid, controllerIncomplete, terminal]
    .some((matched) => matched)) {
    throw safeCloseoutError("controller_closeout_build_branch_invalid");
  }
  const terminalEvidenceFields = Object.freeze([
    "terminalReceiptSha256",
    "terminalRecordSha256",
    "transactionInvocationSha256",
    "terminalPublishedAt",
    "terminalReceiptBytes",
    "terminalRecordBytes",
    "initialHostCloseoutRecordBytes",
  ]);
  if (terminal) {
    if (typeof input.terminalReceiptSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(input.terminalReceiptSha256)
      || typeof input.terminalRecordSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(input.terminalRecordSha256)
      || typeof input.transactionInvocationSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(input.transactionInvocationSha256)
      || typeof input.terminalPublishedAt !== "string"
      || !Number.isFinite(Date.parse(input.terminalPublishedAt))
      || new Date(Date.parse(input.terminalPublishedAt)).toISOString()
        !== input.terminalPublishedAt
      || !Buffer.isBuffer(input.terminalReceiptBytes)
      || !Buffer.isBuffer(input.terminalRecordBytes)
      || !Buffer.isBuffer(input.initialHostCloseoutRecordBytes)) {
      throw safeCloseoutError("controller_closeout_terminal_build_evidence_invalid");
    }
  } else if (terminalEvidenceFields.some((field) => input[field] !== null)) {
    throw safeCloseoutError("controller_closeout_no_claim_build_evidence_invalid");
  }
  if (input.runnerCleanupVerified !== true) {
    throw safeCloseoutError("controller_closeout_build_cleanup_invalid");
  }
}

export function buildControllerCloseout(input) {
  validateControllerCloseoutBuildInput(input);
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
    mainSourceIdentitySha256: input.mainSourceIdentitySha256,
    mainSourcePrNumber: input.mainSourcePrNumber,
    mainSourceHeadSha: input.mainSourceHeadSha,
    mainSourceMergeCommitSha: input.mainSourceMergeCommitSha,
    deploymentPlanSha256: input.deploymentPlanSha256,
    inventoryReceiptSha256: input.inventoryReceiptSha256,
    bootstrapReceiptSha256: input.bootstrapReceiptSha256,
    terminalReceiptSha256,
    terminalRecordSha256: input.terminalRecordSha256 ?? null,
    transactionInvocationSha256: input.transactionInvocationSha256 ?? null,
    terminalPublishedAt: terminalReceiptSha256 === null ? null : input.terminalPublishedAt,
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
  validateControllerCloseoutResultBranch(value);
  const bytes = serializeCanonicalJsonBytes(value, CONTROLLER_CLOSEOUT_V1_CONTRACT);
  const validatedValue = validateControllerCloseoutBytes(
    bytes,
    projectControllerCloseoutBindings(value),
  );
  return mintControllerCloseoutImmutable({ value: validatedValue, bytes });
}

const ADOPT_CONTROLLER_CLOSEOUT_INPUT_FIELDS = Object.freeze([
  "bytes", "closeoutBindings",
]);

export function adoptControllerCloseoutImmutable(input) {
  assertExactOwnKeys(
    input,
    ADOPT_CONTROLLER_CLOSEOUT_INPUT_FIELDS,
    "controller_closeout_adopt_input_invalid",
  );
  if (!Buffer.isBuffer(input.bytes)) {
    throw safeCloseoutError("controller_closeout_adopt_bytes_invalid");
  }
  const ownedBytes = Buffer.from(input.bytes);
  const value = validateControllerCloseoutBytes(ownedBytes, input.closeoutBindings);
  return mintControllerCloseoutImmutable({ value, bytes: ownedBytes });
}

export function validateControllerCloseoutBytes(bytes, bindings) {
  assertExactOwnKeys(
    bindings,
    CONTROLLER_CLOSEOUT_BINDING_FIELDS,
    "controller_closeout_binding_fields_invalid",
  );
  const value = parseCanonicalJsonBytes(bytes, CONTROLLER_CLOSEOUT_V1_CONTRACT);
  for (const field of CONTROLLER_CLOSEOUT_BINDING_FIELDS) {
    if (value[field] !== bindings[field]) {
      throw safeCloseoutError(`controller_closeout_${field}_mismatch`);
    }
  }
  const expectedArtifactName = deriveControllerCloseoutArtifactName({
    controllerRecoveryId: value.controllerRecoveryId,
    originalRunId: value.originalRunId,
    originalRunAttempt: value.originalRunAttempt,
  });
  if (value.artifactPolicy.artifactName !== expectedArtifactName) {
    throw safeCloseoutError("controller_closeout_artifact_name_mismatch");
  }
  const { terminal, noClaim } = validateControllerCloseoutResultBranch(value);
  let evidence = Object.freeze({ artifactReleaseTag: null, backupResult: null });
  if (terminal) {
    const tuple = validateEmbeddedControllerCloseoutTuple(Object.freeze({
      terminalReceiptBase64: value.terminalReceiptBase64,
      terminalRecordBase64: value.terminalRecordBase64,
      initialHostCloseoutRecordBase64: value.initialHostCloseoutRecordBase64,
      bindings,
    }));
    if (tuple.terminalReceiptSha256 !== value.terminalReceiptSha256
      || tuple.terminalRecordSha256 !== value.terminalRecordSha256) {
      throw safeCloseoutError("controller_closeout_embedded_digest_mismatch");
    }
    if (tuple.receipt.terminalPublishedAt !== value.terminalPublishedAt
      || tuple.receipt.transactionInvocationSha256 !== value.transactionInvocationSha256
      || mapHostFinalStateToControllerResult(tuple.receipt.finalState) !== value.controllerResult) {
      throw safeCloseoutError("controller_closeout_terminal_receipt_binding_mismatch");
    }
    evidence = Object.freeze({
      artifactReleaseTag: tuple.artifactReleaseTag,
      backupResult: tuple.backupResult,
    });
  } else if (noClaim && value.terminalReceiptSha256 !== null) {
    throw safeCloseoutError("controller_closeout_no_claim_evidence_invalid");
  }
  const frozenValue = deepFreeze(value);
  validatedControllerCloseoutValueEvidence.set(frozenValue, evidence);
  return frozenValue;
}

const CONTROLLER_CLOSEOUT_WIRE_BYTE_FIELDS = Object.freeze([
  "terminalReceiptBytes",
  "terminalRecordBytes",
  "initialHostCloseoutRecordBytes",
]);

const CONTROLLER_CLOSEOUT_BUILD_WIRE_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-closeout-build-wire-v1",
  maxBytes: 262_144,
  fieldOrder: CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    for (const field of CONTROLLER_CLOSEOUT_WIRE_BYTE_FIELDS) {
      if (value[field] !== null && typeof value[field] !== "string") {
        throw safeCloseoutError("controller_closeout_build_wire_base64_invalid");
      }
    }
  },
});

const CONTROLLER_CLOSEOUT_BINDINGS_WIRE_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-closeout-bindings-wire-v1",
  maxBytes: 4_096,
  fieldOrder: CONTROLLER_CLOSEOUT_BINDING_FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate() {},
});

const CONTROLLER_CLOSEOUT_VALIDATE_WIRE_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-closeout-validate-wire-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze(["controllerCloseoutBase64", "closeoutBindings"]),
  nested: Object.freeze({
    closeoutBindings: CONTROLLER_CLOSEOUT_BINDINGS_WIRE_CONTRACT,
  }),
  arrays: Object.freeze({}),
  validate(value) {
    if (typeof value.controllerCloseoutBase64 !== "string") {
      throw safeCloseoutError("controller_closeout_validate_wire_base64_invalid");
    }
  },
});

export function buildControllerCloseoutFromCanonicalWireBytes(requestBytes) {
  const wire = parseCanonicalJsonBytes(
    requestBytes,
    CONTROLLER_CLOSEOUT_BUILD_WIRE_CONTRACT,
  );
  const decoded = Object.freeze(Object.fromEntries(
    CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS.map((field) => {
      if (!CONTROLLER_CLOSEOUT_WIRE_BYTE_FIELDS.includes(field) || wire[field] === null) {
        return [field, wire[field]];
      }
      return [field, decodeCanonicalReceiptBase64(
        wire[field],
        "controller_closeout_build_wire_base64_invalid",
      )];
    }),
  ));
  return Buffer.from(buildControllerCloseout(decoded).bytes);
}

export function validateControllerCloseoutFromCanonicalWireBytes(requestBytes) {
  const wire = parseCanonicalJsonBytes(
    requestBytes,
    CONTROLLER_CLOSEOUT_VALIDATE_WIRE_CONTRACT,
  );
  const closeoutBytes = decodeCanonicalReceiptBase64(
    wire.controllerCloseoutBase64,
    "controller_closeout_validate_wire_base64_invalid",
    262_144,
  );
  const value = validateControllerCloseoutBytes(closeoutBytes, wire.closeoutBindings);
  const canonicalBytes = serializeCanonicalJsonBytes(value, CONTROLLER_CLOSEOUT_V1_CONTRACT);
  if (!canonicalBytes.equals(closeoutBytes)) {
    throw safeCloseoutError("controller_closeout_validate_wire_round_trip_invalid");
  }
  return Buffer.from(closeoutBytes);
}
```

Build the Actions observation from one exact stable identity projection. `artifactId` is the positive safe integer returned by the fixed Actions metadata reader; it is never stringified or accepted past JavaScript's safe-integer boundary. Parse `createdAt`, `expiresAt`, and the trusted-clock `readbackAt` as canonical timestamps; require `createdAt <= readbackAt < expiresAt` and `expiresAt - createdAt >= 35 days` before serialization. The canonical observation value has exactly these ordered fields and no timestamp describing the act of reading:

```js
const ACTIONS_ARTIFACT_OBSERVATION_BUILD_FIELDS = Object.freeze([
  "repository",
  "runId",
  "runAttempt",
  "artifactId",
  "artifactName",
  "apiDigest",
  "payloadSha256",
  "size",
  "createdAt",
  "expiresAt",
  "readbackAt",
]);
const ACTIONS_ARTIFACT_OBSERVATION_EXPECTED_FIELDS = Object.freeze([
  "repository",
  "runId",
  "runAttempt",
  "artifactName",
  "payloadSha256",
  "minimumRetentionDays",
  "readbackAt",
]);
const ACTIONS_ARTIFACT_MINIMUM_RETENTION_DAYS = 35;
const MILLISECONDS_PER_DAY = 86_400_000;

function parseCanonicalCloseoutTimestamp(value, code) {
  if (typeof value !== "string") throw safeCloseoutError(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw safeCloseoutError(code);
  }
  return milliseconds;
}

export const ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT = Object.freeze({
  schemaId: "control-plane-actions-artifact-observation-v1",
  maxBytes: 2_048,
  fieldOrder: Object.freeze([
    "schemaVersion",
    "domain",
    "repository",
    "runId",
    "runAttempt",
    "artifactId",
    "artifactName",
    "apiDigest",
    "payloadSha256",
    "size",
    "createdAt",
    "expiresAt",
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== 1
      || value.domain !== "actions-artifact-observation"
      || typeof value.repository !== "string"
      || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(value.repository)
      || typeof value.runId !== "string"
      || !/^[1-9][0-9]{0,19}$/u.test(value.runId)
      || !Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1
      || value.runAttempt > 9_999_999_999
      || !Number.isSafeInteger(value.artifactId) || value.artifactId < 1
      || typeof value.artifactName !== "string" || value.artifactName.length > 255
      || !/^[A-Za-z0-9_.-]+$/u.test(value.artifactName)
      || typeof value.apiDigest !== "string"
      || !/^sha256:[0-9a-f]{64}$/u.test(value.apiDigest)
      || typeof value.payloadSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(value.payloadSha256)
      || !Number.isSafeInteger(value.size) || value.size < 1
      || !Number.isFinite(parseCanonicalCloseoutTimestamp(
        value.createdAt,
        "actions_artifact_observation_created_at_invalid",
      ))
      || !Number.isFinite(parseCanonicalCloseoutTimestamp(
        value.expiresAt,
        "actions_artifact_observation_expires_at_invalid",
      ))) {
      throw safeCloseoutError("actions_artifact_observation_value_invalid");
    }
  },
});

export function validateActionsArtifactReadbackWindow(input) {
  assertExactOwnKeys(
    input,
    ACTIONS_ARTIFACT_OBSERVATION_BUILD_FIELDS,
    "actions_artifact_observation_input_invalid",
  );
  const createdAt = parseCanonicalCloseoutTimestamp(
    input.createdAt,
    "actions_artifact_observation_created_at_invalid",
  );
  const expiresAt = parseCanonicalCloseoutTimestamp(
    input.expiresAt,
    "actions_artifact_observation_expires_at_invalid",
  );
  const readbackAt = parseCanonicalCloseoutTimestamp(
    input.readbackAt,
    "actions_artifact_observation_readback_at_invalid",
  );
  if (expiresAt - createdAt
      < ACTIONS_ARTIFACT_MINIMUM_RETENTION_DAYS * MILLISECONDS_PER_DAY
      || readbackAt < createdAt || readbackAt >= expiresAt) {
    throw safeCloseoutError("actions_artifact_observation_readback_window_invalid");
  }
  return Object.freeze({ createdAt, expiresAt, readbackAt });
}

export function validateActionsArtifactObservation(value, expected) {
  assertExactOwnKeys(
    expected,
    ACTIONS_ARTIFACT_OBSERVATION_EXPECTED_FIELDS,
    "actions_artifact_observation_expected_invalid",
  );
  if (expected.minimumRetentionDays !== ACTIONS_ARTIFACT_MINIMUM_RETENTION_DAYS) {
    throw safeCloseoutError("actions_artifact_observation_retention_authority_invalid");
  }
  serializeCanonicalJsonBytes(value, ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT);
  validateActionsArtifactReadbackWindow(Object.freeze({
    repository: value.repository,
    runId: value.runId,
    runAttempt: value.runAttempt,
    artifactId: value.artifactId,
    artifactName: value.artifactName,
    apiDigest: value.apiDigest,
    payloadSha256: value.payloadSha256,
    size: value.size,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    readbackAt: expected.readbackAt,
  }));
  for (const field of [
    "repository", "runId", "runAttempt", "artifactName", "payloadSha256",
  ]) {
    if (value[field] !== expected[field]) {
      throw safeCloseoutError(`actions_artifact_observation_${field}_mismatch`);
    }
  }
  return value;
}

export function buildActionsArtifactObservation(input) {
  validateActionsArtifactReadbackWindow(input);
  const value = Object.freeze({
    schemaVersion: 1,
    domain: "actions-artifact-observation",
    repository: input.repository,
    runId: input.runId,
    runAttempt: input.runAttempt,
    artifactId: input.artifactId,
    artifactName: input.artifactName,
    apiDigest: input.apiDigest,
    payloadSha256: input.payloadSha256,
    size: input.size,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  const bytes = serializeCanonicalJsonBytes(value, ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT);
  const wrapper = Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
  builtActionsArtifactObservationWrappers.add(wrapper);
  return wrapper;
}
```

`validateActionsArtifactObservation(value, expected)` canonical-validates that exact stable field set and repeats the same interval/freshness check against mandatory `expected.readbackAt`; it requires both `value.repository === expected.repository` and `value.artifactName === expected.artifactName`, and rejects a missing expected repository/name, a caller-supplied `readbackAt` field in `value`, or any inference of either expectation from the observed value. `validateActionsArtifactObservationWrapper(wrapper, expected)` additionally requires the exact same private-branded wrapper returned above, its exact keys, canonical owned Buffer, and digest before returning that same reference. Controller closeout callers never construct these expected fields: they call `validateControllerCloseoutArtifactObservationWrapper(...)`, which fixes the repository, validates the immutable wrapper, and derives the name. Every production caller supplies `expected.readbackAt` from its injected clock, never from Actions metadata, workflow input, serialized observation bytes, or a persisted digest. This preserves current expiry enforcement without making observation identity depend on when the immutable artifact was read.

That owner selector is reused without reinterpretation by the local writer/upload handle, Actions readback, ACK builder/validator, committed ordinary-status brand, final-status builder, and original-run recovery classifier. A terminal result is therefore addressable by one repository/run/attempt/name tuple at every stage; no later stage can make a wrong artifact discoverable by copying its observed repository/name into an `expected` object.

`preAdmissionDurableRejection` is an explicit one-way evidence gate, not an alias for any ordinary status carrying `durableRejection: true`. It may be literal `true` only when a future Artifact controller has validated an owner-branded durable rejection before transaction admission and therefore also supplies `admissionAccepted: false`; Version 1 deliberately provides no such brand or producer, so its controller never invokes this classifier branch. `admissionAccepted: false` by itself rejects. A Bootstrap ordinary status with `resultCode: "terminal_quiescence_rejected"` already names an admitted transaction and must never set this gate. It remains a transitional nonterminal observation inside Artifact's fixed bounded poll and is not passed to Receipt as `receiptValid: false`: a later Host-proof-backed immutable critical terminal plus exact bundle yields `validated_critical_failure`, while deadline exhaustion yields `controller_incomplete_no_production_claim`. `receipt_invalid_no_production_claim` is reserved for a terminal bundle that actually reaches Receipt validation and fails.

Build final status only from validated closeout bytes and safe validator outputs:

```js
const FINAL_STATUS_RUN_FIELDS = Object.freeze(["runId", "runAttempt"]);
const FINAL_STATUS_BINDING_FIELDS = Object.freeze([
  ...FINAL_STATUS_RUN_FIELDS,
  "mainSourceIdentitySha256",
  "mainSourcePrNumber",
  "mainSourceHeadSha",
  "mainSourceMergeCommitSha",
]);

function assertExactOwnKeys(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(code);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
      || keys.some((field, index) => typeof field !== "string" || field !== fields[index])) {
    throw new Error(code);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) {
      throw new Error(code);
    }
  }
}

function assertLowerHex(value, size, code) {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${size}}$`, "u").test(value)) {
    throw new Error(code);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validateControllerFinalStatusRunBinding(value, expectedRun) {
  assertExactOwnKeys(expectedRun, FINAL_STATUS_RUN_FIELDS, "controller_final_status_run_binding_invalid");
  if (value.runId !== expectedRun.runId || value.runAttempt !== expectedRun.runAttempt) {
    throw new Error("controller_final_status_run_binding_mismatch");
  }
}

function validateControllerFinalStatusBindings(value, expected) {
  assertExactOwnKeys(expected, FINAL_STATUS_BINDING_FIELDS, "controller_final_status_binding_fields_invalid");
  validateControllerFinalStatusRunBinding(value, Object.freeze({
    runId: expected.runId,
    runAttempt: expected.runAttempt,
  }));
  assertLowerHex(expected.mainSourceIdentitySha256, 64, "main_source_identity_sha256_invalid");
  if (!Number.isSafeInteger(expected.mainSourcePrNumber) || expected.mainSourcePrNumber <= 0) {
    throw new Error("main_source_pr_number_invalid");
  }
  assertLowerHex(expected.mainSourceHeadSha, 40, "main_source_head_sha_invalid");
  assertLowerHex(expected.mainSourceMergeCommitSha, 40, "main_source_merge_commit_sha_invalid");
  for (const field of FINAL_STATUS_BINDING_FIELDS.slice(2)) {
    if (value[field] !== expected[field]) throw new Error(`controller_final_status_${field}_mismatch`);
  }
}

const FINAL_STATUS_TERMINAL_EVIDENCE_FIELDS = Object.freeze([
  "hostFinalState",
  "terminalReceiptSha256",
  "transactionInvocationSha256",
  "terminalPublishedAt",
  "actionsArtifactObservationSha256",
  "finalHostStatusSha256",
  "artifactReleaseTag",
  "backupResult",
]);

function validateSerializedFinalStatusBranch(value) {
  const expectedHostState = mapControllerResultToHostFinalState(value.resultCode);
  const terminal = isControllerTerminalResult(value.resultCode);
  const noClaim = isControllerNoClaimResult(value.resultCode);
  if ((!terminal && !noClaim) || value.resultKind !== (terminal ? "terminal" : "no_claim")) {
    throw new Error("controller_final_status_result_branch_invalid");
  }
  if (value.runnerCleanupVerified !== true) {
    throw new Error("controller_final_status_cleanup_invalid");
  }
  if (value.terminal !== terminal || value.validationState !== (terminal ? "validated" : "no_claim")) {
    throw new Error("controller_final_status_validation_branch_invalid");
  }
  if (terminal) {
    if (value.hostFinalState !== expectedHostState
      || FINAL_STATUS_TERMINAL_EVIDENCE_FIELDS.some((field) => value[field] === null)) {
      throw new Error("controller_final_status_terminal_evidence_invalid");
    }
  } else if (value.hostFinalState !== null
      || FINAL_STATUS_TERMINAL_EVIDENCE_FIELDS.some((field) => value[field] !== null)) {
    throw new Error("controller_final_status_no_claim_evidence_invalid");
  }
  return value;
}

export const CONTROLLER_FINAL_STATUS_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-final-status-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "schemaVersion",
    "domain",
    "resultKind",
    "runId",
    "runAttempt",
    "controllerRecoveryId",
    "productionGateReceiptSha256",
    "deploymentPlanSha256",
    "inventoryReceiptSha256",
    "sourceCommit",
    "mainSourceIdentitySha256",
    "mainSourcePrNumber",
    "mainSourceHeadSha",
    "mainSourceMergeCommitSha",
    "target",
    "releaseUnit",
    "resultCode",
    "terminal",
    "validationState",
    "hostFinalState",
    "terminalReceiptSha256",
    "transactionInvocationSha256",
    "terminalPublishedAt",
    "controllerCloseoutSha256",
    "actionsArtifactObservationSha256",
    "finalHostStatusSha256",
    "artifactReleaseTag",
    "backupResult",
    "runnerCleanupVerified",
    "observedAt",
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    const requiredDigests = [
      "productionGateReceiptSha256",
      "deploymentPlanSha256",
      "inventoryReceiptSha256",
      "mainSourceIdentitySha256",
      "controllerCloseoutSha256",
    ];
    const nullableDigests = [
      "terminalReceiptSha256",
      "transactionInvocationSha256",
      "actionsArtifactObservationSha256",
      "finalHostStatusSha256",
    ];
    if (value.schemaVersion !== 1
      || value.domain !== "controller-final-status"
      || typeof value.runId !== "string"
      || !/^[1-9][0-9]{0,19}$/u.test(value.runId)
      || !Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1
      || value.runAttempt > 9_999_999_999
      || typeof value.controllerRecoveryId !== "string"
      || !/^cr1\.[0-9a-f]{64}$/u.test(value.controllerRecoveryId)
      || requiredDigests.some((field) => typeof value[field] !== "string"
        || !/^[0-9a-f]{64}$/u.test(value[field]))
      || nullableDigests.some((field) => value[field] !== null
        && (typeof value[field] !== "string" || !/^[0-9a-f]{64}$/u.test(value[field])))
      || typeof value.sourceCommit !== "string"
      || !/^[0-9a-f]{40}$/u.test(value.sourceCommit)
      || !Number.isSafeInteger(value.mainSourcePrNumber) || value.mainSourcePrNumber < 1
      || typeof value.mainSourceHeadSha !== "string"
      || !/^[0-9a-f]{40}$/u.test(value.mainSourceHeadSha)
      || typeof value.mainSourceMergeCommitSha !== "string"
      || !/^[0-9a-f]{40}$/u.test(value.mainSourceMergeCommitSha)
      || value.target !== "japan-control-plane"
      || value.releaseUnit !== "control-plane-app"
      || value.runnerCleanupVerified !== true) {
      throw safeCloseoutError("controller_final_status_value_invalid");
    }
    const observedAt = parseCanonicalCloseoutTimestamp(
      value.observedAt,
      "controller_final_status_observed_at_invalid",
    );
    validateSerializedFinalStatusBranch(value);
    if (value.resultKind === "terminal") {
      const terminalPublishedAt = parseCanonicalCloseoutTimestamp(
        value.terminalPublishedAt,
        "controller_final_status_terminal_published_at_invalid",
      );
      if (terminalPublishedAt > observedAt
        || typeof value.artifactReleaseTag !== "string"
        || value.artifactReleaseTag.length < 1 || value.artifactReleaseTag.length > 255
        || /[\u0000-\u001f\u007f]/u.test(value.artifactReleaseTag)
        || typeof value.backupResult !== "string" || value.backupResult.length < 1
        || value.backupResult.length > 256
        || /[\u0000-\u001f\u007f]/u.test(value.backupResult)) {
        throw safeCloseoutError("controller_final_status_terminal_metadata_invalid");
      }
    }
  },
});

function validateFinalStatusBuildInputs({
  resultKind,
  closeout,
  controllerCloseoutSha256,
  hostFinalState,
  observation,
  validatedFinalHostStatus,
  artifactReleaseTag,
  backupResult,
  observedAt,
}) {
  const terminal = resultKind === "terminal";
  if (!terminal && resultKind !== "no_claim") throw new Error("controller_final_status_result_kind_invalid");
  if (terminal) {
    if (!isControllerTerminalResult(closeout.controllerResult) ||
        hostFinalState !== mapControllerResultToHostFinalState(closeout.controllerResult) ||
        observation === null || validatedFinalHostStatus === null ||
        artifactReleaseTag === null || backupResult === null) {
      throw new Error("controller_final_status_terminal_input_invalid");
    }
    assertValidatedFinalHostStatus(validatedFinalHostStatus);
    const brandedBindings = validatedFinalHostStatusBindings.get(validatedFinalHostStatus);
    if (brandedBindings.controllerCloseoutSha256 !== controllerCloseoutSha256 ||
        brandedBindings.actionsArtifactObservationSha256 !== observation.sha256 ||
        brandedBindings.closeoutRecordSha256 !== validatedFinalHostStatus.status.closeoutRecordSha256 ||
        brandedBindings.terminalPublishedAt !== closeout.terminalPublishedAt ||
        brandedBindings.artifactReleaseTag !== artifactReleaseTag ||
        brandedBindings.backupResult !== backupResult) {
      throw new Error("controller_final_status_committed_proof_mismatch");
    }
    if (validatedFinalHostStatus.status.hostFinalState !== hostFinalState ||
        validatedFinalHostStatus.status.terminalReceiptSha256 !== closeout.terminalReceiptSha256) {
      throw new Error("controller_final_status_host_binding_mismatch");
    }
  } else if (!isControllerNoClaimResult(closeout.controllerResult) ||
      hostFinalState !== null || observation !== null || validatedFinalHostStatus !== null ||
      artifactReleaseTag !== null || backupResult !== null) {
    throw new Error("controller_final_status_no_claim_input_invalid");
  }
  if (closeout.runnerCleanupVerified !== true || typeof observedAt !== "string") {
    throw new Error("controller_final_status_common_input_invalid");
  }
}

const builtActionsArtifactObservationWrappers = new WeakSet();
export const CONTROL_PLANE_REPOSITORY = "gccwebos-com/proxy-gateway-minimal";

export function validateActionsArtifactObservationWrapper(wrapper, expected) {
  assertExactOwnKeys(wrapper, ["value", "bytes", "sha256"], "actions_artifact_observation_wrapper_invalid");
  if (!builtActionsArtifactObservationWrappers.has(wrapper) || !Object.isFrozen(wrapper)) {
    throw new Error("actions_artifact_observation_wrapper_untrusted");
  }
  validateActionsArtifactObservation(wrapper.value, expected);
  const canonicalBytes = serializeCanonicalJsonBytes(
    wrapper.value,
    ACTIONS_ARTIFACT_OBSERVATION_V1_CONTRACT,
  );
  if (!Buffer.isBuffer(wrapper.bytes) || !wrapper.bytes.equals(canonicalBytes) ||
      wrapper.sha256 !== sha256Hex(canonicalBytes)) {
    throw new Error("actions_artifact_observation_wrapper_mismatch");
  }
  return wrapper;
}

function validateControllerCloseoutImmutable(immutable, closeoutBindings) {
  assertExactOwnKeys(
    immutable,
    ["value", "bytes", "sha256", "artifactName", "fileName"],
    "controller_closeout_wrapper_invalid",
  );
  if (!builtControllerCloseoutImmutables.has(immutable) || !Object.isFrozen(immutable)) {
    throw new Error("controller_closeout_wrapper_untrusted");
  }
  const evidence = validatedControllerCloseoutImmutableEvidence.get(immutable);
  if (evidence === undefined) {
    throw new Error("controller_closeout_wrapper_evidence_missing");
  }
  const closeout = validateControllerCloseoutBytes(immutable.bytes, closeoutBindings);
  const canonicalValueBytes = serializeCanonicalJsonBytes(
    immutable.value,
    CONTROLLER_CLOSEOUT_V1_CONTRACT,
  );
  const expectedArtifactName = deriveControllerCloseoutArtifactName({
    controllerRecoveryId: closeout.controllerRecoveryId,
    originalRunId: closeout.originalRunId,
    originalRunAttempt: closeout.originalRunAttempt,
  });
  if (!Buffer.isBuffer(immutable.bytes) || !immutable.bytes.equals(canonicalValueBytes) ||
      immutable.sha256 !== sha256Hex(immutable.bytes) ||
      immutable.fileName !== `controller-closeout-${immutable.sha256}.json` ||
      immutable.value.artifactPolicy.artifactName !== expectedArtifactName ||
      immutable.artifactName !== expectedArtifactName) {
    throw new Error("controller_closeout_wrapper_mismatch");
  }
  return Object.freeze({ closeout, expectedArtifactName, evidence });
}

const CONTROLLER_CLOSEOUT_OBSERVATION_INPUT_FIELDS = Object.freeze([
  "immutable", "closeoutBindings", "observation", "readbackAt",
]);

export function validateControllerCloseoutArtifactObservationWrapper(input) {
  assertExactOwnKeys(
    input,
    CONTROLLER_CLOSEOUT_OBSERVATION_INPUT_FIELDS,
    "controller_closeout_observation_input_invalid",
  );
  const { immutable, closeoutBindings, observation, readbackAt } = input;
  const { closeout, expectedArtifactName } = validateControllerCloseoutImmutable(
    immutable,
    closeoutBindings,
  );
  const validatedObservation = validateActionsArtifactObservationWrapper(observation, {
    repository: CONTROL_PLANE_REPOSITORY,
    runId: closeout.originalRunId,
    runAttempt: closeout.originalRunAttempt,
    artifactName: expectedArtifactName,
    payloadSha256: immutable.sha256,
    minimumRetentionDays: 35,
    readbackAt,
  });
  if (immutable.artifactName !== expectedArtifactName ||
      immutable.value.artifactPolicy.artifactName !== expectedArtifactName ||
      observation.value.artifactName !== expectedArtifactName ||
      observation.value.repository !== CONTROL_PLANE_REPOSITORY) {
    throw new Error("controller_closeout_artifact_observation_binding_mismatch");
  }
  return validatedObservation;
}

const validatedFinalHostStatusBindings = new WeakMap();

const COMMITTED_FINAL_HOST_STATUS_INPUT_FIELDS = Object.freeze([
  "transportResult",
  "immutable",
  "closeoutBindings",
  "observation",
  "terminal",
  "ackStatus",
  "expectedStatus",
  "readbackAt",
]);

export function validateAndBrandCommittedFinalHostStatus(input) {
  assertExactOwnKeys(
    input,
    COMMITTED_FINAL_HOST_STATUS_INPUT_FIELDS,
    "committed_final_host_status_input_invalid",
  );
  const {
    transportResult,
    immutable,
    closeoutBindings,
    observation,
    terminal,
    ackStatus,
    expectedStatus,
    readbackAt,
  } = input;
  validateControllerCloseoutArtifactObservationWrapper({
    immutable,
    closeoutBindings,
    observation,
    readbackAt,
  });
  const immutableEvidence = validatedControllerCloseoutImmutableEvidence.get(immutable);
  if (immutableEvidence === undefined) {
    throw new Error("controller_closeout_immutable_evidence_missing");
  }
  const envelope = validateTransportEnvelope(transportResult);
  if (envelope.exitCode !== 0) throw new Error("controller_final_status_transport_invalid");
  const status = validateStatusResponseFrame(envelope.responseBytes, expectedStatus);
  assertValidatedOrdinaryStatus(status);
  const expectedCloseoutRecordSha256 = deriveUploadCommittedCloseoutRecordSha256({
    controllerCloseoutBytes: immutable.bytes,
    observation,
  });
  if (status.requestType !== "status" || status.immutableTerminal !== true ||
      status.durableRejection !== false || status.closeoutState !== "upload_committed_observed" ||
      status.controllerRecoveryId !== immutable.value.controllerRecoveryId ||
      status.controllerRecoveryId !== closeoutBindings.controllerRecoveryId ||
      status.hostFinalState !== terminal.hostFinalState ||
      status.terminalReceiptSha256 !== terminal.terminalReceiptSha256 ||
      terminal.terminalPublishedAt !== immutable.value.terminalPublishedAt ||
      status.terminalBundleSha256 !== terminal.terminalBundleSha256 ||
      status.terminalBundleSize !== terminal.terminalBundleSize ||
      status.closeoutRecordSha256 !== expectedCloseoutRecordSha256 ||
      (ackStatus !== null && ackStatus.closeoutRecordSha256 !== status.closeoutRecordSha256)) {
    throw new Error("controller_final_status_committed_binding_invalid");
  }
  const proof = Object.freeze({
    status,
    responseSha256: sha256Hex(envelope.responseBytes),
  });
  validatedFinalHostStatusBindings.set(proof, Object.freeze({
    controllerCloseoutSha256: immutable.sha256,
    actionsArtifactObservationSha256: observation.sha256,
    closeoutRecordSha256: expectedCloseoutRecordSha256,
    terminalPublishedAt: terminal.terminalPublishedAt,
    artifactReleaseTag: immutableEvidence.artifactReleaseTag,
    backupResult: immutableEvidence.backupResult,
  }));
  return proof;
}

export function assertValidatedFinalHostStatus(value) {
  assertExactOwnKeys(value, ["status", "responseSha256"], "validated_final_host_status_shape_invalid");
  if (!validatedFinalHostStatusBindings.has(value)) {
    throw new Error("validated_final_host_status_brand_invalid");
  }
  assertValidatedOrdinaryStatus(value.status);
  assertLowerHex(value.responseSha256, 64, "final_host_status_sha256_invalid");
  return value;
}

const CONTROLLER_FINAL_STATUS_BUILD_INPUT_FIELDS = Object.freeze([
  "controllerCloseoutBytes",
  "closeoutBindings",
  "actionsArtifactObservation",
  "validatedFinalHostStatus",
  "artifactReleaseTag",
  "backupResult",
  "observedAt",
]);

export function buildControllerFinalStatus(input) {
  assertExactOwnKeys(
    input,
    CONTROLLER_FINAL_STATUS_BUILD_INPUT_FIELDS,
    "controller_final_status_build_input_invalid",
  );
  const {
    controllerCloseoutBytes,
    closeoutBindings,
    actionsArtifactObservation,
    validatedFinalHostStatus,
    artifactReleaseTag,
    backupResult,
    observedAt,
  } = input;
  const immutable = adoptControllerCloseoutImmutable({
    bytes: controllerCloseoutBytes,
    closeoutBindings,
  });
  const closeout = immutable.value;
  const controllerCloseoutSha256 = immutable.sha256;
  const hostFinalState = mapControllerResultToHostFinalState(closeout.controllerResult);
  const resultKind = hostFinalState === null ? "no_claim" : "terminal";
  let observation = null;
  if (actionsArtifactObservation !== null) {
    validateControllerCloseoutArtifactObservationWrapper({
      immutable,
      closeoutBindings,
      observation: actionsArtifactObservation,
      readbackAt: observedAt,
    });
    observation = actionsArtifactObservation;
  }
  validateFinalStatusBuildInputs({
    resultKind,
    closeout,
    controllerCloseoutSha256,
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
    mainSourceIdentitySha256: closeout.mainSourceIdentitySha256,
    mainSourcePrNumber: closeout.mainSourcePrNumber,
    mainSourceHeadSha: closeout.mainSourceHeadSha,
    mainSourceMergeCommitSha: closeout.mainSourceMergeCommitSha,
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
    terminalPublishedAt: resultKind === "terminal" ? closeout.terminalPublishedAt : null,
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

export function inspectControllerFinalStatus(bytes, expectedRun) {
  const value = parseCanonicalJsonBytes(bytes, CONTROLLER_FINAL_STATUS_CONTRACT);
  validateControllerFinalStatusRunBinding(value, expectedRun);
  return deepFreeze(value);
}

export function validateControllerFinalStatus(bytes, expected) {
  assertExactOwnKeys(
    expected,
    FINAL_STATUS_BINDING_FIELDS,
    "controller_final_status_binding_fields_invalid",
  );
  const value = inspectControllerFinalStatus(bytes, Object.freeze({
    runId: expected.runId,
    runAttempt: expected.runAttempt,
  }));
  validateControllerFinalStatusBindings(value, expected);
  return value;
}
```

For a terminal branch, `validatedFinalHostStatus` is exactly the aggregate object returned by Task 4 `validateUploadCommittedObserved(...)` after the one ACK attempt and a separate complete-envelope ordinary `status` readback: `{ status, responseSha256 }`. `status` remains the exact frozen sixteen-field Bootstrap-private reference and is passed unchanged through `assertValidatedOrdinaryStatus`; `responseSha256` hashes those exact post-ACK `responseBytes`. Task 3's module-private `WeakMap` binding is issued only after the deterministic committed closeout/observation digest, owner `terminalPublishedAt`, and all fields actually present in that sixteen-field status pass; the final-status builder requires the stored controller-closeout, observation, committed-record SHA-256, and publication time to match the exact pair supplied to this build. Receipt's `transactionInvocationSha256` and `terminalPublishedAt` remain exclusively bound by the validated terminal bundle and immutable controller closeout; neither is read from or appended to ordinary status. The preceding `validateAckResponse(...)` return is distinct evidence and cannot substitute for this object. `validatedFinalHostStatus` is never the transport envelope, raw response, ACK specialization, flattened/spread status, or independently reconstructed lookalike. For no-claim, it is `null`. `validateFinalStatusBuildInputs(...)` asserts that wrapper brand and byte-compares the terminal host state and receipt plus the closeout/observation result, publication time, plan/source/run/source-origin bindings, artifact Release tag, backup result, cleanup proof, and observed time. `validateSerializedFinalStatusBranch(value)` is a separate closed discriminated-union validator over only the serialized final-status fields; it never accepts or expects a private status wrapper. The source-origin comparison is only closeout/expected byte equality; Receipt never re-reads a PR or evaluates ancestry. For the critical row the nested Bootstrap status brand is downstream of Host `assertCriticalPostPublicationProof`; for the other four rows no critical proof is requested. Both validators reject a no-claim carrying terminal evidence, and the build-input validator rejects a terminal branch missing either the publication-time terminal bundle or later ordinary-status proof.

The Base64 fields preserve the exact already validated canonical aggregate-safe receipt, outer record, and initial host closeout record inside the single controller artifact; they are not SSH stdout or mutable host state. Terminal closeout validation reopens that canonical receipt and byte-compares its `terminalPublishedAt` with the adjacent closeout field before the immutable can be branded; no-claim requires both absent. `buildActionsArtifactObservation` validates fixed repository, original run/attempt, artifact ID/owner-derived name, API archive digest, canonical payload digest, byte size, `created_at`, `expires_at`, and the trusted complete `readbackAt`, but canonicalizes and hashes only the stable fields through `expires_at`. The volatile `readbackAt` is validation-only and cannot appear in the observation `value`, bytes, SHA-256, host ACK, final status, or attestation predicate. The resulting reproducible observation SHA-256 is used by `status_closeout_ack` and the host's `upload_committed_observed` record. The controller schema is a closed discriminated union: a terminal branch requires terminal/outer-record/initial-closeout bytes and digests, Receipt's exact `transactionInvocationSha256` and `terminalPublishedAt`, and initial `controllerCloseoutArtifactState: not_started`; the controller payload never changes that state after host CAS. `admission_rejected_no_transaction` additionally requires the literal `preAdmissionDurableRejection: true` classification gate and all host receipt/lease/invocation/time fields to be `null`; a transaction-bound `terminal_quiescence_rejected` cannot enter that row or a receipt-invalid row merely by being observed. Receipt-invalid and controller-incomplete branches can cite only independently validated safe bindings and never a production result.

Implement and export the two stateless wire functions in this same owner module after the canonical build/validation functions. Their RED/GREEN rows cover terminal and all three no-claim inputs, exact wire key order, duplicate/reordered/extra keys, strict Base64 round trip and bounds, Buffer ownership, wrong bindings, malformed/noncanonical closeout bytes, and byte-identical build-output-to-validation-output flow. They must never export or recreate the process-local immutable brand; a returned Buffer passed to any lifecycle API is ordinary untrusted bytes until that API performs its own owner validation.

- [ ] **Step 4 (3 min): Run GREEN and byte-stability tests**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: every mapping and metadata boundary passes; rebuilding with the same stable artifact values at two distinct valid `readbackAt` times yields byte-identical observation bytes/SHA and final-status observation binding; expiry at equality rejects; fixed repository or owner-derived name drift fails before ACK/final status/recovery; adding API metadata never changes the payload bytes; a later deployed `sourceCommit` remains independent from the exact four-field main-source identity copied through terminal and no-claim bytes; all five terminal rows preserve exact owner `terminalPublishedAt`, every no-claim row keeps it `null`, and the exact controller output bytes are accepted unchanged by the shared Deploy Note fixture. Each validated terminal row yields at most one bounded outcome comment; only `validated_deployment` includes owner-derived `deployed_at`, the other four omit it and retain their exact validated failure/outcome wording, and every no-claim/nonterminal row writes zero comments. Every no-claim branch remains publication-ineligible; no Receipt test or runtime dependency performs a live GitHub resolution.

- [ ] **Step 5 (2 min): Commit controller closeout**

```powershell
git add schemas/control-plane-controller-final-status-v1.schema.json server/services/deployment/control-plane-receipt-contract.mjs server/services/deployment/control-plane-controller-closeout.mjs server/tests/helpers/control-plane-receipt-fixtures.mjs server/tests/control-plane-controller-closeout.test.mjs
git commit -m "feat(deploy): build controller closeout and final status"
```

---

### Task 4: Add The Receipt-Owned Controller Closeout Adapter And Stateless Bytes CLI

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
- Consumes: controller closeout builders/validators plus `validateAndBrandCommittedFinalHostStatus(...)` and `assertValidatedFinalHostStatus(...)` from Task 3, the Task 2 `validateHostTerminalBundleBytes(...)`, and `validateTransportEnvelope(envelope)` from Bootstrap for closeout responses. Artifact invokes Bootstrap `readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30000 })` on the already open `createSecureSshTransport({ native, clock, secretMaterializer })`, passes that same privately branded status plus the exact bundle wrapper to `validateTerminal(...)`, then passes the adapter's later request objects unchanged to that same transport's `.request(...)`. The adapter delegates its committed-state method to Task 3's private-brand issuer and cannot create, clone, or accept a lookalike proof. It never constructs or receives a host/key tuple and never calls `.execute()` or `.requestBootstrap()`.
- Consumes for Task 4 conformance only: Bootstrap `createBootstrapMaintenanceCoordinator({ native, clock })` and Task 10 `createControllerCloseoutStore(...)`; the unchanged Task 2 test helpers invoke only real `runTerminalCloseoutPreflight({ admissionReplayLedger, controllerCloseoutStore })` and `registerPendingLease(...)` before Host composition. The real coordinator alone calls replay `readLedgerIdentity()`/`compactEligible({ expectedLedgerSha256, now, maintenanceCapability })` and closeout `readCompactionPreflight({ protectedNonterminalTransactionIds })`/`compactEligible({ retentionProof, now, maintenanceCapability })`.
- Produces: `createControllerCloseoutAdapter({ runnerMaterialStore, actionsArtifactClient, requestOidcToken, clock })` with exactly these methods: `validateTerminal`, `createNoClaimEvidence`, `cleanupAndReadBackRunnerMaterial`, `toControllerCloseoutInput`, `expectedBindings`, `createUploadStartedRequest`, `validateUploadStartedResponse`, `writeImmutableLocalFile`, `uploadActionsArtifact`, `readBackExactActionsArtifact`, `deleteLocalFileAndReadBackAbsent`, `createAckRequest`, `validateAckResponse`, `createCommittedStatusRequest`, and `validateUploadCommittedObserved`. The dependency surface remains exact: it has no GitHub fetch client, main-source resolver, PR metadata, comparison metadata, Artifact lifecycle registry, credential/OIDC/SSH handle, artifact stream, or transport.
- Bootstrap owns `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs }) -> Promise<Object.freeze({ bytes, sha256 })>`. `timeoutMs` is exactly `30000`; `validatedStatus` must carry Bootstrap's private brand from `validateStatusResponseFrame(...)` and be immutable terminal. The helper fixes the credential ID internally, uses contiguous `TERMINAL_BUNDLE_CHUNK_BYTES: 768` chunks with a maximum of `TERMINAL_BUNDLE_MAX_BYTES: 262144` and `TERMINAL_BUNDLE_MAX_CHUNKS: 342`, validates every complete transport envelope and chunk response before extracting `responseBytes`, enforces the real encoded frame at or below 2,048 bytes, returns one owned canonical bundle Buffer plus its aggregate digest, and does not close the shared transport. Receipt owns no chunk constant, codec, reader, loop, or envelope extraction. Its closed errors are only `terminal_bundle_status_unverified`, `terminal_bundle_status_not_terminal`, `terminal_bundle_transport_failed`, `terminal_bundle_chunk_invalid`, `terminal_bundle_incomplete`, and `terminal_bundle_digest_mismatch`.
- `validateTerminal({ status, terminalBundle, plan, artifactAccepted })` is synchronous and pure. `status` is the unchanged privately branded frozen sixteen-field object returned by Bootstrap `validateStatusResponseFrame(...)`; Artifact must not spread, clone, reconstruct, or append a field to it and passes the same object to `readTerminalBundleBytes(...)`. `terminalBundle` is the exact `{ bytes, sha256 }` returned by that helper. `artifactAccepted` is canonical `null` only when the five-field `artifact_accepted_v1` response may have been lost after durable host acceptance, or the unchanged frozen five-field value returned by Bootstrap `validateArtifactAcceptedFrame(...)`; Receipt never adds an invocation digest to that acknowledgment. The validator requires `status.immutableTerminal === true`, `status.durableRejection === false`, one of the five terminal states, exact transaction/recovery/Gate/deployment-plan/receipt/initial-closeout bindings, a lowercase bundle digest, size in `1..262144`, `terminalBundle.sha256 === status.terminalBundleSha256`, and `terminalBundle.bytes.length === status.terminalBundleSize`.
- `validateTerminal(...)` first requires `status.gateId === plan.gateId`, then calls Task 2 `validateHostTerminalBundleBytes(terminalBundle.bytes, { transactionId: status.transactionId, controllerRecoveryId: status.controllerRecoveryId, productionGateReceiptSha256: plan.productionGateReceiptSha256, deploymentPlanSha256: status.deploymentPlanSha256, terminalBundleSha256: status.terminalBundleSha256, terminalBundleSize: status.terminalBundleSize, terminalReceiptSha256: status.terminalReceiptSha256, closeoutRecordSha256: status.closeoutRecordSha256 })`. It decodes owned bounded copies of the already strict Base64 fields and validates the accepted-plan/accepted-artifact/authorization-reservation/artifact-capability edges plus the Host-recomputed domain-separated transaction invocation binding recorded in the terminal receipt. If `artifactAccepted` is non-null, its exact Gate/plan/transaction/accepted-time selectors must agree; if null, durable terminal/status/receipt evidence remains mandatory and no acknowledgment is synthesized. It returns exactly frozen `{ hostFinalState, transactionInvocationSha256, terminalPublishedAt, terminalBundleSha256, terminalBundleSize, terminalReceiptBytes, terminalRecordBytes, initialHostCloseoutRecordBytes, terminalReceiptSha256, terminalRecordSha256, closeoutRecordSha256, closeoutLeaseSha256, closeoutIndexSha256, backupResult }`. `terminalPublishedAt` is copied only from the canonical terminal receipt parsed by Task 2. The adapter registers the exact return in a module-private `WeakSet`; `toControllerCloseoutInput(...)` accepts only that same reference, so a spread, clone, reordered/extra-key lookalike, or rebuilt time is rejected. The Task 2 validator rechecks every Receipt/outer/initial-closeout/lease/database edge. The adapter validates and discards the owned initial-lease bytes; no path, raw response, bundle bytes, lease bytes, selector, transport, or reader is returned.
- `expectedBindings({ plan })` returns exactly frozen `{ controllerRecoveryId, originalRunId, originalRunAttempt, productionGateReceiptSha256, transactionId, target, releaseUnit, sourceCommit, mainSourceIdentitySha256, mainSourcePrNumber, mainSourceHeadSha, mainSourceMergeCommitSha, deploymentPlanSha256, inventoryReceiptSha256, bootstrapReceiptSha256 }`. It structurally validates and exact-copies the four source-origin fields already present in the validated plan, accepts no authorization/result/source-origin override or digest alias, and is the sole expected value passed to `validateControllerCloseoutBytes` for this run. It does not require `sourceCommit === mainSourceMergeCommitSha` and does not call a live owner resolver.
- `cleanupAndReadBackRunnerMaterial({ plan }) -> Promise<true>` retains the Bootstrap prerequisite's exact method name but accepts exactly that one key and uses only the injected runner store's fixed transaction-bound Receipt handles to remove and read back absent closeout staging/local canonical bytes that are no longer needed. It has no handle or capability for a raw/candidate artifact, deployment/recovery/transition OIDC value, SSH material, artifact input stream, native runtime, or transport. Any unknown closeout handle, partial cleanup, or surviving closeout byte returns no boolean and blocks closeout. `toControllerCloseoutInput({ plan, terminal, runnerCleanupVerified })` accepts exactly those three keys, requires the literal `true` and the same-reference private terminal-result brand, and returns the exact frozen terminal `buildControllerCloseout(...)` input beginning with `preAdmissionDurableRejection: false`, `admissionAccepted: true`, `receiptValid: true`, `controllerComplete: true`, and the validated non-null host state, followed by the single owner binding tuple, `terminalReceiptSha256`, `terminalRecordSha256`, `transactionInvocationSha256`, exact owner `terminalPublishedAt`, the three Buffer byte fields, and `runnerCleanupVerified: true`. In particular it copies `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, and `mainSourceMergeCommitSha` unchanged from `plan`. Lease/index digests remain validation evidence and are not extra controller-closeout input fields. Neither method accepts a path, result override, publication-time override, GitHub response, Artifact lifecycle proof, or resolver result.
- `createNoClaimEvidence({ plan, resultCode, runnerCleanupVerified })` accepts exactly one of `admission_rejected_no_transaction`, `receipt_invalid_no_production_claim`, or `controller_incomplete_no_production_claim` and returns exactly `{ immutable, closeoutBindings }`. It maps that result to the one explicit five-discriminant tuple defined by Task 3 and supplies literal `null` for all seven terminal-evidence inputs; it never omits an optional key. A future Artifact controller may supply the admission result only as the unchanged output of the immediately preceding exact `classifyControllerCloseout({ preAdmissionDurableRejection: true, admissionAccepted: false })` call; Version 1 has no owner brand or producer and never calls that branch. Tests reject a raw admission literal, a transitional status projection, or any caller result override. `immutable` is the complete `{ value, bytes, sha256, artifactName, fileName }` returned by `buildControllerCloseout(...)`, with every host receipt/record/lease field and `terminalPublishedAt` canonical `null` and the same four source-origin fields copied unchanged from `plan`; `closeoutBindings` is the exact `expectedBindings({ plan })` value accepted by `validateControllerCloseoutBytes`. It never returns `null` closeout bytes, never resolves GitHub state, never uploads an original closeout artifact, never permits a host transition, and may be written only as an exact run-attempt-scoped diagnostic/final-status artifact. It creates no fixed tag, Release asset, attestation, Deploy Note, host record, or reservation.
- `createUploadStartedRequest(...)` and `createAckRequest(...)` each first validate the branded immutable and, for ACK, the exact controller-specific observation through `validateControllerCloseoutArtifactObservationWrapper(...)`; only then do they mint one fresh transition-specific OIDC token and return exactly `{ credentialId: "japan-control-plane-github-deploy-v1", requestBytes, timeoutMs: 10000 }`. Neither accepts a repository/name expectation. The Artifact controller passes that object unchanged to `transport.request(...)`.
- `validateUploadStartedResponse({ transportResult, immutable, expected })` and `validateAckResponse({ transportResult, immutable, observation, uploadStartedStatus, expected })` receive the complete transport envelope unchanged, first call Bootstrap-owned `validateTransportEnvelope(transportResult)`, reject every validated failure envelope, and pass only the resulting successful `responseBytes` to `validateStatusResponseFrame(...)`. Each returns its frozen decoded eight-field closeout status plus `responseSha256: sha256Hex(responseBytes)`. ACK validation proves the full second binding and requires its transition binding/JTI/token digests all differ from `uploadStartedStatus`; it does not claim that an independent ordinary status readback occurred.
- `createCommittedStatusRequest({ plan, immutable, observation, ackStatus })` is callable only after exactly one ACK transport attempt and a successful controller-specific immutable/observation validation using owner-derived repository/name. `ackStatus` is either the validated ACK value or canonical `null` when that one request may have committed durably but its response was lost; the controller never resends/replays the ACK. It returns exactly `{ transportRequest, expectedStatus }`, where `transportRequest` is `{ credentialId: "japan-control-plane-github-deploy-v1", requestBytes, timeoutMs: 30000 }` and `expectedStatus` is `{ requestId, gateId, deploymentPlanSha256, transactionId }`. `requestId` is exactly `controller-closeout-final-${immutable.value.originalRunId}-${immutable.value.originalRunAttempt}` and is correlation only; it differs from every pre-closeout poll ID and grants no authority. `requestBytes` comes only from Bootstrap `encodeStatusRequestFrame(expectedStatus)`.
- `validateUploadCommittedObserved({ transportResult, immutable, closeoutBindings, observation, terminal, ackStatus, expectedStatus })` receives a second, independent complete transport envelope unchanged and delegates it plus `readbackAt: clock.now().toISOString()` to Task 3 `validateAndBrandCommittedFinalHostStatus(...)`. That owner first revalidates the fixed repository and deterministic artifact selector, passes only successful `responseBytes` to `validateStatusResponseFrame(responseBytes, expectedStatus)`, preserves the exact Bootstrap ordinary-status reference, requires `requestType: "status"`, exact Gate/deployment-plan tuple, `status.controllerRecoveryId === immutable.value.controllerRecoveryId === closeoutBindings.controllerRecoveryId`, `immutableTerminal: true`, `durableRejection: false`, exact host final state/terminal receipt, exact closeout-bound `terminalPublishedAt`, unchanged `terminalBundleSha256`/`terminalBundleSize`, and `closeoutState: "upload_committed_observed"`, and compares `status.closeoutRecordSha256` with Task 2's deterministic `deriveUploadCommittedCloseoutRecordSha256({ controllerCloseoutBytes: immutable.bytes, observation })`. With non-null `ackStatus`, it also requires the same closeout-record digest; with null it accepts only that independently read durable committed record bound to the exact stable observation. Any manually wrapped earlier private status, `upload_started`, pending, mismatched recovery ID, or absent state fails, and no second ACK is sent. For critical, Bootstrap could issue the nested private status only after consuming Host's same-reference `assertCriticalPostPublicationProof`; for non-critical it uses the frozen owner state matrix and no critical proof. The owner returns exactly branded frozen `{ status, responseSha256: sha256Hex(responseBytes) }`; only that same-reference brand is `validatedFinalHostStatus` for `buildControllerFinalStatus(...)`.
- `readBackExactActionsArtifact({ uploaded, immutable, plan })` derives the sole artifact name from the validated immutable/`expectedBindings({ plan })`, fixes repository to exact `gccwebos-com/proxy-gateway-minimal`, and queries/downloads only that current-run selector. It captures exactly one `readbackAt = clock.now().toISOString()`, builds the complete stable `buildActionsArtifactObservation(...)` wrapper `{ value, bytes, sha256 }`, and immediately calls `validateControllerCloseoutArtifactObservationWrapper({ immutable, closeoutBindings: expectedBindings({ plan }), observation, readbackAt })`; wrong API repository/name fails before any ACK or final-status action. `readbackAt` is not returned or hashed. Repeating this method later for unchanged still-live artifact metadata must reproduce byte-identical observation bytes/SHA. `createAckRequest(...)`, `validateUploadCommittedObserved(...)`, and `buildControllerFinalStatus(...)` receive the first wrapper unchanged.
- `writeImmutableLocalFile(immutable) -> localHandle`, `uploadActionsArtifact({ immutable, localHandle }) -> uploadHandle`, and `deleteLocalFileAndReadBackAbsent(localHandle) -> true` use module-private branded handles. The caller cannot read or provide a path, artifact name, filename, bytes, retention, or archive shape; the adapter derives those from `immutable` and hard-wires one file plus `retentionDays: 35`.
- A closeout `status_response_v1` safe value has exactly the ordered fields `type`, `requestType`, `transactionId`, `closeoutState`, `closeoutRecordSha256`, `transitionBindingSha256`, `oidcJtiSha256`, and `oidcTokenSha256`. Upload-start requires `requestType: "status_closeout_upload_started"` and `closeoutState: "upload_started"`; ACK requires `requestType: "status_closeout_ack"` and `closeoutState: "upload_committed_observed"`. The final three fields are required lowercase SHA-256 only for these two responses, and a normal status response cannot satisfy either closeout validator.
- An ordinary `status_response_v1` safe value has exactly the ordered fields `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `controllerRecoveryId`, `immutableTerminal`, `durableRejection`, `resultCode`, `hostFinalState`, `terminalReceiptSha256`, `closeoutState`, `closeoutRecordSha256`, `terminalBundleSha256`, and `terminalBundleSize`. It fixes `requestType: "status"`; Bootstrap validates and privately brands the exact `{ requestId, gateId, deploymentPlanSha256, transactionId }` request tuple and enforces its terminal/rejection/nullability matrix. `controllerRecoveryId` is host evidence resolved from the accepted plan and never a request selector. Only an immutable terminal has a 64-hex terminal-bundle digest and integer size in `1..262144`; both fields are `null` otherwise. Closeout-specialization token/JTI/binding fields cannot appear in this independent readback.
- A terminal-bundle request has caller input exactly `{ requestId, gateId, deploymentPlanSha256, transactionId, terminalBundleSha256, offset }` and Bootstrap fixes `type: "status_terminal_bundle_chunk"`. Its response has exactly ordered fields `type`, `requestType`, `requestId`, `gateId`, `deploymentPlanSha256`, `transactionId`, `terminalBundleSha256`, `totalBytes`, `offset`, `chunkSha256`, `chunkBytesBase64`, and `eof`, with `type: "terminal_bundle_chunk_v1"`, `requestType: "status_terminal_bundle_chunk"`, raw decoded chunk length at most 768 bytes, and the complete canonical framed response at most 2,048 bytes. The validator expected object is those six request fields plus `totalBytes`; offsets are exact multiples of 768 except the final short chunk, and no more than 342 responses may be consumed. Neither Receipt nor Artifact implements a second encoder, validator, reader, or chunk state machine.
- A fresh mutable `oidcTokenBytes` exists only between `requestOidcToken(...)` and Bootstrap frame encoding. The adapter hashes it for safe reuse comparison, encodes it once, and zeroes the original buffer in `finally`; Bootstrap transport later zeroes `requestBytes`. Neither token nor JTI enters payload bytes, Actions artifacts, logs, summaries, errors, or durable runner state.
- Only a validated terminal `controller_closeout` may call `createUploadStartedRequest` or `createAckRequest`. All three no-claim results reject both methods before OIDC minting and host transport; they may produce only their bounded diagnostic/final-status artifact with no host CAS.
- Receipt never owns a final-status path or write method. Both terminal and no-claim branches return only the unchanged canonical `{ value, bytes, sha256 }` wrapper from `buildControllerFinalStatus(...)` as their pending opaque result; Receipt makes zero `finalStatusSink`, GitHub-output, success, or Deploy Note calls. `runnerCleanupVerified: true` remains only proof that Receipt-owned closeout staging/local canonical bytes are absent; it is never accepted as, converted to, or tested in place of Artifact's full lifecycle absence result.
- Artifact Task 11's CLI is the sole durable-write Gate shared by terminal and no-claim. It must retain the pending wrapper unchanged while performing, in order, `await transport.close()` when a transport exists, destruction plus absence readback of every deployment/recovery/transition OIDC value, close/readback of the raw/replay artifact stream, and `await runnerMaterialStore.lifecycle.finalizeAndReadBackAbsent()`. Only exact literal `true` from that existing Artifact-private branded one-shot permits the CLI to call `finalStatusSink.writeExact({ bytes, sha256 })`, append GitHub outputs, and emit success, all using the same pending wrapper. No transport on a no-claim branch is represented as owner-proven never-created/absent rather than skipped cleanup. Any throw, false/unknown/nonliteral result, repeated call, residue, reordered cleanup, wrapper clone/substitution, or attempt to use `runnerCleanupVerified` leaves all three effects and Deploy Note eligibility at zero. Receipt does not consume or name Artifact's private brand, expose the lifecycle object/result, implement a second callback, or add any lifecycle member/dependency to `createControllerCloseoutAdapter(...)`.
- The full closeout lifecycle exists only as the module API above and is composed by Artifact's production controller inside one Node process. The exact `status`, validated terminal result, immutable wrapper, local/upload handles, Actions observation, ACK status, and final-host proof remain same-reference private `WeakSet`/`WeakMap` capabilities in that process. Neither a workflow step nor a child process can serialize and later recreate any of those brands. `.github/workflows/japan-control-plane-production-deploy.yml` therefore never invokes `scripts/control-plane-controller-closeout.mjs`, and no production or test fixture may claim that separately running `terminal-validate`, `upload-start`, `artifact-readback`, or `upload-ack` can succeed.
- Produces only two stateless byte commands: `closeout-build` and `closeout-validate`. `closeout-build` strict-canonical-parses the exact ordered Task 3 build-input wire object, converts only its three terminal `*Bytes` fields from strict canonical Base64 to owned `Buffer` values, calls `buildControllerCloseout(...)`, and returns only the resulting canonical closeout bytes; the process-local immutable brand is deliberately not serialized. `closeout-validate` accepts only exact canonical `{ controllerCloseoutBase64, closeoutBindings }`, requires strict canonical Base64 and the one `CONTROLLER_CLOSEOUT_BINDING_FIELDS` order, calls `validateControllerCloseoutBytes(...)`, and returns the unchanged validated canonical closeout bytes. No command accepts or returns a terminal/status wrapper, brand, handle, observation, transition request, OIDC value, Actions response, path, or lifecycle continuation token.
- Exports zero-argument `createControllerCloseoutCliOperations()` with exact frozen keys `closeoutBuild,closeoutValidate`. Both values are real module-local closures over the Task 3 canonical builder/validator and the canonical JSON/Base64 foundation. Construction and invocation perform no filesystem access, fetch, clock read, GitHub request, OIDC minting, SSH/transport operation, Artifact mutation, or output action other than the runner's bounded stdout. The factory accepts no dependency, operations object, path, token, URL, fetch function, filesystem adapter, clock, transport, adapter, or command table. The direct-main Environment allowlist is empty.
- The runner accepts exactly one of those two commands and no flag or positional extra, reads at most 262,144 canonical bytes from stdin, and has no caller path. This bound contains the three Task 2-bounded Base64 objects plus every controller-only binding/artifact-policy field; 262,145 bytes fails before parsing or owner calls. On success it writes the one validated canonical closeout byte sequence to stdout with no appended newline and returns `0`. A missing/unknown/duplicate/extra command, including any removed lifecycle command, returns `2` with only `controller_closeout_cli_usage_invalid\n` before reading stdin or Environment. Canonical/owner failures return `1` with only `controller_closeout_cli_failed\n`; stdout remains empty, and neither line can contain raw input, a token, URL, path, host value, exception text, or owner diagnostic.

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

assert.deepEqual(Object.keys(adapter.expectedBindings({ plan })), [
  "controllerRecoveryId",
  "originalRunId",
  "originalRunAttempt",
  "productionGateReceiptSha256",
  "transactionId",
  "target",
  "releaseUnit",
  "sourceCommit",
  "mainSourceIdentitySha256",
  "mainSourcePrNumber",
  "mainSourceHeadSha",
  "mainSourceMergeCommitSha",
  "deploymentPlanSha256",
  "inventoryReceiptSha256",
  "bootstrapReceiptSha256",
]);
assert.notEqual(plan.sourceCommit, plan.mainSourceMergeCommitSha);
assert.equal(
  adapter.expectedBindings({ plan }).mainSourceIdentitySha256,
  plan.mainSourceIdentitySha256,
);

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

Do not mock `readTerminalBundleBytes`, `createCloseoutTransitionBinding`, either Bootstrap transition encoder, `encodeStatusRequestFrame`, `parseHostRequestFrame`, `validateStatusResponseFrame`, or `assertValidatedOrdinaryStatus` in these positive tests; the combined conformance row must round-trip the real Bootstrap reader into the Receipt-owned canonical bundle validator, both real closeout frames, and the real post-ACK ordinary status frame. Add a deterministic two-clock row: read the same immutable artifact once at T1 and again at T2 before expiry, require identical observation `value`/`bytes`/`sha256`, and prove the T2 wrapper matches the host's T1 `upload_committed_observed` digest; at exact expiry reject before ACK/status validation, and with any stable metadata drift reject the expected binding. Independently change the API repository, owner-derived artifact name, valid `controllerRecoveryId`, run, or attempt, and pass spread/frozen/extra-key immutable and observation clones; every row must make zero ACK, committed-status, final-status, or sink calls. In a distinct post-ACK row, keep the real immutable, bindings, observation, terminal, and response otherwise unchanged but replace only the ordinary status with the other syntactically valid recovery ID; require `status.controllerRecoveryId === immutable.value.controllerRecoveryId === closeoutBindings.controllerRecoveryId`, with zero Task 3 brand, final-status bytes, or final sink on mismatch. For `validateUploadCommittedObserved`, pass the real same-reference `terminal` once and require success, then independently pass a spread clone, frozen structural clone, extra-key clone, reordered object, hidden field, symbol field, and accessor; each must fail before `validateTransportEnvelope`, Task 3 brand issuance, final-status construction, or the Artifact-owned sink. Reject one token or JTI reused across transitions, wrong/missing expected closeout digest, observation on upload-start, missing observation on ACK, recovery-challenge audience, wrong workflow path/ref/SHA/Environment, nonzero exit, non-null diagnostic, whole-envelope-as-bytes, wrong response type/request ID, reused pre-closeout poll ID, ordinary-status/closeout-specialization interchange, a post-ACK state other than `upload_committed_observed`, changed terminal-bundle digest/size after ACK, ACK response substituted as final status, a flattened/spread/cloned owner status, and a caller-supplied credential ID/timeout/host/key/repository/artifact-name field. For each imported Host final state, assert `validatedFinalHostStatus` has exact keys `status,responseSha256`, the nested status passes `assertValidatedOrdinaryStatus` by reference, and no proof field is present. Exact-copy the canonical terminal receipt's `terminalPublishedAt` through the privately branded terminal result, `toControllerCloseoutInput`, immutable closeout, committed proof binding, and final-status bytes; a later `clock.now()`, clone, mismatch, unknown field, or replacement with `observedAt` fails before the Artifact-owned sink. The critical row succeeds only through Bootstrap's harness that first consumes Host `assertCriticalPostPublicationProof`; held-lock publication evidence, a Host lookalike, or an individual transitional `terminal_quiescence_pending|terminal_quiescence_rejected` response cannot itself yield a terminal bundle or final status, although bounded polling may later obtain the branded immutable critical terminal. The four non-critical rows never call the Host critical-proof reader. Add one response-loss row in which exactly one ACK request is observed, its response is unavailable, `ackStatus` is null, no retry occurs, and the separate ordinary status succeeds only from durable `upload_committed_observed`; a host still at `upload_started` rejects. Assert no-claim invokes neither terminal-bundle retrieval, OIDC, nor transport and keeps `terminalPublishedAt: null`. For both terminal and no-claim rows, assert the later reconciliation `sourceCommit` differs from `mainSourceMergeCommitSha` while the exact four source-origin fields flow plan -> `expectedBindings` -> controller-closeout bytes -> final-status bytes without a live GitHub call; malformed/missing/extra/reordered/mismatched values fail before the Artifact-owned sink. Receipt's terminal sequence ends at terminal-status/bundle validation -> cleanup/readback -> upload-start request/validated response -> local immutable write -> 35-day upload/readback -> local delete/readback -> exactly one ACK attempt -> independent read-only ordinary status request/committed-state validation -> canonical pending final-status result, with direct sink/output/success counts zero. Artifact alone owns the subsequent lifecycle and durable effects.

Exercise every no-claim result through the exact bytes contract:

```js
const noClaim = adapter.createNoClaimEvidence({
  plan,
  resultCode: "controller_incomplete_no_production_claim",
  runnerCleanupVerified: true,
});
assert.ok(Buffer.isBuffer(noClaim.immutable.bytes));
assert.equal(noClaim.immutable.value.terminalReceiptSha256, null);
assert.equal(noClaim.immutable.value.terminalPublishedAt, null);
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
assert.equal(noClaimFinalStatus.value.terminalPublishedAt, null);
assert.notEqual(
  noClaimFinalStatus.value.sourceCommit,
  noClaimFinalStatus.value.mainSourceMergeCommitSha,
);
for (const field of [
  "mainSourceIdentitySha256",
  "mainSourcePrNumber",
  "mainSourceHeadSha",
  "mainSourceMergeCommitSha",
]) {
  assert.equal(noClaimFinalStatus.value[field], plan[field]);
}
const noClaimPendingResult = Object.freeze({
  resultKind: "no_claim",
  finalStatus: noClaimFinalStatus,
});
assert.deepEqual(Object.keys(noClaimPendingResult), ["resultKind", "finalStatus"]);
assert.equal(noClaimPendingResult.finalStatus, noClaimFinalStatus);

test("Receipt terminal and no-claim results expose no durable-write shortcut", async () => {
  for (const branch of ["terminal", "no_claim"]) {
    const harness = await createReceiptPendingFinalStatusHarness({ branch });
    const pending = await harness.buildPendingResult();
    assert.deepEqual(Object.keys(pending), ["resultKind", "finalStatus"]);
    assert.equal(pending.resultKind, branch);
    assert.deepEqual(Object.keys(pending.finalStatus), ["value", "bytes", "sha256"]);
    assert.equal(Buffer.isBuffer(pending.finalStatus.bytes), true);
    assert.equal(harness.effects.finalStatusSinkCalls, 0);
    assert.equal(harness.effects.githubOutputCalls, 0);
    assert.equal(harness.effects.successCalls, 0);
    assert.equal(harness.effects.lifecycleCalls, 0);
  }
});
```

`createReceiptPendingFinalStatusHarness(...)` runs the real Receipt builders/validators with traps for any lifecycle, final-status sink, GitHub-output, or success call; it does not fake or import Artifact's lifecycle owner. Assert the Receipt adapter exposes neither `writeFinalStatusExact` nor a final-status path/lifecycle method/dependency, and all three no-claim rows use non-null immutable closeout bytes, a `null` observation, a `null` validated final host status, and zero closeout/Actions upload calls. Both terminal and no-claim return only exact frozen `resultKind,finalStatus`, with the same canonical `{ value, bytes, sha256 }` wrapper and zero lifecycle/sink/output/success effects. Artifact Task 11's owner tests, not Receipt tests, must then consume each pending result unchanged through the real CLI lifecycle sequence: transport close or owner-proven never-created, all OIDC destruction/readback, raw/replay artifact-stream close/readback, literal-`true` `runnerMaterialStore.lifecycle.finalizeAndReadBackAbsent()`, exact sink, exact outputs, success. Fault each cleanup stage, false/unknown/nonliteral/repeated finalize, reordering, and pending-wrapper clone/substitution; every fault must keep sink/output/success and Deploy Note eligibility at zero. A lone `runnerCleanupVerified: true` must never advance that Artifact test.

- [ ] **Step 2 (5 min): Add RED isolated-process stateless-bytes CLI tests**

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

Spawn the actual script for `closeout-build` and `closeout-validate`; both must complete through the real direct-main guard from canonical stdin and emit exactly the owner-canonical closeout bytes. Exercise terminal and all no-claim build rows, then feed each output through the validation command with independently supplied exact bindings. Exercise the largest projected controller-closeout fixture permitted by Task 2's per-object decoder and Host aggregate bound, then reject exactly 262,145 stdin bytes before parsing or owner calls. Test unknown/missing/duplicate/extra commands, empty/non-canonical stdin, noncanonical Base64, wrong/reordered/extra bindings, and any serialized status, terminal, immutable wrapper, observation, upload handle, ACK, OIDC, path, token, or lifecycle field. The four removed names `terminal-validate`, `upload-start`, `artifact-readback`, and `upload-ack` must each return usage exit `2` before stdin or Environment is read. Assert the factory arity is zero, its exact frozen keys are `closeoutBuild,closeoutValidate`, both are functions, construction is lazy, and the real direct-main path always constructs that production factory. A runner-only operations fixture may replace exactly those two stateless byte closures to test I/O failure handling; it may not introduce a lifecycle key or stand in for a private capability. For every spawned failure assert exact exit `1` or `2`, empty stdout, one exact bounded safe stderr line, no stack, and sentinel stdin/token/path/URL/host/exception substrings absent from the complete child result. Importing the module must not execute it or set the importing process's exit code.

- [ ] **Step 3 (2 min): Run RED and verify adapter and entrypoint are absent**

```powershell
node --test server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-controller-closeout.test.mjs
```

Expected: the real Bootstrap registration-provider conformance row is green, then `ERR_MODULE_NOT_FOUND` for the adapter or a nonzero child-process exit because the script does not exist.

- [ ] **Step 4 (5 min): Implement pure terminal-bundle-to-Receipt validation and Bootstrap-reader conformance**

Keep the Receipt adapter pure and consume only Bootstrap's exact opaque return:

```js
const validatedTerminalResults = new WeakSet();

function assertValidatedTerminalResult(value) {
  if (!validatedTerminalResults.has(value) || !Object.isFrozen(value)) {
    throw safeCloseoutError("controller_terminal_result_untrusted");
  }
  return value;
}

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
  const result = toValidatedTerminalResult({ validated, status, plan, artifactAccepted });
  validatedTerminalResults.add(result);
  return result;
}
```

`assertValidatedImmutableTerminalStatus(...)` requires the exact sixteen owner fields and byte-equal plan/Gate/deployment-plan/run bindings; it never clones or rebrands the owner value. `assertCanonicalArtifactAcceptedOrLostResponse(...)` accepts only canonical `null` or the exact unchanged five-field Bootstrap validator return, never an embellished acknowledgment; it compares the non-null selectors/time with the terminal receipt but obtains `transactionInvocationSha256` only from the validated host receipt/accepted-plan/artifact/reservation/capability chain. `toValidatedTerminalResult(...)` decodes owned copies from the already strict canonical value, exact-copies `terminalPublishedAt` from the validated terminal receipt, returns only the frozen safe `validateTerminal(...)` shape including that invocation digest/time, and discards the validated owned lease bytes. `toControllerCloseoutInput(...)` calls `assertValidatedTerminalResult(terminal)` before reading any field. Neither internal function is exported. The conformance test obtains `terminalBundle` only by `await readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30_000 })`; Artifact performs exactly that same composition, obtains only the pending final-status wrapper, and owns the outer `finally { await transport.close(); }`. Receipt cannot persist that wrapper or convert `runnerCleanupVerified` into full lifecycle authority.

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

const VALIDATE_UPLOAD_COMMITTED_OBSERVED_FIELDS = Object.freeze([
  "transportResult",
  "immutable",
  "closeoutBindings",
  "observation",
  "terminal",
  "ackStatus",
  "expectedStatus",
]);

function assertExactAdapterOwnKeys(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) {
    throw safeCloseoutError(code);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
      || keys.some((field, index) => typeof field !== "string" || field !== fields[index])) {
    throw safeCloseoutError(code);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) {
      throw safeCloseoutError(code);
    }
  }
}

function validateUploadCommittedObserved(input) {
  assertExactAdapterOwnKeys(
    input,
    VALIDATE_UPLOAD_COMMITTED_OBSERVED_FIELDS,
    "controller_committed_observation_input_invalid",
  );
  const terminal = assertValidatedTerminalResult(input.terminal);
  return validateAndBrandCommittedFinalHostStatus({
    transportResult: input.transportResult,
    immutable: input.immutable,
    closeoutBindings: input.closeoutBindings,
    observation: input.observation,
    terminal,
    ackStatus: input.ackStatus,
    expectedStatus: input.expectedStatus,
    readbackAt: clock.now().toISOString(),
  });
}
```

`createUploadStartedRequest` calls the imported builder with `transition: "upload_started"` and `actionsArtifactObservationSha256: null`; `createAckRequest` calls it with `transition: "upload_committed_observed"` and `observation.sha256` from the validated stable wrapper. Each passes the complete frozen binding wrapper to the Bootstrap frame encoder; no adapter method accepts a value-only binding or appends source-identity aliases. `validateUploadStartedResponse` and `validateAckResponse` receive the complete outer transport envelope, use `requireValidatedTransitionResponse`, byte-compare the full binding, and reject equal transition token/JTI digests. ACK success then authorizes only `createCommittedStatusRequest`; it is not itself the final readback. `validateUploadCommittedObserved` first rejects every missing, extra, reordered, symbol, hidden, accessor, or non-plain input key and then obtains `terminal` only through `assertValidatedTerminalResult(input.terminal)`. It passes that exact same reference, the separate complete outer transport envelope, and one current injected-clock `readbackAt` to Task 3 `validateAndBrandCommittedFinalHostStatus`; only that owner performs ordinary-status parsing, deterministic observation/committed-record binding, response hashing, and private wrapper branding. A spread, clone, extra-key, frozen structural lookalike, or rebuilt terminal therefore fails before envelope parsing or private-brand issuance. The adapter cannot mint or copy the brand. `buildControllerFinalStatus` calls `assertValidatedFinalHostStatus` and rejects every manually wrapped earlier terminal poll even when its nested Bootstrap status is genuine. The adapter's artifact methods enforce the exact filename, one-file archive, `retentionDays: 35`, API archive digest, payload digest, timestamp interval against trusted `readbackAt`, local deletion/readback, and final host-record digest. `readBackExactActionsArtifact` constructs and validates the entire stable observation wrapper once; no controller call extracts the inner value before ACK or final-status construction, and no volatile readback timestamp enters the host binding.

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
  closeoutBindings: adapter.expectedBindings({ plan }),
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
assert.equal(finalStatus.value.terminalPublishedAt, terminal.terminalPublishedAt);
assert.notEqual(finalStatus.value.terminalPublishedAt, finalStatus.value.observedAt);
assert.notEqual(finalStatus.value.sourceCommit, finalStatus.value.mainSourceMergeCommitSha);
for (const field of [
  "mainSourceIdentitySha256",
  "mainSourcePrNumber",
  "mainSourceHeadSha",
  "mainSourceMergeCommitSha",
]) {
  assert.equal(finalStatus.value[field], plan[field]);
}
const terminalPendingResult = Object.freeze({
  resultKind: "terminal",
  finalStatus,
});
assert.deepEqual(Object.keys(terminalPendingResult), ["resultKind", "finalStatus"]);
assert.equal(terminalPendingResult.finalStatus, finalStatus);
```

The tests assert Bootstrap's bundle reader and all three closeout/final-status validators receive complete outer transport envelopes unchanged, and the same stable observation wrapper reaches the one ACK attempt and independent committed-state validation. A separate later readback of identical still-live artifact facts must reproduce that wrapper's canonical bytes/SHA even though its trusted validation time differs. When the ACK response is present, `ackStatus.responseSha256` differs from `validatedFinalHostStatus.responseSha256`; `validatedFinalHostStatus.status` is the unchanged Bootstrap owner reference and cannot be flattened. When the response may be lost after durable commit, `ackStatus` remains exact `null`, no second ACK/OIDC token is minted or sent, and only the later ordinary status may prove `upload_committed_observed`; a returned `upload_started`/pending/mismatch fails closed. The initial terminal status, every bundle chunk, upload-start, one ACK attempt, and post-ACK ordinary status use one controller-lifetime transport; its outer `finally` calls the Bootstrap-owned idempotent `.close()` once before Artifact accepts the pending result. The final digest is the SHA-256 of the exact ordinary `status` response bytes after the ACK attempt, never the ACK response. Receipt returns `terminalPendingResult` with the exact final-status wrapper and performs zero lifecycle/sink/output/success effects. Artifact Task 11's CLI alone retains that wrapper through transport close, all OIDC destruction/readback, raw/replay artifact-stream close/readback, and literal-`true` `runnerMaterialStore.lifecycle.finalizeAndReadBackAbsent()` before its sink persists the exact bytes; only after the sink succeeds may it append outputs or emit success.

- [ ] **Step 6 (5 min): Implement the two-command stateless operations factory and real direct-main dispatcher**

Implement both stateless command closures and the bounded helpers before constructing this exact command table; import the two Task 3 owner wire functions by exact name, and do not leave `closeoutBuildCommand`, `closeoutValidateCommand`, `safeControllerCloseoutCliError`, `readBoundedCanonicalStdin`, `assertExactControllerCloseoutCliOperations`, or `assertBoundedAggregateSafeResponse` unresolved:

```js
import { pathToFileURL } from "node:url";
import {
  buildControllerCloseoutFromCanonicalWireBytes,
  validateControllerCloseoutFromCanonicalWireBytes,
} from "../server/services/deployment/control-plane-controller-closeout.mjs";

const CONTROLLER_CLOSEOUT_OPERATION_KEYS = Object.freeze([
  "closeoutBuild",
  "closeoutValidate",
]);

function safeControllerCloseoutCliError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function readBoundedCanonicalStdin(stdin, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stdin) {
    const owned = Buffer.from(chunk);
    size += owned.length;
    if (size > maximumBytes) throw safeControllerCloseoutCliError("controller_closeout_input_oversized");
    chunks.push(owned);
  }
  if (size === 0) throw safeControllerCloseoutCliError("controller_closeout_input_missing");
  return Buffer.concat(chunks, size);
}

const COMMAND_KEYS = Object.freeze({
  "closeout-build": "closeoutBuild",
  "closeout-validate": "closeoutValidate",
});

function closeoutBuildCommand(requestBytes) {
  return buildControllerCloseoutFromCanonicalWireBytes(requestBytes);
}

function closeoutValidateCommand(requestBytes) {
  return validateControllerCloseoutFromCanonicalWireBytes(requestBytes);
}

function assertExactControllerCloseoutCliOperations(operations) {
  if (operations === null || typeof operations !== "object" ||
      Object.getPrototypeOf(operations) !== Object.prototype || !Object.isFrozen(operations) ||
      Reflect.ownKeys(operations).join(",") !== CONTROLLER_CLOSEOUT_OPERATION_KEYS.join(",")) {
    throw safeControllerCloseoutCliError("controller_closeout_operations_invalid");
  }
  for (const key of CONTROLLER_CLOSEOUT_OPERATION_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(operations, key);
    if (descriptor?.enumerable !== true || descriptor.get !== undefined ||
        descriptor.set !== undefined || typeof descriptor.value !== "function") {
      throw safeControllerCloseoutCliError("controller_closeout_operations_invalid");
    }
  }
  return operations;
}

function assertBoundedAggregateSafeResponse(responseBytes) {
  if (!Buffer.isBuffer(responseBytes) || responseBytes.length === 0 ||
      responseBytes.length > 262_144 || responseBytes.includes(0x0a) ||
      responseBytes.includes(0x0d)) {
    throw safeControllerCloseoutCliError("controller_closeout_response_invalid");
  }
  return Buffer.from(responseBytes);
}

export function createControllerCloseoutCliOperations() {
  return Object.freeze({
    closeoutBuild: async (requestBytes) => closeoutBuildCommand(requestBytes),
    closeoutValidate: async (requestBytes) => closeoutValidateCommand(requestBytes),
  });
}

export async function runControllerCloseoutCli({ argv, stdin, stdout, stderr, operations }) {
  if (argv.length !== 1 || !Object.hasOwn(COMMAND_KEYS, argv[0])) {
    stderr.write("controller_closeout_cli_usage_invalid\n");
    return 2;
  }
  try {
    assertExactControllerCloseoutCliOperations(operations);
    const requestBytes = await readBoundedCanonicalStdin(stdin, 262_144);
    const responseBytes = await operations[COMMAND_KEYS[argv[0]]](requestBytes);
    stdout.write(assertBoundedAggregateSafeResponse(responseBytes));
    return 0;
  } catch {
    stderr.write("controller_closeout_cli_failed\n");
    return 1;
  }
}

export async function main({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  process.exitCode = await runControllerCloseoutCli({
    argv,
    stdin,
    stdout,
    stderr,
    operations: createControllerCloseoutCliOperations(),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

The two imported wire functions are the sole Task 3 definitions specified above; the script does not restate their contracts or codecs. The build wire object has exactly the `CONTROLLER_CLOSEOUT_BUILD_INPUT_FIELDS` order; only `terminalReceiptBytes`, `terminalRecordBytes`, and `initialHostCloseoutRecordBytes` are represented on the wire as strict canonical Base64 strings, with all three non-null only for a terminal row and all three literal `null` for no-claim. The validation wire object has exactly `controllerCloseoutBase64,closeoutBindings`; its Base64 decodes to one owned canonical closeout buffer, and its nested binding keys equal `CONTROLLER_CLOSEOUT_BINDING_FIELDS` in order. Construction verifies both operations and no third. No wire owner or command imports `createControllerCloseoutAdapter`, a GitHub/Actions client, clock, filesystem, OIDC provider, transport, or lifecycle owner. A spawned process can produce or revalidate canonical bytes, but those bytes grant no private brand and cannot resume the module-only lifecycle.

- [ ] **Step 7 (3 min): Run GREEN for adapter sequencing and transition isolation**

```powershell
node --test server/tests/control-plane-bootstrap-maintenance.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs
```

Expected: the real Bootstrap maintenance and registration providers pass Task 2's unchanged consumer contracts, including replay 128/129, closeout 1,024/1,025, protection, crash/reboot, lock, and CAS rows using only true Host final states; the exact adapter surface, same-transport terminal-bundle retrieval, Bootstrap-owned chunk assembler and full transition tuple, two unique OIDC audiences/token/JTI digests, token zeroization, every complete chunk/transition/final-status envelope, fixed `.request(...)` shapes, artifact readback wrapper, Receipt-local cleanup, ACK validation, independent ordinary-status request, preserved owner brand, distinct ACK/final `responseSha256` values, unchanged terminal-bundle binding, committed-record validation, and exact terminal/no-claim pending wrapper all pass with Receipt lifecycle/sink/output/success counts zero; every no-claim/recovery/generic/reused identity row fails before OIDC or mutation. Artifact's separate Task 11 owner suite proves its full lifecycle cleanup and sole durable sink.

- [ ] **Step 8 (3 min): Run GREEN and confirm stateless CLI process isolation**

```powershell
node --test server/tests/control-plane-controller-closeout.test.mjs
```

Expected: both valid stateless commands emit the same canonical closeout bytes with no newline; each removed lifecycle command fails with usage exit `2`, and every rejected row emits no payload, raw token, raw input, or host diagnostic.

- [ ] **Step 9 (2 min): Commit the Receipt-owned adapter and stateless closeout-bytes CLI**

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
- Consumes: canonical serialize/parse/hash helpers plus Task 3 `deriveControllerCloseoutArtifactName`, `adoptControllerCloseoutImmutable`, and `validateControllerCloseoutArtifactObservationWrapper`. Recovery does not construct a second expected repository/name tuple.
- Produces: `computeControllerRecoveryId({ productionGateReceiptSha256, transactionId, target, sourceCommit })`.
- Produces: `parseReceiptRecoveryInputs(input)` with exact-key rejection.
- Produces: `validateOriginalRunAttemptEvidence({ runAttempt, expectedRunId, expectedAttempt, now })`.
- Produces: `classifyOriginalCloseoutArtifact({ hostCloseoutRecord, apiObservation, downloadedPayload, closeoutBindings, originalAttemptEvidence, now })`. The exact original selector is always fixed repository `gccwebos-com/proxy-gateway-minimal` plus `deriveControllerCloseoutArtifactName(closeoutBindings)`; neither field is accepted from `originalAttemptEvidence`, workflow input, or caller expectation. For a present artifact, the classifier first adopts `downloadedPayload` into the Task 3 privately branded immutable using exact `closeoutBindings`, then passes that immutable and the stable observation wrapper to `validateControllerCloseoutArtifactObservationWrapper(...)` with `readbackAt: now.toISOString()`. Only its same-reference return can be compared with the host's committed observation SHA.
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

Also reject incomplete pagination, multiple owner-derived exact-name artifacts, archive with zero/two files, wrong archive member name, wrong fixed repository, wrong API artifact name, wrong API `sha256:` digest, wrong canonical payload SHA, interval below 35 days, and any call to a repository retention-settings URL. Use `const controllerRecoveryId = "cr1." + "a".repeat(64);` and one syntactically valid wrong `"cr1." + "b".repeat(64)`; independently drift the binding ID, canonical value ID, immutable name, observation name, repository, and archive member. Spread/frozen clones and extra-key immutable/observation wrappers also reject. Every negative row must produce zero `present_exact` classifications, recovery host requests, recovered envelopes, Release reads/writes, or publication eligibility.

Add the committed-state reproducibility regression: create H1 from one exact immutable artifact at T1, persist only H1 in an `upload_committed_observed` host record, rebuild the observation from byte-equal API metadata/archive/payload at later T2, and require H2 byte-equal H1 plus `present_exact`. The positive row proves `immutable.artifactName === immutable.value.artifactPolicy.artifactName === apiObservation.value.artifactName === deriveControllerCloseoutArtifactName(closeoutBindings)` and exact fixed repository. Repeat at `T2 === expiresAt` and require `invalid_no_claim`; change each stable identity field in turn and require mismatch/`invalid_no_claim`. The test must fail if `readbackAt` is reintroduced into the canonical value or digest, or if classifier input regains a caller-reported repository/name.

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

For a present artifact, require `apiDigest` form `sha256:<hex>`, `createdAt <= now < expiresAt`, a minimum 35-day `created_at`/`expires_at` interval, exact fixed repository/run/owner-derived-name/payload bindings, complete archive download, and canonical payload validation. Adopt the canonical payload into the Task 3 immutable before building/validating the observation identity; exclude `now`/`readbackAt`, so the same still-live immutable artifact reproduces the host-ACKed canonical bytes/SHA. For absence, derive the same name from exact `closeoutBindings`, require complete pagination of that exact run artifact query and the already validated attempt age. Never call or accept repository retention configuration, caller repository, or caller artifact name as evidence.

- [ ] **Step 4 (3 min): Run GREEN plus complete boundary matrix**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: all input, age, conclusion, metadata, archive, stable-observation-reproduction, and state-table rows pass; a later valid readback of the host-committed artifact remains `present_exact`, exact-expiry and stable-field drift fail closed, and the mocked fetch log contains no artifact-retention-settings endpoint.

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
- Preflight consumes without copying from Artifact's `control-plane-github-evidence.mjs` only `readEnvironmentPolicy` and stores its canonical `vultr-japan-production` user-only policy bytes plus SHA-256 in the data-only packet. Protected authorization is not repository code: the workflow consumes Artifact Task 7 Step 6a extension's frozen SHA export, zero-argument fixture, and exact rendered authority-step wrapper. The repository recovery controller consumes Task 6 base's `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT` only for local canonical data validation; it never calls Task 6's token/fetch live-refresh parser. The extension-owned `authorityControlBytes` body implements the exact policy/approval-history/user and current-run-attempt semantics without a checkout/import or second mutable parser.
- Produces: `buildRecoveryChallengeRequest(context)`, `buildRecoveredCloseout(input)`, `buildRecoveryAttemptNoClaim(input)`, and `validateRecoveredCloseoutBytes(bytes, bindings)`. Challenge/status byte validation remains owned by the imported host protocol.
- Produces: `recoverReceipt({ preflight, transport, requestOidcToken, parserRegistry, currentBindings, clock })` for dependency-injected orchestration. The controller-owned `clock` exposes exactly `now()`, `monotonicNow()`, and `sleep(milliseconds)`; polling fixes 5,000-millisecond intervals, one immutable `pollDeadline = pollStartedAt + 30000`, and a literal request loop `for (let pollIndex = 0; pollIndex < 6; pollIndex += 1)` for only indices `0..5`. The exact 30,000-millisecond seventh schedule slot is a separate no-request closure branch after that loop. Before each scheduled request it recomputes a strictly positive `pollDeadline - monotonicNow()`, requires any nonzero sleep to reach its requested monotonic target, clamps the request timeout to the smaller of the owner 30,000-millisecond cap and that remainder, and rechecks the monotonic clock after every fulfilled or rejected transport operation. After a nonterminal loop outcome it enters the separate boundary once, sleeps at most the original remaining interval, performs no request regardless of early wake/stall, and returns no-claim with exact `pollClosureReason: "deadline_reached"|"scheduler_stalled"` plus truthful `deadlineReached`. A response that completes at or after the deadline is never parsed into terminal authority. Early wake, stalled sleep, six exhausted request indices, or a timeout-ignoring transport therefore cannot create index 6, extend the deadline, or enter the bundle reader.
- Produces in the workflow-only script: `createRecoverySecretMaterializer({ env, expectedCredential, clock })` whose only public method is `materializeFixedCredential(credentialId)`. `expectedCredential` is the exact aggregate-safe current authorization/bootstrap/known-host/expiry tuple already validated from protected preflight evidence; the constructor does not touch protected values. The method accepts only `DEPLOY_CREDENTIAL_ID`, reads the five fixed protected Environment values once, constructs one ordinary exact eleven-field `material`, derives/asserts the real four-field known-host binding, creates the sole branded exact-eight-field `expectation`, validates both through the real Bootstrap exports, and returns exactly frozen `{ material, expectation }`. Bootstrap invokes it only after a fully true capability probe, seals/captures that wrapper once, zeroes the materializer-owned Buffers in the capture operation's outermost `finally`, gives every actual request/bundle-stream operation a fresh non-aliased clone, zeroes/closes each clone in its operation `finally`, and zeroes/closes retained originals in the controller's outer `finally`/idempotent `.close()`. The workflow controller never invokes the materializer directly. The returned materializer has no `materializeDeploy`, `materializeBootstrap`, close, dispose, host, key, known-hosts, seed, or clone property.
- Produces exactly four public workflow-only commands: `preflight`, `recover`, `validate-result`, and `cleanup`. `preflight` emits only one LF-terminated `preflight_artifact_name` line and one LF-terminated `preflight_sha256` line; `validate-result` emits only `result_kind`, `result_artifact_name`, and `producing_run_attempt` as the same bounded injection-safe line format. The CLI owns validation/ordering and writes those lines only to stdout. The frozen workflow, not the CLI, appends that stdout to its runner-provided `$GITHUB_OUTPUT`; both commands use one exact quoted redirection, and the preflight step first requires the path to be an existing non-symlink regular file. Unknown, missing, duplicate, or extra commands/flags are rejected before env/fs/fetch/transport access. No repository command performs Environment authorization.
- Exports zero-argument `createReceiptRecoveryCliOperations()` with the exact frozen function keys `preflight`, `challenge`, `recover`, `createPostRecoveryStatus`, `statusPoll`, `bundle`, `finalize`, `validateResult`, and `cleanup`. These are real module-local handlers over exact owner imports, not inert exports. The public `recover` command first strict-decodes the bounded canonical approval-proof bytes, using Foundation's `parseCanonicalJsonBytes`/`serializeCanonicalJsonBytes`/`sha256Hex` with Artifact Task 6's exact `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT`, and verifies their separately supplied lowercase SHA-256, owner canonical round trip, expiry, and Receipt-owned packet/policy/run/attempt/ref/SHA/reviewer bindings before its first protected-environment property read. This is a local data check: it never calls `parseValidateAndRefreshArtifactPublicationApprovalProof`, never performs Environment/policy/approval/user/current-master authorization reads, and cannot mint, refresh, reconstruct, or accept a caller-shaped proof. The two serialized values were emitted by the workflow's absolute `steps[0]` fixed-inline Artifact owner and cross the process boundary only as data; no private object identity or brand crosses GitHub steps. It then invokes the internal fixed chain `challenge -> recover -> createPostRecoveryStatus -> statusPoll -> bundle -> finalize` in one process; `createPostRecoveryStatus` and `statusPoll` repeat only as the frozen owner loop permits. None of those six internal handler names is a separately spawnable CLI command, because splitting them would destroy the required one-transport custody lifetime.
- The zero-argument factory fixes the GitHub read client, OIDC requester, system clock, native capability provider, `createRecoverySecretMaterializer`, `createSecureSshTransport`, owner codecs/validators, and one `createRecoveryRunnerStore()` rooted only at the non-hidden `control-plane-recovery-runner-temp`. It accepts no dependency, token, URL, path, fs/fetch/transport function, clock, credential ID, command table, or operations override. Factory construction is lazy. The runner store creates the root as a private non-symlink directory, creates only the enumerated preflight/result/subject/predicate files exclusively at mode `0600`, fsyncs and exact-readbacks them, and rejects traversal, aliases, directories, globs, hard/symbolic links, a second file, mode drift, oversize bytes, noncanonical bytes, or credential-shaped content.
- The workflow CLI constructs `createSecureSshTransport({ native, clock, secretMaterializer })` exactly once inside the public `recover` operation and passes that same object through the six internal handlers, challenge, recovered-selector, bounded ordinary-status polling, and one terminal-bundle stream. Only the transport may call `secretMaterializer.materializeFixedCredential(...)`, retain the fixed protected tuple, or create a fresh internal clone. The shared transport validates the exact `{ material, expectation }` producer ABI, seals connection/key/known-host/request bytes in anonymous descriptors, uses its compiled OpenSSH executable/environment IDs, returns bounded anonymous response bytes, discards raw diagnostics, and closes/zeroes every actual operation handle. The CLI calls only the transport's idempotent `.close()` in outer `finally`; it defines no competing credential dispose, clone, or zeroization path.
- Direct-main env access is command-specific and closed. `preflight` reads only `GITHUB_TOKEN`, the four dispatch values, and fixed GitHub repository/actor/triggering-actor/run/attempt/ref/SHA identity. `recover` receives only `RECOVERY_APPROVAL_PROOF_BASE64` and `RECOVERY_APPROVAL_PROOF_SHA256` from the fixed-inline authority step plus its step-scoped `GITHUB_TOKEN` and, only after strict owner parsing/digest/context validation, reads exactly the five `JAPAN_CONTROL_DEPLOY_*` protected values and fixed bootstrap/authorization variables already listed below, deleting protected values at materialization. `validate-result` and `cleanup` read no token or protected value. Repository GitHub fetch is limited to the original run-attempt and bounded Actions artifact endpoints; Environment policy, current approval history, current `/users/{login}`, and current run-attempt authorization reads belong only to the preceding Artifact-owned inline step. OIDC uses only the fixed Actions runner request URL/token inside `recover` after proof validation. No public command accepts stdin, a path, host tuple, URL, token, response, fetch function, fs adapter, transport, or output-file selector.
- `runReceiptRecoveryCli(...)` returns `0` only after its command's exact fsync/readback or cleanup/postcondition; returns `2` with only `receipt_recovery_cli_usage_invalid\n` for argv faults before any port access; and returns `1` with only `receipt_recovery_cli_failed\n` for every owner, env, fs, fetch, OIDC, capability, transport, bundle, finalization, or cleanup failure. Stdout is empty on failure and otherwise contains only the command's bounded fixed safe GitHub-output lines. The real `pathToFileURL` direct-main guard constructs the fixed factory and assigns only the returned `0/1/2` to `process.exitCode`; import alone performs no action.

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

test("post-recovery polling never sends a seventh request under clock or transport faults", async () => {
  for (const fault of [
    "early_wake",
    "stalled_sleep",
    "transport_ignores_timeout",
  ]) {
    const harness = createRecoveryPollingFaultHarness({ fault });
    const result = await recoverReceipt(harness.input);
    harness.assertNotTerminalNoClaim(result, "recovery_not_terminal_no_claim");
    assert.ok(harness.ordinaryRequests.length <= 6);
    assert.deepEqual(
      harness.ordinaryRequests.map(({ pollIndex }) => pollIndex),
      harness.ordinaryRequests.map((_, pollIndex) => pollIndex),
    );
    assert.equal(
      harness.ordinaryRequests.some(({ pollIndex }) => pollIndex === 6),
      false,
    );
    assert.equal(harness.boundaryRequests, 0);
    assert.equal(harness.bundleCalls, 0);
    assert.equal(harness.publicationCalls, 0);
    const originalDeadline = harness.pollStartedAt + 30_000;
    for (const { requestedAt, timeoutMs } of harness.ordinaryRequests) {
      assert.ok(requestedAt < originalDeadline);
      assert.equal(timeoutMs, Math.min(30_000, originalDeadline - requestedAt));
      assert.ok(requestedAt + timeoutMs <= originalDeadline);
    }
    for (const { requestedAt, milliseconds } of harness.sleepCalls) {
      assert.ok(requestedAt + milliseconds <= originalDeadline);
    }
    assert.equal(harness.latestScheduledBoundary, originalDeadline);
    assert.equal(harness.deadlineReassignments, 0);
  }
});
```

`createRecoveryPollingFaultHarness` uses the real recovery request/frame builders and validators. It decodes each ordinary request ID back to its numeric suffix, records the monotonic request time and supplied timeout, records every requested sleep target, and traps `requestStatusBundle` plus all publication ports. `early_wake` returns normally before the requested scheduled target, `stalled_sleep` returns with an unchanged monotonic clock, and `transport_ignores_timeout` returns an otherwise valid immutable terminal only after the supplied timeout and original deadline. The harness exposes no clock/deadline mutation hook; `deadlineReassignments` is derived by rejecting any second poll-window origin or any request/sleep horizon beyond the one captured `pollStartedAt + 30000`.

Reject stale/HMAC-invalid challenge, wrong recovery/original/new run tuple, wrong repository/owner/event/Environment/runner/workflow path-ref-SHA, wrong source/bootstrap/controller/parser digest, rotation fence, old key generation, wrong OIDC audience, zero/two retained selectors, missing parser, terminal digest mismatch, and any response claiming a host mutation. Prove `validateRecoveredStatusResponse` returns a distinct private brand: direct use with `assertValidatedOrdinaryStatus` or `readTerminalBundleBytes`, and any spread/clone passed to `createPostRecoveryStatusRequest`, rejects before a bundle stream. The real helper must return exact `{ requestBytes, expected }` and exact expected keys `requestId,gateId,deploymentPlanSha256,transactionId`.

Run preflight through Artifact Task 6's real `readEnvironmentPolicy` owner and protected authorization through Artifact Task 7 Step 6a extension's exact zero-argument inline fixture. Preflight canonicalizes `vultr-japan-production` without approval/user/secret/OIDC/host access. Assert each protected job's raw `steps[0]` is byte-for-byte its extension-owned `recoverAuthorityStepBytes` or `publishAuthorityStepBytes` wrapper and matches the corresponding step SHA before any eligibility callback; each parsed wrapper script contains `authorityControlBytes` once plus one explicit awaited invocation. Then require two byte-equal fresh policy reads around one exact same-run approval-history read, one current attempt read, and one `/users/{normalizedLowerLogin}` read. Accept exactly one stable-ID/lower-login user approval that matches policy and differs from both actor identities. The authority step emits exactly `approval_proof_base64` and `approval_proof_sha256`: strict canonical Base64 of owner-canonical context-bound proof bytes and the lowercase SHA-256 of those decoded bytes. Table-drive Team/unknown policy, omitted/true bypass, false self-review prevention, branch/policy drift, zero/two approvals, reviewer replacement, self approval, login/ID/type/slug drift, wrong repository/run/attempt/ref/SHA/event/workflow, stale attempt, redirect/partial/oversize/malformed results, any parsed-equivalent/raw-different wrapper, and any step/action inserted before authority. Every failure leaves checkout/download/setup, protected/variable getters, OIDC, native, SSH/materializer, proof sink, eligibility callback, and host calls at zero. Repository `recover` strict-decodes the pair in its independent process with Foundation canonical JSON primitives and Artifact Task 6's contract, then revalidates the digest, canonical round trip, expiry, and exact current context bindings before protected access; it never calls the token/fetch live-refresh parser. Missing/partial/noncanonical Base64, digest drift, decoded key/field/value/order drift, extra/hidden/symbol/accessor input, expired proof, or any context mismatch fails before protected access; no WeakSet, same-reference check, or private brand crosses the step boundary.

Use a constructor/transport spy to assert one `createSecureSshTransport(...)`, exact public method order `execute,request,requestStatusBundle,requestBootstrap,close`, a variable bounded number of `.request(...)` calls on that same object, exactly one helper-owned `.requestStatusBundle(...)` only after an immutable ordinary-status brand, and one `.close()` in `finally`. Every direct request object contains only `credentialId`, bounded canonical `requestBytes`, and its owner timeout; challenge/recovery use 10 seconds and ordinary status uses 30 seconds. Assert the first request decodes only as `status_recover_challenge`, the second only as `status_recover`, later direct requests only as exact ordinary `status`, every complete result first passes `validateTransportEnvelope`, and only successful `responseBytes` reaches its exact host-protocol validator. `requestStatusBundle` is one 30-second authenticated bounded session whose private consumer sees one through 342 frames; it is never called once per chunk. Assert no call object contains `host`, `port`, `user`, `privateKey`, `privateKeyBytes`, `knownHosts`, `knownHostsBytes`, `command`, `executable`, `path`, `fd`, `sshOptions`, or `proxy`.

For every imported Host `HOST_FINAL_STATES` value, assert the exact recovered result and validate the owner-branded ordinary status plus exact Receipt bundle before envelope construction. The four non-critical rows perform no Host critical-proof read. For critical, feed both `terminal_quiescence_pending` and transaction-bound `terminal_quiescence_rejected` across zero, one, and the maximum six permitted request indices, then a real Host-proof-backed immutable status; verify fresh correlation IDs only for indices `0..5`, one immutable `pollStartedAt + 30000` monotonic deadline, no deadline refresh, and one subsequent bundle session only for a response completed strictly before it. Record every sleep/request clock sample and require strictly positive remaining time immediately before each, with every request timeout exactly `Math.min(30000, deadline - beforeRequest)`. Add independent `early_wake`, `stalled_sleep`, and `transport_ignores_timeout` faults plus boundary rows at 29,000 milliseconds with 999/1,000/1,001 milliseconds response latency. Each fault must produce at most six requests, no request ID/index 6, zero bundle/publication calls, and no timeout/sleep target beyond the original deadline. The exact-30,000-millisecond seventh schedule slot is exercised only through the separate closure branch and records zero requests. A response completed at 29,999 milliseconds may validate; completion at exactly 30,000 or later, a timeout that reaches the deadline, the timeout-ignoring late response, and a sleep that returns before its requested target all produce only `recovery_not_terminal_no_claim`, with zero response parsing into terminal authority, bundle read, or publication. At/after the deadline either still-transitional result likewise produces only `recovery_not_terminal_no_claim`; none becomes `recovery_receipt_invalid_no_claim` or `admission_rejected_no_transaction`. Only an actual timely immutable bundle that reaches Receipt validation and fails produces `recovery_receipt_invalid_no_claim`. Exercise bundle sizes 1, 768, 769, and exactly 262,144 bytes, including exactly 342 frames; 0, 262,145, a 343rd frame, early/late EOF, digest drift, or selector drift rejects. For nonterminal or invalid bytes, assert one `recovery_attempt_no_claim` envelope and prove it has no `tag`, `assetName`, `attestation`, `deployNote`, or publication eligibility field set true. Retain the normal closeout ACK-loss row from Task 4 in the combined suite: recovery never sends or replays ACK.

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

Add isolated child-process coverage for the repository recovery script itself. Assert `createReceiptRecoveryCliOperations.length === 0`, its exact nine-key surface is frozen and lazy, and every key is a function. Spawn/import the runner in a fresh Node process with one closed fixture operations object to execute successful `preflight`, the public `recover` pipeline with the unchanged owner-fixture `approval_proof_base64`/`approval_proof_sha256` pair, `validate-result`, and `cleanup`; record the internal recover-handler order exactly as `challenge,recover,createPostRecoveryStatus,statusPoll,bundle,finalize`, prove every handler shares the same transport reference, and prove outer-finally close runs once on success and every injected failure. A missing half, noncanonical Base64, digest mismatch, decoded structural rebuild, extra/reordered/hidden/symbol/accessor input, expired proof, or context-bound field drift fails before the first protected getter. Separately spawn the actual direct script to exercise its real `pathToFileURL` guard for missing/unknown/duplicate/extra commands and missing fixed Environment. Run the exact committed preflight shell body against a runner-harness-created mode-`0600` non-symlink regular `$GITHUB_OUTPUT`, not an in-memory fake: require exit zero, empty stderr, exact output key order `preflight_artifact_name,preflight_sha256`, one line per key, owner-derived safe values, and downstream step-output resolution. Repeat with missing, directory, symlink, newline/control-bearing value, duplicate/extra key, and nonzero CLI rows; each must leave the output file unchanged and make upload eligibility zero. Keep the existing real `validate-result >> "$GITHUB_OUTPUT"` harness and assert its three exact keys remain unchanged. Require exit `2` for usage before any fixture port call, exit `1` for operation failure, exact bounded stderr, empty failure stdout, and no sentinel token/private-key/known-host/host/path/URL/raw response/exception/stack substring anywhere in child stdout, stderr, or generated files. Import-only must leave fs/fetch/transport call counts and the parent `process.exitCode` unchanged.

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
    const pollDeadline = pollStartedAt + 30_000;
    let ordinaryStatus = null;
    let deadlineReached = false;
    for (let pollIndex = 0; pollIndex < 6; pollIndex += 1) {
      const scheduledAt = pollStartedAt + (pollIndex * 5_000);
      const beforeSleep = clock.monotonicNow();
      const remainingBeforeSleep = pollDeadline - beforeSleep;
      if (remainingBeforeSleep <= 0) {
        deadlineReached = true;
        break;
      }
      const sleepFor = Math.min(
        Math.max(0, scheduledAt - beforeSleep),
        remainingBeforeSleep,
      );
      if (sleepFor > 0) {
        await clock.sleep(sleepFor);
        if (clock.monotonicNow() < Math.min(scheduledAt, pollDeadline)) {
          break;
        }
      }
      const beforeRequest = clock.monotonicNow();
      const remainingBeforeRequest = pollDeadline - beforeRequest;
      if (remainingBeforeRequest <= 0) {
        deadlineReached = true;
        break;
      }
      const postRecovery = createPostRecoveryStatusRequest({
        validatedRecoveredStatus,
        requestId: derivePostRecoveryRequestId(preflight, pollIndex),
      });
      let ordinaryTransportResult;
      try {
        ordinaryTransportResult = await transport.request({
          credentialId: DEPLOY_CREDENTIAL_ID,
          requestBytes: postRecovery.requestBytes,
          timeoutMs: Math.min(30_000, remainingBeforeRequest),
        });
      } catch (error) {
        if (clock.monotonicNow() >= pollDeadline) {
          deadlineReached = true;
          break;
        }
        throw error;
      }
      if (clock.monotonicNow() >= pollDeadline) {
        deadlineReached = true;
        break;
      }
      const ordinaryEnvelope = validateTransportEnvelope(ordinaryTransportResult);
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
      const beforeDeadlineBoundary = clock.monotonicNow();
      const remainingBeforeDeadlineBoundary = pollDeadline - beforeDeadlineBoundary;
      if (remainingBeforeDeadlineBoundary > 0) {
        await clock.sleep(remainingBeforeDeadlineBoundary);
      }
      const boundaryObservedAt = clock.monotonicNow();
      deadlineReached = boundaryObservedAt >= pollDeadline;
      const pollClosureReason = deadlineReached
        ? "deadline_reached"
        : "scheduler_stalled";
      return buildRecoveryAttemptNoClaimFromStatus({
        preflight,
        validatedRecoveredStatus,
        ordinaryStatus,
        deadlineReached,
        pollClosureReason,
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

`derivePostRecoveryRequestId(preflight, pollIndex)` is module-private and returns exactly `receipt-recovery-final-{recoveryRunId}-{recoveryRunAttempt}-{pollIndex}` after validating numeric run/attempt and integer `0..5`; index 6 is invalid and can never be encoded or sent. `buildRecoveryAttemptNoClaimFromStatus` exact-validates `validatedRecoveredStatus`, accepts `ordinaryStatus` only as canonical `null` or the most recent timely same-transaction Bootstrap-private transitional status, and requires exact `pollClosureReason,deadlineReached` consistency from the separate no-request boundary: `deadline_reached,true` or `scheduler_stalled,false`, with no other value or cross-pair accepted. Both closure rows map only to `recovery_not_terminal_no_claim`; a scheduler stall is fail-closed and cannot manufacture a reached deadline, while neither row permits another request, a bundle read, or publication. A timely `terminal_quiescence_pending`/transaction-bound `terminal_quiescence_rejected` that remains transitional at the boundary, a request timeout that reaches the deadline, or a transport response completed at/after the deadline likewise returns not-terminal no-claim and never becomes admission rejection/receipt invalid. Only an actual immutable terminal and bundle both admitted through their timely owner gates may produce `recovery_receipt_invalid_no_claim` after Receipt validation fails. `classifyRecoveredBundle` first requires the exact ordinary-status owner brand again, byte-compares the recovered selector to the ordinary status and bundle, resolves the retained schema through the current parser registry, and iterates only imported Host `HOST_FINAL_STATES`. It never receives a Host proof object: the critical state is possible only because Bootstrap issued the ordinary brand after Host `assertCriticalPostPublicationProof`.

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

After the host read, the protected job repeats the exact Actions run-attempt/artifact query and byte-compares its stable metadata/payload facts with the preapproval evidence; it downloads and validates a present artifact again. Each read uses its current trusted clock only to prove the artifact is still live, while both derive the same stable observation bytes/SHA. Any stable-field change, newly ambiguous, expired, deleted, or mismatched observation fails closed. `buildRecoveredCloseout` accepts only `present_exact` or `absent_proved`, the exact validated terminal bundle, the unchanged Bootstrap ordinary-status brand bound to that bundle, and one of the five recovered results. For critical, that brand exists only downstream of Host `assertCriticalPostPublicationProof`; the Host capability itself and all proof fields remain nonserializable and absent from recovered bytes. It binds both workflow runs/attempts, old native conclusion and `updated_at`, the original transaction source/target commit, host terminal receipt digest, original artifact classification/evidence, current parser/bootstrap/controller identity, and the current recovery workflow path/ref/SHA/source commit/run/attempt as a separate attester identity. It never equates the original transaction target with the current recovery workflow source.

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

`readFixedDeployMaterialAndDeleteEnvironment` accepts only `JAPAN_CONTROL_DEPLOY_HOST`, `JAPAN_CONTROL_DEPLOY_PORT`, `JAPAN_CONTROL_DEPLOY_USER`, `JAPAN_CONTROL_DEPLOY_PRIVATE_KEY`, and `JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS`; validates the protected user as `github-control-deploy`; parses the endpoint/known-host tuple through Bootstrap's real parser; deletes all five properties in its own `finally`; and has no exported surface. `expectedCredential` has exactly `authorizationGeneration`, `bootstrapReceiptSha256`, `knownHostsFingerprint`, `knownHostsTupleSha256`, and `expiresAt`, all derived from already validated current protected preflight evidence rather than caller input or duplicated Environment aliases. The CLI passes the public materializer into one `createSecureSshTransport`, never calls `materializeFixedCredential` itself, and in its outer `finally` calls only `transport.close()`. Tests assert `Object.keys(secretMaterializer)` is exactly `["materializeFixedCredential"]`, every capability false/unknown before phase one produces zero materializer/Environment reads, and the single returned capture has exact keys `material,expectation`. The material exact-matches Bootstrap's eleven-field order; the expectation is the sole branded exact-eight-field value from `createFixedCredentialExpectation`; real binding assertion and branded validation both pass. Bootstrap zeroes the producer Buffers after one sealed capture, creates one distinct fresh non-aliased clone for every actual challenge, selector, ordinary-status request index `0..5`, and terminal-bundle operation, zeroes/closes every operation clone independently, and zeroes/closes retained originals on outer close. The no-request deadline boundary creates no credential clone. A second materializer call and any non-fixed credential ID reject before Environment access.

The CLI writes canonical aggregate-safe preflight/result files, fsyncs and reads them back, then returns only fixed validated name/digest/classification lines to stdout. The frozen workflow is the sole `$GITHUB_OUTPUT` sink: it appends the exact preflight lines only after checking the runner-provided path is an existing non-symlink regular file, while the already fixed `validate-result >> "$GITHUB_OUTPUT"` command retains its tested safe-line redirection. Neither CLI operation reads a caller output path or opens an output file. On the same sealed-descriptor transport it performs challenge, recovered selector, one through at most six freshly correlated ordinary-status requests from literal indices `0..5` under the one absolute deadline, then enters a separate 30-second seventh schedule boundary that performs no request. An early wake, stalled sleep, exhausted request budget, or timeout-ignoring late response returns only no-claim without extending that deadline or opening a terminal-bundle session; exactly one bundle session is possible only after a timely immutable terminal. It requests challenge-audience OIDC only after challenge validation and calls that transport's idempotent close exactly once in the controller's outer `finally`. Bootstrap's capture `finally` zeroes the producer-owned original Buffers, each actual operation `finally` zeroes/closes its own fresh clone, and outer close zeroes/closes/readbacks the retained originals. The CLI proves the exact prohibited linked secret paths absent in both internal cleanup and the workflow `cleanup` command.

Implement the real operations factory, runner, and direct-main guard in the same script. Every helper referenced by the factory is either an exact named owner import or a tested module-private definition; the source may not contain a declared-but-unimplemented handler:

```js
import { pathToFileURL } from "node:url";

const PUBLIC_RECOVERY_COMMANDS = Object.freeze([
  "preflight",
  "recover",
  "validate-result",
  "cleanup",
]);

export function createReceiptRecoveryCliOperations() {
  const clock = createSystemRecoveryClock();
  const runnerStore = createRecoveryRunnerStore();
  return Object.freeze({
    preflight: (context) => runFixedRecoveryPreflight({ ...context, clock, runnerStore }),
    challenge: (context) => requestFixedRecoveryChallenge({ ...context, clock }),
    recover: (context) => requestFixedRecoveredSelector({ ...context, clock }),
    createPostRecoveryStatus: (context) => createFixedPostRecoveryStatus({ ...context, clock }),
    statusPoll: (context) => pollFixedPostRecoveryStatus({ ...context, clock }),
    bundle: (context) => readAndValidateFixedRecoveryBundle({ ...context, clock }),
    finalize: (context) => finalizeFixedRecoveryResult({ ...context, clock, runnerStore }),
    validateResult: (context) => validateFixedRecoveryResult({ ...context, runnerStore }),
    cleanup: (context) => cleanupFixedRecoveryMaterial({ ...context, runnerStore }),
  });
}

export async function runReceiptRecoveryCli({ argv, env, stdout, stderr, operations }) {
  if (argv.length !== 1 || !PUBLIC_RECOVERY_COMMANDS.includes(argv[0])) {
    stderr.write("receipt_recovery_cli_usage_invalid\n");
    return 2;
  }
  try {
    assertExactReceiptRecoveryCliOperations(operations);
    const safeLines = await runFixedPublicRecoveryCommand({
      command: argv[0],
      env,
      operations,
    });
    if (safeLines.length > 0) stdout.write(assertBoundedSafeRecoveryOutput(safeLines));
    return 0;
  } catch {
    stderr.write("receipt_recovery_cli_failed\n");
    return 1;
  }
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  process.exitCode = await runReceiptRecoveryCli({
    argv,
    env,
    stdout,
    stderr,
    operations: createReceiptRecoveryCliOperations(),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

`runFixedPublicRecoveryCommand` implements `preflight`, `validate-result`, and `cleanup` as one matching operations call each. Its `recover` branch first strict-decodes the absolute-step-zero canonical proof bytes, verifies the separately supplied digest and owner canonical/context contract in this process, then creates exactly one private session and invokes the six fixed handlers in order on that same session. It enters the session's outer `try/finally` before the first host request; `finalize` is always reached with the current safe outcome/failure state, closes the same transport exactly once, zeroes/readbacks restricted material, and writes a result only when owner validation permits it. A challenge failure after session creation still reaches that close; a pre-session capability failure performs zero materialization and needs no close. The runner never exposes the session/transport in stdout, files, factory keys, or caller input, and no public argv can name an internal handler.

- [ ] **Step 6 (3 min): Run GREEN for challenge/status and result classification**

```powershell
node --test server/tests/control-plane-receipt-recovery.test.mjs
```

Expected: one transport construction, one materializer call, challenge plus selector plus one through at most six ordinary-status `.request(...)` calls with exact request indices `0..5` on the same object, a separate seventh exact-deadline schedule boundary that performs no request, exactly one helper-owned `.requestStatusBundle(...)` only for a timely immutable terminal, one challenge-audience OIDC request, and one idempotent transport close occur for valid recovery. Early-wake, stalled-sleep, exact-deadline, timeout, and transport-ignored-late-terminal rows each make at most six ordinary requests, never create index 6, keep every timeout/sleep target within the one original deadline, and make zero bundle/publication calls. A timely transitional response followed by a timely branded immutable terminal makes exactly one bundle call. All invalid/no-claim cases perform zero publication calls and no write request type.

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

### Task 7: Bind The Artifact-Owned Fixed Inline Recovered-Closeout Hard Stop

**Files:**
- Modify: `server/tests/control-plane-receipt-recovery-workflow.test.mjs`

**Interfaces:**
- This entire task and its cross-document test remain future dormant behind `full_sigstore_owner_topology_unapproved` and the independent offline npm closure authorization STOP. The global Gate is evaluated before any Receipt test/source/workflow file is created or any owner fixture is imported or executed; the code below is retained only as the required post-resume regression contract and is not current GREEN.
- Consumes from Artifact Task 6 base only the exported `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT`; Receipt's repository controller does not call Task 6's token/fetch live-refresh parser. Separately consumes Artifact Task 7 Step 6a extension's `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_SHA256` and zero-argument `createRecoveryWorkflowAuthorityInlineFixture()`. That extension owns the exact ordered 11-key fixture ABI; fresh non-aliased `authorityControlBytes`, `publisherPrepareBytes`, and `publisherPostverifyBytes` plus their lowercase SHA-256 values; and the `recoverAuthorityStepBytes`/`recoverAuthorityStepSha256` and `publishAuthorityStepBytes`/`publishAuthorityStepSha256` wrapper pairs. Receipt never copies the fixture renderer, live policy parser, verifier, publisher, or authority implementation.
- Current global-B is fixed: executing exact `publisherPrepareBytes` or exact `publisherPostverifyBytes` must reject with `github_full_sigstore_owner_unavailable`. Prepare may revalidate the already emitted Artifact-owned approval proof through the owner's bounded authority reads, but it must stop before the first Release/asset read or write, subject/predicate filesystem effect, attestation call, publisher output, or pinned-attest eligibility. Postverify must stop before its first publication read and may not emit completion.
- The no-checkout `publish_recovered` job remains data-only. Its first executable step is the exact frozen `publishAuthorityStepBytes` wrapper and matching step SHA for `artifact-publication`; its parsed script contains the authority body once plus one explicit awaited invocation. Only after that complete wrapper succeeds may the exact pinned download transfer the opaque recovered-result artifact. The following prepare, pinned `actions/attest`, and postverify rows preserve a reviewed future topology, but current prepare emits no `attest_missing` and fails the job, so both later rows are unreachable and no completion may be claimed.
- `authorize` retains the owner canonical user-only policy with `preventSelfReview:true`, direct protected `master`, `adminBypassAllowed:false`, one exact resolved User reviewer distinct from both actors, and exactly the `approval_proof_base64`/`approval_proof_sha256` output pair. Receipt's cross-document test consumes the real owner fixture and uses only a test-local GitHub authority stub to obtain that proof; it does not recreate policy canonicalization or treat the proof as publication authority.
- The tag/name derivation, recovered Actions-observation wrapper, subject/predicate identity, generic pair states `none`, `asset_only`, `attestation_only`, `complete`, `conflict`, response-loss handling, resume behavior, and completion outputs are future separately approved dormant contracts. They are retained only as static topology/shape review material and are excluded from current GREEN, acceptance, and operational claims.
- Every canonical `recovered_closeout` or `recovery_attempt_no_claim` publication input is currently stopped before publication I/O. A future full-Sigstore supplement must independently authorize the positive recovered-envelope path and continue rejecting no-claim; this Receipt plan cannot supply that authority.
- The cross-document regression runs both exact owner byte buffers in code-generation-disabled VMs, verifies their owner SHA-256 values, and counts Release reads/writes, asset writes, filesystem effects, attestation calls, publisher outputs, pinned-attest eligibility, and completion. It must observe the exact owner-unavailable error and all zero counts for each body. One-byte, whole-body, or hash substitution still fails the existing raw/YAML equality gate before any external-write eligibility callback.

- [ ] **Step 1 (5 min): Add RED cross-document owner-stop tests**

Import the real Artifact owner fixture and express the current acceptance boundary directly:

```js
const ownerFixture = createRecoveryWorkflowAuthorityInlineFixture();
for (const [bytesKey, hashKey, needsApprovalProof] of [
  ["publisherPrepareBytes", "publisherPrepareSha256", true],
  ["publisherPostverifyBytes", "publisherPostverifySha256", false],
]) {
  const harness = createReceiptOwnerStopHarness();
  if (needsApprovalProof) await primeReceiptOwnerApprovalProof(ownerFixture, harness);
  await assert.rejects(
    () => executeExactReceiptOwnerBody(ownerFixture[bytesKey], harness),
    /github_full_sigstore_owner_unavailable/,
  );
  assertReceiptOwnerGlobalBZeroEffects(harness);
}
```

The test primes only the exact Artifact-owned approval proof required by prepare. It then executes the owner's exact prepare bytes—not a copied helper—inside a new process-equivalent VM with publisher outputs and publication-effect traps separated from the authority proof outputs. Postverify runs from a fresh harness without proof priming. Neither test provides an `attestFn`, trust archive, Sigstore URL, production filesystem, transport, repository module, or executable artifact. The dormant five states and every resume/completion happy path are explicitly absent from this RED/GREEN batch and require their own future approval.

- [ ] **Step 2 (2 min): Run RED against the missing owner-byte consumer**

```powershell
node --test server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: the test parses but fails until it imports the real 11-key owner fixture, executes both exact byte buffers, and proves the global-B hard stop plus zero publication effects.

- [ ] **Step 3 (5 min): Consume the exact owner fixture through an independent zero-effect VM harness**

```js
import * as nodeCrypto from "node:crypto";
import { createContext, Script } from "node:vm";
import {
  RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_SHA256,
  createRecoveryWorkflowAuthorityInlineFixture,
} from "../../scripts/control-plane-github-evidence.mjs";

const CURRENT_RECOVERY_PUBLISHER_STOP = "github_full_sigstore_owner_unavailable";

function createReceiptOwnerStopHarness() {
  const sourceCommit = "a".repeat(40);
  const effects = {
    authorityReads: 0,
    releaseReads: 0,
    releaseWrites: 0,
    assetWrites: 0,
    filesystemReads: 0,
    filesystemWrites: 0,
    subjectFiles: 0,
    predicateFiles: 0,
    attestationCalls: 0,
  };
  const authorityOutputs = new Map();
  const publisherOutputs = new Map();
  const policy = {
    deployment_branch_policy: {
      protected_branches: true,
      custom_branch_policies: false,
    },
    can_admins_bypass: false,
    protection_rules: [{
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{
        type: "User",
        reviewer: { id: 41, login: "release-reviewer" },
      }],
    }],
  };
  const approvals = [{
    state: "approved",
    environments: [{ name: "artifact-publication" }],
    user: { id: 41, login: "release-reviewer" },
  }];
  const context = Object.freeze({
    runId: 9001,
    runAttempt: 1,
    eventName: "workflow_dispatch",
    ref: "refs/heads/master",
    sha: sourceCommit,
    actor: "recovery-actor",
  });
  const authorityEnv = Object.freeze({
    RECOVERY_AUTHORITY_ENVIRONMENT: "artifact-publication",
    GITHUB_TRIGGERING_ACTOR: "recovery-trigger",
    RECOVERY_PREFLIGHT_SHA256: "",
  });
  const github = Object.freeze({
    async request(route) {
      if (route === "GET /repos/{owner}/{repo}/environments/{environment_name}") {
        effects.authorityReads += 1;
        return { data: structuredClone(policy) };
      }
      if (route === "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}") {
        effects.authorityReads += 1;
        return { data: {
          id: 9001,
          run_attempt: 1,
          event: "workflow_dispatch",
          path: ".github/workflows/control-plane-receipt-recovery.yml",
          head_sha: sourceCommit,
          head_branch: "master",
        } };
      }
      if (route === "GET /repos/{owner}/{repo}/git/ref/heads/master") {
        effects.authorityReads += 1;
        return { data: { object: { type: "commit", sha: sourceCommit } } };
      }
      if (route === "GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals") {
        effects.authorityReads += 1;
        return { data: structuredClone(approvals) };
      }
      if (route === "GET /users/{username}") {
        effects.authorityReads += 1;
        return { data: { id: 41, login: "release-reviewer" } };
      }
      const routeText = String(route);
      if (routeText.startsWith("GET ")) effects.releaseReads += 1;
      else effects.releaseWrites += 1;
      if (/asset|upload/i.test(routeText)) effects.assetWrites += 1;
      if (/attest/i.test(routeText)) effects.attestationCalls += 1;
      throw new Error("receipt_owner_stop_unlisted_github_route");
    },
  });

  function noteFileEffect(rawPath, operation) {
    const filePath = String(rawPath);
    effects[operation === "read" ? "filesystemReads" : "filesystemWrites"] += 1;
    if (/subject/i.test(filePath)) effects.subjectFiles += 1;
    if (/predicate/i.test(filePath)) effects.predicateFiles += 1;
    throw new Error("receipt_owner_stop_filesystem_effect");
  }

  const fsTrap = Object.freeze({
    mkdirSync(filePath) { return noteFileEffect(filePath, "write"); },
    writeFileSync(filePath) { return noteFileEffect(filePath, "write"); },
    readFileSync(filePath) { return noteFileEffect(filePath, "read"); },
    realpathSync(filePath) { return noteFileEffect(filePath, "read"); },
    readdirSync(filePath) { return noteFileEffect(filePath, "read"); },
  });
  const fetch = async (rawUrl, init = {}) => {
    const target = String(rawUrl);
    const method = String(init.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") effects.releaseReads += 1;
    else effects.releaseWrites += 1;
    if (/asset|upload/i.test(target)) effects.assetWrites += 1;
    if (/attest/i.test(target)) effects.attestationCalls += 1;
    throw new Error("receipt_owner_stop_fetch_effect");
  };
  return {
    effects,
    authorityOutputs,
    publisherOutputs,
    context,
    authorityEnv,
    github,
    fsTrap,
    fetch,
  };
}

async function primeReceiptOwnerApprovalProof(ownerFixture, harness) {
  const sandbox = createContext({
    Buffer,
    Date,
    Object,
    Reflect,
    structuredClone,
    github: harness.github,
    context: harness.context,
    core: Object.freeze({
      setOutput(name, value) { harness.authorityOutputs.set(name, value); },
    }),
    env: harness.authorityEnv,
    crypto: nodeCrypto,
  }, { codeGeneration: { strings: false, wasm: false } });
  await new Script(
    `(async()=>{${ownerFixture.authorityControlBytes.toString("utf8")}\n` +
      "return runRecoveryWorkflowAuthorityInlineControl({github,context,core,env,crypto});})()",
    { filename: "receipt-owner-authority-inline.cjs" },
  ).runInContext(sandbox, { timeout: 2_000 });
  assert.deepEqual([...harness.authorityOutputs.keys()], [
    "approval_proof_base64",
    "approval_proof_sha256",
  ]);
}

async function executeExactReceiptOwnerBody(bytes, harness) {
  assert.equal(Buffer.isBuffer(bytes), true);
  const exactRequire = (specifier) => {
    if (specifier === "node:crypto") return nodeCrypto;
    if (specifier === "node:fs" || specifier === "node:fs/promises") return harness.fsTrap;
    throw new Error("receipt_owner_stop_unlisted_require");
  };
  const env = Object.freeze({
    RECOVERY_AUTHORITY_ENVIRONMENT: "artifact-publication",
    GITHUB_TRIGGERING_ACTOR: "recovery-trigger",
    RECOVERY_APPROVAL_PROOF_BASE64:
      harness.authorityOutputs.get("approval_proof_base64"),
    RECOVERY_APPROVAL_PROOF_SHA256:
      harness.authorityOutputs.get("approval_proof_sha256"),
    GITHUB_TOKEN: "test-token",
  });
  const sandbox = createContext({
    Buffer,
    Date,
    URL,
    Uint8Array,
    require: exactRequire,
    github: harness.github,
    context: harness.context,
    core: Object.freeze({
      setOutput(name, value) { harness.publisherOutputs.set(name, value); },
    }),
    process: Object.freeze({ env }),
    fetch: harness.fetch,
    fs: harness.fsTrap,
  }, { codeGeneration: { strings: false, wasm: false } });
  return new Script(`(async()=>{${bytes.toString("utf8")}})()`, {
    filename: "receipt-owner-publisher-inline.cjs",
  }).runInContext(sandbox, { timeout: 5_000 });
}

function assertReceiptOwnerGlobalBZeroEffects(harness) {
  assert.deepEqual({
    releaseReads: harness.effects.releaseReads,
    releaseWrites: harness.effects.releaseWrites,
    assetWrites: harness.effects.assetWrites,
    filesystemReads: harness.effects.filesystemReads,
    filesystemWrites: harness.effects.filesystemWrites,
    subjectFiles: harness.effects.subjectFiles,
    predicateFiles: harness.effects.predicateFiles,
    attestationCalls: harness.effects.attestationCalls,
  }, {
    releaseReads: 0,
    releaseWrites: 0,
    assetWrites: 0,
    filesystemReads: 0,
    filesystemWrites: 0,
    subjectFiles: 0,
    predicateFiles: 0,
    attestationCalls: 0,
  });
  assert.equal(harness.publisherOutputs.size, 0);
  assert.equal(harness.publisherOutputs.has("attest_missing"), false);
  assert.equal(harness.publisherOutputs.has("asset_name"), false);
  assert.equal(harness.publisherOutputs.has("recovered_publication_state"), false);
  const pinnedAttestEligible =
    harness.publisherOutputs.get("attest_missing") === "true";
  assert.equal(pinnedAttestEligible, false);
}

test("Receipt consumes Artifact owner bytes and current global-B stops with zero publication effects", async () => {
  const ownerFixture = createRecoveryWorkflowAuthorityInlineFixture();
  assert.deepEqual(Object.keys(ownerFixture), [
    "contract",
    "authorityControlBytes",
    "authorityControlSha256",
    "publisherPrepareBytes",
    "publisherPrepareSha256",
    "publisherPostverifyBytes",
    "publisherPostverifySha256",
    "recoverAuthorityStepBytes",
    "recoverAuthorityStepSha256",
    "publishAuthorityStepBytes",
    "publishAuthorityStepSha256",
  ]);
  assert.equal(
    ownerFixture.authorityControlSha256,
    RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_SHA256,
  );
  for (const [bytesKey, hashKey, needsApprovalProof] of [
    ["publisherPrepareBytes", "publisherPrepareSha256", true],
    ["publisherPostverifyBytes", "publisherPostverifySha256", false],
  ]) {
    assert.equal(
      nodeCrypto.createHash("sha256").update(ownerFixture[bytesKey]).digest("hex"),
      ownerFixture[hashKey],
    );
    const harness = createReceiptOwnerStopHarness();
    if (needsApprovalProof) await primeReceiptOwnerApprovalProof(ownerFixture, harness);
    const authorityReadsBeforeBody = harness.effects.authorityReads;
    await assert.rejects(
      () => executeExactReceiptOwnerBody(ownerFixture[bytesKey], harness),
      new RegExp(CURRENT_RECOVERY_PUBLISHER_STOP),
    );
    assertReceiptOwnerGlobalBZeroEffects(harness);
    assert.equal(
      harness.effects.authorityReads > authorityReadsBeforeBody,
      needsApprovalProof,
    );
  }
});
```

The test deliberately imports only Artifact's public fixture and exported authority SHA. Its policy, approval, and route objects are test inputs to the real owner bytes, not a Receipt implementation. Authority proof outputs live in a separate map and may be produced only while priming prepare; the publisher map must remain empty. Unknown GitHub routes, fetches, filesystem access, and any output become counted failures, so the expected owner-unavailable rejection cannot mask a Release read/write, asset write, subject/predicate materialization, attestation call, pinned-action eligibility, or completion claim. Receipt defines no publisher operation or success brand.

- [ ] **Step 4 (3 min): Run GREEN for the current global-B hard stop**

```powershell
node --test server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: both exact owner byte buffers and their owner SHA-256 values pass the cross-document equality check; prepare first obtains and refreshes only the exact Artifact-owned approval proof, then raises `github_full_sigstore_owner_unavailable` with zero Release reads/writes, asset writes, filesystem effects, subject/predicate files, attestation calls, publisher outputs, or pinned-attest eligibility. Postverify raises the same code from a fresh harness with the same zero effects and no `recovered_publication_state`. The five pair states, response-loss recovery, resume, and completion remain future separately approved/dormant and are not reported GREEN.

- [ ] **Step 5 (2 min): Commit fixed-inline publisher workflow tests**

```powershell
git add server/tests/control-plane-receipt-recovery-workflow.test.mjs
git commit -m "test(deploy): freeze recovered publisher inline control"
```

---

### Task 8: Add The Manual Recovery Workflow And Static Contract Tests

**Files:**
- Create: `.github/workflows/control-plane-receipt-recovery.yml`
- Create: `server/tests/control-plane-receipt-recovery-workflow.test.mjs`

**Interfaces:**
- This workflow and every static/runtime test below remain future dormant behind the same global authorization STOP. No `.github/workflows/control-plane-receipt-recovery.yml` or Receipt workflow test may be created, committed, pushed, dispatched, or reported GREEN now. After a separately authorized resume, the nested owner-unavailable stop and every frozen topology assertion below remain mandatory and may not be weakened as a shortcut around the global Gate.
- Consumes: the repository recovery controller from Receipt Task 6, Artifact Task 6 base's `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT` for local canonical data validation only, and Artifact Task 7 Step 6a extension's SHA export, zero-argument exact 11-key fixture, authority/prepare/postverify byte/hash triples, and two rendered authority-step wrapper byte/hash pairs. It never calls Task 6's token/fetch live-refresh parser, consumes no repository publisher script, and owns no recovered-publication implementation.
- Supplies the existing protected `JAPAN_CONTROL_DEPLOY_HOST`, `JAPAN_CONTROL_DEPLOY_PORT`, `JAPAN_CONTROL_DEPLOY_USER`, `JAPAN_CONTROL_DEPLOY_PRIVATE_KEY`, and `JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS` environment names only to `createRecoverySecretMaterializer`. No workflow/controller field aliases them as `RECOVERY_SSH_*`, constructs a tuple, or passes a protected value to `createSecureSshTransport`/`.request(...)`; these values never become job outputs.
- Produces: one `workflow_dispatch` workflow with `preflight`, `recover`, and `publish_recovered` jobs.
- Produces: a 35-day run-attempt artifact named from the fixed recovery ID/run/attempt; exactly one conditional upload selects one fixed non-hidden regular-file path, either `control-plane-recovery-runner-temp/result/recovered-closeout.json` or `control-plane-recovery-runner-temp/result/recovery-attempt-no-claim.json`. Preflight similarly uploads only `control-plane-recovery-runner-temp/preflight/recovery-preflight.json`. Downloads land only in `control-plane-recovery-runner-temp/download/preflight` or `control-plane-recovery-runner-temp/download/result`; the consuming owner command performs the fixed no-follow validate/copy-0600/fsync/readback/delete-landing adoption before parsing. No upload path is a glob, hidden default, directory upload, output-selected path, or symlink.
- Enforces: shared concurrency, current `master`, exact ordered workflow-root keys `name,on,permissions,concurrency,jobs` with no root `defaults`/`env`/extra execution authority, workflow-level `permissions: {}`, exact ordered job keys and complete per-job permission maps, exact parsed/raw per-job key order, fixed `ubuntu-24.04` with no container/services/defaults/reusable/local executor, production approval only on `recover`, isolated `artifact-publication` approval only on `publish_recovered`, exact step-level explicit token placement plus the two bounded read-only checkout exceptions, a closed raw-plus-parsed GitHub expression/context multiset, `persist-credentials: false`, bounded timeout, `always()` secret-file cleanup/readback, exact Task 7 rendered wrapper bytes/step hashes whose scripts contain the owner body once plus one awaited invocation, and publisher isolation. The pinned single-subject attestation and postverify rows are frozen future structural reservations: current exact prepare has no `continue-on-error`, raises `github_full_sigstore_owner_unavailable` without `attest_missing`, leaves the attestation condition false/ineligible, and leaves postverify behind the default prior-success gate. Both rows are unreachable and grant no completion authority.

- [ ] **Step 1 (5 min): Add RED workflow-source contract tests**

Read the workflow as text and through the repository's existing workflow-contract helper. Assert:

```js
const EXPECTED_WORKFLOW_ROOT_KEYS = Object.freeze([
  "name",
  "on",
  "permissions",
  "concurrency",
  "jobs",
]);
assert.deepEqual(Object.keys(workflow), EXPECTED_WORKFLOW_ROOT_KEYS);
assert.equal(workflow.name, "Japan control-plane receipt recovery");
assert.equal(Object.hasOwn(workflow, "defaults"), false);
assert.equal(Object.hasOwn(workflow, "env"), false);
assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
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
const EXPECTED_JOB_PERMISSIONS = Object.freeze({
  preflight: Object.freeze({ actions: "read", contents: "read" }),
  recover: Object.freeze({
    actions: "read",
    attestations: "read",
    contents: "read",
    "id-token": "write",
  }),
  publish_recovered: Object.freeze({
    actions: "read",
    attestations: "write",
    contents: "write",
    "id-token": "write",
  }),
});
const EXPECTED_JOB_RUNTIME_TOPOLOGY = Object.freeze({
  preflight: Object.freeze({
    keys: Object.freeze(["if", "runs-on", "timeout-minutes", "outputs", "permissions", "steps"]),
    needs: null,
    if: "${{ github.ref == 'refs/heads/master' }}",
    runsOn: "ubuntu-24.04",
    timeoutMinutes: 5,
    environment: null,
    outputs: Object.freeze({
      preflight_artifact_name: "${{ steps.preflight.outputs.preflight_artifact_name }}",
      preflight_sha256: "${{ steps.preflight.outputs.preflight_sha256 }}",
    }),
    permissions: EXPECTED_JOB_PERMISSIONS.preflight,
  }),
  recover: Object.freeze({
    keys: Object.freeze(["needs", "if", "runs-on", "timeout-minutes", "environment", "outputs", "permissions", "steps"]),
    needs: "preflight",
    if: "${{ github.ref == 'refs/heads/master' }}",
    runsOn: "ubuntu-24.04",
    timeoutMinutes: 10,
    environment: "vultr-japan-production",
    outputs: Object.freeze({
      result_kind: "${{ steps.result.outputs.result_kind }}",
      result_artifact_name: "${{ steps.result.outputs.result_artifact_name }}",
      producing_run_attempt: "${{ steps.result.outputs.producing_run_attempt }}",
    }),
    permissions: EXPECTED_JOB_PERMISSIONS.recover,
  }),
  publish_recovered: Object.freeze({
    keys: Object.freeze(["needs", "if", "runs-on", "timeout-minutes", "environment", "permissions", "steps"]),
    needs: "recover",
    if: "${{ github.ref == 'refs/heads/master' && needs.recover.result == 'success' && needs.recover.outputs.result_kind == 'validated' }}",
    runsOn: "ubuntu-24.04",
    timeoutMinutes: 5,
    environment: "artifact-publication",
    outputs: null,
    permissions: EXPECTED_JOB_PERMISSIONS.publish_recovered,
  }),
});
assert.deepEqual(workflow.permissions, {});
assert.deepEqual(Object.keys(workflow.jobs), ["preflight", "recover", "publish_recovered"]);
for (const [jobName, exactPermissions] of Object.entries(EXPECTED_JOB_PERMISSIONS)) {
  const jobBlock = workflow.jobs[jobName];
  assert.deepEqual(jobBlock.permissions, exactPermissions);
  assert.deepEqual(Object.keys(jobBlock.permissions), Object.keys(exactPermissions));
  const runtime = EXPECTED_JOB_RUNTIME_TOPOLOGY[jobName];
  assert.deepEqual(Object.keys(jobBlock), runtime.keys);
  assert.equal(jobBlock["runs-on"], runtime.runsOn);
  assert.equal(jobBlock["timeout-minutes"], runtime.timeoutMinutes);
  assert.equal(Object.hasOwn(jobBlock, "needs"), runtime.needs !== null);
  if (runtime.needs !== null) assert.equal(jobBlock.needs, runtime.needs);
  assert.equal(jobBlock.if, runtime.if);
  assert.equal(Object.hasOwn(jobBlock, "environment"), runtime.environment !== null);
  if (runtime.environment !== null) assert.equal(jobBlock.environment, runtime.environment);
  assert.equal(Object.hasOwn(jobBlock, "outputs"), runtime.outputs !== null);
  if (runtime.outputs !== null) {
    assert.deepEqual(Object.keys(jobBlock.outputs), Object.keys(runtime.outputs));
    assert.deepEqual(jobBlock.outputs, runtime.outputs);
  }
  for (const forbiddenKey of ["container", "services", "defaults", "uses"]) {
    assert.equal(Object.hasOwn(jobBlock, forbiddenKey), false);
  }
}
assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.preflight), 1);
assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.recover), 2);
assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.publish_recovered), 4);
assert.equal(hasWorkflowOrJobLevelTokenEnvironment(workflow), false);

const EXPECTED_JOB_EXPRESSIONS = Object.freeze({
  preflight: Object.freeze({
    "github.actor": 1,
    "github.ref": 1,
    "github.ref == 'refs/heads/master'": 1,
    "github.repository": 1,
    "github.run_attempt": 1,
    "github.run_id": 1,
    "github.sha": 2,
    "github.token": 1,
    "github.triggering_actor": 1,
    "inputs.confirmation": 1,
    "inputs.controller_recovery_id": 1,
    "inputs.original_run_attempt": 1,
    "inputs.original_run_id": 1,
    "steps.preflight.outputs.preflight_artifact_name": 2,
    "steps.preflight.outputs.preflight_sha256": 1,
  }),
  recover: Object.freeze({
    "always()": 1,
    "github.actor": 1,
    "github.ref": 1,
    "github.ref == 'refs/heads/master'": 1,
    "github.repository": 1,
    "github.run_attempt": 3,
    "github.run_id": 3,
    "github.sha": 2,
    "github.token": 2,
    "github.triggering_actor": 1,
    "needs.preflight.outputs.preflight_artifact_name": 1,
    "needs.preflight.outputs.preflight_sha256": 2,
    "secrets.JAPAN_CONTROL_DEPLOY_HOST": 1,
    "secrets.JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS": 1,
    "secrets.JAPAN_CONTROL_DEPLOY_PORT": 1,
    "secrets.JAPAN_CONTROL_DEPLOY_PRIVATE_KEY": 1,
    "secrets.JAPAN_CONTROL_DEPLOY_USER": 1,
    "steps.result.outputs.producing_run_attempt": 1,
    "steps.result.outputs.result_artifact_name": 1,
    "steps.result.outputs.result_kind": 1,
    "steps.result.outputs.result_kind != 'validated'": 1,
    "steps.result.outputs.result_kind == 'no_claim'": 1,
    "steps.result.outputs.result_kind == 'validated'": 1,
    "steps.authority.outputs.approval_proof_base64": 1,
    "steps.authority.outputs.approval_proof_sha256": 1,
    "vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256": 1,
    "vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256": 1,
    "vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION": 1,
    "vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256": 1,
  }),
  publish_recovered: Object.freeze({
    "github.actor": 1,
    "github.ref": 1,
    "github.ref == 'refs/heads/master' && needs.recover.result == 'success' && needs.recover.outputs.result_kind == 'validated'": 1,
    "github.repository": 1,
    "github.run_attempt": 1,
    "github.run_id": 2,
    "github.sha": 1,
    "github.token": 4,
    "github.triggering_actor": 1,
    "needs.recover.outputs.producing_run_attempt": 1,
    "steps.prepare.outputs.asset_name": 1,
    "steps.prepare.outputs.attest_missing == 'true'": 1,
    "steps.authority.outputs.approval_proof_base64": 1,
    "steps.authority.outputs.approval_proof_sha256": 1,
  }),
});

const EXPECTED_TOKEN_STEPS = Object.freeze({
  preflight: Object.freeze(["Validate current master and original attempt"]),
  recover: Object.freeze([
    "Authorize production recovery",
    "Read one retained terminal record",
  ]),
  publish_recovered: Object.freeze([
    "Authorize recovered publication",
    "Prepare exact recovered asset and predicate",
    "Attest the one exact recovered closeout subject",
    "Read back and verify the complete recovered pair",
  ]),
});

const EXPECTED_TOKEN_CARRIERS = Object.freeze({
  preflight: Object.freeze(["env"]),
  recover: Object.freeze(["action", "env"]),
  publish_recovered: Object.freeze(["action", "action", "action", "action"]),
});
const EXPECTED_TRUSTED_READ_ONLY_CHECKOUT_INDEX = Object.freeze({
  preflight: 0,
  recover: 1,
  publish_recovered: null,
});

const INLINE_AUTHORITY_FIXTURE = createRecoveryWorkflowAuthorityInlineFixture();
assert.deepEqual(Object.keys(INLINE_AUTHORITY_FIXTURE), [
  "contract",
  "authorityControlBytes",
  "authorityControlSha256",
  "publisherPrepareBytes",
  "publisherPrepareSha256",
  "publisherPostverifyBytes",
  "publisherPostverifySha256",
  "recoverAuthorityStepBytes",
  "recoverAuthorityStepSha256",
  "publishAuthorityStepBytes",
  "publishAuthorityStepSha256",
]);
assert.equal(
  INLINE_AUTHORITY_FIXTURE.authorityControlSha256,
  RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_SHA256,
);
for (const body of [
  INLINE_AUTHORITY_FIXTURE.publisherPrepareBytes,
  INLINE_AUTHORITY_FIXTURE.publisherPostverifyBytes,
]) {
  assert.match(body.toString("utf8"), /github_full_sigstore_owner_unavailable/);
}
assert.doesNotMatch(
  INLINE_AUTHORITY_FIXTURE.publisherPrepareBytes.toString("utf8"),
  /setOutput\(["'](?:attest_missing|asset_name)["']/,
);
assert.doesNotMatch(
  INLINE_AUTHORITY_FIXTURE.publisherPostverifyBytes.toString("utf8"),
  /setOutput\(["']recovered_publication_state["']/,
);

const RECOVERY_ACTION_PINS = Object.freeze({
  checkout: "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  download: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  githubScript: "actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea",
  upload: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  attest: "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6",
});

function expectedRecoveryAuthorityScript() {
  return [
    'const crypto = require("node:crypto");',
    INLINE_AUTHORITY_FIXTURE.authorityControlBytes.toString("utf8").trimEnd(),
    "await runRecoveryWorkflowAuthorityInlineControl({ github, context, core, env: process.env, crypto });",
    "",
  ].join("\n");
}

function expectedRecoveryAuthorityStep({ name, environment, includePreflight }) {
  const env = {
    RECOVERY_AUTHORITY_ENVIRONMENT: environment,
    RECOVERY_REPOSITORY: "${{ github.repository }}",
    RECOVERY_ACTOR: "${{ github.actor }}",
    RECOVERY_TRIGGERING_ACTOR: "${{ github.triggering_actor }}",
    RECOVERY_RUN_ID: "${{ github.run_id }}",
    RECOVERY_RUN_ATTEMPT: "${{ github.run_attempt }}",
    RECOVERY_REF: "${{ github.ref }}",
    RECOVERY_SHA: "${{ github.sha }}",
  };
  if (includePreflight) {
    env.RECOVERY_PREFLIGHT_SHA256 = "${{ needs.preflight.outputs.preflight_sha256 }}";
  }
  return {
    name,
    id: "authority",
    uses: RECOVERY_ACTION_PINS.githubScript,
    env,
    with: {
      "github-token": "${{ github.token }}",
      script: expectedRecoveryAuthorityScript(),
    },
  };
}

const EXPECTED_RECOVERY_STEPS = Object.freeze({
  preflight: Object.freeze([
    Object.freeze({
      uses: RECOVERY_ACTION_PINS.checkout,
      with: Object.freeze({
        "persist-credentials": false,
        ref: "${{ github.sha }}",
      }),
    }),
    Object.freeze({
      name: "Validate current master and original attempt",
      id: "preflight",
      env: Object.freeze({
        GITHUB_TOKEN: "${{ github.token }}",
        RECOVERY_REPOSITORY: "${{ github.repository }}",
        RECOVERY_ACTOR: "${{ github.actor }}",
        RECOVERY_TRIGGERING_ACTOR: "${{ github.triggering_actor }}",
        RECOVERY_RUN_ID: "${{ github.run_id }}",
        RECOVERY_RUN_ATTEMPT: "${{ github.run_attempt }}",
        RECOVERY_REF: "${{ github.ref }}",
        RECOVERY_SHA: "${{ github.sha }}",
        CONTROLLER_RECOVERY_ID: "${{ inputs.controller_recovery_id }}",
        ORIGINAL_RUN_ID: "${{ inputs.original_run_id }}",
        ORIGINAL_RUN_ATTEMPT: "${{ inputs.original_run_attempt }}",
        RECOVERY_CONFIRMATION: "${{ inputs.confirmation }}",
      }),
      run: [
        "set -euo pipefail",
        'test -f "$GITHUB_OUTPUT"',
        'test ! -L "$GITHUB_OUTPUT"',
        'node scripts/control-plane-receipt-recovery-controller.mjs preflight >> "$GITHUB_OUTPUT"',
        "",
      ].join("\n"),
    }),
    Object.freeze({
      uses: RECOVERY_ACTION_PINS.upload,
      with: Object.freeze({
        name: "${{ steps.preflight.outputs.preflight_artifact_name }}",
        path: "control-plane-recovery-runner-temp/preflight/recovery-preflight.json",
        "if-no-files-found": "error",
        "retention-days": 35,
      }),
    }),
  ]),
  recover: Object.freeze([
    Object.freeze(expectedRecoveryAuthorityStep({
      name: "Authorize production recovery",
      environment: "vultr-japan-production",
      includePreflight: true,
    })),
    Object.freeze({
      uses: RECOVERY_ACTION_PINS.checkout,
      with: Object.freeze({
        "persist-credentials": false,
        ref: "${{ github.sha }}",
      }),
    }),
    Object.freeze({
      uses: RECOVERY_ACTION_PINS.download,
      with: Object.freeze({
        name: "${{ needs.preflight.outputs.preflight_artifact_name }}",
        path: "control-plane-recovery-runner-temp/download/preflight",
      }),
    }),
    Object.freeze({
      name: "Read one retained terminal record",
      id: "recover",
      env: Object.freeze({
        GITHUB_TOKEN: "${{ github.token }}",
        RECOVERY_APPROVAL_PROOF_BASE64: "${{ steps.authority.outputs.approval_proof_base64 }}",
        RECOVERY_APPROVAL_PROOF_SHA256: "${{ steps.authority.outputs.approval_proof_sha256 }}",
        JAPAN_CONTROL_DEPLOY_HOST: "${{ secrets.JAPAN_CONTROL_DEPLOY_HOST }}",
        JAPAN_CONTROL_DEPLOY_PORT: "${{ secrets.JAPAN_CONTROL_DEPLOY_PORT }}",
        JAPAN_CONTROL_DEPLOY_USER: "${{ secrets.JAPAN_CONTROL_DEPLOY_USER }}",
        JAPAN_CONTROL_DEPLOY_PRIVATE_KEY: "${{ secrets.JAPAN_CONTROL_DEPLOY_PRIVATE_KEY }}",
        JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS: "${{ secrets.JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS }}",
        RECOVERY_BOOTSTRAP_GENERATION: "${{ vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION }}",
        RECOVERY_BOOTSTRAP_RECEIPT_SHA256: "${{ vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256 }}",
        RECOVERY_AUTHORIZATION_BINDING_HMAC_SHA256: "${{ vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256 }}",
        RECOVERY_AUTHORIZATION_STATE_SHA256: "${{ vars.JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256 }}",
        RECOVERY_PREFLIGHT_SHA256: "${{ needs.preflight.outputs.preflight_sha256 }}",
      }),
      run: "node scripts/control-plane-receipt-recovery-controller.mjs recover",
    }),
    Object.freeze({
      name: "Classify recovery result",
      id: "result",
      run: 'node scripts/control-plane-receipt-recovery-controller.mjs validate-result >> "$GITHUB_OUTPUT"',
    }),
    Object.freeze({
      name: "Remove restricted material and verify absence",
      if: "${{ always() }}",
      run: "node scripts/control-plane-receipt-recovery-controller.mjs cleanup",
    }),
    Object.freeze({
      name: "Upload validated recovery result",
      if: "${{ steps.result.outputs.result_kind == 'validated' }}",
      uses: RECOVERY_ACTION_PINS.upload,
      with: Object.freeze({
        name: "receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}",
        path: "control-plane-recovery-runner-temp/result/recovered-closeout.json",
        "if-no-files-found": "error",
        "retention-days": 35,
      }),
    }),
    Object.freeze({
      name: "Upload no-claim recovery result",
      if: "${{ steps.result.outputs.result_kind == 'no_claim' }}",
      uses: RECOVERY_ACTION_PINS.upload,
      with: Object.freeze({
        name: "receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}",
        path: "control-plane-recovery-runner-temp/result/recovery-attempt-no-claim.json",
        "if-no-files-found": "error",
        "retention-days": 35,
      }),
    }),
    Object.freeze({
      name: "Reject a no-claim attempt",
      if: "${{ steps.result.outputs.result_kind != 'validated' }}",
      run: "exit 1",
    }),
  ]),
  publish_recovered: Object.freeze([
    Object.freeze(expectedRecoveryAuthorityStep({
      name: "Authorize recovered publication",
      environment: "artifact-publication",
      includePreflight: false,
    })),
    Object.freeze({
      uses: RECOVERY_ACTION_PINS.download,
      with: Object.freeze({
        name: "receipt-recovery-result-${{ github.run_id }}-${{ needs.recover.outputs.producing_run_attempt }}",
        path: "control-plane-recovery-runner-temp/download/result",
      }),
    }),
    Object.freeze({
      name: "Prepare exact recovered asset and predicate",
      id: "prepare",
      uses: RECOVERY_ACTION_PINS.githubScript,
      env: Object.freeze({
        RECOVERY_APPROVAL_PROOF_BASE64: "${{ steps.authority.outputs.approval_proof_base64 }}",
        RECOVERY_APPROVAL_PROOF_SHA256: "${{ steps.authority.outputs.approval_proof_sha256 }}",
      }),
      with: Object.freeze({
        "github-token": "${{ github.token }}",
        script: INLINE_AUTHORITY_FIXTURE.publisherPrepareBytes.toString("utf8"),
      }),
    }),
    Object.freeze({
      name: "Attest the one exact recovered closeout subject",
      if: "${{ steps.prepare.outputs.attest_missing == 'true' }}",
      uses: RECOVERY_ACTION_PINS.attest,
      with: Object.freeze({
        "github-token": "${{ github.token }}",
        "push-to-registry": false,
        "create-storage-record": false,
        "subject-path": "control-plane-recovery-runner-temp/publication/subject/${{ steps.prepare.outputs.asset_name }}",
        "predicate-type": "https://slsa.dev/provenance/v1",
        "predicate-path": "control-plane-recovery-runner-temp/publication/predicate/recovered-closeout-predicate.json",
      }),
    }),
    Object.freeze({
      name: "Read back and verify the complete recovered pair",
      uses: RECOVERY_ACTION_PINS.githubScript,
      with: Object.freeze({
        "github-token": "${{ github.token }}",
        script: INLINE_AUTHORITY_FIXTURE.publisherPostverifyBytes.toString("utf8"),
      }),
    }),
  ]),
});

function rawRecoveryStepBlocks(source, jobName) {
  const block = rawRecoveryJobBlock(source, jobName);
  const marker = "    steps:\n";
  const start = block.indexOf(marker);
  if (start < 0) throw new Error("recovery_workflow_steps_invalid");
  const text = block.slice(start + marker.length);
  const starts = [...text.matchAll(/^      - /gm)].map((match) => match.index);
  if (starts.length === 0) throw new Error("recovery_workflow_steps_invalid");
  return starts.map((stepStart, index) => text.slice(
    stepStart,
    index + 1 < starts.length ? starts[index + 1] : text.length,
  ));
}

function assertExactRecoveryStepTopology(source, parsed, expectedByJob) {
  for (const [jobName, expectedSteps] of Object.entries(expectedByJob)) {
    const actualSteps = parsed.jobs[jobName].steps;
    const rawSteps = rawRecoveryStepBlocks(source, jobName);
    assert.equal(actualSteps.length, expectedSteps.length);
    assert.equal(rawSteps.length, expectedSteps.length);
    for (let index = 0; index < expectedSteps.length; index += 1) {
      assert.deepEqual(Object.keys(actualSteps[index]), Object.keys(expectedSteps[index]));
      assert.deepEqual(actualSteps[index], expectedSteps[index]);
    }
    assert.deepEqual(
      rawSteps.flatMap((step) => {
        const match = /^        uses: ([^\r\n]+)$/m.exec(step);
        return match ? [match[1]] : [];
      }),
      expectedSteps.flatMap((step) => typeof step.uses === "string" ? [step.uses] : []),
    );
    assert.equal(
      rawSteps.filter((step) => /^        run:(?: |$)/m.test(step)).length,
      expectedSteps.filter((step) => typeof step.run === "string").length,
    );
    assert.doesNotMatch(
      rawRecoveryJobBlock(source, jobName),
      /ACTIONS_ID_TOKEN_REQUEST_(?:TOKEN|URL)|uses:\s+(?:docker:\/\/|\.\.?(?:\/|\\))|uses:\s+[^\s/]+\/(?!checkout@|download-artifact@|github-script@|upload-artifact@|attest@)/,
    );
  }
  const publisherSteps = parsed.jobs.publish_recovered.steps;
  assert.deepEqual(
    Buffer.from(publisherSteps[2].with.script, "utf8"),
    INLINE_AUTHORITY_FIXTURE.publisherPrepareBytes,
  );
  assert.equal(
    sha256Hex(Buffer.from(publisherSteps[2].with.script, "utf8")),
    INLINE_AUTHORITY_FIXTURE.publisherPrepareSha256,
  );
  assert.deepEqual(
    Buffer.from(publisherSteps[4].with.script, "utf8"),
    INLINE_AUTHORITY_FIXTURE.publisherPostverifyBytes,
  );
  assert.equal(
    sha256Hex(Buffer.from(publisherSteps[4].with.script, "utf8")),
    INLINE_AUTHORITY_FIXTURE.publisherPostverifySha256,
  );
}

assertExactRecoveryStepTopology(
  workflowSource,
  workflow,
  EXPECTED_RECOVERY_STEPS,
);

function assertAbsoluteAuthorityStepZero(parsed, jobName, environment) {
  const job = parsed.jobs[jobName];
  const step = job.steps[0];
  assert.deepEqual(Object.keys(step), ["name", "id", "uses", "env", "with"]);
  assert.equal(step.name, jobName === "recover"
    ? "Authorize production recovery"
    : "Authorize recovered publication");
  assert.equal(step.id, "authority");
  assert.equal(step.uses, "actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea");
  assert.deepEqual(Object.keys(step.with), ["github-token", "script"]);
  assert.equal(step.with["github-token"], "${{ github.token }}");
  const authorityBody = INLINE_AUTHORITY_FIXTURE.authorityControlBytes.toString("utf8").trimEnd();
  const expectedScript = expectedRecoveryAuthorityScript();
  assert.equal(step.with.script, expectedScript);
  assert.equal(step.with.script.split(authorityBody).length - 1, 1);
  assert.equal(step.with.script.split("await runRecoveryWorkflowAuthorityInlineControl(").length - 1, 1);
  const exactEnv = {
    RECOVERY_AUTHORITY_ENVIRONMENT: environment,
    RECOVERY_REPOSITORY: "${{ github.repository }}",
    RECOVERY_ACTOR: "${{ github.actor }}",
    RECOVERY_TRIGGERING_ACTOR: "${{ github.triggering_actor }}",
    RECOVERY_RUN_ID: "${{ github.run_id }}",
    RECOVERY_RUN_ATTEMPT: "${{ github.run_attempt }}",
    RECOVERY_REF: "${{ github.ref }}",
    RECOVERY_SHA: "${{ github.sha }}",
  };
  if (jobName === "recover") {
    exactEnv.RECOVERY_PREFLIGHT_SHA256 = "${{ needs.preflight.outputs.preflight_sha256 }}";
  }
  assert.deepEqual(step.env, exactEnv);
  assert.doesNotMatch(JSON.stringify(step), /secrets\.|vars\.|ACTIONS_ID_TOKEN_REQUEST|JAPAN_CONTROL_DEPLOY_|RECOVERY_SSH_/);
  assert.equal(job.steps.slice(0, 1).some(({ uses }) =>
    /checkout|download-artifact|setup-|\.\/|gccwebos-com\//i.test(uses ?? "")), false);
}

assertAbsoluteAuthorityStepZero(workflow, "recover", "vultr-japan-production");
assertAbsoluteAuthorityStepZero(workflow, "publish_recovered", "artifact-publication");
assert.deepEqual(
  workflow.jobs.publish_recovered.steps.map(({ name, uses }) => name ?? uses),
  [
    "Authorize recovered publication",
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    "Prepare exact recovered asset and predicate",
    "Attest the one exact recovered closeout subject",
    "Read back and verify the complete recovered pair",
  ],
);
assert.doesNotMatch(
  rawRecoveryJobBlock(workflowSource, "publish_recovered"),
  /actions\/checkout|setup-|uses:\s+\.\/|uses:\s+gccwebos-com\/|\brun:|node scripts\/|artifact-metadata:/,
);
assert.deepEqual(
  workflow.jobs.recover.steps.slice(0, 3).map(({ name, uses }) => name ?? uses),
  [
    "Authorize production recovery",
    "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  ],
);

function firstRawStepBytes(source, jobName) {
  const block = rawRecoveryJobBlock(source, jobName);
  const steps = block.indexOf("    steps:\n");
  if (steps < 0) throw new Error("recovery_workflow_step_zero_invalid");
  const first = steps + "    steps:\n".length;
  const next = block.indexOf("\n      - ", first + 1);
  if (next < 0) throw new Error("recovery_workflow_step_zero_invalid");
  return Buffer.from(block.slice(first, next + 1), "utf8");
}

function prependProtectedJobStep(source, jobName, priorStep) {
  const block = rawRecoveryJobBlock(source, jobName);
  const changed = block.replace("    steps:\n", `    steps:\n${priorStep}\n`);
  if (changed === block) throw new Error("recovery_workflow_step_zero_fixture_invalid");
  return source.replace(block, changed);
}

function replaceRecoveryInlineScriptBody(source, jobName, stepName, replacementBody) {
  const block = rawRecoveryJobBlock(source, jobName);
  const stepStart = block.indexOf(`      - name: ${stepName}\n`);
  if (stepStart < 0) throw new Error("recovery_workflow_inline_fixture_invalid");
  const nextStep = block.indexOf("\n      - ", stepStart + 1);
  const stepEnd = nextStep < 0 ? block.length : nextStep + 1;
  const scriptMarker = "          script: |\n";
  const marker = block.indexOf(scriptMarker, stepStart);
  if (marker < 0 || marker >= stepEnd || !replacementBody.endsWith("\n")) {
    throw new Error("recovery_workflow_inline_fixture_invalid");
  }
  const bodyStart = marker + scriptMarker.length;
  const changedBlock = block.slice(0, bodyStart) + replacementBody + block.slice(stepEnd);
  return source.replace(block, changedBlock);
}

function addExplicitRecoveryScriptIndentIndicator(source, jobName, stepName) {
  const block = rawRecoveryJobBlock(source, jobName);
  const stepStart = block.indexOf(`      - name: ${stepName}\n`);
  const nextStep = block.indexOf("\n      - ", stepStart + 1);
  const stepEnd = nextStep < 0 ? block.length : nextStep + 1;
  const scriptMarker = "          script: |\n";
  const marker = block.indexOf(scriptMarker, stepStart);
  if (stepStart < 0 || marker < 0 || marker >= stepEnd) {
    throw new Error("recovery_workflow_inline_fixture_invalid");
  }
  const changedBlock = block.slice(0, marker)
    + "          script: |2\n"
    + block.slice(marker + scriptMarker.length);
  return source.replace(block, changedBlock);
}

function mutateOneRecoveryInlineScriptByte(source, jobName, stepName) {
  const block = rawRecoveryJobBlock(source, jobName);
  const stepStart = block.indexOf(`      - name: ${stepName}\n`);
  const nextStep = block.indexOf("\n      - ", stepStart + 1);
  const stepEnd = nextStep < 0 ? block.length : nextStep + 1;
  const scriptMarker = "          script: |\n";
  const bodyStart = block.indexOf(scriptMarker, stepStart) + scriptMarker.length;
  if (stepStart < 0 || bodyStart < scriptMarker.length || bodyStart >= stepEnd) {
    throw new Error("recovery_workflow_inline_fixture_invalid");
  }
  const relative = block.slice(bodyStart, stepEnd).search(/[^\r\n ]/u);
  if (relative < 0) throw new Error("recovery_workflow_inline_fixture_invalid");
  const index = bodyStart + relative;
  const replacement = block[index] === "x" ? "y" : "x";
  const changedBlock = block.slice(0, index) + replacement + block.slice(index + 1);
  return source.replace(block, changedBlock);
}

function assertRecoveryWorkflowBeforeExternalWrite(source, onAccepted) {
  const parsed = parseWorkflowContractStrict(source);
  assertExactRecoveryJobRuntimeTopology(source, parsed, EXPECTED_JOB_RUNTIME_TOPOLOGY);
  assertExactRecoveryStepTopology(source, parsed, EXPECTED_RECOVERY_STEPS);
  const recoverStepBytes = firstRawStepBytes(source, "recover");
  const publishStepBytes = firstRawStepBytes(source, "publish_recovered");
  assert.deepEqual(recoverStepBytes, INLINE_AUTHORITY_FIXTURE.recoverAuthorityStepBytes);
  assert.equal(sha256Hex(recoverStepBytes), INLINE_AUTHORITY_FIXTURE.recoverAuthorityStepSha256);
  assert.deepEqual(publishStepBytes, INLINE_AUTHORITY_FIXTURE.publishAuthorityStepBytes);
  assert.equal(sha256Hex(publishStepBytes), INLINE_AUTHORITY_FIXTURE.publishAuthorityStepSha256);
  return onAccepted(parsed);
}

const FORBIDDEN_EXTRA_RECOVERY_STEPS = Object.freeze([
  "      - name: Forged extra run\n        run: exit 0",
  "      - name: Forged local action\n        uses: ./forbidden-action",
  "      - name: Forged Docker action\n        uses: docker://alpine:3.20",
  "      - name: Forged third-party action\n        uses: attacker/example-action@0123456789abcdef0123456789abcdef01234567",
  "      - name: Forged unlisted official action\n        uses: actions/cache@0123456789abcdef0123456789abcdef01234567",
  "      - name: Forged OIDC request environment\n        env:\n          ACTIONS_ID_TOKEN_REQUEST_TOKEN: forged\n          ACTIONS_ID_TOKEN_REQUEST_URL: https://invalid.example/oidc\n        run: exit 0",
]);
let recoveryExternalWriteEligibilityCalls = 0;
assert.equal(
  assertRecoveryWorkflowBeforeExternalWrite(workflowSource, () => {
    recoveryExternalWriteEligibilityCalls += 1;
    return "eligible";
  }),
  "eligible",
);
assert.equal(recoveryExternalWriteEligibilityCalls, 1);
recoveryExternalWriteEligibilityCalls = 0;
for (const jobName of Object.keys(EXPECTED_RECOVERY_STEPS)) {
  for (const extraStep of FORBIDDEN_EXTRA_RECOVERY_STEPS) {
    const rawFault = prependProtectedJobStep(workflowSource, jobName, extraStep);
    assert.throws(
      () => assertRecoveryWorkflowBeforeExternalWrite(rawFault, () => {
        recoveryExternalWriteEligibilityCalls += 1;
      }),
      /AssertionError|recovery_workflow_(?:steps|expression|permissions|runtime)_invalid/,
    );
  }
}
for (const rawFault of [
  addExplicitRecoveryScriptIndentIndicator(
    workflowSource,
    "recover",
    "Authorize production recovery",
  ),
  addExplicitRecoveryScriptIndentIndicator(
    workflowSource,
    "publish_recovered",
    "Authorize recovered publication",
  ),
  workflowSource.replace(
    "      - name: Authorize production recovery\n",
    '      - name: "Authorize production recovery"\n',
  ),
  workflowSource.replace(
    "      - name: Authorize recovered publication\n",
    '      - name: "Authorize recovered publication"\n',
  ),
  mutateOneRecoveryInlineScriptByte(
    workflowSource,
    "publish_recovered",
    "Prepare exact recovered asset and predicate",
  ),
  mutateOneRecoveryInlineScriptByte(
    workflowSource,
    "publish_recovered",
    "Read back and verify the complete recovered pair",
  ),
  replaceRecoveryInlineScriptBody(
    workflowSource,
    "publish_recovered",
    "Prepare exact recovered asset and predicate",
    '            throw new Error("forged_prepare");\n',
  ),
  replaceRecoveryInlineScriptBody(
    workflowSource,
    "publish_recovered",
    "Read back and verify the complete recovered pair",
    '            throw new Error("forged_postverify");\n',
  ),
]) {
  assert.throws(
    () => assertRecoveryWorkflowBeforeExternalWrite(rawFault, () => {
      recoveryExternalWriteEligibilityCalls += 1;
    }),
    /AssertionError|recovery_workflow_steps_invalid/,
  );
}
assert.equal(recoveryExternalWriteEligibilityCalls, 0);

assert.deepEqual(
  firstRawStepBytes(workflowSource, "recover"),
  INLINE_AUTHORITY_FIXTURE.recoverAuthorityStepBytes,
);
assert.equal(
  sha256Hex(firstRawStepBytes(workflowSource, "recover")),
  INLINE_AUTHORITY_FIXTURE.recoverAuthorityStepSha256,
);
assert.deepEqual(
  firstRawStepBytes(workflowSource, "publish_recovered"),
  INLINE_AUTHORITY_FIXTURE.publishAuthorityStepBytes,
);
assert.equal(
  sha256Hex(firstRawStepBytes(workflowSource, "publish_recovered")),
  INLINE_AUTHORITY_FIXTURE.publishAuthorityStepSha256,
);

const FORBIDDEN_PRIOR_PROTECTED_STEPS = Object.freeze([
  "      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  "      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
  "      - uses: actions/setup-node@v4",
  "      - uses: ./local-action",
  "      - uses: gccwebos-com/repository-action@master",
  "      - uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea",
  "        with:\n          script: return context.token",
  "      - run: node candidate.mjs",
  "        env:\n          FORGED_SECRET: ${{ secrets.JAPAN_CONTROL_DEPLOY_HOST }}",
  "        env:\n          FORGED_VAR: ${{ vars.JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION }}",
  "        env:\n          FORGED_OIDC: ${{ env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }}",
]);
for (const jobName of ["recover", "publish_recovered"]) {
  for (const priorStep of FORBIDDEN_PRIOR_PROTECTED_STEPS) {
    const fault = prependProtectedJobStep(workflowSource, jobName, priorStep);
    const parsedFault = parseWorkflowContractStrict(fault);
    assert.throws(
      () => assertAbsoluteAuthorityStepZero(
        parsedFault,
        jobName,
        jobName === "recover" ? "vultr-japan-production" : "artifact-publication",
      ),
      /recovery_workflow_step_zero_invalid|AssertionError/,
    );
  }
}

function rawRecoveryJobBlock(source, jobName) {
  const start = source.indexOf(`  ${jobName}:\n`);
  if (start < 0) throw new Error("recovery_workflow_job_missing");
  const tail = source.slice(start + 2);
  const next = tail.search(/^  [a-z0-9_]+:\n/m);
  return next < 0 ? source.slice(start) : source.slice(start, start + 2 + next);
}

function exactExpressionBodies(text) {
  if (text.includes("\r") || text.includes("\t")) throw new Error("recovery_workflow_expression_invalid");
  const rows = [...text.matchAll(/\$\{\{ ([^\r\n{}]+) \}\}/g)];
  if ((text.match(/\$\{\{/g) ?? []).length !== rows.length
      || (text.match(/\}\}/g) ?? []).length !== rows.length) {
    throw new Error("recovery_workflow_expression_invalid");
  }
  return rows.map((row) => row[1]);
}

function parsedExpressionBodies(value, seen = new Set()) {
  if (typeof value === "string") return exactExpressionBodies(value);
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) throw new Error("recovery_workflow_expression_invalid");
  seen.add(value);
  const rows = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("recovery_workflow_expression_invalid");
    rows.push(...parsedExpressionBodies(value[key], seen));
  }
  seen.delete(value);
  return rows;
}

function expressionMultiset(rows) {
  const counts = Object.create(null);
  for (const row of rows) counts[row] = (counts[row] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function assertClosedRawAndParsedExpressions(source, parsed, expectedByJob) {
  for (const [jobName, expected] of Object.entries(expectedByJob)) {
    const expectedSorted = Object.fromEntries(
      Object.entries(expected).sort(([a], [b]) => a.localeCompare(b, "en")),
    );
    assert.deepEqual(
      expressionMultiset(exactExpressionBodies(rawRecoveryJobBlock(source, jobName))),
      expectedSorted,
    );
    assert.deepEqual(expressionMultiset(parsedExpressionBodies(parsed.jobs[jobName])), expectedSorted);
  }
}

function assertExactRecoveryTokenSlots(source, parsed, expectedByJob, expectedCarriers) {
  for (const [jobName, expectedNames] of Object.entries(expectedByJob)) {
    const tokenSteps = parsed.jobs[jobName].steps.filter((step) =>
      step.env?.GITHUB_TOKEN !== undefined || step.with?.["github-token"] !== undefined);
    assert.deepEqual(tokenSteps.map(({ name }) => name), expectedNames);
    const carriers = tokenSteps.map((step) => step.env?.GITHUB_TOKEN !== undefined ? "env" : "action");
    assert.deepEqual(carriers, expectedCarriers[jobName]);
    for (let index = 0; index < tokenSteps.length; index += 1) {
      const step = tokenSteps[index];
      if (carriers[index] === "env") {
        assert.deepEqual(
          Object.keys(step.env).filter((name) => /^(?:GITHUB_TOKEN|GH_TOKEN)$/i.test(name)),
          ["GITHUB_TOKEN"],
        );
        assert.equal(step.env.GITHUB_TOKEN, "${{ github.token }}");
      } else {
        assert.equal(step.uses, step.name === "Attest the one exact recovered closeout subject"
          ? "actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6"
          : "actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea");
        assert.equal(step.with["github-token"], "${{ github.token }}");
        if (step.name === "Attest the one exact recovered closeout subject") {
          assert.deepEqual(Object.keys(step.with), [
            "github-token",
            "push-to-registry",
            "create-storage-record",
            "subject-path",
            "predicate-type",
            "predicate-path",
          ]);
          assert.equal(step.with["push-to-registry"], false);
          assert.equal(step.with["create-storage-record"], false);
          const actionContract = readPinnedActionContractFixture(
            "actions/attest",
            "1e69f48acb82d1966a394da916b4c1698aa569d6",
          );
          assert.equal(actionContract.version, "v4.2.2");
          assert.equal(actionContract.runs.using, "node24");
          assert.equal(actionContract.inputs["github-token"].default, "${{ github.token }}");
        }
      }
    }
    const rawTokenLines = rawRecoveryJobBlock(source, jobName).split("\n")
      .filter((line) => /GITHUB_TOKEN|GH_TOKEN|github\.token|secrets\.GITHUB_TOKEN/i.test(line));
    assert.deepEqual(rawTokenLines, carriers.map((carrier) => carrier === "env"
      ? "          GITHUB_TOKEN: ${{ github.token }}"
      : "          github-token: ${{ github.token }}"));
  }
}

function assertTrustedReadOnlyCheckoutTopology(parsed, expectedIndexes) {
  // These two read-only fetches are the sole default-token exception and are
  // deliberately outside EXPECTED_TOKEN_STEPS / the 1/2/4 explicit counts.
  const checkoutPin = "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10";
  for (const [jobName, expectedIndex] of Object.entries(expectedIndexes)) {
    const steps = parsed.jobs[jobName].steps;
    const checkoutIndexes = steps.flatMap((step, index) =>
      typeof step.uses === "string" && step.uses.startsWith("actions/checkout@") ? [index] : []);
    assert.deepEqual(checkoutIndexes, expectedIndex === null ? [] : [expectedIndex]);
    if (expectedIndex === null) continue;
    const checkout = steps[expectedIndex];
    assert.deepEqual(Object.keys(checkout), ["uses", "with"]);
    assert.equal(checkout.uses, checkoutPin);
    assert.deepEqual(Object.keys(checkout.with), ["persist-credentials", "ref"]);
    assert.equal(checkout.with["persist-credentials"], false);
    assert.equal(checkout.with.ref, "${{ github.sha }}");
    assert.equal(checkout.env, undefined);
    assert.equal(checkout.with.token, undefined);
    assert.equal(checkout.with["github-token"], undefined);
  }
}

function assertExactRecoveryOutputCommands(source, parsed) {
  const preflight = parsed.jobs.preflight.steps.find(({ name }) =>
    name === "Validate current master and original attempt");
  assert.equal(preflight.id, "preflight");
  assert.equal(preflight.run, [
    "set -euo pipefail",
    'test -f "$GITHUB_OUTPUT"',
    'test ! -L "$GITHUB_OUTPUT"',
    'node scripts/control-plane-receipt-recovery-controller.mjs preflight >> "$GITHUB_OUTPUT"',
    "",
  ].join("\n"));
  const validateResult = parsed.jobs.recover.steps.find(({ name }) =>
    name === "Classify recovery result");
  assert.equal(validateResult.id, "result");
  assert.equal(
    validateResult.run,
    'node scripts/control-plane-receipt-recovery-controller.mjs validate-result >> "$GITHUB_OUTPUT"',
  );
  const exactRawPreflight = [
    "        run: |",
    "          set -euo pipefail",
    '          test -f "$GITHUB_OUTPUT"',
    '          test ! -L "$GITHUB_OUTPUT"',
    '          node scripts/control-plane-receipt-recovery-controller.mjs preflight >> "$GITHUB_OUTPUT"',
  ].join("\n");
  assert.equal(source.split(exactRawPreflight).length - 1, 1);
  assert.equal(
    source.split('        run: node scripts/control-plane-receipt-recovery-controller.mjs validate-result >> "$GITHUB_OUTPUT"').length - 1,
    1,
  );
}

function assertExactRawRecoveryJobScalar(rawLines, key, expected) {
  const declarations = rawLines.filter((line) => line.startsWith(`    ${key}:`));
  assert.deepEqual(declarations, expected === null ? [] : [`    ${key}: ${expected}`]);
}

function assertExactRawRecoveryJobMap(rawLines, key, expected) {
  const declarations = rawLines.flatMap((line, index) =>
    line === `    ${key}:` ? [index] : []);
  if (expected === null) {
    assert.deepEqual(declarations, []);
    return;
  }
  assert.deepEqual(declarations.length, 1);
  const entries = [];
  for (let index = declarations[0] + 1; index < rawLines.length; index += 1) {
    if (!rawLines[index].startsWith("      ") || rawLines[index].startsWith("        ")) break;
    const match = /^      ([a-z][a-z0-9_-]*): (.+)$/.exec(rawLines[index]);
    if (!match) throw new Error("recovery_workflow_runtime_map_invalid");
    entries.push([match[1], match[2]]);
  }
  const observed = Object.fromEntries(entries);
  assert.deepEqual(Object.keys(observed), Object.keys(expected));
  assert.deepEqual(observed, expected);
}

function assertExactParsedRecoveryJobRuntimeTopology(parsed, expectedTopology) {
  for (const [jobName, expected] of Object.entries(expectedTopology)) {
    const job = parsed.jobs[jobName];
    assert.deepEqual(Object.keys(job), expected.keys);
    assert.equal(Object.hasOwn(job, "needs"), expected.needs !== null);
    if (expected.needs !== null) assert.equal(job.needs, expected.needs);
    assert.equal(job.if, expected.if);
    assert.equal(job["runs-on"], expected.runsOn);
    assert.equal(job["timeout-minutes"], expected.timeoutMinutes);
    assert.equal(Object.hasOwn(job, "environment"), expected.environment !== null);
    if (expected.environment !== null) assert.equal(job.environment, expected.environment);
    assert.equal(Object.hasOwn(job, "outputs"), expected.outputs !== null);
    if (expected.outputs !== null) {
      assert.deepEqual(Object.keys(job.outputs), Object.keys(expected.outputs));
      assert.deepEqual(job.outputs, expected.outputs);
    }
    assert.deepEqual(Object.keys(job.permissions), Object.keys(expected.permissions));
    assert.deepEqual(job.permissions, expected.permissions);
    for (const forbiddenKey of ["container", "services", "defaults", "uses"]) {
      assert.equal(Object.hasOwn(job, forbiddenKey), false);
    }
  }
}

function assertExactRawRecoveryJobRuntimeTopology(source, expectedTopology) {
  for (const [jobName, expected] of Object.entries(expectedTopology)) {
    const rawLines = rawRecoveryJobBlock(source, jobName).split("\n");
    const rawJobKeys = rawLines.flatMap((line) => {
      const match = /^    ([a-z][a-z0-9-]*):(?: |$)/.exec(line);
      return match ? [match[1]] : [];
    });
    assert.deepEqual(rawJobKeys, expected.keys);
    assertExactRawRecoveryJobScalar(rawLines, "needs", expected.needs);
    assertExactRawRecoveryJobScalar(rawLines, "if", expected.if);
    assertExactRawRecoveryJobScalar(rawLines, "runs-on", expected.runsOn);
    assertExactRawRecoveryJobScalar(rawLines, "timeout-minutes", expected.timeoutMinutes);
    assertExactRawRecoveryJobScalar(rawLines, "environment", expected.environment);
    assertExactRawRecoveryJobMap(rawLines, "outputs", expected.outputs);
    assertExactRawRecoveryJobMap(rawLines, "permissions", expected.permissions);
  }
}

function assertExactRecoveryJobRuntimeTopology(source, parsed, expectedTopology) {
  assertExactRawRecoveryJobRuntimeTopology(source, expectedTopology);
  assertExactParsedRecoveryJobRuntimeTopology(parsed, expectedTopology);
}

function assertExactRecoveryPermissionTopology(source, expectedJobs) {
  if (source.includes("\r") || /\t/.test(source)
      || /(?:^|\s)[&*][a-z0-9_-]+/im.test(source) || /^\s*<<:/m.test(source)) {
    throw new Error("recovery_workflow_permissions_invalid");
  }
  const lines = source.split("\n");
  const permissionNames = lines
    .map((line) => /^\s*([^:#]+):/.exec(line)?.[1]?.trim())
    .filter((name) => name?.toLowerCase() === "permissions");
  if (permissionNames.some((name) => name !== "permissions")) {
    throw new Error("recovery_workflow_permissions_invalid");
  }
  const root = lines.filter((line) => /^permissions(?:\s*:|:)/.test(line));
  if (root.length !== 1 || root[0] !== "permissions: {}") {
    throw new Error("recovery_workflow_permissions_invalid");
  }
  const observed = {};
  for (const jobName of Object.keys(expectedJobs)) {
    const block = rawRecoveryJobBlock(source, jobName).split("\n");
    const declarations = block.map((line, index) => ({ line, index }))
      .filter(({ line }) => /^    permissions(?::|\s*:)/.test(line));
    if (declarations.length !== 1 || declarations[0].line !== "    permissions:") {
      throw new Error("recovery_workflow_permissions_invalid");
    }
    const entries = Object.create(null);
    for (let index = declarations[0].index + 1; index < block.length; index += 1) {
      if (block[index].trim() === "") continue;
      if (!block[index].startsWith("      ")) break;
      const match = /^      ([a-z][a-z-]*): (read|write)$/.exec(block[index]);
      if (!match || Object.hasOwn(entries, match[1])) {
        throw new Error("recovery_workflow_permissions_invalid");
      }
      entries[match[1]] = match[2];
    }
    observed[jobName] = Object.freeze({ ...entries });
  }
  assert.deepEqual(observed, expectedJobs);
}

function assertExactParsedRecoveryWorkflowRootTopology(parsed, expectedKeys) {
  assert.deepEqual(Object.keys(parsed), expectedKeys);
  assert.equal(parsed.name, "Japan control-plane receipt recovery");
  assert.equal(Object.hasOwn(parsed, "defaults"), false);
  assert.equal(Object.hasOwn(parsed, "env"), false);
  assert.deepEqual(Object.keys(parsed.on), ["workflow_dispatch"]);
  assert.deepEqual(parsed.permissions, {});
  assert.deepEqual(parsed.concurrency, {
    group: "japan-control-plane-production-authority",
    "cancel-in-progress": false,
  });
  assert.deepEqual(Object.keys(parsed.jobs), ["preflight", "recover", "publish_recovered"]);
}

function assertExactRawRecoveryWorkflowRootTopology(source, expectedKeys) {
  if (source.includes("\r") || /\t/.test(source)
      || /(?:^|\s)[&*][a-z0-9_-]+/im.test(source) || /^\s*<<:/m.test(source)) {
    throw new Error("recovery_workflow_root_invalid");
  }
  const rawRootKeys = source.split("\n").flatMap((line) => {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?: |$)/.exec(line);
    return match ? [match[1]] : [];
  });
  assert.deepEqual(rawRootKeys, expectedKeys);
  assert.equal(source.split("name: Japan control-plane receipt recovery").length - 1, 1);
  assert.equal(rawRootKeys.includes("defaults"), false);
  assert.equal(rawRootKeys.includes("env"), false);
}

function assertExactRecoveryWorkflowRootTopology(source, parsed, expectedKeys) {
  assertExactRawRecoveryWorkflowRootTopology(source, expectedKeys);
  assertExactParsedRecoveryWorkflowRootTopology(parsed, expectedKeys);
}

const RECOVERY_WORKFLOW_ROOT_FAULTS = Object.freeze([
  workflowSource.replace(
    "permissions: {}",
    "defaults:\n  run:\n    shell: bash\n    working-directory: scripts\n\npermissions: {}",
  ),
  workflowSource.replace(
    "permissions: {}",
    "env:\n  FORGED_ROOT_VALUE: enabled\n\npermissions: {}",
  ),
  workflowSource.replace("permissions: {}", "timeout-minutes: 999\n\npermissions: {}"),
  workflowSource.replace(
    "permissions: {}\n\nconcurrency:\n  group: japan-control-plane-production-authority\n  cancel-in-progress: false",
    "permissions: &root_authority {}\n\nconcurrency: *root_authority",
  ),
  workflowSource.replace("permissions: {}", "Permissions: {}"),
  workflowSource.replace("permissions: {}", "permissions: {}\npermissions: {}"),
]);
for (const rawFault of RECOVERY_WORKFLOW_ROOT_FAULTS) {
  assert.notEqual(rawFault, workflowSource);
  assert.throws(
    () => assertExactRawRecoveryWorkflowRootTopology(rawFault, EXPECTED_WORKFLOW_ROOT_KEYS),
    /AssertionError|recovery_workflow_root_invalid/,
  );
  assert.throws(() => {
    const parsedFault = parseWorkflowContractStrict(rawFault);
    assertExactParsedRecoveryWorkflowRootTopology(parsedFault, EXPECTED_WORKFLOW_ROOT_KEYS);
  }, /AssertionError|duplicate|alias|merge|recovery_workflow_root_invalid/);
}

assertExactRecoveryWorkflowRootTopology(
  workflowSource,
  workflow,
  EXPECTED_WORKFLOW_ROOT_KEYS,
);
assertExactRecoveryJobRuntimeTopology(
  workflowSource,
  workflow,
  EXPECTED_JOB_RUNTIME_TOPOLOGY,
);
assertExactRecoveryStepTopology(workflowSource, workflow, EXPECTED_RECOVERY_STEPS);
assertExactRecoveryPermissionTopology(workflowSource, EXPECTED_JOB_PERMISSIONS);
assertClosedRawAndParsedExpressions(workflowSource, workflow, EXPECTED_JOB_EXPRESSIONS);
assertExactRecoveryTokenSlots(
  workflowSource,
  workflow,
  EXPECTED_TOKEN_STEPS,
  EXPECTED_TOKEN_CARRIERS,
);
assertTrustedReadOnlyCheckoutTopology(workflow, EXPECTED_TRUSTED_READ_ONLY_CHECKOUT_INDEX);
assertExactRecoveryOutputCommands(workflowSource, workflow);

function injectRecoveryExpressionCarrier(source, jobName, carrier, expression) {
  const expressionText = "${{ " + expression + " }}";
  const rows = Object.freeze({
    env: [
      "      - name: Forged env context",
      "        env:",
      `          FORGED_CONTEXT: "${expressionText}"`,
      "        run: exit 1",
    ],
    with: [
      "      - name: Forged with context",
      "        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
      "        with:",
      `          ref: "${expressionText}"`,
    ],
    argv: [
      "      - name: Forged argv context",
      `        run: node scripts/control-plane-receipt-recovery-controller.mjs cleanup "${expressionText}"`,
    ],
    stdin: [
      "      - name: Forged stdin context",
      `        run: printf '%s' "${expressionText}" | node scripts/control-plane-receipt-recovery-controller.mjs cleanup`,
    ],
  });
  if (!Object.hasOwn(rows, carrier)) throw new Error("recovery_workflow_expression_fixture_invalid");
  const block = rawRecoveryJobBlock(source, jobName);
  const changedBlock = block.replace("    steps:\n", `    steps:\n${rows[carrier].join("\n")}\n`);
  if (changedBlock === block) throw new Error("recovery_workflow_expression_fixture_invalid");
  return source.replace(block, changedBlock);
}

function buildRecoveryYamlAuthorityFaults(source) {
  const preflight = rawRecoveryJobBlock(source, "preflight");
  const recover = rawRecoveryJobBlock(source, "recover");
  const publisher = rawRecoveryJobBlock(source, "publish_recovered");
  return Object.freeze([
    source.replace("permissions: {}", "permissions: {}\npermissions: {}"),
    source.replace("permissions: {}", "permissions: &shared {}"),
    source.replace("permissions: {}", "permissions: *shared"),
    source.replace("permissions: {}", "permissions:\n  <<: *shared"),
    source.replace("permissions: {}", "Permissions: {}"),
    source.replace(preflight, preflight + preflight),
    source.replace(
      "      - name: Validate current master and original attempt",
      "      - name: Validate current master and original attempt\n"
        + "      - name: Validate current master and original attempt",
    ),
    source.replace(
      "          GITHUB_TOKEN: ${{ github.token }}",
      "          GITHUB_TOKEN: ${{ github.token }}\n"
        + "          GITHUB_TOKEN: ${{ github.token }}",
    ),
    source.replace("    permissions:\n", "    Permissions:\n"),
    source.replace("          GITHUB_TOKEN:", "          Github_Token:"),
    source.replace(
      recover,
      recover.replace("      contents: read", "      contents: read\n      issues: write"),
    ),
    source.replace(
      publisher,
      publisher.replace("      id-token: write", "      id-token: write\n      artifact-metadata: write"),
    ),
  ]);
}

function injectRecoveryJobRuntimeFault(source, jobName, faultName) {
  const block = rawRecoveryJobBlock(source, jobName);
  const expected = EXPECTED_JOB_RUNTIME_TOPOLOGY[jobName];
  const renderMap = (key, value) => [
    `    ${key}:`,
    ...Object.entries(value).map(([field, fieldValue]) => `      ${field}: ${fieldValue}`),
  ].join("\n");
  const extraRows = Object.freeze({
    container: "    container: ubuntu:24.04",
    services: "    services:\n      probe:\n        image: ubuntu:24.04",
    defaults: "    defaults:\n      run:\n        shell: bash",
    uses: "    uses: ./.github/workflows/forbidden-local-executor.yml",
    unlisted: "    executor: local",
  });
  let changedBlock;
  if (faultName === "local-runner") {
    changedBlock = block.replace(`    runs-on: ${expected.runsOn}`, "    runs-on: [self-hosted, local]");
  } else if (faultName === "needs") {
    changedBlock = expected.needs === null
      ? block.replace(`    if: ${expected.if}`, `    needs: recover\n    if: ${expected.if}`)
      : block.replace(`    needs: ${expected.needs}`, `    needs: ${expected.needs}-forged`);
  } else if (faultName === "if") {
    changedBlock = block.replace(`    if: ${expected.if}`, "    if: ${{ always() }}");
  } else if (faultName === "timeout") {
    changedBlock = block.replace(
      `    timeout-minutes: ${expected.timeoutMinutes}`,
      "    timeout-minutes: 360",
    );
  } else if (faultName === "environment") {
    changedBlock = expected.environment === null
      ? block.replace(
        `    runs-on: ${expected.runsOn}`,
        `    runs-on: ${expected.runsOn}\n    environment: artifact-publication`,
      )
      : block.replace(
        `    environment: ${expected.environment}`,
        `    environment: ${jobName === "recover" ? "artifact-publication" : "vultr-japan-production"}`,
      );
  } else if (faultName === "outputs") {
    if (expected.outputs === null) {
      changedBlock = block.replace(
        "    permissions:\n",
        "    outputs:\n      forged: ${{ github.actor }}\n    permissions:\n",
      );
    } else {
      const [field, value] = Object.entries(expected.outputs)[0];
      changedBlock = block.replace(`      ${field}: ${value}`, `      ${field}: \${{ github.actor }}`);
    }
  } else if (faultName === "outputs-order") {
    if (expected.outputs === null) {
      changedBlock = block.replace(
        "    permissions:\n",
        "    outputs:\n      forged_b: second\n      forged_a: first\n    permissions:\n",
      );
    } else {
      const entries = Object.entries(expected.outputs);
      const reordered = Object.fromEntries([entries[1], entries[0], ...entries.slice(2)]);
      changedBlock = block.replace(renderMap("outputs", expected.outputs), renderMap("outputs", reordered));
    }
  } else if (faultName === "permissions") {
    changedBlock = block.replace("      actions: read", "      actions: write");
  } else if (faultName === "permissions-order") {
    const entries = Object.entries(expected.permissions);
    const reordered = Object.fromEntries([entries[1], entries[0], ...entries.slice(2)]);
    changedBlock = block.replace(
      renderMap("permissions", expected.permissions),
      renderMap("permissions", reordered),
    );
  } else {
    if (!Object.hasOwn(extraRows, faultName)) throw new Error("recovery_workflow_runtime_fixture_invalid");
    changedBlock = block.replace(
      "    runs-on: ubuntu-24.04",
      `    runs-on: ubuntu-24.04\n${extraRows[faultName]}`,
    );
  }
  if (changedBlock === block) throw new Error("recovery_workflow_runtime_fixture_invalid");
  return source.replace(block, changedBlock);
}

for (const jobName of Object.keys(EXPECTED_JOB_RUNTIME_TOPOLOGY)) {
  for (const faultName of [
    "container",
    "services",
    "defaults",
    "uses",
    "unlisted",
    "local-runner",
    "needs",
    "if",
    "timeout",
    "environment",
    "outputs",
    "outputs-order",
    "permissions",
    "permissions-order",
  ]) {
    const rawFault = injectRecoveryJobRuntimeFault(workflowSource, jobName, faultName);
    const parsedFault = parseWorkflowContractStrict(rawFault);
    assert.throws(
      () => assertExactRawRecoveryJobRuntimeTopology(rawFault, EXPECTED_JOB_RUNTIME_TOPOLOGY),
      /AssertionError|recovery_workflow_runtime_(?:invalid|map_invalid)/,
    );
    assert.throws(
      () => assertExactParsedRecoveryJobRuntimeTopology(parsedFault, EXPECTED_JOB_RUNTIME_TOPOLOGY),
      /AssertionError|recovery_workflow_runtime_(?:invalid|map_invalid)/,
    );
    assert.throws(
      () => assertRecoveryWorkflowBeforeExternalWrite(rawFault, () => {
        recoveryExternalWriteEligibilityCalls += 1;
      }),
      /AssertionError|recovery_workflow_runtime_(?:invalid|map_invalid)/,
    );
  }
}
assert.equal(recoveryExternalWriteEligibilityCalls, 0);

const PREFLIGHT_OUTPUT_COMMAND = '          node scripts/control-plane-receipt-recovery-controller.mjs preflight >> "$GITHUB_OUTPUT"';
const VALIDATE_RESULT_OUTPUT_COMMAND = '        run: node scripts/control-plane-receipt-recovery-controller.mjs validate-result >> "$GITHUB_OUTPUT"';
const RECOVERY_OUTPUT_COMMAND_FAULTS = Object.freeze([
  workflowSource.replace('          test -f "$GITHUB_OUTPUT"\n', ""),
  workflowSource.replace('          test ! -L "$GITHUB_OUTPUT"\n', ""),
  workflowSource.replace(PREFLIGHT_OUTPUT_COMMAND, PREFLIGHT_OUTPUT_COMMAND.replace('"$GITHUB_OUTPUT"', "$GITHUB_OUTPUT")),
  workflowSource.replace(PREFLIGHT_OUTPUT_COMMAND, PREFLIGHT_OUTPUT_COMMAND.replace(">>", ">")),
  workflowSource.replace(PREFLIGHT_OUTPUT_COMMAND, PREFLIGHT_OUTPUT_COMMAND.replace(' >> "$GITHUB_OUTPUT"', "")),
  workflowSource.replace(PREFLIGHT_OUTPUT_COMMAND, PREFLIGHT_OUTPUT_COMMAND.replace("GITHUB_OUTPUT", "GITHUB_ENV")),
  workflowSource.replace(VALIDATE_RESULT_OUTPUT_COMMAND, VALIDATE_RESULT_OUTPUT_COMMAND.replace(' >> "$GITHUB_OUTPUT"', "")),
]);
for (const rawFault of RECOVERY_OUTPUT_COMMAND_FAULTS) {
  assert.notEqual(rawFault, workflowSource);
  const parsedFault = parseWorkflowContractStrict(rawFault);
  assert.throws(
    () => assertExactRecoveryOutputCommands(rawFault, parsedFault),
    /AssertionError|recovery_workflow_output_invalid/,
  );
}

const publisherBlockForCheckoutFault = rawRecoveryJobBlock(workflowSource, "publish_recovered");
const TRUSTED_CHECKOUT_FAULTS = Object.freeze([
  workflowSource.replace(
    "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    "actions/checkout@main",
  ),
  workflowSource.replace("          persist-credentials: false", "          persist-credentials: true"),
  workflowSource.replace("          persist-credentials: false\n", ""),
  workflowSource.replace(
    publisherBlockForCheckoutFault,
    publisherBlockForCheckoutFault.replace(
      "    steps:\n",
      "    steps:\n"
        + "      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10\n"
        + "        with:\n"
        + "          persist-credentials: false\n"
        + "          ref: ${{ github.sha }}\n",
    ),
  ),
]);
for (const rawFault of TRUSTED_CHECKOUT_FAULTS) {
  assert.notEqual(rawFault, workflowSource);
  const parsedFault = parseWorkflowContractStrict(rawFault);
  assert.throws(
    () => assertTrustedReadOnlyCheckoutTopology(
      parsedFault,
      EXPECTED_TRUSTED_READ_ONLY_CHECKOUT_INDEX,
    ),
    /AssertionError|recovery_workflow_checkout_invalid/,
  );
}

const FORBIDDEN_CONTEXT_EXPRESSIONS = Object.freeze([
  "github['token']",
  'github["token"]',
  "GitHub.token",
  "toJSON(github)",
  "fromJSON(toJSON(github)).token",
  "format('{0}', github.token)",
  "secrets.GITHUB_TOKEN",
  "secrets['GITHUB_TOKEN']",
  "toJSON(secrets)",
  "env.GITHUB_TOKEN",
  "needs.preflight.outputs.forwarded_token",
]);
for (const jobName of Object.keys(EXPECTED_JOB_EXPRESSIONS)) {
  for (const expression of FORBIDDEN_CONTEXT_EXPRESSIONS) {
    for (const carrier of ["env", "with", "argv", "stdin"]) {
      const rawFault = injectRecoveryExpressionCarrier(workflowSource, jobName, carrier, expression);
      assert.throws(
        () => assertClosedRawAndParsedExpressions(
          rawFault,
          parseWorkflowContractStrict(rawFault),
          EXPECTED_JOB_EXPRESSIONS,
        ),
        /recovery_workflow_expression_invalid|AssertionError/,
      );
    }
  }
}

for (const rawFault of buildRecoveryYamlAuthorityFaults(workflowSource, {
  anchors: true,
  aliases: true,
  mergeKeys: true,
  duplicateWorkflowPermissions: true,
  duplicateJob: true,
  duplicateStep: true,
  duplicateEnvKey: true,
  permissionCaseDrift: true,
  tokenCaseDrift: true,
})) {
  assert.throws(() => {
    const parsedFault = parseWorkflowContractStrict(rawFault);
    assertExactRecoveryJobRuntimeTopology(
      rawFault,
      parsedFault,
      EXPECTED_JOB_RUNTIME_TOPOLOGY,
    );
    assertExactRecoveryStepTopology(rawFault, parsedFault, EXPECTED_RECOVERY_STEPS);
    assertExactRecoveryPermissionTopology(rawFault, EXPECTED_JOB_PERMISSIONS);
    assertClosedRawAndParsedExpressions(rawFault, parsedFault, EXPECTED_JOB_EXPRESSIONS);
    assertExactRecoveryTokenSlots(
      rawFault,
      parsedFault,
      EXPECTED_TOKEN_STEPS,
      EXPECTED_TOKEN_CARRIERS,
    );
  }, /recovery_workflow_(?:permissions|expression)_invalid|duplicate|alias|merge|AssertionError/);
}
```

Deep-compare the complete parsed authority skeleton for every job, not only `recover`: exact ordered `Object.keys(job)`, literal `runs-on: ubuntu-24.04`, `if`, `needs`, Environment presence/value, outputs, timeout, permissions, checkout credential setting, token-bearing step names/counts, official-attestation step count, and fixed commands must match the frozen YAML. Independently extract the four-space raw job-key sequence and require the same order. The executable fault table changes every non-step job authority value independently—including `needs`, `if`, runner, timeout to `360`, Environment, output value/order, and permission value/order—and requires both raw and parsed checks to fail before the external-write eligibility callback. Every job rejects `container`, `services`, `defaults`, reusable-job `uses`, a self-hosted/local runner, or any unlisted job runtime key in both raw and parsed tests; preflight has no Environment, recover has only `vultr-japan-production`, and publisher has only `artifact-publication`. The raw and parsed expression multisets above are both closed; neither may trust the other, and every `${{ ... }}` delimiter/space/body must be byte-canonical. Inject each forbidden context through `env`, `with`, shell argv, and stdin-shaped shell text in every job and require both layers to reject it. Slice each raw job block independently and reject a YAML alias/anchor/merge key, duplicate `permissions`/`env`/job/step key, alternate-case permission or token name, later hidden token placement, unlisted scope, and any `actions: write`, `checks: write`, `deployments: write`, `packages: write`, `pull-requests: write`, or repository/OIDC write outside the exact publisher map. `contents: write` and `attestations: write` occur only in `publish_recovered`; `id-token: write` occurs only in `recover` for challenge audience and `publish_recovered` for the one pinned attestation action. A raw-text forbidden-scope scan supplements rather than replaces parsed deep equality.

Also assert all three jobs require `refs/heads/master`. `preflight` has no Environment/secrets and uses its sole explicit `actions: read` step token only to canonicalize the exact `vultr-japan-production` user-only policy bytes/digest. The pinned read-only checkout in preflight, and the identical checkout only at recover step index one after authorization, may use checkout's built-in fetch token under `contents: read`; exact pin, index, `persist-credentials: false`, `ref: ${{ github.sha }}`, no token input/env, and zero retained credential are mandatory, and these two fetches do not enter the `1/2/4` explicit-placement counts. Publisher has no checkout. In both protected jobs, `steps[0]` is byte-for-byte Artifact Task 7 Step 6a extension's exact rendered `recoverAuthorityStepBytes` or `publishAuthorityStepBytes` wrapper under pinned `actions/github-script`, with the matching wrapper SHA-256, correct fixed Environment, explicit `github-token`, and exact context multiset. Each parsed script contains the extension-owned `authorityControlBytes` exactly once followed by exactly one explicit awaited invocation. There is no prior step of any kind: injecting checkout, download, setup, local/repository action, shell, implicit/default token action, secret/variable/OIDC reference, anchor/alias, or empty-looking executable wrapper before it fails raw and parsed tests. In `recover`, only after that proof exists may checkout/download occur; the later recovery step alone receives the proof, exact `JAPAN_CONTROL_DEPLOY_*` five-secret, and bootstrap/authorization variables. Team/unknown/drift/self/admin-bypass/wrong run-attempt-ref-SHA leaves checkout/download, every protected getter, OIDC, materializer, SSH, and host calls at zero. `publish_recovered` is bound exactly to `artifact-publication` and has no checkout, setup, repository/local action, production Environment/SSH/OIDC-production value, or repository script. After absolute-step-zero authorization it downloads only the data artifact and executes the exact Artifact Task 7 Step 6a extension-owned inline `publisherPrepareBytes`. Current prepare then raises `github_full_sigstore_owner_unavailable` before Release/asset or subject/predicate effects and emits no `attest_missing`; therefore the pinned `actions/attest` and inline postverify rows are unreachable, and neither attestation nor completion is a current claim. The four publisher token placements, explicit attestation `github-token`/OIDC input, exact single subject/predicate paths, and condition only on owner `attest_missing` remain frozen future structural assertions, not current execution acceptance. A future separately approved owner must re-prove their semantics; no glob, second subject, shell/custom attester, caller path, implicit publisher token, or candidate executable is admitted by the reserved topology. The exact preflight shell first checks `$GITHUB_OUTPUT` is a non-symlink regular file and then appends the two owner-validated safe lines through quoted `>> "$GITHUB_OUTPUT"`; removing either check, quoting, append mode, or redirect fails. `validate-result` keeps its existing exact safe redirect. Every upload has `retention-days: 35`, `if-no-files-found: error`, one fixed non-hidden regular-file path, and a pre-upload/after-download owner check for sole entry/mode/size/canonical/no-secret content. No-claim uploads only its fixed diagnostic, skips the publisher, and exits nonzero; no job invokes deployment/ACK/upload-start commands or a closeout-transition audience.

The attestation contract is separately exact: `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6` is the live immutable v4.2.2/node24 action, and its `with` map has exact ordered keys `github-token,push-to-registry,create-storage-record,subject-path,predicate-type,predicate-path`. `github-token` explicitly equals `${{ github.token }}`; both hardening inputs are literal `false`. Tests load the pinned `action.yml` fixture and reject the old pin, omitted/implicit token, either omitted/non-false hardening input, action-default drift, extra input, or any `artifact-metadata` permission.

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
          RECOVERY_REPOSITORY: ${{ github.repository }}
          RECOVERY_ACTOR: ${{ github.actor }}
          RECOVERY_TRIGGERING_ACTOR: ${{ github.triggering_actor }}
          RECOVERY_RUN_ID: ${{ github.run_id }}
          RECOVERY_RUN_ATTEMPT: ${{ github.run_attempt }}
          RECOVERY_REF: ${{ github.ref }}
          RECOVERY_SHA: ${{ github.sha }}
          CONTROLLER_RECOVERY_ID: ${{ inputs.controller_recovery_id }}
          ORIGINAL_RUN_ID: ${{ inputs.original_run_id }}
          ORIGINAL_RUN_ATTEMPT: ${{ inputs.original_run_attempt }}
          RECOVERY_CONFIRMATION: ${{ inputs.confirmation }}
        run: |
          set -euo pipefail
          test -f "$GITHUB_OUTPUT"
          test ! -L "$GITHUB_OUTPUT"
          node scripts/control-plane-receipt-recovery-controller.mjs preflight >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: ${{ steps.preflight.outputs.preflight_artifact_name }}
          path: control-plane-recovery-runner-temp/preflight/recovery-preflight.json
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
      attestations: read
      contents: read
      id-token: write
    steps:
      - name: Authorize production recovery
        id: authority
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          RECOVERY_AUTHORITY_ENVIRONMENT: vultr-japan-production
          RECOVERY_REPOSITORY: ${{ github.repository }}
          RECOVERY_ACTOR: ${{ github.actor }}
          RECOVERY_TRIGGERING_ACTOR: ${{ github.triggering_actor }}
          RECOVERY_RUN_ID: ${{ github.run_id }}
          RECOVERY_RUN_ATTEMPT: ${{ github.run_attempt }}
          RECOVERY_REF: ${{ github.ref }}
          RECOVERY_SHA: ${{ github.sha }}
          RECOVERY_PREFLIGHT_SHA256: ${{ needs.preflight.outputs.preflight_sha256 }}
        with:
          github-token: ${{ github.token }}
          script: |
            // Exact byte-for-byte Artifact Task 7 Step 6a rendered wrapper script:
            // fixed crypto require + authorityControlBytes + one explicit awaited invocation;
            // server/tests rejects either documentation marker in real source.
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          persist-credentials: false
          ref: ${{ github.sha }}
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: ${{ needs.preflight.outputs.preflight_artifact_name }}
          path: control-plane-recovery-runner-temp/download/preflight
      - name: Read one retained terminal record
        id: recover
        env:
          GITHUB_TOKEN: ${{ github.token }}
          RECOVERY_APPROVAL_PROOF_BASE64: ${{ steps.authority.outputs.approval_proof_base64 }}
          RECOVERY_APPROVAL_PROOF_SHA256: ${{ steps.authority.outputs.approval_proof_sha256 }}
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
      - name: Upload validated recovery result
        if: ${{ steps.result.outputs.result_kind == 'validated' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}
          path: control-plane-recovery-runner-temp/result/recovered-closeout.json
          if-no-files-found: error
          retention-days: 35
      - name: Upload no-claim recovery result
        if: ${{ steps.result.outputs.result_kind == 'no_claim' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}
          path: control-plane-recovery-runner-temp/result/recovery-attempt-no-claim.json
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
    environment: artifact-publication
    permissions:
      actions: read
      attestations: write
      contents: write
      id-token: write
    steps:
      - name: Authorize recovered publication
        id: authority
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          RECOVERY_AUTHORITY_ENVIRONMENT: artifact-publication
          RECOVERY_REPOSITORY: ${{ github.repository }}
          RECOVERY_ACTOR: ${{ github.actor }}
          RECOVERY_TRIGGERING_ACTOR: ${{ github.triggering_actor }}
          RECOVERY_RUN_ID: ${{ github.run_id }}
          RECOVERY_RUN_ATTEMPT: ${{ github.run_attempt }}
          RECOVERY_REF: ${{ github.ref }}
          RECOVERY_SHA: ${{ github.sha }}
        with:
          github-token: ${{ github.token }}
          script: |
            // Exact byte-for-byte Artifact Task 7 Step 6a rendered wrapper script:
            // fixed crypto require + authorityControlBytes + one explicit awaited invocation;
            // server/tests rejects either documentation marker in real source.
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: receipt-recovery-result-${{ github.run_id }}-${{ needs.recover.outputs.producing_run_attempt }}
          path: control-plane-recovery-runner-temp/download/result
      - name: Prepare exact recovered asset and predicate
        id: prepare
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          RECOVERY_APPROVAL_PROOF_BASE64: ${{ steps.authority.outputs.approval_proof_base64 }}
          RECOVERY_APPROVAL_PROOF_SHA256: ${{ steps.authority.outputs.approval_proof_sha256 }}
        with:
          github-token: ${{ github.token }}
          script: |
            // Exact byte-for-byte Artifact Task 7 Step 6a extension publisherPrepareBytes fixture.
            // The committed workflow contains the complete reviewed body here.
      - name: Attest the one exact recovered closeout subject
        if: ${{ steps.prepare.outputs.attest_missing == 'true' }}
        uses: actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6
        with:
          github-token: ${{ github.token }}
          push-to-registry: false
          create-storage-record: false
          subject-path: control-plane-recovery-runner-temp/publication/subject/${{ steps.prepare.outputs.asset_name }}
          predicate-type: https://slsa.dev/provenance/v1
          predicate-path: control-plane-recovery-runner-temp/publication/predicate/recovered-closeout-predicate.json
      - name: Read back and verify the complete recovered pair
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        with:
          github-token: ${{ github.token }}
          script: |
            // Exact byte-for-byte Artifact Task 7 Step 6a extension publisherPostverifyBytes fixture.
            // The committed workflow contains the complete reviewed body here.
```

`validate-result` emits exactly three safe lines: `result_kind=validated|no_claim`, `result_artifact_name=receipt-recovery-result-{recoveryRunId}-{producingRunAttempt}`, and `producing_run_attempt={producingRunAttempt}`. The reported name is diagnostic only: the workflow raw-source contract proves it byte-equal to `receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}` at production, while the publisher download selector remains frozen as `receipt-recovery-result-${{ github.run_id }}-${{ needs.recover.outputs.producing_run_attempt }}` and never reads `needs.recover.outputs.result_artifact_name`. The producing attempt output is accepted only as a canonical positive integer that byte-equals the attempt inside the downloaded owner-validated recovered envelope; it is a binding component, not a caller-reported name. It first proves the corresponding fixed result path is the sole regular mode-`0600` bounded canonical no-secret file; exactly one of the two conditional upload steps can then run. The publisher downloads that exact same-run/producing-attempt artifact and repeats the same file proof, but current exact prepare then raises `github_full_sigstore_owner_unavailable` before any Release/asset read or write, subject/predicate file, publisher output, or pinned-attest eligibility. The pinned `actions/attest` and postverify rows are consequently unreachable and the job cannot succeed or emit completion. The generic selector, later `readbackAt`, exact subject/predicate, states `none`, `asset_only`, `attestation_only`, `complete`, publisher-only rerun/resume, response-loss behavior, and completed-pair semantics are future separately approved dormant design material; none belongs to current GREEN or acceptance. Rerunning the protected recovery job may create a new attempt-bound recovered-result artifact, but it still cannot enter publication. The no-claim artifact uploads first and then the protected job exits nonzero, so its diagnostic is durable without presenting a green recovery run. `cleanup` removes only exact restricted runner-temporary material created by the controller, verifies each absent, retains only the validated aggregate result until upload, and never contacts the host. Preflight byte-compares `github.ref`, current `master` SHA, workflow path/ref/SHA, and exact input/run attempt before the protected job becomes eligible.

- [ ] **Step 4 (3 min): Run GREEN and workflow permission/retention regression**

```powershell
node --test server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Expected: dispatch, concurrency, exact production/publisher Environments, complete three-job ordered-key/runtime/permission equality, literal `ubuntu-24.04`, raw and parsed rejection of container/services/defaults/reusable/local/unlisted job topology, raw and parsed closed expression/context equality, raw duplicate/alias/merge/case/unlisted-scope rejection, exact explicit token placement counts `1/2/4`, the two separately verified pinned read-only checkout default-fetch exceptions with `persist-credentials: false`, byte/hash-equal absolute authority `steps[0]`, zero prior executable/token/secret/OIDC consumer, recover authorization before checkout/download/protected material, exact regular/non-symlink quoted preflight `$GITHUB_OUTPUT` append plus unchanged validate-result redirect, no-checkout data-only publisher isolation, both result uploads using owner-derived `receipt-recovery-result-${{ github.run_id }}-${{ github.run_attempt }}`, the fixed publisher download selector not using `result_artifact_name`, fixed non-hidden single-file 35-day paths, no-claim skip, and forbidden-command assertions all pass. The exact Artifact prepare/postverify bytes additionally execute in the Task 7 cross-document harness and both raise `github_full_sigstore_owner_unavailable` with zero publication/file/output/attestation/completion effects. Pinned-attest and postverify rows remain byte-frozen but unreachable; five-state resume and completion are not current GREEN.

- [ ] **Step 5 (2 min): Commit workflow source and contract test**

```powershell
git add .github/workflows/control-plane-receipt-recovery.yml server/tests/control-plane-receipt-recovery-workflow.test.mjs
git commit -m "feat(deploy): add manual receipt recovery workflow"
```

---

## Future Source-Only Validation And Integration Handoff (Currently Unreachable)

There is no current Receipt implementation validation or integration handoff. The only permitted handoff from this docs-only correction is the reviewed Receipt-document diff plus its final SHA-256/line/byte tuple and proof that the original seven-document worktree scope did not expand. It must say `full_sigstore_owner_topology_unapproved`, offline npm closure authorization STOP, Receipt Tasks 1-8 future dormant, no Task implementation/test/commit/push/GREEN, no workflow dispatch/publication/production action, and no main implementation PR authorization. Passing current document checks cannot be relabeled as a Task checkpoint, source validation, independent implementation review, or readiness evidence.

The current raw-document authorization regression must prove all of the following before accepting this plan edit: the exact global STOP appears before the first `### Task 1`; the separate exact 11-file authority-bootstrap predecessor is the sole current exception and is excluded from Receipt progress; all three future resume providers—unified full-Sigstore owner, owner-postverified immutable Foundation v2 lock, and complete content-addressed offline npm closure—are conjunctive and followed by a new explicit Risk A authorization; and Task 1-8 implementation, tests, staging, commit, push, main PR, handoff, and GREEN claims are all denied. Fault copies that remove the STOP, broaden the exact 11-file exception, omit any one resume provider, or turn any current prohibition into permission must fail this regression before any implementation-eligibility callback. The same regression must also prove the nested recovery contract is unchanged: exact `github_full_sigstore_owner_unavailable`, the ordered three-job workflow topology and existing exact step/value/token assertions, literal `pollIndex < 6` with only indices `0..5`, and the separate 30-second seventh no-request/no-claim boundary. Its owner-attribution stale scan permits Artifact Task 6 base to own only `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT` and the separate token/fetch live-refresh parser; Receipt consumes only the contract and must never call that parser. The scan rejects any Task 6 attribution of the SHA export, zero-argument fixture, authority/prepare/postverify bytes or hashes, either rendered authority-step wrapper byte/hash pair, or the exact ordered 11-key fixture ABI, and requires every such surface in Interfaces, YAML comments, acceptance prose, and handoff prose to name Artifact Task 7 Step 6a extension before the implementation-eligibility callback.

Current document-only verification is limited to parsing all existing JavaScript and JSON fences, checking complete fence balance, running the repository documentation-authority and project-state checks, running raw authorization/recovery static assertions, `git diff --check`, exact seven-document status/staged/untracked inspection, and hashing this file. These commands may use the already present local dependency closure but must perform no install/fetch and cannot prove the separately missing offline npm closure. The task-specific Node suites and full `npm test` below are future-only and must not be invoked or claimed under this plan's current authorization.

After the conjunctive resume Gate and a new explicit Risk A authorization, the rollout/docs integration plan exclusively owns `schemas/README.md` and `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`. The following table is its future exact schema-index handoff; do not hand it off as implemented current state:

| Schema | Authority/mutability statement |
| --- | --- |
| `control-plane-host-terminal-receipt-v1.schema.json` | immutable host terminal facts; initial controller artifact state only |
| `control-plane-host-terminal-record-v1.schema.json` | immutable outer replay and receipt-digest binding |
| `control-plane-host-closeout-record-v1.schema.json` | separate monotonic host CAS and disposition record |
| `control-plane-controller-closeout-v1.schema.json` | immutable original Actions payload; terminal branch exact-copies Receipt-owned `terminalPublishedAt`; never rewritten with upload metadata |
| `control-plane-controller-final-status-v1.schema.json` | aggregate-only terminal/no-claim controller output; terminal branch preserves owner `terminalPublishedAt`, no-claim fixes it `null`, both branches retain the plan-bound four-field main-source identity, and exact bytes are the sole Deploy Note input |
| `control-plane-receipt-recovery-challenge-v1.schema.json` | volatile root-HMAC challenge with a 60-second maximum lifetime |
| `control-plane-recovered-closeout-v1.schema.json` | immutable validated recovery claim eligible for fixed publication |
| `control-plane-recovery-attempt-no-claim-v1.schema.json` | attempt-scoped diagnostic with no publication or Deploy Note authority |

The future integration documentation must state that present-artifact retention comes from exact `created_at`/`expires_at`/`digest` metadata rather than repository Administration settings; `readbackAt` is trusted-clock validation input excluded from the stable observation value/bytes/SHA; and only the host closeout record can move to `upload_committed_observed`.

After that future resume, Artifact Task 11 must implement `server/services/deployment/control-plane-production-controller.mjs` and its CLI imports of Bootstrap `readTerminalBundleBytes(...)` plus Receipt-owned `createControllerCloseoutAdapter(...)`, `buildControllerFinalStatus(...)`, and `validateControllerFinalStatus(...)`; Artifact Task 12 owns the production workflow plus its preflight/postapproval composition and wires that exact controller into `.github/workflows/japan-control-plane-production-deploy.yml`. Artifact Task 13's isolated Deploy Note writer separately imports `inspectControllerFinalStatus(...)` and `validateControllerFinalStatus(...)` for the two-stage no-claim-first/live-identity-second flow; the normal controller does not import the inspector. All five validated terminal result codes may write at most one bounded Deploy Note comment. Exact `validated_deployment` alone includes `deployed_at: validatedFinalStatus.terminalPublishedAt`; `validated_stopped_pre_switch`, `validated_schema_only_change`, `validated_rolled_back`, and `validated_critical_failure` use their exact validated failure/outcome wording and omit `deployed_at`. No row uses `validatedFinalStatus.observedAt`, a writer clock, or workflow time as deployment time; no-claim/nonterminal rows write zero comments. Receipt does not own or recreate any of those three Artifact owner surfaces. Integration Task 6 later verifies their exact committed bytes and real owner/cross-owner tests without modifying, staging, or recommitting them. The controller creates one `createSecureSshTransport({ native, clock, secretMaterializer })` for its full status/bundle/closeout lifecycle and closes it exactly once in an outer `finally`. For a terminal ordinary status, Artifact preserves the exact privately branded sixteen-field result unchanged, calls `readTerminalBundleBytes({ transport, validatedStatus: status, timeoutMs: 30000 })`, then passes the same `status`, untouched bundle wrapper, and canonical `null` or unchanged five-field `artifactAccepted` value to `validateTerminal({ status, terminalBundle, plan, artifactAccepted })`. Bootstrap alone validates bundle-chunk transport envelopes; Receipt alone parses the canonical terminal bundle and returns the safe terminal result including Host-derived `transactionInvocationSha256` and Receipt-owned `terminalPublishedAt`.

The two closeout completion stages remain distinct. First, the controller passes each object returned by `createUploadStartedRequest(...)` and `createAckRequest(...)` unchanged to `transport.request(...)`, then passes each complete transport envelope to `validateUploadStartedResponse(...)` or `validateAckResponse(...)`. The ACK call is exactly `validateAckResponse({ transportResult, immutable, observation, uploadStartedStatus, expected })`; when present it returns only the validated eight-field `status_closeout_ack` value plus `responseSha256` and cannot become final status. A possibly lost response leaves `ackStatus: null` and never causes an ACK retry. Second, after that one ACK attempt, `createCommittedStatusRequest({ plan, immutable, observation, ackStatus })` returns `{ transportRequest, expectedStatus }`, with exact `{ requestId, gateId, deploymentPlanSha256, transactionId }`; request ID is correlation only. Artifact passes the nested request unchanged to `.request(...)`, then calls `validateUploadCommittedObserved({ transportResult, immutable, closeoutBindings: adapter.expectedBindings({ plan }), observation, terminal, ackStatus, expectedStatus })`. That validator requires the independently read-back ordinary status recovery ID to byte-equal both the canonical immutable and closeout binding recovery IDs before it returns the sixteen-field ordinary status plus its own `responseSha256`; only this distinct object can become `validatedFinalHostStatus`. Bootstrap owns envelope validation inside bundle reads; Receipt owns envelope validation for upload-start, ACK, and the post-ACK ordinary status.

The Actions readback result remains the full stable `{ value, bytes, sha256 }` observation wrapper through ACK and final-status construction. Its trusted `readbackAt` is used only to validate `createdAt <= readbackAt < expiresAt` and the minimum retention interval, then discarded before canonical serialization; later host recovery of the same still-live artifact must reproduce the same bytes/SHA. A future separately approved publisher-only readback would have to preserve that equality, but no current recovered-publication path reaches it. For a no-claim branch, `createNoClaimEvidence(...)` supplies non-null immutable closeout bytes and exact bindings, including `mainSourceIdentitySha256`, `mainSourcePrNumber`, `mainSourceHeadSha`, and `mainSourceMergeCommitSha`, while observation and validated final host status are both `null`; it makes no terminal-bundle read, upload-start, closeout artifact upload, ACK, or committed-status request. Both terminal and no-claim final statuses preserve that four-field tuple from the plan even when `sourceCommit` is a later reconciliation descendant; its presence never makes no-claim Deploy Note eligible. Receipt performs only canonical shape/equality validation and imports no GitHub main-source resolver. No controller/workflow path reads or passes host, port, username, private key, or known-hosts bytes. Transport-only labels such as `stopped_pre_apply`, `rolled_back_validated`, or `controller_closeout_pending` cannot become controller closeout results; they must be resolved through the five host final states or the exact no-production-claim results before serialization. A generic `closeoutPublisher.publish({ plan, terminal })`, inner-observation-only handoff, ACK-as-final-status substitution, or `null` controller-closeout shortcut is forbidden. Terminal closeout must execute the fixed bundle/Receipt validation, cleanup, Bootstrap-owned full-tuple OIDC `upload_started`, 35-day immutable upload, Actions readback, local-file deletion, one independently bound ACK attempt, and separate read-only host `upload_committed_observed` observation. Receipt then hands Artifact only the exact frozen pending `{ resultKind, finalStatus }` result and makes zero lifecycle, sink, GitHub-output, success, or Deploy Note calls. Artifact Task 11 alone retains that pending result while it closes the transport, destroys and reads back absent every OIDC value, closes and reads back the raw/replay artifact stream, and requires literal `true` from `runnerMaterialStore.lifecycle.finalizeAndReadBackAbsent()`; only then may it call `finalStatusSink.writeExact({ bytes, sha256 })`, append outputs, and emit success. It writes `buildControllerFinalStatus(...)` bytes unchanged, and the final-status artifact and Deploy Note validate those exact bytes without reconstructing a local status object.

The recovery-controller script is workflow-only executable source with its exact command table, zero-argument fixed operations, testable runner, direct-main guard, closed ports, `0/1/2` exit table, and isolated child-process tests. The separate controller-closeout script is only a two-command stateless canonical-bytes utility; the production workflow never invokes it, and all private-branded closeout lifecycle APIs remain in Artifact's one controller process. Publication uses only Artifact Task 7 Step 6a extension's fixed inline authority/prepare/postverify bodies and no repository publisher script; Artifact Task 6 base supplies `RECOVERY_WORKFLOW_AUTHORITY_INLINE_CONTROL_CONTRACT` for Receipt's local canonical data validation, while its separate token/fetch live-refresh parser is not a Receipt repository-controller dependency. Parsed/raw tests freeze exact ordered workflow root keys `name,on,permissions,concurrency,jobs` with no root `defaults` or `env`, every ordered job key, exact `ubuntu-24.04`/Environment/runtime topology, all exact permission maps, explicit token counts `1/2/4`, the two pinned read-only checkout default-fetch exceptions with non-persistence, explicit token-bearing step names/inputs including `actions/attest`, the closed context multiset, byte/hash-equal absolute Task 7 `recoverAuthorityStepBytes`/`publishAuthorityStepBytes` wrappers with matching step SHAs and one body-plus-awaited-call script, zero preceding executable or implicit token consumer, recover authorization before checkout/download/protected material, exact safe preflight/validate-result `$GITHUB_OUTPUT` redirection, and publisher no-checkout/data-only ordering. Current recovered publication cannot begin: executing the real owner fixture proves both prepare and postverify raise `github_full_sigstore_owner_unavailable`; prepare has zero Release/asset/file/output/attestation-eligibility effects, making pinned attest and postverify unreachable, and postverify has zero publication/completion effects. The retained single-subject action rows and every five-state/resume/completion behavior are future separately approved dormant topology only.

After the conjunctive resume Gate, the future master Receipt checkpoint must use only actual test files owned by these plans. Do not run this command now:

```powershell
node --test --test-concurrency=1 server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout-store.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-receipt-recovery.test.mjs server/tests/control-plane-receipt-recovery-workflow.test.mjs server/tests/github-immutable-release-publisher.test.mjs
```

- [ ] **Future Validation Step 1 (5 min): Run the combined receipt/recovery suite**

```powershell
node --test server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-terminal-closeout-store.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-receipt-recovery.test.mjs server/tests/control-plane-receipt-recovery-workflow.test.mjs
```

Future expected result: all focused tests pass with zero failures; this result is not currently claimable.

- [ ] **Future Validation Step 2 (5 min): Run full repository validation**

```powershell
npm test
```

Future expected result: zero failures, with only documented platform-condition skips, using the separately approved and proven offline npm closure. This result is not currently claimable.

- [ ] **Future Validation Step 3 (3 min): Verify exact diff and worktree scope**

```powershell
git diff --check origin/master...HEAD
git status --short --branch
git rev-parse HEAD
```

Future expected result: `git diff --check` exits `0`; the main branch contains only the one coordinated main source-only Draft PR slice, after the separately merged narrow authority-bootstrap predecessor; and the exact head is recorded in the implementation handoff. None of this main-PR state is currently authorized or claimable.

Under the current STOP, additionally do not run any Task 1-8 test/commit command, `npm test`, dependency install/fetch, implementation staging, main implementation PR operation, or `git push`. At every future validation stage, do not run `gh workflow run`, `gh run rerun`, `gh release create`, `gh api` write requests, SSH, provider commands, or any production probe. Artifact Task 11 alone owns the normal controller and controller CLI; Task 12 alone owns the production workflow plus its preflight/postapproval wiring; Task 13 alone owns the isolated Deploy Note writer. Integration Task 6 performs only no-change real conformance against those owner files; the later documentation task may update the schema index/runbook but must consume these interfaces without changing their state algebra or permission boundary.
