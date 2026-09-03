# Security Hardening Proposal: Temporary Control-Plane Artifact Ingress

## Decision

Record a temporary, separately gated delivery topology for a matched
control-plane source/dependency artifact pair. This is a **design decision
only**. It does not create a receiving channel, choose an implementation, or
authorize a production deployment.

## Executive Recommendation

We have two serious choices. **Option 1, retain no ingress**, preserves the
current hard stop and all existing SSH boundaries. **Option 2, temporary
forced-command ingress**, introduces one narrowly scoped delivery authority
that can receive only a manifest-bound, digest-checked artifact set. I
recommend Option 2 as the selected future direction because it isolates this
new need from the existing repair channel; its use remains blocked until the
independent supply-chain and execution gates are green.

## Evidence

| Evidence | Finding or document | What it establishes |
| --- | --- | --- |
| T01 | [Canonical production-deploy design](../../../specs/2026-08-08-github-control-plane-production-deploy-design.md) | New delivery authority needs a separate Risk A topology decision; the full-Sigstore owner hold remains active. |
| T02 | [Implementation program](../../../plans/2026-08-08-github-control-plane-production-deploy-implementation-program.md) | Owner, postverification, offline closure, and explicit resume approval are all required before source progression. |
| T03 | [Production dry-run workflow](../../../../../.github/workflows/production-deploy-dry-run.yml) | The current workflow produces review material but does not execute on a host. |
| T04 | [Release-artifact workflow](../../../../../.github/workflows/release-artifact.yml) | Packaging success is not delivery or deployment authority. |
| T05 | [Japan repair workflow](../../../../../.github/workflows/japan-runtime-config-additive-repair.yml) | Existing production SSH use is intentionally fixed-purpose and cannot become a generic artifact channel. |
| T06 | Redacted production inventory | The current production target lacks a dedicated receiver; repository read access is not Actions-artifact delivery access. |

I inspected T01-T05 in the isolated exact-master worktree and treated T06 as
redacted operational evidence. The most important inference is structural:
because current credentialed paths have narrow purposes, filling the missing
delivery edge by widening one of them would collapse separate trust boundaries.

## Current Design And Failure Mode

Today, GitHub can build artifacts and a host can read repository source through
a read-only deploy key. Neither fact lets the host authenticate an Actions
artifact, bind it to a particular manifest, or retain it for a bounded period.
The tempting shortcut is to reuse the existing production repair identity. That
would turn a configuration-repair exception into a general artifact transport
channel, and its fixed-purpose safety claims would no longer be credible.

## Desired Invariants

- The receiver accepts only four fixed logical object names: source archive,
  dependency artifact, manifest, and checksum.
- The manifest binds one exact source revision, the two payload digests, byte
  lengths, and a 24-hour absolute expiry. Missing, duplicate, malformed, or
  mismatched data fails before a durable publish.
- Aggregate payload size is at most 64 MiB; streaming is bounded and no object
  name selects a filesystem path.
- The delivery identity has no shell, TTY, agent/X11/TCP forwarding, scp,
  rsync, SFTP, repository write, service control, or release-pointer access.
- Acceptance emits only an aggregate-safe receipt. It does not unpack, install,
  execute, activate, restart, or promote anything.
- The protected workflow stores a private key only after a separate Settings
  approval. The host stores only its paired public key.

## Constraints And Non-Goals

This proposal does not weaken full_sigstore_owner_topology_unapproved, select
a signing profile, or authorize lock publication, offline closure, source
implementation, GitHub Settings, credentials, production access, staging,
deployment, rollback, database work, or runtime configuration changes. It also
does not replace the current pointer-based release activation model.

## Before Architecture

The before diagram shows two intentionally separate capabilities with no
approved bridge for Actions artifacts.

~~~mermaid
flowchart LR
  GH[GitHub manual workflow] -->|review packet only| A[Actions artifact]
  H[Japan control-plane host] -->|read-only repository source| R[Git repository]
  RC[Fixed-purpose repair workflow] -->|restricted configuration repair| H
  A -. no approved artifact receiver .-> H
  RC -. must not be widened .-> A
~~~

The missing edge is a safety property at present: a build result cannot
silently become host input. The cost is that there is no auditable delivery
route once all other deployment prerequisites are satisfied.

## Options

### Option 1: Retain no ingress

Option 1 keeps the before architecture. It is the strongest choice if the
independent owner/closure gates remain unresolved or a future receiver cannot
meet the strict capability and expiry constraints. It creates no new key,
process, account, or operations burden. Its limitation is deliberate: it
cannot deliver the build product.

~~~mermaid
flowchart LR
  GH[GitHub manual workflow] -->|artifact remains in GitHub| A[Actions artifact]
  H[Japan control-plane host] -->|read-only source only| R[Git repository]
  RC[Fixed-purpose repair workflow] -->|unchanged| H
  A -. rejected: no receiver .-> H
~~~

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Delivery authority | None | None | No new attack surface | Deployment remains blocked |
| Existing repair SSH | Fixed purpose | Unchanged | No privilege broadening | No artifact transport |

### Option 2: Temporary forced-command ingress

Option 2 adds one isolated boundary rather than changing the legacy repair
channel. A future manually approved workflow presents the four fixed objects to
a dedicated receiver. The receiver parses a canonical manifest, streams objects
under the aggregate cap, verifies digest and expiry, and atomically publishes a
non-executable receipt. The root-owned promotion boundary consumes neither
bytes nor receipt automatically.

~~~mermaid
flowchart LR
  GH[Protected manual workflow] -->|private key; fixed stream| RX[Forced-command receiver]
  RX -->|manifest/digest/expiry checks| Q[Root-owned quarantined candidate]
  Q -->|aggregate-safe receipt only| G[Separate promotion Gate]
  G -. no automatic activation .-> S[Release pointer and service]
  RC[Existing repair identity] -. unchanged; no transfer .-> S
~~~

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Host identity | No receiver | Dedicated low-privilege receiver | Separates transfer from repair and activation | New credential lifecycle |
| Input scope | No artifact ingress | Four fixed manifest-bound objects | Removes arbitrary path and command selection | Receiver implementation and tests |
| Durability | None | Quarantine plus 24-hour expiry | Interrupted or stale input cannot be promoted | Cleanup/readback burden |
| Activation | N/A | Still separately gated | Transfer cannot turn into deploy | Extra deliberate approval |

## Comparison

| Dimension | Option 1: retain no ingress | Option 2: temporary forced-command ingress |
| --- | --- | --- |
| Security | No new surface, but no controlled delivery capability | Narrow new sensitive boundary; avoids broadening repair SSH |
| Performance | No path | One bounded stream and hashing pass; measure at 64 MiB |
| Memory | No receiver | Bounded streaming required; measure peak RSS |
| Reliability | No transfer failure modes | Atomic no-replace receipt and explicit expiry; test interruptions |
| Operability | No new lifecycle | Protected Environment, key, receiver, expiry and audit operations |
| Migration | None | Disposable validation first; current activation unchanged |

## Recommendation

I recommend Option 2 only as a recorded future topology. We should prefer
Option 1 whenever the owner/closure/resumption gates are not green, the exact
Settings reviewer model cannot be read back, or a receiver test leaves any
interactive or path-selection capability. A temporary transport mechanism is
useful precisely because it stays small; it stops being acceptable if it grows
into a general remote administration channel.

## Evidence Coverage And Residual Risk

| Evidence | Option 2 effect | Residual risk |
| --- | --- | --- |
| T01 — topology requirement | Mitigates by recording the new edge explicitly | It does not satisfy the required shared-owner placement. |
| T02 — implementation hard stop | Unaffected | Owner, postverification, closure, and explicit resume approval remain required. |
| T03 — dry-run artifact boundary | Mitigates a future delivery gap | Dry run remains non-executing. |
| T04 — package versus deployment | Unaffected | Artifact success remains insufficient for production. |
| T05 — purpose-bound repair channel | Addresses | A new receiver can still be misimplemented; preserve fixed protocol tests. |
| T06 — no current receiver | Addresses only after a separate Gate | Fresh live inventory can invalidate this proposal. |

## Migration And Rollout

The sequence is serial: this Draft documents direction; a later exact execution
Gate revalidates sources, live inventory, reviewers, expiry, and receipt schema;
a separately reviewed implementation lands; disposable validation proves
negative cases and no activation; only then may an operator request a distinct
production promotion decision. Rollback of a future receiver is a separate
approved destructive operation: disable its protected secret and host public
key, preserve aggregate-safe evidence, and verify that no receiver remains.

## Validation Plan

Future implementation must test positive exact-manifest delivery and these
negative cases: invalid key; interactive command; TTY or forwarding request;
unexpected object name; duplicate object; path traversal; missing/extra field;
wrong source revision; wrong digest; wrong byte count; aggregate size over 64
MiB; expired or excessive TTL; interrupted stream; duplicate receipt; and any
attempt to unpack, execute, switch a pointer, or restart a service. Disposable
validation must use synthetic bytes only and prove the legacy repair channel is
unchanged.

## Implementation Work Packages

The selected direction's deferred work is documented in
[the implementation handoff](../implementation/temporary-bounded-ingress.md)
and [execution Gate](../gates/temporary-artifact-ingress-execution-gate.md).
Neither document grants execution.

## Open Questions

- Can a protected Environment with independent reviewers and no bypass be
  established under its own future Gate?
- Which synthetic maximum payload and transfer-time threshold are acceptable
  after measurement?
- Does the future owner/closure work provide a canonical artifact manifest that
  this receiver can validate without becoming a second trust authority?
