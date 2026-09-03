# Implementation Plan: Temporary Forced-Command Artifact Ingress

## Selected Design And Constraints

This is a future implementation handoff for the selected topology direction.
The source-only contract implementation may be prepared and reviewed in an
isolated Draft PR, but it is not executable against a host. The authoritative
stop remains the independent
shared-owner, lock-postverification, offline-closure, and explicit Risk A
resume chain. This plan may not be used to create credentials or host state
until [the execution Gate](../gates/temporary-artifact-ingress-execution-gate.md)
is separately granted.

## Source Revision And Drift Check

The design was bound to 34efe687c8886f1b77d53a720a1ecf2fd339b432. Before
implementation, re-read the canonical design/program, compare exact source
hashes in [context.md](../context.md), inspect current workflow and host
boundaries, and return to topology review if any authority edge has changed.

## Affected Components

- one new protected manual workflow, not a modification of the repair workflow;
- one dedicated low-privilege host receiver and its forced-command key entry;
- one root-owned quarantine/receipt boundary;
- contract tests and disposable validation only.

## Ordered Work Packages

1. Obtain the separate execution Gate and create a detailed redacted evidence
   packet with exact commit, artifact, reviewer, host-inventory, key-lifecycle,
   expiry, and rollback bindings.
2. Implement a minimal receiver with canonical manifest parsing, fixed labels,
   streaming byte caps, SHA-256 checks, expiry validation, no-replace atomic
   publish, and aggregate-safe receipts.
3. Add a protected manual workflow whose only sensitive input is the receiver
   private key; pin dependencies and prohibit log disclosure of credentials.
4. Create a disposable target-matched validation environment using synthetic
   artifacts, then run the complete positive and negative contract matrix.
5. Stop after validation. Request a separate promotion gate rather than
   connecting receipt success to a release pointer or service action.

## Compatibility And Migration

The current repository read key, repair SSH identity, pointer-based release
activation, system service, runtime configuration, databases, Nginx, DNS, and
firewall are compatibility boundaries. This work must leave each unchanged.

## Tactical Protections During Migration

Keep the receiver disabled until protected-Environment and host readback are
complete. Use a unique temporary keypair, fixed command, disabled forwarding,
an aggregate cap of 64 MiB, a 24-hour expiry, and no automatic retry after an
ambiguous result. Preserve only redacted digest-level records.

## Tests And Security Validation

Run unit/contract tests for the manifest, size, digest, expiry, duplicate,
interruption, path, command, forwarding, receipt, and zero-activation cases.
Run a disposable target-matched integration test with synthetic bytes. Review
the workflow and receiver for secret redaction and capability escape paths.

## Performance And Resource Benchmarks

Before promotion, define and measure 64 MiB transfer wall time, receiver peak
RSS, disk growth, hashing time, and cleanup completion time. Compare baseline
and candidate with the same synthetic payload. Set acceptance thresholds before
interpreting the result.

## Rollout And Rollback

Rollout ends at a quarantined candidate. A distinct operator decision is needed
for production promotion. Future rollback first disables the protected secret
and receiver public key under a separate approved cleanup gate, then validates
that the old pointer and service were never changed by ingress.

## Acceptance Criteria

- Every allowed object is manifest-bound, digest-checked, size-bounded, and
  expires in at most 24 hours.
- All unapproved protocol and content cases fail closed.
- The receiver has no interactive or administrative capability.
- A successful transfer creates no release pointer, service, database,
  configuration, network, or customer-data side effect.
- The legacy repair identity remains byte-for-byte and behaviorally unchanged.

## Open Decisions

- Exact protected Environment name and independently reviewed policy.
- Exact receiver implementation language and trusted dependency set.
- Measured thresholds for the maximum synthetic payload.
