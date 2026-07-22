import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import test from "node:test";
import { portalCommerceRoutes } from "../routes/portal-commerce.mjs";

function harness() {
  const app = express(); app.use(express.json());
  const service = {
    getWallet: ({ accountRef }) => ({ accountRef }),
    getCatalog: ({ accountRef }) => ({ accountRef }),
    listOrders: ({ accountRef }) => ({ items: [{ accountRef }] }),
    getReferralSummary: ({ accountRef }) => ({ accountRef }),
    createProductOrder: async ({ accountRef }) => ({ order: { accountRef } }),
    createRechargeOrder: async ({ accountRef }) => ({ order: { accountRef } }),
    getPaymentAttempt: async ({ accountRef, attemptRef }) => ({ accountRef, attemptRef }),
    switchPaymentAttempt: async ({ accountRef }) => ({ account: accountRef })
  };
  app.use(portalCommerceRoutes({ platform: { userPortalAuth: { requireSession: ({ sessionRef }) => sessionRef === "sess-a" ? { accountId: "acct-a" } : (() => { throw Object.assign(new Error(), { code: "invalid_session" }); })() }, coinsCommerceService: service } }));
  return app;
}

async function request(app, path, options = {}) {
  const server = http.createServer(app); await new Promise((resolve) => server.listen(0, resolve));
  try { return await fetch(`http://127.0.0.1:${server.address().port}${path}`, options); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("Portal commerce derives ownership from X-Portal-Session", async () => {
  const app = harness();
  let response = await request(app, "/api/portal/commerce/wallet");
  assert.equal(response.status, 401);
  response = await request(app, "/api/portal/commerce/orders?accountRef=acct-b", { headers: { "X-Portal-Session": "sess-a" } });
  assert.equal(response.status, 400);
  response = await request(app, "/api/portal/commerce/orders", { headers: { "X-Portal-Session": "sess-a" } });
  assert.equal(response.status, 200);
  response = await request(app, "/api/portal/commerce/orders", { method: "POST", headers: { "X-Portal-Session": "sess-a", "Idempotency-Key": "k", "Content-Type": "application/json" }, body: JSON.stringify({ offerVersionRef: "offer-1" }) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).order.accountRef, "acct-a");
});
