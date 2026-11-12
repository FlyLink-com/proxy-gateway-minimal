import { ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS } from "./account-resource-authority-migrations.mjs";
import { ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS } from "./account-resource-authority-commerce-migrations.mjs";
import { COIN_COMMERCE_MIGRATIONS, COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS } from "./coin-commerce-migrations.mjs";
import { COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS } from "./coin-commerce-initial-confirmation-guard-plan-c-ddl.mjs";
import { PLAN_SWITCH_MIGRATIONS } from "./coin-commerce-plan-switch-migrations.mjs";
import { COIN_WALLET_MIGRATIONS } from "./coin-wallet-migrations.mjs";
import { COIN_WALLET_REFERENCE_INDEX_MIGRATIONS } from "./coin-wallet-reference-index-migrations.mjs";
import { PAYMENT_STORE_MIGRATIONS } from "./payment-store-migrations.mjs";
import { REFERRAL_DDL_CHECKSUM, REFERRAL_MIGRATION_ID } from "./portal-referral-migrations.mjs";
import { DEFERRED_RESOURCE_TRANSITION_MIGRATIONS } from "./deferred-resource-transition-migrations.mjs";
import { WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS } from "./wallet-first-deferred-checkout-migrations.mjs";
import { WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS } from "./wallet-first-resource-effect-runtime-claims-migrations.mjs";
import { WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS } from "./wallet-first-setup-delivery-handoffs-migrations.mjs";
import { PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS } from "./portal-registration-welcome-bonus-migrations.mjs";

function normalizeEntries(entries) {
  return entries.map((entry) => ({
    migrationId: entry.id ?? entry.migrationId,
    ddlSha256: entry.ddlChecksum
  }));
}

export const SOURCE_MIGRATION_REGISTRY = Object.freeze([
  ...normalizeEntries(COIN_WALLET_MIGRATIONS),
  ...normalizeEntries(COIN_COMMERCE_MIGRATIONS),
  ...normalizeEntries(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS),
  ...normalizeEntries(PAYMENT_STORE_MIGRATIONS),
  ...normalizeEntries(ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS),
  ...normalizeEntries(ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS),
  ...normalizeEntries(PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS),
  ...normalizeEntries(DEFERRED_RESOURCE_TRANSITION_MIGRATIONS),
  ...normalizeEntries(WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS),
  ...normalizeEntries(WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS),
  ...normalizeEntries(WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS),
  ...normalizeEntries(COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS),
  { migrationId: REFERRAL_MIGRATION_ID, ddlSha256: REFERRAL_DDL_CHECKSUM },
  ...normalizeEntries(PLAN_SWITCH_MIGRATIONS),
  ...normalizeEntries(COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS)
].map((entry) => Object.freeze(entry)));

export function validateD1SourceMigrationChecksums(inventory, registry = SOURCE_MIGRATION_REGISTRY) {
  const errors = [];
  const add = (condition, code) => { if (!condition) errors.push(code); };
  if (!inventory || typeof inventory !== "object" || !Array.isArray(inventory.sourceMigrationHistory)) {
    return { valid: false, errors: ["source_migration_inventory_invalid"], actualCount: 0 };
  }
  if (!Array.isArray(registry)) {
    return { valid: false, errors: ["source_migration_registry_invalid"], actualCount: 0 };
  }

  const expected = inventory.sourceMigrationHistory;
  const ids = registry.map((entry) => entry?.migrationId);
  add(ids.every((id) => typeof id === "string" && id.length > 0), "registry_migration_id_invalid");
  add(new Set(ids).size === ids.length, "registry_migration_id_duplicate");

  const byId = new Map(registry.filter((entry) => typeof entry?.migrationId === "string")
    .map((entry) => [entry.migrationId, entry]));
  const expectedIds = new Set(expected.map((entry) => entry?.migrationId));

  for (const item of expected) {
    const id = item?.migrationId ?? "unknown";
    const actual = byId.get(id);
    if (!actual) {
      errors.push(`source_migration_missing:${id}`);
      continue;
    }
    add(/^[0-9a-f]{64}$/.test(actual.ddlSha256 ?? ""), `registry_checksum_invalid:${id}`);
    add(actual.ddlSha256 === item.ddlSha256, `source_migration_checksum_mismatch:${id}`);
  }
  for (const id of ids) {
    if (typeof id === "string" && !expectedIds.has(id)) errors.push(`source_migration_unexpected:${id}`);
  }
  add(registry.length === expected.length, "source_migration_registry_count_mismatch");

  return {
    valid: errors.length === 0,
    errors,
    expectedCount: expected.length,
    actualCount: registry.length
  };
}
