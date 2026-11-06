// G4 Agent HTTPS contract — oneshot entrypoint.
//
// Runs exactly one poll cycle and exits (AGT-POLL-1: systemd timer +
// Type=oneshot service; no daemon). Configuration comes from the
// environment (in production: a protected EnvironmentFile, mirroring
// the current edge-agent unit):
//
//   GCCGW_G4_BASE_URL           control-plane base URL (see below)
//   GCCGW_G4_NODE_REF           this node's reference
//   GCCGW_G4_CHANNEL_REFS       comma-separated channel references
//   GCCGW_G4_KEY_ID             communication key id (rotation scope:
//                               BWH Agent <-> control plane only)
//   GCCGW_G4_TOKEN_FILE         file containing the bearer token
//   GCCGW_G4_MANIFEST_KEYS_FILE JSON { keyId: Ed25519 public key PEM }
//   GCCGW_G4_STATE_DIR          lock + applied-state directory
//   GCCGW_G4_MATERIALS_DIR      protected local material store
//   GCCGW_G4_DRY_RUN            default "true"
//   GCCGW_G4_APPLY_ENABLED      default "false"
//
// Addressing (AGT-ADDR-1): the legacy production agent keeps its
// private-address-only rule untouched. This new contract has its own
// rule, landed together with its contract tests: the base URL must be
// HTTPS; plain HTTP is accepted only for loopback development.
//
// The apply step in this slice writes the resolved materials into
// STATE_DIR/applied/<generation>/ as a demonstrable local effect. The
// production node-side config writers are an existing system and are
// NOT replaced by this slice; wiring them in is a separate gate.

import { createPublicKey } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentClient,
  createFileLock,
  createFileMaterialStore,
  createJsonStateStore,
} from "./agent-client.mjs";
import { createManifestVerifier } from "./manifest.mjs";

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function validateBaseUrl(raw) {
  const parsed = new URL(raw);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
  if (parsed.protocol === "http:" && loopback) return parsed.toString().replace(/\/$/, "");
  throw new Error("baseUrl must be https (plain http is loopback-development only)");
}

async function main() {
  const baseUrl = validateBaseUrl(requiredEnv("GCCGW_G4_BASE_URL"));
  const nodeRef = requiredEnv("GCCGW_G4_NODE_REF");
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
  await mkdir(stateDir, { recursive: true });

  const transport = {
    async fetchDesiredState({ headers }) {
      const url = new URL(`${baseUrl}/v1/agent/desired-state`);
      url.searchParams.set("nodeRef", nodeRef);
      url.searchParams.set("channelRefs", channelRefs.join(","));
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`desired-state fetch failed: HTTP ${response.status}`);
      return response.json();
    },
    async submitReceipt(receipt, { headers }) {
      const response = await fetch(`${baseUrl}/v1/agent/receipts`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(receipt),
      });
      if (!response.ok) throw new Error(`receipt submit failed: HTTP ${response.status}`);
    },
  };

  const client = createAgentClient({
    nodeRef,
    channelRefs,
    transport,
    materialStore: createFileMaterialStore(materialsDir),
    verifier: createManifestVerifier({ publicKeys }),
    stateStore: createJsonStateStore(join(stateDir, "applied-state.json")),
    lock: createFileLock(join(stateDir, "agent.lock")),
    auth: { keyId, token },
    config: {
      dryRun: process.env.GCCGW_G4_DRY_RUN !== "false",
      applyEnabled: process.env.GCCGW_G4_APPLY_ENABLED === "true",
    },
    apply: async ({ manifest, materials }) => {
      const dir = join(stateDir, "applied", manifest.generation);
      await mkdir(dir, { recursive: true });
      for (const material of materials) {
        await writeFile(join(dir, material.edgeCredentialRef), material.bytes);
      }
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

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "error", error: String(error?.message ?? error) }));
    process.exitCode = 1;
  });
}
