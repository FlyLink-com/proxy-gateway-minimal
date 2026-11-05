# Shared Control Database — Source Schema Matrix

> **Evidence cut:** repository `FlyLink-com/proxy-gateway-minimal`, `master` at PR #828 base `3768644a` (source files below are read from that base branch).
> **Purpose:** Source-level schema matrix for the 48-table core slice. The six companion G1-21–G1-26 annexes in §6 add 22 tables, completing the 70-table integrated source inventory.
> **Execution boundary:** source-only inspection. No local/production SQLite file was opened; no rows, secrets, backups, migrations, Cloudflare resources, CI, or deployment were touched.

## 1. Scope and database boundary

The application composes the shared control database path as:

```text
options.controlDbPath
  || SUBSCRIPTION_CONTROL_DB_PATH
  || CONTROL_DB_PATH
  || <rootDir>/.proxy-gateway/control.sqlite
```

Source: [`server/state.mjs`#L1887-L1930].

The approved first D1 target is this one shared control database. This matrix does **not** fold in:

- `subscriptions.sqlite` (`subscriptionDbPath`, independently composed at `server/state.mjs`#L1887-L1888);
- the optional imported-source database (`THIRD_PARTY_SUBSCRIPTION_DB_PATH`, `server/state.mjs`#L3145-L3181);
- protected edge credential material or data-pack escrow files;
- BWH/edge runtime state, generated subscription YAML, or other data-plane stores.

The source inventory describes schema objects that the current source can create, validate, or consume. It does **not** prove that every optional feature is enabled or every migration has been applied to any particular database file.

## 2. Reading rules

- Column flags are literal source-level attributes: `NOT NULL`, primary key, unique, default, foreign key, and presence of a `CHECK`.
- Table-level unique/check/foreign-key clauses are preserved in the constraints column.
- Index predicates and trigger timing/events are listed separately.
- Repeated references to `platform_schema_migrations` are one shared ledger table, not one ledger per feature.
- Temporary rebuild tables used only during a migration are not counted as steady-state tables.
- Source line ranges point to the SQL declaration; the source file remains authoritative for the complete expression and runtime migration algorithm.

## 3. Shared baseline and core control tables

### Control-store baseline (28 tables)

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_leads` | id TEXT [PK]; status TEXT [NOT NULL; CHECK]; organization TEXT [NOT NULL]; email TEXT [NOT NULL]; direction TEXT [NOT NULL]; stage TEXT [NOT NULL; DEFAULT '']; message TEXT [NOT NULL]; source TEXT [NOT NULL]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL]; expires_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L940-L952] |
| `platform_accounts` | id TEXT [PK]; owner_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL]; metadata_json TEXT [NOT NULL; DEFAULT '{}'] | — | [`server/services/platform/subscription-control-db.mjs`#L959-L966] |
| `platform_entitlements` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; plan TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; valid_from TEXT [NOT NULL]; valid_until TEXT [NOT NULL]; max_artifacts INTEGER [NOT NULL; DEFAULT 1]; max_devices INTEGER [NOT NULL; DEFAULT 1]; traffic_limit_bytes INTEGER [NOT NULL; DEFAULT 0]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L971-L983] |
| `platform_issuance_requests` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; approval_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; quantity INTEGER [NOT NULL; CHECK]; node_id TEXT [NOT NULL]; purpose TEXT [NOT NULL]; requested_by_ref TEXT [NOT NULL]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL]; metadata_json TEXT [NOT NULL; DEFAULT '{}'] | — | [`server/services/platform/subscription-control-db.mjs`#L990-L1003] |
| `platform_issued_subscription_links` | id TEXT [PK]; request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; tenant_ref TEXT [NOT NULL]; artifact_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1012-L1020] |
| `platform_data_pack_resources` | order_ref TEXT [PK]; command_ref TEXT [NOT NULL; UNIQUE]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; request_ref TEXT [NOT NULL; UNIQUE; FK platform_issuance_requests(id)]; entitlement_ref TEXT [NOT NULL; UNIQUE; FK platform_entitlements(id)]; offer_version_ref TEXT [NOT NULL]; quota_bytes INTEGER [NOT NULL; CHECK]; commercial_never_expires INTEGER [NOT NULL; CHECK]; technical_valid_until TEXT [NOT NULL]; created_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1027-L1038] |
| `platform_data_pack_artifact_rotations` | rotation_ref TEXT [PK]; order_ref TEXT [NOT NULL; FK platform_data_pack_resources(order_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; link_ref TEXT [NOT NULL; FK platform_issued_subscription_links(id)]; old_artifact_ref TEXT [NOT NULL]; replacement_artifact_ref TEXT; attempt INTEGER [NOT NULL; DEFAULT 1; CHECK]; status TEXT [NOT NULL; CHECK]; lease_ref TEXT; lease_until TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1043-L1056] |
| `platform_data_pack_edge_credentials` | request_ref TEXT [NOT NULL; FK platform_issuance_requests(id)]; entitlement_ref TEXT [NOT NULL; FK platform_entitlements(id)]; edge_channel_ref TEXT [NOT NULL]; edge_credential_ref TEXT [NOT NULL; UNIQUE]; edge_material_digest TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | primary key (request_ref, edge_credential_ref) | [`server/services/platform/subscription-control-db.mjs`#L1060-L1070] |
| `platform_data_pack_credential_resets` | rotation_ref TEXT [PK]; order_ref TEXT [NOT NULL; FK platform_data_pack_resources(order_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; request_ref TEXT [NOT NULL; FK platform_issuance_requests(id)]; entitlement_ref TEXT [NOT NULL; FK platform_entitlements(id)]; edge_channel_ref TEXT [NOT NULL]; edge_credential_ref TEXT [NOT NULL]; old_edge_material_digest TEXT [NOT NULL]; new_edge_material_digest TEXT; status TEXT [NOT NULL; CHECK]; lease_ref TEXT; lease_until TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1074-L1091] |
| `platform_quota_counters` | account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; metric TEXT [NOT NULL]; period TEXT [NOT NULL]; amount INTEGER [NOT NULL; DEFAULT 0]; updated_at TEXT [NOT NULL] | primary key (account_id, entitlement_id, metric, period) | [`server/services/platform/subscription-control-db.mjs`#L1095-L1103] |
| `platform_usage_samples` | id TEXT [PK]; source_ref TEXT [NOT NULL]; channel_ref TEXT [NOT NULL]; edge_credential_ref TEXT [NOT NULL]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; observed_at TEXT [NOT NULL]; interval_started_at TEXT [NOT NULL]; interval_ended_at TEXT [NOT NULL]; upload_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; download_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; total_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; sample_digest TEXT [NOT NULL; UNIQUE]; created_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1105-L1121] |
| `platform_usage_rollups` | edge_credential_ref TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; channel_ref TEXT [NOT NULL]; upload_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; download_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; total_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; last_observed_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1128-L1139] |
| `platform_usage_counter_cursors` | source_ref TEXT [NOT NULL]; channel_ref TEXT [NOT NULL]; edge_credential_ref TEXT [NOT NULL]; upload_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; download_bytes INTEGER [NOT NULL; DEFAULT 0; CHECK]; observed_at TEXT [NOT NULL]; epoch INTEGER [NOT NULL; DEFAULT 0; CHECK]; updated_at TEXT [NOT NULL] | primary key (source_ref, channel_ref, edge_credential_ref) | [`server/services/platform/subscription-control-db.mjs`#L1146-L1156] |
| `platform_device_bindings` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; artifact_ref TEXT [NOT NULL]; device_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; first_seen_at TEXT [NOT NULL]; last_seen_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1158-L1166] |
| `platform_revocation_events` | id TEXT [PK]; request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; issued_link_id TEXT [FK platform_issued_subscription_links(id)]; tenant_ref TEXT [NOT NULL]; artifact_ref TEXT [NOT NULL]; reason_code TEXT [NOT NULL]; revoked_by_ref TEXT [NOT NULL]; created_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1173-L1182] |
| `platform_audit_events` | id TEXT [PK]; entity_type TEXT [NOT NULL]; entity_ref TEXT [NOT NULL]; action TEXT [NOT NULL]; actor_ref TEXT [NOT NULL]; created_at TEXT [NOT NULL]; metadata_json TEXT [NOT NULL; DEFAULT '{}'] | — | [`server/services/platform/subscription-control-db.mjs`#L1187-L1195] |
| `platform_edge_registered_nodes` | node_ref TEXT [PK]; provider_ref TEXT [NOT NULL]; region_ref TEXT [NOT NULL]; role_ref TEXT [NOT NULL]; channel_refs_json TEXT [NOT NULL; DEFAULT '[]']; image_manifest_ref TEXT [NOT NULL]; release_ref TEXT [NOT NULL]; lifecycle TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; first_boot_packet_ref TEXT [NOT NULL]; registered_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL]; metadata_json TEXT [NOT NULL; DEFAULT '{}'] | — | [`server/services/platform/subscription-control-db.mjs`#L1200-L1214] |
| `platform_edge_apply_receipts` | id TEXT [PK]; channel_ref TEXT [NOT NULL]; desired_state_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; add_count INTEGER [NOT NULL; DEFAULT 0]; revoke_count INTEGER [NOT NULL; DEFAULT 0]; rotate_count INTEGER [NOT NULL; DEFAULT 0]; unchanged_count INTEGER [NOT NULL; DEFAULT 0]; config_test_ok INTEGER [NOT NULL; DEFAULT 0; CHECK]; service_active INTEGER [NOT NULL; DEFAULT 0; CHECK]; listener_udp443 INTEGER [NOT NULL; DEFAULT 0; CHECK]; backup_ref TEXT; rollback_ref TEXT; applied_at TEXT; created_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1221-L1237] |
| `platform_edge_desired_state_notifications` | id TEXT [PK]; node_ref TEXT [NOT NULL]; channel_ref TEXT [NOT NULL]; desired_state_ref TEXT [NOT NULL]; generation TEXT [NOT NULL]; reason TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1244-L1254] |
| `platform_edge_agent_leases` | lease_ref TEXT [PK]; agent_ref TEXT [NOT NULL]; node_ref TEXT [NOT NULL]; channel_ref TEXT [NOT NULL]; desired_state_ref TEXT; status TEXT [NOT NULL; CHECK]; acquired_at TEXT [NOT NULL]; renewed_at TEXT [NOT NULL]; expires_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1263-L1273] |
| `platform_portal_access_requests` | id TEXT [PK]; portal_user_ref TEXT [NOT NULL]; plan TEXT [NOT NULL; CHECK]; client_target TEXT [NOT NULL; CHECK]; duration_days INTEGER [NOT NULL; CHECK]; quantity INTEGER [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; next_action TEXT [NOT NULL]; note_provided INTEGER [NOT NULL; DEFAULT 0; CHECK]; prior_trial_state TEXT [NOT NULL]; submitted_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL]; reviewed_at TEXT; reviewed_by_ref TEXT; safe_reason_code TEXT; expires_at TEXT; valid_until TEXT; entitlement_ref TEXT; access_grant_ref TEXT; tenant_id TEXT; artifact_id TEXT; subscription_url TEXT; edge_channel_ref TEXT; edge_credential_ref TEXT; edge_material_digest TEXT; edge_lifecycle_mutation INTEGER [NOT NULL; DEFAULT 0; CHECK]; event_json TEXT [NOT NULL; DEFAULT '{}'] | — | [`server/services/platform/subscription-control-db.mjs`#L1280-L1315] |
| `platform_portal_edge_credentials` | request_id TEXT [NOT NULL; FK platform_portal_access_requests(id)]; edge_channel_ref TEXT [NOT NULL]; edge_credential_ref TEXT [NOT NULL]; edge_material_digest TEXT [NOT NULL]; ordinal INTEGER [NOT NULL; DEFAULT 0; CHECK] | primary key (request_id, edge_channel_ref) | [`server/services/platform/subscription-control-db.mjs`#L1324-L1331] |
| `platform_portal_entries` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; token_hash TEXT [NOT NULL; UNIQUE]; status TEXT [NOT NULL; CHECK]; expires_at TEXT [NOT NULL]; max_uses INTEGER [NOT NULL; CHECK]; use_count INTEGER [NOT NULL; DEFAULT 0; CHECK]; issued_by_ref TEXT [NOT NULL]; approval_ref TEXT [NOT NULL]; used_at TEXT; revoked_at TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1338-L1353] |
| `platform_portal_totp_credentials` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; encrypted_totp_secret TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; failure_count INTEGER [NOT NULL; DEFAULT 0; CHECK]; locked_until TEXT; enrolled_at TEXT [NOT NULL]; last_verified_at TEXT; revoked_at TEXT; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1362-L1373] |
| `platform_portal_password_credentials` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; password_hash TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; failure_count INTEGER [NOT NULL; DEFAULT 0; CHECK]; locked_until TEXT; must_rotate INTEGER [NOT NULL; DEFAULT 0; CHECK]; created_at TEXT [NOT NULL]; last_verified_at TEXT; revoked_at TEXT; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1380-L1392] |
| `platform_portal_passkey_credentials` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; credential_id TEXT [NOT NULL; UNIQUE]; credential_id_hash TEXT [NOT NULL; UNIQUE]; public_key_jwk_json TEXT [NOT NULL]; sign_count INTEGER [NOT NULL; DEFAULT 0; CHECK]; transports_json TEXT [NOT NULL; DEFAULT '[]']; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; last_verified_at TEXT; revoked_at TEXT; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1399-L1412] |
| `platform_portal_second_factor_challenges` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; challenge_hash TEXT [NOT NULL]; allowed_factors_json TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; failure_count INTEGER [NOT NULL; DEFAULT 0; CHECK]; expires_at TEXT [NOT NULL]; used_at TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1419-L1430] |
| `platform_portal_sessions` | id TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entry_id TEXT [FK platform_portal_entries(id)]; auth_method TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; issued_at TEXT [NOT NULL]; expires_at TEXT [NOT NULL]; revoked_at TEXT; updated_at TEXT [NOT NULL] | — | [`server/services/platform/subscription-control-db.mjs`#L1437-L1447] |

**Indexes**
- platform_leads_status_created_idx — platform_leads(status, created_at)
- platform_leads_expires_at_idx — platform_leads(expires_at)
- platform_accounts_status_idx — platform_accounts(status)
- platform_entitlements_account_id_idx — platform_entitlements(account_id)
- platform_entitlements_status_idx — platform_entitlements(status)
- platform_issuance_requests_account_id_idx — platform_issuance_requests(account_id)
- platform_issuance_requests_entitlement_id_idx — platform_issuance_requests(entitlement_id)
- platform_issuance_requests_status_idx — platform_issuance_requests(status)
- platform_issued_subscription_links_request_id_idx — platform_issued_subscription_links(request_id)
- platform_issued_subscription_links_status_idx — platform_issued_subscription_links(status)
- platform_data_pack_resources_account_idx — platform_data_pack_resources(account_id, created_at)
- platform_data_pack_rotation_pending_idx — platform_data_pack_artifact_rotations(order_ref) UNIQUE WHERE status != 'complete'
- platform_data_pack_edge_active_request_idx — platform_data_pack_edge_credentials(request_ref) UNIQUE WHERE status = 'active'
- platform_data_pack_credential_reset_pending_idx — platform_data_pack_credential_resets(order_ref) UNIQUE WHERE status != 'complete'
- platform_usage_samples_edge_credential_idx — platform_usage_samples(edge_credential_ref, observed_at)
- platform_usage_samples_account_entitlement_idx — platform_usage_samples(account_id, entitlement_id, observed_at)
- platform_usage_rollups_account_entitlement_idx — platform_usage_rollups(account_id, entitlement_id)
- platform_usage_rollups_channel_idx — platform_usage_rollups(channel_ref)
- platform_device_bindings_account_id_idx — platform_device_bindings(account_id)
- platform_device_bindings_artifact_ref_idx — platform_device_bindings(artifact_ref)
- platform_revocation_events_request_id_idx — platform_revocation_events(request_id)
- platform_audit_events_entity_ref_idx — platform_audit_events(entity_ref)
- platform_edge_registered_nodes_provider_region_idx — platform_edge_registered_nodes(provider_ref, region_ref)
- platform_edge_registered_nodes_status_idx — platform_edge_registered_nodes(status, updated_at)
- platform_edge_apply_receipts_channel_idx — platform_edge_apply_receipts(channel_ref, created_at)
- platform_edge_apply_receipts_desired_state_idx — platform_edge_apply_receipts(desired_state_ref)
- platform_edge_desired_state_notifications_node_idx — platform_edge_desired_state_notifications(node_ref, created_at)
- platform_edge_desired_state_notifications_channel_idx — platform_edge_desired_state_notifications(channel_ref, created_at)
- platform_edge_desired_state_notifications_state_idx — platform_edge_desired_state_notifications(desired_state_ref)
- platform_edge_agent_leases_channel_idx — platform_edge_agent_leases(channel_ref, renewed_at)
- platform_edge_agent_leases_node_idx — platform_edge_agent_leases(node_ref, renewed_at)
- platform_portal_access_requests_user_idx — platform_portal_access_requests(portal_user_ref, submitted_at)
- platform_portal_access_requests_status_idx — platform_portal_access_requests(status)
- platform_portal_access_requests_plan_idx — platform_portal_access_requests(plan)
- platform_portal_edge_credentials_ref_idx — platform_portal_edge_credentials(edge_credential_ref) UNIQUE
- platform_portal_edge_credentials_request_idx — platform_portal_edge_credentials(request_id, ordinal)
- platform_portal_entries_account_id_idx — platform_portal_entries(account_id)
- platform_portal_entries_token_hash_idx — platform_portal_entries(token_hash)
- platform_portal_entries_status_idx — platform_portal_entries(status)
- platform_portal_totp_credentials_account_id_idx — platform_portal_totp_credentials(account_id)
- platform_portal_totp_credentials_status_idx — platform_portal_totp_credentials(status)
- platform_portal_password_credentials_account_id_idx — platform_portal_password_credentials(account_id)
- platform_portal_password_credentials_status_idx — platform_portal_password_credentials(status)
- platform_portal_passkey_credentials_account_id_idx — platform_portal_passkey_credentials(account_id)
- platform_portal_passkey_credentials_status_idx — platform_portal_passkey_credentials(status)
- platform_portal_second_factor_account_id_idx — platform_portal_second_factor_challenges(account_id)
- platform_portal_second_factor_status_idx — platform_portal_second_factor_challenges(status)
- platform_portal_sessions_account_id_idx — platform_portal_sessions(account_id)
- platform_portal_sessions_status_idx — platform_portal_sessions(status)

### Coins wallet foundation (7 domain tables + shared ledger) — 8 tables

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_schema_migrations` | migration_id TEXT [PK]; ddl_checksum TEXT [NOT NULL]; applied_at TEXT [NOT NULL] | — | [`server/services/platform/coin-wallet-migrations.mjs`#L23-L27] |
| `platform_coin_wallets` | wallet_ref TEXT [PK]; account_id TEXT [NOT NULL; UNIQUE; FK platform_accounts(id)]; status TEXT [NOT NULL; CHECK]; version INTEGER [NOT NULL; DEFAULT 0; CHECK]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/coin-wallet-migrations.mjs`#L30-L37] |
| `platform_coin_lots` | lot_ref TEXT [PK]; wallet_ref TEXT [NOT NULL; FK platform_coin_wallets(wallet_ref)]; coin_type TEXT [NOT NULL; CHECK]; credit_origin_ref TEXT [NOT NULL; UNIQUE]; issued_units INTEGER [NOT NULL; CHECK]; pending_units INTEGER [NOT NULL; CHECK]; available_units INTEGER [NOT NULL; CHECK]; held_units INTEGER [NOT NULL; CHECK]; consumed_units INTEGER [NOT NULL; CHECK]; reversed_units INTEGER [NOT NULL; CHECK]; expired_units INTEGER [NOT NULL; CHECK]; source_type TEXT [NOT NULL]; source_ref TEXT [NOT NULL]; policy_ref TEXT; policy_version INTEGER; expires_at TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | check ( pending_units + available_units + held_units + consumed_units + reversed_units + expired_units = issued_units ); check (coin_type = 'bonus_coins' or expires_at is null); check ( ( coin_type = 'reward_coins' and policy_ref is not null and typeof(policy_version) = 'integer' and policy_version > 0 ) or ( coin_type in ('paid_coins', 'bonus_coins') and policy_ref is null and policy_version is null ) ); foreign key (credit_origin_ref) references platform_coin_credit_origins(credit_origin_ref) deferrable initially deferred | [`server/services/platform/coin-wallet-migrations.mjs`#L40-L81] |
| `platform_coin_holds` | hold_ref TEXT [PK]; wallet_ref TEXT [NOT NULL; FK platform_coin_wallets(wallet_ref)]; purpose TEXT [NOT NULL; CHECK]; purpose_ref TEXT [NOT NULL]; amount_units INTEGER [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; expires_at TEXT [NOT NULL]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/coin-wallet-migrations.mjs`#L84-L94] |
| `platform_coin_hold_allocations` | allocation_ref TEXT [PK]; hold_ref TEXT [NOT NULL; FK platform_coin_holds(hold_ref)]; lot_ref TEXT [NOT NULL; FK platform_coin_lots(lot_ref)]; allocation_sequence INTEGER [NOT NULL; CHECK]; allocated_units INTEGER [NOT NULL; CHECK]; created_at TEXT [NOT NULL] | unique (hold_ref, lot_ref); unique (hold_ref, allocation_sequence) | [`server/services/platform/coin-wallet-migrations.mjs`#L97-L108] |
| `platform_coin_operation_receipts` | operation_ref TEXT [PK]; wallet_ref TEXT [FK platform_coin_wallets(wallet_ref)]; actor_scope TEXT [NOT NULL]; operation_type TEXT [NOT NULL]; idempotency_key TEXT [NOT NULL]; request_digest TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; previous_wallet_version INTEGER [CHECK]; resulting_wallet_version INTEGER [CHECK]; resulting_wallet_status TEXT [CHECK]; result_ref TEXT; safe_result_code TEXT; created_at TEXT [NOT NULL]; completed_at TEXT | unique (actor_scope, operation_type, idempotency_key); check ( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null and previous_wallet_version is null and resulting_wallet_version is null and resulting_wallet_status is null ) or ( status = 'succeeded' and wallet_ref is not null and result_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version >= previous_wallet_version ) or ( status = 'failed' and wallet_ref is not null and safe_result_code is not null and completed_at is not null and previous_wallet_version is not null and resulting_wallet_version is not null and resulting_wallet_status is not null and resulting_wallet_version = previous_wallet_version ) ) | [`server/services/platform/coin-wallet-migrations.mjs`#L111-L176] |
| `platform_coin_credit_origins` | credit_origin_ref TEXT [PK]; wallet_ref TEXT [NOT NULL; FK platform_coin_wallets(wallet_ref)]; coin_type TEXT [NOT NULL; CHECK]; source_type TEXT [NOT NULL]; source_ref TEXT [NOT NULL]; source_digest TEXT [NOT NULL]; operation_ref TEXT [NOT NULL; FK platform_coin_operation_receipts(operation_ref)]; lot_ref TEXT [NOT NULL; UNIQUE]; created_at TEXT [NOT NULL] | unique (wallet_ref, coin_type, source_type, source_ref); foreign key (lot_ref) references platform_coin_lots(lot_ref) deferrable initially deferred | [`server/services/platform/coin-wallet-migrations.mjs`#L179-L193] |
| `platform_coin_ledger_entries` | entry_ref TEXT [PK]; operation_ref TEXT [NOT NULL; FK platform_coin_operation_receipts(operation_ref)]; wallet_ref TEXT [NOT NULL; FK platform_coin_wallets(wallet_ref)]; lot_ref TEXT [NOT NULL; FK platform_coin_lots(lot_ref)]; operation TEXT [NOT NULL]; amount_units INTEGER [NOT NULL; CHECK]; hold_ref TEXT [FK platform_coin_holds(hold_ref)]; order_ref TEXT; source_type TEXT [NOT NULL]; source_ref TEXT [NOT NULL]; actor_type TEXT [NOT NULL]; actor_ref TEXT [NOT NULL]; previous_wallet_version INTEGER [NOT NULL; CHECK]; resulting_wallet_version INTEGER [NOT NULL; CHECK]; resulting_wallet_status TEXT [NOT NULL; CHECK]; occurred_at TEXT [NOT NULL] | — | [`server/services/platform/coin-wallet-migrations.mjs`#L196-L219] |

**Indexes**
- platform_coin_wallets_account_id_idx — platform_coin_wallets(account_id)
- platform_coin_lots_eligible_allocation_idx — platform_coin_lots(wallet_ref, coin_type, expires_at, created_at, lot_ref) WHERE available_units > 0
- platform_coin_holds_active_expiry_idx — platform_coin_holds(expires_at, wallet_ref, hold_ref) WHERE status = 'active'
- platform_coin_operation_receipts_replay_idx — platform_coin_operation_receipts(actor_scope, operation_type, idempotency_key)
- platform_coin_ledger_entries_wallet_page_idx — platform_coin_ledger_entries(wallet_ref, occurred_at desc, entry_ref desc)

**Triggers**
- platform_coin_ledger_entries_immutable_update — before update ON platform_coin_ledger_entries
- platform_coin_ledger_entries_immutable_delete — before delete ON platform_coin_ledger_entries
- platform_coin_operation_receipts_terminal_immutable_update — before update ON platform_coin_operation_receipts
- platform_coin_operation_receipts_immutable_delete — before delete ON platform_coin_operation_receipts
- platform_coin_hold_allocations_immutable_update — before update ON platform_coin_hold_allocations
- platform_coin_hold_allocations_immutable_delete — before delete ON platform_coin_hold_allocations
- platform_coin_holds_expires_at_immutable_update — before update ON platform_coin_holds
- platform_coin_lots_expires_at_immutable_update — before update ON platform_coin_lots

### Coins commerce foundation and initial confirmation (8 tables) — 8 tables

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_coin_commerce_offer_versions` | offer_version_ref TEXT [PK]; offer_ref TEXT [NOT NULL]; version INTEGER [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; category TEXT [NOT NULL; CHECK]; title_zh TEXT [NOT NULL; CHECK]; title_en TEXT [NOT NULL; CHECK]; summary_zh TEXT [NOT NULL; CHECK]; summary_en TEXT [NOT NULL; CHECK]; important_notices_zh_json TEXT [NOT NULL; CHECK]; important_notices_en_json TEXT [NOT NULL; CHECK]; base_coin_units INTEGER [NOT NULL; CHECK]; reference_currency TEXT [NOT NULL; CHECK]; reference_amount_minor INTEGER [NOT NULL; CHECK]; accepted_coin_types_json TEXT [NOT NULL; CHECK]; delivery_kind TEXT [NOT NULL; CHECK]; duration_days INTEGER [CHECK]; monthly_traffic_gb INTEGER [CHECK]; traffic_gb INTEGER [CHECK]; never_expires INTEGER [NOT NULL; CHECK]; discount_basis_points INTEGER [CHECK]; created_at TEXT [NOT NULL]; published_at TEXT; retired_at TEXT | unique (offer_ref, version); check ( ( category = 'plan' and delivery_kind = 'subscription_plan' and duration_days is not null and monthly_traffic_gb is not null and traffic_gb is null and never_expires = 0 and discount_basis_points is not null ) or ( category = 'data_pack' and delivery_kind = 'data_pack' and duration_days is null and monthly_traffic_gb is null and traffic_gb is not null and never_expires = 1 and discount_basis_points is null ) ); check ( (status = 'draft' and published_at is null and retired_at is null) or (status = 'published' and published_at is not null and retired_at is null) or (status = 'retired' and published_at is not null and retired_at is not null) ) | [`server/services/platform/coin-commerce-migrations.mjs`#L27-L129] |
| `platform_coin_commerce_quotes` | quote_ref TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; offer_version_ref TEXT [NOT NULL; FK platform_coin_commerce_offer_versions(offer_version_ref)]; wallet_version INTEGER [NOT NULL; CHECK]; amount_units INTEGER [NOT NULL; CHECK]; applied_discount_basis_points INTEGER [NOT NULL; CHECK]; purchase_availability TEXT [NOT NULL; CHECK]; shortfall_units INTEGER [NOT NULL; CHECK]; allocation_json TEXT [NOT NULL; CHECK]; before_balance_json TEXT [NOT NULL; CHECK]; after_balance_json TEXT [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL]; expires_at TEXT [NOT NULL]; consumed_at TEXT | check ( ( purchase_availability = 'available' and shortfall_units = 0 ) or ( purchase_availability = 'insufficient_balance' and shortfall_units > 0 and json_array_length(allocation_json) = 0 and json(before_balance_json) = json(after_balance_json) ) ); check ( (status = 'consumed' and consumed_at is not null) or (status in ('active', 'expired') and consumed_at is null) ) | [`server/services/platform/coin-commerce-migrations.mjs`#L132-L187] |
| `platform_coin_commerce_orders` | order_ref TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; quote_ref TEXT [NOT NULL; UNIQUE; FK platform_coin_commerce_quotes(quote_ref)]; offer_version_ref TEXT [NOT NULL; FK platform_coin_commerce_offer_versions(offer_version_ref)]; hold_ref TEXT [NOT NULL; UNIQUE; FK platform_coin_holds(hold_ref)]; amount_units INTEGER [NOT NULL; CHECK]; offer_snapshot_json TEXT [NOT NULL; CHECK]; allocation_snapshot_json TEXT [NOT NULL; CHECK]; payment_status TEXT [NOT NULL; CHECK]; cancel_until TEXT [NOT NULL]; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | — | [`server/services/platform/coin-commerce-migrations.mjs`#L190-L222] |
| `platform_coin_commerce_operation_receipts` | operation_ref TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; actor_scope TEXT [NOT NULL]; operation_type TEXT [NOT NULL; CHECK]; idempotency_key TEXT [NOT NULL]; request_digest TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; result_ref TEXT; safe_result_code TEXT; created_at TEXT [NOT NULL]; completed_at TEXT | unique (actor_scope, operation_type, idempotency_key); check ( ( status = 'started' and result_ref is null and safe_result_code is null and completed_at is null ) or ( status = 'succeeded' and result_ref is not null and safe_result_code is null and completed_at is not null ) or ( status = 'failed' and result_ref is null and safe_result_code is not null and completed_at is not null ) ) | [`server/services/platform/coin-commerce-migrations.mjs`#L225-L270] |
| `platform_coin_commerce_order_events` | event_ref TEXT [PK]; order_ref TEXT [NOT NULL; FK platform_coin_commerce_orders(order_ref)]; event_type TEXT [NOT NULL; CHECK]; safe_code TEXT; actor_type TEXT [NOT NULL; CHECK]; actor_ref TEXT [NOT NULL]; occurred_at TEXT [NOT NULL] | check ( ( event_type in ('fulfillment_failed', 'reconciliation_required') and safe_code is not null ) or ( event_type not in ('fulfillment_failed', 'reconciliation_required') and safe_code is null ) ) | [`server/services/platform/coin-commerce-migrations.mjs`#L273-L304] |
| `platform_coin_commerce_fulfillment_commands` | command_ref TEXT [PK]; order_ref TEXT [NOT NULL; UNIQUE; FK platform_coin_commerce_orders(order_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; payload_json TEXT [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; attempt_count INTEGER [NOT NULL; CHECK]; lease_generation INTEGER [NOT NULL; CHECK]; lease_token TEXT; lease_until TEXT; safe_failure_code TEXT; created_at TEXT [NOT NULL]; updated_at TEXT [NOT NULL] | check ( ( status = 'processing' and lease_token is not null and length(lease_token) > 0 and lease_until is not null ) or ( status <> 'processing' and lease_token is null and lease_until is null ) ); check ( (status = 'failed' and safe_failure_code is not null) or (status <> 'failed' and safe_failure_code is null) ) | [`server/services/platform/coin-commerce-migrations.mjs`#L307-L349] |
| `platform_coin_commerce_fulfillment_receipts` | receipt_ref TEXT [PK]; command_ref TEXT [NOT NULL; FK platform_coin_commerce_fulfillment_commands(command_ref)]; effect_ref TEXT [NOT NULL]; status TEXT [NOT NULL; CHECK]; safe_code TEXT [CHECK]; recorded_at TEXT [NOT NULL] | unique (command_ref, effect_ref) | [`server/services/platform/coin-commerce-migrations.mjs`#L352-L361] |
| `platform_coin_commerce_initial_confirmations` | confirmation_ref TEXT [NOT NULL; PK; CHECK]; command_ref TEXT [NOT NULL; UNIQUE; FK platform_coin_commerce_fulfillment_commands(command_ref)]; order_ref TEXT [NOT NULL; UNIQUE; FK platform_coin_commerce_orders(order_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; effect_ref TEXT [NOT NULL; UNIQUE; FK platform_audit_events(id)]; approval_sha256 TEXT [NOT NULL; UNIQUE; CHECK]; inventory_sha256 TEXT [NOT NULL; CHECK]; effect_sha256 TEXT [NOT NULL; CHECK]; receipt_ref TEXT [NOT NULL; UNIQUE; CHECK]; operator_ref TEXT [NOT NULL; CHECK]; resource_request_ref TEXT [NOT NULL; FK platform_issuance_requests(id)]; entitlement_ref TEXT [NOT NULL; FK platform_entitlements(id)]; issued_link_ref TEXT [NOT NULL; FK platform_issued_subscription_links(id)]; failed_updated_at TEXT [NOT NULL]; attempt_count INTEGER [NOT NULL; CHECK]; lease_generation INTEGER [NOT NULL; CHECK]; confirmed_at TEXT [NOT NULL; CHECK] | — | [`server/services/platform/coin-commerce-migrations.mjs`#L941-L974] |

**Indexes**
- offer_versions_one_published_idx — platform_coin_commerce_offer_versions(offer_ref) UNIQUE WHERE status = 'published'
- offer_versions_published_list_idx — platform_coin_commerce_offer_versions(category, published_at desc, offer_ref) WHERE status = 'published'
- quotes_account_status_expiry_idx — platform_coin_commerce_quotes(account_id, status, expires_at, quote_ref)
- orders_due_capture_idx — platform_coin_commerce_orders(cancel_until, order_ref) WHERE payment_status = 'held'
- orders_capture_pending_idx — platform_coin_commerce_orders(updated_at, order_ref) WHERE payment_status = 'capture_pending'
- operation_receipts_replay_idx — platform_coin_commerce_operation_receipts(actor_scope, operation_type, idempotency_key)
- order_events_order_page_idx — platform_coin_commerce_order_events(order_ref, occurred_at desc, event_ref desc)
- fulfillment_commands_claim_idx — platform_coin_commerce_fulfillment_commands(status, lease_until, updated_at, command_ref)
- fulfillment_receipts_command_idx — platform_coin_commerce_fulfillment_receipts(command_ref, recorded_at, receipt_ref)

**Triggers**
- coin_commerce_order_events_immutable_update — before update ON platform_coin_commerce_order_events
- coin_commerce_order_events_immutable_delete — before delete ON platform_coin_commerce_order_events
- coin_commerce_fulfillment_receipts_immutable_update — before update ON platform_coin_commerce_fulfillment_receipts
- coin_commerce_fulfillment_receipts_immutable_delete — before delete ON platform_coin_commerce_fulfillment_receipts
- coin_commerce_quotes_snapshot_immutable_update — before update ON platform_coin_commerce_quotes
- coin_commerce_orders_snapshot_immutable_update — before update ON platform_coin_commerce_orders
- coin_commerce_offer_versions_content_immutable_update — before update ON platform_coin_commerce_offer_versions
- coin_commerce_offer_versions_status_transition — before update ON platform_coin_commerce_offer_versions
- coin_commerce_quotes_status_transition — before update ON platform_coin_commerce_quotes
- coin_commerce_orders_payment_status_transition — before update ON platform_coin_commerce_orders
- coin_commerce_operation_receipts_status_transition — before update ON platform_coin_commerce_operation_receipts
- coin_commerce_fulfillment_commands_status_transition — before update ON platform_coin_commerce_fulfillment_commands
- coin_commerce_offer_versions_terminal_immutable_update — before update ON platform_coin_commerce_offer_versions
- coin_commerce_quotes_terminal_immutable_update — before update ON platform_coin_commerce_quotes
- coin_commerce_operation_receipts_identity_immutable_update — before update ON platform_coin_commerce_operation_receipts
- coin_commerce_operation_receipts_terminal_immutable_update — before update ON platform_coin_commerce_operation_receipts
- coin_commerce_initial_confirmations_insert_guard — before insert ON platform_coin_commerce_initial_confirmations
- coin_commerce_initial_confirmations_immutable_update — before update ON platform_coin_commerce_initial_confirmations
- coin_commerce_initial_confirmations_immutable_delete — before delete ON platform_coin_commerce_initial_confirmations

### Account resource authority (1 table) — 1 table

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_account_resource_authorities` | authority_ref TEXT [PK]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; resource_request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; issued_link_id TEXT [NOT NULL; FK platform_issued_subscription_links(id)]; status TEXT [NOT NULL; CHECK]; version INTEGER [NOT NULL; CHECK]; previous_authority_ref TEXT [FK platform_account_resource_authorities(authority_ref)]; created_at TEXT [NOT NULL; CHECK]; updated_at TEXT [NOT NULL; CHECK]; created_by TEXT [NOT NULL; CHECK]; reason TEXT [NOT NULL; CHECK]; revoked_at TEXT; revoked_by TEXT; revocation_reason TEXT | unique (account_id, version); check ( ( status = 'active' and revoked_at is null and revoked_by is null and revocation_reason is null ) or ( status = 'revoked' and revoked_at is not null and length(trim(revoked_at)) > 0 and revoked_by is not null and length(trim(revoked_by)) > 0 and revocation_reason is not null and length(trim(revocation_reason)) > 0 ) ) | [`server/services/platform/account-resource-authority-migrations.mjs`#L31-L73] |

**Indexes**
- account_resource_authorities_active_account_uidx — platform_account_resource_authorities(account_id) UNIQUE WHERE status = 'active'
- account_resource_authorities_active_request_uidx — platform_account_resource_authorities(resource_request_id) UNIQUE WHERE status = 'active'
- account_resource_authorities_active_entitlement_uidx — platform_account_resource_authorities(entitlement_id) UNIQUE WHERE status = 'active'
- account_resource_authorities_active_link_uidx — platform_account_resource_authorities(issued_link_id) UNIQUE WHERE status = 'active'

**Triggers**
- account_resource_authorities_insert_state_guard — before insert ON platform_account_resource_authorities
- account_resource_authorities_insert_lineage_guard — before insert ON platform_account_resource_authorities
- account_resource_authorities_insert_cas_guard — before insert ON platform_account_resource_authorities
- account_resource_authorities_revoke_only_update — before update ON platform_account_resource_authorities
- account_resource_authorities_delete_deny — before delete ON platform_account_resource_authorities

### Commerce authority quote binding (1 table) — 1 table

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_commerce_authority_quote_bindings` | quote_ref TEXT [PK; FK platform_coin_commerce_quotes(quote_ref)]; authority_ref TEXT [NOT NULL; FK platform_account_resource_authorities(authority_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; authority_version INTEGER [NOT NULL; CHECK]; resource_request_id TEXT [NOT NULL; FK platform_issuance_requests(id)]; entitlement_id TEXT [NOT NULL; FK platform_entitlements(id)]; issued_link_id TEXT [NOT NULL; FK platform_issued_subscription_links(id)]; created_at TEXT [NOT NULL; CHECK] | foreign key (account_id, authority_version) references platform_account_resource_authorities(account_id, version) on delete restrict | [`server/services/platform/account-resource-authority-commerce-migrations.mjs`#L25-L48] |

**Triggers**
- commerce_authority_quote_bindings_insert_guard — before insert ON platform_commerce_authority_quote_bindings
- commerce_authority_quote_bindings_update_deny — before update ON platform_commerce_authority_quote_bindings
- commerce_authority_quote_bindings_delete_deny — before delete ON platform_commerce_authority_quote_bindings

### Plan-switch schema contract (2 tables) — 2 tables

| Table | Columns (type; NOT NULL; PK; UNIQUE; DEFAULT; FK; CHECK`) | Table-level constraints | Source |
|---|---|---|---|
| `platform_coin_commerce_plan_switch_quotes` | quote_ref TEXT [PK; FK platform_coin_commerce_quotes(quote_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; CHECK]; kind TEXT [NOT NULL; CHECK]; from_offer_version_ref TEXT [NOT NULL; CHECK]; to_offer_version_ref TEXT [NOT NULL; CHECK]; snapshot_valid_from TEXT [NOT NULL; CHECK]; snapshot_valid_until TEXT [NOT NULL; CHECK]; list_price_units INTEGER [NOT NULL; CHECK]; credit_units INTEGER [NOT NULL; CHECK]; pending_credit_units INTEGER [NOT NULL; CHECK]; charge_units INTEGER [NOT NULL; CHECK]; cancels_switch_ref TEXT; effective_at TEXT; created_at TEXT [NOT NULL; CHECK] | check (snapshot_valid_from < snapshot_valid_until); check ( ( kind = 'renewal' and from_offer_version_ref = to_offer_version_ref ) or ( kind <> 'renewal' and from_offer_version_ref <> to_offer_version_ref ) ); check ( ( kind = 'downgrade_scheduled' and effective_at is not null and length(trim(effective_at)) > 0 ) or ( kind <> 'downgrade_scheduled' and effective_at is null ) ) | [`server/services/platform/coin-commerce-plan-switch-schema-contract.mjs`#L21-L86] |
| `platform_scheduled_plan_switches` | switch_ref TEXT [PK; FK platform_coin_commerce_orders(order_ref)]; account_id TEXT [NOT NULL; FK platform_accounts(id)]; entitlement_id TEXT [NOT NULL; CHECK]; from_offer_version_ref TEXT [NOT NULL; CHECK]; to_offer_version_ref TEXT [NOT NULL; CHECK]; effective_at TEXT [NOT NULL; CHECK]; paid_units INTEGER [NOT NULL; CHECK]; status TEXT [NOT NULL; CHECK]; created_at TEXT [NOT NULL; CHECK]; resolved_at TEXT; superseded_by_order_ref TEXT | check (from_offer_version_ref <> to_offer_version_ref); check ( ( status in ('scheduled', 'applying') and resolved_at is null and superseded_by_order_ref is null ) or ( status = 'applied' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is null ) or ( status = 'superseded' and resolved_at is not null and length(trim(resolved_at)) > 0 and superseded_by_order_ref is not null and length(trim(superseded_by_order_ref)) > 0 ) ) | [`server/services/platform/coin-commerce-plan-switch-schema-contract.mjs`#L103-L147] |

**Indexes**
- platform_scheduled_plan_switches_one_scheduled_uidx — platform_scheduled_plan_switches(account_id) UNIQUE WHERE status in ('scheduled', 'applying')

**Triggers**
- platform_coin_commerce_plan_switch_quotes_update_deny — before update ON platform_coin_commerce_plan_switch_quotes
- platform_coin_commerce_plan_switch_quotes_delete_deny — before delete ON platform_coin_commerce_plan_switch_quotes
- platform_scheduled_plan_switches_insert_guard — before insert ON platform_scheduled_plan_switches
- platform_scheduled_plan_switches_status_transition — before update ON platform_scheduled_plan_switches
- platform_scheduled_plan_switches_delete_deny — before delete ON platform_scheduled_plan_switches
- platform_coin_commerce_plan_switch_quotes_cancel_ref_guard — before insert ON platform_coin_commerce_plan_switch_quotes

### Wallet reference indexes (no additional table)

Source: [`server/services/platform/coin-wallet-reference-index-migrations.mjs`#L1-L859], blob `e3d79f5d3c678e9aa6d0cc204ec598579e032894`.

- platform_coin_hold_allocations_lot_ref_idx — platform_coin_hold_allocations(lot_ref)
- platform_coin_ledger_entries_lot_ref_idx — platform_coin_ledger_entries(lot_ref)
- platform_coin_ledger_entries_hold_ref_idx — platform_coin_ledger_entries(hold_ref)

## 4. Migration identity map — core slice

| Owner module | Migration ID(s) | Source checksum contract |
|---|---|---|
| `server/services/platform/subscription-control-db.mjs` | Baseline DDL is embedded in the control-store source; no migration ID or DDL checksum is declared for this baseline block. | [`server/services/platform/subscription-control-db.mjs`#L1-L300], blob `bc6694a93f452f97393ff6f1a8099e854c0b19ac` |
| `server/services/platform/coin-wallet-migrations.mjs` | `20260723_001_coin_wallet_foundation` — `COIN_WALLET_MIGRATIONS[0].ddlChecksum` (`GCCWEBOS:COIN_WALLET_DDL:v1` + normalized statements joined with NUL). | [`server/services/platform/coin-wallet-migrations.mjs`#L1-L300], blob `a5414ca48ea070febbb360f133475a47c1d09e79` |
| `server/services/platform/coin-commerce-migrations.mjs` | `20260726_001_coin_commerce_foundation` — `COIN_COMMERCE_MIGRATIONS[0].ddlChecksum`; `20260906_001_coin_commerce_initial_confirmation` — `INITIAL_CONFIRMATION_CHECKSUM`. | [`server/services/platform/coin-commerce-migrations.mjs`#L1-L300], blob `4a881201ec33926d75f6ddc6a8b5f4e0c371424d` |
| `server/services/platform/account-resource-authority-migrations.mjs` | `20260807_001_account_resource_authority` — `ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum`. | [`server/services/platform/account-resource-authority-migrations.mjs`#L1-L300], blob `c2054eea9ae74c449af23b49aa1d24907c086e51` |
| `server/services/platform/account-resource-authority-commerce-migrations.mjs` | `20260808_001_account_resource_authority_commerce_binding` — `ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum`. | [`server/services/platform/account-resource-authority-commerce-migrations.mjs`#L1-L300], blob `d438eaab69d95920f24aade780043a4b1a232457` |
| `server/services/platform/coin-wallet-reference-index-migrations.mjs` | `20260730_001_coin_wallet_reference_indexes` — `COIN_WALLET_REFERENCE_INDEX_MIGRATIONS[0].ddlChecksum`. | [`server/services/platform/coin-wallet-reference-index-migrations.mjs`#L1-L300], blob `e3d79f5d3c678e9aa6d0cc204ec598579e032894` |
| `server/services/platform/coin-commerce-plan-switch-schema-contract.mjs` | `20261010_001_coin_commerce_plan_switch` — checksum is computed by `coin-commerce-plan-switch-migrations.mjs` as `PLAN_SWITCH_MIGRATIONS[0].ddlChecksum`. | [`server/services/platform/coin-commerce-plan-switch-schema-contract.mjs`#L1-L293], blob `b024767ea533f114a54d413ef3b038c9806ce16e` |

**Checksum discipline:** most DDL checksums are computed at module load from the migration statement arrays rather than committed as literal hex strings. This matrix records the exported checksum symbol and hash-input contract instead of copying a value that can drift independently from the source. The exact value for a migration execution must be read from the matching export on the exact source head.

## 5. Core-slice inventory counts

| Slice | Tables | Indexes | Triggers |
|---|---:|---:|---:|
| `subscription-control-db.mjs` | 28 | 49 | 0 |
| `coin-wallet-migrations.mjs` | 8 | 5 | 8 |
| `coin-commerce-migrations.mjs` | 8 | 9 | 19 |
| `account-resource-authority-migrations.mjs` | 1 | 4 | 5 |
| `account-resource-authority-commerce-migrations.mjs` | 1 | 0 | 3 |
| `coin-wallet-reference-index-migrations.mjs` | 0 | 3 | 0 |
| `coin-commerce-plan-switch-schema-contract.mjs` | 2 | 1 | 6 |
| **Core-slice total** | **48** | **71** | **41** |

The shared ledger is deduplicated in the overall count. Wallet reference indexes add indexes to existing wallet tables and do not add a table.

## 6. Companion G1-21–G1-26 schema annexes (22 tables)

This repository matrix keeps the **48-table core slice** above. The remaining 22 source-defined tables are documented in the six companion G1 schema dossiers below. Together, the core slice (48) and these annexes (22) complete the **70-table integrated source inventory**.

These are source-schema counts, not proof that every optional or archival object exists in a production SQLite file. The linked dossiers preserve the per-table columns, constraints, indexes, triggers, source references, and G1-F correction history.

| G1 slice | Tables counted | Scope note | Companion evidence |
|---|---:|---|---|
| G1-21 Payment and legacy archive | 3 | 2 payment tables plus 1 conditional legacy archive table; archive forms only when the old table fingerprint matches | [Payment schema dossier](https://drive.google.com/file/d/1N_LLemPXIYw16Zdent-QdqPoTrzfI49N/view) · SHA-256 `d0beb66d60f7763f64e95c76fc2df971462826fad9f6a4bd32920366c628d159` |
| G1-22 Referral | 7 | Referral policy, attribution, reward, and event tables | [Referral schema dossier](https://drive.google.com/file/d/138zkC3Q7qzYB4DOs9jsE-rVKpWuVAp4A/view) · SHA-256 `8ca38d7738d55020da305d71f973e1848277309fb802c2a7d97f56fc8e6bf384` |
| G1-23 Deferred Transition | 6 | Deferred resource transition and reservation state | [Deferred schema dossier](https://drive.google.com/file/d/1gCIX63uGW3ya-ZykQ6DkWSr_4beQDxcp/view) · SHA-256 `8058c14bcafcd547a161ffd7c703db23e881c344e729665424d2648200ad6f64` |
| G1-24 Checkout / Claims / Handoffs | 3 | Wallet-first checkout quote, runtime claim, and setup-delivery handoff | [Checkout / Claims / Handoffs dossier](https://drive.google.com/file/d/1W60RapRcWfjciklgu3szWJZRZej7MJVt/view) · SHA-256 `18a53a996c7ef754039bc4c4ebbdc13239e4026ea6909b2887b630b55ac1dadc` |
| G1-25 Welcome Bonus | 1 | Registration welcome grant, including its chained schema migrations | [Welcome Bonus schema dossier](https://drive.google.com/file/d/15QHyN2kZrDWY9OUzfNq5c5tVoWw8vABv/view) · SHA-256 `e95ee6fda8e65d42267a53f8e9e87ca08ae0f1f9e1e87f94a35e776ac3306354` |
| G1-26 Ads Consent | 2 | Conditional Consent tables; enabled only through the source's feature and store-construction gates | [Ads Consent schema dossier](https://drive.google.com/file/d/1fE5D3N6Q0DEhpnQ2Bpcg7CK3sZrzpXKz/view) · SHA-256 `a35915bfdafbcf028605b2c1b25eacb6536cfc137d07da436483c2599eb48155` |
| **Companion total** | **22** | Includes the conditional Payment archive | |

### Objects excluded from the 70-table integrated inventory

- **Ads Conversion (3 tables):** DDL exists, but the schema-creation helper has test callers only; production composition uses fail-soft write helpers and does not create these tables. Keep them outside the D1 migration set pending Issue #816 and its separate risk decision.
- **Portal Link Reset (1 manually prepared table, 2 unique indexes):** this schema is not created by the normal control-store assembly. Track it as a separately prepared optional object; do not add it to the 70-table integrated count.
- **Subscription runtime database:** its 4 tables remain in `subscriptions.sqlite`, outside the first D1 cutover.
- **Optional third-party subscription database:** its 7 tables remain separate and outside the first D1 cutover.

The 18 versioned control-store migration IDs and their exact checksum-input contracts are recorded in the G1-28 migration ledger. The companion dossiers are evidence references; the source code at the stated Master baseline remains authoritative.
