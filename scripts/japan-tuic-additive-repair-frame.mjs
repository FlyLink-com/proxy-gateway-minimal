export const FRAME_SCHEMA_VERSION = "3";
export const FRAME_MAGIC = Buffer.from("GCCGWJPR3\0", "ascii");

const MAX_CONTROL_BYTES = 1024;
const MAX_ARTIFACT_BYTES = 4744340;
const MAX_FRAME_BYTES = FRAME_MAGIC.length + 8 + MAX_CONTROL_BYTES + MAX_ARTIFACT_BYTES + 1;
const HEADER_BYTES = FRAME_MAGIC.length + 8;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

const INSPECT_KEYS = ["operation", "runAttempt", "schemaVersion", "workflowCommit"];
const EXECUTION_KEYS = ["executionGateId", "executionNonce", "operation", "runAttempt", "schemaVersion", "workflowCommit"];

export class JapanTuicRepairFrameError extends Error {
  constructor(code) {
    super(code);
    this.name = "JapanTuicRepairFrameError";
    this.code = code;
  }
}

function frameError(code = "frame_invalid") {
  return new JapanTuicRepairFrameError(code);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validControlValue(control) {
  return typeof control.runAttempt === "string"
    && /^[1-9][0-9]*$/.test(control.runAttempt)
    && control.schemaVersion === FRAME_SCHEMA_VERSION
    && typeof control.workflowCommit === "string"
    && /^[0-9a-f]{40}$/.test(control.workflowCommit);
}

function artifactBuffer(value) {
  if (value === undefined) return Buffer.alloc(0);
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) throw frameError();
  return Buffer.from(value);
}

function validateArtifactShape(control, size) {
  if ((control.operation === "inspect" || control.operation === "execute") && size === 0) throw frameError();
  if (control.operation === "closeout" && size !== 0) throw frameError();
}

export function canonicalRepairControl(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.operation !== "string") {
    throw frameError();
  }

  let keys;
  if (input.operation === "inspect") keys = INSPECT_KEYS;
  else if (input.operation === "execute" || input.operation === "closeout") keys = EXECUTION_KEYS;
  else throw frameError();

  if (!hasExactKeys(input, keys) || !validControlValue(input)) throw frameError();
  if (keys === EXECUTION_KEYS && (typeof input.executionGateId !== "string"
    || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(input.executionGateId)
    || typeof input.executionNonce !== "string"
    || !/^[0-9a-f]{64}$/.test(input.executionNonce))) {
    throw frameError();
  }

  const control = {};
  for (const key of keys) control[key] = input[key];
  return Buffer.from(JSON.stringify(control), "utf8");
}

export function encodeRepairFrame({ control, artifact } = {}) {
  const controlBytes = canonicalRepairControl(control);
  const artifactBytes = artifactBuffer(artifact);
  const parsedControl = JSON.parse(controlBytes.toString("utf8"));
  validateArtifactShape(parsedControl, artifactBytes.length);
  if (controlBytes.length > MAX_CONTROL_BYTES || artifactBytes.length > MAX_ARTIFACT_BYTES) {
    throw frameError("frame_too_large");
  }

  const header = Buffer.alloc(FRAME_MAGIC.length + 8);
  FRAME_MAGIC.copy(header);
  header.writeUInt32BE(controlBytes.length, FRAME_MAGIC.length);
  header.writeUInt32BE(artifactBytes.length, FRAME_MAGIC.length + 4);
  return Buffer.concat([header, controlBytes, artifactBytes]);
}

class FrameReader {
  constructor(input) {
    if (!input || typeof input[Symbol.asyncIterator] !== "function") throw frameError();
    this.iterator = input[Symbol.asyncIterator]();
    this.pending = Buffer.alloc(0);
    this.remainingBudget = 0;
    this.trailing = false;
  }

  byteView(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    throw frameError();
  }

  async readHeader() {
    const header = Buffer.alloc(HEADER_BYTES);
    let written = 0;
    while (true) {
      const next = await this.iterator.next();
      if (next.done) return null;
      const bytes = this.byteView(next.value);
      if (bytes.length === 0) continue;
      const count = Math.min(HEADER_BYTES - written, bytes.length);
      bytes.copy(header, written, 0, count);
      written += count;
      if (written === HEADER_BYTES) return { header, remainder: bytes.subarray(count) };
    }
  }

  beginBody(remainder, budget) {
    this.remainingBudget = budget;
    this.storeBounded(remainder);
  }

  storeBounded(bytes) {
    const count = Math.min(bytes.length, this.remainingBudget);
    if (bytes.length > count) this.trailing = true;
    this.pending = count === 0 ? Buffer.alloc(0) : Buffer.from(bytes.subarray(0, count));
  }

  async loadBounded() {
    while (true) {
      const next = await this.iterator.next();
      if (next.done) return false;
      const bytes = this.byteView(next.value);
      if (bytes.length === 0) continue;
      this.storeBounded(bytes);
      return true;
    }
  }

  async readExactly(size) {
    const output = Buffer.alloc(size);
    let written = 0;
    while (written < size) {
      if (this.pending.length === 0 && !await this.loadBounded()) return null;
      const count = Math.min(size - written, this.pending.length);
      this.pending.copy(output, written, 0, count);
      this.pending = this.pending.subarray(count);
      this.remainingBudget -= count;
      written += count;
    }
    return output;
  }

  async hasSentinelByte() {
    if (this.trailing || this.pending.length > 0) return true;
    while (true) {
      const next = await this.iterator.next();
      if (next.done) return false;
      if (this.byteView(next.value).length > 0) return true;
    }
  }
}

function checkedOption(value, maximum, allowZero = false) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > maximum) throw frameError();
  return value;
}

export async function readRepairFrame(input, { expectedArtifactSize, maxControlBytes = MAX_CONTROL_BYTES } = {}) {
  try {
    const expectedSize = checkedOption(expectedArtifactSize, MAX_ARTIFACT_BYTES, true);
    const controlLimit = checkedOption(maxControlBytes, MAX_CONTROL_BYTES);
    const reader = new FrameReader(input);
    const headerInput = await reader.readHeader();
    if (!headerInput || !headerInput.header.subarray(0, FRAME_MAGIC.length).equals(FRAME_MAGIC)) throw frameError();

    const controlLength = headerInput.header.readUInt32BE(FRAME_MAGIC.length);
    const artifactLength = headerInput.header.readUInt32BE(FRAME_MAGIC.length + 4);
    if (controlLength > controlLimit || controlLength > MAX_CONTROL_BYTES || artifactLength > MAX_ARTIFACT_BYTES
      || FRAME_MAGIC.length + 8 + controlLength + artifactLength + 1 > MAX_FRAME_BYTES) {
      throw frameError("frame_too_large");
    }
    if (artifactLength !== expectedSize) throw frameError();
    reader.beginBody(headerInput.remainder, controlLength + artifactLength + 1);

    const controlBytes = await reader.readExactly(controlLength);
    const artifact = await reader.readExactly(artifactLength);
    if (!controlBytes || !artifact) throw frameError();
    if (await reader.hasSentinelByte()) throw frameError("frame_trailing_bytes");

    let control;
    try {
      control = JSON.parse(UTF8.decode(controlBytes));
    } catch {
      throw frameError();
    }
    const canonical = canonicalRepairControl(control);
    if (!canonical.equals(controlBytes)) throw frameError();
    validateArtifactShape(control, artifact.length);
    return { control, artifact };
  } catch (error) {
    if (error instanceof JapanTuicRepairFrameError) throw error;
    throw frameError();
  }
}
