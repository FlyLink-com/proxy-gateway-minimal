#!/usr/bin/env node
import { runFullMeteringNewActivationRecoveryCommand } from "./lib/full-metering-new-activation-recovery-command.mjs";
try {
  const summary = await runFullMeteringNewActivationRecoveryCommand(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const code = String(error?.code || error?.safeCode || "");
  process.stdout.write(`${JSON.stringify({
    type: "full_metering_new_activation_recovery", ok: false, status: "blocked",
    historicalDebits: false, rawReturned: false, recoveryReady: false, productionWritesAuthorized: false,
    errorCode: /^(full_metering_|probe_)[a-z0-9_]+$/.test(code) ? code : "full_metering_recovery_failed"
  })}\n`);
  process.exitCode = 2;
}
