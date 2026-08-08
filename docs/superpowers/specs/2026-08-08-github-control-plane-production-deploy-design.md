# GitHub-Controlled Japan Control-Plane Production Deployment Design

```yaml
document_metadata:
  doc_type: design
  lifecycle: proposed
  authority_scope: source_design
  superseded_by: null
  last_verified_at: 2026-08-08
  production_authority: false
```

> Status:
> - Type: Approved conversational design pending written review
> - Source baseline: `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`
> - Risk: C for this design-only commit; the deployment capability, credential
>   bootstrap, host access, and every production run remain Risk A
> - Process: design review -> one source-only Draft PR -> clean validation ->
>   independent review -> merge -> staged host-content and artifact-publication
>   Gates -> compatibility artifact/manual activation Gate -> credential/runner
>   bootstrap Gate -> fresh inventory -> manual Artifact Gate -> durable exact
>   Production Gate receipt -> manual dispatch -> protected approval -> automated
>   deployment/validation/rollback -> closeout
> - Expected PR count: one source implementation PR after written design review
> - Release unit: `control-plane-app`
> - Production state: `not_deployed`
> - Production impact: None. This document creates no workflow, credential,
>   release, deployment, schema change, service operation, or host access.

## Objective

Create a GitHub Enterprise deployment path in which an operator deliberately
starts one Japan control-plane deployment, an independent reviewer approves the
exact protected job, and GitHub then completes the bounded deployment,
validation, and code rollback automatically.

The desired operator experience is:

```text
operator clicks Deploy on master
  -> no-secret exact-source and artifact preflight
  -> reviewer approves vultr-japan-production
  -> GitHub performs the fixed deployment transaction
  -> health and schema acceptance
  -> success receipt, or automatic code rollback and failure receipt
```

This is approval-gated automation, not continuous deployment. A merge or push
must never promote the control plane automatically.

## Current Evidence And Gaps

The 2026-08-08 read-only GitHub inventory established these current facts:

- organization `gccwebos-com` is on the Enterprise plan;
- repository Actions are enabled;
- `vultr-japan-production` requires one reviewer, prevents self-review, and
  allows protected branches only;
- `Production Deploy Dry Run` is manual and explicitly performs no SSH,
  pointer switch, restart, or production mutation;
- `Japan Runtime Config Additive Repair` is a separate, narrowly scoped
  `japan-runtime-config` path and is not a general application deployer; and
- the Cloudflare site workflow has an automatic path, but its repository
  variable is currently disabled.

The current source also has two deployment-packet gaps that must be corrected
before production deployment is enabled:

1. `production-deploy-dry-run.yml` writes an unversioned text plan and accepts
   multiple target choices. That is useful dry-run evidence, but it is not the
   closed, machine-validated Japan control-plane execution contract required
   here.
2. The control-plane output is a source ZIP retained as a GitHub Actions
   artifact for 14 days. That is build evidence, not durable deployment and
   rollback-window retrievability.

The existing workflows' Node 22 selection is allowed by the exact root engine
contract, `>=20.10.0 <21 || 22.x || 23.x || 24.x || 25.x || 26.x`; it is not a
deployment blocker by itself. Implementation must pin a repository-supported
Node version for GitHub validation and independently verify the production
service's exact supported Node runtime through fresh inventory.

Historical release paths, service state, database paths, credentials, and
health are not current facts. Fresh live inventory remains mandatory before
the first production run.

## Decisions

The design fixes the following decisions:

1. The production workflow uses `workflow_dispatch` only. It has no `push`,
   `pull_request`, schedule, or workflow-chain production trigger.
2. The operator starts a run from protected `master`; the workflow binds the
   exact `github.sha` automatically and does not accept an arbitrary source
   commit.
3. A no-secret preflight completes before the job enters
   `vultr-japan-production`.
4. The protected job cannot read deployment secrets until an independent
   reviewer approves it.
5. After approval, GitHub owns the bounded transaction. It never asks the
   operator to run intermediate shell commands.
6. Production uses a dedicated, rotatable, forced-command-only CI identity.
   It does not use an operator key, workstation SSH configuration, or the Japan
   runtime-config repair identity.
7. The workflow runs on a GitHub-hosted runner. No Actions runner is installed
   on the production host.
8. A remote, root-owned fixed runner owns the transaction, lock, watchdog,
   rollback, and aggregate receipt. GitHub does not receive a general shell.
9. Automatic rollback covers the application release, `current` pointer,
   approved service, and release-local protected configuration. Additive schema
   changes may remain; the workflow never automatically overwrites a live
   database after the candidate may have accepted writes.
10. Version 1 rejects identity-impacting releases and any destructive or
    backward-incompatible schema migration.
11. Durable target-matched artifact publication uses separate manual-only
    normal and one-time compatibility Gates; neither a merge nor the ordinary
    source-artifact workflow can publish either class.
12. Version 1 rejects a candidate whose persisted data semantics are not
    backward-compatible with the exact rollback release.
13. Every production database launch surface maps exactly once to the fixed
    application, auxiliary, gated-business, or migration contract. Only
    auxiliary writers use pause/drain/restore semantics; application lifetime,
    operator lease/guard, and migration-exclusive contracts govern the other
    classes. An unknown, overlapping, lossy, or bypassing writer blocks the run
    before production mutation.
14. Authorization generation rotation is a fail-closed, host-journaled two-
    authority state machine under one GitHub concurrency key and one durable host
    fence; the design makes no cross-GitHub/host atomic-write claim.
15. Database identity is proved on the SQLite handle actually used under a
    shared identity-lease contract. Fresh observed schema, reviewed migration
    input/expected post, start state, transition, ledger, and terminal identities
    are distinct evidence.

## Non-Goals

This design does not:

- deploy on merge or push;
- provide an interactive SSH shell, SCP, rsync, port forwarding, or a generic
  remote command channel;
- install a self-hosted runner or permanent deployment daemon;
- deploy `portal-static`, `admin-static`, `company-site-static`,
  `japan-runtime-config`, or any other release unit;
- change Nginx, DNS, firewall rules, provider resources, runtime-config maps,
  or public Admin exposure;
- package production `.env`, SQLite, protected config, credentials, or customer
  data into a GitHub artifact;
- automatically restore an older database over a live database;
- automatically delete old releases or backups; or
- make the first production run part of the source implementation PR.

## Architecture

### GitHub Components

The source implementation has five logical components:

1. **Durable artifact publication** uses a new manual-only
   `control-plane-artifact-gate.yml` workflow to publish the exact
   target-matched control-plane ZIP, checksum sidecar, and portable
   `artifact.json` as durable GitHub Release assets. Canonical
   `writer-registry.json` and reviewed `release-declaration.json` companions
   record the deployment writer bytes/digest plus database, identity,
   validation, host-execution, and rollback metadata without changing portable
   Artifact Manifest v1. The exact registry bytes also exist inside the bundle's
   release-metadata tree, not as a new portable-manifest field. The existing
   `release-artifact.yml` remains
   source-build evidence with no publication write authority; its short-lived
   Actions artifacts are not deployment inputs. Only the new Gate's publisher
   job is bound to `artifact-publication`, receives the minimum
   publication/attestation writes, reads back the live Environment protection,
   and refuses replacement of an existing asset with different bytes.
2. **Deployment plan builder and validator** creates one safe
   `deployment-plan.json`, validates all fixed inputs and GitHub evidence, and
   emits a human-readable job summary before approval.
3. **Manual production workflow** performs the no-secret preflight, waits on
   `vultr-japan-production`, prepares ephemeral runner files after approval,
   streams the reviewed envelope to the host, validates the receipt, and
   cleans up in `always()`.
4. **Fixed host runner** accepts only a versioned deployment envelope through
   the forced command, obtains a host-local lock, starts a bounded host-local
   transaction, and exposes only execute/status receipt operations.
5. **Receipt validator** accepts only the fixed aggregate schema and maps the
   result to GitHub success, rolled-back failure, or critical failure.

The components remain independently testable. Artifact publication cannot
access production. The plan builder cannot read production secrets. The host
runner cannot query GitHub repository content, Actions, or deployment APIs or
select a different target; its only GitHub network trust is fixed-issuer OIDC
discovery/JWKS verification during admission. The receipt validator cannot
perform a host mutation.

### Manual Trigger Contract

The operator starts the workflow on `master` and supplies only:

```yaml
production_gate_id: content-addressed identifier matching the closed Gate grammar
confirmation: deploy japan control-plane production
```

The workflow fixes these values in reviewed source rather than accepting them
from the dispatcher:

```yaml
target: japan-control-plane
release_unit: control-plane-app
service: proxy-gateway-candidate.service
environment: vultr-japan-production
deployment_trigger: workflow_dispatch
```

The workflow derives the durable Release tag, exact source commit,
`expectedCurrentRelease`, candidate release, and every plan field from the
immutable Production Gate receipt plus the new run identity. The closed
`production_gate_id` grammar is the exact ASCII regular expression
`^pg1\.[0-9a-f]{40}\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.[0-9a-f]{64}$`.
Its four dot-separated fields are the literal version, lowercase source commit,
lowercase allowlisted runtime-contract ID, and lowercase receipt SHA-256. No
percent encoding, Unicode, case folding, alternate separator, whitespace, or
normalization is accepted. It is an external content-addressed envelope, not a
field inside the hashed receipt, avoiding a self-referential digest while
allowing the workflow to derive one fixed Release tag and asset name without a
search or caller-controlled URL. The
workflow does not accept an arbitrary source, expected release, host, service,
path, artifact URL, health URL, shell command, or rollback target.

`github.run_attempt` must be `1`. A failed or stopped run is not retried under
the prior approval; the operator must start a new workflow run and obtain a new
environment approval.

The production workflow, every bootstrap/credential-rotation workflow, and the
manual receipt-recovery workflow use
the same repository-wide fixed concurrency key
`japan-control-plane-production-authority` with `cancel-in-progress: false`.
A second run may wait in GitHub, but its preflight and approval are not reusable;
after it starts, all source, artifact, plan-expiry, and expected-current checks
run again. A durable host rotation fence spans the gaps between separately
approved bootstrap stages; the host deployment/rotation lock remains the final
concurrency authority. Rotation cannot prepare while an authenticated artifact
reservation, nonterminal deployment journal/recovery phase, or a controller
closeout lease not yet attached to an immutable terminal receipt exists. A lost
controller acknowledgement that remains bound to durable generation-N terminal
evidence does not block a separately approved rotation. Deployment admission
cannot start while any rotation fence is prepared or committing.

### Pre-Dispatch Production Gate Receipt

The normal Artifact Gate publishes the exact Production Gate only after the
target-matched artifact and every companion are durable and read back. It is a
canonical immutable asset named exactly
`production-gate-{receiptSha256}.json` in Release
`control-plane-app-{sourceCommit}-{runtimeContractId}`, published last and
covered by GitHub build provenance. It contains no host credential, endpoint,
database path, config, or customer data and grants no production access by
itself.

Its closed logical schema is:

```yaml
schemaVersion: "1"
receiptType: japan_control_plane_production_gate
repository: gccwebos-com/proxy-gateway-minimal
sourceCommit: full protected-master commit
runtimeContractId: exact inventory-derived runtime contract id
target: japan-control-plane
releaseUnit: control-plane-app
expectedCurrentRelease: inventory-derived rollback label
inventoryGateId: exact fresh inventory Gate identity
inventoryReceiptSha256: exact fresh inventory receipt digest
inventoryExpiresAt: RFC 3339 UTC timestamp
artifactReleaseTag: fixed tag derived from source and runtime contract
artifactSha256: exact durable bundle digest
releaseDeclarationSha256: exact declaration digest
bootstrapReceiptSha256: final active bootstrap receipt digest
deploymentPlanTemplateSha256: digest of the stable plan body, excluding Gate and run envelope fields
createdAt: RFC 3339 UTC timestamp
expiresAt: createdAt plus two hours
```

The publisher uses a tracked strict serializer, rejects unknown or duplicate
fields and hashes the exact canonical UTF-8 bytes. Only after hashing does it
construct the external `production_gate_id`, uploads the receipt under the fixed
digest-derived asset name after all referenced assets are durable, and refuses
replacement. The operator reviews that exact receipt and safe summary before
dispatch. No workflow run ID is needed to create it. The deployment preflight
parses then canonically reserializes the ID and requires byte-for-byte equality,
retrieves only the Release/asset from the formulas above, requires its hash to
equal the ID's digest, and requires the outer source/runtime fields to equal the
receipt fields byte for byte. It then attestation-verifies it and requires the source
still be current protected `master`, requires the inventory and Gate both be
unexpired. Authoritative one-time use belongs to the host ledger keyed only by
`productionGateReceiptSha256`, never a raw or alternate ID string.

Preflight then deterministically reconstructs the plan's stable body from the
Gate receipt and its fixed referenced inventory/artifact/declaration inputs and
requires its hash to equal `deploymentPlanTemplateSha256`. Around that body it
may add only the external
`gateId`/receipt digest, repository/run/attempt-bound `transactionId`, the
domain-separated `controllerRecoveryId` derived without the plan digest, the
candidate label deterministically derived from that transaction, plan creation/
expiry timestamps, and the resulting plan digest. The host atomically consumes
`productionGateReceiptSha256` with the OIDC replay record before accepting an
artifact, so aliases cannot create another key and two runs cannot admit the
same Gate even if both reached an Environment approval. The Gate is
admission-once, not dispatch-once: a run proven to have stopped before any host
reservation may re-dispatch the same still-unexpired Gate only with a new run
and new Environment approval. Any admitted, uncertain, expired, or terminal use
requires a new inventory, Artifact Gate, Production Gate receipt, dispatch, and
approval.

### Deployment Plan

The no-secret preflight creates a bounded plan with this safe logical shape:

```yaml
schemaVersion: "1"
gateId: exact pre-dispatch Production Gate identifier
productionGateReceiptSha256: exact immutable Production Gate receipt digest
transactionId: repository, run, attempt, target, and source-bound logical identifier
controllerRecoveryId: exact cr1 dot 64-lowercase-hex identifier over the fixed recovery domain, Gate receipt, transaction, target, and source
inventoryGateId: exact fresh read-only inventory Gate identity
inventoryReceiptSha256: 64-character lowercase hex digest
inventoryExpiresAt: exact parent inventory expiry
productionGateExpiresAt: exact parent Production Gate expiry
target: japan-control-plane
releaseUnit: control-plane-app
sourceCommit: full 40-character master commit
candidateRelease: safe release label
expectedCurrentRelease: safe release label
artifact:
  releaseTag: control-plane-app-{sourceCommit}-{runtimeContractId}
  deploymentMode: normal
  automatedDeploymentEligible: true
  fileName: portable base name only
  sha256: 64-character lowercase hex digest
  releaseDeclarationSha256: 64-character lowercase hex digest
  sizeBytes: positive integer not greater than 268435456
  runtimeContract: reviewed Linux architecture, libc, and Node ABI contract id
rollbackRelease:
  releaseLabel: exact safe label equal to expectedCurrentRelease
  releaseTag: canonical durable release tag
  sourceCommit: full 40-character commit from immutable installed manifest
  artifactSha256: 64-character lowercase hex digest
  releaseTreeManifestSha256: 64-character lowercase hex digest
  runtimeContract: exact installed runtime contract id
  dependencyContract: exact installed dependency/native-layer contract id
  dataCompatibilityPairSha256: candidate/rollback synthetic contract digest
  writerSetContractSha256: exact installed production writer-set digest
  writerRegistryVerificationReceiptSha256: fresh independent proof digest
  businessMutationContract: exact installed lease/guard contract id
applicationWriterContract:
  logicalId: control-plane-application
  service: proxy-gateway-candidate.service
  startupMode: existing_schema_only
  permitAndFreshStartContract: fixed versioned contract id
auxiliaryWriterContracts:
  - logicalId: fixed tracked auxiliary writer identity
    unitSet: closed tracked timer/service identities
    quiescenceMode: stop_and_restore
    stateContract: fixed versioned pause/resume and idempotency contract
gatedBusinessMutationEntrypoints:
  - logicalId: fixed operator business-mutation identity
    entrypointContract: fixed reviewed entrypoint id
    entrypointSha256: 64-character lowercase hex digest
    logicalDatabaseIds: non-empty closed subset of the database contract ids
    mutationLeaseContract: fixed shared-lock and deployment-guard contract id
candidateWriterSetContractSha256: canonical candidate writer-registry digest
candidateWriterRegistryVerificationReceiptSha256: fresh independent proof digest
writerRegistrySchema: control-plane-writer-registry-v1
databaseContracts:
  - logicalId: subscription-runtime
    configuredSource: SUBSCRIPTION_DB_PATH
    configuredSourceGenerationHmacSha256: host-keyed aggregate-safe config generation
    physicalDatabaseIdentityHmacSha256: host-keyed aggregate-safe file identity
    inventorySchemaIdentitySha256: fresh observed schema-only identity
    migrationPreSchemaIdentitySha256: reviewed migration input identity
    expectedPostMigrationSchemaIdentitySha256: reviewed exact post-schema identity
    schemaTransitionContractSha256: reviewed pre/post/ledger transition digest
    migrationStartState: none_unchanged | pending_pre | already_committed_post
    schemaMode: none | additive_compatible
    schemaGateId: reviewed gate id when additive_compatible; null otherwise
    schemaContract: fixed versioned contract id
    migrationEntryPointContract: fixed reviewed id when additive; null otherwise
    migrationEntryPointSha256: exact entrypoint digest when additive; null otherwise
  - logicalId: subscription-control
    configuredSource: SUBSCRIPTION_CONTROL_DB_PATH
    configuredSourceGenerationHmacSha256: host-keyed aggregate-safe config generation
    physicalDatabaseIdentityHmacSha256: host-keyed aggregate-safe file identity
    inventorySchemaIdentitySha256: fresh observed schema-only identity
    migrationPreSchemaIdentitySha256: reviewed migration input identity
    expectedPostMigrationSchemaIdentitySha256: reviewed exact post-schema identity
    schemaTransitionContractSha256: reviewed pre/post/ledger transition digest
    migrationStartState: none_unchanged | pending_pre | already_committed_post
    schemaMode: none | additive_compatible
    schemaGateId: reviewed gate id when additive_compatible; null otherwise
    schemaContract: fixed versioned contract id
    migrationEntryPointContract: fixed reviewed id when additive; null otherwise
    migrationEntryPointSha256: exact entrypoint digest when additive; null otherwise
identityImpact: false
dataCompatibilityImpact: false
dataCompatibilityContract: control-plane-persisted-data-backward-v1
dataCompatibilityPairSha256: same candidate/rollback pair digest as above
hostExecution:
  launcherContract: fixed versioned contract id
  launcherSha256: 64-character lowercase hex digest
  recoveryContract: fixed versioned contract id
  recoveryBundleSha256: 64-character lowercase hex digest
  serviceDropInSha256: 64-character lowercase hex digest
  auxiliaryWriterDropInBundleSha256: 64-character lowercase hex digest
  businessMutationLeaseHelperSha256: 64-character lowercase hex digest
  businessMutationGuardContract: fixed versioned contract id
  migrationAdmissionAdapterSha256: 64-character lowercase hex digest
  writerRegistryVerifierSha256: 64-character lowercase hex digest
  databaseBindingHelperSha256: fixed host HMAC helper digest
  databaseBindingKeyGeneration: safe root-only key generation id
  databaseHandleBindingContract: fixed no-follow opened-handle/identity-lease contract
  databaseHandleBindingAdapterSha256: exact fixed adapter/startup-wrapper digest
  databaseCapabilityCustodyContract: fixed transaction-local SCM_RIGHTS contract
  databaseCapabilityCustodyHelperSha256: exact bounded custody-helper digest
  hostAuthorizationEvidenceHelperSha256: fixed host-only HMAC helper digest
  hostAuthorizationEvidenceKeyGeneration: safe root-only key generation id
  bootstrapStaticPrepareContractSha256: exact provider-console static staging contract
  bootstrapStaticPrepareHelperSha256: exact no-argument root staging-helper digest
  bootstrapRecoveryContract: fixed provider-approved genesis/status/resume/abort contract
  bootstrapRecoveryEntryShimSha256: exact fixed unprivileged forced-entry digest
  bootstrapRecoveryLauncherSha256: exact fixed bootstrap forced-command launcher digest
  bootstrapRecoverySudoersContractSha256: exact ephemeral no-argument privilege contract
  bootstrapRecoveryCleanupUnitSha256: exact bounded activation-expiry cleanup unit digest
  bootstrapActivationStagingContractSha256: exact staged-entry lease/boot-scrub contract
  bootstrapActivationRecordContractSha256: exact canonical activation-record schema digest
  bootstrapReceiptId: safe reviewed bootstrap identity
  bootstrapReceiptSha256: canonical immutable bootstrap receipt digest
  bootstrapGeneration: safe immutable current bootstrap generation id
  githubMetadataAppContractSha256: exact read-only App/installation/scope contract
  githubBootstrapUpdaterAppContractSha256: exact temporary App/token/API-scope contract
  expectedAuthorizationScopeNamesSha256: exact reserved name/scope-set digest
  githubAuthorizationBindingHmacSha256: keyed live authorization binding
  githubAuthorizationStateSha256: outer generation/receipt/HMAC state pointer digest
  controllerCloseoutFinalizerContractSha256: fixed deadline/CAS/state-machine contract digest
  controllerCloseoutFinalizerBundleSha256: exact root-owned timer/service executable bundle digest
  criticalTerminalFinalizerSha256: exact external critical-finalization unit/binary digest
  criticalIdentityFenceContractSha256: exact all-adapter fail-closed critical fence digest
  receiptRecoveryChallengeContractSha256: exact two-phase safe challenge/status contract digest
  receiptRecoveryWorkflowSha256: exact protected workflow bytes digest
  receiptRecoveryControllerSha256: exact current no-write controller bundle digest
  receiptRecoveryParserRegistrySha256: exact retained-schema parser registry digest
  contractDigest: digest of all preceding host-execution fields
bootstrapAuthorizationGateReceiptSha256: pre-existing provider authorization receipt digest
bootstrapActivationRecordSha256: dynamic immutable activation-record digest
bootstrapActivationAttemptChainSha256: ordered fresh activation/recovery attempt-chain digest
githubBootstrapUpdaterIssuanceChainSha256: dynamic ordered issuance/readback chain digest
bootstrapRecoveryCloseoutEvidenceSha256: separate aggregate-safe consumed-and-absent proof digest
validationContract: control-plane-promotion-health-gate-v1
rollbackContract: control-plane-release-pointer-rollback-v1
createdAt: RFC 3339 UTC timestamp
expiresAt: minimum of inventory expiry, Production Gate expiry, and createdAt plus two hours
```

The plan contains no endpoint, absolute host path, environment value,
credential, database path, raw config, log, process identifier, or customer
data. The exact JSON bytes are hashed, and the reviewer summary includes the
plan digest. Its effective expiry is computed exactly once as
`min(inventoryExpiresAt, productionGateExpiresAt, createdAt + 2h)`; neither a
dispatch nor an approval can extend either parent evidence lifetime. All three
timestamps and that minimum are part of the plan digest, OIDC authorization,
host journal, and terminal receipt.

### No-Secret Preflight

Before any protected Environment or deployment-secret reference, preflight
must prove all of the following:

- the supplied `production_gate_id` resolves to exactly one immutable,
  provenance-bound Production Gate receipt at the fixed derived Release/asset,
  its canonical digest and type domain match the ID and it is unexpired,
  and its plan-template digest reproduces the complete stable plan body before
  the fixed Gate/run envelope is added;
- the run ref is protected `master`;
- the bound source commit is still the current remote `master` head;
- live `vultr-japan-production` readback shows required reviewers,
  `prevent_self_review: true`, and protected-branches-only deployment;
- required CI, CodeQL, and source Release Artifact checks succeeded for that
  exact commit;
- the durable asset, checksum, and manifest agree on source commit, release
  unit, file name, digest, and size;
- the exact fresh inventory receipt digest binds this target, runtime contract,
  installed rollback label/source/artifact/tree-manifest/runtime/dependency
  identities, writer-set/lease contract, bootstrap receipt, and both logical
  databases' configured-source-generation HMAC, physical-file-identity HMAC, and
  observed schema/start state plus reviewed input/expected-post/transition
  contract, and remains within its reviewed validity window;
- the GitHub build-provenance attestation binds that digest to this repository,
  the reviewed manual Control-Plane Artifact Gate workflow, and the exact
  protected `master` commit;
- the canonical source ZIP nested in the deployment bundle passes
  `scripts/artifact-git-tree-verifier.mjs` against that exact commit;
- the independently discovered canonical candidate `writer-registry.json` bytes
  equal the durable companion, bundle, and candidate-tree copies; their digest
  agrees with the release declaration, bundle assembly file manifest,
  provenance subject, and plan; the exact rollback source is independently
  rediscovered and agrees with its durable companion, bundle, declaration,
  provenance, installed tree/manifest, inventory, and plan; both fresh canonical
  verification-receipt digests match the plan, while portable `artifact.json`
  remains unchanged;
- the separately reviewed release declaration is bound to the same source and
  artifact, declares `deploymentMode: normal`,
  `automatedDeploymentEligible: true`, `identityImpact: false`, and provides the exact closed
  application-writer, `auxiliaryWriterContracts`,
  `gatedBusinessMutationEntrypoints`, migration-entrypoint, and
  `databaseContracts` lists,
  `dataCompatibilityImpact: false`, the complete host-execution contract and
  bootstrap receipt, validation, feature-flag, data-compatibility, and rollback
  contracts;
- the candidate durable asset and every rollback registry-verification input are
  still retrievable;
- the plan is unexpired and uses the fixed target, service, contracts, and
  release unit;
- the Gate-derived `expectedCurrentRelease` uses the closed release-label
  grammar and equals the inventory-derived rollback label, while the sole
  dispatcher confirmation phrase uses its closed grammar;
- `identityImpact` is false;
- `dataCompatibilityImpact` is false and the fixed persisted-data backward
  compatibility contract passed for the exact candidate/rollback source,
  artifact, tree-manifest, runtime, and dependency pair and matches the pair
  digest in both plan locations;
- every database contract uses `none` or `additive_compatible`, with an exact
  reviewed schema Gate, entrypoint digest, observed inventory identity, reviewed
  migration-pre identity, expected post identity, transition digest, closed
  start state, and migration-admission adapter when additive; `none` requires
  identical observed/pre/post identities; additive requires either exact
  pending-pre with no ledger or exact already-committed-post with its ledger; the
  two required logical database identities occur exactly once, all six observed
  inventory-bound identities and both reviewed transition triples match, and
  the two physical HMACs differ;
- the canonical writer registry and fresh host inventory join in both
  directions, covering active and dormant launch surfaces; every surface maps
  exactly once, with no overlap, to the fixed application service contract, one
  closed auxiliary writer contract, one gated business-mutation entrypoint, or
  one fixed migration entrypoint; the application permit/stop/fresh-start proof,
  every auxiliary pause/resume/idempotency proof, every business-mutation
  guard/lease proof, and the migration admission proof passed; and
- GitHub evidence contains no earlier validated host admission or terminal
  receipt for the same Production Gate digest; the host's atomic digest-keyed
  ledger remains authoritative for ambiguous or concurrent attempts.

Preflight installs and validates with an exact Node version allowed by the root
engine contract. It publishes the plan and safe reviewer summary, then the deployment job waits on
`vultr-japan-production`.

Immediately after approval, the protected job's first step references no
Environment secret. With only the job's `GITHUB_TOKEN` and `actions: read`, it
reads back `vultr-japan-production` and this run's approval history. It requires
the exact Environment, at least one required reviewer, `prevent_self_review:
true`, protected-branches-only deployment, an approved review bound to this run
and Environment, and an approving user distinct from both `github.actor` and
`github.triggering_actor`. Missing, bypassed, stale, self, or policy-drifted
approval stops before any deployment secret is materialized into a file.

The same step repeats current-master, build-attestation, canonical Git-tree,
bundle, inventory expiry, Production Gate expiry, effective plan expiry,
current authorization generation/receipt/HMAC/outer-state, and single-attempt
checks. Any parent or
plan at or beyond expiry, or any drift, stops the run without a production
connection.

### GitHub Permission Boundary

The deployment workflow declares `permissions: {}` at workflow scope. The
no-secret preflight opts in only to `actions: read`, `checks: read`,
`contents: read`, `statuses: read`, and `attestations: read`. The protected
deployment job receives the same reads plus `id-token: write` solely to mint the
one-time admission assertion after live approval validation. GitHub's current
REST contract requires `Actions: read`, not repository Administration, for both
the Environment GET and workflow-run approval-history GET endpoints;
attestation verification is separately explicit. Neither job receives package,
pull-request, issue, deployment, administration, or contents write authority,
and no GitHub App/PAT with source, Actions, deployment, write, OIDC, or host
authority is available to either deployment job. The sole exception is the
postapproval metadata-scope App above; its token is permission-checked, used only
for exact secret/variable scope-name readback, and destroyed before SSH. The
separately approved bootstrap provider identity is never persisted or inherited
here. Every referenced action is pinned to a reviewed full commit digest.

Artifact source preparation, dependency build, and publication are separate
jobs. Source preparation has only `contents: read`, checks out with
`persist-credentials: false`, creates the canonical exact-tree input, and
executes no lifecycle/native code. The disposable dependency builder declares
`permissions: {}`, has no checkout, does not pass `GITHUB_TOKEN` into steps, and
gives its automatically issued token no repository permission. It receives only
the immutable job input through GitHub's job-scoped artifact transport; before
any lifecycle/native subprocess, the wrapper removes every GitHub, Actions,
OIDC, artifact-service, proxy, and credential environment value. The durable
publisher is a distinct write-capability job: it receives `actions: read`,
`contents: write`, `id-token: write`, and `attestations: write` only. It does not
checkout repository source, invoke a package manager, extract/execute the
candidate, import lifecycle/native code, or run any builder output. A fixed
bounded publication-envelope parser re-hashes the opaque final files and the
pinned GitHub attestation/release operations attest and upload them.

Those write scopes exist only on the protected `artifact-publication` job and
are used only to publish and attest the canonical asset set; the deployment
workflow itself has none of them. The publisher has no production Environment
or deployment credential. No `pull_request_target`, repository-dispatch,
reusable caller input, or fork-controlled code path can reach either write or
production authority.

Deploy Note recording uses a second isolated job after controller closeout. It
does not reference `vultr-japan-production`, inherit deployment secrets, mint an
OIDC token, open SSH, or run host code. It receives only `actions: read`,
`contents: read`, and `pull-requests: write`; downloads the exact aggregate
closeout artifact for the same run/attempt, revalidates its digest and bindings,
and may append one bounded comment to the single associated merged PR. An
ambiguous/missing PR or invalid closeout fails without writing. No job ever
combines production secrets with repository or pull-request write authority.

### One-Time Approval Assertion

After the live Environment and review-history checks pass, the protected job
builds a canonical safe authorization record from the plan digest,
Production Gate receipt digest, inventory/Gate/effective expiry triple,
transaction ID, exact Environment identity, current bootstrap generation and
receipt/state pointers plus authorization HMAC, run ID/attempt, source commit,
and host-execution contract
digest plus an aggregate approval-history digest. It
requests one GitHub OIDC token whose
audience contains the authorization-record digest. The token is accepted for at
most five minutes and is never written to the Actions summary, artifact, log, or
receipt.

Admission requires both the restricted SSH key and this token. The root launcher
validates the fixed GitHub issuer and signature against the fixed discovery/JWKS
endpoints, then requires exact repository, protected `master` ref, source SHA,
workflow path/ref, Environment subject, run ID, run attempt `1`, audience,
workflow SHA, `runner_environment: github-hosted`, issued-at, not-before,
expiry, and `jti` claims against a freshly verified host clock. It persists the
consumed `jti`, token digest, and transaction reservation only after every claim
and installed-host contract passes but before requesting artifact bytes; each
can be admitted only once. Discovery/JWKS or clock validation failure is a safe,
non-persistent admission rejection, never a fallback to SSH-only authority. The
raw token is held only in bounded protected memory and is removed immediately
after validation.

## Artifact And Release Assembly

### Durable Artifact

The control-plane deployment artifact becomes a production dependency bundle
created in a clean disposable Linux build environment that matches the freshly
inventoried architecture, libc family, and supported Node ABI. The bundle
contains a canonical source ZIP made by `git archive`, a separate production
dependency layer made from that source and lockfile, and a closed assembly
manifest binding both digests plus the exact canonical
`writer-registry.json` file/digest. The nested source ZIP must independently match
the exact Git tree through `scripts/artifact-git-tree-verifier.mjs`. Production
material is excluded. The build job has no production Environment, credential,
config, database, or host route. Dependency lifecycle code therefore runs only
inside this disposable builder, never on the production host.

The existing `release-artifact.yml` may continue to run on protected-master
push or manual dispatch, but it has no durable publisher, no `contents: write`,
and no target-runtime selection authority. Durable publication uses a new
`control-plane-artifact-gate.yml` whose only trigger is `workflow_dispatch` on
protected `master`; it has no push, schedule, reusable-workflow, repository
dispatch, or PR trigger. Its operator inputs are only:

```yaml
inventory_gate_id: safe identifier of the exact validated inventory receipt
confirmation: publish japan control-plane artifact
```

The normal Artifact Gate requires that inventory to bind an already active,
read-back `bootstrapReceiptSha256`; it never accepts a staged/future receipt. To
break the one-time bootstrap cycle, initial compatibility uses a distinct
manual-only `control-plane-compatibility-artifact-gate.yml`. Before it runs, a
separate approved host-content Gate stages the exact root-owned execution bundle
without a GitHub credential, Environment secret, enabled deployment lane, or
application/recovery activation and emits a content-addressed
`hostBundleContentReceiptSha256`. The compatibility Gate binds that staged
receipt plus fresh runtime inventory, uses the same tokenless builder,
registry/provenance checks, and durable assets, but fixes
`deploymentMode: compatibility_bootstrap` and
`automatedDeploymentEligible: false`. The production deployment workflow
rejects those assets. Only the separately approved existing manual deployment
runbook may install that exact bundle and atomically activate/read back the same
host bytes. Successful activation emits only an intermediate
`hostActivationReceiptSha256` covering those installed host bytes and active
application/recovery bindings; it explicitly does not claim the later SSH
principal, sudoers, authorized-key, GitHub Environment, or secret binding. A
normal Artifact Gate or host admission never accepts that intermediate receipt.
Only the later credential/authorization Gate may re-hash the activated bytes
plus the final installed authorization and emit the active
`bootstrapReceiptSha256` required by every normal Artifact Gate. No placeholder,
predicted, partial, intermediate, or future receipt is accepted.

The dispatcher cannot supply a source commit, release tag, host, architecture,
libc, Node ABI, native-toolchain choice, or arbitrary inventory value. The Gate
binds the current protected `master` commit, retrieves the exact signed/bound
read-only inventory receipt for `japan-control-plane`, derives its runtime
contract, and requires that contract to occur in the tracked
`release-declaration.template.json` allowlist. That tracked template fixes every
schema, identity, persisted-data, writer-registry schema/declaration,
host-execution, validation, rollback, builder, and runtime allowlist field. The
Gate may materialize only the exact inventory-derived runtime contract, final
bootstrap receipt/generation/authorization-HMAC identity, both logical
databases' host-keyed configuration/file bindings and schema identities, plus
the independently generated/verified canonical writer-registry digest into
final `release-declaration.json`; it may copy those verified values but cannot
select or alter a contract or digest. Missing,
stale, ambiguous, user-selected, or declaration-incompatible runtime data fails
before publication.

The bundle's durable release identity is
`control-plane-app-{full source commit}-{runtime contract id}`. Portable
`artifact.json` remains Artifact Manifest v1; deployment-only fields live in
the separately reviewed `release-declaration.json`. The new workflow's sole
publisher job is the only job with `contents: write`, is bound to
`artifact-publication`, and fails unless live readback confirms the expected
required reviewer, self-review prevention, and protected-branches-only policy
before publication. Its pre-publication summary exposes only safe source,
inventory, runtime, bootstrap, builder, and output digests; approval is not a
production deployment approval. The publication workflow:

The source-preparation job creates the canonical Git input and reviewed
declaration template; the tokenless builder alone performs package fetch and
offline native assembly; a no-write verifier validates its complete output; and
the protected publisher only re-hashes the opaque files, attests, and uploads.
Across those separated jobs, the workflow:

- pins an exact Node version allowed by the root engine contract;
- pins the disposable builder image, compiler/toolchain, and local Node headers
  by reviewed digest in the release declaration;
- in a first network-enabled fetch phase, retrieves only package tarballs whose
  integrity matches the exact lockfile while lifecycle scripts are disabled,
  then freezes the verified package cache;
- in a second network-disabled build phase, runs the exact equivalent of
  `npm ci --omit=dev --ignore-scripts --offline` from that cache and requires a
  closed tracked inventory plus exact script-text digest for every package with
  lifecycle metadata;
- never invokes a package lifecycle command containing `prebuild-install`.
  For the exact reviewed `better-sqlite3` package, it verifies the expected
  `prebuild-install || node-gyp rebuild --release` metadata but bypasses that
  script and directly invokes the digest-pinned local `node-gyp` binary with
  fixed `rebuild --release` arguments and the pinned local Node headers. Every
  other native package needs its own reviewed direct-build adapter; secondary
  downloads, generic lifecycle execution, unknown scripts, and egress attempts
  fail;
- records the exact lockfile, dependency inventory, runtime contract, builder
  image/compiler/header digests, native binary digests, lifecycle inventory,
  and bundle file manifest in provenance-bound metadata;
- deterministically creates the canonical source ZIP, dependency layer, bundle
  ZIP, checksums, portable `artifact.json`, canonical `writer-registry.json`,
  and release declaration from tracked source and reviewed release metadata
  once, while independently byte-verifying and copying the inventory-bound
  aggregate-safe final bootstrap-receipt companion without rewriting it;
- compares every field and byte count before publication;
- generates GitHub build provenance for the final bundle,
  `writer-registry.json`, bootstrap-receipt companion, and
  `release-declaration.json` digests and refuses a provenance subject,
  repository, workflow, ref, or source-commit mismatch;
- publishes only for the exact current protected `master` commit and derived
  runtime contract with the canonical tag above; no dispatcher input can select
  or rename a durable deployment asset;
- never silently overwrites an asset;
- records the durable release tag and asset identity;
- after every referenced asset is published and read back, creates the strict
  pre-dispatch Production Gate receipt from the exact inventory, final active
  bootstrap receipt, durable artifact, release declaration, and canonical plan
  template; publishes and attests that receipt last, and exposes its safe ID and
  summary for operator review; and
- does not claim provider-side immutability unless independently enabled and
  read back.

The deploy workflow downloads the durable asset and verifies it again. A
short-lived Actions artifact may remain as build evidence, but the deploy path
must not depend on its retention window.

### Candidate Preparation

After the remote runner proves the live current release equals
`expectedCurrentRelease`, it prepares a unique inactive candidate:

1. verify target capacity and supported Node version, then re-hash the active
   rollback release's installed manifest/tree and require its label, source,
   artifact, runtime, dependency, and data-compatibility-pair identities to
   match the plan;
2. stream and verify the exact artifact and plan digest;
3. parse the outer bundle and nested archives with closed limits for compressed
   bytes (256 MiB bundle; 64 MiB canonical source), entry count (50000),
   per-entry size (64 MiB), expanded total size (768 MiB), and per-entry
   compression ratio (100); reject absolute, drive, backslash, dot-segment,
   duplicate, case-fold, and Unicode-normalization path collisions plus every
   symlink, hardlink, device, FIFO, socket, setuid, or setgid entry before
   extraction;
4. verify the bundled production dependencies, lockfile identity, native module
   loadability, runtime contract, and closed file manifest as the dedicated
   validation identity without network, package-manager, protected-config,
   live-database, or runtime-state access;
5. perform the protected release-config prepare and verify sequence through the
   installed, plan-bound root-owned validator, never a candidate-local copy;
6. require `config/proxy-servers.json` and every fixed runtime entrypoint;
7. verify file modes and release-assembly manifest;
8. run candidate-local preflight as that validation identity inside a mount
   namespace containing only the read-only candidate and synthetic temporary
   config/database/runtime fixtures; and
9. freeze the complete candidate tree as root-owned and application-UID
   non-writable; re-verify the manifest; recursively fsync every regular file and
   directory bottom-up; atomically rename the temporary release directory to its
   final inactive name; fsync the release-root parent; and reopen/re-hash the
   final-path tree and manifest after publication.

Any failure here removes only the incomplete Gate-owned temporary candidate, or
leaves a durable inactive final candidate for bounded later cleanup, and leaves
the active pointer and service unchanged.

The validation identity is distinct from both the service application UID and
the deployment SSH principal. It cannot resolve or traverse protected config,
either live database, active runtime state, backup roots, or service credentials.
Candidate code and native modules receive no production-capable UID before the
coherent backup set is complete and the previous service plus every reviewed
auxiliary database writer is quiesced. Any live pre-backup database/config
validation is performed only by fixed root-owned runner code that never imports candidate
source or dependencies and returns aggregate results. Candidate code first runs
with the application UID only after that boundary; a resulting failure follows
the committed-schema/pre-switch or post-switch recovery state as applicable.

Before admission, inventory must also prove the current and rollback release
trees are root-owned and non-writable by the application and deployment SSH
accounts. It re-hashes the rollback tree and manifest rather than trusting its
directory label, and binds those values to the fresh inventory receipt.
Candidate and previous source/dependency trees remain read-only after switch.
Protected config is root-owned, readable only by the fixed service group, and
non-writable by the application. Writable databases and other reviewed runtime
state live outside release directories. A compromised old
service process therefore cannot change the verified candidate or destroy the
rollback tree between verification and pointer switch.

The tracked `candidate-start.mjs` becomes the sole production application
entrypoint for this lane and passes a non-overridable internal runtime option
`schemaStartupMode: "existing_schema_only"` into production state construction.
The value does not come from the dispatcher, shared `EnvironmentFile`, `.env`,
or host runner. Implementation must refactor the production startup path so
that this mode first validates both configured files through read-only/query-only
connections, then opens operational connections with `fileMustExist` and every
schema initializer disabled. Normal business DML remains allowed, but startup
cannot execute `CREATE`, `ALTER`, migration helpers, or parent-directory
creation, and SQLite `schema_version` must remain unchanged. Candidate assembly
verifies the tracked entrypoint and its binding; fresh host inventory must prove
the fixed service executes it. Only the fixed database Gate described below may
perform schema work. Until that separation is implemented and tested, the
deployment workflow is not production-ready.

Every production-capable DML path must also enter through the fixed
business-mutation lease adapter before opening either database. The application
service holds a shared lease for its process lifetime; each auxiliary or
operator one-shot holds one from before database open through final commit and
close. An operator adapter first rejects a present guard or nonterminal
deployment journal, then obtains the shared lease and rechecks both conditions;
only an exact transaction-bound application or auxiliary permit can bypass
those conditions during recovery/deployment. Direct invocation without the
inherited, host-validated lease handle fails before database access. The
deployment publishes its root-owned guard,
closes the application and auxiliary permits, stops/drains those units, and then
acquires the exclusive lease; a pre-existing operator one-shot must finish
within the bounded drain or the transaction stops before backup. New operator
one-shots see the guard and fail with a retryable aggregate status. After the
exclusive backup/migration phase, only the exact transaction-bound application
and auxiliary permits may obtain shared leases while the guard remains; gated
operator mutations stay blocked until the final durable guard removal and
terminal journal publication.

This lease/guard behavior is also a rollback-release eligibility contract. The
exact installed previous release and every production-capable launch surface
must already enforce it with no direct bypass. If fresh inventory cannot prove
that fact, the first automated promotion is blocked; a separate Risk A
compatibility release must use the existing manual deployment runbook to install
and validate the lease-aware code/host bindings before this GitHub capability is
enabled.

## Credential And Transport Boundary

The GitHub Environment holds one dedicated credential set for this capability,
with names distinct from the runtime-config repair lane. The fixed host account
is `github-control-deploy`; the protected `JAPAN_CONTROL_DEPLOY_USER` value must
equal that name exactly. Its safe logical identity is recorded as a non-secret
variable; key material and pinned host-key data remain secrets.

The Environment secret set is exactly:

```text
JAPAN_CONTROL_DEPLOY_HOST
JAPAN_CONTROL_DEPLOY_PORT
JAPAN_CONTROL_DEPLOY_USER
JAPAN_CONTROL_DEPLOY_PRIVATE_KEY
JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS
JAPAN_CONTROL_DEPLOY_BINDING_KEY
JAPAN_CONTROL_DEPLOY_METADATA_APP_PRIVATE_KEY
```

The non-secret Environment variables are the fixed
`JAPAN_CONTROL_DEPLOY_CREDENTIAL_ID=japan-control-plane-github-deploy-v1`, the
current `JAPAN_CONTROL_DEPLOY_BOOTSTRAP_GENERATION` matching exact grammar
`bg1.{20-digit zero-padded sequence}.{32 lowercase hex nonce}`, and the
current lowercase 64-hex
`JAPAN_CONTROL_DEPLOY_BOOTSTRAP_RECEIPT_SHA256`,
`JAPAN_CONTROL_DEPLOY_AUTHORIZATION_BINDING_HMAC_SHA256`, and
`JAPAN_CONTROL_DEPLOY_AUTHORIZATION_STATE_SHA256`. The last value is the
unkeyed outer pointer digest over canonical generation, receipt digest, keyed
authorization HMAC, and fixed scope/App contract; it contains no raw protected
value and is never used in place of either HMAC. The binding key is an
independent random 256-bit value used only for HMAC-SHA-256 authorization
comparison; it grants no SSH or host privilege. The Environment also holds the
non-secret fixed `JAPAN_CONTROL_DEPLOY_METADATA_APP_ID` and
`JAPAN_CONTROL_DEPLOY_METADATA_APP_INSTALLATION_ID`. That dedicated GitHub App
has only repository `Metadata: read`, `Environments: read`, `Secrets: read`, and
`Variables: read`, plus organization `Secrets: read` and `Variables: read`; it
has no write, Actions, contents, deployments, administration, attestation,
OIDC, or production-host permission.
No repository-, organization-, or workstation-scoped fallback credential is
accepted.

### Bootstrap And Rotation-Recovery Transport

The static content/prepare Gate precedes the temporary SSH activation and is
what makes first rollout reachable. Under its explicit provider-console Risk A
approval, a fixed no-argument root staging helper may only write/read back the
immutable host execution generation, static prepare envelope, admission-blocking
rotation fence/journal, and `hostBundleContentReceipt`. It derives `rotationId`
from the already approved static envelope, publishes/fsyncs
`rotation_prepared`, and records that journal digest in the content receipt. It
cannot install a deployment/bootstrap key or sudoers entry, update GitHub, start/
stop the application, touch a database/pointer, or activate the staged bundle.
Therefore genesis Step 3 does not depend on the Step 5 `prepare_genesis` forced
launcher; that later one-time activation only advances the already durable
prepared journal. Provider-console staging credentials are handled and removed
under `docs/INFRASTRUCTURE_ACCESS_RULE.md`.

The temporary bootstrap provider path is separate from normal deployment and is
fully specified rather than assumed. The host has a locked
`github-control-bootstrap` principal with no standing authorized key, shell, or
sudo rule. Under one explicit Risk A provider-console Gate, an operator
first atomically publishes/fsyncs one fixed-path `activation_staging` lease that
binds the pre-existing provider `bootstrapAuthorizationGateReceiptSha256` used by
the prepare envelope plus a fresh, expiring
`bootstrapActivationGateReceiptSha256` for this one attempt. The latter hashes
the original receipt, exact `rotationId` (or explicit genesis), current journal
digest, operation, target/generations, ephemeral fingerprint, expiry, and
expected key/sudoers paths and byte digests; it is dynamic and never feeds back
into `rotationId`. The Gate then stages exactly one ephemeral public-
key entry and one mode-`0440` root-owned ephemeral sudoers fragment, fsyncs/read
backs both, and atomically publishes one root-owned activation record last for at
most 15 minutes. The key and sudoers fragment are unusable without that exact
record and the lease in `armed`. The canonical record contains its own schema/path identity and staging-
lease digest, plus the external key/sudoers path and byte digests, public-key
fingerprint, both provider/activation Gate receipt digests, closed operation,
created/expiry timestamps, target, `rotationId`,
and current/proposed generations; it never contains its own byte digest. Only
after serialization do the provider envelope, prepare journal, and closeout
evidence bind `bootstrapActivationRecordSha256`; the state lease then CASes from
`staging` to `armed` without rewriting that immutable record. The authorized-key entry uses `restrict`, the fixed no-argument root-
owned unprivileged entry shim
`/usr/local/libexec/proxy-gateway-control-plane-bootstrap-entry`, the same no-PTY/
forwarding/rc/environment restrictions as deployment, and an expiry no later
than the activation record. The shim rejects a non-empty original command or
argv, uses a clean fixed environment, and can only `execve` non-interactive sudo
for the root-owned no-argument
`/usr/local/sbin/proxy-gateway-control-plane-bootstrap`. The ephemeral sudoers
fragment permits only that exact transition, only for `github-control-bootstrap`,
and carries the activation-record identity in the launcher's mandatory readback;
it grants no shell, argument, environment, or second executable.

The fixed boot cleanup unit reads only that one staging/state lease and implements
a closed cleanup-only restart table. `staging` never arms automatically: boot
CASes it to `cleanup_pending` with
`activationRecordState: present_verified | absent_not_published` and a canonical
record digest or null, then reuses the same evidence-first cleanup chain below.
It verifies and removes only its lease-bound inert record/key/sudoers entries and
fsyncs/read backs their parents. `armed` after a reboot is
treated as controller loss, CASes to `cleanup_pending`, and never executes the
operation. `in_progress` first recreates/retains the rotation fence, terminates
and proves empty only the exact activation cgroup, then CASes to
`cleanup_pending`; it never resumes a privileged mutation automatically. A
durable operation `terminal` result is verified and CASed to the same cleanup
state. `cleanup_pending` resumes idempotently from its last fsynced substep:
`cgroup_empty -> triple_removed -> cleanup_evidence_published -> lease_removed`.
Each transition verifies the exact record/key/sudoers paths and digests, parent-
fsyncs and readbacks. The immutable cleanup evidence binds the activation Gate
receipt, staging-lease digest, record state/nullable digest, key/sudoers digests,
result, and every absence readback; a later approved resume appends that abandoned
attempt evidence to the ordered activation-attempt chain before retry. The state
lease is removed last. A crash at any remove,
evidence, or lease boundary therefore re-enters cleanup only; it cannot re-arm,
repeat the operation, clear a nonterminal rotation fence, or strand an
unreachable authorized triple. An unknown state/path/digest, extra entry, or
missing/forged lease stops for manual intervention. Thus hard crashes before
record-last publication and after terminal/cleanup CAS both have durable cleanup
anchors rather than an untracked sudo capability.

The matching private key is generated in the approved ephemeral controller,
uses the sealed-`memfd` transport below, and is never stored in GitHub, the
production Environment, a workstation file, or provider metadata. The fixed
controller pins the host key and sends one canonical bounded bootstrap envelope;
the launcher requires the activation-record digest, key fingerprint, operation,
expiry, target, generation predecessor, `rotationId`, and current durable
rotation-journal digest to match before any change. Its closed operations are
`prepare_genesis`, `prepare_rotation`, `rotation_status`,
`resume_prepared_rotation`, and `abort_prepared_rotation`; none can admit a
deployment transaction, accept an artifact/source/path/command, read database
rows, or operate outside the immutable bootstrap/authorization generation roots.

The complete activation triple is one-time. The privileged operation runs in one
activation-ID-bound cgroup whose monotonic runtime deadline is no later than the
record's wall-clock expiry; the unprivileged SSH entry shim cannot join or control
that cgroup. Both controller and root launcher recheck expiry before every GitHub
API mutation, host CAS, generation-pointer change, or terminal commit. A fixed
root cleanup unit outside the operation cgroup handles success, abort,
authenticated rejection, expiry, and controller loss. The root operation must
first CAS the activation-state lease from `armed` to `in_progress` before any mutation, which
prevents a second use, and writes a closed terminal result when it finishes. On a
terminal result or expiry, cleanup CASes only that exact lease to
`cleanup_pending`, fsyncs it, and prevents any new privileged operation. It then
sends bounded termination and kill only to that exact cgroup when still active,
waits for every descendant to exit, and leaves
any nonterminal rotation durably fenced for a fresh approved resume; deleting
`authorized_keys` alone is never treated as terminating an authenticated session.
Only after the privileged cgroup is empty may cleanup remove the key entry and
ephemeral sudoers fragment plus immutable activation record. It then fsyncs every
affected parent, writes the separate immutable consumed/cleanup evidence, removes
the state lease last, and requires the triple plus lease absent. Provider-console access and
ephemeral private material are separately cleaned/read back under
`docs/INFRASTRUCTURE_ACCESS_RULE.md`. If rotation fails after the retiring
deployment key is removed, a new provider-console approval may install a new
ephemeral key under a new `bootstrapActivationGateReceiptSha256` bound to the
same original authorization receipt, durable `rotationId`, and latest journal
digest. Each attempt receipt and activation-record digest appends to one ordered
`bootstrapActivationAttemptChainSha256` carried only forward into closeout;
this is the explicit reachable recovery channel, not a fallback deployment
credential.

The GitHub updater is split into a static capability contract and dynamic
issuance evidence. The reviewed, pre-existing
`githubBootstrapUpdaterAppContractSha256` contains no `rotationId`, receipt,
installation ID, key ID, token, issuance timestamp, or other run-derived field.
It hashes only the fixed controller digest; target repository/Environment; App
role/schema; exact permission manifest; REST method/path/name/payload allowlist;
normal cleanup procedure; controller-loss recovery procedure; and time bounds.
Only this static digest enters the prepare envelope used to derive `rotationId`.

After that ID and a separate pre-existing provider
`bootstrapAuthorizationGateReceiptSha256` exist, the Gate must create a durable
recovery anchor before its first GitHub mutation. It CAS-publishes/fsyncs an
`updater_issuance_staging` cleanup lease in the prepared host journal. The lease
contains a canonical `uir1.<64-lowercase-hex>` reservation ID over the static
contract, provider authorization receipt, fixed `rotationId`, exact App
owner/slug or ID readback, repository, Environment, attempt nonce, expected
zero-key/no-installation precondition, conflict-safe provider locator, and closed
mutation sequence. The provider readback must find exactly that dedicated App
and zero conflicting key/installation resources before continuing; zero Apps,
multiple Apps, a pre-existing key/installation, or a locator mismatch stops
without mutation.

After each allowed provider mutation, the Gate appends/fsyncs its returned safe
resource ID and state to that same reservation before the next mutation: one-use
App key first and exact repository installation second. Before the installation-
token POST, it CASes/fsyncs `token_mint_pending` with the exact reservation,
installation/key IDs, request digest, and attempt nonce. A returned token is held
only in sealed anonymous memory and its issued/expiry metadata is CASed to
`token_mint_confirmed` before any Environment API call. The token bytes are never
persisted.

Installation tokens cannot be enumerated to resolve a lost mint response. If the
POST outcome or metadata append is uncertain, recovery records
`token_outcome_unknown_may_have_minted`; it never guesses or substitutes null as
proof of no mint. It deletes and reads back absent the uniquely recorded
installation and one-use App key, which invalidates any possibly minted token,
then writes a root/provider-bound revocation proof. A definite rejected POST may
record `token_not_minted_confirmed`. The unique zero-or-one provider lookup below
applies only to the App key and repository installation, never to a token.

If a crash
occurs between a provider mutation and its journal append, recovery may inspect
only the reservation's exact App/repository locator and accepts only a unique
zero-or-one result for the one permitted next resource; multiple or unrelated
resources remain fenced for manual intervention. It deletes the unique attempt,
proves key/installation absence, and appends a canonical abandoned-attempt cleanup
record before a retry can choose a fresh reservation nonce.

Only after that staged sequence does the Gate append the completed attempt to one
canonical `githubBootstrapUpdaterIssuanceChainSha256`. Each completed or abandoned
dynamic record binds the reservation/cleanup proof, static contract digest,
provider authorization receipt, fixed `rotationId`, actual App/installation/
repository IDs (with canonical null only for a not-yet-reached abandoned step),
exact `vultr-japan-production` Environment, one-use App-key generation ID/set,
issued-at and GitHub-returned platform-expiry timestamps plus controller-enforced
use deadline (required for `token_mint_confirmed`; canonical null for
`token_not_minted_confirmed` or `token_outcome_unknown_may_have_minted` only when
the latter also binds installation/key deletion and token-invalidation proof),
exact permission/repository readback, closed completed-or-abandoned state,
cleanup/revocation result, and
predecessor record digest or null for the first attempt. It does not
contain or hash the token, final active bootstrap receipt, or future closeout
evidence. The journal CASes to `updater_issued` with the ordered chain digest
before the first Environment write; the final receipt, closeout packet, later
inventory, and deployment plan bind it only in that forward direction.

The temporary update identity is a dedicated GitHub App installation access
token distinct from the read-only metadata App and every deployment credential.
The temporary installation is selected only for
`gccwebos-com/proxy-gateway-minimal`. Its only permissions are repository
`Metadata: read`, `Actions: read`, `Environments: write`, `Secrets: read`, and
`Variables: read`, plus organization `Secrets: read` and `Variables: read`; every
other repository and organization permission is absent. `Environments: write`
is used only for the exact protected-environment policy payload and closed
reserved secret/variable names. The fixed controller rejects another repository,
Environment, endpoint, method, name, deletion, caller-supplied URL, redirect,
GraphQL request, or payload shape. Missing `Actions: read` or any extra permission
is a contract failure.

GitHub installation tokens have a one-hour platform expiry; the design does not
misstate that as 15 minutes. The controller enforces the earlier host-activation
expiry as its use deadline and stops issuing API calls at that boundary. Token
and App private key use sealed anonymous descriptors/bounded memory and never
enter the Environment or a file. On the normal path, before closeout the
controller revokes the token and proves it rejected; the separately approved
provider step then deletes/read backs absent the one-use App key and temporary
repository installation and destroys its session/material. The temporary
GitHub-owner provider session is treated as full access under
`docs/INFRASTRUCTURE_ACCESS_RULE.md`, never enters the normal workflow/controller,
and is limited by the exact Gate command/API allowlist to App key/installation
create-delete-readback for this repository and rotation. It returns only the
canonical aggregate-safe cleanup proof bound to the dynamic issuance chain;
the controller can forward that proof but never receives the owner credential.

Controller loss cannot honestly promise automatic revocation after those
anonymous credentials disappear. It durably leaves
`github_updater_cleanup_pending` and the rotation fence in place; the host
activation still expires and is cleaned independently. A new explicit Risk A
GitHub-owner recovery Gate must use a fresh, non-persisted provider session to
delete/read back absent the exact App key and installation, thereby invalidating
its installation tokens, then issue canonical cleanup evidence bound to the
same static contract, dynamic issuance chain, provider authorization receipt,
and `rotationId`. A fresh bootstrap activation may resume only that journal and
close the fence. Platform token expiry alone never counts as cleanup proof. A
later rotation requires a new provider-approved installation/key/token generation.
Any extra permission, tuple, endpoint, TTL, recovery, revocation, or proof
mismatch leaves the rotation fenced and prevents bootstrap closeout.

The normal deployment workflow cannot name, mint, install, or invoke this
principal, activation record, entry shim, sudoers fragment, launcher, cleanup
unit, provider route, or temporary GitHub update identity. Their fixed schemas
and installed executable/unit digests are part of the bootstrap execution
contract, but every activation is a separate, expiring Risk A authorization. The
root operation performs the exact `armed -> in_progress -> terminal` CAS chain
on the state lease and cannot consume it again. `prepare_genesis` and `prepare_rotation` each drive
the complete state machine as far as committed or durably fenced in one bounded
operation; `resume_prepared_rotation` continues only an exact fenced journal.
The bootstrap Gate does not report a successful
genesis, resume, or abort until the outside cleanup unit proves the privileged
cgroup empty, removes the authorized-key entry, activation record, and sudoers
fragment plus state lease, fsyncs every parent, proves all four absent, and retains only an
aggregate-safe immutable consumed/cleanup record bound to the pre-existing
provider authorization receipt, `rotationId`, activation-record digest, final
activation-attempt chain, journal digest, operation result, static updater contract, dynamic issuance chain
evidence, GitHub cleanup mode/result, and public-key fingerprint. That evidence contains no
endpoint, public-key bytes, GitHub credential, or protected value and is carried
in the protected bootstrap Gate closeout packet; its absence or mismatch prevents
a subsequent inventory, normal Artifact Gate, or production admission from being
eligible.

The host authorization and privilege boundary must:

- be dedicated to `control-plane-app` deployment;
- lock password login and provide no unforced interactive login route;
- keep the account, its home, and its root-owned authorized-key binding
  unwritable by `github-control-deploy`;
- force the no-argument, root-owned launcher
  `/usr/local/sbin/proxy-gateway-control-plane-deploy` for the sole key;
- disable interactive shell, PTY, X11, agent and TCP forwarding, user rc, and
  environment injection;
- grant one non-interactive sudoers entry for that exact launcher with no
  caller-supplied arguments, while rejecting any non-empty process argv or
  unexpected original SSH command inside the launcher;
- execute `systemd-run` only inside the reviewed root launcher with either the
  exact Gate-derived deployment-transaction unit template or the exact
  plan-bound migration unit/cgroup template and dedicated UID, never as a generic
  unit/command selector or sudoers command available to the SSH principal;
- keep the launcher and its libraries root-owned and non-writable, and keep the
  release root, backup root, transaction journal, receipts, service unit, and
  protected configuration root-owned and non-writable by the SSH principal;
- restrict the launcher's effective-root operations to the fixed release root,
  approved application service, exact reviewed auxiliary-writer unit set,
  exact Gate-derived deployment-transaction unit lifecycle,
  exact plan-bound migration transient unit/cgroup create/start/terminate/
  inactive-readback and dedicated-UID transition, exact transaction-local
  database-capability custody unit/socket lifecycle, protected backup roots, and
  Gate-owned transaction state;
  and
- record only key type and public fingerprint in Gate evidence.

The three bootstrap-lifecycle receipts use strict versioned canonical UTF-8 JSON
schemas. Every parser rejects unknown, missing, duplicate, or out-of-order
fields, an unknown enum, a wrong type-domain tag, a non-canonical encoding, or a
digest that does not match the exact bytes. `rotationId` matches exactly
`^br1\.[0-9a-f]{64}$`; its suffix hashes a separate canonical prepare envelope
containing the pre-existing provider authorization receipt digest, predecessor
generation/receipt, proposed generation, target, reviewed static contract digests
(including the static updater capability contract), and a 128-bit nonce. It
explicitly excludes the activation-record bytes/digest, updater App/installation/
key/token issuance evidence, per-attempt activation Gate receipts/chain, final
active receipt, and closeout evidence, so no
dynamic object can point back into the hash that names its rotation.
Their closed logical shapes are:

```yaml
hostBundleContentReceipt:
  schemaVersion: "1"
  receiptType: host_bundle_content
  rotationId: exact safe content-addressed rotation identity
  bootstrapAuthorizationGateReceiptSha256: exact pre-existing provider authorization receipt
  bootstrapGeneration: exact new bg1 sequence/nonce id
  previousBootstrapGeneration: exact current generation or null for explicit genesis
  previousBootstrapReceiptSha256: exact current receipt digest or null for explicit genesis
  rotationPrepareJournalSha256: exact durable host prepare-record digest
  target: japan-control-plane
  releaseUnit: control-plane-app
  stagedBundleManifestSha256: exact staged root-owned bundle manifest digest
  hostExecutionContentSha256: digest of every staged executable/library/unit/drop-in
  ownershipModeContractSha256: exact staged ownership/mode contract digest
  createdAt: RFC 3339 UTC timestamp
  expiresAt: bounded bootstrap expiry
hostActivationReceipt:
  schemaVersion: "1"
  receiptType: compatibility_host_activation
  rotationId: exact parent rotation identity
  bootstrapAuthorizationGateReceiptSha256: exact parent provider authorization receipt
  bootstrapGeneration: exact parent generation id
  previousBootstrapGeneration: exact parent predecessor or null for explicit genesis
  previousBootstrapReceiptSha256: exact predecessor receipt or null for explicit genesis
  rotationPrepareJournalSha256: exact parent prepare-record digest
  parentContentReceiptSha256: exact hostBundleContentReceipt digest
  activationMode: compatibility_deploy | existing_release_activation
  compatibilityArtifactSha256: exact compatibility artifact digest or null
  activeHostExecutionSha256: independently re-hashed active host byte-set digest
  activeRollbackReleaseSha256: exact healthy rollback release identity digest
  applicationRecoveryBindingSha256: exact active unit/target/drop-in binding digest
  createdAt: RFC 3339 UTC timestamp
  expiresAt: bounded credential-bootstrap expiry
bootstrapReceipt:
  schemaVersion: "1"
  receiptType: active_deployment_bootstrap
  rotationId: exact parent rotation identity
  bootstrapGeneration: exact parent generation id
  previousBootstrapGeneration: exact predecessor or null for explicit genesis
  previousBootstrapReceiptSha256: exact predecessor receipt or null for explicit genesis
  rotationPrepareJournalSha256: exact durable host prepare-record digest
  generationTransitionSha256: canonical predecessor/new-generation CAS evidence
  parentContentReceiptSha256: exact hostBundleContentReceipt digest
  parentActivationReceiptSha256: exact hostActivationReceipt digest
  bootstrapAuthorizationGateReceiptSha256: exact pre-existing provider authorization receipt
  bootstrapActivationRecordSha256: exact immutable activation record used to create this receipt
  githubMetadataAppContractSha256: exact read-only App/installation/scope contract
  githubBootstrapUpdaterAppContractSha256: exact static updater capability contract
  githubBootstrapUpdaterIssuanceChainSha256: exact dynamic rotation-bound issuance-chain digest
  expectedAuthorizationScopeNamesSha256: exact reserved name/scope-set digest
  githubAuthorizationBindingHmacSha256: keyed current GitHub authorization binding
  hostAuthorizationReadbackHmacSha256: host-keyed installed authorization binding
  hostAuthorizationEvidenceKeyGeneration: safe root-only evidence-key generation
  bootstrapRecoveryContractSha256: exact fixed bootstrap launcher/activation/cleanup contract
  hostExecutionStaticContentSha256: exact pre-receipt active bytes/static-contract digest
  criticalIdentityFenceContractSha256: exact all-adapter fail-closed critical fence contract
  receiptRecoveryChallengeContractSha256: exact two-phase host challenge/status contract
  receiptRecoveryWorkflowSha256: exact protected workflow bytes digest
  receiptRecoveryControllerSha256: exact current no-write controller bundle digest
  receiptRecoveryParserRegistrySha256: exact retained-schema parser registry digest
  createdAt: RFC 3339 UTC timestamp
```

The content Gate emits only `host_bundle_content`; the manual activation Gate
consumes that exact unexpired parent and emits only
`compatibility_host_activation`; and the credential/authorization Gate consumes
both exact parent digests and emits only `active_deployment_bootstrap`. Each Gate
persists a typed one-time edge marker for the same `rotationId` and generation:
content-to-activation and activation-to-final are separate required edges, while
all three require the same pre-existing provider authorization receipt and the
final Gate also proves the content parent is the activation parent. A receipt
cannot be parsed or replayed as another type, skipped in the chain, substituted
from another target or host bundle, or accepted after expiry. Only the final
receipt type can become `bootstrapReceiptSha256` in a normal artifact, plan,
OIDC assertion, admission, journal, or terminal receipt.

`hostExecutionStaticContentSha256` is computed before the final receipt and
explicitly excludes every receipt digest, generation pointer, dynamic activation/
issuance object, and closeout evidence. The later deployment-plan
`hostExecution.contractDigest` is a different outer digest that combines those
already-computed static and dynamic fields including `bootstrapReceiptSha256`;
neither digest is an input to itself.

There is no cross-system atomic-write claim. Genesis is a separately approved
one-time transition: it requires no current host or GitHub generation, uses
sequence `00000000000000000001`, and records both predecessor fields as `null`.
Every later credential, policy, key, Environment, host-authorization,
database-binding key/helper, or execution-bundle rotation chooses a fresh
content-addressed `rotationId`, proves exact current generation/receipt N on both
authorities, and uses compare-and-swap to require the new sequence equal N+1 with
a fresh nonce. Before the first new receipt is emitted, the host proves there is
no authenticated artifact reservation, nonterminal transaction, recovery unit,
or unattached/nonterminal controller closeout lease. A terminal pending closeout
is allowed only when its exact N receipt/replay record is fsynced, immutable,
retained, and independently status-readable. The host then acquires the shared deployment/rotation lock, and
atomically publishes/fsyncs a `rotation_prepared` journal plus admission-blocking
fence binding `rotationId`, N receipt/generation, N+1 generation, expected old
GitHub receipt/HMAC/outer-state tuple, old host-authorization HMAC, and every
intended static changed-contract digest including the static updater capability
and bootstrap staging/entry/sudoers/cleanup contracts. Dynamic activation-record
and updater-issuance evidence are not inputs to `rotationId`; after issuance they
advance the journal through separate `activation_armed` and `updater_issued` CAS
states that bind the already-fixed ID. All later stages CAS
that exact journal digest. The durable fence remains across separate workflow
runs and approvals; every such run also uses the shared GitHub concurrency key.

Generation N remains the immutable current host state and its authorization is
retained while N+1 content and activation are staged. With the host fence still
blocking every deployment admission, the final Gate installs the pending N+1
authorization, removes and proves absence of superseded N authorization, and
constructs the canonical pending N+1 receipt without making it current. It then
updates the closed GitHub Environment generation, receipt-digest, HMAC, and
outer-state pointer variables and proves complete N+1 scope/policy/value
readback. A pending receipt consumes no parent edge and has no authority until
that exact digest becomes the host current pointer; if recovery appends another
updater-issuance record, the old pending bytes are durably rejected/deleted and
the receipt plus GitHub tuple are recomputed from the new chain.
Finally it publishes/fsyncs and activates that exact pending receipt as
the host current pointer and re-hashes N+1 installed state. Only after
both equal the prepared N+1 transition does it CAS the journal to
`rotation_committed_cleanup_pending` and fsync/read back that record; the
rotation fence remains. On the normal path, the controller first revokes and
readbacks the dynamic updater identity, writes its canonical GitHub cleanup proof
into that journal, and lets the privileged bootstrap operation exit. The fixed
root cleanup unit outside that cgroup then performs the host triple/state-lease
cleanup, records its proof, and is the surviving closeout coordinator. Only when
both proofs exactly match the prepared static contract, dynamic issuance chain,
activation record, final receipt, and journal may it CAS
`rotation_cleanup_complete`, atomically publish/fsync the separate protected
closeout evidence, CAS `rotation_closed`, and remove/fsync/read back the rotation
fence last. Thus partial GitHub updates, a host/GitHub disagreement, crash,
cancellation, or lost response leaves deployment fail-closed rather than
selecting either side implicitly. The same `rotationId` may be resumed forward
only under a fresh Risk A approval. Controller loss may let the root unit finish
host cleanup, but without GitHub cleanup evidence it persists
`github_updater_cleanup_pending` and leaves the fence. A fresh GitHub-owner
recovery receipt plus bootstrap activation is required before that same root unit
can close it. Abort follows the identical cleanup barrier and is allowed only
after restoring and re-reading exact N on both authorities, completing both
cleanup proofs, and durably CAS-writing `rotation_aborted_closed`; otherwise the
fence remains for manual intervention. N
receipt/evidence remains immutable for prior terminal records even after its
active authorization is retired.

Host execution content is installed in immutable generation directories; a
running application guardian, transaction, recovery chain, or terminal receipt
continues to reference its exact generation by absolute digest-bound identity.
Nothing overwrites generation N in place. A rotation that changes service/
recovery/drop-in, custody/database helper or key, or other active execution bytes
must use the activation Gate to quiesce/restart and validate the exact N+1
bindings before the final authorization transition; an authorization-only Gate
cannot silently replace active execution. Generation N execution bytes and keys
needed to interpret retained N journals/receipts remain available until their
fixed retention and closeout barriers pass.

Deployment-key handoff is also fenced. A pending N+1 deployment key and a
retiring N key are both forced-command restricted but neither can admit a
deployment while any non-closed rotation journal/fence exists. The separately approved temporary
bootstrap provider identity—not either deployment key—is the only identity that
may invoke the exact rotation status/resume/abort protocol. N+1 becomes
deployment-eligible only after its exact authorization is the sole read-back
active binding, the final receipt/current pointer and GitHub tuple agree,
`rotation_closed` is durable, closeout evidence matches, and the fence is removed. If N has already been
removed when a failure occurs, a new bootstrap approval/provider injection is
required to resume; no deployment-key fallback is accepted.

A fixed root-owned boot preflight runs before either deployment or rotation
admission. If it sees a nonterminal rotation journal, it recreates/fsyncs a
missing rotation fence, readbacks the actual GitHub-independent host generation/
receipt/authorization state, and exposes only a bounded aggregate
`rotation_resume_required` status. It never chooses N or N+1, clears the fence,
or starts deployment automatically. Only the exact separately approved
resume/abort protocol above may advance that journal; unknown/partial host state
becomes manual intervention while the existing application state is left alone.

The credential/authorization Gate uses its separately approved temporary
provider identity to list the Environment secret names without reading values;
official GitHub REST permissions require repository `Environments: read` for
that operation. It also lists repository/organization secret and variable names
and proves that every reserved `JAPAN_CONTROL_DEPLOY_*` deployment name exists
only at `vultr-japan-production`, with no same-name repository or organization
fallback visible to this repository. The temporary identity is not stored in the
deployment workflow or Environment. It additionally verifies the installed
metadata App's exact read-only permission manifest and repository/org scope.
After proving those scope invariants, it creates the new generation and uses
`JAPAN_CONTROL_DEPLOY_BINDING_KEY` to compute
`githubAuthorizationBindingHmacSha256` over one tracked canonical message:
exact Environment name and complete protection-policy readback, the expected
secret/variable name sets, exact-scope/no-fallback attestation digest, metadata
App identity/permission digest, fixed credential ID, generation,
host/user/port values, deployment public-key fingerprint, and the complete
canonical known-hosts endpoint/key tuple. This is HMAC-SHA-256, not an unkeyed
hash of low-entropy host metadata. The corresponding host binding is
HMAC-SHA-256 under a separate random 256-bit root-only host
authorization-evidence key. Its canonical message binds the same generation to
the installed account, sudoers and authorized-key restrictions, public-key
fingerprint, launcher binding, and pinned host-key contract. The fixed helper
and key-generation IDs are part of the host-execution contract; the key never
leaves the host. The Gate cross-checks both sides and fails on a missing, extra,
renamed, swapped, stale, or mismatched binding. No receipt contains either HMAC
key, a secret value, an unkeyed host-authorization commitment, raw private key,
raw host, port, or raw known-hosts entry.

The bootstrap Gate also records every launcher/recovery/unit/drop-in digest,
business-mutation lease helper and guard contract, migration-admission adapter,
writer-registry verifier, database-binding helper/key generation, database-
identity lease/no-follow opened-handle adapter and transaction-local FD-custody
contract/helper, host-authorization HMAC helper/key generation, validation
identity and mount-namespace contract,
bootstrap static-prepare helper plus recovery staging/entry shim/root launcher/ephemeral-sudoers/activation-
record/cleanup-unit static contracts, exact dynamic activation-record and updater-
issuance evidence, exact static updater App/permission/API contract, aggregate-
safe one-time closeout evidence, and controller-
closeout finalizer timer/service contract,
reviewed auxiliary-writer unit definition, ownership/mode check, and fixed
service/release-root binding using aggregate-safe evidence. Any ownership,
digest, argument, unit, namespace, effective-UID, Environment, credential, or
fingerprint mismatch fails before admission. After approval but before any SSH
connection, the fixed scope-attestor step references only the metadata App ID,
installation ID, and private key, mints one short-lived installation token, and
uses it to list Environment/repository/organization secret and variable names.
It requires every reserved name to occur exactly at `vultr-japan-production`,
none at either wider scope, the Environment set to equal the closed list, and
the App permission/installation/repository tuple to equal the final receipt. If
the App inputs themselves resolved from a fallback, the missing Environment
names and wider-scope duplicates make this step fail. The token and private key
are held only through the sealed-anonymous/in-memory mechanism below; returned metadata
is filtered in memory to the fixed reserved names, reduced to the canonical
scope-attestation digest/booleans, never logged or retained, and destroyed before
host credential materialization.

Only after that exact-scope attestation succeeds does the fixed workflow require
the live non-secret generation/receipt/HMAC variables to equal the plan and
canonical final receipt and the outer-state variable to equal the independently
recomputed pointer digest. It re-reads and canonicalizes the complete Environment
policy, derives the deployment and pinned-host-key fingerprints from the
protected values, recomputes the HMAC in memory with the new scope-attestation
digest, logs none of its input, and requires exact equality. An unrelated non-reserved secret is never
dynamically addressable; any reserved-name scope drift or change to an expected
secret, policy, credential ID, generation, receipt/state pointer, host authorization, host key, or
execution bundle fails and requires the complete fresh three-stage bootstrap
chain.

The credential Gate stores the canonical final receipt as a root-owned host copy
and returns the identical aggregate-safe bytes in its protected evidence packet.
The next fresh read-only inventory re-hashes the host copy, requires byte equality
with that packet, and carries those safe bytes plus digest. The normal Artifact
Gate publishes them as the fixed attested companion
`bootstrap-receipt-{bootstrapReceiptSha256}.json`; the release declaration and
Production Gate receipt bind that digest. The public companion contains only the
host-keyed authorization HMAC and its safe key-generation identifier, never an
unkeyed host/user/port/key commitment. Deployment preflight downloads and authenticates that
companion before approval, and after approval uses its inner generation/HMAC
fields plus the outer receipt/state pointers for the live comparison above. The
host independently compares the same plan generation/receipt/HMAC/state tuple
and outer digest to its root-owned copy and installed state.

`bootstrapReceiptSha256` hashes the final canonical receipt bytes, is part of
`hostExecution.contractDigest`, and is bound through the release declaration,
Production Gate receipt, deployment plan, OIDC authorization, host journal, and
final receipt. On every admission the host re-hashes its root-owned receipt and
recomputes the host authorization HMAC over installed state with the root-only
evidence key; a matching receipt ID without matching bytes, helper/key
generation, or HMAC is rejected.

Every plan carries the expected launcher, recovery target/unit bundle, service
drop-in digests, contract IDs, and bootstrap receipt ID. Before accepting an
admission, the root launcher re-hashes its installed executable/libraries,
every recovery phase target/oneshot/guard/permit/drop-in plus the critical
recorder, business-mutation lease helper and guard, migration-admission adapter,
writer-registry verifier, database-binding helper/key generation, sudoers
binding, authorized-key binding, database-identity lease/opened-handle adapter,
transaction-local database-capability custody helper/unit/socket,
host-authorization HMAC helper/key generation, bootstrap static-prepare helper
and recovery staging/entry/
launcher/ephemeral-sudoers/activation/cleanup static contracts, static updater-
App contract, current protected dynamic issuance chain and bootstrap-closeout evidence,
controller-closeout and external critical-finalizer units, receipt-recovery
challenge/workflow/controller/parser-registry contracts, validation sandbox, and reviewed
auxiliary-writer unit definitions, then requires exact
agreement with the plan and bootstrap receipt.
The OIDC authorization digest, durable journal, and final receipt bind the same
values. A stale, partially upgraded, or locally changed host execution bundle is
an admission rejection and cannot interpret a newer plan.

The launcher starts with a fixed absolute executable/interpreter path, a clean
environment, fixed `PATH`, restrictive `umask`, bounded file sizes and runtime,
and no caller-controlled working directory. Its execute protocol is a strict
two-step handshake. First it accepts at most 64 KiB containing only the bounded
plan, authorization record, and OIDC token. It validates grammar, plan/host
digests, token signature/claims/audience, clock, the independently parsed
inventory/Gate/effective-plan expiries, current bootstrap generation/receipt/
HMAC/outer-state,
absence of any prepared/committing rotation fence, replay, quota, and lock
availability before asking for any artifact byte. An invalid first frame creates
no durable file, tombstone, receipt, transaction, or Gate-owned directory.

Only after successful two-factor validation does the launcher atomically
consume/reserve the `jti`/token/transaction and return a bounded
`ready_for_artifact` response. It then accepts exactly `artifact.sizeBytes`
within a fixed transfer deadline, hashes while streaming into one quota-bounded
temporary file, and rejects truncation, trailing data, or digest mismatch. Only
a fully verified artifact can become an accepted transaction and start the
host-local unit.
Pre-backup dependency/native/candidate checks run only as the isolated
validation identity and namespace above. Fixed runner validators may inspect
live database/config metadata without importing candidate code. After coherent
backup and quiescence, reviewed database migration code runs under its fixed
least-privilege identity without package-manager or network access, and the
candidate service later runs as the fixed application account. Loopback health
uses only the fixed loopback address. Public health runs through a separate
root-owned, no-argument helper as a data-unprivileged probe identity; it accepts
no URL, credential, body, proxy, or redirect and permits only DNS plus TLS to the
fixed reviewed hostname on port 443. It returns aggregate status only.
Effective root is retained only for the reviewed backup, ownership, atomic
pointer, fixed service and reviewed auxiliary-writer unit state, exact
Gate-derived deployment-transaction unit lifecycle, exact plan-bound migration
unit/cgroup lifecycle plus dedicated-UID transition, exact transaction-local
database-capability custody unit/socket lifecycle, lock, and transaction state
operations. It cannot name another unit, executable, UID, or cgroup.

Before invoking SSH, the fixed local controller strictly parses
`JAPAN_CONTROL_DEPLOY_KNOWN_HOSTS` as exactly one LF-terminated canonical record
`[host]:port ssh-ed25519 base64-key` whose host and decimal port exactly equal
the protected endpoint values and whose decoded key/fingerprint equal the final
bootstrap receipt HMAC input. It rejects CR/NUL, comments, blank/additional
lines, another key or key type, duplicate endpoints, aliases, hashed hosts,
wildcards, comma lists, `@cert-authority`, `@revoked`, any other marker, and
non-canonical base64. The HMAC and bootstrap Gate bind the complete tuple, not a
standalone fingerprint.

Before any protected value is read, the fixed controller performs a non-secret
capability probe using `memfd_create(MFD_CLOEXEC | MFD_ALLOW_SEALING)`, mode
`0600`, a dummy byte, and the complete `F_SEAL_WRITE | F_SEAL_GROW |
F_SEAL_SHRINK | F_SEAL_SEAL` set; it verifies the seals with `F_GET_SEALS` and
closes the probe. The fixed metadata attestor then creates an actual descriptor
with those same flags/mode, writes the App private key only there, applies and
verifies the complete seal set, and passes only the controlled child duplicate
below. It mints the installation token in bounded memory, performs only the
scope reads above, and closes both before any SSH credential is referenced.
Neither value is written to a command line, linked path, job output, summary,
artifact, or log. Unsupported capability fails before secret read; an unexpected
actual-descriptor/seal failure closes the anonymous object and fails before
child spawn. There is no named-file fallback.

The controller invokes `ssh -F /dev/null` with `BatchMode=yes`,
`IdentitiesOnly=yes`, `StrictHostKeyChecking=yes`, the exact private
`UserKnownHostsFile`, `GlobalKnownHostsFile=/dev/null`, no forwarding,
`PasswordAuthentication=no`, `KbdInteractiveAuthentication=no`,
`PreferredAuthentications=publickey`, `ConnectTimeout=10`,
`ProxyCommand=none`, `ProxyJump=none`, `KnownHostsCommand=none`,
`PermitLocalCommand=no`, `ControlMaster=no`, `PKCS11Provider=none`, and
`SecurityKeyProvider=none`, with no default key or agent fallback. Before reading either protected value, the fixed controller
completes the same non-secret flags/mode/full-seal probe, then creates two
`MFD_CLOEXEC | MFD_ALLOW_SEALING` anonymous objects, writes the private key and
canonical known-hosts bytes only to their respective mode-`0600` descriptors,
applies/verifies the complete seal set, and passes only controlled
`/proc/self/fd` child duplicates to that one SSH process. Any actual failure
closes both descriptors before spawn and has no named-file fallback. Descriptor
close, controller termination, or runner loss releases the anonymous inodes. Artifact,
plan, and aggregate-safe receipt files use mode `0600` in the runner temporary
directory and are deleted with absence readback in `always()`.

Every sensitive descriptor is created explicitly with `MFD_CLOEXEC`; there is no
default-flag assumption. The fixed no-shell `posix_spawn` path uses closed
file-actions to `dup2` only the exact sealed descriptors into fixed child slots,
thereby clearing close-on-exec only for those target slots, and closes every
unrelated descriptor. The attestor sets its received slot close-on-exec
immediately after reading; the SSH invocation disables ProxyCommand,
KnownHostsCommand, LocalCommand, PKCS11/SecurityKey providers, multiplexing, and
all other local-child mechanisms, so it cannot propagate the slots to a local
grandchild. Numeric `/proc/self/fd` references are fixed source constants, never
caller input. Spawn failure closes parent copies. No shell, environment
expansion, generic `pass_fds`, or fallback path may broaden the inheritance set.

Every transport step forbids shell xtrace and debug SSH output. The fixed
controller captures bounded SSH stdout/stderr through anonymous pipes in memory,
never a linked file or Actions log, validates only the bounded admission/status/
receipt schemas, discards the raw buffers, and prints fixed safe codes and
aggregate fields. SSH/client/parser failures map to a closed sanitized code
without printing the captured line, host, user, path, token, remote error, or
response body. Tests force normal exit, signal termination, parser crash, and
runner-step cancellation and require no linked credential/capture path and no
sentinel in later steps or logs. GitHub secret masking is defense in depth, not
the redaction mechanism.

Creating, rotating, testing, or revoking the credential and host authorization
requires a separate Risk A Gate. The source PR creates none of them.

## Host Transaction

### Ownership And Durability

The fixed root launcher first validates the bounded authentication frame under a
single volatile concurrency/rate semaphore, then acquires the host-local
exclusive deployment lock only to create the authenticated reservation. Before
that reservation it may return a bounded `accepted: false` safe reason for
envelope, ownership, identity, lock, quota, or replay rejection, with zero
durable write. The authenticated `ready_for_artifact` and final acceptance forms
are each at most 2 KiB and echo the exact bindings. On full artifact acceptance,
the launcher starts a bounded host-local transaction in a transient systemd unit
and returns one aggregate acknowledgement containing only `gateId`,
`planDigest`, `transactionId`, `acceptedAt`, and `accepted: true`. Once admitted,
the host transaction owns completion rather than the SSH connection. The unit
keeps the transaction and rollback watchdog alive if GitHub is cancelled or the
network disconnects. It has a 15-minute runtime maximum, uses a Gate-derived
fixed-name grammar, is
collected after completion, and installs no per-deployment unit file. No
permanent Actions runner or generic daemon is installed.

Before the transaction creates a candidate path or performs any later host
mutation, it atomically publishes/fsyncs the initial nonterminal journal and
recovery guard and reads both back. Failure to establish that durable recovery
authority starts no mutation and yields no deployment claim.

The separate credential/runner bootstrap Gate installs a fixed root-owned,
phase-chained recovery bundle before this capability is enabled. The transient
transaction starts its first target on failure; boot does the same when either a
root-owned guard or any nonterminal journal exists, recreating and fsyncing a
missing guard before acting. Each phase obtains the same
exclusive lock while it acts, and the durable recovery marker makes every
launcher admission fail closed between phases. Fixed `OnSuccess`/`OnFailure`
target chaining queues the next phase only after the current unit exits, so a
single systemd transaction never contains both the stop and later start job:

1. **Fence and reconcile:** the first oneshot closes the application and
   auxiliary-writer permits with parent-directory fsync and absence readback,
   explicitly stops the candidate service and every reviewed auxiliary writer,
   terminates only the fixed plan-bound migration cgroup and proves it empty,
   waits for every pre-guard gated business-mutation one-shot to finish, obtains
   the exclusive business-mutation lease, and either upgrades the live custody
   helper or starts the exact replacement helper under the reboot rules below.
   That helper retains the exclusive database-identity lease and pins/verifies
   both actual SQLite handles through the no-follow adapter. The oneshot proves
   unit/entrypoint inactivity plus prior-process exit. Only then may it read the journal, choose the exact
   old/new plan-bound release, durably correct/read back the pointer, persist the
   desired application/auxiliary-writer states, and exit, releasing only its
   business-mutation lease; the custody helper retains database capability.
   It never starts or waits for a later application/auxiliary-writer start.
2. **Application start:** after the first unit is terminal, a distinct target
   atomically publishes and fsyncs the application permit bound to the exact
   transaction and selected release, reads it back, and queues a fresh
   `proxy-gateway-candidate.service` start. The fixed service guardian uses the
   authenticated custody protocol to receive duplicated verified database-file
   capabilities and the identity-lease OFD, downgrades that same lease
   description from exclusive to shared with no unlocked interval, starts the
   candidate child with only the file capabilities, and waits for its early-open
   actual-handle proof before acknowledging custody/readiness. It retains the
   lease for the service lifetime and grants that exact transaction-bound
   application a shared business-mutation lease while the guard continues to reject operator
   one-shots. A previously active process can never make the start a no-op.
3. **Application validation:** a separate oneshot runs after the completed start
   job and declares `Wants=network-online.target` plus
   `After=network-online.target`. It validates process identity, working release,
   restart count, local health, and the bounded public probe. If candidate
   validation fails, it persists the previous release as the one allowed code
   rollback and re-enters fence/reconcile once; failure of that previous-release
   validation becomes critical.
4. **Auxiliary-writer restore:** only after application validation succeeds does
   another oneshot atomically publish the root-owned auxiliary-writer permit,
   bind it to the transaction and selected release, fsync its parent, read it
   back, start only the exact previously active
   reviewed auxiliary units with transaction-bound shared business-mutation and
   database-identity leases plus actual-opened-handle proofs, wait for
   those independent start jobs, and prove exact unit state plus the
   no-loss/no-duplicate checkpoint contract. Writer drop-ins use the permit as
   an `ExecCondition`; they are not ordered after or dependent on this restore
   unit, so synchronous state readback cannot form a cycle.
5. **Finalizer:** an independent final oneshot rechecks application and
   auxiliary-writer state, proves no gated business mutation bypassed the guard,
   rechecks every durability barrier, proves the validated runtime holders retain
   their shared identity leases, tells the custody helper to close its duplicate,
   and reads back that transient helper inactive. It removes the recovery guard last
   with parent-directory fsync and absence readback, then atomically publishes and
   fsyncs one canonical terminal record containing both aggregate receipt and
   replay marker. No earlier phase may write a success receipt.

Only that durable terminal record plus matching pointer/permit/guard readback
makes the journal complete and a boot recovery a no-op. The chain leaves a verified pre-switch state
unchanged, validates the previous release after committed additive schema, or
restores and validates the previous code after an incomplete post-switch state.
It never restores a database backup. The chain has a four-minute aggregate
runtime maximum; no phase or helper is permanent, accepts caller/inbound network
input, or makes an outbound request other than the fixed public validation probe.

Each phase has bounded `Restart=on-failure` behavior. Exhausted retries,
`RuntimeMaxSec`, an invalid transition, or an exhausted single code-rollback
attempt invokes the fixed root-owned critical-state recorder. That recorder may
only durably close/read back the application/auxiliary-writer permits, stop and
confirm inactive the fixed application, reviewed auxiliary writers, and fixed
migration cgroup, retain the guard so new gated business mutations remain
rejected, attempt one bounded exclusive-lease drain without killing an operator
process, fsync `critical_finalize_pending`, and preserve journal/evidence before
it exits. It
cannot switch a pointer, start a service, open a database for writing, or make a
network request. If power or the systemd manager disappears before it runs, the
nonterminal journal makes boot re-enter fence/reconcile. All targets, units,
guards, permits, restart rules, and drop-ins are part of the plan-bound
recovery-bundle digest.

The recorder does not make a failure terminal merely by writing that marker. A
separate fixed root-owned
`proxy-gateway-control-critical-terminal-finalizer.service`, outside every
transaction/recovery/recorder cgroup and ordered only after those units exit,
owns the sole critical-terminal publication path. It has no network, service-
start, pointer, release, config, database-open, or database-write authority. It
first proves the application, every auxiliary writer, and every migration/
custody/transaction/recovery/recorder cgroup and unit inactive or absent; every
database capability and opened handle closed; both application/auxiliary permits
closed; and the recovery guard retained/read back. It then fresh-acquires and
readbacks the exclusive business-mutation lease plus the one global database-
identity OFD lease whose single open-file-description contract covers both
logical databases, proving there is no hidden guardian/config/operator duplicate.
While it still holds both exclusive leases, it atomically publishes/fsyncs a
transaction-bound `critical_identity_fence` and reads it back. Every config/path
replacement helper and every application/auxiliary/operator/migration/recovery
database-open adapter must reject this fence both before and after attempting the
global identity lease; only a separately approved manual recovery Gate may later
remove it.

Only then may this external finalizer atomically publish the canonical
`critical_terminal_record` (aggregate receipt plus replay marker) and bind the
initial controller-closeout lease through the normal terminal durability barrier;
the record binds the held-at-publication global-identity/business-lease proof and
exact critical-fence digest. It releases/readbacks both exclusive leases only
after that record is durable, then exits immediately. The record is not externally
terminal merely because its bytes exist: the status route withholds it until
systemd independently reads the finalizer inactive, revalidates the unchanged
guard/fence/closed permits, and fresh-acquires/readbacks/releases the same single
global identity lease and business lease. The fence prevents any reviewed helper
from racing that post-exit proof. If the finalizer hangs, a holder prevents either
exclusive lease, any executable/handle/capability/permit/guard/fence proof is
unavailable, or the post-exit lock/inactive readback fails, status remains
`critical_nonterminal_manual_intervention_required` and emits no valid terminal
receipt. Boot terminates an over-deadline finalizer, relies on OFD release at
process death, and idempotently requeues only this finalization step after the
original units are inactive; it never reruns production mutation.

Before every service stop, schema commit, pointer switch, or restart, the
transaction atomically persists and fsyncs the next recovery state and parent
directory. Normal SIGTERM handling invokes the same convergence logic;
`RuntimeMaxSec`, SIGKILL, transient-unit failure, or host reboot falls through
to the fixed recovery chain. Failure to reach and validate a safe old or new
code state persists `critical_finalize_pending`; only the external finalizer may
advance that marker to terminal `critical_manual_intervention_required`, and
automation otherwise stops.

Every filesystem mutation uses a temporary object in the same parent, an atomic
rename or exact unlink, parent-directory fsync, and read-only presence/absence
plus identity readback. The target filesystem must support file and directory
fsync with the required semantics or the Gate is ineligible. In particular:

- candidate publication is not durable until every file/directory, the atomic
  final-directory rename, release-root parent, and final tree manifest pass the
  barrier described above;
- before switch or rollback, the journal durably records
  `pointer_switch_pending`; the runner creates a temporary `current` symlink in
  the same parent, atomically renames it, fsyncs the parent, reopens it with
  readlink/canonical identity checks, and re-hashes the selected immutable
  release before any service start;
- application/auxiliary-writer permits and the recovery guard require the same
  atomic publish/unlink, parent fsync, and presence/absence readback on every
  transition;
  and
- success is impossible until candidate, backup set, pointer, permits, service,
  writers, and guard-removal barriers all pass, after which the single terminal
  receipt/replay record is atomically published and its parent fsynced.

A crash after any rename but before its parent fsync leaves a nonterminal journal.
Boot re-reads actual filesystem state and idempotently repeats the required
publish/barrier; it never infers durability from an intended journal value. A
terminal record can therefore never be more durable than the production state
it claims.

Both transaction and recovery units disable shell xtrace and core dumps and set
`StandardOutput=null` plus `StandardError=null` so child output cannot enter
journald. The reviewed runner captures each child stream internally with a
strict byte bound, maps it to a fixed safe code, and deletes the raw capture
before final receipt; recovery removes abandoned captures before acting. Only
the aggregate state journal and receipt persist. Tests inject sentinel secret,
path, response-body, and database-row values and require their absence from the
system journal, retained state, and controller evidence.

The transaction stores a Gate-owned state journal, durable authenticated
admission state, and the combined terminal receipt/replay record. The bootstrap
fixes a bounded volatile per-principal authentication semaphore/token bucket and
a durable state quota. At most one authenticated artifact reservation and 128
terminal admission/transaction records may exist; each schema and file has a
fixed byte cap. A deterministic compactor may remove rejection/replay records
only after 24 hours, when every bound token and plan is unusable, and ordinary
terminal deployment receipts only after 30 days. It never removes an active,
nonterminal, in-retention, latest target-state, or latest critical record. If
quota cannot be safely recovered, a valid OIDC request is rejected before
artifact transfer. An
SSH-key-only attacker can therefore consume only the bounded pre-auth CPU/time
and volatile rate state, not artifact bandwidth or durable state.
A status invocation may read only the state or receipt for the exact
`gateId`/`planDigest`/`transactionId`; it cannot run a command or select another
receipt. Concurrent or replayed execution is rejected.

Admission also creates a durable `controller_closeout_pending` lease bound to
run/attempt, transaction, generation, and `controllerRecoveryId`. Terminal
publication first serializes and fsyncs one canonical terminal-receipt body that
contains the immutable initial lease identity, `terminalPublishedAt`, and fixed
`controllerCloseoutAckDeadline = terminalPublishedAt + 120 seconds`, but never
its own digest. Only after hashing those final bytes does one outer atomic
terminal/replay record bind `terminalReceiptSha256`, and the independent closeout
lease CASes to that same digest/timestamps. No digest is fed back into the receipt
body. The lease begins with `controllerCloseoutArtifactState: not_started`. A
successful controller validates the outer record and terminal receipt, then uses
the fixed status-only route to CAS that field to `upload_started` before any
GitHub artifact upload. It uploads the canonical controller-closeout artifact
with retention at least 35 days, uses `actions: read` to verify the exact old
run/attempt artifact ID, digest, size, creation time, and unexpired retention,
then sends one bound acknowledgement carrying that safe evidence digest. The host
CASes the lease to `upload_committed_observed`, fsyncs the evidence digest, and
only then releases it. A controller that never starts upload leaves
`not_started`; loss after the CAS but before committed readback leaves
`upload_started` and is deliberately ambiguous. Cancellation cannot forge an
observation, reset the monotonic artifact state, or delete evidence.

The root-owned, boot-enabled, no-argument
`proxy-gateway-control-closeout-finalizer.timer` and matching `.service` are
fixed bootstrap-digest-bound execution content. The persistent timer runs at
least every 30 seconds, reads only the closed Gate-owned closeout state root, and
has authority only for the CAS transition below; it has no network, credential,
deployment, pointer, service, database, or arbitrary-path authority. When the
ack deadline has passed, the host transaction is terminal, its receipt/replay
record and exact N-generation bootstrap/execution evidence are fsynced and
immutable, and lock/guard/pointer readbacks are complete, the finalizer must
idempotently CAS-mark the still-unacknowledged lease
`controller_closeout_abandoned_attached`. It never deletes the lease or shortens
evidence retention. Boot/recovery re-enables and immediately queues the same
fixed finalizer for an overdue pending lease, so controller loss cannot leave
the transition unreachable. The attached marker no longer blocks a separately
approved credential rotation and remains status-readable with generation N until
the normal retention boundary. A lease for a reservation, nonterminal
transaction, or recovery can never be detached, expired, or bypassed by rotation;
if the finalizer cannot prove every precondition it retains the block and emits
only a fixed aggregate critical status.

Pre-auth validation has a ten-second maximum, one concurrent slot, and no
persistent state. After successful OIDC and host-contract validation, the
launcher atomically writes `artifact_pending` with the consumed replay bindings
before emitting `ready_for_artifact`. It replaces that state within a 300-second
transfer maximum with either an authenticated rejection tombstone or the
accepted transaction journal. It cannot mutate the runtime while pending.
Timeout, connection loss, or reboot in `artifact_pending` removes the bounded
temporary artifact, fsyncs the state parent, records only the authenticated
rejection, and never enters production recovery because no host transaction or
recovery guard existed.

The GitHub controller sends only the small authentication frame, waits for the
validated `ready_for_artifact`, and only then streams the artifact. It never
replays either phase. A validated `accepted: false` response maps directly to
`admission_rejected_no_transaction`; it is not a host transaction state. If a
response is lost, the controller switches directly to status lookups for the
pre-bound gate identity. Status returns only `unknown`, `artifact_pending`,
`admission_rejected`, an aggregate active stage (including
`critical_nonterminal_manual_intervention_required`), or the terminal receipt. A lost
pre-auth response may remain `unknown`, but the launcher cannot reserve anything
after its ten-second validation maximum; the controller still waits the full
30-second admission deadline before closing without a production claim. The
controller polls every five seconds until a durable rejection or terminal
receipt is available, or the 30-second authentication, 300-second artifact
transfer, 15-minute transaction, four-minute recovery, and 60-second controller
grace bounds expire. Transient SSH failure is
retried only for this same status operation and transaction; it is never treated
as permission to replay execution. A terminal host state maps deterministically
to the controller result described below.

### Stages

The transaction executes these stages serially:

1. **Live compare:** resolve the current pointer internally and stop unless its
   safe label equals `expectedCurrentRelease` and its re-hashed installed
   manifest/tree proves the exact plan-bound rollback source, artifact, runtime,
   dependency, and persisted-data-pair identities.
2. **Read-only inventory:** validate service state, working release, Node
   version, required systemd target-chaining/guard features and installed unit
   graph, candidate/rollback canonical writer registries and their bidirectional
   active/dormant host bindings, exact business-mutation and migration-admission
   adapter digests, host-clock synchronization, capacity, protected config
   presence, both required logical databases plus their exact plan-bound config/
   physical/observed-schema identities, migration start states, and reviewed
   input/expected-post/transition digests,
   and fixed listener/health boundaries without
   emitting sensitive values.
3. **Candidate preparation:** complete the artifact, dependency, config
   assembly, and candidate checks above.
4. **Quiesce and backup:** immediately before the first active-runtime mutation,
   re-resolve both database/config bindings and stop unless all six observed
   config/physical/schema identities plus both ledger/start states still equal
   the inventory/Gate/plan and
   remain physically distinct;
   persist the prior pointer plus exact enabled/active state of the approved
   application and reviewed auxiliary-writer units; atomically close both the
   root-owned application and auxiliary-writer permits with parent fsync and
   absence readback, stop reviewed auxiliary-writer timers
   first, drain their bounded one-shot services without starting an extra
   collection, stop the application service, drain every pre-guard gated
   business-mutation one-shot, prove no migration unit active, every prior
   transient unit inactive, every migration cgroup absent or empty with no
   descendants, every migration capability absent/revoked, and no migration
   database handle open, then acquire the exclusive business-mutation lease,
   start and authenticate the exact custody helper, require that helper to
   acquire the exclusive database-identity lease and pin both no-follow file
   capabilities, and acquire deterministic write-exclusion for both databases
   through duplicated capabilities. Recheck the
   same six pre-transaction identities on the actual opened SQLite handles under
   those exclusions, and only then begin backup. Fail before
   backup if an unreviewed
   auxiliary writer exists, a reviewed auxiliary writer cannot quiesce, or its durable idempotent
   pause/resume contract is not proven. Protect the active environment/config,
   create both database backups
   in that one write-quiescent window, and require `quick_check=ok` using
   independent readback connections. For each backup, finish the SQLite backup
   into a protected temporary file, fsync the file, atomically publish its final
   name, fsync the parent directory, and reopen the final path read-only to
   recheck identity and `quick_check`; after both succeed, atomically publish and
   fsync/read back a pair manifest. The runner then closes both backup readback
   handles and both SQLite write-exclusion connections, proves all four handles
   closed and the per-database SQLite locks released; the custody helper
   continues holding the pinned capabilities and exclusive database-identity
   lease while the runner retains the root guard and exclusive business-mutation
   lease. No schema transaction may begin
   until every file, directory, final-path readback, pair-manifest durability,
   connection-close, and lock-release check passes.
5. **Additive schema phase:** when declared and separately gated, keep the
   service stopped for the bounded apply window and process contracts in fixed
   logical order. `none_unchanged` receives validate-only treatment.
   `already_committed_post` must reproduce its exact ledger/post shape and skips
   migration execution. Only `pending_pre` may run the reviewed transactional
   additive migration through the root-owned migration-admission adapter, using
   an in-database ledger row committed atomically with DDL as authoritative
   proof. Reject any direct, stale, destructive, or incompatible operation.
   Immediately before each SQLite transaction, prove the plan-bound config/
   device/inode and pending-pre state on the actual inherited SQLite handle.
   After each migration returns,
   revoke/close its inherited capability, wait for the fixed
   transient unit, cgroup, descendants, and every migration database handle to
   become empty/closed, then re-read the committed ledger/schema through a new
   adapter-opened, identity-proven bounded read-only handle and close it. Persist
   one closed per-database terminal value: `unchanged_none`,
   `additive_not_committed_pre`, `additive_already_committed_expected_post`, or
   `additive_committed_expected_post_this_transaction`; any other ledger/schema
   combination is critical. Successful candidate promotion requires every
   additive contract to be one of the two exact committed-post values, while
   partial failure/recovery may retain the exact mixed vector. Before Stage
   6, re-prove the guard, journal phase, pinned database identities, custody-
   helper unit/invocation/socket and exclusive database-identity lease, and this
   transaction's continuously held exclusive business-mutation lease. Any
   incomplete close, escaped child, delayed handle,
   identity drift, or lost lease enters recovery before an application permit
   or pointer switch.
6. **Atomic switch:** persist `pointer_switch_pending`, atomically change
   `current` to the candidate, fsync its parent, read back the symlink and exact
   immutable release identity, atomically publish/fsync/read back a new
   application permit bound to this transaction, candidate, and both pinned
   database identities. The runner durably checkpoints, releases the exclusive
   business-mutation lease, and queues a fresh stop/start of only
   `proxy-gateway-candidate.service`. Inside that new service invocation, the
   fixed service guardian obtains the transaction-bound shared business lease,
   authenticates to the custody helper, receives the identity-lease and pinned
   database-file descriptions by `SCM_RIGHTS`, and downgrades that same identity-
   lease description from exclusive to shared without an unlocked interval. It
   starts candidate code as a supervised child with only the file descriptions;
   the reviewed early-open adapter proves the child's actual SQLite handles and
   acknowledges readiness before the helper may close or change its duplicate.
   The guardian retains the lease without exposing its FD to candidate code. Any
   failed handoff/early-open proof prevents application readiness and
   enters recovery; the guard
   continues to reject gated operator mutations. Any failure or rollback closes
   that permit before recovery selects and authorizes another release.
7. **Acceptance:** run the condition-driven health and schema window, then
   prove every gated business-mutation entrypoint remained blocked, atomically
   publish the transaction/candidate-bound auxiliary-writer permit with parent
   fsync and identity readback, require each restored writer to obtain a shared
   database-identity lease and prove its actual-opened SQLite handle,
   restore every reviewed auxiliary-writer timer/service to its exact prior enabled/active
   state without triggering an extra run, prove the fixed no-loss/no-duplicate
   state contract, and complete the remaining stability window.
8. **Finalize:** retain the previous release and backup, complete Gate-owned
   cleanup, re-check every production/durability barrier, prove application and
   restored writers retain shared identity leases, close the custody helper's
   duplicate and read back its transient unit/socket absent, remove and fsync/read
   back absence of the recovery guard last, atomically publish/fsync the single
   terminal receipt/replay record while still holding the lock, then exit so
   systemd releases the lock. Between guard removal and terminal publication,
   the nonterminal journal continues to reject operator mutations.

The deployer performs no automatic old-release or backup deletion. Retention
and cleanup are later, separately approved operations.

After quiescence begins, every failure before any database commit enters the
same phase-chained recovery fence: retain the guard; close both permits;
stop/drain application, auxiliary, and migration processes; drain gated operator
leases; acquire the exclusive business-mutation lease; and confirm/release the
database locks. It must then prove the durable pointer still selects the exact
previous release, publish/fsync/read back the previous-release application
permit, release the exclusive lease, perform a fresh application start, restore
the exact prior reviewed auxiliary-writer unit states under a newly bound
permit, prove their pause/resume contract, and pass bounded service and health
validation before the host may record `stopped_pre_switch`. Otherwise it records
`critical_finalize_pending`; the external finalizer alone may later publish
terminal `critical_manual_intervention_required`.

If additive work fails before any database newly commits in this transaction,
the runner confirms the current SQLite transaction rollback and proves each
database still matches its exact inventory/start vector: `already_committed_post`
retains its reviewed ledger/post pair, while `pending_pre` retains absent ledger/
input schema and `none_unchanged` remains unchanged. It runs the same durable
pointer/readback and fresh-start barrier for the unchanged previous release, restores reviewed
auxiliary-writer unit states, validates it, and reports
`stopped_pre_switch`. Failure to prove or restore any element is escalated to
`critical_finalize_pending`.

If any logical database migration has committed but a later database migration
or any later operation fails before the pointer changes, the runner does not
claim a no-change stop and does not restore either database backup. It rolls
back only the currently open, uncommitted database transaction, then reuses the
same full recovery fence, exclusive-lease, pointer-readback, rollback-release
application-permit publication, lease-release, fresh-start, and bound
auxiliary-permit barriers above. It restarts the previous release against every
retained compatible additive change, restores reviewed auxiliary-writer unit
states, validates the exact set of committed contracts from
the authoritative per-database ledgers and schemas, and reports
`schema_committed_previous_release_validated`. Failure to validate the previous
release enters `critical_finalize_pending`.

### Closed Database Contract

The exact source baseline resolves two independent logical database settings:
`SUBSCRIPTION_DB_PATH` for the runtime subscription store and
`SUBSCRIPTION_CONTROL_DB_PATH` for the platform control store. The current
runtime subscription constructor always creates/initializes tables, while the
control-store constructor initializes schema by default. The control database
also carries separately validated wallet schema when that capability is
enabled. Source currently permits the two settings to resolve to one file and
also has fallback paths, but neither behavior is an approved production
topology. These facts prohibit treating one observed database as the complete
deployment boundary or treating a shared file as supported.

Version 1 therefore requires exactly two `databaseContracts` entries:

| Logical identity | Configured source | Required contract |
| --- | --- | --- |
| `subscription-runtime` | `SUBSCRIPTION_DB_PATH` | runtime subscription schema |
| `subscription-control` | `SUBSCRIPTION_CONTROL_DB_PATH` | platform control schema plus every enabled nested schema validator |

The fresh read-only inventory resolves both configured sources internally using
one root-owned stable database-binding key that never leaves the host. For each
logical contract it HMACs a tracked canonical message containing the configured
source generation, resolved canonical file identity (including symlink-safe
device/inode identity), and fixed logical role; it separately hashes only the
fresh observed schema shape/version with no row, path, or customer data. Clean
pair validation supplies the exact reviewed migration-input and expected-post
schema identities plus a transition digest binding both shapes, ledger contract,
migration bytes, and logical role. Inventory also proves the closed start state:
`none_unchanged` requires observed/input/post equality; `pending_pre` requires
observed equals input and the ledger row absent; `already_committed_post`
requires observed equals post and the exact authoritative ledger row present.
Any other combination is ineligible. The inventory receipt, Production Gate stable
plan body, deployment plan/OIDC, host journal, and final receipt bind both
configuration-generation HMACs, both physical-identity HMACs, both observed
schema identities, both reviewed migration-input/post pairs, both start states,
and both transition digests. The two physical HMACs must differ.

After protected approval, the host resolves both configured sources internally
without source fallbacks. Each must be an explicit, absolute, persistent path
outside every release directory and must name an existing database file. The
runner recomputes all six bound identities with the same root-only key before
opening a production-capable transaction and again after quiescence immediately
before the first backup or migration write. Every value must equal the plan and
the two physical files must remain different; config, symlink, inode/file,
logical-role, observed-schema, ledger, or migration-start-state drift stops
before production mutation. At that
second check the runner acquires a distinct root-owned database-identity lease
whose bootstrap contract requires every approved config/path replacement helper
to take it exclusively and every production application/auxiliary/operator/
migration open adapter to hold it shared for the lifetime of its actual SQLite
handles. Every one of those helpers/adapters must also reject a transaction-bound
`critical_identity_fence` before attempting the lease and recheck it after
acquisition before touching config, a path, capability, or SQLite handle; no
reviewed identity path can race or bypass a critical terminal proof.
It pins no-follow parent-directory and file capabilities
for both exact device/inode identities and holds the lease through every backup,
migration, ledger/schema readback, and recovery classification. Closing SQLite
write-exclusion connections never releases that identity lease.

No exited oneshot is assumed to pass an FD to a later systemd unit. Immediately
after quiescence and the final identity proof, the launcher starts one exact
plan-bound, transaction-local database-capability custody helper. This bounded
root-owned transient service holds the exclusive identity-lease open-file
description plus both pinned parent/file capabilities across phase-unit exits.
It has no network, shell, path input, database query/mutation verb, or authority
outside those already-open capabilities; stdout/stderr are null, its lifetime is
bounded by the transaction/recovery deadline, and it is not a permanent daemon.
Its root-owned transaction socket and unit invocation identity are journal- and
receipt-bound.

The helper accepts only a closed state-dependent protocol. It authenticates the
requesting peer by `SO_PEERCRED`, exact UID, systemd unit/cgroup/invocation ID,
transaction permit, journal phase, and requested logical database/operation,
then duplicates only the permitted existing open-file descriptions with
`SCM_RIGHTS`. It never sends a path or opens a caller-selected file. Migration
and backup clients receive bounded duplicates while the helper retains custody.
For application handoff, the exact startup guardian receives the lease and
database-file descriptions, changes the lease open-file description from
exclusive to shared with no unlocked interval, and starts the candidate child
with only the pinned database-file descriptions plus a fixed readiness channel.
The candidate's reviewed early-open adapter must open/fstat/HMAC-prove its actual
SQLite handles before listener or DML readiness and return a bound acknowledgement;
only then may the helper close its duplicate. The guardian retains the shared
lease for the complete candidate-child lifetime; the lease FD is
close-on-exec/not passed to candidate code, and guardian failure stops the
service cgroup. Auxiliary and
operator adapters use equivalent fixed lifetime guardians and may obtain
independent shared leases only while the application/shared custody prevents an
exclusive config replacement.

Recovery never fabricates a lost capability. If the custody helper is alive,
fence/reconcile stops and drains every shared holder, authenticates to the same
helper, and upgrades the retained lease description to exclusive before ledger
classification. If the helper died or the host rebooted, the retained guard and
service ordering first prove every application/auxiliary/operator/migration
holder absent; only then may the fixed recovery bundle start a new exact helper,
acquire the exclusive identity lease, no-follow reopen both files, and re-prove
the plan-bound HMACs on the actual handles. Any drift or inability to prove all
prior holders gone is critical. The helper exits only after the finalizer has
selected a terminal state and either proved successful transfer to validated
runtime guardians or proved all runtime holders absent for a stopped/critical
state; its inactive/socket-absent readback precedes terminal receipt publication.

The fixed database-binding adapter, not candidate or migration code, opens every
live SQLite connection through those capabilities with a reviewed no-follow
mechanism. It fstats the actual SQLite main-database handle, recomputes the
logical/config/device/inode HMAC from that opened handle immediately before the
first SQLite read or write and again before commit/after reopen, and rejects a
path-derived assertion that is not proven on the handle actually used. If the
platform/SQLite binding cannot expose and pin that exact handle, the Gate is
ineligible. Recovery obtains the same lease and repeats the same opened-handle
proof before reading a ledger or schema. Raw paths, device identities, HMAC key,
or database metadata never leave the host. The runner creates two separate online backups, opens each backup
through a new readback connection, and requires `quick_check=ok` for both. The
aggregate receipt records only logical database count `2`, unique physical
database count `2`, per-contract results, the aggregate-safe bound HMACs/schema
digests, and backup-safe identities.

Each online backup is written under the protected backup root as a unique
temporary file while both writer locks remain held. Success requires SQLite
backup completion, bounded close, file fsync, independent readback, atomic
rename to the final Gate-owned name, parent-directory fsync, and a final
read-only reopen of that final path before an atomically published/fsynced pair
manifest binds both backup identities and contracts. An I/O error, unsupported
filesystem durability primitive,
power-loss simulation that loses either final file/rename/manifest, or a schema
attempt before this barrier fails closed. A receipt never labels the pair
rollback-ready merely because the backup API returned success.

The source implementation must also route every repository-managed production
database consumer through non-initializing open/validation paths, including the
main service, one-shot traffic collector, Mihomo usage sidecar, retention
operations, and operator business-mutation CLIs. A static call-site contract
rejects any production consumer that omits an explicit startup mode or any DML
path that lacks the fixed lease adapter; only the fixed reviewed migration
entrypoints may initialize or alter schema.

The tokenless source builder runs a fixed, digest-bound writer-registry verifier
whose discovery roots are the tracked package/bin commands, CLI router, service
and timer templates, production entrypoints, and every call path that can open
either configured database for DML or DDL. Discovery is independent of the
release declaration; its result must equal the declaration exactly. It emits
canonical sorted JSON with one record per production-capable launch surface:
category, logical ID, sorted aliases, repository-relative entrypoint and digest,
logical database IDs, startup mode, adapter/permit/lease contract, and expected
host binding. Reused source modules do not collapse distinct launch surfaces,
while aliases that reach the same controlled surface are one sorted alias set.
Unknown calls, dynamic entrypoints, unresolved aliases, duplicate ownership, or
an executable database path outside the registry fails the build.

The one canonical `writer-registry.json` byte sequence is published as a
companion and copied byte-for-byte into the bundle/immutable installed metadata
tree; all other layers bind only its digest. It does not alter portable Artifact
Manifest v1. The candidate bytes must equal the discovered output, durable
companion, bundle, and candidate-tree copies, while their digest must agree
across the release declaration, bundle assembly file manifest, provenance
subject, and plan. The rollback digest must agree across its installed
manifest/tree, fresh inventory receipt, and plan; candidate and rollback digests
may differ as their reviewed writer sets evolve. Fresh host inventory then
performs a bidirectional join: every registry
record receives an active, inactive, disabled, or candidate-only binding proof,
and every installed active or dormant systemd unit/timer/drop-in, fixed wrapper,
package/CLI alias, and production process with either database identity maps to
exactly one registry record. It compares installed entrypoint bytes and external
bindings rather than using current process absence as proof. Any missing reverse
match, extra launch surface, digest drift, or inability to inspect a dormant
binding makes the Gate ineligible.

Before approval, the no-secret preflight independently reruns the fixed
discovery/verifier against both exact source commits; it does not seed discovery
from either installed registry. For each release it retrieves the durable
registry companion, bundle/assembly manifest, release declaration, and
provenance attestation by canonical release tag, compares them to the exact Git
tree and independently discovered bytes, and emits a bounded canonical
verification receipt binding source, artifact, tree, registry, verifier, and
provenance digests. Candidate and rollback receipt digests are separate plan
fields. A missing/expired artifact, provenance failure, or registry that agrees
with its host tree but omits a discovered dormant surface fails before protected
approval. The host then joins the independently proven rollback digest to the
installed bytes and live/dormant bindings; host evidence can never substitute
for the external source/build/artifact/provenance proof.

Fresh inventory enumerates every process that can write either database. The
writer universe is the disjoint, exhaustive union of exactly four categories:

1. the one fixed application service, governed by
   `applicationWriterContract`, `existing_schema_only`, the application permit,
   explicit stop, and verified fresh-start contracts;
2. repository-managed collector/sidecar/retention timer/service pairs, each
   governed exactly once by a closed `auxiliaryWriterContracts` entry with
   stop/drain/restore and durable idempotent-observation semantics;
3. operator one-shot business DML commands, each governed exactly once by a
   closed `gatedBusinessMutationEntrypoints` entry and the shared lease/guard
   contract, but never by a timer pause/idempotency contract; and
4. fixed migration entrypoints, each bound to one additive database contract and
   executable only in the post-backup schema phase under its dedicated identity.

The main application can perform normal business DML but is never classified as
an auxiliary timer/service pair or operator one-shot. A migration entrypoint
cannot appear in any runtime-DML category. CLI aliases and direct script paths
map to one logical gated entrypoint rather than becoming overlapping writers.
An unknown, overlapping, or uncovered writer; missing or changed
unit/entrypoint; non-idempotent auxiliary retry model; lease bypass; or inability
to prove the applicable application, auxiliary, gated-business, or migration
contract makes the release ineligible before any service stop or backup.

For the exact source baseline, the closed gated-business list includes the
logical entrypoints behind `platform:issue-subscription`,
`platform:issue-portal-entry`, and `platform:issue-portal-initial-account`, with
their CLI facade/direct-script aliases and exact source digests. They retain
their own independent Risk A approval contracts and are never launched by the
deployment workflow. Their production mutation mode must receive the inherited
business-mutation lease plus shared database-identity lease and actual-opened-
handle capability from the fixed host adapter; direct Node, package-script,
copied script, or stale-release invocation without those handles fails before
either database opens. Static discovery covers package scripts, CLI routing, direct
entrypoints, and all production DML constructors; a newly discovered or added
operator mutation blocks deployment until the reviewed closed list changes.

Migration code has no direct execution route. The root-owned, plan-bound
migration admission adapter verifies the current transaction/journal phase,
present recovery guard, exact database/migration/entrypoint digests, dedicated
identity, fixed transient unit/cgroup, the continuously held database-identity
lease, and an exclusive business-mutation lease. The trusted adapter
authenticates to the custody protocol, receives only the plan-bound pinned
no-follow database-file descriptions plus a bound proof that the helper still
holds the exclusive identity lease, and opens the actual SQLite connection from
that capability. The lease FD itself is never exposed to migration code. The
adapter proves the
plan-bound identity on that connection's main-database handle, and passes only
the inherited connection/capability to the entrypoint. The entrypoint cannot
accept or reopen a path and independently requires the capability before any
SQLite operation. A direct Node/package/CLI call, stale release, wrong
migration, missing guard, shared lease, unbound/reopened handle, escaped child,
or invocation outside the exact schema phase fails before DDL/DML. The adapter
digest and admission contract are bound through
bootstrap receipt, release declaration, plan, OIDC authorization, journal, and
receipt; a separate Risk A migration Gate needs its own equally explicit
authorization and cannot reuse this deployment transaction.

The root launcher has auxiliary-unit authority only over the exact reviewed
units bound into the plan and bootstrap receipt. It snapshots their
enabled/active states, stops timers before draining their in-flight one-shots,
then separately stops the fixed application service and obtains both SQLite
write locks. Auxiliary units remain paused through backup, migration, switch,
and initial application acceptance; recovery likewise keeps them paused until
either old or new code is healthy. Every non-critical terminal path restores the
exact prior auxiliary-unit states without triggering an extra run and proves the
tracked retry/checkpoint invariant. A critical state keeps auxiliary writers
safely quiesced and reports that aggregate fact for manual recovery. An
auxiliary writer attempt injected during
the backup window must be delayed and later processed exactly once; a design
that can only surface `SQLITE_BUSY` or discard the attempt fails this contract.
Holding both write-exclusion locks across the two backups gives the pair one
quiescent business checkpoint. After durable pair-manifest readback, both lock
connections and backup-readback handles must close and prove inactive before a
migration unit can start; the exclusive business-mutation lease and guard keep
all four writer classes fenced across that handoff. Without writer coverage,
backup-window locks, verified release, and state-restoration proof the backups
cannot be called a coherent rollback set.

The same root-owned recovery guard is the business-mutation guard. An operator
adapter prechecks the guard/nonterminal journal, takes the host-local shared
lease, rechecks both, and retains the lease until every database handle closes.
Application and auxiliary adapters follow the same locked recheck but may use
only the exact transaction-bound category permit while recovery is active. The
deployer publishes the guard before quiescence and takes the exclusive lease
only after existing shared holders drain. While the guard or a nonterminal
journal exists, operator one-shots fail closed before database open. Migration
entrypoints run only while the deployer holds the exclusive lease. This ordering
closes the check-to-write race and prevents inventory-time process absence from
being treated as lasting proof.

For the first migration to this startup model, the read-only database Gate must
also prove that restarting the exact previous release has no pending base-table,
index, or add-column work against the observed schemas. If its legacy
initializer would change either schema, the first automated deployment is
blocked until a separately approved schema/bootstrap Gate resolves that state.
This prevents a pre-switch restart of the old release from silently becoming an
undeclared migration.

Schema behavior is closed and explicit:

- `none` requires inventory, reviewed input, and expected-post identities equal,
  uses `none_unchanged`, runs the fixed validate-only database Gate, persists
  `unchanged_none`, and proves schema identity plus SQLite schema version do not
  change;
- additive `pending_pre` requires inventory equal the reviewed migration-input
  identity and the ledger absent, then applies only the exact reviewed
  transactional migration, validates the expected-post identity, commits its
  authoritative ledger row with DDL, records
  `additive_committed_expected_post_this_transaction`, and proves a second apply
  is a no-op;
- additive `already_committed_post` requires inventory equal expected post plus
  the exact ledger row, executes no migration, validates the idempotent no-op
  contract, and records `additive_already_committed_expected_post`;
- normal candidate startup uses `existing_schema_only`, validates through
  read-only connections, then permits operational DML through existing-file
  connections that cannot call bootstrap, create-table, add-column, or
  migration code; and
- a fallback, relative/release-local path, same-file identity, undeclared
database source, missing required database, extra schema write, contract
mismatch, or inability to disable implicit DDL stops the transaction before
  the pointer switch.

The implementation must add dependency-injected tests around both stores and
the production state assembly to prove this separation. An idempotent implicit
`CREATE TABLE IF NOT EXISTS` is still implicit DDL and does not satisfy the
contract.

### Atomic Migration Evidence

SQLite cannot atomically commit a database migration and a separate host journal
file. Before each logical database migration, the host journal therefore writes
and fsyncs only a non-authoritative `commit_pending` record containing the
logical ID plus reviewed migration ID and checksum. Inside the exact same SQLite
transaction as the approved additive DDL, the migration creates or validates
the fixed reviewed migration-ledger schema and inserts one unique row binding
logical database, migration ID/checksum, source commit, exact pre identity,
expected post identity, transition digest, and schema contract.
The transaction uses the reviewed durability settings and the DDL plus ledger
row either commit together or roll back together.

Each migration entrypoint runs in one fixed plan-bound transient unit and cgroup
with `KillMode=control-group`, no child escape, a bounded runtime, and the exact
dedicated identity/entrypoint digest. Normal completion is not the entrypoint's
exit code alone: the adapter must revoke its capability, prove the unit/cgroup
and descendants empty, close every migration/readback handle, and read back the
still-held parent exclusive lease before the transaction advances. Before any
recovery classification or application restart, fence/reconcile stops that unit, sends bounded termination
and then kill only to that cgroup when required, waits for every process and
database handle to exit, reacquires the exclusive business-mutation lease, and
proves the cgroup plus unit inactive. SQLite then either exposes the atomic
ledger/schema commit or has rolled the interrupted transaction back. Failure to
prove process exit, lease ownership, or a closed database handle is
`critical_finalize_pending`; recovery never reads an actively
mutating database.

An external `commit_observed` record written after SQLite returns success is a
recovery hint, never commit authority. Recovery first obtains the
database-identity lease, opens each database read-only/query-only through the
fixed no-follow adapter, fstats and HMAC-binds the actual SQLite handle to the
plan, and only then checks its ledger row and expected schema shape:

- a `none` contract has exact `inventory == input == actual == expectedPost` and persists
  `unchanged_none`;
- an `already_committed_post` start with matching ledger/post persists
  `additive_already_committed_expected_post`;
- a `pending_pre` start whose ledger and exact expected-post schema now match
  persists `additive_committed_expected_post_this_transaction`;
- a `pending_pre` start whose ledger lacks the change and exact input schema
  remains persists
  `additive_not_committed_pre`; or
- either side is partial, unexpected, or unreadable: record
  `critical_finalize_pending` and stop.

Only when neither logical database newly committed in this transaction may
recovery report `stopped_pre_switch`; an already-committed start state is not a
new production mutation. A crash after SQLite COMMIT succeeds but before any
external observation is therefore classified from the database ledger as a
committed-schema state, never as unchanged. Ledger contents remain host-internal
and only aggregate contract results appear in receipts.

## Acceptance Contract

The existing condition-driven promotion health gate is reused and extended
only where tests prove the need. Acceptance requires:

- the service is active/running;
- the process working directory resolves to the candidate immutable release;
- `NRestarts` does not change from the pre-switch baseline;
- loopback `/api/health` returns 200 for at least three consecutive probes;
- the fixed public boundary `https://portal.gccwebos.com/api/health` returns 200
  for at least two consecutive probes after loopback readiness;
- at least 60 seconds of post-start stability completes without a
  restart-count change, within a 120-second total acceptance deadline;
- protected release-config assembly still verifies;
- live SQLite `quick_check` returns exactly `ok` for both distinct physical
  databases; the application-opened handles still match both plan-bound config/
  physical identities; every `none` contract has
  `pre == actual == expectedPost`; and every promoted additive contract has an
  authoritative ledger plus `actual == expectedPost` under its exact transition
  digest;
- the closed per-database terminal vector contains only `unchanged_none` or
  `additive_already_committed_expected_post` or
  `additive_committed_expected_post_this_transaction`, every release-declared
  schema contract is ready, and the candidate performed no implicit DDL;
- the application writer passed permit/stop/fresh-start checks, every reviewed
  auxiliary writer was quiesced/restored to its exact prior unit state with its
  no-loss/no-duplicate contract, every gated business-mutation entrypoint
  remained rejected by the guard, and no migration entrypoint remained active;
- required feature flags have the expected safe boolean state; and
- previous release and backup identities remain rollback-ready.

The gate returns status codes, counts, elapsed time, booleans, release labels,
and safe state labels only. It does not return URLs, response bodies, stderr,
logs, paths, PIDs, environment values, database rows, config, or credentials.
The serialized receipt is one JSON object of at most 16 KiB.

## Failure And Rollback Semantics

### Failure Classes

**Pre-switch stop** applies to source, artifact, input, identity, capacity,
dependency, config, backup, schema-preflight, current-release mismatch, or an
additive transaction that failed and was proven rolled back before any logical
database newly committed in this transaction. The final active pointer, schema,
and service state match their
pre-run state. The workflow reports `stopped_pre_switch` and performs no retry.

**Committed-schema pre-switch stop** applies only after an approved additive
migration newly committed in this transaction but before the `current` pointer changed. The compatible
additive schema remains, the previous code release is restarted and validated,
and the host records `schema_committed_previous_release_validated`. The GitHub
job fails and records a production schema-only change; it never reports the
candidate as deployed. If previous-code validation fails, the state is
`critical_finalize_pending` until the external finalizer's predicates pass.

**Post-switch rejection** applies when service, working release, restart count,
health, config assembly, database integrity, schema, feature flag, or deadline
acceptance fails. The host transaction automatically:

1. persists rollback-pending, keeps the guard, closes and durably reads back both
   application/auxiliary permits, stops the application, stops/drains every
   auxiliary unit even if Stage 7 already restored it, proves the fixed migration
   cgroup empty, drains pre-guard operator one-shots, and obtains the exclusive
   business-mutation lease plus exclusive custody-helper database-identity lease
   and actual-handle proof;
2. atomically restores the prior `current` pointer with parent fsync and exact
   readback, atomically publishes/fsyncs/reads back an application permit bound
   to this transaction and exact rollback release, checkpoints that state,
   releases the exclusive business lease, and performs a fresh guardian/custody
   handoff plus start of only the approved service;
3. confirms the prior working release;
4. reruns bounded service, loopback, public-health, restart-count, config, and
   database-integrity checks;
5. atomically publishes/fsyncs/reads back the transaction/rollback-release-bound
   auxiliary permit, restores every reviewed auxiliary-writer unit with shared
   database-identity guardians to its exact prior state, and proves its
   no-loss/no-duplicate contract; and
6. runs the normal final durability/guard-removal barrier and records
   `rolled_back` only if all rollback checks pass.

The GitHub job fails even when rollback succeeds. A rollback is never reported
as a successful deployment.

**Rollback rejection** applies if the previous release cannot be restored or
validated. The transaction records `critical_finalize_pending`,
stops automated actions, preserves the old and candidate releases plus backup,
and emits the smallest possible aggregate critical status. A terminal alert
receipt exists only after the external critical finalizer satisfies its closed
predicate and exits inactive. It does not attempt a
second deployment, a database overwrite, or evidence deletion.

The workflow must perform the fixed same-run status polling above and validate
the exact Gate receipt. A controller that remains alive but loses the execute
ACK uses only the same-run bounded status route and may still complete normal
closeout; if its own deadline expires while it can still publish GitHub evidence,
it records `controller_incomplete_no_production_claim`. If the GitHub-hosted
runner is irrecoverably lost or the entire run is cancelled, no process remains
that can honestly persist any further controller result. The original run keeps
its native Actions conclusion and whatever exact closeout artifact state was
already reached; runner loss alone never implies artifact presence or absence.
Only the monotonic host/API state table below classifies it. The host transaction still converges and its persistent
finalizer attaches terminal evidence. Nothing later rewrites the old run's
conclusion, invents its missing artifact, or reuses its production approval.

Recovery is a separate manual-only `workflow_dispatch` with no execute path. Its
only safe inputs are one canonical `controller_recovery_id` matching
`^cr1\.[0-9a-f]{64}$`, `original_run_id` matching `^[1-9][0-9]{0,19}$`,
`original_run_attempt` matching `^[1-9][0-9]{0,9}$`, and a fixed confirmation
phrase. The original no-secret summary emits all three safe values. The ID is computed in the
original no-secret plan as SHA-256 over strict canonical UTF-8 JSON with exactly
the ordered fields `schemaVersion`, `domain: controller-recovery`,
`productionGateReceiptSha256`, `transactionId`, `target`, and `sourceCommit`;
unknown fields or non-canonical bytes are rejected. It excludes the plan digest and
terminal receipt so neither object hashes itself. The no-secret preflight emits
that safe ID in the original run summary before any protected job, making it
recoverable even if the later runner disappears. The original admission indexes
its closeout lease/record by that ID and binds the plan digest, original
run/attempt, transaction, Gate, source, target, and bootstrap generation.

The receipt-recovery job requires a new independent approval on the protected
`vultr-japan-production` Environment. Its exact workflow permissions are only
`actions: read`, `contents: read`, `attestations: read`, and `id-token: write`; pull-request, issues,
deployments, `attestations: write`, packages, security-events, and every repository write
are absent. It checks out only the protected current `master` fixed controller
with persisted Git credentials disabled and verifies the Git tree plus exact
`receiptRecoveryWorkflowSha256`, `receiptRecoveryControllerSha256`, and
`receiptRecoveryParserRegistrySha256` from the current active bootstrap receipt.

Before requesting approval or SSH material, `actions: read` must prove the exact
input original run and attempt have `status: completed`, their conclusion is exactly
one of `cancelled | failure | timed_out | stale | startup_failure`, and completion
was no more than 24 hours ago. `success`, `neutral`, `skipped`, `action_required`,
null/in-progress, another attempt, or an older/ambiguous run is ineligible. The
shared `japan-control-plane-production-authority` concurrency key prevents this
recovery from overlapping the original deployment, another recovery, or a
bootstrap rotation. Preflight also verifies the repository Actions artifact
retention is at least 35 days and records the exact original closeout-artifact
API readback; an expired/deleted/retention-ambiguous artifact never counts as
proof that no artifact existed.

Recovery authentication is an explicit two-phase, read-only challenge, so the
opaque ID does not create a lookup/OIDC cycle. In phase one the current forced-
command key may send only `status_recover_challenge` with the recovery ID, new
run/attempt, claimed workflow ref/SHA, and input original run/attempt. After validating current generation/
receipt/authorization state and absence of a rotation fence, the host returns a
bounded 60-second root-HMAC challenge containing the exact retained original
tuple, current bootstrap tuple, recovery operation/audience, new run/attempt,
workflow path/ref/SHA, required historical receipt parser ID/digest, current
parser-registry digest, the monotonic host `controllerCloseoutArtifactState`, and nonce. This phase has a strict volatile rate limit,
persists nothing, exposes no credential/customer/path/database value or terminal
result, and cannot select a second record.

In phase two the runner mints a fresh OIDC token whose audience is that exact
challenge digest, then invokes only `status_recover`. The host validates the
challenge HMAC/expiry and OIDC repository/owner, `workflow_dispatch`, protected
`refs/heads/master` commit, exact recovery workflow path/ref/SHA, Environment
subject `vultr-japan-production`, GitHub-hosted runner, new run/attempt, current
bootstrap tuple, and controller/parser bundle digests. No artifact body, execute
frame, acknowledgement, journal/lease CAS, service/database/pointer action, or
old-generation key is accepted. Only then may it locate exactly one retained
immutable original record by recovery ID and verify its historical generation
evidence; the host-indexed original run/attempt must equal the safe dispatch
inputs and preapproval Actions readback byte for byte. Zero, multiple, expired,
nonterminal, unbound, or parser-incompatible
records return no production claim.

Artifact evidence is accepted only by a closed state table. An exact present,
unexpired artifact must match its API digest and any host
`upload_committed_observed` digest; `upload_started` plus an exact present
artifact may be recovered, but `upload_started` plus absence is ambiguous and
fails. `not_started` plus verified absence within the 24-hour window is the sole
absence case; `not_started` plus presence, or `upload_committed_observed` plus
absence/mismatch, fails as deletion, forgery, or state drift. Thus recovery never
turns artifact expiry/deletion or a still-running upload into a claim of original
absence.

The active parser registry must contain the exact validator for every unexpired,
latest-target, or critical retained receipt schema; inventory and every bootstrap
rotation fail closed if the proposed registry would drop one. Rotation may retire
the old key but retains the old host interpreter and corresponding current-
controller parser through that boundary. The challenge binds the required parser
digest, and both host and current controller independently validate the same
canonical bytes before a recovered result is possible.

The new run validates the same terminal body, outer replay record, plan/Gate/
inventory bindings, conditional critical contract, and observed-or-attached
closeout lease as normal closeout. Only a validated terminal state publishes a separate canonical
`recovered_closeout` record bound to both runs, the old native Actions conclusion,
presence or proved absence of the original controller-closeout artifact, and the terminal receipt digest,
with only `recovered_validated_deployment`,
`recovered_validated_stopped_pre_switch`,
`recovered_validated_schema_only_change`, `recovered_validated_rolled_back`,
or `recovered_validated_critical_failure`. `recovery_not_terminal_no_claim` and
`recovery_receipt_invalid_no_claim` instead produce only an attempt-scoped
`recovery_attempt_no_claim` diagnostic in that run. It has no fixed final tag,
attestation, Deploy Note, production claim, or effect on a later attempt after
the host converges; it cannot occupy the one-time validated-result slot. Neither
schema changes host state or the original run. Any Deploy Note is produced only
by the already isolated no-secret PR-write job after validating the canonical
terminal record.

The validated recovered result is one-time and durable without combining repository write
authority with production access. A final isolated publisher job has no
Environment, SSH/OIDC-production credential, or host route; after revalidating
the same-run recovered artifact it receives only `actions: read`,
`contents: write`, `id-token: write`, and `attestations: write`. Under the shared
concurrency key it first fixes and re-hashes the canonical bytes, digest, tag
`control-plane-recovered-closeout-{controllerRecoveryId}`, and digest-derived
filename, then queries both the exact Release asset and attestation subject. The
two external writes form a resumable monotonic pair: neither present creates the
exact asset then its attestation with readback after each; one exact matching
asset with zero attestations resumes only the missing attestation; one exact
matching attestation with no asset resumes only the missing asset; and the exact
matching pair returns the existing result without SSH. An unmatched/multiple
asset or attestation, wrong recovery/original run/terminal/artifact-state binding,
replacement, or post-write readback failure remains fenced. A partial exact pair
is never accepted as final but is never made permanently unrecoverable by a crash
between the two writes.

### Schema Boundary

For each of the two required logical database contracts, Version 1 permits only:

- `schemaMode: none`; or
- a reviewed, transactional, backward-compatible additive migration with an
  exact schema Gate, verified online backup, and synthetic rollback proof.

The design makes no cross-file SQLite atomicity claim. Migrations commit in the
fixed logical order with one authoritative ledger row inside each database.
Once the first database ledger and schema prove a commit, every later failure
follows the schema-only or post-switch rollback path; it can never be downgraded
to `stopped_pre_switch` merely because an external journal write was lost.
A later fresh Production Gate may treat that exact ledger/post pair as
`already_committed_post`, but it must not execute that migration again or infer
the state from schema shape alone; any remaining database keeps its independently
proven `pending_pre` state.

If code rollback occurs after an additive migration, the additive schema may
remain and the prior code must ignore it safely. Once the candidate may have
accepted writes, the automation must not restore the older database and risk
losing orders, wallet operations, ledger entries, or other production writes.
The backup remains available only to a separately approved database recovery
Gate.

Drop, rename, destructive rewrite, incompatible constraint, or identity-impact
changes are outside this workflow and fail before approval or SSH.

### Persisted-Data Compatibility Boundary

Schema compatibility alone does not make code rollback safe: candidate code may
write a new enum, JSON shape, state transition, or interpretation into an
existing column during acceptance. Version 1 therefore admits only release
declarations with `dataCompatibilityImpact: false` and the fixed
`control-plane-persisted-data-backward-v1` contract for the exact candidate and
previous source pair.

The contract maintains a closed registry of every mutable repository/domain and
its persisted enum, JSON, lifecycle-state, and cross-record invariants. Using
synthetic databases only, the exact candidate writes each supported record and
transition; the exact previous release must read, list, validate, process, and
perform its allowed writeback without destructive reinterpretation. The
candidate then reads and processes that previous-release writeback. Static
checks reject an unregistered persisted field or mutating path. Tests contain no
production row or customer value.

A candidate that introduces any persisted meaning the previous release cannot
handle is ineligible for this workflow, even if its DDL is additive. It requires
a separate Risk A rollout or an independently designed write barrier and cannot
claim automatic rollback here. Acceptance does not waive this precomputed pair
contract; after candidate writes, only code rollback is automatic and database
restore remains prohibited.

## Receipt And Closeout

The host transaction receipt and the GitHub controller closeout are separate
schemas. The final host receipt contains only facts the host transaction can
prove:

- canonical Production Gate receipt digest, `controllerRecoveryId`, run-bound safe identities, and all
  parent/effective expiry timestamps;
- source commit, release unit, candidate and previous release labels;
- candidate artifact, rollback artifact/tree-manifest/data-pair,
  candidate/rollback canonical writer-registry and independent verification
  receipt, business-mutation contract, inventory receipt, and plan digests;
- launcher/recovery/drop-in/migration-admission/writer-registry-verifier/
  database-handle-binding/database-capability-custody/host-authorization-HMAC
  contract IDs and digests, the aggregate host-execution contract digest,
  bootstrap receipt ID, canonical bootstrap receipt digest, rotation ID,
  predecessor/current bootstrap generations and receipt digests, transition/CAS
  evidence, GitHub authorization-binding HMAC/outer-state pointer, and host
  authorization-readback HMAC/key generation, bootstrap entry/launcher/sudoers/
  staging/cleanup plus static updater-App contract digests, dynamic activation/
  attempt-chain/updater-issuance evidence, and the protected bootstrap-closeout
  evidence digest;
- stage and final state;
- aggregate backup/config/database/schema/database-capability-custody/actual-
  handle-binding/data-compatibility/writer-quiescence/
  writer-restoration/business-mutation-guard/migration-execution-closed/health
  and host-cleanup booleans;
- both logical databases' plan-equal configured-source-generation HMAC,
  physical-file-identity HMAC, observed/input/expected-post schema identities,
  migration start state, transition digest, actual final schema identity,
  authoritative ledger result and commit origin, and closed terminal-state vector plus the distinctness and
  actual-opened-handle-binding results;
- aggregate candidate-registry-all-bound/candidate-no-extra-binding and
  rollback-registry-all-bound/rollback-no-extra-binding booleans from the fresh
  active/dormant bidirectional join;
- probe counts, elapsed time, restart-count delta, and status codes;
- rollback attempted/result labels; and
- Gate-owned incomplete-candidate/host-temporary cleanup status and durable
  replay-marker state, plus controller-closeout/critical-finalizer and receipt-
  recovery challenge/workflow/controller/parser-registry contract digests,
  terminal-publication timestamp, fixed acknowledgement deadline, and immutable
  initial `controller_closeout_pending` lease binding with
  `controllerCloseoutArtifactState: not_started`. The canonical receipt body
  contains no `terminalReceiptSha256`; after its bytes are final, the outer
  terminal/replay record and independent lease bind that digest. The later
  observed/attached state lives only in its separate CAS-updated closeout record,
  never by rewriting the terminal receipt; that record also carries only the
  monotonic `not_started -> upload_started -> upload_committed_observed`
  artifact-state transition and committed safe evidence digest.

Allowed host final states are:

```text
deployed_validated
stopped_pre_switch
schema_committed_previous_release_validated
rolled_back
critical_manual_intervention_required
```

Terminal predicates are state-specific; a healthy selected application is not a
leaked migration handle. Every row still requires the transaction/recovery/
migration cgroups inactive, the transient migration capability and custody-
helper duplicate/socket closed, and `migration-execution-closed: true`.

| Final state | Selected runtime | Application/auxiliary permits, runtime DB handles, shared identity leases | Recovery guard | Extra terminal proof |
| --- | --- | --- | --- | --- |
| `deployed_validated` | exact candidate application plus the exact reviewed prior-active auxiliary set | candidate-bound permits are current; only plan-bound application/auxiliary actual handles and shared identity leases may remain | removed/fsynced/read back absent | candidate pointer, health, writers, and durability valid |
| `stopped_pre_switch` | exact previous application plus exact reviewed prior auxiliary state | previous-release-bound permits are current; only its validated runtime handles/shared identity leases may remain | removed/fsynced/read back absent | no new schema commit and pre-run production state restored |
| `schema_committed_previous_release_validated` | exact previous application plus exact reviewed prior auxiliary state | previous-release-bound permits are current; only its validated runtime handles/shared identity leases may remain | removed/fsynced/read back absent | exact committed additive ledger/schema vector valid |
| `rolled_back` | exact previous application plus exact reviewed prior auxiliary state | rollback-bound permits are current; only its validated runtime handles/shared identity leases may remain | removed/fsynced/read back absent | rollback pointer, health, writers, and durability valid |
| `critical_manual_intervention_required` | no application or auxiliary writer active | permits closed; no runtime or transient DB capability/handle/shared identity-lease holder remains | recovery guard and critical identity fence retained/fsynced/read back present | external critical finalizer held the exclusive business lease and single global database-identity OFD lease through record publication, then status proved it inactive and both leases free under the fence |

A structurally valid critical receipt may carry false only for the registry/
schema/health/rollback proof that caused bounded recovery to fail, and only when
it also proves no deployment-success claim, the exact critical stage, the
state-specific row above, and the dedicated `critical_terminal_record`
transition. A lingering executable, capability, handle, permit, identity/business
lease, unknown guard, active critical finalizer, or mere
`critical_nonterminal_manual_intervention_required` journal marker has no
terminal receipt. A live controller maps it to
`controller_incomplete_no_production_claim` and may advance only the monotonic
upload state before it exits; hard runner loss makes no further transition.
Present, proved-absent, or ambiguous artifact state comes only from the closed
host/API table, never from loss. None becomes `validated_critical_failure`. Missing fields,
malformed values, or digest/plan/inventory mismatches are always receipt-invalid.

The GitHub controller closeout separately records whether admission and polling
completed, the host receipt was present and schema-valid, the receipt bindings
matched the exact plan, both registry digests exactly matched their plan and
inventory bindings, both independent registry-verification receipt digests
matched, every database's pre/expected-post/transition/actual/ledger terminal
vector was one of the state-appropriate exact combinations, and—for non-critical
states—all four bidirectional-join
booleans plus `migration-execution-closed` were true. For the exact critical
state it instead validates the conditional false-proof/retained-guard contract
and the exact state-specific runtime/transient matrix above, including the
external critical-finalizer inactive plus exclusive identity/business lease
proof when critical. The combined terminal record retained its replay binding, the transaction and recovery units
plus database-capability custody unit/socket reached terminal/inactive/absent
states, the host lock was proven free
by the fixed status readback, and GitHub-runner temporary files were absent
after the `always()` cleanup. It also validates the receipt-bound acknowledgement
deadline/finalizer contract, controller-closeout artifact state/evidence/retention,
and whether the lease is observed, still pre-deadline,
or durably attached to immutable terminal evidence; it never treats an overdue
unattached lease as a successful closeout. Its closed result set is:

```text
validated_deployment
validated_stopped_pre_switch
validated_schema_only_change
validated_rolled_back
validated_critical_failure
admission_rejected_no_transaction
receipt_invalid_no_production_claim
controller_incomplete_no_production_claim
```

`controller_incomplete_no_production_claim` exists only when a still-running
controller can durably publish it. After hard runner/run loss, this schema is
absent only if no exact closeout artifact was already uploaded; otherwise that
existing artifact remains subject to the monotonic state table. The separately
approved `recovered_closeout` record cites the native conclusion and exact
present/proved-absent/ambiguous artifact classification without inferring it from
loss.

GitHub publishes only the validated aggregate admission response or host
receipt plus controller closeout as run evidence. Raw remote stdout/stderr is
never uploaded. The related PR receives a concise successful Deploy Note only
when the host state is `deployed_validated`, controller result is
`validated_deployment`, and runner cleanup has passed. It includes
`deployed_at`, `release_unit`, `source_commit`, durable artifact identity,
logical target, backup identity, and validation summary.

A validated schema-only, rolled-back, or stopped attempt receives an equally
bounded failed-attempt Deploy Note. In particular,
`validated_schema_only_change` records that the additive schema committed while
the previous source release remained active. Admission rejection,
invalid-receipt, or incomplete-controller results record no unverified host
claim and require the prescribed read-only closeout. None of these states
changes `production_state` to the candidate deployment.

## Testing Strategy

### TDD Contract Tests

Implementation begins with failing tests for:

- `workflow_dispatch` as the sole production-deploy trigger and the sole trigger
  for each durable Artifact Gate;
- the dispatcher accepts only one closed, content-addressed
  `production_gate_id` plus the confirmation phrase; the fixed derived Release
  and digest-named asset contain a canonical, attested, unexpired receipt whose
  source, inventory, artifact, bootstrap, expected release, and plan-template
  digests match; malformed casing/length/encoding/separators, outer/inner field
  mismatch, path/search alias, forged/stale/replaced bytes, or replay after host
  admission fails, while pre-admission redispatch needs a new run and approval;
- the effective plan expiry is exactly the minimum of inventory, Production
  Gate, and plan TTL; approval delayed across any parent expiry and host clock
  boundary fails before secret use or artifact transfer;
- the compatibility Artifact Gate is also manual-only, accepts only a read-back
  staged host-content receipt, fixes `automatedDeploymentEligible: false`, and
  cannot feed the production workflow; the normal Gate rejects a staged,
  placeholder, compatibility-mode, or future bootstrap receipt;
- an empty-host genesis first invokes only the exact
  `bootstrapStaticPrepareHelperSha256` under its provider-console Gate: the helper
  binds the pre-existing provider authorization receipt, reviewed static
  contracts, and nonce into `rotationId`, then durably publishes the static
  prepare journal, admission fence, and `hostBundleContentReceipt` before any
  bootstrap key, sudoers entry, updater issuance, production secret, application
  process, pointer, or database is reachable. Missing/wrong helper bytes, an
  attempt to use Step 5 bootstrap authority early, or any operation outside that
  closed write set fails and scrubs/fences according to the static-prepare
  contract;
- all three bootstrap receipt schemas reject wrong type domains, unknown fields,
  non-canonical bytes, broken/missing parent links, out-of-order use,
  cross-target substitution, expiry, and replay; missing, renamed, or swapped
  expected Environment secrets/variables, credential ID, generation/receipt/
  HMAC/outer-state tuple, host/user/port,
  deployment-key, or host-key fingerprint mismatch fail before SSH, while an
  extra secret is rejected by bootstrap and is never dynamically addressable by
  the normal workflow;
- bootstrap generation N -> N+1 requires a fresh content, activation, and final
  receipt chain with both typed edges consumed exactly once, exact predecessor/
  rotation/CAS evidence, the shared GitHub concurrency key, and a durable host
  fence; genesis-with-predecessor, reuse of an N parent, partial GitHub update,
  crash at every prepare/activate/commit boundary, deployment/recovery/status
  overlap, non-monotonic/current-variable drift, final-companion digest drift,
  or live authorization-HMAC mismatch fails closed and is resumable only by the
  exact rotation state machine;
- rotation cannot prepare while `artifact_pending`, a nonterminal/recovery
  journal, or an unattached `controller_closeout_pending` exists; after exact
  terminal evidence is durable, the fixed receipt-bound 120-second ack deadline
  plus root-owned 30-second persistent finalizer timer deterministically attaches
  an unacknowledged lease to immutable N evidence without deleting it; controller
  loss, reboot before/after deadline, duplicate timer runs, forged early attach,
  and failed CAS are covered, and an emergency rotation proceeds only after the
  exact attached state while later receipt recovery remains readable;
- terminal-publication tests serialize a receipt body containing the immutable
  initial closeout-lease identity/timestamps but no self digest, then hash it and
  atomically bind that digest in the outer replay record plus independent lease.
  A self-digest field, wrong outer/lease digest, receipt rewrite, or crash at any
  body-fsync/hash/outer-record/lease-CAS boundary cannot produce a validated
  terminal result and converges without losing the retained body;
- controller-closeout upload tests enforce
  `not_started -> upload_started -> upload_committed_observed`, upload only after
  the started CAS, acknowledgement only after exact artifact digest/retention
  readback, and no reset. Runner loss before/after each transition, artifact
  mismatch/deletion/expiry, and finalizer attachment preserve the monotonic state;
- critical-state fault tests distinguish the nonterminal journal marker from the
  final record: a lingering cgroup/process, database capability/handle, permit,
  shared database-identity/business lease, or unknown guard blocks the terminal
  receipt and remains recovery/manual-intervention eligible. The original
  recorder must exit before the external critical finalizer runs. Failure to
  acquire/readback the single global database-identity plus business leases,
  publish/readback the critical identity fence, hold both leases through record
  publication, or later prove the finalizer inactive and both leases free under
  that fence never maps to `validated_critical_failure`;
- terminal-state matrix tests prove all four non-critical states retain only the
  selected release's plan-bound permits/runtime handles/shared identity leases
  while every transient migration/custody/recovery resource is closed and the
  guard is absent; critical retains no runtime holder, closes permits, retains
  the guard, and carries the external exclusive-lease proof;
- while fenced, neither retiring N nor pending N+1 deployment keys can admit a
  deploy; only a freshly approved temporary bootstrap provider may resume/abort,
  N+1 becomes eligible only after `rotation_closed`, matching dual cleanup
  evidence, and fence removal, and
  a crash after N removal has no deployment-key fallback;
- hash-DAG tests prove `rotationId` depends only on the pre-existing provider
  authorization receipt plus static contracts/nonce; activation-record digest,
  per-attempt activation receipts/chain, dynamic updater issuance, final active
  receipt, and closeout evidence point only forward. A record self-digest, static updater contract containing
  `rotationId`/final receipt, omitted/wrong outer record digest, or a dynamic
  issuance value fed back into prepare is rejected;
- the locked bootstrap principal has no standing key, shell, sudo, or normal-
  workflow route; each provider-approved activation first persists the exact
  staging lease, durably stages only the exact key/no-argument sudoers fragment,
  and publishes the immutable non-self-hashing activation record last,
  accepts only the
  fixed entry shim/root launcher, exact provider receipt/rotation/journal/
  generation, closed operation enum, matching ephemeral fingerprint, and a
  maximum 15-minute expiry, while a wrong operation, argument, key, predecessor,
  journal, target, replay, or expired activation fails without changing state;
- success, abort, authenticated rejection, expiry, controller loss, and a crash
  before/after each staging write, record-last publish, state-lease CAS, and
  cleanup boundary deterministically scrub or fence; cleanup terminates/empties
  the exact privileged cgroup, removes and parent-fsync/read backs the ephemeral
  key, activation record, sudoers fragment, and state lease, and retains only the bound aggregate-safe
  consumed/cleanup evidence; after N-key removal, resume requires a new provider
  Gate, new ephemeral fingerprint, and the same durable `rotationId`/latest
  journal; an already authenticated operation is killed at expiry and cannot CAS
  after it. Reboot tests cover `staging`, `armed`, `in_progress`, operation
  `terminal`, and every `cleanup_pending` substep; none re-arms or repeats a
  privileged operation, and lease removal occurs only after cgroup/triple/
  evidence readback. `staging` with no published activation record produces
  explicit `absent_not_published` cleanup evidence with a null record digest and
  appends the abandoned attempt before retry; it never skips evidence;
- the static updater contract contains no run-derived field; every dynamic issuance is
  exact-repository/Environment/permission/API/name/platform-expiry/use-deadline-
  bound, requires `Actions: read` and rejects every missing/extra scope or call.
  Before any GitHub mutation, the host fsyncs an exact
  `updater_issuance_staging` reservation with a deterministic App/repository
  locator, attempt nonce, zero-key/no-installation precondition, and closed
  sequence. Crashes before/after key creation/installation and each journal
  append recover only a unique zero-or-one provider resource; multiple/unrelated
  resources remain fenced. Token tests separately cover pending, confirmed,
  definite-not-minted, and response-lost
  `token_outcome_unknown_may_have_minted`: the unknown path never enumerates or
  invents token metadata, deletes/readbacks the installation and one-use key,
  binds invalidation proof with nullable timestamps, and enters the abandoned
  issuance chain before retry.
  A replacement issuance appends the predecessor chain, invalidates/deletes any
  unactivated pending final receipt, and requires the GitHub tuple to be
  recomputed; it can never reuse the old receipt digest.
  Normal closeout revokes the token and removes the one-use App key/installation;
  controller loss instead persists `github_updater_cleanup_pending`, and only a
  fresh Risk A owner recovery plus fresh bootstrap activation may prove cleanup,
  close the journal, and remove the fence. One-hour platform expiry alone never
  passes the test;
- crash injection at dual-readback, `rotation_committed_cleanup_pending`, GitHub
  proof, host cgroup/triple cleanup, combined closeout publication,
  `rotation_closed`, and fence unlink proves the root outside-cgroup coordinator
  removes the fence only after every prior fsync/readback and can resume the same
  journal without a surviving bootstrap credential;
- the manual receipt-recovery workflow accepts only the canonical recovery ID,
  safe original run ID/attempt, and phrase; it rejects any extra input and
  byte-compares the host-indexed tuple to those inputs. It requires a new protected approval plus
  a current-key bounded challenge followed by challenge-audience OIDC, and reads
  exactly one retained historical terminal record without execute/ACK/journal
  mutation. Tests reject a challenge/lookup shortcut, wrong repository/event/
  Environment/runner/workflow path-ref-SHA, controller/parser/bootstrap digest,
  stale challenge, dropped retained parser, rotation fence, old-key use, missing
  shared concurrency, an old attempt not completed or outside the closed failure/
  cancelled/timed-out/stale/startup-failure set, and a recovery after 24 hours.
  The artifact-state table tests exact present/readback, sole
  not-started-plus-absence eligibility, started-plus-absence ambiguity,
  committed-plus-missing/deleted/expired rejection, nonterminal/ambiguous ID, and
  forged cross-run binding. A live old
  controller may store `controller_incomplete`; a hard-lost/cancelled run retains
  its native conclusion and the exact independently proven present/absent/
  ambiguous artifact state, which the new `recovered_closeout` record binds
  without rewriting. Publisher crash tests cover neither half, exact asset only,
  exact attestation only, and the exact completed pair; either matching partial
  state resumes only its missing write, while a conflicting/multiple half rejects
  a second result. Nonterminal/invalid no-claim diagnostics remain attempt-scoped
  and never create or reserve the canonical validated tag, so a later converged
  terminal result remains publishable;
- execution/recovery/custody/database-helper generations are immutable; changing
  active bytes requires the activation Gate and bounded service validation, a
  running/retained N journal never resolves through N+1 bytes or keys, and
  authorization-only rotation cannot replace active execution;
- the public bootstrap companion contains only a root-keyed host authorization
  HMAC and safe key-generation ID; substituting low-entropy host/user/port/key
  candidates cannot be validated offline, and helper/key-generation drift fails
  host admission;
- known-hosts parsing accepts exactly one canonical endpoint/port/ed25519 tuple
  and rejects aliases, hashed/wildcard/comma hosts, markers/CAs, extra lines/
  keys, duplicate endpoints, comments, and non-canonical base64; signal, parser,
  or step cancellation leaves no linked key/known-hosts/raw-capture file, and
  the non-secret probe enforces `MFD_CLOEXEC | MFD_ALLOW_SEALING` plus the full
  verified seal set before secret read; an injected actual-seal failure closes
  anonymous FDs before spawn; the no-shell spawn inherits exactly the fixed
  sealed child slots and rejects a caller-selected FD number, unrelated inherited
  FD, close-on-exec mistake, or local-grandchild path;
- rollout ordering proves staged host content plus `artifact-publication`
  protection exist before compatibility publication, while production
  credential/Environment activation occurs only after manual compatibility
  deployment and intermediate host-activation readback; the final active
  bootstrap receipt is generated only after all authorization is installed and
  read back;
- a push, PR, schedule, repository-dispatch, reusable caller, runtime selector,
  source selector, or release-tag selector cannot reach the publisher;
- Artifact Gate runtime derivation from the exact read-only inventory receipt,
  tracked allowlist enforcement, and closed confirmation grammar;
- protected `master`, fixed Environment, deployment/bootstrap shared
  concurrency, no cancellation, and `run_attempt == 1`;
- exact Node selection allowed by the root package engine contract;
- preflight before the first deployment-secret reference;
- exact source/check/artifact/plan/inventory and installed rollback
  source/artifact/tree/runtime/dependency/lease-contract drift rejection;
- durable artifact manifest, checksum, Git-tree, provenance-attestation, and
  runtime-contract validation before and after approval;
- lock-integrity-only fetch with lifecycle scripts disabled followed by a
  network-disabled, source-only native build using digest-pinned image,
  toolchain, and headers; any secondary download, unknown install script, or
  egress attempt fails;
- exact `better-sqlite3` lifecycle metadata is validated but never invoked;
  only the reviewed direct pinned-`node-gyp` adapter can create its native
  binary offline;
- the exact two-entry database contract and same-physical-file rejection; config
  generation, symlink target, device/inode replacement, logical-role swap, or
  observed-schema/ledger/start-state drift between inventory, Gate, approval,
  quiescence, and first write changes the host-keyed binding and fails before
  backup/migration; path/config/
  inode replacement after backup-lock close but before migration/recovery is
  rejected by the held identity lease and actual-opened-handle HMAC;
- distinct systemd phase/service units can receive database capabilities only
  through the exact authenticated transaction-local `SCM_RIGHTS` custody helper;
  exited-oneshot inheritance, caller-selected path/FD, wrong peer UID/cgroup/
  invocation/permit, helper crash during handoff, and an unlocked OFD interval
  fail; candidate code cannot receive/unlock the guardian lease FD, guardian
  death stops its child cgroup, and reboot recovery may reopen only after all
  holders are absent and full actual-handle identity revalidation passes;
- `none` requires identical pre/post schema identities; additive success requires
  the exact expected post identity and ledger/transition digest; first-database
  commit plus second-database failure records the exact post/pre terminal vector,
  while an unreviewed post shape, partial ledger/shape, or receipt that substitutes
  inventory pre identity for actual final identity fails;
- closed application/auxiliary/gated-business/migration writer coverage;
  declaration-independent static discovery of package/bin/CLI/unit/direct DML
  and DDL launch surfaces; canonical per-release registry/digest equality across
  exact source, durable companion/bundle/declaration/provenance, plan, tree, and
  inventory; separate candidate/rollback verification-receipt digests;
  bidirectional active/dormant host binding; and exact auxiliary
  pause/drain/restore state binding;
- a self-consistent installed rollback registry that omits a dormant source
  entrypoint, or whose durable companion/artifact/provenance is missing or
  mismatched, fails the independent rediscovery before approval;
- `writer-registry.json` durable-companion, bundle, and installed-tree bytes are
  equal; its digest is bound by the assembly manifest/declaration/provenance/
  plan; and portable Artifact Manifest v1 gains no deployment-only field;
- direct or stale operator-script execution without the inherited shared lease
  fails before database open, and the deployment guard closes every
  check-to-write race while exact application/auxiliary permits remain usable;
- direct, stale, wrong-plan, wrong-phase, or non-exclusive migration invocation
  fails in both the root-owned admission adapter and entrypoint before database
  open; the adapter/verifier digests bind through every authorization/evidence
  layer;
- a stale, unfsynced, wrong-release, or wrong-transaction application permit is
  rejected before the normal candidate start and every rollback/recovery closes
  or replaces it durably;
- closed input grammar and fixed target/service/release-unit values;
- minimal permissions, isolated Deploy Note writer, exact Environment-only
  reserved secret/variable names, live Environment-policy readback, and exact
  approval-history binding; deleting an Environment item while leaving an equal
  repository/organization fallback, duplicating any reserved name at a wider
  scope, falling back the metadata App inputs themselves, or drifting its
  read-only permissions/installation must fail before host secrets or SSH;
- source checkout with read-only non-persisted credentials, tokenless builder,
  and a publisher that has the exact write scopes but cannot checkout, extract,
  import, or execute candidate/builder content;
- Environment-bound one-time OIDC admission claims, short expiry, consumed
  token/transaction replay rejection, and no SSH-only fallback;
- OIDC/host-contract validation before artifact transfer or durable write,
  bounded pre-auth rate/concurrency, authenticated marker quota/retention, and
  fail-closed compaction;
- exact launcher, recovery target/units, service drop-in, migration-admission
  adapter, writer-registry verifier, contract digest, and bootstrap receipt
  binding in plan, OIDC authorization, journal, and receipt;
- effective root can create/start/read back only the exact Gate-derived
  deployment transaction and can create/start/terminate/read back only the exact
  plan-bound migration unit/cgroup under its fixed UID; an arbitrary unit,
  executable, UID, cgroup, or generic `systemd-run` request is rejected;
- fixed SSH principal, root-owned launcher, no-argument sudo boundary, and
  unprivileged ownership rejection;
- strict SSH flags with no default config, agent, key, host file, PTY, or
  forwarding fallback;
- raw stdout/stderr capture without Actions-log exposure and sanitized safe-code
  output;
- a missing/mismatched candidate or rollback registry or independent
  verification-receipt digest is always invalid;
  a false active/dormant join or migration-execution-closed value is invalid for
  a non-critical state but maps to `validated_critical_failure` only with the
  exact retained-guard/closed-permit critical proof; and
- one admission only, authenticated artifact-pending/rejected journal states,
  ready/final-ACK disconnect races, five-second polling, fixed deadlines, split
  host/controller receipts, and cleanup steps guarded by `always()` with absence
  readback.

### Host Runner Tests

The host state machine is dependency-injected and tested without production.
The matrix includes:

- missing `config/proxy-servers.json` stops before the switch;
- unsupported Node, low capacity, checksum mismatch, dependency/runtime
  mismatch, native-module load failure, config mismatch, backup failure, and
  schema preflight failure restore and validate the old service;
- archive traversal, link/device/special entries, duplicate/case/Unicode path
  collision, expansion limit, and compression-ratio violations fail before
  extraction;
- missing runtime/control database, fallback or release-local path, implicit
  DDL, either backup failure, and same-file identity fail closed;
- the application UID cannot write the candidate, previous release, or protected
  config before or after ownership freeze;
- candidate code/native modules execute before backup only as the isolated
  validation UID with synthetic fixtures and cannot traverse protected config,
  live databases, runtime state, or network; the application UID first executes
  candidate code only after coherent backup and quiescence;
- both backups occur while the service and every reviewed auxiliary writer are
  quiesced, no gated business mutation holds a shared lease, and both database
  write locks are held; no migration unit is active, every prior transient unit
  is inactive, every cgroup is absent/empty with no descendant, every capability
  is revoked, and every migration handle is closed; an unknown writer, failed
  drain, lingering child, delayed handle, changed unit, or incoherent checkpoint
  fails before backup;
- injected I/O/power loss at backup close, file fsync, rename, directory fsync,
  or pair-manifest publication cannot reach schema work or a rollback-ready
  receipt;
- no migration unit starts until both backup readback handles and both SQLite
  write-exclusion connections close and their locks are proven released; an
  injected close/release failure retains the guard/exclusive business lease and
  enters pre-switch recovery;
- injected power loss at candidate file/directory fsync or final-directory
  publication, candidate or rollback `current` rename before parent
  fsync/readback, application/auxiliary-writer permit transition,
  recovery-guard removal,
  or terminal-record publication cannot produce a false terminal success and
  converges on boot;
- a reviewed collector/sidecar write scheduled during backup is delayed then
  processed exactly once, with exact prior timer/service state restored on
  success, pre-switch failure, rollback, crash, and reboot;
- expected-current mismatch or a spoofed matching directory label with a
  different rollback manifest/tree performs no backup or mutation;
- an installed previous release or direct production launch surface without the
  exact lease/guard adapter contract makes the deployment ineligible before
  backup;
- successful switch and acceptance reaches `deployed_validated`;
- service, health, working-release, restart-count, deadline, config, schema,
  feature-flag, or database-integrity rejection triggers code rollback;
- a rejection after auxiliary restore re-closes permits, stops/drains every
  candidate auxiliary shared lease before pointer rollback, and no candidate
  writer survives into the previous-release phase;
- failure immediately before or after rollback-bound application-permit
  publication/fsync/readback converges through recovery without starting the
  previous release under a stale or candidate-bound permit;
- successful rollback returns `rolled_back` and a failing GitHub result;
- rollback validation failure returns
  `critical_manual_intervention_required`;
- additive migration remains compatible after code rollback;
- first-database commit followed by second-database failure produces
  `schema_committed_previous_release_validated`, never `stopped_pre_switch`, and
  cannot start the previous release until the rollback-bound application permit
  is durable and the exclusive lease has been released;
- a later fresh Gate over that schema-only state classifies the first database
  as `already_committed_post` and the second as `pending_pre`, never re-executes
  the first migration, may commit only the second exact transition, and records
  commit origin separately from final schema identity;
- a crash after SQLite COMMIT succeeds but before the external
  `commit_observed` write is classified from the in-database ledger and schema
  as committed, never unchanged;
- migration SIGTERM/SIGKILL, timeout, or a forked child cannot escape its fixed
  cgroup; recovery proves the unit, cgroup, database handles, and exclusive
  lease inactive/closed before ledger classification or application restart;
- a nominal-success migration that leaves a forked child, inherited capability,
  delayed-close/readback handle, nonempty cgroup, or lost exclusive lease cannot
  enter pointer switch or application start and is classified through recovery;
- a direct/stale migration, adapter race before backup, or migration cgroup
  present before the schema phase fails before database open and cannot be
  mistaken for a reviewed migration;
- candidate synthetic writes for every registered enum/JSON/state/domain are
  readable, processable, and safely writable by the exact plan-bound rollback
  source/artifact/tree/runtime/dependency release, candidate can read its
  writeback, and the pair digest changes if either side changes;
- destructive or identity-impacting release plans are rejected;
- stale or modified launcher, recovery unit, service drop-in, sudoers/key
  binding, contract digest, or bootstrap receipt is rejected before admission;
- SSH disconnect or GitHub cancellation does not stop host-local convergence;
- admission acknowledgement loss triggers status lookup and never a second
  execute request;
- an invalid/expired OIDC frame creates no persistent path and receives no
  artifact byte, while a disconnected authenticated ready acknowledgement stays
  `artifact_pending` until accepted or durably rejected;
- timeout or reboot in `artifact_pending` removes only its bounded temporary
  file and cannot start production recovery or claim a transaction;
- state quota exhaustion, expired-record compaction, and a leaked-key request
  flood remain byte/count/rate bounded and cannot evict active or retained
  critical evidence;
- SIGTERM, SIGKILL, runtime timeout, transient-unit failure, and simulated reboot
  at every mutation boundary converge through the phase-chained recovery
  bundle;
- recovery-phase retry exhaustion invokes only the critical-state recorder and
  leaves writers quiesced, while power loss before that record re-enters from
  the nonterminal journal on boot;
- a gated operator mutation already holding the shared lease drains before the
  exclusive backup lease, while a start racing with or following guard
  publication fails before database open and never reaches the backup window;
- systemd integration proves stop/fence before pointer reconciliation, a
  distinct application start, application validation, auxiliary-writer
  permit/restore,
  independent finalization, `network-online` before the public recovery probe,
  and no dependency cycle;
- boot with an already healthy local service but delayed network readiness
  within the four-minute bound waits and succeeds rather than recording a false
  critical state;
- terminal receipt publication followed by controller loss and reboot before or
  after the fixed acknowledgement deadline causes only the digest-bound local
  closeout finalizer to attach the lease idempotently; an early, wrong-receipt,
  wrong-generation, nonterminal, missing-readback, or failed-CAS attempt retains
  the rotation block and never deletes evidence;
- recovery from an active post-switch process proves an explicit stop and old
  process exit before pointer correction, followed by a distinct start whose
  working release is the journal-selected release;
- replay and concurrent runs are lock/replay-marker rejected; and
- every receipt and error path is aggregate-only and size-bounded.

### Clean Integration Validation

A disposable Linux environment matching the target's freshly observed OS and
an exact Node version allowed by the root package contract uses:

- synthetic release directories and atomic `current` pointer;
- a systemd adapter or isolated service harness;
- disposable distinct runtime and control SQLite fixtures containing no
  production rows, plus a same-file negative fixture that must be rejected;
- synthetic protected config with no endpoint or credential values; and
- local fake loopback/public health servers.

It must execute one complete successful promotion, one forced health failure
with automatic rollback, one first-database-commit/second-database-failure, one
post-COMMIT/pre-journal crash, one writer-during-backup attempt, one connection
interruption, and one forced process/boot recovery. It verifies the coherent
backup set independently, checks old/new schema and persisted-data
compatibility, proves auxiliary-writer state and exactly-once observation
restoration, and
proves no secret-like material enters receipts, temporary evidence, or Actions
logs.

### Source PR Validation

The single source implementation PR must pass:

- targeted workflow, artifact, plan, host-runner, health, receipt, schema, and
  cleanup tests;
- full `npm test`;
- `git diff --check origin/master...HEAD`;
- exact-head CI and CodeQL;
- exact-head ephemeral packaging verification plus durable-publication contract
  tests, including offline native build, that perform no repository or Release
  write from the PR head;
- a GitHub dry-run packet exercise with no production secrets; and
- independent semantic and security review.

This design-only commit requires `git diff --check` and design self-review; it
does not run implementation tests.

## Rollout Sequence

The implementation and first use remain separate:

1. Include this reviewed design, workflow, runners, validators, tests, and
   runbook updates in one source-only Draft PR.
2. Complete clean validation, exact-head checks, independent review, Ready,
   and merge. No production credential or deployment is created by the PR.
3. Through a separate Risk A inventory and approval, stage the exact root-owned
   host execution bundle, approve the static contract set and nonce in a
   pre-existing provider authorization receipt, derive `rotationId` only from
   that receipt/static prepare envelope, and invoke the exact no-argument
   `bootstrapStaticPrepareHelperSha256`. The helper alone publishes/fsyncs and
   reads back the admission fence, `rotation_prepared` journal, and content-
   addressed `hostBundleContentReceiptSha256` for a new bootstrap generation.
   No activation record, bootstrap SSH/sudo authority, updater issuance, or
   production credential is needed to compute that ID or create this static
   state.
   Separately establish and read back the
   no-production-secret `artifact-publication` Environment protection needed by
   the compatibility publisher. Do not create a production GitHub credential,
   configure `vultr-japan-production` secrets, enable the deployment lane, or
   activate application/recovery bindings yet.
4. If the installed previous release lacks either the no-bypass
   business-mutation lease/guard contract or its canonical registry and
   independent durable proof chain, run the distinct compatibility Artifact
   Gate against that staged receipt, then use a separate approved backup/manual
   deployment Gate to install the exact compatibility bundle and atomically
   activate/read back the matching host bytes. If the previous release already
   satisfies the source contract, use the same separate activation Gate without
   a compatibility source deployment. Either path must end with a healthy exact
   rollback release and intermediate `hostActivationReceiptSha256`; that receipt
   is not valid for a normal Artifact Gate or deployment admission. The
   implementation release cannot be introduced as its own first automatic
   rollback baseline.
5. Establish a separate Risk A credential/authorization Gate, including
    a provider-console-approved, maximum-15-minute bootstrap activation for the
    locked `github-control-bootstrap` principal and its exact staging lease plus
    ephemeral key/activation/sudoers triple, forced entry shim/root launcher,
    bounded operation cgroup, cleanup unit, fresh attempt receipt/ordered chain,
    and one-time operation; separately, before the first GitHub mutation, persist
    the exact updater issuance reservation/locator and append/read back each safe
    key/installation/token lifecycle state, then create the dynamic issuance
    chain for the dedicated repository/
    Environment-scoped updater App token and aggregate-safe consumed/revoked/absence
    evidence; this principal is unavailable to the normal workflow and has no
    standing key or sudo rule,
    public-key fingerprint, pinned host key, forced-command restriction, runner
    and recovery-target/unit/drop-in digests, validation identity/namespace,
    business-mutation helper/guard, migration-admission adapter,
    writer-registry verifier, database-binding helper/root-key generation and
    transaction-local capability-custody helper/unit/socket contract,
    reviewed auxiliary-writer unit bindings, metadata-scope App read-only
    permission/installation contract, static updater-App permission/API contract,
    one-hour platform expiry plus 15-minute controller-use bound and recovery contract,
    controller-closeout finalizer timer/service, external critical-terminal
    finalizer, receipt-recovery challenge/workflow/controller/parser registry,
    Environment-only reserved-name
    proof, and cycle-free service ordering,
    `vultr-japan-production` Environment protection, production secret
    configuration, and readback. After those host and GitHub authorization
    bindings are final, this Gate re-hashes the exact activated host bytes,
    account, sudoers, authorized-key restriction, Environment identity, and
    fixed execution contract. Under the shared GitHub concurrency plus durable
    host rotation fence it runs the prepared/activation-armed/updater-issued/
    committed-cleanup-pending generation
    state machine, computes and separately publishes/readbacks the GitHub and
    host HMAC-bound N+1 state, then emits the only final active
    `bootstrapReceiptSha256` plus its identical aggregate-safe protected evidence
    copy. Before the Gate reports success the controller revokes the installation
    token, the separate provider step removes/read backs the one-use App key/
    installation and returns only verified GitHub cleanup proof, and the fixed
    outside root coordinator empties the privileged
    bootstrap cgroup, consumes/removes/fsyncs/read backs the key/activation/
    sudoers triple plus state lease, combines both cleanup proofs, publishes the
    protected closeout evidence, CASes `rotation_closed`, and clears/fsyncs/read
    backs the rotation fence last. If the controller disappears, it records
    `github_updater_cleanup_pending`; a fresh Risk A GitHub-owner recovery Gate
    and fresh bootstrap activation must remove/read back the App key/installation
    and resume this same closeout. It rechecks but
    does not recreate the earlier
    `artifact-publication` policy. Any partial transition remains fail-closed and
    requires the exact resume/abort Gate above.
6. Execute a protected read-only GitHub transport and inventory proof. Stop on
   any target, release, service, systemd recovery/guard feature, architecture,
   libc, Node ABI, database binding/config generation/schema identity,
   database-consumer, final bootstrap receipt byte/digest, bootstrap closeout
   evidence/updater-App/finalizer contract, receipt-recovery challenge/workflow/
   controller/parser-registry coverage of every retained schema, candidate/rollback registry or
   independent source/artifact/provenance proof, bidirectional join,
   migration-admission adapter, lease/guard contract, config, or health
   ambiguity.
7. For that exact fresh runtime contract and merged `master` commit, run the
   separate manual-only Artifact Gate. Its tokenless builder performs the
   offline source-native dependency build; after no-write verification, the
   isolated publisher reads back `artifact-publication`, waits for independent
   approval, re-hashes opaque outputs, and uses only the minimum
   publication/attestation writes to attest and upload the durable target-matched
   bundle, final bootstrap-receipt companion, and other companions. The Gate verifies exact Git-tree, provenance, bytes,
   and retrievability, then publishes last the immutable, attested, unexpired
   Production Gate receipt derived from that inventory, final bootstrap receipt,
   artifact, and canonical plan template. It publishes no production deployment.
8. The operator reviews that exact durable Production Gate receipt and safe
   summary, then manually dispatches the workflow with only its closed
   content-addressed ID and the confirmation phrase. The no-secret preflight
   materializes it into the new run-bound plan; it does not create, select, or
   consume a Gate. The host consumes the receipt digest only after approval and
   successful OIDC admission.
9. An independent reviewer approves the exact pending Environment deployment
   and its run-bound plan derived from that pre-dispatch Gate.
10. GitHub completes deployment, validation, automatic code rollback when
   required, cleanup, and receipt validation.
11. Perform final read-only validation and record the Deploy Note or failed/
   rolled-back attempt accurately.

No source approval is reusable as a production approval. No failed or stopped
workflow run is retried under the old Environment approval.

## Acceptance Criteria

The design is implemented only when all of these are true:

- an operator must manually start every production deployment;
- that dispatch supplies only the reviewed immutable, unexpired Production Gate
  ID and confirmation; canonical outer/inner identity is unique, the run
  reproduces its stable plan body, effective expiry never exceeds a parent, and
  host admission consumes the receipt digest at most once;
- a distinct reviewer must approve the exact protected job;
- approval releases only the dedicated forced-command deployment identity;
- host admission also requires a fresh Environment-bound GitHub OIDC assertion
  for the exact plan/run and consumes it once;
- the deployer cannot select a different target, service, path, command, or
  source commit;
- the SSH principal cannot write its authorization, launcher, release root,
  backup root, service definition, protected config, or transaction records,
  and has no privilege outside the exact no-argument root launcher;
- staged-content, compatibility-activation, and final bootstrap receipts use
  disjoint canonical type domains and an exact one-time parent chain; only the
  final authorization- and installed-state-bound receipt can enter a normal Gate,
  a rotation uses a complete new generation with predecessor/rotation/CAS
  evidence, GitHub and host live readback match the plan's current generation
  and keyed authorization bindings, and the shared concurrency plus durable host
  fence prevents any deployment/recovery overlap or partial-state admission;
- before the first temporary bootstrap authorization exists, only the reviewed
  no-argument static-prepare helper can create genesis state, and its authority
  is limited to the immutable host generation, prepare envelope, rotation
  journal/fence, and content receipt; it cannot reach GitHub, credentials,
  application services, releases, pointers, or databases, and every later Gate
  consumes its exact read-back journal/content digest;
- the bootstrap hash DAG is acyclic: a pre-existing provider receipt plus static
  contracts produce `rotationId`; immutable activation record and dynamic updater
  issuance plus each fresh activation-attempt receipt/record bind that ID; final
  receipt and closeout evidence bind those dynamic
  objects only forward;
- the bootstrap recovery principal has no standing authorization and is never
  available to the normal deployment workflow; genesis/resume/abort requires a
  fresh, expiring provider-console Gate bound to one rotation/journal/generation
  and ephemeral fingerprint, and normal deployment remains ineligible until the
  operation cgroup is empty, staging/state lease and key/activation/sudoers
  triple, updater App token, one-use App key, and temporary installation are
  consumed/revoked/removed, fsynced or read back absent/unusable, matching dual
  closeout evidence is durable, `rotation_closed` is read back, and the root
  coordinator removes the fence last; controller loss requires the separate
  GitHub-owner recovery and platform token expiry alone is insufficient;
- every terminal transaction binds a fixed controller-ack deadline; the exact
  boot-persistent, digest-bound local finalizer deterministically attaches an
  unacknowledged lease only after durable terminal evidence and production-state
  readbacks, so a lost controller cannot block a separately approved emergency
  credential rotation indefinitely or erase later receipt recovery;
- a critical journal marker is nonterminal until all executable/custody/database
  handles are closed, permits are closed, the single global database-identity
  OFD lease and exclusive mutation lease have been freshly acquired/read back,
  held through publication, then proved free under the retained guard/critical
  identity fence; only the external critical finalizer may publish the
  durable `critical_terminal_record`, and status must prove that finalizer itself
  inactive before yielding `validated_critical_failure`;
- irrecoverable runner loss never changes the old run after the fact: a distinct
  manual-only, independently approved workflow must complete the current-key
  bounded challenge then recovery-audience OIDC with exact workflow/controller/
  retained-parser identities before it may read one historical record by its
  canonical recovery ID plus safe original run/attempt inputs, require the host
  index to match them, and publish a separate recovered-closeout result, with
  no deployment, acknowledgement, host-state write, old-run rewrite, or old
  approval reuse; the old exact attempt must already be completed in the closed
  non-success set under shared production concurrency, artifact-state/retention
  evidence must pass within 24 hours, and the no-secret publisher can create only
  one attested content-addressed recovered asset;
- SSH accepts exactly the one canonical plan-bound endpoint/key tuple; private
  key, known-hosts, and raw transport output never persist at a linked path;
- the exact artifact is durable, retrievable, checksum-, Git-tree-, runtime-,
  offline-native-build-, and build-provenance-bound;
- candidate and rollback writer registries are independently canonical and
  digest-bound to their exact source, durable companion/bundle/declaration/
  provenance, artifact, and tree through separate fresh verification receipts;
  fresh inventory proves every registry record and every active or dormant host
  launch surface join exactly once in both directions;
- all deployment mutation happens inside one locked, durable-journal
  transaction/recovery state machine, and every independent production DML Gate
  shares its host-local mutation lease and obeys the deployment guard;
- every live database operation after quiescence uses the plan-bound identity
  lease plus authenticated transaction-local FD custody and proves config/
  device/inode identity on the SQLite handle actually opened; no exited oneshot
  is treated as an FD carrier, while observed schema, migration input, expected
  post, start state, transition digest, ledger/commit origin, and per-database
  actual terminal state remain distinct and receipt-bound;
- success is published only after candidate tree, backup pair, `current`
  pointer, permits, guard removal, and the combined receipt/replay record pass
  their atomic publish, parent-fsync, and readback barriers, with both registry
  joins and migration-execution-closed proven true;
- execute is admitted at most once and the controller performs mandatory
  status-only polling to a terminal bound receipt;
- failure before any schema commit leaves the final production state unchanged;
- failure after an additive schema commit but before code switch leaves the
  previous code validated and records the exact schema-only production change;
- post-switch rejection automatically restores and validates the prior code
  release whose source, artifact, tree manifest, runtime, dependency, and
  persisted-data pair digest exactly match the plan and fresh inventory;
- the exact previous release and every production-capable launch surface already
  enforce the shared lease/guard contract before this capability is enabled;
- both required logical databases are explicit, release-external, physically
  distinct, coherently backed up under one write-quiescent window, independently
  validated, and candidate startup performs no implicit DDL; their host-keyed
  config-generation/file identities and schema identities remain equal to
  inventory/Gate/plan through the final pre-write check;
- the fixed application, closed auxiliary writers, closed gated business
  mutations, and fixed migration entrypoints form a disjoint/exhaustive writer
  set; each uses its own contract, operator commands cannot bypass the shared
  lease/guard, and auxiliary quiescence/restoration loses or duplicates no
  observation;
- each migration commit is classified from DDL and a ledger row committed in
  the same SQLite transaction, never from an external marker alone;
- no migration phase can reach pointer switch or application start until its
  capability is revoked, unit/cgroup/descendants are empty, all database handles
  are closed, and the transaction's exclusive lease is read back;
- incompatible schema, persisted-data, and identity-impacting releases are
  rejected;
- database overwrite recovery is never automatic;
- every output is aggregate-only and cleanup is read back;
- success requires the exact release, stable service, bounded local and public
  health, config identity, database integrity, schema readiness, feature-flag
  state, backup, rollback readiness, and final receipt; and
- neither merge, successful CI, artifact creation, workflow source, nor this
  document is reported as a production deployment.

## Alternatives Rejected

### Deploy On Every Merge

This would create unintended production queues and weaken the project's Risk A
operator boundary. It is rejected.

### Fully Unattended Production Deployment

Removing the protected Environment approval would make source integration act
as production authority. It is rejected.

### One-Time SSH Identity For Every Deployment

This minimizes credential lifetime but requires a separate manual bootstrap
before every run, contradicting the approved goal that GitHub complete the
transaction after approval. A dedicated forced-command identity with explicit
rotation is the smaller operational system.

### Self-Hosted Runner On Production

This adds a persistent GitHub execution surface to the production host and
increases credential and workflow trust. It is rejected.

### Generic SSH Or Reusing Runtime-Config Credentials

Both broaden authority and couple unrelated release units. They are rejected.

### Automatic Database Restore

Restoring an older database after the candidate may have accepted writes can
lose production data. Only additive compatible schema is allowed, and database
recovery remains a separate approved Gate.

## References

- `AGENTS.md`
- `RELEASE_MANIFEST.md`
- `docs/CURRENT_RELEASE_STATE.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/INFRASTRUCTURE_ACCESS_RULE.md`
- `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- `.github/workflows/production-deploy-dry-run.yml`
- `.github/workflows/release-artifact.yml`
- `.github/workflows/japan-runtime-config-additive-repair.yml`
- `scripts/control-plane-promotion-health-gate.mjs`
- `scripts/control-plane-release-config-gate.mjs`
- [GitHub REST: deployment environments](https://docs.github.com/en/rest/deployments/environments)
- [GitHub REST: workflow-run approval history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run)
- [GitHub REST: Actions secrets](https://docs.github.com/en/rest/actions/secrets)
- [GitHub REST: Actions variables](https://docs.github.com/en/rest/actions/variables)
- [GitHub REST: permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [GitHub App installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [GitHub Actions secret precedence](https://docs.github.com/en/actions/reference/security/secrets#naming-your-secrets)
- [GitHub REST: artifact attestations](https://docs.github.com/en/rest/orgs/attestations)
- [GitHub Actions workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [GitHub Actions OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc)
