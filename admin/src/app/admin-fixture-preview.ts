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
  modules: Record<AdminPage, Record<string, AdminFixturePreviewPanel>>;
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
  hash = typeof window === "undefined" ? "" : window.location.hash
) {
  return previewFlagEnabled(env.VITE_ADMIN_FIXTURE_PREVIEW) || isAdminFixturePreviewHash(hash);
}

export const ADMIN_FIXTURE_PREVIEW_DATA: AdminFixturePreviewData = {
  generatedLabel: "GCC-104 safe fixture preview",
  riskNotificationCount: 2,
  schemaVersion: "admin-fixture-preview/v1",
  modules: {
    dashboard: {
      "health-summary": {
        summary: "Synthetic operator snapshot with healthy platform status, one stale evidence lane, and bounded review candidates.",
        chips: [
          { label: "Healthy", tone: "success" },
          { label: "1 stale lane", tone: "warning" },
          { label: "Safe refs only", tone: "info" }
        ],
        rows: [
          { label: "Platform state", value: "Ready", tone: "success" },
          { label: "Freshness P95", value: "7m", meta: "preview window" },
          { label: "Channel coverage", value: "5 measured / 6 issued", tone: "warning" }
        ],
        safetyNotes: [
          "Fixture data is synthetic and bounded.",
          "No production Admin API is connected."
        ]
      },
      "risk-queue": {
        summary: "Review queue previews routing decisions without durable case closure or mutation actions.",
        chips: [
          { label: "2 candidates", tone: "warning" },
          { label: "No write action", tone: "neutral" }
        ],
        rows: [
          { label: "High", value: "acct_demo_02", meta: "missing receipt evidence", tone: "danger" },
          { label: "Medium", value: "ord_demo_108", meta: "quota review candidate", tone: "warning" }
        ],
        safetyNotes: [
          "Candidate refs are synthetic.",
          "Closure and approval workflows remain locked."
        ]
      },
      "next-actions": {
        summary: "Operator routes are limited to owner pages already present in the Admin shell.",
        chips: [
          { label: "Accounts route", tone: "info" },
          { label: "Usage route", tone: "info" }
        ],
        rows: [
          { label: "User Operations", value: "Inspect account and order state" },
          { label: "Platform Monitoring", value: "Inspect usage and channel evidence" }
        ],
        safetyNotes: [
          "Future Audit and Platform Development areas remain planned.",
          "Preview routing does not execute production actions."
        ]
      }
    },
    portalRequests: {
      "account-overview": {
        summary: "Account directory preview shows safe account refs, supervision state, and linked resource counts.",
        chips: [
          { label: "3 accounts", tone: "info" },
          { label: "1 review", tone: "warning" }
        ],
        rows: [
          { label: "acct_demo_01", value: "Enabled", meta: "2 resources", tone: "success" },
          { label: "acct_demo_02", value: "Needs review", meta: "receipt gap", tone: "warning" },
          { label: "acct_demo_03", value: "Disabled", meta: "archive candidate", tone: "neutral" }
        ],
        safetyNotes: [
          "No customer-private contact fields are present.",
          "Create and disable controls wait for backend contracts."
        ]
      },
      "resource-orders": {
        summary: "Resource and order preview keeps artifact state visible without showing delivery material.",
        chips: [
          { label: "4 orders", tone: "info" },
          { label: "1 pending", tone: "warning" }
        ],
        rows: [
          { label: "ord_demo_104", value: "Delivered", meta: "art_ref_demo_104", tone: "success" },
          { label: "ord_demo_108", value: "Pending delivery", meta: "waiting for receipt", tone: "warning" },
          { label: "ord_demo_077", value: "Expired", meta: "safe history only", tone: "neutral" }
        ],
        safetyNotes: [
          "Artifact refs are synthetic display refs.",
          "Delivery preview generation is not enabled."
        ]
      },
      "quota-usage": {
        summary: "Quota review preview separates policy decisions from usage evidence ownership.",
        chips: [
          { label: "2 within plan", tone: "success" },
          { label: "1 over plan", tone: "warning" }
        ],
        rows: [
          { label: "acct_demo_01", value: "42 GB / 100 GB", tone: "success" },
          { label: "acct_demo_02", value: "103 GB / 100 GB", meta: "requires review", tone: "warning" },
          { label: "acct_demo_03", value: "0 GB / 20 GB", meta: "disabled account", tone: "neutral" }
        ],
        safetyNotes: [
          "Quota edits remain disabled.",
          "Usage values are synthetic and rounded."
        ]
      },
      lifecycle: {
        summary: "Lifecycle preview shows review lanes before any approved backend mutation flow exists.",
        chips: [
          { label: "Read-only", tone: "neutral" },
          { label: "Dry-run later", tone: "info" }
        ],
        rows: [
          { label: "Account", value: "acct_demo_02 review", tone: "warning" },
          { label: "Order", value: "ord_demo_108 delivery check", tone: "warning" },
          { label: "Artifact", value: "art_ref_demo_077 expired", tone: "neutral" }
        ],
        safetyNotes: [
          "Pause, revoke, and archive actions are not rendered.",
          "Runtime services are outside this UI preview."
        ]
      },
      "history-events": {
        summary: "Computed history preview provides bounded review context until durable audit storage lands.",
        chips: [
          { label: "5 safe events", tone: "info" },
          { label: "Audit locked", tone: "neutral" }
        ],
        rows: [
          { label: "evt_demo_501", value: "Receipt gap candidate", meta: "acct_demo_02" },
          { label: "evt_demo_502", value: "Quota review candidate", meta: "ord_demo_108" },
          { label: "evt_demo_503", value: "Expiry observed", meta: "art_ref_demo_077" }
        ],
        safetyNotes: [
          "Raw logs and row dumps are excluded.",
          "Audit note writes wait for durable case backend work."
        ]
      }
    },
    usageMonitor: {
      freshness: {
        summary: "Freshness preview shows whether collected usage evidence is current enough to trust.",
        chips: [
          { label: "Fresh", tone: "success" },
          { label: "1 stale", tone: "warning" }
        ],
        rows: [
          { label: "Generated", value: "T-2m", meta: "fixture clock" },
          { label: "Latest usage", value: "T-4m", tone: "success" },
          { label: "Stale channels", value: "1", tone: "warning" }
        ],
        safetyNotes: [
          "Timestamps are relative synthetic labels.",
          "No collector polling is performed."
        ]
      },
      "channel-coverage": {
        summary: "Channel coverage preview compares issued and measured safe channel refs.",
        chips: [
          { label: "5 measured", tone: "success" },
          { label: "1 missing", tone: "warning" }
        ],
        rows: [
          { label: "chn_demo_jp_01", value: "Measured", tone: "success" },
          { label: "chn_demo_sg_02", value: "Measured", tone: "success" },
          { label: "chn_demo_sg_03", value: "Missing receipt", tone: "warning" }
        ],
        safetyNotes: [
          "Channel refs are safe preview identifiers.",
          "Node provisioning and apply controls are absent."
        ]
      },
      "usage-ledger": {
        summary: "Usage ledger preview gives bounded evidence rows for account, order, channel, and traffic correlation.",
        chips: [
          { label: "6 rows", tone: "info" },
          { label: "Bounded", tone: "neutral" }
        ],
        rows: [
          { label: "acct_demo_01 / ord_demo_104", value: "42 GB", meta: "chn_demo_jp_01", tone: "success" },
          { label: "acct_demo_02 / ord_demo_108", value: "103 GB", meta: "chn_demo_sg_03", tone: "warning" },
          { label: "acct_demo_03 / ord_demo_077", value: "0 GB", meta: "disabled collector", tone: "neutral" }
        ],
        safetyNotes: [
          "Ledger rows are synthetic and capped.",
          "No table virtualization is required for this preview dataset."
        ]
      },
      "collection-anomalies": {
        summary: "Anomaly preview classifies collection delay, zero usage, disabled collector, and receipt gaps.",
        chips: [
          { label: "2 warnings", tone: "warning" },
          { label: "Case backend locked", tone: "neutral" }
        ],
        rows: [
          { label: "Delay warning", value: "chn_demo_sg_03", meta: "receipt gap", tone: "warning" },
          { label: "Zero usage", value: "acct_demo_03", meta: "disabled account", tone: "neutral" },
          { label: "Collection gap", value: "collector_demo_sg", meta: "diagnostics later", tone: "warning" }
        ],
        safetyNotes: [
          "False-positive closure is not available.",
          "Durable case notes wait for Audit and Cases backend work."
        ]
      },
      "receipts-collectors": {
        summary: "Receipt and collector preview shows evidence availability without exposing runtime config.",
        chips: [
          { label: "Receipts healthy", tone: "success" },
          { label: "1 pending", tone: "warning" }
        ],
        rows: [
          { label: "receipt_demo_301", value: "Applied", meta: "chn_demo_jp_01", tone: "success" },
          { label: "receipt_demo_302", value: "Pending", meta: "chn_demo_sg_03", tone: "warning" },
          { label: "collector_demo_sg", value: "Available", meta: "read-only diagnostics", tone: "info" }
        ],
        safetyNotes: [
          "Raw runtime config and logs are excluded.",
          "Collector activation is not available in preview."
        ]
      }
    }
  }
};

export function getAdminFixturePreviewPanel(page: AdminPage, navId: string) {
  return ADMIN_FIXTURE_PREVIEW_DATA.modules[page][navId];
}
