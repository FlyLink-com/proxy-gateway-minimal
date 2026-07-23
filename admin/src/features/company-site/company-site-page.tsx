import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  FileText,
  Globe2,
  Handshake,
  Info,
  Layers3,
  LifeBuoy,
  Menu,
  Route,
  ShieldCheck,
  Signpost,
  type LucideIcon
} from "lucide-react";
import { type FormEvent, type MouseEvent, useEffect, useState } from "react";

const siteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const leadEndpoint = (siteEnv.VITE_PUBLIC_LEAD_ENDPOINT ?? "").trim() || "/api/public/leads";
const portalPanelUrl = "https://portal.gccwebos.com/";
const portalRegisterUrl = "https://portal.gccwebos.com/portal/register/";
const loginUrl = (siteEnv.VITE_PUBLIC_LOGIN_URL ?? "").trim() || portalPanelUrl;
const registerUrl = (siteEnv.VITE_PUBLIC_REGISTER_URL ?? "").trim() || portalRegisterUrl;
const localeStorageKey = "gccwebos-site-locale";

const companySiteSectionIds = [
  "top",
  "features",
  "pricing",
  "how-it-works",
  "support",
  "contact",
  "faq"
] as const;

type CompanySiteSectionId = (typeof companySiteSectionIds)[number];
type Locale = "en" | "zh";
type InfoPageSlug =
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

type InfoPage = {
  title: string;
  summary: string;
  points: string[];
};

const localeOptions: Locale[] = ["zh", "en"];
const infoPageSlugs: InfoPageSlug[] = [
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

const localeLabels: Record<Locale, { lang: string; name: string; short: string }> = {
  en: { lang: "en", name: "English", short: "EN" },
  zh: { lang: "zh-CN", name: "中文", short: "中" }
};

const iconMap = {
  about: Info,
  access: Layers3,
  contact: Handshake,
  guide: BookOpen,
  help: LifeBuoy,
  path: Route,
  product: Compass,
  rules: ShieldCheck,
  status: Activity
} satisfies Record<string, LucideIcon>;

const companySiteCopy = {
  en: {
    meta: {
      title: "GCC WebOS - Make Digital Services Easier to Start"
    },
    aria: {
      brandHome: "GCC WebOS home",
      footer: "GCC WebOS public footer",
      language: "Language",
      navigation: "GCC WebOS website navigation",
      openNavigation: "Open navigation",
      productChoices: "GCC WebOS product choices",
      supportDirectory: "GCC WebOS support directory"
    },
    nav: {
      product: "Product",
      plans: "Plans",
      guide: "Guide",
      support: "Support",
      contact: "Contact",
      about: "About"
    },
    actions: {
      explore: "Explore",
      getStarted: "Get Started",
      signIn: "Sign In",
      learnMore: "Learn more",
      compare: "Explore this path",
      readGuide: "Read guide",
      getHelp: "Get help",
      viewStatus: "View status",
      reviewRules: "Review rules",
      about: "About GCC WebOS",
      submit: "Contact GCC WebOS",
      submitting: "Sending..."
    },
    hero: {
      title: "GCC WebOS makes digital services easier to start",
      description:
        "Discover the right path, get started with confidence, and find support when you need it—all through one connected GCC WebOS experience.",
      support: "Discover with confidence",
      portal: "Choose your path",
      partnership: "Grow with GCC WebOS"
    },
    brandVisual: {
      title: "One brand. One connected journey.",
      description: "From first look to signed-in service, every step stays familiar and focused.",
      lanes: ["Discover", "Choose", "Start", "Continue"]
    },
    product: {
      title: "Everything you need to move forward",
      description:
        "GCC WebOS brings discovery, guidance, and support together so every next step feels easier to understand and act on.",
      items: [
        {
          icon: "product",
          title: "Discover with clarity",
          description: "See the GCC WebOS experience and the ways to begin at a glance."
        },
        {
          icon: "guide",
          title: "Start with confidence",
          description: "Turn interest into a practical next step through a simple, guided journey."
        },
        {
          icon: "help",
          title: "Stay supported",
          description: "Keep helpful resources and clear ways to reach us close at hand."
        }
      ]
    },
    plans: {
      title: "Choose your way into GCC WebOS",
      description:
        "Start simple or open the conversation around a path shaped by your goals.",
      items: [
        {
          title: "Easy Start",
          description: "A direct way to discover GCC WebOS and move forward at your own pace.",
          points: ["Clear product essentials", "Guided next steps", "A smooth handoff to your account"]
        },
        {
          title: "Flexible Path",
          description: "For teams and visitors who want to shape the conversation around their goals.",
          points: ["Room for specific needs", "A direct line for questions", "A path that can grow with you"]
        }
      ],
      note: "Explore the direction that feels right; current account choices are confirmed in Portal."
    },
    guide: {
      title: "From first look to a confident start",
      description: "A simple journey keeps momentum high and every next step clear.",
      steps: [
        { title: "Discover value", description: "See how GCC WebOS brings the experience together." },
        { title: "Choose your path", description: "Find the starting direction that best matches your goals." },
        { title: "Get started", description: "Move forward through the existing account entry when you are ready." },
        { title: "Continue in Portal", description: "Sign in to continue your account and service experience." }
      ]
    },
    support: {
      title: "Help that keeps you moving",
      description: "Guides, answers, and public rules are close at hand whenever you need a clearer next step.",
      statement: "GCC WebOS brings the experience together.",
      portalStatement: "Your signed-in service experience continues in Portal.",
      resources: [
        {
          icon: "guide",
          title: "Usage guide",
          description: "Practical guidance for moving from interest to action.",
          action: "Read guide",
          slug: "download"
        },
        {
          icon: "help",
          title: "Support center",
          description: "Find answers and a clear way to continue the conversation.",
          action: "Get help",
          slug: "help"
        },
        {
          icon: "status",
          title: "Service status",
          description: "Find general notices and guidance when verified updates are available.",
          action: "View status",
          slug: "status"
        },
        {
          icon: "rules",
          title: "Rules & privacy",
          description: "Understand the principles that support a responsible experience.",
          action: "Review rules",
          slug: "privacy"
        }
      ]
    },
    conversion: {
      title: "Ready to experience GCC WebOS?",
      description:
        "Explore what fits, take the next step, and continue your signed-in experience in Portal.",
      steps: ["Discover the experience", "Choose your path", "Get started"]
    },
    intake: {
      title: "Build what comes next with GCC WebOS",
      description:
        "Have a product question, a team goal, or a partnership idea? Tell us where you want to go and start the conversation.",
      points: [
        "Bring us the outcome you want to reach",
        "Explore a path for individuals, teams, or partners",
        "Turn interest into a clear next step"
      ],
      fields: {
        organization: "Name or team",
        organizationPlaceholder: "Your name, team, or organization",
        email: "Email address",
        emailPlaceholder: "you@example.com",
        interest: "Interest",
        chooseInterest: "Choose an area",
        devices: "Devices",
        devicesPlaceholder: "Optional context",
        region: "Primary region",
        regionPlaceholder: "Optional context",
        useCase: "Use case",
        useCasePlaceholder: "Tell us what you want to understand, start, or build"
      },
      options: ["Easy Start", "Flexible Path", "Support", "Partnership"],
      note: "Registration, login, and signed-in service management remain in Portal.",
      success: "Request submitted. We will use these details to continue the conversation.",
      error: "Submission failed. Please try again or use the contact information in the support section."
    },
    faq: {
      title: "Questions before you begin?",
      description: "Find quick answers, then choose your next step with confidence.",
      items: [
        {
          question: "Where do I create an account or sign in?",
          answer: "Use Get Started for the existing registration entry, or Sign In to open Portal."
        },
        {
          question: "Is this website where I manage my service?",
          answer: "No. The public website explains the product and starting path. Signed-in service management stays in Portal."
        },
        {
          question: "How do I choose a product path?",
          answer: "Review the selection guidance, then continue in Portal or send a public inquiry when you need help."
        },
        {
          question: "Where can I review support and rules?",
          answer: "Use the support directory for the guide, help center, status information, privacy, and public rules."
        }
      ]
    },
    footer: {
      description: "A connected GCC WebOS experience for discovering, starting, and moving forward.",
      groups: [
        {
          title: "Product",
          links: [
            { label: "Product", slug: "features" },
            { label: "Plans", slug: "pricing" },
            { label: "Usage guide", slug: "download" },
            { label: "Changelog", slug: "changelog" }
          ]
        },
        {
          title: "Resources",
          links: [
            { label: "Terms", slug: "terms" },
            { label: "Privacy", slug: "privacy" },
            { label: "Acceptable use", slug: "acceptable-use" }
          ]
        },
        {
          title: "Company",
          links: [
            { label: "Support center", slug: "help" },
            { label: "Contact", slug: "contact" },
            { label: "Status", slug: "status" }
          ]
        }
      ],
      rights: "All rights reserved."
    },
    infoShared: {
      back: "Back to website",
      getStarted: "Get Started",
      contact: "Contact",
      note: "Public information only. Signed-in service management stays in Portal."
    },
    infoPages: {
      features: {
        title: "Product",
        summary: "A clear overview of the GCC WebOS public product experience and its Portal handoff.",
        points: ["Public product guidance", "Getting-started path", "Support and partnership entry", "Signed-in management in Portal"]
      },
      pricing: {
        title: "Plans",
        summary: "Selection guidance without presenting unverified commercial or availability details.",
        points: ["Compare the intent of each access path", "Confirm current choices in Portal", "Use the inquiry form when requirements need discussion"]
      },
      download: {
        title: "Usage guide",
        summary: "Public guidance for moving from exploration to the signed-in Portal experience.",
        points: ["Explore the product", "Create an account when ready", "Follow the next-step guidance", "Manage service in Portal"]
      },
      changelog: {
        title: "Changelog",
        summary: "A public place for product-experience updates when verified release notes are available.",
        points: ["Public-facing changes only", "No implied production state", "Verified updates take precedence over historical notes"]
      },
      terms: {
        title: "Terms of service",
        summary: "The public terms entry for GCC WebOS.",
        points: ["Use the service lawfully", "Protect account access", "Review current terms before continuing"]
      },
      privacy: {
        title: "Privacy policy",
        summary: "How this public website handles basic visitor and inquiry information.",
        points: ["Language preference", "Public inquiry details", "No advertising tracking on this public surface"]
      },
      "acceptable-use": {
        title: "Acceptable use",
        summary: "Public usage principles for a responsible GCC WebOS experience.",
        points: ["Follow applicable rules", "Do not misuse access", "Contact support when requirements are unclear"]
      },
      help: {
        title: "Support center",
        summary: "Public routes to guidance and support.",
        points: ["Review the usage guide", "Send a support inquiry", "Sign in to Portal for account-specific management"]
      },
      contact: {
        title: "Contact",
        summary: "Use the public inquiry form for product, support, or partnership questions.",
        points: ["Describe the outcome you need", "Do not include credentials or private service material", "Continue account actions in Portal"]
      },
      status: {
        title: "Service status",
        summary: "General service-status guidance without presenting an unverified live-health claim.",
        points: ["Check verified notices when available", "Use support for account-specific questions", "Do not infer runtime health from this page"]
      }
    } satisfies Record<InfoPageSlug, InfoPage>
  },
  zh: {
    meta: {
      title: "GCC WebOS - 让数字服务更容易开始"
    },
    aria: {
      brandHome: "GCC WebOS 首页",
      footer: "GCC WebOS 官网页脚",
      language: "语言",
      navigation: "GCC WebOS 官网导航",
      openNavigation: "打开导航",
      productChoices: "GCC WebOS 产品选择",
      supportDirectory: "GCC WebOS 支持目录"
    },
    nav: {
      product: "产品",
      plans: "套餐",
      guide: "指南",
      support: "支持",
      contact: "联系",
      about: "关于"
    },
    actions: {
      explore: "了解产品",
      getStarted: "开始使用",
      signIn: "登录",
      learnMore: "进一步了解",
      compare: "了解这个方向",
      readGuide: "阅读指南",
      getHelp: "获取帮助",
      viewStatus: "查看状态",
      reviewRules: "查看规则",
      about: "关于 GCC WebOS",
      submit: "联系 GCC WebOS",
      submitting: "发送中..."
    },
    hero: {
      title: "GCC WebOS，让数字服务更容易开始",
      description: "发现适合自己的方向，更有把握地开始，并在需要时获得支持。一切都在连贯一致的 GCC WebOS 体验中。",
      support: "从容发现价值",
      portal: "选择你的方向",
      partnership: "与 GCC WebOS 一起成长"
    },
    brandVisual: {
      title: "一个品牌，一段连贯旅程",
      description: "从第一次了解，到登录后继续使用，每一步都熟悉、清晰而专注。",
      lanes: ["发现", "选择", "开始", "继续"]
    },
    product: {
      title: "向前一步，需要的都在这里",
      description: "GCC WebOS 将发现、指引与支持汇聚在一起，让每一个下一步都更容易理解、更容易行动。",
      items: [
        { icon: "product", title: "清晰发现价值", description: "快速了解 GCC WebOS 体验，以及可以如何开始。" },
        { icon: "guide", title: "更有把握地开始", description: "用简单连贯的路径，把兴趣变成可以行动的下一步。" },
        { icon: "help", title: "一路获得支持", description: "实用资源与清晰的联系入口，始终触手可及。" }
      ]
    },
    plans: {
      title: "选择你的 GCC WebOS 开始方式",
      description: "从简单直接的开始，到围绕目标展开更深入的沟通，找到适合你的方向。",
      items: [
        {
          title: "轻松起步",
          description: "直接了解 GCC WebOS，按照自己的节奏从容向前。",
          points: ["清晰掌握产品重点", "跟随明确的下一步", "顺畅衔接账户体验"]
        },
        {
          title: "随需进阶",
          description: "适合希望围绕团队目标或具体需求展开沟通的访客。",
          points: ["为具体需求留出空间", "直接提出问题与目标", "让路径随你持续发展"]
        }
      ],
      note: "先探索适合自己的方向；当前账户选择以 Portal 确认为准。"
    },
    guide: {
      title: "从第一次了解，到从容开始",
      description: "简单而连贯的路径，让每一步都有方向，让开始更有把握。",
      steps: [
        { title: "发现价值", description: "了解 GCC WebOS 如何把体验连接起来。" },
        { title: "选择方向", description: "找到更符合个人目标的开始方式。" },
        { title: "开始体验", description: "准备好后，通过既有账户入口继续。" },
        { title: "在 Portal 继续", description: "登录后延续账户与服务体验。" }
      ]
    },
    support: {
      title: "让支持陪你继续向前",
      description: "需要更清晰的下一步时，指南、答案与公开规则都近在眼前。",
      statement: "GCC WebOS 将完整体验连接在一起。",
      portalStatement: "登录后的服务体验继续在 Portal 延伸。",
      resources: [
        { icon: "guide", title: "使用指南", description: "从产生兴趣到采取行动，获得实用指引。", action: "阅读指南", slug: "download" },
        { icon: "help", title: "支持中心", description: "找到答案，也找到继续沟通的清晰入口。", action: "获取帮助", slug: "help" },
        { icon: "status", title: "服务状态", description: "在有经过确认的更新时，查看一般通知与相关说明。", action: "查看状态", slug: "status" },
        { icon: "rules", title: "规则与隐私", description: "了解支持负责任体验的公开原则。", action: "查看规则", slug: "privacy" }
      ]
    },
    conversion: {
      title: "准备好体验 GCC WebOS 了吗？",
      description: "探索适合自己的方向，迈出下一步，并在 Portal 延续登录后的体验。",
      steps: ["发现产品体验", "选择你的方向", "开始使用"]
    },
    intake: {
      title: "与 GCC WebOS 一起，创造下一步",
      description: "无论是产品问题、团队目标还是合作想法，告诉我们你想去往哪里，让对话从这里开始。",
      points: ["带来你希望实现的目标", "探索个人、团队或合作伙伴方向", "把兴趣转化为清晰的下一步"],
      fields: {
        organization: "姓名或团队",
        organizationPlaceholder: "你的姓名、团队或组织",
        email: "邮箱",
        emailPlaceholder: "you@example.com",
        interest: "意向",
        chooseInterest: "选择意向",
        devices: "设备数量",
        devicesPlaceholder: "可选信息",
        region: "主要地区",
        regionPlaceholder: "可选信息",
        useCase: "需求说明",
        useCasePlaceholder: "告诉我们你希望了解、开始或合作的事项"
      },
      options: ["轻松起步", "随需进阶", "支持", "合作"],
      note: "注册、登录与登录后的服务管理仍在 Portal 完成。",
      success: "请求已提交。我们会使用这些信息继续沟通。",
      error: "提交失败。请重试，或使用支持页面中的联系方式。"
    },
    faq: {
      title: "开始之前，还有问题？",
      description: "快速找到答案，更有把握地选择下一步。",
      items: [
        { question: "在哪里创建账户或登录？", answer: "使用“开始使用”打开既有注册入口，或使用“登录”进入 Portal。" },
        { question: "官网用于管理服务吗？", answer: "不是。官网解释产品与开始路径；登录后的服务管理仍在 Portal 完成。" },
        { question: "如何选择产品方向？", answer: "先阅读选择说明；准备好后继续到 Portal，需要帮助时也可提交公开咨询。" },
        { question: "在哪里查看支持与规则？", answer: "支持目录提供指南、支持中心、状态说明、隐私与公开规则入口。" }
      ]
    },
    footer: {
      description: "从发现、开始到继续向前，GCC WebOS 带来连贯一致的数字体验。",
      groups: [
        {
          title: "产品",
          links: [
            { label: "产品", slug: "features" },
            { label: "套餐", slug: "pricing" },
            { label: "使用指南", slug: "download" },
            { label: "更新记录", slug: "changelog" }
          ]
        },
        {
          title: "资源",
          links: [
            { label: "服务条款", slug: "terms" },
            { label: "隐私政策", slug: "privacy" },
            { label: "可接受使用", slug: "acceptable-use" }
          ]
        },
        {
          title: "公司",
          links: [
            { label: "帮助中心", slug: "help" },
            { label: "联系", slug: "contact" },
            { label: "状态页", slug: "status" }
          ]
        }
      ],
      rights: "保留所有权利。"
    },
    infoShared: {
      back: "返回官网",
      getStarted: "开始使用",
      contact: "联系",
      note: "仅为公开信息。登录后的服务管理仍在 Portal 完成。"
    },
    infoPages: {
      features: {
        title: "产品",
        summary: "清晰说明 GCC WebOS 的公开产品体验及其与 Portal 的衔接。",
        points: ["公开产品说明", "开始使用路径", "支持与合作入口", "在 Portal 完成登录后管理"]
      },
      pricing: {
        title: "套餐",
        summary: "提供选择方向，但不展示未经确认的商业或可用性信息。",
        points: ["比较接入方向", "在 Portal 确认当前选择", "有具体需求时提交公开咨询"]
      },
      download: {
        title: "使用指南",
        summary: "从了解产品到进入 Portal 的公开开始说明。",
        points: ["了解产品", "准备好后创建账户", "按照下一步指南操作", "在 Portal 管理服务"]
      },
      changelog: {
        title: "更新记录",
        summary: "在有经过验证的公开发布说明时，记录产品体验更新。",
        points: ["只记录公开变化", "不暗示生产状态", "经过验证的新信息优先于历史记录"]
      },
      terms: {
        title: "服务条款",
        summary: "GCC WebOS 的公开服务条款入口。",
        points: ["合法使用服务", "保护账户访问", "继续前查看当前条款"]
      },
      privacy: {
        title: "隐私政策",
        summary: "说明官网如何处理基本访客信息与公开咨询信息。",
        points: ["语言偏好", "公开咨询信息", "当前未使用广告追踪"]
      },
      "acceptable-use": {
        title: "可接受使用",
        summary: "负责任使用 GCC WebOS 的公开原则。",
        points: ["遵守适用规则", "不得滥用访问能力", "需求不清楚时联系支持"]
      },
      help: {
        title: "帮助中心",
        summary: "进入公开指南与支持的入口。",
        points: ["查看使用指南", "提交支持咨询", "账户事项登录 Portal 管理"]
      },
      contact: {
        title: "联系",
        summary: "通过公开表单咨询产品、支持或合作事项。",
        points: ["说明希望达成的结果", "不要提交凭证或私有服务材料", "账户操作继续在 Portal 完成"]
      },
      status: {
        title: "服务状态",
        summary: "提供一般状态说明，不展示未经验证的实时健康承诺。",
        points: ["有经过验证的通知时再查看", "账户问题使用支持入口", "不要从本页推断运行时健康状态"]
      }
    } satisfies Record<InfoPageSlug, InfoPage>
  }
} as const;

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "zh";
}

function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") {
    return "en";
  }

  const stored = window.localStorage.getItem(localeStorageKey);
  if (isLocale(stored)) {
    return stored;
  }

  const browserLanguages = [
    ...(window.navigator.languages ?? []),
    window.navigator.language
  ].filter(Boolean);
  return browserLanguages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function isInfoPageSlug(value: string | null | undefined): value is InfoPageSlug {
  return infoPageSlugs.includes(value as InfoPageSlug);
}

function readInfoPageFromHash(): InfoPageSlug | null {
  if (typeof window === "undefined") {
    return null;
  }

  const match = window.location.hash.match(/^#\/site\/info\/([^/?#]+)/);
  return isInfoPageSlug(match?.[1]) ? match[1] : null;
}

function buildInfoPageHash(slug: InfoPageSlug) {
  return `#/site/info/${slug}`;
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function buildPublicLeadPayload(formData: FormData) {
  const organization = readFormValue(formData, "organization");
  const email = readFormValue(formData, "email");
  const interest = readFormValue(formData, "plan");
  const devices = readFormValue(formData, "devices");
  const region = readFormValue(formData, "region");
  const message = readFormValue(formData, "message");

  return {
    organization,
    email,
    direction: "GCC WebOS access inquiry",
    stage: interest,
    source: "gccwebos-public-site",
    message: [
      `interest=${interest || "unspecified"}`,
      `deviceCount=${devices || "unspecified"}`,
      `region=${region || "unspecified"}`,
      message
    ].join("\n")
  };
}

export function CompanySitePage() {
  const [locale, setLocale] = useState<Locale>(detectBrowserLocale);
  const [activeSection, setActiveSection] = useState<CompanySiteSectionId>("top");
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [infoPage, setInfoPage] = useState<InfoPageSlug | null>(readInfoPageFromHash);
  const [leadStatus, setLeadStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const copy = companySiteCopy[locale];

  useEffect(() => {
    const handleHashChange = () => setInfoPage(readInfoPageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = localeLabels[locale].lang;
    document.title = infoPage
      ? `${copy.infoPages[infoPage].title} - GCC WebOS`
      : copy.meta.title;
  }, [copy, infoPage, locale]);

  const selectLocale = (nextLocale: Locale) => {
    window.localStorage.setItem(localeStorageKey, nextLocale);
    setLocale(nextLocale);
  };

  const handleSectionClick = (
    event: MouseEvent<HTMLAnchorElement>,
    sectionId: CompanySiteSectionId
  ) => {
    event.preventDefault();
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start"
    });
    window.history.replaceState(null, "", "#/site");
    setActiveSection(sectionId);
    setIsMobileNavigationOpen(false);
  };

  const openInfoPage = (event: MouseEvent<HTMLAnchorElement>, slug: InfoPageSlug) => {
    event.preventDefault();
    window.location.hash = buildInfoPageHash(slug);
    setInfoPage(slug);
    setIsMobileNavigationOpen(false);
  };

  const returnHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.location.hash = "#/site";
    setInfoPage(null);
    setActiveSection("top");
  };

  const handleLeadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setLeadStatus("submitting");

    try {
      const response = await fetch(leadEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPublicLeadPayload(new FormData(form)))
      });

      if (!response.ok) {
        throw new Error(`lead submission failed with ${response.status}`);
      }

      form.reset();
      setLeadStatus("success");
    } catch {
      setLeadStatus("error");
    }
  };

  if (infoPage) {
    return (
      <CompanySiteInfoPage
        copy={copy}
        locale={locale}
        onContact={(event) => {
          event.preventDefault();
          window.location.hash = "#/site";
          setInfoPage(null);
          window.setTimeout(() => {
            document.getElementById("contact")?.scrollIntoView({
              behavior: prefersReducedMotion() ? "auto" : "smooth",
              block: "start"
            });
          }, 0);
        }}
        onHome={returnHome}
        page={copy.infoPages[infoPage]}
      />
    );
  }

  return (
    <main className="company-site-shell" data-active-section={activeSection} data-locale={locale}>
      <header className="company-site-header" data-mobile-menu-open={isMobileNavigationOpen}>
        <a
          className="company-site-brand"
          href="#top"
          aria-label={copy.aria.brandHome}
          onClick={(event) => handleSectionClick(event, "top")}
        >
          <BrandMark />
          <strong>GCC WebOS</strong>
        </a>

        <nav
          className="company-site-nav"
          id="company-site-mobile-nav"
          aria-label={copy.aria.navigation}
          data-mobile-menu-open={isMobileNavigationOpen}
        >
          <a href="#features" onClick={(event) => handleSectionClick(event, "features")}>{copy.nav.product}</a>
          <a href="#pricing" onClick={(event) => handleSectionClick(event, "pricing")}>{copy.nav.plans}</a>
          <a href="#how-it-works" onClick={(event) => handleSectionClick(event, "how-it-works")}>{copy.nav.guide}</a>
          <a href="#support" onClick={(event) => handleSectionClick(event, "support")}>{copy.nav.support}</a>
          <a href="#contact" onClick={(event) => handleSectionClick(event, "contact")}>{copy.nav.contact}</a>
          <a href={buildInfoPageHash("features")} onClick={(event) => openInfoPage(event, "features")}>{copy.nav.about}</a>
        </nav>

        <div className="company-site-header-actions">
          <div className="company-site-language-switch" role="group" aria-label={copy.aria.language}>
            {localeOptions.map((option) => (
              <button
                aria-pressed={locale === option}
                key={option}
                onClick={() => selectLocale(option)}
                title={localeLabels[option].name}
                type="button"
              >
                {localeLabels[option].short}
              </button>
            ))}
          </div>
          <a className="company-site-text-action" href={loginUrl}>{copy.actions.signIn}</a>
          <a className="company-site-primary compact" href={registerUrl}>{copy.actions.getStarted}</a>
          <button
            className="company-site-menu-button"
            type="button"
            aria-label={copy.aria.openNavigation}
            aria-controls="company-site-mobile-nav"
            aria-expanded={isMobileNavigationOpen}
            onClick={() => setIsMobileNavigationOpen((current) => !current)}
          >
            <Menu aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="company-site-hero" id="top">
        <div className="company-site-hero-copy">
          <h1>{copy.hero.title}</h1>
          <p>{copy.hero.description}</p>
          <div className="company-site-actions">
            <a className="company-site-primary" href="#features" onClick={(event) => handleSectionClick(event, "features")}>
              {copy.actions.explore}
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="company-site-secondary" href={registerUrl}>{copy.actions.getStarted}</a>
            <a className="company-site-tertiary" href={loginUrl}>{copy.actions.signIn}</a>
          </div>
          <div className="company-site-hero-index" aria-label="GCC WebOS public website areas">
            {[copy.hero.support, copy.hero.portal, copy.hero.partnership].map((item, index) => (
              <span key={item}><b>0{index + 1}</b>{item}</span>
            ))}
          </div>
        </div>

        <div className="company-site-brand-visual" aria-label={copy.brandVisual.title}>
          <div className="company-site-brand-visual-heading">
            <BrandMark />
            <div>
              <strong>{copy.brandVisual.title}</strong>
              <span>{copy.brandVisual.description}</span>
            </div>
          </div>
          <div className="company-site-lane-map" aria-hidden="true">
            {copy.brandVisual.lanes.map((lane, index) => (
              <div className="company-site-lane" key={lane}>
                <span>0{index + 1}</span>
                <i />
                <strong>{lane}</strong>
              </div>
            ))}
          </div>
          <div className="company-site-workspace-outline" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="company-site-product-layer" id="features">
        <div className="company-site-section-intro">
          <span>01</span>
          <div>
            <h2>{copy.product.title}</h2>
            <p>{copy.product.description}</p>
          </div>
        </div>
        <div className="company-site-product-list">
          {copy.product.items.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <article key={item.title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </article>
            );
          })}
        </div>
      </section>

      <section className="company-site-plans" id="pricing">
        <div className="company-site-section-heading">
          <h2>{copy.plans.title}</h2>
          <p>{copy.plans.description}</p>
        </div>
        <div className="company-site-product-rail" aria-label={copy.aria.productChoices}>
          {copy.plans.items.map((item, index) => (
            <article key={item.title}>
              <span>0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>
                {item.points.map((point) => (
                  <li key={point}><Check aria-hidden="true" />{point}</li>
                ))}
              </ul>
              <a className={index === 1 ? "company-site-primary" : "company-site-secondary"} href={registerUrl}>
                {index === 1 ? copy.actions.getStarted : copy.actions.compare}
                <ArrowRight aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
        <p className="company-site-plans-note">{copy.plans.note}</p>
      </section>

      <section className="company-site-guide" id="how-it-works">
        <div className="company-site-section-heading">
          <h2>{copy.guide.title}</h2>
          <p>{copy.guide.description}</p>
        </div>
        <ol className="company-site-guide-steps">
          {copy.guide.steps.map((step, index) => (
            <li key={step.title}>
              <span>0{index + 1}</span>
              <i aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <a className="company-site-inline-action" href={buildInfoPageHash("download")} onClick={(event) => openInfoPage(event, "download")}>
          <BookOpen aria-hidden="true" />
          {copy.actions.readGuide}
          <ArrowRight aria-hidden="true" />
        </a>
      </section>

      <section className="company-site-support" id="support">
        <div className="company-site-support-copy">
          <h2>{copy.support.title}</h2>
          <p>{copy.support.description}</p>
          <div className="company-site-connection-map" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <i />
          </div>
        </div>
        <div className="company-site-support-directory" aria-label={copy.aria.supportDirectory}>
          {copy.support.resources.map((resource) => {
            const Icon = iconMap[resource.icon];
            const slug = resource.slug as InfoPageSlug;
            return (
              <a href={buildInfoPageHash(slug)} key={resource.title} onClick={(event) => openInfoPage(event, slug)}>
                <Icon aria-hidden="true" />
                <span>
                  <strong>{resource.title}</strong>
                  <small>{resource.description}</small>
                </span>
                <b>{resource.action}<ArrowRight aria-hidden="true" /></b>
              </a>
            );
          })}
        </div>
        <div className="company-site-support-statement">
          <BrandMark />
          <p><strong>{copy.support.statement}</strong> {copy.support.portalStatement}</p>
          <div>
            <a className="company-site-secondary" href={buildInfoPageHash("features")} onClick={(event) => openInfoPage(event, "features")}>
              {copy.actions.about}
            </a>
            <a className="company-site-primary" href={loginUrl}>{copy.actions.signIn}<ArrowRight aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section className="company-site-conversion">
        <div>
          <h2>{copy.conversion.title}</h2>
          <p>{copy.conversion.description}</p>
        </div>
        <ol>
          {copy.conversion.steps.map((step, index) => (
            <li key={step}><span>0{index + 1}</span>{step}</li>
          ))}
        </ol>
        <div className="company-site-actions">
          <a className="company-site-primary" href={registerUrl}>{copy.actions.getStarted}<ArrowRight aria-hidden="true" /></a>
          <a className="company-site-secondary" href={loginUrl}>{copy.actions.signIn}</a>
        </div>
      </section>

      <section className="company-site-intake" id="contact">
        <div className="company-site-partnership-copy">
          <span>GCC WebOS</span>
          <h2>{copy.intake.title}</h2>
          <p>{copy.intake.description}</p>
          <ul>
            {copy.intake.points.map((point) => (
              <li key={point}><Handshake aria-hidden="true" />{point}</li>
            ))}
          </ul>
        </div>
        <form className="company-site-contact-form" onSubmit={handleLeadSubmit}>
          <div className="company-site-form-grid">
            <label>
              {copy.intake.fields.organization}
              <input name="organization" placeholder={copy.intake.fields.organizationPlaceholder} required />
            </label>
            <label>
              {copy.intake.fields.email}
              <input name="email" placeholder={copy.intake.fields.emailPlaceholder} required type="email" />
            </label>
            <label>
              {copy.intake.fields.interest}
              <select defaultValue="" name="plan" required>
                <option disabled value="">{copy.intake.fields.chooseInterest}</option>
                {copy.intake.options.map((option, index) => (
                  <option key={option} value={index === 0 ? "Essential Access" : index === 1 ? "Flexible Access" : option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy.intake.fields.devices}
              <input name="devices" placeholder={copy.intake.fields.devicesPlaceholder} />
            </label>
            <label className="company-site-form-wide">
              {copy.intake.fields.region}
              <input name="region" placeholder={copy.intake.fields.regionPlaceholder} />
            </label>
            <label className="company-site-form-wide">
              {copy.intake.fields.useCase}
              <textarea name="message" placeholder={copy.intake.fields.useCasePlaceholder} required rows={4} />
            </label>
          </div>
          <p className="company-site-form-note"><ShieldCheck aria-hidden="true" />{copy.intake.note}</p>
          {leadStatus === "success" ? <p className="company-site-form-status is-success" role="status">{copy.intake.success}</p> : null}
          {leadStatus === "error" ? <p className="company-site-form-status is-error" role="alert">{copy.intake.error}</p> : null}
          <button className="company-site-primary" type="submit" disabled={leadStatus === "submitting"}>
            {leadStatus === "submitting" ? copy.actions.submitting : copy.actions.submit}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>

      <section className="company-site-faq" id="faq">
        <div className="company-site-section-heading">
          <h2>{copy.faq.title}</h2>
          <p>{copy.faq.description}</p>
        </div>
        <div className="company-site-faq-list">
          {copy.faq.items.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>
                <span>{item.question}</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="company-site-footer" aria-label={copy.aria.footer}>
        <div className="company-site-footer-brand-block">
          <div className="company-site-footer-brand"><BrandMark /><strong>GCC WebOS</strong></div>
          <p>{copy.footer.description}</p>
        </div>
        <div className="company-site-footer-links">
          {copy.footer.groups.map((group) => (
            <FooterColumn group={group} key={group.title} onOpen={openInfoPage} />
          ))}
        </div>
        <div className="company-site-footer-bottom">
          <span>© 2026 GCC WebOS · gccwebos.com</span>
          <span>{copy.footer.rights}</span>
        </div>
      </footer>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="company-site-brand-mark" aria-hidden="true">
      <Globe2 />
    </span>
  );
}

function FooterColumn({
  group,
  onOpen
}: {
  group: { title: string; links: ReadonlyArray<{ label: string; slug: string }> };
  onOpen: (event: MouseEvent<HTMLAnchorElement>, slug: InfoPageSlug) => void;
}) {
  return (
    <div className="company-site-footer-column">
      <strong>{group.title}</strong>
      {group.links.map((link) => {
        const slug = link.slug as InfoPageSlug;
        return (
          <a href={buildInfoPageHash(slug)} key={link.label} onClick={(event) => onOpen(event, slug)}>
            {link.label}
          </a>
        );
      })}
    </div>
  );
}

function CompanySiteInfoPage({
  copy,
  locale,
  onContact,
  onHome,
  page
}: {
  copy: (typeof companySiteCopy)[Locale];
  locale: Locale;
  onContact: (event: MouseEvent<HTMLAnchorElement>) => void;
  onHome: (event: MouseEvent<HTMLAnchorElement>) => void;
  page: InfoPage;
}) {
  return (
    <main className="company-site-shell" data-locale={locale}>
      <section className="company-site-info-page">
        <a className="company-site-back-link" href="#/site" onClick={onHome}>
          <ArrowLeft aria-hidden="true" />
          {copy.infoShared.back}
        </a>
        <div className="company-site-info-layout">
          <div>
            <BrandMark />
            <h1>{page.title}</h1>
            <p>{page.summary}</p>
            <div className="company-site-actions">
              <a className="company-site-primary" href={registerUrl}>{copy.infoShared.getStarted}<ArrowRight aria-hidden="true" /></a>
              <a className="company-site-secondary" href="#contact" onClick={onContact}>{copy.infoShared.contact}</a>
            </div>
          </div>
          <article>
            <Signpost aria-hidden="true" />
            <ul>
              {page.points.map((point) => (
                <li key={point}><Check aria-hidden="true" />{point}</li>
              ))}
            </ul>
            <p>{copy.infoShared.note}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
