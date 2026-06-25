export const ADMIN_COMPONENT_ROLE_GROUPS = [
  "system",
  "container",
  "content",
  "control",
  "state"
] as const;

export type AdminComponentRoleGroup = (typeof ADMIN_COMPONENT_ROLE_GROUPS)[number];

export type AdminComponentGrammar = {
  role: AdminComponentRoleGroup;
  owns: readonly string[];
  forbiddenResponsibilities: readonly string[];
};

export const ADMIN_COMPONENT_GRAMMAR: Record<AdminComponentRoleGroup, AdminComponentGrammar> = {
  system: {
    forbiddenResponsibilities: [
      "raw-data-rendering",
      "page-specific-business-logic"
    ],
    owns: [
      "topbar",
      "sidebar",
      "workspace-shell"
    ],
    role: "system"
  },
  container: {
    forbiddenResponsibilities: [
      "credential-display",
      "raw-log-display",
      "mutation-without-gate"
    ],
    owns: [
      "page-frame",
      "panel-frame",
      "module-board"
    ],
    role: "container"
  },
  content: {
    forbiddenResponsibilities: [
      "outer-chrome",
      "layout-resize-controls"
    ],
    owns: [
      "metric",
      "table",
      "queue",
      "timeline"
    ],
    role: "content"
  },
  control: {
    forbiddenResponsibilities: [
      "production-execution",
      "credential-mutation"
    ],
    owns: [
      "navigation",
      "search",
      "owner-page-route"
    ],
    role: "control"
  },
  state: {
    forbiddenResponsibilities: [
      "fake-live-data",
      "raw-secret-fallback"
    ],
    owns: [
      "loading",
      "empty",
      "stale",
      "error",
      "locked"
    ],
    role: "state"
  }
} as const;
