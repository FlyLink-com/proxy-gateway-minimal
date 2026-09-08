#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as baselineApi from "./lib/traffic-vless-recovery-baseline.mjs";
import { parseStrictXrayUserCounters } from "../server/services/edge/xray-recovery-counter-parser.mjs";
import { readRecoveryJson, writeRecoveryJson, recoveryAbsolutePath, recoveryDigest, recoveryReject } from "./lib/traffic-recovery-protected-files.mjs";

const CHANNELS = ["channel-vultr-a-vless-reality-tcp", "channel-sgp-a-vless-reality-tcp"];
function exactKeys(object, keys) {
  if (!object || typeof object !== "object" || Array.isArray(object) || Object.keys(object).some((key) => !keys.includes(key))) recoveryReject();
}
export function validateRecoveryChannels(channelRefs) {
  if (!Array.isArray(channelRefs) || !channelRefs.length || channelRefs.length > 2
    || new Set(channelRefs).size !== channelRefs.length || channelRefs.some((ref) => !CHANNELS.includes(ref))) recoveryReject();
  return [...channelRefs].sort();
}
function pinSource(source) {
  exactKeys(source, ["channelRef", "xrayBinary", "binarySha256", "statsServer"]);
  validateRecoveryChannels([source.channelRef]);
  recoveryAbsolutePath(source.xrayBinary);
  if (!/^[a-f0-9]{64}$/.test(source.binarySha256)) recoveryReject();
  if (typeof source.statsServer !== "string" || !/^(127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/.test(source.statsServer)) recoveryReject();
  if (Number(source.statsServer.slice(source.statsServer.lastIndexOf(":") + 1)) > 65535) recoveryReject();
  let path = source.xrayBinary;
  for (;;) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (path === source.xrayBinary ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) recoveryReject();
    if (process.platform !== "win32" && ((stat.uid !== 0 && stat.uid !== process.getuid()) || ((stat.mode & 0o022) && !(stat.mode & 0o1000)))) recoveryReject();
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
  const before = lstatSync(source.xrayBinary);
  if (recoveryDigest(readFileSync(source.xrayBinary)) !== source.binarySha256) recoveryReject();
  const after = lstatSync(source.xrayBinary);
  if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size) recoveryReject();
}
export function readRecoveryXraySnapshot({ source, nowFn = () => new Date(), commandRunner = spawnSync }) {
  pinSource(source);
  const result = commandRunner(source.xrayBinary, ["api", "statsquery", `--server=${source.statsServer}`], {
    encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, shell: false
  });
  if (result?.error || result?.signal || result?.status !== 0 || typeof result.stdout !== "string") recoveryReject();
  pinSource(source);
  const observedAt = nowFn().toISOString();
  return parseStrictXrayUserCounters(JSON.parse(result.stdout)).map((entry) => ({
    ...entry, sourceRef: "xray_statsquery_user_traffic", channelRef: source.channelRef,
    accountingMode: "cumulative", observedAt
  }));
}
function validateRequestVersion(request) {
  exactKeys(request, ["schemaVersion", "dbPath", "channelRefs", "sources", "validForSeconds",
    ...([2, 3].includes(request?.schemaVersion) ? ["retentionPolicy"] : []), ...(request?.schemaVersion === 3 ? ["initializationPolicy"] : [])]);
  if (![1, 2, 3].includes(request.schemaVersion)) recoveryReject();
  if ([2, 3].includes(request.schemaVersion) && request.retentionPolicy !== "preserve-ineligible") recoveryReject();
  if (request.schemaVersion === 3 && request.initializationPolicy !== "verified-legacy-fresh-cursors") recoveryReject();
}
export function validateVlessRecoveryRequest(request) {
  validateRequestVersion(request);
  recoveryAbsolutePath(request.dbPath);
  const channels = validateRecoveryChannels(request.channelRefs);
  if (!Array.isArray(request.sources) || request.sources.length !== channels.length
    || JSON.stringify(request.sources.map((s) => s.channelRef).sort()) !== JSON.stringify(channels)
    || new Set(request.sources.map((s) => s.statsServer)).size !== channels.length) recoveryReject();
  if (!Number.isInteger(request.validForSeconds) || request.validForSeconds < 1 || request.validForSeconds > 300) recoveryReject();
  request.sources.forEach(pinSource);
  return request;
}
function argsOf(argv) {
  const [action, ...args] = argv;
  const fields = { prepare: ["--request", "--plan"], apply: ["--plan", "--expect-sha256"], verify: ["--plan", "--expect-sha256"], reconcile: ["--plan", "--expect-sha256"] }[action];
  if (!fields || args.length !== fields.length * 2) recoveryReject();
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!fields.includes(args[i]) || Object.hasOwn(values, args[i]) || !args[i + 1]) recoveryReject();
    values[args[i]] = args[i + 1];
  }
  if (fields.some((key) => !Object.hasOwn(values, key))) recoveryReject();
  return { action, ...values };
}
export function readBaselineEnvelope(planFile, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) recoveryReject();
  const read = readRecoveryJson(planFile);
  if (read.sha256 !== expectedSha256) recoveryReject();
  const envelope = read.value;
  exactKeys(envelope, ["schemaVersion", "type", "request", "requestSha256", "privatePlan"]);
  validateRequestVersion(envelope.request);
  if (envelope.schemaVersion !== envelope.request.schemaVersion || envelope.privatePlan?.version !== envelope.schemaVersion
    || envelope.privatePlan.retentionPolicy !== envelope.request.retentionPolicy
    || envelope.privatePlan.initializationPolicy !== envelope.request.initializationPolicy
    || envelope.type !== "traffic_vless_baseline_plan" || !/^[a-f0-9]{64}$/.test(envelope.privatePlan?.planDigest)) recoveryReject();
  recoveryAbsolutePath(envelope.request?.dbPath);
  if (JSON.stringify(validateRecoveryChannels(envelope.request.channelRefs)) !== JSON.stringify(validateRecoveryChannels(envelope.privatePlan.channelRefs))) recoveryReject();
  return envelope;
}
export function readAppliedBaselineReceipt(planFile, planFileSha256, planDigest) {
  const receipt = readRecoveryJson(`${planFile}.receipt.json`).value;
  if (receipt.type !== "traffic_vless_baseline_receipt" || receipt.status !== "baseline_verified"
    || receipt.planFileSha256 !== planFileSha256 || receipt.planDigest !== planDigest) recoveryReject();
  return receipt;
}
function ensureIntent(planFile, fileDigest, planDigest, nowFn) {
  const intent = { type: "traffic_vless_baseline_intent", planFileSha256: fileDigest, planDigest, recordedAt: nowFn().toISOString() };
  try { writeRecoveryJson(`${planFile}.intent.json`, intent); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = readRecoveryJson(`${planFile}.intent.json`).value;
    if (existing.type !== intent.type || existing.planFileSha256 !== fileDigest || existing.planDigest !== planDigest) recoveryReject();
  }
}
function ensureReceipt(planFile, fileDigest, planDigest, nowFn) {
  const receipt = { type: "traffic_vless_baseline_receipt", status: "baseline_verified", planFileSha256: fileDigest, planDigest, verifiedAt: nowFn().toISOString(), productionAuthorized: false };
  try { writeRecoveryJson(`${planFile}.receipt.json`, receipt); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    readAppliedBaselineReceipt(planFile, fileDigest, planDigest);
  }
}
export async function runTrafficVlessRecovery({ argv = process.argv.slice(2), stdout = process.stdout, nowFn = () => new Date(),
  commandRunner = spawnSync, baseline = baselineApi, allowWindowsSynthetic = false } = {}) {
  let action = "invalid";
  const output = (summary, exitCode) => {
    stdout.write(`${JSON.stringify({ type: "traffic_vless_recovery_command", action, ...summary, productionAuthorized: false,
      posixProtectionVerified: process.platform !== "win32" && summary.ok === true, windowsAclVerified: false })}\n`);
    return exitCode;
  };
  try {
    const args = argsOf(argv);
    action = args.action;
    if (process.platform === "win32" && !allowWindowsSynthetic) return output({ ok: false, errorCode: "recovery_posix_required" }, 2);
    const planFile = recoveryAbsolutePath(args["--plan"]);
    if (action === "prepare") {
      const input = readRecoveryJson(args["--request"]);
      const request = validateVlessRecoveryRequest(input.value);
      const inspected = baseline.inspectTrafficVlessBaseline({ dbPath: request.dbPath, channelRefs: request.channelRefs,
        retentionPolicy: request.retentionPolicy, initializationPolicy: request.initializationPolicy, nowFn });
      if (!inspected.ok) return output(inspected.summary, 2);
      const observations = request.sources.flatMap((source) => readRecoveryXraySnapshot({ source, nowFn, commandRunner }));
      const prepared = baseline.prepareTrafficVlessBaseline({ dbPath: request.dbPath, channelRefs: request.channelRefs, observations,
        expectedInventory: inspected.privateInventory, retentionPolicy: request.retentionPolicy,
        initializationPolicy: request.initializationPolicy, nowFn, validForSeconds: request.validForSeconds });
      if (!prepared.ok) return output(prepared.summary, 2);
      const fileDigest = writeRecoveryJson(planFile, { schemaVersion: request.schemaVersion, type: "traffic_vless_baseline_plan", request, requestSha256: input.sha256, privatePlan: prepared.privatePlan });
      return output({ ...prepared.summary, ok: true, status: "plan_prepared", planFileSha256: fileDigest }, 0);
    }
    const fileDigest = args["--expect-sha256"];
    const envelope = readBaselineEnvelope(planFile, fileDigest);
    const expectedPlanDigest = envelope.privatePlan.planDigest;
    const params = { dbPath: envelope.request.dbPath, plan: envelope.privatePlan, expectedPlanDigest, nowFn };
    if (action === "apply") {
      validateVlessRecoveryRequest(envelope.request);
      ensureIntent(planFile, fileDigest, expectedPlanDigest, nowFn);
      const result = baseline.applyTrafficVlessBaseline(params);
      if (!result.ok) return output(result, 2);
    }
    const verified = baseline.verifyTrafficVlessBaseline(params);
    if (!verified.ok) return output(verified, 2);
    if (action === "apply" || action === "reconcile") {
      const intent = readRecoveryJson(`${planFile}.intent.json`).value;
      if (intent.planFileSha256 !== fileDigest || intent.planDigest !== expectedPlanDigest) recoveryReject();
      ensureReceipt(planFile, fileDigest, expectedPlanDigest, nowFn);
    }
    return output(verified, 0);
  } catch {
    return output({ ok: false, errorCode: "traffic_vless_recovery_rejected", nextAction: "retain_plan_and_intent_then_verify_before_retry" }, 2);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runTrafficVlessRecovery();
}
