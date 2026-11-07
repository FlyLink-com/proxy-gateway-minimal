-- G3 control-plane vertical slice — migration 0002 (local synthetic only).
--
-- Adds the idempotency store for the bounded write flow. Unlike migration
-- 0001, this table is NOT copied from the production control schema: it
-- is a new, slice-local table designed for this Worker, following the
-- G1-30 contract requirement that writes be idempotency-keyed. It makes
-- no claim about the future production D1 schema; if the pattern is
-- adopted, the table graduates through the normal migration gates.
--
-- One row records one accepted write: the (scope, idempotency_key) pair
-- the client presented, a fingerprint of the canonical request, and the
-- exact response that was returned, so a retry can be answered with the
-- original response without re-executing the write. The row is inserted
-- in the same D1 batch as the write itself, so the pair is atomic: a
-- write is never recorded without happening, and never happens without
-- being recorded.

CREATE TABLE platform_write_idempotency_keys (
      scope text not null,
      idempotency_key text not null,
      request_fingerprint text not null,
      response_status integer not null,
      response_body_json text not null,
      created_at text not null,
      primary key (scope, idempotency_key)
    );
