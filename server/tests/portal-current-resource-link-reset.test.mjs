import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createPortalCurrentResourceService } from "../services/platform/portal-current-resource.mjs";
import { listen } from "./helpers/listen.mjs";

const ACCOUNT = "acct_current_resource_owner";
const OTHER = "acct_current_resource_other";
const RESOURCE_REF = `resource_${"a".repeat(64)}`;
const REQUEST_REF = "pareq_current_resource_reset";
const VALID_UNTIL = "2027-01-01T00:00:00.000Z";
const NOW = "2026-11-20T12:00:00.000Z";
const IDEMPOTENCY_KEY = "portal_reset_current_resource_20261120";
const NEW_URL = "https://sub.example.test/sub/a/synthetic-rotated.yaml";

function failure(code) {
  return Object.assign(new Error("synthetic-private-internal-detail"), { code });
}

function makeService({ model = "legacy", resetAvailable = true, setupAvailable = true, calls = [] } = {}) {
  const resource = {
    state: "available",
    plan: { id: "monthly", durationDays: 30, monthlyTrafficGb: 50 },
    validUntil: VALID_UNTIL,
    setupAvailable,
    resourceRef: RESOURCE_REF,
    usage: {
      totalBytes: 50 * 1024 ** 3,
      usedBytes: 1024,
      remainingBytes: 50 * 1024 ** 3 - 1024,
      collectionStatus: "measured",
      updatedAt: NOW,
      cycleStartedAt: "2026-11-01T00:00:00.000Z",
      cycleEndsAt: VALID_UNTIL
    }
  };
  const accessRequests = {
    canResetSubscriptionLink(input) { return resetAvailable && input?.portalUserRef === ACCOUNT && input?.requestRef === REQUEST_REF; },
    resetSubscriptionLink(input) {
      calls.push(structuredClone(input));
      if (input.portalUserRef !== ACCOUNT) throw failure("not_found");
      return {
        id: REQUEST_REF,
        portalUserRef: ACCOUNT,
        status: "delivered",
        validUntil: VALID_UNTIL,
        event: { type: "subscription_link_reset", occurredAt: NOW },
        subscriptionUrl: NEW_URL
      };
    }
  };
  const service = createPortalCurrentResourceService({
    controlStore: {
      readLegacyPortalCurrentResource({ accountId }) {
        if (model === "wallet_first") {
          return { model: "wallet_first", resource };
        }
        if (accountId !== ACCOUNT) {
          return { model: "legacy", resource: { state: "none" }, requestRef: null };
        }
        return {
          model: "legacy",
          resource,
          requestRef: REQUEST_REF
        };
      }
    },
    accessRequests,
    runtimeCore: {},
    walletFirstProjection: null,
    walletFirstSetupDelivery: null,
    nowFn: () => new Date(NOW)
  });
  return { service, calls, resource };
}

function makeApp(service, { enabled = true } = {}) {
  const auth = {
    requireSession({ sessionRef }) {
      const accountId = {
        owner_session: ACCOUNT,
        other_session: OTHER
      }[sessionRef];
      if (!accountId) throw failure("invalid_session");
      return { accountId, sessionRef };
    }
  };
  const state = {
    rootDir: fileURLToPath(new URL("../../", import.meta.url)),
    consoleToken: "synthetic-console-token",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) }
    },
    platform: {
      userPortalRoutesEnabled: enabled,
      userPortalAuth: auth,
      portalCurrentResourceService: service
    }
  };
  return createApp(state);
}

async function withServer(t, app, run) {
  const { server, baseUrl } = await listen(app);
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await run(baseUrl);
}

function headers(session = "owner_session") {
  return { "x-portal-session": session, "content-type": "application/json" };
}

function post(baseUrl, body, { session = "owner_session", path = "/api/portal/resources/current/reset-link" } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(body)
  });
}

test("current-resource overview exposes reset readiness only for the enabled legacy model", () => {
  const enabled = makeService({ resetAvailable: true }).service;
  const disabled = makeService({ resetAvailable: false }).service;
  assert.equal(enabled.getCurrentOverview({ accountId: ACCOUNT }).linkResetAvailable, true);
  assert.equal(disabled.getCurrentOverview({ accountId: ACCOUNT }).linkResetAvailable, undefined);
  assert.deepEqual(enabled.getCurrentOverview({ accountId: OTHER }), { state: "none" });
});

test("current-resource reset capability stays absent when setup delivery is unavailable", () => {
  const fixture = makeService({ setupAvailable: false });
  assert.equal(fixture.service.getCurrentOverview({ accountId: ACCOUNT }).linkResetAvailable, undefined);
  assert.throws(() => fixture.service.resetCurrentResourceLink({
    accountId: ACCOUNT,
    resourceRef: RESOURCE_REF,
    idempotencyKey: IDEMPOTENCY_KEY,
    confirmed: true
  }), { code: "not_found" });
  assert.deepEqual(fixture.calls, []);
});

test("current-resource reset maps the authenticated owner and rotates only a matching legacy resource", () => {
  const fixture = makeService();
  const result = fixture.service.resetCurrentResourceLink({
    accountId: ACCOUNT,
    resourceRef: RESOURCE_REF,
    idempotencyKey: IDEMPOTENCY_KEY,
    confirmed: true
  });
  assert.deepEqual(result, {
    delivery: { kind: "subscription_url", subscriptionUrl: NEW_URL }
  });
  assert.deepEqual(fixture.calls, [{
    portalUserRef: ACCOUNT,
    requestRef: REQUEST_REF,
    idempotencyKey: IDEMPOTENCY_KEY,
    confirmed: true
  }]);
});

test("current-resource reset refuses wallet-first, disabled and stale resources without a legacy fallback", () => {
  const walletFirst = makeService({ model: "wallet_first" });
  assert.throws(() => walletFirst.service.resetCurrentResourceLink({
    accountId: ACCOUNT, resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true
  }), { code: "subscription_link_reset_unavailable" });
  assert.deepEqual(walletFirst.calls, []);

  const disabled = makeService({ resetAvailable: false });
  assert.equal(disabled.service.getCurrentOverview({ accountId: ACCOUNT }).linkResetAvailable, undefined);
  assert.throws(() => disabled.service.resetCurrentResourceLink({
    accountId: ACCOUNT, resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true
  }), { code: "subscription_link_reset_unavailable" });
  assert.deepEqual(disabled.calls, []);

  const stale = makeService();
  assert.throws(() => stale.service.resetCurrentResourceLink({
    accountId: ACCOUNT, resourceRef: `resource_${"b".repeat(64)}`, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true
  }), { code: "not_found" });
  assert.deepEqual(stale.calls, []);
});

test("current-resource reset validates explicit confirmation, resource reference and idempotency key", () => {
  const service = makeService().service;
  for (const input of [
    { resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: false },
    { resourceRef: "not-a-resource", idempotencyKey: IDEMPOTENCY_KEY, confirmed: true },
    { resourceRef: RESOURCE_REF, idempotencyKey: "short", confirmed: true },
    { resourceRef: RESOURCE_REF, idempotencyKey: `${IDEMPOTENCY_KEY}\n`, confirmed: true }
  ]) {
    assert.throws(() => service.resetCurrentResourceLink({ accountId: ACCOUNT, ...input }), { code: "validation_error" });
  }
});

test("current-resource reset HTTP route is authenticated, exact, non-cacheable and session-owned", async t => {
  const fixture = makeService();
  const app = makeApp(fixture.service);
  await withServer(t, app, async baseUrl => {
    const response = await post(baseUrl, {
      resourceRef: RESOURCE_REF,
      idempotencyKey: IDEMPOTENCY_KEY,
      confirmed: true
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual(await response.json(), {
      delivery: { kind: "subscription_url", subscriptionUrl: NEW_URL }
    });
    assert.deepEqual(fixture.calls, [{
      portalUserRef: ACCOUNT,
      requestRef: REQUEST_REF,
      idempotencyKey: IDEMPOTENCY_KEY,
      confirmed: true
    }]);

    const other = await post(baseUrl, {
      resourceRef: RESOURCE_REF,
      idempotencyKey: IDEMPOTENCY_KEY,
      confirmed: true
    }, { session: "other_session" });
    assert.equal(other.status, 404);
    assert.equal(other.headers.get("cache-control"), "no-store");
    assert.deepEqual(await other.json(), { error: "not_found" });
  });
});

test("current-resource reset HTTP route rejects implicit, unconfirmed, extra and query-bound requests", async t => {
  const fixture = makeService();
  await withServer(t, makeApp(fixture.service), async baseUrl => {
    const cases = [
      [{ resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: false }, 400, "/api/portal/resources/current/reset-link"],
      [{ resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY }, 400, "/api/portal/resources/current/reset-link"],
      [{ resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true, requestRef: REQUEST_REF }, 400, "/api/portal/resources/current/reset-link"],
      [{ resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true }, 400, "/api/portal/resources/current/reset-link?resourceRef=other"]
    ];
    for (const [body, status, path] of cases) {
      const response = await post(baseUrl, body, { path });
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.deepEqual(await response.json(), { error: "validation_error" });
    }
    const anonymous = await post(baseUrl, {
      resourceRef: RESOURCE_REF, idempotencyKey: IDEMPOTENCY_KEY, confirmed: true
    }, { session: "" });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { error: "invalid_session" });
    assert.deepEqual(fixture.calls, []);
  });
});

test("wallet-first current-resource reset remains fail-closed at the HTTP boundary", async t => {
  const fixture = makeService({ model: "wallet_first" });
  await withServer(t, makeApp(fixture.service), async baseUrl => {
    const response = await post(baseUrl, {
      resourceRef: RESOURCE_REF,
      idempotencyKey: IDEMPOTENCY_KEY,
      confirmed: true
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "subscription_link_reset_unavailable" });
    assert.deepEqual(fixture.calls, []);
  });
});
