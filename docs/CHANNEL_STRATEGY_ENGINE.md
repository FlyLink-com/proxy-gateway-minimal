# Channel Strategy Engine

> Status:
> - Type: Active repository contract
> - Risk: B for repository code and tests; A for runtime activation
> - Execution authority: Does not authorize node deployment, DNS, Nginx, systemd, tenant/artifact mutation, or traffic rollout
> - Production impact: None until a separate Risk A approval activates runtime config or edge nodes
> - Source of truth for: Subscription renderer node-pool selection and operator canary override semantics

## Scope

This document defines the repository-level channel strategy engine for
subscription rendering. It keeps Subscription V2 compatible while making the
default output set explicit and separating stable nodes from private, canary,
and recovery capacity.

The strategy engine is a static renderer contract. It is not live health
measurement, automatic traffic steering, provider orchestration, or production
rollout approval.

Repository-local measurement scoring can produce advisory `recommendedPool`
values from local benchmark summaries. Those recommendations remain operator
evidence. They do not automatically change subscription output or runtime node
configuration.

## Node Pools

Configured edge nodes may declare one of these pools:

```text
stable
private
canary
recovery
```

The default pool is `stable`. Missing or unknown pool metadata falls back to
`stable` so existing tracked config remains compatible. Role metadata can also
map common meanings:

```text
role=canary -> canary
role=private/operator/operator-private -> private
role=recovery/fallback -> recovery
```

## Default Subscription Output

For the default tenant node assignment, subscription output includes only
subscription-eligible nodes in the `stable` pool.

Stable nodes are ordered by `strategyPriority` ascending. If priorities are
equal or absent, repository config order is the tiebreaker.

This means private, canary, and recovery nodes can exist in tracked config
without being emitted to every default subscription refresh.

## Operator Override

Explicit operator node assignment remains a maintenance and canary control.
When a tenant is assigned to a specific eligible node, the subscription renderer
emits only that assigned node, even if the node is in `private`, `canary`, or
`recovery`.

This preserves the existing single-node canary behavior:

```text
default assignment -> stable pool set
explicit canary/private/recovery assignment -> assigned node only
```

## Inventory Summary Fields

Safe node summaries expose non-secret strategy metadata:

```text
channelPool
strategyPriority
canaryWeight
```

These fields are operator-facing metadata only. They must not expose passwords,
tokens, opaque artifact paths, cloud credentials, or customer data.

`canaryWeight` is reserved metadata for later measured rollout design. The
current renderer does not perform weighted distribution.

## Measurement Scoring Input

`scoreChannelBenchmarkSummary(...)` converts redacted local benchmark summaries
into advisory channel quality records:

```text
channelScore
qualityTier
recommendedPool
reasonCodes
```

The current subscription renderer does not consume these scores automatically.
An operator must still review the report and, for any runtime effect, use the
appropriate Risk A runbook and approval gate.

`buildChannelCandidateReport(...)` can combine dry-run config metadata with
measurement scores into grouped operator recommendations. The report is safe
for review because it omits hosts, ports, credentials, raw errors, tokens, and
subscription URLs. It is still advisory evidence only.

`buildChannelDecisionPack(...)` can turn the dry-run summary and measurement
score into an operator decision artifact that identifies the selected baseline,
canary candidates, private candidates, hold blockers, missing measurement
blockers, and the required next action. Decision packs remain advisory only and
do not authorize runtime canary, server, firewall, DNS, or subscription output
changes.

`assessChannelExtendedMeasurement(...)` can classify already-collected local
benchmark summaries into `ready_for_decision`, `needs_extended_measurement`, or
`hold_for_investigation`. This closes the repository-side gap between short
smoke samples and longer measurement evidence, but it remains advisory only and
does not activate node config or rollout behavior.

## Distribution Readiness

Subscription overview distribution readiness is based on the default stable
pool. Nodes outside `stable` are counted as blocked for default distribution,
even when they are individually eligible for explicit operator assignment.

Readiness answers:

```text
Can a default subscription render a stable node set?
```

It does not answer:

```text
Is a canary node ready for all users?
Is a private node production-ready?
Is a recovery node safe to promote?
```

Those remain Risk A runtime questions.

## Non-Goals

This repository contract does not implement or approve:

```text
live node health measurement
automatic carrier or path detection
weighted traffic rollout
DNS changes
Nginx or systemd changes
AWS or Aliyun mutation
runtime protocol deployment
tenant or artifact production migration
all-user canary rollout
traffic accounting or quota enforcement
```

## Validation

Repository validation for this contract is covered by:

```powershell
node --test server/tests/subscription-service.test.mjs
node --test server/tests/subscription-architecture-contract.test.mjs server/tests/clash-subscription.test.mjs server/tests/admin-subscriptions.test.mjs
npm test
```

Production activation still requires the relevant Risk A runbook and separate
operator approval.
