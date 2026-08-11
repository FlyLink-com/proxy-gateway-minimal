# P2-S0 Gate Package: Private-Attestation Feasibility Readiness

```yaml
phase: P2-S0 preparation
previous_phase: P2-D
status: P2-S0 Gate published / Route A BLOCKED_INPUT / Route B design Gate published / FX2-E Gate preparation current / P2-S not started
risk_class: A
risk_state: controlled
record_state: repository_gate_definition
gate_decision: not_granted
current_output: BLOCKED_INPUT
publication_revision: 046952402c5ded1412e58fe860c6eb9ad426ced5
production_authority: false
execution_authority: false
```

## Decision

PR #603 completed the P2-D governance loop at merge
`d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`. That merge freezes a
reviewed candidate profile and experiment contract; it does not select
`github_private_rfc3161_v1`, prove feasibility, or authorize P2-S.

P2-S0 is the readiness Gate that determines whether a later operator may be
asked to authorize the isolated feasibility spike. PR #605 published this Gate
definition at merge
`046952402c5ded1412e58fe860c6eb9ad426ced5`; publication did not grant the
Gate. It creates no fixture, verifier, dependency, workflow, permission,
Release, deployment, or runtime eligibility.

Current exact-master and Actions-metadata inventory did not establish an
existing target-repository, direct-workflow fixture, and no operator-supplied
custody manifest is present. The current input status is therefore
`BLOCKED_INPUT`. This does not claim that an external fixture is globally
absent; external custody remains unestablished until exact evidence is supplied.

PR #608 published the Route A P2-S0-FX1 Gate at merge
`6d6a0a197e89706d4de591f0d8cbecaef18df2c1`. Its later read-only preflight
still filled only one of fourteen selectors and retained `BLOCKED_INPUT`; no
raw byte was read and no workflow or GitHub write occurred. This closes the
current Route A evidence snapshot without rewriting it as global absence.

PR #609 published the docs-only Route B generation-design Gate at merge
`a413f636267a3b0fcfc65f7b911fa50f6cd95ea4` without granting it. The
current work item is the child FX2-E protected-Environment Settings Gate. It may
define a future Settings mutation, but it cannot perform that mutation, create
source, grant permissions, dispatch a workflow, generate a fixture, or fill this
parent's target-fixture input.

## Milestone Record

| Milestone | State |
| --- | --- |
| P2-D profile amendment | Complete |
| P2-S0 Gate package publication | Complete; PR #605 merged at `04695240` |
| Existing target fixture manifest | Not established; current output `BLOCKED_INPUT` |
| P2-S0-FX1 Route A Gate publication | Complete; PR #608 merged at `6d6a0a19`; Gate not granted |
| Route A preflight | Terminal snapshot `BLOCKED_INPUT`; 1/14 selectors filled; no raw-byte read or write |
| P2-S0-FX2 Route B design Gate | Published through PR #609 at `a413f636`; decision not granted; current output `BLOCKED_INPUT` |
| P2-S0-FX2-E protected Environment Settings Gate | Docs-only preparation current; Settings mutation not authorized |
| Route B protected Environment Settings execution | Not started; separate exact Risk A approval/readback required before source merge |
| Route B producer source | Not started; separate approval required |
| Route B generation execution | Not started; separate one-shot approval required |
| Route B workflow retirement | Not started; separate source PR and no-extra-run readback required before custody |
| Route B custody handoff | Not started; generated evidence cannot be relabeled as Route A |
| Docs-only scope control | Passed |
| Merge provenance | Verified |
| Exact base/head relationship | Verified |
| Merge tree equals approved head tree | Verified |
| PR and post-merge CI validation | Passed |
| CodeQL | Passed |
| Release Artifact workflow | Passed; Actions artifacts only, no GitHub Release |
| Fixture generation | Not started |
| P2-S feasibility spike | Not started |
| Verifier implementation | Not started |
| Unified-owner implementation | Not started |
| Production integration | Not started |

The governance-weighted project estimate is **50–60%**. This is a planning
range, not earned value and not a Gate input. It reflects the completed design,
scope, provenance, and CI governance work; it does not credit unstarted
feasibility, implementation, activation, publication, staging, or production
work.

## Current Authority

The current authorization permits only preparation and review of the docs-only
[FX2-E protected-Environment Settings Gate](p2-s0-target-fixture-generation-environment-settings-gate.md).
It does not permit the Settings mutation, source or workflow creation,
dependency/Action selection, permission change, fixture acquisition or
generation, dispatch, custody handoff, or any activity in the future P2-S scope
below. The unchanged runtime remains stopped at
`full_sigstore_owner_topology_unapproved`, and Option 1 remains active.

## Proposed P2-S Scope After A Separate Approval

If, and only if, P2-S0 later passes and an operator separately authorizes P2-S,
the isolated spike may perform:

- read-only evaluation of bounded verifier candidates supplied to scratch;
- validation of an operator-supplied, target-repository private fixture;
- inspection of the supplied dependency closure, licenses, provenance, SBOM,
  vulnerability snapshot, engines, and native/Wasm/install-script behavior;
- offline reproducibility builds and fresh-process normal/inline parity tests;
- the positive and negative verification matrix defined below; and
- scratch-only cleanup and no-drift readback.

Even after P2-S authorization, the spike may not:

- integrate source or select a production package, version, path, API, pin, or
  trust snapshot;
- modify a package file, lockfile, repository ref, checkout, workflow, Actions
  permission, Settings, Release, Environment, staging target, host, or
  production resource;
- generate or dispatch a fixture; those operations remain outside P2-S and
  require their own separately approved Route B generation Gate;
- use ambient credentials, environment discovery, global caches, network
  fallback, package fallback, or a newly pulled container image; or
- emit an implementation, publication, source-resumption, staging, deployment,
  or production eligibility claim.

## Required Inputs

P2-S0 cannot pass until every required input is identified by exact bytes or an
immutable digest and a named custody source:

1. **Source manifest** — `master` commit and tree, exact-11 path/blob set,
   package and lockfile blobs, and the exact Node image digest already recorded
   by the dormant inventory checkpoint.
2. **Target private fixture** — a real target-repository, target-workflow
   private attestation bundle, exact bundle SHA-256 and size, exact subject
   bytes and SHA-256, and expected subject name.
3. **Timestamp evidence** — the bundle's RFC3161 token bytes and digest,
   timestamped-byte derivation, message imprint, TSA certificate chain, and
   expected signing-time constraints.
4. **Certificate and trust evidence** — signing certificate chain, raw
   applicable trusted-root snapshot and SHA-256, CA/TSA identities and counts,
   capture command/version, and capture time.
5. **Expected identity** — exact issuer, repository, direct workflow, ref,
   source SHA, event, runner environment, predicate type, and subject claims.
6. **Candidate verifier closure** — bounded tarball/integrity manifest for
   every transitive byte plus engines, licenses, provenance, SBOM,
   vulnerability snapshot, and security-update policy. This inventory does
   not select the candidate for implementation.
7. **Build and isolation manifest** — one bounded build closure, three clean
   absolute build roots, task-local cache/temp locations, network-denial plan,
   resource thresholds, and cleanup/readback plan.
8. **Official verifier oracle** — exact official verifier name and version,
   distribution bytes and SHA-256/integrity, provenance and license, complete
   offline closure, exact trusted-root and invocation arguments, and a bounded
   normalized output/error contract. The oracle must be runnable read-only,
   offline, and without repository credentials.

Raw private bundle, subject, token, certificate, and root bytes must not be
committed to this repository or copied into a distributable review packet.
P2-S0 records only their digests, bounded metadata, custody reference, and
availability. If the operator cannot supply an existing target fixture,
P2-S0 returns `BLOCKED_INPUT`; fixture generation is a later, independent Risk
A Gate.

## P2-S0 Readiness Checks

P2-S0 may return `READY_FOR_SEPARATE_P2S_APPROVAL` only when:

- all eight input classes are complete, mutually consistent, bounded, and
  available read-only without credentials in the repository;
- the fixture is from the exact target repository and workflow rather than a
  parser-only sample from another repository;
- root, TSA, certificate, identity, predicate, and subject expectations are
  fixed before the spike;
- the exact official verifier oracle is fixed before the spike and can consume
  the same real positive, root, and expected identity offline;
- dependency and build closures can be consumed offline with install scripts
  disabled and without ambient cache or network access;
- resource thresholds and the positive/negative case inventory are frozen
  before measurement;
- scratch containment, no-symlink/reparse-point rules, zero-output failure,
  cleanup, and repository/global-cache no-drift checks are reviewable; and
- the requested P2-S execution authorization is still limited to the isolated
  spike and names the exact input manifest digest.

This output is a requestable readiness state, not execution authorization.

## Future P2-S Acceptance Criteria

The following criteria are frozen here for a later separately authorized P2-S
run. They are not tests executed by P2-S0:

- strict bounded bundle and DSSE verification succeeds;
- the DSSE payload and signature bind to the exact statement bytes;
- GitHub-private Fulcio chain and validity checks succeed against the fixed
  root snapshot;
- the fixed official verifier oracle accepts the same real positive against the
  same root and expected identity;
- RFC3161 signature, TSA chain, `messageImprint`, timestamped bytes, and time
  windows bind successfully;
- candidate and oracle agree on the applicable root, certificate authority,
  timestamp authority, bundle arm, timestamped bytes, subject, and identity;
- exact issuer/repository/workflow/ref/source-SHA/event/runner identity binding
  succeeds;
- exact predicate type and predicate bytes validate;
- exactly one expected subject name and SHA-256 bind to the supplied subject;
- every required negative fixture is rejected before brand, completion,
  output, or downstream eligibility;
- three clean builds are byte-identical and normal/inline fresh-process results
  are deterministic for every case ID;
- runtime, latency, RSS, and closure-size thresholds pass; and
- cleanup readback proves every process stopped, every raw private input and
  scratch copy was removed, and repository/global state did not drift. A
  failed-cleanup receipt is a non-GO recovery record and cannot satisfy this
  acceptance criterion.

## Failure Criteria And Routing

P2-S0 must fail closed when an input is missing, unbounded, ambiguous,
inconsistent, credential-dependent, network-dependent, not target-specific, or
not independently hashable. It returns exactly one of:

| Output | Meaning | Next state |
| --- | --- | --- |
| `READY_FOR_SEPARATE_P2S_APPROVAL` | Readiness package is complete | Request a separate Risk A P2-S execution approval |
| `BLOCKED_INPUT` | Required target input is absent or unavailable | Keep Option 1; resolve inputs, reopen Route A only with new custody evidence, or use separately gated Route B design/Environment/source/generation/retirement/custody stages |
| `REDESIGN_PROFILE` | The proposed profile or acceptance contract is internally incompatible | Return to docs-only profile design and review |
| `NO_GO_OPTION1` | Residual risk or engineering constraints are unacceptable | Keep Option 1 as the terminal hard stop |

The future P2-S run retains its own four outputs:
`GO_FOR_SEPARATE_PROFILE_REVIEW`, `BLOCKED_INPUT`, `REDESIGN_PROFILE`, and
`NO_GO_OPTION1`. Neither P2-S0 nor P2-S may emit `P2_GREEN`,
`IMPLEMENTATION_AUTHORIZED`, or `PUBLICATION_AUTHORIZED`.

Concrete failure families include an unverifiable or ambiguously bound TSA
token, unsupported or open bundle shape, root/certificate/identity drift,
wrong or multiple subjects, an unavailable/failing official oracle, any
candidate-oracle mapping disagreement, rejected negative vectors, dependency
or license policy failure, non-reproducible runtime bytes, normal/inline divergence,
resource-threshold failure, network attempt, cleanup failure, or any external
write attempt. Failure never permits a weaker success mode.

Any cleanup failure forces `NO_GO_OPTION1` for that run and a separate
path-bounded recovery closeout. Raw or scratch bytes may remain only while that
non-GO recovery is active; they can never coexist with
`GO_FOR_SEPARATE_PROFILE_REVIEW`.

## Rollback And Closeout

P2-S0 has no runtime rollback because it makes no runtime change. Rejecting or
closing the Gate leaves P2-D as the repository record, P2-S not started,
Option 1 active, and the existing hard stop unchanged. Closeout must verify:

- no raw private input was committed or attached;
- no repository, package, workflow, Settings, Release, Environment, staging,
  host, or production state changed;
- no fixture workflow was created or dispatched;
- no dependency was installed or selected; and
- any temporary review-only material outside the repository was absent or
  removed with a path-bounded receipt.

## Next Approval Boundary

PR #605 published this parent Gate without granting it. PR #608 published the
Route A FX1 definition, and its completed preflight remains `BLOCKED_INPUT`.
PR #609 published the
[P2-S0-FX2 target-fixture-generation design Gate](p2-s0-target-fixture-generation-gate.md)
without granting it. The next document is the
[P2-S0-FX2-E protected-Environment Settings Gate](p2-s0-target-fixture-generation-environment-settings-gate.md).
It grants no Settings, source, permission, generation, dispatch, or handoff
authority.

Route B remains serial: publish the design Gate; publish the FX2-E definition;
separately create/read back the dedicated protected Environment; separately
review and approve producer source;
separately approve exactly one generation execution; merge a separately
reviewed workflow-retirement PR and prove zero extra runs; and then separately
approve a Route B-marked read-only custody handoff. Environment enforcement and
source retirement are both mandatory. Only the final content-addressed custody
receipt may return here as the target-fixture input. The other seven inputs,
including the exact offline official-verifier oracle, remain mandatory, and
all-eight-input reevaluation cannot authorize P2-S directly.
