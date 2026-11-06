import assert from "node:assert/strict";
import test from "node:test";
import { runCoinCommerceInitialConfirmationGuardSchemaCli } from "../scripts/platform-coin-commerce-initial-confirmation-guard-schema.mjs";
import {
  REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID as ID,
  COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS
} from "../server/services/platform/coin-commerce-initial-confirmation-guard-plan-c-ddl.mjs";

const CHECKSUM = COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum;

test("Plan C schema CLI requires exact migration confirmation for apply", async () => {
  const result = await runCoinCommerceInitialConfirmationGuardSchemaCli({
    argv: ["--mode", "apply", "--db-path", "/tmp/plan-c.sqlite"]
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.reasonCode, "apply_confirmation_required");
  assert.equal(result.output.redacted, true);
});

test("Plan C schema CLI rejects a mismatched migration ID before opening the database", async () => {
  const result = await runCoinCommerceInitialConfirmationGuardSchemaCli({
    argv: ["--mode", "apply", "--db-path", "/tmp/no-open.sqlite",
      "--confirm-migration-id", "wrong", "--confirm-ddl-checksum", CHECKSUM]
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.reasonCode, "migration_id_mismatch");
});

test("Plan C schema CLI rejects a mismatched checksum before opening the database", async () => {
  const result = await runCoinCommerceInitialConfirmationGuardSchemaCli({
    argv: ["--mode", "apply", "--db-path", "/tmp/no-open.sqlite",
      "--confirm-migration-id", ID, "--confirm-ddl-checksum", "0".repeat(64)]
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.reasonCode, "migration_checksum_mismatch");
});

test("Plan C schema CLI rejects write confirmations in validate mode", async () => {
  const result = await runCoinCommerceInitialConfirmationGuardSchemaCli({
    argv: ["--mode", "validate", "--db-path", "/tmp/no-open.sqlite",
      "--confirm-migration-id", ID, "--confirm-ddl-checksum", CHECKSUM]
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.reasonCode, "argument_not_allowed_for_mode");
});
