import { UserCog } from "lucide-react";
import {
  PortalProfilePanel,
  type PortalProfileSummary
} from "./portal-profile-panel";
import {
  PortalSecurityPanel,
  type PortalSecurityPanelProps
} from "./portal-security-panel";

export type PortalPersonalCenterPanelProps = {
  locale: "zh" | "en";
  activeSubview: "profile" | "security";
  onSubviewChange: (view: "profile" | "security") => void;
  profile: PortalProfileSummary;
  security: Omit<PortalSecurityPanelProps, "locale">;
};

function text(locale: PortalPersonalCenterPanelProps["locale"], zh: string, en: string) {
  return locale === "en" ? en : zh;
}

export function PortalPersonalCenterPanel({
  locale,
  activeSubview,
  onSubviewChange,
  profile,
  security
}: PortalPersonalCenterPanelProps) {
  return (
    <section className="portal-use-card">
      <div className="portal-section-heading">
        <UserCog aria-hidden="true" />
        <div>
          <span className="portal-card-label">{text(locale, "个人中心", "Personal center")}</span>
          <h2>{text(locale, "账户管理", "Account management")}</h2>
          <p>{text(locale, "查看账户资料或管理安全选项。", "Review account details or manage security options.")}</p>
        </div>
      </div>

      <div
        aria-label={text(locale, "个人中心视图", "Personal center views")}
        className="portal-personal-center-tabs"
        role="tablist"
      >
        <button
          aria-controls="portal-personal-center-profile"
          aria-selected={activeSubview === "profile"}
          id="portal-personal-center-profile-tab"
          onClick={() => onSubviewChange("profile")}
          role="tab"
          tabIndex={activeSubview === "profile" ? 0 : -1}
          type="button"
        >
          {text(locale, "资料", "Profile")}
        </button>
        <button
          aria-controls="portal-personal-center-security"
          aria-selected={activeSubview === "security"}
          id="portal-personal-center-security-tab"
          onClick={() => onSubviewChange("security")}
          role="tab"
          tabIndex={activeSubview === "security" ? 0 : -1}
          type="button"
        >
          {text(locale, "安全", "Security")}
        </button>
      </div>

      {activeSubview === "profile" ? (
        <div
          aria-labelledby="portal-personal-center-profile-tab"
          id="portal-personal-center-profile"
          role="tabpanel"
        >
          <PortalProfilePanel locale={locale} summary={profile} />
        </div>
      ) : (
        <div
          aria-labelledby="portal-personal-center-security-tab"
          id="portal-personal-center-security"
          role="tabpanel"
        >
          <PortalSecurityPanel locale={locale} {...security} />
        </div>
      )}
    </section>
  );
}
