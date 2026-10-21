import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { Readable, Writable } from "node:stream";
import { executeOwnedBandwidth } from "../services/platform/bwh-bandwidth-executor.mjs";
import {
  BWH_SHARED_BANDWIDTH_PROFILE as PROFILE,
  applyBwhBandwidthSchema, applyPlan, readBwhBandwidth, saveFromAdmin
} from "../services/platform/bwh-shared-bandwidth.mjs";
import { encodeBwhBandwidthWireRequest } from "../../scripts/lib/bwh-bandwidth-wire.mjs";
import { runBwhBandwidthWorker } from "../../scripts/bwh-bandwidth-worker.mjs";

const POLICY = { inbound: { enabled: true, bps: 1500000 }, outbound: { enabled: true, bps: 2500000 } };
const IFB = PROFILE.ifbName;

function emptySnapshot() {
  return { ifb: null, rootQdiscs: [], classes: [], filters: [], marks: [] };
}
function ownedSnapshot(inboundBps = 1500000, outboundBps = 2500000) {
  return {
    ifb: { name: IFB, owner: PROFILE.id },
    rootQdiscs: [{ dev: IFB, handle: "1:", kind: "htb", owner: PROFILE.id }],
    classes: [
      { dev: IFB, classid: "1:10", owner: PROFILE.id, rateBps: inboundBps },
      { dev: IFB, classid: "1:11", owner: PROFILE.id, rateBps: outboundBps }
    ],
    filters: [],
    marks: []
  };
}
function sequence(snapshots) {
  const pending = [...snapshots];
  return () => {
    if (pending.length === 0) throw new Error("snapshot exhausted");
    return pending.shift();
  };
}
function forbidden(commands) {
  const tokens = commands.flat();
  for (const token of ["eth0", "flush", "systemctl", "0", ...PROFILE.services]) {
    assert.equal(tokens.includes(token), false, token);
  }
  for (const argv of commands) {
    if (argv.includes("root")) assert.ok(argv.includes(IFB));
    if (argv.includes("del")) assert.equal(argv.includes("root"), false);
  }
}

test("a foreign root qdisc, unknown object, mark, or ifb refuses before any command", async () => {
  let runs = 0;
  const run = () => { runs += 1; return 0; };
  const root = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0", run,
    readSnapshot: () => ({
      ...emptySnapshot(),
      rootQdiscs: [{ dev: "eth0", handle: "1:", kind: "fq", owner: "foreign" }]
    })
  });
  const unknown = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0", run,
    readSnapshot: () => ({
      ...emptySnapshot(),
      rootQdiscs: [{ dev: IFB, handle: "1:", kind: "htb", owner: "unknown" }]
    })
  });
  const mark = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0", run,
    readSnapshot: () => ({
      ...emptySnapshot(),
      marks: [{ value: 1, mask: PROFILE.markMask, owner: "foreign" }]
    })
  });
  const ifb = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0", run,
    readSnapshot: () => ({ ...emptySnapshot(), ifb: { name: "ifb0", owner: PROFILE.id } })
  });
  const drifted = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0", run,
    readSnapshot: () => ({ ...emptySnapshot(), ifb: { name: IFB, owner: "foreign" } })
  });
  assert.equal(runs, 0);
  assert.equal(root.reason, "root_qdisc_conflict");
  assert.equal(unknown.reason, "unknown_object");
  assert.equal(mark.reason, "mark_conflict");
  assert.equal(ifb.reason, "ifb_conflict");
  assert.equal(drifted.reason, "owner_drift");
  for (const verdict of [root, unknown, mark, ifb, drifted]) {
    assert.equal(verdict.applied, false);
    assert.equal(verdict.state, "failed");
    assert.deepEqual(verdict.commands, []);
  }
});

test("command success with a mismatched rate is not applied and compensation rechecks ownership", async () => {
  const commands = [];
  const verdict = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0",
    run(step) { commands.push(step.argv); return 0; },
    readSnapshot: sequence([
      emptySnapshot(),
      ownedSnapshot(100000, 2500000),
      ownedSnapshot(100000, 2500000)
    ])
  });
  assert.equal(verdict.applied, false);
  assert.equal(verdict.state, "failed");
  assert.equal(verdict.reason, "readback_mismatch");
  const deletes = verdict.commands.filter((argv) => argv.includes("del"));
  assert.deepEqual(deletes.map((argv) => argv.includes("classid") ? argv.at(-1) : argv.at(-1)), ["1:11", "1:10", "1:", IFB]);
  forbidden(verdict.commands);
  assert.equal(verdict.commands.some((argv) => argv.includes("filter")), false);
});

test("a matching synthetic rate still is not applied, and a drifted compensation snapshot is unknown", async () => {
  const matched = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0",
    run() { return 0; },
    readSnapshot: sequence([emptySnapshot(), ownedSnapshot(), ownedSnapshot()])
  });
  assert.equal(matched.applied, false);
  assert.equal(matched.reason, "classification_unproven");
  assert.equal(matched.state, "failed");
  const drifted = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0",
    run() { return 0; },
    readSnapshot: sequence([
      emptySnapshot(),
      ownedSnapshot(100000, 2500000),
      { ...ownedSnapshot(100000, 2500000), ifb: { name: IFB, owner: "foreign" } }
    ])
  });
  assert.equal(drifted.applied, false);
  assert.equal(drifted.state, "unknown");
  assert.equal(drifted.reason, "owner_drift");
  assert.equal(drifted.commands.some((argv) => argv.includes("del")), false);
  const unreadable = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0",
    run() { return 0; },
    readSnapshot: sequence([emptySnapshot(), ownedSnapshot(100000, 2500000), null])
  });
  assert.equal(unreadable.state, "unknown");
  assert.equal(unreadable.reason, "rollback_unknown");
  assert.equal(unreadable.commands.some((argv) => argv.includes("del")), false);
});

test("an unreadable preflight read does not run, and applyPlan still does not execute", async (t) => {
  let runs = 0;
  const unread = await executeOwnedBandwidth({
    policy: POLICY, interfaceName: "eth0",
    run() { runs += 1; return 0; },
    readSnapshot() { throw new Error("netlink unavailable"); }
  });
  assert.equal(runs, 0);
  assert.equal(unread.state, "unknown");
  assert.equal(unread.reason, "readback_unavailable");
  assert.equal(unread.applied, false);
  const db = new Database(":memory:");
  t.after(() => db.close());
  applyBwhBandwidthSchema(db);
  const directory = mkdtempSync(join(tmpdir(), "bwh-bandwidth-exec-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const initial = readBwhBandwidth(db);
  saveFromAdmin(db, {
    bandwidthRevision: initial.revision,
    inboundEnabled: true, outboundEnabled: true, inboundMbps: "1.5", outboundMbps: "2.5"
  });
  const applied = await applyPlan({
    db, lockDirectory: directory, interfaceName: "eth0",
    run() { runs += 1; return 0; },
    readback() { runs += 1; return ownedSnapshot(); }
  });
  assert.equal(runs, 0);
  assert.equal(applied.state, "failed");
  assert.equal(applied.reason, "classification_unproven");
});

test("the bandwidth worker reuses the one-shot refusal boundary and does not run commands", async () => {
  let runs = 0;
  const frame = encodeBwhBandwidthWireRequest({ version: 1, action: "apply", revision: "ab".repeat(32) });
  const output = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const input = () => Readable.from([frame]);
  assert.equal(await runBwhBandwidthWorker({
    argv: ["apply"], frame, input: input(), output: output(), isRoot: () => true, run() { runs += 1; }
  }), 64);
  assert.equal(await runBwhBandwidthWorker({
    argv: [], frame, input: input(), output: output(), isRoot: () => false, run() { runs += 1; }
  }), 77);
  assert.equal(await runBwhBandwidthWorker({
    argv: [], frame, input: input(), output: output(), isRoot: () => true, run() { runs += 1; }
  }), 2);
  assert.equal(runs, 0);
  assert.throws(() => encodeBwhBandwidthWireRequest({
    version: 1, action: "apply", revision: "ab".repeat(32), argv: ["tc"]
  }));
});
