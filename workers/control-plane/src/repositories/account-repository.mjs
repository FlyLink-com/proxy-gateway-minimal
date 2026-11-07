// Asynchronous D1 repository for platform_accounts.
//
// All access uses prepared statements with bound parameters. Reads only
// ever select the safe projection columns (id, status, created_at,
// updated_at); owner_ref and metadata_json are never read by this
// repository, so they cannot leak into an API response.
//
// listDirectory mirrors the verified keyset-pagination contract of
// subscription-control-db.mjs listUserMonitorAccountDirectory, as
// exercised by admin-user-monitor.mjs readAccounts and proven on D1 in
// the G2 stage-7 pagination receipt: rows are ordered
// (created_at DESC, id DESC), the page predicate is
//   created_at < ? OR (created_at = ? AND id < ?),
// and the caller fetches limit + 1 rows so that a surplus row proves a
// next page exists; nextCursor is then the last page row's key tuple,
// otherwise null (including when the final page is exactly full).

import { encodeCursor, decodeCursor } from "../cursor.mjs";

export const ACCOUNT_STATUSES = new Set(["active", "suspended", "disabled"]);

const PROJECTION = "id, status, created_at, updated_at";

function toAccount(row) {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AccountRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") {
      throw new TypeError("AccountRepository requires a D1Database binding");
    }
    this.db = db;
  }

  async findById(accountId) {
    const row = await this.db
      .prepare(`SELECT ${PROJECTION} FROM platform_accounts WHERE id = ?`)
      .bind(accountId)
      .first();
    return row ? toAccount(row) : null;
  }

  // options: { status?: string|null, cursor?: string|null, limit: number }
  // Returns { items, nextCursor } with at most `limit` items.
  async listDirectory({ status = null, cursor = null, limit } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError("listDirectory requires a positive integer limit");
    }
    if (status !== null && !ACCOUNT_STATUSES.has(status)) {
      throw new TypeError(`unknown account status: ${status}`);
    }
    const after = cursor === null || cursor === undefined
      ? null
      : decodeCursor(cursor);
    const afterCreatedAt = after ? after.createdAt : null;
    const afterId = after ? after.id : null;
    const { results } = await this.db
      .prepare(
        `SELECT ${PROJECTION}
           FROM platform_accounts
          WHERE (? IS NULL OR status = ?)
            AND (
              ? IS NULL
              OR created_at < ?
              OR (created_at = ? AND id < ?)
            )
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
      )
      .bind(
        status,
        status,
        afterCreatedAt,
        afterCreatedAt,
        afterCreatedAt,
        afterId,
        limit + 1,
      )
      .all();
    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;
    const items = page.map(toAccount);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    };
  }
}
