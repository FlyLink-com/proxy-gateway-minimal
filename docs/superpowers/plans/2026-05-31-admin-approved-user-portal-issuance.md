# Admin-Approved User Portal Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-only user access request flow where portal users can request a 7-day trial, monthly access, or yearly access, and every business-changing action is reviewed and delivered from the administrator side.

**Architecture:** Add a small platform service for portal access requests, keep user-scoped routes default-off, and expose a protected Admin review queue with safe approval preview. The user portal submits and tracks requests only; administrator surfaces prepare review and delivery actions without production issuance.

**Tech Stack:** Node.js ESM, Express, node:test, React 19, Vite, Vitest, Testing Library, existing Admin API client and platform service patterns.

---

## Scope Check

This plan implements one coherent first slice from the approved spec:

```text
portal request -> admin review queue -> safe approval preview
```

It deliberately does not implement production issuance execution, public portal deployment, payment, DNS, Nginx, systemd, firewall, SQLite migration, or legacy-token retirement. Those remain separate A-tier gates.

## File Structure

- Create: `server/services/platform/portal-access-requests.mjs`
  - Owns request normalization, status transitions, trial-duration rules, duplicate-trial default blocking, and safe summaries.
- Create: `server/tests/platform-portal-access-requests.test.mjs`
  - Unit tests for service behavior and fail-closed safety.
- Modify: `server/state.mjs`
  - Wires an in-memory request service into `state.platform`.
- Modify: `server/app.mjs`
  - Keeps portal request routes default-off, but allows them to mount when
    `userPortalRoutesEnabled` and `portalAccessRequests` are explicitly
    injected for local validation.
- Modify: `server/routes/user-portal.mjs`
  - Adds default-off user-scoped request/status routes under `/api/portal/access-requests`.
- Modify: `server/routes/admin-platform.mjs`
  - Adds protected Admin review routes under `/api/admin/platform/portal-access-requests`.
- Create: `server/tests/portal-access-request-routes.test.mjs`
  - Integration tests for default-off user routes and protected Admin review routes.
- Modify: `admin/src/features/user-portal/user-portal-client.ts`
  - Adds `trial` plan and request/status client methods while keeping local client safe-by-default.
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
  - Shows 7-day trial, monthly, yearly; submits request and displays administrator-review status.
- Modify: `admin/src/features/subscriptions/types.ts`
  - Adds Admin-side request queue types.
- Modify: `admin/src/features/subscriptions/api-client.ts`
  - Adds request queue API methods.
- Create: `admin/src/pages/portal-requests-page.tsx`
  - Administrator queue and safe approval preview surface.
- Modify: `admin/src/app/navigation.ts`
  - Adds a `Portal Requests` Admin navigation item.
- Modify: `admin/src/App.tsx`
  - Routes the new Admin page.
- Modify: `admin/src/test/user-portal.test.tsx`
  - Tests trial option and request-only behavior.
- Modify: `admin/src/test/subscriptions.test.ts`
  - Tests API client and Admin queue UI.
- Modify: `docs/PROJECT_CONTEXT.md`
  - Records the repository-only request queue boundary after implementation.

## Task 1: Portal Access Request Service

**Files:**
- Create: `server/services/platform/portal-access-requests.mjs`
- Test: `server/tests/platform-portal-access-requests.test.mjs`

- [ ] **Step 1: Write the failing service tests**

Create `server/tests/platform-portal-access-requests.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";

const NOW = "2026-05-31T00:00:00.000Z";

function service() {
  return createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_1"
  });
}

function validTrialInput(overrides = {}) {
  return {
    portalUserRef: "user_safe_ref",
    displayName: "customer",
    email: "customer@example.com",
    plan: "trial",
    contact: {
      email: "customer@example.com",
      phone: "+86 138 0013 8000",
      telegram: "@customer_support"
    },
    note: "try before monthly",
    ...overrides
  };
}

test("portal access request service creates trial requests pending admin review", () => {
  const requests = service();
  const request = requests.submitRequest(validTrialInput());

  assert.equal(request.id, "pareq_1");
  assert.equal(request.type, "portal_access_request_summary");
  assert.equal(request.status, "pending_admin_review");
  assert.equal(request.plan, "trial");
  assert.equal(request.durationDays, 7);
  assert.equal(request.nextAction, "admin_review_required");
  assert.equal(request.safety.noSubscriptionUrl, true);
  assert.equal(request.safety.noEntitlementCreated, true);
  assert.equal(JSON.stringify(request).includes("try before monthly"), false);
});

test("portal access request service accepts monthly and yearly with fixed durations", () => {
  const monthly = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_monthly"
  }).submitRequest(validTrialInput({ plan: "monthly" }));
  const yearly = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_yearly"
  }).submitRequest(validTrialInput({ plan: "yearly" }));

  assert.equal(monthly.durationDays, 30);
  assert.equal(yearly.durationDays, 365);
});

test("portal access request service blocks repeat trial by default", () => {
  let sequence = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => {
      sequence += 1;
      return `pareq_${sequence}`;
    }
  });

  requests.submitRequest(validTrialInput());

  assert.throws(
    () => requests.submitRequest(validTrialInput()),
    (error) => error.code === "validation_error" && error.message === "trial request already exists for this account"
  );
});

test("admin review can reject or prepare approval preview without issuing", () => {
  const requests = service();
  requests.submitRequest(validTrialInput());

  const preview = requests.previewApproval("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    nodeId: "channel-lab-b-tuic",
    approvalRef: "approval_trial_1"
  });

  assert.equal(preview.status, "approved_pending_delivery");
  assert.equal(preview.issuanceInput.plan, "trial");
  assert.equal(preview.issuanceInput.nodeId, "channel-lab-b-tuic");
  assert.equal(preview.safety.noSubscriptionUrl, true);
  assert.equal(preview.safety.noRuntimeMutation, true);

  const rejected = requests.rejectRequest("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    reasonCode: "contact_unverified"
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.safeReasonCode, "contact_unverified");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
```

Expected: FAIL with module not found for `portal-access-requests.mjs`.

- [ ] **Step 3: Implement the service**

Create `server/services/platform/portal-access-requests.mjs`:

```js
const PLANS = {
  trial: { durationDays: 7, label: "7-day trial" },
  monthly: { durationDays: 30, label: "monthly" },
  yearly: { durationDays: 365, label: "yearly" }
};

const STATUSES = new Set([
  "pending_admin_review",
  "approved_pending_delivery",
  "delivered",
  "rejected",
  "cancelled",
  "expired",
  "revoked"
]);

function platformError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw platformError("validation_error", `${field} is required`);
  }
  return normalized;
}

function isoNow(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw platformError("validation_error", "now must be a valid date");
  }
  return date.toISOString();
}

function safeEmail(value) {
  const email = text(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw platformError("validation_error", "email is invalid");
  }
  return email;
}

function safeTelegram(value) {
  const normalized = text(value, "telegram");
  if (/\s/.test(normalized) || normalized.length > 64) {
    throw platformError("validation_error", "telegram is invalid");
  }
  return normalized.startsWith("@") || normalized.startsWith("https://t.me/")
    ? normalized
    : `@${normalized}`;
}

function safePhone(value) {
  const normalized = text(value, "phone").replace(/\s+/g, " ");
  if (!/^[+\d][\d ()-]{5,31}$/.test(normalized)) {
    throw platformError("validation_error", "phone is invalid");
  }
  return normalized;
}

function normalizePlan(plan) {
  const normalized = text(plan, "plan");
  if (!Object.hasOwn(PLANS, normalized)) {
    throw platformError("validation_error", "plan is invalid");
  }
  return normalized;
}

function nextRequestId(now, sequence) {
  return `pareq_${new Date(now).getTime().toString(36)}_${sequence.toString(36)}`;
}

function summaryFor(record) {
  return {
    id: record.id,
    type: "portal_access_request_summary",
    portalUserRef: record.portalUserRef,
    displayName: record.displayName,
    email: record.email,
    plan: record.plan,
    planLabel: PLANS[record.plan].label,
    durationDays: record.durationDays,
    status: record.status,
    nextAction: record.status === "pending_admin_review" ? "admin_review_required" : record.nextAction,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
    reviewedAt: record.reviewedAt,
    reviewedByRef: record.reviewedByRef,
    safeReasonCode: record.safeReasonCode,
    contactComplete: record.contactComplete,
    priorTrialState: record.priorTrialState,
    entitlementRef: record.entitlementRef,
    accessGrantRef: record.accessGrantRef,
    safety: {
      noSubscriptionUrl: true,
      noRawContactNote: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: !record.entitlementRef,
      noRuntimeMutation: true,
      noProductionMutation: true
    }
  };
}

export function createPortalAccessRequestService(options = {}) {
  const nowFn = options.nowFn || (() => new Date());
  const requestIdFactory = options.requestIdFactory;
  const requests = new Map();
  let sequence = 0;

  function getRecord(id) {
    const request = requests.get(text(id, "requestRef"));
    if (!request) {
      throw platformError("not_found", "portal access request not found");
    }
    return request;
  }

  function hasPriorTrial(portalUserRef) {
    return [...requests.values()].some((request) =>
      request.portalUserRef === portalUserRef
      && request.plan === "trial"
      && !["rejected", "cancelled"].includes(request.status)
    );
  }

  return {
    submitRequest(input = {}) {
      const now = isoNow(nowFn);
      const plan = normalizePlan(input.plan);
      const portalUserRef = text(input.portalUserRef, "portalUserRef");
      if (plan === "trial" && hasPriorTrial(portalUserRef)) {
        throw platformError("validation_error", "trial request already exists for this account");
      }
      sequence += 1;
      const contact = input.contact || {};
      const record = {
        id: text(input.requestRef || requestIdFactory?.() || nextRequestId(now, sequence), "requestRef"),
        portalUserRef,
        displayName: text(input.displayName, "displayName").slice(0, 80),
        email: safeEmail(input.email),
        plan,
        durationDays: PLANS[plan].durationDays,
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        contact: {
          email: safeEmail(contact.email),
          phone: safePhone(contact.phone),
          telegram: safeTelegram(contact.telegram)
        },
        contactComplete: true,
        noteProvided: Boolean(String(input.note || "").trim()),
        priorTrialState: plan === "trial" ? "none" : "not_applicable",
        submittedAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        entitlementRef: null,
        accessGrantRef: null
      };
      requests.set(record.id, record);
      return summaryFor(record);
    },

    listRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return [...requests.values()]
        .filter((request) => !status || request.status === status)
        .filter((request) => !portalUserRef || request.portalUserRef === portalUserRef)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map(summaryFor);
    },

    getRequest(id) {
      return summaryFor(getRecord(id));
    },

    rejectRequest(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      request.status = "rejected";
      request.nextAction = "request_closed";
      request.reviewedAt = now;
      request.reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      request.safeReasonCode = text(input.reasonCode, "reasonCode");
      request.updatedAt = now;
      return summaryFor(request);
    },

    previewApproval(id, input = {}) {
      const request = getRecord(id);
      const reviewedByRef = text(input.reviewedByRef, "reviewedByRef");
      const approvalRef = text(input.approvalRef, "approvalRef");
      const nodeId = text(input.nodeId, "nodeId");
      return {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: summaryFor({
          ...request,
          status: "approved_pending_delivery",
          nextAction: "admin_delivery_required",
          reviewedAt: isoNow(nowFn),
          reviewedByRef
        }),
        issuanceInput: {
          displayName: request.displayName,
          expiresInDays: request.durationDays,
          plan: request.plan,
          nodeId,
          note: `portal-access-request:${request.id}`,
          artifact: { create: true },
          control: {
            accountId: request.portalUserRef,
            ownerRef: request.portalUserRef,
            entitlementId: `ent_${request.id}`,
            requestId: request.id,
            requestedByRef: reviewedByRef,
            purpose: "portal_access_request",
            plan: request.plan
          }
        },
        approvalRef,
        safety: {
          previewOnly: true,
          noSubscriptionUrl: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true,
          requiresSeparateIssuanceExecution: true
        }
      };
    },

    markDelivered(id, input = {}) {
      const now = isoNow(nowFn);
      const request = getRecord(id);
      request.status = "delivered";
      request.nextAction = "user_can_use_access";
      request.reviewedByRef = request.reviewedByRef || text(input.reviewedByRef, "reviewedByRef");
      request.reviewedAt = request.reviewedAt || now;
      request.entitlementRef = text(input.entitlementRef, "entitlementRef");
      request.accessGrantRef = text(input.accessGrantRef, "accessGrantRef");
      request.updatedAt = now;
      return summaryFor(request);
    }
  };
}
```

- [ ] **Step 4: Run service tests to verify GREEN**

Run:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit service slice**

```powershell
git add server/services/platform/portal-access-requests.mjs server/tests/platform-portal-access-requests.test.mjs
git commit -m "feat: add portal access request service"
```

## Task 2: User and Admin HTTP Routes

**Files:**
- Modify: `server/state.mjs`
- Modify: `server/app.mjs`
- Modify: `server/routes/user-portal.mjs`
- Modify: `server/routes/admin-platform.mjs`
- Test: `server/tests/portal-access-request-routes.test.mjs`

- [ ] **Step 1: Write failing route tests**

Create `server/tests/portal-access-request-routes.test.mjs`:

```js
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function fakeState(platform = {}) {
  return {
    rootDir: ROOT,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    platform,
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false
  };
}

function requestService() {
  return createPortalAccessRequestService({
    nowFn: () => "2026-05-31T00:00:00.000Z",
    requestIdFactory: () => "pareq_route_1"
  });
}

function authHeaders() {
  return { Authorization: "Bearer secret", "Content-Type": "application/json" };
}

function trialBody() {
  return {
    portalUserRef: "user_safe_ref",
    displayName: "customer",
    email: "customer@example.com",
    plan: "trial",
    contact: {
      email: "customer@example.com",
      phone: "+86 138 0013 8000",
      telegram: "@customer_support"
    }
  };
}

test("portal access request route stays unavailable unless explicitly enabled", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({ portalAccessRequests: requestService() })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trialBody())
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("enabled portal route creates pending admin review request without subscription URL", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    portalAccessRequests: requestService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trialBody())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.plan, "trial");
    assert.equal(body.request.durationDays, 7);
    assert.equal(body.request.status, "pending_admin_review");
    assert.equal(JSON.stringify(body).includes("subscriptionUrl"), false);
  } finally {
    server.close();
  }
});

test("admin route lists and previews portal access requests behind console auth", async () => {
  const portalAccessRequests = requestService();
  portalAccessRequests.submitRequest(trialBody());
  const { server, baseUrl } = await listen(createApp(fakeState({ portalAccessRequests })));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/platform/portal-access-requests`);
    assert.equal(unauthenticated.status, 401);

    const listed = await fetch(`${baseUrl}/api/admin/platform/portal-access-requests`, {
      headers: authHeaders()
    });
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0].status, "pending_admin_review");

    const preview = await fetch(`${baseUrl}/api/admin/platform/portal-access-requests/pareq_route_1/approve-preview`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        reviewedByRef: "operator_safe_ref",
        approvalRef: "approval_trial_1",
        nodeId: "channel-lab-b-tuic"
      })
    });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.preview.status, "approved_pending_delivery");
    assert.equal(previewBody.preview.safety.noRuntimeMutation, true);
    assert.equal(JSON.stringify(previewBody).includes("subscriptionUrl"), false);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run route tests to verify RED**

Run:

```powershell
node --test server/tests/portal-access-request-routes.test.mjs
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Wire service into runtime state**

Modify `server/state.mjs` imports:

```js
import { createPortalAccessRequestService } from "./services/platform/portal-access-requests.mjs";
```

Add near other platform service construction:

```js
const platformPortalAccessRequests = options.platformPortalAccessRequests || createPortalAccessRequestService();
```

Add under `platform` return object:

```js
portalAccessRequests: platformPortalAccessRequests,
```

- [ ] **Step 4: Keep portal request routes default-off but mountable for local validation**

Modify `server/app.mjs`:

```js
const USER_PORTAL_PUBLIC_PATHS = [
  "/api/portal/entry/enroll",
  "/api/portal/session",
  "/api/portal/access-requests",
  "/api/portal/access-requests/current"
];
```

Replace the portal enabled check:

```js
  const userPortalRoutesEnabled = Boolean(
    state.platform?.userPortalRoutesEnabled
    && (state.platform?.userPortalAuth || state.platform?.portalAccessRequests)
  );
```

Replace the Admin platform mounting condition:

```js
  if (
    state.platform?.leadQueue
    || state.platform?.accountShell
    || state.platform?.accessShell
    || state.platform?.portalAccessRequests
  ) {
    app.use(adminPlatformRoutes(state));
  }
```

This keeps the default app closed because `userPortalRoutesEnabled` is false in
runtime state. It only permits local validation when a test or private run
explicitly injects the request service and enables portal routes.

- [ ] **Step 5: Add user-scoped request routes**

Modify `server/routes/user-portal.mjs`. Keep existing routes and add after `/api/portal/session`:

```js
  const accessRequests = options.portalAccessRequests || state.platform?.portalAccessRequests;

  router.post("/api/portal/access-requests", (req, res) => {
    try {
      if (!accessRequests) {
        const error = new Error("portal access request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      res.status(201).json({
        request: accessRequests.submitRequest(req.body ?? {})
      });
    } catch (error) {
      sendPortalError(res, error);
    }
  });

  router.get("/api/portal/access-requests/current", (req, res) => {
    try {
      if (!accessRequests) {
        const error = new Error("portal access request service is not configured");
        error.code = "validation_error";
        throw error;
      }
      const portalUserRef = String(req.query.portalUserRef || "").trim();
      res.json({ items: accessRequests.listRequests({ portalUserRef }) });
    } catch (error) {
      sendPortalError(res, error);
    }
  });
```

These routes remain default-off because `createApp()` mounts `userPortalRoutes`
only when `state.platform.userPortalRoutesEnabled === true` and either
`state.platform.userPortalAuth` or `state.platform.portalAccessRequests`
exists.

- [ ] **Step 6: Add Admin review routes**

Modify `server/routes/admin-platform.mjs` near other platform service locals:

```js
  const portalAccessRequests = state.platform?.portalAccessRequests;
```

Add routes before `return router;`:

```js
  router.get("/api/admin/platform/portal-access-requests", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        items: portalAccessRequests.listRequests({
          status: req.query.status,
          portalUserRef: req.query.portalUserRef
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/reject", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        request: portalAccessRequests.rejectRequest(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/approve-preview", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        preview: portalAccessRequests.previewApproval(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/portal-access-requests/:requestRef/mark-delivered", (req, res) => {
    try {
      if (!portalAccessRequests) {
        throw new Error("portalAccessRequests is not configured");
      }
      res.json({
        request: portalAccessRequests.markDelivered(req.params.requestRef, req.body ?? {})
      });
    } catch (error) {
      sendError(res, error);
    }
  });
```

- [ ] **Step 7: Run route tests to verify GREEN**

Run:

```powershell
node --test server/tests/portal-access-request-routes.test.mjs
```

Expected: PASS, 3 tests.

- [ ] **Step 8: Run affected server tests**

Run:

```powershell
node --test server/tests/user-portal-routes.test.mjs server/tests/admin-platform-issuance-api.test.mjs server/tests/platform-portal-access-requests.test.mjs server/tests/portal-access-request-routes.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit route slice**

```powershell
git add server/state.mjs server/app.mjs server/routes/user-portal.mjs server/routes/admin-platform.mjs server/tests/portal-access-request-routes.test.mjs
git commit -m "feat: add portal access request routes"
```

## Task 3: Admin API Types and Client

**Files:**
- Modify: `admin/src/features/subscriptions/types.ts`
- Modify: `admin/src/features/subscriptions/api-client.ts`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing API client tests**

Append to the `describe("admin API client", ...)` section in `admin/src/test/subscriptions.test.ts`:

```ts
  test("lists portal access requests through the protected Admin route", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      items: [{
        id: "pareq_1",
        type: "portal_access_request_summary",
        portalUserRef: "user_safe_ref",
        displayName: "customer",
        email: "customer@example.com",
        plan: "trial",
        planLabel: "7-day trial",
        durationDays: 7,
        status: "pending_admin_review",
        nextAction: "admin_review_required",
        submittedAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
        reviewedAt: null,
        reviewedByRef: null,
        safeReasonCode: null,
        contactComplete: true,
        priorTrialState: "none",
        entitlementRef: null,
        accessGrantRef: null,
        safety: {
          noSubscriptionUrl: true,
          noRawContactNote: true,
          noRawHandoffMaterial: true,
          noEntitlementCreated: true,
          noRuntimeMutation: true,
          noProductionMutation: true
        }
      }]
    }), { status: 200 }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher
    });

    const items = await client.listPortalAccessRequests();

    expect(items[0].plan).toBe("trial");
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:3456/api/admin/platform/portal-access-requests");
  });

  test("previews portal access request approval without returning subscription material", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      preview: {
        ok: true,
        mode: "portal-access-request-approval-preview",
        status: "approved_pending_delivery",
        request: { id: "pareq_1", plan: "trial", durationDays: 7, status: "approved_pending_delivery" },
        issuanceInput: {
          displayName: "customer",
          expiresInDays: 7,
          plan: "trial",
          nodeId: "channel-lab-b-tuic",
          note: "portal-access-request:pareq_1",
          artifact: { create: true },
          control: {
            accountId: "user_safe_ref",
            ownerRef: "user_safe_ref",
            entitlementId: "ent_pareq_1",
            requestId: "pareq_1",
            requestedByRef: "operator_safe_ref",
            purpose: "portal_access_request",
            plan: "trial"
          }
        },
        approvalRef: "approval_trial_1",
        safety: {
          previewOnly: true,
          noSubscriptionUrl: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true,
          requiresSeparateIssuanceExecution: true
        }
      }
    }), { status: 200 }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher
    });

    const preview = await client.previewPortalAccessRequestApproval("pareq_1", {
      reviewedByRef: "operator_safe_ref",
      approvalRef: "approval_trial_1",
      nodeId: "channel-lab-b-tuic"
    });

    expect(preview.status).toBe("approved_pending_delivery");
    expect(JSON.stringify(fetcher.mock.calls[0][1]?.body)).not.toMatch(/subscriptionUrl|token=/i);
  });
```

- [ ] **Step 2: Run API client tests to verify RED**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: FAIL because client methods and types do not exist.

- [ ] **Step 3: Add Admin request types**

Add to `admin/src/features/subscriptions/types.ts` before `CleanEdgeReadinessInput`:

```ts
export type PortalAccessRequestPlan = "trial" | "monthly" | "yearly";

export type PortalAccessRequestStatus =
  | "pending_admin_review"
  | "approved_pending_delivery"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "expired"
  | "revoked";

export type PortalAccessRequestSummary = {
  id: string;
  type: "portal_access_request_summary";
  portalUserRef: string;
  displayName: string;
  email: string;
  plan: PortalAccessRequestPlan;
  planLabel: string;
  durationDays: number;
  status: PortalAccessRequestStatus;
  nextAction: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedByRef: string | null;
  safeReasonCode: string | null;
  contactComplete: boolean;
  priorTrialState: string;
  entitlementRef: string | null;
  accessGrantRef: string | null;
  safety: {
    noSubscriptionUrl: boolean;
    noRawContactNote: boolean;
    noRawHandoffMaterial: boolean;
    noEntitlementCreated: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
  };
};

export type PortalAccessApprovalPreviewInput = {
  reviewedByRef: string;
  approvalRef: string;
  nodeId: string;
};

export type PortalAccessApprovalPreview = {
  ok: boolean;
  mode: "portal-access-request-approval-preview";
  status: "approved_pending_delivery" | string;
  request: Partial<PortalAccessRequestSummary>;
  issuanceInput: Record<string, unknown>;
  approvalRef: string;
  safety: {
    previewOnly: boolean;
    noSubscriptionUrl: boolean;
    noRawHandoffMaterial: boolean;
    noRuntimeMutation: boolean;
    noProductionMutation: boolean;
    requiresSeparateIssuanceExecution: boolean;
  };
};
```

- [ ] **Step 4: Add client methods**

Modify `admin/src/features/subscriptions/api-client.ts` imports:

```ts
  PortalAccessApprovalPreview,
  PortalAccessApprovalPreviewInput,
  PortalAccessRequestSummary,
```

Add methods in the returned client object:

```ts
    listPortalAccessRequests: async (status?: string) => {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      return (
        await request<{ items: PortalAccessRequestSummary[] }>(
          `/api/admin/platform/portal-access-requests${query}`
        )
      ).items;
    },
    previewPortalAccessRequestApproval: async (
      requestRef: string,
      input: PortalAccessApprovalPreviewInput
    ) =>
      (
        await request<{ preview: PortalAccessApprovalPreview }>(
          `/api/admin/platform/portal-access-requests/${encodeURIComponent(requestRef)}/approve-preview`,
          {
            method: "POST",
            body: JSON.stringify(input)
          }
        )
      ).preview,
```

- [ ] **Step 5: Run API client tests to verify GREEN**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit client slice**

```powershell
git add admin/src/features/subscriptions/types.ts admin/src/features/subscriptions/api-client.ts admin/src/test/subscriptions.test.ts
git commit -m "feat: add portal request admin client"
```

## Task 4: User Portal Trial Request Flow

**Files:**
- Modify: `admin/src/features/user-portal/user-portal-client.ts`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Test: `admin/src/test/user-portal.test.tsx`

- [ ] **Step 1: Add failing portal UI tests**

Append to `describe("user portal product surface", ...)` in `admin/src/test/user-portal.test.tsx`:

```tsx
  test("submits a 7 day trial as an administrator-reviewed request", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: /7 天试用/ }));
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    expect(await screen.findByText("等待管理员审核")).not.toBeNull();
    expect(screen.getByText(/管理员审核通过后才会发放试用订阅/)).not.toBeNull();
    expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: "trial",
        requestOnly: true
      })
    );
    expect(screen.getByText("授权完成后显示订阅链接")).not.toBeNull();
  });

  test("local portal client never returns a trial subscription URL before admin delivery", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z"),
      demoSubscriptionUrl: "https://sub.example.test/import/should-not-be-used-for-trial"
    });

    const request = await client.applyForSubscription({
      userRef: "user_safe_ref",
      displayName: "customer",
      email: "customer@example.com",
      contact: {
        email: "customer@example.com",
        phone: "+86 138 0013 8000",
        telegram: "@customer_support"
      },
      planId: "trial",
      clientTarget: "clash",
      requestOnly: true
    });

    expect(request.lifecycle).toBe("pending");
    expect(request.status).toBe("ready_for_operator_review");
    expect(request.subscriptionUrl).toBeUndefined();
    expect(request.expiresAt).toBe("待管理员发放");
  });
```

- [ ] **Step 2: Run portal tests to verify RED**

Run:

```powershell
npm run admin:test -- user-portal
```

Expected: FAIL because `trial` plan and `requestOnly` do not exist.

- [ ] **Step 3: Extend portal client types and local behavior**

Modify `admin/src/features/user-portal/user-portal-client.ts`:

```ts
export type PortalPlanId = "trial" | "monthly" | "yearly";
```

Add `requestOnly?: boolean` to `PortalApplySubscriptionInput`:

```ts
export type PortalApplySubscriptionInput = {
  userRef: string;
  displayName: string;
  email: string;
  contact: PortalContactInfo;
  planId: PortalPlanId;
  clientTarget: PortalClientId;
  requestOnly?: boolean;
};
```

Update helpers:

```ts
function durationDaysForPlan(planId: PortalPlanId) {
  if (planId === "yearly") return 365;
  if (planId === "trial") return 7;
  return 30;
}

function planLabel(planId: PortalPlanId) {
  if (planId === "yearly") return "年卡";
  if (planId === "trial") return "7 天试用";
  return "月卡";
}
```

Inside `applyForSubscription`, replace subscription URL selection:

```ts
      const subscriptionUrl =
        input.planId === "trial" || input.requestOnly
          ? undefined
          : options.demoSubscriptionUrl?.trim() || undefined;
```

Set `expiresAt` for request-only trial:

```ts
      const expiresAt =
        input.planId === "trial" || input.requestOnly
          ? "待管理员发放"
          : expiresAtFromDays(now(), durationDaysForPlan(input.planId));
```

- [ ] **Step 4: Add trial plan to portal UI**

Modify `plans` in `admin/src/features/user-portal/user-portal-page.tsx`:

```tsx
const plans: PortalPlan[] = [
  {
    id: "trial",
    label: "7 天试用",
    billingCycle: "管理员发放后 7 天",
    priceLabel: "Trial",
    description: "先申请试用，审核通过后由管理员发放。",
    highlights: ["申请制", "管理员审批", "默认每个账户一次"]
  },
  {
    id: "monthly",
    label: "月卡",
    billingCycle: "30 天",
    priceLabel: "Monthly",
    description: "适合先开通体验，按月管理订阅有效期。",
    highlights: ["一个受控订阅", "有效期 30 天", "可刷新替换旧订阅"]
  },
  {
    id: "yearly",
    label: "年卡",
    billingCycle: "365 天",
    priceLabel: "Yearly",
    description: "适合长期使用，减少频繁续期开通成本。",
    highlights: ["一个受控订阅", "有效期 365 天", "可刷新替换旧订阅"]
  }
];
```

Change pending label:

```tsx
function lifecycleLabel(lifecycle: SubscriptionLifecycle) {
  switch (lifecycle) {
    case "active":
      return "服务生效中";
    case "pending":
      return "等待管理员审核";
    case "expired":
      return "已过期";
    default:
      return "未开通";
  }
}
```

Pass `requestOnly: true` when applying:

```tsx
        : await portalClient.applyForSubscription({
            userRef,
            displayName: userDisplayName,
            email: userEmail,
            contact: contactInfo,
            planId: selectedPlanId,
            clientTarget,
            requestOnly: true
          });
```

Change CTA for non-active requests:

```tsx
function subscriptionCtaLabel(lifecycle: SubscriptionLifecycle, pending: boolean) {
  if (pending) return "处理中";
  if (lifecycle === "active") return "刷新当前订阅";
  if (lifecycle === "pending") return "等待审核中";
  if (lifecycle === "expired") return "重新提交申请";
  return "提交申请";
}
```

Update pending copy:

```tsx
? "申请已提交。管理员审核通过后才会发放试用订阅或正式套餐。"
```

- [ ] **Step 5: Run portal tests to verify GREEN**

Run:

```powershell
npm run admin:test -- user-portal
```

Expected: PASS.

- [ ] **Step 6: Commit portal slice**

```powershell
git add admin/src/features/user-portal/user-portal-client.ts admin/src/features/user-portal/user-portal-page.tsx admin/src/test/user-portal.test.tsx
git commit -m "feat: add admin-reviewed trial requests to portal"
```

## Task 5: Admin Request Queue Page

**Files:**
- Create: `admin/src/pages/portal-requests-page.tsx`
- Modify: `admin/src/app/navigation.ts`
- Modify: `admin/src/App.tsx`
- Test: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Add failing Admin UI tests**

Append to `admin/src/test/subscriptions.test.ts`:

```ts
describe("portal access request admin page", () => {
  test("renders trial requests and safe approval preview", async () => {
    const listPortalAccessRequests = vi.fn(async () => [{
      id: "pareq_1",
      type: "portal_access_request_summary" as const,
      portalUserRef: "user_safe_ref",
      displayName: "customer",
      email: "customer@example.com",
      plan: "trial" as const,
      planLabel: "7-day trial",
      durationDays: 7,
      status: "pending_admin_review" as const,
      nextAction: "admin_review_required",
      submittedAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
      reviewedAt: null,
      reviewedByRef: null,
      safeReasonCode: null,
      contactComplete: true,
      priorTrialState: "none",
      entitlementRef: null,
      accessGrantRef: null,
      safety: {
        noSubscriptionUrl: true,
        noRawContactNote: true,
        noRawHandoffMaterial: true,
        noEntitlementCreated: true,
        noRuntimeMutation: true,
        noProductionMutation: true
      }
    }]);
    const previewPortalAccessRequestApproval = vi.fn(async () => ({
      ok: true,
      mode: "portal-access-request-approval-preview" as const,
      status: "approved_pending_delivery",
      request: { id: "pareq_1", plan: "trial", durationDays: 7 },
      issuanceInput: { plan: "trial", nodeId: "channel-lab-b-tuic" },
      approvalRef: "approval_trial_1",
      safety: {
        previewOnly: true,
        noSubscriptionUrl: true,
        noRawHandoffMaterial: true,
        noRuntimeMutation: true,
        noProductionMutation: true,
        requiresSeparateIssuanceExecution: true
      }
    }));

    render(createElement(PortalRequestsPage, {
      apiClient: adminClient({
        listPortalAccessRequests,
        previewPortalAccessRequestApproval
      } as unknown as Partial<AdminApiClient>)
    }));

    expect(await screen.findByText("Portal requests")).not.toBeNull();
    expect(screen.getByText("7-day trial")).not.toBeNull();
    expect(screen.getByText("pending_admin_review")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Approval reference"), { target: { value: "approval_trial_1" } });
    fireEvent.change(screen.getByLabelText("Operator ref"), { target: { value: "operator_safe_ref" } });
    fireEvent.change(screen.getByLabelText("Target node"), { target: { value: "channel-lab-b-tuic" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate approval preview" }));

    expect(await screen.findByText("approved_pending_delivery")).not.toBeNull();
    expect(previewPortalAccessRequestApproval).toHaveBeenCalledWith("pareq_1", {
      approvalRef: "approval_trial_1",
      reviewedByRef: "operator_safe_ref",
      nodeId: "channel-lab-b-tuic"
    });
    expect(screen.queryByText(/subscriptionUrl|token=/i)).toBeNull();
  });
});
```

Add import at the top:

```ts
import { PortalRequestsPage } from "../pages/portal-requests-page";
```

- [ ] **Step 2: Run Admin UI tests to verify RED**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: FAIL because `PortalRequestsPage` does not exist.

- [ ] **Step 3: Create the Admin request queue page**

Create `admin/src/pages/portal-requests-page.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import type {
  AdminApiClient,
} from "../features/subscriptions/api-client";
import type {
  PortalAccessApprovalPreview,
  PortalAccessRequestSummary
} from "../features/subscriptions/types";
import { errorMessage } from "../lib/errors";

export function PortalRequestsPage({ apiClient }: { apiClient: AdminApiClient }) {
  const [items, setItems] = useState<PortalAccessRequestSummary[]>([]);
  const [selectedRef, setSelectedRef] = useState("");
  const [approvalRef, setApprovalRef] = useState("");
  const [reviewedByRef, setReviewedByRef] = useState("operator_safe_ref");
  const [nodeId, setNodeId] = useState("channel-lab-b-tuic");
  const [preview, setPreview] = useState<PortalAccessApprovalPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void apiClient.listPortalAccessRequests()
      .then((requests) => {
        if (!cancelled) {
          setItems(requests);
          setSelectedRef(requests[0]?.id ?? "");
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, "Portal request load failed."));
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRef) return;
    setPending(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await apiClient.previewPortalAccessRequestApproval(selectedRef, {
        approvalRef: approvalRef.trim(),
        reviewedByRef: reviewedByRef.trim(),
        nodeId: nodeId.trim()
      }));
    } catch (requestError) {
      setError(errorMessage(requestError, "Approval preview failed."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h2>Portal requests</h2>
          <p className="muted">Administrator review queue for trial, monthly, and yearly access requests.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="gate-review-card" aria-label="Portal request queue">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.planLabel}</td>
                  <td>{item.status}</td>
                  <td>{item.durationDays} days</td>
                  <td>{item.contactComplete ? "complete" : "incomplete"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="gate-review-card" aria-label="Portal request approval preview">
        <form className="form-stack" onSubmit={submitPreview}>
          <label>
            <span>Request ref</span>
            <select value={selectedRef} onChange={(event) => setSelectedRef(event.target.value)} required>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Approval reference</span>
            <input value={approvalRef} onChange={(event) => setApprovalRef(event.target.value)} required />
          </label>
          <label>
            <span>Operator ref</span>
            <input value={reviewedByRef} onChange={(event) => setReviewedByRef(event.target.value)} required />
          </label>
          <label>
            <span>Target node</span>
            <input value={nodeId} onChange={(event) => setNodeId(event.target.value)} required />
          </label>
          <button className="primary-button" type="submit" disabled={pending || !selectedRef}>
            {pending ? "Generating" : "Generate approval preview"}
          </button>
        </form>
      </section>

      {preview ? (
        <section className="gate-review-card" aria-label="Safe approval preview">
          <div className="metric-grid">
            <div className="metric-card">
              <span>Status</span>
              <strong>{preview.status}</strong>
            </div>
            <div className="metric-card">
              <span>Approval</span>
              <strong>{preview.approvalRef}</strong>
            </div>
          </div>
          <div className="alert">
            Safe preview only. Real delivery still requires administrator-controlled issuance and handoff.
          </div>
          <pre className="visible-once" aria-label="Safe approval preview JSON">
            {JSON.stringify(preview.issuanceInput, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add navigation**

Modify `admin/src/app/navigation.ts`:

```ts
import { ClipboardCheck, Gauge, Inbox, Network, Users, type LucideIcon } from "lucide-react";
```

Add page id:

```ts
export type AdminPage =
  | "overview"
  | "portalRequests"
  | "provisioning"
  | "subscriptions"
  | "nodes";
```

Add nav item:

```ts
  { id: "portalRequests", label: "Portal Requests", icon: Inbox },
```

Add title:

```ts
  portalRequests: "Portal Requests",
```

- [ ] **Step 5: Route page in App**

Modify `admin/src/App.tsx` imports:

```tsx
import { PortalRequestsPage } from "./pages/portal-requests-page";
```

Add in `renderPage()` switch:

```tsx
    case "portalRequests":
      return <PortalRequestsPage apiClient={apiClient} />;
```

- [ ] **Step 6: Run Admin UI tests to verify GREEN**

Run:

```powershell
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Admin UI slice**

```powershell
git add admin/src/pages/portal-requests-page.tsx admin/src/app/navigation.ts admin/src/App.tsx admin/src/test/subscriptions.test.ts
git commit -m "feat: add portal request admin queue"
```

## Task 6: Documentation and Full Validation

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: Update project context**

Add a bullet under `Current architecture priorities` after `User Portal Business Boundary`:

```markdown
- Admin-Approved Portal Request Queue: repository-only support now lets the
  user portal submit trial/monthly/yearly access requests while keeping every
  business-changing action in the administrator review path. The 7-day trial
  is request-only and is not automatically issued by the user portal. The
  protected Admin surface can review requests and prepare safe approval
  previews, but production entitlement creation, artifact delivery, public
  portal exposure, payment activation, DNS, Nginx, systemd, firewall, and
  runtime mutation remain unapproved without separate gates. See
  `docs/superpowers/specs/2026-05-31-admin-approved-user-portal-issuance-design.md`.
```

- [ ] **Step 2: Run focused validations**

Run:

```powershell
node --test server/tests/platform-portal-access-requests.test.mjs server/tests/portal-access-request-routes.test.mjs server/tests/user-portal-routes.test.mjs
npm run admin:test -- user-portal
npm run admin:test -- src/test/subscriptions.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run full local validation**

Run:

```powershell
npm run admin:test
npm run admin:build
npm test
npm run project-state:check
git diff --check
```

Expected:

- Admin tests pass.
- Admin build passes.
- Server test suite passes.
- Project-state check passes.
- Diff check reports no whitespace errors. LF/CRLF warnings are acceptable on this Windows checkout.

- [ ] **Step 4: Commit documentation**

```powershell
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: record admin-approved portal request boundary"
```

## Final Review Checklist

- [ ] The user portal can submit 7-day trial, monthly, and yearly requests.
- [ ] The trial request does not return a subscription URL before administrator delivery.
- [ ] User routes are still default-off unless explicitly enabled for validation.
- [ ] Admin routes require console auth and never expose raw subscription material.
- [ ] Admin queue provides review and approval preview only.
- [ ] Production issuance remains outside this implementation slice.
- [ ] No public Admin, payment, DNS, Nginx, firewall, systemd, or production DB migration was introduced.
- [ ] Full validation commands passed.
