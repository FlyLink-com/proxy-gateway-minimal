# AWS Production-Like Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a disposable AWS staging environment that matches the current Vultr production model closely enough to test subscription issuance, per-order TUIC credential lifecycle, future traffic accounting, quota enforcement, and abuse controls without touching Vultr production or copying production secrets/data.

**Architecture:** Rebuild, do not clone. Use the same repository release shape, Node/Nginx/systemd/SQLite/Mihomo TUIC topology, public boundary rules, portal flow, and per-order credential reconciliation model. Use dedicated AWS staging channel IDs, synthetic runtime material, synthetic accounts, synthetic orders, and staging-only certificates or host-local validation. Keep Vultr production and Aliyun website/control remnants untouched.

**Tech Stack:** AWS EC2, Ubuntu 24.04 LTS, AWS CLI, Node.js 22.x, SQLite, Nginx, systemd, Mihomo TUIC, `gccgw` package/install tooling, PowerShell preflight scripts, repository server/Admin tests.

---

## Hard Boundary

- Risk: A.
- This plan does not authorize AWS resource creation.
- Do not copy Vultr `.env`, SQLite files, TLS private keys, Mihomo config, TUIC credentials, subscription artifacts, portal passwords, logs, or customer data.
- Do not mutate Vultr production, Aliyun website, DNS, registrar nameservers, Cloudflare, payment, real account generation, or live subscription issuance.
- Do not expose Admin routes publicly.
- Do not open public Node/Admin/private management ports.
- Do not output secrets, tokens, subscription URLs, passwords, raw SQLite rows, raw environment files, raw runtime configs, or raw logs.

## Why This Is The Right Test Surface

The current risk is not the web portal itself. The risky part is proving that a generated order, durable DB row, per-order credential, subscription artifact, Mihomo listener, and future traffic ledger all agree on the same identity over time.

Testing that directly on Vultr production is unsafe because a broken lifecycle experiment can affect active users. AWS staging should therefore be production-like in shape but isolated in authority:

- same code and service topology;
- same database schema and migration paths;
- same per-order TUIC credential adapter behavior;
- same public boundary expectations;
- synthetic data only;
- teardown-ready infrastructure.

## Fixed Staging Choices

- AWS region: `ap-northeast-1` Tokyo.
- Instance class for first validation: `t3.small` or `t3.medium`; use `t3.medium` if traffic-accounting tests include sustained UDP load.
- OS: Ubuntu 24.04 LTS.
- Root disk: gp3, 30 GB.
- Staging logical channel: `channel-aws-staging-a-tuic`.
- Staging physical node ref: `aws-apne1-staging-a`.
- Staging hostnames: no DNS change in first pass; use candidate IP and host-local validation. A DNS subdomain such as `staging.globalcirclecat.cloud` is a later approval gate.
- Public ports in the staging security group:
  - TCP 22 from current operator source `/32` only.
  - TCP 80/443 only when web-boundary validation is approved.
  - UDP 443 only when TUIC listener validation is approved.
- Private app port: loopback only on the instance.

## Gate 0: Read-Only Local Preflight

**Files:**

- Read: `D:/Projects/proxy-gateway-minimal/docs/PROJECT_CONTEXT.md`
- Read: `D:/Projects/proxy-gateway-minimal/docs/production-replacement-records/2026-06-02-aws-disposable-tokyo-korea-gccgw-validation.md`
- Read: `D:/Projects/proxy-gateway-minimal/docs/production-replacement-records/2026-06-06-vultr-independent-candidate-deployment.md`
- Read: `D:/Projects/proxy-gateway-minimal/docs/production-replacement-records/2026-06-06-vultr-tuic-certificate-chain-fix.md`
- Read: `D:/Projects/proxy-gateway-minimal/package.json`

- [ ] **Step 1: Confirm repository state**

Run:

```powershell
cd D:\Projects\proxy-gateway-minimal
git status --short --branch
git fetch origin
```

Expected:

```text
Repo state is recorded before any plan or code work.
```

- [ ] **Step 2: Confirm AWS CLI is available**

Run:

```powershell
aws --version
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
```

Expected:

```text
AWS CLI returns an identity. Do not write account identifiers into public runbooks unless explicitly approved.
```

- [ ] **Step 3: Confirm target AWS region supports the instance family**

Run:

```powershell
aws ec2 describe-instance-type-offerings `
  --region ap-northeast-1 `
  --location-type region `
  --filters Name=instance-type,Values=t3.small,t3.medium `
  --query 'InstanceTypeOfferings[].InstanceType' `
  --output text
```

Expected:

```text
t3.small and/or t3.medium are available in ap-northeast-1.
```

- [ ] **Step 4: Compute the operator management source without storing it in Git**

Run:

```powershell
$OperatorIpv4 = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=text').Trim()
$MgmtCidr = "$OperatorIpv4/32"
"operator source discovered"
```

Expected:

```text
The management CIDR is available only for the live approval packet and is not committed.
```

## Gate 1: Repo-Only Staging Channel Support

**Files:**

- Add: `D:/Projects/proxy-gateway-minimal/config/proxy-servers.aws-staging-tuic.template.json`
- Add or update: `D:/Projects/proxy-gateway-minimal/server/tests/aws-staging-tuic-template.test.mjs`
- Read: `D:/Projects/proxy-gateway-minimal/config/proxy-servers.vultr-local-tuic.template.json`
- Read: `D:/Projects/proxy-gateway-minimal/server/tests/vultr-tuic-template.test.mjs`

- [x] **Step 1: Add a staging-only TUIC template**

The template must:

- use `channel-aws-staging-a-tuic`;
- use `aws-apne1-staging-a`;
- use provider `aws`;
- use protocol/type `tuic`;
- keep `credentialMode: "per-order"`;
- keep credential lifecycle add/disable/rotate/restart capabilities;
- render `udpRelayMode` and `congestionController`;
- use only environment placeholders for host, UUID, password, and SNI.

- [x] **Step 2: Add template rendering tests**

Run:

```powershell
node --test server/tests/aws-staging-tuic-template.test.mjs
npm test
```

Expected:

```text
The rendered staging subscription contains a TUIC node, has no unresolved host/SNI placeholders, contains no DIRECT in user GLOBAL groups, and preserves per-order credential metadata.
```

## Gate 2: Build A Staging Artifact

**Files:**

- Read: repository source tree.
- Write locally: `.codex-artifacts/aws-staging/`.

- [x] **Step 1: Run full local validation before packaging**

Run:

```powershell
npm test
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:portal:verify
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected:

```text
All validation passes before any AWS resource work is requested.
```

- [x] **Step 2: Build a redacted deployment archive**

Run:

```powershell
$Release = (git rev-parse --short=12 HEAD).Trim()
$OutDir = ".codex-artifacts/aws-staging/$Release"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
git archive --format=zip --output "$OutDir/proxy-gateway-aws-staging-$Release.zip" HEAD
Get-FileHash "$OutDir/proxy-gateway-aws-staging-$Release.zip" -Algorithm SHA256
```

Expected:

```text
Archive exists, hash is recorded in the approval request, and no secrets or runtime DB files are packaged.
```

Result recorded on 2026-06-06:

```text
release: bdc95d46ae4d
artifact: .codex-artifacts/aws-staging/bdc95d46ae4d/proxy-gateway-aws-staging-bdc95d46ae4d.zip
archive_sha256: 5BC1B1B27EC15A3D0C762AF835A08C28A09B92413C7F23F80743FB9F0D107F92
artifact_size_bytes: 1690288
strict runtime-file scan: 0 matches for .env, sqlite/db, pem/key/crt, or log files
```

## Gate 3: Exact AWS Resource Approval

This gate needs a separate operator message naming the exact values below.

Approval packet shape:

```text
Approve AWS production-like staging creation:
release=<git short sha>;
archive_sha256=<sha256>;
region=ap-northeast-1;
instance_type=t3.small or t3.medium;
os=Ubuntu 24.04 LTS;
root_disk=gp3 30GB;
security_group=SSH from current operator /32, HTTP/HTTPS optional, UDP 443 optional;
target=AWS staging only;
runtime_env=synthetic staging values only;
forbidden=Vultr production mutation, Aliyun mutation, DNS mutation, customer data, production secrets, live subscription issuance, payment, public Admin;
rollback=terminate instance, delete security group/key pair, delete local temporary materials.
```

- [x] **Step 1: Create a temporary key pair or reuse an approved operator public key**

Run only after exact approval:

```powershell
aws ec2 import-key-pair `
  --region ap-northeast-1 `
  --key-name gccgw-aws-staging-operator-<date> `
  --public-key-material fileb://<approved-public-key-file>
```

Expected:

```text
Temporary or approved public key exists in AWS. Private key is not copied into Git.
```

- [x] **Step 2: Create a staging security group**

Run only after exact approval:

```powershell
aws ec2 create-security-group `
  --region ap-northeast-1 `
  --group-name gccgw-aws-staging-<date> `
  --description "gccgw AWS production-like staging"
```

Expected:

```text
Security group exists and has no broad management ingress.
```

- [x] **Step 3: Add only approved ingress**

Run only after exact approval:

```powershell
aws ec2 authorize-security-group-ingress --region ap-northeast-1 --group-id <sg-id> --protocol tcp --port 22 --cidr $MgmtCidr
aws ec2 authorize-security-group-ingress --region ap-northeast-1 --group-id <sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region ap-northeast-1 --group-id <sg-id> --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region ap-northeast-1 --group-id <sg-id> --protocol udp --port 443 --cidr 0.0.0.0/0
```

Expected:

```text
Only SSH, HTTP/HTTPS, and UDP 443 are open. Admin/private ports remain closed.
```

- [x] **Step 4: Launch one staging instance**

Run only after exact approval:

```powershell
aws ec2 run-instances `
  --region ap-northeast-1 `
  --image-id <ubuntu-24-04-ami-id> `
  --instance-type <approved-instance-type> `
  --key-name gccgw-aws-staging-operator-<date> `
  --security-group-ids <sg-id> `
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","DeleteOnTermination":true}}]' `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=gccgw-aws-production-like-staging},{Key=Project,Value=proxy-gateway-minimal},{Key=Environment,Value=staging}]'
```

Expected:

```text
One staging instance reaches running status. No production resource is changed.
```

Result recorded on 2026-06-06:

```text
region: ap-northeast-1
release: bdc95d46ae4d
ami: ami-091d8d62fdf169cfd
instance_type: t3.medium
instance_id: i-08aa4775a099c9a18
public_ip: 54.248.170.34
private_ip: 172.31.43.76
security_group_id: sg-0927469a10053fa98
key_pair: gccgw-aws-staging-operator-20260606
root_volume_id: vol-03b1fc39947ff45b5
root_volume: gp3 30GB, DeleteOnTermination=true
status_checks: instance ok, system ok
ssh_validation: passed
eip: none
```

## Gate 4: Host Bootstrap With Synthetic Runtime Material

**Remote files:**

- `/opt/proxy-gateway-minimal-candidate/releases/<release>`
- `/opt/proxy-gateway-minimal-candidate/current`
- `/etc/systemd/system/proxy-gateway-candidate.service`
- `/etc/systemd/system/mihomo-tuic.service`
- `/etc/nginx/sites-available/globalcirclecat-staging.conf`
- `/etc/mihomo/config.yaml`
- `/var/lib/proxy-gateway-candidate/`
- `/var/backups/gccgw-edge/`

- [x] **Step 1: Install host packages**

Run over SSH:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git nginx sqlite3 ufw jq unzip
```

Expected:

```text
Base packages are installed.
```

- [x] **Step 2: Install Node.js 22.x**

Run over SSH:

```bash
node --version || true
npm --version || true
```

Expected:

```text
Node.js is within the package.json supported range. If absent, install Node.js 22.x using the repo-approved Linux setup path.
```

- [x] **Step 3: Upload and unpack the approved artifact**

Run over SSH:

```bash
sudo mkdir -p /opt/proxy-gateway-minimal-candidate/releases/<release>
sudo unzip /tmp/proxy-gateway-aws-staging-<release>.zip -d /opt/proxy-gateway-minimal-candidate/releases/<release>
sudo ln -sfn /opt/proxy-gateway-minimal-candidate/releases/<release> /opt/proxy-gateway-minimal-candidate/current
cd /opt/proxy-gateway-minimal-candidate/current
npm ci --omit=dev --no-audit --no-fund
```

Expected:

```text
Release is installed without production env, DB, or secrets.
```

- [x] **Step 4: Create synthetic staging environment**

Use operator-protected synthetic values only:

```text
USER_PORTAL_ROUTES_ENABLED=true
USER_PORTAL_AUTO_ISSUANCE_ENABLED=true
USER_PORTAL_AUTO_ISSUANCE_NODE_ID=channel-aws-staging-a-tuic
SUBSCRIPTION_CONTROL_DB_PATH=/var/lib/proxy-gateway-candidate/subscription-control.sqlite
PROXY_SERVERS_CONFIG_PATH=/opt/proxy-gateway-minimal-candidate/current/config/proxy-servers.aws-staging-tuic.template.json
AWS_STAGING_TUIC_HOST=<staging host or IP strategy>
AWS_STAGING_TUIC_SNI=<staging SNI strategy>
AWS_STAGING_TUIC_UUID=<synthetic value>
AWS_STAGING_TUIC_PASSWORD=<synthetic value>
```

Expected:

```text
Protected env exists on the host and is not printed. No Vultr production material is used.
```

- [x] **Step 5: Initialize synthetic control DB**

Run over SSH:

```bash
cd /opt/proxy-gateway-minimal-candidate/current
npm link
gccgw self check
gccgw install preflight --json
```

Expected:

```text
Self check and install preflight pass. Synthetic DB paths exist with correct ownership.
```

- [x] **Step 6: Install Mihomo and service units**

Run only after service-unit approval:

```bash
sudo systemctl daemon-reload
sudo systemctl enable proxy-gateway-candidate.service
sudo systemctl enable mihomo-tuic.service
```

Expected:

```text
Service units are installed. Services are started only after config-test passes.
```

Result recorded on 2026-06-06:

```text
release: bdc95d46ae4d
host: 54.248.170.34
instance_id: i-08aa4775a099c9a18
artifact_hash: ok
npm_ci: ok
self_check: ok
install_preflight: ok
node: v22.22.3
npm: 10.9.8
proxy-gateway-candidate.service: active/running, restart count 0
mihomo-tuic.service: active/running, restart count 0
nginx.service: active/running, restart count 0
nginx_config_test: ok
mihomo_config_test: ok
public /api/health: 200
public /api/admin/platform/health: 404
public /api/portal/access-requests/current: 401
public /: 404
udp443_listeners: 1
dns: no mutation
production material: not used
live order creation: not performed
```

Detailed execution record:

- `docs/production-replacement-records/2026-06-06-aws-production-like-staging-host-bootstrap.md`

## Gate 5: Staging Validation

Read-only preflight result recorded on 2026-06-06:

```text
release: bdc95d46ae4d
host: 54.248.170.34
instance_id: i-08aa4775a099c9a18
repo branch: feat/install-config-wizard
runtime env file: present
control DB: present
subscription DB: present
portal route keys: present
auto issuance keys: present
edge lifecycle keys: present
edge lifecycle enabled: true
edge lifecycle execution: true
edge material file: absent before any synthetic order
public /api/health: 200
public /api/admin/platform/health: 404
public /api/portal/access-requests/current: 401
public /api/portal/human-challenges: 201
public /api/portal/password/session with empty body: 400
public /: 404
blocker: USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION is absent
live order creation: not performed
subscription artifact generation: not performed
```

Detailed preflight record:

- `docs/production-replacement-records/2026-06-06-aws-production-like-staging-gate5-preflight.md`

The blocker matters because initial synthetic accounts do not yet have a TOTP
or passkey factor. The code requires `USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION=true`
to let a password-only first login create a setup session before the user binds
an authenticator.

- [ ] **Step 1: Validate app service**

Run:

```bash
sudo systemctl restart proxy-gateway-candidate.service
systemctl is-active proxy-gateway-candidate.service
curl -fsS http://127.0.0.1:3456/api/health
```

Expected:

```text
Service is active and loopback health returns 200.
```

- [ ] **Step 2: Validate public boundary**

Run from local:

```powershell
curl.exe -I http://<staging-ip>/api/health
curl.exe -I http://<staging-ip>/api/admin/platform/health
curl.exe -I http://<staging-ip>/api/portal/orders
```

Expected:

```text
Health is reachable, Admin is blocked, and no-session portal APIs reject.
```

- [ ] **Step 3: Validate TUIC listener**

Run over SSH:

```bash
sudo -u <service-user> mihomo -t -d /etc/mihomo -f /etc/mihomo/config.yaml
sudo systemctl restart mihomo-tuic.service
systemctl is-active mihomo-tuic.service
ss -lunp | grep ':443'
```

Expected:

```text
Mihomo config-test passes, service is active, and UDP 443 listener is present.
```

- [ ] **Step 4: Validate synthetic portal/order/subscription flow**

Use synthetic account material generated only for staging.

Expected:

```text
Password login succeeds, synthetic order auto-delivers, subscription artifact is created, rendered profile contains channel-aws-staging-a-tuic, and no production subscription URL or credential is printed.
```

- [ ] **Step 5: Validate imported client behavior**

Expected:

```text
Client import succeeds and the staging TUIC node can complete a host-local or controlled external self-test.
```

## Gate 6: Traffic Accounting Experiment

This gate is the reason for AWS staging. It should happen only after the base staging flow is stable.

**Repo work candidates:**

- Add a traffic usage table keyed by issued subscription/order/credential fingerprint.
- Add a reconciler that reads a safe per-credential usage source.
- Add quota evaluation for active orders.
- Add disable/rotate enforcement through the existing credential lifecycle gateway.
- Add portal/admin readout using aggregate counters only.

- [ ] **Step 1: Determine the measurement source**

Run in staging only:

```text
Inspect whether the active Mihomo/TUIC runtime exposes per-user usage through API, metrics, or safe structured counters.
```

Expected:

```text
Decision recorded: direct runtime metric, safe log-derived metric, sidecar counter, or runtime replacement required.
```

- [ ] **Step 2: Add repository TDD for usage ledger**

Run:

```powershell
node --test server/tests/*traffic*.test.mjs
npm test
```

Expected:

```text
Usage insert, aggregation, quota threshold, disable decision, and idempotent reconciliation tests pass.
```

- [ ] **Step 3: Validate abuse control in staging**

Expected:

```text
A synthetic over-quota credential can be disabled, Mihomo config is reconciled, service reload/restart gate works, and the subscription output no longer gives a usable active node for that credential.
```

## Cleanup And Rollback

- [ ] **Step 1: Stop services**

```bash
sudo systemctl stop proxy-gateway-candidate.service mihomo-tuic.service
```

- [ ] **Step 2: Terminate the AWS instance**

```powershell
aws ec2 terminate-instances --region ap-northeast-1 --instance-ids <instance-id>
aws ec2 wait instance-terminated --region ap-northeast-1 --instance-ids <instance-id>
```

- [ ] **Step 3: Delete temporary AWS resources**

```powershell
aws ec2 delete-security-group --region ap-northeast-1 --group-id <sg-id>
aws ec2 delete-key-pair --region ap-northeast-1 --key-name gccgw-aws-staging-operator-<date>
```

- [ ] **Step 4: Delete local temporary materials**

```powershell
Remove-Item -Recurse -Force .codex-artifacts/aws-staging/<release>
```

Expected:

```text
No AWS staging instance, temporary security group, temporary key pair, or local staging archive remains unless explicitly retained for a follow-up validation window.
```

## Completion Criteria

The AWS production-like staging lane is complete only when:

- the staging environment is created from a clean artifact;
- synthetic control DB and synthetic portal accounts are used;
- portal login, order creation, subscription rendering, and TUIC listener validation pass;
- Admin remains blocked publicly;
- no Vultr production or Aliyun resource is mutated;
- traffic-accounting source feasibility is known;
- cleanup or retention decision is documented;
- all validation evidence is recorded in `docs/production-replacement-records/` without secrets.
