# AWS Staging Runtime Usage Collector Gate 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, in AWS staging only, whether a real loopback-bound runtime metrics surface can produce per-order traffic observations that map to `edgeCredentialRef`.

**Architecture:** Keep the existing durable usage ledger and `createMihomoTuicUsageCollector` contract. Add a narrow loopback-only snapshot reader that can inspect a runtime controller response, convert supported per-credential entries into the existing collector shape, and fail closed as `aggregateOnly` when the runtime exposes only node-level counters. Add a staging proof script that prints only redacted mapping conclusions.

**Tech Stack:** Node.js 22.x, SQLite control store, Mihomo external-controller or equivalent loopback metrics surface, existing `traffic-accounting` service, existing AWS staging host.

---

## Boundary

- Risk: A for AWS staging execution; B/C for repo-only implementation.
- This plan does not authorize production, Vultr, Aliyun, DNS, Nginx, payment, public Admin, customer-data, or live-subscription mutation.
- Runtime controller access must bind to `127.0.0.1` or `[::1]` only.
- Public controller exposure is a hard stop.
- Outputs must not include subscription URLs, tokens, passwords, raw controller payloads, raw YAML, raw SQLite rows, raw environment values, raw logs, or runtime config.

## Files

- Create: `server/services/edge/mihomo-external-controller-usage-reader.mjs`
- Create: `server/tests/edge-mihomo-external-controller-usage-reader.test.mjs`
- Create: `scripts/aws-staging-runtime-usage-proof.mjs`
- Modify: `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`
- Add execution record after staging proof: `docs/production-replacement-records/2026-06-06-aws-staging-gate7-runtime-usage-proof.md`

## Task 1: Loopback Metrics Reader

- [x] **Step 1: Write reader tests**

Add tests that assert:

- non-loopback controller URLs are rejected;
- aggregate-only payloads are converted into a safe aggregate snapshot and later fail closed in `createMihomoTuicUsageCollector`;
- payloads that contain `edgeCredentialRef`, `uploadBytes`, and `downloadBytes` become safe observations;
- raw controller fields such as URL, secret, UUID, password, remote address, and raw config are not returned.

Run:

```powershell
node --test server/tests/edge-mihomo-external-controller-usage-reader.test.mjs
```

Expected first run before implementation:

```text
FAIL because the reader module does not exist.
```

- [x] **Step 2: Implement the minimal reader**

Implement `createMihomoExternalControllerUsageSnapshotReader` with dependency-injected `fetchJson`.

Required behavior:

- accept only `http://127.0.0.1:*`, `http://localhost:*`, or `http://[::1]:*`;
- read a configured metrics path, default `/traffic`;
- add `Authorization: Bearer <secret>` only when a secret is supplied;
- return a safe snapshot containing only `sourceRef`, timestamps, `entries`, or `aggregate`;
- never return the controller URL, secret, raw payload, connection metadata, UUID, or password.

- [x] **Step 3: Run targeted tests**

Run:

```powershell
node --test server/tests/edge-mihomo-external-controller-usage-reader.test.mjs server/tests/edge-mihomo-tuic-usage-collector.test.mjs server/tests/platform-traffic-accounting.test.mjs
```

Expected:

```text
All targeted tests pass.
```

## Task 2: Staging Proof Script

- [x] **Step 1: Add redacted proof script**

Create `scripts/aws-staging-runtime-usage-proof.mjs`.

The script must:

- read only staging-safe environment values;
- instantiate the loopback reader and `createMihomoTuicUsageCollector`;
- optionally record observations into the control store only when `USAGE_PROOF_RECORD=true`;
- print a redacted JSON conclusion:
  - `controllerLoopbackOnly`;
  - `collectorStatus`;
  - `observationCount`;
  - `mappedObservationCount`;
  - `aggregateOnlyBlocked`;
  - `usageLedgerRecorded`;
  - `quotaDecision`;
  - `sensitiveOutputSuppressed`.

The script must not print raw URLs, tokens, passwords, controller payloads, SQLite rows, config, or logs.

- [x] **Step 2: Add script tests if behavior is factored into a service**

The script stayed as simple wiring around tested services, so no extra service
split was added.

## Task 3: Local Verification and Artifact

- [ ] **Step 1: Run local tests**

Run:

```powershell
npm test
git diff --check
```

Expected:

```text
All server tests pass and diff check exits 0.
```

- [ ] **Step 2: Commit repo-only implementation**

Run:

```powershell
git add server/services/edge/mihomo-external-controller-usage-reader.mjs server/tests/edge-mihomo-external-controller-usage-reader.test.mjs scripts/aws-staging-runtime-usage-proof.mjs docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md docs/superpowers/plans/2026-06-06-aws-staging-runtime-usage-collector-gate7.md
git commit -m "Add runtime usage collector proof gate"
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
Artifact hash is ready for Gate 7 approval.
```

## Task 4: AWS Staging Gate 7 Execution

- [ ] **Step 1: Request exact approval**

Approval packet must include release, artifact SHA256, target host, instance ID, security group, temporary SSH source, runtime controller loopback-only scope, service restart scope, validation, rollback, and forbidden outputs.

- [ ] **Step 2: Execute after approval only**

Allowed staging actions:

- add temporary SSH ingress from approved source;
- deploy candidate runtime release;
- back up protected staging env and Mihomo config;
- enable controller or equivalent metrics on loopback only;
- config-test;
- restart `proxy-gateway-candidate.service` and `mihomo-tuic.service` only after config-test passes;
- create synthetic order and synthetic traffic only;
- run redacted proof script;
- remove temporary SSH ingress.

- [ ] **Step 3: Record outcome**

Record whether the runtime produced:

- per-credential usage mapped to `edgeCredentialRef`; or
- aggregate-only usage, which blocks quota enforcement; or
- no usable usage source.

## Self-Review

- Spec coverage: covers repo implementation, staging proof, redacted output, rollback, and failure modes.
- Placeholder scan: no open implementation authority or production mutation is granted.
- Weakest assumption: Mihomo may not expose per-user TUIC byte counters. If it only exposes aggregate traffic, Gate 7 must record `collector_not_supported` and stop before quota-driven disable/revoke.
