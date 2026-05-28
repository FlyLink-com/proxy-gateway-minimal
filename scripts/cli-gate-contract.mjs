#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  buildCliCommandManifest,
  evaluateCliGateRequest
} from "../server/services/cli-gate-contract.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv) {
  const [action, inputPath] = argv;
  if (action === "manifest") {
    return buildCliCommandManifest();
  }
  if (action === "evaluate" && inputPath) {
    return evaluateCliGateRequest(readJson(inputPath));
  }
  return {
    ok: false,
    status: "blocked",
    reason: "usage",
    usage: [
      "node scripts/cli-gate-contract.mjs manifest",
      "node scripts/cli-gate-contract.mjs evaluate <request.json>"
    ],
    safety: { noSideEffects: true, redacted: true }
  };
}

const result = main(process.argv.slice(2));
console.log(JSON.stringify(result, null, 2));
