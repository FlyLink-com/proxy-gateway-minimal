import type { ThirdPartyNode } from "./node-name-model";
import { withNodeCountryFlag } from "./node-country-model";
import countryCodes from "./third-party-country-codes.json";

const ROOT = "/api/admin/third-party-subscriptions";
const SOURCE_ID = /^tpsrc_[0-9a-f]{32}$/;
const NODE_ID = /^tpnode_[0-9a-f]{32}$/;
const REVISION = /^[0-9a-f]{64}$/;
// eslint-disable-next-line no-control-regex -- Deliberately reject control characters in API display names.
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const RESERVED = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL", "AUTO", "STABLE", "WEAK-NETWORK", "FALLBACK"]);
const TIERS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const SOURCE_KINDS = new Set(["inline-yaml", "remote", "unknown"]);
const COUNTRY_OVERRIDES = new Set<string>([...countryCodes, "OTHER"]);
const PROTOCOLS = { vless: "VLESS", hysteria2: "Hy2", tuic: "TUIC", ss: "SS" } as const;
const MAX_NODES = 256;
const MAX_YAML_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MESSAGES = {
  session: "Admin session required.",
  permission: "Admin permission denied.",
  unavailable: "Third-party node management is unavailable.",
  network: "Third-party node request failed.",
  invalid: "Third-party node data is invalid.",
  not_found: "The requested source was not found.",
  rate_limited: "Too many requests. Try again later.",
  revision_conflict: "The source changed. Reload it before saving.",
  source_enabled: "Disable the source before editing it.",
  node_enabled: "Disable this node before deleting it.",
  empty_source: "An empty source cannot be enabled.",
  invalid_node_name: "The node name is invalid.",
  duplicate_node_name: "Node names must be unique.",
  invalid_yaml: "The YAML input is invalid.",
  invalid_tiers: "The source tiers are invalid.",
  remote_import_disabled: "Remote YAML import is not available.",
  unsupported_source_kind: "This source cannot be edited here.",
  protected_value_invalid: "Protected source material is unavailable."
} as const;

export type ThirdPartyAdminErrorCode = keyof typeof MESSAGES;
export class ThirdPartyAdminError extends Error {
  readonly code: ThirdPartyAdminErrorCode;
  constructor(code: ThirdPartyAdminErrorCode) {
    super(MESSAGES[code]);
    this.name = "ThirdPartyAdminError";
    this.code = code;
  }
}

export type ThirdPartySource = {
  id: string; name: string; enabled: boolean; tiers: string[]; sourceKind: string;
  // Retained nodes, including individually paused nodes; absent means unknown.
  nodeCount?: number;
};
export type ThirdPartyNodeSnapshot = { sourceId: string; revision: string; enabled: boolean; items: ThirdPartyNode[] };
export type ThirdPartyNodeSave = { revision: string; nodes: Array<{ id: string; customName: string | null; customCountryCode?: string | null }> };
export type ThirdPartyYamlImport = { name: string; yamlContent: string; tiers: string[] };
export interface ThirdPartyAdminClient {
  listSources(signal?: AbortSignal): Promise<ThirdPartySource[]>;
  listNodes(sourceId: string, signal?: AbortSignal): Promise<ThirdPartyNodeSnapshot>;
  saveNodes(sourceId: string, input: ThirdPartyNodeSave, signal?: AbortSignal): Promise<ThirdPartyNodeSnapshot>;
  enableSource(sourceId: string, revision: string, signal?: AbortSignal): Promise<ThirdPartyNodeSnapshot>;
  disableSource(sourceId: string, signal?: AbortSignal): Promise<ThirdPartySource>;
  setNodeEnabled?(sourceId: string, nodeId: string, revision: string, enabled: boolean, signal?: AbortSignal): Promise<ThirdPartyNodeSnapshot>;
  deleteNode?(sourceId: string, nodeId: string, revision: string, signal?: AbortSignal): Promise<ThirdPartyNodeSnapshot>;
  importYaml(input: ThirdPartyYamlImport, signal?: AbortSignal): Promise<ThirdPartySource>;
}
type NodeMutationClient = Required<Pick<ThirdPartyAdminClient, "setNodeEnabled" | "deleteNode">>;

function fail(code: ThirdPartyAdminErrorCode = "invalid"): never { throw new ThirdPartyAdminError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[], optional: string[] = []) {
  if (keys.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !keys.includes(key) && !optional.includes(key))) fail();
}
function validUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function name(value: unknown, code: ThirdPartyAdminErrorCode = "invalid"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || UNSAFE_NAME.test(value) || !validUnicode(value)) fail(code);
  return value;
}
function id(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) fail();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail();
  return value;
}
function countryOverride(value: unknown): string {
  if (typeof value !== "string" || !COUNTRY_OVERRIDES.has(value)) fail();
  return value;
}
function tiers(value: unknown, code: ThirdPartyAdminErrorCode = "invalid"): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3 || new Set(value).size !== value.length
    || value.some((tier) => typeof tier !== "string" || !TIERS.has(tier))) fail(code);
  return value.map((tier) => tier as string);
}
function parseSource(value: unknown): ThirdPartySource {
  const source = object(value);
  if (typeof source.sourceKind !== "string" || !SOURCE_KINDS.has(source.sourceKind)) fail();
  let nodeCount: number | undefined;
  if (Object.hasOwn(source, "nodes")) {
    const stats = object(source.nodes);
    if (Object.hasOwn(stats, "active")) {
      if (typeof stats.active !== "number" || !Number.isSafeInteger(stats.active) || stats.active < 0) fail();
      nodeCount = stats.active;
    }
  }
  return {
    id: id(source.id, SOURCE_ID), name: name(source.name), enabled: boolean(source.enabled), tiers: tiers(source.tiers), sourceKind: source.sourceKind,
    ...(nodeCount === undefined ? {} : { nodeCount })
  };
}
function parseSnapshot(value: unknown, sourceId: string): ThirdPartyNodeSnapshot {
  const snapshot = object(value);
  if (snapshot.sourceId !== sourceId || !Array.isArray(snapshot.items) || snapshot.items.length > MAX_NODES) fail();
  const ids = new Set<string>();
  const items = snapshot.items.map((value): ThirdPartyNode => {
    const node = object(value);
    const nodeId = id(node.id, NODE_ID);
    if (ids.has(nodeId)) fail();
    ids.add(nodeId);
    if (typeof node.protocol !== "string" || !Object.hasOwn(PROTOCOLS, node.protocol)) fail();
    if (typeof node.countryCode !== "string" || !/^(?:[A-Z]{2}|OTHER)$/.test(node.countryCode)) fail();
    // Names are inert display text. Never interpret a URL-shaped name as a URL.
    name(node.displayName);
    return {
      id: nodeId, sourceName: "", originalName: name(node.originalName), defaultName: name(node.defaultName),
      customName: node.customName === null ? null : name(node.customName), countryCode: node.countryCode,
      enabled: Object.hasOwn(node, "enabled") ? boolean(node.enabled) : true,
      ...(Object.hasOwn(node, "customCountryCode") ? { customCountryCode: countryOverride(node.customCountryCode) } : {}),
      protocol: PROTOCOLS[node.protocol as keyof typeof PROTOCOLS]
    };
  });
  return { sourceId, revision: id(snapshot.revision, REVISION), enabled: boolean(snapshot.enabled), items };
}
function throwAborted(): never { throw new DOMException("The operation was aborted.", "AbortError"); }
function aborted(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof Error && error.name === "AbortError") || (error instanceof DOMException && error.name === "AbortError");
}
function statusError(status: number, payload?: unknown): never {
  if (status === 401) fail("session");
  if (status === 403) fail("permission");
  if (status === 404) fail("not_found");
  if (status === 429) fail("rate_limited");
  if (status >= 500) fail("unavailable");
  const error = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).error : null;
  if (status === 409 && (error === "revision_conflict" || error === "source_enabled" || error === "node_enabled")) fail(error);
  const allowed = new Set(["empty_source", "invalid_node_name", "duplicate_node_name", "invalid_yaml", "invalid_tiers", "remote_import_disabled", "unsupported_source_kind", "protected_value_invalid"]);
  if (status === 400 && typeof error === "string" && allowed.has(error)) fail(error as ThirdPartyAdminErrorCode);
  fail();
}

export function createThirdPartyAdminClient({ fetcher = fetch }: { fetcher?: typeof fetch } = {}): ThirdPartyAdminClient & NodeMutationClient {
  async function request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throwAborted();
    let response: Response;
    try {
      response = await fetcher(`${ROOT}${path}`, {
        method, credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", signal,
        headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      if (aborted(error, signal)) throwAborted();
      fail("network");
    }
    if (signal?.aborted) throwAborted();
    if (response.redirected || response.type === "opaque" || response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) fail();
    if (!response.ok && response.status !== 400 && response.status !== 409) statusError(response.status);
    let payload: unknown;
    try {
      const length = response.headers.get("Content-Length");
      if (length !== null && Number(length) > MAX_RESPONSE_BYTES) fail();
      const text = await response.text();
      if (signal?.aborted) throwAborted();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) fail();
      payload = JSON.parse(text);
    } catch (error) {
      if (aborted(error, signal)) throwAborted();
      fail();
    }
    if (!response.ok) statusError(response.status, payload);
    return payload;
  }
  return {
    async listSources(signal) {
      const payload = object(await request("/sources", "GET", undefined, signal));
      if (!Array.isArray(payload.items) || payload.items.length > 4096) fail();
      const sources = payload.items.map(parseSource);
      if (new Set(sources.map((source) => source.id)).size !== sources.length) fail();
      return sources;
    },
    async listNodes(sourceId, signal) {
      id(sourceId, SOURCE_ID);
      return parseSnapshot(await request(`/sources/${sourceId}/nodes`, "GET", undefined, signal), sourceId);
    },
    async saveNodes(sourceId, input, signal) {
      id(sourceId, SOURCE_ID);
      const body = object(input);
      exactKeys(body, ["revision", "nodes"]);
      const revision = id(body.revision, REVISION);
      if (!Array.isArray(body.nodes) || body.nodes.length > MAX_NODES) fail();
      const ids = new Set<string>();
      const names = new Set<string>();
      const nodes = body.nodes.map((value) => {
        const node = object(value);
        exactKeys(node, ["id", "customName"], ["customCountryCode"]);
        const customCountryCode = Object.hasOwn(node, "customCountryCode") && node.customCountryCode !== undefined
          ? node.customCountryCode === null ? null : countryOverride(node.customCountryCode)
          : undefined;
        const nodeId = id(node.id, NODE_ID);
        if (ids.has(nodeId)) fail();
        ids.add(nodeId);
        if (node.customName !== null && typeof node.customName !== "string") fail("invalid_node_name");
        const customName = node.customName === null ? null : node.customName.trim() || null;
        if (node.customName !== null && (UNSAFE_NAME.test(node.customName) || !validUnicode(node.customName))) fail("invalid_node_name");
        if (customName !== null) {
          name(customName, "invalid_node_name");
          if (RESERVED.has(customName.toUpperCase())) fail("invalid_node_name");
          const lower = withNodeCountryFlag(customName, customCountryCode).toLowerCase();
          if (names.has(lower)) fail("duplicate_node_name");
          names.add(lower);
        }
        return {
          id: nodeId, customName,
          ...(customCountryCode === undefined ? {} : { customCountryCode })
        };
      });
      return parseSnapshot(await request(`/sources/${sourceId}/nodes`, "PUT", { revision, nodes }, signal), sourceId);
    },
    async enableSource(sourceId, revision, signal) {
      id(sourceId, SOURCE_ID);
      id(revision, REVISION);
      const snapshot = parseSnapshot(await request(`/sources/${sourceId}/enable`, "POST", { revision }, signal), sourceId);
      if (!snapshot.enabled || snapshot.items.length === 0) fail();
      return snapshot;
    },
    async setNodeEnabled(sourceId, nodeId, revision, enabled, signal) {
      id(sourceId, SOURCE_ID); id(nodeId, NODE_ID); id(revision, REVISION); boolean(enabled);
      const snapshot = parseSnapshot(await request(`/sources/${sourceId}/nodes/${nodeId}`, "PATCH", { revision, enabled }, signal), sourceId);
      if (snapshot.items.find((node) => node.id === nodeId)?.enabled !== enabled) fail();
      return snapshot;
    },
    async deleteNode(sourceId, nodeId, revision, signal) {
      id(sourceId, SOURCE_ID); id(nodeId, NODE_ID); id(revision, REVISION);
      const snapshot = parseSnapshot(await request(`/sources/${sourceId}/nodes/${nodeId}`, "DELETE", { revision }, signal), sourceId);
      if (snapshot.items.some((node) => node.id === nodeId)) fail();
      return snapshot;
    },
    async disableSource(sourceId, signal) {
      id(sourceId, SOURCE_ID);
      const source = parseSource(await request(`/sources/${sourceId}`, "PATCH", { enabled: false }, signal));
      if (source.id !== sourceId || source.enabled) fail();
      return source;
    },
    async importYaml(input, signal) {
      const body = object(input);
      exactKeys(body, ["name", "yamlContent", "tiers"]);
      const sourceName = name(typeof body.name === "string" ? body.name.trim() : body.name);
      if (typeof body.yamlContent !== "string" || !body.yamlContent.trim() || new TextEncoder().encode(body.yamlContent).byteLength > MAX_YAML_BYTES) fail("invalid_yaml");
      const source = parseSource(await request("/sources", "POST", { name: sourceName, yamlContent: body.yamlContent, tiers: tiers(body.tiers, "invalid_tiers"), enabled: false }, signal));
      if (source.enabled || source.sourceKind !== "inline-yaml") fail();
      return source;
    }
  };
}
