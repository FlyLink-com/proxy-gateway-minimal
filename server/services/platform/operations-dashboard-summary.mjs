import { projectOperationsOverviewReadModel } from "./operations-overview-read-model.mjs";

const UNAVAILABLE_METRICS = [
  "platformHealth",
  "channelCoverage",
  "freshnessP95",
  "riskCandidates"
];
const GROWTH_POINT_FIELDS = ["at", "registeredCount", "otherCreatedCount", "coverage"];

function unavailableGrowth() {
  return { availability: "unavailable" };
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid growth count");
  }
  return value;
}

export function projectRegistrationGrowth(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return unavailableGrowth();
  if (input.availability === "not_authorized") return { availability: "not_authorized" };
  if (input.availability !== "ready") return unavailableGrowth();
  if (input.timezone !== "UTC" || input.definition !== "account_created_at") return unavailableGrowth();
  if (typeof input.from !== "string" || typeof input.to !== "string" || !Array.isArray(input.points)) {
    return unavailableGrowth();
  }
  const points = input.points.map((point) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) {
      throw new Error("invalid growth point");
    }
    const keys = Object.keys(point);
    if (keys.length !== GROWTH_POINT_FIELDS.length || GROWTH_POINT_FIELDS.some((field) => !keys.includes(field))) {
      throw new Error("invalid growth point");
    }
    if (typeof point.at !== "string" || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(point.at)) {
      throw new Error("invalid growth point");
    }
    if (point.coverage !== "queried") throw new Error("invalid growth point");
    return {
      at: point.at,
      registeredCount: count(point.registeredCount),
      otherCreatedCount: count(point.otherCreatedCount),
      coverage: "queried"
    };
  });
  return {
    availability: "ready",
    timezone: "UTC",
    definition: "account_created_at",
    from: input.from,
    to: input.to,
    registeredCount: count(input.registeredCount),
    otherCreatedCount: count(input.otherCreatedCount),
    points
  };
}

export function projectTrafficCollector(projection) {
  if (!projection || typeof projection !== "object") {
    return { availability: "unknown", observedAt: null };
  }
  if (projection.availability === "not_configured") {
    return { availability: "not_connected", observedAt: null };
  }
  if (projection.availability !== "available" || typeof projection.observedAt !== "string") {
    return { availability: "unknown", observedAt: null };
  }
  return {
    availability: projection.run?.runOk === true ? "ready" : "partial",
    observedAt: projection.observedAt
  };
}

export function projectOperationsDashboardSummary(overview, sources = {}) {
  const counts = projectOperationsOverviewReadModel(overview);
  let registrationGrowth;
  try {
    registrationGrowth = projectRegistrationGrowth(sources.registrationGrowth);
  } catch {
    registrationGrowth = unavailableGrowth();
  }
  const summary = {
    subscriptions: {
      availability: "ready",
      definition: "subscription_tenants",
      total: counts.total,
      active: counts.active,
      expiring: counts.expiring,
      disabledOrExpired: counts.disabledOrExpired
    },
    registrationGrowth,
    trafficCollector: projectTrafficCollector(sources.trafficCollector)
  };
  for (const metric of UNAVAILABLE_METRICS) {
    summary[metric] = { availability: "not_connected" };
  }
  return summary;
}
