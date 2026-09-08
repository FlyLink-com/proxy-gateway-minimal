#!/usr/bin/env node
import { runFullMeteringCommand } from "./lib/full-metering-command.mjs";
try {
  const summary = await runFullMeteringCommand(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const code = String(error?.baselineCode || error?.code || "");
  process.stdout.write(`${JSON.stringify({ type: "full_metering_collection", ok: false, status: "blocked",
    errorCode: /^(full_metering_|baseline_|counter_|observation_|unknown_counter_|source_|observed_counter_|closed_connection_|connection_)[a-z0-9_]+$/.test(code) ? code : "full_metering_failed" })}\n`);
  process.exitCode = 2;
}
