import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { types as utilTypes } from "node:util";

export const WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION =
  "wallet_first_setup_delivery_escrow_v1";
export const WALLET_FIRST_SETUP_DELIVERY_RUNTIME_ESCROW_CONTRACT =
  "wallet-first-setup-delivery-runtime-escrow/v1";
export const WALLET_FIRST_SETUP_DELIVERY_ESCROW_ADAPTER_CONTRACT =
  "wallet-first-setup-delivery-escrow-adapter/v1";

const STORE_VERSION = "wallet_first_setup_delivery_escrow_store_v1";
const LOCK_VERSION = "wallet_first_setup_delivery_escrow_lock_v1";
const ENVELOPE_PREFIX = "v1:aes-256-gcm:";
const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const RUNTIME_ID = /^[A-Za-z0-9_-]{3,128}$/;
const HANDOFF_REF = /^wfxsetup_[a-f0-9]{48}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LOCK_NONCE = /^[a-f0-9]{32}$/;
const RUNTIME_ESCROW_INSTANCES = new WeakSet();
const DELIVERY_ESCROW_INSTANCES = new WeakSet();

function escrowError(code = "wallet_first_setup_delivery_reconciliation_required") {
  const error = new Error("Wallet-first setup delivery escrow is unavailable");
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactData(value, fields, code = "wallet_first_setup_delivery_invalid") {
  try {
    if (!isPlainObject(value)) throw escrowError(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
      throw escrowError(code);
    }
    const output = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw escrowError(code);
      }
      output[field] = descriptor.value;
    }
    return Object.freeze(output);
  } catch (error) {
    if (error?.code === code) throw error;
    throw escrowError(code);
  }
}

function normalizeKey(value) {
  if (Buffer.isBuffer(value)) {
    if (value.length === 32) return Buffer.from(value);
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  if (value instanceof Uint8Array) {
    const key = Buffer.from(value);
    if (key.length === 32) return key;
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw escrowError("wallet_first_setup_delivery_invalid");
  const candidates = [];
  if (/^[a-f0-9]{64}$/i.test(text)) {
    candidates.push(Buffer.from(text, "hex"));
  }
  for (const encoding of ["base64url", "base64"]) {
    try {
      candidates.push(Buffer.from(text, encoding));
    } catch {
      // Keep the external error independent of key representation details.
    }
  }
  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) throw escrowError("wallet_first_setup_delivery_invalid");
  return Buffer.from(key);
}

function absoluteFilePath(value) {
  if (typeof value !== "string" || !value || value.trim() !== value || !isAbsolute(value)) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  return value;
}

function processUid() {
  try {
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    return Number.isSafeInteger(uid) && uid >= 0 ? uid : null;
  } catch {
    return null;
  }
}

function assertCurrentOwner(stat) {
  if (process.platform === "win32") return;
  const uid = processUid();
  if (uid !== null && stat.uid !== uid) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
}

function secureDirectoryChain(directoryPath) {
  let current = directoryPath;
  let immediate = true;
  while (true) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      throw escrowError("wallet_first_setup_delivery_invalid");
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw escrowError("wallet_first_setup_delivery_invalid");
    }
    if (process.platform !== "win32") {
      const writableByGroupOrWorld = (stat.mode & 0o022) !== 0;
      const stickyDirectory = (stat.mode & 0o1000) !== 0;
      // The direct parent is where all records, locks, and temporary files are
      // created, so it must be private to the service. A sticky shared root
      // such as /tmp is tolerable only as an ancestor of an owned 0700 child.
      if (immediate && writableByGroupOrWorld) {
        throw escrowError("wallet_first_setup_delivery_invalid");
      }
      if (!immediate && writableByGroupOrWorld && !stickyDirectory) {
        throw escrowError("wallet_first_setup_delivery_invalid");
      }
      if (immediate) assertCurrentOwner(stat);
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
    immediate = false;
  }
}

function secureEscrowPath(filePath) {
  const parent = dirname(filePath);
  try {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
  } catch {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  secureDirectoryChain(parent);
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  assertCurrentOwner(stat);
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
}

function factoryOptions(value) {
  const code = "wallet_first_setup_delivery_invalid";
  try {
    if (!isPlainObject(value)) throw escrowError(code);
    const fields = ["key", "filePath", "ivFactory"];
    const keys = Reflect.ownKeys(value);
    if (
      keys.length < 2
      || keys.length > fields.length
      || !keys.every((key) => typeof key === "string" && fields.includes(key))
      || !Object.hasOwn(value, "key")
      || !Object.hasOwn(value, "filePath")
    ) {
      throw escrowError(code);
    }
    const output = {};
    for (const field of fields) {
      if (!Object.hasOwn(value, field)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw escrowError(code);
      }
      output[field] = descriptor.value;
    }
    return Object.freeze(output);
  } catch (error) {
    if (error?.code === code) throw error;
    throw escrowError(code);
  }
}

function reference(value, code = "wallet_first_setup_delivery_invalid") {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw escrowError(code);
  }
  return value;
}

function runtimeId(value, code = "wallet_first_setup_delivery_invalid") {
  if (typeof value !== "string" || !RUNTIME_ID.test(value)) {
    throw escrowError(code);
  }
  return value;
}

function handoffRef(value, code = "wallet_first_setup_delivery_reconciliation_required") {
  if (typeof value !== "string" || !HANDOFF_REF.test(value)) {
    throw escrowError(code);
  }
  return value;
}

function digest(value, code = "wallet_first_setup_delivery_reconciliation_required") {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw escrowError(code);
  }
  return value;
}

function normalizeBinding(value, code = "wallet_first_setup_delivery_invalid") {
  const input = exactData(value, [
    "transitionRef", "effectRef", "tenantId", "artifactId"
  ], code);
  return Object.freeze({
    transitionRef: reference(input.transitionRef, code),
    effectRef: reference(input.effectRef, code),
    tenantId: runtimeId(input.tenantId, code),
    artifactId: runtimeId(input.artifactId, code)
  });
}

function bindingFromFields(value, code = "wallet_first_setup_delivery_invalid") {
  return normalizeBinding({
    transitionRef: value.transitionRef,
    effectRef: value.effectRef,
    tenantId: value.tenantId,
    artifactId: value.artifactId
  }, code);
}

function bindingDigest(binding) {
  return createHash("sha256")
    .update(
      `${WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION}\0${binding.transitionRef}\0${binding.effectRef}\0${binding.tenantId}\0${binding.artifactId}`,
      "utf8"
    )
    .digest("hex");
}

function resourceDigest(binding) {
  return createHash("sha256")
    .update(
      `${WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION}:resource\0${binding.tenantId}\0${binding.artifactId}`,
      "utf8"
    )
    .digest("hex");
}

function bindingHandoffRef(binding) {
  return `wfxsetup_${createHash("sha256")
    .update(
      `GCCWEBOS:WALLET_FIRST_SETUP_DELIVERY_HANDOFF:v1\0${binding.transitionRef}\0${binding.effectRef}\0${binding.tenantId}\0${binding.artifactId}`,
      "utf8"
    )
    .digest("hex")
    .slice(0, 48)}`;
}

function bindingSummary(binding, state) {
  return Object.freeze({
    version: WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION,
    state,
    handoffRef: bindingHandoffRef(binding),
    bindingDigest: bindingDigest(binding),
    resourceDigest: resourceDigest(binding)
  });
}

function normalizeSubscriptionUrl(value, code = "wallet_first_setup_delivery_invalid") {
  if (
    typeof value !== "string"
    || !value
    || value.trim() !== value
    || value.length > 4096
  ) {
    throw escrowError(code);
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:"
      || !parsed.hostname
      || parsed.username
      || parsed.password
      || parsed.hash
    ) {
      throw escrowError(code);
    }
  } catch (error) {
    if (error?.code === code) throw error;
    throw escrowError(code);
  }
  return value;
}

function equalMaterial(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function aadFor(summary) {
  return Buffer.from(
    `${WALLET_FIRST_SETUP_DELIVERY_ESCROW_VERSION}\0${summary.handoffRef}\0${summary.bindingDigest}`,
    "utf8"
  );
}

function protectMaterial(subscriptionUrl, summary, key, ivFactory) {
  let iv;
  try {
    iv = Buffer.from(ivFactory());
  } catch {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
  if (iv.length !== 12) {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aadFor(summary));
    const ciphertext = Buffer.concat([
      cipher.update(subscriptionUrl, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return `${ENVELOPE_PREFIX}${encode(iv)}:${encode(tag)}:${encode(ciphertext)}`;
  } catch {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
}

function unprotectMaterial(encryptedMaterial, summary, key) {
  if (typeof encryptedMaterial !== "string" || !encryptedMaterial.startsWith(ENVELOPE_PREFIX)) {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
  const parts = encryptedMaterial.split(":");
  if (parts.length !== 5 || parts[0] !== "v1" || parts[1] !== "aes-256-gcm") {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
  const iv = decode(parts[2]);
  const tag = decode(parts[3]);
  const ciphertext = decode(parts[4]);
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext || ciphertext.length === 0) {
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aadFor(summary));
    decipher.setAuthTag(tag);
    return normalizeSubscriptionUrl(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
      "wallet_first_setup_delivery_reconciliation_required"
    );
  } catch (error) {
    if (error?.code === "wallet_first_setup_delivery_reconciliation_required") throw error;
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
}

function exactArray(value, code) {
  if (
    !Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw escrowError(code);
  }
  return value;
}

function normalizeStoredRecord(value) {
  if (!isPlainObject(value)) throw escrowError("wallet_first_setup_delivery_invalid");
  const stateDescriptor = Object.getOwnPropertyDescriptor(value, "state");
  if (!stateDescriptor || !stateDescriptor.enumerable || !("value" in stateDescriptor)) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  if (stateDescriptor.value === "available") {
    const record = exactData(value, [
      "state", "handoffRef", "bindingDigest", "resourceDigest", "encryptedMaterial"
    ]);
    return Object.freeze({
      state: "available",
      handoffRef: handoffRef(record.handoffRef, "wallet_first_setup_delivery_invalid"),
      bindingDigest: digest(record.bindingDigest, "wallet_first_setup_delivery_invalid"),
      resourceDigest: digest(record.resourceDigest, "wallet_first_setup_delivery_invalid"),
      encryptedMaterial: (() => {
        if (typeof record.encryptedMaterial !== "string" || !record.encryptedMaterial.startsWith(ENVELOPE_PREFIX)) {
          throw escrowError("wallet_first_setup_delivery_invalid");
        }
        return record.encryptedMaterial;
      })()
    });
  }
  if (stateDescriptor.value === "acknowledged") {
    const record = exactData(value, ["state", "handoffRef", "bindingDigest", "resourceDigest"]);
    return Object.freeze({
      state: "acknowledged",
      handoffRef: handoffRef(record.handoffRef, "wallet_first_setup_delivery_invalid"),
      bindingDigest: digest(record.bindingDigest, "wallet_first_setup_delivery_invalid"),
      resourceDigest: digest(record.resourceDigest, "wallet_first_setup_delivery_invalid")
    });
  }
  throw escrowError("wallet_first_setup_delivery_invalid");
}

function loadRecords(filePath) {
  secureEscrowPath(filePath);
  if (!existsSync(filePath)) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  const root = exactData(parsed, ["version", "records"]);
  if (root.version !== STORE_VERSION) {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  const records = new Map();
  for (const item of exactArray(root.records, "wallet_first_setup_delivery_invalid")) {
    const record = normalizeStoredRecord(item);
    if (records.has(record.handoffRef)) {
      throw escrowError("wallet_first_setup_delivery_invalid");
    }
    records.set(record.handoffRef, record);
  }
  return records;
}

function persistedRecord(record) {
  return record.state === "available"
    ? {
      state: "available",
      handoffRef: record.handoffRef,
      bindingDigest: record.bindingDigest,
      resourceDigest: record.resourceDigest,
      encryptedMaterial: record.encryptedMaterial
    }
    : {
      state: "acknowledged",
      handoffRef: record.handoffRef,
      bindingDigest: record.bindingDigest,
      resourceDigest: record.resourceDigest
    };
}

function writeRecords(filePath, records) {
  let temporaryPath = null;
  try {
    secureEscrowPath(filePath);
    const payload = JSON.stringify({
      version: STORE_VERSION,
      records: [...records.values()]
        .sort((left, right) => left.handoffRef.localeCompare(right.handoffRef))
        .map(persistedRecord)
    });
    temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    writeFileSync(temporaryPath, `${payload}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, filePath);
    temporaryPath = null;
    chmodSync(filePath, 0o600);
    secureEscrowPath(filePath);
  } catch {
    if (temporaryPath) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // A failed best-effort cleanup must not obscure the failed persistence.
      }
    }
    throw escrowError("wallet_first_setup_delivery_reconciliation_required");
  }
}

function lockOwner() {
  return Object.freeze({
    version: LOCK_VERSION,
    pid: process.pid,
    nonce: randomBytes(16).toString("hex")
  });
}

function normalizeLockOwner(value) {
  const input = exactData(
    value,
    ["version", "pid", "nonce"],
    "wallet_first_setup_delivery_unavailable"
  );
  if (
    input.version !== LOCK_VERSION
    || !Number.isSafeInteger(input.pid)
    || input.pid < 1
    || typeof input.nonce !== "string"
    || !LOCK_NONCE.test(input.nonce)
  ) {
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
  return Object.freeze({
    version: LOCK_VERSION,
    pid: input.pid,
    nonce: input.nonce
  });
}

function readLockOwner(lockPath) {
  let stat;
  try {
    stat = lstatSync(lockPath);
  } catch {
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
  assertCurrentOwner(stat);
  try {
    return normalizeLockOwner(JSON.parse(readFileSync(lockPath, "utf8")));
  } catch (error) {
    if (error?.code === "wallet_first_setup_delivery_unavailable") throw error;
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
}

function isLiveLockOwner(owner) {
  if (owner.pid === process.pid) return true;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    // Permission failures are treated as live. Only a definitive missing PID
    // can be reclaimed; a second live process is never evicted.
    return error?.code !== "ESRCH";
  }
}

function openExclusiveLock(lockPath) {
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    throw error;
  }
  const owner = lockOwner();
  try {
    writeFileSync(descriptor, `${JSON.stringify(owner)}\n`, { encoding: "utf8" });
    chmodSync(lockPath, 0o600);
    return Object.freeze({ lockPath, descriptor, owner });
  } catch {
    try {
      closeSync(descriptor);
    } catch {
      // The failed lock is still removed below if possible.
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // A malformed lock is fail-closed on the next opener.
    }
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
}

function releaseLock(lock) {
  try {
    closeSync(lock.descriptor);
  } catch {
    // Continue to best-effort unlink the process-owned marker.
  }
  try {
    const owner = readLockOwner(lock.lockPath);
    if (owner.pid !== lock.owner.pid || owner.nonce !== lock.owner.nonce) return;
    unlinkSync(lock.lockPath);
  } catch {
    // A changed or unreadable marker is deliberately left for fail-closed
    // recovery; this closer must never remove another writer's lock.
  }
}

function recoveryLockPath(lockPath) {
  return `${lockPath}.recovery`;
}

function recoverDeadWriterLock(lockPath) {
  let recoveryLock;
  try {
    recoveryLock = openExclusiveLock(recoveryLockPath(lockPath));
  } catch {
    throw escrowError("wallet_first_setup_delivery_unavailable");
  }
  try {
    const owner = readLockOwner(lockPath);
    if (isLiveLockOwner(owner)) {
      throw escrowError("wallet_first_setup_delivery_unavailable");
    }
    const stalePath = `${lockPath}.stale.${owner.nonce}.${randomBytes(8).toString("hex")}`;
    try {
      // The short recovery mutex prevents supported peers from opening the
      // missing writer path while this stale owner is moved aside. Renaming is
      // atomic, so a contender that already recovered it causes this operation
      // to fail rather than deleting a live writer lock.
      renameSync(lockPath, stalePath);
      unlinkSync(stalePath);
    } catch {
      throw escrowError("wallet_first_setup_delivery_unavailable");
    }
    try {
      return openExclusiveLock(lockPath);
    } catch {
      throw escrowError("wallet_first_setup_delivery_unavailable");
    }
  } finally {
    releaseLock(recoveryLock);
  }
}

function acquireWriterLock(filePath) {
  const lockPath = `${filePath}.lock`;
  try {
    secureEscrowPath(filePath);
    return openExclusiveLock(lockPath);
  } catch (error) {
    if (error?.code !== "EEXIST") {
      if (error?.code === "wallet_first_setup_delivery_invalid") throw error;
      if (error?.code === "wallet_first_setup_delivery_unavailable") throw error;
      throw escrowError("wallet_first_setup_delivery_unavailable");
    }
  }
  return recoverDeadWriterLock(lockPath);
}

function snapshotBrandedAdapter(adapter, { instances, contract, methods }) {
  const code = "wallet_first_setup_delivery_invalid";
  try {
    if (
      !adapter
      || (typeof adapter !== "object" && typeof adapter !== "function")
      || utilTypes.isProxy(adapter)
      || !instances.has(adapter)
    ) {
      throw escrowError(code);
    }
    const expected = ["contract", ...methods];
    const keys = Reflect.ownKeys(adapter);
    if (keys.length !== expected.length || !expected.every((field) => keys.includes(field))) {
      throw escrowError(code);
    }
    const contractDescriptor = Object.getOwnPropertyDescriptor(adapter, "contract");
    if (
      !contractDescriptor
      || !contractDescriptor.enumerable
      || !("value" in contractDescriptor)
      || contractDescriptor.value !== contract
    ) {
      throw escrowError(code);
    }
    const snapshot = {};
    for (const method of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(adapter, method);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function") {
        throw escrowError(code);
      }
      snapshot[method] = (...args) => descriptor.value.call(adapter, ...args);
    }
    return Object.freeze(snapshot);
  } catch (error) {
    if (error?.code === code) throw error;
    throw escrowError(code);
  }
}

export function snapshotWalletFirstSetupDeliveryRuntimeEscrow(value) {
  return snapshotBrandedAdapter(value, {
    instances: RUNTIME_ESCROW_INSTANCES,
    contract: WALLET_FIRST_SETUP_DELIVERY_RUNTIME_ESCROW_CONTRACT,
    methods: ["captureInitialSetupDelivery", "verifyInitialSetupDelivery"]
  });
}

export function snapshotWalletFirstSetupDeliveryEscrowAdapter(value) {
  return snapshotBrandedAdapter(value, {
    instances: DELIVERY_ESCROW_INSTANCES,
    contract: WALLET_FIRST_SETUP_DELIVERY_ESCROW_ADAPTER_CONTRACT,
    methods: [
      "getSetupDeliverySummary",
      "releaseSetupDelivery",
      "acknowledgeSetupDelivery"
    ]
  });
}

/**
 * Holds only encrypted setup delivery material outside the control database.
 * A deterministic handoff reference is bound to the transition/effect and the
 * concrete runtime tenant/artifact.  The delivery half can reveal material
 * only after its caller has independently proved the account and control-chain
 * binding; acknowledging delivery atomically replaces ciphertext with a safe
 * tombstone so retries cannot claim an unverified deletion succeeded.
 */
export function createWalletFirstSetupDeliveryEscrow(options = {}) {
  const input = factoryOptions(options);
  const key = normalizeKey(input.key);
  const filePath = absoluteFilePath(input.filePath);
  const ivFactory = input.ivFactory === undefined ? () => randomBytes(12) : input.ivFactory;
  if (typeof ivFactory !== "function") {
    throw escrowError("wallet_first_setup_delivery_invalid");
  }
  const writerLock = acquireWriterLock(filePath);
  let records;
  try {
    records = loadRecords(filePath);
  } catch (error) {
    releaseLock(writerLock);
    throw error;
  }
  let closed = false;

  function assertOpen() {
    if (closed) {
      throw escrowError("wallet_first_setup_delivery_reconciliation_required");
    }
  }

  function summaryForBinding(binding) {
    assertOpen();
    const summary = bindingSummary(binding, "available");
    const record = records.get(summary.handoffRef);
    if (
      !record
      || record.bindingDigest !== summary.bindingDigest
      || record.resourceDigest !== summary.resourceDigest
    ) {
      throw escrowError("wallet_first_setup_delivery_reconciliation_required");
    }
    if (record.state === "acknowledged") {
      return Object.freeze({ ...summary, state: "acknowledged" });
    }
    unprotectMaterial(record.encryptedMaterial, summary, key);
    return summary;
  }

  function resolveAvailableRecord(binding, suppliedHandoffRef = null) {
    assertOpen();
    const summary = bindingSummary(binding, "available");
    if (suppliedHandoffRef !== null && handoffRef(suppliedHandoffRef) !== summary.handoffRef) {
      throw escrowError("wallet_first_setup_delivery_reconciliation_required");
    }
    const record = records.get(summary.handoffRef);
    if (
      !record
      || record.state !== "available"
      || record.bindingDigest !== summary.bindingDigest
      || record.resourceDigest !== summary.resourceDigest
    ) {
      throw escrowError("wallet_first_setup_delivery_reconciliation_required");
    }
    const subscriptionUrl = unprotectMaterial(record.encryptedMaterial, summary, key);
    return Object.freeze({ summary, record, subscriptionUrl });
  }

  const runtimeEscrow = Object.freeze({
    contract: WALLET_FIRST_SETUP_DELIVERY_RUNTIME_ESCROW_CONTRACT,
    captureInitialSetupDelivery(value) {
      assertOpen();
      const input = exactData(value, [
        "transitionRef", "effectRef", "tenantId", "artifactId", "subscriptionUrl"
      ], "wallet_first_setup_delivery_invalid");
      const binding = bindingFromFields(input);
      const subscriptionUrl = normalizeSubscriptionUrl(input.subscriptionUrl);
      const summary = bindingSummary(binding, "available");
      const existing = records.get(summary.handoffRef);
      if (existing) {
        if (
          existing.bindingDigest !== summary.bindingDigest
          || existing.resourceDigest !== summary.resourceDigest
          || existing.state !== "available"
        ) {
          throw escrowError("wallet_first_setup_delivery_reconciliation_required");
        }
        const existingMaterial = unprotectMaterial(existing.encryptedMaterial, summary, key);
        if (!equalMaterial(existingMaterial, subscriptionUrl)) {
          throw escrowError("wallet_first_setup_delivery_reconciliation_required");
        }
        return summary;
      }
      const next = new Map(records);
      next.set(summary.handoffRef, Object.freeze({
        state: "available",
        handoffRef: summary.handoffRef,
        bindingDigest: summary.bindingDigest,
        resourceDigest: summary.resourceDigest,
        encryptedMaterial: protectMaterial(subscriptionUrl, summary, key, ivFactory)
      }));
      writeRecords(filePath, next);
      records = next;
      return summary;
    },
    verifyInitialSetupDelivery(value) {
      assertOpen();
      return summaryForBinding(normalizeBinding(value));
    }
  });

  const deliveryEscrow = Object.freeze({
    contract: WALLET_FIRST_SETUP_DELIVERY_ESCROW_ADAPTER_CONTRACT,
    getSetupDeliverySummary(value) {
      assertOpen();
      return summaryForBinding(normalizeBinding(value));
    },
    releaseSetupDelivery(value) {
      assertOpen();
      const input = exactData(value, [
        "handoffRef", "transitionRef", "effectRef", "tenantId", "artifactId"
      ], "wallet_first_setup_delivery_invalid");
      const resolved = resolveAvailableRecord(bindingFromFields(input), input.handoffRef);
      return Object.freeze({
        handoffRef: resolved.summary.handoffRef,
        subscriptionUrl: resolved.subscriptionUrl
      });
    },
    acknowledgeSetupDelivery(value) {
      assertOpen();
      const input = exactData(value, [
        "handoffRef", "transitionRef", "effectRef", "tenantId", "artifactId"
      ], "wallet_first_setup_delivery_invalid");
      const binding = bindingFromFields(input);
      const summary = bindingSummary(binding, "available");
      if (handoffRef(input.handoffRef) !== summary.handoffRef) {
        throw escrowError("wallet_first_setup_delivery_reconciliation_required");
      }
      const existing = records.get(summary.handoffRef);
      if (
        !existing
        || existing.bindingDigest !== summary.bindingDigest
        || existing.resourceDigest !== summary.resourceDigest
      ) {
        throw escrowError("wallet_first_setup_delivery_reconciliation_required");
      }
      if (existing.state === "acknowledged") {
        return Object.freeze({ handoffRef: summary.handoffRef, status: "acknowledged" });
      }
      // Authenticate and parse the ciphertext before discarding it. A broken
      // record remains in place for reconciliation instead of being mistaken
      // for a successful secure cleanup.
      unprotectMaterial(existing.encryptedMaterial, summary, key);
      const next = new Map(records);
      next.set(summary.handoffRef, Object.freeze({
        state: "acknowledged",
        handoffRef: summary.handoffRef,
        bindingDigest: summary.bindingDigest,
        resourceDigest: summary.resourceDigest
      }));
      writeRecords(filePath, next);
      records = next;
      return Object.freeze({ handoffRef: summary.handoffRef, status: "acknowledged" });
    }
  });

  RUNTIME_ESCROW_INSTANCES.add(runtimeEscrow);
  DELIVERY_ESCROW_INSTANCES.add(deliveryEscrow);
  return Object.freeze({
    runtimeEscrow,
    deliveryEscrow,
    close() {
      if (closed) return;
      closed = true;
      releaseLock(writerLock);
    }
  });
}
