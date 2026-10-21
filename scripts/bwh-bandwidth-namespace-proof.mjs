import { writeSync } from "node:fs";
import { observeSharedRateProof } from "../server/services/platform/bwh-bandwidth-rate-proof.mjs";

// Observable checklist only. No host command is started, and no flag can
// turn this process into an authorized measurement.
let line;
try {
  const report = observeSharedRateProof({ rejectedArgv: process.argv.slice(2) });
  line = `${JSON.stringify(report)}\n`;
} catch {
  line = "{\"ok\":false,\"reason\":\"isolation_not_authorized\"}\n";
}
writeSync(1, line);
process.exit(2);
