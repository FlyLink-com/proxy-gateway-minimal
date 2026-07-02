import { type MetricTone } from "../components/primitives";
import { type AdminPage } from "./navigation";

type AdminFixturePreviewEnv = {
  VITE_ADMIN_FIXTURE_PREVIEW?: boolean | string;
};

type AdminFixturePreviewChip = {
  label: string;
  tone: MetricTone;
};

type AdminFixturePreviewRow = {
  label: string;
  meta?: string;
  tone?: MetricTone;
  value: string;
};

export type AdminFixturePreviewPanel = {
  chips: AdminFixturePreviewChip[];
  rows: AdminFixturePreviewRow[];
  safetyNotes: string[];
  summary: string;
};

type AdminFixturePreviewData = {
  generatedLabel: string;
  modules: Partial<Record<AdminPage, Record<string, AdminFixturePreviewPanel>>>;
  riskNotificationCount: number;
  schemaVersion: "admin-fixture-preview/v1";
};

const viteEnv = (import.meta as ImportMeta & { env?: AdminFixturePreviewEnv }).env || {};

function previewFlagEnabled(value: AdminFixturePreviewEnv["VITE_ADMIN_FIXTURE_PREVIEW"]) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isAdminFixturePreviewHash(hash: string) {
  return hash === "#/fixture-preview" || hash.startsWith("#/fixture-preview/");
}

export function isAdminFixturePreviewEnabled(
  env: AdminFixturePreviewEnv = viteEnv,
  hash = readCurrentHash()
) {
  return previewFlagEnabled(env.VITE_ADMIN_FIXTURE_PREVIEW)
    || isAdminFixturePreviewHash(hash);
}

function readCurrentHash() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.hash;
}

export const ADMIN_FIXTURE_PREVIEW_DATA: AdminFixturePreviewData = {
  generatedLabel: "GCC-104 safe fixture preview",
  riskNotificationCount: 2,
  schemaVersion: "admin-fixture-preview/v1",
  modules: {
    dashboard: {
      "health-summary": {
        summary: "Metric cards for platform health, risk candidates, freshness, and channel coverage.",
        chips: [
          { label: "Summary and routing", tone: "info" },
          { label: "Risk A gated", tone: "warning" }
        ],
        rows: [
          { label: "Platform health", value: "Good", meta: "reviewable · latest source safe", tone: "success" },
          { label: "Risk candidates", value: "18 total", meta: "5 high · routes only", tone: "danger" },
          { label: "Freshness P95", value: "2m 14s", meta: "stale threshold visible", tone: "info" },
          { label: "Channel coverage", value: "98.6%", meta: "aggregate only", tone: "success" }
        ],
        safetyNotes: [
          "Fixture data is synthetic and bounded.",
          "Overview summarizes and routes; owner pages hold detailed collections."
        ]
      },
      "risk-queue": {
        summary: "Cases ranked by owner route.",
        chips: [
          { label: "Open", tone: "info" },
          { label: "Review", tone: "warning" }
        ],
        rows: [
          { label: "case_012", value: "SLA 4m", meta: "Order ord_2048 · Owner Usage", tone: "info" },
          { label: "case_017", value: "SLA 12m", meta: "Order ord_2047 · Owner Accounts", tone: "warning" }
        ],
        safetyNotes: [
          "Candidates are bounded synthetic summaries.",
          "Closure and approval workflows remain locked."
        ]
      },
      "next-actions": {
        summary: "Route handoff for reviewers.",
        chips: [
          { label: "Ready", tone: "success" },
          { label: "Queued", tone: "info" }
        ],
        rows: [
          { label: "handoff", value: "Due Now", meta: "Route Accounts · Owner Operator", tone: "success" },
          { label: "refresh", value: "Due 8m", meta: "Route Usage · Owner Collector", tone: "info" }
        ],
        safetyNotes: [
          "Future restricted workflow and Platform Development areas remain planned.",
          "Preview routing does not execute production actions."
        ]
      },
      "review-candidates": {
        summary: "Items requiring operator check.",
        chips: [
          { label: "Review", tone: "warning" },
          { label: "Watch", tone: "warning" }
        ],
        rows: [
          { label: "ord_2048", value: "Age 14m", meta: "Issue delay · Signal P95", tone: "warning" },
          { label: "acct_002", value: "Age 1h", meta: "Issue quota · Signal 90%", tone: "warning" }
        ],
        safetyNotes: [
          "Review candidates are safe refs only.",
          "Durable case workflow remains outside Overview."
        ]
      }
    },
    portalRequests: {
      "account-overview": {
        summary: "Safe account refs, resource count, risk state, and last safe event.",
        chips: [
          { label: "Account Directory", tone: "info" },
          { label: "Selection allowed", tone: "success" }
        ],
        rows: [
          { label: "acct_demo_01", value: "Enabled", meta: "Normal", tone: "success" },
          { label: "acct_demo_02", value: "Review", meta: "Quota", tone: "warning" },
          { label: "acct_demo_03", value: "Disabled", meta: "Lifecycle", tone: "neutral" }
        ],
        safetyNotes: [
          "Selection and review planning only until backend action contracts land.",
          "No customer-private contact fields are present."
        ]
      },
      "resource-orders": {
        summary: "Orders, entitlements, delivery lifecycle, and artifact safe refs.",
        chips: [
          { label: "Resources & Orders", tone: "info" },
          { label: "Sensitive boundary", tone: "danger" }
        ],
        rows: [
          { label: "ord_safe_102", value: "Pending", meta: "Receipt pending · wait", tone: "warning" },
          { label: "ord_safe_103", value: "Expired", meta: "Revoked · archive review", tone: "neutral" }
        ],
        safetyNotes: [
          "No protected runtime material, raw handoff, or raw runtime config.",
          "Artifact refs are synthetic display refs."
        ]
      },
      "quota-usage": {
        summary: "Quota policy is owned here; usage facts are evidence only.",
        chips: [
          { label: "Warning", tone: "warning" },
          { label: "Owner decision", tone: "info" }
        ],
        rows: [
          { label: "Quota & Usage", value: "Used / total", meta: "measured channel count · review note gate", tone: "warning" }
        ],
        safetyNotes: [
          "Quota edits remain disabled.",
          "Usage values are synthetic and rounded."
        ]
      },
      lifecycle: {
        summary: "Active, paused, expired, revoked, archive candidate.",
        chips: [
          { label: "Info", tone: "info" },
          { label: "Backend gate", tone: "neutral" }
        ],
        rows: [
          { label: "Lifecycle", value: "Active, paused, expired, revoked", meta: "archive candidate", tone: "info" }
        ],
        safetyNotes: [
          "Pause, revoke, and archive actions are not rendered.",
          "Runtime services are outside this UI preview."
        ]
      },
      "history-events": {
        summary: "Safe computed events now; durable restricted history later.",
        chips: [
          { label: "Locked", tone: "neutral" },
          { label: "Future restricted history", tone: "info" }
        ],
        rows: [
          { label: "History & Events", value: "Safe computed events", meta: "durable restricted history later", tone: "neutral" },
          { label: "Forbidden here", value: "No runtime apply, collector activation, platform tools, or operator settings.", tone: "danger" }
        ],
        safetyNotes: [
          "Raw logs and row dumps are excluded.",
          "Restricted note writes wait for durable case backend work."
        ]
      }
    },
    usageMonitor: {
      freshness: {
        summary: "Fresh · stale · unknown · disconnected states.",
        chips: [
          { label: "Info", tone: "info" },
          { label: "Collection Freshness", tone: "info" }
        ],
        rows: [
          { label: "State taxonomy", value: "Fresh · stale · unknown · disconnected", tone: "info" }
        ],
        safetyNotes: [
          "Timestamps are relative synthetic labels.",
          "No collector polling is performed."
        ]
      },
      "channel-coverage": {
        summary: "Channel health, route latency, and receipt blockers.",
        chips: [
          { label: "Success", tone: "success" },
          { label: "Route latency", tone: "info" }
        ],
        rows: [
          { label: "channel_safe_sgp_hy2", value: "Degraded", meta: "Pending receipt · route stale", tone: "warning" },
          { label: "route_safe_tuic_recovery", value: "No sample", meta: "missing receipt blocker", tone: "danger" }
        ],
        safetyNotes: [
          "Channel refs are safe preview identifiers.",
          "Route latency rows use synthetic p50, p95, and p99 labels.",
          "Node provisioning and apply controls are absent."
        ]
      },
      "usage-ledger": {
        summary: "Read-only measurement evidence with safe refs.",
        chips: [
          { label: "Usage Ledger", tone: "info" },
          { label: "Read-only", tone: "neutral" }
        ],
        rows: [
          { label: "acct_demo_01 · ord_safe_101", value: "42.8 GB", meta: "jp-vless · fresh", tone: "success" },
          { label: "acct_demo_02 · ord_safe_102", value: "0 GB", meta: "sgp-hy2 · receipt pending", tone: "warning" },
          { label: "acct_demo_03 · ord_safe_103", value: "N/A", meta: "jp-tuic · collector disabled", tone: "neutral" }
        ],
        safetyNotes: [
          "Back end source: /api/admin/platform/subscription-usage-monitor or equivalent Admin DTO.",
          "Ledger rows are synthetic and capped."
        ]
      },
      "collection-anomalies": {
        summary: "Classify evidence; do not mutate accounts or orders.",
        chips: [
          { label: "Collection Anomalies", tone: "warning" },
          { label: "No mutation", tone: "neutral" }
        ],
        rows: [
          { label: "Missing receipt", value: "Channel remains gated", meta: "matching applied receipt required", tone: "danger" },
          { label: "Forbidden here", value: "No quota edit, order pause/archive, or artifact lifecycle.", tone: "danger" }
        ],
        safetyNotes: [
          "False-positive closure is not available.",
          "Durable case notes wait for Audit and Cases backend work."
        ]
      },
      "receipts-collectors": {
        summary: "Pending receipt, agent status, collector state, and inspection runs.",
        chips: [
          { label: "Warning", tone: "warning" },
          { label: "Inspection warning", tone: "warning" }
        ],
        rows: [
          { label: "agent_safe_sgp_02", value: "Delayed", meta: "heartbeat 4m · receipt push pending", tone: "warning" },
          { label: "route-latency-sample", value: "Blocked", meta: "owner route_safe_tuic_recovery", tone: "danger" }
        ],
        safetyNotes: [
          "Protected runtime material is excluded.",
          "Log and audit surfaces are not available to normal operators.",
          "Collector activation is not available in preview."
        ]
      }
    }
  }
};

export function getAdminFixturePreviewPanel(page: AdminPage, navId: string) {
  return ADMIN_FIXTURE_PREVIEW_DATA.modules[page]?.[navId];
}
