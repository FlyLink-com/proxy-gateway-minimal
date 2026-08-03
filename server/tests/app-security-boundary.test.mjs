import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("payment callbacks stay static and isolated from runtime credentials", async () => {
  const appSource = await readFile(new URL("../app.mjs", import.meta.url), "utf8");
  const routeSource = await readFile(
    new URL("../routes/portal-coin-recharge.mjs", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /coinRechargeEnabled/u);
  assert.match(appSource, /paymentRechargeProvider/u);
  assert.match(appSource, /portal-coin-recharge/u);
  assert.doesNotMatch(
    appSource,
    /create(?:Xsd|ChaoJiPay)PaymentRuntime|merchantSecret|credentialLoader|PLATFORM_XSD_|PLATFORM_CHAOJIPAY_/u,
  );
  const combinedSource = `${appSource}\n${routeSource}`;
  assert.doesNotMatch(combinedSource, /clientSecret|webhookId|access_token/u);
  assert.doesNotMatch(combinedSource, /\bimport\s*\(/u);
  assert.doesNotMatch(
    combinedSource,
    /from\s+["'][^"']*(?:credential|payment-runtime)[^"']*["']/iu,
  );
  for (const path of [
    "/api/platform/payments/paypal/callback",
    "/api/platform/payments/xsd/callback",
    "/api/platform/payments/chaojipay/callback",
  ]) {
    assert.equal(appSource.split(path).length - 1, 1, `app literal count for ${path}`);
    assert.equal(routeSource.split(path).length - 1, 1, `route literal count for ${path}`);
  }
});
