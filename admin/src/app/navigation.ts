import { Activity, Inbox, LayoutDashboard, type LucideIcon } from "lucide-react";

export type AdminPage =
  | "dashboard"
  | "portalRequests"
  | "usageMonitor";

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { id: "dashboard", label: "运营总览", icon: LayoutDashboard },
  { id: "portalRequests", label: "订单管理", icon: Inbox },
  { id: "usageMonitor", label: "用量监护", icon: Activity }
];

export const pageTitles: Record<AdminPage, string> = {
  dashboard: "运营总览",
  portalRequests: "订单管理",
  usageMonitor: "用量监护"
};
