import assert from "node:assert/strict";
import test from "node:test";

import { composeCoinCommerceDataPackFulfillment } from "../services/platform/coin-commerce-data-pack-production-binding.mjs";

test("opt-in Commerce dispatcher isolates plan and pack handlers and rejects unknown delivery", async () => {
  const calls = [];
  const handler = composeCoinCommerceDataPackFulfillment({
    planHandler: {
      idempotencyContract: "deduplicate_by_command_ref",
      execute(command) { calls.push(["plan", command]); return { status: "delivered", effectRef: "effect_plan" }; }
    },
    dataPackHandler: {
      idempotencyContract: "deduplicate_by_command_ref",
      execute(command) { calls.push(["pack", command]); return { status: "delivered", effectRef: "effect_pack" }; }
    }
  });
  const plan = { delivery: { kind: "subscription_plan" } };
  const pack = { delivery: { kind: "data_pack" }, fulfillmentLease: { leaseGeneration: 1 } };
  assert.equal(handler.idempotencyContract, "deduplicate_by_command_ref");
  assert.equal((await handler.execute(plan)).effectRef, "effect_plan");
  assert.equal((await handler.execute(pack)).effectRef, "effect_pack");
  assert.deepEqual(calls, [["plan", plan], ["pack", pack]]);
  assert.rejects(handler.execute({ delivery: { kind: "other" } }), {
    code: "coin_commerce_fulfillment_reconciliation_required"
  });
});
