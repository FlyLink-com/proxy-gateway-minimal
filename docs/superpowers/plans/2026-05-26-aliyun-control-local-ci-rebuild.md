# Aliyun Control Local CI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the project toward current Aliyun subscription control, local Linux manual CI, and clean traffic-forwarding edge nodes without mixing production, validation, and node responsibilities.

**Architecture:** The current Aliyun server becomes the future `sub-control-a` candidate only after it exits the CI lane and passes Risk A inventory. A local Linux server becomes the manual CI host. Clean servers become replaceable edge data-plane nodes that do not own subscription state or Admin.

**Tech Stack:** Node.js 22, npm, Git archive transfer, Express proxy-gateway app, SQLite, Nginx, systemd, project docs, `project-state/*.json`, manual CI validation.

---

### Task 1: Land Direction And Source-Of-Truth Updates

**Files:**
- Create: `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`
- Modify: `docs/README.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `docs/PROJECT_TOPOLOGY.md`
- Modify: `docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md`
- Modify: `docs/SUBSCRIPTION_CONTROL_PLANE_NEW_SERVER_RUNBOOK.md`
- Modify: `docs/CI_MANUAL_VALIDATION.md`
- Modify: `docs/PROJECT_SIMPLIFICATION_MAP.md`
- Modify: `project-state/current.json`
- Modify: `project-state/lanes.json`
- Modify: `project-state/tasks.json`

- [ ] **Step 1: Create the active planning document**

Create `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` with these sections:

```markdown
# Aliyun Control / Local CI / Clean Edge Rebuild Plan

Last updated: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Active architecture and Risk A planning document
> - Risk: C for this document; A for any production mutation
> - Execution authority: Does not authorize production, CI-host, DNS, Nginx, SQLite, secret, node, or cutover mutation by itself
> - Production impact: None

## Purpose

The target role split is current Aliyun server for subscription control, local Linux for manual CI, and clean servers for edge forwarding.
```

- [ ] **Step 2: Link the document from the docs index**

Add a row to `docs/README.md` in the Network / Runtime section:

```markdown
| `docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md` | Target rebuild plan for current Aliyun subscription control, local Linux manual CI, and clean traffic-forwarding edge nodes. | Active planning document; no execution authority. | Read before moving CI off Aliyun, preparing Aliyun as control plane, or rebuilding clean edge nodes. |
```

- [ ] **Step 3: Update current context**

In `docs/PROJECT_CONTEXT.md`, update current product direction to state:

```text
The target rebuild direction is current Aliyun server as future production subscription control-plane candidate, local Linux as manual CI, and clean servers as edge data-plane forwarding nodes.
```

- [ ] **Step 4: Update structured project state**

Update `project-state/current.json`, `project-state/lanes.json`, and `project-state/tasks.json` so A2 no longer claims that a clean new server is the preferred first control-plane path. It should instead point to the Aliyun control / local CI / clean edge rebuild plan.

- [ ] **Step 5: Validate direction-only changes**

Run:

```powershell
npm run project-state:check
git diff --check origin/master...HEAD
```

Expected:

```text
project-state:check passes
git diff --check returns no output
```

### Task 2: Prepare Local Linux Manual CI

**Files:**
- Modify: `docs/CI_MANUAL_VALIDATION.md`
- Create: `docs/production-replacement-records/2026-05-26-local-linux-ci-readonly-inventory.md`

- [ ] **Step 1: Collect read-only host inventory**

On the local Linux CI candidate, run:

```bash
hostname
uname -a
df -h
free -h
node --version || true
npm --version || true
git --version || true
ip -br addr
```

Expected:

```text
host identity, OS, disk, memory, Node, npm, git, and network state are recorded without secrets.
```

- [ ] **Step 2: Request approval before mutation**

Use this approval phrase before installing packages or changing host state:

```text
Approve local Linux manual CI bootstrap. No production secrets, no production data, no deploy, no staging.
```

- [ ] **Step 3: Bootstrap Node.js 22 if needed**

Run only after approval:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential python3
node --version
npm --version
git --version
```

Expected:

```text
node is v22.x, npm is available, git is available.
```

- [ ] **Step 4: Validate archive-based CI**

From the Windows checkout:

```powershell
$sha = git rev-parse HEAD
$archive = Join-Path $env:TEMP "proxy-gateway-ci-$sha.tar"
git archive --format=tar --output $archive $sha
scp $archive g@192.168.10.250:/tmp/proxy-gateway-ci-$sha.tar
```

On local Linux:

```bash
archive="$(ls -1 /tmp/proxy-gateway-ci-*.tar | head -n 1)"
sha="$(basename "$archive" | sed -E 's/^proxy-gateway-ci-(.*)\.tar$/\1/')"
workdir="$HOME/proxy-gateway-manual-ci/$(date -u +%Y%m%dT%H%M%SZ)-$sha"
mkdir -p "$workdir"
tar -xf "$archive" -C "$workdir"
cd "$workdir"
npm ci
npm ci --prefix admin
npm test
npm run admin:test
npm run admin:build
```

Expected:

```text
All commands pass.
```

- [ ] **Step 5: Clean validation workspace**

Run:

```bash
cd "$HOME"
rm -rf "$HOME/proxy-gateway-manual-ci"
rm -f /tmp/proxy-gateway-ci-*.tar
rm -rf ~/.npm ~/.cache ~/.config/gh ~/.git-credentials
history -c || true
```

Expected:

```text
No repository checkout, archive, dependency cache, or credentials remain.
```

### Task 3: Retire Aliyun From CI Lane

**Files:**
- Modify: `docs/CI_MANUAL_VALIDATION.md`
- Create: `docs/production-replacement-records/2026-05-26-aliyun-ci-retirement.md`

- [ ] **Step 1: Verify local Linux CI has passed**

Confirm the latest local Linux validation record contains:

```text
npm ci: passed
npm ci --prefix admin: passed
npm test: passed
npm run admin:test: passed
npm run admin:build: passed
cleanup: completed
production touched: no
secrets copied: none
```

- [ ] **Step 2: Inventory Aliyun CI leftovers**

On Aliyun, run read-only checks:

```bash
hostname
find "$HOME" -maxdepth 3 -type d -name "proxy-gateway-manual-ci" -print
find /tmp -maxdepth 1 -type f -name "proxy-gateway-ci-*.tar" -print
ls -la ~/.config/gh 2>/dev/null || true
test -f ~/.git-credentials && echo "git-credentials-present" || echo "git-credentials-absent"
```

Expected:

```text
CI workspaces, archives, and repository credentials are identified by path only.
```

- [ ] **Step 3: Request approval before cleanup**

Use this approval phrase:

```text
Approve Aliyun CI cleanup. No production service changes, no DNS changes, no secret printing, no deploy.
```

- [ ] **Step 4: Clean Aliyun CI artifacts**

Run only after approval:

```bash
cd "$HOME"
rm -rf "$HOME/proxy-gateway-manual-ci"
rm -f /tmp/proxy-gateway-ci-*.tar
rm -rf ~/.npm ~/.cache ~/.config/gh ~/.git-credentials
history -c || true
```

Expected:

```text
Aliyun no longer contains manual CI workspaces, local archives, dependency caches, or repository credentials from manual CI.
```

### Task 4: Inventory Aliyun As Subscription-Control Candidate

**Files:**
- Create: `docs/production-replacement-records/2026-05-26-aliyun-sub-control-readonly-inventory.md`

- [ ] **Step 1: Collect service and listener inventory**

On Aliyun, run:

```bash
hostname
timedatectl
ip -br addr
ss -lntup
systemctl list-units --type=service --state=running
df -h
free -h
node --version || true
npm --version || true
nginx -v 2>&1 || true
```

Expected:

```text
Running services, listeners, OS time, network, disk, memory, Node, npm, and Nginx availability are recorded without secrets.
```

- [ ] **Step 2: Review hard-stop conditions**

Stop if any of these are true:

```text
unmanaged public listeners cannot be explained
the host contains unrelated production secrets
the host cannot be made CI-free
the host cannot run Node.js 22
the host cannot maintain private Admin access
the host cannot keep edge listener ports closed
```

- [ ] **Step 3: Record candidate decision**

Write the decision as one of:

```text
Aliyun is acceptable as sub-control-a candidate after cleanup.
Aliyun is not acceptable; fallback to clean new control-plane host runbook.
Aliyun requires remediation before a decision.
```

### Task 5: Bootstrap Aliyun Candidate Without Authority

**Files:**
- Create: `docs/production-replacement-records/2026-05-26-aliyun-sub-control-candidate-bootstrap.md`

- [ ] **Step 1: Request approval before mutation**

Use this approval phrase:

```text
Approve Aliyun subscription control-plane candidate preparation. No DNS change, no user traffic, no production authority transfer, no edge traffic.
```

- [ ] **Step 2: Deploy validated artifact**

Transfer an approved repository artifact, unpack it under an operator-approved candidate directory, then run:

```bash
npm ci --omit=dev
node --version
npm --version
```

Expected:

```text
Dependencies install without production secrets or SQLite files.
```

- [ ] **Step 3: Start loopback-only candidate app**

Run through a candidate systemd service or explicit shell session with:

```text
CONSOLE_HOST=127.0.0.1
CONSOLE_PORT=3456
```

Expected:

```text
The app listens only on loopback before public boundary validation is approved.
```

- [ ] **Step 4: Validate private candidate behavior**

Run on Aliyun:

```bash
curl -fsS http://127.0.0.1:3456/api/health
curl -i http://127.0.0.1:3456/api/admin/subscriptions
```

Expected:

```text
/api/health returns 200.
Admin route requires Bearer auth.
```

### Task 6: Build Clean Edge Nodes

**Files:**
- Create: `docs/production-replacement-records/2026-05-26-clean-edge-node-prod-edge-a-preflight.md`
- Modify: `docs/PRODUCTION_EDGE_FLEET.md`

- [ ] **Step 1: Choose one edge slot**

Pick exactly one slot per execution:

```text
prod-edge-a replacement
prod-edge-b replacement
prod-edge-c recovery/standby
```

- [ ] **Step 2: Run read-only preflight**

Record:

```text
provider
region
instance target
approved listener set
security boundary
rollback path
whether node is canary-only, active-secondary, or standby
```

- [ ] **Step 3: Request approval before provisioning**

Use this approval phrase:

```text
Approve clean edge node provisioning for prod-edge-a. No subscription authority, no Admin exposure, no production DNS change, no broad traffic cutover.
```

- [ ] **Step 4: Validate edge-only boundary**

After provisioning, verify:

```text
edge listener works
Admin is absent or blocked
subscription app authority is absent
SQLite subscription DB is absent
node is not in production output unless separately approved
rollback path exists
```

### Task 7: Promotion And Legacy Cleanup

**Files:**
- Create: `docs/production-replacement-records/2026-05-26-aliyun-control-promotion-preflight.md`
- Create: `docs/production-replacement-records/2026-05-26-legacy-node-cleanup-preflight.md`

- [ ] **Step 1: Write promotion preflight**

Include:

```text
final backup source
state authority source
DNS strategy
Nginx boundary
Admin private access
subscription refresh validation
opaque artifact validation
edge traffic validation
rollback path
observation window
```

- [ ] **Step 2: Request explicit promotion approval**

Use a separate approval phrase written for the exact promotion record. Do not reuse candidate-preparation approval.

- [ ] **Step 3: Observe before cleanup**

During the observation window, verify:

```text
subscription refresh passes
opaque artifact refresh passes
edge traffic works
Admin remains private
logs do not expose secrets
rollback remains possible
```

- [ ] **Step 4: Clean only after rollback window**

For each old node or old role, create a separate cleanup preflight. Do not terminate instances, close security groups, remove DNS, or delete backups without a dedicated approval and rollback note.
