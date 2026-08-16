# Clean Edge Rebuild Execution Handoff


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: clean_edge_rebuild_execution_handoff
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution handoff packet
Repository change: C / docs-only
Gate: clean edge data-plane rebuild
Execution state: blocked until exact approval phrase
Production impact: none
Cloud/provider impact: none
DNS impact: none
Subscription-output impact: none
Edge traffic impact: none
Public Admin impact: none
```

This handoff packet converts the clean edge rebuild runbook and read-only
preflight into an execution-ready task packet. It does not provision a host,
assign a host, change provider firewall rules, bootstrap a remote host, inject
secrets, start services, change DNS, change subscription output, activate user
traffic, start stopped AWS nodes, terminate stopped nodes, or delete security
groups.

## Agent / Task Routing

```text
Lead agent: Codex
Primary execution unit: Production Operations / Edge Data Plane
Supporting units:
  Aliyun Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Recommended executor after approval: Production Operations Agent
Recommended reviewer: Project Gatekeeper / Security Reviewer
Follow-up suitability: high for exact-phrase clean edge rebuild execution
```

## Required Approval

Execution is still blocked. The next turn must contain this exact approval
phrase before any host provisioning, assignment, bootstrap, secret injection, or
private validation:

```text
Approve clean edge data-plane rebuild execution. Allow clean edge host provisioning, repo bootstrap, secret injection, and private edge validation only. No DNS change, no subscription output change, no user traffic, no public Admin, no AWS rollback-start, no stopped-node termination, and no security-group deletion.
```

Short confirmations such as `同意`, `继续`, `开始`, `ok`, or `go` do not
authorize execution.

## Current Evidence Inputs

Use these source records before execution, then refresh live facts again:

```text
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-preflight.md
docs/production-replacement-records/templates/clean-edge-node-rebuild-execution-template.md
ops/edge-node/README.md
```

Current documented posture:

```text
sub.globalcirclecat.com:
  promoted to Aliyun subscription-distribution boundary

ss-sg.globalcirclecat.com:
  unchanged on old AWS stopped address

prod-edge-a / prod-edge-b:
  stopped
  no public IP association
  security groups retained

current Aliyun server:
  subscription-control / subscription-distribution boundary
  not an edge traffic node

HP:
  manual CI / operator lab
  not production, not staging, not an edge node

clean edge target:
  not selected
  not provisioned
```

## Recommended Target Identity

Recommended logical edge identity for the first clean rebuild:

```text
prod-edge-c
```

Reasoning:

```text
prod-edge-c is the default provider-neutral recovery slot in ops/edge-node/README.md.
It avoids implying rollback-start or mutation of the stopped prod-edge-a host.
It avoids overloading the current Aliyun subscription-control host.
It avoids assigning HP a production edge role.
It preserves prod-edge-a/prod-edge-b as stopped historical slots until a separate
rollback-start or termination/security-group cleanup decision is made.
```

Use `prod-edge-a-rebuild` only if the operator explicitly wants the new clean
host to replace the old primary edge identity in naming, while still not
starting or mutating the stopped AWS primary.

## Execution Start Checklist

Before mutation, the executor must verify and record:

```text
git status --short --branch
latest master commit
open PR list
project-state:check result
AliDNS sub.globalcirclecat.com A record
AliDNS ss-sg.globalcirclecat.com A record
public health/Admin/no-token checks for sub.globalcirclecat.com
old AWS edge address non-serving status from a non-proxy-contaminated vantage
prod-edge-a/prod-edge-b stopped state and public IP association
selected provider account / region / shape
selected host OS image
management source plan without recording exact source IPs in docs or chat
repo edge-node materials present
```

Stop before mutation if any of these are true:

```text
the approval phrase is not exact
public Admin is reachable
sub.globalcirclecat.com is no longer on Aliyun as expected
ss-sg.globalcirclecat.com already points to an unexpected live edge target
the selected target is not clean
the task turns into AWS rollback-start
the task turns into stopped-node termination or security-group deletion
the operator asks to paste raw secrets, subscription URLs, YAML, private keys,
  cloud credentials, exact management-source IPs, SQLite rows, or customer data
```

## Execution Envelope After Approval

Allowed only after the exact approval phrase:

```text
select or provision one clean edge host
assign provider-neutral identity, recommended prod-edge-c
apply provider firewall rules required for management and private validation
install reviewed repo materials under /opt/proxy-gateway-minimal
run sudo bash ops/edge-node/bootstrap.sh --apply
create runtime files from reviewed templates
inject approved edge-only secrets without recording values
start edge services only for private validation
validate local app, Nginx, systemd, and edge listener behavior
validate from HP/operator vantage that only intended ports are reachable
record safe aggregate evidence in a dated execution record
```

Not allowed in this gate:

```text
DNS change
subscription output change
user traffic
public Admin exposure
AWS rollback-start
starting stopped prod-edge-a or prod-edge-b
stopped-node termination
security-group deletion
historical state copy
current Aliyun control-host conversion into edge proxy
HP production role assignment
artifact issuance
legacy query-token retirement
broader Aegis vendor-agent repair
```

## Execution Record Target

After exact approval, copy this template into a dated record before mutation:

```text
docs/production-replacement-records/templates/clean-edge-node-rebuild-execution-template.md
```

Recommended record name:

```text
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-execution.md
```

The execution record must include:

```text
exact approval phrase
fresh preflight evidence
selected target identity and safe provider summary
bootstrap evidence
secret-value non-recording audit
local validation evidence
operator/HP vantage validation evidence
DNS unchanged evidence
subscription output unchanged evidence
not-performed boundaries
rollback/stop evidence if needed
next gate recommendation
```

## Not Performed

```text
exact approval received: no
clean edge host provisioning: not performed
clean edge host assignment: not performed
provider firewall mutation: not performed
repo bootstrap on remote edge host: not performed
secret injection: not performed
service start/restart: not performed
DNS change: not performed
subscription output change: not performed
user traffic: not performed
public Admin exposure: not performed
AWS rollback-start: not performed
stopped-node termination: not performed
security-group deletion: not performed
historical state copy: not performed
raw secret/token/subscription URL/YAML/key/credential/customer data recording: not performed
```
