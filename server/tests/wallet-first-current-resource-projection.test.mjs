import assert from "node:assert/strict";
import test from "node:test";

import {
  createWalletFirstCurrentResourceProjection
} from "../services/platform/wallet-first-current-resource-projection.mjs";

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

function createControlStore(result, calls) {
  return {
    readWalletFirstCurrentResourceProjection(input) {
      calls.push(structuredClone(input));
      if (result instanceof Error) throw result;
      return structuredClone(result);
    }
  };
}

test("wallet-first current-resource projection forwards only the session-owned account and emits the narrow available DTO", () => {
  const calls = [];
  const service = createWalletFirstCurrentResourceProjection({
    controlStore: createControlStore(AVAILABLE_RESOURCE, calls)
  });

  const resource = service.getCurrentResource({ accountId: "acct_alpha" });

  assert.deepEqual(resource, AVAILABLE_RESOURCE);
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
  assert.doesNotMatch(
    JSON.stringify(resource),
    /account|entitlement|request|issued|link|tenant|artifact|node|transition|url|material/i
  );
});

test("wallet-first current-resource projection permits only the three public states and fails closed for malformed store output", () => {
  for (const resource of [
    { state: "none" },
    { state: "reconciliation_required" }
  ]) {
    const service = createWalletFirstCurrentResourceProjection({
      controlStore: createControlStore(resource, [])
    });
    assert.deepEqual(service.getCurrentResource({ accountId: "acct_alpha" }), resource);
  }

  for (const malformedResource of [
    {
      ...AVAILABLE_RESOURCE,
      internalReference: "must-not-cross-boundary"
    },
    {
      ...AVAILABLE_RESOURCE,
      setupAvailable: true
    },
    { state: "future_unclassified_state" },
    new Proxy({ state: "none" }, {})
  ]) {
    const malformed = createWalletFirstCurrentResourceProjection({
      controlStore: createControlStore(malformedResource, [])
    });
    assert.throws(
      () => malformed.getCurrentResource({ accountId: "acct_alpha" }),
      (error) => error?.code === "wallet_first_current_resource_unavailable"
    );
  }
});

test("wallet-first current-resource projection never relabels an unavailable control-store read as none", () => {
  const unavailable = new Error("control store is unavailable");
  const service = createWalletFirstCurrentResourceProjection({
    controlStore: createControlStore(unavailable, [])
  });

  assert.throws(
    () => service.getCurrentResource({ accountId: "acct_alpha" }),
    (error) => error?.code === "wallet_first_current_resource_unavailable"
  );
});
