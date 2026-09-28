import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  COIN_COMMERCE_DATA_PACK_CANDIDATES,
  COIN_COMMERCE_PRODUCTION_OFFERS
} from "../services/platform/coin-commerce-production-catalog.mjs";
import {
  createCoinCommerceCoordinator
} from "../services/platform/coin-commerce-coordinator.mjs";
import {
  applyCoinCommerceMigrations,
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";
import {
  isCoinCommerceFulfillmentReconciliationError,
  isCoinCommerceFulfillmentRetryableError
} from "../services/platform/coin-commerce-fulfillment-retry.mjs";
import {
  createCoinCommerceProductionSubscriptionFulfillment
} from "../services/platform/coin-commerce-production-subscription-fulfillment.mjs";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  createPortalAccessRequestService
} from "../services/platform/portal-access-requests.mjs";
import {
  applyCoinWalletMigrations,
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSubscriptionCore
} from "../services/subscriptions/core.mjs";
import {
  createSqliteSubscriptionStore
} from "../services/subscriptions/repository.mjs";
import {
  hashSubscriptionToken
} from "../services/subscriptions/tokens.mjs";

const NOW = "2026-07-30T00:00:00.000Z";
const CURRENT_VALID_UNTIL = "2026-09-01T00:00:00.000Z";
const GIB = 1024 ** 3;
const ACTIVATED_ACCOUNT_READER = () => true;

function sampleProxyConfig() {
  return {
    servers: [{
      id: "node_sg",
      name: "vultr-singapore",
      region: "Singapore",
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      password: "synthetic-shared-secret"
    }],
    pingHosts: [],
    nginx: {}
  };
}

function safeIssuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function fulfillmentEffectRef(commandRef) {
  return `effect_coin_commerce_${createHash("sha256")
    .update(`GCCWEBOS:COIN_COMMERCE_SUBSCRIPTION_FULFILLMENT:v1\0${commandRef}`)
    .digest("hex")}`;
}

function tokenFactory() {
  const rawToken = "pgsub_synthetic_fulfillment_token";
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14)
  };
}

function createFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-subscription-fulfillment-"));
  const controlDbPath = join(directory, "control.sqlite");
  const runtimeDbPath = join(directory, "runtime.sqlite");
  let now = options.now || NOW;
  const baseValidUntil = options.baseValidUntil || CURRENT_VALID_UNTIL;
  let controlStore = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  let runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimeDbPath });

  function createRuntimeCore(store = runtimeStore) {
    return createSubscriptionCore({
      store,
      proxyConfig: sampleProxyConfig(),
      publicSubscriptionBaseUrl: "https://gateway.example.test",
      nowFn: () => new Date(now),
      tokenFactory,
      artifactSecretFactory: () => "synthetic_fulfillment_artifact",
      idFactory: () => "tenant_fulfillment_001",
      artifactIdFactory: () => "artifact_fulfillment_001"
    });
  }

  let runtimeCore = createRuntimeCore();
  const accountId = "acct_fulfillment_001";
  const requestRef = "pareq_fulfillment_001";
  const entitlementRef = "ent_fulfillment_001";
  const tenantId = "tenant_fulfillment_001";
  const artifactId = "artifact_fulfillment_001";
  const issuedLinkRef = "link_fulfillment_001";
  const accessGrantRef = "grant_fulfillment_001";
  const edgeChannelRef = "channel-vultr-a-tuic";
  const edgeCredentialRef = "edgecred_fulfillment_001";
  const edgeMaterialDigest = "sha256:synthetic_fulfillment_001";

  controlStore.createAccount({
    id: accountId,
    ownerRef: "owner_fulfillment_001",
    status: options.accountStatus || "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  controlStore.createEntitlement({
    id: entitlementRef,
    accountId,
    plan: options.entitlementPlan || "trial",
    status: options.entitlementStatus || "active",
    validFrom: options.entitlementValidFrom || "2026-07-01T00:00:00.000Z",
    validUntil: baseValidUntil,
    maxArtifacts: 1,
    maxDevices: 2,
    trafficLimitBytes: 5 * GIB,
    createdAt: NOW,
    updatedAt: NOW
  });
  controlStore.createIssuanceRequest({
    id: requestRef,
    accountId,
    entitlementId: entitlementRef,
    approvalRef: "approval_fulfillment_001",
    status: "issued",
    quantity: 1,
    nodeId: edgeChannelRef,
    purpose: "portal_access_request",
    requestedByRef: "operator_fulfillment_001",
    createdAt: NOW,
    updatedAt: NOW
  });
  controlStore.linkIssuedSubscription({
    id: issuedLinkRef,
    requestId: requestRef,
    tenantRef: safeIssuedRef("tenant", tenantId),
    artifactRef: safeIssuedRef("artifact", artifactId),
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });

  runtimeCore.createTenant({
    displayName: "Synthetic Fulfillment",
    nodeId: "vultr-singapore",
    expiresAt: options.runtimeValidUntil || baseValidUntil,
    note: ""
  });
  runtimeCore.createSubscriptionArtifact(tenantId);

  if (options.tenantStatus === "disabled") {
    runtimeCore.disableTenant(tenantId);
  }
  if (options.artifactStatus === "revoked") {
    runtimeCore.revokeSubscriptionArtifact(artifactId);
  }

  controlStore.upsertPortalAccessRequest({
    id: requestRef,
    portalUserRef: accountId,
    plan: "trial",
    clientTarget: "clash",
    durationDays: 7,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: NOW,
    reviewedAt: NOW,
    reviewedByRef: "operator_fulfillment_001",
    expiresAt: options.portalValidUntil || baseValidUntil,
    validUntil: options.portalValidUntil || baseValidUntil,
    entitlementRef: options.portalEntitlementRef === undefined
      ? entitlementRef
      : options.portalEntitlementRef,
    accessGrantRef,
    tenantId: options.portalTenantId === undefined
      ? tenantId
      : options.portalTenantId,
    artifactId: options.portalArtifactId === undefined
      ? artifactId
      : options.portalArtifactId,
    edgeChannelRef,
    edgeCredentialRef,
    edgeMaterialDigest
  });

  if (options.legacyExpiredPortalRequest) {
    controlStore.createEntitlement({
      id: "ent_fulfillment_legacy_expired",
      accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-06-01T00:00:00.000Z",
      validUntil: "2026-07-15T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    controlStore.createIssuanceRequest({
      id: "pareq_fulfillment_legacy_expired",
      accountId,
      entitlementId: "ent_fulfillment_legacy_expired",
      approvalRef: "approval_fulfillment_legacy_expired",
      status: "issued",
      quantity: 1,
      nodeId: edgeChannelRef,
      purpose: "portal_access_request",
      requestedByRef: "operator_fulfillment_legacy_expired",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    controlStore.linkIssuedSubscription({
      id: "link_fulfillment_legacy_expired",
      requestId: "pareq_fulfillment_legacy_expired",
      tenantRef: safeIssuedRef("tenant", "tenant_fulfillment_legacy_expired"),
      artifactRef: safeIssuedRef("artifact", "artifact_fulfillment_legacy_expired"),
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    });
    controlStore.upsertPortalAccessRequest({
      id: "pareq_fulfillment_legacy_expired",
      portalUserRef: accountId,
      plan: "trial",
      clientTarget: "clash",
      durationDays: 7,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      reviewedAt: "2026-06-01T00:00:00.000Z",
      reviewedByRef: "operator_fulfillment_legacy_expired",
      expiresAt: "2026-07-15T00:00:00.000Z",
      validUntil: "2026-07-15T00:00:00.000Z",
      entitlementRef: "ent_fulfillment_legacy_expired",
      accessGrantRef: "grant_fulfillment_legacy_expired",
      tenantId: "tenant_fulfillment_legacy_expired",
      artifactId: "artifact_fulfillment_legacy_expired",
      edgeChannelRef,
      edgeCredentialRef: "edgecred_fulfillment_legacy_expired",
      edgeMaterialDigest: "sha256:synthetic_fulfillment_legacy_expired"
    });
  }

  if (options.duplicatePortalRequest) {
    const duplicate = controlStore.getPortalAccessRequest(requestRef);
    delete duplicate.edgeCredentials;
    controlStore.upsertPortalAccessRequest({
      ...duplicate,
      id: "pareq_fulfillment_duplicate",
      submittedAt: "2026-07-02T00:00:00.000Z",
      edgeChannelRef: null,
      edgeCredentialRef: null,
      edgeMaterialDigest: null
    });
  }

  return {
    directory,
    controlDbPath,
    runtimeDbPath,
    get controlStore() {
      return controlStore;
    },
    get runtimeStore() {
      return runtimeStore;
    },
    get runtimeCore() {
      return runtimeCore;
    },
    accountId,
    requestRef,
    entitlementRef,
    tenantId,
    artifactId,
    issuedLinkRef,
    accessGrantRef,
    edgeChannelRef,
    edgeCredentialRef,
    edgeMaterialDigest,
    issuedTenantRef: safeIssuedRef("tenant", tenantId),
    issuedArtifactRef: safeIssuedRef("artifact", artifactId),
    setNow(value) {
      now = value;
    },
    reopen() {
      controlStore.close();
      runtimeStore.close();
      controlStore = createSqliteSubscriptionControlStore({
        dbPath: controlDbPath,
        initializeSchema: false
      });
      runtimeStore = createSqliteSubscriptionStore({ dbPath: runtimeDbPath });
      runtimeCore = createRuntimeCore(runtimeStore);
    },
    close() {
      controlStore?.close();
      runtimeStore?.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  };
}

function productionInput(fixture, offer = COIN_COMMERCE_PRODUCTION_OFFERS[0], overrides = {}) {
  return {
    commandRef: "coincmd_fulfillment_001",
    orderRef: "coinord_fulfillment_001",
    accountId: fixture.accountId,
    offerVersionRef: offer.offerVersionRef,
    delivery: { ...offer.delivery },
    ...overrides
  };
}

function createInitialFulfillmentFixture({ nowFn, beforeApply } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-initial-clock-"));
  const controlDbPath = join(directory, "control.sqlite");
  const controlStore = createSqliteSubscriptionControlStore({
    dbPath: controlDbPath
  });
  const runtimeStore = createSqliteSubscriptionStore({
    dbPath: join(directory, "runtime.sqlite")
  });
  const runtimeCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn: () => new Date(NOW),
    tokenFactory,
    artifactSecretFactory: () => "synthetic_initial_clock_artifact",
    idFactory: () => "tenant_initial_clock_001",
    artifactIdFactory: () => "artifact_initial_clock_001"
  });
  const accountId = "acct_initial_clock_001";
  controlStore.createAccount({
    id: accountId,
    ownerRef: "owner_initial_clock_001",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  const issuer = createPortalAccessRequestService({
    nowFn,
    controlStore,
    runtimeCore,
    autoIssuance: {
      enabled: true,
      nodeId: "node_sg",
      reviewedByRef: "commerce_product_issuer"
    }
  });
  let issuanceCalls = 0;
  let applyCalls = 0;
  const accountResourceIssuer = Object.create(issuer);
  accountResourceIssuer.fulfillCommerceProduct = (input) => {
    issuanceCalls += 1;
    return issuer.fulfillCommerceProduct(input);
  };
  const fulfillmentControlStore = Object.create(controlStore);
  fulfillmentControlStore.applyCoinCommerceSubscriptionFulfillment = (input) => {
    applyCalls += 1;
    beforeApply?.(input, applyCalls);
    return controlStore.applyCoinCommerceSubscriptionFulfillment(input);
  };
  const service = createCoinCommerceProductionSubscriptionFulfillment({
    controlStore: fulfillmentControlStore,
    runtimeCore,
    accountResourceIssuer,
    nowFn,
    accountActivationReader: ACTIVATED_ACCOUNT_READER
  });
  return {
    accountId,
    controlDbPath,
    controlStore,
    runtimeCore,
    service,
    get issuanceCalls() { return issuanceCalls; },
    get applyCalls() { return applyCalls; },
    close() {
      controlStore.close();
      runtimeStore.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    }
  };
}

test("production subscription fulfillment exposes the exact factory contract for one eligible stable binding", () => {
  const fixture = createFixture();
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.deepEqual(Object.keys(service).sort(), [
      "fulfillmentHandler",
      "purchaseEligibilityReader",
      "storefrontEligibilityReader"
    ]);
    assert.deepEqual(
      Object.keys(service.fulfillmentHandler).sort(),
      ["execute", "idempotencyContract"]
    );
    assert.equal(
      service.fulfillmentHandler.idempotencyContract,
      "deduplicate_by_command_ref"
    );
    assert.equal(typeof service.fulfillmentHandler.execute, "function");
    assert.equal(
      service.purchaseEligibilityReader({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      true
    );
  } finally {
    fixture.close();
  }
});

test("production subscription fulfillment requires an exact synchronous account activation decision", async (t) => {
  const fixture = createFixture();
  try {
    assert.throws(
      () => createCoinCommerceProductionSubscriptionFulfillment({
        controlStore: fixture.controlStore,
        runtimeCore: fixture.runtimeCore,
        nowFn: () => new Date(NOW)
      }),
      (error) => error.code === "coin_commerce_fulfillment_activation_reader_invalid"
    );

    const decisions = [
      ["false", () => false],
      ["undefined", () => undefined],
      ["throw", () => {
        throw new Error("private activation detail");
      }],
      ["Promise", () => Promise.resolve(true)]
    ];
    for (const [name, accountActivationReader] of decisions) {
      await t.test(name, () => {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader,
          nowFn: () => new Date(NOW)
        });
        assert.equal(
          service.purchaseEligibilityReader({
            accountId: fixture.accountId,
            offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
          }),
          false
        );
      });
    }

    let activated = true;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: () => activated,
      nowFn: () => new Date(NOW)
    });
    assert.equal(
      service.purchaseEligibilityReader({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      true
    );
    activated = false;
    assert.equal(
      service.purchaseEligibilityReader({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      false
    );
    assert.equal(
      service.fulfillmentHandler.execute(productionInput(fixture)).status,
      "delivered"
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("production fulfillment rejects accessor-backed, proxied, and over-specified inputs before activation", () => {
  const fixture = createFixture();
  try {
    let activationCalls = 0;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: () => {
        activationCalls += 1;
        return true;
      },
      nowFn: () => new Date(NOW)
    });
    const eligibilityInput = {};
    Object.defineProperty(eligibilityInput, "accountId", {
      enumerable: true,
      get() {
        throw new Error("private accessor detail");
      }
    });
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), false);
    assert.equal(
      service.purchaseEligibilityReader(new Proxy({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }, {})),
      false
    );

    const commandInput = productionInput(fixture);
    Object.defineProperty(commandInput, "accountId", {
      enumerable: true,
      get() {
        throw new Error("private accessor detail");
      }
    });
    assert.throws(
      () => service.fulfillmentHandler.execute(commandInput),
      (error) => (
        error.code === "coin_commerce_fulfillment_invalid_input"
        && !String(error).includes("accessor detail")
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    for (const invalidInput of [
      new Proxy(productionInput(fixture), {}),
      {
        ...productionInput(fixture),
        unexpected: true
      },
      {
        ...productionInput(fixture),
        delivery: new Proxy({
          ...COIN_COMMERCE_PRODUCTION_OFFERS[0].delivery
        }, {})
      }
    ]) {
      assert.throws(
        () => service.fulfillmentHandler.execute(invalidInput),
        (error) => (
          (error.code === "coin_commerce_fulfillment_invalid_input"
            || error.code === "coin_commerce_fulfillment_invalid_delivery")
          && !isCoinCommerceFulfillmentRetryableError(error)
        )
      );
    }
    assert.equal(activationCalls, 0);
  } finally {
    fixture.close();
  }
});

test("production fulfillment rejects non-text command and order refs without coercion or issuance", () => {
  const fixture = createInitialFulfillmentFixture({ nowFn: () => new Date(NOW) });
  try {
    const before = fixture.controlStore.getAccountControlSummary(fixture.accountId);
    const invalidValues = [
      undefined,
      null,
      0,
      "",
      "   ",
      [],
      Buffer.from("synthetic-not-a-text-ref"),
      { toString() { throw new Error("private coercion detail"); } }
    ];
    for (const field of ["commandRef", "orderRef"]) {
      for (const value of invalidValues) {
        assert.throws(
          () => fixture.service.fulfillmentHandler.execute({
            ...productionInput(fixture),
            [field]: value
          }),
          (error) => (
            error.code === "coin_commerce_fulfillment_invalid_input"
            && !String(error).includes("private coercion detail")
            && !isCoinCommerceFulfillmentRetryableError(error)
          ),
          field
        );
      }
    }
    assert.equal(fixture.issuanceCalls, 0);
    assert.equal(fixture.applyCalls, 0);
    assert.deepEqual(fixture.controlStore.getAccountControlSummary(fixture.accountId), before);
  } finally {
    fixture.close();
  }
});

test("an expiring but enabled runtime tenant remains eligible to renew its stable binding", () => {
  const fixture = createFixture({
    baseValidUntil: "2026-08-03T00:00:00.000Z"
  });
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.equal(fixture.runtimeCore.getTenant(fixture.tenantId).status, "expiring");
    assert.equal(
      service.purchaseEligibilityReader({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      true
    );
  } finally {
    fixture.close();
  }
});

test("purchase eligibility fails closed for inactive accounts", async (t) => {
  const cases = [
    ["suspended account", { accountStatus: "suspended" }],
    ["disabled account", { accountStatus: "disabled" }]
  ];

  for (const [name, options] of cases) {
    await t.test(name, () => {
      const fixture = createFixture(options);
      try {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });

        assert.equal(
          service.purchaseEligibilityReader({
            accountId: fixture.accountId,
            offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
          }),
          false
        );
      } finally {
        fixture.close();
      }
    });
  }
});

test("an account without a prior entitlement can purchase into one stable account resource", () => {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-account-eligibility-"));
  const controlStore = createSqliteSubscriptionControlStore({
    dbPath: join(directory, "control.sqlite")
  });
  const runtimeStore = createSqliteSubscriptionStore({
    dbPath: join(directory, "runtime.sqlite")
  });
  const runtimeCore = createSubscriptionCore({
    store: runtimeStore,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.test",
    nowFn: () => new Date(NOW),
    tokenFactory,
    artifactSecretFactory: () => "synthetic_first_account_resource",
    idFactory: () => "tenant_first_account_resource_001",
    artifactIdFactory: () => "artifact_first_account_resource_001"
  });
  const accountId = "acct_storefront_without_entitlement";
  try {
    controlStore.createAccount({
      id: accountId,
      ownerRef: "owner_storefront_without_entitlement",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    const unavailableService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    assert.equal(unavailableService.purchaseEligibilityReader({
      accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    }), false);
    const accountResourceIssuer = createPortalAccessRequestService({
      nowFn: () => NOW,
      controlStore,
      runtimeCore,
      autoIssuance: {
        enabled: true,
        nodeId: "node_sg",
        reviewedByRef: "commerce_product_issuer"
      }
    });
    let applyAttempts = 0;
    const fulfillmentControlStore = Object.create(controlStore);
    fulfillmentControlStore.applyCoinCommerceSubscriptionFulfillment = (input) => {
      applyAttempts += 1;
      if (applyAttempts === 1) {
        const error = new Error("synthetic busy after initial issuance");
        error.code = "SQLITE_BUSY_RECOVERY";
        throw error;
      }
      return controlStore.applyCoinCommerceSubscriptionFulfillment(input);
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fulfillmentControlStore,
      runtimeCore,
      accountResourceIssuer,
      nowFn: () => new Date(NOW),
      accountActivationReader: ACTIVATED_ACCOUNT_READER
    });

    assert.deepEqual(
      controlStore.getAccountControlSummary(accountId).entitlements,
      []
    );
    assert.equal(service.storefrontEligibilityReader({
      accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    }), true);
    assert.equal(service.purchaseEligibilityReader({
      accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    }), true);
    const command = {
      commandRef: "coincmd_first_account_resource_1",
      orderRef: "coinord_first_account_resource_1",
      accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef,
      delivery: { ...COIN_COMMERCE_PRODUCTION_OFFERS[0].delivery }
    };
    assert.throws(
      () => service.fulfillmentHandler.execute(command),
      (error) => isCoinCommerceFulfillmentRetryableError(error)
    );
    const delivered = service.fulfillmentHandler.execute(command);
    assert.equal(delivered.status, "delivered");

    const [resource] = controlStore.listPortalAccessRequests({ portalUserRef: accountId });
    const entitlement = controlStore.getEntitlement(resource.entitlementRef);
    assert.equal(resource.status, "delivered");
    assert.equal(entitlement.plan, COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef);
    assert.equal(entitlement.trafficLimitBytes, 50 * GIB);
    assert.equal(entitlement.validUntil, "2026-08-29T00:00:00.000Z");
    assert.equal(controlStore.getAccountControlSummary(accountId).entitlements.length, 1);

    controlStore.upsertPortalAccessRequest({
      ...resource,
      event: {
        type: "delivery_generation_reissued",
        occurredAt: "2026-07-30T00:01:00.000Z"
      },
      updatedAt: "2026-07-30T00:01:00.000Z"
    });
    assert.deepEqual(service.fulfillmentHandler.execute(command), delivered);
    assert.equal(controlStore.getAccountControlSummary(accountId).entitlements.length, 1);
    assert.equal(controlStore.listPortalAccessRequests({ portalUserRef: accountId }).length, 1);
  } finally {
    controlStore.close();
    runtimeStore.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("initial fulfillment completes when the issuer clock advances by one millisecond", () => {
  let clock = Date.parse(NOW);
  const fixture = createInitialFulfillmentFixture({
    nowFn: () => new Date(clock++)
  });
  try {
    const command = productionInput(fixture);
    const delivered = fixture.service.fulfillmentHandler.execute(command);
    assert.equal(delivered.status, "delivered");
    assert.equal(fixture.issuanceCalls, 1);
    assert.equal(fixture.applyCalls, 1);
    const summary = fixture.controlStore.getAccountControlSummary(fixture.accountId);
    const resources = fixture.controlStore.listPortalAccessRequests({
      portalUserRef: fixture.accountId
    });
    assert.equal(summary.entitlements.length, 1);
    assert.equal(resources.length, 1);
    const [resource] = resources;
    const entitlement = fixture.controlStore.getEntitlement(resource.entitlementRef);
    assert.equal(resource.status, "delivered");
    assert.equal(entitlement.validFrom, resource.submittedAt);
    assert.equal(entitlement.createdAt, resource.submittedAt);
    assert.equal(entitlement.trafficLimitBytes, 50 * GIB);
    assert.equal(
      Date.parse(entitlement.validUntil) - Date.parse(entitlement.validFrom),
      30 * 24 * 60 * 60 * 1000
    );
    assert.equal(
      summary.auditEvents.filter((event) => event.action === "subscription_fulfillment_applied").length,
      1
    );
    assert.equal(fixture.runtimeCore.getTenant(resource.tenantId).expiresAt, entitlement.validUntil);
  } finally {
    fixture.close();
  }
});

test("initial fulfillment recovers the same command after clock advance without reissue or added duration", () => {
  let clock = Date.parse(NOW);
  const fixture = createInitialFulfillmentFixture({
    nowFn: () => new Date(clock),
    beforeApply(_input, attempt) {
      if (attempt === 1) {
        const error = new Error("synthetic busy after initial issuance");
        error.code = "SQLITE_BUSY_RECOVERY";
        throw error;
      }
    }
  });
  try {
    const command = productionInput(fixture);
    assert.throws(
      () => fixture.service.fulfillmentHandler.execute(command),
      (error) => isCoinCommerceFulfillmentRetryableError(error)
    );
    const [beforeResource] = fixture.controlStore.listPortalAccessRequests({
      portalUserRef: fixture.accountId
    });
    const beforeEntitlement = fixture.controlStore.getEntitlement(beforeResource.entitlementRef);
    assert.equal(beforeResource.status, "delivered");
    assert.equal(beforeEntitlement.validUntil, "2026-08-29T00:00:00.000Z");
    assert.equal(fixture.controlStore.getAuditEvent(fulfillmentEffectRef(command.commandRef)), null);
    assert.equal(fixture.issuanceCalls, 1);

    clock += 60_000;
    const delivered = fixture.service.fulfillmentHandler.execute(command);
    assert.equal(delivered.status, "delivered");
    assert.equal(fixture.issuanceCalls, 1);
    const [resource] = fixture.controlStore.listPortalAccessRequests({
      portalUserRef: fixture.accountId
    });
    const entitlement = fixture.controlStore.getEntitlement(resource.entitlementRef);
    assert.equal(resource.id, beforeResource.id);
    assert.equal(resource.tenantId, beforeResource.tenantId);
    assert.equal(resource.artifactId, beforeResource.artifactId);
    assert.equal(entitlement.id, beforeEntitlement.id);
    assert.equal(entitlement.validFrom, beforeEntitlement.validFrom);
    assert.equal(entitlement.validUntil, beforeEntitlement.validUntil);
    assert.equal(resource.expiresAt, beforeResource.expiresAt);
    assert.equal(resource.validUntil, beforeResource.validUntil);
    assert.equal(fixture.runtimeCore.getTenant(resource.tenantId).expiresAt, beforeEntitlement.validUntil);
    assert.equal(fixture.controlStore.getAccountControlSummary(fixture.accountId).entitlements.length, 1);
    assert.equal(fixture.controlStore.listIssuedSubscriptionBindings({ accountId: fixture.accountId }).length, 1);
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId).auditEvents
        .filter((event) => event.action === "subscription_fulfillment_applied").length,
      1
    );
    clock += 60_000;
    assert.deepEqual(fixture.service.fulfillmentHandler.execute(command), delivered);
    assert.equal(fixture.issuanceCalls, 1);
    assert.equal(fixture.controlStore.getEntitlement(entitlement.id).validUntil, beforeEntitlement.validUntil);
  } finally {
    fixture.close();
  }
});

test("the real coordinator confirms delayed initial issuance once without recapturing Coins", async () => {
  let clock = NOW;
  const fixture = createInitialFulfillmentFixture({
    nowFn: () => new Date(clock),
    beforeApply(_input, attempt) {
      if (attempt === 1) {
        const error = new Error("synthetic busy after initial issuance");
        error.code = "SQLITE_BUSY_RECOVERY";
        throw error;
      }
    }
  });
  let database;
  let commerceStore;
  let coordinator;
  try {
    database = new Database(fixture.controlDbPath);
    applyCoinWalletMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(clock)
    });
    applyCoinCommerceMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(clock)
    });
    // Same clock-only adapter as the coordinator restart tests: all SQL,
    // transactions, state checks and wallet writes use the real SQLite store.
    const clockDatabase = new Proxy(database, {
      get(target, property) {
        if (property === "inTransaction") return target.inTransaction;
        if (property === "prepare") {
          return (sql) => {
            if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
              return { pluck: () => ({ get: () => clock }) };
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    commerceStore = createSqliteCoinCommerceStore({ database: clockDatabase, cancelWindowMs: 0 });
    commerceStore.walletStore.creditCoins({
      accountId: fixture.accountId,
      coinType: "paid_coins",
      amountUnits: 20,
      availability: "available",
      sourceType: "synthetic_seed",
      sourceRef: "source_initial_clock",
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: "system:initial-clock-test",
        idempotencyKey: "credit_initial_clock",
        actorType: "system",
        actorRef: "initial_clock_test"
      }
    });
    commerceStore.bootstrapPublishedOffers([COIN_COMMERCE_PRODUCTION_OFFERS[0]]);
    const quote = commerceStore.createCheckoutQuote({
      accountId: fixture.accountId,
      offerRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerRef
    });
    const held = commerceStore.confirmOrder({
      accountId: fixture.accountId,
      quoteRef: quote.quoteRef,
      operation: {
        actorScope: `portal:${fixture.accountId}`,
        idempotencyKey: "confirm_initial_clock",
        actorType: "portal_user",
        actorRef: fixture.accountId
      }
    });
    const [claimed] = commerceStore.claimDueCaptures({ limit: 1 });
    assert.equal(claimed.orderRef, held.orderRef);
    commerceStore.captureClaimedOrder({ orderRef: held.orderRef });
    const readOrder = () => commerceStore.getOrder({
      accountId: fixture.accountId,
      orderRef: held.orderRef
    });
    const readReceiptCount = () => database.prepare(`
      select count(*) as count from platform_coin_commerce_fulfillment_receipts
    `).get().count;
    const readHolds = () => database.prepare("select * from platform_coin_holds order by hold_ref").all();
    const readLedger = () => database.prepare("select * from platform_coin_ledger_entries order by entry_ref").all();
    const capturedHolds = readHolds();
    const capturedLedger = readLedger();
    assert.equal(capturedHolds.length, 1);
    assert.equal(capturedHolds[0].status, "captured");
    assert.equal(readOrder().paymentStatus, "captured");
    assert.equal(readOrder().fulfillment.status, "pending");
    coordinator = createCoinCommerceCoordinator({
      store: commerceStore,
      fulfillmentHandler: fixture.service.fulfillmentHandler,
      nowFn: () => new Date(clock)
    });

    const firstPass = await coordinator.runOnce();
    assert.equal(firstPass.commandsDeferred, 1);
    assert.equal(firstPass.commandsFailed, 0);
    assert.equal(readOrder().paymentStatus, "captured");
    assert.equal(readOrder().fulfillment.status, "processing");
    assert.equal(readReceiptCount(), 0);
    const [beforeResource] = fixture.controlStore.listPortalAccessRequests({
      portalUserRef: fixture.accountId
    });
    const beforeEntitlement = fixture.controlStore.getEntitlement(beforeResource.entitlementRef);
    assert.equal(beforeResource.status, "delivered");
    assert.equal(beforeEntitlement.validUntil, "2026-08-29T00:00:00.000Z");
    assert.equal(fixture.issuanceCalls, 1);

    clock = "2026-07-30T00:01:00.000Z";
    const recoveredPass = await coordinator.runOnce();
    assert.equal(recoveredPass.commandsDelivered, 1);
    assert.equal(recoveredPass.commandsFailed, 0);
    assert.equal(recoveredPass.capturesProcessed, 0);
    assert.equal(readOrder().paymentStatus, "captured");
    assert.equal(readOrder().fulfillment.status, "delivered");
    assert.equal(readReceiptCount(), 1);
    assert.equal(fixture.issuanceCalls, 1);
    assert.equal(fixture.controlStore.getEntitlement(beforeEntitlement.id).validUntil, beforeEntitlement.validUntil);
    assert.equal(fixture.runtimeCore.getTenant(beforeResource.tenantId).expiresAt, beforeEntitlement.validUntil);
    assert.deepEqual(readHolds(), capturedHolds);
    assert.deepEqual(readLedger(), capturedLedger);
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId).auditEvents
        .filter((event) => event.action === "subscription_fulfillment_applied").length,
      1
    );
    await coordinator.runOnce();
    assert.equal(readReceiptCount(), 1);
    assert.equal(fixture.issuanceCalls, 1);
    assert.deepEqual(readHolds(), capturedHolds);
    assert.deepEqual(readLedger(), capturedLedger);
  } finally {
    await coordinator?.stop();
    commerceStore?.close();
    database?.close();
    fixture.close();
  }
});

test("a different command renews rather than adopting another unconfirmed initial issuance", () => {
  const fixture = createInitialFulfillmentFixture({
    nowFn: () => new Date(NOW),
    beforeApply(_input, attempt) {
      if (attempt === 1) {
        const error = new Error("synthetic busy after initial issuance");
        error.code = "SQLITE_BUSY_RECOVERY";
        throw error;
      }
    }
  });
  try {
    const initialCommand = productionInput(fixture);
    assert.throws(
      () => fixture.service.fulfillmentHandler.execute(initialCommand),
      (error) => isCoinCommerceFulfillmentRetryableError(error)
    );
    const [resource] = fixture.controlStore.listPortalAccessRequests({
      portalUserRef: fixture.accountId
    });
    const beforeEntitlement = fixture.controlStore.getEntitlement(resource.entitlementRef);
    const renewalCommand = productionInput(fixture, COIN_COMMERCE_PRODUCTION_OFFERS[0], {
      commandRef: "coincmd_initial_clock_renewal",
      orderRef: "coinord_initial_clock_renewal"
    });
    const result = fixture.service.fulfillmentHandler.execute(renewalCommand);
    assert.equal(result.status, "delivered");
    const afterEntitlement = fixture.controlStore.getEntitlement(resource.entitlementRef);
    assert.equal(
      Date.parse(afterEntitlement.validUntil) - Date.parse(beforeEntitlement.validUntil),
      30 * 24 * 60 * 60 * 1000
    );
    assert.equal(afterEntitlement.validFrom, beforeEntitlement.validFrom);
    assert.equal(fixture.issuanceCalls, 1);
    assert.equal(fixture.controlStore.getAccountControlSummary(fixture.accountId).entitlements.length, 1);
    assert.equal(fixture.controlStore.getAuditEvent(fulfillmentEffectRef(initialCommand.commandRef)), null);
    const renewalEffect = fixture.controlStore.getAuditEvent(fulfillmentEffectRef(renewalCommand.commandRef));
    assert.equal(renewalEffect.metadata.commandRef, renewalCommand.commandRef);
    assert.equal(renewalEffect.metadata.previousValidUntil, beforeEntitlement.validUntil);
    assert.equal(renewalEffect.metadata.targetValidUntil, afterEntitlement.validUntil);
    assert.equal(fixture.runtimeCore.getTenant(resource.tenantId).expiresAt, afterEntitlement.validUntil);
  } finally {
    fixture.close();
  }
});

test("same-command initial issuance drift never falls through to ordinary renewal", async (t) => {
  for (const drift of ["orderRef", "accessGrantRef", "submittedAt", "purpose"]) {
    await t.test(drift, () => {
      const fixture = createInitialFulfillmentFixture({
        nowFn: () => new Date(NOW),
        beforeApply(_input, attempt) {
          if (attempt === 1) {
            const error = new Error("synthetic busy after initial issuance");
            error.code = "SQLITE_BUSY_RECOVERY";
            throw error;
          }
        }
      });
      try {
        const command = productionInput(fixture);
        assert.throws(
          () => fixture.service.fulfillmentHandler.execute(command),
          (error) => isCoinCommerceFulfillmentRetryableError(error)
        );
        const [resource] = fixture.controlStore.listPortalAccessRequests({
          portalUserRef: fixture.accountId
        });
        if (drift === "orderRef") {
          command.orderRef = "coinord_initial_clock_wrong_order";
        } else if (drift === "purpose") {
          const db = new Database(fixture.controlDbPath);
          try {
            assert.equal(db.prepare(`
              update platform_issuance_requests set purpose = ? where id = ?
            `).run("synthetic_other_issuance_purpose", resource.id).changes, 1);
          } finally {
            db.close();
          }
        } else {
          const mutated = fixture.controlStore.getPortalAccessRequest(resource.id);
          delete mutated.edgeCredentials;
          if (drift === "accessGrantRef") {
            mutated.accessGrantRef = "grant_initial_clock_wrong_grant";
          } else {
            mutated.submittedAt = "2026-07-29T23:59:59.999Z";
          }
          fixture.controlStore.upsertPortalAccessRequest(mutated);
        }
        const beforeSummary = fixture.controlStore.getAccountControlSummary(fixture.accountId);
        const beforeResource = fixture.controlStore.getPortalAccessRequest(resource.id);
        const beforeTenant = fixture.runtimeCore.getTenant(resource.tenantId);
        assert.throws(
          () => fixture.service.fulfillmentHandler.execute(command),
          (error) => (
            isCoinCommerceFulfillmentReconciliationError(error)
            && !isCoinCommerceFulfillmentRetryableError(error)
          )
        );
        assert.equal(fixture.issuanceCalls, 1);
        assert.equal(fixture.controlStore.getAuditEvent(fulfillmentEffectRef(command.commandRef)), null);
        assert.deepEqual(fixture.controlStore.getAccountControlSummary(fixture.accountId), beforeSummary);
        assert.deepEqual(fixture.controlStore.getPortalAccessRequest(resource.id), beforeResource);
        assert.deepEqual(fixture.runtimeCore.getTenant(resource.tenantId), beforeTenant);
      } finally {
        fixture.close();
      }
    });
  }
});

test("ambiguous lapsed issued resources never fall back to initial issuance", () => {
  const fixture = createFixture({
    baseValidUntil: "2026-07-29T00:00:00.000Z"
  });
  try {
    fixture.controlStore.createEntitlement({
      id: "ent_fulfillment_second_lapsed_bound",
      accountId: fixture.accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-07-15T00:00:00.000Z",
      validUntil: "2026-07-29T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: NOW,
      updatedAt: NOW
    });
    fixture.controlStore.createIssuanceRequest({
      id: "pareq_fulfillment_second_lapsed_bound",
      accountId: fixture.accountId,
      entitlementId: "ent_fulfillment_second_lapsed_bound",
      approvalRef: "approval_fulfillment_second_lapsed_bound",
      status: "issued",
      quantity: 1,
      nodeId: fixture.edgeChannelRef,
      purpose: "portal_access_request",
      requestedByRef: "operator_fulfillment_second_lapsed_bound",
      createdAt: NOW,
      updatedAt: NOW
    });
    fixture.controlStore.linkIssuedSubscription({
      id: "link_fulfillment_second_lapsed_bound",
      requestId: "pareq_fulfillment_second_lapsed_bound",
      tenantRef: safeIssuedRef("tenant", "tenant_fulfillment_second_lapsed_bound"),
      artifactRef: safeIssuedRef("artifact", "artifact_fulfillment_second_lapsed_bound"),
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    let initialIssuanceAttempts = 0;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountResourceIssuer: {
        isCommerceProductFulfillmentReady: () => true,
        fulfillCommerceProduct() {
          initialIssuanceAttempts += 1;
        }
      },
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };

    assert.equal(service.purchaseEligibilityReader(eligibilityInput), false);
    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.equal(initialIssuanceAttempts, 0);
  } finally {
    fixture.close();
  }
});

test("a current unbound entitlement is not a Commerce account resource", () => {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-unbound-entitlement-"));
  const controlStore = createSqliteSubscriptionControlStore({
    dbPath: join(directory, "control.sqlite")
  });
  const accountId = "acct_fulfillment_unbound_current";
  let initialIssuanceAttempts = 0;
  try {
    controlStore.createAccount({
      id: accountId,
      ownerRef: "owner_fulfillment_unbound_current",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    controlStore.createEntitlement({
      id: "ent_fulfillment_unbound_current",
      accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-07-15T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: NOW,
      updatedAt: NOW
    });
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore,
      accountResourceIssuer: {
        isCommerceProductFulfillmentReady: () => true,
        fulfillCommerceProduct() {
          initialIssuanceAttempts += 1;
        }
      },
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const eligibilityInput = {
      accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };

    assert.equal(service.storefrontEligibilityReader(eligibilityInput), true);
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), false);
    assert.throws(
      () => service.fulfillmentHandler.execute({
        ...productionInput({ accountId }),
        accountId
      }),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.equal(initialIssuanceAttempts, 0);
  } finally {
    controlStore.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("nonterminal unbound issuance never falls back to a new account resource", async (t) => {
  for (const status of ["planned", "issued"]) {
    await t.test(status, () => {
      const directory = mkdtempSync(join(tmpdir(), "coin-commerce-unbound-issuance-"));
      const controlStore = createSqliteSubscriptionControlStore({
        dbPath: join(directory, "control.sqlite")
      });
      const accountId = `acct_fulfillment_unbound_${status}`;
      try {
        controlStore.createAccount({
          id: accountId,
          ownerRef: `owner_fulfillment_unbound_${status}`,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW
        });
        controlStore.createEntitlement({
          id: `ent_fulfillment_unbound_${status}`,
          accountId,
          plan: "trial",
          status: "active",
          validFrom: "2026-07-01T00:00:00.000Z",
          validUntil: "2026-07-29T00:00:00.000Z",
          maxArtifacts: 1,
          maxDevices: 2,
          trafficLimitBytes: 5 * GIB,
          createdAt: NOW,
          updatedAt: NOW
        });
        controlStore.createIssuanceRequest({
          id: `pareq_fulfillment_unbound_${status}`,
          accountId,
          entitlementId: `ent_fulfillment_unbound_${status}`,
          approvalRef: `approval_fulfillment_unbound_${status}`,
          status,
          quantity: 1,
          nodeId: "channel-vultr-a-tuic",
          purpose: "portal_access_request",
          requestedByRef: `operator_fulfillment_unbound_${status}`,
          createdAt: NOW,
          updatedAt: NOW
        });
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore,
          accountResourceIssuer: {
            isCommerceProductFulfillmentReady: () => true,
            fulfillCommerceProduct() {
              throw new Error("unexpected initial issuance");
            }
          },
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });

        assert.equal(service.purchaseEligibilityReader({
          accountId,
          offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
        }), false);
      } finally {
        controlStore.close();
        rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      }
    });
  }
});

test("storefront eligibility ignores service projections while purchase readiness stays fail closed", async (t) => {
  const cases = [
    ["inactive entitlement", { entitlementStatus: "suspended" }, false],
    ["ambiguous access requests", { duplicatePortalRequest: true }, true],
    ["missing entitlement reference", { portalEntitlementRef: null }, true],
    ["missing tenant reference", { portalTenantId: null }, true],
    ["missing artifact reference", { portalArtifactId: null }, true],
    ["mismatched entitlement binding", { portalEntitlementRef: "ent_mismatch" }, true],
    ["inactive runtime tenant", { tenantStatus: "disabled" }, true],
    ["inactive runtime artifact", { artifactStatus: "revoked" }, true],
    ["runtime expiry drift", { runtimeValidUntil: "2026-09-02T00:00:00.000Z" }, true],
    ["portal expiry drift", { portalValidUntil: "2026-09-02T00:00:00.000Z" }, true]
  ];

  for (const [name, options, expectedPurchaseEligibility] of cases) {
    await t.test(name, () => {
      const fixture = createFixture(options);
      try {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });

        const input = {
          accountId: fixture.accountId,
          offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
        };
        assert.equal(service.storefrontEligibilityReader(input), true);
        assert.equal(
          service.purchaseEligibilityReader(input),
          expectedPurchaseEligibility
        );
      } finally {
        fixture.close();
      }
    });
  }
});

test("the account storefront exposes every published plan regardless of current service expiry", () => {
  const activeFixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  const expiredFixture = createFixture({
    baseValidUntil: "2026-07-29T00:00:00.000Z",
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    const activeService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: activeFixture.controlStore,
      runtimeCore: activeFixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    assert.equal(
      activeService.purchaseEligibilityReader({
        accountId: activeFixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      true
    );
    assert.equal(
      activeService.storefrontEligibilityReader({
        accountId: activeFixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef
      }),
      true
    );
    assert.equal(
      activeService.purchaseEligibilityReader({
        accountId: activeFixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef
      }),
      false
    );

    const expiredService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: expiredFixture.controlStore,
      runtimeCore: expiredFixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    assert.equal(
      expiredFixture.runtimeCore.getTenant(expiredFixture.tenantId).status,
      "expired"
    );
    assert.equal(
      expiredService.purchaseEligibilityReader({
        accountId: expiredFixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef
      }),
      true
    );
    assert.equal(
      expiredService.fulfillmentHandler.execute(productionInput(
        expiredFixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[1]
      )).status,
      "delivered"
    );
    assert.equal(
      expiredFixture.controlStore.getEntitlement(
        expiredFixture.entitlementRef
      ).validUntil,
      "2026-08-29T00:00:00.000Z"
    );
  } finally {
    activeFixture.close();
    expiredFixture.close();
  }
});

test("purchase eligibility ignores expired legacy delivery history", () => {
  const fixture = createFixture({ legacyExpiredPortalRequest: true });
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.equal(
      service.purchaseEligibilityReader({
        accountId: fixture.accountId,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
      }),
      true
    );
  } finally {
    fixture.close();
  }
});

test("a future entitlement does not constrain the account storefront", () => {
  const fixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    fixture.controlStore.createEntitlement({
      id: "ent_fulfillment_future",
      accountId: fixture.accountId,
      plan: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef,
      status: "active",
      validFrom: "2026-10-01T00:00:00.000Z",
      validUntil: "2026-11-01T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 100 * GIB,
      createdAt: NOW,
      updatedAt: NOW
    });
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.equal(service.purchaseEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    }), true);
    assert.equal(service.storefrontEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef
    }), true);
    assert.equal(service.purchaseEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef
    }), false);
  } finally {
    fixture.close();
  }
});

test("fulfillment audit history does not control the account storefront", () => {
  const futureValidFrom = "2026-10-01T00:00:00.000Z";
  const futureValidUntil = "2026-11-01T00:00:00.000Z";
  const fixture = createFixture({
    entitlementValidFrom: futureValidFrom,
    baseValidUntil: futureValidUntil,
    portalValidUntil: futureValidUntil,
    runtimeValidUntil: futureValidUntil
  });
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const storefrontEligibility = () => service.storefrontEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    });
    const purchaseEligibility = () => service.purchaseEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    });

    assert.equal(storefrontEligibility(), true);
    assert.equal(purchaseEligibility(), false);
    fixture.controlStore.recordAuditEvent({
      id: "effect_coin_commerce_malformed_future",
      entityType: "coin_commerce_subscription_fulfillment",
      entityRef: fixture.entitlementRef,
      action: "subscription_fulfillment_applied",
      actorRef: "coin_commerce_fulfillment",
      createdAt: NOW,
      metadata: {}
    });
    assert.equal(storefrontEligibility(), true);
    assert.equal(purchaseEligibility(), false);
  } finally {
    fixture.close();
  }
});

test("fresh fulfillment rejects malformed pre-existing Commerce history without mutation", () => {
  const fixture = createFixture();
  try {
    fixture.controlStore.recordAuditEvent({
      id: "effect_coin_commerce_malformed_history",
      entityType: "coin_commerce_subscription_fulfillment",
      entityRef: fixture.entitlementRef,
      action: "subscription_fulfillment_applied",
      actorRef: "coin_commerce_fulfillment",
      createdAt: NOW,
      metadata: {}
    });
    const before = fixture.controlStore.getEntitlement(fixture.entitlementRef);
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.deepEqual(
      fixture.controlStore.getEntitlement(fixture.entitlementRef),
      before
    );
  } finally {
    fixture.close();
  }
});

test("unbound current legacy entitlements do not block the unique issued account resource", () => {
  const fixture = createFixture();
  try {
    fixture.controlStore.createEntitlement({
      id: "ent_fulfillment_second_current",
      accountId: fixture.accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-07-15T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: NOW,
      updatedAt: NOW
    });
    const unboundBefore = fixture.controlStore.getEntitlement(
      "ent_fulfillment_second_current"
    );
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };
    assert.equal(service.storefrontEligibilityReader(eligibilityInput), true);
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), true);
    assert.equal(
      service.fulfillmentHandler.execute(productionInput(fixture)).status,
      "delivered"
    );
    assert.deepEqual(
      fixture.controlStore.getEntitlement("ent_fulfillment_second_current"),
      unboundBefore
    );
  } finally {
    fixture.close();
  }
});

test("a lapsed issued account resource remains authoritative over current unbound history", () => {
  const fixture = createFixture({
    baseValidUntil: "2026-07-29T00:00:00.000Z"
  });
  try {
    for (const [id, validUntil] of [
      ["ent_fulfillment_current_unbound_a", "2026-10-01T00:00:00.000Z"],
      ["ent_fulfillment_current_unbound_b", "2026-11-01T00:00:00.000Z"]
    ]) {
      fixture.controlStore.createEntitlement({
        id,
        accountId: fixture.accountId,
        plan: "trial",
        status: "active",
        validFrom: "2026-07-15T00:00:00.000Z",
        validUntil,
        maxArtifacts: 1,
        maxDevices: 2,
        trafficLimitBytes: 5 * GIB,
        createdAt: NOW,
        updatedAt: NOW
      });
    }
    const unboundBefore = [
      fixture.controlStore.getEntitlement("ent_fulfillment_current_unbound_a"),
      fixture.controlStore.getEntitlement("ent_fulfillment_current_unbound_b")
    ];
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };

    assert.equal(service.purchaseEligibilityReader(eligibilityInput), true);
    assert.equal(
      service.fulfillmentHandler.execute(productionInput(fixture)).status,
      "delivered"
    );
    assert.deepEqual([
      fixture.controlStore.getEntitlement("ent_fulfillment_current_unbound_a"),
      fixture.controlStore.getEntitlement("ent_fulfillment_current_unbound_b")
    ], unboundBefore);
  } finally {
    fixture.close();
  }
});

test("multiple active issued account resources remain fail closed", () => {
  const fixture = createFixture();
  try {
    fixture.controlStore.createEntitlement({
      id: "ent_fulfillment_second_bound",
      accountId: fixture.accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-07-15T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: NOW,
      updatedAt: NOW
    });
    fixture.controlStore.createIssuanceRequest({
      id: "pareq_fulfillment_second_bound",
      accountId: fixture.accountId,
      entitlementId: "ent_fulfillment_second_bound",
      approvalRef: "approval_fulfillment_second_bound",
      status: "issued",
      quantity: 1,
      nodeId: fixture.edgeChannelRef,
      purpose: "portal_access_request",
      requestedByRef: "operator_fulfillment_second_bound",
      createdAt: NOW,
      updatedAt: NOW
    });
    fixture.controlStore.linkIssuedSubscription({
      id: "link_fulfillment_second_bound",
      requestId: "pareq_fulfillment_second_bound",
      tenantRef: safeIssuedRef("tenant", "tenant_fulfillment_second_bound"),
      artifactRef: safeIssuedRef("artifact", "artifact_fulfillment_second_bound"),
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };
    assert.equal(service.storefrontEligibilityReader(eligibilityInput), true);
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), false);
    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
  } finally {
    fixture.close();
  }
});

test("tied unbound lapsed history does not block the unique issued account resource", () => {
  const fixture = createFixture({
    baseValidUntil: "2026-07-29T00:00:00.000Z"
  });
  try {
    fixture.controlStore.createEntitlement({
      id: "ent_fulfillment_tied_lapsed",
      accountId: fixture.accountId,
      plan: "trial",
      status: "active",
      validFrom: "2026-06-15T00:00:00.000Z",
      validUntil: "2026-07-29T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 5 * GIB,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    });
    const unboundBefore = fixture.controlStore.getEntitlement(
      "ent_fulfillment_tied_lapsed"
    );
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };
    assert.equal(service.storefrontEligibilityReader(eligibilityInput), true);
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), true);
    assert.equal(
      service.fulfillmentHandler.execute(productionInput(fixture)).status,
      "delivered"
    );
    assert.deepEqual(
      fixture.controlStore.getEntitlement("ent_fulfillment_tied_lapsed"),
      unboundBefore
    );
  } finally {
    fixture.close();
  }
});

test("fulfillment applies the product to the current user entitlement without rewriting expired history", () => {
  const fixture = createFixture({ legacyExpiredPortalRequest: true });
  try {
    const legacyBefore = fixture.controlStore.getEntitlement(
      "ent_fulfillment_legacy_expired"
    );
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.equal(
      service.fulfillmentHandler.execute(productionInput(fixture)).status,
      "delivered"
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      trafficLimitBytes: fixture.controlStore.getEntitlement(
        fixture.entitlementRef
      ).trafficLimitBytes
    }, {
      plan: "offerv_plan_30d_50gb_monthly_v1",
      validUntil: "2026-10-01T00:00:00.000Z",
      trafficLimitBytes: 50 * GIB
    });
    assert.deepEqual(
      fixture.controlStore.getEntitlement("ent_fulfillment_legacy_expired"),
      legacyBefore
    );
  } finally {
    fixture.close();
  }
});

test("lapsed fulfillment renews the most recent user entitlement without reviving older history", () => {
  const fixture = createFixture({
    baseValidUntil: "2026-07-29T00:00:00.000Z",
    legacyExpiredPortalRequest: true
  });
  try {
    const legacyBefore = fixture.controlStore.getEntitlement(
      "ent_fulfillment_legacy_expired"
    );
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.equal(
      service.fulfillmentHandler.execute(productionInput(
        fixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[1]
      )).status,
      "delivered"
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      trafficLimitBytes: fixture.controlStore.getEntitlement(
        fixture.entitlementRef
      ).trafficLimitBytes
    }, {
      plan: "offerv_plan_30d_100gb_monthly_v1",
      validUntil: "2026-08-29T00:00:00.000Z",
      trafficLimitBytes: 100 * GIB
    });
    assert.deepEqual(
      fixture.controlStore.getEntitlement("ent_fulfillment_legacy_expired"),
      legacyBefore
    );
  } finally {
    fixture.close();
  }
});

test("fulfillment rechecks the unique issued account resource inside the control transaction", () => {
  const fixture = createFixture();
  try {
    const controlStore = {
      ...fixture.controlStore,
      applyCoinCommerceSubscriptionFulfillment(input) {
        fixture.controlStore.createEntitlement({
          id: "ent_fulfillment_concurrent",
          accountId: fixture.accountId,
          plan: "trial",
          status: "active",
          validFrom: "2026-07-15T00:00:00.000Z",
          validUntil: "2026-10-01T00:00:00.000Z",
          maxArtifacts: 1,
          maxDevices: 2,
          trafficLimitBytes: 5 * GIB,
          createdAt: NOW,
          updatedAt: NOW
        });
        fixture.controlStore.createIssuanceRequest({
          id: "pareq_fulfillment_concurrent",
          accountId: fixture.accountId,
          entitlementId: "ent_fulfillment_concurrent",
          approvalRef: "approval_fulfillment_concurrent",
          status: "issued",
          quantity: 1,
          nodeId: fixture.edgeChannelRef,
          purpose: "portal_access_request",
          requestedByRef: "operator_fulfillment_concurrent",
          createdAt: NOW,
          updatedAt: NOW
        });
        fixture.controlStore.linkIssuedSubscription({
          id: "link_fulfillment_concurrent",
          requestId: "pareq_fulfillment_concurrent",
          tenantRef: safeIssuedRef("tenant", "tenant_fulfillment_concurrent"),
          artifactRef: safeIssuedRef("artifact", "artifact_fulfillment_concurrent"),
          status: "active",
          createdAt: NOW,
          updatedAt: NOW
        });
        return fixture.controlStore.applyCoinCommerceSubscriptionFulfillment(input);
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      trafficLimitBytes: fixture.controlStore.getEntitlement(
        fixture.entitlementRef
      ).trafficLimitBytes
    }, {
      plan: "trial",
      validUntil: CURRENT_VALID_UNTIL,
      trafficLimitBytes: 5 * GIB
    });
  } finally {
    fixture.close();
  }
});

test("captured fulfillment retries unknown dependency faults but isolates permanent binding loss", async (t) => {
  await t.test("unknown runtime read fault is retryable", () => {
    const fixture = createFixture();
    try {
      const service = createCoinCommerceProductionSubscriptionFulfillment({
        controlStore: fixture.controlStore,
        runtimeCore: {
          ...fixture.runtimeCore,
          getTenant() {
            throw new Error("private runtime dependency detail");
          }
        },
        accountActivationReader: ACTIVATED_ACCOUNT_READER,
        nowFn: () => new Date(NOW)
      });
      assert.throws(
        () => service.fulfillmentHandler.execute(productionInput(fixture)),
        (error) => (
          isCoinCommerceFulfillmentRetryableError(error)
          && !isCoinCommerceFulfillmentReconciliationError(error)
          && !String(error).includes("dependency detail")
        )
      );
      assert.equal(
        fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
        CURRENT_VALID_UNTIL
      );
    } finally {
      fixture.close();
    }
  });

  await t.test("unknown control dependency fault is retryable", () => {
    const fixture = createFixture();
    try {
      const service = createCoinCommerceProductionSubscriptionFulfillment({
        controlStore: {
          ...fixture.controlStore,
          getAccount() {
            throw new Error("private control dependency detail");
          }
        },
        runtimeCore: fixture.runtimeCore,
        accountActivationReader: ACTIVATED_ACCOUNT_READER,
        nowFn: () => new Date(NOW)
      });
      assert.throws(
        () => service.fulfillmentHandler.execute(productionInput(fixture)),
        (error) => (
          isCoinCommerceFulfillmentRetryableError(error)
          && !String(error).includes("dependency detail")
        )
      );
    } finally {
      fixture.close();
    }
  });

  for (const [name, options] of [
    ["ambiguous stable binding", { duplicatePortalRequest: true }],
    ["revoked subscription artifact", { artifactStatus: "revoked" }]
  ]) {
    await t.test(name, () => {
      const fixture = createFixture(options);
      try {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });
        assert.throws(
          () => service.fulfillmentHandler.execute(productionInput(fixture)),
          (error) => (
            isCoinCommerceFulfillmentReconciliationError(error)
            && !isCoinCommerceFulfillmentRetryableError(error)
          )
        );
        assert.equal(
          fixture.controlStore.getEntitlement(
            fixture.entitlementRef
          ).validUntil,
          CURRENT_VALID_UNTIL
        );
      } finally {
        fixture.close();
      }
    });
  }

  await t.test("missing runtime tenant is reconciliation-required", () => {
    const fixture = createFixture();
    try {
      const runtimeCore = {
        ...fixture.runtimeCore,
        getTenant() {
          const error = new Error("private missing tenant detail");
          error.code = "not_found";
          throw error;
        }
      };
      const service = createCoinCommerceProductionSubscriptionFulfillment({
        controlStore: fixture.controlStore,
        runtimeCore,
        accountActivationReader: ACTIVATED_ACCOUNT_READER,
        nowFn: () => new Date(NOW)
      });
      assert.throws(
        () => service.fulfillmentHandler.execute(productionInput(fixture)),
        (error) => (
          isCoinCommerceFulfillmentReconciliationError(error)
          && !String(error).includes("missing tenant detail")
        )
      );
    } finally {
      fixture.close();
    }
  });
});

test("first production fulfillment updates the existing subscription binding without replacing its identifiers", () => {
  const fixture = createFixture();
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const beforeRequest = fixture.controlStore.getPortalAccessRequest(fixture.requestRef);
    const beforeBinding = fixture.controlStore.findUsageBindingByTenantRef(
      fixture.issuedTenantRef
    );

    const result = service.fulfillmentHandler.execute(productionInput(fixture));

    assert.deepEqual(Object.keys(result).sort(), ["effectRef", "status"]);
    assert.equal(result.status, "delivered");
    assert.match(result.effectRef, /^effect_coin_commerce_[a-f0-9]{64}$/);

    const entitlement = fixture.controlStore.getEntitlement(fixture.entitlementRef);
    assert.deepEqual({
      id: entitlement.id,
      accountId: entitlement.accountId,
      plan: entitlement.plan,
      validFrom: entitlement.validFrom,
      validUntil: entitlement.validUntil,
      maxArtifacts: entitlement.maxArtifacts,
      maxDevices: entitlement.maxDevices,
      trafficLimitBytes: entitlement.trafficLimitBytes
    }, {
      id: fixture.entitlementRef,
      accountId: fixture.accountId,
      plan: "offerv_plan_30d_50gb_monthly_v1",
      validFrom: NOW,
      validUntil: "2026-10-01T00:00:00.000Z",
      maxArtifacts: 1,
      maxDevices: 2,
      trafficLimitBytes: 50 * GIB
    });

    const request = fixture.controlStore.getPortalAccessRequest(fixture.requestRef);
    assert.deepEqual({
      id: request.id,
      plan: request.plan,
      durationDays: request.durationDays,
      expiresAt: request.expiresAt,
      validUntil: request.validUntil,
      entitlementRef: request.entitlementRef,
      accessGrantRef: request.accessGrantRef,
      tenantId: request.tenantId,
      artifactId: request.artifactId,
      edgeChannelRef: request.edgeChannelRef,
      edgeCredentialRef: request.edgeCredentialRef,
      edgeMaterialDigest: request.edgeMaterialDigest
    }, {
      id: beforeRequest.id,
      plan: "monthly",
      durationDays: 30,
      expiresAt: "2026-10-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:00:00.000Z",
      entitlementRef: beforeRequest.entitlementRef,
      accessGrantRef: beforeRequest.accessGrantRef,
      tenantId: beforeRequest.tenantId,
      artifactId: beforeRequest.artifactId,
      edgeChannelRef: beforeRequest.edgeChannelRef,
      edgeCredentialRef: beforeRequest.edgeCredentialRef,
      edgeMaterialDigest: beforeRequest.edgeMaterialDigest
    });

    const binding = fixture.controlStore.findUsageBindingByTenantRef(
      fixture.issuedTenantRef
    );
    assert.deepEqual({
      linkId: binding.linkId,
      requestId: binding.requestId,
      accountId: binding.accountId,
      entitlementId: binding.entitlementId,
      tenantRef: binding.tenantRef,
      artifactRef: binding.artifactRef,
      plan: binding.plan,
      validUntil: binding.validUntil,
      trafficLimitBytes: binding.trafficLimitBytes
    }, {
      linkId: beforeBinding.linkId,
      requestId: beforeBinding.requestId,
      accountId: beforeBinding.accountId,
      entitlementId: beforeBinding.entitlementId,
      tenantRef: beforeBinding.tenantRef,
      artifactRef: beforeBinding.artifactRef,
      plan: "offerv_plan_30d_50gb_monthly_v1",
      validUntil: "2026-10-01T00:00:00.000Z",
      trafficLimitBytes: 50 * GIB
    });

    assert.deepEqual({
      id: fixture.runtimeCore.getTenant(fixture.tenantId).id,
      expiresAt: fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt
    }, {
      id: fixture.tenantId,
      expiresAt: "2026-10-01T00:00:00.000Z"
    });
    assert.equal(
      fixture.runtimeCore.listSubscriptionArtifacts(fixture.tenantId)[0].id,
      fixture.artifactId
    );

    const audit = fixture.controlStore.getAuditEvent(result.effectRef);
    assert.equal(audit.id, result.effectRef);
    assert.equal(audit.entityRef, fixture.entitlementRef);
    assert.deepEqual(audit.metadata, {
      version: 1,
      commandRef: "coincmd_fulfillment_001",
      orderRef: "coinord_fulfillment_001",
      accountId: fixture.accountId,
      requestRef: fixture.requestRef,
      entitlementRef: fixture.entitlementRef,
      issuedLinkRef: fixture.issuedLinkRef,
      tenantRef: fixture.issuedTenantRef,
      artifactRef: fixture.issuedArtifactRef,
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      portalPlan: "monthly",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficLimitBytes: 50 * GIB,
      validFrom: NOW,
      previousValidUntil: CURRENT_VALID_UNTIL,
      targetValidUntil: "2026-10-01T00:00:00.000Z"
    });
  } finally {
    fixture.close();
  }
});

test("a control-committed fulfillment recovers after both SQLite stores reopen without extending twice", () => {
  const fixture = createFixture();
  try {
    const runtimeCore = {
      ...fixture.runtimeCore,
      renewTenant() {
        throw new Error("synthetic runtime database detail");
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const input = productionInput(fixture);

    assert.throws(
      () => service.fulfillmentHandler.execute(input),
      (error) => {
        assert.equal(isCoinCommerceFulfillmentRetryableError(error), true);
        assert.equal(String(error).includes("database detail"), false);
        return true;
      }
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      CURRENT_VALID_UNTIL
    );

    fixture.reopen();
    const replayService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date("2026-07-31T00:00:00.000Z")
    });
    const replay = replayService.fulfillmentHandler.execute(input);
    const repeated = replayService.fulfillmentHandler.execute(input);

    assert.deepEqual(replay, repeated);
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      "2026-10-01T00:00:00.000Z"
    );
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId)
        .auditEvents.filter((event) =>
          event.action === "subscription_fulfillment_applied"
        ).length,
      1
    );
  } finally {
    fixture.close();
  }
});

test("a false-success runtime renewal remains retryable until the stored tenant reaches the control target", () => {
  const fixture = createFixture();
  try {
    let persistRenewal = false;
    const runtimeCore = {
      ...fixture.runtimeCore,
      renewTenant(id, input) {
        if (persistRenewal) {
          return fixture.runtimeCore.renewTenant(id, input);
        }
        return {
          ...fixture.runtimeCore.getTenant(id),
          status: "active",
          expiresAt: input.expiresAt
        };
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const input = productionInput(fixture);

    assert.throws(
      () => service.fulfillmentHandler.execute(input),
      (error) => isCoinCommerceFulfillmentRetryableError(error)
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      CURRENT_VALID_UNTIL
    );

    persistRenewal = true;
    const replay = service.fulfillmentHandler.execute(input);
    assert.equal(replay.status, "delivered");
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      "2026-10-01T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("replaying an older command accepts a safely stored runtime expiry beyond its control target", () => {
  const fixture = createFixture();
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const input = productionInput(fixture);
    const delivered = service.fulfillmentHandler.execute(input);
    const laterExpiry = "2026-11-01T00:00:00.000Z";
    fixture.runtimeCore.renewTenant(fixture.tenantId, {
      expiresAt: laterExpiry
    });

    assert.deepEqual(service.fulfillmentHandler.execute(input), delivered);
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      laterExpiry
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("every production catalog delivery writes its product-specific plan and monthly quota", async (t) => {
  const cases = [
    {
      offer: COIN_COMMERCE_PRODUCTION_OFFERS[0],
      plan: "offerv_plan_30d_50gb_monthly_v1",
      portalPlan: "monthly",
      durationDays: 30,
      trafficLimitBytes: 50 * GIB,
      targetValidUntil: "2026-10-01T00:00:00.000Z"
    },
    {
      offer: COIN_COMMERCE_PRODUCTION_OFFERS[1],
      plan: "offerv_plan_30d_100gb_monthly_v1",
      portalPlan: "monthly",
      durationDays: 30,
      trafficLimitBytes: 100 * GIB,
      targetValidUntil: "2026-10-01T00:00:00.000Z"
    },
    {
      offer: COIN_COMMERCE_PRODUCTION_OFFERS[2],
      plan: "offerv_plan_365d_200gb_monthly_v1",
      portalPlan: "yearly",
      durationDays: 365,
      trafficLimitBytes: 200 * GIB,
      targetValidUntil: "2027-09-01T00:00:00.000Z"
    }
  ];

  for (const expected of cases) {
    await t.test(expected.plan, () => {
      const fixture = createFixture();
      try {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });
        service.fulfillmentHandler.execute(
          productionInput(fixture, expected.offer)
        );

        const entitlement = fixture.controlStore.getEntitlement(
          fixture.entitlementRef
        );
        const request = fixture.controlStore.getPortalAccessRequest(
          fixture.requestRef
        );
        assert.deepEqual({
          plan: entitlement.plan,
          validFrom: entitlement.validFrom,
          validUntil: entitlement.validUntil,
          trafficLimitBytes: entitlement.trafficLimitBytes,
          portalPlan: request.plan,
          durationDays: request.durationDays,
          requestValidUntil: request.validUntil,
          tenantValidUntil: fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt
        }, {
          plan: expected.plan,
          validFrom: NOW,
          validUntil: expected.targetValidUntil,
          trafficLimitBytes: expected.trafficLimitBytes,
          portalPlan: expected.portalPlan,
          durationDays: expected.durationDays,
          requestValidUntil: expected.targetValidUntil,
          tenantValidUntil: expected.targetValidUntil
        });
      } finally {
        fixture.close();
      }
    });
  }
});

test("same-product renewal keeps validFrom while an active product switch is blocked without mutation", () => {
  const fixture = createFixture();
  try {
    let currentNow = NOW;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(currentNow)
    });
    service.fulfillmentHandler.execute(productionInput(fixture));

    currentNow = "2026-08-01T00:00:00.000Z";
    service.fulfillmentHandler.execute(productionInput(
      fixture,
      COIN_COMMERCE_PRODUCTION_OFFERS[0],
      {
        commandRef: "coincmd_fulfillment_002",
        orderRef: "coinord_fulfillment_002"
      }
    ));
    assert.deepEqual({
      validFrom: fixture.controlStore.getEntitlement(fixture.entitlementRef).validFrom,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil
    }, {
      validFrom: NOW,
      validUntil: "2026-10-31T00:00:00.000Z"
    });

    currentNow = "2026-08-02T00:00:00.000Z";
    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(
        fixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[1],
        {
          commandRef: "coincmd_fulfillment_003",
          orderRef: "coinord_fulfillment_003"
        }
      )),
      (error) => (
        error.code === "coin_commerce_fulfillment_reconciliation_required"
        && isCoinCommerceFulfillmentReconciliationError(error)
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validFrom: fixture.controlStore.getEntitlement(fixture.entitlementRef).validFrom,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      trafficLimitBytes: fixture.controlStore.getEntitlement(
        fixture.entitlementRef
      ).trafficLimitBytes
    }, {
      plan: "offerv_plan_30d_50gb_monthly_v1",
      validFrom: NOW,
      validUntil: "2026-10-31T00:00:00.000Z",
      trafficLimitBytes: 50 * GIB
    });
  } finally {
    fixture.close();
  }
});

test("an older command replay follows the fulfillment chain despite wall-clock rollback", () => {
  const fixture = createFixture({ legacyExpiredPortalRequest: true });
  try {
    let currentNow = NOW;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(currentNow)
    });
    const firstInput = productionInput(fixture);
    const first = service.fulfillmentHandler.execute(firstInput);
    currentNow = "2026-07-29T00:00:00.000Z";
    const later = service.fulfillmentHandler.execute(productionInput(
      fixture,
      COIN_COMMERCE_PRODUCTION_OFFERS[0],
      {
        commandRef: "coincmd_fulfillment_later",
        orderRef: "coinord_fulfillment_later"
      }
    ));
    assert.notEqual(later.effectRef, first.effectRef);
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-31T00:00:00.000Z"
    );

    const replay = service.fulfillmentHandler.execute(firstInput);

    assert.deepEqual(replay, first);
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-31T00:00:00.000Z"
    );
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      "2026-10-31T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("an older command replay follows a later cross-product fulfillment", () => {
  const fixture = createFixture();
  try {
    let currentNow = NOW;
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(currentNow)
    });
    const firstInput = productionInput(fixture);
    const first = service.fulfillmentHandler.execute(firstInput);

    currentNow = "2026-10-02T00:00:00.000Z";
    fixture.setNow(currentNow);
    const later = service.fulfillmentHandler.execute(productionInput(
      fixture,
      COIN_COMMERCE_PRODUCTION_OFFERS[1],
      {
        commandRef: "coincmd_fulfillment_cross_product_later",
        orderRef: "coinord_fulfillment_cross_product_later"
      }
    ));
    assert.notEqual(later.effectRef, first.effectRef);
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validFrom: fixture.controlStore.getEntitlement(fixture.entitlementRef).validFrom,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil
    }, {
      plan: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef,
      validFrom: currentNow,
      validUntil: "2026-11-01T00:00:00.000Z"
    });

    currentNow = "2026-10-03T00:00:00.000Z";
    fixture.setNow(currentNow);
    const replay = service.fulfillmentHandler.execute(firstInput);

    assert.deepEqual(replay, first);
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validFrom: fixture.controlStore.getEntitlement(fixture.entitlementRef).validFrom,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      runtimeValidUntil: fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt
    }, {
      plan: COIN_COMMERCE_PRODUCTION_OFFERS[1].offerVersionRef,
      validFrom: "2026-10-02T00:00:00.000Z",
      validUntil: "2026-11-01T00:00:00.000Z",
      runtimeValidUntil: "2026-11-01T00:00:00.000Z"
    });
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId)
        .auditEvents.filter((event) =>
          event.action === "subscription_fulfillment_applied"
        ).length,
      2
    );
  } finally {
    fixture.close();
  }
});

test("a phantom deterministic effect cannot turn replay into a new active product switch", () => {
  const fixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    const controlStore = {
      ...fixture.controlStore,
      getAuditEvent(effectRef) {
        return { id: effectRef };
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(
        fixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[1],
        {
          commandRef: "coincmd_fulfillment_phantom_effect",
          orderRef: "coinord_fulfillment_phantom_effect"
        }
      )),
      (error) => (
        isCoinCommerceFulfillmentReconciliationError(error)
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      runtimeValidUntil: fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt
    }, {
      plan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef,
      validUntil: CURRENT_VALID_UNTIL,
      runtimeValidUntil: CURRENT_VALID_UNTIL
    });
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId)
        .auditEvents.filter((event) =>
          event.action === "subscription_fulfillment_applied"
        ).length,
      0
    );
  } finally {
    fixture.close();
  }
});

test("a mismatched deterministic effect cannot bypass the active product switch guard", () => {
  const fixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    const commandRef = "coincmd_fulfillment_mismatched_effect";
    fixture.controlStore.recordAuditEvent({
      id: fulfillmentEffectRef(commandRef),
      entityType: "unrelated_control_event",
      entityRef: fixture.entitlementRef,
      action: "unrelated_action",
      actorRef: "unrelated_actor",
      createdAt: NOW,
      metadata: { commandRef }
    });
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(
        fixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[1],
        {
          commandRef,
          orderRef: "coinord_fulfillment_mismatched_effect"
        }
      )),
      (error) => (
        isCoinCommerceFulfillmentReconciliationError(error)
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    assert.deepEqual({
      plan: fixture.controlStore.getEntitlement(fixture.entitlementRef).plan,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      runtimeValidUntil: fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt
    }, {
      plan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef,
      validUntil: CURRENT_VALID_UNTIL,
      runtimeValidUntil: CURRENT_VALID_UNTIL
    });
  } finally {
    fixture.close();
  }
});

test("fulfillment replay fails closed on a branched, broken, or forged effect chain", async (t) => {
  function createTwoEffects(fixture) {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const firstInput = productionInput(fixture);
    const first = service.fulfillmentHandler.execute(firstInput);
    const later = service.fulfillmentHandler.execute(productionInput(
      fixture,
      COIN_COMMERCE_PRODUCTION_OFFERS[0],
      {
        commandRef: "coincmd_fulfillment_chain_later",
        orderRef: "coinord_fulfillment_chain_later"
      }
    ));
    return { service, firstInput, first, later };
  }

  function branchMetadata(fixture, commandRef) {
    const firstAudit = fixture.controlStore.getAuditEvent(
      fulfillmentEffectRef("coincmd_fulfillment_001")
    );
    return {
      ...firstAudit.metadata,
      commandRef,
      orderRef: `coinord_${commandRef}`,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[2].offerVersionRef,
      portalPlan: "yearly",
      durationDays: 365,
      monthlyTrafficGb: 200,
      trafficLimitBytes: 200 * GIB,
      validFrom: "2026-07-29T00:00:00.000Z",
      previousValidUntil: firstAudit.metadata.targetValidUntil,
      targetValidUntil: "2027-10-01T00:00:00.000Z"
    };
  }

  await t.test("branch", () => {
    const fixture = createFixture();
    try {
      const { service, firstInput } = createTwoEffects(fixture);
      const commandRef = "coincmd_fulfillment_chain_branch";
      fixture.controlStore.recordAuditEvent({
        id: fulfillmentEffectRef(commandRef),
        entityType: "coin_commerce_subscription_fulfillment",
        entityRef: fixture.entitlementRef,
        action: "subscription_fulfillment_applied",
        actorRef: "coin_commerce_fulfillment",
        createdAt: "2026-07-29T00:00:00.000Z",
        metadata: branchMetadata(fixture, commandRef)
      });

      assert.throws(
        () => service.fulfillmentHandler.execute(firstInput),
        (error) => isCoinCommerceFulfillmentReconciliationError(error)
      );
    } finally {
      fixture.close();
    }
  });

  await t.test("broken link", () => {
    const fixture = createFixture();
    try {
      const { service, firstInput, later } = createTwoEffects(fixture);
      const directDb = new Database(fixture.controlDbPath);
      try {
        directDb.prepare("delete from platform_audit_events where id = ?")
          .run(later.effectRef);
      } finally {
        directDb.close();
      }

      assert.throws(
        () => service.fulfillmentHandler.execute(firstInput),
        (error) => isCoinCommerceFulfillmentReconciliationError(error)
      );
    } finally {
      fixture.close();
    }
  });

  await t.test("forged effect id", () => {
    const fixture = createFixture();
    try {
      const { service, firstInput } = createTwoEffects(fixture);
      const commandRef = "coincmd_fulfillment_chain_forged";
      fixture.controlStore.recordAuditEvent({
        id: "effect_coin_commerce_not_derived_from_command",
        entityType: "coin_commerce_subscription_fulfillment",
        entityRef: fixture.entitlementRef,
        action: "subscription_fulfillment_applied",
        actorRef: "coin_commerce_fulfillment",
        createdAt: "2026-07-29T00:00:00.000Z",
        metadata: branchMetadata(fixture, commandRef)
      });

      assert.throws(
        () => service.fulfillmentHandler.execute(firstInput),
        (error) => isCoinCommerceFulfillmentReconciliationError(error)
      );
    } finally {
      fixture.close();
    }
  });

  await t.test("zero-length validity interval", () => {
    const fixture = createFixture();
    try {
      const { service, firstInput, later } = createTwoEffects(fixture);
      const laterAudit = fixture.controlStore.getAuditEvent(later.effectRef);
      const commandRef = "coincmd_fulfillment_chain_zero_length";
      const targetValidUntil = "2026-11-30T00:00:00.000Z";
      fixture.controlStore.recordAuditEvent({
        id: fulfillmentEffectRef(commandRef),
        entityType: "coin_commerce_subscription_fulfillment",
        entityRef: fixture.entitlementRef,
        action: "subscription_fulfillment_applied",
        actorRef: "coin_commerce_fulfillment",
        createdAt: targetValidUntil,
        metadata: {
          ...laterAudit.metadata,
          commandRef,
          orderRef: "coinord_fulfillment_chain_zero_length",
          validFrom: targetValidUntil,
          previousValidUntil: laterAudit.metadata.targetValidUntil,
          targetValidUntil
        }
      });

      assert.throws(
        () => service.fulfillmentHandler.execute(firstInput),
        (error) => isCoinCommerceFulfillmentReconciliationError(error)
      );
    } finally {
      fixture.close();
    }
  });
});

test("the control transaction rejects Portal expiry drift introduced after preflight", () => {
  const fixture = createFixture();
  try {
    let injected = false;
    const controlStore = {
      ...fixture.controlStore,
      applyCoinCommerceSubscriptionFulfillment(input) {
        if (!injected) {
          injected = true;
          const request = fixture.controlStore.getPortalAccessRequest(fixture.requestRef);
          delete request.edgeCredentials;
          fixture.controlStore.upsertPortalAccessRequest({
            ...request,
            expiresAt: "2026-09-02T00:00:00.000Z",
            validUntil: "2026-09-02T00:00:00.000Z"
          });
        }
        return fixture.controlStore.applyCoinCommerceSubscriptionFulfillment(input);
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      CURRENT_VALID_UNTIL
    );
    assert.equal(
      fixture.controlStore.getPortalAccessRequest(fixture.requestRef).validUntil,
      "2026-09-02T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("same-product fulfillment rejects an impossible validFrom after validUntil", () => {
  const fixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    const directDb = new Database(fixture.controlDbPath);
    try {
      directDb.prepare(`
        update platform_entitlements
        set valid_from = ?
        where id = ?
      `).run("2027-01-01T00:00:00.000Z", fixture.entitlementRef);
    } finally {
      directDb.close();
    }
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      CURRENT_VALID_UNTIL
    );
  } finally {
    fixture.close();
  }
});

test("a zero-length entitlement does not hide the storefront while fulfillment rejects it", () => {
  const fixture = createFixture({
    entitlementPlan: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
  });
  try {
    const directDb = new Database(fixture.controlDbPath);
    try {
      directDb.prepare(`
        update platform_entitlements
        set valid_from = valid_until
        where id = ?
      `).run(fixture.entitlementRef);
    } finally {
      directDb.close();
    }
    assert.throws(
      () => fixture.controlStore.applyCoinCommerceSubscriptionFulfillment({
        commandRef: "coincmd_fulfillment_zero_length_direct",
        orderRef: "coinord_fulfillment_zero_length_direct",
        accountId: fixture.accountId,
        requestRef: fixture.requestRef,
        entitlementRef: fixture.entitlementRef,
        issuedLinkRef: fixture.issuedLinkRef,
        tenantRef: fixture.issuedTenantRef,
        artifactRef: fixture.issuedArtifactRef,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef,
        portalPlan: "monthly",
        durationDays: 30,
        monthlyTrafficGb: 50,
        requireExistingEffect: false,
        recoveryOnly: false,
        now: NOW
      }),
      (error) => error.code === "coin_commerce_subscription_fulfillment_drift"
    );
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });

    const eligibilityInput = {
      accountId: fixture.accountId,
      offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef
    };
    assert.equal(service.storefrontEligibilityReader(eligibilityInput), true);
    assert.equal(service.purchaseEligibilityReader(eligibilityInput), false);
    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(fixture)),
      (error) => isCoinCommerceFulfillmentReconciliationError(error)
    );
    assert.deepEqual({
      validFrom: fixture.controlStore.getEntitlement(fixture.entitlementRef).validFrom,
      validUntil: fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil
    }, {
      validFrom: CURRENT_VALID_UNTIL,
      validUntil: CURRENT_VALID_UNTIL
    });
    assert.equal(
      fixture.controlStore.getPortalAccessRequest(fixture.requestRef).validUntil,
      CURRENT_VALID_UNTIL
    );
    assert.equal(
      fixture.runtimeCore.getTenant(fixture.tenantId).expiresAt,
      CURRENT_VALID_UNTIL
    );
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId)
        .auditEvents.filter((event) =>
          event.action === "subscription_fulfillment_applied"
        ).length,
      0
    );
  } finally {
    fixture.close();
  }
});

test("the control store rejects fulfillment durations outside the safe Date range", () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () => fixture.controlStore.applyCoinCommerceSubscriptionFulfillment({
        commandRef: "coincmd_fulfillment_date_overflow",
        orderRef: "coinord_fulfillment_date_overflow",
        accountId: fixture.accountId,
        requestRef: fixture.requestRef,
        entitlementRef: fixture.entitlementRef,
        issuedLinkRef: fixture.issuedLinkRef,
        tenantRef: fixture.issuedTenantRef,
        artifactRef: fixture.issuedArtifactRef,
        offerVersionRef: COIN_COMMERCE_PRODUCTION_OFFERS[0].offerVersionRef,
        portalPlan: "monthly",
        durationDays: Number.MAX_SAFE_INTEGER,
        monthlyTrafficGb: 50,
        requireExistingEffect: false,
        recoveryOnly: false,
        now: NOW
      }),
      (error) => error.code === "validation_error"
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      CURRENT_VALID_UNTIL
    );
  } finally {
    fixture.close();
  }
});

test("the immutable fulfillment effect survives both SQLite stores reopening", () => {
  const fixture = createFixture();
  try {
    const input = productionInput(fixture);
    const firstService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const first = firstService.fulfillmentHandler.execute(input);

    fixture.reopen();
    const reopenedService = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date("2026-07-31T00:00:00.000Z")
    });
    const replay = reopenedService.fulfillmentHandler.execute(input);
    const usageBinding = fixture.controlStore.findUsageBindingByTenantRef(
      fixture.issuedTenantRef
    );

    assert.deepEqual(replay, first);
    assert.equal(usageBinding.linkId, fixture.issuedLinkRef);
    assert.equal(usageBinding.requestId, fixture.requestRef);
    assert.equal(usageBinding.entitlementId, fixture.entitlementRef);
    assert.equal(usageBinding.trafficLimitBytes, 50 * GIB);
    assert.equal(usageBinding.validUntil, "2026-10-01T00:00:00.000Z");
    assert.equal(
      fixture.controlStore.getAccountControlSummary(fixture.accountId)
        .auditEvents.filter((event) =>
          event.action === "subscription_fulfillment_applied"
        ).length,
      1
    );
  } finally {
    fixture.close();
  }
});

test("unknown delivery and replay drift stay terminal without being branded retryable", () => {
  const fixture = createFixture();
  try {
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      nowFn: () => new Date(NOW)
    });
    const invalidDelivery = {
      ...COIN_COMMERCE_PRODUCTION_OFFERS[0].delivery,
      discountBasisPoints: 1
    };
    assert.throws(
      () => service.fulfillmentHandler.execute(productionInput(
        fixture,
        COIN_COMMERCE_PRODUCTION_OFFERS[0],
        { delivery: invalidDelivery }
      )),
      (error) => (
        error.code === "coin_commerce_fulfillment_invalid_delivery"
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      CURRENT_VALID_UNTIL
    );

    const input = productionInput(fixture);
    service.fulfillmentHandler.execute(input);
    fixture.controlStore.updateEntitlementTrafficLimit(fixture.entitlementRef, {
      trafficLimitBytes: 49 * GIB,
      updatedAt: "2026-07-30T00:01:00.000Z"
    });
    assert.throws(
      () => service.fulfillmentHandler.execute(input),
      (error) => (
        isCoinCommerceFulfillmentReconciliationError(error)
        && !isCoinCommerceFulfillmentRetryableError(error)
      )
    );
    assert.equal(
      fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
      "2026-10-01T00:00:00.000Z"
    );
  } finally {
    fixture.close();
  }
});

test("control SQLite BUSY and LOCKED failures become redacted branded retries before any effect is written", async (t) => {
  for (const code of ["SQLITE_BUSY_RECOVERY", "SQLITE_LOCKED_SHAREDCACHE"]) {
    await t.test(code, () => {
      const fixture = createFixture();
      try {
        const controlStore = {
          ...fixture.controlStore,
          applyCoinCommerceSubscriptionFulfillment() {
            const error = new Error(`private control database detail for ${code}`);
            error.code = code;
            throw error;
          }
        };
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          nowFn: () => new Date(NOW)
        });

        assert.throws(
          () => service.fulfillmentHandler.execute(productionInput(fixture)),
          (error) => (
            isCoinCommerceFulfillmentRetryableError(error)
            && !String(error).includes("private control")
          )
        );
        assert.equal(
          fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
          CURRENT_VALID_UNTIL
        );
        assert.equal(
          fixture.controlStore.getAccountControlSummary(fixture.accountId)
            .auditEvents.filter((event) =>
              event.action === "subscription_fulfillment_applied"
            ).length,
          0
        );
      } finally {
        fixture.close();
      }
    });
  }
});

test("a retired v1 command remains fulfillable while only v2 is published", () => {
  const fixture = createFixture();
  try {
    const v1 = COIN_COMMERCE_PRODUCTION_OFFERS[0];
    const v2 = {
      ...v1,
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v2",
      version: 2,
      title: {
        zh: "50 GB 月度套餐 v2",
        en: "50 GB monthly plan v2"
      }
    };
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      publishedCatalog: [v2],
      fulfillmentCatalog: [v1, v2],
      nowFn: () => new Date(NOW)
    });

    assert.equal(service.purchaseEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: v1.offerVersionRef
    }), false);
    assert.equal(service.purchaseEligibilityReader({
      accountId: fixture.accountId,
      offerVersionRef: v2.offerVersionRef
    }), true);

    const result = service.fulfillmentHandler.execute({
      ...productionInput(fixture, v1),
      offerVersionRef: v1.offerVersionRef
    });

    assert.deepEqual(result, {
      status: "delivered",
      effectRef: fulfillmentEffectRef("coincmd_fulfillment_001")
    });
    assert.equal(
      fixture.controlStore.getAuditEvent(result.effectRef)
        .metadata.offerVersionRef,
      v1.offerVersionRef
    );
  } finally {
    fixture.close();
  }
});

test("a real captured v1 Store command is delivered after v2 replaces it in the published catalog", async () => {
  const fixture = createFixture();
  let commerceStore;
  let coordinator;
  try {
    applyCoinWalletMigrations({
      dbPath: fixture.controlDbPath,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    applyCoinCommerceMigrations({
      dbPath: fixture.controlDbPath,
      expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(NOW)
    });
    commerceStore = createSqliteCoinCommerceStore({
      dbPath: fixture.controlDbPath,
      cancelWindowMs: 0
    });
    const v1 = COIN_COMMERCE_PRODUCTION_OFFERS[0];
    const v2 = {
      ...v1,
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v2",
      version: 2,
      baseCoinUnits: 21
    };
    commerceStore.walletStore.creditCoins({
      accountId: fixture.accountId,
      coinType: "paid_coins",
      amountUnits: 20,
      availability: "available",
      sourceType: "synthetic_seed",
      sourceRef: "source_catalog_history",
      sourceDigest: "a".repeat(64),
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      operation: {
        actorScope: "system:catalog-history-test",
        idempotencyKey: "credit_catalog_history",
        actorType: "system",
        actorRef: "catalog_history_test"
      }
    });
    commerceStore.bootstrapPublishedOffers([v1]);
    const quote = commerceStore.createCheckoutQuote({
      accountId: fixture.accountId,
      offerRef: v1.offerRef
    });
    const held = commerceStore.confirmOrder({
      accountId: fixture.accountId,
      quoteRef: quote.quoteRef,
      operation: {
        actorScope: `portal:${fixture.accountId}`,
        idempotencyKey: "confirm_catalog_history",
        actorType: "portal_user",
        actorRef: fixture.accountId
      }
    });
    const [claimed] = commerceStore.claimDueCaptures({ limit: 1 });
    assert.equal(claimed.orderRef, held.orderRef);
    commerceStore.captureClaimedOrder({ orderRef: held.orderRef });
    assert.equal(
      commerceStore.getOrder({
        accountId: fixture.accountId,
        orderRef: held.orderRef
      }).fulfillment.status,
      "pending"
    );

    commerceStore.retireOfferVersion({
      offerRef: v1.offerRef,
      offerVersionRef: v1.offerVersionRef
    });
    commerceStore.publishOfferVersion(v2);
    const service = createCoinCommerceProductionSubscriptionFulfillment({
      controlStore: fixture.controlStore,
      runtimeCore: fixture.runtimeCore,
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      publishedCatalog: [v2],
      fulfillmentCatalog: [v1, v2],
      nowFn: () => new Date(NOW)
    });
    coordinator = createCoinCommerceCoordinator({
      store: commerceStore,
      fulfillmentHandler: service.fulfillmentHandler,
      nowFn: () => new Date(NOW)
    });

    await coordinator.runOnce();

    const delivered = commerceStore.getOrder({
      accountId: fixture.accountId,
      orderRef: held.orderRef
    });
    assert.equal(delivered.offer.offerVersionRef, v1.offerVersionRef);
    assert.equal(delivered.fulfillment.status, "delivered");
    const [fulfillmentEvent] = fixture.controlStore
      .getAccountControlSummary(fixture.accountId)
      .auditEvents
      .filter((event) => event.action === "subscription_fulfillment_applied");
    assert.ok(fulfillmentEvent);
    assert.equal(
      fulfillmentEvent.metadata.offerVersionRef,
      v1.offerVersionRef
    );
  } finally {
    await coordinator?.stop();
    commerceStore?.close();
    fixture.close();
  }
});

test("every published Offer version must have an exact fulfillment-history snapshot", () => {
  const fixture = createFixture();
  try {
    const v1 = COIN_COMMERCE_PRODUCTION_OFFERS[0];
    const v2 = {
      ...v1,
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v2",
      version: 2,
      baseCoinUnits: 21
    };

    assert.throws(
      () => createCoinCommerceProductionSubscriptionFulfillment({
        controlStore: fixture.controlStore,
        runtimeCore: fixture.runtimeCore,
        accountActivationReader: ACTIVATED_ACCOUNT_READER,
        publishedCatalog: [v2],
        fulfillmentCatalog: [v1],
        nowFn: () => new Date(NOW)
      }),
      (error) => error?.code === "coin_commerce_fulfillment_catalog_invalid"
    );
  } finally {
    fixture.close();
  }
});

test("an unimplemented data pack cannot enter the published fulfillment catalog", () => {
  const dataPack = COIN_COMMERCE_DATA_PACK_CANDIDATES[0];
  assert.throws(
    () => createCoinCommerceProductionSubscriptionFulfillment({
      accountActivationReader: ACTIVATED_ACCOUNT_READER,
      publishedCatalog: [dataPack],
      fulfillmentCatalog: [dataPack]
    }),
    (error) => error?.code === "coin_commerce_fulfillment_catalog_invalid"
  );
});

test("offer version and delivery mismatches fail closed before subscription effects", async (t) => {
  const v1 = COIN_COMMERCE_PRODUCTION_OFFERS[0];
  const v2 = {
    ...v1,
    offerVersionRef: "offerv_plan_30d_50gb_monthly_v2",
    version: 2,
    title: {
      zh: "50 GB 月度套餐 v2",
      en: "50 GB monthly plan v2"
    }
  };
  for (const scenario of [
    {
      name: "delivery belongs to another immutable version",
      fulfillmentCatalog: [v1, v2, COIN_COMMERCE_PRODUCTION_OFFERS[1]],
      offerVersionRef: v1.offerVersionRef,
      delivery: COIN_COMMERCE_PRODUCTION_OFFERS[1].delivery
    },
    {
      name: "historical immutable version is absent",
      fulfillmentCatalog: [v2],
      offerVersionRef: v1.offerVersionRef,
      delivery: v1.delivery
    }
  ]) {
    await t.test(scenario.name, () => {
      const fixture = createFixture();
      try {
        const service = createCoinCommerceProductionSubscriptionFulfillment({
          controlStore: fixture.controlStore,
          runtimeCore: fixture.runtimeCore,
          accountActivationReader: ACTIVATED_ACCOUNT_READER,
          publishedCatalog: [v2],
          fulfillmentCatalog: scenario.fulfillmentCatalog,
          nowFn: () => new Date(NOW)
        });

        assert.throws(
          () => service.fulfillmentHandler.execute({
            ...productionInput(fixture, v1),
            offerVersionRef: scenario.offerVersionRef,
            delivery: { ...scenario.delivery }
          }),
          (error) => (
            error.code === "coin_commerce_fulfillment_invalid_delivery"
            && !isCoinCommerceFulfillmentRetryableError(error)
          )
        );
        assert.equal(
          fixture.controlStore.getEntitlement(fixture.entitlementRef).validUntil,
          CURRENT_VALID_UNTIL
        );
        assert.equal(
          fixture.controlStore.getAccountControlSummary(fixture.accountId)
            .auditEvents.filter((event) =>
              event.action === "subscription_fulfillment_applied"
            ).length,
          0
        );
      } finally {
        fixture.close();
      }
    });
  }
});
