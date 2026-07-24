# Japan TUIC New Artifact Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Bind the additive-only Japan TUIC repair to a new immutable source artifact and a new non-replayable production gate, while preserving the stable identity counts and leaving stale entries retained.

**Architecture:** JAPAN_TUIC_REPAIR_GATE is the single source of truth for gate basis, execution gate, artifact run, ZIP identity, source commit, and identity counts. The workflow downloads and verifies that exact artifact in both secretless preflight and environment-gated execution; the production action remains separately approved.

**Tech Stack:** Node.js 22 ESM, node:test, GitHub Actions, Git archive, SHA-256.

## Global Constraints

- Source commit: 70880d83761b165e91e9c521ec480fcc840375fb.
- Artifact run: 30092196734; artifact: proxy-gateway-japan-tuic-additive-repair-20260724-001.
- ZIP: proxy-gateway-japan-tuic-additive-repair-20260724-001.zip; size: 4829111; SHA-256: 43d5cea28dc70b838f95706690b45282297b1dae3cfe3b76ab941660ed7a83fe.
- Gate basis: japan-tuic-identity-additive-repair-20260724-003.
- Execution gate: github-actions-japan-tuic-additive-repair-20260724-002.
- Candidate: add=3, remove=0, deferred_remove=46, deferred_changed=0, missing_material=0, projected_map=82.
- Identity remains degraded with retention pending; no deletion, restart, schema change, quota action, or production repair is included.

---

### Task 1: Freeze the new artifact and gate identity

**Files:**
- Modify: scripts/japan-tuic-additive-repair-contract.mjs
- Modify: server/tests/japan-tuic-additive-repair-contract.test.mjs
- Modify: server/tests/japan-tuic-additive-repair-runner.test.mjs

**Interfaces:**
- Consumes: JAPAN_TUIC_REPAIR_GATE.artifact.
- Produces: a contract that accepts only run 30092196734 and execution gate github-actions-japan-tuic-additive-repair-20260724-002.

- [x] **Step 1: Write the failing test**

Assert that validateArtifactIdentity accepts the exact ZIP fields above and that JAPAN_TUIC_REPAIR_GATE.executionGateId equals github-actions-japan-tuic-additive-repair-20260724-002.

- [x] **Step 2: Run the focused tests**

Run: node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs

Expected: FAIL because the old artifact and old gate remain frozen.

- [x] **Step 3: Make the minimal contract rebind**

Set ARTIFACT_SHA256 and TOOL_SOURCE_COMMIT to the verified values; set the artifact run, file name, size, gate basis, execution gate, and test fixtures to the exact values in Global Constraints. Update the runner authorization marker fixture to derive from the new gate ID.

- [x] **Step 4: Re-run the focused tests**

Expected: exit 0.

### Task 2: Bind both workflow phases to the immutable artifact

**Files:**
- Modify: .github/workflows/japan-runtime-config-additive-repair.yml
- Test: server/tests/japan-tuic-additive-repair-contract.test.mjs

**Interfaces:**
- Consumes: artifact fields frozen by Task 1.
- Produces: preflight and execution jobs that download the same artifact from run 30092196734 and preflight-check its Git tree at source commit 70880d83761b165e91e9c521ec480fcc840375fb.

- [x] **Step 1: Write failing workflow assertions**

Read the workflow in the contract test and assert it contains run-id 30092196734, artifact name proxy-gateway-japan-tuic-additive-repair-20260724-001, the exact ZIP filename, the source commit, and the new execution gate string.

- [x] **Step 2: Run the focused contract test**

Run: node --test server/tests/japan-tuic-additive-repair-contract.test.mjs

Expected: initial RED against the prior frozen binding; final rerun exits 0.

- [x] **Step 3: Replace every old artifact reference**

In both preflight and execute jobs, replace artifact name, run-id, ZIP filename, trusted-source checkout, and tree-verifier commit with the exact new values. Do not change SSH, Environment, or cleanup behavior.

- [x] **Step 4: Re-run the focused contract test**

Expected: exit 0.

### Task 3: Document the source-only gate and validate the branch

**Files:**
- Modify: docs/GITHUB_DEPLOYMENT_RUNBOOK.md

**Interfaces:**
- Consumes: the exact artifact and gate values from Tasks 1 and 2.
- Produces: an operator record that distinguishes source/artifact readiness from production approval.

- [x] **Step 1: Update the runbook**

Record the new artifact run, source commit, ZIP identity, execution gate, additive candidate, and identity state. State that stale=46 remains retention pending and a fresh Environment approval plus host binding is required.

- [x] **Step 2: Run full validation**

Run:
node --check scripts/japan-tuic-additive-repair-contract.mjs
node --check scripts/japan-tuic-additive-repair-runner.mjs
node --test server/tests/japan-tuic-additive-repair-contract.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs
npm test
npm run project-state:check
git diff --check origin/master...HEAD

Expected: every command exits 0.

- [ ] **Step 3: Open the source-only PR**

The PR declares release_unit=japan-runtime-config, identity_impact=true, and production_state=not_deployed. It includes artifact evidence, non-goals, validation, and the separate final production gate.

## Self-Review

- Coverage: Tasks 1-2 bind the new artifact and gate through contract and workflow; Task 3 records scope and validation.
- No placeholders: all artifact, count, gate, and source identities are exact.
- Consistency: production tests and workflow consume the same contract values.

## Execution Handoff

Execute inline in this isolated worktree. Do not dispatch the production repair from this plan.
