# Aliyun Next A-Tier Execution Packet

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution handoff packet
Current PR scope: C / repo-only documentation
Production impact in this PR: none
Aliyun impact in this PR: none
AWS impact in this PR: none
DNS impact in this PR: none
Traffic impact in this PR: none
```

This packet is the operator handoff for the next Aliyun subscription-control
execution gates. It connects the completed repository packages to the two
standalone Risk A runbooks that can be requested next.

It does not approve either gate. It also does not execute SSH, cloud, DNS,
firewall, Nginx, systemd, SQLite, state-copy, user-traffic, or edge-traffic
changes.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Recommended next owner: Production Operations Agent
Follow-up agent suitability:
  high for a dedicated A-tier execution agent after exact approval phrase
  high for a separate reviewer agent before any mutation
```

## Current Baseline

The repository side of the Aliyun Subscription Control Platform MVP has reached
the point where the next work is operationally gated:

```text
Aliyun clean-start plan: documented
clean-start repo package: implemented
protected gate decision packet: implemented
protected gate evidence shell: implemented
Admin Overview gate review surface: implemented
HP manual CI lane: available for repository validation
GitHub-hosted Actions: still blocked by hosted-runner startup failure
```

Current durable source docs:

```text
docs/goals/2026-05-26-aliyun-subscription-control-platform-mvp.md
docs/ALIYUN_USER_SUBSCRIPTION_DISTRIBUTION_RUNBOOK.md
docs/production-replacement-records/2026-05-27-aliyun-clean-start-control-plane-plan.md
docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md
```

## Approval Rule

Short confirmations such as these are not approval:

```text
同意
继续
可以
开始
ok
go
```

Only the exact runbook phrase for a named gate is approval. If the operator
approves one gate, execute only that gate. Do not infer approval for the other
gate, a public-boundary dry run, DNS promotion, edge rebuild, or rollback-start.

## Gate 1: Clean-Start Private Validation

Use this gate when the operator wants to prove Aliyun can privately initialize
candidate-only subscription-control state and render subscription output without
copying historical AWS state.

Runbook:

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-runbook.md
```

Exact approval phrase:

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Execution record target:

```text
docs/production-replacement-records/YYYY-MM-DD-aliyun-clean-start-private-validation-execution.md
```

Minimum proof before mutation:

```text
operator repo commit and clean/dirty status recorded
Aliyun host identity and OS summary recorded
candidate app loopback health recorded
candidate Nginx loopback health recorded
host listener summary recorded
UFW summary recorded
provider firewall posture summary recorded without raw sensitive material
candidate SQLite integrity_check result recorded without row dumps
candidate backup presence recorded by safe metadata only
AliDNS current subscription records recorded
HP-side public checks show Aliyun 80/443/3456/18080 closed
private Admin boundary check remains protected
rollback or cleanup choice selected before state mutation
```

Allowed only after the exact phrase:

```text
create candidate backup before validation
initialize candidate-only clean-start state
run protected clean-start readiness checks
run private subscription rendering dry-run checks
verify candidate SQLite integrity after validation
create candidate backup after validation if retaining candidate-only state
record rollback or cleanup decision
```

Not allowed in this gate:

```text
DNS change
public 80/443 promotion
public Admin exposure
public listener exposure
provider firewall mutation
AWS mutation
edge traffic
historical SQLite, artifact, query-token, or subscription-output state copy
customer-facing announcement
all-user rollout
raw sensitive output in logs or docs
```

## Gate 2: Provider-Firewall Hardening

Use this gate when the operator wants to reduce Aliyun provider-level inbound
rules to least-privilege posture before any future public-boundary dry run.

Runbook:

```text
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md
```

Exact approval phrase:

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
```

Execution record target:

```text
docs/production-replacement-records/YYYY-MM-DD-aliyun-provider-firewall-hardening-execution.md
```

Minimum proof before mutation:

```text
operator repo commit and clean/dirty status recorded
current provider firewall inbound summary recorded
exact rollback copy of provider firewall rules captured privately
Aliyun host listener summary recorded
host UFW status summary recorded
candidate app loopback health recorded
candidate Nginx loopback health recorded
SSH management source decision recorded
wg-home keep / scope / remove decision recorded
HP-side public checks recorded for 80/443/3456/18080 and selected lab ports
AliDNS current subscription records recorded
```

Allowed only after the exact phrase:

```text
apply provider firewall rule changes needed for target posture
retain or scope SSH management access according to the recorded source decision
retain, scope, or remove wg-home UDP only according to the recorded decision
run post-change reachability checks
record rollback instructions and rollback evidence
```

Not allowed in this gate:

```text
DNS change
Nginx public promotion
public Admin exposure
production authority transfer
state copy
SQLite restore/import
subscription output mutation
edge traffic
AWS mutation
service deployment
opening 3456 or 18080 publicly
opening 80 or 443 unless a separate public-boundary approval is explicitly in scope
raw sensitive output in logs or docs
```

## Gate Ordering

The two gates are independent but must not be silently combined.

Recommended order if the operator approves both in one maintenance window:

```text
1. Refresh read-only inventory for both gates.
2. Execute provider-firewall hardening first, because it reduces public-boundary risk.
3. Confirm SSH management remains reachable and candidate loopback services remain healthy.
4. Execute clean-start private validation.
5. Record two separate execution records and two separate not-performed lists.
```

Recommended order if the operator approves only one:

```text
clean-start phrase only:
  run only clean-start private validation
  do not mutate provider firewall
  keep public-boundary dry run blocked

provider-firewall phrase only:
  run only provider-firewall hardening
  do not initialize candidate-only subscription state
  keep clean-start private validation blocked
```

## Evidence Handling

Execution records may include safe metadata:

```text
status labels
hostnames already documented as candidate names
service active/inactive summaries
listener port summaries
boolean posture checks
HTTP status codes
SQLite integrity_check result only
backup filenames and sizes
redacted gate packet summaries
```

Execution records must not include:

```text
.env values
tokens
subscription URLs
opaque artifact paths or raw artifact references
private keys
WireGuard keys
raw portal URLs
node credentials
SQLite rows
customer emails
organization names
cloud credentials
unredacted logs
```

## Completion Criteria

This handoff packet is complete when:

```text
the two next approval phrases are copied exactly from their runbooks
the two execution record target paths are named
the non-goals prevent approval scope drift
the recommended single-gate and two-gate execution orders are explicit
the packet is linked from the docs index, project context, and project-state
```

## Current PR Not Performed

This repo-only PR does not perform:

```text
Aliyun SSH command execution
Aliyun cloud command execution
candidate state initialization
backup or restore
SQLite mutation
provider firewall mutation
UFW mutation
Nginx mutation
DNS change
AWS mutation
state copy
traffic movement
secret, token, subscription URL, key, or customer-data handling
```
