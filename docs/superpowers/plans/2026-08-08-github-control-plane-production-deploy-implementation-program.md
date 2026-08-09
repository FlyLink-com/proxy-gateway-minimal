# GitHub Control-Plane Production Deploy Implementation Program

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved, manual-click GitHub control-plane deployment capability as one source-only Draft PR while preserving exact approval, artifact, host, database, rollback, receipt, and recovery boundaries.

**Architecture:** Six task-interleaved implementation plans share one strict canonical codec, one durable state substrate, and one target-matched Linux native feasibility gate. GitHub jobs prepare and approve immutable evidence; a forced-command host protocol admits a detached transaction; the host owns database custody, code switch, validation, automatic code rollback, and durable terminal evidence. Source implementation and external production enablement are separate programs: this plan ends with merged, still-disabled source capability and never creates credentials, GitHub Environments, Release assets, or production state.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub Actions YAML, GitHub REST/OIDC/attestations, GitHub Releases, Node-API C, Linux systemd/cgroups, OpenSSH forced commands, SQLite, PowerShell for local orchestration, disposable target-matched Linux for native and systemd integration.

**Approved Design:** `docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md`

## Global Constraints

- Risk is A because the source capability can later authorize production, systemd, credentials, SQLite schema transitions, deployment, and rollback.
- All source implementation lands in exactly one Risk A, source-only Draft PR with `release_unit: control-plane-app`, `production_state: not_deployed`, and `identity_impact: false` unless implementation review proves a runtime identity change.
- The six plans below are serial commit and review checkpoints inside that one Draft PR. They are not six independently merged source PRs.
- A different source-PR topology requires a design addendum and a new explicit approval before implementation continues.
- The source PR must not create or modify live or installed GitHub Environment state, secrets, variables, GitHub Apps, provider keys, host accounts, host `sudoers`, host `authorized_keys`, running systemd state, GitHub Releases, attestations, or production files. It may add reviewed, inert repository source templates for forced-command options, sudoers fragments, and systemd units; merely committing those uninstalled bytes grants no host authority.
- The source PR must not dispatch a production, inventory, Artifact Gate, compatibility, bootstrap, recovery, or deployment workflow.
- No push, merge, schedule, `repository_dispatch`, reusable caller, or workflow completion event may deploy.
- Formal deployment accepts only the immutable ID and exact confirmation phrase defined by the approved design; no target, source, release, service, path, host, rollback, or migration selector is dispatcher-controlled.
- Existing `.github/workflows/production-deploy-dry-run.yml` remains dry-run-only and can never produce a deployment input.
- Existing `.github/workflows/release-artifact.yml` remains short-lived build evidence and can never replace durable Artifact Gate publication.
- The `japan-runtime-config` workflows, identities, secrets, approval history, and concurrency lane remain separate.
- The first implementation release cannot serve as its own first rollback baseline.
- Production artifacts contain no `.env`, SQLite database, protected configuration, credential, subscription URL, customer data, or raw host/GitHub response.
- Automatic rollback is code-only. It never overwrites or restores SQLite and never applies a destructive, backward-incompatible, or identity-impact migration.
- Source merge, CI, artifact publication, workflow availability, design approval, or plan completion must never be reported as deployed.
- Every child plan follows RED -> minimal GREEN -> targeted regression -> small commit. Do not skip a RED observation because a neighboring task already created a file.
- Any stop condition below leaves the Draft PR disabled and records exact evidence. It does not authorize a weaker fallback.

## One-PR Dependency Graph

```mermaid
flowchart LR
  A["Foundation Tasks 1-6"] --> D0["Host/DB Tasks 0-1: database provider"]
  D0 --> F2["Integration Task 2: typed inventory APIs"]
  F2 --> B1["Artifact Tasks 1-2: Gate and plan"]
  B1 --> C1["Bootstrap Tasks 1-8"]
  C1 --> D1["Host/DB Tasks 2-10"]
  D1 --> E1["Receipt Tasks 1-3"]
  E1 --> B2["Artifact Tasks 3-8: publisher and authorization"]
  B2 --> D1B["Host/DB Task 11A broker + inventory-reader provider checkpoint"]
  D1B --> C2["Bootstrap Tasks 9-10"]
  C2 --> E2["Receipt Task 4"]
  E2 --> B2W["Artifact Tasks 9-10"]
  B2W --> D2["Host/DB Task 11 remainder and Tasks 12-13"]
  D2 --> E3["Receipt Tasks 5-8"]
  E3 --> B3["Artifact Tasks 11-13"]
  B3 --> C3["Bootstrap Task 11: integrated Linux proof"]
  C3 --> F1["Integration Task 1: final static digests"]
  F1 --> D3A["Host/DB Task 14A: source-only G1a installer contract"]
  D3A --> F3["Integration Task 3: inventory workflows"]
  F3 --> D3B["Host/DB Task 14B: docs and validation"]
  D3B --> F4["Integration Tasks 4-9"]
  F4 --> G["Exact-head Draft PR review"]
  G --> H["Merge as disabled source capability"]
  H -. "new approvals only" .-> I["External first-use Gates"]
```

This is the authoritative task-level schedule; a child plan's numerical position
in the suite is not permission to execute the whole child plan early. Foundation
is strictly first. Host/DB Tasks 0-1 then create the database contract and its
sole canonicalization helper, allowing Integration Task 2 to create typed
inventory APIs before Artifact Tasks 1-2 consume those APIs to freeze Gate and
plan identities. Bootstrap Tasks 1-8 establish static authorization, rotation,
and transport; Host/DB Tasks 2-10 then complete the database, writer, backup, and
migration providers. Receipt Tasks 1-3 freeze terminal parsing,
transaction-bound publication, controller closeout, and final status without
depending on the later host protocol or publisher. Artifact Tasks 3-8 produce
the immutable publisher and the sole canonical production-authorization bytes
and audience. The provider-only checkpoint inside Host/DB Task 11A then
supplies both the narrow start provider and the sole branded host-inventory
reader pair required by Bootstrap Tasks 9-10; Receipt Task 4
imports Bootstrap's full transition codec, and only then do Artifact Tasks 9-10
compose their workflows. Host transaction/recovery, Receipt recovery, and
Artifact controller/workflow sources follow in that order. Bootstrap Task 11
runs only after those real consumers/providers exist. Only after all static owner bytes exist does
Integration Task 1 compute the final staged-bundle, host-execution, and receipt
contract digests. Host/DB Task 14A then freezes the sole source-only G1a
installer contract before Integration Task 3 composes any external inventory
workflow. Host/DB Task 14B documentation and Integration Tasks 4-9 finish the
harness, no-change conformance over the Artifact-owned controller/workflows,
docs, Issue/PR packet, and validation. Every checkpoint remains on
the same source-only Draft branch; no slice is merged independently.

## Plan Suite

1. `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`
2. `docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md`
3. `docs/superpowers/plans/2026-08-08-github-control-plane-bootstrap-and-authorization.md`
4. `docs/superpowers/plans/2026-08-08-github-control-plane-host-transaction-and-database.md`
5. `docs/superpowers/plans/2026-08-08-github-control-plane-receipt-recovery-and-closeout.md`
6. `docs/superpowers/plans/2026-08-08-github-control-plane-source-integration-rollout-and-documentation.md`

## Frozen Interface Ownership

| Owner plan | Exact module or artifact | Frozen exported surface or responsibility |
|---|---|---|
| Foundation | `server/services/deployment/canonical-json.mjs` | `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, `sha256Hex(bytes)`; contracts recursively own nested-object field order and array element/order validation, with unknown fields rejected at every depth |
| Foundation | `server/services/deployment/foundation-contract.mjs` | Sole frozen owner of the four atomic logical-record exports, all fifteen public native-wrapper exports, exact standalone compiler flags, and ordered fourteen-feature Linux feasibility vector; Integration consumes this complete executable contract rather than a copied subset |
| Foundation | `server/services/deployment/durable-store.mjs` | `createDurableStore({contracts,fsOps,native})` returning `publishImmutable`, `casCanonical`, `unlinkVerified`, `readbackExact`; each fixed contract owns its root-relative logical record, and every mutation delegates to the complete reviewed native atomic surface rather than JavaScript read-check-write |
| Foundation | `ops/control-plane-deploy/native/index.mjs` | Linux probe, mode-verified sealed input, bounded anonymous capture, exact spawn, atomic no-replace/CAS/unlink plus durable directory-FD operations, global database identity lease, capability handoff, actual SQLite main-handle proof |
| Artifact | `scripts/github-immutable-release-publisher.mjs` | `inspectImmutableAssetAttestationPair(...)`; `publishImmutableAssetAttestationPair(...)`; states `none`, `asset_only`, `attestation_only`, `complete`, `conflict`; every asset has its own exactly-one-subject attestation whose sole subject is that asset's exact name/digest, never a shared or multi-subject statement; protected publisher uses only fixed bounded control, has no checkout/setup-node/candidate/repository-script execution, and re-hashes opaque verified envelope assets before write |
| Artifact | `server/services/deployment/github-attestation-verifier.mjs` | Sole tracked-trust closure: `createTrackedGithubAttestationVerifier({clock}) -> {verify}` and `validateExactPublicationPredicateBindings(...)`; roots/keys/trust bytes remain private, every consumer uses the owner closure, and no injected/reconstructed verifier or predicate contract is accepted |
| Artifact | `scripts/control-plane-production-gate.mjs` | Production Gate canonical bytes, ID grammar, Release/asset derivation, expiry, exact retrieval |
| Artifact | `scripts/control-plane-deployment-plan.mjs` | Stable template reconstruction, effective parent expiry, run envelope, and the exact canonical `deploymentPlanSha256`; no `planDigest` alias |
| Artifact | `server/services/deployment/control-plane-production-authorization.mjs` | Canonical postapproval authorization record bound to current policy/ruleset/checks, exact run approval, plan/Gate/source/workflow/installed generation, artifact identity, effective expiry, and nonce; exports `validateProductionAuthorizationRecord` and the sole `deriveProductionAuthorizationOidcAudience(authorizationRecordSha256)` |
| Artifact | `server/services/deployment/control-plane-production-controller.mjs` and production workflow | Artifact Tasks 11-12 solely own workflow-side controller composition, including `${{ github.sha }}` exact-head preflight/readback, trusted-code checkout, the full Environment reviewer-identity policy plus own boolean `can_admins_bypass: false`, fixed transport, Receipt-owned closeout builders, critical transitional mapping, final-status sink, and one bounded Deploy Note comment on the merged source PR; Integration Task 6 is no-change conformance only |
| Integration | `server/services/deployment/control-plane-required-check-contract.mjs` | Sole `REQUIRED_CHECK_CONTRACT`, `REQUIRED_CHECK_ARRAY_CONTRACT`, `validateRequiredCheckContracts`, `canonicalizeRequiredCheckContracts`, and separate `validateRequiredCheckRunObservations`; eight-field required-check identity remains distinct from live run observations |
| Integration | `server/services/deployment/control-plane-required-check-registry.mjs` | Integration Task 2 exports only `resolveControlPlaneRequiredCheckContracts({sourceCommit,rulesetRequirements,checkRuns})`; the fixed semantic/workflow registry stays private, live `integrationId`/`appSlug` observations are injected, and the return is the owner canonicalizer's exact `{requiredCheckContracts,bytes,sha256}` |
| Rollout | `server/services/deployment/control-plane-inventory-receipt.mjs` | `resolveInventoryReceipt({repository,inventoryGateId,token,fetchFn}) -> {bytes,sha256,receipt}` |
| Rollout | `server/services/deployment/control-plane-readonly-inventory.mjs` | Separately typed normal and compatibility inventory constructors/validators/resolvers; compatibility bytes cannot satisfy a normal inventory contract |
| Bootstrap | `server/services/deployment/control-plane-transport-contract.mjs` | One lazy sealed-material transport with exact `{execute,request,requestStatusBundle,requestBootstrap,close}` surface; exact-eight-field privately branded credential expectations and owner-derived/asserted known-host bindings guard the eleven-field material capture, all operations use fresh zeroized clones, and activation ID remains evidence rather than a credential selector; this owner alone exports `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS=900000`, `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS=910000`, and `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS=925000` |
| Bootstrap | `server/services/deployment/control-plane-host-protocol.mjs` | Closed request/response frame codecs for execute admission, approved five-field accepted-artifact acknowledgement, exact four-field ordinary-status selector, privately branded 16-field read-only status, and one authenticated `requestStatusBundle` stream of contiguous 768-byte chunks (262,144-byte/342-frame maximum and 2,048-byte response envelope); normal/compatibility inventory remains strictly read-only, while the disjoint Gate-bound activation pair alone reaches the fixed root launcher; internal `bootstrap_activation_ready_v1` moves the relay from ten-second pre-auth to the fixed 910,000-ms authenticated execution only after full authorization/readback and before first CAS, is consumed by transport, and the caller sees only the terminal response; the protocol service uses `RuntimeMaxSec=930s` |
| Bootstrap | `server/services/deployment/control-plane-bootstrap-contract.mjs` | Static content, activation, credential generation, installed-contract, and rotation receipt schemas/digests |
| Bootstrap | `server/services/deployment/control-plane-github-oidc-verifier.mjs`, `control-plane-authorization-verifier.mjs`, `control-plane-accepted-plan-store.mjs`, and `control-plane-admission-replay-ledger.mjs` | The sole fixed direct-workflow GitHub Actions OIDC discovery/JWKS/RS256 trust factory using `workflow_ref`/`workflow_sha`, exact claim/installed-state verification, canonical accepted-plan publish/fsync/readback, one atomic Gate/JTI/token/authorization/transaction reservation before artifact readiness, `bindTerminal`, protected-nonterminal listing, `readLedgerIdentity`, and maintenance-capability-only deterministic `compactEligible` |
| Bootstrap | `server/services/deployment/control-plane-session-limit-broker.mjs` and fixed socket/service units | Long-lived cross-`Accept=no` truth for exactly two fixed principals; per principal capacity four/refill one per ten seconds plus one connection-bound active lease, absolute preauth/transfer bounds, and service `60/16/none` start limits; one maximum bundle consumes one token/start |
| Bootstrap | `server/services/deployment/control-plane-bootstrap-maintenance.mjs` and `control-plane-controller-closeout-store.mjs` | `createBootstrapMaintenanceCoordinator({native,clock})`, `assertBootstrapMaintenanceCapability`, and exact `{runAdmissionPreflight,runTerminalCloseoutPreflight}` surface; admission must call the first before accepted-plan publication, and every normal/recovery/critical terminal publisher composition must call the second before immutable terminal/closeout publication; only owner-branded deterministic-CAS replay/closeout compaction is allowed |
| Database | `server/services/deployment/database-contract.mjs` | Logical DB IDs, schema/migration/terminal enums, `normalizeDatabaseContracts`, owner-private canonical ordering through `canonicalizeDatabaseContracts(value) -> {databaseContracts,bytes,sha256}`, recovery classification, and terminal-vector validation |
| Database | `server/services/deployment/writer-registry.mjs` | `WRITER_REGISTRY_CONTRACT`, `discoverProductionWriters`, `canonicalizeWriterRegistry`, and `verifyWriterRegistry({discovered,declared})` |
| Database | `server/services/deployment/control-plane-host-transaction.mjs` and journal store | Detached host transaction stage machine and recovery delegation using only closed injected contracts; `readAccepted(transactionId)` reads only Bootstrap's immutable accepted plan/digest and never the separate accepted-start projection or later accepted-record/reservation/capability/invocation fields |
| Database | database capability custody and startup guardian modules | Every logical database `SCM_RIGHTS` message contains exactly `databaseFd`, then closure-owned `identityLeaseFd`; the guardian alone retains the shared identity-lease FD close-on-exec for the child lifetime, candidate code receives no lease FD, and request/dependency-supplied lease FD fields reject before `sendmsg` |
| Database | `server/services/deployment/fixed-systemd-broker.mjs` | Host solely owns `ACCEPTED_START_EVIDENCE_FIELDS`, domain `control-plane-transaction-start-accepted-v1`, its canonicalizer and separate branded reader, plus the narrow fixed-systemd broker; Bootstrap imports and publishes the four-source projection, and the broker independently re-reads its sources and recomputes `invocationSha256` before fixed-unit start |
| Database | `server/services/deployment/control-plane-host-inventory-readers.mjs` | Host Task 11A solely exports `createControlPlaneHostInventoryReaders(deps) -> {normalInventoryReader,compatibilityInventoryReader}` plus `assertControlPlaneHostInventoryReaders`; the exact pair and each `{read(request)}` reader are frozen/private-branded and strictly read-only, and Bootstrap Task 9 must consume the asserted provider rather than inject loose reader lookalikes |
| Database | `server/services/deployment/control-plane-host-bundle-installer.mjs` | Host Task 14A solely exports `createControlPlaneHostBundleInstaller(deps) -> {installAndReadBack({stagedManifestBytes,contentReceiptBytes,approvalBinding})}` as one frozen exact method surface; fixed source/root/layout allowlists, no-replace/fsync/readback, and no caller selector are source-tested, while execution is possible only under a fresh external G1a Risk A Gate |
| Database | Host critical post-publication proof reader | `createCriticalPostPublicationProofReader(...)` and `assertCriticalPostPublicationProof(...)` privately brand only `{transactionId,criticalIdentityFenceSha256,observedAt}` after fixed-unit inactivity, unchanged fence, and fresh lease-free proof; Bootstrap status consumes the brand and Receipt never instantiates this reader |
| Receipt | `server/services/deployment/control-plane-host-terminal-publisher.mjs` | One transaction-bound normal/recovery/critical terminal publisher and durable reader with body -> outer record -> initial closeout record -> lease durability, the sole `HOST_TERMINAL_BUNDLE_V1_CONTRACT` builder/validator consumed by Bootstrap's opaque chunk reader, and the Bootstrap-owned bounded pending-lease registration |
| Receipt | `server/services/deployment/control-plane-controller-closeout.mjs` | Immutable controller payload, exact result mapping, separate Actions observation, upload-start validation, ACK validation, and sole `CONTROLLER_FINAL_STATUS_CONTRACT`; critical validation combines the receipt's publication-time held-lock proof with a later independently branded ordinary status, without owning the Host proof reader |
| Receipt | `server/services/deployment/control-plane-receipt-recovery.mjs` | Manual status-only recovery uses one five-method transport: challenge, recovery selector, one through seven fresh-ID ordinary requests under one absolute deadline, then exactly one helper-owned bundle stream only after immutable terminal status; `terminal_quiescence_rejected` remains transaction-bound and can never map to no-transaction admission rejection |
| Integration | Inventory workflows, staged deployment-contract builders, integration harness, and source-state/runbook/manifest docs | Compose frozen modules and exact normal/compatibility typed edges; `RELEASE_MANIFEST.md` may record only merged source capability/not-deployed truth, Task 6 changes no Artifact-owned file, and no source PR body pre-creates a Deploy Note |

An implementation worker must change an owned interface only in its owner checkpoint. Consumers import the owner module and test an exact contract fixture. If a consumer exposes a missing requirement, return to the owner task, update the owner test and all consumers in the same Draft PR, then repeat the owner checkpoint review.

## Stop Conditions

Stop the program with the Draft PR still disabled when any of these conditions occurs:

- Target-matched Linux cannot prove sealed-memory semantics, exact FD inheritance, `openat2` path confinement, parent-fsync durability, OFD lock behavior, `SO_PEERCRED`, `SCM_RIGHTS`, or the actual SQLite main handle used by the connection.
- The native builder requires network access, an unpinned secondary binary, an unreviewed Node headers directory, or a Node ABI outside the declared runtime contract.
- Canonical JSON parsing cannot reject duplicate keys, BOM, invalid UTF-8, trailing bytes, noncanonical field order, or alternate encodings of the same logical value.
- Any GitHub workflow requires dispatcher-selected production authority, repository Administration permission in a production-secret job, unpinned third-party action code, a self-hosted runner, or co-locates production secrets with repository/PR write authority.
- A protected job executes any byte supplied by a preapproval, source-build, or
  candidate artifact; validates such an artifact with a verifier/checksum that
  traveled inside the same artifact; or checks out control code from anything
  other than the reviewed exact protected source SHA.
- A workflow interpolates dispatcher input into shell source, treats policy
  shape as run approval, verifies only an attestation subject instead of the
  signed provenance identity, or omits a fresh exhaustive ruleset readback.
- Trusted preflight cannot prove checked-out code byte-equals `${{ github.sha }}`,
  the complete Environment reviewer-identity tuple is unreadable, the response
  lacks own boolean `can_admins_bypass: false`,
  or any asset lacks its own exactly-one-subject name/digest attestation.
- Live Environment policy, exact current authorization generation, immutable artifact provenance, bootstrap installed-state digest, database physical identity, rollback pair, or approval identity cannot be independently read back.
- Host admission or a closeout mutation can be authorized by a reusable SSH key
  alone, accepts an unknown operation/field/path/size, omits exact OIDC claim and
  installed-state verification, or persists/consumes state outside the native
  atomic replay transition before authorization.
- Bootstrap can accept an inventory frame as activation authority, the Host
  inventory-reader pair is absent/unbranded, the root relay connect can block
  outside one absolute pre-auth deadline, activation can mutate before the
  authenticated ready frame is durably emitted, any caller can observe/replay
  that internal frame, or admission/terminal publication can bypass the
  Bootstrap maintenance coordinator.
- A database path assertion substitutes for actual opened-handle identity, the two logical databases resolve to one physical file, a writer is unknown/overlapping/unfenced, or a migration falls outside the exact additive contract.
- A failure after any schema commit cannot converge to a prior-code terminal state validated against all committed schema and persisted-data contracts.
- A crash/reboot/runner-loss boundary has no durable, idempotent, bounded recovery owner.
- Logs, Actions artifacts, Release assets, receipts, summaries, or docs expose secrets, paths outside aggregate-safe contracts, raw remote output, raw configuration, database rows, or customer data.

## Task 1: Establish the Source-Only Draft Branch Boundary

**Files:**

- Read: `docs/CURRENT_RELEASE_STATE.md`
- Read: `RELEASE_MANIFEST.md`
- Read: `docs/PROJECT_CONTEXT.md`
- Read: `docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md`
- Read: all six child plans listed above

**Interfaces:**

- Consumes the approved design, current release authority files, and the exact
  six-plan dependency graph in this program.
- Produces only an isolated source branch plus a local Draft-PR packet; it
  creates no GitHub Issue or PR and no source commit of its own.

- [ ] **Step 1: Start from current `origin/master` in an isolated worktree**

```powershell
git fetch origin master
git worktree add ..\proxy-gateway-control-plane-deploy -b codex/github-control-plane-production-deploy origin/master
```

Expected: the new worktree is on `codex/github-control-plane-production-deploy`, with no untracked or modified files.

- [ ] **Step 2: Re-read repository authority in required order**

```powershell
Get-Content docs/CURRENT_RELEASE_STATE.md
Get-Content RELEASE_MANIFEST.md
Get-Content docs/PROJECT_CONTEXT.md
git status --short --branch
```

Expected: the source branch starts from the current master snapshot; any conflict with the approved design is recorded before code changes.

- [ ] **Step 3: Prepare the one source-only Draft PR packet without opening it**

The PR body must state:

```text
Risk: A
Process: approved design -> TDD implementation -> target-matched clean Linux -> exact-head CI/security review -> merge disabled -> separate external Gates
Expected PR count: 1 source implementation Draft PR
release_unit: control-plane-app
production_state: not_deployed
identity_impact: false
Production impact: none in this PR; no workflow dispatch, settings mutation, credential creation, host access, Release publication, or deployment
```

Prepare the issue/index card and complete PR body locally. Do not create the
GitHub issue or Draft PR until the integration plan has resolved every exact
file owner, dependency, validation command, and PR-body field. When that later
checkpoint opens the single PR, keep it Draft until Task 8 completes and never
request merge at branch creation.

- [ ] **Step 4: Record the orchestration boundary**

Run: `git status --short --branch`

Expected: only the isolated source branch exists; this orchestration task has no
file change and no independent commit.

## Task 2: Execute the Foundation and Linux Feasibility Plan

**Files:**

- Read/execute: `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`
- Verify: every exact file declared by Foundation Tasks 1-6

**Interfaces:**

- Consumes current `origin/master` and the reviewed runtime/header/compiler
  contracts.
- Produces the same-branch Foundation checkpoint commits, canonical codec,
  durable store, complete native capability surface, and a PR-only
  GitHub-hosted `ubuntu-24.04` target-Linux eligibility receipt consumed by later
  tasks. The runner is an ephemeral Linux VM, not WSL or a production host.

**Plan:** `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`

- [ ] **Step 1: Execute every Foundation checkbox in order with RED and GREEN evidence**

Do not begin later plans until the recursive canonical codec, durable store,
native build, sealed input, bounded capture, exact spawn, durable filesystem
primitives, global DB lease, capability custody, and actual SQLite main-handle
proof are committed. The native build must also prove the complete verified
headers/toolchain custody, narrow `PATH`, fixed `CC`/`CXX`/`AR`/`LD`/`PYTHON`/
`MAKE`, lockfile-pinned `node-gyp`, and receipt binding for every executed tool.
Freeze and test `foundation-contract.mjs` as the sole complete executable owner:
four atomic logical-record exports, fifteen native-wrapper exports, exact
standalone compiler flags, and the ordered fourteen-feature feasibility vector.
No later plan may copy or probe only a convenient subset.

- [ ] **Step 2: Run the Foundation checkpoint**

```powershell
node --test --test-concurrency=1 server/tests/control-plane-canonical-json.test.mjs server/tests/control-plane-durable-store.test.mjs server/tests/control-plane-node-headers-contract.test.mjs server/tests/control-plane-native-contract.test.mjs server/tests/control-plane-linux-capability-probe.test.mjs
npm run control-plane:foundation:linux
git diff --check origin/master...HEAD
```

Expected: all Node tests pass; the target-matched GitHub-hosted `ubuntu-24.04`
receipt is eligible; diff check exits 0. A Windows-local or WSL skip is not
evidence for the Linux receipt. The PR-only workflow contains no secret,
Environment, host, provider, Release, deployment, or write operation.

- [ ] **Step 3: Review the exact Foundation diff**

Confirm no production code can accept a caller-selected path, executable, environment, FD slot, UID, unit name, or native build download. Confirm the Node headers identity is part of the reviewed runtime contract.

- [ ] **Step 4: Record the Foundation checkpoint boundary**

Expected: RED/GREEN and commits are exactly those declared by Foundation Tasks
1-6. This is Foundation's sole exit: all four atomic logical-record exports,
fifteen native exports, exact compiler flags, fourteen-feature vector, and the
eligible target-Linux receipt are frozen. The only next DAG node is Host/DB
Tasks 0-1, not Artifact directly. This master task adds no file and creates no
independent commit.

## Task 3: Establish Database And Inventory Providers, Then Freeze Gate/Plan And Bootstrap

**Files:**

- Read/execute: Host/DB Tasks 0-1
- Read/execute: Source Integration Task 2
- Read/execute: Artifact Tasks 1-2
- Read/execute: Bootstrap Tasks 1-8

**Interfaces:**

- Consumes the Foundation checkpoint.
- Produces the database-contract provider and sole canonicalization helper,
  typed inventory APIs, canonical Gate/plan identities, and Bootstrap Tasks 1-8
  static authorization/rotation/transport commits. Host admission and closeout
  codecs still wait for the later Artifact Task 8 authorization checkpoint.

**Plans:**

- Host/DB, Source Integration, Artifact, and Bootstrap plans listed in the suite

- [ ] **Step 1: Execute Host/DB Tasks 0-1 only**

Create the exact two-database contract, logical IDs, validation matrix, and sole
`canonicalizeDatabaseContracts(value)` provider. Stop before capability, writer,
backup, migration, or host transaction work.

- [ ] **Step 2: Execute Source Integration Task 2 only**

Create the sole eight-field required-check contract/array validator and
canonicalizer plus the sole fixed semantic/workflow registry. The registry
exports only
`resolveControlPlaneRequiredCheckContracts({sourceCommit,rulesetRequirements,checkRuns})`,
injects live `integrationId`/`appSlug` observations into its private fixed
registry, and returns the canonicalizer's exact
`{requiredCheckContracts,bytes,sha256}`. Then create the typed
normal/compatibility inventory receipt schemas,
constructors, and resolvers using synthetic staged-manifest digests and the
Host-owned database helper. Keep required-check identity separate from observed
runtime status/conclusion/head SHA. This task does not need the final staged
manifest, Artifact publisher, host protocol, or production credentials.
Its executable contracts import Foundation's complete contract shape and the
integration test asserts the owner exports/vector byte-for-byte; it must not
redeclare a partial canonical/native/capability fixture.

- [ ] **Step 3: Execute Artifact Tasks 1-2 only**

Consume the now-existing typed inventory resolver and database helper to freeze
Production Gate and deployment-plan canonical bytes, identifiers, parent-expiry
calculation, reconstruction, and negative grammar. Stop at Task 2; publication,
authorization, and workflow producers remain absent.

- [ ] **Step 4: Execute Bootstrap Tasks 1-8 against frozen Foundation interfaces**

Implement static prepare, activation staging, credential-generation rotation,
forced-command entry boundaries, cleanup, the fixed sealed-material transport,
and separately typed normal/compatibility pre-Gate inventory codecs that do not
reuse deployment status. The sole privileged ingress is the forced
unprivileged native shim -> exact no-argument generation-bound sudoers -> tiny
native root relay -> fixed root-only `AF_UNIX` socket -> `Accept=no` sandboxed
root protocol service whose native helper `accept4`s FD 3. The bootstrap slice
consumes the Foundation native registry; it does not add a parallel native
addon, a second SSH transport, `Accept=yes`, general sudo, or generic systemd
authority. Do not implement
Task 9 host authorization verification until Artifact Task 8 owns the exact
authorization bytes and audience.
Transport freezes the exact-eight-field credential expectation and known-host
owner APIs now, exposes exactly `execute`, `request`, `requestStatusBundle`,
`requestBootstrap`, and `close`, and does not let any consumer construct an
expectation literal.
The expectation order is exactly `credentialId`, `principal`,
`authorizationGeneration`, `bootstrapReceiptSha256`, `knownHostsFingerprint`,
`knownHostsTupleSha256`, `expiresAt`, `observedAt`; only
`deriveKnownHostsBinding(...)` plus `assertKnownHostsRecordExpectation(...)`
may create/assert the branded endpoint-key tuple.

- [ ] **Step 5: Run the provider, Gate/plan, and Bootstrap checkpoints**

```powershell
node --test --test-concurrency=1 server/tests/control-plane-database-contract.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-production-gate.test.mjs server/tests/control-plane-deployment-plan.test.mjs server/tests/control-plane-bootstrap-contract.test.mjs server/tests/control-plane-bootstrap-store.test.mjs server/tests/control-plane-bootstrap-state-machine.test.mjs server/tests/control-plane-transport-contract.test.mjs server/tests/control-plane-transport-redaction.test.mjs
git diff --check origin/master...HEAD
```

Expected: every ID/hash/expiry rejection and every static-prepare, activation,
token-mint-unknown, cleanup, fence-last, N -> N+1, and transport case in this
task range passes with aggregate-safe output and no external access.

- [ ] **Step 6: Review provider and authorization boundaries**

Confirm the inventory resolver imports only the Host-owned database helper;
Artifact Gate/plan imports the typed resolver rather than predicting it; no
preapproval code claims an Environment approval; transport has only fixed
credential IDs; and a reusable SSH credential alone cannot select an activation
or reach a generic command path. Authorization/OIDC/replay review occurs after
Artifact Task 8 and Bootstrap Task 9.

- [ ] **Step 7: Record the provider/Gate/Bootstrap checkpoint boundary**

Expected: commits are exactly the child-task commits already declared; this
master orchestration step has no independent file change or commit.

## Task 4: Complete Database And Receipt Providers, Authorization, And The Narrow Broker

**Files:**

- Read/execute: Host/DB Tasks 2-10, Receipt Tasks 1-3, Artifact Tasks 3-8, and the broker/inventory-reader provider checkpoint inside Host/DB Task 11A
- Verify: the owner modules and tests named by those task `Files` sections

**Interfaces:**

- Consumes the fixed Bootstrap transport, frozen Gate/plan identities, typed
  inventory APIs, and Host-owned database contract.
- Produces the remaining database/writer/backup/migration providers, Receipt
  Tasks 1-3 terminal/final-status providers, Artifact Tasks 3-8 publisher and
  sole production authorization, plus the narrow broker and branded
  host-inventory reader providers required by Bootstrap Task 9. No workflow is
  dispatched.

**Plans:** Host/DB, Receipt/Recovery, and Artifact plans listed in the suite.

- [ ] **Step 1: Execute Host/DB Tasks 2-10 only**

Implement actual-handle sessions, the four-class writer registry/fencing,
coherent backup pair, additive migration ledger and recovery vector,
persisted-data pair proof, and database sub-transaction against the already
GREEN Task 1 contract. Stop before the host stage machine.

- [ ] **Step 2: Execute Receipt Tasks 1-3**

Freeze terminal bodies/outer records/initial closeout records/leases, exact logical-DB
validation, retained parser registry, the single host terminal publisher, the
immutable controller closeout, and the sole final-status contract. The Task 4
adapter waits for Bootstrap Task 9's full transition codec. There is no alternate
terminal writer in Host/DB or Artifact, and Tasks 1-3 do not require that later
codec or the later immutable publisher.

- [ ] **Step 3: Execute Artifact Tasks 3-8 only**

Consume the already GREEN typed inventory, database, writer, and Receipt
contracts to implement release declaration, bounded assembly/offline build,
GitHub evidence, immutable publisher, and the sole Artifact-owned production
authorization record/audience. Stop after Task 8; the Artifact workflows wait
for Bootstrap Tasks 9-10 and Receipt Task 4. Source preparation is read-only;
the builder has `permissions: {}`, no checkout, and no token; and the protected
publisher has no checkout, setup-node, candidate/build execution, or repository
script. It uses only fixed bounded publication control over opaque verified
envelope assets. Environment GET uses the official repository `Actions: read`
REST contract and must not invent an Environment-read permission.
Implement and consume only Artifact's tracked-trust closure
`createTrackedGithubAttestationVerifier({clock}) -> {verify}` and
`validateExactPublicationPredicateBindings(...)`; recursive envelope/predicate
contracts bind the full source/header/compiler/toolchain/output closure, while
roots, keys, trust bytes, predicate order, and a second verifier remain
uninjectable. Freeze the owner validator contracts that later require trusted
code to bind literal `${{ github.sha }}` and byte/readback-verify that exact
commit before any protected executable runs; do not add a workflow in this
checkpoint. Freeze the complete Environment policy tuple, including the exact
ordered fields `environment`, `preventSelfReview`, `protectedBranches`,
`customBranchPolicies`, `adminBypassAllowed`, and `reviewers`; derive
`adminBypassAllowed` only from the response's own boolean
`can_admins_bypass`, require it to be false, preserve every sorted reviewer
`type`/stable decimal `id`/normalized `login` or `slug`, and bind
approval by immutable reviewer identity rather than display name. Every durable asset must
have exactly one matching attestation whose statement contains exactly one
subject: that asset's exact name and digest; a shared/multi-subject attestation
or an attestation reused for another asset fails before publication.

- [ ] **Step 4: Complete only the Host/DB Task 11A provider checkpoint**

Write the Task 11A RED provider tests, then implement and checkpoint only
`FIXED_SYSTEMD_OPERATIONS`, `createFixedSystemdBroker`,
`createFixedSystemdBrokerClient`, and `createAcceptedTransactionBrokerClient`.
Also implement the Host-owned canonical accepted-start projection over exactly
`acceptedArtifactRecordSha256`, `acceptedPlanSha256`,
`authorizationReservationSha256`, and `artifactCapabilityIdentitySha256`.
Bootstrap will publish those bytes later; the broker must independently re-read
the four source objects and recompute the domain-separated `invocationSha256`
before starting anything. Host owns the exact domain
`control-plane-transaction-start-accepted-v1`; Bootstrap later imports rather
than copies it. This narrow provider has no dependency on Bootstrap Task 9, Receipt Task 4, the
accepted-artifact consumer, terminal publisher, or host stage runner. Do not
resume the rest of Task 11 yet.
Keep Host journal `readAccepted(transactionId)` limited to the Bootstrap-owned
accepted plan/digest. The four-source accepted-start reader is a different
private-brand provider and cannot be implemented by extending `readAccepted`.
In this same provider-only checkpoint, Host solely implements
`createControlPlaneHostInventoryReaders(deps)` and
`assertControlPlaneHostInventoryReaders(value)`. The factory returns only the
private-branded frozen exact pair
`{normalInventoryReader,compatibilityInventoryReader}`; each member is the
frozen exact `{read(request)}` surface and performs read-only collection. This
pair must be GREEN before Bootstrap Task 9's router and before any Integration
external inventory workflow; neither consumer may inject a loose reader
lookalike.

- [ ] **Step 5: Run provider checkpoint tests**

```powershell
node --test --test-concurrency=1 server/tests/control-plane-writer-registry.test.mjs server/tests/control-plane-database-transaction.test.mjs server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-host-terminal-publisher.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/github-immutable-release-publisher.test.mjs server/tests/control-plane-production-authorization.test.mjs server/tests/control-plane-fixed-systemd-broker.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs
git diff --check origin/master...HEAD
```

Expected: all pass locally without SSH, GitHub API access, Release writes,
production files, or workflow dispatch.

- [ ] **Step 6: Record the provider checkpoint boundary**

Expected: each RED/GREEN and commit comes from its named child task; this master
task makes no independent file change or commit.

## Task 5: Complete Publication, Host Transaction, Recovery, and Workflows

**Files:**

- Read/execute: Bootstrap Tasks 9-11, Receipt Tasks 4-8, Artifact Tasks 9-13, the remainder of Host/DB Tasks 11-14, and Source Integration Tasks 1 and 3
- Verify: every exact owner file and test named by those child tasks

**Interfaces:**

- Consumes typed inventory, the exact database set, fixed Bootstrap
  transport/codecs, accepted-artifact custody, Receipt terminal/final-status
  contracts, and the immutable publisher.
- Produces same-branch host authorization/protocol, Artifact Gate workflows,
  host transaction/recovery, receipt recovery, production controller/workflow,
  final static-digest, inventory-workflow, and Host/DB documentation commits.
  All workflow source remains disabled and unexecuted.

- [ ] **Step 1: Execute Bootstrap Tasks 9-10**

Import the Artifact Task 8 authorization bytes, validator, and sole
`deriveProductionAuthorizationOidcAudience(...)` without mapping or
reconstruction. Implement the first execute frame with bounded canonical
deployment-plan, Production Gate receipt, authorization-record bytes and OIDC;
publish/fsync/read back accepted-plan before readiness; use direct-workflow
`workflow_ref`/`workflow_sha` plus standard `nbf`/`iat`/`exp` rules; and
implement the approved five-field acceptance, exact four-field ordinary-status
selector, privately branded 16-field ordinary status, separate pre-Gate
inventory codecs, and one authenticated `requestStatusBundle` stream of up to
342 contiguous 768-byte frames within 2,048-byte responses. The fixed deploy
and bootstrap routers must both consume and assert Host Task 11A's same exact
`createControlPlaneHostInventoryReaders(...)` result before exposing normal or
compatibility inventory respectively; both handlers remain strictly read-only.
Separately own
`encodeBootstrapActivationRequestFrame` and
`validateBootstrapActivationResponseFrame`: only this fresh Gate-bound
`bootstrap_activation` ABI may invoke the fixed root launcher. A compatibility
inventory request, response, receipt, or its read-only `activationId` evidence
can never be reused as G3
activation authority. The root launcher must hold the fixed activation lock,
complete authorization and installed-state readback, and immediately before
its first CAS call only fixed `onAuthorized` to emit
`bootstrap_activation_ready_v1`; a failed ready write/readback causes zero
mutation. Bootstrap's `control-plane-transport-contract.mjs` alone owns
`BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS=900000`,
`BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS=910000`, and
`BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS=925000`. Only the exact ready frame
moves the relay from its non-refreshing ten-second pre-auth deadline to the
910,000-ms authenticated deadline under protocol `RuntimeMaxSec=930s`.
`requestBootstrap` validates and consumes ready internally and returns only the
terminal response; a post-ready disconnect resumes through durable launcher
state/recovery and never replays activation. Complete full-tuple closeout
transition codecs, atomic
admission/replay reservation, `bindTerminal`,
the 128-record/24-hour rejection/30-day terminal replay retention and
1,024-entry/35-day closeout index,
plus the exact maintenance owner
`createBootstrapMaintenanceCoordinator({native,clock})`. Its sole two methods
`runAdmissionPreflight({admissionReplayLedger})` and
`runTerminalCloseoutPreflight({admissionReplayLedger,controllerCloseoutStore})`
run deterministic CAS compaction at admission and terminal/closeout
prepublication, preserve replay retention, protect closeout active/nonterminal/
younger-than-35-day/latest-target/latest-critical/parser/recovery evidence, and
test exact 128/129 and 1,024/1,025 boundaries;
failure must precede the corresponding immutable publication. The actual
admission router must call `runAdmissionPreflight(...)` before it publishes the
accepted plan; a test-only or post-publication call does not satisfy the Gate.
Every normal, recovery, and critical finalizer composition must receive the
same coordinator and call `runTerminalCloseoutPreflight(...)` before immutable
terminal/closeout publication. Implement the
coordinator with one fixed lock/clock capture and owner-branded replay/closeout
calls only; no timer, Host/Receipt direct `compactEligible`, or generic
maintenance command is permitted. Implement the
long-lived cross-parser fixed-principal session-limit broker, exact `60/16/none`
service start limits, a nonblocking root-relay connect whose one absolute
ten-second pre-auth deadline covers connect/authentication without progress
refresh, and a separate 300-second absolute artifact deadline inside the same
bounded authenticated task. Before connect, each fixed principal must acquire
and hold its own verified root-owned mode-`0600` single-link
`flock(LOCK_EX|LOCK_NB)` slot through outermost cleanup. Also implement the
bounded challenge broker, accepted-artifact custody, accepted-start publication,
boot preflight, and bounded closeout registration.
Use the already GREEN Host Task 11A broker/inventory-reader provider; do not
implement a second broker, inventory reader, or systemd client.

- [ ] **Step 2: Execute Receipt Task 4**

Implement the normal closeout adapter and CLI by importing Bootstrap Task 9's
exact transition audience/frame helpers and transport envelope. Do not retain a
second transition schema, audience, or decoder. For a critical terminal receipt,
validate the publication-time proof while the external finalizer still holds
the exclusive global identity/business leases; require a later independent
ordinary status to prove the finalizer inactive, the fence unchanged, and both
leases free before the Receipt-owned final status may claim a validated critical
failure. Host alone implements and privately brands
`createCriticalPostPublicationProofReader`; Bootstrap ordinary status consumes
that brand, and Receipt accepts only the downstream status brand rather than a
reader/lease/unit capability.

- [ ] **Step 3: Execute Artifact Tasks 9-10**

Using the already GREEN Artifact publisher/authorization and the now-existing
Bootstrap/Receipt transition providers, implement both manual Artifact Gate
workflow sources. Require an exact run-bound independent publication approval
before writes. No compatibility receipt may become a normal deployment input;
cross-job artifacts remain data-only and protected jobs run only exact-SHA
trusted code. Every protected executable checkout fixes
`ref: ${{ github.sha }}`, reads `HEAD` back, and rejects any mismatch before
running repository code. The publisher binds the full `artifact-publication`
reviewer-identity policy with `can_admins_bypass: false` and one
exactly-one-subject attestation per asset. Do not dispatch either workflow.

- [ ] **Step 4: Resume Host/DB Task 11, then execute Tasks 12-13**

Consume the exact accepted-artifact record and Receipt-owned terminal publisher
to complete the stage runner around the already checkpointed narrow broker,
then implement switch, validation, code-only rollback, journal/boot recovery,
and clean-Linux scenarios. Every unit uses the exact phase sandbox and no
automatic database restore exists.
Normal, recovery, and external critical-finalizer composition injects the
Bootstrap maintenance coordinator and exact replay/closeout owner stores; it
must pass `runTerminalCloseoutPreflight(...)` before any immutable terminal or
closeout publication. Host and Receipt never invoke either compactor directly.
Every database custody transfer is exactly the ordered two-FD pair
`databaseFd`, `identityLeaseFd`; the guardian alone retains the shared lease FD
close-on-exec for child lifetime, and candidate code or request/dependency
objects can never supply or receive it.

- [ ] **Step 5: Execute Receipt Tasks 5-8**

Implement status-only recovery with `recover japan control-plane receipt`.
Validate the exact old attempt using documented `status`, a closed conclusion,
and attempt-specific `updated_at`; never invent `completed_at` or read repository
retention settings. A present artifact binds the API `sha256:` archive digest,
payload digest, `created_at`, and `expires_at` independently.
The one transport retains the exact five-method surface
`{execute,request,requestStatusBundle,requestBootstrap,close}`. Its ordered read
path is challenge request, OIDC-bound recovery-selector request, one through
seven fresh-correlation ordinary status requests under one fixed 30-second
absolute deadline/five-second interval, then exactly one helper-owned
`requestStatusBundle` session only after immutable terminal status. That stream
contains one through 342 frames. Every actual operation receives one fresh
non-aliased credential clone; the controller never rematerializes the deploy
credential and calls one idempotent `close()` only in its outer `finally`.
`terminal_quiescence_rejected` is transaction-bound transitional nonterminal:
polling continues until Host-proof-backed immutable critical status plus its
exact bundle yields `recovered_validated_critical_failure`, or the deadline
yields `recovery_not_terminal_no_claim`. It can never become
`admission_rejected_no_transaction` or a fabricated receipt-invalid result.

- [ ] **Step 6: Execute Artifact Tasks 11-13, with controller wiring owned by Tasks 11-12**

Implement the production controller, fixed execute CLI, manual protected
workflow, postapproval trusted-code replay, typed OIDC execute/closeout frames,
immutable closeout upload, ACK validation followed by an independent committed
status readback, final status-only validation, and isolated truthful
Deploy Note. Artifact owns all controller/workflow composition here, including
typed inputs, terminal-bundle use, closeout, and final-status sink; Integration
Task 6 later validates this composition without editing or recommitting these
owner files. Every protected executable checkout uses literal
`ref: ${{ github.sha }}`, verifies checked-out `HEAD`, and rebinds the full live
production Environment reviewer-identity tuple plus own boolean
`can_admins_bypass: false` before secret
materialization. The classifier reserves `admission_rejected_no_transaction`
only for a Bootstrap-owner-branded exact
`{preAdmissionDurableRejection:true,admissionAccepted:false}` value. Version 1
has no producer for that brand, so the branch is unreachable and any bare
boolean/lookalike maps to `controller_incomplete_no_production_claim`.
Transaction-bound
`terminal_quiescence_rejected` keeps bounded ordinary polling; a later
Host-proof-backed immutable critical status and exact terminal bundle maps to
`validated_critical_failure`, while deadline exhaustion maps to
`controller_incomplete_no_production_claim`. Actual immutable-bundle validation
failure alone maps to `receipt_invalid_no_production_claim`. Diagnostic/no-claim
and nonterminal results do not write a note, and the isolated writer appends at
most one bounded Deploy Note comment to the merged source PR after final
read-only validation.

- [ ] **Step 7: Execute Bootstrap Task 11**

Run the disposable-Linux bootstrap/transport integration only now that the real
Artifact authorization, Receipt closeout adapter, Host transaction broker, and
controller consumer plus Host Task 11A inventory-reader provider exist.
Synthetic fixtures cannot substitute for their
cross-owner byte-equality tests.

- [ ] **Step 8: Execute Source Integration Task 1**

Now that every Bootstrap, transport, host/database, receipt/recovery, native,
authorization, and adapter source byte exists, compute and test the final
tracked staged-host bundle manifest, host-execution contract, and receipt
contract digests. Earlier tasks may define digest fields but may not predict or
substitute these final values.

- [ ] **Step 9: Execute Host/DB Task 14A**

After Integration Task 1 freezes the final staged manifest, implement the sole
source-only G1a provider
`createControlPlaneHostBundleInstaller(deps) ->
{installAndReadBack({stagedManifestBytes,contentReceiptBytes,approvalBinding})}`.
Tests freeze the internal source/root/layout allowlist, no-selector grammar,
no-replace publication, parent fsync, and exact readback. This source checkpoint
does not call the installer or touch a host; only a fresh post-merge G1a Risk A
Gate may execute it.

- [ ] **Step 10: Execute Source Integration Task 3**

Compose the status-only normal and compatibility inventory CLIs/workflows with
the shared immutable publisher and final static contracts. Compatibility
inventory uses one fresh
`.requestBootstrap({credentialId:'japan-control-plane-github-bootstrap-v1',requestBytes,timeoutMs})`
with only the compatibility-inventory codec, exact `timeoutMs:10000`, and one
terminal response; it remains strictly read-only and rejects
`bootstrap_activation_ready_v1` without reaching the launcher.
The separate G3 activation workflow uses the disjoint Gate-bound
`bootstrap_activation` request/response pair and fixed root-launcher handler;
it never sends an inventory frame and never reuses any G2 inventory evidence,
including its read-only `activationId`. The Integration consumer imports and
passes only Bootstrap's `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`; it does not
hardcode any activation timeout or parse the internal ready frame.
Normal inventory uses only
`.request({credentialId:'japan-control-plane-github-deploy-v1',...})` after G4.
Artifact publication itself performs no SSH.

- [ ] **Step 11: Execute Host/DB Task 14B**

Complete only Host/DB-owned database/operator/DR/ops documentation and its
checkpoint. Do not edit historical `docs/DEPLOYMENT_FLOW.md` or rollout-owned
`docs/GITHUB_DEPLOYMENT_RUNBOOK.md`.

- [ ] **Step 12: Run all slice checkpoints and target Linux stop/go**

```powershell
npm run control-plane:foundation:linux
npm run control-plane:host:integration
node --test --test-concurrency=1 server/tests/control-plane-production-authorization.test.mjs server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-authorization-verifier.test.mjs server/tests/control-plane-receipt-contract.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-recovered-closeout-publisher.test.mjs server/tests/control-plane-receipt-recovery-workflow.test.mjs
git diff --check origin/master...HEAD
```

Expected: all exact child-plan suites pass; the observed target Linux runtime
remains eligible; success, stopped-pre-switch, partial schema commit, deployed,
code rollback, and critical states converge to their exact predicates.

- [ ] **Step 13: Record the completion checkpoint boundary**

Expected: only the child-task commits exist; this orchestration step creates no
additional file or commit.

## Task 6: Complete Source Integration, Rollout, and Documentation

**Files:**

- Read/execute: `docs/superpowers/plans/2026-08-08-github-control-plane-source-integration-rollout-and-documentation.md` Tasks 4-9
- Verify: the exact integration, workflow, traceability, runbook, manifest, and index files declared there

**Interfaces:**

- Consumes all frozen owner modules and final static digests.
- Produces the same-branch integration/documentation commits, the local Issue/PR
  body packet, and finally one Draft PR only at Integration Task 9.

**Plan:** `docs/superpowers/plans/2026-08-08-github-control-plane-source-integration-rollout-and-documentation.md`

- [ ] **Step 1: Execute Source Integration Tasks 4-9 in order**

Compose only the remaining integration harness, no-production-secret source
workflow, traceability matrix, runbook/manifest/index updates, full validation,
and Draft-PR handoff. YAML passes canonical bytes and safe IDs to reviewed
modules; it does not reproduce authority or state logic in shell. Integration
imports and verifies Foundation's full executable contract (four atomic logical
record exports, fifteen native exports, exact compiler flags, and all fourteen
features), not a consumer-picked subset. Integration
Task 6 is a no-change cross-owner validation checkpoint: it may not edit or
recommit the Artifact-owned controller/workflows or any other owner file. A
defect returns to its owning child task, followed by the owner tests and a new
integration validation. Integration Task 9 may create or update exactly one
source-only Draft PR and attach exact-head evidence; it must leave the PR Draft
and cannot mark Ready or merge.

- [ ] **Step 2: Build the disposable clean-Linux scenario matrix**

Use synthetic release directories, protected config, two physically distinct
disposable SQLite files, fixed local/public fake health endpoints, and synthetic
credentials. Never copy production files or values.

- [ ] **Step 3: Update documentation truthfully**

Record the source capability according to actual Git state in the rollout-owned
runbook/index files and `RELEASE_MANIFEST.md`, and always retain
`production_state: not_deployed` until a later real deployment closes out. The
source PR body uses `Production status: not_deployed`; it must not pre-create a
Deploy Note. After a real G9 final read-only validation, the Artifact-owned
isolated writer may append exactly one bounded Deploy Note comment to the
merged source PR.
Preserve the Japan runtime-config lifecycle and keep `Protected Release Config
Identity Gate` before `Condition-Driven Promotion Health Window`.

- [ ] **Step 4: Verify traceability and the one-PR boundary**

Every approved design decision and negative boundary maps to an implementation
file, targeted test, clean-Linux scenario, and external Gate or is explicitly
source-inapplicable. Resolve issues and finish the PR body before opening the
single source-only Draft PR; no slice branch is independently merged. This
handoff stops at Draft. Master Task 8 is the sole owner of any Ready transition
or policy-compliant merge after Task 7 exact-head closure.

- [ ] **Step 5: Run the integration checkpoint and record its commit boundary**

```powershell
npm run control-plane:source-integration
node --test --test-concurrency=1 server/tests/control-plane-source-integration-workflow.test.mjs server/tests/control-plane-deployment-traceability.test.mjs
git diff --check origin/master...HEAD
```

Expected: pass. All file changes and commits are exactly those declared by
Integration Tasks 4-9; the master program creates no independent commit.

## Task 7: Run Full Source-PR Validation

**Files:** all source PR changes.

**Interfaces:**

- Consumes the exact source head and every child-plan validation command.
- Produces only aggregate-safe exact-head validation evidence in the existing
  Draft PR; no production credential, Release, host, or deployment state.

- [ ] **Step 1: Run targeted deployment suites serially**

Use the exact commands from all six child plans. Preserve their outputs in the PR validation section without secrets or local absolute paths.

- [ ] **Step 2: Run repository validation**

```powershell
npm test
npm run docs:authority:check
git diff --check origin/master...HEAD
```

If project-state JSON was intentionally changed by the integration plan, also run:

```powershell
npm run project-state:check
```

Expected: every invoked command exits 0. The source implementation PR normally does not rewrite dated production state JSON.

- [ ] **Step 3: Run exact-head clean Linux validation**

Run the integration plan's disposable Linux command against the exact PR head and record the resulting aggregate eligibility receipt. Verify success, health-triggered rollback, DB1-commit/DB2-fail, post-COMMIT/pre-journal crash, writer-during-backup, connection interruption, transient-unit kill, reboot recovery, and finalizer recovery.

- [ ] **Step 4: Obtain exact-head CI and security evidence**

Require successful `Validate` and CodeQL on the exact head. Require an ephemeral exact-head packaging/offline-native-build proof that performs no durable Release write and has no production secret.

- [ ] **Step 5: Run independent semantic and security reviews**

Semantic review checks approved-design coverage, enum/state consistency, failure convergence, docs truth, and interface ownership. Security review checks GitHub permissions, supply chain, credential lifecycle, forced command, OIDC/replay, archive handling, native FD boundaries, systemd recovery, DB custody, log redaction, and receipt hash DAG. Critical or Important findings keep the PR Draft until fixed and re-reviewed at a new exact head.

- [ ] **Step 6: Verify a clean worktree and reviewable commits**

```powershell
git status --short --branch
git log --oneline --decorate origin/master..HEAD
git diff --stat origin/master...HEAD
```

Expected: worktree clean; commits follow child-plan checkpoints; diff contains source, tests, and truthful docs only.

- [ ] **Step 7: Record the validation-only boundary**

Expected: validation changes no source file and creates no commit. Any required
fix returns to the owning child task, creates a reviewed commit there, and
restarts exact-head validation.

## Task 8: Ready and Merge the Disabled Source Capability

**Files:**

- Read: the single Draft PR body, exact-head checks, current review threads, and repository merge policy
- Modify only if needed: the existing Draft PR metadata; no repository source file in this orchestration task

**Interfaces:**

- Consumes successful exact-head Task 7 evidence and current final-head review.
- Produces at most one Ready transition and one policy-compliant merge of the
  still-disabled source capability; it produces no production deployment claim.
- This task is the sole Ready/Merge owner. Integration Task 9 and every child
  plan stop at one Draft PR plus exact-head evidence and cannot perform either
  transition.

- [ ] **Step 1: Update the Draft PR body with exact validation evidence**

State explicitly that no Environment, credential, host, provider, Release, inventory, Artifact Gate, production deployment, or rollback operation was executed.

- [ ] **Step 2: Resolve all current review threads and obtain final-head review**

Outdated approvals or comments on earlier heads do not satisfy this checkpoint.

- [ ] **Step 3: Mark Ready only after the full source closure**

Required closure: exact-head tests, CI, CodeQL, clean Linux, semantic review, security review, docs, no unresolved Critical/Important finding, and `production_state: not_deployed`.

- [ ] **Step 4: Merge through repository policy**

After merge, verify the exact merge SHA and successful exact-SHA source checks. Do not call the merge a deployment.

- [ ] **Step 5: Create a separate source-state reconciliation change only if required**

If the source PR could not record its eventual merge SHA, use a separate C-tier docs/state PR to update `docs/CURRENT_RELEASE_STATE.md`, `docs/PROJECT_CONTEXT.md`, `RELEASE_MANIFEST.md`, and project-state artifacts. It may say source capability merged and not deployed; it cannot say Artifact Gate ready or production ready without external evidence.

- [ ] **Step 6: Verify the merge boundary and avoid an orchestration commit**

```powershell
gh pr view --json state,isDraft,headRefOid,mergeCommit,reviews,statusCheckRollup
git status --short --branch
```

Expected: the merged SHA and checks correspond to the reviewed exact head,
`production_state` remains `not_deployed`, and this master task creates no
independent repository commit.

## External First-Use Program — Explicitly Outside This Implementation

After source merge, every step below requires its own fresh evidence and exact approval. No approval from design, planning, source PR, CI, or an earlier failed attempt can be reused.

1. **G1 — static content and publication protection:** under its own fresh Risk
   A approval, G1a alone invokes Host's fixed
   `installAndReadBack({stagedManifestBytes,contentReceiptBytes,approvalBinding})`
   to stage and read back root-owned disabled host content, including the
   session-limit broker, maintenance coordinator, replay/closeout owner
   contracts, host-inventory reader provider, root launcher, and fixed unit
   start-limit tuple; G1b establishes and reads back the
   protected `artifact-publication` Environment without production credentials.
2. **G2 — compatibility inventory/publication:** use a fresh provider-approved
   compatibility-inventory evidence binding to publish the typed `cig1`
   inventory through the asserted Host compatibility reader. Its canonical
   `activationId` is read-only evidence only; the request/response ABI is
   one exact 10,000-ms single-response operation, rejects every activation-ready
   frame, and performs zero install, activation, CAS, execute, or launcher
   operation. Only
   when the exact rollback baseline lacks the reviewed contract may the
   separately typed compatibility artifact be published, still without SSH.
3. **G3 — compatibility activation:** under a new activation plus a separate
   backup/manual Gate, call `.requestBootstrap({credentialId:
   'japan-control-plane-github-bootstrap-v1',requestBytes,timeoutMs:
   BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS})` using only
   `encodeBootstrapActivationRequestFrame` and validate only with
   `validateBootstrapActivationResponseFrame`; the router then reaches the
   fixed root launcher. G3 never sends or accepts a compatibility-inventory
   frame and never reuses any G2 inventory evidence, including its read-only
   `activationId`. The materializer resolves the
   unique armed activation internally; its ID is evidence, never a protected
   material selector. Internally, only `bootstrap_activation_ready_v1` after
   complete authorization/readback and before first CAS changes the relay's
   ten-second pre-auth bound to the fixed 910,000-ms authenticated bound; the
   operation/request bounds are respectively 900,000/925,000 ms and the
   protocol service uses `RuntimeMaxSec=930s`. Transport consumes ready and the
   workflow sees only terminal; ready failure makes zero mutation and a
   post-ready disconnect converges through durable recovery without replay.
   Finish with a healthy exact rollback release.
4. **G4 — credential/authorization bootstrap:** install and independently read
   back final host/GitHub authorization, close cleanup, revoke temporary updater
   authority, prove `rotation_closed`, and remove the fence last. This Gate also
   activates/readbacks the long-lived broker before either protocol socket, the
   maintenance capability and its two fixed preflight callers, and the exact
   eight-field credential-expectation/known-host owner binding; it grants no
   generic maintenance or systemd operation.
5. **G5 — normal protected inventory:** use only the final fixed deploy
   credential to publish the canonical two-hour `ig1` inventory receipt, and
   fail unless broker principal/start-limit plus maintenance owner/index/replay
   readbacks match the activated contract.
6. **G6 — normal manual Artifact Gate:** publish a durable, signed and verified
   Production Gate receipt for that exact fresh inventory, without deployment;
   every published asset must have its own exactly-one-subject attestation bound
   to that asset's exact name/digest.
7. **G7 — operator production decision:** review that exact receipt and manually
   dispatch only `production_gate_id` plus `deploy japan control-plane production`.
8. **G8 — independent protected approval:** after `${{ github.sha }}` exact-head
   readback, the controller binds the full live Environment policy tuple,
   including every required reviewer immutable identity and own boolean
   `can_admins_bypass: false`. A distinct authorized reviewer approves the exact
   pending
   `vultr-japan-production` run and plan; display-name equality, stale policy,
   or any unrecorded/bypassed approval fails closed.
9. **G9 — bounded automatic transaction and truthful closeout:** GitHub performs
   admission maintenance before accepted-plan publication, deployment,
   validation, code-only rollback when required, terminal/closeout maintenance
   before immutable terminal publication, automatic fixed-chain critical
   finalization when required, cleanup, one-session terminal-bundle
   retrieval, and final ordinary read-only validation before the isolated
   writer may append exactly one bounded Deploy Note comment to the merged
   source PR.
   There is no mid-run manual host command or automatic DB restore; failed,
   stopped, schema-only, rolled-back, critical, diagnostic, and no-claim results
   retain their exact non-success semantics.

The external critical finalizer is automatically queued by the fixed recovery/
boot chain; it is not another manual Gate. Only later removal of a retained
critical fence requires a fresh separately approved Risk A recovery.

Receipt recovery is a separate manual-only, newly approved, protected workflow
using `controller_recovery_id`, safe original run/attempt inputs, and
`recover japan control-plane receipt`. One five-method transport runs challenge
-> OIDC-bound selector brand -> one through seven fresh-ID Bootstrap-derived
ordinary status polls -> exactly one terminal-only bundle session. It is
status-only: no execute, ACK, host mutation, old-run rewrite, or approval reuse.

## Implementation Handoff

The recommended execution mode is `superpowers:subagent-driven-development`: use a fresh worker per child task, require spec-compliance review before code-quality review, and keep the main agent responsible for interface ownership, exact-head validation, and the one-PR boundary. The alternative is `superpowers:executing-plans` in this task, still following every checkbox and review gate serially.
