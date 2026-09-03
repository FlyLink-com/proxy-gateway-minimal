import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION,
  assessChannelExtendedMeasurement,
  buildAccessModelInventorySummary,
  buildCleanEdgeReadinessSummary,
  buildChannelCandidateReport,
  buildChannelDecisionPack,
  buildChannelLabTargetDecision,
  buildChannelRuntimeExecutionHandoff,
  buildChannelRuntimeEvidenceBridge,
  buildChannelRuntimeGateWorkbench,
  buildChannelRuntimeGatePacket,
  buildChannelRuntimeInventorySummary,
  buildChannelRuntimeRegistry,
  buildChannelSubscriptionActivationFlow,
  buildChannelSubscriptionActivationPackage,
  buildChannelSubscriptionActivationRecordTemplate,
  buildChannelProductionModule,
  buildPlatformResourcePackage,
  CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION,
  createChannelSubscriptionActivationFlowFixture,
  normalizeChannelSubscriptionActivationFlowFixture,
  replayChannelSubscriptionActivationFlowFixture,
  buildChannelSubscriptionActivationHandoff,
  buildChannelSubscriptionActivationReadiness,
  buildChannelSubscriptionOutputDraft,
  buildChannelSubscriptionRenderProof,
  buildChannelSystemDecisionFlow,
  buildChannelExtendedMeasurementReport,
  buildChannelMeasurementBundleReport,
  createApp,
  createRuntimeState,
  createChannelBenchmarkFixtureFromPlan,
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateClashSubscription,
  generateMihomoProviderTemplate,
  generateMihomoRenderTemplate,
  normalizeChannelBenchmarkFixture,
  runChannelBenchmarkPlan,
  scoreChannelBenchmarkSummary,
  summarizeChannelBenchmarkResults,
  startProxyGateway
} from "../../index.mjs";

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}

function nextTurn() {
  return new Promise((resolvePromise) => setImmediate(resolvePromise));
}

function fakeState(overrides = {}) {
  let closeCount = 0;
  const state = {
    rootDir: resolve(fileURLToPath(new URL("../../", import.meta.url))),
    host: "127.0.0.1",
    ports: { console: 0, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: { host: "127.0.0.1", ports: [] } },
    autoStartHttpProxy: false,
    services: {
      ssLocal: { stop: async () => ({ ok: true }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    platform: {
      coinsCommerceEnabled: false,
      coinCommerceCoordinator: null
    },
    close: () => {
      closeCount += 1;
    },
    get closeCount() {
      return closeCount;
    },
    isPortListening: async () => false
  };
  return Object.assign(state, overrides);
}

function fakeLifecycleApp({
  events,
  syncListenError = null,
  bindError = null,
  address = { address: "127.0.0.1", port: 3456 },
  autoCompleteClose = true,
  syncCloseError = null,
  closeError = null
}) {
  const server = new EventEmitter();
  let pendingClose = null;
  server.listening = false;
  server.address = () => address;
  server.close = (callback) => {
    events.push("listener-close-start");
    if (syncCloseError) {
      throw syncCloseError;
    }
    server.listening = false;
    pendingClose = callback;
    if (autoCompleteClose) {
      queueMicrotask(() => {
        if (!pendingClose) return;
        const complete = pendingClose;
        pendingClose = null;
        events.push("listener-close-complete");
        if (!closeError) {
          server.emit("close");
        }
        complete(closeError);
      });
    }
    return server;
  };

  const app = {
    listen() {
      events.push("listen");
      if (syncListenError) {
        throw syncListenError;
      }
      queueMicrotask(() => {
        if (bindError) {
          events.push("bind-error");
          server.emit("error", bindError);
          return;
        }
        server.listening = true;
        events.push("listener-ready");
        server.emit("listening");
      });
      return server;
    }
  };

  return {
    app,
    server,
    completeClose(error = closeError) {
      assert.equal(typeof pendingClose, "function");
      const complete = pendingClose;
      pendingClose = null;
      events.push("listener-close-complete");
      if (!error) {
        server.emit("close");
      }
      complete(error);
    }
  };
}

test("package root exports stable module APIs", () => {
  assert.equal(typeof createApp, "function");
  assert.equal(typeof createRuntimeState, "function");
  assert.equal(typeof assessChannelExtendedMeasurement, "function");
  assert.equal(typeof buildAccessModelInventorySummary, "function");
  assert.equal(typeof buildCleanEdgeReadinessSummary, "function");
  assert.equal(typeof buildChannelCandidateReport, "function");
  assert.equal(typeof buildChannelDecisionPack, "function");
  assert.equal(typeof buildChannelLabTargetDecision, "function");
  assert.equal(typeof buildChannelRuntimeExecutionHandoff, "function");
  assert.equal(typeof buildChannelRuntimeEvidenceBridge, "function");
  assert.equal(typeof buildChannelRuntimeGateWorkbench, "function");
  assert.equal(typeof buildChannelRuntimeGatePacket, "function");
  assert.equal(typeof buildChannelRuntimeInventorySummary, "function");
  assert.equal(typeof buildChannelRuntimeRegistry, "function");
  assert.equal(typeof buildChannelSubscriptionActivationFlow, "function");
  assert.equal(typeof buildChannelSubscriptionActivationPackage, "function");
  assert.equal(typeof buildChannelSubscriptionActivationRecordTemplate, "function");
  assert.equal(typeof buildChannelProductionModule, "function");
  assert.equal(typeof buildPlatformResourcePackage, "function");
  assert.equal(typeof CHANNEL_SUBSCRIPTION_ACTIVATION_FLOW_FIXTURE_SCHEMA_VERSION, "string");
  assert.equal(typeof createChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof normalizeChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof replayChannelSubscriptionActivationFlowFixture, "function");
  assert.equal(typeof buildChannelSubscriptionActivationHandoff, "function");
  assert.equal(typeof buildChannelSubscriptionActivationReadiness, "function");
  assert.equal(typeof buildChannelSubscriptionOutputDraft, "function");
  assert.equal(typeof buildChannelSubscriptionRenderProof, "function");
  assert.equal(typeof buildChannelSystemDecisionFlow, "function");
  assert.equal(typeof buildChannelExtendedMeasurementReport, "function");
  assert.equal(typeof buildChannelMeasurementBundleReport, "function");
  assert.equal(typeof createChannelBenchmarkFixtureFromPlan, "function");
  assert.equal(typeof generateClashProviderSubscription, "function");
  assert.equal(typeof generateClashProxyProvider, "function");
  assert.equal(typeof generateClashSubscription, "function");
  assert.equal(typeof generateMihomoProviderTemplate, "function");
  assert.equal(typeof generateMihomoRenderTemplate, "function");
  assert.equal(typeof CHANNEL_BENCHMARK_SAMPLE_SCHEMA_VERSION, "string");
  assert.equal(typeof normalizeChannelBenchmarkFixture, "function");
  assert.equal(typeof runChannelBenchmarkPlan, "function");
  assert.equal(typeof scoreChannelBenchmarkSummary, "function");
  assert.equal(typeof summarizeChannelBenchmarkResults, "function");
  assert.equal(typeof startProxyGateway, "function");
});

test("package test-runner contract requires Node concurrency support", () => {
  const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
  const sourceValidationRunner = readFileSync(
    resolve(rootDir, "scripts", "source-validation-test-runner.mjs"),
    "utf8"
  );

  assert.equal(
    packageJson.engines.node,
    ">=20.10.0 <21 || 22.x || 23.x || 24.x || 25.x || 26.x"
  );
  assert.equal(
    packageJson.scripts["test:server"],
    "node scripts/source-validation-test-runner.mjs"
  );
  assert.match(sourceValidationRunner, /"--test-concurrency=4"/u);
  assert.match(sourceValidationRunner, /name\.endsWith\("\.test\.mjs"\)/u);
  assert.equal(
    packageJson.scripts["platform:wallet-first-resource-effect-runtime-claims:schema"],
    "node scripts/platform-wallet-first-resource-effect-runtime-claims-schema.mjs"
  );
});

test("candidate release startup shim is versioned and packageable", () => {
  const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const shimPath = resolve(rootDir, "candidate-start.mjs");
  const packagePath = resolve(rootDir, "package.json");
  const source = readFileSync(shimPath, "utf8");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

  assert.equal(existsSync(shimPath), true);
  assert.match(
    source,
    /from "\.\/server\/services\/platform\/coin-commerce-production-runtime\.mjs"/
  );
  assert.doesNotMatch(source, /\bstartProxyGateway\b/);
  assert.doesNotMatch(source, /process\.env\.[A-Z0-9_]*(TOKEN|SECRET|PASSWORD)/i);
  assert.equal(packageJson.files.includes("candidate-start.mjs"), true);
});

test("startProxyGateway starts and stops an embedded app", async () => {
  const state = fakeState();
  const handle = await startProxyGateway({
    state,
    logger: false
  });

  try {
    const address = handle.server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await handle.stop();
  }

  assert.equal(state.closeCount, 1);
});

test("startProxyGateway startup logs do not expose the console token", async () => {
  const state = fakeState();
  const logs = [];
  const handle = await startProxyGateway({
    state,
    logger: { log: (...parts) => logs.push(parts.join(" ")) }
  });

  try {
    const output = logs.join("\n");
    assert.doesNotMatch(output, /secret/);
    assert.doesNotMatch(output, /Console Token:/);
    assert.match(output, /Console Token Source:/);
  } finally {
    await handle.stop();
  }
});

test("startProxyGateway closes runtime state when startup fails", async () => {
  const state = fakeState();
  state.autoStartHttpProxy = true;
  state.services.httpProxy.start = async () => {
    throw new Error("http proxy failed");
  };

  await assert.rejects(
    startProxyGateway({
      state,
      logger: false
    }),
    /http proxy failed/
  );

  assert.equal(state.closeCount, 1);
});

test("startProxyGateway preserves safe Commerce prerequisite failure from owned state creation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "proxy-gateway-package-commerce-preflight-"));
  const proxyConfigPath = join(directory, "proxy-config.json");
  const controlDbPath = join(directory, "control.sqlite");
  const subscriptionDbPath = join(directory, "subscriptions.sqlite");
  let listenCount = 0;
  let proxyStartCount = 0;
  let coordinatorStartCount = 0;
  writeFileSync(proxyConfigPath, JSON.stringify({ servers: [] }), "utf8");

  try {
    await assert.rejects(
      startProxyGateway({
        runtimeOptions: {
          rootDir: directory,
          env: {
            CONSOLE_TOKEN: "synthetic-package-entry-token",
            USER_PORTAL_ROUTES_ENABLED: "true",
            COINS_WALLET_ENABLED: "true",
            COINS_COMMERCE_ENABLED: "true"
          },
          proxyConfigPath,
          controlDbPath,
          subscriptionDbPath,
          autoStartHttpProxy: false,
          httpProxyServer: {
            start() {
              proxyStartCount += 1;
            }
          },
          coinCommerceCoordinator: {
            start() {
              coordinatorStartCount += 1;
            },
            stop() {}
          }
        },
        app: {
          listen() {
            listenCount += 1;
          }
        },
        logger: false
      }),
      (error) => {
        assert.equal(error?.code, "coin_commerce_prerequisite_missing");
        assert.equal(Object.hasOwn(error, "cause"), false);
        return true;
      }
    );

    assert.equal(listenCount, 0);
    assert.equal(proxyStartCount, 0);
    assert.equal(coordinatorStartCount, 0);
    assert.equal(existsSync(controlDbPath), false);
    assert.equal(existsSync(subscriptionDbPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("startProxyGateway waits for listener, HTTP proxy, and Commerce coordinator before readiness", async () => {
  const events = [];
  const proxyStarted = deferred();
  const coordinatorStarted = deferred();
  const coordinator = {
    start() {
      events.push("coordinator-start");
      return coordinatorStarted.promise;
    },
    async stop() {
      events.push("coordinator-stop");
    }
  };
  const state = fakeState({
    autoStartHttpProxy: true,
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: coordinator
    },
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        start() {
          events.push("http-proxy-start");
          return proxyStarted.promise;
        },
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({ events });
  const started = startProxyGateway({
    state,
    app: lifecycle.app,
    logger: {
      log() {
        events.push("readiness-log");
      }
    }
  });

  await nextTurn();
  assert.deepEqual(events, [
    "listen",
    "listener-ready",
    "http-proxy-start"
  ]);

  proxyStarted.resolve();
  await nextTurn();
  assert.deepEqual(events, [
    "listen",
    "listener-ready",
    "http-proxy-start",
    "coordinator-start"
  ]);

  coordinatorStarted.resolve();
  const handle = await started;
  assert.equal(events.filter((event) => event === "readiness-log").length > 0, true);
  assert.equal(
    events.indexOf("coordinator-start") < events.indexOf("readiness-log"),
    true
  );

  await handle.stop();
});

test("startProxyGateway does not inspect a Commerce coordinator while the gate is off", async () => {
  const platform = { coinsCommerceEnabled: false };
  Object.defineProperty(platform, "coinCommerceCoordinator", {
    enumerable: true,
    get() {
      throw new Error("disabled coordinator getter must stay untouched");
    }
  });
  const state = fakeState({ platform });
  const handle = await startProxyGateway({ state, logger: false });

  await handle.stop();

  assert.equal(state.closeCount, 1);
});

test("startProxyGateway does not inspect a welcome-bonus coordinator while its worker gate is off", async () => {
  const platform = {
    coinsCommerceEnabled: false,
    registrationWelcomeCoinsWorkerEnabled: false,
    walletFirstDeferredRuntimeEnabled: false
  };
  Object.defineProperty(platform, "portalRegistrationWelcomeBonusCoordinator", {
    enumerable: true,
    get() {
      throw new Error("disabled welcome-bonus coordinator getter must stay untouched");
    }
  });
  Object.defineProperty(platform, "deferredTransitionCoordinator", {
    enumerable: true,
    get() {
      throw new Error("disabled deferred coordinator getter must stay untouched");
    }
  });
  const state = fakeState({ platform });
  const handle = await startProxyGateway({ state, logger: false });

  await handle.stop();

  assert.equal(state.closeCount, 1);
});

test("startProxyGateway starts the welcome-Coins drain after Commerce even when admission is off", async () => {
  const events = [];
  const commerceCoordinator = {
    async start() {
      events.push("commerce-start");
    },
    async stop() {
      events.push("commerce-stop");
    }
  };
  const welcomeBonusCoordinator = {
    async start() {
      events.push("welcome-bonus-start");
    },
    async stop() {
      events.push("welcome-bonus-stop");
    }
  };
  const platform = {
    coinsCommerceEnabled: true,
    coinCommerceCoordinator: commerceCoordinator,
    registrationWelcomeCoinsEnabled: false,
    registrationWelcomeCoinsWorkerEnabled: true,
    walletFirstDeferredRuntimeEnabled: false,
    portalRegistrationWelcomeBonusCoordinator: welcomeBonusCoordinator
  };
  Object.defineProperty(platform, "deferredTransitionCoordinator", {
    enumerable: true,
    get() {
      throw new Error("welcome-Coins worker must not inspect the deferred coordinator");
    }
  });
  const state = fakeState({
    platform,
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {},
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({ events });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });

  assert.equal(events.indexOf("commerce-start") < events.indexOf("welcome-bonus-start"), true);
  assert.equal(events.includes("deferred-transition-start"), false);

  events.length = 0;
  await handle.stop();

  assert.equal(events.indexOf("welcome-bonus-stop") < events.indexOf("commerce-stop"), true);
  assert.equal(events.indexOf("commerce-stop") < events.indexOf("ss-local-stop"), true);
  assert.equal(events.indexOf("ss-local-stop") < events.indexOf("http-proxy-stop"), true);
  assert.equal(events.indexOf("http-proxy-stop") < events.indexOf("state-close"), true);
});

test("startProxyGateway rejects a malformed enabled welcome-bonus coordinator before listening", async () => {
  const events = [];
  const state = fakeState({
    platform: {
      coinsCommerceEnabled: false,
      registrationWelcomeCoinsWorkerEnabled: true,
      portalRegistrationWelcomeBonusCoordinator: {
        async start() {}
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({ events });

  await assert.rejects(
    startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    }),
    /welcome-bonus coordinator/i
  );

  assert.deepEqual(events, ["state-close"]);
});

test("startProxyGateway rejects a malformed enabled coordinator before listening and closes state", async () => {
  const events = [];
  const state = fakeState({
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: {
        async start() {}
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({ events });

  await assert.rejects(
    startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    }),
    /coordinator/i
  );

  assert.deepEqual(events, ["state-close"]);
});

test("startProxyGateway awaits state cleanup when app creation fails", async () => {
  const appError = new Error("synthetic app creation failure");
  const stateClosed = deferred();
  const events = [];
  const state = fakeState({
    close() {
      events.push("state-close");
      return stateClosed.promise;
    }
  });
  Object.defineProperty(state, "rootDir", {
    enumerable: true,
    get() {
      throw appError;
    }
  });

  const started = startProxyGateway({ state, logger: false });
  started.catch(() => {});
  await nextTurn();
  assert.deepEqual(events, ["state-close"]);

  let settled = false;
  started.finally(() => {
    settled = true;
  }).catch(() => {});
  await nextTurn();
  assert.equal(settled, false);

  stateClosed.resolve();
  await assert.rejects(started, (error) => error === appError);
});

test("startProxyGateway cleans state after synchronous listen failure", async () => {
  const listenError = new Error("synthetic listen failure");
  const events = [];
  const state = fakeState({
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    syncListenError: listenError
  });

  await assert.rejects(
    startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    }),
    (error) => error === listenError
  );

  assert.deepEqual(events, ["listen", "state-close"]);
});

test("startProxyGateway cleans state after bind failure leaves the listener closed", async () => {
  const bindError = new Error("synthetic bind failure");
  const events = [];
  const state = fakeState({
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    bindError
  });

  await assert.rejects(
    startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    }),
    (error) => error === bindError
  );

  assert.equal(events.at(-1), "state-close");
});

test("startProxyGateway stops an attempted HTTP proxy and awaits state after proxy startup failure", async () => {
  const proxyError = new Error("synthetic HTTP proxy startup failure");
  const stateClosed = deferred();
  const events = [];
  const state = fakeState({
    autoStartHttpProxy: true,
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
          throw proxyError;
        },
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
      return stateClosed.promise;
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });

  const started = startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  started.catch(() => {});
  await nextTurn();
  assert.equal(events.includes("http-proxy-stop"), true);
  assert.equal(events.includes("listener-close-start"), true);
  assert.equal(events.includes("state-close"), false);
  assert.equal(events.includes("ss-local-stop"), false);

  let settled = false;
  started.finally(() => {
    settled = true;
  }).catch(() => {});
  await nextTurn();
  assert.equal(settled, false);

  lifecycle.completeClose();
  await nextTurn();
  assert.equal(events.includes("state-close"), true);
  assert.equal(settled, false);

  stateClosed.resolve();
  await assert.rejects(started, (error) => error === proxyError);
});

test("startProxyGateway awaits deferred proxy cleanup before finishing failed startup cleanup", async () => {
  const proxyError = new Error("synthetic HTTP proxy startup failure");
  const proxyStopped = deferred();
  const events = [];
  const state = fakeState({
    autoStartHttpProxy: true,
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
          throw proxyError;
        },
        stop() {
          events.push("http-proxy-stop");
          return proxyStopped.promise;
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });
  const started = startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  started.catch(() => {});
  let settled = false;
  started.finally(() => {
    settled = true;
  }).catch(() => {});
  await nextTurn();

  assert.equal(events.includes("http-proxy-stop"), true);
  lifecycle.completeClose();
  await nextTurn();
  assert.equal(events.includes("state-close"), false);
  assert.equal(settled, false);

  proxyStopped.resolve();
  await assert.rejects(started, (error) => error === proxyError);
  assert.equal(events.at(-1), "state-close");
});

test("startProxyGateway preserves coordinator startup error while every acquired resource cleans up", async () => {
  const startupError = new Error("synthetic coordinator startup failure");
  const coordinatorCleanupError = new Error("synthetic coordinator cleanup failure");
  const proxyCleanupError = new Error("synthetic proxy cleanup failure");
  const listenerCleanupError = new Error("synthetic listener cleanup failure");
  const stateCleanupError = new Error("synthetic state cleanup failure");
  const events = [];
  const coordinator = {
    async start() {
      events.push("coordinator-start");
      throw startupError;
    },
    async stop() {
      events.push("coordinator-stop");
      throw coordinatorCleanupError;
    }
  };
  const state = fakeState({
    autoStartHttpProxy: true,
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: coordinator
    },
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
        },
        async stop() {
          events.push("http-proxy-stop");
          throw proxyCleanupError;
        }
      }
    },
    async close() {
      events.push("state-close");
      throw stateCleanupError;
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    closeError: listenerCleanupError
  });

  await assert.rejects(
    startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    }),
    (error) => error === startupError
  );

  for (const event of [
    "listener-close-start",
    "coordinator-stop",
    "http-proxy-stop",
    "listener-close-complete",
    "state-close"
  ]) {
    assert.equal(events.includes(event), true, `missing cleanup event: ${event}`);
  }
  assert.equal(events.includes("ss-local-stop"), false);
});

test("startProxyGateway concurrent stop closes listener first and awaits coordinator before proxies and state", async () => {
  const coordinatorStopped = deferred();
  const stateClosed = deferred();
  const events = [];
  const coordinator = {
    async start() {
      events.push("coordinator-start");
    },
    stop() {
      events.push("coordinator-stop");
      return coordinatorStopped.promise;
    }
  };
  const state = fakeState({
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: coordinator
    },
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
        },
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
      return stateClosed.promise;
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  events.length = 0;

  const firstStop = handle.stop();
  const secondStop = handle.stop();
  assert.equal(firstStop, secondStop);
  assert.deepEqual(events, [
    "listener-close-start",
    "coordinator-stop"
  ]);

  coordinatorStopped.resolve();
  await nextTurn();
  assert.deepEqual(events, [
    "listener-close-start",
    "coordinator-stop",
    "ss-local-stop",
    "http-proxy-stop"
  ]);

  lifecycle.completeClose();
  await nextTurn();
  assert.equal(events.at(-1), "state-close");

  let settled = false;
  firstStop.finally(() => {
    settled = true;
  }).catch(() => {});
  await nextTurn();
  assert.equal(settled, false);

  stateClosed.resolve();
  await firstStop;
  await secondStop;
});

test("startProxyGateway stop awaits each deferred proxy cleanup stage before advancing", async () => {
  const ssLocalStopped = deferred();
  const httpProxyStopped = deferred();
  const events = [];
  const state = fakeState({
    services: {
      ssLocal: {
        stop() {
          events.push("ss-local-stop");
          return ssLocalStopped.promise;
        }
      },
      httpProxy: {
        async start() {},
        stop() {
          events.push("http-proxy-stop");
          return httpProxyStopped.promise;
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  events.length = 0;

  const stopped = handle.stop();
  stopped.catch(() => {});
  assert.deepEqual(events, [
    "listener-close-start",
    "ss-local-stop"
  ]);
  await nextTurn();
  assert.equal(events.includes("http-proxy-stop"), false);

  ssLocalStopped.resolve();
  await nextTurn();
  assert.equal(events.at(-1), "http-proxy-stop");

  lifecycle.completeClose();
  await nextTurn();
  assert.equal(events.includes("state-close"), false);

  httpProxyStopped.resolve();
  await stopped;
  assert.equal(events.at(-1), "state-close");
});

test("startProxyGateway stop continues cleanup and returns the first ordered failure", async () => {
  const coordinatorError = new Error("synthetic coordinator stop failure");
  const ssLocalError = new Error("synthetic ss-local stop failure");
  const httpProxyError = new Error("synthetic HTTP proxy stop failure");
  const listenerError = new Error("synthetic listener close failure");
  const stateError = new Error("synthetic state close failure");
  const events = [];
  const coordinator = {
    async start() {},
    async stop() {
      events.push("coordinator-stop");
      throw coordinatorError;
    }
  };
  const state = fakeState({
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: coordinator
    },
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
          throw ssLocalError;
        }
      },
      httpProxy: {
        async start() {},
        async stop() {
          events.push("http-proxy-stop");
          throw httpProxyError;
        }
      }
    },
    async close() {
      events.push("state-close");
      throw stateError;
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    closeError: listenerError
  });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  events.length = 0;

  const stopped = handle.stop();
  await assert.rejects(stopped, (error) => error === coordinatorError);
  assert.equal(handle.stop(), stopped);
  assert.deepEqual(events, [
    "listener-close-start",
    "coordinator-stop",
    "listener-close-complete",
    "ss-local-stop",
    "http-proxy-stop",
    "state-close"
  ]);
});

for (const failureStage of [
  "listener-close-initiation",
  "ss-local-stop",
  "http-proxy-stop",
  "listener-close-completion",
  "state-close"
]) {
  test(`startProxyGateway stop preserves ${failureStage} as the first failure and runs later cleanup once`, async () => {
    const errors = {
      "listener-close-initiation": new Error("synthetic listener close initiation failure"),
      "ss-local-stop": new Error("synthetic ss-local stop failure"),
      "http-proxy-stop": new Error("synthetic HTTP proxy stop failure"),
      "listener-close-completion": new Error("synthetic listener close completion failure"),
      "state-close": new Error("synthetic state close failure")
    };
    const events = [];
    const state = fakeState({
      services: {
        ssLocal: {
          async stop() {
            events.push("ss-local-stop");
            if (failureStage === "ss-local-stop") {
              throw errors[failureStage];
            }
          }
        },
        httpProxy: {
          async start() {},
          async stop() {
            events.push("http-proxy-stop");
            if (failureStage === "http-proxy-stop") {
              throw errors[failureStage];
            }
          }
        }
      },
      async close() {
        events.push("state-close");
        if (failureStage === "state-close") {
          throw errors[failureStage];
        }
      }
    });
    const lifecycle = fakeLifecycleApp({
      events,
      syncCloseError: failureStage === "listener-close-initiation"
        ? errors[failureStage]
        : null,
      closeError: failureStage === "listener-close-completion"
        ? errors[failureStage]
        : null
    });
    const handle = await startProxyGateway({
      state,
      app: lifecycle.app,
      logger: false
    });
    events.length = 0;

    const stopped = handle.stop();
    await assert.rejects(stopped, (error) => error === errors[failureStage]);
    assert.equal(handle.stop(), stopped);

    for (const event of [
      "listener-close-start",
      "ss-local-stop",
      "http-proxy-stop",
      "state-close"
    ]) {
      assert.equal(
        events.filter((value) => value === event).length,
        1,
        `${failureStage}: ${event} should run exactly once`
      );
    }
    assert.equal(
      events.filter((value) => value === "listener-close-complete").length,
      failureStage === "listener-close-initiation" ? 0 : 1
    );
  });
}

test("startProxyGateway rejects a listener error while HTTP proxy startup is pending", async () => {
  const listenerError = new Error("synthetic listener failure during proxy startup");
  const proxyCleanupError = new Error("synthetic proxy cleanup failure");
  const listenerCleanupError = new Error("synthetic listener cleanup failure");
  const stateCleanupError = new Error("synthetic state cleanup failure");
  const proxyStarted = deferred();
  const events = [];
  const state = fakeState({
    autoStartHttpProxy: true,
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        start() {
          events.push("http-proxy-start");
          return proxyStarted.promise;
        },
        async stop() {
          events.push("http-proxy-stop");
          throw proxyCleanupError;
        }
      }
    },
    async close() {
      events.push("state-close");
      throw stateCleanupError;
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    closeError: listenerCleanupError
  });
  const started = startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  started.catch(() => {});
  await nextTurn();
  assert.equal(events.at(-1), "http-proxy-start");

  lifecycle.server.once("error", () => {
    events.push("fallback-listener-error");
  });
  lifecycle.server.emit("error", listenerError);
  proxyStarted.resolve();

  await assert.rejects(started, (error) => error === listenerError);
  for (const event of [
    "listener-close-start",
    "http-proxy-stop",
    "listener-close-complete",
    "state-close"
  ]) {
    assert.equal(events.includes(event), true, `missing cleanup event: ${event}`);
  }
  assert.equal(events.includes("ss-local-stop"), false);
});

test("startProxyGateway rejects a listener error while coordinator startup is pending", async () => {
  const listenerError = new Error("synthetic listener failure during coordinator startup");
  const coordinatorCleanupError = new Error("synthetic coordinator cleanup failure");
  const proxyCleanupError = new Error("synthetic proxy cleanup failure");
  const stateCleanupError = new Error("synthetic state cleanup failure");
  const coordinatorStarted = deferred();
  const events = [];
  const coordinator = {
    start() {
      events.push("coordinator-start");
      return coordinatorStarted.promise;
    },
    async stop() {
      events.push("coordinator-stop");
      throw coordinatorCleanupError;
    }
  };
  const state = fakeState({
    autoStartHttpProxy: true,
    platform: {
      coinsCommerceEnabled: true,
      coinCommerceCoordinator: coordinator
    },
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
        },
        async stop() {
          events.push("http-proxy-stop");
          throw proxyCleanupError;
        }
      }
    },
    async close() {
      events.push("state-close");
      throw stateCleanupError;
    }
  });
  const lifecycle = fakeLifecycleApp({ events });
  const started = startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  started.catch(() => {});
  await nextTurn();
  assert.equal(events.at(-1), "coordinator-start");

  lifecycle.server.once("error", () => {
    events.push("fallback-listener-error");
  });
  lifecycle.server.emit("error", listenerError);
  coordinatorStarted.resolve();

  await assert.rejects(started, (error) => error === listenerError);
  for (const event of [
    "listener-close-start",
    "coordinator-stop",
    "http-proxy-stop",
    "listener-close-complete",
    "state-close"
  ]) {
    assert.equal(events.includes(event), true, `missing cleanup event: ${event}`);
  }
  assert.equal(events.includes("ss-local-stop"), false);
});

test("startProxyGateway stop treats an externally closed listener as already complete", async () => {
  const events = [];
  const state = fakeState({
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
        },
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  lifecycle.server.close((error) => assert.ifError(error));
  lifecycle.completeClose();
  events.length = 0;

  await handle.stop();

  assert.deepEqual(events, [
    "ss-local-stop",
    "http-proxy-stop",
    "state-close"
  ]);
});

test("startProxyGateway stop awaits an externally initiated listener close before state cleanup", async () => {
  const events = [];
  const state = fakeState({
    services: {
      ssLocal: {
        async stop() {
          events.push("ss-local-stop");
        }
      },
      httpProxy: {
        async start() {
          events.push("http-proxy-start");
        },
        async stop() {
          events.push("http-proxy-stop");
        }
      }
    },
    close() {
      events.push("state-close");
    }
  });
  const lifecycle = fakeLifecycleApp({
    events,
    autoCompleteClose: false
  });
  const handle = await startProxyGateway({
    state,
    app: lifecycle.app,
    logger: false
  });
  events.length = 0;

  lifecycle.server.close((error) => {
    assert.ifError(error);
    events.push("external-close-callback");
  });
  const stopped = handle.stop();
  stopped.catch(() => {});
  await nextTurn();

  assert.equal(
    events.filter((event) => event === "listener-close-start").length,
    1
  );
  assert.equal(events.includes("state-close"), false);
  let settled = false;
  stopped.finally(() => {
    settled = true;
  }).catch(() => {});
  await nextTurn();
  assert.equal(settled, false);

  lifecycle.completeClose();
  await stopped;
  assert.deepEqual(events, [
    "listener-close-start",
    "ss-local-stop",
    "http-proxy-stop",
    "listener-close-complete",
    "external-close-callback",
    "state-close"
  ]);
});
