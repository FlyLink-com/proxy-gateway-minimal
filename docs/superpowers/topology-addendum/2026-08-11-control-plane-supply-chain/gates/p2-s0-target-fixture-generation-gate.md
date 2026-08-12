# P2-S0-FX2 Gate Package: Target Private Fixture Generation Design

```yaml
phase: P2-S0-FX2 published design Gate
work_item: target-fixture-generation_design_gate
parent_gate: P2-S0
predecessor_gate: P2-S0-FX1
predecessor_route: Route A
predecessor_output: BLOCKED_INPUT
status: Route B design Gate published not granted / producer not implemented / fixture not generated / P2-S not started
risk_class: A
risk_state: controlled
record_state: published_not_granted
gate_decision: not_granted
current_output: BLOCKED_INPUT
current_authority: none
route_b_source_authority: false
workflow_change_authority: false
fixture_generation_authority: false
workflow_dispatch_authority: false
fixture_custody_handoff_authority: false
p2s_authority: false
production_authority: false
```

## Decision

PR #608 published the Route A
[P2-S0-FX1 Gate](p2-s0-target-fixture-acquisition-gate.md) at merge
`6d6a0a197e89706d4de591f0d8cbecaef18df2c1`. A later read-only preflight
still found no repository-visible producer, target fixture, or external custody
manifest. Route A therefore remains `BLOCKED_INPUT`. That is the terminal
result for this evidence snapshot, not a claim that no external fixture can
ever exist. A future custodian would require a superseding Route A Gate rather
than a rewrite of the recorded result.

This package defines Route B: a future, deliberately generated target-
repository private attestation fixture. It freezes the producer design,
permissions, subject contract, custody model, failure semantics, and serial
approval sequence. It does not add a workflow, select an Action dependency,
grant a permission, dispatch a run, generate or download a fixture, execute an
official verifier, or start P2-S.

PR #609 published this design Gate at merge
`a413f636267a3b0fcfc65f7b911fa50f6cd95ea4` without granting it. Current output
remains `BLOCKED_INPUT`. A separate producer-source review cannot become
actionable until the open
competing Draft PR #594 is closed without merge, the source baseline is
refreshed, a dedicated protected Environment is separately approved and read
back, and exact Action pins and lifecycle controls are independently reviewed.

## Exact Design Baseline

Read-only inventory captured through `2026-08-11T18:06:06Z`:

| Item | Exact observation | Design consequence |
| --- | --- | --- |
| Default branch | commit `6d6a0a197e89706d4de591f0d8cbecaef18df2c1`; tree `243824bbb51fb3b2d30d5397b39549d36499dd44` | This binds this docs-only design. Every later source or execution Gate must refresh the remote default branch. |
| Workflow tree | `1a95a55d23f6e7b2d5e60556b9934027b0974b09` | Nine workflows are present; no attestation producer or attestation/OIDC write permission was observed. |
| Dormant publisher | `.github/workflows/control-plane-foundation-toolchain-publish.yml`; blob `2867a7bda3d6ca138734dc4b166f0fe49eaf9183` | It remains `permissions: {}` and hard-stopped. Route B must not activate, expand, or reuse it. |
| Foundation inventory | `.github/workflows/control-plane-foundation-toolchain-inventory.yml`; blob `06c0eaf7b18831612d19f5d6a9cdd6e42ee56110` | Diagnostic inventory is not a producer or oracle. |
| Package inputs | `package.json` blob `2c1234c9dc918bc7ba1294cb8c2ff26b72c2b503`; `package-lock.json` blob `f534dff182d16fccb77de8a86b757e532e7ce9c6` | Route B must not modify either file or use npm installation. |
| Parent Gate | `p2-s0-feasibility-gate.md`; blob `b8ce9b57886143aea295aee6773586c19310d586` | The eight-input readiness contract and exact offline official-verifier oracle remain unchanged. |
| Route A Gate | `p2-s0-target-fixture-acquisition-gate.md`; blob `01f93b2b02b5ee186e89b211223aff574f329e59` | Its existing-fixture capture and Route A semantics are historical evidence and are not repurposed for generated evidence. |
| Structured state | `hardening.json`; blob `a64269465251088b9e951ff15472617cd5fb12ef` | This design adds a new Route B state rather than rewriting the frozen P2-D or Route A records. |
| Repository eligibility | private organization repository; organization plan read back as `enterprise` | The documented Enterprise prerequisite for private-repository artifact attestations is currently satisfied, but must be read back again before source merge and execution. |

The current official `actions/attest` documentation says that new
implementations should use `actions/attest`, that private-repository
attestations require GitHub Enterprise Cloud, that an attestation is uploaded
to the GitHub Attestations API, and that `bundle-path` identifies a JSON-
serialized Sigstore bundle on the runner. Those are design inputs, not proof
that this repository has generated a usable RFC3161 fixture:

- <https://github.com/actions/attest>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>

## Open Draft Conflict Boundary

Open Draft PRs are not current capability. They are drift and conflict inputs:

- PR #594 is `OPEN`, `Draft`, and `CONFLICTING` at head
  `a3f2817d696ee9bb66f1e849e0b35e77105fde8e`. Its competing Foundation
  publisher blob `cbe9ba8f949d3c6519a0a6b889177bb8d3c50d4f` contains
  `contents: write`, `id-token: write`, `attestations: write`, an attestation
  action, and GitHub Release creation/upload/publication. It is not merged
  capability and must not be reused as the Route B producer. Before any Route B
  source Gate can pass, PR #594 must be closed without merge and that state plus
  its unchanged head must be read back. Any salvage must be reimplemented from
  fresh master under the bounded Route B source Gate; keeping the competing
  Draft open does not count as supersession or replacement.
- PR #606 is `OPEN`, `Draft`, and behind current master at head
  `e174ea257d102f5a820b11bf88f7fd0016e07fb4`; it proposes deleting two
  workflows and changing authority documents. If it or any other PR changes
  master first, the later source Gate must refresh every commit, tree, workflow,
  package, lock, parent-Gate, and conflict binding.
- PRs #604 and #592 are separate Draft lanes. They do not block publication of
  this design, but any merged source drift must be rebound and their changes
  must not be combined with Route B.

Issue #598 may coordinate the broader supply-chain lane, but its mutable issue
text is not source authority and currently contains stale status for merged
design PR #593. This Gate binds exact commits and blobs instead.

## Proposed Producer Source Boundary

The future source review may consider exactly one new direct workflow and one
workflow-contract test:

```text
.github/workflows/control-plane-private-attestation-fixture.yml
server/tests/control-plane-private-attestation-fixture-workflow.test.mjs
```

Both paths are proposed and currently absent. Their creation is not authorized
by this Gate. The source PR must be based on a fresh exact master and must not
modify the dormant Foundation workflows, package files, lockfile, application
source, Settings, Release, Environment, deployment, or production state.

The proposed workflow contract is:

1. direct `workflow_dispatch` only; no `push`, `pull_request`, `schedule`,
   `workflow_call`, repository dispatch, matrix, reusable-workflow caller, or
   automatic trigger;
2. root `permissions: {}` and static concurrency with
   `cancel-in-progress: false`;
3. an exact pre-attestation guard for event, `refs/heads/master`, source SHA,
   reviewed Gate/source-manifest digest, approved actor binding, and
   `run_attempt == 1`;
4. one preflight/subject-plan job with no OIDC, attestation, artifact-upload, or
   Environment binding; it emits only the deterministic subject digest/size
   and bounded redacted guard result;
5. one attestation job bound to the exact dedicated protected Environment with
   `deployment: false`, and carrying only job-level `contents: read`,
   `id-token: write`, and `attestations: write`;
6. one post-attestation custody job with no OIDC or attestation permission; it
   runs only after the protected attestation job succeeds, reconstructs the
   canonical subject, verifies its digest, and uses the separately pinned
   upload Action for the single subject/manifest artifact;
7. no `contents: write`, `actions: write`, `packages: write`,
   `artifact-metadata: write`, `deployments: write`, `write-all`, custom PAT,
   repository or Environment secret, registry push, Release write, or external
   service credential;
8. one exact full-commit pin for the reviewed `actions/attest` candidate and
   one exact full-commit pin for any subject-custody upload Action; tag, branch,
   floating major, mutable image, or unreviewed transitive action is forbidden;
9. no checkout, npm install, package execution, ambient subject discovery,
   glob, caller-supplied subject name/digest, custom predicate, or second
   attestation; and
10. `show-summary: false`, `push-to-registry: false`, fixed output limits, and a
   post-attestation digest/size/readback step that emits only redacted metadata.

At this design revision, `actions/attest` is an official candidate class, not a
selected dependency. The exact repository revision, action blob, bundled
dependency provenance, license, vulnerabilities, supported runner, and update
policy must be reviewed and frozen by a separate source Gate. Current observed
`v4` or release SHAs are not production selections.

## Exactly-One Subject Contract

The future workflow may create exactly one non-production, non-secret subject
with fixed name:

```text
p2-s0-route-b-private-attestation-fixture.json
```

Its bytes must be canonical UTF-8 without BOM or trailing LF and contain only
the fixed-key-order compact object below, where `sourceCommit` comes from
`github.sha`, not from caller input:

```json
{"purpose":"p2-s0-route-b-private-attestation-fixture","repository":"gccwebos-com/proxy-gateway-minimal","schemaVersion":"1","sourceCommit":"<exact-40-lowercase-hex-github-sha>"}
```

The subject job must validate the exact schema, name, size bound, and SHA-256,
then expose only that digest and size to the attestation job. The attestation
job must use explicit `subject-name` and `subject-digest`; automatic discovery,
path globbing, multiple subjects, subject checksums lists, custom predicates,
and registry subjects are forbidden.

The intended predicate class is GitHub's default SLSA build provenance. The
exact predicate-type URI and predicate-shape expectation remain `UNFILLED`
until the selected Action pin is independently reviewed. Generation cannot be
approved while either remains unfilled.

## Custody And External-Write Model

Route B is not scratch-only. A successful future execution intentionally
creates GitHub-side evidence:

- exactly one workflow run and first attempt, with the three bounded jobs and
  their check, log, annotation, and audit metadata;
- bounded dedicated-Environment reviewer-approval/control/audit metadata for
  the attestation job; `deployment: false` plus direct target-filtered
  `deployments=[]` readback proves no target Deployment parent, while zero
  target-associated deployment-status children is inferred from that absent
  parent rather than from a repository-wide status enumeration;
- exactly one private attestation in the GitHub Attestations API; and
- exactly one bounded Actions artifact containing the canonical subject bytes
  and a redacted generation manifest, with an exact name and retention period
  frozen by the execution Gate.

The raw bundle remains retrievable from the Attestations API by the exact
attestation ID and subject digest. The Actions artifact, job output, log,
annotation, audit entry, and Environment approval record must not contain a PAT,
token, certificate private key, customer data, subscription material, raw
bundle, raw trust material, or production artifact. Before source approval,
reviewers must read back and accept repository Actions log retention plus the
exact artifact retention; deletion is not an implicit cleanup. Bundle, subject,
run, job/check, Environment-approval, artifact, and attestation identifiers are
later inputs to a separately approved Route B read-only custody handoff.

Every generated record must include:

```yaml
origin_route: route_b_generated
```

It may never be relabeled as Route A existing/historical custody. Generation
success is not `FIXTURE_INPUT_READY_FOR_P2S0_REEVALUATION`; it only prepares a
separate content-addressed custody handoff.

## One-Shot Enforcement And Retirement

A merged `workflow_dispatch` workflow creates a real callable surface. Static
guards, concurrency, exact inputs, and `run_attempt == 1` cannot by themselves
machine-enforce one-shot approval. The source-retirement model is therefore not
an alternative to Environment enforcement.

Before source merge, a separate Risk A Settings Gate must create and read back
the dedicated Environment `p2-s0-route-b-fixture-generation` with an exact named
user reviewer, self-review prevention, protected-master policy, no secrets or
variables, and `can_admins_bypass=false`; if the exact bypass restriction is
unavailable, the Gate remains `BLOCKED_INPUT`. Custom deployment-protection Apps
are forbidden, and the attestation job must bind this exact Environment with
`deployment: false`. Current GitHub documentation says required reviewers still
apply while no Deployment object is created. The Settings Gate must also freeze
the observed
platform limitation that a dispatch can create run/check/log/audit metadata
before Environment approval; a wrong actor, extra dispatch, or rejected run is
ineligible history and forces `NO_GO_OPTION1` for the attempt.

After any consumed run—success, failure, rejection after dispatch,
cancellation, or timeout—a separately reviewed source-retirement PR must remove
the callable workflow. The Environment remains protected and inert unless a
separate Settings Gate later changes or deletes it. Positive custody requires a
successful run, the retirement merge, zero additional run/attempt readback, and
a complete inventory of every GitHub object created. A retry requires a fresh
Gate and fresh source reintroduction after retirement; it cannot reuse the
standing workflow. This Gate authorizes neither the prerequisite Settings
change nor the retirement PR.

## Future Source Review Requirements

A separate producer-source request must bind all of the following:

- fresh remote master commit/tree and the published Route B Gate commit/tree/
  blob;
- PR #594 closed-without-merge readback and a fresh no-competing-producer
  inventory;
- exact dedicated-Environment protection/readback receipt from a separately
  approved Settings Gate, including reviewer type/count, self-review, branch
  policy, exact `can_admins_bypass=false`, no secrets/variables, no custom
  deployment-protection App, and current Actions log retention;
- exact two-path source scope, workflow/test blobs, and full diff;
- exact PR-head and post-merge automatic-workflow inventory, including current
  PR validation/advisory/default-CodeQL surfaces and current master CI, Release
  Artifact, and default-CodeQL surfaces; freeze expected ordinary Actions
  artifacts; directly observe zero unexpected GitHub Release, target
  Deployment, or producer run; and infer only that the exact source/retirement
  activity produced no fixture attestation from zero producer run/subject plus
  the frozen automatic-trigger and allowed-write/readback surface, never from a
  repository-wide attestation enumeration;
- exact Action repositories, full commit pins, action manifests, bundled
  dependency provenance, licenses, vulnerability snapshot, runner support, and
  update policy;
- exact trigger, root/job permissions, Environment binding with
  `deployment: false`, concurrency, guards, subject bytes, predicate type,
  output limits, retention, custody, and redaction contracts;
- exact test matrix proving no automatic/reusable trigger, no unapproved
  permission, no caller-selected subject/predicate, no extra attestation, and
  fail-before-write behavior; and
- an exact post-run workflow-retirement PR plan, including its own expected PR/
  merge automatic runs and ordinary artifacts, plus a source-level rollback
  plan.

Source merge may emit only
`SOURCE_PRESENT_FOR_SEPARATE_GENERATION_GATE`. It does not authorize dispatch
or prove that an attestation can be generated or verified. The output is not
available until exact head/merge provenance, required checks, automatic runs,
ordinary-artifact metadata, direct zero unexpected Release/target-Deployment/
producer-run readback, and the bounded no-fixture-attestation inference above
are independently reviewed.

## Future Generation Execution Gate

After the source PR is merged and independently validated, a separate one-shot
Risk A execution Gate must bind:

- exact merged source commit/tree, workflow/test blobs, Action pins, subject
  contract, predicate expectation, runner label/image readback, and organization
  plan/repository visibility;
- exact dedicated-Environment Settings receipt and fresh readback, expected
  reviewer approval boundary, no-secret/variable state, branch policy, exact
  `can_admins_bypass=false`, no custom protection App, `deployment: false`, and
  current Actions log retention;
- exact workflow path/ref, expected `github.sha`, actor binding, event, run-
  attempt policy, concurrency group, input manifest digest, and dispatch
  command;
- expected single subject digest/size/name, Actions artifact name/retention,
  attestation/bundle size limits, per-job timeout/log bounds, and zero-secret
  contract;
- the only allowed persistent objects listed above plus immediate run/job/check/
  log/annotation/audit/Environment-review/API/artifact object-specific
  readback, direct target-filtered `deployments=[]` evidence, and the resulting
  absent-parent inference for target-associated deployment-status children; no
  repository-wide DeploymentStatus enumeration is claimed; and
- failure monitoring, the separately reviewed source-retirement merge,
  no-extra-run readback, and all-object ineligible-history handling.

Approval is consumed when dispatch begins. A rerun, second dispatch, second
attestation, additional subject, unexpected external write, wrong ref/SHA/
actor/predicate, leak, timeout, cancellation after write, or cleanup failure
forces `NO_GO_OPTION1`. Retry requires a fresh approval and must never reuse a
consumed Gate or standing producer source.

A successful run first records only
`GENERATED_FIXTURE_PENDING_MANDATORY_SOURCE_RETIREMENT`. That provisional status
authorizes no handoff. Only after the separately approved retirement merge,
expected automatic-run readback, zero-extra-run proof, object-specific
readback, bounded no-extra-attestation inference, and persistent-object
classification may the generation closeout emit
`GENERATED_FIXTURE_READY_FOR_SEPARATE_CUSTODY_HANDOFF`. Neither output authorizes
a download, official oracle, candidate verifier, parent readiness finding, or
P2-S.

## Failure Outputs

This design Gate may return only:

| Output | Meaning | Required routing |
| --- | --- | --- |
| `READY_FOR_SEPARATE_ROUTE_B_SOURCE_REVIEW` | The design and all source-review inputs are bounded | Request a separate source Gate; do not create or merge source |
| `BLOCKED_INPUT` | PR #594 closure, protected Environment, source/action pin, retirement, custody, predicate, or another required input is absent | Keep Option 1 and stop |
| `REDESIGN_PRODUCER` | The proposed workflow, permission, subject, custody, or mandatory lifecycle cannot satisfy the boundary | Return to docs-only design |
| `NO_GO_OPTION1` | Residual risk or required external-write semantics are unacceptable | Retain the terminal hard stop |

Forbidden outputs include `SOURCE_AUTHORIZED`, `WORKFLOW_AUTHORIZED`,
`DISPATCH_AUTHORIZED`, `FIXTURE_INPUT_READY_FOR_P2S0_REEVALUATION`,
`READY_FOR_SEPARATE_P2S_APPROVAL`, `GO_FOR_SEPARATE_PROFILE_REVIEW`,
`P2_GREEN`, `IMPLEMENTATION_AUTHORIZED`, and `PUBLICATION_AUTHORIZED`.

## Cleanup, Rollback, And Ineligible History

This docs-only preparation has no runtime rollback. Rejecting it leaves Route A
at `BLOCKED_INPUT`, the parent Gate blocked, P2-S not started, Option 1 active,
and the current runtime hard stop unchanged.

For a future generation run, local runner cleanup does not delete the GitHub
workflow run, job/check/log/annotation/audit metadata, Environment review/
approval metadata, Actions artifact, or attestation. If any GitHub object exists
and a later step fails, every created object plus the subject/bundle digests must
be recorded as `ineligible_history`; none can satisfy custody or P2-S0. Workflow
source can be removed/retired only through a separately reviewed source PR.
Actions API disable, Environment mutation/deletion, or run/log/artifact/
attestation deletion requires a separate external-write or destructive Gate and
is not the default rollback. The artifact and logs instead follow the exact
accepted retention policies.

Any local scratch residue, leaked raw byte, unexpected process, unbounded log,
extra workflow run, extra attestation, or unapproved external write forces
`NO_GO_OPTION1` and a separately approved path-bounded recovery closeout.
Cleanup success cannot erase an already-created GitHub object or turn a failed
run into success.

## Oracle And Parent-Gate Boundary

`actions/attest` success, a parseable bundle, an online Attestations API
download, or `gh attestation verify` output cannot substitute for the parent
Gate's exact offline official-verifier oracle. The oracle version, distribution
bytes/digest, provenance, license, offline closure, trusted root, invocation,
and normalized output/error contract remain independent inputs.

Likewise, generation does not prove RFC3161 timestamp binding, applicable root,
CA/TSA mapping, identity, predicate, or candidate/oracle parity. Only a later
Route B-marked read-only custody handoff may return a content-addressed fixture
manifest to the parent [P2-S0 Gate](p2-s0-feasibility-gate.md). The parent must
still reevaluate all eight input classes and may request P2-S only through a
separate approval.

## Current Closeout And Next Approval Boundary

This preparation must close with exactly docs changes in its isolated worktree
and with no source, workflow, permission, package, lockfile, dependency,
fixture, dispatch, rerun, download, Settings, Release, Deployment, Environment,
staging, host, production, or other external write.

After independent review, the operator may separately approve publication of
this docs-only Gate package. Publication still does not authorize a producer-
source PR. A later request must fill the source-review inputs, resolve the PR
#594 conflict by closing it without merge, bind a separately approved/read-back
protected Environment plus post-run retirement plan, and refresh exact master.
