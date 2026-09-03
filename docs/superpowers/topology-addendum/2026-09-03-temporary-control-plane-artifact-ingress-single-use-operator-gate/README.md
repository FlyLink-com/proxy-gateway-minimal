# Temporary Artifact Ingress: Single-Use Operator Gate Amendment

> Status: **ACTIVE GOVERNANCE AMENDMENT; EXECUTION NOT GRANTED**
>
> Risk: **A**. This amendment creates a narrow, human-operated exception for
> putting one verified artifact set into a quarantined candidate directory. It
> does not authorize any release, activation, deployment, promotion, rollback,
> service action, pointer change, database operation, runtime configuration
> change, or customer-data access.

## Decision

For the temporary `control-plane-artifact-ingress` path only, the legacy
full-Sigstore owner, lock-postverification, and offline-closure prerequisites
are replaced by a new explicit single-use operator decision. This exception is
needed because the path is a bounded host ingress rather than an authority to
publish or activate a release.

The exception applies only after an operator reviews a fresh evidence packet
and issues one textual decision bound to all values below. It expires if any
one value changes, including the source commit, artifact digest, Environment
state, host inventory, key, or expiry. A generic approval, a CI success, a
workflow dispatch, or a previous approval cannot be reused.

## Required Evidence Packet

The packet must contain, without secret material or customer data:

1. The exact protected `master` commit and the reviewed source archive,
   dependency artifact, manifest, and checksum digests.
2. Proof that the four canonical objects are the complete payload, bind one
   source revision, and total no more than 64 MiB.
3. Readback that `control-plane-artifact-ingress` is the exact manual workflow
   Environment, restricted to protected branches, has no unrelated Secret, and
   is not represented as independently reviewed or no-bypass.
4. A fresh redacted inventory of the designated host showing a new dedicated
   low-privilege identity, a root-owned non-executable quarantine/receipt
   boundary, adequate bounded storage, and no collision with the existing
   repair identity, service, or release pointer.
5. The reviewed forced-command receiver, its negative tests, a public-key-only
   host entry, and the paired private key only in the named Environment.
6. A key and candidate expiry no later than 24 hours, a no-replace receipt,
   and an approved revocation/cleanup command with post-cleanup readback.
7. A disposable, target-matched synthetic validation plan proving malformed,
   expired, oversized, duplicate, digest-mismatched, forwarded, shell, and
   path-selected requests fail closed with zero activation side effects.

## Single-Use Decision Shape

The later operator decision must state all of the following exactly: target,
protected `master` commit, four artifact digests, Environment name, 24-hour-or-
less expiry, candidate-only scope, validation plan, cleanup/revocation plan,
and the explicit prohibition on release pointer, service, database, runtime
configuration, Nginx, DNS, firewall, and customer-data operations.

Only after that decision may a short-lived key pair be generated, the public
key be installed for the fixed forced command, the private key be written to
the named Environment, and a synthetic transfer be run. Each later production
transfer requires a new evidence packet and a new decision.

## Non-Substitution Boundary

This amendment supersedes the legacy supply-chain prerequisite only for
quarantine-only candidate ingress. It does not alter that prerequisite for
artifact publication, release creation, deployment, promotion, recovery,
rollback, or any other workflow. It also does not transform the branch-
restricted, no-reviewer Environment into an independent approval control.

## Rollback

Before a successful synthetic transfer, the sole configured object is the empty
Environment and rollback is deletion after verifying zero deployments and zero
Secrets. After a future authorized validation, revocation must first remove the
Environment Secret and host public key, then read back absence of the identity,
candidate material, and receipt; it must separately prove the release pointer
and service remained unchanged.
