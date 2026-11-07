import { createHash } from 'node:crypto';
import { isSafeWireguardPlanRef } from '../node-image-first-boot-packet.mjs';

// D2 is a source-only, inert candidate renderer. In particular it NEVER reads
// BWH, generates keys, writes runtime files, provisions nodes or authorizes Apply.
// Its BWH key is a required read-only *input*; an independent observation
// remains mandatory before a production-adjacent gate can pass.

const REF = /^[A-Za-z0-9._:-]{1,160}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const KEY = /^[A-Za-z0-9+/]{43}=$/;
const HOSTNAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SERVICE = /^[A-Za-z0-9@._-]+\.service$/;
const ADAPTERS = new Set(['xray', 'hysteria2', 'mihomo']);
const PROFILE_FIELDS = [
  'schema', 'nodeRef', 'providerRef', 'regionRef', 'roleRef', 'generation',
  'nodePlanRef', 'bwhPlanRef', 'imageManifestRef', 'releaseRef',
  'firstBootPacketRef', 'wireguardPlanRef', 'hostname',
  'agentAuthFingerprint', 'agentEndpointRef', 'channels'
];
const CHANNEL_FIELDS = [
  'channelRef', 'runtimeAdapter', 'desiredStateRef', 'materialRef',
  'materialDigest', 'endpointRef', 'unitName', 'configDigest', 'statsListen'
];
const BINDING_FIELDS = [
  'nodeRef', 'providerRef', 'regionRef', 'roleRef', 'channelRefs',
  'imageManifestRef', 'releaseRef', 'firstBootPacketRef', 'wireguardPlanRef',
  'wireguardPublicKeyFingerprint', 'agentAuthFingerprint'
];
const GATE_IDS = Object.freeze([
  'node_ref_match', 'provider_ref_match', 'region_ref_match', 'role_ref_match',
  'channel_refs_match', 'image_manifest_ref_match', 'release_ref_match',
  'first_boot_packet_ref_match', 'wireguard_plan_ref_match',
  'profile_digest_match', 'generation_match', 'wireguard_key_cross_match',
  'allowed_ips_within_plan', 'no_default_route', 'agent_binding_match',
  'registration_binding_match', 'agent_private_path_only',
  'protocol_config_tests', 'stats_loopback_only',
  'no_unreplaced_placeholders', 'file_permissions', 'secret_hygiene_scan',
  'material_digests_match'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!isRecord(value) || Object.keys(value).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(value, k))) {
    throw new Error('invalid_d2_input_shape');
  }
}

function safeRef(value) {
  if (typeof value !== 'string' || !REF.test(value) ||
      /(?:secret|password|privatekey|credential|customerdata|token)/i.test(value)) {
    throw new Error('invalid_d2_reference');
  }
  return value;
}

function sha(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function digestD2Object(value) {
  if (!isRecord(value)) throw new Error('invalid_digest_input');
  const { digest: _digest, ...withoutOwnDigest } = value;
  return sha(Buffer.from(JSON.stringify(canonical(withoutOwnDigest)), 'utf8'));
}

export function fingerprintD2PublicKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) {
    throw new Error('invalid_wireguard_public_key');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== value) {
    throw new Error('invalid_wireguard_public_key');
  }
  return sha(bytes);
}

function checkProfile(profile) {
  exactKeys(profile, PROFILE_FIELDS);
  if (profile.schema !== 'jp01-d2-node-profile/v1' ||
      profile.nodeRef !== 'node-vultr-jp-01') {
    throw new Error('unapproved_d2_profile');
  }
  for (const key of PROFILE_FIELDS) {
    if (['schema', 'hostname', 'agentAuthFingerprint', 'channels',
      'wireguardPlanRef'].includes(key)) continue;
    safeRef(profile[key]);
  }
  if (!isSafeWireguardPlanRef(profile.wireguardPlanRef) ||
      !HOSTNAME.test(profile.hostname) ||
      !FINGERPRINT.test(profile.agentAuthFingerprint) ||
      !Array.isArray(profile.channels) || profile.channels.length === 0) {
    throw new Error('invalid_d2_profile');
  }
  const seen = new Set();
  for (const channel of profile.channels) {
    exactKeys(channel, CHANNEL_FIELDS);
    for (const key of ['channelRef', 'desiredStateRef', 'materialRef', 'endpointRef']) {
      safeRef(channel[key]);
    }
    if (!ADAPTERS.has(channel.runtimeAdapter) ||
        !FINGERPRINT.test(channel.materialDigest) ||
        !FINGERPRINT.test(channel.configDigest) ||
        !SERVICE.test(channel.unitName) ||
        !['127.0.0.1', '::1'].includes(channel.statsListen) ||
        seen.has(channel.channelRef)) {
      throw new Error('invalid_d2_channel');
    }
    seen.add(channel.channelRef);
  }
  return { ...profile, channels: profile.channels.map((c) => ({ ...c }))
    .sort((a, b) => a.channelRef.localeCompare(b.channelRef)) };
}

function checkBinding(binding, profile, nodeKeyFingerprint) {
  exactKeys(binding, BINDING_FIELDS);
  if (!Array.isArray(binding.channelRefs) ||
      !binding.channelRefs.every((ref) => typeof ref === 'string') ||
      !FINGERPRINT.test(binding.wireguardPublicKeyFingerprint) ||
      !FINGERPRINT.test(binding.agentAuthFingerprint)) {
    throw new Error('invalid_registration_binding');
  }
  const channels = profile.channels.map((c) => c.channelRef);
  for (const key of ['nodeRef', 'providerRef', 'regionRef', 'roleRef',
    'imageManifestRef', 'releaseRef', 'firstBootPacketRef', 'wireguardPlanRef']) {
    if (binding[key] !== profile[key]) throw new Error('registration_binding_mismatch');
  }
  if (JSON.stringify([...binding.channelRefs].sort()) !== JSON.stringify(channels) ||
      binding.wireguardPublicKeyFingerprint !== nodeKeyFingerprint ||
      binding.agentAuthFingerprint !== profile.agentAuthFingerprint) {
    throw new Error('registration_binding_mismatch');
  }
}

function digestPlan(plan) {
  const candidate = { ...plan, digest: '' };
  candidate.digest = digestD2Object(candidate);
  return candidate;
}

/**
 * Both plans are deliberately inactive. bwhReadOnlyPublicKey must come from
 * independent read-only BWH inventory at a separately authorized later gate.
 * Passing a synthetic key here NEVER constitutes proof of BWH continuity.
 */
export function renderD2Candidate({ profile, registrationBinding,
  nodePublicKey, bwhReadOnlyPublicKey }) {
  const p = checkProfile(profile);
  const nodeFingerprint = fingerprintD2PublicKey(nodePublicKey);
  const bwhFingerprint = fingerprintD2PublicKey(bwhReadOnlyPublicKey);
  checkBinding(registrationBinding, p, nodeFingerprint);
  const profileDigest = digestD2Object(p);
  const common = {
    generation: p.generation, nodeRef: p.nodeRef, providerRef: p.providerRef,
    regionRef: p.regionRef, roleRef: p.roleRef, imageManifestRef: p.imageManifestRef,
    firstBootPacketRef: p.firstBootPacketRef, profileDigest
  };
  const channels = p.channels.map((c) => ({
    channelRef: c.channelRef, runtimeAdapter: c.runtimeAdapter,
    desiredStateRef: c.desiredStateRef, materialRef: c.materialRef,
    materialDigest: c.materialDigest, endpointRef: c.endpointRef
  }));
  const bwhPlan = digestPlan({
    schema: 'bwh-integration-plan/v1',
    planRef: p.bwhPlanRef, ...common,
    releaseRef: p.releaseRef, channelRefs: channels.map((c) => c.channelRef),
    lifecycle: 'private-validation', pool: 'private', channels,
    wireguard: {
      planRef: p.wireguardPlanRef, bwhPeerPublicKey: bwhReadOnlyPublicKey,
      bwhPeerPublicKeyFingerprint: bwhFingerprint,
      nodePeerPublicKey: nodePublicKey,
      nodePeerPublicKeyFingerprint: nodeFingerprint,
      allowedIps: ['10.77.0.2/32']
    },
    agent: { agentAuthFingerprint: p.agentAuthFingerprint,
      endpointRef: p.agentEndpointRef }
  });
  const nodePlan = digestPlan({
    schema: 'node-runtime-plan/v1',
    planRef: p.nodePlanRef, ...common, hostname: p.hostname,
    wireguardPlanRef: p.wireguardPlanRef,
    wireguard: {
      interfaceName: 'wg-child0', addressCidr: '10.77.0.2/32',
      ownPublicKey: nodePublicKey, ownPublicKeyFingerprint: nodeFingerprint,
      peerPublicKey: bwhReadOnlyPublicKey,
      peerPublicKeyFingerprint: bwhFingerprint, allowedIps: ['10.77.0.1/32']
    },
    agent: { releaseRef: p.releaseRef, authFingerprint: p.agentAuthFingerprint,
      bwhEndpointRef: p.agentEndpointRef },
    services: p.channels.map((c) => ({
      channelRef: c.channelRef, runtimeAdapter: c.runtimeAdapter,
      unitName: c.unitName, configDigest: c.configDigest,
      statsListen: c.statsListen
    })),
    activation: { controlServicesEnabled: false, trafficServicesEnabled: false }
  });
  return { bwhPlan, nodePlan };
}

function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function ordered(values) { return [...values].sort(); }
function checkKey(value, expectedFingerprint) {
  try { return fingerprintD2PublicKey(value) === expectedFingerprint; }
  catch { return false; }
}

/**
 * P4 synthetic preflight: full 23-check shape, but always BLOCKED. Real BWH
 * inventory provenance, config tests, permissions, secret inspection and
 * material evidence cannot be certified by source-only rendering.
 */
export function evaluateD2Candidate({ bwhPlan, nodePlan, registrationBinding,
  independentlyObservedBwhPublicKey, evaluatedAt, gateRef }) {
  if (!isRecord(bwhPlan) || !isRecord(nodePlan) ||
      !isRecord(registrationBinding)) throw new Error('invalid_d2_gate_input');
  safeRef(gateRef);
  if (typeof evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evaluatedAt))) {
    throw new Error('invalid_d2_gate_time');
  }
  const states = Object.fromEntries(GATE_IDS.map((id) => [id, 'not_evaluated']));
  const match = (id, ok) => { states[id] = ok ? 'pass' : 'fail'; };
  const b = bwhPlan, n = nodePlan, a = registrationBinding;
  const ns = n.services?.map((x) => x.channelRef) ?? [];
  const bs = b.channels?.map((x) => x.channelRef) ?? [];
  const refs = b.channelRefs ?? [];
  for (const [id, left, right, binding] of [
    ['node_ref_match', b.nodeRef, n.nodeRef, a.nodeRef],
    ['provider_ref_match', b.providerRef, n.providerRef, a.providerRef],
    ['region_ref_match', b.regionRef, n.regionRef, a.regionRef],
    ['role_ref_match', b.roleRef, n.roleRef, a.roleRef],
    ['image_manifest_ref_match', b.imageManifestRef, n.imageManifestRef, a.imageManifestRef],
    ['release_ref_match', b.releaseRef, n.agent?.releaseRef, a.releaseRef],
    ['first_boot_packet_ref_match', b.firstBootPacketRef, n.firstBootPacketRef, a.firstBootPacketRef],
    ['wireguard_plan_ref_match', b.wireguard?.planRef, n.wireguardPlanRef, a.wireguardPlanRef]
  ]) match(id, left !== undefined && left === right && right === binding);
  match('channel_refs_match', equal(ordered(refs), ordered(bs)) &&
    equal(ordered(bs), ordered(ns)) &&
    equal(ordered(ns), ordered(a.channelRefs ?? [])));
  match('generation_match', b.generation === n.generation);
  match('profile_digest_match', b.profileDigest === n.profileDigest &&
    FINGERPRINT.test(b.profileDigest || '') &&
    b.digest === digestD2Object(b) && n.digest === digestD2Object(n));
  const wgB = b.wireguard || {}, wgN = n.wireguard || {};
  const inventoryOk = typeof independentlyObservedBwhPublicKey === 'string' &&
    checkKey(independentlyObservedBwhPublicKey,
      wgB.bwhPeerPublicKeyFingerprint) &&
    independentlyObservedBwhPublicKey === wgB.bwhPeerPublicKey &&
    independentlyObservedBwhPublicKey === wgN.peerPublicKey;
  match('wireguard_key_cross_match',
    inventoryOk &&
    wgB.nodePeerPublicKey === wgN.ownPublicKey &&
    wgB.bwhPeerPublicKey === wgN.peerPublicKey &&
    wgB.nodePeerPublicKeyFingerprint === wgN.ownPublicKeyFingerprint &&
    wgB.bwhPeerPublicKeyFingerprint === wgN.peerPublicKeyFingerprint &&
    checkKey(wgB.nodePeerPublicKey, wgB.nodePeerPublicKeyFingerprint) &&
    checkKey(wgN.ownPublicKey, wgN.ownPublicKeyFingerprint) &&
    checkKey(wgN.peerPublicKey, wgN.peerPublicKeyFingerprint) &&
    checkKey(wgB.bwhPeerPublicKey, wgB.bwhPeerPublicKeyFingerprint) &&
    a.wireguardPublicKeyFingerprint === wgN.ownPublicKeyFingerprint);
  match('allowed_ips_within_plan', equal(wgB.allowedIps, ['10.77.0.2/32']) &&
    equal(wgN.allowedIps, ['10.77.0.1/32']) &&
    wgN.addressCidr === '10.77.0.2/32' && wgN.interfaceName === 'wg-child0');
  match('no_default_route', !JSON.stringify([wgB.allowedIps, wgN.allowedIps])
    .includes('0.0.0.0/0') &&
    !JSON.stringify([wgB.allowedIps, wgN.allowedIps]).includes('::/0'));
  match('agent_binding_match', b.agent?.agentAuthFingerprint === a.agentAuthFingerprint &&
    n.agent?.authFingerprint === a.agentAuthFingerprint);
  match('registration_binding_match', [
    'node_ref_match', 'provider_ref_match', 'region_ref_match', 'role_ref_match',
    'channel_refs_match', 'image_manifest_ref_match', 'release_ref_match',
    'first_boot_packet_ref_match', 'wireguard_plan_ref_match',
    'wireguard_key_cross_match', 'agent_binding_match'
  ].every((id) => states[id] === 'pass'));
  match('stats_loopback_only', Array.isArray(n.services) &&
    n.services.length > 0 && n.services.every((s) =>
      ['127.0.0.1', '::1'].includes(s.statsListen)) &&
    n.activation?.controlServicesEnabled === false &&
    n.activation?.trafficServicesEnabled === false);
  match('no_unreplaced_placeholders', !/\{\{|\}\}|__TODO__|<replace>/i
    .test(JSON.stringify([b, n])));
  // These runtime/provenance checks are deliberately not claimed by D2.
  return {
    schema: 'dual-side-gate/v1', gateRef, evaluatedAt, nodeRef: b.nodeRef,
    generation: b.generation, profileDigest: b.profileDigest,
    bwhPlanDigest: b.digest, nodePlanDigest: n.digest,
    registrationBindingDigest: digestD2Object(a),
    checks: GATE_IDS.map((id) => ({ id, status: states[id] })),
    verdict: 'blocked'
  };
}
