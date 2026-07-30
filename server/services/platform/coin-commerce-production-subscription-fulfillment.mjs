import { createHash } from "node:crypto";
import {
  isDeepStrictEqual,
  types as utilTypes
} from "node:util";
import {
  COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS,
  COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
} from "./coin-commerce-production-catalog.mjs";
import {
  normalizeCoinCommerceOffer
} from "./coin-commerce-domain.mjs";
import {
  createCoinCommerceFulfillmentReconciliationError,
  createCoinCommerceFulfillmentRetryableError,
  isCoinCommerceFulfillmentReconciliationError,
  isCoinCommerceFulfillmentRetryableError
} from "./coin-commerce-fulfillment-retry.mjs";

const DELIVERY_FIELDS = Object.freeze([
  "kind",
  "durationDays",
  "monthlyTrafficGb",
  "trafficGb",
  "neverExpires",
  "discountBasisPoints"
]);
const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;

function safeIssuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 16)}`;
}

function hasText(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function safeErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value
      : "";
  } catch {
    return "";
  }
}

function isTemporaryDependencyError(error) {
  const code = safeErrorCode(error);
  return (
    code.startsWith("SQLITE_BUSY")
    || code.startsWith("SQLITE_LOCKED")
    || code === "subscription_runtime_temporary_unavailable"
  );
}

function isPermanentRuntimeBindingError(error) {
  return new Set([
    "not_found",
    "subscription_not_active",
    "subscription_renewal_not_converged"
  ]).has(safeErrorCode(error));
}

function safeFulfillmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString() === value ? value : null;
}

function expiryAtLeast(value, target) {
  const normalizedValue = canonicalTimestamp(value);
  const normalizedTarget = canonicalTimestamp(target);
  return (
    normalizedValue !== null
    && normalizedTarget !== null
    && normalizedValue >= normalizedTarget
  );
}

function exactPlainDataSnapshot(input, fields) {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || utilTypes.isProxy(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
      return null;
    }
    const snapshot = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return null;
      }
      snapshot[field] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotProductionCatalog(catalog) {
  try {
    if (
      !Array.isArray(catalog)
      || utilTypes.isProxy(catalog)
      || Object.getPrototypeOf(catalog) !== Array.prototype
    ) {
      return null;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(catalog, "length");
    if (
      !lengthDescriptor
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 1
      || Reflect.ownKeys(catalog).length !== lengthDescriptor.value + 1
    ) {
      return null;
    }
    const offers = [];
    const versionRefs = new Set();
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(catalog, String(index));
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return null;
      }
      const offer = normalizeCoinCommerceOffer(descriptor.value);
      if (versionRefs.has(offer.offerVersionRef)) return null;
      versionRefs.add(offer.offerVersionRef);
      offers.push(offer);
    }
    return Object.freeze(offers);
  } catch {
    return null;
  }
}

function exactProductionOfferVersion({
  offerVersionRef,
  delivery,
  catalog
}) {
  try {
    if (
      typeof offerVersionRef !== "string"
      || !COMMERCE_REFERENCE.test(offerVersionRef)
      || !delivery
      || typeof delivery !== "object"
      || Array.isArray(delivery)
      || utilTypes.isProxy(delivery)
      || Object.getPrototypeOf(delivery) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(delivery);
    if (
      keys.length !== DELIVERY_FIELDS.length
      || !DELIVERY_FIELDS.every((field) => keys.includes(field))
    ) {
      return null;
    }
    const values = {};
    for (const field of DELIVERY_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(delivery, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      values[field] = descriptor.value;
    }
    const matches = catalog.filter((offer) => (
      offer.offerVersionRef === offerVersionRef
      && DELIVERY_FIELDS.every((field) => offer.delivery[field] === values[field])
    ));
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}

function resolveEligibleSubscriptionBinding({ controlStore, runtimeCore, accountId }) {
  if (!hasText(accountId)) return null;
  const account = controlStore.getAccount(accountId);
  if (!account || account.status !== "active") return null;

  const accessRequests = controlStore
    .listPortalAccessRequests({ portalUserRef: accountId })
    .filter((request) => request.status === "delivered" || request.status === "issued");
  if (accessRequests.length !== 1) return null;
  const [accessRequest] = accessRequests;
  if (
    !hasText(accessRequest.entitlementRef)
    || !hasText(accessRequest.tenantId)
    || !hasText(accessRequest.artifactId)
  ) {
    return null;
  }

  const issuanceRequest = controlStore.getIssuanceRequest(accessRequest.id);
  const entitlement = controlStore.getEntitlement(accessRequest.entitlementRef);
  const entitlementValidFrom = canonicalTimestamp(entitlement?.validFrom);
  const entitlementValidUntil = canonicalTimestamp(entitlement?.validUntil);
  if (
    !issuanceRequest
    || issuanceRequest.status !== "issued"
    || issuanceRequest.accountId !== accountId
    || issuanceRequest.entitlementId !== accessRequest.entitlementRef
    || !entitlement
    || entitlement.status !== "active"
    || entitlement.accountId !== accountId
    || entitlementValidFrom === null
    || entitlementValidUntil === null
    || entitlementValidFrom >= entitlementValidUntil
    || accessRequest.expiresAt !== entitlement.validUntil
    || accessRequest.validUntil !== entitlement.validUntil
  ) {
    return null;
  }

  const bindings = controlStore
    .listIssuedSubscriptionBindings()
    .filter((binding) => binding.requestId === accessRequest.id);
  if (bindings.length !== 1) return null;
  const [binding] = bindings;
  if (
    binding.accountId !== accountId
    || binding.entitlementId !== accessRequest.entitlementRef
    || binding.tenantRef !== safeIssuedRef("tenant", accessRequest.tenantId)
    || binding.artifactRef !== safeIssuedRef("artifact", accessRequest.artifactId)
  ) {
    return null;
  }

  let tenant = null;
  let artifacts = [];
  let runtimeError = null;
  try {
    tenant = runtimeCore.getTenant(accessRequest.tenantId);
    artifacts = runtimeCore
      .listSubscriptionArtifacts(accessRequest.tenantId)
      .filter((artifact) => artifact.id === accessRequest.artifactId);
  } catch (error) {
    runtimeError = error;
  }
  const runtimeReady = (
    runtimeError === null
    && tenant
    && tenant.id === accessRequest.tenantId
    && (
      tenant.status === "active"
      || tenant.status === "expiring"
      || tenant.status === "expired"
    )
    && tenant.expiresAt === entitlement.validUntil
    && artifacts.length === 1
    && artifacts[0].tenantId === accessRequest.tenantId
    && artifacts[0].status === "active"
  );

  return {
    account,
    accessRequest,
    issuanceRequest,
    entitlement,
    binding,
    tenant,
    artifact: artifacts[0] || null,
    runtimeError,
    runtimeReady
  };
}

export function createCoinCommerceProductionSubscriptionFulfillment({
  controlStore,
  runtimeCore,
  accountActivationReader,
  publishedCatalog = COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS,
  fulfillmentCatalog =
    COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS,
  nowFn = () => new Date()
} = {}) {
  const publishedCatalogSnapshot = snapshotProductionCatalog(publishedCatalog);
  const fulfillmentCatalogSnapshot = snapshotProductionCatalog(
    fulfillmentCatalog
  );
  const publishedVersionsHaveHistory = (
    publishedCatalogSnapshot
    && fulfillmentCatalogSnapshot
    && publishedCatalogSnapshot.every((publishedOffer) => {
      const historicalOffer = fulfillmentCatalogSnapshot.find(
        (candidate) => (
          candidate.offerVersionRef === publishedOffer.offerVersionRef
        )
      );
      return (
        historicalOffer !== undefined
        && isDeepStrictEqual(historicalOffer, publishedOffer)
      );
    })
  );
  if (!publishedVersionsHaveHistory) {
    throw safeFulfillmentError(
      "coin_commerce_fulfillment_catalog_invalid",
      "Coin Commerce subscription fulfillment catalog is invalid"
    );
  }
  if (typeof accountActivationReader !== "function") {
    throw safeFulfillmentError(
      "coin_commerce_fulfillment_activation_reader_invalid",
      "Coin Commerce fulfillment activation reader is invalid"
    );
  }

  function isAccountActivated(accountId) {
    try {
      return accountActivationReader({ accountId }) === true;
    } catch {
      return false;
    }
  }

  function purchaseEligibilityReader(input = {}) {
    const snapshot = exactPlainDataSnapshot(input, [
      "accountId",
      "offerVersionRef"
    ]);
    if (!snapshot) return false;
    const { accountId, offerVersionRef } = snapshot;
    const requestedOffer = publishedCatalogSnapshot.find(
      (offer) => offer.offerVersionRef === offerVersionRef
    );
    if (!requestedOffer) return false;
    if (!isAccountActivated(accountId)) return false;
    try {
      const resolved = resolveEligibleSubscriptionBinding({
        controlStore,
        runtimeCore,
        accountId
      });
      if (resolved?.runtimeReady !== true) return false;
      const now = new Date(nowFn()).toISOString();
      const currentOffer = fulfillmentCatalogSnapshot.find(
        (offer) => offer.offerVersionRef === resolved.entitlement.plan
      );
      if (
        currentOffer
        && canonicalTimestamp(resolved.entitlement.validUntil) > now
      ) {
        return currentOffer.offerVersionRef === requestedOffer.offerVersionRef;
      }
      return true;
    } catch {
      return false;
    }
  }

  function execute(input = {}) {
    const command = exactPlainDataSnapshot(input, [
      "commandRef",
      "orderRef",
      "accountId",
      "offerVersionRef",
      "delivery"
    ]);
    if (!command) {
      throw safeFulfillmentError(
        "coin_commerce_fulfillment_invalid_input",
        "Coin Commerce subscription fulfillment input is invalid"
      );
    }
    const offer = exactProductionOfferVersion({
      offerVersionRef: command.offerVersionRef,
      delivery: command.delivery,
      catalog: fulfillmentCatalogSnapshot
    });
    if (!offer) {
      throw safeFulfillmentError(
        "coin_commerce_fulfillment_invalid_delivery",
        "Coin Commerce subscription fulfillment delivery is invalid"
      );
    }
    let resolved;
    try {
      resolved = resolveEligibleSubscriptionBinding({
        controlStore,
        runtimeCore,
        accountId: command.accountId
      });
    } catch (error) {
      throw createCoinCommerceFulfillmentRetryableError();
    }
    if (!resolved) {
      throw createCoinCommerceFulfillmentReconciliationError();
    }
    if (resolved.runtimeError) {
      if (isPermanentRuntimeBindingError(resolved.runtimeError)) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      throw createCoinCommerceFulfillmentRetryableError();
    }
    if (
      !resolved.tenant
      || !["active", "expiring", "expired"].includes(resolved.tenant.status)
      || !resolved.artifact
      || resolved.artifact.status !== "active"
    ) {
      throw createCoinCommerceFulfillmentReconciliationError();
    }

    let now;
    try {
      now = new Date(nowFn()).toISOString();
    } catch {
      throw safeFulfillmentError(
        "coin_commerce_fulfillment_unavailable",
        "Coin Commerce subscription fulfillment is unavailable"
      );
    }
    const currentOffer = fulfillmentCatalogSnapshot.find(
      (candidate) => (
        candidate.offerVersionRef === resolved.entitlement.plan
      )
    );
    const requireExistingEffect = Boolean(
      currentOffer
      && currentOffer.offerVersionRef !== offer.offerVersionRef
      && canonicalTimestamp(resolved.entitlement.validUntil) > now
    );
    const portalPlan = offer.delivery.durationDays === 365 ? "yearly" : "monthly";
    let effect;
    try {
      effect = controlStore.applyCoinCommerceSubscriptionFulfillment({
        commandRef: command.commandRef,
        orderRef: command.orderRef,
        accountId: command.accountId,
        requestRef: resolved.accessRequest.id,
        entitlementRef: resolved.entitlement.id,
        issuedLinkRef: resolved.binding.id,
        tenantRef: resolved.binding.tenantRef,
        artifactRef: resolved.binding.artifactRef,
        offerVersionRef: offer.offerVersionRef,
        portalPlan,
        durationDays: offer.delivery.durationDays,
        monthlyTrafficGb: offer.delivery.monthlyTrafficGb,
        requireExistingEffect,
        recoveryOnly: resolved.runtimeReady !== true,
        now
      });
    } catch (error) {
      if (isTemporaryDependencyError(error)) {
        throw createCoinCommerceFulfillmentRetryableError();
      }
      if (safeErrorCode(error) === "coin_commerce_subscription_fulfillment_drift") {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      if (
        safeErrorCode(error) === "validation_error"
        || safeErrorCode(error) === "not_found"
      ) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      throw createCoinCommerceFulfillmentRetryableError();
    }

    let renewed;
    try {
      renewed = runtimeCore.renewTenant(resolved.accessRequest.tenantId, {
        expiresAt: effect.runtimeTargetValidUntil
      });
    } catch (error) {
      if (isPermanentRuntimeBindingError(error)) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      throw createCoinCommerceFulfillmentRetryableError();
    }
    if (
      !renewed
      || renewed.id !== resolved.accessRequest.tenantId
      || !["active", "expiring"].includes(renewed.status)
    ) {
      throw createCoinCommerceFulfillmentReconciliationError();
    }
    if (!expiryAtLeast(
      renewed.expiresAt,
      effect.runtimeTargetValidUntil
    )) {
      throw createCoinCommerceFulfillmentRetryableError();
    }
    try {
      const storedTenant = runtimeCore.getTenant(resolved.accessRequest.tenantId);
      if (
        !storedTenant
        || storedTenant.id !== resolved.accessRequest.tenantId
        || !["active", "expiring"].includes(storedTenant.status)
      ) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      if (!expiryAtLeast(
        storedTenant.expiresAt,
        effect.runtimeTargetValidUntil
      )) {
        throw createCoinCommerceFulfillmentRetryableError();
      }
      const artifacts = runtimeCore
        .listSubscriptionArtifacts(resolved.accessRequest.tenantId)
        .filter((artifact) => artifact.id === resolved.accessRequest.artifactId);
      if (
        artifacts.length !== 1
        || artifacts[0].tenantId !== resolved.accessRequest.tenantId
        || artifacts[0].status !== "active"
      ) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
    } catch (error) {
      if (
        isCoinCommerceFulfillmentRetryableError(error)
        || isCoinCommerceFulfillmentReconciliationError(error)
      ) {
        throw error;
      }
      if (isPermanentRuntimeBindingError(error)) {
        throw createCoinCommerceFulfillmentReconciliationError();
      }
      throw createCoinCommerceFulfillmentRetryableError();
    }

    return Object.freeze({
      status: "delivered",
      effectRef: effect.effectRef
    });
  }

  const fulfillmentHandler = Object.freeze({
    idempotencyContract: "deduplicate_by_command_ref",
    execute
  });

  return Object.freeze({
    fulfillmentHandler,
    purchaseEligibilityReader
  });
}
