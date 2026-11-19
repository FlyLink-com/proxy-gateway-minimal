-- Stage 2A OFFLINE MINIFLARE FIXTURE ONLY.
-- Never install these synthetic landing tables in E4 or remote Staging D1.
-- STAGE2_STATEMENT
CREATE TABLE stage2_rehearsal_runs (
 run_id TEXT PRIMARY KEY,
 manifest_json TEXT NOT NULL
);
-- STAGE2_STATEMENT
CREATE TABLE stage2_rehearsal_checkpoints (
 run_id TEXT NOT NULL REFERENCES stage2_rehearsal_runs(run_id),
 table_name TEXT NOT NULL,
 last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
 last_pk TEXT,
 PRIMARY KEY(run_id,table_name)
);
-- STAGE2_STATEMENT
CREATE TABLE stage2_rehearsal_batches (
 run_id TEXT NOT NULL REFERENCES stage2_rehearsal_runs(run_id),
 table_name TEXT NOT NULL,
 sequence INTEGER NOT NULL CHECK(sequence >= 1),
 start_after_pk TEXT,
 last_pk TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 PRIMARY KEY(run_id,table_name,sequence)
);
-- STAGE2_STATEMENT
CREATE TABLE stage2_rehearsal_rows (
 table_name TEXT NOT NULL,
 pk TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 projection_json TEXT NOT NULL,
 PRIMARY KEY(table_name,pk)
);
-- STAGE2_STATEMENT
CREATE TABLE stage2_rehearsal_operations (
 run_id TEXT NOT NULL,
 table_name TEXT NOT NULL,
 sequence INTEGER NOT NULL,
 pk TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
 previous_fingerprint TEXT,
 fingerprint TEXT,
 PRIMARY KEY(run_id,table_name,sequence,pk),
 FOREIGN KEY(run_id,table_name,sequence)
 REFERENCES stage2_rehearsal_batches(run_id,table_name,sequence)
);
-- STAGE2_STATEMENT
CREATE TRIGGER stage2_rehearsal_batch_sequence_guard
BEFORE INSERT ON stage2_rehearsal_batches
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM stage2_rehearsal_checkpoints c
   WHERE c.run_id = NEW.run_id AND c.table_name=NEW.table_name
     AND c.last_sequence=NEW.sequence-1
     AND c.last_pk IS NEW.start_after_pk
 ) THEN RAISE(ABORT,'stage2_checkpoint_conflict') END;
END;
-- STAGE2_STATEMENT
CREATE TRIGGER stage2_rehearsal_operation_fingerprint_guard
BEFORE INSERT ON stage2_rehearsal_operations
BEGIN
 SELECT CASE WHEN (
   (NEW.operation='upsert' AND (
     (NEW.previous_fingerprint IS NULL AND EXISTS (
       SELECT 1 FROM stage2_rehearsal_rows r
       WHERE r.table_name=NEW.table_name AND r.pk=NEW.pk
     )) OR
     (NEW.previous_fingerprint IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM stage2_rehearsal_rows r
       WHERE r.table_name=NEW.table_name AND r.pk=NEW.pk AND r.fingerprint=NEW.previous_fingerprint
     ))
   ))
   OR (NEW.operation='delete' AND NOT EXISTS (
     SELECT 1 FROM stage2_rehearsal_rows r
     WHERE r.table_name=NEW.table_name AND r.pk=NEW.pk AND r.fingerprint=NEW.previous_fingerprint
   ))
 ) THEN RAISE(ABORT,'stage2_previous_fingerprint_conflict') END;
END;
-- STAGE2_STATEMENT
CREATE TRIGGER stage2_rehearsal_checkpoint_advance_guard
BEFORE UPDATE ON stage2_rehearsal_checkpoints
BEGIN
 SELECT CASE WHEN NEW.last_sequence <> OLD.last_sequence+1
   OR NOT EXISTS (
     SELECT 1 FROM stage2_rehearsal_batches b
     WHERE b.run_id=NEW.run_id AND b.table_name=NEW.table_name
       AND b.sequence=NEW.last_sequence AND b.last_pk IS NEW.last_pk
   )
 THEN RAISE(ABORT,'stage2_checkpoint_advance_denied') END;
END;
