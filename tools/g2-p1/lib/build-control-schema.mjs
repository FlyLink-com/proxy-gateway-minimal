// G2-P1: experiment-schema builder.
//
// Builds the control-store schema from THIS checkout's own migration
// modules, using their fail-closed apply entry points, in the same DAG
// order as the G2 spike (build-sqlite.mjs) plus the Plan C guard
// extension step (merged in #832). The FK definitions under test are
// therefore byte-identical to production DDL by construction; only the
// shielding guard triggers listed in EXPERIMENT_OMIT_TRIGGERS are
// dropped afterwards (see README.md for why each is omitted and why
// the FK / unique-index under test is unaffected by its removal).
//
// The legacy payment-orders prestate fixture is inlined below verbatim
// (default options) from
// server/tests/platform-payment-store-migrations.test.mjs
// (createLegacyPaymentOrdersSchema, default driftPlanIndex=false,
// omitStatusConstraint=false); the runner does not eval test files.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const PLAT = join(REPO_ROOT, "server", "services", "platform");

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Guard triggers omitted from the experiment schema. Union of the
// per-item omission lists in g2-p1-fixture.json (verified by the
// runner: every listed trigger must exist in the built schema and be
// absent afterwards; every other trigger must be present).
export const EXPERIMENT_OMIT_TRIGGERS = [
  // INSERT guards
  "account_resource_authorities_insert_cas_guard",
  "account_resource_authorities_insert_lineage_guard",
  "account_resource_authorities_insert_state_guard",
  "commerce_authority_quote_bindings_insert_guard",
  "deferred_resource_transition_rebases_transition_binding_insert",
  "deferred_resource_transition_reservation_allocations_snapshot_binding_insert",
  "deferred_resource_transition_reservations_wallet_account_binding_insert",
  "deferred_resource_transitions_reservation_binding_insert",
  "deferred_resource_transitions_initial_state_reserved",
  "coin_commerce_initial_confirmations_insert_guard",
  // UPDATE guards
  "account_resource_authorities_revoke_only_update",
  "coin_commerce_operation_receipts_identity_immutable_update",
  "coin_commerce_orders_snapshot_immutable_update",
  "platform_coin_commerce_plan_switch_quotes_update_deny",
  "commerce_authority_quote_bindings_update_deny",
  "deferred_resource_transition_operation_receipts_identity_immutable_update",
  "deferred_resource_transition_rebases_identity_immutable_update",
  "deferred_resource_transition_reservation_allocations_immutable_update",
  "deferred_resource_transition_reservations_identity_immutable_update",
  "deferred_resource_transitions_effect_successor_snapshot_transition",
  "deferred_resource_transitions_rebase_transition",
  "deferred_resource_transitions_identity_immutable_update",
  "platform_payment_receipts_fact_immutable_update",
  "platform_referral_accrual_origin_immutable",
  "platform_referral_bindings_immutable_update",
  "platform_referral_origins_immutable_update",
  "platform_scheduled_plan_switches_status_transition",
  "coin_commerce_initial_confirmations_immutable_update",
  // DELETE guards (only for delete-parent probes of the items that need them)
  "account_resource_authorities_delete_deny",
  "platform_referral_profile_no_delete",
  "platform_referral_touches_immutable_delete",
];

// Legacy payment-orders prestate, verbatim default path of
// createLegacyPaymentOrdersSchema() in
// server/tests/platform-payment-store-migrations.test.mjs.
const LEGACY_PAYMENT_ORDERS_SCHEMA = `
    create table if not exists platform_payment_orders (
      order_ref text primary key,
      portal_user_ref text not null,
      plan text not null check (plan in ('monthly_basic', 'monthly_plus', 'yearly')),
      plan_label text not null,
      amount_minor integer not null check (amount_minor > 0),
      money text not null,
      currency text not null,
      duration_days integer not null check (duration_days > 0),
      client_target text not null check (client_target in ('clash', 'karing')),
      channel text not null check (channel in ('alipay', 'wxpay', 'qqpay', 'bank', 'jdpay')),
      status text not null check (status in (
        'pending_payment',
        'payment_amount_mismatch',
        'payment_failed',
        'paid_pending_admin_review',
        'paid_access_delivered',
        'paid_delivery_blocked'
      )),
      provider text not null,
      provider_order_ref text,
      checkout_url text,
      access_request_ref text,
      access_request_status text,
      paid_at text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists platform_payment_orders_portal_user_idx
      on platform_payment_orders(portal_user_ref, created_at);
    create index if not exists platform_payment_orders_status_idx
      on platform_payment_orders(status, created_at);
    create index if not exists platform_payment_orders_plan_idx
      on platform_payment_orders(plan, created_at);
    alter table platform_payment_orders add column checkout_expires_at text;
    alter table platform_payment_orders add column checkout_url_scheme text;
    alter table platform_payment_orders add column checkout_qr_code text;
    alter table platform_payment_orders add column refund_status text check (refund_status is null or refund_status in ('refund_requested', 'refund_approved', 'refund_pending_provider', 'refund_succeeded', 'refund_failed', 'refund_rejected'));
    alter table platform_payment_orders add column refund_requested_at text;
    alter table platform_payment_orders add column refund_approved_at text;
    alter table platform_payment_orders add column refund_amount_minor integer check (refund_amount_minor is null or refund_amount_minor >= 0);
    alter table platform_payment_orders add column refund_remaining_days integer check (refund_remaining_days is null or refund_remaining_days >= 0);
    alter table platform_payment_orders add column refund_reason_code text;
    alter table platform_payment_orders add column refund_provider_ref text;
    alter table platform_payment_orders add column refund_failed_reason text;
`;

// Builds the full control-store schema into a fresh better-sqlite3
// database at dbPath (file), then returns the sqlite_master object
// list. The caller drops EXPERIMENT_OMIT_TRIGGERS (see
// buildExperimentObjects) and reuses the objects for both engines.
export async function buildControlStoreObjects(dbPath) {
  const { rmSync } = await import("node:fs");
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  const db = new Database(dbPath);

  function snapshot() {
    const rows = db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all();
    return new Map(rows.map((r) => [`${r.type}:${r.name}`, r]));
  }

  const attribution = new Map();
  const stepLog = [];
  function runStep(name, fn) {
    const before = snapshot();
    const result = fn();
    const after = snapshot();
    let created = 0;
    let changed = 0;
    for (const [key, row] of after) {
      if (!before.has(key)) {
        created++;
        attribution.set(key, name);
      } else if (before.get(key).sql !== row.sql) {
        changed++;
        attribution.set(key, `${attribution.get(key) ?? "?"} -> modified by ${name}`);
      }
    }
    stepLog.push({ step: name, created, changed });
    return result;
  }

  const wallet = await import(`${PLAT}/coin-wallet-migrations.mjs`);
  const refIdx = await import(`${PLAT}/coin-wallet-reference-index-migrations.mjs`);
  const commerce = await import(`${PLAT}/coin-commerce-migrations.mjs`);
  const planSwitch = await import(`${PLAT}/coin-commerce-plan-switch-migrations.mjs`);
  const ara = await import(`${PLAT}/account-resource-authority-migrations.mjs`);
  const binding = await import(`${PLAT}/account-resource-authority-commerce-migrations.mjs`);
  const payment = await import(`${PLAT}/payment-store-migrations.mjs`);
  const referral = await import(`${PLAT}/portal-referral-migrations.mjs`);
  const welcome = await import(`${PLAT}/portal-registration-welcome-bonus-migrations.mjs`);
  const deferred = await import(`${PLAT}/deferred-resource-transition-migrations.mjs`);
  const checkout = await import(`${PLAT}/wallet-first-deferred-checkout-migrations.mjs`);
  const claims = await import(`${PLAT}/wallet-first-resource-effect-runtime-claims-migrations.mjs`);
  const handoffs = await import(`${PLAT}/wallet-first-setup-delivery-handoffs-migrations.mjs`);
  const controlDb = await import(`${PLAT}/subscription-control-db.mjs`);
  const adsConsent = await import(`${PLAT}/ads-consent-store.mjs`);
  const planC = await import(`${PLAT}/coin-commerce-initial-confirmation-guard-plan-c-schema.mjs`);

  const migArg = (arr, id) => {
    const entry = arr.find((m) => (m.id ?? m.migrationId) === id);
    if (!entry) throw new Error(`migration ${id} not found in exported array`);
    return { database: db, expectedMigrationId: id, expectedDdlChecksum: entry.ddlChecksum };
  };

  runStep("baseline-control-store", () =>
    controlDb.createSqliteSubscriptionControlStore({ database: db, dbPath }),
  );
  runStep("payment-legacy-prestate(fixture)", () => db.exec(LEGACY_PAYMENT_ORDERS_SCHEMA));
  runStep("wallet-foundation", () =>
    wallet.applyCoinWalletMigrations(migArg(wallet.COIN_WALLET_MIGRATIONS, wallet.REQUIRED_COIN_WALLET_MIGRATION_ID)),
  );
  runStep("wallet-reference-indexes", () =>
    refIdx.applyCoinWalletReferenceIndexMigrations(
      migArg(refIdx.COIN_WALLET_REFERENCE_INDEX_MIGRATIONS, refIdx.REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID),
    ),
  );
  runStep("commerce-foundation", () =>
    commerce.applyCoinCommerceMigrations(migArg(commerce.COIN_COMMERCE_MIGRATIONS, commerce.REQUIRED_COIN_COMMERCE_MIGRATION_ID)),
  );
  runStep("commerce-initial-confirmation", () =>
    commerce.applyCoinCommerceInitialConfirmationMigrations(
      migArg(commerce.COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS, commerce.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID),
    ),
  );
  runStep("commerce-initial-confirmation-guard-plan-c", () =>
    planC.applyCoinCommerceInitialConfirmationGuardMigrations({
      database: db,
      expectedMigrationId: planC.REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID,
      expectedDdlChecksum: planC.COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum,
    }),
  );
  runStep("plan-switch", () =>
    planSwitch.applyPlanSwitchMigrations(migArg(planSwitch.PLAN_SWITCH_MIGRATIONS, planSwitch.PLAN_SWITCH_MIGRATIONS[0].id)),
  );
  runStep("account-resource-authority", () =>
    ara.applyAccountResourceAuthorityMigrations(
      migArg(ara.ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS, ara.REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID),
    ),
  );
  runStep("authority-commerce-binding", () =>
    binding.applyAccountResourceAuthorityCommerceMigrations(
      migArg(
        binding.ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
        binding.REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      ),
    ),
  );
  runStep("payment-store(closure+archive)", () => payment.applyPaymentStoreMigrations({ database: db }));
  runStep("referral", () =>
    referral.applyPortalReferralMigration(db, {
      expectedMigrationId: referral.REFERRAL_MIGRATION_ID,
      expectedDdlChecksum: referral.REFERRAL_DDL_CHECKSUM,
    }),
  );
  runStep("welcome-bonus-chain(3 migrations)", () =>
    welcome.applyPortalRegistrationWelcomeBonusMigrations(
      migArg(welcome.PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS, welcome.REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID),
    ),
  );
  runStep("deferred-transitions(+risk-a-gates)", () =>
    deferred.applyDeferredResourceTransitionMigrations({
      database: db,
      expectedMigrationId: deferred.REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
      expectedDdlChecksum: deferred.REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    }),
  );
  runStep("deferred-checkout-quotes", () =>
    checkout.applyWalletFirstDeferredCheckoutMigrations(
      migArg(checkout.WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS, checkout.REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID),
    ),
  );
  runStep("resource-effect-runtime-claims", () =>
    claims.applyWalletFirstResourceEffectRuntimeClaimsMigrations(
      migArg(
        claims.WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS,
        claims.REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
      ),
    ),
  );
  runStep("setup-delivery-handoffs", () =>
    handoffs.applyWalletFirstSetupDeliveryHandoffsMigrations(
      migArg(
        handoffs.WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS,
        handoffs.REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      ),
    ),
  );
  runStep("ads-consent(lazy)", () => adsConsent.ensureAdsConsentSchema(db));

  const ledgerRows = db
    .prepare("SELECT migration_id, ddl_checksum FROM platform_schema_migrations ORDER BY migration_id")
    .all();

  const objects = [...snapshot().values()].map((r) => ({
    type: r.type,
    name: r.name,
    tbl_name: r.tbl_name,
    sql: r.sql,
    step: attribution.get(`${r.type}:${r.name}`) ?? "unknown",
  }));
  const counts = {
    tables: objects.filter((o) => o.type === "table").length,
    indexesWithSql: objects.filter((o) => o.type === "index" && o.sql !== null).length,
    indexesTotal: objects.filter((o) => o.type === "index").length,
    triggers: objects.filter((o) => o.type === "trigger").length,
  };
  db.close();
  return { objects, ledgerRows, counts, stepLog };
}

// Builds the experiment schema: full control-store objects minus the
// shielding guard triggers. Returns the object list the engines are
// built from, plus verification data. Throws unless every omitted
// trigger existed in the built schema.
export async function buildExperimentObjects(dbPath, omitTriggers = EXPERIMENT_OMIT_TRIGGERS) {
  const built = await buildControlStoreObjects(dbPath);
  const present = new Set(built.objects.filter((o) => o.type === "trigger").map((o) => o.name));
  const missing = omitTriggers.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(`omitted triggers not present in built schema: ${missing.join(", ")}`);
  }
  const omitted = omitTriggers.map((name) => {
    const obj = built.objects.find((o) => o.type === "trigger" && o.name === name);
    return { name, table: obj.tbl_name, sqlSha256: sha256(obj.sql ?? "") };
  });
  const objects = built.objects.filter(
    (o) => !(o.type === "trigger" && omitTriggers.includes(o.name)),
  );
  const fkInventory = fkList(objects);
  return {
    ...built,
    objects,
    omittedTriggers: omitted,
    omitCount: omitTriggers.length,
    fkCount: fkInventory.length,
    fkInventory,
    objectSha256: sha256(
      JSON.stringify(
        objects.map((o) => [o.type, o.name, o.sql ?? null]).sort(),
      ),
    ),
  };
}

// All FOREIGN KEY definitions in an object list, via PRAGMA
// foreign_key_list on a temp in-memory build (byte-identical SQL is
// guaranteed by construction; the pragma view is the checkable form).
export function fkList(objects) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const o of objects.filter((x) => x.type === "table")) db.exec(o.sql);
  const out = [];
  for (const table of objects.filter((x) => x.type === "table").map((x) => x.name).sort()) {
    for (const fk of db.pragma(`foreign_key_list(${table})`)) {
      out.push({
        table,
        id: fk.id,
        seq: fk.seq,
        column: fk.from,
        parentTable: fk.table,
        parentColumn: fk.to,
        onUpdate: fk.on_update,
        onDelete: fk.on_delete,
        match: fk.match,
      });
    }
  }
  db.close();
  out.sort((a, b) =>
    a.table.localeCompare(b.table) ||
    a.id - b.id ||
    a.seq - b.seq,
  );
  return out;
}

export { REPO_ROOT };
export function readFixture() {
  return JSON.parse(readFileSync(join(HERE, "..", "g2-p1-fixture.json"), "utf8"));
}
