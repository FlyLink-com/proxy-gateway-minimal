import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { inspectCoinCommerceInitialConfirmationSchema } from "./coin-commerce-migrations.mjs";
import {
  createCoinCommerceAdsRecoveryControls,
  createCoinCommerceInitialConfirmationParticipant
} from "./coin-commerce-store.mjs";
import { COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS } from "./coin-commerce-production-catalog.mjs";

// Operator-only capability. Intentionally not composed into HTTP or the coordinator.
// Approval digests bind reviewed evidence; they are not an authentication scheme.
const PREFIX = "initial_confirmation_";
const REF = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,191}$/;
const HEX = /^[a-f0-9]{64}$/;
const APPROVAL_FIELDS = ["accountId", "orderRef", "inventorySha256", "operatorRef", "expiresAt"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(sortData(value));

function sortData(value) {
  if (Array.isArray(value)) return value.map(sortData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortData(value[key])]));
  }
  return value;
}

function fail(code) {
  const error = new Error(`${PREFIX}${code}`);
  error.code = `${PREFIX}${code}`;
  throw error;
}

function timestamp(value) {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function exactInput(input, fields) {
  if (!input || typeof input !== "object" || utilTypes.isProxy(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== fields.length) fail("invalid_input");
  const result = {};
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_input");
    const value = descriptor.value;
    if (typeof value !== "string" || !(key.endsWith("Sha256") ? HEX.test(value)
      : key === "expiresAt" ? timestamp(value) : REF.test(value))) fail("invalid_input");
    result[key] = value;
  }
  return result;
}

export function initialConfirmationApprovalDigest(input) {
  return hash(`GCCWEBOS:COMMERCE_INITIAL_CONFIRMATION_APPROVAL:v1\0${canonical(exactInput(input, APPROVAL_FIELDS))}`);
}

function safe(action) {
  try { return action(); } catch (error) {
    const known = new Set(["invalid_input", "schema_not_ready", "not_eligible", "evidence_drift",
      "approval_invalid", "approval_expired", "busy", "unavailable"]);
    if (typeof error?.code === "string" && known.has(error.code.slice(PREFIX.length))
      && error.code.startsWith(PREFIX)) fail(error.code.slice(PREFIX.length));
    if (error?.code === "SQLITE_BUSY" || error?.code === "SQLITE_LOCKED") fail("busy");
    if (error?.code === "reconciliation_required") fail("not_eligible");
    fail("unavailable");
  }
}

function identities(commandRef, orderRef) {
  const digest = hash(commandRef);
  return {
    requestRef: `pareq_commerce_${digest}`,
    entitlementRef: `ent_commerce_${digest}`,
    grantRef: `grant_commerce_${digest}`,
    approvalRef: `approval_commerce_${hash(`${commandRef}\0${orderRef}`)}`,
    issuedLinkRef: `pareq_commerce_${digest}_link_1`,
    effectRef: `effect_coin_commerce_${hash(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${commandRef}`)}`
  };
}

export function createCoinCommerceInitialConfirmation({ database, commerceStore, runtimeCore,
  nowFn = () => new Date() } = {}) {
  return safe(() => {
    if (!database || typeof database.transaction !== "function" || typeof nowFn !== "function"
      || typeof runtimeCore?.getTenant !== "function"
      || typeof runtimeCore?.listSubscriptionArtifacts !== "function") fail("invalid_input");
    const participant = createCoinCommerceInitialConfirmationParticipant({ store: commerceStore, database });
    const adsRecovery = createCoinCommerceAdsRecoveryControls({ store: commerceStore, database });

    function schema() {
      if (!inspectCoinCommerceInitialConfirmationSchema({ database }).ok) fail("schema_not_ready");
    }
    function clock() {
      const now = nowFn();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("unavailable");
      const value = now.toISOString();
      if (!timestamp(value)) fail("unavailable");
      return value;
    }
    function read(sql, ...args) { return database.prepare(sql).get(...args); }
    function count(sql, ...args) { return read(sql, ...args)?.count; }

    // Whitelisted metadata only: never select subscription material, credentials,
    // account contact data, runtime configuration, or any provider response body.
    function resourceEvidence(snapshot, now) {
      const { command, order, payload } = snapshot;
      const refs = identities(command.command_ref, order.order_ref);
      const offer = COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS.find((entry) => (
        entry.offerVersionRef === payload.offerVersionRef
        && canonical(entry.delivery) === canonical(payload.delivery)
      ));
      if (!offer || payload.authority || payload.delivery.kind !== "subscription_plan"
        || ![30, 365].includes(payload.delivery.durationDays)) fail("not_eligible");
      const account = read("select id, status from platform_accounts where id = ?", order.account_id);
      const entitlement = read(`select id, account_id, plan, status, valid_from, valid_until,
        max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
        from platform_entitlements where id = ?`, refs.entitlementRef);
      const issuance = read(`select id, account_id, entitlement_id, approval_ref, status, quantity,
        node_id, purpose, requested_by_ref, created_at, updated_at
        from platform_issuance_requests where id = ?`, refs.requestRef);
      const request = read(`select id, portal_user_ref, plan, duration_days, quantity, status,
        submitted_at, updated_at, reviewed_at, reviewed_by_ref, expires_at, valid_until,
        entitlement_ref, access_grant_ref, tenant_id, artifact_id
        from platform_portal_access_requests where id = ?`, refs.requestRef);
      const link = read(`select id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
        from platform_issued_subscription_links where id = ?`, refs.issuedLinkRef);
      const issuanceAudit = read(`select id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json
        from platform_audit_events where id = ?`, `${refs.requestRef}_audit_issued`);
      if (!account || account.status !== "active" || !entitlement || !issuance || !request || !link
        || !issuanceAudit || entitlement.account_id !== account.id || request.portal_user_ref !== account.id
        || entitlement.status !== "active" || entitlement.plan !== payload.offerVersionRef
        || !timestamp(request.submitted_at) || !timestamp(entitlement.valid_until)
        || request.submitted_at > now || entitlement.valid_until <= now
        || entitlement.valid_from !== request.submitted_at || entitlement.created_at !== request.submitted_at
        || entitlement.valid_until !== new Date(Date.parse(request.submitted_at)
          + payload.delivery.durationDays * 86_400_000).toISOString()
        || entitlement.traffic_limit_bytes !== payload.delivery.monthlyTrafficGb * 1024 ** 3
        || entitlement.max_artifacts !== 1 || entitlement.max_devices !== 1
        || issuance.account_id !== account.id || issuance.entitlement_id !== entitlement.id
        || issuance.approval_ref !== refs.approvalRef || issuance.purpose !== "coin_commerce_product_fulfillment"
        || issuance.status !== "issued" || issuance.quantity !== 1 || issuance.created_at !== request.submitted_at
        || request.entitlement_ref !== entitlement.id || request.access_grant_ref !== refs.grantRef
        || request.plan !== (payload.delivery.durationDays === 365 ? "yearly" : "monthly")
        || request.duration_days !== payload.delivery.durationDays || request.quantity !== 1
        || !["delivered", "issued"].includes(request.status)
        || request.expires_at !== entitlement.valid_until || request.valid_until !== entitlement.valid_until
        || typeof request.tenant_id !== "string" || !REF.test(request.tenant_id)
        || typeof request.artifact_id !== "string" || !REF.test(request.artifact_id)
        || link.request_id !== request.id || link.status !== "active"
        || link.tenant_ref !== `tenantref_${hash(request.tenant_id).slice(0, 16)}`
        || link.artifact_ref !== `artifactref_${hash(request.artifact_id).slice(0, 16)}`
        || issuanceAudit.entity_type !== "issuance_request" || issuanceAudit.entity_ref !== request.id
        || issuanceAudit.action !== "issued" || issuanceAudit.actor_ref !== issuance.requested_by_ref
        || issuanceAudit.created_at !== request.submitted_at
        || issuanceAudit.metadata_json !== JSON.stringify({ source: "platform:issue-subscription" })
        || count("select count(*) as count from platform_entitlements where account_id = ? and status = 'active'", account.id) !== 1
        || count("select count(*) as count from platform_issuance_requests where account_id = ? and status in ('planned','issued')", account.id) !== 1
        || count("select count(*) as count from platform_portal_access_requests where portal_user_ref = ? and status in ('pending_admin_review','approved','issued','delivered')", account.id) !== 1
        || count("select count(*) as count from platform_issued_subscription_links where request_id = ?", request.id) !== 1) fail("not_eligible");
      const tenant = runtimeCore.getTenant(request.tenant_id);
      const artifacts = runtimeCore.listSubscriptionArtifacts(request.tenant_id);
      if (!tenant || tenant.id !== request.tenant_id || !["active", "expiring"].includes(tenant.status)
        || tenant.expiresAt !== entitlement.valid_until || !Array.isArray(artifacts)
        || artifacts.length !== 1 || artifacts[0].id !== request.artifact_id
        || artifacts[0].tenantId !== request.tenant_id || artifacts[0].status !== "active") fail("not_eligible");
      const runtime = { tenant: { id: tenant.id, status: tenant.status, expiresAt: tenant.expiresAt },
        artifact: { id: artifacts[0].id, tenantId: artifacts[0].tenantId, status: artifacts[0].status } };
      const metadata = { version: 1, commandRef: command.command_ref, orderRef: order.order_ref,
        accountId: account.id, requestRef: refs.requestRef, entitlementRef: refs.entitlementRef,
        issuedLinkRef: refs.issuedLinkRef, tenantRef: link.tenant_ref, artifactRef: link.artifact_ref,
        offerVersionRef: payload.offerVersionRef, portalPlan: request.plan,
        durationDays: payload.delivery.durationDays, monthlyTrafficGb: payload.delivery.monthlyTrafficGb,
        trafficLimitBytes: entitlement.traffic_limit_bytes, validFrom: request.submitted_at,
        previousValidUntil: request.submitted_at, targetValidUntil: entitlement.valid_until };
      return { refs, account, entitlement, issuance, request, link, issuanceAudit, runtime, metadata };
    }

    function noPriorEffect(evidence) {
      if (count(`select count(*) as count from platform_audit_events where id = ?
        or (entity_type = 'coin_commerce_subscription_fulfillment' and (entity_ref = ?
          or (json_valid(metadata_json) and (json_extract(metadata_json, '$.commandRef') = ?
            or json_extract(metadata_json, '$.orderRef') = ?))))`,
      evidence.refs.effectRef, evidence.refs.entitlementRef,
      evidence.metadata.commandRef, evidence.metadata.orderRef) !== 0) fail("not_eligible");
    }
    const inventoryDigest = (snapshot, evidence) => hash(
      `GCCWEBOS:COMMERCE_INITIAL_CONFIRMATION_INVENTORY:v1\0${canonical({ snapshot, evidence })}`);
    function result(row, state) {
      return Object.freeze({ state, confirmationSha256: hash(canonical(row)), redacted: true });
    }
    function committed(snapshot, approval) {
      const row = snapshot.confirmation;
      if (row.approval_sha256 !== approval.approvalSha256 || row.inventory_sha256 !== approval.inventorySha256
        || row.operator_ref !== approval.operatorRef || row.account_id !== approval.accountId
        || row.order_ref !== approval.orderRef) fail("approval_invalid");
      const effect = read("select * from platform_audit_events where id = ?", row.effect_ref);
      if (hash(canonical(effect)) !== row.effect_sha256) fail("evidence_drift");
      let metadata;
      try { metadata = JSON.parse(effect?.metadata_json); } catch { fail("evidence_drift"); }
      const refs = identities(row.command_ref, row.order_ref);
      if (snapshot.command.status !== "delivered" || snapshot.order.payment_status !== "captured"
        || snapshot.receipt?.effect_ref !== row.effect_ref || snapshot.receipt?.receipt_ref !== row.receipt_ref
        || snapshot.receipt?.recorded_at !== row.confirmed_at || row.effect_ref !== refs.effectRef
        || effect?.entity_type !== "coin_commerce_subscription_fulfillment"
        || effect?.action !== "subscription_fulfillment_applied" || effect?.actor_ref !== "coin_commerce_fulfillment"
        || effect?.entity_ref !== row.entitlement_ref || effect?.created_at !== row.confirmed_at
        || metadata?.commandRef !== row.command_ref || metadata?.orderRef !== row.order_ref
        || metadata?.accountId !== row.account_id || metadata?.requestRef !== row.resource_request_ref
        || metadata?.entitlementRef !== row.entitlement_ref || metadata?.issuedLinkRef !== row.issued_link_ref) fail("evidence_drift");
      return result(row, "already_confirmed");
    }

    function prepare(input) {
      return safe(() => {
        const selected = exactInput(input, ["accountId", "orderRef"]);
        if (database.inTransaction) fail("invalid_input");
        return database.transaction(() => {
          schema();
          const snapshot = participant.inspect(selected);
          if (snapshot.confirmation) fail("not_eligible");
          const evidence = resourceEvidence(snapshot, clock());
          noPriorEffect(evidence);
          return Object.freeze({ state: "ready", inventorySha256: inventoryDigest(snapshot, evidence), redacted: true });
        }).deferred();
      });
    }

    function execute(input) {
      return safe(() => {
        const approval = exactInput(input, [...APPROVAL_FIELDS, "approvalSha256"]);
        const bound = Object.fromEntries(APPROVAL_FIELDS.map((key) => [key, approval[key]]));
        if (initialConfirmationApprovalDigest(bound) !== approval.approvalSha256) fail("approval_invalid");
        if (database.inTransaction) fail("invalid_input");
        let outcome;
        try {
          outcome = database.transaction(() => {
          schema();
          const selected = { accountId: approval.accountId, orderRef: approval.orderRef };
          const snapshot = participant.inspect(selected);
          if (snapshot.confirmation) return committed(snapshot, approval);
          const now = clock();
          if (approval.expiresAt <= now) fail("approval_expired");
          if (Date.parse(approval.expiresAt) - Date.parse(now) > 86_400_000) fail("approval_invalid");
          const evidence = resourceEvidence(snapshot, now);
          noPriorEffect(evidence);
          if (inventoryDigest(snapshot, evidence) !== approval.inventorySha256) fail("evidence_drift");
          if (snapshot.command.updated_at > now || snapshot.order.updated_at !== snapshot.command.updated_at) fail("not_eligible");
          const effect = { id: evidence.refs.effectRef, entity_type: "coin_commerce_subscription_fulfillment",
            entity_ref: evidence.refs.entitlementRef, action: "subscription_fulfillment_applied",
            actor_ref: "coin_commerce_fulfillment", created_at: now, metadata_json: JSON.stringify(evidence.metadata) };
          const row = {
            confirmation_ref: `initial_confirm_${hash(approval.approvalSha256)}`,
            command_ref: snapshot.command.command_ref, order_ref: selected.orderRef, account_id: selected.accountId,
            effect_ref: evidence.refs.effectRef,
            effect_sha256: hash(canonical(effect)),
            receipt_ref: `initial_receipt_${hash(approval.approvalSha256)}`,
            approval_sha256: approval.approvalSha256, inventory_sha256: approval.inventorySha256,
            resource_request_ref: evidence.refs.requestRef, entitlement_ref: evidence.refs.entitlementRef,
            issued_link_ref: evidence.refs.issuedLinkRef, failed_updated_at: snapshot.command.updated_at,
            attempt_count: snapshot.command.attempt_count, lease_generation: snapshot.command.lease_generation,
            confirmed_at: now, operator_ref: approval.operatorRef
          };
          database.prepare(`insert into platform_audit_events
            (id, entity_type, entity_ref, action, actor_ref, created_at, metadata_json)
            values (?, 'coin_commerce_subscription_fulfillment', ?, 'subscription_fulfillment_applied',
              'coin_commerce_fulfillment', ?, ?)`)
            .run(row.effect_ref, row.entitlement_ref, now, effect.metadata_json);
          database.prepare(`insert into platform_coin_commerce_initial_confirmations
            (${Object.keys(row).join(", ")}) values (${Object.keys(row).map((key) => `@${key}`).join(", ")})`).run(row);
          participant.complete({ confirmationRef: row.confirmation_ref });
          const after = participant.inspect(selected);
          const afterResource = resourceEvidence(after, now);
          if (canonical(afterResource) !== canonical(evidence)
            || canonical({ hold: after.hold, allocation: after.allocation, ledger: after.ledger })
              !== canonical({ hold: snapshot.hold, allocation: snapshot.allocation, ledger: snapshot.ledger })
            || canonical(after.confirmation) !== canonical(row)) fail("evidence_drift");
          committed(after, approval);
          return result(row, "confirmed");
          }).immediate();
        } catch (error) {
          // The recovery transaction failed and rolled back: discard the
          // Ads enqueue the participant queued for this order, so it can
          // never be flushed later against state this transaction did
          // not commit.
          adsRecovery.discardAdsRecoveryEnqueues([approval.orderRef]);
          throw error;
        }
        // The transaction has committed. Flush this recovery's queued Ads
        // enqueue explicitly, here and outside any transaction, instead
        // of waiting for an unrelated later store operation. The flush
        // re-reads the committed fulfillment state before writing and
        // swallows its own failures (measurement only).
        adsRecovery.flushAdsRecoveryEnqueues([approval.orderRef]);
        return outcome;
      });
    }
    return Object.freeze({ prepare, execute });
  });
}
