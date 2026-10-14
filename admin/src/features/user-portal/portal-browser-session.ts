import type { PortalSession } from "./user-portal-types";

export const PORTAL_BROWSER_CONTEXT = /^portalctx_[0-9a-f]{64}$/u;
const CHANNEL = "gccwebos-portal-session-changed-v1";
const LOGOUT_PENDING = "gccwebos-portal-logout-pending-v1";

export function readPendingPortalLogout(): string | null {
  try { const value = window.sessionStorage.getItem(LOGOUT_PENDING); return value && PORTAL_BROWSER_CONTEXT.test(value) ? value : null; } catch { return null; }
}
export function stagePendingPortalLogout(context: string) {
  if (!PORTAL_BROWSER_CONTEXT.test(context)) throw new Error("Portal session context is invalid.");
  try { window.sessionStorage.setItem(LOGOUT_PENDING, context); } catch { /* server revocation still required */ }
}
export function clearPendingPortalLogout() {
  try { window.sessionStorage.removeItem(LOGOUT_PENDING); } catch { /* optional storage */ }
}

// This public context is not a credential. The server must match it against
// the HttpOnly cookie for every authenticated operation, including logout.
export function createPortalBrowserFetch(rawFetch: typeof fetch): typeof fetch {
  return async (input, init = {}) => {
    if (typeof input !== "string" && !(input instanceof URL)) {
      throw new Error("Portal request target is invalid.");
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(String(input), origin);
    if (url.origin !== origin || !url.pathname.startsWith("/api/portal/") || url.username || url.password || url.hash) {
      throw new Error("Portal request target is invalid.");
    }
    const headers = new Headers(init.headers);
    const reference = headers.get("X-Portal-Session");
    const explicitContext = headers.get("X-Portal-Session-Context");
    const cookie = reference === null || PORTAL_BROWSER_CONTEXT.test(reference);
    if (explicitContext && (!PORTAL_BROWSER_CONTEXT.test(explicitContext) || (reference && reference !== explicitContext))) {
      throw new Error("Portal session context is invalid.");
    }
    if (cookie) {
      headers.delete("X-Portal-Session");
      if (reference) headers.set("X-Portal-Session-Context", reference);
      headers.set("X-Portal-Request", "browser-v1");
    } else {
      headers.delete("X-Portal-Request");
    }
    return rawFetch(input, { ...init, headers, credentials: cookie ? "same-origin" : "omit", cache: "no-store", redirect: "error" });
  };
}

export function readCookieSession(raw: unknown): PortalSession {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Portal session is invalid.");
  const session = raw as Record<string, unknown>;
  const fields = new Set(["sessionRef", "transport", "expiresAt", "issuedAt", "userRef", "loginRef", "displayName", "authMethod", "status"]);
  if (Object.keys(session).some((key) => !fields.has(key)) || (session.status !== undefined && session.status !== "active")
    || !["password", "totp", "passkey"].includes(String(session.authMethod))) throw new Error("Portal session is invalid.");
  if (session.transport !== "cookie" || typeof session.sessionRef !== "string" || !PORTAL_BROWSER_CONTEXT.test(session.sessionRef)
    || typeof session.expiresAt !== "string" || !Number.isFinite(Date.parse(session.expiresAt))
    || typeof session.issuedAt !== "string" || !Number.isFinite(Date.parse(session.issuedAt))
    || typeof (session.userRef ?? session.loginRef) !== "string") throw new Error("Portal session is invalid.");
  const userRef = String(session.userRef ?? session.loginRef);
  if (!userRef.trim()) throw new Error("Portal session is invalid.");
  return {
    status: "authenticated_preview", sessionRef: session.sessionRef, transport: "cookie", expiresAt: session.expiresAt,
    userRef, displayName: typeof session.displayName === "string" ? session.displayName : userRef,
    authMode: session.authMethod === "totp" ? "authenticator" : session.authMethod === "passkey" ? "passkey" : "password",
    registeredAt: session.issuedAt,
    safety: { noAdminApi: true, noPublicAuthActivated: true, noRawPasswordReturned: true },
  };
}

// A lock is a coordination aid on supporting browsers, not the server's
// authorization boundary. The public context remains mandatory either way.
export async function withPortalAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Portal auth lock timed out.")), 30_000);
    try {
      return await navigator.locks.request("gccwebos-portal-auth-write-v1", { signal: controller.signal }, async () => {
        clearTimeout(timer);
        return operation();
      });
    } finally { clearTimeout(timer); }
  }
  return operation();
}

type SessionChannel = { channel: BroadcastChannel; listeners: Set<() => void> };
let pageSessionChannel: SessionChannel | null = null;

function getPageSessionChannel(): SessionChannel | null {
  if (typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") return null;
  if (pageSessionChannel) return pageSessionChannel;
  try {
    const channel = new window.BroadcastChannel(CHANNEL);
    const shared = { channel, listeners: new Set<() => void>() };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && Object.keys(event.data).length === 1
        && (event.data as { type?: unknown }).type === "session-changed") {
        for (const invalidate of shared.listeners) invalidate();
      }
    };
    pageSessionChannel = shared;
    return shared;
  } catch { return null; }
}

function closeUnusedPageSessionChannel(shared: SessionChannel) {
  if (shared.listeners.size) return;
  shared.channel.close();
  if (pageSessionChannel === shared) pageSessionChannel = null;
}

export function broadcastPortalSessionChange() {
  const shared = getPageSessionChannel();
  if (!shared) return;
  // BroadcastChannel excludes only the sending object, not the whole tab.
  // Reuse this page's subscriber object so login cannot invalidate itself.
  try { shared.channel.postMessage({ type: "session-changed" }); } catch { /* optional coordination */ }
  finally { closeUnusedPageSessionChannel(shared); }
}

export function subscribePortalSessionChange(invalidate: () => void) {
  const shared = getPageSessionChannel();
  if (!shared) return () => {};
  const listener = () => invalidate();
  shared.listeners.add(listener);
  return () => {
    shared.listeners.delete(listener);
    closeUnusedPageSessionChannel(shared);
  };
}

const VIEWS = ["start", "dashboard", "usage", "marketplace", "orders", "wallet", "referrals", "profile", "coupons", "settings", "support"] as const;
const ORDER_FILTERS = ["all", "coins_consumption", "coin_recharge", "plans_services"] as const;
export type PortalLocation = { view: typeof VIEWS[number]; orderFilter: typeof ORDER_FILTERS[number]; profileSubview: "profile" | "security" };
const DEFAULT_LOCATION: PortalLocation = { view: "start", orderFilter: "all", profileSubview: "profile" };
export function readPortalLocation(): PortalLocation {
  if (typeof window === "undefined") return { ...DEFAULT_LOCATION };
  const query = new URLSearchParams(window.location.hash.slice(1));
  if ([...query.keys()].some((key) => !["portal", "orders", "profile"].includes(key))) return { ...DEFAULT_LOCATION };
  const view = query.get("portal");
  const filter = query.get("orders") ?? "all";
  const profile = query.get("profile") ?? "profile";
  if (!VIEWS.includes(view as PortalLocation["view"]) || !ORDER_FILTERS.includes(filter as PortalLocation["orderFilter"])
    || !["profile", "security"].includes(profile)) return { ...DEFAULT_LOCATION };
  return { view: view as PortalLocation["view"], orderFilter: filter as PortalLocation["orderFilter"], profileSubview: profile as PortalLocation["profileSubview"] };
}
export function writePortalLocation(location: PortalLocation) {
  if (typeof window === "undefined") return;
  const hash = new URLSearchParams({ portal: location.view });
  if (location.view === "orders") hash.set("orders", location.orderFilter);
  if (location.view === "profile") hash.set("profile", location.profileSubview);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
}
