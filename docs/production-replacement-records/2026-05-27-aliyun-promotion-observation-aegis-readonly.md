# Aliyun Promotion Observation And Aegis Read-Only Follow-Up


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_promotion_observation_aegis_readonly
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A read-only follow-up record
Gate: Post-promotion observation and Aegis read-only diagnosis
Execution state: observation passed; Aegis service unit remains failed
Production impact: none from this follow-up
Aliyun impact: read-only checks only
DNS impact: none
Firewall impact: none
Nginx/systemd mutation: none
Edge traffic impact: none
```

This follows the promotion record:

```text
docs/production-replacement-records/2026-05-27-aliyun-production-subscription-distribution-promotion.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Validation / CI
  Operator Lab
Follow-up owner: Production Operations Agent
Follow-up suitability: high for Aegis repair approval or clean edge rebuild
```

## Scope

Allowed by this follow-up:

```text
public endpoint observation
AliDNS read-only verification
Aliyun host service status inspection
Nginx config test
SQLite safe aggregate checks
Aegis unit/log/process read-only inspection
repository documentation and project-state update
```

Not allowed and not performed:

```text
DNS mutation
provider firewall mutation
UFW mutation
Nginx config mutation
proxy-gateway service restart
Aegis restart or repair
AWS mutation
edge traffic activation
public Admin exposure
tenant/artifact mutation
secret/token/subscription URL/YAML/customer data recording
```

## Promotion Observation Evidence

Public operator-device sampling after promotion:

```text
sample_1: health=200 admin=404 sub_without_token: 401
sample_2: health=200 admin=404 sub_without_token: 401
sample_3: health=200 admin=404 sub_without_token: 401
sample_4: health=200 admin=404 sub_without_token: 401
sample_5: health=200 admin=404 sub_without_token: 401
```

Authoritative AliDNS read-only checks:

```text
sub.globalcirclecat.com: 47.251.178.125
ss-sg.globalcirclecat.com: 13.215.156.159
```

Aliyun host SNI and private-port checks:

```text
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
nginx -t: ok
SNI https /api/health: 200
SNI https /api/admin/subscriptions: 404
SNI https /: 404
SNI https /sub/clash.yaml without token: 401
public 3456/tcp from Aliyun host self-check: closed_or_timeout
public 18080/tcp from Aliyun host self-check: closed_or_timeout
```

SQLite safe aggregate checks:

```text
db_integrity: ok
total_subscription_tenants: 1
active_subscription_tenants: 0
disabled_subscription_tenants: 1
promotion_smoke_disabled: 1
promotion_smoke_active: 0
artifact_count: 0
```

## Aegis Read-Only Diagnosis

Safe service state:

```text
aegis.service active state: failed
aegis.service enabled state: enabled
LoadState: loaded
ActiveState: failed
SubState: failed
Result: signal
MainPID: 0
FragmentPath: /etc/systemd/system/aegis.service
```

Safe unit summary:

```text
Type: forking
Restart: no
TimeoutSec: 30
KillMode: process
GuessMainPID: no
ExecStart: /usr/local/aegis/aegis_update/AliYunDunUpdate
ExecStop: /usr/local/aegis/globalcfg/aegis_info -c
```

Safe log pattern:

```text
systemd found left-over AliYunDunUpdate process while starting aegis.service
starting aegis.service then exits with code=killed, status=9/KILL
unit remains failed with result signal
AliYunDunUpdate remains running after unit stopped
```

Safe process evidence:

```text
AliYunDunUpdate process exists
AliYunDun client process exists
AliYunDunMonitor process exists
```

Package-history context:

```text
certbot was installed during the promotion window
the Aegis service failure was first observed during package/service restart handling
proxy-gateway-candidate, nginx, ufw, and certbot.timer remain active
```

## Assessment

```text
subscription boundary: healthy in this observation window
public Admin: blocked
edge data-plane: not activated
private app ports 3456/18080: not public
promotion smoke tenant: disabled
Aegis unit: failed
Aegis processes: still present
likely issue class: Aliyun security-agent unit/startup state inconsistency
```

The Aegis condition is not a proxy-gateway outage. It is still an Aliyun host
security-agent follow-up and should not be ignored.

## Follow-Up Gate

Repairing Aegis would be a separate host-service mutation. Use a separate
approval before attempting any process kill, service restart, reinstall,
disable, or vendor-agent repair command.

Suggested approval phrase if the operator wants Codex to attempt the repair:

```text
Approve Aliyun Aegis service repair. Allow Aegis-only process cleanup and service restart on the Aliyun host. No DNS change, no Nginx change, no proxy-gateway restart, no firewall change, no AWS mutation, no edge traffic, and stop if proxy-gateway health changes.
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
unredacted secret-bearing logs
exact management source IPs
```
