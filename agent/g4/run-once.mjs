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

import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { runConfiguredCycle } from "./configured-cycle.mjs";

export function validateBaseUrl(raw) {
  const parsed = new URL(raw);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
  if (parsed.protocol === "http:" && loopback) return parsed.toString().replace(/\/$/, "");
  throw new Error("baseUrl must be https (plain http is loopback-development only)");
}

const SAFE_GENERATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveAppliedGenerationDir(stateDir, generation) {
  if (
    typeof generation !== "string"
    || !SAFE_GENERATION_PATTERN.test(generation)
    || generation === "."
    || generation === ".."
  ) {
    throw new Error("generation must be a safe path segment");
  }
  const root = resolve(stateDir, "applied");
  const target = resolve(root, generation);
  const relativeTarget = relative(root, target);
  if (
    !relativeTarget
    || relativeTarget === ".."
    || relativeTarget.startsWith(`..${sep}`)
    || isAbsolute(relativeTarget)
  ) {
    throw new Error("generation resolves outside the applied state directory");
  }
  return target;
}

const SAFE_MATERIAL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("applied material path must be a real directory");
  }
  await chmod(path, 0o700);
}

export async function writeAppliedMaterials(stateDir, generation, materials) {
  const appliedRoot = resolve(stateDir, "applied");
  const generationDir = resolveAppliedGenerationDir(stateDir, generation);
  await ensurePrivateDirectory(appliedRoot);
  await ensurePrivateDirectory(generationDir);

  for (const material of materials) {
    const ref = material?.edgeCredentialRef;
    if (
      typeof ref !== "string"
      || !SAFE_MATERIAL_REF_PATTERN.test(ref)
      || ref.includes("..")
    ) {
      throw new Error("material reference must be a safe path segment");
    }
    const target = join(generationDir, ref);
    const temporary = join(generationDir, `.${ref}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, material.bytes, { flag: "wx", mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return generationDir;
}

async function main() {
  const result = await runConfiguredCycle({ validateBaseUrl, writeAppliedMaterials });
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
