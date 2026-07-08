import { type BlueprintPage } from "./admin-ui-projection";
import {
  createAdminSafeReadProjections,
  type AdminSafeReadMutationPolicy,
  type AdminSafeReadProjection
} from "./admin-safe-read-projection";
import { type AdminAppDataBoundary, type AdminAppMap } from "./admin-app-manifest";
import { type AdminPage, type PageSubNavigationMode, type PageWorkbenchRole } from "./navigation";
import { type AdminUiSurfaceKey } from "./admin-ui-reference-model";

export const ADMIN_TABLE_QUERY_STATE_SCHEMA = "admin-table-query-state/v1";

export type AdminTableQueryStateSchema = typeof ADMIN_TABLE_QUERY_STATE_SCHEMA;
export type AdminTableFilterKey = AdminSafeReadProjection["query"]["filterKeys"][number];
export type AdminTableSortKey = AdminSafeReadProjection["query"]["sortKeys"][number];
export type AdminTableSortDirection = "asc" | "desc";

export type AdminTableQueryFilters = Record<AdminTableFilterKey, string>;

export type AdminTableQueryState = {
  schemaVersion: AdminTableQueryStateSchema;
  allowedDisplayFields: string[];
  allowedFilterKeys: AdminTableFilterKey[];
  allowedSortKeys: AdminTableSortKey[];
  dataBoundary: AdminAppDataBoundary;
  filters: AdminTableQueryFilters;
  label: string;
  maxPageSize: number;
  mutationPolicy: AdminSafeReadMutationPolicy;
  navId: string;
  owner: string;
  ownerMode: PageSubNavigationMode;
  page: AdminPage;
  pageIndex: number;
  pageRole: PageWorkbenchRole;
  pageSize: number;
  routeScope: string;
  sort: {
    direction: AdminTableSortDirection;
    key: AdminTableSortKey;
  };
  targetId: string;
  uiSurface: AdminUiSurfaceKey;
};

export type AdminTableQueryStateOverrides = {
  filters?: Record<string, unknown>;
  pageIndex?: unknown;
  pageSize?: unknown;
  sort?: {
    direction?: unknown;
    key?: unknown;
  };
};

export type AdminTableResultWindow = {
  firstItem: number;
  lastItem: number;
  pageIndex: number;
  totalItems: number;
  totalPages: number;
};

export type AdminTableQueryStateIssueCode =
  | "invalid-page-index"
  | "invalid-page-size"
  | "unsafe-filter-value"
  | "unsafe-display-field"
  | "unsafe-mutation-policy";

export type AdminTableQueryStateIssue = {
  code: AdminTableQueryStateIssueCode;
  message: string;
  navId: string;
  page: AdminPage;
};

const TABLE_QUERY_UNSAFE_TEXT_PATTERN =
  /https?:\/\/|subscription\s*url|subscriptionUrl|token|secret|credential|password|raw\s*(?:session|env|config|logs?|db|sqlite|runtime|operator|subscription|material)|sqlite\s*row|private\s*key|auth\s*header|bearer/i;

export function createAdminTableQueryStates(
  blueprints: readonly BlueprintPage[],
  appMap?: AdminAppMap
): AdminTableQueryState[] {
  return createAdminSafeReadProjections(blueprints, appMap)
    .filter((projection) => projection.query.pagination.required)
    .map((projection) => createAdminTableQueryState(projection));
}

export function createAdminTableQueryState(
  projection: AdminSafeReadProjection,
  overrides: AdminTableQueryStateOverrides = {}
): AdminTableQueryState {
  const pageSize = clampInteger(
    overrides.pageSize,
    projection.query.pagination.defaultPageSize,
    1,
    projection.query.pagination.maxPageSize
  );

  return {
    allowedDisplayFields: [...projection.allowedDisplayFields],
    allowedFilterKeys: [...projection.query.filterKeys],
    allowedSortKeys: [...projection.query.sortKeys],
    dataBoundary: projection.dataBoundary,
    filters: normalizeFilters(projection, overrides.filters),
    label: projection.label,
    maxPageSize: projection.query.pagination.maxPageSize,
    mutationPolicy: projection.mutationPolicy,
    navId: projection.navId,
    owner: projection.owner,
    ownerMode: projection.ownerMode,
    page: projection.page,
    pageIndex: clampInteger(overrides.pageIndex, 1, 1, Number.MAX_SAFE_INTEGER),
    pageRole: projection.pageRole,
    pageSize,
    routeScope: routeScopeForProjection(projection),
    schemaVersion: ADMIN_TABLE_QUERY_STATE_SCHEMA,
    sort: normalizeSort(projection, overrides.sort),
    targetId: projection.targetId,
    uiSurface: projection.uiSurface
  };
}

export function findAdminTableQueryStateIssues(
  states: readonly AdminTableQueryState[]
): AdminTableQueryStateIssue[] {
  return states.flatMap((state) => {
    const issues: AdminTableQueryStateIssue[] = [];

    if (state.pageIndex < 1) {
      issues.push(issue("invalid-page-index", state, "Table query state pageIndex must be 1 or greater."));
    }

    if (state.pageSize < 1 || state.pageSize > state.maxPageSize) {
      issues.push(issue("invalid-page-size", state, "Table query state pageSize must stay inside the projection bounds."));
    }

    Object.values(state.filters).forEach((value) => {
      if (isUnsafeTableQueryText(value)) {
        issues.push(issue("unsafe-filter-value", state, "Filter values must not include raw logs, tokens, credentials, URLs, or SQLite labels."));
      }
    });

    state.allowedDisplayFields.forEach((field) => {
      if (isUnsafeTableQueryText(field)) {
        issues.push(issue("unsafe-display-field", state, "Table display fields must stay redacted and safe-summary only."));
      }
    });

    if (state.mutationPolicy !== "read-only-no-mutation") {
      issues.push(issue("unsafe-mutation-policy", state, "Table query state cannot expose mutation policy in Phase 2."));
    }

    return issues;
  });
}

export function projectAdminTableResultWindow(
  state: AdminTableQueryState,
  totalItems: number
): AdminTableResultWindow {
  const safeTotalItems = Math.max(0, Math.floor(totalItems));
  const pageSize = clampInteger(state.pageSize, 1, 1, state.maxPageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / pageSize));
  const pageIndex = safeTotalItems === 0
    ? 1
    : clampInteger(state.pageIndex, 1, 1, totalPages);

  if (safeTotalItems === 0) {
    return {
      firstItem: 0,
      lastItem: 0,
      pageIndex,
      totalItems: safeTotalItems,
      totalPages
    };
  }

  return {
    firstItem: ((pageIndex - 1) * pageSize) + 1,
    lastItem: Math.min(safeTotalItems, pageIndex * pageSize),
    pageIndex,
    totalItems: safeTotalItems,
    totalPages
  };
}

function normalizeFilters(
  projection: AdminSafeReadProjection,
  overrides: AdminTableQueryStateOverrides["filters"]
): AdminTableQueryFilters {
  const filters = Object.fromEntries(
    projection.query.filterKeys.map((key) => [
      key,
      key === "route" ? routeScopeForProjection(projection) : "all"
    ])
  ) as AdminTableQueryFilters;

  if (!overrides) {
    return filters;
  }

  const allowedFilterKeys = new Set<string>(projection.query.filterKeys);
  Object.entries(overrides).forEach(([key, value]) => {
    if (!allowedFilterKeys.has(key)) {
      return;
    }
    const normalizedValue = normalizeString(value);
    if (!normalizedValue || isUnsafeTableQueryText(normalizedValue)) {
      return;
    }
    filters[key as AdminTableFilterKey] = normalizedValue;
  });

  return filters;
}

function normalizeSort(
  projection: AdminSafeReadProjection,
  sort: AdminTableQueryStateOverrides["sort"]
): AdminTableQueryState["sort"] {
  const allowedSortKeys = new Set<string>(projection.query.sortKeys);
  const key = normalizeString(sort?.key);
  const direction = normalizeString(sort?.direction);

  return {
    direction: direction === "asc" || direction === "desc" ? direction : "desc",
    key: key && allowedSortKeys.has(key) ? key as AdminTableSortKey : "updatedAt"
  };
}

function routeScopeForProjection(projection: AdminSafeReadProjection) {
  return `${projection.page}#${projection.targetId}`;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numericValue)));
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUnsafeTableQueryText(value: string) {
  return TABLE_QUERY_UNSAFE_TEXT_PATTERN.test(value);
}

function issue(
  code: AdminTableQueryStateIssueCode,
  state: AdminTableQueryState,
  message: string
): AdminTableQueryStateIssue {
  return {
    code,
    message,
    navId: state.navId,
    page: state.page
  };
}
