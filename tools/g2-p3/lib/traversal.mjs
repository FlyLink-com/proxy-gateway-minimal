// G2-P3: traversal driver, independent simulation, and page analysis.
//
// The page driver mirrors the production read path exactly:
//   coin-wallet-store.mjs listLedgerEntries (verbatim LEDGER_SQL from
//   the fixture) + admin-user-monitor.mjs readCoins service logic
//   (fetch limit+1, hasMore = rows.length > limit, page = first limit,
//   nextCursor = last page row's (occurred_at, entry_ref) tuple).
//
// The simulation is an INDEPENDENT JavaScript model of the same keyset
// semantics (sort by (occurred_at DESC, entry_ref DESC), keyset
// predicate, limit+1 paging, writer schedule applied between pages).
// It is the expectation: engine output must match the simulation on
// both engines. The simulation is written from the keyset predicate
// first principles, not fitted to engine output.

export const WALLET = "wallet-pg-1";

// Service-shaped single page fetch. `query` is (sql, params) => rows
// (sync for SQLite, async for D1 — the caller awaits either way).
export async function fetchPage(query, ledgerSql, { limit, after = null }) {
  const params = [
    WALLET,
    after ? after[0] : null,
    after ? after[0] : null,
    after ? after[0] : null,
    after ? after[1] : null,
    limit + 1,
  ];
  const raw = await query(ledgerSql, params);
  const hasMore = raw.length > limit;
  const page = hasMore ? raw.slice(0, limit) : raw;
  const last = page[page.length - 1];
  return {
    keys: page.map((r) => r.entry_ref),
    rows: page,
    hasMore,
    nextCursor: hasMore && last ? [last.occurred_at, last.entry_ref] : null,
  };
}

// Total order used by the production query: (occurred_at DESC,
// entry_ref DESC). ISO timestamps and ASCII refs sort lexicographically
// the same way in JS string comparison as in SQLite TEXT comparison.
export function keyCompare(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1; // DESC on occurred_at
  if (a[1] !== b[1]) return a[1] < b[1] ? 1 : -1; // DESC on entry_ref
  return 0;
}

export function keyLessThan(a, b) {
  return keyCompare(a, b) > 0; // a sorts AFTER b in DESC order
}

// Independent simulation of a traversal over a mutable key map.
// frozenKeys: ordered (DESC) list of [occurred_at, entry_ref] present
//   at traversal start (the watermark).
// schedule: [{ afterPage, ops: [{ kind: 'insert', ref, occurred_at },
//   { kind: 'update', ref, occurred_at }, { kind: 'delete', ref }] }]
//   applied after the page with that number is fetched.
// Returns { pages, returnedRefs, extras }.
export function simulateWalk(frozenKeys, schedule, pageSize) {
  const rows = new Map(); // ref -> { occurred_at, entry_ref, frozen }
  for (const [occurred_at, entry_ref] of frozenKeys) {
    rows.set(entry_ref, { occurred_at, entry_ref, frozen: true });
  }
  const byPage = new Map();
  for (const s of schedule) {
    if (!byPage.has(s.afterPage)) byPage.set(s.afterPage, []);
    byPage.get(s.afterPage).push(...s.ops);
  }
  const pages = [];
  const returnedRefs = [];
  let cursor = null;
  let pageNum = 0;
  for (let i = 0; i < 200; i++) {
    const sorted = [...rows.values()]
      .filter((r) => cursor === null || keyLessThan([r.occurred_at, r.entry_ref], cursor))
      .sort((a, b) => keyCompare([a.occurred_at, a.entry_ref], [b.occurred_at, b.entry_ref]));
    const raw = sorted.slice(0, pageSize + 1);
    const hasMore = raw.length > pageSize;
    const page = hasMore ? raw.slice(0, pageSize) : raw;
    const keys = page.map((r) => r.entry_ref);
    pages.push(keys);
    returnedRefs.push(...keys);
    pageNum++;
    if (!hasMore) break;
    const last = page[page.length - 1];
    cursor = [last.occurred_at, last.entry_ref];
    for (const op of byPage.get(pageNum) ?? []) {
      if (op.kind === "insert") {
        rows.set(op.ref, { occurred_at: op.occurred_at, entry_ref: op.ref, frozen: false });
      } else if (op.kind === "update") {
        const row = rows.get(op.ref);
        if (row) row.occurred_at = op.occurred_at;
      } else if (op.kind === "delete") {
        rows.delete(op.ref);
      }
    }
  }
  const frozenSet = new Set(frozenKeys.map((k) => k[1]));
  const extras = returnedRefs.filter((r) => !frozenSet.has(r));
  return { pages, returnedRefs, extras };
}

// Multiset analysis of returned refs against the frozen set.
// Returns { counts: {ref: n}, missed: [...], duplicated: {ref: n} }.
export function analyzeReturned(returnedRefs, frozenKeys) {
  const counts = {};
  for (const r of returnedRefs) counts[r] = (counts[r] || 0) + 1;
  const frozenSet = new Set(frozenKeys.map((k) => k[1]));
  const missed = frozenKeys.map((k) => k[1]).filter((r) => !(r in counts));
  const duplicated = {};
  for (const [r, n] of Object.entries(counts)) {
    if (frozenSet.has(r) && n > 1) duplicated[r] = n;
  }
  return { counts, missed, duplicated };
}
