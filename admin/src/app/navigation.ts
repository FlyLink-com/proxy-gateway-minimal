import { Gauge, Network, Users, type LucideIcon } from "lucide-react";

export type AdminPage =
  | "overview"
  | "subscriptions"
  | "nodes";

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "subscriptions", label: "Subscriptions", icon: Users },
  { id: "nodes", label: "Nodes", icon: Network }
];

export const pageTitles: Record<AdminPage, string> = {
  overview: "Overview",
  subscriptions: "Subscriptions",
  nodes: "Nodes"
};
