#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ArtifactIngressContractError,
  safeIngressReceipt,
  validateIngressHeader
} from "./control-plane-artifact-ingress-contract.mjs";
import {
  ArtifactIngressV2ContractError,
  safeIngressV2Receipt,
  validateIngressV2Header
} from "./control-plane-artifact-ingress-v2-contract.mjs";

const MAX_HEADER_BYTES = 64 * 1024;

export class ArtifactIngressReceiveError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressReceiveError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressReceiveError(code);
}

function isSafeCandidateId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

async function assertDirectoryRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    fail("artifact_ingress_root_invalid");
  }
  const root = resolve(value);
  let metadata;
  try {
    metadata = await lstat(root);
  } catch {
    fail("artifact_ingress_root_invalid");
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail("artifact_ingress_root_invalid");
  }
  return root;
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset);
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) {
      fail("artifact_ingress_write_failed");
    }
    offset += bytesWritten;
  }
}

class ByteReader {
  #iterator;
  #buffer = Buffer.alloc(0);

  constructor(input) {
    if (!input) {
      fail("artifact_ingress_input_invalid");
    }
    if (typeof input[Symbol.asyncIterator] === "function") {
      this.#iterator = input[Symbol.asyncIterator]();
    } else if (typeof input[Symbol.iterator] === "function") {
      this.#iterator = (async function* () { yield* input; })();
    } else {
      fail("artifact_ingress_input_invalid");
    }
  }

  async #fill() {
    while (this.#buffer.length === 0) {
      const next = await this.#iterator.next();
      if (next.done) return false;
      if (!Buffer.isBuffer(next.value) && !(next.value instanceof Uint8Array)) {
        fail("artifact_ingress_input_invalid");
      }
      const chunk = Buffer.from(next.value);
      if (chunk.length > 0) this.#buffer = chunk;
    }
    return true;
  }

  async readExact(length) {
    const parts = [];
    await this.copyExact(length, async (chunk) => { parts.push(chunk); });
    return Buffer.concat(parts, length);
  }

  async copyExact(length, write) {
    if (!Number.isSafeInteger(length) || length < 0) fail("artifact_ingress_input_invalid");
    let remaining = length;
    while (remaining > 0) {
      if (!(await this.#fill())) fail("artifact_ingress_input_truncated");
      const used = Math.min(remaining, this.#buffer.length);
      const chunk = this.#buffer.subarray(0, used);
      this.#buffer = this.#buffer.subarray(used);
      await write(chunk);
      remaining -= used;
    }
  }

  async assertEnd() {
    if (this.#buffer.length > 0) fail("artifact_ingress_input_extra");
    if (await this.#fill()) fail("artifact_ingress_input_extra");
  }
}

function parseHeader(bytes) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("artifact_ingress_header_invalid");
  }
}

function validateAcceptedHeader(value, now) {
  if (value?.schemaVersion === "2") return validateIngressV2Header(value, { now });
  return validateIngressHeader(value, { now });
}

function safeAcceptedReceipt(candidateId, header, acceptedAt) {
  return header.schemaVersion === "2"
    ? safeIngressV2Receipt({ candidateId, header, acceptedAt })
    : safeIngressReceipt({ candidateId, header });
}

async function ensureMissing(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail("artifact_ingress_storage_invalid");
  }
  fail("artifact_ingress_candidate_exists");
}

async function writeReceipt(receiptRoot, receipt) {
  const path = join(receiptRoot, receipt.candidateId + ".json");
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
    await writeAll(handle, Buffer.from(JSON.stringify(receipt) + "\n", "utf8"));
    await handle.sync();
  } catch (error) {
    if (error instanceof ArtifactIngressReceiveError) throw error;
    fail("artifact_ingress_receipt_failed");
  } finally {
    await handle?.close();
  }
  await syncDirectory(receiptRoot);
}

export async function receiveArtifactIngress({
  input,
  quarantineRoot: rawQuarantineRoot,
  receiptRoot: rawReceiptRoot,
  now,
  clock = () => new Date().toISOString(),
  candidateId = randomUUID()
} = {}) {
  if (!isSafeCandidateId(candidateId)) fail("artifact_ingress_candidate_invalid");
  const quarantineRoot = await assertDirectoryRoot(rawQuarantineRoot);
  const receiptRoot = await assertDirectoryRoot(rawReceiptRoot);
  const reader = new ByteReader(input);
  let candidatePath;
  let temporaryPath;
  let claimHandle;
  let published = false;
  try {
    const headerLength = (await reader.readExact(4)).readUInt32BE(0);
    if (headerLength === 0 || headerLength > MAX_HEADER_BYTES) {
      fail("artifact_ingress_header_invalid");
    }
    const admittedAt = now ?? clock();
    const header = validateAcceptedHeader(parseHeader(await reader.readExact(headerLength)), admittedAt);
    const acceptedCandidateId = header.schemaVersion === "2" ? header.packetId : candidateId;
    candidatePath = join(quarantineRoot, acceptedCandidateId);
    temporaryPath = header.schemaVersion === "2"
      ? join(quarantineRoot, `.receiving-${acceptedCandidateId}-${randomUUID()}`)
      : join(quarantineRoot, `.receiving-${acceptedCandidateId}`);
    if (header.schemaVersion === "2") {
      const proposedClaimPath = join(receiptRoot, `.replay-${acceptedCandidateId}.json`);
      try {
        claimHandle = await open(proposedClaimPath, "wx", 0o600);
        await writeAll(claimHandle, Buffer.from(JSON.stringify({
          schemaVersion: "1",
          type: "control_plane_artifact_ingress_replay_claim",
          packetId: header.packetId,
          sourceCommit: header.sourceCommit,
          issuedAt: header.issuedAt,
          claimedAt: admittedAt,
          expiresAt: header.expiresAt,
          headerSha256: createHash("sha256")
            .update(Buffer.from(JSON.stringify(header), "utf8"))
            .digest("hex")
        }) + "\n", "utf8"));
        await claimHandle.sync();
        await syncDirectory(receiptRoot);
      } catch (error) {
        if (error?.code === "EEXIST") fail("artifact_ingress_candidate_exists");
        if (error instanceof ArtifactIngressReceiveError) throw error;
        fail("artifact_ingress_storage_invalid");
      }
    }
    await ensureMissing(candidatePath);
    await ensureMissing(temporaryPath);
    await mkdir(temporaryPath, { mode: 0o700 });

    for (const entry of header.entries) {
      const outputPath = join(temporaryPath, entry.name);
      const handle = await open(outputPath, "wx", 0o600);
      const hash = createHash("sha256");
      try {
        await reader.copyExact(entry.sizeBytes, async (chunk) => {
          hash.update(chunk);
          await writeAll(handle, chunk);
        });
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (hash.digest("hex") !== entry.sha256) {
        fail("artifact_ingress_digest_mismatch");
      }
    }
    await syncDirectory(temporaryPath);
    await reader.assertEnd();
    const acceptedAt = now ?? clock();
    if (header.schemaVersion === "2") validateIngressV2Header(header, { now: acceptedAt });
    try {
      await rename(temporaryPath, candidatePath);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) fail("artifact_ingress_candidate_exists");
      throw error;
    }
    published = true;
    await syncDirectory(quarantineRoot);
    const receipt = safeAcceptedReceipt(acceptedCandidateId, header, acceptedAt);
    await writeReceipt(receiptRoot, receipt);
    return receipt;
  } catch (error) {
    if (published && candidatePath) {
      try {
        await rm(candidatePath, { recursive: true, force: true });
        await syncDirectory(quarantineRoot);
      } catch {
        fail("artifact_ingress_storage_invalid");
      }
    }
    if (temporaryPath) await rm(temporaryPath, { recursive: true, force: true });
    if (error instanceof ArtifactIngressContractError || error instanceof ArtifactIngressV2ContractError || error instanceof ArtifactIngressReceiveError) {
      throw error;
    }
    fail("artifact_ingress_receive_failed");
  } finally {
    await claimHandle?.close().catch(() => {});
  }
}

async function syncDirectory(path) {
  if (process.platform === "win32") return;
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch {
    fail("artifact_ingress_storage_invalid");
  } finally {
    await handle?.close().catch(() => {});
  }
}

function parseReceiverArguments(argv) {
  if (!Array.isArray(argv)
    || argv.length !== 4
    || argv[0] !== "--quarantine-root"
    || argv[2] !== "--receipt-root") {
    fail("artifact_ingress_arguments_invalid");
  }
  return {
    quarantineRoot: argv[1],
    receiptRoot: argv[3]
  };
}

function safeErrorCode(error) {
  return error instanceof ArtifactIngressContractError || error instanceof ArtifactIngressV2ContractError || error instanceof ArtifactIngressReceiveError
    ? error.code
    : "artifact_ingress_receive_failed";
}

export async function runArtifactIngressReceiverCli({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  now,
  candidateId
} = {}) {
  try {
    const { quarantineRoot, receiptRoot } = parseReceiverArguments(argv);
    const receipt = await receiveArtifactIngress({
      input: stdin,
      quarantineRoot,
      receiptRoot,
      ...(now ? { now } : {}),
      ...(candidateId ? { candidateId } : {})
    });
    stdout.write(JSON.stringify(receipt) + "\n");
    return 0;
  } catch (error) {
    stderr.write(JSON.stringify({ error: safeErrorCode(error) }) + "\n");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runArtifactIngressReceiverCli();
}
