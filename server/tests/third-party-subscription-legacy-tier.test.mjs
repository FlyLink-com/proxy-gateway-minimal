import assert from "node:assert/strict";
import test from "node:test";
import * as tiers from "../services/platform/third-party-subscription-tier.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";

const GIB = 1024 ** 3;
const NOW = "2026-10-14T10:00:00.000Z";
const tenant = { id: "synthetic_legacy", status: "active" };
const resolve = (...args) => tiers.resolveThirdPartyPlanIdForTenant(...args);
const control = binding => ({ getThirdPartySubscriptionEligibilityByTenantRefs: () => ({ state: "bound", binding }) });

for (const [plan, gb, expected] of [["monthly", 50, "monthly_basic"], ["monthly", 100, "monthly_plus"], ["yearly", 200, "yearly"]]) {
  test(`legacy ${plan}/${gb} resolves from current control-plane evidence`, () => {
    assert.equal(resolve(control({ plan, trafficLimitBytes: gb * GIB }), tenant, { at: NOW }), expected);
  });
}

test("legacy tier requires exact numeric quota and an explicitly recognized subscription plan", () => {
  for (const plan of ["monthly", "yearly"]) {
    for (const quota of [undefined, null, "", 0, -1, NaN, Infinity, 50, 49 * GIB, 51 * GIB, "53687091200", true]) {
      assert.equal(resolve(control({ plan, trafficLimitBytes: quota }), tenant, { at: NOW }), null);
    }
  }
  for (const plan of ["trial", "pilot", "data_pack", "data_pack_100gb", "monthly_basic", "monthly_30d_50gb", "__proto__", "constructor", "", undefined]) {
    assert.equal(resolve(control({ plan, trafficLimitBytes: 50 * GIB }), tenant, { at: NOW }), null);
  }
  assert.equal(resolve(control({ plan: "yearly", trafficLimitBytes: 100 * GIB }), tenant, { at: NOW }), null);
  assert.equal(resolve(control({ plan: "monthly", trafficLimitBytes: 200 * GIB }), tenant, { at: NOW }), null);
});

test("unbound, denied, malformed or failing evidence never falls back to usage lookup", () => {
  let fallbackCalls = 0;
  for (const evidence of [{ state: "unbound" }, { state: "denied" }, { state: "unknown" }, null, {}, { state: "bound" }]) {
    const store = {
      getThirdPartySubscriptionEligibilityByTenantRefs: () => evidence,
      findUsageBindingByTenantRef: () => { fallbackCalls++; return { plan: "offerv_plan_30d_50gb_monthly_v1" }; }
    };
    assert.equal(resolve(store, tenant, { at: NOW }), null);
  }
  assert.equal(resolve({
    getThirdPartySubscriptionEligibilityByTenantRefs() { throw new Error("synthetic db failure"); },
    findUsageBindingByTenantRef() { fallbackCalls++; return { plan: "offerv_plan_30d_50gb_monthly_v1" }; }
  }, tenant, { at: NOW }), null);
  assert.equal(fallbackCalls, 0);
});

test("legacy evidence reads both alias forms once at the supplied time, and rejects closed tenants first", () => {
  let calls = 0;
  const store = { getThirdPartySubscriptionEligibilityByTenantRefs(refs, options) {
    calls++;
    assert.equal(refs.length, 2);
    assert.equal(refs[0], tenant.id);
    assert.match(refs[1], /^tenantref_[a-f0-9]{16}$/);
    assert.equal(options.at, NOW);
    return { state: "bound", binding: { plan: "monthly", trafficLimitBytes: 50 * GIB } };
  } };
  assert.equal(resolve(store, tenant, { at: NOW }), "monthly_basic");
  assert.equal(resolve(store, { ...tenant, status: "expiring" }, { at: NOW }), "monthly_basic");
  for (const status of [undefined, "", "expired", "disabled", "revoked", "unknown"]) {
    assert.equal(resolve(store, { ...tenant, status }, { at: NOW }), null);
  }
  for (const id of [undefined, "", " ", 5, "a".repeat(513)]) {
    assert.equal(resolve(store, { ...tenant, id }, { at: NOW }), null);
  }
  assert.equal(calls, 2);
});

test("adapters without the history-aware reader retain offer-only behavior and cannot admit legacy plans", () => {
  for (const plan of ["monthly", "yearly"]) {
    assert.equal(resolve({ findUsageBindingByTenantRef: () => ({ plan, trafficLimitBytes: 50 * GIB }) }, tenant), null);
  }
  assert.equal(resolve({ findUsageBindingByTenantRef: () => ({ plan: "offerv_plan_30d_50gb_monthly_v1" }) }, tenant), "monthly_basic");
  assert.equal(resolve(null, tenant), null);
});

test("renderer uses eligibility evidence and the injected clock without touching the own-server configuration", () => {
  const original = { servers: [{ name: "synthetic-own" }] };
  let selected;
  const state = {
    platform: { usageNowFn: () => new Date(NOW), controlStore: {
      getThirdPartySubscriptionEligibilityByTenantRefs(_refs, { at }) {
        assert.equal(at, NOW);
        return { state: "bound", binding: { plan: "monthly", trafficLimitBytes: 100 * GIB } };
      }
    } },
    thirdPartySubscriptions: { enabled: true, available: true, store: {
      listActiveServersForPlan(plan) { selected = plan; return [{ name: "synthetic-third-party", countryCode: "JP" }]; }
    } }
  };
  const result = applyThirdPartyProxyConfig(state, { tenant, proxyConfig: original });
  assert.equal(selected, "monthly_plus");
  assert.equal(result.servers.length, 2);
  assert.equal(original.servers.length, 1);
  assert.equal(result.servers[0], original.servers[0]);
  state.platform.usageNowFn = () => new Date("invalid");
  assert.equal(applyThirdPartyProxyConfig(state, { tenant, proxyConfig: original }), original);
});
