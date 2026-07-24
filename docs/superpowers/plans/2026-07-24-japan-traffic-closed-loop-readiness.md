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
| `scripts/japan-tuic-additive-repair-runner.mjs` | Import the purpose-bound validator from the reviewed sibling helper installed beside the runner, summarize only its aggregate acceptance fields, and preserve the fixed ZIP's four pre-existing historical entries without adding this helper. |
| `scripts/traffic-usage-collect-once.mjs` | Write the observation after a successful collector-status projection write when the configured store exists. |
| `server/state.mjs` | Construct the optional observation store from `EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH`. |
| `server/tests/japan-tuic-repair-observation.test.mjs` | Prove valid writes, atomic replacement, file bound, and safe rejection. |
| `server/tests/japan-tuic-additive-repair-runner.test.mjs` | Prove the runner accepts only the Japan-specific post-apply observation, imports the installed sibling helper, and preserves the fixed ZIP's four-entry historical contract. |
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

### Task 2: Bind the repair runner to the Japan-specific observation (historical; superseded)

> **Historical design only — do not execute.** The artifact-loading and
> `REQUIRED_ARCHIVE_ENTRIES` instructions below are superseded by **Final Review
> Remediation Tasks 5–8**. The executable design imports the reviewed sibling
> helper from the deployed runner's own installation directory. The fixed
> 2026-07-16 ZIP is still validated against exactly its four pre-existing
> entries (map helper, generic natural-observation validator, collector
> projection helper, and producer-status helper); it does not contain the new
> Japan observation helper.

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Consumes: `buildJapanTuicRepairObservation` from Task 1 and `binding.paths.naturalObservation`.
- Produces: the existing receipt `naturalObservation` fields, populated from the Japan observation record; no receipt schema expansion.

- [ ] **Step 1: Historical test intent (superseded; do not execute)**

The original proposal updated the reviewed archive-entry fixture to require
`server/services/platform/japan-tuic-repair-observation.mjs`. It is retained
as history only: do not add that helper to the ZIP fixture. Tasks 5–8 instead
test an installed sibling-helper import, a four-entry fixed ZIP, and rejection
of a generic observation-shaped record without
`type: "japan_tuic_repair_observation"`.

- [ ] **Step 2: Historical RED command (superseded; do not execute)**

Run: `node --test server/tests/japan-tuic-additive-repair-runner.test.mjs`

Historical expected result: failure before the original artifact-helper design.
Do not restore or execute this expectation; Tasks 5–8 replace it with the
installed-sibling-helper and fixed-four-entry contract.

- [ ] **Step 3: Historical adapter change (superseded; do not execute)**

The original proposal replaced the dynamic import of
`scripts/traffic-accounting-natural-observation.mjs` with
`server/services/platform/japan-tuic-repair-observation.mjs` and added that
new helper to `REQUIRED_ARCHIVE_ENTRIES`. It is retained as history only. Do
not add a new archive entry or import a new helper from the artifact; implement
the final installed-sibling-helper design in Tasks 5–8 instead.

- [ ] **Step 4: Historical verification (superseded; do not execute)**

Run: `node --check scripts/japan-tuic-additive-repair-runner.mjs`

Run: `node --test server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs`

Historical expected result: pass for the discarded artifact-helper design. The
current verification checklist is in Tasks 6–8 and Task 9.

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

## Final Review Remediation

The first whole-branch review found two deterministic integration defects: the
frozen repair ZIP cannot contain a helper introduced by this source branch, and
the runner re-parsed the aggregate record written by the store as though it
were a full collector projection. The following remediation replaces only that
incompatible boundary; it does not loosen any production gate.

### Task 5: Consume the persisted aggregate observation directly

**Files:**
- Modify: `server/services/platform/japan-tuic-repair-observation.mjs`
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-repair-observation.test.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

**Interfaces:**
- Produces: `validateJapanTuicRepairObservation(input)`, which accepts only the exact aggregate record emitted by `buildJapanTuicRepairObservation`.
- Consumes: `binding.paths.naturalObservation` as that aggregate record, not a collector projection.

- [ ] **Step 1: Write RED integration tests**

Create one real temporary file through `createJapanTuicRepairObservationStore.write({ projection })`; pass that same path to `createHostOperations(...).readNaturalObservation()` and assert the existing aggregate summary. Add a negative case for a valid-shape record with a wrong type or an unknown field.

- [ ] **Step 2: Implement exact aggregate validation**

Export a validator that requires exactly `schemaVersion`, `type`, `capturedAt`, `collectorCount`, `unresolvedTotal`, `japanTuicUnresolved`, and `accepted`; require `schemaVersion: "1"`, `type: "japan_tuic_repair_observation"`, canonical ISO time, non-negative safe integers, `unresolvedTotal: 0`, `japanTuicUnresolved: 0`, and `accepted: true`. The builder returns this validator's result. The runner reads and directly validates the persisted aggregate; it does not call the projection builder a second time.

- [ ] **Step 3: Verify**

Run: `node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/japan-tuic-additive-repair-contract.test.mjs`

Expected: pass, including real store-to-runner observation consumption.

### Task 6: Keep the helper outside the frozen ZIP and close configuration gaps

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/services/platform/japan-tuic-repair-observation.mjs`
- Modify: `server/state.mjs`
- Modify: `scripts/traffic-usage-collect-once.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`
- Modify: `server/tests/japan-tuic-repair-observation.test.mjs`
- Modify: `server/tests/traffic-usage-collect-once.test.mjs`

**Interfaces:**
- The runner imports the reviewed sibling helper from its own installed directory, not from the fixed 2026-07-16 artifact. The ZIP continues to provide only the pre-existing reviewed map helper and unrelated fixed archive entries.
- `EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH` is valid only when a collector-status path is configured and the two resolved paths differ.

- [ ] **Step 1: Write RED tests**

Assert that the archive entry list no longer requires the new helper and that the host adapter dynamically imports the installed sibling helper. Assert state construction rejects an observation path without a status path and rejects equal resolved paths. Assert when an observation store is configured and the status snapshot write fails, the collector emits only the existing redacted status failure plus the fixed observation failure and returns non-zero.

- [ ] **Step 2: Implement no-artifact helper loading and bounded reads**

Resolve the helper path from `dirname(fileURLToPath(import.meta.url))`; add no new archive requirement. Use a Japan observation read bound of `256 * 1024` bytes. Preserve all artifact identity checks for the existing archive. Do not change the original frozen artifact identity.

- [ ] **Step 3: Implement safe directory/config behavior**

Do not chmod an existing parent directory. Create a missing dedicated parent at `0700`; keep the temporary and final record at `0600`. In runtime state, reject the observation configuration unless both paths exist in config and their resolved paths differ. In the collector, when the observation store is configured, a missing status projection after a successful raw report is a redacted failure and exit code `1`.

- [ ] **Step 4: Verify**

Run: `node --check scripts/japan-tuic-additive-repair-runner.mjs`

Run: `node --check server/state.mjs`

Run: `node --check scripts/traffic-usage-collect-once.mjs`

Run: `node --test server/tests/japan-tuic-repair-observation.test.mjs server/tests/japan-tuic-additive-repair-runner.test.mjs server/tests/traffic-usage-collect-once.test.mjs server/tests/state.test.mjs`

Expected: pass.

### Task 7: Reconcile documentation and repeat final review

**Files:**
- Modify: `docs/GITHUB_DEPLOYMENT_RUNBOOK.md`
- Modify: `docs/CURRENT_RELEASE_STATE.md`

- [ ] **Step 1: Record the corrected source boundary**

State that the deployed forced-command runner and its sibling helper must match the reviewed source release before bootstrap; the fixed map-repair artifact remains unchanged and cannot be used as proof that a newer host helper is deployed. Keep all source-only and later Risk A gates unchanged.

- [ ] **Step 2: Run full validation and final review**

Run: `git diff --check origin/master...HEAD`

Run: `npm run docs:authority:check`

Run: `npm test`

Then request a new whole-branch review. Do not push or open the Draft PR until that review has no Critical or Important findings.

### Task 8: Restore the frozen artifact entry contract

**Files:**
- Modify: `scripts/japan-tuic-additive-repair-runner.mjs`
- Modify: `server/tests/japan-tuic-additive-repair-runner.test.mjs`

- [ ] **Step 1: Restore the pre-existing generic natural-observation helper to `REQUIRED_ARCHIVE_ENTRIES`**

The fixed 2026-07-16 ZIP must continue to prove all four historical entries: the map helper, generic natural-observation validator, collector projection helper, and producer-status helper. Do not add the new Japan observation helper to this ZIP contract.

- [ ] **Step 2: Restore the four-entry test fixture and run focused runner tests**

Run: `node --test server/tests/japan-tuic-additive-repair-runner.test.mjs`

Expected: pass.

### Task 9: Mark the superseded artifact-helper design as historical

**Files:**
- Modify: `docs/superpowers/plans/2026-07-24-japan-traffic-closed-loop-readiness.md`

- [ ] **Step 1: Reconcile Task 2 and the file-responsibility table**

Mark every Task 2 claim that imports the new Japan helper from the frozen
artifact or adds it to `REQUIRED_ARCHIVE_ENTRIES` as **historical, superseded
by Final Review Remediation Tasks 5–8, and not executable**. Update the Files
table and test responsibility so the only executable design is: the deployed
forced-command runner dynamically imports its reviewed sibling helper from its
own installation directory, while the fixed ZIP continues to validate exactly
four pre-existing historical entries. Add a no-regression checklist: future
changes must neither add the Japan helper to the ZIP nor use artifact contents
as proof that the newer sibling helper is deployed.

- [ ] **Step 2: Verify the implementation handoff cannot revive the obsolete design**

Before executing Tasks 5–8 or any follow-on repair, confirm all of the
following in the implementation and its focused tests:

- the runner resolves and imports its reviewed sibling helper from the deployed
  installation directory;
- `REQUIRED_ARCHIVE_ENTRIES` contains exactly the four historical entries;
- the Japan observation helper is absent from the fixed ZIP contract; and
- artifact identity checks remain limited to the existing fixed ZIP and are not
  treated as deployment proof for the sibling helper.

- [ ] **Step 3: Repeat final validation and review**

Run: `git diff --check origin/master...HEAD`

Run: `npm run docs:authority:check`

Run: `npm test`

Request a fresh whole-branch review before publishing.
