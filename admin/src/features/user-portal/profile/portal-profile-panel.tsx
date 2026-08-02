export type PortalProfileSummary = {
  authModeLabel: string;
  userRef: string;
  registeredAtLabel: string;
};

export type PortalProfilePanelProps = {
  locale: "zh" | "en";
  summary: PortalProfileSummary;
};

function text(locale: PortalProfilePanelProps["locale"], zh: string, en: string) {
  return locale === "en" ? en : zh;
}

export function PortalProfilePanel({ locale, summary }: PortalProfilePanelProps) {
  return (
    <div className="portal-profile-summary">
      <dl className="portal-profile-list">
        <div>
          <dt>{text(locale, "登录方式", "Sign-in method")}</dt>
          <dd>{summary.authModeLabel}</dd>
        </div>
        <div>
          <dt>{text(locale, "登录邮箱", "Sign-in email")}</dt>
          <dd>{summary.userRef}</dd>
        </div>
        <div>
          <dt>{text(locale, "注册日期", "Registered")}</dt>
          <dd>{summary.registeredAtLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
