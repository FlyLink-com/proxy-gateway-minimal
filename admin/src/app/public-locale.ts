export type PublicLocale = "en" | "zh";

export const PUBLIC_LOCALE_STORAGE_KEY = "gccwebos-site-locale";

export const PUBLIC_LOCALE_LABELS: Record<PublicLocale, { lang: string; name: string; short: string }> = {
  en: { lang: "en", name: "English", short: "EN" },
  zh: { lang: "zh-CN", name: "中文", short: "中" }
};

export function isPublicLocale(value: string | null | undefined): value is PublicLocale {
  return value === "en" || value === "zh";
}

export function detectPublicLocale(options: {
  defaultLocale?: PublicLocale;
  useBrowserLanguage?: boolean;
} = {}): PublicLocale {
  const defaultLocale = options.defaultLocale ?? "en";
  if (typeof window === "undefined") {
    return defaultLocale;
  }
  try {
    const storedLocale = window.localStorage.getItem(PUBLIC_LOCALE_STORAGE_KEY);
    if (isPublicLocale(storedLocale)) {
      return storedLocale;
    }
  } catch (error) {
    // Storage can be unavailable in strict privacy contexts.
  }
  if (!options.useBrowserLanguage) {
    return defaultLocale;
  }
  const languageCandidates = [
    ...(window.navigator.languages ?? []),
    window.navigator.language
  ].filter(Boolean);
  return languageCandidates.some((language) => String(language).toLowerCase().startsWith("zh"))
    ? "zh"
    : "en";
}

export function savePublicLocale(locale: PublicLocale) {
  try {
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, locale);
  } catch (error) {
    // The active session still updates even when persistence is blocked.
  }
}

export function applyPublicLocale(locale: PublicLocale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = PUBLIC_LOCALE_LABELS[locale].lang;
  }
}
