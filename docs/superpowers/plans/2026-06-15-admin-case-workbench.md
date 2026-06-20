# Admin Case Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the phase-one Admin case workbench as a read-only supervision layer across `运营总览`, `账号与资源`, and `流量与通道`, backed only by already-safe frontend facts and a separate backend contract audit.

**Architecture:** The first slice is frontend-computed case candidates, not durable cases. Shared model builders convert existing portal request and usage monitor summaries into safe `CaseCandidate` and `ObjectTimelineEvent` view models; shared React primitives render queue, detail, linked objects, timeline, and state surfaces. Backend work in this plan is a read-only contract audit document plus targeted tests to prove current facts and gaps.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Admin CSS, existing Express/server services and Node test runner. No new runtime dependency, no Tailwind dependency, no schema migration, no production mutation.

---

## Risk And Boundary

Risk:

- GCC-53 frontend implementation is B: local Admin UI code, tests, build, and repository-only validation.
- GCC-54 backend contract audit is C while it remains docs-only/read-only. Any durable case table, schema migration, auth model change, production backfill, lifecycle automation, or runtime mutation becomes B/A or A and must be separately gated.

Production/AWS impact: none. Do not touch AWS, Vultr, Aliyun, DNS, Nginx, systemd, firewall, SQLite schema, production runtime, tokens, credentials, subscription URLs, customer-private data, or deployment.

## Source Documents

- `docs/superpowers/specs/2026-06-15-admin-case-workbench-design.md`
- `docs/PROJECT_CONTEXT.md`
- `admin/src/app/navigation.ts`
- `admin/src/pages/dashboard-page.tsx`
- `admin/src/pages/portal-requests-page.tsx`
- `admin/src/pages/subscription-usage-monitor-page.tsx`
- `admin/src/features/subscriptions/types.ts`
- `server/services/platform/portal-access-requests.mjs`
- `server/services/platform/subscription-usage-monitor.mjs`
- `server/services/platform/subscription-control-db.mjs`

## File Structure

Create:

- `admin/src/features/admin-case-workbench/types.ts`
  - Defines case candidate, timeline, linked object, severity, reason, and state types used only by the Admin frontend.
- `admin/src/features/admin-case-workbench/case-candidates.ts`
  - Pure model builders for portal requests and usage monitor rows. This is where derived, phase-one case candidates live.
- `admin/src/features/admin-case-workbench/case-workbench.tsx`
  - Shared presentational primitives: `CaseQueue`, `CaseDetailPanel`, `ObjectTimeline`, `LinkedObjects`, `LifecycleStateBadge`, `EmptyState`, `ErrorState`, `LoadingSkeleton`.
- `admin/src/test/admin-case-workbench-model.test.ts`
  - TDD coverage for model derivation, ordering, safety redaction, and timeline events.
- `admin/src/test/admin-case-workbench-components.test.tsx`
  - TDD coverage for queue/detail/timeline rendering and read-only behavior.
- `docs/ADMIN_CASE_WORKBENCH_BACKEND_CONTRACT_AUDIT.md`
  - GCC-54 read-only backend contract audit and gap map.

Modify:

- `admin/src/pages/dashboard-page.tsx`
  - Add a compact read-only `监管案件摘要` using top case candidates from existing order and usage facts.
- `admin/src/pages/portal-requests-page.tsx`
  - Embed order/account case candidates, linked objects, and selected-order timeline.
- `admin/src/pages/subscription-usage-monitor-page.tsx`
  - Replace page-local anomaly display with the shared case queue/detail model while preserving existing table and chart ownership.
- `admin/src/styles.css`
  - Add workbench classes at the existing Admin UI style layer, using stable responsive dimensions.
- `admin/src/test/admin-dashboard.test.tsx`
  - Assert the dashboard shows case summary without exposing sensitive data.
- `admin/src/test/portal-requests-page.test.tsx`
  - Assert account/order case candidates, detail, timeline, linked safe refs, and read-only behavior.
- `admin/src/test/subscription-usage-monitor.test.tsx`
  - Assert usage/channel anomalies open case detail and remain read-only.

Do not modify navigation in phase one. `admin/src/app/navigation.ts` should keep only `运营总览`, `账号与资源`, and `流量与通道`.

---

### Task 1: Add Case Workbench Model Types

**Files:**

- Create: `admin/src/features/admin-case-workbench/types.ts`
- Test later in: `admin/src/test/admin-case-workbench-model.test.ts`

- [ ] **Step 1: Create frontend-only model types**

Add this file:

```ts
import type {
  PortalAccessRequestSummary,
  SubscriptionUsageMonitorRow
} from "../subscriptions/types";

export type CaseSeverity = "critical" | "warning" | "info" | "neutral";

export type CaseStatus = "待复核" | "处理中" | "需门禁" | "已确认" | "误报" | "已关闭" | "待归档";

export type CaseReasonCode =
  | "over_limit"
  | "near_limit"
  | "usage_zero"
  | "usage_stale"
  | "collector_disabled"
  | "not_collected"
  | "receipt_missing"
  | "expiry_candidate"
  | "archive_candidate"
  | "order_pending_review"
  | "order_pending_delivery";

export type CaseObjectType = "account" | "order" | "artifact" | "channel" | "usage" | "lifecycle";

export type LinkedObject = {
  relationType: string;
  objectType: CaseObjectType;
  objectRef: string;
  label: string;
};

export type ObjectTimelineEvent = {
  eventRef: string;
  category:
    | "account_lifecycle"
    | "order_lifecycle"
    | "entitlement_quota"
    | "artifact_access"
    | "channel_desired_state"
    | "usage_collection"
    | "case_workflow";
  action: string;
  objectType: CaseObjectType;
  objectRef: string;
  occurredAt: string | null;
  source: string;
  summary: string;
  severity: CaseSeverity;
  reasonCode?: CaseReasonCode;
  relatedRefs: string[];
};

export type CaseCandidate = {
  caseRef: string;
  title: string;
  objectType: CaseObjectType;
  objectRef: string;
  status: CaseStatus;
  severity: CaseSeverity;
  reasonCode: CaseReasonCode;
  source: "portal_access_requests" | "subscription_usage_monitor" | "dashboard_summary";
  gateRequired: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  linkedObjects: LinkedObject[];
  timeline: ObjectTimelineEvent[];
};

export type PortalRequestCaseInput = PortalAccessRequestSummary;

export type UsageMonitorCaseInput = SubscriptionUsageMonitorRow;
```

- [ ] **Step 2: Run type-aware Admin tests to confirm the new file is picked up**

Run:

```powershell
npm run admin:test -- admin-case-workbench-model
```

Expected: the filtered test run reports no matching test files or a Vitest filter miss. That is acceptable before Task 2 because the model test file does not exist yet.

- [ ] **Step 3: Commit after Task 2, not now**

Do not commit a types-only change. The first useful checkpoint is after model tests and builders exist.

---

### Task 2: Add Case Candidate Builders With Redaction Tests

**Files:**

- Create: `admin/src/features/admin-case-workbench/case-candidates.ts`
- Create: `admin/src/test/admin-case-workbench-model.test.ts`
- Uses: `admin/src/features/admin-case-workbench/types.ts`

- [ ] **Step 1: Write failing model tests**

Create `admin/src/test/admin-case-workbench-model.test.ts`:

```ts
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
      title: "订单流量已超额",
      objectType: "order",
      objectRef: "order_safe_over_limit",
      status: "待复核",
      severity: "critical",
      gateRequired: true,
      source: "portal_access_requests"
    });
    expect(cases[0].linkedObjects).toEqual([
      {
        relationType: "owns",
        objectType: "account",
        objectRef: "portal_user_safe",
        label: "用户账号"
      },
      {
        relationType: "about",
        objectType: "order",
        objectRef: "order_safe_over_limit",
        label: "资源订单"
      }
    ]);
    expect(cases[0].timeline.map((event) => event.category)).toContain("usage_collection");
    expect(JSON.stringify(cases)).not.toMatch(/artifactref_should_not_render|operator_should_not_render|subscriptionUrl|token|secret|password/i);
  });

  test("derives usage monitor cases in priority order", () => {
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
        collectionStatus: "measured"
      }),
      monitorRowFixture({
        issuanceRequestId: "order_missing_receipt",
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
  });

  test("topCaseCandidates merges and limits by severity then update time", () => {
    const items = topCaseCandidates([
      caseFixture("case_warning_old", "warning", "2026-06-05T08:00:00.000Z"),
      caseFixture("case_critical", "critical", "2026-06-05T07:00:00.000Z"),
      caseFixture("case_warning_new", "warning", "2026-06-05T09:00:00.000Z")
    ], 2);

    expect(items.map((item) => item.caseRef)).toEqual(["case_critical", "case_warning_new"]);
  });
});

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

function caseFixture(caseRef: string, severity: "critical" | "warning" | "info" | "neutral", updatedAt: string) {
  return {
    caseRef,
    title: caseRef,
    objectType: "order" as const,
    objectRef: caseRef,
    status: "待复核" as const,
    severity,
    reasonCode: "not_collected" as const,
    source: "dashboard_summary" as const,
    gateRequired: false,
    createdAt: updatedAt,
    updatedAt,
    linkedObjects: [],
    timeline: []
  };
}
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm run admin:test -- admin-case-workbench-model
```

Expected: FAIL because `../features/admin-case-workbench/case-candidates` does not exist.

- [ ] **Step 3: Implement the model builders**

Create `admin/src/features/admin-case-workbench/case-candidates.ts`:

```ts
import type {
  CaseCandidate,
  CaseReasonCode,
  CaseSeverity,
  LinkedObject,
  ObjectTimelineEvent,
  PortalRequestCaseInput,
  UsageMonitorCaseInput
} from "./types";

const SEVERITY_RANK: Record<CaseSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  neutral: 3
};

export function buildPortalRequestCaseCandidates(items: PortalRequestCaseInput[]): CaseCandidate[] {
  return items
    .flatMap((item) => portalRequestReasons(item).map((reason) => portalRequestCase(item, reason)))
    .sort(compareCases);
}

export function buildUsageMonitorCaseCandidates(items: UsageMonitorCaseInput[]): CaseCandidate[] {
  return items
    .flatMap((item) => usageMonitorReasons(item).map((reason) => usageMonitorCase(item, reason)))
    .sort(compareCases);
}

export function topCaseCandidates(items: CaseCandidate[], limit: number) {
  return [...items].sort(compareCases).slice(0, Math.max(0, limit));
}

function portalRequestReasons(item: PortalRequestCaseInput): CaseReasonCode[] {
  const reasons: CaseReasonCode[] = [];
  if (item.usage?.status === "over_limit") reasons.push("over_limit");
  if (item.usage?.collectionStatus === "stale") reasons.push("usage_stale");
  if (item.usage?.collectionStatus === "collector_disabled") reasons.push("collector_disabled");
  if (item.usage?.collectionStatus === "not_collected") reasons.push("not_collected");
  if (item.usage?.collectionStatus === "measured_zero") reasons.push("usage_zero");
  if (item.status === "pending_admin_review") reasons.push("order_pending_review");
  if (item.status === "approved_pending_delivery") reasons.push("order_pending_delivery");
  if (item.status === "expired") reasons.push("expiry_candidate");
  if (item.status === "revoked" || item.status === "cancelled" || item.status === "rejected") {
    reasons.push("archive_candidate");
  }
  return uniqueReasons(reasons);
}

function usageMonitorReasons(item: UsageMonitorCaseInput): CaseReasonCode[] {
  const reasons: CaseReasonCode[] = [];
  if (item.trafficLimitBytes > 0 && item.usedBytes >= item.trafficLimitBytes) reasons.push("over_limit");
  if (
    item.trafficLimitBytes > 0
    && item.usedBytes >= item.trafficLimitBytes * 0.8
    && item.usedBytes < item.trafficLimitBytes
  ) {
    reasons.push("near_limit");
  }
  if (item.collectionStatus === "stale") reasons.push("usage_stale");
  if (item.collectionStatus === "collector_disabled") reasons.push("collector_disabled");
  if (item.collectionStatus === "not_collected") reasons.push("not_collected");
  if (item.collectionStatus === "measured_zero") reasons.push("usage_zero");
  if (hasUnconfirmedBinding(item)) reasons.push("receipt_missing");
  if (item.validUntil && new Date(item.validUntil).getTime() <= Date.now()) reasons.push("expiry_candidate");
  return uniqueReasons(reasons);
}

function portalRequestCase(item: PortalRequestCaseInput, reasonCode: CaseReasonCode): CaseCandidate {
  return {
    caseRef: `case_candidate:portal:${item.id}:${reasonCode}`,
    title: reasonTitle(reasonCode),
    objectType: "order",
    objectRef: item.id,
    status: "待复核",
    severity: reasonSeverity(reasonCode),
    reasonCode,
    source: "portal_access_requests",
    gateRequired: reasonCode === "over_limit" || reasonCode === "order_pending_delivery",
    createdAt: item.submittedAt,
    updatedAt: item.usage?.updatedAt ?? item.updatedAt,
    linkedObjects: portalLinkedObjects(item),
    timeline: portalTimeline(item, reasonCode)
  };
}

function usageMonitorCase(item: UsageMonitorCaseInput, reasonCode: CaseReasonCode): CaseCandidate {
  return {
    caseRef: `case_candidate:usage:${item.issuanceRequestId}:${reasonCode}`,
    title: reasonTitle(reasonCode),
    objectType: "usage",
    objectRef: item.issuanceRequestId,
    status: "待复核",
    severity: reasonSeverity(reasonCode),
    reasonCode,
    source: "subscription_usage_monitor",
    gateRequired: reasonCode === "over_limit" || reasonCode === "receipt_missing",
    createdAt: item.artifactFirstSeenAt ?? item.lastRefreshAt,
    updatedAt: item.lastUsageObservedAt ?? item.lastRefreshAt,
    linkedObjects: usageLinkedObjects(item),
    timeline: usageTimeline(item, reasonCode)
  };
}

function portalLinkedObjects(item: PortalRequestCaseInput): LinkedObject[] {
  return compactLinkedObjects([
    {
      relationType: "owns",
      objectType: "account",
      objectRef: item.portalUserRef,
      label: "用户账号"
    },
    {
      relationType: "about",
      objectType: "order",
      objectRef: item.id,
      label: "资源订单"
    },
    item.entitlementRef ? {
      relationType: "has",
      objectType: "artifact",
      objectRef: item.entitlementRef,
      label: "访问权益"
    } : null
  ]);
}

function usageLinkedObjects(item: UsageMonitorCaseInput): LinkedObject[] {
  return compactLinkedObjects([
    {
      relationType: "owns",
      objectType: "account",
      objectRef: item.portalUserRef || item.accountId,
      label: "用户账号"
    },
    {
      relationType: "measures",
      objectType: "order",
      objectRef: item.issuanceRequestId,
      label: "资源订单"
    },
    ...uniqueStrings(item.issuedChannels).map((channelRef) => ({
      relationType: "uses",
      objectType: "channel" as const,
      objectRef: channelRef,
      label: "下发通道"
    }))
  ]);
}

function portalTimeline(item: PortalRequestCaseInput, reasonCode: CaseReasonCode): ObjectTimelineEvent[] {
  return [
    {
      eventRef: `event:portal:${item.id}:submitted`,
      category: "order_lifecycle",
      action: "request_submitted",
      objectType: "order",
      objectRef: item.id,
      occurredAt: item.submittedAt,
      source: "portal_access_requests",
      summary: "资源订单已提交",
      severity: "info",
      relatedRefs: [item.portalUserRef]
    },
    {
      eventRef: `event:portal:${item.id}:${reasonCode}`,
      category: reasonCode.startsWith("usage") || reasonCode === "over_limit" ? "usage_collection" : "order_lifecycle",
      action: reasonCode,
      objectType: "order",
      objectRef: item.id,
      occurredAt: item.usage?.updatedAt ?? item.updatedAt,
      source: "portal_access_requests",
      summary: reasonTitle(reasonCode),
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.portalUserRef]
    }
  ];
}

function usageTimeline(item: UsageMonitorCaseInput, reasonCode: CaseReasonCode): ObjectTimelineEvent[] {
  return [
    {
      eventRef: `event:usage:${item.issuanceRequestId}:last-refresh`,
      category: "artifact_access",
      action: "artifact_seen",
      objectType: "artifact",
      objectRef: item.issuanceRequestId,
      occurredAt: item.lastRefreshAt,
      source: "subscription_usage_monitor",
      summary: "订阅产物最近刷新已记录",
      severity: "info",
      relatedRefs: [item.portalUserRef, item.issuanceRequestId].filter(Boolean)
    },
    {
      eventRef: `event:usage:${item.issuanceRequestId}:${reasonCode}`,
      category: reasonCode === "receipt_missing" ? "channel_desired_state" : "usage_collection",
      action: reasonCode,
      objectType: "usage",
      objectRef: item.issuanceRequestId,
      occurredAt: item.lastUsageObservedAt,
      source: "subscription_usage_monitor",
      summary: reasonTitle(reasonCode),
      severity: reasonSeverity(reasonCode),
      reasonCode,
      relatedRefs: [item.portalUserRef, ...uniqueStrings(item.issuedChannels)].filter(Boolean)
    }
  ];
}

function reasonTitle(reasonCode: CaseReasonCode) {
  const labels: Record<CaseReasonCode, string> = {
    over_limit: "订单流量已超额",
    near_limit: "订单接近额度",
    usage_zero: "订单真实 0B 用量",
    usage_stale: "用量采集延迟",
    collector_disabled: "采集器未启用",
    not_collected: "订单未接入采集",
    receipt_missing: "回执/采集待确认",
    expiry_candidate: "订单到期复核",
    archive_candidate: "订单归档候选",
    order_pending_review: "订单等待审核",
    order_pending_delivery: "订单等待受控发放"
  };
  return labels[reasonCode];
}

function reasonSeverity(reasonCode: CaseReasonCode): CaseSeverity {
  if (reasonCode === "over_limit") return "critical";
  if (
    reasonCode === "near_limit"
    || reasonCode === "usage_stale"
    || reasonCode === "collector_disabled"
    || reasonCode === "receipt_missing"
  ) {
    return "warning";
  }
  if (reasonCode === "not_collected" || reasonCode === "usage_zero") return "info";
  return "neutral";
}

function compareCases(left: CaseCandidate, right: CaseCandidate) {
  return SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || safeTime(right.updatedAt) - safeTime(left.updatedAt)
    || left.caseRef.localeCompare(right.caseRef);
}

function hasUnconfirmedBinding(item: UsageMonitorCaseInput) {
  return item.edgeCredentialBindings.some((binding) => !binding.credentialRefPresent || !binding.materialDigestPresent);
}

function uniqueReasons(reasons: CaseReasonCode[]) {
  return Array.from(new Set(reasons));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function compactLinkedObjects(values: Array<LinkedObject | null>) {
  return values.filter((value): value is LinkedObject => Boolean(value && value.objectRef));
}

function safeTime(value: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
```

- [ ] **Step 4: Run model tests**

Run:

```powershell
npm run admin:test -- admin-case-workbench-model
```

Expected: PASS for `admin-case-workbench-model.test.ts`.

- [ ] **Step 5: Commit the model slice**

Use explicit paths only:

```powershell
git add admin/src/features/admin-case-workbench/types.ts admin/src/features/admin-case-workbench/case-candidates.ts admin/src/test/admin-case-workbench-model.test.ts
git diff --cached --check
git commit -m "feat(admin): derive case workbench candidates"
```

Expected: commit succeeds only if this task is being executed on an isolated implementation branch or after the current mixed worktree has been intentionally staged by path.

---

### Task 3: Add Shared Case Workbench Components

**Files:**

- Create: `admin/src/features/admin-case-workbench/case-workbench.tsx`
- Create: `admin/src/test/admin-case-workbench-components.test.tsx`
- Modify later: `admin/src/styles.css`

- [ ] **Step 1: Write failing component tests**

Create `admin/src/test/admin-case-workbench-components.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CaseDetailPanel,
  CaseQueue,
  EmptyState,
  ErrorState,
  LoadingSkeleton
} from "../features/admin-case-workbench/case-workbench";
import type { CaseCandidate } from "../features/admin-case-workbench/types";

afterEach(() => {
  cleanup();
});

describe("case workbench components", () => {
  test("renders a selectable read-only case queue", () => {
    const onSelect = vi.fn();

    render(
      <CaseQueue
        title="监管案件摘要"
        description="只读展示需要人工复核的监管候选。"
        cases={[
          caseFixture({
            caseRef: "case_candidate:usage:order_over:over_limit",
            title: "订单流量已超额",
            severity: "critical",
            reasonCode: "over_limit"
          }),
          caseFixture({
            caseRef: "case_candidate:usage:order_stale:usage_stale",
            title: "用量采集延迟",
            severity: "warning",
            reasonCode: "usage_stale"
          })
        ]}
        selectedCaseRef="case_candidate:usage:order_over:over_limit"
        onSelect={onSelect}
      />
    );

    const queue = screen.getByLabelText("监管案件摘要");
    expect(within(queue).getByText("订单流量已超额")).not.toBeNull();
    expect(within(queue).getByText("高")).not.toBeNull();
    expect(within(queue).getByText("超额")).not.toBeNull();
    fireEvent.click(within(queue).getByRole("button", { name: /用量采集延迟/ }));
    expect(onSelect).toHaveBeenCalledWith("case_candidate:usage:order_stale:usage_stale");
    expect(within(queue).queryByRole("button", { name: /禁用|归档|创建|删除/ })).toBeNull();
  });

  test("renders case detail with linked objects and timeline while hiding raw material", () => {
    render(<CaseDetailPanel caseItem={caseFixture()} />);

    expect(screen.getByRole("heading", { name: "订单流量已超额" })).not.toBeNull();
    expect(screen.getByText("用户账号")).not.toBeNull();
    expect(screen.getByText("portal_user_safe")).not.toBeNull();
    expect(screen.getByText("资源订单")).not.toBeNull();
    expect(screen.getByText("order_safe_1")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "对象时间线" })).not.toBeNull();
    expect(screen.getByText("用量采集事实已记录")).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token|secret|password|yaml|raw/i);
  });

  test("renders stable empty, error, and loading states", () => {
    render(
      <>
        <EmptyState title="暂无监管案件" description="当前筛选条件下没有活跃候选。" />
        <ErrorState title="监管案件不可用" message="用量监护暂不可用。" />
        <LoadingSkeleton label="正在加载监管案件" rows={2} />
      </>
    );

    expect(screen.getByText("暂无监管案件")).not.toBeNull();
    expect(screen.getByText("用量监护暂不可用。")).not.toBeNull();
    expect(screen.getByLabelText("正在加载监管案件")).not.toBeNull();
    expect(document.querySelectorAll(".case-skeleton-row")).toHaveLength(2);
  });
});

function caseFixture(overrides: Partial<CaseCandidate> = {}): CaseCandidate {
  return {
    caseRef: "case_candidate:usage:order_safe_1:over_limit",
    title: "订单流量已超额",
    objectType: "usage",
    objectRef: "order_safe_1",
    status: "待复核",
    severity: "critical",
    reasonCode: "over_limit",
    source: "subscription_usage_monitor",
    gateRequired: true,
    createdAt: "2026-06-05T08:00:00.000Z",
    updatedAt: "2026-06-05T09:00:00.000Z",
    linkedObjects: [
      {
        relationType: "owns",
        objectType: "account",
        objectRef: "portal_user_safe",
        label: "用户账号"
      },
      {
        relationType: "about",
        objectType: "order",
        objectRef: "order_safe_1",
        label: "资源订单"
      }
    ],
    timeline: [
      {
        eventRef: "event:usage:order_safe_1:over_limit",
        category: "usage_collection",
        action: "over_limit",
        objectType: "usage",
        objectRef: "order_safe_1",
        occurredAt: "2026-06-05T09:00:00.000Z",
        source: "subscription_usage_monitor",
        summary: "用量采集事实已记录",
        severity: "critical",
        reasonCode: "over_limit",
        relatedRefs: ["portal_user_safe", "order_safe_1"]
      }
    ],
    ...overrides
  };
}
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm run admin:test -- admin-case-workbench-components
```

Expected: FAIL because `case-workbench.tsx` does not exist.

- [ ] **Step 3: Implement the components**

Create `admin/src/features/admin-case-workbench/case-workbench.tsx`:

```tsx
import type { CaseCandidate, CaseSeverity, LinkedObject, ObjectTimelineEvent } from "./types";

export function CaseQueue({
  title,
  description,
  cases,
  selectedCaseRef,
  onSelect
}: {
  title: string;
  description: string;
  cases: CaseCandidate[];
  selectedCaseRef: string | null;
  onSelect: (caseRef: string) => void;
}) {
  return (
    <section className="case-workbench-card" aria-label={title}>
      <div className="case-section-heading">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="case-count">{cases.length}</span>
      </div>
      {cases.length === 0 ? (
        <EmptyState title="暂无监管案件" description="当前筛选条件下没有活跃候选。" />
      ) : (
        <div className="case-queue-list">
          {cases.map((item) => (
            <button
              className={item.caseRef === selectedCaseRef ? "case-row case-row-active" : "case-row"}
              key={item.caseRef}
              type="button"
              onClick={() => onSelect(item.caseRef)}
            >
              <span className={`case-severity case-severity-${item.severity}`}>{severityLabel(item.severity)}</span>
              <span className="case-row-main">
                <strong>{item.title}</strong>
                <small>{item.objectRef}</small>
              </span>
              <span className="case-reason">{reasonLabel(item.reasonCode)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function CaseDetailPanel({ caseItem }: { caseItem: CaseCandidate | null }) {
  if (!caseItem) {
    return <EmptyState title="选择一个监管案件" description="从左侧队列选择候选后查看证据和对象历史。" />;
  }

  return (
    <section className="case-detail-panel" aria-label="监管案件详情">
      <div className="case-detail-heading">
        <div>
          <p className="case-eyebrow">{caseItem.status}</p>
          <h3>{caseItem.title}</h3>
          <p className="muted">{caseItem.objectRef}</p>
        </div>
        <span className={`case-severity case-severity-${caseItem.severity}`}>{severityLabel(caseItem.severity)}</span>
      </div>
      <div className="case-key-grid">
        <KeyValue label="来源" value={sourceLabel(caseItem.source)} />
        <KeyValue label="原因" value={reasonLabel(caseItem.reasonCode)} />
        <KeyValue label="门禁" value={caseItem.gateRequired ? "需要单独门禁" : "只读复核"} />
        <KeyValue label="更新时间" value={formatDateTime(caseItem.updatedAt)} />
      </div>
      <LinkedObjects objects={caseItem.linkedObjects} />
      <ObjectTimeline events={caseItem.timeline} />
      <div className="case-audit-note">
        <strong>审计备注</strong>
        <p className="muted">阶段一只读展示候选和证据；关闭、误报、归档和备注写入等待后端 Case 契约。</p>
      </div>
    </section>
  );
}

export function LinkedObjects({ objects }: { objects: LinkedObject[] }) {
  return (
    <div className="case-linked-objects" aria-label="关联对象">
      <h4>关联对象</h4>
      <div className="case-linked-list">
        {objects.map((object) => (
          <div className="case-linked-item" key={`${object.relationType}:${object.objectType}:${object.objectRef}`}>
            <span>{object.label}</span>
            <strong>{object.objectRef}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ObjectTimeline({ events }: { events: ObjectTimelineEvent[] }) {
  return (
    <div className="case-timeline" aria-label="对象时间线">
      <h4>对象时间线</h4>
      {events.map((event) => (
        <article className="case-timeline-event" key={event.eventRef}>
          <span className={`case-timeline-dot case-severity-${event.severity}`} aria-hidden="true" />
          <div>
            <strong>{event.summary}</strong>
            <p className="muted">{event.source} · {formatDateTime(event.occurredAt)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="case-state case-empty-state">
      <strong>{title}</strong>
      <p className="muted">{description}</p>
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="case-state case-error-state">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export function LoadingSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="case-skeleton" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <span className="case-skeleton-row" key={index} />
      ))}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function severityLabel(severity: CaseSeverity) {
  const labels: Record<CaseSeverity, string> = {
    critical: "高",
    warning: "中",
    info: "低",
    neutral: "记录"
  };
  return labels[severity];
}

function sourceLabel(source: CaseCandidate["source"]) {
  const labels: Record<CaseCandidate["source"], string> = {
    portal_access_requests: "账号与资源",
    subscription_usage_monitor: "流量与通道",
    dashboard_summary: "运营总览"
  };
  return labels[source];
}

function reasonLabel(reason: CaseCandidate["reasonCode"]) {
  const labels: Record<CaseCandidate["reasonCode"], string> = {
    over_limit: "超额",
    near_limit: "接近额度",
    usage_zero: "零用量",
    usage_stale: "采集延迟",
    collector_disabled: "采集器未启用",
    not_collected: "未接入采集",
    receipt_missing: "回执待确认",
    expiry_candidate: "到期复核",
    archive_candidate: "归档候选",
    order_pending_review: "待审核",
    order_pending_delivery: "待发放"
  };
  return labels[reason];
}

function formatDateTime(value: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
```

- [ ] **Step 4: Run component tests**

Run:

```powershell
npm run admin:test -- admin-case-workbench-components
```

Expected: PASS for the component test file.

- [ ] **Step 5: Commit the component slice**

```powershell
git add admin/src/features/admin-case-workbench/case-workbench.tsx admin/src/test/admin-case-workbench-components.test.tsx
git diff --cached --check
git commit -m "feat(admin): add case workbench primitives"
```

---

### Task 4: Add Workbench Styles

**Files:**

- Modify: `admin/src/styles.css`
- Tests: `admin/src/test/admin-case-workbench-components.test.tsx`

- [ ] **Step 1: Append styles at the Admin UI section**

Append near the existing `usage-anomaly` and `gate-review-card` styles:

```css
.case-workbench-card,
.case-detail-panel {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-color);
  padding: 18px;
}

.case-section-heading,
.case-detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.case-count {
  min-width: 32px;
  height: 32px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 700;
}

.case-queue-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.case-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
  padding: 12px;
  cursor: pointer;
}

.case-row-active {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.case-row-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.case-row-main strong,
.case-row-main small,
.case-reason {
  overflow-wrap: anywhere;
}

.case-severity {
  min-width: 34px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 700;
}

.case-severity-critical {
  background: #fee2e2;
  color: #991b1b;
}

.case-severity-warning {
  background: #fef3c7;
  color: #92400e;
}

.case-severity-info {
  background: #e0f2fe;
  color: #075985;
}

.case-severity-neutral {
  background: #f1f5f9;
  color: #334155;
}

.case-reason {
  color: var(--muted-text);
  font-size: 0.86rem;
}

.case-key-grid,
.case-linked-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.case-key-grid > div,
.case-linked-item {
  display: grid;
  gap: 4px;
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}

.case-key-grid span,
.case-linked-item span {
  color: var(--muted-text);
  font-size: 0.84rem;
}

.case-linked-objects,
.case-timeline,
.case-audit-note {
  margin-top: 18px;
}

.case-timeline {
  display: grid;
  gap: 12px;
}

.case-timeline-event {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 10px;
}

.case-timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-top: 5px;
}

.case-state {
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  padding: 14px;
  margin-top: 12px;
}

.case-error-state {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.case-skeleton {
  display: grid;
  gap: 10px;
}

.case-skeleton-row {
  height: 48px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9);
}
```

- [ ] **Step 2: Add responsive rules**

Add inside the existing mobile media section:

```css
@media (max-width: 620px) {
  .case-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .case-reason {
    grid-column: 2;
  }

  .case-section-heading,
  .case-detail-heading {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: Run component tests and build**

Run:

```powershell
npm run admin:test -- admin-case-workbench-components
npm run admin:build
```

Expected: both commands PASS.

- [ ] **Step 4: Commit the style slice**

```powershell
git add admin/src/styles.css
git diff --cached --check
git commit -m "style(admin): add case workbench layout"
```

---

### Task 5: Embed Case Workbench In Account And Resource Supervision

**Files:**

- Modify: `admin/src/pages/portal-requests-page.tsx`
- Modify: `admin/src/test/portal-requests-page.test.tsx`

- [ ] **Step 1: Write failing page assertions**

In `admin/src/test/portal-requests-page.test.tsx`, extend the existing `presents portal access requests as user resource supervision` test with these assertions after the page has loaded:

```ts
expect(screen.getByLabelText("账号与资源监管案件")).not.toBeNull();
expect(screen.getByText("订单流量已超额")).not.toBeNull();
expect(screen.getByText("订单等待受控发放")).not.toBeNull();
expect(screen.getByLabelText("监管案件详情")).not.toBeNull();
expect(screen.getByRole("heading", { name: "订单流量已超额" })).not.toBeNull();
expect(screen.getByText("关联对象")).not.toBeNull();
expect(screen.getByText("对象时间线")).not.toBeNull();
expect(screen.getByText("阶段一只读展示候选和证据；关闭、误报、归档和备注写入等待后端 Case 契约。")).not.toBeNull();
expect(screen.queryByRole("button", { name: /禁用|归档|创建订阅|删除/i })).toBeNull();
```

- [ ] **Step 2: Run failing page test**

Run:

```powershell
npm run admin:test -- portal-requests-page
```

Expected: FAIL because the page does not render the case workbench section yet.

- [ ] **Step 3: Modify imports and state**

At the top of `admin/src/pages/portal-requests-page.tsx`, add:

```ts
import {
  buildPortalRequestCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import {
  CaseDetailPanel,
  CaseQueue
} from "../features/admin-case-workbench/case-workbench";
```

Inside `PortalRequestsPage`, add state and derived candidates:

```ts
const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);
const caseCandidates = useMemo(() => buildPortalRequestCaseCandidates(items), [items]);
const visibleCaseCandidates = useMemo(() => topCaseCandidates(caseCandidates, 6), [caseCandidates]);
const selectedCase = useMemo(() => (
  visibleCaseCandidates.find((item) => item.caseRef === selectedCaseRef)
    ?? visibleCaseCandidates[0]
    ?? null
), [selectedCaseRef, visibleCaseCandidates]);
```

Add this effect after `visibleCaseCandidates` exists:

```ts
useEffect(() => {
  if (visibleCaseCandidates.length === 0) {
    setSelectedCaseRef(null);
    return;
  }
  setSelectedCaseRef((current) => (
    current && visibleCaseCandidates.some((item) => item.caseRef === current)
      ? current
      : visibleCaseCandidates[0].caseRef
  ));
}, [visibleCaseCandidates]);
```

- [ ] **Step 4: Render the account/resource workbench**

Place this section after `OrderOverviewSection` and before `AccountSupervisionSection`:

```tsx
<div className="case-workbench-layout">
  <CaseQueue
    title="账号与资源监管案件"
    description="从账号、订单、额度和采集状态派生的只读监管候选。"
    cases={visibleCaseCandidates}
    selectedCaseRef={selectedCase?.caseRef ?? null}
    onSelect={setSelectedCaseRef}
  />
  <CaseDetailPanel caseItem={selectedCase} />
</div>
```

- [ ] **Step 5: Run focused page test**

Run:

```powershell
npm run admin:test -- portal-requests-page
```

Expected: PASS for portal request page tests.

- [ ] **Step 6: Commit the account/resource embed**

```powershell
git add admin/src/pages/portal-requests-page.tsx admin/src/test/portal-requests-page.test.tsx
git diff --cached --check
git commit -m "feat(admin): embed resource case candidates"
```

---

### Task 6: Embed Case Workbench In Usage And Channel Monitoring

**Files:**

- Modify: `admin/src/pages/subscription-usage-monitor-page.tsx`
- Modify: `admin/src/test/subscription-usage-monitor.test.tsx`

- [ ] **Step 1: Write failing usage workbench assertions**

In `admin/src/test/subscription-usage-monitor.test.tsx`, extend the first test with:

```ts
expect(screen.getByLabelText("流量与通道监管案件")).not.toBeNull();
expect(screen.getByRole("heading", { name: "订单流量已超额" })).not.toBeNull();
expect(screen.getByText("回执/采集待确认")).not.toBeNull();
expect(screen.getByText("用量采集延迟")).not.toBeNull();
const caseDetail = screen.getByLabelText("监管案件详情");
expect(within(caseDetail).getByText("流量与通道")).not.toBeNull();
expect(within(caseDetail).getByText("需要单独门禁")).not.toBeNull();
expect(within(caseDetail).queryByRole("button", { name: /禁用|归档|创建|删除/i })).toBeNull();
```

- [ ] **Step 2: Run failing usage test**

Run:

```powershell
npm run admin:test -- subscription-usage-monitor
```

Expected: FAIL because the usage page does not render shared case primitives yet.

- [ ] **Step 3: Modify imports and derived state**

At the top of `admin/src/pages/subscription-usage-monitor-page.tsx`, add `useMemo` to the React import if it is not already present:

```ts
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
```

Add imports:

```ts
import {
  buildUsageMonitorCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import {
  CaseDetailPanel,
  CaseQueue
} from "../features/admin-case-workbench/case-workbench";
```

Inside `SubscriptionUsageMonitorPage`, add:

```ts
const [selectedCaseRef, setSelectedCaseRef] = useState<string | null>(null);
const caseCandidates = useMemo(() => buildUsageMonitorCaseCandidates(monitor?.items ?? []), [monitor]);
const visibleCaseCandidates = useMemo(() => topCaseCandidates(caseCandidates, 8), [caseCandidates]);
const selectedCase = useMemo(() => (
  visibleCaseCandidates.find((item) => item.caseRef === selectedCaseRef)
    ?? visibleCaseCandidates[0]
    ?? null
), [selectedCaseRef, visibleCaseCandidates]);
```

Add the same stabilizing effect pattern:

```ts
useEffect(() => {
  if (visibleCaseCandidates.length === 0) {
    setSelectedCaseRef(null);
    return;
  }
  setSelectedCaseRef((current) => (
    current && visibleCaseCandidates.some((item) => item.caseRef === current)
      ? current
      : visibleCaseCandidates[0].caseRef
  ));
}, [visibleCaseCandidates]);
```

- [ ] **Step 4: Render the usage/channel workbench**

Place before `ChannelHealthSection`:

```tsx
<div className="case-workbench-layout">
  <CaseQueue
    title="流量与通道监管案件"
    description="从订单用量、采集覆盖、通道绑定和回执状态派生的只读监管候选。"
    cases={visibleCaseCandidates}
    selectedCaseRef={selectedCase?.caseRef ?? null}
    onSelect={setSelectedCaseRef}
  />
  <CaseDetailPanel caseItem={selectedCase} />
</div>
```

Keep `AnomalyQueueSection` for the first commit. In a later cleanup commit, either keep it as a compact legacy summary or rename it to a lower-priority evidence section. Do not remove it in this task because existing tests assert its details.

- [ ] **Step 5: Run focused usage tests**

Run:

```powershell
npm run admin:test -- subscription-usage-monitor
```

Expected: PASS.

- [ ] **Step 6: Commit the usage/channel embed**

```powershell
git add admin/src/pages/subscription-usage-monitor-page.tsx admin/src/test/subscription-usage-monitor.test.tsx
git diff --cached --check
git commit -m "feat(admin): embed usage case candidates"
```

---

### Task 7: Add Dashboard Case Summary

**Files:**

- Modify: `admin/src/pages/dashboard-page.tsx`
- Modify: `admin/src/test/admin-dashboard.test.tsx`

- [ ] **Step 1: Write failing dashboard assertions**

In the dashboard test that loads orders and usage monitor data, add:

```ts
expect(screen.getByLabelText("监管案件摘要")).not.toBeNull();
expect(screen.getByText("只读展示最高优先级监管候选。")).not.toBeNull();
expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|token|secret|password|yaml|raw/i);
```

- [ ] **Step 2: Run failing dashboard test**

Run:

```powershell
npm run admin:test -- admin-dashboard
```

Expected: FAIL until the dashboard renders case summary.

- [ ] **Step 3: Add imports and derived summary**

In `admin/src/pages/dashboard-page.tsx`, import:

```ts
import {
  buildPortalRequestCaseCandidates,
  buildUsageMonitorCaseCandidates,
  topCaseCandidates
} from "../features/admin-case-workbench/case-candidates";
import { CaseQueue } from "../features/admin-case-workbench/case-workbench";
```

Inside `DashboardPage`, after `recentRows`, add:

```ts
const dashboardCaseCandidates = useMemo(() => topCaseCandidates([
  ...buildPortalRequestCaseCandidates(orders),
  ...buildUsageMonitorCaseCandidates(usageMonitor?.items ?? [])
], 5), [orders, usageMonitor]);
```

- [ ] **Step 4: Render dashboard summary**

Place after core metric cards and before the primary dashboard grid:

```tsx
<CaseQueue
  title="监管案件摘要"
  description="只读展示最高优先级监管候选。"
  cases={dashboardCaseCandidates}
  selectedCaseRef={dashboardCaseCandidates[0]?.caseRef ?? null}
  onSelect={() => undefined}
/>
```

This dashboard version is intentionally read-only and non-selecting. It gives the operator a top-risk queue while detailed investigation stays on the source pages.

- [ ] **Step 5: Run dashboard tests**

Run:

```powershell
npm run admin:test -- admin-dashboard
```

Expected: PASS.

- [ ] **Step 6: Commit the dashboard summary**

```powershell
git add admin/src/pages/dashboard-page.tsx admin/src/test/admin-dashboard.test.tsx
git diff --cached --check
git commit -m "feat(admin): add dashboard case summary"
```

---

### Task 8: Add GCC-54 Backend Contract Audit

**Files:**

- Create: `docs/ADMIN_CASE_WORKBENCH_BACKEND_CONTRACT_AUDIT.md`
- Read-only checks: server services and tests

- [ ] **Step 1: Create the audit document**

Create `docs/ADMIN_CASE_WORKBENCH_BACKEND_CONTRACT_AUDIT.md` with this content:

```md
# Admin Case Workbench Backend Contract Audit

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Linear: GCC-54
> - Risk: C for this read-only audit
> - Production impact: None
> - Execution authority: This document does not authorize schema migration, production data backfill, auth model changes, runtime mutation, lifecycle automation, token handling, subscription URL handling, credential exposure, deploy, or rollback.

## Goal

Map which backend facts can safely support phase-one Admin case candidates and which facts need a later backend contract before durable Case workflows are built.

## Current Safe Facts

| Fact | Current source | Safe frontend use |
| --- | --- | --- |
| Portal request lifecycle | `portal-access-requests.mjs`, `subscription-control-db.mjs` | Show request/order status and next review target. |
| Portal usage summary | `portal-access-requests.mjs` | Show upload, download, used, total, usage status, collection status, channel counts, and updated time. |
| Traffic limit | `portal-access-requests.mjs`, `subscription-control-db.mjs` | Show current quota and quota source. |
| Usage monitor row | `subscription-usage-monitor.mjs` | Show account/order scoped measured usage, collection status, warnings, channel usage, and safe binding presence booleans. |
| Usage timeseries | `subscription-usage-monitor.mjs` | Show aggregate chart data by safe account, order, and channel refs. |
| Safety flags | Admin platform routes and service summaries | Assert raw subscription URLs, secrets, raw credentials, raw customer network data, and runtime mutation are not returned. |

## Gaps Before Durable Case

| Gap | Why it matters | Required later scope |
| --- | --- | --- |
| Durable Case object | Phase one candidates are derived and cannot be closed, reopened, assigned, or archived. | B/A or A depending on schema and migration scope. |
| Account lifecycle source | UI currently cannot prove account enabled, disabled, or suspended from a first-class account status. | Backend account summary contract. |
| Request status vocabulary alignment | Backend can contain lifecycle states that frontend types may not expose. | Type/API contract alignment and tests. |
| Stale usage window | UI must not invent stale collection without backend policy. | Backend-provided stale window or collection status contract. |
| Audit notes | Operator notes need persistence and actor/audit refs. | Backend note API and auth review. |
| Receipt missing evidence | UI can show binding presence booleans, but durable evidence needs receipt refs or safe lifecycle events. | Receipt evidence contract. |

## Phase-One Rule

Frontend may compute `case_candidate:*` identifiers from already-safe API payloads. It must label them as derived candidates and must not mark them as closed, false positive, assigned, archived, or durable.

## Required Tests Before GCC-55

```powershell
node --test server\tests\platform-portal-access-requests.test.mjs
node --test server\tests\platform-subscription-control-db.test.mjs
npm run admin:test
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

## Sensitive Data Boundary

Case candidates, timeline rows, linked objects, fixtures, and audit documents must not contain raw subscription URLs, tokens, credential material, private keys, raw runtime config, raw SQLite rows, or customer-private data.
```

- [ ] **Step 2: Run contract-audit checks**

Run:

```powershell
node --test server\tests\platform-portal-access-requests.test.mjs
node --test server\tests\platform-subscription-control-db.test.mjs
git diff --check origin/master...HEAD
```

Expected: tests PASS, diff check PASS.

- [ ] **Step 3: Commit the audit document**

```powershell
git add docs/ADMIN_CASE_WORKBENCH_BACKEND_CONTRACT_AUDIT.md
git diff --cached --check
git commit -m "docs(admin): audit case workbench backend contract"
```

---

### Task 9: Full Local Validation And Visual QA

**Files:**

- No planned source changes unless validation exposes a defect in prior tasks.

- [ ] **Step 1: Run full Admin validation**

Run:

```powershell
npm run admin:test
npm run admin:build
```

Expected: Admin tests PASS and build PASS.

- [ ] **Step 2: Run repository server validation**

Run:

```powershell
npm test
```

Expected: server test suite PASS.

- [ ] **Step 3: Run diff check**

Run:

```powershell
git diff --check origin/master...HEAD
```

Expected: no whitespace errors. LF/CRLF warnings may appear; they are warnings, not diff-check failures.

- [ ] **Step 4: Start or reuse local Admin preview**

Run if no local preview is already serving the Admin build:

```powershell
npm run admin:dev
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/` or `http://localhost:5173/`.

- [ ] **Step 5: Browser QA**

Open the local Admin URL and verify:

- `运营总览` shows `监管案件摘要`.
- `账号与资源` shows `账号与资源监管案件` and selecting a case updates detail.
- `流量与通道` shows `流量与通道监管案件` and does not remove the existing order usage ledger.
- Mobile width does not overlap text, queue rows, or detail content.
- No visible text contains subscription URLs, tokens, credentials, raw config, raw SQLite rows, or customer-private data.

- [ ] **Step 6: Record validation in final PR body**

Use this validation block:

```md
Validation:
- `npm run admin:test`
- `npm run admin:build`
- `npm test`
- `git diff --check origin/master...HEAD`
- Browser QA on local Admin preview
```

---

## Self-Review

Spec coverage:

- Existing three-page Admin IA remains intact: Task 5, Task 6, and Task 7.
- Phase-one case candidates remain frontend-derived and read-only: Task 2 and Task 3.
- Case queue, detail, linked objects, timeline, audit-note read boundary, empty/error/loading states: Task 3 and Task 4.
- Account/resource embedding: Task 5.
- Usage/channel embedding: Task 6.
- Dashboard summary: Task 7.
- Backend contract audit and gaps: Task 8.
- Validation and browser QA: Task 9.

Type consistency:

- `CaseCandidate`, `LinkedObject`, and `ObjectTimelineEvent` are defined once in `types.ts`.
- Builders return the same `CaseCandidate` shape used by components.
- Page tests assert visible Chinese labels from the components.

Execution notes:

- Keep commits path-scoped because the current worktree may contain unrelated WIP.
- If implementing in the current dirty branch, inspect `git status --short --branch` before every commit and stage only paths from the active task.
- If using subagents, give each worker a disjoint write scope: model, components/styles, page embeds, backend audit.
