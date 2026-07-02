import { type AdminLanguagePack } from "./types";

export const adminZhCNLanguagePack: AdminLanguagePack = {
  id: "zh",
  label: "Chinese",
  nativeName: "简体中文",
  tag: "zh-CN",
  shell: {
    locale: "zh",
    htmlLang: "zh-CN",
    login: {
      auth: {
        accountIdLabel: "账户 ID",
        accountPasswordLabel: "账户密码",
        adminIdLabel: "管理员 ID",
        adminPasswordLabel: "密码",
        adminSetupKeyLabel: "管理员设置密钥",
        approvedAdminIdPlaceholder: "已批准的管理员 ID",
        approvedPortalAccountIdPlaceholder: "已批准的门户账户 ID",
        authenticatorCodeLabel: "身份验证器验证码",
        authenticatorEnrollmentFormLabel: "身份验证器绑定步骤",
        authenticatorSetupButton: "开始绑定身份验证器",
        authenticatorSetupTitle: "账户身份验证器设置",
        authenticatorVerificationTitle: "Google 身份验证器验证",
        checkingPasswordLabel: "正在验证密码",
        confirmAuthenticatorButton: "确认身份验证器",
        confirmAuthenticatorFormLabel: "确认 Google 身份验证器设置",
        firstAdminSetupButton: "开始管理员设置",
        firstAdminSetupTitle: "首个管理员设置",
        fallbackError: "Admin 受保护认证失败。",
        issuerLabel: "签发方",
        loginButton: "登录",
        manualKeyLabel: "手动密钥",
        operatorLabel: "操作员",
        passwordFormLabel: "受保护 Admin 密码步骤",
        portalAccountLoginTitle: "门户账户登录",
        protectedAdminLoginTitle: "管理员账户登录",
        sixDigitCodeLabel: "6 位验证码",
        verifyAndOpenAdminButton: "验证并打开 Admin",
        verifyAuthenticatorFormLabel: "验证 Google 身份验证器验证码"
      },
      brandSubtitle: "操作控制台",
      panelAriaLabel: "受保护 Admin 登录表单",
      previewSite: "预览官网",
      title: "管理员登录"
    },
    pageFrame: {
      emptyWorkbenchDescription: "页面契约开放对应模块后，系统搜索可以路由到可用的页面自有区域。",
      emptyWorkbenchTitle: "当前没有可用页面面板。",
      evidenceSurfacesSuffix: "证据区域",
      modeLabels: {
        owner: "归属",
        preview: "预览"
      },
      moduleLayoutSuffix: "模块布局",
      pageDescriptions: {
        dashboard: "仅显示健康、风险路由和下一步行动；明细台账留在归属页面。"
      },
      pageHeaderAriaLabels: {
        dashboard: "运营总览页面标题区",
        portalRequests: "账户与资源页面标题区",
        usageMonitor: "使用情况和渠道页面标题区",
        userManagement: "用户管理页面标题区",
        orderManagement: "订单管理页面标题区",
        nodeHealth: "节点健康状况页面标题区",
        nodeBandwidth: "节点带宽页面标题区",
        userAccessLogs: "用户访问日志页面标题区",
        userOperationLogs: "用户操作日志页面标题区",
        nodeLogs: "节点日志页面标题区"
      },
      sections: {
        dashboard: {
          "health-summary": {
            label: "健康摘要",
            description: "平台健康、风险、新鲜度和渠道覆盖的总览摘要。"
          },
          "risk-queue": {
            label: "风险队列",
            description: "跨账户、订单、用量和渠道的复核入口。"
          },
          "next-actions": {
            label: "下一步行动",
            description: "把操作员路由到拥有详细集合的页面。"
          },
          "review-candidates": {
            label: "复核候选",
            description: "带有归属路由信号和安全引用的有界复核候选。"
          }
        },
        portalRequests: {
          "account-overview": {
            label: "账户目录",
            description: "安全账户引用、资源数量、风险状态和近期活动。"
          },
          "resource-orders": {
            label: "资源与订单",
            description: "订单、资源、权益、订阅工件和交付生命周期。"
          },
          "quota-usage": {
            label: "配额与用量",
            description: "默认配额、编辑后配额、总用量、采集覆盖、配额风险和复核状态。"
          },
          lifecycle: {
            label: "生命周期",
            description: "账户禁用、订单暂停、到期、撤销和归档候选。"
          },
          "history-events": {
            label: "历史与事件",
            description: "对象历史、案例候选和未来受限事件入口。"
          }
        },
        usageMonitor: {
          freshness: {
            label: "采集新鲜度",
            description: "生成时间、延迟阈值、未知状态和采集可信度。"
          },
          "channel-coverage": {
            label: "渠道覆盖",
            description: "已签发渠道、已测量渠道、缺失渠道和回执阻塞项。"
          },
          "usage-ledger": {
            label: "用量台账",
            description: "账户、订单、渠道和测量用量的安全台账。"
          },
          "collection-anomalies": {
            label: "采集异常",
            description: "采集延迟、真实零用量、未采集、采集器停用和缺失回执候选。"
          },
          "receipts-collectors": {
            label: "回执与采集器",
            description: "回执状态、采集器可用性和未来安全诊断入口。"
          }
        }
      },
      sectionsSuffix: "分区",
      summaryMetricsSuffix: "摘要指标"
    },
    sidebar: {
      brandSubtitle: "代理网关",
      groups: {
        "logs-audit": "日志和审计",
        management: "管理",
        monitoring: "监测"
      },
      plannedGateAriaSuffix: "计划门禁",
      plannedGateLabel: "门禁",
      plannedRoutesAriaLabel: "计划中的工作区路由",
      primaryRoutesAriaLabel: "主要工作区路由",
      routeSuffix: "路由",
      routes: {
        dashboard: "运营总览",
        portalRequests: "账户与资源",
        usageMonitor: "使用情况和渠道",
        userManagement: "用户管理",
        orderManagement: "订单管理",
        nodeHealth: "节点健康状况",
        nodeBandwidth: "节点带宽",
        userAccessLogs: "用户访问日志",
        userOperationLogs: "用户操作日志",
        nodeLogs: "节点日志"
      },
      safetyDescription: "Admin UI 示例不展示 token、URL、凭据、运行配置或原始客户数据。",
      safetyDetail: "生产操作必须经过已批准的 runbook。",
      safetyTitle: "Risk A 门禁",
      workspaceAriaLabel: "工作区侧栏",
      workspaceNavigationAriaLabel: "工作区导航"
    },
    topBar: {
      accountAriaLabel: "操作员账户",
      accountControlsLabel: "操作员账户控制",
      accountName: "操作员",
      accountPopoverDescription: "仅用于生产监督。",
      accountPopoverGate: "运行时变更需要 Risk A 门禁。",
      accountRole: "安全复核",
      contexts: {
        dashboard: "监测",
        portalRequests: "监测",
        usageMonitor: "监测",
        userManagement: "管理",
        orderManagement: "管理",
        nodeHealth: "管理",
        nodeBandwidth: "管理",
        userAccessLogs: "日志和审计",
        userOperationLogs: "日志和审计",
        nodeLogs: "日志和审计"
      },
      languageLabel: "Admin 语言",
      languageOptions: {
        en: { ariaLabel: "切换 Admin 语言为英文", label: "EN" },
        zh: { ariaLabel: "切换 Admin 语言为中文", label: "中" }
      },
      pageStatus: {
        dashboard: "运营",
        portalRequests: "账户",
        usageMonitor: "用量",
        userManagement: "用户",
        orderManagement: "订单",
        nodeHealth: "节点健康",
        nodeBandwidth: "带宽",
        userAccessLogs: "访问日志",
        userOperationLogs: "操作日志",
        nodeLogs: "节点日志"
      },
      pageTitles: {
        dashboard: "运营总览",
        portalRequests: "账户与资源",
        usageMonitor: "使用情况和渠道",
        userManagement: "用户管理",
        orderManagement: "订单管理",
        nodeHealth: "节点健康状况",
        nodeBandwidth: "节点带宽",
        userAccessLogs: "用户访问日志",
        userOperationLogs: "用户操作日志",
        nodeLogs: "节点日志"
      },
      production: "生产",
      riskGateLabel: "Risk A 门禁状态",
      riskGateTitle: "Risk A 门禁",
      searchAriaLabel: "搜索 Admin 操作面板",
      searchLabel: "搜索用户、订单、渠道、案例或事件",
      searchPlaceholders: {
        dashboard: "搜索用户、订单、渠道...",
        portalRequests: "搜索账户、订单、生命周期...",
        usageMonitor: "搜索用量、渠道、回执...",
        userManagement: "搜索用户、套餐、状态...",
        orderManagement: "搜索订单、账户引用、交付...",
        nodeHealth: "搜索节点、区域、心跳...",
        nodeBandwidth: "搜索带宽、流量、异常...",
        userAccessLogs: "搜索用户访问事件...",
        userOperationLogs: "搜索操作动作...",
        nodeLogs: "搜索脱敏节点日志..."
      }
    }
  }
};
