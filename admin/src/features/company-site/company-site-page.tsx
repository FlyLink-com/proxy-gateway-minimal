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
      title: "GCC WebOS - Connect with ease"
    },
    aria: {
      brandHome: "GCC WebOS home",
      closeContact: "Close contact form",
      closeStart: "Close start options",
      contactDialog: "Start a conversation",
      footer: "GCC WebOS public footer",
      language: "Language",
      navigation: "GCC WebOS website navigation",
      openNavigation: "Open navigation",
      productChoices: "GCC WebOS product choices",
      startChooser: "Choose how to start",
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
      createAccount: "Create account",
      signInNow: "Sign in now",
      openStart: "Choose how to start",
      openContact: "Start a conversation",
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
      eyebrow: "CONNECTED EXPERIENCE",
      title: "Connect to the world. Start with ease.",
      description:
        "See what GCC WebOS can do, choose what fits, and begin your connected experience with confidence.",
      support: "Discover",
      portal: "Choose",
      partnership: "Start"
    },
    brandVisual: {
      title: "One brand. One connected journey.",
      description: "From first look to the experience that follows, every step stays familiar and focused.",
      lanes: ["Discover", "Choose", "Start", "Continue"]
    },
    product: {
      title: "Find what fits your next step",
      description:
        "See the essentials at a glance, then swipe through the ways GCC WebOS can help you begin.",
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
      title: "Choose your way to begin",
      description:
        "Start at your own pace or open a conversation around your team and partnership goals.",
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
      note: "Choose what feels right today. You can create an account or sign in whenever you are ready."
    },
    guide: {
      title: "See every step as you move",
      description: "Swipe through a simple journey from discovery to the experience that comes next.",
      swipeHint: "Swipe left, or keep scrolling down",
      steps: [
        { title: "Discover", description: "See what GCC WebOS can bring to your connected experience." },
        { title: "Choose", description: "Compare the starting direction that feels right for you." },
        { title: "Start", description: "Create an account when you are ready to begin." },
        { title: "Continue", description: "Sign in anytime and keep your GCC WebOS experience moving." }
      ]
    },
    support: {
      title: "Support and answers, together",
      description: "Guides, answers, service information, and public rules stay easy to reach.",
      statement: "Already have an account?",
      portalStatement: "Continue your GCC WebOS experience.",
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
          description: "See the latest GCC WebOS notices in one familiar place.",
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
      title: "Ready for what comes next?",
      description:
        "Choose what fits, create an account, or sign in to continue your GCC WebOS experience.",
      steps: ["Discover", "Choose", "Start"]
    },
    intake: {
      title: "Start a conversation with GCC WebOS",
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
      note: "When you are ready, continue your GCC WebOS journey from the account entry.",
      success: "Request submitted. We will use these details to continue the conversation.",
      error: "Submission failed. Please try again or use the contact information in the support section."
    },
    faq: {
      title: "Questions? Start here.",
      description: "Find a quick answer, then choose the way you want to begin.",
      items: [
        {
          question: "Where do I create an account or sign in?",
          answer: "Choose Create account if you are new, or Sign in if you already have an account."
        },
        {
          question: "I already have an account. How do I continue?",
          answer: "Choose Sign in to continue your GCC WebOS experience."
        },
        {
          question: "Which way to begin is right for me?",
          answer: "Review the two starting directions, or send an inquiry when you want help choosing."
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
      note: "Explore here, then create an account or sign in whenever you are ready."
    },
    infoPages: {
      features: {
        title: "Product",
        summary: "A clear overview of the GCC WebOS experience and the ways you can begin.",
        points: ["Product highlights", "Ways to get started", "Support and partnership entry", "A direct account sign-in"]
      },
      pricing: {
        title: "Plans",
        summary: "Compare the ways to begin and choose the one that feels right.",
        points: ["See each direction at a glance", "Choose at your own pace", "Start a conversation when you want help deciding"]
      },
      download: {
        title: "Usage guide",
        summary: "A simple guide for moving from exploration to your GCC WebOS account experience.",
        points: ["Explore the product", "Create an account when ready", "Follow the next-step guidance", "Sign in to continue"]
      },
      changelog: {
        title: "Changelog",
        summary: "Follow the public evolution of the GCC WebOS experience.",
        points: ["Discover what is new", "See how the experience is improving", "Return for future updates"]
      },
      terms: {
        title: "Terms of service",
        summary: "The public terms entry for GCC WebOS.",
        points: ["Use the service lawfully", "Protect account access", "Review current terms before continuing"]
      },
      privacy: {
        title: "Privacy policy",
        summary: "Your privacy matters from the first visit.",
        points: ["Your language choice stays on this device", "Inquiry details help us respond to your request", "No advertising trackers shape this experience"]
      },
      "acceptable-use": {
        title: "Acceptable use",
        summary: "Public usage principles for a responsible GCC WebOS experience.",
        points: ["Follow applicable rules", "Do not misuse access", "Contact support when requirements are unclear"]
      },
      help: {
        title: "Support center",
        summary: "Helpful guidance is always close at hand.",
        points: ["Explore the usage guide", "Start a support conversation", "Sign in when your question is about your account"]
      },
      contact: {
        title: "Contact",
        summary: "Bring us your product question, support need, or partnership idea.",
        points: ["Tell us the outcome you want", "Keep sensitive account details private", "Choose the conversation that fits"]
      },
      status: {
        title: "Service status",
        summary: "A simple place to find GCC WebOS service notices.",
        points: ["See the latest published notice", "Find support when you need help", "Return anytime for new updates"]
      }
    } satisfies Record<InfoPageSlug, InfoPage>
  },
  zh: {
    meta: {
      title: "GCC WebOS - 连接世界，轻松开始"
    },
    aria: {
      brandHome: "GCC WebOS 首页",
      closeContact: "关闭联系表单",
      closeStart: "关闭开始方式",
      contactDialog: "开始沟通",
      footer: "GCC WebOS 官网页脚",
      language: "语言",
      navigation: "GCC WebOS 官网导航",
      openNavigation: "打开导航",
      productChoices: "GCC WebOS 产品选择",
      startChooser: "选择开始方式",
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
      createAccount: "创建账户",
      signInNow: "立即登录",
      openStart: "选择开始方式",
      openContact: "开始沟通",
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
      eyebrow: "畅连体验",
      title: "连接世界，也连接每一次开始",
      description: "一眼了解 GCC WebOS，找到适合自己的方式，轻松开启连接体验。",
      support: "了解",
      portal: "选择",
      partnership: "开始"
    },
    brandVisual: {
      title: "一个品牌，一段连贯旅程",
      description: "从第一次了解，到登录后继续使用，每一步都熟悉、清晰而专注。",
      lanes: ["发现", "选择", "开始", "继续"]
    },
    product: {
      title: "找到适合你的开始方式",
      description: "一眼掌握产品重点，再左右滑动，看看 GCC WebOS 可以如何陪你开始。",
      items: [
        { icon: "product", title: "清晰发现价值", description: "快速了解 GCC WebOS 体验，以及可以如何开始。" },
        { icon: "guide", title: "更有把握地开始", description: "用简单连贯的方式，把兴趣变成可以行动的下一步。" },
        { icon: "help", title: "一路获得支持", description: "实用资源与清晰的联系入口，始终触手可及。" }
      ]
    },
    plans: {
      title: "选择你的开始方式",
      description: "按自己的节奏轻松开始，也可以围绕团队与合作目标展开沟通。",
      items: [
        {
          title: "轻松起步",
          description: "直接了解 GCC WebOS，按照自己的节奏从容向前。",
          points: ["清晰掌握产品重点", "跟随明确的下一步", "顺畅衔接账户体验"]
        },
        {
          title: "随需进阶",
          description: "适合希望围绕团队目标或具体需求展开沟通的访客。",
          points: ["为具体需求留出空间", "直接提出问题与目标", "让体验随你持续发展"]
        }
      ],
      note: "先选择适合自己的方向；准备好后即可创建账户或登录。"
    },
    guide: {
      title: "滑动之间，看清每一步",
      description: "从了解、选择到开始与继续，用一次滑动看清完整旅程。",
      swipeHint: "向左滑动，或继续向下滚动",
      steps: [
        { title: "发现", description: "一眼看懂 GCC WebOS 能为你带来什么。" },
        { title: "选择", description: "比较更适合自己的开始方式。" },
        { title: "开始", description: "准备好后创建账户，立即开启体验。" },
        { title: "继续", description: "随时登录，继续你的 GCC WebOS 体验。" }
      ]
    },
    support: {
      title: "支持与答案，放在同一处",
      description: "指南、答案、服务信息与公开规则，都可以随时找到。",
      statement: "已有账户？",
      portalStatement: "继续你的 GCC WebOS 体验。",
      resources: [
        { icon: "guide", title: "使用指南", description: "从产生兴趣到采取行动，获得实用指引。", action: "阅读指南", slug: "download" },
        { icon: "help", title: "支持中心", description: "找到答案，也找到继续沟通的清晰入口。", action: "获取帮助", slug: "help" },
        { icon: "status", title: "服务状态", description: "在熟悉的位置，查看 GCC WebOS 最新公开通知。", action: "查看状态", slug: "status" },
        { icon: "rules", title: "规则与隐私", description: "了解支持负责任体验的公开原则。", action: "查看规则", slug: "privacy" }
      ]
    },
    conversion: {
      title: "准备好，连接你的下一程",
      description: "选择适合自己的方式，创建账户或立即登录，轻松继续 GCC WebOS。",
      steps: ["了解", "选择", "开始"]
    },
    intake: {
      title: "与 GCC WebOS 开始沟通",
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
      note: "准备好时，从账户入口继续你的 GCC WebOS 旅程。",
      success: "请求已提交。我们会使用这些信息继续沟通。",
      error: "提交失败。请重试，或使用支持页面中的联系方式。"
    },
    faq: {
      title: "有问题？从这里开始",
      description: "先找到简洁答案，再选择适合自己的开始方式。",
      items: [
        { question: "在哪里创建账户或登录？", answer: "第一次使用可创建账户，已有账户可直接登录。" },
        { question: "已经有账户，如何继续？", answer: "选择“登录”，继续你的 GCC WebOS 体验。" },
        { question: "哪种开始方式适合我？", answer: "先比较两种开始方向，需要帮助时也可以提交咨询。" },
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
      note: "先在这里了解，准备好时再创建账户或登录。"
    },
    infoPages: {
      features: {
        title: "产品",
        summary: "清晰了解 GCC WebOS 体验与不同的开始方式。",
        points: ["产品亮点", "开始方式", "支持与合作入口", "直接登录账户"]
      },
      pricing: {
        title: "套餐",
        summary: "比较不同的开始方式，选择此刻更适合你的方向。",
        points: ["一眼看懂每个方向", "按照自己的节奏选择", "需要建议时直接开始沟通"]
      },
      download: {
        title: "使用指南",
        summary: "从了解产品到继续账户体验的简洁指南。",
        points: ["了解产品", "准备好后创建账户", "按照下一步指南操作", "登录后继续"]
      },
      changelog: {
        title: "更新记录",
        summary: "持续了解 GCC WebOS 公开体验如何向前演进。",
        points: ["发现新的变化", "了解体验如何持续改善", "随时回来查看后续更新"]
      },
      terms: {
        title: "服务条款",
        summary: "GCC WebOS 的公开服务条款入口。",
        points: ["合法使用服务", "保护账户访问", "继续前查看当前条款"]
      },
      privacy: {
        title: "隐私政策",
        summary: "从第一次访问开始，尊重你的隐私选择。",
        points: ["语言偏好只保存在你的设备上", "联系信息只用于回应你的需求", "官网不使用广告追踪塑造体验"]
      },
      "acceptable-use": {
        title: "可接受使用",
        summary: "负责任使用 GCC WebOS 的公开原则。",
        points: ["遵守适用规则", "不得滥用访问能力", "需求不清楚时联系支持"]
      },
      help: {
        title: "帮助中心",
        summary: "需要指引时，帮助始终触手可及。",
        points: ["探索使用指南", "开始支持沟通", "账户相关问题可登录后继续"]
      },
      contact: {
        title: "联系",
        summary: "带来你的产品问题、支持需求或合作想法。",
        points: ["告诉我们希望实现的结果", "请保留敏感账户信息", "选择适合你的沟通方向"]
      },
      status: {
        title: "服务状态",
        summary: "在一个清晰的位置查看 GCC WebOS 服务通知。",
        points: ["查看最新公开通知", "需要帮助时前往支持中心", "随时回来了解新的更新"]
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
  const [activeGuideStep, setActiveGuideStep] = useState(0);
  const [isMobileContactOpen, setIsMobileContactOpen] = useState(false);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isStartChooserOpen, setIsStartChooserOpen] = useState(false);
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
    <main
      className="company-site-shell"
      data-active-section={activeSection}
      data-contact-open={isMobileContactOpen}
      data-locale={locale}
      data-start-open={isStartChooserOpen}
    >
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
          <span className="company-site-hero-eyebrow">GCC WEBOS · {copy.hero.eyebrow}</span>
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
        <div className="company-site-mobile-start-card">
          <div>
            <strong>{copy.actions.openStart}</strong>
            <span>{copy.actions.createAccount} · {copy.actions.signInNow}</span>
          </div>
          <button
            aria-controls="company-site-start-chooser"
            aria-expanded={isStartChooserOpen}
            onClick={() => setIsStartChooserOpen(true)}
            type="button"
          >
            {copy.actions.openStart}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </section>

      {isStartChooserOpen ? (
        <div className="company-site-start-overlay">
          <button
            aria-label={copy.aria.closeStart}
            className="company-site-sheet-backdrop"
            onClick={() => setIsStartChooserOpen(false)}
            type="button"
          />
          <section
            aria-label={copy.aria.startChooser}
            aria-modal="true"
            className="company-site-start-chooser"
            id="company-site-start-chooser"
            role="dialog"
          >
            <header>
              <button aria-label={copy.aria.closeStart} onClick={() => setIsStartChooserOpen(false)} type="button">×</button>
              <strong>GCC WebOS</strong>
              <CircleHelp aria-hidden="true" />
            </header>
            <div className="company-site-start-orbit" aria-hidden="true">
              <span />
              <span />
              <i>G</i>
              <b>{copy.actions.openStart}</b>
            </div>
            <div className="company-site-start-sheet-copy">
              <small>WELCOME TO GCC WEBOS</small>
              <h2>{copy.actions.openStart}</h2>
              <p>{copy.hero.description}</p>
            </div>
            <a aria-label={copy.actions.createAccount} className="company-site-start-choice is-primary" href={registerUrl}>
              <span><b>01</b><strong>{copy.actions.createAccount}</strong></span>
              <ArrowRight aria-hidden="true" />
            </a>
            <a aria-label={copy.actions.signInNow} className="company-site-start-choice" href={loginUrl}>
              <span><b>02</b><strong>{copy.actions.signInNow}</strong></span>
              <ArrowRight aria-hidden="true" />
            </a>
          </section>
        </div>
      ) : null}

      <section className="company-site-product-layer" id="features">
        <div className="company-site-section-intro">
          <span>01</span>
          <div>
            <h2>{copy.product.title}</h2>
            <p>{copy.product.description}</p>
          </div>
        </div>
        <div className="company-site-product-list" data-mobile-rail="true">
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
        <div className="company-site-product-rail" aria-label={copy.aria.productChoices} data-mobile-rail="true">
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
        <ol
          aria-label={copy.guide.title}
          className="company-site-guide-steps"
          data-active-step={activeGuideStep}
          data-mobile-rail="true"
          onScroll={(event) => {
            const stepWidth = event.currentTarget.clientWidth;
            if (stepWidth <= 0) {
              return;
            }
            setActiveGuideStep(Math.max(0, Math.min(
              copy.guide.steps.length - 1,
              Math.round(event.currentTarget.scrollLeft / stepWidth)
            )));
          }}
          tabIndex={0}
        >
          {copy.guide.steps.map((step, index) => (
            <li data-active={activeGuideStep === index} key={step.title}>
              <span>0{index + 1}</span>
              <i aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
        <div className="company-site-guide-progress" aria-live="polite">
          <strong>0{activeGuideStep + 1} / 0{copy.guide.steps.length}</strong>
          <span>{copy.guide.swipeHint}<ArrowRight aria-hidden="true" /></span>
        </div>
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
        <div className="company-site-support-directory" aria-label={copy.aria.supportDirectory} data-mobile-rail="true">
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
          <button
            aria-controls="company-site-contact-panel"
            aria-expanded={isMobileContactOpen}
            className="company-site-mobile-contact-opener"
            onClick={() => setIsMobileContactOpen(true)}
            type="button"
          >
            {copy.actions.openContact}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div
          aria-label={isMobileContactOpen ? copy.aria.contactDialog : undefined}
          aria-modal={isMobileContactOpen ? true : undefined}
          className="company-site-contact-panel"
          data-mobile-open={isMobileContactOpen}
          id="company-site-contact-panel"
          role={isMobileContactOpen ? "dialog" : undefined}
        >
          <button
            aria-label={copy.aria.closeContact}
            className="company-site-contact-close"
            onClick={() => setIsMobileContactOpen(false)}
            type="button"
          >
            ×
          </button>
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
        </div>
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
