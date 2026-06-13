# Aliyun Local Edge Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:test-driven-development` for implementation. This plan is scoped
> to repo-only code, tests, templates, and dry-run CLI behavior. It does not
> authorize Aliyun production mutation.

**Goal:** Add repo-only support for an Aliyun local production edge channel with
credential lifecycle policy and redacted desired-state reconciliation planning.

**Architecture:** The Aliyun control plane remains the business authority for
orders and expiry. A new reconciliation planner compares desired credentials
with current managed credentials and emits redacted add, revoke, rotate, and
unchanged counts. Runtime apply remains fail-closed until a later production
adapter is implemented and separately approved.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON templates, existing
`gccgw` CLI.

---

## Scope

This implementation covers:

- desired-state reconciliation planning for `mihomo-tuic`;
- redacted reports that do not print raw credential material;
- explicit restart activation modeling;
- an Aliyun local TUIC channel template;
- CLI dry-run exposure for reconciliation planning;
- stable-pool and data-plane lifecycle policy checks for the Aliyun local
  channel.

This implementation does not cover:

- writing production Mihomo config;
- running `systemctl`;
- restarting `mihomo-tuic.service`;
- changing Aliyun Nginx, DNS, firewall, or service env;
- generating live accounts, passwords, tokens, subscription URLs, or payment
  state;
- live order creation during validation.

## Files

- Create `server/services/edge/credential-reconciliation-gateway.mjs`
  - Validate full desired/current credential snapshots.
  - Build redacted reconciliation plans.
  - Keep apply fail-closed without production adapter.
- Create `server/tests/edge-credential-reconciliation-gateway.test.mjs`
  - Cover add/revoke/rotate/unchanged planning.
  - Cover sensitive material redaction.
  - Cover fail-closed apply behavior.
- Modify `server/services/cli/router.mjs`
  - Add `gccgw edge credentials reconcile-plan --input <state.json> --json`.
  - Add `gccgw edge credentials apply --input <state.json> --execute-production-mutation --json`
    as a fail-closed command until runtime adapter exists.
- Modify `server/tests/cli-router.test.mjs`
  - Cover command resolution and redacted output.
- Create `config/proxy-servers.aliyun-local-tuic.template.json`
  - Define a provider-neutral Aliyun local TUIC logical channel.
  - Mark it `credentialMode=per-order`.
  - Model explicit restart lifecycle surface.
- Create `.codex-artifacts/aliyun-local-edge-desired-state.template.json`
  - Provide a non-secret synthetic desired/current-state fixture for dry-run
    planning.
- Update `docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md`
  - Add Aliyun local edge first-phase note.

## Task 1: Reconciliation Planner

**Files:**

- Create `server/tests/edge-credential-reconciliation-gateway.test.mjs`
- Create `server/services/edge/credential-reconciliation-gateway.mjs`

Steps:

1. Write a failing test for a plan where desired has one new credential, current
   has one stale credential, one credential has a changed digest, and one is
   unchanged.
2. Run:
   ```powershell
   node --test server\tests\edge-credential-reconciliation-gateway.test.mjs --test-name-pattern "reconciliation plan computes add revoke rotate and unchanged"
   ```
   Expected result before implementation: module import failure or function not
   defined.
3. Implement `buildCredentialReconciliationPlan`.
4. Re-run the focused test and verify it passes.
5. Add tests for raw sensitive field rejection and output redaction.
6. Implement sensitive-field scanning and redacted digest-only output.
7. Add tests for `buildCredentialReconciliationApplyPlan` fail-closed behavior.
8. Implement apply plan wrapper that requires `executeProductionMutation` and
   still returns `production_runtime_adapter_required` for explicit restart.

## Task 2: CLI Dry-Run Surface

**Files:**

- Modify `server/services/cli/router.mjs`
- Modify `server/tests/cli-router.test.mjs`

Steps:

1. Write a failing test that resolves:
   ```text
   gccgw edge credentials reconcile-plan --input desired-state.json --json
   ```
2. Add command registry entries and resolver support.
3. Add a failing test that `runProxyGatewayCli` returns a redacted reconciliation
   plan.
4. Wire CLI execution to `buildCredentialReconciliationPlan`.
5. Add a failing test that `gccgw edge credentials apply` remains Risk A and
   fail-closed.
6. Wire apply to `buildCredentialReconciliationApplyPlan`.

## Task 3: Aliyun Local Channel Template

**Files:**

- Create `config/proxy-servers.aliyun-local-tuic.template.json`
- Create `.codex-artifacts/aliyun-local-edge-desired-state.template.json`

Steps:

1. Create a non-secret proxy config template with one logical channel:
   `channel-aliyun-a-tuic`.
2. Use placeholders for runtime values:
   `${ALIYUN_TUIC_HOST}`, `${ALIYUN_TUIC_UUID}`, `${ALIYUN_TUIC_PASSWORD}`,
   `${ALIYUN_TUIC_SNI}`.
3. Include:
   - `physicalNodeRef=aliyun-control-a`;
   - `channelPool=stable`;
   - `protocol=tuic`;
   - `credentialMode=per-order`;
   - `credentialLifecycle.addCredential=true`;
   - `credentialLifecycle.disableCredential=true`;
   - `credentialLifecycle.rotateCredential=true`;
   - `credentialLifecycle.restart=true`;
   - `stableProtocolApproved=true`;
   - `stableProtocolApprovalRef=aliyun-local-tuic-explicit-restart`.
4. Run:
   ```powershell
   node bin\gccgw.mjs node policy-check --config config\proxy-servers.aliyun-local-tuic.template.json --json
   node bin\gccgw.mjs node data-plane-lifecycle-policy --config config\proxy-servers.aliyun-local-tuic.template.json --json
   ```
   Expected: both `ok=true`, with explicit warnings but no blockers.

## Task 4: Design Doc Update

**Files:**

- Modify `docs/EDGE_CREDENTIAL_RECONCILIATION_GATEWAY_DESIGN.md`

Steps:

1. Add a short Aliyun local edge first-phase section.
2. State that Aliyun local edge reduces cross-node transport complexity but does
   not remove production apply gates.
3. State that the node runtime service and config path must remain separate
   from the control-plane service and config.

## Validation

Run focused tests:

```powershell
node --test server\tests\edge-credential-reconciliation-gateway.test.mjs
node --test server\tests\edge-mihomo-tuic-runtime-adapter.test.mjs
node --test server\tests\edge-tuic-credential-lifecycle.test.mjs server\tests\subscription-channel-policy.test.mjs server\tests\cli-router.test.mjs --test-name-pattern "credentials|lifecycle|policy-check|data-plane-lifecycle|TUIC|reconciliation"
```

Run policy dry-runs:

```powershell
node bin\gccgw.mjs node policy-check --config config\proxy-servers.aliyun-local-tuic.template.json --json
node bin\gccgw.mjs node data-plane-lifecycle-policy --config config\proxy-servers.aliyun-local-tuic.template.json --json
node bin\gccgw.mjs edge credentials reconcile-plan --input .codex-artifacts\aliyun-local-edge-desired-state.template.json --json
```

Run project checks:

```powershell
npm run project-state:check
npm test
git diff --check
```

## Production Gate After Repo Work

Production activation requires a separate exact Risk A approval that names:

- Aliyun target host;
- runtime service name;
- protected config path;
- protected backup path;
- candidate release and archive hash;
- restart scope;
- validation commands;
- rollback procedure;
- forbidden surfaces.

Until that gate passes, the Aliyun local edge channel is a reviewed template and
policy candidate only.

## Implementation Status

Completed in repository only:

- safe multi-channel lifecycle metadata and policy checks;
- Aliyun local TUIC logical channel template;
- desired-state reconciliation plan and execution-gated apply boundary;
- injected Mihomo TUIC explicit-restart adapter core with config-test,
  backup/replace/restart/validation sequencing;
- redacted receipt handling that rejects unsafe runtime adapter output.

Still requires a separate A-tier production gate:

- protected material source wiring on the Aliyun host;
- protected runtime file paths and backup directory;
- reviewed runtime wrapper that injects the adapter dependencies;
- actual `mihomo-tuic.service` restart and post-restart validation;
- rollback receipt recording.
