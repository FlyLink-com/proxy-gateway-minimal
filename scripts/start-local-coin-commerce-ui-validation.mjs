import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  startLocalCoinCommerceUiValidation,
  startLocalCoinCommercePlanSwitchUiValidation
} from "./start-local-coin-commerce-validation.mjs";

function safeRecord(status, planSwitch = false) {
  if (status === "ready") {
    return {
      type: "coin_commerce_local_ui_validation",
      status,
      ok: true,
      loopback: true,
      port: 3457,
      temporary: true,
      offerCount: planSwitch ? 3 : 5,
      spendableUnits: 1_000,
      ...(planSwitch ? { planSwitch: true } : {})
    };
  }
  return {
    type: "coin_commerce_local_ui_validation",
    status: "stopped",
    ok: true
  };
}

async function runCli() {
  const planSwitch = process.argv.length === 3 && process.argv[2] === "--profile=plan-switch";
  if (process.argv.length !== 2 && !planSwitch) {
    throw new Error("local UI validation accepts only the fixed plan-switch profile");
  }
  let handle = null;
  let stopPromise = null;
  let resolveSignal;
  const signalReceived = new Promise((resolveReceived) => {
    resolveSignal = resolveReceived;
  });
  const onSignal = () => resolveSignal();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    handle = await (planSwitch
      ? startLocalCoinCommercePlanSwitchUiValidation()
      : startLocalCoinCommerceUiValidation());
    process.stdout.write(`${JSON.stringify(safeRecord("ready", planSwitch))}\n`);
    await signalReceived;
    stopPromise = handle.stop();
    await stopPromise;
    process.stdout.write(`${JSON.stringify(safeRecord("stopped"))}\n`);
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
      type: "coin_commerce_local_ui_validation",
      ok: false,
      error: "local_ui_validation_failed"
    })}\n`);
    process.exitCode = 1;
  });
}
