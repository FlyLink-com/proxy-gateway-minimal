-- G3 control-plane vertical slice — migration 0001 (local synthetic only).
-- DDL copied verbatim from the G2 stage-1 DDL set (ddl-set.json, baseline
-- master 63082bae5d980c3905d6e7405329b19e6c4e38ac). No columns were
-- altered and no fields were invented.
--
-- Tables: platform_accounts + platform_portal_second_factor_challenges.
-- platform_portal_sessions was the first session-direction candidate, but
-- its entry_id foreign key references platform_portal_entries(id), so it
-- is not DDL-self-contained. The second-factor challenges table references
-- only platform_accounts(id) and carries no triggers, so the slice stays
-- self-contained with two tables.

CREATE TABLE platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );

CREATE INDEX platform_accounts_status_idx
      on platform_accounts(status);

CREATE TABLE platform_portal_second_factor_challenges (
      id text primary key,
      account_id text not null references platform_accounts(id) on delete cascade,
      challenge_hash text not null,
      allowed_factors_json text not null,
      status text not null check (status in ('active', 'used', 'expired', 'locked')),
      failure_count integer not null default 0 check (failure_count >= 0),
      expires_at text not null,
      used_at text,
      created_at text not null,
      updated_at text not null
    );

CREATE INDEX platform_portal_second_factor_account_id_idx
      on platform_portal_second_factor_challenges(account_id);

CREATE INDEX platform_portal_second_factor_status_idx
      on platform_portal_second_factor_challenges(status);
