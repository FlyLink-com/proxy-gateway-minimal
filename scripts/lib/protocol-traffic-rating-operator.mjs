// Formal one-step entry. It reuses the lifecycle lock and does not fill earlier stages.
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { FULL_METERING_SCOPE, LOCAL_METERING_SCOPE, validateFullMeteringContext } from "./full-metering-scope.mjs";
import { probeSqliteOpenedFile } from "./protocol-traffic-rating-opened-file.mjs";
import { runProtocolRatingLifecycle, runProtocolRatingRollbackCheck } from "./protocol-traffic-rating-lifecycle.mjs";

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const HASH = /^[a-f0-9]{64}$/;
const NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ACTIONS = Object.freeze(["inspect", "migrate", "drain", "baseline", "activate", "rollback-check"]);
const OBSERVATIONS = new Set(["unobserved", "measured", "measured_zero"]);
const BASELINE_KEYS = Object.freeze([
  "accountId", "entitlementId", "requestId", "cycleKey", "windowStartedAt", "boundaryObservedAt", "observation"
]);
const TABLES = Object.freeze([
  "platform_protocol_rating_policies",
  "platform_protocol_rating_charges",
  "platform_protocol_rating_baselines",
  "platform_protocol_rating_carry"
]);
const PUBLIC_CODE = /^(rating_|full_metering_|persist_)/;

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function pathKey(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function protectedTarget(path, directory) {
  if (typeof path !== "string" || !isAbsolute(path) || !existsSync(path)) fail("rating_operator_rejected");
  let info;
  try { info = lstatSync(path); } catch { fail("rating_operator_rejected"); }
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())
    || pathKey(realpathSync(path)) !== pathKey(resolve(path))) fail("rating_operator_rejected");
  return info;
}

// Size and mtime are omitted. SQLite and a legal checkpoint rename may change
// them without changing which file or directory was opened.
export function operatorTargetSubject(path, directory) {
  const info = protectedTarget(path, directory);
  return {
    dev: info.dev,
    ino: info.ino,
    uid: info.uid,
    gid: info.gid,
    mode: info.mode,
    nlink: info.nlink,
    kind: directory ? "directory" : "file",
    realpath: pathKey(realpathSync(path))
  };
}

export function operatorTargetsMatch(left, right) {
  return !!left && !!right
    && left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.gid === right.gid
    && left.mode === right.mode && left.nlink === right.nlink && left.kind === right.kind
    && left.realpath === right.realpath;
}

function absoluteDatabaseName(db) {
  const name = db?.name;
  return typeof name === "string" && isAbsolute(name) ? name : null;
}

function controlsOf(controls) {
  if (controls == null) return null;
  if (typeof controls !== "object" || Array.isArray(controls) || !exactKeys(controls, ["readOpenedFile"])
    || typeof controls.readOpenedFile !== "function") fail("rating_operator_rejected");
  return controls;
}

function openedSubject(value) {
  const subject = value?.proven === true ? value.subject : null;
  if (!subject || typeof subject !== "object" || subject.kind !== "file") return null;
  for (const key of ["dev", "ino", "uid", "gid", "mode", "nlink", "realpath"]) {
    if (!Object.hasOwn(subject, key)) return null;
  }
  return subject;
}

function captureOpened(db, controls) {
  if (!controls) {
    const probed = probeSqliteOpenedFile(db);
    return { proven: false, reason: probed.reason };
  }
  const subject = openedSubject(controls.readOpenedFile(db));
  if (!subject) fail("rating_operator_rejected");
  return { proven: true, subject };
}

function identityHolds(bound, db, controls) {
  try {
    if (!targetsStillBound(bound)) return false;
    const opened = captureOpened(db, controls);
    if (bound.opened.proven !== opened.proven) return false;
    if (!opened.proven) return true;
    if (!operatorTargetsMatch(bound.opened.subject, opened.subject)) return false;
    return !bound.databasePath || operatorTargetsMatch(opened.subject, operatorTargetSubject(bound.databasePath, false));
  } catch {
    return false;
  }
}

function bindOperatorTargets(directory, databasePath) {
  return {
    directoryPath: directory,
    directory: operatorTargetSubject(directory, true),
    databasePath,
    database: databasePath ? operatorTargetSubject(databasePath, false) : null
  };
}

function targetsStillBound(bound) {
  try {
    if (!operatorTargetsMatch(bound.directory, operatorTargetSubject(bound.directoryPath, true))) return false;
    if (bound.databasePath && !operatorTargetsMatch(bound.database, operatorTargetSubject(bound.databasePath, false))) return false;
    return true;
  } catch {
    return false;
  }
}

export function finishOperatorReceipt(bound, receipt) {
  if (targetsStillBound(bound)) return receipt;
  return { ...receipt, ok: false, error: "rating_target_unverified" };
}

function baselineItem(item) {
  if (!exactKeys(item, BASELINE_KEYS)) fail("rating_operator_rejected");
  if (!["accountId", "entitlementId", "requestId", "cycleKey"].every((key) => typeof item[key] === "string" && item[key].length > 0 && item[key].length <= 128)) {
    fail("rating_operator_rejected");
  }
  if (typeof item.windowStartedAt !== "string" || !NOW.test(item.windowStartedAt)
    || typeof item.boundaryObservedAt !== "string" || !NOW.test(item.boundaryObservedAt)
    || !OBSERVATIONS.has(item.observation)) fail("rating_operator_rejected");
  return item;
}

function normalize(request) {
  const action = request?.action;
  if (!ACTIONS.includes(action)) fail("rating_operator_rejected");
  const keys = ["action", "directory", "context", "now", "expectedCheckpointDigest"];
  if (Object.hasOwn(request, "db")) keys.push("db");
  else keys.push("dbPath");
  if (action === "baseline") keys.push("baselines");
  if (action === "activate") keys.push("expectedPolicyVersion", "expectedPolicyDigest", "expectedActiveVersion");
  if (action === "drain" && Object.hasOwn(request, "legacyPayloadDigest")) keys.push("legacyPayloadDigest");
  if (!exactKeys(request, keys)) fail("rating_operator_rejected");
  if (typeof request.now !== "string" || !NOW.test(request.now)) fail("rating_operator_rejected");
  if (typeof request.expectedCheckpointDigest !== "string" || !HASH.test(request.expectedCheckpointDigest)) fail("rating_operator_rejected");
  try {
    const scope = validateFullMeteringContext(request.context);
    if (scope !== FULL_METERING_SCOPE && scope !== LOCAL_METERING_SCOPE) fail("rating_operator_rejected");
  } catch (error) {
    if (error?.code === "rating_operator_rejected") throw error;
    fail("rating_operator_rejected");
  }
  protectedTarget(request.directory, true);
  if (Object.hasOwn(request, "dbPath")) protectedTarget(request.dbPath, false);
  else if (!request.db || typeof request.db.prepare !== "function") fail("rating_operator_rejected");
  const lifecycle = {
    action: action === "rollback-check" ? undefined : action,
    directory: request.directory,
    context: request.context,
    now: request.now,
    expectedCheckpointDigest: request.expectedCheckpointDigest,
    formal: true
  };
  if (action === "baseline") {
    if (!Array.isArray(request.baselines) || request.baselines.length > 256) fail("rating_operator_rejected");
    lifecycle.baselines = request.baselines.map(baselineItem);
  }
  if (action === "activate") {
    lifecycle.expectedPolicyVersion = request.expectedPolicyVersion;
    lifecycle.expectedPolicyDigest = request.expectedPolicyDigest;
    lifecycle.expectedActiveVersion = request.expectedActiveVersion;
  }
  if (action === "drain" && Object.hasOwn(request, "legacyPayloadDigest")) {
    if (typeof request.legacyPayloadDigest !== "string" || !HASH.test(request.legacyPayloadDigest)) fail("rating_operator_rejected");
    lifecycle.legacyPayloadDigest = request.legacyPayloadDigest;
  }
  return { action, db: request.db || null, dbPath: request.dbPath || null, lifecycle };
}

function openDb(dbPath) {
  const db = new Database(dbPath, { fileMustExist: true, timeout: 5000 });
  db.pragma("busy_timeout = 5000");
  return db;
}

function tableCount(db, name) {
  if (!db.prepare("select 1 as present from sqlite_master where type = 'table' and name = ?").get(name)) return 0;
  return Number(db.prepare(`select count(*) as count from ${name}`).get().count);
}

function present(action, context, expectedCheckpointDigest, db, result) {
  const active = tableCount(db, "platform_protocol_rating_policies")
    ? db.prepare("select policy_digest from platform_protocol_rating_policies where status = 'active'").get()
    : null;
  const stages = [];
  for (const name of ["inspect", "migrate", "drain", "baseline", "activate", "rollback"]) {
    if (result?.stages?.[name]) stages.push(name);
  }
  const recorded = action === "drain" ? result?.stages?.drain?.checkpointDigest
    : action === "activate" ? result?.stages?.activate?.checkpointDigest
      : action === "inspect" ? result?.stages?.inspect?.checkpointDigest
        : expectedCheckpointDigest;
  return {
    ok: true,
    action,
    stages,
    counts: {
      policies: tableCount(db, TABLES[0]),
      charges: tableCount(db, TABLES[1]),
      baselines: tableCount(db, TABLES[2]),
      carry: tableCount(db, TABLES[3])
    },
    digests: {
      scope: fullMeteringDigest(context),
      checkpoint: recorded || null,
      policy: active?.policy_digest || null
    }
  };
}

function classified(action, error) {
  const raw = typeof error?.code === "string" ? error.code : "";
  const code = PUBLIC_CODE.test(raw) ? raw : "rating_operator_rejected";
  return Object.assign(new Error(code), { code, action });
}

export function readOperatorBaselines(path) {
  protectedTarget(path, false);
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { fail("rating_operator_rejected"); }
  if (!Array.isArray(parsed)) fail("rating_operator_rejected");
  return parsed;
}

export async function runProtocolRatingOperator(request, controls) {
  const allowed = controlsOf(controls);
  const spec = normalize(request);
  let opened = null;
  try {
    opened = spec.db ? null : openDb(spec.dbPath);
    const db = spec.db || opened;
    const bound = bindOperatorTargets(spec.lifecycle.directory, spec.dbPath || absoluteDatabaseName(db));
    bound.opened = captureOpened(db, allowed);
    const hold = () => identityHolds(bound, db, allowed);
    // The open snapshot stays fixed. A later path or handle is not adopted.
    if (!hold()) fail("rating_target_unverified");
    await Promise.resolve();
    if (!hold()) fail("rating_target_unverified");
    await Promise.resolve();
    if (!hold()) fail("rating_target_unverified");
    const input = {
      ...spec.lifecycle,
      db,
      operatorBinding: {
        recheck() { if (!hold()) fail("rating_target_unverified"); },
        postcheck() { return hold(); }
      }
    };
    const result = spec.action === "rollback-check"
      ? await runProtocolRatingRollbackCheck(input)
      : await runProtocolRatingLifecycle(input);
    const receipt = present(spec.action, request.context, request.expectedCheckpointDigest, db, result);
    if (result?.operatorTargetVerified === false) {
      return { ...receipt, ok: false, error: "rating_target_unverified" };
    }
    return finishOperatorReceipt(bound, receipt);
  } catch (error) {
    throw classified(spec.action, error);
  } finally {
    opened?.close();
  }
}
