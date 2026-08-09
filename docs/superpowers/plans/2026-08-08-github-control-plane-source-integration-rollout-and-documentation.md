# GitHub Control-Plane Source Integration, Rollout, and Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate every approved GitHub-controlled Japan control-plane deployment source slice, add a protected read-only inventory contract and a no-production-secret source validation workflow, and publish the exact operator documentation needed to review one source-only Draft PR without changing GitHub settings or production.

**Architecture:** The foundation/native feasibility checkpoint runs first. Artifact/workflow, bootstrap/authorization, host/database transaction, and receipt/recovery plans then contribute closed checkpoints to the same implementation branch without per-slice PRs or merges. This final slice computes the complete staged-host bundle and installed contract digests only after every static source exists, adds domain-separated compatibility and normal inventory lanes, validates the Artifact-owned receipt/controller composition without editing it, and validates all slices with synthetic fixtures. A later source-state reconciliation PR may record the exact merge SHA; external G1-G9 Risk A Gates and the first real Deploy Note remain post-merge handoffs with fresh approvals.

**Tech Stack:** Node.js 22 ESM, node:test, canonical UTF-8 JSON, JSON Schema, SHA-256, HMAC-SHA-256, better-sqlite3 fixtures, GitHub Actions, GitHub REST, GitHub Release assets, artifact attestations, sealed file descriptors, OpenSSH status-only transport, disposable Linux/systemd integration, Markdown, and YAML.

## Global Constraints

- Risk: A for the overall capability; every task in this plan is source-only and has no production authority.
- Process: prerequisite feasibility, TDD, closed contracts, synthetic fixtures, clean Linux validation, exact-head CI and CodeQL, independent semantic review, independent security review, and one Draft PR. This plan stops with the PR still Draft; only the master implementation program's final review/Ready/Merge owner may transition or merge it. External Risk A work starts only after that merge and fresh approval.
- Expected PR count: exactly one source implementation PR for all six plan slices. The source-state reconciliation and first production-attempt closeout are later, separate documentation PRs and are not part of the source PR.
- Validation: focused tests, seven-scenario host integration, no-secret GitHub source integration, offline native build, clean Linux bootstrap validation, full npm test, packaging checks, documentation authority checks, exact diff checks, exact-head CI, exact-head CodeQL, and two independent reviews.
- Production/AWS impact: none during this plan. Do not access Vultr, AWS, Cloudflare, DNS, a production host, a production database, or a production endpoint.
- The approved design at docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md is normative. If an implementation plan conflicts with it, stop and reconcile the plans before code changes.
- The foundation/native feasibility plan must pass on the target-matching disposable Linux environment before any task in this plan starts. A skipped native assertion, missing capability, or emulated success is a failure.
- All source work stays on the single source implementation branch containing the approved design and all six plans, synchronized with freshly fetched origin/master before implementation. Every slice ends at a local same-branch checkpoint; no slice is pushed, opened, readied, or merged independently.
- The source PR remains Draft until the complete validation matrix and independent reviews pass on one exact head SHA.
- Repository identity is fixed to gccwebos-com/proxy-gateway-minimal, branch identity to refs/heads/master, target to japan-control-plane, release unit to control-plane-app, service to proxy-gateway-candidate.service, and production Environment to vultr-japan-production.
- Preserve the operator decision: an operator manually clicks Deploy; after exact dispatch and distinct Environment approval, GitHub performs deployment, validation, code rollback, cleanup, and receipt closeout automatically.
- Do not dispatch any new workflow while implementing or validating this plan. Pull-request-triggered source validation is permitted because it has no Environment, production secret, OIDC, publisher, SSH, or mutation authority.
- Do not create or change a GitHub Environment, Environment protection rule, repository variable, repository or Environment secret, GitHub App, App key, installation, token, deploy key, Release, Release asset, attestation, branch rule, or Actions retention setting.
- Do not install or enable a systemd unit, create a principal, write sudoers or authorized_keys, stage a host bundle, open SSH, mint OIDC, acquire a production lease, create a backup, migrate a database, switch current, restart a service, probe a production endpoint, rotate credentials, or clean production state.
- Reserved production secret names may appear only in static workflow contract tests and the production workflow source owned by adjacent plans. Their values must never be requested, read, logged, persisted, copied into fixtures, or supplied to source integration.
- The source-integration workflow and its process tree must contain no reference to secrets, an Environment, id-token write permission, SSH, SCP, rsync, GitHub Release writes, attestation writes, provider APIs, production endpoints, or production paths.
- The compatibility and normal read-only inventory workflows are manual-only, protected, status-only, typed, and fail-closed. Neither may send execute_auth, bootstrap activation, closeout acknowledgement, recovery mutation, artifact bytes, or any host-state mutation request. G3 bootstrap activation is a third, disjoint protocol path under its own later Gate and can never be emitted by either inventory workflow.
- The inventory publisher is isolated from the production Environment and production secrets. Each typed adapter consumes only canonical aggregate-safe receipt bytes, constructs its exact attestationIdentity from the validated source commit plus its fixed workflow path/ref/SHA and predicate type, and passes that same object to both shared immutable inspection and publication.
- Normal Inventory Gate IDs match exactly ^ig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$; compatibility Inventory Gate IDs use the disjoint ^cig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$ domain.
- Normal inventory uses Release control-plane-inventory-{sourceCommit}-{runtimeContractId} and asset inventory-receipt-{receiptSha256}.json. Compatibility inventory uses Release control-plane-compatibility-inventory-{sourceCommit}-{runtimeContractId} and asset compatibility-inventory-receipt-{receiptSha256}.json.
- Both receipt bodies exclude their external Gate ID, are canonical bytes, and expire exactly two hours after createdAt. now >= expiresAt is expired. A normal resolver rejects compatibility bytes/IDs/assets, and a compatibility resolver rejects normal bytes/IDs/assets.
- Compatibility inventory binds the staged host-bundle manifest/content receipt plus exact rollback, runtime, writer, and normalized databaseContracts bytes. It rejects final bootstrap receipt, authorization generation, authorization HMAC, and rotation_closed fields because those do not exist before G4.
- Normal inventory requires the final bootstrap receipt, identical protected evidence, authorization generation/HMAC bindings, cleanup proof, and rotation_closed in addition to the staged bundle, rollback, runtime, writer, and the same complete databaseContracts representation.
- Inventory receipts alone own the live-readback requiredCheckContracts array. It exhaustively covers the protected-master ruleset contexts, includes at least the semantic roles validate and codeql, and never substitutes a display-name guess or fabricated production App ID.
- This plan's Task 2 is the sole owner of REQUIRED_CHECK_CONTRACT, REQUIRED_CHECK_ARRAY_CONTRACT, validateRequiredCheckContracts, and canonicalizeRequiredCheckContracts. Both constants are exact executable Foundation contracts; the array contract serializes the sole `{ requiredCheckContracts }` root through its nested item registry. Each required-check identity has exactly semanticRole, context, appSlug, integrationId, sourceKind, workflowPath, workflowRef, and workflowSha in that order; integrationId is always a positive live-readback GitHub integration/App ID, never null, zero, guessed, or hard-coded. Runtime observations such as checkRunId, headSha, status, and conclusion live in a separate non-receipt structure and can never be serialized as identity fields.
- Task 2 also solely owns `server/services/deployment/control-plane-required-check-registry.mjs`, whose only export is `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns })`. Its fixed semantic/workflow registry is module-private; it injects `integrationId` and `appSlug` only from one closed live-evidence snapshot and returns the exact object from `canonicalizeRequiredCheckContracts(...)`. Artifact, preflight, inventory, and Task 9 consume that one result byte-for-byte and may not define a second registry, identity array, resolver, or canonicalizer.
- Task 2 also owns the dependency-leaf INVENTORY_ATTESTATION_PREDICATE_CONTRACT. Artifact and inventory publishers import it and pass the same frozen predicateBindings to the real generic inspector and publisher; no consumer copies its field order, size bound, workflow mapping, or validation rules.
- Artifact and deployment preflight import this owner provider, consume canonical requiredCheckContracts bytes byte-for-byte, and require every exact context/integrationId/appSlug identity to report success for the bound source SHA; they do not redeclare, rediscover, project, or weaken the inventory set.
- Both typed inventory receipts carry only the Host-owned output of canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }. Inventory, release declaration, and deployment plan independently call that helper, require byte-identical bytes and the same bound sha256, and never define a local database item contract, field order, JSON.stringify comparison, renamed projection, or lossy mapping.
- The normal production workflow's original controller_closeout Actions artifact explicitly retains for 35 days, is named control-plane-controller-closeout-{controllerRecoveryId}-{originalRunId}-{originalRunAttempt}, and archives exactly one controller-closeout-{payloadSha256}.json. Repository default retention is never authority.
- Portable artifact.json remains Artifact Manifest v1. Deployment-only identity belongs in immutable companions, never as new portable-manifest fields.
- Existing .github/workflows/release-artifact.yml remains short-lived source-build evidence. Existing .github/workflows/production-deploy-dry-run.yml remains a non-mutating, non-authoritative text-plan exercise. Neither becomes a deployment input.
- Existing japan-runtime-config workflows, JAPAN_CI credentials, workstation SSH helpers, edge bootstrap, and restore-subscriptions.sh remain separate authorities and are not reused.
- G2 compatibility inventory calls `requestBootstrap({ credentialId: 'japan-control-plane-github-bootstrap-v1', requestBytes, timeoutMs })` only with `encodeCompatibilityInventoryRequestFrame` bytes and validates only `validateCompatibilityInventoryResponseFrame`; it never asks the host to activate a bundle. G3 uses a newly armed activation and the disjoint Bootstrap-owned `encodeBootstrapActivationRequestFrame` / `validateBootstrapActivationResponseFrame` pair through a new transport lifecycle's `requestBootstrap(...)`; the remote handler alone invokes the fixed Bootstrap root launcher. G2 compatibility evidence is strict read-only evidence and can never satisfy or be reused as G3 activation evidence. Normal G5 inventory uses its own normal-inventory request/response codec through `request({ credentialId: 'japan-control-plane-github-deploy-v1', requestBytes, timeoutMs })`; final deployment status and receipt recovery keep their separate ordinary-status and recovery ABIs. Compatibility Artifact publication performs no SSH operation.
- Bootstrap owns G3's internal two-frame handshake and timing constants. `requestBootstrap` validates and consumes the canonical `bootstrap_activation_ready_v1` frame internally, then returns only the final `bootstrap_activation_response_v1` envelope to Integration; no controller/operator constructs, receives, parses, or extends readiness. Integration passes only the owner-exported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` rather than a numeric timeout. Compatibility inventory remains a single-response 10,000-ms request and must never emit or accept an activation-ready frame.
- Consume Bootstrap's transport lifecycle without wrapping or recreating it: `createSecureSshTransport(...)` returns exactly the frozen five-method surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`. The first protected method validates and locks its method-specific fixed credential ID, proves the complete Foundation native capability vector, calls only `secretMaterializer.materializeFixedCredential(credentialId)` exactly once, and copies the returned tuple into an internal sealed credential capture. Every later method must use that same fixed ID; switching between bootstrap and deploy credential families rejects before cloning, while deploy `execute`, `request`, and `requestStatusBundle` share the same deploy capture. Every operation clones independent mutable buffers from that capture and zeroes/closes its clone in its own finally; idempotent `transport.close()` destroys the sealed capture, zeroes every retained byte, and makes all four operation methods reject `transport_closed`. A false or unknown probe performs zero materializer calls and reads no endpoint, key, known-hosts, or other protected bytes.
- One production workflow controller creates one deploy-credential transport for execute, bounded status polls, one authenticated terminal-bundle stream, both closeout transitions, and final read-only status, then closes it in the controller's outermost finally. One recovery controller owns one deploy-credential transport for challenge, recovered-selector, one through seven freshly correlated ordinary-status polls at fixed five-second intervals under one absolute 30-second deadline, and exactly one later `requestStatusBundle` stream after an immutable terminal; it closes the same transport in its outermost finally. Recovery must traverse challenge -> validated recovery selector -> `createPostRecoveryStatusRequest` -> real ordinary-status brand -> terminal bundle, and the critical row becomes eligible only after the Host-branded post-finalizer proof has propagated through Bootstrap's ordinary-status validator. Each normal or compatibility inventory invocation creates its own transport, sends exactly one method-specific inventory request, validates only the matching inventory response, and closes it in finally; G3 creates another bootstrap transport and sends exactly one activation request. No inventory or activation transport is shared across Gates, workflows, or receipt types.
- During the source implementation PR, do not modify docs/CURRENT_RELEASE_STATE.md, docs/PROJECT_CONTEXT.md, project-state/current.json, project-state/tasks.json, project-state/lanes.json, project-state/gates.json, or any generated project-state view.
- RELEASE_MANIFEST.md may be updated only to document durable companion semantics and the continued Artifact Manifest v1 boundary. It must not claim a Release exists, production is configured, or production was deployed.
- Preserve the existing docs/GITHUB_DEPLOYMENT_RUNBOOK.md sections named Protected Release Config Identity Gate and Condition-Driven Promotion Health Window, in that order.
- Every new JSON contract rejects duplicate keys, unknown keys, BOM, invalid UTF-8, trailing bytes, non-canonical serialization, unsafe strings, oversized input, and expiry at the exact boundary.
- No receipt, packet, error, fixture, test name, log, or documentation example may expose a hostname, IP address, user, port, host path, database path, config value, raw environment value, process ID, key fingerprint, credential reference, token, OIDC assertion, customer data, subscription material, or response body.
- identity_impact is false for the source PR. The source contracts do not change a runtime principal, protected usage map, material binding, or collector identity resolution. A later credential bootstrap is a separate Risk A operation and does not change this source-only declaration.

## Plan and PR Topology

| Order | Plan | Source ownership | Gate to continue |
| --- | --- | --- | --- |
| 0 | Foundation checkpoint | Canonical JSON, durable store, native capabilities, exact-FD spawn, sealed memory, OFD lease, descriptor transfer, durable file operations | All native and disposable-Linux feasibility tests pass without skips |
| 1 | Host/DB Tasks 0-1 | Freeze database identity/canonicalization and the earliest Host-owned contracts | Owner tests pass; no downstream contract is copied |
| 2 | This plan, Task 2 | Freeze typed normal/compatibility inventory schemas, fields, IDs, and resolvers with synthetic staged-manifest digests only | Resolver tests pass without reading a final staged manifest |
| 3 | Artifact Tasks 1-2 | Freeze Production Gate and deployment-plan identity against the typed inventory surface | Gate/plan canonical tests pass |
| 4 | Bootstrap Tasks 1-8 | Static bootstrap, rotation, forced entry, and fixed-credential transport | Task 8 transport checkpoint passes; host authorization is still deferred |
| 5 | Host/DB Tasks 2-10 | Complete database/writer/transaction providers available before Receipt contracts | Owner tests pass with no Receipt consumer shortcut |
| 6 | Receipt Tasks 1-3 | Add transaction-bound terminal store/publisher, immutable closeout, and final-status contracts | Receipt owner tests pass |
| 7 | Artifact Tasks 3-8 | Build artifact/declaration/publication providers through production authorization | Artifact Task 8 passes without executing a publisher or workflow |
| 8 | Host/DB Task 11A broker + inventory-reader provider checkpoint | Implement and commit only the closed broker provider plus sole branded normal/compatibility Host reader pair required by Bootstrap | Broker and reader owner tests pass; the consumer-dependent remainder stays deferred |
| 9 | Bootstrap Tasks 9-10 | Consume the narrow broker and add authorization/protocol providers | Bootstrap owner tests pass |
| 10 | Receipt Task 4 | Consume Bootstrap protocol/transport and add the closeout adapter | Adapter and real codec tests pass |
| 11 | Artifact Tasks 9-10 | Consume the completed adapter/provider surfaces for the two Artifact Gate checkpoints | Artifact Gate tests pass; no workflow is dispatched |
| 12 | Host/DB Task 11 remainder and Tasks 12-13 | Complete transaction/recovery consumers and the seven-scenario Host harness | Host owner tests and clean harness pass |
| 13 | Receipt Tasks 5-8 | Complete recovery, recovered publication, and workflow contracts | Receipt recovery tests pass without publication |
| 14 | Artifact Tasks 11-13 | Complete production controller/workflow/Deploy Note providers | Artifact owner tests pass without a production run |
| 15 | Bootstrap Task 11 | Complete the final clean-Linux bootstrap/systemd checkpoint | Target-matching disposable-Linux proof passes |
| 16 | This plan, Task 1 | Compute actual host-execution, receipt-contract, and staged-host bundle digests from the now-complete static tree | Builder/readback tests pass; no digest was filled early |
| 17 | Host/DB Task 14A | Consume Task 1's final validator/manifest and implement/test the sole source-only G1a host bundle installer without invoking it | Installer owner tests pass against synthetic roots; no host is accessed or staged |
| 18 | This plan, Task 3 | Add typed inventory CLIs, publishers, and workflows after the Host installer contract is fixed | Focused source-only workflow tests pass |
| 19 | Host/DB Task 14B | Align Host runbooks and complete its remaining source-only validation checkpoint | Host Task 14B passes before aggregate composition begins |
| 20 | This plan, Tasks 4-9 | Add aggregate integration and no-secret workflow, validate the Artifact-owned controller composition without changing it, update docs, and produce the exact Draft-PR handoff | Complete matrix passes on one exact head, independent reviews approve, and the sole PR remains Draft for the master owner |

All rows remain on the same local source implementation branch until the Issue and exact PR body are resolved. Commits are checkpoint boundaries, not separate release units, pushes, PRs, readiness decisions, or merges. The branch is pushed and its one Draft PR is opened exactly once in final Task 9. Task 9 never marks it Ready and never merges it; the master implementation program is the sole Ready/Merge owner.

### Interleaved Task-Level Dependency Graph

Task numbers are stable ownership labels, not execution order. The only approved schedule is the provider/consumer sequence below. In particular, Integration Task 2 precedes Artifact Tasks 1-2; Host Task 11A contributes both the closed broker and branded inventory-reader pair before Bootstrap consumes either; Integration Task 1 precedes Host Task 14A because the installer consumes the final manifest validator; Task 14A precedes Integration Task 3; and Integration Task 3 precedes Host Task 14B as the mandatory stop-before gate. No Integration Task 4-9 work may begin until Host Task 14B is GREEN and committed.

~~~mermaid
flowchart LR
  A["Foundation"] --> B["Host Tasks 0-1"]
  B --> C["Integration Task 2"]
  C --> D["Artifact Tasks 1-2"]
  D --> E["Bootstrap Tasks 1-8"]
  E --> F["Host Tasks 2-10"]
  F --> G["Receipt Tasks 1-3"]
  G --> H["Artifact Tasks 3-8"]
  H --> I["Host Task 11A broker + inventory-reader provider checkpoint"]
  I --> J["Bootstrap Tasks 9-10"]
  J --> K["Receipt Task 4"]
  K --> L["Artifact Tasks 9-10"]
  L --> M["Host Task 11 remainder and Tasks 12-13"]
  M --> N["Receipt Tasks 5-8"]
  N --> O["Artifact Tasks 11-13"]
  O --> P["Bootstrap Task 11"]
  P --> Q["Integration Task 1"]
  Q --> R["Host Task 14A G1a installer source contract"]
  R --> S["Integration Task 3"]
  S --> U["Host Task 14B docs and validation"]
  U --> T["Integration Tasks 4-9; Task 6 is no-change validation; Task 9 leaves Draft"]
~~~

After that PR merges:

1. A separate C-tier source-state reconciliation PR binds the exact merge SHA and records only that the source capability exists, is unconfigured, and is not deployed.
2. External G1-G9 work proceeds only through separately approved Risk A Gates described in the handoff section below.
3. A separate production-attempt closeout updates durable state only after a verified terminal receipt. The source PR body states only `Production status: not_deployed`; the first real Deploy Note is a bounded merged-PR comment written after G9 evidence exists and never edits the PR body.

## File Structure

### Shared dependencies consumed from the other plans

- server/services/deployment/canonical-json.mjs: parseCanonicalJsonBytes, serializeCanonicalJsonBytes, sha256Hex.
- server/services/deployment/control-plane-transport-contract.mjs: owner exports `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS = 900_000`, `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS = 910_000`, and `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS = 925_000`; Integration imports only the request-timeout constant for G3. `createSecureSshTransport({ native, clock, secretMaterializer }) -> { execute, request, requestStatusBundle, requestBootstrap, close }` has that exact frozen key order, fixed method-specific credential IDs, one lazy `materializeFixedCredential(credentialId)` call per lifecycle, an internal sealed credential capture, per-operation owned clones, and idempotent close. For activation only, `requestBootstrap` privately validates/consumes `bootstrap_activation_ready_v1`, enforces the owner deadlines, and exposes only the terminal response; compatibility inventory retains its single-response 10,000-ms path.
- server/services/deployment/control-plane-host-protocol.mjs: Bootstrap-owned `encodeNormalInventoryRequestFrame`/`validateNormalInventoryResponseFrame`, `encodeCompatibilityInventoryRequestFrame`/`validateCompatibilityInventoryResponseFrame`, and `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame` are three disjoint ABIs. The activation encoder accepts exactly `{ requestId, activationId, activationRecordSha256, bootstrapActivationGateReceiptSha256, operationEnvelopeBytes }`; its validator accepts only `(responseBytes, { requestId, activationId })` and returns the exact ordered `{ type, requestType, requestId, activationId, activationState, terminalResultSha256 }`. Ordinary deployment status keeps `encodeStatusRequestFrame`/`encodeStatusResponseFrame`/`validateStatusResponseFrame` with `status_response_v1`/request-ID binding; `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })` is the only recovery-to-ordinary bridge; `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs }) -> frozen { bytes, sha256 }` owns one authenticated `requestStatusBundle` session, 768-byte raw chunks, a 262144-byte bundle maximum, at most 342 chunks, and a 2048-byte response-envelope maximum; recovery keeps `validateRecoveryChallengeResponse` and `validateRecoveredStatusResponse`. Integration consumes each Bootstrap codec and the bounded terminal-bundle reader as opaque abstractions and never implements a chunk loop, chunk codec, bundle parser, brand conversion, or field alias.
- server/services/deployment/control-plane-host-inventory-readers.mjs: Host-owned sole exports `createControlPlaneHostInventoryReaders(deps)` and `assertControlPlaneHostInventoryReaders(value)`. The factory returns the private-WeakSet-branded exact frozen `{ normalInventoryReader, compatibilityInventoryReader }`, each an exact frozen `{ read(request) }`. Normal `read` accepts only Bootstrap-decoded `{ type: 'inventory_normal', requestId, inventoryGateId, sourceCommit }`; compatibility accepts only `{ type: 'inventory_compatibility', requestId, compatibilityInventoryGateId, sourceCommit, activationId, hostBundleContentReceiptSha256 }`. Each returns only the matching Bootstrap response-encoder value with echo bindings, `observedAt`, `inventoryEvidenceSha256`, and canonical `inventoryEvidenceBytesBase64` whose decoded bytes are at most 768; compatibility constant-time-compares the fixed armed activation evidence but neither reader selects/opens a path/resource or mutates. Integration never recreates a Host reader, evidence encoder, path/resource selector, or mutation route.
- server/services/deployment/control-plane-host-bundle-installer.mjs: Host-owned `createControlPlaneHostBundleInstaller(deps) -> { installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding }) }` is the only G1a static-content installation/readback entry point. Integration owns the input manifest/content validation but never creates a second stager or calls this source API before a fresh post-merge G1a Gate.
- server/services/deployment/database-contract.mjs: canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }; inventory consumes this sole public canonicalization surface without importing or recreating the private database entry contract.
- server/services/deployment/control-plane-required-check-contract.mjs: executable REQUIRED_CHECK_CONTRACT and REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts, canonicalizeRequiredCheckContracts, and validateRequiredCheckRunObservations; it imports Foundation serializeCanonicalJsonBytes/sha256Hex, serializes only the one-field root contract, and Artifact imports this Integration-owned provider rather than defining a contract or serializer.
- server/services/deployment/control-plane-required-check-registry.mjs: sole export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns })`; its module-private semantic/workflow registry plus closed live evidence produce the one canonical Task 2 eight-field identity array.
- server/services/deployment/control-plane-inventory-attestation-predicate.mjs: sole export INVENTORY_ATTESTATION_PREDICATE_CONTRACT; Artifact and typed inventory publishers consume this dependency leaf without redefining it.
- scripts/control-plane-bootstrap-root.mjs: Bootstrap-owned `createBootstrapRootLauncher({ native, machine, systemdBroker, clock }) -> { run(operationEnvelopeBytes, { onAuthorized }) }`; only the Bootstrap activation protocol handler may invoke it for G3 after decoding the exact owned operation-envelope bytes and creating its fixed callback, and Integration never imports it into an inventory CLI or exposes a command/unit/path selector.
- scripts/control-plane-bootstrap-operation.mjs: the no-argument, no-stdin bootstrap cgroup operation that reads the fixed active lease plus immutable activation record and revalidates journal, expiry, and installed digest before rotation.
- scripts/github-immutable-release-publisher.mjs: inspectImmutableAssetAttestationPair and publishImmutableAssetAttestationPair, both requiring the exact attestationIdentity object.
- scripts/control-plane-production-gate.mjs: parseProductionGateId, createProductionGateReceipt, validateProductionGateReceipt.
- scripts/control-plane-deployment-plan.mjs: computeDeploymentPlanTemplateSha256, materializeDeploymentPlan, validateDeploymentPlanBytes.
- scripts/control-plane-host-integration.mjs: CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS, runControlPlaneHostIntegrationScenario, runAllControlPlaneHostIntegrationScenarios.
- server/services/deployment/control-plane-receipt-contract.mjs: validateHostTerminalReceiptBytes, validateHostTerminalRecord, validateHostCloseoutRecord, mapHostFinalStateToControllerResult.
- server/services/deployment/control-plane-controller-closeout.mjs: buildControllerCloseout, validateControllerCloseoutBytes, classifyControllerCloseout, buildActionsArtifactObservation, CONTROLLER_FINAL_STATUS_CONTRACT, buildControllerFinalStatus, and validateControllerFinalStatus.
- server/services/deployment/control-plane-controller-closeout-adapter.mjs: createControllerCloseoutAdapter with Receipt-owned no-claim bytes, complete transport-envelope validators, immutable Actions observation wrapper, and no final-status writer.
- server/services/deployment/control-plane-receipt-recovery.mjs: recovered-closeout builders and validators.
- server/tests/helpers/control-plane-deployment-fixtures.mjs: synthetic release, database, workflow, receipt, and fault fixtures.

### Files created by this plan

- ops/control-plane-deploy/contracts/host-execution-contract.json
- ops/control-plane-deploy/contracts/receipt-contract.json
- ops/control-plane-deploy/contracts/staged-host-bundle-manifest.json
- scripts/control-plane-staged-bundle-manifest.mjs
- server/tests/control-plane-staged-bundle-manifest.test.mjs
- schemas/control-plane-inventory-receipt-v1.schema.json
- schemas/control-plane-compatibility-inventory-receipt-v1.schema.json
- schemas/control-plane-required-check-contract-v1.schema.json
- server/services/deployment/control-plane-required-check-contract.mjs
- server/services/deployment/control-plane-required-check-registry.mjs
- server/services/deployment/control-plane-inventory-attestation-predicate.mjs
- server/services/deployment/control-plane-inventory-receipt.mjs
- server/services/deployment/control-plane-compatibility-inventory-receipt.mjs
- server/services/deployment/control-plane-readonly-inventory.mjs
- server/services/deployment/control-plane-compatibility-readonly-inventory.mjs
- scripts/control-plane-readonly-inventory.mjs
- scripts/control-plane-compatibility-readonly-inventory.mjs
- scripts/control-plane-inventory-receipt-publisher.mjs
- .github/workflows/japan-control-plane-readonly-inventory.yml
- .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml
- scripts/control-plane-source-integration.mjs
- .github/workflows/control-plane-source-integration.yml
- server/tests/control-plane-inventory-receipt.test.mjs
- server/tests/control-plane-compatibility-inventory-receipt.test.mjs
- server/tests/control-plane-required-check-contract.test.mjs
- server/tests/control-plane-required-check-registry.test.mjs
- server/tests/control-plane-inventory-attestation-predicate.test.mjs
- server/tests/control-plane-readonly-inventory.test.mjs
- server/tests/control-plane-compatibility-readonly-inventory.test.mjs
- server/tests/control-plane-inventory-receipt-publisher.test.mjs
- server/tests/control-plane-readonly-inventory-workflow.test.mjs
- server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
- server/tests/control-plane-source-integration.test.mjs
- server/tests/control-plane-source-integration-workflow.test.mjs
- server/tests/control-plane-deployment-documentation.test.mjs

### Files modified by this plan

- package.json: add exactly one networkless source-integration command.
- schemas/README.md: index the inventory receipt schema as source contract only.
- docs/GITHUB_DEPLOYMENT_RUNBOOK.md: add the source/production authority split, workflow roles, G1-G9 operator sequence, failure stops, and Deploy Note evidence boundary.
- RELEASE_MANIFEST.md: document durable deployment companions while preserving Artifact Manifest v1 and production_state: not_deployed.
- docs/VALIDATION_BASELINE.md: add the source-integration, clean-Linux, exact-head, and no-secret validation matrix.
- docs/README.md: index the approved design, six implementation plans, updated runbook, and inventory schema authority.

### Adjacent owner files verified but explicitly not modified by this plan

- Artifact Task 10 owns `.github/workflows/control-plane-compatibility-artifact-gate.yml` and its test. Artifact Tasks 11-12 solely own `server/services/deployment/control-plane-production-controller.mjs`, `scripts/control-plane-production-controller.mjs`, `.github/workflows/japan-control-plane-production-deploy.yml`, `scripts/control-plane-deploy-note.mjs`, and their controller/workflow/bounded-PR-comment Deploy Note tests and wiring. Integration Task 6 verifies those exact committed bytes and real tests without modifying, staging, recommitting, or wiring around any Artifact-owned file.

### Files explicitly excluded from the source PR

- docs/CURRENT_RELEASE_STATE.md
- docs/PROJECT_CONTEXT.md
- project-state/current.json
- project-state/tasks.json
- project-state/lanes.json
- project-state/gates.json
- docs/production-replacement-records/*
- Any provider, host, systemd, database, GitHub Environment, App, secret, Release, attestation, or production execution state

## Interfaces

### Final installed contracts and staged bundle manifest

scripts/control-plane-staged-bundle-manifest.mjs is the sole owner of the final static-source digest pass and exports:

~~~js
export async function buildFinalControlPlaneContracts({ repositoryRoot, readFile, lstat }) {}
export function validateHostExecutionContractBytes(bytes, expected) {}
export function validateReceiptContractBytes(bytes, expected) {}
export function validateStagedHostBundleManifestBytes(bytes, expected) {}
~~~

The zero-argument CLI reads the fixed repository-relative host layout and every source path declared by that layout, then writes only the three fixed tracked outputs. It refuses to run until all bootstrap, transport, host/database, receipt, recovery, unit, drop-in, native, and adapter sources exist. It sorts by logical ID, rejects symlinks, duplicates, undeclared files, mode drift, empty files, unsafe paths, and secret-like bytes, then computes digests from actual final bytes.

ops/control-plane-deploy/contracts/host-execution-contract.json owns the exact logical IDs and digests for launchers, adapters, native executables, systemd units/drop-ins, writer/database contracts, validation, rollback, recovery, cleanup, and authorization surfaces. ops/control-plane-deploy/contracts/receipt-contract.json owns every retained receipt schema/parser ID/digest and mutability class. ops/control-plane-deploy/contracts/staged-host-bundle-manifest.json binds both contract digests, host-layout digest, sorted file entries, aggregate content digest, and staged content receipt domain. No adjacent plan may fill these digests early or substitute a directory label.

### Required-check identity provider

server/services/deployment/control-plane-required-check-contract.mjs is the sole owner and exports:

~~~js
import {
  serializeCanonicalJsonBytes,
  sha256Hex
} from './canonical-json.mjs';

export const REQUIRED_CHECK_CONTRACT = Object.freeze({
  schemaId: 'control-plane-required-check-v1',
  maxBytes: 4_096,
  fieldOrder: Object.freeze([
    'semanticRole',
    'context',
    'appSlug',
    'integrationId',
    'sourceKind',
    'workflowPath',
    'workflowRef',
    'workflowSha'
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (!/^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/.test(value.semanticRole)) throw new Error('required_check_semantic_role_invalid');
    if (typeof value.context !== 'string'
        || value.context.length < 1
        || value.context.length > 200
        || /[\u0000-\u001f\u007f]/.test(value.context)) throw new Error('required_check_context_invalid');
    if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value.appSlug)) throw new Error('required_check_app_slug_invalid');
    if (!Number.isSafeInteger(value.integrationId) || value.integrationId < 1) throw new Error('required_check_integration_id_invalid');
    if (!['workflow', 'github_default_setup'].includes(value.sourceKind)) throw new Error('required_check_source_kind_invalid');
    if (value.sourceKind === 'workflow') {
      if (!/^\.github\/workflows\/[a-zA-Z0-9._-]+\.ya?ml$/.test(value.workflowPath)) throw new Error('required_check_workflow_path_invalid');
      if (value.workflowRef !== 'refs/heads/master') throw new Error('required_check_workflow_ref_invalid');
      if (!/^[0-9a-f]{40}$/.test(value.workflowSha)) throw new Error('required_check_workflow_sha_invalid');
    } else if (value.workflowPath !== null || value.workflowRef !== null || value.workflowSha !== null) {
      throw new Error('required_check_inapplicable_workflow_identity');
    }
  }
});

export const REQUIRED_CHECK_ARRAY_CONTRACT = Object.freeze({
  schemaId: 'control-plane-required-check-array-v1',
  maxBytes: 262_144,
  fieldOrder: Object.freeze(['requiredCheckContracts']),
  nested: Object.freeze({
    'required-check-v1': REQUIRED_CHECK_CONTRACT
  }),
  arrays: Object.freeze({
    requiredCheckContracts: 'required-check-v1'
  }),
  validate(value) {
    if (!Array.isArray(value.requiredCheckContracts)
        || value.requiredCheckContracts.length < 2
        || value.requiredCheckContracts.length > 64) {
      throw new Error('required_check_array_length_invalid');
    }
  }
});

function assertRequiredCheckSetInvariants(sorted) {
  const contexts = new Set();
  const roles = new Set();
  const tuples = new Set();
  for (const item of sorted) {
    if (contexts.has(item.context)) throw new Error('required_check_context_duplicate');
    if (roles.has(item.semanticRole)) throw new Error('required_check_semantic_role_duplicate');
    const tuple = REQUIRED_CHECK_CONTRACT.fieldOrder.map((field) => String(item[field])).join('\0');
    if (tuples.has(tuple)) throw new Error('required_check_identity_duplicate');
    contexts.add(item.context);
    roles.add(item.semanticRole);
    tuples.add(tuple);
  }
  if (!roles.has('validate') || !roles.has('codeql')) throw new Error('required_check_semantic_role_missing');
}

export function canonicalizeRequiredCheckContracts(value) {
  REQUIRED_CHECK_ARRAY_CONTRACT.validate({ requiredCheckContracts: value });
  const sorted = [...value].map((item) => Object.freeze({ ...item })).sort((left, right) => {
    for (const field of REQUIRED_CHECK_CONTRACT.fieldOrder) {
      const leftValue = String(left[field]);
      const rightValue = String(right[field]);
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
    }
    return 0;
  });
  assertRequiredCheckSetInvariants(sorted);
  Object.freeze(sorted);
  const bytes = serializeCanonicalJsonBytes(
    { requiredCheckContracts: sorted },
    REQUIRED_CHECK_ARRAY_CONTRACT
  );
  return Object.freeze({
    requiredCheckContracts: sorted,
    bytes,
    sha256: sha256Hex(Buffer.concat([
      Buffer.from('control-plane-required-check-contracts-v1\0', 'utf8'),
      bytes
    ]))
  });
}

export function validateRequiredCheckContracts(value) {
  return canonicalizeRequiredCheckContracts(value).requiredCheckContracts;
}
export function validateRequiredCheckRunObservations(
  value,
  { sourceCommit, requiredCheckContracts }
) {}
~~~

Both constants are directly executable Foundation canonical contracts, not descriptive metadata. Their schemaId, maxBytes, frozen fieldOrder, frozen nested registry, frozen arrays registry, and validate function are mandatory. The array root has exactly one field, requiredCheckContracts; its arrays descriptor resolves the string required-check-v1 through its nested registry to REQUIRED_CHECK_CONTRACT. No descriptive shorthand and no local serializer are permitted.

Each identity object has those eight fields and no others. integrationId is a positive integer read from the active protected-master ruleset and must equal the live check run's positive app.id; appSlug must equal that same run's app.slug. canonicalizeRequiredCheckContracts first validates the input array shape, makes frozen exact-field item copies, sorts only by the closed tuple semanticRole/context/integrationId/appSlug/sourceKind/workflowPath/workflowRef/workflowSha, enforces duplicate/context/role invariants, and then calls the Foundation serializer exactly as `serializeCanonicalJsonBytes({ requiredCheckContracts: sorted }, REQUIRED_CHECK_ARRAY_CONTRACT)`. It returns a frozen `{ requiredCheckContracts: sorted, bytes, sha256 }`; sha256 is the Foundation sha256Hex of the exact domain prefix `control-plane-required-check-contracts-v1\0` concatenated with bytes. validateRequiredCheckContracts reuses that exact canonicalizer and returns only its frozen sorted array. Neither function invokes a native JSON encoder, owns an alternate field walker, or serializes a bare array.

The executable contracts and canonicalizer reject missing or unknown root/item fields, deep object-key permutations only by producing identical bytes, sparse arrays, duplicate contexts, duplicate semantic roles, duplicate identity tuples, missing validate/codeql roles, nullable/non-positive integrationId, inapplicable non-null workflow fields, unknown sourceKind, tuple drift, fewer than two or more than 64 entries, and any Foundation size/canonicality failure.

validateRequiredCheckRunObservations consumes a separate runtime-only array whose exact fields are checkRunId, context, integrationId, appSlug, headSha, status, conclusion, and detailsUrl. It requires positive unique checkRunId values, exact context/integrationId/appSlug matches against every identity, the bound 40-hex sourceCommit, completed/success, no missing or extra required identity, and no duplicate or drifting observation. Runtime fields are never accepted by validateRequiredCheckContracts, never stored in either inventory receipt, and never used as a five-field replacement for the eight-field identity. Artifact imports REQUIRED_CHECK_ARRAY_CONTRACT plus the validator/canonicalizer from this module; it may not define REQUIRED_CHECK_ARRAY_CONTRACT locally.

schemas/control-plane-required-check-contract-v1.schema.json is the single schema authority for the exact eight-field identity. Both inventory schemas reference it for requiredCheckContracts items, and no consumer repeats those item properties.

`server/services/deployment/control-plane-required-check-registry.mjs` has exactly one export:

~~~js
export function resolveControlPlaneRequiredCheckContracts({
  sourceCommit,
  rulesetRequirements,
  checkRuns
}) {}
~~~

The module owns one non-exported, frozen semantic/workflow registry. Each private row contains only `semanticRole`, `context`, `sourceKind`, `workflowPath`, and `workflowRef`; a workflow row fixes `workflowRef` to `refs/heads/master`, while `github_default_setup` fixes all three workflow fields to canonical `null`. The private registry contains each supported protected-master context exactly once and exactly one `validate` plus one `codeql` role. It never contains `integrationId`, `appSlug`, a check-run ID, status, conclusion, source SHA, or a production App guess.

`resolveControlPlaneRequiredCheckContracts` accepts exactly the three named keys, validates one 40-hex `sourceCommit`, a complete closed ruleset-requirement snapshot, and a complete closed exact-head check-run snapshot. For every private registry row it requires exactly one ruleset row and exactly one successful check run whose context, positive `app.id`, `app.slug`, and `head_sha` agree; it rejects missing/extra live contexts, duplicate IDs, nullable/non-positive integration identity, wrong head, non-completed/non-success, ambiguous names, workflow-path/ref drift, and any registry/live-snapshot cardinality mismatch. It derives `workflowSha` as `sourceCommit` only for `workflow`, keeps it `null` for `github_default_setup`, builds exact eight-field objects in `REQUIRED_CHECK_CONTRACT.fieldOrder`, and returns the exact frozen `{ requiredCheckContracts, bytes, sha256 }` object from `canonicalizeRequiredCheckContracts(...)` without wrapping, copying, serializing, or re-hashing it. This is the only semantic/workflow-to-identity resolver in the repository. Artifact, inventory preflight, and Task 9 import it; none owns a second registry, context-to-role switch, identity array, or canonicalizer.

server/services/deployment/control-plane-inventory-attestation-predicate.mjs has exactly one export:

~~~js
export const INVENTORY_ATTESTATION_PREDICATE_CONTRACT = Object.freeze({
  schemaId: 'control-plane-inventory-attestation-predicate-v1',
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    'schema',
    'repository',
    'inventoryType',
    'sourceCommit',
    'workflowPath',
    'workflowRef',
    'workflowSha',
    'runtimeContractId',
    'inventoryReceiptSha256',
    'requiredCheckContractsSha256'
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {}
});
~~~

Its validator requires schema control_plane_inventory_attestation_v1; repository gccwebos-com/proxy-gateway-minimal; inventoryType exactly control_plane_normal_inventory_receipt or control_plane_compatibility_inventory_receipt; the matching fixed normal/compatibility inventory workflowPath; workflowRef exactly gccwebos-com/proxy-gateway-minimal/{workflowPath}@refs/heads/master; workflowSha equal to sourceCommit; a safe runtimeContractId; and 64-hex inventoryReceiptSha256 plus requiredCheckContractsSha256. Unknown fields, wrong key order, values over 16384 canonical bytes, a cross-type workflow, or a copied/local contract reject. The publisher builds predicateBindings only from the validated receipt, the receipt digest, and canonicalizeRequiredCheckContracts(...).sha256, freezes it, and passes the same object to generic inspection and publication.

### Typed inventory receipts and external IDs

server/services/deployment/control-plane-inventory-receipt.mjs exports:

~~~js
export function createInventoryGateId({
  sourceCommit,
  runtimeContractId,
  receiptSha256
}) {}

export function parseInventoryGateId(inventoryGateId) {}

export async function resolveInventoryReceipt({
  repository,
  inventoryGateId,
  token,
  fetchFn
}) {}
~~~

resolveInventoryReceipt is the backward-compatible normal-only resolver. It derives the normal Release tag and asset name from the ig1 ID, never accepts a URL or path, requires exactly one immutable matching asset and attestation pair, reads at most 262144 bytes, verifies the asset digest before parsing, verifies type control_plane_normal_inventory_receipt and two-hour validity, and returns:

~~~js
{
  bytes,
  sha256,
  receipt
}
~~~

server/services/deployment/control-plane-compatibility-inventory-receipt.mjs exports:

~~~js
export function createCompatibilityInventoryGateId({
  sourceCommit,
  runtimeContractId,
  receiptSha256
}) {}

export function parseCompatibilityInventoryGateId(compatibilityInventoryGateId) {}

export async function resolveCompatibilityInventoryReceipt({
  repository,
  compatibilityInventoryGateId,
  token,
  fetchFn
}) {}
~~~

The compatibility resolver accepts only cig1, control_plane_compatibility_inventory_receipt, the compatibility Release prefix, and the compatibility asset prefix. Cross-type ID, body, Release, asset, schema, or resolver combinations fail before any publication or artifact selection.

server/services/deployment/control-plane-readonly-inventory.mjs exports:

~~~js
export async function createControlPlaneReadonlyInventory({
  githubEvidence,
  transport,
  hostStatus,
  clock
}) {}

export function validateControlPlaneInventoryReceiptBytes(
  bytes,
  { sourceCommit, now }
) {}
~~~

server/services/deployment/control-plane-compatibility-readonly-inventory.mjs exports:

~~~js
export async function createControlPlaneCompatibilityReadonlyInventory({
  githubEvidence,
  transport,
  hostStatus,
  stagedBundleReceipt,
  clock
}) {}

export function validateControlPlaneCompatibilityInventoryReceiptBytes(
  bytes,
  { sourceCommit, stagedHostBundleContentReceiptSha256, now }
) {}
~~~

The receipt body has no inventoryGateId field. The following YAML is the exact non-database fixture fragment; databaseContracts and databaseContractsSha256 are intentionally absent here because they are attached only through the Host-owned helper shown immediately after it:

~~~yaml
schemaVersion: "1"
type: control_plane_normal_inventory_receipt
repository: gccwebos-com/proxy-gateway-minimal
sourceCommit: 1111111111111111111111111111111111111111
target: japan-control-plane
releaseUnit: control-plane-app
service: proxy-gateway-candidate.service
runtimeContractId: node22-linux-x64-glibc
createdAt: 2026-08-08T12:00:00.000Z
expiresAt: 2026-08-08T14:00:00.000Z
expectedCurrentRelease: release-20260808-001
platform:
  architecture: x64
  libc: glibc
  nodeAbi: "127"
contracts:
  hostExecutionSha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  bootstrapReceiptSha256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  bootstrapCloseoutSha256: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
  receiptParserRegistrySha256: dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
requiredCheckContracts:
  - semanticRole: validate
    context: Validate
    appSlug: synthetic-ci
    integrationId: 1001
    sourceKind: workflow
    workflowPath: .github/workflows/ci.yml
    workflowRef: refs/heads/master
    workflowSha: "3333333333333333333333333333333333333333"
  - semanticRole: codeql
    context: CodeQL
    appSlug: synthetic-code-scanning
    integrationId: 1002
    sourceKind: github_default_setup
    workflowPath: null
    workflowRef: null
    workflowSha: null
rollback:
  sourceCommit: 2222222222222222222222222222222222222222
  artifactSha256: eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
  treeManifestSha256: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  persistedDataPairSha256: "0000000000000000000000000000000000000000000000000000000000000000"
writers:
  candidateRegistrySha256: "1111111111111111111111111111111111111111111111111111111111111111"
  rollbackRegistrySha256: "2222222222222222222222222222222222222222222222222222222222222222"
  verificationReceiptSha256: "3333333333333333333333333333333333333333333333333333333333333333"
  bidirectionalJoinAccepted: true
status:
  serviceActive: true
  workingReleaseMatchesRollback: true
  recoveryQuiescent: true
  rotationClosed: true
  hostClockSynchronized: true
  capacityAccepted: true
accepted: true
~~~

~~~js
import { canonicalizeDatabaseContracts } from './database-contract.mjs';

function attachCanonicalDatabaseContracts(nonDatabaseReceiptValue, inputDatabaseContracts) {
  const canonical = canonicalizeDatabaseContracts(inputDatabaseContracts);
  return Object.freeze({
    receiptValue: Object.freeze({
      ...nonDatabaseReceiptValue,
      databaseContracts: canonical.databaseContracts,
      databaseContractsSha256: canonical.sha256
    }),
    databaseContractsBytes: canonical.bytes
  });
}
~~~

The compatibility body replaces type with control_plane_compatibility_inventory_receipt and requires stagedHostBundleManifestSha256, stagedHostBundleContentReceiptSha256, hostLayoutSha256, expectedCurrentRelease, platform/runtime facts, rollback tree/artifact/persisted-data identity, canonical writer registries, databaseContracts, databaseContractsSha256, requiredCheckContracts, createdAt, expiresAt, and accepted. It has no field named bootstrapReceiptSha256, bootstrapCloseoutSha256, bootstrapGeneration, authorizationBindingHmacSha256, authorizationStateSha256, credentialId, or rotationClosed. The normal body requires the same helper-produced database pair/digest plus those final bootstrap/authorization/cleanup bindings and cannot validate until G4 has closed.

The example uses test-only synthetic integration/App identities; production integration IDs and App slugs come only from live GitHub readback and are never invented in source or docs. Every requiredCheckContracts record has exactly semanticRole, context, appSlug, integrationId, sourceKind, workflowPath, workflowRef, and workflowSha in REQUIRED_CHECK_CONTRACT.fieldOrder; fields inapplicable to sourceKind are canonical null. The array contains each ruleset-required context exactly once and at least the validate and codeql semantic roles. Check-run status/conclusion/head/id/details data is validated separately and is absent from the receipt identity.

Both receipt creators call canonicalizeDatabaseContracts exactly once, attach only its databaseContracts and sha256, and retain its bytes for comparison. On parse, inventory, release declaration, and deployment plan each call the helper independently, compare Buffer bytes with bytes.equals, and bind the returned sha256; none imports a private contract, repeats item properties/order/conditionals, calls JSON.stringify for equality, or independently reconstructs the pair.

Both receipt creators likewise call canonicalizeRequiredCheckContracts exactly once and retain its one-field Foundation bytes plus domain sha256. Artifact release/deployment consumers import the same executable contracts and helper, compare those exact bytes/digest, and never substitute a bare array, a local field list, or a consumer-owned serializer.

The implementation may add only fields already required by the approved design, and every such field must be added to the schema, validator, fixture, runbook field table, and contract tests in the same commit. It must not add raw paths, endpoints, config, database rows, host identifiers, or credentials.

### Inventory-only transport

Normal inventory imports createSecureSshTransport({ native, clock, secretMaterializer }), owns that transport for exactly one materialization/request lifecycle, uses only the Bootstrap-owned normal-inventory request/response codec, and always closes it:

~~~js
const transport = createSecureSshTransport({ native, clock, secretMaterializer });
try {
  await transport.request({
    credentialId: 'japan-control-plane-github-deploy-v1',
    requestBytes: encodeNormalInventoryRequestFrame(normalInventoryRequest),
    timeoutMs: 10_000
  });
} finally {
  transport.close();
}
~~~

G2 compatibility inventory owns a separate one-materialization/one-request transport and uses `requestBootstrap` because it precedes the final deploy credential. It uses only the Bootstrap-owned compatibility-inventory request/response codec and the Host-owned `compatibilityInventoryReader.read(decodedRequest)` through Bootstrap's remote handler:

~~~js
const transport = createSecureSshTransport({ native, clock, secretMaterializer });
try {
  await transport.requestBootstrap({
    credentialId: 'japan-control-plane-github-bootstrap-v1',
    requestBytes: encodeCompatibilityInventoryRequestFrame({
      ...compatibilityInventoryRequest,
      activationId
    }),
    timeoutMs: 10_000
  });
} finally {
  transport.close();
}
~~~

The separately approved G3 activation never sends the compatibility-inventory frame and never calls either Host inventory reader. It requires a newly armed activation whose identity/evidence differs from G2, uses the Bootstrap-owned activation codec, and reaches only the fixed root launcher through the Bootstrap remote handler:

~~~js
const transport = createSecureSshTransport({ native, clock, secretMaterializer });
try {
  const requestBytes = encodeBootstrapActivationRequestFrame({
    requestId: g3RequestId,
    activationId: g3Activation.activationId,
    activationRecordSha256: g3Activation.activationRecordSha256,
    bootstrapActivationGateReceiptSha256: g3Activation.bootstrapActivationGateReceiptSha256,
    operationEnvelopeBytes: g3OperationEnvelopeBytes
  });
  const transportResult = await transport.requestBootstrap({
    credentialId: 'japan-control-plane-github-bootstrap-v1',
    requestBytes,
    timeoutMs: BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS
  });
  const envelope = validateTransportEnvelope(transportResult);
  if (envelope.exitCode !== 0) throw new Error(envelope.diagnosticCode);
  validateBootstrapActivationResponseFrame(envelope.responseBytes, {
    requestId: g3RequestId,
    activationId: g3Activation.activationId
  });
} finally {
  transport.close();
}
~~~

The remote Bootstrap handler validates the activation frame, decodes its owned exact operation-envelope bytes, creates the fixed no-argument readiness callback, and invokes only `createBootstrapRootLauncher(...).run(operationEnvelopeBytes, { onAuthorized })`; no Integration-owned launcher, command, path, unit, or mutation selector exists. Before any CAS or mutation, Bootstrap completes current-record, Gate, expiry, principal, and fence readback and writes its owner-internal canonical `{ type: 'bootstrap_activation_ready_v1', requestId, activationId }` frame. `requestBootstrap` consumes that ready frame internally and returns only the terminal response used above; Integration never constructs, receives, parses, retries, or treats ready as terminal. A ready write failure or disconnect before ready produces zero mutation. Once a valid ready has been consumed, a caller disconnect, timeout, or launcher crash converges only through the existing durable activation cleanup/recovery path. Wrong, duplicate, or cross-bound ready fails closed without refreshing any absolute deadline. A G2 `activationId`, response, receipt, materialization, transport capture, or approval binding is structurally ineligible for G3. Compatibility Artifact publication never calls any transport method.

Bootstrap alone fixes the activation operation maximum at 900,000 ms, the authenticated transport/relay deadline at 910,000 ms, `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` at 925,000 ms, and the activation protocol unit `RuntimeMaxSec=930`; Integration supplies only the imported 925,000-ms request-timeout constant and does not restate a numeric timeout in executable consumer code. A valid operation taking more than 10,000 ms and at most 900,000 ms must succeed. Compatibility inventory stays on its disjoint exact 10,000-ms single-response path and rejects any activation-ready frame.

The only accepted result shape is:

~~~js
{
  exitCode: 0,
  responseBytes,
  diagnosticCode: null
}
~~~

On the first protected operation of a transport lifecycle, the transport requires every Foundation native capability probe field to be true, locks the validated fixed credential ID, calls only that one `materializeFixedCredential` ID, and copies those returned bytes into its private sealed capture. Each operation receives only fresh owned clones; its own finally zeroes/closes them. A later operation using a different credential ID or the opposite bootstrap/deploy family rejects before a clone; deploy `execute`, `request`, and `requestStatusBundle` remain compatible within the one deploy lifecycle. The Bootstrap materializer internally resolves the sole armed, unexpired activation. An `activationId` inside canonical request bytes is evidence binding only and cannot select, override, or address protected material. A false/unknown probe yields a fixed safe diagnostic, performs zero materializer calls, and never reads or receives host, port, user, private-key, known-hosts, or activation selectors from the caller. `close` is idempotent, destroys the capture, and makes `execute`, `request`, `requestStatusBundle`, and `requestBootstrap` reject `transport_closed`.

Every single-response envelope is capped at 2048 bytes. Normal inventory accepts only `validateNormalInventoryResponseFrame` with its exact request ID, response type, source binding, and aggregate inventory record ID. Compatibility inventory accepts only `validateCompatibilityInventoryResponseFrame` with its exact request ID, response type, source/activation/content-receipt binding, and aggregate compatibility record ID. G3 accepts only `validateBootstrapActivationResponseFrame` with its newly approved activation binding and root-launcher result. All three cross-reject. Neither inventory accepts `status_response_v1`, the private sixteen-field deployment status, a terminal-bundle frame, an ACK, activation response, or recovery response. Final deployment status and recovery retain their separately branded ordinary-status and recovery validators. Nonzero exit yields only a fixed `diagnosticCode`; raw stderr is never returned.

scripts/control-plane-readonly-inventory.mjs accepts no argv. Its imported main({ stdout, stderr, native, clock, githubEvidence, secretMaterializer }) is dependency-injected in tests. The production entry point passes only the fixed credential ID, never reads raw transport variables, performs one materializeFixedCredential call followed by one normal-inventory request after capability proof, validates only the normal-inventory response, closes its transport in finally, emits exactly one canonical aggregate receipt line on stdout, and emits only a fixed safe code on stderr. Any argv exits 2 before capability probing or materialization.

scripts/control-plane-compatibility-readonly-inventory.mjs also accepts no argv or stdin. Its imported main receives the G2-only approved activation evidence through a closed workflow adapter, places its `activationId` and `hostBundleContentReceiptSha256` only in the canonical compatibility-inventory binding, performs one `materializeFixedCredential` call followed by exactly one `requestBootstrap` call with the fixed `japan-control-plane-github-bootstrap-v1` credential ID, validates only the compatibility-inventory response, and closes that separate transport in finally. The remote Bootstrap request parser passes only its exact decoded request to Host's branded `compatibilityInventoryReader.read(request)`; the normal route analogously uses only `normalInventoryReader.read(request)`. Both reader sets must first pass `assertControlPlaneHostInventoryReaders` and neither Integration CLI recreates or directly accesses their host evidence. The compatibility CLI emits only compatibility receipt bytes, cannot resolve or publish a normal Inventory Gate, and cannot emit or validate a G3 activation frame.

### Inventory publisher and workflow

scripts/control-plane-inventory-receipt-publisher.mjs exports two non-interchangeable entry points:

~~~js
export async function publishNormalInventoryReceipt({
  repository,
  receiptBytes,
  token,
  fetchFn,
  attestFn
}) {}

export async function publishCompatibilityInventoryReceipt({
  repository,
  receiptBytes,
  token,
  fetchFn,
  attestFn
}) {}
~~~

Each entry point validates only its own typed bytes and constructs one immutable attestationIdentity. The normal adapter fixes workflowPath to .github/workflows/japan-control-plane-readonly-inventory.yml; the compatibility adapter fixes it to .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml. Both derive workflowRef as gccwebos-com/proxy-gateway-minimal/{workflowPath}@refs/heads/master, require workflowSha and sourceCommit to equal the validated receipt sourceCommit, and fix predicateType to https://slsa.dev/provenance/v1. No caller may supply or override any identity field.

~~~js
const attestationIdentity = Object.freeze({
  workflowPath: fixedWorkflowPath,
  workflowRef: `gccwebos-com/proxy-gateway-minimal/${fixedWorkflowPath}@refs/heads/master`,
  workflowSha: receipt.sourceCommit,
  sourceCommit: receipt.sourceCommit,
  predicateType: 'https://slsa.dev/provenance/v1'
});
~~~

The object key order is exactly workflowPath, workflowRef, workflowSha, sourceCommit, predicateType. The adapter computes receiptSha256 and its disjoint Release/asset, passes the exact same attestationIdentity to the real inspectImmutableAssetAttestationPair and publishImmutableAssetAttestationPair implementations, then repeats real generic inspection with that identity for readback. Tests inject only the in-memory GitHub HTTP/attestation boundary; they do not mock, replace, or bypass either generic validator. Wrong source commit, workflow path/ref/SHA, predicate type, key order, asset subject, expected predicate binding, or attestation identity fails before publication; the write-call count remains zero. A generic mode or caller-supplied prefix is forbidden.

~~~js
{
  inventoryGateId,
  receiptSha256,
  releaseTag,
  assetName
}
~~~

.github/workflows/japan-control-plane-readonly-inventory.yml is manual-only and accepts exactly:

~~~yaml
on:
  workflow_dispatch:
    inputs:
      confirmation:
        description: Type the exact read-only inventory confirmation
        required: true
        type: string
~~~

The exact confirmation is inventory japan control-plane production. The workflow derives current protected master itself. It never accepts source, target, service, runtime, Release, path, host, or asset selectors.

.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml is separately manual-only and accepts exactly `compatibility_activation_id` plus confirmation `inventory japan control-plane compatibility`. The activation ID must have been created by a fresh provider-approved Bootstrap Gate for this read-only G2 attempt; it is not a deploy credential, never activates a bundle, and is never reusable as the G3 activation ID, approval binding, or material capture.

Jobs are capability-separated:

1. preflight has read-only GitHub metadata, no Environment, no secret, no OIDC, and verifies current master plus run_attempt == 1.
2. compatibility inventory uses only fresh G2 Bootstrap evidence plus `requestBootstrap` with the fixed `japan-control-plane-github-bootstrap-v1` credential ID and the compatibility-inventory codec; normal inventory uses `vultr-japan-production` only after G4 and `request` with the fixed `japan-control-plane-github-deploy-v1` credential ID and the normal codec. Each Bootstrap handler consumes the matching method from the one Host-branded inventory-reader provider. Neither job has repository write permission, and neither can reach the G3 activation codec or root launcher.
3. each isolated publisher uses artifact-publication, has no production Environment or production secret, revalidates its typed opaque bytes, and publishes only its own immutable receipt plus attestation.

### Source integration harness

scripts/control-plane-source-integration.mjs exports:

~~~js
export async function runControlPlaneSourceIntegration({
  sourceCommit,
  createHostHarness,
  githubEvidence,
  clock
}) {}

export function buildSourceValidationPacket({
  sourceCommit,
  scenarioResults,
  secretLikeMatches
}) {}

export function validateSourceValidationPacketBytes(bytes) {}
~~~

runControlPlaneSourceIntegration invokes runAllControlPlaneHostIntegrationScenarios with the frozen order:

1. successful_promotion
2. health_rejection_code_rollback
3. first_database_commit_second_database_failure
4. sqlite_commit_before_external_observation_crash
5. auxiliary_writer_attempt_during_backup
6. controller_connection_interruption
7. forced_process_and_boot_recovery

Each scenario uses a fresh temporary root, synthetic candidate and rollback trees, an atomic current symlink, two physically distinct SQLite fixtures, fake systemd, fake local/public health, synthetic GitHub evidence, a fault injector, and an in-memory immutable publisher. It verifies the final staged-bundle/host/receipt contract digests, proves typed inventory cross-rejection, assembles and verifies a candidate, materializes a synthetic plan, proves the installed bootstrap-operation digest and readback, traverses bootstrap/status protocol, validates the host terminal receipt, builds controller closeout, runs the final status-only validator, and exercises receipt recovery where the scenario requires it. It performs no network request and leaves no temporary root.

Bootstrap integration fixes the installed operation to /usr/local/libexec/proxy-gateway-control-plane-bootstrap-operation and the unit to proxy-gateway-control-bootstrap-activation.service. The root launcher must first CAS the verified envelope digest into the in_progress lease; the operation then accepts no argv or stdin and reads only that active lease plus immutable activation record. RuntimeMaxSec derives only from the already validated expiry, and fixed OnSuccess/OnFailure cleanup proves controller disconnect cannot strand a pipe-dependent rotation.

The CLI accepts zero arguments, resolves only the exact checkout HEAD through a fixed git rev-parse --verify HEAD invocation, runs the seven scenarios, and writes one line:

~~~json
{"schemaVersion":"1","type":"control_plane_source_validation_packet","sourceCommit":"1111111111111111111111111111111111111111","scenarioCount":7,"passedCount":7,"failedCount":0,"productionAuthority":false,"externalMutation":false,"secretLikeMatches":0,"accepted":true,"contractSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
~~~

contractSha256 is the digest of a static canonical integration-contract descriptor, not a self-hash of the packet. Any argv exits 2. Any failure emits one aggregate safe failure line and exits 1.

scripts/control-plane-source-integration.mjs is the only source-integration wrapper in the repository and package.json contains the name control-plane:source-integration exactly once. Adjacent plans contribute test lists and imported modules; they must not add a second package script, shell wrapper, direct same-name test command, or alternate orchestration entry point.

### Source validation workflow

.github/workflows/control-plane-source-integration.yml contains only pull_request and workflow_dispatch triggers, permissions contents: read, pinned checkout/setup-node, npm ci, and npm run control-plane:source-integration. The pull_request checkout is the exact PR head SHA, not GitHub's synthetic merge commit. It has no Environment, secret reference, id-token permission, SSH command, publisher, deployment, or external mutation.

The reviewed skeleton is:

~~~yaml
name: Control Plane Source Integration

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  source-integration:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: \${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - name: Run aggregate source integration
        shell: bash
        run: |
          set -euo pipefail
          npm run control-plane:source-integration | tee "$RUNNER_TEMP/control-plane-source-validation.json"
          test "$(wc -l < "$RUNNER_TEMP/control-plane-source-validation.json")" -eq 1
~~~

## Task 1: Freeze final installed contracts and the staged host bundle manifest

**Files:**

- Create: ops/control-plane-deploy/contracts/host-execution-contract.json
- Create: ops/control-plane-deploy/contracts/receipt-contract.json
- Create: ops/control-plane-deploy/contracts/staged-host-bundle-manifest.json
- Create: scripts/control-plane-staged-bundle-manifest.mjs
- Create: server/tests/control-plane-staged-bundle-manifest.test.mjs

**Interfaces:**

- Produce buildFinalControlPlaneContracts, validateHostExecutionContractBytes, validateReceiptContractBytes, and validateStagedHostBundleManifestBytes exactly as frozen above.
- Consume the Bootstrap-owned host layout and every final host-installed static source only after the exact provider chain through Bootstrap Task 11 is complete; do not edit those owners while computing digests. The layout must enumerate Host's installed `server/services/deployment/control-plane-host-inventory-readers.mjs` source. Host's external one-shot `server/services/deployment/control-plane-host-bundle-installer.mjs` is deliberately not a staged-host entry, because including the installer that consumes the finished manifest would create a self-reference. Runner-only workflow/controller sources integrated later are also not staged-host entries.
- Produce the exact manifest/content validator inputs consumed by the later Host Task 14A `createControlPlaneHostBundleInstaller(deps) -> { installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding }) }` checkpoint. That Host provider does not exist yet at this point in the DAG, so Task 1 must not import, test, stub, or create it. Task 4 performs the later cross-owner conformance check only after Host Task 14A is GREEN.
- Produce only deterministic tracked source contracts. Do not stage a host, install a file, publish a Release, or claim that the resulting content receipt exists in production.

- [ ] **Step 1: Write RED completeness and determinism tests**

~~~js
test('final contract builder fails until every declared static source exists', async () => {
  const harness = createFinalContractHarness({ omitLogicalId: 'closeout-finalizer-unit' });
  await assert.rejects(
    buildFinalControlPlaneContracts(harness),
    /staged_bundle_source_missing/
  );
});

test('final manifest binds actual sorted bytes and both contract digests', async () => {
  const result = await buildFinalControlPlaneContracts(createFinalContractHarness());
  assert.deepEqual(
    result.manifest.entries.map(({ logicalId }) => logicalId),
    [...result.manifest.entries.map(({ logicalId }) => logicalId)].sort()
  );
  assert.equal(result.manifest.hostExecutionContractSha256, result.hostExecution.sha256);
  assert.equal(result.manifest.receiptContractSha256, result.receiptContract.sha256);
});
~~~

Cover missing/extra source, including a missing Host inventory-reader logical ID; accidental inclusion of the external host-bundle installer; symlink; duplicate logical ID/destination; unsafe relative path; wrong owner/mode contract; zero bytes; mode drift; digest drift; source mutation between read and readback; unknown receipt schema/parser; mutable/immutable class mismatch; secret-like bytes; nondeterministic ordering; and a prefilled digest that does not match final bytes.

- [ ] **Step 2: Run RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-staged-bundle-manifest.test.mjs
~~~

Expected: module-not-found or missing-export failure. If any final static source named by the layout is still absent, stop and return to its owner checkpoint rather than weakening the manifest.

- [ ] **Step 3: Implement the zero-argument final builder**

Read the fixed tracked source set only after Receipt Tasks 5-8, Artifact Tasks 11-13, and Bootstrap Task 11 have completed the preceding static chain. Hash actual bytes, re-read for equality, serialize the two contracts, then serialize the staged bundle manifest last. The aggregate staged content digest uses a distinct domain and covers each logical ID, byte size, SHA-256, mode, destination ID, host-layout digest, host-execution digest, and receipt-contract digest.

- [ ] **Step 4: Run GREEN and readback**

~~~bash
node scripts/control-plane-staged-bundle-manifest.mjs
node --test --test-concurrency=1 server/tests/control-plane-staged-bundle-manifest.test.mjs
git diff --check -- ops/control-plane-deploy/contracts scripts/control-plane-staged-bundle-manifest.mjs server/tests/control-plane-staged-bundle-manifest.test.mjs
~~~

Expected: all three tracked JSON outputs validate against the same final source bytes; all tests pass with no skip.

- [ ] **Step 5: Commit one same-branch checkpoint**

~~~bash
git add ops/control-plane-deploy/contracts/host-execution-contract.json ops/control-plane-deploy/contracts/receipt-contract.json ops/control-plane-deploy/contracts/staged-host-bundle-manifest.json scripts/control-plane-staged-bundle-manifest.mjs server/tests/control-plane-staged-bundle-manifest.test.mjs
git commit -m "build: freeze control-plane staged bundle contracts"
~~~

No push, PR creation, readiness transition, merge, workflow dispatch, host staging, or external publication occurs at this checkpoint.

## Task 2: Build the non-interchangeable inventory receipts and resolvers

**Files:**

- Create: schemas/control-plane-required-check-contract-v1.schema.json
- Create: schemas/control-plane-inventory-receipt-v1.schema.json
- Create: schemas/control-plane-compatibility-inventory-receipt-v1.schema.json
- Create: server/services/deployment/control-plane-required-check-contract.mjs
- Create: server/services/deployment/control-plane-required-check-registry.mjs
- Create: server/services/deployment/control-plane-inventory-attestation-predicate.mjs
- Create: server/services/deployment/control-plane-inventory-receipt.mjs
- Create: server/services/deployment/control-plane-compatibility-inventory-receipt.mjs
- Create: server/services/deployment/control-plane-readonly-inventory.mjs
- Create: server/services/deployment/control-plane-compatibility-readonly-inventory.mjs
- Create: server/tests/control-plane-required-check-contract.test.mjs
- Create: server/tests/control-plane-required-check-registry.test.mjs
- Create: server/tests/control-plane-inventory-attestation-predicate.test.mjs
- Create: server/tests/control-plane-inventory-receipt.test.mjs
- Create: server/tests/control-plane-compatibility-inventory-receipt.test.mjs
- Create: server/tests/control-plane-readonly-inventory.test.mjs
- Create: server/tests/control-plane-compatibility-readonly-inventory.test.mjs

**Interfaces:**

- Produce the exact executable Foundation shapes for REQUIRED_CHECK_CONTRACT and REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts, canonicalizeRequiredCheckContracts, and validateRequiredCheckRunObservations from the dedicated provider frozen above; produce the separate sole-export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns })` owner whose private semantic/workflow registry returns that canonicalizer's exact eight-field result; produce the sole-export INVENTORY_ATTESTATION_PREDICATE_CONTRACT dependency leaf; and produce the normal ig1 resolver/receipt and compatibility cig1 resolver/receipt surfaces.
- Freeze stagedHostBundleManifestSha256 and stagedHostBundleContentReceiptSha256 as required 64-hex contract fields, but use only synthetic fixture digests in this task. Consume GitHub required-check evidence, rollback/runtime/writer shapes, canonicalizeDatabaseContracts, and the shared canonical codec; do not read or require Task 1 output.
- Both receipt creators call canonicalizeDatabaseContracts(input.databaseContracts) once and canonicalizeRequiredCheckContracts(input.requiredCheckContracts) once, attach only each provider's canonical value and digest where frozen, and retain each provider's bytes. Their schemas reference the Host-owned database schema root and this task's required-check schema, define no database or required-check item properties locally, and their validators independently call the same helpers. Live inventory preflight and Artifact release/plan consumers import `resolveControlPlaneRequiredCheckContracts` plus the contract provider, consume its one returned identity array/bytes/digest byte-for-byte, and never declare a second semantic registry, context switch, identity array, serializer, or canonicalizer.
- The next scheduled checkpoint is Artifact Tasks 1-2. Artifact Tasks 3-8 consume these typed resolvers later, after Host/Bootstrap providers are present; actual Task 1 digests are first consumed when Task 3/Task 4 fixtures and later external receipts are materialized. Those values do not change this schema or resolver surface.
- Normal requires final bootstrap/authorization/rotation closure; compatibility structurally forbids those fields. Cross-type resolution is always an error.

- [ ] **Step 1: Write failing schema, ID, expiry, and redaction tests**

Cover both canonical successes; exact ig1/cig1 grammars; disjoint Release/asset derivation; body exclusion of external IDs; createdAt plus exactly two hours; expiry at equality; wrong source/target/type; normal resolver with compatibility bytes and the reverse; unknown fields; duplicate keys; non-canonical bytes; Host-fixture faults swapped, unknown_logical_id, duplicate_physical_hmac, extra_field, wrong_configured_source, third_entry, and lossy_projection; helper sha mismatch; helper byte mismatch across inventory/release/plan; any local database item schema/contract/order list or JSON.stringify equality; missing writer binding; compatibility missing staged content; compatibility containing any final bootstrap/rotation field; normal missing final bootstrap/cleanup/rotation closure; unsafe string; raw path; endpoint-like string; oversized bytes; missing/duplicate Release asset; digest mismatch; attestation mismatch; exact executable required-check item/root contract shapes; missing or unknown fields at both root and item depth; deep key permutations producing identical Foundation bytes; sparse arrays; fewer than two and more than 64 items; missing validate or codeql role; duplicate or omitted ruleset context; nullable/zero/negative/guessed integrationId; wrong appSlug/integrationId/sourceKind; non-null inapplicable workflow field; runtime checkRunId/headSha/status/conclusion/detailsUrl embedded in an identity; duplicate runtime check-run IDs; tuple drift between identity and observation; required-check success for the wrong source SHA; the registry module's sole export and non-exported fixed semantic/workflow mapping; missing/extra/duplicate registry/live contexts; ambiguous App/check-run identity; workflow/ref/head drift; non-successful live run; exact resolver return identity with the canonicalizer result; any second registry/context switch/identity-array builder; the predicate contract's exact schemaId/maxBytes/fieldOrder and empty nested/arrays; each valid normal/compatibility workflow mapping; workflowSha/sourceCommit mismatch; cross-type workflow; wrong repository/runtime/digests; unknown predicate field; oversized canonical predicate; and a consumer-side copied predicate contract.

~~~js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInventoryGateId,
  parseInventoryGateId,
  resolveInventoryReceipt
} from '../../server/services/deployment/control-plane-inventory-receipt.mjs';
import {
  REQUIRED_CHECK_CONTRACT,
  REQUIRED_CHECK_ARRAY_CONTRACT,
  validateRequiredCheckContracts,
  canonicalizeRequiredCheckContracts,
  validateRequiredCheckRunObservations
} from '../../server/services/deployment/control-plane-required-check-contract.mjs';
import { resolveControlPlaneRequiredCheckContracts } from '../../server/services/deployment/control-plane-required-check-registry.mjs';
import {
  createControlPlaneReadonlyInventory,
  validateControlPlaneInventoryReceiptBytes
} from '../../server/services/deployment/control-plane-readonly-inventory.mjs';
import { serializeCanonicalJsonBytes } from '../../server/services/deployment/canonical-json.mjs';
import { canonicalizeDatabaseContracts } from '../../server/services/deployment/database-contract.mjs';

test('required-check identity and runtime observation stay distinct', () => {
  assert.deepEqual(Object.keys(REQUIRED_CHECK_CONTRACT), [
    'schemaId', 'maxBytes', 'fieldOrder', 'nested', 'arrays', 'validate'
  ]);
  assert.deepEqual(Object.keys(REQUIRED_CHECK_ARRAY_CONTRACT), [
    'schemaId', 'maxBytes', 'fieldOrder', 'nested', 'arrays', 'validate'
  ]);
  assert.deepEqual(REQUIRED_CHECK_CONTRACT.fieldOrder, [
    'semanticRole', 'context', 'appSlug', 'integrationId',
    'sourceKind', 'workflowPath', 'workflowRef', 'workflowSha'
  ]);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_CONTRACT.fieldOrder), true);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_CONTRACT.nested), true);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_CONTRACT.arrays), true);
  assert.deepEqual(REQUIRED_CHECK_ARRAY_CONTRACT.fieldOrder, ['requiredCheckContracts']);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_ARRAY_CONTRACT.fieldOrder), true);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_ARRAY_CONTRACT.nested), true);
  assert.equal(Object.isFrozen(REQUIRED_CHECK_ARRAY_CONTRACT.arrays), true);
  assert.equal(REQUIRED_CHECK_ARRAY_CONTRACT.nested['required-check-v1'], REQUIRED_CHECK_CONTRACT);
  assert.equal(REQUIRED_CHECK_ARRAY_CONTRACT.arrays.requiredCheckContracts, 'required-check-v1');
  assert.deepEqual(Object.keys(REQUIRED_CHECK_ARRAY_CONTRACT.nested), ['required-check-v1']);
  assert.deepEqual(Object.keys(REQUIRED_CHECK_ARRAY_CONTRACT.arrays), ['requiredCheckContracts']);
  const canonical = canonicalizeRequiredCheckContracts(requiredCheckContractsFixture());
  assert.deepEqual(validateRequiredCheckContracts(canonical.requiredCheckContracts), canonical.requiredCheckContracts);
  assert.equal(Object.isFrozen(canonical.requiredCheckContracts), true);
  assert.equal(canonical.bytes.equals(canonicalizeRequiredCheckContracts(structuredClone(canonical.requiredCheckContracts)).bytes), true);
  assert.doesNotThrow(() => validateRequiredCheckRunObservations(requiredCheckRunObservationsFixture(), {
    sourceCommit: '1'.repeat(40),
    requiredCheckContracts: canonical.requiredCheckContracts
  }));
  assert.throws(() => validateRequiredCheckContracts(canonical.requiredCheckContracts.map((item, index) => (
    index === 0 ? { ...item, status: 'completed' } : item
  ))), /control-plane-required-check-v1_fields_invalid/);
});

test('required-check Foundation contracts reject missing and unknown fields and canonicalize deep permutations', () => {
  const value = requiredCheckContractsFixture();
  const permuted = value.map((item) => ({
    workflowSha: item.workflowSha,
    workflowRef: item.workflowRef,
    workflowPath: item.workflowPath,
    sourceKind: item.sourceKind,
    integrationId: item.integrationId,
    appSlug: item.appSlug,
    context: item.context,
    semanticRole: item.semanticRole
  })).reverse();
  assert.equal(
    canonicalizeRequiredCheckContracts(value).bytes.equals(canonicalizeRequiredCheckContracts(permuted).bytes),
    true
  );

  const missing = structuredClone(value);
  delete missing[0].workflowSha;
  assert.throws(() => canonicalizeRequiredCheckContracts(missing), /control-plane-required-check-v1_fields_invalid/);
  const unknown = structuredClone(value);
  unknown[0].runtimeStatus = 'completed';
  assert.throws(() => canonicalizeRequiredCheckContracts(unknown), /control-plane-required-check-v1_fields_invalid/);
  assert.throws(
    () => serializeCanonicalJsonBytes({}, REQUIRED_CHECK_ARRAY_CONTRACT),
    /control-plane-required-check-array-v1_fields_invalid/
  );
  assert.throws(
    () => serializeCanonicalJsonBytes({ requiredCheckContracts: value, extra: true }, REQUIRED_CHECK_ARRAY_CONTRACT),
    /control-plane-required-check-array-v1_fields_invalid/
  );
  assert.throws(
    () => REQUIRED_CHECK_ARRAY_CONTRACT.validate({ requiredCheckContracts: value.slice(0, 1) }),
    /required_check_array_length_invalid/
  );
  assert.throws(
    () => REQUIRED_CHECK_ARRAY_CONTRACT.validate({ requiredCheckContracts: new Array(65).fill(value[0]) }),
    /required_check_array_length_invalid/
  );
});

test('sole semantic/workflow registry resolves one canonical eight-field identity array', () => {
  const live = requiredCheckLiveEvidenceFixture({ sourceCommit: '1'.repeat(40) });
  const resolved = resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: live.rulesetRequirements,
    checkRuns: live.checkRuns
  });
  const canonical = canonicalizeRequiredCheckContracts(resolved.requiredCheckContracts);
  assert.deepEqual(Object.keys(resolved), ['requiredCheckContracts', 'bytes', 'sha256']);
  assert.equal(resolved.bytes.equals(canonical.bytes), true);
  assert.equal(resolved.sha256, canonical.sha256);
  assert.deepEqual(resolved.requiredCheckContracts.map(Object.keys), [
    [...REQUIRED_CHECK_CONTRACT.fieldOrder],
    [...REQUIRED_CHECK_CONTRACT.fieldOrder]
  ]);
  assert.throws(() => resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: [...live.rulesetRequirements, { ...live.rulesetRequirements[0] }],
    checkRuns: live.checkRuns
  }), /required_check_registry_live_evidence_invalid/);
});

test('inventory receipt expires at createdAt plus exactly two hours', async () => {
  const bytes = await createControlPlaneReadonlyInventory(validInventoryHarness({
    now: '2026-08-08T12:00:00.000Z'
  }));
  const receipt = validateControlPlaneInventoryReceiptBytes(bytes, {
    sourceCommit: '1'.repeat(40),
    now: new Date('2026-08-08T13:59:59.999Z')
  });
  assert.equal(receipt.expiresAt, '2026-08-08T14:00:00.000Z');
  assert.throws(() => validateControlPlaneInventoryReceiptBytes(bytes, {
    sourceCommit: '1'.repeat(40),
    now: new Date('2026-08-08T14:00:00.000Z')
  }), /inventory_expired/);
});

test('inventory gate id is external and content addressed', () => {
  const id = createInventoryGateId({
    sourceCommit: '1'.repeat(40),
    runtimeContractId: 'node22-linux-x64-glibc',
    receiptSha256: 'a'.repeat(64)
  });
  assert.equal(
    id,
    'ig1.' + '1'.repeat(40) + '.node22-linux-x64-glibc.' + 'a'.repeat(64)
  );
  assert.deepEqual(parseInventoryGateId(id), {
    sourceCommit: '1'.repeat(40),
    runtimeContractId: 'node22-linux-x64-glibc',
    receiptSha256: 'a'.repeat(64)
  });
});

test('typed inventory preserves the complete normalized database pair', async () => {
  const databaseContracts = databaseContractsFixture();
  const expected = canonicalizeDatabaseContracts(databaseContracts);
  const bytes = await createControlPlaneReadonlyInventory(validInventoryHarness({ databaseContracts }));
  const receipt = validateControlPlaneInventoryReceiptBytes(bytes, {
    sourceCommit: '1'.repeat(40),
    now: new Date('2026-08-08T13:00:00.000Z')
  });
  const observed = canonicalizeDatabaseContracts(receipt.databaseContracts);
  assert.deepEqual(receipt.databaseContracts, expected.databaseContracts);
  assert.equal(receipt.databaseContractsSha256, expected.sha256);
  assert.equal(observed.sha256, expected.sha256);
  assert.equal(observed.bytes.equals(expected.bytes), true);

  for (const fault of [
    'swapped',
    'unknown_logical_id',
    'duplicate_physical_hmac',
    'extra_field',
    'wrong_configured_source',
    'third_entry',
    'lossy_projection'
  ]) {
    await assert.rejects(
      createControlPlaneReadonlyInventory(validInventoryHarness({
        databaseContracts: databaseContractsFixture({ fault })
      })),
      /database_contract_/
    );
  }
});
~~~

- [ ] **Step 2: Run the focused tests and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
~~~

Expected: module-not-found or missing-export failures only.

- [ ] **Step 3: Implement the JSON schema and closed validators**

Use the shared canonical module and import serializeCanonicalJsonBytes/sha256Hex rather than implementing any JSON writer, field walker, deep sorter, or digest primitive; import only canonicalizeDatabaseContracts rather than redeclaring any database key, item contract, order, or invariant. Implement the executable required-check item/root contracts, the one sole-export semantic/workflow resolver with its one private frozen registry, and the inventory-attestation predicate dependency leaf once in this task; both inventory schemas reference the required-check root and never repeat its item keys, and Artifact imports these owner modules. The resolver must return `canonicalizeRequiredCheckContracts(...)` unchanged after it derives all eight fields from its private mapping plus closed live evidence; never export the private registry or accept a caller-provided semantic role/workflow mapping. Keep additionalProperties false for inventory-owned objects. Enforce safe release labels, safe runtimeContractId, fixed target/service/repository/release unit, aggregate booleans, safe digest-only bindings, exhaustive live-readback requiredCheckContracts, and explicit normal/compatibility discriminants. Never hard-code a production integrationId/App identity, accept a caller-selected receipt mode, mix runtime observations into identities, copy the predicate contract, call JSON.stringify, serialize a bare required-check array, or serialize a reduced databases view.

In both inventory schemas, the two database properties are exactly:

~~~json
{
  "databaseContracts": { "$ref": "./control-plane-database-contract-v1.schema.json" },
  "databaseContractsSha256": { "$ref": "#/$defs/sha256" }
}
~~~

Do not add properties/items beneath databaseContracts in either inventory schema.

The required-check property in both inventory schemas is exactly a reference to schemas/control-plane-required-check-contract-v1.schema.json. Implement canonicalizeRequiredCheckContracts with the fixed sort followed by the exact Foundation call `serializeCanonicalJsonBytes({ requiredCheckContracts: sorted }, REQUIRED_CHECK_ARRAY_CONTRACT)` and the frozen domain-separated digest; implement validateRequiredCheckContracts by exact canonicalizer reuse and validateRequiredCheckRunObservations as a separate runtime-only comparison path. `resolveControlPlaneRequiredCheckContracts` is the only owner allowed to join the private semantic/workflow registry with live ruleset/check-run evidence. No Artifact, workflow, receipt, or Task 9 code may locally recreate REQUIRED_CHECK_CONTRACT, REQUIRED_CHECK_ARRAY_CONTRACT, a semantic registry, identity-array mapping, or any serializer.

- [ ] **Step 4: Implement immutable resolution**

Derive API paths from the fixed repository and parsed ID, reject redirects outside api.github.com, require an immutable matching Release/asset/attestation tuple, bound response bytes, compare digest before parsing, and validate source plus expiry with the injected clock.

- [ ] **Step 5: Re-run the focused tests and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
~~~

Expected: all inventory contract tests pass with no skip.

- [ ] **Step 6: Commit the inventory contract**

~~~bash
git add schemas/control-plane-required-check-contract-v1.schema.json schemas/control-plane-inventory-receipt-v1.schema.json schemas/control-plane-compatibility-inventory-receipt-v1.schema.json server/services/deployment/control-plane-required-check-contract.mjs server/services/deployment/control-plane-required-check-registry.mjs server/services/deployment/control-plane-inventory-attestation-predicate.mjs server/services/deployment/control-plane-inventory-receipt.mjs server/services/deployment/control-plane-compatibility-inventory-receipt.mjs server/services/deployment/control-plane-readonly-inventory.mjs server/services/deployment/control-plane-compatibility-readonly-inventory.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
git commit -m "feat: add typed control-plane inventory contracts"
~~~

No push, PR creation, merge, workflow dispatch, inventory request, or publication occurs at this checkpoint. Continue only with Artifact Tasks 1-2; do not jump from this ownership label to Integration Task 1 or Task 3.

## Task 3: Add typed inventory-only CLIs, isolated publishers, and workflows

**Files:**

- Create: scripts/control-plane-readonly-inventory.mjs
- Create: scripts/control-plane-compatibility-readonly-inventory.mjs
- Create: scripts/control-plane-inventory-receipt-publisher.mjs
- Create: .github/workflows/japan-control-plane-readonly-inventory.yml
- Create: .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml
- Create: server/tests/control-plane-inventory-receipt-publisher.test.mjs
- Create: server/tests/control-plane-readonly-inventory-workflow.test.mjs
- Create: server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
- Modify: server/tests/control-plane-readonly-inventory.test.mjs
- Modify: server/tests/control-plane-compatibility-readonly-inventory.test.mjs
- Verify only: server/services/deployment/control-plane-host-inventory-readers.mjs
- Verify only: server/tests/control-plane-host-inventory-readers.test.mjs

**Interfaces:**

- Entry gate: Integration Task 1 and Host/DB Task 14A are GREEN and committed. Task 14A has consumed the final manifest validator and implemented/tested the sole G1a installer source without invoking it; Task 3 may now compose inventory workflows but must not call the installer.
- Normal CLI uses only `request` with credentialId `japan-control-plane-github-deploy-v1` after G4 and the Bootstrap-owned `encodeNormalInventoryRequestFrame`/`validateNormalInventoryResponseFrame` pair; compatibility CLI uses only `requestBootstrap` with credentialId `japan-control-plane-github-bootstrap-v1` before G4 and the disjoint `encodeCompatibilityInventoryRequestFrame`/`validateCompatibilityInventoryResponseFrame` pair. The compatibility `activationId` and `hostBundleContentReceiptSha256` are encoded only as canonical read-only evidence and are absent from transport/materializer selectors. Neither CLI imports `encodeBootstrapActivationRequestFrame`, `validateBootstrapActivationResponseFrame`, `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, or any root-launcher surface, and compatibility remains single-response with no `bootstrap_activation_ready_v1` frame.
- Both consume Bootstrap-owned full capability probing followed by one lazy secretMaterializer.materializeFixedCredential(credentialId), an internal sealed capture, one per-request clone, and idempotent close. Neither inventory path imports or accepts encodeStatusRequestFrame, validateStatusResponseFrame, status_response_v1, the private sixteen-field deployment status, the Receipt ACK ABI, or a recovery codec.
- Each inventory CLI creates a fresh exact-five-method `{ execute, request, requestStatusBundle, requestBootstrap, close }` transport, makes exactly one method-specific request, and calls `transport.close()` in its outermost finally. Normal and compatibility workflows never share a transport lifecycle, sealed capture, materializer result, or G2 activation evidence; no inventory invokes `execute` or `requestStatusBundle`.
- The remote request handler consumes Host's real branded provider only through `assertControlPlaneHostInventoryReaders(createControlPlaneHostInventoryReaders(deps))`. It calls exactly `normalInventoryReader.read(decodedNormalRequest)` or `compatibilityInventoryReader.read(decodedCompatibilityRequest)` and passes the returned owner value to the matching Bootstrap encoder. Integration never constructs a reader member, evidence bytes, host selector, path, resource ID, or mutation method.
- Produce two manual workflows and two fixed publisher entry points. Each publisher constructs the exact workflowPath/workflowRef/workflowSha/sourceCommit/predicateType attestationIdentity in that key order and passes it to the real generic inspect/publish validators; compatibility Artifact publication consumes only the compatibility Gate and performs no SSH.

- [ ] **Step 1: Write failing CLI and transport-boundary tests**

Test zero argv, argv rejection before capability probe/materialization, exact transport keys `execute,request,requestStatusBundle,requestBootstrap,close`, full-probe-before-materialize ordering, zero materializer calls on one false/unknown capability, normal fixed deploy credentialId/request plus normal-inventory codec, compatibility fixed bootstrap credentialId/requestBootstrap plus compatibility-inventory codec, G2 activation/content-receipt evidence only inside canonical compatibility bytes, exactly one materializeFixedCredential call, one fixed-ID-locked sealed capture, bootstrap/deploy family switching rejected before clone, exactly one owned request clone, clone zeroization/close, exactly one inventory frame, outer-finally idempotent transport.close, transport_closed rejection for all four operation methods, exact 10000 ms timeout, 2048-byte response cap, exact request ID and source/activation/content-receipt binding, real branded Host provider and matching sole `read` call, copied/spread reader-provider rejection, cross-inventory codec rejection, bootstrap-activation codec/response and `bootstrap_activation_ready_v1` rejection with root-launcher call count zero, status_response_v1 rejection, Receipt ACK/recovery response rejection, fixed diagnostics, no caller-provided host/port/user/key/known-hosts/material selector, no execute_auth, no status_closeout_ack, no recovery mutation, no terminal-bundle session, no artifact stream, one-line stdout, and no sensitive data in stdout/stderr.

~~~js
test('read-only inventory sends one normal-inventory request and no mutation frame', async () => {
  const calls = [];
  const result = await main({
    argv: [],
    native: createSyntheticNativeTransport({ calls, allCapabilities: true }),
    secretMaterializer: createLazySyntheticMaterializer({ calls }),
    clock: fixedClock('2026-08-08T12:00:00.000Z'),
    githubEvidence: validSyntheticGithubEvidence(),
    stdout: capture(),
    stderr: capture()
  });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.slice(0, 3).map(({ operation }) => operation), [
    'probe_all_capabilities',
    'materialize_fixed_credential:japan-control-plane-github-deploy-v1',
    'request_normal_inventory'
  ]);
  assert.equal(calls.at(-1).timeoutMs, 10_000);
  assert.equal(calls.some(({ requestType }) => requestType === 'execute_auth'), false);
  assert.equal(calls.some(({ requestType }) => requestType === 'status_closeout_ack'), false);
  assert.equal(calls.some(({ operation }) => operation === 'request_status_bundle'), false);
  assert.equal(calls.some(({ requestType }) => requestType === 'bootstrap_activate'), false);
});
~~~

- [ ] **Step 2: Write failing publisher and workflow contract tests**

Assert each workflow is manual-only with its own exact confirmation/type; fixed concurrency with cancellation disabled; run_attempt one; no caller-selected source/target/service/path; preflight before materialization; preflight reads protected-master ruleset/check evidence only through Task 2 `resolveControlPlaneRequiredCheckContracts` and byte-compares its returned canonical bytes/digest; normal uses request/fixed deploy credential plus only the normal-inventory codec; compatibility uses requestBootstrap/fixed bootstrap credential plus only the compatibility-inventory codec while G2 activation/content-receipt fields remain canonical read-only evidence; both server paths use the exact Host-branded reader provider; G3 activation codec/root launcher imports are absent; inventory jobs have no repository write; publishers have no production Environment or production secret; each typed publisher derives attestationIdentity in exact workflowPath/workflowRef/workflowSha/sourceCommit/predicateType key order, passes the byte-equal object to real generic inspect/publish implementations, and makes zero write calls on any identity or expected predicate-binding mismatch; tests inject only an in-memory GitHub HTTP/attestation boundary and never mock the generic validator or Host provider; normal/compatibility IDs and assets cross-reject; compatibility Artifact publication has no SSH; actions are pinned; and no execute/ACK/mutation, terminal-bundle, or raw output upload exists.

~~~js
import {
  publishCompatibilityInventoryReceipt,
  publishNormalInventoryReceipt
} from '../../scripts/control-plane-inventory-receipt-publisher.mjs';

test('inventory workflow separates protected status from isolated publication', () => {
  const workflow = readWorkflow('.github/workflows/japan-control-plane-readonly-inventory.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ['confirmation']);
  assert.equal(workflow.concurrency.group, 'japan-control-plane-production-authority');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.inventory.environment, 'vultr-japan-production');
  assert.equal(workflow.jobs.publish.environment, 'artifact-publication');
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /JAPAN_CONTROL_DEPLOY_/);
  assert.doesNotMatch(JSON.stringify(workflow), /execute_auth|status_closeout_ack/);
});

for (const [type, publishReceipt, workflowPath] of [
  ['normal', publishNormalInventoryReceipt, '.github/workflows/japan-control-plane-readonly-inventory.yml'],
  ['compatibility', publishCompatibilityInventoryReceipt, '.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml']
]) {
  test(`${type} publisher forwards one exact attestation identity`, async () => {
    const harness = createRealGenericImmutablePublisherHarness();
    await publishReceipt(validPublisherInput({ type, harness }));
    const expected = {
      workflowPath,
      workflowRef: `gccwebos-com/proxy-gateway-minimal/${workflowPath}@refs/heads/master`,
      workflowSha: '1'.repeat(40),
      sourceCommit: '1'.repeat(40),
      predicateType: 'https://slsa.dev/provenance/v1'
    };
    assert.deepEqual(harness.calls.map(({ operation }) => operation), ['inspect', 'publish', 'inspect']);
    assert.deepEqual(harness.calls.map(({ attestationIdentity }) => attestationIdentity), [expected, expected, expected]);
  });
}

test('real generic attestation validation rejects identity drift before writes', async () => {
  const harness = createRealGenericImmutablePublisherHarness({ inspectionIdentityMismatch: true });
  await assert.rejects(
    publishNormalInventoryReceipt(validPublisherInput({ type: 'normal', harness })),
    /inventory_attestation_identity_invalid/
  );
  assert.equal(harness.realGenericInspectionCount, 1);
  assert.equal(harness.publishCallCount, 0);
});
~~~

- [ ] **Step 3: Run the focused tests and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
~~~

Expected: missing CLI, publisher, and workflow failures.

- [ ] **Step 4: Implement the zero-argument CLI**

Consume `createSecureSshTransport` and only the method-specific Bootstrap inventory protocol pair defined above. Assert the returned object has exactly `{ execute, request, requestStatusBundle, requestBootstrap, close }` in that frozen order. Each CLI creates its own transport, passes only the method-specific fixed credentialId plus canonical inventory request bytes and timeout, performs one materialization and one request, validates the matching inventory response, and calls transport.close() in finally. An approved G2 `activationId` may exist only within validated compatibility requestBytes; the shared sealed-capture/materializeFixedCredential boundary owns all protected tuple access, per-request cloning, zeroization, and cleanup. The Bootstrap server handler must assert and call the exact Host-owned reader provider; do not alias either inventory response to ordinary deployment status, activation status, or a terminal-bundle frame.

- [ ] **Step 5: Implement isolated immutable publication**

Use the shared immutable publisher; do not duplicate GitHub Release conflict/retry logic. For each typed receipt, construct the fixed attestationIdentity in exact workflowPath/workflowRef/workflowSha/sourceCommit/predicateType order, pass it unchanged to the real generic inspect and publish implementations together with the exact expected predicate binding, and publish only canonical receipt bytes plus that attestation. Return only safe IDs and digests; identity or predicate mismatch performs zero writes.

- [ ] **Step 6: Implement the two manual typed read-only workflows**

Pin checkout, setup-node, upload-artifact, download-artifact, and attestation actions to reviewed full commit SHAs. Set workflow-level permissions to empty and job-level minimum permissions. Ensure no job combines production secrets with contents write, pull-request write, or attestation write.

- [ ] **Step 7: Re-run the focused tests and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
~~~

Expected: all tests pass; no workflow is dispatched.

- [ ] **Step 8: Commit the source-only inventory workflow**

~~~bash
git add scripts/control-plane-readonly-inventory.mjs scripts/control-plane-compatibility-readonly-inventory.mjs scripts/control-plane-inventory-receipt-publisher.mjs .github/workflows/japan-control-plane-readonly-inventory.yml .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
git commit -m "feat: add typed read-only inventory workflows"
~~~

No push, PR creation, merge, workflow dispatch, secret materialization, SSH, Release publication, or host action occurs at this checkpoint. The next implementation checkpoint is Host/DB Task 14B; Integration Task 4 must not begin directly from Task 3.

## Task 4: Compose the seven-scenario source integration harness

**Files:**

- Create: scripts/control-plane-source-integration.mjs
- Create: server/tests/control-plane-source-integration.test.mjs
- Modify: package.json

**Interfaces:**

- Entry gate: Host/DB Task 14B is GREEN and committed on the same branch after Integration Task 3; the earlier Host Task 14A installer checkpoint is also present. This task consumes both checkpoints and does not modify or duplicate Host installer, runbook, broker, transaction, recovery, or harness ownership.
- Produce the sole scripts/control-plane-source-integration.mjs wrapper and the sole package.json control-plane:source-integration key.
- Consume Task 1 final contract bytes, Host's sole bundle installer conformance surface, both typed inventory validators, Host's branded inventory-reader provider, the Task 2 required-check contract plus sole semantic/workflow resolver, canonicalizeDatabaseContracts, every owner module, and the frozen seven-scenario Host/DB harness.
- Produce only the aggregate source validation packet; no network, publisher, transport materializer, Environment, or external mutation is reachable.

- [ ] **Step 1: Write failing composition tests**

Test the frozen scenario order; one fresh harness per scenario; the completed Host Task 14A installer and Task 14B stop-before checkpoints; final staged-host/host-execution/receipt-contract byte identity; real Host bundle-installer acceptance of the exact Task 1 manifest/content inputs in a synthetic root with no second stager; normal/compatibility receipt and codec cross-rejection through the real branded Host inventory-reader provider; exact artifact/plan/bootstrap/host receipt/controller closeout chain; accepted-to-bounded-poll-to-owner-read-terminal-bundle-to-Receipt-validateTerminal-to-terminal-only-closeout ordering; the unchanged privately branded sixteen-field ordinary terminal status with exact deploymentPlanSha256 and no planSha256 alias; Bootstrap-owned terminal-bundle constants 768 raw bytes, 262144 total bytes, 342 chunks, and 2048 response-envelope bytes; no copied terminal-bundle chunk loop/codec/parser; no-claim zero terminal-bundle read and zero host mutation as validation only; Receipt-owned final-status validation; original controller closeout artifact name, one-file archive, and explicit 35-day retention; the sole Task 2 semantic/workflow resolver's eight-field requiredCheckContracts canonical result consumed byte-for-byte by inventory/artifact/deploy plus a separate runtime-observation validator proving exact context/integrationId/appSlug/headSha success without status fields entering the identity; independent canonicalizeDatabaseContracts results byte-equal with identical sha256 across typed inventory, release declaration, and deployment plan, with every frozen Host-fixture fault cross-rejected and no local database contract/order/JSON.stringify path; bootstrap-operation installed digest/readback, active-lease plus immutable-record consumption, and fixed activation unit; successful, stopped, schema-committed, rolled-back, and critical terminal handling; the fixed automatic critical-finalizer boot/path recovery chain, followed by Host's real post-publication proof and Bootstrap's downstream ordinary-status brand without a new manual Gate; one deploy-credential production-controller transport lifecycle with exact keys `execute,request,requestStatusBundle,requestBootstrap,close` spanning execute, status polling, one terminal-bundle stream, closeout, and final readback with one sealed capture, per-operation clones, and outer-finally close; ACK validation followed by a distinct ordinary committed-status request whose validator alone returns responseSha256; one deploy-credential recovery transport lifecycle whose exact sequence is challenge request/validation -> OIDC-bound recovered selector request/validation -> `createPostRecoveryStatusRequest` -> one through seven ordinary `.request` polls with fresh request IDs at fixed 5000 ms intervals and one absolute 30000 ms deadline -> exactly one `readTerminalBundleBytes` call whose sole `requestStatusBundle` session consumes one through 342 frames -> Receipt validation, with critical terminality withheld until the real post-finalizer proof; deadline/pending/rejected recovery performs zero bundle/publication call; 1-, 768-, 769-, and 262144-byte bundle success plus 0-, 262145-byte, 343rd-frame, early/late-EOF, digest/selector drift rejection; normal ACK-loss still sends no recovery ACK; separately closed single-materialization/single-request normal and compatibility inventory transports using their distinct Bootstrap-owned pre-Gate codecs and Host readers; G2 compatibility `requestBootstrap` with fixed `japan-control-plane-github-bootstrap-v1` and read-only evidence only; synthetic G3 activation uses a new bootstrap transport plus `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame` and the fixed root launcher, passes only `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, succeeds for a valid operation taking more than 10,000 ms and at most 900,000 ms, and never receives/parses the internal ready frame; wrong, duplicate, or cross-bound ready fails closed without extending a deadline; it rejects ready write/disconnect before mutation, proves post-ready disconnect/timeout/crash convergence through durable activation cleanup/recovery, and never sends a compatibility-inventory frame or reuses G2 evidence; full-probe/materializeFixedCredential ordering with no caller-owned raw tuple or activation material selector; no network calls; no external mutation; temporary-root cleanup; secret-pattern scan; deterministic contract digest; one-line packet; wrong source; unknown field; failed count; duplicate package script; alternate wrapper; and argv rejection.

~~~js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runControlPlaneSourceIntegration,
  validateSourceValidationPacketBytes
} from '../../scripts/control-plane-source-integration.mjs';
import { canonicalizeDatabaseContracts } from '../../server/services/deployment/database-contract.mjs';

test('inventory release and plan bind independent Host-canonical database bytes', () => {
  const fixture = databaseContractsFixture();
  const inventory = canonicalizeDatabaseContracts(structuredClone(fixture));
  const release = canonicalizeDatabaseContracts(structuredClone(fixture));
  const plan = canonicalizeDatabaseContracts(structuredClone(fixture));
  assert.equal(inventory.bytes.equals(release.bytes), true);
  assert.equal(inventory.bytes.equals(plan.bytes), true);
  assert.equal(inventory.sha256, release.sha256);
  assert.equal(inventory.sha256, plan.sha256);
});

test('source integration composes all seven scenarios without authority', async () => {
  const output = await runControlPlaneSourceIntegration({
    sourceCommit: '1'.repeat(40),
    createHostHarness: createSyntheticHostHarness,
    githubEvidence: createSyntheticGithubEvidence(),
    clock: fixedClock('2026-08-08T12:00:00.000Z')
  });
  const packet = validateSourceValidationPacketBytes(output);
  assert.deepEqual({
    scenarioCount: packet.scenarioCount,
    passedCount: packet.passedCount,
    failedCount: packet.failedCount,
    productionAuthority: packet.productionAuthority,
    externalMutation: packet.externalMutation,
    secretLikeMatches: packet.secretLikeMatches,
    accepted: packet.accepted
  }, {
    scenarioCount: 7,
    passedCount: 7,
    failedCount: 0,
    productionAuthority: false,
    externalMutation: false,
    secretLikeMatches: 0,
    accepted: true
  });
});
~~~

- [ ] **Step 2: Run the focused test and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-source-integration.test.mjs
~~~

Expected: missing module or exports.

- [ ] **Step 3: Implement the imported orchestration path**

Import every contract from its owning plan. Do not duplicate validators or use subprocess calls for JavaScript modules. Recovery must consume Bootstrap's recovery selector brand only through `createPostRecoveryStatusRequest`, accept terminal-bundle access only from the separately validated ordinary-status brand, keep one fixed monotonic deadline across at most seven polls, and let only `readTerminalBundleBytes` call `requestStatusBundle` once. G2 and G3 must use separate transports, activation evidence, codecs, and outcomes. Fail on any scenario skip, warning, unclosed handle, leftover file, nonterminal receipt, unsafe output, nondeterministic ordering, rejected recovery classification, local brand conversion, second required-check registry, copied Host reader/installer, or post-finalizer proof bypass.

- [ ] **Step 4: Implement the zero-argument CLI**

Use execFile with shell false for git rev-parse --verify HEAD. Reject dirty source only if the exact integration contract requires committed bytes; tests inject the source resolver. Emit one canonical line and set exit status without stack traces or raw errors.

- [ ] **Step 5: Add the package script**

Add exactly:

~~~json
"control-plane:source-integration": "node scripts/control-plane-source-integration.mjs"
~~~

Do not add a package dependency.

- [ ] **Step 6: Re-run the focused test and CLI and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-source-integration.test.mjs
npm run control-plane:source-integration
~~~

Expected: seven of seven accepted, one safe JSON line, exit zero.

- [ ] **Step 7: Commit the integration harness**

~~~bash
git add scripts/control-plane-source-integration.mjs server/tests/control-plane-source-integration.test.mjs package.json
git commit -m "test: compose control-plane source integration"
~~~

No push, PR creation, merge, workflow dispatch, publisher, SSH, materializer, or production action occurs at this checkpoint.

## Task 5: Add the no-production-secret GitHub source workflow

**Files:**

- Create: .github/workflows/control-plane-source-integration.yml
- Create: server/tests/control-plane-source-integration-workflow.test.mjs

**Interfaces:**

- Consume only the unique Task 4 package wrapper and exact checkout HEAD.
- Produce a source-only packet exercise with contents read and no Environment, secret, OIDC, transport, publisher, deployment, or production concurrency.
- The workflow is test evidence, never an Inventory Gate, Artifact Gate, Production Gate, or deployment input.

- [ ] **Step 1: Write the failing workflow contract test**

Assert triggers are exactly pull_request and workflow_dispatch; permissions are exactly contents read; checkout uses exact PR head and persist-credentials false; actions use full SHAs; Node 22 satisfies package engines; command is npm run control-plane:source-integration; packet is exactly one line; and the workflow contains no Environment, concurrency authority key, secret reference, reserved variable name, id-token, SSH, SCP, rsync, curl, provider, production endpoint, Release API, contents write, pull-request write, attestation write, deploy command, or workflow dispatch.

~~~js
test('source integration workflow has no production capability', () => {
  const text = readText('.github/workflows/control-plane-source-integration.yml');
  for (const forbidden of [
    'environment:',
    'secrets.',
    'id-token:',
    'JAPAN_CONTROL_DEPLOY_',
    'japan-control-plane-production-authority',
    'ssh ',
    'scp ',
    'rsync ',
    'contents: write',
    'attestations: write',
    'deploy japan control-plane production'
  ]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.match(text, /npm run control-plane:source-integration/);
});
~~~

- [ ] **Step 2: Run the workflow test and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-source-integration-workflow.test.mjs
~~~

Expected: missing workflow failure.

- [ ] **Step 3: Implement the pinned source workflow**

Use the reviewed YAML skeleton from Interfaces. Keep all output within the safe aggregate packet. Do not upload it to a Release or grant artifact/publication authority.

- [ ] **Step 4: Re-run the workflow and integration tests and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-source-integration-workflow.test.mjs server/tests/control-plane-source-integration.test.mjs
~~~

Expected: all pass without reading environment secrets.

- [ ] **Step 5: Commit the source validation workflow**

~~~bash
git add .github/workflows/control-plane-source-integration.yml server/tests/control-plane-source-integration-workflow.test.mjs
git commit -m "ci: add control-plane source integration gate"
~~~

No push, PR creation, merge, manual dispatch, artifact upload, publisher, or external action occurs at this checkpoint.

## Task 6: Validate the Artifact-owned controller composition without changing owner files

**Files:**

- Verify only: server/services/deployment/control-plane-production-controller.mjs
- Verify only: scripts/control-plane-production-controller.mjs
- Verify only: scripts/control-plane-deploy-note.mjs
- Verify only: .github/workflows/japan-control-plane-production-deploy.yml
- Verify only: .github/workflows/control-plane-compatibility-artifact-gate.yml
- Verify only: server/tests/control-plane-production-controller.test.mjs
- Verify only: server/tests/control-plane-production-controller-cli.test.mjs
- Verify only: server/tests/control-plane-production-deploy-workflow.test.mjs
- Verify only: server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs
- Verify only: server/tests/control-plane-deploy-note.test.mjs
- Verify only: server/tests/control-plane-controller-output-deploy-note.integration.test.mjs
- Create/Modify: none

**Interfaces:**

- Entry gate: Artifact Task 10 and Tasks 11-12 are GREEN and committed after Receipt and Bootstrap owner providers. Task 10 owns only the compatibility Artifact Gate workflow in this file list. Tasks 11-12 solely own typed production inputs, accepted-to-bounded-poll controller composition, terminal-bundle consumption, closeout/final-status wiring, the production workflow, the bounded-PR-comment Deploy Note path, the eight-result integration test, and all controller wiring listed above.
- Consume the Artifact-owned controller, workflow, and Deploy Note bytes as immutable cross-owner inputs. This task does not edit, stage, recommit, refactor, wire, wrap, or restate their poll limits, delay policy, terminal classifier, typed input parser, finalStatusSink, CLI, terminal-bundle composition, closeout adapter composition, workflow shell, or bounded merged-PR comment renderer. In particular, all controller wiring remains in Artifact Tasks 11-12; Integration produces no adapter, branch, sink, workflow step, PR writer, or empty checkpoint commit.
- Validate that artifact_accepted_v1 is admission only; the privately branded sixteen-field ordinary status retains deploymentPlanSha256; Bootstrap readTerminalBundleBytes remains the only bundle assembler with 768-byte raw chunks, 262144 bytes maximum, at most 342 chunks, a 2048-byte response-envelope cap, and timeoutMs 30_000; Receipt ACK validation is independent from the later ordinary committed-status request/response ABI; and the Receipt-built final status reaches the Artifact sink byte-for-byte.
- Validate no-claim behavior only: createNoClaimEvidence bytes stay exact, validatedFinalHostStatus and Actions observation are null, terminal-bundle read and host mutation counts stay zero, and Deploy Note comment publication is a no-op. Validate terminal results write at most one bounded comment to the single merged source PR and never update its body. Integration adds no no-claim writer, comment writer, or controller branch.
- If any assertion fails, stop and return the defect to the exact owning Artifact, Receipt, or Bootstrap task for a real corrective commit. Integration Task 6 never patches around an owner defect and never creates an empty commit.

- [ ] **Step 1: Verify the owner RED-to-GREEN evidence before testing**

Confirm Artifact Tasks 11-12 recorded their failing tests before implementation, including acceptance-versus-terminal ordering, typed production inputs, the real eight-result controller/bounded-comment matrix, 768/342 terminal-bundle boundaries, complete transportResult validation, ACK-versus-independent-status separation, no-claim zero mutation, exact sink bytes, single merged-PR resolution, bounded comment fields, and PR-body immutability. Missing owner RED evidence is RED and returns to Artifact Tasks 11-12; do not manufacture a new failing Integration change.

- [ ] **Step 2: Capture the clean no-change boundary**

~~~powershell
$integrationValidationHead = (git rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $integrationValidationHead -notmatch '^[0-9a-f]{40}$') { throw 'integration_validation_head_invalid' }
$artifactOwnedPaths = @(
  'server/services/deployment/control-plane-production-controller.mjs',
  'scripts/control-plane-production-controller.mjs',
  'scripts/control-plane-deploy-note.mjs',
  '.github/workflows/japan-control-plane-production-deploy.yml',
  '.github/workflows/control-plane-compatibility-artifact-gate.yml',
  'server/tests/control-plane-production-controller.test.mjs',
  'server/tests/control-plane-production-controller-cli.test.mjs',
  'server/tests/control-plane-production-deploy-workflow.test.mjs',
  'server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs',
  'server/tests/control-plane-deploy-note.test.mjs',
  'server/tests/control-plane-controller-output-deploy-note.integration.test.mjs'
)
git diff --exit-code -- @artifactOwnedPaths
if ($LASTEXITCODE -ne 0) { throw 'artifact_owner_paths_dirty_before_integration_validation' }
~~~

- [ ] **Step 3: Run the real owner and cross-owner matrix and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs server/tests/control-plane-controller-closeout.test.mjs server/tests/control-plane-controller-closeout-adapter.test.mjs server/tests/control-plane-host-protocol.test.mjs server/tests/control-plane-transport-contract.test.mjs
~~~

Expected: all real owner modules and validators run; no Bootstrap reader, Receipt validator, Artifact classifier/sink, generic validator, or Deploy Note validator/writer is mocked. All five terminal and three no-claim outcomes pass, ACK cannot satisfy committed status, a multi-chunk fixture proves 768-byte/342-chunk bounds through the opaque Bootstrap reader, terminal results produce only the one bounded merged-PR comment contract, no-claim/nonterminal produces no comment, the PR body is never edited, and no workflow is dispatched.

- [ ] **Step 4: Prove no owner file changed and make no commit**

~~~powershell
if ((git rev-parse --verify HEAD).Trim() -cne $integrationValidationHead) { throw 'unexpected_integration_validation_commit' }
git diff --exit-code -- @artifactOwnedPaths
if ($LASTEXITCODE -ne 0) { throw 'artifact_owner_paths_changed_by_integration' }
~~~

Success is a no-change GREEN checkpoint recorded only in the aggregate validation evidence. There is no git add or git commit in this task. No push, PR transition, merge, workflow dispatch, closeout upload, SSH, materialization, Deploy Note, GitHub setting, host action, or production action occurs.

## Task 7: Update the runbook and release semantics

**Files:**

- Modify: docs/GITHUB_DEPLOYMENT_RUNBOOK.md
- Modify: RELEASE_MANIFEST.md
- Create: server/tests/control-plane-deployment-documentation.test.mjs

**Interfaces:**

- Consume typed inventory, staged bundle, controller closeout, final status, and G1-G9 semantics from Tasks 1-6 and owner plans.
- Produce source-authority prose only; preserve existing runbook heading order and Artifact Manifest v1.
- Do not claim current GitHub settings, staged bytes, credentials, inventory, artifacts, host state, backup, schema, deployment, or closeout.

- [ ] **Step 1: Write failing documentation contract tests**

Assert the runbook names every new workflow and its authority; describes one source-only Draft PR whose body contains only `Production status: not_deployed`; states manual Deploy plus automated deployment/validation/code rollback/cleanup; includes the G1-G9 handoff; names Host's sole G1a bundle installer and sole branded inventory-reader provider; distinguishes G2 compatibility inventory from G3 bootstrap activation with separate evidence/codecs/transports; states that Bootstrap privately consumes the activation-ready frame and Integration supplies only `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` before seeing the terminal response, with pre-ready zero mutation and post-ready durable cleanup/recovery; records the exact five-method transport and recovery challenge -> selector -> one-through-seven ordinary polls -> one terminal-bundle session sequence; preserves the existing identity and health headings in order; labels receipt recovery exceptional; identifies the critical finalizer as the automatic boot/path recovery chain rather than a new manual Gate; requires a fresh Risk A Gate only for later critical-fence clearing/manual repair; limits the one real Deploy Note to an Artifact-owned bounded merged-PR comment after G9 without PR-body mutation; and states that no source approval is production approval. Assert RELEASE_MANIFEST.md preserves Artifact Manifest v1 and not_deployed, describes durable companions outside artifact.json, and does not claim a real Release or production configuration exists.

~~~js
test('deployment runbook preserves authority and rollout boundaries', () => {
  const runbook = readText('docs/GITHUB_DEPLOYMENT_RUNBOOK.md');
  const identity = runbook.indexOf('### Protected Release Config Identity Gate');
  const health = runbook.indexOf('### Condition-Driven Promotion Health Window');
  assert.ok(identity >= 0);
  assert.ok(health > identity);
  assert.match(runbook, /one source-only Draft PR/i);
  assert.match(runbook, /operator manually.*Deploy/i);
  assert.match(runbook, /automatic code rollback/i);
  assert.match(runbook, /G1[\s\S]*G9/);
  assert.match(runbook, /createControlPlaneHostBundleInstaller/);
  assert.match(runbook, /G2[\s\S]*compatibility inventory[\s\S]*G3[\s\S]*bootstrap activation/i);
  assert.match(runbook, /BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS/);
  assert.match(runbook, /activation.ready[\s\S]*internal[\s\S]*terminal/i);
  assert.match(runbook, /pre.ready[\s\S]*zero mutation[\s\S]*post.ready[\s\S]*cleanup\/recovery/i);
  assert.match(runbook, /Production status:\s*not_deployed/);
  assert.match(runbook, /bounded[\s-]*PR comment/i);
  assert.doesNotMatch(runbook, /Deploy Note[\s\S]{0,80}(?:updates?|edits?|rewrites?)[\s\S]{0,40}(?:PR )?body/i);
  assert.match(runbook, /source approval.*not.*production approval/i);
});
~~~

- [ ] **Step 2: Run the documentation test and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-deployment-documentation.test.mjs
~~~

Expected: missing new authority/rollout sections.

- [ ] **Step 3: Extend the runbook without replacing existing content**

Add these exact sections:

1. GitHub-Controlled Japan Control-Plane Source Status
2. Workflow Authority Matrix
3. Source-Only Draft PR Validation
4. Post-Merge G1-G9 Operator Handoff
5. Failure, Recovery, and Approval Reuse Stops
6. Real Deploy Note Evidence Boundary

The workflow matrix distinguishes release-artifact, production-deploy-dry-run, control-plane-source-integration, compatibility and normal read-only inventory, both Artifact Gates, production deploy, and receipt recovery. It records the staged-bundle/host-execution/receipt contracts; Host's sole `createControlPlaneHostBundleInstaller(...).installAndReadBack(...)` G1a path and sole branded `createControlPlaneHostInventoryReaders` provider; cig1 versus ig1 rejection; fixed bootstrap credential `requestBootstrap` before G4 versus fixed deploy credential `request` after G4; the exact transport surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`; G2 compatibility-inventory codec/read-only evidence versus G3 activation codec/fixed root launcher with newly armed, non-reusable evidence; Bootstrap's owner-internal activation-ready frame, caller-visible terminal-only response, imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, pre-ready zero-mutation boundary, and post-ready durable cleanup/recovery; original controller closeout artifact's exact name grammar, single-file archive, explicit 35-day retention; recovery's challenge/selector, one through seven fresh ordinary-status polls at fixed five-second intervals under one absolute 30-second deadline, and one authenticated terminal-bundle stream; automatic critical finalizer boot/path recovery and later Host post-finalizer proof; and the no-claim/no-comment boundary without claiming current repository settings or host state.

The source PR section uses exactly `Production status: not_deployed` and contains no Deploy Note. The G9 section says Artifact Tasks 11-12 own the only real Deploy Note path: after a validated terminal final status, an isolated job may write at most one bounded comment to the single merged source PR; it never edits the PR title/body. Nonterminal and no-claim outcomes make zero comment write. A critical terminal finalizer is part of the automatic boot/path recovery chain and introduces no new manual click inside G9; only a subsequent attempt to clear the retained critical fence or perform manual repair requires a separately approved Risk A Gate.

The runbook also records the host/database facts supplied by the transaction plan: exactly two distinct persistent database bindings with no production fallback; candidate-start as the sole production application start path; the canonical writer registry and lease/guard boundary; coherent pair backup and durability readback; the four per-database terminal results; the five host terminal states; code rollback without automatic database restore; a separate database-recovery Gate for any restore; and exact candidate/rollback persisted-data compatibility. It must not claim a current production schema, installed contract, compatible rollback release, or successful backup without a fresh receipt.

- [ ] **Step 4: Extend RELEASE_MANIFEST.md narrowly**

State that portable artifact.json is unchanged Artifact Manifest v1. List the final staged-host bundle manifest, host-execution contract, receipt contract, typed compatibility/normal inventory receipts, release declaration, writer registry, bootstrap receipt, Production Gate receipt, checksum, and provenance as immutable deployment companions. State that no companion currently proves production deployment and production_state remains not_deployed until a verified terminal run.

- [ ] **Step 5: Re-run the documentation test and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-deployment-documentation.test.mjs
~~~

Expected: all documentation invariants pass.

- [ ] **Step 6: Commit runbook and release semantics**

~~~bash
git add docs/GITHUB_DEPLOYMENT_RUNBOOK.md RELEASE_MANIFEST.md server/tests/control-plane-deployment-documentation.test.mjs
git commit -m "docs: document control-plane deployment authority"
~~~

No push, PR creation, merge, workflow dispatch, settings change, provider/host access, or production record occurs at this checkpoint.

## Task 8: Update validation and documentation indexes

**Files:**

- Modify: docs/VALIDATION_BASELINE.md
- Modify: docs/README.md
- Modify: schemas/README.md
- Modify: server/tests/control-plane-deployment-documentation.test.mjs

**Interfaces:**

- Consume the final file/schema/test inventory from every owner checkpoint and Tasks 1-7.
- Produce exact validation commands and authority indexes only; no generated project-state or production-state file is modified.
- Index normal and compatibility inventory as distinct schemas/workflows and index final staged-host/host-execution/receipt contracts as source-only tracked contracts.

- [ ] **Step 1: Extend the failing documentation tests**

Require the validation baseline to separate networkless unit tests, synthetic seven-scenario integration, actual disposable-Linux feasibility, no-secret PR workflow, exact-head GitHub checks, and external production Gates. Require docs/README.md to index the approved design, all six plan files, and the runbook. Require schemas/README.md to index every new control-plane schema exactly once with its authority and mutability boundary.

The schema index entries are:

- control-plane-inventory-receipt-v1.schema.json: immutable, aggregate-safe, two-hour normal inventory contract requiring final bootstrap/rotation closure; no execution authority.
- control-plane-compatibility-inventory-receipt-v1.schema.json: immutable, aggregate-safe, two-hour compatibility inventory contract binding staged content/rollback/runtime/writer plus Host-schema-referenced databaseContracts and its helper-produced digest, while structurally excluding final bootstrap/rotation fields; no execution authority and no copied database item schema.
- control-plane-required-check-contract-v1.schema.json: immutable exact eight-field required-check identity shared by both inventory receipts; runtime check-run status is a separate non-receipt observation and integrationId must be positive live readback.
- control-plane-database-contract-v1.schema.json: immutable two-logical-database deployment contract.
- control-plane-persisted-data-contract-v1.schema.json: immutable candidate/rollback persisted-data compatibility pair.
- control-plane-writer-registry-v1.schema.json: immutable canonical writer discovery and binding contract.
- control-plane-host-terminal-receipt-v1.schema.json: immutable initial terminal receipt and initial artifact state.
- control-plane-host-terminal-record-v1.schema.json: immutable replay and digest binding.
- control-plane-host-closeout-record-v1.schema.json: separate monotonic CAS and disposition record; the only schema permitted to reach upload_committed_observed.
- control-plane-controller-closeout-v1.schema.json: immutable Actions payload; upload never rewrites it.
- control-plane-receipt-recovery-challenge-v1.schema.json: volatile challenge with a maximum sixty-second lifetime.
- control-plane-recovered-closeout-v1.schema.json: immutable recovered closeout eligible for fixed publication only after validation.
- control-plane-recovery-attempt-no-claim-v1.schema.json: attempt-scoped diagnostic with no publication or Deploy Note authority.

Present-retention evidence validates only created_at, expires_at, and digest from the retained artifact; it does not read or infer the repository Administration retention setting.

- [ ] **Step 2: Run the focused test and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-deployment-documentation.test.mjs
~~~

- [ ] **Step 3: Add the exact validation baseline**

Document these commands and their meaning:

~~~bash
npm run control-plane:native:build
npm run control-plane:native:test
npm run control-plane:foundation:linux
npm run test:control-plane-bootstrap-linux
node scripts/control-plane-host-integration.mjs
npm run control-plane:source-integration
npm test
npm pack --dry-run
npm run docs:authority:check
npm run project-state:check
git diff --check origin/master...HEAD
~~~

State that native and clean-Linux checks must run on target-matching disposable Linux; npm test alone is not systemd, cgroup, sealed-memory, OFD, or reboot evidence. State that project-state:check validates unchanged source authority during this PR and does not authorize editing project-state files.

- [ ] **Step 4: Update indexes**

Add one compact row per design/plan/runbook/schema. Mark every plan as source implementation guidance, every production Gate as separately approved, and the source PR as not deployed.

- [ ] **Step 5: Re-run documentation tests and authority checks and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-deployment-documentation.test.mjs
npm run docs:authority:check
npm run project-state:check
~~~

Expected: all pass and project-state files remain unchanged.

- [ ] **Step 6: Commit validation and indexes**

~~~bash
git add docs/VALIDATION_BASELINE.md docs/README.md schemas/README.md server/tests/control-plane-deployment-documentation.test.mjs
git commit -m "docs: index control-plane source validation"
~~~

No push, PR creation, merge, workflow dispatch, state reconciliation, or external action occurs at this checkpoint.

## Task 9: Resolve the Issue, open one Draft PR, and hand off exact-head evidence

**Files:**

- Verify every file owned by all six plans.
- Do not create a validation-result file in the repository.
- Do not modify production state documents.

**Interfaces:**

- Consume every same-branch checkpoint from Tasks 1-8 and all owner-plan focused commands.
- Require the graph's exact provider/consumer handoffs to be complete: Host Task 11A's broker plus inventory-reader provider checkpoint precedes its Bootstrap consumer; Integration Task 1 precedes Host Task 14A; Host Task 14A precedes Integration Task 3; and Host Task 14B follows Integration Task 3 but precedes every Integration Task 4-9 checkpoint. Do not accept a numerically sorted task history as equivalent.
- Produce exactly one pushed branch and exactly one Draft PR after exact Issue resolution and local body construction; later fixes update that same PR. Keep it Draft throughout this task.
- Bind the first push, one gh pr create call, PR head/body byte readback, and current-ruleset required check name/App/head/conclusion evidence to one recorded branch and 40-character head. A failure never creates a replacement PR.
- This task has no source commit of its own unless validation/review exposes a real source defect. A no-change validation pass is the intended boundary. Ready transition and merge are forbidden here and belong only to the master implementation program's final owner.

- [ ] **Step 1: Verify the prerequisite and focused suites**

Run every focused command from the six plans. Then run this slice:

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-staged-bundle-manifest.test.mjs server/tests/control-plane-host-bundle-installer.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs server/tests/control-plane-source-integration.test.mjs server/tests/control-plane-source-integration-workflow.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs server/tests/control-plane-deployment-documentation.test.mjs
~~~

Expected: all pass, no skip.

- [ ] **Step 2: Run target-matching native and clean Linux validation**

~~~bash
npm run control-plane:native:build
npm run control-plane:native:test
npm run control-plane:foundation:linux
npm run test:control-plane-bootstrap-linux
node scripts/control-plane-host-integration.mjs
npm run control-plane:source-integration
~~~

Expected: actual target capabilities pass; bootstrap clean-Linux scenarios pass; host packet reports seven passed and zero failed; source packet reports seven passed, zero failed, no production authority, no external mutation, and zero secret-like matches.

- [ ] **Step 3: Run full repository and packaging validation**

~~~bash
npm test
npm pack --dry-run
npm run docs:authority:check
npm run project-state:check
git diff --check origin/master...HEAD
git diff --name-only origin/master...HEAD
~~~

Inspect the final name list. It must not include docs/CURRENT_RELEASE_STATE.md, docs/PROJECT_CONTEXT.md, or any project-state path.

- [ ] **Step 4: Prove exact-head ephemeral packaging and no-write publication contracts**

Run the artifact plan's exact-head ephemeral packaging, offline native build, immutable-publication conflict/readback, and attestation contract tests with synthetic GitHub fixtures. Confirm they make no repository or Release write. Do not invoke control-plane-artifact-gate.yml or any publisher against GitHub.

- [ ] **Step 5: Resolve the exact Issue, branch, head, and complete body before any push**

Run Steps 5-7 in one PowerShell session. Resolve exactly one open GitHub Issue titled Implement GitHub-controlled Japan control-plane production deployment. If the branch/head is invalid, zero or multiple Issues match, or truthful supporting-agent metadata is unavailable, stop with the branch local and unpushed. The inline path below records Supporting agents as None; a subagent-driven execution must replace only $supportingAgentsLine with exact observed agent/task identifiers before constructing the file. Supporting workstreams are scope labels and never imply agent usage.

~~~powershell
$repository = 'gccwebos-com/proxy-gateway-minimal'
$prTitle = 'feat: add GitHub-controlled Japan control-plane deployment source'
$exactBranch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $exactBranch -notmatch '^codex/[a-z0-9](?:[a-z0-9._-]{0,118}[a-z0-9])?$') { throw 'exact_branch_invalid' }
$exactHead = (git rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $exactHead -notmatch '^[0-9a-f]{40}$') { throw 'exact_head_invalid' }

$issueRows = @(gh issue list --repo $repository --state open --limit 100 --json number,title | ConvertFrom-Json | Where-Object { $_.title -ceq 'Implement GitHub-controlled Japan control-plane production deployment' })
if ($LASTEXITCODE -ne 0 -or $issueRows.Count -ne 1) { throw 'exact_risk_a_issue_not_unique' }
$issueNumber = [string]$issueRows[0].number
if ($issueNumber -notmatch '^[1-9][0-9]*$') { throw 'issue_number_invalid' }

$supportingAgentsLine = '- Supporting agents: None (inline execution)'
$bodyText = (@'
## Summary

Implements the approved GitHub-controlled Japan control-plane deployment source contracts, closed host/database transaction, bootstrap and recovery boundaries, immutable artifact/Gate workflows, protected read-only inventory, aggregate source integration, and operator documentation.

This is one source-only Draft PR. It does not configure GitHub, publish a production Release, access a host, change a database, or deploy production.

## Issue / Index Card

- Issue: Refs #{0}
- Issue role: A-tier implementation index card
- Close behavior: refs only

## Agent / Task Routing

- Lead workstream: source integration controller
- Supporting workstreams: foundation/native feasibility; artifact/workflow; bootstrap/authorization; host/database; receipt/recovery; rollout/documentation
{1}
- Primary unit: control-plane-app
- Related PRs: None; all source slices are in this PR
- Handoff target: post-merge Risk A operator gate owner

## Risk

- Risk: A
- Process: approved design, source-only TDD implementation, clean validation, exact-head checks, independent semantic and security review, then separate external Risk A Gates
- Expected PR count: 1 source implementation PR
- Production/AWS/Aliyun impact: None; Production status: not_deployed
- Runtime/node/DNS/traffic impact: None in this PR
- Auth/schema/migration impact: Source contracts and synthetic additive-migration tests only; no production authorization, schema change, migration, or database access
- Secrets or customer-data handling: None; tests use synthetic aggregate-safe fixtures
- Approval status: design approved; source review pending; no external production Gate approved

## Identity Impact

- identity_impact: false
- identity_gate: Not applicable

## Execution

- Added foundation, final staged-bundle/installed contracts, artifact, bootstrap, host transaction, receipt recovery, typed compatibility/normal inventory, and source-integration contracts.
- Completed the approved one-branch provider/consumer DAG, including Host Task 11A's broker plus branded inventory-reader handoff, Integration Task 1 -> Host Task 14A -> Integration Task 3, and Host Task 14B before aggregate source integration.
- Added source-only GitHub workflow definitions without dispatching them.
- Updated runbook, release companion semantics, validation baseline, and documentation indexes.
- Did not modify current production state or project-state records.

## Production Status

- Production status: not_deployed
- release_unit: control-plane-app
- This source-only PR records status only; verified production evidence remains a separate post-merge handoff and never rewrites this body.

## Remaining Gates

- G1: Host-owned createControlPlaneHostBundleInstaller installAndReadBack for static content plus artifact-publication protection readback
- G2: fresh typed compatibility inventory through the Host-branded read-only provider and conditional no-SSH compatibility artifact publication; no activation request
- G3: separately approved compatibility activation through a new requestBootstrap transport using the Bootstrap owner request-timeout constant, owner-internal activation-ready handling with a terminal-only caller response, the Bootstrap activation codec, fixed root launcher, fresh non-G2 activation evidence, backup, and healthy exact rollback release
- G4: credential and authorization bootstrap with verified cleanup and rotation_closed
- G5: fresh protected normal inventory requiring final bootstrap and rotation_closed
- G6: normal Artifact Gate and immutable Production Gate receipt
- G7: operator review and manual dispatch of the exact ID plus confirmation
- G8: distinct reviewer approval of the exact production job
- G9: GitHub deployment, validation, code rollback when required, automatic critical finalizer boot/path recovery when needed, cleanup, terminal receipt, final read-only validation, and at most one truthful bounded Deploy Note PR comment
'@ -f $issueNumber, $supportingAgentsLine).Replace("`r`n", "`n").TrimEnd([char[]]"`r`n")

$taskTempRoot = Join-Path ([IO.Path]::GetTempPath()) ('control-plane-source-pr-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($taskTempRoot) | Out-Null
$bodyPath = Join-Path $taskTempRoot 'draft-pr-body.md'
$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($bodyPath, $bodyText, $utf8NoBom)

function Get-ExactSha256([byte[]]$bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
$expectedBodyBytes = [IO.File]::ReadAllBytes($bodyPath)
$expectedBodySha256 = Get-ExactSha256 $expectedBodyBytes
if ($expectedBodySha256 -notmatch '^[0-9a-f]{64}$') { throw 'body_sha256_invalid' }
foreach ($requiredLiteral in @('Risk: A', 'Expected PR count: 1 source implementation PR', 'Production status: not_deployed', 'identity_impact: false', 'release_unit: control-plane-app', 'This source-only PR records status only', 'Supporting workstreams:', 'Supporting agents:', 'G1:', 'G9:')) {
  if (-not $bodyText.Contains($requiredLiteral)) { throw 'draft_body_contract_invalid' }
}
~~~

- [ ] **Step 6: Push once, open one Draft PR once, and verify the no-secret packet**

Re-read the branch, head, and temporary body bytes before the first push. Push only that branch with --set-upstream, require the remote ref to equal the recorded head, and create the Draft with exactly one gh pr create --draft --body-file call. On a retry, reuse the single existing open Draft; a closed PR, non-Draft PR, duplicate, body drift, or head drift is a stop and never creates a second PR.

~~~powershell
if ((git branch --show-current).Trim() -cne $exactBranch) { throw 'branch_drift_before_push' }
if ((git rev-parse --verify HEAD).Trim() -cne $exactHead) { throw 'head_drift_before_push' }
$currentBodyBytes = [IO.File]::ReadAllBytes($bodyPath)
if ((Get-ExactSha256 $currentBodyBytes) -cne $expectedBodySha256) { throw 'body_drift_before_push' }

$existing = @(gh pr list --repo $repository --state all --head $exactBranch --limit 10 --json number,state,isDraft,headRefName,headRefOid,url | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $existing.Count -gt 1) { throw 'branch_pr_identity_ambiguous' }
if ($existing.Count -eq 1 -and ($existing[0].state -cne 'OPEN' -or $existing[0].isDraft -ne $true)) { throw 'existing_pr_not_reusable_no_second_pr' }

git push --set-upstream origin $exactBranch
if ($LASTEXITCODE -ne 0) { throw 'exact_branch_push_failed' }
$remoteRows = @(git ls-remote --heads origin ('refs/heads/' + $exactBranch))
if ($LASTEXITCODE -ne 0 -or $remoteRows.Count -ne 1) { throw 'remote_branch_readback_invalid' }
$remoteHead = ($remoteRows[0] -split '\s+')[0]
if ($remoteHead -cne $exactHead) { throw 'remote_head_mismatch' }

if ($existing.Count -eq 0) {
  $prUrl = (gh pr create --repo $repository --base master --head $exactBranch --title $prTitle --draft --body-file $bodyPath).Trim()
  if ($LASTEXITCODE -ne 0 -or $prUrl -notmatch '^https://github\.com/gccwebos-com/proxy-gateway-minimal/pull/[1-9][0-9]*$') { throw 'draft_pr_create_failed' }
} else {
  $prUrl = [string]$existing[0].url
}

$pr = gh pr view $prUrl --repo $repository --json number,state,isDraft,headRefName,headRefOid,body,url | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $pr.state -cne 'OPEN' -or $pr.isDraft -ne $true) { throw 'draft_pr_readback_invalid' }
if ($pr.headRefName -cne $exactBranch -or $pr.headRefOid -cne $exactHead -or $pr.url -cne $prUrl) { throw 'draft_pr_head_mismatch' }
$observedBodyBytes = $utf8NoBom.GetBytes([string]$pr.body)
$observedBodySha256 = Get-ExactSha256 $observedBodyBytes
if ($observedBodySha256 -cne $expectedBodySha256 -or -not [Linq.Enumerable]::SequenceEqual[byte]($expectedBodyBytes, $observedBodyBytes)) { throw 'draft_pr_body_readback_mismatch' }
$prNumber = [string]$pr.number
~~~

Allow only the pull_request-triggered Control Plane Source Integration workflow to run. Do not manually dispatch any workflow. Verify its packet contains productionAuthority false, externalMutation false, secretLikeMatches zero, and accepted true. If any command after PR creation fails, retain that one Draft and push a real corrective commit to the same branch; never call gh pr create again.

- [ ] **Step 7: Bind exact-head CI and CodeQL**

Wait for the one Draft's checks, then use closed, bounded pagination to read every active ruleset, every rule evaluated for protected master, and every exact-head check run. Cap each collection at twenty 100-row pages; a full final page, pagination loop, duplicate ruleset/check-run ID, unstable total_count, missing page termination, or a second-snapshot difference is RED rather than partial success. Every required rule must carry a positive integration_id. Match it to exactly one run whose context, positive app.id, app.slug, head SHA, status, and conclusion agree; nullable integration identity and a typed or guessed production App ID are forbidden.

Task 9 keeps two structures separate. Pass the closed stable `rulesetRequirements`, full exact-head `checkRuns`, and `exactHead` only to Task 2's sole `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns })`; use its returned canonical eight-field requiredCheckContracts identity array/bytes/digest unchanged. The PowerShell readback below produces only runtime observations with checkRunId/context/integrationId/appSlug/headSha/status/conclusion/detailsUrl. Pass those observations plus the owner-returned identities to validateRequiredCheckRunObservations and require the owner bytes/digest to be byte-identical to both inventory preflight and Artifact preflight. Never serialize runtime status into the identity, replace the identity with a five-field observed row, or map contexts/semantic roles/workflow paths in PowerShell or Artifact. The typed identities must retain validate and codeql roles, and the separately required Control Plane Source Integration workflow observation must bind the exact head and live App identity through the same Task 2 resolver. Absence, ambiguity, tuple drift, a second registry/array/canonicalizer, or provider disagreement is RED.

~~~powershell
gh pr checks $prNumber --repo $repository --watch --interval 10
if ($LASTEXITCODE -ne 0) { throw 'draft_pr_checks_not_green' }
if ((git rev-parse --verify HEAD).Trim() -cne $exactHead) { throw 'head_drift_before_check_readback' }

function Invoke-ExactGitHubJson([string]$path) {
  $raw = gh api -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' $path
  if ($LASTEXITCODE -ne 0) { throw 'github_readback_failed' }
  try { return ($raw | ConvertFrom-Json) }
  catch { throw 'github_json_invalid' }
}

function Read-ClosedActiveRulesets {
  $rows = @()
  $seenIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $terminated = $false
  for ($page = 1; $page -le 20; $page++) {
    $pageRows = @(Invoke-ExactGitHubJson ('repos/' + $repository + '/rulesets?includes_parents=true&per_page=100&page=' + [string]$page))
    if ($pageRows.Count -gt 100) { throw 'ruleset_page_oversized' }
    foreach ($row in $pageRows) {
      $id = [string]$row.id
      if ($id -notmatch '^[1-9][0-9]*$' -or -not $seenIds.Add($id)) { throw 'ruleset_id_invalid_or_duplicate' }
      if ($row.enforcement -ceq 'active') {
        $rows += [pscustomobject][ordered]@{ id = [long]$id; enforcement = 'active'; target = [string]$row.target }
      }
    }
    if ($pageRows.Count -lt 100) { $terminated = $true; break }
  }
  if (-not $terminated) { throw 'ruleset_pagination_truncated' }
  if ($rows.Count -eq 0) { throw 'active_ruleset_readback_empty' }
  return @($rows | Sort-Object id)
}

function Read-ClosedProtectedMasterRequirements([object[]]$activeRulesets) {
  $activeIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  foreach ($row in $activeRulesets) { [void]$activeIds.Add([string]$row.id) }
  $requirements = @()
  $tupleKeys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $contextToIntegration = @{}
  $terminated = $false
  for ($page = 1; $page -le 20; $page++) {
    $pageRows = @(Invoke-ExactGitHubJson ('repos/' + $repository + '/rules/branches/master?per_page=100&page=' + [string]$page))
    if ($pageRows.Count -gt 100) { throw 'protected_master_rule_page_oversized' }
    foreach ($rule in $pageRows) {
      $rulesetId = [string]$rule.ruleset_id
      if ($rulesetId -notmatch '^[1-9][0-9]*$' -or -not $activeIds.Contains($rulesetId)) { throw 'protected_master_ruleset_identity_invalid' }
      if ($rule.type -cne 'required_status_checks') { continue }
      foreach ($required in @($rule.parameters.required_status_checks)) {
        $context = [string]$required.context
        $integrationId = [string]$required.integration_id
        if ($context -notmatch '^[^\r\n]{1,200}$' -or $integrationId -notmatch '^[1-9][0-9]*$') { throw 'required_ruleset_identity_invalid' }
        if ($contextToIntegration.ContainsKey($context) -and [string]$contextToIntegration[$context] -cne $integrationId) { throw 'required_ruleset_tuple_drift' }
        $contextToIntegration[$context] = $integrationId
        $tupleKey = $context + "`0" + $integrationId
        if (-not $tupleKeys.Add($tupleKey)) { throw 'required_ruleset_tuple_duplicate' }
        $requirements += [pscustomobject][ordered]@{ context = $context; integrationId = [long]$integrationId }
      }
    }
    if ($pageRows.Count -lt 100) { $terminated = $true; break }
  }
  if (-not $terminated) { throw 'protected_master_rule_pagination_truncated' }
  if ($requirements.Count -eq 0) { throw 'protected_master_required_checks_empty' }
  return @($requirements | Sort-Object context,integrationId)
}

function Read-ClosedExactHeadCheckRuns {
  $rows = @()
  $seenIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $expectedTotal = $null
  $terminated = $false
  for ($page = 1; $page -le 20; $page++) {
    $pageValue = Invoke-ExactGitHubJson ('repos/' + $repository + '/commits/' + $exactHead + '/check-runs?filter=latest&per_page=100&page=' + [string]$page)
    if ($null -eq $pageValue.check_runs -or [string]$pageValue.total_count -notmatch '^[0-9]+$') { throw 'exact_head_check_page_invalid' }
    if ($null -eq $expectedTotal) {
      $expectedTotal = [int]$pageValue.total_count
      if ($expectedTotal -gt 2000) { throw 'exact_head_check_total_exceeds_bound' }
    } elseif ([int]$pageValue.total_count -ne $expectedTotal) {
      throw 'exact_head_check_total_drift'
    }
    $pageRows = @($pageValue.check_runs)
    if ($pageRows.Count -gt 100) { throw 'exact_head_check_page_oversized' }
    foreach ($row in $pageRows) {
      $id = [string]$row.id
      if ($id -notmatch '^[1-9][0-9]*$' -or -not $seenIds.Add($id)) { throw 'check_run_id_invalid_or_duplicate' }
      $rows += $row
    }
    if ($rows.Count -eq $expectedTotal) { $terminated = $true; break }
    if ($pageRows.Count -lt 100) { throw 'exact_head_check_pagination_short' }
  }
  if (-not $terminated -or $rows.Count -ne $expectedTotal -or $rows.Count -eq 0) { throw 'exact_head_check_pagination_truncated' }
  return @($rows | Sort-Object id)
}

function Read-ClosedEvidenceSnapshot {
  $activeRulesets = @(Read-ClosedActiveRulesets)
  $requirements = @(Read-ClosedProtectedMasterRequirements $activeRulesets)
  $checkRuns = @(Read-ClosedExactHeadCheckRuns)
  $stableValue = [pscustomobject][ordered]@{
    activeRulesets = @($activeRulesets)
    requirements = @($requirements)
    checkRuns = @($checkRuns | ForEach-Object {
      [pscustomobject][ordered]@{
        checkRunId = [long]$_.id
        context = [string]$_.name
        integrationId = [long]$_.app.id
        appSlug = [string]$_.app.slug
        headSha = [string]$_.head_sha
        status = [string]$_.status
        conclusion = [string]$_.conclusion
        detailsUrl = [string]$_.details_url
      }
    })
  }
  return [pscustomobject]@{
    activeRulesets = $activeRulesets
    requirements = $requirements
    checkRuns = $checkRuns
    canonical = ($stableValue | ConvertTo-Json -Depth 20 -Compress)
  }
}

$snapshotA = Read-ClosedEvidenceSnapshot
$snapshotB = Read-ClosedEvidenceSnapshot
if ($snapshotA.canonical -cne $snapshotB.canonical) { throw 'required_check_snapshot_tuple_drift' }
$rulesetCheckSnapshotBytes = $utf8NoBom.GetBytes($snapshotB.canonical)
$rulesetCheckSnapshotSha256 = Get-ExactSha256 $rulesetCheckSnapshotBytes
$rulesetRequirements = @($snapshotB.requirements)
$checkRuns = @($snapshotB.checkRuns)

$requiredCheckRunObservations = foreach ($required in $rulesetRequirements) {
  $matches = @($checkRuns | Where-Object {
    $_.name -ceq $required.context -and
    $_.head_sha -ceq $exactHead -and
    [string]$_.app.id -ceq [string]$required.integrationId
  })
  if ($matches.Count -ne 1) { throw 'required_check_context_integration_ambiguous' }
  $match = $matches[0]
  if ($match.status -cne 'completed' -or $match.conclusion -cne 'success') { throw 'required_check_not_successful' }
  if ([string]$match.id -notmatch '^[1-9][0-9]*$' -or [string]$match.app.id -notmatch '^[1-9][0-9]*$' -or [string]$match.app.slug -notmatch '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$') { throw 'required_check_app_identity_invalid' }
  [pscustomobject][ordered]@{
    checkRunId = [long]$match.id
    context = [string]$match.name
    integrationId = [long]$match.app.id
    appSlug = [string]$match.app.slug
    headSha = [string]$match.head_sha
    status = [string]$match.status
    conclusion = [string]$match.conclusion
    detailsUrl = [string]$match.details_url
  }
}

$runtimeObservationJson = ([pscustomobject][ordered]@{
  sourceCommit = $exactHead
  observations = @($requiredCheckRunObservations)
} | ConvertTo-Json -Depth 10 -Compress)
$runtimeObservationBytes = $utf8NoBom.GetBytes($runtimeObservationJson)
$runtimeObservationSha256 = Get-ExactSha256 $runtimeObservationBytes

$sourceIntegrationMatches = @($checkRuns | Where-Object {
  $_.name -ceq 'Control Plane Source Integration' -and
  [string]$_.id -match '^[1-9][0-9]*$' -and [string]$_.app.id -match '^[1-9][0-9]*$' -and
  [string]$_.app.slug -match '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$' -and
  $_.head_sha -ceq $exactHead -and $_.status -ceq 'completed' -and $_.conclusion -ceq 'success'
})
if ($sourceIntegrationMatches.Count -ne 1) { throw 'source_integration_exact_identity_invalid' }
~~~

Call only `resolveControlPlaneRequiredCheckContracts({ sourceCommit: exactHead, rulesetRequirements, checkRuns })`. Its module-private semantic/workflow registry maps the exhaustive live contexts to eight-field identities without storing any integration ID or App slug; `integrationId` and `appSlug` come only from the closed live snapshot. Pass that exact returned identity array through validateRequiredCheckRunObservations with the separate requiredCheckRunObservations; do not call a local identity builder, context switch, second canonicalizer, or exported registry. Require the returned canonical bytes/digest to equal the Task 2-backed inventory and Artifact preflight bytes/digest, require exactly one validate and one codeql semantic role, and bind the Control Plane Source Integration observation to its fixed workflow path/ref/SHA through the same provider. A result for a merge commit, previous head, pagination-truncated snapshot, rerun with changed source, similarly named check from another integration/App, or changed tuple between the two snapshots does not count.

- [ ] **Step 8: Obtain independent semantic and security reviews**

The semantic reviewer checks design-to-code field coverage, workflow composition, terminal state mapping, documentation truthfulness, and source/production separation. The security reviewer checks permissions, secret isolation, OIDC/SSH boundaries, parser closure, replay/expiry, immutable publication, cleanup, redaction, and failure recovery. Resolve every actionable thread and rerun the complete matrix on the new exact head.

The exact Draft body is constructed, hashed, and written in Step 5 before the first push. It uses Refs rather than Closes because external G1-G9 remain, records Supporting workstreams separately from truthful Supporting agents, and contains no preclaimed validation result.

- [ ] **Step 9: Keep the sole PR Draft and hand evidence to the master owner**

Do not mark Ready or merge in this task, even when every check and review is green. Record the sole Draft PR URL/number, exact branch/head/body digest, both closed ruleset/check-run snapshot digests, canonical eight-field requiredCheckContracts digest, separate runtime-observation digest, validation matrix, and independent review results, then hand that immutable evidence to the master implementation program's Task 8. That master task is the only Ready/Merge owner and must independently re-read the exact head and current evidence before acting.

This task's failure state is RED: return to the exact owning task, add a real corrective same-branch commit, and restart Task 9 from Step 1 on the new head. Its success state is GREEN with no additional repository change or empty commit: one existing Draft PR, one exact reviewed head, all checks/reviews green, a clean worktree, and a complete handoff to the master Ready/Merge owner. Source approval still grants no external Gate.

## External G1-G9 Handoff Only

This section is a post-merge operator handoff. It is not an execution checklist for the source implementation agent, contains no production command, and grants no approval.

| Gate | External action after merge | Required independent approval/evidence | Mandatory stop |
| --- | --- | --- | --- |
| G1 | G1a calls only Host `createControlPlaneHostBundleInstaller(deps).installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding })` to install/read back the immutable root-owned static bundle; G1b establishes and reads back artifact-publication protection without production secrets | Fresh provider inventory and exact provider approval for G1a; byte-identical Integration manifest/content receipt and Bootstrap layout; GitHub owner approval and policy readback for G1b | Any byte, nonce, contract, ownership, permission, Environment, reviewer, branch-policy ambiguity, alternate stager, caller-selected path/root/allowlist, overwrite, unit start, or enable attempt |
| G2 | Use a fresh G2-only Bootstrap evidence binding to send exactly one 10,000-ms single-response compatibility-inventory frame through `requestBootstrap`, call only Host's branded `compatibilityInventoryReader.read(request)`, and publish a typed cig1 receipt; if compatibility is required, publish the compatibility artifact without SSH | Exact compatibility-inventory approval; independent artifact-publication reviewer for conditional publication; immutable compatibility declaration with automatedDeploymentEligible false | Any bootstrap-activation or activation-ready frame/root-launcher call occurs, normal receipt/field or reduced/reordered database view is accepted, staged-content or database-contract bytes differ, rollback already satisfies the contract, proof is ambiguous, publisher isolation fails, or G2 evidence is marked reusable |
| G3 | Under a separately armed activation and backup/manual Gate, create a new bootstrap transport, call `requestBootstrap` with credentialId `japan-control-plane-github-bootstrap-v1`, only `encodeBootstrapActivationRequestFrame`, and the imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`; Bootstrap internally consumes ready and returns only the terminal response for `validateBootstrapActivationResponseFrame`, while the remote handler invokes the fixed root launcher; finish with a healthy exact rollback release | New non-G2 activation ID/evidence, exact backup scope, rollback artifact/tree proof, hostActivationReceiptSha256, operator approval; valid >10-second and <=900-second activation plus pre-ready zero-mutation and post-ready durable-recovery evidence | A compatibility-inventory frame/reader is called, a caller constructs/parses ready or hard-codes an activation timeout, a deploy credential is used before G4, activationId is accepted as a material selector, any G2 activation/response/materialization/transport/approval evidence is reused, a ready failure mutates/extends a deadline, post-ready failure bypasses durable cleanup/recovery, or backup/health/writer/data/readback fails |
| G4 | Create the bounded credential/authorization bootstrap generation, updater lifecycle, Environment protection/secrets, final receipt, dual cleanup proof, and rotation_closed | Provider-console approval limited to fifteen minutes; GitHub owner approval; independent readback of host and GitHub cleanup | Any key, token, App, installation, sudoers, activation lease, cgroup, state lease, or rotation fence remains unresolved |
| G5 | Manually run typed normal ig1 inventory-only request/response through `request` with the fixed deploy credential, call only Host's branded `normalInventoryReader.read(request)`, and publish its two-hour receipt | Exact G5 operator approval and protected reviewer; staged bundle, final bootstrap/authorization cleanup, rotation_closed, sole Task 2 required-check result, runtime, writers, normalized databaseContracts bytes, and rollback all agree | A copied/unbranded Host reader, second required-check registry/array, cig1 receipt, or lossy database projection is accepted; final bootstrap/rotation evidence is absent; capability/materializer ordering fails; or any request would mutate/acknowledge host state |
| G6 | Manually run the normal Artifact Gate for the exact fresh inventory and merged master | Operator starts the Gate; independent artifact-publication reviewer approves; durable assets, provenance, retrievability, and Production Gate receipt validate | Inventory expiry, source drift, runtime mismatch, publication conflict, missing provenance, or rollback incompatibility |
| G7 | Operator reviews the immutable Production Gate receipt and clicks Deploy with only its exact ID and confirmation | Explicit operator decision bound to the exact receipt | Any field is unclear, expired, changed, or not retrievable |
| G8 | A reviewer distinct from actor and triggering actor approves the exact pending vultr-japan-production job and run-bound plan | Current Environment policy plus run approval history read back after approval | Self-approval, stale approval, wrong run/attempt, source drift, or policy mismatch |
| G9 | GitHub automatically deploys, validates, performs code rollback when required, runs the automatic critical-finalizer boot/path recovery chain when needed, cleans credentials/temporary state, validates the terminal receipt, performs final ordinary read-only validation (including Host post-finalizer proof for critical), and lets the isolated Artifact-owned job write at most one bounded Deploy Note comment to the single merged source PR | No additional click during the normal or automatic-finalizer path; terminal bundle plus state-appropriate later ordinary status must be complete before the bounded comment | Any nonterminal, critical proof absent, cleanup-pending, receipt-loss, rollback-validation, final-readback, PR identity, comment-bound, or PR-body-immutability failure; no comment is written |

Receipt recovery, bootstrap updater cleanup, and any operator-driven resume/abort path are exceptional fresh Risk A Gates. They are not retries inside G1-G9 and cannot reuse the source review, operator dispatch, Environment approval, or a failed run. The critical terminal finalizer itself is not a new manual Gate: it is the fixed automatic boot/path recovery chain already included in G9, and its later ordinary status is withheld until Host's post-finalizer proof succeeds. Only a subsequent attempt to clear the retained critical fence or perform manual repair requires a new exact Risk A Gate.

## Post-Merge Reconciliation Boundary

After the source PR merge is visible on protected master, a separate C-tier branch and Draft PR may update docs/CURRENT_RELEASE_STATE.md, docs/PROJECT_CONTEXT.md, and the exact project-state records required by the current schema. That reconciliation must:

- bind the exact merge commit and merged PR;
- say source capability merged, production configuration absent or unverified, production_state not_deployed, and G1-G9 pending;
- preserve unknown or drift-prone GitHub settings as unverified until live readback;
- run git diff --check origin/master...HEAD, npm run docs:authority:check, and npm run project-state:check;
- contain no GitHub settings mutation, secret creation, workflow dispatch, provider access, host access, production validation, or Deploy Note claim.

Do not fold that reconciliation into the source PR because its exact merge SHA does not exist before merge.

## Real Deploy Note Boundary

The source PR body contains only `Production status: not_deployed` and never contains a Deploy Note. A real Deploy Note is written only after G9 yields a verified terminal controller closeout and state-appropriate final ordinary read-only validation.

For deployed_validated, record the actual deployed_at, release_unit control-plane-app, exact source_commit, immutable artifact/Release identity, target japan-control-plane, backup identity, validation summary, and identity_gate Not applicable.

For rolled_back, schema_committed_previous_release_validated, stopped_pre_switch, or critical_manual_intervention_required, record the exact verified terminal outcome and do not use language that implies successful deployment. For critical, the comment is eligible only after the automatic finalizer has completed and Host's private post-finalizer proof has propagated into the final Bootstrap ordinary-status brand; clearing the critical fence or manual repair remains a new Gate. A recovery no-claim is attempt-scoped diagnostic evidence only: it is not published as a recovered closeout, never creates or updates a Deploy Note comment, and requires a new exact Gate before any further claim. A missing or nonterminal closeout likewise creates no comment and opens a fresh recovery Gate.

The isolated Artifact-owned Deploy Note job may write at most one bounded comment to the single exact merged source PR only after validating same-run aggregate closeout evidence. It never changes the PR title/body, creates a comment for no-claim/nonterminal evidence, or writes any repository file. Any durable production state document update belongs in a later closeout PR and must bind the exact workflow run, run attempt, source commit, artifact, receipt, target, backup, and validation evidence.

## Acceptance Checklist

- [ ] Foundation/native feasibility passed on target-matching disposable Linux with no skipped capability.
- [ ] All six plans were implemented on one branch and one Draft PR.
- [ ] Final host-execution, receipt, and staged-host bundle contracts are computed from complete final static bytes and read back exactly.
- [ ] Bootstrap's host layout includes Host's `control-plane-host-inventory-readers.mjs` static source, while the Host-owned external `control-plane-host-bundle-installer.mjs` is not a staged-host entry; Task 1 fails on a missing reader and never creates a self-referential installer manifest.
- [ ] External G1a can reach only `createControlPlaneHostBundleInstaller(...).installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding })`; source tests prove exact-byte acceptance, no replacement/start/enable/selectors, and no Integration-owned second stager.
- [ ] Normal ig1 and compatibility cig1 IDs, schemas, resolvers, Releases, assets, bodies, and two-hour expiry are non-interchangeable.
- [ ] Compatibility binds staged content/rollback/runtime/writer/DB baselines and excludes final bootstrap/rotation; normal requires final bootstrap, cleanup, authorization binding, and rotation_closed.
- [ ] Both receipts embed only canonicalizeDatabaseContracts output and bind its sha256; inventory, release declaration, and deployment plan independently call the helper and compare bytes plus sha256, while all frozen Host-fixture faults reject and no local item contract/order/JSON.stringify path exists.
- [ ] Normal and compatibility read-only inventory use their disjoint Bootstrap-owned pre-Gate request/response codecs plus the matching method of the one Host-branded `createControlPlaneHostInventoryReaders` provider, reject status_response_v1, activation response, and each other, and have no execute, ACK, recovery mutation, terminal bundle, artifact, path/resource selector, or mutation path.
- [ ] G2 compatibility inventory sends exactly one 10,000-ms single-response compatibility-inventory frame through requestBootstrap, never accepts activation-ready, and never reaches a root launcher. G3 uses a new transport/evidence/approval plus only `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame`, the imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, and the fixed Bootstrap root launcher; Bootstrap alone consumes its internal ready and exposes only the terminal response. Tests prove a valid >10,000-ms and <=900,000-ms operation, the 910,000-ms authenticated deadline and 930-second unit bound, zero mutation on pre-ready write/disconnect, durable cleanup/recovery after post-ready disconnect/timeout/crash, and wrong/duplicate/cross-binding ready rejection without deadline extension. No G2 activation/response/materialization/transport evidence is reusable. Normal/final/recovery uses request with fixed deploy credentialId only after G4; all materialization uses materializeFixedCredential and publication uses no SSH.
- [ ] Every transport has exact frozen keys `{ execute, request, requestStatusBundle, requestBootstrap, close }`. Each production/recovery controller owns one multi-operation lifecycle with one sealed credential capture, per-operation cloned/zeroized buffers, and outer-finally close; each typed inventory and G3 owns a separately closed single-request transport.
- [ ] Capability probe completes before the one lazy materialization per lifecycle, any false/unknown capability reads zero protected values, close is idempotent, and all four operation methods reject after transport_closed.
- [ ] Inventory publisher is isolated from the production Environment and production secrets.
- [ ] Task 2 solely exports executable Foundation REQUIRED_CHECK_CONTRACT/REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts/canonicalizeRequiredCheckContracts; its separate registry module has the only export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns })`, keeps the fixed semantic/workflow registry private, injects integrationId/appSlug only from closed live evidence, and returns the exact canonicalizer result. The one-field root resolves its item through nested/arrays, exact eight-field identities exhaust protected-master requirements, include validate/codeql, stay separate from runtime observations, and are consumed byte-for-byte by inventory/Artifact/Task 9 with no second registry, array, mapping, serializer, or canonicalizer.
- [ ] INVENTORY_ATTESTATION_PREDICATE_CONTRACT is a single Integration-owned dependency leaf; inventory and Artifact pass the same frozen predicateBindings and exact ordered attestationIdentity through real generic validation without a copied contract.
- [ ] Seven source-integration scenarios pass with two distinct synthetic SQLite files and no network or external mutation.
- [ ] Original controller closeout upload uses the exact artifact/archive names and explicit 35-day retention.
- [ ] Initial terminal handling preserves the private sixteen-field ordinary status with exact deploymentPlanSha256, calls only Bootstrap readTerminalBundleBytes with timeoutMs 30_000 and owner bounds 768 raw bytes/262144 total bytes/342 chunks/2048 response bytes, and passes its untouched `{ bytes, sha256 }` wrapper to Receipt validateTerminal; controller code contains no copied chunk loop/codec/parser or planSha256 alias.
- [ ] Recovery uses one exact-five-method deploy transport and performs challenge -> validated recovered selector -> Bootstrap `createPostRecoveryStatusRequest` -> one through seven freshly correlated ordinary `.request` polls at fixed 5000 ms intervals under one absolute 30000 ms deadline -> exactly one `readTerminalBundleBytes` call/one `requestStatusBundle` session -> Receipt validation. Recovered status can never masquerade as ordinary status; pending/deadline/rejected paths read no bundle and publish nothing; 1/768/769/262144-byte and 1..342-frame boundaries plus ACK-loss are covered.
- [ ] Critical terminal publication is followed by the fixed automatic finalizer boot/path recovery chain, not a new manual Gate. Bootstrap exposes an immutable ordinary terminal only after consuming Host's real post-finalizer proof; only later critical-fence clearing/manual repair requires a separately approved Risk A Gate.
- [ ] Upload-start and ACK pass complete transportResult objects plus exact expected bindings to validateUploadStartedResponse and validateAckResponse; ACK is never final status; a separate createCommittedStatusRequest/validateUploadCommittedObserved round trip returns the final ordinary status plus responseSha256; the complete Actions observation wrapper is preserved and Artifact's sink writes exact final-status bytes.
- [ ] The real Receipt/controller/Deploy Note integration matrix covers all five terminal and all three no-claim results; every no-claim uses exact createNoClaimEvidence bytes, validatedFinalHostStatus null, zero host mutation, and a Deploy Note no-op.
- [ ] Source validation workflow references no production secret, Environment, OIDC, SSH, publisher, or mutation capability.
- [ ] Artifact Manifest v1 remains unchanged; deployment companions are documented separately.
- [ ] Runbook preserves existing identity and health sections and documents manual Deploy plus automatic deployment/validation/code rollback/cleanup.
- [ ] Validation baseline and indexes point to the approved design and all implementation plans without claiming deployment.
- [ ] Source PR does not modify current release, project context, project-state, or production execution records.
- [ ] Focused tests, full npm test, packaging, docs authority, project state, diff check, offline native build, and clean Linux validation pass.
- [ ] Validate, Control Plane Source Integration, and CodeQL bind one exact PR head SHA.
- [ ] Independent semantic and security reviews approve that exact head with no unresolved actionable thread.
- [ ] Source PR body contains exact Risk A metadata, identity_impact false, `Production status: not_deployed`, no Deploy Note, and remaining G1-G9. Artifact Tasks 11-12 alone may write the one real bounded Deploy Note comment to the exact merged PR after verified G9 terminal evidence; they never update the PR body, and no-claim/nonterminal writes nothing.
- [ ] Exact Issue and complete body were resolved before the first push; one branch was pushed and one Draft PR was opened exactly once; Integration Task 9 left it Draft and handed exact-head evidence to the master program's sole Ready/Merge owner.
- [ ] The same-branch checkpoint history follows Foundation -> Host 0-1 -> Integration 2 -> Artifact 1-2 -> Bootstrap 1-8 -> Host 2-10 -> Receipt 1-3 -> Artifact 3-8 -> Host 11A broker plus inventory readers -> Bootstrap 9-10 -> Receipt 4 -> Artifact 9-10 -> Host 11 remainder-13 -> Receipt 5-8 -> Artifact 11-13 -> Bootstrap 11 -> Integration 1 -> Host 14A -> Integration 3 -> Host 14B -> Integration 4-9; task numbers were not treated as execution order.
- [ ] Recovery no-claim remains attempt-scoped diagnostic evidence, creates no publication or Deploy Note comment, and requires a new Gate.
- [ ] No workflow was manually dispatched, no Release or attestation was written, no GitHub setting changed, and no provider or production system was accessed.
- [ ] Post-merge reconciliation, external G1-G9, and real Deploy Note remain separate handoffs with fresh evidence and approval.

## Plan Self-Review and Execution Handoff

- [ ] Compare every file and export in this plan with the five adjacent plans; remove duplicate ownership before implementation begins.
- [ ] Compare every receipt field, terminal state, workflow input, permission, secret name, variable name, concurrency key, confirmation phrase, and TTL with the approved design.
- [ ] Search the plan and source diff for unresolved planning markers, sample-only authority, fabricated current state, secret values, production endpoints, and stale workflow names; replace or remove every occurrence.
- [ ] Confirm every code block is executable test, exact contract example, exact workflow skeleton, exact validation command, or exact PR metadata.
- [ ] Confirm every task has a failing test, focused run, minimal implementation, passing run, and commit boundary.
- [ ] Confirm external G1-G9 contains no production command and grants no approval.

When implementation is authorized, use superpowers:subagent-driven-development on the single shared source branch in this exact provider/consumer order: Foundation; Host/DB Tasks 0-1; this plan Task 2; Artifact Tasks 1-2; Bootstrap Tasks 1-8; Host/DB Tasks 2-10; Receipt Tasks 1-3; Artifact Tasks 3-8; the Host/DB Task 11A broker plus branded inventory-reader provider checkpoint; Bootstrap Tasks 9-10; Receipt Task 4; Artifact Tasks 9-10; the remainder of Host/DB Task 11 plus Tasks 12-13; Receipt Tasks 5-8; Artifact Tasks 11-13; Bootstrap Task 11; this plan Task 1; Host/DB Task 14A; this plan Task 3; Host/DB Task 14B as the stop-before gate; then this plan Tasks 4-8; finally Task 9 serially for Issue resolution, the one push, the one Draft PR, exact-head integration, reviews, and Draft evidence handoff. Task numbers remain stable ownership labels and do not override this schedule. Each slice makes only its authorized same-branch checkpoint, Task 6 makes no change/commit, and no task duplicates adjacent owner contracts. Stop with the PR Draft for the master program's sole Ready/Merge step; after that owner verifies and merges, do not enter G1 without a new exact Risk A approval.
