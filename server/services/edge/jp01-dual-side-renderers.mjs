import { createHash } from 'node:crypto';
import { isSafeWireguardPlanRef } from '../node-image-first-boot-packet.mjs';
export { buildD2ProfileFromFirstBootPacket } from './jp01-d2-profile-adapter.mjs';

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
export function evaluateD2Candidate({ profile, bwhPlan, nodePlan,
  registrationBinding, independentlyObservedBwhPublicKey, evaluatedAt, gateRef }) {
  if (!isRecord(bwhPlan) || !isRecord(nodePlan) ||
      !isRecord(registrationBinding)) throw new Error('invalid_d2_gate_input');
  const p = checkProfile(profile);
  safeRef(gateRef);
  if (typeof evaluatedAt !== 'string' || !Number.isFinite(Date.parse(evaluatedAt))) {
    throw new Error('invalid_d2_gate_time');
  }
  const states = Object.fromEntries(GATE_IDS.map((id) => [id, 'not_evaluated']));
  const match = (id, ok) => { states[id] = ok ? 'pass' : 'fail'; };
  const b = bwhPlan, n = nodePlan, a = registrationBinding;
  const wgB = isRecord(b.wireguard) ? b.wireguard : {};
  const wgN = isRecord(n.wireguard) ? n.wireguard : {};
  const agentB = isRecord(b.agent) ? b.agent : {};
  const agentN = isRecord(n.agent) ? n.agent : {};
  const channelsB = Array.isArray(b.channels) ? b.channels : [];
  const servicesN = Array.isArray(n.services) ? n.services : [];
  const profileChannels = p.channels;
  const refs = Array.isArray(b.channelRefs) ? b.channelRefs : [];
  const bindingChannels = Array.isArray(a.channelRefs) ? a.channelRefs : [];
  const expectedProfileDigest = digestD2Object(p);

  match('node_ref_match', b.nodeRef === n.nodeRef &&
    n.nodeRef === p.nodeRef && p.nodeRef === a.nodeRef);
  match('provider_ref_match', b.providerRef === n.providerRef &&
    n.providerRef === p.providerRef && p.providerRef === a.providerRef);
  match('region_ref_match', b.regionRef === n.regionRef &&
    n.regionRef === p.regionRef && p.regionRef === a.regionRef);
  match('role_ref_match', b.roleRef === n.roleRef &&
    n.roleRef === p.roleRef && p.roleRef === a.roleRef);
  const bChannelRefs = channelsB.map((c) => c?.channelRef);
  const nodeChannelRefs = servicesN.map((c) => c?.channelRef);
  const profileChannelRefs = profileChannels.map((c) => c.channelRef);
  match('channel_refs_match',
    equal(ordered(refs), ordered(bChannelRefs)) &&
    equal(ordered(bChannelRefs), ordered(nodeChannelRefs)) &&
    equal(ordered(nodeChannelRefs), ordered(profileChannelRefs)) &&
    equal(ordered(profileChannelRefs), ordered(bindingChannels)));
  match('image_manifest_ref_match', b.imageManifestRef === n.imageManifestRef &&
    n.imageManifestRef === p.imageManifestRef &&
    p.imageManifestRef === a.imageManifestRef);
  match('release_ref_match', b.releaseRef === agentN.releaseRef &&
    agentN.releaseRef === p.releaseRef && p.releaseRef === a.releaseRef);
  match('first_boot_packet_ref_match',
    b.firstBootPacketRef === n.firstBootPacketRef &&
    n.firstBootPacketRef === p.firstBootPacketRef &&
    p.firstBootPacketRef === a.firstBootPacketRef);
  match('wireguard_plan_ref_match',
    wgB.planRef === n.wireguardPlanRef &&
    n.wireguardPlanRef === p.wireguardPlanRef &&
    p.wireguardPlanRef === a.wireguardPlanRef);
  match('profile_digest_match',
    b.profileDigest === expectedProfileDigest &&
    n.profileDigest === expectedProfileDigest &&
    FINGERPRINT.test(b.profileDigest || '') &&
    b.digest === digestD2Object(b) &&
    n.digest === digestD2Object(n));
  match('generation_match',
    b.generation === n.generation && n.generation === p.generation);

  const inventoryOk = typeof independentlyObservedBwhPublicKey === 'string' &&
    checkKey(independentlyObservedBwhPublicKey, wgB.bwhPeerPublicKeyFingerprint) &&
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
  match('allowed_ips_within_plan',
    equal(wgB.allowedIps, ['10.77.0.2/32']) &&
    equal(wgN.allowedIps, ['10.77.0.1/32']) &&
    wgN.addressCidr === '10.77.0.2/32' &&
    wgN.interfaceName === 'wg-child0');
  match('no_default_route',
    !JSON.stringify([wgB.allowedIps, wgN.allowedIps]).includes('0.0.0.0/0') &&
    !JSON.stringify([wgB.allowedIps, wgN.allowedIps]).includes('::/0'));
  match('agent_binding_match',
    agentB.agentAuthFingerprint === a.agentAuthFingerprint &&
    agentN.authFingerprint === a.agentAuthFingerprint &&
    a.agentAuthFingerprint === p.agentAuthFingerprint &&
    agentB.endpointRef === agentN.bwhEndpointRef &&
    agentN.bwhEndpointRef === p.agentEndpointRef);
  let bindingValid = false;
  try {
    checkBinding(a, p, wgN.ownPublicKeyFingerprint);
    bindingValid = true;
  } catch {
    bindingValid = false;
  }
  match('registration_binding_match', bindingValid &&
    ['node_ref_match', 'provider_ref_match', 'region_ref_match', 'role_ref_match',
      'channel_refs_match', 'image_manifest_ref_match', 'release_ref_match',
      'first_boot_packet_ref_match', 'wireguard_plan_ref_match',
      'wireguard_key_cross_match', 'agent_binding_match']
      .every((id) => states[id] === 'pass'));
  match('stats_loopback_only',
    servicesN.length > 0 &&
    servicesN.every((service) => ['127.0.0.1', '::1'].includes(service.statsListen)) &&
    profileChannels.every((channel) => ['127.0.0.1', '::1'].includes(channel.statsListen)) &&
    n.activation?.controlServicesEnabled === false &&
    n.activation?.trafficServicesEnabled === false);
  match('no_unreplaced_placeholders',
    !/\{\{|\}\}|__TODO__|<replace>/i.test(JSON.stringify([p, b, n, a])));
  // Trusted host provenance, private-path reachability, real config tests,
  // permissions, secret inspection and material readback stay not_evaluated.
  return {
    schema: 'dual-side-gate/v1', gateRef, evaluatedAt, nodeRef: b.nodeRef,
    generation: b.generation, profileDigest: expectedProfileDigest,
    bwhPlanDigest: b.digest, nodePlanDigest: n.digest,
    registrationBindingDigest: digestD2Object(a),
    checks: GATE_IDS.map((id) => ({
      id, status: states[id],
      ...(id === 'wireguard_key_cross_match' ? {
        detail: 'Source-level comparison only; the supplied BWH public key has no authenticated production inventory provenance.'
      } : {}),
      ...(id === 'registration_binding_match' ? {
        detail: 'E1 candidate projection parity only; no persisted production registration record was read.'
      } : {}),
      ...(id === 'allowed_ips_within_plan' || id === 'no_default_route' ? {
        detail: 'Validated against the candidate plan only; no live WireGuard interface or route table was inspected.'
      } : {}),
      ...(id === 'stats_loopback_only' ? {
        detail: 'Plan declaration only; live listeners, runtime config and file permissions remain unverified.'
      } : {})
    })),
    verdict: 'blocked'
  };
}
