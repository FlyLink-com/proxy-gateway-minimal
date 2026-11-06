import assert from "node:assert/strict";
import test from "node:test";
import { createWorker } from "./helpers.mjs";

test("migration applies and creates the slice schema verbatim", async (t) => {
  const { mf, db } = await createWorker({ seed: false });
  t.after(() => mf.dispose());

  const { results } = await db
    .prepare(
      `SELECT type, name FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'`,
    )
    .all();
  const objects = results.map((row) => `${row.type}:${row.name}`).sort();
  assert.deepEqual(objects, [
    "index:agent_api_credentials_node_status_idx",
    "index:agent_apply_receipts_node_generation_idx",
    "index:agent_credential_events_key_time_idx",
    "index:agent_desired_state_materials_channel_idx",
    "index:agent_desired_states_node_status_idx",
    "index:agent_desired_states_one_active_per_node",
    "index:agent_node_channels_status_idx",
    "index:agent_request_nonces_expires_idx",
    "index:platform_accounts_status_idx",
    "index:platform_portal_second_factor_account_id_idx",
    "index:platform_portal_second_factor_status_idx",
    "table:agent_api_credentials",
    "table:agent_apply_receipts",
    "table:agent_credential_events",
    "table:agent_desired_state_materials",
    "table:agent_desired_states",
    "table:agent_node_channels",
    "table:agent_nodes",
    "table:agent_request_nonces",
    "table:platform_accounts",
    "table:platform_portal_second_factor_challenges",
    "table:platform_write_idempotency_keys",
  ]);
});

test("schema constraints are enforced by D1", async (t) => {
  const { mf, db } = await createWorker({ seed: false });
  t.after(() => mf.dispose());

  // CHECK constraint on platform_accounts.status.
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO platform_accounts (id, owner_ref, status, created_at, updated_at)
         VALUES ('acct-bad-1', 'owner-synth-x', 'bogus', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(),
  );

  // Foreign key from challenges to accounts.
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO platform_portal_second_factor_challenges
           (id, account_id, challenge_hash, allowed_factors_json, status, failure_count, expires_at, used_at, created_at, updated_at)
         VALUES ('chal-bad-1', 'acct-missing', 'synth-hash', '["totp"]', 'active', 0, '2026-01-01T00:10:00.000Z', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(),
  );
});

test("deleting an account cascades to its second-factor challenges", async (t) => {
  const { mf, db } = await createWorker();
  t.after(() => mf.dispose());

  const before = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM platform_portal_second_factor_challenges WHERE account_id = 'acct-pg-101'",
    )
    .first();
  assert.equal(before.n, 1);
  await db.prepare("DELETE FROM platform_accounts WHERE id = 'acct-pg-101'").run();
  const after = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM platform_portal_second_factor_challenges WHERE account_id = 'acct-pg-101'",
    )
    .first();
  assert.equal(after.n, 0);
});
