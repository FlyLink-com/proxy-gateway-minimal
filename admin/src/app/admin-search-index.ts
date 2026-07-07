import {
  type AdminPage,
  formatAdminRouteHash
} from "./navigation";
import {
  createAdminRegistrySearchIndex,
  getCapabilityScopedAdminApps,
  type AdminAppProductionImpact,
  type AdminAppSearchIndexEntry,
  type AdminAppStatus
} from "./admin-app-manifest";

export type AdminSearchResult = {
  id: string;
  capabilityState: "available" | "read-only" | "planned";
  type: "object" | "page" | "section" | "planned";
  businessArea: string;
  dataBoundary: "safe-summary-only";
  title: string;
  label: string;
  description: string;
  eyebrow: string;
  group: "Active pages" | "Page sections" | "Planned routes" | "Safe objects";
  matchedField: string;
  objectType:
    | "account"
    | "case"
    | "channel"
    | "node"
    | "order"
    | "overview section"
    | "owner section"
    | "page"
    | "planned route"
    | "quota policy"
    | "subscription"
    | "usage ledger";
  owner: string;
  ownerPage?: AdminPage;
  productionImpact: AdminAppProductionImpact;
  route: {
    action: "navigate" | "open-section" | "locked";
    page?: AdminPage;
    targetId?: string;
  };
  routeTarget: string;
  safetyLevel: "safe-summary-only";
  status: AdminAppStatus;
  statusLabel: string;
  tags: string[];
  forbiddenFields: string[];
  safeId?: string;
  page?: AdminPage;
  navId?: string;
  targetId?: string;
};

type AdminSearchField = {
  field: string;
  value: unknown;
};

type AdminSearchCandidate = Omit<AdminSearchResult, "matchedField"> & {
  searchFields: Array<{
    field: string;
    value: string;
  }>;
  searchText: string;
};

type AdminSafeSearchObjectType =
  | "account"
  | "case"
  | "channel"
  | "node"
  | "order"
  | "quota policy"
  | "subscription"
  | "usage ledger";

type AdminSafeSearchObjectDocument = {
  id: string;
  type: AdminSafeSearchObjectType;
  safeId: string;
  title: string;
  description: string;
  businessArea: string;
  owner: string;
  ownerPage?: AdminPage;
  navId?: string;
  targetId?: string;
  status: AdminAppStatus;
  statusLabel: string;
  capabilityState: AdminSearchResult["capabilityState"];
  productionImpact: AdminAppProductionImpact;
  tags: string[];
  searchableFields: string[];
};

const UNSAFE_SEARCH_TEXT_PATTERN =
  /https?:\/\/|subscription\s*url|token|secret|credential|password|raw\s+(?:runtime\s+)?config|raw\s+logs?|raw\s+sqlite|sqlite\s+row|private\s+key|auth\s+header|bearer|env\b/i;

const APPROVED_SYSTEM_SEARCH_TAGS: Record<string, string[]> = {
  "operations-overview": ["overview", "operations", "health", "risk", "action", "owner", "总览", "概览", "运营", "健康", "风险", "行动"],
  "accounts-resources": ["account", "accounts", "user", "users", "resource", "order", "quota", "lifecycle", "账户", "账号", "用户", "资源", "订单", "配额", "流量", "生命周期"],
  "usage-channels": ["usage", "traffic", "channel", "collection", "receipt", "anomaly", "用量", "流量", "通道", "渠道", "采集", "回执", "异常"],
  "plugin.health-summary": ["health", "summary", "risk", "freshness", "coverage", "健康", "概况", "总览", "风险", "新鲜度", "覆盖"],
  "plugin.risk-queue": ["risk", "case", "queue", "review", "incident", "风险", "案件", "队列", "审查", "异常"],
  "plugin.next-actions": ["action", "next", "route", "handoff", "operator", "行动", "后续", "路由", "交接", "操作员"],
  "plugin.review-candidates": ["review", "candidate", "risk", "owner route", "safe ref", "审查", "候选", "风险", "归属", "路由"],
  "plugin.account-overview": ["account", "accounts", "user", "directory", "create", "disable", "账户", "账号", "用户", "目录", "创建", "禁用"],
  "plugin.resource-orders": ["resource", "resources", "order", "orders", "subscription", "artifact", "资源", "订单", "订阅", "产物"],
  "plugin.quota-usage": ["quota", "traffic", "usage", "limit", "overage", "配额", "额度", "流量", "用量", "超额"],
  "plugin.lifecycle": ["lifecycle", "pause", "archive", "restore", "disable", "生命周期", "暂停", "归档", "恢复", "禁用"],
  "plugin.history-events": ["history", "event", "events", "case", "audit", "历史", "事件", "案例", "审计"],
  "plugin.freshness": ["freshness", "collection", "latency", "delay", "generated", "采集", "新鲜度", "延迟", "生成", "观测"],
  "plugin.channel-coverage": ["channel", "channels", "coverage", "route", "runtime", "通道", "渠道", "覆盖", "路由", "运行时"],
  "plugin.usage-ledger": ["usage", "ledger", "account", "order", "channel", "traffic", "用量", "流量", "账簿", "账户", "账号", "订单", "通道", "渠道"],
  "plugin.collection-anomalies": ["anomaly", "anomalies", "delay", "zero usage", "missing", "异常", "延迟", "零用量", "缺失", "候选"],
  "plugin.receipts-collectors": ["receipt", "receipts", "collector", "agent", "diagnostic", "回执", "收据", "采集器", "代理", "诊断"],
  "user-management": ["user", "users", "account", "management", "create", "disable", "status", "用户", "账号", "账户", "管理", "创建", "禁用"],
  "order-management": ["order", "orders", "record", "records", "payment", "ledger", "billing", "refund", "delivery", "subscription", "artifact", "lifecycle", "订单", "订单记录", "流水", "支付", "账务", "退款", "交付", "订阅", "产物", "生命周期"],
  "user-access-logs": ["access", "login", "logs", "audit", "event", "user", "访问", "登录", "日志", "审计", "事件", "用户"],
  "user-operation-logs": ["operation", "operator", "action", "logs", "audit", "event", "操作", "操作员", "动作", "日志", "审计", "事件"],
  "node-health": ["node", "health", "heartbeat", "diagnostic", "region", "latency", "节点", "健康", "心跳", "诊断", "延迟"],
  "node-logs": ["node", "logs", "severity", "message", "redacted", "runtime", "节点", "日志", "级别", "消息", "脱敏"],
  "node-bandwidth": ["node", "bandwidth", "traffic", "upload", "download", "throughput", "anomaly", "节点", "带宽", "流量", "上传", "下载", "吞吐", "异常"]
};

const ADMIN_SAFE_SEARCH_OBJECT_DOCUMENTS: readonly AdminSafeSearchObjectDocument[] = [
  {
    businessArea: "Accounts & Resources",
    capabilityState: "available",
    description: "Safe account reference for account directory, resource ownership, and lifecycle review.",
    id: "object.account.user_001",
    navId: "account-overview",
    owner: "Accounts & Resources",
    ownerPage: "portalRequests",
    productionImpact: "read-only",
    safeId: "user_001",
    searchableFields: ["user_001", "account user_001", "account directory", "enabled account", "账户 user_001", "账号 user_001"],
    status: "active",
    statusLabel: "Active account",
    tags: ["account", "user", "directory", "safe ref", "账户", "用户"],
    targetId: "user-supervision-account-overview",
    title: "Account user_001",
    type: "account"
  },
  {
    businessArea: "Accounts & Resources",
    capabilityState: "available",
    description: "Safe account reference for review state, resource count, and lifecycle planning.",
    id: "object.account.user_002",
    navId: "account-overview",
    owner: "Accounts & Resources",
    ownerPage: "portalRequests",
    productionImpact: "read-only",
    safeId: "user_002",
    searchableFields: ["user_002", "account user_002", "review account", "账户 user_002", "账号 user_002"],
    status: "active",
    statusLabel: "Review account",
    tags: ["account", "user", "review", "safe ref", "账户", "用户"],
    targetId: "user-supervision-account-overview",
    title: "Account user_002",
    type: "account"
  },
  {
    businessArea: "Accounts & Resources",
    capabilityState: "available",
    description: "Safe order reference for resources, subscription artifact ownership, and delivery state.",
    id: "object.order.ord_2048",
    navId: "resource-orders",
    owner: "Accounts & Resources",
    ownerPage: "portalRequests",
    productionImpact: "read-only",
    safeId: "ord_2048",
    searchableFields: ["ord_2048", "order ord_2048", "resource order", "subscription sub_8192", "订单 ord_2048"],
    status: "active",
    statusLabel: "Synced order",
    tags: ["order", "resource", "subscription", "artifact", "订单", "资源"],
    targetId: "user-supervision-resource-orders",
    title: "Order ord_2048",
    type: "order"
  },
  {
    businessArea: "Accounts & Resources",
    capabilityState: "available",
    description: "Safe subscription artifact reference linked to the resource/order owner page.",
    id: "object.subscription.sub_8192",
    navId: "resource-orders",
    owner: "Accounts & Resources",
    ownerPage: "portalRequests",
    productionImpact: "read-only",
    safeId: "sub_8192",
    searchableFields: ["sub_8192", "subscription sub_8192", "artifact sub_8192", "订阅 sub_8192"],
    status: "active",
    statusLabel: "Live artifact",
    tags: ["subscription", "artifact", "order", "订阅", "产物"],
    targetId: "user-supervision-resource-orders",
    title: "Subscription sub_8192",
    type: "subscription"
  },
  {
    businessArea: "Accounts & Resources",
    capabilityState: "available",
    description: "Safe quota policy object for user_001 and order ord_2048; quota decisions remain page-owned.",
    id: "object.quota.user_001.ord_2048",
    navId: "quota-usage",
    owner: "Accounts & Resources",
    ownerPage: "portalRequests",
    productionImpact: "read-only",
    safeId: "quota_policy:user_001:ord_2048",
    searchableFields: ["quota_policy", "user_001 quota", "ord_2048 quota", "near quota", "82% used", "配额 user_001", "额度 ord_2048"],
    status: "active",
    statusLabel: "Near quota",
    tags: ["quota", "usage", "traffic", "policy", "配额", "额度", "流量"],
    targetId: "user-supervision-quota-usage",
    title: "Quota policy user_001 / ord_2048",
    type: "quota policy"
  },
  {
    businessArea: "Usage & Channels",
    capabilityState: "available",
    description: "Safe channel reference for freshness, coverage, and usage evidence checks.",
    id: "object.channel.hk-01",
    navId: "channel-coverage",
    owner: "Usage & Channels",
    ownerPage: "usageMonitor",
    productionImpact: "read-only",
    safeId: "hk-01",
    searchableFields: ["hk-01", "channel hk-01", "freshness hk-01", "coverage hk-01", "通道 hk-01", "渠道 hk-01"],
    status: "active",
    statusLabel: "Covered channel",
    tags: ["channel", "coverage", "freshness", "usage", "通道", "渠道"],
    targetId: "platform-monitoring-channel-coverage",
    title: "Channel hk-01",
    type: "channel"
  },
  {
    businessArea: "Usage & Channels",
    capabilityState: "available",
    description: "Safe usage ledger row for account/order measured traffic review.",
    id: "object.usage-ledger.acct_001.ord_2048",
    navId: "usage-ledger",
    owner: "Usage & Channels",
    ownerPage: "usageMonitor",
    productionImpact: "read-only",
    safeId: "acct_001:ord_2048",
    searchableFields: ["acct_001", "ord_2048 traffic", "42.8GB", "usage ledger", "measured usage", "用量账簿", "流量 ord_2048"],
    status: "active",
    statusLabel: "Measured ledger",
    tags: ["usage", "ledger", "traffic", "account", "order", "用量", "流量"],
    targetId: "platform-monitoring-usage-ledger",
    title: "Usage ledger acct_001 / ord_2048",
    type: "usage ledger"
  },
  {
    businessArea: "Operations Overview",
    capabilityState: "read-only",
    description: "Safe risk case reference for owner-route triage; case close and approval remain out of scope.",
    id: "object.case.case_012",
    navId: "risk-queue",
    owner: "Operations Overview",
    ownerPage: "dashboard",
    productionImpact: "read-only",
    safeId: "case_012",
    searchableFields: ["case_012", "risk case", "ord_2048 risk", "SLA 4m", "风险 case_012", "案件 case_012"],
    status: "active",
    statusLabel: "Open risk case",
    tags: ["case", "risk", "review", "overview", "风险", "案件"],
    targetId: "dashboard-risk-queue",
    title: "Risk case case_012",
    type: "case"
  }
];

export function normalizeAdminSearchQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export function createAdminSearchResults({
  query
}: {
  query: string;
}) {
  const normalizedQuery = normalizeAdminSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  return createAdminSearchCandidates()
    .map((candidate) => {
      const matchedField = candidate.searchFields.find(({ value }) => value.includes(normalizedQuery))?.field;
      return matchedField ? { ...candidate, matchedField } : null;
    })
    .filter((candidate): candidate is AdminSearchCandidate & { matchedField: string } => candidate !== null)
    .map(({ searchFields: _searchFields, searchText: _searchText, ...result }) => result);
}

function createAdminSearchCandidates() {
  const searchableApps = getCapabilityScopedAdminApps()
    .filter((app) => app.kind === "page" || app.kind === "plugin" || app.kind === "planned");
  const registryCandidates = createAdminRegistrySearchIndex(searchableApps)
    .filter((entry) => entry.resultType === "page" || entry.resultType === "plugin" || entry.resultType === "planned")
    .map(createSearchCandidateFromRegistryEntry);
  const objectCandidates = ADMIN_SAFE_SEARCH_OBJECT_DOCUMENTS.map(createSearchCandidateFromSafeObject);

  return [
    ...registryCandidates,
    ...objectCandidates
  ];
}

function createSearchCandidateFromRegistryEntry(entry: AdminAppSearchIndexEntry) {
  const tags = approvedTagsForEntry(entry);
  return createSearchCandidate({
    capabilityState: capabilityStateForEntry(entry),
    businessArea: entry.ownerArea,
    dataBoundary: "safe-summary-only",
    description: entry.safeSummary,
    eyebrow: eyebrowForEntry(entry),
    forbiddenFields: ["token", "credential", "subscription URL", "raw config", "raw logs", "raw env", "SQLite row", "customer-private data"],
    group: groupForEntry(entry),
    id: entry.appId,
    label: entry.title,
    navId: entry.moduleNavId,
    objectType: objectTypeForEntry(entry),
    owner: entry.ownerArea,
    ownerPage: entry.pageId,
    page: entry.resultType === "planned" ? undefined : entry.pageId,
    productionImpact: productionImpactForEntry(entry),
    route: routeForEntry(entry),
    routeTarget: routeTargetForEntry(entry),
    safetyLevel: "safe-summary-only",
    searchFields: [
      { field: "App", value: entry.appId },
      { field: "Label", value: entry.title },
      { field: "Alias", value: entry.aliases },
      { field: "Owner", value: entry.ownerArea },
      { field: "Route", value: routeTargetForEntry(entry) },
      { field: "Approved tag", value: tags },
      { field: "Description", value: entry.safeSummary },
      { field: "Status", value: entry.state },
      { field: "Capability", value: entry.capabilities },
      { field: "Field", value: entry.searchableFields }
    ],
    status: entry.state,
    statusLabel: statusLabelForEntry(entry),
    tags,
    targetId: entry.targetId,
    title: entry.title,
    type: typeForEntry(entry)
  });
}

function createSearchCandidateFromSafeObject(document: AdminSafeSearchObjectDocument) {
  const route = routeForSafeObject(document);
  return createSearchCandidate({
    businessArea: document.businessArea,
    capabilityState: document.capabilityState,
    dataBoundary: "safe-summary-only",
    description: document.description,
    eyebrow: document.businessArea,
    forbiddenFields: ["token", "credential", "subscription URL", "raw config", "raw logs", "raw env", "SQLite row", "customer-private data"],
    group: "Safe objects",
    id: document.id,
    label: document.title,
    navId: document.navId,
    objectType: document.type,
    owner: document.owner,
    ownerPage: document.ownerPage,
    page: document.capabilityState === "planned" ? undefined : document.ownerPage,
    productionImpact: document.productionImpact,
    route,
    routeTarget: routeTargetForSafeObject(document),
    safeId: document.safeId,
    safetyLevel: "safe-summary-only",
    searchFields: [
      { field: "Object", value: document.type },
      { field: "Safe ID", value: document.safeId },
      { field: "Label", value: document.title },
      { field: "Business area", value: document.businessArea },
      { field: "Owner", value: document.owner },
      { field: "Route", value: routeTargetForSafeObject(document) },
      { field: "Approved tag", value: document.tags },
      { field: "Description", value: document.description },
      { field: "Status", value: document.statusLabel },
      { field: "Field", value: document.searchableFields }
    ],
    status: document.status,
    statusLabel: document.statusLabel,
    tags: document.tags,
    targetId: document.targetId,
    title: document.title,
    type: "object"
  });
}

function typeForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType">): AdminSearchResult["type"] {
  if (entry.resultType === "page") return "page";
  if (entry.resultType === "planned") return "planned";
  return "section";
}

function groupForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType">): AdminSearchResult["group"] {
  if (entry.resultType === "page") return "Active pages";
  if (entry.resultType === "planned") return "Planned routes";
  return "Page sections";
}

function objectTypeForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "ownerArea">): AdminSearchResult["objectType"] {
  if (entry.resultType === "page") return "page";
  if (entry.resultType === "planned") return "planned route";
  return entry.ownerArea === "Operations Overview" ? "overview section" : "owner section";
}

function statusLabelForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "ownerArea">) {
  if (entry.resultType === "page") return "Page";
  if (entry.resultType === "planned") return "Planned";
  return entry.ownerArea === "Operations Overview" ? "Preview section" : "Owner section";
}

function capabilityStateForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "ownerArea" | "state">): AdminSearchResult["capabilityState"] {
  if (entry.resultType === "planned" || entry.state === "planned") return "planned";
  if (entry.ownerArea === "Operations Overview" && entry.resultType === "plugin") return "read-only";
  return "available";
}

function productionImpactForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType">): AdminAppProductionImpact {
  return entry.resultType === "planned" ? "gated" : "read-only";
}

function eyebrowForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "ownerArea">) {
  return entry.resultType === "planned" ? "Planned" : entry.ownerArea;
}

function routeForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "pageId" | "targetId">): AdminSearchResult["route"] {
  if (entry.resultType === "planned" || !entry.pageId) {
    return { action: "locked" };
  }
  if (entry.targetId) {
    return {
      action: "open-section",
      page: entry.pageId,
      targetId: entry.targetId
    };
  }
  return {
    action: "navigate",
    page: entry.pageId
  };
}

function routeForSafeObject(document: Pick<AdminSafeSearchObjectDocument, "capabilityState" | "ownerPage" | "targetId">): AdminSearchResult["route"] {
  if (document.capabilityState === "planned" || !document.ownerPage) {
    return { action: "locked" };
  }
  return document.targetId
    ? {
      action: "open-section",
      page: document.ownerPage,
      targetId: document.targetId
    }
    : {
      action: "navigate",
      page: document.ownerPage
    };
}

function routeTargetForEntry(entry: Pick<AdminAppSearchIndexEntry, "resultType" | "pageId" | "moduleNavId">) {
  if (entry.resultType === "planned" || !entry.pageId) {
    return "Roadmap gate";
  }
  return formatAdminRouteHash(entry.pageId, entry.moduleNavId);
}

function routeTargetForSafeObject(document: Pick<AdminSafeSearchObjectDocument, "capabilityState" | "navId" | "ownerPage">) {
  if (document.capabilityState === "planned" || !document.ownerPage) {
    return "Roadmap gate";
  }
  return formatAdminRouteHash(document.ownerPage, document.navId);
}

function approvedTagsForEntry(entry: Pick<AdminAppSearchIndexEntry, "appId" | "moduleNavId" | "resultType">) {
  return [
    ...(APPROVED_SYSTEM_SEARCH_TAGS[entry.appId] ?? []),
    ...(entry.moduleNavId ? APPROVED_SYSTEM_SEARCH_TAGS[`plugin.${entry.moduleNavId}`] ?? [] : []),
    entry.resultType
  ];
}

function createSearchCandidate(result: Omit<AdminSearchResult, "matchedField"> & { searchFields: AdminSearchField[] }): AdminSearchCandidate {
  const { searchFields, ...searchResult } = result;
  const safeSearchFields = searchFields.flatMap(({ field, value }) => normalizeSearchFieldValues(value)
    .filter(isSafeSearchText)
    .map((safeValue) => ({
      field,
      value: safeValue.toLocaleLowerCase()
    })));

  return {
    ...searchResult,
    searchFields: safeSearchFields,
    searchText: safeSearchFields.map(({ value }) => value).join(" ")
  };
}

function normalizeSearchFieldValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeSearchFieldValues);
  }
  if (value === null || value === undefined) {
    return [];
  }
  const normalized = String(value).trim();
  return normalized ? [normalized] : [];
}

function isSafeSearchText(value: string) {
  return !UNSAFE_SEARCH_TEXT_PATTERN.test(value);
}
