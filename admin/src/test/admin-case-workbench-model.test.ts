import { describe, expect, test } from "vitest";
import {
  buildPortalRequestCaseCandidates,
  buildUsageMonitorCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import type {
  PortalAccessRequestSummary,
  SubscriptionUsageMonitorRow
} from "../features/subscriptions/types";
import type { CaseCandidate, CaseSeverity } from "../features/admin-case-workbench/types";

const RAW_REF_OR_SECRET_PATTERN =
  /should[-_ ]?not[-_ ]?render|subscription[-_ ]?url|subscriptionUrl|access[-_ ]?token|api[-_ ]?token|token[-_ ]?(?:ref|value)?|secret[-_ ]?(?:ref|value)?|password[-_ ]?(?:ref|value)?|private[-_ ]?(?:key|credential|material|ref|value)?|raw[-_ ]?(?:config|credential|material|secret|sqlite|row|ref|value)?|credential[-_ ]?(?:material|secret|value)/i;

describe("admin case workbench model", () => {
  test("derives safe portal request case candidates without exposing artifacts or operators", () => {
    const cases = buildPortalRequestCaseCandidates([
      portalRequestFixture({
        id: "order_safe_over_limit",
        portalUserRef: "portal_user_safe",
        status: "delivered",
        accessGrantRef: "artifactref_should_not_render",
        reviewedByRef: "operator_should_not_render",
        usage: {
          uploadBytes: 800,
          downloadBytes: 500,
          usedBytes: 1300,
          totalBytes: 1000,
          usageRatio: 1.3,
          status: "over_limit",
          collectionStatus: "measured",
          channelCount: 2,
          measuredChannelCount: 2,
          updatedAt: "2026-06-05T09:00:00.000Z"
        }
      }),
      portalRequestFixture({
        id: "order_safe_delivery",
        status: "approved_pending_delivery",
        updatedAt: "2026-06-05T10:00:00.000Z"
      })
    ]);

    expect(cases.map((item) => item.reasonCode)).toEqual(["over_limit", "order_pending_delivery"]);
    expect(cases[0]).toMatchObject({
      caseRef: "case_candidate:portal:order_safe_over_limit:over_limit",
      title: "Order traffic over limit",
      objectType: "order",
      objectRef: "order_safe_over_limit",
      status: "Pending review",
      severity: "critical",
      gateRequired: true,
      source: "portal_access_requests"
    });
    expect(cases[0].linkedObjects).toEqual([
      {
        relationType: "owns",
        objectType: "account",
        objectRef: "portal_user_safe",
        label: "User account"
      },
      {
        relationType: "about",
        objectType: "order",
        objectRef: "order_safe_over_limit",
        label: "Resource order"
      }
    ]);
    expect(cases[0].timeline.map((event) => event.category)).toContain("usage_collection");
    expect(JSON.stringify(cases)).not.toMatch(RAW_REF_OR_SECRET_PATTERN);
  });

  test("derives all phase-one portal request reasons", () => {
    const cases = buildPortalRequestCaseCandidates([
      portalRequestFixture({
        id: "order_stale",
        usage: usageFixture({ collectionStatus: "stale" })
      }),
      portalRequestFixture({
        id: "order_collector_disabled",
        usage: usageFixture({ collectionStatus: "collector_disabled" })
      }),
      portalRequestFixture({
        id: "order_not_collected",
        usage: usageFixture({ collectionStatus: "not_collected" })
      }),
      portalRequestFixture({
        id: "order_zero",
        usage: usageFixture({ collectionStatus: "measured_zero", status: "within_limit", usedBytes: 0 })
      }),
      portalRequestFixture({
        id: "order_review",
        status: "pending_admin_review"
      }),
      portalRequestFixture({
        id: "order_expired",
        status: "expired"
      }),
      portalRequestFixture({
        id: "order_cancelled",
        status: "cancelled"
      })
    ]);

    expect(new Set(cases.map((item) => item.reasonCode))).toEqual(new Set([
      "usage_stale",
      "collector_disabled",
      "not_collected",
      "usage_zero",
      "order_pending_review",
      "expiry_candidate",
      "archive_candidate"
    ]));
  });

  test("derives usage monitor cases in priority order without tenant or artifact linked objects", () => {
    const cases = buildUsageMonitorCaseCandidates([
      monitorRowFixture({
        issuanceRequestId: "order_stale",
        collectionStatus: "stale",
        usageStatus: "not_collected",
        lastUsageObservedAt: "2026-06-01T00:00:00.000Z"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_over",
        usedBytes: 1200,
        trafficLimitBytes: 1000,
        usageStatus: "measured",
        collectionStatus: "measured",
        lastUsageObservedAt: "2026-06-05T10:00:00.000Z"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_missing_receipt",
        tenantRef: "tenantref_should_not_render",
        artifactRef: "artifactref_should_not_render",
        warnings: ["operator_should_not_render"],
        edgeCredentialBindings: [
          {
            channelRef: "channel_safe_1",
            credentialRefPresent: false,
            materialDigestPresent: false,
            usageMeasured: false
          }
        ]
      })
    ]);

    expect(cases.map((item) => item.reasonCode)).toEqual([
      "over_limit",
      "usage_stale",
      "receipt_missing"
    ]);
    expect(cases.map((item) => item.objectRef)).toEqual([
      "order_over",
      "order_stale",
      "order_missing_receipt"
    ]);
    expect(cases.flatMap((item) => item.linkedObjects.map((object) => object.objectRef))).not.toContain(
      "tenant_safe_default"
    );
    expect(cases.flatMap((item) => item.linkedObjects.map((object) => object.objectRef))).not.toContain(
      "artifact_safe_default"
    );
    expect(JSON.stringify(cases)).not.toMatch(RAW_REF_OR_SECRET_PATTERN);
  });

  test("derives all phase-one usage monitor reasons", () => {
    const cases = buildUsageMonitorCaseCandidates([
      monitorRowFixture({
        issuanceRequestId: "order_near",
        usedBytes: 850,
        trafficLimitBytes: 1000,
        usageStatus: "measured",
        collectionStatus: "measured"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_disabled",
        collectionStatus: "collector_disabled"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_not_collected",
        collectionStatus: "not_collected"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_zero",
        collectionStatus: "measured_zero",
        usageStatus: "measured_zero",
        usedBytes: 0
      }),
      monitorRowFixture({
        issuanceRequestId: "order_expired",
        validUntil: "2026-06-01T00:00:00.000Z"
      })
    ], { nowMs: Date.parse("2026-06-15T00:00:00.000Z") });

    expect(new Set(cases.map((item) => item.reasonCode))).toEqual(new Set([
      "near_limit",
      "collector_disabled",
      "not_collected",
      "usage_zero",
      "expiry_candidate"
    ]));
  });

  test("derives expiry candidates with injected time and keeps safe refs allowed by redaction guard", () => {
    const cases = buildUsageMonitorCaseCandidates([
      monitorRowFixture({
        issuanceRequestId: "order_future",
        validUntil: "2026-06-20T00:00:00.000Z",
        collectionStatus: "measured",
        usageStatus: "measured"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_expired_fixed_now",
        validUntil: "2026-06-10T00:00:00.000Z",
        collectionStatus: "measured",
        usageStatus: "measured"
      })
    ], { nowMs: Date.parse("2026-06-15T00:00:00.000Z") });

    expect(cases.map((item) => item.caseRef)).toEqual([
      "case_candidate:usage:order_expired_fixed_now:expiry_candidate"
    ]);
    expect("tenant_safe_default").not.toMatch(RAW_REF_OR_SECRET_PATTERN);
    expect("artifact_safe_default").not.toMatch(RAW_REF_OR_SECRET_PATTERN);
    expect("operator_safe_default").not.toMatch(RAW_REF_OR_SECRET_PATTERN);
    expect("artifactref_should_not_render").toMatch(RAW_REF_OR_SECRET_PATTERN);
    expect("rawCredentialMaterial").toMatch(RAW_REF_OR_SECRET_PATTERN);
  });

  test("does not derive expiry candidates before the injected current time reaches validUntil", () => {
    const cases = buildUsageMonitorCaseCandidates([
      monitorRowFixture({
        issuanceRequestId: "order_not_expired_at_fixed_now",
        validUntil: "2026-06-10T00:00:00.000Z",
        collectionStatus: "measured",
        usageStatus: "measured"
      })
    ], { nowMs: Date.parse("2026-06-01T00:00:00.000Z") });

    expect(cases).toEqual([]);
  });

  test("topCaseCandidates merges and limits by severity then update time then case reference", () => {
    const items = topCaseCandidates([
      caseFixture("case_warning_old", "warning", "2026-06-05T08:00:00.000Z"),
      caseFixture("case_critical", "critical", "2026-06-05T07:00:00.000Z"),
      caseFixture("case_warning_new_b", "warning", "2026-06-05T09:00:00.000Z"),
      caseFixture("case_warning_new_a", "warning", "2026-06-05T09:00:00.000Z")
    ], 3);

    expect(items.map((item) => item.caseRef)).toEqual([
      "case_critical",
      "case_warning_new_a",
      "case_warning_new_b"
    ]);
  });
});

function usageFixture(
  overrides: Partial<PortalAccessRequestSummary["usage"]> = {}
): NonNullable<PortalAccessRequestSummary["usage"]> {
  return {
    uploadBytes: 0,
    downloadBytes: 0,
    usedBytes: 0,
    totalBytes: 1000,
    usageRatio: 0,
    status: "within_limit",
    collectionStatus: "measured",
    channelCount: 1,
    measuredChannelCount: 1,
    updatedAt: "2026-06-05T09:00:00.000Z",
    ...overrides
  };
}

function portalRequestFixture(overrides: Partial<PortalAccessRequestSummary> = {}): PortalAccessRequestSummary {
  return {
    id: "order_safe_default",
    type: "portal_access_request_summary",
    portalUserRef: "portal_user_default",
    plan: "monthly",
    planLabel: "月度资源",
    durationDays: 30,
    status: "delivered",
    nextAction: "monitor_resource",
    submittedAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T08:15:00.000Z",
    reviewedAt: "2026-06-05T08:10:00.000Z",
    reviewedByRef: "operator_safe_default",
    safeReasonCode: "approved",
    priorTrialState: "unused",
    trafficLimitBytes: 1000,
    entitlementRef: "entitlement_safe_default",
    accessGrantRef: "artifact_safe_default",
    safety: {
      noSubscriptionUrl: true,
      noRawCustomerData: true,
      noRawHandoffMaterial: true,
      noEntitlementCreated: false,
      noRuntimeMutation: true,
      noProductionMutation: true
    },
    ...overrides
  };
}

function monitorRowFixture(overrides: Partial<SubscriptionUsageMonitorRow> = {}): SubscriptionUsageMonitorRow {
  return {
    accountId: "acct_safe_default",
    portalUserRef: "portal_user_default",
    issuanceRequestId: "order_safe_default",
    entitlementId: "entitlement_safe_default",
    plan: "monthly",
    quantity: 1,
    nodeId: "channel_safe_default",
    issuedChannels: ["channel_safe_default"],
    tenantRef: "tenant_safe_default",
    artifactRef: "artifact_safe_default",
    linkStatus: "active",
    tenantStatus: "active",
    artifactStatus: "seen",
    validUntil: "2026-07-05T08:00:00.000Z",
    tenantExpiresAt: "2026-07-05T08:00:00.000Z",
    lastRefreshAt: "2026-06-05T07:55:00.000Z",
    artifactFirstSeenAt: "2026-06-01T08:00:00.000Z",
    artifactLastSeenAt: "2026-06-05T07:55:00.000Z",
    refreshCount: 3,
    trafficLimitBytes: 1000,
    usedBytes: 0,
    uploadBytes: 0,
    downloadBytes: 0,
    usageStatus: "not_collected",
    collectionStatus: "not_collected",
    usageMeasured: false,
    lastUsageObservedAt: null,
    edgeCredentialBindings: [
      {
        channelRef: "channel_safe_default",
        credentialRefPresent: true,
        materialDigestPresent: true,
        usageMeasured: false
      }
    ],
    channelUsages: [],
    activityLevel: "seen",
    warnings: [],
    ...overrides
  };
}

function caseFixture(caseRef: string, severity: CaseSeverity, updatedAt: string): CaseCandidate {
  return {
    caseRef,
    title: caseRef,
    objectType: "order",
    objectRef: caseRef,
    status: "Pending review",
    severity,
    reasonCode: "not_collected",
    source: "dashboard_summary",
    gateRequired: false,
    createdAt: updatedAt,
    updatedAt,
    linkedObjects: [],
    timeline: []
  };
}
