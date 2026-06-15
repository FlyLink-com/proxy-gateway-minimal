import { Activity, LayoutDashboard, Users, type LucideIcon } from "lucide-react";

export type AdminPage =
  | "dashboard"
  | "portalRequests"
  | "usageMonitor";

export type NavItem = {
  id: AdminPage;
  label: string;
  icon: LucideIcon;
};

export type NavSection = {
  id: string;
  label: string;
  description: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    id: "overview",
    label: "总览",
    description: "平台健康与风险",
    items: [
      { id: "dashboard", label: "运营总览", icon: LayoutDashboard }
    ]
  },
  {
    id: "user-supervision",
    label: "用户监管",
    description: "账号、资源与额度",
    items: [
      { id: "portalRequests", label: "账号与资源", icon: Users }
    ]
  },
  {
    id: "platform-monitoring",
    label: "平台监控",
    description: "用量采集与通道",
    items: [
      { id: "usageMonitor", label: "流量与通道", icon: Activity }
    ]
  }
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export const pageTitles: Record<AdminPage, string> = {
  dashboard: "运营总览",
  portalRequests: "账号与资源",
  usageMonitor: "流量与通道"
};

export const pageContexts: Record<AdminPage, { eyebrow: string; description: string }> = {
  dashboard: {
    eyebrow: "总览",
    description: "平台健康、风险摘要和近期活动"
  },
  portalRequests: {
    eyebrow: "用户监管",
    description: "账号、资源、订单和流量额度"
  },
  usageMonitor: {
    eyebrow: "平台监控",
    description: "用量采集、通道健康和异常订阅"
  }
};
