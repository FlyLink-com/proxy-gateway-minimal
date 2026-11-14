// Server-side (better-sqlite3) mirror of the Worker IdentityBindingRepository
// (#864 slice). B2-2, scope S: the binding store holds only opaque issuer /
// subject references and an opaque account id. No email, display name,
// password, provider token or digest is stored here, and no email scan is
// ever performed. Production target DDL remains gated by T3; the live portal
// login still uses resolvePortalLoginAccount, and switching traffic to the
// binding resolver needs separate authorization.

import { randomBytes } from "node:crypto";
import {
  createD1IdentityBindingRecord,
  planD1IdentityBinding,
  resolveD1IdentityBinding
} from "./d1-t2-identity-boundary.mjs";

const PROJECTION = "id, account_id, issuer_ref, subject_ref, status, created_at_ms, updated_at_ms, revoked_at_ms";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const ALLOWED_ISSUER_REFS = new Set(["portal", "admin"]);

function assertIssuerRef(issuerRef) {
  if (!ALLOWED_ISSUER_REFS.has(issuerRef)) {
    const error = new Error("identity_binding_issuer_invalid");
    error.code = "identity_binding_issuer_invalid";
    throw error;
  }
}

function fromRow(row) {
  return {
    accountRef: row.account_id,
    issuerRef: row.issuer_ref,
    subjectRef: row.subject_ref,
    status: row.status,
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    revokedAtMs: row.revoked_at_ms === null ? null : Number(row.revoked_at_ms)
  };
}

function writeError() {
  const error = new Error("identity_binding_write_failed");
  error.code = "identity_binding_write_failed";
  return error;
}

function newBindingId() {
  return `idb_${randomBytes(24).toString("base64url")}`;
}

export class IdentityBindingRepository {
  constructor(database) {
    if (!database || typeof database.prepare !== "function") {
      throw new TypeError("IdentityBindingRepository requires a better-sqlite3 database");
    }
    this.db = database;
  }

  findCandidates({ issuerRef, subjectRef, accountRef }) {
    const rows = this.db.prepare(
      `SELECT ${PROJECTION}
         FROM platform_identity_bindings
        WHERE status = 'active'
          AND ((issuer_ref = ? AND subject_ref = ?) OR account_id = ?)`
    ).all(issuerRef, subjectRef, accountRef);
    return rows.map(fromRow);
  }

  resolve({ issuerRef, subjectRef, expectedAccountRef } = {}) {
    assertIssuerRef(issuerRef);
    const rows = this.db.prepare(
      `SELECT ${PROJECTION}
         FROM platform_identity_bindings
        WHERE issuer_ref = ? AND subject_ref = ?`
    ).all(issuerRef, subjectRef);
    const resolved = resolveD1IdentityBinding({
      bindings: rows.map(fromRow),
      issuerRef,
      subjectRef,
      ...(expectedAccountRef === undefined ? {} : { expectedAccountRef })
    });
    if (resolved.outcome !== "resolved") return resolved;
    const activeRow = rows.find((row) => row.status === "active");
    if (!activeRow || typeof activeRow.id !== "string") return { outcome: "ambiguous" };
    return { ...resolved, bindingId: activeRow.id };
  }

  // This is an internal repository operation for a separately authorized
  // import/link workflow. No public route creates or rebinds identities.
  createActive(input) {
    const record = createD1IdentityBindingRecord(input);
    assertIssuerRef(record.issuerRef);
    if (record.status !== "active") {
      const error = new Error("identity_binding_new_record_must_be_active");
      error.code = "identity_binding_new_record_must_be_active";
      throw error;
    }
    const plan = planD1IdentityBinding({
      existingBindings: this.findCandidates(record),
      incomingRecord: record
    });
    if (plan.outcome !== "create") return plan;

    const id = newBindingId();
    try {
      this.db.prepare(
        `INSERT INTO platform_identity_bindings
           (id, account_id, issuer_ref, subject_ref, status,
            created_at_ms, updated_at_ms, revoked_at_ms)
         VALUES (?, ?, ?, ?, 'active', ?, ?, NULL)`
      ).run(
        id,
        record.accountRef,
        record.issuerRef,
        record.subjectRef,
        record.createdAtMs,
        record.updatedAtMs
      );
    } catch {
      // The partial unique indexes are the final race-safe guard. Re-read
      // after a conflict so callers get the same fail-closed outcome as
      // the preflight planner rather than a raw SQLite error.
      const retry = planD1IdentityBinding({
        existingBindings: this.findCandidates(record),
        incomingRecord: record
      });
      if (retry.outcome !== "create") return retry;
      throw writeError();
    }
    return { outcome: "created", id, binding: record };
  }

  revoke({ id, revokedAtMs } = {}) {
    if (typeof id !== "string" || !ID_PATTERN.test(id)
      || !Number.isSafeInteger(revokedAtMs) || revokedAtMs < 0) {
      const error = new Error("identity_binding_revoke_invalid");
      error.code = "identity_binding_revoke_invalid";
      throw error;
    }
    const row = this.db.prepare(
      "SELECT created_at_ms FROM platform_identity_bindings WHERE id = ? AND status = 'active'"
    ).get(id);
    if (!row) return false;
    if (revokedAtMs < Number(row.created_at_ms)) {
      const error = new Error("identity_binding_timestamp_invalid");
      error.code = "identity_binding_timestamp_invalid";
      throw error;
    }
    const result = this.db.prepare(
      `UPDATE platform_identity_bindings
          SET status = 'revoked', updated_at_ms = ?, revoked_at_ms = ?
        WHERE id = ? AND status = 'active'`
    ).run(revokedAtMs, revokedAtMs, id);
    return Number(result.changes ?? 0) === 1;
  }
}
