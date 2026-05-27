# Clean Edge Node Rebuild Preflight

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A read-only preflight record
Repository change: C / docs-only record
Gate: clean edge data-plane rebuild
Execution state: rebuild blocked until exact approval phrase
Production impact: none
Cloud/provider impact: read-only status checks only
DNS impact: none
Subscription-output impact: none
Edge traffic impact: none
Public Admin impact: none
```

This record refreshes the safe preflight evidence for:

```text
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md
```

No clean edge host was provisioned or assigned. No DNS, subscription output,
firewall, service, tenant, artifact, AWS lifecycle, or edge traffic mutation was
performed.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations / Edge Data Plane
Supporting units:
  Aliyun Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for exact-phrase clean edge rebuild execution
```

## Approval State

Short confirmation was received, but it is not sufficient for this A-tier gate.
Execution still requires the exact approval phrase from the runbook:

```text
Approve clean edge data-plane rebuild execution. Allow clean edge host provisioning, repo bootstrap, secret injection, and private edge validation only. No DNS change, no subscription output change, no user traffic, no public Admin, no AWS rollback-start, no stopped-node termination, and no security-group deletion.
```

Without that exact phrase, this preflight remains read-only.

## Fresh Read-Only Evidence

Repository state:

```text
branch before docs-only record: master...origin/master
working branch for record: codex/clean-edge-rebuild-preflight
latest master commit before record: 60cbf4b Merge pull request #219 from gaoyi1020-web/codex/channel-runtime-evidence-review
open PRs before record: none
project-state:check before record: passed
```

Local operator-device network caveat:

```text
Windows local resolver returned synthetic 198.18.0.44 / 198.18.0.51 answers.
Windows local direct TCP probes also reported impossible open ports on the
stopped AWS address.
Decision: local Windows DNS and TCP probes were treated as proxy-contaminated
and excluded as authoritative public-network evidence.
```

Authoritative AliDNS API summary:

```text
sub.globalcirclecat.com: A 47.251.178.125 TTL 600 ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159 TTL 600 ENABLE
```

Aliyun host remote-vantage DNS summary:

```text
sub.globalcirclecat.com: 47.251.178.125
ss-sg.globalcirclecat.com: 13.215.156.159
```

Aliyun public subscription-boundary checks from the Aliyun host vantage:

```text
https://sub.globalcirclecat.com/api/health: 200
https://sub.globalcirclecat.com/api/admin/platform/aliyun-gates: 404
https://sub.globalcirclecat.com/sub/clash.yaml without token: 401
https://sub.globalcirclecat.com/: 404
```

Aliyun host remote-vantage port summary:

```text
47.251.178.125:80: open
47.251.178.125:443: open
47.251.178.125:3456: closed_or_timeout
47.251.178.125:18080: closed_or_timeout
47.251.178.125:18388: closed_or_timeout
13.215.156.159:80: closed_or_timeout
13.215.156.159:443: closed_or_timeout
13.215.156.159:3456: closed_or_timeout
13.215.156.159:18080: closed_or_timeout
13.215.156.159:18388: closed_or_timeout
```

Stopped AWS Singapore nodes:

```text
prod-edge-a instance: i-0b7791340d3fedff5
prod-edge-a state: stopped
prod-edge-a public IP association: none
prod-edge-a security group: retained

prod-edge-b instance: i-0ad8676ee113d14cb
prod-edge-b state: stopped
prod-edge-b public IP association: none
prod-edge-b security group: retained

rollback-start status: separate A-tier gate required
termination / security-group deletion: not approved
```

Clean edge target:

```text
provider: not selected in this preflight
region: not selected in this preflight
instance id: none
public IP: none
private IP: none
OS image: not selected
management source posture: not selected
pre-existing data check: not applicable because no target is assigned
```

Repository edge-node materials:

```text
ops/edge-node/bootstrap.sh: present
ops/edge-node/nginx/proxy-gateway-public.conf: present
ops/edge-node/systemd/proxy-gateway-console.service: present
ops/edge-node/systemd/proxy-gateway-ss.service: present
ops/edge-node/templates/env.example: present
ops/edge-node/templates/proxy-servers.json.example: present
ops/edge-node/templates/ss-server.json.example: present
```

## Preflight Decision

```text
Aliyun subscription boundary: healthy
public Admin: blocked
no-token subscription refresh: blocked with 401
Aliyun private app ports 3456/18080: not reachable from Aliyun remote public-vantage
old AWS edge address: not serving from Aliyun remote public-vantage
prod-edge-a/prod-edge-b lifecycle: stopped, no public IP association
edge data-plane: not activated
clean edge target: not selected and not provisioned
execution readiness: blocked until exact approval phrase
```

The evidence supports requesting the clean edge rebuild execution gate if the
operator wants to restore replaceable edge data-plane capacity. The first
execution should remain limited to clean host provisioning or assignment, repo
bootstrap, edge-only secret injection without value recording, and private edge
validation. It must still keep DNS, subscription output, user traffic, public
Admin, AWS rollback-start, stopped-node termination, and security-group deletion
out of scope.

## Not Performed

```text
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
