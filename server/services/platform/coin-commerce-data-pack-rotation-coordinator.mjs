import { types as utilTypes } from "node:util";

function invalid() {
  const error = new Error("Data-pack rotation coordinator is invalid");
  error.code = "coin_commerce_data_pack_rotation_coordinator_invalid";
  return error;
}

// The rotation service owns the durable lease and exact order/artifact checks.
// This worker only schedules bounded recovery; it never creates a new intent.
export function createCoinCommerceDataPackRotationCoordinator({
  rotation,
  batchSize = 10,
  intervalMs = 60_000,
  scheduleFn = setTimeout,
  clearScheduleFn = clearTimeout
} = {}) {
  if (!rotation || typeof rotation !== "object" || utilTypes.isProxy(rotation)
    || typeof Object.getOwnPropertyDescriptor(rotation, "reconcilePending")?.value !== "function"
    || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20
    || !Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 3_600_000
    || typeof scheduleFn !== "function" || typeof clearScheduleFn !== "function") {
    throw invalid();
  }
  const reconcile = Object.getOwnPropertyDescriptor(rotation, "reconcilePending").value;
  let running = false;
  let timer = null;
  let completedBatches = 0;
  let failedBatches = 0;
  let failedIntents = 0;

  function recover() {
    const result = reconcile.call(rotation, { limit: batchSize });
    if (!result || typeof result !== "object" || utilTypes.isProxy(result)
      || !Number.isSafeInteger(result.inspected)
      || !Number.isSafeInteger(result.completed)
      || !Number.isSafeInteger(result.failed)
      || result.inspected < 0 || result.inspected > batchSize
      || result.completed < 0 || result.failed < 0
      || result.completed + result.failed !== result.inspected) {
      throw invalid();
    }
    completedBatches += 1;
    failedIntents += result.failed;
  }

  function schedule() {
    timer = scheduleFn(() => {
      timer = null;
      if (!running) return;
      try {
        recover();
      } catch {
        // Durable intents remain pending. A later bounded pass can retry them.
        failedBatches += 1;
      }
      if (running) {
        try {
          schedule();
        } catch {
          running = false;
        }
      }
    }, intervalMs);
  }

  function start() {
    if (running) return;
    recover(); // A broken store or prerequisite fails startup before scheduling.
    running = true;
    try {
      schedule();
    } catch (error) {
      running = false;
      throw error;
    }
  }

  function stop() {
    running = false;
    if (timer !== null) {
      clearScheduleFn(timer);
      timer = null;
    }
  }

  function getStatus() {
    return Object.freeze({ running, completedBatches, failedBatches, failedIntents });
  }

  return Object.freeze({ start, stop, getStatus });
}
