import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, type LucideIcon } from "lucide-react";
import {
  applyPublicLocale,
  detectPublicLocale,
  PUBLIC_LOCALE_LABELS,
  savePublicLocale,
  type PublicLocale
} from "../../app/public-locale";

const publicLocaleOptions: PublicLocale[] = ["zh", "en"];
const publicThemeOptions: PublicTheme[] = ["light", "dark"];
const PUBLIC_THEME_STORAGE_KEY = "gccwebos-portal-theme";

export type PublicTheme = "light" | "dark";

const PUBLIC_THEME_LABELS = {
  zh: {
    aria: "显示主题",
    light: "日间主题",
    dark: "夜间主题",
    lightShort: "日",
    darkShort: "夜"
  },
  en: {
    aria: "Display theme",
    light: "Light theme",
    dark: "Dark theme",
    lightShort: "Day",
    darkShort: "Night"
  }
} as const;

function isPublicTheme(value: string | null): value is PublicTheme {
  return value === "light" || value === "dark";
}

function detectPublicTheme(defaultTheme: PublicTheme = "light"): PublicTheme {
  try {
    if (typeof window === "undefined") return defaultTheme;
    const storedTheme = window.localStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
    return isPublicTheme(storedTheme) ? storedTheme : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function savePublicTheme(theme: PublicTheme) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, theme);
  } catch {
    // The active session still updates even when persistence is blocked.
  }
}

export function usePublicLocalePreference(defaultLocale: PublicLocale = "zh") {
  const [locale, setLocale] = useState<PublicLocale>(() => (
    detectPublicLocale({ defaultLocale, useBrowserLanguage: false })
  ));

  useEffect(() => {
    applyPublicLocale(locale);
  }, [locale]);

  const changeLocale = useCallback((nextLocale: PublicLocale) => {
    setLocale(nextLocale);
    savePublicLocale(nextLocale);
  }, []);

  return { locale, setLocale: changeLocale };
}

export function usePublicThemePreference(defaultTheme: PublicTheme = "light") {
  const [theme, setTheme] = useState<PublicTheme>(() => detectPublicTheme(defaultTheme));

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.portalTheme = theme;
  }, [theme]);

  const changeTheme = useCallback((nextTheme: PublicTheme) => {
    setTheme(nextTheme);
    savePublicTheme(nextTheme);
  }, []);

  return { theme, setTheme: changeTheme };
}

export function PublicLocaleSwitch({
  ariaLabel,
  locale,
  onLocaleChange
}: {
  ariaLabel: string;
  locale: PublicLocale;
  onLocaleChange: (locale: PublicLocale) => void;
}) {
  return (
    <div className="portal-locale-switch" role="group" aria-label={ariaLabel}>
      {publicLocaleOptions.map((option) => (
        <button
          type="button"
          key={option}
          aria-pressed={locale === option}
          aria-label={PUBLIC_LOCALE_LABELS[option].name}
          title={PUBLIC_LOCALE_LABELS[option].name}
          onClick={() => onLocaleChange(option)}
        >
          {PUBLIC_LOCALE_LABELS[option].short}
        </button>
      ))}
    </div>
  );
}

function themeLabel(locale: PublicLocale, theme: PublicTheme) {
  const labels = PUBLIC_THEME_LABELS[locale];
  return theme === "light" ? labels.light : labels.dark;
}

function themeShortLabel(locale: PublicLocale, theme: PublicTheme) {
  const labels = PUBLIC_THEME_LABELS[locale];
  return theme === "light" ? labels.lightShort : labels.darkShort;
}

function themeIcon(theme: PublicTheme): LucideIcon {
  return theme === "light" ? Sun : Moon;
}

export function PublicThemeSwitch({
  ariaLabel,
  locale,
  theme,
  onThemeChange
}: {
  ariaLabel?: string;
  locale: PublicLocale;
  theme: PublicTheme;
  onThemeChange: (theme: PublicTheme) => void;
}) {
  return (
    <div className="portal-theme-switch" role="group" aria-label={ariaLabel ?? PUBLIC_THEME_LABELS[locale].aria}>
      {publicThemeOptions.map((option) => {
        const Icon = themeIcon(option);
        return (
          <button
            type="button"
            key={option}
            aria-pressed={theme === option}
            aria-label={themeLabel(locale, option)}
            title={themeLabel(locale, option)}
            onClick={() => onThemeChange(option)}
          >
            <Icon aria-hidden="true" />
            <span>{themeShortLabel(locale, option)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PublicPreferenceSwitch({
  ariaLabel,
  localeAriaLabel,
  themeAriaLabel,
  locale,
  theme,
  onLocaleChange,
  onThemeChange,
  className
}: {
  ariaLabel: string;
  localeAriaLabel: string;
  themeAriaLabel?: string;
  locale: PublicLocale;
  theme: PublicTheme;
  onLocaleChange: (locale: PublicLocale) => void;
  onThemeChange: (theme: PublicTheme) => void;
  className?: string;
}) {
  return (
    <div className={["portal-preference-switch", className].filter(Boolean).join(" ")} role="group" aria-label={ariaLabel}>
      <PublicLocaleSwitch ariaLabel={localeAriaLabel} locale={locale} onLocaleChange={onLocaleChange} />
      <PublicThemeSwitch ariaLabel={themeAriaLabel} locale={locale} theme={theme} onThemeChange={onThemeChange} />
    </div>
  );
}
