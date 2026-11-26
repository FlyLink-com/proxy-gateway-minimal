// Synthetic Worker/Agent test fixture. Never installed by the Agent service.
import { createPublicKey } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAgentClient, createFileLock, createFileMaterialStore, createJsonStateStore, WRITER_ERROR_CODES } from "../../../../agent/g4/agent-client.mjs";
import { createManifestVerifier } from "../../../../agent/g4/manifest.mjs";
import { validateBaseUrl, writeAppliedMaterials } from "../../../../agent/g4/run-once.mjs";
import { localEpochProvider } from "./local-epoch-handoff.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const baseUrl = validateBaseUrl(requiredEnv("GCCGW_G4_BASE_URL"));
  const nodeRef = requiredEnv("GCCGW_G4_NODE_REF");
  const epochProvider = localEpochProvider({
    baseUrl,
    nodeRef,
    handoffPath: requiredEnv("GCCGW_G4_LOCAL_EPOCH_HANDOFF_FILE"),
    publicKeyPath: requiredEnv("GCCGW_G4_LOCAL_EPOCH_PUBLIC_KEY_FILE"),
  });
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
        redirect: "error",
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
        redirect: "error",
      });
      if (!response.ok) {
        const error = new Error(`receipt submit failed: HTTP ${response.status}`);
        error.statusCode = response.status;
        // Keep the stable Writer codes, never copy the remote message.
        const body = await response.json().catch(() => null);
        if (WRITER_ERROR_CODES.has(body?.error?.code)) error.code = body.error.code;
        throw error;
      }
    },
  };

  const stateStore = createJsonStateStore(join(stateDir, "applied-state.json"), { durable: true });
  const saveState = stateStore.save;
  stateStore.save = async (state) => {
    if (state.pendingApply && process.env.GCCGW_TEST_FAIL_INTENT_SAVE === "true") throw new Error("synthetic save failure");
    return saveState(state);
  };
  const client = createAgentClient({
    nodeRef,
    channelRefs,
    transport,
    epochProvider,
    writerEpochForwarding: true,
    materialStore: createFileMaterialStore(materialsDir),
    verifier: createManifestVerifier({ publicKeys }),
    stateStore,
    lock: createFileLock(join(stateDir, "agent.lock"), {
      now: () => Date.now() + (process.env.GCCGW_TEST_ADVANCE_LOCK_CLOCK === "true" ? 121_000 : 0),
    }),
    auth: { keyId, token },
    config: {
      applyIntentEnabled: true,
      dryRun: process.env.GCCGW_G4_DRY_RUN !== "false",
      applyEnabled: process.env.GCCGW_G4_APPLY_ENABLED === "true",
    },
    apply: async ({ manifest, materials }) => {
      if (process.env.GCCGW_TEST_EXIT_AFTER_FIRST_MATERIAL === "true") {
        await writeAppliedMaterials(stateDir, manifest.generation, materials.slice(0, 1));
        process.exit(86);
      }
      await writeAppliedMaterials(stateDir, manifest.generation, materials);
      // Test-only process boundary: files are visible but Agent state/receipt
      // persistence has not run. Never installed by an Agent service.
      if (process.env.GCCGW_TEST_EXIT_AFTER_LOCAL_APPLY === "true") process.exit(86);
    },
  });

  const result = await client.runOnce();
  // The summary is safe to log: ids, generation and status only —
  // never material, digests of credentials beyond the manifest's own
  // desired-state digest, or tokens (AGT-DATA-1).
  console.log(JSON.stringify({
    status: result.status,
    generation: result.generation ?? null,
    stage: result.stage ?? null,
    code: result.code ?? null,
  }));
  if (result.status === "retry_later") process.exitCode = 3;
  if (result.status === "rejected") process.exitCode = 4;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "error", error: String(error?.message ?? error) }));
  process.exitCode = 1;
});
