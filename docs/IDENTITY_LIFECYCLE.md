# Runtime Identity Binding Lifecycle

> Status:
> - Type: Active release-governance contract
> - Risk: C
> - Production impact: None
> - Execution authority: None
> - Applies to: Identity-impacting source changes and runtime change records

## Purpose

This document defines the lifecycle and release gate for a runtime identity
binding:

```text
runtime principal -> usage identity map -> edgeCredentialRef
```

The binding lets a collector attribute a runtime observation to the stable
business reference used by traffic accounting. This is not a user lifecycle,
credential-material lifecycle, subscription lifecycle, or new release unit.

## Data Boundaries

| Data | Role | Historical authority |
| --- | --- | --- |
| Runtime config | Current Xray or Mihomo principals accepted by a data plane | No |
| Usage identity map | Current runtime-principal to `edgeCredentialRef` resolver | No |
| Protected material store | Protected source used to construct current bindings | No |
| Traffic accounting ledger | Recorded usage facts keyed by stable references | Yes |
| Backup and Deploy Note | Auditable evidence for a runtime change | Yes |

The usage identity map is derived current state. Removing a stale map entry does
not delete traffic-accounting history. A stale entry must still pass a
retention review before removal because a residual connection or delayed
observation may continue to reference the old runtime principal.

## Release Boundary

Identity is a release impact dimension, not a deployable unit. Keep the fixed
release units in `RELEASE_MANIFEST.md`, including `japan-runtime-config` and
`sgp-runtime-config`. Do not add `runtime-identity` as a release unit.

Set `identity_impact: true` when a source change or runtime Change Record can
alter any of these relationships:

- Mihomo or TUIC runtime UUIDs;
- Xray runtime users or credential-to-user bindings;
- protected runtime identity maps or material-to-runtime mappings;
- node or proxy identities consumed by traffic collection;
- rendering or lifecycle behavior that changes the runtime principal set.

A source PR may merge with `identity_gate.state: pending` and
`production_state: not_deployed`. The production Identity Gate is evaluated
against the target runtime during the separately approved deployment or runtime
Change Record.

## Binding Lifecycle

```text
active
  |
  v
rotation_pending
  |
  v
stale_pending_retention
  |
  v
retired
```

| State | Meaning | Exit requirement |
| --- | --- | --- |
| `active` | The runtime principal exists, has protected material, and resolves through the current map. | A reviewed runtime rotation or retirement begins. |
| `rotation_pending` | Old and new principals may coexist during a controlled transition. Every principal that can still emit observations must remain resolvable. | The old principal is absent from current runtime and retention evidence is collected. |
| `stale_pending_retention` | The principal is absent from current runtime but remains in the active map while residual-connection and recent-observation risk is assessed. | A separate Risk A decision approves temporary retention or retirement. |
| `retired` | The principal is absent from current runtime and the active map. Historical usage remains in the ledger and change evidence. | No automatic reactivation; a new approved lifecycle starts. |

Lifecycle transitions never authorize config, map, service, timer, accounting,
quota, or traffic-supply mutation by themselves.

## Identity Gate Contract

An identity-impacting PR declares the impact without inventing production
facts:

```yaml
identity_impact: true
identity_gate:
  surface: <safe logical surface>
  state: pending
```

The production Deploy Note or Change Record records only aggregate before and
after evidence:

```yaml
identity_gate:
  surface: japan-tuic
  before:
    runtime_count: 0
    mapped_count: 0
    missing: 0
    stale: 0
    changed: 0
    missing_material: 0
  after:
    runtime_count: 0
    mapped_count: 0
    missing: 0
    stale: 0
    changed: 0
    missing_material: 0
  retention_state: not_required
  state: verified
```

Use a safe logical `surface`, such as `japan-tuic` or `sgp-vless`. Never put an
endpoint, UUID, credential reference, token, subscription URL, or customer
identifier in this metadata.

### Count Semantics

- `runtime_count`: unique principals present in the observed runtime config.
- `mapped_count`: runtime principals that have an entry in the current map.
- `missing`: runtime principals absent from the current map.
- `stale`: map principals absent from the current runtime config.
- `changed`: shared principals whose mapped reference differs from protected
  material.
- `missing_material`: runtime principals without valid protected material.

The gate must satisfy:

```text
runtime_count = mapped_count + missing
derived map count = mapped_count + stale
```

`changed` is a subset of `mapped_count`. Counts must be generated from one
stable read boundary; do not combine observations from different runtime
generations.

### Gate States

| State | Meaning |
| --- | --- |
| `not_required` | `identity_impact` is false. |
| `pending` | The production gate has not run or does not yet have stable evidence. |
| `verified` | `missing`, `stale`, `changed`, and `missing_material` are all zero after the change. |
| `degraded` | Runtime may be healthy, but one or more identity differences remain observable. Do not claim identity health or accounting completeness. |
| `blocked` | Material is missing, inputs are invalid, the snapshot is unsafe or unstable, or required validation cannot complete. |

An evidence producer reporting `degraded / mapping_unresolved` does not mean the
producer or runtime failed. It means the producer successfully observed an
identity gap.

### Retention States

Use one of:

```text
not_required
pending
retained_temporarily
approved_for_retirement
retired
```

Temporary retention requires a dated review gate. It does not change an
Identity Gate from `degraded` to `verified` while stale entries remain in the
active resolver map.

## Release Checklist

Before an identity-impacting production change:

1. Declare the existing release unit and safe logical identity surface.
2. Take a stable aggregate snapshot and record the before counts.
3. Back up the current protected map and its owner/mode metadata.
4. Generate a candidate without applying it.
5. Stop if material is missing, inputs are invalid, or identifiers would be
   exposed.

After the runtime change:

1. Observe the actual runtime principal set.
2. Recompute the aggregate gate from a stable read boundary.
3. Keep `state: degraded` when any difference remains.
4. For stale entries, complete a separate read-only retention inventory before
   approving removal.
5. Record the aggregate before/after gate in the Deploy Note or Change Record.
6. Validate collector, evidence projection, public/private boundaries, and the
   exact rollback target required by the approved change.

`missing > 0` means accounting completeness is at risk but not yet quantified:
an unmapped runtime observation may be omitted before it reaches the accounting
ledger. The Identity Gate does not automatically stop traffic, alter quota, or
repair the map.

## Security Boundary

Identity validation output is aggregate-only. It must not contain:

- runtime UUIDs or usernames;
- credential or material references;
- controller payloads;
- raw config or environment values;
- database rows, usage samples, or customer data;
- tokens, secrets, subscription material, or private logs.

Production inventory, retention review, map rebuild, apply, rollback, and
collector validation remain separate exact Risk A actions with explicit
operator approval.
