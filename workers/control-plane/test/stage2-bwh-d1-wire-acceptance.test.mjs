// Card 14: fail-closed BWH->D1 wire acceptance for the four #902
// incompatibilities. Ported from PR #902 commit 6735f994
// ("test(integration): identify exact BWH→D1 metadata, plan, status and
// credential mapping blockers") and adapted to the Card 14 loader contract
// in tools/d1-stage2/offline-rehearsal.mjs.
//
// Strict, cross-module contract checks against exact Stage2 source+target
// code. Each test proves an incompatible input is REJECTED with its own
// named code -- never silently mapped, dropped, repaired, or coerced.
// A passing test does NOT claim source export can be loaded or that
// either endpoint is remotely deployed. No credentials, BWH DB or E4.
// Only synthetic s2s-* fixtures.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_MAPPING_VERSION, exportableColumns,
} from "../../../server/services/platform/d1-stage2-source-export.mjs";
import { normalizeSyntheticPlan } from "../../../tools/d1-stage2/offline-rehearsal.mjs";

const t = "2026-11-20T00:00:00.000Z";
// Source-shaped account row: exactly what the BWH export produces --
// NO metadata_json column (CONDITIONAL, excluded from the export).
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

test("S2-WIRE-1: source-shaped account row without metadata_json is accepted; export still excludes the column", () => {
  assert.equal(CANDIDATE_MAPPING_VERSION, "stage2-candidate-v1");
  assert.deepEqual(exportableColumns("platform_accounts"), [
    "id", "owner_ref", "status", "created_at", "updated_at",
  ]);
  assert.ok(!exportableColumns("platform_accounts").includes("metadata_json"));
  // Card 14: the loader no longer requires metadata_json. A source-shaped
  // row (no such column) normalizes instead of failing the column gate.
  const normalized = normalizeSyntheticPlan(plan([accountExport]));
  assert.equal(normalized.tables[0].rows[0].id, "s2s-account-001");
  assert.ok(!Object.hasOwn(normalized.tables[0].rows[0], "metadata_json"));
});

test("S2-WIRE-2: a row carrying metadata_json is rejected, never imported or silently dropped", () => {
  const empty = { ...accountExport, metadata_json: "{}" };
  assert.throws(() => normalizeSyntheticPlan(plan([empty])), {
    code: "stage2_metadata_json_denied",
  });
  // A personal-data value must fail with the same explicit code, not a
  // generic real-rows denial and not a silent repair.
  const personal = { ...accountExport, metadata_json: '{"email":"example@example.org"}' };
  assert.throws(() => normalizeSyntheticPlan(plan([personal])), {
    code: "stage2_metadata_json_denied",
  });
  assert.deepEqual(exportableColumns("platform_accounts"), [
    "id", "owner_ref", "status", "created_at", "updated_at",
  ]);
});

test("S2-WIRE-3: source plan values are rejected without an owner-approved mapping", () => {
  const row = { ...accountExport };
  assert.deepEqual(exportableColumns("platform_entitlements"), [
    "id", "account_id", "plan", "status", "valid_from", "valid_until",
    "max_artifacts", "max_devices", "traffic_limit_bytes", "created_at", "updated_at",
  ]);
  for (const planValue of ["s2s-plan-basic", "s2s-plan-plus"]) {
    assert.throws(() => normalizeSyntheticPlan(plan([row], [{
      ...entitlement, plan: planValue,
    }])), { code: "stage2_plan_mapping_denied" });
  }
  // Control: the target's own plan values still pass, proving the gate is
  // about the missing mapping, not a blanket plan rejection.
  assert.equal(normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "monthly",
  }])).tables[1].rows[0].plan, "monthly");
  assert.equal(normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "annual",
  }])).tables[1].rows[0].plan, "annual");
});

test("S2-WIRE-4: source 'suspended' entitlement status is rejected, never coerced to expired", () => {
  const row = { ...accountExport };
  assert.throws(() => normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "monthly", status: "suspended",
  }])), { code: "stage2_suspended_status_denied" });
  // Control: a genuinely expired entitlement passes with its own status
  // preserved -- the rejection above is not a blanket status denial and
  // no input was rewritten to expired along the way.
  const expired = normalizeSyntheticPlan(plan([row], [{
    ...entitlement, plan: "monthly", status: "expired",
  }]));
  assert.equal(expired.tables[1].rows[0].status, "expired");
});

test("S2-WIRE-5: credential-version domain does not cross the D1 loader boundary", () => {
  assert.deepEqual(exportableColumns("platform_portal_edge_credentials"), [
    "request_id", "edge_channel_ref", "ordinal",
  ]);
  for (const tableName of ["platform_portal_edge_credentials", "platform_credential_versions"]) {
    assert.throws(() => normalizeSyntheticPlan({
      runId: "s2s-run-cred-001", snapshotId: "s2s-snapshot-cred-001",
      batchSize: 1, tables: [{
        name: tableName,
        rows: tableName === "platform_portal_edge_credentials"
          ? [{ request_id: "s2s-request-001", edge_channel_ref: "s2s-channel-a", ordinal: 0 }]
          : [{ credential_pk: "s2s-request-001|s2s-channel-a", version: 1, deleted: 0 }],
      }],
    }), { code: "stage2_credential_version_denied" });
  }
  // A credential table smuggled in as the second table of an otherwise
  // valid plan is rejected the same way.
  assert.throws(() => normalizeSyntheticPlan({
    runId: "s2s-run-cred-002", snapshotId: "s2s-snapshot-cred-002",
    batchSize: 1, tables: [
      { name: "platform_accounts", rows: [accountExport] },
      { name: "platform_credential_versions",
        rows: [{ credential_pk: "s2s-request-001|s2s-channel-a", version: 1, deleted: 0 }] },
    ],
  }), { code: "stage2_credential_version_denied" });
});

test("S2-WIRE-6 (guard, not a Card 14 fix): other source-only entitlement statuses are still rejected, account suspended still passes", () => {
  // 'revoked' is a source entitlement status the target does not allow.
  // It was already rejected before Card 14 and stays rejected (generic
  // code, no silent mapping). Recorded here so the boundary is explicit;
  // it is NOT a fifth Card 14 incompatibility.
  assert.throws(() => normalizeSyntheticPlan(plan([accountExport], [{
    ...entitlement, plan: "monthly", status: "revoked",
  }])), { code: "stage2_real_rows_denied" });
  // Account-level suspended is supported on BOTH sides and is unaffected
  // by the entitlement suspended rejection in S2-WIRE-4.
  const suspendedAccount = normalizeSyntheticPlan(plan([{
    ...accountExport, status: "suspended",
  }]));
  assert.equal(suspendedAccount.tables[0].rows[0].status, "suspended");
});
