-- C1 identity binding slice — local synthetic only.
-- This is NOT target D1 DDL and must not be applied remotely. It stores
-- only opaque Auth0 issuer/subject references and an opaque account id.
-- Raw email, display name, password, TOTP material and email digests are
-- deliberately absent. Production target DDL remains gated by T3.

CREATE TABLE platform_identity_bindings (
  id text primary key,
  account_id text not null references platform_accounts(id) on delete restrict,
  issuer_ref text not null check (issuer_ref in ('portal', 'admin')),
  subject_ref text not null,
  status text not null check (status in ('active', 'revoked')),
  created_at_ms integer not null check (created_at_ms >= 0),
  updated_at_ms integer not null check (updated_at_ms >= created_at_ms),
  revoked_at_ms integer,
  check (
    (status = 'active' and revoked_at_ms is null)
    or
    (status = 'revoked' and revoked_at_ms is not null
      and revoked_at_ms >= created_at_ms and revoked_at_ms <= updated_at_ms)
  )
);

CREATE UNIQUE INDEX platform_identity_bindings_active_subject_idx
  on platform_identity_bindings(issuer_ref, subject_ref)
  where status = 'active';

CREATE UNIQUE INDEX platform_identity_bindings_active_account_idx
  on platform_identity_bindings(account_id)
  where status = 'active';

CREATE INDEX platform_identity_bindings_subject_idx
  on platform_identity_bindings(issuer_ref, subject_ref, status);
