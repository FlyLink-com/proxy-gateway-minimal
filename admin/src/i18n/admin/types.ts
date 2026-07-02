import { type AdminPage } from "../../app/navigation";

export type AdminLocale = "en" | "zh";

export type AdminPageSubNavigationCopy = Record<string, {
  description: string;
  label: string;
}>;

export type AdminShellCopy = {
  locale: AdminLocale;
  htmlLang: string;
  login: {
    auth: {
      accountIdLabel: string;
      accountPasswordLabel: string;
      adminIdLabel: string;
      adminPasswordLabel: string;
      adminSetupKeyLabel: string;
      approvedAdminIdPlaceholder: string;
      approvedPortalAccountIdPlaceholder: string;
      authenticatorCodeLabel: string;
      authenticatorEnrollmentFormLabel: string;
      authenticatorSetupButton: string;
      authenticatorSetupTitle: string;
      authenticatorVerificationTitle: string;
      checkingPasswordLabel: string;
      confirmAuthenticatorButton: string;
      confirmAuthenticatorFormLabel: string;
      firstAdminSetupButton: string;
      firstAdminSetupTitle: string;
      fallbackError: string;
      issuerLabel: string;
      loginButton: string;
      manualKeyLabel: string;
      operatorLabel: string;
      passwordFormLabel: string;
      portalAccountLoginTitle: string;
      protectedAdminLoginTitle: string;
      sixDigitCodeLabel: string;
      verifyAndOpenAdminButton: string;
      verifyAuthenticatorFormLabel: string;
    };
    brandSubtitle: string;
    panelAriaLabel: string;
    previewSite: string;
    title: string;
  };
  pageFrame: {
    emptyWorkbenchDescription: string;
    emptyWorkbenchTitle: string;
    evidenceSurfacesSuffix: string;
    modeLabels: Record<"owner" | "preview", string>;
    moduleLayoutSuffix: string;
    pageDescriptions: Partial<Record<AdminPage, string>>;
    pageHeaderAriaLabels: Partial<Record<AdminPage, string>>;
    sections: Partial<Record<AdminPage, AdminPageSubNavigationCopy>>;
    sectionsSuffix: string;
    summaryMetricsSuffix: string;
  };
  sidebar: {
    brandSubtitle: string;
    groups: Record<string, string>;
    plannedGateAriaSuffix: string;
    plannedGateLabel: string;
    plannedRoutesAriaLabel: string;
    primaryRoutesAriaLabel: string;
    routeSuffix: string;
    routes: Record<AdminPage, string>;
    safetyDescription: string;
    safetyDetail: string;
    safetyTitle: string;
    workspaceAriaLabel: string;
    workspaceNavigationAriaLabel: string;
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
    production: string;
    riskGateLabel: string;
    riskGateTitle: string;
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
