#!/usr/bin/env node

/**
 * Platform Issue Subscription CLI
 *
 * A-tier mutation tool.
 * Reads a minimal JSON schema and strictly writes to SQLite via `subscriptions.core`.
 * Requires mandatory flags to prevent accidental production mutations.
 * Secrets are ONLY written to the specified `--handoff-file`.
 */

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeState } from "../server/state.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";

import { executeSubscriptionIssuance, validateIssuanceInput } from "../server/services/platform/subscription-issuance.mjs";

const args = process.argv.slice(2);

let executeProductionMutation = false;
let allowLocalTest = false;
let approvalRef = "";
let dbPath = "";
let controlDbPath = "";
let publicBaseUrl = "";
let handoffFile = "";
let inputFile = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--execute-production-mutation") {
    executeProductionMutation = true;
  } else if (arg === "--allow-local-test") {
    allowLocalTest = true;
  } else if (arg === "--approval-ref") {
    approvalRef = args[++i];
  } else if (arg === "--db-path") {
    dbPath = args[++i];
  } else if (arg === "--control-db-path") {
    controlDbPath = args[++i];
  } else if (arg === "--public-base-url") {
    publicBaseUrl = args[++i];
  } else if (arg === "--handoff-file") {
    handoffFile = args[++i];
  } else if (!arg.startsWith("--")) {
    inputFile = arg;
  }
}

try {
  if (!inputFile) {
    throw new Error("usage: platform-issue-subscription [flags] <input.json>");
  }

  if (!executeProductionMutation) {
    // Dry Run Mode
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: "dry-run",
      message: "Dry-run mode. No database mutation occurred.",
      requirements: "Provide --execute-production-mutation, --approval-ref, --db-path, --control-db-path, --public-base-url, --handoff-file to execute."
    }, null, 2) + "\n");
    process.exit(0);
  }

  if (!approvalRef) throw new Error("--approval-ref is mandatory for execution.");
  if (!dbPath) throw new Error("--db-path is mandatory for execution. Implicit default paths are forbidden.");
  if (!controlDbPath) throw new Error("--control-db-path is mandatory for execution. Business control records are required.");
  if (!publicBaseUrl) throw new Error("--public-base-url is mandatory for execution.");
  if (!handoffFile) throw new Error("--handoff-file is mandatory for execution.");

  if (!publicBaseUrl.startsWith("https://") && !allowLocalTest) {
    throw new Error("--public-base-url must be an https URL unless --allow-local-test is provided.");
  }

  const inputRaw = readFileSync(resolve(inputFile), "utf-8");
  const input = JSON.parse(inputRaw);

  // Validate input BEFORE opening any databases
  validateIssuanceInput(input);

  let state;
  let controlStore;
  try {
    const now = new Date().toISOString();
    controlStore = createSqliteSubscriptionControlStore({
      dbPath: resolve(controlDbPath)
    });

    state = createRuntimeState({
      subscriptionDbPath: resolve(dbPath),
      env: { ...process.env, PUBLIC_SUBSCRIPTION_BASE_URL: publicBaseUrl }
    });

    const { summary, handoffMaterial } = executeSubscriptionIssuance({
      controlStore,
      runtimeCore: state.subscriptions.core,
      input,
      approvalRef,
      now
    });

    // Write Raw Secrets to Handoff File ONLY
    const resolvedHandoffFile = resolve(handoffFile);
    writeFileSync(resolvedHandoffFile, JSON.stringify(handoffMaterial, null, 2), { mode: 0o600 });
    chmodSync(resolvedHandoffFile, 0o600);
    summary.handoffWritten = true;

    // Print Safe Summary to Stdout
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  } finally {
    state?.close();
    controlStore?.close();
  }

} catch (error) {
  process.stderr.write(`platform issue-subscription failed: ${error.message}\n`);
  process.exitCode = 1;
}
