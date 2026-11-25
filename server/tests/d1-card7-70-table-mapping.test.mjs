// D1 Card 7 — 70-table mapping tests (P/Q fixes; synthetic data only).
//
// P (#904 r4657005808): platform_edge_apply_receipts listener_present /
// credential_count are DEFER (E4-side receipt metadata, not source
// facts), aligned with the load executor's CARD6-3.3-#6/#7 DEFER.
// Q (#904 r4657005812): platform_portal_edge_credentials carries its
// composite key (request_id, edge_channel_ref) as pk:true, so keyset
// pagination no longer falls back to request_id alone and drops rows
// when one request_id spans several channels.
// Q follow-up: the same zero-pk defect covered three more composite-PK
// tables in the load set — platform_quota_counters
// (account_id, entitlement_id, metric, period), platform_referral_policies
// (policy_ref, version), platform_usage_counter_cursors
// (source_ref, channel_ref, edge_credential_ref) — each now carries its
// composite key as pk:true, with the same pagination proof below.

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  tableMappingFor,
} from "../services/platform/d1-card7-70-table-mapping.mjs";
import {
  pkColumnsFor,
  readSourcePage,
  targetColumnsFor,
  transformRow,
} from "../services/platform/d1-card7-70-table-importer.mjs";
import {
  createSyntheticFixtureDb,
} from "../services/platform/d1-card7-synthetic-fixture.mjs";

const GATES_OPEN = {
  legacyArchiveQ6: true,
  desiredStatesD2: true,
  linkResetsD2: true,
  ledgerDetermination: "H1",
  passwordHandlingApproved: true,
};

test("P: listener_present / credential_count are DEFER, not KEEP", () => {
  const mapping = tableMappingFor("platform_edge_apply_receipts");
  const byName = new Map(mapping.columns.map((c) => [c.name, c]));
  for (const name of ["listener_present", "credential_count"]) {
    assert.equal(byName.get(name).disposition, "DEFER", `${name} must be DEFER`);
  }
  // The importer honors DEFER: the columns never reach D1.
  assert.ok(!targetColumnsFor("platform_edge_apply_receipts").includes("listener_present"));
  assert.ok(!targetColumnsFor("platform_edge_apply_receipts").includes("credential_count"));
});

test("P: a receipt row loads with the other drift columns intact and the two DEFER columns dropped", () => {
  const db = createSyntheticFixtureDb(new DatabaseSync(":memory:"));
  const row = db.prepare('SELECT * FROM "platform_edge_apply_receipts" ORDER BY rowid LIMIT 1 OFFSET 1').get();
  assert.equal(row.listener_present, 1);
  assert.equal(row.credential_count, 2147483647);
  const res = transformRow({ table: "platform_edge_apply_receipts", row, gates: GATES_OPEN });
  assert.equal(res.deferred, null);
  assert.equal(res.rejected, null);
  assert.equal(res.row.generation, "007");
  assert.equal(res.row.node_ref, "synth-node-001");
  assert.ok(!("listener_present" in res.row));
  assert.ok(!("credential_count" in res.row));
});

test("Q: platform_portal_edge_credentials carries the composite key (request_id, edge_channel_ref)", () => {
  assert.deepEqual(
    pkColumnsFor("platform_portal_edge_credentials"),
    ["request_id", "edge_channel_ref"],
  );
  const mapping = tableMappingFor("platform_portal_edge_credentials");
  const byName = new Map(mapping.columns.map((c) => [c.name, c]));
  assert.equal(byName.get("request_id").pk, true);
  assert.equal(byName.get("edge_channel_ref").pk, true);
  assert.equal(byName.get("edge_credential_ref").pk, false);
  assert.equal(byName.get("edge_material_digest").pk, false);
  assert.equal(byName.get("ordinal").pk, false);
});

test("Q: keyset pagination returns every row when one request_id spans several channels (small-batch load check)", () => {
  const db = createSyntheticFixtureDb(new DatabaseSync(":memory:"));
  // The fixture holds 2 rows; add rows that share request_id across
  // channels — the exact shape the request_id-only fallback dropped.
  const insert = db.prepare(
    `INSERT INTO "platform_portal_edge_credentials"
      (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const extra = [];
  for (const [requestId, channel] of [
    ["synth-shared-request", "synth-channel-a"],
    ["synth-shared-request", "synth-channel-b"],
    ["synth-shared-request", "synth-channel-c"],
    ["synth-other-request", "synth-channel-a"],
  ]) {
    insert.run(requestId, channel, `synth-cred-${requestId}-${channel}`, `synth-digest-${requestId}-${channel}`, 0);
    extra.push(`${requestId}|${channel}`);
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM "platform_portal_edge_credentials"').get().n;
  assert.equal(total, 6);

  // Page through with a small limit, keyed on the composite PK.
  const seen = [];
  let afterPk = null;
  for (;;) {
    const page = readSourcePage(db, "platform_portal_edge_credentials", { afterPk, limit: 2 });
    if (page.length === 0) break;
    for (const row of page) seen.push(`${row.request_id}|${row.edge_channel_ref}`);
    const last = page[page.length - 1];
    afterPk = [last.request_id, last.edge_channel_ref];
    if (page.length < 2) break;
  }
  assert.equal(seen.length, total, "every row must be returned exactly once");
  assert.equal(new Set(seen).size, total, "no row may repeat or drop");
  for (const key of extra) assert.ok(seen.includes(key), `shared-request row must survive pagination: ${key}`);
  // And the rows arrive in composite-PK order.
  assert.deepEqual(seen, [...seen].sort());
});

// Q follow-up: the three further composite-PK tables that carried zero
// pk:true columns (same defect class as Q). Keys verified against the
// source DDL and the load executor's composite-PK list:
// - platform_quota_counters: subscription-control-db.mjs
//   PRIMARY KEY (account_id, entitlement_id, metric, period)
// - platform_referral_policies: portal-referral-migrations.mjs
//   primary key(policy_ref, version)
// - platform_usage_counter_cursors: subscription-control-db.mjs
//   primary key (source_ref, channel_ref, edge_credential_ref)
const Q_FOLLOWUP_TABLES = [
  {
    table: "platform_quota_counters",
    pk: ["account_id", "entitlement_id", "metric", "period"],
    nonPk: ["amount", "updated_at"],
    extraRows: [
      { account_id: "synth-shared-account", entitlement_id: "synth-ent-a", metric: "upload", period: "2026-11", amount: 1, updated_at: "2026-11-25T00:00:00.000Z" },
      { account_id: "synth-shared-account", entitlement_id: "synth-ent-a", metric: "download", period: "2026-11", amount: 2, updated_at: "2026-11-25T00:00:00.000Z" },
      { account_id: "synth-shared-account", entitlement_id: "synth-ent-b", metric: "upload", period: "2026-11", amount: 3, updated_at: "2026-11-25T00:00:00.000Z" },
      { account_id: "synth-other-account", entitlement_id: "synth-ent-a", metric: "upload", period: "2026-11", amount: 4, updated_at: "2026-11-25T00:00:00.000Z" },
    ],
  },
  {
    table: "platform_referral_policies",
    pk: ["policy_ref", "version"],
    nonPk: ["effective_at", "policy_json", "digest"],
    extraRows: [
      { policy_ref: "synth-shared-policy", version: 1, effective_at: "2026-11-25T00:00:00.000Z", policy_json: "{}", digest: "synth-digest-1" },
      { policy_ref: "synth-shared-policy", version: 2, effective_at: "2026-11-25T00:00:00.000Z", policy_json: "{}", digest: "synth-digest-2" },
      { policy_ref: "synth-shared-policy", version: 3, effective_at: "2026-11-25T00:00:00.000Z", policy_json: "{}", digest: "synth-digest-3" },
      { policy_ref: "synth-other-policy", version: 1, effective_at: "2026-11-25T00:00:00.000Z", policy_json: "{}", digest: "synth-digest-4" },
    ],
  },
  {
    table: "platform_usage_counter_cursors",
    pk: ["source_ref", "channel_ref", "edge_credential_ref"],
    nonPk: ["upload_bytes", "download_bytes", "observed_at", "epoch", "updated_at"],
    extraRows: [
      { source_ref: "synth-shared-source", channel_ref: "synth-channel-a", edge_credential_ref: "synth-cred-a", upload_bytes: 1, download_bytes: 1, observed_at: "2026-11-25T00:00:00.000Z", epoch: 1, updated_at: "2026-11-25T00:00:00.000Z" },
      { source_ref: "synth-shared-source", channel_ref: "synth-channel-a", edge_credential_ref: "synth-cred-b", upload_bytes: 2, download_bytes: 2, observed_at: "2026-11-25T00:00:00.000Z", epoch: 1, updated_at: "2026-11-25T00:00:00.000Z" },
      { source_ref: "synth-shared-source", channel_ref: "synth-channel-b", edge_credential_ref: "synth-cred-a", upload_bytes: 3, download_bytes: 3, observed_at: "2026-11-25T00:00:00.000Z", epoch: 1, updated_at: "2026-11-25T00:00:00.000Z" },
      { source_ref: "synth-other-source", channel_ref: "synth-channel-a", edge_credential_ref: "synth-cred-a", upload_bytes: 4, download_bytes: 4, observed_at: "2026-11-25T00:00:00.000Z", epoch: 1, updated_at: "2026-11-25T00:00:00.000Z" },
    ],
  },
];

for (const { table, pk, nonPk } of Q_FOLLOWUP_TABLES) {
  test(`Q follow-up: ${table} carries the composite key (${pk.join(", ")})`, () => {
    assert.deepEqual(pkColumnsFor(table), pk);
    const mapping = tableMappingFor(table);
    const byName = new Map(mapping.columns.map((c) => [c.name, c]));
    for (const name of pk) assert.equal(byName.get(name).pk, true, `${name} must be pk:true`);
    for (const name of nonPk) assert.equal(byName.get(name).pk, false, `${name} must stay pk:false`);
  });
}

for (const { table, pk, extraRows } of Q_FOLLOWUP_TABLES) {
  test(`Q follow-up: keyset pagination returns every ${table} row when the first PK column is shared`, () => {
    const db = createSyntheticFixtureDb(new DatabaseSync(":memory:"));
    // The fixture holds 2 rows; add rows that share the first PK column —
    // the exact shape the first-column-only fallback dropped.
    const extraKeys = [];
    for (const row of extraRows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(
        `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
      ).run(...cols.map((c) => row[c]));
      extraKeys.push(pk.map((c) => String(row[c])).join("|"));
    }
    const total = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    assert.equal(total, 2 + extraRows.length);

    // Page through with a small limit, keyed on the composite PK.
    const seen = [];
    let afterPk = null;
    for (;;) {
      const page = readSourcePage(db, table, { afterPk, limit: 2 });
      if (page.length === 0) break;
      for (const row of page) seen.push(pk.map((c) => String(row[c])).join("|"));
      const last = page[page.length - 1];
      afterPk = pk.map((c) => last[c]);
      if (page.length < 2) break;
    }
    assert.equal(seen.length, total, "every row must be returned exactly once");
    assert.equal(new Set(seen).size, total, "no row may repeat or drop");
    for (const key of extraKeys) assert.ok(seen.includes(key), `shared-first-column row must survive pagination: ${key}`);
    // And the rows arrive in composite-PK order.
    assert.deepEqual(seen, [...seen].sort());
  });
}
