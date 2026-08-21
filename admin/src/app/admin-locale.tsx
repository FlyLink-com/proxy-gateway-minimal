import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ADMIN_LANGUAGE_PACKS,
  ADMIN_SUPPORTED_LOCALES,
  getAdminLanguagePack,
  type AdminLocale,
  type AdminShellCopy
} from "../i18n/admin";

export type { AdminLocale, AdminShellCopy } from "../i18n/admin";

export const ADMIN_LOCALE_STORAGE_KEY = "gccwebos-admin-locale";
// eslint-disable-next-line react-refresh/only-export-components -- barrel re-export of locale shell copy; consumers import it directly via type-only path
export const ADMIN_SHELL_COPY = Object.fromEntries(
  ADMIN_LANGUAGE_PACKS.map((pack) => [pack.id, pack.shell])
) as Record<AdminLocale, AdminShellCopy>;

type AdminLocaleContextValue = {
  copy: AdminShellCopy;
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
};

const AdminLocaleContext = createContext<AdminLocaleContextValue | null>(null);

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(() => detectAdminLocale());

  const setLocale = useCallback((nextLocale: AdminLocale) => {
    setLocaleState(nextLocale);
    saveAdminLocale(nextLocale);
  }, []);

  const copy = getAdminLanguagePack(locale).shell;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = copy.htmlLang;
  }, [copy.htmlLang]);

  const value = useMemo(() => ({
    copy,
    locale,
    setLocale
  }), [copy, locale, setLocale]);

  return (
    <AdminLocaleContext.Provider value={value}>
      {children}
    </AdminLocaleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks share AdminLocaleContext defined in this file; extracting requires moving context out
export function useAdminLocale() {
  const value = useContext(AdminLocaleContext);
  if (!value) {
    throw new Error("useAdminLocale must be used inside AdminLocaleProvider");
  }
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components -- paired hook for useAdminLocale; same context-bound reason
export function useOptionalAdminLocale() {
  return useContext(AdminLocaleContext);
}

function detectAdminLocale(): AdminLocale {
  const storedLocale = parseAdminLocale(readStoredAdminLocale());
  if (storedLocale) {
    return storedLocale;
  }

  return parseAdminLocale(globalThis.navigator?.language) ?? "en";
}

function saveAdminLocale(locale: AdminLocale) {
  try {
    globalThis.localStorage?.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Browser storage can be unavailable in private or hardened contexts.
  }
}

function readStoredAdminLocale() {
  try {
    return globalThis.localStorage?.getItem(ADMIN_LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseAdminLocale(value: string | null | undefined): AdminLocale | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.toLowerCase();
  return ADMIN_SUPPORTED_LOCALES.find((locale) => (
    normalizedValue === locale || normalizedValue.startsWith(`${locale}-`)
  )) ?? null;
}
