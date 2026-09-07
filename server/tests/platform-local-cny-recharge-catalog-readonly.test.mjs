import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createProductionCnyPaymentRechargeOffers } from "../services/platform/production-cny-payment-recharge-price-book.mjs";
import { createLocalCnyRechargeCatalogReadonlyProfile } from "../../scripts/lib/local-cny-recharge-catalog-readonly.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const harness = () => import("../../scripts/start-local-coin-commerce-validation.mjs");
const ownedRoots = () => readdirSync(tmpdir()).filter((name) =>
  name.startsWith(`coin-commerce-local-validation-p${process.pid}-`)).sort();

function probe(handler, method, url) {
  let body = "";
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { body += value; },
  };
  handler({ method, url }, response);
  return { status: response.statusCode, body, headers: response.headers };
}

function httpJson(baseUrl, path, headers, method = "GET", body) {
  return new Promise((resolveResponse, reject) => {
    const target = new URL(path, baseUrl);
    const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = request(target, {
      method,
      headers: { ...headers, ...(bytes ? { "Content-Type": "application/json", "Content-Length": bytes.length } : {}) },
    }, (res) => {
      const chunks = [];
      let length = 0;
      res.on("data", (chunk) => {
        length += chunk.length;
        if (length > 65536) { req.destroy(new Error("bounded response exceeded")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => {
        try { resolveResponse({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: res.headers }); }
        catch { reject(new Error("local response invalid")); }
      });
      res.on("error", reject);
    });
    req.setTimeout(4000, () => req.destroy(new Error("local request timeout")));
    req.on("error", reject);
    req.end(bytes);
  });
}

test("CNY catalog-only profile is fixed and cannot inherit real provider credentials or a fetch fallback", async () => {
  const profile = createLocalCnyRechargeCatalogReadonlyProfile();
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(profile.env.PLATFORM_COIN_RECHARGE_ENABLED, "true");
  assert.equal(profile.env.PLATFORM_XSD_PAYMENT_ENABLED, "true");
  assert.equal(profile.env.PLATFORM_XSD_PAYMENT_METHOD, "alipay");
  assert.equal(profile.env.PLATFORM_PAYPAL_SANDBOX_ENABLED, "false");
  assert.equal(profile.env.PLATFORM_CHAOJIPAY_PAYMENT_ENABLED, "false");
  let globalCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => { globalCalls += 1; throw new Error("must not reach global fetch"); };
  try {
    await assert.rejects(profile.runtimeOptions.xsdFetchFn(), { code: "local_payment_network_disabled" });
    assert.equal(globalCalls, 0);
    assert.equal(profile.inspect().rejectedProviderCalls, 1);
  } finally { globalThis.fetch = original; }
  assert.throws(() => createLocalCnyRechargeCatalogReadonlyProfile({}));
});

test("request boundary blocks every payment write or callback before the real app", () => {
  const profile = createLocalCnyRechargeCatalogReadonlyProfile();
  let appCalls = 0;
  const handler = profile.wrapRequestHandler((_req, res) => { appCalls += 1; res.end("app"); });
  const denied = [
    ...["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => [method, "/api/portal/coins/recharge/orders"]),
    ["POST", "/api/portal/coins/recharge/orders/local/capture"],
    ["GET", "/api/portal/coins/recharge/orders/local/capture"],
    ["GET", "/api/portal/coins/recharge/offers?unexpected=1"],
    ["POST", "/api/platform/payments/xsd/callback"],
    ["GET", "/api/platform/payments/xsd/callback"],
    ["POST", "/api/platform/payments/paypal/callback"],
    ["POST", "/api/platform/payments/chaojipay/callback"],
    ["POST", "/api/portal/coins/recharge/%6frders"],
    ["POST", "/api/portal/coins/recharge/orders/"],
    ["POST", "http://127.0.0.1/api/portal/coins/recharge/orders"],
  ];
  for (const [method, path] of denied) {
    const result = probe(handler, method, path);
    assert.equal(result.status, 403);
    assert.deepEqual(JSON.parse(result.body), { error: { code: "payment_recharge_unavailable", retryable: false } });
    assert.equal(result.headers.location, undefined);
  }
  assert.equal(appCalls, 0);
  assert.equal(profile.inspect().rejectedPaymentRequests, denied.length);
  assert.equal(profile.inspect().rejectedProviderCalls, 0);
});

test("request boundary preserves real login and challenge handlers and permits only canonical payment reads", () => {
  const profile = createLocalCnyRechargeCatalogReadonlyProfile();
  let appCalls = 0;
  const handler = profile.wrapRequestHandler((_req, res) => { appCalls += 1; res.end("app"); });
  const allowed = [
    ["POST", "/api/portal/auth/login"],
    ["POST", "/api/portal/auth/challenge"],
    ["GET", "/api/portal/coins/recharge/offers"],
    ["GET", "/api/portal/coins/recharge/orders"],
    ["GET", "/api/portal/coins/recharge/orders/local-order"],
    ["GET", "/api/portal/coins/wallet"],
  ];
  for (const [method, path] of allowed) assert.equal(probe(handler, method, path).body, "app");
  assert.equal(appCalls, allowed.length);
});

test("real marker-owned runtime serves six production CNY Alipay offers and cannot create an order or call a provider", async () => {
  const before = ownedRoots();
  const module = await harness();
  const handle = await module.startLocalCoinCommerceCnyCatalogReadonlyValidation();
  let root;
  try {
    root = handle.ownedTempRoot;
    assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(new URL(handle.baseUrl).port === "3457", false);
    assert.equal(existsSync(resolve(root, "ownership-marker")), true);
    const headers = { ...handle.portalHeaders.funded, "X-Portal-Recharge-Offers-Version": "2" };
    const catalog = await httpJson(handle.baseUrl, "/api/portal/coins/recharge/offers", headers);
    assert.equal(catalog.status, 200);
    const expected = createProductionCnyPaymentRechargeOffers().map(({ enabled: _enabled, ...offer }) => ({ ...offer, paymentMethods: ["alipay"] }));
    assert.deepEqual(catalog.json.offers, expected);
    assert.equal(JSON.stringify(catalog.json).includes("https:"), false);
    const beforeOrders = await httpJson(handle.baseUrl, "/api/portal/coins/recharge/orders", headers);
    assert.equal(beforeOrders.status, 200);
    assert.equal(beforeOrders.json.recharges.length, 0);
    const denied = await httpJson(handle.baseUrl, "/api/portal/coins/recharge/orders", headers, "POST", { offerRef: catalog.json.offers[0].offerRef, idempotencyKey: "local_readonly_rejected" });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.location, undefined);
    const afterOrders = await httpJson(handle.baseUrl, "/api/portal/coins/recharge/orders", headers);
    assert.equal(afterOrders.json.recharges.length, 0);
    const ledger = await httpJson(handle.baseUrl, "/api/portal/coins/wallet/ledger?limit=5", headers);
    assert.equal(ledger.status, 200);
    assert.equal(ledger.json.entries.length, 5);
    assert.equal(handle.inspect().funds.spendableUnits, 60);
    assert.deepEqual(handle.inspect().rechargeBoundary, { readonly: true, rejectedPaymentRequests: 1, rejectedProviderCalls: 0 });
  } finally { await handle.stop(); }
  assert.equal(existsSync(root), false);
  assert.deepEqual(ownedRoots(), before);
});

test("new readonly UI and ephemeral factories reject arguments without acquiring a root", async () => {
  const module = await harness();
  const before = ownedRoots();
  for (const method of ["startLocalCoinCommerceCnyCatalogReadonlyUiValidation", "startLocalCoinCommerceCnyCatalogReadonlyValidation"]) {
    for (const value of [undefined, null, {}, { env: {} }, { port: 0 }]) await assert.rejects(module[method](value));
  }
  assert.deepEqual(ownedRoots(), before);
});

test("readonly entry reuses the harness without altering the existing PayPal entry or production composition", () => {
  const source = readFileSync(resolve(ROOT, "scripts/start-local-coin-commerce-cny-catalog-readonly-ui-validation.mjs"), "utf8");
  assert.match(source, /startLocalCoinCommerceCnyCatalogReadonlyUiValidation/);
  assert.match(source, /process\.argv\.length !== 2/);
  assert.match(source, /catalogOnly: true/);
  assert.match(source, /paymentActions: false/);
  const oldEntry = readFileSync(resolve(ROOT, "scripts/start-local-coin-commerce-ui-validation.mjs"), "utf8");
  assert.match(oldEntry, /startLocalCoinCommerceUiValidation\(\)/);
  const implementation = readFileSync(resolve(ROOT, "scripts/start-local-coin-commerce-validation.mjs"), "utf8");
  assert.match(implementation, /createLocalPayPalSandboxFetch\(\)/);
  assert.match(implementation, /readonlyRecharge\.wrapRequestHandler\(app\)/);
});

test("readonly CLI rejects configuration arguments with aggregate output before startup", () => {
  const entry = resolve(ROOT, "scripts/start-local-coin-commerce-cny-catalog-readonly-ui-validation.mjs");
  const result = spawnSync(process.execPath, [entry, "--port=0"], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    type: "coin_commerce_local_cny_catalog_readonly_ui_validation",
    ok: false, error: "local_readonly_ui_validation_failed",
  });
});
