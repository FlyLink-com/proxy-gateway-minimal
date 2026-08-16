# Post-226 Clean Edge Live Check


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: post_226_clean_edge_live_check
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A read-only live-check record
Repository change: C / docs-only record
Gate: clean edge data-plane rebuild
Execution state: blocked until exact approval phrase
Production impact: none
Cloud/provider impact: read-only checks only
DNS impact: none
Subscription-output impact: none
Edge traffic impact: none
Public Admin impact: none
```

This record refreshes the public subscription-boundary and clean-edge gate
posture after PR #226 was merged. It does not provision a host, select a host,
change provider firewall rules, bootstrap a remote host, inject secrets, start
or restart services, change DNS, change subscription output, activate traffic,
start stopped AWS nodes, terminate stopped nodes, or delete security groups.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Project Gatekeeper / Production Operations
Supporting units:
  Aliyun Subscription Control Platform
  Edge Data Plane
  Subscription Access Control
  Validation / CI
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for exact-phrase clean edge rebuild execution
```

## Approval State

The operator provided a short confirmation after PR #226, but short
confirmations are still insufficient for this A-tier gate. Execution still
requires the exact approval phrase from:

```text
docs/production-replacement-records/2026-05-27-clean-edge-node-rebuild-runbook.md
```

Without that exact phrase, the gate remains read-only and blocked.

## Fresh Read-Only Evidence

Repository state:

```text
branch before record: master...origin/master
open PRs before record: none
latest master commit before record: a7e8a14 Merge pull request #226 from gaoyi1020-web/codex/fix-b27-task-status
project-state:check before record: passed
```

Local operator-device network caveat:

```text
Windows local resolver returned synthetic 198.18.0.44 / 198.18.0.51 answers,
including when explicit public DNS servers were requested through the local
resolver path.
Decision: local Windows DNS was treated as proxy-contaminated and excluded as
authoritative public-network evidence.
```

Aliyun host remote-vantage DNS summary:

```text
sub.globalcirclecat.com: 47.251.178.125
ss-sg.globalcirclecat.com: 13.215.156.159
```

Aliyun host remote-vantage public subscription-boundary checks:

```text
https://sub.globalcirclecat.com/api/health: 200
https://sub.globalcirclecat.com/api/admin: 404
https://sub.globalcirclecat.com/: 404
https://sub.globalcirclecat.com/sub/clash.yaml without token: 401
```

Aliyun host service state summary:

```text
proxy-gateway-candidate: active
nginx: active
certbot.timer: active
aegis.service: failed
```

The `aegis.service` state matches the prior tracked follow-up. It is not part
of the clean edge rebuild gate unless separately approved under its own Aegis
runbook.

## Live-Check Decision

```text
Aliyun subscription boundary: healthy
public Admin: blocked
no-token subscription refresh: blocked with 401
ss-sg edge DNS: unchanged on old AWS stopped address
edge data-plane: not activated
clean edge target: not selected and not provisioned
Aegis: still failed and remains a separate tracked follow-up
execution readiness: blocked until exact approval phrase
```

The evidence supports keeping the next executable edge-data-plane step as the
clean edge rebuild gate, limited to clean host provisioning or assignment, repo
bootstrap, edge-only secret injection without value recording, and private
edge validation after exact approval. DNS, subscription output, user traffic,
public Admin, AWS rollback-start, stopped-node termination, and security-group
deletion remain out of scope.

## Not Performed

```text
exact clean edge approval received: no
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
