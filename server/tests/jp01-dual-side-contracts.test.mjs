import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Contract tests for the dual-side integration schemas (D1).
//
// The fixtures are fully synthetic: fixed placeholder fingerprints and
// digests, no production values, no secrets. The validator below
// implements exactly the JSON Schema subset the D1 schemas use (type,
// const, enum, pattern, required, properties, additionalProperties,
// items, minItems, uniqueItems, minimum, maxLength), so the conformance
// claims in this file are exercised, not assumed.

const SCHEMA_DIR = new URL("../../ops/node-provisioning/schemas/", import.meta.url);

function loadSchema(name) {
  return JSON.parse(readFileSync(new URL(name, SCHEMA_DIR), "utf8"));
}

const bwhSchema = loadSchema("bwh-integration-plan.schema.json");
const nodeSchema = loadSchema("node-runtime-plan.schema.json");
const gateSchema = loadSchema("dual-side-gate.schema.json");
const receiptSchema = loadSchema("postinstall-receipt.schema.json");

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function validate(schema, value, path = "$") {
  const errors = [];
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
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

// Key vocabulary forbidden by the data-plane agent protocol
// (normalised: lowercase, alphanumerics only).
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
  }
  return acc;
}

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);
const FP_C = "c".repeat(64);
const FP_D = "d".repeat(64);
const CHANNELS = [
  "channel-vultr-jp-01-vless-reality-tcp",
  "channel-vultr-jp-01-hy2",
  "channel-vultr-jp-01-tuic"
];

function bwhPlan() {
  return {
    schema: "bwh-integration-plan/v1",
    planRef: "bwh-plan-jp01-g1",
    generation: 1,
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
      { channelRef: CHANNELS[0], runtimeAdapter: "xray", desiredStateRef: "desired-jp01-vless-g1", materialRef: "material-jp01-vless", materialDigest: "sha256:" + "1".repeat(64), endpointRef: "endpoint-jp01-vless" },
      { channelRef: CHANNELS[1], runtimeAdapter: "hysteria2", desiredStateRef: "desired-jp01-hy2-g1", materialRef: "material-jp01-hy2", materialDigest: "sha256:" + "2".repeat(64), endpointRef: "endpoint-jp01-hy2" },
      { channelRef: CHANNELS[2], runtimeAdapter: "mihomo", desiredStateRef: "desired-jp01-tuic-g1", materialRef: "material-jp01-tuic", materialDigest: "sha256:" + "3".repeat(64), endpointRef: "endpoint-jp01-tuic" }
    ],
    wireguard: {
      planRef: "wg-plan-jp01",
      bwhPeerPublicKeyFingerprint: FP_B,
      nodePeerPublicKeyFingerprint: FP_A,
      allowedIps: ["10.77.0.2/32"]
    },
    agent: { agentAuthFingerprint: FP_D, endpointRef: "agent-endpoint-bwh-private" },
    digest: "e".repeat(64)
  };
}

function nodePlan() {
  return {
    schema: "node-runtime-plan/v1",
    planRef: "node-plan-jp01-g1",
    generation: 1,
    nodeRef: "node-vultr-jp-01",
    providerRef: "provider-vultr",
    regionRef: "region-japan-pending-c1-gate",
    roleRef: "data-plane",
    hostname: "node-vultr-jp-01",
    imageManifestRef: "jp01-candidate-1-file-inventory",
    profileDigest: FP_C,
    wireguard: {
      interfaceName: "wg-child0",
      addressCidr: "10.77.0.2/32",
      ownPublicKeyFingerprint: FP_A,
      peerPublicKeyFingerprint: FP_B,
      allowedIps: ["10.77.0.1/32"]
    },
    agent: { releaseRef: "source-eb83197e", authFingerprint: FP_D, bwhEndpointRef: "agent-endpoint-bwh-private" },
    services: [
      { channelRef: CHANNELS[0], runtimeAdapter: "xray", unitName: "xray.service", configDigest: "sha256:" + "4".repeat(64), statsListen: "127.0.0.1" },
      { channelRef: CHANNELS[1], runtimeAdapter: "hysteria2", unitName: "hysteria2.service", configDigest: "sha256:" + "5".repeat(64), statsListen: "127.0.0.1" },
      { channelRef: CHANNELS[2], runtimeAdapter: "mihomo", unitName: "mihomo.service", configDigest: "sha256:" + "6".repeat(64), statsListen: "::1" }
    ],
    activation: { controlServicesEnabled: false, trafficServicesEnabled: false },
    digest: "f".repeat(64)
  };
}

function gateReport(checks, verdict) {
  return {
    schema: "dual-side-gate/v1",
    gateRef: "dual-side-gate-jp01-g1",
    evaluatedAt: "2026-11-03T00:00:00Z",
    nodeRef: "node-vultr-jp-01",
    generation: 1,
    profileDigest: FP_C,
    bwhPlanDigest: "e".repeat(64),
    nodePlanDigest: "f".repeat(64),
    checks,
    verdict
  };
}

function receipt() {
  return {
    schema: "postinstall-receipt/v1",
    type: "gccgw_data_plane_apply_receipt",
    receiptRef: "receipt-jp01-g1",
    nodeRef: "node-vultr-jp-01",
    channelRefs: [...CHANNELS],
    sourceDesiredStateRef: "desired-jp01-g1",
    sourceGeneration: 1,
    desiredStateRef: "desired-jp01-g1",
    generation: 1,
    materialDigest: "sha256:" + "1".repeat(64),
    credentialDigests: ["sha256:" + "7".repeat(64)],
    configTest: { status: "pass" },
    serviceActive: true,
    listenerPresent: true,
    status: "applied",
    appliedAt: "2026-11-03T00:00:00Z"
  };
}

// Cross-plan identity consistency, mirroring the gate's identity checks.
function dualSideConsistency(bwh, node) {
  const failed = [];
  const sorted = (values) => [...values].sort();
  if (bwh.nodeRef !== node.nodeRef) failed.push("node_ref_match");
  if (bwh.providerRef !== node.providerRef) failed.push("provider_ref_match");
  if (bwh.regionRef !== node.regionRef) failed.push("region_ref_match");
  if (bwh.roleRef !== node.roleRef) failed.push("role_ref_match");
  if (JSON.stringify(sorted(bwh.channelRefs)) !== JSON.stringify(sorted(node.services.map((s) => s.channelRef)))) {
    failed.push("channel_refs_match");
  }
  if (bwh.imageManifestRef !== node.imageManifestRef) failed.push("image_manifest_ref_match");
  if (bwh.profileDigest !== node.profileDigest) failed.push("profile_digest_match");
  if (bwh.generation !== node.generation) failed.push("generation_match");
  if (bwh.wireguard.nodePeerPublicKeyFingerprint !== node.wireguard.ownPublicKeyFingerprint ||
      bwh.wireguard.bwhPeerPublicKeyFingerprint !== node.wireguard.peerPublicKeyFingerprint) {
    failed.push("wireguard_key_cross_match");
  }
  if (bwh.agent.agentAuthFingerprint !== node.agent.authFingerprint) failed.push("agent_binding_match");
  return failed;
}

function gateVerdictCoherent(report) {
  const allPass = report.checks.every((check) => check.status === "pass");
  return (report.verdict === "pass") === allPass && report.checks.length > 0;
}

test("all four schemas are closed objects on draft 2020-12 with no forbidden key vocabulary", () => {
  for (const schema of [bwhSchema, nodeSchema, gateSchema, receiptSchema]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    for (const name of propertyNames(schema)) {
      const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      assert.ok(!FORBIDDEN_KEYS.has(normalised), `forbidden key vocabulary in schema: ${name}`);
    }
  }
});

test("synthetic fixtures conform to all four schemas", () => {
  assertValid(bwhSchema, bwhPlan());
  assertValid(nodeSchema, nodePlan());
  assertValid(gateSchema, gateReport([{ id: "node_ref_match", status: "pass" }], "pass"));
  assertValid(receiptSchema, receipt());
});

test("schemas reject secret-bearing and out-of-contract documents", () => {
  const withToken = { ...bwhPlan(), token: "synthetic" };
  assertInvalid(bwhSchema, withToken);
  const withPrivateKey = { ...nodePlan(), privateKey: "synthetic" };
  assertInvalid(nodeSchema, withPrivateKey);
  assertInvalid(bwhSchema, { ...bwhPlan(), lifecycle: "active" });
  assertInvalid(bwhSchema, { ...bwhPlan(), wireguard: { ...bwhPlan().wireguard, nodePeerPublicKeyFingerprint: "A".repeat(64) } });
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

test("receipt vocabulary matches the agent protocol exactly", () => {
  assertInvalid(receiptSchema, { ...receipt(), status: "success" });
  assertInvalid(receiptSchema, { ...receipt(), type: "apply_receipt" });
  assertValid(receiptSchema, { ...receipt(), status: "unchanged", serviceActive: false });
});

test("dual-side consistency holds for the fixture pair and breaks on any identity drift", () => {
  assert.deepEqual(dualSideConsistency(bwhPlan(), nodePlan()), []);
  const wrongNode = { ...nodePlan(), nodeRef: "node-vultr-jp-02" };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongNode), ["node_ref_match"]);
  const wrongKey = nodePlan();
  wrongKey.wireguard = { ...wrongKey.wireguard, ownPublicKeyFingerprint: FP_C };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongKey), ["wireguard_key_cross_match"]);
  const wrongAgent = nodePlan();
  wrongAgent.agent = { ...wrongAgent.agent, authFingerprint: FP_A };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongAgent), ["agent_binding_match"]);
  const wrongGeneration = { ...nodePlan(), generation: 2 };
  assert.deepEqual(dualSideConsistency(bwhPlan(), wrongGeneration), ["generation_match"]);
});

test("gate verdict must cohere with its checks: pass requires every check to pass", () => {
  assert.equal(gateVerdictCoherent(gateReport([{ id: "node_ref_match", status: "pass" }], "pass")), true);
  assert.equal(gateVerdictCoherent(gateReport([{ id: "node_ref_match", status: "fail" }], "pass")), false);
  assert.equal(gateVerdictCoherent(gateReport([{ id: "material_digests_match", status: "not_evaluated" }], "pass")), false);
  assert.equal(gateVerdictCoherent(gateReport([{ id: "node_ref_match", status: "fail" }], "blocked")), true);
  assertInvalid(gateSchema, gateReport([{ id: "invented_check", status: "pass" }], "blocked"));
});
