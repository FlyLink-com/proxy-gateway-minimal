// Shared test harness: builds a Miniflare instance running the real
// Worker entrypoint against a fresh local D1 database, applies the real
// migration files in filename order, and seeds an obviously synthetic
// fixture.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

export const READ_TOKEN = "synth-test-read-token";
export const WRITE_TOKEN = "synth-test-write-token";

const workerEntrypoint = fileURLToPath(new URL("../src/index.mjs", import.meta.url));
const migrationPaths = [
  fileURLToPath(new URL("../migrations/0001_accounts_slice.sql", import.meta.url)),
  fileURLToPath(new URL("../migrations/0002_write_idempotency.sql", import.meta.url)),
];

export async function applyMigration(db) {
  for (const migrationPath of migrationPaths) {
    const sql = await readFile(migrationPath, "utf8");
    // Apply statement-by-statement through prepared statements: the local
    // Miniflare D1 exec() path mishandles these multi-statement files,
    // while batch() applies the identical statements atomically.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    if (statements.length === 0) throw new Error("migration file has no statements");
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
}

// Pagination fixture: 12 accounts with deliberate same-timestamp groups
// (5 at T1, 4 at T2) plus three distinct timestamps, mirroring the seed
// shapes used by the G2 stage-7 pagination receipt.
export const FIXTURE_ACCOUNTS = [
  { id: "acct-pg-101", status: "active", createdAt: "2026-03-01T10:00:00.000Z" },
  { id: "acct-pg-102", status: "active", createdAt: "2026-03-01T10:00:00.000Z" },
  { id: "acct-pg-103", status: "suspended", createdAt: "2026-03-01T10:00:00.000Z" },
  { id: "acct-pg-104", status: "active", createdAt: "2026-03-01T10:00:00.000Z" },
  { id: "acct-pg-105", status: "active", createdAt: "2026-03-01T10:00:00.000Z" },
  { id: "acct-pg-106", status: "active", createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "acct-pg-107", status: "active", createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "acct-pg-108", status: "suspended", createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "acct-pg-109", status: "active", createdAt: "2026-02-01T10:00:00.000Z" },
  { id: "acct-pg-110", status: "active", createdAt: "2026-01-15T08:30:00.000Z" },
  { id: "acct-pg-111", status: "active", createdAt: "2026-01-10T08:30:00.000Z" },
  { id: "acct-pg-112", status: "disabled", createdAt: "2025-12-01T00:00:00.000Z" },
];

// Expected directory order under the contract: created_at DESC, id DESC.
export const EXPECTED_ORDER = [...FIXTURE_ACCOUNTS]
  .sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  })
  .map((row) => row.id);

export async function seedFixture(db) {
  const statements = FIXTURE_ACCOUNTS.map((row, index) =>
    db
      .prepare(
        `INSERT INTO platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        `owner-synth-${index + 1}`,
        row.status,
        row.createdAt,
        row.createdAt,
        '{"registrationSource":"self_service_portal"}',
      ),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO platform_portal_second_factor_challenges
           (id, account_id, challenge_hash, allowed_factors_json, status, failure_count, expires_at, used_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "chal-pg-001",
        "acct-pg-101",
        "synth-challenge-hash-pg-001",
        '["totp"]',
        "active",
        0,
        "2026-03-01T10:10:00.000Z",
        null,
        "2026-03-01T10:00:00.000Z",
        "2026-03-01T10:00:00.000Z",
      ),
  );
  await db.batch(statements);
}

export async function createWorker({ withToken = true, withWriteToken = true, seed = true } = {}) {
  const bindings = {};
  if (withToken) bindings.CONTROL_PLANE_READ_TOKEN = READ_TOKEN;
  if (withWriteToken) bindings.CONTROL_PLANE_WRITE_TOKEN = WRITE_TOKEN;
  const mf = new Miniflare({
    modules: true,
    scriptPath: workerEntrypoint,
    compatibilityDate: "2025-06-01",
    d1Databases: { CONTROL_DB: "flylink-control-dev-test" },
    bindings,
  });
  const db = await mf.getD1Database("CONTROL_DB");
  await applyMigration(db);
  if (seed) await seedFixture(db);
  return { mf, db };
}

export function authHeaders() {
  return { authorization: `Bearer ${READ_TOKEN}` };
}

export function writeAuthHeaders(idempotencyKey) {
  const headers = {
    authorization: `Bearer ${WRITE_TOKEN}`,
    "content-type": "application/json",
  };
  if (idempotencyKey !== undefined) headers["idempotency-key"] = idempotencyKey;
  return headers;
}
