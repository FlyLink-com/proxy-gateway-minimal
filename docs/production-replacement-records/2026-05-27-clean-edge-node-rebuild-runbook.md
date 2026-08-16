# Clean Edge Node Rebuild Runbook


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: clean_edge_node_rebuild_runbook
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A runbook / execution gate
Gate: clean edge data-plane rebuild
Current execution state: not approved, not executed
Production impact of this document: none
Repo impact of this document: runbook only
```

This runbook defines the next clean edge data-plane rebuild gate after Aliyun
became the public subscription-distribution boundary. It does not create a
server, mutate cloud resources, start services, copy secrets, change DNS,
change subscription output, activate edge traffic, terminate stopped nodes, or
repair Aegis by itself.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations / Edge Data Plane
Supporting units:
  Aliyun Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Recommended executor: Production Operations Agent
Recommended reviewer: Project Gatekeeper / Security Reviewer
```

## Current Facts To Verify Before Execution

Before using this runbook for execution, refresh every fact live. The facts
below describe the current documented state at the time this runbook was added:

```text
sub.globalcirclecat.com:
  currently promoted to the Aliyun public subscription-distribution boundary

ss-sg.globalcirclecat.com:
  intentionally unchanged and still points to the old AWS stopped address

edge traffic:
  not activated

AWS Singapore prod-edge-a / prod-edge-b:
  stopped with accepted outage
  no Elastic IP association retained after stop
  rollback-start remains a separate gate

current Aliyun server:
  subscription-control / subscription-distribution boundary
  not an edge traffic node

HP:
  manual CI and operator lab
  not production, not staging, not an edge node

repo build materials:
  ops/edge-node/ contains provider-neutral edge-node bootstrap material
```

The current production split means the clean edge rebuild must be treated as
new replaceable data-plane capacity. It is not a rollback of the stopped AWS
nodes, not a mutation of the Aliyun subscription-control host into an edge
proxy, and not an HP production role.

## Exact Approval Phrase

Execution requires this exact approval phrase:

```text
Approve clean edge data-plane rebuild execution. Allow clean edge host provisioning, repo bootstrap, secret injection, and private edge validation only. No DNS change, no subscription output change, no user traffic, no public Admin, no AWS rollback-start, no stopped-node termination, and no security-group deletion.
```

Short confirmations such as `同意`, `继续`, `开始`, `ok`, or `go` do not
authorize this gate.

## Allowed Scope After Exact Approval

Only after the exact approval phrase is received, this gate may perform:

```text
choose one clean edge target host or provision one clean edge target host
name the target using provider-neutral edge identity, usually prod-edge-a-rebuild or prod-edge-c
install reviewed repo materials under /opt/proxy-gateway-minimal
run ops/edge-node/bootstrap.sh --apply
create runtime config from reviewed templates
inject approved edge-only secrets without recording secret values
start edge services only for private validation
validate local app health, Nginx boundary, systemd state, and Shadowsocks listener
validate from HP/operator vantage that only the intended edge ports are reachable
record safe aggregate evidence in a dated execution record
```

The target edge host should be clean:

```text
no production SQLite copied by default
no customer data copied by default
no historical artifact state copied by default
no CI residue
no public Admin exposure
no control-plane authority
no payment/billing/CRM role
```

## Explicitly Not Authorized

This gate does not authorize:

```text
DNS changes
ss-sg.globalcirclecat.com mutation
sub.globalcirclecat.com mutation
subscription output change
tenant reassignment
artifact issuance
public Admin exposure
user traffic
all-user rollout
AWS rollback-start
starting stopped prod-edge-a or prod-edge-b
terminating stopped instances
deleting security groups
copying historical AWS SQLite state
copying production .env into Git, PRs, docs, or chat
recording raw SS_PASSWORD, CONSOLE_TOKEN, subscription URLs, YAML, private keys,
  cloud credentials, exact management-source IPs, SQLite rows, or customer data
Aegis repair
current Aliyun subscription-control host conversion into an edge proxy
```

Any of those actions requires a separate exact-phrase A-tier gate and a separate
execution record.

## Preflight Checklist

Run fresh read-only preflight immediately before execution:

```text
Repository:
  git status --short --branch
  latest master commit
  open PR list
  docs/PROJECT_CONTEXT.md current snapshot

Aliyun subscription boundary:
  public /api/health
  public Admin path is blocked
  public no-token subscription path is rejected
  sub.globalcirclecat.com authoritative DNS

Edge DNS:
  ss-sg.globalcirclecat.com authoritative DNS
  current subscription output safe summary, without raw URLs or YAML

Stopped AWS nodes:
  instance state
  public IP association
  security-group retention
  rollback-start status

New clean edge target:
  provider account / region / instance shape
  inbound rule plan
  host OS image
  SSH management source plan
  no pre-existing production data

Repo materials:
  ops/edge-node/bootstrap.sh present
  ops/edge-node/systemd templates present
  ops/edge-node/nginx template present
  ops/edge-node/templates present
```

Stop before mutation if any of these checks contradict the expected boundary:

```text
public Admin is reachable
sub.globalcirclecat.com is not on Aliyun as expected
ss-sg.globalcirclecat.com already points to an unexpected live edge target
the intended clean host is not clean
the operator asks to copy unredacted secrets through chat/docs/PR
the task turns into rollback-start or node termination
```

## Execution Outline

Use a dated execution record copied from:

```text
docs/production-replacement-records/templates/clean-edge-node-rebuild-execution-template.md
```

Execution order:

```text
1. Record exact approval phrase.
2. Record fresh read-only preflight.
3. Provision or assign the clean edge host.
4. Apply provider firewall rules for management and private validation only.
5. Install Node.js runtime according to the existing project baseline.
6. Place the reviewed repository checkout at /opt/proxy-gateway-minimal.
7. Run sudo bash ops/edge-node/bootstrap.sh --apply.
8. Create runtime files from templates.
9. Inject approved edge-only secrets without recording secret values.
10. Start edge services only for private validation.
11. Validate local systemd, Nginx, app health, and Shadowsocks listener.
12. Validate from HP/operator vantage.
13. Keep DNS and subscription output unchanged.
14. Record safe evidence and stop before traffic activation.
```

## Expected Private Validation Evidence

Record only safe summaries:

```text
repo commit installed:
bootstrap result:
Node/npm versions:
npm ci result:
admin build result:
systemd services:
nginx -t:
local /api/health:
local public-boundary /api/health:
local Admin path:
local no-token subscription path:
Shadowsocks listener summary:
HP/operator port summary:
provider firewall summary:
UFW summary:
secret audit:
DNS unchanged:
subscription output unchanged:
```

Expected public-boundary behavior if HTTP boundary is tested on the edge host:

```text
/api/health -> 200
/api/admin/* -> blocked
/sub/clash.yaml without token -> 401
/ -> blocked
3456 and 18080 -> private
```

The first rebuild may be edge-data-plane only. If the edge host does not need
to serve subscription HTTP paths, record that explicitly and validate only the
intended edge data-plane ports.

## Rollback / Stop Posture

For this gate, rollback means:

```text
stop newly started edge services
close temporary provider firewall rules added by this execution
leave DNS unchanged
leave subscription output unchanged
do not start stopped AWS nodes unless rollback-start is separately approved
do not terminate the clean edge host unless termination is separately approved
```

If the clean edge host is provisioned but not accepted, record it as:

```text
clean edge candidate rejected / retained stopped for review
```

or:

```text
clean edge candidate rejected / cleanup approval required
```

Do not silently delete the host or security group without a separate approval.

## Next Gate After A Successful Rebuild

A successful private rebuild does not activate edge traffic. The next gate must
be one of:

```text
edge subscription-output canary
ss-sg.globalcirclecat.com DNS migration
controlled edge traffic activation
clean edge rollback/cleanup
legacy stopped-node termination/security-group cleanup
```

Each must have its own exact approval phrase, execution record, and rollback
plan.
