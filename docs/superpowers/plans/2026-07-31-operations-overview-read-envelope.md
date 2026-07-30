# Operations Overview Read Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off, capability-protected `GET /api/admin/operations/overview` endpoint that returns a versioned Envelope containing exactly four allowlisted Subscription Owner counts while preserving the legacy Overview API.

**Architecture:** A pure generic Envelope Builder validates common response metadata. A pure Operations Overview Projector owns the four-field allowlist. The Admin Subscription route conditionally registers the new endpoint, enforces `operations.read`, composes the two services, and leaves the legacy endpoint unchanged.

**Tech Stack:** Node.js ESM, Express 5, built-in `node:test`, `node:assert/strict`, existing Admin authorization middleware, GitHub Actions CI.

## Global Constraints

- Base source is `master@7a5ef1762173ed49870366186d221cb886bc5606`.
- Design authority is `docs/superpowers/specs/2026-07-31-operations-overview-read-envelope-design.md`.
- Register the new endpoint only when `state.platform.adminAuthorizationEnabled === true`.
- Require `operations.read`; retain the existing 401 and 403 response contracts.
- Keep `GET /api/admin/overview` byte-for-byte behaviorally compatible.
- Allowlist exactly `total`, `active`, `expiring`, and `disabledOrExpired`.
- Do not expose `nodes`, `distribution`, `ok`, unknown future fields, or caller-owned objects.
- Use `schemaVersion: "operations-overview-read-envelope/v1"`.
- Use `freshness: "fresh"` and `sourceState: "implemented_source"` for this direct Store query.
- Treat `fresh` as query-generation freshness, not deployment, Provider, collector, node, or runtime health.
- Keep `warnings: []` for this slice; do not fabricate warnings.
- Do not configure production environment variables, deploy, migrate data, or add mutations.
- Use strict red-green TDD. Do not add production code before the corresponding failing test is observed.
- Keep implementation changes to five files; the design and plan documents are separate planning artifacts.

---

## File Map

- Create: `server/services/platform/operations-read-envelope.mjs`
  - Pure validation and construction of the common Envelope.
- Create: `server/services/platform/operations-overview-read-model.mjs`
  - Pure four-count allowlist projection from the legacy Overview result.
- Modify: `server/routes/admin-subscriptions.mjs`
  - Conditional endpoint registration, capability enforcement, and composition.
- Create: `server/tests/operations-read-envelope.test.mjs`
  - Focused Builder and Projector contract tests.
- Modify: `server/tests/admin-subscriptions.test.mjs`
  - Endpoint registration, authorization, compatibility, allowlist, and safe error tests.

## Shared Contract Error

Both new service modules use the same safe error shape without embedding caller input:

```js
function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
  return error;
}
```

The route does not add a special public mapping for this code. Existing `sendError()` therefore returns:

```json
{
  "error": "internal_error"
}
```

with HTTP 500 and no raw validation detail.

---

### Task 1: Common Operations Read Envelope Builder

**Files:**
- Create: `server/services/platform/operations-read-envelope.mjs`
- Create: `server/tests/operations-read-envelope.test.mjs`

**Interfaces:**
- Consumes:
  - `input.schemaVersion: string`
  - `input.freshness: "fresh" | "stale" | "partial" | "unknown"`
  - `input.sourceState: "implemented_source" | "source_not_deployed" | "production_unknown"`
  - `input.data: plain object`
  - `input.warnings: Array<{ code: "source_stale" | "source_partial" | "source_unavailable" }>`
  - `input.access: { allowed: true, capability: string, reasonCode: "allowed" }`
  - `options.nowFn: () => Date`
- Produces:
  - `createOperationsReadEnvelope(input, options?)`
  - a new plain Envelope object with canonical `generatedAt`.

- [ ] **Step 1: Add the first exact Envelope test**

Create `server/tests/operations-read-envelope.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationsReadEnvelope
} from "../services/platform/operations-read-envelope.mjs";

test("Operations Read Envelope creates the exact authorized v1 response", () => {
  const sourceData = {
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  };

  const envelope = createOperationsReadEnvelope({
    schemaVersion: "operations-overview-read-envelope/v1",
    freshness: "fresh",
    sourceState: "implemented_source",
    data: sourceData,
    warnings: [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  }, {
    nowFn: () => new Date("2026-07-31T00:00:00.000Z")
  });

  assert.deepEqual(envelope, {
    schemaVersion: "operations-overview-read-envelope/v1",
    generatedAt: "2026-07-31T00:00:00.000Z",
    freshness: "fresh",
    sourceState: "implemented_source",
    data: {
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    },
    warnings: [],
    access: {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    }
  });
  assert.notEqual(envelope.data, sourceData);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: FAIL because `server/services/platform/operations-read-envelope.mjs` does not exist.

When execution is connector-only, commit only this test to the implementation branch, open or update the Draft PR, and use the resulting CI Server Tests failure as RED evidence.

- [ ] **Step 3: Implement the minimal Builder**

Create `server/services/platform/operations-read-envelope.mjs`:

```js
const FRESHNESS_VALUES = new Set(["fresh", "stale", "partial", "unknown"]);
const SOURCE_STATE_VALUES = new Set([
  "implemented_source",
  "source_not_deployed",
  "production_unknown"
]);
const WARNING_CODES = new Set([
  "source_stale",
  "source_partial",
  "source_unavailable"
]);
const SCHEMA_VERSION_PATTERN = /^[a-z][a-z0-9-]*\/v[1-9][0-9]*$/;

function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
  return error;
}

function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function createOperationsReadEnvelope(input = {}, options = {}) {
  try {
    if (!isPlainObject(input) || !isPlainObject(options)) {
      throw operationsReadContractError();
    }

    const schemaVersion = String(input.schemaVersion || "");
    const freshness = String(input.freshness || "");
    const sourceState = String(input.sourceState || "");
    const warnings = input.warnings;
    const access = input.access;
    const nowFn = options.nowFn || (() => new Date());

    if (
      !SCHEMA_VERSION_PATTERN.test(schemaVersion)
      || !FRESHNESS_VALUES.has(freshness)
      || !SOURCE_STATE_VALUES.has(sourceState)
      || !isPlainObject(input.data)
      || !Array.isArray(warnings)
      || !warnings.every((warning) => (
        isPlainObject(warning)
        && Object.keys(warning).length === 1
        && WARNING_CODES.has(warning.code)
      ))
      || !isPlainObject(access)
      || access.allowed !== true
      || typeof access.capability !== "string"
      || !access.capability
      || access.reasonCode !== "allowed"
      || typeof nowFn !== "function"
    ) {
      throw operationsReadContractError();
    }

    const now = nowFn();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw operationsReadContractError();
    }

    return {
      schemaVersion,
      generatedAt: now.toISOString(),
      freshness,
      sourceState,
      data: { ...input.data },
      warnings: warnings.map((warning) => ({ code: warning.code })),
      access: {
        allowed: true,
        capability: access.capability,
        reasonCode: "allowed"
      }
    };
  } catch (error) {
    if (error?.code === "operations_read_contract_error") {
      throw error;
    }
    throw operationsReadContractError();
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: PASS with one test and zero failures.

- [ ] **Step 5: Add table-driven fail-closed tests**

Append tests with literal invalid cases:

```js
const validEnvelopeInput = {
  schemaVersion: "operations-overview-read-envelope/v1",
  freshness: "fresh",
  sourceState: "implemented_source",
  data: { total: 0 },
  warnings: [],
  access: {
    allowed: true,
    capability: "operations.read",
    reasonCode: "allowed"
  }
};

for (const [label, override] of [
  ["blank schema", { schemaVersion: "" }],
  ["unsupported freshness", { freshness: "disconnected" }],
  ["unsupported source state", { sourceState: "deployed" }],
  ["array data", { data: [] }],
  ["free-form warning", { warnings: [{ code: "source_stale", message: "raw" }] }],
  ["denied access", { access: { allowed: false, capability: "operations.read", reasonCode: "capability_missing" } }]
]) {
  test(`Operations Read Envelope rejects ${label}`, () => {
    assert.throws(
      () => createOperationsReadEnvelope(
        { ...validEnvelopeInput, ...override },
        { nowFn: () => new Date("2026-07-31T00:00:00.000Z") }
      ),
      (error) => error.code === "operations_read_contract_error"
    );
  });
}

test("Operations Read Envelope rejects an invalid generation time", () => {
  assert.throws(
    () => createOperationsReadEnvelope(validEnvelopeInput, {
      nowFn: () => new Date("invalid")
    }),
    (error) => error.code === "operations_read_contract_error"
  );
});
```

- [ ] **Step 6: Run the focused test suite**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: PASS with all Builder tests and zero failures.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/services/platform/operations-read-envelope.mjs server/tests/operations-read-envelope.test.mjs
git commit -m "Add Operations read envelope contract"
```

---

### Task 2: Operations Overview Allowlist Projector

**Files:**
- Create: `server/services/platform/operations-overview-read-model.mjs`
- Modify: `server/tests/operations-read-envelope.test.mjs`

**Interfaces:**
- Consumes: the plain object returned by `core.overview()`.
- Produces:
  - `projectOperationsOverviewReadModel(input)`
  - exactly `{ total, active, expiring, disabledOrExpired }`.

- [ ] **Step 1: Add the failing allowlist test**

Add the import:

```js
import {
  projectOperationsOverviewReadModel
} from "../services/platform/operations-overview-read-model.mjs";
```

Append:

```js
test("Operations Overview Projector returns only allowlisted counts", () => {
  const source = {
    ok: true,
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2,
    nodes: [{ name: "node-secret" }],
    distribution: { "credential-secret": 1 },
    token: "must-not-cross"
  };

  const projected = projectOperationsOverviewReadModel(source);

  assert.deepEqual(projected, {
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2
  });
  assert.notEqual(projected, source);
  assert.doesNotMatch(JSON.stringify(projected), /node-secret|credential-secret|must-not-cross/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: FAIL because `operations-overview-read-model.mjs` does not exist.

- [ ] **Step 3: Implement the minimal Projector**

Create `server/services/platform/operations-overview-read-model.mjs`:

```js
const COUNT_FIELDS = Object.freeze([
  "total",
  "active",
  "expiring",
  "disabledOrExpired"
]);

function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
  return error;
}

export function projectOperationsOverviewReadModel(input = {}) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw operationsReadContractError();
  }

  const projected = {};
  for (const field of COUNT_FIELDS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 0) {
      throw operationsReadContractError();
    }
    projected[field] = value;
  }
  return projected;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add invalid-count tests**

Append:

```js
for (const [label, field, value] of [
  ["missing", "total", undefined],
  ["negative", "active", -1],
  ["fractional", "expiring", 1.5],
  ["string", "disabledOrExpired", "2"],
  ["null", "total", null]
]) {
  test(`Operations Overview Projector rejects a ${label} ${field} count`, () => {
    const source = {
      total: 0,
      active: 0,
      expiring: 0,
      disabledOrExpired: 0,
      [field]: value
    };
    assert.throws(
      () => projectOperationsOverviewReadModel(source),
      (error) => error.code === "operations_read_contract_error"
    );
  });
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
node --test server/tests/operations-read-envelope.test.mjs
```

Expected: PASS with all Builder and Projector tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/services/platform/operations-overview-read-model.mjs server/tests/operations-read-envelope.test.mjs
git commit -m "Add Operations overview allowlist projector"
```

---

### Task 3: Protected Conditional Operations Overview Endpoint

**Files:**
- Modify: `server/routes/admin-subscriptions.mjs`
- Modify: `server/tests/admin-subscriptions.test.mjs`

**Interfaces:**
- Consumes:
  - `requireAdminCapability("operations.read")`
  - `projectOperationsOverviewReadModel(core.overview())`
  - `createOperationsReadEnvelope(input)`
- Produces:
  - conditional `GET /api/admin/operations/overview`;
  - existing safe 404, 401, 403, 500, and authorized 200 behaviors.

- [ ] **Step 1: Add the disabled-route and legacy-compatibility tests**

Append to `server/tests/admin-subscriptions.test.mjs`:

```js
test("Operations overview route is absent while Admin authorization is disabled", async () => {
  const state = fakeState();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const operations = await requestJson(baseUrl, "/api/admin/operations/overview");
    assert.equal(operations.response.status, 404);

    const legacy = await requestJson(baseUrl, "/api/admin/overview");
    assert.equal(legacy.response.status, 200);
    assert.equal(legacy.body.ok, true);
    assert.equal(typeof legacy.body.counts, "object");
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run the focused route test and verify RED**

Run:

```bash
node --test --test-name-pattern="Operations overview route is absent" server/tests/admin-subscriptions.test.mjs
```

Expected: The disabled-route assertion may already pass because the route does not exist. Record it as a characterization guard, not the feature RED. Do not add production code yet.

- [ ] **Step 3: Add the authorized success test that creates the real RED**

Append:

```js
test("Operations overview returns an allowlisted authorized Envelope", async () => {
  const state = fakeState();
  state.platform = {
    adminAuthorizationEnabled: true
  };
  state.subscriptions.service.overview = () => ({
    ok: true,
    total: 12,
    active: 8,
    expiring: 2,
    disabledOrExpired: 2,
    nodes: [{ name: "node-secret" }],
    distribution: { "credential-secret": 1 },
    token: "must-not-cross"
  });

  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = {
      capabilities: ["operations.read"]
    };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schemaVersion, "operations-overview-read-envelope/v1");
    assert.equal(body.freshness, "fresh");
    assert.equal(body.sourceState, "implemented_source");
    assert.deepEqual(body.data, {
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    });
    assert.deepEqual(body.warnings, []);
    assert.deepEqual(body.access, {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    });
    assert.equal(new Date(body.generatedAt).toISOString(), body.generatedAt);
    assert.doesNotMatch(
      JSON.stringify(body),
      /node-secret|credential-secret|must-not-cross/
    );
  } finally {
    server.close();
  }
});
```

- [ ] **Step 4: Run the authorized test and verify RED**

Run:

```bash
node --test --test-name-pattern="Operations overview returns an allowlisted" server/tests/admin-subscriptions.test.mjs
```

Expected: FAIL with HTTP 404 because the new endpoint is not registered.

- [ ] **Step 5: Add the two service imports**

At the top of `server/routes/admin-subscriptions.mjs` add:

```js
import {
  createOperationsReadEnvelope
} from "../services/platform/operations-read-envelope.mjs";
import {
  projectOperationsOverviewReadModel
} from "../services/platform/operations-overview-read-model.mjs";
```

Retain the existing authorization middleware import.

- [ ] **Step 6: Register the endpoint only behind the authorization flag**

Add after the legacy Overview route:

```js
  if (state.platform?.adminAuthorizationEnabled) {
    router.get(
      "/api/admin/operations/overview",
      requireAdminCapability("operations.read"),
      (_req, res) => {
        try {
          const data = projectOperationsOverviewReadModel(core.overview());
          res.json(createOperationsReadEnvelope({
            schemaVersion: "operations-overview-read-envelope/v1",
            freshness: "fresh",
            sourceState: "implemented_source",
            data,
            warnings: [],
            access: {
              allowed: true,
              capability: "operations.read",
              reasonCode: "allowed"
            }
          }));
        } catch (error) {
          sendError(res, error);
        }
      }
    );
  }
```

Do not alter the legacy route block.

- [ ] **Step 7: Run the focused authorized test and verify GREEN**

Run:

```bash
node --test --test-name-pattern="Operations overview returns an allowlisted" server/tests/admin-subscriptions.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Add missing-Principal and missing-capability tests**

Append:

```js
test("Operations overview returns 401 without an Admin principal", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  const app = express();
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "admin_authentication_required"
    });
  } finally {
    server.close();
  }
});

test("Operations overview returns 403 without operations.read", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["users.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "admin_capability_required",
      capability: "operations.read"
    });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 9: Add the safe internal-error test**

Append:

```js
test("Operations overview hides invalid owner data behind a safe internal error", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => ({
    total: "12",
    active: 8,
    expiring: 2,
    disabledOrExpired: 2,
    secret: "must-not-cross"
  });

  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, { error: "internal_error" });
    assert.doesNotMatch(JSON.stringify(body), /must-not-cross|12/);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 10: Run the complete focused route file**

Run:

```bash
node --test server/tests/admin-subscriptions.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 11: Commit Task 3**

```bash
git add server/routes/admin-subscriptions.mjs server/tests/admin-subscriptions.test.mjs
git commit -m "Add protected Operations overview envelope route"
```

---

### Task 4: Full Verification And Draft PR Handoff

**Files:**
- Verify only; do not add implementation files unless a failing check identifies a scope-owned defect.

**Interfaces:**
- Verifies the integrated five-file slice and preserves the design boundaries.

- [ ] **Step 1: Run both focused suites together**

```bash
node --test server/tests/operations-read-envelope.test.mjs server/tests/admin-subscriptions.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run the full Server test suite**

```bash
npm test
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run Admin tests**

```bash
npm run admin:test
```

Expected: PASS with zero failures.

- [ ] **Step 4: Run Admin build**

```bash
npm run admin:build
```

Expected: exit 0.

- [ ] **Step 5: Run document authority and diff checks**

```bash
npm run docs:authority:check
node scripts/check-gate-governance.mjs --snapshot
```

Expected: both exit 0.

Use the repository CI Diff Check as the authoritative changed-file lane check.

- [ ] **Step 6: Run public-site validation**

```bash
npm run cloudflare:site:validate
```

Expected: public-site build, boundary verification, and Cloudflare dry run all exit 0. This is a dry run only and must not deploy.

- [ ] **Step 7: Inspect the final diff**

```bash
git diff --stat master...HEAD
git diff --name-only master...HEAD
```

Expected implementation files:

```text
server/routes/admin-subscriptions.mjs
server/services/platform/operations-overview-read-model.mjs
server/services/platform/operations-read-envelope.mjs
server/tests/admin-subscriptions.test.mjs
server/tests/operations-read-envelope.test.mjs
```

Planning documents may also appear if the implementation branch includes the approved design/plan commits. No production configuration, environment, deployment, schema, frontend, Wallet, Commerce, Payment, Provider, node, or Runtime files may appear.

- [ ] **Step 8: Push and open a Draft PR**

Use:

- Branch: `agent/operations-overview-read-envelope`
- Base: `master`
- PR title: `Add Operations overview read envelope`
- Risk: B
- References: `Refs #559`, `Refs #557`
- Production impact: none
- Activation: default-off, no production environment change

The PR body must record:

- both observed RED failures;
- focused and full GREEN evidence;
- exact changed files;
- legacy endpoint compatibility;
- 404/401/403/500/200 contract coverage;
- no frontend integration;
- no production activation or deployment.

- [ ] **Step 9: Stop before merge**

Leave the PR as Draft for user review. Do not mark it Ready, merge it, configure `ADMIN_AUTHORIZATION_ENABLED`, deploy, or close #559 without explicit approval.
