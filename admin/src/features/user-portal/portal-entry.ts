export type PortalDisplayPreference = "mobile" | "auto";

export type PortalEntryLocation = {
  pathname?: string;
  search?: string;
  hash?: string;
};

function currentLocation(): PortalEntryLocation | null {
  return typeof window === "undefined" ? null : window.location;
}

function normalizedPathname(pathname: string | undefined) {
  const normalized = String(pathname || "/").replace(/\/+$/u, "");
  return normalized || "/";
}

export function isPortalWebPath(pathname = currentLocation()?.pathname) {
  const normalized = normalizedPathname(pathname);
  return normalized === "/web" || normalized.startsWith("/web/");
}

export function isPortalRegistrationPath(pathname = currentLocation()?.pathname) {
  const normalized = normalizedPathname(pathname);
  return normalized === "/portal/register" || normalized === "/web/register";
}

export function portalRoutePath(
  route: "login" | "register",
  location: PortalEntryLocation | null = currentLocation(),
) {
  const prefix = isPortalWebPath(location?.pathname) ? "/web" : "/portal";
  return route === "register" ? `${prefix}/register/` : `${prefix}/`;
}

/**
 * Builds the desktop switch links. The target deliberately uses the mobile
 * root entry; the mobile entry consumes only `display` and preserves the rest
 * of the URL state.
 */
export function portalDisplayPreferenceHref(
  preference: PortalDisplayPreference,
  location: PortalEntryLocation | null = currentLocation(),
) {
  const params = new URLSearchParams(location?.search || "");
  params.delete("display");
  params.set("display", preference);
  const query = params.toString();
  const targetPath = isPortalRegistrationPath(location?.pathname)
    ? "/portal/register"
    : "/";
  return `${targetPath}${query ? `?${query}` : ""}${location?.hash || ""}`;
}

export function portalAssetPath(
  assetPath: string,
  location: PortalEntryLocation | null = currentLocation(),
) {
  const normalizedAssetPath = String(assetPath || "").replace(/^\/+/, "");
  return `${isPortalWebPath(location?.pathname) ? "/web" : ""}/${normalizedAssetPath}`;
}
