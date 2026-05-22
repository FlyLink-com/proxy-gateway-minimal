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

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function startProxyGateway(options = {}) {
  const logger = options.logger ?? console;
  const state = options.state ?? createRuntimeState(options.runtimeOptions ?? options);
  const app = options.app ?? createApp(state);

  const server = app.listen(state.ports.console, state.host);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.once("listening", async () => {
        try {
          const addr = server.address();
          if (!addr) {
            throw new Error("Console port bind failed");
          }

          if (state.autoStartHttpProxy) {
            await state.services.httpProxy.start();
          }

          logStartup(logger, state);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  } catch (error) {
    await closeServer(server).catch(() => {});
    state.close?.();
    throw error;
  }

  async function stop() {
    await state.services.ssLocal.stop();
    await state.services.httpProxy.stop();
    await closeServer(server);
    state.close?.();
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
