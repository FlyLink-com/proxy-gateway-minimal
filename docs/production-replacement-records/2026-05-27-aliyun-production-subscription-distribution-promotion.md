# Aliyun Production Subscription Distribution Promotion Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_production_subscription_distribution_promotion
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun production subscription distribution promotion
Execution state: promoted with edge data-plane still pending
Production impact: subscription distribution boundary moved to Aliyun
Aliyun impact: durable public 80/443 subscription boundary, DNS, Nginx, HTTPS,
  UFW, provider-firewall, and candidate runtime configuration changes
AWS impact: none
Edge traffic impact: none
Public Admin impact: none
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Operator Lab
Follow-up owner: Production Operations Agent
Follow-up suitability: high for observation, rollback, Aegis follow-up, and
  clean edge rebuild planning
```

## Approval

Exact operator approval phrase:

```text
Approve Aliyun production subscription distribution promotion. Allow the documented DNS and public subscription-boundary changes only. No public Admin, no edge traffic activation, no unrelated node mutation, and rollback follows the recorded accepted-outage or rollback-start decision.
```

Scope accepted by this record:

```text
Allowed:
  documented DNS change for sub.globalcirclecat.com
  documented public subscription-boundary changes on Aliyun
  Nginx / HTTPS / UFW / provider-firewall changes required for that boundary
  candidate-only smoke tenant validation with immediate disable/cleanup

Not allowed:
  public Admin exposure
  edge traffic activation
  ss-sg.globalcirclecat.com DNS change
  unrelated node mutation
  AWS mutation
  historical state copy
  customer data copy
  raw subscription URL, token, YAML, key, credential, or .env disclosure
```

## Fresh Preflight Evidence

Safe preflight summary:

```text
repo branch before record branch: master...origin/master
open PRs before execution record work: none
Aliyun candidate instance state: running
candidate app service: active
Nginx service: active
UFW service: active
candidate app loopback health: HTTP 200 after restart warmup
candidate DB integrity before smoke: ok
candidate DB tenant/artifact counts before smoke: 0 tenants, 0 artifacts
candidate proxy config summary: 2 configured shadowsocks-libev servers
previous public Nginx posture: loopback-only 127.0.0.1:18080
previous public 80/443: closed before promotion
authoritative AliDNS before promotion:
  sub.globalcirclecat.com: old AWS stopped address
  ss-sg.globalcirclecat.com: old AWS stopped address
```

Local Windows resolver output later returned reserved `198.18.*` proxy
addresses and was rejected as authoritative DNS evidence. This record uses
AliDNS API output and Aliyun-host-side DNS resolution as the promotion evidence.

## Rollback Snapshot

Private rollback material was captured on the Aliyun candidate before durable
public-boundary changes:

```text
rollback backup directory:
  /opt/proxy-gateway-minimal-candidate/state/backups/promotion-20260527-172001
captured:
  Nginx available/enabled site configs
  candidate .env
  candidate SQLite backup
```

The rollback backup path is recorded for operator use. It is not a secret, but
the backup contents must not be copied into the repository.

## Executed Changes

### Aliyun Host

```text
Nginx:
  added durable public subscription-boundary config for sub.globalcirclecat.com
  proxied only allowed public paths to the loopback candidate app
  kept Admin and root paths blocked
  tested config before reload

candidate runtime:
  set public subscription base URL to https://sub.globalcirclecat.com
  restarted proxy-gateway-candidate

UFW:
  allowed public 80/tcp
  allowed public 443/tcp
  did not open 3456/tcp
  did not open 18080/tcp

HTTPS:
  installed certbot
  issued Let's Encrypt certificate for sub.globalcirclecat.com
  certificate expires 2026-08-25
  certbot.timer is active
```

### Aliyun Provider Firewall

```text
created public 80/tcp rule with remark public-subscription-boundary-80
created public 443/tcp rule with remark public-subscription-boundary-443
kept SSH and existing wg-home UDP management/lab rules scoped
did not create provider rules for 3456/tcp or 18080/tcp
```

### AliDNS

```text
sub.globalcirclecat.com:
  updated A record to Aliyun candidate public IP 47.251.178.125
  TTL: 600
ss-sg.globalcirclecat.com:
  unchanged, remains on the old AWS stopped address
```

`ss-sg.globalcirclecat.com` was intentionally left unchanged because edge
traffic activation was outside the approval.

## Smoke Tenant Validation

A single local loopback Admin smoke tenant was created only for promotion
validation, used once through the public subscription boundary, and immediately
disabled. No raw subscription URL, token, YAML, tenant row, or credential is
recorded here.

Safe smoke evidence:

```text
authorized subscription refresh over public boundary: HTTP 200
response content type: application/x-yaml
response size: 937 bytes
smoke tenant final status: disabled
temporary local files containing URL/YAML/request output: removed
```

Final safe DB summary:

```text
db_integrity: ok
total_subscription_tenants: 1
active_subscription_tenants: 0
disabled_subscription_tenants: 1
promotion_smoke_disabled: 1
promotion_smoke_active: 0
artifact_count: 0
```

## Post-Promotion Validation

Public checks from the operator device:

```text
https /api/health: 200
https /api/admin/subscriptions: 404
https /: 404
https /sub/clash.yaml without token: 401
http /api/health: 200
```

Short observation window:

```text
sample_1: health=200 admin=404 sub_no_token=401
sample_2: health=200 admin=404 sub_no_token=401
sample_3: health=200 admin=404 sub_no_token=401
```

Aliyun-host SNI checks:

```text
SNI https /api/health: 200
SNI https /api/admin/subscriptions: 404
SNI https /: 404
SNI https /sub/clash.yaml without token: 401
```

Services and private-port boundary:

```text
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
nginx -t: ok
public 3456/tcp from Aliyun host self-check: closed_or_timeout
public 18080/tcp from Aliyun host self-check: closed_or_timeout
```

Authoritative DNS evidence:

```text
AliDNS API sub.globalcirclecat.com: 47.251.178.125
AliDNS API ss-sg.globalcirclecat.com: 13.215.156.159
Aliyun-host DNS sub.globalcirclecat.com: 47.251.178.125
Aliyun-host DNS ss-sg.globalcirclecat.com: 13.215.156.159
```

## Known Side Effect

During `certbot` installation, the package scanner attempted to restart
`aegis.service`. The service entered `failed` state, and a follow-up
`systemctl reset-failed` / `systemctl start` attempt did not recover it during
this promotion window.

Current side-effect status:

```text
aegis.service: failed
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
```

This is an Aliyun host security-agent follow-up item. It did not prevent the
subscription boundary from serving the validated health and subscription paths,
but it must be tracked instead of hidden.

## Rollback

Rollback follows the recorded accepted-outage posture unless a separate
rollback-start approval is issued for the stopped AWS Singapore nodes.

Aliyun/DNS rollback steps:

```text
1. Restore sub.globalcirclecat.com A record to the previous accepted-outage
   address if the decision is to return to the pre-promotion DNS posture.
2. Delete provider-firewall rules with remarks:
     public-subscription-boundary-80
     public-subscription-boundary-443
3. Remove the public Nginx site symlink/config or restore Nginx from:
     /opt/proxy-gateway-minimal-candidate/state/backups/promotion-20260527-172001
4. Restore the candidate .env from the same backup if needed.
5. Run nginx config test, reload Nginx, and restart proxy-gateway-candidate.
6. Remove public UFW 80/tcp and 443/tcp allows if returning to private-only.
7. Verify public 80/443/3456/18080 according to the chosen rollback posture.
8. Keep the promotion smoke tenant disabled.
```

AWS rollback-start is separate:

```text
Do not start prod-edge-a or prod-edge-b in this rollback path unless the
operator separately approves rollback-start. Stopped AWS instances may receive
new public IPv4 addresses and may require their own DNS/config update.
```

## Not Performed

```text
public Admin exposure: not performed
edge traffic activation: not performed
ss-sg.globalcirclecat.com DNS change: not performed
AWS mutation: not performed
AWS rollback-start: not performed
historical state copy: not performed
SQLite restore/import from AWS: not performed
customer data copy: not performed
3456/tcp public opening: not performed
18080/tcp public opening: not performed
unrelated node mutation: not performed
secret/token/subscription URL/YAML/private key/customer data recording: not performed
```

## Final Decision

```text
gate result: promoted
subscription distribution authority: Aliyun public subscription boundary
public subscription domain: sub.globalcirclecat.com
public Admin: blocked
edge data-plane: not activated
ss-sg.globalcirclecat.com: unchanged
next required work:
  observation and Aegis service follow-up
  clean edge rebuild planning
  broader artifact issuance / legacy query-token retirement gates when ready
```

## Sensitive Output Audit

This record contains none of:

```text
raw subscription URLs
tokens
passwords
private keys
cloud credentials
customer data
production .env values
SQLite row dumps
unredacted logs
exact management source IPs
```
