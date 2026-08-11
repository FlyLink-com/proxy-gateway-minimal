# Security Hardening Review: Control-Plane Supply-Chain Topology

> Status:
> - Type: Topology Addendum Draft for decision review
> - Risk: A
> - Process: Evidence review and option selection only
> - Expected PR count: This docs-only Draft plus four future source PR checkpoints under the recommended option (refresh existing #600, owner, activation, and future main); every source PR and external Gate requires separate approval
> - Validation: Document authority, project-state, JSON, diagrams, links, and diff checks
> - Production/AWS impact: None
> - Production authority: False
> - Execution authority: None

## Evidence Basis

We are resolving one structural ordering problem: the current exact-11
bootstrap can carry an inert publisher and diagnostic verifiers, but it cannot
carry the mature full-Sigstore owner required before immutable-lock
publication. The canonical plans also prohibit treating diagnostic output,
REST metadata, or a caller-built object as authority.

I inspected the exact-master design and implementation plans, the existing dry
run and publication-adjacent workflows, and a redacted live GitHub policy
summary. The evidence is bound in [context.md](context.md) to
`master@9033f67f76573f9c5bccd17c3762a1608f1c4b9c` and collection SHA-256
`7d04a3e95d8d745fed8f4c86cf5045d85ac6429aefcd129b7023fded743e8eb1`.
The machine-readable option and tradeoff map is [hardening.json](hardening.json).

Two facts shape the decision. First, PR #600 is a safe but incomplete bootstrap:
it remains Draft and hard-stopped. Second, the production Environment currently
allows administrator bypass. Neither fact is a vulnerability claim; together
they show why source topology, artifact authority, Settings activation, and
production execution must remain separate decisions.

## Constraints

- Current authorization covers this derived Draft only. It does not approve an
  external dependency, an owner implementation, PR #600 Ready/merge, a Release
  asset, GitHub Settings, workflow dispatch, staging, host access, or production.
- We prefer a minimal repository-owned boundary with no Redis, queue, cluster,
  microservice, standing credential, or ambient network fallback.
- One owner must serve Foundation and Artifact. Trust roots, policy, complete
  CT/SCT verification, and the result brand cannot be copied into consumers.
- The owner must not depend on the Foundation lock or offline builder that it
  will later authorize. Its bootstrap source, dependency pin, tests, and trust
  snapshot require an independent review path.
- Foundation lock postverification authorizes only that lock. It cannot be
  reused as authority for a later Artifact asset; every Artifact asset still
  needs its own exactly-one-subject full-owner verification.
- Offline-closure generation and clean-runner offline-consumption proof are
  separate. An ambient npm cache or network fallback is not acceptable.
- `artifact-publication` Settings precede lock/closure publication. Production
  Environment Settings follow main-source merge/reconciliation and disposable
  staging; they are not a source-creation prerequisite.

## Opportunity Portfolio

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| Unify supply-chain authority before publication | Canonical topology hold, split diagnostic owners, missing offline closure, live policy gap, and cross-document cycle diagnosis (`E01`–`E11`) | 1. Permanent No-Go; 2. In-repo trust kernel; 3. Hermetic owner appliance; 4. External verification broker | Select Option 2 if one reviewed implementation can provide identical normal and inline semantics; otherwise retain Option 1 and reopen the decision | [Control-plane supply-chain authority](proposals/unify-supply-chain-authority.md) |

## Recommendation Summary

I recommend **Option 2, an in-repository unified trust kernel**, under the
current minimal-dependency and private-brand constraints. Its attractive
property is not merely fewer components: Foundation and Artifact ask the same
module to make the final cryptographic decision, while immutable lock and npm
closure remain separately published and separately read back. This removes the
current ownership gap without adding a long-lived service or serializing
authority across a process boundary.

The recommendation is conditional. The future owner selection must pin an
exact mature implementation and prove complete embedded SCT/CT, Rekor, Fulcio,
DSSE, GitHub OIDC, predicate, and exactly-one-subject semantics with official
positive and adversarial vectors. It must also produce the no-checkout runtime
form from one source without copied trust or policy. If that cannot be shown,
we should keep the current hard stop and reconsider the hermetic appliance;
wrapping the existing diagnostics is not a fallback.

The proposed future order is deliberately serial:

1. approve this Addendum decision;
2. refresh and separately approve PR #600 for a dormant hard-stopped merge;
3. land an owner-only predecessor PR;
4. land a supply-chain activation source PR;
5. apply and read back the artifact-publication Settings Gate before any
   Release write;
6. publish and full-owner postverify the immutable lock;
7. only after the lock Gate is GREEN, publish/read back the offline closure and
   prove clean-runner consumption with an empty cache and network denied;
8. grant a new Risk A source-resumption approval before a future main Draft.

This ordering breaks the bootstrap cycle without placing the owner in a twelfth
#600 file or dispatching a PR-branch publisher.

## Next Decisions

Reviewers need to decide, but not implement, the following:

- Select Option 1, 2, 3, or 4. Selection of Option 2 does not yet select a
  package, version, trust snapshot, repository path, or API pin.
- Confirm that PR #600 may only be refreshed and merged as an inert checkpoint
  after a later explicit approval, before the owner and activation PRs.
- Decide the evidence required to approve one mature Sigstore implementation,
  including license, release provenance, vulnerability response, pinned bytes,
  normal/inline parity, and trust-root update policy.
- Confirm separate immutable-lock and offline-closure Gates and separate
  artifact-publication versus production-Environment Settings Gates.
- Leave `vultr-japan-production` unchanged until main source reconciliation and
  disposable/compatibility staging are complete.

Until these decisions are explicitly approved, the correct operational result
remains `full_sigstore_owner_topology_unapproved` with zero external write.
