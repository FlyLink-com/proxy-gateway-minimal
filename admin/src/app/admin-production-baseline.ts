export type AdminProductionBaselinePageId =
  | "dashboard"
  | "portalRequests"
  | "usageMonitor"
  | "userManagement"
  | "orderRecords"
  | "nodeHealth"
  | "nodeBandwidth"
  | "userAccessLogs"
  | "userOperationLogs"
  | "nodeLogs";

export type AdminProductionBaselineGroupId = "monitor" | "manage" | "logs";
export type AdminProductionBaselineDataStatus = "unconnected" | "privileged-gated";

export type AdminProductionBaselineEnv = {
  DEV?: boolean | string;
  MODE?: string;
  PROD?: boolean | string;
  VITE_ADMIN_BASELINE_PREVIEW?: boolean | string;
};

export type AdminProductionBaselinePreviewGateInput = {
  env?: AdminProductionBaselineEnv;
  hash?: string;
  hostname?: string;
};

export type AdminProductionBaselinePage = {
  dataStatus: AdminProductionBaselineDataStatus;
  groupId: AdminProductionBaselineGroupId;
  id: AdminProductionBaselinePageId;
  label: string;
  privileged: boolean;
  summaryAreas?: readonly string[];
  tableFields?: readonly string[];
};

export const ADMIN_PRODUCTION_BASELINE_PAGE_IDS = [
  "dashboard",
  "portalRequests",
  "usageMonitor",
  "userManagement",
  "orderRecords",
  "nodeHealth",
  "nodeBandwidth",
  "userAccessLogs",
  "userOperationLogs",
  "nodeLogs"
] as const satisfies readonly AdminProductionBaselinePageId[];

export const ADMIN_PRODUCTION_BASELINE_GROUPS = [
  {
    id: "monitor",
    label: "监测",
    pageIds: ["dashboard", "portalRequests", "usageMonitor"]
  },
  {
    id: "manage",
    label: "管理",
    pageIds: ["userManagement", "orderRecords", "nodeHealth", "nodeBandwidth"]
  },
  {
    id: "logs",
    label: "日志",
    pageIds: ["userAccessLogs", "userOperationLogs", "nodeLogs"]
  }
] as const satisfies ReadonlyArray<{
  id: AdminProductionBaselineGroupId;
  label: string;
  pageIds: readonly AdminProductionBaselinePageId[];
}>;

export const ADMIN_PRODUCTION_BASELINE_PAGES: Record<AdminProductionBaselinePageId, AdminProductionBaselinePage> = {
  dashboard: {
    dataStatus: "unconnected",
    groupId: "monitor",
    id: "dashboard",
    label: "运营总览",
    privileged: false,
    summaryAreas: [
      "Platform health",
      "Risk",
      "Freshness",
      "Coverage",
      "Risk Queue",
      "Owner Routing",
      "Review",
      "Platform Metrics",
      "Platform Event Log"
    ]
  },
  portalRequests: {
    dataStatus: "unconnected",
    groupId: "monitor",
    id: "portalRequests",
    label: "账户与资源",
    privileged: false,
    tableFields: ["账户", "资源", "状态", "套餐", "最近活动"]
  },
  usageMonitor: {
    dataStatus: "unconnected",
    groupId: "monitor",
    id: "usageMonitor",
    label: "使用情况和渠道",
    privileged: false,
    tableFields: ["账户", "渠道", "用量", "采集新鲜度", "状态"]
  },
  userManagement: {
    dataStatus: "unconnected",
    groupId: "manage",
    id: "userManagement",
    label: "用户管理",
    privileged: false,
    tableFields: ["用户", "邮箱", "套餐", "状态", "最近访问"]
  },
  orderRecords: {
    dataStatus: "unconnected",
    groupId: "manage",
    id: "orderRecords",
    label: "订单记录",
    privileged: false,
    tableFields: ["订单", "账户", "套餐", "状态", "创建时间"]
  },
  nodeHealth: {
    dataStatus: "unconnected",
    groupId: "manage",
    id: "nodeHealth",
    label: "节点健康状况",
    privileged: false,
    tableFields: ["节点", "区域", "状态", "延迟", "最近心跳"]
  },
  nodeBandwidth: {
    dataStatus: "unconnected",
    groupId: "manage",
    id: "nodeBandwidth",
    label: "节点带宽",
    privileged: false,
    tableFields: ["节点", "入站", "出站", "利用率"]
  },
  userAccessLogs: {
    dataStatus: "privileged-gated",
    groupId: "logs",
    id: "userAccessLogs",
    label: "用户访问日志",
    privileged: true,
    tableFields: ["时间", "账户", "动作", "结果", "来源"]
  },
  userOperationLogs: {
    dataStatus: "privileged-gated",
    groupId: "logs",
    id: "userOperationLogs",
    label: "用户操作日志",
    privileged: true,
    tableFields: ["时间", "操作者", "对象", "动作", "结果"]
  },
  nodeLogs: {
    dataStatus: "privileged-gated",
    groupId: "logs",
    id: "nodeLogs",
    label: "节点日志",
    privileged: true,
    tableFields: ["时间", "节点", "级别", "事件"]
  }
};

export const ADMIN_PRODUCTION_BASELINE_EVIDENCE = {
  historicalSourceCommit: "UNKNOWN",
  notCurrentBackend: true,
  notNewlyBuiltOutput: true,
  publicAssets: [
    {
      bytes: 582452,
      filename: "index-DBS1EaJC.js",
      sha256: "7FE66A871C8E5F5094F29B7DB09D448BA01C6B2E7A01A168277E8E7273713DCB"
    },
    {
      bytes: 382111,
      filename: "index-C8cV34to.css",
      sha256: "31BF29505A98D2A21285C30A1B8332AFB97A49A1DBB26C933A71D61B59EA4944"
    }
  ],
  role: "observed-reference"
} as const;

function previewFlagEnabled(value: AdminProductionBaselineEnv["VITE_ADMIN_BASELINE_PREVIEW"]) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function decodeRouteSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isBaselinePageId(value: string): value is AdminProductionBaselinePageId {
  return (ADMIN_PRODUCTION_BASELINE_PAGE_IDS as readonly string[]).includes(value);
}

function readDefaultEnv(): AdminProductionBaselineEnv {
  return {
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
    PROD: import.meta.env.PROD,
    VITE_ADMIN_BASELINE_PREVIEW: import.meta.env.VITE_ADMIN_BASELINE_PREVIEW
  };
}

export function isAdminProductionBaselineLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  const unbracketed = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  return unbracketed === "localhost" || unbracketed === "127.0.0.1" || unbracketed === "::1";
}

export function isAdminProductionBaselinePreviewHash(hash: string) {
  const normalized = hash.trim();
  return normalized === "#/admin-baseline" || normalized.startsWith("#/admin-baseline/");
}

export function parseAdminProductionBaselinePreviewHash(hash: string): { page: AdminProductionBaselinePageId } | null {
  if (!isAdminProductionBaselinePreviewHash(hash)) {
    return null;
  }

  const remainder = hash.trim().slice("#/admin-baseline".length).replace(/^\//, "");
  const [pageSegment] = remainder
    .split("/")
    .map((segment) => decodeRouteSegment(segment.trim()))
    .filter(Boolean);

  return { page: pageSegment && isBaselinePageId(pageSegment) ? pageSegment : "dashboard" };
}

export function formatAdminProductionBaselinePreviewHash(page: AdminProductionBaselinePageId) {
  return `#/admin-baseline/${page}`;
}

export function isAdminProductionBaselinePreviewEnabled(
  input: AdminProductionBaselinePreviewGateInput = {}
) {
  const env = input.env ?? readDefaultEnv();
  const hostname = input.hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  const hash = input.hash ?? (typeof window === "undefined" ? "" : window.location.hash);

  return env.DEV === true
    && previewFlagEnabled(env.VITE_ADMIN_BASELINE_PREVIEW)
    && isAdminProductionBaselineLoopbackHostname(hostname)
    && isAdminProductionBaselinePreviewHash(hash);
}
