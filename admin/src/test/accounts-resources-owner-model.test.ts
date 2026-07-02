import { describe, expect, test } from "vitest";
import {
  ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA,
  createAccountsResourcesOwnerPageModel,
  findAccountsResourcesOwnerPageModelIssues
} from "../app/accounts-resources-owner-model";
import { ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA } from "../app/admin-safe-read-page-model";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";

describe("accounts resources owner model", () => {
  test("projects the visible Accounts owner sections from the accepted blueprint overview modules", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);

    expect(model.schemaVersion).toBe(ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA);
    expect(model.page).toBe("portalRequests");
    expect(model.visibleSections.map((section) => section.navId)).toEqual([
      "account-overview",
      "resource-orders",
      "lifecycle"
    ]);
    expect(model.allSections.map((section) => section.navId)).toEqual([
      "account-overview",
      "resource-orders",
      "quota-usage",
      "lifecycle",
      "history-events"
    ]);
    expect(model.deferredSections.map((section) => section.navId)).toEqual([
      "quota-usage",
      "history-events"
    ]);
    expect(model.safeReadModel.schemaVersion).toBe(ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA);
    expect(model.safeReadModel.visibleSectionIds).toEqual(model.visibleSections.map((section) => section.navId));
    expect(model.safeReadModel.deferredSectionIds).toEqual(model.deferredSections.map((section) => section.navId));
  });

  test("attaches every visible section to the shared table query-state contract", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);

    model.visibleSections.forEach((section) => {
      expect(section.query.schemaVersion).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
      expect(section.query.page).toBe("portalRequests");
      expect(section.query.navId).toBe(section.navId);
      expect(section.query.routeScope).toBe(`portalRequests#${section.targetId}`);
      expect(section.resultWindow).toEqual({
        firstItem: 1,
        lastItem: section.rows.length,
        pageIndex: 1,
        totalItems: section.rows.length,
        totalPages: 1
      });
    });
  });

  test("keeps account, order, and lifecycle rows safe for display-only rendering", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const accountDirectory = model.visibleSections.find((section) => section.navId === "account-overview");
    const resources = model.visibleSections.find((section) => section.navId === "resource-orders");
    const lifecycle = model.visibleSections.find((section) => section.navId === "lifecycle");

    expect(accountDirectory?.rows).toEqual([
      {
        actionLabel: "Open",
        detail: "Enabled",
        label: "acct_001",
        meta: "",
        statusLabel: "Good",
        tone: "success"
      },
      {
        actionLabel: "Open",
        detail: "Quota review",
        label: "acct_002",
        meta: "",
        statusLabel: "Watch",
        tone: "warning"
      }
    ]);
    expect(resources?.rows.map((row) => row.label)).toEqual(["ord_2048", "ord_2047"]);
    expect(lifecycle?.rows.map((row) => row.label)).toEqual(["sub_8192", "acct_005"]);
    expect(JSON.stringify(model)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
    expect(findAccountsResourcesOwnerPageModelIssues(model)).toEqual([]);
  });

  test("projects Account Directory as a paged table with a safe readonly detail drawer", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const accountDirectory = model.visibleSections.find((section) => section.navId === "account-overview");

    expect(accountDirectory?.table).toMatchObject({
      ariaLabel: "Account Directory table",
      columns: ["Account", "State", "Resources", "Risk", "Activity"],
      pageSize: 2,
      rows: [
        {
          actionLabel: "Open",
          activity: "Enabled",
          label: "acct_001",
          resourceCount: "2",
          risk: "",
          state: "Good",
          tone: "success"
        },
        {
          actionLabel: "Open",
          activity: "Quota review",
          label: "acct_002",
          resourceCount: "2",
          risk: "",
          state: "Watch",
          tone: "warning"
        }
      ]
    });
    expect(accountDirectory?.detailDrawer).toEqual({
      ariaLabel: "Account Directory detail drawer",
      description: "Read-only account context for safe review planning.",
      fields: [
        { label: "Account", value: "acct_001" },
        { label: "State", value: "Good" },
        { label: "Resources", value: "2" },
        { label: "Risk", value: "Unknown" }
      ],
      title: "acct_001",
      tone: "success"
    });
    expect(JSON.stringify(accountDirectory)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
  });

  test("projects Resources & Orders as a paged table with a safe readonly detail drawer", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const resources = model.visibleSections.find((section) => section.navId === "resource-orders");

    expect(resources?.table).toMatchObject({
      ariaLabel: "Resources & Orders table",
      columns: ["Order", "Subscription", "Channel", "State", "Activity"],
      pageSize: 2,
      rows: [
        {
          actionLabel: "Open",
          activity: "",
          channel: "Unknown",
          label: "ord_2048",
          state: "Open",
          subscription: "Unknown",
          tone: "info"
        },
        {
          actionLabel: "Open",
          activity: "",
          channel: "Unknown",
          label: "ord_2047",
          state: "Good",
          subscription: "Unknown",
          tone: "success"
        }
      ]
    });
    expect(resources?.detailDrawer).toEqual({
      ariaLabel: "Resources & Orders detail drawer",
      description: "Read-only order, subscription, and channel context for safe review planning.",
      fields: [
        { label: "Order", value: "ord_2048" },
        { label: "Subscription", value: "Unknown" },
        { label: "Channel", value: "Unknown" },
        { label: "State", value: "Open" }
      ],
      title: "ord_2048",
      tone: "info"
    });
    expect(JSON.stringify(resources)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
  });

  test("projects Lifecycle as a paged table with a safe readonly detail drawer", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const lifecycle = model.visibleSections.find((section) => section.navId === "lifecycle");

    expect(lifecycle?.table).toMatchObject({
      ariaLabel: "Lifecycle table",
      columns: ["Decision", "Account", "Order", "Window", "State"],
      pageSize: 2,
      rows: [
        {
          account: "Unknown",
          actionLabel: "Open",
          activity: "",
          label: "sub_8192",
          order: "Unknown",
          state: "Review",
          tone: "warning",
          window: "Unknown"
        },
        {
          account: "Unknown",
          actionLabel: "Open",
          activity: "",
          label: "acct_005",
          order: "Unknown",
          state: "Watch",
          tone: "warning",
          window: "Unknown"
        }
      ]
    });
    expect(lifecycle?.detailDrawer).toEqual({
      ariaLabel: "Lifecycle detail drawer",
      description: "Read-only lifecycle decision context for safe review planning.",
      fields: [
        { label: "Decision", value: "sub_8192" },
        { label: "Account", value: "Unknown" },
        { label: "Order", value: "Unknown" },
        { label: "State", value: "Review" }
      ],
      title: "sub_8192",
      tone: "warning"
    });
    expect(JSON.stringify(lifecycle)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
  });

  test("projects Quota & Usage as a routed safe readonly policy subpage", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const quota = model.allSections.find((section) => section.navId === "quota-usage");

    expect(model.visibleSections.map((section) => section.navId)).not.toContain("quota-usage");
    expect(quota?.table).toMatchObject({
      ariaLabel: "Quota & Usage table",
      columns: ["Policy", "Account", "Order", "Usage", "State"],
      pageSize: 2,
      rows: [
        {
          account: "user_001",
          actionLabel: "Open",
          activity: "Usage 82%",
          label: "quota_policy",
          order: "ord_2048",
          state: "Near quota",
          tone: "warning",
          usage: "82%"
        },
        {
          account: "user_001",
          actionLabel: "Open",
          activity: "Measured 3/3 channels",
          label: "coverage_gate",
          order: "ord_2048",
          state: "Measured",
          tone: "success",
          usage: "3 / 3"
        }
      ]
    });
    expect(quota?.detailDrawer).toEqual({
      ariaLabel: "Quota & Usage detail drawer",
      description: "Read-only quota policy and usage evidence context for safe review planning.",
      fields: [
        { label: "Policy", value: "quota_policy" },
        { label: "Account", value: "user_001" },
        { label: "Order", value: "ord_2048" },
        { label: "State", value: "Near quota" }
      ],
      title: "quota_policy",
      tone: "warning"
    });
    expect(JSON.stringify(quota)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
  });

  test("projects History & Events as a routed safe readonly history subpage", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const history = model.allSections.find((section) => section.navId === "history-events");

    expect(model.visibleSections.map((section) => section.navId)).not.toContain("history-events");
    expect(history?.table).toMatchObject({
      ariaLabel: "History & Events table",
      columns: ["Event", "Object", "Source", "Case", "State"],
      pageSize: 2,
      rows: [
        {
          actionLabel: "Open",
          activity: "Computed event",
          caseLabel: "Quota review",
          label: "quota_evidence_updated",
          objectRef: "ord_safe_101",
          source: "Usage & Channels",
          state: "Context available",
          tone: "info"
        },
        {
          actionLabel: "Open",
          activity: "Receipt context",
          caseLabel: "Receipt evidence",
          label: "receipt_pending",
          objectRef: "artifact_safe_pending",
          source: "Resources & Orders",
          state: "Case backend locked",
          tone: "warning"
        }
      ]
    });
    expect(history?.detailDrawer).toEqual({
      ariaLabel: "History & Events detail drawer",
      description: "Read-only computed history context; durable case history remains gated.",
      fields: [
        { label: "Event", value: "quota_evidence_updated" },
        { label: "Object", value: "ord_safe_101" },
        { label: "Source", value: "Usage & Channels" },
        { label: "State", value: "Context available" }
      ],
      title: "quota_evidence_updated",
      tone: "info"
    });
  });
});
