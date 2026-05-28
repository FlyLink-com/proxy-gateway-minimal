#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelProductionModule } from "../server/services/channel-production-module.mjs";

const activationPackagePath = process.argv[2];
const canaryEvidencePath = process.argv[3];

try {
  if (!activationPackagePath || !canaryEvidencePath) {
    throw new Error("usage: channel-production-module <activation-package.json> <canary-evidence.json>");
  }

  const activationPackage = JSON.parse(readFileSync(activationPackagePath, "utf8"));
  const canaryEvidence = JSON.parse(readFileSync(canaryEvidencePath, "utf8"));
  const productionModule = buildChannelProductionModule({ activationPackage, canaryEvidence });
  process.stdout.write(`${JSON.stringify(productionModule, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel production module failed: ${error.message}\n`);
  process.exitCode = 1;
}
