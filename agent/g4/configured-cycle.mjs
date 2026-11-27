import { createPublicKey } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAgentClient, createFileLock, createFileMaterialStore, createJsonStateStore,
  WRITER_ERROR_CODES } from "./agent-client.mjs";
import { createManifestVerifier } from "./manifest.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// The installed CLI never passes a staged adapter. There is no environment
// opt-in here. The programmatic candidate is limited to synthetic loopback HTTP.
export async function runConfiguredCycle({ validateBaseUrl, writeAppliedMaterials, stagedAdapter } = {}) {
  const baseUrl = validateBaseUrl(requiredEnv("GCCGW_G4_BASE_URL"));
  const nodeRef = requiredEnv("GCCGW_G4_NODE_REF");
  const staged = stagedAdapter !== undefined;
  let stageOptions = {};
  if (staged) {
    const url = new URL(baseUrl);
    if (typeof stagedAdapter !== "function" || url.protocol !== "http:"
      || !["127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("staged Agent startup requires a numeric loopback HTTP origin");
    }
    const provider = stagedAdapter({ baseUrl: url.origin, nodeRef });
    if (typeof provider !== "function") throw new Error("staged Agent startup requires a verified authority reader");
    stageOptions = { epochProvider: provider, writerEpochForwarding: true };
  }
  const channelRefs = requiredEnv("GCCGW_G4_CHANNEL_REFS")
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
  const keyId = requiredEnv("GCCGW_G4_KEY_ID");
  const token = (await readFile(requiredEnv("GCCGW_G4_TOKEN_FILE"), "utf8")).trim();
  const keysJson = JSON.parse(await readFile(requiredEnv("GCCGW_G4_MANIFEST_KEYS_FILE"), "utf8"));
  const publicKeys = new Map(
    Object.entries(keysJson).map(([id, pem]) => [id, createPublicKey(pem)]),
  );
  const stateDir = requiredEnv("GCCGW_G4_STATE_DIR");
  const materialsDir = requiredEnv("GCCGW_G4_MATERIALS_DIR");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await chmod(stateDir, 0o700);

  const transport = {
    async fetchDesiredState({ headers, idempotencyKey }) {
      const url = new URL(`${baseUrl}/v1/agent/desired-state`);
      url.searchParams.set("nodeRef", nodeRef);
      url.searchParams.set("channelRefs", channelRefs.join(","));
      const response = await fetch(url, {
        headers: { ...headers, "idempotency-key": idempotencyKey },
        ...(staged ? { redirect: "error" } : {}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = new Error("desired-state fetch failed: HTTP " + response.status);
        error.statusCode = response.status;
        if (body?.error?.code) error.code = body.error.code;
        throw error;
      }
      return response.json();
    },
    async submitReceipt(receipt, { headers }) {
      const response = await fetch(`${baseUrl}/v1/agent/receipts`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": receipt.idempotencyKey,
        },
        body: JSON.stringify(receipt),
        ...(staged ? { redirect: "error" } : {}),
      });
      if (!response.ok) {
        const error = new Error(`receipt submit failed: HTTP ${response.status}`);
        if (staged) {
          const body = await response.json().catch(() => null);
          if (WRITER_ERROR_CODES.has(body?.error?.code)) error.code = body.error.code;
          error.statusCode = response.status;
        }
        throw error;
      }
    },
  };

  const client = createAgentClient({
    nodeRef,
    channelRefs,
    transport,
    ...stageOptions,
    materialStore: createFileMaterialStore(materialsDir),
    verifier: createManifestVerifier({ publicKeys }),
    stateStore: createJsonStateStore(join(stateDir, "applied-state.json"), staged ? { durable: true } : undefined),
    lock: createFileLock(join(stateDir, "agent.lock")),
    auth: { keyId, token },
    config: {
      applyIntentEnabled: staged,
      dryRun: process.env.GCCGW_G4_DRY_RUN !== "false",
      applyEnabled: process.env.GCCGW_G4_APPLY_ENABLED === "true",
    },
    apply: async ({ manifest, materials }) => {
      await writeAppliedMaterials(stateDir, manifest.generation, materials);
    },
  });

  return client.runOnce();
}
