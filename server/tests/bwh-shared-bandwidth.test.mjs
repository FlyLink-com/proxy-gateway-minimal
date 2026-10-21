import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import express from "express";
import { adminSubscriptionDistributionRoutes } from "../routes/admin-subscription-distribution.mjs";
import { listen } from "./helpers/listen.mjs";
import {
  BWH_SHARED_BANDWIDTH_PROFILE as PROFILE,
  applyBwhBandwidthSchema, applyPlan, loadOperatorInterfaceName, mbpsTextToBps, plan,
  readBandwidthAttempt, readBwhBandwidth, revisionForBandwidthPolicy, rollbackOwnedSteps, saveDesired, saveFromAdmin
} from "../services/platform/bwh-shared-bandwidth.mjs";
import {
  encodeBwhBandwidthWireRequest, parseBwhBandwidthWireRequest, parseBwhBandwidthWireResponse
} from "../../scripts/lib/bwh-bandwidth-wire.mjs";

const REVISION = "ab".repeat(32);

function open() {
  const db = new Database(":memory:");
  applyBwhBandwidthSchema(db);
  return db;
}
function code(error) {
  return error?.code;
}
function enabled(inboundMbps, outboundMbps = null) {
  return {
    bandwidthRevision: null,
    inboundEnabled: true,
    outboundEnabled: outboundMbps !== null,
    inboundMbps,
    outboundMbps: outboundMbps ?? "0.1"
  };
}

test("converts 1.5 Mbps with integer math and rejects 0, NaN, numbers, and extra decimals", () => {
  assert.equal(mbpsTextToBps("1.5"), 1500000);
  assert.equal(mbpsTextToBps("0.1"), 100000);
  assert.equal(mbpsTextToBps("10000"), 10000000000);
  for (const value of ["0", "0.0", "1.55", "1.", ".5", "1.5.0", " 1.5", "1e2", "", NaN, 1.5, null, undefined]) {
    assert.throws(() => mbpsTextToBps(value), (error) => code(error) === "bwh_bandwidth_invalid");
  }
});

test("invalid save does not call an executor and keeps the prior desired policy", () => {
  const db = open();
  const initial = readBwhBandwidth(db);
  const saved = saveFromAdmin(db, { ...enabled("1.5"), bandwidthRevision: initial.revision, outboundEnabled: false });
  assert.equal(saved.state, "desired");
  assert.equal(saved.inboundMbps, "1.5");
  assert.equal(saved.outboundEnabled, false);
  assert.equal(saved.outboundMbps, null);
  assert.equal(saved.revision, revisionForBandwidthPolicy({
    inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: false, bps: null }
  }));
  assert.equal(JSON.stringify(saved).includes("eth0"), false);
  assert.equal(JSON.stringify(saved).includes("ifb"), false);
  assert.equal(JSON.stringify(saved).includes("0xb100"), false);
  const row = db.prepare("SELECT inbound_bps, outbound_bps, outbound_enabled FROM bwh_shared_bandwidth_desired").get();
  assert.equal(row.inbound_bps, 1500000);
  assert.equal(row.outbound_bps, null);
  assert.equal(row.outbound_enabled, 0);
  const before = readBwhBandwidth(db);
  let executed = false;
  const run = () => { executed = true; return 0; };
  for (const body of [
    { ...enabled("0"), bandwidthRevision: before.revision, outboundEnabled: false },
    { ...enabled("1.55"), bandwidthRevision: before.revision, outboundEnabled: false },
    { bandwidthRevision: before.revision, inboundEnabled: true, outboundEnabled: false, inboundMbps: NaN, outboundMbps: "1" }
  ]) {
    assert.throws(() => saveFromAdmin(db, body), (error) => code(error) === "bwh_bandwidth_invalid");
  }
  assert.throws(() => saveDesired(db, {
    inbound: { enabled: false, bps: 0 }, outbound: { enabled: false, bps: null }
  }, before.revision), (error) => code(error) === "bwh_bandwidth_invalid");
  assert.equal(executed, false);
  assert.equal(typeof run, "function");
  assert.deepEqual(readBwhBandwidth(db), before);
  db.close();
});

test("desired save is compare-and-swap on the policy revision", () => {
  const db = open();
  const initial = readBwhBandwidth(db);
  const saved = saveFromAdmin(db, { ...enabled("1.5"), bandwidthRevision: initial.revision, outboundEnabled: false });
  assert.throws(() => saveFromAdmin(db, {
    ...enabled("2"), bandwidthRevision: initial.revision, outboundEnabled: false
  }), (error) => code(error) === "bwh_bandwidth_conflict");
  assert.throws(() => saveFromAdmin(db, {
    ...enabled("2"), bandwidthRevision: "f".repeat(64), outboundEnabled: false
  }), (error) => code(error) === "bwh_bandwidth_conflict");
  assert.deepEqual(readBwhBandwidth(db), saved);
  db.close();
});

test("plan uses only fixed tokens and decimal bps, and does not classify management traffic", () => {
  assert.equal(loadOperatorInterfaceName("eth0"), "eth0");
  assert.equal(loadOperatorInterfaceName("enp1s0.100"), "enp1s0.100");
  for (const value of ["Eth0", "eth0;tc", " eth0", "-eth0", "", "a".repeat(16), null, 1]) {
    assert.throws(() => loadOperatorInterfaceName(value), (error) => code(error) === "bwh_bandwidth_invalid");
  }
  const planned = plan({
    inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: true, bps: 2500000 }
  }, "eth0");
  assert.equal(planned.shell, false);
  assert.equal(planned.classificationAttached, false);
  assert.equal(planned.interfaceName, "eth0");
  assert.deepEqual([...planned.proxyServices], [...PROFILE.services]);
  assert.deepEqual([...PROFILE.services], ["xray-vless-reality.service", "hysteria2.service", "mihomo-tuic.service"]);
  const argv = planned.steps.flatMap((step) => step.argv);
  assert.ok(argv.includes("1500000"));
  assert.ok(argv.includes("2500000"));
  assert.equal(argv.includes("eth0"), false);
  assert.equal(argv.includes("1.5"), false);
  assert.equal(argv.includes("systemctl"), false);
  for (const step of planned.steps) {
    assert.equal(step.shell, false);
    assert.equal(Array.isArray(step.argv), true);
    for (const token of step.argv) assert.equal(token.includes("/"), false);
  }
  assert.equal(planned.steps.some((step) => step.argv.includes("root") && !step.argv.includes(PROFILE.ifbName)), false);
  for (const name of ["ssh", "sshd", "admin", "portal", "subscription", "control", "metering"]) {
    assert.equal(planned.excludedClasses.includes(name), true);
    assert.equal(planned.proxyServices.includes(name), false);
    assert.equal(argv.some((token) => token.toLowerCase().includes(name)), false);
  }
  for (const service of PROFILE.services) assert.equal(argv.includes(service), false);
  for (const step of rollbackOwnedSteps()) {
    assert.equal(step.shell, false);
    assert.equal(step.argv.includes("root"), false);
    assert.equal(step.argv.includes("add"), false);
    assert.equal(step.argv.includes("eth0"), false);
    assert.ok(step.argv.includes("del"));
    assert.ok(step.argv.includes(PROFILE.ifbName));
    assert.equal(step.argv.some((token) => PROFILE.services.includes(token)), false);
  }
  assert.throws(() => plan({ inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: false, bps: null } }, "eth0;tc"));
});

function classId(step) {
  return step.argv[step.argv.indexOf("classid") + 1];
}
function rateSteps(planned, direction) {
  return planned.steps.filter((step) => step.direction === direction && step.argv.includes("class") && step.argv.includes("add"));
}
function lockDir(t) {
  const directory = mkdtempSync(join(tmpdir(), "bwh-bandwidth-lock-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("each direction has one queue and one shared rate, and off adds nothing", () => {
  const both = plan({
    inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: true, bps: 2500000 }
  }, "eth0");
  const inbound = rateSteps(both, "inbound");
  const outbound = rateSteps(both, "outbound");
  assert.equal(inbound.length, 1);
  assert.equal(outbound.length, 1);
  assert.notEqual(classId(inbound[0]), classId(outbound[0]));
  assert.equal(both.steps.filter((step) => step.argv.includes("qdisc") && step.argv.includes("add")).length, 1);
  assert.equal(both.steps.filter((step) => step.argv[0] === "ip" && step.argv.includes("add")).length, 1);
  assert.equal(both.steps.filter((step) => step.argv.includes("rate")).length, 2);
  assert.equal(both.classificationAttached, false);
  assert.equal(both.steps.some((step) => step.argv.includes("filter")), false);
  const onlyIn = plan({ inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: false, bps: null } }, "eth0");
  assert.equal(rateSteps(onlyIn, "inbound").length, 1);
  assert.equal(rateSteps(onlyIn, "outbound").length, 0);
  const onlyOut = plan({ inbound: { enabled: false, bps: null }, outbound: { enabled: true, bps: 2500000 } }, "eth0");
  assert.equal(rateSteps(onlyOut, "inbound").length, 0);
  assert.equal(rateSteps(onlyOut, "outbound").length, 1);
  assert.notEqual(classId(rateSteps(onlyOut, "outbound")[0]), classId(rateSteps(onlyIn, "inbound")[0]));
  const off = plan({ inbound: { enabled: false, bps: null }, outbound: { enabled: false, bps: null } }, "eth0");
  assert.equal(off.steps.length, 0);
  assert.equal(off.classificationAttached, false);
});

test("a held process lock and a changed revision refuse apply before any command", async (t) => {
  const db = open();
  t.after(() => db.close());
  const directory = lockDir(t);
  const initial = readBwhBandwidth(db);
  const saved = saveFromAdmin(db, { ...enabled("1.5", "2.5"), bandwidthRevision: initial.revision });
  mkdirSync(join(directory, "bwh-bandwidth.lock"));
  let calls = 0;
  await assert.rejects(() => applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    run() { calls += 1; return 0; },
    readback() { calls += 1; return {}; }
  }), (error) => code(error) === "bwh_bandwidth_locked");
  assert.equal(calls, 0);
  assert.equal(readBwhBandwidth(db).state, "desired");
  rmSync(join(directory, "bwh-bandwidth.lock"), { recursive: true, force: true });
  await assert.rejects(() => applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    async afterLock(snapshot) {
      assert.equal(snapshot.revision, saved.revision);
      saveFromAdmin(db, { ...enabled("3"), bandwidthRevision: saved.revision, outboundEnabled: false });
    },
    run() { calls += 1; return 0; },
    readback() { calls += 1; return {}; }
  }), (error) => code(error) === "bwh_bandwidth_conflict");
  assert.equal(calls, 0);
  assert.equal(readBwhBandwidth(db).inboundMbps, "3");
  assert.equal(readBwhBandwidth(db).state, "desired");
});

test("an interrupted attempt keeps intended and pending steps and still does not run", async (t) => {
  const db = open();
  t.after(() => db.close());
  const directory = lockDir(t);
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, { ...enabled("1.5", "2.5"), bandwidthRevision: initial.revision });
  let calls = 0;
  await assert.rejects(() => applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0", interruptAfter: 0,
    run() { calls += 1; return 0; },
    readback() { calls += 1; return {}; }
  }), (error) => code(error) === "bwh_bandwidth_interrupted");
  assert.equal(calls, 0);
  const attempt = readBandwidthAttempt(directory);
  assert.equal(attempt.steps[0].state, "intended");
  assert.equal(attempt.steps.slice(1).every((step) => step.state === "pending"), true);
  assert.equal(attempt.steps.some((step) => step.state === "done"), false);
  assert.equal(readBwhBandwidth(db).state, "desired");
  const resumed = await applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    run() { calls += 1; return 0; },
    readback() { calls += 1; return { classificationProven: true, managementExemptProven: true, inboundBps: 1500000, outboundBps: 2500000 }; }
  });
  assert.equal(calls, 0);
  assert.equal(resumed.state, "failed");
  assert.equal(resumed.reason, "classification_unproven");
  const kept = readBandwidthAttempt(directory);
  assert.equal(kept.steps[0].state, "intended");
  assert.equal(kept.steps.some((step) => step.state === "done"), false);
  assert.equal(kept.steps.some((step) => step.state === "pending"), true);
});

test("unproven classification does not call run or readback, and a forged receipt cannot apply", async (t) => {
  const db = open();
  t.after(() => db.close());
  const directory = lockDir(t);
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, { ...enabled("1.5"), bandwidthRevision: initial.revision, outboundEnabled: false });
  let runs = 0;
  let readbacks = 0;
  const forged = {
    classificationProven: true,
    managementExemptProven: true,
    inboundBps: 1500000,
    outboundBps: null
  };
  const unproven = await applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    run() { runs += 1; return 0; },
    readback() { readbacks += 1; return forged; }
  });
  assert.equal(runs, 0);
  assert.equal(readbacks, 0);
  assert.equal(unproven.state, "failed");
  assert.equal(unproven.reason, "classification_unproven");
  assert.equal(unproven.inboundMbps, "1.5");
  assert.equal(unproven.outboundMbps, null);
  const again = await applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    run() { runs += 1; return 0; },
    readback() { readbacks += 1; return { code: 0, ...forged, outboundBps: 0 }; }
  });
  assert.equal(runs, 0);
  assert.equal(readbacks, 0);
  assert.notEqual(again.state, "applied");
  assert.equal(again.reason, "classification_unproven");
  assert.equal(readBwhBandwidth(db).state, "failed");
});

test("a bad interface or invalid stored policy does not call run", async () => {
  const db = open();
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, { ...enabled("1.5"), bandwidthRevision: initial.revision, outboundEnabled: false });
  let calls = 0;
  const run = () => { calls += 1; return 0; };
  const missing = await applyPlan({ db, run, readback() { calls += 1; return {}; }, interfaceName: undefined });
  assert.equal(calls, 0);
  assert.equal(missing.state, "failed");
  assert.equal(missing.reason, "interface_unproven");
  assert.equal(readBwhBandwidth(db).inboundMbps, "1.5");
  db.prepare("UPDATE bwh_shared_bandwidth_desired SET status = 'desired', reason = NULL, inbound_bps = 0 WHERE singleton = 1").run();
  const invalid = await applyPlan({ db, run, readback() { calls += 1; return {}; }, interfaceName: "eth0" });
  assert.equal(calls, 0);
  assert.equal(invalid.state, "failed");
  assert.equal(invalid.reason, "policy_invalid");
  assert.equal(db.prepare("SELECT inbound_bps FROM bwh_shared_bandwidth_desired").get().inbound_bps, 0);
  db.close();
});

test("unknown status refuses the next apply without calling run", async () => {
  const db = open();
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, { ...enabled("1.5"), bandwidthRevision: initial.revision, outboundEnabled: false });
  db.prepare("UPDATE bwh_shared_bandwidth_desired SET status = 'unknown', reason = 'rollback_failed' WHERE singleton = 1").run();
  let calls = 0;
  await assert.rejects(() => applyPlan({
    db, interfaceName: "eth0",
    run() { calls += 1; return 0; },
    readback() { calls += 1; return { classificationProven: true, managementExemptProven: true, inboundBps: 1500000, outboundBps: null }; }
  }), (error) => code(error) === "bwh_bandwidth_conflict");
  assert.equal(calls, 0);
  assert.equal(readBwhBandwidth(db).state, "unknown");
  assert.equal(readBwhBandwidth(db).reason, "rollback_failed");
  db.close();
});

test("bandwidth wire rejects command fields, duplicate keys, CR, and oversize frames", () => {
  const revision = "a".repeat(64);
  const status = encodeBwhBandwidthWireRequest({ version: 1, action: "status" });
  assert.equal(parseBwhBandwidthWireRequest(status).action, "status");
  assert.equal(parseBwhBandwidthWireRequest(encodeBwhBandwidthWireRequest({ version: 1, action: "apply", revision })).revision, revision);
  assert.throws(() => parseBwhBandwidthWireRequest(`${JSON.stringify({ version: 1, action: "apply", revision, command: "tc" })}\n`));
  assert.throws(() => parseBwhBandwidthWireRequest(`${JSON.stringify({ version: 1, action: "plan", interface: "eth0" })}\n`));
  assert.throws(() => parseBwhBandwidthWireRequest(`${JSON.stringify({ version: 1, action: "rollback", revision, unit: "ssh.service" })}\n`));
  assert.throws(() => parseBwhBandwidthWireRequest('{"version":1,"action":"status","action":"plan"}\n'));
  assert.throws(() => parseBwhBandwidthWireRequest('{"version":1,"action":"status"}\r\n'));
  assert.throws(() => parseBwhBandwidthWireRequest(`${"a".repeat(513)}\n`));
  assert.throws(() => parseBwhBandwidthWireResponse(`{"version":1,"ok":true,"status":{"command":"tc"}}${" ".repeat(20)}\n`));
  const huge = `${JSON.stringify({ version: 1, ok: false, pad: "x".repeat(9000) })}\n`;
  assert.ok(Buffer.byteLength(huge) > 8192);
  assert.throws(() => parseBwhBandwidthWireResponse(huge));
  assert.equal(parseBwhBandwidthWireResponse('{"version":1,"ok":false}\n').ok, false);
});

test("namespace proof refuses without host commands", () => {
  const script = fileURLToPath(new URL("../../scripts/bwh-bandwidth-namespace-proof.mjs", import.meta.url));
  const source = readFileSync(script, "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn"), false);
  assert.equal(source.includes("exec"), false);
  const result = spawnSync(process.execPath, [script, "--tc", "ip", "ssh"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "{\"ok\":false,\"reason\":\"isolation_not_authorized\"}\n");
  assert.equal(result.stderr, "");
});

test("admin bandwidth route reuses supply authorization and does not write routes or supply", async (t) => {
  const db = open();
  t.after(() => db.close());
  const writes = [];
  const snapshot = { revision: REVISION, owned: { enabled: true, items: [] }, routes: [], candidates: [] };
  const state = {
    platform: { adminAuthRoutesEnabled: true, adminAuth: {}, adminBrowserOrigin: "https://admin.example.test" },
    subscriptionDistribution: {
      enabled: true, available: true,
      store: {
        getSnapshot() { return snapshot; },
        writeRoutes() { writes.push("routes"); return snapshot; },
        writeOwned() { writes.push("owned"); return snapshot; }
      },
      supply: {
        read() { return { state: "enabled" }; },
        isTransitioning() { return false; },
        async setEnabled() { writes.push("supply"); return { state: "paused" }; }
      }
    },
    bwhBandwidth: {
      read: () => readBwhBandwidth(db),
      save: (body) => saveFromAdmin(db, body)
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.adminPrincipal = { role: "admin" }; next(); });
  app.use(adminSubscriptionDistributionRoutes(state));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const headers = { "content-type": "application/json", origin: "https://admin.example.test", "sec-fetch-site": "same-origin" };
  const current = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution`, { headers });
  const opened = await current.json();
  assert.equal(current.status, 200);
  assert.deepEqual(Object.keys(opened.bwhBandwidth).sort(), ["inboundEnabled", "inboundMbps", "outboundEnabled", "outboundMbps", "revision", "state"]);
  const body = { bandwidthRevision: opened.bwhBandwidth.revision, inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: "0.1" };
  const denied = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers: { ...headers, origin: "https://evil.test" }, body: JSON.stringify(body)
  });
  assert.equal(denied.status, 403);
  const crossSite = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers: { ...headers, "sec-fetch-site": "cross-site" }, body: JSON.stringify(body)
  });
  assert.equal(crossSite.status, 403);
  const extra = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify({ ...body, command: "tc" })
  });
  assert.equal(extra.status, 400);
  const accepted = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify(body)
  });
  const acceptedText = await accepted.text();
  const acceptedBody = JSON.parse(acceptedText);
  assert.equal(accepted.status, 200);
  assert.equal(acceptedBody.bwhBandwidth.inboundMbps, "1.5");
  assert.equal(acceptedBody.bwhBandwidth.outboundMbps, null);
  assert.equal(acceptedBody.bwhBandwidth.state, "desired");
  assert.equal(acceptedText.includes("ifb-gccgw-bwh"), false);
  assert.equal(acceptedText.includes("0xb100"), false);
  assert.equal(acceptedText.includes("private"), false);
  assert.deepEqual(writes, []);
  const zero = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify({ ...body, bandwidthRevision: acceptedBody.bwhBandwidth.revision, inboundMbps: "0" })
  });
  assert.equal(zero.status, 400);
  assert.equal((await zero.json()).error, "bwh_bandwidth_invalid");
  const conflict = await fetch(`${baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, {
    method: "PUT", headers, body: JSON.stringify(body)
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, "bwh_bandwidth_conflict");
  assert.deepEqual(writes, []);
});

test("admin bandwidth failures use fixed public codes", async (t) => {
  const snapshot = { revision: REVISION, owned: { enabled: true, items: [] }, routes: [], candidates: [] };
  async function start(save) {
    const state = {
      platform: { adminAuthRoutesEnabled: true, adminAuth: {}, adminBrowserOrigin: "https://admin.example.test" },
      subscriptionDistribution: { enabled: true, available: true, store: { getSnapshot() { return snapshot; }, writeRoutes() { throw new Error("routes"); }, writeOwned() { throw new Error("owned"); } } },
      ...(save ? { bwhBandwidth: { async save() { throw Object.assign(new Error("private-bandwidth-secret"), save); } } } : {})
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.adminPrincipal = { role: "admin" }; next(); });
    app.use(adminSubscriptionDistributionRoutes(state));
    const listened = await listen(app);
    t.after(() => { listened.server.closeAllConnections(); listened.server.close(); });
    return listened.baseUrl;
  }
  const headers = { "content-type": "application/json", origin: "https://admin.example.test" };
  const body = JSON.stringify({ bandwidthRevision: "a".repeat(64), inboundEnabled: false, outboundEnabled: false, inboundMbps: "0.1", outboundMbps: "0.1" });
  const missing = await fetch(`${await start(null)}/api/admin/third-party-subscriptions/distribution/bandwidth`, { method: "PUT", headers, body });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error, "bwh_bandwidth_unavailable");
  const failedBase = await start({});
  const failed = await fetch(`${failedBase}/api/admin/third-party-subscriptions/distribution/bandwidth`, { method: "PUT", headers, body });
  const failedText = await failed.text();
  assert.equal(failed.status, 503);
  assert.equal(JSON.parse(failedText).error, "bwh_bandwidth_failed");
  assert.equal(failedText.includes("private-bandwidth-secret"), false);
  const legacy = {
    platform: { adminAuthRoutesEnabled: false, adminAuth: {}, adminBrowserOrigin: "https://admin.example.test" },
    subscriptionDistribution: { enabled: true, available: true, store: { getSnapshot() { return snapshot; } } },
    bwhBandwidth: { save() { throw new Error("should-not-run"); } }
  };
  const legacyApp = express();
  legacyApp.use(express.json());
  legacyApp.use(adminSubscriptionDistributionRoutes(legacy));
  const legacyListen = await listen(legacyApp);
  t.after(() => { legacyListen.server.closeAllConnections(); legacyListen.server.close(); });
  const legacyResponse = await fetch(`${legacyListen.baseUrl}/api/admin/third-party-subscriptions/distribution/bandwidth`, { method: "PUT", headers, body });
  assert.equal(legacyResponse.status, 403);
  await legacyResponse.arrayBuffer();
});
