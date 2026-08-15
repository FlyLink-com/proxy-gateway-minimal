import { types as utilTypes } from "node:util";

const ACCOUNT_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PUBLIC_STATES = new Set([
  "none",
  "available",
  "reconciliation_required"
]);
const SERVICE_INSTANCES = new WeakSet();

function serviceError(code = "wallet_first_current_resource_unavailable") {
  const error = new Error("Wallet-first current resource projection is unavailable");
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function snapshotExactObject(value, fields, code) {
  try {
    if (!isPlainObject(value)) throw serviceError(code);
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw serviceError(code);
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw serviceError(code);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw serviceError(code);
      }
      snapshot[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) throw serviceError(code);
    }
    return snapshot;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function ownCallable(target, field, code) {
  try {
    if (
      !target
      || (typeof target !== "object" && typeof target !== "function")
      || utilTypes.isProxy(target)
    ) {
      throw serviceError(code);
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw serviceError(code);
    }
    return descriptor.value;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
}

function normalizeAccountId(value, code) {
  if (typeof value !== "string" || !ACCOUNT_REFERENCE.test(value)) {
    throw serviceError(code);
  }
  return value;
}

function normalizeTimestamp(value, code) {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw serviceError(code);
  }
  return value;
}

function normalizePlan(value, code) {
  const plan = snapshotExactObject(value, [
    "id",
    "durationDays",
    "monthlyTrafficGb"
  ], code);
  if (
    typeof plan.id !== "string"
    || !/^[a-z][a-z0-9_]{2,63}$/.test(plan.id)
    || !Number.isSafeInteger(plan.durationDays)
    || plan.durationDays < 1
    || !Number.isSafeInteger(plan.monthlyTrafficGb)
    || plan.monthlyTrafficGb < 1
  ) {
    throw serviceError(code);
  }
  return Object.freeze({
    id: plan.id,
    durationDays: plan.durationDays,
    monthlyTrafficGb: plan.monthlyTrafficGb
  });
}

function normalizeResource(value) {
  const code = "wallet_first_current_resource_unavailable";
  let state;
  try {
    if (!isPlainObject(value)) throw serviceError(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, "state");
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw serviceError(code);
    }
    state = descriptor.value;
  } catch (error) {
    if (error?.code === code) throw error;
    throw serviceError(code);
  }
  if (!PUBLIC_STATES.has(state)) throw serviceError(code);
  if (state !== "available") {
    const resource = snapshotExactObject(value, ["state"], code);
    return Object.freeze({ state: resource.state });
  }
  const resource = snapshotExactObject(value, [
    "state",
    "plan",
    "validUntil",
    "setupAvailable"
  ], code);
  if (resource.setupAvailable !== false) throw serviceError(code);
  return Object.freeze({
    state: "available",
    plan: normalizePlan(resource.plan, code),
    validUntil: normalizeTimestamp(resource.validUntil, code),
    // This source slice provides no delivery/configuration action. Keep the
    // response contract explicitly incapable of signalling a hidden reveal.
    setupAvailable: false
  });
}

function snapshotControlStore(value) {
  const code = "wallet_first_current_resource_unavailable";
  const reader = ownCallable(value, "readWalletFirstCurrentResourceProjection", code);
  return Object.freeze({
    readWalletFirstCurrentResourceProjection: (input) => reader.call(value, input)
  });
}

export function snapshotWalletFirstCurrentResourceProjection(value) {
  const code = "wallet_first_current_resource_unavailable";
  if (!SERVICE_INSTANCES.has(value)) throw serviceError(code);
  const getCurrentResource = ownCallable(value, "getCurrentResource", code);
  return Object.freeze({
    getCurrentResource: (input) => getCurrentResource.call(value, input)
  });
}

/**
 * Creates the narrow read-only Portal resource projection. It intentionally
 * accepts only the session-owned account ID and carries no setup/reveal,
 * delivery material, or legacy fallback capability.
 */
export function createWalletFirstCurrentResourceProjection(options = {}) {
  const code = "wallet_first_current_resource_unavailable";
  const values = snapshotExactObject(options, ["controlStore"], code);
  const controlStore = snapshotControlStore(values.controlStore);

  const service = Object.freeze({
    getCurrentResource(input) {
      const request = snapshotExactObject(input, ["accountId"], code);
      const accountId = normalizeAccountId(request.accountId, code);
      let raw;
      try {
        raw = controlStore.readWalletFirstCurrentResourceProjection({ accountId });
      } catch {
        throw serviceError(code);
      }
      return normalizeResource(raw);
    }
  });
  SERVICE_INSTANCES.add(service);
  return service;
}
