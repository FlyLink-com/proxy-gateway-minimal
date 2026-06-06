#!/usr/bin/env node

/**
 * Platform Issue Portal Initial Account CLI
 *
 * Operator-only initial account credential tool.
 * Production execution remains A-tier. Raw initial passwords are written only
 * to the requested protected handoff file.
 */

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPortalInitialAccountIssuanceService } from "../server/services/platform/portal-initial-account-issuance.mjs";
import { createPortalPasswordCredentialService } from "../server/services/platform/portal-password-credentials.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";

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

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("input must be an object");
  }
  return {
    accountId: optionalText(input.accountId),
    ownerRef: requiredText(input.ownerRef, "ownerRef"),
    displayName: optionalText(input.displayName),
    issuedByRef: requiredText(input.issuedByRef, "issuedByRef")
  };
}

function createPasswordFactory() {
  const testPassword = String(process.env.PORTAL_INITIAL_ACCOUNT_TEST_PASSWORD || "").trim();
  if (testPassword) {
    return () => testPassword;
  }
  return undefined;
}

try {
  if (!inputFile) {
    fail("usage: platform-issue-portal-initial-account [flags] <input.json>");
  }

  const inputRaw = readFileSync(resolve(inputFile), "utf8");
  const input = validateInput(JSON.parse(inputRaw));

  if (!executeProductionMutation) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: "dry-run",
      message: "Dry-run mode. No database mutation occurred and no handoff was written.",
      accountId: input.accountId || null,
      controlDbMutated: false,
      handoffWritten: false,
      rawPasswordReturned: false,
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
    const passwordCredentialService = createPortalPasswordCredentialService({
      controlStore
    });
    const service = createPortalInitialAccountIssuanceService({
      controlStore,
      passwordCredentialService,
      ...(createPasswordFactory() ? { passwordFactory: createPasswordFactory() } : {})
    });
    const { summary, handoffMaterial } = service.issuePortalInitialAccount({
      ...input,
      approvalRef
    });

    const resolvedHandoffFile = resolve(handoffFile);
    writeFileSync(resolvedHandoffFile, JSON.stringify(handoffMaterial, null, 2), { mode: 0o600 });
    chmodSync(resolvedHandoffFile, 0o600);

    process.stdout.write(JSON.stringify({
      ok: true,
      mode: "platform-issue-portal-initial-account",
      controlDbMutated: true,
      handoffWritten: true,
      rawPasswordReturned: false,
      summary
    }, null, 2) + "\n");
  } finally {
    controlStore?.close();
  }
} catch (error) {
  process.stderr.write(`platform issue-portal-initial-account failed: ${error.message}\n`);
  process.exitCode = 1;
}
