import { createHash } from "node:crypto";

export const REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID =
  "20261105_001_coin_commerce_initial_confirmation_guard_plan_c";

export const INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENT = "CREATE TRIGGER coin_commerce_initial_confirmations_insert_guard\nBEFORE INSERT ON platform_coin_commerce_initial_confirmations\nWHEN NOT (\n  EXISTS (\n    SELECT 1\n    FROM platform_coin_commerce_fulfillment_commands c\n    JOIN platform_coin_commerce_orders o ON o.order_ref = c.order_ref\n    JOIN platform_coin_holds h ON h.hold_ref = o.hold_ref\n    JOIN platform_coin_wallets w ON w.wallet_ref = h.wallet_ref\n    WHERE c.command_ref = new.command_ref\n        and c.order_ref = new.order_ref\n        and c.account_id = new.account_id\n        and c.status = 'failed'\n        and c.safe_failure_code = 'fulfillment_handler_unavailable'\n        and c.lease_token is null\n        and c.lease_until is null\n        and c.updated_at = new.failed_updated_at\n        and c.attempt_count = new.attempt_count\n        and c.lease_generation = new.lease_generation\n        and o.account_id = new.account_id\n        and o.payment_status = 'reconciliation_required'\n        and o.updated_at = new.failed_updated_at\n        and h.status = 'captured'\n        and h.purpose = 'product_purchase'\n        and h.purpose_ref = o.order_ref\n        and h.amount_units = o.amount_units\n        and w.account_id = new.account_id\n  )\n  AND EXISTS (\n    SELECT 1\n    FROM platform_audit_events a\n    JOIN platform_coin_commerce_orders o ON o.order_ref = new.order_ref\n    JOIN platform_issued_subscription_links l ON l.id = new.issued_link_ref\n    WHERE a.id = new.effect_ref\n      AND a.entity_type = 'coin_commerce_subscription_fulfillment'\n        and a.entity_ref = new.entitlement_ref\n        and a.action = 'subscription_fulfillment_applied'\n        and a.actor_ref = 'coin_commerce_fulfillment'\n        and a.created_at = new.confirmed_at\n        and json_valid(a.metadata_json)\n        and json_extract(a.metadata_json, '$.version') = 1\n        and json_extract(a.metadata_json, '$.commandRef') = new.command_ref\n        and json_extract(a.metadata_json, '$.orderRef') = new.order_ref\n        and json_extract(a.metadata_json, '$.accountId') = new.account_id\n        and json_extract(a.metadata_json, '$.requestRef') = new.resource_request_ref\n        and json_extract(a.metadata_json, '$.entitlementRef') = new.entitlement_ref\n        and json_extract(a.metadata_json, '$.issuedLinkRef') = new.issued_link_ref\n        and json_extract(a.metadata_json, '$.offerVersionRef') = o.offer_version_ref\n        and json_extract(a.metadata_json, '$.tenantRef') = l.tenant_ref\n        and json_extract(a.metadata_json, '$.artifactRef') = l.artifact_ref\n  )\n  AND EXISTS (\n    SELECT 1\n    FROM platform_issuance_requests r\n    JOIN platform_entitlements e ON e.id = new.entitlement_ref\n    JOIN platform_issued_subscription_links l ON l.id = new.issued_link_ref\n    WHERE r.id = new.resource_request_ref\n      AND r.account_id = new.account_id\n        and r.entitlement_id = e.id\n        and r.status = 'issued'\n        and r.quantity = 1\n        and r.purpose = 'coin_commerce_product_fulfillment'\n        and e.account_id = new.account_id\n        and e.status = 'active'\n        and l.request_id = r.id\n        and l.status = 'active'\n  )\n  AND NOT EXISTS (\n    SELECT 1\n    FROM platform_coin_commerce_fulfillment_receipts f\n    WHERE f.command_ref = new.command_ref OR f.receipt_ref = new.receipt_ref\n  )\n)\nBEGIN\n  SELECT RAISE(ABORT, 'coin_commerce_initial_confirmation_binding_invalid');\nEND;";

export const INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENTS = Object.freeze([
  "drop trigger coin_commerce_initial_confirmations_insert_guard",
  INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENT
]);

export const NUL = String.fromCharCode(0);
export const INITIAL_CONFIRMATION_GUARD_PLAN_C_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_PLAN_C_DDL:v1${NUL}${INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENTS.join(NUL)}`,
    "utf8"
  )
  .digest("hex");

export const COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID,
    ddlChecksum: INITIAL_CONFIRMATION_GUARD_PLAN_C_CHECKSUM
  })
]);
