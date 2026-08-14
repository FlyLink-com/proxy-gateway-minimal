import { createApp } from "./app.mjs";
import { createRuntimeState } from "./state.mjs";

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
  } catch (error) {
    if (error?.code === expectedErrorCode) {
      throw error;
    }
    throw errorFactory();
  }

  return Object.freeze({
    start: () => startDescriptor.value.call(coordinator),
    stop: () => stopDescriptor.value.call(coordinator)
  });
}

function snapshotCommerceCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.coinsCommerceEnabled,
    field: "coinCommerceCoordinator",
    errorFactory: coordinatorContractError
  });
}

function snapshotWelcomeBonusCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.walletFirstRegistrationEnabled,
    field: "portalRegistrationWelcomeBonusCoordinator",
    errorFactory: welcomeBonusCoordinatorContractError
  });
}

function snapshotDeferredTransitionCoordinator(state) {
  const platform = state?.platform;
  return snapshotCoordinator(platform, {
    enabled: platform?.walletFirstRegistrationEnabled,
    field: "deferredTransitionCoordinator",
    errorFactory: deferredTransitionCoordinatorContractError
  });
}

function snapshotRuntimeCoordinators(state) {
  return [
    snapshotCommerceCoordinator(state),
    snapshotWelcomeBonusCoordinator(state),
    snapshotDeferredTransitionCoordinator(state)
  ].filter(Boolean);
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
