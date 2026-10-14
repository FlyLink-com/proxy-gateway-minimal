// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createThirdPartyAdminClient } from "../features/third-party-node-names/third-party-admin-client";
import { renderedNodeName } from "../features/third-party-node-names/node-name-model";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const CASES = [
  { label: "unclassified OTHER node", source: "Synthetic", node: "unclassified" },
  { label: "node emoji", source: "Synthetic", node: "US 😀" },
  { label: "node U200B", source: "Synthetic", node: "US\u200b" },
  { label: "node U2060", source: "Synthetic", node: "US\u2060" },
  { label: "node isolated surrogate", source: "Synthetic", node: "US\ud800" },
  { label: "source emoji", source: "Synthetic 😀", node: "US" },
  { label: "source U200B", source: "Synthetic\u200b", node: "US" },
  { label: "source U2060", source: "Synthetic\u2060", node: "US" },
  { label: "source isolated surrogate", source: "Synthetic\ud800", node: "US" },
  { label: "node display fallback", source: "Synthetic", node: "\u200b" },
  { label: "source display fallback", source: "\u200b", node: "US" }
];

// A fresh Node process loads the real backend parser and SQLite implementation.
// It receives synthetic labels only; stdout contains public DTOs and booleans,
// never raw YAML, database rows, encrypted material, or connection credentials.
const GENERATE_PUBLIC_DTO = String.raw`
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPortalTotpSecretProtector } from "./server/services/platform/portal-totp-verifier.mjs";
import { applyThirdPartySubscriptionMigrations, REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID, REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM } from "./server/services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "./server/services/platform/third-party-subscription-store.mjs";
import { decorateThirdPartyServers } from "./server/services/platform/third-party-subscription-render.mjs";
let networkCalls = 0;
const noNetwork = () => { networkCalls += 1; throw new Error("network_disabled"); };
globalThis.fetch = noNetwork;
let database;
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  database = new Database(":memory:");
  const nowFn = () => new Date("2026-10-13T00:00:00Z");
  applyThirdPartySubscriptionMigrations({ database, nowFn,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM });
  const secretProtector = createPortalTotpSecretProtector({ key: Buffer.alloc(32, 23) });
  const store = createSqliteThirdPartySubscriptionStore({ database, secretProtector, nowFn, fetchFn: noNetwork, resolveFn: noNetwork });
  const source = store.createInlineSource({ name: input.source, enabled: false, tiers: ["monthly_basic"], yamlContent: JSON.stringify({ proxies: [
    { name: input.node, type: "ss", server: "192.0.2.23", port: 8388, cipher: "aes-256-gcm", password: "synthetic-contract-material" }
  ] }) });
  const materialDigest = () => createHash("sha256").update(JSON.stringify({
    source: database.prepare("select name, protected_url from platform_third_party_sources where id = ?").get(source.id),
    nodes: database.prepare("select display_name, fingerprint, protected_config from platform_third_party_nodes where source_id = ? order by id").all(source.id)
  })).digest("hex");
  const before = materialDigest();
  const initial = store.listSourceNodes(source.id);
  store.enableSourceNodes(source.id, { revision: initial.revision });
  const nodeView = store.listSourceNodes(source.id);
  const publicSources = store.listSources();
  const displayNames = decorateThirdPartyServers(store.listActiveServersForPlan("monthly_basic")).map((node) => node.subscriptionDisplayName);
  process.stdout.write(JSON.stringify({ publicSources, nodeView, displayNames, materialUnchanged: before === materialDigest(), networkCalls }));
} catch {
  process.stdout.write(JSON.stringify({ fixtureFailed: true }));
  process.exitCode = 1;
} finally { database?.close(); }
`;

type PublicFixture = {
  publicSources: unknown[];
  nodeView: { sourceId: string; [key: string]: unknown };
  displayNames: string[];
  materialUnchanged: boolean;
  networkCalls: number;
};

function fixture(source: string, node: string): PublicFixture {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", GENERATE_PUBLIC_DTO], {
    cwd: repositoryRoot,
    input: JSON.stringify({ source, node }),
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 128 * 1024,
    // No inherited credentials, proxies, HOME, tokens, NODE_OPTIONS, or paths.
    env: process.platform === "win32" ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" } : {},
    windowsHide: true
  });
  expect(result.status, "synthetic backend fixture must succeed").toBe(0);
  expect(result.stderr.length, "fixture should not emit server errors").toBe(0);
  expect(/synthetic-contract-material|192\.0\.2\.23|protected_config|protected_url|password|fingerprint/.test(result.stdout),
    "fixture output must not contain protected material").toBe(false);
  return JSON.parse(result.stdout) as PublicFixture;
}

function safeDisplay(value: string) {
  expect(value.length).toBeGreaterThan(0);
  expect(value.length).toBeLessThanOrEqual(128);
  // eslint-disable-next-line no-control-regex -- Explicit unsafe display boundary.
  expect(value).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u);
  expect(value).not.toMatch(/[\ud800-\udfff]/u);
}

describe("real third-party parser/store to Admin client contract", () => {
  test.each(CASES)("$label survives the backend-to-client display boundary", async ({ source, node, label }) => {
    const data = fixture(source, node);
    const client = createThirdPartyAdminClient({ fetcher: async (input) => {
      const path = String(input);
      const payload = path.endsWith("/sources") ? { items: data.publicSources }
        : path.endsWith(`/sources/${data.nodeView.sourceId}/nodes`) ? data.nodeView : null;
      if (payload === null) throw new Error("unexpected synthetic request");
      return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
    } });
    const sources = await client.listSources();
    expect(sources).toHaveLength(1);
    safeDisplay(sources[0].name);
    const view = await client.listNodes(sources[0].id);
    expect(view.items).toHaveLength(1);
    const publicNode = view.items[0];
    safeDisplay(publicNode.originalName);
    safeDisplay(publicNode.defaultName);
    safeDisplay(renderedNodeName(publicNode));
    expect(data.displayNames).toHaveLength(1);
    safeDisplay(data.displayNames[0]);
    expect(data.materialUnchanged).toBe(true);
    expect(data.networkCalls).toBe(0);
    if (label === "unclassified OTHER node") expect(publicNode.countryCode).toBe("OTHER");
    if (label === "node emoji") {
      expect(publicNode.originalName).toContain("😀");
      expect(publicNode.defaultName).toContain("😀");
      expect(data.displayNames[0]).toContain("😀");
    }
    if (label === "source emoji") expect(sources[0].name).toContain("😀");
  });
});
