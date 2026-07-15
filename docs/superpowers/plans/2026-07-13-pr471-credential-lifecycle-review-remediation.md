# PR #471 Credential Lifecycle Review Remediation Implementation Plan

> **For implementation:** Use `superpowers:subagent-driven-development` task by task, with a fresh implementer and task reviewer for each task. Follow RED -> GREEN -> REFACTOR and do not start a later task before the current task review is approved.

**Goal:** Close the four unresolved review findings on merged PR #471 with one source-only Draft PR: deliver credential-scoped revocation tombstones end to end, keep read-only preflight consistent with the mutable desired-state projection, preserve mutation evidence for compensating refresh rollback, and let remote agent-driven refreshes reach an applied receipt.

**Architecture:** Keep SQLite/control-plane records as the desired-state source of truth. Credential-filtered agents receive deterministic scoped projections; an empty scoped projection is an explicit tombstone and its receipt must resolve to the same deterministic reference. Refresh keeps synchronous applied behavior unchanged, but accepts only an explicit remote-handoff pending disposition after the new order is durably saved and a real remote desired-state notification is recorded. Receipt-backed subscription rendering remains fail-closed until the matching agent receipt arrives.

**Tech Stack:** Node.js ESM, built-in `node:test` and `assert`, `better-sqlite3`, existing edge lifecycle/material store abstractions, Git/GitHub Draft PR.

## Risk and Gate

- **Risk:** A — these source changes affect runtime credential identity and revocation semantics.
- **Process:** live read-only inventory -> isolated worktree -> exact source-only approval -> serial TDD -> per-task independent review -> full local validation -> Draft PR.
- **Expected PR count:** 1.
- **Validation:** four focused `node --test` suites, full `npm test`, and `git diff --check origin/master...HEAD`.
- **Production/AWS impact:** none in this plan. Do not access providers, inject credentials, SSH, mutate a runtime, deploy, or promote.
- **Authorized scope:** source, tests, and this plan only. A later production promotion requires a separate exact Risk A gate, backup, identity-gate before/after evidence, validation, and rollback approval.

## Global Constraints

1. Never output or persist secrets, tokens, subscription URLs, raw runtime configuration, database rows, UUIDs, or customer data. Tests use synthetic values only and assertions remain redacted/count based.
2. Do not touch the user-owned untracked `.codex/config.toml` in the main checkout. Work only in `D:\Projects\proxy-gateway-minimal\.worktrees\fix-pr471-credential-lifecycle-review` on `codex/fix-pr471-credential-lifecycle-review`.
3. The base is `origin/master` at `70ec822c72aff0c77fad0a071023beb25339018a`. Do not rebase onto unrelated work during implementation.
4. Preserve legacy tombstone capability gating: protocol `< 1.1` or missing either `empty_desired_state` / `tombstone_reconcile` must not receive an empty desired state.
5. **Superseded historical constraint:** the original protocol 1.1 plan modeled scoped revocation only as an empty desired state with a zero-count receipt. The current protocol 1.2 contract below replaces that rule while retaining the empty-active-set special case.
6. Mutable and read-only desired-state projections must have the same active-row rules and tombstone behavior. Historical rows establish that an explicit empty desired state exists; an entirely unknown channel still returns `null`.
7. `ok: false, mutation: true` from refresh reconciliation is a failed apply that may have changed runtime. It must trigger `order_refresh_rolled_back` against the previous request before the original failure is returned.
8. A pending refresh is accepted only when the lifecycle result explicitly identifies remote handoff (`runtimeReceipt.status === "pending"` with `nextAction === "complete_data_plane_handoff"`, or an equivalent fully classified fanout) and a real remote desired-state notification was recorded (`notificationCount > 0`). A generic plan/dry-run, an unclassified report, or a pending result without such notification must restore the prior material/order and return the existing pending error.
9. Matching remote receipt remains the authority for runtime applied state. Do not weaken `createReceiptBackedSubscriptionChannelGate`, synthesize an applied receipt, or claim pending as applied.
10. Keep the implementation minimal: no schema/migration, Redis, queue, cluster, new external dependency, provider action, deploy script, or unrelated refactor.

## Current scoped-lineage contract (protocol 1.2)

This section supersedes the protocol 1.1 empty-only scoped-lineage statements in historical Task 1. The negotiated capability is `scoped_tombstone_lineage`; no additional capability, fallback, dual mode, or credential-level authorization is introduced.

- Authority remains the authenticated node/channel token and adapter contract. `edgeCredentialRefs` is a lineage selector, not an authority boundary.
- For a single authoritative channel with active credentials A and B and selected revoked lineage R, the scoped desired state is one atomic channel-authoritative target: complete active set A+B plus the exact tombstone for R.
- The active refs and material digests must exactly equal the freshly refetched authoritative channel state. The tombstone contains only sorted, unique, non-overlapping digests for selected revoked lineage on that same channel.
- `sourceDesiredStateRef` and `sourceGeneration` bind the current authoritative channel state. The scoped fingerprint also binds the channel, complete active refs/material evidence, and exact tombstone digests.
- The production Agent refetches and validates the authoritative single-channel state before material fetch or runtime mutation, fetches material for all active refs, and invokes `applyCredentialReconciliation` once with add A+B and revoke R actions. It must not route mixed lineage through `applyDesiredState`.
- The receipt proves both preservation and revocation: exact active credential count, exact active material digests, and exact scoped tombstone identity. Missing, extra, duplicate, stale, wrong-channel, or active/tombstone-overlapping evidence fails closed.
- When the authoritative active set is empty, the same v1.2 contract permits the tombstone-only zero-count special case.

## Baseline Evidence

- `npm ci`: succeeded; 117 packages audited and 0 vulnerabilities.
- `npm test`: 1108 tests, 1107 passed, 0 failed, 1 skipped.
- GitHub PR #471: four current unresolved threads (3 P1, 1 P2), none outdated.
- Existing source already supports global empty tombstones, compatible-agent gating, agent receipt recording, and receipt-backed subscription channel gating. The missing cases are scoped empty projection/receipt parity, read-only historical projection, and refresh ordering/error evidence.

### Task 1: Make credential-scoped revocation tombstones round-trip through agent receipts (historical; superseded in part)

**Files:**

- Modify: `server/services/edge/data-plane-agent-service.mjs`
- Modify: `server/tests/data-plane-agent-service.test.mjs`

**Step 1: Add the failing filtered-revocation test**

Extend the existing tombstone tests with an authoritative channel state that still contains `edgecred_other_hy2`, while the authenticated agent filters for a revoked `edgecred_revoked_hy2`.

The test must verify:

- a legacy/incompatible filtered poll receives no desired state and increments `blockedDesiredStateCount`;
- **Superseded protocol 1.1 expectation:** an agent with only the two legacy tombstone capabilities receives the scoped state. The current scoped-lineage path instead requires protocol 1.2 plus `scoped_tombstone_lineage`.
- the state keeps the channel, has empty credential refs/material digests, and does not contain either synthetic credential ref in its serialized response;
- repeated compatible polls return the same scoped `desiredStateRef` and generation;
- an applied receipt with the scoped ref/generation, zero credentials, and zero digests is accepted and stored against that same scoped ref.

Run:

```powershell
node --test server/tests/data-plane-agent-service.test.mjs
```

Expected RED: the compatible poll currently returns zero desired states because `scopedDesiredStateFrom()` returns `null` when the filter/source intersection is empty. If the pull-only branch is changed without receipt support, the receipt fails with `desired_state_not_found`.

**Step 2: Build one deterministic scoped-state constructor**

Keep `scopedDesiredStateFrom()` as the public filter entry point, but factor its state construction into a private helper that accepts the already selected refs, including an empty array. Its fingerprint must use the authoritative source reference/generation plus the selected refs/material digests; it must not include or expose a missing requested credential ref.

Shape:

```js
function buildScopedDesiredState(desiredState, selectedRefs) {
  const materialDigests = materialDigestsForCredentials(desiredState, selectedRefs);
  const fingerprint = sha256(stableJson({
    sourceDesiredStateRef: desiredState.desiredStateRef,
    sourceGeneration: desiredState.generation,
    edgeCredentialRefs: selectedRefs,
    materialDigests
  })).slice(0, 32);
  // Return desired_scoped_*/gen_scoped_* with redacted summary.
}
```

For a non-empty filter, call the helper even when `selectedRefs` is empty. Preserve the existing behavior for no filter and for an already-global tombstone.

**Step 3: Resolve empty scoped receipts with the same constructor**

In `recordReceipt()`, keep digest-based reconstruction for non-empty scoped receipts. When the authenticated scoped receipt has no material digests, reconstruct the deterministic empty scoped state directly from the latest authoritative state, then require exact `desiredStateRef` and generation matches before recording it.

Do not trust a client-provided arbitrary ref and do not relax node/channel validation.

**Step 4: Run GREEN and focused regression**

```powershell
node --test server/tests/data-plane-agent-service.test.mjs
```

Expected GREEN: all tests in the file pass with pristine output, including global tombstone, scoped active state, wrong-ref rejection, idempotence, and the new scoped tombstone round trip.

**Step 5: Commit**

```powershell
git add server/services/edge/data-plane-agent-service.mjs server/tests/data-plane-agent-service.test.mjs
git commit -m "fix(edge): emit scoped revocation tombstones"
```

### Task 2: Mirror tombstone desired states in read-only material-handoff preflight

**Files:**

- Modify: `server/services/edge/material-handoff-readonly-control-store.mjs`
- Modify: `server/tests/edge-material-handoff-preflight.test.mjs`

**Step 1: Stabilize the synthetic validity fixture and add a failing parity test**

Change the test-only `VALID_UNTIL` from the wall-clock-sensitive `2026-07-13T12:00:00.000Z` to a synthetic far-future value such as `2099-07-13T12:00:00.000Z`. This prevents the existing active-row test from changing meaning during the implementation day.

Add a read-only test that:

1. creates the registered node and delivered two-channel order through the mutable store;
2. captures the active desired-state projections;
3. updates that same request to `disabled` with a later synthetic `updatedAt`;
4. asserts the mutable store now returns deterministic empty projections;
5. closes the mutable store and opens `createReadOnlyMaterialHandoffControlStore`;
6. asserts read-only projections exactly match mutable refs/generations and contain zero credentials/digests;
7. runs `buildProtectedMaterialHandoffPreflight` with an empty material store and asserts `ready`, two desired states, zero edge credentials, zero missing/mismatched material, and no blockers.

Add two projection boundaries in the same test file: a never-seen channel still returns `null`, and a channel with one disabled historical credential plus one delivered active credential returns only the active credential rather than a channel-wide tombstone.

Run:

```powershell
node --test server/tests/edge-material-handoff-preflight.test.mjs
```

Expected RED: the read-only projection returns `null`, so preflight reports no desired state instead of the required two tombstones.

**Step 2: Align the read-only query and projection**

Mirror the mutable projection without adding mutation capability:

- remove the SQL-level status predicate;
- select `r.status as request_status`;
- return `null` only when the channel has no historical rows;
- apply `delivered` / `issued`, valid material, and future validity checks only when building `activeRows`;
- when no active row remains, derive `validUntil` from the maximum valid lifecycle timestamp across `valid_until` and `updated_at`;
- use the existing fingerprint fields so mutable/read-only desired refs and generations match.

Do not add write methods or open SQLite without `readonly: true`.

**Step 3: Run GREEN**

```powershell
node --test server/tests/edge-material-handoff-preflight.test.mjs
```

Expected GREEN: active material readiness, tombstone readiness, missing/mismatch fail-closed, and inactive-node tests all pass.

**Step 4: Commit**

```powershell
git add server/services/edge/material-handoff-readonly-control-store.mjs server/tests/edge-material-handoff-preflight.test.mjs
git commit -m "fix(edge): include tombstones in readonly preflight"
```

### Task 3: Preserve failed refresh mutation evidence for compensation

**Files:**

- Modify: `server/services/platform/portal-access-requests.mjs`
- Modify: `server/tests/platform-portal-access-requests.test.mjs`

**Step 1: Add the failing mutation-aware failure test**

Add a refresh test whose `order_refreshed` reconciliation returns:

```js
{
  ok: false,
  mutation: true,
  runtimeReceipt: { status: "failed" },
  redacted: true
}
```

Return an applied receipt for `order_refresh_rolled_back`. Assert that refresh throws `edge_lifecycle_failed`, the lifecycle reason sequence contains `order_refresh_rolled_back`, the prior material digest remains authoritative, and the request event/client state is restored.

Run:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
```

Expected RED: `runEdgeLifecycle()` throws before the caller can set `runtimeMayHaveMutated`; the rollback reason is absent.

**Step 2: Separate raw reconciliation from the throwing wrapper**

Introduce a private raw helper that validates the service contract and returns the report even when `ok: false`. Keep the current throwing `runEdgeLifecycle()` wrapper for ordinary/deferred lifecycle callers and compensating rollback.

Shape:

```js
function reconcileEdgeLifecycle(reason, request) {
  // validate service and return reconcileOrderLifecycle(...)
}

function runEdgeLifecycle(reason, request) {
  const result = reconcileEdgeLifecycle(reason, request);
  if (result?.ok === false) throw edge_lifecycle_failed;
  return result;
}
```

Use the raw helper only for the initial refresh apply. Set `runtimeMayHaveMutated` immediately from its result, derive failed/applied/pending state, and then throw on failed. The existing catch can now execute the applied compensating lifecycle before rethrowing the original failure.

**Step 3: Run GREEN**

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
```

Expected GREEN: the new mutation-aware compensation test and all existing refresh rollback/binding/cooldown tests pass.

**Step 4: Commit**

```powershell
git add server/services/platform/portal-access-requests.mjs server/tests/platform-portal-access-requests.test.mjs
git commit -m "fix(portal): preserve refresh mutation evidence"
```

### Task 4: Publish remote pending refreshes before awaiting agent receipts

**Files:**

- Modify: `server/services/platform/portal-access-requests.mjs`
- Modify: `server/tests/platform-portal-access-requests.test.mjs`
- Modify: `server/tests/state.test.mjs`

**Step 1: Add two failing state-machine tests**

Test A — explicit direct remote pending:

- lifecycle returns `ok: true`, `mutation: false`, `runtimeReceipt.status: "pending"`, and `nextAction: "complete_data_plane_handoff"`;
- notifier records `order_refreshed` and returns `notificationCount: 1` plus a pending notification;
- refresh returns a visible-once summary with `runtimeEnforcement.state === "pending"`;
- rotated digest/order and reissue event are durably saved;
- notifier runs only after the saved order exposes the new digest;
- no result claims runtime applied and no sensitive material is serialized.

Test B — unclassified plan/dry-run:

- lifecycle returns `{ ok: true, mutation: false, nextAction: "review_apply_gate" }` without a runtime receipt;
- even if a notifier is configured, it must not be called because this is not an explicit remote-handoff result;
- refresh throws the existing `subscription_refresh_runtime_enforcement_pending` error;
- material, digest, request event, and client target are restored.

Test C — explicit remote pending without a recorded notification:

- lifecycle returns the same explicit remote pending receipt as Test A;
- notifier is absent or returns `notificationCount: 0`;
- refresh throws the existing pending error and restores material/order state.

Also cover a fanout containing one explicit applied report and one explicit remote pending report. It must classify the overall result as pending, commit the candidate, and avoid compensation on the success path. A fanout with an undefined status or a pending report whose next action is not `complete_data_plane_handoff` remains unclassified and fail-closed.

Run:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
```

Expected RED: Test A throws before the order is saved/notified. Tests B/C document the two fail-closed distinctions that must remain after allowing the remote path.

**Step 2: Classify refresh lifecycle results without broadening generic pending**

Add a private refresh-specific classifier. Reuse the existing failed/applied evidence rules, then recognize remote pending only when evidence is explicit:

```js
function refreshLifecycleDisposition(result) {
  // "failed" for ok:false or failed status.
  // "applied" only for existing explicit applied + mutation evidence.
  // "remote_pending" for direct pending + complete_data_plane_handoff,
  // or a fully classified fanout of applied/pending reports with at least
  // one explicit remote pending report.
  // "unavailable" for plans, missing statuses, or ambiguous reports.
}
```

For fanout, require every child report to be `applied` or explicit `pending`, at least one explicit pending child, and no `ok: false` child. Do not infer remote authority merely because an object exists or because a notifier happens to be configured.

**Step 3: Reorder the refresh transaction around the classified state**

After the raw lifecycle result:

1. fail and compensate immediately for `failed`;
2. reject `unavailable` before commit;
3. allow `applied` or `remote_pending` to proceed to material commit, tenant binding, order save, and desired-state notification;
4. when the disposition was `remote_pending`, require `desiredStateResult.notificationCount > 0`; otherwise throw the existing pending error so the catch restores the previous material/order and emits rollback notification when appropriate;
5. return `withRuntimeEnforcement(...)`, which reports `applied` only from an applied lifecycle receipt and `pending` for the recorded remote notification.

Do not fabricate a receipt and do not change the receipt-backed rendering gate.

**Step 4: Add the runtime-state end-to-end receipt test**

In `server/tests/state.test.mjs`, configure one synthetic `remote-data-plane-handoff` channel with production mutation execution enabled against temporary files/SQLite only. Reuse the existing state-test pattern with `USER_PORTAL_EDGE_LIFECYCLE_ENABLED`, `EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION`, `EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED`, a one-node `EDGE_DATA_PLANE_AGENT_NODES_JSON`, a temporary `EDGE_CREDENTIAL_MATERIAL_PATH`, a temporary `EDGE_DATA_PLANE_HANDOFF_DIR`, and matching `USER_PORTAL_EDGE_CHANNEL_REFS` / `EDGE_CREDENTIAL_CHANNEL_REFS`. The test must:

1. auto-issue a delivered order and capture its stable artifact secret;
2. record an initial matching applied receipt and verify the remote channel renders;
3. refresh and assert `runtimeEnforcement.state === "pending"`, a new digest/desired-state ref is persisted, and an `order_refreshed` notification is pending;
4. verify the old receipt no longer unlocks the newly current state, so the remote channel is temporarily absent;
5. pull the new desired state through `state.platform.dataPlaneAgentService`, post an applied zero-sensitive-data receipt for that exact ref/generation, and assert the notification becomes applied;
6. verify the remote channel renders again and no raw material, token, URL, UUID, or configuration appears in diagnostic assertions.

This test uses only temporary local files and synthetic inputs; it must not invoke SSH, a provider, or a real runtime command.

**Step 5: Run GREEN**

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
node --test server/tests/state.test.mjs
```

Expected GREEN: synchronous applied refresh, direct/fanout remote pending refresh, generic pending rejection, missing-notification rejection, failed-mutation compensation, binding compensation, cooldown, entitlement continuity, end-to-end receipt convergence, and redaction tests all pass.

**Step 6: Commit**

```powershell
git add server/services/platform/portal-access-requests.mjs server/tests/platform-portal-access-requests.test.mjs server/tests/state.test.mjs
git commit -m "fix(portal): publish pending agent refreshes"
```

### Task 5: Integrate, independently review, and prepare one Draft PR

**Files:**

- Verify all files changed by Tasks 1-4 and this plan.
- Do not add production records or Deploy Notes because no deployment is authorized or performed.

**Step 1: Run all focused suites from a clean task boundary**

```powershell
node --test server/tests/data-plane-agent-service.test.mjs
node --test server/tests/edge-material-handoff-preflight.test.mjs
node --test server/tests/platform-portal-access-requests.test.mjs
node --test server/tests/state.test.mjs
```

Expected: zero failures and pristine output.

**Step 2: Run the repository validation gate**

```powershell
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

Expected: the full suite has zero failures; diff check emits no errors; only intended tracked files are changed/committed.

**Step 3: Perform independent review**

Use a fresh reviewer with the complete `origin/master...HEAD` review package. It must explicitly check:

- arbitrary scoped receipt refs still fail closed;
- legacy tombstone capability gating is unchanged;
- read-only projection stays read-only and unknown channels still return `null`;
- failed mutation compensation occurs before returning the original error;
- only a recorded remote notification can authorize pending refresh acceptance;
- no schema, production, provider, credential, or sensitive-output change entered the diff.

Fix every Critical/Important finding with focused tests, rerun affected suites, regenerate the review package, and repeat review.

**Step 4: Push and open one Draft PR**

The Draft PR body must include:

- `Risk: A`, `release_unit: control-plane-app`, and `identity_impact: true`;
- the four review findings and their test-backed resolutions;
- exact validation results;
- `production_state: not_deployed`, provider/runtime/customer-data mutation all `none`;
- explicit remaining gate: future promotion needs separate operator approval, backup, staging/clean validation, aggregate-only identity gate before/after, rollback, and Deploy Note.

Do not mark Ready, request merge, resolve old review threads, deploy, or claim production completion in this task.

## Rollback Plan

Because this gate is source-only and not deployed, rollback is a Git operation on the Draft branch: revert the task commit(s) that fail review, rerun the affected focused suite plus `npm test`, and update the Draft PR evidence. No runtime or data rollback exists or is authorized in this plan. If a later production gate is approved, it must define its own artifact backup and runtime rollback independently.
