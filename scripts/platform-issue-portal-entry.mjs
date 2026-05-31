#!/usr/bin/env node

/**
 * Platform Issue Portal Entry CLI
 *
 * Operator-only dynamic portal entry tool.
 * Implementation is repo-local; production execution remains A-tier.
 * Raw entry tokens are written only to the requested handoff file.
 */

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createUserPortalAuthService } from "../server/services/platform/user-portal-auth.mjs";

const args = process.argv.slice(2);

let executeProductionMutation = false;
let approvalRef = "";
let controlDbPath = "";
let handoffFile = "";
let inputFile = "";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--execute-production-mutation") {
    executeProductionMutation = true;
  } else if (arg === "--approval-ref") {
    approvalRef = args[++i];
  } else if (arg === "--control-db-path") {
    controlDbPath = args[++i];
  } else if (arg === "--handoff-file") {
    handoffFile = args[++i];
  } else if (!arg.startsWith("--")) {
    inputFile = arg;
  }
}

function fail(message) {
  throw new Error(message);
}

function requiredText(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail(`${field} is required`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    fail(`${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input must be an object");
  }
  const normalized = {
    accountId: requiredText(input.accountId, "accountId"),
    entitlementId: requiredText(input.entitlementId, "entitlementId"),
    issuedByRef: requiredText(input.issuedByRef, "issuedByRef"),
    expiresAt: isoText(input.expiresAt, "expiresAt"),
    maxUses: Number(input.maxUses ?? 1)
  };
  if (!Number.isInteger(normalized.maxUses) || normalized.maxUses < 1) {
    fail("maxUses must be an integer >= 1");
  }
  return normalized;
}

try {
  if (!inputFile) {
    fail("usage: platform-issue-portal-entry [flags] <input.json>");
  }

  const inputRaw = readFileSync(resolve(inputFile), "utf8");
  const input = validateInput(JSON.parse(inputRaw));

  if (!executeProductionMutation) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: "dry-run",
      message: "Dry-run mode. No database mutation occurred.",
      controlDbMutated: false,
      handoffWritten: false,
      requirements: "Provide --execute-production-mutation, --approval-ref, --control-db-path, --handoff-file to execute."
    }, null, 2) + "\n");
    process.exit(0);
  }

  if (!approvalRef) fail("--approval-ref is mandatory for execution.");
  if (!controlDbPath) fail("--control-db-path is mandatory for execution.");
  if (!handoffFile) fail("--handoff-file is mandatory for execution.");

  let controlStore;
  try {
    controlStore = createSqliteSubscriptionControlStore({
      dbPath: resolve(controlDbPath)
    });
    const service = createUserPortalAuthService({
      controlStore,
      totpVerifier: () => false
    });

    const { summary, handoffMaterial } = service.issueDynamicEntry({
      accountId: input.accountId,
      entitlementId: input.entitlementId,
      issuedByRef: input.issuedByRef,
      approvalRef,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses
    });

    const resolvedHandoffFile = resolve(handoffFile);
    writeFileSync(resolvedHandoffFile, JSON.stringify(handoffMaterial, null, 2), { mode: 0o600 });
    chmodSync(resolvedHandoffFile, 0o600);

    process.stdout.write(JSON.stringify({
      ok: true,
      mode: "platform-issue-portal-entry",
      controlDbMutated: true,
      handoffWritten: true,
      rawTokenReturned: false,
      summary
    }, null, 2) + "\n");
  } finally {
    controlStore?.close();
  }
} catch (error) {
  process.stderr.write(`platform issue-portal-entry failed: ${error.message}\n`);
  process.exitCode = 1;
}
