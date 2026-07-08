import type { MetricTone } from "../components/primitives";
import type { SubscriptionUsageMonitorRow } from "../features/subscriptions/types";

export type { SubscriptionUsageMonitorRow } from "../features/subscriptions/types";

export type PlatformAccountSummary = {
  createdAt: string | null;
  displayName?: string | null;
  email?: string | null;
  entitlementCount: number;
  id: string;
  leadId?: string | null;
  organization?: string | null;
  status: string;
  type?: "platform_account_summary" | string;
  updatedAt: string | null;
  usableEntitlementCount: number;
};

export type PlatformEntitlementSummary = {
  accountId: string;
  createdAt?: string | null;
  id: string;
  plan?: string | null;
  quota?: Record<string, unknown>;
  status: string;
  type?: "platform_entitlement_summary" | string;
  updatedAt?: string | null;
  usable?: boolean;
  validUntil?: string | null;
};

type SafeReadDetailField = {
  label: string;
  tone?: MetricTone;
  value: string;
};

export type UserManagementCrudOperation =
  | "create"
  | "read"
  | "update"
  | "disable"
  | "delete";

export type UserManagementActionGate = {
  disabledReason: string;
  evidenceFields: string[];
  id: string;
  label: string;
  operation: UserManagementCrudOperation;
  riskTier: "B" | "A";
  state: "available" | "dry-run" | "locked";
};

export type UserManagementSafeReadRow = {
  createdDate: string;
  detail: {
    fields: SafeReadDetailField[];
  };
  displayName: string;
  email: string;
  id: string;
  lastAccess: string;
  plan: string;
  planTone: MetricTone;
  risk: string;
  riskTone: MetricTone;
  status: string;
  statusTone: MetricTone;
  userId: string;
};

export type UserManagementSafeReadPageConfig = {
  actionLabel: string;
  actionGates: readonly UserManagementActionGate[];
  detailAriaLabel: string;
  figmaNodeId: string;
  filters: string[];
  pagination: {
    displayTotalRows: number;
    nextLabel: string;
    pageSize: number;
    previousLabel: string;
    showPageSummary: boolean;
    showWhenSinglePage: boolean;
  };
  queryPlaceholder: string;
  rows: UserManagementSafeReadRow[];
  tableAriaLabel: string;
};

export type UserManagementSafeReadQuery = {
  plan?: string;
  risk?: string;
  search?: string;
  status?: string;
};

type UserManagementUsageSummary = {
  activeOrders: number;
  hasBlockedOrder: boolean;
  hasNearQuota: boolean;
  hasOverQuota: boolean;
  latestSubscriptionEndAt: string | null;
  latestUsageObservedAt: string | null;
  measuredOrders: number;
  pendingCollectionOrders: number;
  totalDownloadBytes: number;
  totalOrders: number;
  totalTrafficLimitBytes: number;
  totalUploadBytes: number;
  totalUsedBytes: number;
  warnings: string[];
};

type UserManagementSubscriptionSummary = {
  current: string;
  monthlyTraffic: string;
  planRecords: string;
  validity: string;
};

type SelectedAccountPlan = {
  entitlement?: PlatformEntitlementSummary;
  label: string;
  tone: MetricTone;
};

const EMAIL_NOT_AVAILABLE = "Email not available";
const NOT_OBSERVED = "Not observed";
const NOT_AVAILABLE = "Not available";
const PUBLIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNSAFE_TEXT_PATTERN = /https?:\/\/|subscriptionUrl|token=|secret|password|edgecred_|bearer|raw log|sqlite|credential/i;
const BLOCKED_ORDER_STATUSES = new Set(["blocked", "disabled", "revoked", "rotated", "expired", "missing"]);
export const USER_MANAGEMENT_ACTION_GATES: readonly UserManagementActionGate[] = [
  {
    disabledReason: "Safe read available for the selected account row.",
    evidenceFields: ["safe user ref", "status", "plan", "account plan", "usage summary"],
    id: "read-user-detail",
    label: "Read User Detail",
    operation: "read",
    riskTier: "B",
    state: "available"
  },
  {
    disabledReason: "Requires create-user dry-run, permission contract, audit event, and backend validation before mutation.",
    evidenceFields: ["safe user ref", "status", "plan"],
    id: "create-user",
    label: "Create User · Gated",
    operation: "create",
    riskTier: "A",
    state: "locked"
  },
  {
    disabledReason: "Dry-run shell available; real edit requires permission contract, audit event, and backend validation.",
    evidenceFields: ["safe user ref", "status", "plan", "account plan"],
    id: "edit-user",
    label: "Edit User · Dry-run",
    operation: "update",
    riskTier: "A",
    state: "dry-run"
  },
  {
    disabledReason: "Dry-run shell available; real disable requires operator approval, audit event, and entitlement impact preview.",
    evidenceFields: ["safe user ref", "status", "account plan", "usage summary"],
    id: "disable-user",
    label: "Disable User · Dry-run",
    operation: "disable",
    riskTier: "A",
    state: "dry-run"
  },
  {
    disabledReason: "Hard delete remains unavailable; dry-run shell only until a separate approval gate and retention review exist.",
    evidenceFields: ["safe user ref", "status", "account plan", "usage summary"],
    id: "delete-user",
    label: "Delete User · Dry-run",
    operation: "delete",
    riskTier: "A",
    state: "dry-run"
  }
];

export function createUserManagementPageConfigFromAccountSummaries({
  accounts,
  entitlements = [],
  query,
  usageRows = []
}: {
  accounts: PlatformAccountSummary[];
  entitlements?: PlatformEntitlementSummary[];
  query?: UserManagementSafeReadQuery;
  usageRows?: SubscriptionUsageMonitorRow[];
}): UserManagementSafeReadPageConfig {
  const rows = applyUserManagementSafeReadQuery(
    accounts.map((account) => createUserManagementSafeReadRow(
      account,
      entitlements,
      usageSummaryForAccount(account.id, usageRows)
    )),
    query
  );

  return {
    actionLabel: "Create User · Gated",
    actionGates: USER_MANAGEMENT_ACTION_GATES,
    detailAriaLabel: "User Management redacted detail panel",
    figmaNodeId: "59:4",
    filters: ["Status All", "Risk All", "Plan All", "Created Time Last 24h"],
    pagination: {
      displayTotalRows: rows.length,
      nextLabel: "Next",
      pageSize: 20,
      previousLabel: "Prev",
      showPageSummary: false,
      showWhenSinglePage: true
    },
    queryPlaceholder: "Search login email, plan, status...",
    rows,
    tableAriaLabel: "User Management redacted table"
  };
}

export function findUserManagementSafeReadIssues(config: UserManagementSafeReadPageConfig): string[] {
  const serialized = JSON.stringify(config);
  if (!UNSAFE_TEXT_PATTERN.test(serialized)) {
    return [];
  }

  return ["unsafe-user-management-text"];
}

function createUserManagementSafeReadRow(
  account: PlatformAccountSummary,
  entitlements: PlatformEntitlementSummary[],
  usageSummary?: UserManagementUsageSummary
): UserManagementSafeReadRow {
  const userId = safeRef(account.id);
  const email = publicEmailForAccount(account);
  const plan = selectPlan(account.id, entitlements);
  const accountPlan = subscriptionSummaryForAccount(account, entitlements, usageSummary, plan);
  const status = normalizeAccountStatus(account.status);
  const risk = deriveRisk(account, status.label, usageSummary);
  const row: UserManagementSafeReadRow = {
    createdDate: formatDate(account.createdAt),
    detail: { fields: [] },
    displayName: email,
    email,
    id: `user_management_${userId}`,
    lastAccess: formatDateTime(account.updatedAt),
    plan: plan.label,
    planTone: plan.tone,
    risk: risk.label,
    riskTone: risk.tone,
    status: status.label,
    statusTone: status.tone,
    userId
  };

  row.detail.fields = [
    { label: "Login Email", value: row.email },
    { label: "账户权益", value: accountPlan.current },
    { label: "可用时间", value: accountPlan.validity },
    { label: "共享月流量", value: accountPlan.monthlyTraffic },
    { label: "Status", tone: row.statusTone, value: row.status },
    { label: "Risk Level", tone: row.riskTone, value: row.risk },
    { label: "Created Date", value: row.createdDate },
    { label: "Last Access", value: row.lastAccess },
    { label: "权益记录", value: accountPlan.planRecords },
    ...usageDetailFields(usageSummary)
  ];

  return row;
}

function boundedCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function applyUserManagementSafeReadQuery<Row extends Pick<UserManagementSafeReadRow, "displayName" | "plan" | "risk" | "status" | "userId">>(
  rows: Row[],
  query: UserManagementSafeReadQuery | undefined
) {
  if (!query) {
    return rows;
  }

  const search = normalizeSafeSearchValue(query.search);
  const status = normalizeSafeFilterValue(query.status);
  const plan = normalizeSafeFilterValue(query.plan);
  const risk = normalizeSafeFilterValue(query.risk);

  return rows.filter((row) => {
    if (search && ![
      row.displayName,
      row.plan,
      row.status,
      row.risk,
      row.userId
    ].some((value) => value.toLowerCase().includes(search))) {
      return false;
    }

    if (status && row.status.toLowerCase() !== status) {
      return false;
    }

    if (plan && row.plan.toLowerCase() !== plan) {
      return false;
    }

    if (risk && row.risk.toLowerCase() !== risk) {
      return false;
    }

    return true;
  });
}

function deriveRisk(
  account: PlatformAccountSummary,
  normalizedStatus: string,
  usageSummary?: UserManagementUsageSummary
): { label: string; tone: MetricTone } {
  if (normalizedStatus === "Disabled" || normalizedStatus === "Locked") {
    return { label: "High", tone: "danger" };
  }

  if (usageSummary?.hasBlockedOrder || usageSummary?.hasOverQuota) {
    return { label: "High", tone: "danger" };
  }

  if (
    normalizedStatus === "Pending"
    || boundedCount(account.usableEntitlementCount) === 0
    || usageSummary?.hasNearQuota
    || (usageSummary?.pendingCollectionOrders ?? 0) > 0
    || (usageSummary?.warnings.length ?? 0) > 0
  ) {
    return { label: "Medium", tone: "warning" };
  }

  return { label: "Low", tone: "info" };
}

function publicEmailForAccount(account: PlatformAccountSummary): string {
  return safeEmailText(account.email)
    ?? safeEmailText(account.displayName)
    ?? EMAIL_NOT_AVAILABLE;
}

function safeEmailText(value: string | null | undefined): string | null {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || !PUBLIC_EMAIL_PATTERN.test(candidate) || UNSAFE_TEXT_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function formatDate(value: string | null): string {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : NOT_AVAILABLE;
}

function formatDateTime(value: string | null): string {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 16).replace("T", " ") : NOT_OBSERVED;
}

function normalizeAccountStatus(status: string): { label: string; tone: MetricTone } {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "active" || normalized === "enabled" || normalized === "usable") {
    return { label: "Active", tone: "success" };
  }

  if (normalized === "pending" || normalized === "pending_review" || normalized === "review") {
    return { label: "Pending", tone: "warning" };
  }

  if (normalized === "locked") {
    return { label: "Locked", tone: "danger" };
  }

  if (normalized === "disabled" || normalized === "suspended" || normalized === "blocked") {
    return { label: "Disabled", tone: "danger" };
  }

  return { label: "Review", tone: "warning" };
}

function normalizeSafeFilterValue(value: string | undefined): string {
  const safeValue = safeDisplayText(value);
  if (!safeValue || safeValue.toLowerCase() === "all") {
    return "";
  }

  return safeValue.toLowerCase();
}

function normalizeSafeSearchValue(value: string | undefined): string {
  const candidate = value?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!candidate || candidate === "all" || UNSAFE_TEXT_PATTERN.test(candidate)) {
    return "";
  }

  return candidate;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeDisplayText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim().replace(/\s+/g, " ");
  if (
    candidate.length === 0
    || PUBLIC_EMAIL_PATTERN.test(candidate.toLowerCase())
    || UNSAFE_TEXT_PATTERN.test(candidate)
  ) {
    return null;
  }

  return candidate;
}

function formatAccountPlanLabel(value: string | null | undefined): string | null {
  const candidate = safeDisplayText(value);
  if (!candidate) {
    return null;
  }

  const normalized = candidate.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "monthly_basic") return "Basic Monthly";
  if (normalized === "monthly_plus") return "Standard Monthly";
  if (normalized === "yearly") return "Yearly Plan";
  if (normalized === "monthly") return "Monthly Plan";
  if (normalized === "trial") return "Trial";
  return candidate
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function quotaNumber(entitlement: PlatformEntitlementSummary | undefined, key: string): number {
  const value = entitlement?.quota?.[key];
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function formatQuotaNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function safeRef(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized.length === 0 || UNSAFE_TEXT_PATTERN.test(normalized)) {
    return "account_ref";
  }

  return normalized;
}

function selectPlan(
  accountId: string,
  entitlements: PlatformEntitlementSummary[]
): SelectedAccountPlan {
  const accountEntitlements = entitlements.filter((entitlement) => entitlement.accountId === accountId);
  const entitlement = accountEntitlements.find((item) => item.usable) ?? accountEntitlements[0];
  const safePlan = formatAccountPlanLabel(entitlement?.plan);
  if (!safePlan || !entitlement) {
    return { label: "No Plan", tone: "neutral" };
  }

  return { entitlement, label: safePlan, tone: "info" };
}

function subscriptionSummaryForAccount(
  account: PlatformAccountSummary,
  entitlements: PlatformEntitlementSummary[],
  usageSummary: UserManagementUsageSummary | undefined,
  plan: SelectedAccountPlan
): UserManagementSubscriptionSummary {
  const accountEntitlements = entitlements.filter((entitlement) => entitlement.accountId === account.id);
  const startDate = earliestDate([
    account.createdAt,
    ...accountEntitlements.map((entitlement) => entitlement.createdAt ?? null)
  ]);
  const endDate = latestDate([
    ...accountEntitlements.map((entitlement) => entitlement.validUntil ?? null),
    usageSummary?.latestSubscriptionEndAt ?? null
  ]);

  const planRecords = `${boundedCount(account.entitlementCount)} records / ${boundedCount(account.usableEntitlementCount)} active`;
  if (plan.label === "No Plan" && !endDate) {
    return {
      current: "暂无有效套餐",
      monthlyTraffic: NOT_AVAILABLE,
      planRecords,
      validity: NOT_AVAILABLE
    };
  }

  const startLabel = startDate ? formatDate(startDate.toISOString()) : NOT_AVAILABLE;
  const endLabel = endDate ? formatDate(endDate.toISOString()) : NOT_AVAILABLE;
  const monthlyTraffic = quotaNumber(plan.entitlement, "trafficGb");

  return {
    current: endDate ? `${plan.label} credited until ${endLabel}` : `${plan.label} / validity not available`,
    monthlyTraffic: monthlyTraffic > 0 ? `${formatQuotaNumber(monthlyTraffic)} GB / 月` : NOT_AVAILABLE,
    planRecords,
    validity: startDate || endDate ? `${startLabel} - ${endLabel}` : NOT_AVAILABLE
  };
}

function usageSummaryForAccount(
  accountId: string,
  usageRows: SubscriptionUsageMonitorRow[]
): UserManagementUsageSummary | undefined {
  const rows = usageRows.filter((row) => rowBelongsToAccount(row, accountId));
  if (rows.length === 0) {
    return undefined;
  }

  const summary = rows.reduce<UserManagementUsageSummary>((current, row) => {
    const usedBytes = boundedNumber(row.usedBytes);
    const limitBytes = boundedNumber(row.trafficLimitBytes);
    const warnings = safeWarnings(row.warnings);
    const measured = row.usageMeasured || row.usageStatus === "measured" || row.usageStatus === "measured_zero";
    const blocked = isBlockedUsageRow(row);
    const latestUsageObservedAt = latestDateText(current.latestUsageObservedAt, latestDate([
      row.lastUsageObservedAt,
      ...row.channelUsages.map((channelUsage) => channelUsage.lastObservedAt)
    ]));
    const latestSubscriptionEndAt = latestDateText(current.latestSubscriptionEndAt, latestDate([
      row.validUntil,
      row.tenantExpiresAt
    ]));

    return {
      activeOrders: current.activeOrders + (blocked ? 0 : 1),
      hasBlockedOrder: current.hasBlockedOrder || blocked,
      hasNearQuota: current.hasNearQuota || (limitBytes > 0 && usedBytes >= limitBytes * 0.8 && usedBytes < limitBytes),
      hasOverQuota: current.hasOverQuota || (limitBytes > 0 && usedBytes >= limitBytes),
      latestSubscriptionEndAt,
      latestUsageObservedAt,
      measuredOrders: current.measuredOrders + (measured ? 1 : 0),
      pendingCollectionOrders: current.pendingCollectionOrders + (measured ? 0 : 1),
      totalDownloadBytes: current.totalDownloadBytes + boundedNumber(row.downloadBytes),
      totalOrders: current.totalOrders + 1,
      totalTrafficLimitBytes: current.totalTrafficLimitBytes + limitBytes,
      totalUploadBytes: current.totalUploadBytes + boundedNumber(row.uploadBytes),
      totalUsedBytes: current.totalUsedBytes + usedBytes,
      warnings: uniqueSafeText([...current.warnings, ...warnings])
    };
  }, {
    activeOrders: 0,
    hasBlockedOrder: false,
    hasNearQuota: false,
    hasOverQuota: false,
    latestSubscriptionEndAt: null,
    latestUsageObservedAt: null,
    measuredOrders: 0,
    pendingCollectionOrders: 0,
    totalDownloadBytes: 0,
    totalOrders: 0,
    totalTrafficLimitBytes: 0,
    totalUploadBytes: 0,
    totalUsedBytes: 0,
    warnings: []
  });

  return summary;
}

function usageDetailFields(summary: UserManagementUsageSummary | undefined): SafeReadDetailField[] {
  if (!summary) {
    return [];
  }

  return [
    { label: "Usage Records", value: `${summary.totalOrders} records / ${summary.activeOrders} active` },
    { label: "Usage", value: `${formatBytes(summary.totalUsedBytes)} used` },
    { label: "Upload / Download", value: `${formatBytes(summary.totalUploadBytes)} up / ${formatBytes(summary.totalDownloadBytes)} down` },
    { label: "Monthly Quota", value: formatQuota(summary.totalUsedBytes, summary.totalTrafficLimitBytes) },
    { label: "Usage Reporting", value: `${summary.measuredOrders} measured / ${summary.pendingCollectionOrders} pending` },
    { label: "Last Usage", value: formatDateTime(summary.latestUsageObservedAt) },
    { label: "Warnings", value: summary.warnings.length > 0 ? summary.warnings.join(", ") : "None" }
  ];
}

function rowBelongsToAccount(row: SubscriptionUsageMonitorRow, accountId: string) {
  const normalizedAccountId = accountId.trim();
  return row.accountId === normalizedAccountId || row.portalUserRef === normalizedAccountId;
}

function isBlockedUsageRow(row: SubscriptionUsageMonitorRow) {
  return [
    row.activityLevel,
    row.linkStatus,
    row.tenantStatus,
    row.artifactStatus
  ].some((status) => BLOCKED_ORDER_STATUSES.has(String(status || "").trim().toLowerCase()));
}

function boundedNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function earliestDate(values: Array<string | null | undefined>): Date | null {
  return values.reduce<Date | null>((earliest, value) => {
    const date = parseDate(value ?? null);
    if (!date) {
      return earliest;
    }

    if (!earliest || date.getTime() < earliest.getTime()) {
      return date;
    }

    return earliest;
  }, null);
}

function latestDate(values: Array<string | null | undefined>): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    const date = parseDate(value ?? null);
    if (!date) {
      return latest;
    }

    if (!latest || date.getTime() > latest.getTime()) {
      return date;
    }

    return latest;
  }, null);
}

function latestDateText(current: string | null, next: Date | null): string | null {
  const currentDate = parseDate(current);
  if (!currentDate) {
    return next ? next.toISOString() : null;
  }

  if (!next) {
    return current;
  }

  return next.getTime() > currentDate.getTime() ? next.toISOString() : current;
}

function formatBytes(value: number): string {
  return `${(boundedNumber(value) / (1024 ** 3)).toFixed(1)} GB`;
}

function formatQuota(usedBytes: number, quotaBytes: number): string {
  if (quotaBytes <= 0) {
    return `${formatBytes(usedBytes)} / unmetered`;
  }

  return `${formatBytes(usedBytes).replace(" GB", "")} / ${formatBytes(quotaBytes)}`;
}

function safeWarnings(warnings: string[]) {
  return uniqueSafeText(warnings.flatMap((warning) => {
    const safeWarning = safeDisplayText(warning);
    return safeWarning ? [safeWarning] : [];
  }));
}

function uniqueSafeText(values: string[]) {
  return [...new Set(values)];
}
