import { isNodeCountryCode } from "./node-country-model";

const ROOT = "/api/admin/third-party-subscriptions/distribution";
const REVISION = /^[a-f0-9]{64}$/;
const OWNED_ID = /^ownnode_[a-f0-9]{32}$/;
const THIRD_PARTY_ID = /^tpnode_[a-f0-9]{32}$/;
const SOURCE_ID = /^tpsrc_[a-f0-9]{32}$/;
const PROTOCOLS = new Set(["ss", "vless", "hysteria2", "tuic"]);
export const DISTRIBUTION_PLANS = ["monthly_basic", "monthly_plus", "yearly"] as const;
export type DistributionPlan = typeof DISTRIBUTION_PLANS[number];
export type DistributionRoute = { planId: DistributionPlan; mode: "owned" | "third-party"; nodeIds: string[] };
export type OwnedDistributionNode = {
  id: string; originalName: string; defaultName: string; customName: string | null; displayName: string;
  protocol: string; countryCode: string; customCountryCode?: string; enabled: boolean; available: boolean;
};
export type DistributionCandidate = {
  id: string; sourceId: string; sourceName: string; displayName: string; protocol: string; countryCode: string;
  enabled: boolean; sourceEnabled: boolean; tiers: DistributionPlan[];
};
export type DistributionSnapshot = {
  revision: string; owned: { enabled: boolean; items: OwnedDistributionNode[] };
  routes: DistributionRoute[]; candidates: DistributionCandidate[];
};
export type OwnedDistributionSave = {
  revision: string; enabled: boolean;
  nodes: Array<{ id: string; enabled: boolean; customName: string | null; customCountryCode: string | null }>;
};
export type DistributionErrorCode = "session" | "permission" | "unavailable" | "stale" | "invalid" | "network" | "timeout";
export class DistributionError extends Error {
  constructor(readonly code: DistributionErrorCode) { super(`Subscription distribution: ${code}`); this.name = "DistributionError"; }
}
export interface SubscriptionDistributionClient {
  read(signal?: AbortSignal): Promise<DistributionSnapshot>;
  saveRoutes(input: { revision: string; routes: DistributionRoute[] }, signal?: AbortSignal): Promise<DistributionSnapshot>;
  saveOwned(input: OwnedDistributionSave, signal?: AbortSignal): Promise<DistributionSnapshot>;
}

function fail(): never { throw new DistributionError("invalid"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) fail();
}
function text(value: unknown): string {
  // Reject controls and directional markers; values remain inert React text.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== "string" || !value.trim() || value.length > 128 || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(value) || /[\ud800-\udfff]/u.test(value)) fail();
  return value;
}
function id(value: unknown, pattern: RegExp): string { if (typeof value !== "string" || !pattern.test(value)) fail(); return value; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") fail(); return value; }
function country(value: unknown, override = false): string {
  if (typeof value !== "string" || !isNodeCountryCode(value) || (override && value === "OTHER")) fail();
  return value;
}
function protocol(value: unknown): string { if (typeof value !== "string" || !PROTOCOLS.has(value)) fail(); return value; }
function array(value: unknown, max = 4096): unknown[] { if (!Array.isArray(value) || value.length > max) fail(); return value; }
function unique<T extends { id: string }>(values: T[]): T[] { if (new Set(values.map((value) => value.id)).size !== values.length) fail(); return values; }
function plan(value: unknown): DistributionPlan { if (!DISTRIBUTION_PLANS.includes(value as DistributionPlan)) fail(); return value as DistributionPlan; }
function route(value: unknown): DistributionRoute {
  const item = object(value); keys(item, ["planId", "mode", "nodeIds"]);
  if (item.mode !== "owned" && item.mode !== "third-party") fail();
  const nodeIds = array(item.nodeIds, 256).map((value) => id(value, THIRD_PARTY_ID));
  if (new Set(nodeIds).size !== nodeIds.length || (item.mode === "owned" && nodeIds.length !== 0) || (item.mode === "third-party" && nodeIds.length === 0)) fail();
  return { planId: plan(item.planId), mode: item.mode, nodeIds };
}
function routes(value: unknown): DistributionRoute[] {
  const result = array(value, 3).map(route);
  if (result.length !== 3 || new Set(result.map((item) => item.planId)).size !== 3) fail();
  return result;
}
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) fail();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0; let bodyText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) fail();
      bodyText += decoder.decode(value, { stream: true });
    }
    bodyText += decoder.decode();
    return JSON.parse(bodyText) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (error instanceof DistributionError) throw error;
    fail();
  } finally { reader.releaseLock(); }
}
function parseSnapshot(value: unknown): DistributionSnapshot {
  const data = object(value); keys(data, ["revision", "owned", "routes", "candidates"]);
  const owned = object(data.owned); keys(owned, ["enabled", "items"]);
  const items = unique(array(owned.items, 256).map((value): OwnedDistributionNode => {
    const item = object(value);
    keys(item, ["id", "originalName", "defaultName", "customName", "displayName", "protocol", "countryCode", "enabled", "available"], ["customCountryCode"]);
    return {
      id: id(item.id, OWNED_ID), originalName: text(item.originalName), defaultName: text(item.defaultName),
      customName: item.customName === null ? null : text(item.customName), displayName: text(item.displayName),
      protocol: protocol(item.protocol), countryCode: country(item.countryCode), enabled: bool(item.enabled), available: bool(item.available),
      ...(Object.hasOwn(item, "customCountryCode") ? { customCountryCode: country(item.customCountryCode, true) } : {})
    };
  }));
  const candidates = unique(array(data.candidates).map((value): DistributionCandidate => {
    const item = object(value); keys(item, ["id", "sourceId", "sourceName", "displayName", "protocol", "countryCode", "enabled", "sourceEnabled", "tiers"]);
    const tiers = array(item.tiers, 3).map(plan); if (tiers.length === 0 || new Set(tiers).size !== tiers.length) fail();
    return { id: id(item.id, THIRD_PARTY_ID), sourceId: id(item.sourceId, SOURCE_ID), sourceName: text(item.sourceName),
      displayName: text(item.displayName), protocol: protocol(item.protocol), countryCode: country(item.countryCode),
      enabled: bool(item.enabled), sourceEnabled: bool(item.sourceEnabled), tiers };
  }));
  return { revision: id(data.revision, REVISION), owned: { enabled: bool(owned.enabled), items }, routes: routes(data.routes), candidates };
}

export function createSubscriptionDistributionClient({ fetcher = fetch, timeoutMs = 15_000 }: { fetcher?: typeof fetch; timeoutMs?: number } = {}): SubscriptionDistributionClient {
  async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<DistributionSnapshot> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(`${ROOT}${path}`, {
        method: body === undefined ? "GET" : "PUT", credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (response.status === 401) throw new DistributionError("session");
      if (response.status === 403) throw new DistributionError("permission");
      if (response.status === 409) throw new DistributionError("stale");
      if (response.status === 503 || response.status >= 500) throw new DistributionError("unavailable");
      if (!response.ok || response.redirected || response.type === "opaque" || response.type === "opaqueredirect" || !response.headers.get("Content-Type")?.includes("application/json")) fail();
      const declaredLength = response.headers.get("Content-Length");
      if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 2 * 1024 * 1024)) fail();
      return parseSnapshot(await readBoundedJson(response, controller.signal));
    } catch (error) {
      if (timedOut) throw new DistributionError("timeout");
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof DistributionError) throw error;
      throw new DistributionError("network");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  return {
    read: (signal) => request("", undefined, signal),
    saveRoutes(input, signal) {
      const data = object(input); keys(data, ["revision", "routes"]);
      const selectedRoutes = routes(data.routes);
      return request("", { revision: id(data.revision, REVISION), routes: selectedRoutes }, signal).then((snapshot) => {
        for (const selected of selectedRoutes) {
          const actual = snapshot.routes.find((route) => route.planId === selected.planId);
          if (!actual || actual.mode !== selected.mode || actual.nodeIds.length !== selected.nodeIds.length || selected.nodeIds.some((id) => !actual.nodeIds.includes(id))) fail();
        }
        return snapshot;
      });
    },
    saveOwned(input, signal) {
      const data = object(input); keys(data, ["revision", "enabled", "nodes"]);
      const nodes = unique(array(data.nodes, 256).map((value) => {
        const item = object(value); keys(item, ["id", "enabled", "customName", "customCountryCode"]);
        const customName = item.customName === null ? null : text(item.customName).trim();
        return { id: id(item.id, OWNED_ID), enabled: bool(item.enabled), customName,
          customCountryCode: item.customCountryCode === null ? null : country(item.customCountryCode, true) };
      }));
      const enabled = bool(data.enabled);
      return request("/owned", { revision: id(data.revision, REVISION), enabled, nodes }, signal).then((snapshot) => {
        if (snapshot.owned.enabled !== enabled || snapshot.owned.items.length !== nodes.length) fail();
        for (const selected of nodes) {
          const actual = snapshot.owned.items.find((node) => node.id === selected.id);
          if (!actual || actual.enabled !== selected.enabled || actual.customName !== selected.customName || (actual.customCountryCode ?? null) !== selected.customCountryCode) fail();
        }
        return snapshot;
      });
    }
  };
}
