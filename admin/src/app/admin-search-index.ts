import {
  type AdminPage,
  consoleSections,
  pageContexts,
  pageSubNavigation,
  pageTitles
} from "./navigation";
import { type BlueprintPage } from "./admin-ui-projection";

export type AdminSearchResult = {
  id: string;
  capabilityState: "available" | "read-only" | "planned";
  type: "page" | "section" | "planned";
  title: string;
  description: string;
  eyebrow: string;
  group: "Active pages" | "Page sections" | "Planned routes";
  matchedField: string;
  objectType: "page" | "owner section" | "overview section" | "planned route";
  owner: string;
  routeTarget: string;
  statusLabel: string;
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

const UNSAFE_SEARCH_TEXT_PATTERN =
  /https?:\/\/|subscription\s*url|token|secret|credential|password|raw\s+(?:runtime\s+)?config|raw\s+logs?|raw\s+sqlite|sqlite\s+row|private\s+key|auth\s+header|bearer|env\b/i;

const PAGE_SEARCH_ALIASES: Record<AdminPage, string[]> = {
  dashboard: ["overview", "operations", "health", "risk", "action", "owner", "总览", "概览", "运营", "健康", "风险", "行动"],
  portalRequests: ["account", "accounts", "user", "users", "resource", "order", "quota", "lifecycle", "账户", "账号", "用户", "资源", "订单", "配额", "流量", "生命周期"],
  usageMonitor: ["usage", "traffic", "channel", "collection", "receipt", "anomaly", "用量", "流量", "通道", "渠道", "采集", "回执", "异常"]
};

const MODULE_SEARCH_ALIASES: Record<string, string[]> = {
  "health-summary": ["health", "summary", "risk", "freshness", "coverage", "健康", "概况", "总览", "风险", "新鲜度", "覆盖"],
  "risk-queue": ["risk", "case", "queue", "review", "incident", "风险", "案件", "队列", "审查", "异常"],
  "next-actions": ["action", "next", "route", "handoff", "operator", "行动", "后续", "路由", "交接", "操作员"],
  "review-candidates": ["review", "candidate", "risk", "owner route", "safe ref", "审查", "候选", "风险", "归属", "路由"],
  "account-overview": ["account", "accounts", "user", "directory", "create", "disable", "账户", "账号", "用户", "目录", "创建", "禁用"],
  "resource-orders": ["resource", "resources", "order", "orders", "subscription", "artifact", "资源", "订单", "订阅", "产物"],
  "quota-usage": ["quota", "traffic", "usage", "limit", "overage", "配额", "额度", "流量", "用量", "超额"],
  lifecycle: ["lifecycle", "pause", "archive", "restore", "disable", "生命周期", "暂停", "归档", "恢复", "禁用"],
  "history-events": ["history", "event", "events", "case", "audit", "历史", "事件", "案例", "审计"],
  freshness: ["freshness", "collection", "latency", "delay", "generated", "采集", "新鲜度", "延迟", "生成", "观测"],
  "channel-coverage": ["channel", "channels", "coverage", "route", "runtime", "通道", "渠道", "覆盖", "路由", "运行时"],
  "usage-ledger": ["usage", "ledger", "account", "order", "channel", "traffic", "用量", "流量", "账簿", "账户", "账号", "订单", "通道", "渠道"],
  "collection-anomalies": ["anomaly", "anomalies", "delay", "zero usage", "missing", "异常", "延迟", "零用量", "缺失", "候选"],
  "receipts-collectors": ["receipt", "receipts", "collector", "agent", "diagnostic", "回执", "收据", "采集器", "代理", "诊断"]
};

export function normalizeAdminSearchQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export function createAdminSearchResults({
  blueprints,
  query
}: {
  blueprints: BlueprintPage[];
  query: string;
}) {
  const normalizedQuery = normalizeAdminSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  return createAdminSearchCandidates(blueprints)
    .map((candidate) => {
      const matchedField = candidate.searchFields.find(({ value }) => value.includes(normalizedQuery))?.field;
      return matchedField ? { ...candidate, matchedField } : null;
    })
    .filter((candidate): candidate is AdminSearchCandidate & { matchedField: string } => candidate !== null)
    .map(({ searchFields: _searchFields, searchText: _searchText, ...result }) => result);
}

function createAdminSearchCandidates(blueprints: BlueprintPage[]) {
  const activeCandidates = blueprints.flatMap((blueprint) => {
    const pageResult = createSearchCandidate({
      capabilityState: "available",
      description: blueprint.description,
      eyebrow: pageContexts[blueprint.page].eyebrow,
      group: "Active pages",
      id: `${blueprint.page}:page`,
      objectType: "page",
      owner: pageContexts[blueprint.page].eyebrow,
      page: blueprint.page,
      routeTarget: pageTitles[blueprint.page],
      searchFields: [
        { field: "Route", value: blueprint.page },
        { field: "Page", value: pageTitles[blueprint.page] },
        { field: "Title", value: blueprint.title },
        { field: "Description", value: blueprint.description },
        { field: "Kicker", value: blueprint.kicker },
        { field: "Status", value: blueprint.statusLabel },
        { field: "Context", value: pageContexts[blueprint.page].description },
        { field: "Alias", value: PAGE_SEARCH_ALIASES[blueprint.page] }
      ],
      statusLabel: "Page",
      title: blueprint.title,
      type: "page"
    });

    const sectionResults = blueprint.modules.map((module) => {
      const navItem = pageSubNavigation[blueprint.page].find((item) => item.id === module.navId);
      return createSearchCandidate({
        capabilityState: navItem?.mode === "preview" ? "read-only" : "available",
        description: navItem?.description ?? module.purpose,
        eyebrow: pageTitles[blueprint.page],
        group: "Page sections",
        id: `${blueprint.page}:${module.navId}`,
        navId: module.navId,
        objectType: navItem?.mode === "preview" ? "overview section" : "owner section",
        owner: navItem?.owner ?? pageContexts[blueprint.page].eyebrow,
        page: blueprint.page,
        routeTarget: navItem?.targetId ?? module.navId,
        searchFields: [
          { field: "Route", value: blueprint.page },
          { field: "Page", value: pageTitles[blueprint.page] },
          { field: "Section", value: module.navId },
          { field: "Surface", value: module.uiSurface },
          { field: "Category", value: module.container.category },
          { field: "Container", value: module.container.container },
          { field: "Layout", value: module.container.layoutPolicy },
          { field: "Interaction", value: module.container.interactionModel },
          { field: "Label", value: navItem?.label },
          { field: "Description", value: navItem?.description },
          { field: "Owner", value: navItem?.owner },
          { field: "Alias", value: MODULE_SEARCH_ALIASES[module.navId] },
          { field: "Purpose", value: module.purpose },
          { field: "Content", value: module.contentFields },
          { field: "State", value: module.states },
          { field: "Ownership", value: module.ownership },
          { field: "Boundary", value: module.boundaries },
          { field: "Next step", value: module.nextStep }
        ],
        statusLabel: navItem?.mode === "preview" ? "Preview section" : "Owner section",
        targetId: navItem?.targetId ?? module.navId,
        title: navItem?.label ?? module.navId,
        type: "section"
      });
    });

    return [pageResult, ...sectionResults];
  });

  const plannedCandidates = consoleSections
    .filter((section) => section.status === "planned")
    .map((section) => createSearchCandidate({
      capabilityState: "planned",
      description: section.responsibility,
      eyebrow: "Planned",
      group: "Planned routes",
      id: `planned:${section.id}`,
      objectType: "planned route",
      owner: "Roadmap",
      routeTarget: "Roadmap gate",
      searchFields: [
        { field: "Page", value: section.label },
        { field: "Route", value: section.id },
        { field: "Description", value: section.description },
        { field: "Responsibility", value: section.responsibility },
        { field: "Gate", value: section.entryGate }
      ],
      statusLabel: "Planned",
      title: section.label,
      type: "planned"
    }));

  return [...activeCandidates, ...plannedCandidates];
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
