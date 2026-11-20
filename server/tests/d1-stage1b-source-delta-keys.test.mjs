import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  buildCheckpointManifest,
  enumerateSourceDeltas,
} from "../services/platform/source-delta.mjs";

test("source delta rejects a projection that is not the declared single-column primary key", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE composite (tenant TEXT, id TEXT, PRIMARY KEY (tenant, id));
    INSERT INTO composite VALUES ('first', 'shared'), ('second', 'shared');
    CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT);
    INSERT INTO items VALUES ('one', 'shared'), ('two', 'shared');
    CREATE TABLE untyped (id PRIMARY KEY);
    INSERT INTO untyped VALUES (7), ('7');
  `);

  for (const spec of [
    { table: "composite", pk: "id" },
    { table: "items", pk: "label" },
    { table: "untyped", pk: "id" },
  ]) {
    const tables = [spec];
    assert.throws(() => buildCheckpointManifest(db, { tables, snapshotId: "synth" }), {
      code: "delta_pk_unsupported",
    });
    const checkpoint = { snapshotId: "synth", tables: { [spec.table]: {} } };
    assert.throws(() => enumerateSourceDeltas(db, { tables, checkpoint }), {
      code: "delta_pk_unsupported",
    });
  }
});

test("source delta round-trips a literal prototype-like key in manifest JSON", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT);
    INSERT INTO items VALUES ('__proto__', 'original');
  `);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = JSON.parse(JSON.stringify(buildCheckpointManifest(db, { tables, snapshotId: "synth" })));
  assert.deepEqual(Object.keys(checkpoint.tables.items), ["__proto__"]);
  const unchanged = enumerateSourceDeltas(db, { tables, checkpoint });
  assert.deepEqual(unchanged.summary, { tables: 1, inserted: 0, updated: 0, deleted: 0 });

  db.prepare("UPDATE items SET label = ? WHERE id = ?").run("updated", "__proto__");
  const delta = enumerateSourceDeltas(db, { tables, checkpoint });
  assert.deepEqual(delta.tables[0].updated.map((row) => row.pk), ["__proto__"]);
  assert.deepEqual(delta.summary, { tables: 1, inserted: 0, updated: 1, deleted: 0 });
});

test("source delta rejects malformed fingerprints before producing a delta", (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT)");
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = { snapshotId: "synth", tables: { items: { removed: "not-a-fingerprint" } } };
  assert.throws(() => enumerateSourceDeltas(db, { tables, checkpoint }), {
    code: "delta_checkpoint_invalid",
  });
});
