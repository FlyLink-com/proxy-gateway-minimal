// Asynchronous D1 repository for the bounded write flow: issuing a
// portal second-factor challenge under an idempotency key.
//
// The write is deliberately narrow — one INSERT into
// platform_portal_second_factor_challenges plus one INSERT into
// platform_write_idempotency_keys, executed as a single D1 batch. D1
// batches are atomic, so the pair lands together or not at all: a
// challenge is never created without its idempotency record, and an
// idempotency record is never stored for a challenge that was not
// created. That atomicity is the failure-recovery property the slice
// exists to prove; the repository-level test forces the second insert
// to fail and observes that the first one is rolled back.
//
// challenge_hash is the SHA-256 hex digest of a random one-time secret.
// The secret itself is never stored and never returned by the API; in a
// production flow it would be handed to the factor-delivery subsystem
// at issuance time, which is out of scope for this local slice.

export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export class ChallengeRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") {
      throw new TypeError("ChallengeRepository requires a D1Database binding");
    }
    this.db = db;
  }

  async findIdempotencyRecord(scope, idempotencyKey) {
    const row = await this.db
      .prepare(
        `SELECT scope, idempotency_key, request_fingerprint, response_status,
                response_body_json, created_at
           FROM platform_write_idempotency_keys
          WHERE scope = ? AND idempotency_key = ?`,
      )
      .bind(scope, idempotencyKey)
      .first();
    return row ?? null;
  }

  // challenge: { id, accountId, challengeHash, allowedFactorsJson,
  //              expiresAt, createdAt }
  // idempotency: { scope, key, fingerprint, responseStatus,
  //                responseBodyJson, createdAt }
  // Throws when either insert fails; the batch guarantees neither row
  // persists in that case.
  async issueChallengeAtomically({ challenge, idempotency }) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO platform_portal_second_factor_challenges
             (id, account_id, challenge_hash, allowed_factors_json, status,
              failure_count, expires_at, used_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', 0, ?, NULL, ?, ?)`,
        )
        .bind(
          challenge.id,
          challenge.accountId,
          challenge.challengeHash,
          challenge.allowedFactorsJson,
          challenge.expiresAt,
          challenge.createdAt,
          challenge.createdAt,
        ),
      this.db
        .prepare(
          `INSERT INTO platform_write_idempotency_keys
             (scope, idempotency_key, request_fingerprint, response_status,
              response_body_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          idempotency.scope,
          idempotency.key,
          idempotency.fingerprint,
          idempotency.responseStatus,
          idempotency.responseBodyJson,
          idempotency.createdAt,
        ),
    ]);
  }
}
