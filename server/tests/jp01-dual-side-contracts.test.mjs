import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateDataPlaneApplyReceipt } from "../../server/services/edge/data-plane-agent-protocol.mjs";
import { isSafeWireguardPlanRef } from "../../server/services/node-image-first-boot-packet.mjs";
import {
  buildEdgeNodeRegistrationRecordFromFirstBootPacket,
  registrationBindingOf
} from "../../server/services/edge/node-registration-ingestion.mjs";

// Contract tests for the dual-side integration schemas (D1, second
// revision). Fixtures are fully synthetic. Beyond schema conformance,
// this file checks the D1 contracts against the REAL contracts they
// must interoperate with: the registration anchor format, the live
// agent-protocol receipt validator, and the live WireGuard planRef
// predicate are imported/exercised, not re-described.
//
// The validator below implements exactly the JSON Schema subset the D1
// schemas use (type, const, enum, pattern, not, required, properties,
// additionalProperties, items, minItems, maxItems, uniqueItems,
// minimum, maxLength, allOf, contains, anyOf).

const SCHEMA_DIR = new URL("../../ops/node-provisioning/schemas/", import.meta.url);

function loadSchema(name) {
  return JSON.parse(readFileSync(new URL(name, SCHEMA_DIR), "utf8"));
}

const bwhSchema = loadSchema("bwh-integration-plan.schema.json");
const nodeSchema = loadSchema("node-runtime-plan.schema.json");
const gateSchema = loadSchema("dual-side-gate.schema.json");
const agentReceiptSchema = loadSchema("agent-apply-receipt.schema.json");
const summaryReceiptSchema = loadSchema("postinstall-receipt.schema.json");
const ALL_SCHEMAS = [bwhSchema, nodeSchema, gateSchema, agentReceiptSchema, summaryReceiptSchema];

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function validate(schema, value, path = "$") {
  const errors = [];
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  }
  if (schema.not && validate(schema.not, value, path).length === 0) {
    errors.push(`${path}: matches the forbidden 'not' schema`);
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((sub) => validate(sub, value, path).length === 0);
    if (!ok) errors.push(`${path}: matches none of anyOf`);
    return errors;
  }
  if (schema.allOf) {
    schema.allOf.forEach((sub, i) => errors.push(...validate(sub, value, `${path}<allOf${i}>`)));
  }
  if (schema.contains !== undefined && Array.isArray(value)) {
    const ok = value.some((item) => validate(schema.contains, item, `${path}[]`).length === 0);
    if (!ok) errors.push(`${path}: no item satisfies contains`);
  }
  if (schema.type) {
    const actual = typeOf(value);
    const ok = schema.type === "number" ? actual === "integer" || actual === "number" : actual === schema.type;
    if (!ok) {
      errors.push(`${path}: expected type ${schema.type}, got ${actual}`);
      return errors;
    }
  }
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} violates pattern ${schema.pattern}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push(`${path}: items are not unique`);
    }
    if (schema.items) {
      value.forEach((item, index) => errors.push(...validate(schema.items, item, `${path}[${index}]`)));
    }
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required property ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      if (key in properties) {
        errors.push(...validate(properties[key], item, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: additional property ${key} is not allowed`);
      }
    }
  }
  return errors;
}

function assertValid(schema, value) {
  assert.deepEqual(validate(schema, value), []);
}

function assertInvalid(schema, value) {
  assert.ok(validate(schema, value).length > 0, "expected validation to fail");
}

const FORBIDDEN_KEYS = new Set([
  "authorization", "cookie", "customerdata", "env", "password",
  "privatekey", "rawconfig", "rawenv", "rawlog", "secret", "sqlite",
  "sqliterow", "subscriptionurl", "token", "uuid"
]);

function propertyNames(schema, acc = []) {
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    acc.push(key);
    propertyNames(sub, acc);
    if (sub.items) propertyNames(sub.items, acc);
    for (const alt of sub.anyOf ?? []) propertyNames(alt, acc);
  }
  return acc;
}

const fp = (ch) => `sha256:${ch.repeat(64)}`;
// Frozen digest rule (POSTINSTALL_IDENTITY_EXCHANGE.md section 10):
// sha256 over the canonical JSON of the object — keys sorted
// recursively, arrays in order, no whitespace — excluding the object's
// own top-level digest field.
function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalise(value[key])]));
  }
  return value;
}
function digestOf(obj) {
  const { digest, ...rest } = obj;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalise(rest)), "utf8").digest("hex")}`;
}
// Synthetic WireGuard keys: fixed 32-byte values, base64-encoded, with
// fingerprints honestly computed from the key bytes.
const keyB64 = (byte) => Buffer.alloc(32, byte).toString("base64");
const keyFp = (byte) => `sha256:${createHash("sha256").update(Buffer.alloc(32, byte)).digest("hex")}`;
const NODE_KEY = keyB64(0x22);
const BWH_KEY = keyB64(0x11);
const FP_A = keyFp(0x22);
const FP_B = keyFp(0x11);
const FP_C = fp("c");
const FP_D = fp("d");
const FP_E = fp("e");
const FP_F = fp("f");
const CHANNELS = [
  "channel-vultr-jp-01-vless-reality-tcp",
  "channel-vultr-jp-01-hy2",
  "channel-vultr-jp-01-tuic"
];
const BWH_TUNNEL_ADDRESS = "10.77.0.1/32";

function bwhPlan() {
  const plan = {
    schema: "bwh-integration-plan/v1",
    planRef: "bwh-plan-jp01-g1",
    generation: "1",
    nodeRef: "node-vultr-jp-01",
    providerRef: "provider-vultr",
    regionRef: "region-japan-pending-c1-gate",
    roleRef: "data-plane",
    channelRefs: [...CHANNELS],
    imageManifestRef: "jp01-candidate-1-file-inventory",
    releaseRef: "source-eb83197e",
    firstBootPacketRef: "first-boot-packet-jp01",
    profileDigest: FP_C,
    lifecycle: "private-validation",
    pool: "private",
    channels: [
      { channelRef: CHANNELS[0], runtimeAdapter: "xray", desiredStateRef: "desired-jp01-vless-g1", materialRef: "material-jp01-vless", materialDigest: fp("1"), endpointRef: "endpoint-jp01-vless" },
      { channelRef: CHANNELS[1], runtimeAdapter: "hysteria2", desiredStateRef: "desired-jp01-hy2-g1", materialRef: "material-jp01-hy2", materialDigest: fp("2"), endpointRef: "endpoint-jp01-hy2" },
      { channelRef: CHANNELS[2], runtimeAdapter: "mihomo", desiredStateRef: "desired-jp01-tuic-g1", materialRef: "material-jp01-tuic", materialDigest: fp("3"), endpointRef: "endpoint-jp01-tuic" }
    ],
    wireguard: {
      planRef: "wg-plan-jp01",
      bwhPeerPublicKey: BWH_KEY,
      bwhPeerPublicKeyFingerprint: FP_B,
      nodePeerPublicKey: NODE_KEY,
      nodePeerPublicKeyFingerprint: FP_A,
      allowedIps: ["10.77.0.2/32"]
    },
    agent: { agentAuthFingerprint: FP_D, endpointRef: "agent-endpoint-bwh-private" },
    digest: ""
  };
  plan.digest = digestOf(plan);
  return plan;
}

function nodePlan() {
  const plan = {
    schema: "node-runtime-plan/v1",
    planRef: "node-plan-jp01-g1",
    generation: "1",
    nodeRef: "node-vultr-jp-01",
    providerRef: "provider-vultr",
    regionRef: "region-japan-pending-c1-gate",
    roleRef: "data-plane",
    hostname: "node-vultr-jp-01",
    imageManifestRef: "jp01-candidate-1-file-inventory",
    firstBootPacketRef: "first-boot-packet-jp01",
    wireguardPlanRef: "wg-plan-jp01",
    profileDigest: FP_C,
    wireguard: {
      interfaceName: "wg-child0",
      addressCidr: "10.77.0.2/32",
      ownPublicKey: NODE_KEY,
      ownPublicKeyFingerprint: FP_A,
      peerPublicKey: BWH_KEY,
      peerPublicKeyFingerprint: FP_B,
      allowedIps: [BWH_TUNNEL_ADDRESS]
    },
    agent: { releaseRef: "source-eb83197e", authFingerprint: FP_D, bwhEndpointRef: "agent-endpoint-bwh-private" },
    services: [
      { channelRef: CHANNELS[0], runtimeAdapter: "xray", unitName: "xray.service", configDigest: fp("4"), statsListen: "127.0.0.1" },
      { channelRef: CHANNELS[1], runtimeAdapter: "hysteria2", unitName: "hysteria2.service", configDigest: fp("5"), statsListen: "127.0.0.1" },
      { channelRef: CHANNELS[2], runtimeAdapter: "mihomo", unitName: "mihomo.service", configDigest: fp("6"), statsListen: "::1" }
    ],
    activation: { controlServicesEnabled: false, trafficServicesEnabled: false },
    digest: ""
  };
  plan.digest = digestOf(plan);
  return plan;
}

// The authoritative third input: the E1-A candidate registration
// binding, produced exactly the way P7 produces it — a synthetic first
// boot packet through the REAL record builder
// (buildEdgeNodeRegistrationRecordFromFirstBootPacket, the same
// function the registration executor calls), then the REAL
// registrationBindingOf over the built record.
function syntheticFirstBootPacket() {
  const planned = {
    nodeRegistrationDryRunPassed: true,
    privateAgentRoutePlanned: true,
    protectedMaterialInjectPlanned: true,
    agentNodeIdentityPlanned: true
  };
  return {
    mode: "node-image-first-boot-packet",
    generatedAt: "2026-11-03T00:00:00Z",
    packet: { readyForFirstBootApproval: true, firstBootApplyAllowed: true },
    node: {
      nodeRef: "node-vultr-jp-01",
      providerRef: "provider-vultr",
      regionRef: "region-japan-pending-c1-gate",
      roleRef: "data-plane",
      channelRefs: [...CHANNELS]
    },
    image: {
      imageManifestRef: "jp01-candidate-1-file-inventory",
      releaseRef: "source-eb83197e",
      artifactSha256Recorded: true,
      noSecretImageConfirmed: true
    },
    controlPlane: { ...planned },
    wireguard: {
      planRef: "wg-plan-jp01",
      tunnelAddressAssigned: true,
      hostKeyGenerationPlanned: true,
      peerPublicKeyExchangePlanned: true,
      toolsPinnedInImageManifest: true
    },
    runtime: {
      servicesDisabledInImage: true,
      xrayConfigTestPlanned: true,
      hysteria2ConfigTestPlanned: true,
      tuicConfigTestPlanned: true,
      statsLoopbackOnly: true
    },
    receiptGate: {
      desiredStatePullRequired: true,
      materialPullRequired: true,
      appliedReceiptRequired: true,
      renderWithholdsUntilReceipt: true
    },
    approval: { exactApprovalReceived: true, firstBootApplyApproved: true },
    notes: []
  };
}

function candidateBinding() {
  const record = buildEdgeNodeRegistrationRecordFromFirstBootPacket(syntheticFirstBootPacket(), {
    wireguardPublicKeyFingerprint: FP_A,
    agentAuthFingerprint: FP_D,
    firstBootPacketRef: "first-boot-packet-jp01",
    registeredAt: "2026-11-03T00:00:00Z"
  });
  return registrationBindingOf(record);
}

const GATE_CHECK_IDS = [
  "node_ref_match", "provider_ref_match", "region_ref_match", "role_ref_match",
  "channel_refs_match", "image_manifest_ref_match", "release_ref_match", "first_boot_packet_ref_match",
  "wireguard_plan_ref_match", "profile_digest_match", "generation_match",
  "wireguard_key_cross_match", "allowed_ips_within_plan", "no_default_route", "agent_binding_match",
  "registration_binding_match",
  "agent_private_path_only", "protocol_config_tests", "stats_loopback_only", "no_unreplaced_placeholders",
  "file_permissions", "secret_hygiene_scan", "material_digests_match"
];

function gateReport(statusById = {}, verdict = "pass") {
  return {
    schema: "dual-side-gate/v1",
    gateRef: "dual-side-gate-jp01-g1",
    evaluatedAt: "2026-11-03T00:00:00Z",
    nodeRef: "node-vultr-jp-01",
    generation: "1",
    profileDigest: FP_C,
    bwhPlanDigest: bwhPlan().digest,
    nodePlanDigest: nodePlan().digest,
    registrationBindingDigest: digestOf(candidateBinding()),
    checks: GATE_CHECK_IDS.map((id) => ({ id, status: statusById[id] ?? "pass" })),
    verdict
  };
}

function agentReceipt() {
  return {
    type: "gccgw_data_plane_apply_receipt",
    nodeRef: "node-vultr-jp-01",
    desiredStateRef: "desired-jp01-vless-g1",
    generation: "1",
    channelRef: CHANNELS[0],
    status: "applied",
    configTest: true,
    serviceActive: true,
    listenerPresent: true,
    credentialCount: 2,
    appliedAt: "2026-11-03T00:00:00Z",
    materialDigests: [fp("1")],
    redacted: true
  };
}

function summaryReceipt() {
  return {
    schema: "postinstall-receipt/v1",
    type: "gccgw_postinstall_summary_receipt",
    receiptRef: "receipt-jp01-g1",
    nodeRef: "node-vultr-jp-01",
    generation: "1",
    desiredStateRef: "desired-jp01-g1",
    channelSummaries: CHANNELS.map((channelRef, i) => ({
      channelRef,
      receiptRef: `receipt-jp01-g1-${i + 1}`,
      status: "applied",
      configTest: true,
      serviceActive: true,
      listenerPresent: true,
      credentialCount: 2,
      materialDigests: [fp(String(i + 1))]
    })),
    status: "applied",
    appliedAt: "2026-11-03T00:00:00Z"
  };
}

function fingerprintOfPublicKey(b64) {
  return `sha256:${createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex")}`;
}

function cidrWithinApprovedPlan(cidr) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [a, b, c, , prefix] = [...octets, Number(match[5])];
  return a === 10 && b === 77 && c === 0 && prefix === 32;
}

// Mirrors the gate's identity checks: all eleven E1-A binding fields,
// compared across BOTH plans AND the authoritative candidate binding,
// plus the WireGuard key and address-plan semantics.
function dualSideConsistency(bwh, node, binding) {
  const failed = [];
  const sorted = (values) => [...values].sort();
  let bindingOk = true;
  const bind = (ok, id) => { if (!ok) { failed.push(id); bindingOk = false; } };
  if (bwh.nodeRef !== node.nodeRef) failed.push("node_ref_match");
  bind(bwh.nodeRef === binding.nodeRef && node.nodeRef === binding.nodeRef, "node_ref_match");
  if (bwh.providerRef !== node.providerRef) failed.push("provider_ref_match");
  bind(bwh.providerRef === binding.providerRef && node.providerRef === binding.providerRef, "provider_ref_match");
  if (bwh.regionRef !== node.regionRef) failed.push("region_ref_match");
  bind(bwh.regionRef === binding.regionRef && node.regionRef === binding.regionRef, "region_ref_match");
  if (bwh.roleRef !== node.roleRef) failed.push("role_ref_match");
  bind(bwh.roleRef === binding.roleRef && node.roleRef === binding.roleRef, "role_ref_match");
  const bwhChannels = sorted(bwh.channels.map((c) => c.channelRef));
  if (JSON.stringify(sorted(bwh.channelRefs)) !== JSON.stringify(bwhChannels) ||
      JSON.stringify(bwhChannels) !== JSON.stringify(sorted(node.services.map((s) => s.channelRef)))) {
    failed.push("channel_refs_match");
  }
  bind(JSON.stringify(bwhChannels) === JSON.stringify(binding.channelRefs), "channel_refs_match");
  if (bwh.imageManifestRef !== node.imageManifestRef) failed.push("image_manifest_ref_match");
  bind(bwh.imageManifestRef === binding.imageManifestRef && node.imageManifestRef === binding.imageManifestRef, "image_manifest_ref_match");
  if (bwh.releaseRef !== node.agent.releaseRef) failed.push("release_ref_match");
  bind(bwh.releaseRef === binding.releaseRef && node.agent.releaseRef === binding.releaseRef, "release_ref_match");
  if (bwh.firstBootPacketRef !== node.firstBootPacketRef) failed.push("first_boot_packet_ref_match");
  bind(bwh.firstBootPacketRef === binding.firstBootPacketRef && node.firstBootPacketRef === binding.firstBootPacketRef, "first_boot_packet_ref_match");
  if (bwh.wireguard.planRef !== node.wireguardPlanRef) failed.push("wireguard_plan_ref_match");
  bind(bwh.wireguard.planRef === binding.wireguardPlanRef && node.wireguardPlanRef === binding.wireguardPlanRef, "wireguard_plan_ref_match");
  if (bwh.profileDigest !== node.profileDigest) failed.push("profile_digest_match");
  if (bwh.generation !== node.generation) failed.push("generation_match");
  const keyPairsOk =
    bwh.wireguard.nodePeerPublicKey === node.wireguard.ownPublicKey &&
    bwh.wireguard.bwhPeerPublicKey === node.wireguard.peerPublicKey &&
    bwh.wireguard.nodePeerPublicKeyFingerprint === node.wireguard.ownPublicKeyFingerprint &&
    bwh.wireguard.bwhPeerPublicKeyFingerprint === node.wireguard.peerPublicKeyFingerprint &&
    fingerprintOfPublicKey(node.wireguard.ownPublicKey) === node.wireguard.ownPublicKeyFingerprint &&
    fingerprintOfPublicKey(node.wireguard.peerPublicKey) === node.wireguard.peerPublicKeyFingerprint &&
    fingerprintOfPublicKey(bwh.wireguard.nodePeerPublicKey) === bwh.wireguard.nodePeerPublicKeyFingerprint &&
    fingerprintOfPublicKey(bwh.wireguard.bwhPeerPublicKey) === bwh.wireguard.bwhPeerPublicKeyFingerprint;
  if (!keyPairsOk) failed.push("wireguard_key_cross_match");
  bind(fingerprintOfPublicKey(node.wireguard.ownPublicKey) === binding.wireguardPublicKeyFingerprint &&
       bwh.wireguard.nodePeerPublicKeyFingerprint === binding.wireguardPublicKeyFingerprint &&
       node.wireguard.ownPublicKeyFingerprint === binding.wireguardPublicKeyFingerprint,
       "wireguard_key_cross_match");
  const allIps = [...bwh.wireguard.allowedIps, ...node.wireguard.allowedIps, node.wireguard.addressCidr];
  if (!allIps.every(cidrWithinApprovedPlan)) failed.push("allowed_ips_within_plan");
  if (allIps.some((ip) => ip === "0.0.0.0/0" || ip === "::/0")) failed.push("no_default_route");
  if (!bwh.wireguard.allowedIps.includes(node.wireguard.addressCidr)) failed.push("allowed_ips_within_plan");
  if (!node.wireguard.allowedIps.includes(BWH_TUNNEL_ADDRESS)) failed.push("allowed_ips_within_plan");
  if (JSON.stringify(bwh.wireguard.allowedIps) !== JSON.stringify(["10.77.0.2/32"]) ||
      JSON.stringify(node.wireguard.allowedIps) !== JSON.stringify([BWH_TUNNEL_ADDRESS])) {
    failed.push("allowed_ips_within_plan");
  }
  if (bwh.agent.agentAuthFingerprint !== node.agent.authFingerprint) failed.push("agent_binding_match");
  bind(bwh.agent.agentAuthFingerprint === binding.agentAuthFingerprint &&
       node.agent.authFingerprint === binding.agentAuthFingerprint, "agent_binding_match");
  if (!bindingOk) failed.push("registration_binding_match");
  return [...new Set(failed)];
}

function gateVerdictCoherent(report) {
  const ids = report.checks.map((check) => check.id);
  const complete = report.checks.length === GATE_CHECK_IDS.length &&
    new Set(ids).size === GATE_CHECK_IDS.length &&
    GATE_CHECK_IDS.every((id) => ids.includes(id));
  const allPass = complete && report.checks.every((check) => check.status === "pass");
  return (report.verdict === "pass") === allPass;
}

// D4 aggregation rules, stated in the summary schema and tested here:
// the summary's channel set equals the registered set exactly, and the
// summary status is 'applied' only when every channel is 'applied'.
function summaryCoversRegisteredChannels(summary, registeredChannelRefs) {
  const summarised = summary.channelSummaries.map((entry) => entry.channelRef).sort();
  return JSON.stringify(summarised) === JSON.stringify([...registeredChannelRefs].sort());
}

function summaryStatusCoherent(summary) {
  if (summary.status === "applied") {
    return summary.channelSummaries.every((entry) => entry.status === "applied");
  }
  return true;
}

const PROTOCOL_OPTIONS = {
  expectedNodeRef: "node-vultr-jp-01",
  expectedGeneration: "1",
  expectedDesiredStateRef: "desired-jp01-vless-g1",
  allowedChannelRefs: CHANNELS
};

test("all five schemas are closed objects on draft 2020-12 with no forbidden key vocabulary", () => {
  for (const schema of ALL_SCHEMAS) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    for (const name of propertyNames(schema)) {
      const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      assert.ok(!FORBIDDEN_KEYS.has(normalised), `forbidden key vocabulary in schema: ${name}`);
    }
  }
});

test("synthetic fixtures conform to all five schemas", () => {
  assertValid(bwhSchema, bwhPlan());
  assertValid(nodeSchema, nodePlan());
  assertValid(gateSchema, gateReport());
  assertValid(agentReceiptSchema, agentReceipt());
  assertValid(summaryReceiptSchema, summaryReceipt());
});

test("anchor fingerprints must use the registration format sha256:<lowercase hex>", () => {
  const bare = bwhPlan();
  bare.agent = { ...bare.agent, agentAuthFingerprint: "d".repeat(64) };
  assertInvalid(bwhSchema, bare);
  const bareNode = nodePlan();
  bareNode.wireguard = { ...bareNode.wireguard, ownPublicKeyFingerprint: "a".repeat(64) };
  assertInvalid(nodeSchema, bareNode);
  const upper = bwhPlan();
  upper.wireguard = { ...upper.wireguard, nodePeerPublicKeyFingerprint: `sha256:${"A".repeat(64)}` };
  assertInvalid(bwhSchema, upper);
});

test("wireguard planRef follows the real predicate: shape plus sensitive-text filter", () => {
  assert.equal(isSafeWireguardPlanRef("wg-plan-jp01"), true);
  assert.equal(isSafeWireguardPlanRef("wg-secret-plan"), false);
  const sensitive = bwhPlan();
  sensitive.wireguard = { ...sensitive.wireguard, planRef: "wg-secret-plan" };
  assertInvalid(bwhSchema, sensitive);
  const dotted = bwhPlan();
  dotted.wireguard = { ...dotted.wireguard, planRef: "wg.plan.jp01" };
  assertInvalid(bwhSchema, dotted);
  const sensitiveNode = nodePlan();
  sensitiveNode.wireguardPlanRef = "wg-secret-plan";
  assertInvalid(nodeSchema, sensitiveNode);
});

test("public keys are carried by both plans and fingerprints are recomputed from key bytes", () => {
  assert.deepEqual(dualSideConsistency(bwhPlan(), nodePlan(), candidateBinding()), []);
  const wrongKey = nodePlan();
  wrongKey.wireguard = { ...wrongKey.wireguard, ownPublicKey: keyB64(0x33) };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongKey, candidateBinding()), ["wireguard_key_cross_match", "registration_binding_match"]);
  const wrongFingerprint = nodePlan();
  wrongFingerprint.wireguard = { ...wrongFingerprint.wireguard, ownPublicKeyFingerprint: keyFp(0x44) };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongFingerprint, candidateBinding()), ["wireguard_key_cross_match", "registration_binding_match"]);
  const shortKey = nodePlan();
  shortKey.wireguard = { ...shortKey.wireguard, ownPublicKey: Buffer.alloc(16, 1).toString("base64") };
  assertInvalid(nodeSchema, shortKey);
});

test("allowedIps and the node address are pinned to the approved /32 plan, semantically and structurally", () => {
  const defaultRoute = bwhPlan();
  defaultRoute.wireguard = { ...defaultRoute.wireguard, allowedIps: ["0.0.0.0/0"] };
  assertInvalid(bwhSchema, defaultRoute);
  const subnet = nodePlan();
  subnet.wireguard = { ...subnet.wireguard, allowedIps: ["10.77.0.0/24"] };
  assertInvalid(nodeSchema, subnet);
  const badOctet = bwhPlan();
  badOctet.wireguard = { ...badOctet.wireguard, allowedIps: ["10.77.0.999/32"] };
  assertInvalid(bwhSchema, badOctet);
  const wrongHost = nodePlan();
  wrongHost.wireguard = { ...wrongHost.wireguard, addressCidr: "10.77.0.3/32" };
  assertInvalid(nodeSchema, wrongHost);
  assert.equal(cidrWithinApprovedPlan("10.77.0.2/32"), true);
  assert.equal(cidrWithinApprovedPlan("10.77.0.999/32"), false);
  assert.equal(cidrWithinApprovedPlan("10.77.1.2/32"), false);
  assert.equal(cidrWithinApprovedPlan("10.77.0.2/24"), false);
  assert.equal(cidrWithinApprovedPlan("0.0.0.0/0"), false);
  // Reverse direction: the node must allow BWH's tunnel address too.
  const oneWay = nodePlan();
  oneWay.wireguard = { ...oneWay.wireguard, allowedIps: ["10.77.0.2/32"] };
  assert.ok(dualSideConsistency(bwhPlan(), oneWay, candidateBinding()).includes("allowed_ips_within_plan"));
});

test("schemas reject secret-bearing and out-of-contract documents", () => {
  assertInvalid(bwhSchema, { ...bwhPlan(), token: "synthetic" });
  assertInvalid(nodeSchema, { ...nodePlan(), privateKey: "synthetic" });
  assertInvalid(bwhSchema, { ...bwhPlan(), lifecycle: "active" });
  const { materialDigest, ...missingDigest } = bwhPlan().channels[0];
  assertInvalid(bwhSchema, { ...bwhPlan(), channels: [missingDigest] });
});

test("a conforming node plan can never authorise service activation", () => {
  assertInvalid(nodeSchema, { ...nodePlan(), activation: { controlServicesEnabled: false, trafficServicesEnabled: true } });
  assertInvalid(nodeSchema, { ...nodePlan(), activation: { controlServicesEnabled: true, trafficServicesEnabled: false } });
  const publicStats = nodePlan();
  publicStats.services[0].statsListen = "0.0.0.0";
  assertInvalid(nodeSchema, publicStats);
});

test("gate completeness: all 23 checks exactly once, enforced by the schema itself", () => {
  const missing = gateReport();
  missing.checks = missing.checks.filter((check) => check.id !== "material_digests_match");
  assertInvalid(gateSchema, missing);
  const duplicated = gateReport();
  duplicated.checks[duplicated.checks.length - 1] = { id: "node_ref_match", status: "pass" };
  assertInvalid(gateSchema, duplicated);
  const extra = gateReport();
  extra.checks.push({ id: "node_ref_match", status: "pass", detail: "again" });
  assertInvalid(gateSchema, extra);
  const singleCheck = { ...gateReport(), checks: [{ id: "node_ref_match", status: "pass" }] };
  assertInvalid(gateSchema, singleCheck);
});

test("gate verdict must cohere: pass requires the complete set, all passing", () => {
  assert.equal(gateVerdictCoherent(gateReport()), true);
  assert.equal(gateVerdictCoherent(gateReport({ material_digests_match: "fail" }, "pass")), false);
  assert.equal(gateVerdictCoherent(gateReport({ agent_binding_match: "not_evaluated" }, "pass")), false);
  assert.equal(gateVerdictCoherent(gateReport({ material_digests_match: "fail" }, "blocked")), true);
  assert.equal(gateVerdictCoherent(gateReport({}, "blocked")), false);
});

test("agent receipt: the normalized output of the real protocol validator passes the D1 schema", () => {
  const fixture = agentReceipt();
  assertValid(agentReceiptSchema, fixture);
  const normalised = validateDataPlaneApplyReceipt(fixture, PROTOCOL_OPTIONS);
  assertValid(agentReceiptSchema, normalised);
  // Raw input may omit redacted and materialDigests; the normalizer's
  // output — what this schema describes — always carries both.
  const raw = agentReceipt();
  delete raw.redacted;
  delete raw.materialDigests;
  const normalisedRaw = validateDataPlaneApplyReceipt(raw, PROTOCOL_OPTIONS);
  assert.equal(normalisedRaw.redacted, true);
  assert.deepEqual(normalisedRaw.materialDigests, []);
  assertValid(agentReceiptSchema, normalisedRaw);
  const objectConfig = { ...fixture, configTest: { status: "pass" } };
  assertInvalid(agentReceiptSchema, objectConfig);
  assert.throws(() => validateDataPlaneApplyReceipt(objectConfig, PROTOCOL_OPTIONS));
  assertInvalid(agentReceiptSchema, { ...fixture, status: "success" });
  assertInvalid(agentReceiptSchema, { ...fixture, redacted: false });
});

test("agent receipt: scoped tombstone and backup refs match the real normalizer exactly", () => {
  const tombstoned = {
    ...agentReceipt(),
    scopedTombstone: {
      sourceDesiredStateRef: "desired-jp01-vless-g0",
      sourceGeneration: "0",
      credentialDigests: [fp("9")]
    }
  };
  assertValid(agentReceiptSchema, tombstoned);
  const normalised = validateDataPlaneApplyReceipt(tombstoned, PROTOCOL_OPTIONS);
  assertValid(agentReceiptSchema, normalised);
  const missingSource = {
    ...tombstoned,
    scopedTombstone: { sourceDesiredStateRef: "desired-jp01-vless-g0", credentialDigests: [fp("9")] }
  };
  assertInvalid(agentReceiptSchema, missingSource);
  const dupDigests = {
    ...tombstoned,
    scopedTombstone: { ...tombstoned.scopedTombstone, credentialDigests: [fp("9"), fp("9")] }
  };
  assertInvalid(agentReceiptSchema, dupDigests);
  assert.throws(() => validateDataPlaneApplyReceipt(dupDigests, PROTOCOL_OPTIONS));
  const bareDigest = {
    ...tombstoned,
    scopedTombstone: { ...tombstoned.scopedTombstone, credentialDigests: ["9".repeat(64)] }
  };
  assertInvalid(agentReceiptSchema, bareDigest);
  const dotdot = { ...agentReceipt(), backupRef: ".." };
  assertInvalid(agentReceiptSchema, dotdot);
  assert.throws(() => validateDataPlaneApplyReceipt(dotdot, PROTOCOL_OPTIONS));
});

test("the summary receipt can never be confused with a raw agent receipt", () => {
  const summary = summaryReceipt();
  assertValid(summaryReceiptSchema, summary);
  assertInvalid(agentReceiptSchema, summary);
  assert.throws(() => validateDataPlaneApplyReceipt(
    { ...agentReceipt(), type: "gccgw_postinstall_summary_receipt" },
    PROTOCOL_OPTIONS
  ));
});

test("summary aggregation rules for D4: exact channel set and status coherence", () => {
  const summary = summaryReceipt();
  assert.equal(summaryCoversRegisteredChannels(summary, CHANNELS), true);
  assert.equal(summaryStatusCoherent(summary), true);
  const missingChannel = summaryReceipt();
  missingChannel.channelSummaries = missingChannel.channelSummaries.slice(0, 2);
  assert.equal(summaryCoversRegisteredChannels(missingChannel, CHANNELS), false);
  const failedChannel = summaryReceipt();
  failedChannel.channelSummaries[1].status = "failed";
  assert.equal(summaryStatusCoherent(failedChannel), false);
});

test("dual-side consistency covers all eleven binding fields and breaks on any drift", () => {
  assert.deepEqual(dualSideConsistency(bwhPlan(), nodePlan(), candidateBinding()), []);
  const wrongNode = { ...nodePlan(), nodeRef: "node-vultr-jp-02" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongNode, candidateBinding()), ["node_ref_match", "registration_binding_match"]);
  const wrongAgent = nodePlan();
  wrongAgent.agent = { ...wrongAgent.agent, authFingerprint: FP_A };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongAgent, candidateBinding()), ["agent_binding_match", "registration_binding_match"]);
  const wrongGeneration = { ...nodePlan(), generation: "2" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongGeneration, candidateBinding()), ["generation_match"]);
  const wrongRelease = nodePlan();
  wrongRelease.agent = { ...wrongRelease.agent, releaseRef: "source-deadbeef" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongRelease, candidateBinding()), ["release_ref_match", "registration_binding_match"]);
  const wrongPacket = { ...nodePlan(), firstBootPacketRef: "first-boot-packet-other" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongPacket, candidateBinding()), ["first_boot_packet_ref_match", "registration_binding_match"]);
  const wrongWgPlan = { ...nodePlan(), wireguardPlanRef: "wg-plan-other" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongWgPlan, candidateBinding()), ["wireguard_plan_ref_match", "registration_binding_match"]);
  const driftedChannels = bwhPlan();
  driftedChannels.channels = driftedChannels.channels.slice(0, 2);
  assert.ok(dualSideConsistency(driftedChannels, nodePlan(), candidateBinding()).includes("channel_refs_match"));
  const escapedIps = nodePlan();
  escapedIps.wireguard = { ...escapedIps.wireguard, allowedIps: [BWH_TUNNEL_ADDRESS, "192.168.0.1/32"] };
  assert.ok(dualSideConsistency(bwhPlan(), escapedIps, candidateBinding()).includes("allowed_ips_within_plan"));
});

test("allowedIps are exact whitelists for JP-01, not the whole /24", () => {
  const extra = bwhPlan();
  extra.wireguard = { ...extra.wireguard, allowedIps: ["10.77.0.2/32", "10.77.0.200/32"] };
  assertInvalid(bwhSchema, extra);
  const unallocated = bwhPlan();
  unallocated.wireguard = { ...unallocated.wireguard, allowedIps: ["10.77.0.200/32"] };
  assertInvalid(bwhSchema, unallocated);
  const wrongDirection = nodePlan();
  wrongDirection.wireguard = { ...wrongDirection.wireguard, allowedIps: ["10.77.0.2/32"] };
  assertInvalid(nodeSchema, wrongDirection);
});

test("joint drift of both plans still fails against the authoritative binding", () => {
  const driftedBwh = bwhPlan();
  const driftedNode = nodePlan();
  driftedBwh.providerRef = "provider-other";
  driftedNode.providerRef = "provider-other";
  const failed = dualSideConsistency(driftedBwh, driftedNode, candidateBinding());
  assert.ok(failed.includes("provider_ref_match"));
  assert.ok(failed.includes("registration_binding_match"));
  const driftedReleaseBwh = bwhPlan();
  const driftedReleaseNode = nodePlan();
  driftedReleaseBwh.releaseRef = "source-deadbeef";
  driftedReleaseNode.agent = { ...driftedReleaseNode.agent, releaseRef: "source-deadbeef" };
  assert.ok(dualSideConsistency(driftedReleaseBwh, driftedReleaseNode, candidateBinding()).includes("registration_binding_match"));
  const wrongAnchor = candidateBinding();
  wrongAnchor.agentAuthFingerprint = fp("8");
  assert.ok(dualSideConsistency(bwhPlan(), nodePlan(), wrongAnchor).includes("agent_binding_match"));
});

test("plan digests follow the frozen rule and detect tampering", () => {
  const bwh = bwhPlan();
  const node = nodePlan();
  assert.equal(digestOf(bwh), bwh.digest);
  assert.equal(digestOf(node), node.digest);
  const gate = gateReport();
  assert.equal(gate.bwhPlanDigest, bwh.digest);
  assert.equal(gate.nodePlanDigest, node.digest);
  assert.equal(gate.registrationBindingDigest, digestOf(candidateBinding()));
  const tampered = nodePlan();
  const recorded = tampered.digest;
  tampered.hostname = "node-vultr-jp-99";
  assert.notEqual(digestOf(tampered), recorded);
});

test("backup and rollback refs mirror the protocol basename rule exactly", () => {
  // Both fields run the same case set through BOTH the schema and the
  // real protocol validator; neither field's evidence stands in for
  // the other's.
  for (const field of ["backupRef", "rollbackRef"]) {
    for (const okValue of ["...", "::", "backup-2026-11-03.tar"]) {
      const receipt = { ...agentReceipt(), [field]: okValue };
      assertValid(agentReceiptSchema, receipt);
      assert.doesNotThrow(() => validateDataPlaneApplyReceipt(receipt, PROTOCOL_OPTIONS));
    }
    for (const badValue of [".", "..", "a/b", "a\\b"]) {
      const receipt = { ...agentReceipt(), [field]: badValue };
      assertInvalid(agentReceiptSchema, receipt);
      assert.throws(() => validateDataPlaneApplyReceipt(receipt, PROTOCOL_OPTIONS));
    }
  }
});
