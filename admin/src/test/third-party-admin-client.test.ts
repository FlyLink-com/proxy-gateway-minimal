import { describe, expect, test, vi } from "vitest";
import { createThirdPartyAdminClient, ThirdPartyAdminError } from "../features/third-party-node-names/third-party-admin-client";
import { renderedNodeName } from "../features/third-party-node-names/node-name-model";

const SOURCE_ID = `tpsrc_${"a".repeat(32)}`;
const NODE_ID = `tpnode_${"b".repeat(32)}`;
const REVISION = "c".repeat(64);
const ROOT = "/api/admin/third-party-subscriptions";
const YAML = "proxies: []";
const SOURCE = { id: SOURCE_ID, name: "合成来源", enabled: false, tiers: ["monthly_basic"], sourceKind: "inline-yaml" };
const NODE = { id: NODE_ID, originalName: "原始名称", defaultName: "[3P] JP 1 | 原始名称", customName: null, displayName: "[3P] JP 1 | 原始名称", countryCode: "JP", protocol: "vless" };
const SNAPSHOT = { sourceId: SOURCE_ID, revision: REVISION, enabled: false, items: [NODE] };
const signal = new AbortController().signal;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(body: unknown, status = 200) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(body, status));
  return { fetcher, client: createThirdPartyAdminClient({ fetcher }) };
}

async function safeError(promise: Promise<unknown>, code: string) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ThirdPartyAdminError);
  expect(error).toMatchObject({ code });
  expect(String(error)).not.toMatch(/must-not-leak|https?:\/\/|password|token=|internal-path/);
  expect((error as Error).cause).toBeUndefined();
}

describe("third-party Admin client", () => {
  test("lists a whitelisted source projection without retaining backend extras", async () => {
    const { client, fetcher } = setup({ items: [{ ...SOURCE, protectedUrl: "must-not-leak", nodes: { total: 1 }, regionOverride: "JP" }], secret: "must-not-leak" });
    expect(await client.listSources(signal)).toEqual([SOURCE]);
    expect(fetcher).toHaveBeenCalledWith(`${ROOT}/sources`, expect.objectContaining({ method: "GET", credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error", signal }));
    const init = fetcher.mock.calls[0][1]!;
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
    expect(init.body).toBeUndefined();
  });

  test.each([["vless", "VLESS"], ["hysteria2", "Hy2"], ["tuic", "TUIC"], ["ss", "SS"]])("maps %s nodes and discards raw material", async (protocol, expected) => {
    const { client } = setup({ ...SNAPSHOT, secret: "must-not-leak", items: [{ ...NODE, protocol, host: "must-not-leak", password: "must-not-leak", protectedConfig: "must-not-leak" }] });
    expect(await client.listNodes(SOURCE_ID, signal)).toEqual({ sourceId: SOURCE_ID, revision: REVISION, enabled: false, items: [{ id: NODE_ID, sourceName: "", originalName: NODE.originalName, defaultName: NODE.defaultName, customName: null, countryCode: "JP", protocol: expected }] });
  });

  test("accepts the backend OTHER country code and preserves its default display name", async () => {
    const defaultName = "[3P] OTHER 1 | 未识别地区";
    const { client } = setup({ ...SNAPSHOT, items: [{ ...NODE, countryCode: "OTHER", originalName: "未识别地区", defaultName, displayName: defaultName }] });
    const view = await client.listNodes(SOURCE_ID);
    expect(view.items[0].countryCode).toBe("OTHER");
    expect(renderedNodeName(view.items[0])).toBe(defaultName);
  });

  test.each(["other", "OTHER ", "OTHER_REGION", "UNKNOWN", "J", "JPN", "", 0, null, {}, []])("rejects invalid country code %# rather than broadening to arbitrary strings", async (countryCode) => {
    await safeError(setup({ ...SNAPSHOT, items: [{ ...NODE, countryCode }] }).client.listNodes(SOURCE_ID), "invalid");
  });

  test("saves the full retained list through the revision guarded endpoint", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    const nodes = [{ id: NODE_ID, customName: "🇯🇵 日本" }];
    await client.saveNodes(SOURCE_ID, { revision: REVISION, nodes }, signal);
    expect(fetcher).toHaveBeenCalledWith(`${ROOT}/sources/${SOURCE_ID}/nodes`, expect.objectContaining({ method: "PUT", body: JSON.stringify({ revision: REVISION, nodes }), signal }));
  });

  test("empty saved lists represent explicit logical deletion and are allowed", async () => {
    const { client } = setup({ ...SNAPSHOT, items: [] });
    expect((await client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [] })).items).toEqual([]);
  });

  test("enable uses only revision while disable can only send enabled:false", async () => {
    const { client, fetcher } = setup({ ...SNAPSHOT, enabled: true });
    await client.enableSource(SOURCE_ID, REVISION, signal);
    expect(fetcher).toHaveBeenLastCalledWith(`${ROOT}/sources/${SOURCE_ID}/enable`, expect.objectContaining({ method: "POST", body: JSON.stringify({ revision: REVISION }) }));
    fetcher.mockResolvedValue(response(SOURCE));
    await client.disableSource(SOURCE_ID, signal);
    expect(fetcher).toHaveBeenLastCalledWith(`${ROOT}/sources/${SOURCE_ID}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: false }) }));
  });

  test("imports inline YAML as explicitly disabled with only allowed fields", async () => {
    const { client, fetcher } = setup(SOURCE, 201);
    expect(await client.importYaml({ name: SOURCE.name, yamlContent: YAML, tiers: SOURCE.tiers }, signal)).toEqual(SOURCE);
    expect(fetcher).toHaveBeenCalledWith(`${ROOT}/sources`, expect.objectContaining({ method: "POST", body: JSON.stringify({ name: SOURCE.name, yamlContent: YAML, tiers: SOURCE.tiers, enabled: false }) }));
  });

  test.each([[401, "session"], [403, "permission"], [503, "unavailable"], [500, "unavailable"], [404, "not_found"], [429, "rate_limited"]])("maps HTTP %s safely", async (status, code) => {
    const { client } = setup({ error: "must-not-leak", message: "https://invalid.test/token=must-not-leak" }, status as number);
    await safeError(client.listSources(), code as string);
  });

  test.each(["revision_conflict", "source_enabled"])("preserves fixed %s conflicts", async (code) => {
    const { client } = setup({ error: code, details: "must-not-leak" }, 409);
    await safeError(client.listSources(), code);
  });

  test.each(["empty_source", "invalid_node_name", "duplicate_node_name", "invalid_yaml", "invalid_tiers", "remote_import_disabled", "unsupported_source_kind"])("preserves known validation code %s only", async (code) => {
    const { client } = setup({ error: code, details: "must-not-leak" }, 400);
    await safeError(client.listSources(), code);
  });

  test("unknown status body and malformed JSON do not reflect arbitrary text", async () => {
    const { client, fetcher } = setup({ error: "must-not-leak" }, 400);
    await safeError(client.listSources(), "invalid");
    fetcher.mockResolvedValue(new Response("must-not-leak internal-path", { status: 200 }));
    await safeError(client.listSources(), "invalid");
    fetcher.mockRejectedValue(new Error("must-not-leak password https://invalid.test"));
    await safeError(client.listSources(), "network");
  });

  test("blocks redirected and opaque responses", async () => {
    const { client, fetcher } = setup({ items: [] });
    const redirected = response({ items: [] });
    Object.defineProperty(redirected, "redirected", { value: true });
    fetcher.mockResolvedValue(redirected);
    await safeError(client.listSources(), "invalid");
    const opaque = response({ items: [] });
    Object.defineProperty(opaque, "type", { value: "opaqueredirect" });
    fetcher.mockResolvedValue(opaque);
    await safeError(client.listSources(), "invalid");
  });

  test("aborted calls do not fetch and in-flight abortion uses a generic AbortError", async () => {
    const { client, fetcher } = setup({ items: [] });
    const controller = new AbortController();
    controller.abort(new Error("must-not-leak"));
    await expect(client.listSources(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRejectedValue(new DOMException("must-not-leak", "AbortError"));
    const error = await client.listSources().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(String(error)).not.toContain("must-not-leak");
  });

  test("abortion during response reading cannot publish a stale successful snapshot", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    const controller = new AbortController();
    const incoming = response(SNAPSHOT);
    vi.spyOn(incoming, "text").mockImplementation(async () => {
      controller.abort();
      return JSON.stringify(SNAPSHOT);
    });
    fetcher.mockResolvedValue(incoming);
    await expect(client.listNodes(SOURCE_ID, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  test("oversized response metadata is rejected without reading its body", async () => {
    const { client, fetcher } = setup({ items: [] });
    const incoming = response({ items: [] });
    incoming.headers.set("Content-Length", String(2 * 1024 * 1024 + 1));
    const read = vi.spyOn(incoming, "text");
    fetcher.mockResolvedValue(incoming);
    await safeError(client.listSources(), "invalid");
    expect(read).not.toHaveBeenCalled();
  });

  test.each([
    { ...SNAPSHOT, sourceId: `tpsrc_${"d".repeat(32)}` },
    { ...SNAPSHOT, revision: "bad" },
    { ...SNAPSHOT, enabled: "true" },
    { ...SNAPSHOT, items: [NODE, NODE] },
    { ...SNAPSHOT, items: [{ ...NODE, protocol: "ssh" }] },
    { ...SNAPSHOT, items: [{ ...NODE, id: "../escape" }] },
    { ...SNAPSHOT, items: [{ ...NODE, countryCode: "../escape" }] },
    { ...SNAPSHOT, items: [{ ...NODE, customName: "x".repeat(129) }] },
    { ...SNAPSHOT, items: [{ ...NODE, customName: "\ud83d" }] },
    { ...SNAPSHOT, items: [{ ...NODE, customName: "a\u202eb" }] },
    { ...SNAPSHOT, items: new Array(257).fill(NODE) }
  ])("rejects malformed node projections %#", async (body) => {
    await safeError(setup(body).client.listNodes(SOURCE_ID), "invalid");
  });

  test("names remain inert text, including URL-shaped text, with no raw object retention", async () => {
    const value = "https://example.invalid/not-a-fetch";
    const { client, fetcher } = setup({ ...SNAPSHOT, items: [{ ...NODE, customName: value, displayName: value }] });
    expect((await client.listNodes(SOURCE_ID)).items[0].customName).toBe(value);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${ROOT}/sources/${SOURCE_ID}/nodes`);
  });

  test("validates ids, revision and UTF-16 name bounds before making requests", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    await safeError(client.listNodes("https://invalid.test/token=must-not-leak"), "invalid");
    await safeError(client.enableSource(SOURCE_ID, "bad"), "invalid");
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: "😀".repeat(65) }] }), "invalid_node_name");
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: "\ud83d" }] }), "invalid_node_name");
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: "DIRECT" }] }), "invalid_node_name");
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: null }, { id: NODE_ID, customName: null }] }), "invalid");
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: new Array(257).fill({ id: NODE_ID, customName: null }) }), "invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("bounds YAML by UTF-8 bytes, not string units, and rejects remote import fields", async () => {
    const { client, fetcher } = setup(SOURCE);
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: "中".repeat(22000), tiers: SOURCE.tiers }), "invalid_yaml");
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: "", tiers: SOURCE.tiers }), "invalid_yaml");
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: YAML, tiers: ["admin"] }), "invalid_tiers");
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: YAML, tiers: SOURCE.tiers, subscriptionUrl: "https://invalid.test/" } as Parameters<typeof client.importYaml>[0]), "invalid");
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: YAML, tiers: SOURCE.tiers, enabled: true } as Parameters<typeof client.importYaml>[0]), "invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("accepts a 128-UTF16 name and a 64KiB inline YAML input", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    await client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: "😀".repeat(64) }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(response(SOURCE, 201));
    await client.importYaml({ name: SOURCE.name, yamlContent: "a".repeat(64 * 1024), tiers: SOURCE.tiers });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("rejects case-insensitive duplicate aliases without a request", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [
      { id: NODE_ID, customName: "Example" },
      { id: `tpnode_${"d".repeat(32)}`, customName: "example" }
    ] }), "duplicate_node_name");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("import and disable responses cannot falsely report activation success", async () => {
    const { client } = setup({ ...SOURCE, enabled: true });
    await safeError(client.importYaml({ name: SOURCE.name, yamlContent: YAML, tiers: SOURCE.tiers }), "invalid");
    await safeError(client.disableSource(SOURCE_ID), "invalid");
  });

  test("enable response must affirm a nonempty enabled source", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    await safeError(client.enableSource(SOURCE_ID, REVISION), "invalid");
    fetcher.mockResolvedValue(response({ ...SNAPSHOT, enabled: true, items: [] }));
    await safeError(client.enableSource(SOURCE_ID, REVISION), "invalid");
  });

  test("rejects extra save keys rather than silently forwarding them", async () => {
    const { client, fetcher } = setup(SNAPSHOT);
    await safeError(client.saveNodes(SOURCE_ID, { revision: REVISION, nodes: [{ id: NODE_ID, customName: null, password: "must-not-leak" }] } as unknown as Parameters<typeof client.saveNodes>[1]), "invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });

  test.each([
    { items: [{ ...SOURCE, tiers: ["administrator"] }] },
    { items: [{ ...SOURCE, sourceKind: "must-not-leak" }] },
    { items: [SOURCE, SOURCE] },
    { items: [{ ...SOURCE, name: "x".repeat(129) }] },
    { items: [{ ...SOURCE, enabled: 0 }] }
  ])("rejects malformed source projections %#", async (body) => {
    await safeError(setup(body).client.listSources(), "invalid");
  });
});
