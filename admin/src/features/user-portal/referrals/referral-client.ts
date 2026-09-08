import { createPortalBrowserFetch } from "../portal-browser-session";

export type PortalReferralPolicy = {
  policyRef: string;
  version: number;
  effectiveAt: string;
  rateBps: number;
  rounding: "floor" | "half_up";
  attributionDays: number;
  confirmationDays: number;
};

export type PortalReferralProfile = {
  eligible: boolean;
  /** A validated same-origin path, never a server-supplied absolute URL. */
  linkPath: string | null;
  policy: PortalReferralPolicy | null;
};

export type PortalReferralPerformance = {
  registrations: number;
  firstRechargeConversions: number;
  creditedFirstRechargeCoins: number;
  pendingRewardCoins: number;
  availableRewardCoins: number;
  reversedRewardCoins: number;
  conversionRate: number;
  reconciliationRequired: boolean;
};

export type PortalReferralRequest = { sessionRef: string; signal?: AbortSignal };
export type PortalReferralClient = {
  getProfile(input: PortalReferralRequest): Promise<PortalReferralProfile>;
  createLink(input: PortalReferralRequest): Promise<PortalReferralProfile>;
  getPerformance(input: PortalReferralRequest): Promise<PortalReferralPerformance>;
};
export type PortalReferralErrorCode =
  | "invalid_session"
  | "referral_request_invalid"
  | "referral_account_ineligible"
  | "referral_policy_unavailable"
  | "referral_unavailable"
  | "referral_rate_limited"
  | "not_found";
export type PortalReferralClientErrorCode = PortalReferralErrorCode
  | "referral_request_failed" | "referral_request_aborted";

export class PortalReferralClientError extends Error {
  readonly code: PortalReferralClientErrorCode;
  readonly retryable: boolean;

  constructor(code: PortalReferralClientErrorCode, retryable: boolean) {
    super("Portal referral request failed.");
    this.name = "PortalReferralClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 65_536;
const SESSION_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/u;
const LINK_PATH = /^\/r\/[A-Za-z0-9_-]{32}$/u;
const POLICY_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/u;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ERRORS: Record<PortalReferralErrorCode, { statuses: number[]; retryable: boolean }> = {
  invalid_session: { statuses: [401], retryable: false },
  referral_request_invalid: { statuses: [400, 403, 413], retryable: false },
  referral_account_ineligible: { statuses: [403], retryable: false },
  referral_policy_unavailable: { statuses: [503], retryable: false },
  referral_unavailable: { statuses: [503], retryable: true },
  referral_rate_limited: { statuses: [429], retryable: true },
  not_found: { statuses: [404], retryable: false },
};

function failed(): never {
  throw new PortalReferralClientError("referral_request_failed", true);
}
function aborted(): never {
  throw new PortalReferralClientError("referral_request_aborted", false);
}
function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return failed();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => typeof key !== "string" || !fields.includes(key))) return failed();
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return failed();
    result[field] = descriptor.value;
  }
  return result;
}
function units(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) return failed();
  return value as number;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") return failed();
  return value;
}
function policyProjection(value: unknown): PortalReferralPolicy | null {
  if (value === null) return null;
  const policy = exactObject(value, ["policyRef", "version", "effectiveAt", "rateBps", "rounding", "attributionDays", "confirmationDays"]);
  if (typeof policy.policyRef !== "string" || policy.policyRef.trim() !== policy.policyRef || !POLICY_REFERENCE.test(policy.policyRef)
    || typeof policy.effectiveAt !== "string" || !UTC_TIMESTAMP.test(policy.effectiveAt)
    || !Number.isFinite(Date.parse(policy.effectiveAt)) || new Date(policy.effectiveAt).toISOString() !== policy.effectiveAt
    || (policy.rounding !== "floor" && policy.rounding !== "half_up")) return failed();
  return {
    policyRef: policy.policyRef,
    version: units(policy.version, 1),
    effectiveAt: policy.effectiveAt,
    rateBps: units(policy.rateBps, 1, 10000),
    rounding: policy.rounding,
    attributionDays: units(policy.attributionDays, 1, 365),
    confirmationDays: units(policy.confirmationDays, 0, 365),
  };
}
function profileProjection(input: unknown): PortalReferralProfile {
  const profile = exactObject(exactObject(input, ["profile"]).profile, ["eligible", "linkPath", "policy"]);
  const eligible = bool(profile.eligible);
  const linkPath = profile.linkPath;
  // JS $ also matches before a final newline; exact length closes that ambiguity.
  if (linkPath !== null && (typeof linkPath !== "string" || linkPath.length !== 35 || !LINK_PATH.test(linkPath))) return failed();
  if (!eligible && linkPath !== null) return failed();
  return { eligible, linkPath, policy: policyProjection(profile.policy) };
}
function performanceProjection(input: unknown): PortalReferralPerformance {
  const performance = exactObject(exactObject(input, ["performance"]).performance, [
    "registrations", "firstRechargeConversions", "creditedFirstRechargeCoins", "pendingRewardCoins",
    "availableRewardCoins", "reversedRewardCoins", "conversionRate", "reconciliationRequired",
  ]);
  const registrations = units(performance.registrations);
  const firstRechargeConversions = units(performance.firstRechargeConversions, 0, registrations);
  const conversionRate = registrations ? firstRechargeConversions / registrations : 0;
  if (performance.conversionRate !== conversionRate) return failed();
  return {
    registrations, firstRechargeConversions, conversionRate,
    creditedFirstRechargeCoins: units(performance.creditedFirstRechargeCoins),
    pendingRewardCoins: units(performance.pendingRewardCoins),
    availableRewardCoins: units(performance.availableRewardCoins),
    reversedRewardCoins: units(performance.reversedRewardCoins),
    reconciliationRequired: bool(performance.reconciliationRequired),
  };
}
function requestInput(input: PortalReferralRequest): PortalReferralRequest {
  const value = exactObject(input, input && Object.hasOwn(input, "signal") ? ["sessionRef", "signal"] : ["sessionRef"]);
  if (typeof value.sessionRef !== "string" || value.sessionRef.trim() !== value.sessionRef || !SESSION_REFERENCE.test(value.sessionRef)) return failed();
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) return failed();
  return { sessionRef: value.sessionRef, signal: value.signal as AbortSignal | undefined };
}

export function createPortalReferralClient(options: { fetchFn?: typeof fetch } = {}): PortalReferralClient {
  // Uses the existing cookie/legacy-session transport, including no-store and
  // redirect rejection. Wrapping an already wrapped Portal fetch is idempotent.
  const fetchFn = createPortalBrowserFetch(options.fetchFn ?? fetch);
  async function request<T>(input: PortalReferralRequest, route: "profile" | "link" | "performance", project: (body: unknown) => T): Promise<T> {
    let caller: AbortSignal | undefined;
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const { sessionRef, signal } = requestInput(input);
      caller = signal;
      if (caller?.aborted) return aborted();
      caller?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
      const headers = new Headers({ "X-Portal-Session": sessionRef, Accept: "application/json" });
      if (route === "link") headers.set("Content-Type", "application/json");
      const response = await fetchFn(`/api/portal/referral/${route}`, {
        method: route === "link" ? "POST" : "GET", headers,
        ...(route === "link" ? { body: "{}" } : {}), signal: controller.signal,
      });
      if (controller.signal.aborted) return caller?.aborted ? aborted() : failed();
      if (response.redirected || !Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599
        || response.ok !== (response.status >= 200 && response.status < 300)) return failed();
      const text = await response.text();
      if (controller.signal.aborted) return caller?.aborted ? aborted() : failed();
      if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES || new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES) return failed();
      // The app's default-off boundary ends the response without a JSON body.
      if (response.status === 404 && text === "") {
        throw new PortalReferralClientError("not_found", false);
      }
      const body: unknown = JSON.parse(text);
      if (!response.ok) {
        const { error } = exactObject(body, ["error"]);
        if (typeof error !== "string" || !Object.hasOwn(ERRORS, error)) return failed();
        const contract = ERRORS[error as PortalReferralErrorCode];
        if (!contract.statuses.includes(response.status)) return failed();
        throw new PortalReferralClientError(error as PortalReferralErrorCode, contract.retryable);
      }
      if (response.status !== 200) return failed();
      return project(body);
    } catch (error) {
      if (caller?.aborted) return aborted();
      if (error instanceof PortalReferralClientError) throw error;
      return failed();
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      caller?.removeEventListener("abort", abort);
    }
  }
  return {
    getProfile: input => request(input, "profile", profileProjection),
    createLink: input => request(input, "link", body => {
      const profile = profileProjection(body);
      if (!profile.eligible || profile.linkPath === null || profile.policy === null) return failed();
      return profile;
    }),
    getPerformance: input => request(input, "performance", performanceProjection),
  };
}
