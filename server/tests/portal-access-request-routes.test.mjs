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

function lifecycleRequestService() {
  const calls = [];
  const portalAccessRequests = createPortalAccessRequestService({
    nowFn: () => "2026-05-31T00:00:00.000Z",
    requestIdFactory: () => "pareq_route_lifecycle",
    runtimeCore: {
      rotateSubscriptionArtifact(id) {
        calls.push(["rotateSubscriptionArtifact", id]);
        return {
          previous: { id, status: "rotated" },
          replacement: { id: "artifact_route_2", status: "active" },
          subscriptionUrl: "https://sub.example.test/import/refreshed-visible-once"
        };
      },
      revokeSubscriptionArtifact(id) {
        calls.push(["revokeSubscriptionArtifact", id]);
        return { id, status: "revoked" };
      },
      disableTenant(id) {
        calls.push(["disableTenant", id]);
        return { id, status: "disabled" };
      }
    }
  });
  portalAccessRequests.submitRequest(trialBody());
  portalAccessRequests.markDelivered("pareq_route_lifecycle", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_route_safe_ref",
    accessGrantRef: "grant_route_safe_ref",
    tenantId: "tenant_route_1",
    artifactId: "artifact_route_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  return { portalAccessRequests, calls };
}

const ROUTE_SAFE_SUMMARY_MARKERS = [
  "route-safe-visible-once-link",
  "route-safe-delivery-link",
  "route-safe-handoff-material",
  "route-safe-token-marker",
  "route-safe-credential-marker",
  "route-safe-raw-artifact-material",
  "route-safe-edge-credential-ref",
  "route-safe-edge-material-digest"
];

function routeMaterialBearingPortalRequest(overrides = {}) {
  const id = overrides.id || "pareq_route_safe_delivered";
  const now = "2026-06-08T00:00:00.000Z";
  return {
    id,
    portalUserRef: "route_user_safe_summary",
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "operator_safe_ref",
    safeReasonCode: "safe_reviewed",
    expiresAt: "2026-07-08T00:00:00.000Z",
    validUntil: "2026-07-08T00:00:00.000Z",
    entitlementRef: `ent_${id}`,
    accessGrantRef: `grant_${id}`,
    tenantId: "route_tenant_safe_summary",
    artifactId: "route_artifact_safe_summary",
    subscriptionUrl: "route-safe-visible-once-link",
    deliveryLink: "route-safe-delivery-link",
    handoffMaterial: { marker: "route-safe-handoff-material" },
    token: "route-safe-token-marker",
    credentials: { marker: "route-safe-credential-marker" },
    rawArtifactMaterial: "route-safe-raw-artifact-material",
    edgeChannelRef: "route-channel-safe-summary",
    edgeCredentialRef: "route-safe-edge-credential-ref",
    edgeMaterialDigest: "route-safe-edge-material-digest",
    edgeCredentials: [{
      edgeChannelRef: "route-channel-safe-summary",
      edgeCredentialRef: "route-safe-edge-credential-ref",
      edgeMaterialDigest: "route-safe-edge-material-digest"
    }],
    event: {
      type: "old_link_invalidated",
      occurredAt: "2026-06-08T00:01:00.000Z",
      deliveryLink: "route-safe-delivery-link",
      rawArtifactMaterial: "route-safe-raw-artifact-material"
    },
    ...overrides
  };
}

function routePortalRequestStoreWith(records) {
  const byId = new Map(records.map((record) => [record.id, structuredClone(record)]));
  return {
    upsertPortalAccessRequest(record) {
      byId.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    getPortalAccessRequest(id) {
      const record = byId.get(id);
      return record ? structuredClone(record) : null;
    },
    listPortalAccessRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return [...byId.values()]
        .filter((record) => !status || record.status === status)
        .filter((record) => !portalUserRef || record.portalUserRef === portalUserRef)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map((record) => structuredClone(record));
    }
  };
}

function authHeaders() {
  return { Authorization: "Bearer secret", "Content-Type": "application/json" };
}

function portalSessionHeaders() {
  return { "Content-Type": "application/json", "X-Portal-Session": "portal_session_safe" };
}

function portalAuth(accountId = "user_safe_ref") {
  return {
    requireSession(input = {}) {
      if (input.sessionRef !== "portal_session_safe") {
        const error = new Error("portal session is required");
        error.code = "invalid_session";
        throw error;
      }
      return {
        sessionRef: input.sessionRef,
        accountId
      };
    }
  };
}

function trialBody() {
  return {
    portalUserRef: "user_safe_ref",
    plan: "trial",
    clientTarget: "clash",
    quantity: 1
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

test("enabled portal route creates a pending 7-day trial request without subscription URL", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests: requestService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify(trialBody())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.plan, "trial");
    assert.equal(body.request.clientTarget, "clash");
    assert.equal(body.request.durationDays, 7);
    assert.equal(body.request.quantity, 1);
    assert.equal(body.request.status, "pending_admin_review");
    assert.equal(JSON.stringify(body).includes("subscriptionUrl"), false);
    assert.equal(JSON.stringify(body).includes("customer@example.com"), false);
    assert.equal(JSON.stringify(body).includes("telegram"), false);
  } finally {
    server.close();
  }
});

test("enabled portal route rejects order creation without a portal session before service mutation", async () => {
  let submitCalls = 0;
  const portalAccessRequests = {
    submitRequest() {
      submitCalls += 1;
      throw new Error("submitRequest must not run without a portal session");
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trialBody())
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "invalid_session");
    assert.equal(submitCalls, 0);
  } finally {
    server.close();
  }
});

test("enabled portal route lists every order for the current portal user", async () => {
  let sequence = 0;
  const dates = [
    "2026-05-31T00:00:00.000Z",
    "2026-06-01T00:00:00.000Z"
  ];
  const portalAccessRequests = createPortalAccessRequestService({
    nowFn: () => dates[Math.min(sequence, dates.length - 1)],
    requestIdFactory: () => {
      sequence += 1;
      return `pareq_route_${sequence}`;
    }
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests
  })));
  try {
    const trial = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify(trialBody())
    });
    assert.equal(trial.status, 201);

    const monthly = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({
        portalUserRef: "user_safe_ref",
        plan: "monthly",
        clientTarget: "karing",
        quantity: 3
      })
    });
    assert.equal(monthly.status, 201);

    const listed = await fetch(`${baseUrl}/api/portal/access-requests/current?portalUserRef=user_safe_ref`, {
      headers: { "X-Portal-Session": "portal_session_safe" }
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.items.map((item) => item.id), ["pareq_route_1", "pareq_route_2"]);
    assert.deepEqual(body.items.map((item) => item.plan), ["trial", "monthly"]);
    assert.deepEqual(body.items.map((item) => item.clientTarget), ["clash", "karing"]);
    assert.deepEqual(body.items.map((item) => item.quantity), [1, 3]);
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

test("admin route list omits stored material for delivered and issued portal access requests", async () => {
  const portalAccessRequests = createPortalAccessRequestService({
    portalAccessRequestStore: routePortalRequestStoreWith([
      routeMaterialBearingPortalRequest({ id: "pareq_route_safe_delivered", status: "delivered" }),
      routeMaterialBearingPortalRequest({ id: "pareq_route_safe_issued", status: "issued" })
    ])
  });
  const { server, baseUrl } = await listen(createApp(fakeState({ portalAccessRequests })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/portal-access-requests`, {
      headers: authHeaders()
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.deepEqual(body.items.map((item) => item.id), [
      "pareq_route_safe_delivered",
      "pareq_route_safe_issued"
    ]);
    for (const item of body.items) {
      assert.equal(Object.hasOwn(item, "subscriptionUrl"), false);
      assert.equal(item.safety.noSubscriptionUrl, true);
      assert.deepEqual(item.event, {
        type: "old_link_invalidated",
        occurredAt: "2026-06-08T00:01:00.000Z"
      });
    }
    const serialized = JSON.stringify(body);
    for (const marker of ROUTE_SAFE_SUMMARY_MARKERS) {
      assert.equal(serialized.includes(marker), false);
    }
  } finally {
    server.close();
  }
});

test("admin route updates portal access request traffic limits without returning subscription material", async () => {
  const calls = [];
  const portalAccessRequests = {
    updateTrafficLimit(requestRef, input) {
      calls.push({ requestRef, input });
      return {
        ok: true,
        type: "portal_access_request_traffic_limit_update",
        request: {
          id: requestRef,
          type: "portal_access_request_summary",
          status: "delivered",
          usage: {
            usedBytes: 700,
            totalBytes: 2048,
            status: "within_limit"
          },
          safety: {
            noSubscriptionUrl: true,
            noRawCustomerData: true,
            noRawHandoffMaterial: true,
            noRuntimeMutation: true,
            noProductionMutation: true
          }
        },
        quota: {
          previousTrafficLimitBytes: 1000,
          trafficLimitBytes: 2048,
          updatedAt: "2026-06-15T00:01:00.000Z"
        },
        audit: {
          action: "traffic_limit_updated",
          recordedAt: "2026-06-15T00:01:00.000Z"
        },
        safety: {
          noSubscriptionUrl: true,
          noRawCustomerData: true,
          noRawHandoffMaterial: true,
          noRuntimeMutation: true,
          noProductionMutation: true
        }
      };
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState({ portalAccessRequests })));
  try {
    const response = await fetch(`${baseUrl}/api/admin/platform/portal-access-requests/pareq_route_1/traffic-limit`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        trafficLimitBytes: 2048,
        reviewedByRef: "operator_safe_ref",
        reasonCode: "plan_change"
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.deepEqual(calls, [{
      requestRef: "pareq_route_1",
      input: {
        trafficLimitBytes: 2048,
        reviewedByRef: "operator_safe_ref",
        reasonCode: "plan_change"
      }
    }]);
    assert.equal(body.quotaUpdate.quota.trafficLimitBytes, 2048);
    assert.equal(body.quotaUpdate.audit.action, "traffic_limit_updated");
    assert.doesNotMatch(JSON.stringify(body), /https?:|token=|password|edgecred|channel-vultr/i);
  } finally {
    server.close();
  }
});

test("enabled portal route refreshes and disables a delivered order lifecycle", async () => {
  const { portalAccessRequests, calls } = lifecycleRequestService();
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests
  })));
  try {
    const refreshed = await fetch(`${baseUrl}/api/portal/access-requests/refresh`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({
        portalUserRef: "user_safe_ref",
        requestRef: "pareq_route_lifecycle",
        clientTarget: "karing"
      })
    });
    assert.equal(refreshed.status, 200);
    const refreshedBody = await refreshed.json();
    assert.equal(refreshedBody.request.status, "delivered");
    assert.equal(refreshedBody.request.clientTarget, "karing");
    assert.equal(refreshedBody.request.expiresAt, "2026-06-07T00:00:00.000Z");
    assert.equal(refreshedBody.request.subscriptionUrl, "https://sub.example.test/import/refreshed-visible-once");
    assert.equal(refreshedBody.request.event.type, "old_link_invalidated");
    assert.equal(JSON.stringify(refreshedBody).includes("tenant_route_1"), false);
    assert.equal(JSON.stringify(refreshedBody).includes("artifact_route_1"), false);

    const disabled = await fetch(`${baseUrl}/api/portal/access-requests/disable`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({
        portalUserRef: "user_safe_ref",
        requestRef: "pareq_route_lifecycle"
      })
    });
    assert.equal(disabled.status, 200);
    const disabledBody = await disabled.json();
    assert.equal(disabledBody.request.status, "disabled");
    assert.equal(disabledBody.request.nextAction, "subscription_disabled");
    assert.equal(Object.hasOwn(disabledBody.request, "subscriptionUrl"), false);
    assert.deepEqual(calls, [
      ["rotateSubscriptionArtifact", "artifact_route_1"],
      ["revokeSubscriptionArtifact", "artifact_route_2"],
      ["disableTenant", "tenant_route_1"]
    ]);
  } finally {
    server.close();
  }
});
