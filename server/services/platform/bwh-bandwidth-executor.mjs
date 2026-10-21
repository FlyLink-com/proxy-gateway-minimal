import {
  BWH_SHARED_BANDWIDTH_PROFILE as PROFILE, loadOperatorInterfaceName, normalizeBandwidthPolicy, plan
} from "./bwh-shared-bandwidth.mjs";

// Synthetic ownership and readback executor. applyPlan does not call this.
// A matching snapshot is still not a host classification proof, so the result
// is never applied and this module never stops a protocol service.
const IFB = PROFILE.ifbName;
const QDISC_HANDLE = `${PROFILE.htbMajor}:`;
const CLASS_IDS = Object.freeze({
  inbound: `${PROFILE.htbMajor}:${PROFILE.htbClass.toString(16)}`,
  outbound: `${PROFILE.htbMajor}:${(PROFILE.htbClass + 1).toString(16)}`
});
const SNAPSHOT_KEYS = Object.freeze(["ifb", "rootQdiscs", "classes", "filters", "marks"]);
const OWNERS = new Set([PROFILE.id, "foreign", "unknown"]);

function fail(code) {
  return Object.assign(new Error("BWH shared bandwidth rejected"), { code });
}
function exact(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function result(state, reason, commands) {
  return Object.freeze({
    applied: false,
    state,
    reason,
    commands: Object.freeze(commands.map((argv) => Object.freeze([...argv])))
  });
}
function list(value, keys, limit = 8) {
  if (!Array.isArray(value) || value.length > limit) return null;
  for (const item of value) {
    if (!exact(item, keys)) return null;
  }
  return value;
}
function ownerOk(value) {
  return typeof value === "string" && OWNERS.has(value);
}

function inspect(snapshot) {
  if (!exact(snapshot, SNAPSHOT_KEYS)) return { state: "unknown", reason: "readback_unavailable" };
  if (snapshot.ifb !== null && !exact(snapshot.ifb, ["name", "owner"])) return { state: "unknown", reason: "readback_unavailable" };
  const rootQdiscs = list(snapshot.rootQdiscs, ["dev", "handle", "kind", "owner"]);
  const classes = list(snapshot.classes, ["dev", "classid", "owner", "rateBps"]);
  const filters = list(snapshot.filters, ["dev", "parent", "handle", "owner", "mark", "mask"]);
  const marks = list(snapshot.marks, ["value", "mask", "owner"]);
  if (!rootQdiscs || !classes || !filters || !marks) return { state: "failed", reason: "unknown_object" };
  const rows = [snapshot.ifb, ...rootQdiscs, ...classes, ...filters, ...marks].filter(Boolean);
  if (rows.some((row) => !ownerOk(row.owner))) return { state: "unknown", reason: "readback_unavailable" };
  if (rootQdiscs.some((row) => row.dev !== IFB)) return { state: "failed", reason: "root_qdisc_conflict" };
  if (snapshot.ifb && snapshot.ifb.name !== IFB) return { state: "failed", reason: "ifb_conflict" };
  if (filters.some((row) => row.dev !== IFB || row.parent !== QDISC_HANDLE || row.mark !== PROFILE.markValue || row.mask !== PROFILE.markMask)
    || marks.some((row) => row.value !== PROFILE.markValue || row.mask !== PROFILE.markMask)) {
    return { state: "failed", reason: "mark_conflict" };
  }
  if (rows.some((row) => row.owner === "unknown")) return { state: "failed", reason: "unknown_object" };
  if (rows.some((row) => row.owner === "foreign")) return { state: "failed", reason: "owner_drift" };
  if (rootQdiscs.some((row) => row.handle !== QDISC_HANDLE || row.kind !== "htb")) {
    return { state: "failed", reason: "qdisc_conflict" };
  }
  if (classes.some((row) => row.dev !== IFB || (row.classid !== CLASS_IDS.inbound && row.classid !== CLASS_IDS.outbound))) {
    return { state: "failed", reason: "qdisc_conflict" };
  }
  return { state: "failed", reason: null, classes };
}

function ratesMatch(classes, policy) {
  const expect = [
    ["inbound", CLASS_IDS.inbound, policy.inbound],
    ["outbound", CLASS_IDS.outbound, policy.outbound]
  ];
  for (const [, classid, direction] of expect) {
    const found = classes.filter((row) => row.classid === classid);
    if (direction.enabled) {
      if (found.length !== 1 || found[0].rateBps !== direction.bps) return false;
    } else if (found.length !== 0) return false;
  }
  return classes.length === expect.filter(([, , direction]) => direction.enabled).length;
}

function createdObject(argv) {
  if (argv[0] === "ip" && argv.includes("add")) return { kind: "ifb" };
  if (argv.includes("qdisc") && argv.includes("add")) return { kind: "qdisc" };
  if (argv.includes("class") && argv.includes("add")) {
    return { kind: "class", classid: argv[argv.indexOf("classid") + 1] };
  }
  return null;
}

function deleteArgv(object) {
  if (object.kind === "class" && (object.classid === CLASS_IDS.inbound || object.classid === CLASS_IDS.outbound)) {
    return ["tc", "class", "del", "dev", IFB, "classid", object.classid];
  }
  if (object.kind === "qdisc") return ["tc", "qdisc", "del", "dev", IFB, "handle", QDISC_HANDLE];
  if (object.kind === "ifb") return ["ip", "link", "del", IFB];
  return null;
}

function confirmed(snapshot, object) {
  if (object.kind === "ifb") return snapshot.ifb && snapshot.ifb.name === IFB && snapshot.ifb.owner === PROFILE.id;
  if (object.kind === "qdisc") {
    return snapshot.rootQdiscs.some((row) => row.dev === IFB && row.handle === QDISC_HANDLE && row.kind === "htb" && row.owner === PROFILE.id);
  }
  return snapshot.classes.some((row) => row.dev === IFB && row.classid === object.classid && row.owner === PROFILE.id);
}
function absent(snapshot, object) {
  if (object.kind === "ifb") return snapshot.ifb === null;
  if (object.kind === "qdisc") return !snapshot.rootQdiscs.some((row) => row.dev === IFB && row.handle === QDISC_HANDLE);
  return !snapshot.classes.some((row) => row.dev === IFB && row.classid === object.classid);
}

async function compensate(run, readSnapshot, commands, nic, reason) {
  let snapshot;
  try { snapshot = await Promise.resolve(readSnapshot()); } catch { return result("unknown", "rollback_unknown", commands); }
  const seen = inspect(snapshot);
  if (seen.reason) {
    const reason = seen.reason === "readback_unavailable" ? "rollback_unknown" : seen.reason;
    return result("unknown", reason, commands);
  }
  const created = [];
  for (const argv of commands) {
    const object = createdObject(argv);
    if (object) created.push(object);
  }
  for (const object of created.reverse()) {
    if (absent(snapshot, object)) continue;
    if (!confirmed(snapshot, object)) return result("unknown", "owner_drift", commands);
    const argv = deleteArgv(object);
    if (!argv || argv.includes(nic) || argv.includes("root") || argv.includes("flush")) {
      return result("unknown", "rollback_unknown", commands);
    }
    let code;
    try { code = await run({ shell: false, argv }); } catch { return result("unknown", "rollback_unknown", commands); }
    commands.push(argv);
    if (code !== 0) return result("unknown", "rollback_unknown", commands);
  }
  return result("failed", reason, commands);
}

export async function executeOwnedBandwidth({ policy, interfaceName, run, readSnapshot } = {}) {
  if (typeof run !== "function" || typeof readSnapshot !== "function") throw fail("bwh_bandwidth_invalid");
  const normalized = normalizeBandwidthPolicy(policy);
  const nic = loadOperatorInterfaceName(interfaceName);
  const commands = [];
  let before;
  try { before = await Promise.resolve(readSnapshot()); } catch { return result("unknown", "readback_unavailable", commands); }
  const preflight = inspect(before);
  if (preflight.reason) return result(preflight.state, preflight.reason, commands);
  const planned = plan(normalized, nic);
  if (planned.classificationAttached === true) throw fail("bwh_bandwidth_invalid");
  try {
    for (const step of planned.steps) {
      if (step.shell !== false || step.argv.includes(nic)) throw fail("bwh_bandwidth_invalid");
      const code = await run(step);
      commands.push([...step.argv]);
      if (code !== 0) throw fail("bwh_bandwidth_apply_failed");
    }
  } catch {
    return compensate(run, readSnapshot, commands, nic, "apply_failed");
  }
  if (commands.length === 0) return result("failed", "classification_unproven", commands);
  let after;
  try { after = await Promise.resolve(readSnapshot()); } catch { return result("unknown", "readback_unavailable", commands); }
  const checked = inspect(after);
  if (checked.reason) return compensate(run, readSnapshot, commands, nic, checked.reason);
  const reason = ratesMatch(checked.classes, normalized) ? "classification_unproven" : "readback_mismatch";
  return compensate(run, readSnapshot, commands, nic, reason);
}
