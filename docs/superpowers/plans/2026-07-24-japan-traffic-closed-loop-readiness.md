# Japan TUIC Repair Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Japan TUIC additive-map repair accept only a later, timer-written Japan-scoped collector observation, without depending on the unrelated Singapore connection-delta sidecar.

**Architecture:** The existing repair runner will retain its backup, post-apply, timer-stability, rollback, and self-revoking SSH controls. Replace only its generic offline natural-observation input with a purpose-bound Japan observation produced from the already-redacted main collector projection after each successful timer pass. The new record is separate from the status projection and receives no runtime payload, map, secret, SQLite row, or customer data.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing traffic collector status store, existing Japan additive-repair runner and GitHub workflow.

## Global Constraints

- Risk: B for this source-only PR; production deployment, environment configuration, CI identity bootstrap, and repair dispatch remain separate Risk A gates.
- Preserve `gccgw-traffic-usage-collect.timer`; the repair runner must never manually invoke, restart, enable, or disable the collector unit.
- A valid Japan observation must be later than the repair apply boundary, must not precede the Japan TUIC collector's valid `lastCollectorSuccessAt`, and must prove an available redacted collector projection with `runOk`, `rawReportOk`, `recordingOk`, zero global unresolved count, no omitted collectors, and the Japan TUIC collector at `healthy:ok` with `unresolvedCount=0`.
- The Japan observation must not require or claim a Singapore sidecar observation. It is a Japan map-repair acceptance record, not a whole-fleet traffic-accounting certification.
- The observation file is an absolute configured path, atomically replaced, mode `0600`, bounded to 256 KiB, and distinct from the existing collector-status path.
- Do not output or persist secrets, endpoint values, raw environment/config files, protected maps, UUIDs, credential references, SQLite rows, runtime payloads, or customer data.
- Keep the runner's artifact identity, two stable candidate snapshots, backup, rollback, final aggregate Identity Gate, host-key self-revocation, and GitHub-secret cleanup behavior unchanged.
- Do not create CI credentials, modify a host, set GitHub secrets, dispatch a workflow, or mutate a protected map in this PR.

---

## Root Cause

- `scripts/japan-tuic-additive-repair-runner.mjs` requires a newer protected observation after map apply and rolls back when it is absent or invalid.
- The repository has a generic offline validator but no writer for its input. The existing timer writes a redacted collector projection only.
- That generic validator also requires a Singapore sidecar flag, even though the map repair changes only the Japan TUIC identity map. Treating an unobserved sidecar as `true` would be a false attestation.

## Files and Responsibilities

| File | Responsibility |
| --- | --- |
| `server/services/platform/japan-tuic-repair-observation.mjs` | Validate and atomically persist a bounded Japan-only observation from an already-redacted collector projection. |
| `scripts/japan-tuic-additive-repair-runner.mjs` | Import the purpose-bound validator from the reviewed artifact and summarize only its aggregate acceptance fields. |
| `scripts/traffic-usage-collect-once.mjs` | Write the observation after a successful collector-status projection write when the configured store exists. |
| `server/state.mjs` | Construct the optional observation store from `EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH`. |
| `server/tests/japan-tuic-repair-observation.test.mjs` | Prove valid writes, atomic replacement, file bound, and safe rejection. |
| `server/tests/japan-tuic-additive-repair-runner.test.mjs` | Prove the runner accepts only the Japan-specific post-apply observation and packages the new helper in the artifact. |
| `server/tests/traffic-usage-collect-once.test.mjs` | Prove correct post-status ordering and fail-closed writer behavior. |
| `docs/GITHUB_DEPLOYMENT_RUNBOOK.md` | Record that the new source prerequisite must be deployed and naturally observed twice before the existing CI bootstrap gate.

### Task 1: Add the Japan-scoped observation contract

**Files:**
- Create: `server/services/platform/japan-tuic-repair-observation.mjs`
- Create: `server/tests/japan-tuic-repair-observation.test.mjs`

**Interfaces:**
- Produces: `buildJapanTuicRepairObservation({ projection })` and `createJapanTuicRepairObservationStore({ filePath })`.
- The build function returns exactly:

```js
{
  schemaVersion: "1",
  type: "japan_tuic_repair_observation",
  capturedAt: projection.observedAt,
  collectorCount: projection.run.collectorCount,
  unresolvedTotal: projection.accounting.unresolvedCount,
  japanTuicUnresolved: japanCollector.unresolvedCount,
  accepted: true
}
```

- The store exposes `write({ projection })` and returns the same aggregate object. It writes that object only, not the projection itself.

- [ ] **Step 1: Write failing contract/store tests**

Create a valid redacted projection fixture with `availability: "available"`, `run.runOk: true`, `run.rawReportOk: true`, `accounting.recordingOk: true`, `accounting.unresolvedCount: 0`, `omittedCollectorCount: 0`, and one `channel-vultr-a-tuic` collector at `healthy:ok` with `unresolvedCount: 0`. Assert `accepted: true`, mode `0600`, and that serialized output does not include a protected fixture marker. Add negative cases for a missing Japan collector, an earlier/invalid timestamp, a non-zero unresolved count, an omitted collector, and a non-absolute path.

- [ ] **Step 2: Run the focused test to witness RED**

Run: `node --test server/tests/japan-tuic-repair-observation.test.mjs`

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the bounded atomic store**

Implement exact validator rules from the Global Constraints. Reject data without returning protected fields. `createJapanTuicRepairObservationStore` must reject non-absolute paths, read no existing contents, create the parent directory with mode `0700`, write a same-directory exclusive temporary JSON file at `0600`, rename atomically, and reject a serialized payload over `256 * 1024` bytes.

- [ ] **Step 4: Run focused tests**

Run: `node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/traffic-collector-admin-projection.test.mjs`

Expected: pass.

### Task 2: Bind the repair runner to the Japan-specific observation

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: `buildJapanTuicRepairObservation` from Task 1 and `binding.paths.naturalObservation`.
- Produces: the existing receipt `naturalObservation` fields, populated from the Japan observation record; no receipt schema expansion.

- [ ] **Step 1: Write failing runner tests**

Update the reviewed archive-entry fixture to require `server/services/platform/japan-tuic-repair-observation.mjs`. Add a host-adapter test where a valid Japan record produces the existing aggregate summary. Add a negative test showing that a generic observation-shaped record without `type: "japan_tuic_repair_observation"` is rejected.

- [ ] **Step 2: Run focused tests to witness RED**

Run: `node --test server/tests/japan-tuic-additive-repair-runner.test.mjs`

Expected: failure until the runner imports the new helper and requires the new archive entry.

- [ ] **Step 3: Implement the narrow adapter change**

Replace the dynamic import of `scripts/traffic-accounting-natural-observation.mjs` with `server/services/platform/japan-tuic-repair-observation.mjs`; call `buildJapanTuicRepairObservation({ projection: input })` on the bounded JSON file. Keep the existing `naturalObservationSummary` field names and keep the later-than-apply-boundary/timer-state checks unchanged. Add the helper to `REQUIRED_ARCHIVE_ENTRIES`.

- [ ] **Step 4: Run focused verification**

Run: `node --check scripts/japan-tuic-additive-repair-runner.mjs`

Run: `node --test server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs`

Expected: pass.

### Task 3: Write observations after successful collector status snapshots

**Files:**
- Modify: `server/state.mjs`
- Modify: `scripts/traffic-usage-collect-once.mjs`
- Modify: `server/tests/traffic-usage-collect-once.test.mjs`

**Interfaces:**
- Consumes: `EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH`, `trafficCollectorStatusStore.write({ summary, observedAt })`, and `createJapanTuicRepairObservationStore`.
- Produces: `state.platform.japanTuicRepairObservationStore` with `write({ projection })` or `null` when the path is not configured.

- [ ] **Step 1: Add failing collector tests**

Inject a fake status store and observation store. Assert the collector writes status first, then writes exactly the returned status projection to the observation store. Assert that an observation-store failure writes only a redacted `japan_tuic_repair_observation_snapshot` failure object to stderr and returns exit code `1`; it must not call systemd or retry.

- [ ] **Step 2: Run the focused test to witness RED**

Run: `node --test server/tests/traffic-usage-collect-once.test.mjs`

Expected: failure until runtime state exposes and the script invokes the observation store.

- [ ] **Step 3: Wire the optional store**

In `createRuntimeState`, read only `EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH` through `optionalEnvText` and construct the store when non-empty. In `runTrafficUsageCollectOnce`, retain the projection returned from `statusStore.write`, then call `observationStore.write({ projection })` only when `summary.ok === true`, `summary.rawReportOk === true`, and a store is present. Any write failure is redacted and turns the run into a non-zero result.

- [ ] **Step 4: Run focused verification**

Run: `node --check server/state.mjs`

Run: `node --check scripts/traffic-usage-collect-once.mjs`

Run: `node --test server/tests/traffic-usage-collect-once.test.mjs server/tests/japan-tuic-repair-observation.test.mjs`

Expected: pass.

### Task 4: Source closeout and production prerequisites

**Files:**
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- Modify: `docs/CURRENT_RELEASE_STATE.md`

**Interfaces:**
- Consumes: verified Tasks 1–3 source changes.
- Produces: one Draft B-tier source PR with deployment prerequisites; no production mutation.

- [ ] **Step 1: Document the exact separation**

State that the source PR neither deploys the writer nor creates credentials, secrets, bindings, systemd units, map changes, or a workflow run. The later A-tier sequence is: deploy the reviewed control-plane source; configure one protected observation file path; wait for two naturally timer-written accepted observations; complete fresh aggregate preflight; bootstrap the temporary forced-command identity; dispatch one run; then prove host and GitHub cleanup.

- [ ] **Step 2: Run complete source validation**

Run: `git diff --check origin/master...HEAD`

Run: `npm test`

Expected: zero diff errors and zero test failures.

- [ ] **Step 3: Commit for final whole-branch review**

Run: `git add server/services/platform/japan-tuic-repair-observation.mjs scripts/japan-tuic-additive-repair-runner.mjs scripts/traffic-usage-collect-once.mjs server/state.mjs server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/traffic-usage-collect-once.test.mjs docs/GITHUB_DEPLOYMENT_RUNBOOK.md docs/CURRENT_RELEASE_STATE.md docs/superpowers/plans/2026-07-24-japan-traffic-closed-loop-readiness.md`

Run: `git commit -m "feat: persist Japan TUIC repair observations"`

After final whole-branch review, open one Draft PR. Its body must state `Risk: B source-only`, `release_unit: control-plane-app`, `identity_impact: true`, exact test results, and all deferred Risk A gates.

## Self-Review

- Scope: Tasks 1–3 create only a Japan map-repair observation path; Task 4 keeps deployment and CI execution outside this PR.
- Safety: the writer accepts only an already-redacted projection, writes a bounded aggregate record, and fails closed; runner backup/rollback behavior is unchanged.
- Independence: no task marks an absent Singapore sidecar healthy or treats source merge as production evidence.
