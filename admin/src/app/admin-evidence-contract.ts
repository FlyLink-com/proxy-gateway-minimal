import { type AdminPage } from "./navigation";
import { type EvidenceSurfaceDataContract } from "../components/primitives";

export type AdminEvidenceSurfaceKey =
  | "operationsMetrics"
  | "operationsEventLog"
  | "accountMetrics"
  | "accountEventLog"
  | "usageMetrics"
  | "usageChannelEventLog";

export type AdminEvidenceSurfaceContract = EvidenceSurfaceDataContract & {
  figmaNodeId: "24:5" | "24:35" | "24:65";
  key: AdminEvidenceSurfaceKey;
  ownerPage: AdminPage;
  panelKind: "trend" | "event-log";
};

const STATIC_WINDOW = "7-point design placeholder";
const STATIC_AGGREGATION = "none; visual placeholder only";
const STATIC_THRESHOLD = "visual label only; backend threshold pending";
const STATIC_EMPTY_STATE = "render bounded empty evidence surface without production inference";
const STATIC_STALE_STATE = "render stale/unknown copy without mutation or lifecycle action";

export const ADMIN_EVIDENCE_SURFACE_CONTRACTS: Record<AdminEvidenceSurfaceKey, AdminEvidenceSurfaceContract> = {
  accountEventLog: evidenceContract({
    figmaNodeId: "24:35",
    key: "accountEventLog",
    ownerPage: "portalRequests",
    panelKind: "event-log",
    redaction: "safe-events-only",
    sourceName: "safe account/resource event facts"
  }),
  accountMetrics: evidenceContract({
    figmaNodeId: "24:35",
    key: "accountMetrics",
    ownerPage: "portalRequests",
    panelKind: "trend",
    redaction: "safe-summary-only",
    sourceName: "safe account/resource summary facts"
  }),
  operationsEventLog: evidenceContract({
    figmaNodeId: "24:5",
    key: "operationsEventLog",
    ownerPage: "dashboard",
    panelKind: "event-log",
    redaction: "safe-events-only",
    sourceName: "safe operations routing events"
  }),
  operationsMetrics: evidenceContract({
    figmaNodeId: "24:5",
    key: "operationsMetrics",
    ownerPage: "dashboard",
    panelKind: "trend",
    redaction: "safe-summary-only",
    sourceName: "safe operations summary facts"
  }),
  usageChannelEventLog: evidenceContract({
    figmaNodeId: "24:65",
    key: "usageChannelEventLog",
    ownerPage: "usageMonitor",
    panelKind: "event-log",
    redaction: "safe-events-only",
    sourceName: "safe usage/channel event facts"
  }),
  usageMetrics: evidenceContract({
    figmaNodeId: "24:65",
    key: "usageMetrics",
    ownerPage: "usageMonitor",
    panelKind: "trend",
    redaction: "safe-summary-only",
    sourceName: "safe usage/channel summary facts"
  })
};

export function listAdminEvidenceSurfaceContracts() {
  return Object.values(ADMIN_EVIDENCE_SURFACE_CONTRACTS);
}

export function findAdminEvidenceSurfaceContractIssues(
  contracts: readonly AdminEvidenceSurfaceContract[] = listAdminEvidenceSurfaceContracts()
) {
  const issues: string[] = [];
  const seenKeys = new Set<string>();
  const unsafeText = /https?:\/\/|subscriptionUrl|token=|Bearer|raw token|raw credential|secret|password|edgecred_|sqlite/i;

  contracts.forEach((contract) => {
    if (seenKeys.has(contract.key)) {
      issues.push(`${contract.key}: duplicate evidence contract key`);
    }
    seenKeys.add(contract.key);

    if (contract.mode === "connected" || contract.backendAdapter === "connected") {
      issues.push(`${contract.key}: connected evidence requires a reviewed DTO adapter first`);
    }

    [
      contract.sourceName,
      contract.samplingWindow,
      contract.aggregation,
      contract.threshold,
      contract.emptyState,
      contract.staleState
    ].forEach((value) => {
      if (!value.trim()) {
        issues.push(`${contract.key}: empty evidence contract field`);
      }
      if (unsafeText.test(value)) {
        issues.push(`${contract.key}: unsafe evidence contract text`);
      }
    });
  });

  return issues;
}

function evidenceContract(input: {
  figmaNodeId: AdminEvidenceSurfaceContract["figmaNodeId"];
  key: AdminEvidenceSurfaceKey;
  ownerPage: AdminPage;
  panelKind: AdminEvidenceSurfaceContract["panelKind"];
  redaction: AdminEvidenceSurfaceContract["redaction"];
  sourceName: string;
}): AdminEvidenceSurfaceContract {
  return {
    aggregation: STATIC_AGGREGATION,
    backendAdapter: "pending-contract",
    emptyState: STATIC_EMPTY_STATE,
    figmaNodeId: input.figmaNodeId,
    key: input.key,
    mode: "design-static",
    ownerPage: input.ownerPage,
    panelKind: input.panelKind,
    redaction: input.redaction,
    samplingWindow: STATIC_WINDOW,
    sourceName: input.sourceName,
    staleState: STATIC_STALE_STATE,
    threshold: STATIC_THRESHOLD
  };
}
