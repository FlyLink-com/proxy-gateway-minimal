# Gate: Temporary Control-Plane Artifact Ingress Execution

> Status: **NOT GRANTED**
>
> This document defines the evidence required for a future request. It does not
> authorize a GitHub Settings change, key creation, host mutation, source change,
> validation run, or production transfer.
>
> The GitHub Settings input below is amended by the later
> [branch-restricted Environment decision](../../2026-09-03-temporary-control-plane-artifact-ingress-unreviewed-environment/README.md).
> The Supply-chain prerequisites input below is narrowly superseded for a
> quarantine-only candidate transfer by the later
> [single-use operator Gate decision](../../2026-09-03-temporary-control-plane-artifact-ingress-single-use-operator-gate/README.md).
> The v2 six-file payload and long-lived manually rotated key lifecycle are
> governed by the later
> [v2 stage-input amendment](../../2026-09-03-temporary-control-plane-artifact-ingress-v2-stage-input/README.md).
> The execution status remains **NOT GRANTED**.

## Decision Input

All inputs below must be newly read back in the same bounded approval window.
Any missing, stale, ambiguous, or mismatched input is NO_GO.

| Input | Required evidence |
| --- | --- |
| Supply-chain prerequisites | The legacy shared-owner, lock-postverification, and offline-closure chain is not required only for the narrow quarantine-only candidate-transfer exception recorded in the linked amendment. It remains mandatory for every release, activation, deployment, promotion, or rollback path. The exception instead requires a new exact single-use operator decision after every other row of this Gate has fresh matching evidence. |
| Source identity | Exact protected-master commit, reviewed source archive digest, dependency-artifact digest, and canonical manifest digest. |
| Artifact scope | V1 remains exactly source archive, dependency artifact, manifest, and checksum. V2 is exactly the six raw stage-input files named in the linked v2 amendment. Both remain aggregate size <= 64 MiB, one source revision, and contain no customer or runtime configuration material. |
| GitHub Settings | An exact branch-restricted Environment and the explicit manual workflow binding, with before/after redacted readback. The independent-reviewer requirement is superseded only as recorded in the linked amendment; that selection does not grant execution, key creation, or secret storage. |
| Host inventory | Fresh redacted read-only inventory proving a new dedicated low-privilege receiver, no collision with existing repair identities, root-owned quarantine boundary, sufficient bounded storage, and no service/pointer change. |
| Receiver contract | Reviewed source and tests proving forced-command-only behavior; no shell, TTY, port/X11/agent forwarding, scp, rsync, SFTP, path selection, repository write, package install, service control, or pointer switch. |
| Lifecycle | Public key only on host; paired private key only in the protected Environment; long-lived key manually rotated or revoked by the operator; 24-hour maximum packet/candidate lifetime; no-replace receipt; separately approved cleanup/revocation plan. |
| Validation | Disposable target-matched validation with synthetic data, complete negative matrix, digest/expiry readback, and direct proof of zero activation side effects. |
| Promotion | A separate exact operator approval naming target, source commit, candidate release, rollback target, validation result, and no database/runtime configuration changes. |

## Receiver Contract

The future receiver must accept a single canonical stream that maps logical
labels to fixed internal slots. It must reject all client-selected filesystem
paths and all unrecognized transport requests. The manifest is parsed before
any durable publish and binds:

- source revision;
- each object label, byte count, and SHA-256;
- aggregate byte count;
- issued-at and absolute expiry, with expiry no later than 24 hours; and
- a domain-separated receipt identity.

The receiver writes only to an unexecutable quarantine boundary, fsyncs the
complete candidate, verifies all digests, and atomically creates one
no-replace receipt. An accepted receipt may report source revision, opaque
candidate ID, object labels, byte totals, digests, expiry, and validation
status. It must not reveal a private key, raw host output, absolute path, raw
configuration, database data, or customer material.

## Required Failure Behavior

Every failed connection, parse, authorization, expiry, size, digest, duplicate,
or filesystem operation produces zero candidate publication, zero release
pointer modification, zero service operation, and an aggregate-safe failure
receipt only where it is safe to do so. Failure never falls back to the
repository deploy key, the existing repair identity, local package installation,
or manual copy.

## Approval Boundary

The approver must issue an explicit single-use decision only after reviewing the
bound evidence packet. The decision expires with the packet and cannot be
reused for a later commit, artifact digest, host inventory, or key. A successful
transfer produces a **candidate only**; it cannot imply validation, activation,
deployment, or completion.
