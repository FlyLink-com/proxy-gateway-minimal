import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";

// Real application schema and writer, but local synthetic facts only.
test("usage ledger reads the real control-store schema without altering accepted samples", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "admin-usage-store-"));
  const dbPath = join(directory, "control.sqlite");
  const store = createSqliteSubscriptionControlStore({ dbPath });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const createdAt = "2026-10-01T00:00:00.000Z";
  store.createAccount({
    id: "synthetic-ledger-account", ownerRef: "synthetic-owner", status: "active",
    createdAt, updatedAt: createdAt
  });
  store.createEntitlement({
    id: "synthetic-ledger-entitlement", accountId: "synthetic-ledger-account",
    plan: "monthly", status: "active", validFrom: createdAt,
    validUntil: "2026-11-01T00:00:00.000Z", createdAt, updatedAt: createdAt
  });
  store.createIssuanceRequest({
    id: "synthetic-ledger-request", accountId: "synthetic-ledger-account",
    entitlementId: "synthetic-ledger-entitlement", approvalRef: "synthetic-approval",
    status: "issued", quantity: 1, nodeId: "synthetic-node", purpose: "access",
    requestedByRef: "synthetic-operator", createdAt, updatedAt: createdAt
  });
  const record = (id, at, up, down) => store.recordUsageSample({
    id, accountId: "synthetic-ledger-account", entitlementId: "synthetic-ledger-entitlement",
    requestId: "synthetic-ledger-request", edgeCredentialRef: "synthetic-ledger-material",
    sourceRef: "full_metering_xray_cumulative_v1", channelRef: "channel-vultr-a-vless-reality-tcp",
    observedAt: at, intervalStartedAt: at, intervalEndedAt: at,
    uploadBytes: up, downloadBytes: down, sampleDigest: `sha256:${id}`, createdAt: at
  });
  const cutoff = "2026-10-16T12:00:00.000Z";
  record("synthetic-usage-one", "2026-10-16T11:59:00.000Z", 4, 38);
  const first = readAdminUsageLedger({ dbPath, cutoff });
  assert.equal(first.windows.find((window) => window.id === "all_time").totalBytes, "42");
  assert.equal(first.reconciliation.state, "totals_match");
  assert.equal(first.reconciliation.samples.totalBytes, "42");
  assert.equal(first.reconciliation.rollups.totalBytes, "42");

  // The application writer still works after the reader closes its own connection.
  record("synthetic-usage-two", cutoff, 2, 3);
  const second = readAdminUsageLedger({ dbPath, cutoff });
  assert.equal(second.windows.find((window) => window.id === "all_time").totalBytes, "42");
  assert.equal(second.reconciliation.samples.totalBytes, "47");
  assert.equal(second.reconciliation.rollups.totalBytes, "47");
  assert.equal(second.reconciliation.atCutoffSampleCount, 1);
  assert.equal(second.reconciliation.state, "totals_match");
  assert.equal(second.reconciliation.orphanSampleAccountCount, 0);
  assert.equal(second.reconciliation.orphanRollupAccountCount, 0);
  assert.equal(JSON.stringify(second).includes("synthetic-ledger"), false);
});
