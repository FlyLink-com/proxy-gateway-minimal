// Local-synthetic D1 repository for opaque Auth0 subject-to-account bindings.
// This slice stores no email, display name, password, provider token or digest.

import {
  createD1IdentityBindingRecord,
  planD1IdentityBinding,
  resolveD1IdentityBinding,
} from "../../../../server/services/platform/d1-t2-identity-boundary.mjs";
import { randomBase64Url } from "../digests.mjs";

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
    revokedAtMs: row.revoked_at_ms === null ? null : Number(row.revoked_at_ms),
  };
}

function writeError() {
  const error = new Error("identity_binding_write_failed");
  error.code = "identity_binding_write_failed";
  return error;
}

export class IdentityBindingRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") {
      throw new TypeError("IdentityBindingRepository requires a D1Database binding");
    }
    this.db = db;
  }

  async findCandidates({ issuerRef, subjectRef, accountRef }) {
    const { results } = await this.db
      .prepare(
        `SELECT ${PROJECTION}
           FROM platform_identity_bindings
          WHERE status = 'active'
            AND ((issuer_ref = ? AND subject_ref = ?) OR account_id = ?)`,
      )
      .bind(issuerRef, subjectRef, accountRef)
      .all();
    return results.map(fromRow);
  }

  async resolve({ issuerRef, subjectRef, expectedAccountRef } = {}) {
    assertIssuerRef(issuerRef);
    const { results } = await this.db
      .prepare(
        `SELECT ${PROJECTION}
           FROM platform_identity_bindings
          WHERE issuer_ref = ? AND subject_ref = ?`,
      )
      .bind(issuerRef, subjectRef)
      .all();
    const resolved = resolveD1IdentityBinding({
      bindings: results.map(fromRow),
      issuerRef,
      subjectRef,
      ...(expectedAccountRef === undefined ? {} : { expectedAccountRef }),
    });
    if (resolved.outcome !== "resolved") return resolved;
    const activeRow = results.find((row) => row.status === "active");
    if (!activeRow || typeof activeRow.id !== "string") return { outcome: "ambiguous" };
    return { ...resolved, bindingId: activeRow.id };
  }

  // This is an internal repository operation for a separately authorized
  // import/link workflow. No public route creates or rebinds identities.
  async createActive(input) {
    const record = createD1IdentityBindingRecord(input);
    assertIssuerRef(record.issuerRef);
    if (record.status !== "active") {
      const error = new Error("identity_binding_new_record_must_be_active");
      error.code = "identity_binding_new_record_must_be_active";
      throw error;
    }
    const plan = planD1IdentityBinding({
      existingBindings: await this.findCandidates(record),
      incomingRecord: record,
    });
    if (plan.outcome !== "create") return plan;

    const id = `idb_${randomBase64Url(24)}`;
    try {
      await this.db
        .prepare(
          `INSERT INTO platform_identity_bindings
             (id, account_id, issuer_ref, subject_ref, status,
              created_at_ms, updated_at_ms, revoked_at_ms)
           VALUES (?, ?, ?, ?, 'active', ?, ?, NULL)`,
        )
        .bind(
          id,
          record.accountRef,
          record.issuerRef,
          record.subjectRef,
          record.createdAtMs,
          record.updatedAtMs,
        )
        .run();
    } catch {
      // The partial unique indexes are the final race-safe guard. Re-read
      // after a conflict so callers get the same fail-closed outcome as
      // the preflight planner rather than a raw SQLite error.
      const retry = planD1IdentityBinding({
        existingBindings: await this.findCandidates(record),
        incomingRecord: record,
      });
      if (retry.outcome !== "create") return retry;
      throw writeError();
    }
    return { outcome: "created", id, binding: record };
  }

  async revoke({ id, revokedAtMs } = {}) {
    if (typeof id !== "string" || !ID_PATTERN.test(id)
      || !Number.isSafeInteger(revokedAtMs) || revokedAtMs < 0) {
      const error = new Error("identity_binding_revoke_invalid");
      error.code = "identity_binding_revoke_invalid";
      throw error;
    }
    const row = await this.db
      .prepare(`SELECT created_at_ms FROM platform_identity_bindings WHERE id = ? AND status = 'active'`)
      .bind(id)
      .first();
    if (!row) return false;
    if (revokedAtMs < Number(row.created_at_ms)) {
      const error = new Error("identity_binding_timestamp_invalid");
      error.code = "identity_binding_timestamp_invalid";
      throw error;
    }
    const result = await this.db
      .prepare(
        `UPDATE platform_identity_bindings
            SET status = 'revoked', updated_at_ms = ?, revoked_at_ms = ?
          WHERE id = ? AND status = 'active'`,
      )
      .bind(revokedAtMs, revokedAtMs, id)
      .run();
    return Number(result.meta?.changes ?? 0) === 1;
  }
}
