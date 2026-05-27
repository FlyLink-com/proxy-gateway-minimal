import { readFileSync } from "node:fs";
import { buildChannelRuntimeEvidenceBridge } from "../server/services/channel-runtime-evidence-bridge.mjs";

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`failed to read channel runtime evidence bridge ${label}`);
  }
}

try {
  const [dryRunPath, scorePath, evidencePath] = process.argv.slice(2);
  if (!dryRunPath || !scorePath || !evidencePath || process.argv.length !== 5) {
    throw new Error("channel runtime evidence bridge requires dry-run, measurement score, and runtime evidence file paths");
  }

  const bridge = buildChannelRuntimeEvidenceBridge({
    dryRunSummary: readJson(dryRunPath, "dry-run input"),
    measurementScore: readJson(scorePath, "measurement score input"),
    runtimeEvidenceInput: readJson(evidencePath, "runtime evidence input")
  });
  process.stdout.write(`${JSON.stringify(bridge, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel runtime evidence bridge failed: ${error.message}\n`);
  process.exitCode = 1;
}
