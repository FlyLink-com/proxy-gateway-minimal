import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.mjs";
import {
  createWalletFirstCurrentResourceProjection
} from "../services/platform/wallet-first-current-resource-projection.mjs";
import { listen } from "./helpers/listen.mjs";

const AVAILABLE_RESOURCE = Object.freeze({
  state: "available",
  plan: Object.freeze({
    id: "monthly_30d_50gb",
    durationDays: 30,
    monthlyTrafficGb: 50
  }),
  validUntil: "2026-09-13T00:00:00.000Z",
  setupAvailable: false
});

function closeServer(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

function createProjection(result, calls) {
  return createWalletFirstCurrentResourceProjection({
    controlStore: {
      readWalletFirstCurrentResourceProjection(input) {
        calls.push(structuredClone(input));
        if (result instanceof Error) throw result;
        return structuredClone(result);
      }
    }
  });
}

function createState({ projection, auth } = {}) {
  return {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
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
      userPortalRoutesEnabled: true,
      userPortalAuth: auth || {
        requireSession({ sessionRef }) {
          if (sessionRef !== "session_alpha") {
            const error = new Error("invalid session");
            error.code = "invalid_session";
            throw error;
          }
          return { sessionRef, accountId: "acct_alpha" };
        }
      },
      ...(projection ? { walletFirstCurrentResourceProjection: projection } : {})
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("current resource route rejects query-selected resources and exposes only the session-bound narrow projection", async (t) => {
  const calls = [];
  const projection = createProjection(AVAILABLE_RESOURCE, calls);
  const { server, baseUrl } = await listen(createApp(createState({ projection })));
  t.after(() => closeServer(server));

  const queryRejected = await fetch(
    `${baseUrl}/api/portal/resources/current?accountId=acct_other&tenantRef=ignored`,
    { headers: { "X-Portal-Session": "session_alpha" } }
  );
  assert.equal(queryRejected.status, 400);
  assert.deepEqual(await queryRejected.json(), { error: "validation_error" });
  assert.deepEqual(calls, []);

  const response = await fetch(
    `${baseUrl}/api/portal/resources/current`,
    { headers: { "X-Portal-Session": "session_alpha" } }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { resource: AVAILABLE_RESOURCE });
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
  assert.doesNotMatch(
    JSON.stringify(body),
    /account|entitlement|request|issued|link|tenant|artifact|node|transition|url|material/i
  );
});

test("current resource route preserves reconciliation as a safe state and rejects unauthenticated access", async (t) => {
  const calls = [];
  const projection = createProjection({ state: "reconciliation_required" }, calls);
  const { server, baseUrl } = await listen(createApp(createState({ projection })));
  t.after(() => closeServer(server));

  const reconciled = await fetch(`${baseUrl}/api/portal/resources/current`, {
    headers: { "X-Portal-Session": "session_alpha" }
  });
  assert.equal(reconciled.status, 200);
  assert.deepEqual(await reconciled.json(), {
    resource: { state: "reconciliation_required" }
  });

  const unauthorized = await fetch(`${baseUrl}/api/portal/resources/current`);
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "invalid_session" });
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
});

test("current resource route rejects malformed or setup-capable projections as unavailable", async (t) => {
  const calls = [];
  const projection = createProjection({
    ...AVAILABLE_RESOURCE,
    setupAvailable: true
  }, calls);
  const { server, baseUrl } = await listen(createApp(createState({ projection })));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/api/portal/resources/current`, {
    headers: { "X-Portal-Session": "session_alpha" }
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "wallet_first_current_resource_unavailable"
  });
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
});

test("current resource route returns unavailable rather than inventing none when its projection is absent or unavailable", async (t) => {
  const absent = await listen(createApp(createState()));
  t.after(() => closeServer(absent.server));
  const absentResponse = await fetch(`${absent.baseUrl}/api/portal/resources/current`, {
    headers: { "X-Portal-Session": "session_alpha" }
  });
  assert.equal(absentResponse.status, 503);
  assert.deepEqual(await absentResponse.json(), {
    error: "wallet_first_current_resource_unavailable"
  });

  const unavailable = new Error("control store unavailable");
  const calls = [];
  const state = createState({ projection: createProjection(unavailable, calls) });
  const running = await listen(createApp(state));
  t.after(() => closeServer(running.server));
  const unavailableResponse = await fetch(`${running.baseUrl}/api/portal/resources/current`, {
    headers: { "X-Portal-Session": "session_alpha" }
  });
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), {
    error: "wallet_first_current_resource_unavailable"
  });
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
});
