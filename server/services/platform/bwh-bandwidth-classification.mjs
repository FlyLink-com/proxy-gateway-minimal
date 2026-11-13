import {
  BWH_SHARED_BANDWIDTH_PROFILE as PROFILE, loadOperatorInterfaceName
} from "./bwh-shared-bandwidth.mjs";

// Observable classification matrix only. Nothing here opens a socket, runs
// nft/tc, or treats a filled-in matrix as a host proof.
const PROTOCOLS = Object.freeze([
  Object.freeze({ id: "vless", service: PROFILE.services[0] }),
  Object.freeze({ id: "hy2", service: PROFILE.services[1] }),
  Object.freeze({ id: "tuic", service: PROFILE.services[2] })
]);
const DIRECTIONS = Object.freeze(["inbound", "outbound"]);
const LEGS = Object.freeze(["client", "origin"]);
const PHASES = Object.freeze(["first", "existing"]);
const TRANSPORTS = Object.freeze(["tcp", "udp", "quic"]);
const FAMILIES = Object.freeze(["ipv4", "ipv6"]);
const ACCEPTED_EVIDENCE = new Set(["socket-cgroup", "conntrack-mark", "ctinfo-restore"]);
const REJECTED_EVIDENCE = new Map([
  ["namespace-move", "namespace_move_not_authorized"],
  ["nic-tbf", "whole_nic_not_classification"],
  ["shared-uid", "shared_uid_not_classification"],
  ["listen-port", "listen_port_not_classification"],
  ["service-name", "service_name_not_classification"],
  ["boolean", "boolean_not_classification"]
]);
const SHORTCUT_KEYS = Object.freeze([
  ["networkNamespaceMigrated", "namespace_move_not_authorized"],
  ["serviceIdentityChanged", "namespace_move_not_authorized"],
  ["wholeNic", "whole_nic_not_classification"],
  ["uid", "shared_uid_not_classification"],
  ["user", "shared_uid_not_classification"],
  ["gid", "shared_uid_not_classification"],
  ["listenPorts", "listen_port_not_classification"],
  ["ports", "listen_port_not_classification"],
  ["classificationAttached", "boolean_not_classification"],
  ["services", "service_name_not_classification"],
  ["ipv6Available", "ipv6_unproven"],
  ["existingConnectionsDrained", "existing_connection_unproven"]
]);
const PROTOCOL_KEYS = Object.freeze([
  "subject", "protocol", "direction", "leg", "phase", "transport", "family", "evidenceKind", "queue"
]);
const EXEMPT_KEYS = Object.freeze(["subject", "className", "direction", "family", "evidenceKind", "queue"]);
const ENVELOPE_KEYS = Object.freeze(["profileId", "interfaceName", "mark", "mask", "flows"]);

const QUEUES = Object.freeze({
  inbound: `${PROFILE.htbMajor}:${PROFILE.htbClass.toString(16)}`,
  outbound: `${PROFILE.htbMajor}:${(PROFILE.htbClass + 1).toString(16)}`,
  exempt: "exempt"
});

const protocolCells = [];
for (const protocol of PROTOCOLS) {
  for (const direction of DIRECTIONS) {
    for (const leg of LEGS) {
      for (const phase of PHASES) {
        for (const transport of TRANSPORTS) {
          for (const family of FAMILIES) {
            protocolCells.push(Object.freeze({
              id: `p|${protocol.id}|${direction}|${leg}|${phase}|${transport}|${family}`,
              protocol: protocol.id, direction, leg, phase, transport, family
            }));
          }
        }
      }
    }
  }
}
const exemptCells = [];
for (const className of PROFILE.excludedClasses) {
  for (const direction of DIRECTIONS) {
    for (const family of FAMILIES) {
      exemptCells.push(Object.freeze({
        id: `e|${className}|${direction}|${family}`,
        className, direction, family
      }));
    }
  }
}
const FULL_GAP = Object.freeze({
  ipv6: protocolCells.filter((cell) => cell.family === "ipv6").length,
  existing: protocolCells.filter((cell) => cell.phase === "existing").length,
  inbound: protocolCells.filter((cell) => cell.direction === "inbound").length,
  origin: protocolCells.filter((cell) => cell.leg === "origin").length,
  client: protocolCells.filter((cell) => cell.leg === "client").length,
  first: protocolCells.filter((cell) => cell.phase === "first").length,
  tcp: protocolCells.filter((cell) => cell.transport === "tcp").length,
  udp: protocolCells.filter((cell) => cell.transport === "udp").length,
  quic: protocolCells.filter((cell) => cell.transport === "quic").length,
  protocol: protocolCells.filter((cell) => cell.protocol === "vless").length
});
const PROTOCOL_IDS = new Set(protocolCells.map((cell) => cell.id));
const EXEMPT_IDS = new Set(exemptCells.map((cell) => cell.id));
const PROTOCOL_NAMES = new Set(PROTOCOLS.map((item) => item.id));
const EXEMPT_NAMES = new Set(PROFILE.excludedClasses);
const QUEUE_NAMES = new Set(Object.values(QUEUES));

function fail(code) {
  return Object.assign(new Error("BWH shared bandwidth rejected"), { code });
}

function exact(value, keys) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function bandwidthClassificationTopology() {
  return Object.freeze({
    profileId: PROFILE.id,
    mark: PROFILE.markValue,
    mask: PROFILE.markMask,
    ifbName: PROFILE.ifbName,
    protocols: PROTOCOLS,
    directions: DIRECTIONS,
    legs: LEGS,
    phases: PHASES,
    transports: TRANSPORTS,
    families: FAMILIES,
    exemptions: PROFILE.excludedClasses,
    queues: QUEUES,
    acceptedEvidence: Object.freeze([...ACCEPTED_EVIDENCE]),
    hostFixture: "not_authorized"
  });
}

function emptyCounts() {
  return {
    protocolCells: protocolCells.length,
    ipv6: protocolCells.filter((cell) => cell.family === "ipv6").length,
    existing: protocolCells.filter((cell) => cell.phase === "existing").length,
    inbound: protocolCells.filter((cell) => cell.direction === "inbound").length,
    origin: protocolCells.filter((cell) => cell.leg === "origin").length,
    client: protocolCells.filter((cell) => cell.leg === "client").length,
    first: protocolCells.filter((cell) => cell.phase === "first").length,
    tcp: protocolCells.filter((cell) => cell.transport === "tcp").length,
    udp: protocolCells.filter((cell) => cell.transport === "udp").length,
    quic: protocolCells.filter((cell) => cell.transport === "quic").length,
    vless: protocolCells.filter((cell) => cell.protocol === "vless").length,
    hy2: protocolCells.filter((cell) => cell.protocol === "hy2").length,
    tuic: protocolCells.filter((cell) => cell.protocol === "tuic").length,
    exemptions: exemptCells.length,
    leakedExemptions: 0
  };
}

function verdict(reason, { matrixComplete = false, missingCounts = emptyCounts(), profileDeclared = false, markDeclared = false } = {}) {
  return Object.freeze({
    proven: false,
    classificationAttached: false,
    reason,
    matrixComplete,
    hostFixture: "not_authorized",
    missingCounts: Object.freeze({ ...missingCounts }),
    bindings: Object.freeze({
      profileDeclared,
      markDeclared,
      kernelReadback: false,
      interfaceIndex: false,
      serviceCgroup: false
    })
  });
}

function shortcutReason(value) {
  if (typeof value === "boolean") return "boolean_not_classification";
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return "service_name_not_classification";
    throw fail("bwh_bandwidth_invalid");
  }
  if (!value || typeof value !== "object") throw fail("bwh_bandwidth_invalid");
  for (const [key, reason] of SHORTCUT_KEYS) {
    if (Object.hasOwn(value, key)) return reason;
  }
  return null;
}

function countMissing(covered) {
  const counts = emptyCounts();
  counts.protocolCells = 0;
  counts.ipv6 = 0;
  counts.existing = 0;
  counts.inbound = 0;
  counts.origin = 0;
  counts.client = 0;
  counts.first = 0;
  counts.tcp = 0;
  counts.udp = 0;
  counts.quic = 0;
  counts.vless = 0;
  counts.hy2 = 0;
  counts.tuic = 0;
  counts.exemptions = 0;
  for (const cell of protocolCells) {
    if (covered.has(cell.id)) continue;
    counts.protocolCells += 1;
    if (cell.family === "ipv6") counts.ipv6 += 1;
    if (cell.phase === "existing") counts.existing += 1;
    if (cell.direction === "inbound") counts.inbound += 1;
    if (cell.leg === "origin") counts.origin += 1;
    if (cell.leg === "client") counts.client += 1;
    if (cell.phase === "first") counts.first += 1;
    if (cell.transport === "tcp") counts.tcp += 1;
    if (cell.transport === "udp") counts.udp += 1;
    if (cell.transport === "quic") counts.quic += 1;
    counts[cell.protocol] += 1;
  }
  for (const cell of exemptCells) {
    if (!covered.has(cell.id)) counts.exemptions += 1;
  }
  return counts;
}

function gapReason(counts, leaked, queueMismatch, shortcuts) {
  for (const reason of REJECTED_EVIDENCE.values()) {
    if (shortcuts.has(reason)) return reason;
  }
  if (leaked > 0) return "management_not_exempt";
  if (counts.ipv6 === FULL_GAP.ipv6) return "ipv6_unproven";
  if (counts.existing === FULL_GAP.existing) return "existing_connection_unproven";
  if (counts.inbound === FULL_GAP.inbound) return "ingress_unproven";
  if (counts.origin === FULL_GAP.origin) return "origin_leg_unproven";
  if (counts.client === FULL_GAP.client) return "client_leg_unproven";
  if (counts.first === FULL_GAP.first) return "first_packet_unproven";
  if (counts.tcp === FULL_GAP.tcp) return "tcp_unproven";
  if (counts.udp === FULL_GAP.udp) return "udp_unproven";
  if (counts.quic === FULL_GAP.quic) return "quic_unproven";
  if (counts.vless === FULL_GAP.protocol || counts.hy2 === FULL_GAP.protocol || counts.tuic === FULL_GAP.protocol) {
    return "protocol_unproven";
  }
  if (counts.exemptions > 0) return "exemption_unproven";
  if (queueMismatch > 0) return "queue_mismatch";
  if (counts.protocolCells > 0) return "observation_incomplete";
  return "host_fixture_unauthorized";
}

function cellId(flow) {
  if (flow.subject === "protocol") {
    return `p|${flow.protocol}|${flow.direction}|${flow.leg}|${flow.phase}|${flow.transport}|${flow.family}`;
  }
  return `e|${flow.className}|${flow.direction}|${flow.family}`;
}

function readFlow(flow) {
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) throw fail("bwh_bandwidth_invalid");
  if (flow.subject === "protocol") {
    if (!exact(flow, PROTOCOL_KEYS)) throw fail("bwh_bandwidth_invalid");
    if (!PROTOCOL_NAMES.has(flow.protocol) || !DIRECTIONS.includes(flow.direction) || !LEGS.includes(flow.leg)
      || !PHASES.includes(flow.phase) || !TRANSPORTS.includes(flow.transport) || !FAMILIES.includes(flow.family)) {
      throw fail("bwh_bandwidth_invalid");
    }
  } else if (flow.subject === "exempt") {
    if (!exact(flow, EXEMPT_KEYS)) throw fail("bwh_bandwidth_invalid");
    if (!EXEMPT_NAMES.has(flow.className) || !DIRECTIONS.includes(flow.direction) || !FAMILIES.includes(flow.family)) {
      throw fail("bwh_bandwidth_invalid");
    }
  } else {
    throw fail("bwh_bandwidth_invalid");
  }
  if (typeof flow.queue !== "string" || !QUEUE_NAMES.has(flow.queue)) throw fail("bwh_bandwidth_invalid");
  if (!ACCEPTED_EVIDENCE.has(flow.evidenceKind) && !REJECTED_EVIDENCE.has(flow.evidenceKind)) {
    throw fail("bwh_bandwidth_invalid");
  }
  const id = cellId(flow);
  if (flow.subject === "protocol" ? !PROTOCOL_IDS.has(id) : !EXEMPT_IDS.has(id)) throw fail("bwh_bandwidth_invalid");
  return flow;
}

export function observeBandwidthClassification(input) {
  const shortcut = shortcutReason(input);
  if (shortcut) return verdict(shortcut);
  if (!exact(input, ENVELOPE_KEYS) || !Array.isArray(input.flows) || input.flows.length > 400) {
    throw fail("bwh_bandwidth_invalid");
  }
  let interfaceName;
  try { interfaceName = loadOperatorInterfaceName(input.interfaceName); } catch { throw fail("bwh_bandwidth_invalid"); }
  if (interfaceName !== input.interfaceName) throw fail("bwh_bandwidth_invalid");
  const profileDeclared = input.profileId === PROFILE.id;
  const markDeclared = input.mark === PROFILE.markValue && input.mask === PROFILE.markMask;
  if (!profileDeclared || !markDeclared) return verdict("binding_mismatch", { profileDeclared, markDeclared });
  const covered = new Set();
  const shortcuts = new Set();
  let leaked = 0;
  let queueMismatch = 0;
  for (const item of input.flows) {
    const flow = readFlow(item);
    const expected = flow.subject === "exempt" ? QUEUES.exempt : QUEUES[flow.direction];
    if (REJECTED_EVIDENCE.has(flow.evidenceKind)) {
      shortcuts.add(REJECTED_EVIDENCE.get(flow.evidenceKind));
      continue;
    }
    if (flow.queue !== expected) {
      if (flow.subject === "exempt") leaked += 1;
      else queueMismatch += 1;
      continue;
    }
    covered.add(cellId(flow));
  }
  const missingCounts = countMissing(covered);
  missingCounts.leakedExemptions = leaked;
  const reason = gapReason(missingCounts, leaked, queueMismatch, shortcuts);
  const matrixComplete = reason === "host_fixture_unauthorized";
  return verdict(reason, { matrixComplete, missingCounts, profileDeclared, markDeclared });
}
