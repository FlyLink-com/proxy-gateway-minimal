import { pageContexts, pageTitles, type AdminPage } from "../../app/navigation";
import { type AdminLanguagePack } from "./types";

const pageStatus: Record<AdminPage, string> = {
  dashboard: "Summary and routing",
  portalRequests: "Decision owner",
  usageMonitor: "Evidence owner"
};

const searchPlaceholders: Record<AdminPage, string> = {
  dashboard: "Search accounts, orders, channels, cases",
  portalRequests: "Search accounts, orders, resources, quota",
  usageMonitor: "Search usage, channels, receipts, anomalies"
};

export const adminEnUSLanguagePack: AdminLanguagePack = {
  id: "en",
  label: "English",
  nativeName: "English",
  tag: "en-US",
  shell: {
    locale: "en",
    htmlLang: "en-US",
    sidebar: {
      brandSubtitle: "Proxy Gateway Admin",
      groups: {
        overview: "Overview",
        "platform-monitoring": "Platform Monitoring",
        "user-supervision": "User Operations"
      },
      plannedGateAriaSuffix: "planned gate",
      plannedGateLabel: "Gate",
      routeSuffix: "routes",
      routes: pageTitles,
      safetyDescription: "No token, URL, credential, runtime config, or raw customer data in Admin UI fixtures.",
      safetyDetail: "Production actions require an approved runbook.",
      safetyTitle: "Risk A gated",
      workspaceAriaLabel: "Workspace sidebar"
    },
    topBar: {
      accountAriaLabel: "Operator account",
      accountControlsLabel: "Operator account controls",
      accountName: "operator",
      accountPopoverDescription: "Production supervision only.",
      accountPopoverGate: "Runtime changes require a Risk A gate.",
      accountRole: "Production read-only",
      contexts: {
        dashboard: pageContexts.dashboard.eyebrow,
        portalRequests: pageContexts.portalRequests.eyebrow,
        usageMonitor: pageContexts.usageMonitor.eyebrow
      },
      languageLabel: "Admin language",
      languageOptions: {
        en: { ariaLabel: "Switch Admin language to English", label: "EN" },
        zh: { ariaLabel: "Switch Admin language to Chinese", label: "中" }
      },
      pageStatus,
      pageTitles,
      riskGateLabel: "Risk A gated",
      searchAriaLabel: "Search Admin Console",
      searchLabel: "Search accounts, orders, channels, cases",
      searchPlaceholders
    }
  }
};
