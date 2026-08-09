# GitHub Control-Plane Artifact and Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the source-only GitHub artifact, immutable Production Gate, deployment-plan, permission, and manual workflow contracts for Japan control-plane deployment without dispatching a workflow, changing GitHub settings, reading production secrets, or touching production.

**Architecture:** Pure Node.js contracts first create canonical Production Gate, deployment-plan, release-declaration, artifact-assembly, GitHub-evidence, and immutable-publication boundaries while consuming the Host/DB-owned canonical writer registry. Three manual-only workflows then compose those contracts into separated source preparation, tokenless build, no-write verification, protected publication, no-secret preflight, protected approval, and isolated Deploy Note jobs. This is one serial slice of the single source-only Draft PR approved by the design; host execution, database transaction, bootstrap, terminal receipt, recovery, settings mutation, workflow dispatch, and production use remain owned by their adjacent plans and Risk A Gates.

**Tech Stack:** Node.js 22 ESM, `node:test`, GitHub Actions, GitHub REST, GitHub artifact attestations, Git Release assets, SHA-256, HMAC-SHA-256, canonical UTF-8 JSON, `git archive`, npm lockfile integrity, and a digest-pinned Debian builder image.

## Global Constraints

- Risk: A envelope with source-only implementation; no task in this plan grants production authority.
- Process: TDD, exact contract fixtures, focused tests, full `npm test`, clean Linux builder validation, independent review, and one source-only Draft PR.
- Execution order follows the master program's task-level dependency DAG below. Do not complete this entire document ahead of missing upstream task nodes, and do not substitute a local compatibility interface when an adjacent owner is not yet GREEN.
- Expected PR count: one source-only Draft PR shared with the other approved design slices; tasks in this file are serial commit/review boundaries, not independently enabled deployment PRs.
- Validation: focused `node --test`, `npm test`, `npm run project-state:check`, `npm run docs:authority:check`, clean Linux build/fault tests, and `git diff --check origin/master...HEAD`.
- Production/AWS impact: none during implementation; do not dispatch any new workflow, configure an Environment, create a GitHub Release, mint OIDC, open SSH, or access a host.
- Consume canonical JSON only from `server/services/deployment/canonical-json.mjs`, owned by `docs/superpowers/plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md`.
- The shared canonical module exports exactly `parseCanonicalJsonBytes(bytes, contract)`, `serializeCanonicalJsonBytes(value, contract)`, and `sha256Hex(bytes)` and rejects duplicate keys, unknown fields, BOM, invalid UTF-8, non-canonical bytes, and trailing data.
- Every executable Artifact-owned canonical contract is an exact frozen Foundation ABI object with only `{ schemaId, maxBytes, fieldOrder, nested, arrays, validate }`. `nested` and `arrays` recursively name the owner contracts for every object/array position; no `{ type, fields }`, shallow top-level-only serializer, permissive nested value, or compatibility adapter is allowed. Cross-owner authorization, required-check, transport, and closeout conformance tests pass the provider's exact canonical bytes and value without reparsing into a locally shaped object.
- Repository is fixed to `gccwebos-com/proxy-gateway-minimal`; source ref is fixed to protected `refs/heads/master`.
- Production target is fixed to `japan-control-plane`; release unit is fixed to `control-plane-app`; service is fixed to `proxy-gateway-candidate.service`; Environment is fixed to `vultr-japan-production`.
- Production workflow is fixed to `.github/workflows/japan-control-plane-production-deploy.yml` and accepts only `production_gate_id` plus confirmation `deploy japan control-plane production`.
- Normal Artifact Gate is fixed to `.github/workflows/control-plane-artifact-gate.yml` and accepts only `inventory_gate_id` plus confirmation `publish japan control-plane artifact`.
- Compatibility Artifact Gate is fixed to `.github/workflows/control-plane-compatibility-artifact-gate.yml`; it always emits `deploymentMode: compatibility_bootstrap` and `automatedDeploymentEligible: false`.
- All production/bootstrap/recovery workflows use concurrency group `japan-control-plane-production-authority` with `cancel-in-progress: false`; production dispatch requires `github.run_attempt == 1`.
- Production Gate ID grammar is exactly `^pg1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$`.
- Production Gate Release is `control-plane-app-{sourceCommit}-{runtimeContractId}`; receipt asset is `production-gate-{receiptSha256}.json`.
- Inventory Gate ID grammar is exactly `^ig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$`; its fields are version, source commit, runtime-contract ID, and receipt SHA-256.
- Inventory receipt Release is `control-plane-inventory-{sourceCommit}-{runtimeContractId}`; asset is `inventory-receipt-{receiptSha256}.json`; the receipt excludes its external ID and expires exactly two hours after `createdAt`.
- Production Gate and deployment plan expire when `now >= expiresAt`; effective plan expiry is exactly `min(inventoryExpiresAt, productionGateExpiresAt, createdAt + 2h)`.
- Portable `artifact.json` remains Artifact Manifest v1; deployment-only fields live in companions and never enter that manifest.
- Artifact bundle maximum compressed size is 268435456 bytes; canonical source ZIP maximum is 67108864 bytes; maximum entries are 50000; maximum per-entry expanded size is 67108864 bytes; maximum aggregate expanded size is 805306368 bytes; maximum compression ratio is 100.
- Builder image is frozen to `node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a`; the committed builder contract records its observed Node, npm, local `node-gyp`, reviewed Node-header tree, complete reviewed toolchain tree, and the exact `CC`/`CXX`/`AR`/`LD`/`PYTHON` executable identities and digests.
- The builder verifies `better-sqlite3@12.10.0` lifecycle metadata `prebuild-install || node-gyp rebuild --release` but never executes lifecycle or `prebuild-install`. Artifact owns a closed direct better-sqlite3 adapter that invokes the digest-pinned local `node-gyp` with only `rebuild --release --directory node_modules/better-sqlite3 --nodedir <reviewed-headers>` under Foundation's verified toolchain root, narrow toolchain-only `PATH`, and fixed `CC`/`CXX`/`AR`/`LD`/`PYTHON`; Foundation-owned `scripts/build-control-plane-native.mjs` remains limited to first-party and reviewed standalone targets.
- New high-authority workflows pin `actions/checkout` to `df4cb1c069e1874edd31b4311f1884172cec0e10`, `actions/setup-node` to `249970729cb0ef3589644e2896645e5dc5ba9c38`, `actions/upload-artifact` to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, `actions/download-artifact` to `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`, `actions/github-script` to `60a0d83039c74a4aee543508d2ffcb1c3799cdea`, and the official generic `actions/attest` to `11bbd243972067817e9ed160cb123cab3601f436`; custom predicate bytes are passed only with its exact `predicate-type` and `predicate-path` inputs. Every `actions/attest` step names one exact regular file, never a wildcard, directory, shell loop, matrix-generated path, or dynamically selected action. The verifier requires `statement.subject.length === 1` and exact subject name/digest.
- Workflow scope permissions are `{}`. Preflight receives only `actions: read`, `checks: read`, `contents: read`, `statuses: read`, and `attestations: read`. Protected deployment adds only `id-token: write`.
- Publisher receives only `actions: read`, `contents: write`, `id-token: write`, and `attestations: write`, is bound to `artifact-publication`, and has no production Environment or production secret. It performs no checkout, setup-node, archive extraction, candidate import, or repository-script execution: pinned official actions plus one inline, fixed, bounded publisher control re-hash opaque verified assets, re-read approval/policy, and perform only the closed Release/attestation operations.
- Environment authority is content-addressed, not count-addressed: its canonical policy includes the sorted exact reviewer identities (`type`, stable decimal `id`, normalized `login` or `slug`) and the explicit `can_admins_bypass` bit. Missing/unknown bypass evidence, same-count reviewer replacement, unresolved team membership, or an approver outside the currently resolved user/team set fails before any secret or write.
- Deploy Note receives only `actions: read`, `contents: read`, and `pull-requests: write`, and never shares a job with production credentials, OIDC, or SSH.
- Existing `.github/workflows/release-artifact.yml` remains short-lived source-build evidence; existing `.github/workflows/production-deploy-dry-run.yml` remains dry-run-only.
- Reserved Environment secrets are exactly `JAPAN_CONTROL_DEPLOY_HOST`, `JAPAN_CONTROL_DEPLOY_PORT`, `JAPAN_CONTROL_DEPLOY_USER`, `JAPAN_CONTROL_DEPLOY_PRIVATE_KEY`, `JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS`, `JAPAN_CONTROL_DEPLOY_BINDING_KEY`, and `JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY`.
- Reserved Environment variables are exactly `JAPAN_CONTROL_DEPLOY_CREDENTIAL_ID`, `JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION`, `JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256`, `JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256`, `JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256`, `JAPAN_CONTROL_DEPLOY_METADATA_APP_ID`, and `JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID`.
- No output may contain a secret value, endpoint, host path, database path, environment value, raw config, response body, log, process identifier, OIDC token, private key, customer data, or subscription material.
- Never hard-code a guessed GitHub check App ID. Artifact and deployment admission consume fresh inventory-owned `requiredCheckContracts`, re-read exact-SHA checks, require tuple byte equality and success, and reject missing, extra, duplicate, or ruleset-drifted contexts.
- Every cross-job artifact is data-only. `source-prepare` checks out the immutable workflow-dispatch SHA read-only and emits a canonical source archive plus manifest/tree digest and canonical inputs. The tokenless builder has `permissions: {}`, no checkout, no `GITHUB_TOKEN`, validates the archive digest and exact Git tree with fixed workflow control before extraction, then executes candidate build code only inside its tokenless sandbox. Verify checks out the exact source SHA read-only and treats builder output as opaque. Publisher downloads only the verified publication envelope/assets and never receives or executes the source archive, a candidate script, checksum program, package, native binary, or shell fragment.
- Every dependency/native build child runs under the closed `env -i` scrubber, receives no GitHub/OIDC/Actions token, uses Foundation's verified full offline header/toolchain custody, and the offline phase runs in a disabled network namespace; “tokenless” applies to the complete builder job and child-process boundary.
- `workflow_dispatch` values enter shell steps only through a closed `env:` mapping and are validated as data. No `${{ inputs.* }}` expression may appear inside a `run:` block.
- Every accepted attestation is a cryptographically verified Sigstore/GitHub bundle bound to the GitHub issuer, repository, workflow path/ref/SHA, source commit, predicate type, exact subject name, and `sha256` digest. Matching an API row or subject digest alone is insufficient.
- These are direct workflows, not reusable workflows. Production OIDC verification binds the signed `workflow_ref` and `workflow_sha` claims; `job_workflow_ref` and `job_workflow_sha` are rejected. Bootstrap alone owns time validation and accepts the normal relation `nbf <= iat`, checks `nbf`, `iat`, and `exp` independently against bounded skew, and limits `exp - iat`.
- Preapproval never reads or requires a future Environment approval. The first protected custom step re-reads current policy, current exhaustive ruleset requirements, exact successful check tuples, and the current run's approval history, then creates the one canonical production authorization record.
- Production credential material is lazy-only. Controller and scope-attestor code receive materializers, never raw host, port, user, private-key, known-hosts, binding-key, or metadata-App private-key values. The deploy materializer obtains the branded four-field host-key binding only through `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, emits Bootstrap's exact 11-field `FIXED_CREDENTIAL_MATERIAL_FIELDS` record, creates Bootstrap's sole branded eight-field expectation through `createFixedCredentialExpectation(...)`, calls `assertKnownHostsRecordExpectation({ binding, material })`, calls `validateFixedCredentialMaterial(material, expectation)`, and returns the exact frozen `{ material, expectation }` capture; it never constructs an expectation-shaped object itself. Bootstrap seals the one capture, gives every operation a fresh non-aliased clone, zeroizes each clone in its operation `finally`, and zeroizes/closes retained originals in the transport's outer `finally`/idempotent `close()`.

## File Structure

### Shared dependencies consumed from adjacent plans

- `server/services/deployment/canonical-json.mjs`: duplicate-key-rejecting canonical byte contract.
- `server/services/deployment/control-plane-inventory-receipt.mjs`: owns the inventory receipt schema and exports `resolveInventoryReceipt({ repository, inventoryGateId, token, fetchFn })`, returning `{ bytes, sha256, receipt }` without accepting a URL or path. Its canonical receipt carries the complete inventory-owned `requiredCheckContracts` value; all live ruleset-required contexts are exhaustive, and semantic roles include at least `validate` and `codeql`.
- `server/services/deployment/control-plane-required-check-contract.mjs`: Integration Task 2's sole required-check schema/canonical-byte provider. Artifact imports its exact Foundation-shape `REQUIRED_CHECK_CONTRACT`, `REQUIRED_CHECK_ARRAY_CONTRACT`, `validateRequiredCheckContracts`, and `canonicalizeRequiredCheckContracts(value) -> { requiredCheckContracts, bytes, sha256 }`; every entry is exact `{ semanticRole, context, appSlug, integrationId, sourceKind, workflowPath, workflowRef, workflowSha }`, non-workflow fields are canonical `null`, and Artifact declares no local check-contract constant, field list, or serializer.
- `server/services/deployment/control-plane-required-check-registry.mjs`: Integration Task 2's sole private semantic/workflow/context/App registry. Its only export is `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns }) -> { requiredCheckContracts, bytes, sha256 }`; Artifact supplies the complete live observations, consumes that exact wrapper byte-for-byte, and defines no second registry, mapping, identity array, or canonicalizer.
- `server/services/deployment/control-plane-inventory-attestation-predicate.mjs`: Integration's dependency-leaf owner of `INVENTORY_ATTESTATION_PREDICATE_CONTRACT`. Artifact imports that exact contract for generic attestation verification and never copies its field order or validator.
- `server/services/deployment/writer-registry.mjs`: Host/DB-owned registry implementation exporting `WRITER_REGISTRY_CONTRACT`, `discoverProductionWriters`, `canonicalizeWriterRegistry`, and `verifyWriterRegistry`; its CLI is `scripts/control-plane-writer-registry.mjs`, test is `server/tests/control-plane-writer-registry.test.mjs`, and source contract is `ops/control-plane-deploy/writer-registry.sources.json`.
- `ops/control-plane-deploy/contracts/host-execution-contract.json`: exact host, bootstrap, database, writer, validation, rollback, and recovery contract digests.
- `ops/control-plane-deploy/contracts/receipt-contract.json`: exact terminal aggregate receipt contract consumed by workflow validation.
- `server/services/deployment/control-plane-transport-contract.mjs`: Bootstrap-owned `DEPLOY_CREDENTIAL_ID`, exact eleven-field `FIXED_CREDENTIAL_MATERIAL_FIELDS`, exact eight-field `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, executable `FIXED_CREDENTIAL_EXPECTATION_CONTRACT`, `createFixedCredentialExpectation({ credentialId, authorizationGeneration, bootstrapReceiptSha256, knownHostsFingerprint, knownHostsTupleSha256, expiresAt, observedAt })`, `deriveKnownHostsBinding({ host, port, knownHostsBytes })`, `assertKnownHostsRecordExpectation({ binding, material })`, `validateFixedCredentialMaterial(material, expectation)`, `TRANSPORT_FAILURE_DIAGNOSTIC_CODES`, `validateTransportEnvelope(envelope)`, and `createSecureSshTransport({ native, clock, secretMaterializer })`. The owner factory fixes `principal` from `credentialId` and returns the only accepted branded expectation; Artifact never supplies a raw principal or any caller-built expectation alias. The transport's exact public surface is `execute`, `request`, `requestStatusBundle`, `requestBootstrap`, and `close`; the three one-response operations return the exact validated `{ exitCode, responseBytes, diagnosticCode }` envelope, while only Bootstrap's terminal reader can drive the private-frame `requestStatusBundle` stream. Only fixed credential ID `japan-control-plane-github-deploy-v1` is accepted by this workflow.
- `server/services/deployment/control-plane-host-protocol.mjs`: Bootstrap-owned exact request/response codecs and bounded terminal-bundle reader. Artifact imports only `encodeExecuteAuthFrame`, `validateArtifactAcceptedFrame`, `encodeStatusRequestFrame`, `validateStatusResponseFrame`, and `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs })`; there is no generic decoder, chunk loop, bundle parser, or Artifact-local codec alias. `execute_auth` carries the exact bounded canonical `deploymentPlanBytes`, `productionGateReceiptBytes`, `authorizationRecordBytes`, and OIDC token bytes so the host can validate and durably publish/read back the Bootstrap-owned accepted-plan before artifact acceptance. Artifact passes a six-field expected ready value, not encoded ready bytes, to transport. Ordinary status requests carry exactly `{ requestId, gateId, deploymentPlanSha256, transactionId }`; Bootstrap's terminal reader alone consumes fixed 768-byte chunks, maximum 262,144 bytes and 342 chunks, and Artifact does not duplicate those constants.
- `server/services/deployment/database-contract.mjs`: Host/DB-owned `canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }`; Artifact imports only this helper, compares three independently canonicalized sources, and propagates the owner digest but never imports the normalizer, sorts, repairs, duplicates the nested schema, generates, or recomputes physical identity HMACs.
- `server/services/deployment/control-plane-controller-closeout.mjs`, `server/services/deployment/control-plane-controller-closeout-adapter.mjs`, and `scripts/control-plane-controller-closeout.mjs`: Receipt-owned immutable closeout state algebra, transition-specific one-use OIDC request builder, Actions-artifact publisher/readback, `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus(...)`, `validateControllerFinalStatus(bytes, expected)`, observation validators, and fixed CLI commands; this plan only composes them.
- `package.json`, `schemas/README.md`, `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`, `RELEASE_MANIFEST.md`, `docs/VALIDATION_BASELINE.md`, and `docs/README.md`: owned by the rollout/integration/documentation slice; this plan supplies exact commands and source-workflow semantics but does not edit those files.

### Files created by this plan

- `scripts/control-plane-production-gate.mjs`: Production Gate ID, receipt, digest, Release, asset, expiry, and CLI contract.
- `scripts/control-plane-deployment-plan.mjs`: stable plan-template digest, run envelope, transaction/recovery identity, expiry, and plan validation.
- `scripts/control-plane-release-declaration.mjs`: normal and compatibility declaration materialization from reviewed template and immutable evidence.
- `scripts/control-plane-artifact-assembly.mjs`: bounded bundle/file-manifest creation and independent verification.
- `scripts/control-plane-artifact-builder.mjs`: tokenless two-phase dependency fetch/offline native build contract.
- `server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs`: digest-pinned direct better-sqlite3 build and in-memory runtime probe.
- `scripts/control-plane-publication-envelope.mjs`: opaque publisher input with fixed files, digests, tag, target commit, and last-asset ordering.
- `scripts/control-plane-github-evidence.mjs`: strict GitHub REST client and exact source/check/Environment/approval/asset/attestation evidence.
- `scripts/control-plane-github-scope-attestor.mjs`: metadata-App scope-name proof for Environment-only reserved names.
- `ops/control-plane-deploy/github-sigstore-trusted-root.json` and `ops/control-plane-deploy/github-sigstore-trusted-root.sha256`: reviewed byte-for-byte Fulcio/Rekor trust custody consumed only by the tracked verifier factory.
- `server/services/deployment/github-attestation-verifier.mjs`: strict Sigstore/GitHub bundle cryptography and identity/predicate/subject verification.
- `schemas/control-plane-production-authorization-v1.schema.json`: closed canonical postapproval authorization record.
- `server/services/deployment/control-plane-production-authorization.mjs`: canonical authorization record construction, validation, and digest.
- `schemas/control-plane-artifact-publication-authorization-v1.schema.json` and `server/services/deployment/control-plane-artifact-publication-authorization.mjs`: two-stage publication approval/envelope authorization contract.
- `scripts/control-plane-production-preflight.mjs`: no-secret Gate resolution, evidence verification, plan materialization, and safe summary.
- `scripts/control-plane-postapproval-check.mjs`: run-bound approval-history, policy, source, evidence, authorization-state, and expiry replay check before secret use.
- `scripts/github-immutable-release-publisher.mjs`: shared Release asset plus attestation state machine used by Artifact Gate and receipt recovery.
- `server/services/deployment/control-plane-production-controller.mjs`: workflow-side controller that binds the accepted plan, Gate, artifact stream, OIDC admission, host protocol, and durable closeout result.
- `server/services/deployment/control-plane-production-integration-adapter.mjs`: Artifact-owned adapter joining Bootstrap transport, transition OIDC, Actions-artifact operations, and Receipt-owned closeout APIs without duplicating them.
- `scripts/control-plane-production-controller.mjs`: fixed-operation `execute` CLI for the workflow-side controller.
- `ops/control-plane-deploy/release-metadata/release-declaration.template.json`: fixed deployment, builder, writer, schema, host, validation, compatibility, and rollback allowlist.
- `.github/workflows/control-plane-artifact-gate.yml`: manual normal durable Artifact/Production Gate publication.
- `.github/workflows/control-plane-compatibility-artifact-gate.yml`: manual compatibility-only durable publication.
- `.github/workflows/japan-control-plane-production-deploy.yml`: manual no-secret preflight, protected approval/deploy, closeout, and isolated Deploy Note composition.
- Focused `server/tests/control-plane-*.test.mjs` and `server/tests/github-immutable-release-publisher.test.mjs` files named in each task.
- `server/tests/github-attestation-verifier.test.mjs`, `server/tests/control-plane-production-authorization.test.mjs`, and `server/tests/control-plane-production-integration-adapter.test.mjs`.

### Files modified by this plan

- `server/tests/artifact-manifest.test.mjs`: prove companions never alter Artifact Manifest v1.

### Source semantics handed to the rollout/documentation plan

- The three workflows are source-only and manual-only; keep them un-dispatched and operationally ineligible until the separate GitHub configuration readback and Risk A approval complete. Merging their source does not authorize dispatch.
- `control-plane-artifact-gate.yml` publishes the normal immutable release pair and publishes the Production Gate receipt last; `control-plane-compatibility-artifact-gate.yml` can never produce an automated-deployment-eligible declaration.
- `japan-control-plane-production-deploy.yml` has no auto-deploy trigger; a human clicks Deploy with one fresh `production_gate_id`, then GitHub performs preflight, protected approval, execution, verification, closeout, and rollback/recovery orchestration.
- Production remains `not_deployed` until a later approved run yields a verified terminal receipt and the rollout owner records the exact Deploy Note.

## Master Task-Level Dependency DAG

| This plan node | Must already be GREEN | May proceed in parallel with |
| --- | --- | --- |
| Tasks 1–2 Gate/plan | Foundation Tasks 1–6, Host/DB Tasks 0–1, and Integration Task 2 | Nothing that changes these consumed contracts |
| Tasks 3–8 declaration/build/evidence/authorization | Tasks 1–2 plus their transitive upstream; then execute Tasks 3–8 in order | Ready nodes in other plan files may run only where their own upstream join is GREEN |
| Task 8 authorization checkpoint | All preceding Task 8 dependencies; Artifact produces the sole exact `deploymentPlanSha256` authorization schema/validator/audience helper | Nothing may provide a second authorization schema |
| Bootstrap Tasks 9–10 (adjacent plan) | Artifact Task 8 GREEN; Bootstrap imports the Artifact validator/helper directly | Receipt Task 4 waits |
| Receipt Task 4 (adjacent plan) | Bootstrap Tasks 9–10 GREEN | No later Artifact workflow/controller node starts early |
| Tasks 9–10 Artifact workflows | Artifact Tasks 3–8, Bootstrap Tasks 9–10, and Receipt Task 4 | Live-setting work remains unexecuted |
| Tasks 11–13 controller/workflow/integrated validation | Artifact Tasks 9–10, Host/DB Tasks 11–13, and Receipt Tasks 5–8, all at the same exact head | Task 13 is validation-only and changes no source |

Each row is a task-level join in the master program. A worker may execute ready rows from different plan files in parallel, but may not treat completion of this document as a prerequisite for starting all other plan files.

---

### Task 1: Production Gate content-addressed contract

Dependency checkpoint: begin only after Foundation Tasks 1–6, Host/DB Tasks 0–1, and Integration Task 2 are GREEN at the same exact source head.

**Files:**
- Create: `scripts/control-plane-production-gate.mjs`
- Create: `server/tests/control-plane-production-gate.test.mjs`

**Interfaces:**
- Consumes: `parseCanonicalJsonBytes`, `serializeCanonicalJsonBytes`, and `sha256Hex` from `server/services/deployment/canonical-json.mjs`.
- Produces: `PRODUCTION_GATE_ID_PATTERN`, `PRODUCTION_GATE_RECEIPT_CONTRACT`, `parseProductionGateId(value)`, `createProductionGateReceipt(input)`, `validateProductionGateReceipt({ productionGateId, bytes, now, expectedRepository, expectedSourceCommit })`, `resolveProductionGateReceipt({ repository, productionGateId, token, fetchFn, now })`, and `runProductionGateCli(options)`.

- [ ] **Step 1: Write the failing ID grammar and derivation test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionGateReceipt,
  parseProductionGateId
} from "../../scripts/control-plane-production-gate.mjs";

const sourceCommit = "a".repeat(40);
const runtimeContractId = "linux-amd64-glibc-node-127";
const inventoryReceiptSha256 = "1".repeat(64);

function validReceiptInput() {
  return {
    schemaVersion: "1",
    receiptType: "japan_control_plane_production_gate",
    repository: "gccwebos-com/proxy-gateway-minimal",
    sourceCommit,
    runtimeContractId,
    target: "japan-control-plane",
    releaseUnit: "control-plane-app",
    expectedCurrentRelease: "control-plane-previous-001",
    inventoryGateId: `ig1.${sourceCommit}.${runtimeContractId}.${inventoryReceiptSha256}`,
    inventoryReceiptSha256,
    inventoryExpiresAt: "2026-08-08T12:00:00.000Z",
    artifactReleaseTag: `control-plane-app-${sourceCommit}-${runtimeContractId}`,
    artifactSha256: "2".repeat(64),
    releaseDeclarationSha256: "3".repeat(64),
    bootstrapReceiptSha256: "4".repeat(64),
    deploymentPlanTemplateSha256: "5".repeat(64),
    artifactPublicationApprovalSha256: "6".repeat(64),
    createdAt: "2026-08-08T10:00:00.000Z",
    expiresAt: "2026-08-08T12:00:00.000Z"
  };
}

test("Production Gate derives one canonical external ID and immutable asset", () => {
  const created = createProductionGateReceipt(validReceiptInput());
  const parsed = parseProductionGateId(created.productionGateId);

  assert.equal(parsed.sourceCommit, sourceCommit);
  assert.equal(parsed.runtimeContractId, runtimeContractId);
  assert.equal(parsed.receiptSha256, created.receiptSha256);
  assert.equal(parsed.releaseTag, `control-plane-app-${sourceCommit}-${runtimeContractId}`);
  assert.equal(parsed.assetName, `production-gate-${created.receiptSha256}.json`);
  assert.equal(created.bytes.at(-1), 0x7d);
});
```

- [ ] **Step 2: Run the ID test and verify RED**

Run:

```powershell
node --test server/tests/control-plane-production-gate.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-production-gate.mjs`.

- [ ] **Step 3: Add the exact Production Gate field contract and ID parser**

```js
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";

export const PRODUCTION_GATE_ID_PATTERN = /^pg1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$/;

export const PRODUCTION_GATE_RECEIPT_CONTRACT = Object.freeze({
  schemaId: "control-plane-production-gate-receipt-v1",
  maxBytes: 32_768,
  fieldOrder: Object.freeze([
    "schemaVersion", "receiptType", "repository", "sourceCommit",
    "runtimeContractId", "target", "releaseUnit", "expectedCurrentRelease",
    "inventoryGateId", "inventoryReceiptSha256", "inventoryExpiresAt",
    "artifactReleaseTag", "artifactSha256", "releaseDeclarationSha256",
    "bootstrapReceiptSha256", "deploymentPlanTemplateSha256",
    "artifactPublicationApprovalSha256", "createdAt",
    "expiresAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1"
      || value.receiptType !== "japan_control_plane_production_gate"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal") {
      throw new Error("production_gate_receipt_invalid");
    }
  }
});

export function parseProductionGateId(value) {
  if (typeof value !== "string" || !PRODUCTION_GATE_ID_PATTERN.test(value)) {
    throw new Error("production_gate_id_invalid");
  }
  const [version, sourceCommit, runtimeContractId, receiptSha256] = value.split(".");
  const canonical = `${version}.${sourceCommit}.${runtimeContractId}.${receiptSha256}`;
  if (canonical !== value) throw new Error("production_gate_id_invalid");
  return {
    version,
    sourceCommit,
    runtimeContractId,
    receiptSha256,
    releaseTag: `control-plane-app-${sourceCommit}-${runtimeContractId}`,
    assetName: `production-gate-${receiptSha256}.json`
  };
}
```

- [ ] **Step 4: Implement canonical receipt creation and strict validation**

```js
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_PATTERN = /^[0-9a-f]{40}$/;
const RELEASE_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const REPOSITORY = "gccwebos-com/proxy-gateway-minimal";

function canonicalTime(value, code) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(code);
  return parsed.getTime();
}

function validateReceipt(receipt) {
  const expectedTag = `control-plane-app-${receipt.sourceCommit}-${receipt.runtimeContractId}`;
  const createdAt = canonicalTime(receipt.createdAt, "production_gate_receipt_invalid");
  const expiresAt = canonicalTime(receipt.expiresAt, "production_gate_receipt_invalid");
  if (receipt.schemaVersion !== "1"
    || receipt.receiptType !== "japan_control_plane_production_gate"
    || receipt.repository !== REPOSITORY
    || !SOURCE_PATTERN.test(receipt.sourceCommit)
    || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(receipt.runtimeContractId)
    || receipt.target !== "japan-control-plane"
    || receipt.releaseUnit !== "control-plane-app"
    || !RELEASE_PATTERN.test(receipt.expectedCurrentRelease)
    || !/^ig1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$/.test(receipt.inventoryGateId)
    || receipt.artifactReleaseTag !== expectedTag
    || ![receipt.inventoryReceiptSha256, receipt.artifactSha256,
      receipt.releaseDeclarationSha256, receipt.bootstrapReceiptSha256,
      receipt.deploymentPlanTemplateSha256,
      receipt.artifactPublicationApprovalSha256].every((value) => SHA256_PATTERN.test(value))
    || expiresAt !== createdAt + 7_200_000
    || expiresAt > canonicalTime(receipt.inventoryExpiresAt, "production_gate_receipt_invalid")) {
    throw new Error("production_gate_receipt_invalid");
  }
  return receipt;
}

export function createProductionGateReceipt(input) {
  const receipt = validateReceipt(input);
  const bytes = serializeCanonicalJsonBytes(receipt, PRODUCTION_GATE_RECEIPT_CONTRACT);
  const receiptSha256 = sha256Hex(bytes);
  const productionGateId = `pg1.${receipt.sourceCommit}.${receipt.runtimeContractId}.${receiptSha256}`;
  return {
    receipt,
    bytes,
    receiptSha256,
    productionGateId,
    releaseTag: receipt.artifactReleaseTag,
    assetName: `production-gate-${receiptSha256}.json`
  };
}

export function validateProductionGateReceipt({
  productionGateId,
  bytes,
  now,
  expectedRepository = REPOSITORY,
  expectedSourceCommit
}) {
  const parsedId = parseProductionGateId(productionGateId);
  const receipt = validateReceipt(parseCanonicalJsonBytes(bytes, PRODUCTION_GATE_RECEIPT_CONTRACT));
  if (receipt.repository !== expectedRepository
    || receipt.sourceCommit !== parsedId.sourceCommit
    || receipt.runtimeContractId !== parsedId.runtimeContractId
    || sha256Hex(bytes) !== parsedId.receiptSha256
    || expectedSourceCommit !== undefined && receipt.sourceCommit !== expectedSourceCommit
    || new Date(now).getTime() >= new Date(receipt.expiresAt).getTime()) {
    throw new Error("production_gate_receipt_invalid");
  }
  return { receipt, ...parsedId };
}
```

- [ ] **Step 5: Add malformed-ID, duplicate-field, expiry, and outer/inner mismatch tests**

```js
test("Production Gate rejects aliases, stale bytes, and canonical drift", () => {
  const created = createProductionGateReceipt(validReceiptInput());
  for (const invalid of [
    created.productionGateId.toUpperCase(),
    ` ${created.productionGateId}`,
    created.productionGateId.replaceAll(".", "%2e"),
    created.productionGateId.replace("pg1.", "pg1..")
  ]) {
    assert.throws(() => parseProductionGateId(invalid), /production_gate_id_invalid/);
  }
  assert.throws(() => validateProductionGateReceipt({
    productionGateId: created.productionGateId,
    bytes: Buffer.from(created.bytes.toString("utf8").replace("\"sourceCommit\":\"", "\"sourceCommit\":\"b")),
    now: "2026-08-08T10:30:00.000Z",
    expectedSourceCommit: sourceCommit
  }), /production_gate_receipt_invalid/);
  assert.throws(() => validateProductionGateReceipt({
    productionGateId: created.productionGateId,
    bytes: created.bytes,
    now: "2026-08-08T12:00:00.000Z",
    expectedSourceCommit: sourceCommit
  }), /production_gate_receipt_invalid/);
});

test("Production Gate resolver derives one exact Release asset and re-hashes bytes", async () => {
  const created = createProductionGateReceipt(validReceiptInput());
  const resolved = await resolveProductionGateReceipt({
    repository: "gccwebos-com/proxy-gateway-minimal",
    productionGateId: created.productionGateId,
    token: "synthetic-token",
    fetchFn: productionGateReleaseFixture({ created }),
    now: "2026-08-08T10:30:00.000Z"
  });
  assert.equal(resolved.sha256, created.receiptSha256);
  assert.deepEqual(resolved.bytes, created.bytes);
});
```

- [ ] **Step 6: Add exact immutable Release resolution and the bounded verify CLI**

```js
export async function resolveProductionGateReceipt({ repository, productionGateId, token, fetchFn, now }) {
  if (repository !== REPOSITORY) throw new Error("production_gate_repository_invalid");
  const identity = parseProductionGateId(productionGateId);
  const releaseResponse = await fetchFn(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${identity.releaseTag}`, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }
  });
  if (!releaseResponse.ok) throw new Error(`production_gate_release_http_${releaseResponse.status}`);
  const release = await releaseResponse.json();
  const assets = release.assets?.filter(({ name }) => name === identity.assetName) ?? [];
  if (release.tag_name !== identity.releaseTag
    || release.target_commitish !== identity.sourceCommit
    || assets.length !== 1
    || !/^[1-9][0-9]{0,19}$/.test(String(assets[0].id))) {
    throw new Error("production_gate_release_invalid");
  }
  const assetResponse = await fetchFn(`https://api.github.com/repos/${REPOSITORY}/releases/assets/${assets[0].id}`, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/octet-stream", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }
  });
  let bytes;
  if (assetResponse.status === 302) {
    const location = new URL(assetResponse.headers.get("location"));
    if (location.protocol !== "https:" || location.hostname !== "release-assets.githubusercontent.com") {
      throw new Error("production_gate_asset_redirect_invalid");
    }
    const redirected = await fetchFn(location, { method: "GET", redirect: "error", headers: { accept: "application/octet-stream" } });
    if (!redirected.ok) throw new Error(`production_gate_asset_http_${redirected.status}`);
    bytes = Buffer.from(await redirected.arrayBuffer());
  } else {
    if (!assetResponse.ok) throw new Error(`production_gate_asset_http_${assetResponse.status}`);
    bytes = Buffer.from(await assetResponse.arrayBuffer());
  }
  const validated = validateProductionGateReceipt({ productionGateId, bytes, now, expectedRepository: repository });
  return Object.freeze({ bytes, sha256: identity.receiptSha256, receipt: validated.receipt });
}

export function runProductionGateCli({ argv, stdout, stderr } = {}) {
  try {
    const [command, inputFlag, inputPath, idFlag, idValue] = argv;
    if (inputFlag !== "--input" || !inputPath) throw new Error("production_gate_cli_invalid");
    const bytes = readFileSync(inputPath);
    if (command === "verify" && idFlag === "--production-gate-id") {
      const result = validateProductionGateReceipt({
        productionGateId: idValue,
        bytes,
        now: new Date().toISOString()
      });
      stdout.write(`${JSON.stringify({ ok: true, type: "production_gate", receiptSha256: result.receiptSha256 })}\n`);
      return 0;
    }
    throw new Error("production_gate_cli_invalid");
  } catch {
    stderr.write('{"ok":false,"error":"production_gate_rejected"}\n');
    return 1;
  }
}
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-production-gate.mjs
node --test server/tests/control-plane-production-gate.test.mjs
```

Expected: both commands exit 0; the test reports no failures.

- [ ] **Step 8: Commit the Production Gate contract**

```powershell
git add -- scripts/control-plane-production-gate.mjs server/tests/control-plane-production-gate.test.mjs
git commit -m "feat: add content-addressed production gate contract"
```

### Task 2: Stable deployment plan and run envelope

**Files:**
- Create: `scripts/control-plane-deployment-plan.mjs`
- Create: `server/tests/control-plane-deployment-plan.test.mjs`

**Interfaces:**
- Consumes: validated Production Gate receipt from Task 1 and immutable inventory/artifact/declaration/host contracts from adjacent slices. Database validation and canonical nested bytes are owned only by `server/services/deployment/database-contract.mjs`; this task imports only `canonicalizeDatabaseContracts(value) -> { databaseContracts, bytes, sha256 }` and never imports the normalizer, sorts, repairs, maps, duplicates the 14-field schema, or recomputes a physical-identity HMAC.
- Produces: `DEPLOYMENT_PLAN_CONTRACT`, `computeEffectiveExpiry(input)`, `computeDeploymentPlanTemplateSha256(stableBody)`, `materializeDeploymentPlan({ gateId, gateReceipt, stableBody, runContext, now })`, `validateDeploymentPlanBytes({ bytes, runContext, now })`, and `runDeploymentPlanCli(options)`.

- [ ] **Step 1: Write the failing expiry and identity test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeEffectiveExpiry,
  materializeDeploymentPlan
} from "../../scripts/control-plane-deployment-plan.mjs";

test("deployment plan uses the earliest parent expiry and deterministic run identities", () => {
  assert.equal(computeEffectiveExpiry({
    inventoryExpiresAt: "2026-08-08T11:10:00.000Z",
    productionGateExpiresAt: "2026-08-08T12:00:00.000Z",
    createdAt: "2026-08-08T10:00:00.000Z"
  }), "2026-08-08T11:10:00.000Z");

  const input = deploymentFixture();
  const first = materializeDeploymentPlan(input);
  const second = materializeDeploymentPlan(input);
  assert.equal(first.sha256, second.sha256);
  assert.match(first.plan.transactionId, /^dpt1\.[0-9a-f]{64}$/);
  assert.match(first.plan.controllerRecoveryId, /^cr1\.[0-9a-f]{64}$/);
  assert.match(first.plan.candidateRelease, /^control-plane-[0-9a-f]{32}$/);
  assert.equal(first.plan.expiresAt, "2026-08-08T11:10:00.000Z");
});
```

- [ ] **Step 2: Run the plan test and verify RED**

Run:

```powershell
node --test server/tests/control-plane-deployment-plan.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-deployment-plan.mjs`.

- [ ] **Step 3: Implement exact expiry and domain-separated identities**

```js
import { createHash } from "node:crypto";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";
import { canonicalizeDatabaseContracts } from "../server/services/deployment/database-contract.mjs";

const PLAN_TTL_MS = 7_200_000;

function canonicalTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error("deployment_plan_invalid");
  }
  return date;
}

export function computeEffectiveExpiry({ inventoryExpiresAt, productionGateExpiresAt, createdAt }) {
  const values = [
    canonicalTime(inventoryExpiresAt).getTime(),
    canonicalTime(productionGateExpiresAt).getTime(),
    canonicalTime(createdAt).getTime() + PLAN_TTL_MS
  ];
  return new Date(Math.min(...values)).toISOString();
}

function domainDigest(domain, values) {
  const hash = createHash("sha256").update(`${domain}\0`, "utf8");
  for (const value of values) hash.update(`${value}\0`, "utf8");
  return hash.digest("hex");
}

function createRunIdentities({ gateReceipt, runContext }) {
  const transactionDigest = domainDigest("gccgw-control-plane-deployment-transaction-v1", [
    runContext.repository,
    String(runContext.runId),
    String(runContext.runAttempt),
    "japan-control-plane",
    gateReceipt.sourceCommit
  ]);
  const transactionId = `dpt1.${transactionDigest}`;
  const recoveryDigest = domainDigest("gccgw-control-plane-controller-recovery-v1", [
    gateReceipt.productionGateReceiptSha256,
    transactionId,
    "japan-control-plane",
    gateReceipt.sourceCommit
  ]);
  return {
    transactionId,
    controllerRecoveryId: `cr1.${recoveryDigest}`,
    candidateRelease: `control-plane-${transactionDigest.slice(0, 32)}`
  };
}
```

- [ ] **Step 4: Freeze the exact top-level plan contract**

```js
export const DEPLOYMENT_PLAN_CONTRACT = Object.freeze({
  schemaId: "control-plane-deployment-plan-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze([
    "schemaVersion", "gateId", "productionGateReceiptSha256", "transactionId",
    "controllerRecoveryId", "inventoryGateId", "inventoryReceiptSha256",
    "inventoryExpiresAt", "productionGateExpiresAt", "target", "releaseUnit",
    "sourceCommit", "candidateRelease", "expectedCurrentRelease", "artifact",
    "rollbackRelease", "applicationWriterContract", "auxiliaryWriterContracts",
    "gatedBusinessMutationEntrypoints", "candidateWriterSetContractSha256",
    "candidateWriterRegistryVerificationReceiptSha256", "writerRegistrySchema",
    "databaseContracts", "identityImpact", "dataCompatibilityImpact",
    "dataCompatibilityContract", "dataCompatibilityPairSha256", "hostExecution",
    "bootstrapAuthorizationGateReceiptSha256", "bootstrapActivationRecordSha256",
    "bootstrapActivationAttemptChainSha256", "githubBootstrapUpdaterIssuanceChainSha256",
    "bootstrapRecoveryCloseoutEvidenceSha256", "validationContract",
    "rollbackContract", "createdAt", "expiresAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1" || value.target !== "japan-control-plane"
      || value.releaseUnit !== "control-plane-app") {
      throw new Error("deployment_plan_invalid");
    }
  }
});

export const DEPLOYMENT_PLAN_STABLE_BODY_CONTRACT = Object.freeze({
  schemaId: "control-plane-deployment-plan-stable-body-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze([
    "schemaVersion", "inventoryGateId", "inventoryReceiptSha256",
    "inventoryExpiresAt", "target", "releaseUnit", "sourceCommit",
    "expectedCurrentRelease", "artifact", "rollbackRelease",
    "applicationWriterContract", "auxiliaryWriterContracts",
    "gatedBusinessMutationEntrypoints", "candidateWriterSetContractSha256",
    "candidateWriterRegistryVerificationReceiptSha256", "writerRegistrySchema",
    "databaseContracts", "identityImpact", "dataCompatibilityImpact",
    "dataCompatibilityContract", "dataCompatibilityPairSha256", "hostExecution",
    "bootstrapAuthorizationGateReceiptSha256", "bootstrapActivationRecordSha256",
    "bootstrapActivationAttemptChainSha256", "githubBootstrapUpdaterIssuanceChainSha256",
    "bootstrapRecoveryCloseoutEvidenceSha256", "validationContract", "rollbackContract"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1" || value.target !== "japan-control-plane"
      || value.releaseUnit !== "control-plane-app") {
      throw new Error("deployment_plan_stable_body_invalid");
    }
  }
});

export function computeDeploymentPlanTemplateSha256(stableBody) {
  const canonical = canonicalizeDatabaseContracts(stableBody.databaseContracts);
  const normalizedBody = Object.freeze({ ...stableBody, databaseContracts: canonical.databaseContracts });
  return sha256Hex(serializeCanonicalJsonBytes(normalizedBody, DEPLOYMENT_PLAN_STABLE_BODY_CONTRACT));
}
```

- [ ] **Step 5: Materialize and validate the exact plan bytes**

```js
export function materializeDeploymentPlan({ gateId, gateReceipt, stableBody, runContext, now }) {
  if (runContext.repository !== "gccwebos-com/proxy-gateway-minimal"
    || runContext.runAttempt !== 1
    || runContext.ref !== "refs/heads/master"
    || runContext.sourceCommit !== gateReceipt.sourceCommit) {
    throw new Error("deployment_plan_invalid");
  }
  const canonicalDatabaseContracts = canonicalizeDatabaseContracts(stableBody.databaseContracts);
  const normalizedStableBody = Object.freeze({
    ...stableBody,
    databaseContracts: canonicalDatabaseContracts.databaseContracts
  });
  const templateSha256 = computeDeploymentPlanTemplateSha256(normalizedStableBody);
  if (templateSha256 !== gateReceipt.deploymentPlanTemplateSha256) {
    throw new Error("deployment_plan_invalid");
  }
  const createdAt = canonicalTime(now).toISOString();
  const identities = createRunIdentities({ gateReceipt, runContext });
  const expiresAt = computeEffectiveExpiry({
    inventoryExpiresAt: gateReceipt.inventoryExpiresAt,
    productionGateExpiresAt: gateReceipt.expiresAt,
    createdAt
  });
  const plan = {
    ...normalizedStableBody,
    gateId,
    productionGateReceiptSha256: gateReceipt.productionGateReceiptSha256,
    productionGateExpiresAt: gateReceipt.expiresAt,
    ...identities,
    createdAt,
    expiresAt
  };
  const bytes = serializeCanonicalJsonBytes(plan, DEPLOYMENT_PLAN_CONTRACT);
  return { plan, bytes, sha256: sha256Hex(bytes) };
}

export function validateDeploymentPlanBytes({ bytes, runContext, now }) {
  const plan = parseCanonicalJsonBytes(bytes, DEPLOYMENT_PLAN_CONTRACT);
  const canonicalDatabaseContracts = canonicalizeDatabaseContracts(plan.databaseContracts);
  if (plan.schemaVersion !== "1"
    || plan.target !== "japan-control-plane"
    || plan.releaseUnit !== "control-plane-app"
    || plan.identityImpact !== false
    || plan.dataCompatibilityImpact !== false
    || runContext.runAttempt !== 1
    || plan.sourceCommit !== runContext.sourceCommit
    || new Date(now).getTime() >= new Date(plan.expiresAt).getTime()) {
    throw new Error("deployment_plan_invalid");
  }
  return { plan, sha256: sha256Hex(bytes) };
}
```

- [ ] **Step 6: Add fixed-target, run-attempt, secret-field, exact database-contract, and expiry rejection tests**

```js
test("deployment plan rejects authority expansion and sensitive fields", () => {
  const base = deploymentFixture();
  assert.throws(() => materializeDeploymentPlan({
    ...base,
    runContext: { ...base.runContext, runAttempt: 2 }
  }), /deployment_plan_invalid/);
  assert.throws(() => materializeDeploymentPlan({
    ...base,
    stableBody: { ...base.stableBody, endpoint: "host.example.invalid" }
  }), /canonical_json_contract_invalid/);
  assert.throws(() => materializeDeploymentPlan({
    ...base,
    stableBody: { ...base.stableBody, databaseContracts: [base.stableBody.databaseContracts[0]] }
  }), /deployment_plan_invalid/);
});

test("deployment plan delegates the complete two-database contract without repairing it", () => {
  for (const fault of [
    "one_database", "two_unknown_ids", "swapped_ids", "duplicate_physical_hmac",
    "wrong_configured_source", "uppercase_digest", "extra_field", "schema_mode_condition"
  ]) {
    assert.throws(
      () => materializeDeploymentPlan(deploymentFixture({ databaseFault: fault })),
      /(?:database_contract|deployment_plan_database_contract)_invalid/
    );
  }
});
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-deployment-plan.mjs
node --test server/tests/control-plane-deployment-plan.test.mjs
```

Expected: both commands exit 0; expiry, deterministic identity, and rejection cases pass.

- [ ] **Step 8: Commit the deployment-plan contract**

```powershell
git add -- scripts/control-plane-deployment-plan.mjs server/tests/control-plane-deployment-plan.test.mjs
git commit -m "feat: add immutable deployment plan contract"
```

### Task 3: Release declaration consumes the canonical writer registry

**Files:**
- Create: `scripts/control-plane-release-declaration.mjs`
- Create: `ops/control-plane-deploy/release-metadata/release-declaration.template.json`
- Create: `server/tests/control-plane-release-declaration.test.mjs`
- Modify: `server/tests/artifact-manifest.test.mjs`

**Interfaces:**
- Consumes `discoverProductionWriters`, `canonicalizeWriterRegistry`, and `verifyWriterRegistry` from `server/services/deployment/writer-registry.mjs`, whose implementation, CLI `scripts/control-plane-writer-registry.mjs`, tests, and source contract `ops/control-plane-deploy/writer-registry.sources.json` are uniquely owned by the Host/DB plan.
- Consumes exact source commit, foundation Linux feasibility contract, host execution contract, inventory receipt, Artifact Manifest v1, canonical JSON bytes, and only Host/DB-owned `canonicalizeDatabaseContracts(value)`. The inventory owner must provide the full Host/DB 14-field `databaseContracts`; a lossy `databases` projection is rejected.
- Produces `RELEASE_DECLARATION_CONTRACT`, `materializeNormalReleaseDeclaration(input)`, `materializeCompatibilityReleaseDeclaration(input)`, and `validateReleaseDeclarationBytes(input)`.

- [ ] **Step 1: Write failing normal/compatibility declaration tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  materializeCompatibilityReleaseDeclaration,
  materializeNormalReleaseDeclaration
} from "../../scripts/control-plane-release-declaration.mjs";

test("normal declaration is automated and compatibility declaration is never eligible", () => {
  const input = releaseDeclarationFixture();
  const normal = materializeNormalReleaseDeclaration(input);
  const compatibility = materializeCompatibilityReleaseDeclaration(input);
  assert.equal(normal.declaration.deploymentMode, "normal");
  assert.equal(normal.declaration.automatedDeploymentEligible, true);
  assert.equal(compatibility.declaration.deploymentMode, "compatibility_bootstrap");
  assert.equal(compatibility.declaration.automatedDeploymentEligible, false);
  assert.equal(normal.declaration.identityImpact, false);
  assert.equal(normal.declaration.dataCompatibilityImpact, false);
  assert.equal(normal.declaration.writerRegistrySha256, input.writerRegistrySha256);
});
```

- [ ] **Step 2: Run declaration tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-release-declaration.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-release-declaration.mjs`.

- [ ] **Step 3: Add the tracked release-declaration template**

```json
{
  "schemaVersion": "1",
  "templateType": "control_plane_release_declaration",
  "repository": "gccwebos-com/proxy-gateway-minimal",
  "target": "japan-control-plane",
  "releaseUnit": "control-plane-app",
  "service": "proxy-gateway-candidate.service",
  "writerRegistrySchema": "control-plane-writer-registry-v1",
  "applicationWriterLogicalId": "control-plane-application",
  "schemaModes": [
    "none",
    "additive_compatible"
  ],
  "dataCompatibilityContract": "control-plane-persisted-data-backward-v1",
  "validationContract": "control-plane-promotion-health-gate-v1",
  "rollbackContract": "control-plane-release-pointer-rollback-v1",
  "builderImage": "node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a",
  "allowedDeploymentModes": [
    "normal",
    "compatibility_bootstrap"
  ]
}
```

- [ ] **Step 4: Implement two named declaration materializers with no caller-selected mode**

```js
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";
import {
  WRITER_REGISTRY_CONTRACT,
  discoverProductionWriters,
  canonicalizeWriterRegistry,
  verifyWriterRegistry
} from "../server/services/deployment/writer-registry.mjs";
import { canonicalizeDatabaseContracts } from "../server/services/deployment/database-contract.mjs";

export const RELEASE_DECLARATION_CONTRACT = Object.freeze({
  schemaId: "control-plane-release-declaration-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze([
    "schemaVersion", "declarationType", "repository", "sourceCommit", "target",
    "releaseUnit", "artifactFileName", "artifactSha256", "artifactSizeBytes",
    "runtimeContractId", "deploymentMode", "automatedDeploymentEligible",
    "identityImpact", "dataCompatibilityImpact", "dataCompatibilityContract",
    "dataCompatibilityPairSha256", "writerRegistrySchema", "writerRegistrySha256",
    "writerRegistryVerificationReceiptSha256", "applicationWriterContract",
    "auxiliaryWriterContracts", "gatedBusinessMutationEntrypoints",
    "databaseContracts", "hostExecution", "validationContract", "featureFlagContract",
    "rollbackContract", "bootstrapReceiptSha256", "builderContractSha256"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1"
      || value.declarationType !== "control_plane_release"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal") {
      throw new Error("release_declaration_invalid");
    }
  }
});

function materialize(input, deploymentMode, automatedDeploymentEligible) {
  const discovered = discoverProductionWriters({ sourceRoot: input.sourceRoot });
  const discoveredBytes = canonicalizeWriterRegistry(discovered);
  const declared = parseCanonicalJsonBytes(input.writerRegistryBytes, WRITER_REGISTRY_CONTRACT);
  if (!discoveredBytes.equals(input.writerRegistryBytes)) {
    throw new Error("release_declaration_writer_registry_bytes_mismatch");
  }
  const writerRegistry = verifyWriterRegistry({ discovered, declared });
  const canonicalDatabaseContracts = canonicalizeDatabaseContracts(input.inventoryReceipt.databaseContracts);
  const declaration = {
    schemaVersion: "1",
    declarationType: "control_plane_release",
    repository: "gccwebos-com/proxy-gateway-minimal",
    sourceCommit: input.sourceCommit,
    target: "japan-control-plane",
    releaseUnit: "control-plane-app",
    artifactFileName: input.artifactManifest.artifact.fileName,
    artifactSha256: input.artifactManifest.artifact.sha256,
    artifactSizeBytes: input.artifactManifest.artifact.sizeBytes,
    runtimeContractId: input.inventoryReceipt.runtimeContractId,
    deploymentMode,
    automatedDeploymentEligible,
    identityImpact: false,
    dataCompatibilityImpact: false,
    dataCompatibilityContract: "control-plane-persisted-data-backward-v1",
    dataCompatibilityPairSha256: input.dataCompatibilityPairSha256,
    writerRegistrySchema: "control-plane-writer-registry-v1",
    writerRegistrySha256: writerRegistry.sha256,
    writerRegistryVerificationReceiptSha256: input.writerRegistryVerificationReceiptSha256,
    applicationWriterContract: input.hostExecution.applicationWriterContract,
    auxiliaryWriterContracts: input.hostExecution.auxiliaryWriterContracts,
    gatedBusinessMutationEntrypoints: input.hostExecution.gatedBusinessMutationEntrypoints,
    databaseContracts: canonicalDatabaseContracts.databaseContracts,
    hostExecution: input.hostExecution,
    validationContract: "control-plane-promotion-health-gate-v1",
    featureFlagContract: input.featureFlagContract,
    rollbackContract: "control-plane-release-pointer-rollback-v1",
    bootstrapReceiptSha256: input.inventoryReceipt.bootstrapReceiptSha256,
    builderContractSha256: input.builderContractSha256
  };
  const bytes = serializeCanonicalJsonBytes(declaration, RELEASE_DECLARATION_CONTRACT);
  return { declaration, bytes, sha256: sha256Hex(bytes) };
}

export function materializeNormalReleaseDeclaration(input) {
  return materialize(input, "normal", true);
}

export function materializeCompatibilityReleaseDeclaration(input) {
  return materialize(input, "compatibility_bootstrap", false);
}

export function validateReleaseDeclarationBytes({ bytes, expectedSourceCommit }) {
  const declaration = parseCanonicalJsonBytes(bytes, RELEASE_DECLARATION_CONTRACT);
  const canonicalDatabase = canonicalizeDatabaseContracts(declaration.databaseContracts);
  if (declaration.sourceCommit !== expectedSourceCommit
    || !serializeCanonicalJsonBytes(declaration, RELEASE_DECLARATION_CONTRACT).equals(bytes)) {
    throw new Error("release_declaration_invalid");
  }
  return Object.freeze({
    declaration: Object.freeze({
      ...declaration,
      databaseContracts: canonicalDatabase.databaseContracts
    }),
    databaseContractsSha256: canonicalDatabase.sha256,
    sha256: sha256Hex(bytes)
  });
}
```

- [ ] **Step 5: Add writer-byte drift and Artifact Manifest v1 regression assertions**

```js
test("release declaration rejects a registry that differs from canonical host/DB discovery", () => {
  const input = releaseDeclarationFixture();
  assert.throws(() => materializeNormalReleaseDeclaration({
    ...input,
    writerRegistryBytes: Buffer.concat([input.writerRegistryBytes, Buffer.from("\n")])
  }), /writer_registry_/);
});

test("release declaration rejects every malformed or reordered Host/DB contract", () => {
  for (const fault of [
    "swapped_ids", "two_unknown_ids", "duplicate_physical_hmac", "wrong_configured_source",
    "uppercase_digest", "extra_field", "schema_mode_condition"
  ]) {
    assert.throws(
      () => materializeNormalReleaseDeclaration(releaseDeclarationFixture({ databaseFault: fault })),
      /(?:database_contract|release_declaration_database_contract)_invalid/
    );
  }
});

test("release declaration validator replays the owner normalizer on exact bytes", () => {
  const input = releaseDeclarationFixture();
  const created = materializeNormalReleaseDeclaration(input);
  const validated = validateReleaseDeclarationBytes({
    bytes: created.bytes,
    expectedSourceCommit: input.sourceCommit,
    expectedInventoryReceiptSha256: input.inventoryReceiptSha256
  });
  assert.ok(canonicalizeDatabaseContracts(validated.declaration.databaseContracts).bytes
    .equals(canonicalizeDatabaseContracts(input.inventoryReceipt.databaseContracts).bytes));
});

test("deployment companions never add fields to portable Artifact Manifest v1", () => {
  const manifest = createArtifactManifest(manifestFixture());
  assert.deepEqual(Object.keys(manifest), [
    "schemaVersion",
    "releaseUnit",
    "sourceCommit",
    "release",
    "artifact"
  ]);
  assert.equal("deploymentMode" in manifest, false);
  assert.equal("writerRegistrySha256" in manifest, false);
  assert.equal("bootstrapReceiptSha256" in manifest, false);
});
```

- [ ] **Step 6: Run declaration, upstream writer-registry, and manifest tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-release-declaration.mjs
node --test server/tests/control-plane-writer-registry.test.mjs server/tests/control-plane-release-declaration.test.mjs server/tests/artifact-manifest.test.mjs
```

Expected: both commands exit 0; the canonical registry is consumed without a duplicate implementation, normal and compatibility modes are fixed, and Artifact Manifest v1 remains unchanged.

- [ ] **Step 7: Commit only the declaration contract owned by this plan**

```powershell
git add -- scripts/control-plane-release-declaration.mjs ops/control-plane-deploy/release-metadata/release-declaration.template.json server/tests/control-plane-release-declaration.test.mjs server/tests/artifact-manifest.test.mjs
git commit -m "feat: bind control-plane release declaration"
```

### Task 4: Bounded artifact assembly and canonical source verification

**Files:**
- Create: `server/services/deployment/bounded-zip.mjs`
- Create: `server/tests/bounded-zip.test.mjs`
- Create: `scripts/control-plane-artifact-assembly.mjs`
- Create: `server/tests/control-plane-artifact-assembly.test.mjs`
- Modify: `scripts/artifact-git-tree-verifier.mjs`
- Modify: `server/tests/artifact-git-tree-verifier.test.mjs`

**Interfaces:**
- Consumes: canonical source ZIP, production dependency layer, Artifact Manifest v1, release declaration, writer registry, bootstrap receipt companion, and existing trusted Git tree verifier.
- Produces: `inspectBoundedZip({ bytes, limits })`, `createArtifactAssembly(input)`, `verifyArtifactAssembly(input)`, and `runArtifactAssemblyCli(options)`.

- [ ] **Step 1: Write failing bounded-ZIP path and limit tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { inspectBoundedZip } from "../services/deployment/bounded-zip.mjs";

const LIMITS = Object.freeze({
  compressedBytes: 268435456,
  entries: 50000,
  entryBytes: 67108864,
  expandedBytes: 805306368,
  compressionRatio: 100
});

test("bounded ZIP rejects path aliases, links, devices, and expansion abuse", () => {
  for (const archive of [
    zipFixture([{ name: "../escape", data: "x" }]),
    zipFixture([{ name: "C:/drive", data: "x" }]),
    zipFixture([{ name: "alpha", data: "x" }, { name: "ALPHA", data: "x" }]),
    zipFixture([{ name: "link", data: "target", mode: 0o120777 }])
  ]) {
    assert.throws(() => inspectBoundedZip({ bytes: archive, limits: LIMITS }), /bounded_zip_invalid/);
  }
});
```

- [ ] **Step 2: Run bounded-ZIP tests and verify RED**

Run:

```powershell
node --test server/tests/bounded-zip.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/services/deployment/bounded-zip.mjs`.

- [ ] **Step 3: Extract and parameterize the existing ZIP reader**

Move the existing central-directory, local-header, UTF-8 path, CRC32, and inflate checks from `scripts/artifact-git-tree-verifier.mjs` into the shared module, keeping the original verifier behavior unchanged. The public entrypoint is:

```js
export function inspectBoundedZip({ bytes, limits }) {
  assertLimits(limits);
  if (!Buffer.isBuffer(bytes)
    || bytes.length === 0
    || bytes.length > limits.compressedBytes) {
    throw new BoundedZipError();
  }
  const entries = readCentralDirectory(bytes, limits);
  const exactNames = new Set();
  const caseNames = new Set();
  const normalizedNames = new Set();
  let expandedBytes = 0;
  for (const entry of entries) {
    const path = decodePortablePath(entry.rawName);
    const caseKey = path.toLocaleLowerCase("en-US");
    const unicodeKey = path.normalize("NFC");
    if (exactNames.has(path) || caseNames.has(caseKey) || normalizedNames.has(unicodeKey)) {
      throw new BoundedZipError();
    }
    exactNames.add(path);
    caseNames.add(caseKey);
    normalizedNames.add(unicodeKey);
    assertRegularOrDirectory(entry);
    const data = inflateEntry(bytes, entry, limits.entryBytes);
    expandedBytes += data.length;
    if (expandedBytes > limits.expandedBytes
      || entry.compressedSize > 0 && data.length / entry.compressedSize > limits.compressionRatio) {
      throw new BoundedZipError();
    }
    entry.path = path;
    entry.data = data;
  }
  return { entries, compressedBytes: bytes.length, expandedBytes };
}
```

- [ ] **Step 4: Rewire the Git-tree verifier to the shared ZIP module**

```js
import { inspectBoundedZip } from "../server/services/deployment/bounded-zip.mjs";

const SOURCE_LIMITS = Object.freeze({
  compressedBytes: 64 * 1024 * 1024,
  entries: 10_000,
  entryBytes: 64 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  compressionRatio: 100
});

function readZipEntries(artifactPath) {
  const archive = readFileSync(realpathSync(resolve(artifactPath)));
  return inspectBoundedZip({ bytes: archive, limits: SOURCE_LIMITS });
}
```

- [ ] **Step 5: Run original and new ZIP tests and verify GREEN**

Run:

```powershell
node --test server/tests/bounded-zip.test.mjs server/tests/artifact-git-tree-verifier.test.mjs
```

Expected: both test files pass, including all original tree-verifier cases.

- [ ] **Step 6: Write the failing assembly identity test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createArtifactAssembly,
  verifyArtifactAssembly
} from "../../scripts/control-plane-artifact-assembly.mjs";

test("assembly binds source, dependency, companions, and exact file manifest", (t) => {
  const fixture = artifactAssemblyFixture(t);
  const created = createArtifactAssembly(fixture);
  const verified = verifyArtifactAssembly({
    ...fixture,
    bundleBytes: created.bundleBytes,
    assemblyManifestBytes: created.assemblyManifestBytes
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.bundleSha256, created.bundleSha256);
  assert.equal(verified.writerRegistrySha256, fixture.writerRegistrySha256);
  assert.equal(verified.releaseDeclarationSha256, fixture.releaseDeclarationSha256);
  assert.deepEqual(verified.fileNames, [
    "artifact.json",
    "bootstrap-receipt.json",
    "dependency-layer.zip",
    "release-assembly.json",
    "release-declaration.json",
    "source.zip",
    "writer-registry.json"
  ]);
});
```

- [ ] **Step 7: Run assembly tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-artifact-assembly.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-artifact-assembly.mjs`.

- [ ] **Step 8: Implement exact assembly file-manifest and copy checks**

```js
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";
import { inspectBoundedZip } from "../server/services/deployment/bounded-zip.mjs";
import {
  WRITER_REGISTRY_CONTRACT,
  discoverProductionWriters,
  canonicalizeWriterRegistry,
  verifyWriterRegistry
} from "../server/services/deployment/writer-registry.mjs";

const PAYLOAD_FILES = Object.freeze([
  "artifact.json",
  "bootstrap-receipt.json",
  "dependency-layer.zip",
  "release-declaration.json",
  "source.zip",
  "writer-registry.json"
]);

const BUNDLE_FILES = Object.freeze([...PAYLOAD_FILES, "release-assembly.json"].sort());

export function createArtifactAssembly(input) {
  const fileEntries = Object.entries(input.files)
    .map(([fileName, bytes]) => ({ fileName, sha256: sha256Hex(bytes), sizeBytes: bytes.length }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName, "en"));
  if (fileEntries.map(({ fileName }) => fileName).join("\n") !== PAYLOAD_FILES.join("\n")) {
    throw new Error("artifact_assembly_invalid");
  }
  const manifest = {
    schemaVersion: "1",
    assemblyType: "control_plane_production_dependency_bundle",
    sourceCommit: input.sourceCommit,
    runtimeContractId: input.runtimeContractId,
    files: fileEntries
  };
  const assemblyManifestBytes = serializeCanonicalJsonBytes(manifest, input.assemblyContract);
  const bundleBytes = input.zipWriter({ ...input.files, "release-assembly.json": assemblyManifestBytes });
  return {
    bundleBytes,
    bundleSha256: sha256Hex(bundleBytes),
    assemblyManifestBytes,
    assemblyManifestSha256: sha256Hex(assemblyManifestBytes)
  };
}

export function verifyArtifactAssembly(input) {
  const archive = inspectBoundedZip({ bytes: input.bundleBytes, limits: input.bundleLimits });
  const files = new Map(archive.entries.filter((entry) => !entry.directory).map((entry) => [entry.path, entry.data]));
  if (files.size !== BUNDLE_FILES.length
    || !BUNDLE_FILES.every((name) => files.has(name))
    || !files.get("writer-registry.json").equals(input.writerRegistryBytes)
    || !files.get("release-declaration.json").equals(input.releaseDeclarationBytes)) {
    throw new Error("artifact_assembly_invalid");
  }
  const manifest = parseCanonicalJsonBytes(files.get("release-assembly.json"), input.assemblyContract);
  const observedEntries = PAYLOAD_FILES.map((fileName) => ({
    fileName,
    sha256: sha256Hex(files.get(fileName)),
    sizeBytes: files.get(fileName).length
  }));
  if (JSON.stringify(manifest.files) !== JSON.stringify(observedEntries)) throw new Error("artifact_assembly_invalid");
  input.verifySourceZip({ bytes: files.get("source.zip"), sourceCommit: manifest.sourceCommit });
  const discovered = discoverProductionWriters({ sourceRoot: input.trustedCheckoutRoot });
  const discoveredBytes = canonicalizeWriterRegistry(discovered);
  const declared = parseCanonicalJsonBytes(files.get("writer-registry.json"), WRITER_REGISTRY_CONTRACT);
  if (!discoveredBytes.equals(files.get("writer-registry.json"))) throw new Error("artifact_assembly_writer_registry_mismatch");
  verifyWriterRegistry({ discovered, declared });
  return {
    ok: true,
    bundleSha256: sha256Hex(input.bundleBytes),
    writerRegistrySha256: sha256Hex(files.get("writer-registry.json")),
    releaseDeclarationSha256: sha256Hex(files.get("release-declaration.json")),
    fileNames: [...files.keys()].sort()
  };
}
```

- [ ] **Step 9: Add traversal, extra-file, copy-drift, checksum, and size-limit tests**

```js
test("assembly rejects every identity and archive-boundary drift", (t) => {
  const fixture = artifactAssemblyFixture(t);
  const created = createArtifactAssembly(fixture);
  for (const override of [
    { writerRegistryBytes: Buffer.from("{}") },
    { releaseDeclarationBytes: Buffer.from("{}") },
    { bundleBytes: Buffer.concat([created.bundleBytes, Buffer.from("x")]) }
  ]) {
    assert.throws(() => verifyArtifactAssembly({
      ...fixture,
      bundleBytes: created.bundleBytes,
      assemblyManifestBytes: created.assemblyManifestBytes,
      ...override
    }), /artifact_assembly_invalid|bounded_zip_invalid/);
  }
});
```

- [ ] **Step 10: Run assembly tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-artifact-assembly.mjs
node --test server/tests/bounded-zip.test.mjs server/tests/artifact-git-tree-verifier.test.mjs server/tests/control-plane-artifact-assembly.test.mjs
```

Expected: all commands exit 0.

- [ ] **Step 11: Commit bounded archive and assembly contracts**

```powershell
git add -- server/services/deployment/bounded-zip.mjs scripts/artifact-git-tree-verifier.mjs scripts/control-plane-artifact-assembly.mjs server/tests/bounded-zip.test.mjs server/tests/artifact-git-tree-verifier.test.mjs server/tests/control-plane-artifact-assembly.test.mjs
git commit -m "feat: add bounded control-plane artifact assembly"
```

### Task 5: Tokenless two-phase dependency builder

**Files:**
- Create: `ops/control-plane-deploy/artifact-builder-contract.json`
- Create: `ops/control-plane-deploy/runtime-contract.json`
- Create: `scripts/control-plane-artifact-builder.mjs`
- Create: `server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs`
- Create: `server/tests/control-plane-artifact-builder.test.mjs`
- Create: `server/tests/control-plane-better-sqlite3-build-adapter.test.mjs`

**Interfaces:**
- Consumes the Foundation-owned `scripts/build-control-plane-native.mjs` only for first-party/reviewed standalone targets, `verifyNodeHeadersTree(...)`, `verifyNativeToolchainTree(...)`, and `createVerifiedNativeToolEnvironment(verifiedToolchain)`, plus canonical source, exact full lockfile, frozen image, reviewed headers/toolchain custody, verified cache, and injected fixed-process runner. The tracked builder contract fixes the HTTPS origins, content digests, archive entry contracts, and tree digests for the Node-header/toolchain custody inputs; the tokenless online fetch phase downloads and verifies those data bytes into `--custody-output` without credentials, proxies, or script execution. Both online cache fill and offline install use the full dependency graph with `--ignore-scripts` so pinned local `node-gyp` remains present until the direct build completes.
- `control-plane-better-sqlite3-build-adapter.mjs` exports only `buildPinnedBetterSqlite3({ sourceDirectory, nodePath, nodeGypPath, nodeHeaders, toolchain, spawnFn, readFile, statFile, openDatabase, expected })`. `nodeHeaders` and `toolchain` are already verified Foundation return values; the adapter re-hashes fixed Node/node-gyp plus exact `CC`/`CXX`/`AR`/`LD`/`PYTHON`/`MAKE` and the complete Foundation executable-closure table, uses only the owner-returned seven-field tool environment, runs one fixed direct node-gyp command, opens a real `Database(":memory:")`, performs create/insert/select/close, and returns the exact `.node` path/digest without invoking package lifecycle metadata.
- Produces: `sanitizeBuilderEnvironment(env)`, `createVerifiedNativeBuildEnvironment({ base, headers, toolchain, buildTemp, nativeRegistry })`, `inspectLifecycleInventory(input)`, `runTokenlessDependencyFetch(input)`, `runTokenlessDependencyBuild(input)`, `runArtifactBuilderCli(options)`, and a safe receipt binding lock/image/header/toolchain-tree/every-actual-tool/lifecycle/first-party-native/better-sqlite3/output digests plus prune and residue proofs.

- [ ] **Step 1: Write the failing environment and command-boundary tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  runTokenlessDependencyBuild,
  sanitizeBuilderEnvironment
} from "../../scripts/control-plane-artifact-builder.mjs";
import { buildPinnedBetterSqlite3 } from "../services/deployment/control-plane-better-sqlite3-build-adapter.mjs";

test("builder removes GitHub, OIDC, artifact, proxy, and credential environment", async () => {
  const cleaned = sanitizeBuilderEnvironment({
    PATH: "/usr/local/bin:/usr/bin",
    HOME: "/tmp/builder-home",
    GITHUB_TOKEN: "secret",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "secret",
    ACTIONS_RUNTIME_TOKEN: "secret",
    ACTIONS_RUNTIME_URL: "https://artifact.invalid",
    HTTPS_PROXY: "http://proxy.invalid",
    NODE_AUTH_TOKEN: "secret",
    NPM_TOKEN: "secret"
  });
  assert.deepEqual(cleaned, {
    HOME: "/tmp/builder-home",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: "/usr/local/bin:/usr/bin",
    TZ: "UTC"
  });
});

test("builder bypasses lifecycle and uses the one direct better-sqlite3 adapter", async () => {
  const calls = [];
  const fixture = builderFixture();
  await runTokenlessDependencyBuild({
    ...fixture,
    spawnFn: async (file, args, options) => {
      calls.push({ file, args, env: options.env });
      return { status: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
    }
  });
  assert.equal(calls.some(({ file, args }) => `${file} ${args.join(" ")}`.includes("prebuild-install")), false);
  assert.equal(calls.some(({ args }) => args.some((arg) => /(?:preinstall|install|postinstall)/.test(arg))), false);
  assert.deepEqual(calls.find(({ args }) => args[0] === "scripts/build-control-plane-native.mjs"), {
    file: fixture.nodePath,
    args: ["scripts/build-control-plane-native.mjs"],
    env: expectedNativeBuildEnvironment(fixture)
  });
  assert.deepEqual(calls.find(({ args }) => args[0] === fixture.nodeGypPath), {
    file: fixture.nodePath,
    args: [
      fixture.nodeGypPath, "rebuild", "--release", "--directory",
      "node_modules/better-sqlite3", "--nodedir", fixture.nodeHeadersDirectory
    ],
    env: expectedNativeBuildEnvironment(fixture)
  });
});

test("builder receipt binds every build input and output digest", async () => {
  const receipt = await runTokenlessDependencyBuild(builderFixture());
  for (const field of [
    "lockfileSha256", "builderImageDigest", "nodeHeadersTreeSha256", "toolchainTreeSha256",
    "nodeSha256", "npmSha256", "nodeGypSha256", "ccSha256", "cxxSha256",
    "arSha256", "ldSha256", "pythonSha256", "lifecycleInventorySha256",
    "nativeRegistrySha256", "betterSqlite3BindingSha256", "binaryDigests",
    "devDependenciesPruned", "residualBuildInputsAbsent"
  ]) assert.ok(receipt[field], field);
});

test("direct adapter builds and exercises a real in-memory Database", async () => {
  const fixture = betterSqlite3AdapterFixture();
  const result = await buildPinnedBetterSqlite3(fixture);
  assert.match(result.bindingSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(fixture.databaseEvents, ["open::memory:", "create", "insert", "select:1", "close"]);
  assert.equal(fixture.spawnCalls.length, 1);
});
```

- [ ] **Step 2: Run builder tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-artifact-builder.test.mjs server/tests/control-plane-better-sqlite3-build-adapter.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-artifact-builder.mjs` and `server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs`.

- [ ] **Step 3: Implement the closed environment scrubber**

```js
const KEPT_ENVIRONMENT = Object.freeze(["HOME", "PATH"]);

export function sanitizeBuilderEnvironment(env) {
  const output = {
    HOME: String(env.HOME),
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: String(env.PATH),
    TZ: "UTC"
  };
  if (!output.HOME.startsWith("/tmp/") || !output.PATH.startsWith("/usr/local/bin:")) {
    throw new Error("artifact_builder_environment_invalid");
  }
  return output;
}
```

- [ ] **Step 4: Implement exact lifecycle inventory and direct native adapter**

```js
export function inspectLifecycleInventory({ packageRecords }) {
  const lifecycle = packageRecords
    .filter(({ scripts }) => scripts && Object.keys(scripts).some((name) => /^(?:preinstall|install|postinstall)$/.test(name)))
    .map(({ name, version, scripts }) => ({ name, version, scripts }))
    .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`, "en"));
  if (lifecycle.length !== 1
    || lifecycle[0].name !== "better-sqlite3"
    || lifecycle[0].version !== "12.10.0"
    || lifecycle[0].scripts.install !== "prebuild-install || node-gyp rebuild --release") {
    throw new Error("artifact_builder_lifecycle_invalid");
  }
  return lifecycle;
}
```

`server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs` is the only direct third-party native adapter. It does not call npm, a package lifecycle, `prebuild-install`, a shell, or a network API:

```js
import { join } from "node:path";
import { sha256Hex } from "./canonical-json.mjs";
import { createVerifiedNativeToolEnvironment } from "./control-plane-native-toolchain-contract.mjs";

export async function buildPinnedBetterSqlite3({
  sourceDirectory,
  nodePath,
  nodeGypPath,
  nodeHeaders,
  toolchain,
  spawnFn,
  readFile,
  statFile,
  openDatabase,
  expected
}) {
  const toolEnvironment = createVerifiedNativeToolEnvironment(toolchain);
  const fixedTools = Object.freeze({
    cc: toolEnvironment.CC,
    cxx: toolEnvironment.CXX,
    ar: toolEnvironment.AR,
    ld: toolEnvironment.LD,
    python: toolEnvironment.PYTHON,
    make: toolEnvironment.MAKE
  });
  if (sha256Hex(readFile(nodePath)) !== expected.tools.node.sha256
    || sha256Hex(readFile(nodeGypPath)) !== expected.tools.nodeGyp.sha256
    || Object.entries(fixedTools).some(([name, path]) =>
      sha256Hex(readFile(path)) !== expected.tools[name].sha256)) {
    throw new Error("better_sqlite3_build_input_invalid");
  }
  toolchain.assertExecutableClosureUnchanged();
  const args = Object.freeze([
    nodeGypPath,
    "rebuild",
    "--release",
    "--directory",
    "node_modules/better-sqlite3",
    "--nodedir",
    nodeHeaders.directory
  ]);
  const result = await spawnFn(nodePath, args, {
    cwd: sourceDirectory,
    env: Object.freeze({
      HOME: "/tmp/control-plane-build",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TZ: "UTC",
      ...toolEnvironment
    }),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("better_sqlite3_build_failed");
  toolchain.assertExecutableClosureUnchanged();
  const bindingPath = join(sourceDirectory, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const stat = statFile(bindingPath);
  if (!stat.isFile() || stat.size < 1) throw new Error("better_sqlite3_binding_invalid");
  const bindingSha256 = sha256Hex(readFile(bindingPath));
  const database = openDatabase(":memory:");
  try {
    database.exec("CREATE TABLE build_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    database.prepare("INSERT INTO build_probe (value) VALUES (?)").run("ok");
    const row = database.prepare("SELECT count(*) AS count FROM build_probe").get();
    if (row.count !== 1) throw new Error("better_sqlite3_runtime_probe_invalid");
  } finally {
    database.close();
  }
  return Object.freeze({ bindingPath, bindingSha256 });
}
```

The Foundation adapter is invoked only for its reviewed first-party and standalone registry; it never receives `better-sqlite3`:

```js
import { buildPinnedBetterSqlite3 } from "../server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs";

function assertFoundationNativeTargets(input) {
  if (input.foundationNativeTargets.some(({ packageName }) => packageName === "better-sqlite3")) {
    throw new Error("artifact_builder_native_owner_invalid");
  }
}

function validateBuilderTools(input) {
  const expected = input.builderContract.tools;
  for (const [logicalId, path] of [["node", input.nodePath], ["npm", input.npmPath], ["nodeGyp", input.nodeGypPath]]) {
    const contract = expected[logicalId];
    if (path !== contract.path || sha256Hex(input.readFile(path)) !== contract.sha256) {
      throw new Error("artifact_builder_tool_invalid");
    }
  }
}

export async function runTokenlessDependencyFetch(input) {
  validateBuilderTools(input);
  const env = sanitizeBuilderEnvironment(input.env);
  await input.fetchPinnedCustodyData({
    contract: input.builderContract.custody,
    outputDirectory: input.custodyOutputDirectory,
    allowedProtocols: Object.freeze(["https:"]),
    credentials: null,
    proxy: null
  });
  input.verifyPinnedCustodyArchives({
    contract: input.builderContract.custody,
    outputDirectory: input.custodyOutputDirectory
  });
  const result = await input.spawnFn(input.npmPath, [
    "ci", "--ignore-scripts", "--cache", input.cacheDirectory
  ], { cwd: input.fetchSourceDirectory, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("artifact_builder_fetch_failed");
  input.removeDirectory(input.fetchNodeModulesDirectory);
  return input.freezeCacheManifest({
    cacheDirectory: input.cacheDirectory,
    lockfileBytes: input.lockfileBytes,
    builderContract: input.builderContract
  });
}

function validateCompleteBuilderContract(input) {
  const nodeHeaders = verifyNodeHeadersTree({
    directory: input.nodeHeadersDirectory,
    manifestPath: input.nodeHeadersManifestPath,
    expectedSha256: input.contract.nodeHeadersTreeSha256,
    nodeVersion: process.version,
    nodeModuleAbi: process.versions.modules
  });
  const toolchain = verifyNativeToolchainTree({
    directory: input.toolchainDirectory,
    manifestPath: input.toolchainManifestPath,
    expectedSha256: input.contract.toolchainTreeSha256,
    compileProfiles: input.compileProfiles
  });
  const observed = Object.freeze({
    lockfileSha256: sha256Hex(input.lockfileBytes),
    builderImageDigest: input.imageDigest,
    nodeHeadersTreeSha256: input.contract.nodeHeadersTreeSha256,
    toolchainTreeSha256: input.contract.toolchainTreeSha256,
    nativeRegistrySha256: sha256Hex(input.nativeRegistryBytes)
  });
  for (const [name, value] of Object.entries(observed)) {
    if (input.contract[name] !== value) throw new Error(`artifact_builder_contract_invalid_${name}`);
  }
  return Object.freeze({ nodeHeaders, toolchain });
}

export async function runTokenlessDependencyBuild(input) {
  validateBuilderTools(input);
  const verified = validateCompleteBuilderContract({
    contract: input.builderContract,
    lockfileBytes: input.lockfileBytes,
    imageDigest: input.runningImageDigest,
    nodeHeadersDirectory: input.nodeHeadersDirectory,
    nodeHeadersManifestPath: input.nodeHeadersManifestPath,
    toolchainDirectory: input.toolchainDirectory,
    toolchainManifestPath: input.toolchainManifestPath,
    compileProfiles: input.compileProfiles,
    nativeRegistryBytes: input.nativeRegistryBytes
  });
  input.verifyFrozenCacheManifest({
    cacheDirectory: input.cacheDirectory,
    manifestBytes: input.cacheManifestBytes,
    lockfileBytes: input.lockfileBytes,
    builderContract: input.builderContract
  });
  const env = sanitizeBuilderEnvironment(input.env);
  const lifecycle = inspectLifecycleInventory({ packageRecords: input.packageRecords });
  const nativeEnv = createVerifiedNativeBuildEnvironment({
    base: env,
    headers: verified.nodeHeaders,
    toolchain: verified.toolchain,
    buildTemp: input.buildTemp,
    nativeRegistry: input.nativeRegistry,
    custody: Object.freeze({
      CONTROL_PLANE_NODE_HEADERS_DIR: input.nodeHeadersDirectory,
      CONTROL_PLANE_NODE_HEADERS_MANIFEST: input.nodeHeadersManifestPath,
      CONTROL_PLANE_EXPECTED_NODE_HEADERS_SHA256: input.builderContract.nodeHeadersTreeSha256,
      CONTROL_PLANE_NATIVE_TOOLCHAIN_DIR: input.toolchainDirectory,
      CONTROL_PLANE_NATIVE_TOOLCHAIN_MANIFEST: input.toolchainManifestPath,
      CONTROL_PLANE_EXPECTED_TOOLCHAIN_SHA256: input.builderContract.toolchainTreeSha256
    })
  });
  assertFoundationNativeTargets(input);
  const beforeDirectBuild = [
    [input.npmPath, ["ci", "--ignore-scripts", "--offline", "--cache", input.cacheDirectory], env],
    [input.nodePath, ["scripts/build-control-plane-native.mjs"], nativeEnv]
  ];
  for (const [file, args, commandEnv] of beforeDirectBuild) {
    const result = await input.spawnFn(file, args, {
      cwd: input.sourceDirectory,
      env: commandEnv,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (result.status !== 0) throw new Error("artifact_builder_failed");
  }
  const betterSqlite3 = await buildPinnedBetterSqlite3({
    sourceDirectory: input.sourceDirectory,
    nodePath: input.nodePath,
    nodeGypPath: input.nodeGypPath,
    nodeHeaders: verified.nodeHeaders,
    toolchain: verified.toolchain,
    spawnFn: input.spawnFn,
    readFile: input.readFile,
    statFile: input.statFile,
    openDatabase: input.openDatabase,
    expected: input.builderContract
  });
  const prune = await input.spawnFn(input.npmPath, [
    "prune", "--omit=dev", "--ignore-scripts", "--offline", "--cache", input.cacheDirectory
  ], { cwd: input.sourceDirectory, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  if (prune.status !== 0
    || input.pathExists(input.nodeGypDirectory)
    || !input.loadBetterSqlite3AfterPrune({ expectedBindingSha256: betterSqlite3.bindingSha256 })) {
    throw new Error("artifact_builder_prune_invalid");
  }
  input.removeReviewedBuildOnlyPackage("node_modules/prebuild-install");
  input.removeDirectory(input.cacheDirectory);
  const residual = input.findResidualBuildInputs(input.sourceDirectory);
  if (input.pathExists(input.cacheDirectory)
    || residual.some((name) => /(?:^|\/)(?:node-gyp|prebuild-install|\.cache|\.node-gyp|build-tmp)(?:\/|$)/.test(name))
    || residual.length !== 0) {
    throw new Error("artifact_builder_residue_invalid");
  }
  return {
    schemaVersion: "1",
    type: "control_plane_dependency_build",
    runtimeContractId: input.runtimeContractId,
    lockfileSha256: sha256Hex(input.lockfileBytes),
    builderImageDigest: input.builderContract.builderImageDigest,
    nodeHeadersTreeSha256: input.builderContract.nodeHeadersTreeSha256,
    toolchainTreeSha256: input.builderContract.toolchainTreeSha256,
    nodeSha256: input.builderContract.tools.node.sha256,
    npmSha256: input.builderContract.tools.npm.sha256,
    nodeGypSha256: input.builderContract.tools.nodeGyp.sha256,
    ccSha256: input.builderContract.tools.cc.sha256,
    cxxSha256: input.builderContract.tools.cxx.sha256,
    arSha256: input.builderContract.tools.ar.sha256,
    ldSha256: input.builderContract.tools.ld.sha256,
    pythonSha256: input.builderContract.tools.python.sha256,
    makeSha256: input.builderContract.tools.make.sha256,
    toolchainExecutableDigests: verified.toolchain.executableDigests,
    lifecycleInventorySha256: sha256Hex(serializeCanonicalJsonBytes(lifecycle, LIFECYCLE_CONTRACT)),
    nativeRegistrySha256: input.builderContract.nativeRegistrySha256,
    betterSqlite3BindingSha256: betterSqlite3.bindingSha256,
    binaryDigests: hashOrderedOutputBinaries(input.outputDirectory),
    lifecycleCount: lifecycle.length,
    networkDisabled: true,
    nativeModuleLoadable: true,
    devDependenciesPruned: true,
    residualBuildInputsAbsent: true
  };
}
```

- [ ] **Step 5: Add egress, unknown lifecycle, tool digest, and environment-leak tests**

```js
test("builder rejects any drift in the complete native build contract", async () => {
  const fixture = builderFixture();
  await assert.rejects(() => runTokenlessDependencyBuild({
    ...fixture,
    packageRecords: [...fixture.packageRecords, {
      name: "unexpected-native",
      version: "1.0.0",
      scripts: { install: "curl https://example.invalid/install.sh | sh" }
    }]
  }), /artifact_builder_lifecycle_invalid/);
  await assert.rejects(() => runTokenlessDependencyBuild({
    ...fixture,
    nodeGypPath: "/tmp/caller-selected-node-gyp"
  }), /artifact_builder_tool_invalid/);
  for (const field of ["lockfileBytes", "builderImageDigest", "nodeHeadersTreeSha256", "toolchainTreeSha256", "nativeRegistrySha256", "nodeSha256", "npmSha256", "nodeGypSha256", "ccSha256", "cxxSha256", "arSha256", "ldSha256", "pythonSha256", "lifecycleInventory", "outputBinary"]) {
    await assert.rejects(
      () => runTokenlessDependencyBuild(mutatedBuilderFixture(field)),
      /artifact_builder_(?:contract|digest|tool|headers)_invalid/
    );
  }
});

test("builder prunes build-only node-gyp but preserves the verified binding", async () => {
  const fixture = builderFixture();
  const receipt = await runTokenlessDependencyBuild(fixture);
  assert.equal(fixture.pathExists(fixture.nodeGypDirectory), false);
  assert.equal(fixture.loadBetterSqlite3AfterPrune({
    expectedBindingSha256: receipt.betterSqlite3BindingSha256
  }), true);
  assert.deepEqual(fixture.findResidualBuildInputs(fixture.sourceDirectory), []);
});

test("builder never invokes lifecycle, prebuild, shell, or network-capable commands", async () => {
  const fixture = builderFixture();
  await runTokenlessDependencyBuild(fixture);
  for (const call of fixture.spawnCalls) {
    assert.equal(call.options.shell, false);
    assert.doesNotMatch(`${call.file} ${call.args.join(" ")}`, /prebuild-install|npm\s+(?:install|rebuild)|curl|wget|https?:\/\//);
  }
});
```

- [ ] **Step 6: Add the Linux network-disabled wrapper contract**

The workflow invokes the second phase only through this fixed command, and the clean Linux feasibility task proves it works in the frozen image before the source PR can leave Draft:

```bash
/usr/bin/unshare --net --map-root-user \
  /usr/local/bin/node scripts/control-plane-artifact-builder.mjs build \
  --source /workspace/source \
  --cache /workspace/cache \
  --output /workspace/output \
  --runtime-contract-file /workspace/source/ops/control-plane-deploy/runtime-contract.json \
  --builder-contract-file /workspace/source/ops/control-plane-deploy/artifact-builder-contract.json \
  --node-headers-directory /workspace/cache/custody/node-headers \
  --node-headers-manifest /workspace/cache/custody/node-headers-manifest.json \
  --toolchain-directory /workspace/cache/custody/toolchain \
  --toolchain-manifest /workspace/cache/custody/toolchain-manifest.json
```

The CLI parser is closed and dispatches only these exact operations:

```js
export async function runArtifactBuilderCli({ argv, env, stdout, operations }) {
  const [operation, ...tokens] = argv;
  if (operation !== "fetch" && operation !== "build") throw new Error("artifact_builder_operation_invalid");
  const flags = parseClosedFlags(tokens, operation === "fetch"
    ? ["source", "cache", "custody-output", "builder-contract-file"]
    : ["source", "cache", "output", "runtime-contract-file", "builder-contract-file", "node-headers-directory", "node-headers-manifest", "toolchain-directory", "toolchain-manifest"]);
  const result = operation === "fetch"
    ? await operations.fetch({ flags, env })
    : await operations.build({ flags, env });
  stdout.write(`${serializeCanonicalJsonBytes(result, BUILDER_SAFE_RECEIPT_CONTRACT).toString("utf8")}\n`);
}
```

- [ ] **Step 7: Run builder tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-artifact-builder.mjs
node --check server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs
node --test server/tests/control-plane-artifact-builder.test.mjs server/tests/control-plane-better-sqlite3-build-adapter.test.mjs
```

Expected: all commands exit 0; tests prove full dependency installation with scripts disabled, exact Foundation header/toolchain custody, narrow `PATH`, fixed/digest-verified `CC`/`CXX`/`AR`/`LD`/`PYTHON`/`MAKE` plus the complete executable closure, the single digest-pinned direct build, a real in-memory database, receipt binding of every actual tool, offline prune, post-prune binding load, and absence of token/proxy, lifecycle, prebuild, network, node-gyp, cache, and build residue.

- [ ] **Step 8: Commit the tokenless builder contract**

```powershell
git add -- ops/control-plane-deploy/artifact-builder-contract.json ops/control-plane-deploy/runtime-contract.json scripts/control-plane-artifact-builder.mjs server/services/deployment/control-plane-better-sqlite3-build-adapter.mjs server/tests/control-plane-artifact-builder.test.mjs server/tests/control-plane-better-sqlite3-build-adapter.test.mjs
git commit -m "feat: add tokenless dependency builder contract"
```

---

### Task 6: Strict GitHub evidence and reserved-scope attestation

**Files:**
- Create: `ops/control-plane-deploy/github-sigstore-trusted-root.json`
- Create: `ops/control-plane-deploy/github-sigstore-trusted-root.sha256`
- Create: `scripts/control-plane-github-evidence.mjs`
- Create: `scripts/control-plane-github-scope-attestor.mjs`
- Create: `server/services/deployment/github-attestation-verifier.mjs`
- Create: `server/tests/control-plane-github-evidence.test.mjs`
- Create: `server/tests/control-plane-github-scope-attestor.test.mjs`
- Create: `server/tests/github-attestation-verifier.test.mjs`

**Interfaces:**
- `control-plane-github-evidence.mjs` exports `ENVIRONMENT_REVIEWER_CONTRACT`, `ENVIRONMENT_POLICY_CONTRACT`, `PREAPPROVAL_EVIDENCE_CONTRACT`, `canonicalizeApprovalHistory(value) -> { value, bytes, sha256 }`, `readCurrentMaster`, `readEnvironmentPolicy`, `resolveExpectedReviewerApproval`, `readWorkflowApprovalHistory`, `readCurrentRulesetRequiredChecks`, `readCheckRuns`, `readReleaseAsset`, `readAttestationBundles`, `verifyArtifactReleaseEvidence`, `collectPreapprovalEvidence`, and `collectPostapprovalEvidence`. The approval-history entry/root contracts remain private to this evidence owner; each exact approval entry binds normalized `login`, the approval event's stable decimal-string user `id`, and its exact environments. Every other module imports the canonicalizer and never names or re-creates either contract. `readEnvironmentPolicy` returns only `{ value, bytes, sha256 }`; `value` has exact ordered fields `environment`, `preventSelfReview`, `protectedBranches`, `customBranchPolicies`, `adminBypassAllowed`, and `reviewers`. Each sorted reviewer has exact ordered fields `type`, stable decimal-string `id`, normalized lower-case `login`, and normalized lower-case `slug`; a user fixes non-null `login` plus null `slug`, while a team fixes null `login` plus non-null `slug`. Counts are derived only as `reviewers.length` and are never an authority binding. `readCurrentRulesetRequiredChecks` returns exact frozen `{ context, integrationId }` rows; `integrationId` is live evidence only and never becomes a ninth inventory field. `collectPreapprovalEvidence` returns only owner-canonical `{ value, bytes, sha256 }`, never a mutable packet object.
- `readEnvironmentPolicy` uses GitHub's official [`GET /repos/{owner}/{repo}/environments/{environment_name}` contract](https://docs.github.com/en/rest/deployments/environments?apiVersion=2022-11-28), whose fine-grained repository permission is `Actions: read`; do not invent an `Environments: read` permission. The API response must contain an own boolean `can_admins_bypass`; omission, null, or an unknown representation fails closed, and the approved policy requires `adminBypassAllowed === false`. Both Artifact Gate approval and production postapproval require byte-equal current policy bytes, including the complete sorted reviewer set and bypass bit, and bind their digest into the verified publication/Gate/inventory authorization envelope.
- `resolveExpectedReviewerApproval({ repository, policy, approver, approverId, token, fetchFn })` accepts only the owner-returned frozen policy reference plus the normalized login and stable decimal user ID from one canonical approval-history entry. It first derives only `GET /users/{approver}` and requires its current stable user ID/login to equal both approval-event fields byte-for-byte. A direct user reviewer must match that exact ID/login row. For each team reviewer it derives only `GET /orgs/gccwebos-com/teams/{slug}/memberships/{approver}`, requires active membership, and binds the policy team ID/slug plus that same approval/current-user ID/login; no caller supplies an organization, team path, or membership URL. It returns one frozen exact `{ approver, approverId, reviewerType, reviewerId, reviewerLogin, reviewerSlug, identitySha256 }` match, where `identitySha256` is domain-separated over the other six exact fields, rejects zero or multiple matches, and does not expose a membership list. The actual approver must also differ from both dispatch actor identities.
- Imports, without redefining, Integration Task 2's `REQUIRED_CHECK_CONTRACT`, `REQUIRED_CHECK_ARRAY_CONTRACT`, `validateRequiredCheckContracts(value)`, and `canonicalizeRequiredCheckContracts(value) -> { requiredCheckContracts, bytes, sha256 }` from `control-plane-required-check-contract.mjs`, plus the sole private-registry owner `resolveControlPlaneRequiredCheckContracts({ sourceCommit, rulesetRequirements, checkRuns }) -> { requiredCheckContracts, bytes, sha256 }` from `control-plane-required-check-registry.mjs`. Artifact passes the complete live ruleset/check observations to that resolver and consumes its exact frozen return byte-for-byte; it defines no semantic-role/workflow/context/App registry, mapping, identity array, or second canonicalizer. The eight-field inventory identity contract remains separate from live `{ context, integrationId, status, conclusion, headSha }` observations.
- Every reader accepts `{ repository, token, fetchFn }` plus one closed identity object; callers cannot supply a URL, API host, HTTP method, or arbitrary path.
- Ruleset summary pages and exact-SHA check-run pages follow only a same-origin, same-path `rel="next"` URL with fixed query keys, at most 10 pages and 1,000 unique rows. Duplicate IDs/contexts, cycles, full unlinked ruleset pages, inconsistent `total_count`, truncated check pages, and null/non-positive `integration_id` reject. Supporting a null integration requires an inventory-owner schema revision; Artifact does not add a local compatibility field.
- Every App ID in this task's fixtures is explicitly synthetic; production App identity is accepted only from the fresh inventory receipt and live ruleset/check-run readback, never from a source constant.
- `control-plane-github-scope-attestor.mjs` exports `RESERVED_ENVIRONMENT_SECRETS`, `RESERVED_ENVIRONMENT_VARIABLES`, `attestReservedAuthorizationScopes({ repository, environment, secretMaterializer, fetchFn, jwtSigner, clock })`, and `validateReservedAuthorizationScopeAttestation({ bytes, expected })`. The lazy materializer owns App ID, installation ID, and private-key bytes and destroys them before return; the validator returns only `{ value, sha256 }` for exact canonical bytes.
- `attestReservedAuthorizationScopes` returns canonical bytes for exact `{ schemaVersion, repository, environment, secretNamesSha256, variableNamesSha256, scopeStateSha256, valid }`; it never returns names, values, API bodies, JWTs, installation tokens, or an unvalidated scope object.
- `github-attestation-verifier.mjs` exports only `GITHUB_ATTESTATION_POLICY`, `RECOVERED_CLOSEOUT_ATTESTATION_PREDICATE_CONTRACT`, `canonicalizeGitHubAttestationBundleTransport(value) -> Buffer`, `validateExactPublicationPredicateBindings({ predicateType, predicateBindings }) -> { family, value, bytes, sha256 }`, and `createTrackedGithubAttestationVerifier({ clock }) -> { verify({ bundleBytes, expected }) }`. The transport canonicalizer alone owns its complete private bounded Sigstore bundle transport contract and returns canonical duplicate-key-safe bytes; evidence code never uses native JSON re-encoding or names that contract. The factory itself reads the two fixed tracked trust files, requires the LF-terminated digest file to equal the root bundle's SHA-256, parses the exact closed trust bundle, closes over its Fulcio roots and Rekor keys, and exposes neither. There is no public raw-cryptography function and no parameter through which Task 7, Task 8, Task 9, Receipt, a fixture, or a workflow caller can substitute roots, keys, trust bytes, verification time, or a second verifier.
- The verifier imports Integration Task 2's dependency-leaf `INVENTORY_ATTESTATION_PREDICATE_CONTRACT` from `control-plane-inventory-attestation-predicate.mjs`; Integration already precedes Artifact in the master DAG. Its exact fields are `schema, repository, inventoryType, sourceCommit, workflowPath, workflowRef, workflowSha, runtimeContractId, inventoryReceiptSha256, requiredCheckContractsSha256`, and its validator fixes the normal/compatibility receipt-type-to-workflow mapping plus `workflowSha === sourceCommit`. Artifact owns the generic recovered-closeout attestation predicate contract so Receipt can consume it later without an import cycle; its `recoveredCloseoutSha256` is the SHA-256 of the canonical recovered-closeout asset bytes being published, including for `absent_proved`, never a fabricated digest for an absent original Actions artifact. Each call requires exact `expected.predicateBindings`; publication, inventory, and recovered-closeout predicates are canonicalized with their own owner contract and byte-compared, never accepted from predicate type alone.

- [ ] **Step 1: Write strict REST routing and pagination tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalizeApprovalHistory,
  collectPreapprovalEvidence,
  collectPostapprovalEvidence,
  readCheckRuns,
  readCurrentMaster,
  readEnvironmentPolicy,
  resolveExpectedReviewerApproval,
  readCurrentRulesetRequiredChecks,
  readWorkflowApprovalHistory
} from "../../scripts/control-plane-github-evidence.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";
import { resolveControlPlaneRequiredCheckContracts } from "../services/deployment/control-plane-required-check-registry.mjs";

const repository = "gccwebos-com/proxy-gateway-minimal";
const sourceCommit = "a".repeat(40);
const SYNTHETIC_TEST_APP_ID = 15_368;

test("approval history crosses modules only through its owner canonicalizer", () => {
  const canonical = canonicalizeApprovalHistory([
    Object.freeze({ login: "reviewer-one", id: "101", environments: Object.freeze(["artifact-publication"]) })
  ]);
  assert.deepEqual(Object.keys(canonical), ["value", "bytes", "sha256"]);
  assert.deepEqual(canonical.value.approvals[0], {
    login: "reviewer-one",
    id: "101",
    environments: ["artifact-publication"]
  });
  assert.match(canonical.sha256, /^[0-9a-f]{64}$/);
});

function queuedFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      assert.ok(next, "unexpected GitHub request");
      return new Response(JSON.stringify(next.body), {
        status: next.status ?? 200,
        headers: next.headers ?? { "content-type": "application/json" }
      });
    }
  };
}

test("evidence readers derive fixed api.github.com routes", async () => {
  const harness = queuedFetch([
    { body: { object: { type: "commit", sha: sourceCommit } } },
    { body: { can_admins_bypass: false, protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { id: 101, login: "operator" } }], prevent_self_review: true }], deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } } },
    { body: { total_count: 1, check_runs: [{ id: 41, name: "Validate", status: "completed", conclusion: "success", head_sha: sourceCommit, app: { slug: "github-actions", id: SYNTHETIC_TEST_APP_ID } }] } },
    { body: [{ user: { id: 101, login: "operator" }, state: "approved", environments: [{ name: "vultr-japan-production" }] }] }
  ]);

  await readCurrentMaster({ repository, token: "token", fetchFn: harness.fetchFn });
  await readEnvironmentPolicy({ repository, environment: "vultr-japan-production", token: "token", fetchFn: harness.fetchFn });
  await readCheckRuns({ repository, sourceCommit, token: "token", fetchFn: harness.fetchFn });
  await readWorkflowApprovalHistory({ repository, runId: "123", token: "token", fetchFn: harness.fetchFn });

  assert.deepEqual(harness.calls.map(({ url }) => new URL(url).pathname), [
    "/repos/gccwebos-com/proxy-gateway-minimal/git/ref/heads/master",
    "/repos/gccwebos-com/proxy-gateway-minimal/environments/vultr-japan-production",
    `/repos/gccwebos-com/proxy-gateway-minimal/commits/${sourceCommit}/check-runs`,
    "/repos/gccwebos-com/proxy-gateway-minimal/actions/runs/123/approvals"
  ]);
  assert.ok(harness.calls.every(({ url }) => new URL(url).origin === "https://api.github.com"));
});

test("Environment policy is an exact canonical readback", async () => {
  const harness = queuedFetch([{ body: {
    can_admins_bypass: false,
    protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "Team", reviewer: { id: 202, slug: "release-operators" } }, { type: "User", reviewer: { id: 101, login: "Operator" } }], prevent_self_review: true }],
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }
  } }]);
  const policy = await readEnvironmentPolicy({ repository, environment: "artifact-publication", token: "token", fetchFn: harness.fetchFn });
  assert.deepEqual(policy.value, {
    environment: "artifact-publication",
    preventSelfReview: true,
    protectedBranches: true,
    customBranchPolicies: false,
    adminBypassAllowed: false,
    reviewers: [
      { type: "team", id: "202", login: null, slug: "release-operators" },
      { type: "user", id: "101", login: "operator", slug: null }
    ]
  });
  assert.equal(policy.sha256, sha256Hex(policy.bytes));
});

test("Environment policy digest changes on same-count reviewer replacement", async () => {
  const first = await readEnvironmentPolicy(environmentPolicyFixture({ reviewers: [userReviewer(101, "operator")] }));
  const replaced = await readEnvironmentPolicy(environmentPolicyFixture({ reviewers: [userReviewer(102, "replacement")] }));
  assert.equal(first.value.reviewers.length, replaced.value.reviewers.length);
  assert.notEqual(first.sha256, replaced.sha256);
  assert.notDeepEqual(first.bytes, replaced.bytes);
});

test("rulesets and exact-SHA check runs close bounded pagination and preserve integration identity", async () => {
  const harness = paginatedRequiredCheckFixture({ rulesetCount: 101, checkRunCount: 101 });
  const required = await readCurrentRulesetRequiredChecks({ repository, token: "token", fetchFn: harness.fetchFn });
  const runs = await readCheckRuns({ repository, sourceCommit, token: "token", fetchFn: harness.fetchFn });
  assert.equal(required.length, 101);
  assert.deepEqual(required[100], { context: "Validate 101", integrationId: SYNTHETIC_TEST_APP_ID });
  assert.equal(runs.length, 101);
  assert.equal(runs[100].appId, SYNTHETIC_TEST_APP_ID);
  assert.ok(harness.calls.some(({ url }) => new URL(url).searchParams.get("page") === "2"));
});

test("active rulesets scoped away from protected master never enter the sole registry input", async () => {
  const harness = paginatedRequiredCheckFixture({ includeActiveNonMasterRuleset: true });
  const required = await readCurrentRulesetRequiredChecks({ repository, token: "token", fetchFn: harness.fetchFn });
  assert.equal(required.some(({ context }) => context === "Release Branch Only"), false);
  assert.deepEqual(harness.effectiveMasterContexts, required.map(({ context }) => context));
});

test("ruleset/check pagination and integration drift fail closed", async () => {
  for (const fault of [
    "same_context_integration_drift", "null_integration", "duplicate_ruleset_id",
    "duplicate_context", "duplicate_check_run_id", "pagination_cycle", "page_skip",
    "duplicate_query_key",
    "ruleset_truncated", "check_runs_truncated", "too_many_pages"
  ]) {
    const harness = paginatedRequiredCheckFixture({ fault });
    await assert.rejects(
      () => collectPostapprovalEvidence(postapprovalEvidenceFixture({ fetchFn: harness.fetchFn })),
      /github_(?:pagination|ruleset|required_check|check_runs)/
    );
    assert.equal(harness.authorizationWrites, 0);
  }
});

test("Artifact consumes the sole required-check registry result byte-for-byte", async () => {
  const evidenceSource = await readFile(new URL("../../scripts/control-plane-github-evidence.mjs", import.meta.url), "utf8");
  assert.match(evidenceSource, /control-plane-required-check-registry\.mjs/);
  assert.match(evidenceSource, /resolveControlPlaneRequiredCheckContracts/);
  for (const forbidden of [
    "expected" + "ByContext",
    "semantic" + "Role ===",
    "WORKFLOW_" + "PATH",
    "WORKFLOW_" + "REGISTRY",
    "CHECK_CONTEXT_" + "REGISTRY"
  ]) assert.equal(evidenceSource.includes(forbidden), false);
  const live = resolveControlPlaneRequiredCheckContracts(liveRequiredCheckFixture());
  const fixture = postapprovalEvidenceFixture({ expectedRequiredCheckBytes: live.bytes });
  const evidence = await collectPostapprovalEvidence(fixture);
  assert.equal(evidence.requiredCheckContractsSha256, live.sha256);
  assert.deepEqual(fixture.comparedRequiredCheckBytes, [live.bytes]);
});
```

- [ ] **Step 2: Run evidence tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-github-evidence.test.mjs server/tests/control-plane-github-scope-attestor.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-github-evidence.mjs`.

- [ ] **Step 3: Implement the closed GitHub request adapter**

```js
const API_ORIGIN = "https://api.github.com";
const REPOSITORY = "gccwebos-com/proxy-gateway-minimal";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";
import {
  REQUIRED_CHECK_CONTRACT,
  REQUIRED_CHECK_ARRAY_CONTRACT,
  canonicalizeRequiredCheckContracts,
  validateRequiredCheckContracts
} from "../server/services/deployment/control-plane-required-check-contract.mjs";
import { resolveControlPlaneRequiredCheckContracts } from "../server/services/deployment/control-plane-required-check-registry.mjs";
import { canonicalizeGitHubAttestationBundleTransport } from "../server/services/deployment/github-attestation-verifier.mjs";
export const ENVIRONMENT_REVIEWER_CONTRACT = Object.freeze({
  schemaId: "control-plane-environment-reviewer-v1",
  maxBytes: 1_024,
  fieldOrder: Object.freeze(["type", "id", "login", "slug"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    const userValid = value.type === "user"
      && /^[1-9][0-9]{0,19}$/.test(value.id)
      && /^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(value.login)
      && value.slug === null;
    const teamValid = value.type === "team"
      && /^[1-9][0-9]{0,19}$/.test(value.id)
      && value.login === null
      && /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value.slug);
    if (!userValid && !teamValid) throw new Error("github_environment_reviewer_invalid");
  }
});

export const ENVIRONMENT_POLICY_CONTRACT = Object.freeze({
  schemaId: "control-plane-environment-policy-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "environment", "preventSelfReview", "protectedBranches",
    "customBranchPolicies", "adminBypassAllowed", "reviewers"
  ]),
  nested: Object.freeze({
    "environment-reviewer-v1": ENVIRONMENT_REVIEWER_CONTRACT
  }),
  arrays: Object.freeze({
    reviewers: "environment-reviewer-v1"
  }),
  validate(value) {
    if (!['vultr-japan-production', 'artifact-publication'].includes(value.environment)
      || typeof value.preventSelfReview !== "boolean"
      || typeof value.protectedBranches !== "boolean"
      || typeof value.customBranchPolicies !== "boolean"
      || typeof value.adminBypassAllowed !== "boolean"
      || !Array.isArray(value.reviewers)
      || value.reviewers.length < 1
      || value.reviewers.length > 6) {
      throw new Error("github_environment_policy_invalid");
    }
    const identities = value.reviewers.map((reviewer) => `${reviewer.type}:${reviewer.id}:${reviewer.login ?? reviewer.slug}`);
    if (new Set(identities).size !== identities.length
      || identities.some((identity, index) => index > 0 && identities[index - 1].localeCompare(identity) >= 0)) {
      throw new Error("github_environment_policy_invalid");
    }
  }
});

export const PREAPPROVAL_EVIDENCE_CONTRACT = Object.freeze({
  schemaId: "control-plane-preapproval-evidence-v1",
  maxBytes: 4_096,
  fieldOrder: Object.freeze([
    "schema", "sourceCommit", "environmentPolicySha256",
    "requiredCheckContractsSha256", "observedAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_preapproval_evidence_v1"
      || !/^[0-9a-f]{40}$/.test(value.sourceCommit)
      || !/^[0-9a-f]{64}$/.test(value.environmentPolicySha256)
      || !/^[0-9a-f]{64}$/.test(value.requiredCheckContractsSha256)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedAt)) {
      throw new Error("github_preapproval_evidence_invalid");
    }
  }
});

const APPROVAL_HISTORY_ENTRY_CONTRACT = Object.freeze({
  schemaId: "control-plane-github-approval-history-entry-v1",
  maxBytes: 2_048,
  fieldOrder: Object.freeze(["login", "id", "environments"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({
    environments: Object.freeze({ elementType: "string" })
  }),
  validate(value) {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value.login)
      || !/^[1-9][0-9]{0,19}$/.test(value.id)
      || value.environments.length < 1 || value.environments.length > 8
      || value.environments.some((environment) =>
        environment !== "vultr-japan-production" && environment !== "artifact-publication")
      || new Set(value.environments).size !== value.environments.length) {
      throw new Error("github_approval_history_invalid");
    }
  }
});

const APPROVAL_HISTORY_CONTRACT = Object.freeze({
  schemaId: "control-plane-github-approval-history-v1",
  maxBytes: 65_536,
  fieldOrder: Object.freeze(["approvals"]),
  nested: Object.freeze({
    "approval-history-entry-v1": APPROVAL_HISTORY_ENTRY_CONTRACT
  }),
  arrays: Object.freeze({
    approvals: "approval-history-entry-v1"
  }),
  validate(value) {
    if (value.approvals.length < 1 || value.approvals.length > 100) {
      throw new Error("github_approval_history_invalid");
    }
  }
});

export function canonicalizeApprovalHistory(value) {
  if (!Array.isArray(value)) throw new Error("github_approval_history_invalid");
  const approvals = Object.freeze(value.map((entry) => {
    const entryBytes = serializeCanonicalJsonBytes(entry, APPROVAL_HISTORY_ENTRY_CONTRACT);
    const canonicalEntry = parseCanonicalJsonBytes(entryBytes, APPROVAL_HISTORY_ENTRY_CONTRACT);
    return Object.freeze({
      login: canonicalEntry.login.toLowerCase(),
      id: canonicalEntry.id,
      environments: Object.freeze([...canonicalEntry.environments])
    });
  }));
  const canonicalValue = Object.freeze({ approvals });
  const bytes = serializeCanonicalJsonBytes(canonicalValue, APPROVAL_HISTORY_CONTRACT);
  return Object.freeze({ value: canonicalValue, bytes, sha256: sha256Hex(bytes) });
}

async function githubJsonPage({ repository, token, fetchFn, path, query = "" }) {
  const repositoryPath = path.startsWith(`/repos/${REPOSITORY}/`);
  const userPath = /^\/users\/[a-z0-9](?:[a-z0-9-]{0,38})$/.test(path);
  const teamMembershipPath = /^\/orgs\/gccwebos-com\/teams\/[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?\/memberships\/[a-z0-9](?:[a-z0-9-]{0,38})$/.test(path);
  if (repository !== REPOSITORY || (!repositoryPath && !userPath && !teamMembershipPath)) {
    throw new Error("github_evidence_route_invalid");
  }
  const response = await fetchFn(`${API_ORIGIN}${path}${query}`, {
    method: "GET",
    redirect: "error",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28"
    }
  });
  if (!response.ok) throw new Error(`github_evidence_http_${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("github_evidence_content_type_invalid");
  }
  try {
    return Object.freeze({ body: await response.json(), link: response.headers.get("link") });
  } catch {
    throw new Error("github_evidence_json_invalid");
  }
}

async function githubJson(input) {
  const page = await githubJsonPage(input);
  if (page.link !== null) throw new Error("github_pagination_unexpected");
  return page.body;
}

const MAX_GITHUB_PAGES = 10;
const MAX_GITHUB_ITEMS = 1_000;

function parseClosedNextQuery({ link, path, allowedQueryKeys, expectedNextPage, seenUrls, seenPages }) {
  if (link === null) return null;
  const matches = [...link.matchAll(/<([^>]+)>;\s*rel="([^"]+)"/g)];
  const next = matches.filter(([, , rel]) => rel.split(/\s+/).includes("next"));
  if (next.length !== 1) throw new Error("github_pagination_link_invalid");
  const url = new URL(next[0][1]);
  const queryKeys = [...url.searchParams.keys()];
  const nextPage = Number(url.searchParams.get("page"));
  if (url.origin !== API_ORIGIN || url.pathname !== path
    || queryKeys.length !== new Set(queryKeys).size
    || queryKeys.some((key) => !allowedQueryKeys.includes(key))
    || url.searchParams.get("per_page") !== "100"
    || !/^[2-9][0-9]*$/.test(url.searchParams.get("page") ?? "")
    || nextPage !== expectedNextPage
    || (allowedQueryKeys.includes("filter") && url.searchParams.get("filter") !== "latest")
    || (allowedQueryKeys.includes("includes_parents") && url.searchParams.get("includes_parents") !== "true")
    || seenPages.has(nextPage)
    || seenUrls.has(url.href)) {
    throw new Error("github_pagination_link_invalid");
  }
  seenPages.add(nextPage);
  seenUrls.add(url.href);
  return url.search;
}

async function readClosedPages({ repository, token, fetchFn, path, firstQuery, allowedQueryKeys, selectItems, selectTotalCount, itemId }) {
  const seenUrls = new Set([`${API_ORIGIN}${path}${firstQuery}`]);
  const seenPages = new Set([1]);
  const seenIds = new Set();
  const collected = [];
  let query = firstQuery;
  let expectedTotal = null;
  for (let pageNumber = 1; pageNumber <= MAX_GITHUB_PAGES; pageNumber += 1) {
    const page = await githubJsonPage({ repository, token, fetchFn, path, query });
    const items = selectItems(page.body);
    const pageTotal = selectTotalCount(page.body);
    if (!Array.isArray(items) || (pageTotal !== null && (!Number.isSafeInteger(pageTotal) || pageTotal < 0))) {
      throw new Error("github_pagination_body_invalid");
    }
    if (expectedTotal === null) expectedTotal = pageTotal;
    if (pageTotal !== expectedTotal) throw new Error("github_pagination_total_drift");
    for (const item of items) {
      const id = itemId(item);
      if (id === null || seenIds.has(id)) throw new Error("github_pagination_duplicate");
      seenIds.add(id);
      collected.push(item);
      if (collected.length > MAX_GITHUB_ITEMS) throw new Error("github_pagination_limit_exceeded");
    }
    const nextQuery = parseClosedNextQuery({
      link: page.link,
      path,
      allowedQueryKeys,
      expectedNextPage: pageNumber + 1,
      seenUrls,
      seenPages
    });
    if (nextQuery === null) {
      if ((expectedTotal !== null && collected.length !== expectedTotal)
        || (expectedTotal === null && items.length === 100)) {
        throw new Error("github_pagination_truncated");
      }
      return Object.freeze(collected);
    }
    query = nextQuery;
  }
  throw new Error("github_pagination_limit_exceeded");
}

export async function readCurrentMaster({ repository, token, fetchFn }) {
  const body = await githubJson({ repository, token, fetchFn, path: `/repos/${repository}/git/ref/heads/master` });
  if (body?.object?.type !== "commit" || !SHA_PATTERN.test(body?.object?.sha)) {
    throw new Error("github_master_identity_invalid");
  }
  return Object.freeze({ sourceCommit: body.object.sha });
}

export async function readEnvironmentPolicy({ repository, environment, token, fetchFn }) {
  if (environment !== "vultr-japan-production" && environment !== "artifact-publication") {
    throw new Error("github_environment_invalid");
  }
  const body = await githubJson({ repository, token, fetchFn, path: `/repos/${repository}/environments/${environment}` });
  const reviewerRules = body.protection_rules?.filter(({ type }) => type === "required_reviewers") ?? [];
  if (reviewerRules.length !== 1) throw new Error("github_environment_policy_invalid");
  const reviewerRule = reviewerRules[0];
  if (!Object.hasOwn(body, "can_admins_bypass") || typeof body.can_admins_bypass !== "boolean"
    || !Array.isArray(reviewerRule?.reviewers)) {
    throw new Error("github_environment_policy_invalid");
  }
  const reviewers = Object.freeze(reviewerRule.reviewers.map((row) => {
    const type = typeof row?.type === "string" ? row.type.toLowerCase() : null;
    const reviewer = row?.reviewer;
    if ((type !== "user" && type !== "team")
      || !Number.isSafeInteger(reviewer?.id) || reviewer.id < 1) {
      throw new Error("github_environment_reviewer_invalid");
    }
    const value = Object.freeze({
      type,
      id: String(reviewer.id),
      login: type === "user" && typeof reviewer.login === "string" ? reviewer.login.toLowerCase() : null,
      slug: type === "team" && typeof reviewer.slug === "string" ? reviewer.slug.toLowerCase() : null
    });
    serializeCanonicalJsonBytes(value, ENVIRONMENT_REVIEWER_CONTRACT);
    return value;
  }).sort((left, right) =>
    `${left.type}:${left.id}:${left.login ?? left.slug}`.localeCompare(`${right.type}:${right.id}:${right.login ?? right.slug}`)));
  const value = Object.freeze({
    environment,
    preventSelfReview: reviewerRule?.prevent_self_review,
    protectedBranches: body.deployment_branch_policy?.protected_branches,
    customBranchPolicies: body.deployment_branch_policy?.custom_branch_policies,
    adminBypassAllowed: body.can_admins_bypass,
    reviewers
  });
  if (value.preventSelfReview !== true
    || value.protectedBranches !== true
    || value.customBranchPolicies !== false
    || value.adminBypassAllowed !== false) {
    throw new Error("github_environment_policy_invalid");
  }
  const bytes = serializeCanonicalJsonBytes(value, ENVIRONMENT_POLICY_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export async function resolveExpectedReviewerApproval({ repository, policy, approver, approverId, token, fetchFn }) {
  if (repository !== REPOSITORY || !/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(approver)
    || !/^[1-9][0-9]{0,19}$/.test(approverId)
    || !Object.isFrozen(policy) || !Object.isFrozen(policy.reviewers)) {
    throw new Error("github_approval_identity_invalid");
  }
  const currentUser = await githubJson({ repository, token, fetchFn, path: `/users/${approver}` });
  if (!Number.isSafeInteger(currentUser?.id) || currentUser.id < 1
    || String(currentUser.id) !== approverId
    || String(currentUser?.login ?? "").toLowerCase() !== approver) {
    throw new Error("github_approval_identity_invalid");
  }
  const matches = [];
  for (const reviewer of policy.reviewers) {
    serializeCanonicalJsonBytes(reviewer, ENVIRONMENT_REVIEWER_CONTRACT);
    if (reviewer.type === "user" && reviewer.id === approverId && reviewer.login === approver) {
      matches.push(Object.freeze({ approver, approverId, reviewerType: "user", reviewerId: reviewer.id, reviewerLogin: reviewer.login, reviewerSlug: null }));
      continue;
    }
    if (reviewer.type !== "team") continue;
    const body = await githubJson({
      repository,
      token,
      fetchFn,
      path: `/orgs/gccwebos-com/teams/${reviewer.slug}/memberships/${approver}`
    });
    if (body?.state !== "active") continue;
    matches.push(Object.freeze({ approver, approverId, reviewerType: "team", reviewerId: reviewer.id, reviewerLogin: approver, reviewerSlug: reviewer.slug }));
  }
  if (matches.length !== 1) throw new Error("github_approval_identity_invalid");
  const match = matches[0];
  const identitySha256 = sha256Hex(Buffer.from(
    `control-plane-expected-reviewer-approval-v1\0${match.approver}\0${match.approverId}\0${match.reviewerType}\0${match.reviewerId}\0${match.reviewerLogin}\0${match.reviewerSlug ?? ""}`,
    "utf8"
  ));
  return Object.freeze({ ...match, identitySha256 });
}
```

- [ ] **Step 4: Implement exact approval, check, Release, and attestation readers**

```js
export async function readWorkflowApprovalHistory({ repository, runId, token, fetchFn }) {
  if (!/^[1-9][0-9]{0,19}$/.test(String(runId))) throw new Error("github_run_id_invalid");
  const body = await githubJson({ repository, token, fetchFn, path: `/repos/${repository}/actions/runs/${runId}/approvals` });
  if (!Array.isArray(body)) throw new Error("github_approval_history_invalid");
  const approvals = body.map((entry) => {
    const login = entry?.user?.login;
    const id = entry?.user?.id;
    const environments = entry?.environments;
    if (entry?.state !== "approved" || typeof login !== "string"
      || !Number.isSafeInteger(id) || id < 1 || !Array.isArray(environments)) {
      throw new Error("github_approval_history_invalid");
    }
    return Object.freeze({ login, id: String(id), environments: environments.map(({ name }) => name) });
  });
  return canonicalizeApprovalHistory(approvals).value.approvals;
}

function masterRefConditionMatches(pattern) {
  if (pattern === "~ALL" || pattern === "~DEFAULT_BRANCH" || pattern === "refs/heads/master") return true;
  if (/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(pattern)) return false;
  throw new Error("github_ruleset_condition_unsupported");
}

function rulesetAppliesToProtectedMaster(detail) {
  if (detail?.target !== "branch" || detail?.enforcement !== "active") return false;
  const refName = detail?.conditions?.ref_name;
  if (!Array.isArray(refName?.include) || !Array.isArray(refName?.exclude)
    || refName.include.length < 1
    || [...refName.include, ...refName.exclude].some((pattern) => typeof pattern !== "string")) {
    throw new Error("github_ruleset_condition_invalid");
  }
  return refName.include.some(masterRefConditionMatches)
    && !refName.exclude.some(masterRefConditionMatches);
}

export async function readCurrentRulesetRequiredChecks({ repository, token, fetchFn }) {
  const path = `/repos/${repository}/rulesets`;
  const summaries = await readClosedPages({
    repository,
    token,
    fetchFn,
    path,
    firstQuery: "?includes_parents=true&per_page=100&page=1",
    allowedQueryKeys: Object.freeze(["includes_parents", "per_page", "page"]),
    selectItems: (body) => body,
    selectTotalCount: () => null,
    itemId: (summary) => /^[1-9][0-9]{0,19}$/.test(String(summary?.id)) ? String(summary.id) : null
  });
  const requirements = [];
  const contexts = new Set();
  for (const summary of summaries.filter(({ enforcement }) => enforcement === "active")) {
    const detail = await githubJson({ repository, token, fetchFn, path: `/repos/${repository}/rulesets/${summary.id}` });
    if (String(detail?.id) !== String(summary.id)
      || detail?.enforcement !== summary.enforcement
      || (summary.target !== undefined && detail?.target !== summary.target)) {
      throw new Error("github_ruleset_identity_drift");
    }
    if (!rulesetAppliesToProtectedMaster(detail)) continue;
    for (const rule of detail.rules ?? []) {
      if (rule.type !== "required_status_checks") continue;
      for (const check of rule.parameters?.required_status_checks ?? []) {
        if (typeof check.context !== "string" || check.context.length === 0
          || !Number.isSafeInteger(check.integration_id) || check.integration_id < 1
          || contexts.has(check.context)) {
          throw new Error("github_ruleset_required_check_invalid");
        }
        contexts.add(check.context);
        requirements.push(Object.freeze({ context: check.context, integrationId: check.integration_id }));
      }
    }
  }
  return Object.freeze(requirements.sort((left, right) => left.context.localeCompare(right.context)));
}

export async function readCheckRuns({ repository, sourceCommit, token, fetchFn }) {
  if (!SHA_PATTERN.test(sourceCommit)) throw new Error("github_source_commit_invalid");
  const path = `/repos/${repository}/commits/${sourceCommit}/check-runs`;
  const runs = await readClosedPages({
    repository,
    token,
    fetchFn,
    path,
    firstQuery: "?filter=latest&per_page=100&page=1",
    allowedQueryKeys: Object.freeze(["filter", "per_page", "page"]),
    selectItems: (body) => body?.check_runs,
    selectTotalCount: (body) => body?.total_count,
    itemId: (run) => /^[1-9][0-9]{0,19}$/.test(String(run?.id)) ? String(run.id) : null
  });
  return Object.freeze(runs.map((run) => Object.freeze({
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    headSha: run.head_sha,
    appSlug: run.app?.slug,
    appId: run.app?.id,
    detailsUrl: run.details_url
  })));
}

export async function readReleaseAsset({ repository, tag, assetName, token, fetchFn }) {
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(tag) || !/^[A-Za-z0-9._-]{1,180}$/.test(assetName)) {
    throw new Error("github_release_identity_invalid");
  }
  const release = await githubJson({ repository, token, fetchFn, path: `/repos/${repository}/releases/tags/${tag}` });
  const matches = release.assets?.filter(({ name }) => name === assetName) ?? [];
  if (release.tag_name !== tag || matches.length !== 1) throw new Error("github_release_asset_invalid");
  return Object.freeze({ releaseId: release.id, assetId: matches[0].id, name: matches[0].name, size: matches[0].size });
}

export async function readAttestationBundles({ repository, digest, token, fetchFn }) {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("github_attestation_digest_invalid");
  const body = await githubJson({
    repository,
    token,
    fetchFn,
    path: `/repos/${repository}/attestations/${digest}`,
    query: "?per_page=100"
  });
  if (!Array.isArray(body?.attestations)) throw new Error("github_attestation_evidence_invalid");
  return Object.freeze(body.attestations.map(({ bundle }) => canonicalizeGitHubAttestationBundleTransport(bundle)));
}
```

- [ ] **Step 5: Add separate preapproval and postapproval evidence tests**

```js
test("preapproval binds exact-SHA checks and policy without reading future approval history", async () => {
  const harness = preapprovalFixture({ sourceCommit });
  const evidence = await collectPreapprovalEvidence({
    repository,
    expectedSourceCommit: sourceCommit,
    requiredCheckContracts: syntheticRequiredCheckContracts(sourceCommit),
    environment: "vultr-japan-production",
    now: "2026-08-08T10:00:00.000Z",
    token: "token",
    fetchFn: harness.fetchFn
  });
  assert.equal(evidence.value.sourceCommit, sourceCommit);
  assert.match(evidence.sha256, /^[0-9a-f]{64}$/);
  assert.equal(evidence.sha256, sha256Hex(evidence.bytes));
  assert.equal(harness.calls.some(({ url }) => new URL(url).pathname.endsWith("/approvals")), false);
});

test("postapproval re-reads exhaustive ruleset and binds one distinct reviewer", async () => {
  const evidence = await collectPostapprovalEvidence(postapprovalEvidenceFixture({
    sourceCommit,
    approver: "operator",
    requiredCheckContracts: syntheticRequiredCheckContracts(sourceCommit)
  }));
  assert.equal(evidence.approver, "operator");
  assert.match(evidence.reviewerIdentitySha256, /^[0-9a-f]{64}$/);
  assert.match(evidence.approvalHistorySha256, /^[0-9a-f]{64}$/);
  assert.match(evidence.environmentPolicySha256, /^[0-9a-f]{64}$/);
  assert.match(evidence.requiredCheckContractsSha256, /^[0-9a-f]{64}$/);
});

test("postapproval rejects self approval, ruleset/integration drift, stale SHA, app drift, and rerun", async () => {
  for (const fault of [
    "self_approval", "ruleset_extra", "ruleset_missing", "same_context_integration_drift",
    "null_integration", "stale_sha", "app_drift", "run_attempt_2",
    "same_count_user_replacement", "same_count_team_replacement", "approver_not_expected",
    "approval_user_id_drift", "team_membership_inactive", "admin_bypass_true", "admin_bypass_omitted"
  ]) {
    await assert.rejects(() => collectPostapprovalEvidence(postapprovalEvidenceFixture({ fault })), /github_/);
  }
});

test("Environment policy rejects each authority-boundary mutation", async () => {
  for (const fault of [
    "prevent_self_review_false", "unprotected_branch", "custom_branch_policy",
    "admin_bypass_true", "admin_bypass_omitted", "zero_reviewers", "two_reviewer_rules",
    "duplicate_reviewer", "reviewer_without_stable_id"
  ]) {
    await assert.rejects(
      () => readEnvironmentPolicy(environmentPolicyFixture({ fault })),
      /github_environment_policy_invalid/
    );
  }
});

test("actual approver resolves through the current exact user or team reviewer", async () => {
  for (const reviewerType of ["user", "team"]) {
    const fixture = expectedReviewerFixture({ reviewerType, approver: "operator", approverId: "101" });
    const result = await resolveExpectedReviewerApproval(fixture);
    assert.equal(result.approver, "operator");
    assert.equal(result.reviewerType, reviewerType);
    assert.match(result.approverId, /^[1-9][0-9]{0,19}$/);
    assert.match(result.reviewerId, /^[1-9][0-9]{0,19}$/);
    assert.match(result.identitySha256, /^[0-9a-f]{64}$/);
  }
});
```

- [ ] **Step 6: Implement preapproval without approval history and postapproval with current ruleset replay**

```js
async function resolveAndCompareCurrentCheckContracts(input) {
  validateRequiredCheckContracts(input.requiredCheckContracts);
  const [rulesetRequirements, checkRuns] = await Promise.all([
    readCurrentRulesetRequiredChecks(input),
    readCheckRuns({ ...input, sourceCommit: input.expectedSourceCommit })
  ]);
  const live = resolveControlPlaneRequiredCheckContracts({
    sourceCommit: input.expectedSourceCommit,
    rulesetRequirements,
    checkRuns
  });
  const inventory = canonicalizeRequiredCheckContracts(input.requiredCheckContracts);
  if (!live.bytes.equals(inventory.bytes) || live.sha256 !== inventory.sha256) {
    throw new Error("github_ruleset_required_checks_drift");
  }
  return live;
}

export async function collectPreapprovalEvidence(input) {
  const [policy, checkEvidence] = await Promise.all([
    readEnvironmentPolicy(input),
    resolveAndCompareCurrentCheckContracts(input)
  ]);
  const value = Object.freeze({
    schema: "control_plane_preapproval_evidence_v1",
    sourceCommit: input.expectedSourceCommit,
    environmentPolicySha256: policy.sha256,
    requiredCheckContractsSha256: checkEvidence.sha256,
    observedAt: input.now
  });
  const bytes = serializeCanonicalJsonBytes(value, PREAPPROVAL_EVIDENCE_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export async function collectPostapprovalEvidence(input) {
  if (input.runAttempt !== 1) throw new Error("github_run_attempt_invalid");
  const master = await readCurrentMaster(input);
  if (master.sourceCommit !== input.expectedSourceCommit) {
    throw new Error("github_postapproval_source_policy_invalid");
  }
  const [policy, rulesetRequirements, approvals, checkRuns] = await Promise.all([
    readEnvironmentPolicy(input),
    readCurrentRulesetRequiredChecks(input),
    readWorkflowApprovalHistory(input),
    readCheckRuns({ ...input, sourceCommit: input.expectedSourceCommit })
  ]);
  if ((input.expectedEnvironmentPolicySha256 !== undefined
      && policy.sha256 !== input.expectedEnvironmentPolicySha256)
    || policy.value.preventSelfReview !== true
    || policy.value.protectedBranches !== true
    || policy.value.customBranchPolicies !== false
    || policy.value.adminBypassAllowed !== false
    || policy.value.reviewers.length < 1) {
    throw new Error("github_postapproval_source_policy_invalid");
  }
  validateRequiredCheckContracts(input.requiredCheckContracts);
  const inventoryContracts = canonicalizeRequiredCheckContracts(input.requiredCheckContracts);
  const liveContractsCanonical = resolveControlPlaneRequiredCheckContracts({
    sourceCommit: input.expectedSourceCommit,
    rulesetRequirements,
    checkRuns
  });
  if (!liveContractsCanonical.bytes.equals(inventoryContracts.bytes)
    || liveContractsCanonical.sha256 !== inventoryContracts.sha256) {
    throw new Error("github_ruleset_required_checks_drift");
  }
  const approvalHistory = canonicalizeApprovalHistory(approvals);
  const approvers = approvalHistory.value.approvals
    .filter(({ environments }) => environments.length === 1 && environments[0] === input.environment)
    .map(({ login, id }) => Object.freeze({ login, id }));
  if (approvers.length !== 1
    || approvers[0].login === input.actor.toLowerCase()
    || approvers[0].login === input.triggeringActor.toLowerCase()) {
    throw new Error("github_approval_identity_invalid");
  }
  const resolvedReviewer = await resolveExpectedReviewerApproval({
    ...input,
    policy: policy.value,
    approver: approvers[0].login,
    approverId: approvers[0].id
  });
  const confirmedPolicy = await readEnvironmentPolicy(input);
  if (!confirmedPolicy.bytes.equals(policy.bytes)) {
    throw new Error("github_environment_policy_drift");
  }
  const confirmedReviewer = await resolveExpectedReviewerApproval({
    ...input,
    policy: confirmedPolicy.value,
    approver: approvers[0].login,
    approverId: approvers[0].id
  });
  if (confirmedReviewer.identitySha256 !== resolvedReviewer.identitySha256) {
    throw new Error("github_approval_identity_drift");
  }
  return Object.freeze({
    sourceCommit: master.sourceCommit,
    checksValid: true,
    environmentPolicyValid: true,
    requiredCheckContractsSha256: liveContractsCanonical.sha256,
    approvalValid: true,
    approver: approvers[0].login,
    reviewerIdentitySha256: confirmedReviewer.identitySha256,
    approvalHistorySha256: approvalHistory.sha256,
    environmentPolicySha256: confirmedPolicy.sha256
  });
}
```

- [ ] **Step 7: Write scope-name and safe-error tests**

```js
import { attestReservedAuthorizationScopes } from "../../scripts/control-plane-github-scope-attestor.mjs";

test("scope attestor requires exact Environment-only reserved names", async () => {
  const result = await attestReservedAuthorizationScopes(scopeFixture({
    environmentSecrets: [
      "JAPAN_CONTROL_DEPLOY_HOST",
      "JAPAN_CONTROL_DEPLOY_PORT",
      "JAPAN_CONTROL_DEPLOY_USER",
      "JAPAN_CONTROL_DEPLOY_PRIVATE_KEY",
      "JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS",
      "JAPAN_CONTROL_DEPLOY_BINDING_KEY",
      "JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY"
    ],
    repositorySecrets: [],
    organizationSecrets: []
  }));
  assert.equal(result.value.valid, true);
  assert.equal(result.sha256, sha256Hex(result.bytes));
  assert.equal(JSON.stringify(result).includes("JAPAN_CONTROL_DEPLOY_HOST"), false);
});

test("scope attestor rejects repository or organization duplicates without leaking values", async () => {
  await assert.rejects(() => attestReservedAuthorizationScopes(scopeFixture({
    repositorySecrets: ["JAPAN_CONTROL_DEPLOY_PRIVATE_KEY"]
  })), (error) => error.message === "github_authorization_scope_invalid");
});

test("scope attestor reads and destroys metadata App material only inside attestation", async () => {
  const calls = [];
  await attestReservedAuthorizationScopes(scopeFixture({ materializerCalls: calls }));
  assert.deepEqual(calls, ["materializeMetadataApp", "destroyMetadataApp"]);
});
```

- [ ] **Step 8: Implement metadata-App scope attestation**

```js
export const RESERVED_ENVIRONMENT_SECRETS = Object.freeze([
  "JAPAN_CONTROL_DEPLOY_BINDING_KEY",
  "JAPAN_CONTROL_DEPLOY_HOST",
  "JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS",
  "JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY",
  "JAPAN_CONTROL_DEPLOY_PORT",
  "JAPAN_CONTROL_DEPLOY_PRIVATE_KEY",
  "JAPAN_CONTROL_DEPLOY_USER"
]);

export const RESERVED_ENVIRONMENT_VARIABLES = Object.freeze([
  "JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256",
  "JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256",
  "JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION",
  "JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256",
  "JAPAN_CONTROL_DEPLOY_CREDENTIAL_ID",
  "JAPAN_CONTROL_DEPLOY_METADATA_APP_ID",
  "JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID"
]);

function exactNames(records) {
  if (!Array.isArray(records) || records.some(({ name }) => typeof name !== "string")) {
    throw new Error("github_authorization_scope_invalid");
  }
  return records.map(({ name }) => name).sort();
}

export async function attestReservedAuthorizationScopes(input) {
  const material = await input.secretMaterializer.materializeMetadataApp();
  let records;
  try {
    const client = await createInstallationMetadataClient({
      repository: input.repository,
      appId: material.appId,
      installationId: material.installationId,
      privateKeyBytes: material.privateKeyBytes,
      fetchFn: input.fetchFn,
      jwtSigner: input.jwtSigner,
      clock: input.clock
    });
    records = await Promise.all([
      client.listEnvironmentSecrets("vultr-japan-production"),
      client.listEnvironmentVariables("vultr-japan-production"),
      client.listRepositorySecrets(),
      client.listRepositoryVariables(),
      client.listOrganizationSecrets(),
      client.listOrganizationVariables()
    ]);
  } finally {
    input.secretMaterializer.destroyMetadataApp(material);
  }
  const [environmentSecrets, environmentVariables, repositorySecrets, repositoryVariables, organizationSecrets, organizationVariables] = records;
  const envSecretNames = exactNames(environmentSecrets).filter((name) => name.startsWith("JAPAN_CONTROL_DEPLOY_"));
  const envVariableNames = exactNames(environmentVariables).filter((name) => name.startsWith("JAPAN_CONTROL_DEPLOY_"));
  const forbidden = [...repositorySecrets, ...repositoryVariables, ...organizationSecrets, ...organizationVariables]
    .map(({ name }) => name)
    .filter((name) => name.startsWith("JAPAN_CONTROL_DEPLOY_"));
  if (JSON.stringify(envSecretNames) !== JSON.stringify([...RESERVED_ENVIRONMENT_SECRETS].sort())
    || JSON.stringify(envVariableNames) !== JSON.stringify([...RESERVED_ENVIRONMENT_VARIABLES].sort())
    || forbidden.length !== 0) {
    throw new Error("github_authorization_scope_invalid");
  }
  const secretNamesSha256 = sha256Hex(serializeCanonicalJsonBytes(envSecretNames, STRING_ARRAY_CONTRACT));
  const variableNamesSha256 = sha256Hex(serializeCanonicalJsonBytes(envVariableNames, STRING_ARRAY_CONTRACT));
  const scopeStateSha256 = sha256Hex(serializeCanonicalJsonBytes({ secretNamesSha256, variableNamesSha256 }, SCOPE_DIGEST_CONTRACT));
  const value = Object.freeze({ schemaVersion: "1", repository: input.repository, environment: input.environment, secretNamesSha256, variableNamesSha256, scopeStateSha256, valid: true });
  const bytes = serializeCanonicalJsonBytes(value, SCOPE_ATTESTATION_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function validateReservedAuthorizationScopeAttestation({ bytes, expected }) {
  const value = parseCanonicalJsonBytes(bytes, SCOPE_ATTESTATION_CONTRACT);
  if (value.repository !== expected.repository
    || value.environment !== expected.environment
    || value.valid !== expected.valid
    || !serializeCanonicalJsonBytes(value, SCOPE_ATTESTATION_CONTRACT).equals(bytes)) {
    throw new Error("github_authorization_scope_invalid");
  }
  return Object.freeze({ value, sha256: sha256Hex(bytes) });
}
```

- [ ] **Step 8a (3 min): Add the CLI-only lazy metadata-App materializer**

```js
function createMetadataAppSecretMaterializer({ env, zeroize }) {
  let used = false;
  return Object.freeze({
    async materializeMetadataApp() {
      if (used) throw new Error("github_scope_materializer_reused");
      used = true;
      const material = {
        appId: String(env.JAPAN_CONTROL_DEPLOY_METADATA_APP_ID),
        installationId: String(env.JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID),
        privateKeyBytes: Buffer.from(env.JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY, "utf8")
      };
      delete env.JAPAN_CONTROL_DEPLOY_METADATA_APP_ID;
      delete env.JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID;
      delete env.JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY;
      return material;
    },
    destroyMetadataApp(material) {
      zeroize(material.privateKeyBytes);
      material.appId = "";
      material.installationId = "";
    }
  });
}

export async function runScopeAttestorCli({ argv, env, stdout, operations }) {
  const [operation, ...tokens] = argv;
  if (operation !== "attest") throw new Error("github_scope_operation_invalid");
  const flags = parseClosedFlags(tokens, ["repository", "environment", "output"]);
  const result = await attestReservedAuthorizationScopes({
    repository: flags.repository,
    environment: flags.environment,
    secretMaterializer: createMetadataAppSecretMaterializer({ env, zeroize: operations.zeroize }),
    fetchFn: operations.fetchFn,
    jwtSigner: operations.jwtSigner,
    clock: operations.clock
  });
  operations.writeExactBytes(flags.output, result.bytes);
  stdout.write(`${serializeCanonicalJsonBytes({ valid: true, sha256: result.sha256 }, SCOPE_SAFE_RESULT_CONTRACT).toString("utf8")}\n`);
}
```

- [ ] **Step 9: Write RED cryptographic attestation identity tests**

```js
import {
  createTrackedGithubAttestationVerifier,
  validateExactPublicationPredicateBindings
} from "../services/deployment/github-attestation-verifier.mjs";

function verifierFor(fixture) {
  return createTrackedGithubAttestationVerifier({
    clock: Object.freeze({ now: () => new Date(fixture.now) })
  });
}

test("accepts one archived GitHub Sigstore bundle through the tracked verifier", () => {
  const fixture = signedGitHubBundleFixture();
  const verified = verifierFor(fixture).verify({
    bundleBytes: fixture.bundleBytes,
    expected: fixture.expected
  });
  assert.equal(verified.valid, true);
  assert.match(verified.bundleSha256, /^[0-9a-f]{64}$/);
});

for (const fault of [
  "signature", "certificate_chain", "rekor_set", "rekor_inclusion", "issuer",
  "repository", "workflow_path", "workflow_ref", "workflow_sha",
  "source_commit", "predicate_type", "predicate_binding", "subject_name", "subject_digest", "extra_subject",
  "certificate_invalid_at_integrated_time", "rekor_time_future"
]) {
  test(`rejects attestation ${fault} drift`, () => {
    const fixture = signedGitHubBundleFixture({ fault });
    assert.throws(() => verifierFor(fixture).verify({
      bundleBytes: fixture.bundleBytes,
      expected: fixture.expected
    }), /github_attestation_invalid/);
  });
}

test("attestation remains verifiable after Fulcio leaf expiry when Rekor integrated time was valid", () => {
  const fixture = signedGitHubBundleFixture({ nowAfterLeafExpiry: true });
  assert.equal(verifierFor(fixture).verify({
    bundleBytes: fixture.bundleBytes,
    expected: fixture.expected
  }).valid, true);
});

test("predicate owner returns one closed family and no consumer contract", () => {
  const predicateBindings = publicationPredicateFixture();
  const canonical = validateExactPublicationPredicateBindings({
    predicateType: "https://gccwebos.com/attestations/control-plane-publication/v1",
    predicateBindings
  });
  assert.deepEqual(Object.keys(canonical), ["family", "value", "bytes", "sha256"]);
  assert.equal(canonical.family, "artifact_publication");
  assert.deepEqual(canonical.value, predicateBindings);
});

test("tracked verifier accepts no caller-selected root, key, trust, or time", () => {
  assert.throws(() => createTrackedGithubAttestationVerifier({
    clock: Object.freeze({ now: () => new Date() }),
    trust: syntheticTrustFixture()
  }), /github_attestation_verifier_options_invalid/);
});
```

- [ ] **Step 10: Run attestation tests and verify RED**

Run:

```powershell
node --test server/tests/github-attestation-verifier.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/services/deployment/github-attestation-verifier.mjs`.

- [ ] **Step 11: Implement strict Sigstore cryptography and GitHub claim binding**

```js
import { readFileSync } from "node:fs";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "./canonical-json.mjs";
import { INVENTORY_ATTESTATION_PREDICATE_CONTRACT } from "./control-plane-inventory-attestation-predicate.mjs";

const TRACKED_TRUST_ROOT_URL = new URL(
  "../../../ops/control-plane-deploy/github-sigstore-trusted-root.json",
  import.meta.url
);
const TRACKED_TRUST_ROOT_DIGEST_URL = new URL(
  "../../../ops/control-plane-deploy/github-sigstore-trusted-root.sha256",
  import.meta.url
);

const SIGSTORE_TRUST_ENTRY_CONTRACT = Object.freeze({
  schemaId: "control-plane-github-sigstore-trust-entry-v1",
  maxBytes: 32_768,
  fieldOrder: Object.freeze(["kind", "keyId", "pem"]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (!['fulcio_root', 'rekor_key'].includes(value.kind)
      || !/^[0-9a-f]{64}$/.test(value.keyId)
      || typeof value.pem !== "string" || value.pem.length < 64 || value.pem.length > 24_576
      || !value.pem.endsWith("\n")) {
      throw new Error("github_attestation_trusted_root_invalid");
    }
  }
});

const SIGSTORE_TRUST_ROOT_CONTRACT = Object.freeze({
  schemaId: "control-plane-github-sigstore-trust-root-v1",
  maxBytes: 262_144,
  fieldOrder: Object.freeze(["schema", "fulcioRoots", "rekorKeys"]),
  nested: Object.freeze({
    "sigstore-trust-entry-v1": SIGSTORE_TRUST_ENTRY_CONTRACT
  }),
  arrays: Object.freeze({
    fulcioRoots: "sigstore-trust-entry-v1",
    rekorKeys: "sigstore-trust-entry-v1"
  }),
  validate(value) {
    if (value.schema !== "control_plane_github_sigstore_trust_root_v1"
      || value.fulcioRoots.length < 1 || value.fulcioRoots.length > 8
      || value.rekorKeys.length < 1 || value.rekorKeys.length > 8
      || value.fulcioRoots.some(({ kind }) => kind !== "fulcio_root")
      || value.rekorKeys.some(({ kind }) => kind !== "rekor_key")
      || new Set([...value.fulcioRoots, ...value.rekorKeys].map(({ keyId }) => keyId)).size
        !== value.fulcioRoots.length + value.rekorKeys.length) {
      throw new Error("github_attestation_trusted_root_invalid");
    }
  }
});

export const GITHUB_ATTESTATION_POLICY = Object.freeze({
  issuer: "https://token.actions.githubusercontent.com",
  repository: "gccwebos-com/proxy-gateway-minimal",
  ref: "refs/heads/master",
  predicateTypes: Object.freeze({
    artifactPublication: "https://gccwebos.com/attestations/control-plane-publication/v1",
    recoveredCloseout: "https://slsa.dev/provenance/v1"
  })
});

export function canonicalizeGitHubAttestationBundleTransport(value) {
  const bytes = serializeCanonicalJsonBytes(value, SIGSTORE_BUNDLE_CONTRACT);
  parseCanonicalJsonBytes(bytes, SIGSTORE_BUNDLE_CONTRACT);
  return bytes;
}

function verifySigstoreBundleCryptography({ bundleBytes, fulcioRoots, rekorKeys, now }) {
  const bundle = parseCanonicalJsonBytes(bundleBytes, SIGSTORE_BUNDLE_CONTRACT);
  const statementBytes = decodeDssePayload(bundle.dsseEnvelope);
  const rekor = verifyRekorSignedEntryTimestamp({ bundle, rekorKeys });
  verifyRekorInclusionPromiseAndProof({ bundle, statementBytes, rekorKeys });
  if (!Number.isSafeInteger(rekor.integratedTime)
    || rekor.integratedTime * 1000 > Date.parse(now) + 30_000) {
    throw new Error("github_attestation_invalid");
  }
  const certificate = verifyFulcioCertificateChain({
    certificateChain: bundle.verificationMaterial.x509CertificateChain,
    fulcioRoots,
    verificationTime: new Date(rekor.integratedTime * 1000).toISOString()
  });
  verifyDsseSignature({
    envelope: bundle.dsseEnvelope,
    certificate,
    paeBytes: createDssePae("application/vnd.in-toto+json", statementBytes)
  });
  return Object.freeze({
    bundle,
    certificateClaims: readGitHubOidcCertificateExtensions(certificate),
    statementBytes,
    statement: parseCanonicalJsonBytes(statementBytes, IN_TOTO_STATEMENT_CONTRACT)
  });
}

const PUBLICATION_ATTESTATION_PREDICATE_CONTRACT = Object.freeze({
  schemaId: "control-plane-publication-attestation-predicate-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "schema", "repository", "sourceSha", "workflowPath", "workflowRef",
    "workflowSha", "publicationMode", "artifactPublicationApprovalSha256",
    "publicationAuthorizationSha256", "publicationEnvelopeSha256",
    "inventoryReceiptSha256", "productionGateReceiptSha256",
    "compatibilityInventoryReceiptSha256"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_publication_attestation_v1"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal"
      || ![
        ".github/workflows/control-plane-artifact-gate.yml",
        ".github/workflows/control-plane-compatibility-artifact-gate.yml"
      ].includes(value.workflowPath)
      || value.workflowRef !== `${value.repository}/${value.workflowPath}@refs/heads/master`
      || !/^[0-9a-f]{40}$/.test(value.sourceSha)
      || value.workflowSha !== value.sourceSha
      || !["normal", "compatibility_bootstrap"].includes(value.publicationMode)
      || (value.publicationMode === "normal"
        && value.workflowPath !== ".github/workflows/control-plane-artifact-gate.yml")
      || (value.publicationMode === "compatibility_bootstrap"
        && value.workflowPath !== ".github/workflows/control-plane-compatibility-artifact-gate.yml")
      || ![
        value.artifactPublicationApprovalSha256,
        value.publicationAuthorizationSha256,
        value.publicationEnvelopeSha256,
        value.inventoryReceiptSha256,
        value.productionGateReceiptSha256
      ].every((digest) => /^[0-9a-f]{64}$/.test(digest))
      || (value.publicationMode === "normal" && value.compatibilityInventoryReceiptSha256 !== null)
      || (value.publicationMode === "compatibility_bootstrap"
        && !/^[0-9a-f]{64}$/.test(value.compatibilityInventoryReceiptSha256))) {
      throw new Error("publication_attestation_predicate_invalid");
    }
  }
});

export const RECOVERED_CLOSEOUT_ATTESTATION_PREDICATE_CONTRACT = Object.freeze({
  schemaId: "control-plane-recovered-closeout-attestation-predicate-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "schema", "repository", "originalTransactionTargetCommit",
    "attesterWorkflowPath", "attesterWorkflowRef", "attesterWorkflowSha",
    "attesterSourceCommit", "controllerRecoveryId", "terminalReceiptSha256",
    "recoveredCloseoutSha256", "actionsArtifactObservationSha256"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_recovered_closeout_attestation_v1"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal"
      || value.attesterWorkflowPath !== ".github/workflows/control-plane-receipt-recovery.yml"
      || value.attesterWorkflowRef !== "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-receipt-recovery.yml@refs/heads/master"
      || !/^[0-9a-f]{40}$/.test(value.originalTransactionTargetCommit)
      || !/^[0-9a-f]{40}$/.test(value.attesterWorkflowSha)
      || !/^[0-9a-f]{40}$/.test(value.attesterSourceCommit)
      || !/^cr1\.[0-9a-f]{64}$/.test(value.controllerRecoveryId)
      || ![value.terminalReceiptSha256, value.recoveredCloseoutSha256,
        value.actionsArtifactObservationSha256].every((digest) => /^[0-9a-f]{64}$/.test(digest))) {
      throw new Error("recovered_closeout_attestation_predicate_invalid");
    }
  }
});

export function validateExactPublicationPredicateBindings({ predicateType, predicateBindings }) {
  let family;
  let contract;
  if (predicateType === GITHUB_ATTESTATION_POLICY.predicateTypes.artifactPublication) {
    family = "artifact_publication";
    contract = PUBLICATION_ATTESTATION_PREDICATE_CONTRACT;
  } else if (predicateType === "https://slsa.dev/provenance/v1"
    && predicateBindings?.schema === "control_plane_inventory_attestation_v1") {
    family = "inventory";
    contract = INVENTORY_ATTESTATION_PREDICATE_CONTRACT;
  } else if (predicateType === GITHUB_ATTESTATION_POLICY.predicateTypes.recoveredCloseout
    && predicateBindings?.schema === "control_plane_recovered_closeout_attestation_v1") {
    family = "recovered_closeout";
    contract = RECOVERED_CLOSEOUT_ATTESTATION_PREDICATE_CONTRACT;
  } else {
    throw new Error("github_attestation_predicate_family_invalid");
  }
  const bytes = serializeCanonicalJsonBytes(predicateBindings, contract);
  const value = Object.freeze(parseCanonicalJsonBytes(bytes, contract));
  return Object.freeze({ family, value, bytes, sha256: sha256Hex(bytes) });
}

function loadTrackedSigstoreTrust() {
  const trustedRootBundle = readFileSync(TRACKED_TRUST_ROOT_URL);
  const digestFile = readFileSync(TRACKED_TRUST_ROOT_DIGEST_URL, "utf8");
  if (!/^[0-9a-f]{64}\n$/.test(digestFile)
    || sha256Hex(trustedRootBundle) !== digestFile.slice(0, 64)) {
    throw new Error("github_attestation_trusted_root_invalid");
  }
  const value = parseCanonicalJsonBytes(trustedRootBundle, SIGSTORE_TRUST_ROOT_CONTRACT);
  return Object.freeze({
    fulcioRoots: Object.freeze(value.fulcioRoots.map(({ pem }) => pem)),
    rekorKeys: Object.freeze(value.rekorKeys.map(({ keyId, pem }) => Object.freeze({ keyId, pem })))
  });
}

function verifyTrackedGitHubAttestation({ bundleBytes, expected, trust, now }) {
  const verified = verifySigstoreBundleCryptography({
    bundleBytes,
    fulcioRoots: trust.fulcioRoots,
    rekorKeys: trust.rekorKeys,
    now
  });
  const claims = verified.certificateClaims;
  const statement = verified.statement;
  const subjects = statement.subject.filter(({ name, digest }) => name === expected.subjectName && digest.sha256 === expected.subjectSha256);
  const expectedPredicate = validateExactPublicationPredicateBindings({
    predicateType: expected.predicateType,
    predicateBindings: expected.predicateBindings
  });
  const actualPredicate = validateExactPublicationPredicateBindings({
    predicateType: statement.predicateType,
    predicateBindings: statement.predicate
  });
  const bindingWorkflowPath = expectedPredicate.family === "recovered_closeout"
    ? expectedPredicate.value.attesterWorkflowPath
    : expectedPredicate.value.workflowPath;
  const bindingWorkflowRef = expectedPredicate.family === "recovered_closeout"
    ? expectedPredicate.value.attesterWorkflowRef
    : expectedPredicate.value.workflowRef;
  const bindingWorkflowSha = expectedPredicate.family === "recovered_closeout"
    ? expectedPredicate.value.attesterWorkflowSha
    : expectedPredicate.value.workflowSha;
  const bindingSourceCommit = expectedPredicate.family === "artifact_publication"
    ? expectedPredicate.value.sourceSha
    : expectedPredicate.family === "recovered_closeout"
      ? expectedPredicate.value.attesterSourceCommit
      : expectedPredicate.value.sourceCommit;
  if (claims.issuer !== GITHUB_ATTESTATION_POLICY.issuer
    || claims.repository !== GITHUB_ATTESTATION_POLICY.repository
    || claims.workflowPath !== expected.workflowPath
    || expected.workflowRef !== `${GITHUB_ATTESTATION_POLICY.repository}/${expected.workflowPath}@${GITHUB_ATTESTATION_POLICY.ref}`
    || claims.workflowRef !== expected.workflowRef
    || claims.workflowSha !== expected.workflowSha
    || claims.sourceRef !== GITHUB_ATTESTATION_POLICY.ref
    || claims.sourceSha !== expected.sourceCommit
    || statement.predicateType !== expected.predicateType
    || statement.subject.length !== 1
    || subjects.length !== 1
    || expectedPredicate.family !== actualPredicate.family
    || !expectedPredicate.bytes.equals(actualPredicate.bytes)
    || bindingWorkflowPath !== expected.workflowPath
    || bindingWorkflowRef !== expected.workflowRef
    || bindingWorkflowSha !== expected.workflowSha
    || bindingSourceCommit !== expected.sourceCommit) {
    throw new Error("github_attestation_invalid");
  }
  return Object.freeze({
    bundleSha256: sha256Hex(bundleBytes),
    statementSha256: sha256Hex(verified.statementBytes),
    subjectSha256: expected.subjectSha256,
    valid: true
  });
}

export function createTrackedGithubAttestationVerifier(options) {
  const keys = options !== null && typeof options === "object" ? Reflect.ownKeys(options) : [];
  if (keys.length !== 1 || keys[0] !== "clock"
    || options === null || Object.getPrototypeOf(options) !== Object.prototype
    || options.clock === null || typeof options.clock !== "object"
    || Reflect.ownKeys(options.clock).length !== 1
    || Reflect.ownKeys(options.clock)[0] !== "now"
    || typeof options.clock.now !== "function") {
    throw new Error("github_attestation_verifier_options_invalid");
  }
  const trust = loadTrackedSigstoreTrust();
  return Object.freeze({
    verify(input) {
      const inputKeys = input !== null && typeof input === "object" ? Reflect.ownKeys(input) : [];
      if (inputKeys.length !== 2 || inputKeys[0] !== "bundleBytes" || inputKeys[1] !== "expected") {
        throw new Error("github_attestation_verifier_input_invalid");
      }
      const now = options.clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error("github_attestation_verifier_clock_invalid");
      }
      return verifyTrackedGitHubAttestation({
        bundleBytes: input.bundleBytes,
        expected: input.expected,
        trust,
        now: now.toISOString()
      });
    }
  });
}
```

The same module implements the private executable `SIGSTORE_TRUST_ROOT_CONTRACT`, `verifyFulcioCertificateChain`, DSSE PAE/signature validation, Rekor signed-entry-timestamp validation, RFC 6962 inclusion proof reconstruction, GitHub Fulcio extension parsing, and canonical in-toto parsing with Node's built-in `crypto`. Rekor SET/inclusion and trusted integrated time are verified before certificate validity; the Fulcio leaf is evaluated at that signed integrated time, never at current wall clock. Current wall clock is used only to reject an impossible future log time or an explicitly bounded freshness policy. The root bundle and LF-terminated digest are reviewed, tracked byte-for-byte inputs; the factory owns their fixed URLs and network-fetched or caller-selected trust material is structurally impossible. Tests use a committed archived GitHub bundle under that production trust plus private primitive fixtures, and mutate each cryptographic and identity boundary independently, including verification after leaf expiry.

- [ ] **Step 12: Run GitHub evidence tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-github-evidence.mjs
node --check scripts/control-plane-github-scope-attestor.mjs
node --check server/services/deployment/github-attestation-verifier.mjs
node --test server/tests/control-plane-github-evidence.test.mjs server/tests/control-plane-github-scope-attestor.test.mjs server/tests/github-attestation-verifier.test.mjs
```

Expected: all commands exit 0; tests prove preapproval/postapproval separation, exhaustive ruleset replay, fixed routing, exact identity binding, distinct approval, lazy Environment-only scope proof, cryptographic attestation verification, pagination, and aggregate-only errors.

- [ ] **Step 13: Commit the GitHub evidence boundary**

```powershell
git add -- ops/control-plane-deploy/github-sigstore-trusted-root.json ops/control-plane-deploy/github-sigstore-trusted-root.sha256 scripts/control-plane-github-evidence.mjs scripts/control-plane-github-scope-attestor.mjs server/services/deployment/github-attestation-verifier.mjs server/tests/control-plane-github-evidence.test.mjs server/tests/control-plane-github-scope-attestor.test.mjs server/tests/github-attestation-verifier.test.mjs
git commit -m "feat: add GitHub deployment evidence contracts"
```

---

### Task 7: Idempotent immutable Release asset and attestation publisher

**Files:**
- Create: `scripts/github-immutable-release-publisher.mjs`
- Create: `server/tests/github-immutable-release-publisher.test.mjs`

**Interfaces:**
- Produces `inspectImmutableAssetAttestationPair({ repository, tag, targetCommit, assetName, sha256, attestationIdentity, predicateBindings, token, fetchFn }) -> { state, releaseId, assetId, assetMatches, attestationMatches }`.
- Produces `publishImmutableAssetAttestationPair({ repository, tag, targetCommit, assetName, bytes, sha256, attestationIdentity, predicateBindings, token, fetchFn, attestFn }) -> { state: "complete", releaseId, assetId, sha256 }`.
- State is exactly `none | asset_only | attestation_only | complete | conflict`.
- This is the only Release client used for the final asset/attestation pair; receipt recovery imports the same module and must not create a second GitHub publication client.
- The module explicitly imports `createTrackedGithubAttestationVerifier` and `validateExactPublicationPredicateBindings` from the Task 6 owner. It constructs one module-private tracked verifier and calls its closed `verify` method for every candidate bundle. The publication identity derives one closed workflow policy: normal/compatibility Artifact Gate paths for `control-plane-app-*`, and `.github/workflows/control-plane-receipt-recovery.yml` for `control-plane-recovered-closeout-*`; no caller-selected issuer/repository/ref/predicate/workflow/trust/clock is accepted.
- Before its first GitHub read or write, the generic publisher requires `attestationIdentity` to be a frozen ordinary object with exactly the five ordered keys `workflowPath`, `workflowRef`, `workflowSha`, `sourceCommit`, and `predicateType`, and passes `predicateBindings` only through the owner's public exact validator. It consumes the returned `{ family, value, bytes, sha256 }` and never imports a predicate contract. Normal/compatibility Artifact and inventory families require `workflowSha === sourceCommit === targetCommit`. For `control-plane-recovered-closeout-*`, `targetCommit` is the original transaction/Release target while `workflowSha` and `sourceCommit` are the current protected recovery workflow/attester source; they need not equal the original target. The Receipt-owned recovered predicate binds both the original `targetCommit` and current attester workflow/source identity, so neither can be substituted.

- [ ] **Step 1: Write the five-state inspection table**

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  inspectImmutableAssetAttestationPair,
  publishImmutableAssetAttestationPair
} from "../../scripts/github-immutable-release-publisher.mjs";

const immutableBytes = Buffer.from("immutable bytes");
const immutableSha256 = createHash("sha256").update(immutableBytes).digest("hex");

test("publisher consumes only the attestation owner's public closure API", async () => {
  const owner = await import("../services/deployment/github-attestation-verifier.mjs");
  assert.deepEqual(Object.keys(owner).sort(), [
    "GITHUB_ATTESTATION_POLICY",
    "RECOVERED_CLOSEOUT_ATTESTATION_PREDICATE_CONTRACT",
    "createTrackedGithubAttestationVerifier",
    "validateExactPublicationPredicateBindings"
  ]);
  const source = await readFile(new URL("../../scripts/github-immutable-release-publisher.mjs", import.meta.url), "utf8");
  assert.match(source, /createTrackedGithubAttestationVerifier/);
  assert.match(source, /validateExactPublicationPredicateBindings/);
});

const identity = Object.freeze({
  repository: "gccwebos-com/proxy-gateway-minimal",
  tag: `control-plane-app-${"a".repeat(40)}-linux-amd64-glibc-node-127`,
  targetCommit: "a".repeat(40),
  assetName: `control-plane-app-${immutableSha256}.zip`,
  sha256: immutableSha256,
  attestationIdentity: Object.freeze({
    workflowPath: ".github/workflows/control-plane-artifact-gate.yml",
    workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/control-plane-artifact-gate.yml@refs/heads/master",
    workflowSha: "a".repeat(40),
    sourceCommit: "a".repeat(40),
    predicateType: "https://gccwebos.com/attestations/control-plane-publication/v1"
  }),
  predicateBindings: publicationPredicateFixture(),
  token: "token"
});

for (const expected of ["none", "asset_only", "attestation_only", "complete", "conflict"]) {
  test(`inspection classifies ${expected}`, async () => {
    const result = await inspectImmutableAssetAttestationPair({
      ...identity,
      fetchFn: publicationFixtureFetch(expected)
    });
    assert.equal(result.state, expected);
  });
}
```

- [ ] **Step 2: Run publisher tests and verify RED**

Run:

```powershell
node --test server/tests/github-immutable-release-publisher.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/github-immutable-release-publisher.mjs`.

- [ ] **Step 3: Implement exact Release and attestation inspection**

```js
import {
  createTrackedGithubAttestationVerifier,
  validateExactPublicationPredicateBindings
} from "../server/services/deployment/github-attestation-verifier.mjs";

const REPOSITORY = "gccwebos-com/proxy-gateway-minimal";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ATTESTATION_IDENTITY_FIELDS = Object.freeze([
  "workflowPath", "workflowRef", "workflowSha", "sourceCommit", "predicateType"
]);
const SLSA_PREDICATE = "https://slsa.dev/provenance/v1";
const PUBLICATION_PREDICATE = "https://gccwebos.com/attestations/control-plane-publication/v1";
const TRACKED_ATTESTATION_VERIFIER = createTrackedGithubAttestationVerifier({
  clock: Object.freeze({ now: () => new Date() })
});

function tagFamilyPolicies(tag, targetCommit) {
  const runtimeSuffix = "[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
  const app = new RegExp(`^control-plane-app-(${COMMIT_PATTERN.source.slice(1, -1)})-(${runtimeSuffix})$`).exec(tag);
  if (app !== null && app[1] === targetCommit) return Object.freeze([
    Object.freeze({ workflowPath: ".github/workflows/control-plane-artifact-gate.yml", predicateType: PUBLICATION_PREDICATE }),
    Object.freeze({ workflowPath: ".github/workflows/control-plane-compatibility-artifact-gate.yml", predicateType: PUBLICATION_PREDICATE })
  ]);
  const inventory = new RegExp(`^control-plane-inventory-(${COMMIT_PATTERN.source.slice(1, -1)})-(${runtimeSuffix})$`).exec(tag);
  if (inventory !== null && inventory[1] === targetCommit) return Object.freeze([
    Object.freeze({ workflowPath: ".github/workflows/japan-control-plane-readonly-inventory.yml", predicateType: SLSA_PREDICATE })
  ]);
  const compatibility = new RegExp(`^control-plane-compatibility-inventory-(${COMMIT_PATTERN.source.slice(1, -1)})-(${runtimeSuffix})$`).exec(tag);
  if (compatibility !== null && compatibility[1] === targetCommit) return Object.freeze([
    Object.freeze({ workflowPath: ".github/workflows/japan-control-plane-compatibility-readonly-inventory.yml", predicateType: SLSA_PREDICATE })
  ]);
  if (/^control-plane-recovered-closeout-cr1\.[0-9a-f]{64}$/.test(tag)) return Object.freeze([
    Object.freeze({ workflowPath: ".github/workflows/control-plane-receipt-recovery.yml", predicateType: SLSA_PREDICATE, recovered: true })
  ]);
  throw new Error("immutable_publication_tag_family_invalid");
}

function validateRecoveredPublicationIdentity({ targetCommit, attestationIdentity, predicate }) {
  return predicate.originalTransactionTargetCommit === targetCommit
    && predicate.attesterWorkflowPath === attestationIdentity.workflowPath
    && predicate.attesterWorkflowRef === attestationIdentity.workflowRef
    && predicate.attesterWorkflowSha === attestationIdentity.workflowSha
    && predicate.attesterSourceCommit === attestationIdentity.sourceCommit;
}

function validateExactPredicateBindingsForTagFamily(input) {
  const recovered = /^control-plane-recovered-closeout-cr1\.[0-9a-f]{64}$/.test(input.tag);
  const inventory = /^control-plane-(?:compatibility-)?inventory-/.test(input.tag);
  const expectedFamily = recovered ? "recovered_closeout" : inventory ? "inventory" : "artifact_publication";
  const canonical = validateExactPublicationPredicateBindings({
    predicateType: input.attestationIdentity?.predicateType,
    predicateBindings: input.predicateBindings
  });
  if (canonical.family !== expectedFamily) {
    throw new Error("immutable_publication_predicate_invalid");
  }
  return canonical;
}

function validateAttestationIdentity({ tag, targetCommit, attestationIdentity, canonicalPredicate }) {
  const keys = attestationIdentity !== null && typeof attestationIdentity === "object"
    ? Reflect.ownKeys(attestationIdentity)
    : [];
  if (attestationIdentity === null || typeof attestationIdentity !== "object"
    || Object.getPrototypeOf(attestationIdentity) !== Object.prototype
    || !Object.isFrozen(attestationIdentity)
    || keys.length !== ATTESTATION_IDENTITY_FIELDS.length
    || !keys.every((key, index) => key === ATTESTATION_IDENTITY_FIELDS[index])
    || keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(attestationIdentity, key);
      return descriptor === undefined || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined;
    })) {
    throw new Error("immutable_publication_attestation_identity_invalid");
  }
  const matches = tagFamilyPolicies(tag, targetCommit).filter(({ workflowPath, predicateType, recovered = false }) =>
    attestationIdentity.workflowPath === workflowPath
    && attestationIdentity.workflowRef === `${REPOSITORY}/${workflowPath}@refs/heads/master`
    && COMMIT_PATTERN.test(attestationIdentity.workflowSha)
    && COMMIT_PATTERN.test(attestationIdentity.sourceCommit)
    && (recovered
      ? validateRecoveredPublicationIdentity({
        targetCommit,
        attestationIdentity,
        predicate: canonicalPredicate.value
      })
      : attestationIdentity.workflowSha === targetCommit && attestationIdentity.sourceCommit === targetCommit)
    && attestationIdentity.predicateType === predicateType);
  if (matches.length !== 1) throw new Error("immutable_publication_attestation_identity_invalid");
  return attestationIdentity;
}

function validateInput(input) {
  if (input.repository !== REPOSITORY
    || !COMMIT_PATTERN.test(input.targetCommit)
    || !SHA256_PATTERN.test(input.sha256)
    || !/^[A-Za-z0-9._-]{1,180}$/.test(input.tag)
    || !/^[A-Za-z0-9._-]{1,180}$/.test(input.assetName)) {
    throw new Error("immutable_publication_identity_invalid");
  }
  const canonicalPredicate = validateExactPredicateBindingsForTagFamily(input);
  validateAttestationIdentity({ ...input, canonicalPredicate });
}

export async function inspectImmutableAssetAttestationPair(input) {
  validateInput(input);
  const release = await readExactReleaseByTag(input);
  if (release !== null && release.target_commitish !== input.targetCommit) {
    return Object.freeze({ state: "conflict", releaseId: release.id, assetId: null, assetMatches: false, attestationMatches: false });
  }
  const assets = release?.assets.filter(({ name }) => name === input.assetName) ?? [];
  if (assets.length > 1) return Object.freeze({ state: "conflict", releaseId: release.id, assetId: null, assetMatches: false, attestationMatches: false });
  const assetMatches = assets.length === 1 && await readBackAssetDigest({ ...input, assetId: assets[0].id }) === input.sha256;
  const bundles = await readExactAttestationBundles({ ...input, digest: `sha256:${input.sha256}` });
  const verifiedBundles = bundles.filter((bundleBytes) => {
    try {
      TRACKED_ATTESTATION_VERIFIER.verify({
        bundleBytes,
        expected: {
          subjectName: input.assetName,
          subjectSha256: input.sha256,
          sourceCommit: input.attestationIdentity.sourceCommit,
          workflowPath: input.attestationIdentity.workflowPath,
          workflowRef: input.attestationIdentity.workflowRef,
          workflowSha: input.attestationIdentity.workflowSha,
          predicateType: input.attestationIdentity.predicateType,
          predicateBindings: input.predicateBindings
        }
      });
      return true;
    } catch {
      return false;
    }
  });
  const attestationMatches = verifiedBundles.length === 1;
  if (bundles.length !== verifiedBundles.length || verifiedBundles.length > 1) {
    return Object.freeze({ state: "conflict", releaseId: release?.id ?? null, assetId: assets[0]?.id ?? null, assetMatches, attestationMatches: false });
  }
  const conflictingAsset = assets.length === 1 && !assetMatches;
  const state = conflictingAsset ? "conflict"
    : assetMatches && attestationMatches ? "complete"
      : assetMatches ? "asset_only"
        : attestationMatches ? "attestation_only"
          : "none";
  return Object.freeze({ state, releaseId: release?.id ?? null, assetId: assets[0]?.id ?? null, assetMatches, attestationMatches });
}
```

- [ ] **Step 4: Write idempotence and partial-publication recovery tests**

```js
test("publisher creates only the missing matching half and reads both halves back", async () => {
  for (const initialState of ["none", "asset_only", "attestation_only", "complete"]) {
    const harness = mutablePublicationFixture(initialState);
    const result = await publishImmutableAssetAttestationPair({
      ...identity,
      bytes: immutableBytes,
      fetchFn: harness.fetchFn,
      attestFn: harness.attestFn
    });
    assert.equal(result.state, "complete");
    assert.equal(harness.assetCreates, initialState === "none" || initialState === "attestation_only" ? 1 : 0);
    assert.equal(harness.attestationCreates, initialState === "none" || initialState === "asset_only" ? 1 : 0);
    assert.ok(harness.readBacks >= 2);
  }
});

test("publisher never overwrites conflict", async () => {
  const harness = mutablePublicationFixture("conflict");
  await assert.rejects(() => publishImmutableAssetAttestationPair({
    ...identity,
    bytes: immutableBytes,
    fetchFn: harness.fetchFn,
    attestFn: harness.attestFn
  }), /immutable_publication_conflict/);
  assert.equal(harness.assetCreates, 0);
  assert.equal(harness.attestationCreates, 0);
});

test("tag-family attestation identity is validated before every GitHub read or write", async () => {
  for (const fault of [
    "workflowPath", "workflowRef", "workflowSha", "sourceCommit", "predicateType",
    "predicateBindings", "original_target", "attester_source", "extra_field",
    "symbol_field", "accessor", "missing_field", "wrong_prototype", "unfrozen"
  ]) {
    const harness = mutablePublicationFixture("none");
    await assert.rejects(() => inspectImmutableAssetAttestationPair({
      ...mutateImmutablePublicationIdentity(identity, fault),
      fetchFn: harness.fetchFn
    }), /immutable_publication_attestation_identity_invalid/);
    assert.equal(harness.githubReads, 0);
    assert.equal(harness.assetCreates, 0);
    assert.equal(harness.attestationCreates, 0);
  }
});

test("tag family binds its embedded source commit before every GitHub read or write", async () => {
  const harness = mutablePublicationFixture("none");
  await assert.rejects(() => inspectImmutableAssetAttestationPair({
    ...identity,
    tag: identity.tag.replace(identity.targetCommit, "f".repeat(40)),
    fetchFn: harness.fetchFn
  }), /immutable_publication_tag_family_invalid/);
  assert.equal(harness.githubReads, 0);
  assert.equal(harness.assetCreates, 0);
  assert.equal(harness.attestationCreates, 0);
});

test("Receipt recovery adapter passes one byte-equal five-field identity to inspection, publication, and attestation", async () => {
  const recovery = recoveredCloseoutPublicationFixture();
  const harness = mutablePublicationFixture("none");
  await publishImmutableAssetAttestationPair({ ...recovery, fetchFn: harness.fetchFn, attestFn: harness.attestFn });
  assert.deepEqual(harness.inspectionIdentities, [recovery.attestationIdentity, recovery.attestationIdentity]);
  assert.deepEqual(harness.attestedIdentity, recovery.attestationIdentity);
  assert.deepEqual(harness.inspectionPredicateBindings, [recovery.predicateBindings, recovery.predicateBindings]);
  assert.deepEqual(harness.attestedPredicateBindings, recovery.predicateBindings);
  assert.notEqual(recovery.targetCommit, recovery.attestationIdentity.sourceCommit);
  assert.equal(recovery.predicateBindings.originalTransactionTargetCommit, recovery.targetCommit);
  assert.equal(recovery.predicateBindings.attesterSourceCommit, recovery.attestationIdentity.sourceCommit);
});
```

- [ ] **Step 5: Implement create-missing-only publication and final readback**

```js
export async function publishImmutableAssetAttestationPair(input) {
  validateInput(input);
  if (!Buffer.isBuffer(input.bytes) || sha256Hex(input.bytes) !== input.sha256) {
    throw new Error("immutable_publication_bytes_invalid");
  }
  let inspected = await inspectImmutableAssetAttestationPair(input);
  if (inspected.state === "conflict") throw new Error("immutable_publication_conflict");
  if (inspected.releaseId === null) {
    await createExactRelease({
      ...input,
      name: input.tag,
      draft: false,
      prerelease: false
    });
    inspected = await inspectImmutableAssetAttestationPair(input);
    if (inspected.releaseId === null || inspected.state === "conflict") throw new Error("immutable_publication_release_invalid");
  }
  if (inspected.state === "none" || inspected.state === "attestation_only") {
    await uploadReleaseAsset({ ...input, releaseId: inspected.releaseId });
  }
  if (inspected.state === "none" || inspected.state === "asset_only") {
    await input.attestFn({
      subjectName: input.assetName,
      subjectDigest: { sha256: input.sha256 },
      repository: input.repository,
      targetCommit: input.targetCommit,
      attestationIdentity: input.attestationIdentity,
      predicateBindings: input.predicateBindings
    });
  }
  inspected = await inspectImmutableAssetAttestationPair(input);
  if (inspected.state !== "complete") throw new Error("immutable_publication_readback_failed");
  return Object.freeze({ state: "complete", releaseId: inspected.releaseId, assetId: inspected.assetId, sha256: input.sha256 });
}
```

- [ ] **Step 6: Add response-loss, wrong-tag-target, duplicate-asset, and wrong-subject tests**

```js
test("response loss converges by readback without duplicate creation", async () => {
  const harness = responseLostAfterAssetCreateFixture();
  const result = await publishImmutableAssetAttestationPair({
    ...identity,
    bytes: immutableBytes,
    fetchFn: harness.fetchFn,
    attestFn: harness.attestFn
  });
  assert.equal(result.state, "complete");
  assert.equal(harness.assetCreates, 1);
});

test("wrong tag target, duplicate name, or wrong attestation subject is conflict", async () => {
  for (const conflict of ["wrong_target", "duplicate_asset", "wrong_subject"]) {
    const result = await inspectImmutableAssetAttestationPair({ ...identity, fetchFn: publicationConflictFixture(conflict) });
    assert.equal(result.state, "conflict");
  }
});
```

- [ ] **Step 7: Run publisher tests and verify GREEN**

Run:

```powershell
node --check scripts/github-immutable-release-publisher.mjs
node --test server/tests/github-immutable-release-publisher.test.mjs
```

Expected: both commands exit 0; tests prove immutable exact-target publication, all five states, create-missing-only behavior, and final readback.

- [ ] **Step 8: Commit the shared publisher**

```powershell
git add -- scripts/github-immutable-release-publisher.mjs server/tests/github-immutable-release-publisher.test.mjs
git commit -m "feat: add immutable GitHub release publisher"
```

---

### Task 8: Closed publication envelope, no-secret preflight, and post-approval replay

**Files:**
- Create: `scripts/control-plane-publication-envelope.mjs`
- Create: `scripts/control-plane-production-preflight.mjs`
- Create: `scripts/control-plane-postapproval-check.mjs`
- Create: `schemas/control-plane-production-authorization-v1.schema.json`
- Create: `server/services/deployment/control-plane-production-authorization.mjs`
- Create: `server/tests/control-plane-publication-envelope.test.mjs`
- Create: `server/tests/control-plane-production-preflight.test.mjs`
- Create: `server/tests/control-plane-postapproval-check.test.mjs`
- Create: `server/tests/control-plane-production-authorization.test.mjs`

**Interfaces:**
- `createPublicationEnvelope(input)` and `verifyPublicationEnvelope({ bytes, files })` bind the fixed Release tag, target commit, exact file identities, attestation subjects, and last-published Production Gate receipt.
- `runProductionPreflight({ repository, productionGateId, token, fetchFn, now, runIdentity })` returns only `{ ready, deploymentPlanBytes, deploymentPlanSha256, preapprovalEvidenceBytes, preapprovalEvidenceSha256, productionGateReceiptBytes, transactionId, controllerRecoveryId, sourceCommit, artifactIdentity }`; the packet sink writes and readbacks the owner-canonical evidence, Gate, plan, and exact artifact bytes unchanged.
- `runPostApprovalCheck({ repository, productionGateId, deploymentPlanBytes, deploymentPlanSha256, token, fetchFn, now, runIdentity })` returns canonical `{ valid, postapprovalEvidenceBytes, postapprovalEvidenceSha256 }` without reading a secret. It re-resolves the exact inventory bytes and Release declaration, independently invokes Host/DB-owned `canonicalizeDatabaseContracts` on inventory/plan/release values, requires both bytes and SHA-256 to be equal across all three results, requires the raw plan bytes/digest and inventory bytes/digest to remain byte-equal to the preflight packet and plan bindings, and copies the authorization HMAC only from that same owner-validated inventory record. The postapproval evidence and final authorization then require that HMAC to remain exact; neither layer computes or repairs it. After the lazy scope check, `finalizeProductionAuthorization({ postapprovalEvidenceBytes, scopeAttestationBytes, nonceBytes, now })` validates the exact canonical scope bytes, returns only `{ valid, authorizationRecordBytes, authorizationRecordSha256 }`, and zeroizes the nonce.
- Both preflight modules explicitly import `createTrackedGithubAttestationVerifier`, construct their own module-private closure over Task 6's tracked trust, and pass only that closure's `verify` method to the shared Release evidence reader. Neither module imports predicate contracts or accepts a verifier/trust dependency from its caller.
- Artifact is the sole owner of the final Bootstrap-consumed authorization schema. `PRODUCTION_AUTHORIZATION_FIELDS`, `buildProductionAuthorizationRecord(input) -> { value, bytes, sha256 }`, `validateProductionAuthorizationRecord({ bytes, expected, now })`, and `deriveProductionAuthorizationOidcAudience(authorizationRecordSha256)` are the unique surface. The helper returns exactly `gccgw-control-plane-deploy:<sha256>`; Bootstrap imports this helper and the validator directly and consumes the exact bytes without a mapper or second literal implementation.
- The exact ordered authorization fields are `schema`, `gateId`, `productionGateReceiptSha256`, `deploymentPlanSha256`, `inventoryReceiptSha256`, `inventoryExpiresAt`, `productionGateExpiresAt`, `effectivePlanExpiresAt`, `transactionId`, `repository`, `eventName`, `environment`, `workflowPath`, `workflowRef`, `workflowSha`, `sourceRef`, `sourceSha`, `runId`, `runAttempt`, `runnerEnvironment`, `reviewerIdentitySha256`, `approvalHistorySha256`, `bootstrapGeneration`, `bootstrapReceiptSha256`, `bootstrapStateSha256`, `authorizationBindingHmacSha256`, `authorizationGeneration`, `databaseContractsSha256`, `hostExecutionContractSha256`, `artifactSize`, `artifactSha256`, `createdAt`, `expiresAt`, `nonceSha256`. Unknown, missing, duplicate, renamed, reordered, or compatibility-alias fields are rejected.
- Both functions derive all Release/API routes from closed identities and never accept host, path, endpoint, secret, or arbitrary URL inputs.

- [ ] **Step 1: Write a failing fixed-file publication-envelope test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicationEnvelope,
  verifyPublicationEnvelope
} from "../../scripts/control-plane-publication-envelope.mjs";

test("publication envelope binds every immutable file and Gate receipt last", () => {
  const fixture = publicationEnvelopeFixture();
  const created = createPublicationEnvelope(fixture);
  const verified = verifyPublicationEnvelope({ bytes: created.bytes, files: fixture.files });
  assert.deepEqual(verified.assetOrder, [
    "control-plane-app.zip",
    "artifact.json",
    "writer-registry.json",
    "release-declaration.json",
    "release-assembly.json",
    "dependency-build-receipt.json",
    "production-gate.json"
  ]);
  assert.equal(verified.assetOrder.at(-1), "production-gate.json");
});
```

- [ ] **Step 2: Run envelope tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-publication-envelope.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/control-plane-publication-envelope.mjs`.

- [ ] **Step 3: Implement the closed publication envelope**

```js
export const PUBLICATION_ENVELOPE_CONTRACT = Object.freeze({
  schemaId: "control-plane-publication-envelope-v1",
  maxBytes: 65_536,
  fieldOrder: Object.freeze([
    "schemaVersion", "type", "repository", "publicationMode", "tag",
    "targetCommit", "runtimeContractId", "inventoryReceiptSha256",
    "productionGateReceiptSha256", "compatibilityInventoryReceiptSha256",
    "assetOrder", "assets"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schemaVersion !== "1"
      || value.type !== "control_plane_publication_envelope"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal"
      || !Array.isArray(value.assetOrder) || !Array.isArray(value.assets)) {
      throw new Error("publication_envelope_invalid");
    }
  }
});

export const PUBLICATION_FILE_ORDER = Object.freeze([
  "control-plane-app.zip",
  "artifact.json",
  "writer-registry.json",
  "release-declaration.json",
  "release-assembly.json",
  "dependency-build-receipt.json",
  "production-gate.json"
]);

export function createPublicationEnvelope(input) {
  const entries = PUBLICATION_FILE_ORDER.map((name) => {
    const bytes = input.files.get(name);
    if (!Buffer.isBuffer(bytes)) throw new Error("publication_envelope_file_missing");
    return Object.freeze({ name, sha256: sha256Hex(bytes), size: bytes.length });
  });
  if (input.tag !== `control-plane-app-${input.targetCommit}-${input.runtimeContractId}`) {
    throw new Error("publication_envelope_tag_invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(input.inventoryReceiptSha256)
    || !/^[0-9a-f]{64}$/.test(input.productionGateReceiptSha256)
    || (input.publicationMode === "normal" && input.compatibilityInventoryReceiptSha256 !== null)
    || (input.publicationMode === "compatibility_bootstrap"
      && !/^[0-9a-f]{64}$/.test(input.compatibilityInventoryReceiptSha256))) {
    throw new Error("publication_envelope_receipt_binding_invalid");
  }
  const value = {
    schemaVersion: "1",
    type: "control_plane_publication_envelope",
    repository: "gccwebos-com/proxy-gateway-minimal",
    publicationMode: input.publicationMode,
    tag: input.tag,
    targetCommit: input.targetCommit,
    runtimeContractId: input.runtimeContractId,
    inventoryReceiptSha256: input.inventoryReceiptSha256,
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    compatibilityInventoryReceiptSha256: input.compatibilityInventoryReceiptSha256,
    assetOrder: entries.map(({ name }) => name),
    assets: entries
  };
  const bytes = serializeCanonicalJsonBytes(value, PUBLICATION_ENVELOPE_CONTRACT);
  return Object.freeze({ bytes, sha256: sha256Hex(bytes), value });
}

export function verifyPublicationEnvelope({ bytes, files }) {
  const value = parseCanonicalJsonBytes(bytes, PUBLICATION_ENVELOPE_CONTRACT);
  const rebuilt = createPublicationEnvelope({
    publicationMode: value.publicationMode,
    tag: value.tag,
    targetCommit: value.targetCommit,
    runtimeContractId: value.runtimeContractId,
    inventoryReceiptSha256: value.inventoryReceiptSha256,
    productionGateReceiptSha256: value.productionGateReceiptSha256,
    compatibilityInventoryReceiptSha256: value.compatibilityInventoryReceiptSha256,
    files
  });
  if (!rebuilt.bytes.equals(bytes)) throw new Error("publication_envelope_mismatch");
  return value;
}
```

- [ ] **Step 4: Write preflight success and fail-closed tests**

```js
import { runProductionPreflight } from "../../scripts/control-plane-production-preflight.mjs";

test("preflight resolves opaque inventory and Production Gate identities into one plan", async () => {
  const result = await runProductionPreflight(preflightContractFixture());
  assert.equal(result.ready, true);
  assert.match(result.transactionId, /^dpt1\.[0-9a-f]{64}$/);
  assert.match(result.controllerRecoveryId, /^cr1\.[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(result, "host"), false);
});

test("preflight rejects expired Gate, stale inventory, current-master drift, and compatibility mode", async () => {
  for (const fault of ["expired_gate", "stale_inventory", "master_drift", "compatibility_mode"]) {
    await assert.rejects(() => runProductionPreflight(preflightContractFixture({ fault })), /production_preflight_/);
  }
});

test("preflight S to S2 race stops read-only without following master or touching secrets", async () => {
  const sourceCommit = "a".repeat(40);
  const movedCommit = "b".repeat(40);
  const fixture = preflightContractFixture({
    runSourceCommit: sourceCommit,
    currentMasterSequence: [sourceCommit, movedCommit]
  });
  await assert.rejects(() => runProductionPreflight(fixture), /production_preflight_github_master_drift/);
  assert.deepEqual(fixture.currentMasterReads, [sourceCommit, movedCommit]);
  assert.deepEqual(fixture.checkoutOrFetchRequests, []);
  assert.deepEqual(fixture.secretMaterializerCalls, []);
  assert.deepEqual(fixture.oidcRequests, []);
  assert.deepEqual(fixture.githubWrites, []);
});
```

- [ ] **Step 5: Implement no-secret preflight composition**

```js
import { createTrackedGithubAttestationVerifier } from "../server/services/deployment/github-attestation-verifier.mjs";
import { resolveInventoryReceipt } from "../server/services/deployment/control-plane-inventory-receipt.mjs";
import { canonicalizeDatabaseContracts } from "../server/services/deployment/database-contract.mjs";
import { materializeDeploymentPlan } from "./control-plane-deployment-plan.mjs";
import { resolveProductionGateReceipt } from "./control-plane-production-gate.mjs";
import {
  collectPreapprovalEvidence,
  readCurrentMaster,
  verifyArtifactReleaseEvidence
} from "./control-plane-github-evidence.mjs";

const PREFLIGHT_ATTESTATION_VERIFIER = createTrackedGithubAttestationVerifier({
  clock: Object.freeze({ now: () => new Date() })
});

export async function runProductionPreflight(input) {
  if (input.repository !== "gccwebos-com/proxy-gateway-minimal"
    || input.runIdentity.runAttempt !== 1) {
    throw new Error("production_preflight_identity_invalid");
  }
  const initialMaster = await readCurrentMaster(input);
  if (initialMaster.sourceCommit !== input.runIdentity.sourceCommit) {
    throw new Error("production_preflight_github_master_drift");
  }
  const gate = await resolveProductionGateReceipt({
    repository: input.repository,
    productionGateId: input.productionGateId,
    token: input.token,
    fetchFn: input.fetchFn,
    now: input.now
  });
  const inventory = await resolveInventoryReceipt({
    repository: input.repository,
    inventoryGateId: gate.receipt.inventoryGateId,
    token: input.token,
    fetchFn: input.fetchFn
  });
  if (gate.receipt.sourceCommit !== initialMaster.sourceCommit
    || inventory.sha256 !== gate.receipt.inventoryReceiptSha256
    || inventory.receipt.sourceCommit !== gate.receipt.sourceCommit
    || inventory.receipt.runtimeContractId !== gate.receipt.runtimeContractId
    || Date.parse(input.now) >= Date.parse(inventory.receipt.expiresAt)) {
    throw new Error("production_preflight_inventory_invalid");
  }
  const githubEvidence = await collectPreapprovalEvidence({
    ...input,
    expectedSourceCommit: gate.receipt.sourceCommit,
    requiredCheckContracts: inventory.receipt.requiredCheckContracts,
    environment: "vultr-japan-production"
  });
  const artifactIdentity = await verifyArtifactReleaseEvidence({
    ...input,
    gateReceipt: gate.receipt,
    requiredDeploymentMode: "normal",
    requiredAttestationWorkflowPath: ".github/workflows/control-plane-artifact-gate.yml",
    verifyAttestationBundle: PREFLIGHT_ATTESTATION_VERIFIER.verify
  });
  const confirmedMaster = await readCurrentMaster(input);
  if (confirmedMaster.sourceCommit !== gate.receipt.sourceCommit
    || confirmedMaster.sourceCommit !== input.runIdentity.sourceCommit) {
    throw new Error("production_preflight_github_master_drift");
  }
  const inventoryDatabase = canonicalizeDatabaseContracts(inventory.receipt.databaseContracts);
  const releaseDatabase = canonicalizeDatabaseContracts(artifactIdentity.releaseDeclaration.databaseContracts);
  const stableBodyDatabase = canonicalizeDatabaseContracts(artifactIdentity.deploymentPlanStableBody.databaseContracts);
  if (!inventoryDatabase.bytes.equals(releaseDatabase.bytes)
    || !inventoryDatabase.bytes.equals(stableBodyDatabase.bytes)) {
    throw new Error("production_preflight_database_contract_drift");
  }
  const plan = materializeDeploymentPlan({
    gateId: input.productionGateId,
    gateReceipt: { ...gate.receipt, productionGateReceiptSha256: gate.sha256 },
    stableBody: Object.freeze({
      ...artifactIdentity.deploymentPlanStableBody,
      databaseContracts: inventoryDatabase.databaseContracts
    }),
    runContext: input.runIdentity,
    now: input.now
  });
  return Object.freeze({
    ready: true,
    deploymentPlanBytes: plan.bytes,
    deploymentPlanSha256: plan.sha256,
    preapprovalEvidenceBytes: githubEvidence.bytes,
    preapprovalEvidenceSha256: githubEvidence.sha256,
    productionGateReceiptBytes: gate.bytes,
    transactionId: plan.plan.transactionId,
    controllerRecoveryId: plan.plan.controllerRecoveryId,
    sourceCommit: plan.plan.sourceCommit,
    artifactIdentity
  });
}
```

- [ ] **Step 6: Write post-approval replay and safe-output tests**

```js
import { runPostApprovalCheck } from "../../scripts/control-plane-postapproval-check.mjs";
import { finalizeProductionAuthorization } from "../../scripts/control-plane-postapproval-check.mjs";
import { sha256Hex } from "../services/deployment/canonical-json.mjs";

test("post-approval replays run-bound policy, approval, source, database contracts, evidence, and expiry", async () => {
  const postapproval = await runPostApprovalCheck(postApprovalFixture());
  assert.deepEqual(Object.keys(postapproval).sort(), ["postapprovalEvidenceBytes", "postapprovalEvidenceSha256", "valid"]);
  const authorization = finalizeProductionAuthorization({
    postapprovalEvidenceBytes: postapproval.postapprovalEvidenceBytes,
    scopeAttestationBytes: validScopeAttestationBytes(),
    nonceBytes: Buffer.alloc(32, 7),
    now: "2026-08-08T10:31:00.000Z"
  });
  assert.deepEqual(Object.keys(authorization).sort(), ["authorizationRecordBytes", "authorizationRecordSha256", "valid"]);
  assert.equal(authorization.authorizationRecordSha256, sha256Hex(authorization.authorizationRecordBytes));
});

test("post-approval fails before secrets on rerun, self approval, drift, or expiry", async () => {
  for (const fault of [
    "run_attempt_2", "self_approval", "master_drift", "attestation_drift", "expired_plan",
    "inventory_plan_database_drift", "release_plan_database_drift", "swapped_database_ids",
    "duplicate_physical_hmac", "inventory_bytes_swap", "plan_bytes_swap", "authorization_hmac_swap",
    "same_count_user_replacement", "same_count_team_replacement", "admin_bypass_true",
    "admin_bypass_omitted", "approver_not_expected", "approval_user_id_drift",
    "team_membership_inactive", "team_membership_drift_after_resolution"
  ]) {
    await assert.rejects(() => runPostApprovalCheck(postApprovalFixture({ fault })), /postapproval_/);
  }
});
```

- [ ] **Step 6a: Write and run RED canonical-authorization boundary tests**

```js
test("authorization bytes are unique and reject unknown, duplicate, expired, or mismatched bindings", () => {
  const built = buildProductionAuthorizationRecord(validAuthorizationInput());
  assert.equal(built.sha256, sha256Hex(built.bytes));
  const validated = validateProductionAuthorizationRecord({ bytes: built.bytes, expected: validAuthorizationExpected(), now: "2026-08-08T10:32:00.000Z" });
  assert.deepEqual(validated.value, built.value);
  assert.equal(validated.sha256, built.sha256);
  for (const bytes of authorizationFaultBytes(["duplicate_key", "unknown_field", "wrong_run", "wrong_plan", "expired"])) {
    assert.throws(() => validateProductionAuthorizationRecord({ bytes, expected: validAuthorizationExpected(), now: "2026-08-08T10:32:00.000Z" }), /production_authorization_invalid/);
  }
  assert.deepEqual(Object.keys(built.value), PRODUCTION_AUTHORIZATION_FIELDS);
  assert.equal(
    deriveProductionAuthorizationOidcAudience(built.sha256),
    `gccgw-control-plane-deploy:${built.sha256}`
  );
  for (const field of PRODUCTION_AUTHORIZATION_FIELDS) {
    assert.throws(
      () => validateProductionAuthorizationRecord({
        bytes: mutateAuthorizationField(built.bytes, field),
        expected: validAuthorizationExpected(),
        now: "2026-08-08T10:32:00.000Z"
      }),
      /production_authorization_invalid/
    );
  }
});

```

Task 8 stops after the Artifact-owned schema, exact bytes, validator, and audience helper are GREEN. It does not read a Bootstrap file. Bootstrap Task 9 then owns the consumer conformance test in `server/tests/control-plane-authorization-verifier.test.mjs`: build real bytes with `buildProductionAuthorizationRecord`, pass those same bytes through `createAuthorizationVerifier`, require the returned authorization value to be byte-equal under `PRODUCTION_AUTHORIZATION_CONTRACT`, require its digest to equal the Artifact result, and prove the consumer imports `validateProductionAuthorizationRecord` plus `deriveProductionAuthorizationOidcAudience` from `control-plane-production-authorization.mjs` without a mapper or second audience literal. Task 13 re-runs that downstream test after Bootstrap Task 9 is GREEN.

Run:

```powershell
node --test server/tests/control-plane-production-authorization.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/services/deployment/control-plane-production-authorization.mjs`.

- [ ] **Step 7: Add the closed authorization schema and canonical builder**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "control-plane-production-authorization-v1",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schema": { "const": "control_plane_production_authorization_v1" },
    "gateId": { "type": "string", "pattern": "^pg1\\.[0-9a-f]{40}\\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.[0-9a-f]{64}$" },
    "productionGateReceiptSha256": { "$ref": "#/$defs/sha256" },
    "deploymentPlanSha256": { "$ref": "#/$defs/sha256" },
    "inventoryReceiptSha256": { "$ref": "#/$defs/sha256" },
    "inventoryExpiresAt": { "type": "string", "format": "date-time" },
    "productionGateExpiresAt": { "type": "string", "format": "date-time" },
    "effectivePlanExpiresAt": { "type": "string", "format": "date-time" },
    "transactionId": { "type": "string", "pattern": "^dpt1\\.[0-9a-f]{64}$" },
    "repository": { "const": "gccwebos-com/proxy-gateway-minimal" },
    "eventName": { "const": "workflow_dispatch" },
    "environment": { "const": "vultr-japan-production" },
    "workflowPath": { "const": ".github/workflows/japan-control-plane-production-deploy.yml" },
    "workflowRef": { "const": "gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-control-plane-production-deploy.yml@refs/heads/master" },
    "workflowSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "sourceRef": { "const": "refs/heads/master" },
    "sourceSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "runId": { "type": "string", "pattern": "^[1-9][0-9]{0,19}$" },
    "runAttempt": { "const": 1 },
    "runnerEnvironment": { "const": "github-hosted" },
    "reviewerIdentitySha256": { "$ref": "#/$defs/sha256" },
    "approvalHistorySha256": { "$ref": "#/$defs/sha256" },
    "bootstrapGeneration": { "type": "integer", "minimum": 1 },
    "bootstrapReceiptSha256": { "$ref": "#/$defs/sha256" },
    "bootstrapStateSha256": { "$ref": "#/$defs/sha256" },
    "authorizationBindingHmacSha256": { "$ref": "#/$defs/sha256" },
    "authorizationGeneration": { "type": "integer", "minimum": 1 },
    "databaseContractsSha256": { "$ref": "#/$defs/sha256" },
    "hostExecutionContractSha256": { "$ref": "#/$defs/sha256" },
    "artifactSize": { "type": "integer", "minimum": 1 },
    "artifactSha256": { "$ref": "#/$defs/sha256" },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time" },
    "nonceSha256": { "$ref": "#/$defs/sha256" }
  },
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
  },
  "required": [
    "schema", "gateId", "productionGateReceiptSha256", "deploymentPlanSha256",
    "inventoryReceiptSha256", "inventoryExpiresAt", "productionGateExpiresAt",
    "effectivePlanExpiresAt", "transactionId", "repository", "eventName",
    "environment", "workflowPath", "workflowRef", "workflowSha", "sourceRef",
    "sourceSha", "runId", "runAttempt", "runnerEnvironment",
    "reviewerIdentitySha256", "approvalHistorySha256", "bootstrapGeneration",
    "bootstrapReceiptSha256", "bootstrapStateSha256", "authorizationBindingHmacSha256",
    "authorizationGeneration", "databaseContractsSha256", "hostExecutionContractSha256",
    "artifactSize", "artifactSha256", "createdAt", "expiresAt", "nonceSha256"
  ]
}
```

```js
export const PRODUCTION_AUTHORIZATION_FIELDS = Object.freeze([
  "schema", "gateId", "productionGateReceiptSha256", "deploymentPlanSha256",
  "inventoryReceiptSha256", "inventoryExpiresAt", "productionGateExpiresAt",
  "effectivePlanExpiresAt", "transactionId", "repository", "eventName",
  "environment", "workflowPath", "workflowRef", "workflowSha", "sourceRef",
  "sourceSha", "runId", "runAttempt", "runnerEnvironment",
  "reviewerIdentitySha256", "approvalHistorySha256", "bootstrapGeneration",
  "bootstrapReceiptSha256", "bootstrapStateSha256", "authorizationBindingHmacSha256",
  "authorizationGeneration", "databaseContractsSha256", "hostExecutionContractSha256",
  "artifactSize", "artifactSha256", "createdAt", "expiresAt", "nonceSha256"
]);

export const PRODUCTION_AUTHORIZATION_CONTRACT = Object.freeze({
  schemaId: "control-plane-production-authorization-v1",
  maxBytes: 32_768,
  fieldOrder: PRODUCTION_AUTHORIZATION_FIELDS,
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    validateProductionAuthorizationSchema(value);
  }
});

export function buildProductionAuthorizationRecord(input) {
  const createdAt = canonicalTime(input.createdAt);
  const expiresAt = new Date(Math.min(
    Date.parse(input.inventoryExpiresAt),
    Date.parse(input.productionGateExpiresAt),
    Date.parse(input.effectivePlanExpiresAt),
    createdAt.getTime() + 300_000
  )).toISOString();
  if (Date.parse(expiresAt) <= createdAt.getTime()) throw new Error("production_authorization_invalid");
  const value = Object.freeze({
    schema: "control_plane_production_authorization_v1",
    gateId: input.gateId,
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    deploymentPlanSha256: input.deploymentPlanSha256,
    inventoryReceiptSha256: input.inventoryReceiptSha256,
    inventoryExpiresAt: input.inventoryExpiresAt,
    productionGateExpiresAt: input.productionGateExpiresAt,
    effectivePlanExpiresAt: input.effectivePlanExpiresAt,
    transactionId: input.transactionId,
    repository: "gccwebos-com/proxy-gateway-minimal",
    eventName: "workflow_dispatch",
    environment: "vultr-japan-production",
    workflowPath: ".github/workflows/japan-control-plane-production-deploy.yml",
    workflowRef: "gccwebos-com/proxy-gateway-minimal/.github/workflows/japan-control-plane-production-deploy.yml@refs/heads/master",
    workflowSha: input.workflowSha,
    sourceRef: "refs/heads/master",
    sourceSha: input.sourceSha,
    runId: String(input.runId),
    runAttempt: 1,
    runnerEnvironment: "github-hosted",
    reviewerIdentitySha256: input.reviewerIdentitySha256,
    approvalHistorySha256: input.approvalHistorySha256,
    bootstrapGeneration: input.bootstrapGeneration,
    bootstrapReceiptSha256: input.bootstrapReceiptSha256,
    bootstrapStateSha256: input.bootstrapStateSha256,
    authorizationBindingHmacSha256: input.authorizationBindingHmacSha256,
    authorizationGeneration: input.authorizationGeneration,
    databaseContractsSha256: input.databaseContractsSha256,
    hostExecutionContractSha256: input.hostExecutionContractSha256,
    artifactSize: input.artifactSize,
    artifactSha256: input.artifactSha256,
    createdAt: createdAt.toISOString(),
    expiresAt,
    nonceSha256: sha256Hex(input.nonceBytes)
  });
  validateProductionAuthorizationSchema(value);
  const bytes = serializeCanonicalJsonBytes(value, PRODUCTION_AUTHORIZATION_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function validateProductionAuthorizationRecord({ bytes, expected, now }) {
  const value = parseCanonicalJsonBytes(bytes, PRODUCTION_AUTHORIZATION_CONTRACT);
  validateProductionAuthorizationSchema(value);
  const rebuilt = serializeCanonicalJsonBytes(value, PRODUCTION_AUTHORIZATION_CONTRACT);
  if (!rebuilt.equals(bytes)
    || Object.keys(value).some((key, index) => key !== PRODUCTION_AUTHORIZATION_FIELDS[index])
    || Date.parse(now) >= Date.parse(value.expiresAt)
    || Date.parse(value.expiresAt) > Date.parse(value.createdAt) + 300_000) {
    throw new Error("production_authorization_invalid");
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!PRODUCTION_AUTHORIZATION_FIELDS.includes(key) || value[key] !== expectedValue) {
      throw new Error("production_authorization_invalid");
    }
  }
  return Object.freeze({ value, sha256: sha256Hex(bytes) });
}

export function deriveProductionAuthorizationOidcAudience(authorizationRecordSha256) {
  if (!/^[0-9a-f]{64}$/.test(authorizationRecordSha256)) {
    throw new Error("production_authorization_digest_invalid");
  }
  return `gccgw-control-plane-deploy:${authorizationRecordSha256}`;
}
```

- [ ] **Step 8: Implement postapproval replay and authorization finalization**

```js
import { canonicalizeDatabaseContracts } from "../server/services/deployment/database-contract.mjs";
import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../server/services/deployment/canonical-json.mjs";
import { createTrackedGithubAttestationVerifier } from "../server/services/deployment/github-attestation-verifier.mjs";
import { resolveInventoryReceipt } from "../server/services/deployment/control-plane-inventory-receipt.mjs";
import { buildProductionAuthorizationRecord } from "../server/services/deployment/control-plane-production-authorization.mjs";
import { validateDeploymentPlanBytes } from "./control-plane-deployment-plan.mjs";
import {
  PREAPPROVAL_EVIDENCE_CONTRACT,
  collectPostapprovalEvidence,
  readCurrentMaster,
  verifyArtifactReleaseEvidence
} from "./control-plane-github-evidence.mjs";

const POSTAPPROVAL_ATTESTATION_VERIFIER = createTrackedGithubAttestationVerifier({
  clock: Object.freeze({ now: () => new Date() })
});
import { validateReservedAuthorizationScopeAttestation } from "./control-plane-github-scope-attestor.mjs";

export const POSTAPPROVAL_EVIDENCE_CONTRACT = Object.freeze({
  schemaId: "control-plane-postapproval-evidence-v1",
  maxBytes: 32_768,
  fieldOrder: Object.freeze([
    "schema", "gateId", "productionGateReceiptSha256", "deploymentPlanSha256",
    "inventoryReceiptSha256", "inventoryExpiresAt", "productionGateExpiresAt",
    "effectivePlanExpiresAt", "transactionId", "sourceCommit", "workflowSha",
    "runId", "approverIdentitySha256", "approvalHistorySha256",
    "environmentPolicySha256", "requiredCheckContractsSha256",
    "bootstrapGeneration", "bootstrapReceiptSha256", "bootstrapStateSha256",
    "authorizationBindingHmacSha256", "authorizationGeneration",
    "databaseContractsSha256", "hostExecutionContractSha256", "artifactSize",
    "artifactSha256", "releaseDeclarationSha256", "observedAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_postapproval_evidence_v1"
      || !/^[0-9a-f]{64}$/.test(value.deploymentPlanSha256)
      || !/^[0-9a-f]{64}$/.test(value.databaseContractsSha256)) {
      throw new Error("postapproval_evidence_invalid");
    }
  }
});

function createPostapprovalEvidence({
  plan,
  inventory,
  evidence,
  deploymentPlanSha256,
  databaseContractsSha256,
  releaseDeclarationSha256,
  runIdentity,
  observedAt
}) {
  const value = Object.freeze({
    schema: "control_plane_postapproval_evidence_v1",
    gateId: plan.gateId,
    productionGateReceiptSha256: plan.productionGateReceiptSha256,
    deploymentPlanSha256,
    inventoryReceiptSha256: inventory.sha256,
    inventoryExpiresAt: inventory.receipt.expiresAt,
    productionGateExpiresAt: plan.productionGateExpiresAt,
    effectivePlanExpiresAt: plan.expiresAt,
    transactionId: plan.transactionId,
    sourceCommit: plan.sourceCommit,
    workflowSha: runIdentity.workflowSha,
    runId: String(runIdentity.runId),
    approverIdentitySha256: evidence.reviewerIdentitySha256,
    approvalHistorySha256: evidence.approvalHistorySha256,
    environmentPolicySha256: evidence.environmentPolicySha256,
    requiredCheckContractsSha256: evidence.requiredCheckContractsSha256,
    bootstrapGeneration: inventory.receipt.bootstrapGeneration,
    bootstrapReceiptSha256: inventory.receipt.bootstrapReceiptSha256,
    bootstrapStateSha256: inventory.receipt.bootstrapStateSha256,
    authorizationBindingHmacSha256: inventory.receipt.authorizationBindingHmacSha256,
    authorizationGeneration: inventory.receipt.authorizationGeneration,
    databaseContractsSha256,
    hostExecutionContractSha256: plan.hostExecution.contractSha256,
    artifactSize: plan.artifact.sizeBytes,
    artifactSha256: plan.artifact.sha256,
    releaseDeclarationSha256,
    observedAt
  });
  const bytes = serializeCanonicalJsonBytes(value, POSTAPPROVAL_EVIDENCE_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export async function runPostApprovalCheck(input) {
  if (input.runIdentity.runAttempt !== 1) throw new Error("postapproval_run_attempt_invalid");
  const validated = validateDeploymentPlanBytes({
    bytes: input.deploymentPlanBytes,
    now: input.now,
    runContext: input.runIdentity
  });
  const plan = validated.plan;
  if (!Buffer.isBuffer(input.preapprovalEvidenceBytes)
    || sha256Hex(input.preapprovalEvidenceBytes) !== input.preapprovalEvidenceSha256) {
    throw new Error("postapproval_preapproval_evidence_invalid");
  }
  const preapprovalEvidence = parseCanonicalJsonBytes(
    input.preapprovalEvidenceBytes,
    PREAPPROVAL_EVIDENCE_CONTRACT
  );
  if (preapprovalEvidence.sourceCommit !== plan.sourceCommit) {
    throw new Error("postapproval_preapproval_evidence_invalid");
  }
  if (!Buffer.isBuffer(input.deploymentPlanBytes)
    || validated.sha256 !== input.deploymentPlanSha256
    || sha256Hex(input.deploymentPlanBytes) !== input.deploymentPlanSha256) {
    throw new Error("postapproval_plan_digest_invalid");
  }
  const inventory = await resolveInventoryReceipt({
    repository: input.repository,
    inventoryGateId: plan.inventoryGateId,
    token: input.token,
    fetchFn: input.fetchFn
  });
  if (!Buffer.isBuffer(inventory.bytes)
    || sha256Hex(inventory.bytes) !== inventory.sha256
    || inventory.sha256 !== plan.inventoryReceiptSha256
    || inventory.receipt.sourceCommit !== plan.sourceCommit
    || !/^[0-9a-f]{64}$/.test(inventory.receipt.authorizationBindingHmacSha256)
    || Date.parse(input.now) >= Date.parse(inventory.receipt.expiresAt)) {
    throw new Error("postapproval_inventory_invalid");
  }
  const evidence = await collectPostapprovalEvidence({
    ...input,
    expectedSourceCommit: plan.sourceCommit,
    requiredCheckContracts: inventory.receipt.requiredCheckContracts,
    expectedEnvironmentPolicySha256: preapprovalEvidence.environmentPolicySha256,
    environment: "vultr-japan-production",
    runAttempt: 1
  });
  const releaseEvidence = await verifyArtifactReleaseEvidence({
    ...input,
    sourceCommit: plan.sourceCommit,
    artifactSha256: plan.artifact.sha256,
    releaseDeclarationSha256: plan.releaseDeclarationSha256,
    requiredDeploymentMode: "normal",
    requiredAttestationWorkflowPath: ".github/workflows/control-plane-artifact-gate.yml",
    verifyAttestationBundle: POSTAPPROVAL_ATTESTATION_VERIFIER.verify
  });
  const confirmedMaster = await readCurrentMaster(input);
  if (confirmedMaster.sourceCommit !== plan.sourceCommit) {
    throw new Error("postapproval_github_master_drift");
  }
  const deploymentPlanSha256 = validated.sha256;
  if (evidence.requiredCheckContractsSha256 !== preapprovalEvidence.requiredCheckContractsSha256) {
    throw new Error("postapproval_preapproval_evidence_drift");
  }
  const inventoryDatabase = canonicalizeDatabaseContracts(inventory.receipt.databaseContracts);
  const planDatabase = canonicalizeDatabaseContracts(plan.databaseContracts);
  const releaseDatabase = canonicalizeDatabaseContracts(releaseEvidence.declaration.databaseContracts);
  if (!inventoryDatabase.bytes.equals(planDatabase.bytes)
    || !inventoryDatabase.bytes.equals(releaseDatabase.bytes)
    || inventoryDatabase.sha256 !== planDatabase.sha256
    || inventoryDatabase.sha256 !== releaseDatabase.sha256) {
    throw new Error("postapproval_database_contract_drift");
  }
  const databaseContractsSha256 = inventoryDatabase.sha256;
  const postapprovalEvidence = createPostapprovalEvidence({
    plan,
    inventory,
    evidence,
    deploymentPlanSha256,
    databaseContractsSha256,
    releaseDeclarationSha256: releaseEvidence.declarationSha256,
    runIdentity: input.runIdentity,
    observedAt: input.now
  });
  if (postapprovalEvidence.value.inventoryReceiptSha256 !== inventory.sha256
    || postapprovalEvidence.value.deploymentPlanSha256 !== deploymentPlanSha256
    || postapprovalEvidence.value.authorizationBindingHmacSha256 !== inventory.receipt.authorizationBindingHmacSha256) {
    throw new Error("postapproval_authorization_binding_drift");
  }
  return Object.freeze({
    valid: true,
    postapprovalEvidenceBytes: postapprovalEvidence.bytes,
    postapprovalEvidenceSha256: postapprovalEvidence.sha256
  });
}

export function finalizeProductionAuthorization({ postapprovalEvidenceBytes, scopeAttestationBytes, nonceBytes, now }) {
  const evidence = parseCanonicalJsonBytes(postapprovalEvidenceBytes, POSTAPPROVAL_EVIDENCE_CONTRACT);
  validateReservedAuthorizationScopeAttestation({
    bytes: scopeAttestationBytes,
    expected: Object.freeze({
      repository: "gccwebos-com/proxy-gateway-minimal",
      environment: "vultr-japan-production",
      valid: true
    })
  });
  if (!Buffer.isBuffer(nonceBytes) || nonceBytes.length !== 32) {
    throw new Error("production_authorization_nonce_invalid");
  }
  try {
    const authorization = buildProductionAuthorizationRecord({
      gateId: evidence.gateId,
      productionGateReceiptSha256: evidence.productionGateReceiptSha256,
      deploymentPlanSha256: evidence.deploymentPlanSha256,
      inventoryReceiptSha256: evidence.inventoryReceiptSha256,
      inventoryExpiresAt: evidence.inventoryExpiresAt,
      productionGateExpiresAt: evidence.productionGateExpiresAt,
      effectivePlanExpiresAt: evidence.effectivePlanExpiresAt,
      transactionId: evidence.transactionId,
      workflowSha: evidence.workflowSha,
      sourceSha: evidence.sourceCommit,
      runId: evidence.runId,
      reviewerIdentitySha256: evidence.approverIdentitySha256,
      approvalHistorySha256: evidence.approvalHistorySha256,
      bootstrapGeneration: evidence.bootstrapGeneration,
      bootstrapReceiptSha256: evidence.bootstrapReceiptSha256,
      bootstrapStateSha256: evidence.bootstrapStateSha256,
      authorizationBindingHmacSha256: evidence.authorizationBindingHmacSha256,
      authorizationGeneration: evidence.authorizationGeneration,
      databaseContractsSha256: evidence.databaseContractsSha256,
      hostExecutionContractSha256: evidence.hostExecutionContractSha256,
      artifactSize: evidence.artifactSize,
      artifactSha256: evidence.artifactSha256,
      nonceBytes,
      createdAt: now
    });
    return Object.freeze({
      valid: true,
      authorizationRecordBytes: authorization.bytes,
      authorizationRecordSha256: authorization.sha256
    });
  } finally {
    nonceBytes.fill(0);
  }
}
```

- [ ] **Step 9: Run composition tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-publication-envelope.mjs
node --check scripts/control-plane-production-preflight.mjs
node --check scripts/control-plane-postapproval-check.mjs
node --check server/services/deployment/control-plane-production-authorization.mjs
node --test server/tests/control-plane-publication-envelope.test.mjs server/tests/control-plane-production-preflight.test.mjs server/tests/control-plane-postapproval-check.test.mjs server/tests/control-plane-production-authorization.test.mjs
```

Expected: all commands exit 0; preflight and post-approval are secretless, bind the same immutable plan, inventory/plan/release database bytes, complete bootstrap state, artifact size/digest, one-time nonce, and reject drift or expiry. This checkpoint proves the provider bytes, validator, and audience helper only; Bootstrap Task 9 owns the downstream no-mapper exact-byte conformance test, which Task 13 later re-runs.

- [ ] **Step 10: Commit publication and replay composition**

```powershell
git add -- scripts/control-plane-publication-envelope.mjs scripts/control-plane-production-preflight.mjs scripts/control-plane-postapproval-check.mjs schemas/control-plane-production-authorization-v1.schema.json server/services/deployment/control-plane-production-authorization.mjs server/tests/control-plane-publication-envelope.test.mjs server/tests/control-plane-production-preflight.test.mjs server/tests/control-plane-postapproval-check.test.mjs server/tests/control-plane-production-authorization.test.mjs
git commit -m "feat: compose control plane publication gates"
```

---

### Task 9: Manual normal Artifact Gate workflow

Dependency checkpoint: begin Tasks 9–10 only after Artifact Task 8, Bootstrap Tasks 9–10, and Receipt Task 4 are GREEN; Task 8 is the upstream authorization provider, never a consumer of downstream Bootstrap source.

**Files:**
- Create: `.github/workflows/control-plane-artifact-gate.yml`
- Create: `schemas/control-plane-artifact-publication-authorization-v1.schema.json`
- Create: `server/services/deployment/control-plane-artifact-publication-authorization.mjs`
- Create: `server/tests/control-plane-artifact-gate-workflow.test.mjs`
- Create: `server/tests/control-plane-artifact-publication-authorization.test.mjs`
- Modify: `scripts/control-plane-artifact-assembly.mjs`
- Modify: `scripts/control-plane-publication-envelope.mjs`
- Modify: `scripts/control-plane-postapproval-check.mjs`
- Modify: `server/tests/control-plane-postapproval-check.test.mjs`

**Workflow CLI interfaces:**
- `source-prepare` is the only builder-side job with `contents: read`. From a pinned checkout of the immutable workflow-dispatch SHA it executes only fixed workflow-owned Git/hash/size/printf commands and emits one canonical `source-transfer.json`, one exact `git archive` tar, and one sorted Git-tree manifest. It does not run setup-node, npm, a repository script, an archive member, or any candidate byte, and it exposes no `GITHUB_TOKEN` environment value. The manifest/source-transfer pair binds source commit, archive SHA-256/size, every tracked path/mode/blob SHA, inventory kind, and the canonical-null-or-exact compatibility content receipt. It emits no generated executable or caller-supplied checksum program.
- After the tokenless fixed pre-extraction verifier proves the archive/tree, `node scripts/control-plane-artifact-builder.mjs fetch --source <directory> --cache <directory> --custody-output <directory> --builder-contract-file <tracked-file>` runs with no token and downloads only the builder-contract-pinned data archives. `node scripts/control-plane-artifact-assembly.mjs verify --source-input <directory> --builder-output <directory> --trusted-checkout <directory> --expected-source-commit <40hex> --output <directory>` then runs from a fresh exact-SHA read-only checkout, independently verifies source transfer, custody receipts, archive/tree, and opaque output, and emits the only verified publication artifact.
- The tokenless builder has `permissions: {}`, performs no checkout/setup-node, receives no `GITHUB_TOKEN`, and first runs a fixed inline archive/tree verifier from workflow bytes. Only after digest, size, entry, path, mode, and exact Git-tree equality pass does it extract into a new sandbox and execute the archived candidate builder. The fetched cache is data-only, and the build phase runs with network disabled plus the complete Foundation header/toolchain custody.
- Publisher has no repository CLI. Pinned `actions/download-artifact`, `actions/github-script`, and `actions/attest` are its only executable steps. The inline `actions/github-script` body is a fixed reviewed bounded publisher control: it parses only exact canonical verified-publication files, recursively rejects unknown fields, re-hashes every opaque asset itself, re-reads exact source and Environment approval/policy evidence, binds the already verified exhaustive check-contract digest inside the inventory/envelope, constructs approval evidence A and authorization B, validates `expected.predicateBindings`, and performs one exact create-missing-only Release asset/attestation pair at a time with Production Gate last. It cannot extract an archive, import from the artifact/workspace, spawn a child, evaluate a string, execute candidate bytes, choose an action dynamically, or enumerate an asset with a shell loop/glob.
- The fixed publisher control re-reads exact run/attempt, the complete current Task 6 policy bytes (`preventSelfReview`, protected/custom branch bits, explicit admin-bypass bit, and sorted stable reviewer identities), current approval history, current user/team membership resolution, exact source SHA, the complete publication envelope, inventory receipt, and Gate receipt before the first GitHub write. It requires exactly one currently authorized approver distinct from both actor identities. The verified-publication inventory bytes must be byte-equal to the bytes whose digest is bound by the envelope and rebuilt Gate; the plan/inventory owner-canonical database bytes and the inventory-owned authorization HMAC must remain byte-identical through approval evidence and authorization, never reconstructed or recomputed. To avoid a digest cycle, it creates approval-evidence bytes A, rebuilds Gate and envelope locally, then creates authorization B binding `sha256(A)`, `publicationEnvelopeSha256`, `inventoryReceiptSha256`, `productionGateReceiptSha256`, and canonical-null-or-exact `compatibilityInventoryReceiptSha256`. The trusted verify job produces owner-canonical predicate bytes and the publisher re-hashes those opaque bytes against the bound envelope; every generic Release inspection uses Task 6's tracked verifier with the exact `expected.predicateBindings`. Only the validated opaque authorized directory reaches Release/attestation operations.
- `scripts/control-plane-artifact-assembly.mjs` explicitly imports `canonicalizeApprovalHistory` from the evidence owner and `validateExactPublicationPredicateBindings` from the attestation owner. It never names their private contracts, selects trust, or implements a predicate serializer. The workflow's fixed publisher body consumes only the canonical bytes and digests produced by those source-side owner APIs and does not contain a copied contract or trust table.
- `server/services/deployment/control-plane-artifact-publication-authorization.mjs` owns `ARTIFACT_PUBLICATION_APPROVAL_EVIDENCE_CONTRACT`, `ARTIFACT_PUBLICATION_AUTHORIZATION_CONTRACT`, `buildArtifactPublicationApprovalEvidence(input)`, `buildArtifactPublicationAuthorization(input)`, and `validateArtifactPublicationAuthorization({ bytes, approvalEvidenceBytes, envelopeBytes, files, expected, now }) -> { value, sha256, envelope }`.
- All three operations print one canonical aggregate JSON object containing only safe identities and digests.

The normal and compatibility workflows both commit this exact non-dynamic pair table. `publish_non_gate` contains six literal pair calls in rows 1–6 and `publish_gate_last` contains only row 7; neither operation iterates caller data. Each matching pinned `actions/attest` step appears once in source and receives the one exact regular file below. Its condition is the corresponding fixed output, so a partial rerun repairs only `none`, `asset_only`, or `attestation_only` for that one pair and never creates a second matching half.

| Order | Release pair | Fixed output | Exact `subject-path` suffix | Predicate |
| --- | --- | --- | --- | --- |
| 1 | `control-plane-app.zip` | `attest_control_plane_app` | `non-gate/control-plane-app.zip` | `predicates/non-gate.json` |
| 2 | `artifact.json` | `attest_artifact` | `non-gate/artifact.json` | `predicates/non-gate.json` |
| 3 | `writer-registry.json` | `attest_writer_registry` | `non-gate/writer-registry.json` | `predicates/non-gate.json` |
| 4 | `release-declaration.json` | `attest_release_declaration` | `non-gate/release-declaration.json` | `predicates/non-gate.json` |
| 5 | `release-assembly.json` | `attest_release_assembly` | `non-gate/release-assembly.json` | `predicates/non-gate.json` |
| 6 | `dependency-build-receipt.json` | `attest_dependency_build_receipt` | `non-gate/dependency-build-receipt.json` | `predicates/non-gate.json` |
| 7 (last) | `production-gate.json` | `attest_production_gate` | `gate/production-gate.json` | `predicates/gate.json` |

- [ ] **Step 1: Write the failing manual-trigger and job-isolation test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../../.github/workflows/control-plane-artifact-gate.yml", import.meta.url);

function shellRunBlocks(workflow) {
  const lines = workflow.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*\|\s*$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    while (++index < lines.length && (lines[index].trim() === "" || lines[index].search(/\S/) > indent)) body.push(lines[index]);
    blocks.push(body.join("\n"));
    index -= 1;
  }
  return blocks;
}

function jobBlock(workflow, jobId) {
  const start = workflow.indexOf(`  ${jobId}:\n`);
  if (start < 0) throw new Error(`missing job ${jobId}`);
  const tail = workflow.slice(start + 2);
  const next = tail.search(/^  [a-z0-9-]+:\n/m);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 2 + next);
}

test("normal Artifact Gate is manual-only with two exact inputs", async () => {
  const workflow = await readFile(path, "utf8");
  assert.match(workflow, /^name: Control Plane Artifact Gate$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      inventory_gate_id:/m);
  assert.match(workflow, /      confirmation:\n/);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|schedule|workflow_call|repository_dispatch):/m);
  assert.equal((workflow.match(/^      [a-z_]+:\n        description:/gm) ?? []).length, 2);
});

test("verify and protected publisher use exact trusted checkouts and never execute artifact code", async () => {
  const workflow = await readFile(path, "utf8");
  const publisher = jobBlock(workflow, "publish");
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(jobBlock(workflow, "source-prepare"), /permissions:\n      contents: read/);
  assert.match(jobBlock(workflow, "source-prepare"), /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(jobBlock(workflow, "source-prepare"), /ref: refs\/heads\/master/);
  assert.match(jobBlock(workflow, "tokenless-builder"), /permissions: \{\}/);
  assert.doesNotMatch(jobBlock(workflow, "tokenless-builder"), /actions\/checkout|actions\/setup-node|GITHUB_TOKEN|github\.token/);
  assert.match(jobBlock(workflow, "tokenless-builder"), /Verify source archive and Git tree before extraction/);
  assert.match(publisher, /environment: artifact-publication/);
  assert.match(publisher, /contents: write/);
  assert.match(publisher, /attestations: write/);
  assert.match(publisher, /id-token: write/);
  assert.doesNotMatch(publisher, /actions\/checkout|actions\/setup-node|git\s|node scripts\/|npm (?:ci|install)|unzip|tar\s|require\([^)]*(?:verified-publication|workspace|scripts)|import\([^)]*(?:verified-publication|workspace|scripts)|child_process|eval\(/);
  assert.match(publisher, /actions\/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea/);
  assert.match(publisher, /Re-hash opaque publication and recheck approval/);
  assert.match(jobBlock(workflow, "verify"), /actions\/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10/);
  assert.equal((workflow.match(/contents: write/g) ?? []).length, 1);
});

test("dispatch inputs are mapped through env and never interpolated in run scripts", async () => {
  const workflow = await readFile(path, "utf8");
  for (const run of shellRunBlocks(workflow)) assert.doesNotMatch(run, /\$\{\{\s*inputs\./);
});

test("source-input and verified-publication artifacts contain data only", async () => {
  for (const names of [normalSourceInputFileNames(), verifiedPublicationFileNames()]) {
    for (const name of names) {
      assert.doesNotMatch(name, /(?:^|\/)(?:scripts?|control)(?:\/|$)|\.(?:mjs|js|cjs|sh|ps1|exe|dll|so)$/);
    }
  }
});

test("assembly crosses evidence and attestation boundaries through owner APIs", async () => {
  const source = await readFile(
    new URL("../../scripts/control-plane-artifact-assembly.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /canonicalizeApprovalHistory/);
  assert.match(source, /validateExactPublicationPredicateBindings/);
  const evidenceOwner = await import("../../scripts/control-plane-github-evidence.mjs");
  assert.equal(typeof evidenceOwner.canonicalizeApprovalHistory, "function");
});
```

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs
```

Expected: FAIL with `ENOENT` for `.github/workflows/control-plane-artifact-gate.yml`.

- [ ] **Step 3: Add the assembly dispatcher and pure fixed-publisher reference validator**

```js
import {
  canonicalizeApprovalHistory,
  readCurrentMaster,
  readEnvironmentPolicy,
  resolveExpectedReviewerApproval,
  readWorkflowApprovalHistory
} from "./control-plane-github-evidence.mjs";
import { validateExactPublicationPredicateBindings } from "../server/services/deployment/github-attestation-verifier.mjs";

export async function runArtifactAssemblyCli({ argv, env, stdout, operations }) {
  const [operation, ...tokens] = argv;
  if (operation !== "verify") throw new Error("artifact_assembly_operation_invalid");
  const flags = parseClosedFlags(tokens, [
    "source-input", "builder-output", "trusted-checkout", "expected-source-commit", "output"
  ]);
  const result = await operations.verify(flags);
  stdout.write(`${serializeCanonicalJsonBytes(result, SAFE_CLI_RESULT_CONTRACT).toString("utf8")}\n`);
}

export function validateFixedPublisherInput({ verifiedPublication, expected }) {
  const envelope = verifyPublicationEnvelope({
    bytes: verifiedPublication.envelopeBytes,
    files: verifiedPublication.files
  });
  const approval = validateArtifactPublicationAuthorization({
    bytes: verifiedPublication.authorizationBytes,
    approvalEvidenceBytes: verifiedPublication.approvalEvidenceBytes,
    envelopeBytes: verifiedPublication.envelopeBytes,
    files: verifiedPublication.files,
    expected,
    now: expected.now
  });
  const predicate = validateExactPublicationPredicateBindings({
    predicateType: "https://gccwebos.com/attestations/control-plane-publication/v1",
    predicateBindings: Object.freeze({
      schema: "control_plane_publication_attestation_v1",
      repository: approval.value.repository,
      sourceSha: approval.value.sourceSha,
      workflowPath: expected.workflowPath,
      workflowRef: expected.workflowRef,
      workflowSha: approval.value.sourceSha,
      publicationMode: approval.value.publicationMode,
      artifactPublicationApprovalSha256: approval.value.approvalEvidenceSha256,
      publicationAuthorizationSha256: approval.sha256,
      publicationEnvelopeSha256: approval.value.publicationEnvelopeSha256,
      inventoryReceiptSha256: approval.value.inventoryReceiptSha256,
      productionGateReceiptSha256: approval.value.productionGateReceiptSha256,
      compatibilityInventoryReceiptSha256: approval.value.compatibilityInventoryReceiptSha256
    })
  });
  if (!predicate.bytes.equals(verifiedPublication.predicateBytes)) {
    throw new Error("artifact_publication_predicate_invalid");
  }
  return Object.freeze({ envelope, approval, predicate });
}

export async function runArtifactPublicationApprovalCheck(input) {
  if (input.environment !== "artifact-publication" || input.runIdentity.runAttempt !== 1) {
    throw new Error("artifact_publication_approval_identity_invalid");
  }
  const [master, policy, approvals] = await Promise.all([
    readCurrentMaster(input),
    readEnvironmentPolicy(input),
    readWorkflowApprovalHistory(input)
  ]);
  const approvalHistory = canonicalizeApprovalHistory(approvals);
  const approvers = approvalHistory.value.approvals.filter((row) => row.environments.length === 1
    && row.environments[0] === "artifact-publication")
    .map(({ login, id }) => Object.freeze({ login, id }));
  if (master.sourceCommit !== input.sourceCommit
    || policy.value.preventSelfReview !== true
    || policy.value.protectedBranches !== true
    || policy.value.customBranchPolicies !== false
    || policy.value.adminBypassAllowed !== false
    || policy.value.reviewers.length < 1
    || approvers.length !== 1
    || approvers[0].login === input.runIdentity.actor.toLowerCase()
    || approvers[0].login === input.runIdentity.triggeringActor.toLowerCase()) {
    throw new Error("artifact_publication_approval_invalid");
  }
  const resolvedReviewer = await resolveExpectedReviewerApproval({
    ...input,
    policy: policy.value,
    approver: approvers[0].login,
    approverId: approvers[0].id
  });
  const [confirmedPolicy, confirmedMaster] = await Promise.all([
    readEnvironmentPolicy(input),
    readCurrentMaster(input)
  ]);
  if (!confirmedPolicy.bytes.equals(policy.bytes)
    || confirmedMaster.sourceCommit !== input.sourceCommit) {
    throw new Error("artifact_publication_approval_policy_drift");
  }
  const confirmedReviewer = await resolveExpectedReviewerApproval({
    ...input,
    policy: confirmedPolicy.value,
    approver: approvers[0].login,
    approverId: approvers[0].id
  });
  if (confirmedReviewer.identitySha256 !== resolvedReviewer.identitySha256) {
    throw new Error("artifact_publication_approval_policy_drift");
  }
  const approvalEvidence = buildArtifactPublicationApprovalEvidence({
    sourceSha: input.sourceCommit,
    runId: String(input.runIdentity.runId),
    actorIdentitySha256: sha256Hex(Buffer.from(input.runIdentity.actor, "utf8")),
    triggeringActorIdentitySha256: sha256Hex(Buffer.from(input.runIdentity.triggeringActor, "utf8")),
    environmentPolicySha256: confirmedPolicy.sha256,
    approvalHistorySha256: approvalHistory.sha256,
    reviewerIdentitySha256: confirmedReviewer.identitySha256,
    createdAt: input.now
  });
  const finalized = input.operations.finalizeVerifiedPublicationLocally({
    inputDirectory: input.inputDirectory,
    approvalEvidenceBytes: approvalEvidence.bytes,
    artifactPublicationApprovalSha256: approvalEvidence.sha256
  });
  const authorization = buildArtifactPublicationAuthorization({
    approvalEvidenceSha256: approvalEvidence.sha256,
    publicationEnvelopeSha256: finalized.envelopeSha256,
    inventoryReceiptSha256: finalized.inventoryReceiptSha256,
    productionGateReceiptSha256: finalized.productionGateReceiptSha256,
    compatibilityInventoryReceiptSha256: finalized.compatibilityInventoryReceiptSha256,
    publicationMode: finalized.publicationMode,
    sourceSha: input.sourceCommit,
    runId: String(input.runIdentity.runId),
    runAttempt: 1,
    createdAt: input.now,
    expiresAt: finalized.expiresAt
  });
  validateArtifactPublicationAuthorization({
    bytes: authorization.bytes,
    approvalEvidenceBytes: approvalEvidence.bytes,
    envelopeBytes: finalized.envelopeBytes,
    files: finalized.files,
    expected: Object.freeze({
      repository: input.repository,
      runId: String(input.runIdentity.runId),
      runAttempt: 1,
      sourceSha: input.sourceCommit
    }),
    now: input.now
  });
  input.operations.writeAuthorizedPublicationLocally({ finalized, approvalEvidence, authorization });
  return Object.freeze({
    approvalEvidenceSha256: approvalEvidence.sha256,
    publicationAuthorizationSha256: authorization.sha256,
    publicationEnvelopeSha256: finalized.envelopeSha256,
    outputDirectory: input.outputDirectory
  });
}
```

- [ ] **Step 3a: Add the two-stage publication authorization schema and validator**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "control-plane-artifact-publication-authorization-v1",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "schema": { "const": "control_plane_artifact_publication_authorization_v1" },
    "approvalEvidenceSha256": { "$ref": "#/$defs/sha256" },
    "publicationEnvelopeSha256": { "$ref": "#/$defs/sha256" },
    "inventoryReceiptSha256": { "$ref": "#/$defs/sha256" },
    "productionGateReceiptSha256": { "$ref": "#/$defs/sha256" },
    "compatibilityInventoryReceiptSha256": {
      "oneOf": [{ "type": "null" }, { "$ref": "#/$defs/sha256" }]
    },
    "publicationMode": { "enum": ["normal", "compatibility_bootstrap"] },
    "repository": { "const": "gccwebos-com/proxy-gateway-minimal" },
    "sourceSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "runId": { "type": "string", "pattern": "^[1-9][0-9]{0,19}$" },
    "runAttempt": { "const": 1 },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time" }
  },
  "$defs": { "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" } },
  "required": [
    "schema", "approvalEvidenceSha256", "publicationEnvelopeSha256",
    "inventoryReceiptSha256", "productionGateReceiptSha256",
    "compatibilityInventoryReceiptSha256", "publicationMode", "repository",
    "sourceSha", "runId", "runAttempt", "createdAt", "expiresAt"
  ]
}
```

```js
export const ARTIFACT_PUBLICATION_APPROVAL_EVIDENCE_CONTRACT = Object.freeze({
  schemaId: "control-plane-artifact-publication-approval-evidence-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "schema", "repository", "environment", "sourceSha", "runId", "runAttempt",
    "actorIdentitySha256", "triggeringActorIdentitySha256", "reviewerIdentitySha256",
    "environmentPolicySha256", "approvalHistorySha256", "createdAt", "expiresAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_artifact_publication_approval_evidence_v1"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal"
      || value.environment !== "artifact-publication") {
      throw new Error("artifact_publication_approval_evidence_invalid");
    }
  }
});

export function buildArtifactPublicationApprovalEvidence(input) {
  const expiresAt = new Date(Date.parse(input.createdAt) + 300_000).toISOString();
  const value = Object.freeze({
    schema: "control_plane_artifact_publication_approval_evidence_v1",
    repository: "gccwebos-com/proxy-gateway-minimal",
    environment: "artifact-publication",
    sourceSha: input.sourceSha,
    runId: String(input.runId),
    runAttempt: 1,
    actorIdentitySha256: input.actorIdentitySha256,
    triggeringActorIdentitySha256: input.triggeringActorIdentitySha256,
    reviewerIdentitySha256: input.reviewerIdentitySha256,
    environmentPolicySha256: input.environmentPolicySha256,
    approvalHistorySha256: input.approvalHistorySha256,
    createdAt: input.createdAt,
    expiresAt
  });
  const bytes = serializeCanonicalJsonBytes(value, ARTIFACT_PUBLICATION_APPROVAL_EVIDENCE_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export const ARTIFACT_PUBLICATION_AUTHORIZATION_CONTRACT = Object.freeze({
  schemaId: "control-plane-artifact-publication-authorization-v1",
  maxBytes: 16_384,
  fieldOrder: Object.freeze([
    "schema", "approvalEvidenceSha256", "publicationEnvelopeSha256",
    "inventoryReceiptSha256", "productionGateReceiptSha256",
    "compatibilityInventoryReceiptSha256", "publicationMode", "repository",
    "sourceSha", "runId", "runAttempt", "createdAt", "expiresAt"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (value.schema !== "control_plane_artifact_publication_authorization_v1"
      || value.repository !== "gccwebos-com/proxy-gateway-minimal"
      || !["normal", "compatibility_bootstrap"].includes(value.publicationMode)) {
      throw new Error("artifact_publication_authorization_invalid");
    }
  }
});

export function buildArtifactPublicationAuthorization(input) {
  const value = Object.freeze({
    schema: "control_plane_artifact_publication_authorization_v1",
    approvalEvidenceSha256: input.approvalEvidenceSha256,
    publicationEnvelopeSha256: input.publicationEnvelopeSha256,
    inventoryReceiptSha256: input.inventoryReceiptSha256,
    productionGateReceiptSha256: input.productionGateReceiptSha256,
    compatibilityInventoryReceiptSha256: input.compatibilityInventoryReceiptSha256,
    publicationMode: input.publicationMode,
    repository: "gccwebos-com/proxy-gateway-minimal",
    sourceSha: input.sourceSha,
    runId: String(input.runId),
    runAttempt: 1,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt
  });
  const bytes = serializeCanonicalJsonBytes(value, ARTIFACT_PUBLICATION_AUTHORIZATION_CONTRACT);
  return Object.freeze({ value, bytes, sha256: sha256Hex(bytes) });
}

export function validateArtifactPublicationAuthorization({
  bytes,
  approvalEvidenceBytes,
  envelopeBytes,
  files,
  expected,
  now
}) {
  const value = parseCanonicalJsonBytes(bytes, ARTIFACT_PUBLICATION_AUTHORIZATION_CONTRACT);
  const approvalEvidence = parseCanonicalJsonBytes(
    approvalEvidenceBytes,
    ARTIFACT_PUBLICATION_APPROVAL_EVIDENCE_CONTRACT
  );
  const envelope = verifyPublicationEnvelope({ bytes: envelopeBytes, files });
  if (sha256Hex(approvalEvidenceBytes) !== value.approvalEvidenceSha256
    || sha256Hex(envelopeBytes) !== value.publicationEnvelopeSha256
    || envelope.inventoryReceiptSha256 !== value.inventoryReceiptSha256
    || envelope.productionGateReceiptSha256 !== value.productionGateReceiptSha256
    || envelope.compatibilityInventoryReceiptSha256 !== value.compatibilityInventoryReceiptSha256
    || envelope.publicationMode !== value.publicationMode
    || value.repository !== expected.repository
    || value.sourceSha !== expected.sourceSha
    || value.runId !== expected.runId
    || value.runAttempt !== expected.runAttempt
    || Date.parse(now) >= Date.parse(value.expiresAt)
    || approvalEvidence.sourceSha !== value.sourceSha) {
    throw new Error("artifact_publication_authorization_invalid");
  }
  return Object.freeze({ value, sha256: sha256Hex(bytes), envelope });
}
```

```js
test("artifact publisher approval is current, run-bound, attempt-one, and distinct", async () => {
  const approval = await runArtifactPublicationApprovalCheck(artifactPublicationApprovalFixture());
  assert.match(approval.approvalEvidenceSha256, /^[0-9a-f]{64}$/);
  assert.match(approval.publicationAuthorizationSha256, /^[0-9a-f]{64}$/);
  assert.match(approval.publicationEnvelopeSha256, /^[0-9a-f]{64}$/);
  for (const fault of [
    "wrong_run", "attempt_2", "self_approval", "triggering_actor_approval", "policy_drift", "source_drift",
    "source_advanced_before_write", "team_membership_drift_after_resolution",
    "same_count_user_replacement", "same_count_team_replacement", "admin_bypass_true",
    "admin_bypass_omitted", "approver_not_expected", "approval_user_id_drift", "team_membership_inactive",
    "inventory_bytes_swap", "plan_bytes_swap", "authorization_hmac_swap"
  ]) {
    await assert.rejects(() => runArtifactPublicationApprovalCheck(artifactPublicationApprovalFixture({ fault })), /artifact_publication_approval_/);
  }
});

test("publisher binds the approval-record digest into Gate and attestation predicate", async () => {
  const fixture = fixedPublisherControlFixture();
  const result = await runFixedPublisherControlHarness(fixture);
  assert.equal(fixture.createdProductionGate.artifactPublicationApprovalSha256, fixture.approvalEvidenceSha256);
  assert.equal(fixture.attestationPredicate.artifactPublicationApprovalSha256, fixture.approvalEvidenceSha256);
  assert.equal(fixture.attestationPredicate.publicationAuthorizationSha256, fixture.publicationAuthorizationSha256);
  assert.equal(fixture.attestationPredicate.publicationEnvelopeSha256, fixture.publicationEnvelopeSha256);
  assert.equal(result.state, "complete");
});

test("any envelope, receipt, approval, Gate, or predicate swap fails before the first write", async () => {
  for (const fault of [
    "envelope_swap", "inventory_receipt_swap", "production_gate_swap",
    "compatibility_receipt_swap", "approval_evidence_swap", "authorization_swap",
    "gate_approval_digest_swap", "predicate_binding_swap"
  ]) {
    const fixture = fixedPublisherControlFixture({ fault });
    await assert.rejects(() => runFixedPublisherControlHarness(fixture), /publication_(?:authorization|envelope|predicate|gate)/);
    assert.equal(fixture.githubWrites.length, 0);
    assert.equal(fixture.attestationRequests.length, 0);
  }
});
```

- [ ] **Step 4: Create the manual-only workflow and separated jobs**

```yaml
name: Control Plane Artifact Gate

on:
  workflow_dispatch:
    inputs:
      inventory_gate_id:
        description: Fresh content-addressed inventory Gate ID
        required: true
        type: string
      confirmation:
        description: Type publish japan control-plane artifact
        required: true
        type: string

permissions: {}

jobs:
  source-prepare:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      source_commit: ${{ steps.identity.outputs.source_commit }}
      source_archive_sha256: ${{ steps.identity.outputs.source_archive_sha256 }}
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ github.sha }}
          persist-credentials: false
      - id: identity
        name: Bind protected master
        shell: bash
        env:
          CONFIRMATION: ${{ inputs.confirmation }}
        run: |
          set -euo pipefail
          test "${GITHUB_REF}" = "refs/heads/master"
          test "${CONFIRMATION}" = "publish japan control-plane artifact"
          test "${GITHUB_SHA}" = "$(git rev-parse HEAD)"
          mkdir -p "${RUNNER_TEMP}/source-transfer"
          git archive --format=tar --output "${RUNNER_TEMP}/source-transfer/source.tar" "${GITHUB_SHA}"
          git ls-tree -r --full-tree "${GITHUB_SHA}" > "${RUNNER_TEMP}/source-transfer/git-tree.manifest"
          SOURCE_ARCHIVE_SHA256="$(sha256sum "${RUNNER_TEMP}/source-transfer/source.tar" | cut -d' ' -f1)"
          printf 'source_commit=%s\n' "${GITHUB_SHA}" >> "${GITHUB_OUTPUT}"
          printf 'source_archive_sha256=%s\n' "${SOURCE_ARCHIVE_SHA256}" >> "${GITHUB_OUTPUT}"
      - name: Write canonical data-only source transfer
        shell: bash
        env:
          INVENTORY_GATE_ID: ${{ inputs.inventory_gate_id }}
          EXPECTED_SOURCE_ARCHIVE_SHA256: ${{ steps.identity.outputs.source_archive_sha256 }}
        run: |
          set -euo pipefail
          [[ "${INVENTORY_GATE_ID}" =~ ^ig1\.[0-9a-f]{40}\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$ ]]
          mkdir -p "${RUNNER_TEMP}/source-input"
          cp "${RUNNER_TEMP}/source-transfer/source.tar" "${RUNNER_TEMP}/source-input/source.tar"
          cp "${RUNNER_TEMP}/source-transfer/git-tree.manifest" "${RUNNER_TEMP}/source-input/git-tree.manifest"
          SOURCE_SIZE="$(stat -c '%s' "${RUNNER_TEMP}/source-input/source.tar")"
          TREE_SHA256="$(sha256sum "${RUNNER_TEMP}/source-input/git-tree.manifest" | cut -d' ' -f1)"
          TREE_SIZE="$(stat -c '%s' "${RUNNER_TEMP}/source-input/git-tree.manifest")"
          printf '{"schema":"control_plane_source_transfer_v1","sourceCommit":"%s","sourceArchiveSha256":"%s","sourceArchiveSize":%s,"gitTreeManifestSha256":"%s","gitTreeManifestSize":%s,"inventoryGateId":"%s","hostBundleContentReceiptSha256":null}\n' \
            "${GITHUB_SHA}" "${EXPECTED_SOURCE_ARCHIVE_SHA256}" "${SOURCE_SIZE}" "${TREE_SHA256}" "${TREE_SIZE}" "${INVENTORY_GATE_ID}" \
            > "${RUNNER_TEMP}/source-input/source-transfer.json"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-source-input
          path: ${{ runner.temp }}/source-input
          if-no-files-found: error
          retention-days: 1

  tokenless-builder:
    needs: source-prepare
    runs-on: ubuntu-latest
    permissions: {}
    container:
      image: node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-source-input
          path: /workspace/input
      - name: Verify source archive and Git tree before extraction
        shell: bash
        env:
          EXPECTED_SOURCE_ARCHIVE_SHA256: ${{ needs.source-prepare.outputs.source_archive_sha256 }}
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          test "$(sha256sum /workspace/input/source.tar | cut -d' ' -f1)" = "${EXPECTED_SOURCE_ARCHIVE_SHA256}"
          mkdir -p /workspace/source
          /usr/local/bin/node --input-type=module <<'NODE'
          // Fixed workflow-owned verifier: reject duplicate/absolute/traversing/link/device
          // entries; require source-transfer sourceCommit/archive digest/size and sorted
          // git-tree manifest to match the exact archive header/mode/content digests.
          await verifyFixedSourceTransfer("/workspace/input", process.env.EXPECTED_SOURCE_COMMIT);
          NODE
          tar --extract --file /workspace/input/source.tar --directory /workspace/source --no-same-owner --no-same-permissions
          /usr/local/bin/node --input-type=module <<'NODE'
          // Re-hash every extracted regular file and prove exact equality with the
          // previously validated Git-tree manifest before any candidate byte runs.
          await verifyExtractedTree("/workspace/source", "/workspace/input/git-tree.manifest");
          NODE
      - name: Fetch lockfile-bound packages with scripts disabled
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          env -i HOME=/tmp/control-plane-fetch PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
            /usr/local/bin/node /workspace/source/scripts/control-plane-artifact-builder.mjs fetch \
             --source /workspace/source \
             --cache /workspace/cache \
             --custody-output /workspace/cache/custody \
             --builder-contract-file /workspace/source/ops/control-plane-deploy/artifact-builder-contract.json
      - name: Build offline with network namespace disabled
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          env -i HOME=/tmp/control-plane-build PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
            /usr/bin/unshare --net --map-root-user \
            /usr/local/bin/node /workspace/source/scripts/control-plane-artifact-builder.mjs build \
            --source /workspace/source \
            --cache /workspace/cache \
            --output /workspace/output \
            --runtime-contract-file /workspace/source/ops/control-plane-deploy/runtime-contract.json \
             --builder-contract-file /workspace/source/ops/control-plane-deploy/artifact-builder-contract.json \
             --node-headers-directory /workspace/cache/custody/node-headers \
             --node-headers-manifest /workspace/cache/custody/node-headers-manifest.json \
             --toolchain-directory /workspace/cache/custody/toolchain \
             --toolchain-manifest /workspace/cache/custody/toolchain-manifest.json
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-builder-output
          path: /workspace/output
          if-no-files-found: error
          retention-days: 1

  verify:
    needs: [source-prepare, tokenless-builder]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ needs.source-prepare.outputs.source_commit }}
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22.22.0'
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-source-input
          path: ${{ runner.temp }}/source-input
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-builder-output
          path: ${{ runner.temp }}/builder-output
      - name: Independently verify opaque output
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "${EXPECTED_SOURCE_COMMIT}"
          test -z "$(git status --porcelain --untracked-files=no)"
          node scripts/control-plane-artifact-assembly.mjs verify \
            --source-input "${RUNNER_TEMP}/source-input" \
            --builder-output "${RUNNER_TEMP}/builder-output" \
            --trusted-checkout "${GITHUB_WORKSPACE}" \
            --expected-source-commit "${EXPECTED_SOURCE_COMMIT}" \
            --output "${RUNNER_TEMP}/verified-publication"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-verified-publication
          path: ${{ runner.temp }}/verified-publication
          if-no-files-found: error
          retention-days: 1

  publish:
    needs: [source-prepare, verify]
    runs-on: ubuntu-latest
    environment: artifact-publication
    permissions:
      actions: read
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-verified-publication
          path: ${{ runner.temp }}/verified-publication
      - name: Re-hash opaque publication and recheck approval
        id: authorize
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
          VERIFIED_PUBLICATION: ${{ runner.temp }}/verified-publication
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            // This literal workflow-owned body implements the exact closed contract from
            // validateFixedPublisherInput: fixed file names/maxima, duplicate-key rejecting
            // canonical parse, recursive Foundation field order, independent SHA-256/size
            // readback, current master, complete Environment policy (including exact
            // reviewer identities and admin-bypass=false), one current user/team-resolved
            // distinct approval, and byte-equal Gate/inventory/plan/HMAC/envelope
            // equality, expected.predicateBindings, and A -> Gate/envelope -> B construction.
            // It accepts no module/path/URL/method/eval/spawn input and writes only the
            // fixed authorized-publication data files after all GitHub reads validate.
            await runLiteralBoundedPublisherControl({
              operation: "authorize",
              fs, crypto, github, context, core,
              inputRoot: process.env.VERIFIED_PUBLICATION,
              outputRoot: process.env.AUTHORIZED_PUBLICATION,
              expectedSourceCommit: process.env.EXPECTED_SOURCE_COMMIT
            });
      - name: Publish non-Gate immutable assets with fixed control
        id: non_gate_pairs
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            // Literal closed implementation is repeated byte-for-byte from the authorize
            // step. Six literal calls, not a loop, inspect one exact pair each; they upload
            // only a missing exact asset and set one fixed attest_* boolean only when that
            // pair's attestation half is missing.
            await runLiteralBoundedPublisherControl({ operation: "publish_non_gate", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
      - name: Attest control-plane-app.zip
        if: ${{ steps.non_gate_pairs.outputs.attest_control_plane_app == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/control-plane-app.zip
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest artifact.json
        if: ${{ steps.non_gate_pairs.outputs.attest_artifact == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/artifact.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest writer-registry.json
        if: ${{ steps.non_gate_pairs.outputs.attest_writer_registry == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/writer-registry.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest release-declaration.json
        if: ${{ steps.non_gate_pairs.outputs.attest_release_declaration == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/release-declaration.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest release-assembly.json
        if: ${{ steps.non_gate_pairs.outputs.attest_release_assembly == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/release-assembly.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest dependency-build-receipt.json
        if: ${{ steps.non_gate_pairs.outputs.attest_dependency_build_receipt == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/dependency-build-receipt.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Publish Production Gate asset last with fixed control
        id: gate_pair
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "publish_gate_last", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
      - name: Attest Production Gate last
        if: ${{ steps.gate_pair.outputs.attest_production_gate == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/gate/production-gate.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/gate.json
      - name: Verify complete immutable publication and signed bundles with fixed control
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "verify_complete", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
```

`runLiteralBoundedPublisherControl` above is notation for a literal function declaration included at the top of each `script:` body, not an imported/global function. Implement it once as a reviewed source string in the workflow generator test fixture and expand that exact byte string into all four YAML scalar bodies at source-authoring time; the committed workflow contains the complete function four times and has no runtime generator, artifact-carried control, local action, `require` outside the allowlisted Node built-ins, dynamic import, or unresolved identifier. Static tests extract all four declarations, require byte equality and the reviewed SHA-256, execute them in a `vm` harness with only `{ fs, crypto, github, context, core }`, and reject any filesystem read outside the fixed input/output roots or any unlisted GitHub method.

Likewise, `verifyFixedSourceTransfer` and `verifyExtractedTree` denote complete literal function declarations placed before their calls in the two builder here-documents. They use only allowlisted Node built-ins, implement bounded tar-header and manifest parsing directly, and are byte-identical between normal and compatibility workflows. The committed YAML cannot contain the unresolved shorthand shown in this planning excerpt; static tests extract and execute the full literal bodies before considering Task 9 or Task 10 GREEN.

- [ ] **Step 5: Add exact action-digest, builder-scrub, publisher-order, and no-auto-trigger tests**

```js
test("all actions are full-SHA pinned and Gate receipt publication is last", async () => {
  const workflow = await readFile(path, "utf8");
  for (const match of workflow.matchAll(/uses:\s+([^\s]+)@([^\s]+)/g)) {
    assert.match(match[2], /^[0-9a-f]{40}$/);
  }
  assert.match(workflow, /env -i HOME=\/tmp\/control-plane-build/);
  assert.match(workflow, /unshare --net --map-root-user/);
  assert.doesNotMatch(jobBlock(workflow, "tokenless-builder"), /actions\/checkout|permissions:\n      contents: read|GITHUB_TOKEN|github\.token/);
  assert.match(workflow, /Verify source archive and Git tree before extraction/);
  assert.match(workflow, /Re-hash opaque publication and recheck approval/);
  assert.match(workflow, /Attest Production Gate last/);
  assert.equal((workflow.match(/actions\/attest@11bbd243972067817e9ed160cb123cab3601f436/g) ?? []).length, 7);
  assert.match(workflow, /predicate-type: https:\/\/gccwebos\.com\/attestations\/control-plane-publication\/v1/);
  assert.match(workflow, /predicate-path: \$\{\{ runner\.temp \}\}\/authorized-publication\/predicates\/(?:non-gate|gate)\.json/);
  const subjectPaths = [...workflow.matchAll(/subject-path: \$\{\{ runner\.temp \}\}\/authorized-publication\/attestation-subjects\/([^\n]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(subjectPaths, [
    "non-gate/control-plane-app.zip", "non-gate/artifact.json",
    "non-gate/writer-registry.json", "non-gate/release-declaration.json",
    "non-gate/release-assembly.json", "non-gate/dependency-build-receipt.json",
    "gate/production-gate.json"
  ]);
  assert.equal(subjectPaths.some((subjectPath) => /[*?\[\]]/.test(subjectPath)), false);
  assert.doesNotMatch(workflow, /source-input\/control\/scripts|publisher-control\.sha256/);
  assert.equal((workflow.match(/environment: artifact-publication/g) ?? []).length, 1);
  const publisher = jobBlock(workflow, "publish");
  assert.doesNotMatch(publisher, /actions\/checkout|actions\/setup-node|node scripts\/|child_process|eval\(/);
  assert.match(publisher, /can_admins_bypass/);
  assert.match(publisher, /required_reviewers/);
  assert.match(publisher, /\/users\//);
  assert.match(publisher, /\/orgs\/gccwebos-com\/teams\/.*\/memberships\//);
  assert.match(publisher, /statement\.subject\.length\s*!==\s*1/);
  assert.equal((publisher.match(/function runLiteralBoundedPublisherControl/g) ?? []).length, 4);
  assert.equal(new Set(extractLiteralPublisherControlBodies(publisher).map(sha256Hex)).size, 1);
});

test("each partial publication resume repairs only one exact asset-attestation pair", async () => {
  for (const assetName of PUBLICATION_FILE_ORDER) {
    for (const initialState of ["none", "asset_only", "attestation_only", "complete"]) {
      const fixture = fixedPublisherControlFixture({ partialAssetName: assetName, initialState });
      const result = await runFixedPublisherControlHarness(fixture);
      assert.equal(result.state, "complete");
      assert.deepEqual(fixture.touchedPairNames, initialState === "complete" ? [] : [assetName]);
      assert.ok(fixture.attestationStatements.every((statement) => statement.subject.length === 1));
    }
  }
});
```

- [ ] **Step 6: Run the normal Artifact Gate tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-artifact-assembly.mjs
node --check scripts/control-plane-publication-envelope.mjs
node --check server/services/deployment/control-plane-artifact-publication-authorization.mjs
node --test server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-artifact-assembly.test.mjs server/tests/control-plane-publication-envelope.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-postapproval-check.test.mjs server/tests/github-attestation-verifier.test.mjs
```

Expected: all commands exit 0; the workflow has one manual trigger, two inputs, a read-only source-preparer, a no-permission/no-checkout tokenless builder, read-only exact-SHA verification, an opaque no-checkout/no-candidate publisher with four byte-identical fixed control bodies, fixed actions, exact predicate bindings, and last-asset Gate publication.

- [ ] **Step 7: Commit the normal Artifact Gate source**

```powershell
git add -- .github/workflows/control-plane-artifact-gate.yml schemas/control-plane-artifact-publication-authorization-v1.schema.json server/services/deployment/control-plane-artifact-publication-authorization.mjs scripts/control-plane-artifact-assembly.mjs scripts/control-plane-publication-envelope.mjs scripts/control-plane-postapproval-check.mjs server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-postapproval-check.test.mjs
git commit -m "feat: add manual control plane artifact gate"
```

Do not dispatch the workflow, create `artifact-publication`, change permissions, or publish a Release in this task.

---

### Task 10: Manual compatibility Artifact Gate workflow

**Files:**
- Create: `.github/workflows/control-plane-compatibility-artifact-gate.yml`
- Create: `server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs`
- Modify: `scripts/control-plane-release-declaration.mjs`
- Modify: `server/tests/control-plane-release-declaration.test.mjs`
- Modify: `server/tests/control-plane-production-preflight.test.mjs`

**Interface:**
- Inputs are exactly `inventory_gate_id`, `host_bundle_content_receipt_sha256`, and confirmation `publish japan control-plane compatibility artifact`.
- The workflow uses Task 9's exact source-transfer, no-permission/no-checkout tokenless builder, exact-SHA read-only verifier, no-checkout fixed publisher-control topology, and the same seven-row literal asset/attestation table. Its fixed source-transfer writer selects the compatibility shape only by the closed `cig1` input plus exact host-bundle content-receipt digest; it executes no repository prepare operation. Only source-prepare and verify checkout the immutable workflow-dispatch SHA; publisher receives only opaque verified data and pinned fixed control. Every exact `actions/attest` use occurs once, has one fixed file, and is conditional only on its fixed pair-state output; there is no wildcard, matrix, shell loop, or dynamic action selection. `materializeCompatibilityReleaseDeclaration` fixes `deploymentMode: compatibility_bootstrap` and `automatedDeploymentEligible: false` without accepting either value from the dispatcher.
- `runProductionPreflight` must reject every compatibility declaration before plan creation.

- [ ] **Step 1: Write the failing compatibility boundary test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../../.github/workflows/control-plane-compatibility-artifact-gate.yml", import.meta.url);
const normalPath = new URL("../../.github/workflows/control-plane-artifact-gate.yml", import.meta.url);

function shellRunBlocks(workflow) {
  const lines = workflow.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*\|\s*$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    while (++index < lines.length && (lines[index].trim() === "" || lines[index].search(/\S/) > indent)) body.push(lines[index]);
    blocks.push(body.join("\n"));
    index -= 1;
  }
  return blocks;
}

function jobBlock(workflow, jobId) {
  const start = workflow.indexOf(`  ${jobId}:\n`);
  if (start < 0) throw new Error(`missing job ${jobId}`);
  const tail = workflow.slice(start + 2);
  const next = tail.search(/^  [a-z0-9-]+:\n/m);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 2 + next);
}

test("compatibility Gate is manual-only and binds the staged host-content receipt", async () => {
  const workflow = await readFile(path, "utf8");
  assert.match(workflow, /^name: Control Plane Compatibility Artifact Gate$/m);
  assert.match(workflow, /inventory_gate_id:/);
  assert.match(workflow, /host_bundle_content_receipt_sha256:/);
  assert.match(workflow, /publish japan control-plane compatibility artifact/);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|schedule|workflow_call|repository_dispatch):/m);
  assert.doesNotMatch(workflow, /control-plane-artifact-assembly\.mjs prepare(?:-compatibility)?/);
  assert.match(workflow, /control_plane_source_transfer_v1/);
  assert.doesNotMatch(workflow, /--deployment-mode|--automated-deployment-eligible/);
  for (const run of shellRunBlocks(workflow)) assert.doesNotMatch(run, /\$\{\{\s*inputs\./);
  assert.doesNotMatch(workflow, /source-input\/control\/scripts|publisher-control\.sha256|\/workspace\/input\/source/);
  assert.match(jobBlock(workflow, "tokenless-builder"), /permissions: \{\}/);
  assert.doesNotMatch(jobBlock(workflow, "tokenless-builder"), /actions\/checkout|actions\/setup-node|GITHUB_TOKEN|github\.token/);
  assert.doesNotMatch(jobBlock(workflow, "publish"), /actions\/checkout|actions\/setup-node|node scripts\/|child_process|eval\(/);
});
```

- [ ] **Step 2: Run compatibility workflow tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs
```

Expected: FAIL with `ENOENT` for `.github/workflows/control-plane-compatibility-artifact-gate.yml`.

- [ ] **Step 3: Create the compatibility workflow from the same isolated job topology**

```yaml
name: Control Plane Compatibility Artifact Gate

on:
  workflow_dispatch:
    inputs:
      inventory_gate_id:
        description: Fresh content-addressed inventory Gate ID
        required: true
        type: string
      host_bundle_content_receipt_sha256:
        description: Read-back staged host bundle content receipt SHA-256
        required: true
        type: string
      confirmation:
        description: Type publish japan control-plane compatibility artifact
        required: true
        type: string

permissions: {}

jobs:
  source-prepare:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      source_commit: ${{ steps.identity.outputs.source_commit }}
      source_archive_sha256: ${{ steps.identity.outputs.source_archive_sha256 }}
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ github.sha }}
          persist-credentials: false
      - id: identity
        name: Bind protected master
        shell: bash
        env:
          CONFIRMATION: ${{ inputs.confirmation }}
        run: |
          set -euo pipefail
          test "${GITHUB_REF}" = "refs/heads/master"
          test "${CONFIRMATION}" = "publish japan control-plane compatibility artifact"
          test "${GITHUB_SHA}" = "$(git rev-parse HEAD)"
          mkdir -p "${RUNNER_TEMP}/source-transfer"
          git archive --format=tar --output "${RUNNER_TEMP}/source-transfer/source.tar" "${GITHUB_SHA}"
          git ls-tree -r --full-tree "${GITHUB_SHA}" > "${RUNNER_TEMP}/source-transfer/git-tree.manifest"
          SOURCE_ARCHIVE_SHA256="$(sha256sum "${RUNNER_TEMP}/source-transfer/source.tar" | cut -d' ' -f1)"
          printf 'source_commit=%s\n' "${GITHUB_SHA}" >> "${GITHUB_OUTPUT}"
          printf 'source_archive_sha256=%s\n' "${SOURCE_ARCHIVE_SHA256}" >> "${GITHUB_OUTPUT}"
      - name: Write canonical compatibility source transfer
        shell: bash
        env:
          INVENTORY_GATE_ID: ${{ inputs.inventory_gate_id }}
          HOST_BUNDLE_CONTENT_RECEIPT_SHA256: ${{ inputs.host_bundle_content_receipt_sha256 }}
          EXPECTED_SOURCE_ARCHIVE_SHA256: ${{ steps.identity.outputs.source_archive_sha256 }}
        run: |
          set -euo pipefail
          [[ "${INVENTORY_GATE_ID}" =~ ^cig1\.[0-9a-f]{40}\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$ ]]
          [[ "${HOST_BUNDLE_CONTENT_RECEIPT_SHA256}" =~ ^[0-9a-f]{64}$ ]]
          mkdir -p "${RUNNER_TEMP}/source-input"
          cp "${RUNNER_TEMP}/source-transfer/source.tar" "${RUNNER_TEMP}/source-input/source.tar"
          cp "${RUNNER_TEMP}/source-transfer/git-tree.manifest" "${RUNNER_TEMP}/source-input/git-tree.manifest"
          SOURCE_SIZE="$(stat -c '%s' "${RUNNER_TEMP}/source-input/source.tar")"
          TREE_SHA256="$(sha256sum "${RUNNER_TEMP}/source-input/git-tree.manifest" | cut -d' ' -f1)"
          TREE_SIZE="$(stat -c '%s' "${RUNNER_TEMP}/source-input/git-tree.manifest")"
          printf '{"schema":"control_plane_source_transfer_v1","sourceCommit":"%s","sourceArchiveSha256":"%s","sourceArchiveSize":%s,"gitTreeManifestSha256":"%s","gitTreeManifestSize":%s,"inventoryGateId":"%s","hostBundleContentReceiptSha256":"%s"}\n' \
            "${GITHUB_SHA}" "${EXPECTED_SOURCE_ARCHIVE_SHA256}" "${SOURCE_SIZE}" "${TREE_SHA256}" "${TREE_SIZE}" "${INVENTORY_GATE_ID}" "${HOST_BUNDLE_CONTENT_RECEIPT_SHA256}" \
            > "${RUNNER_TEMP}/source-input/source-transfer.json"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-compatibility-source-input
          path: ${{ runner.temp }}/source-input
          if-no-files-found: error
          retention-days: 1

  tokenless-builder:
    needs: source-prepare
    runs-on: ubuntu-latest
    permissions: {}
    container:
      image: node:22-bookworm@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-compatibility-source-input
          path: /workspace/input
      - name: Verify source archive and Git tree before extraction
        shell: bash
        env:
          EXPECTED_SOURCE_ARCHIVE_SHA256: ${{ needs.source-prepare.outputs.source_archive_sha256 }}
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          test "$(sha256sum /workspace/input/source.tar | cut -d' ' -f1)" = "${EXPECTED_SOURCE_ARCHIVE_SHA256}"
          mkdir -p /workspace/source
          /usr/local/bin/node --input-type=module <<'NODE'
          await verifyFixedSourceTransfer("/workspace/input", process.env.EXPECTED_SOURCE_COMMIT);
          NODE
          tar --extract --file /workspace/input/source.tar --directory /workspace/source --no-same-owner --no-same-permissions
          /usr/local/bin/node --input-type=module <<'NODE'
          await verifyExtractedTree("/workspace/source", "/workspace/input/git-tree.manifest");
          NODE
      - name: Fetch lockfile-bound packages with scripts disabled
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          env -i HOME=/tmp/control-plane-fetch PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
             /usr/local/bin/node /workspace/source/scripts/control-plane-artifact-builder.mjs fetch \
             --source /workspace/source \
             --cache /workspace/cache \
             --custody-output /workspace/cache/custody \
             --builder-contract-file /workspace/source/ops/control-plane-deploy/artifact-builder-contract.json
      - name: Build offline with network namespace disabled
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          env -i HOME=/tmp/control-plane-build PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC \
            /usr/bin/unshare --net --map-root-user \
            /usr/local/bin/node /workspace/source/scripts/control-plane-artifact-builder.mjs build \
            --source /workspace/source \
             --cache /workspace/cache \
             --output /workspace/output \
             --runtime-contract-file /workspace/source/ops/control-plane-deploy/runtime-contract.json \
             --builder-contract-file /workspace/source/ops/control-plane-deploy/artifact-builder-contract.json \
             --node-headers-directory /workspace/cache/custody/node-headers \
             --node-headers-manifest /workspace/cache/custody/node-headers-manifest.json \
             --toolchain-directory /workspace/cache/custody/toolchain \
             --toolchain-manifest /workspace/cache/custody/toolchain-manifest.json
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-compatibility-builder-output
          path: /workspace/output
          if-no-files-found: error
          retention-days: 1

  verify:
    needs: [source-prepare, tokenless-builder]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ needs.source-prepare.outputs.source_commit }}
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22.22.0'
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-compatibility-source-input
          path: ${{ runner.temp }}/source-input
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-compatibility-builder-output
          path: ${{ runner.temp }}/builder-output
      - name: Independently verify compatibility output
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "${EXPECTED_SOURCE_COMMIT}"
          test -z "$(git status --porcelain --untracked-files=no)"
          node scripts/control-plane-artifact-assembly.mjs verify \
            --source-input "${RUNNER_TEMP}/source-input" \
            --builder-output "${RUNNER_TEMP}/builder-output" \
            --trusted-checkout "${GITHUB_WORKSPACE}" \
            --expected-source-commit "${EXPECTED_SOURCE_COMMIT}" \
            --output "${RUNNER_TEMP}/verified-publication"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-compatibility-verified-publication
          path: ${{ runner.temp }}/verified-publication
          if-no-files-found: error
          retention-days: 1

  publish:
    needs: [source-prepare, verify]
    runs-on: ubuntu-latest
    environment: artifact-publication
    permissions:
      actions: read
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-compatibility-verified-publication
          path: ${{ runner.temp }}/verified-publication
      - name: Re-hash opaque compatibility publication and recheck approval
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.source-prepare.outputs.source_commit }}
          VERIFIED_PUBLICATION: ${{ runner.temp }}/verified-publication
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "authorize_compatibility", fs, crypto, github, context, core, inputRoot: process.env.VERIFIED_PUBLICATION, outputRoot: process.env.AUTHORIZED_PUBLICATION, expectedSourceCommit: process.env.EXPECTED_SOURCE_COMMIT });
      - name: Publish compatibility non-Gate assets with fixed control
        id: non_gate_pairs
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "publish_non_gate", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
      - name: Attest compatibility control-plane-app.zip
        if: ${{ steps.non_gate_pairs.outputs.attest_control_plane_app == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/control-plane-app.zip
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest compatibility artifact.json
        if: ${{ steps.non_gate_pairs.outputs.attest_artifact == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/artifact.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest compatibility writer-registry.json
        if: ${{ steps.non_gate_pairs.outputs.attest_writer_registry == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/writer-registry.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest compatibility release-declaration.json
        if: ${{ steps.non_gate_pairs.outputs.attest_release_declaration == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/release-declaration.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest compatibility release-assembly.json
        if: ${{ steps.non_gate_pairs.outputs.attest_release_assembly == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/release-assembly.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Attest compatibility dependency-build-receipt.json
        if: ${{ steps.non_gate_pairs.outputs.attest_dependency_build_receipt == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/non-gate/dependency-build-receipt.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/non-gate.json
      - name: Publish compatibility Gate last with fixed control
        id: gate_pair
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "publish_gate_last", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
      - name: Attest compatibility Gate last
        if: ${{ steps.gate_pair.outputs.attest_production_gate == 'true' }}
        uses: actions/attest@11bbd243972067817e9ed160cb123cab3601f436
        with:
          subject-path: ${{ runner.temp }}/authorized-publication/attestation-subjects/gate/production-gate.json
          predicate-type: https://gccwebos.com/attestations/control-plane-publication/v1
          predicate-path: ${{ runner.temp }}/authorized-publication/predicates/gate.json
      - name: Verify compatibility publication and signed bundles with fixed control
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea
        env:
          AUTHORIZED_PUBLICATION: ${{ runner.temp }}/authorized-publication
        with:
          github-token: ${{ github.token }}
          script: |
            const fs = require("node:fs");
            const crypto = require("node:crypto");
            await runLiteralBoundedPublisherControl({ operation: "verify_complete", fs, crypto, github, context, core, inputRoot: process.env.AUTHORIZED_PUBLICATION });
```

As in Task 9, each committed `script:` scalar contains the complete byte-identical fixed function declaration before the shown call. Compatibility changes only the closed operation name and expected `compatibility_bootstrap`/receipt bindings; it does not add a second control implementation or execute repository code.

- [ ] **Step 4: Add anti-reuse and permanent-ineligibility tests**

```js
test("compatibility publisher cannot be reached through reusable workflow authority", async () => {
  const workflow = await readFile(path, "utf8");
  const normalWorkflow = await readFile(normalPath, "utf8");
  assert.doesNotMatch(workflow, /workflow_call:/);
  assert.doesNotMatch(workflow, /^    uses: \.\/\.github\/workflows\//m);
  assert.equal((workflow.match(/contents: write/g) ?? []).length, 1);
  assert.equal((workflow.match(/environment: artifact-publication/g) ?? []).length, 1);
  assert.match(jobBlock(workflow, "source-prepare"), /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(jobBlock(workflow, "source-prepare"), /ref: refs\/heads\/master/);
  assert.match(jobBlock(workflow, "verify"), /ref: \$\{\{ needs\.source-prepare\.outputs\.source_commit \}\}/);
  assert.match(jobBlock(workflow, "tokenless-builder"), /permissions: \{\}/);
  assert.doesNotMatch(jobBlock(workflow, "tokenless-builder"), /actions\/checkout|actions\/setup-node|GITHUB_TOKEN|github\.token/);
  assert.match(jobBlock(workflow, "publish"), /Re-hash opaque compatibility publication and recheck approval/);
  assert.doesNotMatch(jobBlock(workflow, "publish"), /actions\/checkout|actions\/setup-node|node scripts\/|child_process|eval\(/);
  assert.match(jobBlock(workflow, "publish"), /actions\/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea/);
  assert.equal((jobBlock(workflow, "publish").match(/actions\/attest@11bbd243972067817e9ed160cb123cab3601f436/g) ?? []).length, 7);
  assert.match(jobBlock(workflow, "publish"), /authorized-publication\/predicates\/(?:non-gate|gate)\.json/);
  const subjectPaths = [...jobBlock(workflow, "publish").matchAll(/subject-path: \$\{\{ runner\.temp \}\}\/authorized-publication\/attestation-subjects\/([^\n]+)/g)]
    .map((match) => match[1]);
  assert.deepEqual(subjectPaths, [
    "non-gate/control-plane-app.zip", "non-gate/artifact.json",
    "non-gate/writer-registry.json", "non-gate/release-declaration.json",
    "non-gate/release-assembly.json", "non-gate/dependency-build-receipt.json",
    "gate/production-gate.json"
  ]);
  assert.equal(subjectPaths.some((subjectPath) => /[*?\[\]]/.test(subjectPath)), false);
  assert.equal((jobBlock(workflow, "publish").match(/function runLiteralBoundedPublisherControl/g) ?? []).length, 4);
  const compatibilityBodies = extractLiteralPublisherControlBodies(jobBlock(workflow, "publish"));
  const normalBodies = extractLiteralPublisherControlBodies(jobBlock(normalWorkflow, "publish"));
  assert.equal(new Set(compatibilityBodies.map(sha256Hex)).size, 1);
  assert.deepEqual(compatibilityBodies, normalBodies);
});

test("compatibility declaration is permanently ineligible for production", async () => {
  const declaration = materializeCompatibilityReleaseDeclaration(compatibilityFixture());
  assert.equal(declaration.value.deploymentMode, "compatibility_bootstrap");
  assert.equal(declaration.value.automatedDeploymentEligible, false);
  await assert.rejects(() => runProductionPreflight(preflightFixture({ declarationBytes: declaration.bytes })), /production_preflight_deployment_mode_invalid/);
});

test("compatibility partial resume also touches only its one exact pair", async () => {
  for (const assetName of PUBLICATION_FILE_ORDER) {
    for (const initialState of ["none", "asset_only", "attestation_only", "complete"]) {
      const fixture = compatibilityFixedPublisherControlFixture({
        partialAssetName: assetName,
        initialState
      });
      const result = await runCompatibilityFixedPublisherControlHarness(fixture);
      assert.equal(result.state, "complete");
      assert.deepEqual(fixture.touchedPairNames, initialState === "complete" ? [] : [assetName]);
      assert.ok(fixture.attestationStatements.every(({ subject }) => subject.length === 1));
    }
  }
});
```

- [ ] **Step 5: Run compatibility tests and verify GREEN**

Run:

```powershell
node --test server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-release-declaration.test.mjs server/tests/control-plane-production-preflight.test.mjs
```

Expected: all tests pass; the workflow is manual-only, has exactly three inputs, has only one protected publisher, and can never produce a production-eligible declaration.

- [ ] **Step 6: Commit the compatibility source**

```powershell
git add -- .github/workflows/control-plane-compatibility-artifact-gate.yml scripts/control-plane-release-declaration.mjs server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-release-declaration.test.mjs server/tests/control-plane-production-preflight.test.mjs
git commit -m "feat: add compatibility artifact gate"
```

Do not dispatch the workflow or use compatibility assets for automated deployment.

---

### Task 11: Workflow-side production controller and fixed execute CLI

Dependency checkpoint: begin Tasks 11–13 only after Artifact Tasks 9–10, Host/DB Tasks 11–13, and Receipt Tasks 5–8 are GREEN at the same exact source head.

**Files:**
- Create: `server/services/deployment/control-plane-production-controller.mjs`
- Create: `server/services/deployment/control-plane-production-integration-adapter.mjs`
- Create: `scripts/control-plane-production-controller.mjs`
- Create: `server/tests/control-plane-production-controller.test.mjs`
- Create: `server/tests/control-plane-production-integration-adapter.test.mjs`
- Create: `server/tests/control-plane-production-controller-cli.test.mjs`

**Interfaces:**
- `runProductionController({ planBytes, gateReceiptBytes, artifactStream, oidcToken, transport, githubEvidence, closeoutPublisher, clock }) -> { resultCode, controllerRecoveryId, closeoutSha256, finalStatusBytes, finalStatusSha256 }` is frozen. Every branch returns one non-null immutable closeout digest plus the exact Receipt-built final-status bytes/digest; the Artifact CLI is the sole final-status file sink.
- `transport` is exclusively the single Bootstrap object returned by one `createSecureSshTransport({ native, clock, secretMaterializer })` call for this controller invocation. The same module exports `DEPLOY_CREDENTIAL_ID`, `FIXED_CREDENTIAL_MATERIAL_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_FIELDS`, `FIXED_CREDENTIAL_EXPECTATION_CONTRACT`, `createFixedCredentialExpectation`, `deriveKnownHostsBinding`, `assertKnownHostsRecordExpectation`, `validateFixedCredentialMaterial`, `TRANSPORT_FAILURE_DIAGNOSTIC_CODES`, and `validateTransportEnvelope`. Artifact consumes that complete owner ABI: it derives the host binding from `{ host, port, knownHostsBytes }`, creates the branded expectation with the exact factory, asserts binding-to-material equality, calls the branded validator, and returns exactly frozen `{ material, expectation }` from its lazy materializer. It never calls the lower-level parser, constructs an expectation object, or uses a legacy caller-built expectation variant. Admission and artifact bytes use one `.execute({ credentialId, authFrameBytes, expectedReady, artifactCapability, artifactSize })`; status and Receipt closeout transitions use `.request({ credentialId, requestBytes, timeoutMs })`; Bootstrap's terminal reader alone uses `.requestStatusBundle({ credentialId, requestBytes, timeoutMs, consumeFrame })`; an outer `finally` calls the owner-provided `.close()` exactly once. No controller API accepts a host, port, user, key, known-hosts, command, executable, or SSH option.
- `.execute`, `.request`, and `.requestBootstrap` return only the owner-validated outer-frozen exact-key `{ exitCode, responseBytes, diagnosticCode }`. Success is exactly integer `0`, an owned `Buffer` of at most 2,048 bytes, and `null`; failure is a bounded nonzero integer, empty Buffer, and one member of `TRANSPORT_FAILURE_DIAGNOSTIC_CODES`. Raw stdout/stderr never return. `.execute().responseBytes` is only `artifact_accepted_v1`, never deployment terminal; after acceptance or a possibly-lost ACK the controller performs five-second read-only `.request()` status polls and never replays `.execute()`. Once Bootstrap validates an immutable terminal status, Artifact calls Bootstrap-owned `readTerminalBundleBytes({ transport, validatedStatus, timeoutMs: 30000 })` on the same transport; that helper alone drives `requestStatusBundle`, consumes its private frames, and returns frozen `{ bytes, sha256 }`. Artifact passes that wrapper unchanged to Receipt and never loops over chunks, parses the bundle, or closes transport inside the helper.
- Bootstrap fixes `ready_for_artifact_v1` to `type, transactionId, productionGateReceiptSha256, deploymentPlanSha256, authorizationRecordSha256, artifactSize, artifactSha256`. Artifact passes the exact six-field value without `type` as `expectedReady`; transport/Bootstrap alone encodes and byte-compares it. The distinct approved `artifact_accepted_v1` acknowledgment has exactly `gateId, deploymentPlanSha256, transactionId, acceptedAt, accepted`; `validateArtifactAcceptedFrame(responseBytes, { gateId, deploymentPlanSha256, transactionId })` validates only that five-field response and returns no accepted-record, accepted-plan, invocation, EOF, or custody field. Artifact never imports either host response encoder or a reservation digest.
- `encodeExecuteAuthFrame` receives exact owned canonical `deploymentPlanBytes`, `productionGateReceiptBytes`, `authorizationRecordBytes`, and `oidcTokenBytes`. Bootstrap validates all four, publishes/fsyncs/readbacks its fixed accepted-plan object before `ready_for_artifact`, and binds the later artifact acceptance to it. Artifact never sends a path or locally decoded plan/Gate object.
- Bootstrap/Host's sole transaction invocation digest is domain-separated as `SHA256("control-plane-transaction-start-accepted-v1\0" || canonicalizeAcceptedStartEvidence({ acceptedArtifactRecordSha256, acceptedPlanSha256, authorizationReservationSha256, artifactCapabilityIdentitySha256 }).bytes)`. Bootstrap persists/readbacks the four source objects and the Host-owned canonical projection; the Host broker independently reopens and recomputes it before start. Receipt alone recovers `transactionInvocationSha256` from the terminal bundle and validates every accepted-plan/accepted-artifact/invocation edge. Neither the five-field acceptance acknowledgment nor Artifact code can construct or claim an invocation digest.
- Every ordinary poll calls `encodeStatusRequestFrame({ requestId, gateId, deploymentPlanSha256, transactionId })` and passes that byte-identical four-field value to `validateStatusResponseFrame`. Gate/plan bytes never enter a host frame. Artifact returns and forwards that exact privately branded frozen 16-field value; it never spreads, wraps, or clones it. The same object goes to `readTerminalBundleBytes` and Receipt `validateTerminal`. Initial terminal status carries no caller-added response digest; only Receipt's ACK validator and post-ACK independent committed-status validator add their own exact `responseSha256`. No fixture-shaped status, generic decoder, or Artifact-local bundle assembler is accepted.
- The CLI is `node scripts/control-plane-production-controller.mjs execute --plan <file> --gate-receipt <file> --artifact <file> --postapproval-evidence <file> --authorization-record <file> --closeout-directory <directory> --retention-days 35 --final-status-output <file> --github-output <file>`; `execute` is the only operation. It imports `deriveProductionAuthorizationOidcAudience`, validates `deploymentPlanSha256` and `databaseContractsSha256` before any token or credential materialization, uses the Receipt adapter for terminal closeout, and constructs an Artifact-owned `finalStatusSink` whose exact surface is `writeExact({ bytes, sha256 })` plus `readBackExact()`. The sink is constructed with the imported Receipt-owned `CONTROLLER_FINAL_STATUS_CONTRACT`; there is no undefined or duplicate `writeFinalStatus`. It writes and reads back exactly the bytes returned by Receipt-owned `buildControllerFinalStatus`; no path enters Receipt and neither immutable closeout nor final-status payload is rewritten.
- `createProductionIntegrationAdapters({ native, clock, secretMaterializer, transitionOidc, runnerMaterialStore, actionsArtifactClient })` is the sole Artifact-owned handoff. It constructs exactly one Bootstrap transport with exact public keys `execute`, `request`, `requestStatusBundle`, `requestBootstrap`, and `close`, and composes Receipt-owned `createControllerCloseoutAdapter({ runnerMaterialStore, actionsArtifactClient, requestOidcToken, clock })`; it contains no duplicate closeout schema, frame encoder, SSH client, publisher, final-status sink, or custody API.
- The Receipt adapter exact method surface is `validateTerminal`, `createNoClaimEvidence`, `cleanupAndReadBackRunnerMaterial`, `toControllerCloseoutInput`, `expectedBindings`, `createUploadStartedRequest`, `validateUploadStartedResponse`, `writeImmutableLocalFile`, `uploadActionsArtifact`, `readBackExactActionsArtifact`, `deleteLocalFileAndReadBackAbsent`, `createAckRequest`, `validateAckResponse`, `createCommittedStatusRequest`, and `validateUploadCommittedObserved`. Artifact calls no unlisted convenience method.
- Consumes `classifyControllerCloseout`, `buildControllerCloseout`, `validateControllerCloseoutBytes`, `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus`, and `validateControllerFinalStatus` from Receipt-owned `server/services/deployment/control-plane-controller-closeout.mjs`; Receipt alone owns `scripts/control-plane-controller-closeout.mjs`, and the Artifact controller composes the module adapter without recreating or shelling through a competing closeout CLI.
- Receipt-owned `createNoClaimEvidence({ plan, resultCode, runnerCleanupVerified }) -> { immutable, closeoutBindings }` accepts only the three no-claim result codes and returns non-null exact closeout bytes/digest that are never uploaded. Receipt-owned `expectedBindings({ plan })` returns only `{ controllerRecoveryId, originalRunId, originalRunAttempt, productionGateReceiptSha256, transactionId, target, releaseUnit, sourceCommit, deploymentPlanSha256, inventoryReceiptSha256, bootstrapReceiptSha256 }`; Artifact never reconstructs this tuple or accepts a digest alias.
- `cleanupAndReadBackRunnerMaterial({ plan })` must return literal `true` before either a terminal or no-claim final status can be built. For a terminal, Receipt's branded local APIs are exact: `writeImmutableLocalFile(immutable) -> localHandle`, `uploadActionsArtifact({ immutable, localHandle }) -> uploadHandle`, `readBackExactActionsArtifact({ uploaded, immutable, plan }) -> { value, bytes, sha256 }`, and `deleteLocalFileAndReadBackAbsent(localHandle) -> true`. Artifact never passes a path, name, bytes, retention override, or observation reconstruction into these APIs; Receipt derives one file and 35-day retention.
- Receipt-owned `validateTerminal({ status, terminalBundle, plan, artifactAccepted })` consumes the exact original Bootstrap-branded ordinary immutable-terminal value, exact Bootstrap-owned `{ bytes, sha256 }` wrapper, and canonical `null` or the unchanged validated five-field acceptance acknowledgment. It returns only the Receipt-owned terminal projection including the terminal-bundle-derived `transactionInvocationSha256`; an observed acknowledgment contributes only its three selector bindings and `accepted/acceptedAt`, never the invocation. Artifact passes that terminal projection unchanged into Receipt-owned `toControllerCloseoutInput`, so immutable closeout and final status preserve the invocation without adding it to either the five-field acknowledgment or sixteen-field ordinary status. Receipt alone parses its `HOST_TERMINAL_BUNDLE_V1_CONTRACT`, verifies body, outer record, accepted-plan/accepted-artifact/invocation edges, held finalizer fence at receipt publication, initial closeout record/lease, digest, and status binding. Artifact then completes upload/ACK and performs a separate ordinary status readback which proves finalizer inactive and both leases free before final status. A nonterminal, pre-admission rejection, bare durable-rejection flag, null bytes, invocation mismatch, or invalid Receipt Task 2 proof cannot enter this validator.
- Receipt-owned closeout validation is strictly two-stage. `validateAckResponse({ transportResult, immutable, observation, uploadStartedStatus, expected })` validates the complete ACK/CAS envelope. Then `createCommittedStatusRequest({ plan, immutable, observation, ackStatus }) -> { transportRequest, expectedStatus }` produces the separate ordinary read-only request; `ackStatus` is the validated value or canonical `null` only when the ACK transport response may have been lost after durable host commit. `validateUploadCommittedObserved({ transportResult, immutable, observation, terminal, ackStatus, expectedStatus })` validates that complete independent envelope, including unchanged terminal-bundle identity, finalizer inactive, both leases free, and returns the exact ordinary-status value plus its independently computed `responseSha256`. Only this last return may become `validatedFinalHostStatus`; the ACK transition is never replayed.
- Only a validated immutable terminal host receipt may enter upload-start/upload/readback/ACK. Upload-start and ACK each request a transition-specific one-use OIDC token from the Receipt adapter using Bootstrap's sole audience grammar, `gccgw-control-plane-closeout-${transition}:${bindingSha256}`; `bindingSha256` is the digest of the complete Bootstrap-owned canonical transition tuple, not a terminal-receipt-only or artifact-observation-only shortcut. The ACK envelope is passed intact to Receipt-owned validation; afterward one separate read-only status request observes the host's independent committed state and contributes its exact `responseSha256` to final status. Receipt reserves and tests `classifyControllerCloseout({ preAdmissionDurableRejection: true, admissionAccepted: false })`, but the frozen Bootstrap ABI exposes no pre-admission rejection brand or producer; therefore this Artifact controller never calls that branch and never produces `admission_rejected_no_transaction`. A bare `admissionAccepted: false`, transport diagnostic, or arbitrary ordinary `durableRejection` fails closed. `terminal_quiescence_rejected` belongs to an already accepted critical transaction, remains transitional, and is polled within the same absolute bound. If it never becomes immutable terminal, the result is `controller_incomplete_no_production_claim`; once a later ordinary status is the branded immutable critical terminal, Artifact reads its single terminal bundle and Receipt maps it to `validated_critical_failure`. All no-claim paths perform zero upload-start requests, zero Actions closeout uploads, and zero ACK requests.
- Receipt's closed normal result algebra remains exactly `validated_deployment`, `validated_stopped_pre_switch`, `validated_schema_only_change`, `validated_rolled_back`, `validated_critical_failure`, `admission_rejected_no_transaction`, `receipt_invalid_no_production_claim`, and `controller_incomplete_no_production_claim`; with the frozen Bootstrap ABI, the Artifact controller can emit every row except reserved `admission_rejected_no_transaction`.
- Host closeout dispositions `controller_closeout_pending`, `controller_closeout_acknowledged_released`, and `controller_closeout_abandoned_attached` are separate host-record facts and can never appear as `resultCode`.

- [ ] **Step 1: Write the failing admission-before-artifact test**

```js
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { runProductionController } from "../services/deployment/control-plane-production-controller.mjs";

test("controller validates artifact acceptance then polls terminal status without replay", async () => {
  const events = [];
  const fixture = controllerFixture({
    artifactStream: Readable.from([Buffer.from("artifact")]),
    transport: {
      async execute(input) {
        assert.deepEqual(Object.keys(input).sort(), ["artifactCapability", "artifactSize", "authFrameBytes", "credentialId", "expectedReady"]);
        events.push(["execute", input.credentialId, (await streamToBuffer(input.artifactCapability)).length]);
        return transportSuccess(artifactAcceptedBytes());
      },
      async request(input) {
        const requestType = inspectFixtureRequestType(input.requestBytes);
        events.push(["request", requestType]);
        return transportSuccess(statusOrCloseoutResponseFor(input.requestBytes));
      },
      async close() {
        events.push(["close"]);
      }
    },
  });
  const result = await runProductionController(fixture);
  assert.equal(events[0][0], "execute");
  assert.equal(events.at(-1)[0], "close");
  assert.equal(events[0][1], "japan-control-plane-github-deploy-v1");
  const requestTypes = events.slice(1, -1).map((entry) => entry[1]);
  assert.deepEqual(requestTypes.slice(0, 2), ["transaction_status", "transaction_status"]);
  assert.deepEqual(requestTypes.slice(-3), ["closeout_upload_started", "closeout_ack", "transaction_status"]);
  assert.ok(requestTypes.slice(2, -3).length >= 1);
  assert.ok(requestTypes.slice(2, -3).every((type) => type === "terminal_bundle_chunk"));
  assert.equal(result.resultCode, "validated_deployment");
});
```

- [ ] **Step 2: Run controller tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/services/deployment/control-plane-production-controller.mjs`.

- [ ] **Step 3: Implement immutable plan/Gate admission binding**

```js
import {
  DEPLOY_CREDENTIAL_ID,
  TRANSPORT_FAILURE_DIAGNOSTIC_CODES,
  validateTransportEnvelope
} from "./control-plane-transport-contract.mjs";
import {
  encodeExecuteAuthFrame,
  encodeStatusRequestFrame,
  readTerminalBundleBytes,
  validateArtifactAcceptedFrame,
  validateStatusResponseFrame
} from "./control-plane-host-protocol.mjs";
import {
  deriveProductionAuthorizationOidcAudience,
  validateProductionAuthorizationRecord
} from "./control-plane-production-authorization.mjs";
import {
  buildControllerFinalStatus,
  buildControllerCloseout,
  classifyControllerCloseout,
  validateControllerCloseoutBytes
} from "./control-plane-controller-closeout.mjs";
import { CONTROLLER_RESULTS } from "./control-plane-receipt-contract.mjs";
import { canonicalizeDatabaseContracts } from "./database-contract.mjs";
import { sha256Hex } from "./canonical-json.mjs";

const RESULT_CODES = new Set(CONTROLLER_RESULTS);

const STATUS_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_LIMIT_MS = 960_000;

async function pollImmutableTerminalStatus({
  transport,
  plan,
  deploymentPlanSha256,
  clock,
  acceptedOrPossiblyLost
}) {
  const deadline = clock.now().getTime() + STATUS_POLL_LIMIT_MS;
  if (acceptedOrPossiblyLost !== null
    && !TRANSPORT_FAILURE_DIAGNOSTIC_CODES.includes(acceptedOrPossiblyLost)) {
    throw new Error("production_controller_transport_failed");
  }
  let requestSequence = 0;
  let observedCriticalTransition = false;
  while (clock.now().getTime() <= deadline) {
    const expectedStatus = Object.freeze({
      requestId: `controller-status-${String(requestSequence).padStart(6, "0")}`,
      gateId: plan.gateId,
      deploymentPlanSha256,
      transactionId: plan.transactionId
    });
    requestSequence += 1;
    const requestBytes = encodeStatusRequestFrame(expectedStatus);
    const envelope = validateTransportEnvelope(await transport.request({
      credentialId: DEPLOY_CREDENTIAL_ID,
      requestBytes,
      timeoutMs: 30_000
    }));
    if (envelope.exitCode !== 0) {
      if (!TRANSPORT_FAILURE_DIAGNOSTIC_CODES.includes(envelope.diagnosticCode)) {
        throw new Error("production_controller_transport_failed");
      }
      await clock.sleep(STATUS_POLL_INTERVAL_MS);
      continue;
    }
    const value = validateStatusResponseFrame(envelope.responseBytes, expectedStatus);
    if (value.immutableTerminal === true) return value;
    if (value.durableRejection === true) {
      if (value.resultCode !== "terminal_quiescence_rejected") {
        throw new Error("production_controller_durable_rejection_invalid");
      }
      observedCriticalTransition = true;
    } else if (value.resultCode !== "terminal_quiescence_pending" && observedCriticalTransition) {
      throw new Error("production_controller_critical_transition_invalid");
    }
    await clock.sleep(STATUS_POLL_INTERVAL_MS);
  }
  return null;
}

async function buildNoClaimControllerResult({ plan, resultCode, closeoutPublisher, clock }) {
  const runnerCleanupVerified = await closeoutPublisher.cleanupAndReadBackRunnerMaterial({ plan });
  if (runnerCleanupVerified !== true) throw new Error("production_controller_cleanup_invalid");
  const noClaim = closeoutPublisher.createNoClaimEvidence({
    plan,
    resultCode,
    runnerCleanupVerified
  });
  validateControllerCloseoutBytes(noClaim.immutable.bytes, noClaim.closeoutBindings);
  const finalStatus = buildControllerFinalStatus({
    controllerCloseoutBytes: noClaim.immutable.bytes,
    closeoutBindings: noClaim.closeoutBindings,
    actionsArtifactObservation: null,
    validatedFinalHostStatus: null,
    artifactReleaseTag: null,
    backupResult: null,
    observedAt: clock.now().toISOString()
  });
  return Object.freeze({
    resultCode,
    controllerRecoveryId: plan.controllerRecoveryId,
    closeoutSha256: noClaim.immutable.sha256,
    finalStatusBytes: finalStatus.bytes,
    finalStatusSha256: finalStatus.sha256
  });
}

export async function runProductionController({
  planBytes,
  gateReceiptBytes,
  artifactStream,
  oidcToken,
  transport,
  githubEvidence,
  closeoutPublisher,
  clock
}) {
  try {
  const now = clock.now().toISOString();
  const validated = validateDeploymentPlanBytes({ bytes: planBytes, now, runContext: githubEvidence.runIdentity });
  const plan = validated.plan;
  const planDatabase = canonicalizeDatabaseContracts(plan.databaseContracts);
  const deploymentPlanSha256 = sha256Hex(planBytes);
  const authorization = validateProductionAuthorizationRecord({
    bytes: githubEvidence.authorizationRecordBytes,
    expected: Object.freeze({
      deploymentPlanSha256,
      productionGateReceiptSha256: sha256Hex(gateReceiptBytes),
      databaseContractsSha256: planDatabase.sha256,
      transactionId: plan.transactionId,
      sourceSha: plan.sourceCommit,
      runId: String(githubEvidence.runIdentity.runId),
      runAttempt: 1
    }),
    now
  });
  const gate = validateProductionGateReceipt({
    productionGateId: plan.gateId,
    bytes: gateReceiptBytes,
    now,
    expectedRepository: "gccwebos-com/proxy-gateway-minimal",
    expectedSourceCommit: plan.sourceCommit
  });
  if (sha256Hex(gateReceiptBytes) !== plan.productionGateReceiptSha256
    || gate.receipt.artifactSha256 !== plan.artifact.sha256
    || authorization.value.sourceSha !== plan.sourceCommit
    || githubEvidence.databaseContractsSha256 !== planDatabase.sha256
    || validatePostApprovalEvidence({ githubEvidence, plan, authorization }) !== true) {
    throw new Error("production_controller_binding_invalid");
  }
  const expectedAudience = deriveProductionAuthorizationOidcAudience(authorization.sha256);
  if (githubEvidence.oidcAudience !== expectedAudience) throw new Error("production_controller_oidc_audience_invalid");
  const authFrameBytes = encodeExecuteAuthFrame({
    deploymentPlanBytes: planBytes,
    productionGateReceiptBytes: gateReceiptBytes,
    authorizationRecordBytes: githubEvidence.authorizationRecordBytes,
    oidcTokenBytes: oidcToken
  });
  const expectedReady = Object.freeze({
    transactionId: plan.transactionId,
    productionGateReceiptSha256: plan.productionGateReceiptSha256,
    deploymentPlanSha256,
    authorizationRecordSha256: authorization.sha256,
    artifactSize: plan.artifact.sizeBytes,
    artifactSha256: plan.artifact.sha256
  });
  let executeDiagnostic = null;
  let artifactAccepted = null;
  const executeEnvelope = validateTransportEnvelope(await transport.execute({
    credentialId: DEPLOY_CREDENTIAL_ID,
    authFrameBytes,
    expectedReady,
    artifactCapability: createExactSizeHashingStream({
      stream: artifactStream,
      expectedSize: plan.artifact.sizeBytes,
      expectedSha256: plan.artifact.sha256
    }),
    artifactSize: plan.artifact.sizeBytes
  }));
  if (executeEnvelope.exitCode === 0) {
    try {
      artifactAccepted = validateArtifactAcceptedFrame(executeEnvelope.responseBytes, Object.freeze({
        gateId: plan.gateId,
        deploymentPlanSha256,
        transactionId: plan.transactionId
      }));
    } catch {
      // A malformed or lost success ACK is ambiguous: poll the same transaction and never replay execute.
    }
  } else {
    executeDiagnostic = executeEnvelope.diagnosticCode;
  }

  const status = await pollImmutableTerminalStatus({
    transport,
    plan,
    deploymentPlanSha256,
    clock,
    acceptedOrPossiblyLost: executeDiagnostic
  });
  if (status === null) {
    const resultCode = classifyControllerCloseout({ controllerComplete: false });
    return buildNoClaimControllerResult({
      plan,
      resultCode,
      closeoutPublisher,
      clock
    });
  }
  if (status.immutableTerminal !== true || status.durableRejection === true) {
    throw new Error("production_controller_terminal_status_invalid");
  }

  let terminal;
  try {
    const terminalBundle = await readTerminalBundleBytes({
      transport,
      validatedStatus: status,
      timeoutMs: 30_000
    });
    terminal = closeoutPublisher.validateTerminal({ status, terminalBundle, plan, artifactAccepted });
  } catch {
    return buildNoClaimControllerResult({
      plan,
      resultCode: classifyControllerCloseout({ receiptValid: false }),
      closeoutPublisher,
      clock
    });
  }
  const runnerCleanupVerified = await closeoutPublisher.cleanupAndReadBackRunnerMaterial({ plan });
  if (runnerCleanupVerified !== true) throw new Error("production_controller_cleanup_invalid");
  const immutable = buildControllerCloseout(
    closeoutPublisher.toControllerCloseoutInput({ plan, terminal, runnerCleanupVerified })
  );
  const closeoutBindings = closeoutPublisher.expectedBindings({ plan });
  validateControllerCloseoutBytes(immutable.bytes, closeoutBindings);

  const uploadStartedRequest = await closeoutPublisher.createUploadStartedRequest({
    plan,
    immutable
  });
  const uploadStartedResult = await transport.request(uploadStartedRequest);
  const uploadStartedStatus = closeoutPublisher.validateUploadStartedResponse({
    transportResult: uploadStartedResult,
    immutable,
    expected: closeoutBindings
  });

  const local = await closeoutPublisher.writeImmutableLocalFile(immutable);
  const uploaded = await closeoutPublisher.uploadActionsArtifact({
    immutable,
    localHandle: local
  });
  const observation = await closeoutPublisher.readBackExactActionsArtifact({ uploaded, immutable, plan });
  if (await closeoutPublisher.deleteLocalFileAndReadBackAbsent(local) !== true) {
    throw new Error("production_controller_cleanup_invalid");
  }

  const ackRequest = await closeoutPublisher.createAckRequest({
    plan,
    immutable,
    observation,
    uploadStartedStatus
  });
  const ackResult = await transport.request(ackRequest);
  let ackStatus = null;
  try {
    ackStatus = closeoutPublisher.validateAckResponse({
      transportResult: ackResult,
      immutable,
      observation,
      uploadStartedStatus,
      expected: closeoutBindings
    });
  } catch (error) {
    if (!isPossiblyLostCloseoutResponse(ackResult, error)) throw error;
  }
  const committedRead = closeoutPublisher.createCommittedStatusRequest({
    plan,
    immutable,
    observation,
    ackStatus
  });
  const committedStatusResult = await transport.request(committedRead.transportRequest);
  const committedStatus = closeoutPublisher.validateUploadCommittedObserved({
    transportResult: committedStatusResult,
    immutable,
    observation,
    terminal,
    ackStatus,
    expectedStatus: committedRead.expectedStatus
  });

  const resultCode = immutable.value.controllerResult;
  if (!RESULT_CODES.has(resultCode)) throw new Error("production_controller_result_invalid");
  const finalStatus = buildControllerFinalStatus({
    controllerCloseoutBytes: immutable.bytes,
    closeoutBindings,
    actionsArtifactObservation: observation,
    validatedFinalHostStatus: committedStatus,
    artifactReleaseTag: plan.artifact.releaseTag,
    backupResult: terminal.backupResult,
    observedAt: clock.now().toISOString()
  });
  return Object.freeze({
    resultCode,
    controllerRecoveryId: plan.controllerRecoveryId,
    closeoutSha256: immutable.sha256,
    finalStatusBytes: finalStatus.bytes,
    finalStatusSha256: finalStatus.sha256
  });
  } finally {
    await transport.close();
  }
}
```

- [ ] **Step 4: Add mismatch, response-loss, terminal-state, and no-leak tests**

```js
test("controller rejects Gate mismatch before opening transport", async () => {
  let opened = false;
  let closed = 0;
  await assert.rejects(() => runProductionController(controllerFixture({
    gateReceiptBytes: mutatedGateBytes(),
    transport: {
      execute: async () => { opened = true; },
      request: async () => { opened = true; },
      requestBootstrap: async () => { opened = true; },
      close: async () => { closed += 1; }
    }
  })), /production_controller_binding_invalid/);
  assert.equal(opened, false);
  assert.equal(closed, 1);
});

test("connection loss after artifact polls status and a nonterminal timeout makes no production claim", async () => {
  const closeoutUploads = [];
  const closeoutTransitions = [];
  const fixture = controllerFixture({
    transport: transportFixture({ lostArtifactAcceptedAck: true, statusRemainsNonterminal: true }),
    closeoutPublisher: controllerCloseoutFixture({ closeoutUploads, closeoutTransitions })
  });
  const result = await runProductionController(fixture);
  assert.equal(result.resultCode, "controller_incomplete_no_production_claim");
  assert.match(result.closeoutSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(closeoutUploads, []);
  assert.deepEqual(closeoutTransitions, []);
  assert.equal(fixture.transportExecuteCount, 1);
  assert.equal(fixture.transportCloseCount, 1);
});

test("no-claim receipt-invalid and nonterminal timeout return only Receipt-built final status bytes", async () => {
  for (const fault of ["invalid_receipt", "nonterminal_timeout"]) {
    const fixture = controllerFixture({ fault });
    const result = await runProductionController(fixture);
    assert.match(result.closeoutSha256, /^[0-9a-f]{64}$/);
    assert.equal(fixture.uploadStartedRequests.length, 0);
    assert.equal(fixture.actionsArtifactUploads.length, 0);
    assert.equal(fixture.ackRequests.length, 0);
    assert.equal(result.finalStatusSha256, sha256Hex(result.finalStatusBytes));
    validateControllerFinalStatus(result.finalStatusBytes, fixture.expectedFinalStatus);
  }
});

test("an arbitrary durable rejection can never become no-transaction admission rejection", async () => {
  const fixture = controllerFixture({ fault: "unowned_durable_rejection" });
  await assert.rejects(
    () => runProductionController(fixture),
    /production_controller_durable_rejection_invalid/
  );
  assert.equal(fixture.closeoutPublisher.createNoClaimEvidenceCalls.length, 0);
  assert.equal(fixture.uploadStartedRequests.length, 0);
  assert.equal(fixture.actionsArtifactUploads.length, 0);
  assert.equal(fixture.ackRequests.length, 0);
  const unbrandedAdmissionFailure = Object.freeze({ admissionAccepted: false });
  assert.throws(
    () => classifyControllerCloseout(unbrandedAdmissionFailure),
    /controller_closeout_classification_invalid/
  );
  assert.equal(
    classifyControllerCloseout({ preAdmissionDurableRejection: true, admissionAccepted: false }),
    "admission_rejected_no_transaction"
  );
});

test("critical transitional rejection continues polling until one immutable bundle", async () => {
  const fixture = controllerFixture({
    transport: transportFixture({
      ordinaryStatusSequence: [
        "terminal_quiescence_rejected",
        "terminal_quiescence_pending",
        "critical_immutable_terminal"
      ]
    })
  });
  const result = await runProductionController(fixture);
  assert.equal(result.resultCode, "validated_critical_failure");
  assert.equal(fixture.terminalBundleSessions, 1);
  assert.equal(fixture.uploadStartedRequests.length, 1);
  assert.equal(fixture.actionsArtifactUploads.length, 1);
  assert.equal(fixture.ackRequests.length, 1);
});

test("critical transitional rejection at the absolute deadline stays incomplete", async () => {
  const fixture = controllerFixture({
    transport: transportFixture({ statusRemainsTerminalQuiescenceRejected: true }),
    clock: absoluteDeadlineClockFixture()
  });
  const result = await runProductionController(fixture);
  assert.equal(result.resultCode, "controller_incomplete_no_production_claim");
  assert.equal(fixture.terminalBundleSessions, 0);
  assert.equal(fixture.uploadStartedRequests.length, 0);
  assert.equal(fixture.actionsArtifactUploads.length, 0);
  assert.equal(fixture.ackRequests.length, 0);
});

test("controller rejects every invalid public transport result envelope", async () => {
  for (const fault of ["raw_buffer", "extra_key", "zero_with_diagnostic", "nonzero_with_bytes", "unknown_diagnostic", "oversized_response"]) {
    await assert.rejects(
      () => runProductionController(controllerFixture({ transportResultFault: fault })),
      /(?:transport_envelope_invalid|production_controller_transport_failed)/
    );
  }
});

test("closeout transitions use distinct one-use OIDC requests through transport.request", async () => {
  const fixture = controllerFixture();
  const result = await runProductionController(fixture);
  assert.equal(result.resultCode, "validated_deployment");
  assert.deepEqual(fixture.requestedTransitions, ["upload_started", "upload_committed_observed"]);
  assert.notEqual(fixture.transitionTokenDigests[0], fixture.transitionTokenDigests[1]);
  for (const call of fixture.transportCalls) {
    for (const forbidden of ["host", "port", "user", "privateKey", "knownHosts", "command", "executable"]) {
      assert.equal(Object.hasOwn(call, forbidden), false);
    }
  }
  assert.deepEqual(fixture.actionsArtifactUploads, [{
    artifactName: `control-plane-controller-closeout-${fixture.controllerRecoveryId}-${fixture.runId}-1`,
    fileName: `controller-closeout-${result.closeoutSha256}.json`,
    fileCount: 1,
    retentionDays: 35
  }]);
  assert.equal(fixture.transportCloseCount, 1);
  assert.equal(fixture.secretMaterializerCalls.length, 1);
});

test("lost closeout responses never replay and post-commit ACK loss converges by status", async () => {
  for (const fault of ["upload_started_response_lost_before_commit", "ack_response_lost_after_commit"]) {
    const fixture = controllerFixture({ fault });
    const result = await runProductionController(fixture);
    assert.ok(fixture.uploadStartedRequests.length <= 1);
    assert.ok(fixture.ackRequests.length <= 1);
    assert.equal(fixture.committedStatusRequests.length, fault.endsWith("after_commit") ? 1 : 0);
    assert.equal(result.resultCode, fault.endsWith("after_commit")
      ? "validated_deployment"
      : "controller_incomplete_no_production_claim");
    assert.equal(fixture.transportCloseCount, 1);
  }
});

test("real Bootstrap envelopes and Receipt closeout/final-status builders compose without fixture mappers", async () => {
  const fixture = realCrossOwnerControllerFixture({
    transportContractModule: await import("../services/deployment/control-plane-transport-contract.mjs"),
    hostProtocolModule: await import("../services/deployment/control-plane-host-protocol.mjs"),
    receiptModule: await import("../services/deployment/control-plane-controller-closeout.mjs"),
    receiptAdapterModule: await import("../services/deployment/control-plane-controller-closeout-adapter.mjs")
  });
  const result = await runProductionController(fixture);
  assert.equal(result.resultCode, "validated_deployment");
  assert.equal(result.finalStatusSha256, sha256Hex(result.finalStatusBytes));
  assert.equal(fixture.executeAuthFrameKeys.join(","), "type,deploymentPlanBytesBase64,productionGateReceiptBytesBase64,authorizationRecordBytesBase64,oidcTokenBytesBase64");
  assert.equal(fixture.executeExpectedReadyWasValueNotBytes, true);
  assert.equal(fixture.hostAcceptedPlanReadBackBeforeReady, true);
  assert.deepEqual(fixture.artifactAcceptedKeys, [
    "gateId", "deploymentPlanSha256", "transactionId", "acceptedAt", "accepted"
  ]);
  assert.equal(fixture.terminalInvocationSha256, fixture.finalStatusInvocationSha256);
  assert.deepEqual(fixture.verifiedOidcWorkflowClaimKeys, ["workflow_ref", "workflow_sha"]);
  assert.equal(fixture.verifiedOidcClaims.nbf <= fixture.verifiedOidcClaims.iat, true);
  assert.equal(fixture.verifiedOidcClaims.iat <= fixture.verifiedOidcClaims.exp, true);
  assert.equal(fixture.hostProtocolModule.TERMINAL_BUNDLE_CHUNK_BYTES, 768);
  assert.equal(fixture.hostProtocolModule.TERMINAL_BUNDLE_MAX_BYTES, 262_144);
  assert.equal(fixture.hostProtocolModule.TERMINAL_BUNDLE_MAX_CHUNKS, 342);
  assert.equal(fixture.bootstrapTerminalStatusIdentityPreserved, true);
  assert.ok(fixture.terminalBundleRequestCount >= 2);
  validateControllerFinalStatus(result.finalStatusBytes, fixture.expectedFinalStatus);
});

for (const resultCode of ["validated_deployment", "validated_stopped_pre_switch", "validated_schema_only_change", "validated_rolled_back", "validated_critical_failure"]) {
  test(`controller preserves closed terminal state ${resultCode}`, async () => {
    const result = await runProductionController(controllerFixture({ transport: transportFixture({ resultCode }) }));
    assert.equal(result.resultCode, resultCode);
  });
}
```

- [ ] **Step 5 (5 min): Add the explicit Bootstrap/Receipt integration adapter**

```js
import {
  DEPLOY_CREDENTIAL_ID,
  createSecureSshTransport
} from "./control-plane-transport-contract.mjs";
import { createControllerCloseoutAdapter } from "./control-plane-controller-closeout-adapter.mjs";

export function createProductionIntegrationAdapters({
  native,
  clock,
  secretMaterializer,
  transitionOidc,
  runnerMaterialStore,
  actionsArtifactClient
}) {
  if (typeof secretMaterializer?.materializeFixedCredential !== "function") {
    throw new Error("production_integration_materializer_invalid");
  }
  return Object.freeze({
    credentialId: DEPLOY_CREDENTIAL_ID,
    transport: createSecureSshTransport({ native, clock, secretMaterializer }),
    closeoutPublisher: createControllerCloseoutAdapter({
      runnerMaterialStore,
      actionsArtifactClient,
      requestOidcToken: (binding) => transitionOidc.requestOneUse(binding),
      clock
    })
  });
}
```

```js
test("integration adapter composes only lazy Bootstrap transport and Receipt closeout", () => {
  const adapters = createProductionIntegrationAdapters(integrationFixture());
  assert.deepEqual(Object.keys(adapters), ["credentialId", "transport", "closeoutPublisher"]);
  assert.equal(adapters.credentialId, "japan-control-plane-github-deploy-v1");
  assert.deepEqual(Object.keys(adapters.transport).sort(), [
    "close", "execute", "request", "requestBootstrap", "requestStatusBundle"
  ]);
  assert.equal(integrationFixture().secretMaterializerCalls.length, 0);
});
```

- [ ] **Step 6 (5 min): Implement the execute-only CLI and bounded aggregate output**

```js
import { canonicalizeDatabaseContracts } from "../server/services/deployment/database-contract.mjs";
import {
  assertKnownHostsRecordExpectation,
  createFixedCredentialExpectation,
  DEPLOY_CREDENTIAL_ID,
  deriveKnownHostsBinding,
  FIXED_CREDENTIAL_EXPECTATION_CONTRACT,
  FIXED_CREDENTIAL_EXPECTATION_FIELDS,
  FIXED_CREDENTIAL_MATERIAL_FIELDS,
  validateFixedCredentialMaterial
} from "../server/services/deployment/control-plane-transport-contract.mjs";
import {
  deriveProductionAuthorizationOidcAudience,
  validateProductionAuthorizationRecord
} from "../server/services/deployment/control-plane-production-authorization.mjs";
import {
  CONTROLLER_FINAL_STATUS_CONTRACT,
  validateControllerFinalStatus
} from "../server/services/deployment/control-plane-controller-closeout.mjs";
import { CONTROLLER_RESULTS } from "../server/services/deployment/control-plane-receipt-contract.mjs";

const RESULT_CODES = new Set(CONTROLLER_RESULTS);

const CONTROLLER_SAFE_RESULT_CONTRACT = Object.freeze({
  schemaId: "control-plane-controller-safe-result-v1",
  maxBytes: 1_024,
  fieldOrder: Object.freeze([
    "resultCode", "controllerRecoveryId", "closeoutSha256", "finalStatusSha256"
  ]),
  nested: Object.freeze({}),
  arrays: Object.freeze({}),
  validate(value) {
    if (!RESULT_CODES.has(value.resultCode)
      || !/^cr1\.[0-9a-f]{64}$/.test(value.controllerRecoveryId)
      || !/^[0-9a-f]{64}$/.test(value.closeoutSha256)
      || !/^[0-9a-f]{64}$/.test(value.finalStatusSha256)) {
      throw new Error("production_controller_safe_result_invalid");
    }
  }
});

function createLazyDeploySecretMaterializer({ env, authorization, clock }) {
  let used = false;
  return Object.freeze({
    async materializeFixedCredential(credentialId) {
      if (used || credentialId !== DEPLOY_CREDENTIAL_ID) {
        throw new Error("production_controller_credential_invalid");
      }
      used = true;
      const names = [
        "JAPAN_CONTROL_DEPLOY_HOST",
        "JAPAN_CONTROL_DEPLOY_PORT",
        "JAPAN_CONTROL_DEPLOY_USER",
        "JAPAN_CONTROL_DEPLOY_PRIVATE_KEY",
        "JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS"
      ];
      const values = Object.fromEntries(names.map((name) => [name, env[name]]));
      for (const name of names) delete env[name];
      let privateKeyBytes = null;
      let knownHostsBytes = null;
      try {
        privateKeyBytes = Buffer.from(values.JAPAN_CONTROL_DEPLOY_PRIVATE_KEY, "utf8");
        knownHostsBytes = Buffer.from(values.JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS, "utf8");
        const host = values.JAPAN_CONTROL_DEPLOY_HOST;
        const port = Number(values.JAPAN_CONTROL_DEPLOY_PORT);
        const binding = deriveKnownHostsBinding({ host, port, knownHostsBytes });
        const material = Object.freeze({
          credentialId: DEPLOY_CREDENTIAL_ID,
          host: binding.host,
          port: binding.port,
          user: values.JAPAN_CONTROL_DEPLOY_USER,
          authorizationGeneration: authorization.value.authorizationGeneration,
          bootstrapReceiptSha256: authorization.value.bootstrapReceiptSha256,
          knownHostsFingerprint: binding.knownHostsFingerprint,
          knownHostsTupleSha256: binding.knownHostsTupleSha256,
          expiresAt: authorization.value.expiresAt,
          privateKeyBytes,
          knownHostsBytes
        });
        if (Object.keys(material).some((key, index) => key !== FIXED_CREDENTIAL_MATERIAL_FIELDS[index])) {
          throw new Error("production_controller_credential_invalid");
        }
        const expectation = createFixedCredentialExpectation({
          credentialId: DEPLOY_CREDENTIAL_ID,
          authorizationGeneration: authorization.value.authorizationGeneration,
          bootstrapReceiptSha256: authorization.value.bootstrapReceiptSha256,
          knownHostsFingerprint: binding.knownHostsFingerprint,
          knownHostsTupleSha256: binding.knownHostsTupleSha256,
          expiresAt: authorization.value.expiresAt,
          observedAt: clock.now().toISOString()
        });
        if (Object.keys(expectation).some((key, index) => key !== FIXED_CREDENTIAL_EXPECTATION_FIELDS[index])) {
          throw new Error("production_controller_credential_expectation_invalid");
        }
        FIXED_CREDENTIAL_EXPECTATION_CONTRACT.validate(expectation);
        assertKnownHostsRecordExpectation({ binding, material });
        validateFixedCredentialMaterial(material, expectation);
        return Object.freeze({ material, expectation });
      } catch (error) {
        privateKeyBytes?.fill(0);
        knownHostsBytes?.fill(0);
        throw error;
      }
    }
  });
}

export async function runProductionControllerCli({ argv, env, stdout, stderr, operations }) {
  const [operation, ...tokens] = argv;
  if (operation !== "execute") throw new Error("production_controller_operation_invalid");
  const flags = parseClosedFlags(tokens, [
    "plan", "gate-receipt", "artifact", "postapproval-evidence", "authorization-record", "closeout-directory", "retention-days", "final-status-output", "github-output"
  ]);
  if (flags["retention-days"] !== "35") throw new Error("production_controller_retention_invalid");
  const inputs = operations.readAndVerifyInputs(flags);
  const planDatabase = canonicalizeDatabaseContracts(inputs.plan.databaseContracts);
  if (planDatabase.sha256 !== inputs.postapprovalEvidence.databaseContractsSha256) {
    throw new Error("production_controller_database_contract_drift");
  }
  const authorization = validateProductionAuthorizationRecord({
    bytes: inputs.authorizationRecordBytes,
    expected: Object.freeze({
      deploymentPlanSha256: sha256Hex(inputs.planBytes),
      databaseContractsSha256: planDatabase.sha256,
      sourceSha: inputs.plan.sourceCommit,
      runId: String(inputs.postapprovalEvidence.runIdentity.runId),
      runAttempt: 1
    }),
    now: operations.clock.now().toISOString()
  });
  const audience = deriveProductionAuthorizationOidcAudience(authorization.sha256);
  const oidcToken = await operations.requestOidcToken({
    audience,
    requestUrl: env.ACTIONS_ID_TOKEN_REQUEST_URL,
    requestToken: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  });
  try {
    const { transport, closeoutPublisher } = operations.createProductionIntegrationAdapters({
      native: operations.native,
      clock: operations.clock,
      secretMaterializer: createLazyDeploySecretMaterializer({ env, authorization, clock: operations.clock }),
      transitionOidc: operations.createTransitionOidcRequester({ env, authorizationRecordSha256: authorization.sha256 }),
      runnerMaterialStore: operations.runnerMaterialStore,
      actionsArtifactClient: operations.actionsArtifactClient
    });
    const result = await runProductionController({
      ...inputs,
      oidcToken,
      githubEvidence: { ...inputs.postapprovalEvidence, authorizationRecordBytes: inputs.authorizationRecordBytes, oidcAudience: audience },
      transport,
      closeoutPublisher,
      clock: operations.clock
    });
    const finalStatusSink = operations.createFinalStatusSink({
      path: flags["final-status-output"],
      contract: CONTROLLER_FINAL_STATUS_CONTRACT
    });
    await finalStatusSink.writeExact({
      bytes: result.finalStatusBytes,
      sha256: result.finalStatusSha256
    });
    const finalStatusBytes = await finalStatusSink.readBackExact();
    if (!finalStatusBytes.equals(result.finalStatusBytes)
      || sha256Hex(finalStatusBytes) !== result.finalStatusSha256) {
      throw new Error("production_controller_final_status_readback_invalid");
    }
    validateControllerFinalStatus(finalStatusBytes, operations.expectedControllerFinalStatus({
      result,
      inputs,
      authorization
    }));
    operations.appendGitHubOutputs(flags["github-output"], {
      final_status_available: "true",
      deploy_note_eligible: DEPLOY_NOTE_RESULTS.has(result.resultCode) ? "true" : "false"
    });
    const safeResult = Object.freeze({
      resultCode: result.resultCode,
      controllerRecoveryId: result.controllerRecoveryId,
      closeoutSha256: result.closeoutSha256,
      finalStatusSha256: result.finalStatusSha256
    });
    stdout.write(`${serializeCanonicalJsonBytes(safeResult, CONTROLLER_SAFE_RESULT_CONTRACT).toString("utf8")}\n`);
    return result.resultCode === "validated_deployment" ? 0 : 2;
  } finally {
    operations.destroySensitiveValue(oidcToken);
    await operations.closeArtifactInput(inputs.artifactStream);
  }
}
```

- [ ] **Step 7 (5 min): Test CLI flags, lazy secret boundaries, zero raw-token output, and closeout-on-failure**

```js
test("execute CLI accepts only fixed files and never serializes transport inputs", async () => {
  const output = [];
  const fixture = controllerCliFixture({ stdout: { write: (value) => output.push(value) } });
  const code = await runProductionControllerCli(fixture);
  assert.equal(code, 0);
  assert.match(output.join(""), /"resultCode":"validated_deployment"/);
  for (const forbidden of ["PRIVATE KEY", "known-host", "oidc-token", "/srv/"]) {
    assert.equal(output.join("").includes(forbidden), false);
  }
  assert.deepEqual(fixture.materializerEvents, ["probe", "materialize:japan-control-plane-github-deploy-v1", "transport:close", "zeroize"]);
  assert.deepEqual(fixture.materializedCredentialKeys, [
    "credentialId", "host", "port", "user", "authorizationGeneration",
    "bootstrapReceiptSha256", "knownHostsFingerprint", "knownHostsTupleSha256",
    "expiresAt", "privateKeyBytes", "knownHostsBytes"
  ]);
  assert.equal(fixture.fixedCredentialValidatorCalls, 1);
  assert.equal(fixture.operationCredentialCloneCount, fixture.transportOperationCount);
  assert.equal(fixture.nonAliasedOperationCredentialClones, true);
  assert.equal(fixture.allOperationClonesZeroizedAndClosed, true);
  assert.equal(fixture.retainedCredentialZeroizedAndClosed, true);
  assert.deepEqual(fixture.finalStatusSinkEvents, ["write", "readback"]);
  assert.equal(fixture.artifactInputClosed, true);
});

for (const failedAttempt of [
  "validated_stopped_pre_switch",
  "validated_schema_only_change",
  "validated_rolled_back",
  "validated_critical_failure"
]) {
  test(`execute CLI preserves ${failedAttempt} evidence but exits nonzero`, async () => {
    const code = await runProductionControllerCli(controllerCliFixture({ resultCode: failedAttempt }));
    assert.equal(code, 2);
  });
}
```

- [ ] **Step 8 (3 min): Run controller tests and verify GREEN**

Run:

```powershell
node --check server/services/deployment/control-plane-production-controller.mjs
node --check server/services/deployment/control-plane-production-integration-adapter.mjs
node --check scripts/control-plane-production-controller.mjs
node --test server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-integration-adapter.test.mjs server/tests/control-plane-production-controller-cli.test.mjs
```

Expected: all commands exit 0; tests prove immutable binding, admission-before-artifact ordering, exact ready/accepted/status bindings, bounded Bootstrap-owned terminal-bundle retrieval, closed terminal/no-claim mapping, response-loss recovery identity, separate ACK/committed-status validation, one transport close, secret destruction, aggregate-only output, and that only `validated_deployment` yields a successful workflow process exit.

- [ ] **Step 9 (2 min): Commit the workflow-side controller**

```powershell
git add -- server/services/deployment/control-plane-production-controller.mjs server/services/deployment/control-plane-production-integration-adapter.mjs scripts/control-plane-production-controller.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-integration-adapter.test.mjs server/tests/control-plane-production-controller-cli.test.mjs
git commit -m "feat: add control plane production controller"
```

---

### Task 12: Manual protected production workflow and isolated Deploy Note

**Files:**
- Create: `.github/workflows/japan-control-plane-production-deploy.yml`
- Create: `scripts/control-plane-deploy-note.mjs`
- Create: `server/tests/control-plane-production-deploy-workflow.test.mjs`
- Create: `server/tests/control-plane-deploy-note.test.mjs`
- Create: `server/tests/control-plane-controller-output-deploy-note.integration.test.mjs`
- Modify: `scripts/control-plane-production-preflight.mjs`
- Modify: `scripts/control-plane-postapproval-check.mjs`
- Modify: `server/tests/control-plane-production-preflight.test.mjs`
- Modify: `server/tests/control-plane-postapproval-check.test.mjs`

**Workflow CLI interfaces:**
- Consumes Receipt-owned `CONTROLLER_FINAL_STATUS_CONTRACT`, `buildControllerFinalStatus`, `validateControllerFinalStatus`, and test-only `makeControllerFinalStatusFixture(...)` from `server/tests/helpers/control-plane-receipt-fixtures.mjs`; Artifact declares no competing final-status contract or parser.
- `node scripts/control-plane-production-preflight.mjs preflight --production-gate-id <pg1...> --run-id <id> --run-attempt 1 --actor <login> --triggering-actor <login> --trusted-checkout <directory> --expected-source-commit <40hex> --output <directory> --github-output <file>` runs only from the workflow-dispatch event commit checked out with exact `ref: ${{ github.sha }}`. Every trusted script is therefore loaded from immutable event commit S, never from a mutable branch checkout. The preflight reads current master before and after all Release/check/policy evidence; both reads must equal S. An S→S2 race causes a read-only `github_master_drift` stop, writes no packet/output, materializes no production/Environment secret, OIDC token, or host credential, and never checks out, fetches, resets, or follows S2. Its read-only `GITHUB_TOKEN` is the only credential available. On success it writes a data-only packet containing canonical plan/Gate/artifact/evidence bytes and only `controller_recovery_id` plus `source_commit` GitHub outputs; no script, native binary, checksum program, token, or secret is copied into the packet.
- `node scripts/control-plane-postapproval-check.mjs verify ... --input <directory> --output <file>` is the first protected custom step. It runs from exact S, re-reads current master, current Environment policy including explicit admin-bypass and stable reviewer identities, current approval plus user/team membership, exhaustive current ruleset requirements, and exact-SHA successful check tuples, requires byte-equal packet/inventory/plan/HMAC bindings, and writes canonical postapproval evidence without reading a secret. Any master drift stops; it never follows the branch. `authorize --postapproval-evidence <file> --scope-attestation <file> --output <file>` validates exact scope-attestation bytes, internally generates and zeroizes a 32-byte cryptographic nonce, then creates the unique canonical authorization record; no nonce or digest can be supplied by a workflow input or environment variable.
- `node scripts/control-plane-deploy-note.mjs record --repository gccwebos-com/proxy-gateway-minimal --run-id <id> --run-attempt 1 --final-status <file>` calls Receipt-owned `validateControllerFinalStatus(bytes, expected)` on the downloaded bytes, renders result-specific text only for a validated terminal result, and writes at most one bounded comment to the single merged PR. No-claim and nonterminal outcomes return a canonical no-op and perform no GitHub write.
- The controller step maps only the fixed five secret-bearing transport leaves (`HOST`, `PORT`, `USER`, `PRIVATE_KEY`, `KNOWN_HOSTS`). The already validated authorization file supplies `authorizationGeneration`, `bootstrapReceiptSha256`, and `expiresAt`; Bootstrap's known-host parser derives the fingerprint and tuple digest; the fixed credential ID supplies `credentialId`. Together they form the exact ordered 11-field Bootstrap record, which the real owner validator checks before any spawn. No extra Environment variable or caller-selected metadata field widens this custody interface.

- [ ] **Step 1: Write the failing production workflow trigger and permission tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../../.github/workflows/japan-control-plane-production-deploy.yml", import.meta.url);

function shellRunBlocks(workflow) {
  const lines = workflow.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*\|\s*$/.exec(lines[index]);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    while (++index < lines.length && (lines[index].trim() === "" || lines[index].search(/\S/) > indent)) body.push(lines[index]);
    blocks.push(body.join("\n"));
    index -= 1;
  }
  return blocks;
}

function jobBlock(workflow, jobId) {
  const start = workflow.indexOf(`  ${jobId}:\n`);
  if (start < 0) throw new Error(`missing job ${jobId}`);
  const tail = workflow.slice(start + 2);
  const next = tail.search(/^  [a-z0-9-]+:\n/m);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 2 + next);
}

function inputBlock(workflow) {
  const start = workflow.indexOf("    inputs:\n");
  const end = workflow.indexOf("\npermissions:", start);
  if (start < 0 || end < 0) throw new Error("missing workflow_dispatch inputs");
  return workflow.slice(start, end);
}

test("production workflow is manual-only with exact Gate and confirmation inputs", async () => {
  const workflow = await readFile(path, "utf8");
  assert.match(workflow, /^name: Japan Control Plane Production Deploy$/m);
  assert.match(workflow, /^on:\n  workflow_dispatch:\n    inputs:\n      production_gate_id:/m);
  assert.match(workflow, /deploy japan control-plane production/);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|schedule|workflow_call|repository_dispatch):/m);
  assert.match(workflow, /group: japan-control-plane-production-authority/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("production, OIDC, and PR-write capabilities remain isolated", async () => {
  const workflow = await readFile(path, "utf8");
  const preflight = jobBlock(workflow, "preflight");
  const deploy = jobBlock(workflow, "deploy");
  const deployNote = jobBlock(workflow, "deploy-note");
  assert.doesNotMatch(preflight, /environment:|id-token: write|secrets\./);
  assert.match(preflight, /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(preflight, /ref: refs\/heads\/master|git (?:checkout|switch|fetch|pull|reset)|needs\.preflight\.outputs\.source_commit/);
  assert.match(deploy, /environment: vultr-japan-production/);
  assert.match(deploy, /id-token: write/);
  assert.doesNotMatch(deploy, /pull-requests: write|contents: write/);
  assert.match(deployNote, /pull-requests: write/);
  assert.doesNotMatch(deployNote, /environment:|id-token: write|secrets\.|JAPAN_CONTROL_DEPLOY_/);
  for (const run of shellRunBlocks(workflow)) assert.doesNotMatch(run, /\$\{\{\s*inputs\./);
  assert.doesNotMatch(workflow, /preflight-packet\/control\/scripts|preflight-packet\/.*\.(?:mjs|js|sh)/);
  assert.match(deploy, /ref: \$\{\{ needs\.preflight\.outputs\.source_commit \}\}/);
});

test("S to S2 preflight race never follows mutable master or gains secret access", async () => {
  const sourceCommit = "a".repeat(40);
  const movedCommit = "b".repeat(40);
  const fixture = productionPreflightCliFixture({
    checkoutHead: sourceCommit,
    githubSha: sourceCommit,
    currentMasterSequence: [sourceCommit, movedCommit]
  });
  await assert.rejects(() => runProductionPreflightCli(fixture), /production_preflight_github_master_drift/);
  assert.deepEqual(fixture.checkoutRefs, [sourceCommit]);
  assert.deepEqual(fixture.checkoutFollowRequests, []);
  assert.deepEqual(fixture.packetWrites, []);
  assert.deepEqual(fixture.githubOutputWrites, []);
  assert.deepEqual(fixture.secretMaterializerCalls, []);
  assert.deepEqual(fixture.oidcRequests, []);
});

test("every exported Artifact canonical contract uses the exact Foundation ABI", async () => {
  const contracts = await loadExportedArtifactCanonicalContracts();
  for (const contract of contracts) {
    assert.deepEqual(Object.keys(contract), [
      "schemaId", "maxBytes", "fieldOrder", "nested", "arrays", "validate"
    ]);
    assert.equal(typeof contract.schemaId, "string");
    assert.ok(Number.isSafeInteger(contract.maxBytes) && contract.maxBytes > 0);
    assert.ok(Array.isArray(contract.fieldOrder));
    assert.equal(Object.getPrototypeOf(contract.nested), Object.prototype);
    assert.equal(Object.getPrototypeOf(contract.arrays), Object.prototype);
    assert.equal(typeof contract.validate, "function");
  }
  const legacyContract = Object.freeze(Object.fromEntries([
    ["type", "object"], ["fields", Object.freeze([])]
  ]));
  assert.throws(() => serializeCanonicalJsonBytes({}, legacyContract), /(?:validate|fieldOrder|maxBytes)/);
});
```

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
node --test server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs
```

Expected: FAIL with `ENOENT` for `.github/workflows/japan-control-plane-production-deploy.yml`.

- [ ] **Step 3: Add exact preflight and post-approval CLI adapters**

```js
function parseRunIdentity(flags) {
  const sourceCommit = flags["expected-source-commit"];
  const actor = flags.actor?.toLowerCase();
  const triggeringActor = flags["triggering-actor"]?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)
    || !/^[1-9][0-9]{0,19}$/.test(flags["run-id"])
    || flags["run-attempt"] !== "1"
    || !/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(actor ?? "")
    || !/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(triggeringActor ?? "")) {
    throw new Error("production_run_identity_invalid");
  }
  return Object.freeze({
    repository: "gccwebos-com/proxy-gateway-minimal",
    ref: "refs/heads/master",
    sourceCommit,
    workflowSha: sourceCommit,
    runId: flags["run-id"],
    runAttempt: 1,
    actor,
    triggeringActor
  });
}

export async function writePreflightPacket({ outputDirectory, result, packetStore }) {
  const files = Object.freeze([
    Object.freeze({ name: "control-plane-app.zip", bytes: result.artifactIdentity.artifactBytes, executable: false }),
    Object.freeze({ name: "deployment-plan.json", bytes: result.deploymentPlanBytes, executable: false }),
    Object.freeze({ name: "preapproval-evidence.json", bytes: result.preapprovalEvidenceBytes, executable: false }),
    Object.freeze({ name: "production-gate.json", bytes: result.productionGateReceiptBytes, executable: false })
  ]);
  if (files.some(({ bytes }) => !Buffer.isBuffer(bytes))) throw new Error("preflight_packet_invalid");
  await packetStore.writeExactDirectory({ outputDirectory, files });
  const observed = await packetStore.readExactDirectory({ outputDirectory, expectedNames: files.map(({ name }) => name) });
  for (const expected of files) {
    const actual = observed.files.find(({ name }) => name === expected.name);
    if (actual === undefined || actual.executable !== false || !actual.bytes.equals(expected.bytes)) {
      throw new Error("preflight_packet_readback_invalid");
    }
  }
  return Object.freeze({
    fileNames: Object.freeze(files.map(({ name }) => name)),
    files: observed.files,
    preapprovalEvidenceSha256: result.preapprovalEvidenceSha256
  });
}

export async function runProductionPreflightCli({ argv, env, stdout, operations }) {
  const [operation, ...tokens] = argv;
  if (operation !== "preflight") throw new Error("production_preflight_operation_invalid");
  const flags = parseClosedFlags(tokens, ["production-gate-id", "run-id", "run-attempt", "actor", "triggering-actor", "trusted-checkout", "expected-source-commit", "output", "github-output"]);
  operations.verifyTrustedCheckout({ root: flags["trusted-checkout"], sourceCommit: flags["expected-source-commit"] });
  const runIdentity = parseRunIdentity(flags);
  const result = await runProductionPreflight({
    repository: "gccwebos-com/proxy-gateway-minimal",
    productionGateId: flags["production-gate-id"],
    token: env.GITHUB_TOKEN,
    fetchFn: operations.fetchFn,
    now: operations.clock.now().toISOString(),
    runIdentity
  });
  await operations.writePreflightPacket({ outputDirectory: flags.output, result });
  operations.assertDataOnlyPacket(flags.output);
  operations.appendGitHubOutputs(flags["github-output"], {
    controller_recovery_id: result.controllerRecoveryId,
    source_commit: result.sourceCommit
  });
  stdout.write(`${serializeCanonicalJsonBytes(safePreflightResult(result), PREFLIGHT_SAFE_RESULT_CONTRACT).toString("utf8")}\n`);
}

export async function runPostApprovalCli({ argv, env, stdout, operations }) {
  const [operation, ...tokens] = argv;
  if (operation === "authorize") {
    const flags = parseClosedFlags(tokens, ["postapproval-evidence", "scope-attestation", "output"]);
    const result = finalizeProductionAuthorization({
      postapprovalEvidenceBytes: operations.readCanonicalFile(flags["postapproval-evidence"]),
      scopeAttestationBytes: operations.readCanonicalFile(flags["scope-attestation"]),
      nonceBytes: operations.secureRandomBytes(32),
      now: operations.clock.now().toISOString()
    });
    operations.writeExactBytes(flags.output, result.authorizationRecordBytes);
    stdout.write(`${serializeCanonicalJsonBytes(safeAuthorizationResult(result), AUTHORIZATION_SAFE_RESULT_CONTRACT).toString("utf8")}\n`);
    return;
  }
  if (operation !== "verify") throw new Error("postapproval_operation_invalid");
  const flags = parseClosedFlags(tokens, ["production-gate-id", "run-id", "run-attempt", "actor", "triggering-actor", "trusted-checkout", "expected-source-commit", "input", "output"]);
  operations.verifyTrustedCheckout({ root: flags["trusted-checkout"], sourceCommit: flags["expected-source-commit"] });
  const result = await runPostApprovalCheck({
    ...operations.readPreflightPacket(flags.input),
    repository: "gccwebos-com/proxy-gateway-minimal",
    productionGateId: flags["production-gate-id"],
    token: env.GITHUB_TOKEN,
    fetchFn: operations.fetchFn,
    now: operations.clock.now().toISOString(),
    runIdentity: parseRunIdentity(flags)
  });
  operations.writeExactBytes(flags.output, result.postapprovalEvidenceBytes);
  stdout.write(`${serializeCanonicalJsonBytes({
    valid: true,
    postapprovalEvidenceSha256: result.postapprovalEvidenceSha256
  }, POSTAPPROVAL_SAFE_RESULT_CONTRACT).toString("utf8")}\n`);
}
```

- [ ] **Step 4: Create the manual production workflow**

```yaml
name: Japan Control Plane Production Deploy

on:
  workflow_dispatch:
    inputs:
      production_gate_id:
        description: Fresh immutable Production Gate ID
        required: true
        type: string
      confirmation:
        description: Type deploy japan control-plane production
        required: true
        type: string

permissions: {}

concurrency:
  group: japan-control-plane-production-authority
  cancel-in-progress: false

jobs:
  preflight:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      attestations: read
      checks: read
      contents: read
      statuses: read
    outputs:
      controller_recovery_id: ${{ steps.plan.outputs.controller_recovery_id }}
      source_commit: ${{ steps.plan.outputs.source_commit }}
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ github.sha }}
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22.22.0'
          cache: npm
      - id: plan
        name: Resolve immutable Gate and build no-secret plan
        shell: bash
        env:
          CONFIRMATION: ${{ inputs.confirmation }}
          GITHUB_TOKEN: ${{ github.token }}
          PRODUCTION_GATE_ID: ${{ inputs.production_gate_id }}
        run: |
          set -euo pipefail
          test "${CONFIRMATION}" = "deploy japan control-plane production"
          test "${GITHUB_REF}" = "refs/heads/master"
          test "${GITHUB_RUN_ATTEMPT}" = "1"
          node scripts/control-plane-production-preflight.mjs preflight \
            --production-gate-id "${PRODUCTION_GATE_ID}" \
            --run-id "${GITHUB_RUN_ID}" \
            --run-attempt "${GITHUB_RUN_ATTEMPT}" \
            --actor "${GITHUB_ACTOR}" \
            --triggering-actor "${GITHUB_TRIGGERING_ACTOR}" \
            --trusted-checkout "${GITHUB_WORKSPACE}" \
            --expected-source-commit "${GITHUB_SHA}" \
            --output "${RUNNER_TEMP}/preflight-packet" \
            --github-output "${GITHUB_OUTPUT}"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-preflight-packet
          path: ${{ runner.temp }}/preflight-packet
          if-no-files-found: error
          retention-days: 1

  deploy:
    needs: preflight
    if: ${{ success() && github.run_attempt == 1 }}
    runs-on: ubuntu-latest
    environment: vultr-japan-production
    permissions:
      actions: read
      attestations: read
      checks: read
      contents: read
      id-token: write
      statuses: read
    outputs:
      final_status_available: ${{ steps.controller.outputs.final_status_available }}
      deploy_note_eligible: ${{ steps.controller.outputs.deploy_note_eligible }}
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ needs.preflight.outputs.source_commit }}
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22.22.0'
      - name: Download exact preflight packet without secrets
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-preflight-packet
          path: ${{ runner.temp }}/preflight-packet
      - name: Recheck approval and immutable evidence before secrets
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.preflight.outputs.source_commit }}
          GITHUB_TOKEN: ${{ github.token }}
          PRODUCTION_GATE_ID: ${{ inputs.production_gate_id }}
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "${EXPECTED_SOURCE_COMMIT}"
          test -z "$(git status --porcelain --untracked-files=no)"
          node scripts/control-plane-postapproval-check.mjs verify \
            --production-gate-id "${PRODUCTION_GATE_ID}" \
            --run-id "${GITHUB_RUN_ID}" \
            --run-attempt "${GITHUB_RUN_ATTEMPT}" \
            --actor "${GITHUB_ACTOR}" \
            --triggering-actor "${GITHUB_TRIGGERING_ACTOR}" \
            --trusted-checkout "${GITHUB_WORKSPACE}" \
            --expected-source-commit "${EXPECTED_SOURCE_COMMIT}" \
            --input "${RUNNER_TEMP}/preflight-packet" \
            --output "${RUNNER_TEMP}/postapproval.json"
      - name: Attest Environment-only authorization scopes
        shell: bash
        env:
          JAPAN_CONTROL_DEPLOY_METADATA_APP_ID: ${{ vars.JAPAN_CONTROL_DEPLOY_METADATA_APP_ID }}
          JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID: ${{ vars.JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID }}
          JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY: ${{ secrets.JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY }}
        run: |
          set -euo pipefail
          node scripts/control-plane-github-scope-attestor.mjs attest \
            --repository "gccwebos-com/proxy-gateway-minimal" \
            --environment "vultr-japan-production" \
            --output "${RUNNER_TEMP}/scope-attestation.json"
      - name: Finalize unique canonical authorization record
        shell: bash
        run: |
          set -euo pipefail
          node scripts/control-plane-postapproval-check.mjs authorize \
            --postapproval-evidence "${RUNNER_TEMP}/postapproval.json" \
            --scope-attestation "${RUNNER_TEMP}/scope-attestation.json" \
            --output "${RUNNER_TEMP}/production-authorization.json"
      - name: Execute approved production controller
        id: controller
        continue-on-error: true
        shell: bash
        env:
          JAPAN_CONTROL_DEPLOY_HOST: ${{ secrets.JAPAN_CONTROL_DEPLOY_HOST }}
          JAPAN_CONTROL_DEPLOY_PORT: ${{ secrets.JAPAN_CONTROL_DEPLOY_PORT }}
          JAPAN_CONTROL_DEPLOY_USER: ${{ secrets.JAPAN_CONTROL_DEPLOY_USER }}
          JAPAN_CONTROL_DEPLOY_PRIVATE_KEY: ${{ secrets.JAPAN_CONTROL_DEPLOY_PRIVATE_KEY }}
          JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS: ${{ secrets.JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS }}
        run: |
          set -euo pipefail
          node scripts/control-plane-production-controller.mjs execute \
            --plan "${RUNNER_TEMP}/preflight-packet/deployment-plan.json" \
            --gate-receipt "${RUNNER_TEMP}/preflight-packet/production-gate.json" \
            --artifact "${RUNNER_TEMP}/preflight-packet/control-plane-app.zip" \
            --postapproval-evidence "${RUNNER_TEMP}/postapproval.json" \
            --authorization-record "${RUNNER_TEMP}/production-authorization.json" \
            --closeout-directory "${RUNNER_TEMP}/closeout" \
            --retention-days "35" \
            --final-status-output "${RUNNER_TEMP}/final-status.json" \
            --github-output "${GITHUB_OUTPUT}"
      - name: Upload aggregate final status only
        if: ${{ steps.controller.outputs.final_status_available == 'true' }}
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: control-plane-final-status-${{ needs.preflight.outputs.controller_recovery_id }}-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ runner.temp }}/final-status.json
          if-no-files-found: error
          retention-days: 1
      - name: Preserve controller conclusion
        if: ${{ steps.controller.outcome != 'success' }}
        shell: bash
        run: exit 1

  deploy-note:
    needs: [preflight, deploy]
    if: ${{ always() && github.run_attempt == 1 && needs.deploy.outputs.deploy_note_eligible == 'true' }}
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10
        with:
          ref: ${{ needs.preflight.outputs.source_commit }}
          persist-credentials: false
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '22.22.0'
          cache: npm
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c
        with:
          name: control-plane-final-status-${{ needs.preflight.outputs.controller_recovery_id }}-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ runner.temp }}/final-status
      - name: Append bounded Deploy Note to the exact merged PR
        shell: bash
        env:
          EXPECTED_SOURCE_COMMIT: ${{ needs.preflight.outputs.source_commit }}
          GITHUB_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          test "$(git rev-parse HEAD)" = "${EXPECTED_SOURCE_COMMIT}"
          test -z "$(git status --porcelain --untracked-files=no)"
          node scripts/control-plane-deploy-note.mjs record \
            --repository "gccwebos-com/proxy-gateway-minimal" \
            --run-id "${GITHUB_RUN_ID}" \
            --run-attempt "${GITHUB_RUN_ATTEMPT}" \
            --final-status "${RUNNER_TEMP}/final-status/final-status.json"
```

- [ ] **Step 5: Write first-step, exact secret set, retention, action-pin, and isolation tests**

```js
test("protected job rechecks before the first secret reference", async () => {
  const workflow = await readFile(path, "utf8");
  const deploy = jobBlock(workflow, "deploy");
  const recheckOffset = deploy.indexOf("Recheck approval and immutable evidence before secrets");
  const firstSecretOffset = deploy.indexOf("secrets.");
  assert.ok(recheckOffset > 0 && firstSecretOffset > recheckOffset);
  assert.equal((deploy.match(/JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY/g) ?? []).length, 1);
  assert.deepEqual(extractControllerCredentialEnvironmentNames(deploy), [
    "JAPAN_CONTROL_DEPLOY_HOST",
    "JAPAN_CONTROL_DEPLOY_PORT",
    "JAPAN_CONTROL_DEPLOY_USER",
    "JAPAN_CONTROL_DEPLOY_PRIVATE_KEY",
    "JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS"
  ]);
  const controllerSource = await readFile(new URL("../../scripts/control-plane-production-controller.mjs", import.meta.url), "utf8");
  assert.match(controllerSource, /FIXED_CREDENTIAL_MATERIAL_FIELDS/);
  assert.match(controllerSource, /FIXED_CREDENTIAL_EXPECTATION_FIELDS/);
  assert.match(controllerSource, /FIXED_CREDENTIAL_EXPECTATION_CONTRACT/);
  assert.match(controllerSource, /createFixedCredentialExpectation/);
  assert.match(controllerSource, /deriveKnownHostsBinding/);
  assert.match(controllerSource, /assertKnownHostsRecordExpectation/);
  assert.match(controllerSource, /validateFixedCredentialMaterial/);
  assert.match(deploy, /--retention-days "35"/);
  assert.match(deploy, /--closeout-directory "\$\{RUNNER_TEMP\}\/closeout"/);
  assert.match(deploy, /--authorization-record "\$\{RUNNER_TEMP\}\/production-authorization\.json"/);
  assert.match(deploy, /--final-status-output "\$\{RUNNER_TEMP\}\/final-status\.json"/);
  assert.doesNotMatch(deploy, /preflight-packet\/control\/scripts|--scope-attestation/);
  for (const match of workflow.matchAll(/uses:\s+([^\s]+)@([^\s]+)/g)) assert.match(match[2], /^[0-9a-f]{40}$/);
});

test("workflow fixes target, release unit, service, Environment, and first attempt", async () => {
  const workflow = await readFile(path, "utf8");
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.equal((workflow.match(/environment: vultr-japan-production/g) ?? []).length, 1);
  for (const forbiddenInput of ["host:", "target:", "service:", "release:", "source_commit:", "expected_current_release:"]) {
    assert.doesNotMatch(inputBlock(workflow), new RegExp(`^      ${forbiddenInput}`, "m"));
  }
  const deployNote = jobBlock(workflow, "deploy-note");
  assert.match(deployNote, /control-plane-final-status-/);
  assert.doesNotMatch(deployNote, /controller-closeout-|closeout-directory|production-gate\.json|control-plane-app\.zip/);
});

test("preflight packet writer accepts only fixed data files", async () => {
  const input = preflightPacketFixture();
  const packet = await writePreflightPacket(input);
  assert.deepEqual(packet.fileNames.sort(), [
    "control-plane-app.zip",
    "deployment-plan.json",
    "preapproval-evidence.json",
    "production-gate.json"
  ]);
  const preapproval = packet.files.find(({ name }) => name === "preapproval-evidence.json");
  assert.equal(sha256Hex(preapproval.bytes), packet.preapprovalEvidenceSha256);
  assert.deepEqual(preapproval.bytes, input.result.preapprovalEvidenceBytes);
  for (const file of packet.files) {
    assert.equal(file.executable, false);
    assert.doesNotMatch(file.name, /(?:^|\/)(?:scripts?|control)(?:\/|$)|\.(?:mjs|js|cjs|sh|ps1|exe|dll|so)$/);
  }
});
```

- [ ] **Step 6: Implement exact merged-PR Deploy Note validation**

```js
import { validateControllerFinalStatus } from "../server/services/deployment/control-plane-controller-closeout.mjs";

export async function recordDeployNote({ repository, runId, runAttempt, finalStatusBytes, token, fetchFn }) {
  if (repository !== "gccwebos-com/proxy-gateway-minimal" || runAttempt !== 1) throw new Error("deploy_note_identity_invalid");
  const status = validateControllerFinalStatus(finalStatusBytes, Object.freeze({
    repository,
    runId: String(runId),
    runAttempt: 1
  }));
  if (String(status.runId) !== String(runId) || status.runAttempt !== 1) throw new Error("deploy_note_status_invalid");
  if (status.terminal !== true || status.validationState !== "validated") {
    return Object.freeze({ recorded: false, reason: "nonterminal_noop" });
  }
  const wording = Object.freeze({
    validated_deployment: "deployment completed and final validation passed",
    validated_stopped_pre_switch: "deployment stopped before switch and the unchanged service was validated",
    validated_schema_only_change: "schema-only transaction completed and final validation passed",
    validated_rolled_back: "deployment rolled back and rollback validation passed",
    validated_critical_failure: "critical failure was durably recorded and the final failure state was validated"
  })[status.resultCode];
  if (!wording) {
    if (["admission_rejected_no_transaction", "receipt_invalid_no_production_claim", "controller_incomplete_no_production_claim"].includes(status.resultCode)) {
      return Object.freeze({ recorded: false, reason: "no_production_claim_noop" });
    }
    throw new Error("deploy_note_result_invalid");
  }
  const pullRequests = await readPullRequestsForCommit({ repository, sourceCommit: status.sourceCommit, token, fetchFn });
  const matches = pullRequests.filter((pr) => pr.merged_at !== null && pr.merge_commit_sha === status.sourceCommit);
  if (matches.length !== 1) throw new Error("deploy_note_pull_request_ambiguous");
  const body = renderBoundedDeployNote({
    deployedAt: status.observedAt,
    releaseUnit: "control-plane-app",
    sourceCommit: status.sourceCommit,
    artifactOrRelease: status.artifactReleaseTag,
    target: "japan-control-plane",
    backup: status.backupResult,
    validation: wording
  });
  await createPullRequestComment({ repository, pullNumber: matches[0].number, body, token, fetchFn });
  return Object.freeze({ recorded: true, pullNumber: matches[0].number, bodySha256: sha256Hex(Buffer.from(body, "utf8")) });
}
```

- [ ] **Step 7: Add missing/ambiguous PR, wrong-run closeout, and safe-body tests**

```js
test("Deploy Note refuses missing, ambiguous, or wrong-attempt evidence", async () => {
  for (const fault of ["missing_pr", "two_merged_prs", "wrong_run", "wrong_attempt", "digest_mismatch"]) {
    await assert.rejects(() => recordDeployNote(deployNoteFixture({ fault })), /deploy_note_/);
  }
});

test("Deploy Note is a no-op for no-claim and nonterminal final status", async () => {
  for (const fault of ["admission_rejected", "receipt_invalid", "controller_incomplete", "nonterminal"]) {
    const fixture = deployNoteFixture({ fault });
    const result = await recordDeployNote(fixture);
    assert.equal(result.recorded, false);
    assert.equal(fixture.createdBodies.length, 0);
  }
});

for (const resultCode of ["validated_deployment", "validated_stopped_pre_switch", "validated_schema_only_change", "validated_rolled_back", "validated_critical_failure"]) {
  test(`Deploy Note uses result-specific wording for ${resultCode}`, async () => {
    const fixture = deployNoteFixture({ resultCode });
    const result = await recordDeployNote(fixture);
    assert.equal(result.recorded, true);
    assert.match(fixture.createdBody, new RegExp(expectedDeployNoteWording(resultCode)));
  });
}

test("Deploy Note contains only the seven fixed aggregate fields", async () => {
  const harness = deployNoteFixture();
  const result = await recordDeployNote(harness);
  assert.equal(result.recorded, true);
  assert.match(harness.createdBody, /deployed_at:/);
  assert.match(harness.createdBody, /release_unit: control-plane-app/);
  for (const forbidden of ["ssh", "/srv/", "database", "PRIVATE KEY", "token"]) {
    assert.equal(harness.createdBody.includes(forbidden), false);
  }
});

for (const resultCode of [
  "validated_deployment", "validated_stopped_pre_switch", "validated_schema_only_change",
  "validated_rolled_back", "validated_critical_failure",
  "admission_rejected_no_transaction", "receipt_invalid_no_production_claim",
  "controller_incomplete_no_production_claim"
]) {
  test(`real controller output ${resultCode} passes unchanged through Receipt validation into Deploy Note`, async () => {
    const controller = realControllerReceiptFixture({ resultCode });
    const controllerResult = await runProductionController(controller);
    assert.equal(controllerResult.finalStatusSha256, sha256Hex(controllerResult.finalStatusBytes));
    const downloadedBytes = Buffer.from(controllerResult.finalStatusBytes);
    const note = deployNoteFixture({
      finalStatusBytes: downloadedBytes,
      runId: controller.runId,
      runAttempt: 1
    });
    const recorded = await recordDeployNote(note);
    assert.deepEqual(downloadedBytes, controllerResult.finalStatusBytes);
    assert.equal(recorded.recorded, resultCode.startsWith("validated_"));
    if (!resultCode.startsWith("validated_")) {
      assert.deepEqual(controller.uploadStartedRequests, []);
      assert.deepEqual(controller.actionsArtifactUploads, []);
      assert.deepEqual(controller.ackRequests, []);
      assert.deepEqual(note.createdBodies, []);
    }
  });
}
```

- [ ] **Step 8: Run production workflow and Deploy Note tests and verify GREEN**

Run:

```powershell
node --check scripts/control-plane-production-preflight.mjs
node --check scripts/control-plane-postapproval-check.mjs
node --check scripts/control-plane-deploy-note.mjs
node --test server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-production-preflight.test.mjs server/tests/control-plane-postapproval-check.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs
```

Expected: all commands exit 0; the source is manual-only, exact-input, first-attempt-only, no-secret-before-recheck, protected, closeout-retaining, and PR-write isolated.

- [ ] **Step 9: Commit the production workflow source**

```powershell
git add -- .github/workflows/japan-control-plane-production-deploy.yml scripts/control-plane-deploy-note.mjs scripts/control-plane-production-preflight.mjs scripts/control-plane-postapproval-check.mjs server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs server/tests/control-plane-production-preflight.test.mjs server/tests/control-plane-postapproval-check.test.mjs
git commit -m "feat: add protected control plane deploy workflow"
```

Do not dispatch this workflow, create/update the Environment, inject secrets, mint OIDC, open SSH, or deploy production in this source task.

---

### Task 13: Cross-slice source validation and rollout handoff

**Files:**
- No file owned by this plan is added or modified in this task.
- Consume the Foundation, inventory, Host/DB writer-registry, bootstrap/host-protocol, host-transaction, and receipt/closeout source already merged into the same exact Draft-PR head.
- Hand exact commands and schema/workflow semantics to the rollout owner; that plan alone edits `package.json`, `schemas/README.md`, `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`, `RELEASE_MANIFEST.md`, `docs/VALIDATION_BASELINE.md`, and `docs/README.md`.

**Interfaces:**
- Task 13 is validation-only. It creates, edits, stages, commits, dispatches, publishes, configures, or deploys nothing.
- The worker records the starting `HEAD` and porcelain status in the same PowerShell session, runs only the listed read/test commands, then requires byte-equal starting/ending status and the same `HEAD`. Any change is a hard failure and is not repaired automatically.
- There is deliberately no `git add`, `git commit`, GitHub write, workflow run, Release write, OIDC request, secret read, SSH call, or production command in this task.

- [ ] **Step 1 (3 min): Confirm every adjacent frozen interface is present before integration**

Run:

```powershell
@(
  'server/services/deployment/canonical-json.mjs',
  'server/services/deployment/control-plane-inventory-receipt.mjs',
  'server/services/deployment/control-plane-required-check-contract.mjs',
  'server/services/deployment/control-plane-required-check-registry.mjs',
  'server/services/deployment/control-plane-inventory-attestation-predicate.mjs',
  'server/services/deployment/writer-registry.mjs',
  'server/services/deployment/database-contract.mjs',
  'server/services/deployment/control-plane-transport-contract.mjs',
  'server/services/deployment/control-plane-host-protocol.mjs',
  'server/services/deployment/control-plane-production-authorization.mjs',
  'server/services/deployment/control-plane-controller-closeout.mjs',
  'server/services/deployment/control-plane-controller-closeout-adapter.mjs',
  'scripts/control-plane-controller-closeout.mjs'
) | ForEach-Object { if (-not (Test-Path -LiteralPath $_ -PathType Leaf)) { throw "missing frozen dependency: $_" } }
```

Expected: exit 0 with no output. A missing file or export blocks integration; do not create a substitute in this slice.

In the same PowerShell session, capture the no-change guard before Step 2:

```powershell
$artifactValidationStartHead = git rev-parse HEAD
$artifactValidationStartStatus = @(git status --porcelain=v1 --untracked-files=all)
```

- [ ] **Step 2 (5 min): Run the artifact and workflow focused suite**

Run:

```powershell
node --test --test-concurrency=1 `
  server/tests/control-plane-production-gate.test.mjs `
  server/tests/control-plane-deployment-plan.test.mjs `
  server/tests/control-plane-release-declaration.test.mjs `
  server/tests/bounded-zip.test.mjs `
  server/tests/artifact-git-tree-verifier.test.mjs `
  server/tests/control-plane-artifact-assembly.test.mjs `
  server/tests/control-plane-artifact-builder.test.mjs `
  server/tests/control-plane-better-sqlite3-build-adapter.test.mjs `
  server/tests/control-plane-github-evidence.test.mjs `
  server/tests/control-plane-github-scope-attestor.test.mjs `
  server/tests/github-attestation-verifier.test.mjs `
  server/tests/github-immutable-release-publisher.test.mjs `
  server/tests/control-plane-publication-envelope.test.mjs `
  server/tests/control-plane-artifact-publication-authorization.test.mjs `
  server/tests/control-plane-production-preflight.test.mjs `
  server/tests/control-plane-postapproval-check.test.mjs `
  server/tests/control-plane-production-authorization.test.mjs `
  server/tests/control-plane-artifact-gate-workflow.test.mjs `
  server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs `
  server/tests/control-plane-production-controller.test.mjs `
  server/tests/control-plane-production-integration-adapter.test.mjs `
  server/tests/control-plane-production-controller-cli.test.mjs `
  server/tests/control-plane-production-deploy-workflow.test.mjs `
  server/tests/control-plane-deploy-note.test.mjs `
  server/tests/control-plane-controller-output-deploy-note.integration.test.mjs
```

Expected: all focused tests pass with zero failures and only explicitly platform-conditional skips.

- [ ] **Step 3 (5 min): Run the frozen upstream contract suites together**

Run:

```powershell
node --test --test-concurrency=1 `
  server/tests/control-plane-canonical-json.test.mjs `
  server/tests/control-plane-inventory-receipt.test.mjs `
  server/tests/control-plane-required-check-contract.test.mjs `
  server/tests/control-plane-required-check-registry.test.mjs `
  server/tests/control-plane-writer-registry.test.mjs `
  server/tests/control-plane-database-contract.test.mjs `
  server/tests/control-plane-transport-contract.test.mjs `
  server/tests/control-plane-host-protocol.test.mjs `
  server/tests/control-plane-authorization-verifier.test.mjs `
  server/tests/control-plane-receipt-contract.test.mjs `
  server/tests/control-plane-controller-closeout.test.mjs `
  server/tests/control-plane-controller-closeout-adapter.test.mjs `
  server/tests/control-plane-receipt-recovery.test.mjs `
  server/tests/control-plane-recovered-closeout-publisher.test.mjs
```

Expected: zero failures; Bootstrap consumes real Artifact-built authorization bytes with byte equality and no mapper, while the controller result algebra, immutable initial `not_started` payload, exact 35-day artifact identity, separate observation, ACK, and independently read `upload_committed_observed` contract remain unchanged.

- [ ] **Step 4 (5 min): Run the target-matched Foundation Linux gate**

Run these commands only in the disposable Linux/systemd environment defined by the Foundation plan:

```bash
npm run control-plane:native:build
npm run control-plane:native:test
npm run control-plane:foundation:linux
```

Expected: all commands exit 0 and the aggregate capability receipt reports `eligible:true`. Any false capability keeps every Artifact Gate and production workflow operationally ineligible.

- [ ] **Step 5 (5 min): Run complete repository validation**

Run:

```powershell
npm test
npm run project-state:check
npm run docs:authority:check
git diff --check origin/master...HEAD
```

Expected: all commands exit 0; `npm test` has zero failures, only documented conditional skips, and no deployment workflow is executed.

- [ ] **Step 6 (3 min): Give the integration owner the exact package command**

The rollout plan adds this one script to `package.json`; this plan does not edit the file:

```json
{
  "scripts": {
    "control-plane:artifact-workflow:test": "node --test --test-concurrency=1 server/tests/control-plane-production-gate.test.mjs server/tests/control-plane-deployment-plan.test.mjs server/tests/control-plane-release-declaration.test.mjs server/tests/bounded-zip.test.mjs server/tests/artifact-git-tree-verifier.test.mjs server/tests/control-plane-artifact-assembly.test.mjs server/tests/control-plane-artifact-builder.test.mjs server/tests/control-plane-better-sqlite3-build-adapter.test.mjs server/tests/control-plane-github-evidence.test.mjs server/tests/control-plane-github-scope-attestor.test.mjs server/tests/github-attestation-verifier.test.mjs server/tests/github-immutable-release-publisher.test.mjs server/tests/control-plane-publication-envelope.test.mjs server/tests/control-plane-artifact-publication-authorization.test.mjs server/tests/control-plane-production-preflight.test.mjs server/tests/control-plane-postapproval-check.test.mjs server/tests/control-plane-production-authorization.test.mjs server/tests/control-plane-artifact-gate-workflow.test.mjs server/tests/control-plane-compatibility-artifact-gate-workflow.test.mjs server/tests/control-plane-production-controller.test.mjs server/tests/control-plane-production-integration-adapter.test.mjs server/tests/control-plane-production-controller-cli.test.mjs server/tests/control-plane-production-deploy-workflow.test.mjs server/tests/control-plane-deploy-note.test.mjs server/tests/control-plane-controller-output-deploy-note.integration.test.mjs"
  }
}
```

Expected: after the rollout owner adds this slice-specific script in its own task, `npm run control-plane:artifact-workflow:test` exits 0. The rollout plan may separately aggregate it under its own command; this slice owns only the command shown above.

- [ ] **Step 7 (3 min): Verify the one-PR source boundary and exact head**

Run:

```powershell
git status --short --branch
git log --oneline --decorate origin/master..HEAD
git diff --name-status origin/master...HEAD
git diff --check origin/master...HEAD
git rev-parse HEAD
$artifactValidationEndHead = git rev-parse HEAD
$artifactValidationEndStatus = @(git status --porcelain=v1 --untracked-files=all)
if ($artifactValidationEndHead -ne $artifactValidationStartHead) { throw 'validation created a commit' }
if (Compare-Object $artifactValidationStartStatus $artifactValidationEndStatus) { throw 'validation changed the worktree' }
```

Expected: one source-only Draft PR contains the serial task commits, no untracked build output or secret material exists, diff check exits 0, the exact head SHA is recorded for review, and the no-change guard proves Task 13 made no filesystem or commit change. Do not add a Task 13 commit.

- [ ] **Step 8 (2 min): Stop at the source-review Gate**

Do not run `gh workflow run`, `gh run rerun`, `gh release create`, a GitHub write API, Environment/settings mutation, secret injection, SSH, provider command, or production probe. The next authorized action is independent source review inside the Draft PR; staging, GitHub settings, workflow dispatch, and production remain separate Risk A approvals.

## Independent PR Boundary

- PR count remains exactly one source-only Draft PR for this approved implementation program; Tasks 1–12 are serial, reviewable commits, not independently enabled PRs.
- The PR may leave Draft only after all focused/upstream/full tests pass, the Foundation receipt is eligible, ownership scans show no duplicate canonical/inventory/writer/receipt implementations, and the rollout plan has integrated package/schema/docs facts.
- Merge does not authorize any manual workflow dispatch. The settings/configuration Gate, compatibility bootstrap sequence, fresh read-only inventory, normal Artifact Gate, Production Gate, protected Deploy click, and any recovery invocation retain their own explicit Risk A approvals.

## Spec Coverage and Residual Risks

| Approved design area | Owning tasks in this plan | Evidence before Ready | Residual stop condition |
| --- | --- | --- | --- |
| Manual trigger and immutable Production Gate | Tasks 1, 8, 9, 10, 12 | ID/TTL/outer-inner tests and workflow trigger tests | Missing/expired inventory or Gate |
| Durable artifact, writer/declaration, bounded assembly | Tasks 3–5, 9–10 | canonical copy, tree, ZIP, lifecycle, offline-build tests | Writer registry or Linux/runtime drift |
| No-secret preflight and GitHub policy | Tasks 6, 8, 12 | exact inventory-owned check tuples, Environment policy, distinct-approver tests | API permission, ruleset, policy, or approval drift |
| Permission and credential separation | Tasks 6, 9, 10, 12 | static job-block, action-pin, scope-name, first-step tests | Reserved names outside the approved Environment |
| Human Deploy, automatic execution/rollback/verification | Tasks 11–12 plus host/DB plan | controller ordering, protocol, transaction, terminal receipt tests | Any nonterminal/invalid host state or no-claim result |
| Durable closeout and recovery handoff | Tasks 7, 11–13 plus receipt plan | immutable pair, 35-day readback, ACK, separate host CAS tests | Missing artifact, unacknowledged lease, or observation mismatch |

- The private repository's live check App IDs are intentionally absent from source constants. Fresh inventory supplies the canonical `requiredCheckContracts`; a missing or changed tuple is a hard stop.
- The frozen builder digest and native tool identities require a passing target-matched Linux receipt. Windows-only tests or ordinary hosted-runner unit tests cannot substitute for it.
- GitHub YAML cannot establish Environment protection, required reviewers, retention capability, or secret scope. Separate settings readback must prove those facts before any dispatch.
- Compatibility assets are durable bootstrap inputs only and are permanently rejected by automated production preflight.
- A controller transport interruption is never converted into a production claim. Only receipt-owned validated results and the exact immutable closeout/observation/ACK sequence can close the run.

## Self-Review

- [ ] **Coverage scan:** every artifact, manual trigger, Production Gate, preflight, Environment approval, permission, publisher, controller, closeout, and Deploy Note requirement maps to an owning task above or an explicitly named adjacent owner.
- [ ] **Ownership scan:** canonical JSON, inventory receipt/check tuples, writer registry, host protocol, remote transaction, and receipt/closeout each have one owner; this plan contains no substitute implementation.
- [ ] **Deferred-marker scan:** run the following and require no output:

```powershell
$terms = @('TO' + 'DO', 'T' + 'BD', 'FIX' + 'ME', 'implement' + ' later', 'fill' + ' in', 'similar' + ' to')
Select-String -LiteralPath 'docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md' -Pattern ($terms -join '|') -CaseSensitive
```

- [ ] **Type/interface scan:** run the following and manually confirm every consumer uses the frozen spelling:

```powershell
rg -n 'resolveInventoryReceipt|requiredCheckContracts|canonicalizeDatabaseContracts|discoverProductionWriters|canonicalizeWriterRegistry|verifyWriterRegistry|deriveProductionAuthorizationOidcAudience|runProductionController|readTerminalBundleBytes|validateAckResponse|validateUploadCommittedObserved|buildControllerFinalStatus|validateControllerFinalStatus|buildControllerCloseout|publishImmutableAssetAttestationPair' docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md
```

- [ ] **Plan whitespace check:** while this newly authored plan is still untracked, run:

```powershell
$result = git diff --no-index --check -- NUL docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md 2>&1
if ($LASTEXITCODE -gt 1) { throw "artifact_plan_whitespace_check_failed" }
$result | Where-Object { $_ -notmatch 'warning:.*LF.*CRLF' }
```

Expected: exit `1` because the complete new file differs from `NUL`, with no
whitespace diagnostics (and, at most, the local LF/CRLF warning). Once the
plan is tracked, the repository-level `git diff --check` remains the required
incremental check.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-08-github-control-plane-artifact-and-workflow.md`.

Execution choices after the combined plan set is independently reviewed:

1. **Subagent-driven (recommended):** execute one task at a time in this task, review each RED/GREEN/commit boundary, and stop before every external Risk A Gate.
2. **Inline execution:** execute the same serial task boundaries in one implementation task with explicit review checkpoints.

Neither choice dispatches or enables a workflow, changes GitHub settings, accesses production, or grants deployment approval.
