# SGP Protected Material Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task. Track
> progress by updating the checkboxes below.

**Goal:** Build a private, node-scoped credential-material pull path so the
Singapore data-plane agent can apply future-order desired-state refs without
copying protected runtime files into Git, docs, terminal output, or operator
chat.

**Architecture:** Desired-state and receipts stay redacted. Add a separate
authenticated internal batch route that returns material only for the
authenticated node, current desired-state refs, and exact material digest
matches. The SGP agent merges returned records into its local 0600 protected
material file before invoking existing Xray, Hysteria2, and TUIC runtime
adapters.

**Tech Stack:** Node.js ESM, Express, `node:test`, SQLite control store,
file-backed edge credential material store, existing production edge-agent
runner.

---

## Current Failure

The 2026-06-11 source deployment/live-smoke proved that SGP can pull redacted
desired-state and attempt runtime apply, but apply receipts failed because the
active SGP protected material store could not resolve all desired
`edgeCredentialRef` values.

This is not a listener, port, firewall, subscription-template, or receipt
validation issue. It is a missing control-plane-to-data-plane material
synchronization step.

## File Structure

- Modify `server/services/edge/data-plane-agent-protocol.mjs`
  - Add material request and material response validators.
  - Keep desired-state and receipt validators redacted and unchanged.
- Modify `server/services/edge/credential-material-store.mjs`
  - Export a safe normalization helper for the existing protected material
    record shape.
  - Do not log or expose record internals from the helper.
- Modify `server/services/edge/data-plane-agent-service.mjs`
  - Accept `credentialMaterialStore`.
  - Add `getCredentialMaterials(identity, input)`.
  - Scope material access to the authenticated node, current desired-state
    refs, requested credential refs, and exact digest matches.
- Modify `server/routes/data-plane-agent.mjs`
  - Add `POST /api/internal/data-plane-agent/materials`.
  - Reuse the existing internal agent authentication middleware.
- Modify `server/state.mjs`
  - Pass the already-created `edgeCredentialMaterialStore` into
    `createDataPlaneAgentService`.
- Modify `agent/production-edge-agent.mjs`
  - Add material endpoint support.
  - Fetch material only when apply is enabled and dry-run is disabled.
  - Merge fetched records into the same local protected material store used by
    runtime adapters.
- Modify `server/tests/data-plane-agent-protocol.test.mjs`
  - Cover material request and response validation.
- Modify `server/tests/data-plane-agent-service.test.mjs`
  - Cover node-scoped material access and scope rejection.
- Modify `server/tests/data-plane-agent-routes.test.mjs`
  - Cover the authenticated internal route and public/admin boundary.
- Modify `server/tests/production-edge-agent.test.mjs`
  - Cover desired-state -> material pull -> local merge -> apply -> redacted
    receipt order.
- Update `docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md`
  - Document that material sync is a separate private server-to-server path.
- Update `docs/SUBSCRIPTION_CONTROL_DATABASE.md`
  - Note that the DB stores safe refs/digests and the protected material store
    supplies runtime material.

## Wire Shape

Use this request shape in tests and implementation:

```json
{
  "type": "gccgw_data_plane_material_request",
  "nodeRef": "node-sgp-a",
  "desiredStateRef": "desired_state_channel_sgp_hy2_001",
  "edgeCredentialRefs": ["edgecred_safe_hy2_001"],
  "mode": "material"
}
```

The summary response is safe to inspect in tests:

```json
{
  "type": "gccgw_data_plane_material_response",
  "nodeRef": "node-sgp-a",
  "desiredStateRef": "desired_state_channel_sgp_hy2_001",
  "mode": "summary",
  "records": [
    {
      "edgeCredentialRef": "edgecred_safe_hy2_001",
      "materialDigest": "sha256:aaaaaaaaaaaaaaaa",
      "hasMaterial": true
    }
  ],
  "redacted": true
}
```

The material response is not safe to print. In tests, build it through a helper
that returns the existing file-backed material-store record shape. Do not paste
the inner protected fields into docs or terminal summaries.

## Tasks

### Task 1: Protocol Validators

**Files:**

- `server/services/edge/data-plane-agent-protocol.mjs`
- `server/services/edge/credential-material-store.mjs`
- `server/tests/data-plane-agent-protocol.test.mjs`

- [x] Add failing protocol tests for valid material requests, invalid node refs,
  invalid desired-state refs, empty credential refs, summary redaction, and
  material response validation through the material-store normalization helper.
- [x] Export constants for material request/response types and accepted modes:
  `summary`, `material`.
- [x] Add `validateDataPlaneMaterialRequest(input, options)`.
- [x] Add `validateDataPlaneMaterialResponse(input, options)`.
- [x] Reject material responses unless `sensitive === true` for material mode.
- [x] Ensure validators never accept or return unrelated payload fields.

Run:

```powershell
node --test server/tests/data-plane-agent-protocol.test.mjs
```

Expected after implementation: tests pass.

### Task 2: Node-Scoped Service Method

**Files:**

- `server/services/edge/data-plane-agent-service.mjs`
- `server/tests/data-plane-agent-service.test.mjs`

- [x] Add failing tests for authenticated SGP material access, summary mode,
  material mode, wrong-node rejection, stale digest rejection, unrelated-ref
  rejection, and missing-material generic failure.
- [x] Extend `createDataPlaneAgentService({ ... })` to accept
  `credentialMaterialStore`.
- [x] Implement `getCredentialMaterials(identity, input)`.
- [x] In the method:
  - validate input
  - load latest desired-state for the authenticated node/channel
  - build allowed refs from that desired-state only
  - compare requested refs and digests
  - resolve matching records from `credentialMaterialStore`
  - validate response through protocol validators
- [x] Keep thrown errors generic. Include safe refs only; never include record
  internals.

Run:

```powershell
node --test server/tests/data-plane-agent-service.test.mjs
```

Expected after implementation: tests pass.

### Task 3: Internal Route

**Files:**

- `server/routes/data-plane-agent.mjs`
- `server/tests/data-plane-agent-routes.test.mjs`

- [x] Add route tests for unauthenticated rejection, wrong-auth rejection,
  authenticated summary JSON, authenticated material JSON, and unchanged
  public/admin boundaries.
- [x] Add:

```text
POST /api/internal/data-plane-agent/materials
```

- [x] Reuse the existing `/api/internal/data-plane-agent` authentication
  middleware.
- [x] Call `service.getCredentialMaterials(req.agentIdentity, req.body)`.
- [x] Return the validated response.
- [x] Do not add any public route or Nginx requirement.

Run:

```powershell
node --test server/tests/data-plane-agent-routes.test.mjs
```

Expected after implementation: tests pass.

### Task 4: Runtime Wiring

**Files:**

- `server/state.mjs`
- `server/tests/data-plane-agent-routes.test.mjs`

- [x] Add a state wiring test or route test that proves material route works
  through app state when `edgeCredentialMaterialStore` exists.
- [x] Pass the existing `edgeCredentialMaterialStore` into
  `createDataPlaneAgentService`.
- [x] If the store is absent, fail material requests with a structured,
  non-leaking service-unavailable error.

Run:

```powershell
node --test server/tests/data-plane-agent-routes.test.mjs
```

Expected after implementation: tests pass.

### Task 5: Production Edge Agent

**Files:**

- `agent/production-edge-agent.mjs`
- `server/tests/production-edge-agent.test.mjs`

- [x] Add failing agent tests for dry-run skip behavior, apply-mode material
  fetch, local protected-store merge, runtime adapter resolution, redacted
  receipts, and safe result summaries.
- [x] Add material endpoint config derived from the existing internal agent base
  URL.
- [x] Add `fetchMaterialBatch(desiredState, config, fetchImpl)`.
- [x] Add `mergeMaterialBatchIntoLocalStore(records, materialStore)`.
- [x] In `runOnce`, after desired-state fetch and before runtime apply:
  - skip material fetch when dry-run is enabled
  - skip material fetch when no records require material
  - request only refs present in the desired-state payload
  - validate response before writing local material
  - write local material before invoking runtime adapters
- [x] Ensure all logs and returned summaries include only safe refs, counts,
  generations, and digests.

Run:

```powershell
node --test server/tests/production-edge-agent.test.mjs
```

Expected after implementation: tests pass.

### Task 6: Documentation

**Files:**

- `docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md`
- `docs/SUBSCRIPTION_CONTROL_DATABASE.md`
- `docs/PROJECT_CONTEXT.md`
- `project-state/current.json`

- [x] Add interconnect wording:
  - desired-state is redacted
  - material sync is private and node-scoped
  - receipts stay redacted
  - subscription rendering requires fresh applied receipts
- [x] Add DB wording:
  - desired-state notification tables store safe refs/digests only
  - protected material store supplies runtime material
  - data-plane agents pull material through the private authenticated path
- [x] Keep `docs/PROJECT_CONTEXT.md` current-state wording aligned to code
  facts.
- [x] Keep `project-state/current.json` pointing to the active blocker and next
  gate.

Run:

```powershell
npm run project-state:check
git diff --check
```

Expected after implementation: both pass.

## Final Validation

Run:

```powershell
node --test server/tests/data-plane-agent-protocol.test.mjs server/tests/data-plane-agent-service.test.mjs server/tests/data-plane-agent-routes.test.mjs server/tests/production-edge-agent.test.mjs
npm test
npm run project-state:check
git diff --check
```

Expected:

- Targeted agent/material tests pass.
- Full `npm test` passes.
- Project-state validation passes.
- Diff whitespace check exits 0.

## Production Activation Boundary

After repo implementation passes, production activation must still be a
separate Risk A approval. Required approval must include:

```text
批准执行 Vultr Japan/SGP edge-agent protected material sync production activation:
release=<exact release>;
artifact=<exact local artifact path>;
archive_sha256=<exact sha256>;
target=Vultr Japan control plane 45.76.222.52 + SGP data plane 45.76.158.201 only;
current_release=<verified current release>;
scope=read-only inventory; protected backups; upload verified artifact; npm ci; switch Japan current; restart Japan proxy-gateway-candidate.service only; install/update SGP agent source if needed; enable private material pull; run SGP dry-run summary material preflight; controlled apply for exactly one approved test order or existing reviewed order; config-test SGP Xray/Hy2/TUIC; restart only approved SGP data-plane services if required; post redacted receipts; render proof;
validation=artifact hash ok, npm ci ok, Japan health 200, portal/sub public 200, Admin blocked, public internal route blocked, no-session APIs reject, tcp3456 loopback-only, unauthenticated internal route rejects, SGP agent active, SGP TCP8443/UDP10443/UDP443 active, stats loopback-only, summary material preflight ok, fresh applied receipt ok, subscription render proof includes SGP channels only after matching fresh receipt, no sensitive output;
rollback=restore Japan/SGP protected backups and previous agent/runtime state, restart only affected approved services after config-test;
forbidden=DNS,Nginx config/reload,provider firewall,public Admin,payment,account credential generation,more than one live order,passkey enablement,sensitive subscription/runtime material output,SQLite row dump,raw env/log/config output,copying protected runtime config into Git,unrelated service restart.
```

Do not run this approval text from the plan. The operator must provide a fresh
exact approval with current release, artifact, and SHA.

## Self-Review

- Spec coverage: Covers current failure, private material route, service
  scoping, agent local merge, tests, docs, production approval, and rollback.
- Placeholder scan: No `TBD`, `TODO`, or open-ended "handle errors" language
  remains.
- Sensitive-output boundary: No runtime material fields or values are written
  in this plan.
- Type consistency: Uses `edgeCredentialRef` in desired-state and service
  internals, and the local file-backed material store at the runtime adapter
  boundary.
