# AWS Staging Lifecycle And Usage Gate 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, in AWS staging only, that the latest local lifecycle fan-out and runtime usage accounting code can operate together before any production promotion.

**Architecture:** Package the current working-tree candidate as an explicit staging artifact, deploy only to the existing AWS production-like staging host, use synthetic orders and synthetic runtime observations, and verify that multi-channel lifecycle writes fan out while usage observations record against `edgeCredentialRef` in the control ledger. Keep runtime mutation, production traffic, and public Admin blocked unless an explicit staging step authorizes them.

**Tech Stack:** Node.js 22.x, SQLite staging control store, existing AWS staging EC2 host `54.248.170.34`, `proxy-gateway-candidate.service`, existing edge runtime adapters, existing usage collectors and traffic accounting services.

---

## Boundary

- Risk: A for AWS staging execution; B for local package/test preparation.
- Target is AWS staging only: `54.248.170.34`, `i-08aa4775a099c9a18`, `sg-0927469a10053fa98`.
- No Vultr production mutation.
- No Aliyun mutation.
- No DNS mutation.
- No Nginx config or reload.
- No provider security group mutation except temporary SSH ingress explicitly approved for this gate.
- No customer data, production secrets, live production subscription issuance, payment, public Admin, subscription URL/token/password output, SQLite row dump, raw env output, raw log output, raw runtime config output, or raw controller payload output.
- Synthetic orders and synthetic usage only.
- Production promotion requires a separate approval after this gate passes.

## Files

- Use existing code:
  - `server/state.mjs`
  - `server/services/edge/order-credential-lifecycle.mjs`
  - `server/services/platform/runtime-usage-accounting.mjs`
  - `server/tests/state.test.mjs`
- Create staging artifact under:
  - `.codex-artifacts/aws-staging/<release>/proxy-gateway-aws-staging-<release>.zip`
- Add execution record after staging proof:
  - `docs/production-replacement-records/2026-06-08-aws-staging-gate11-lifecycle-usage-proof.md`

## Task 1: Local Candidate Verification

- [ ] **Step 1: Run targeted lifecycle and usage tests**

Run:

```powershell
node --test server/tests/state.test.mjs server/tests/edge-order-credential-lifecycle.test.mjs server/tests/edge-vless-hy2-runtime-adapters.test.mjs server/tests/edge-hysteria2-usage-collector.test.mjs server/tests/edge-mihomo-tuic-usage-collector.test.mjs server/tests/platform-traffic-accounting.test.mjs server/tests/platform-usage-quota-lifecycle-gate.test.mjs
```

Expected:

```text
All targeted tests pass.
```

- [ ] **Step 2: Run complete server validation**

Run:

```powershell
npm test
git diff --check
```

Expected:

```text
All server tests pass and diff check exits 0.
```

## Task 2: Build Explicit Staging Artifact

- [ ] **Step 1: Create release ID and package directory**

Run:

```powershell
$Release = "lifecycle-usage-gate11-20260608-001"
$OutDir = "D:\Projects\proxy-gateway-minimal\.codex-artifacts\aws-staging\$Release"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
```

Expected:

```text
The artifact directory exists.
```

- [ ] **Step 2: Copy package source without local runtime debris**

Run a workspace packaging command that includes source files, `package.json`, `package-lock.json`, `config`, `scripts`, `bin`, `server`, `public`, and required docs, and excludes `.git`, `node_modules`, `.codex-artifacts`, raw logs, local temp files, and protected materials.

Expected:

```text
The staging artifact contains source code only and no protected runtime materials.
```

- [ ] **Step 3: Compute artifact SHA256**

Run:

```powershell
Get-FileHash "$OutDir\proxy-gateway-aws-staging-$Release.zip" -Algorithm SHA256
```

Expected:

```text
The SHA256 is available for the exact staging approval packet.
```

## Task 3: AWS Staging Read-Only Preflight

- [ ] **Step 1: Verify AWS target inventory**

Run read-only AWS CLI checks for:

- instance state;
- attached security group;
- public IP;
- current SSH source requirement;
- no unexpected production target.

Expected:

```text
The target remains the AWS staging host and no production host is selected.
```

- [ ] **Step 2: Verify public boundary without mutation**

Run public checks against the staging host:

- health endpoint returns 200;
- public Admin remains 404;
- no-session portal order API rejects.

Expected:

```text
The staging boundary is intact before deployment.
```

## Task 4: Exact AWS Staging Approval Packet

- [ ] **Step 1: Request exact staging approval**

Approval packet must include:

- release;
- artifact SHA256;
- artifact path;
- target host;
- instance ID;
- security group;
- temporary SSH source;
- services allowed to restart;
- validation list;
- rollback procedure;
- forbidden outputs and forbidden mutations.

Expected:

```text
No AWS mutation occurs until the exact approval packet is approved.
```

## Task 5: AWS Staging Execution After Approval

- [ ] **Step 1: Deploy candidate runtime**

Allowed staging actions:

- add temporary SSH ingress from approved source;
- upload approved artifact;
- verify artifact SHA256 on host;
- back up current staging runtime symlink and protected staging env paths;
- unpack to a new staging release directory;
- run `npm ci`;
- switch only the staging `current` symlink;
- restart `proxy-gateway-candidate.service` only.

Expected:

```text
The staging proxy service is active and public boundaries remain intact.
```

- [ ] **Step 2: Run synthetic lifecycle and usage proof**

Run only synthetic proof commands that verify:

- multi-channel lifecycle fan-out produces per-channel redacted receipts;
- usage observations record against `edgeCredentialRef`;
- usage rollup updates without raw SQLite output;
- quota-over-limit creates a control-plane disable decision without direct runtime mutation by default.

Expected:

```text
The proof records a redacted conclusion: passed, blocked, or aggregate-only.
```

- [ ] **Step 3: Clean up temporary access**

Remove temporary SSH ingress and temporary proof files.

Expected:

```text
Temporary SSH access is removed and rollback remains possible.
```

## Self-Review

- Spec coverage: covers local validation, explicit artifact, AWS read-only preflight, approval packet, staging execution, synthetic lifecycle proof, synthetic usage proof, and cleanup.
- Placeholder scan: production deployment, live order creation, and provider changes outside temporary SSH ingress remain explicitly forbidden.
- Weakest assumption: the staging runtime has enough synthetic configuration to exercise runtime adapters without exposing raw config. If that fails, Gate 11 must stop as blocked and not infer production readiness.
