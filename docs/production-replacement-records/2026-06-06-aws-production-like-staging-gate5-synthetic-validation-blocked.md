# AWS Production-Like Staging Gate 5 Synthetic Validation Blocked


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aws_production_like_staging_gate5_synthetic_validation_blocked
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06 Asia/Shanghai

## Scope

Approved target:

- AWS staging host only: `54.248.170.34`
- Instance: `i-08aa4775a099c9a18`
- Security group: `sg-0927469a10053fa98`
- Release: `bdc95d46ae4d`

Non-goals and forbidden changes remained in force:

- no Vultr production mutation
- no Aliyun mutation
- no DNS mutation
- no Nginx mutation
- no Mihomo config mutation during the temporary SSH-source gate
- no customer data
- no production secrets
- no payment changes
- no public Admin
- no subscription URL, token, password, raw env, raw config, raw log, or SQLite row output

## Temporary SSH Source Correction

The operator source IP changed after the network route changed. The AWS staging
security group still allowed SSH only from the original source, so SSH to the
staging host failed while public HTTP checks remained healthy.

Mutation performed:

```text
added temporary SSH ingress: TCP 22 from 63.88.218.78/32
security group rule id: sgr-0e62ab54b0c2b17df
```
Validation after adding the temporary rule:

```text
SSH sources: 45.76.222.52/32, 63.88.218.78/32
SSH to 54.248.170.34: ok
public /api/health: 200
public /api/admin/platform/health: 404
```

## Gate 5 Synthetic Flow Evidence

Safe aggregate evidence after the synthetic staging-only portal/order flow:

```text
proxy-gateway-candidate.service: active
mihomo-tuic.service: active
UDP 443 listener: present
control DB: present, integrity ok
subscription DB: present, integrity ok
platform accounts: 1
password credentials: 1
portal sessions: 2
portal access requests: 2, pending_admin_review:2
issuance requests: 1, issued:1
edge apply receipts: 1, failed:1
subscription tenants: 1, active:1
subscription artifacts: 1, active:1
```

The first long synthetic request reference failed validation because the
auto-issuance note exceeded the repository sensitive-material guard pattern.
The shorter synthetic request passed issuance and artifact creation, then failed
at the edge lifecycle apply step.

## Root Cause

The failed edge receipt had this safe shape:

```text
config_test_ok: true
service_active: true
listener_udp443: true
add_count: 1
revoke_count: 0
rotate_count: 0
unchanged_count: 0
```

In the Mihomo TUIC explicit-restart runtime adapter, a receipt can still be
`failed` with config test, service, and listener checks all true only when the
`systemctl restart mihomo-tuic.service` command returned a failed result.

Additional safe host evidence:

```text
proxy-gateway-candidate.service user: proxy-gateway-candidate
mihomo-tuic.service user: proxy-gateway-candidate
active config mtime after Mihomo process start: yes
active config present: yes
candidate config present: yes
backup directory present: yes
```

Conclusion: the staging flow reached durable DB issuance and subscription
artifact creation, but the edge runtime did not successfully restart Mihomo
after writing the candidate/active config. The running Mihomo process therefore
continued to serve its prior in-memory config.

This matches the user-visible symptom where a subscription imports normally but
the TUIC node times out.

## Current Status

Gate 5 is blocked at the edge runtime restart permission/loading boundary.

The next approved gate should be a minimal AWS-staging-only fix that allows
`proxy-gateway-candidate.service` to restart only `mihomo-tuic.service`, then
reruns a synthetic order with safe redacted validation.

Recommended next gate:

```text
target: AWS staging host only
scope:
  - install restricted systemd/polkit or equivalent permission for restarting mihomo-tuic.service only
  - restart proxy-gateway-candidate.service if required
  - rerun one synthetic staging-only order
  - verify edge apply receipt becomes applied
  - verify Mihomo process start is after active config mtime
  - verify UDP 443 listener remains present
  - verify public Admin remains 404
forbidden:
  - Vultr production mutation
  - Aliyun mutation
  - DNS mutation
  - Nginx mutation
  - customer data
  - production secrets
  - payment
  - public Admin
  - subscription URL/token/password output
  - SQLite row dump
  - raw env/log/config output
```
