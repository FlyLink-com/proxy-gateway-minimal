import { type AdminLanguagePack } from "./types";

export const adminEnUSLanguagePack: AdminLanguagePack = {
  id: "en",
  label: "English",
  nativeName: "English",
  tag: "en-US",
  shell: {
    locale: "en",
    htmlLang: "en-US",
    login: {
      auth: {
        accountIdLabel: "Account ID",
        accountPasswordLabel: "Account password",
        adminIdLabel: "Admin ID",
        adminPasswordLabel: "Password",
        adminSetupKeyLabel: "Administrator setup key",
        approvedAdminIdPlaceholder: "Approved admin ID",
        approvedPortalAccountIdPlaceholder: "Approved portal account ID",
        authenticatorCodeLabel: "Authenticator code",
        authenticatorEnrollmentFormLabel: "Authenticator enrollment step",
        authenticatorSetupButton: "Start authenticator setup",
        authenticatorSetupTitle: "Account authenticator setup",
        authenticatorVerificationTitle: "Google Authenticator Verification",
        checkingPasswordLabel: "Checking password",
        confirmAuthenticatorButton: "Confirm authenticator",
        confirmAuthenticatorFormLabel: "Confirm Google Authenticator setup",
        firstAdminSetupButton: "Start administrator setup",
        firstAdminSetupTitle: "First administrator setup",
        fallbackError: "Admin protected auth failed.",
        issuerLabel: "Issuer",
        loginButton: "Log in",
        manualKeyLabel: "Manual key",
        operatorLabel: "Operator",
        passwordFormLabel: "Protected Admin password step",
        portalAccountLoginTitle: "Portal account login",
        protectedAdminLoginTitle: "Admin account login",
        sixDigitCodeLabel: "6-digit verification code",
        verifyAndOpenAdminButton: "Verify and open Admin",
        verifyAuthenticatorFormLabel: "Verify Google Authenticator code"
      },
      brandSubtitle: "Operator Console",
      panelAriaLabel: "Protected Admin login form",
      previewSite: "Preview public site",
      title: "Admin Login"
    },
    pageFrame: {
      emptyWorkbenchDescription: "System search can route to available page-owned sections after the page contract exposes them.",
      emptyWorkbenchTitle: "No page panels are available.",
      evidenceSurfacesSuffix: "evidence surfaces",
      modeLabels: {
        owner: "Owner",
        preview: "Preview"
      },
      moduleLayoutSuffix: "module layout",
      pageDescriptions: {
        dashboard: "Health, risk routing, and next action only; detail ledgers stay on owner pages."
      },
      pageHeaderAriaLabels: {
        dashboard: "Operations Overview page header",
        portalRequests: "Accounts & Resources page header",
        usageMonitor: "Usage & Channels page header",
        userManagement: "User Management page header",
        orderManagement: "Order Records page header",
        nodeHealth: "Node Health page header",
        nodeBandwidth: "Node Bandwidth page header",
        userAccessLogs: "User Access Logs page header",
        userOperationLogs: "User Operation Logs page header",
        nodeLogs: "Node Logs page header"
      },
      sections: {
        dashboard: {
          "health-summary": {
            label: "Health Summary",
            description: "Dashboard summary for platform health, risk, freshness, and channel coverage."
          },
          "risk-queue": {
            label: "Risk Queue",
            description: "Cross-account, order, usage, and channel review entry."
          },
          "next-actions": {
            label: "Next Actions",
            description: "Route operators to the page that owns the detailed collection."
          },
          "review-candidates": {
            label: "Review Candidates",
            description: "Bounded review candidates with owner-route signals and safe refs."
          }
        },
        portalRequests: {
          "account-overview": {
            label: "Account Directory",
            description: "Safe account refs, resource counts, risk state, and recent activity."
          },
          "resource-orders": {
            label: "Resources & Orders",
            description: "Orders, resources, entitlements, subscription artifacts, and delivery lifecycle."
          },
          "quota-usage": {
            label: "Quota & Usage",
            description: "Default quota, edited quota, total usage, collection coverage, quota risk, and review state."
          },
          lifecycle: {
            label: "Lifecycle",
            description: "Account disablement, order pause, expiry, revocation, and archive candidates."
          },
          "history-events": {
            label: "History & Events",
            description: "Object history, case candidates, and future restricted-event entry."
          }
        },
        usageMonitor: {
          freshness: {
            label: "Collection Freshness",
            description: "Generated time, delay threshold, unknown states, and collection trust."
          },
          "channel-coverage": {
            label: "Channel Coverage",
            description: "Issued channels, measured channels, missing channels, and receipt blockers."
          },
          "usage-ledger": {
            label: "Usage Ledger",
            description: "Safe ledger for accounts, orders, channels, and measured usage."
          },
          "collection-anomalies": {
            label: "Collection Anomalies",
            description: "Collection delay, true zero usage, not collected, disabled collector, and missing receipt candidates."
          },
          "receipts-collectors": {
            label: "Receipts & Collectors",
            description: "Receipt state, collector availability, and future safe diagnostics entry."
          }
        }
      },
      sectionsSuffix: "sections",
      summaryMetricsSuffix: "summary metrics"
    },
    sidebar: {
      brandSubtitle: "Proxy Gateway",
      groups: {
        "logs-audit": "Logs & Audit",
        management: "Management",
        monitoring: "Monitoring"
      },
      plannedGateAriaSuffix: "planned gate",
      plannedGateLabel: "Gate",
      plannedRoutesAriaLabel: "Planned workspace routes",
      primaryRoutesAriaLabel: "Primary workspace routes",
      routeSuffix: "routes",
      routes: {
        dashboard: "Operations Overview",
        portalRequests: "Accounts & Resources",
        usageMonitor: "Usage & Channels",
        userManagement: "User Management",
        orderManagement: "Order Records",
        nodeHealth: "Node Health",
        nodeBandwidth: "Node Bandwidth",
        userAccessLogs: "User Access Logs",
        userOperationLogs: "User Operation Logs",
        nodeLogs: "Node Logs"
      },
      safetyDescription: "No token, URL, credential, runtime config, or raw customer data in Admin UI fixtures.",
      safetyDetail: "Production actions require an approved runbook.",
      safetyTitle: "Risk A gated",
      workspaceAriaLabel: "Workspace sidebar",
      workspaceNavigationAriaLabel: "Workspace navigation"
    },
    topBar: {
      accountAriaLabel: "Operator account",
      accountControlsLabel: "Operator account controls",
      accountName: "Operator",
      accountPopoverDescription: "Production supervision only.",
      accountPopoverGate: "Runtime changes require a Risk A gate.",
      accountRole: "Safe review",
      contexts: {
        dashboard: "Monitoring",
        portalRequests: "Monitoring",
        usageMonitor: "Monitoring",
        userManagement: "Management",
        orderManagement: "Management",
        nodeHealth: "Management",
        nodeBandwidth: "Management",
        userAccessLogs: "Logs & Audit",
        userOperationLogs: "Logs & Audit",
        nodeLogs: "Logs & Audit"
      },
      languageLabel: "Admin language",
      languageOptions: {
        en: { ariaLabel: "Switch admin language to English", label: "EN" },
        zh: { ariaLabel: "Switch admin language to Chinese", label: "中" }
      },
      pageStatus: {
        dashboard: "Operations",
        portalRequests: "Accounts",
        usageMonitor: "Usage",
        userManagement: "Users",
        orderManagement: "Records",
        nodeHealth: "Node Health",
        nodeBandwidth: "Bandwidth",
        userAccessLogs: "Access Logs",
        userOperationLogs: "Operation Logs",
        nodeLogs: "Node Logs"
      },
      pageTitles: {
        dashboard: "Operations Overview",
        portalRequests: "Accounts & Resources",
        usageMonitor: "Usage & Channels",
        userManagement: "User Management",
        orderManagement: "Order Records",
        nodeHealth: "Node Health",
        nodeBandwidth: "Node Bandwidth",
        userAccessLogs: "User Access Logs",
        userOperationLogs: "User Operation Logs",
        nodeLogs: "Node Logs"
      },
      production: "Production",
      riskGateLabel: "Risk A gate status",
      riskGateTitle: "Risk A gated",
      searchAriaLabel: "Search Admin Console",
      searchLabel: "Search users, orders, channels, cases, or events",
      searchPlaceholders: {
        dashboard: "Search users, orders, channels...",
        portalRequests: "Search accounts, orders, lifecycle...",
        usageMonitor: "Search usage, channels, receipts...",
        userManagement: "Search users, plans, status...",
        orderManagement: "Search orders, account refs, delivery...",
        nodeHealth: "Search nodes, regions, heartbeat...",
        nodeBandwidth: "Search bandwidth, traffic, anomalies...",
        userAccessLogs: "Search user access events...",
        userOperationLogs: "Search operator actions...",
        nodeLogs: "Search redacted node logs..."
      }
    }
  }
};
