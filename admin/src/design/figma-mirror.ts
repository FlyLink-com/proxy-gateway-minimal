import { type AdminPage } from "../app/navigation";

export const ADMIN_FIGMA_MIRROR_CONTRACT_VERSION = "admin-figma-mirror/v1";

export const ADMIN_FIGMA_FILE_KEY = "oZuKNtGPhP6oOQ0MSzpfvn";

export const ADMIN_FIGMA_SOURCE_URL = `https://www.figma.com/design/${ADMIN_FIGMA_FILE_KEY}`;

export type AdminFigmaMirrorPageStatus =
  | "current"
  | "required"
  | "blocked";

export type AdminFigmaMirrorPage = {
  name: string;
  status: AdminFigmaMirrorPageStatus;
  role: "requirements-map" | "page-mirror" | "visual-qa-ledger";
  frameName: string;
  frameSize: "1600x1024";
  mapsToPages: AdminPage[];
  acceptance: string[];
};

export const ADMIN_FIGMA_MIRROR_PAGES: readonly AdminFigmaMirrorPage[] = [
  {
    name: "00 Contract & Build Order",
    status: "current",
    role: "requirements-map",
    frameName: "00 Contract & Build Order",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Defines the build order, current risk posture, and safe-data boundary",
      "Does not override React page ownership or production authority"
    ]
  },
  {
    name: "01 Operations Overview / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "01 Operations Overview / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard"],
    acceptance: [
      "Mirrors summary-and-routing only",
      "Does not mirror account/resource ledgers, object timelines, or channel ledgers as Overview-owned content"
    ]
  },
  {
    name: "02 Accounts & Resources / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "02 Accounts & Resources / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["portalRequests"],
    acceptance: [
      "Owns account, resource, order, quota, lifecycle, and history-entry panels",
      "Shows safe refs only and no executable account/order mutation controls"
    ]
  },
  {
    name: "03 Usage & Channels / 1600x1024",
    status: "current",
    role: "page-mirror",
    frameName: "03 Usage & Channels / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["usageMonitor"],
    acceptance: [
      "Owns collection freshness, channel coverage, usage ledger, anomalies, and receipt panels",
      "Does not own quota edits, order pause/archive, subscription artifact lifecycle, or runtime apply"
    ]
  },
  {
    name: "04 State & Safety Matrix",
    status: "current",
    role: "visual-qa-ledger",
    frameName: "04 State & Safety Matrix",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records risk boundaries and safe-data rules",
      "Keeps production and credential hard stops visible"
    ]
  },
  {
    name: "05 GCC-103 Review Addendum / 1600x1024",
    status: "current",
    role: "visual-qa-ledger",
    frameName: "05 GCC-103 Review Addendum / 1600x1024",
    frameSize: "1600x1024",
    mapsToPages: ["dashboard", "portalRequests", "usageMonitor"],
    acceptance: [
      "Records Figma mirror, DOM contract, Browser viewport, and validation-command evidence",
      "Keeps review deltas visible until resolved"
    ]
  }
];

export const ADMIN_FIGMA_REQUIRED_PAGE_NAMES = ADMIN_FIGMA_MIRROR_PAGES.map((page) => page.name);

export const ADMIN_FIGMA_WRITE_ACCESS_CHECK = {
  checkedAt: "2026-06-21",
  status: "ready",
  attemptedOperation: "Read canonical handoff metadata, execute use_figma, and write a shared-plugin-data probe",
  connectorReportedSeat: "Dev / developer",
  userReportedAccess: "User reported Full access in Figma UI.",
  desktopEvidence: "Figma Desktop opens the canonical multi-page GlobalCircle AI Admin UI Handoff file; Share shows a Full-seat upgrade prompt and must not be continued by automation.",
  sourceFileMismatch: "Previous recorded file key resolved to a one-page Requirements Map; the canonical handoff file is the multi-frame oZuKNtGPhP6oOQ0MSzpfvn file.",
  diagnosticResult: "get_metadata can read the canonical handoff file, use_figma can execute, and a shared plugin data write probe succeeded.",
  connectorMessage: "use_figma succeeded on page 0:1 with adminos.mcpWriteProbe.",
  nextStep: "Use the canonical handoff file for future Figma mirror and visual QA work. Avoid Share or seat/billing prompts unless the operator explicitly approves that action."
} as const;

export const ADMIN_VISUAL_QA_AXES = [
  "figma-mirror",
  "dom-contract",
  "browser-desktop",
  "browser-mobile",
  "style-token-regression",
  "safe-data-boundary"
] as const;
