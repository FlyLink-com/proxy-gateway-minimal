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
      title: "GCC WebOS - Connect to the world. Start simply."
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
      productStory: "GCC WebOS product details",
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
      eyebrow: "DIGITAL SERVICES",
      title: "Connect to the world. Start simply.",
      description:
        "From first discovery to choosing the right service and continuing day to day, GCC WebOS turns complex service journeys into one clear, coherent digital experience.",
      support: "Explore",
      portal: "Get Started",
      partnership: "Sign In"
    },
    brandVisual: {
      title: "More networks. More perspectives.",
      description: "Digital services, easier to understand and easier to begin.",
      lanes: ["Discover", "Explore", "Connect", "Continue"],
      scenes: [
        {
          eyebrow: "Discover",
          title: "See beyond one point of view",
          description: "Reach more sources, compare perspectives and find a new way to understand what matters."
        },
        {
          eyebrow: "Connect",
          title: "Keep work moving across distance",
          description: "Continue familiar conversations and responsibilities as places and network environments change."
        },
        {
          eyebrow: "Continue",
          title: "A new environment, without starting over",
          description: "Find a connection that fits the moment and keep your digital life moving in its familiar rhythm."
        }
      ]
    },
    product: {
      title: "Connect to more networks. See a wider world.",
      description:
        "GCC WebOS provides diverse network services that help people find the right way to connect across different environments and everyday scenarios—opening access to more information, services and perspectives.",
      items: [
        {
          icon: "product",
          title: "Learn beyond one source",
          description: "Open new perspectives for learning, research and everyday discovery."
        },
        {
          icon: "guide",
          title: "Work beyond distance",
          description: "Find the right way to connect across regions and everyday collaboration."
        },
        {
          icon: "help",
          title: "Adapt as environments change",
          description: "Choose a connection that fits travel, movement and changing networks."
        }
      ]
    },
    plans: {
      title: "Find the connection that fits the moment",
      description:
        "VPN is one part of the GCC WebOS network experience. Its value is not defined by technical complexity, but by the possibilities it creates for learning, working, communicating and exploring.",
      items: [
        {
          title: "Explore more perspectives",
          description: "For learning, research and everyday discovery beyond a single point of view.",
          points: ["More sources to learn from", "New perspectives to consider", "A clear path to begin"]
        },
        {
          title: "Keep work moving",
          description: "For cross-region work, communication and changing network environments.",
          points: ["Connect across locations", "Continue familiar workflows", "Find support when needed"]
        }
      ],
      note: "Choose the scenario that matters now. Your account gives you one place to continue."
    },
    guide: {
      title: "The world is wide. Connecting should not feel complicated.",
      description:
        "Throughout the day, we move between different sources of information, places and responsibilities—sometimes searching for an answer, sometimes continuing our work, and sometimes looking beyond the perspectives we already know.",
      steps: [
        {
          title: "One question, more than one answer",
          description:
            "In the morning, you begin with a question. Looking beyond a single source can reveal not only more information, but a new way to understand the problem."
        },
        {
          title: "Keep working beyond distance",
          description:
            "By afternoon, work may cross cities and regions. Different network environments should not end the conversation; the right connection helps familiar collaboration continue."
        },
        {
          title: "A new environment, without starting over",
          description:
            "When you arrive somewhere new, the network around you changes. GCC WebOS helps you find a connection for the moment, so the environment changes—not your whole digital life."
        }
      ]
    },
    support: {
      title: "Go further. Know where to turn.",
      description: "When you need to understand a service, confirm a rule or continue a conversation, GCC WebOS keeps the answers and entry points easy to find.",
      statement: "Ready to continue?",
      portalStatement: "Return to your account center and pick up where you left off.",
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
      title: "Your next step, your way.",
      description:
        "Some people arrive with a question, some are ready to begin, and some want to explore new possibilities with GCC WebOS. Wherever you start, the next step should be clear.",
      steps: ["Discover more possibilities", "Choose the right service", "Create a GCC WebOS account", "Continue with support"]
    },
    intake: {
      title: "Explore what comes next with GCC WebOS",
      description:
        "If you are exploring a product, technology or business collaboration, tell us what you hope to achieve and let us discover the next possibility together.",
      points: [
        "Share the product or service outcome you have in mind",
        "Describe the team, market or scenario you are exploring",
        "Turn a new idea into a clear conversation"
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
      options: ["Explore more perspectives", "Keep work moving", "Support", "Partnership"],
      note: "If you are ready to use a service, create an account or sign in to continue from your account center.",
      success: "Request submitted. We will use these details to continue the conversation.",
      error: "Submission failed. Please try again or use the contact information in the support section."
    },
    faq: {
      title: "Know before you begin",
      description: "A few clear answers about GCC WebOS, its services and the ways to continue.",
      items: [
        {
          question: "What is GCC WebOS?",
          answer: "GCC WebOS is a digital services brand for individuals, teams and partners. Through diverse network services, it helps people move through a clearer, more coherent digital experience."
        },
        {
          question: "Does GCC WebOS provide VPN services?",
          answer: "VPN is one part of the GCC WebOS network experience, supporting learning and discovery, cross-region work and communication, and moments when network environments change."
        },
        {
          question: "How do I get started?",
          answer: "Create a GCC WebOS account, then enter the account center to explore and use the services currently available."
        },
        {
          question: "I already have an account. How do I continue?",
          answer: "Sign in to the account center to continue using and managing your existing services."
        },
        {
          question: "Where can I find guides and service information?",
          answer: "The support center brings together usage guides, service information, public status, rules and privacy."
        },
        {
          question: "How can I contact GCC WebOS?",
          answer: "Use the website contact entry to share a product question, team need or partnership idea."
        }
      ]
    },
    footer: {
      description: "Connecting more perspectives—and every new beginning.",
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
      title: "GCC WebOS - 连接世界，从简单开始"
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
      productStory: "GCC WebOS 产品详情",
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
      eyebrow: "数字服务",
      title: "连接世界，从简单开始。",
      description: "从第一次了解，到选择适合的服务，再到持续使用，GCC WebOS 将复杂流程组织成清晰、连贯的数字体验。",
      support: "探索",
      portal: "开始使用",
      partnership: "登录"
    },
    brandVisual: {
      title: "连接更多网络，看见更多视角",
      description: "让数字服务更容易理解，更容易开始。",
      lanes: ["发现", "探索", "连接", "继续"],
      scenes: [
        {
          eyebrow: "发现",
          title: "看见熟悉视角之外的世界",
          description: "接触更多信息来源，比较不同观点，用新的角度理解真正重要的问题。"
        },
        {
          eyebrow: "连接",
          title: "距离之外，继续同行",
          description: "当地点与网络环境发生变化，熟悉的沟通与工作节奏依然可以继续。"
        },
        {
          eyebrow: "继续",
          title: "换一个地方，不必重新开始",
          description: "找到适合当下的连接方式，让变化发生在环境，而不是你的整个数字生活。"
        }
      ]
    },
    product: {
      title: "连接更多网络，看见更大的世界",
      description: "GCC WebOS 提供多元网络服务，帮助用户在不同环境与使用场景中找到适合自己的连接方式，接触更丰富的信息、服务与观点。",
      items: [
        { icon: "product", title: "不止一种答案", description: "接触不同地区的信息与观点，为学习、研究和日常探索打开更多视角。" },
        { icon: "guide", title: "距离之外，继续同行", description: "面对跨区域工作、业务交流与日常协作，以更合适的方式连接需要使用的数字服务。" },
        { icon: "help", title: "环境改变，节奏继续", description: "当所在地区或网络环境发生变化时，选择适合当前场景的连接方式。" }
      ]
    },
    plans: {
      title: "找到适合当下的连接方式",
      description: "VPN 是 GCC WebOS 网络服务的一部分。它的价值不在于复杂参数，而在于帮助用户跨越环境差异，更从容地学习、工作、沟通与探索。",
      items: [
        {
          title: "看见更多视角",
          description: "适合希望在学习、研究与日常探索中，不局限于单一视角的人。",
          points: ["接触更多信息来源", "理解不同观点", "从清晰路径开始"]
        },
        {
          title: "让工作继续向前",
          description: "适合跨区域工作、日常沟通以及网络环境发生变化的场景。",
          points: ["连接不同地点", "延续熟悉工作节奏", "需要时获得支持"]
        }
      ],
      note: "从当下最重要的场景开始，并在账户中心继续你的 GCC WebOS 体验。"
    },
    guide: {
      title: "世界很大，连接不必复杂",
      description: "一天之中，我们会在不同的信息、地点与任务之间来回切换。有时为了寻找答案，有时为了继续工作，也有时，只是想看看熟悉视角之外的世界。",
      steps: [
        {
          title: "一个问题，不止一种答案",
          description: "清晨，你正在寻找一份资料。当信息不再局限于单一来源，看到的不只是更多内容，也可能是理解问题的新角度。"
        },
        {
          title: "距离之外，继续同行",
          description: "下午，工作跨越了城市与地区。不同的网络环境不应该成为沟通的终点；合适的连接方式，让协作可以按照原来的节奏继续。"
        },
        {
          title: "换一个地方，不必重新开始",
          description: "当你出发去往新的地方，熟悉的网络环境也随之改变。GCC WebOS 帮助你寻找适合当前场景的连接方式，让变化发生在环境，而不是你的整个数字生活。"
        }
      ]
    },
    support: {
      title: "走得更远，也随时找得到方向",
      description: "当你需要了解服务、确认规则或继续一段对话，GCC WebOS 把答案与入口留在容易找到的地方。",
      statement: "准备继续？",
      portalStatement: "回到账户中心，接续你的 GCC WebOS 体验。",
      resources: [
        { icon: "guide", title: "使用指南", description: "从产生兴趣到采取行动，获得实用指引。", action: "阅读指南", slug: "download" },
        { icon: "help", title: "支持中心", description: "找到答案，也找到继续沟通的清晰入口。", action: "获取帮助", slug: "help" },
        { icon: "status", title: "服务状态", description: "在熟悉的位置，查看 GCC WebOS 最新公开通知。", action: "查看状态", slug: "status" },
        { icon: "rules", title: "规则与隐私", description: "了解支持负责任体验的公开原则。", action: "查看规则", slug: "privacy" }
      ]
    },
    conversion: {
      title: "下一步，由你决定",
      description: "有人带着一个问题来到这里，有人已经准备好开始，也有人希望与 GCC WebOS 一起探索新的可能。无论从哪里抵达，都应该找到清晰的下一步。",
      steps: ["发现更多可能", "选择适合的服务", "创建 GCC WebOS 账户", "继续使用并获得支持"]
    },
    intake: {
      title: "与 GCC WebOS 一起探索新的可能",
      description: "如果你正在寻找产品、技术或商业合作，我们期待了解你的目标，一起探索下一种可能。",
      points: ["分享你期待实现的产品或服务目标", "说明正在探索的团队、市场或使用场景", "让一个新想法成为清晰的对话"],
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
      options: ["看见更多视角", "让工作继续向前", "支持", "合作"],
      note: "如果已经准备好使用服务，可以创建账户或登录账户中心继续。",
      success: "请求已提交。我们会使用这些信息继续沟通。",
      error: "提交失败。请重试，或使用支持页面中的联系方式。"
    },
    faq: {
      title: "开始之前，先了解更多",
      description: "先了解 GCC WebOS、服务与开始方式，再选择适合自己的下一步。",
      items: [
        { question: "GCC WebOS 是什么？", answer: "GCC WebOS 是一个面向个人、团队与合作伙伴的数字服务品牌，通过多元网络服务，帮助用户获得更清晰、更连贯的数字体验。" },
        { question: "GCC WebOS 是否提供 VPN 服务？", answer: "VPN 是 GCC WebOS 网络服务的一部分，适用于学习探索、跨区域工作沟通以及网络环境发生变化时的连接需求。" },
        { question: "如何开始使用？", answer: "创建 GCC WebOS 账户后，可以进入账户中心了解并使用当前提供的服务。" },
        { question: "已经拥有账户，如何继续？", answer: "直接登录账户中心，即可继续使用和管理已有服务。" },
        { question: "在哪里查看使用指南与服务信息？", answer: "官网支持中心提供使用指南、服务说明、公开状态以及规则与隐私入口。" },
        { question: "如何联系 GCC WebOS？", answer: "如果你有产品问题、团队需求或合作想法，可以通过官网联系入口提交信息。" }
      ]
    },
    footer: {
      description: "连接更多视角，也连接每一种开始。",
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

      <div className="company-site-mobile-viewport" data-mobile-viewport="true">
      <section className="company-site-hero" data-mobile-concept-stage="true" id="top">
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
          <div className="company-site-concept-loop">
            {(["primary", "duplicate"] as const).map((track) => (
              <div
                aria-hidden={track === "duplicate" ? true : undefined}
                className="company-site-concept-track"
                data-concept-loop={track}
                key={track}
              >
                {copy.brandVisual.scenes.map((scene, index) => (
                  <article className="company-site-concept-scene" key={`${track}-${scene.title}`}>
                    <span>0{index + 1} · {scene.eyebrow}</span>
                    <div className="company-site-concept-graphic" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <b>G</b>
                    </div>
                    <h2>{scene.title}</h2>
                    <p>{scene.description}</p>
                  </article>
                ))}
              </div>
            ))}
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
            <div className="company-site-start-panel">
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
            </div>
          </section>
        </div>
      ) : null}

      <div
        aria-label={copy.aria.productStory}
        className="company-site-detail-scroller"
        data-mobile-detail-scroller="true"
        role="region"
        tabIndex={0}
      >
      <section className="company-site-product-layer" id="features">
        <div className="company-site-section-intro">
          <span>01</span>
          <div>
            <h2>{copy.product.title}</h2>
            <p>{copy.product.description}</p>
          </div>
        </div>
        <div className="company-site-product-list" data-mobile-layout="vertical">
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
        <div className="company-site-product-rail" aria-label={copy.aria.productChoices} data-mobile-layout="vertical">
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
          data-mobile-layout="vertical"
        >
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
        <div className="company-site-support-directory" aria-label={copy.aria.supportDirectory} data-mobile-layout="vertical">
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
      </div>
      </div>
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
