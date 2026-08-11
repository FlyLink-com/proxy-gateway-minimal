# Security Hardening Proposal: Unify Supply-Chain Authority Before Publication

> Status:
> - Type: Derived Topology Addendum proposal
> - Risk: A
> - Production authority: False
> - Execution authority: None

## Decision

Choose whether and how we place one complete Sigstore authority before
Foundation lock publication without allowing that owner to bootstrap itself,
duplicating trust in Artifact, or converting diagnostic observations into
publication authority.

The four options are:

1. **Permanent No-Go** — preserve the current diagnostic-only split and do not
   build the formal deployment capability.
2. **In-repository unified trust kernel** — add one pinned, module-private owner
   on protected master and keep lock and offline closure as independent Gates.
3. **Hermetic owner appliance** — isolate verification in one fixed executable
   or OCI artifact that also owns the final fixed consume operations.
4. **External verification broker** — replace the private in-process authority
   with a network service that issues signed, content-bound admissions.

This Draft recommends Option 2 conditionally. It approves none of the options
and does not select a package, version, path, API, trust snapshot, or pin.

## Executive Recommendation

The current split diagnostics are doing the right thing by stopping, but they
leave us without a component that can safely say “this exact lock” or “this
exact Artifact asset” passed complete Sigstore verification. The structural
question is where that final decision lives.

Option 1 makes the strongest safety claim because no publication capability is
created. It is the correct choice if automated control-plane deployment is not
worth a new cryptographic trust boundary. Option 2 keeps that boundary inside
the repository, uses one private brand for both consumers, and adds no service;
it best matches the current design and operating preferences. Option 3 buys
process isolation, but preserving an unforgeable result forces the appliance to
own more of the final consume operation. Option 4 centralizes updates across
repositories, but adds a standing network and signing-key authority.

I recommend Option 2 if, and only if, a separately reviewed mature
implementation can satisfy the complete CT/SCT and normal-versus-inline parity
criteria below. If it cannot, Option 1 remains preferable. Option 3 should win
only if process isolation becomes a hard requirement and the project accepts a
larger appliance lifecycle. Option 4 becomes reasonable only in a future
multi-repository organization that already operates an independently secured
verification service.

## Evidence

I inspected the evidence at exact
`master@9033f67f76573f9c5bccd17c3762a1608f1c4b9c`. The most influential facts
are the canonical corrected-ordering hold and the current inability of either
diagnostic verifier to mint authority.

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
| `E10` | [Live PR #600 summary](../context.md#evidence-hash-profile-and-collection-manifest) | PR #600 is Draft and behind; it does not contain or authorize the missing owner. |
| `E11` | [Cross-document authority-cycle diagnosis](../context.md#evidence-inventory) | Promoting diagnostics or placing the owner inside its own lock/closure would violate the single-owner and independent-bootstrap invariants. |

## Current Design And Failure Mode

Observed: Foundation and Artifact each have bounded diagnostic paths, and their
compatibility verifiers fail with owner-unavailable errors. The exact-11
publisher stops even earlier at `full_sigstore_owner_topology_unapproved`.
Those controls prevent a partial verifier from being mistaken for production
authority.

Inferred: the structural gap is not a missing boolean or workflow condition.
The retained bootstrap-plus-main ordering has no protected-master component
that can own complete trust, issue an unforgeable in-process result, and be
present before the first immutable lock is published. If we simply wrap either
diagnostic path, callers can mistake structural observations for cryptographic
completion. If we put the owner inside the lock or closure it authorizes, we
create a self-verifying bootstrap cycle.

The current boundary is shown in
[the before diagram](../diagrams/unify-supply-chain-authority-before.mmd).
The important edge is the shared hard stop: it contains the problem before any
Release write, build, Settings mutation, or deployment source work.

## Desired Invariants

1. Exactly one production authority implementation verifies both Foundation
   lock evidence and Artifact evidence. Consumers cannot directly import its
   underlying Sigstore package, roots, keys, policy, or result constructor.
2. Production trust inputs are fixed by the owner. Callers cannot inject or
   select Fulcio roots, Rekor keys, CT log keys, time, issuer, repository,
   workflow, ref, SHA, predicate, subject policy, or an SCT bypass.
3. Successful verification covers DSSE signature, Fulcio chain and validity,
   Rekor SET/inclusion/integrated time, embedded SCT/CT log identity and time,
   GitHub OIDC direct-workflow identity, predicate, and exactly one expected
   subject name/digest.
4. The authoritative result is module-private, unforgeable, non-clonable, and
   non-serializable. No `verified:true`, diagnostic report, REST metadata, or
   caller-built object can substitute for it.
5. The owner does not consume the Foundation lock, offline closure, native
   builder, or Artifact result that it will later authorize. Its own source,
   dependency bytes, trust snapshot, and test vectors are independently pinned
   and reviewed.
6. Foundation lock postverification authorizes only the exact lock asset.
   Artifact capability is proven by cross-contract tests, while each future
   Artifact asset receives its own exactly-one-subject full-owner verification.
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

## Constraints And Non-Goals

- This proposal does not implement the owner, select a dependency, resolve a
  vulnerability, or approve a workflow dispatch.
- It does not add the owner to PR #600. That PR remains exactly 11 files and
  can only be refreshed and separately approved as a dormant hard-stopped
  checkpoint.
- It does not merge the owner and activation changes. The owner must be present
  on protected master before an activation PR can remove the topology guard.
- It does not reuse the Japan config-repair workflow, existing deployment
  secrets, an operator SSH key, a production `.env`, or a database copy.
- It does not require production Environment Settings before main source can
  be reviewed. Production Settings activation follows source reconciliation
  and disposable/compatibility staging.
- Performance and memory effects are unmeasured. Validation plans below are
  required before an option can be called implementation-ready.

## Before Architecture

[Before: split diagnostic ownership and hard stop](../diagrams/unify-supply-chain-authority-before.mmd)

The before view has a useful safety property: both incomplete paths converge on
one stop before a dangerous operation. Its weakness is liveness, not fail-open
behavior. A sound after design must preserve the stop while introducing one
authority owner and must not make successful Foundation lock verification a
shortcut for future Artifact assets.

## Options

### Option 1: Permanent No-Go

We can preserve the current structure permanently: leave PR #600 in Draft or
merge it only as a dormant review checkpoint under a later approval, retain
both diagnostic-only paths, and never authorize immutable lock publication or
formal automated deployment.

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

We add one owner-only predecessor PR after the dormant #600 checkpoint. The
owner fixes one mature Sigstore implementation, trust snapshot, policy, and
complete vector corpus on protected master. Foundation and Artifact call the
owner through distinct closed operations, but they receive results carrying
the same private, module-owned provenance. Production callers cannot pass roots,
keys, time, expected workflow policy, or a compatibility mode.

A proposed production surface is a no-selector owner factory with two bounded
operations: one for an exact Foundation lock and one for an exact Artifact
asset. The precise package, path, export names, and byte caps remain an open
decision. The normal ESM runtime and the no-checkout inline runtime must be
derived from one owner source and run the same official/adversarial corpus in
fresh isolated runtimes. Copying trust bytes or reconstructing the verifier
from `Function.toString()` is not acceptable.

After the owner is merged, a separate activation source PR wires the dormant
publisher to it and adds the offline-closure provider/consumer contracts. That
PR remains source-only and manual-only. A later Lock Gate publishes one exact
asset and attestation, then a read-only owner path re-fetches and postverifies
the bytes. A distinct Closure Gate publishes a content-addressed manifest and
all package tarballs, reads them back, then proves clean-runner offline install
with networking denied. Only a new Risk A resume approval can consume the
combined evidence.

The appealing part is control ownership: the private brand does not cross a
process or network boundary, and no standing service or credential is added.
The primary residual risk is same-process exposure to a complex parsing library
and drift between normal and inline representations. We contain that risk with
byte caps, fresh runtimes, identical vector suites, dependency pinning, and
fail-closed isolation of every publish/write path.

Rollback means restoring the topology guard. Immutable assets remain historical
objects but lose eligibility; they are never overwritten or relabeled. A fixed
owner regression requires a new version/pin, complete vector rerun, protected-
master readback, and new publication Gate rather than silent downgrade.

[Option 2 after: in-repository unified owner](../diagrams/unify-supply-chain-authority-in-repo-unified-owner-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Verification owner | Two diagnostic paths | One private owner, two closed consume operations | Removes duplicated trust and prevents diagnostic promotion | Adds one security-critical dependency boundary |
| Bootstrap order | Missing owner blocks all work | Dormant #600, owner PR, then activation PR | Breaks the self-verification cycle | Requires serial review and at least two new source PRs |
| Lock | Not publishable | Separately published and full-owner postverified | Exact lock authority is content-bound | Adds Release retention/readback operations |
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
| Security | No new publication attack surface; manual-process risk remains | Strong single owner and private brand; same-process parser risk remains | Better parser isolation; larger privileged appliance TCB | Central policy; highest shared-service blast radius |
| Performance | No automated path to measure | Expected bounded in-process overhead; must benchmark normal/inline parity | Startup/IPC overhead; isolation can improve resource containment | Network latency and service queueing; availability-sensitive |
| Memory | No new runtime allocation | Verifier and bounded buffers in existing process | Separate process/container RSS and buffers | Repository client is small; service retains shared state |
| Reliability | Intentionally unavailable | Fewest new components; lock and closure fail independently | Appliance/image/registry failures add stop modes | Broker, network, key, and ledger failures add stop modes |
| Operability | Lowest new burden | Dependency/trust/vector updates plus two publication Gates | Adds appliance builds, provenance, registry, monitoring | Adds 24x7 service, keys, OIDC, audit, rotation, tenancy |
| Migration | Stop is already present | Serial #600 -> owner -> activation -> Gates | Requires redesign of final consume boundary | Requires a new cross-network authority model and threat model |
| Reversibility | Immediate | Restore guard; old immutable assets remain ineligible | Pin old reviewed appliance or restore guard | Revoke client/key and restore guard |

These are source-derived directions, not measurements. Option 2 validation
must compare vector runtime, maximum-bundle latency, peak RSS, and inline parity
against its pinned baseline. Option 3 adds process startup, IPC, peak aggregate
RSS, and crash-containment tests. Option 4 requires end-to-end p50/p95 latency,
outage, key-rotation, replay, and cross-tenant isolation measurements before it
could compete on operability.

## Recommendation

I recommend Option 2 under the current constraints. It preserves the strongest
existing invariant—the authority result never becomes a caller-constructible
message—while adding the fewest new operational components. It also lets us
keep lock publication and offline dependency closure as independent failure
domains, which is important because a valid lock says nothing about whether a
clean runner can install the exact dependency graph without network access.

We should choose Option 1 instead if the candidate implementation lacks complete
embedded SCT/CT support, cannot pass the same corpus in normal and inline
runtimes, or cannot be bootstrapped without depending on the lock/closure it
will authorize. Option 3 becomes preferable if process isolation is made
non-negotiable. Option 4 needs a separate organizational decision and is not
proportionate for this repository today.

## Evidence Coverage And Residual Risk

| Evidence | Option 1 | Option 2 | Option 3 | Option 4 | Tactical protection retained |
| --- | --- | --- | --- | --- | --- |
| `E01` — canonical topology hold | Addresses by permanent stop | Addresses through one pre-publication owner | Addresses with isolated owner | Mitigates via broker/client redesign | Keep topology guard until every Gate is GREEN |
| `E02` — conjunctive provider order | Addresses by no resumption | Addresses with serial owner/lock/closure evidence | Addresses with appliance/lock/closure evidence | Addresses with broker/lock/closure evidence | No synthetic eligibility or partial completion |
| `E03` — dormant Foundation bootstrap | Preserves | Preserves before owner and activation | Preserves before appliance | Preserves before broker client | #600 remains exact, dormant, and zero-write |
| `E04` — single Artifact owner | Preserves no authority | Addresses with same owner and per-asset postverify | Addresses if appliance owns final consume | Mitigates via signed admissions | Artifact cannot reuse Foundation lock completion |
| `E05` — dry-run boundary | Unaffected | Unaffected | Unaffected | Unaffected | Do not promote dry run into executor |
| `E06` — package versus deploy distinction | Unaffected | Addresses authority before later consumption | Addresses authority before later consumption | Addresses authority before later consumption | Release Artifact success is never deployment proof |
| `E07` — restricted repair channel | Unaffected | Unaffected | Unaffected | Unaffected | Never reuse repair identity/workflow |
| `E08` — Risk A process | Addresses by no action | Addresses through serial approval Gates | Addresses through serial approval Gates | Addresses only with expanded service Gate | Explicit approval before every external mutation |
| `E09` — live Settings gap | Unaffected | Deferred to post-staging Settings Gate | Deferred to post-staging Settings Gate | Deferred to post-staging Settings Gate | No production secret while bypass remains true |
| `E10` — #600 Draft/behind | Preserves Draft | Requires refresh and separate inert-merge approval | Same | Same | Any failed HEAD stays Draft |
| `E11` — authority-cycle diagnosis | Addresses through permanent stop | Addresses through independent owner bootstrap | Mitigates through an independently built appliance | Mitigates through a separately trusted broker | Never promote diagnostics or let an owner depend on the lock/closure it authorizes |

Residual risk remains under every active option. Trust roots and log keys expire
or rotate; a mature library can have parsing defects; GitHub's bundle and OIDC
formats can evolve; immutable storage can become unavailable; npm metadata can
drift; and reviewers can approve the wrong source identity. The tactical guards
therefore remain necessary after migration: byte bounds, duplicate-key
rejection, exact subject/predicate/workflow binding, fresh policy/readback,
content-addressed assets, no-replace publication, offline installation, and
zero-output failure paths.

## Migration And Rollout

The recommended option uses the following serial schedule. Every item is a
separate review or execution decision; later rows cannot authorize earlier
missing evidence.

| Order | PR or Gate | Acceptance and stop boundary |
| --- | --- | --- |
| `D0` | This Topology Addendum Draft | Docs/diagrams/JSON only; exact evidence identity; all checks pass; production authority remains false. |
| `G0` | Addendum decision Gate | Independent security review and explicit option selection. Document approval is not owner implementation approval. |
| `P1` | Refresh and close PR #600 | Exact 11 files, three-export canonical baseline, topology preflight fixed failure, downstream jobs skipped, zero write, exact-head checks/review GREEN; separate Ready/merge approval. |
| `P2` | Unified-owner predecessor PR | Owner only; exact package/version/pin/path/API/trust snapshot; complete vectors and normal/inline parity; no Settings or asset publication. |
| `P3` | Supply-chain activation source PR | Only after P2 is on protected master; same owner wired into Foundation and Artifact consumer contracts; lock and closure publisher source remains manual and dormant. |
| `G1` | Artifact-publication Settings Gate | Fresh before snapshot; user reviewer, no self-review, protected master, admin bypass false; independent after readback; no production SSH/host secrets. |
| `G2` | Immutable Foundation lock Gate | Manual exact input, no PR-head publication, one immutable asset and one subject, full-owner refetch/postverify, completion digest only after readback. |
| `G3` | Offline npm closure Gate | Exact merged lockfile; complete tarball/integrity/content manifest; independent readback; clean runner, empty ambient cache, disabled network, exact offline install, zero network attempts. |
| `G4` | Source-resumption Gate | One immutable packet binds owner commit/vector report, lock postverify receipt, closure receipt and zero-network report; explicit operator approval. |
| `P4` | Future main source-only Draft | Manual trigger design, closed Gate input, root permissions empty, no production execution; same owner at Foundation/Artifact checkpoints. |
| `G5` | Disposable target-matched staging | Synthetic data only; success, rollback, two-DB partial commit, crash/restart, connection, backup, and cleanup matrices all pass. |
| `G6` | Main Ready/merge | Exact-head tests/CodeQL/security review and thread resolution; separate approval; merge still does not deploy. |
| `P5` | C-tier source identity reconciliation | Record exact merge/head/ancestry and `not_deployed`; no runtime claim. |
| `G7` | Compatibility staging | Fresh read-only inventory, static bundle, temporary compatibility Environment, activation tests, and complete credential cleanup/readback. |
| `G8` | Production Settings Gate | Only after P5/G5/G7; exact user reviewers, no self-review, protected branch, `can_admins_bypass=false`, before/after readback before any production secret. |

At any source checkpoint, a failed test, unresolved Important/Critical review,
or head drift keeps the PR Draft. At any publication checkpoint, partial,
conflicting, or failed postverification preserves the immutable evidence as
ineligible history; it is never overwritten or repaired in place. At any
Settings checkpoint, readback mismatch stops with no credential materialization.

## Validation Plan

The selected owner must run a frozen positive and adversarial matrix in every
supported runtime form. The positive case proves the complete chain and returns
only a private-branded value to the intended consume operation. Every owner or
other pre-write negative case must prove zero brand, zero completion, zero
Release write, and zero downstream eligibility. A closure readback or
clean-runner failure discovered after immutable publication instead preserves
those bytes as ineligible history and proves zero completion and zero downstream
eligibility; it never overwrites, repairs, or promotes the published object.

Required negative families include:

- invalid DSSE signature or payload binding;
- untrusted, expired, or not-yet-valid Fulcio certificate;
- missing, malformed, wrong-log, wrong-signature, or wrong-time embedded SCT;
- wrong Rekor key window, SET, inclusion proof, entry body, or integrated time;
- wrong GitHub issuer, repository, direct workflow, workflow ref/SHA, event,
  runner environment, predicate, or source commit;
- zero, multiple, wrong-name, or wrong-digest subjects;
- duplicate, extra, accessor, symbol, non-data, or noncanonical fields;
- caller-supplied roots, keys, time, policy, compatibility mode, or any
  `insecure-ignore-sct` equivalent;
- forged, cloned, serialized, substituted, replayed, or cross-owner brand;
- normal/inline output, error, or trust-policy drift;
- empty, missing, extra, corrupted, wrong-integrity, wrong-lockfile, or
  wrong-owner offline closure content;
- any observed DNS, TCP, HTTP, registry, or package-network attempt during the
  clean-runner offline proof.

Resource validation must record workload and threshold before measurement:

- representative and maximum allowed bundle sizes;
- verification wall time and peak RSS for normal and inline forms;
- fresh-runtime startup cost and repeated-run stability;
- offline-closure size, extraction time, install time, and peak disk usage;
- deterministic error behavior and cleanup after every injected failure.

This Draft itself must pass JSON parsing, metadata authority, project-state,
Mermaid source presence/link checks, Markdown link checks, and
`git diff --check origin/master...HEAD`. Those checks validate the Draft's
internal consistency, not the proposed security properties.

## Implementation Work Packages

No implementation package is authorized yet. If Option 2 is selected, the
future handoff should contain these bounded packages:

- owner dependency/trust snapshot selection and independent provenance review;
- closed owner API, private brand, normal/inline generation, and vector corpus;
- #600 refresh with exact dormant topology retained;
- Foundation lock activation and full-owner postverify contract;
- Artifact same-owner cross-contract adapter without asset-authority reuse;
- offline closure producer, immutable manifest, readback, and clean-runner
  zero-network consumer proof;
- artifact-publication Settings before/after readback tooling;
- combined provider evidence packet and explicit Risk A resume Gate.

The implementation plan must refresh source identity and return to design review
if the selected dependency, GitHub bundle format, canonical owner boundary, or
current PR topology has materially changed.

## Open Questions

- Which mature implementation, exact version, transitive dependency set,
  executable or package digest, license, and security-update policy should the
  owner pin?
- Can one source deterministically produce both normal ESM and no-checkout
  inline runtimes without copied trust/policy or `Function.toString()`?
- How are Fulcio, Rekor, and CT trust snapshots versioned, expired, updated,
  provenance-checked, and rolled back without caller selection?
- What exact byte caps and canonical contracts apply to bundle, statement,
  trust snapshot, lock, closure manifest, and verification evidence?
- What retention and availability objectives apply to immutable lock and npm
  closure assets, and what independent storage evidence is required?
- Does the future source ruleset need a nonzero independent review requirement,
  or will the durable Gate ledger plus Environment approvals remain the sole
  production authorization boundary?
- Which measured latency, memory, and closure-size thresholds would make the
  appliance option preferable to the in-process owner?
