# Security Hardening Review: Temporary Control-Plane Artifact Ingress

## Evidence Basis

I reviewed the canonical production design and implementation program together
with the two artifact-producing workflows and the existing fixed-purpose Japan
repair channel. The evidence is identified in [context.md](context.md) and
bound in [hardening.json](hardening.json). The important distinction is that
the current GitHub workflows can build and preserve reviewable bytes, but they
do not supply an approved host delivery authority.

The redacted read-only production inventory also shows why treating the
repository deploy key as a general delivery key would be a category error.
Repository read access and an Actions-artifact receiving boundary have different
authorization, retention, and audit needs.

## Constraints

- This record is selected-direction-only and has zero external writes.
- The existing full-Sigstore owner, lock postverification, offline-closure, and
  explicit Risk A resume holds remain in force.
- The existing Japan runtime-config repair channel remains purpose-bound and
  cannot carry generic deployment artifacts.
- A future transfer may use one new low-privilege account and a forced command,
  but no shell, TTY, forwarding, scp, rsync, or ambient repository write.
- The bounded payload is a matched source/dependency pair plus manifest and
  checksum, totals at most 64 MiB, and expires after 24 hours.
- No raw secret, private key, host address, customer material, configuration,
  database content, or remote command output belongs in a receipt or PR.

## Opportunity Portfolio

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| Constrain a future Actions-to-host delivery edge | T01-T06: supply-chain hold, artifact-only workflows, and purpose-bound repair SSH | 1. retain no ingress; 2. temporary forced-command ingress | Record Option 2 as a future Gate candidate while Option 1 remains active until every independent prerequisite is green | [Temporary bounded ingress](proposals/temporary-artifact-ingress.md) |

## Recommendation Summary

I recommend recording **Option 2: temporary bounded ingress** as the topology
direction. Its attraction is that it makes the delivery authority small and
auditable: a protected manual workflow can present an exact artifact set to a
single receiver that validates identity and digest before it has any durable
effect. It does not ask the existing repair channel to become a generic
administrator, and it leaves service activation to a later, separate gate.

That recommendation is conditional. It does not select an SSH implementation,
create a key, or authorize the first transfer. Option 1 remains the active
behavior until the owner/closure/resumption chain and the dedicated ingress
execution Gate are both green. If the temporary route cannot meet the exact
bounded-receiver and expiry requirements, we should retain Option 1 rather than
relaxing the legacy production SSH channel.

## Next Decisions

- Review this docs-only addendum as a Draft PR; merging it records only the
  topology direction.
- If the underlying supply-chain and resume prerequisites later become green,
  request a fresh, exact Risk A execution Gate using the receipt schema in
  [the Gate](gates/temporary-artifact-ingress-execution-gate.md).
- Only that later approval may create a protected Environment secret, a
  temporary host identity, a receiver, or source/workflow implementation.
- After disposable validation, request a separate promotion decision before any
  candidate release pointer or system service is touched.
