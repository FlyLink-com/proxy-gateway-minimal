import { readFileSync } from "node:fs";

import { startLocalPayPalSandboxUiValidation } from "./start-local-coin-commerce-validation.mjs";

function validationFailure() {
  return new Error("local_paypal_sandbox_ui_validation_failed");
}

function exactArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 10) throw validationFailure();
  if (
    argv[0] !== "--credential-file"
    || argv[2] !== "--merchant-scope-digest"
    || argv[4] !== "--webhook-id"
    || argv[6] !== "--callback-url"
    || argv[8] !== "--return-url"
  ) {
    throw validationFailure();
  }
  const credentialFile = argv[1];
  const merchantScopeDigest = argv[3];
  const webhookId = argv[5];
  const callbackUrl = argv[7];
  const returnUrl = argv[9];
  let parsedCallbackUrl;
  let parsedReturnUrl;
  try {
    parsedCallbackUrl = new URL(callbackUrl);
    parsedReturnUrl = new URL(returnUrl);
  } catch {
    throw validationFailure();
  }
  if (
    typeof credentialFile !== "string"
    || credentialFile.length < 1
    || credentialFile.length > 4096
    || /[\0\r\n]/u.test(credentialFile)
    || typeof merchantScopeDigest !== "string"
    || !/^[a-f0-9]{64}$/u.test(merchantScopeDigest)
    || typeof webhookId !== "string"
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(webhookId)
    || parsedCallbackUrl.protocol !== "https:"
    || parsedCallbackUrl.pathname !== "/api/platform/payments/paypal/callback"
    || parsedCallbackUrl.search !== ""
    || parsedCallbackUrl.hash !== ""
    || parsedReturnUrl.protocol !== "https:"
    || parsedReturnUrl.hash !== ""
  ) {
    throw validationFailure();
  }
  return Object.freeze({
    credentialFile,
    merchantScopeDigest,
    webhookId,
    callbackUrl: parsedCallbackUrl.href,
    returnUrl: parsedReturnUrl.href,
  });
}

function uniqueCredentialValue(text, labelPattern) {
  const values = [...text.matchAll(labelPattern)].map((match) => match[1]);
  const unique = [...new Set(values)];
  if (unique.length !== 1) throw validationFailure();
  return unique[0];
}

async function runCli() {
  const options = exactArguments(process.argv.slice(2));
  const credentialText = readFileSync(options.credentialFile, "utf8");
  const clientId = uniqueCredentialValue(
    credentialText,
    /^\s*Client\s*ID\s*:\s*(\S+)\s*$/gimu
  );
  const clientSecret = uniqueCredentialValue(
    credentialText,
    /^\s*Secret\s*:\s*(\S+)\s*$/gimu
  );
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
    handle = await startLocalPayPalSandboxUiValidation({
      credential: {
        clientId,
        clientSecret,
        webhookId: options.webhookId,
        merchantScopeDigest: options.merchantScopeDigest
      },
      callbackUrl: options.callbackUrl,
      returnUrl: options.returnUrl,
      fetchFn: globalThis.fetch.bind(globalThis),
      nowFn: () => new Date().toISOString()
    });
    process.stdout.write(JSON.stringify({
      type: "local_paypal_sandbox_ui_validation",
      status: "ready",
      loopback: true,
      port: 3457
    }) + "\n");
    await signalReceived;
    stopPromise = handle.stop();
    await stopPromise;
    process.stdout.write(JSON.stringify({
      type: "local_paypal_sandbox_ui_validation",
      status: "stopped"
    }) + "\n");
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (handle) {
      stopPromise ||= handle.stop();
      await stopPromise.catch(() => {});
    }
  }
}

runCli().catch(() => {
  process.stderr.write(JSON.stringify({
    type: "local_paypal_sandbox_ui_validation",
    ok: false,
    error: "local_paypal_sandbox_ui_validation_failed"
  }) + "\n");
  process.exitCode = 1;
});
