import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const evidenceUrl = new URL("../../../docs/evidence/D1_STAGE2A_E4_COLUMNS_METADATA_20261120.json", import.meta.url);
const inventoryUrl = new URL("../../../docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json", import.meta.url);
const dispositionUrl = new URL("../../../docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json", import.meta.url);

const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const sorted = values => [...values].sort();

test("Stage2 read-only E4 evidence has explicit provenance and zero row values", async () => {
  const evidence = await read(evidenceUrl);
  assert.equal(evidence.artifact, "D1_STAGE2A_E4_COLUMNS_METADATA_20261120");
  assert.equal(evidence.readOnly, true);
  assert.equal(evidence.e4RowDataCaptured, false);
  assert.equal(evidence.e4DatabaseId, "05732071-22a5-4e04-834c-f5dd4407a462");
  assert.equal(evidence.productionWriter, "BWH");
  assert.equal(evidence.sourceBaseline, "015fae70c47bb29534bc1c9b5fae15d5d2ea020b");
  assert.equal(evidence.tables.length, 85);
  assert.equal(evidence.tables.reduce((n, t) => n + t.columns.length, 0), 951);
  for (const table of evidence.tables) {
    assert.deepEqual(Object.keys(table).sort(), ["columns", "name"]);
    assert.ok(Array.isArray(table.columns));
    assert.equal(new Set(table.columns).size, table.columns.length);
    assert.ok(table.columns.every(c => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c)));
  }
});

test("Stage2 schema snapshot reconciles exact source/target names with 2 conditional absences", async () => {
  const [evidence, source, disposition] = await Promise.all([
    read(evidenceUrl), read(inventoryUrl), read(dispositionUrl),
  ]);
  const src = new Set(source.tables.map(t => t.name));
  const target = new Set(evidence.tables.map(t => t.name));
  assert.equal(src.size, 70);
  assert.equal(target.size, 85);
  const sourceOnly = sorted([...src].filter(t => !target.has(t)));
  const targetOnly = sorted([...target].filter(t => !src.has(t)));
  assert.deepEqual(sourceOnly, sorted([
    "platform_ads_consent_decisions", "platform_ads_click_consent_claims",
  ]));
  assert.deepEqual(sourceOnly, sorted(evidence.sourceOnly));
  assert.equal(targetOnly.length, 17);
  assert.deepEqual(targetOnly, sorted(evidence.targetOnly));
  assert.equal([...src].filter(t => target.has(t)).length, 68);
  for (const name of sourceOnly) {
    assert.equal(disposition.tables.find(t => t.name === name).disposition, "CONDITIONAL");
  }
  assert.equal(disposition.approvalState, "ALL_FIELD_ROWS_PROPOSAL_PENDING_REVIEW");
});

test("Stage2 column name drift remains visible; payment capabilities never silently copied", async () => {
  const [evidence, source] = await Promise.all([read(evidenceUrl), read(inventoryUrl)]);
  const remote = new Map(evidence.tables.map(t => [t.name, t.columns]));
  const diff = source.tables.filter(t => remote.has(t.name)).map(table => {
    const a = table.columns.map(c => c.name);
    const b = remote.get(table.name);
    return { table: table.name, sourceOnly: a.filter(x => !b.includes(x)),
      targetOnly: b.filter(x => !a.includes(x)) };
  }).filter(x => x.sourceOnly.length || x.targetOnly.length);
  assert.equal(diff.length, 2);
  assert.deepEqual(diff, evidence.sharedColumnDiffs);
  assert.deepEqual(diff.find(x => x.table === "platform_payment_orders_legacy_archive_20260803").sourceOnly,
    ["checkout_url", "checkout_qr_code"]);
  assert.deepEqual(diff.find(x => x.table === "platform_edge_apply_receipts").targetOnly, [
    "node_ref", "generation", "receipt_digest", "reason_code", "listener_present", "credential_count",
  ]);
  assert.equal(source.tables.filter(t => remote.has(t.name)).length - diff.length, 66);
});

test("Stage2 E4-only objects stay distinct from source 70-table candidate scope", async () => {
  const evidence = await read(evidenceUrl);
  const targetOnly = new Set(evidence.targetOnly);
  const agentOnly = [...targetOnly].filter(n => n.startsWith("agent_"));
  assert.equal(agentOnly.length, 9);
  assert.equal(targetOnly.size, 17);
  assert.equal(evidence.counts.sourceTables, 70);
  assert.equal(evidence.counts.targetTables, 85);
  assert.equal(evidence.counts.sharedDiffering, 2);
  assert.ok(!targetOnly.has("platform_writer_authority"));
  assert.ok(!targetOnly.has("platform_writer_gate"));
});
