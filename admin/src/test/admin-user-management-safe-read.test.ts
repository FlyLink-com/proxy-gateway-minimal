import { describe, expect, test } from "vitest";
import {
  createUserManagementPageConfigFromAccountSummaries,
  findUserManagementSafeReadIssues
} from "../app/admin-user-management-safe-read";

const baseAccount = {
  createdAt: "2026-05-26T10:00:00.000Z",
  displayName: "Acme Ops",
  email: "ops@example.com",
  entitlementCount: 2,
  id: "acct_001",
  leadId: "lead_001",
  organization: "Acme Research",
  status: "active",
  type: "platform_account_summary",
  updatedAt: "2026-05-26T10:15:00.000Z",
  usableEntitlementCount: 1
} as const;

describe("admin user management safe-read adapter", () => {
  test("maps platform account summaries into redacted user management rows", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [baseAccount],
      entitlements: [
        {
          accountId: "acct_001",
          createdAt: "2026-05-26T10:00:00.000Z",
          id: "ent_001",
          plan: "Pilot",
          quota: { seats: 3, trafficGb: 100 },
          status: "active",
          type: "platform_entitlement_summary",
          updatedAt: "2026-05-26T10:15:00.000Z",
          usable: true,
          validUntil: "2026-06-26T00:00:00.000Z"
        }
      ]
    });

    expect(config.pagination.displayTotalRows).toBe(1);
    expect(config.rows[0]).toMatchObject({
      createdDate: "2026-05-26",
      displayName: "Acme Ops",
      email: "[REDACTED_EMAIL]",
      id: "user_management_acct_001",
      lastAccess: "2026-05-26 10:15",
      plan: "Pilot",
      risk: "Low",
      riskTone: "info",
      status: "Active",
      statusTone: "success",
      userId: "acct_001"
    });
    expect(config.rows[0]?.detail.fields).toEqual(expect.arrayContaining([
      { label: "User ID", value: "acct_001" },
      { label: "Email", value: "[REDACTED_EMAIL]" },
      { label: "Entitlements", value: "2 total / 1 usable" }
    ]));
    expect(findUserManagementSafeReadIssues(config)).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/ops@example\.com|token|secret|password|credential|subscriptionUrl|sqlite|raw log/i);
  });

  test("declares the User Management CRUD workflow as gated business actions", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [baseAccount]
    });

    expect(config.actionGates.map((gate) => gate.operation)).toEqual([
      "read",
      "create",
      "update",
      "disable",
      "delete"
    ]);
    expect(config.actionGates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "read-user-detail",
        label: "Read User Detail",
        operation: "read",
        state: "available"
      }),
      expect.objectContaining({
        disabledReason: expect.stringContaining("dry-run"),
        id: "create-user",
        label: "Create User · Gated",
        operation: "create",
        riskTier: "A"
      }),
      expect.objectContaining({
        id: "edit-user",
        label: "Edit User · Dry-run",
        operation: "update",
        state: "dry-run"
      }),
      expect.objectContaining({
        id: "disable-user",
        label: "Disable User · Dry-run",
        operation: "disable",
        state: "dry-run"
      }),
      expect.objectContaining({
        disabledReason: expect.stringContaining("Hard delete"),
        id: "delete-user",
        label: "Delete User · Dry-run",
        operation: "delete",
        state: "dry-run",
        riskTier: "A"
      })
    ]));
    expect(config.actionGates.flatMap((gate) => gate.evidenceFields)).toEqual(expect.arrayContaining([
      "safe user ref",
      "status",
      "plan",
      "current subscription",
      "usage summary"
    ]));
    expect(JSON.stringify(config.actionGates)).not.toMatch(/token|secret|password|credential|subscriptionUrl|sqlite|raw log/i);
  });

  test("sanitizes unsafe account text before it reaches the user table", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [
        {
          ...baseAccount,
          displayName: "http://internal.example/token=secret",
          email: "admin@example.com",
          id: "acct unsafe/002",
          organization: "sqlite row with credential payload",
          status: "pending_review",
          updatedAt: null,
          usableEntitlementCount: 0
        }
      ]
    });

    expect(config.rows[0]).toMatchObject({
      displayName: "acct_unsafe_002",
      email: "[REDACTED_EMAIL]",
      id: "user_management_acct_unsafe_002",
      lastAccess: "Not observed",
      plan: "No Plan",
      risk: "Medium",
      status: "Pending",
      userId: "acct_unsafe_002"
    });
    expect(findUserManagementSafeReadIssues(config)).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/admin@example\.com|internal\.example|token=|secret|credential|sqlite/i);
  });

  test("filters user rows by safe query fields only", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [
        baseAccount,
        {
          ...baseAccount,
          displayName: "Beta Review",
          email: "beta@example.com",
          entitlementCount: 0,
          id: "acct_002",
          status: "pending_review",
          usableEntitlementCount: 0
        },
        {
          ...baseAccount,
          displayName: "Gamma Team",
          email: "gamma@example.com",
          id: "acct_003",
          status: "active"
        }
      ],
      entitlements: [
        {
          accountId: "acct_001",
          id: "ent_001",
          plan: "Pilot",
          status: "active",
          type: "platform_entitlement_summary",
          usable: true
        },
        {
          accountId: "acct_003",
          id: "ent_003",
          plan: "Team",
          status: "active",
          type: "platform_entitlement_summary",
          usable: true
        }
      ],
      query: {
        plan: "No Plan",
        risk: "Medium",
        search: "Beta",
        status: "Pending"
      }
    });

    expect(config.pagination.displayTotalRows).toBe(1);
    expect(config.rows.map((row) => row.userId)).toEqual(["acct_002"]);
    expect(JSON.stringify(config)).not.toMatch(/beta@example\.com|gamma@example\.com/i);
  });

  test("drops unsafe query text before filtering user rows", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [baseAccount],
      query: {
        search: "https://internal.example/sub?token=secret"
      }
    });

    expect(config.rows.map((row) => row.userId)).toEqual(["acct_001"]);
    expect(findUserManagementSafeReadIssues(config)).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/internal\.example|token=|secret/i);
  });

  test("adds account-level order and usage summaries without exposing order internals", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [baseAccount],
      entitlements: [
        {
          accountId: "acct_001",
          id: "ent_001",
          plan: "Pilot",
          status: "active",
          type: "platform_entitlement_summary",
          usable: true
        }
      ],
      usageRows: [
        {
          accountId: "acct_001",
          activityLevel: "active_recently",
          artifactRef: "artifact_safe_001",
          artifactStatus: "active",
          channelUsages: [{ channelRef: "chan_secret_internal", downloadBytes: 10, lastObservedAt: null, uploadBytes: 5, usedBytes: 15 }],
          collectionStatus: "measured",
          downloadBytes: 1024 ** 3 * 2,
          edgeCredentialBindings: [{
            channelRef: "chan_secret_internal",
            credentialRefPresent: true,
            materialDigestPresent: true,
            usageMeasured: true
          }],
          entitlementId: "ent_001",
          issuedChannels: ["chan_secret_internal"],
          issuanceRequestId: "ord_hidden_001",
          lastRefreshAt: "2026-05-26T10:30:00.000Z",
          lastUsageObservedAt: "2026-05-26T10:20:00.000Z",
          linkStatus: "active",
          nodeId: "node_hidden_001",
          plan: "Pilot",
          portalUserRef: "acct_001",
          quantity: 1,
          refreshCount: 1,
          tenantRef: "tenant_hidden_001",
          tenantStatus: "active",
          trafficLimitBytes: 1024 ** 3 * 10,
          uploadBytes: 1024 ** 3,
          usageMeasured: true,
          usageStatus: "measured",
          usedBytes: 1024 ** 3 * 3,
          validUntil: "2026-06-26T00:00:00.000Z",
          warnings: []
        },
        {
          accountId: "acct_001",
          activityLevel: "blocked",
          artifactRef: "artifact_hidden_002",
          artifactStatus: "blocked",
          channelUsages: [],
          collectionStatus: "not_collected",
          downloadBytes: 0,
          edgeCredentialBindings: [],
          entitlementId: "ent_001",
          issuedChannels: [],
          issuanceRequestId: "ord_hidden_002",
          lastRefreshAt: null,
          lastUsageObservedAt: null,
          linkStatus: "blocked",
          nodeId: "node_hidden_002",
          plan: "Pilot",
          portalUserRef: "acct_001",
          quantity: 1,
          refreshCount: 0,
          tenantRef: "tenant_hidden_002",
          tenantStatus: "blocked",
          trafficLimitBytes: 1024 ** 3 * 5,
          uploadBytes: 0,
          usageMeasured: false,
          usageStatus: "not_collected",
          usedBytes: 1024 ** 3,
          validUntil: "2026-06-26T00:00:00.000Z",
          warnings: ["blocked"]
        }
      ]
    } as Parameters<typeof createUserManagementPageConfigFromAccountSummaries>[0] & {
      usageRows: unknown[];
    });

    expect(config.rows[0]).toMatchObject({
      risk: "High",
      riskTone: "danger"
    });
    expect(config.rows[0]?.detail.fields).toEqual(expect.arrayContaining([
      { label: "Orders", value: "2 total / 1 active" },
      { label: "Usage", value: "4.0 GB used" },
      { label: "Quota", value: "4.0 / 15.0 GB" },
      { label: "Collection", value: "1 measured / 1 pending" },
      { label: "Warnings", value: "blocked" }
    ]));
    expect(findUserManagementSafeReadIssues(config)).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/ord_hidden|tenant_hidden|node_hidden|chan_secret|edgecred|credential|subscriptionUrl|token|secret/i);
  });

  test("projects current subscription time and usage telemetry for future user models", () => {
    const config = createUserManagementPageConfigFromAccountSummaries({
      accounts: [baseAccount],
      entitlements: [
        {
          accountId: "acct_001",
          createdAt: "2026-05-26T10:00:00.000Z",
          id: "ent_001",
          plan: "Pilot",
          status: "active",
          type: "platform_entitlement_summary",
          updatedAt: "2026-06-20T08:20:00.000Z",
          usable: true,
          validUntil: "2026-07-26T00:00:00.000Z"
        }
      ],
      usageRows: [
        {
          accountId: "acct_001",
          activityLevel: "active_recently",
          artifactRef: "artifact_hidden_003",
          artifactStatus: "active",
          artifactFirstSeenAt: "2026-05-26T10:30:00.000Z",
          artifactLastSeenAt: "2026-06-20T08:10:00.000Z",
          channelUsages: [{ channelRef: "chan_hidden_003", downloadBytes: 1024 ** 3, lastObservedAt: "2026-06-20T08:15:00.000Z", uploadBytes: 1024 ** 3, usedBytes: 1024 ** 3 * 2 }],
          collectionStatus: "measured",
          downloadBytes: 1024 ** 3 * 2.5,
          edgeCredentialBindings: [],
          entitlementId: "ent_001",
          issuedChannels: ["chan_hidden_003"],
          issuanceRequestId: "ord_hidden_003",
          lastRefreshAt: "2026-06-20T08:20:00.000Z",
          lastUsageObservedAt: "2026-06-20T08:15:00.000Z",
          linkStatus: "active",
          nodeId: "node_hidden_003",
          plan: "Pilot",
          portalUserRef: "acct_001",
          quantity: 1,
          refreshCount: 2,
          tenantExpiresAt: "2026-07-26T00:00:00.000Z",
          tenantRef: "tenant_hidden_003",
          tenantStatus: "active",
          trafficLimitBytes: 1024 ** 3 * 20,
          uploadBytes: 1024 ** 3 * 1.5,
          usageMeasured: true,
          usageStatus: "measured",
          usedBytes: 1024 ** 3 * 4,
          validUntil: "2026-07-26T00:00:00.000Z",
          warnings: []
        }
      ]
    } as Parameters<typeof createUserManagementPageConfigFromAccountSummaries>[0] & {
      usageRows: unknown[];
    });

    expect(config.rows[0]?.detail.fields).toEqual(expect.arrayContaining([
      { label: "Current Subscription", value: "Pilot until 2026-07-26" },
      { label: "Subscription Window", value: "2026-05-26 - 2026-07-26" },
      { label: "Usage", value: "4.0 GB used" },
      { label: "Upload / Download", value: "1.5 GB up / 2.5 GB down" },
      { label: "Last Usage", value: "2026-06-20 08:15" }
    ]));
    expect(findUserManagementSafeReadIssues(config)).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(/ord_hidden|tenant_hidden|node_hidden|chan_hidden|artifact_hidden|subscriptionUrl|token|secret|credential|ops@example\.com/i);
  });
});
