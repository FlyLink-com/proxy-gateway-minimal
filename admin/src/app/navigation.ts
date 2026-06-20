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

export type ConsoleSectionStatus = "active" | "planned";

export type ConsoleSection = NavSection & {
  status: ConsoleSectionStatus;
  responsibility: string;
  entryGate: string;
};

export const consoleSections: ConsoleSection[] = [
  {
    id: "overview",
    label: "总览",
    description: "平台健康与风险",
    status: "active",
    responsibility: "监管控制台的第一屏，汇总平台健康、异常风险和近期安全活动。",
    entryGate: "已存在运营总览页面和安全摘要数据源。",
    items: [
      { id: "dashboard", label: "运营总览", icon: LayoutDashboard }
    ]
  },
  {
    id: "user-supervision",
    label: "用户监管",
    description: "账号、资源与额度",
    status: "active",
    responsibility: "监管用户账号、资源、订单、订阅产物和流量额度。",
    entryGate: "已存在账号与资源页面，并且只展示 safe refs 和脱敏状态。",
    items: [
      { id: "portalRequests", label: "账号与资源", icon: Users }
    ]
  },
  {
    id: "platform-monitoring",
    label: "平台监控",
    description: "用量采集与通道",
    status: "active",
    responsibility: "监管 usage accounting、采集状态、通道健康和异常订阅。",
    entryGate: "已存在流量与通道页面，并且不暴露 token、URL 或 credential。",
    items: [
      { id: "usageMonitor", label: "流量与通道", icon: Activity }
    ]
  },
  {
    id: "audit-workflow",
    label: "审计与工单",
    description: "Case、历史与审计",
    status: "planned",
    responsibility: "承载 durable Case、对象历史、审计备注、关闭原因和复核流。",
    entryGate: "等待 GCC-55 durable Case/history 后端事实对接完成。",
    items: []
  },
  {
    id: "platform-development",
    label: "平台开发",
    description: "通道、节点与策略工具",
    status: "planned",
    responsibility: "承载通道实验、节点接入、策略建议和平台扩展工具。",
    entryGate: "等待真实平台开发工具具备对象模型、数据源、安全边界和测试。",
    items: []
  },
  {
    id: "system-settings",
    label: "系统设置",
    description: "私有 operator 设置",
    status: "planned",
    responsibility: "承载私有 operator 设置和本地控制台配置。",
    entryGate: "等待设置项具备私有访问边界、非目标和验证路径。",
    items: []
  }
];

export const navSections: NavSection[] = consoleSections.filter((section) => section.status === "active");

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
