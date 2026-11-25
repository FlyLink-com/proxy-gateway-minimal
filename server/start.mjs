import { createApp } from "./app.mjs";
import { createRuntimeState } from "./state.mjs";
import { createFreezeDrainCoordinator } from "./services/platform/d1-card9-freeze-drain-coordinator.mjs";
import { collectUsedFreezeSnapshotIds, deriveFreezeSnapshotId, resolveFreezeSnapshotId } from "./services/platform/d1-freeze-executor.mjs";

function logStartup(logger, state) {
  if (!logger) return;

  logger.log("Proxy Gateway Console");
  logger.log(`  Console:   http://${state.host}:${state.ports.console}/`);
  logger.log(`  SOCKS5:    ${state.host}:${state.ports.socks} (when ss-local running)`);
  logger.log(`  HTTP Proxy: ${state.host}:${state.ports.httpProxy}`);
  logger.log(`  Console Token Source: ${state.consoleTokenSource || "runtime"}`);
  if (state.consoleTokenStorePath) {
    logger.log(`  Console Token Store: ${state.consoleTokenStorePath}`);
  }
}

function coordinatorContractError() {
  const error = new Error("Coin commerce coordinator prerequisite is missing");
  error.code = "coin_commerce_prerequisite_missing";
  return error;
}

function welcomeBonusCoordinatorContractError() {
  const error = new Error(
    "Portal registration welcome-bonus coordinator prerequisite is missing"
  );
  error.code = "welcome_bonus_coordinator_prerequisite_missing";
  return error;
}

function deferredTransitionCoordinatorContractError() {
  const error = new Error(
    "Wallet-first deferred transition coordinator prerequisite is missing"
  );
  error.code = "wallet_first_deferred_transition_runtime_missing";
  return error;
}

function snapshotCoordinator(platform, {
  enabled,
  field,
  errorFactory
}) {
  if (enabled !== true) {
    return null;
  }

  const expectedErrorCode = errorFactory().code;
  let coordinator;
  let startDescriptor;
  let stopDescriptor;
  let getStatusDescriptor;
  try {
    coordinator = platform[field];
    if (
      !coordinator
      || (typeof coordinator !== "object" && typeof coordinator !== "function")
      || Array.isArray(coordinator)
    ) {
      throw errorFactory();
    }
    startDescriptor = Object.getOwnPropertyDescriptor(coordinator, "start");
    stopDescriptor = Object.getOwnPropertyDescriptor(coordinator, "stop");
    if (
      !startDescriptor
      || !("value" in startDescriptor)
      || typeof startDescriptor.value !== "function"
      || !stopDescriptor
      || !("value" in stopDescriptor)
      || typeof stopDescriptor.value !== "function"
    ) {
      throw errorFactory();
    }
    // W-114: forward the read-only quiescence read when the coordinator
    // has one (coin-commerce, welcome-bonus, rotation). It is optional:
    // a coordinator without getStatus (e.g. deferred-transition) still
    // snapshots with start/stop only. A present-but-not-a-function
    // getStatus is a contract violation, like a bad start/stop.
    getStatusDescriptor = Object.getOwnPropertyDescriptor(coordinator, "getStatus");
    if (
      getStatusDescriptor
      && (!("value" in getStatusDescriptor) || typeof getStatusDescriptor.value !== "function")
    ) {
      throw errorFactory();
    }
  } catch (error) {
    if (error?.code === expectedErrorCode) {
      throw error;
    }
    throw errorFactory();
  }

  const snapshot = {
    start: () => startDescriptor.value.call(coordinator),
    stop: () => stopDescriptor.value.call(coordinator)
  };
  if (getStatusDescriptor) {
    snapshot.getStatus = () => getStatusDescriptor.value.call(coordinator);
  }
  return Object.freeze(snapshot);
}

function snapshotCommerceCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.coinsCommerceEnabled,
    field: "coinCommerceCoordinator",
    errorFactory: coordinatorContractError
  });
}

function snapshotDataPackRotationCoordinator(state) {
  const platform = state?.platform;
  let enabled = false;
  if (platform?.coinsCommerceEnabled === true) {
    const descriptor = Object.getOwnPropertyDescriptor(
      platform, "coinCommerceDataPackRotationCoordinator"
    );
    if (descriptor && !("value" in descriptor)) {
      throw coordinatorContractError();
    }
    enabled = descriptor?.value != null;
  }
  return snapshotCoordinator(platform, {
    enabled,
    field: "coinCommerceDataPackRotationCoordinator",
    errorFactory: coordinatorContractError
  });
}

function snapshotWelcomeBonusCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.registrationWelcomeCoinsWorkerEnabled,
    field: "portalRegistrationWelcomeBonusCoordinator",
    errorFactory: welcomeBonusCoordinatorContractError
  });
}

function snapshotDeferredTransitionCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.walletFirstDeferredRuntimeEnabled,
    field: "deferredTransitionCoordinator",
    errorFactory: deferredTransitionCoordinatorContractError
  });
}

// Exported for the freeze executor and tests: the bound runtime
// coordinator snapshots (start/stop, plus the read-only getStatus where
// the coordinator has one). startProxyGateway keeps using this
// internally; nothing else in the running process constructs it.
export function snapshotRuntimeCoordinators(state) {
  return [
    snapshotCommerceCoordinator(state),
    snapshotDataPackRotationCoordinator(state),
    snapshotWelcomeBonusCoordinator(state),
    snapshotDeferredTransitionCoordinator(state)
  ].filter(Boolean);
}

// D1 Stage 2 — freeze wiring (P2, D6 harness). Instantiates the
// freeze coordinator at startup from the already-built runtime state
// and holds it (plus the wiring the freeze route needs) on
// state.platform. No new database connection is opened: the
// coordinator uses the control store's own handle
// (platform.controlStore.database). No scheduler or write path is
// changed; the snapshots are the same bound snapshots
// snapshotRuntimeCoordinators() builds.
//
// The held coordinator's snapshot id is derived from the boot date
// (R10 §5 A0 step 1: the deployment restart happens on execution
// day, so the boot date is the execution date), auto-suffixed -r2,
// -r3, ... when a prior freeze already used that id — a same-day
// second freeze needs no manual suffix. The route accepts a different
// snapshot id in the body and then builds a fresh coordinator from
// this same held wiring.
//
// Never throws: if the wiring cannot be built (no database handle, a
// coordinator contract error), the freeze route reports 503 and the
// service still boots. A missing operator feature must never break
// startup.
export function installD1FreezeWiring(state, { logger = console, now = () => new Date() } = {}) {
  const platform = state?.platform;
  if (!platform || typeof platform !== "object") return null;
  const db = platform.controlStore?.database ?? null;
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    logger?.warn?.("D1 freeze wiring not installed: control-store database handle is not available");
    return null;
  }
  const scheduler = {
    coinCommerceCoordinator: snapshotCommerceCoordinator(state),
    rotationCoordinator: snapshotDataPackRotationCoordinator(state),
    welcomeBonusCoordinator: snapshotWelcomeBonusCoordinator(state),
    portalReferrals: platform.portalReferrals ?? null
  };
  const deferredSnapshot = snapshotDeferredTransitionCoordinator(state);
  const schedulerEnabled = {
    coinCommerce: platform.coinsCommerceEnabled === true,
    welcomeBonus: platform.registrationWelcomeCoinsWorkerEnabled === true,
    rotation: platform.coinsCommerceEnabled === true && platform.coinCommerceDataPackRotationCoordinator != null,
    deferred: platform.walletFirstDeferredRuntimeEnabled === true,
    portalReferrals: platform.portalReferralsEnabled === true
  };
  // W-114 not-created record (R10 §5 A1): the rotation coordinator is
  // created only when coins commerce is enabled AND a data-pack
  // material escrow is in place. The escrow itself is a
  // createRuntimeState local, so its presence is derived: when
  // commerce is on and no rotation coordinator was created, the
  // escrow is the missing inner gate; when commerce is off the escrow
  // is irrelevant and recorded as unknown.
  const rotationCreation = {
    coinsCommerceEnabled: platform.coinsCommerceEnabled === true,
    dataPackMaterialEscrowPresent: platform.coinCommerceDataPackRotationCoordinator != null
      ? true
      : (platform.coinsCommerceEnabled === true ? false : null),
    platformFieldPresent: platform.coinCommerceDataPackRotationCoordinator != null
  };
  // Boot-date base id, resolved against the live durable logs: when
  // a prior freeze already used this id (same-day second freeze),
  // the next free -r<n> suffix is minted. On any read failure the
  // boot-date base is kept so startup never breaks — the executor's
  // freeze_snapshot_id_conflict guard still refuses a reused id at
  // freeze time.
  let snapshotId = deriveFreezeSnapshotId(now());
  try {
    snapshotId = resolveFreezeSnapshotId(snapshotId, collectUsedFreezeSnapshotIds(db));
  } catch (error) {
    logger?.warn?.(`D1 freeze snapshot id conflict resolution failed, keeping boot-date id ${snapshotId}: ${error?.message || error}`);
  }
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId, scheduler, now });
  const wiring = {
    db,
    scheduler,
    deferredSnapshot,
    trafficAccounting: platform.trafficAccounting ?? null,
    coinCommerceStore: platform.coinCommerceStore ?? null,
    dbPath: process.env.SUBSCRIPTION_CONTROL_DB_PATH || process.env.CONTROL_DB_PATH || null,
    schedulerEnabled,
    rotationCreation
  };
  platform.d1FreezeCoordinator = coordinator;
  platform.d1FreezeWiring = wiring;
  return wiring;
}

function waitForListening(server) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (typeof server?.removeListener !== "function") return;
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onError = (error) => {
      finish(reject, error);
    };
    const onListening = () => {
      try {
        if (!server.address()) {
          throw new Error("Console port bind failed");
        }
        finish(resolve);
      } catch (error) {
        finish(reject, error);
      }
    };

    try {
      if (!server || typeof server.once !== "function") {
        throw new Error("Console listener is invalid");
      }
      server.once("error", onError);
      server.once("listening", onListening);
    } catch (error) {
      finish(reject, error);
    }
  });
}

function createStartupErrorMonitor(server) {
  if (
    !server
    || typeof server.on !== "function"
    || typeof server.removeListener !== "function"
  ) {
    throw new Error("Console listener error contract is invalid");
  }

  let hasError = false;
  let firstError;
  let resolveError;
  let released = false;
  const errorSignal = new Promise((resolve) => {
    resolveError = resolve;
  });
  const onError = (error) => {
    if (hasError) return;
    hasError = true;
    firstError = error;
    resolveError(error);
  };
  server.on("error", onError);

  function race(action) {
    if (hasError) {
      return Promise.reject(firstError);
    }

    let operation;
    try {
      operation = action();
    } catch (error) {
      return Promise.reject(hasError ? firstError : error);
    }
    const operationPromise = Promise.resolve(operation);
    operationPromise.catch(() => {});
    if (hasError) {
      return Promise.reject(firstError);
    }
    const listenerFailure = errorSignal.then((error) => {
      throw error;
    });
    listenerFailure.catch(() => {});
    return Promise.race([operationPromise, listenerFailure]);
  }

  function throwIfFailed() {
    if (hasError) {
      throw firstError;
    }
  }

  function release() {
    if (released) return;
    server.removeListener("error", onError);
    released = true;
  }

  return Object.freeze({
    race,
    throwIfFailed,
    release
  });
}

function createServerCloseTracker(server) {
  let closed = false;
  let wasListening = false;
  let released = false;
  let resolveClose;
  const completion = new Promise((resolve) => {
    resolveClose = resolve;
  });
  const onListening = () => {
    wasListening = true;
  };
  const onClose = () => {
    closed = true;
    release();
    resolveClose();
  };

  server.on("listening", onListening);
  server.once("close", onClose);
  try {
    if (server.listening === true) {
      wasListening = true;
    }
  } catch {
    // The normal startup/cleanup path owns the safe error mapping.
  }

  function waitForCloseOrError() {
    if (closed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        server.removeListener("error", onError);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onError = (error) => {
        finish(reject, error);
      };
      try {
        server.once("error", onError);
      } catch (error) {
        finish(reject, error);
        return;
      }
      completion.then(() => {
        finish(resolve);
      });
    });
  }

  function release() {
    if (released) return;
    server.removeListener("listening", onListening);
    server.removeListener("close", onClose);
    released = true;
  }

  return Object.freeze({
    isClosed: () => closed,
    wasListening: () => wasListening,
    waitForCloseOrError,
    release
  });
}

function initiateServerClose(server, closeTracker) {
  if (!server) {
    return {
      completion: Promise.resolve(),
      initiationError: null
    };
  }
  try {
    if (!server.listening) {
      const completion = (
        closeTracker?.wasListening()
        && !closeTracker.isClosed()
      )
        ? closeTracker.waitForCloseOrError()
        : Promise.resolve();
      completion.catch(() => {});
      return {
        completion,
        initiationError: null
      };
    }
  } catch (error) {
    return {
      completion: Promise.resolve(),
      initiationError: error
    };
  }

  let initiationError = null;
  let resolveCompletion;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  completion.catch(() => {});
  try {
    if (typeof server.close !== "function") {
      throw new Error("Console listener close contract is invalid");
    }
    server.close((error) => {
      if (error) rejectCompletion(error);
      else resolveCompletion();
    });
  } catch (error) {
    initiationError = error;
    resolveCompletion();
  }
  return { completion, initiationError };
}

async function captureFailure(firstError, action) {
  try {
    await action();
  } catch (error) {
    return firstError ?? error;
  }
  return firstError;
}

function closeRuntimeState(state) {
  if (!state) return undefined;
  const close = state.close;
  if (typeof close !== "function") return undefined;
  return close.call(state);
}

async function cleanupFailedStartup({
  state,
  server,
  closeTracker,
  startedCoordinators,
  httpProxyStartAttempted
}) {
  const listenerClose = initiateServerClose(server, closeTracker);
  for (const coordinator of [...startedCoordinators].reverse()) {
    await captureFailure(null, () => coordinator.stop());
  }
  if (httpProxyStartAttempted) {
    await captureFailure(null, () => state.services.httpProxy.stop());
  }
  await captureFailure(null, () => listenerClose.completion);
  await captureFailure(null, () => closeRuntimeState(state));
}

export async function startProxyGateway(options = {}) {
  const logger = options.logger ?? console;
  let state = null;
  let app = null;
  let server = null;
  let coordinators = [];
  let startupErrorMonitor = null;
  let closeTracker = null;
  const startedCoordinators = [];
  let httpProxyStartAttempted = false;
  try {
    state = options.state ?? createRuntimeState(options.runtimeOptions ?? options);
    coordinators = snapshotRuntimeCoordinators(state);
    try {
      installD1FreezeWiring(state, { logger });
    } catch (error) {
      logger?.warn?.(`D1 freeze wiring not installed: ${error?.code || error?.message || error}`);
    }
    app = options.app ?? createApp(state);
    server = app.listen(state.ports.console, state.host);
    closeTracker = createServerCloseTracker(server);
    startupErrorMonitor = createStartupErrorMonitor(server);
    await startupErrorMonitor.race(() => waitForListening(server));

    if (state.autoStartHttpProxy) {
      startupErrorMonitor.throwIfFailed();
      httpProxyStartAttempted = true;
      await startupErrorMonitor.race(() => state.services.httpProxy.start());
    }
    for (const coordinator of coordinators) {
      startupErrorMonitor.throwIfFailed();
      startedCoordinators.push(coordinator);
      await startupErrorMonitor.race(() => coordinator.start());
    }

    logStartup(logger, state);
    startupErrorMonitor.throwIfFailed();
    startupErrorMonitor.release();
  } catch (startupError) {
    try {
      await cleanupFailedStartup({
        state,
        server,
        closeTracker,
        startedCoordinators,
        httpProxyStartAttempted
      });
    } finally {
      startupErrorMonitor?.release();
      closeTracker?.release();
    }
    throw startupError;
  }

  let stopPromise = null;
  async function runStop() {
    const listenerClose = initiateServerClose(server, closeTracker);
    let firstError = listenerClose.initiationError;
    for (const coordinator of [...coordinators].reverse()) {
      firstError = await captureFailure(firstError, () => coordinator.stop());
    }
    firstError = await captureFailure(firstError, () => state.services.ssLocal.stop());
    firstError = await captureFailure(firstError, () => state.services.httpProxy.stop());
    firstError = await captureFailure(firstError, () => listenerClose.completion);
    firstError = await captureFailure(firstError, () => closeRuntimeState(state));
    closeTracker.release();
    if (firstError) {
      throw firstError;
    }
  }

  function stop() {
    if (!stopPromise) {
      stopPromise = runStop();
    }
    return stopPromise;
  }

  return { app, state, server, stop };
}

export function installProcessHandlers(handle, options = {}) {
  const processObject = options.processObject ?? process;
  const logger = options.logger ?? console;
  const exit = options.exit ?? process.exit;
  let stopping = false;

  processObject.on("uncaughtException", (err) => {
    logger.error("[uncaughtException]", err.message);
  });

  processObject.on("unhandledRejection", (err) => {
    logger.error("[unhandledRejection]", err);
  });

  async function shutdown() {
    if (stopping) return;
    stopping = true;
    await handle.stop();
    exit(0);
  }

  processObject.on("SIGINT", shutdown);
  processObject.on("SIGTERM", shutdown);
}
