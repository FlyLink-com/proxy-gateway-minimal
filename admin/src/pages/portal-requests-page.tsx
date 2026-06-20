import {
  AdminConsolePageFrame,
  type BlueprintPage
} from "./admin-console-page-frame";

export const accountsResourcesBlueprint: BlueprintPage = {
  page: "portalRequests",
  ariaLabel: "Accounts & Resources page header",
  kicker: "User Operations / Accounts & Resources",
  title: "Accounts & Resources",
  description: "Decision owner for user accounts, resources, orders, subscription artifacts, quota, lifecycle, and safe history context.",
  statusLabel: "Decision owner",
  statusTone: "info",
  modules: [
    {
      navId: "account-overview",
      container: {
        category: "management",
        container: "Account directory workspace",
        dataAdapter: "Static design fields now; later safe account index and portal ownership summaries.",
        layoutPolicy: "Page-owned section with filters and drawer later; not draggable outside this page.",
        performanceBoundary: "Large account lists must use paged or virtualized tables before API connection.",
        interactionModel: "Selection and review planning now; create/disable requires later backend contract."
      },
      purpose: "Directory of safe account refs, risk state, resource count, and review state.",
      contentFields: [
        "Account ref · safe id",
        "Account state · enabled / disabled",
        "Resources · linked count",
        "Risk · summary chip",
        "Activity · last safe event"
      ],
      states: [
        "Empty directory",
        "Normal account",
        "Needs review",
        "Disabled account"
      ],
      uiSurface: "account-directory",
      ownership: "Owns account create, enable, disable, and review planning.",
      boundaries: [
        "No customer-private contact data",
        "No raw identity provider payload",
        "No channel collector controls"
      ],
      nextStep: "Connect backend account model before enabling create/disable actions."
    },
    {
      navId: "resource-orders",
      container: {
        category: "management",
        container: "Resource and order table workspace",
        dataAdapter: "Static design fields now; later redacted order, entitlement, and artifact summaries.",
        layoutPolicy: "Dense table plus detail drawer; no overview duplication.",
        performanceBoundary: "Rows, filters, and drawers load inside this page container only.",
        interactionModel: "Inspect and plan lifecycle review; no raw subscription output."
      },
      purpose: "Group resources, orders, entitlements, and subscription artifact safe refs under the owning account.",
      contentFields: [
        "Order ref · safe id",
        "Plan · entitlement state",
        "Artifact · safe ref presence",
        "Delivery · current state",
        "Channels · safe refs only"
      ],
      states: [
        "Pending review",
        "Pending delivery",
        "Delivered",
        "Expired or revoked"
      ],
      uiSurface: "resource-orders",
      ownership: "Owns resource/order lifecycle and artifact lifecycle review.",
      boundaries: [
        "No subscription URL",
        "No credential material",
        "No runtime apply or collector activation"
      ],
      nextStep: "Rebuild the table from the new object model after ownership terms are frozen."
    },
    {
      navId: "quota-usage",
      container: {
        category: "configuration",
        container: "Quota policy panel",
        dataAdapter: "Static quota fields now; later existing traffic-limit update API plus audit-note contract.",
        layoutPolicy: "Config panel with preview and reset controls later; not a monitoring ledger.",
        performanceBoundary: "Quota calculations remain derived from supplied summaries, not repeated polling.",
        interactionModel: "Review policy and prepare edit; save action waits for audit gate."
      },
      purpose: "Own quota policy decisions while using usage collection only as evidence.",
      contentFields: [
        "Default quota · policy value",
        "Edited quota · review value",
        "Usage · used / total",
        "Measured channels · count",
        "Audit note · required gate"
      ],
      states: [
        "Within quota",
        "Near quota",
        "Over limit",
        "Unmetered or collection gap"
      ],
      uiSurface: "quota-usage",
      ownership: "Owns quota policy, over-limit disposition, and quota-change review.",
      boundaries: [
        "No collector trust decision",
        "No channel coverage diagnosis",
        "No order pause/archive without later backend gate"
      ],
      nextStep: "Reconnect quota editor only after audit note and backend update contract are reviewed."
    },
    {
      navId: "lifecycle",
      container: {
        category: "management",
        container: "Lifecycle review panel",
        dataAdapter: "Static lifecycle taxonomy now; later account, order, artifact, expiry, and archive summaries.",
        layoutPolicy: "Structured review lanes; execution controls stay disabled until backend gates exist.",
        performanceBoundary: "Lifecycle state is loaded per selected object rather than across every row.",
        interactionModel: "Review and dry-run planning only before approved mutation flows."
      },
      purpose: "Plan account, order, artifact, expiry, revocation, pause, and archive states in one owner page.",
      contentFields: [
        "Account · lifecycle state",
        "Order · pause / expiry candidate",
        "Artifact · revoked state",
        "Archive · candidate state",
        "Evidence · required source"
      ],
      states: [
        "Active",
        "Paused",
        "Expired",
        "Revoked",
        "Archive candidate"
      ],
      uiSurface: "lifecycle-review",
      ownership: "Owns lifecycle decisions, but execution remains gated by backend contracts and runbooks.",
      boundaries: [
        "No direct production mutation",
        "No runtime service control",
        "No durable case closure"
      ],
      nextStep: "Split lifecycle decisions into read-only review, dry-run preview, and approved mutation phases."
    },
    {
      navId: "history-events",
      container: {
        category: "audit-workflow",
        container: "Computed history preview",
        dataAdapter: "Static event slots now; later durable audit and case-history adapter.",
        layoutPolicy: "Preview section until Audit & Cases owns durable history.",
        performanceBoundary: "Timeline content stays lazy and bounded until durable history exists.",
        interactionModel: "Read-only context; no note write or case close actions."
      },
      purpose: "Show safe computed events and case candidates until durable audit and case history exists.",
      contentFields: [
        "Event · safe label",
        "Object · safe ref",
        "Source · owner page",
        "Case · candidate reason",
        "Audit · future entry slot"
      ],
      states: [
        "No computed events",
        "Context available",
        "Case backend locked",
        "Audit write unavailable"
      ],
      uiSurface: "history-events",
      ownership: "Provides review context for accounts and resources; durable history later moves to Audit & Cases.",
      boundaries: [
        "No raw logs",
        "No raw SQLite row",
        "No note write until durable case backend exists"
      ],
      nextStep: "Hand durable history to Audit & Cases after the case/history backend contract lands."
    }
  ]
};

export function PortalRequestsPage({
  fixturePreviewEnabled = false
}: {
  fixturePreviewEnabled?: boolean;
}) {
  return (
    <AdminConsolePageFrame
      blueprint={accountsResourcesBlueprint}
      fixturePreviewEnabled={fixturePreviewEnabled}
    />
  );
}
