import "dotenv/config";
import { createApp } from "./app.mjs";
import { createRuntimeState } from "./state.mjs";

const state = createRuntimeState();
const app = createApp(state);

const server = app.listen(state.ports.console, state.host, async () => {
  const addr = server.address();
  if (!addr) {
    console.error("FATAL: Console port bind failed (port may be in excluded range)");
    process.exit(1);
  }
  if (state.autoStartHttpProxy) {
    await state.services.httpProxy.start();
  }
  console.log("Proxy Gateway Console");
  console.log(`  Console:   http://${state.host}:${state.ports.console}/`);
  console.log(`  SOCKS5:    ${state.host}:${state.ports.socks} (when ss-local running)`);
  console.log(`  HTTP Proxy: ${state.host}:${state.ports.httpProxy}`);
  console.log(`  Console Token: ${state.consoleToken}`);
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

process.on("SIGINT", async () => {
  await state.services.ssLocal.stop();
  await state.services.httpProxy.stop();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  await state.services.ssLocal.stop();
  await state.services.httpProxy.stop();
  server.close(() => process.exit(0));
});
