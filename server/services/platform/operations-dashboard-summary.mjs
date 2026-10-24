import { projectOperationsOverviewReadModel } from "./operations-overview-read-model.mjs";

const UNAVAILABLE_METRICS = [
  "platformHealth",
  "channelCoverage",
  "freshnessP95",
  "riskCandidates"
];

export function projectOperationsDashboardSummary(overview) {
  const counts = projectOperationsOverviewReadModel(overview);
  const summary = {
    subscriptions: {
      availability: "ready",
      definition: "subscription_tenants",
      total: counts.total,
      active: counts.active,
      expiring: counts.expiring,
      disabledOrExpired: counts.disabledOrExpired
    }
  };
  for (const metric of UNAVAILABLE_METRICS) {
    summary[metric] = { availability: "not_connected" };
  }
  return summary;
}
