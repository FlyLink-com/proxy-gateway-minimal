// Closed synthetic seed only. Business rules, runtime state, HTTP and fulfillment
// remain the production implementations; no network/protocol process is started.
import { createHash } from "node:crypto";
import {
  applyPlanSwitchMigrations,
  PLAN_SWITCH_MIGRATIONS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID
} from "../../server/services/platform/coin-commerce-plan-switch-migrations.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../../server/services/platform/coin-commerce-production-catalog.mjs";
import { createCoinCommerceProductionSubscriptionFulfillment } from "../../server/services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import { usageCycleForBinding } from "../../server/services/platform/usage-billing-cycle.mjs";

const DAY_MS = 86400000;
const ENTITLEMENT = "ent_local_plan_switch_ui";
const REQUEST = "pareq_local_plan_switch_ui";
const CHANNEL = "channel_local_plan_switch_ui";
const CREDENTIAL = "edgecred_local_plan_switch_ui";
const BASIC = COIN_COMMERCE_PRODUCTION_OFFERS[0];

export const PLAN_SWITCH_UI_PROXY_CONFIG = Object.freeze({
  servers: [{
    id: "node_local_plan_switch_ui",
    name: "local-plan-switch-ui",
    region: "Local synthetic validation",
    host: "127.0.0.1",
    port: 18445,
    method: "aes-256-gcm",
    password: "local-synthetic-no-listener"
  }],
  pingHosts: [],
  nginx: {}
});

export function applyLocalPlanSwitchSchema(controlDbPath) {
  applyPlanSwitchMigrations({
    dbPath: controlDbPath,
    expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum
  });
}

export function localPlanSwitchRuntimeOptions() {
  return {
    coinCommerceCatalog: COIN_COMMERCE_PRODUCTION_OFFERS,
    coinCommerceFulfillmentFactory: createCoinCommerceProductionSubscriptionFulfillment
  };
}

function safeIssuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

export function seedLocalPlanSwitchUi(runtimeState, accountId) {
  const store = runtimeState.platform.controlStore;
  const core = runtimeState.subscriptions.core;
  const now = Date.now();
  const stamped = new Date(now).toISOString();
  // Sixteen days makes the 5-Coin basic->plus quote stable during a UI session.
  const validFrom = new Date(now - 14 * DAY_MS).toISOString();
  const validUntil = new Date(now + 16 * DAY_MS).toISOString();
  store.createEntitlement({
    id: ENTITLEMENT, accountId, plan: BASIC.offerVersionRef, status: "active",
    validFrom, validUntil, maxArtifacts: 1, maxDevices: 2,
    trafficLimitBytes: 50 * 1024 ** 3, createdAt: stamped, updatedAt: stamped
  });
  store.createIssuanceRequest({
    id: REQUEST, accountId, entitlementId: ENTITLEMENT,
    approvalRef: "approval_local_plan_switch_ui", status: "issued", quantity: 1,
    nodeId: CHANNEL, purpose: "portal_access_request",
    requestedByRef: "operator_local_plan_switch_ui", createdAt: stamped, updatedAt: stamped
  });
  const tenantId = core.createTenant({
    displayName: "Local plan switch validation",
    nodeId: "local-plan-switch-ui", expiresAt: validUntil, note: ""
  }).tenant.id;
  const artifactId = core.createSubscriptionArtifact(tenantId).artifact.id;
  store.linkIssuedSubscription({
    id: "link_local_plan_switch_ui", requestId: REQUEST,
    tenantRef: safeIssuedRef("tenant", tenantId),
    artifactRef: safeIssuedRef("artifact", artifactId), status: "active",
    createdAt: stamped, updatedAt: stamped
  });
  store.upsertPortalAccessRequest({
    id: REQUEST, portalUserRef: accountId, plan: "monthly", clientTarget: "clash",
    durationDays: 30, quantity: 1, status: "delivered", nextAction: "user_can_use_access",
    noteProvided: false, priorTrialState: "not_applicable", submittedAt: validFrom,
    updatedAt: stamped, reviewedAt: stamped, reviewedByRef: "operator_local_plan_switch_ui",
    expiresAt: validUntil, validUntil, entitlementRef: ENTITLEMENT,
    accessGrantRef: "grant_local_plan_switch_ui", tenantId, artifactId,
    edgeChannelRef: CHANNEL, edgeCredentialRef: CREDENTIAL,
    edgeMaterialDigest: "sha256:synthetic_local_plan_switch_ui"
  });
  store.recordUsageSample({
    id: "usage_local_plan_switch_ui", sourceRef: "source_local_plan_switch_ui",
    channelRef: CHANNEL, edgeCredentialRef: CREDENTIAL, accountId,
    entitlementId: ENTITLEMENT, requestId: REQUEST, observedAt: stamped,
    intervalStartedAt: new Date(now - 1000).toISOString(), intervalEndedAt: stamped,
    uploadBytes: 1000, downloadBytes: 234, totalBytes: 1234,
    sampleDigest: "digest_local_plan_switch_ui", createdAt: stamped
  });
  return () => {
    const entitlement = store.getEntitlement(ENTITLEMENT);
    const cycle = usageCycleForBinding(entitlement, new Date().toISOString());
    const usedBytes = store.listUsageSamples({
      accountId, entitlementId: ENTITLEMENT,
      observedFrom: cycle.startedAt, observedTo: cycle.endedAt
    }).reduce((sum, sample) => sum + sample.totalBytes, 0);
    return Object.freeze({
      monthlyTrafficGb: entitlement.trafficLimitBytes / 1024 ** 3,
      validFrom: entitlement.validFrom,
      validUntil: entitlement.validUntil,
      usedBytes,
      runtimeMatchesEntitlement: core.getTenant(tenantId).expiresAt === entitlement.validUntil
    });
  };
}
