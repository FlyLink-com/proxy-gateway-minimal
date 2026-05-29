#!/usr/bin/env node
/**
 * Platform Revoke Access CLI (Dry-Run / Plan-Only)
 *
 * This tool simulates the revocation of a tenant's access and artifacts.
 * It strictly outputs a safe revocation plan and does NOT mutate the database.
 * Real mutation requires an A-tier execution approval and manual execution or an explicitly authorized tool.
 */

import { createHash } from "node:crypto";

function safeRef(prefix, value) {
  return `${prefix}_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

const tenantId = process.argv[2];
const mode = process.argv[3] || '--dry-run';

try {
  if (!tenantId) {
    throw new Error("usage: platform-revoke-access <tenant-id> [--dry-run]");
  }

  if (mode !== '--dry-run') {
    throw new Error("Only --dry-run mode is currently permitted to prevent unauthorized production mutation.");
  }

  const revocationPlan = {
    tenantRef: safeRef("tenant", tenantId),
    action: "REVOKE_ACCESS_AND_DISABLE_TENANT",
    mode: "dry-run",
    status: "PLAN_READY",
    impact: [
      "Tenant status will be changed to 'disabled'",
      "Entitlement status will be changed to 'disabled'",
      "Access grant and artifacts will be marked as revoked",
      "Dynamic entry records will be removed"
    ],
    safety: {
      noDatabaseMutation: true,
      noProductionMutation: true,
      rawTenantIdReturned: false,
      requiresManualExecution: true
    },
    message: "This is a dry-run. No database mutation occurred. Refer to the SOP for manual execution steps."
  };

  process.stdout.write(`${JSON.stringify(revocationPlan, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`platform revoke-access failed: ${error.message}\n`);
  process.exitCode = 1;
}
