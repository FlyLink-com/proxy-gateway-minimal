const OPTION_FIELDS = new Set([
  "controlStore",
  "walletStore",
  "nowFn",
  "scheduleFn",
  "clearScheduleFn",
  "leaseMs",
  "retryDelayMs",
  "batchSize"
]);

const REQUIRED_CONTROL_STORE_METHODS = Object.freeze([
  "claimNextPortalRegistrationWelcomeCoinGrant",
  "completePortalRegistrationWelcomeCoinGrant",
  "deferPortalRegistrationWelcomeCoinGrant",
  "markPortalRegistrationWelcomeCoinGrantReconciliationRequired",
  "expireDuePortalRegistrationWelcomeCoinGrants",
  "nextPortalRegistrationWelcomeCoinGrantWakeAt"
]);

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_IDLE_SLEEP_MS = 60_000;

function coordinatorError(code) {
  const error = new Error("Portal registration welcome-bonus coordinator rejected operation");
  error.code = code;
  return error;
}

function assertPlainObject(value, code) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw coordinatorError(code);
  }
  return value;
}

function exactValues(value, fields, code) {
  const input = assertPlainObject(value, code);
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length
    || !fields.every((field) => keys.includes(field))
    || keys.some((key) => typeof key !== "string")
  ) {
    throw coordinatorError(code);
  }
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError(code);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function normalizeReference(value, code) {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeDigest(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeTimestamp(value, code) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizePositiveInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw coordinatorError(code);
  }
  return value;
}

function snapshotOptions(options) {
  const values = assertPlainObject(options, "welcome_bonus_coordinator_invalid");
  const result = {};
  for (const key of Reflect.ownKeys(values)) {
    if (typeof key !== "string" || !OPTION_FIELDS.has(key)) {
      throw coordinatorError("welcome_bonus_coordinator_invalid");
    }
    const descriptor = Object.getOwnPropertyDescriptor(values, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError("welcome_bonus_coordinator_invalid");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotMethods(store, names) {
  if (!store || (typeof store !== "object" && typeof store !== "function")) {
    throw coordinatorError("welcome_bonus_coordinator_invalid");
  }
  const methods = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(store, name);
    if (!descriptor || typeof descriptor.value !== "function") {
      throw coordinatorError("welcome_bonus_coordinator_invalid");
    }
    methods[name] = (...args) => descriptor.value.call(store, ...args);
  }
  return methods;
}

function normalizeClaim(input) {
  const value = exactValues(input, [
    "grantRef",
    "accountId",
    "commercialModel",
    "coinType",
    "amountUnits",
    "sourceType",
    "sourceRef",
    "sourceDigest",
    "actorScope",
    "idempotencyKey",
    "expiresAt",
    "leaseGeneration",
    "leaseToken"
  ], "welcome_bonus_claim_invalid");
  if (
    value.commercialModel !== "wallet_first_unique_v1"
    || value.coinType !== "bonus_coins"
    || value.amountUnits !== 10
  ) {
    throw coordinatorError("welcome_bonus_claim_invalid");
  }
  return Object.freeze({
    grantRef: normalizeReference(value.grantRef, "welcome_bonus_claim_invalid"),
    accountId: normalizeReference(value.accountId, "welcome_bonus_claim_invalid"),
    commercialModel: value.commercialModel,
    coinType: value.coinType,
    amountUnits: value.amountUnits,
    sourceType: normalizeReference(value.sourceType, "welcome_bonus_claim_invalid"),
    sourceRef: normalizeReference(value.sourceRef, "welcome_bonus_claim_invalid"),
    sourceDigest: normalizeDigest(value.sourceDigest, "welcome_bonus_claim_invalid"),
    actorScope: normalizeReference(value.actorScope, "welcome_bonus_claim_invalid"),
    idempotencyKey: normalizeReference(value.idempotencyKey, "welcome_bonus_claim_invalid"),
    expiresAt: normalizeTimestamp(value.expiresAt, "welcome_bonus_claim_invalid"),
    leaseGeneration: normalizePositiveInteger(
      value.leaseGeneration,
      1,
      Number.MAX_SAFE_INTEGER,
      "welcome_bonus_claim_invalid"
    ),
    leaseToken: normalizeDigest(value.leaseToken, "welcome_bonus_claim_invalid")
  });
}

function normalizeWalletCreditResult(value) {
  const result = assertPlainObject(value, "welcome_bonus_wallet_result_invalid");
  if (
    result.ok !== true
    || result.safeResultCode !== "credited"
    || typeof result.replayed !== "boolean"
  ) {
    throw coordinatorError("welcome_bonus_wallet_result_invalid");
  }
  return Object.freeze({
    resultRef: normalizeReference(result.resultRef, "welcome_bonus_wallet_result_invalid")
  });
}

function addMilliseconds(isoTimestamp, milliseconds) {
  return new Date(Date.parse(isoTimestamp) + milliseconds).toISOString();
}

function safeErrorCode(error) {
  return typeof error?.code === "string" ? error.code : null;
}

function isTerminalWalletConflict(error) {
  return ["credit_origin_conflict", "idempotency_conflict"].includes(safeErrorCode(error));
}

export function createPortalRegistrationWelcomeBonusCoordinator(options = {}) {
  const values = snapshotOptions(options);
  if (!Object.hasOwn(values, "controlStore") || !Object.hasOwn(values, "walletStore")) {
    throw coordinatorError("welcome_bonus_coordinator_invalid");
  }
  const controlStore = snapshotMethods(
    values.controlStore,
    REQUIRED_CONTROL_STORE_METHODS
  );
  const walletStore = snapshotMethods(values.walletStore, [
    "creditCoins",
    "expireDuePortalRegistrationWelcomeBonusCoinLots"
  ]);
  const nowFn = values.nowFn === undefined ? (() => new Date()) : values.nowFn;
  const scheduleFn = values.scheduleFn === undefined ? setTimeout : values.scheduleFn;
  const clearScheduleFn = values.clearScheduleFn === undefined ? clearTimeout : values.clearScheduleFn;
  if (
    typeof nowFn !== "function"
    || typeof scheduleFn !== "function"
    || typeof clearScheduleFn !== "function"
  ) {
    throw coordinatorError("welcome_bonus_coordinator_invalid");
  }
  const leaseMs = normalizePositiveInteger(
    values.leaseMs === undefined ? 30_000 : values.leaseMs,
    1,
    86_400_000,
    "welcome_bonus_coordinator_invalid"
  );
  const retryDelayMs = normalizePositiveInteger(
    values.retryDelayMs === undefined ? 5_000 : values.retryDelayMs,
    1,
    86_400_000,
    "welcome_bonus_coordinator_invalid"
  );
  const batchSize = normalizePositiveInteger(
    values.batchSize === undefined ? 25 : values.batchSize,
    1,
    100,
    "welcome_bonus_coordinator_invalid"
  );

  let lifecycle = "idle";
  let timer = null;
  let activePass = null;

  function nowIso() {
    try {
      const raw = nowFn();
      return normalizeTimestamp(
        raw instanceof Date ? raw.toISOString() : raw,
        "welcome_bonus_clock_invalid"
      );
    } catch (error) {
      if (error?.code === "welcome_bonus_clock_invalid") throw error;
      throw coordinatorError("welcome_bonus_clock_invalid");
    }
  }

  function summary() {
    return {
      expired: 0,
      expiredLots: 0,
      claimed: 0,
      credited: 0,
      deferred: 0,
      reconciliationRequired: 0
    };
  }

  function clearTimer() {
    if (timer === null) return;
    const current = timer;
    timer = null;
    try {
      clearScheduleFn(current);
    } catch {
      throw coordinatorError("welcome_bonus_coordinator_unavailable");
    }
  }

  function armTimer() {
    clearTimer();
    let wakeAt;
    let now;
    try {
      wakeAt = controlStore.nextPortalRegistrationWelcomeCoinGrantWakeAt();
      now = nowIso();
    } catch {
      throw coordinatorError("welcome_bonus_coordinator_unavailable");
    }
    let delay = MAX_IDLE_SLEEP_MS;
    if (wakeAt !== null) {
      const normalizedWakeAt = normalizeTimestamp(
        wakeAt,
        "welcome_bonus_coordinator_unavailable"
      );
      delay = Math.min(
        Math.max(0, Date.parse(normalizedWakeAt) - Date.parse(now)),
        MAX_IDLE_SLEEP_MS
      );
    }
    try {
      timer = scheduleFn(() => {
        timer = null;
        if (lifecycle !== "running") return;
        const pass = runOnce();
        Promise.resolve(pass).catch(() => {});
      }, delay);
    } catch {
      throw coordinatorError("welcome_bonus_coordinator_unavailable");
    }
  }

  function deferClaim(claim, occurredAt, safeCode) {
    controlStore.deferPortalRegistrationWelcomeCoinGrant({
      grantRef: claim.grantRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      safeCode,
      nextAttemptAt: addMilliseconds(occurredAt, retryDelayMs),
      updatedAt: occurredAt
    });
  }

  function reconcileClaim(claim, occurredAt, safeCode) {
    controlStore.markPortalRegistrationWelcomeCoinGrantReconciliationRequired({
      grantRef: claim.grantRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      safeCode,
      updatedAt: occurredAt
    });
  }

  function processClaim(claim, occurredAt, totals) {
    if (Date.parse(claim.expiresAt) <= Date.parse(occurredAt)) {
      try {
        deferClaim(claim, occurredAt, "welcome_bonus_expired_before_credit");
        controlStore.expireDuePortalRegistrationWelcomeCoinGrants({ now: occurredAt });
      } catch {
        throw coordinatorError("welcome_bonus_coordinator_unavailable");
      }
      totals.expired += 1;
      return;
    }
    let credit;
    try {
      credit = normalizeWalletCreditResult(walletStore.creditCoins({
        accountId: claim.accountId,
        coinType: "bonus_coins",
        amountUnits: 10,
        availability: "available",
        sourceType: claim.sourceType,
        sourceRef: claim.sourceRef,
        sourceDigest: claim.sourceDigest,
        policyRef: null,
        policyVersion: null,
        expiresAt: claim.expiresAt,
        operation: {
          actorScope: claim.actorScope,
          actorType: "system",
          actorRef: "portal_registration",
          idempotencyKey: claim.idempotencyKey
        }
      }));
    } catch (error) {
      try {
        if (isTerminalWalletConflict(error)) {
          reconcileClaim(claim, occurredAt, "welcome_bonus_wallet_conflict");
          totals.reconciliationRequired += 1;
        } else {
          deferClaim(claim, occurredAt, "welcome_bonus_wallet_unavailable");
          totals.deferred += 1;
        }
      } catch {
        throw coordinatorError("welcome_bonus_coordinator_unavailable");
      }
      return;
    }
    try {
      controlStore.completePortalRegistrationWelcomeCoinGrant({
        grantRef: claim.grantRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        lotRef: credit.resultRef,
        completedAt: occurredAt
      });
      totals.credited += 1;
    } catch {
      try {
        reconcileClaim(claim, occurredAt, "welcome_bonus_completion_unavailable");
        totals.reconciliationRequired += 1;
      } catch {
        throw coordinatorError("welcome_bonus_coordinator_unavailable");
      }
    }
  }

  function performPass() {
    const totals = summary();
    const occurredAt = nowIso();
    try {
      const expired = controlStore.expireDuePortalRegistrationWelcomeCoinGrants({
        now: occurredAt
      });
      if (!Number.isSafeInteger(expired) || expired < 0) {
        throw coordinatorError("welcome_bonus_coordinator_unavailable");
      }
      totals.expired += expired;
      const expiredLots = walletStore
        .expireDuePortalRegistrationWelcomeBonusCoinLots({ limit: batchSize });
      if (!Number.isSafeInteger(expiredLots) || expiredLots < 0) {
        throw coordinatorError("welcome_bonus_coordinator_unavailable");
      }
      totals.expiredLots += expiredLots;
      for (let index = 0; index < batchSize; index += 1) {
        const rawClaim = controlStore.claimNextPortalRegistrationWelcomeCoinGrant({
          now: occurredAt,
          leaseMs
        });
        if (rawClaim === null) break;
        const claim = normalizeClaim(rawClaim);
        totals.claimed += 1;
        processClaim(claim, occurredAt, totals);
      }
      return Object.freeze(totals);
    } catch (error) {
      if (error?.code === "welcome_bonus_coordinator_unavailable") throw error;
      throw coordinatorError("welcome_bonus_coordinator_unavailable");
    }
  }

  function runOnce() {
    if (lifecycle === "stopped") {
      return Promise.reject(coordinatorError("welcome_bonus_coordinator_stopped"));
    }
    if (activePass) return activePass;
    let resolvePass;
    let rejectPass;
    activePass = new Promise((resolve, reject) => {
      resolvePass = resolve;
      rejectPass = reject;
    });
    try {
      const result = performPass();
      if (lifecycle === "running") armTimer();
      resolvePass(result);
    } catch (error) {
      rejectPass(error?.code === "welcome_bonus_coordinator_unavailable"
        ? error
        : coordinatorError("welcome_bonus_coordinator_unavailable"));
    }
    const current = activePass;
    current.finally(() => {
      if (activePass === current) activePass = null;
    }).catch(() => {});
    return current;
  }

  async function start() {
    if (lifecycle === "stopped") {
      throw coordinatorError("welcome_bonus_coordinator_stopped");
    }
    lifecycle = "running";
    return runOnce();
  }

  async function stop() {
    lifecycle = "stopped";
    clearTimer();
  }

  return Object.freeze({
    runOnce,
    start,
    stop
  });
}
