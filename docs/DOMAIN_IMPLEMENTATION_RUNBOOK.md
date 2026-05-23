# DNS / Domain Implementation Runbook

Last updated: 2026-05-24, Asia/Shanghai.

This runbook converts `docs/DOMAIN_ABSTRACTION_PLAN.md` into execution gates,
commands, validation, and rollback steps. It is still documentation only until
the operator gives explicit execution approval. Merging this document does not
authorize DNS mutation, AWS mutation, Nginx mutation, HTTPS issuance,
production `.env` edits, production node-config edits, green creation, service
restart, or traffic cutover.

## Target State

Approved planning direction:

```text
Subscription base URL host: sub.globalcirclecat.com
Shadowsocks node host: ss-sg.globalcirclecat.com
Initial target: current blue public IP 47.129.247.102
```

Current blue production:

```text
Node name: aws-singapore-blue
Instance ID: i-004ab1c6c71d06bca
Public IP: 47.129.247.102
Security group: sg-04a165ec77f430ee8
Runtime path: /opt/proxy-gateway-minimal
```

Execution remains Risk A. Do not run any mutating command in this runbook until
the relevant approval gate is satisfied.

## Approval Gates

These approvals are separate and non-transitive.

### Gate 1: DNS / Domain Implementation

Required before any DNS, Nginx, HTTPS, or production runtime config mutation:

```text
Approve DNS/domain abstraction implementation for aws-singapore-blue.
```

Gate 1 allows only the steps explicitly selected in the execution record. It
does not approve green creation or production cutover.

### Gate 2: Green Creation

Required before creating any production replacement candidate:

```text
Create a green production replacement candidate for aws-singapore-blue.
```

### Gate 3: Production Cutover

Required before moving production traffic from blue to green:

```text
Cut over production traffic from blue to green.
```

## Hard Stop Rules

Stop and do not proceed if any of these are true:

- The current blue production instance is unhealthy.
- DNS ownership for `globalcirclecat.com` cannot be verified.
- Existing records for `sub` or `ss-sg` point to an unexpected target.
- Nginx config test fails.
- Public `/api/admin/*` is exposed.
- Nginx access logs include query strings or subscription tokens.
- HTTPS issuance requires exposing the Admin UI or broadening public routes.
- A production config backup cannot be created.
- A fresh SQLite backup is required for the selected stage but cannot be made.
- The operator has not provided the required approval phrase for the stage.

## Stage 0: Read-Only Preflight

Stage 0 is safe to run without mutation approval. It gathers current facts.

Clear local proxy variables before cloud checks if local proxy is stale:

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY,Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

Confirm current AWS blue target:

```powershell
aws ec2 describe-instances `
  --region ap-southeast-1 `
  --instance-ids i-004ab1c6c71d06bca `
  --query "Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress,Type:InstanceType,SecurityGroups:SecurityGroups[*].GroupId,Name:Tags[?Key=='Name']|[0].Value,Purpose:Tags[?Key=='Purpose']|[0].Value}" `
  --output table
```

Confirm whether the current public IP is still not a confirmed EIP:

```powershell
aws ec2 describe-addresses `
  --region ap-southeast-1 `
  --public-ips 47.129.247.102 `
  --output table
```

If this returns no allocation or `InvalidAddress.NotFound`, the current public
IP is still not confirmed movable.

Run AliDNS read-only checks:

```powershell
aliyun alidns DescribeDomainRecords `
  --DomainName globalcirclecat.com `
  --RRKeyWord sub `
  --Type A `
  --SearchMode ADVANCED `
  --PageSize 20

aliyun alidns DescribeDomainRecords `
  --DomainName globalcirclecat.com `
  --RRKeyWord ss-sg `
  --Type A `
  --SearchMode ADVANCED `
  --PageSize 20
```

Run public boundary checks from the local workstation:

```powershell
curl.exe --noproxy "*" -i http://47.129.247.102/api/health
curl.exe --noproxy "*" -i http://47.129.247.102/api/admin/subscriptions
curl.exe --noproxy "*" -i http://47.129.247.102/sub/clash.yaml
```

Expected:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
```

Inspect production Nginx log format locally on the host. Do not paste raw logs
or raw command output into PRs, docs, chat, or incident records if it includes
request URLs, command arguments, tokens, or customer data.

```bash
sudo nginx -T 2>/dev/null | grep -n 'log_format proxy_gateway'
sudo nginx -T 2>/dev/null | grep -nF '$request_uri' || true
sudo awk 'index($0,"?token=")>0{c++} END{print c+0}' /var/log/nginx/proxy-gateway-access.log
```

Expected:

```text
log_format proxy_gateway uses $uri, not $request_uri
no active access_log format should contain $request_uri
token query count in access log is 0
```

## Stage 1: DNS Records To Blue

Stage 1 is mutating. Do not run it without Gate 1 approval.

Target records:

| Host | Type | Value | TTL |
| --- | --- | --- | --- |
| `sub.globalcirclecat.com` | A | `47.129.247.102` | `300` |
| `ss-sg.globalcirclecat.com` | A | `47.129.247.102` | `300` |

If records do not exist, create them:

```powershell
aliyun alidns AddDomainRecord `
  --DomainName globalcirclecat.com `
  --RR sub `
  --Type A `
  --Value 47.129.247.102 `
  --TTL 300

aliyun alidns AddDomainRecord `
  --DomainName globalcirclecat.com `
  --RR ss-sg `
  --Type A `
  --Value 47.129.247.102 `
  --TTL 300
```

If records already exist and point to the expected blue target, lower TTL only:

```powershell
$SubRecordId = "<record-id-from-read-only-check>"
$SsRecordId = "<record-id-from-read-only-check>"

aliyun alidns UpdateDomainRecord `
  --RecordId $SubRecordId `
  --RR sub `
  --Type A `
  --Value 47.129.247.102 `
  --TTL 300

aliyun alidns UpdateDomainRecord `
  --RecordId $SsRecordId `
  --RR ss-sg `
  --Type A `
  --Value 47.129.247.102 `
  --TTL 300
```

Validate DNS:

```powershell
Resolve-DnsName sub.globalcirclecat.com -Type A
Resolve-DnsName ss-sg.globalcirclecat.com -Type A
```

Expected:

```text
sub.globalcirclecat.com -> 47.129.247.102
ss-sg.globalcirclecat.com -> 47.129.247.102
```

Rollback:

```powershell
aliyun alidns DeleteDomainRecord --RecordId $SubRecordId
aliyun alidns DeleteDomainRecord --RecordId $SsRecordId
```

If records existed before this stage, rollback must restore their previous
values instead of deleting them.

## Stage 2: HTTP-Only Domain Validation

Stage 2 may require Nginx mutation. Do not run it without Gate 1 approval.

The HTTP-only Nginx site must preserve the public boundary:

```nginx
log_format proxy_gateway '$remote_addr - $remote_user [$time_local] "$request_method $uri $server_protocol" '
                         '$status $body_bytes_sent "$http_referer" "$http_user_agent"';

server {
    listen 80 default_server;
    server_name sub.globalcirclecat.com _;

    access_log /var/log/nginx/proxy-gateway-access.log proxy_gateway;
    error_log /var/log/nginx/proxy-gateway-error.log warn;

    location = /api/health {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://127.0.0.1:3456;
    }

    location = /sub/clash.yaml {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://127.0.0.1:3456;
    }

    location ^~ /api/admin/ {
        return 404;
    }

    location / {
        return 404;
    }
}
```

Before applying any Nginx change, back up the active site:

```bash
sudo cp -a /etc/nginx/sites-available/proxy-gateway-public.conf \
  /etc/nginx/sites-available/proxy-gateway-public.conf.before-domain-$(date -u +%Y%m%dT%H%M%SZ)
```

After applying the reviewed Nginx config:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Validate HTTP domain boundary:

```powershell
curl.exe --noproxy "*" -i http://sub.globalcirclecat.com/api/health
curl.exe --noproxy "*" -i http://sub.globalcirclecat.com/api/admin/subscriptions
curl.exe --noproxy "*" -i http://sub.globalcirclecat.com/sub/clash.yaml
curl.exe --noproxy "*" -i http://sub.globalcirclecat.com/
```

Expected:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
```

Validate Shadowsocks DNS name reaches the public SS port:

```powershell
Test-NetConnection ss-sg.globalcirclecat.com -Port 18388
```

Rollback:

```bash
sudo cp -a /etc/nginx/sites-available/proxy-gateway-public.conf.before-domain-<timestamp> \
  /etc/nginx/sites-available/proxy-gateway-public.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Stage 3: HTTPS Issuance

Stage 3 is mutating. Do not run it without Gate 1 approval and successful Stage
2 validation.

Issue HTTPS only for the subscription gateway host:

```bash
sudo certbot --nginx \
  -d sub.globalcirclecat.com \
  --agree-tos \
  --no-eff-email \
  --no-redirect \
  -m admin@globalcirclecat.com
```

Do not issue HTTPS for `ss-sg.globalcirclecat.com`; it is the Shadowsocks node
DNS name, not an HTTP endpoint.

Initial HTTPS issuance should avoid an automatic hard redirect unless the
approved execution record explicitly chooses redirect behavior. Existing
IP-based clients may need a transition window.

If redirect behavior is explicitly approved later, use a separate reviewed
Nginx change or a separate Certbot redirect step. Do not enable redirects
implicitly during initial certificate issuance.

Validate HTTPS:

```powershell
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/api/health
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/api/admin/subscriptions
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/sub/clash.yaml
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/
```

Expected:

```text
/api/health -> 200
/api/admin/subscriptions -> 404
/sub/clash.yaml without token -> 401
/ -> 404
```

Renewal check:

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

Rollback:

- If certificate issuance fails, keep HTTP-only domain validation or remove the
  domain Nginx config and keep the IP-based production path.
- If Certbot modifies Nginx incorrectly, restore the pre-stage Nginx backup and
  reload after `nginx -t`.

## Stage 4: Subscription Base URL Migration

Stage 4 is mutating. Do not run it without Gate 1 approval and successful HTTPS
validation.

Target:

```text
PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com
```

Back up production `.env` without printing it:

```bash
sudo cp -a /opt/proxy-gateway-minimal/.env \
  /opt/proxy-gateway-minimal/.env.before-domain-$(date -u +%Y%m%dT%H%M%SZ)
```

Apply the base URL:

```bash
sudo grep -q '^PUBLIC_SUBSCRIPTION_BASE_URL=' /opt/proxy-gateway-minimal/.env

sudo sed -i 's#^PUBLIC_SUBSCRIPTION_BASE_URL=.*#PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com#' \
  /opt/proxy-gateway-minimal/.env

sudo grep -qx 'PUBLIC_SUBSCRIPTION_BASE_URL=https://sub.globalcirclecat.com' \
  /opt/proxy-gateway-minimal/.env

sudo systemctl restart proxy-gateway-console.service
```

If `PUBLIC_SUBSCRIPTION_BASE_URL` is missing, stop and decide an explicit add
path in the execution record. Do not let the replacement silently no-op.

Safe service checks:

```bash
systemctl is-active proxy-gateway-console.service
systemctl show proxy-gateway-console.service \
  --property=ActiveState,SubState,Result,ExecMainStatus,NRestarts --no-pager
```

Do not paste raw `systemctl status`, raw journal output, `.env` content, or
process command lines into PRs, docs, chat, or incident records.

Validate local loopback:

```bash
curl -i http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/sub/clash.yaml
```

Validate public domain:

```powershell
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/api/health
curl.exe --noproxy "*" -i https://sub.globalcirclecat.com/sub/clash.yaml
```

Expected unauthenticated subscription fetch remains `401`.

Validate a real subscription locally without recording the raw URL:

```powershell
$SubscriptionUrl = Read-Host "Paste subscription URL locally; do not paste it into logs or PRs"
curl.exe --noproxy "*" -fsS $SubscriptionUrl | Select-String -Pattern "proxies|ss-sg.globalcirclecat.com"
Remove-Variable SubscriptionUrl
```

Rollback:

```bash
sudo cp -a /opt/proxy-gateway-minimal/.env.before-domain-<timestamp> \
  /opt/proxy-gateway-minimal/.env
sudo systemctl restart proxy-gateway-console.service
```

## Stage 5: Shadowsocks Node Host Migration

Stage 5 is mutating. Do not run it without Gate 1 approval, DNS validation for
`ss-sg.globalcirclecat.com`, and accepted client migration risk.

Back up node config:

```bash
sudo cp -a /opt/proxy-gateway-minimal/config/proxy-servers.json \
  /opt/proxy-gateway-minimal/config/proxy-servers.json.before-domain-$(date -u +%Y%m%dT%H%M%SZ)
```

Apply the DNS node host without printing secrets:

```bash
sudo node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const path = "/opt/proxy-gateway-minimal/config/proxy-servers.json";
const config = JSON.parse(readFileSync(path, "utf8"));

for (const server of config.servers || []) {
  if (server.name === "aws-singapore-blue") {
    server.host = "ss-sg.globalcirclecat.com";
  }
}

config.pingHosts = ["ss-sg.globalcirclecat.com"];
config.nginx = { ...(config.nginx || {}), host: "sub.globalcirclecat.com" };

writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
NODE
```

Restart the console service only after config backup exists:

```bash
sudo systemctl restart proxy-gateway-console.service
systemctl is-active proxy-gateway-console.service
```

Validate generated YAML without recording raw subscription URLs:

```powershell
$SubscriptionUrl = Read-Host "Paste subscription URL locally; do not paste it into logs or PRs"
$Yaml = curl.exe --noproxy "*" -fsS $SubscriptionUrl
$Yaml | Select-String -Pattern "ss-sg.globalcirclecat.com"
Remove-Variable SubscriptionUrl,Yaml
```

Validate client connectivity through a Clash/Mihomo client or a controlled
Shadowsocks test client. Record only pass/fail, timestamp, and redacted node
name. Do not record passwords or full subscription URLs.

Rollback:

```bash
sudo cp -a /opt/proxy-gateway-minimal/config/proxy-servers.json.before-domain-<timestamp> \
  /opt/proxy-gateway-minimal/config/proxy-servers.json
sudo systemctl restart proxy-gateway-console.service
```

## Stage 6: Client Migration Window

Minimum recommended windows:

```text
TTL lowered before cutover: at least 24 hours
Blue/domain parallel serving: at least 7 days
```

During the migration window:

- Blue remains serving on `47.129.247.102`.
- Domain-based subscription links are used for newly issued or reset links.
- Existing IP-based links are not forcibly invalidated.
- Operator tracks whether active clients refresh subscriptions successfully.
- No green cutover is approved by this stage.

Do not retire the IP-based path until the operator explicitly accepts remaining
client impact.

## Stage 7: Blue / Green Extension

This runbook prepares domain abstraction on blue. It does not create green.

Before any green candidate is requested:

- DNS/domain implementation outcome is recorded.
- Rollback to blue is tested.
- Fresh blue SQLite backup requirement is accepted.
- Client migration status is understood.

Before any cutover:

- Green has passed independent validation.
- DNS records can be repointed with low TTL.
- Public Nginx boundary and Admin API privacy are verified.
- Subscription fetch and Shadowsocks client behavior are verified.
- Rollback to blue is still available.

## Execution Record Template

```text
Execution date:
Operator:
Approved stage:
Approval phrase:
Target blue:
Target DNS names:
Preflight AWS blue check:
Preflight AliDNS records:
Nginx log redaction check:
DNS mutation performed:
Nginx mutation performed:
HTTPS issuance performed:
PUBLIC_SUBSCRIPTION_BASE_URL changed:
Node host changed:
Validation results:
Rollback artifacts:
Client migration notes:
Secrets copied or recorded: no
Subscription URLs recorded: no
AWS / green / cutover performed: no
Notes:
```

## Non-Goals

This runbook does not authorize:

- DNS mutation without Gate 1 approval.
- AWS mutation.
- Green creation.
- Production cutover.
- Admin UI exposure.
- Opening `3456`, `18180`, or `1080` to the public internet.
- Copying production `.env`, `SS_PASSWORD`, `CONSOLE_TOKEN`, SQLite data, or
  customer data into PRs, docs, chat, CI hosts, or local artifacts.
