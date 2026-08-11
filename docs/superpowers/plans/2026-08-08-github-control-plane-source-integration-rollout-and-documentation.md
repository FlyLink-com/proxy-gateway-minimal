# GitHub Control-Plane Source Integration, Rollout, and Documentation Implementation Plan

> **For future agentic workers only after the four-prerequisite Source-resumption gate below is satisfied:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the then-authorized plan task-by-task. This line grants no current implementation authority. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate every approved GitHub-controlled Japan control-plane deployment source slice, add a protected read-only inventory contract and a no-production-secret source validation workflow, and publish the exact operator documentation needed to review one main source-only Draft PR, after the separately merged narrow authority-bootstrap predecessor, without changing GitHub settings or production. This is the future complete-plan goal, not a claim that the current approval can reach it.

**Architecture (future complete topology):** Only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded may the foundation/native feasibility checkpoint run to eligibility. Artifact/workflow, bootstrap/authorization, host/database transaction, and receipt/recovery plans would then contribute closed checkpoints to the same implementation branch without per-slice PRs or merges. This final slice would compute the complete staged-host bundle and installed contract digests only after every static source exists, add domain-separated compatibility and normal inventory lanes, validate the Artifact-owned receipt/controller composition without editing it, and validate all slices with synthetic fixtures. A later mandatory source-state reconciliation PR would record the exact main source PR number/head/merge identity before any G1-G9 work; external G1-G9 Risk A Gates and the first real Deploy Note would remain post-merge handoffs with fresh approvals. None of that downstream path is currently reachable.

**Current authorization boundary (post-#593):** the sole current source authorization is the separate authority-bootstrap predecessor's exact 11-file inventory enumerated below. Its owning predecessor plan may prepare, test, push, open, and review that source-only Draft, but the Draft must remain Draft and may not be marked Ready or merged. No file, step, test, command, checkpoint, commit, push, PR, or handoff from Source Tasks 1-9 belongs to that inventory or is currently authorized. The full Sigstore owner topology is unapproved (`full_sigstore_owner_topology_unapproved`) and the offline npm closure is a hard STOP, so Foundation eligibility and every Source task remain unavailable.

The exact 11-file authority-bootstrap inventory, owned outside this Source plan, is:

- `server/services/deployment/strict-json-scan.mjs`
- `server/services/deployment/canonical-json.mjs`
- `server/tests/control-plane-canonical-json.test.mjs`
- `.github/workflows/control-plane-foundation-toolchain-inventory.yml`
- `.github/workflows/control-plane-foundation-toolchain-publish.yml`
- `scripts/control-plane-foundation-toolchain-inventory.mjs`
- `scripts/control-plane-foundation-toolchain-publication.mjs`
- `server/tests/control-plane-foundation-toolchain-inventory.test.mjs`
- `server/tests/control-plane-foundation-toolchain-inventory-workflow.test.mjs`
- `server/tests/control-plane-foundation-toolchain-publication.test.mjs`
- `server/tests/control-plane-foundation-toolchain-publication-workflow.test.mjs`

**Tech Stack:** Node.js 22 ESM, node:test, canonical UTF-8 JSON, JSON Schema, SHA-256, HMAC-SHA-256, better-sqlite3 fixtures, GitHub Actions, GitHub REST, GitHub Release assets, artifact attestations, sealed file descriptors, OpenSSH status-only transport, disposable Linux/systemd integration, Markdown, and YAML.

## Global Constraints

- Risk: A for the overall capability; every task in this plan is source-only and has no production authority.
- Process: the future complete plan requires prerequisite feasibility, TDD, closed contracts, synthetic fixtures, clean Linux validation, exact-head CI and CodeQL, independent semantic review, independent security review, and one main Draft PR. Current approval stops at review of the separate exact 11-file authority-bootstrap Draft listed above and authorizes zero Source Tasks 1-9 work. Because Foundation eligibility is unavailable, complete validation and independent reviews cannot unlock any transition: the master implementation program's Ready/Merge step and all external Risk A work are currently unreachable, and the main PR remains Draft.
- Expected PR count: exactly one narrow authority-bootstrap predecessor plus exactly one main source implementation PR for all six plan slices. The source-state reconciliation and first production-attempt closeout are later, separate documentation PRs and are not part of the main source PR.
- Validation: documentation authority, project-state, fence/example parsing, and exact diff checks may validate this plan edit. Focused/full npm, seven-scenario host integration, no-secret GitHub source integration, offline native build, clean Linux bootstrap validation, packaging, exact-head CI/CodeQL, and two independent reviews remain future complete-plan requirements behind the four-prerequisite Source-resumption gate; the unavailable offline npm closure prevents claiming that matrix or Foundation eligibility now.
- Production/AWS impact: none during this plan. Do not access Vultr, AWS, Cloudflare, DNS, a production host, a production database, or a production endpoint.
- The approved design at docs/superpowers/specs/2026-08-08-github-control-plane-production-deploy-design.md is normative. If an implementation plan conflicts with it, stop and reconcile the plans before code changes.
- The future complete plan requires the foundation/native feasibility plan to pass on the target-matching disposable Linux environment before its full provider order starts. Current Foundation eligibility is unavailable because the full Sigstore owner topology is unapproved and the offline npm closure is a hard STOP. A skipped native assertion, missing capability, emulated success, or reuse of the separate exact 11-file Draft checkpoint as Foundation evidence is a failure.
- Current work in this Source plan is limited to this documentation correction and its read-only document validation. Source Tasks 1-9 and the complete six-plan branch/provider order are dormant and not authorized to resume: no Source-plan file may be created or modified, no Source task command or test may run, and no Source checkpoint may be staged, committed, pushed, opened as a PR, reviewed as implementation evidence, readied, merged, or used to enter another plan. Independently, only the separate predecessor plan may act on the exact 11-file authority-bootstrap inventory listed above; it may prepare, test, push, open, and review that source-only Draft, which must remain Draft and cannot count as Foundation evidence or unlock any Source task, Ready/Merge, reconciliation, or G1-G9. The complete Source plan may resume only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded. These four conjunctive prerequisites are the **four-prerequisite Source-resumption gate** used below.
- The main source PR remains Draft. Passing any currently reachable document-only or exact-11 authority-bootstrap checks cannot satisfy the unavailable complete validation matrix, cannot hand authority to a Ready/Merge owner, and cannot make any Source task, reconciliation, or G1 reachable.
- Repository identity is fixed to gccwebos-com/proxy-gateway-minimal, branch identity to refs/heads/master, target to japan-control-plane, release unit to control-plane-app, service to proxy-gateway-candidate.service, and production Environment to vultr-japan-production.
- Preserve the operator decision: an operator manually clicks Deploy; after exact dispatch and distinct Environment approval, GitHub performs deployment, validation, code rollback, cleanup, and receipt closeout automatically.
- **FUTURE ONLY — four-prerequisite gate:** Do not dispatch or trigger any Source workflow while implementing or validating this documentation correction now. Pull-request-triggered source validation becomes permitted only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded. Until then, current reachable validation is limited to this Source-plan documentation correction's static/document checks. Even in that future state, pull-request-triggered source validation has no Environment, production secret, OIDC, publisher, SSH, or mutation authority, and no manual workflow dispatch is permitted by this plan.
- Do not create or change a GitHub Environment, Environment protection rule, repository variable, repository or Environment secret, GitHub App, App key, installation, token, deploy key, Release, Release asset, attestation, branch rule, or Actions retention setting.
- Do not install or enable a systemd unit, create a principal, write sudoers or authorized_keys, stage a host bundle, open SSH, mint OIDC, acquire a production lease, create a backup, migrate a database, switch current, restart a service, probe a production endpoint, rotate credentials, or clean production state.
- Reserved production secret names may appear only in static workflow contract tests and the production workflow source owned by adjacent plans. Their values must never be requested, read, logged, persisted, copied into fixtures, or supplied to source integration.
- The source-integration workflow and its process tree must contain no reference to secrets, an Environment, id-token write permission, SSH, SCP, rsync, GitHub Release writes, attestation writes, provider APIs, production endpoints, or production paths.
- The compatibility and normal read-only inventory workflows are manual-only, protected, status-only, typed, and fail-closed. Neither may send execute_auth, bootstrap activation, closeout acknowledgement, recovery mutation, artifact bytes, or any host-state mutation request. G3 bootstrap activation is a third, disjoint protocol path under its own later Gate and can never be emitted by either inventory workflow.
- Environment configuration text is never approval evidence. In both typed inventory workflows, the unprotected `preflight` job uses Artifact Task 6's sole GitHub evidence owner for token-scoped live observations of the fixed inventory Environment and `artifact-publication`, then emits one data-only canonical packet pair for each. After GitHub approves the protected `inventory` job, its absolute `steps[0]` is the fresh authority recheck: a fixed workflow-owned inline body, not checkout, setup, download, a local/repository action, or repository code. Before that body begins there is therefore zero action execution, checkout authentication, implicit/default action token, secret/variable expression, protected output, materializer, transport, or host request. The body alone receives one explicit step-scoped `GITHUB_TOKEN: ${{ github.token }}` plus the closed current-run/fixed-Environment bindings and its two expected policy-packet data outputs. It independently re-reads the fresh policy, current same-run approval history, and exact approving user before returning a safe canonical accepted proof. Only after `steps[0]` succeeds may the job run a pinned exact-S checkout with `persist-credentials: false`, tokenless thin owner-data validation, and then the exact five-secret/five-variable materialization. Every protected recheck requires a direct `workflow_dispatch` run on exact `refs/heads/master`, exact source SHA, `run_attempt == 1`, owner policy fields `preventSelfReview === true`, `protectedBranches === true`, `customBranchPolicies === false`, `adminBypassAllowed === false`, and a non-empty reviewer list whose every owner-canonical tuple is `type:"user"`, a stable decimal-string `id`, normalized lower-case `login`, and `slug:null`; Team, unknown, missing, duplicate, or ambiguous reviewer rows fail. Compatibility inventory additionally requires exactly one reviewer as frozen below.
- The two protected `steps[0]` inline bodies are byte-identical reviewed bytes. Their closed literal mode/Environment/workflow bindings differ only through an exact step `env` map that the body validates against a fixed normal-or-compatibility table; a mode/path/Environment mismatch stops. Static tests extract both bodies, require byte identity and one frozen reviewed SHA-256, parse the complete body, and execute it against Artifact Task 6's exact positive and negative policy/approval/user fixtures. Artifact Task 6's contracts and vector corpus remain the sole normative authority: Source exports no second policy/reviewer/approval contract, field list, canonicalizer, REST projection, Team logic, user resolver, PAT/App path, or reusable authority reader. The inline body is a non-exported workflow gate whose parity with the owner vectors is mandatory and whose only routes are the owner's fixed repository Environment, current-run approval-history, and exact `GET /users/{login}` reads.
- The preflight adapter accepts Artifact's exact canonical Environment-policy and preapproval-evidence wrappers unchanged, then creates only two instances of Source's `inventory_environment_policy_packet_v1` envelope binding repository, fixed Environment, fixed workflow path/ref, source commit, current run ID/attempt, owner preapproval bytes/digest, and owner policy bytes/digest. Its only cross-job outputs are `policy_packet_base64`, `policy_packet_sha256`, `publication_policy_packet_base64`, and `publication_policy_packet_sha256`; the first pair binds the inventory Environment and the second binds `artifact-publication`. Protected inventory `steps[0]` treats its matching pair only as expected data to decode, hash, validate, and byte-compare; no output may select an Environment, URL, API route, reviewer, secret/variable key, credential, materializer, transport, host, or publisher. Each fresh inventory body must reproduce byte-identical owner policy bytes/digest, require the owner's fixed current-run approval-history semantics, resolve the exact approving user only through the fixed `GET /users/{login}` route, and prove the stable approving ID/login is configured and distinct from both `actor` and `triggering_actor`. Inventory's safe accepted proof is consumed after checkout only as canonical data by the thin Source adapter. The current dormant publisher bodies stop before reading the publication packet or any accepted proof; only a future separately approved full owner may consume them. Stale policy or approval, wrong run/attempt, self approval, Team/unknown identity, admin bypass, drift, pagination ambiguity, body/SHA drift, or any read/parse failure stops before checkout, protected values, or first write.
- G2 compatibility inventory never borrows `vultr-japan-production` or a standing deploy credential. A separately approved future Risk A Settings/provider Gate must establish and read back the exact master-only Environment `vultr-japan-compatibility-inventory` with `prevent_self_review: true`, `can_admins_bypass: false`, and exactly one reviewer distinct from the dispatcher whose canonical tuple is `type:"user"`, stable decimal `id`, normalized lower-case `login`, and `slug:null`; Team or unknown reviewers fail closed, and no organization-membership credential/API exists. Immediately before one attempt it installs only the five short-lived secret leaves `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_HOST`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_PORT`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_USER`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_PRIVATE_KEY`, and `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_KNOWN_HOSTS`, plus exact variables `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_AUTHORIZATION_GENERATION`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_BOOTSTRAP_RECEIPT_SHA256`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_EXPIRES_AT`, `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_ACTIVATION_ID`, and `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_HOST_BUNDLE_CONTENT_RECEIPT_SHA256`. The fixed materializer byte-compares those bindings to the operator input and owner-branded expectation, caps the credential at fifteen minutes, and zeroizes local copies. G3 and normal inventory reject this Environment, names, key, activation, and receipt. After the one run, the same external Gate removes and reads back all ten names absent and the host-side ephemeral key unusable before G3 may begin; timeout, cancellation, or cleanup uncertainty stops the sequence. This source PR neither creates that Environment nor reads or writes any value.
- The inventory publisher is isolated from the inventory Environments, production Environment, and every protected secret. Each `publish` job retains the frozen four-step, four-token, permission, pin, and no-checkout topology, but it is deliberately dormant in the current source: the exact Artifact-owner authorize, publish, and `verify_complete` bodies each begin with the same unconditional `artifact_inventory_publisher_owner_unavailable` stop before reading opaque input, calling GitHub, writing a file/output, or reporting completion. The pinned `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6` step retains explicit `github-token: ${{ github.token }}`, `push-to-registry: false`, and `create-storage-record: false`, but has the exact always-false condition and therefore never consumes OIDC or attests. Current real owner-fixture tests execute all three fixed bodies and prove the bounded unavailable result plus zero Release calls, attestation calls, files, outputs, and completion claims. Source defines no fallback publisher or second contract. A happy one-pair publish/attest/`verify_complete` path is future work requiring the full Artifact protected-publisher owner bytes, a separately reviewed source change, and a separately approved Risk A publication Gate; this plan does not activate it.
- Each typed inventory workflow has the exact ordered root keys `name,on,permissions,concurrency,jobs` and no other root key. Root `defaults`, root `env`, differently cased aliases, duplicate keys, anchors/aliases/merge keys, or any unlisted field fail raw parsing before the parsed topology is trusted. In particular, no `defaults.run.shell` or `defaults.run.working-directory` may silently change the absolute-step-zero body or any later `run` step, and no root environment may inject a token, protected binding, selector, or executable context. Normal and compatibility root skeletons deep-equal apart from their explicitly frozen names, inputs, and mode bindings.
- Normal Inventory Gate IDs match exactly ^ig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$; compatibility Inventory Gate IDs use the disjoint ^cig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$ domain.
- A future separately approved publisher activation would use normal Release control-plane-inventory-{sourceCommit}-{runtimeContractId} and asset inventory-receipt-{receiptSha256}.json, or compatibility Release control-plane-compatibility-inventory-{sourceCommit}-{runtimeContractId} and asset compatibility-inventory-receipt-{receiptSha256}.json. The current dormant publisher creates neither pair.
- Both receipt bodies exclude their external Gate ID, are canonical bytes, and expire exactly two hours after createdAt. now >= expiresAt is expired. A normal resolver rejects compatibility bytes/IDs/assets, and a compatibility resolver rejects normal bytes/IDs/assets.
- Compatibility inventory binds the staged host-bundle manifest/content receipt plus exact rollback, runtime, writer, and normalized databaseContracts bytes. It rejects final bootstrap receipt, authorization generation, authorization HMAC, and rotation_closed fields because those do not exist before G4.
- Normal inventory requires the final bootstrap receipt, identical protected evidence, authorization generation/HMAC bindings, cleanup proof, and rotation_closed in addition to the staged bundle, rollback, runtime, writer, and the same complete databaseContracts representation.
- Inventory receipts alone own the live-readback requiredCheckContracts array. It exhaustively covers the protected-master ruleset contexts, includes at least the semantic roles validate and codeql, and never substitutes a display-name guess or fabricated production App ID.
- This plan's Task 2 is the sole owner of REQUIRED_CHECK_CONTRACT, REQUIRED_CHECK_ARRAY_CONTRACT, validateRequiredCheckContracts, and canonicalizeRequiredCheckContracts. Both constants are exact executable Foundation contracts; the array contract serializes the sole `{ requiredCheckContracts }` root through its nested item registry. Each required-check identity has exactly semanticRole, context, appSlug, integrationId, sourceKind, workflowPath, workflowRef, and workflowSha in that order; integrationId is always a positive live-readback GitHub integration/App ID, never null, zero, guessed, or hard-coded. Runtime observations such as checkRunId, headSha, status, and conclusion live in a separate non-receipt structure and can never be serialized as identity fields.
- Task 2 also solely owns `server/services/deployment/control-plane-required-check-registry.mjs`, whose only export is `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns, workflowRuns })`. Its fixed semantic/context policy is module-private; it injects `integrationId`/`appSlug` only from one closed live-evidence snapshot and workflow path/ref/SHA only from the uniquely joined actual Actions run whose `checkSuiteId` equals the check run's observed `checkSuiteId`. It returns the exact object from `canonicalizeRequiredCheckContracts(...)`. Artifact, preflight, inventory, and Task 9 consume that one result byte-for-byte and may not define a second registry, identity array, resolver, canonicalizer, or static workflow-identity synthesizer.
- Task 2 also owns the dependency-leaf INVENTORY_ATTESTATION_PREDICATE_CONTRACT. Artifact and the inventory-side opaque-data producer import it and prepare the same frozen predicateBindings for future consumption by the full Artifact protected-publisher owner and real generic inspector/publisher; the current dormant workflow passes them to no write-capable operation, and no workflow body or consumer copies their field order, size bound, workflow mapping, or validation rules.
- Artifact and deployment preflight import this owner provider, consume canonical requiredCheckContracts bytes byte-for-byte, and require every exact context/integrationId/appSlug identity to report success for the bound source SHA; they do not redeclare, rediscover, project, or weaken the inventory set.
- Both typed inventory receipts carry only the Host-owned output of canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }. Their executable parent contracts import the same frozen Host `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT` object, register it unchanged as `nested["database-contract-entry-v1"]`, and set `arrays.databaseContracts` to that exact key. Inventory, release declaration, and deployment plan independently call the helper, require byte-identical bytes and the same bound sha256, and never inspect/copy the embedding descriptor, define a local database item contract or field order, use JSON.stringify comparison, rename the projection, or accept a lossy mapping.
- The normal production workflow's original controller_closeout Actions artifact explicitly retains for 35 days, is named control-plane-controller-closeout-{controllerRecoveryId}-{originalRunId}-{originalRunAttempt}, and archives exactly one controller-closeout-{payloadSha256}.json. Repository default retention is never authority.
- Portable artifact.json remains Artifact Manifest v1. Deployment-only identity belongs in immutable companions, never as new portable-manifest fields.
- Existing .github/workflows/release-artifact.yml remains short-lived source-build evidence. Existing .github/workflows/production-deploy-dry-run.yml remains a non-mutating, non-authoritative text-plan exercise. Neither becomes a deployment input.
- Existing japan-runtime-config workflows, JAPAN_CI credentials, workstation SSH helpers, edge bootstrap, and restore-subscriptions.sh remain separate authorities and are not reused.
- G2 compatibility inventory calls `requestBootstrap({ credentialId: 'japan-control-plane-github-bootstrap-v1', requestBytes, timeoutMs })` only with `encodeCompatibilityInventoryRequestFrame` bytes and validates only `validateCompatibilityInventoryResponseFrame`; it never asks the host to activate a bundle. G3 uses a newly armed activation and the disjoint Bootstrap-owned `encodeBootstrapActivationRequestFrame` / `validateBootstrapActivationResponseFrame` pair through a new transport lifecycle's `requestBootstrap(...)`; the remote handler alone invokes the fixed Bootstrap root launcher. G2 compatibility evidence is strict read-only evidence and can never satisfy or be reused as G3 activation evidence. Normal G5 inventory uses its own normal-inventory request/response codec through `request({ credentialId: 'japan-control-plane-github-deploy-v1', requestBytes, timeoutMs })`; final deployment status and receipt recovery keep their separate ordinary-status and recovery ABIs. Any future separately approved compatibility Artifact publication performs no SSH operation; the current Source publisher is dormant and performs no publication operation.
- Bootstrap owns G3's internal two-frame handshake and timing constants. `requestBootstrap` validates and consumes the canonical `bootstrap_activation_ready_v1` frame internally, then returns only the final `bootstrap_activation_response_v1` envelope to Integration; no controller/operator constructs, receives, parses, or extends readiness. Integration passes only the owner-exported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` rather than a numeric timeout. Compatibility inventory remains a single-response 10,000-ms request and must never emit or accept an activation-ready frame.
- Consume Bootstrap's transport lifecycle without wrapping or recreating it: `createSecureSshTransport(...)` returns exactly the frozen five-method surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`. The first protected method validates and locks its method-specific fixed credential ID, proves the complete Foundation native capability vector, calls only `secretMaterializer.materializeFixedCredential(credentialId)` exactly once, and copies the returned tuple into an internal sealed credential capture. Every later method must use that same fixed ID; switching between bootstrap and deploy credential families rejects before cloning, while deploy `execute`, `request`, and `requestStatusBundle` share the same deploy capture. Every operation clones independent mutable buffers from that capture and zeroes/closes its clone in its own finally; idempotent `transport.close()` destroys the sealed capture, zeroes every retained byte, and makes all four operation methods reject `transport_closed`. A false or unknown probe performs zero materializer calls and reads no endpoint, key, known-hosts, or other protected bytes.
- One production workflow controller creates one deploy-credential transport for execute, bounded status polls, one authenticated terminal-bundle stream, both closeout transitions, and final read-only status, then closes it in the controller's outermost finally. One recovery controller owns one deploy-credential transport for challenge, recovered-selector, one through at most six freshly correlated ordinary-status requests at fixed five-second points from 0 through 25 seconds, a seventh scheduled 30-second boundary that checks expiry and sends no request, and exactly one later `requestStatusBundle` stream after an immutable terminal; it closes the same transport in its outermost finally. Recovery must traverse challenge -> validated recovery selector -> `createPostRecoveryStatusRequest` -> real ordinary-status brand -> terminal bundle, and the critical row becomes eligible only after the Host-branded post-finalizer proof has propagated through Bootstrap's ordinary-status validator. Each normal or compatibility inventory invocation creates its own transport, sends exactly one method-specific inventory request, validates only the matching inventory response, and closes it in finally; G3 creates another bootstrap transport and sends exactly one activation request. No inventory or activation transport is shared across Gates, workflows, or receipt types.
- During the source implementation PR, do not modify docs/CURRENT_RELEASE_STATE.md, docs/PROJECT_CONTEXT.md, project-state/current.json, project-state/tasks.json, project-state/lanes.json, project-state/gates.json, `project-state/control-plane-main-source-identity.json`, or any generated project-state view. The main PR creates only the identity schema/module/CLI/tests and updates the existing project-state checker plus its test once: absence of the fixed identity file is valid before reconciliation, while a present file is read as bounded bytes and delegated to the identity owner's validator. The canonical instance is created after merge by the mandatory C-tier reconciliation PR. Among main-source-identity implementation artifacts that PR adds only the instance: it does not add or change the checker, schema, module, CLI, or test code. It separately updates only the explicitly enumerated truthful merged/`not_deployed` docs and project-state records required by the existing schemas.
- RELEASE_MANIFEST.md may be updated only to document durable companion semantics and the continued Artifact Manifest v1 boundary. It must not claim a Release exists, production is configured, or production was deployed.
- Preserve the existing docs/GITHUB_DEPLOYMENT_RUNBOOK.md sections named Protected Release Config Identity Gate and Condition-Driven Promotion Health Window, in that order.
- Every new JSON contract rejects duplicate keys, unknown keys, BOM, invalid UTF-8, trailing bytes, non-canonical serialization, unsafe strings, oversized input, and expiry at the exact boundary.
- No receipt, packet, error, fixture, test name, log, or documentation example may expose a hostname, IP address, user, port, host path, database path, config value, raw environment value, process ID, key fingerprint, credential reference, token value, OIDC assertion, customer data, subscription material, or response body. The literal variable name `GITHUB_TOKEN` may appear only in the closed reconciliation CLI contract, the exact Task 3 preflight, protected-inventory absolute-`steps[0]` recheck, and the publish authorize/publish/attest/postverify step-level workflow contracts and static tests; its value is never written, logged, emitted, persisted, placed in an artifact, copied into a fixture, or forwarded through a job output.
- identity_impact is false for the main source PR. The source contracts do not change a runtime principal, protected usage map, material binding, or collector identity resolution. A later credential bootstrap is a separate Risk A operation and does not change this source-only declaration.

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

The table is the future complete provider order only. It grants no current authorization. The complete order cannot enter row 0 because Foundation eligibility is unavailable, and Source Tasks 1-9 are all dormant. The only current source exception is the separate predecessor plan's exact 11-file authority-bootstrap inventory listed above; it may reach review of its own source-only Draft, which must remain Draft, and it cannot be counted as progress through any table row. No Source task, first main-source push/PR handoff through this plan, Ready/Merge, reconciliation, or G1-G9 is reachable. The complete order may resume only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded; even then Task 9 would leave the one main PR Draft for the master program's separately authorized Ready/Merge decision.

### Interleaved Task-Level Dependency Graph

Task numbers are stable ownership labels, not execution order. The graph below is the frozen future complete provider/consumer sequence, not a current execution grant. In that future sequence, Integration Task 2 precedes Artifact Tasks 1-2; Host Task 11A contributes both the closed broker and branded inventory-reader pair before Bootstrap consumes either; Integration Task 1 precedes Host Task 14A because the installer consumes the final manifest validator; Task 14A precedes Integration Task 3; and Integration Task 3 precedes Host Task 14B as the mandatory stop-before gate. Currently the sequence cannot establish Foundation eligibility or reach any Source Task 1-9. It may resume only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded.

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

Only after the four-prerequisite Source-resumption gate restores the complete provider order, the complete matrix passes, the main PR receives a separately authorized Ready/Merge decision, and that PR actually merges:

1. A separate mandatory C-tier source-state reconciliation PR binds the exact main source PR number, head SHA, and merge SHA in the canonical fixed-path identity record and records only that the source capability exists, is unconfigured, and is not deployed. No G1-G9 operation begins before that PR merges and exact GitHub readback validates the record.
2. External G1-G9 work proceeds only through separately approved Risk A Gates described in the handoff section below.
3. A separate production-attempt closeout updates durable state only after a verified terminal receipt. The main source PR body states only `Production status: not_deployed`; the first real Deploy Note is a bounded merged-PR comment written after G9 evidence exists and never edits the PR body.

## File Structure

### Shared dependencies consumed from the other plans

- server/services/deployment/canonical-json.mjs: parseCanonicalJsonBytes, serializeCanonicalJsonBytes, sha256Hex.
- server/services/deployment/control-plane-transport-contract.mjs: owner exports `BOOTSTRAP_ACTIVATION_OPERATION_MAX_MS = 900_000`, `BOOTSTRAP_ACTIVATION_AUTHENTICATED_DEADLINE_MS = 910_000`, and `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS = 925_000`; Integration imports only the request-timeout constant for G3. `createSecureSshTransport({ native, clock, secretMaterializer }) -> { execute, request, requestStatusBundle, requestBootstrap, close }` has that exact frozen key order, fixed method-specific credential IDs, one lazy `materializeFixedCredential(credentialId)` call per lifecycle, an internal sealed credential capture, per-operation owned clones, and idempotent close. For activation only, `requestBootstrap` privately validates/consumes `bootstrap_activation_ready_v1`, enforces the owner deadlines, and exposes only the terminal response; compatibility inventory retains its single-response 10,000-ms path.
- server/services/deployment/control-plane-host-protocol.mjs: Bootstrap-owned `encodeNormalInventoryRequestFrame`/`validateNormalInventoryResponseFrame`, `encodeCompatibilityInventoryRequestFrame`/`validateCompatibilityInventoryResponseFrame`, and `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame` are three disjoint ABIs. The activation encoder accepts exactly `{ requestId, activationId, activationRecordSha256, bootstrapActivationGateReceiptSha256, operationEnvelopeBytes }`; its validator accepts only `(responseBytes, { requestId, activationId })` and returns the exact ordered `{ type, requestType, requestId, activationId, activationState, terminalResultSha256 }`. Ordinary deployment status keeps `encodeStatusRequestFrame`/`encodeStatusResponseFrame`/`validateStatusResponseFrame` with `status_response_v1`/request-ID binding; `createPostRecoveryStatusRequest({ validatedRecoveredStatus, requestId })` is the only recovery-to-ordinary bridge; `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs }) -> frozen { bytes, sha256 }` owns one authenticated `requestStatusBundle` session, 768-byte raw chunks, a 262144-byte bundle maximum, at most 342 chunks, and a 2048-byte response-envelope maximum; recovery keeps `validateRecoveryChallengeResponse` and `validateRecoveredStatusResponse`. Integration consumes each Bootstrap codec and the bounded terminal-bundle reader as opaque abstractions and never implements a chunk loop, chunk codec, bundle parser, brand conversion, or field alias.
- server/services/deployment/control-plane-host-inventory-readers.mjs: Host-owned sole exports `createControlPlaneHostInventoryReaders(deps)` and `assertControlPlaneHostInventoryReaders(value)`. The factory returns the private-WeakSet-branded exact frozen `{ normalInventoryReader, compatibilityInventoryReader }`, each an exact frozen `{ read(request) }`. Normal `read` accepts only Bootstrap-decoded `{ type: 'inventory_normal', requestId, inventoryGateId, sourceCommit }`; compatibility accepts only `{ type: 'inventory_compatibility', requestId, compatibilityInventoryGateId, sourceCommit, activationId, hostBundleContentReceiptSha256 }`. Each returns only the matching Bootstrap response-encoder value with echo bindings, `observedAt`, `inventoryEvidenceSha256`, and canonical `inventoryEvidenceBytesBase64` whose decoded bytes are at most 768; compatibility constant-time-compares the fixed armed activation evidence but neither reader selects/opens a path/resource or mutates. Integration never recreates a Host reader, evidence encoder, path/resource selector, or mutation route.
- server/services/deployment/control-plane-host-bundle-installer.mjs: Host-owned `createControlPlaneHostBundleInstaller(deps) -> { installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding }) }` is the only G1a static-content installation/readback entry point. Integration owns the input manifest/content validation but never creates a second stager or calls this source API before a fresh post-merge G1a Gate.
- server/services/deployment/database-contract.mjs: canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 } plus the sole frozen `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT`; inventory calls only the canonicalizer for normalization/bytes and installs the exact descriptor object unchanged in its parent contract, without reading/copying its field order or importing the private root contract.
- server/services/deployment/control-plane-required-check-contract.mjs: executable REQUIRED_CHECK_CONTRACT and REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts, canonicalizeRequiredCheckContracts, and validateRequiredCheckRunObservations; it imports Foundation serializeCanonicalJsonBytes/sha256Hex, serializes only the one-field root contract, and Artifact imports this Integration-owned provider rather than defining a contract or serializer.
- server/services/deployment/control-plane-required-check-registry.mjs: sole export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns, workflowRuns })`; its module-private semantic/context policy plus closed check-suite-to-workflow-run evidence produce the one canonical Task 2 eight-field identity array without synthesizing producer identity.
- server/services/deployment/control-plane-inventory-attestation-predicate.mjs: sole export INVENTORY_ATTESTATION_PREDICATE_CONTRACT; the typed opaque-data producers consume this dependency leaf without redefining it, and a future separately approved full Artifact publisher may consume the same object while the current dormant owner reads none of it.
- scripts/control-plane-bootstrap-root.mjs: Bootstrap-owned `createBootstrapRootLauncher({ native, machine, systemdBroker, clock }) -> { run(operationEnvelopeBytes, { onAuthorized }) }`; only the Bootstrap activation protocol handler may invoke it for G3 after decoding the exact owned operation-envelope bytes and creating its fixed callback, and Integration never imports it into an inventory CLI or exposes a command/unit/path selector.
- scripts/control-plane-bootstrap-operation.mjs: the no-argument, no-stdin bootstrap cgroup operation that reads the fixed active lease plus immutable activation record and revalidates journal, expiry, and installed digest before rotation.
- scripts/github-immutable-release-publisher.mjs: inspectImmutableAssetAttestationPair and publishImmutableAssetAttestationPair, both requiring the exact attestationIdentity object.
- scripts/control-plane-production-gate.mjs: parseProductionGateId, createProductionGateReceipt, validateProductionGateReceipt.
- scripts/control-plane-deployment-plan.mjs: computeDeploymentPlanTemplateSha256, materializeDeploymentPlan, validateDeploymentPlanBytes.
- scripts/control-plane-host-integration.mjs: CONTROL_PLANE_HOST_INTEGRATION_SCENARIOS, runControlPlaneHostIntegrationScenario, runAllControlPlaneHostIntegrationScenarios.
- server/services/deployment/control-plane-receipt-contract.mjs: validateHostTerminalReceiptBytes, validateHostTerminalRecord, validateHostCloseoutRecord, mapHostFinalStateToControllerResult.
- server/services/deployment/control-plane-controller-closeout.mjs: buildControllerCloseout, validateControllerCloseoutBytes, classifyControllerCloseout, buildActionsArtifactObservation, CONTROLLER_FINAL_STATUS_CONTRACT, buildControllerFinalStatus, inspectControllerFinalStatus, and validateControllerFinalStatus.
- server/services/deployment/control-plane-controller-closeout-adapter.mjs: createControllerCloseoutAdapter with Receipt-owned no-claim bytes, complete transport-envelope validators, immutable Actions observation wrapper, and no final-status writer.
- server/services/deployment/control-plane-receipt-recovery.mjs: recovered-closeout builders and validators.
- server/tests/helpers/control-plane-deployment-fixtures.mjs: synthetic release, database, workflow, receipt, and fault fixtures.

### Files created by this plan

- schemas/control-plane-main-source-identity-v1.schema.json
- server/services/deployment/control-plane-main-source-identity.mjs
- scripts/control-plane-main-source-identity.mjs
- scripts/check-control-plane-main-source-identity-history.mjs
- .github/workflows/control-plane-main-source-identity-governance.yml
- server/tests/control-plane-main-source-identity.test.mjs
- server/tests/control-plane-main-source-identity-history.test.mjs
- server/tests/control-plane-main-source-identity-governance-workflow.test.mjs
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

- scripts/check-project-state.mjs: if the fixed main-source identity file is absent, preserve the main-PR pre-reconciliation success path; if present, read bounded bytes and call only the owner validator without copying its schema or performing live GitHub discovery.
- server/tests/project-state-check.test.mjs: prove both the allowed missing-instance main-PR state and owner-validated present-instance state, including malformed/non-canonical rejection.
- package.json: add exactly one networkless source-integration command.
- schemas/README.md: index the inventory receipt schema as source contract only.
- docs/GITHUB_DEPLOYMENT_RUNBOOK.md: add the source/production authority split, workflow roles, G1-G9 operator sequence, failure stops, and Deploy Note evidence boundary.
- RELEASE_MANIFEST.md: document durable deployment companions while preserving Artifact Manifest v1 and production_state: not_deployed.
- docs/VALIDATION_BASELINE.md: add the source-integration, clean-Linux, exact-head, and no-secret validation matrix.
- docs/README.md: index the approved design, six implementation plans, updated runbook, and inventory schema authority.

### Adjacent owner files verified but explicitly not modified by this plan

- Artifact Task 10 owns `.github/workflows/control-plane-compatibility-artifact-gate.yml` and its test. Artifact Task 11 solely owns `server/services/deployment/control-plane-production-controller.mjs` and `scripts/control-plane-production-controller.mjs`; Task 12 owns `.github/workflows/japan-control-plane-production-deploy.yml`; Task 13 owns `scripts/control-plane-deploy-note.mjs` and the isolated bounded-PR-comment tests/wiring. Integration Task 6 verifies those exact committed bytes and real tests without modifying, staging, recommitting, or wiring around any Artifact-owned file.

### Files explicitly excluded from the main source PR

- docs/CURRENT_RELEASE_STATE.md
- docs/PROJECT_CONTEXT.md
- project-state/current.json
- project-state/tasks.json
- project-state/lanes.json
- project-state/gates.json
- project-state/control-plane-main-source-identity.json
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

### Main source PR identity

`server/services/deployment/control-plane-main-source-identity.mjs` is the sole owner and exports:

~~~js
export const MAIN_SOURCE_IDENTITY_PATH = 'project-state/control-plane-main-source-identity.json';
export const MAIN_SOURCE_IDENTITY_CONTRACT = Object.freeze({
  schemaId: 'control-plane-main-source-identity-v1',
  maxBytes: 4_096,
  fieldOrder: Object.freeze([
    'schemaVersion', 'repository', 'mainSourcePrNumber',
    'mainSourceHeadSha', 'mainSourceMergeCommitSha'
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== '1'
        || value.repository !== 'gccwebos-com/proxy-gateway-minimal'
        || !Number.isSafeInteger(value.mainSourcePrNumber)
        || value.mainSourcePrNumber < 1
        || !/^[0-9a-f]{40}$/.test(value.mainSourceHeadSha)
        || !/^[0-9a-f]{40}$/.test(value.mainSourceMergeCommitSha)) {
      throw new Error('main_source_identity_invalid');
    }
  }
});
export function validateMainSourceIdentityRecordBytes(bytes) {}
export async function createMainSourceIdentityRecord({
  pullRequestNumber, token, fetchFn
}) {}
export async function writeMainSourceIdentityRecordCreateMissingOnly({
  bytes, fsOps
}) {}
export async function resolveMainSourceIdentity({
  bytes, expectedSourceCommit, token, fetchFn
}) {}
export function assertValidatedMainSourceIdentity(value) {}
~~~

`validateMainSourceIdentityRecordBytes(bytes)` is the only pure parser/validator for the canonical instance. It accepts bounded exact canonical bytes only and returns frozen `{ value, bytes, sha256 }`; no checker or consumer may copy its fields, call `JSON.parse` for this record, or weaken its canonical-byte checks. The creator accepts only one positive PR number, fixes repository identity internally, performs its own exact GitHub merged-PR GET through the injected HTTP boundary, and returns the same canonical wrapper; no current-master field is serialized, so the later reconciliation merge cannot create a digest loop.

`writeMainSourceIdentityRecordCreateMissingOnly({ bytes, fsOps })` first invokes the owner validator and always targets only `MAIN_SOURCE_IDENTITY_PATH`; it accepts no path or overwrite option. It creates a missing regular file with exclusive create semantics and exact readback. If the file already exists, byte-identical canonical content returns the closed idempotent `already_exact` outcome without rewriting, truncating, renaming, deleting, or changing metadata; any conflicting, malformed, symlinked, oversized, or unreadable existing content fails closed and remains untouched. A create/readback race or post-create byte mismatch is also a stop.

The main source PR also lands `scripts/check-control-plane-main-source-identity-history.mjs` and the dedicated base-owned `pull_request_target` workflow `.github/workflows/control-plane-main-source-identity-governance.yml`. The workflow has only `contents: read`, checks out the exact protected base and exact candidate SHA with credentials disabled, first proves the candidate has byte-identical regular-blob copies of the base workflow and history checker, then runs only the trusted base checker over the fixed identity path. Base-absent/head-absent is the main-PR state; base-absent/head-present permits the one canonical `100644` first add; once base contains v1, head must retain the exact same `100644` blob bytes. Delete, symlink/mode/type drift, malformed first add, or a different yet canonical PR/head/merge record fails. The reconciliation and every later PR must show this exact `Control-plane main-source identity history` check successful before Ready/Merge. A future source origin adds a separately designed versioned path/workflow while this v1 path, checker, workflow, and blob remain immutable.

The public resolver accepts only canonical bytes, the later `expectedSourceCommit`, and the HTTP credential/boundary. It derives and performs the fixed `GET /repos/gccwebos-com/proxy-gateway-minimal/pulls/{mainSourcePrNumber}` itself, byte-compares repository/number/head/merge, requires merged state and protected-master base, then derives and performs the fixed `GET /repos/gccwebos-com/proxy-gateway-minimal/compare/{mainSourceMergeCommitSha}...{expectedSourceCommit}` itself. Only `identical` or `ahead` with exact endpoint base/head SHAs succeeds. The module signs that exact successful wrapper in a private brand accepted by `assertValidatedMainSourceIdentity`; callers cannot provide repository, route, URL, PR object, compare object, live metadata, search result, status, base/head identity, or brand. Clones, lookalikes, path overrides, redirects outside `api.github.com`, divergent/behind comparisons, or discovery by deployment `sourceCommit` reject.

`scripts/control-plane-main-source-identity.mjs record --pull-request <positive-integer>` is a post-merge C-tier reconciliation helper only. It exports the real dependency-injected `main({ argv, env, fetchFn, fsOps, stdout, stderr })` used by tests and has one direct-main guard that invokes that same function for the real CLI entry. Its complete argv grammar is exactly `record --pull-request <positive-integer>`: missing values, duplicate `record`/`--pull-request`, reordered or repeated operands, positional extras, `--token`, `--path`, overwrite/replace flags, and every unknown flag exit before fetch or filesystem access. The direct entry reads only `env.GITHUB_TOKEN` and passes it only to the owner creator's fixed read-only GitHub PR GET; this is a GitHub API read credential, not a production, host, deployment, or customer credential. It accepts no credential through argv/stdin/config, never enumerates or prints `env`, and never passes the token to `fsOps`, the writer, stdout, stderr, a receipt, or an output file.

The direct-main fetch boundary fixes `https://api.github.com`, repository `gccwebos-com/proxy-gateway-minimal`, one `GET /repos/gccwebos-com/proxy-gateway-minimal/pulls/{positivePrNumber}`, redirects disabled, bounded response bytes, and the owner creator's exact merged/protected-master validation. Its direct-entry filesystem boundary fixes only `MAIN_SOURCE_IDENTITY_PATH` and delegates to `writeMainSourceIdentityRecordCreateMissingOnly`; test injection cannot change the direct-main path or add an overwrite primitive. The CLI calls the owner creator, then the owner create-missing-only writer, then independently re-reads and owner-validates the fixed file before reporting success. Missing content uses exclusive create and exact readback; byte-identical canonical existing content is the zero-write `already_exact` success; conflict, malformed bytes, symlink/type drift, history-retarget evidence, or readback mismatch is a no-mutation stop. The CLI contains no PR parser, second serializer, truncate, rename, delete, chmod, or path-selection implementation.

Exit and output behavior is closed and bounded: exit `0` emits one LF-terminated safe status line containing only `created|already_exact` and the canonical SHA-256; exit `2` emits only `main_source_identity_cli_usage_invalid`; exit `3` emits only `main_source_identity_github_credential_missing`; every bounded fetch, validation, conflict, filesystem, or readback failure exits `1` with only `main_source_identity_reconciliation_failed`. Stdout and stderr are each at most one 256-byte line, never include a URL, path, response body, exception text, environment value, or token, and success is reported only after final byte-exact readback. The helper performs no GitHub write, workflow dispatch, Release operation, host access, or production mutation. The main source PR ships it but never runs it or commits an identity instance. `scripts/check-project-state.mjs` imports only `MAIN_SOURCE_IDENTITY_PATH` and `validateMainSourceIdentityRecordBytes`: missing fixed-path identity is valid for the main PR, while presence requires bounded read plus successful owner validation. Artifact Gate and production preflight later import the live owner resolver and fixed path; they do not parse the record, accept caller-provided GitHub metadata, or discover a PR locally. Among identity implementation artifacts, the reconciliation PR adds only the canonical instance because all checker, trusted-history workflow, and owner code already landed in the main PR; its separately enumerated docs/state edits remain truthful merged/`not_deployed` records only.

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
      if (!/^refs\/heads\/[a-zA-Z0-9](?:[a-zA-Z0-9._\/-]{0,198}[a-zA-Z0-9_-])?$/.test(value.workflowRef)
          || value.workflowRef.includes('..') || value.workflowRef.includes('//')) throw new Error('required_check_workflow_ref_invalid');
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

Each identity object has those eight fields and no others. integrationId is a positive integer read from the active protected-master ruleset and must equal the stable check projection's positive integrationId; appSlug must equal that same projection's appSlug. canonicalizeRequiredCheckContracts first validates the input array shape, makes frozen exact-field item copies, sorts only by the closed tuple semanticRole/context/integrationId/appSlug/sourceKind/workflowPath/workflowRef/workflowSha, enforces duplicate/context/role invariants, and then calls the Foundation serializer exactly as `serializeCanonicalJsonBytes({ requiredCheckContracts: sorted }, REQUIRED_CHECK_ARRAY_CONTRACT)`. It returns a frozen `{ requiredCheckContracts: sorted, bytes, sha256 }`; sha256 is the Foundation sha256Hex of the exact domain prefix `control-plane-required-check-contracts-v1\0` concatenated with bytes. validateRequiredCheckContracts reuses that exact canonicalizer and returns only its frozen sorted array. Neither function invokes a native JSON encoder, owns an alternate field walker, or serializes a bare array.

The executable contracts and canonicalizer reject missing or unknown root/item fields, deep object-key permutations only by producing identical bytes, sparse arrays, duplicate contexts, duplicate semantic roles, duplicate identity tuples, missing validate/codeql roles, nullable/non-positive integrationId, inapplicable non-null workflow fields, unknown sourceKind, tuple drift, fewer than two or more than 64 entries, and any Foundation size/canonicality failure.

validateRequiredCheckRunObservations consumes a separate runtime-only array whose exact fields are `checkRunId`, `checkSuiteId`, `workflowRunId`, `context`, `integrationId`, `appSlug`, `headSha`, `status`, `conclusion`, `detailsUrl`, `workflowPath`, `workflowRef`, and `workflowSha`. Workflow producer fields are canonical null only for `github_default_setup`; a `workflow` identity requires positive unique suite/run IDs and exact equality with the owner-resolved workflow fields. It requires positive unique check-run values, exact context/integrationId/appSlug matches against every identity, the bound 40-hex sourceCommit, completed/success, no missing or extra required identity, and no duplicate or drifting observation. Runtime fields are never accepted by validateRequiredCheckContracts, never stored in either inventory receipt, and never used as a replacement for the eight-field identity. Artifact imports REQUIRED_CHECK_ARRAY_CONTRACT plus the validator/canonicalizer from this module; it may not define REQUIRED_CHECK_ARRAY_CONTRACT locally.

schemas/control-plane-required-check-contract-v1.schema.json is the single schema authority for the exact eight-field identity. Both inventory schemas reference it for requiredCheckContracts items, and no consumer repeats those item properties.

`server/services/deployment/control-plane-required-check-registry.mjs` has exactly one export:

~~~js
export function resolveControlPlaneRequiredCheckContracts({
  sourceCommit,
  rulesetRequirements,
  checkRuns,
  workflowRuns
}) {}
~~~

The module owns one non-exported, frozen semantic/context policy. Each private row contains only `semanticRole`, `context`, `sourceKind`, and, for a workflow row, `expectedWorkflowPath`; it contains no returned `workflowPath`, `workflowRef`, or `workflowSha` value. `github_default_setup` requires all three workflow fields to canonical `null`. The private policy contains each supported protected-master context exactly once and exactly one `validate` plus one `codeql` role. It never contains `integrationId`, `appSlug`, a check-run/suite/run ID, status, conclusion, source SHA, workflow ref/SHA, or a production App guess.

`resolveControlPlaneRequiredCheckContracts` accepts exactly the four named keys, validates one 40-hex `sourceCommit`, a complete closed ruleset-requirement snapshot, a complete closed exact-head check-run projection, and the complete closed Actions workflow-run projection for that head. Each check row has exactly `{ checkRunId, checkSuiteId, context, integrationId, appSlug, headSha, status, conclusion, detailsUrl }`; each workflow-run row has exactly `{ workflowRunId, workflowId, checkSuiteId, repository, headSha, headBranch, event, path, runAttempt, status, conclusion }`. Raw REST rows and snake_case aliases reject. For every policy row it requires exactly one ruleset row and exactly one successful check projection whose context, positive integrationId, appSlug, and headSha agree. A `workflow` row additionally requires exactly one successful workflow projection with the same check-suite ID, repository and head SHA; copies `workflowPath` only from that row's byte-preserved observed `path`; derives `workflowRef` only as `refs/heads/<observed headBranch>` after safe-ref validation; requires the path to equal `expectedWorkflowPath`; and copies `workflowSha` only from the joined row's observed `headSha`. REST is never claimed to return a separate workflow-ref or workflow-SHA field. `github_default_setup` requires canonical-null workflow fields; unrelated workflow rows whose suites do not produce a required check are validated for uniqueness/bounds but do not become identities. It rejects a missing/ambiguous producer, duplicate run/suite IDs, suite reuse among required checks, nullable/non-positive identity, wrong head/repository, non-completed/non-success, ambiguous names, producer path/branch/head/event drift, and any policy/required-live cardinality mismatch. It builds exact eight-field objects in `REQUIRED_CHECK_CONTRACT.fieldOrder` and returns the exact frozen `{ requiredCheckContracts, bytes, sha256 }` object from `canonicalizeRequiredCheckContracts(...)` without wrapping, copying, serializing, or re-hashing it. A same-context check under the same GitHub Actions App but produced by another workflow/check suite therefore fails. Protected-master inventory/Artifact/production consumers additionally require observed `headBranch === 'master'`, `workflowRef === 'refs/heads/master'`, and `workflowSha === sourceCommit`; a premerge PR-head result retains its observed branch and is review evidence only, never byte-equal master Gate evidence. This is the only semantic/producer-to-identity resolver in the repository. Artifact, inventory preflight, and Task 9 import it; none owns a second registry, context-to-role switch, identity array, canonicalizer, or workflow identity fallback.

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

Its validator requires schema control_plane_inventory_attestation_v1; repository gccwebos-com/proxy-gateway-minimal; inventoryType exactly control_plane_normal_inventory_receipt or control_plane_compatibility_inventory_receipt; the matching fixed normal/compatibility inventory workflowPath; workflowRef exactly gccwebos-com/proxy-gateway-minimal/{workflowPath}@refs/heads/master; workflowSha equal to sourceCommit; a safe runtimeContractId; and 64-hex inventoryReceiptSha256 plus requiredCheckContractsSha256. Unknown fields, wrong key order, values over 16384 canonical bytes, a cross-type workflow, or a copied/local contract reject. The opaque-data producer builds predicateBindings only from the validated receipt, the receipt digest, and canonicalizeRequiredCheckContracts(...).sha256 and freezes them. A future separately approved full Artifact protected-publisher owner may pass that same object to generic inspection and publication; the current dormant publisher reads neither it nor any other input.

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
import {
  DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT,
  canonicalizeDatabaseContracts,
} from './database-contract.mjs';

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

Both receipt creators call canonicalizeDatabaseContracts exactly once, attach only its databaseContracts and sha256, and retain its bytes for comparison. Each normal/compatibility executable receipt contract installs the identical frozen `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT` under the fixed nested registry key and uses the matching array descriptor before calling the Foundation serializer. On parse, inventory, release declaration, and deployment plan each call the helper independently, compare Buffer bytes with bytes.equals, and bind the returned sha256; none imports the private root contract, reads/spreads/clones the public descriptor, repeats item properties/order/conditionals, calls JSON.stringify for equality, or independently reconstructs the pair. Every other structured inventory field likewise has one explicit owner child contract or primitive-array descriptor; `nested: {}` or `arrays: {}` is forbidden when the parent field order contains an object or array.

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

The remote Bootstrap handler validates the activation frame, decodes its owned exact operation-envelope bytes, creates the fixed no-argument readiness callback, and invokes only `createBootstrapRootLauncher(...).run(operationEnvelopeBytes, { onAuthorized })`; no Integration-owned launcher, command, path, unit, or mutation selector exists. Before any CAS or mutation, Bootstrap completes current-record, Gate, expiry, principal, and fence readback and writes its owner-internal canonical `{ type: 'bootstrap_activation_ready_v1', requestId, activationId }` frame. `requestBootstrap` consumes that ready frame internally and returns only the terminal response used above; Integration never constructs, receives, parses, retries, or treats ready as terminal. A ready write failure or disconnect before ready produces zero mutation. Once a valid ready has been consumed, a caller disconnect, timeout, or launcher crash converges only through the existing durable activation cleanup/recovery path. Wrong, duplicate, or cross-bound ready fails closed without refreshing any absolute deadline. A G2 `activationId`, response, receipt, materialization, transport capture, or approval binding is structurally ineligible for G3. The current dormant publisher and any future separately approved compatibility Artifact publication never call any transport method.

Bootstrap alone fixes the activation operation maximum at 900,000 ms, the authenticated transport/relay deadline at 910,000 ms, `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` at 925,000 ms, and the activation protocol unit `RuntimeMaxSec=930`; Integration supplies only the imported 925,000-ms request-timeout constant and does not restate a numeric timeout in executable consumer code. A valid operation taking more than 10,000 ms and at most 900,000 ms must succeed. Compatibility inventory stays on its disjoint exact 10,000-ms single-response path and rejects any activation-ready frame.

The only accepted result shape is:

~~~js
Object.freeze({
  exitCode: 0,
  responseBytes,
  diagnosticCode: null
});
~~~

On the first protected operation of a transport lifecycle, the transport requires every Foundation native capability probe field to be true, locks the validated fixed credential ID, calls only that one `materializeFixedCredential` ID, and copies those returned bytes into its private sealed capture. Each operation receives only fresh owned clones; its own finally zeroes/closes them. A later operation using a different credential ID or the opposite bootstrap/deploy family rejects before a clone; deploy `execute`, `request`, and `requestStatusBundle` remain compatible within the one deploy lifecycle. The Bootstrap materializer internally resolves the sole armed, unexpired activation. An `activationId` inside canonical request bytes is evidence binding only and cannot select, override, or address protected material. A false/unknown probe yields a fixed safe diagnostic, performs zero materializer calls, and never reads or receives host, port, user, private-key, known-hosts, or activation selectors from the caller. `close` is idempotent, destroys the capture, and makes `execute`, `request`, `requestStatusBundle`, and `requestBootstrap` reject `transport_closed`.

Every single-response envelope is capped at 2048 bytes. Normal inventory accepts only `validateNormalInventoryResponseFrame` with its exact request ID, response type, source binding, and aggregate inventory record ID. Compatibility inventory accepts only `validateCompatibilityInventoryResponseFrame` with its exact request ID, response type, source/activation/content-receipt binding, and aggregate compatibility record ID. G3 accepts only `validateBootstrapActivationResponseFrame` with its newly approved activation binding and root-launcher result. All three cross-reject. Neither inventory accepts `status_response_v1`, the private sixteen-field deployment status, a terminal-bundle frame, an ACK, activation response, or recovery response. Final deployment status and recovery retain their separately branded ordinary-status and recovery validators. Nonzero exit yields only a fixed `diagnosticCode`; raw stderr is never returned.

scripts/control-plane-readonly-inventory.mjs accepts no argv. Its imported main({ stdout, stderr, native, clock, githubEvidence, secretMaterializer }) is dependency-injected in tests. The production entry point passes only the fixed credential ID, never reads raw transport variables, performs one materializeFixedCredential call followed by one normal-inventory request after capability proof, validates only the normal-inventory response, closes its transport in finally, emits exactly one canonical aggregate receipt line on stdout, and emits only a fixed safe code on stderr. Any argv exits 2 before capability probing or materialization.

scripts/control-plane-compatibility-readonly-inventory.mjs also accepts no argv or stdin. Its imported main receives the G2-only approved activation evidence through a closed workflow adapter, places its `activationId` and `hostBundleContentReceiptSha256` only in the canonical compatibility-inventory binding, performs one `materializeFixedCredential` call followed by exactly one `requestBootstrap` call with the fixed `japan-control-plane-github-bootstrap-v1` credential ID, validates only the compatibility-inventory response, and closes that separate transport in finally. The remote Bootstrap request parser passes only its exact decoded request to Host's branded `compatibilityInventoryReader.read(request)`; the normal route analogously uses only `normalInventoryReader.read(request)`. Both reader sets must first pass `assertControlPlaneHostInventoryReaders` and neither Integration CLI recreates or directly accesses their host evidence. The compatibility CLI emits only compatibility receipt bytes, cannot resolve or publish a normal Inventory Gate, and cannot emit or validate a G3 activation frame.

### Inventory publisher and workflow

scripts/control-plane-inventory-receipt-publisher.mjs is an inventory-side opaque-data producer, not a workflow publisher or CLI. It exports two non-interchangeable, networkless entry points:

~~~js
export function buildNormalInventoryPublicationInput({
  receiptBytes
}) {}

export function buildCompatibilityInventoryPublicationInput({
  receiptBytes
}) {}
~~~

Each entry point validates only its own typed bytes, constructs one immutable attestationIdentity, and returns only bounded canonical `publicationInputBase64`, `publicationInputSha256`, and that identity for local tests. The workflow exports only the first two as job outputs. The normal adapter fixes workflowPath to .github/workflows/japan-control-plane-readonly-inventory.yml; the compatibility adapter fixes it to .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml. Both derive workflowRef as gccwebos-com/proxy-gateway-minimal/{workflowPath}@refs/heads/master, require workflowSha and sourceCommit to equal the validated receipt sourceCommit, and fix predicateType to https://slsa.dev/provenance/v1. No caller may supply or override any identity field, route, publisher, token, fetch boundary, attestor, Release, asset, or subject.

~~~js
const attestationIdentity = Object.freeze({
  workflowPath: fixedWorkflowPath,
  workflowRef: `gccwebos-com/proxy-gateway-minimal/${fixedWorkflowPath}@refs/heads/master`,
  workflowSha: receipt.sourceCommit,
  sourceCommit: receipt.sourceCommit,
  predicateType: 'https://slsa.dev/provenance/v1'
});
~~~

The object key order is exactly workflowPath, workflowRef, workflowSha, sourceCommit, predicateType. The producer computes receiptSha256 and its disjoint future Release/asset identity and places the owner-validated receipt, exact identity, and Task 2 predicate bindings in opaque canonical bytes. It performs no GitHub read/write and cannot attest. The current no-checkout `publish` job does not consume those bytes: each exact Artifact-owner inline body stops on its first statement with `artifact_inventory_publisher_owner_unavailable`, and attest is always skipped. The real fixture proves zero input read, GitHub method, Release/attestation call, filesystem/output write, and completion result. Only a later separately reviewed and approved activation may replace the dormant owner bytes with the full Artifact protected-publisher bytes, independently hash/parse/recheck the opaque input, publish exactly one normal or compatibility pair, attest it, and run `verify_complete`; wrong identity or predicate would then remain a pre-write failure. A generic mode, caller prefix, repository code path, alternate publisher, or activation inside this plan is forbidden.

~~~js
{
  publicationInputBase64,
  publicationInputSha256,
  attestationIdentity
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

.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml is separately manual-only and accepts exactly `compatibility_activation_id` plus confirmation `inventory japan control-plane compatibility`. The activation ID must have been created by the fresh separately approved G2 Settings/provider Gate for this read-only attempt and must byte-equal the fixed `vultr-japan-compatibility-inventory` variable; it is not a deploy credential, never activates a bundle, and is never reusable as the G3 activation ID, approval binding, or material capture. The workflow cannot run until that Environment's exact policy—one non-self canonical `type:"user"` reviewer with stable decimal ID, normalized login, and `slug:null`, no Team/unknown reviewer, plus no-bypass/self-review protection—five secret names, five variable names, expiry, and host-side ephemeral-key binding have been independently read back by the separately approved Settings/provider Gate. Runtime does not trust that prose or prior readback: preflight records Source's packet containing Artifact-owner canonical policy/preapproval bytes, and the protected inventory job's absolute `steps[0]` runs the fixed workflow-owned fresh authority body before checkout, action code, or any of the ten protected names. Only a successful same-run exact-user recheck permits exact-S credential-disabled checkout, tokenless thin owner-data validation, and later materialization. The current dormant publisher produces no receipt; any future separately approved published read-only receipt would not waive the mandatory external removal/readback closeout before G3.

Both workflow documents deep-equal the closed root grammar before job inspection: exact ordered keys `name,on,permissions,concurrency,jobs`; no root `defaults` or `env`; and no extra, differently cased, duplicated, anchored, aliased, or merged key. This root closure is part of the authority boundary, because otherwise `defaults.run.shell`, `defaults.run.working-directory`, or root environment injection could alter `steps[0]` or later inline controls while every locked job block remained textually unchanged.

Jobs are capability-separated:

1. preflight has read-only GitHub metadata, no Environment, no secret, no OIDC, and verifies direct current master plus `run_attempt == 1`. Its one token-bearing adapter calls Artifact Task 6's sole `readEnvironmentPolicy`/preapproval evidence owner, consumes that owner's canonical bytes/digests unchanged, and transfers only two Source packet pairs as data-only job outputs: the fixed inventory-Environment packet bytes/SHA-256 and the fixed `artifact-publication` packet bytes/SHA-256.
2. after GitHub grants the fixed Environment approval, the inventory job's absolute `steps[0]` is the fixed workflow-owned fresh authority body. It is a bare inline `run` body with one explicit step token and only closed run/Environment/policy-packet inputs; no action, checkout, download, setup, local/repository action, repository script, implicit/default action token, secret, variable, materializer, or protected output is evaluated first. It byte-compares the fresh policy to preflight, proves a current same-run approval and exact `/users/{login}` stable user distinct from both actor identities, and returns only safe canonical accepted data. `actions/checkout` cannot move ahead of this gate: `persist-credentials: false` prevents credential persistence in the resulting Git configuration but does not stop checkout itself from consuming its default token to fetch source. Only after successful `steps[0]` may a pinned exact-S credential-disabled checkout and tokenless thin Artifact-owner data adapter run; only after both succeed may compatibility inventory map its exact five secrets/five variables and use `vultr-japan-compatibility-inventory`, fresh G2 Bootstrap evidence, and `requestBootstrap` with the fixed `japan-control-plane-github-bootstrap-v1` credential ID and compatibility-inventory codec. Normal inventory symmetrically maps its fixed five-plus-five family and uses `vultr-japan-production` only after G4 plus `request` with the fixed `japan-control-plane-github-deploy-v1` credential ID and normal codec. Each Bootstrap handler consumes the matching method from the one Host-branded inventory-reader provider. Neither job has repository write permission or can reach the G3 activation codec/root launcher. The compatibility job deletes every process-environment copy immediately after capture and cannot report G2 complete until the external provider Gate has removed/read back the Environment values and host key after the run.
3. each isolated publisher fixes `artifact-publication`, has no production/inventory secret, and retains exactly four no-checkout steps: fixed inline authorize at absolute `steps[0]`, fixed inline publish, `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6`, and fixed inline `verify_complete`. The explicit token consumers remain exactly those four in order, but current authorize/publish/postverify owner bodies immediately return only the unavailable stop with zero I/O, and attest has the exact always-false condition, so current OIDC consumption and publication are zero. The job never downloads an artifact or executes `control-plane-inventory-receipt-publisher.mjs`, repository code, or candidate bytes. The happy one-pair path is a future separately approved owner/source replacement, not current behavior.

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

**FUTURE ONLY — CURRENT REACHABILITY: STOP.** This task is outside the separate exact 11-file authority-bootstrap inventory. Every file, interface, code block, test, command, expected result, and commit below is dormant future design: do not create, modify, run, stage, commit, push, open, review as implementation evidence, or report any Task 1 item GREEN under the current authorization.

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

## Task 2: Build main-source identity plus the non-interchangeable inventory receipts and resolvers

**FUTURE ONLY — CURRENT REACHABILITY: STOP.** This task is outside the separate exact 11-file authority-bootstrap inventory. Every file, interface, code block, test, command, expected result, and commit below is dormant future design: do not create, modify, run, stage, commit, push, open, review as implementation evidence, or report any Task 2 item GREEN under the current authorization.

**Files:**

- Create: schemas/control-plane-required-check-contract-v1.schema.json
- Create: schemas/control-plane-main-source-identity-v1.schema.json
- Create: schemas/control-plane-inventory-receipt-v1.schema.json
- Create: schemas/control-plane-compatibility-inventory-receipt-v1.schema.json
- Create: server/services/deployment/control-plane-required-check-contract.mjs
- Create: server/services/deployment/control-plane-main-source-identity.mjs
- Create: server/services/deployment/control-plane-required-check-registry.mjs
- Create: server/services/deployment/control-plane-inventory-attestation-predicate.mjs
- Create: server/services/deployment/control-plane-inventory-receipt.mjs
- Create: server/services/deployment/control-plane-compatibility-inventory-receipt.mjs
- Create: server/services/deployment/control-plane-readonly-inventory.mjs
- Create: server/services/deployment/control-plane-compatibility-readonly-inventory.mjs
- Create: server/tests/control-plane-required-check-contract.test.mjs
- Create: server/tests/control-plane-main-source-identity.test.mjs
- Create: scripts/control-plane-main-source-identity.mjs
- Create: scripts/check-control-plane-main-source-identity-history.mjs
- Create: .github/workflows/control-plane-main-source-identity-governance.yml
- Create: server/tests/control-plane-main-source-identity-history.test.mjs
- Create: server/tests/control-plane-main-source-identity-governance-workflow.test.mjs
- Modify: scripts/check-project-state.mjs
- Modify: server/tests/project-state-check.test.mjs
- Create: server/tests/control-plane-required-check-registry.test.mjs
- Create: server/tests/control-plane-inventory-attestation-predicate.test.mjs
- Create: server/tests/control-plane-inventory-receipt.test.mjs
- Create: server/tests/control-plane-compatibility-inventory-receipt.test.mjs
- Create: server/tests/control-plane-readonly-inventory.test.mjs
- Create: server/tests/control-plane-compatibility-readonly-inventory.test.mjs

**Interfaces:**

- Produce the exact main-source identity schema/module/record CLI frozen above, including its sole canonical byte validator, fixed-path create-missing-only/idempotent-exact writer, internally live-read public resolver, and private brand; update the existing project-state checker/test so a missing fixed identity instance is valid in the main PR and a present instance is delegated only to that owner validator. Produce the dedicated base-owned identity-history checker/workflow and tests: the trusted base must accept only absent/absent, one canonical regular-blob first add, or an exact unchanged existing v1 blob, while also proving its own workflow/checker bytes were not changed by the candidate. Produce the exact executable Foundation shapes for REQUIRED_CHECK_CONTRACT and REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts, canonicalizeRequiredCheckContracts, and validateRequiredCheckRunObservations from the dedicated provider frozen above; produce the separate sole-export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns, workflowRuns })` owner whose private semantic/context policy joins each workflow check to its actual Actions producer by observed check-suite ID and returns that canonicalizer's exact eight-field result; consume Host's exact `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT` object as the only database-array child descriptor; produce the sole-export INVENTORY_ATTESTATION_PREDICATE_CONTRACT dependency leaf; and produce the normal ig1 resolver/receipt and compatibility cig1 resolver/receipt surfaces.
- Freeze stagedHostBundleManifestSha256 and stagedHostBundleContentReceiptSha256 as required 64-hex contract fields, but use only synthetic fixture digests in this task. Consume GitHub required-check evidence, rollback/runtime/writer shapes, canonicalizeDatabaseContracts, and the shared canonical codec; do not read or require Task 1 output.
- Both receipt creators call canonicalizeDatabaseContracts(input.databaseContracts) once and canonicalizeRequiredCheckContracts(input.requiredCheckContracts) once, attach only each provider's canonical value and digest where frozen, and retain each provider's bytes. Their schemas reference the Host-owned database schema root and this task's required-check schema, define no database or required-check item properties locally, and their validators independently call the same helpers. Their executable Foundation parent contracts use Host's unchanged entry embedding descriptor and this task's unchanged REQUIRED_CHECK_CONTRACT as the exact two array child contracts, with explicit descriptors for every other structured field; tests fail before serialization if either registry edge is missing, cloned, renamed, or substituted. Live inventory preflight and Artifact release/plan consumers import `resolveControlPlaneRequiredCheckContracts` plus the contract provider, supply the same twice-read check-run/workflow-run producer snapshot, consume its one returned identity array/bytes/digest byte-for-byte, and never declare a second semantic registry, context switch, identity array, serializer, canonicalizer, or static workflow identity.
- The next scheduled checkpoint is Artifact Tasks 1-2. Artifact Tasks 3-8 consume these typed resolvers later, after Host/Bootstrap providers are present; actual Task 1 digests are first consumed when Task 3/Task 4 fixtures and later external receipts are materialized. Those values do not change this schema or resolver surface.
- Normal requires final bootstrap/authorization/rotation closure; compatibility structurally forbids those fields. Cross-type resolution is always an error.

- [ ] **Step 1: Write failing schema, ID, expiry, and redaction tests**

Cover the canonical main-source identity success in which the later expectedSourceCommit differs from but descends from mainSourceMergeCommitSha; missing/reordered/extra identity fields; zero/noninteger PR number; wrong repository/head/merge; unmerged/wrong-base PR; changed PR body cannot rewrite the closed identity; identical/ahead ancestry success; behind/diverged/missing/ambiguous comparison rejection; direct lookup by later sourceCommit rejection; and fixed-path enforcement. Prove the public resolver itself issues exactly one fixed PR GET plus one fixed compare GET, validates and byte-compares their live response fields, and signs the exact successful object with its private brand; repository/route/URL/PR/compare/status/base/head/live-metadata inputs, search results, clones, and lookalikes are rejected before trust. Prove first create plus exact readback, byte-identical existing-file idempotence with zero write/rename/delete, conflicting or malformed existing bytes failing closed without mutation, create/readback race rejection, and path/overwrite option rejection. Prove `checkProjectState` succeeds when the fixed identity file is absent in the main PR, calls the owner byte validator when it is present, rejects malformed/non-canonical/conflicting content, and contains no copied identity fields or live GitHub lookup. Prove the base-owned history guard accepts main-PR absent/absent, one canonical `100644` first add, and exact unchanged bytes; rejects delete, symlink/mode/type drift, malformed first add, a canonical retarget to another old merged PR, changed checker/workflow bytes, wrong base/head SHA, and any candidate-supplied checker. Also cover both inventory canonical successes; exact ig1/cig1 grammars; disjoint Release/asset derivation; body exclusion of external IDs; createdAt plus exactly two hours; expiry at equality; wrong source/target/type; normal resolver with compatibility bytes and the reverse; unknown fields; duplicate keys; non-canonical bytes; Host-fixture faults swapped, unknown_logical_id, duplicate_physical_hmac, extra_field, wrong_configured_source, third_entry, and lossy_projection; helper sha mismatch; helper byte mismatch across inventory/release/plan; any local database item schema/contract/order list or JSON.stringify equality; missing writer binding; compatibility missing staged content; compatibility containing any final bootstrap/rotation field; normal missing final bootstrap/cleanup/rotation closure; unsafe string; raw path; endpoint-like string; oversized bytes; missing/duplicate Release asset; digest mismatch; attestation mismatch; exact executable required-check item/root contract shapes; missing or unknown fields at both root and item depth; deep key permutations producing identical Foundation bytes; sparse arrays; fewer than two and more than 64 items; missing validate or codeql role; duplicate or omitted ruleset context; nullable/zero/negative/guessed integrationId; wrong appSlug/integrationId/sourceKind; non-null inapplicable workflow field; runtime producer fields embedded in an identity; raw or snake_case check/workflow REST rows passed instead of the exact camelCase projections; duplicate runtime check-run/suite/workflow-run IDs; tuple drift between identity and observation; required-check success for the wrong source SHA; the registry module's sole export and non-exported fixed semantic/context policy; missing/extra/duplicate policy/live contexts; ambiguous App/check-run identity; missing/ambiguous check-suite-to-workflow-run join; same context/App from another workflow; suite reuse; producer repository/path/ref/head drift; non-successful live run; exact resolver return identity with the canonicalizer result; proof that returned workflow fields equal observed producer fields rather than policy constants; any second registry/context switch/identity-array builder; the predicate contract's exact schemaId/maxBytes/fieldOrder and empty nested/arrays; each valid normal/compatibility workflow mapping; workflowSha/sourceCommit mismatch; cross-type workflow; wrong repository/runtime/digests; unknown predicate field; oversized canonical predicate; and a consumer-side copied predicate contract.

For the reconciliation CLI, invoke the exported `main` and the direct-main entry separately. Cover the sole valid argv, missing command, missing `--pull-request`, missing/zero/noninteger value, duplicated command/flag/value, reordered operands, positional extras, `--token`, `--path`, replace/overwrite, and every unknown flag. With `GITHUB_TOKEN` absent, require exit `3`, the one fixed safe error line, and zero fetch/fs calls. With a sentinel token present, require exactly one fixed-origin/fixed-repository read-only PR GET, no redirect, bounded response handling, and prove by complete stdout/stderr/fsOps/output-byte inspection that the sentinel never reaches disk, logs, status output, fixtures, or exception text. Cover fetch rejection, non-OK/redirect/oversized/malformed response, created-plus-final-readback success, an existing byte-identical file returning `already_exact` with zero write/rename/delete, conflicting bytes, symlink/type drift, unreadable/oversized existing content, exclusive-create race, and final-readback mismatch, always with the closed exit-code/error-line table and no unintended mutation. Finally, run the trusted history checker fixtures after first creation and prove that exact unchanged history remains valid while delete, mode/type drift, byte change, or a canonical retarget remains immutable-history failure.

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

test('sole semantic/producer resolver joins the actual workflow run', () => {
  const live = requiredCheckLiveEvidenceFixture({ sourceCommit: '1'.repeat(40) });
  const resolved = resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: live.rulesetRequirements,
    checkRuns: live.checkRuns,
    workflowRuns: live.workflowRuns
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
    checkRuns: live.checkRuns,
    workflowRuns: live.workflowRuns
  }), /required_check_registry_live_evidence_invalid/);
  assert.throws(() => resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: live.rulesetRequirements,
    checkRuns: live.checkRuns,
    workflowRuns: live.workflowRuns.map((run, index) => index === 0
      ? { ...run, path: '.github/workflows/alternate.yml' }
      : run)
  }), /required_check_workflow_producer_invalid/);
  assert.throws(() => resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: live.rulesetRequirements,
    checkRuns: live.checkRuns.map((run) => ({
      ...run,
      check_suite: { id: run.checkSuiteId }
    })),
    workflowRuns: live.workflowRuns
  }), /required_check_live_projection_invalid/);
  assert.throws(() => resolveControlPlaneRequiredCheckContracts({
    sourceCommit: '1'.repeat(40),
    rulesetRequirements: live.rulesetRequirements,
    checkRuns: live.checkRuns,
    workflowRuns: live.workflowRuns.map((run) => ({
      ...run,
      check_suite_id: run.checkSuiteId
    }))
  }), /required_check_live_projection_invalid/);
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
node --check scripts/check-project-state.mjs
node --check scripts/check-control-plane-main-source-identity-history.mjs
node --test --test-concurrency=1 server/tests/control-plane-main-source-identity.test.mjs server/tests/control-plane-main-source-identity-history.test.mjs server/tests/control-plane-main-source-identity-governance-workflow.test.mjs server/tests/project-state-check.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
~~~

Expected: missing identity modules/exports, the base-owned history checker/workflow, and the new project-state owner-delegation assertions are RED; pre-existing project-state checks remain GREEN, and no failure depends on network or an identity instance being present.

- [ ] **Step 3: Implement the JSON schema and closed validators**

Use the shared canonical module and import serializeCanonicalJsonBytes/sha256Hex rather than implementing any JSON writer, field walker, deep sorter, or digest primitive; from the database owner import exactly `canonicalizeDatabaseContracts` plus the same-reference `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT`, and no other database contract/field-order surface. The canonicalizer alone normalizes and produces comparison bytes/digest; the embedding descriptor is only installed unchanged in the parent nested/array registry. Never inspect, clone, spread, or redeclare any database key, item contract, order, or invariant. Implement the exact main-source identity contract, sole byte validator, module-private brand, fixed internal GitHub routes, and fixed-path create-missing-only writer first. The creator accepts only a positive PR number; the public resolver accepts only canonical bytes, expectedSourceCommit, token, and fetchFn, performs its own fixed PR GET plus compare GET, and brands only its internally observed and byte-compared success. Neither accepts caller-provided repository/routes/live PR/compare metadata, and neither discovers by commit. The writer accepts no path or overwrite option, returns only created/already_exact after exact readback, and never changes conflicting existing bytes. Update `scripts/check-project-state.mjs` to import the owner path/validator: absence remains valid for the main PR; presence performs a bounded read and owner validation only. Do not add a second identity parser, field list, GitHub read, or brand to the checker. Implement the separate history checker with the owner byte validator and exact Git-tree mode/type/blob comparison, then add a credential-free `pull_request_target` workflow that executes only the protected base copy after first proving its own workflow/checker are unchanged in the candidate. The new workflow has no checkout of candidate executable code, no secret, write permission, package install, cache, artifact, or arbitrary path input. Implement the executable required-check item/root contracts, the one sole-export semantic/producer resolver with its one private frozen semantic/context policy, and the inventory-attestation predicate dependency leaf once in this task; both inventory schemas reference the required-check root and never repeat its item keys, and Artifact imports these owner modules. The resolver must return `canonicalizeRequiredCheckContracts(...)` unchanged after it derives role/context/source kind from policy, integration/App from the live check, and workflow path/ref/SHA only from the uniquely check-suite-joined direct Actions run. Never export the private policy, accept a caller-provided semantic/workflow mapping, or copy policy workflow values into a result. Keep additionalProperties false for inventory-owned objects. Enforce safe release labels, safe runtimeContractId, fixed target/service/repository/release unit, aggregate booleans, safe digest-only bindings, exhaustive live-readback requiredCheckContracts, and explicit normal/compatibility discriminants. Never hard-code a production integrationId/App identity, accept a caller-selected receipt mode, mix runtime observations into identities, copy the predicate contract, call JSON.stringify, serialize a bare required-check array, or serialize a reduced databases view.

Implement `scripts/control-plane-main-source-identity.mjs` as an actual executable ESM entry, not a documentation-only wrapper: export the dependency-injected `main`, use one `import.meta.url` direct-main guard, parse only the closed `record --pull-request <positive-integer>` grammar, and map all outcomes to the fixed `0/1/2/3` exit table and bounded safe lines frozen above. The direct entry obtains only `env.GITHUB_TOKEN`; missing token stops before fetch/fs, and no token argv/stdin/config fallback exists. Construct the production `fetchFn` and `fsOps` adapters inside the fixed owner boundary, disable redirects, bound all reads, pass the token only to the creator's read-only GitHub request, pass only validated canonical bytes to the writer, and perform an independent fixed-path final readback through the owner validator. Do not pass `env`, token, response bodies, paths, or thrown error text to output or filesystem adapters.

In both inventory schemas, the two database properties are exactly:

~~~json
{
  "databaseContracts": { "$ref": "./control-plane-database-contract-v1.schema.json" },
  "databaseContractsSha256": { "$ref": "#/$defs/sha256" }
}
~~~

Do not add properties/items beneath databaseContracts in either inventory schema.

The required-check property in both inventory schemas is exactly a reference to schemas/control-plane-required-check-contract-v1.schema.json. Implement canonicalizeRequiredCheckContracts with the fixed sort followed by the exact Foundation call `serializeCanonicalJsonBytes({ requiredCheckContracts: sorted }, REQUIRED_CHECK_ARRAY_CONTRACT)` and the frozen domain-separated digest; implement validateRequiredCheckContracts by exact canonicalizer reuse and validateRequiredCheckRunObservations as a separate runtime-only comparison path. `resolveControlPlaneRequiredCheckContracts` is the only owner allowed to join the private semantic/context policy with live ruleset/check-run evidence and the complete workflow-run snapshot by exact check-suite ID. No Artifact, workflow, receipt, or Task 9 code may locally recreate REQUIRED_CHECK_CONTRACT, REQUIRED_CHECK_ARRAY_CONTRACT, a semantic registry, producer-identity mapping, identity-array mapping, or any serializer.

- [ ] **Step 4: Implement fixed identity publication/readback and immutable inventory resolution**

Wire the post-merge identity CLI only to the owner creator and create-missing-only writer. Require exclusive create plus exact readback for a missing file, byte-exact no-write success for an existing file, and a zero-mutation stop for any conflict; expose no path or replace mode. Keep the public identity resolver separate: it canonical-validates fixed-path bytes, derives its exact PR and compare GETs internally, rejects caller-supplied live metadata, and returns only its module-private-branded successful wrapper. The history checker fixes all Git object paths internally, rejects non-commit SHA inputs and ambiguous tree rows, validates first-add bytes through the same owner parser, and for an existing base requires byte-identical blob OID plus `100644 blob` mode/type. Its workflow uses pinned actions, exact event base/head SHAs, disabled persisted credentials, a sparse candidate data checkout, and the trusted base script only. For inventory, derive API paths from the fixed repository and parsed ID, reject redirects outside api.github.com, require an immutable matching Release/asset/attestation tuple, bound response bytes, compare digest before parsing, and validate source plus expiry with the injected clock.

The CLI direct-main validation is mandatory in this step: use the real `env.GITHUB_TOKEN` name only as the read-only GitHub API credential source, verify the fixed fetch/fs adapters and fixed output path under injected tests, and prove the direct entry produces the same canonical bytes and create-missing-only/readback outcome as `main`. No test may replace the owner creator/writer with a success stub; fetch and fs are the only injected boundaries. Existing-same is success without mutation; conflict, symlink, fetch failure, missing token, malformed history, or any argv fault remains a bounded closed failure.

- [ ] **Step 5: Re-run the focused tests and confirm GREEN**

~~~bash
node --check scripts/check-project-state.mjs
node --check scripts/check-control-plane-main-source-identity-history.mjs
node --test --test-concurrency=1 server/tests/control-plane-main-source-identity.test.mjs server/tests/control-plane-main-source-identity-history.test.mjs server/tests/control-plane-main-source-identity-governance-workflow.test.mjs server/tests/project-state-check.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
npm run project-state:check
~~~

Expected: all Task 2 contract tests pass with no skip; the repository-level project-state check remains GREEN while the fixed identity instance is absent, its present-instance fixtures pass only through the owner validator, and the trusted history workflow accepts only the three closed absent/first-add/unchanged states.

- [ ] **Step 6: Commit the inventory contract**

~~~bash
git add schemas/control-plane-main-source-identity-v1.schema.json schemas/control-plane-required-check-contract-v1.schema.json schemas/control-plane-inventory-receipt-v1.schema.json schemas/control-plane-compatibility-inventory-receipt-v1.schema.json scripts/control-plane-main-source-identity.mjs scripts/check-control-plane-main-source-identity-history.mjs scripts/check-project-state.mjs .github/workflows/control-plane-main-source-identity-governance.yml server/services/deployment/control-plane-main-source-identity.mjs server/services/deployment/control-plane-required-check-contract.mjs server/services/deployment/control-plane-required-check-registry.mjs server/services/deployment/control-plane-inventory-attestation-predicate.mjs server/services/deployment/control-plane-inventory-receipt.mjs server/services/deployment/control-plane-compatibility-inventory-receipt.mjs server/services/deployment/control-plane-readonly-inventory.mjs server/services/deployment/control-plane-compatibility-readonly-inventory.mjs server/tests/control-plane-main-source-identity.test.mjs server/tests/control-plane-main-source-identity-history.test.mjs server/tests/control-plane-main-source-identity-governance-workflow.test.mjs server/tests/project-state-check.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs
git commit -m "feat: add source identity and typed inventory contracts"
~~~

No push, PR creation, merge, workflow dispatch, inventory request, or publication occurs at this checkpoint. Continue only with Artifact Tasks 1-2; do not jump from this ownership label to Integration Task 1 or Task 3.

## Task 3: Add typed inventory-only CLIs, isolated publishers, and workflows

**FUTURE ONLY — CURRENT REACHABILITY: STOP FOR SOURCE TASKS 1-9.** Like every task in this plan, Task 3 is outside the separate exact 11-file authority-bootstrap inventory. `full_sigstore_owner_topology_unapproved` plus the unavailable immutable-lock postverification and offline npm closure means the Foundation eligibility prerequisite cannot be established, and no explicit Risk-A resumption approval exists. The remaining Task 3 specification and tests are frozen future design only; they must not be implemented, validated as complete, pushed, or used as evidence until the four-prerequisite Source-resumption gate is satisfied.

**Files:**

- Create: scripts/control-plane-readonly-inventory.mjs
- Create: scripts/control-plane-compatibility-readonly-inventory.mjs
- Create: scripts/control-plane-inventory-policy-check.mjs
- Create: scripts/control-plane-inventory-receipt-publisher.mjs
- Create: .github/workflows/japan-control-plane-readonly-inventory.yml
- Create: .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml
- Create: server/tests/control-plane-inventory-receipt-publisher.test.mjs
- Create: server/tests/control-plane-inventory-policy-check.test.mjs
- Create: server/tests/control-plane-readonly-inventory-workflow.test.mjs
- Create: server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
- Modify: server/tests/control-plane-readonly-inventory.test.mjs
- Modify: server/tests/control-plane-compatibility-readonly-inventory.test.mjs
- Verify only: server/services/deployment/control-plane-host-inventory-readers.mjs
- Verify only: server/tests/control-plane-host-inventory-readers.test.mjs
- Verify only: scripts/control-plane-github-evidence.mjs
- Verify only: server/tests/control-plane-github-evidence.test.mjs
- Verify only: scripts/github-immutable-release-publisher.mjs
- Verify only: server/services/deployment/control-plane-artifact-publication-authorization.mjs
- Verify only: server/tests/github-immutable-release-publisher.test.mjs
- Verify only: server/tests/control-plane-artifact-publication-authorization.test.mjs
- Verify only: server/tests/control-plane-artifact-gate-workflow.test.mjs

**Interfaces:**

- Future-only entry gate: after the four-prerequisite Source-resumption gate is satisfied and Foundation eligibility plus the preceding full provider order are proven, Artifact Tasks 3-10, including Task 6's sole GitHub policy/approval evidence owner and Task 9's reviewed dormant protected-publisher stop body/hash/fixture, Integration Task 1, and Host/DB Task 14A must be GREEN and committed. The full write-capable Artifact protected-publisher owner remains unavailable until its own future approval and cannot be inferred from those checkpoints. Only in that future state may Task 3 compose dormant inventory workflows without calling the installer, activating publication, or copying Artifact's evidence/publication contracts or readers. No such entry-gate state is currently claimable.
- Normal CLI uses only `request` with credentialId `japan-control-plane-github-deploy-v1` after G4 and the Bootstrap-owned `encodeNormalInventoryRequestFrame`/`validateNormalInventoryResponseFrame` pair; compatibility CLI uses only `requestBootstrap` with credentialId `japan-control-plane-github-bootstrap-v1` before G4 and the disjoint `encodeCompatibilityInventoryRequestFrame`/`validateCompatibilityInventoryResponseFrame` pair. The compatibility `activationId` and `hostBundleContentReceiptSha256` are encoded only as canonical read-only evidence and are absent from transport/materializer selectors. Neither CLI imports `encodeBootstrapActivationRequestFrame`, `validateBootstrapActivationResponseFrame`, `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, or any root-launcher surface, and compatibility remains single-response with no `bootstrap_activation_ready_v1` frame.
- Both consume Bootstrap-owned full capability probing followed by one lazy secretMaterializer.materializeFixedCredential(credentialId), an internal sealed capture, one per-request clone, and idempotent close. Neither inventory path imports or accepts encodeStatusRequestFrame, validateStatusResponseFrame, status_response_v1, the private sixteen-field deployment status, the Receipt ACK ABI, or a recovery codec.
- Each inventory CLI creates a fresh exact-five-method `{ execute, request, requestStatusBundle, requestBootstrap, close }` transport, makes exactly one method-specific request, and calls `transport.close()` in its outermost finally. Normal and compatibility workflows never share a transport lifecycle, sealed capture, materializer result, or G2 activation evidence; no inventory invokes `execute` or `requestStatusBundle`.
- The remote request handler consumes Host's real branded provider only through `assertControlPlaneHostInventoryReaders(createControlPlaneHostInventoryReaders(deps))`. It calls exactly `normalInventoryReader.read(decodedNormalRequest)` or `compatibilityInventoryReader.read(decodedCompatibilityRequest)` and passes the returned owner value to the matching Bootstrap encoder. Integration never constructs a reader member, evidence bytes, host selector, path, resource ID, or mutation method.
- Produce two manual workflows and two fixed opaque publication-data entry points. The inventory-side producer validates its own typed receipt, constructs the exact workflowPath/workflowRef/workflowSha/sourceCommit/predicateType attestationIdentity in that key order, and emits only bounded canonical `publication_input_base64` plus `publication_input_sha256` job outputs; compatibility data consumes only the compatibility Gate and contains no SSH selector. Current publisher owner bytes do not read or inspect either output, because all three inline owner operations stop unavailable before input access. No write-capable `publish` implementation exists in this source, and the job never executes `control-plane-inventory-receipt-publisher.mjs` or any repository/candidate byte.
- Both workflow files have exact ordered root keys `name,on,permissions,concurrency,jobs`, set workflow-level `permissions: {}`, and contain exactly the ordered jobs `preflight`, `inventory`, and `publish`. The root has no `defaults`, `env`, alternate-case spelling, anchor/alias/merge, duplicate, or unlisted key. Each `preflight` job has exactly `{ actions: read, checks: read, contents: read }`, no Environment or protected binding, and one fixed step-scoped `GITHUB_TOKEN: ${{ github.token }}`. From an exact-S checkout, `control-plane-inventory-policy-check.mjs preflight-normal|preflight-compatibility` imports and calls only Artifact Task 6's `readCurrentMaster`, `readEnvironmentPolicy`, `collectPreapprovalEvidence`, and required-check readers. It accepts their frozen canonical wrappers unchanged, requires direct `workflow_dispatch` master/S/run-attempt-one bindings, `preventSelfReview === true`, `protectedBranches === true`, `customBranchPolicies === false`, `adminBypassAllowed === false`, a non-empty all-user reviewer set, and exactly one compatibility reviewer, then emits exactly four data-only outputs: `policy_packet_base64`, `policy_packet_sha256`, `publication_policy_packet_base64`, and `publication_policy_packet_sha256`. The first pair binds the fixed inventory Environment; the second binds `artifact-publication`. Source owns only the bounded canonical `inventory_environment_policy_packet_v1` envelope with exact ordered fields `schemaVersion,type,repository,environment,workflowPath,workflowRef,sourceCommit,runId,runAttempt,preapprovalEvidenceBytesBase64,preapprovalEvidenceSha256,environmentPolicyBytesBase64,environmentPolicySha256`; both instances embed Artifact-owner bytes/digests. Source defines no second reviewer/policy/approval contract, field order, canonicalizer, REST projection, Team logic, or user resolver.
- Each protected `inventory` job has exactly `{ actions: read, contents: read }`, no job-level `env`, and the absolute first array member `steps[0]` equal to the closed `fresh-authority-recheck` step object. It is a workflow-owned bare inline `run` body, not a `uses` step, and receives only one explicit step-scoped `GITHUB_TOKEN: ${{ github.token }}`, the exact two `needs.preflight.outputs.policy_packet_*` values, and fixed repository/mode/Environment/workflow/ref/SHA/run/attempt/actor/triggering-actor bindings. It performs Artifact Task 6-equivalent fresh policy, current same-run approval-history, and exact approving `/users/{login}` checks against the expected packet and emits only bounded canonical `authority_recheck_base64` plus `authority_recheck_sha256`. No checkout, setup, download, local/repository action, repository script, implicit/default action token, secret/variable expression, protected output, materializer, inventory CLI, transport, or host request may precede or occur inside any earlier step because no earlier step exists. Stale/rejected/wrong-run approval, Team/unknown reviewer, admin bypass, self approval, policy drift, redirect, pagination ambiguity, body/SHA drift, or read failure stops before source authentication or protected values.
- The normal and compatibility `fresh-authority-recheck` `run` scalars are byte-identical and non-generated. Their exact fixed step `env` maps bind the only permitted normal/compatibility mode, Environment, and workflow path; the shared body contains and validates that closed table. Tests extract both complete bodies, byte-compare them, compare their digest to one reviewed literal SHA-256, parse them as a complete inline Node program, and execute both modes against the exact Artifact Task 6 policy/approval/exact-user fixture corpus. The Source codebase exports no contract or reusable reader from this body and cannot introduce a different field order, canonicalizer, REST response projection, user/Team interpretation, route, PAT, App, or installation-token authority. Any Artifact owner-vector change makes both Source fixture-parity tests RED until the body is re-reviewed together with its fixed digest.
- Only after `steps[0]` succeeds may `steps[1]` be the pinned exact-S checkout with `persist-credentials: false`; the plan does not treat that option as pre-recheck isolation because checkout still uses its default GitHub token while fetching. The next fixed tokenless thin adapter consumes the two safe recheck outputs plus preflight packet only as canonical data and imports Artifact's owner contracts/vectors without performing a second GitHub read or selecting trust. Only after that data check succeeds may one later materialization step evaluate its matching expressions: the exact five Environment secret leaves and exact five read-only variables frozen for its normal or compatibility family. Normal fixes `vultr-japan-production` and the deploy credential family only after G4. Compatibility fixes `vultr-japan-compatibility-inventory`, requires exactly one non-self canonical user reviewer, exposes exactly the five `JAPAN_CONTROL_COMPATIBILITY_INVENTORY_*` secret leaves and five variables frozen above, and uses the bootstrap credential family only inside its one <=15-minute G2 attempt; aliases, missing/extra names, production names, stale values, a second materialization, or post-capture environment retention reject. No policy packet or recheck field may address or rename a protected binding.
- Each protected `publish` job has exact `needs: [preflight, inventory]`, exactly `{ actions: read, attestations: write, contents: write, id-token: write }`, fixes `artifact-publication`, has no inventory/production secret or SSH material, and retains exactly four steps in order: absolute `steps[0]` fixed inline authorize; fixed inline publish; pinned `actions/attest`; fixed inline `verify_complete`. There is no checkout, setup-node, download/upload action, local/repository action, repository `control-plane-inventory-receipt-publisher.mjs`, package command, candidate import/execution, or dynamic import. The explicit `${{ github.token }}` multiset remains exactly four and ordered authorize, publish, attest, postverify. Attest retains explicit `github-token`, `push-to-registry: false`, and `create-storage-record: false`, but its exact condition is always false; it therefore consumes neither OIDC nor input and emits nothing. The job has no `artifact-metadata` permission.
- The normal and compatibility authorize bodies are byte-identical, as are their publish bodies and their postverify bodies; all six extracted bodies equal Artifact Task 9's reviewed dormant owner bytes and frozen SHA-256. The first executable statement in each body is the unconditional `artifact_inventory_publisher_owner_unavailable` stop, before fs/crypto/GitHub/input/output access. Current tests parse and actually execute all six bodies in the Artifact VM fixture and require only that bounded unavailable result plus zero GitHub-method, Release, attestation, filesystem, job-output, and completion calls. Static tests require attest's always-false condition and reject any body byte, condition, checkout/setup/download/repository code, token topology, unlisted method, or step-order drift that could make current publication reachable. The one-pair publish/attest/`verify_complete` semantic fixture remains a future separately approved activation test, not a current positive row.
- A test-only `assertClosedExpressionAllowlist(rawJobBlock, expectedMultiset)` uses a closed tokenizer that accepts only dotted identifier expressions and exact `${{ ... }}` delimiters, rejects every unparsed expression, function call, bracket access, alias/anchor/merge, alternate case/whitespace/quote form, and compares the complete expression multiset. It proves exactly one `github.token` in preflight, exactly one in inventory absolute `steps[0]`, and exactly four in publish ordered authorize/publish/attest/postverify; the exact permitted preflight packet, opaque inventory publication, fixed current `github.*`, and recheck output bindings; the later inventory materializer's exact five `secrets.*` and five `vars.*` names; and every fixed non-secret binding required by the remaining blocks. The pinned attest step must contain its one explicit `github-token` expression; deleting it to fall back to the action default is RED. No other `github`, `secrets`, token-like `env`, forwarded token output, implicit/default token-bearing action, or expression before either protected `steps[0]` is accepted. No other job may receive `id-token: write`, `attestations: write`, `contents: write`, `checks: write`, `actions: write`, `pull-requests: write`, `deployments: write`, `packages: write`, or any unlisted permission.

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

Assert each workflow is manual-only with its own exact confirmation/type; fixed concurrency with cancellation disabled; direct master and `run_attempt == 1`; and no caller-selected source/target/service/path. Preflight has no Environment or protected binding and its sole token-bearing adapter imports Artifact Task 6's owner readers, consumes their canonical policy/preapproval wrappers unchanged, consumes Task 2 `resolveControlPlaneRequiredCheckContracts`, byte-compares its returned canonical bytes/digest, and emits only the exact inventory-policy and publication-policy packet pairs. After Environment approval, protected inventory absolute `steps[0]` is the fixed workflow-owned fresh authority body; checkout and the tokenless thin owner-data adapter occur only after its success, and the exact five-plus-five materialization occurs only after both. Normal then uses request/fixed deploy credential plus only the normal-inventory codec; compatibility uses requestBootstrap/fixed bootstrap credential plus only the compatibility-inventory codec while G2 activation/content-receipt fields remain canonical read-only evidence. Both server paths use the exact Host-branded reader provider; G3 activation codec/root launcher imports are absent; inventory jobs have no repository write and output only opaque canonical publication bytes/digest.

Each protected publisher has no production/inventory secret and deep-equals the exact four-step dormant Artifact topology: inline authorize, inline publish, pinned attest, inline verify_complete. It has no checkout/setup/download/upload/repository CLI/candidate code. Its `github.token` multiset remains exactly four in that order, including explicit `github-token` on pinned attest, but attest has an exact always-false condition and current OIDC consumption is zero. The normal/compatibility authorize, publish, and verify bodies are extracted, byte-compared by operation, checked against Artifact's frozen dormant-body SHA-256, parsed, and actually executed in Artifact's real VM fixture. Each must stop on its first statement with `artifact_inventory_publisher_owner_unavailable` before any input/policy/approval/user/publication read. The fixture requires zero GitHub-method, Release, attestation, fs, output, and completion calls. Tests never mock the dormant owner or replace it with a happy publisher.

Parse both YAML files with duplicate-key/alias rejection and deep-compare the complete root and every complete job block against the frozen topology rather than searching only workflow-level `permissions: {}` or a minimum subset. Assert root key order is exactly `name,on,permissions,concurrency,jobs`; root `defaults`, root `env`, extra or alternate-case keys, anchors, aliases, merge keys, and duplicates reject in raw and parsed fixtures. Assert the job key order is exactly `preflight,inventory,publish`; each `jobBlock.permissions` is byte-for-byte/deep-equal to its exact map below; each job has the exact expected Environment/absence and token-bearing step count; and no permission key or token placement exists outside that closed map. Deep-compare preflight outputs to the exact four policy-packet names. Deep-compare `inventory.steps[0]` to the fixed inline fresh-authority step and require `inventory.steps[1]` to be pinned exact-S checkout with `persist-credentials: false`; the first step's raw block contains no `uses`, checkout, setup, download, repository path/code, `secrets.*`, `vars.*`, materializer, protected output, or policy-derived selector. Prove the tokenless owner-data adapter follows checkout and every secret/variable/materializer follows both gates. Explicit negative rows prove `defaults.run.shell`, `defaults.run.working-directory`, and root environment injection cannot alter any inline body or execution context while the job blocks remain unchanged.

Deep-compare `publish.steps` to exactly authorize/publish/attest/verify, require zero checkout/setup/download/upload/local action/repository CLI/candidate import/dynamic import, explicit token on all four consumers, attest's exact always-false condition, and no current completion output. Slice raw job blocks and reject forbidden scopes even if a YAML alias, duplicate key, alternate case, second Environment, hidden preceding/default-token action, or extra/reordered step attempts to hide them. Run the closed expression tokenizer over every raw job block, compare the exact complete multiset, and reject bracket access, expression functions/serialization, secret contexts outside the later inventory materializer, forwarded token outputs, or an expression hidden in `env`, `with`, argv, or stdin. Assert Source adapters contain no local policy/publication contract, raw reviewer/Team parser, `/orgs/`, local `/users/` builder, PAT/App route, copied generic publisher method table, or fallback activation. The normal and compatibility permission/token/step/STOP skeletons deep-equal; only their fixed confirmation, Environment/workflow path, credential family, codec, typed receipt mode, and dormant opaque-data names may differ.

For both workflows and every job, inject each of `github['token']`, `github["token"]`, `GitHub.token`, `toJSON(github)`, `fromJSON(toJSON(github)).token`, `format('{0}', github.token)`, `secrets.GITHUB_TOKEN`, `secrets['GITHUB_TOKEN']`, `toJSON(secrets)`, `env.GITHUB_TOKEN`, and `needs.preflight.outputs.forwarded_token` into each of step `env`, `with`, argv, and stdin. Every row fails the closed tokenizer before workflow acceptance. Also inject root `defaults.run.shell`, root `defaults.run.working-directory`, root `env`, any root extra/case/duplicate/anchor/alias/merge; a preceding checkout/setup/download/local/repository/default-token action; a renamed/extra packet or publication output; an unlisted extra/reordered step; each ten protected expression into inventory `steps[0]`; checkout/repository CLI/candidate code/dynamic import into publish; delete/move/bypass the first-statement unavailable stop; make attest's condition true/dynamic/absent; remove attest's explicit token or false side-effect inputs; add a completion output, `artifact-metadata`, unlisted GitHub method, action tag, obsolete attest pin, or any fixed body-byte drift. Every row fails in both normal and compatibility. Positive current rows prove exact root order, exact token counts `1/1/4`, exact dormant four-step order, three first-statement STOP bodies, attest always skipped, zero publisher I/O/completion, later materializer byte-equal five-plus-five names, and zero token leaf in opaque cross-job data.

The in-memory live-policy fixtures continue to exercise inventory preflight and protected inventory symmetrically through Artifact's real evidence/vector owner. Positive inventory fixtures require canonical packet bytes/digests, direct master, complete pagination, stable user reviewers, current run/attempt, exact configured approver, and distinct actor identities. Negative rows assert zero checkout and protected-name evaluation. Publisher current-state fixtures do not exercise happy policy or publication semantics: they execute the exact dormant Artifact owner bytes and require `artifact_inventory_publisher_owner_unavailable` before any policy/approval/opaque-input/GitHub access, with zero Release/attestation/fs/output/completion. Tests fail on any local reviewer/policy/approval/publication contract, canonicalizer, REST projection, Team parser, user/org route, PAT/App credential, alternate immutable-pair primitive, or attempt to turn a future activation vector into current success.

~~~js
const EXPECTED_JOB_PERMISSIONS = Object.freeze({
  preflight: Object.freeze({ actions: 'read', checks: 'read', contents: 'read' }),
  inventory: Object.freeze({ actions: 'read', contents: 'read' }),
  publish: Object.freeze({
    actions: 'read',
    attestations: 'write',
    contents: 'write',
    'id-token': 'write'
  })
});

for (const workflow of [normalWorkflow, compatibilityWorkflow]) {
  assert.deepEqual(Object.keys(workflow), ['name', 'on', 'permissions', 'concurrency', 'jobs']);
  assert.equal(Object.hasOwn(workflow, 'defaults'), false);
  assert.equal(Object.hasOwn(workflow, 'env'), false);
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(Object.keys(workflow.jobs), ['preflight', 'inventory', 'publish']);
  for (const [jobName, expectedPermissions] of Object.entries(EXPECTED_JOB_PERMISSIONS)) {
    const jobBlock = workflow.jobs[jobName];
    assert.deepEqual(jobBlock.permissions, expectedPermissions);
    assert.deepEqual(Object.keys(jobBlock.permissions), Object.keys(expectedPermissions));
  }
  assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.preflight), 1);
  assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.inventory), 1);
  assert.equal(countExplicitGithubTokenPlacements(workflow.jobs.publish), 4);
  assert.deepEqual(workflow.jobs.inventory.needs, ['preflight']);
  assert.deepEqual(workflow.jobs.publish.needs, ['preflight', 'inventory']);
  assert.deepEqual(Object.keys(workflow.jobs.preflight.outputs), [
    'policy_packet_base64',
    'policy_packet_sha256',
    'publication_policy_packet_base64',
    'publication_policy_packet_sha256'
  ]);
  assert.deepEqual(workflow.jobs.inventory.steps[0], expectedFreshAuthorityStep(workflow));
  assert.equal(isWorkflowOwnedInlineRun(workflow.jobs.inventory.steps[0]), true);
  assert.equal(isPinnedCredentialDisabledExactSourceCheckout(workflow.jobs.inventory.steps[1]), true);
  assert.equal(countStepsBeforeFreshAuthorityRecheck(workflow.jobs.inventory), 0);
  assert.equal(freshAuthorityRecheckReferencesProtectedBindings(workflow.jobs.inventory), false);
  assert.equal(allProtectedBindingsFollowSuccessfulRecheck(workflow.jobs.inventory), true);
  assert.deepEqual(
    workflow.jobs.publish.steps.map(classifyPublisherStep),
    ['authorize', 'publish', 'attest', 'verify_complete']
  );
  assert.equal(publisherExecutesRepositoryOrCandidateCode(workflow.jobs.publish), false);
  assert.equal(publisherUsesCheckoutSetupOrArtifactTransfer(workflow.jobs.publish), false);
  assert.equal(
    workflow.jobs.publish.steps[2].uses,
    'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
  );
  assert.equal(hasExplicitAttestGithubToken(workflow.jobs.publish.steps[2]), true);
  assert.equal(workflow.jobs.publish.steps[2].with['push-to-registry'], false);
  assert.equal(workflow.jobs.publish.steps[2].with['create-storage-record'], false);
  assert.deepEqual(Object.keys(workflow.jobs.publish.steps[2].with), [
    'subject-path', 'predicate-type', 'predicate-path',
    'github-token', 'push-to-registry', 'create-storage-record'
  ]);
  assert.equal(isExactlyAlwaysFalse(workflow.jobs.publish.steps[2].if), true);
  assert.equal(reachableOidcConsumerCount(workflow.jobs.publish), 0);
  assert.deepEqual(Object.keys(workflow.jobs.publish.outputs ?? {}), []);
  assert.equal(hasWorkflowOrJobLevelTokenEnvironment(workflow), false);
  assert.equal(hasForbiddenScopeOutsidePublisher(workflow), false);
}

assert.deepEqual(
  normalizeOnlyFrozenModeBindings(normalWorkflow),
  normalizeOnlyFrozenModeBindings(compatibilityWorkflow)
);
for (const rootFault of [
  'defaults.run.shell', 'defaults.run.working-directory', 'root.env',
  'extra_key', 'alternate_case', 'duplicate_key', 'anchor', 'alias', 'merge_key'
]) {
  assert.throws(() => parseClosedWorkflow(mutateWorkflowRoot(normalWorkflowRaw, rootFault)));
  assert.throws(() => parseClosedWorkflow(mutateWorkflowRoot(compatibilityWorkflowRaw, rootFault)));
}

assert.deepEqual(extractInventoryStepZeroBody(normalWorkflow), extractInventoryStepZeroBody(compatibilityWorkflow));
assert.equal(sha256Hex(extractInventoryStepZeroBody(normalWorkflow)), REVIEWED_INVENTORY_STEP0_SHA256);
for (const operation of ['authorize', 'publish', 'verify_complete']) {
  const bodies = [normalWorkflow, compatibilityWorkflow].map((workflow) =>
    extractPublisherControlBody(workflow, operation));
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(sha256Hex(bodies[0]), ARTIFACT_DORMANT_PUBLISHER_BODY_SHA256);
  assert.equal(hasArtifactOwnerUnavailableAsFirstStatement(bodies[0]), true);
}
~~~

~~~js
import {
  buildCompatibilityInventoryPublicationInput,
  buildNormalInventoryPublicationInput
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

test('compatibility inventory has one disjoint ephemeral Environment family', () => {
  const workflow = readWorkflow('.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml');
  assert.equal(workflow.jobs.inventory.environment, 'vultr-japan-compatibility-inventory');
  assert.deepEqual(extractInventorySecretNames(workflow.jobs.inventory), [
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_HOST',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_PORT',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_USER',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_PRIVATE_KEY',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_KNOWN_HOSTS',
  ]);
  assert.deepEqual(extractInventoryVariableNames(workflow.jobs.inventory), [
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_AUTHORIZATION_GENERATION',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_BOOTSTRAP_RECEIPT_SHA256',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_EXPIRES_AT',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_ACTIVATION_ID',
    'JAPAN_CONTROL_COMPATIBILITY_INVENTORY_HOST_BUNDLE_CONTENT_RECEIPT_SHA256',
  ]);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.inventory), /JAPAN_CONTROL_DEPLOY_|vultr-japan-production/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /JAPAN_CONTROL_COMPATIBILITY_INVENTORY_|vultr-japan-compatibility-inventory/);
});

for (const [type, workflowPath, environment] of [
  ['normal', '.github/workflows/japan-control-plane-readonly-inventory.yml', 'vultr-japan-production'],
  ['compatibility', '.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml', 'vultr-japan-compatibility-inventory']
]) {
  test(`${type} inventory rechecks live user approval before protected bindings`, async () => {
    const harness = createRealArtifactGithubEvidenceInventoryAdapterHarness({ type, environment });
    const preflight = await harness.runPreflight();
    assert.deepEqual(Object.keys(preflight), [
      'policy_packet_base64', 'policy_packet_sha256',
      'publication_policy_packet_base64', 'publication_policy_packet_sha256'
    ]);
    const result = await harness.runProtectedInventory({ preflight });
    assert.equal(result.authorityRecheckStepIndex, 0);
    assert.equal(result.checkoutStepIndex, 1);
    assert.equal(result.artifactOwnerVectorParity, true);
    assert.equal(result.workflowPath, workflowPath);
    assert.equal(result.policyPacketSha256, preflight.policy_packet_sha256);
    assert.equal(result.sourceLocalPolicyContractCount, 0);
    assert.equal(result.protectedBindingReadAfterRecheck, true);
  });

  for (const fault of [
    'stale_policy', 'stale_approval', 'wrong_run', 'wrong_attempt',
    'self_actor', 'self_triggering_actor', 'team_reviewer',
    'unknown_reviewer', 'admin_bypass', 'policy_drift'
  ]) {
    test(`${type} inventory fails closed for ${fault}`, async () => {
      const harness = createRealArtifactGithubEvidenceInventoryAdapterHarness({ type, environment, fault });
      const preflight = await harness.runPreflight();
      await assert.rejects(harness.runProtectedInventory({ preflight }), /inventory_live_policy_recheck_failed/);
      assert.equal(harness.checkoutCallCount, 0);
      assert.equal(harness.protectedBindingReadCount, 0);
      assert.equal(harness.materializerCallCount, 0);
      assert.equal(harness.transportCallCount, 0);
    });
  }
}

for (const [type, buildPublicationInput, workflowPath] of [
  ['normal', buildNormalInventoryPublicationInput, '.github/workflows/japan-control-plane-readonly-inventory.yml'],
  ['compatibility', buildCompatibilityInventoryPublicationInput, '.github/workflows/japan-control-plane-compatibility-readonly-inventory.yml']
]) {
  test(`${type} inventory emits one opaque exact publication input`, async () => {
    const result = await buildPublicationInput(validPublicationInput({ type }));
    const expected = {
      workflowPath,
      workflowRef: `gccwebos-com/proxy-gateway-minimal/${workflowPath}@refs/heads/master`,
      workflowSha: '1'.repeat(40),
      sourceCommit: '1'.repeat(40),
      predicateType: 'https://slsa.dev/provenance/v1'
    };
    assert.deepEqual(result.attestationIdentity, expected);
    assert.deepEqual(Object.keys(result), ['publicationInputBase64', 'publicationInputSha256', 'attestationIdentity']);
  });

  test(`${type} dormant publisher executes the Artifact owner stop with zero I/O`, async () => {
    const workflow = type === 'normal' ? normalWorkflow : compatibilityWorkflow;
    const harness = createRealArtifactDormantPublisherVmHarness({ type });
    for (const operation of ['authorize', 'publish', 'verify_complete']) {
      await assert.rejects(
        harness.execute(operation, extractPublisherControlBody(workflow, operation)),
        /artifact_inventory_publisher_owner_unavailable/
      );
    }
    assert.deepEqual(harness.operations, ['authorize', 'publish', 'verify_complete']);
    assert.equal(isExactlyAlwaysFalse(workflow.jobs.publish.steps[2].if), true);
    assert.equal(harness.opaqueInputReadCount, 0);
    assert.equal(harness.githubMethodCallCount, 0);
    assert.equal(harness.releaseCallCount, 0);
    assert.equal(harness.attestationCallCount, 0);
    assert.equal(harness.filesystemWriteCount, 0);
    assert.equal(harness.outputWriteCount, 0);
    assert.equal(harness.completionCount, 0);
  });
}
~~~

- [ ] **Step 3: Run the focused tests and confirm RED**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-github-evidence.test.mjs server/tests/github-immutable-release-publisher.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-policy-check.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
~~~

Expected: missing CLI, publisher, and workflow failures.

- [ ] **Step 4: Implement the owner-consuming policy adapter and zero-argument inventory CLIs**

Implement `control-plane-inventory-policy-check.mjs` as a fixed-mode, no-write adapter. Its preflight operations call only Artifact's owner preapproval/policy readers for the fixed inventory Environment and `artifact-publication`, wrap untouched canonical bytes/digests in two instances of Source's one packet contract, and emit the exact four packet outputs. Its post-checkout consume operations are tokenless: they validate only the two expected packet values plus the absolute-step-zero safe canonical recheck data and call Artifact's existing canonical owner surfaces without a new GitHub read, route, trust selector, or raw row parser. The four fixed normal/compatibility preflight/consume operations derive Environment and workflow path internally and accept no URL/reviewer/Environment/secret/materializer selector. The module must not import/export/redeclare Artifact's private contracts, inspect reviewer/team fields, build `/users/` or `/orgs/` routes, or parse raw REST rows. Then consume `createSecureSshTransport` and only the method-specific Bootstrap inventory protocol pair defined above. Assert the returned object has exactly `{ execute, request, requestStatusBundle, requestBootstrap, close }` in that frozen order. Each inventory CLI creates its own transport, passes only the method-specific fixed credentialId plus canonical inventory request bytes and timeout, performs one materialization and one request, validates the matching inventory response, and calls transport.close() in finally. An approved G2 `activationId` may exist only within validated compatibility requestBytes; the shared sealed-capture/materializeFixedCredential boundary owns all protected tuple access, per-request cloning, zeroization, and cleanup. The Bootstrap server handler must assert and call the exact Host-owned reader provider; do not alias either inventory response to ordinary deployment status, activation status, or a terminal-bundle frame.

- [ ] **Step 5: Implement isolated immutable publication**

Implement `control-plane-inventory-receipt-publisher.mjs` only as the networkless typed opaque-data producer described above. For each receipt it constructs the fixed attestationIdentity in exact workflowPath/workflowRef/workflowSha/sourceCommit/predicateType order and returns bounded canonical bytes/digest; it exposes no token, fetch, attest, publish, Release, route, or caller selector. In the workflows reuse Artifact Task 9's complete reviewed dormant protected-publisher declaration byte-for-byte for authorize, publish, and verify_complete. Each current body begins with the unconditional `artifact_inventory_publisher_owner_unavailable` stop and cannot read the opaque input, policy, approval, user, GitHub, or filesystem. Freeze the extracted body SHA-256 and execute all three bodies in the real Artifact owner VM fixture, requiring the unavailable result and zero Release/attestation/fs/output/completion calls. Do not duplicate Release conflict/retry, policy/approval, predicate, attestation, or happy publication contracts. Full generic immutable-pair semantics and one-pair publication remain a future separately reviewed Source change plus separately approved Risk A Gate.

- [ ] **Step 6: Implement the two manual typed read-only workflows**

Pin every permitted action to a reviewed full commit SHA and pin attest exactly to `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6`; reject tags and the obsolete nonexistent `11bbd243972067817e9ed160cb123cab3601f436` value. Emit each workflow root in exact order `name,on,permissions,concurrency,jobs` with no `defaults`, `env`, alternate-case, duplicate, anchor/alias/merge, or extra key; parse raw YAML with duplicate/alias rejection before deep-comparing parsed keys. Set workflow-level permissions to exact `{}`. Implement exactly three jobs in order: `preflight` with exact `{ actions: read, checks: read, contents: read }`; `inventory` with exact `{ actions: read, contents: read }`; and `publish` with exact `{ actions: read, attestations: write, contents: write, id-token: write }`. Preflight has no Environment/protected binding, uses Artifact's sole owner, and emits exactly the two inventory-policy plus two publication-policy outputs.

Inventory fixes its Environment in source and deep-equals the frozen sequence: absolute `steps[0]` bare workflow-owned fresh authority body with exactly one explicit token and fixed packet/run/mode bindings; pinned exact-S checkout with `persist-credentials: false`; tokenless thin owner-data consume; later exact five-plus-five materialization/inventory/data-production steps. Nothing precedes `steps[0]`. Explain in code comments/tests that `persist-credentials: false` does not make checkout safe before the gate because checkout still consumes its default token while fetching.

Publish fixes `artifact-publication`, receives only opaque `needs` data, and deep-equals four dormant steps: absolute `steps[0]` inline authorize, inline publish, pinned attest, inline verify_complete. It contains no checkout/setup/download/upload/repository CLI or candidate code. Explicit `github.token` placements are exactly four in that order; attest declares `github-token`, `push-to-registry: false`, and `create-storage-record: false` explicitly but has the exact always-false condition, so reachable OIDC consumption is zero. No `artifact-metadata` permission or completion output exists. Both modes' corresponding authorize/publish/verify bodies are byte-identical, hashed, parsed, and actually executed in the real Artifact owner VM; every body must stop on its first statement with `artifact_inventory_publisher_owner_unavailable`, before input or I/O, while attest is never executed. Reject every extra/missing/default-drift input, permission, token, action, method, body byte, bypass/reorder of the stop, enabling of attest, or completion claim; implicit/default token, dynamic import, local contract/parser, PAT/App route, repository/candidate execution, and any current happy publisher are RED. Activating one-pair publish, attest, and `verify_complete` requires a later separately reviewed Source change and separately approved Risk A publication Gate.

- [ ] **Step 7: Re-run the focused tests and confirm GREEN**

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-github-evidence.test.mjs server/tests/github-immutable-release-publisher.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-policy-check.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
~~~

Expected: all tests pass; no workflow is dispatched.

- [ ] **Step 8: Commit the source-only inventory workflow**

~~~bash
git add scripts/control-plane-readonly-inventory.mjs scripts/control-plane-compatibility-readonly-inventory.mjs scripts/control-plane-inventory-policy-check.mjs scripts/control-plane-inventory-receipt-publisher.mjs .github/workflows/japan-control-plane-readonly-inventory.yml .github/workflows/japan-control-plane-compatibility-readonly-inventory.yml server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-policy-check.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs
git commit -m "feat: add typed read-only inventory workflows"
~~~

No push, PR creation, merge, workflow dispatch, secret materialization, SSH, Release publication, or host action occurs at this future checkpoint. It is currently unreachable. After a future separately authorized Task 3 completion, the next implementation checkpoint would be Host/DB Task 14B; Integration Task 4 must never begin directly from Task 3.

## Task 4: Compose the seven-scenario source integration harness

**Files:**

- Create: scripts/control-plane-source-integration.mjs
- Create: server/tests/control-plane-source-integration.test.mjs
- Modify: package.json

**Interfaces:**

- Future-only entry gate: after the four-prerequisite Source-resumption gate is satisfied, Host/DB Task 14B must be GREEN and committed on the same branch after a separately authorized Integration Task 3, and the earlier Host Task 14A installer checkpoint must also be present. This state is currently unreachable. A future Task 4 would consume both checkpoints and would not modify or duplicate Host installer, runbook, broker, transaction, recovery, or harness ownership.
- Produce the sole scripts/control-plane-source-integration.mjs wrapper and the sole package.json control-plane:source-integration key.
- Consume Task 1 final contract bytes, Host's sole bundle installer conformance surface, both typed inventory validators, Host's branded inventory-reader provider, the Task 2 required-check contract plus sole semantic/workflow resolver, canonicalizeDatabaseContracts, every owner module, and the frozen seven-scenario Host/DB harness.
- Produce only the aggregate source validation packet; no network, publisher, transport materializer, Environment, or external mutation is reachable.

- [ ] **Step 1: Write failing composition tests**

Test the frozen scenario order; one fresh harness per scenario; the completed Host Task 14A installer and Task 14B stop-before checkpoints; final staged-host/host-execution/receipt-contract byte identity; real Host bundle-installer acceptance of the exact Task 1 manifest/content inputs in a synthetic root with no second stager; normal/compatibility receipt and codec cross-rejection through the real branded Host inventory-reader provider; exact artifact/plan/bootstrap/host receipt/controller closeout chain; accepted-to-bounded-poll-to-owner-read-terminal-bundle-to-Receipt-validateTerminal-to-terminal-only-closeout ordering; the unchanged privately branded sixteen-field ordinary terminal status with exact deploymentPlanSha256 and no planSha256 alias; Bootstrap-owned terminal-bundle constants 768 raw bytes, 262144 total bytes, 342 chunks, and 2048 response-envelope bytes; no copied terminal-bundle chunk loop/codec/parser; no-claim zero terminal-bundle read and zero host mutation as validation only; Receipt-owned final-status validation; original controller closeout artifact name, one-file archive, and explicit 35-day retention; the sole Task 2 semantic/workflow resolver's eight-field requiredCheckContracts canonical result consumed byte-for-byte by inventory/artifact/deploy plus a separate runtime-observation validator proving exact context/integrationId/appSlug/headSha success without status fields entering the identity; independent canonicalizeDatabaseContracts results byte-equal with identical sha256 across typed inventory, release declaration, and deployment plan, with every frozen Host-fixture fault cross-rejected and no local database contract/order/JSON.stringify path; bootstrap-operation installed digest/readback, active-lease plus immutable-record consumption, and fixed activation unit; successful, stopped, schema-committed, rolled-back, and critical terminal handling; the fixed automatic critical-finalizer boot/path recovery chain, followed by Host's real post-publication proof and Bootstrap's downstream ordinary-status brand without a new manual Gate; one deploy-credential production-controller transport lifecycle with exact keys `execute,request,requestStatusBundle,requestBootstrap,close` spanning execute, status polling, one terminal-bundle stream, closeout, and final readback with one sealed capture, per-operation clones, and outer-finally close; ACK validation followed by a distinct ordinary committed-status request whose validator alone returns responseSha256; one deploy-credential recovery transport lifecycle whose exact sequence is challenge request/validation -> OIDC-bound recovered selector request/validation -> `createPostRecoveryStatusRequest` -> one through at most six ordinary `.request` calls with fresh request IDs at fixed 0/5000/10000/15000/20000/25000-ms points under one absolute 30000-ms deadline -> a seventh scheduled 30000-ms expiry check with zero `.request` call -> exactly one `readTerminalBundleBytes` call whose sole `requestStatusBundle` session consumes one through 342 frames -> Receipt validation, with critical terminality withheld until the real post-finalizer proof; deadline/pending/rejected recovery performs zero bundle/publication call; 1-, 768-, 769-, and 262144-byte bundle success plus 0-, 262145-byte, 343rd-frame, early/late-EOF, digest/selector drift rejection; normal ACK-loss still sends no recovery ACK; separately closed single-materialization/single-request normal and compatibility inventory transports using their distinct Bootstrap-owned pre-Gate codecs and Host readers; G2 compatibility `requestBootstrap` with fixed `japan-control-plane-github-bootstrap-v1` and read-only evidence only; synthetic G3 activation uses a new bootstrap transport plus `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame` and the fixed root launcher, passes only `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, succeeds for a valid operation taking more than 10,000 ms and at most 900,000 ms, and never receives/parses the internal ready frame; wrong, duplicate, or cross-bound ready fails closed without extending a deadline; it rejects ready write/disconnect before mutation, proves post-ready disconnect/timeout/crash convergence through durable activation cleanup/recovery, and never sends a compatibility-inventory frame or reuses G2 evidence; full-probe/materializeFixedCredential ordering with no caller-owned raw tuple or activation material selector; no network calls; no external mutation; temporary-root cleanup; secret-pattern scan; deterministic contract digest; one-line packet; wrong source; unknown field; failed count; duplicate package script; alternate wrapper; and argv rejection.

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

Import every contract from its owning plan. Do not duplicate validators or use subprocess calls for JavaScript modules. Recovery must consume Bootstrap's recovery selector brand only through `createPostRecoveryStatusRequest`, accept terminal-bundle access only from the separately validated ordinary-status brand, keep one fixed monotonic deadline across at most six actual status requests at 0 through 25 seconds, treat the seventh 30-second schedule point only as an expiry/no-request boundary, and let only `readTerminalBundleBytes` call `requestStatusBundle` once. G2 and G3 must use separate transports, activation evidence, codecs, and outcomes. Fail on any scenario skip, warning, unclosed handle, leftover file, nonterminal receipt, unsafe output, nondeterministic ordering, rejected recovery classification, local brand conversion, second required-check registry, copied Host reader/installer, or post-finalizer proof bypass.

- [ ] **Step 4: Implement the zero-argument CLI**

Use execFile with shell false for git rev-parse --verify HEAD. Reject dirty source only if the exact integration contract requires committed bytes; tests inject the source resolver. Emit one canonical line and set exit status without stack traces or raw errors.

- [ ] **Step 5: Add the package script**

Add exactly:

~~~text
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

- Future-only entry gate: after the four-prerequisite Source-resumption gate is satisfied and the complete predecessor order runs, Artifact Task 10 and Tasks 11-13 must be GREEN and committed after Receipt and Bootstrap owner providers. This state is currently unreachable. Task 10 would own only the compatibility Artifact Gate workflow in this file list. Task 11 would own typed production inputs, accepted-to-bounded-poll controller composition, terminal-bundle consumption, closeout/final-status wiring, and controller tests; Task 12 would own the production workflow; Task 13 would own the bounded-PR-comment Deploy Note path and its terminal/no-claim tests.
- Consume the Artifact-owned controller, workflow, and Deploy Note bytes as immutable cross-owner inputs. This task does not edit, stage, recommit, refactor, wire, wrap, or restate their poll limits, delay policy, terminal classifier, typed input parser, finalStatusSink, CLI, terminal-bundle composition, closeout adapter composition, workflow shell, or bounded merged-PR comment renderer. In particular, all controller wiring remains in Artifact Tasks 11-12; Integration produces no adapter, branch, sink, workflow step, PR writer, or empty checkpoint commit.
- Validate that artifact_accepted_v1 is admission only; the privately branded sixteen-field ordinary status retains deploymentPlanSha256; Bootstrap readTerminalBundleBytes remains the only bundle assembler with 768-byte raw chunks, 262144 bytes maximum, at most 342 chunks, a 2048-byte response-envelope cap, and timeoutMs 30_000; Receipt ACK validation is independent from the later ordinary committed-status request/response ABI; and the Receipt-built final status reaches the Artifact sink byte-for-byte.
- Validate no-claim behavior only: createNoClaimEvidence bytes stay exact, validatedFinalHostStatus and Actions observation are null, terminal-bundle read and host mutation counts stay zero, and Deploy Note comment publication is a no-op. Validate terminal results write at most one bounded comment to the single merged main source PR and never update its body. Integration adds no no-claim writer, comment writer, or controller branch.
- If any assertion fails, stop and return the defect to the exact owning Artifact, Receipt, or Bootstrap task for a real corrective commit. Integration Task 6 never patches around an owner defect and never creates an empty commit.

- [ ] **Step 1: Verify the owner RED-to-GREEN evidence before testing**

Confirm Artifact Tasks 11-13 recorded their failing tests before implementation, including acceptance-versus-terminal ordering, typed production inputs, the real eight-result controller matrix, 768/342 terminal-bundle boundaries, complete transportResult validation, ACK-versus-independent-status separation, no-claim zero mutation, exact sink bytes, and Task 13's exact merged-PR resolution, bounded comment fields, and PR-body immutability. Missing owner RED evidence is RED and returns to its owning Artifact task; do not manufacture a new failing Integration change.

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

Assert the runbook names every new workflow and its authority; describes one main source-only Draft PR whose body contains only `Production status: not_deployed`; states manual Deploy plus automated deployment/validation/code rollback/cleanup; includes the G1-G9 handoff; names Host's sole G1a bundle installer and sole branded inventory-reader provider; distinguishes G2 compatibility inventory from G3 bootstrap activation with separate evidence/codecs/transports; states that Bootstrap privately consumes the activation-ready frame and Integration supplies only `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS` before seeing the terminal response, with pre-ready zero mutation and post-ready durable cleanup/recovery; records the exact five-method transport and recovery challenge -> selector -> at most six ordinary requests at 0 through 25 seconds -> seventh 30-second no-request boundary -> one terminal-bundle session sequence; preserves the existing identity and health headings in order; labels receipt recovery exceptional; identifies the critical finalizer as the automatic boot/path recovery chain rather than a new manual Gate; requires a fresh Risk A Gate only for later critical-fence clearing/manual repair; limits the one real Deploy Note to an Artifact-owned bounded merged-PR comment after G9 without PR-body mutation; and states that no source approval is production approval. Assert RELEASE_MANIFEST.md preserves Artifact Manifest v1 and not_deployed, describes durable companions outside artifact.json, and does not claim a real Release or production configuration exists.

~~~js
test('deployment runbook preserves authority and rollout boundaries', () => {
  const runbook = readText('docs/GITHUB_DEPLOYMENT_RUNBOOK.md');
  const identity = runbook.indexOf('### Protected Release Config Identity Gate');
  const health = runbook.indexOf('### Condition-Driven Promotion Health Window');
  assert.ok(identity >= 0);
  assert.ok(health > identity);
  assert.match(runbook, /one main source-only Draft PR/i);
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

The workflow matrix distinguishes release-artifact, production-deploy-dry-run, control-plane-source-integration, compatibility and normal read-only inventory, both Artifact Gates, production deploy, and receipt recovery. It records the staged-bundle/host-execution/receipt contracts; Host's sole `createControlPlaneHostBundleInstaller(...).installAndReadBack(...)` G1a path and sole branded `createControlPlaneHostInventoryReaders` provider; cig1 versus ig1 rejection; fixed bootstrap credential `requestBootstrap` before G4 versus fixed deploy credential `request` after G4; the exact transport surface `{ execute, request, requestStatusBundle, requestBootstrap, close }`; G2 compatibility-inventory codec/read-only evidence versus G3 activation codec/fixed root launcher with newly armed, non-reusable evidence; Bootstrap's owner-internal activation-ready frame, caller-visible terminal-only response, imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, pre-ready zero-mutation boundary, and post-ready durable cleanup/recovery; original controller closeout artifact's exact name grammar, single-file archive, explicit 35-day retention; recovery's challenge/selector, one through at most six fresh ordinary-status requests at fixed 0-through-25-second intervals under one absolute 30-second deadline, a seventh scheduled 30-second no-request boundary, and one authenticated terminal-bundle stream; automatic critical finalizer boot/path recovery and later Host post-finalizer proof; and the no-claim/no-comment boundary without claiming current repository settings or host state.

The main source PR section uses exactly `Production status: not_deployed` and contains no Deploy Note. The G9 section says Artifact Task 13 owns the only real Deploy Note path: after a validated terminal final status, an isolated job may write at most one bounded comment to the single merged main source PR; it never edits the PR title/body. Nonterminal and no-claim outcomes make zero comment write. A critical terminal finalizer is part of the automatic boot/path recovery chain and introduces no new manual click inside G9; only a subsequent attempt to clear the retained critical fence or perform manual repair requires a separately approved Risk A Gate.

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

Add one compact row per design/plan/runbook/schema. Mark every plan as source implementation guidance, every production Gate as separately approved, and the main source PR as not deployed.

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

## Task 9: Resolve the Issue, open one main Draft PR, and hand off exact-head evidence

**Current reachability: STOP.** Task 9 cannot start: all Source Tasks 1-9 and the full validation/review matrix are unreachable under the current hard STOP. Do not resolve/push/create/reuse a PR through the steps below, do not hand evidence to the master Ready/Merge owner, and do not treat an existing Draft as eligible for transition. These steps remain future instructions only after the four-prerequisite Source-resumption gate is satisfied and the complete provider order has run successfully. Until then the main PR remains Draft and Ready/Merge plus G1 are unreachable.

**Files:**

- Verify every file owned by all six plans.
- Do not create a validation-result file in the repository.
- Do not modify production state documents.

**Interfaces:**

- Future-only entry: consume every same-branch checkpoint from Tasks 1-8 and all owner-plan focused commands only after the four-prerequisite Source-resumption gate is satisfied; no such complete checkpoint set is currently claimable.
- Require the graph's exact provider/consumer handoffs to be complete: Host Task 11A's broker plus inventory-reader provider checkpoint precedes its Bootstrap consumer; Integration Task 1 precedes Host Task 14A; Host Task 14A precedes Integration Task 3; and Host Task 14B follows Integration Task 3 but precedes every Integration Task 4-9 checkpoint. Do not accept a numerically sorted task history as equivalent.
- Produce exactly one pushed main branch and exactly one main Draft PR after exact Issue resolution and local body construction; later fixes update that same main PR. Keep it Draft throughout this task.
- Bind the first push, one gh pr create call, PR head/body byte readback, and current-ruleset required check name/App/head/conclusion evidence to one recorded branch and 40-character head. A failure never creates a replacement PR.
- In a future separately authorized run, this task has no source commit of its own unless validation/review exposes a real source defect. A no-change validation pass would be the intended boundary. Ready transition and merge remain forbidden here and would belong only to a separately authorized master implementation program owner; that owner is not currently reachable.

- [ ] **Step 1: Verify the prerequisite and focused suites**

Run every focused command from the six plans. Then run this slice:

~~~bash
node --test --test-concurrency=1 server/tests/control-plane-staged-bundle-manifest.test.mjs server/tests/control-plane-host-bundle-installer.test.mjs server/tests/control-plane-github-evidence.test.mjs server/tests/github-immutable-release-publisher.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-required-check-contract.test.mjs server/tests/control-plane-required-check-registry.test.mjs server/tests/control-plane-inventory-attestation-predicate.test.mjs server/tests/control-plane-inventory-receipt.test.mjs server/tests/control-plane-compatibility-inventory-receipt.test.mjs server/tests/control-plane-host-inventory-readers.test.mjs server/tests/control-plane-readonly-inventory.test.mjs server/tests/control-plane-compatibility-readonly-inventory.test.mjs server/tests/control-plane-inventory-policy-check.test.mjs server/tests/control-plane-inventory-receipt-publisher.test.mjs server/tests/control-plane-readonly-inventory-workflow.test.mjs server/tests/control-plane-compatibility-readonly-inventory-workflow.test.mjs server/tests/control-plane-source-integration.test.mjs server/tests/control-plane-source-integration-workflow.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs server/tests/control-plane-deployment-documentation.test.mjs
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

This is one main source-only Draft PR after the separately merged narrow authority-bootstrap predecessor. It does not configure GitHub, publish a production Release, access a host, change a database, or deploy production.

## Issue / Index Card

- Issue: Refs #{0}
- Issue role: A-tier implementation index card
- Close behavior: refs only

## Agent / Task Routing

- Lead workstream: source integration controller
- Supporting workstreams: foundation/native feasibility; artifact/workflow; bootstrap/authorization; host/database; receipt/recovery; rollout/documentation
{1}
- Primary unit: control-plane-app
- Related PRs: the separately merged narrow authority-bootstrap predecessor; all six main implementation slices are in this PR
- Handoff target: post-merge Risk A operator gate owner

## Risk

- Risk: A
- Process: approved design, source-only TDD implementation, clean validation, exact-head checks, independent semantic and security review, then separate external Risk A Gates
- Expected PR count: 1 narrow authority-bootstrap predecessor + 1 main source implementation PR
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
- Froze the exact `name,on,permissions,concurrency,jobs` workflow root with no defaults/env extension, inventory absolute-step-zero authority before checkout/protected bindings, and the no-checkout four-step dormant publisher with exact explicit-token and attestation inputs. Authorize/publish/postverify use Artifact's exact owner-unavailable first-statement STOP bytes, attest is always skipped, and raw/parsed topology plus real owner VM/hash tests prove zero current input read, GitHub/Release/attestation/fs/output/completion I/O.
- Added source-only GitHub workflow definitions without dispatching them.
- Updated runbook, release companion semantics, validation baseline, and documentation indexes.
- Did not modify current production state or project-state records.

## Production Status

- Production status: not_deployed
- release_unit: control-plane-app
- This main source-only PR records status only; verified production evidence remains a separate post-merge handoff and never rewrites this body.

## Remaining Gates

- G1: Host-owned createControlPlaneHostBundleInstaller installAndReadBack for static content plus artifact-publication protection readback
- G2: fresh typed compatibility inventory through the Host-branded read-only provider; current Source stops before receipt/artifact publication, and any no-SSH compatibility publication is a future separately reviewed and approved Gate; no activation request
- G3: separately approved compatibility activation through a new requestBootstrap transport using the Bootstrap owner request-timeout constant, owner-internal activation-ready handling with a terminal-only caller response, the Bootstrap activation codec, fixed root launcher, fresh non-G2 activation evidence, backup, and healthy exact rollback release
- G4: credential and authorization bootstrap with verified cleanup and rotation_closed
- G5: fresh protected normal inventory requiring final bootstrap and rotation_closed; current Source stops before receipt publication, which requires a future separately reviewed and approved Gate
- G6: future normal Artifact Gate and immutable Production Gate receipt, blocked until the full Artifact publisher owner is separately reviewed, approved, and activated
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
foreach ($requiredLiteral in @('Risk: A', 'Expected PR count: 1 narrow authority-bootstrap predecessor + 1 main source implementation PR', 'Production status: not_deployed', 'identity_impact: false', 'release_unit: control-plane-app', 'This main source-only PR records status only', 'Supporting workstreams:', 'Supporting agents:', 'G1:', 'G9:')) {
  if (-not $bodyText.Contains($requiredLiteral)) { throw 'draft_body_contract_invalid' }
}
~~~

- [ ] **Step 6: Push once, open one main Draft PR once, and verify the no-secret packet**

Re-read the main branch, head, and temporary body bytes before the first push. Push only that main branch with --set-upstream, require the remote ref to equal the recorded head, and create the main Draft with exactly one gh pr create --draft --body-file call. On a retry, reuse the single existing open main Draft; a closed PR, non-Draft PR, duplicate, body drift, or head drift is a stop and never creates a second main PR.

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

Wait for the one Draft's checks, then use closed, bounded pagination to read every active ruleset, every rule evaluated for protected master, every exact-head check run, and every exact-head Actions workflow run. Each reader validates the raw REST row and immediately returns only its fixed camelCase projection; neither the snapshot nor Task 2 ever receives a raw API object. Cap each collection at twenty 100-row pages; a full final page, pagination loop, duplicate ruleset/run ID, missing/non-positive check-suite identity, unstable total_count, missing page termination, or a second-snapshot difference is RED rather than partial success. Every required rule must carry a positive integration_id. Match it to exactly one projected run whose context, positive integrationId, appSlug, headSha, status, and conclusion agree; nullable integration identity and a typed or guessed production App ID are forbidden.

Task 9 keeps identity and observation structures separate. Pass only the closed stable `rulesetRequirements`, projected exact-head `{ checkRunId, checkSuiteId, context, integrationId, appSlug, headSha, status, conclusion, detailsUrl }` `checkRuns`, projected exact-head `{ workflowRunId, workflowId, checkSuiteId, repository, headSha, headBranch, event, path, runAttempt, status, conclusion }` `workflowRuns`, and `exactHead` to Task 2's sole `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns, workflowRuns })`; use its returned canonical eight-field requiredCheckContracts identity array/bytes/digest unchanged. The PowerShell readback below produces runtime producer observations from those same projections with check-run/suite/workflow-run IDs plus context/App/head/status/details and observed workflow path/ref/SHA. Pass those observations plus the owner-returned identities to validateRequiredCheckRunObservations. The PR-head identity retains its observed PR branch and is Draft review evidence only; inventory and Artifact preflight on protected `master` independently resolve a new byte-equal pair to each other and require the master ref/source, rather than comparing either to the premerge branch identity. Never serialize runtime status into the identity, replace the identity with an observed row, pass a snake_case/raw REST row, or map workflow path/ref/SHA in PowerShell or Artifact. The typed identities must retain validate and codeql roles, and the separately required Control Plane Source Integration workflow observation must bind the exact head and live App to the actual direct workflow run through the same Task 2 resolver. Absence, ambiguity, suite/run drift, a second registry/array/canonicalizer, or provider disagreement is RED.

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
      $checkRunId = [string]$row.id
      $checkSuiteId = [string]$row.check_suite.id
      $integrationId = [string]$row.app.id
      $context = [string]$row.name
      $appSlug = [string]$row.app.slug
      $headSha = [string]$row.head_sha
      $status = [string]$row.status
      $conclusion = [string]$row.conclusion
      $detailsUrl = [string]$row.details_url
      if ($checkRunId -notmatch '^[1-9][0-9]*$' -or -not $seenIds.Add($checkRunId)
        -or $checkSuiteId -notmatch '^[1-9][0-9]*$'
        -or $integrationId -notmatch '^[1-9][0-9]*$'
        -or $context -notmatch '^[^\x00-\x1f\x7f]{1,200}$'
        -or $appSlug -notmatch '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$'
        -or $headSha -cne $exactHead
        -or $status -notmatch '^[a-z_]{1,40}$'
        -or $conclusion -notmatch '^[a-z_]{1,40}$'
        -or $detailsUrl -notmatch '^https://github\.com/[^\r\n]{1,1000}$') {
        throw 'exact_head_check_projection_invalid'
      }
      $rows += [pscustomobject][ordered]@{
        checkRunId = [long]$checkRunId
        checkSuiteId = [long]$checkSuiteId
        context = $context
        integrationId = [long]$integrationId
        appSlug = $appSlug
        headSha = $headSha
        status = $status
        conclusion = $conclusion
        detailsUrl = $detailsUrl
      }
    }
    if ($rows.Count -eq $expectedTotal) { $terminated = $true; break }
    if ($pageRows.Count -lt 100) { throw 'exact_head_check_pagination_short' }
  }
  if (-not $terminated -or $rows.Count -ne $expectedTotal -or $rows.Count -eq 0) { throw 'exact_head_check_pagination_truncated' }
  return @($rows | Sort-Object checkRunId)
}

function Read-ClosedExactHeadWorkflowRuns {
  $rows = @()
  $seenRunIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $seenSuiteIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $expectedTotal = $null
  $terminated = $false
  for ($page = 1; $page -le 20; $page++) {
    $pageValue = Invoke-ExactGitHubJson ('repos/' + $repository + '/actions/runs?head_sha=' + $exactHead + '&per_page=100&page=' + [string]$page)
    if ($null -eq $pageValue.workflow_runs -or [string]$pageValue.total_count -notmatch '^[0-9]+$') { throw 'exact_head_workflow_run_page_invalid' }
    if ($null -eq $expectedTotal) {
      $expectedTotal = [int]$pageValue.total_count
      if ($expectedTotal -gt 2000) { throw 'exact_head_workflow_run_total_exceeds_bound' }
    }
    elseif ([int]$pageValue.total_count -ne $expectedTotal) { throw 'exact_head_workflow_run_total_drift' }
    $pageRows = @($pageValue.workflow_runs)
    if ($pageRows.Count -gt 100) { throw 'exact_head_workflow_run_page_oversized' }
    foreach ($run in $pageRows) {
      $runId = [string]$run.id
      $workflowId = [string]$run.workflow_id
      $suiteId = [string]$run.check_suite_id
      $runRepository = [string]$run.repository.full_name
      $headSha = [string]$run.head_sha
      $headBranch = [string]$run.head_branch
      $event = [string]$run.event
      $path = [string]$run.path
      $runAttempt = [string]$run.run_attempt
      $status = [string]$run.status
      $conclusion = [string]$run.conclusion
      if ($runId -notmatch '^[1-9][0-9]*$' -or -not $seenRunIds.Add($runId)) { throw 'workflow_run_id_invalid_or_duplicate' }
      if ($workflowId -notmatch '^[1-9][0-9]*$'
        -or $suiteId -notmatch '^[1-9][0-9]*$' -or -not $seenSuiteIds.Add($suiteId)
        -or $runRepository -cne $repository -or $headSha -cne $exactHead
        -or $headBranch -notmatch '^[a-zA-Z0-9](?:[a-zA-Z0-9._/-]{0,198}[a-zA-Z0-9_-])?$'
        -or $headBranch.Contains('..') -or $headBranch.Contains('//')
        -or $event -notmatch '^[a-z_]{1,80}$'
        -or $path -notmatch '^[^\x00-\x1f\x7f]{1,1024}$'
        -or $runAttempt -notmatch '^[1-9][0-9]*$'
        -or $status -notmatch '^[a-z_]{1,40}$'
        -or $conclusion -notmatch '^[a-z_]{1,40}$') {
        throw 'exact_head_workflow_run_projection_invalid'
      }
      $rows += [pscustomobject][ordered]@{
        workflowRunId = [long]$runId
        workflowId = [long]$workflowId
        checkSuiteId = [long]$suiteId
        repository = $runRepository
        headSha = $headSha
        headBranch = $headBranch
        event = $event
        path = $path
        runAttempt = [long]$runAttempt
        status = $status
        conclusion = $conclusion
      }
    }
    if ($rows.Count -eq $expectedTotal) { $terminated = $true; break }
    if ($pageRows.Count -lt 100) { throw 'exact_head_workflow_run_pagination_short' }
  }
  if (-not $terminated -or $rows.Count -ne $expectedTotal) { throw 'exact_head_workflow_run_pagination_truncated' }
  return @($rows | Sort-Object workflowRunId)
}

function Read-ClosedEvidenceSnapshot {
  $activeRulesets = @(Read-ClosedActiveRulesets)
  $requirements = @(Read-ClosedProtectedMasterRequirements $activeRulesets)
  $checkRuns = @(Read-ClosedExactHeadCheckRuns)
  $workflowRuns = @(Read-ClosedExactHeadWorkflowRuns)
  $stableValue = [pscustomobject][ordered]@{
    activeRulesets = @($activeRulesets)
    requirements = @($requirements)
    checkRuns = @($checkRuns)
    workflowRuns = @($workflowRuns)
  }
  return [pscustomobject]@{
    activeRulesets = $activeRulesets
    requirements = $requirements
    checkRuns = @($checkRuns)
    workflowRuns = @($workflowRuns)
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
$workflowRuns = @($snapshotB.workflowRuns)

$requiredCheckRunObservations = foreach ($required in $rulesetRequirements) {
  $matches = @($checkRuns | Where-Object {
    $_.context -ceq $required.context -and
    $_.headSha -ceq $exactHead -and
    [string]$_.integrationId -ceq [string]$required.integrationId
  })
  if ($matches.Count -ne 1) { throw 'required_check_context_integration_ambiguous' }
  $match = $matches[0]
  if ($match.status -cne 'completed' -or $match.conclusion -cne 'success') { throw 'required_check_not_successful' }
  if ([string]$match.checkRunId -notmatch '^[1-9][0-9]*$'
    -or [string]$match.checkSuiteId -notmatch '^[1-9][0-9]*$'
    -or [string]$match.integrationId -notmatch '^[1-9][0-9]*$'
    -or [string]$match.appSlug -notmatch '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$') {
    throw 'required_check_app_identity_invalid'
  }
  $producerMatches = @($workflowRuns | Where-Object {
    [string]$_.checkSuiteId -ceq [string]$match.checkSuiteId
  })
  if ($producerMatches.Count -gt 1) { throw 'required_check_workflow_producer_ambiguous' }
  $producer = if ($producerMatches.Count -eq 1) { $producerMatches[0] } else { $null }
  $workflowPath = $null
  $workflowRef = $null
  $workflowSha = $null
  if ($null -ne $producer) {
    if ([string]$producer.path -notmatch '^\.github/workflows/[a-zA-Z0-9._-]+\.ya?ml$') { throw 'required_check_workflow_run_path_invalid' }
    if ([string]$producer.headBranch -notmatch '^[a-zA-Z0-9](?:[a-zA-Z0-9._/-]{0,198}[a-zA-Z0-9_-])?$' -or [string]$producer.headBranch -match '\.\.|//') { throw 'required_check_workflow_run_branch_invalid' }
    $workflowPath = [string]$producer.path
    $workflowRef = 'refs/heads/' + [string]$producer.headBranch
    $workflowSha = [string]$producer.headSha
  }
  [pscustomobject][ordered]@{
    checkRunId = [long]$match.checkRunId
    checkSuiteId = [long]$match.checkSuiteId
    workflowRunId = if ($null -eq $producer) { $null } else { [long]$producer.workflowRunId }
    context = [string]$match.context
    integrationId = [long]$match.integrationId
    appSlug = [string]$match.appSlug
    headSha = [string]$match.headSha
    status = [string]$match.status
    conclusion = [string]$match.conclusion
    detailsUrl = [string]$match.detailsUrl
    workflowPath = $workflowPath
    workflowRef = $workflowRef
    workflowSha = $workflowSha
  }
}

$runtimeObservationJson = ([pscustomobject][ordered]@{
  sourceCommit = $exactHead
  observations = @($requiredCheckRunObservations)
} | ConvertTo-Json -Depth 10 -Compress)
$runtimeObservationBytes = $utf8NoBom.GetBytes($runtimeObservationJson)
$runtimeObservationSha256 = Get-ExactSha256 $runtimeObservationBytes

$sourceIntegrationMatches = @($checkRuns | Where-Object {
  $_.context -ceq 'Control Plane Source Integration' -and
  [string]$_.checkRunId -match '^[1-9][0-9]*$' -and [string]$_.integrationId -match '^[1-9][0-9]*$' -and
  [string]$_.appSlug -match '^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$' -and
  $_.headSha -ceq $exactHead -and $_.status -ceq 'completed' -and $_.conclusion -ceq 'success'
})
if ($sourceIntegrationMatches.Count -ne 1) { throw 'source_integration_exact_identity_invalid' }
~~~

Call only `resolveControlPlaneRequiredCheckContracts({ sourceCommit: exactHead, rulesetRequirements, checkRuns, workflowRuns })` with the reader-owned stable camelCase projections above, never the raw `gh api` rows. Its module-private semantic/context policy maps roles and expected paths only; `integrationId`/`appSlug` come from the projected check snapshot, while workflow path/ref/SHA come only from the uniquely joined projected direct Actions run with the same observed check-suite ID. `workflowPath` is the projected copy of the run's raw path byte-for-byte, `workflowRef` is derived only from its separately observed safe `headBranch`, and `workflowSha` is its observed `headSha`, which must equal `exactHead`; the resolver never claims that REST returned a combined `path@ref` or separate workflow-SHA field. Pass that exact returned identity array through validateRequiredCheckRunObservations with the separate requiredCheckRunObservations; do not call a local identity builder, context switch, second canonicalizer, exported registry, or static workflow mapping. This premerge result binds its actual PR branch and is Draft review evidence only; do not require or claim byte equality with a later protected-master inventory/Artifact result. Those later consumers must independently re-read and require `headBranch: master`, `workflowRef: refs/heads/master`, and exact source SHA. Require exactly one validate and one codeql semantic role, and bind the Control Plane Source Integration observation to its actual producer through the same provider. A result for a merge commit, previous head, pagination-truncated snapshot, rerun with changed source, similarly named check from another integration/App, same-context check under the same App from another suite/workflow, or changed tuple between the two snapshots does not count.

- [ ] **Step 8: Obtain independent semantic and security reviews**

The semantic reviewer checks design-to-code field coverage, workflow composition, terminal state mapping, documentation truthfulness, and source/production separation. The security reviewer checks permissions, secret isolation, OIDC/SSH boundaries, parser closure, replay/expiry, immutable publication, cleanup, redaction, and failure recovery. Resolve every actionable thread and rerun the complete matrix on the new exact head.

The exact Draft body is constructed, hashed, and written in Step 5 before the first push. It uses Refs rather than Closes because external G1-G9 remain, records Supporting workstreams separately from truthful Supporting agents, and contains no preclaimed validation result.

- [ ] **Step 9: Keep the sole PR Draft and hand evidence to the master owner**

In a future run after the four-prerequisite Source-resumption gate is satisfied, do not mark Ready or merge in this task even when every check and review is green. Only then record the sole Draft PR URL/number, exact branch/head/body digest, both closed ruleset/check-run snapshot digests, canonical eight-field requiredCheckContracts digest, separate runtime-observation digest, validation matrix, and independent review results for a separately authorized master implementation owner. Current work must not produce that handoff: no complete exact-head evidence exists, the main PR remains Draft, and no Ready/Merge owner is reachable.

The current Task 9 state is unreachable, not GREEN or a reviewable failure retry: `full_sigstore_owner_topology_unapproved`, unavailable immutable-lock full-owner postverification, the offline npm hard STOP, and the absence of a separate explicit Risk-A resumption approval prevent Step 1 from starting. Do not add a corrective commit, restart Task 9, push, or hand off. Its described future success state—one existing main Draft PR, one exact reviewed head, all checks/reviews green, a clean worktree, and a complete evidence packet—becomes eligible for consideration only after the four-prerequisite Source-resumption gate is satisfied and the complete provider order runs. Even that future evidence would grant no Ready/Merge or external Gate by itself.

## External G1-G9 Handoff Only

This section preserves the future post-merge operator contract only. It is not an execution checklist for the source implementation agent, contains no production command, and grants no approval. G1-G9 are currently unreachable because Foundation, all Source Tasks 1-9, Ready/Merge, and merge are unreachable. No row below becomes actionable until the four-prerequisite Source-resumption gate is satisfied, the complete provider order and validation matrix pass, a separate Ready/Merge decision is made, and the required reconciliation finishes.

| Gate | External action after merge | Required independent approval/evidence | Mandatory stop |
| --- | --- | --- | --- |
| G1 | G1a calls only Host `createControlPlaneHostBundleInstaller(deps).installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding })` to install/read back the immutable root-owned static bundle; G1b establishes and reads back artifact-publication protection without production secrets | Fresh provider inventory and exact provider approval for G1a; byte-identical Integration manifest/content receipt and Bootstrap layout; GitHub owner approval and policy readback for G1b | Any byte, nonce, contract, ownership, permission, Environment, reviewer, branch-policy ambiguity, alternate stager, caller-selected path/root/allowlist, overwrite, unit start, or enable attempt |
| G2 | Use a fresh G2-only Bootstrap evidence binding to send exactly one 10,000-ms single-response compatibility-inventory frame through `requestBootstrap`, call only Host's branded `compatibilityInventoryReader.read(request)`, and prepare the opaque canonical cig1 publication candidate. The current dormant publisher then returns only `artifact_inventory_publisher_owner_unavailable`; it publishes neither a receipt nor a compatibility artifact. Any no-SSH receipt/artifact publication is a future separately reviewed Source change and separately approved Risk A Gate | Separately approved Settings/provider Gate has installed and read back the exact user-only/master-only/no-self/no-bypass Environment; unprotected preflight emits only Artifact-owner-bound inventory/publication packet pairs; after exact inventory approval, absolute `steps[0]` performs the fixed inline fresh policy/same-run approval/exact-user recheck before checkout and the ten bindings/materializer; only then exact-S checkout, tokenless owner-data consume, and five-plus-five materialization run. The current `artifact-publication` job retains four no-checkout steps and four explicit token placements, but its three exact Artifact owner bodies stop before input/I/O and pinned attest is always skipped; real owner-fixture evidence proves zero Release/attestation/fs/output/completion. Immutable compatibility declaration has automatedDeploymentEligible false | Workflow root order/default/env/alias/duplicate drifts; any second policy/approval/publication contract exists; checkout/action/default token or protected binding precedes inventory `steps[0]`; bootstrap activation/root launcher is reachable; typed/database/rollback evidence differs; policy/approval is stale, wrong-run, Team/unknown, self, bypassed, drifted, or ambiguous; any unavailable STOP is bypassed/moved/changed, attest becomes reachable, any input/GitHub/Release/attestation/fs/output/completion I/O occurs, or G2 evidence is marked reusable |
| G3 | Under a separately armed activation and backup/manual Gate, create a new bootstrap transport, call `requestBootstrap` with credentialId `japan-control-plane-github-bootstrap-v1`, only `encodeBootstrapActivationRequestFrame`, and the imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`; Bootstrap internally consumes ready and returns only the terminal response for `validateBootstrapActivationResponseFrame`, while the remote handler invokes the fixed root launcher; finish with a healthy exact rollback release | New non-G2 activation ID/evidence, exact backup scope, rollback artifact/tree proof, hostActivationReceiptSha256, operator approval; valid >10-second and <=900-second activation plus pre-ready zero-mutation and post-ready durable-recovery evidence | A compatibility-inventory frame/reader is called, a caller constructs/parses ready or hard-codes an activation timeout, a deploy credential is used before G4, activationId is accepted as a material selector, any G2 activation/response/materialization/transport/approval evidence is reused, a ready failure mutates/extends a deadline, post-ready failure bypasses durable cleanup/recovery, or backup/health/writer/data/readback fails |
| G4 | Create the bounded credential/authorization bootstrap generation, updater lifecycle, Environment protection/secrets, final receipt, dual cleanup proof, and rotation_closed | Provider-console approval limited to fifteen minutes; GitHub owner approval; independent readback of host and GitHub cleanup | Any key, token, App, installation, sudoers, activation lease, cgroup, state lease, or rotation fence remains unresolved |
| G5 | Manually run typed normal ig1 inventory-only request/response through `request` with the fixed deploy credential and call only Host's branded `normalInventoryReader.read(request)` to prepare the opaque canonical two-hour-receipt candidate. The current dormant publisher returns only `artifact_inventory_publisher_owner_unavailable` and publishes no receipt. Publication is a future separately reviewed Source change and separately approved Risk A Gate | Exact G5 operator dispatch; preflight carries unchanged Artifact-owner inventory/publication packets; then exact protected reviewer approval followed by inventory absolute `steps[0]` fixed inline fresh byte-equal policy/current-run approval/exact-user readback before checkout, any normal secret/variable, or materializer. Exact-S checkout and tokenless owner-data consume follow; staged bundle, final bootstrap/authorization cleanup, rotation_closed, sole Task 2 required-check result, runtime, writers, normalized databaseContracts bytes, and rollback all agree. The current no-checkout exact-four-step `artifact-publication` job keeps its closed permissions/token/pin topology while all three inline owner bodies stop before input/I/O and attest is always skipped | Workflow root order/default/env/alias/duplicate drifts; a second policy/approval/publication parser exists; checkout/action/default token or protected binding precedes recheck; policy/approval is stale, wrong-run/attempt, Team/unknown, self, bypassed, drifted, or ambiguous; a copied Host reader/registry, cig1 receipt, or lossy database projection is accepted; final bootstrap/rotation evidence is absent; capability/materializer ordering fails; the unavailable STOP/topology/body/token/attest condition drifts, any publisher input/GitHub/Release/attestation/fs/output/completion I/O occurs, or any inventory request would mutate/acknowledge host state |
| G6 | After the future full Artifact publisher owner is separately reviewed, approved, and activated, manually run the normal Artifact Gate for an exact fresh published inventory and merged master; current dormant Source cannot enter G6 | New approval for that owner/source activation plus operator start; independent artifact-publication reviewer approval; durable assets, provenance, retrievability, and Production Gate receipt validation | Current owner remains unavailable; inventory expiry; source drift; runtime mismatch; publication conflict; missing provenance; or rollback incompatibility |
| G7 | Operator reviews the immutable Production Gate receipt and clicks Deploy with only its exact ID and confirmation | Explicit operator decision bound to the exact receipt | Any field is unclear, expired, changed, or not retrievable |
| G8 | A canonical `type:"user"` reviewer distinct from actor and triggering actor approves the exact pending `vultr-japan-production` deployment job and run-bound plan; G5 inventory policy/approval evidence is ineligible for reuse | The deployment workflow independently performs its own protected first-step current user-only Environment policy, current-run approval-history, and exact `/users/{login}` stable-ID/login readback after approval; Team/unknown reviewers and admin bypass are rejected | Reuse of a G5 packet/approval, protected value before the G8 recheck, self approval, stale approval, wrong run/attempt, source drift, bypass, or policy mismatch |
| G9 | GitHub automatically deploys, validates, performs code rollback when required, runs the automatic critical-finalizer boot/path recovery chain when needed, cleans credentials/temporary state, validates the terminal receipt, performs final ordinary read-only validation (including Host post-finalizer proof for critical), and lets the isolated Artifact-owned job write at most one bounded Deploy Note comment to the single merged main source PR | No additional click during the normal or automatic-finalizer path; terminal bundle plus state-appropriate later ordinary status must be complete before the bounded comment | Any nonterminal, critical proof absent, cleanup-pending, receipt-loss, rollback-validation, final-readback, PR identity, comment-bound, or PR-body-immutability failure; no comment is written |

Receipt recovery, bootstrap updater cleanup, and any operator-driven resume/abort path are exceptional fresh Risk A Gates. They are not retries inside G1-G9 and cannot reuse the source review, operator dispatch, Environment approval, or a failed run. The critical terminal finalizer itself is not a new manual Gate: it is the fixed automatic boot/path recovery chain already included in G9, and its later ordinary status is withheld until Host's post-finalizer proof succeeds. Only a subsequent attempt to clear the retained critical fence or perform manual repair requires a new exact Risk A Gate.

## Post-Merge Reconciliation Boundary

This boundary is future-only and currently unreachable. Only after the four-prerequisite Source-resumption gate restores the complete provider order, the complete matrix/reviews finish, and a separately authorized Ready/Merge actually makes the main source PR merge visible on protected master may a mandatory C-tier branch and Draft PR update docs/CURRENT_RELEASE_STATE.md, docs/PROJECT_CONTEXT.md, the exact project-state records required by the current schema, and the sole canonical `project-state/control-plane-main-source-identity.json` instance. That future reconciliation must:

- run the already-merged owner's real direct-main entry exactly as `control-plane-main-source-identity.mjs record --pull-request <positive-integer>`, with the existing `env.GITHUB_TOKEN` as its sole GitHub read-only API credential and explicitly not as a production credential; the closed CLI must use only its fixed GitHub fetch and fixed `MAIN_SOURCE_IDENTITY_PATH` filesystem boundaries, creator, create-missing-only writer, and independent owner readback, then commit only the canonical instance after an exit-`0` `created|already_exact` result; the token value must never enter disk, logs, stdout, stderr, exception output, fixtures, or an artifact, byte-identical existing content is an idempotent zero-write result, and missing credential, argv/fetch/fs/readback failure, symlink/type drift, or conflicting existing bytes returns only the frozen bounded error/exit result and stops without mutation;
- bind the exact `mainSourcePrNumber`, `mainSourceHeadSha`, `mainSourceMergeCommitSha`, and canonical `mainSourceIdentitySha256`, with no current-master/sourceCommit field and no self-reference;
- say source capability merged, production configuration absent or unverified, production_state not_deployed, and G1-G9 pending;
- preserve unknown or drift-prone GitHub settings as unverified until live readback;
- add only the canonical identity instance among this contract's implementation files; the separately enumerated truthful merged/`not_deployed` docs and existing-schema project-state records remain required, but the PR must not modify `scripts/check-project-state.mjs`, `server/tests/project-state-check.test.mjs`, the identity schema/module/CLI/tests, or introduce a second validator/resolver, because all checker and owner code must already exist on protected master;
- run git diff --check origin/master...HEAD, npm run docs:authority:check, and npm run project-state:check;
- require the base-owned `Control-plane main-source identity history` check on that exact PR head to prove one canonical `100644` first add and byte-identical trusted checker/workflow files; any missing, skipped, neutral, stale, or failed result blocks Ready/Merge;
- contain no GitHub settings mutation, secret creation, workflow dispatch, provider access, host access, production validation, or Deploy Note claim.

Do not fold that reconciliation into the main source PR because its exact merge SHA does not exist before merge. No G1-G9 step starts until the reconciliation PR is merged and a fresh read-only owner validation proves the recorded main merge is identical to or an ancestor of the current protected-master source commit.

## Real Deploy Note Boundary

The main source PR body contains only `Production status: not_deployed` and never contains a Deploy Note. A real Deploy Note is written only after G9 yields a verified terminal controller closeout and state-appropriate final ordinary read-only validation.

For deployed_validated, record `deployed_at` only from the Receipt-owned final status's exact-copy `terminalPublishedAt`, which originates in the validated Host terminal body; also record release_unit control-plane-app, exact source_commit, immutable artifact/Release identity, target japan-control-plane, backup identity, validation summary, and identity_gate Not applicable. Never substitute the controller observation time, workflow clock, comment time, or a reconstructed timestamp.

For rolled_back, schema_committed_previous_release_validated, stopped_pre_switch, or critical_manual_intervention_required, record the exact verified terminal outcome and do not use language that implies successful deployment. For critical, the comment is eligible only after the automatic finalizer has completed and Host's private post-finalizer proof has propagated into the final Bootstrap ordinary-status brand; clearing the critical fence or manual repair remains a new Gate. A recovery no-claim is attempt-scoped diagnostic evidence only: it is not published as a recovered closeout, never creates or updates a Deploy Note comment, and requires a new exact Gate before any further claim. A missing or nonterminal closeout likewise creates no comment and opens a fresh recovery Gate.

The isolated Artifact-owned Deploy Note job may write at most one bounded comment to the single exact merged main source PR only after validating same-run aggregate closeout evidence. It selects that target exclusively from the final-status-bound `mainSourcePrNumber`, byte-compares fresh PR head/merge readback with `mainSourceHeadSha`/`mainSourceMergeCommitSha`, and repeats the main-merge-to-deployment-source ancestry check; it never queries commit-associated PRs by `sourceCommit`. It never changes the PR title/body, creates a comment for no-claim/nonterminal evidence, or writes any repository file. Any durable production state document update belongs in a later closeout PR and must bind the exact workflow run, run attempt, source commit, main source identity, artifact, receipt, target, backup, and validation evidence.

## Acceptance Checklist (Future Complete Plan; Current STOP)

The checklist below is retained as the future complete-plan acceptance contract. None of its downstream completion, validation, review, PR, merge, reconciliation, or Gate items may be checked under the current authorization. Current truth is limited to review of the separate exact 11-file authority-bootstrap Draft, which must remain Draft: the four-prerequisite Source-resumption gate is unsatisfied, so Foundation eligibility and all Source Tasks 1-9 are unavailable, while Ready/Merge, reconciliation, and G1-G9 remain unreachable.

- [ ] Future prerequisite: after the four-prerequisite Source-resumption gate is satisfied, Foundation/native feasibility passes on target-matching disposable Linux with no skipped capability. Neither prerequisite is currently satisfied or claimable.
- [ ] Future complete run: all six main implementation plans are implemented on one main branch and one main Draft PR after the separately merged narrow authority-bootstrap predecessor; current approval does not authorize this run.
- [ ] The main PR contains the sole main-source identity schema/module/CLI/tests, base-owned history checker/workflow, and one-time project-state checker/test integration but no identity instance. Missing fixed-path identity remains valid before reconciliation; presence is accepted only through the owner byte validator. The owner writer is create-missing-only and idempotent only for byte-exact content, conflicting existing bytes fail without mutation, and the public resolver performs its own fixed PR GET plus compare GET before signing a private brand. After merge, the mandatory C-tier reconciliation PR adds the fixed canonical `100644` instance as the only new identity-contract artifact, updates only the separately enumerated truthful merged/`not_deployed` docs/state, passes the exact trusted-base history check, and passes fresh PR plus ancestry readback before G1-G9. Once present, every later PR retains byte-identical v1 content; a future origin uses a new versioned path while v1 remains immutable.
- [ ] The reconciliation helper has one real exported `main` and one direct-main guard over the exact `record --pull-request <positive-integer>` grammar, reads only `env.GITHUB_TOKEN` as a GitHub read-only API credential, fixes its GitHub fetch and `MAIN_SOURCE_IDENTITY_PATH` filesystem boundaries, calls the owner creator and create-missing-only writer, independently owner-validates final readback, and exposes only the frozen bounded `0/1/2/3` results. Tests cover absent credential, every missing/duplicate/reordered/extra/unknown or credential/path/overwrite argv, bounded fetch failures, first create, byte-identical existing zero-write success, conflict, symlink/type drift, readback race/mismatch, token non-disclosure, and immutable history after creation without a stubbed creator or writer.
- [ ] Final host-execution, receipt, and staged-host bundle contracts are computed from complete final static bytes and read back exactly.
- [ ] Bootstrap's host layout includes Host's `control-plane-host-inventory-readers.mjs` static source, while the Host-owned external `control-plane-host-bundle-installer.mjs` is not a staged-host entry; Task 1 fails on a missing reader and never creates a self-referential installer manifest.
- [ ] External G1a can reach only `createControlPlaneHostBundleInstaller(...).installAndReadBack({ stagedManifestBytes, contentReceiptBytes, approvalBinding })`; source tests prove exact-byte acceptance, no replacement/start/enable/selectors, and no Integration-owned second stager.
- [ ] Normal ig1 and compatibility cig1 IDs, schemas, resolvers, Releases, assets, bodies, and two-hour expiry are non-interchangeable.
- [ ] Compatibility binds staged content/rollback/runtime/writer/DB baselines and excludes final bootstrap/rotation; normal requires final bootstrap, cleanup, authorization binding, and rotation_closed.
- [ ] Both receipts embed only canonicalizeDatabaseContracts output and bind its sha256; each parent contract registers the exact Host `DATABASE_CONTRACT_ENTRY_EMBEDDING_CONTRACT` object and matching array key without reading/copying it. Inventory, release declaration, and deployment plan independently call the helper and compare bytes plus sha256, while missing/clone/substitution descriptors and all frozen Host-fixture faults reject and no local item contract/order/JSON.stringify path exists.
- [ ] Normal and compatibility read-only inventory use their disjoint Bootstrap-owned pre-Gate request/response codecs plus the matching method of the one Host-branded `createControlPlaneHostInventoryReaders` provider, reject status_response_v1, activation response, and each other, and have no execute, ACK, recovery mutation, terminal bundle, artifact, path/resource selector, or mutation path.
- [ ] G2 compatibility inventory sends exactly one 10,000-ms single-response compatibility-inventory frame through requestBootstrap, never accepts activation-ready, and never reaches a root launcher. G3 uses a new transport/evidence/approval plus only `encodeBootstrapActivationRequestFrame`/`validateBootstrapActivationResponseFrame`, the imported `BOOTSTRAP_ACTIVATION_REQUEST_TIMEOUT_MS`, and the fixed Bootstrap root launcher; Bootstrap alone consumes its internal ready and exposes only the terminal response. Tests prove a valid >10,000-ms and <=900,000-ms operation, the 910,000-ms authenticated deadline and 930-second unit bound, zero mutation on pre-ready write/disconnect, durable cleanup/recovery after post-ready disconnect/timeout/crash, and wrong/duplicate/cross-binding ready rejection without deadline extension. No G2 activation/response/materialization/transport evidence is reusable. Normal/final/recovery uses request with fixed deploy credentialId only after G4; all materialization uses materializeFixedCredential. Current publication is stopped unavailable, and any future separately approved publication uses no SSH.
- [ ] Every transport has exact frozen keys `{ execute, request, requestStatusBundle, requestBootstrap, close }`. Each production/recovery controller owns one multi-operation lifecycle with one sealed credential capture, per-operation cloned/zeroized buffers, and outer-finally close; each typed inventory and G3 owns a separately closed single-request transport.
- [ ] Capability probe completes before the one lazy materialization per lifecycle, any false/unknown capability reads zero protected values, close is idempotent, and all four operation methods reject after transport_closed.
- [ ] Both Task 3 workflows have exact ordered root keys `name,on,permissions,concurrency,jobs`, workflow-level `permissions: {}`, exact ordered jobs `preflight,inventory,publish`, and exact job permission maps `{ actions: read, checks: read, contents: read }`, `{ actions: read, contents: read }`, and `{ actions: read, attestations: write, contents: write, id-token: write }`. Raw and parsed tests symmetrically reject root defaults/env, extra/case/duplicate/anchor/alias/merge keys, including `defaults.run.shell` and `defaults.run.working-directory`. Preflight has no Environment and outputs exactly the inventory-policy and `artifact-publication` policy packet pairs embedding untouched Artifact-owner bytes/digests. Inventory absolute `steps[0]` is the fixed workflow-owned inline fresh authority recheck; zero checkout/action/default token/repository code/secret/variable/materializer precedes it. Only success permits pinned exact-S credential-disabled checkout, tokenless thin owner-data consume, and later exact five-secret/five-variable materialization. `persist-credentials: false` is not misrepresented as preventing checkout's own default-token fetch. Both modes' step-zero bodies are byte-identical, reviewed-SHA pinned, parsed, and executed against Artifact Task 6's real vector corpus. Source exports no second policy/reviewer/approval contract, canonicalizer, REST projection, Team logic, user/org route, PAT, or App credential.
- [ ] Each `publish` job fixes `artifact-publication`, receives only opaque canonical `needs` data, and retains exactly four no-checkout/no-setup/no-download/no-repository-code steps: inline authorize, inline publish, `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6`, and inline verify_complete. Explicit `github.token` count/order is exactly four. Attest explicitly fixes `github-token`, `push-to-registry: false`, and `create-storage-record: false`, has the exact always-false condition, and therefore consumes zero current OIDC; no `artifact-metadata` permission or completion output exists. All six normal/compatibility authorize/publish/verify declarations byte-equal Artifact's frozen dormant owner body/hash, parse, and execute in its real VM fixture. Each body's first statement unconditionally stops with `artifact_inventory_publisher_owner_unavailable` before any opaque-input/policy/approval/user read or I/O; the fixture proves zero GitHub method, Release, attestation, filesystem, output, and completion calls. Any bypass/reorder/body drift, attest enablement, implicit/default token, wrong pin/input, checkout/download/repository CLI/candidate/dynamic import, unlisted method, alias, I/O, or success claim is RED. A happy one-pair publish/attest/`verify_complete` path is future work requiring a separately reviewed Source change and separately approved Risk A Gate. Normal/compatibility fixed Environment families and five-plus-five names remain disjoint; compatibility cleanup/readback before G3 remains mandatory.
- [ ] Task 2 solely exports executable Foundation REQUIRED_CHECK_CONTRACT/REQUIRED_CHECK_ARRAY_CONTRACT plus validateRequiredCheckContracts/canonicalizeRequiredCheckContracts; its separate registry module has the only export `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns, workflowRuns })`, keeps the fixed semantic/context policy private, injects integrationId/appSlug only from closed check evidence and workflow path/ref/SHA only from the uniquely check-suite-joined actual direct Actions run, and returns the exact canonicalizer result. The one-field root resolves its item through nested/arrays, exact eight-field identities exhaust protected-master requirements, include validate/codeql, stay separate from runtime observations, and are consumed byte-for-byte by inventory/Artifact/Task 9 with no second registry, array, mapping, serializer, canonicalizer, or producer-identity fallback.
- [ ] INVENTORY_ATTESTATION_PREDICATE_CONTRACT is a single Integration-owned dependency leaf. The networkless inventory producer prepares the same frozen predicateBindings and exact ordered attestationIdentity for future consumption without copying the contract; the current dormant owner reads neither. A future separately approved full Artifact owner must pass the same object through real generic validation without a copied contract.
- [ ] Seven source-integration scenarios pass with two distinct synthetic SQLite files and no network or external mutation.
- [ ] Original controller closeout upload uses the exact artifact/archive names and explicit 35-day retention.
- [ ] Initial terminal handling preserves the private sixteen-field ordinary status with exact deploymentPlanSha256, calls only Bootstrap readTerminalBundleBytes with timeoutMs 30_000 and owner bounds 768 raw bytes/262144 total bytes/342 chunks/2048 response bytes, and passes its untouched `{ bytes, sha256 }` wrapper to Receipt validateTerminal; controller code contains no copied chunk loop/codec/parser or planSha256 alias.
- [ ] Recovery uses one exact-five-method deploy transport and performs challenge -> validated recovered selector -> Bootstrap `createPostRecoveryStatusRequest` -> one through at most six freshly correlated ordinary `.request` calls at fixed 0/5000/10000/15000/20000/25000-ms points under one absolute 30000-ms deadline -> a seventh scheduled 30000-ms expiry check with zero `.request` call -> exactly one `readTerminalBundleBytes` call/one `requestStatusBundle` session -> Receipt validation. Recovered status can never masquerade as ordinary status; pending/deadline/rejected paths read no bundle and publish nothing; 1/768/769/262144-byte and 1..342-frame boundaries plus ACK-loss are covered.
- [ ] Critical terminal publication is followed by the fixed automatic finalizer boot/path recovery chain, not a new manual Gate. Bootstrap exposes an immutable ordinary terminal only after consuming Host's real post-finalizer proof; only later critical-fence clearing/manual repair requires a separately approved Risk A Gate.
- [ ] Upload-start and ACK pass complete transportResult objects plus exact expected bindings to validateUploadStartedResponse and validateAckResponse; ACK is never final status; a separate createCommittedStatusRequest/validateUploadCommittedObserved round trip returns the final ordinary status plus responseSha256; the complete Actions observation wrapper is preserved and Artifact's sink writes exact final-status bytes.
- [ ] The real Receipt/controller/Deploy Note integration matrix covers all five terminal and all three no-claim results; every no-claim uses exact createNoClaimEvidence bytes, validatedFinalHostStatus null, zero host mutation, and a Deploy Note no-op. The positive Deploy Note fixture uses a deployment sourceCommit different from the recorded main merge SHA, still comments only the exact main PR number, and proves no commit-associated-PR query occurs.
- [ ] Source validation workflow references no production secret, Environment, OIDC, SSH, publisher, or mutation capability.
- [ ] Artifact Manifest v1 remains unchanged; deployment companions are documented separately.
- [ ] Runbook preserves existing identity and health sections and documents manual Deploy plus automatic deployment/validation/code rollback/cleanup.
- [ ] Validation baseline and indexes point to the approved design and all implementation plans without claiming deployment.
- [ ] Main source PR does not modify current release, project context, project-state identity instance, or production execution records.
- [ ] Future complete validation: only after the four-prerequisite Source-resumption gate is satisfied, focused tests, full npm test, packaging, docs authority, project state, diff check, offline native build, and clean Linux validation pass; current docs-only checks do not substitute for this matrix.
- [ ] Future exact-head validation: Validate, Control Plane Source Integration, and CodeQL bind one exact PR head SHA; no such current eligibility claim exists.
- [ ] Future independent semantic and security reviews approve that exact head with no unresolved actionable thread; those reviews cannot unlock Ready/Merge while the four-prerequisite Source-resumption gate remains unsatisfied.
- [ ] Main source PR body contains exact Risk A metadata, identity_impact false, `Production status: not_deployed`, no Deploy Note, and remaining G1-G9. Artifact Task 13 alone may write the one real bounded Deploy Note comment to the exact merged main PR after verified G9 terminal evidence; it never updates the PR body, and no-claim/nonterminal writes nothing.
- [ ] Future Task 9 only: exact Issue and complete body are resolved before the first main-branch push; one main branch is pushed and one main Draft PR is opened exactly once; Integration Task 9 leaves it Draft and produces an evidence packet. Current Task 9 is unreachable and must not hand evidence to any Ready/Merge owner.
- [ ] Future complete provider order follows Foundation -> Host 0-1 -> Integration 2 -> Artifact 1-2 -> Bootstrap 1-8 -> Host 2-10 -> Receipt 1-3 -> Artifact 3-8 -> Host 11A broker plus inventory readers -> Bootstrap 9-10 -> Receipt 4 -> Artifact 9-10 -> Host 11 remainder-13 -> Receipt 5-8 -> Artifact 11-13 -> Bootstrap 11 -> Integration 1 -> Host 14A -> Integration 3 -> Host 14B -> Integration 4-9; task numbers are not treated as execution order. This order is currently suspended behind the unsatisfied four-prerequisite Source-resumption gate, before Foundation eligibility and all Source Tasks 1-9.
- [ ] Recovery no-claim remains attempt-scoped diagnostic evidence, creates no publication or Deploy Note comment, and requires a new Gate.
- [ ] No workflow was manually dispatched, no Release or attestation was written, no GitHub setting changed, and no provider or production system was accessed.
- [ ] Future-only mandatory post-merge reconciliation, external G1-G9, and real Deploy Note remain separate handoffs with fresh evidence and approval; all are currently unreachable.

## Plan Self-Review and Execution Handoff

- [ ] Compare every file and export in this plan with the five adjacent plans; remove duplicate ownership before implementation begins.
- [ ] Compare every receipt field, terminal state, workflow input, permission, secret name, variable name, concurrency key, confirmation phrase, and TTL with the approved design.
- [ ] Run this current document-only stale/authorization scan. It reads only this plan, verifies the exact 11-file boundary and both early-task STOP markers, and rejects the superseded subset/Task-3-only wording without executing any Source task:

    $sourcePlanPath = 'docs/superpowers/plans/2026-08-08-github-control-plane-source-integration-rollout-and-documentation.md'
    $sourcePlanText = [IO.File]::ReadAllText($sourcePlanPath)
    $exactAuthorityBootstrapInventory = @(
      'server/services/deployment/strict-json-scan.mjs',
      'server/services/deployment/canonical-json.mjs',
      'server/tests/control-plane-canonical-json.test.mjs',
      '.github/workflows/control-plane-foundation-toolchain-inventory.yml',
      '.github/workflows/control-plane-foundation-toolchain-publish.yml',
      'scripts/control-plane-foundation-toolchain-inventory.mjs',
      'scripts/control-plane-foundation-toolchain-publication.mjs',
      'server/tests/control-plane-foundation-toolchain-inventory.test.mjs',
      'server/tests/control-plane-foundation-toolchain-inventory-workflow.test.mjs',
      'server/tests/control-plane-foundation-toolchain-publication.test.mjs',
      'server/tests/control-plane-foundation-toolchain-publication-workflow.test.mjs'
    )
    if ($exactAuthorityBootstrapInventory.Count -ne 11 -or @($exactAuthorityBootstrapInventory | Sort-Object -Unique).Count -ne 11) { throw 'source_authority_inventory_invalid' }
    foreach ($path in $exactAuthorityBootstrapInventory) {
      if (-not $sourcePlanText.Contains(('`' + $path + '`'))) { throw "source_authority_inventory_path_missing: $path" }
    }
    foreach ($stale in @(
      ('bootstrap/source ' + 'subset'),
      ('Task 3' + '+'),
      ('Task 3 or any later ' + 'task'),
      ('Task 3 and every later ' + 'task')
    )) {
      if ($sourcePlanText.Contains($stale)) { throw "source_authorization_stale_wording: $stale" }
    }
    foreach ($required in @(
      'Source Tasks 1-9',
      'must remain Draft and may not be marked Ready or merged',
      '**FUTURE ONLY — CURRENT REACHABILITY: STOP.** This task is outside the separate exact 11-file authority-bootstrap inventory.'
    )) {
      if (-not $sourcePlanText.Contains($required)) { throw "source_authorization_boundary_missing: $required" }
    }
    $earlyTaskStops = [regex]::Matches($sourcePlanText, '(?ms)^## Task [12]:[^\r\n]*\r?\n\r?\n\*\*FUTURE ONLY — CURRENT REACHABILITY: STOP\.\*\*')
    if ($earlyTaskStops.Count -ne 2) { throw 'source_early_task_stop_count_invalid' }
    $fourGatePhrases = @(
      'the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`',
      'the immutable Foundation lock is published and full-owner postverified',
      'the complete content-addressed offline npm closure is separately approved, published, and hash-read-back',
      'a separate explicit Risk-A resumption approval is recorded'
    )
    $fourGateStatementPatterns = @(
      '(?m)^\*\*Architecture \(future complete topology\):\*\*.*$',
      '(?m)^- Current work in this Source plan is limited to.*$',
      '(?m)^- \*\*FUTURE ONLY.+four-prerequisite gate:\*\*.*$',
      '(?m)^The table is the future complete provider order only\..*$',
      '(?m)^Task numbers are stable ownership labels, not execution order\..*$',
      '(?m)^Current handoff is a hard STOP at review.*$'
    )
    foreach ($pattern in $fourGateStatementPatterns) {
      $statement = [regex]::Match($sourcePlanText, $pattern)
      if (-not $statement.Success) { throw "source_four_gate_statement_missing: $pattern" }
      foreach ($phrase in $fourGatePhrases) {
        if (-not $statement.Value.Contains($phrase)) { throw "source_four_gate_prerequisite_missing: $phrase" }
      }
    }
    $futurePullRequestValidation = [regex]::Match($sourcePlanText, '(?m)^- \*\*FUTURE ONLY.+four-prerequisite gate:\*\*.*$').Value
    if (-not $futurePullRequestValidation.Contains("Until then, current reachable validation is limited to this Source-plan documentation correction's static/document checks.")) {
      throw 'source_current_validation_boundary_missing'
    }
- [ ] Confirm every code block is executable test, exact contract example, exact workflow skeleton, exact validation command, or exact PR metadata.
- [ ] For a future complete implementation, confirm every task has a failing test, focused run, minimal implementation, passing run, and commit boundary; do not apply this as authority to start any Source Task 1-9 now.
- [ ] Confirm external G1-G9 contains no production command and grants no approval.

Current handoff is a hard STOP at review of the separate predecessor plan's exact 11-file authority-bootstrap Draft: that Draft must remain Draft and may not be marked Ready or merged. Do not claim Foundation eligibility, start any Source Task 1-9, run a Source task command/test, stage or commit a Source checkpoint, push/open/reuse a main-implementation or Source-plan PR through this plan, hand evidence to a Ready/Merge owner, transition or merge the main Draft, reconcile source state, or enter G1. The exact 11-file exception is owned outside this plan, includes no Source-task file, and cannot unlock any stopped Source transition. Only after (1) the separately approved unified full-Sigstore owner/topology is GREEN on protected `master`, (2) the immutable Foundation lock is published and full-owner postverified, (3) the complete content-addressed offline npm closure is separately approved, published, and hash-read-back, and (4) a separate explicit Risk-A resumption approval is recorded may the future complete provider/consumer order resume: Foundation; Host/DB Tasks 0-1; this plan Task 2; Artifact Tasks 1-2; Bootstrap Tasks 1-8; Host/DB Tasks 2-10; Receipt Tasks 1-3; Artifact Tasks 3-8; the Host/DB Task 11A broker plus branded inventory-reader provider checkpoint; Bootstrap Tasks 9-10; Receipt Task 4; Artifact Tasks 9-10; the remainder of Host/DB Task 11 plus Tasks 12-13; Receipt Tasks 5-8; Artifact Tasks 11-13; Bootstrap Task 11; this plan Task 1; Host/DB Task 14A; this plan Task 3; Host/DB Task 14B as the stop-before gate; then this plan Tasks 4-8; finally Task 9 serially for Issue resolution, the one main push, the one main Draft PR, exact-head integration, reviews, and Draft evidence creation. Task numbers remain stable ownership labels and do not override that future schedule. Each future slice makes only its authorized same-branch checkpoint, Task 6 makes no change/commit, and no task duplicates adjacent owner contracts. Task 9 would still stop with the main PR Draft; Ready/Merge and G1 would each require their own then-current authority after fresh readback.
