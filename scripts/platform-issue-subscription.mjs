#!/usr/bin/env node

/**
 * Platform Issue Subscription CLI
 *
 * A-tier mutation tool.
 * Reads a minimal JSON schema and strictly writes to SQLite via `subscriptions.core`.
 * Requires mandatory flags to prevent accidental production mutations.
 * Secrets are ONLY written to the specified `--handoff-file`.
 */

import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRuntimeState } from "../server/state.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";

const args = process.argv.slice(2);

function safeRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

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
  if (!String(input.nodeId || "").trim()) {
    throw new Error("nodeId is mandatory for real issuance. Implicit default node assignment is forbidden.");
  }
  if (input.artifact?.create !== true) {
    throw new Error("artifact.create must be true. Production issuance must deliver opaque artifacts, not legacy query-token URLs.");
  }

  const control = input.control || {};
  const requiredControlFields = [
    "accountId",
    "ownerRef",
    "entitlementId",
    "requestId",
    "requestedByRef",
    "purpose"
  ];
  for (const field of requiredControlFields) {
    if (!String(control[field] || "").trim()) {
      throw new Error(`control.${field} is mandatory for real issuance.`);
    }
  }

  let state;
  let controlStore;
  try {
    const now = new Date().toISOString();
    controlStore = createSqliteSubscriptionControlStore({
      dbPath: resolve(controlDbPath)
    });

    if (!controlStore.getAccount(control.accountId)) {
      controlStore.createAccount({
        id: control.accountId,
        ownerRef: control.ownerRef,
        status: control.accountStatus || "active",
        createdAt: now,
        updatedAt: now,
        metadata: {
          source: "platform-issue-subscription",
          approvalRef
        }
      });
    }

    if (!controlStore.getEntitlement(control.entitlementId)) {
      controlStore.createEntitlement({
        id: control.entitlementId,
        accountId: control.accountId,
        plan: control.plan || "pilot",
        status: control.entitlementStatus || "active",
        validFrom: control.validFrom || now,
        validUntil: input.expiresAt,
        maxArtifacts: control.maxArtifacts ?? 1,
        maxDevices: control.maxDevices ?? 1,
        trafficLimitBytes: control.trafficLimitBytes ?? 0,
        createdAt: now,
        updatedAt: now
      });
    }

    controlStore.createIssuanceRequest({
      id: control.requestId,
      accountId: control.accountId,
      entitlementId: control.entitlementId,
      approvalRef,
      status: "planned",
      quantity: 1,
      nodeId: input.nodeId,
      purpose: control.purpose,
      requestedByRef: control.requestedByRef,
      createdAt: now,
      updatedAt: now,
      metadata: {
        cli: "platform:issue-subscription"
      }
    });

    state = createRuntimeState({
      subscriptionDbPath: resolve(dbPath),
      env: { ...process.env, PUBLIC_SUBSCRIPTION_BASE_URL: publicBaseUrl }
    });

    const core = state.subscriptions.core;

    // 1. Create Tenant
    const tenantResult = core.createTenant({
      displayName: input.displayName,
      nodeId: input.nodeId,
      expiresAt: input.expiresAt,
      note: input.note
    });

    // 2. Create Artifact
    const artifactResult = core.createSubscriptionArtifact(tenantResult.tenant.id);
    const tenantRef = safeRef("tenant", tenantResult.tenant.id);
    const artifactRef = safeRef("artifact", artifactResult.artifact.id);
    const issuedAt = new Date().toISOString();

    controlStore.linkIssuedSubscription({
      id: `${control.requestId}_link_1`,
      requestId: control.requestId,
      tenantRef,
      artifactRef,
      status: "active",
      createdAt: issuedAt,
      updatedAt: issuedAt
    });
    controlStore.setIssuanceRequestStatus(control.requestId, {
      status: "issued",
      updatedAt: issuedAt
    });
    controlStore.upsertQuotaCounter({
      accountId: control.accountId,
      entitlementId: control.entitlementId,
      metric: "artifact_issuance",
      period: issuedAt.slice(0, 7),
      amount: 1,
      updatedAt: issuedAt
    });
    controlStore.recordAuditEvent({
      id: `${control.requestId}_audit_issued`,
      entityType: "issuance_request",
      entityRef: control.requestId,
      action: "issued",
      actorRef: control.requestedByRef,
      createdAt: issuedAt,
      metadata: {
        source: "platform:issue-subscription"
      }
    });

    // 3. Write Raw Secrets to Handoff File ONLY
    const handoffContent = {
      approvalRef,
      tenantId: tenantResult.tenant.id,
      artifactId: artifactResult.artifact.id,
      subscriptionUrl: artifactResult.subscriptionUrl,
      issuedAt
    };

    const resolvedHandoffFile = resolve(handoffFile);
    writeFileSync(resolvedHandoffFile, JSON.stringify(handoffContent, null, 2), { mode: 0o600 });
    chmodSync(resolvedHandoffFile, 0o600);

    // 4. Print Safe Summary to Stdout
    const summary = {
      ok: true,
      mode: "platform-issue-subscription",
      accountRef: safeRef("account", control.accountId),
      issuanceRequestRef: control.requestId,
      tenantRef,
      artifactRef,
      nodeId: tenantResult.tenant.nodeId,
      expiresAt: tenantResult.tenant.expiresAt,
      handoffWritten: true,
      rawUrlReturned: false,
      dbMutated: true,
      controlDbMutated: true,
      approvalRef
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  } finally {
    state?.close();
    controlStore?.close();
  }

} catch (error) {
  process.stderr.write(`platform issue-subscription failed: ${error.message}\n`);
  process.exitCode = 1;
}
