import {
  ArrowRight,
  ArrowLeft,
  Activity,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  Globe2,
  HelpCircle,
  Layers,
  Laptop,
  LockKeyhole,
  Menu,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Users,
  Wifi,
  Zap
} from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";

const siteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const leadEndpoint = (siteEnv.VITE_PUBLIC_LEAD_ENDPOINT ?? "").trim() || "/api/public/leads";
const portalPanelUrl = "https://portal.gccwebos.com/";
const portalRegisterUrl = "https://portal.gccwebos.com/portal/register/";
const loginUrl = (siteEnv.VITE_PUBLIC_LOGIN_URL ?? "").trim() || portalPanelUrl;
const registerUrl = (siteEnv.VITE_PUBLIC_REGISTER_URL ?? "").trim() || portalRegisterUrl;

const companySiteSectionIds = [
  "top",
  "features",
  "how-it-works",
  "pricing",
  "contact",
  "faq"
] as const;

type BillingPeriod = "monthly" | "annual";
type Locale = "en" | "zh";
type CompanySiteInfoPageSlug =
  | "features"
  | "pricing"
  | "download"
  | "changelog"
  | "terms"
  | "privacy"
  | "acceptable-use"
  | "help"
  | "contact"
  | "status";

const localeOptions: Locale[] = ["zh", "en"];
const companySiteInfoPageSlugs: CompanySiteInfoPageSlug[] = [
  "features",
  "pricing",
  "download",
  "changelog",
  "terms",
  "privacy",
  "acceptable-use",
  "help",
  "contact",
  "status"
];
const companySiteLocaleStorageKey = "gccwebos-site-locale";

const localeLabels: Record<Locale, { lang: string; name: string; short: string }> = {
  en: { lang: "en", name: "English", short: "EN" },
  zh: { lang: "zh-CN", name: "中文", short: "中" }
};

const companySiteCopy = {
  en: {
    meta: {
      title: "GCC WebOS - VPN Secure Access"
    },
    aria: {
      brandHome: "GCC WebOS home",
      dashboard: "GCC WebOS Dashboard preview",
      footer: "GCC WebOS public footer",
      language: "Language",
      navigation: "GCC WebOS website navigation",
      openNavigation: "Open navigation",
      paymentOptions: "GCC WebOS payment options",
      serviceQualities: "GCC WebOS service qualities",
      trustSignals: "GCC WebOS trust signals"
    },
    nav: {
      features: "Features",
      pricing: "Pricing",
      contact: "Contact",
      support: "Support"
    },
    actions: {
      register: "Register",
      signIn: "Sign in",
      trial: "Register for 7-day trial",
      viewPlans: "View plans"
    },
    hero: {
      overline: "VPN & Secure Access",
      title: "Secure private access for every device",
      description: "GCC WebOS gives you a reliable, encrypted connection across all your devices - for individuals and small teams who need consistent, private network access.",
      trust: ["No-log policy", "AES-256 encrypted", "30-day refund"]
    },
    dashboard: {
      title: "GCC WebOS Dashboard",
      connected: "Connected",
      protocol: "Protocol: WireGuard",
      latency: "Latency: 18 ms",
      region: "Tokyo · JP",
      changeRegion: "Change region ›",
      devices: [
        { name: "My MacBook Pro", detail: "Active", tone: "active" as const },
        { name: "iPhone 15", detail: "Active", tone: "active" as const },
        { name: "iPad Air", detail: "3h ago", tone: "idle" as const }
      ],
      plan: "Personal Plan · 3 / 5 devices",
      renewal: "Renews Jan 2027"
    },
    trustItems: [
      { icon: ShieldCheck, label: "Stable access" },
      { icon: LockKeyhole, label: "Private by design" },
      { icon: Laptop, label: "Cross-device" },
      { icon: CheckCircle2, label: "Easy setup" }
    ],
    features: {
      eyebrow: "Capabilities",
      title: "Everything you need for secure access",
      description: "Reliable, observable, and easy to manage - across every device and platform you use.",
      cards: [
        {
          icon: ShieldCheck,
          title: "Encrypted Connections",
          description: "AES-256 encrypted tunnel for all your traffic. Every connection is authenticated and private by default."
        },
        {
          icon: Globe2,
          title: "Multi-Region Nodes",
          description: "Connect through nodes across Asia-Pacific, Europe, and the Americas. Built for region-aware routing."
        },
        {
          icon: Layers,
          title: "Flexible Subscriptions",
          description: "Monthly or annual plans. Upgrade, downgrade, or cancel at any time from your account dashboard."
        },
        {
          icon: Smartphone,
          title: "All Major Platforms",
          description: "Access clients for Windows, macOS, iOS, Android, and Linux. One account, all major device types."
        },
        {
          icon: Zap,
          title: "Connection Dashboard",
          description: "Monitor latency, active sessions, and data usage in real time. Full visibility into your connection."
        },
        {
          icon: Users,
          title: "Account & Team Access",
          description: "Add team members, manage device limits, and control access from a single account console."
        }
      ]
    },
    setup: {
      eyebrow: "How it works",
      title: "Up and running in minutes",
      steps: [
        {
          title: "Register",
          description: "Create an account in the secure account area and claim a 7-day trial."
        },
        {
          title: "Choose plan",
          description: "Pick monthly or annual billing, then confirm the payment method."
        },
        {
          title: "Verify",
          description: "Complete email, phone, and anti-abuse verification in the account area."
        },
        {
          title: "Connect safely",
          description: "After activation, sign in on each device and connect safely."
        }
      ]
    },
    pricing: {
      eyebrow: "Pricing",
      title: "Simple, transparent plans",
      description: "Approximate RMB pricing with monthly, annual, and multi-payment support.",
      billingAria: "Billing period",
      monthly: "Monthly",
      annual: "Annual",
      highlights: [
        "Multiple payment methods supported",
        "RMB monthly and annual options",
        "Final payment is confirmed inside the account area"
      ],
      note: "Prices are displayed as approximate RMB equivalents. Registration includes a 7-day trial; final plan, payment channel, and activation status are confirmed in the account area.",
      plans: {
        monthly: [
          {
            value: "Monthly Basic",
            name: "Monthly Basic",
            price: "¥20",
            suffix: "/month",
            description: "Approximate RMB monthly plan for personal secure access.",
            cta: "Register for 7-day trial",
            tone: "light",
            features: ["Personal use", "Standard regions", "Multi-payment support", "Account-area activation"]
          },
          {
            value: "Monthly Plus",
            name: "Monthly Plus",
            price: "¥30",
            suffix: "/month",
            description: "Approximate RMB monthly plan for higher usage and priority setup.",
            cta: "Register for 7-day trial",
            badge: "Most popular",
            tone: "featured",
            features: ["100 GB monthly traffic", "All available regions", "Multi-payment support", "Priority setup support"]
          }
        ],
        annual: [
          {
            value: "Annual",
            name: "Annual",
            price: "¥200",
            suffix: "/year",
            description: "Approximate RMB annual plan for long-term use.",
            cta: "Register for 7-day trial",
            tone: "dark",
            features: ["Annual billing", "Best value", "Multi-payment support", "Renewal inside account area"]
          }
        ]
      } satisfies Record<BillingPeriod, Array<{
        badge?: string;
        cta: string;
        description: string;
        features: string[];
        name: string;
        price: string;
        suffix: string;
        tone: string;
        value: string;
      }>>
    },
    intake: {
      railTitle: "Public inquiry only",
      steps: ["Send request", "Confirm plan", "Account area", "Activation"],
      help: "Need help? support@gccwebos.com",
      eyebrow: "Public website intake",
      title: "Tell us what you need",
      description: "This form collects inquiry details only. Registration, login, verification, billing, and activation stay inside the secure account area.",
      fields: {
        organization: "Name or team",
        organizationPlaceholder: "Individual, team, or company name",
        email: "Email address",
        emailPlaceholder: "you@example.com",
        plan: "Plan",
        choosePlan: "Choose a plan",
        devices: "Devices",
        devicesPlaceholder: "1, 3, 10",
        region: "Primary region",
        regionPlaceholder: "Asia, Europe, Americas",
        useCase: "Use case",
        useCasePlaceholder: "Remote work, team access, multi-device usage, or other secure-access needs"
      },
      planOptions: [
        { label: "Monthly Basic - approx RMB 20/month", value: "Monthly Basic" },
        { label: "Monthly Plus - approx RMB 30/month", value: "Monthly Plus" },
        { label: "Annual - approx RMB 200/year", value: "Annual" }
      ],
      note: "Do not submit passwords, payment credentials, verification codes, or subscription material here.",
      success: "Request submitted. Account activation continues in the secure sign-in area after review.",
      error: "Submission failed. Please try again later.",
      submitting: "Submitting",
      submit: "Submit request"
    },
    faq: {
      eyebrow: "FAQ",
      title: "Common questions",
      items: [
        {
          question: "Does GCC WebOS log my activity?",
          answer: "GCC WebOS is designed around private access. Product telemetry and billing records stay separate from browsing activity."
        },
        {
          question: "How many devices can I connect?",
          answer: "Device limits depend on the selected monthly or annual plan and are confirmed before account activation."
        },
        {
          question: "How do payments work?",
          answer: "GCC WebOS supports multiple payment methods. The final RMB amount and channel are confirmed in the account area before activation."
        },
        {
          question: "Which platforms are supported?",
          answer: "Windows, macOS, iOS, Android, and Linux are planned as first-class client targets."
        }
      ]
    },
    footer: {
      description: "Secure private networking for the modern web. Built for individuals and high-performance teams.",
      columns: [
        {
          title: "Product",
          links: [
            { label: "Features", slug: "features" },
            { label: "Pricing", slug: "pricing" },
            { label: "Download", slug: "download" },
            { label: "Changelog", slug: "changelog" }
          ]
        },
        {
          title: "Legal",
          links: [
            { label: "Terms of Service", slug: "terms" },
            { label: "Privacy Policy", slug: "privacy" },
            { label: "Acceptable Use", slug: "acceptable-use" }
          ]
        },
        {
          title: "Support",
          links: [
            { label: "Help Center", slug: "help" },
            { label: "Contact", slug: "contact" },
            { label: "Status Page", slug: "status" }
          ]
        }
      ],
      copyright: "© 2026 GCC WebOS · gccwebos.com",
      rights: "All rights reserved."
    },
    info: {
      back: "Back to main site",
      dataSheet: "Data sheet",
      details: "Details",
      primaryCta: "Register for 7-day trial",
      quickFacts: "Quick facts",
      secondaryCta: "Send inquiry",
      updated: "June 30, 2026",
      updatedLabel: "Updated"
    },
    infoPages: {
      features: {
        eyebrow: "Product data sheet",
        title: "Feature overview",
        description: "A concise view of the public GCC WebOS secure-access capabilities. Account creation, verification, billing, and activation remain inside the secure account area.",
        facts: [
          { label: "Core scope", value: "Encrypted access, regions, devices" },
          { label: "Audience", value: "Individuals and small teams" },
          { label: "Account area", value: "Required for activation" }
        ],
        cards: [
          { title: "Encrypted access", description: "Authenticated encrypted connections protect traffic between your device and the selected access region." },
          { title: "Region choice", description: "Plan selection and activation can include region preferences, with final availability confirmed in the account area." },
          { title: "Device management", description: "Device capacity and active sessions are managed after account activation." }
        ],
        sections: [
          {
            title: "Included capabilities",
            items: ["Secure access dashboard", "Multi-device setup guidance", "Monthly and annual plan selection", "Support intake for access needs"]
          },
          {
            title: "Public-site boundary",
            items: ["This page does not expose subscription material", "Private setup is handled after secure sign-in", "Final access status is confirmed in the account area"]
          }
        ]
      },
      pricing: {
        eyebrow: "Pricing data sheet",
        title: "Pricing and payment overview",
        description: "Public pricing is shown as approximate RMB equivalents. The exact plan, payment method, and activation status are confirmed after sign-in.",
        facts: [
          { label: "Monthly", value: "¥20 / ¥30 per month" },
          { label: "Annual", value: "¥200 per year" },
          { label: "Trial", value: "7 days after registration" }
        ],
        cards: [
          { title: "Monthly Basic", description: "Approximate RMB 20/month for personal secure access and standard region use." },
          { title: "Monthly Plus", description: "Approximate RMB 30/month for higher traffic usage, all available regions, and priority setup." },
          { title: "Annual", description: "Approximate RMB 200/year for longer-term use and the best public-site value indication." }
        ],
        sections: [
          {
            title: "Payment handling",
            items: ["Multiple payment methods can be supported", "The public site does not collect payment credentials", "Final checkout is completed in the account area"]
          },
          {
            title: "Plan changes",
            items: ["Monthly and annual options are separate choices", "Renewal and activation are account-area actions", "Support can review special team requirements"]
          }
        ]
      },
      download: {
        eyebrow: "Client data sheet",
        title: "Download and client setup",
        description: "Client download details are prepared for activated accounts. Public visitors can review platform coverage before registration.",
        facts: [
          { label: "Platforms", value: "Windows, macOS, iOS, Android, Linux" },
          { label: "Access", value: "Account-area handoff" },
          { label: "Setup", value: "After activation" }
        ],
        cards: [
          { title: "Desktop clients", description: "Windows and macOS guidance is planned for common desktop setup flows." },
          { title: "Mobile clients", description: "iOS and Android guidance is prepared for account-based activation." },
          { title: "Advanced platforms", description: "Linux setup can be handled through support guidance when the account is ready." }
        ],
        sections: [
          {
            title: "Download flow",
            items: ["Register for the trial", "Complete account verification", "Choose the plan and region", "Open the account area for client setup"]
          },
          {
            title: "What is not public",
            items: ["No subscription URLs are published here", "No device secrets are embedded on this page", "No payment or verification codes are collected on the website"]
          }
        ]
      },
      changelog: {
        eyebrow: "Release data sheet",
        title: "Changelog",
        description: "Public release notes track visible website, account-area, and support-flow changes. Runtime and protected infrastructure details are not published here.",
        facts: [
          { label: "Current focus", value: "Public website and account handoff" },
          { label: "Latest public update", value: "Multilingual website and info pages" },
          { label: "Private details", value: "Not exposed on public pages" }
        ],
        cards: [
          { title: "Website", description: "Added bilingual public copy, pricing toggle, and responsive layout checks." },
          { title: "Account handoff", description: "Public CTAs point visitors to registration or sign-in instead of collecting credentials on the website." },
          { title: "Support intake", description: "The inquiry form stays limited to public contact and access-need details." }
        ],
        sections: [
          {
            title: "Recent public changes",
            items: ["Chinese and English language switching", "Monthly and annual pricing display", "Footer information pages", "Mobile layout validation"]
          },
          {
            title: "Change boundaries",
            items: ["No protected account data is included", "No raw subscription material is shown", "Infrastructure records remain internal"]
          }
        ]
      },
      terms: {
        eyebrow: "Legal data sheet",
        title: "Terms of Service",
        description: "This public summary explains the intended service relationship. The final applicable terms should be confirmed in the account area or signed agreement when available.",
        facts: [
          { label: "Scope", value: "Secure-access service" },
          { label: "Account", value: "Required for use" },
          { label: "Final terms", value: "Account area or agreement" }
        ],
        cards: [
          { title: "Account responsibility", description: "Users are responsible for keeping account credentials, verification factors, and activated devices under their control." },
          { title: "Service availability", description: "Plan access, region availability, and activation timing are confirmed through the account area." },
          { title: "Billing", description: "Public prices are informational. Final amount, channel, and renewal state are confirmed before activation." }
        ],
        sections: [
          {
            title: "Use of the service",
            items: ["Use must follow the selected plan and account limits", "Credential sharing and abusive automation are not supported", "Support requests should not include passwords or verification codes"]
          },
          {
            title: "Public-site limitation",
            items: ["This summary is not a full legal contract", "Formal terms can be updated before launch or account activation", "Conflicting account-area terms take priority over this public summary"]
          }
        ]
      },
      privacy: {
        eyebrow: "Legal data sheet",
        title: "Privacy Policy",
        description: "This page summarizes public-site data handling. The website collects inquiry details only and stores language preference locally in the browser.",
        facts: [
          { label: "Public form", value: "Name/team, email, plan, region, use case" },
          { label: "Local storage", value: "Language preference only" },
          { label: "Tracking", value: "No ad pixels in current code" }
        ],
        cards: [
          { title: "Inquiry data", description: "The contact form submits public access needs so support can review and follow up." },
          { title: "Language preference", description: "The browser may store the selected website language under a local preference key." },
          { title: "Sensitive material", description: "Passwords, payment credentials, verification codes, and subscription material should not be submitted on this site." }
        ],
        sections: [
          {
            title: "What the public site uses",
            items: ["Browser language for first-load localization", "Local storage for the language switch", "Submitted inquiry fields when the user sends the form"]
          },
          {
            title: "What the public site does not do",
            items: ["It does not collect passwords", "It does not publish subscription URLs", "It does not intentionally load advertising trackers in the current implementation"]
          }
        ]
      },
      "acceptable-use": {
        eyebrow: "Legal data sheet",
        title: "Acceptable Use",
        description: "This summary sets the expected public-use boundary for GCC WebOS access and support interactions.",
        facts: [
          { label: "Account use", value: "Plan-bound and verified" },
          { label: "Abuse", value: "Not permitted" },
          { label: "Support", value: "Public inquiry only" }
        ],
        cards: [
          { title: "Respect account limits", description: "Use should stay within the activated plan, shared traffic quota, and account controls." },
          { title: "No harmful activity", description: "Fraud, spam, credential abuse, service disruption, or attempts to harm others are not permitted." },
          { title: "Safe support data", description: "Support requests should describe needs without sending secrets, passwords, or payment credentials." }
        ],
        sections: [
          {
            title: "Expected conduct",
            items: ["Use the service only through your own account", "Follow local laws and platform rules", "Report support issues through approved channels"]
          },
          {
            title: "Enforcement options",
            items: ["Access may be reviewed for abuse signals", "Plans may be paused or limited when misuse is detected", "Support can request additional verification"]
          }
        ]
      },
      help: {
        eyebrow: "Support data sheet",
        title: "Help Center",
        description: "Common support topics for visitors preparing to register, start a trial, or complete account-area activation.",
        facts: [
          { label: "First step", value: "Register or send inquiry" },
          { label: "Trial", value: "7 days after registration" },
          { label: "Support email", value: "support@gccwebos.com" }
        ],
        cards: [
          { title: "Getting started", description: "Register, verify your account, choose a plan, then complete activation in the account area." },
          { title: "Plan questions", description: "Use the pricing page or inquiry form if device, region, or team requirements need review." },
          { title: "Activation questions", description: "After sign-in, account-area prompts guide verification, plan confirmation, and setup." }
        ],
        sections: [
          {
            title: "Common topics",
            items: ["Trial registration", "Monthly versus annual plans", "Device capacity", "Region preference", "Client setup timing"]
          },
          {
            title: "Before contacting support",
            items: ["Do not include passwords or verification codes", "Use the same email you plan to register with", "Describe device count and primary region needs"]
          }
        ]
      },
      contact: {
        eyebrow: "Support data sheet",
        title: "Contact",
        description: "The public contact path collects access requirements only. Account creation, payment, verification, and activation remain in the secure account area.",
        facts: [
          { label: "Public form", value: "Inquiry only" },
          { label: "Support", value: "support@gccwebos.com" },
          { label: "Sensitive data", value: "Do not submit" }
        ],
        cards: [
          { title: "For individuals", description: "Share expected device count, region preference, and plan interest." },
          { title: "For teams", description: "Describe member count, region needs, and whether monthly or annual billing is preferred." },
          { title: "For account issues", description: "Use sign-in and account-area support once your account exists." }
        ],
        sections: [
          {
            title: "Good contact details",
            items: ["Name or team", "Email address", "Preferred plan", "Device count", "Primary region", "Use case"]
          },
          {
            title: "Do not send",
            items: ["Passwords", "Payment credentials", "Verification codes", "Subscription material"]
          }
        ]
      },
      status: {
        eyebrow: "Support data sheet",
        title: "Status Page",
        description: "Public status communication is prepared for service announcements. This page does not expose private operational logs or infrastructure details.",
        facts: [
          { label: "Public status", value: "Announcement-ready" },
          { label: "Private logs", value: "Not published" },
          { label: "Support path", value: "Account area or support email" }
        ],
        cards: [
          { title: "Website", description: "Public website status can be announced here when incidents or planned maintenance affect visitors." },
          { title: "Account area", description: "Account-area notices should be shown after sign-in when user-specific action is required." },
          { title: "Support updates", description: "Support can share relevant status notes without publishing protected infrastructure data." }
        ],
        sections: [
          {
            title: "What can appear here",
            items: ["Public website maintenance", "Account-area availability notices", "Client setup notices", "Support response updates"]
          },
          {
            title: "What stays private",
            items: ["Infrastructure endpoints", "Protected runtime logs", "Customer account records", "Credential or subscription material"]
          }
        ]
      }
    }
  },
  zh: {
    meta: {
      title: "GCC WebOS - VPN 安全访问"
    },
    aria: {
      brandHome: "GCC WebOS 首页",
      dashboard: "GCC WebOS 控制台预览",
      footer: "GCC WebOS 官网页脚",
      language: "语言",
      navigation: "GCC WebOS 官网导航",
      openNavigation: "打开导航",
      paymentOptions: "GCC WebOS 支付选项",
      serviceQualities: "GCC WebOS 服务能力",
      trustSignals: "GCC WebOS 信任标识"
    },
    nav: {
      features: "功能",
      pricing: "价格",
      contact: "咨询",
      support: "支持"
    },
    actions: {
      register: "注册",
      signIn: "登录",
      trial: "注册领取 7 天试用",
      viewPlans: "查看套餐"
    },
    hero: {
      overline: "VPN 与安全访问",
      title: "安全私密访问，覆盖每一台设备",
      description: "GCC WebOS 为个人和小团队提供稳定、加密的网络连接，帮助你在多设备间保持一致、安全、私密的访问体验。",
      trust: ["不记录访问活动", "AES-256 加密", "30 天退款支持"]
    },
    dashboard: {
      title: "GCC WebOS 控制台",
      connected: "已连接",
      protocol: "协议：WireGuard",
      latency: "延迟：18 ms",
      region: "东京 · JP",
      changeRegion: "切换区域 ›",
      devices: [
        { name: "My MacBook Pro", detail: "在线", tone: "active" as const },
        { name: "iPhone 15", detail: "在线", tone: "active" as const },
        { name: "iPad Air", detail: "3 小时前", tone: "idle" as const }
      ],
      plan: "个人套餐 · 3 / 5 台设备",
      renewal: "续费时间 2027 年 1 月"
    },
    trustItems: [
      { icon: ShieldCheck, label: "稳定访问" },
      { icon: LockKeyhole, label: "隐私优先" },
      { icon: Laptop, label: "多端支持" },
      { icon: CheckCircle2, label: "快速配置" }
    ],
    features: {
      eyebrow: "核心能力",
      title: "安全访问所需能力，一次配齐",
      description: "稳定、可观察、易管理，覆盖你日常使用的每一类设备和平台。",
      cards: [
        {
          icon: ShieldCheck,
          title: "加密连接",
          description: "通过 AES-256 加密隧道保护网络流量，每次连接默认经过认证并保持私密。"
        },
        {
          icon: Globe2,
          title: "多区域节点",
          description: "支持亚太、欧洲和美洲等区域节点，适合需要区域感知路由的访问场景。"
        },
        {
          icon: Layers,
          title: "灵活套餐",
          description: "支持月度和年度方案，套餐选择、续费和调整都在安全账户区域内完成。"
        },
        {
          icon: Smartphone,
          title: "主流平台支持",
          description: "覆盖 Windows、macOS、iOS、Android 和 Linux，一个账户管理主要设备。"
        },
        {
          icon: Zap,
          title: "连接控制台",
          description: "查看延迟、在线会话和流量使用情况，让连接状态更透明。"
        },
        {
          icon: Users,
          title: "账户与团队访问",
          description: "适合个人和小团队管理设备容量、成员访问和账户权限。"
        }
      ]
    },
    setup: {
      eyebrow: "使用流程",
      title: "几分钟内完成启用",
      steps: [
        {
          title: "注册",
          description: "在安全账户区域创建账号，并领取 7 天试用。"
        },
        {
          title: "选择套餐",
          description: "选择月度或年度方案，再确认支付方式。"
        },
        {
          title: "完成验证",
          description: "在账户区域完成邮箱、手机和防滥用验证。"
        },
        {
          title: "安全连接",
          description: "激活后在各设备登录并开始安全连接。"
        }
      ]
    },
    pricing: {
      eyebrow: "价格",
      title: "清晰透明的套餐",
      description: "人民币近似价格，支持月度、年度和多种支付方式。",
      billingAria: "计费周期",
      monthly: "月度",
      annual: "年度",
      highlights: [
        "支持多种支付方式",
        "人民币月付和年付选项",
        "最终付款在账户区域内确认"
      ],
      note: "价格以人民币近似值展示。注册包含 7 天试用；最终套餐、支付渠道和激活状态会在账户区域内确认。",
      plans: {
        monthly: [
          {
            value: "Monthly Basic",
            name: "月度基础",
            price: "¥20",
            suffix: "/月",
            description: "适合个人安全访问的人民币月度近似套餐。",
            cta: "注册领取 7 天试用",
            tone: "light",
            features: ["个人使用", "标准区域", "多种支付支持", "账户区域激活"]
          },
          {
            value: "Monthly Plus",
            name: "月度会员",
            price: "¥30",
            suffix: "/月",
            description: "适合更高用量和优先配置需求的人民币月度近似套餐。",
            cta: "注册领取 7 天试用",
            badge: "最受欢迎",
            tone: "featured",
            features: ["更大设备容量", "所有可用区域", "多种支付支持", "优先配置支持"]
          }
        ],
        annual: [
          {
            value: "Annual",
            name: "年度套餐",
            price: "¥200",
            suffix: "/年",
            description: "适合长期使用的人民币年度近似套餐。",
            cta: "注册领取 7 天试用",
            tone: "dark",
            features: ["年度账单", "性价比最高", "多种支付支持", "账户区域内续订"]
          }
        ]
      } satisfies Record<BillingPeriod, Array<{
        badge?: string;
        cta: string;
        description: string;
        features: string[];
        name: string;
        price: string;
        suffix: string;
        tone: string;
        value: string;
      }>>
    },
    intake: {
      railTitle: "仅限公开咨询",
      steps: ["发送需求", "确认方案", "账户区域", "激活"],
      help: "需要帮助？请联系 support@gccwebos.com",
      eyebrow: "官网需求收集",
      title: "请告诉我们您的需求",
      description: "此表单只收集咨询信息。注册、登录、验证、计费和激活都会在安全账户区域内完成。",
      fields: {
        organization: "姓名或团队",
        organizationPlaceholder: "个人、团队或公司名称",
        email: "电子邮件",
        emailPlaceholder: "you@example.com",
        plan: "计划",
        choosePlan: "选择方案",
        devices: "设备",
        devicesPlaceholder: "1、3、10",
        region: "主要区域",
        regionPlaceholder: "亚洲、欧洲、美洲",
        useCase: "用例",
        useCasePlaceholder: "远程办公、团队访问、多设备使用或其他安全访问需求"
      },
      planOptions: [
        { label: "月度基础 - 约人民币 20 元/月", value: "Monthly Basic" },
        { label: "月度会员 - 约人民币 30 元/月", value: "Monthly Plus" },
        { label: "年度套餐 - 约人民币 200 元/年", value: "Annual" }
      ],
      note: "请勿在此提交密码、支付凭证、验证码或订阅资料。",
      success: "请求已提交。审核后请在安全登录区域继续完成账户激活。",
      error: "提交失败，请稍后再试。",
      submitting: "提交中",
      submit: "提交请求"
    },
    faq: {
      eyebrow: "常见问题",
      title: "常见问题",
      items: [
        {
          question: "GCC WebOS 会记录我的访问活动吗？",
          answer: "GCC WebOS 以私密访问为设计基础，产品遥测和计费记录与浏览活动分离。"
        },
        {
          question: "我可以连接多少台设备？",
          answer: "设备数量取决于所选月度或年度方案，并会在账户激活前确认。"
        },
        {
          question: "支付流程如何进行？",
          answer: "GCC WebOS 支持多种支付方式，最终人民币金额和支付渠道会在账户区域内确认。"
        },
        {
          question: "支持哪些平台？",
          answer: "Windows、macOS、iOS、Android 和 Linux 都是首批支持的平台目标。"
        }
      ]
    },
    footer: {
      description: "面向现代网络的安全私密连接服务，适合个人和高效率团队使用。",
      columns: [
        {
          title: "产品",
          links: [
            { label: "功能", slug: "features" },
            { label: "价格", slug: "pricing" },
            { label: "下载", slug: "download" },
            { label: "更新记录", slug: "changelog" }
          ]
        },
        {
          title: "法律",
          links: [
            { label: "服务条款", slug: "terms" },
            { label: "隐私政策", slug: "privacy" },
            { label: "可接受使用", slug: "acceptable-use" }
          ]
        },
        {
          title: "支持",
          links: [
            { label: "帮助中心", slug: "help" },
            { label: "联系", slug: "contact" },
            { label: "状态页", slug: "status" }
          ]
        }
      ],
      copyright: "© 2026 GCC WebOS · gccwebos.com",
      rights: "保留所有权利。"
    },
    info: {
      back: "返回官网",
      dataSheet: "资料片",
      details: "详细说明",
      primaryCta: "注册领取 7 天试用",
      quickFacts: "关键信息",
      secondaryCta: "提交咨询",
      updated: "2026 年 6 月 30 日",
      updatedLabel: "更新"
    },
    infoPages: {
      features: {
        eyebrow: "产品资料片",
        title: "功能概览",
        description: "GCC WebOS 公开官网功能资料片。账号创建、验证、计费和激活继续在安全账户区域内完成。",
        facts: [
          { label: "核心范围", value: "加密访问、区域、设备" },
          { label: "适用对象", value: "个人和小团队" },
          { label: "账户区域", value: "激活时必须使用" }
        ],
        cards: [
          { title: "加密访问", description: "通过经过认证的加密连接保护设备到所选访问区域之间的网络流量。" },
          { title: "区域选择", description: "套餐选择和激活可包含区域偏好，最终可用性会在账户区域内确认。" },
          { title: "设备管理", description: "设备容量和在线会话会在账户激活后统一管理。" }
        ],
        sections: [
          {
            title: "包含能力",
            items: ["安全访问控制台", "多设备配置指引", "月度和年度套餐选择", "访问需求支持表单"]
          },
          {
            title: "公开官网边界",
            items: ["此页面不展示订阅资料", "私密配置在安全登录后处理", "最终访问状态在账户区域内确认"]
          }
        ]
      },
      pricing: {
        eyebrow: "价格资料片",
        title: "价格与支付概览",
        description: "公开价格以人民币近似值展示。最终套餐、支付方式和激活状态会在登录后确认。",
        facts: [
          { label: "月付", value: "20 元 / 30 元每月" },
          { label: "年付", value: "200 元每年" },
          { label: "试用", value: "注册后 7 天" }
        ],
        cards: [
          { title: "月度基础", description: "约人民币 20 元/月，适合个人安全访问和标准区域使用。" },
          { title: "月度会员", description: "约人民币 30 元/月，适合更高用量、更大设备容量和优先配置。" },
          { title: "年度套餐", description: "约人民币 200 元/年，适合长期使用，是公开展示中的高性价比选项。" }
        ],
        sections: [
          {
            title: "支付处理",
            items: ["支持多种支付方式", "公开官网不收集支付凭证", "最终付款在账户区域内完成"]
          },
          {
            title: "套餐调整",
            items: ["月度和年度是独立选择", "续订和激活属于账户区域操作", "团队需求可通过支持渠道进一步确认"]
          }
        ]
      },
      download: {
        eyebrow: "客户端资料片",
        title: "下载与客户端配置",
        description: "客户端下载信息面向已激活账户准备。公开访客可先查看平台覆盖范围。",
        facts: [
          { label: "平台", value: "Windows、macOS、iOS、Android、Linux" },
          { label: "获取方式", value: "账户区域交接" },
          { label: "配置时机", value: "激活后进行" }
        ],
        cards: [
          { title: "桌面客户端", description: "Windows 和 macOS 配置指引会覆盖常见桌面使用流程。" },
          { title: "移动客户端", description: "iOS 和 Android 配置会基于账户激活状态提供。" },
          { title: "进阶平台", description: "Linux 配置可在账户准备完成后通过支持指引处理。" }
        ],
        sections: [
          {
            title: "下载流程",
            items: ["注册试用", "完成账户验证", "选择套餐和区域", "进入账户区域完成客户端配置"]
          },
          {
            title: "不会公开展示",
            items: ["此处不发布订阅地址", "页面不内嵌设备密钥", "官网不收集支付凭证或验证码"]
          }
        ]
      },
      changelog: {
        eyebrow: "更新资料片",
        title: "更新记录",
        description: "公开更新记录用于说明官网、账户区域和支持流程的可见变化。运行时和受保护基础设施细节不会在这里发布。",
        facts: [
          { label: "当前重点", value: "官网与账户交接" },
          { label: "最近更新", value: "多语言官网和资料片" },
          { label: "私密细节", value: "不在公开页展示" }
        ],
        cards: [
          { title: "官网", description: "新增中英文文案、价格切换和响应式布局检查。" },
          { title: "账户交接", description: "公开 CTA 指向注册或登录，不在官网收集账号凭证。" },
          { title: "支持表单", description: "咨询表单仅限公开联系信息和访问需求。" }
        ],
        sections: [
          {
            title: "近期公开变化",
            items: ["中英文语言切换", "月度和年度价格展示", "页脚资料片", "移动端布局验证"]
          },
          {
            title: "更新边界",
            items: ["不包含受保护账户数据", "不展示原始订阅资料", "基础设施记录保持内部可见"]
          }
        ]
      },
      terms: {
        eyebrow: "法律资料片",
        title: "服务条款",
        description: "此公开摘要说明预期服务关系。最终适用条款应以后续账户区域或正式协议为准。",
        facts: [
          { label: "范围", value: "安全访问服务" },
          { label: "账号", value: "使用前需要账号" },
          { label: "最终条款", value: "账户区域或协议" }
        ],
        cards: [
          { title: "账户责任", description: "用户需要妥善保管账户凭证、验证因素和已激活设备。" },
          { title: "服务可用性", description: "套餐访问、区域可用性和激活时间会通过账户区域确认。" },
          { title: "计费", description: "公开价格仅供说明，最终金额、渠道和续费状态会在激活前确认。" }
        ],
        sections: [
          {
            title: "服务使用",
            items: ["使用应符合已选套餐和账户限制", "不支持共享凭证或滥用自动化", "支持请求不应包含密码或验证码"]
          },
          {
            title: "公开页限制",
            items: ["此摘要不是完整法律合同", "正式条款可在上线或账户激活前更新", "如有冲突，以账户区域条款为准"]
          }
        ]
      },
      privacy: {
        eyebrow: "法律资料片",
        title: "隐私政策",
        description: "此页面概述公开官网的数据处理方式。官网只收集咨询信息，并在浏览器本地保存语言偏好。",
        facts: [
          { label: "公开表单", value: "姓名/团队、邮箱、计划、区域、用例" },
          { label: "本地存储", value: "仅语言偏好" },
          { label: "追踪", value: "当前代码未接广告像素" }
        ],
        cards: [
          { title: "咨询信息", description: "联系表单提交公开访问需求，便于支持团队审核和跟进。" },
          { title: "语言偏好", description: "浏览器可能在本地保存用户选择的网站语言。" },
          { title: "敏感资料", description: "请不要在官网提交密码、支付凭证、验证码或订阅资料。" }
        ],
        sections: [
          {
            title: "公开官网会使用",
            items: ["浏览器语言用于首次本地化", "本地存储用于语言切换", "用户提交表单时发送咨询字段"]
          },
          {
            title: "公开官网不会做",
            items: ["不收集密码", "不发布订阅地址", "当前实现不主动加载广告追踪脚本"]
          }
        ]
      },
      "acceptable-use": {
        eyebrow: "法律资料片",
        title: "可接受使用",
        description: "此摘要说明 GCC WebOS 访问服务和支持互动的预期公开边界。",
        facts: [
          { label: "账户使用", value: "受套餐和验证约束" },
          { label: "滥用", value: "不被允许" },
          { label: "支持", value: "仅公开咨询" }
        ],
        cards: [
          { title: "遵守账户限制", description: "使用应保持在已激活套餐、设备容量和账户控制范围内。" },
          { title: "禁止有害行为", description: "欺诈、垃圾信息、凭证滥用、服务破坏或伤害他人的行为都不被允许。" },
          { title: "安全提交支持信息", description: "支持请求应描述需求，不应发送密钥、密码或支付凭证。" }
        ],
        sections: [
          {
            title: "预期行为",
            items: ["仅通过自己的账户使用服务", "遵守所在地法律和平台规则", "通过批准的渠道报告支持问题"]
          },
          {
            title: "处置方式",
            items: ["可能根据滥用信号复核访问", "发现误用时套餐可能被暂停或限制", "支持团队可能要求补充验证"]
          }
        ]
      },
      help: {
        eyebrow: "支持资料片",
        title: "帮助中心",
        description: "面向准备注册、开始试用或完成账户区域激活的访客整理常见支持主题。",
        facts: [
          { label: "第一步", value: "注册或提交咨询" },
          { label: "试用", value: "注册后 7 天" },
          { label: "支持邮箱", value: "support@gccwebos.com" }
        ],
        cards: [
          { title: "开始使用", description: "注册、验证账户、选择套餐，再在账户区域内完成激活。" },
          { title: "套餐问题", description: "如设备、区域或团队需求需要确认，可查看价格页或提交咨询。" },
          { title: "激活问题", description: "登录后，账户区域会引导完成验证、套餐确认和配置。" }
        ],
        sections: [
          {
            title: "常见主题",
            items: ["试用注册", "月度与年度套餐", "设备容量", "区域偏好", "客户端配置时机"]
          },
          {
            title: "联系支持前",
            items: ["不要包含密码或验证码", "使用计划注册的同一邮箱", "描述设备数量和主要区域需求"]
          }
        ]
      },
      contact: {
        eyebrow: "支持资料片",
        title: "联系",
        description: "公开联系路径只收集访问需求。账号创建、付款、验证和激活继续在安全账户区域内完成。",
        facts: [
          { label: "公开表单", value: "仅限咨询" },
          { label: "支持", value: "support@gccwebos.com" },
          { label: "敏感资料", value: "不要提交" }
        ],
        cards: [
          { title: "个人用户", description: "可说明预计设备数量、区域偏好和套餐意向。" },
          { title: "团队用户", description: "可说明成员规模、区域需求，以及偏好的月度或年度计费。" },
          { title: "账户问题", description: "已有账号后，请通过登录和账户区域支持处理。" }
        ],
        sections: [
          {
            title: "建议提供的信息",
            items: ["姓名或团队", "电子邮件", "偏好计划", "设备数量", "主要区域", "使用场景"]
          },
          {
            title: "不要发送",
            items: ["密码", "支付凭证", "验证码", "订阅资料"]
          }
        ]
      },
      status: {
        eyebrow: "支持资料片",
        title: "状态页",
        description: "公开状态沟通用于服务公告准备。此页面不公开私密运行日志或基础设施细节。",
        facts: [
          { label: "公开状态", value: "可承载公告" },
          { label: "私密日志", value: "不公开" },
          { label: "支持路径", value: "账户区域或支持邮箱" }
        ],
        cards: [
          { title: "官网", description: "当维护或事件影响访客时，可在这里发布公开官网状态。" },
          { title: "账户区域", description: "如需用户执行操作，账户区域应在登录后展示相关提示。" },
          { title: "支持更新", description: "支持团队可共享相关状态说明，但不发布受保护基础设施数据。" }
        ],
        sections: [
          {
            title: "这里可以展示",
            items: ["官网维护", "账户区域可用性提示", "客户端配置说明", "支持响应更新"]
          },
          {
            title: "保持私密",
            items: ["基础设施端点", "受保护运行日志", "客户账户记录", "凭证或订阅资料"]
          }
        ]
      }
    }
  }
} as const;

const companySiteInfoPageIcons: Record<CompanySiteInfoPageSlug, typeof ShieldCheck> = {
  features: ShieldCheck,
  pricing: CreditCard,
  download: Download,
  changelog: Activity,
  terms: FileText,
  privacy: LockKeyhole,
  "acceptable-use": CheckCircle2,
  help: BookOpen,
  contact: HelpCircle,
  status: Activity
};

function isCompanySiteInfoPageSlug(value: string | null | undefined): value is CompanySiteInfoPageSlug {
  return companySiteInfoPageSlugs.includes(value as CompanySiteInfoPageSlug);
}

function buildCompanySiteInfoPageHash(slug: CompanySiteInfoPageSlug) {
  return `#/site/info/${slug}`;
}

function readCompanySiteInfoPageSlugFromHash(): CompanySiteInfoPageSlug | null {
  if (typeof window === "undefined") {
    return null;
  }
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const infoIndex = parts[0] === "site" ? 1 : 0;
  const slug = parts[infoIndex + 1];
  return parts[infoIndex] === "info" && isCompanySiteInfoPageSlug(slug)
    ? slug
    : null;
}

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "zh";
}

function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }
  try {
    const storedLocale = window.localStorage.getItem(companySiteLocaleStorageKey);
    if (isLocale(storedLocale)) {
      return storedLocale;
    }
  } catch (error) {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
  const languageCandidates = [
    ...(window.navigator.languages ?? []),
    window.navigator.language
  ].filter(Boolean);
  return languageCandidates.some((language) => String(language).toLowerCase().startsWith("zh"))
    ? "zh"
    : "en";
}

function readFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function buildPublicLeadPayload(formData: FormData) {
  const organization = readFormValue(formData, "organization");
  const email = readFormValue(formData, "email");
  const plan = readFormValue(formData, "plan");
  const deviceCount = readFormValue(formData, "deviceCount");
  const region = readFormValue(formData, "region");
  const message = readFormValue(formData, "message");

  return {
    organization,
    email,
    direction: "GCC WebOS access inquiry",
    stage: plan,
    message: [
      `plan=${plan || "unspecified"}`,
      `deviceCount=${deviceCount || "unspecified"}`,
      `region=${region || "unspecified"}`,
      `note=${message || "unspecified"}`
    ].join("; "),
    source: "gccwebos-public-site"
  };
}

export function CompanySitePage() {
  const [leadStatus, setLeadStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [activeSection, setActiveSection] = useState<(typeof companySiteSectionIds)[number]>("top");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [infoPageSlug, setInfoPageSlug] = useState<CompanySiteInfoPageSlug | null>(() => (
    readCompanySiteInfoPageSlugFromHash()
  ));
  const [locale, setLocale] = useState<Locale>(() => detectBrowserLocale());
  const copy = companySiteCopy[locale];
  const visiblePricingPlans = copy.pricing.plans[billingPeriod];

  useEffect(() => {
    document.documentElement.lang = localeLabels[locale].lang;
    document.title = infoPageSlug ? `${copy.infoPages[infoPageSlug].title} - GCC WebOS` : copy.meta.title;
  }, [copy.infoPages, copy.meta.title, infoPageSlug, locale]);

  useEffect(() => {
    const handleHashChange = () => {
      setInfoPageSlug(readCompanySiteInfoPageSlugFromHash());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (infoPageSlug) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target.id && companySiteSectionIds.includes(visibleEntry.target.id as typeof activeSection)) {
          setActiveSection(visibleEntry.target.id as typeof activeSection);
        }
      },
      {
        rootMargin: "-18% 0px -50% 0px",
        threshold: [0.35, 0.55, 0.75]
      }
    );

    companySiteSectionIds.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        observer.observe(section);
      }
    });

    return () => observer.disconnect();
  }, [infoPageSlug]);

  async function handleLeadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = buildPublicLeadPayload(new FormData(form));

    setLeadStatus("submitting");
    try {
      const response = await fetch(leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("GCC WebOS public inquiry failed");
      }
      form.reset();
      setLeadStatus("success");
    } catch (error) {
      setLeadStatus("error");
    }
  }

  function handleSiteAnchorClick(event: MouseEvent<HTMLAnchorElement>, sectionId: string) {
    event.preventDefault();
    if (companySiteSectionIds.includes(sectionId as typeof activeSection)) {
      setActiveSection(sectionId as typeof activeSection);
    }
    if (infoPageSlug) {
      setInfoPageSlug(null);
      window.history.pushState(null, "", "#/site");
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleLoginAction(event: MouseEvent<HTMLAnchorElement>) {
    if (loginUrl.startsWith("#")) {
      handleSiteAnchorClick(event, loginUrl.slice(1));
    }
  }

  function handleRegisterAction(event: MouseEvent<HTMLAnchorElement>) {
    if (registerUrl.startsWith("#")) {
      handleSiteAnchorClick(event, registerUrl.slice(1));
    }
  }

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    try {
      window.localStorage.setItem(companySiteLocaleStorageKey, nextLocale);
    } catch (error) {
      // Language still changes for this session if persistent storage is blocked.
    }
  }

  function handleInfoPageClick(event: MouseEvent<HTMLAnchorElement>, slug: CompanySiteInfoPageSlug) {
    event.preventDefault();
    setInfoPageSlug(slug);
    window.history.pushState(null, "", buildCompanySiteInfoPageHash(slug));
    if (!window.navigator.userAgent.toLowerCase().includes("jsdom")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  return (
    <main className="company-site-shell" data-active-section={activeSection} data-locale={locale}>
      <header className="company-site-header">
        <a
          className="company-site-brand"
          href="#top"
          aria-label={copy.aria.brandHome}
          onClick={(event) => handleSiteAnchorClick(event, "top")}
        >
          <span aria-hidden="true">
            <Shield />
          </span>
          <strong>GCC WebOS</strong>
        </a>
        <nav className="company-site-nav" aria-label={copy.aria.navigation}>
          <a href="#features" onClick={(event) => handleSiteAnchorClick(event, "features")}>
            {copy.nav.features}
          </a>
          <a href="#pricing" onClick={(event) => handleSiteAnchorClick(event, "pricing")}>
            {copy.nav.pricing}
          </a>
          <a href="#contact" onClick={(event) => handleSiteAnchorClick(event, "contact")}>
            {copy.nav.contact}
          </a>
          <a href="#faq" onClick={(event) => handleSiteAnchorClick(event, "faq")}>
            {copy.nav.support}
          </a>
        </nav>
        <div className="company-site-header-actions">
          <div className="company-site-language-switch" role="group" aria-label={copy.aria.language}>
            {localeOptions.map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={locale === option}
                title={localeLabels[option].name}
                onClick={() => handleLocaleChange(option)}
              >
                {localeLabels[option].short}
              </button>
            ))}
          </div>
          <a
            className="company-site-secondary compact"
            href={registerUrl}
            onClick={handleRegisterAction}
          >
            {copy.actions.register}
          </a>
          <a
            className="company-site-primary compact"
            href={loginUrl}
            onClick={handleLoginAction}
          >
            {copy.actions.signIn}
          </a>
          <button className="company-site-menu-button" type="button" aria-label={copy.aria.openNavigation}>
            <Menu aria-hidden="true" />
          </button>
        </div>
      </header>

      {infoPageSlug ? (
        <CompanySiteInfoPage
          page={copy.infoPages[infoPageSlug]}
          pageIcon={companySiteInfoPageIcons[infoPageSlug]}
          shared={copy.info}
          registerUrl={registerUrl}
          onContactClick={(event) => handleSiteAnchorClick(event, "contact")}
          onHomeClick={(event) => handleSiteAnchorClick(event, "top")}
          onRegisterClick={handleRegisterAction}
        />
      ) : (
        <>
      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <div className="company-site-overline">
            <span />
            {copy.hero.overline}
          </div>
          <h1>{copy.hero.title}</h1>
          <p>{copy.hero.description}</p>
          <div className="company-site-actions">
            <a
              className="company-site-primary"
              href={registerUrl}
              onClick={handleRegisterAction}
            >
              {copy.actions.trial}
            </a>
            <a
              className="company-site-secondary"
              href="#pricing"
              onClick={(event) => handleSiteAnchorClick(event, "pricing")}
            >
              {copy.actions.viewPlans}
            </a>
          </div>
          <div className="company-site-hero-trust" aria-label={copy.aria.trustSignals}>
            <span><span className="company-site-dot" />{copy.hero.trust[0]}</span>
            <span><LockKeyhole aria-hidden="true" />{copy.hero.trust[1]}</span>
            <span><RefreshCw aria-hidden="true" />{copy.hero.trust[2]}</span>
          </div>
        </div>

        <div className="company-site-dashboard" aria-label={copy.aria.dashboard}>
          <div className="company-site-dashboard-top">
            <strong>{copy.dashboard.title}</strong>
            <span>JD</span>
          </div>
          <div className="company-site-connection-row">
            <div>
              <span className="company-site-status-badge"><span />{copy.dashboard.connected}</span>
              <small>{copy.dashboard.protocol}</small>
            </div>
            <div>
              <small>{copy.dashboard.latency}</small>
              <span className="company-site-wifi"><Wifi aria-hidden="true" /></span>
            </div>
          </div>
          <div className="company-site-region-row">
            <div>
              <span className="company-site-flag">JP</span>
              <strong>{copy.dashboard.region}</strong>
            </div>
            <a href={loginUrl} onClick={handleLoginAction}>
              {copy.dashboard.changeRegion}
            </a>
          </div>
          <div className="company-site-device-list">
            {copy.dashboard.devices.map((device, index) => (
              <DeviceRow
                icon={index === 0 ? Laptop : index === 1 ? Smartphone : Tablet}
                name={device.name}
                detail={device.detail}
                tone={device.tone}
                key={device.name}
              />
            ))}
          </div>
          <div className="company-site-subscription-row">
            <div>
              <span>{copy.dashboard.plan}</span>
              <span>{copy.dashboard.renewal}</span>
            </div>
            <div className="company-site-progress"><span /></div>
          </div>
        </div>
      </section>

      <section className="company-site-trust-strip" aria-label={copy.aria.serviceQualities}>
        {copy.trustItems.map((item) => (
          <div className="company-site-trust-item" key={item.label}>
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="company-site-section" id="features">
        <div className="company-site-section-heading">
          <span>{copy.features.eyebrow}</span>
          <h2>{copy.features.title}</h2>
          <p>{copy.features.description}</p>
        </div>
        <div className="company-site-capabilities">
          {copy.features.cards.map((item) => (
            <article className="company-site-card" key={item.title}>
              <div><item.icon aria-hidden="true" /></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="company-site-how" id="how-it-works">
        <div className="company-site-section-heading inverted">
          <span>{copy.setup.eyebrow}</span>
          <h2>{copy.setup.title}</h2>
        </div>
        <div className="company-site-steps">
          {copy.setup.steps.map((step, index) => (
            <article className="company-site-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="company-site-pricing" id="pricing">
        <div className="company-site-section-heading">
          <span>{copy.pricing.eyebrow}</span>
          <h2>{copy.pricing.title}</h2>
          <p>{copy.pricing.description}</p>
        </div>
        <div className="company-site-billing-toggle" aria-label={copy.pricing.billingAria}>
          <button
            type="button"
            aria-pressed={billingPeriod === "monthly"}
            onClick={() => setBillingPeriod("monthly")}
          >
            {copy.pricing.monthly}
          </button>
          <button
            type="button"
            aria-pressed={billingPeriod === "annual"}
            onClick={() => setBillingPeriod("annual")}
          >
            {copy.pricing.annual}
          </button>
        </div>
        <div className="company-site-payment-strip" aria-label={copy.aria.paymentOptions}>
          {copy.pricing.highlights.map((item) => (
            <span key={item}>
              <CreditCard aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div
          className="company-site-plan-grid"
          data-billing-period={billingPeriod}
          data-plan-count={visiblePricingPlans.length}
        >
          {visiblePricingPlans.map((plan) => (
            <article className="company-site-plan-card" data-tone={plan.tone} key={plan.value}>
              <div className="company-site-plan-top">
                <div className="company-site-plan-name">
                  <strong>{plan.name}</strong>
                  {"badge" in plan && plan.badge ? <span>{plan.badge}</span> : null}
                </div>
                <div className="company-site-plan-price">
                  <strong>{plan.price}</strong>
                  <span>{plan.suffix}</span>
                </div>
                <p>{plan.description}</p>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                className={plan.tone === "featured" ? "company-site-primary" : "company-site-plan-action"}
                href={registerUrl}
                onClick={handleRegisterAction}
              >
                {plan.cta} <ArrowRight aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
        <p className="company-site-pricing-note">{copy.pricing.note}</p>
      </section>

      <section className="company-site-intake" id="contact">
        <aside className="company-site-intake-rail">
          <div className="company-site-intake-brand">
            <span><Shield aria-hidden="true" /></span>
            <strong>GCC WebOS</strong>
          </div>
          <p>{copy.intake.railTitle}</p>
          <ol>
            {copy.intake.steps.map((step, index) => (
              <li key={step} data-active={index === 0 ? "true" : undefined}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <small>{copy.intake.help}</small>
        </aside>
        <div className="company-site-intake-panel">
          <div className="company-site-intake-copy">
            <span>{copy.intake.eyebrow}</span>
            <h2>{copy.intake.title}</h2>
            <p>{copy.intake.description}</p>
          </div>
          <form className="company-site-contact-form" onSubmit={handleLeadSubmit}>
            <label>
              {copy.intake.fields.organization}
              <input name="organization" type="text" placeholder={copy.intake.fields.organizationPlaceholder} required />
            </label>
            <label>
              {copy.intake.fields.email}
              <input name="email" type="email" placeholder={copy.intake.fields.emailPlaceholder} required />
            </label>
            <label>
              {copy.intake.fields.plan}
              <select name="plan" required defaultValue="">
                <option value="" disabled>{copy.intake.fields.choosePlan}</option>
                {copy.intake.planOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="company-site-form-grid">
              <label>
                {copy.intake.fields.devices}
                <input name="deviceCount" type="text" inputMode="numeric" placeholder={copy.intake.fields.devicesPlaceholder} />
              </label>
              <label>
                {copy.intake.fields.region}
                <input name="region" type="text" placeholder={copy.intake.fields.regionPlaceholder} />
              </label>
            </div>
            <label>
              {copy.intake.fields.useCase}
              <textarea
                name="message"
                rows={4}
                placeholder={copy.intake.fields.useCasePlaceholder}
                required
              />
            </label>
            <div className="company-site-intake-note">
              <CheckCircle2 aria-hidden="true" />
              {copy.intake.note}
            </div>
            {leadStatus === "success" ? (
              <p className="company-site-form-status company-site-form-status-ok" role="status">
                {copy.intake.success}
              </p>
            ) : null}
            {leadStatus === "error" ? (
              <p className="company-site-form-status company-site-form-status-error" role="alert">
                {copy.intake.error}
              </p>
            ) : null}
            <button className="company-site-primary" type="submit" disabled={leadStatus === "submitting"}>
              {leadStatus === "submitting" ? copy.intake.submitting : copy.intake.submit}
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      <section className="company-site-faq" id="faq">
        <div className="company-site-section-heading">
          <span>{copy.faq.eyebrow}</span>
          <h2>{copy.faq.title}</h2>
        </div>
        <div className="company-site-faq-grid">
          {copy.faq.items.map((item, index) => (
            <details className="company-site-faq-item" key={item.question} open={index === 1}>
              <summary>
                {item.question}
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
        </>
      )}

      <footer className="company-site-footer" aria-label={copy.aria.footer}>
        <div>
          <div className="company-site-footer-brand">
            <Shield aria-hidden="true" />
            <strong>GCC WebOS</strong>
          </div>
          <p>{copy.footer.description}</p>
        </div>
        <div className="company-site-footer-links">
          {copy.footer.columns.map((column) => (
            <FooterColumn
              title={column.title}
              links={[...column.links]}
              onLinkClick={handleInfoPageClick}
              key={column.title}
            />
          ))}
        </div>
        <div className="company-site-footer-bottom">
          <span>{copy.footer.copyright}</span>
          <span>{copy.footer.rights}</span>
        </div>
      </footer>
    </main>
  );
}

type DeviceRowProps = {
  icon: typeof Laptop;
  name: string;
  detail: string;
  tone: "active" | "idle";
};

function DeviceRow({ icon: Icon, name, detail, tone }: DeviceRowProps) {
  return (
    <div className="company-site-device-row">
      <div>
        <span><Icon aria-hidden="true" /></span>
        <div>
          <strong>{name}</strong>
          <small>{detail}</small>
        </div>
      </div>
      <span data-tone={tone}><span />{detail}</span>
    </div>
  );
}

type CompanySiteInfoPageProps = {
  page: (typeof companySiteCopy)[Locale]["infoPages"][CompanySiteInfoPageSlug];
  pageIcon: typeof ShieldCheck;
  registerUrl: string;
  shared: (typeof companySiteCopy)[Locale]["info"];
  onContactClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onHomeClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRegisterClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function CompanySiteInfoPage({
  page,
  pageIcon: PageIcon,
  registerUrl,
  shared,
  onContactClick,
  onHomeClick,
  onRegisterClick
}: CompanySiteInfoPageProps) {
  return (
    <section className="company-site-info-page">
      <div className="company-site-info-hero">
        <a className="company-site-back-link" href="#/site" onClick={onHomeClick}>
          <ArrowLeft aria-hidden="true" />
          {shared.back}
        </a>
        <div className="company-site-info-hero-grid">
          <div className="company-site-info-copy">
            <span className="company-site-info-eyebrow">{page.eyebrow}</span>
            <h1>{page.title}</h1>
            <p>{page.description}</p>
            <div className="company-site-info-actions">
              <a className="company-site-primary" href={registerUrl} onClick={onRegisterClick}>
                {shared.primaryCta}
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="company-site-secondary" href="#contact" onClick={onContactClick}>
                {shared.secondaryCta}
              </a>
            </div>
          </div>
          <aside className="company-site-info-facts" aria-label={shared.quickFacts}>
            <div className="company-site-info-facts-top">
              <span><PageIcon aria-hidden="true" /></span>
              <div>
                <small>{shared.dataSheet}</small>
                <strong>{page.title}</strong>
              </div>
            </div>
            <dl>
              {page.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            <p><span>{shared.updatedLabel}</span>{shared.updated}</p>
          </aside>
        </div>
      </div>

      <div className="company-site-info-body">
        <div className="company-site-info-cards">
          {page.cards.map((card) => (
            <article className="company-site-info-card" key={card.title}>
              <CheckCircle2 aria-hidden="true" />
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </article>
          ))}
        </div>

        <div className="company-site-info-section-list" aria-label={shared.details}>
          {page.sections.map((section) => (
            <article className="company-site-info-section" key={section.title}>
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

type FooterColumnProps = {
  links: Array<{ label: string; slug: CompanySiteInfoPageSlug }>;
  onLinkClick: (event: MouseEvent<HTMLAnchorElement>, slug: CompanySiteInfoPageSlug) => void;
  title: string;
};

function FooterColumn({ title, links, onLinkClick }: FooterColumnProps) {
  return (
    <div className="company-site-footer-column">
      <strong>{title}</strong>
      {links.map((link) => (
        <a
          href={buildCompanySiteInfoPageHash(link.slug)}
          key={link.slug}
          onClick={(event) => onLinkClick(event, link.slug)}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
