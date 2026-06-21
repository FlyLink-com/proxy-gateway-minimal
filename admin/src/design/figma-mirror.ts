import { type AdminPage } from "../app/navigation";

export const ADMIN_FIGMA_MIRROR_CONTRACT_VERSION = "admin-figma-mirror/v1";

export const ADMIN_FIGMA_FILE_KEY = "EvQXTtJ2XnRfcGxRLTRt0B";

export const ADMIN_FIGMA_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_FILE_KEY}`;

export type AdminFigmaMirrorPageStatus =
  | "current"
  | "required"
  | "blocked";

export type AdminFigmaMirrorPage = {
  name: string;
  status: AdminFigmaMirrorPageStatus;
  role: "requirements-map" | "tokens-components" | "page-mirror" | "visual-qa-ledger";
  frameName: string;
  frameSize: "1440x1200" | "1600x1024" | "1440x960";
  mapsToPages: AdminPage[];
  acceptance: string[];
};

export const ADMIN_FIGMA_MIRROR_PAGES: readonly AdminFigmaMirrorPage[] = [
  {
    name: "00 Requirements Map",
    status: "current",
    role: "requirements-map",
    frameName: "GlobalCircle AI Admin Console / Requirements Map",
    frameSize: "1440x1200",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "No row or child-card clipping",
      "Requirements map is planning-only and does not override React page ownership"
    ]
  },
  {
    name: "01 Design Tokens / Components",
    status: "required",
    role: "tokens-components",
    frameName: "Admin OS / Design Tokens + Components Mirror",
    frameSize: "1440x960",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Uses the Admin visual protocol token names",
      "Separates shell, workspace, panel, and primitive responsibilities"
    ]
  },
  {
    name: "02 Operations Overview / 1600x1024",
    status: "required",
    role: "page-mirror",
    frameName: "Operations Overview / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard"],
    acceptance: [
      "Mirrors summary-and-routing only",
      "Does not mirror account/resource ledgers, object timelines, or channel ledgers as Overview-owned content"
    ]
  },
  {
    name: "03 Accounts & Resources / 1600x1024",
    status: "required",
    role: "page-mirror",
    frameName: "Accounts & Resources / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["portalRequests"],
    acceptance: [
      "Owns account, resource, order, quota, lifecycle, and history-entry panels",
      "Shows safe refs only and no executable account/order mutation controls"
    ]
  },
  {
    name: "04 Usage & Channels / 1600x1024",
    status: "required",
    role: "page-mirror",
    frameName: "Usage & Channels / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["usageMonitor"],
    acceptance: [
      "Owns collection freshness, channel coverage, usage ledger, anomalies, and receipt panels",
      "Does not own quota edits, order pause/archive, subscription artifact lifecycle, or runtime apply"
    ]
  },
  {
    name: "05 Visual QA / Ledger",
    status: "required",
    role: "visual-qa-ledger",
    frameName: "Admin OS / Visual QA Ledger",
    frameSize: "1440x960",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records Figma mirror, DOM contract, Browser viewport, and validation-command evidence",
      "Keeps current blockers visible until resolved"
    ]
  }
];

export const ADMIN_FIGMA_REQUIRED_PAGE_NAMES = ADMIN_FIGMA_MIRROR_PAGES.map((page) => page.name);

export const ADMIN_FIGMA_WRITE_ACCESS_CHECK = {
  checkedAt: "2026-06-21",
  status: "blocked",
  attemptedOperation: "Resize existing requirements-map rows and create mirror pages",
  connectorReportedSeat: "Dev / developer",
  userReportedAccess: "Figma UI shows Full access for the connected account.",
  diagnosticResult: "get_metadata and get_screenshot can read the file, but use_figma read-only execution is denied.",
  connectorMessage: "User does not have view permission on file",
  nextStep: "Refresh or reconnect the Figma connector so the MCP use_figma session sees the same Full/edit permission shown in Figma UI, then rerun the mirror write script."
} as const;

export const ADMIN_VISUAL_QA_AXES = [
  "figma-mirror",
  "dom-contract",
  "browser-desktop",
  "browser-mobile",
  "style-token-regression",
  "safe-data-boundary"
] as const;
