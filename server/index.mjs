import "dotenv/config";
import { createApp } from "./app.mjs";
import { createRuntimeState } from "./state.mjs";

const state = createRuntimeState();
const app = createApp(state);

const server = app.listen(state.ports.console, state.host, async () => {
  if (state.autoStartHttpProxy) {
    await state.services.httpProxy.start();
  }
  console.log("Proxy Gateway Console");
  console.log(`  Console:   http://${state.host}:${state.ports.console}/`);
  console.log(`  SOCKS5:    ${state.host}:${state.ports.socks} (when ss-local running)`);
  console.log(`  HTTP Proxy: ${state.host}:${state.ports.httpProxy}`);
  console.log(`  Console Token: ${state.consoleToken}`);
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
