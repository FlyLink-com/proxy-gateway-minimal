// Strict, cross-module contract checks against exact Stage2 source+target code.
//
// These tests intentionally demonstrate known *blocked* handshakes.
// A passing test does NOT claim source export can be loaded or that
// either endpoint is remotely deployed. No credentials, BWH DB or E4.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_MAPPING_VERSION, exportableColumns,
} from "../../../server/services/platform/d1-stage2-source-export.mjs";
import { normalizeSyntheticPlan } from "../../../tools/d1-stage2/offline-rehearsal.mjs";

const t = "2026-11-20T00:00:00.000Z";
const accountExport = {
  id: "s2s-account-001",
  owner_ref: "s2s-owner-001",
  status: "active",
  created_at: t,
  updated_at: t,
};
const entitlement = {
  id: "s2s-entitlement-001",
  account_id: "s2s-account-001",
  plan: "s2s-plan-basic",
  status: "active",
  valid_from: t,
  valid_until: "2027-11-20T00:00:00.000Z",
  max_artifacts: 1,
  max_devices: 1,
  traffic_limit_bytes: 0,
  created_at: t,
  updated_at: t,
};
const plan = (accounts, entitlements = []) => ({
  runId: "s2s-run-dual-acceptance-001",
  snapshotId: "s2s-snapshot-dual-acceptance-001",
  batchSize: 1,
  tables: [
    { name: "platform_accounts", rows: accounts },
    ...(entitlements.length ? [{ name: "platform_entitlements", rows: entitlements }] : []),
  ],
});

test("S2-WIRE-1: candidate source explicitly excludes metadata_json; D1 loader refuses direct row", () => {
  assert.equal(CANDIDATE_MAPPING_VERSION, "stage2-candidate-v1");
  assert.deepEqual(exportableColumns("platform_accounts"), [
    "id", "owner_ref", "status", "created_at", "updated_at",
  ]);
  assert.ok(!exportableColumns("platform_accounts").includes("metadata_json"));
  assert.throws(() => normalizeSyntheticPlan(plan([accountExport])), {
    code: "stage2_column_disposition_denied",
  });
});

test("S2-WIRE-2: owner-unapproved default metadata repair must not happen silently", () => {
  const row = { ...accountExport, metadata_json: "{}" };
  // A synthetic-only manual fixture can pass, but the SOURCE export page
  // never contains this column. A production mapping must be approved
  // rather than assumed merely from this successful test.
  const localOnly = normalizeSyntheticPlan(plan([row]));
  assert.equal(localOnly.tables[0].rows[0].metadata_json, "{}");
  assert.deepEqual(exportableColumns("platform_accounts"), [
    "id", "owner_ref", "status", "created_at", "updated_at",
  ]);
});

test("S2-WIRE-3: source plan values are not in the target synthetic loader whitelist", () => {
  const row = { ...accountExport, metadata_json: "{}" };
  assert.deepEqual(exportableColumns("platform_entitlements"), [
    "id", "account_id", "plan", "status", "valid_from", "valid_until",
    "max_artifacts", "max_devices", "traffic_limit_bytes", "created_at", "updated_at",
  ]);
  assert.throws(() => normalizeSyntheticPlan(plan([row], [entitlement])), {
    code: "stage2_real_rows_denied",
  });
  // Changing the plan to a target-specific fictional value may make a
  // synthetic test pass; such transformation has no owner-approved rule.
  assert.equal(normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "monthly",
  }])).tables[1].rows[0].plan, "monthly");
});

test("S2-WIRE-4: source 'suspended' entitlement status must not be coerced to expired", () => {
  const row = { ...accountExport, metadata_json: "{}" };
  assert.throws(() => normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "monthly", status: "suspended",
  }])), { code: "stage2_real_rows_denied" });
});

test("S2-WIRE-5: deferred credential columns do not cross D1 loader boundary", () => {
  assert.deepEqual(exportableColumns("platform_portal_edge_credentials"), [
    "request_id", "edge_channel_ref", "ordinal",
  ]);
  assert.throws(() => normalizeSyntheticPlan({
    runId: "s2s-run-cred-001", snapshotId: "s2s-snapshot-cred-001",
    batchSize: 1, tables: [{
      name: "platform_portal_edge_credentials",
      rows: [{ request_id: "s2s-request-001", edge_channel_ref: "s2s-channel-a", ordinal: 0 }],
    }],
  }), { code: "stage2_table_disposition_denied" });
});
