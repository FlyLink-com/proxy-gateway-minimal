import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildNodeImageFirstBootPacket } from '../services/node-image-first-boot-packet.mjs';
import {
  buildEdgeNodeRegistrationRecordFromFirstBootPacket,
  registrationBindingOf
} from '../services/edge/node-registration-ingestion.mjs';
import {
  buildD2ProfileFromFirstBootPacket,
  renderD2Candidate, evaluateD2Candidate,
  digestD2Object, fingerprintD2PublicKey
} from '../services/edge/jp01-dual-side-renderers.mjs';

// D2 Source Gate: synthetic inputs ONLY; no BWH access, key generation,
// service activation, private materials, actual config tests or Apply.
const schema = (name) => JSON.parse(readFileSync(
  new URL('../../ops/node-provisioning/schemas/' + name, import.meta.url),
  'utf8'));
const bwhSchema = schema('bwh-integration-plan.schema.json');
const nodeSchema = schema('node-runtime-plan.schema.json');
const gateSchema = schema('dual-side-gate.schema.json');
const profileSchema = schema('jp01-node-profile.schema.json');

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$id', '$schema', 'title', 'description', 'type', 'properties',
  'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'uniqueItems', 'pattern', 'minLength', 'maxLength', 'enum', 'const',
  'not', 'allOf', 'anyOf', 'contains', 'format'
]);
function assertSupportedSchema(s, path = '$schema') {
  for (const [keyword, value] of Object.entries(s)) {
    assert.ok(SUPPORTED_SCHEMA_KEYWORDS.has(keyword),
      path + ' uses unsupported JSON Schema keyword ' + keyword);
    if (keyword === 'properties') {
      for (const [name, child] of Object.entries(value)) {
        assertSupportedSchema(child, path + '.properties.' + name);
      }
    } else if (keyword === 'items' || keyword === 'not' ||
      keyword === 'contains' || keyword === 'additionalProperties' &&
      value !== false && value !== true) {
      assertSupportedSchema(value, path + '.' + keyword);
    } else if (keyword === 'allOf' || keyword === 'anyOf') {
      value.forEach((child, index) => assertSupportedSchema(child, path + '.' + keyword + '[' + index + ']'));
    }
  }
}
function validate(s, value, path = '$') {
  const errors = [];
  if (s.const !== undefined && JSON.stringify(value) !== JSON.stringify(s.const)) {
    errors.push(path + ' const');
  }
  if (s.enum && !s.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
    errors.push(path + ' enum');
  }
  if (s.not && validate(s.not, value, path).length === 0) errors.push(path + ' not');
  if (s.anyOf && !s.anyOf.some((v) => validate(v, value, path).length === 0)) {
    errors.push(path + ' anyOf');
  }
  for (const v of s.allOf || []) errors.push(...validate(v, value, path));
  if (s.contains && Array.isArray(value) &&
      !value.some((v) => validate(s.contains, v, path + '[]').length === 0)) {
    errors.push(path + ' contains');
  }
  if (s.type) {
    const actual = typeOf(value);
    if (!(s.type === actual || (s.type === 'number' && actual === 'integer'))) {
      errors.push(path + ' type');
      return errors;
    }
  }
  if (typeof value === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(value)) errors.push(path + ' pattern');
    if (s.minLength !== undefined && [...value].length < s.minLength) errors.push(path + ' minLength');
    if (s.maxLength !== undefined && [...value].length > s.maxLength) errors.push(path + ' maxLength');
    if (s.format === 'date-time' &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
          !Number.isFinite(Date.parse(value)))) {
      errors.push(path + ' format date-time');
    }
  }
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) errors.push(path + ' minItems');
    if (s.maxItems !== undefined && value.length > s.maxItems) errors.push(path + ' maxItems');
    if (s.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(path + ' uniqueItems');
    }
    if (s.items) value.forEach((v, i) => errors.push(...validate(s.items, v, path + '[' + i + ']')));
  }
  if (typeOf(value) === 'object') {
    for (const key of s.required || []) {
      if (!Object.hasOwn(value, key)) errors.push(path + '.missing.' + key);
    }
    for (const [key, v] of Object.entries(value)) {
      if (s.properties && Object.hasOwn(s.properties, key)) {
        errors.push(...validate(s.properties[key], v, path + '.' + key));
      } else if (s.additionalProperties === false) {
        errors.push(path + '.extra.' + key);
      } else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        errors.push(...validate(s.additionalProperties, v, path + '.' + key));
      }
    }
  }
  return errors;
}
function assertSchema(s, value) {
  assert.deepEqual(validate(s, value), []);
}
const key = (byte) => Buffer.alloc(32, byte).toString('base64');
const fingerprint = (byte) =>
  'sha256:' + createHash('sha256').update(Buffer.alloc(32, byte)).digest('hex');
const NODE_KEY = key(0x22);
const BWH_KEY = key(0x11);
const refHash = (digit) => 'sha256:' + digit.repeat(64);
const refs = [
  'channel-vultr-jp-01-vless-reality-tcp',
  'channel-vultr-jp-01-hy2',
  'channel-vultr-jp-01-tuic'
];
for (const candidateSchema of [bwhSchema, nodeSchema, gateSchema, profileSchema]) {
  assertSupportedSchema(candidateSchema);
}
function profile() {
  return {
    schema: 'jp01-d2-node-profile/v1',
    nodeRef: 'node-vultr-jp-01', providerRef: 'provider-vultr',
    regionRef: 'region-japan-pending-c1-gate', roleRef: 'data-plane',
    generation: '1', nodePlanRef: 'node-plan-jp01-g1',
    bwhPlanRef: 'bwh-plan-jp01-g1',
    imageManifestRef: 'jp01-candidate-1-file-inventory',
    releaseRef: 'source-eb83197e', firstBootPacketRef: 'first-boot-packet-jp01',
    wireguardPlanRef: 'wg-plan-jp01', hostname: 'node-vultr-jp-01',
    agentAuthFingerprint: refHash('d'),
    agentEndpointRef: 'agent-endpoint-bwh-private',
    channels: [
      { channelRef: refs[0], runtimeAdapter: 'xray',
        desiredStateRef: 'desired-jp01-vless-g1', materialRef: 'material-jp01-vless',
        materialDigest: refHash('1'), endpointRef: 'endpoint-jp01-vless',
        unitName: 'xray.service', configDigest: refHash('4'), statsListen: '127.0.0.1' },
      { channelRef: refs[1], runtimeAdapter: 'hysteria2',
        desiredStateRef: 'desired-jp01-hy2-g1', materialRef: 'material-jp01-hy2',
        materialDigest: refHash('2'), endpointRef: 'endpoint-jp01-hy2',
        unitName: 'hysteria2.service', configDigest: refHash('5'), statsListen: '127.0.0.1' },
      { channelRef: refs[2], runtimeAdapter: 'mihomo',
        desiredStateRef: 'desired-jp01-tuic-g1', materialRef: 'material-jp01-tuic',
        materialDigest: refHash('3'), endpointRef: 'endpoint-jp01-tuic',
        unitName: 'mihomo.service', configDigest: refHash('6'), statsListen: '::1' }
    ]
  };
}
function binding(p = profile()) {
  return {
    nodeRef: p.nodeRef, providerRef: p.providerRef, regionRef: p.regionRef,
    roleRef: p.roleRef, channelRefs: [...refs].sort(),
    imageManifestRef: p.imageManifestRef, releaseRef: p.releaseRef,
    firstBootPacketRef: p.firstBootPacketRef, wireguardPlanRef: p.wireguardPlanRef,
    wireguardPublicKeyFingerprint: fingerprint(0x22),
    agentAuthFingerprint: p.agentAuthFingerprint
  };
}
const render = (p = profile(), b = binding(p), bwhKey = BWH_KEY) =>
  renderD2Candidate({ profile: p, registrationBinding: b,
    nodePublicKey: NODE_KEY, bwhReadOnlyPublicKey: bwhKey });
const evaluate = (plans, b = binding(), existingBwhKey = BWH_KEY, p = profile()) =>
  evaluateD2Candidate({ ...plans, profile: p, registrationBinding: b,
    independentlyObservedBwhPublicKey: existingBwhKey,
    evaluatedAt: '2026-11-07T00:00:00Z', gateRef: 'd2-synthetic-jp01' });
const statusOf = (r, id) => r.checks.find((check) => check.id === id).status;

test('both candidate renderers satisfy frozen D1 schemas and digests', () => {
  const plans = render();
  assertSchema(profileSchema, profile());
  assertSchema(bwhSchema, plans.bwhPlan);
  assertSchema(nodeSchema, plans.nodePlan);
  assert.equal(plans.bwhPlan.digest, digestD2Object(plans.bwhPlan));
  assert.equal(plans.nodePlan.digest, digestD2Object(plans.nodePlan));
  assert.equal(plans.bwhPlan.profileDigest, plans.nodePlan.profileDigest);
  assert.equal(plans.bwhPlan.wireguard.bwhPeerPublicKey, BWH_KEY);
  assert.equal(plans.nodePlan.wireguard.peerPublicKey, BWH_KEY);
  assert.equal(plans.bwhPlan.wireguard.nodePeerPublicKey, NODE_KEY);
  assert.equal(plans.nodePlan.wireguard.ownPublicKey, NODE_KEY);
  assert.deepEqual(plans.bwhPlan.channelRefs, [...refs].sort());
  assert.equal(plans.nodePlan.activation.trafficServicesEnabled, false);
  assert.equal(plans.nodePlan.activation.controlServicesEnabled, false);
});


function firstBootInput(approved = false) {
  return {
    generatedAt: '2026-11-07T00:00:00.000Z',
    node: {
      nodeRef: 'node-vultr-jp-01', providerRef: 'provider-vultr',
      regionRef: 'region-japan-pending-c1-gate', roleRef: 'data-plane',
      channelRefs: [...refs]
    },
    image: {
      imageManifestRef: 'jp01-candidate-1-file-inventory',
      releaseRef: 'source-eb83197e',
      artifactSha256Recorded: true, noSecretImageConfirmed: true
    },
    controlPlane: {
      nodeRegistrationDryRunPassed: true, privateAgentRoutePlanned: true,
      protectedMaterialInjectPlanned: true, agentNodeIdentityPlanned: true
    },
    wireguard: {
      planRef: 'wg-plan-jp01', tunnelAddressAssigned: true,
      hostKeyGenerationPlanned: true, peerPublicKeyExchangePlanned: true,
      toolsPinnedInImageManifest: true
    },
    runtime: {
      servicesDisabledInImage: true, xrayConfigTestPlanned: true,
      hysteria2ConfigTestPlanned: true, tuicConfigTestPlanned: true,
      statsLoopbackOnly: true
    },
    receiptGate: {
      desiredStatePullRequired: true, materialPullRequired: true,
      appliedReceiptRequired: true, renderWithholdsUntilReceipt: true
    },
    approval: {
      exactApprovalReceived: approved, firstBootApplyApproved: approved
    }
  };
}
function runtimeProfile(p = profile()) {
  return {
    generation: p.generation, nodePlanRef: p.nodePlanRef,
    bwhPlanRef: p.bwhPlanRef, firstBootPacketRef: p.firstBootPacketRef,
    hostname: p.hostname, agentEndpointRef: p.agentEndpointRef,
    channels: p.channels.map((channel) => ({ ...channel }))
  };
}

test('D2 adapter derives one Node Profile from a ready non-apply first-boot packet and E1 binding', () => {
  const firstBootPacket = buildNodeImageFirstBootPacket(firstBootInput(false));
  assert.equal(firstBootPacket.packet.readyForFirstBootApproval, true);
  assert.equal(firstBootPacket.packet.firstBootApplyAllowed, false);
  const projected = buildD2ProfileFromFirstBootPacket({
    firstBootPacket, runtimeProfile: runtimeProfile(),
    wireguardPublicKeyFingerprint: fingerprint(0x22),
    agentAuthFingerprint: refHash('d')
  });
  assertSchema(profileSchema, projected.profile);
  assert.deepEqual(projected.profile, profile());
  assert.deepEqual(projected.registrationBinding, binding());
  const plans = renderD2Candidate({
    profile: projected.profile, registrationBinding: projected.registrationBinding,
    nodePublicKey: NODE_KEY, bwhReadOnlyPublicKey: BWH_KEY
  });
  assertSchema(bwhSchema, plans.bwhPlan);
  assertSchema(nodeSchema, plans.nodePlan);
  assert.equal(evaluate(plans, projected.registrationBinding, BWH_KEY,
    projected.profile).verdict, 'blocked');
});

test('D2 preview binding equals the E1 executor binding projection without writing a record', () => {
  const firstBootPacket = buildNodeImageFirstBootPacket(firstBootInput(true));
  const options = {
    firstBootPacketRef: profile().firstBootPacketRef,
    wireguardPublicKeyFingerprint: fingerprint(0x22),
    agentAuthFingerprint: refHash('d')
  };
  const candidate = buildD2ProfileFromFirstBootPacket({
    firstBootPacket, runtimeProfile: runtimeProfile(),
    wireguardPublicKeyFingerprint: options.wireguardPublicKeyFingerprint,
    agentAuthFingerprint: options.agentAuthFingerprint
  });
  const executorRecord = buildEdgeNodeRegistrationRecordFromFirstBootPacket(
    firstBootPacket, options);
  assert.deepEqual(candidate.registrationBinding, registrationBindingOf(executorRecord));
});

test('D2 profile adapter rejects unready packets, missing anchors and identity/channel drift', () => {
  const readyPacket = buildNodeImageFirstBootPacket(firstBootInput(false));
  const input = {
    firstBootPacket: readyPacket, runtimeProfile: runtimeProfile(),
    wireguardPublicKeyFingerprint: fingerprint(0x22),
    agentAuthFingerprint: refHash('d')
  };
  assert.throws(() => buildD2ProfileFromFirstBootPacket({
    ...input, firstBootPacket: { ...readyPacket, packet: {
      ...readyPacket.packet, readyForFirstBootApproval: false
    } }
  }), /first_boot_packet_not_ready/);
  assert.throws(() => buildD2ProfileFromFirstBootPacket({
    ...input, wireguardPublicKeyFingerprint: ''
  }), /d2_registration_candidate_requires_identity_anchors/);
  const drifted = runtimeProfile();
  drifted.channels[0].channelRef = 'channel-other';
  assert.throws(() => buildD2ProfileFromFirstBootPacket({
    ...input, runtimeProfile: drifted
  }), /d2_profile_channel_binding_mismatch/);
  assert.throws(() => buildD2ProfileFromFirstBootPacket({
    ...input, firstBootPacket: { ...readyPacket, safety: {
      ...readyPacket.safety, noProductionMutation: false
    } }
  }), /first_boot_packet_safety_not_proven/);
});

test('canonical digest is stable for object property order and sensitive to changes', () => {
  assert.equal(digestD2Object({ b: { y: 2, x: 1 }, a: [2, 1] }),
    digestD2Object({ a: [2, 1], b: { x: 1, y: 2 } }));
  assert.notEqual(digestD2Object({ a: [1, 2] }), digestD2Object({ a: [2, 1] }));
  const plans = render();
  plans.bwhPlan.nodeRef = 'node-other';
  assert.notEqual(plans.bwhPlan.digest, digestD2Object(plans.bwhPlan));
});

test('public-key fingerprint is computed from 32 raw bytes with strict base64', () => {
  assert.equal(fingerprintD2PublicKey(BWH_KEY), fingerprint(0x11));
  assert.throws(() => fingerprintD2PublicKey('x'), /invalid_wireguard_public_key/);
  assert.throws(() => fingerprintD2PublicKey(Buffer.alloc(16).toString('base64')), /invalid_wireguard_public_key/);
  assert.throws(() => fingerprintD2PublicKey(BWH_KEY.slice(0, -1) + 'x'), /invalid_wireguard_public_key/);
});

test('both plans are identity-bound and service activation is impossible in the candidate', () => {
  const p = profile();
  p.channels.reverse();
  const plans = render(p);
  assertSchema(bwhSchema, plans.bwhPlan);
  assertSchema(nodeSchema, plans.nodePlan);
  assert.deepEqual(plans.bwhPlan.channelRefs, [...refs].sort());
  assert.equal(plans.bwhPlan.lifecycle, 'private-validation');
  assert.equal(plans.bwhPlan.pool, 'private');
  assert.equal(plans.nodePlan.activation.controlServicesEnabled, false);
  assert.equal(plans.nodePlan.activation.trafficServicesEnabled, false);
});

test('bad profile fields, unsafe references and secret-bearing inputs fail closed', () => {
  assert.throws(() => render({ ...profile(), token: 'x' }), /invalid_d2_input_shape/);
  assert.throws(() => render({ ...profile(), nodeRef: 'node-vultr-jp-02' }), /unapproved_d2_profile/);
  assert.throws(() => render({ ...profile(), wireguardPlanRef: 'wg-secret-plan' }), /invalid_d2_profile/);
  assert.throws(() => render({ ...profile(), agentEndpointRef: 'token-credential' }), /invalid_d2_reference/);
  const p1 = profile();
  p1.channels[0].statsListen = '0.0.0.0';
  assert.throws(() => render(p1), /invalid_d2_channel/);
  const p2 = profile();
  p2.channels[0].materialRef = 'https://example.com/sub';
  assert.throws(() => render(p2), /invalid_d2_reference/);
  const p3 = profile();
  p3.channels.push({ ...p3.channels[0] });
  assert.throws(() => render(p3), /invalid_d2_channel/);
});

test('E1-A binding drift, wrong agent and wrong node public key are rejected', () => {
  assert.throws(() => render(profile(), { ...binding(), agentAuthFingerprint: refHash('e') }),
    /registration_binding_mismatch/);
  assert.throws(() => render(profile(), { ...binding(), providerRef: 'provider-other' }),
    /registration_binding_mismatch/);
  assert.throws(() => render(profile(), { ...binding(), wireguardPublicKeyFingerprint: fingerprint(0x33) }),
    /registration_binding_mismatch/);
  assert.throws(() => renderD2Candidate({ profile: profile(),
    registrationBinding: binding(), nodePublicKey: key(0x33), bwhReadOnlyPublicKey: BWH_KEY }),
    /registration_binding_mismatch/);
});

test('synthetic gate output is D1-schema conformant but ALWAYS blocked', () => {
  const result = evaluate(render());
  assertSchema(gateSchema, result);
  assert.equal(result.verdict, 'blocked');
  assert.equal(result.checks.length, 23);
  assert.equal(new Set(result.checks.map((x) => x.id)).size, 23);
  for (const id of ['file_permissions', 'protocol_config_tests', 'material_digests_match',
    'secret_hygiene_scan', 'agent_private_path_only']) {
    assert.equal(statusOf(result, id), 'not_evaluated');
  }
  for (const id of ['wireguard_key_cross_match', 'registration_binding_match',
    'allowed_ips_within_plan', 'no_default_route', 'agent_binding_match']) {
    assert.equal(statusOf(result, id), 'pass');
  }
});

test('BWH key continuity rejects both plans drifting together to a new BWH key', () => {
  const forged = render(profile(), binding(), key(0x44));
  // Both plans are internally coherent, but the independent old BWH key
  // remains fixed. Equality of two newly invented keys is not continuity.
  assertSchema(bwhSchema, forged.bwhPlan);
  assertSchema(nodeSchema, forged.nodePlan);
  const result = evaluate(forged, binding(), BWH_KEY);
  assertSchema(gateSchema, result);
  assert.equal(result.verdict, 'blocked');
  assert.equal(statusOf(result, 'wireguard_key_cross_match'), 'fail');
  assert.equal(statusOf(result, 'registration_binding_match'), 'fail');
});


test('gate recomputes the canonical profile digest and checks the Agent endpoint cross-binding', () => {
  const plans = render();
  const driftedProfile = profile();
  driftedProfile.generation = '2';
  const drifted = evaluate(plans, binding(), BWH_KEY, driftedProfile);
  assert.equal(statusOf(drifted, 'profile_digest_match'), 'fail');
  assert.equal(statusOf(drifted, 'generation_match'), 'fail');
  const endpointDrift = render();
  endpointDrift.nodePlan.agent.bwhEndpointRef = 'agent-endpoint-other';
  endpointDrift.nodePlan.digest = digestD2Object(endpointDrift.nodePlan);
  const endpointResult = evaluate(endpointDrift);
  assert.equal(statusOf(endpointResult, 'agent_binding_match'), 'fail');
  assert.equal(endpointResult.verdict, 'blocked');
});

test('candidate gate rejects asymmetric keys and forged plan digests', () => {
  const asymmetric = render();
  asymmetric.nodePlan.wireguard.peerPublicKey = key(0x55);
  asymmetric.nodePlan.wireguard.peerPublicKeyFingerprint = fingerprint(0x55);
  asymmetric.nodePlan.digest = digestD2Object(asymmetric.nodePlan);
  assert.equal(statusOf(evaluate(asymmetric), 'wireguard_key_cross_match'), 'fail');
  const tampered = render();
  tampered.bwhPlan.generation = '2';
  const result = evaluate(tampered);
  assert.equal(statusOf(result, 'generation_match'), 'fail');
  assert.equal(statusOf(result, 'profile_digest_match'), 'fail');
});

test('default routes, public stats and service enablement cannot yield a pass', () => {
  const altered = render();
  altered.bwhPlan.wireguard.allowedIps = ['0.0.0.0/0'];
  altered.nodePlan.services[0].statsListen = '0.0.0.0';
  altered.nodePlan.activation.trafficServicesEnabled = true;
  const result = evaluate(altered);
  assert.equal(result.verdict, 'blocked');
  assert.equal(statusOf(result, 'allowed_ips_within_plan'), 'fail');
  assert.equal(statusOf(result, 'no_default_route'), 'fail');
  assert.equal(statusOf(result, 'stats_loopback_only'), 'fail');
});

test('missing independent key observation cannot yield identity continuity', () => {
  const result = evaluate(render(), binding(), null);
  assert.equal(result.verdict, 'blocked');
  assert.equal(statusOf(result, 'wireguard_key_cross_match'), 'fail');
  assertSchema(gateSchema, result);
});

test('preflight rejects unsafe time, gate reference and missing inputs', () => {
  const plans = render();
  assert.throws(() => evaluateD2Candidate({ ...plans, profile: profile(),
    registrationBinding: binding(), evaluatedAt: 'invalid', gateRef: 'd2-gate' }),
    /invalid_d2_gate_time/);
  assert.throws(() => evaluateD2Candidate({ ...plans, profile: profile(),
    registrationBinding: binding(), evaluatedAt: '2026-11-07T00:00:00Z',
    gateRef: 'token-secret' }), /invalid_d2_reference/);
  assert.throws(() => evaluateD2Candidate({ profile: profile(), bwhPlan: null, nodePlan: null,
    registrationBinding: binding(), evaluatedAt: '2026-11-07T00:00:00Z',
    gateRef: 'd2-gate' }), /invalid_d2_gate_input/);
});
