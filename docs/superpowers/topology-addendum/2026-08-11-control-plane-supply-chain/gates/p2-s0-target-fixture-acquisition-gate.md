# P2-S0-FX1 Gate Package: Target Private Fixture Acquisition

```yaml
phase: P2-S0 preparation
work_item: target-fixture-acquisition_gate_preparation
parent_gate: P2-S0
parent_gate_decision: not_granted
status: docs-only Gate prepared / existing target fixture not established / P2-S not started
risk_class: A
risk_state: controlled
record_state: draft_prepared_for_review
gate_decision: not_granted
current_output: BLOCKED_INPUT
current_authority: docs_only_gate_preparation
fixture_acquisition_authority: false
fixture_generation_authority: false
workflow_change_authority: false
workflow_dispatch_authority: false
execution_authority: false
production_authority: false
```

## Decision

The parent [P2-S0 feasibility Gate](p2-s0-feasibility-gate.md) is a repository
Gate definition at merge
`046952402c5ded1412e58fe860c6eb9ad426ced5`. It still cannot return
`READY_FOR_SEPARATE_P2S_APPROVAL` because no exact target-repository,
direct-workflow private fixture manifest has been supplied.

This child package defines the evidence and containment required before an
operator may be asked to authorize one read-only acquisition of an already
existing fixture. It does not acquire or generate a fixture. It does not
authorize a workflow change, dispatch, rerun, artifact download, dependency,
oracle execution, P2-S, Settings, Release, Environment, staging, host, or
production action.

The current output is `BLOCKED_INPUT`. That output is fail-closed input status,
not a claim that no fixture can exist outside the repository. External operator
custody remains `not_established` until an exact manifest and custody source are
provided.

## Exact Read-Only Inventory

Inventory captured at `2026-08-11T16:34:24Z`:

| Item | Observation | Consequence |
| --- | --- | --- |
| Current source | commit `046952402c5ded1412e58fe860c6eb9ad426ced5`; tree `7c171b70026181cf543d62c805712a5966a7947f` | This binds the Gate design only. Any later workflow/source change requires a new source binding and approval. |
| Parent Gate | `gates/p2-s0-feasibility-gate.md`; blob `7f65883883db38e59f3504910722b140eafe9c06` | The eight-input parent contract remains unchanged. |
| Tracked workflows | 9 files on exact current source | No tracked workflow contains `actions/attest`, `actions/attest-build-provenance`, `gh attestation`, `id-token: write`, or `attestations: read/write`. |
| Foundation publisher | Fixed `full_sigstore_owner_topology_unapproved` failure with `permissions: {}` | It cannot produce a fixture and must not be dispatched as a substitute. |
| Release Artifact run | run `31511439433`, completed `success` | It produced only `proxy-gateway-046952402c5d`, `portal-static-046952402c5d`, and `admin-static-046952402c5d`; its workflow has no attestation step. |
| Actions artifact metadata | 468 repository artifact metadata rows; zero names matched `attest`, `sigstore`, `rfc3161`, `fixture`, or `bundle` | Name metadata does not establish an existing fixture and does not prove opaque artifact contents. No artifact was downloaded. |
| Repository fixture paths | No tracked target private-attestation bundle, subject bytes, trusted-root snapshot, or RFC3161 fixture was observed | Unrelated synthetic/test fixtures cannot satisfy the parent Gate. |
| External custody | Not established | The Gate cannot infer either availability or global absence. |

GitHub's workflow registry also retains two historical workflow records that are
absent from the current source tree. Registry metadata is therefore not source
authority. A future request must bind the exact commit, tree, workflow path,
workflow blob, run, attempt, and subject rather than relying on a workflow ID or
display name alone.

## Acquisition Routes

### Route A: Existing Fixture Custody Handoff

This is the only route this Gate may later authorize. An operator or approved
custodian must first supply a redacted manifest proving that a real fixture
already exists for the exact target repository and direct workflow. A future
execution approval may then name exactly one read-only custody source and one
path-bounded scratch destination.

The handoff may copy or download only the manifest-bound bundle, subject, and
trust/timestamp components. It may compute hashes, sizes, and bounded structural
metadata. It may not run a candidate verifier, treat the acquisition tool as
the official oracle, or emit P2-S readiness.

### Route B: Fixture Generation

Route B is outside this Gate. Current source has no attestation producer. Adding
or modifying a workflow, granting `id-token: write` or `attestations: write`,
merging source, dispatching or rerunning a workflow, and downloading the result
would require separately reviewed source and execution Gates bound to their own
exact heads, permissions, inputs, runs, cleanup, and rollback.

If Route A cannot be filled without Route B, this Gate remains
`BLOCKED_INPUT` or returns `REDESIGN_ACQUISITION`. It must not create a
synthetic, other-repository, parser-only, locally signed, or repackaged
substitute.

## Required Existing-Fixture Manifest

Before any acquisition approval can be requested, one canonical redacted
manifest must freeze all of the following:

1. **Custody** — named custody class, read-only availability, retention window,
   exact retrieval mechanism, and evidence that no credential or raw private
   byte will enter the repository or review packet.
2. **Target identity** — repository, visibility class, direct workflow path and
   blob, workflow ref/SHA, event, runner environment, run ID and attempt, issuer,
   source SHA/ref, predicate type, expected subject name, and subject count.
3. **Bundle** — exact format/arm, byte size and SHA-256, signature count, and
   content-addressed source reference.
4. **Subject** — exact byte size and SHA-256 plus the expected single subject
   name; a release/archive digest alone is insufficient if it is not the
   attested subject bytes.
5. **Timestamp** — RFC3161 token byte size and SHA-256, proposed
   timestamped-byte derivation, message-imprint algorithm/value, TSA chain
   component digests, and expected signing-time constraints. These are inputs
   for later proof, not verified facts at acquisition time.
6. **Certificate and root** — signing-chain component digests, applicable raw
   trusted-root snapshot digest, CA/TSA identities and counts, capture command,
   capture-tool version/digest, and capture time. Root applicability remains
   unproven until the parent experiment and oracle agree.
7. **Acquisition command** — exact executable path/digest, fixed arguments,
   fixed target, expected response class, timeout, output paths, and a redaction
   rule. No selector may be supplied from ambient environment discovery.
8. **Containment** — a new absolute scratch root outside every checkout and
   worktree, rejected symlink/reparse-point cases, read-only input layout,
   task-local temp/cache paths, process list, network boundary, and maximum byte
   counts.
9. **Cleanup and no-drift** — every raw/scratch path, process-stop order,
   deletion/readback steps, repository/ref/worktree/global-cache comparisons,
   and GitHub no-write readback.

Raw bundle, subject, token, certificate, and trusted-root bytes must stay outside
the repository. Only the content-addressed redacted manifest and a path-bounded
cleanup receipt may enter a future review packet.

## Unfilled Exact Selectors

The following values intentionally remain unfilled, so this draft cannot grant
execution:

| Selector | Current value |
| --- | --- |
| Target repository | `gccwebos-com/proxy-gateway-minimal` |
| Existing-fixture custody source | `UNFILLED` |
| Direct workflow path and blob | `UNFILLED` |
| Workflow source SHA/ref/event | `UNFILLED` |
| Run ID and attempt | `UNFILLED` |
| Expected issuer and runner | `UNFILLED` |
| Predicate type | `UNFILLED` |
| Subject name, size, and SHA-256 | `UNFILLED` |
| Bundle size and SHA-256 | `UNFILLED` |
| RFC3161 token and timestamped-byte inputs | `UNFILLED` |
| Signing chain and applicable root/TSA inputs | `UNFILLED` |
| Acquisition executable and exact command | `UNFILLED` |
| Absolute scratch root and cleanup path set | `UNFILLED` |
| Maximum byte count and timeout | `UNFILLED` |

Filling these fields is preparation for a separate approval; it is not approval
by itself. A source/workflow change invalidates this current-master binding and
requires a replacement Gate rather than an in-place assumption.

## Future Dry-Run Checklist

A future independently reviewed execution request must prove, before any raw
byte is read:

- current remote `master`, the reviewed Gate commit/tree, and every manifest-
  bound workflow/package/lock blob match the approved values;
- the fixture already exists and the custodian can expose only the exact
  manifest-bound objects read-only;
- the exact command is read-only, displays no credential, and cannot dispatch,
  rerun, upload, attest, publish, or mutate Settings;
- the scratch root resolves outside every repository/worktree, contains no
  symlink or reparse point, and starts absent or empty;
- byte, file-count, time, process, and network limits are fixed before
  acquisition;
- all raw output is private to the scratch root and the distributable packet is
  digest/metadata only; and
- the closeout commands can prove repository, refs, worktrees, package/lock
  blobs, global caches, workflow runs, Releases, Deployments, Settings, and
  Environments did not drift.

Any missing selector or failed precondition stops before acquisition and returns
`BLOCKED_INPUT` or `REDESIGN_ACQUISITION`. It never authorizes a wider command.

## Future Acceptance Criteria

The only positive output is
`FIXTURE_INPUT_READY_FOR_P2S0_REEVALUATION`, and it requires all of these:

- source-custody and scratch copies have identical independently recomputed
  digests and sizes;
- repository, direct workflow, source, event, runner, predicate, and exactly-one-
  subject expectations are fixed without caller-selectable fallback;
- bundle, subject, RFC3161 token, certificate chain, and supplied candidate
  root/TSA components are individually content-addressed; root/TSA applicability
  remains unproven until the parent experiment and oracle agree;
- the redacted manifest contains no raw private bytes, credential, customer
  data, subscription material, local private path, or mutable URL;
- no workflow, ref, package, lockfile, global cache, Settings, Release,
  Deployment, Environment, staging, host, or production state changed; and
- cleanup removed every locally acquired raw input, scratch copy, temp/cache
  entry, and process, followed by an independent absence/no-drift readback; the
  external source custody remained read-only and unmodified.

That positive output returns to the parent P2-S0 Gate. It does not complete the
other seven input classes, authorize P2-S, or prove RFC3161/Fulcio feasibility.

## Failure Outputs

| Output | Meaning | Required routing |
| --- | --- | --- |
| `FIXTURE_INPUT_READY_FOR_P2S0_REEVALUATION` | One exact existing fixture was acquired, content-addressed, redacted, and completely cleaned up | Return to the parent Gate; do not start P2-S |
| `BLOCKED_INPUT` | Fixture, custodian, selector, byte, digest, or read-only availability is missing | Keep Option 1 and stop |
| `REDESIGN_ACQUISITION` | The only viable path requires a workflow/source/permission/dispatch change or a different custody model | Prepare separate source and execution Gates; do not broaden this Gate |
| `NO_GO_OPTION1` | Residual risk, external write, containment failure, leakage, or cleanup failure is unacceptable | Retain the terminal hard stop and open only a path-bounded recovery closeout if needed |

Forbidden outputs include `READY_FOR_SEPARATE_P2S_APPROVAL`,
`GO_FOR_SEPARATE_PROFILE_REVIEW`, `P2_GREEN`, `IMPLEMENTATION_AUTHORIZED`, and
`PUBLICATION_AUTHORIZED`.

## Cleanup, Recovery, And Rollback

This docs-only preparation has no runtime rollback. Rejecting or closing it
leaves Option 1 active, the parent Gate blocked, and P2-S not started.

For any later separately approved acquisition, cleanup is part of the atomic
acceptance boundary. Every process must stop; every locally acquired raw bundle,
subject, token, certificate/root byte, copy, temp file, and task-local cache in
the approved scratch boundary must be removed; the external source custody must
remain read-only and unmodified; and absence plus no-drift must be read back.
Any cleanup failure forces
`NO_GO_OPTION1` for that run and a separately approved, path-bounded recovery
closeout. Raw-byte residue and a ready/success output may never coexist.

## Current Closeout And Next Approval Boundary

This preparation must close with:

- no fixture generation, acquisition, download, dispatch, rerun, or upload;
- no source, workflow, permission, package, lockfile, dependency, Settings,
  Release, Deployment, Environment, staging, host, or production change;
- no raw private input in the repository or review packet; and
- only docs changes in the isolated Gate worktree.

After independent review, the operator may approve publication of this docs-only
Gate package. Publication still does not authorize acquisition. A later
execution request must fill every selector above and state whether it uses
Route A. Route B always requires separate source and execution approvals.
