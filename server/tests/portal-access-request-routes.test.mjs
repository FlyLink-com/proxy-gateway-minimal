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
    plan: "trial"
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
    assert.equal(JSON.stringify(body).includes("customer@example.com"), false);
    assert.equal(JSON.stringify(body).includes("telegram"), false);
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
