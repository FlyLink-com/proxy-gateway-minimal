// Transaction-fenced D1 adapter for the G4 Agent HTTP request boundary.
//
// Every mutation issued through this adapter starts a *single* D1 batch with
// the epoch gate as its first statement. It does not rely on a stale
// request-time check alone and does not mutate Worker-wide state.
//
// This adapter intentionally does not implement exec(), sessions, or arbitrary
// D1 extensions; newly introduced mutation APIs must be reviewed rather
// than silently bypassing the fence.
import {
  WriterAuthorityRepository,
  WriterAuthorityError,
  classifyAuthorityBatchFailure,
} from "./writer-authority.mjs";

const PREPARED = Symbol("fenced-d1-prepared");

function isPlainSelect(sql) {
  if (typeof sql !== "string") return false;
  const trimmed = sql.trim();
  // Fail closed on CTE/DML/PRAGMA, comments or compound SQL. Agent routes use
  // ordinary SELECT reads, and D1 prepare() should get one statement only.
  return /^SELECT(?:\s|$)/iu.test(trimmed) && !/;/u.test(trimmed);
}

export function createEpochFencedD1(db, epoch) {
  const authority = new WriterAuthorityRepository(db);
  // This validates numeric format but does NOT enable the writer. The caller
  // must do the per-request authority preflight separately; the DB trigger is
  // authoritative when the actual write transaction begins.
  authority.gateStatement(epoch);

  async function gatedBatch(statements) {
    if (!Array.isArray(statements) || statements.length === 0) {
      throw new WriterAuthorityError("writer_batch_invalid");
    }
    const values = [];
    let mutation = false;
    for (const statement of statements) {
      const meta = statement?.[PREPARED];
      if (!meta || meta.owner !== db) {
        throw new WriterAuthorityError("writer_unfenced_statement_denied");
      }
      values.push(meta.statement);
      if (!meta.readOnly) mutation = true;
    }
    if (!mutation) return db.batch(values);
    try {
      const results = await db.batch([authority.gateStatement(epoch), ...values]);
      return results.slice(1);
    } catch (error) {
      throw classifyAuthorityBatchFailure(error) ?? error;
    }
  }

  function wrappedPrepared(statement, sql) {
    const readOnly = isPlainSelect(sql);
    const prepared = {
      [PREPARED]: { owner: db, statement, readOnly },
      bind(...values) {
        return wrappedPrepared(statement.bind(...values), sql);
      },
      async run() {
        if (readOnly) return statement.run();
        const result = await gatedBatch([this]);
        return result[0];
      },
      all() {
        if (!readOnly) throw new WriterAuthorityError("writer_query_method_denied");
        return statement.all();
      },
      first(column) {
        if (!readOnly) throw new WriterAuthorityError("writer_query_method_denied");
        return column === undefined ? statement.first() : statement.first(column);
      },
      raw() {
        if (!readOnly) throw new WriterAuthorityError("writer_query_method_denied");
        return statement.raw();
      },
    };
    return prepared;
  }

  return {
    prepare(sql) {
      if (typeof sql !== "string" || !sql.trim()) {
        throw new WriterAuthorityError("writer_statement_invalid");
      }
      return wrappedPrepared(db.prepare(sql), sql);
    },
    batch: gatedBatch,
    exec() {
      throw new WriterAuthorityError("writer_unfenced_exec_denied");
    },
  };
}
