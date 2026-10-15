import assert from "node:assert/strict";
import test from "node:test";

import { createCoinCommerceDataPackRotationCoordinator } from "../services/platform/coin-commerce-data-pack-rotation-coordinator.mjs";

function fixture({ failFirst = false, failedIntentCount = 0 } = {}) {
  const pending = new Map();
  const calls = [];
  let nextId = 0;
  let fail = failFirst;
  const coordinator = createCoinCommerceDataPackRotationCoordinator({
    rotation: {
      reconcilePending({ limit }) {
        calls.push(limit);
        if (fail) {
          fail = false;
          throw new Error("temporary store failure");
        }
        return { inspected: 1, completed: 1 - failedIntentCount,
          failed: failedIntentCount };
      }
    },
    batchSize: 3,
    intervalMs: 1000,
    scheduleFn(callback, delay) {
      assert.equal(delay, 1000);
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    clearScheduleFn(id) { pending.delete(id); }
  });
  return {
    coordinator, calls, pending,
    failNext() { fail = true; },
    tick() {
      const [id, callback] = pending.entries().next().value;
      pending.delete(id);
      callback();
    }
  };
}

test("pack rotation recovery runs a bounded batch at startup and periodically without overlap", () => {
  const f = fixture();
  f.coordinator.start();
  assert.deepEqual(f.calls, [3]);
  assert.equal(f.pending.size, 1);
  f.tick();
  assert.deepEqual(f.calls, [3, 3]);
  assert.equal(f.pending.size, 1);
  f.coordinator.stop();
  assert.equal(f.pending.size, 0);
  assert.deepEqual(f.coordinator.getStatus(), {
    running: false, completedBatches: 2, failedBatches: 0, failedIntents: 0
  });
});

test("startup recovery failure leaves no timer and periodic failure is retried without losing stop", () => {
  const first = fixture({ failFirst: true });
  assert.throws(() => first.coordinator.start(), /temporary store failure/);
  assert.equal(first.pending.size, 0);
  first.coordinator.start();
  first.coordinator.stop();

  const second = fixture();
  second.coordinator.start();
  second.failNext();
  second.tick();
  assert.deepEqual(second.coordinator.getStatus(), {
    running: true, completedBatches: 1, failedBatches: 1, failedIntents: 0
  });
  assert.equal(second.pending.size, 1);
  second.tick();
  assert.deepEqual(second.coordinator.getStatus(), {
    running: true, completedBatches: 2, failedBatches: 1, failedIntents: 0
  });
  second.coordinator.stop();
  assert.equal(second.pending.size, 0);
});

test("pack rotation recovery rejects an unbounded batch", () => {
  assert.throws(() => createCoinCommerceDataPackRotationCoordinator({
    rotation: { reconcilePending() {} }, batchSize: 21
  }), { code: "coin_commerce_data_pack_rotation_coordinator_invalid" });
});

test("per-intent failures remain visible in aggregate without exposing order references", () => {
  const f = fixture({ failedIntentCount: 1 });
  f.coordinator.start();
  assert.deepEqual(f.coordinator.getStatus(), {
    running: true, completedBatches: 1, failedBatches: 0, failedIntents: 1
  });
  f.coordinator.stop();
});
