import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS } from "../../../scripts/lib/bwh-supply-constants.mjs";

// Planner and desired-state store only. applyBwhBandwidthSchema is the only
// table creator; nothing here runs tc, ip, or a host command. Applied is a
// readback result, never a command exit code.
const SERVICE_NAMES = Object.freeze([
  SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS.protocols.vless,
  SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS.protocols.hy2,
  SUBSCRIPTION_DISTRIBUTION_SUPPLY_UNITS.protocols.tuic
]);
if (SERVICE_NAMES.length !== 3 || SERVICE_NAMES.some((name, index) => name !== [
  "xray-vless-reality.service", "hysteria2.service", "mihomo-tuic.service"
][index])) {
  throw new Error("BWH shared bandwidth service allowlist drifted");
}

export const BWH_SHARED_BANDWIDTH_PROFILE = Object.freeze({
  id: "bwh-us-v1",
  services: SERVICE_NAMES,
  ifbName: "ifb-gccgw-bwh",
  markValue: 0xb100,
  markMask: 0xff00,
  htbMajor: 1,
  htbClass: 0x10,
  minEnabledBps: 100000,
  maxBps: 10000000000,
  excludedClasses: Object.freeze(["ssh", "sshd", "admin", "portal", "subscription", "control", "metering"])
});

const PROFILE = BWH_SHARED_BANDWIDTH_PROFILE;
const IFB = PROFILE.ifbName;
const DIRECTION_CLASS = Object.freeze({
  inbound: `${PROFILE.htbMajor}:${PROFILE.htbClass.toString(16)}`,
  outbound: `${PROFILE.htbMajor}:${(PROFILE.htbClass + 1).toString(16)}`
});
const QDISC_HANDLE = `${PROFILE.htbMajor}:`;
const MARK_TOKEN = `0x${PROFILE.markValue.toString(16)}`;
const MASK_TOKEN = `0x${PROFILE.markMask.toString(16)}`;
const MBPS_TEXT = /^\d{1,5}(\.\d)?$/;
const INTERFACE_NAME = /^[a-z][a-z0-9._:-]{0,14}$/;
const REVISION = /^[a-f0-9]{64}$/;
const STATES = new Set(["desired", "applying", "applied", "failed", "unknown"]);
const ADMIN_KEYS = ["bandwidthRevision", "inboundEnabled", "outboundEnabled", "inboundMbps", "outboundMbps"];
const FIXED_ARGV = new Set([
  "ip", "link", "add", "del", "set", "up", "type", "ifb",
  "tc", "qdisc", "class", "filter", "dev", "root", "handle", "parent", "classid", "htb", "rate",
  IFB, QDISC_HANDLE, DIRECTION_CLASS.inbound, DIRECTION_CLASS.outbound, MARK_TOKEN, MASK_TOKEN
]);
const ATTEMPT_NAME = "bwh-bandwidth-attempt.json";
const LOCK_NAME = "bwh-bandwidth.lock";
const MANAGEMENT_WORD = /ssh|admin|portal|subscription|control|meter|systemctl|cgroup|sudo|nginx|bash/i;

function fail(code) {
  return Object.assign(new Error("BWH shared bandwidth rejected"), { code });
}
function exact(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function mbpsTextToBps(value) {
  if (typeof value !== "string" || !MBPS_TEXT.test(value)) throw fail("bwh_bandwidth_invalid");
  const dot = value.indexOf(".");
  const whole = dot === -1 ? value : value.slice(0, dot);
  const fraction = dot === -1 ? "0" : value.slice(dot + 1);
  if (fraction.length !== 1) throw fail("bwh_bandwidth_invalid");
  let wholeInt = 0n;
  for (const character of whole) wholeInt = wholeInt * 10n + BigInt(character.charCodeAt(0) - 48);
  const bps = wholeInt * 1000000n + BigInt(fraction.charCodeAt(0) - 48) * 100000n;
  if (bps < BigInt(PROFILE.minEnabledBps) || bps > BigInt(PROFILE.maxBps)) throw fail("bwh_bandwidth_invalid");
  return Number(bps);
}

function bpsToMbpsText(bps) {
  if (!Number.isSafeInteger(bps) || bps < PROFILE.minEnabledBps || bps > PROFILE.maxBps) throw fail("bwh_bandwidth_invalid");
  const whole = Math.trunc(bps / 1000000);
  const fraction = Math.trunc((bps % 1000000) / 100000);
  if (whole * 1000000 + fraction * 100000 !== bps) throw fail("bwh_bandwidth_invalid");
  return fraction === 0 ? String(whole) : `${whole}.${fraction}`;
}

function directionFromParts(enabled, mbps) {
  if (typeof enabled !== "boolean") throw fail("bwh_bandwidth_invalid");
  if (enabled === false) {
    if (typeof mbps !== "string" || mbps.length > 16) throw fail("bwh_bandwidth_invalid");
    return { enabled: false, bps: null };
  }
  return { enabled: true, bps: mbpsTextToBps(mbps) };
}

function assertDirection(value) {
  if (!exact(value, ["enabled", "bps"]) || typeof value.enabled !== "boolean") throw fail("bwh_bandwidth_invalid");
  if (value.enabled === false) {
    if (value.bps !== null) throw fail("bwh_bandwidth_invalid");
    return { enabled: false, bps: null };
  }
  if (!Number.isSafeInteger(value.bps) || value.bps < PROFILE.minEnabledBps || value.bps > PROFILE.maxBps) {
    throw fail("bwh_bandwidth_invalid");
  }
  return { enabled: true, bps: value.bps };
}

export function normalizeBandwidthPolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("bwh_bandwidth_invalid");
  if (Object.hasOwn(input, "inboundEnabled") || Object.hasOwn(input, "bandwidthRevision")) {
    if (!exact(input, ADMIN_KEYS) && !exact(input, ADMIN_KEYS.slice(1))) throw fail("bwh_bandwidth_invalid");
    return {
      inbound: directionFromParts(input.inboundEnabled, input.inboundMbps),
      outbound: directionFromParts(input.outboundEnabled, input.outboundMbps)
    };
  }
  if (!exact(input, ["inbound", "outbound"])) throw fail("bwh_bandwidth_invalid");
  return { inbound: assertDirection(input.inbound), outbound: assertDirection(input.outbound) };
}

function canonicalPolicy(policy) {
  return JSON.stringify({
    profileId: PROFILE.id,
    inbound: { enabled: policy.inbound.enabled, bps: policy.inbound.bps },
    outbound: { enabled: policy.outbound.enabled, bps: policy.outbound.bps }
  });
}

export function revisionForBandwidthPolicy(policy) {
  const normalized = normalizeBandwidthPolicy(policy);
  return createHash("sha256").update(canonicalPolicy(normalized)).digest("hex");
}

function emptyPolicy() {
  return { inbound: { enabled: false, bps: null }, outbound: { enabled: false, bps: null } };
}

export function loadOperatorInterfaceName(value) {
  if (typeof value !== "string" || !INTERFACE_NAME.test(value)) throw fail("bwh_bandwidth_invalid");
  return value;
}

function assertArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 2 || argv.length > 16) throw fail("bwh_bandwidth_invalid");
  for (const token of argv) {
    if (typeof token !== "string" || token.length > 32 || token.includes("/") || token.includes("\\") || MANAGEMENT_WORD.test(token)) {
      throw fail("bwh_bandwidth_invalid");
    }
    if (FIXED_ARGV.has(token)) continue;
    if (!/^\d{6,11}$/.test(token)) throw fail("bwh_bandwidth_invalid");
    const bps = Number(token);
    if (!Number.isSafeInteger(bps) || bps < PROFILE.minEnabledBps || bps > PROFILE.maxBps) throw fail("bwh_bandwidth_invalid");
  }
}

function step(id, argv, direction = null) {
  assertArgv(argv);
  return { id, direction, shell: false, argv };
}

export function rollbackOwnedSteps() {
  return [
    step("del-filter", ["tc", "filter", "del", "dev", IFB, "parent", QDISC_HANDLE, "handle", MARK_TOKEN]),
    step("del-class-outbound", ["tc", "class", "del", "dev", IFB, "classid", DIRECTION_CLASS.outbound]),
    step("del-class-inbound", ["tc", "class", "del", "dev", IFB, "classid", DIRECTION_CLASS.inbound]),
    step("del-qdisc", ["tc", "qdisc", "del", "dev", IFB, "handle", QDISC_HANDLE]),
    step("del-ifb", ["ip", "link", "del", IFB])
  ];
}

function createKey(item) {
  const argv = item.argv;
  if (argv[0] === "ip" && argv.includes("add")) return `link:${IFB}`;
  if (argv.includes("qdisc") && argv.includes("add")) return `qdisc:${IFB}:${QDISC_HANDLE}`;
  if (argv.includes("class") && argv.includes("add")) return `class:${IFB}:${argv[argv.indexOf("classid") + 1]}`;
  return null;
}

function assertUniqueCreates(steps) {
  const seen = new Set();
  for (const item of steps) {
    const key = createKey(item);
    if (!key) continue;
    if (seen.has(key)) throw fail("bwh_bandwidth_plan_conflict");
    seen.add(key);
  }
}

export function plan(policy, interfaceName) {
  const normalized = normalizeBandwidthPolicy(policy);
  const acceptedInterface = loadOperatorInterfaceName(interfaceName);
  const steps = [];
  const rates = [];
  if (normalized.inbound.enabled) rates.push(["inbound-rate", "inbound", normalized.inbound.bps]);
  if (normalized.outbound.enabled) rates.push(["outbound-rate", "outbound", normalized.outbound.bps]);
  if (rates.length > 0) {
    steps.push(step("ifb-add", ["ip", "link", "add", IFB, "type", "ifb"]));
    steps.push(step("ifb-up", ["ip", "link", "set", IFB, "up"]));
    // Root qdisc is added only on the IFB this profile creates, never on the operator NIC.
    steps.push(step("htb-qdisc", ["tc", "qdisc", "add", "dev", IFB, "root", "handle", QDISC_HANDLE, "htb"]));
    for (const [id, direction, bps] of rates) {
      steps.push(step(id, [
        "tc", "class", "add", "dev", IFB, "parent", QDISC_HANDLE, "classid", DIRECTION_CLASS[direction], "htb", "rate", String(bps)
      ], direction));
    }
  }
  assertUniqueCreates(steps);
  for (const planned of steps) {
    if (planned.shell !== false || planned.argv.includes(acceptedInterface)) throw fail("bwh_bandwidth_invalid");
  }
  return {
    profileId: PROFILE.id,
    interfaceName: acceptedInterface,
    shell: false,
    classificationAttached: false,
    proxyServices: PROFILE.services,
    excludedClasses: PROFILE.excludedClasses,
    markValue: PROFILE.markValue,
    markMask: PROFILE.markMask,
    inbound: normalized.inbound,
    outbound: normalized.outbound,
    steps
  };
}

export function applyBwhBandwidthSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bwh_shared_bandwidth_desired (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      profile_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('desired','applying','applied','failed','unknown')),
      inbound_enabled INTEGER NOT NULL CHECK (inbound_enabled IN (0, 1)),
      inbound_bps INTEGER,
      outbound_enabled INTEGER NOT NULL CHECK (outbound_enabled IN (0, 1)),
      outbound_bps INTEGER,
      reason TEXT,
      classification_proven INTEGER NOT NULL DEFAULT 0 CHECK (classification_proven IN (0, 1)),
      management_exempt_proven INTEGER NOT NULL DEFAULT 0 CHECK (management_exempt_proven IN (0, 1)),
      proven_inbound_bps INTEGER,
      proven_outbound_bps INTEGER
    )
  `);
}

function readRow(db) {
  return db.prepare("SELECT * FROM bwh_shared_bandwidth_desired WHERE singleton = 1").get() ?? null;
}

function writeRow(db, policy, revision, status, reason, proof = null) {
  db.prepare(`
    INSERT INTO bwh_shared_bandwidth_desired (
      singleton, profile_id, revision, status, inbound_enabled, inbound_bps, outbound_enabled, outbound_bps, reason,
      classification_proven, management_exempt_proven, proven_inbound_bps, proven_outbound_bps
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      profile_id = excluded.profile_id,
      revision = excluded.revision,
      status = excluded.status,
      inbound_enabled = excluded.inbound_enabled,
      inbound_bps = excluded.inbound_bps,
      outbound_enabled = excluded.outbound_enabled,
      outbound_bps = excluded.outbound_bps,
      reason = excluded.reason,
      classification_proven = excluded.classification_proven,
      management_exempt_proven = excluded.management_exempt_proven,
      proven_inbound_bps = excluded.proven_inbound_bps,
      proven_outbound_bps = excluded.proven_outbound_bps
  `).run(
    PROFILE.id, revision, status,
    policy.inbound.enabled ? 1 : 0, policy.inbound.bps,
    policy.outbound.enabled ? 1 : 0, policy.outbound.bps,
    reason,
    proof?.classificationProven === true ? 1 : 0,
    proof?.managementExemptProven === true ? 1 : 0,
    proof ? (proof.inboundBps ?? null) : null,
    proof ? (proof.outboundBps ?? null) : null
  );
}

function policyFromRow(row) {
  return {
    inbound: { enabled: row.inbound_enabled === 1, bps: row.inbound_enabled === 1 ? row.inbound_bps : null },
    outbound: { enabled: row.outbound_enabled === 1, bps: row.outbound_enabled === 1 ? row.outbound_bps : null }
  };
}

function storedPolicyValid(row) {
  try {
    const policy = policyFromRow(row);
    if (row.inbound_enabled === 1 && row.inbound_bps === null) return false;
    if (row.outbound_enabled === 1 && row.outbound_bps === null) return false;
    if (row.inbound_enabled === 0 && row.inbound_bps !== null) return false;
    if (row.outbound_enabled === 0 && row.outbound_bps !== null) return false;
    normalizeBandwidthPolicy(policy);
    return row.profile_id === PROFILE.id && REVISION.test(row.revision) && STATES.has(row.status);
  } catch {
    return false;
  }
}

function proofsMatch(row) {
  if (!storedPolicyValid(row) || row.classification_proven !== 1 || row.management_exempt_proven !== 1) return false;
  const inboundOk = row.inbound_enabled === 1 ? row.proven_inbound_bps === row.inbound_bps : row.proven_inbound_bps === null;
  const outboundOk = row.outbound_enabled === 1 ? row.proven_outbound_bps === row.outbound_bps : row.proven_outbound_bps === null;
  return inboundOk && outboundOk;
}

function project(row) {
  if (!row) {
    const policy = emptyPolicy();
    return {
      revision: revisionForBandwidthPolicy(policy),
      state: "desired",
      inboundEnabled: false,
      outboundEnabled: false,
      inboundMbps: null,
      outboundMbps: null,
      reason: null
    };
  }
  let state = row.status;
  let reason = row.reason ?? null;
  if (state === "applied" && !proofsMatch(row)) {
    state = "failed";
    reason = "classification_unproven";
  }
  const inboundEnabled = row.inbound_enabled === 1;
  const outboundEnabled = row.outbound_enabled === 1;
  return {
    revision: row.revision,
    state,
    inboundEnabled,
    outboundEnabled,
    inboundMbps: inboundEnabled && Number.isSafeInteger(row.inbound_bps) ? safeMbps(row.inbound_bps) : null,
    outboundMbps: outboundEnabled && Number.isSafeInteger(row.outbound_bps) ? safeMbps(row.outbound_bps) : null,
    reason
  };
}

function safeMbps(bps) {
  try { return bpsToMbpsText(bps); } catch { return null; }
}

function setStatus(db, status, reason, proof = null) {
  const row = readRow(db);
  if (!row) {
    const policy = emptyPolicy();
    writeRow(db, policy, revisionForBandwidthPolicy(policy), status, reason, proof);
    return;
  }
  let policy;
  try { policy = normalizeBandwidthPolicy(policyFromRow(row)); } catch { policy = null; }
  if (!policy) {
    db.prepare(`UPDATE bwh_shared_bandwidth_desired
      SET status = ?, reason = ?, classification_proven = 0, management_exempt_proven = 0,
          proven_inbound_bps = NULL, proven_outbound_bps = NULL
      WHERE singleton = 1`).run(status, reason);
    return;
  }
  writeRow(db, policy, row.revision, status, reason, proof);
}

export function readBwhBandwidth(db) {
  return project(readRow(db));
}

export function saveDesired(db, policy, expectedRevision) {
  const normalized = normalizeBandwidthPolicy(policy);
  if (typeof expectedRevision !== "string" || !REVISION.test(expectedRevision)) throw fail("bwh_bandwidth_invalid");
  const nextRevision = revisionForBandwidthPolicy(normalized);
  const commit = db.transaction(() => {
    const row = readRow(db);
    if (row?.status === "unknown" || row?.status === "applying") throw fail("bwh_bandwidth_conflict");
    const currentRevision = row ? row.revision : revisionForBandwidthPolicy(emptyPolicy());
    if (currentRevision !== expectedRevision) throw fail("bwh_bandwidth_conflict");
    writeRow(db, normalized, nextRevision, "desired", null, null);
  });
  commit();
  return readBwhBandwidth(db);
}

export function saveFromAdmin(db, body) {
  if (!exact(body, ADMIN_KEYS)) throw fail("bwh_bandwidth_invalid");
  return saveDesired(db, body, body.bandwidthRevision);
}

function protectedDirectory(directory) {
  if (typeof directory !== "string" || !isAbsolute(directory)) throw fail("bwh_bandwidth_invalid");
  let info;
  try { info = lstatSync(directory); } catch { throw fail("bwh_bandwidth_invalid"); }
  const key = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  if (info.isSymbolicLink() || !info.isDirectory() || key(realpathSync(directory)) !== key(resolve(directory))) {
    throw fail("bwh_bandwidth_invalid");
  }
}

function attemptPath(directory) {
  return join(directory, ATTEMPT_NAME);
}

function writeAttempt(directory, attempt) {
  const target = attemptPath(directory);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(attempt)}\n`);
  rmSync(target, { force: true });
  renameSync(temporary, target);
}

export function readBandwidthAttempt(directory) {
  protectedDirectory(directory);
  let parsed;
  try { parsed = JSON.parse(readFileSync(attemptPath(directory), "utf8")); } catch { throw fail("bwh_bandwidth_invalid"); }
  if (!parsed || parsed.kind !== "bwh-bandwidth-attempt" || typeof parsed.revision !== "string" || !REVISION.test(parsed.revision)
    || !Array.isArray(parsed.steps) || parsed.steps.length > 16) throw fail("bwh_bandwidth_invalid");
  return {
    revision: parsed.revision,
    stopped: typeof parsed.stopped === "string" ? parsed.stopped : null,
    steps: parsed.steps.map((item) => {
      if (!item || typeof item.id !== "string" || item.id.length < 1 || item.id.length > 64) throw fail("bwh_bandwidth_invalid");
      if (!(item.direction === null || typeof item.direction === "string")) throw fail("bwh_bandwidth_invalid");
      if (!["pending", "intended", "done"].includes(item.state)) throw fail("bwh_bandwidth_invalid");
      return { id: item.id, direction: item.direction, state: item.state };
    })
  };
}

function incompleteAttempt(attempt) {
  return attempt.steps.some((item) => item.state === "intended") && attempt.steps.some((item) => item.state === "pending");
}

async function withBandwidthProcessLock(directory, callback) {
  protectedDirectory(directory);
  const lock = join(directory, LOCK_NAME);
  try { mkdirSync(lock, { mode: 0o700 }); } catch { throw fail("bwh_bandwidth_locked"); }
  try { return await callback(); } finally { rmdirSync(lock); }
}

function directionReceiptMatches(enabled, desiredBps, actual) {
  if (enabled) return actual === desiredBps;
  return actual === null;
}

function receiptProves(receipt, policy) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  if (receipt.classificationProven !== true || receipt.managementExemptProven !== true) return false;
  return directionReceiptMatches(policy.inbound.enabled, policy.inbound.bps, receipt.inboundBps)
    && directionReceiptMatches(policy.outbound.enabled, policy.outbound.bps, receipt.outboundBps);
}

export async function applyPlan({ db, run, readback, interfaceName, lockDirectory, afterLock, interruptAfter } = {}) {
  const existing = readRow(db);
  if (existing?.status === "unknown") throw fail("bwh_bandwidth_conflict");
  let acceptedInterface = null;
  try {
    acceptedInterface = loadOperatorInterfaceName(interfaceName);
  } catch {
    setStatus(db, "failed", "interface_unproven");
    return readBwhBandwidth(db);
  }
  const row = readRow(db);
  const policy = row ? policyFromRow(row) : emptyPolicy();
  let normalized;
  try { normalized = normalizeBandwidthPolicy(policy); } catch {
    setStatus(db, "failed", "policy_invalid");
    return readBwhBandwidth(db);
  }
  if (row && !storedPolicyValid(row)) {
    setStatus(db, "failed", "policy_invalid");
    return readBwhBandwidth(db);
  }
  let planned;
  try { planned = plan(normalized, acceptedInterface); } catch {
    setStatus(db, "failed", "policy_invalid");
    return readBwhBandwidth(db);
  }
  // The directory lock is the cross-process exclusion. The status column is not.
  if (typeof lockDirectory !== "string") throw fail("bwh_bandwidth_lock_required");
  return withBandwidthProcessLock(lockDirectory, async () => {
    const revision = row ? row.revision : revisionForBandwidthPolicy(normalized);
    if (afterLock !== undefined && typeof afterLock !== "function") throw fail("bwh_bandwidth_invalid");
    if (interruptAfter !== undefined && (!Number.isSafeInteger(interruptAfter) || interruptAfter < 0)) {
      throw fail("bwh_bandwidth_invalid");
    }
    if (typeof afterLock === "function") await afterLock({ revision });
    const current = readRow(db);
    const currentRevision = current ? current.revision : revisionForBandwidthPolicy(emptyPolicy());
    if (currentRevision !== revision) throw fail("bwh_bandwidth_conflict");
    let prior = null;
    try { prior = readBandwidthAttempt(lockDirectory); } catch { prior = null; }
    if (prior && incompleteAttempt(prior)) {
      if (planned.classificationAttached !== true) {
        setStatus(db, "failed", "classification_unproven");
        return readBwhBandwidth(db);
      }
      throw fail("bwh_bandwidth_attempt_incomplete");
    }
    const steps = planned.steps.map((item) => ({ id: item.id, direction: item.direction, state: "pending" }));
    const attempt = { kind: "bwh-bandwidth-attempt", revision, stopped: null, steps };
    if (steps.length === 0) writeAttempt(lockDirectory, attempt);
    for (let index = 0; index < steps.length; index += 1) {
      steps[index].state = "intended";
      writeAttempt(lockDirectory, attempt);
      if (interruptAfter === index) throw fail("bwh_bandwidth_interrupted");
    }
    // Unproven classification must not touch the kernel. A later isolated proof
    // has to set classificationAttached before any owned object is created.
    if (planned.classificationAttached !== true) {
      attempt.stopped = "classification_unproven";
      writeAttempt(lockDirectory, attempt);
      setStatus(db, "failed", "classification_unproven");
      return readBwhBandwidth(db);
    }
  if (typeof run !== "function" || typeof readback !== "function") {
    setStatus(db, "failed", "policy_invalid");
    return readBwhBandwidth(db);
  }
  setStatus(db, "applying", null);
  try {
    for (const plannedStep of planned.steps) {
      if (plannedStep.shell !== false) throw fail("bwh_bandwidth_invalid");
      assertArgv(plannedStep.argv);
      if (plannedStep.argv.includes(acceptedInterface) && acceptedInterface !== IFB) throw fail("bwh_bandwidth_invalid");
      await run(plannedStep);
    }
  } catch {
    try {
      for (const rollbackStep of rollbackOwnedSteps()) {
        if (rollbackStep.shell !== false) throw fail("bwh_bandwidth_invalid");
        assertArgv(rollbackStep.argv);
        await run(rollbackStep);
      }
    } catch {
      setStatus(db, "unknown", "rollback_failed");
      return readBwhBandwidth(db);
    }
    setStatus(db, "failed", "apply_failed");
    return readBwhBandwidth(db);
  }
  let receipt;
  try { receipt = await readback(); } catch {
    setStatus(db, "failed", "readback_failed");
    return readBwhBandwidth(db);
  }
  if (!receiptProves(receipt, normalized)) {
    const mismatch = receipt && typeof receipt === "object"
      && receipt.classificationProven === true && receipt.managementExemptProven === true;
    setStatus(db, "failed", mismatch ? "readback_mismatch" : "classification_unproven");
    return readBwhBandwidth(db);
  }
  setStatus(db, "applied", null, {
    classificationProven: true,
    managementExemptProven: true,
    inboundBps: normalized.inbound.enabled ? normalized.inbound.bps : null,
    outboundBps: normalized.outbound.enabled ? normalized.outbound.bps : null
  });
  const applied = readBwhBandwidth(db);
  if (applied.state !== "applied") {
    setStatus(db, "failed", "classification_unproven");
    return readBwhBandwidth(db);
  }
  return applied;
  });
}
