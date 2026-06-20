export const ADMIN_HIERARCHY_ROLES = [
  "metric",
  "context",
  "action",
  "detail",
  "state",
  "evidence"
] as const;

export type AdminHierarchyRole = (typeof ADMIN_HIERARCHY_ROLES)[number];

export type AdminHierarchyRule = {
  role: AdminHierarchyRole;
  order: number;
  required: boolean;
};

export const ADMIN_HIERARCHY_RULES: readonly AdminHierarchyRule[] = [
  { order: 1, required: true, role: "metric" },
  { order: 2, required: true, role: "context" },
  { order: 3, required: true, role: "state" },
  { order: 4, required: false, role: "action" },
  { order: 5, required: true, role: "evidence" },
  { order: 6, required: false, role: "detail" }
] as const;
