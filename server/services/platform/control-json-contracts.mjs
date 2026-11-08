const SAFE_CONTROL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const UNSAFE_CONTROL_VALUE_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const SAFE_AUTHORITY_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const AUTHORITY_SECRET_LIKE_PATTERN =
  /^(?:https?:|mailto:|bearer[ .:_-]|sk[-_]|eyj[a-z0-9_-]{10,})/i;

function contractError() {
  return Object.assign(new Error("invalid control JSON contract"), { code: "validation_error" });
}

function snapshotPlainObject(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw contractError();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw contractError();
  const snapshot = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw contractError();
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactKeys(snapshot, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(snapshot);
  if (
    keys.some((key) => !allowed.has(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
  ) {
    throw contractError();
  }
}

function safeControlRef(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
    || !SAFE_CONTROL_REF_PATTERN.test(value)
    || UNSAFE_CONTROL_VALUE_PATTERN.test(value)
  ) {
    throw contractError();
  }
  return value;
}

function safeAuthorityRef(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
    || !SAFE_AUTHORITY_REF_PATTERN.test(value)
    || AUTHORITY_SECRET_LIKE_PATTERN.test(value)
  ) {
    throw contractError();
  }
  return value;
}

function canonicalTimestamp(value) {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw contractError();
  }
  return value;
}

function safeNonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw contractError();
  return value;
}

function safePositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw contractError();
  return value;
}

export function portalAccessEventJson(value) {
  if (value == null) return "{}";
  const event = snapshotPlainObject(value);
  const keys = Object.keys(event);
  if (keys.length === 0) return "{}";

  const type = event.type;
  if (type === "traffic_supply_suspended") {
    exactKeys(event, ["type", "occurredAt", "previousStatus"], ["lifecycleRevisionRef"]);
    if (!["delivered", "issued"].includes(event.previousStatus)) throw contractError();
    canonicalTimestamp(event.occurredAt);
    if (
      Object.hasOwn(event, "lifecycleRevisionRef")
      && !/^lifecycle_ref_[a-f0-9]{32}$/.test(event.lifecycleRevisionRef)
    ) throw contractError();
  } else if (type === "subscription_disabled") {
    exactKeys(event, ["type", "occurredAt", "previousStatus"]);
    if (!["delivered", "issued"].includes(event.previousStatus)) throw contractError();
    canonicalTimestamp(event.occurredAt);
  } else if (type === "subscription_expired") {
    exactKeys(event, ["type", "occurredAt", "previousStatus", "lifecycleRevisionRef"]);
    if (!["delivered", "issued"].includes(event.previousStatus)) throw contractError();
    canonicalTimestamp(event.occurredAt);
    if (!/^lifecycle_ref_[a-f0-9]{32}$/.test(event.lifecycleRevisionRef)) throw contractError();
  } else if (type === "traffic_supply_resumed") {
    exactKeys(event, ["type", "occurredAt", "lifecycleRevisionRef"]);
    canonicalTimestamp(event.occurredAt);
    if (!/^lifecycle_ref_[a-f0-9]{32}$/.test(event.lifecycleRevisionRef)) throw contractError();
  } else if (type === "delivery_generation_reissued" || type === "subscription_link_reset") {
    exactKeys(event, ["type", "occurredAt"]);
    canonicalTimestamp(event.occurredAt);
  } else if (type === "wallet_first_resource_effect_applied") {
    exactKeys(event, ["type", "transitionRef", "effectRef", "occurredAt"]);
    safeControlRef(event.transitionRef);
    safeControlRef(event.effectRef);
    canonicalTimestamp(event.occurredAt);
  } else {
    throw contractError();
  }
  return JSON.stringify(event);
}

const COIN_COMMERCE_FULFILLMENT_FIELDS = [
  "version",
  "commandRef",
  "orderRef",
  "accountId",
  "requestRef",
  "entitlementRef",
  "issuedLinkRef",
  "tenantRef",
  "artifactRef",
  "offerVersionRef",
  "portalPlan",
  "durationDays",
  "monthlyTrafficGb",
  "trafficLimitBytes",
  "validFrom",
  "previousValidUntil",
  "targetValidUntil"
];

export function coinCommerceSubscriptionFulfillmentMetadataJson(value) {
  const metadata = snapshotPlainObject(value);
  exactKeys(metadata, COIN_COMMERCE_FULFILLMENT_FIELDS, ["switchKind"]);
  if (metadata.version !== 1) throw contractError();

  for (const field of [
    "commandRef", "orderRef", "accountId", "tenantRef", "artifactRef", "offerVersionRef"
  ]) safeControlRef(metadata[field]);
  for (const field of ["requestRef", "entitlementRef", "issuedLinkRef"]) {
    safeAuthorityRef(metadata[field]);
  }

  if (metadata.portalPlan !== "monthly" && metadata.portalPlan !== "yearly") throw contractError();
  safePositiveInteger(metadata.durationDays);
  safePositiveInteger(metadata.monthlyTrafficGb);
  safeNonNegativeInteger(metadata.trafficLimitBytes);
  if (metadata.trafficLimitBytes !== metadata.monthlyTrafficGb * (1024 ** 3)) throw contractError();

  const validFrom = canonicalTimestamp(metadata.validFrom);
  const previousValidUntil = canonicalTimestamp(metadata.previousValidUntil);
  const targetValidUntil = canonicalTimestamp(metadata.targetValidUntil);
  if (
    validFrom >= targetValidUntil
    || previousValidUntil > targetValidUntil
    || (previousValidUntil === targetValidUntil && metadata.switchKind !== "upgrade_inplace")
  ) {
    throw contractError();
  }
  if (
    Object.hasOwn(metadata, "switchKind")
    && metadata.switchKind !== "upgrade_inplace"
    && metadata.switchKind !== "upgrade_restart"
  ) {
    throw contractError();
  }
  return JSON.stringify(metadata);
}
