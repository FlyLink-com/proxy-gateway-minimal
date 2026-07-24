# Japan TUIC Additive Repair Production Execution Gate

```yaml
record_type: production_execution_gate
risk: A
status: approved_for_one_manual_dispatch_pending_environment_approval
release_unit: japan-runtime-config
identity_impact: true
production_state: not_deployed
```

## Scope

This record authorizes exactly one manual invocation of the protected Japan
runtime-config additive-repair workflow. The dispatching account is
`gccltdco-cmd`; the protected Environment reviewer is `gaoyi1020-web` and must
approve the resulting deployment separately. A failed or cancelled run is not
retry authority.

## Frozen Inputs

- Gate basis: `japan-tuic-identity-additive-repair-20260724-003`.
- Execution gate: `github-actions-japan-tuic-additive-repair-20260724-002`.
- Artifact source commit: `70880d83761b165e91e9c521ec480fcc840375fb`.
- Artifact run: `30092196734`.
- Candidate contract: add `3`, remove `0`, deferred remove `46`, changed `0`,
  missing material `0`, projected map `82`.

## Fresh Aggregate Preflight

Two consecutive read-only snapshots produced the same aggregate identity
state: runtime `36`, mapped `33`, missing `3`, stale `46`, changed `0`, and
missing material `0`. The active service and usage-collector timer were stable,
the bound helper matched the frozen artifact source, and the dedicated
forced-command authorization remained singular and restricted.

## Required Execution and Closeout

The workflow must independently reproduce its two stable pre-apply snapshots
before creating a backup or applying the additive map. It must not restart,
enable, disable, or manually invoke the collector timer. A non-success receipt
stops the gate.

After either apply or rollback, the forced command must revoke only its marked
host authorization and remove Gate-owned temporary material. The five temporary
Environment connection secrets must then be deleted and their absence read back.
This source record does not itself dispatch a workflow, apply a map, restart a
service, alter retention, or claim a successful repair.
