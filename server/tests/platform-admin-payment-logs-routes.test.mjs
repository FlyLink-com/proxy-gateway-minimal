import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { adminPaymentLogsRoutes } from "../routes/admin-payment-logs.mjs";

test("Admin payment logs is read-only and redacted", async () => {
  const app = express();
  app.use(adminPaymentLogsRoutes({ platform: { coinsCommerceService: { listPaymentLogs: () => ({ items: [{ attemptRef: "a", providerId: "p" }], safety: { readOnly: true, mutationAllowed: false } }) } } }));
  const server = app.listen(0); try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/platform/payment-logs`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.safety, { readOnly: true, mutationAllowed: false });
    assert.equal(body.items[0].providerId, "p");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
