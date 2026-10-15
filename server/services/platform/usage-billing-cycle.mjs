function dateFromIso(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addUtcMonthsClamped(anchor, months) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const day = anchor.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(day, lastDay),
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds()
  ));
}

const FIXED_30_DAY_PLANS = new Set([
  "offerv_plan_30d_50gb_monthly_v1",
  "offerv_plan_30d_100gb_monthly_v1"
]);
const FIXED_30_DAY_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const ROLLOVER_MANAGED_PLANS = new Set([
  "offerv_plan_30d_50gb_monthly_v1",
  "offerv_plan_30d_100gb_monthly_v1",
  "offerv_plan_365d_200gb_monthly_v1"
]);
// These immutable offer versions consume one quota for the entire resource
// lifetime. A page refresh or calendar boundary must never replenish them.
const LIFETIME_DATA_PACK_GB = new Map([
  ["offerv_pack_100gb_v1", 100],
  ["offerv_pack_200gb_v1", 200],
  ["offerv_pack_500gb_v1", 500]
]);

// Runtime tenants still require an ISO expiry. This is a technical horizon,
// never a customer-facing commercial expiration for a data pack.
export const DATA_PACK_TECHNICAL_VALID_UNTIL = "9999-12-31T23:59:59.999Z";

export function isLifetimeDataPackBinding(binding) {
  return LIFETIME_DATA_PACK_GB.has(String(binding?.plan || "").trim());
}

export function lifetimeDataPackQuotaBytesFor(binding) {
  const gigabytes = LIFETIME_DATA_PACK_GB.get(String(binding?.plan || "").trim());
  return gigabytes === undefined ? null : gigabytes * 1024 ** 3;
}

export function isQuotaRolloverManagedBinding(binding) {
  return ROLLOVER_MANAGED_PLANS.has(String(binding?.plan || "").trim());
}

export function monthlyUsageCycleFor({ validFrom, validUntil, at } = {}) {
  const anchor = dateFromIso(validFrom);
  const observed = dateFromIso(at);
  if (!anchor || !observed) {
    return null;
  }
  const entitlementEnd = dateFromIso(validUntil);
  const effectiveAt = entitlementEnd && observed >= entitlementEnd
    ? new Date(entitlementEnd.getTime() - 1)
    : observed;
  let cycleIndex = 0;
  for (let index = 1; index <= 600; index += 1) {
    const next = addUtcMonthsClamped(anchor, index);
    if (next > effectiveAt) {
      break;
    }
    cycleIndex = index;
  }
  const cycleStart = addUtcMonthsClamped(anchor, cycleIndex);
  let cycleEnd = addUtcMonthsClamped(anchor, cycleIndex + 1);
  if (entitlementEnd && entitlementEnd < cycleEnd) {
    cycleEnd = entitlementEnd;
  }
  if (cycleEnd <= cycleStart) {
    return null;
  }
  return {
    startedAt: cycleStart.toISOString(),
    endedAt: cycleEnd.toISOString()
  };
}

export function usageCycleForBinding(binding, at) {
  if (isLifetimeDataPackBinding(binding)) {
    const startedAt = dateFromIso(binding?.validFrom);
    const endedAt = dateFromIso(binding?.validUntil);
    const observedAt = dateFromIso(at);
    if (!startedAt || !endedAt || !observedAt || endedAt <= startedAt) {
      return null;
    }
    return {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      cadence: "lifetime"
    };
  }
  if (FIXED_30_DAY_PLANS.has(String(binding?.plan || "").trim())) {
    const anchor = dateFromIso(binding?.validFrom);
    const entitlementEnd = dateFromIso(binding?.validUntil);
    const observedAt = dateFromIso(at);
    if (!anchor || !entitlementEnd || !observedAt || entitlementEnd <= anchor) {
      return null;
    }
    const effectiveAt = observedAt >= entitlementEnd
      ? new Date(entitlementEnd.getTime() - 1)
      : observedAt;
    const elapsedMs = Math.max(0, effectiveAt.getTime() - anchor.getTime());
    const cycleIndex = Math.floor(elapsedMs / FIXED_30_DAY_DURATION_MS);
    const startedAt = new Date(anchor.getTime() + cycleIndex * FIXED_30_DAY_DURATION_MS);
    const uncappedEnd = new Date(startedAt.getTime() + FIXED_30_DAY_DURATION_MS);
    const endedAt = uncappedEnd < entitlementEnd ? uncappedEnd : entitlementEnd;
    if (endedAt <= startedAt) {
      return null;
    }
    return {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      cadence: "fixed_30_days"
    };
  }
  const cycle = monthlyUsageCycleFor({
    validFrom: binding?.validFrom,
    validUntil: binding?.validUntil,
    at
  });
  return cycle ? { ...cycle, cadence: "monthly_anniversary" } : null;
}

export function summarizeUsageSamples(samples = []) {
  return samples.reduce((totals, sample) => {
    const uploadBytes = nonNegativeNumber(sample?.uploadBytes);
    const downloadBytes = nonNegativeNumber(sample?.downloadBytes);
    const totalBytes = nonNegativeNumber(sample?.totalBytes ?? uploadBytes + downloadBytes);
    const observedAt = safeIso(sample?.observedAt);
    const updatedAt = safeIso(sample?.createdAt || sample?.observedAt);
    return {
      uploadBytes: totals.uploadBytes + uploadBytes,
      downloadBytes: totals.downloadBytes + downloadBytes,
      totalBytes: totals.totalBytes + totalBytes,
      lastObservedAt: latestIso(totals.lastObservedAt, observedAt),
      updatedAt: latestIso(totals.updatedAt, updatedAt),
      channelRefs: observedAt
        ? totals.channelRefs.add(String(sample?.channelRef || ""))
        : totals.channelRefs
    };
  }, {
    uploadBytes: 0,
    downloadBytes: 0,
    totalBytes: 0,
    lastObservedAt: null,
    updatedAt: null,
    channelRefs: new Set()
  });
}

export function usageCycleFiltersForBinding(binding, at) {
  const cycle = usageCycleForBinding(binding, at);
  if (!cycle) {
    return {};
  }
  return {
    observedFrom: cycle.startedAt,
    observedTo: cycle.endedAt
  };
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeIso(value) {
  const date = dateFromIso(value);
  return date ? date.toISOString() : null;
}

function latestIso(left, right) {
  if (!right) return left || null;
  if (!left) return right;
  return right > left ? right : left;
}
