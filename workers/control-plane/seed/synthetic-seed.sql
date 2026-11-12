-- Synthetic seed for LOCAL development only (wrangler d1 execute --local).
-- Every value below is obviously synthetic (acct-synth-* / owner-synth-* /
-- synth-challenge-hash-*). No real account, credential, or production data.
-- The account set intentionally contains same-timestamp groups
-- (5 rows at 2026-03-01T10:00:00.000Z, 4 rows at 2026-02-01T10:00:00.000Z)
-- so the (created_at, id) keyset pagination can be exercised by hand.
-- Re-running this file first clears the two slice tables.

DELETE FROM platform_portal_second_factor_challenges;
DELETE FROM platform_accounts;

INSERT INTO platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json) VALUES
  ('acct-synth-101', 'owner-synth-1', 'active',    '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', '{"registrationSource":"self_service_portal"}'),
  ('acct-synth-102', 'owner-synth-2', 'active',    '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', '{"registrationSource":"self_service_portal"}'),
  ('acct-synth-103', 'owner-synth-3', 'suspended', '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', '{}'),
  ('acct-synth-104', 'owner-synth-4', 'active',    '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', '{}'),
  ('acct-synth-105', 'owner-synth-5', 'disabled',  '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', '{}'),
  ('acct-synth-106', 'owner-synth-6', 'active',    '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '{"registrationSource":"self_service_portal"}'),
  ('acct-synth-107', 'owner-synth-7', 'active',    '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '{}'),
  ('acct-synth-108', 'owner-synth-8', 'suspended', '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '{}'),
  ('acct-synth-109', 'owner-synth-9', 'active',    '2026-02-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z', '{}'),
  ('acct-synth-110', 'owner-synth-10', 'active',   '2026-01-15T08:30:00.000Z', '2026-01-15T08:30:00.000Z', '{}'),
  ('acct-synth-111', 'owner-synth-11', 'active',   '2026-01-10T08:30:00.000Z', '2026-01-10T08:30:00.000Z', '{}'),
  ('acct-synth-112', 'owner-synth-12', 'suspended','2025-12-31T23:59:59.000Z', '2025-12-31T23:59:59.000Z', '{}'),
  ('acct-synth-113', 'owner-synth-13', 'active',   '2025-12-01T00:00:00.000Z', '2025-12-01T00:00:00.000Z', '{}'),
  ('acct-synth-114', 'owner-synth-14', 'disabled', '2025-11-01T00:00:00.000Z', '2025-11-01T00:00:00.000Z', '{}');

INSERT INTO platform_portal_second_factor_challenges (id, account_id, challenge_hash, allowed_factors_json, status, failure_count, expires_at, used_at, created_at, updated_at) VALUES
  ('chal-synth-001', 'acct-synth-101', 'synth-challenge-hash-001', '["totp","passkey"]', 'active',  0, '2026-03-01T10:10:00.000Z', NULL, '2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z'),
  ('chal-synth-002', 'acct-synth-102', 'synth-challenge-hash-002', '["totp"]',           'used',    0, '2026-03-01T10:10:00.000Z', '2026-03-01T10:05:00.000Z', '2026-03-01T10:00:00.000Z', '2026-03-01T10:05:00.000Z'),
  ('chal-synth-003', 'acct-synth-103', 'synth-challenge-hash-003', '["passkey"]',        'expired', 1, '2026-03-01T10:10:00.000Z', NULL, '2026-03-01T10:00:00.000Z', '2026-03-01T10:10:00.000Z');
