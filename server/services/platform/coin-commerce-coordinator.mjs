import {
  normalizeCoinCommerceOffer,
  normalizeFulfillmentResult
} from "./coin-commerce-domain.mjs";
import {
  isCoinCommerceFulfillmentReconciliationError,
  isCoinCommerceFulfillmentRetryableError
} from "./coin-commerce-fulfillment-retry.mjs";

const OPTION_FIELDS = new Set([
  "store",
  "fulfillmentHandler",
  "scheduleFn",
  "clearScheduleFn",
  "nowFn",
  "captureBatchSize",
  "commandLeaseMs"
]);
const REQUIRED_STORE_METHODS = [
  "recoverNonTerminalOrders",
  "claimDueCaptures",
  "captureClaimedOrder",
  "claimNextFulfillmentCommand",
  "completeFulfillmentCommand",
  "failFulfillmentCommand",
  "nextWakeAt"
];
const MAX_IDLE_SLEEP_MS = 1_000;
const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const COMMAND_FIELDS = [
  "commandRef",
  "orderRef",
  "accountId",
  "offerVersionRef",
  "delivery",
  "leaseGeneration",
  "leaseToken"
];
const AUTHORITY_COMMAND_FIELDS = [...COMMAND_FIELDS, "authority"];
const AUTHORITY_FIELDS = [
  "authorityRef",
  "authorityVersion",
  "resourceRequestId",
  "entitlementId",
  "issuedLinkId"
];
const AUTHORITY_REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;
const OWN_COORDINATOR_ERRORS = new WeakSet();

function coordinatorError(code) {
  const error = new Error("Coin commerce coordinator operation rejected");
  error.code = code;
  OWN_COORDINATOR_ERRORS.add(error);
  return error;
}

function invalidCoordinator() {
  throw coordinatorError("coin_commerce_coordinator_invalid");
}

function snapshotPlainOptions(input) {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      invalidCoordinator();
    }
    const values = {};
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string" || !OPTION_FIELDS.has(key)) {
        invalidCoordinator();
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        invalidCoordinator();
      }
      values[key] = descriptor.value;
    }
    return values;
  } catch (error) {
    if (OWN_COORDINATOR_ERRORS.has(error)) throw error;
    invalidCoordinator();
  }
}

function snapshotStoreMethods(store) {
  try {
    if (
      !store
      || (typeof store !== "object" && typeof store !== "function")
      || Array.isArray(store)
    ) {
      invalidCoordinator();
    }
    const methods = {};
    for (const method of REQUIRED_STORE_METHODS) {
      const descriptor = Object.getOwnPropertyDescriptor(store, method);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
        invalidCoordinator();
      }
      methods[method] = (...args) => descriptor.value.call(store, ...args);
    }
    return methods;
  } catch (error) {
    if (OWN_COORDINATOR_ERRORS.has(error)) throw error;
    invalidCoordinator();
  }
}

function snapshotHandler(handler) {
  try {
    if (
      !handler
      || typeof handler !== "object"
      || Array.isArray(handler)
      || Object.getPrototypeOf(handler) !== Object.prototype
    ) {
      invalidCoordinator();
    }
    const keys = Reflect.ownKeys(handler);
    if (
      keys.length !== 2
      || !keys.includes("idempotencyContract")
      || !keys.includes("execute")
    ) {
      invalidCoordinator();
    }
    const idempotency = Object.getOwnPropertyDescriptor(
      handler,
      "idempotencyContract"
    );
    const execute = Object.getOwnPropertyDescriptor(handler, "execute");
    if (
      !idempotency
      || !idempotency.enumerable
      || !("value" in idempotency)
      || idempotency.value !== "deduplicate_by_command_ref"
      || !execute
      || !execute.enumerable
      || !("value" in execute)
      || typeof execute.value !== "function"
    ) {
      invalidCoordinator();
    }
    return (...args) => execute.value.call(handler, ...args);
  } catch (error) {
    if (OWN_COORDINATOR_ERRORS.has(error)) throw error;
    invalidCoordinator();
  }
}

function validateSafeInterval(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalidCoordinator();
  }
  return value;
}

function exactPlainDataValues(input, fields) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length
    || !fields.every((field) => keys.includes(field))
  ) {
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
  const values = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (
      !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    values[field] = descriptor.value;
  }
  return values;
}

function normalizeReference(value) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || !COMMERCE_REFERENCE.test(value)
  ) {
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
  return value;
}

function normalizeAuthorityReference(value) {
  if (typeof value !== "string" || !AUTHORITY_REFERENCE.test(value)) {
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
  return value;
}

function normalizeAuthority(input) {
  const values = exactPlainDataValues(input, AUTHORITY_FIELDS);
  if (
    !Number.isSafeInteger(values.authorityVersion)
    || values.authorityVersion < 1
  ) {
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
  return Object.freeze({
    authorityRef: normalizeAuthorityReference(values.authorityRef),
    authorityVersion: values.authorityVersion,
    resourceRequestId: normalizeAuthorityReference(values.resourceRequestId),
    entitlementId: normalizeAuthorityReference(values.entitlementId),
    issuedLinkId: normalizeAuthorityReference(values.issuedLinkId)
  });
}

function normalizeClaimList(input, limit) {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      !lengthDescriptor
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > limit
      || Reflect.ownKeys(input).length !== lengthDescriptor.value + 1
    ) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    const claims = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw coordinatorError("coin_commerce_coordinator_unavailable");
      }
      const values = exactPlainDataValues(descriptor.value, ["orderRef"]);
      claims.push(Object.freeze({
        orderRef: normalizeReference(values.orderRef)
      }));
    }
    return claims;
  } catch (error) {
    if (OWN_COORDINATOR_ERRORS.has(error)) throw error;
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
}

function normalizeCommand(input) {
  try {
    const hasAuthority = Reflect.ownKeys(input ?? {}).includes("authority");
    const values = exactPlainDataValues(
      input,
      hasAuthority ? AUTHORITY_COMMAND_FIELDS : COMMAND_FIELDS
    );
    if (
      !Number.isSafeInteger(values.leaseGeneration)
      || values.leaseGeneration < 1
      || !/^[0-9a-f]{64}$/.test(values.leaseToken)
    ) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    const deliveryKind = Object.getOwnPropertyDescriptor(
      values.delivery,
      "kind"
    );
    if (!deliveryKind || !("value" in deliveryKind)) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    const category = deliveryKind.value === "subscription_plan"
      ? "plan"
      : deliveryKind.value === "data_pack"
        ? "data_pack"
        : null;
    if (!category) {
      throw coordinatorError("coin_commerce_coordinator_unavailable");
    }
    const normalizedOffer = normalizeCoinCommerceOffer({
      offerRef: "offer_coordinator_validation",
      offerVersionRef: "offerv_coordinator_validation",
      version: 1,
      category,
      title: { zh: "验证", en: "Validation" },
      summary: { zh: "验证", en: "Validation" },
      importantNotices: { zh: ["验证"], en: ["Validation"] },
      baseCoinUnits: 1,
      referencePrice: { currency: "CNY", amountMinor: 1 },
      acceptedCoinTypes: ["paid_coins"],
      delivery: values.delivery
    });
    return Object.freeze({
      commandRef: normalizeReference(values.commandRef),
      orderRef: normalizeReference(values.orderRef),
      accountId: normalizeReference(values.accountId),
      offerVersionRef: normalizeReference(values.offerVersionRef),
      delivery: normalizedOffer.delivery,
      ...(hasAuthority ? { authority: normalizeAuthority(values.authority) } : {}),
      leaseGeneration: values.leaseGeneration,
      leaseToken: values.leaseToken
    });
  } catch (error) {
    if (OWN_COORDINATOR_ERRORS.has(error)) throw error;
    throw coordinatorError("coin_commerce_coordinator_unavailable");
  }
}

export function createCoinCommerceCoordinator(options = {}) {
  const values = snapshotPlainOptions(options);
  if (!Object.hasOwn(values, "store") || !Object.hasOwn(values, "fulfillmentHandler")) {
    invalidCoordinator();
  }
  const storeMethods = snapshotStoreMethods(values.store);
  const executeFulfillment = snapshotHandler(values.fulfillmentHandler);
  const scheduleFn = values.scheduleFn === undefined ? setTimeout : values.scheduleFn;
  const clearScheduleFn = values.clearScheduleFn === undefined
    ? clearTimeout
    : values.clearScheduleFn;
  const nowFn = values.nowFn === undefined ? (() => new Date()) : values.nowFn;
  if (
    typeof scheduleFn !== "function"
    || typeof clearScheduleFn !== "function"
    || typeof nowFn !== "function"
  ) {
    invalidCoordinator();
  }
  const captureBatchSize = validateSafeInterval(
    Object.hasOwn(values, "captureBatchSize")
      ? values.captureBatchSize
      : 25,
    1,
    100
  );
  const commandLeaseMs = validateSafeInterval(
    Object.hasOwn(values, "commandLeaseMs")
      ? values.commandLeaseMs
      : 30_000,
    1,
    86_400_000
  );

  let lifecycle = "idle";
  let inFlight = null;
  let startPromise = null;
  let stopPromise = null;
  let timerEpoch = 0;
  let scheduled = null;
  let armCurrentPass = false;
  let currentPassInitialStartup = false;
  let hasSuccessfulStart = false;

  function unavailableError() {
    return coordinatorError("coin_commerce_coordinator_unavailable");
  }

  function stoppedRejection() {
    return Promise.reject(
      coordinatorError("coin_commerce_coordinator_stopped")
    );
  }

  function freshSummary() {
    return {
      recoveryPasses: 0,
      capturesClaimed: 0,
      capturesProcessed: 0,
      capturesDeferred: 0,
      commandsClaimed: 0,
      commandsDelivered: 0,
      commandsFailed: 0,
      commandsDeferred: 0
    };
  }

  function clearPendingTimer() {
    timerEpoch += 1;
    if (!scheduled) return;
    const pending = scheduled;
    scheduled = null;
    try {
      clearScheduleFn(pending.handle);
    } catch {
      throw unavailableError();
    }
  }

  function armTimer(delay) {
    clearPendingTimer();
    const epoch = timerEpoch + 1;
    timerEpoch = epoch;
    let handle;
    try {
      handle = scheduleFn(() => {
        if (
          lifecycle !== "running"
          || timerEpoch !== epoch
          || scheduled?.epoch !== epoch
        ) {
          return;
        }
        scheduled = null;
        const pass = beginPass({ armAfter: true });
        pass.catch(() => {});
      }, delay);
    } catch {
      throw unavailableError();
    }
    scheduled = { epoch, handle };
  }

  function strictWakeDelay() {
    let wakeAt;
    let now;
    try {
      wakeAt = storeMethods.nextWakeAt();
      now = nowFn();
    } catch {
      throw unavailableError();
    }
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw unavailableError();
    }
    if (wakeAt === null) return MAX_IDLE_SLEEP_MS;
    if (
      typeof wakeAt !== "string"
      || Number.isNaN(Date.parse(wakeAt))
      || new Date(wakeAt).toISOString() !== wakeAt
    ) {
      throw unavailableError();
    }
    return Math.min(
      Math.max(0, Math.ceil(Date.parse(wakeAt) - now.getTime())),
      MAX_IDLE_SLEEP_MS
    );
  }

  async function performPass() {
    const summary = freshSummary();
    const commandRefsSeen = new Set();
    let commandClaimAttempts = 0;
    const maxCommandClaimAttempts = captureBatchSize * 2;
    try {
      storeMethods.recoverNonTerminalOrders({ limit: captureBatchSize });
      summary.recoveryPasses = 1;
      const captures = normalizeClaimList(
        storeMethods.claimDueCaptures({ limit: captureBatchSize }),
        captureBatchSize
      );
      for (const capture of captures) {
        summary.capturesClaimed += 1;
        try {
          storeMethods.captureClaimedOrder({ orderRef: capture.orderRef });
          summary.capturesProcessed += 1;
        } catch {
          summary.capturesDeferred += 1;
        }
      }
      while (
        summary.commandsClaimed < captureBatchSize
        && commandClaimAttempts < maxCommandClaimAttempts
        && lifecycle !== "stopping"
        && lifecycle !== "stopped"
      ) {
        const command = storeMethods.claimNextFulfillmentCommand({
          leaseMs: commandLeaseMs
        });
        if (command === null) break;
        commandClaimAttempts += 1;
        const normalizedCommand = normalizeCommand(command);
        if (commandRefsSeen.has(normalizedCommand.commandRef)) {
          continue;
        }
        commandRefsSeen.add(normalizedCommand.commandRef);
        summary.commandsClaimed += 1;
        const handlerInput = Object.freeze({
          commandRef: normalizedCommand.commandRef,
          orderRef: normalizedCommand.orderRef,
          accountId: normalizedCommand.accountId,
          offerVersionRef: normalizedCommand.offerVersionRef,
          delivery: normalizedCommand.delivery,
          ...(normalizedCommand.authority
            ? { authority: normalizedCommand.authority }
            : {})
        });
        let rawResult;
        try {
          rawResult = await executeFulfillment(handlerInput);
        } catch (error) {
          if (isCoinCommerceFulfillmentRetryableError(error)) {
            summary.commandsDeferred += 1;
            continue;
          }
          try {
            storeMethods.failFulfillmentCommand({
              commandRef: normalizedCommand.commandRef,
              leaseGeneration: normalizedCommand.leaseGeneration,
              leaseToken: normalizedCommand.leaseToken,
              safeCode: isCoinCommerceFulfillmentReconciliationError(error)
                ? "fulfillment_handler_unavailable"
                : "fulfillment_handler_failed"
            });
            summary.commandsFailed += 1;
          } catch {
            summary.commandsDeferred += 1;
          }
          continue;
        }
        let result;
        try {
          const resultValues = exactPlainDataValues(
            rawResult,
            ["status", "effectRef"]
          );
          result = normalizeFulfillmentResult({
            status: resultValues.status,
            effectRef: resultValues.effectRef
          });
        } catch {
          try {
            storeMethods.failFulfillmentCommand({
              commandRef: normalizedCommand.commandRef,
              leaseGeneration: normalizedCommand.leaseGeneration,
              leaseToken: normalizedCommand.leaseToken,
              safeCode: "fulfillment_result_invalid"
            });
            summary.commandsFailed += 1;
          } catch {
            summary.commandsDeferred += 1;
          }
          continue;
        }
        try {
          storeMethods.completeFulfillmentCommand({
            commandRef: normalizedCommand.commandRef,
            leaseGeneration: normalizedCommand.leaseGeneration,
            leaseToken: normalizedCommand.leaseToken,
            effectRef: result.effectRef,
            status: result.status
          });
          summary.commandsDelivered += 1;
        } catch {
          summary.commandsDeferred += 1;
        }
      }
      return Object.freeze(summary);
    } catch {
      throw unavailableError();
    }
  }

  function beginPass({ armAfter, initialStart = false }) {
    if (inFlight) {
      if (armAfter) armCurrentPass = true;
      if (initialStart) currentPassInitialStartup = true;
      return inFlight;
    }
    armCurrentPass = armAfter;
    currentPassInitialStartup = initialStart;
    let resolvePass;
    let rejectPass;
    const shared = new Promise((resolve, reject) => {
      resolvePass = resolve;
      rejectPass = reject;
    });
    inFlight = shared;
    let pass;
    try {
      pass = performPass();
    } catch (error) {
      pass = Promise.reject(error);
    }
    const rejectUnavailable = () => {
      if (armCurrentPass && lifecycle === "running") {
        if (currentPassInitialStartup && !hasSuccessfulStart) {
          lifecycle = "stopped";
        } else {
          try {
            armTimer(MAX_IDLE_SLEEP_MS);
          } catch {
            // A broken injected scheduler cannot be retried in a tight loop.
          }
        }
      }
      rejectPass(unavailableError());
    };
    Promise.resolve(pass).then(
      (summary) => {
        try {
          if (armCurrentPass && lifecycle === "running") {
            armTimer(strictWakeDelay());
            hasSuccessfulStart = true;
          }
          resolvePass(summary);
        } catch {
          rejectUnavailable();
        }
      },
      rejectUnavailable
    );
    shared.then(
      () => {
        if (inFlight === shared) {
          inFlight = null;
          armCurrentPass = false;
          currentPassInitialStartup = false;
        }
      },
      () => {
        if (inFlight === shared) {
          inFlight = null;
          armCurrentPass = false;
          currentPassInitialStartup = false;
        }
      }
    );
    return shared;
  }

  function start() {
    if (lifecycle === "stopping" || lifecycle === "stopped") {
      return stoppedRejection();
    }
    if (lifecycle === "running") {
      return inFlight ?? startPromise;
    }
    lifecycle = "running";
    startPromise = beginPass({ armAfter: true, initialStart: true });
    return startPromise;
  }

  function runOnce() {
    if (lifecycle === "stopping" || lifecycle === "stopped") {
      return stoppedRejection();
    }
    if (lifecycle === "running") {
      try {
        clearPendingTimer();
      } catch (error) {
        try {
          armTimer(MAX_IDLE_SLEEP_MS);
        } catch {
          // The generic clear failure remains the public result.
        }
        return Promise.reject(error);
      }
      return beginPass({ armAfter: true });
    }
    return beginPass({ armAfter: false });
  }

  function stop() {
    if (stopPromise) return stopPromise;
    if (lifecycle === "stopped") {
      stopPromise = Promise.resolve();
      return stopPromise;
    }
    lifecycle = "stopping";
    try {
      clearPendingTimer();
    } catch {
      // Stopping remains terminal even when an injected clear operation fails.
    }
    const current = inFlight;
    stopPromise = Promise.resolve(current)
      .catch(() => {})
      .then(() => {
        lifecycle = "stopped";
      });
    return stopPromise;
  }

  return Object.freeze({
    start,
    runOnce,
    stop
  });
}
