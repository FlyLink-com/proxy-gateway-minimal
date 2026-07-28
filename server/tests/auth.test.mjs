import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import test from "node:test";
import express from "express";
import { createApp } from "../app.mjs";
import { createAuthMiddleware } from "../middleware/auth.mjs";
import { listen } from "./helpers/listen.mjs";

const ROOT_DIR = new URL("../../", import.meta.url).pathname;

function commerceAuthState() {
  return {
    rootDir: ROOT_DIR,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 }
    },
    platform: {
      coinsCommerceEnabled: true,
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          return { sessionRef, accountId: "acct_alpha" };
        }
      },
      coinCommerceStore: {
        listPublishedOffers() {
          throw new Error("auth boundary test must not reach Commerce Store");
        },
        getPublishedOffer() {
          throw new Error("auth boundary test must not reach Commerce Store");
        },
        createCheckoutQuote() {
          throw new Error("auth boundary test must not reach Commerce Store");
        },
        confirmOrder() {
          throw new Error("auth boundary test must not reach Commerce Store");
        },
        cancelOrder() {
          throw new Error("auth boundary test must not reach Commerce Store");
        },
        getOrder() {
          throw new Error("auth boundary test must not reach Commerce Store");
        }
      },
      coinCommerceCoordinator: {
        start() {},
        stop() {}
      }
    },
    isPortListening: async () => false,
    runCommand: async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      code: 0,
      timedOut: false
    })
  };
}

function rawRequest(baseUrl, {
  method,
  path,
  headers = [],
  body
}) {
  const target = new URL(baseUrl);
  const outgoingHeaders = {};
  for (let index = 0; index < headers.length; index += 2) {
    const name = headers[index];
    const value = headers[index + 1];
    const existingName = Object.keys(outgoingHeaders).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase()
    );
    if (!existingName) {
      outgoingHeaders[name] = value;
      continue;
    }
    outgoingHeaders[existingName] = Array.isArray(outgoingHeaders[existingName])
      ? [...outgoingHeaders[existingName], value]
      : [outgoingHeaders[existingName], value];
  }
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      method,
      path,
      agent: false,
      headers: outgoingHeaders
    }, (response) => {
      const chunks = [];
      response.on("error", reject);
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode,
          text: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

test("auth middleware allows public paths", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health", "/proxy.pac"] }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("auth middleware requires token for paths under public paths", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health"] }));
  app.get("/api/health/extra", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/health/extra`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("auth middleware blocks control paths without token", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: ["/api/health"] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/proxy/start`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("auth middleware accepts bearer token", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: [] }));
  app.post("/api/proxy/start", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/proxy/start`, {
      method: "POST",
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("auth middleware rejects token query for protected paths", async () => {
  const app = express();
  app.use(createAuthMiddleware({ token: "secret", publicPaths: [] }));
  app.post("/api/proxy/stop", (_req, res) => res.json({ ok: true }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/proxy/stop?token=secret`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("unmatched catalog and commerce namespace requests authenticate before legacy JSON parsing", async (t) => {
  const { server, baseUrl } = await listen(createApp(commerceAuthState()));
  try {
    for (const request of [
      {
        method: "PUT",
        path: "/api/portal/commerce/orders",
        body: "{"
      },
      {
        method: "POST",
        path: "/api/portal/commerce/orders/extra",
        body: "{"
      },
      {
        method: "POST",
        path: "/api/portal/catalog/offers/offer_basic/extra",
        body: "{"
      },
      {
        method: "OPTIONS",
        path: "/api/portal/catalog/offers",
        body: "{"
      },
      {
        method: "PUT",
        path: "/api/portal/Commerce/orders",
        body: "{"
      },
      {
        method: "POST",
        path: "/api/portal/%63ommerce/orders/extra",
        body: "{"
      },
      {
        method: "POST",
        path: "/api%2fportal%2fcatalog/offers/extra",
        body: "{"
      },
      {
        method: "POST",
        path: "/api/portal/commerce/%",
        body: "{"
      },
      {
        method: "POST",
        path: "/api%252fportal%252fcommerce/orders/extra",
        body: "{"
      }
    ]) {
      await t.test(`${request.method} ${request.path}`, async () => {
        const response = await rawRequest(baseUrl, {
          ...request,
          headers: ["Content-Type", "application/json"]
        });
        assert.equal(response.status, 401);
        assert.deepEqual(JSON.parse(response.text), { error: "Unauthorized" });
      });
    }
  } finally {
    server.close();
  }
});

test("console Bearer cannot replace a Portal session and Portal session cannot authorize status", async () => {
  const { server, baseUrl } = await listen(createApp(commerceAuthState()));
  try {
    const bearerOnly = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
      headers: { Authorization: "Bearer secret" }
    });
    assert.equal(bearerOnly.status, 401);
    assert.deepEqual(await bearerOnly.json(), {
      error: {
        code: "commerce_session_invalid",
        retryable: false
      }
    });

    const portalOnly = await fetch(`${baseUrl}/api/status`, {
      headers: { "X-Portal-Session": "session_alpha" }
    });
    assert.equal(portalOnly.status, 401);
    assert.deepEqual(await portalOnly.json(), { error: "Unauthorized" });
  } finally {
    server.close();
  }
});

test("class-prototype Portal auth mounts Commerce routes and authenticates a real request", async () => {
  let authCalls = 0;
  class PrototypePortalAuth {
    createPasswordSetupSession() {
      return null;
    }

    requireSession({ sessionRef }) {
      authCalls += 1;
      return { sessionRef, accountId: "acct_alpha" };
    }
  }
  const state = commerceAuthState();
  state.platform.userPortalAuth = new PrototypePortalAuth();
  state.platform.coinCommerceStore.listPublishedOffers = () => [];
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
      headers: { "X-Portal-Session": "session_alpha" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { offers: [] });
    assert.equal(authCalls, 1);
  } finally {
    server.close();
  }
});

test("prototype Portal auth accessor is not executed and does not mount Commerce routes", async () => {
  let getterCalls = 0;
  class AccessorPortalAuth {
    createPasswordSetupSession() {
      return null;
    }

    get requireSession() {
      getterCalls += 1;
      throw new Error("prototype auth accessor must not run");
    }
  }
  const state = commerceAuthState();
  state.platform.userPortalAuth = new AccessorPortalAuth();
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
      headers: { "X-Portal-Session": "session_alpha" }
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(getterCalls, 0);
  } finally {
    server.close();
  }
});

test("Proxy Portal auth traps stay inert and do not leak or mount Commerce routes", async () => {
  let trapCalls = 0;
  const auth = new Proxy({
    createPasswordSetupSession() {
      return null;
    },
    requireSession({ sessionRef }) {
      return { sessionRef, accountId: "acct_alpha" };
    }
  }, {
    getOwnPropertyDescriptor() {
      trapCalls += 1;
      throw new Error("raw Proxy descriptor trap");
    },
    getPrototypeOf() {
      trapCalls += 1;
      throw new Error("raw Proxy prototype trap");
    }
  });
  const state = commerceAuthState();
  state.platform.userPortalAuth = auth;
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/api/portal/catalog/offers`, {
      headers: { "X-Portal-Session": "session_alpha" }
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(trapCalls, 0);
  } finally {
    server.close();
  }
});
