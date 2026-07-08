import { adminEnUSLanguagePack } from "./en-US";
import { type AdminLanguagePack, type AdminLocale } from "./types";
import { adminZhCNLanguagePack } from "./zh-CN";

export type { AdminLanguagePack, AdminLocale, AdminShellCopy } from "./types";

export const ADMIN_LANGUAGE_PACKS = [
  adminEnUSLanguagePack,
  adminZhCNLanguagePack
] as const satisfies readonly AdminLanguagePack[];

export const ADMIN_SUPPORTED_LOCALES = ADMIN_LANGUAGE_PACKS.map((pack) => pack.id);

const ADMIN_LANGUAGE_PACK_BY_LOCALE = Object.fromEntries(
  ADMIN_LANGUAGE_PACKS.map((pack) => [pack.id, pack])
) as Record<AdminLocale, AdminLanguagePack>;

export function getAdminLanguagePack(locale: AdminLocale) {
  return ADMIN_LANGUAGE_PACK_BY_LOCALE[locale] ?? adminEnUSLanguagePack;
}

export function isAdminLocale(value: string | null | undefined): value is AdminLocale {
  return ADMIN_SUPPORTED_LOCALES.some((locale) => locale === value);
}
