import { type AdminPage } from "../../app/navigation";

export type AdminLocale = "en" | "zh";

export type AdminShellCopy = {
  locale: AdminLocale;
  htmlLang: string;
  sidebar: {
    brandSubtitle: string;
    groups: Record<string, string>;
    plannedGateAriaSuffix: string;
    plannedGateLabel: string;
    routeSuffix: string;
    routes: Record<AdminPage, string>;
    safetyDescription: string;
    safetyDetail: string;
    safetyTitle: string;
    workspaceAriaLabel: string;
  };
  topBar: {
    accountAriaLabel: string;
    accountControlsLabel: string;
    accountName: string;
    accountPopoverDescription: string;
    accountPopoverGate: string;
    accountRole: string;
    contexts: Record<AdminPage, string>;
    languageLabel: string;
    languageOptions: Record<AdminLocale, { ariaLabel: string; label: string }>;
    pageStatus: Record<AdminPage, string>;
    pageTitles: Record<AdminPage, string>;
    riskGateLabel: string;
    searchAriaLabel: string;
    searchLabel: string;
    searchPlaceholders: Record<AdminPage, string>;
  };
};

export type AdminLanguagePack = {
  id: AdminLocale;
  label: string;
  nativeName: string;
  shell: AdminShellCopy;
  tag: string;
};
