# Japan TUIC Bootstrap Probe and Receipt Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Prove the GitHub-to-restricted-runner transport, aggregate receipt, and automatic host-authorization revocation without allowing a map mutation; then require a new identity for any later production execution.

**Architecture:** A new manual, Environment-protected probe workflow streams an intentionally empty artifact to the existing forced command. The runner must stop before backup/apply with `artifact_identity_mismatch`, emit a contract-valid aggregate receipt, and revoke its marked authorization. The existing production workflow gains a sanitized failure summary when a receipt cannot be validated, so a failed transport is never represented as a production result.

**Tech Stack:** GitHub Actions, Node.js 22 ESM, node:test, OpenSSH restricted forced command.

## Global Constraints

- The probe is manual-only and must use `vultr-japan-production`; it reads only the same five temporary `JAPAN_CI_*` Environment secrets.
- It must not download an artifact, use `--apply`, start/restart/enable/disable a service or timer, invoke the collector, open a shell, use PTY/forwarding/SCP/rsync, or change a map.
- It streams zero artifact bytes and expects `stopped_pre_apply`, `artifact_identity_mismatch`, `hostCredentialCleanup=verified`, and `closeout=github_cleanup_pending`.
- A probe consumes its temporary identity. After a successful probe, delete all five temporary secrets and verify both host authorization and secret absence before generating a separate final execution identity.
- The production workflow remains the sole map-apply path and still requires a fresh exact Risk A execution Gate and independent Environment approval.

---

### Task 1: Add a receipt-preserving bootstrap probe workflow

**Files:**
- Create: `.github/workflows/japan-runtime-config-bootstrap-probe.yml`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

**Interfaces:**
- Consumes: the five `JAPAN_CI_*` Environment secrets, `scripts/japan-tuic-merged-pr-approval.mjs`, and `scripts/japan-tuic-additive-repair-contract.mjs`.
- Produces: a manually dispatched, Environment-protected aggregate receipt whose only accepted result is the intentional pre-apply stop.

- [ ] **Step 1: Write failing workflow assertions**

Add assertions that the new workflow has only `workflow_dispatch` with `approval_pr`; pins checkout/setup-node actions; validates merged-PR authorization before the first `JAPAN_CI_` reference; uses the protected Environment; streams `/dev/null` through the restricted SSH command; validates a `stopped_pre_apply` receipt with `artifact_identity_mismatch` and verified host cleanup; and cleans runner material with `if: always()`.

- [ ] **Step 2: Run the focused workflow test**

Run: `node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs`

Expected: FAIL because the probe workflow does not exist.

- [ ] **Step 3: Implement the minimal probe workflow**

Use the same strict SSH options as the production workflow. Capture stdout only in a private temporary receipt file, run `node scripts/japan-tuic-additive-repair-contract.mjs receipt`, append only the validated aggregate receipt to `GITHUB_STEP_SUMMARY`, and exit nonzero unless the SSH exit code is `2` and the four expected aggregate fields match. Remove key, known-hosts, receipt, validated receipt, and SSH error files in an always-run cleanup step.

- [ ] **Step 4: Re-run focused test**

Run: `node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs`

Expected: PASS.

### Task 2: Make production receipt-validation failure explicit and safe

**Files:**
- Modify: `.github/workflows/japan-runtime-config-additive-repair.yml`
- Modify: `server/tests/japan-tuic-additive-repair-workflow.test.mjs`

**Interfaces:**
- Consumes: a private receipt file from restricted SSH.
- Produces: a summary that states only `receipt_validation_failed_without_production_claim` when contract validation fails; it never prints SSH stderr, host values, key material, or an unvalidated receipt.

- [ ] **Step 1: Write failing assertion**

Assert the production workflow traps receipt-contract failure, emits the exact safe summary marker, and exits nonzero before the acceptance check.

- [ ] **Step 2: Run focused test**

Run: `node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs`

Expected: FAIL because the safe marker and failure branch are absent.

- [ ] **Step 3: Implement the failure branch**

Wrap only the receipt-contract command in an `if ! ...; then` branch. Append the fixed marker to `GITHUB_STEP_SUMMARY`, exit `1`, and retain the existing always-run runner-material cleanup. Do not print the input receipt or SSH error file.

- [ ] **Step 4: Re-run focused test**

Run: `node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs`

Expected: PASS.

### Task 3: Record the new Bootstrap and execution boundaries

**Files:**
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`

**Interfaces:**
- Consumes: the probe workflow and its aggregate expected receipt.
- Produces: a runbook sequence requiring probe cleanup before a new final execution identity.

- [ ] **Step 1: Update the runbook**

Add the probe as a Bootstrap prerequisite. State that it intentionally stops before apply, consumes the probe identity, and must be followed by host/key and five-secret deletion readbacks before a separately generated execution identity. State that an execution receipt-validation failure does not prove apply, rollback, or cleanup.

- [ ] **Step 2: Run source validation**

Run:
`node --check scripts/japan-tuic-additive-repair-contract.mjs`
`node --test server/tests/japan-tuic-additive-repair-workflow.test.mjs`
`npm test`
`git diff --check origin/master...HEAD`

Expected: all commands exit 0.

### Task 4: Merge and execute fresh Risk A gates

**Files:**
- No source edits.

**Interfaces:**
- Consumes: exact merged fix commit, a reviewed probe workflow, fresh host inventory, and a new temporary identity.
- Produces: either a validated probe closeout or a stopped Gate; only a validated probe permits fresh execution bootstrap.

- [ ] **Step 1: Merge Gate**

Create one B-source PR, require final-head review by an account other than the future dispatcher, wait for `Validate`, merge at the exact head, and confirm the new merge commit checks complete.

- [ ] **Step 2: Fresh Bootstrap probe Gate**

Read host/service/timer/map aggregates; install a new restricted probe identity whose `authorized_keys` comment exactly equals its root-owned binding marker; write the five temporary Environment secrets; dispatch the probe from `gccltdco-cmd`; obtain independent `gaoyi1020-web` Environment approval; require the expected stopped-pre-apply receipt; then verify host marker absence and delete the five secret names.

- [ ] **Step 3: Fresh final Bootstrap and execution Gate**

Only after the probe cleanup readbacks pass, repeat fresh inventory, install a separate final restricted identity, create an exact new execution authorization record, dispatch one production workflow from `gccltdco-cmd`, require independent `gaoyi1020-web` Environment approval, and accept only an independently verified postflight map state before reporting closed-loop success.

## Self-Review

- The probe cannot reach the map-helper apply path because it streams zero bytes and must stop at artifact identity validation.
- The production workflow never prints unvalidated receipts or SSH errors.
- The probe and final execution identities are distinct and both are deleted with readback.
- No production retry is authorized by this plan; Task 4 requires a new exact execution Gate.

## Execution Handoff

Execute inline in this isolated worktree. Do not dispatch a probe or production workflow before the source PR is merged and the fresh Risk A bootstrap inventory is complete.
