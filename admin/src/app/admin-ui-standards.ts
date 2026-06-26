import { type AdminContentContainmentStrategy } from "./admin-ui-projection";

export const ADMIN_PAGINATION_STANDARD = {
  acceptance: [
    "Each long card names pagination, route split, or bounded internal scroll before implementation.",
    "Pagination stays inside the data card; no floating page-level pager or duplicated header controls.",
    "If a page exceeds the standard viewport, move content to a subpage or paginated list.",
    "Mobile is not accepted from desktop reuse until a dedicated mobile standard frame is approved."
  ],
  containmentStrategies: [
    "pagination",
    "route-split",
    "bounded-internal-scroll"
  ] satisfies AdminContentContainmentStrategy[],
  defaultPageSize: 10,
  doNotPaginate: [
    "health-cards",
    "kpi-summaries",
    "tiny-status-groups",
    "system-search",
    "action-chips"
  ],
  id: "admin-pagination-standard/v1",
  maxPageSize: 100,
  mobileStatus: "pending-dedicated-standard",
  prohibitedStrategies: [
    "page-level-scroll-wall",
    "floating-page-level-pager",
    "duplicated-header-pagination"
  ],
  requiredStates: [
    "default",
    "current",
    "disabled",
    "loading",
    "empty",
    "error",
    "unknown-total",
    "filtered-reset"
  ],
  requiredViewports: [
    "1600",
    "1280",
    "1024"
  ],
  splitRouteFor: [
    "details",
    "diagnosis",
    "drill-down",
    "resolver-flows",
    "high-context-review"
  ],
  usePaginationFor: [
    "users",
    "orders",
    "subscriptions",
    "channel-tables",
    "usage-ledgers",
    "audit-events",
    "receipts",
    "candidate-queues"
  ]
} as const;
