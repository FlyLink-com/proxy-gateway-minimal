import type {
  PortalAccessRequestSummary,
  SubscriptionUsageMonitorRow
} from "../subscriptions/types";

export type CaseSeverity = "critical" | "warning" | "info" | "neutral";

export type CaseStatus =
  | "Pending review"
  | "In progress"
  | "Gate required"
  | "Confirmed"
  | "False positive"
  | "Closed"
  | "Pending archive";

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
