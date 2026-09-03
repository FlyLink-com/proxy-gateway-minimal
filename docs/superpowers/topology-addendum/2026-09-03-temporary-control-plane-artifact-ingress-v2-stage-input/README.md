# Temporary Artifact Ingress V2: Stage-Input And Key-Lifecycle Amendment

> Status: **SOURCE IMPLEMENTATION AMENDMENT; PRODUCTION EXECUTION NOT GRANTED**
>
> Risk: **A**. This amendment narrows the v2 protocol and corrects the key
> lifecycle description. It does not authorize a production receiver change,
> workflow dispatch, candidate promotion, service action, pointer change,
> database operation, runtime configuration change, or customer-data access.

## Decision

The temporary ingress may retain its four-object v1 compatibility protocol and
add an independent v2 protocol whose payload is the exact raw input already
required by `control-plane-production-stage-controller`:

1. `artifact.json`;
2. the manifest-named `proxy-gateway-<release>.zip`;
3. `<source-zip>.sha256`;
4. `dependency-artifact.json`;
5. `node-modules.tar`; and
6. `release-label.txt`.

V2 does not synthesize or rewrite any of these files. The builder accepts only
the exact three-file source artifact directory and exact three-file dependency
artifact directory. It strictly parses both manifests, verifies every file
digest and byte count, verifies the exact source-checksum and release-label
bytes, and requires one source commit and one release across all six files.
The existing 64 MiB aggregate cap remains unchanged.

This six-file decision supersedes only the four-object payload descriptions in
the earlier temporary-ingress documents for v2. V1 remains a compatibility
protocol; it is not silently reinterpreted as v2 and cannot produce a
stage-controller-ready candidate.

## Replay And Expiry Boundary

Every v2 dispatch supplies a fresh lowercase UUIDv4 `packet_id`. The canonical
header binds it as `packetId`, and the receiver uses it as the no-replace
candidate and receipt identity. The receiver claims that identity before it
reads payload bytes, rejects concurrent or later replay, validates expiry both
before and after the stream, and publishes no candidate when the stream has
expired.

The packet and quarantined candidate may be valid for no more than 24 hours.
That TTL does **not** apply to the dedicated SSH key pair. The host keeps only
the restricted public key, the GitHub Environment keeps only the paired
private key, and the operator rotates or revokes that long-lived credential
manually. The key remains forced-command-only and grants no shell, forwarding,
SFTP, scp, rsync, service, pointer, database, configuration, or repository-write
capability. This key-lifecycle clarification supersedes the earlier wording
that required the key itself to expire with each candidate.

## Workflow And Tooling Identity

The independent `Control Plane Artifact Ingress V2` workflow may run only from
`refs/heads/master`. It checks out the protected `github.sha` that contains the
reviewed v2 tooling, then requires the operator-selected payload commit to be
an ancestor of that protected tooling commit. The two downloaded manifests,
not the tooling checkout, remain the authority for the payload source commit.

The workflow builds the complete packet in the ephemeral runner before it
materializes the SSH identity. V1 and v2 share one non-cancelling concurrency
group, so they cannot stream concurrently to the receiver. The workflow has
only `actions: read` and `contents: read`; it neither uploads another artifact
nor invokes a stage controller, service manager, database tool, or activation
command.

## Required Production Sequence

Merging the source PR leaves the new manual workflow inert. Production work
requires a new exact Risk A Gate and must proceed serially:

1. refresh the redacted host, receiver, key, quarantine, storage, and rollback
   inventory;
2. install the reviewed v2 contract beside the receiver, then atomically
   replace the receiver while retaining a rollback copy of the v1 closure;
3. run host-local v1 and v2 synthetic validation, including tamper, expiry,
   concurrent replay, cleanup, and zero-activation checks;
4. read back receiver and forced-command state; and
5. only then issue a new single-use transfer Gate and dispatch v2 with exact
   packet, artifact, source, target, and expiry bindings.

A v2 receipt proves only that a complete immutable six-file candidate entered
quarantine. The existing stage-controller preflight, database snapshot,
protected-overlay assembly, candidate validation, promotion, health check, and
rollback decisions remain separate. No ingress success may imply deployment.

## Rollback

Receiver rollout rollback restores the reviewed v1 receiver closure and proves
v1 synthetic acceptance before ending the host Gate. Workflow rollback pauses
or removes only the v2 manual workflow; it does not delete the long-lived key
unless the operator separately requests credential revocation. Failed or
expired v2 attempts must leave no completed candidate or receipt. An orphaned
candidate, partial receipt, or atomic claim after process termination is
fail-closed and requires a separate read-only inventory before any cleanup
approval.

## Source Validation Requirements

The source PR must prove:

- exact six-file positive delivery and byte preservation;
- direct acceptance of the receiver output by production stage-controller
  preflight;
- malformed manifests, commit/release drift, missing/extra/path-selected files,
  checksum/label drift, archive tamper, excessive/expired TTL, and digest
  mismatch all fail closed;
- concurrent and serial replay leave exactly one candidate and one receipt;
- v1 contract, sender, receiver, builder, and workflow regression tests remain
  green; and
- the new workflow uses reviewed immutable Action pins, protected-master
  tooling, one shared ingress concurrency group, pre-SSH packet construction,
  strict host-key checking, a bounded connection timeout, and unconditional
  ephemeral cleanup.
