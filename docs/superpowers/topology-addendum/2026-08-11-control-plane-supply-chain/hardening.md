# Security Hardening Review: Control-Plane Supply-Chain Topology

> Status:
> - Type: Topology Addendum with G0 recorded, P2-D complete, and P2-S0 Gate preparation current
> - Risk: A
> - Process: G0 topology direction selected; P2-D completed through PR #603; P2-S0 Gate package preparation only; P2-S not started
> - Expected PR count: This docs-only P2-S0 Gate package plus three future source PR checkpoints (owner, activation, and future main); P2-S is an isolated experiment and every execution/source/external Gate requires separate approval
> - Validation: Document authority, project-state, JSON, diagrams, links, and diff checks
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
The machine-readable option and tradeoff map is [hardening.json](hardening.json).

Three facts shape the next decision. PR #600 is merged but remains dormant and
hard-stopped. The private trusted-root readback has a no-tlog/no-ctlog line with
timestamp authorities, but no real target-workflow bundle proves how those
authorities bind an RFC3161 timestamp. The production Environment still allows
administrator bypass. None is a vulnerability claim; together they require us
to separate profile design, feasibility evidence, source implementation,
Settings activation, and production execution.

## Constraints

- G0 selected only the topology direction, and P2-D is now complete as a
  repository profile-amendment record. Current authority permits only P2-S0
  Gate-package preparation. It does not authorize P2-S execution, fixture generation, dependency
  acquisition, a profile decision, canonical-contract reconciliation, owner
  implementation, P2-I/P3, Release, Settings, dispatch, staging, host access,
  production, external write, or source/runtime eligibility.
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
| Unify supply-chain authority before publication | Canonical topology hold, merged dormant bootstrap, private-attestation trust mismatch, missing offline closure, live policy gap, authority-cycle diagnosis, and P2-D closeout (`E01`–`E13`) | 1. Permanent No-Go; 2. In-repo trust kernel; 3. Hermetic owner appliance; 4. External verification broker | Keep the G0 Option 2 direction, record P2-D complete, prepare the P2-S0 Gate package, and retain Option 1 until P2-S and a later profile decision succeed | [Control-plane supply-chain authority](proposals/unify-supply-chain-authority.md) |

## Recommendation Summary

On 2026-08-11, the operator selected **Option 2 for the G0 topology direction
only** and later completed the **P2-D docs-only governance loop through merged
PR #603**. **P2-S0 Gate preparation is current; P2-S has not started; Option 1
remains the active hard-stop fallback.** PR #600 remains the approved exact-11
dormant checkpoint. These records do not authorize P2-S execution, fixture generation, a
private-profile decision, canonical-contract reconciliation, owner source,
P3, Settings, Release, dispatch, staging, host access, production, external
write, or source/runtime eligibility.

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
4. `P2-S0` (current, Gate package preparation only): define inputs, future
   allowed scope, readiness criteria, failure outputs, and explicit negatives
   in [the Gate package](gates/p2-s0-feasibility-gate.md); Gate decision not granted;
5. `P2-S` (not started, execution not authorized): isolated feasibility,
   including a separately approved fixture-acquisition Gate if no existing
   target-workflow private bundle is available;
6. `G0R` (not authorized): accept or reject the profile security delta and
   reconcile the canonical plans only after P2-S returns
   `GO_FOR_SEPARATE_PROFILE_REVIEW`;
7. `P2-I` (not authorized): land an owner-only predecessor PR;
8. `P3` (not authorized): land a supply-chain activation source PR;
9. `G1` (not authorized): apply and read back the artifact-publication Settings
   Gate before any
   Release write;
10. `G2` (not authorized): publish and selected-profile-owner postverify the
   immutable lock;
11. `G3` (not authorized): only after the lock Gate is GREEN, publish/read back
   the offline closure and prove clean-runner consumption with an empty cache
   and network denied;
12. `G4` (not authorized): grant a new Risk A source-resumption approval before
   a future main Draft.

This ordering preserves the merged bootstrap while preventing a documentation-
only profile proposal from silently becoming owner or publication authority.

## Next Decisions

The G0 topology direction is selected, P2-D is complete, and the P2-S0 Gate
package is prepared for review. P2-S remains not started. Reviewers still need
to decide, but not implement or execute, the following:

- Select no package, version, trust snapshot, repository path, or API pin until
  P2-S evidence is complete and a separate profile/implementation decision is
  granted.
- Decide whether the absence of public transparency, Rekor, CT/SCT, and global
  anti-equivocation is acceptable for `github_private_rfc3161_v1`; current
  preparation does not accept that residual risk.
- Review the [P2-S0 Gate package](gates/p2-s0-feasibility-gate.md). Only an
  explicit later `READY_FOR_SEPARATE_P2S_APPROVAL` outcome may support a new
  request for P2-S execution; it does not itself authorize that execution.
- Approve fixture acquisition and P2-S execution separately. A dispatch cannot
  be inferred from this package or design.
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

Because P2-D completion and P2-S0 preparation authorize no source change, the unchanged merged
implementation continues to emit legacy hard-stop code
`full_sigstore_owner_topology_unapproved` with zero external write. That code
does not mean the candidate private profile is selected, implemented, or GREEN.
