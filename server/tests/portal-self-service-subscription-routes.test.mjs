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

function selfService() {
  const calls = [];
  function fail(name, input) {
    calls.push([name, input]);
    throw new Error("legacy self-service must not be called by portal routes");
  }
  return {
    calls,
    openTrial(input) {
      return fail("openTrial", input);
    },
    listSubscriptions(input) {
      return fail("listSubscriptions", input);
    },
    refreshSubscription(input) {
      return fail("refreshSubscription", input);
    },
    disableSubscription(input) {
      return fail("disableSubscription", input);
    }
  };
}

function requestService(options = {}) {
  return createPortalAccessRequestService({
    nowFn: () => "2026-06-04T00:00:00.000Z",
    requestIdFactory: () => "pareq_order_route_1",
    ...options
  });
}

function controlStoreForCommercialModel(commercialModel) {
  return {
    getAccount(accountId) {
      return {
        id: accountId,
        ownerRef: `owner_${accountId}`,
        status: "active",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
        metadata: commercialModel === undefined ? {} : { commercialModel }
      };
    }
  };
}

function portalSessionHeaders() {
  return { "Content-Type": "application/json", "X-Portal-Session": "portal_session_safe" };
}

function portalAuth(accountId = "acct_route_1") {
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

test("portal self-service routes are unavailable unless portal routes are enabled", async () => {
  const service = selfService();
  const { server, baseUrl } = await listen(createApp(fakeState({ portalSelfServiceSubscriptions: service })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalUserRef: "acct_route_1", plan: "trial", clientTarget: "clash" })
    });
    assert.equal(response.status, 401);
    assert.deepEqual(service.calls, []);
  } finally {
    server.close();
  }
});

test("portal route ignores legacy self-service injection and creates an order request", async () => {
  const service = selfService();
  const portalAccessRequests = requestService();
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests,
    portalSelfServiceSubscriptions: service
  })));
  try {
    const opened = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ portalUserRef: "acct_route_1", plan: "trial", clientTarget: "clash" })
    });
    assert.equal(opened.status, 201);
    const openedBody = await opened.json();
    assert.equal(openedBody.request.durationDays, 7);
    assert.equal(openedBody.request.status, "pending_admin_review");
    assert.equal(openedBody.request.nextAction, "admin_review_required");
    assert.equal(JSON.stringify(openedBody).includes("subscriptionUrl"), false);

    const listed = await fetch(`${baseUrl}/api/portal/access-requests/current?portalUserRef=acct_route_1`, {
      headers: { "X-Portal-Session": "portal_session_safe" }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.items.length, 1);
    assert.equal(listedBody.items[0].status, "pending_admin_review");

    const refreshed = await fetch(`${baseUrl}/api/portal/access-requests/refresh`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ portalUserRef: "acct_route_1", requestRef: "pss_route_1", clientTarget: "karing" })
    });
    assert.equal(refreshed.status, 404);
    assert.equal((await refreshed.json()).error, "not_found");

    const disabled = await fetch(`${baseUrl}/api/portal/access-requests/disable`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ portalUserRef: "acct_route_1", requestRef: "pss_route_1" })
    });
    assert.equal(disabled.status, 404);
    assert.equal((await disabled.json()).error, "not_found");

    const deleted = await fetch(`${baseUrl}/api/portal/access-requests/pss_route_1`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
    assert.equal(deleted.status, 401);
    assert.deepEqual(service.calls, []);
  } finally {
    server.close();
  }
});

test("wallet-first Portal sessions cannot create legacy trial or monthly access requests", async () => {
  for (const walletFirstRegistrationEnabled of [true, false]) {
    const portalAccessRequests = requestService({
      walletFirstRegistrationEnabled,
      controlStore: controlStoreForCommercialModel("wallet_first_unique_v1")
    });
    const { server, baseUrl } = await listen(createApp(fakeState({
      userPortalRoutesEnabled: true,
      userPortalAuth: portalAuth(),
      portalAccessRequests
    })));
    try {
      for (const plan of ["trial", "monthly"]) {
        const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
          method: "POST",
          headers: portalSessionHeaders(),
          body: JSON.stringify({ plan, clientTarget: "clash" })
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          error: "wallet_first_deferred_required"
        });
      }
      const current = await fetch(`${baseUrl}/api/portal/access-requests/current`, {
        headers: { "X-Portal-Session": "portal_session_safe" }
      });
      assert.equal(current.status, 409);
      assert.deepEqual(await current.json(), {
        error: "wallet_first_deferred_required"
      });
    } finally {
      server.close();
    }
  }
});

test("legacy Portal accounts retain access-request compatibility when the wallet-first gate is enabled", async () => {
  const portalAccessRequests = requestService({
    walletFirstRegistrationEnabled: true,
    controlStore: controlStoreForCommercialModel("legacy")
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ plan: "monthly", clientTarget: "clash" })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).request.plan, "monthly");
  } finally {
    server.close();
  }
});

test("wallet-first Portal fails closed when the commercial-model source is unavailable", async () => {
  const portalAccessRequests = requestService({
    walletFirstRegistrationEnabled: true
  });
  const { server, baseUrl } = await listen(createApp(fakeState({
    userPortalRoutesEnabled: true,
    userPortalAuth: portalAuth(),
    portalAccessRequests
  })));
  try {
    const response = await fetch(`${baseUrl}/api/portal/access-requests`, {
      method: "POST",
      headers: portalSessionHeaders(),
      body: JSON.stringify({ plan: "monthly", clientTarget: "clash" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "wallet_first_access_request_unavailable"
    });
  } finally {
    server.close();
  }
});
