import { ClipboardCheck, Gauge, Inbox, Network, Users, type LucideIcon } from "lucide-react";

export type AdminPage =
  | "overview"
  | "portalRequests"
  | "provisioning"
  | "subscriptions"
  | "nodes";

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "portalRequests", label: "Portal Requests", icon: Inbox },
  { id: "provisioning", label: "Provisioning", icon: ClipboardCheck },
  { id: "subscriptions", label: "Subscriptions", icon: Users },
  { id: "nodes", label: "Nodes", icon: Network }
];

export const pageTitles: Record<AdminPage, string> = {
  overview: "Overview",
  portalRequests: "Portal Requests",
  provisioning: "Provisioning",
  subscriptions: "Subscriptions",
  nodes: "Nodes"
};
