-- G4 Agent control-plane protocol slice.
-- LOCAL SYNTHETIC DEVELOPMENT ONLY. These tables are not copied from
-- production DDL and do not authorize remote D1 creation or migration.
--
-- D1 stores opaque references, SHA-256 digests, generations, statuses,
-- hashed Agent API tokens, replay nonces and redacted receipt metadata.
-- Raw credential material and signing private keys never enter D1.

CREATE TABLE agent_nodes (
  node_ref text primary key,
  status text not null check (status in ('active', 'disabled')),
  created_at text not null,
  updated_at text not null
);

CREATE TABLE agent_node_channels (
  node_ref text not null references agent_nodes(node_ref) on delete cascade,
  channel_ref text not null,
  status text not null check (status in ('active', 'disabled')),
  primary key (node_ref, channel_ref)
);

CREATE INDEX agent_node_channels_status_idx
  on agent_node_channels(node_ref, status, channel_ref);

CREATE TABLE agent_desired_states (
  desired_state_ref text primary key,
  node_ref text not null references agent_nodes(node_ref),
  generation text not null,
  status text not null check (status in ('active', 'superseded', 'revoked')),
  issued_at text not null,
  expires_at text not null,
  created_at text not null,
  unique (node_ref, generation)
);

CREATE INDEX agent_desired_states_node_status_idx
  on agent_desired_states(node_ref, status, created_at desc);

CREATE UNIQUE INDEX agent_desired_states_one_active_per_node
  on agent_desired_states(node_ref) where status = 'active';

CREATE TABLE agent_desired_state_materials (
  desired_state_ref text not null references agent_desired_states(desired_state_ref) on delete cascade,
  channel_ref text not null,
  edge_credential_ref text not null,
  digest text not null check (
    length(digest) = 64 and digest not glob '*[^0-9a-f]*'
  ),
  primary key (desired_state_ref, edge_credential_ref),
  unique (desired_state_ref, channel_ref, edge_credential_ref)
);

CREATE INDEX agent_desired_state_materials_channel_idx
  on agent_desired_state_materials(desired_state_ref, channel_ref);

CREATE TABLE agent_api_credentials (
  key_id text primary key,
  token_sha256 text not null check (
    length(token_sha256) = 64 and token_sha256 not glob '*[^0-9a-f]*'
  ),
  node_ref text not null references agent_nodes(node_ref),
  channel_refs_json text not null,
  status text not null check (status in ('active', 'overlap', 'revoked')),
  activated_at text not null,
  overlap_expires_at text,
  rotation_from_key_id text,
  last_authenticated_at text,
  auth_confirmed_at text,
  revoked_at text,
  created_at text not null,
  check (
    (status = 'overlap' and overlap_expires_at is not null and rotation_from_key_id is not null)
    or status in ('active', 'revoked')
  )
);

CREATE INDEX agent_api_credentials_node_status_idx
  on agent_api_credentials(node_ref, status);

CREATE TABLE agent_request_nonces (
  key_id text not null references agent_api_credentials(key_id) on delete cascade,
  nonce text not null,
  seen_at text not null,
  expires_at text not null,
  primary key (key_id, nonce)
);

CREATE INDEX agent_request_nonces_expires_idx
  on agent_request_nonces(expires_at);

CREATE TABLE agent_apply_receipts (
  idempotency_key text primary key,
  fingerprint text not null check (
    length(fingerprint) = 64 and fingerprint not glob '*[^0-9a-f]*'
  ),
  node_ref text not null references agent_nodes(node_ref),
  channel_ref text not null,
  generation text not null,
  desired_state_ref text not null references agent_desired_states(desired_state_ref),
  material_digests_json text not null,
  status text not null check (status in ('applied', 'dry_run')),
  detail_mode text not null check (detail_mode in ('apply', 'dry_run')),
  key_id text not null references agent_api_credentials(key_id),
  received_at text not null
);

CREATE INDEX agent_apply_receipts_node_generation_idx
  on agent_apply_receipts(node_ref, generation, received_at);

CREATE TABLE agent_credential_events (
  event_id text primary key,
  event_key text not null unique,
  key_id text not null references agent_api_credentials(key_id),
  node_ref text not null references agent_nodes(node_ref),
  event_type text not null check (
    event_type in (
      'rotation_started',
      'key_authenticated',
      'rotation_revoked',
      'key_promoted',
      'key_revoked_leak',
      'overlap_expired'
    )
  ),
  occurred_at text not null,
  detail_code text not null
);

CREATE INDEX agent_credential_events_key_time_idx
  on agent_credential_events(key_id, occurred_at);
