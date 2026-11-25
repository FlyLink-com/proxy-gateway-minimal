// D3-B: U-F8 + U-F13 per-callsite wiring (disposition R2 §3 rows 8, 13).
// Strategy (see the verification receipt in the work area): fence at each
// write method's DEFINITION, which provably covers every callsite, plus a
// static completeness check below that pins every definition carries the
// fence. Behavioral tests then prove the fence refuses at runtime for a
// sample from each group, and that reads stay available in FROZEN.
// The 7 LATENT items (W-012/W-013/W-023/W-024/W-073/W-076/W-095) belong to
// U-F15 and are intentionally NOT fenced until activation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  ensureWriterAuthority,
  transitionWriterAuthority
} from "../services/platform/single-writer-authority.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  IdentityBindingRepository
} from "../services/platform/d1-identity-binding-repository.mjs";
import {
  insertPlanSwitchQuote,
  markScheduledPlanSwitchApplied,
  markScheduledPlanSwitchApplying
} from "../services/platform/coin-commerce-plan-switch-runtime.mjs";
import {
  PLAN_SWITCH_MIGRATIONS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
  applyPlanSwitchMigrations
} from "../services/platform/coin-commerce-plan-switch-migrations.mjs";
import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
  applyPortalRegistrationWelcomeBonusMigrations
} from "../services/platform/portal-registration-welcome-bonus-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  applyDeferredResourceTransitionMigrations
} from "../services/platform/deferred-resource-transition-migrations.mjs";
import {
  createSqliteDeferredResourceTransitionStore
} from "../services/platform/deferred-resource-transition-store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-09-28T00:00:00.000Z";
const LATER = "2026-10-28T00:00:00.000Z";

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error?.code;
  }
  return null;
}

function freezeDb(db) {
  ensureWriterAuthority(db);
  transitionWriterAuthority(db, { to: "FROZEN", expectedEpoch: 1 });
}

function withControlStore(fn) {
  const database = new Database(":memory:");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database });
    return fn({ database, store });
  } finally {
    store?.close?.();
    database.close();
  }
}

function makeAccount(store, id = "acct_1") {
  return store.createAccount({
    id, ownerRef: `owner_${id}`, status: "active", createdAt: NOW, updatedAt: NOW
  });
}

// --- Static completeness: every fenced definition carries the fence ------
function bodyBraceIndex(src, defIdx) {
  const paren = src.indexOf("(", defIdx);
  let depth = 0;
  let i = paren;
  for (; i < src.length; i += 1) {
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const brace = src.indexOf("{", i);
  return brace;
}

function assertFenced(src, defPattern, dbExpr, label) {
  const defIdx = src.search(defPattern);
  assert.notEqual(defIdx, -1, `${label}: definition not found`);
  const brace = bodyBraceIndex(src, defIdx);
  const after = src.slice(brace + 1).split("\n").slice(1, 7);
  const fenceIdx = after.findIndex((line) => line.trim() === `assertWritable(${dbExpr});`);
  assert.notEqual(fenceIdx, -1, `${label}: fence call missing`);
  assert.ok(
    after.slice(0, fenceIdx).some((line) => line.includes("phase fence, first statement.")),
    `${label}: fence comment missing`
  );
}

const CONTROL_DB_METHODS = [
  // U-F13 W-001..W-019 (minus LATENT W-012/W-013)
  "upsertLead", "purgeExpiredLeads", "createAccount", "createPortalEntry",
  "markPortalEntryUsed", "createPortalTotpCredential",
  "recordPortalTotpVerificationFailure", "markPortalTotpVerified",
  "createPortalPasswordCredential", "recordPortalPasswordVerificationFailure",
  "markPortalPasswordVerified", "createPortalSecondFactorChallenge",
  "markPortalSecondFactorChallengeUsed", "recordPortalSecondFactorChallengeFailure",
  "createPortalSession", "revokePortalSession", "recordPortalReferralRegistration",
  // U-F13 W-065..W-077 (minus LATENT W-073/W-076)
  "createEntitlement", "updateEntitlementTrafficLimit",
  "applyCoinCommerceSubscriptionFulfillment", "createIssuanceRequest",
  "setIssuanceRequestStatus", "linkIssuedSubscription",
  "upsertPortalAccessRequest", "upsertQuotaCounter", "recordRevocation",
  // U-F13 W-078..W-081 (NOISY W-080/W-081 resolved by dotted re-read)
  "walletFirstResourceEffectInsertInitialChain",
  "walletFirstResourceEffectSwitchCurrentChain",
  "claimWalletFirstRuntimeEffectForDeferredTransition",
  "recordWalletFirstRuntimeReceiptForDeferredTransition",
  "markWalletFirstRuntimeEffectReconciliationRequiredForDeferredTransition",
  "createWalletFirstSetupDeliveryHandoff", "claimWalletFirstSetupDeliveryHandoff",
  "acknowledgeWalletFirstSetupDeliveryHandoff",
  "markWalletFirstSetupDeliveryHandoffReconciliationRequired",
  // U-F13 W-083..W-093
  "createIdentityDeletionJob", "updateIdentityDeletionJob",
  "createIdentityDeletionProof", "createIdentityDeletionTombstone",
  "freezeAccountForDeletion", "revokePortalPasswordCredentialsForAccount",
  "revokePortalTotpCredentialsForAccount", "revokePortalPasskeyCredentialsForAccount",
  "deletePortalCredentialsForAccount", "deletePortalSessionsForAccount",
  "deletePortalSecondFactorChallengesForAccount", "deletePortalEntriesForAccount",
  "deleteAccountRowForDeletion", "redactAccountMetadataForDeletion",
  // U-F13 W-096..W-110 (minus LATENT W-095; NOISY W-102/W-103 resolved)
  "insertEdgeRegisteredNodeIfAbsent", "recordEdgeApplyReceipt",
  "syncEdgeDesiredStateNotificationFromReceipt",
  "recordEdgeDesiredStateNotification", "acquireEdgeAgentLease",
  "reserveCoinCommerceDataPackIssuance", "completeCoinCommerceDataPackIssuance",
  "claimCoinCommerceDataPackArtifactRotation",
  "beginCoinCommerceDataPackArtifactRotation",
  "advanceCoinCommerceDataPackArtifactRotation",
  "releaseCoinCommerceDataPackArtifactRotation",
  "beginCoinCommerceDataPackCredentialReset",
  "claimCoinCommerceDataPackCredentialReset",
  "advanceCoinCommerceDataPackCredentialReset",
  "releaseCoinCommerceDataPackCredentialReset",
  "registerCoinCommerceDataPackEdgeCredential",
  "rotateCoinCommerceDataPackEdgeCredential", "createDataPackResource",
  "applyCoinCommerceDataPackFulfillment",
  "recordCoinCommerceDataPackMeteringResetReceipt",
  "deliverPlanSwitchDowngrade", "recordAuditEvent",
  // U-F8 W-112 (welcome-bonus coordinator callsites) + W-111 (fulfillment)
  "deferPortalRegistrationWelcomeCoinGrant",
  "markPortalRegistrationWelcomeCoinGrantReconciliationRequired",
  "expireDuePortalRegistrationWelcomeCoinGrants",
  "completePortalRegistrationWelcomeCoinGrant",
  "claimNextPortalRegistrationWelcomeCoinGrant",
  "completeScheduledPlanSwitch"
];

test("U-F13/U-F8 static: every fenced definition carries the fence first", () => {
  const control = readFileSync(
    join(HERE, "../services/platform/subscription-control-db.mjs"), "utf8"
  );
  for (const name of CONTROL_DB_METHODS) {
    // Anchor on the `function` declaration: some methods have an earlier
    // in-file call site with the same name and indentation.
    const pattern = name === "recordPortalReferralRegistration"
      ? new RegExp(`    ${name}\\(input\\) \\{`)
      : new RegExp(`  function ${name}\\(`);
    assertFenced(control, pattern, "db", `subscription-control-db.${name}`);
  }
  const identity = readFileSync(
    join(HERE, "../services/platform/d1-identity-binding-repository.mjs"), "utf8"
  );
  for (const name of ["createActive", "revoke", "deleteForAccount"]) {
    assertFenced(identity, new RegExp(`  ${name}\\(`), "this.db", `IdentityBindingRepository.${name}`);
  }
  const planSwitch = readFileSync(
    join(HERE, "../services/platform/coin-commerce-plan-switch-runtime.mjs"), "utf8"
  );
  for (const name of [
    "insertPlanSwitchQuote", "deliverScheduledPlanDowngrade",
    "supersedeScheduledPlanSwitch", "markScheduledPlanSwitchApplied",
    "markScheduledPlanSwitchApplying"
  ]) {
    assertFenced(planSwitch, new RegExp(`export function ${name}\\(`), "database", `plan-switch.${name}`);
  }
  // Ported D3-A fences (same change, shared branch): 13 deferred-store
  // transactions (U-F5) + 6 wallet-store bodies (U-F1).
  const deferred = readFileSync(
    join(HERE, "../services/platform/deferred-resource-transition-store.mjs"), "utf8"
  );
  assert.equal(
    deferred.split("// U-F5: phase fence").length - 1, 13
  );
  const wallet = readFileSync(
    join(HERE, "../services/platform/coin-wallet-store.mjs"), "utf8"
  );
  assert.equal(
    wallet.split("// U-F1: phase fence").length - 1, 6
  );
  // The authority install no longer needs db.exec (minimal handles).
  const authority = readFileSync(
    join(HERE, "../services/platform/single-writer-authority.mjs"), "utf8"
  );
  assert.equal(authority.split("db.exec(").length - 1, 0);
});

// --- Behavioral: leads -----------------------------------------------------
test("U-F13 leads: upsertLead/purgeExpiredLeads refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    const lead = {
      id: "lead_1", status: "new", organization: "Synthetic",
      email: "lead@example.test", direction: "inbound", stage: "",
      message: "hello", source: "company-site",
      createdAt: NOW, updatedAt: NOW
    };
    assert.equal(store.upsertLead(lead, { expiresAt: "2026-09-01T00:00:00.000Z" }).id, "lead_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.upsertLead(
        { ...lead, id: "lead_2" },
        { expiresAt: "2026-09-01T00:00:00.000Z" }
      )),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.purgeExpiredLeads({ now: NOW })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getLead("lead_1").id, "lead_1");
    assert.equal(
      database.prepare("select count(*) from platform_leads").pluck().get(), 1
    );
  });
});

// --- Behavioral: accounts / entitlements -----------------------------------
test("U-F13 accounts: createAccount/createEntitlement/update limit refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    const entitlement = store.createEntitlement({
      id: "ent_1", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    assert.equal(entitlement.id, "ent_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => makeAccount(store, "acct_2")), "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.updateEntitlementTrafficLimit("ent_1", {
        trafficLimitBytes: 1, updatedAt: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getAccount("acct_1").id, "acct_1");
  });
});

// Z (#917 r4670926086): createAccount must fence the insert inside its
// own transaction. The outer check alone is bypassable by a freeze
// landing between it and the insert, so the test freezes the database
// on the first transaction() call — exactly that window — and requires
// the in-transaction fence to reject the write with no row inserted.
test("U-F13 accounts: createAccount refuses a freeze landing immediately before its transaction", () => {
  const database = new Database(":memory:");
  let freezeOnce = false;
  const freezingDb = {
    open: true,
    pragma: (...args) => database.pragma(...args),
    exec: (...args) => database.exec(...args),
    prepare: (...args) => database.prepare(...args),
    transaction(fn) {
      if (freezeOnce) {
        freezeOnce = false;
        transitionWriterAuthority(database, { to: "FROZEN", expectedEpoch: 1 });
      }
      return database.transaction(fn);
    }
  };
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database: freezingDb });
    ensureWriterAuthority(database);
    makeAccount(store);
    freezeOnce = true;
    assert.equal(
      codeOf(() => store.createAccount({
        id: "acct_2", ownerRef: "owner_acct_2", status: "active",
        createdAt: NOW, updatedAt: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getAccount("acct_1").id, "acct_1");
    assert.equal(
      database.prepare("select count(*) from platform_accounts").pluck().get(), 1
    );
  } finally {
    store?.close?.();
    database.close();
  }
});

// --- Behavioral: portal ----------------------------------------------------
test("U-F13 portal: entry/session/audit refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    store.createEntitlement({
      id: "ent_1", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    store.createPortalEntry({
      id: "entry_1", accountId: "acct_1", entitlementId: "ent_1",
      tokenHash: "synth-token-hash", status: "active",
      expiresAt: LATER, issuedByRef: "admin:operator-1",
      approvalRef: "synth-approval-1", createdAt: NOW, updatedAt: NOW
    });
    const session = store.createPortalSession({
      id: "sess_1", accountId: "acct_1", authMethod: "password_totp",
      status: "active", issuedAt: NOW, expiresAt: LATER, updatedAt: NOW
    });
    assert.equal(session.sessionRef, "sess_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.createPortalSession({
        id: "sess_2", accountId: "acct_1", authMethod: "password_totp",
        status: "active", issuedAt: NOW, expiresAt: LATER, updatedAt: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.revokePortalSession("sess_1", { revokedAt: NOW, updatedAt: NOW })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.recordAuditEvent({
        id: "audit_1", entityType: "issuance_request", entityRef: "req_1",
        action: "issued", actorRef: "operator_1", createdAt: NOW,
        metadata: { source: "platform:issue-subscription" }
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getAccount("acct_1").id, "acct_1");
  });
});

// --- Behavioral: issuance --------------------------------------------------
test("U-F13 issuance: createIssuanceRequest/setIssuanceRequestStatus refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    store.createEntitlement({
      id: "ent_1", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    const request = store.createIssuanceRequest({
      id: "req_1", accountId: "acct_1", entitlementId: "ent_1",
      approvalRef: "approval_1", status: "planned", quantity: 1,
      nodeId: "node_1", purpose: "access",
      requestedByRef: "operator_1", createdAt: NOW, updatedAt: NOW
    });
    assert.equal(request.id, "req_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.setIssuanceRequestStatus("req_1", { status: "issued", updatedAt: NOW })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getIssuanceRequest("req_1").status, "planned");
  });
});

// --- Behavioral: quota / revocation ----------------------------------------
test("U-F13 quota: upsertQuotaCounter/recordRevocation refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    store.createEntitlement({
      id: "ent_1", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    store.upsertQuotaCounter({
      accountId: "acct_1", entitlementId: "ent_1",
      metric: "artifact_issuance", period: "2026-09", amount: 1, updatedAt: NOW
    });
    freezeDb(database);
    assert.equal(
      codeOf(() => store.upsertQuotaCounter({
        accountId: "acct_1", entitlementId: "ent_1",
        metric: "artifact_issuance", period: "2026-09", amount: 1, updatedAt: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.recordRevocation({
        id: "rev_1", requestId: "req_1", issuedLinkId: "link_1",
        tenantRef: "tenant_1", artifactRef: "artifact_1",
        reasonCode: "operator_revoke", revokedByRef: "operator_1",
        createdAt: NOW
      })),
      "writer_authority_not_bwh"
    );
  });
});

// --- Behavioral: identity deletion -----------------------------------------
test("U-F13 identity deletion: create/update job refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    const job = store.createIdentityDeletionJob({
      id: "deljob_1", requestId: "delreq_1", accountId: "acct_1",
      authorizationBasis: "owner_request", verificationMode: "logical",
      scope: ["portal"], status: "pending", currentStep: 0, steps: [],
      actorRef: "operator_1", createdAt: NOW, updatedAt: NOW
    });
    assert.equal(job.id, "deljob_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.updateIdentityDeletionJob({
        id: "deljob_1", status: "running", currentStep: 1, steps: ["step_1"],
        retryCount: 0, updatedAt: NOW
      })),
      "writer_authority_not_bwh"
    );
  });
});

// --- Behavioral: edge nodes ------------------------------------------------
test("U-F13 edge: node insert/receipt/lease refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    const node = store.insertEdgeRegisteredNodeIfAbsent({
      nodeRef: "node_1", providerRef: "vultr", regionRef: "jp",
      roleRef: "child", channelRefs: ["ch_1"],
      imageManifestRef: "img_1", releaseRef: "rel_1",
      firstBootPacketRef: "boot_1", registeredAt: NOW, updatedAt: NOW,
      metadata: {
        source: "node-image-first-boot-packet",
        receiptGateRequired: true,
        imageSafeConfirmed: true,
        artifactHashRecorded: true,
        wireguardPlanRef: "wg-plan-1"
      }
    });
    assert.equal(node.record.nodeRef, "node_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.recordEdgeApplyReceipt({
        id: "receipt_1", channelRef: "ch_1", desiredStateRef: "ds_1",
        status: "applied", actionCounts: { add: 1 },
        configTestOk: true, serviceActive: true, createdAt: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.acquireEdgeAgentLease({
        leaseRef: "lease_1", agentRef: "agent_1", nodeRef: "node_1",
        channelRef: "ch_1", status: "active",
        acquiredAt: NOW, renewedAt: NOW, expiresAt: LATER
      })),
      "writer_authority_not_bwh"
    );
  });
});

// --- Behavioral: data-pack issuance + rotation ------------------------------
test("U-F13 data-pack: issuance reserve/complete and rotation begin refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    store.createEntitlement({
      id: "ent_pack", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    const base = {
      commandRef: "coincmd_pack_a", orderRef: "coinord_pack_a",
      accountId: "acct_1", offerVersionRef: "offerv_pack_100gb_v1",
      quotaBytes: 100 * 1024 ** 3, nodeId: "channel_sg_pack", now: NOW
    };
    const first = store.reserveCoinCommerceDataPackIssuance(base);
    assert.equal(first.status, "planned");
    const issued = store.completeCoinCommerceDataPackIssuance({
      commandRef: base.commandRef, orderRef: base.orderRef,
      accountId: base.accountId, requestRef: first.requestRef,
      entitlementRef: first.entitlementRef, nodeId: base.nodeId,
      tenantRef: "tenantref_pack_a", artifactRef: "artifactref_pack_a", now: NOW
    });
    assert.equal(issued.status, "issued");
    store.createDataPackResource({
      orderRef: base.orderRef, commandRef: base.commandRef,
      accountId: base.accountId, requestRef: first.requestRef,
      entitlementRef: first.entitlementRef,
      offerVersionRef: base.offerVersionRef, quotaBytes: base.quotaBytes,
      technicalValidUntil: "9999-12-31T23:59:59.999Z",
      commercialNeverExpires: true, createdAt: NOW
    });
    const rotation = store.beginCoinCommerceDataPackArtifactRotation({
      rotationRef: "rot_1", orderRef: base.orderRef,
      accountId: "acct_1", now: NOW
    });
    assert.equal(rotation.rotationRef, "rot_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.reserveCoinCommerceDataPackIssuance({
        ...base, commandRef: "coincmd_pack_b", orderRef: "coinord_pack_b"
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.beginCoinCommerceDataPackArtifactRotation({
        rotationRef: "rot_2", orderRef: base.orderRef,
        accountId: "acct_1", now: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(store.getIssuanceRequest(first.requestRef)?.status, "issued");
  });
});

// --- Behavioral: identity binding repository --------------------------------
test("U-F13 identity bindings: createActive/revoke/deleteForAccount refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    ensureWriterAuthority(database);
    makeAccount(store);
    const repository = store.identityBindingRepository();
    assert.ok(repository instanceof IdentityBindingRepository);
    const created = repository.createActive({
      accountRef: "acct_1", issuerRef: "portal", subjectRef: "subj_1",
      status: "active", createdAtMs: 1000, updatedAtMs: 1000, revokedAtMs: null
    });
    assert.equal(created.outcome, "created");
    freezeDb(database);
    assert.equal(
      codeOf(() => repository.createActive({
        accountRef: "acct_1", issuerRef: "portal", subjectRef: "subj_2",
        status: "active", createdAtMs: 1000, updatedAtMs: 1000, revokedAtMs: null
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => repository.revoke({ id: created.id, revokedAtMs: 2000 })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => repository.deleteForAccount({ accountRef: "acct_1", revokedAtMs: 2000 })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      database.prepare("select count(*) from platform_identity_bindings").pluck().get(), 1
    );
  });
});

// --- Behavioral: plan-switch runtime ----------------------------------------
function insertScheduledRow(database, switchRef) {
  database.pragma("foreign_keys = OFF");
  try {
    database.prepare(`
      insert into platform_scheduled_plan_switches (
        switch_ref, account_id, entitlement_id,
        from_offer_version_ref, to_offer_version_ref,
        effective_at, paid_units, status, created_at,
        resolved_at, superseded_by_order_ref
      ) values (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, null, null)
    `).run(
      switchRef, "acct_1", "ent_1",
      "offerv_plan_30d_50gb_monthly_v1", "offerv_plan_30d_100gb_monthly_v1",
      NOW, 30, NOW
    );
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

test("U-F13 plan-switch: quote insert / mark applying / complete refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    // The quotes/scheduled tables live in the plan-switch migrations,
    // not the control-store schema (wallet -> commerce -> plan-switch).
    applyCoinWalletMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyCoinCommerceMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyPlanSwitchMigrations({
      database,
      expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
      expectedDdlChecksum: PLAN_SWITCH_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    ensureWriterAuthority(database);
    makeAccount(store);
    store.createEntitlement({
      id: "ent_1", accountId: "acct_1",
      plan: "offerv_plan_30d_100gb_monthly_v1", status: "active",
      validFrom: NOW, validUntil: LATER,
      maxArtifacts: 1, maxDevices: 1, trafficLimitBytes: 100 * 1024 ** 3,
      createdAt: NOW, updatedAt: NOW
    });
    const quote = {
      quoteRef: "quote_1", accountId: "acct_1", entitlementId: "ent_1",
      kind: "upgrade_inplace", fromOfferVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      toOfferVersionRef: "offerv_plan_30d_100gb_monthly_v1",
      snapshotValidFrom: NOW, snapshotValidUntil: LATER,
      listPriceUnits: 30, creditUnits: 0, pendingCreditUnits: 0, chargeUnits: 30,
      cancelsSwitchRef: null, effectiveAt: null, createdAt: NOW
    };
    // The plan-switch quote references a commerce quote row; the
    // foreign-key chain is orthogonal to the fence, so it is relaxed
    // for this insert (as for the scheduled row below).
    database.pragma("foreign_keys = OFF");
    insertPlanSwitchQuote(database, quote);
    database.pragma("foreign_keys = ON");
    assert.equal(
      database.prepare("select count(*) from platform_coin_commerce_plan_switch_quotes").pluck().get(),
      1
    );
    insertScheduledRow(database, "switch_1");
    assert.equal(
      markScheduledPlanSwitchApplying(database, { switchRef: "switch_1", accountId: "acct_1" }),
      true
    );
    const completed = store.completeScheduledPlanSwitch({
      switchRef: "switch_1", accountId: "acct_1", now: NOW
    });
    assert.equal(completed, true);
    freezeDb(database);
    assert.equal(
      codeOf(() => insertPlanSwitchQuote(database, { ...quote, quoteRef: "quote_2" })),
      "writer_authority_not_bwh"
    );
    insertScheduledRow(database, "switch_2");
    assert.equal(
      codeOf(() => markScheduledPlanSwitchApplying(database, { switchRef: "switch_2", accountId: "acct_1" })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.completeScheduledPlanSwitch({ switchRef: "switch_2", accountId: "acct_1", now: NOW })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      database.prepare("select count(*) from platform_coin_commerce_plan_switch_quotes").pluck().get(),
      1
    );
  });
});

// --- Behavioral: welcome-bonus coordinator callsites (W-112) ----------------
test("U-F8 W-112: welcome-grant claim/expire/defer/complete/mark refuse in FROZEN", () => {
  withControlStore(({ database, store }) => {
    // The grants table lives in the welcome-bonus migrations, which
    // need the wallet schema first.
    applyCoinWalletMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyPortalRegistrationWelcomeBonusMigrations({
      database,
      expectedMigrationId: REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
      expectedDdlChecksum: PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    ensureWriterAuthority(database);
    makeAccount(store);
    const grant = store.enqueuePortalRegistrationWelcomeCoinGrant({
      grantRef: "grant_1", accountId: "acct_1", coinType: "bonus_coins",
      amountUnits: 10, expiresAt: "2026-10-05T00:00:00.000Z",
      sourceType: "portal_registration_welcome_bonus",
      sourceRef: "portal_registration_welcome_acct_1",
      sourceDigest: "a".repeat(64),
      actorScope: "account:acct_1", idempotencyKey: "grant_1", now: NOW
    });
    assert.equal(grant.grantRef, "grant_1");
    freezeDb(database);
    assert.equal(
      codeOf(() => store.claimNextPortalRegistrationWelcomeCoinGrant({ now: NOW, leaseMs: 60000 })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.expireDuePortalRegistrationWelcomeCoinGrants({ now: NOW })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.deferPortalRegistrationWelcomeCoinGrant({
        grantRef: "grant_1", leaseGeneration: 1, leaseToken: "0".repeat(64),
        deferredUntil: LATER, now: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.completePortalRegistrationWelcomeCoinGrant({
        grantRef: "grant_1", leaseGeneration: 1, leaseToken: "0".repeat(64),
        lotRef: "lot_1", completedAt: NOW, now: NOW
      })),
      "writer_authority_not_bwh"
    );
    assert.equal(
      codeOf(() => store.markPortalRegistrationWelcomeCoinGrantReconciliationRequired({
        grantRef: "grant_1", leaseGeneration: 1, leaseToken: "0".repeat(64),
        safeCode: "test_reconciliation", now: NOW
      })),
      "writer_authority_not_bwh"
    );
  });
});

// --- Behavioral: deferred store (W-113) + wallet (W-112) — ported fences ---
function deferredDb() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key, owner_ref text not null, status text not null,
      created_at text not null, updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id),
      status text not null, valid_from text not null, valid_until text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id),
      entitlement_id text not null references platform_entitlements(id),
      status text not null default 'issued'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id),
      tenant_ref text not null default '', artifact_ref text not null default '',
      status text not null default 'active'
    );
    create table platform_portal_access_requests (
      id text primary key, portal_user_ref text not null,
      entitlement_ref text, status text not null, expires_at text,
      valid_until text, tenant_id text, artifact_id text
    );
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  applyDeferredResourceTransitionMigrations({
    database,
    expectedMigrationId: REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_DEFERRED_RESOURCE_TRANSITION_DDL_CHECKSUM,
    nowFn: () => new Date(NOW)
  });
  return database;
}

test("U-F8 W-113: deferred claimNextDueTransition refuses in FROZEN (ported fence)", () => {
  const database = deferredDb();
  const store = createSqliteDeferredResourceTransitionStore({ database });
  try {
    ensureWriterAuthority(database);
    assert.equal(store.claimNextDueTransition({ leaseMs: 60000 }), null);
    freezeDb(database);
    assert.equal(
      codeOf(() => store.claimNextDueTransition({ leaseMs: 60000 })),
      "writer_authority_not_bwh"
    );
  } finally {
    store.close();
    database.close();
  }
});

test("U-F8 W-112: wallet creditCoins refuses in FROZEN (ported fence)", () => {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key, owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null, updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW)
  });
  database.prepare(`
    insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, '{}')
  `).run("account_1", "owner_account_1", NOW, NOW);
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: (() => {
      const counts = new Map();
      return (kind) => {
        const next = (counts.get(kind) ?? 0) + 1;
        counts.set(kind, next);
        return `${kind}_${next}`;
      };
    })()
  });
  try {
    store.creditCoins({
      accountId: "account_1", coinType: "paid_coins", amountUnits: 25,
      availability: "available", sourceType: "verified_recharge",
      sourceRef: "source_1", sourceDigest: "a".repeat(64),
      policyRef: null, policyVersion: null, expiresAt: null,
      operation: {
        actorScope: "account:account_1", idempotencyKey: "credit_1",
        actorType: "system", actorRef: "settlement_worker"
      }
    });
    freezeDb(database);
    assert.equal(
      codeOf(() => store.creditCoins({
        accountId: "account_1", coinType: "paid_coins", amountUnits: 25,
        availability: "available", sourceType: "verified_recharge",
        sourceRef: "source_1", sourceDigest: "a".repeat(64),
        policyRef: null, policyVersion: null, expiresAt: null,
        operation: {
          actorScope: "account:account_1", idempotencyKey: "credit_2",
          actorType: "system", actorRef: "settlement_worker"
        }
      })),
      "writer_authority_not_bwh"
    );
  } finally {
    store.close();
    database.close();
  }
});
