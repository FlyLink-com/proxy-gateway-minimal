# Security Hardening Proposal: Unify Supply-Chain Authority Before Publication

> Status:
> - Type: Derived Topology Addendum proposal with Route A blocked, Route B design Gate published, and FX2-E Settings Gate preparation current
> - Risk: A
> - Production authority: False
> - Execution authority: None

## Decision

At G0, we selected Option 2 as the topology direction only: one authority would
sit before Foundation lock publication without bootstrapping itself, duplicating
trust in Artifact, or converting diagnostic observations into authority. PR
#600 has since merged as the exact-11 dormant checkpoint. PR #603 completed the
P2-D docs-only governance loop. PR #605 published the P2-S0 Gate definition
without granting it. PR #608 published the Route A child Gate; its later
preflight retained `BLOCKED_INPUT` with only one of fourteen selectors filled.
PR #609 published the Route B generation-design Gate without granting it. The
FX2-E protected-Environment Settings Gate is now in docs-only preparation,
P2-S has not started, and the candidate GitHub-private profile remains
unselected. Option 1 remains active.

The four options are:

1. **Permanent No-Go** — preserve the current diagnostic-only split and do not
   build the formal deployment capability.
2. **In-repository unified trust kernel** — add one pinned, module-private owner
   on protected master and keep lock and offline closure as independent Gates.
3. **Hermetic owner appliance** — isolate verification in one fixed executable
   or OCI artifact that also owns the final fixed consume operations.
4. **External verification broker** — replace the private in-process authority
   with a network service that issues signed, content-bound admissions.

This proposal records the G0 selection, completed P2-D record, P2-S0/FX1/FX2
Gate publication, Route A blocked preflight, and permission to prepare only the
docs-only FX2-E Environment Settings Gate. It chooses no candidate-verifier
package, Action version/full-SHA pin, owner path/API, trust snapshot, or
implementation pin. It authorizes no producer source, fixture acquisition/
download/generation, custody handoff, workflow permission change or dispatch,
P2-S, profile decision, canonical reconciliation, owner implementation, P3,
Settings, Release, staging, host access, production, external write, or source/
runtime eligibility.

## Executive Recommendation

The merged diagnostics are doing the right thing by stopping, but they leave us
without a component that can safely say “this exact lock” or “this exact
Artifact asset” passed a selected verification profile. The structural question
is where that decision lives; the new profile question is what it may honestly
claim for a private repository.

Option 1 makes the strongest safety claim because no publication capability is
created. It is the correct choice if automated control-plane deployment is not
worth a new cryptographic trust boundary. Option 2 keeps that boundary inside
the repository, uses one private brand for both consumers, and adds no service;
it best matches the current design and operating preferences. Option 3 buys
process isolation, but preserving an unforgeable result forces the appliance to
own more of the final consume operation. Option 4 centralizes updates across
repositories, but adds a standing network and signing-key authority.

The G0 choice remains Option 2. I recommend preparing
`github_private_rfc3161_v1` as a candidate only because GitHub documents that
its private Sigstore instance has no transparency log and the current no-log
root includes timestamp authorities. P2-S must still prove a real RFC3161-
bound target bundle and deterministic normal/inline execution. The candidate
would intentionally claim no Rekor, CT/SCT, public transparency, or global
anti-equivocation. If that residual risk is unacceptable or the evidence fails,
Option 1 wins. Options 3 and 4 remain alternatives under separate decisions.

## Evidence

I inspected the frozen P2-D design inputs at exact
`master@9ebc08492af170a470182ba827da052fa41b81b2`, the separate P2-D completion
evidence at `master@d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`, the P2-S0 Gate
publication at `master@046952402c5ded1412e58fe860c6eb9ad426ced5`, FX1
publication and Route A preflight at
`master@6d6a0a197e89706d4de591f0d8cbecaef18df2c1`, FX2 publication at
`master@a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`, the later FX2-E read-only
preflight, current plan/repository eligibility, official Action/Environment
behavior, and open producer conflicts. The most
influential facts are the canonical corrected-ordering hold, the merged dormant
bootstrap, the absent current-source producer/fixture evidence, the currently
satisfied Enterprise plan prerequisite, the real external-write semantics of
generation, Draft PR #594's competing publisher, and the mismatch between the
canonical Rekor/CT/SCT contract and GitHub's documented private-instance
transparency model.

| Evidence | Finding or document | What it establishes |
| --- | --- | --- |
| `E01` | [Canonical production-deploy design](../../../specs/2026-08-08-github-control-plane-production-deploy-design.md) | One pinned mature owner must serve Foundation and Artifact before lock publication, retain a private brand, and pass complete official/adversarial CT/SCT vectors. |
| `E02` | [Implementation program](../../../plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md) | Owner, lock postverification, offline closure, and a new Risk A resume approval are separate conjunctive prerequisites. |
| `E03` | [Foundation and Linux feasibility plan](../../../plans/2026-08-08-github-control-plane-foundation-and-linux-feasibility.md) | The exact-11 bootstrap may carry a dormant publisher first; the owner comes later through a separately approved predecessor and activation change. |
| `E04` | [Artifact and workflow plan](../../../plans/2026-08-08-github-control-plane-artifact-and-workflow.md) | Artifact cannot create a second verifier authority or reuse Foundation lock completion as Artifact asset authority. |
| `E05` | [Existing production dry run](../../../../../.github/workflows/production-deploy-dry-run.yml) | The present dry run is packet generation without production host mutation. |
| `E06` | [Existing release-artifact workflow](../../../../../.github/workflows/release-artifact.yml) | Packaging success is not deployment or cryptographic completion. |
| `E07` | [Restricted Japan config repair workflow](../../../../../.github/workflows/japan-runtime-config-additive-repair.yml) | Existing protected repair authority is narrow and cannot be repurposed as general deployment authority. |
| `E08` | [Repository Risk A operating rules](../../../../../AGENTS.md) | Provider, production, credential, schema, and deployment work requires exact approval, validation, rollback, and closeout. |
| `E09` | [Live Environment and ruleset summary](../context.md#redacted-live-configuration-summary) | Production currently permits administrator bypass; source merge rules require no independent approval beyond `Validate`. |
| `E10` | [Merged PR #600 summary](../context.md#evidence-hash-profile-and-collection-manifest) | PR #600 merged as the exact-11 dormant checkpoint; it contains no owner and grants no publication authority. |
| `E11` | [Cross-document authority-cycle diagnosis](../context.md#evidence-inventory) | Promoting diagnostics or placing the owner inside its own lock/closure would violate the single-owner and independent-bootstrap invariants. |
| `E12` | [GitHub private-attestation and trusted-root summary](../context.md#p2-d-private-attestation-evidence-summary) | GitHub documents no private transparency log; the current roots include a no-tlog/no-ctlog line with CA/TSA material, but no target bundle yet proves RFC3161 applicability. |
| `E13` | [Merged PR #603 P2-D closeout summary](../context.md#p2-d-governance-closeout-summary) | P2-D completed with verified merge provenance and post-merge checks, but produced no fixture, feasibility result, owner, or runtime authority. |
| `E14` | [Merged PR #605 P2-S0 Gate publication summary](../context.md#p2-s0-gate-publication-summary) | The parent Gate became a repository definition with verified merge provenance and post-merge checks, but was not granted and supplied no fixture or execution authority. |
| `E15` | [Exact-master target-fixture gap summary](../context.md#p2-s0-target-fixture-gap-summary) | Current source has no observed attestation producer or target fixture; ordinary artifact metadata does not establish opaque or external fixture availability. |
| `E16` | [Merged PR #608 P2-S0-FX1 publication summary](../context.md#p2-s0-fx1-publication-and-route-a-preflight) | The Route A Gate was published with verified merge provenance and no acquisition, generation, dispatch, or P2-S authority. |
| `E17` | [Route A terminal preflight snapshot](../context.md#p2-s0-fx1-publication-and-route-a-preflight) | The current Route A attempt remains `BLOCKED_INPUT`; only 1/14 selectors is filled and no raw byte, download, dispatch, or write occurred. |
| `E18` | [Private-attestation eligibility and official Action/Environment contract](../context.md#route-b-eligibility-and-conflict-summary) | The Enterprise plan prerequisite is satisfied at capture; official guidance recommends `actions/attest`, documents GitHub API/bundle writes, and preserves required reviewers without Deployment objects under `deployment: false`; no dependency, Settings change, or successful fixture is established. |
| `E19` | [Open producer-conflict snapshot](../context.md#route-b-eligibility-and-conflict-summary) | Draft PR #594 is a competing attestation/Release publisher and blocks positive Route B source readiness until closed without merge; Draft PR #606 requires rebind if merged. |
| `E20` | [Merged PR #609 P2-S0-FX2 publication summary](../context.md#route-b-design-gate-publication-summary) | The Route B design Gate was published with verified provenance and successful checks, but granted no Settings, source, generation, custody, or P2-S authority. |
| `E21` | [FX2-E protected-Environment preflight](../context.md#fx2-e-environment-settings-gate-summary) | The dedicated Environment is absent, producer references are zero, Actions retention is `90/90`, and exact identity/independent-human and Settings execution receipts remain unfilled. |

## Current Design And Failure Mode

Observed: Foundation and Artifact each have bounded diagnostic paths, and their
compatibility verifiers fail with owner-unavailable errors. The merged exact-11
publisher stops even earlier at `full_sigstore_owner_topology_unapproved`.
Exact current source has no tracked attestation producer or target private
fixture, and the latest Release Artifact run produced only three ordinary
Actions artifacts.
GitHub documents that private attestations use an instance with no transparency
log, while the current trusted-root output contains a no-tlog/no-ctlog line with
timestamp authorities. Those controls and facts prevent us from mistaking
partial diagnostics or a no-log profile for the canonical full-Sigstore owner.

Inferred: the structural gap is not a missing boolean or workflow condition.
The merged bootstrap has no protected-master component that can own selected-
profile trust and issue an unforgeable result. The security gap is also not
fixed by setting transparency thresholds to zero while retaining a full-
Sigstore label. If we wrap diagnostics, callers can mistake observations for
completion. If we place the owner inside what it authorizes, we create a self-
verifying cycle. If we adopt a private profile, we must explicitly accept its
weaker transparency model after evidence, not through implementation drift.

The current boundary is shown in
[the before diagram](../diagrams/unify-supply-chain-authority-before.mmd).
The important edge is the shared hard stop: it contains the problem before any
Release write, build, Settings mutation, or deployment source work.

## Desired Invariants

1. Exactly one selected-profile authority implementation verifies both
   Foundation lock evidence and Artifact evidence. Consumers cannot import its
   underlying package, trust material, policy, thresholds, or constructor.
2. Production trust inputs are fixed by the owner. Callers cannot select roots,
   CA/TSA/log keys, time, profile, threshold, issuer, repository, workflow, ref,
   SHA, predicate, subject policy, or any verification bypass.
3. Each named profile claims only properties it fully proves. The active
   canonical profile still requires DSSE, Fulcio, Rekor, CT/SCT, GitHub OIDC,
   predicate, and exactly one subject. The candidate
   `github_private_rfc3161_v1` instead requires DSSE, GitHub-private Fulcio,
   verified RFC3161 signed time, GitHub OIDC, predicate, and one subject, while
   explicitly claiming no Rekor, CT/SCT, public transparency, or global anti-
   equivocation.
4. The authoritative result is module-private, unforgeable, non-clonable, and
   non-serializable. No `verified:true`, diagnostic report, REST metadata, or
   caller-built object can substitute for it.
5. The owner does not consume the Foundation lock, offline closure, native
   builder, or Artifact result that it will later authorize. Its own source,
   dependency bytes, trust snapshot, and test vectors are independently pinned
   and reviewed.
6. Foundation lock postverification authorizes only the exact lock asset.
   Artifact capability is proven by cross-contract tests, while each future
   Artifact asset receives its own exactly-one-subject verification by the
   selected profile owner; Foundation-lock success is never reusable authority.
7. Immutable-lock publication and offline-closure publication use distinct
   manual Gates, namespaces, receipts, and failure states. Neither success
   implies the other.
8. Offline-closure generation is separate from consumption. A clean runner
   with an empty ambient cache and disabled network must run exactly
   `npm ci --offline --ignore-scripts` and prove no missing, extra, drifted, or
   fetched content.
9. Any owner, policy, HEAD, vector, or other pre-write validation mismatch
   restores the hard stop before output, completion, Release write, build,
   credential, host operation, or deployment claim. A post-write readback or
   postverification mismatch preserves the immutable bytes only as ineligible
   history and emits no completion, eligibility, build, credential, host, or
   deployment claim.
10. A candidate profile cannot become active from this derived proposal. Real-
    vector feasibility, explicit residual-risk acceptance, canonical contract
    reconciliation, and a separate implementation authorization are mandatory.

## Constraints And Non-Goals

- This proposal does not acquire, download, or generate a fixture; change or
  dispatch a workflow; execute P2-S; implement the owner; select a dependency;
  or resolve a vulnerability.
- PR #600 is already merged as exactly 11 dormant files. This proposal neither
  modifies those files nor treats the merge as owner or publication authority.
- It does not merge the owner and activation changes. The owner must be present
  on protected master before an activation PR can remove the topology guard.
- It does not reuse the Japan config-repair workflow, existing deployment
  secrets, an operator SSH key, a production `.env`, or a database copy.
- It does not require production Environment Settings before main source can
  be reviewed. Production Settings activation follows source reconciliation
  and disposable/compatibility staging.
- Performance and memory effects are unmeasured. Validation plans below are
  required before an option can be called implementation-ready.
- The canonical E01-E04 full-Sigstore/Rekor/CT/SCT requirements remain active.
  P2-D is a completed proposal record, but its candidate remains unselected
  until a later explicit profile decision and canonical reconciliation. P2-S0
  and P2-S0-FX1 publication, the Route A blocked preflight, and preparation of
  the Route B generation-design Gate are not producer-source, fixture-
  generation, custody-handoff, or experiment-execution authority.

## Before Architecture

[Before: split diagnostic ownership and hard stop](../diagrams/unify-supply-chain-authority-before.mmd)

The before view has a useful safety property: both incomplete paths converge on
one stop before a dangerous operation. Its weakness is liveness, not fail-open
behavior. A sound after design must preserve the stop while introducing one
authority owner and must not make successful Foundation lock verification a
shortcut for future Artifact assets.

## Options

### Option 1: Permanent No-Go

We can preserve the current structure permanently: keep the merged exact-11
checkpoint dormant, retain both diagnostic-only paths and the topology stop,
and never authorize immutable lock publication or formal automated deployment.

The strongest case is proportionality. A new cryptographic owner, trust update
policy, offline dependency publisher, and production control plane are a large
security and operational commitment. If the existing manual deployment process
is acceptable, this option avoids that new attack surface completely. Its
reliability profile is also simple: publication is unavailable by design, so a
verifier outage or trust-root update cannot cause a false success.

The cost is permanent absence of the proposed formal deployment capability.
Manual processes keep their own human-error and evidence-consistency risks, and
the current architectural work does not deliver deployment liveness. Rollback
is immediate because there is nothing to roll out; we retain the hard stop.

[Option 1 after: permanent hard stop](../diagrams/unify-supply-chain-authority-permanent-no-go-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Owner | Missing | Intentionally absent | No new verifier or authority attack surface | No automated publication |
| Lock and closure | Unavailable | Permanently unavailable | No bootstrap or supply-chain cycle | No formal build eligibility |
| Deployment | Not implemented | Not implemented | No new production automation path | Manual operations remain |

### Option 2: In-Repository Unified Trust Kernel

The topology still calls for one owner-only predecessor PR after the dormant
#600 checkpoint. Before we can design that source PR, however, we need to know
which success profile is real. The canonical profile requires Rekor and CT/SCT.
The private GitHub evidence instead points to Fulcio plus timestamp authorities
without public transparency. Lowering log thresholds inside an implementation
while continuing to call it full-Sigstore would be a policy bypass.

P2-D therefore records, but does not select, the versioned candidate
`github_private_rfc3161_v1`. Its successful operation would require all of the
following from one fixed owner:

- strict bounded, duplicate-free bundle parsing;
- DSSE signature and exact payload binding;
- a fixed GitHub-private Fulcio chain and validity window;
- at least one fixed GitHub-private TSA/RFC3161 token whose signature,
  `messageImprint`, time, algorithms, and signed-byte derivation all verify;
- exact GitHub issuer, repository, direct workflow, ref, source SHA, event, and
  runner identity;
- exact predicate type/bytes and exactly one subject name/SHA-256; and
- a module-private, operation-domain brand that cannot be serialized, cloned,
  replayed across owners, or reused from Foundation as Artifact authority.

The profile would explicitly report that Rekor, CT/SCT, public artifact
transparency, and global anti-equivocation are not provided. That statement is
not an `ignore-SCT` mode: the active canonical profile remains unchanged until
a later decision accepts the security delta and reconciles the canonical plans.
Unexpected or unverifiable tlog/SCT material, an unrecognized root shape, or an
ambiguous timestamp binding stops rather than widening the profile.

The owner surface remains a no-selector factory with separate Foundation-lock
and Artifact-asset operations. Callers cannot provide roots, TSA material,
time, profile, thresholds, expected workflow policy, or compatibility mode.
The precise package, version, path, API, byte caps, and trust snapshot remain
unselected. One source must deterministically produce the normal and no-checkout
runtime forms; copying trust/policy or using `Function.toString()` is forbidden.

#### P2-S0 feasibility and fixture-routing Gates

PR #605 published the
[P2-S0 Gate package](../gates/p2-s0-feasibility-gate.md) as a repository
definition. It freezes proposed future scope, required hashed/redacted inputs,
acceptance and failure criteria, and the exact readiness outputs. The Gate is
not granted; missing existing-fixture evidence keeps current output at
`BLOCKED_INPUT`.

PR #608 then published the
[P2-S0-FX1 Route A child Gate](../gates/p2-s0-target-fixture-acquisition-gate.md).
Its read-only preflight found no repository/GitHub-visible custody manifest or
named fixture and left only the target repository selector closed. Route A
therefore remains `BLOCKED_INPUT` at one of fourteen selectors. This is a
bounded snapshot, not proof that no opaque artifact or external custodian can
ever exist; any later historical-fixture claim requires a superseding Route A
Gate.

PR #609 published the
[P2-S0-FX2 Route B generation-design Gate](../gates/p2-s0-target-fixture-generation-gate.md).
It bounds a future target-repository producer, exactly-one deterministic
subject, GitHub Attestations API write, Actions-artifact custody, redacted
generation manifest, and mandatory Environment-plus-retirement lifecycle. Its
Gate decision remains not granted.

The current docs-only work item is the
[P2-S0-FX2-E protected-Environment Settings Gate](../gates/p2-s0-target-fixture-generation-environment-settings-gate.md).
It freezes a future exact custom `master/type=branch` Environment, one
independent-human User reviewer, self-review prevention,
`can_admins_bypass=false`, zero secrets/variables/custom protection Apps/
Deployments, unchanged repository Actions retention, the current three static
Environment bindings with zero dynamic selectors, an independent after-reader,
and an expected actor/target/window platform audit receipt. It does not perform a
Settings change, select an Action full-SHA pin, create or merge workflow source,
change permissions, dispatch or rerun a workflow, download evidence, generate
or hand off a fixture, or run P2-S. Draft PR #594 must be closed without merge
before any positive source-readiness result; any salvage must be independently
rebuilt from fresh master. PR #606 and any other master drift require exact
rebind.

The future lifecycle requires both a separately approved/read-back dedicated
protected Environment before source merge and a separately reviewed workflow-
retirement merge plus no-extra-run readback after generation. The attestation
job uses `deployment: false`, retaining required review while creating no
Deployment/status objects. The run, three jobs, checks, logs, annotations,
audit/Environment-review records, artifact, and attestation are all persistent-
object inventory; any later failure marks every created object as ineligible
history rather than claiming cleanup erased it.

The FX2-E docs Gate may return only
`READY_FOR_SEPARATE_FX2E_EXECUTION_APPROVAL`, `BLOCKED_INPUT`,
`REDESIGN_ENVIRONMENT_CONTROL`, or `NO_GO_OPTION1`. A later successful Settings
execution may return only
`ENVIRONMENT_READY_FOR_SEPARATE_ROUTE_B_SOURCE_GATE`; partial state is inert and
requires a separate Settings Gate. A future source merge may return only
`SOURCE_PRESENT_FOR_SEPARATE_GENERATION_GATE`; a successful run records only
`GENERATED_FIXTURE_PENDING_MANDATORY_SOURCE_RETIREMENT`. The final
`GENERATED_FIXTURE_READY_FOR_SEPARATE_CUSTODY_HANDOFF` output is unavailable
until retirement and all-object readback close. None of those outputs authorizes
the next step. Generated evidence must retain `origin_route: route_b_generated`
and can never be relabeled as Route A existing/historical custody.

Only a later explicit `READY_FOR_SEPARATE_P2S_APPROVAL` finding may support a
new request to execute P2-S. It does not authorize that execution. Missing
inputs return `BLOCKED_INPUT`; infeasible profile semantics return
`REDESIGN_PROFILE` or `NO_GO_OPTION1`.

#### P2-S isolated feasibility experiment design

P2-S is an experiment design, not an execution authorization. If separately
approved, it must export the exact revision frozen by the approved P2-S0 Gate
with `git archive` into a task-specific scratch
directory outside every checkout; it must never read the unrelated dirty
working tree or write a repository ref, worktree, package file, lockfile,
`node_modules`, global cache, workflow, or GitHub object. Package and build
candidate bytes, if later authorized, live only in the scratch directory.

The scratch root is a newly resolved absolute path outside every repository and
worktree. It contains separate read-only input and exact-commit export trees,
three clean build directories, task-local npm cache and temp directories, a
private raw-output area, and a redacted review packet. The future executor must
reject symlinks/reparse points and paths outside that root, use a read-only root
filesystem where supported, mount no token or credential, and use the already-
present `node:22.23.1-bookworm` image at the exact digest frozen by the merged
inventory workflow; pulling or substituting an image is a failed precondition.

Required, independently hashed inputs are:

- a source manifest containing the exact commit/tree, exact-11 path/blob set,
  package/lockfile blobs, and Node image digest;
- the raw GitHub-private trusted-root bytes, SHA-256, capture command and `gh`
  version, with CA/TSA/tlog/ctlog entry counts;
- the real target bundle, exact subject bytes, and exact expected identity;
- an exact official verifier version, distribution digest, provenance,
  licenses, complete offline closure, trusted-root/invocation arguments, and
  bounded normalized oracle contract;
- a bounded candidate-verifier closure with tarball/integrity for every
  transitive dependency, engines, licenses, provenance, SBOM and vulnerability
  snapshot; and
- one bounded build candidate closure. A native or install-script dependency
  that cannot be prepared and consumed offline with scripts disabled is No-Go,
  not permission to add an ambient builder.

The required positive input is a real target-repository, target-workflow GitHub-
private bundle plus exact subject bytes and expected identity, all supplied by
digest without credentials. The current repository has no attestation workflow
or fixture. If no existing fixture can be supplied, P2-S returns
`BLOCKED_INPUT`; generating one requires a separate workflow/fixture Gate. A
bundle from another private repository may test parser, Fulcio, TSA, and library
feasibility but cannot prove the target identity policy.

The experiment first runs the exact official verifier oracle offline against
the real positive, fixed root, and fixed expected identity. It then records the
exact private root bytes and root/TSA/log counts and determines the real bundle
arm, signature count, certificate chain, RFC3161 count, tlog count, SCT
presence, and timestamped-byte derivation. The candidate must agree with the
oracle on the applicable root, CA, TSA, bundle arm, timestamped bytes, subject,
and identity; oracle failure or disagreement is non-GO.
The candidate minimum is one verified token; P2-S must observe the real positive
and propose an exact count for later G0R review. It may not select one token from
an ambiguous set or silently ignore any unverified token.
It evaluates a bounded set of mature verifier/build candidates without choosing
one in this proposal, reviews exact transitive bytes, engines, licenses,
provenance, vulnerabilities, native/Wasm/dynamic-import behavior, and performs
all verification offline with no ambient environment, filesystem discovery,
network, or package fallback.

Three clean builds in distinct absolute scratch paths must produce identical
runtime bytes. The normal and inline loaders must execute those same bytes in
fresh processes and return identical normalized success/error evidence for the
same case IDs. Positive and negative vectors cover DSSE/Fulcio/RFC3161,
identity, predicate, subject, profile/root injection, private-brand forgery,
JSON bounds/depth/duplicates, ambient authority, and cleanup. Synthetic CA/TSA
vectors test the harness but never substitute for the real positive.

Proposed measurement thresholds must be reviewed before execution rather than
retrofit to results. The initial design uses bundle <= 4 MiB, statement <= 64
KiB, JSON depth <= 32, self-contained runtime <= 8 MiB, warm verification p95
<= 500 ms, cold start plus verify p95 <= 2 s, peak RSS <= 256 MiB, and no more
than 32 MiB RSS growth across 100 warm runs. These values are hypotheses, not
measurements. A reviewer may tighten them before P2-S; passing them does not
authorize P2-I.

P2-S may return only `GO_FOR_SEPARATE_PROFILE_REVIEW`, `BLOCKED_INPUT`,
`REDESIGN_PROFILE`, or `NO_GO_OPTION1`. Every negative case proves zero brand,
zero completion, zero external write, and zero downstream eligibility. The
redacted packet contains source/tree/input digests, root/bundle shape counts,
dependency/license/provenance results, vector parity, resource measurements,
cleanup receipt, and no raw bundle identity. `GO_FOR_SEPARATE_PROFILE_REVIEW`
still requires explicit residual-risk acceptance and canonical reconciliation.

The cleanup receipt must prove every experiment process stopped; all raw private
bundle copies, build directories, temp data and task-local caches were removed;
the retained packet is redacted and content-addressed; and repository status,
refs, worktree list, `origin/master`, package files and global cache are byte-
for-byte unchanged from the before snapshot. Cleanup may only target the
validated scratch root and may never traverse a reparse point. Any cleanup
failure forces `NO_GO_OPTION1` for that run and a separate recovery closeout;
it can never coexist with `GO_FOR_SEPARATE_PROFILE_REVIEW`.

Only after that future profile decision may a separately authorized owner PR
fix one mature implementation, trust snapshot, policy, and vector corpus on
protected master. A later activation PR may then wire the dormant publisher.
Lock and Closure Gates remain separate, with exact readback and zero-network
offline consumption. Repository-local no-replace/readback controls can narrow
replay and replacement but cannot recreate public transparency.

The attractive part remains control ownership: the private brand stays inside
one process and no standing service appears. The concerns are the same-process
parser TCB, normal/inline drift, trust rotation, and the explicit loss of public
anti-equivocation. Rollback at every pre-implementation stage is simply Option
1. After future implementation, rollback restores the topology guard; immutable
objects remain ineligible history and are never overwritten or relabeled.

[Option 2 after: in-repository unified owner](../diagrams/unify-supply-chain-authority-in-repo-unified-owner-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Verification owner | Two diagnostic paths | Candidate selected-profile owner, two closed consume operations | Prevents diagnostic promotion and false transparency claims | Adds one security-critical dependency boundary and residual-risk decision |
| Bootstrap order | Merged dormant #600 blocks at topology guard | P2-D complete, P2-S0/FX1 published, Route A blocked, Route B design/Environment/source/generation/retirement/custody Gates, parent reevaluation, P2-S, profile decision, owner PR, then activation PR | Breaks the cycle without implementing an unproven profile | Adds producer-lifecycle, custody, experiment, and canonical-reconciliation checkpoints |
| Lock | Not publishable | Separately published and selected-profile-owner postverified | Exact lock authority is content-bound to the selected profile | Adds Release retention/readback operations |
| Offline closure | Missing | Separate content-addressed Gate and clean-runner proof | Removes ambient cache/network authority | Adds storage and closure-maintenance burden |
| Artifact | Diagnostic-only | Same owner API is available, but each asset still postverifies independently | Lock completion cannot be reused as Artifact completion | Adds per-asset verification cost |

### Option 3: Hermetic Owner Appliance

We can move complete bundle parsing and trust evaluation into one reproducibly
built executable or OCI image pinned by digest. Both Foundation and Artifact
invoke that appliance, gaining process-level fault isolation from malformed
bundles and from the verifier dependency graph.

The strongest case is containment. A parser crash, unexpected allocation, or
dependency compromise is less able to corrupt the calling Node.js process. The
appliance can also be upgraded and benchmarked independently. That advantage
becomes material if bundle parsing is treated as hostile native-code exposure
or if memory isolation is a hard requirement.

What gives us pause is authority transfer. A module-private brand cannot be
serialized across a process boundary. A plain JSON “verified” receipt would
reintroduce forgery risk. The appliance therefore has to own fixed final consume
operations, such as verifying and resolving a lock or verifying and admitting
one Artifact asset, or it must introduce a signed receipt and a new verification
key. Either route increases its TCB. It also adds reproducible appliance builds,
registry or artifact availability, image provenance, and rollback-digest
operations before it can verify anything else.

Performance gains or regressions are unknown. Process startup and byte transfer
add latency, while isolation may cap leaks and make resource limits observable.
We would benchmark bounded small and maximum-size bundles, startup latency,
peak RSS, and failure cleanup before accepting the added boundary.

Rollback uses a previously reviewed digest only after its vectors and trust
validity are rechecked; otherwise the system returns to the topology hard stop.

[Option 3 after: hermetic owner appliance](../diagrams/unify-supply-chain-authority-hermetic-owner-appliance-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Isolation | Verifier would share the Node process | Verification occurs in a fixed appliance | Narrows parser fault blast radius | Adds process/image TCB and IPC |
| Authority result | No brand exists | Appliance owns final consume operation or signs a receipt | Avoids trusting plain JSON | Expands appliance privileges or adds signing keys |
| Operations | No verifier artifact lifecycle | Build, provenance, registry, rollout, rollback, alerting | Independent patch cadence | More availability and incident-response burden |

### Option 4: External Verification Broker

We can operate a central service or GitHub App that owns trust roots, Sigstore
versions, complete policy, and verification. Repository clients authenticate
with OIDC and receive a short-lived, content-bound, replay-resistant signed
admission. This can make sense when many repositories need the same policy and
central security operators must react faster than each repository can merge.

The design is genuinely different: module-private authority is replaced by a
network capability. We would need a service signing key or equivalent protected
attestation identity, TLS/OIDC validation, request and receipt replay ledgers,
time and key rotation, availability objectives, audit storage, tenant isolation,
and an incident response plan. A broker compromise affects both Foundation and
Artifact across every connected repository; a broker outage safely stops
publication but becomes a release-availability incident.

This option conflicts with the current minimal, zero-standing-service
preference. It also requires a new threat model because the canonical design's
private-brand invariant no longer applies directly. We should consider it only
if organizational scale justifies centralized policy and if a separately
secured service already exists. Rollback revokes the affected key/client pin,
returns repository consumers to hard stop, and requires new admissions for all
previously pending work.

[Option 4 after: external verification broker](../diagrams/unify-supply-chain-authority-external-verification-service-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Trust boundary | Repository process | Network broker plus repository receipt verifier | Centralizes policy and emergency updates | Adds service and signing-key compromise paths |
| Availability | Publication unavailable | Publication depends on broker | Fail-closed outage behavior | New release availability dependency |
| Authority | No brand | Signed, replay-resistant admission | Can cross process/repository boundaries | Requires key rotation, ledger, and tenant policy |

## Comparison

| Dimension | Option 1: Permanent No-Go | Option 2: In-repo trust kernel | Option 3: Appliance | Option 4: Broker |
| --- | --- | --- | --- | --- |
| Security | No new publication attack surface; manual-process risk remains | Single owner/private brand is attractive, but candidate private profile lacks public transparency and remains unproven | Better parser isolation; same profile decision plus larger appliance TCB | Central policy; highest shared-service blast radius |
| Performance | No automated path to measure | Expected bounded in-process overhead; must benchmark normal/inline parity | Startup/IPC overhead; isolation can improve resource containment | Network latency and service queueing; availability-sensitive |
| Memory | No new runtime allocation | Verifier and bounded buffers in existing process | Separate process/container RSS and buffers | Repository client is small; service retains shared state |
| Reliability | Intentionally unavailable | Fewest new components; lock and closure fail independently | Appliance/image/registry failures add stop modes | Broker, network, key, and ledger failures add stop modes |
| Operability | Lowest new burden | Dependency/trust/vector updates plus two publication Gates | Adds appliance builds, provenance, registry, monitoring | Adds 24x7 service, keys, OIDC, audit, rotation, tenancy |
| Migration | Stop is already present | Serial P2-D complete -> P2-S0/FX1 published -> Route A blocked -> Route B design/Environment/source/generation/retirement/custody -> parent reevaluation -> P2-S -> profile decision -> owner -> activation -> Gates | Requires redesign of final consume boundary | Requires a new cross-network authority model and threat model |
| Reversibility | Immediate | Restore guard; old immutable assets remain ineligible | Pin old reviewed appliance or restore guard | Revoke client/key and restore guard |

These are source-derived directions, not measurements. Option 2 validation
must compare vector runtime, maximum-bundle latency, peak RSS, and inline parity
against its pinned baseline. Option 3 adds process startup, IPC, peak aggregate
RSS, and crash-containment tests. Option 4 requires end-to-end p50/p95 latency,
outage, key-rotation, replay, and cross-tenant isolation measurements before it
could compete on operability.

## Recommendation

The G0 decision selects Option 2's topology, not its success profile. I
recommend preparing the private RFC3161 candidate because it may preserve the
single-owner/private-brand boundary without exposing private repository
metadata to a public log or adding a service. I would not be comfortable
selecting it until P2-S proves the exact signed-time path and reviewers
explicitly accept the missing public-transparency/anti-equivocation properties.

We should choose Option 1 if no governed target fixture can be acquired or
generated, one-shot producer lifecycle and custody cannot be bounded, RFC3161
is absent or ambiguous, normal/inline forms drift, the runtime needs ambient
authority, or the residual transparency risk is unacceptable. Option 3 becomes
preferable if process isolation is non-negotiable after feasibility. A public-
Rekor lane or Option 4 would require separate privacy/topology decisions and is
not implicit in this proposal.

## Evidence Coverage And Residual Risk

| Evidence | Option 1 | Option 2 | Option 3 | Option 4 | Tactical protection retained |
| --- | --- | --- | --- | --- | --- |
| `E01` — canonical topology hold | Addresses by permanent stop | Addresses through one pre-publication owner | Addresses with isolated owner | Mitigates via broker/client redesign | Keep every publication effect disabled until all prerequisites for that exact path are GREEN |
| `E02` — conjunctive provider order | Addresses by no resumption | Addresses with serial owner/lock/closure evidence | Addresses with appliance/lock/closure evidence | Addresses with broker/lock/closure evidence | No synthetic eligibility or partial completion |
| `E03` — dormant Foundation bootstrap | Preserves | Preserves before owner and activation | Preserves before appliance | Preserves before broker client | Merged #600 remains exact, dormant, and zero-write |
| `E04` — single Artifact owner | Preserves no authority | Addresses with same owner and per-asset postverify | Addresses if appliance owns final consume | Mitigates via signed admissions | Artifact cannot reuse Foundation lock completion |
| `E05` — dry-run boundary | Unaffected | Unaffected | Unaffected | Unaffected | Do not promote dry run into executor |
| `E06` — package versus deploy distinction | Unaffected | Addresses authority before later consumption | Addresses authority before later consumption | Addresses authority before later consumption | Release Artifact success is never deployment proof |
| `E07` — restricted repair channel | Unaffected | Unaffected | Unaffected | Unaffected | Never reuse repair identity/workflow |
| `E08` — Risk A process | Addresses by no action | Addresses through serial approval Gates | Addresses through serial approval Gates | Addresses only with expanded service Gate | Explicit approval before every external mutation |
| `E09` — live Settings gap | Unaffected | Deferred to post-staging Settings Gate | Deferred to post-staging Settings Gate | Deferred to post-staging Settings Gate | No production secret while bypass remains true |
| `E10` — #600 merged dormant | Preserves hard stop | Uses the merged checkpoint without treating it as owner authority | Same | Same | Never modify exact-11 to absorb owner/profile work |
| `E11` — authority-cycle diagnosis | Addresses through permanent stop | Addresses through independent owner bootstrap | Mitigates through an independently built appliance | Mitigates through a separately trusted broker | Never promote diagnostics or let an owner depend on the lock/closure it authorizes |
| `E12` — private attestation/root model | Addresses by making no claim | Unknown until real RFC3161 feasibility and residual-risk decision | Same profile evidence required despite isolation | Requires a new transparency/privacy model | No profile claim without exact root, real bundle, and separately approved semantics |

Residual risk remains under every active option. Trust roots, CAs, TSAs, and
log keys expire or rotate; a mature library can have parsing defects; GitHub's bundle and OIDC
formats can evolve; immutable storage can become unavailable; npm metadata can
drift; and reviewers can approve the wrong source identity. The tactical guards
therefore remain necessary after migration: byte bounds, duplicate-key
rejection, exact subject/predicate/workflow binding, fresh policy/readback,
content-addressed assets, no-replace publication, offline installation, and
zero-output failure paths. For the candidate private profile, repository-local
no-replace/readback cannot be represented as global transparency.

## Migration And Rollout

The selected G0 direction uses the following serial schedule. Every item is a
separate review or execution decision; later rows cannot authorize earlier
missing evidence.

| Order | PR or Gate | Acceptance and stop boundary |
| --- | --- | --- |
| `D0` | Topology Addendum decision record | **COMPLETE.** Docs/diagrams/JSON only; G0 records topology direction, not implementation. |
| `G0` | Addendum decision Gate | **RECORDED — SELECTED_DIRECTION_ONLY.** Option 2 is the topology direction; Option 1 remains the active hard-stop fallback. This is not implementation approval. |
| `P1` | Refresh and close PR #600 | **COMPLETE.** Merged as exact 11 files at `9ebc0849`; topology preflight remains fixed failure, downstream jobs skip, and no owner/publication authority exists. |
| `P2-D` | Private-profile amendment record | **COMPLETE.** PR #603 merged at `d7e2ab83` with verified base/head and identical approved/merged trees. Candidate `github_private_rfc3161_v1` remains unselected; active canonical contract unchanged; no feasibility or implementation authority. |
| `P2-S0` | Feasibility Gate package | **PUBLISHED — NOT GRANTED.** PR #605 published the Gate definition at `04695240`; missing existing-fixture evidence keeps current output `BLOCKED_INPUT`. No acquisition, fixture, or experiment authority. |
| `P2-S0-FX1` | Route A target-fixture-acquisition Gate | **PUBLISHED — ROUTE A BLOCKED_INPUT.** PR #608 published the Gate at `6d6a0a19`; its read-only preflight closed one of fourteen selectors and established no repo-visible or external custody source. This is not a global nonexistence claim. |
| `P2-S0-FX2` | Route B target-fixture-generation design Gate | **PUBLISHED — NOT GRANTED.** PR #609 published the future producer, exactly-one subject, persistent external writes, custody, and lifecycle model at `a413f636`; current output remains `BLOCKED_INPUT`. |
| `P2-S0-FX2-E` | Route B protected-Environment Settings Gate | **CURRENT — DOCS-ONLY PREPARATION; SETTINGS NOT AUTHORIZED.** Publish an exact fail-closed contract for a dedicated Environment with one independent-human User reviewer, self-review prevention, custom exact `master/type=branch`, `can_admins_bypass=false`, zero secrets/variables/custom protection Apps/Deployments, unchanged Actions retention, and independent after-readback. A later Settings mutation needs separate Risk A approval. |
| `P2-S0-FX2-S` | Route B producer source review/merge | **NOT AUTHORIZED.** Close PR #594 without merge, rebind exact master/open conflicts/Environment receipt, select independently reviewed immutable Action pins, add only bounded workflow/test source, and read back expected PR/merge automatic runs plus ordinary artifacts before stopping at `SOURCE_PRESENT_FOR_SEPARATE_GENERATION_GATE`. |
| `P2-S0-FX2-G` | Route B one-shot generation execution | **NOT AUTHORIZED.** Separate exact-SHA approval, `deployment: false`, one dispatch/attempt/subject/attestation, bounded run/job/check/log/audit/Environment-review/API/artifact objects, zero Deployment/status objects, monitoring, and all-object readback. Success remains `GENERATED_FIXTURE_PENDING_MANDATORY_SOURCE_RETIREMENT`. |
| `P2-S0-FX2-X` | Route B workflow retirement | **NOT AUTHORIZED.** After every consumed run regardless of outcome, merge a separately reviewed source-retirement PR, read back its expected automatic runs/ordinary artifacts, prove zero extra Route B runs/attempts, and record every persistent object as eligible or ineligible history. Only successful generation plus this closeout may yield `GENERATED_FIXTURE_READY_FOR_SEPARATE_CUSTODY_HANDOFF`. API disable or deletion is a different external-write/destructive Gate. |
| `P2-S0-FX2-C` | Route B read-only custody handoff | **NOT AUTHORIZED.** Separately retrieve exact subject, bundle, trust/timestamp material and generation manifest by digest; preserve `origin_route: route_b_generated`; no generation, rerun, deletion, or P2-S authority. |
| `P2-S0-R` | Parent P2-S0 reevaluation | **NOT AUTHORIZED.** Close all eight frozen input classes, including the exact offline official-verifier oracle, and independently review the resulting decision. Online generation/verification success cannot substitute for that oracle. |
| `P2-S` | Isolated feasibility experiment | **NOT STARTED — EXECUTION NOT AUTHORIZED.** Exact Gate-frozen revision, real private fixture, official-oracle agreement, root/TSA/RFC3161 proof, dependency review, normal/inline determinism, offline/resource matrix, and complete cleanup. Fixture generation/dispatch is a separate Gate. |
| `G0R` | Profile decision and canonical reconciliation | **NOT AUTHORIZED.** Only after P2-S returns `GO_FOR_SEPARATE_PROFILE_REVIEW`; explicitly accept or reject the security delta and reconcile E01-E04. |
| `P2-I` | Unified-owner predecessor PR | **NOT AUTHORIZED.** Owner only; exact package/version/pin/path/API/trust snapshot; complete selected-profile vectors and normal/inline parity; no Settings or asset publication. |
| `P3` | Supply-chain activation source PR | **NOT AUTHORIZED.** Only after P2-I is on protected master; same owner wired into Foundation and Artifact consumer contracts; lock and closure publisher source remains manual and dormant. |
| `G1` | Artifact-publication Settings Gate | **NOT AUTHORIZED.** Fresh before snapshot; user reviewer, no self-review, protected master, admin bypass false; independent after readback; no production SSH/host secrets. |
| `G2` | Immutable Foundation lock Gate | **NOT AUTHORIZED.** Manual exact input, no PR-head publication, one immutable asset and one subject, selected-profile-owner refetch/postverify, completion digest only after readback. |
| `G3` | Offline npm closure Gate | **NOT AUTHORIZED.** Exact merged lockfile; complete tarball/integrity/content manifest; independent readback; clean runner, empty ambient cache, disabled network, exact offline install, zero network attempts. |
| `G4` | Source-resumption Gate | **NOT AUTHORIZED.** One immutable packet binds owner commit/vector report, lock postverify receipt, closure receipt and zero-network report; explicit operator approval. |
| `P4` | Future main source-only Draft | **NOT AUTHORIZED.** Manual trigger design, closed Gate input, root permissions empty, no production execution; same owner at Foundation/Artifact checkpoints. |
| `G5` | Disposable target-matched staging | **NOT AUTHORIZED.** Synthetic data only; success, rollback, two-DB partial commit, crash/restart, connection, backup, and cleanup matrices all pass. |
| `G6` | Main Ready/merge | **NOT AUTHORIZED.** Exact-head tests/CodeQL/security review and thread resolution; separate approval; merge still does not deploy. |
| `P5` | C-tier source identity reconciliation | **NOT AUTHORIZED.** Record exact merge/head/ancestry and `not_deployed`; no runtime claim. |
| `G7` | Compatibility staging | **NOT AUTHORIZED.** Fresh read-only inventory, static bundle, temporary compatibility Environment, activation tests, and complete credential cleanup/readback. |
| `G8` | Production Settings Gate | **NOT AUTHORIZED.** Only after P5/G5/G7; exact user reviewers, no self-review, protected branch, `can_admins_bypass=false`, before/after readback before any production secret. |

At any source checkpoint, a failed test, unresolved Important/Critical review,
or head drift keeps the PR Draft. At any publication checkpoint, partial,
conflicting, or failed postverification preserves the immutable evidence as
ineligible history; it is never overwritten or repaired in place. At any
Settings checkpoint, readback mismatch stops with no credential materialization.

## Validation Plan

P2-S first determines whether the candidate private profile has any real success
path. It runs a frozen positive/adversarial matrix in normal and inline fresh
processes, but it produces only redacted experiment evidence. It cannot mint a
production brand or write a Release. Every negative case proves zero brand,
zero completion, zero external write, and zero downstream eligibility. Future
post-publication closure failures remain a later concern: they preserve bytes as
ineligible history and never overwrite, repair, or promote the object.

Required negative families include:

- invalid DSSE signature or payload binding;
- untrusted, expired, or not-yet-valid Fulcio certificate;
- missing, malformed, wrong-signature, wrong-imprint, wrong-time, wrong-policy,
  wrong-algorithm, or wrong-TSA RFC3161 evidence;
- zero, unverified, swapped, ambiguously bound, or count-drifted timestamp
  tokens relative to the exact count later frozen by G0R;
- unexpected tlog/SCT material, public-good-root substitution, root-shape drift,
  or any private-profile claim of Rekor/CT/SCT/public transparency;
- wrong GitHub issuer, repository, direct workflow, workflow ref/SHA, event,
  runner environment, predicate, or source commit;
- zero, multiple, wrong-name, or wrong-digest subjects;
- duplicate, extra, accessor, symbol, non-data, or noncanonical fields;
- caller-supplied roots, CA/TSA keys, time, profile, threshold, policy,
  compatibility mode, or any verification-bypass equivalent;
- forged, cloned, serialized, substituted, replayed, or cross-owner brand;
- normal/inline output, error, or trust-policy drift;
- empty, missing, extra, corrupted, wrong-integrity, wrong-lockfile, or
  wrong-owner experiment dependency-closure content (this does not substitute
  for the future G3 production npm-closure Gate);
- any observed DNS, TCP, HTTP, registry, or package-network attempt during the
  offline verification phase.

Resource validation must record workload and threshold before measurement:

- representative and maximum allowed bundle sizes;
- verification wall time and peak RSS for normal and inline forms;
- fresh-runtime startup cost and repeated-run stability;
- candidate dependency/runtime size, clean-build determinism, inline-wrapper
  size, and peak disk;
- deterministic error behavior and cleanup after every injected failure.

This FX2-E Environment Settings Gate package itself must pass JSON parsing,
metadata authority, project-state, Mermaid source presence/link checks,
Markdown link checks, evidence recomputation, the targeted documentation
regression tests, and working-tree `git diff --check`; after a future commit it
must also pass `git diff --check origin/master...HEAD`. Those checks validate
the documentation package's internal consistency, not the proposed producer,
fixture, or verifier security properties.

## Implementation Work Packages

This turn records P2-D complete, P2-S0/FX1/FX2 published, and Route A blocked,
and authorizes only preparation of the docs-only FX2-E Environment Settings Gate
above. It does not authorize an Environment mutation, a producer implementation
plan, an Action pin, workflow/test source, permissions, acquisition/download/generation or
custody handoff, dispatch/rerun, P2-S, another dependency, Release, deployment,
or production. PR #600 is already merged and remains an exact dormant
checkpoint; it must not be refreshed or expanded to absorb fixture, profile, or
owner work.

Before a Route B source Gate can return positively, PR #594 must be closed
without merge; a separately approved FX2-E execution must establish/read back
the dedicated protected Environment; a post-run source-retirement PR must be
preplanned; and
all source/action pins, predicate, retention, custody, redaction, and failure
contracts must be exact. Merging source still does not authorize generation.
A partially created Environment is
`PARTIAL_ENVIRONMENT_INERT_REQUIRES_SEPARATE_SETTINGS_GATE` only when exact
readback proves custom mode with zero branch policies and zero consumers,
secrets, variables, Apps, Deployments, runs, or unexpected writes. Every broader
or ambiguous state is `NO_GO_OPTION1`; audit delay is pending rather than
positive closeout.
A source or retirement merge also triggers expected repository automation and
ordinary Actions artifacts; each Gate must bind and read those objects back and
prove zero unexpected GitHub Release, Deployment, fixture attestation, or run.
A future generated attestation is a persistent GitHub object: a failed later
step records it and every created run/job/check/log/audit/Environment-review/
artifact object as ineligible history. API disable or deletion is a separate external-
write/destructive Gate rather than an implied rollback.

Only after a separate P2-S execution approval may an isolated scratch run
produce a redacted feasibility packet. A successful packet may request, but
does not grant, a separate `G0R` profile decision and canonical reconciliation.
Only after `G0R` is explicitly approved and complete may a future planning
authorization define bounded source packages such as:

- owner dependency/trust snapshot selection and independent provenance review;
- a closed selected-profile API, private brand, normal/inline generation, and
  complete vector corpus;
- Foundation lock activation and selected-profile-owner postverify contract;
- Artifact same-owner cross-contract adapter without asset-authority reuse;
- offline closure producer, immutable manifest, readback, and clean-runner
  zero-network consumer proof;
- artifact-publication Settings before/after readback tooling; and
- a combined provider evidence packet plus explicit Risk A resume Gate.

Any future plan must refresh exact source identity and return to design review
if the selected dependency, GitHub bundle format, trusted root, TSA binding,
owner boundary, or current PR topology has materially changed.

## Open Questions

- Can a future custodian establish a historical Route A fixture under a
  superseding exact Gate, or is Route B the only viable evidence source?
- Which exact Settings operator, future dispatch actor, independent-human User
  reviewer, identity-record digests, execution window, and approval receipt may
  consume the frozen FX2-E Environment contract?
- What exact source-retirement scope and no-extra-run readback closes the
  callable workflow before custody, while leaving Environment mutation or
  deletion to a separate Settings Gate?
- Which exact immutable full-SHA pins and provenance satisfy the producer's
  minimal Action set without expanding permissions or introducing package/lock
  dependencies?
- What exact Actions-artifact retention, custodian, redacted manifest, bundle
  retrieval, and persistent-attestation ineligible-history contracts are
  acceptable before generation?
- Does the real target bundle contain an RFC3161 token whose signed-byte
  derivation and `messageImprint` can be verified against the exact applicable
  GitHub-private root and TSA?
- Is the explicit absence of Rekor, CT/SCT, public transparency, and global
  anti-equivocation acceptable, or must Option 1 remain active while a separate
  public-Rekor lane is reviewed for privacy and topology impact?
- Which mature implementation, exact version, transitive dependency set,
  executable or package digest, license, provenance, and security-update policy
  should a future isolated spike evaluate without selecting it for production?
- Can one source deterministically produce both normal ESM and no-checkout
  inline runtimes without copied trust/policy or `Function.toString()`?
- How are GitHub-private Fulcio and TSA trust snapshots versioned, expired,
  updated, provenance-checked, and rolled back without caller selection?
- What exact byte caps and canonical contracts apply to bundle, statement,
  trust snapshot, lock, closure manifest, and verification evidence?
- What retention and availability objectives apply to immutable lock and npm
  closure assets, and what independent storage evidence is required?
- Does the future source ruleset need a nonzero independent review requirement,
  or will the durable Gate ledger plus Environment approvals remain the sole
  production authorization boundary?
- Which measured latency, memory, runtime-size, and closure-size thresholds
  would make the appliance option preferable to the in-process owner?
