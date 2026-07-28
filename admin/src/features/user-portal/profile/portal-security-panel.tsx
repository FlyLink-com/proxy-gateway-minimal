import { ShieldCheck } from "lucide-react";

export type PortalSecurityPanelProps = {
  locale: "zh" | "en";
  authenticatorBound: boolean;
  authenticatorPending: boolean;
  passkeyExported: boolean;
  passkeyPending: boolean;
  passkeyError: string;
  onStartAuthenticatorEnrollment: () => Promise<void>;
  onExportPasskey: () => Promise<void>;
};

function text(locale: PortalSecurityPanelProps["locale"], zh: string, en: string) {
  return locale === "en" ? en : zh;
}

export function PortalSecurityPanel({
  locale,
  authenticatorBound,
  authenticatorPending,
  passkeyExported,
  passkeyPending,
  passkeyError,
  onStartAuthenticatorEnrollment,
  onExportPasskey
}: PortalSecurityPanelProps) {
  return (
    <div className="portal-security-panel">
      <div className="portal-section-heading compact">
        <ShieldCheck aria-hidden="true" />
        <div>
          <span className="portal-card-label">{text(locale, "安全", "Security")}</span>
          <h3>{text(locale, "安全设置", "Security settings")}</h3>
          <p>
            {text(
              locale,
              "身份验证器需要扫码并输入 6 位码后才会显示已绑定；通行密钥导出后请妥善保存。",
              "Authenticator is marked bound only after scanning and entering a 6-digit code. Store the exported passkey backup safely."
            )}
          </p>
        </div>
      </div>

      <div className="portal-security-list">
        <div className="portal-security-row">
          <div>
            <strong>{text(locale, "身份验证器", "Authenticator")}</strong>
            <small>
              {text(
                locale,
                "绑定身份验证器应用后，后续可作为增强登录因子。",
                "After binding an authenticator app, it can be used as an enhanced sign-in factor."
              )}
            </small>
          </div>
          <span className={`portal-security-status${authenticatorBound ? " enabled" : ""}`}>
            {authenticatorBound ? text(locale, "已绑定", "Bound") : text(locale, "未绑定", "Not bound")}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={authenticatorPending || authenticatorBound}
            onClick={onStartAuthenticatorEnrollment}
          >
            {authenticatorBound
              ? text(locale, "身份验证器已绑定", "Authenticator bound")
              : text(locale, "绑定身份验证器", "Bind authenticator")}
          </button>
        </div>

        <div className="portal-security-row">
          <div>
            <strong>{text(locale, "通行密钥", "Passkey")}</strong>
            <small>
              {text(
                locale,
                "导出通行密钥备份包；后续密码登录会要求二次验证。",
                "Export the passkey backup package. Future password sign-ins will require second-factor verification."
              )}
            </small>
          </div>
          <span className={`portal-security-status${passkeyExported ? " enabled" : ""}`}>
            {passkeyExported ? text(locale, "已导出", "Exported") : text(locale, "未导出", "Not exported")}
          </span>
          <button
            className="portal-security-action"
            type="button"
            disabled={passkeyPending}
            onClick={onExportPasskey}
          >
            {passkeyPending
              ? text(locale, "导出中", "Exporting")
              : passkeyExported
                ? text(locale, "重新导出通行密钥", "Export passkey again")
                : text(locale, "导出通行密钥", "Export passkey")}
          </button>
        </div>
      </div>
      {passkeyError ? <div className="alert alert-error">{passkeyError}</div> : null}
    </div>
  );
}
