# AWS Staging Hysteria2 Usage Proof Gate 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, in AWS staging only, whether Hysteria2 clear-mode traffic stats can map runtime bytes to order-scoped `edgeCredentialRef` values.

**Architecture:** Keep the existing traffic ledger, quota decision service, and repo-only `createHysteria2UsageCollector` adapter. Deploy the current candidate runtime to the existing AWS production-like staging host, configure a staging-only Hysteria2 runtime with loopback-only Traffic Stats API, create synthetic order credentials where the Hy2 client ID equals `edgeCredentialRef`, generate synthetic traffic, and run a redacted proof script that records only safe mapping conclusions.

**Tech Stack:** Node.js 22.x, SQLite staging control DB, Hysteria2 Traffic Stats API, existing AWS staging EC2 host, systemd, existing subscription-control services.

---

## Boundary

- Risk: A for AWS staging execution; B/C for repo-only implementation.
- Target is AWS staging only: `54.248.170.34`, `i-08aa4775a099c9a18`, `sg-0927469a10053fa98`.
- No Vultr production mutation.
- No Aliyun mutation.
- No DNS mutation.
- No Nginx config or reload.
- No provider firewall/security group mutation except temporary SSH ingress explicitly approved for this gate.
- No customer data, production secrets, live subscription issuance, payment, public Admin, subscription URL/token/password output, SQLite row dump, raw env output, raw log output, or raw runtime config output.
- Hysteria2 Traffic Stats API must bind to loopback only.
- Synthetic traffic only.
- Quota-over-limit decisions must remain control-plane conclusions. Runtime disable/revoke is not authorized by this gate.

## Files

- Create: `scripts/aws-staging-hysteria2-usage-proof.mjs`
- Create: `server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs`
- Modify: `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`
- Add execution record after staging proof: `docs/production-replacement-records/2026-06-06-aws-staging-gate8-hysteria2-usage-proof.md`

## Task 1: Repo-Only Proof Script

- [x] **Step 1: Write failing script test**

Add `server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs` to assert:

- proof script fetches loopback `/traffic?clear=1`;
- `Authorization` header is set when a secret is provided;
- stdout contains only redacted conclusion fields;
- stdout does not contain API secret, client IDs, loopback URL, public URL, raw payload, subscription URL, token, password, or config;
- non-loopback Traffic Stats API URLs fail closed.

Run:

```powershell
node --test server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs
```

Expected before implementation:

```text
FAIL because scripts/aws-staging-hysteria2-usage-proof.mjs does not exist.
```

- [x] **Step 2: Implement minimal proof script**

Create `scripts/aws-staging-hysteria2-usage-proof.mjs`.

Required behavior:

- accept only loopback HTTP Traffic Stats API URLs;
- always call stats with `clear=1`;
- pass API secret through `Authorization` header without printing it;
- call `createHysteria2UsageCollector`;
- optionally record observations when `HY2_USAGE_PROOF_RECORD=true` and a staging control DB path is provided;
- print only:
  - `ok`;
  - `trafficStatsLoopbackOnly`;
  - `readClearMode`;
  - `collectorStatus`;
  - `accountingMode`;
  - `observationCount`;
  - `mappedObservationCount`;
  - `usageLedgerRecorded`;
  - `quotaDecision`;
  - `blockers`;
  - `sensitiveOutputSuppressed`.

- [x] **Step 3: Run targeted tests**

Run:

```powershell
node --test server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs server/tests/edge-hysteria2-usage-collector.test.mjs server/tests/platform-traffic-accounting.test.mjs
```

Expected:

```text
All targeted tests pass.
```

## Task 2: Local Verification and Artifact

- [ ] **Step 1: Run complete local validation**

Run:

```powershell
npm test
git diff --check
```

Expected:

```text
All server tests pass and diff check exits 0.
```

- [ ] **Step 2: Commit repo-only Gate 8 preparation**

Run:

```powershell
git add scripts/aws-staging-hysteria2-usage-proof.mjs server/tests/aws-staging-hysteria2-usage-proof-script.test.mjs docs/superpowers/plans/2026-06-06-aws-staging-hysteria2-usage-proof-gate8.md
git commit -m "Add Hysteria2 staging usage proof gate"
```

- [ ] **Step 3: Build staging artifact**

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
Artifact hash is ready for Gate 8 approval.
```

## Task 3: AWS Staging Gate 8 Execution

- [ ] **Step 1: Request exact approval**

Approval packet must include:

- release;
- artifact SHA256;
- artifact path;
- target host;
- instance ID;
- security group;
- temporary SSH source;
- Hysteria2 runtime scope;
- Traffic Stats API loopback-only scope;
- service restart scope;
- synthetic-only traffic proof scope;
- validation;
- rollback;
- forbidden outputs and forbidden mutations.

- [ ] **Step 2: Execute after exact approval only**

Allowed staging actions:

- add temporary SSH ingress from approved source;
- deploy approved candidate runtime release;
- back up protected staging environment and Hysteria2 config paths;
- install or validate Hysteria2 runtime on AWS staging only;
- configure one staging-only Hy2 client ID equal to a synthetic `edgeCredentialRef`;
- enable Traffic Stats API on loopback only with protected secret;
- run config validation before service restart;
- restart approved staging services only;
- create synthetic order and synthetic traffic only;
- run `scripts/aws-staging-hysteria2-usage-proof.mjs`;
- remove temporary SSH ingress and temporary proof files after validation.

- [ ] **Step 3: Record outcome**

Record one of:

- `per_credential_mapped`: Hy2 stats mapped to `edgeCredentialRef`, ledger sample/rollup recorded, quota decision safe;
- `collector_not_supported`: runtime did not expose client-ID keyed stats as expected;
- `blocked`: service, listener, stats API, synthetic traffic, or validation failed before usage proof.

## Self-Review

- Spec coverage: covers repo script, target staging proof, redacted output, loopback-only API, synthetic traffic, rollback, and failure modes.
- Placeholder scan: no production mutation or broad cloud permission is granted.
- Weakest assumption: staging Hysteria2 can be configured with a client ID that exactly equals `edgeCredentialRef` and can produce enough synthetic traffic for a non-zero clear-mode stats sample. If this fails, Gate 8 must record a blocked proof rather than infer quota readiness.
