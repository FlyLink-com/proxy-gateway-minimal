-- Reviewed one-time Cloudflare PRIMARY-account isolated STAGING D1 DDL.
-- Applies only to CONTROL_DB = 1ec6458a-0ac0-4ab0-92f3-5ba58b775acc.
-- NEVER apply to E4, production BWH/SQLite, or any other Cloudflare account.
-- Exact SQL body copied from synthetic 0005 migration (verified by repo test).
-- Starts with BWH_ACTIVE / epoch 1; never activates D1 writer authority.
-- One-shot: must abort if any authority tables/triggers already exist.
CREATE TABLE platform_writer_authority (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  authority TEXT NOT NULL CHECK(authority IN ('BWH', 'D1')),
  phase TEXT NOT NULL CHECK(phase IN ('BWH_ACTIVE', 'FROZEN', 'D1_ACTIVE', 'RECOVERY')),
  epoch INTEGER NOT NULL CHECK(epoch BETWEEN 1 AND 2147483647),
  changed_at TEXT NOT NULL,
  CHECK (
    (authority = 'BWH' AND phase IN ('BWH_ACTIVE', 'FROZEN')) OR
    (authority = 'D1' AND phase IN ('D1_ACTIVE', 'RECOVERY'))
  )
);
INSERT INTO platform_writer_authority
  (singleton, authority, phase, epoch, changed_at)
VALUES (1, 'BWH', 'BWH_ACTIVE', 1, '1970-01-01T00:00:00.000Z');

-- Fail closed if a privileged operator tries to skip the freeze or re-use
-- an epoch. RECOVERY -> BWH_ACTIVE is NOT implemented: reverse reconciliation
-- must be proven before a later schema/contract explicitly authorizes it.
CREATE TRIGGER platform_writer_authority_transition_guard
BEFORE UPDATE ON platform_writer_authority
BEGIN
  SELECT CASE WHEN (
    NEW.singleton <> 1 OR NEW.epoch <> OLD.epoch + 1 OR
    NOT (
      (OLD.phase = 'BWH_ACTIVE' AND NEW.phase = 'FROZEN' AND NEW.authority = 'BWH') OR
      (OLD.phase = 'FROZEN' AND NEW.phase = 'BWH_ACTIVE' AND NEW.authority = 'BWH') OR
      (OLD.phase = 'FROZEN' AND NEW.phase = 'D1_ACTIVE' AND NEW.authority = 'D1') OR
      (OLD.phase = 'D1_ACTIVE' AND NEW.phase = 'RECOVERY' AND NEW.authority = 'D1') OR
      (OLD.phase = 'RECOVERY' AND NEW.phase = 'D1_ACTIVE' AND NEW.authority = 'D1')
    )
  ) THEN RAISE(ABORT, 'writer_authority_transition_denied') END; END;

CREATE TRIGGER platform_writer_authority_delete_guard
BEFORE DELETE ON platform_writer_authority
BEGIN SELECT RAISE(ABORT, 'writer_authority_delete_denied'); END;

-- The one-row gate is an atomic precondition to the business INSERTs in
-- D1Database.batch(). It is NOT an independent business writer or a journal.
CREATE TABLE platform_writer_gate (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  accepted_epoch INTEGER NOT NULL CHECK(accepted_epoch BETWEEN 0 AND 2147483647)
);
INSERT INTO platform_writer_gate (singleton, accepted_epoch) VALUES (1, 0);

-- Both INSERT and UPSERT UPDATE paths enforce the *current* authority in
-- the same database transaction as the protected business writes.
CREATE TRIGGER platform_writer_gate_insert_guard
BEFORE INSERT ON platform_writer_gate
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM platform_writer_authority
      WHERE singleton = 1 AND authority = 'D1'
        AND phase = 'D1_ACTIVE' AND epoch = NEW.accepted_epoch
  ) THEN RAISE(ABORT, 'writer_authority_denied') END; END;

CREATE TRIGGER platform_writer_gate_update_guard
BEFORE UPDATE ON platform_writer_gate
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM platform_writer_authority
      WHERE singleton = 1 AND authority = 'D1'
        AND phase = 'D1_ACTIVE' AND epoch = NEW.accepted_epoch
  ) THEN RAISE(ABORT, 'writer_authority_denied') END; END;
