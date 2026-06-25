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
  type: "page" | "section" | "planned";
  title: string;
  description: string;
  eyebrow: string;
  owner: string;
  statusLabel: string;
  page?: AdminPage;
  navId?: string;
  targetId?: string;
};

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
    .filter((candidate) => candidate.searchText.includes(normalizedQuery))
    .map(({ searchText: _searchText, ...result }) => result);
}

function createAdminSearchCandidates(blueprints: BlueprintPage[]) {
  const activeCandidates = blueprints.flatMap((blueprint) => {
    const pageResult = createSearchCandidate({
      description: blueprint.description,
      eyebrow: pageContexts[blueprint.page].eyebrow,
      id: `${blueprint.page}:page`,
      owner: pageContexts[blueprint.page].eyebrow,
      page: blueprint.page,
      searchParts: [
        blueprint.page,
        pageTitles[blueprint.page],
        blueprint.title,
        blueprint.description,
        blueprint.kicker,
        blueprint.statusLabel,
        pageContexts[blueprint.page].description,
        PAGE_SEARCH_ALIASES[blueprint.page]
      ],
      statusLabel: "Page",
      title: blueprint.title,
      type: "page"
    });

    const sectionResults = blueprint.modules.map((module) => {
      const navItem = pageSubNavigation[blueprint.page].find((item) => item.id === module.navId);
      return createSearchCandidate({
        description: navItem?.description ?? module.purpose,
        eyebrow: pageTitles[blueprint.page],
        id: `${blueprint.page}:${module.navId}`,
        navId: module.navId,
        owner: navItem?.owner ?? pageContexts[blueprint.page].eyebrow,
        page: blueprint.page,
        searchParts: [
          blueprint.page,
          pageTitles[blueprint.page],
          module.navId,
          module.uiSurface,
          module.container.category,
          module.container.container,
          module.container.layoutPolicy,
          module.container.interactionModel,
          navItem?.label,
          navItem?.description,
          navItem?.owner,
          MODULE_SEARCH_ALIASES[module.navId],
          module.purpose,
          module.contentFields,
          module.states,
          module.ownership,
          module.boundaries,
          module.nextStep
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
      description: section.responsibility,
      eyebrow: "Planned",
      id: `planned:${section.id}`,
      owner: "Roadmap",
      searchParts: [
        section.id,
        section.label,
        section.description,
        section.responsibility,
        section.entryGate
      ],
      statusLabel: "Planned",
      title: section.label,
      type: "planned"
    }));

  return [...activeCandidates, ...plannedCandidates];
}

function createSearchCandidate(result: AdminSearchResult & { searchParts: unknown[] }) {
  const { searchParts, ...searchResult } = result;
  return {
    ...searchResult,
    searchText: searchParts
      .flat()
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
  };
}
