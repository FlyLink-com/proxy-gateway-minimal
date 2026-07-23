import { type AdminLanguagePack } from "./types";

export const adminZhCNLanguagePack: AdminLanguagePack = {
  id: "zh",
  label: "Chinese",
  nativeName: "简体中文",
  tag: "zh-CN",
  shell: {
    locale: "zh",
    htmlLang: "zh-CN",
    sidebar: {
      brandSubtitle: "代理网关",
      groups: {
        overview: "总览",
        "platform-monitoring": "平台监测",
        "user-supervision": "用户运营"
      },
      plannedGateAriaSuffix: "计划门禁",
      plannedGateLabel: "门禁",
      routeSuffix: "路由",
      routes: {
        dashboard: "运营总览",
        portalRequests: "账户与资源",
        usageMonitor: "使用情况与渠道",
        paymentLogs: "支付日志"
      },
      safetyDescription: "Admin UI 示例不展示 token、URL、凭据、运行配置或原始客户数据。",
      safetyDetail: "生产操作必须经过已批准的 runbook。",
      safetyTitle: "Risk A 门禁",
      workspaceAriaLabel: "工作区侧栏"
    },
    topBar: {
      accountAriaLabel: "操作员账户",
      accountControlsLabel: "操作员账户控制",
      accountName: "操作员",
      accountPopoverDescription: "仅用于生产监督。",
      accountPopoverGate: "运行时变更需要 Risk A 门禁。",
      accountRole: "生产只读",
      contexts: {
        dashboard: "总览",
        portalRequests: "用户运营",
        usageMonitor: "平台监测",
        paymentLogs: "用户运营"
      },
      languageLabel: "Admin 语言",
      languageOptions: {
        en: { ariaLabel: "切换 Admin 语言为英文", label: "EN" },
        zh: { ariaLabel: "切换 Admin 语言为中文", label: "中" }
      },
      pageStatus: {
        dashboard: "摘要和路由",
        portalRequests: "决策归属",
        usageMonitor: "证据归属",
        paymentLogs: "证据归属"
      },
      pageTitles: {
        dashboard: "运营总览",
        portalRequests: "账户与资源",
        usageMonitor: "使用情况与渠道",
        paymentLogs: "支付日志"
      },
      riskGateLabel: "Risk A 门禁",
      searchAriaLabel: "搜索 Admin 操作面板",
      searchLabel: "搜索账户、订单、渠道、案例",
      searchPlaceholders: {
        dashboard: "搜索账户、订单、渠道、案例",
        portalRequests: "搜索账户、订单、资源、配额",
        usageMonitor: "搜索用量、渠道、回执、异常",
        paymentLogs: "搜索支付尝试、扣款确定性、对账"
      }
    }
  }
};
