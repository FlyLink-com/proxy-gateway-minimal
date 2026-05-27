# Aliyun Public Boundary Dry Run Execution Record

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun public-boundary dry run
Execution state: passed and cleaned up
Production impact: none
Aliyun impact: temporary HP-scoped 80/443 public-boundary validation only
AWS impact: none
DNS impact: none
Traffic impact: no user traffic
```

This execution follows the candidate posture recorded in:

```text
docs/production-replacement-records/2026-05-27-aliyun-clean-start-private-validation-execution.md
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md
docs/production-replacement-records/2026-05-27-aliyun-hp-management-source-firewall-execution.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Operator Lab
  Validation / CI
Follow-up owner: Production Operations Agent
Follow-up suitability: high for DNS promotion planning after explicit approval
```

## Approval

Approval basis:

```text
The operator clarified that the Aliyun candidate is not online and
candidate-environment operations are approved as test operations. The dry run
was intentionally limited to temporary HP-scoped public-boundary validation and
cleanup, while DNS, user traffic, production authority, AWS mutation, and
irreversible cloud-resource deletion remain separate approval gates.
```

This execution did not treat the following as approved:

```text
DNS change
durable public 80/443 exposure
public Admin exposure
production authority transfer
state copy
SQLite restore/import
subscription output mutation
edge traffic activation
AWS mutation
user traffic
opening 3456 or 18080 publicly
copying secrets or credentials
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
repo branch: codex/aliyun-clean-start-private-validation
PR: #196
PR state before execution: ready / mergeable
Aliyun instance state: Running
provider firewall before this execution:
  22/tcp: current operator management /32 and HP public /32
  51820/udp: current operator management /32 and HP public /32
  80/tcp: absent
  443/tcp: absent
candidate app service: active
candidate Nginx service: active
host UFW: active
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
candidate Nginx loopback Admin path: HTTP 404
HP public checks before this gate:
  80/tcp: closed_or_timeout
  443/tcp: closed_or_timeout
  3456/tcp: closed_or_timeout
  18080/tcp: closed_or_timeout
Nginx preflight:
  existing candidate Nginx listened only on 127.0.0.1:18080
  existing public 80/443 listeners were absent
```

## Executed Temporary Dry-Run Changes

```text
provider firewall:
  created temporary 80/tcp and 443/tcp rules
  immediately scoped both temporary rules to HP public /32 before enabling
  the public Nginx listener
host UFW:
  allowed HP public /32 to 80/tcp and 443/tcp
Nginx:
  staged a temporary dry-run public-boundary config on 0.0.0.0:80 and
  0.0.0.0:443
  used a temporary one-day self-signed certificate for HTTPS boundary testing
  proxied only /api/health to the loopback candidate app
  returned 404 for /api/admin/* and /
  ran nginx config test before reload
```

The temporary 443 listener was not a production TLS setup. It existed only to
prove the Nginx public-boundary behavior over HTTPS without DNS promotion or
certificate issuance.

## Dry-Run Validation

HP-side external checks during the temporary window:

```text
80/tcp: open
443/tcp: open
3456/tcp: closed_or_timeout
18080/tcp: closed_or_timeout
HTTP /api/health: 200
HTTP /api/admin/subscriptions: 404
HTTP /: 404
HTTPS /api/health: 200
HTTPS /api/admin/subscriptions: 404
HTTPS /: 404
```

Aliyun local checks during the temporary window:

```text
proxy-gateway-candidate service: active
nginx service: active
ufw service: active
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
public-boundary local Admin path: HTTP 404
public-boundary local HTTPS Admin path: HTTP 404
```

Decision:

```text
Gate D dry-run result: passed
Nginx public boundary can expose health while blocking Admin and non-whitelisted
paths
3456 and 18080 remained private during the public-boundary window
```

## Cleanup And Post-Change Validation

Cleanup performed in the same execution window:

```text
deleted temporary provider firewall 80/tcp and 443/tcp rules
removed temporary Nginx public-boundary dry-run config
removed temporary self-signed certificate and key
tested Nginx config
reloaded Nginx
removed temporary UFW 80/tcp and 443/tcp HP allow rules
```

Post-cleanup validation:

```text
provider firewall final state:
  22/tcp: current operator management /32 and HP public /32
  51820/udp: current operator management /32 and HP public /32
  80/tcp: absent
  443/tcp: absent
HP-side public check 80/tcp: closed_or_timeout
HP-side public check 443/tcp: closed_or_timeout
HP-side public check 3456/tcp: closed_or_timeout
HP-side public check 18080/tcp: closed_or_timeout
HP-side management check 22/tcp: open
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
candidate Nginx loopback Admin path: HTTP 404
AliDNS sub.globalcirclecat.com: unchanged
AliDNS ss-sg.globalcirclecat.com: unchanged
```

## Rollback

The dry run was cleaned up before this record was finalized. If rollback is
needed for residual drift, restore this post-cleanup posture:

```text
delete any 80/tcp or 443/tcp provider-firewall rule for this candidate
remove /etc/nginx/sites-enabled/proxy-gateway-public-boundary-dry-run.conf
remove temporary dry-run certificate files if present
run nginx config test and reload Nginx
delete temporary UFW 80/tcp and 443/tcp HP allow rules if present
verify HP sees 80/443/3456/18080 closed_or_timeout
verify loopback app and Nginx health remain HTTP 200
verify AliDNS is unchanged
```

Rollback must not require DNS changes, AWS node restart, source-state copy, or
production traffic movement.

## Not Performed

```text
DNS change: not performed
durable public 80/443 exposure: not performed
public Admin exposure: not performed
production authority transfer: not performed
state copy: not performed
SQLite restore/import: not performed
subscription output mutation: not performed
edge traffic activation: not performed
AWS mutation: not performed
opening 3456 or 18080 publicly: not performed
user traffic: not performed
certificate issuance: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed and cleaned up
effective final public posture: public 80/443/3456/18080 closed
validated dry-run boundary: /api/health can be exposed through Nginx while
Admin and root paths return 404
next gate recommendation: DNS promotion planning remains separate and should
decide whether to re-open 80/443 durably as part of promotion
```

## Sensitive Output Audit

The execution record contains none of:

```text
.env values
tokens
subscription URLs
private keys
WireGuard keys
SQLite rows
customer data
cloud credentials
exact management source IPs
unredacted logs
```
