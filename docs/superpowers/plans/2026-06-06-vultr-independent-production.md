# Vultr Independent Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring up an independent Vultr candidate for `globalcirclecat.cloud`, validate the user portal, subscription issuance, and UDP channel behavior, and only then promote DNS away from the Aliyun runtime.

**Architecture:** Provision one Vultr production-candidate VM, deploy the existing Node/Nginx/static portal runtime, and install a local Mihomo TUIC edge service managed by systemd. Keep Aliyun untouched during candidate validation; DNS promotion is a separate final gate because `globalcirclecat.cloud` currently delegates to HiChina nameservers.

**Tech Stack:** Vultr CLI/API, Ubuntu 24.04 LTS, Node.js runtime, SQLite control DB, Nginx, systemd, Mihomo TUIC, project scripts and tests.

---

## Fixed Deployment Choices

- Domain: `globalcirclecat.cloud`
- Portal host: `portal.globalcirclecat.cloud`
- Subscription host: `sub.globalcirclecat.cloud`
- Candidate region: Vultr Tokyo `nrt`
- Candidate plan: `vhp-4c-8gb-amd`
- OS: Ubuntu 24.04 LTS x64 (`2284`)
- Aliyun impact: none until explicit DNS promotion; no mutation to Aliyun server, Nginx, firewall, DB, or runtime.
- Admin exposure: private only; never expose Admin routes publicly.
- Secret handling: do not print API keys, console tokens, subscription URLs, database rows, Mihomo credentials, or raw runtime env.

## Rollback Boundaries

- Before DNS promotion: destroy or stop the Vultr candidate; Aliyun remains untouched.
- After DNS promotion: restore prior DNS records or nameserver delegation and keep Vultr candidate online for observation until DNS TTL drains.
- Runtime rollback: restore previous release symlink, service unit files, protected env backup, and Mihomo config backup on the Vultr host.

## Task 1: Local Preflight

**Files:**
- Read: `D:/Projects/proxy-gateway-minimal/docs/PROJECT_CONTEXT.md`
- Read: `D:/Projects/proxy-gateway-minimal/package.json`
- Validate: current git worktree

- [ ] **Step 1: Confirm repository state**

Run:

```powershell
git status --short --branch
```

Expected: current branch is clean or only contains this plan file before commit.

- [ ] **Step 2: Confirm Vultr account can be read without exposing secrets**

Run:

```powershell
$env:VULTR_API_KEY = [Environment]::GetEnvironmentVariable('VULTR_API_KEY','User')
& 'C:\Users\g\AppData\Local\Programs\vultr-cli\vultr-cli.exe' account info
```

Expected: account info returns successfully; do not copy API key.

- [ ] **Step 3: Confirm current DNS delegation**

Run:

```powershell
Invoke-RestMethod -Uri 'https://dns.google/resolve?name=globalcirclecat.cloud&type=NS'
```

Expected: current delegation is recorded. If nameservers remain HiChina, DNS cutover requires a registrar/DNS gate.

## Task 2: Local Validation

**Files:**
- Test: `D:/Projects/proxy-gateway-minimal/server/tests/*.test.mjs`
- Test: `D:/Projects/proxy-gateway-minimal/admin`

- [ ] **Step 1: Run server tests**

Run:

```powershell
npm test
```

Expected: all server tests pass.

- [ ] **Step 2: Run Admin tests**

Run:

```powershell
npm run admin:test
```

Expected: Admin test suite passes.

- [ ] **Step 3: Build Admin portal**

Run:

```powershell
npm run admin:build
npm run admin:portal:build
npm run project-state:check
```

Expected: builds pass and project state validation passes.

## Task 3: Vultr Candidate Provisioning

**Files:**
- Create remote host only; no repository mutation required.

- [ ] **Step 1: Upload an SSH public key if none exists**

Run:

```powershell
$env:VULTR_API_KEY = [Environment]::GetEnvironmentVariable('VULTR_API_KEY','User')
ssh-keygen -y -f "$env:USERPROFILE\.ssh\gao_new.pem" > "$env:TEMP\gccgw-vultr.pub"
& 'C:\Users\g\AppData\Local\Programs\vultr-cli\vultr-cli.exe' ssh-key create --name gccgw-vultr-operator --ssh-key (Get-Content "$env:TEMP\gccgw-vultr.pub" -Raw)
```

Expected: one operator SSH key exists in Vultr.

- [ ] **Step 2: Create a restricted firewall group**

Run:

```powershell
& 'C:\Users\g\AppData\Local\Programs\vultr-cli\vultr-cli.exe' firewall group create --description gccgw-vultr-candidate
```

Expected: one firewall group exists with no public Admin ports.

- [ ] **Step 3: Add only required firewall rules**

Rules:

```text
TCP 22: operator source /32 only
TCP 80: 0.0.0.0/0
TCP 443: 0.0.0.0/0
UDP 443: 0.0.0.0/0
```

Expected: SSH is scoped; public web and UDP channel ports are open; Admin private ports are closed.

- [ ] **Step 4: Create the Vultr candidate instance**

Run:

```powershell
& 'C:\Users\g\AppData\Local\Programs\vultr-cli\vultr-cli.exe' instance create --region nrt --plan vhp-4c-8gb-amd --os 2284 --label gccgw-vultr-candidate --tag gccgw --tag candidate --ssh-keys <ssh-key-id> --firewall-group <firewall-group-id>
```

Expected: instance reaches running status and exposes one public IPv4 address.

## Task 4: Runtime Bootstrap

**Files:**
- Remote: `/opt/proxy-gateway-minimal-candidate`
- Remote: `/etc/systemd/system/proxy-gateway-candidate.service`
- Remote: `/etc/nginx/sites-available/globalcirclecat-cloud.conf`
- Remote: `/etc/mihomo/config.yaml`

- [ ] **Step 1: Install base runtime packages**

Run over SSH:

```bash
apt-get update
apt-get install -y ca-certificates curl git nginx sqlite3 ufw jq
```

Expected: base packages install without exposing secrets.

- [ ] **Step 2: Install Node.js runtime**

Run over SSH:

```bash
node --version || true
npm --version || true
```

Expected: supported Node.js is installed before app start. If absent, install the repo-approved Node.js runtime.

- [ ] **Step 3: Deploy app release**

Package local repository excluding `.git`, secrets, logs, DB files, and generated sensitive handoff material; upload to `/opt/proxy-gateway-minimal-candidate/releases/<release>`.

Expected: remote release contains source, `package-lock.json`, built Admin assets, and no secrets.

- [ ] **Step 4: Install protected environment**

Create remote protected `.env` with operator-provided values only. Do not print the file.

Expected: service has required portal routes, auto issuance, DB path, and channel material without public Admin exposure.

- [ ] **Step 5: Install systemd services**

Install `proxy-gateway-candidate.service` and `mihomo-tuic.service` with restricted read/write paths.

Expected: `systemctl daemon-reload` succeeds; services can be enabled after validation.

## Task 5: Candidate Validation

**Files:**
- Remote app logs are inspected only for status lines; do not print raw logs.

- [ ] **Step 1: Validate app health**

Run:

```bash
curl -fsS http://127.0.0.1:<app-port>/api/health
```

Expected: HTTP 200.

- [ ] **Step 2: Validate public boundary**

Run from local:

```powershell
curl.exe -I http://<candidate-ip>/api/health
curl.exe -I http://<candidate-ip>/api/admin/platform/health
```

Expected: health is reachable; Admin is blocked.

- [ ] **Step 3: Validate portal static**

Run:

```powershell
curl.exe -I http://<candidate-ip>/
```

Expected: portal/static route returns a normal static response.

- [ ] **Step 4: Validate no-session API rejection**

Run:

```powershell
curl.exe -i http://<candidate-ip>/api/portal/orders
```

Expected: rejected without a valid portal session.

- [ ] **Step 5: Validate UDP channel**

Run:

```bash
ss -lunp | grep ':443'
systemctl is-active mihomo-tuic.service
```

Expected: UDP 443 listener exists and Mihomo service is active after config-test.

## Task 6: DNS Promotion

**Files:**
- DNS provider only.

- [ ] **Step 1: Decide DNS mode**

Options:

```text
Option A: keep HiChina DNS and add A records to the Vultr IP.
Option B: create Vultr DNS zone and change registrar nameservers to Vultr DNS.
```

Expected: if the goal is "fully independent from Aliyun", choose Option B. If registrar access is unavailable, stop before DNS promotion and report blocker.

- [ ] **Step 2: Promote records**

Records:

```text
globalcirclecat.cloud A <vultr-ip>
portal.globalcirclecat.cloud A <vultr-ip>
sub.globalcirclecat.cloud A <vultr-ip>
```

Expected: DNS resolves to Vultr IP from public resolvers.

- [ ] **Step 3: HTTPS certificate**

Run on host:

```bash
certbot --nginx -d globalcirclecat.cloud -d portal.globalcirclecat.cloud -d sub.globalcirclecat.cloud
```

Expected: HTTPS succeeds and Admin remains blocked.

## Task 7: Post-Promotion Observation

**Files:**
- Create: `docs/production-replacement-records/2026-06-06-vultr-independent-production.md`

- [ ] **Step 1: Run smoke checks**

Run:

```powershell
curl.exe -I https://portal.globalcirclecat.cloud/
curl.exe -I https://sub.globalcirclecat.cloud/api/health
```

Expected: public portal and health succeed.

- [ ] **Step 2: Run subscription import validation**

Create a controlled test order only if explicitly allowed by the current gate; do not print subscription URL.

Expected: subscription imports into Clash/Mihomo and selected proxy does not timeout.

- [ ] **Step 3: Write production record**

Record:

```text
release, host class, DNS mode, validation status, rollback pointer, blocked/follow-up items
```

Expected: no secrets, no raw logs, no raw DB rows.

---

## Self-Review

- Spec coverage: covers Vultr candidate creation, runtime bootstrap, portal, subscription, UDP channel, DNS independence, validation, and rollback.
- Placeholder scan: operational placeholders remain only where values must come from safe runtime discovery (`<candidate-ip>`, `<ssh-key-id>`, `<firewall-group-id>`, `<release>`). They must be filled from command output during execution and must not contain secrets.
- Type consistency: domain, region, plan, service names, and validation targets are consistent across tasks.
