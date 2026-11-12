/**
 * Seeds a pre-existing account model marker for tests that exercise dormant or
 * legacy rows. This deliberately bypasses the public account writer: the
 * production metadata allowlist must continue to reject commercialModel until
 * a separately approved writer/gate exists.
 */
export function seedAccountModelForTest(database, {
  id,
  ownerRef,
  status = "active",
  createdAt,
  updatedAt,
  commercialModel
}) {
  if (!database || typeof database.prepare !== "function") {
    throw new TypeError("a test SQLite database is required");
  }
  if (typeof commercialModel !== "string" || commercialModel.length === 0) {
    throw new TypeError("a non-empty commercialModel fixture value is required");
  }

  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    ownerRef,
    status,
    createdAt,
    updatedAt,
    JSON.stringify({ commercialModel })
  );
}
