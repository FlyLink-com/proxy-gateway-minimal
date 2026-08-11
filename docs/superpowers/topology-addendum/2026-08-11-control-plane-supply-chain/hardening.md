# Security Hardening Review: Control-Plane Supply-Chain Topology

> Status:
> - Type: Topology Addendum with Route A blocked, Route B design Gate published, and FX2-E Settings Gate preparation current
> - Risk: A
> - Process: G0 selected; P2-D completed through PR #603; P2-S0 Gate published through PR #605; Route A Gate published through PR #608 and preflight retained BLOCKED_INPUT; Route B design Gate published through PR #609; FX2-E docs-only Settings Gate preparation current; P2-S not started
> - Expected PR count: 1 docs-only PR for this Gate; Route B protected-Environment Settings execution, producer source, one-shot generation, source retirement, custody handoff, and P2-S require separate approvals
> - Validation: Evidence hashes, document authority, project-state, JSON, diagrams, links, targeted documentation regression, and diff checks
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None

## Evidence Basis

We are resolving one structural ordering problem and one newly evidenced trust-
profile mismatch. The exact-11 bootstrap is now merged on protected `master`
as an inert publisher and diagnostic verifier checkpoint, but it does not carry
the mature full-Sigstore owner required by the canonical plans. GitHub also
documents that private repositories use a private Sigstore instance without a
transparency log. We therefore cannot honestly treat the current Rekor/CT/SCT
success contract as already feasible for this private repository.

I inspected the exact-master design and implementation plans, the merged
bootstrap, the existing publication-adjacent workflows, official GitHub
attestation guidance, and redacted live GitHub policy/trusted-root summaries.
The P2-D design-input evidence remains bound in [context.md](context.md) to
`master@9ebc08492af170a470182ba827da052fa41b81b2` and collection SHA-256
`fc34014aff12217b2e0386346b2ed98bb767b5688be79917dd80d0a841aadeaa`.
Separate completion evidence binds PR #603 to merge
`d7e2ab8364bb51f6e6dd8e7d499eb4d61a83635f`; it does not rewrite the frozen
design-input collection.
Separate Gate-publication evidence binds PR #605 to merge
`046952402c5ded1412e58fe860c6eb9ad426ced5`, while exact-current-source input
evidence records no observed producer or target fixture and leaves external
custody `not_established`. Separate evidence binds PR #608 to FX1 publication
at `6d6a0a197e89706d4de591f0d8cbecaef18df2c1`; the later Route A preflight
still filled only one of fourteen selectors and retained `BLOCKED_INPUT`.
Separate evidence binds PR #609 to FX2 design publication at
`a413f636267a3b0fcfc65f7b911fa50f6cd95ea4`. The later FX2-E preflight found
the dedicated Environment absent, current retention `90/90`, and zero target-
Environment/OIDC/attestation references. Current plan/repository readback
satisfies the documented Enterprise plan prerequisite, while open Draft PR #594
exposes a competing producer/Release design that blocks any positive Route B
source readiness. None of these receipts rewrites the frozen design inputs or
grants Settings, source, generation, custody, acquisition, or P2-S.
The machine-readable option and tradeoff map is [hardening.json](hardening.json).

Seven facts shape the next decision. PR #600 is merged but remains dormant and
hard-stopped. PRs #605, #608, and #609 published Gate definitions only. Route A still
has no established fixture custody. The Enterprise plan prerequisite is
currently satisfied, but no private attestation has been generated. Official
guidance recommends `actions/attest`, whose successful run writes to the GitHub
Attestations API rather than remaining scratch-only. Open Draft PR #594 already
contains a conflicting attestation/Release publisher and cannot be treated as
current capability or silently reused. The private trusted-root readback still
has a no-tlog/no-ctlog line with timestamp authorities, but no real target-
workflow bundle proves how they bind an RFC3161 timestamp. None is a
vulnerability claim; together they require separate design, source,
generation, lifecycle closeout, custody, oracle, feasibility, profile,
Settings, and production decisions.

## Constraints

- G0 selected only the topology direction, P2-D is complete, PR #605 published
  the parent Gate, PR #608 published the Route A child Gate, and PR #609
  published the Route B design Gate without granting any of them. Current
  authority permits only docs-only FX2-E Environment Settings Gate preparation.
  It does not authorize a Settings mutation, source/workflow creation,
  Action or dependency selection, fixture acquisition/download/generation,
  custody handoff, P2-S, a profile decision, canonical reconciliation, owner
  implementation, P2-I/P3, Release, Settings, dispatch, staging, host access,
  production, external write, or source/runtime eligibility.
- Route A's `BLOCKED_INPUT` snapshot is immutable history. New evidence created
  under Route B must be labeled `origin_route: route_b_generated` and use a
  separate read-only custody handoff.
- A merged manual workflow with `id-token: write` and `attestations: write` is
  a callable surface, not dormant. Before source readiness can pass, reviewers
  must separately establish/read back the protected Environment under the FX2-E
  Gate; after the run, a separate source-retirement merge and no-extra-run
  readback are mandatory before custody. Neither control substitutes for the
  other.
- FX2-E requires custom exact `master/type=branch` policy, one exact User
  reviewer controlled by a human independent from the future dispatch actor,
  self-review prevention, `can_admins_bypass=false`, and zero Environment
  secrets, variables, custom protection Apps, and Deployments. Automatic
  Environment deletion is not an approved rollback.
- The current workflow manifest has three fixed Environment bindings and zero
  dynamic/caller-controlled selectors. FX2-E must freeze the complete binding
  manifest, bind an after-reader distinct from the Settings operator, and obtain
  an expected actor/target/window platform audit receipt before positive output.
  `PARTIAL_ENVIRONMENT_INERT_REQUIRES_SEPARATE_SETTINGS_GATE` is valid only for
  the exact readable custom-mode, zero-policy, zero-consumer/write subset; every
  broader or ambiguous state is `NO_GO_OPTION1`.
- `actions/attest` success, a GitHub API download, or online verification cannot
  replace the exact offline official-verifier oracle.
- We prefer a minimal repository-owned boundary with no Redis, queue, cluster,
  microservice, standing credential, or ambient network fallback.
- One owner must serve Foundation and Artifact. Trust roots, policy, selected-
  profile semantics, and the result brand cannot be copied into consumers.
- The canonical full-Sigstore/Rekor/CT/SCT success contract remains active.
  `github_private_rfc3161_v1` is only a candidate replacement profile. It may
  not claim public transparency, Rekor, CT/SCT, or global anti-equivocation.
- The candidate profile requires a real target-workflow private bundle to prove
  an exact GitHub-private Fulcio chain and at least one RFC3161 timestamp bound
  to the exact signed bytes. Missing or ambiguous timestamp evidence is No-Go.
- The owner must not depend on the Foundation lock or offline builder that it
  will later authorize. Its bootstrap source, dependency pin, tests, and trust
  snapshot require an independent review path.
- Foundation lock postverification authorizes only that lock. It cannot be
  reused as authority for a later Artifact asset; every Artifact asset still
  needs its own exactly-one-subject verification by the selected profile owner.
- Offline-closure generation and clean-runner offline-consumption proof are
  separate. An ambient npm cache or network fallback is not acceptable.
- `artifact-publication` Settings precede lock/closure publication. Production
  Environment Settings follow main-source merge/reconciliation and disposable
  staging; they are not a source-creation prerequisite.

## Opportunity Portfolio

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| Unify supply-chain authority before publication | Topology evidence `E01`–`E13` plus publication, Route A preflight, eligibility, conflict, and FX2-E receipts `E14`–`E21` | 1. Permanent No-Go; 2. In-repo trust kernel; 3. Hermetic owner appliance; 4. External verification broker | Keep the G0 Option 2 direction, keep P2-S0 at `BLOCKED_INPUT`, prepare the FX2-E Settings Gate, require separate Settings/source/generation/lifecycle/custody decisions, and retain Option 1 until P2-S and a later profile decision succeed | [Control-plane supply-chain authority](proposals/unify-supply-chain-authority.md) |

## Recommendation Summary

On 2026-08-11, the operator selected **Option 2 for the G0 topology direction
only** and later completed the **P2-D docs-only governance loop through merged
PR #603**. **PR #605 published the P2-S0 Gate, PR #608 published the Route A
FX1 Gate, and PR #609 published the Route B FX2 design Gate without granting
them; Route A preflight remains `BLOCKED_INPUT`, FX2-E Settings Gate preparation
is current, P2-S has not started, and Option 1 remains active.** PR #600 remains
the approved exact-11 dormant
checkpoint. These records do not authorize producer source, Action selection,
fixture acquisition or generation, lifecycle enforcement, custody handoff,
P2-S, a private-profile decision, canonical reconciliation, owner source, P3,
Settings, Release, dispatch, staging, host access, production, external write,
or source/runtime eligibility.

I still recommend **Option 2, an in-repository unified trust kernel**, as the
topology direction. Its attractive property is not merely fewer components:
Foundation and Artifact ask the same module to make the final decision, while
immutable lock and npm closure remain separately published and read back. What
gives me pause is the success profile. GitHub private attestations do not supply
the public transparency properties assumed by the canonical design.

P2-D records `github_private_rfc3161_v1` only as an unselected candidate. It
would require strict bundle/DSSE verification, a fixed GitHub-private Fulcio
chain, at least one verified GitHub-private TSA/RFC3161 timestamp, exact GitHub
OIDC/predicate/one-subject binding, and a private non-serializable authority
brand. It would explicitly claim no Rekor, CT/SCT, public transparency, or
global anti-equivocation. This is a material security-semantics change, not an
`ignore-SCT` switch. P2-S must establish the real bundle/root/timestamp shape,
candidate dependency closure, agreement with an exact offline official-verifier
oracle, and one-source normal/inline parity before a
separate profile decision can even be requested. Any missing real positive,
ambiguous timestamp binding, runtime network dependency, or parity failure
returns to Option 1.

The proposed future order is deliberately serial. The governance-weighted
planning estimate is now **50–60%**, reflecting completed contract and merge
governance rather than implemented runtime capability; this estimate is not a
Gate input or earned-value claim.

1. `G0` (recorded): Option 2 is the topology direction and Option 1 is the
   active hard-stop fallback;
2. `P1` (complete): PR #600 merged at `9ebc0849` as an exact-11 dormant,
   zero-publication checkpoint;
3. `P2-D` (complete): PR #603 merged the docs-only candidate profile record; it
   does not amend the canonical full-Sigstore contract or select the candidate;
4. `P2-S0` (published, not granted): PR #605 published
   [the parent Gate](gates/p2-s0-feasibility-gate.md); missing existing-fixture
   evidence keeps its current output at `BLOCKED_INPUT`;
5. `P2-S0-FX1` (published, not granted; Route A snapshot blocked): PR #608
   published [the Route A child Gate](gates/p2-s0-target-fixture-acquisition-gate.md),
   and the later preflight retained `BLOCKED_INPUT` with 1/14 selectors filled;
6. `P2-S0-FX2` (published, not granted): PR #609 published Route B producer,
   subject, permissions, custody, one-shot lifecycle, and failure semantics in
   [the generation-design Gate](gates/p2-s0-target-fixture-generation-gate.md);
7. `P2-S0-FX2-E` (current, docs-only preparation; Settings not authorized):
   publish [the protected-Environment Settings Gate](gates/p2-s0-target-fixture-generation-environment-settings-gate.md),
   then separately create/read back the exact dedicated Environment with one
   independent-human User reviewer, no-self-review, custom exact `master`
   branch policy, `can_admins_bypass=false`, zero secrets/variables/custom
   protection Apps/Deployments, and unchanged Actions-retention evidence;
8. `P2-S0-FX2-S` (not authorized): after PR #594 is closed without merge and
   fresh exact binding, separately review one producer workflow and one contract
   test bound to that Environment, then read back exact PR/merge automatic runs,
   ordinary artifacts, and zero unexpected Release/Deployment/attestation;
9. `P2-S0-FX2-G` (not authorized): after source merge, separately approve one
   exact generation run; success records only
   `GENERATED_FIXTURE_PENDING_MANDATORY_SOURCE_RETIREMENT`;
10. `P2-S0-FX2-X` (not authorized): merge a separately reviewed workflow-
    retirement PR after every consumed run regardless of outcome, read back its
    expected automatic runs/ordinary artifacts, prove zero extra Route B runs/
    attempts, and inventory every persistent GitHub object as eligible or
    ineligible history;
11. `P2-S0-FX2-C` (not authorized): separately acquire the generated subject/
    bundle read-only and return a Route B-marked receipt only after retirement;
12. `P2-S0-R` (not authorized): reevaluate all eight parent inputs, including
     the exact offline official-verifier oracle; generation or custody success
     alone cannot pass the Gate;
13. `P2-S` (not started, execution not authorized): isolated feasibility only
     after all eight parent inputs are complete and a separate execution approval
     is granted;
14. `G0R` (not authorized): accept or reject the profile security delta and
   reconcile the canonical plans only after P2-S returns
   `GO_FOR_SEPARATE_PROFILE_REVIEW`;
15. `P2-I` (not authorized): land an owner-only predecessor PR;
16. `P3` (not authorized): land a supply-chain activation source PR;
17. `G1` (not authorized): apply and read back the artifact-publication Settings
   Gate before any
   Release write;
18. `G2` (not authorized): publish and selected-profile-owner postverify the
   immutable lock;
19. `G3` (not authorized): only after the lock Gate is GREEN, publish/read back
   the offline closure and prove clean-runner consumption with an empty cache
   and network denied;
20. `G4` (not authorized): grant a new Risk A source-resumption approval before
   a future main Draft.

This ordering preserves the merged bootstrap while preventing a documentation-
only profile proposal from silently becoming owner or publication authority.

## Next Decisions

The G0 topology direction is selected, P2-D is complete, and the P2-S0 Gate is
published but not granted. Route A is published and terminally
`BLOCKED_INPUT` for its current snapshot; the Route B generation-design Gate is
published but not granted, FX2-E is prepared locally for review, and P2-S
remains not started. Reviewers still need to decide, but not implement or
execute, the following:

- Select no candidate-verifier package, version, trust snapshot, owner path, or
  implementation API until P2-S evidence is complete and a separate profile/
  implementation decision is granted. A future Route B source Gate may review
  exact full-SHA GitHub Action pins only for the isolated fixture producer;
  those pins grant no verifier or owner authority.
- Decide whether the absence of public transparency, Rekor, CT/SCT, and global
  anti-equivocation is acceptable for `github_private_rfc3161_v1`; current
  preparation does not accept that residual risk.
- Review the
  [FX2-E protected-Environment Settings Gate](gates/p2-s0-target-fixture-generation-environment-settings-gate.md).
  Publishing it still does not authorize the Settings mutation, source, Action
  selection, permissions, generation, dispatch, custody, or P2-S.
- Before any FX2-E write, bind exact redacted Settings-operator, future-dispatch-
  actor, independent-human reviewer, request/UI/branch-policy, execution-window,
  no-retry, and readback selectors. Use custom exact `master/type=branch`, not
  `protected_branches=true`. Only the exact proven fail-closed partial subset is
  inert; deletion is a separate destructive Gate.
- Bind the reviewer as the independent after-reader, distinct from the Settings
  operator and future dispatch actor. Recheck all three approved static
  Environment bindings and zero dynamic selectors. Positive closeout also needs
  an expected actor/target/window platform audit receipt; audit delay is pending,
  not success.
- Before any source readiness result, close competing Draft PR #594 without
  merge, read back its state/head, refresh exact master/workflow/package/lock/
  Gate bindings, freeze the two-path source scope, and review every Action by
  full commit, provenance, license, vulnerabilities, runner support, and update
  policy.
- Require both a separately approved/read-back dedicated protected Environment
  before source merge and a separately reviewed workflow-retirement merge after
  the run. Static dispatch guards and concurrency are not platform-enforced
  one-shot approval.
- Freeze the expected PR-head and post-merge automation for both source and
  retirement PRs. Read back required checks, current CI/Release Artifact/default
  CodeQL runs and ordinary artifacts, and prove zero unexpected GitHub Release,
  Deployment, fixture attestation, or workflow run; ordinary build artifacts are
  not fixture custody.
- Keep the future workflow direct-manual only, root permissions empty, exactly
  one canonical subject, and exactly one attestation. Its only source-merge
  output may request a separate generation Gate. Run success remains pending
  mandatory retirement; only final generation closeout after retirement and
  all-object readback may request a separate Route B custody handoff.
- Label every generated record `origin_route: route_b_generated`. Do not
  rewrite Route A or treat an Actions artifact/API record as parent readiness.
  Only a completed content-addressed custody receipt may return to the
  [parent P2-S0 Gate](gates/p2-s0-feasibility-gate.md), where all eight inputs
  must still be reevaluated.
- Inventory the exact run/attempt, three jobs, checks, logs, annotations, audit/
  Environment-review metadata, artifact, and attestation. Require
  `deployment: false` and prove zero Deployment/deployment-status objects. Bind
  retention/redaction/readback; on any later failure, mark every created object
  as ineligible history. Deletion or API disable is a separate external-write/
  destructive Gate, not cleanup.
- Require a real target bundle, exact root and TSA bytes, RFC3161 binding,
  license/provenance/vulnerability review, deterministic normal/inline runtime,
  resource thresholds, and zero-network evidence before profile review.
- If P2-S returns `GO_FOR_SEPARATE_PROFILE_REVIEW`, separately reconcile the
  canonical E01-E04 contracts before any owner implementation; every other
  outcome retains Option 1 or requires profile redesign.
- Confirm separate immutable-lock and offline-closure Gates and separate
  artifact-publication versus production-Environment Settings Gates.
- Leave `vultr-japan-production` unchanged until main source reconciliation and
  disposable/compatibility staging are complete.

Because P2-D completion, P2-S0/FX1/FX2 publication, Route A preflight, and FX2-E
Gate preparation authorize no Settings, source, or execution change, the
unchanged merged implementation continues to emit legacy hard-stop code
`full_sigstore_owner_topology_unapproved`. This docs-only turn performs zero
external write. A future approved `actions/attest` generation run would instead
have exact GitHub API/artifact writes and could not claim scratch-only cleanup.
The hard-stop code does not mean the candidate private profile is selected,
implemented, or GREEN.
