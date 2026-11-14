import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalSupportRequestService } from "../services/platform/portal-support-requests.mjs";
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
  return createPortalSupportRequestService({
    nowFn: () => "2026-06-03T00:00:00.000Z",
    requestIdFactory: () => "psup_route_1"
  });
}

function portalAuth(accountId = "account_safe_1") {
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

function supportBody() {
  return {
    portalUserRef: "user_safe_ref",
    category: "client_import",
    clientTarget: "clash",
    message: "Clash import fails after subscription refresh",
    subscriptionRequestRef: "subreq_monthly"
  };
}

test("portal support request route stays unavailable unless explicitly enabled", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({ portalSupportRequests: requestService() })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/support-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supportBody())
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("enabled portal route creates safe support form submissions", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    portalSupportRequests: requestService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/support-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(supportBody())
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.id, "psup_route_1");
    assert.equal(body.request.status, "submitted");
    assert.equal(body.request.category, "client_import");
    assert.equal(body.request.messageProvided, true);
    assert.equal(JSON.stringify(body).includes("Clash import fails"), false);
    assert.equal(JSON.stringify(body).includes("Telegram"), false);
  } finally {
    server.close();
  }
});

test("support request owner ref comes from the portal session when one exists", async () => {
  // B2-6 P2-2: a masked display value sent back by the client must never
  // become the persisted owner ref; the session account id wins.
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth("account_safe_1"),
    portalSupportRequests: requestService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/support-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": "portal_session_safe"
      },
      body: JSON.stringify({ ...supportBody(), portalUserRef: "lo***@example.test" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.portalUserRef, "account_safe_1");
    assert.equal(JSON.stringify(body).includes("lo***@example.test"), false);
  } finally {
    server.close();
  }
});

test("support request keeps the submitted owner ref without a session", async () => {
  // B2-6 P2-2 residual: the route does not require a session, so an
  // anonymous submission keeps its client-supplied owner ref as-is.
  // The value is a display label, not an account link.
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    portalSupportRequests: requestService()
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/support-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...supportBody(), portalUserRef: "lo***@example.test" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.portalUserRef, "lo***@example.test");
  } finally {
    server.close();
  }
});
