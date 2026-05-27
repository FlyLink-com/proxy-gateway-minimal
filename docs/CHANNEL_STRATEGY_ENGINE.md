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

`buildChannelRuntimeInventorySummary(...)` normalizes operator-provided runtime
gate facts into a safe repository artifact before they are consumed by the
registry. It accepts only summary fields such as candidate name, protocol,
target label, lifecycle status, deployment readiness, blocker codes, and the
next gate. It rejects raw hosts, ports, URLs, credentials, tokens, raw logs, and
subscription URLs.

```bash
npm run channel:runtime-inventory-summary -- <path-to-safe-inventory-input.json>
```

`buildChannelRuntimeRegistry(...)` can then combine the decision-pack path with
that safe runtime inventory summary. This is the first repository-level
integration layer between channel measurement evidence and runtime lifecycle
evidence:

```text
dry-run config summary
  -> measurement score
  -> decision pack
  -> runtime inventory summary
  -> channel runtime registry
  -> runtime gate packet
  -> channel system decision flow
```

The registry distinguishes canary-ready candidates from runtime-blocked
candidates and candidates that still lack runtime inventory. It remains
operator evidence only: it does not run probes, download protocol runtimes,
deploy services, change firewall rules, or activate subscription output.

`buildChannelRuntimeGatePacket(...)` converts the registry into an
operator-facing gate packet that says whether a candidate is ready to request a
separate Risk A runtime canary approval, blocked by runtime inventory, or still
missing inventory. It marks approval-ready candidates with the generic
`risk_a_channel_runtime_canary` gate, but it does not submit approval phrases,
create servers, deploy runtimes, move traffic, or authorize rollout.

```bash
npm run channel:runtime-gate-packet -- <path-to-runtime-registry.json>
```

`buildChannelSystemDecisionFlow(...)` wraps the safe repository chain end to
end. It accepts a dry-run summary, measurement score, and safe runtime
inventory input, then emits the normalized runtime inventory summary, runtime
registry, runtime gate packet, and top-level system readiness in one operator
artifact:

```bash
npm run channel:system-decision-flow -- <path-to-dry-run-summary.json> <path-to-score.json> <path-to-safe-inventory-input.json>
```

The system decision flow is still advisory evidence. It does not contact edge
nodes, run probes, submit approval phrases, deploy runtimes, change firewall
rules, move traffic, or approve subscription output.

The same decision flow is also available through the protected Admin platform
route `POST /api/admin/platform/channel-system-decision-flow` for operator
review surfaces that need to submit already-collected safe evidence and receive
one readiness packet. The route is not public and does not add any execution
control; it only returns the same redacted advisory evidence as the local
builder.

The Admin Overview contains the first protected UI integration for that route.
It lets operators submit a safe channel evidence packet and inspect flow status,
required next action, canary-ready count, and runtime blocker count. It does
not expose runtime execution, approval submission, DNS, firewall, traffic, or
subscription-output controls.

`buildChannelRuntimeEvidenceBridge(...)` adds a repository-local bridge between
operator-collected runtime evidence and the system decision flow. It accepts
only safe read-only check booleans, blocker codes, candidate labels, protocol
names, target labels, and next-gate labels; it then creates the runtime
inventory input and full channel system readiness artifact in one step:

```bash
npm run channel:runtime-evidence-bridge -- <path-to-dry-run-summary.json> <path-to-score.json> <path-to-safe-runtime-evidence.json>
```

The bridge is still advisory evidence. It does not inspect live hosts, contact
edge nodes, query cloud APIs, run probes, deploy runtimes, change firewall
rules, submit approval phrases, move traffic, or change subscription output.

The same bridge is available through the protected Admin platform route
`POST /api/admin/platform/channel-runtime-evidence-bridge` and an Admin
Overview review panel. Operators can paste the same safe runtime evidence
bridge packet and receive the normalized runtime inventory input plus channel
system readiness artifact without using the local CLI. This protected surface
still does not expose approval submission, runtime deployment, DNS, firewall,
traffic, or subscription-output controls.

`assessChannelExtendedMeasurement(...)` can classify already-collected local
benchmark summaries into `ready_for_decision`, `needs_extended_measurement`, or
`hold_for_investigation`. This closes the repository-side gap between short
smoke samples and longer measurement evidence, but it remains advisory only and
does not activate node config or rollout behavior.

`buildChannelExtendedMeasurementReport(...)` can combine multiple local
benchmark summary windows into a safe extended measurement report. It answers
whether a candidate has enough independent measurement windows to move toward a
decision pack, still needs more observation, or should be held for
investigation. The report omits hosts, ports, credentials, raw errors, tokens,
and subscription URLs, and it does not collect measurements by itself.

`buildChannelMeasurementBundleReport(...)` can wrap a manifest of local
measurement windows and their already-collected summaries into a safe bundle
report. The manifest lets operator-collected evidence keep stable run IDs,
candidate-set labels, and window IDs without emitting local file paths,
subscription material, endpoints, credentials, raw errors, or notes. Bundle
reports remain repository evidence only; they do not create measurements or
activate runtime nodes.

`buildChannelMeasurementInvestigationReport(...)` can consume a safe bundle
report and classify the observed hold pattern into operator-review labels such
as `sustained_tail_latency`, `isolated_tail_spike`,
`reliability_failure`, or `insufficient_evidence`. The investigation report
adds a safe `rolloutRecommendation` and `nextAction`, but it remains advisory:
it does not run probes, mutate configs, deploy runtime protocols, change DNS,
or approve broader rollout.

`buildChannelCandidateComparisonPlan(...)` can combine an investigation report
with a dry-run config summary to identify safe next comparison candidates after
a hold result. For example, when Hysteria2 is held for latency investigation,
the plan can list TUIC and VLESS/XUDP candidates as advisory comparison options
while keeping the held Hysteria2 candidate out of rollout. Comparison plans do
not run probes, contact servers, deploy runtimes, change subscription output,
or approve any Risk A canary.

Redacted historical bundle fixtures may live under
`docs/channel-measurement-bundles/` when they only contain aggregate
measurement evidence. These fixtures are useful for regression testing the
repository tools against real canary evidence, but they are not runtime
configuration and must remain free of hosts, ports, credentials, tokens,
subscription URLs, raw logs, and customer data. Short-canary fixtures must not
be described as extended-measurement-ready when they do not meet the configured
window or sample thresholds.

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
