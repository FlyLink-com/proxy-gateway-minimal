// G4 Agent protocol repository. All data here is a local synthetic slice;
// production schema adoption remains a separately gated migration.

import { sha256Hex } from "../digests.mjs";

export const MAX_OVERLAP_MS = 15 * 60 * 1000;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class NonceReplayError extends Error {
  constructor() {
    super("Agent request nonce has already been used");
    this.name = "NonceReplayError";
    this.code = "replay_detected";
  }
}

export class AgentCredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentCredentialError";
    this.code = code;
  }
}

export class AgentRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") {
      throw new TypeError("AgentRepository requires a D1Database binding");
    }
    this.db = db;
  }

  async findCredential(keyId) {
    return (await this.db
      .prepare(
        "SELECT key_id, token_sha256, node_ref, channel_refs_json, status, activated_at, " +
        "overlap_expires_at, rotation_from_key_id, last_authenticated_at, " +
        "auth_confirmed_at, revoked_at, created_at " +
        "FROM agent_api_credentials WHERE key_id = ?",
      )
      .bind(keyId)
      .first()) ?? null;
  }

  async consumeNonce({ keyId, nonce, nowIso }) {
    await this.db
      .prepare("DELETE FROM agent_request_nonces WHERE expires_at <= ?")
      .bind(nowIso)
      .run();

    const expiresAt = new Date(Date.parse(nowIso) + 10 * 60 * 1000).toISOString();
    try {
      await this.db
        .prepare(
          "INSERT INTO agent_request_nonces (key_id, nonce, seen_at, expires_at) " +
          "VALUES (?, ?, ?, ?)",
        )
        .bind(keyId, nonce, nowIso, expiresAt)
        .run();
    } catch (error) {
      const existing = await this.db
        .prepare("SELECT nonce FROM agent_request_nonces WHERE key_id = ? AND nonce = ?")
        .bind(keyId, nonce)
        .first();
      if (existing) throw new NonceReplayError();
      throw error;
    }
  }

  async recordAuthenticatedRequest({ credential, nowIso }) {
    await this.db
      .prepare(
        "UPDATE agent_api_credentials SET last_authenticated_at = ?, " +
        "auth_confirmed_at = CASE WHEN status = 'overlap' " +
        "THEN COALESCE(auth_confirmed_at, ?) ELSE auth_confirmed_at END " +
        "WHERE key_id = ? AND status IN ('active', 'overlap')",
      )
      .bind(nowIso, nowIso, credential.key_id)
      .run();

    const current = await this.findCredential(credential.key_id);
    if (!current || !["active", "overlap"].includes(current.status) || current.revoked_at) {
      throw new AgentCredentialError("credential_revoked", "Agent credential was revoked during authentication");
    }

    if (current.status === "overlap" && !credential.auth_confirmed_at) {
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'key_authenticated', ?, 'new_key_auth_confirmed')",
        )
        .bind(
          crypto.randomUUID(),
          credential.key_id + ":authenticated",
          credential.key_id,
          credential.node_ref,
          nowIso,
        )
        .run();
    }
  }

  async expireOverlap(keyId, nowIso) {
    const credential = await this.findCredential(keyId);
    if (!credential || credential.status !== "overlap") return false;
    const result = await this.db
      .prepare(
        "UPDATE agent_api_credentials SET status = 'revoked', revoked_at = ? " +
        "WHERE key_id = ? AND status = 'overlap' AND overlap_expires_at <= ?",
      )
      .bind(nowIso, keyId, nowIso)
      .run();
    const changes = Number(result?.meta?.changes ?? 0);
    if (changes > 0) {
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'overlap_expired', ?, 'manual_ruling_required_current_key_retained')",
        )
        .bind(
          crypto.randomUUID(),
          keyId + ":overlap-expired",
          keyId,
          credential.node_ref,
          nowIso,
        )
        .run();
      return true;
    }
    return false;
  }

  async beginRotation({ currentKeyId, nextKeyId, nextToken, nowIso = new Date().toISOString(), overlapMs = MAX_OVERLAP_MS }) {
    if (
      typeof currentKeyId !== "string"
      || typeof nextKeyId !== "string"
      || !KEY_ID_PATTERN.test(nextKeyId)
      || nextKeyId === currentKeyId
      || typeof nextToken !== "string"
      || nextToken.length < 24
      || !Number.isInteger(overlapMs)
      || overlapMs < 1
      || overlapMs > MAX_OVERLAP_MS
      || !Number.isFinite(Date.parse(nowIso))
    ) {
      throw new AgentCredentialError("rotation_invalid", "rotation parameters are invalid");
    }
    const current = await this.findCredential(currentKeyId);
    if (!current || current.status !== "active" || current.revoked_at) {
      throw new AgentCredentialError("current_key_invalid", "current communication key is not active");
    }
    const inProgress = await this.db
      .prepare(
        "SELECT key_id FROM agent_api_credentials " +
        "WHERE rotation_from_key_id = ? AND status = 'overlap' LIMIT 1",
      )
      .bind(currentKeyId)
      .first();
    if (inProgress) {
      throw new AgentCredentialError("rotation_in_progress", "a key rotation is already in progress");
    }
    const unresolvedException = await this.db
      .prepare(
        "SELECT expired.key_id FROM agent_api_credentials AS expired " +
        "JOIN agent_credential_events AS event ON event.key_id = expired.key_id " +
        "WHERE expired.rotation_from_key_id = ? AND event.event_type = 'overlap_expired' " +
        "AND NOT EXISTS (" +
        "SELECT 1 FROM agent_credential_events AS cleared " +
        "WHERE cleared.key_id = ? AND cleared.event_type = 'rotation_exception_cleared' " +
        "AND cleared.event_key = ? || ':rotation-exception-cleared:' || expired.key_id" +
        ") LIMIT 1",
      )
      .bind(currentKeyId, currentKeyId, currentKeyId)
      .first();
    if (unresolvedException) {
      throw new AgentCredentialError("rotation_exception_active", "manual ruling is required before another automatic rotation");
    }
    if (await this.findCredential(nextKeyId)) {
      throw new AgentCredentialError("key_id_reused", "next key id already exists");
    }

    const expiresAt = new Date(Date.parse(nowIso) + overlapMs).toISOString();
    const tokenDigest = await sha256Hex(nextToken);
    if (tokenDigest === current.token_sha256) {
      throw new AgentCredentialError("rotation_token_reused", "next communication token must be different");
    }
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO agent_api_credentials " +
          "(key_id, token_sha256, node_ref, channel_refs_json, status, activated_at, " +
          "overlap_expires_at, rotation_from_key_id, last_authenticated_at, " +
          "auth_confirmed_at, revoked_at, created_at) " +
          "VALUES (?, ?, ?, ?, 'overlap', ?, ?, ?, NULL, NULL, NULL, ?)",
        )
        .bind(
          nextKeyId,
          tokenDigest,
          current.node_ref,
          current.channel_refs_json,
          nowIso,
          expiresAt,
          currentKeyId,
          nowIso,
        ),
      this.db
        .prepare(
          "INSERT INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'rotation_started', ?, 'max_overlap_15_minutes')",
        )
        .bind(
          crypto.randomUUID(),
          nextKeyId + ":rotation-started",
          nextKeyId,
          current.node_ref,
          nowIso,
        ),
    ]);
    return { nextKeyId, activatedAt: nowIso, overlapExpiresAt: expiresAt };
  }

  async revokeAfterRotation(currentKeyId, nowIso = new Date().toISOString()) {
    const current = await this.findCredential(currentKeyId);
    const next = await this.db
      .prepare(
        "SELECT key_id, node_ref, status, overlap_expires_at, auth_confirmed_at " +
        "FROM agent_api_credentials WHERE rotation_from_key_id = ? AND status = 'overlap' LIMIT 1",
      )
      .bind(currentKeyId)
      .first();
    if (!current || current.status !== "active" || !next) {
      throw new AgentCredentialError("rotation_not_found", "no active key rotation exists");
    }
    const expiresAt = Date.parse(next.overlap_expires_at);
    if (!Number.isFinite(expiresAt) || Date.parse(nowIso) >= expiresAt) {
      await this.expireOverlap(next.key_id, nowIso);
      throw new AgentCredentialError("rotation_expired", "overlap expired; current key is retained and manual ruling is required");
    }
    if (!next.auth_confirmed_at) {
      throw new AgentCredentialError("rotation_ack_required", "new key must authenticate successfully before old key revocation");
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE agent_api_credentials SET status = 'revoked', revoked_at = ? " +
          "WHERE key_id = ? AND status = 'active' AND EXISTS (" +
          "SELECT 1 FROM agent_api_credentials AS candidate " +
          "WHERE candidate.key_id = ? AND candidate.status = 'overlap' " +
          "AND candidate.auth_confirmed_at IS NOT NULL AND candidate.overlap_expires_at > ?)",
        )
        .bind(nowIso, currentKeyId, next.key_id, nowIso),
      this.db
        .prepare(
          "UPDATE agent_api_credentials SET status = 'active', overlap_expires_at = NULL, " +
          "rotation_from_key_id = NULL WHERE key_id = ? AND status = 'overlap' " +
          "AND auth_confirmed_at IS NOT NULL AND EXISTS (" +
          "SELECT 1 FROM agent_api_credentials AS previous " +
          "WHERE previous.key_id = ? AND previous.status = 'revoked' AND previous.revoked_at = ?)",
        )
        .bind(next.key_id, currentKeyId, nowIso),
    ]);
    const oldKeyChanges = Number(results?.[0]?.meta?.changes ?? 0);
    const nextKeyChanges = Number(results?.[1]?.meta?.changes ?? 0);
    if (oldKeyChanges !== 1 || nextKeyChanges !== 1) {
      throw new AgentCredentialError("rotation_conflict", "credential state changed during rotation; current key was not retired by this attempt");
    }
    await this.db.batch([
      this.db
        .prepare(
          "INSERT OR IGNORE INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'rotation_revoked', ?, 'old_key_revoked_after_new_key_auth')",
        )
        .bind(
          crypto.randomUUID(),
          currentKeyId + ":rotation-revoked",
          currentKeyId,
          current.node_ref,
          nowIso,
        ),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'key_promoted', ?, 'new_key_promoted_after_auth')",
        )
        .bind(
          crypto.randomUUID(),
          next.key_id + ":promoted",
          next.key_id,
          next.node_ref,
          nowIso,
        ),
    ]);
    return { revokedKeyId: currentKeyId, activeKeyId: next.key_id };
  }

  async clearRotationException({ currentKeyId, expiredCandidateKeyId, manualRulingRef, nowIso = new Date().toISOString() }) {
    if (
      typeof currentKeyId !== "string"
      || typeof expiredCandidateKeyId !== "string"
      || typeof manualRulingRef !== "string"
      || !/^[A-Za-z0-9._:-]{8,128}$/.test(manualRulingRef)
      || !Number.isFinite(Date.parse(nowIso))
    ) {
      throw new AgentCredentialError("manual_ruling_invalid", "a bounded manual ruling reference is required");
    }
    const current = await this.findCredential(currentKeyId);
    const expired = await this.findCredential(expiredCandidateKeyId);
    if (
      !current || current.status !== "active" || current.revoked_at
      || !expired || expired.status !== "revoked"
      || expired.rotation_from_key_id !== currentKeyId
    ) {
      throw new AgentCredentialError("manual_ruling_target_invalid", "manual ruling must target the active current key and its expired revoked candidate");
    }
    const expiryEvent = await this.db
      .prepare(
        "SELECT event_key FROM agent_credential_events " +
        "WHERE key_id = ? AND event_type = 'overlap_expired' LIMIT 1",
      )
      .bind(expiredCandidateKeyId)
      .first();
    if (!expiryEvent) {
      throw new AgentCredentialError("manual_ruling_not_required", "the candidate has no recorded expired-overlap exception");
    }
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO agent_credential_events " +
        "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
        "VALUES (?, ?, ?, ?, 'rotation_exception_cleared', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        currentKeyId + ":rotation-exception-cleared:" + expiredCandidateKeyId,
        currentKeyId,
        current.node_ref,
        nowIso,
        "manual_ruling_ref:" + manualRulingRef,
      )
      .run();
    return { currentKeyId, expiredCandidateKeyId, manualRulingRef };
  }

  async revokeForLeak(keyId, nowIso = new Date().toISOString()) {
    const credential = await this.findCredential(keyId);
    if (!credential || credential.status === "revoked") return false;

    if (credential.status === "active") {
      const successor = await this.db
        .prepare(
          "SELECT key_id, overlap_expires_at FROM agent_api_credentials " +
          "WHERE rotation_from_key_id = ? AND status = 'overlap' LIMIT 1",
        )
        .bind(keyId)
        .first();
      if (successor && Date.parse(successor.overlap_expires_at) > Date.parse(nowIso)) {
        await this.db.batch([
          this.db
            .prepare(
              "UPDATE agent_api_credentials SET status = 'revoked', revoked_at = ? WHERE key_id = ?",
            )
            .bind(nowIso, keyId),
          this.db
            .prepare(
              "UPDATE agent_api_credentials SET status = 'active', overlap_expires_at = NULL, " +
              "rotation_from_key_id = NULL WHERE key_id = ? AND status = 'overlap'",
            )
            .bind(successor.key_id),
          this.db
            .prepare(
              "INSERT OR IGNORE INTO agent_credential_events " +
              "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
              "VALUES (?, ?, ?, ?, 'key_revoked_leak', ?, 'emergency_leak_revocation')",
            )
            .bind(crypto.randomUUID(), keyId + ":leak-revoked", keyId, credential.node_ref, nowIso),
          this.db
            .prepare(
              "INSERT OR IGNORE INTO agent_credential_events " +
              "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
              "VALUES (?, ?, ?, ?, 'key_promoted', ?, 'successor_promoted_after_leak')",
            )
            .bind(
              crypto.randomUUID(),
              successor.key_id + ":leak-promoted",
              successor.key_id,
              credential.node_ref,
              nowIso,
            ),
        ]);
        return true;
      }
    }

    await this.db.batch([
      this.db
        .prepare(
          "UPDATE agent_api_credentials SET status = 'revoked', revoked_at = ? WHERE key_id = ?",
        )
        .bind(nowIso, keyId),
      this.db
        .prepare(
          "INSERT OR IGNORE INTO agent_credential_events " +
          "(event_id, event_key, key_id, node_ref, event_type, occurred_at, detail_code) " +
          "VALUES (?, ?, ?, ?, 'key_revoked_leak', ?, 'emergency_leak_revocation')",
        )
        .bind(
          crypto.randomUUID(),
          keyId + ":leak-revoked",
          keyId,
          credential.node_ref,
          nowIso,
        ),
    ]);
    return true;
  }
}
