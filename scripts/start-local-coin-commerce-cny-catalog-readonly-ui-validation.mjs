import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startLocalCoinCommerceCnyCatalogReadonlyUiValidation } from "./start-local-coin-commerce-validation.mjs";

async function runCli() {
  if (process.argv.length !== 2) throw new Error("local readonly UI accepts no arguments");
  let handle = null;
  let stopPromise = null;
  let resolveSignal;
  const signalReceived = new Promise((resolveReceived) => { resolveSignal = resolveReceived; });
  const onSignal = () => resolveSignal();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    handle = await startLocalCoinCommerceCnyCatalogReadonlyUiValidation();
    process.stdout.write(`${JSON.stringify({
      type: "coin_commerce_local_cny_catalog_readonly_ui_validation",
      status: "ready", ok: true, loopback: true, port: 3457, temporary: true,
      catalogOnly: true, rechargeOfferCount: 6, currency: "CNY",
      paymentMethod: "alipay", paymentActions: false, providerNetwork: false,
    })}\n`);
    await signalReceived;
    stopPromise = handle.stop();
    await stopPromise;
    process.stdout.write(`${JSON.stringify({
      type: "coin_commerce_local_cny_catalog_readonly_ui_validation",
      status: "stopped", ok: true,
    })}\n`);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (handle) {
      stopPromise ||= handle.stop();
      await stopPromise.catch(() => {});
    }
  }
}

const direct = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  runCli().catch(() => {
    process.stderr.write(`${JSON.stringify({
      type: "coin_commerce_local_cny_catalog_readonly_ui_validation",
      ok: false, error: "local_readonly_ui_validation_failed",
    })}\n`);
    process.exitCode = 1;
  });
}
