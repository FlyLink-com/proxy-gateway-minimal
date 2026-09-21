import {
  portalDisplayPreferenceHref,
  isPortalWebPath,
  type PortalDisplayPreference,
  type PortalEntryLocation,
} from "./portal-entry";

type PortalDisplayLinksProps = {
  locale: "zh" | "en";
  location?: PortalEntryLocation | null;
};

export function PortalDisplayLinks({ locale, location }: PortalDisplayLinksProps) {
  const resolvedLocation = location ?? (typeof window === "undefined" ? null : window.location);
  if (!isPortalWebPath(resolvedLocation?.pathname)) return null;

  const labels: Record<PortalDisplayPreference, string> = locale === "en"
    ? { mobile: "Mobile", auto: "Auto select" }
    : { mobile: "手机版", auto: "自动选择" };

  return (
    <nav className="portal-display-links" aria-label={locale === "en" ? "Display mode" : "显示模式"}>
      <a href={portalDisplayPreferenceHref("mobile", resolvedLocation)}>{labels.mobile}</a>
      <a href={portalDisplayPreferenceHref("auto", resolvedLocation)}>{labels.auto}</a>
    </nav>
  );
}
