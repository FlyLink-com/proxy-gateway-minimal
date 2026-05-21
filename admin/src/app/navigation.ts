import {
  Activity,
  Code2,
  Gauge,
  Network,
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";

export type AdminPage =
  | "overview"
  | "subscriptions"
  | "nodes"
  | "diagnostics"
  | "api-playground"
  | "settings";

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "subscriptions", label: "Subscriptions", icon: Users },
  { id: "nodes", label: "Nodes", icon: Network },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "api-playground", label: "API Playground", icon: Code2 },
  { id: "settings", label: "Settings", icon: Settings }
];

export const pageTitles: Record<AdminPage, string> = {
  overview: "Overview",
  subscriptions: "Subscriptions",
  nodes: "Nodes",
  diagnostics: "Diagnostics",
  "api-playground": "API Playground",
  settings: "Settings"
};
