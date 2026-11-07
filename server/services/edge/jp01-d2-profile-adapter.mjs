import { isSafeWireguardPlanRef } from '../node-image-first-boot-packet.mjs';
import {
  isSafeNodeRegistrationReference,
  normalizeRegistrationAnchorFingerprint,
  registrationBindingOf
} from './node-registration-ingestion.mjs';

const REF = /^[A-Za-z0-9._:-]{1,160}$/;
const D2_REGISTRATION_PLAN_REF = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,127}$/;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
const HOSTNAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CHANNEL_FIELDS = [
  'channelRef', 'runtimeAdapter', 'desiredStateRef', 'materialRef',
  'materialDigest', 'endpointRef', 'unitName', 'configDigest', 'statsListen'
];
const RUNTIME_PROFILE_FIELDS = [
  'generation', 'nodePlanRef', 'bwhPlanRef', 'firstBootPacketRef',
  'hostname', 'agentEndpointRef', 'channels'
];
const FIRST_BOOT_PACKET_FIELDS = [
  'ok', 'mode', 'generatedAt', 'packet', 'node', 'image', 'controlPlane',
  'wireguard', 'runtime', 'receiptGate', 'approval', 'plannedOperations', 'notes', 'safety'
];
const PACKET_SUMMARY_FIELDS = [
  'readyForFirstBootApproval', 'approvalRequired', 'firstBootApplyAllowed',
  'blockers', 'nodeRef', 'providerRef', 'regionRef', 'roleRef', 'channelRefCount',
  'imageManifestRef', 'releaseRef', 'wireguardPlanRef'
];
const OMITTED_FIELDS = [
  'rawHosts', 'rawIps', 'rawPorts', 'rawSecrets', 'tokens', 'subscriptionUrls',
  'credentials', 'privateKeys', 'wireguardPrivateKeys', 'customerData',
  'providerApiKeys', 'sshPrivateKeys'
];
const PACKET_SAFETY_FIELDS = [
  'summaryOnly', 'noRuntimeMutation', 'noProductionMutation', 'noCloudMutation',
  'noDnsMutation', 'noProviderFirewallMutation', 'noSubscriptionOutputMutation',
  'noProtectedMaterialOutput', 'omittedFields'
];
const PACKET_NODE_FIELDS = ['nodeRef', 'providerRef', 'regionRef', 'roleRef', 'channelRefs'];
const PACKET_IMAGE_FIELDS = [
  'imageManifestRef', 'releaseRef', 'artifactSha256Recorded', 'noSecretImageConfirmed'
];
const PACKET_CONTROL_FIELDS = [
  'nodeRegistrationDryRunPassed', 'privateAgentRoutePlanned',
  'protectedMaterialInjectPlanned', 'agentNodeIdentityPlanned'
];
const PACKET_WIREGUARD_FIELDS = [
  'planRef', 'tunnelAddressAssigned', 'hostKeyGenerationPlanned',
  'peerPublicKeyExchangePlanned', 'toolsPinnedInImageManifest'
];
const PACKET_RUNTIME_FIELDS = [
  'servicesDisabledInImage', 'xrayConfigTestPlanned', 'hysteria2ConfigTestPlanned',
  'tuicConfigTestPlanned', 'statsLoopbackOnly'
];
const PACKET_RECEIPT_FIELDS = [
  'desiredStatePullRequired', 'materialPullRequired', 'appliedReceiptRequired',
  'renderWithholdsUntilReceipt'
];
const PACKET_APPROVAL_FIELDS = ['exactApprovalReceived', 'firstBootApplyApproved'];
const PACKET_OPERATION_FIELDS = ['id', 'mutation', 'requiresRiskAGate'];
const PACKET_SAFETY_FLAGS = [
  'summaryOnly', 'noRuntimeMutation', 'noProductionMutation', 'noCloudMutation',
  'noDnsMutation', 'noProviderFirewallMutation', 'noSubscriptionOutputMutation',
  'noProtectedMaterialOutput'
];
const REQUIRED_PACKET_GATES = [
  ['controlPlane', 'nodeRegistrationDryRunPassed'],
  ['controlPlane', 'privateAgentRoutePlanned'],
  ['controlPlane', 'protectedMaterialInjectPlanned'],
  ['controlPlane', 'agentNodeIdentityPlanned'],
  ['wireguard', 'tunnelAddressAssigned'],
  ['wireguard', 'hostKeyGenerationPlanned'],
  ['wireguard', 'peerPublicKeyExchangePlanned'],
  ['wireguard', 'toolsPinnedInImageManifest'],
  ['runtime', 'servicesDisabledInImage'],
  ['runtime', 'xrayConfigTestPlanned'],
  ['runtime', 'hysteria2ConfigTestPlanned'],
  ['runtime', 'tuicConfigTestPlanned'],
  ['runtime', 'statsLoopbackOnly'],
  ['receiptGate', 'desiredStatePullRequired'],
  ['receiptGate', 'materialPullRequired'],
  ['receiptGate', 'appliedReceiptRequired'],
  ['receiptGate', 'renderWithholdsUntilReceipt']
];

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, errorCode) {
  if (!isRecord(value) || Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(errorCode);
  }
}

function safeRef(value) {
  if (typeof value !== 'string' || !REF.test(value) ||
      /(?:secret|password|privatekey|credential|customerdata|token)/i.test(value)) {
    throw new Error('invalid_d2_reference');
  }
  return value;
}

export function isSafeD2RegistrationPlanReference(value) {
  return typeof value === 'string' &&
    isSafeNodeRegistrationReference(value) &&
    D2_REGISTRATION_PLAN_REF.test(value);
}

function safeD2RegistrationPlanRef(value) {
  if (!isSafeD2RegistrationPlanReference(value)) {
    throw new Error('invalid_d2_registration_plan_reference');
  }
  return value;
}

function safeHostname(value) {
  if (typeof value !== 'string' || !HOSTNAME.test(value)) {
    throw new Error('invalid_d2_hostname');
  }
  return value;
}

function requireFirstBootSummary(packet) {
  if (!isRecord(packet)) throw new Error('first_boot_packet_shape_invalid');
  exactKeys(packet, FIRST_BOOT_PACKET_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.packet, PACKET_SUMMARY_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.node, PACKET_NODE_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.image, PACKET_IMAGE_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.controlPlane, PACKET_CONTROL_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.wireguard, PACKET_WIREGUARD_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.runtime, PACKET_RUNTIME_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.receiptGate, PACKET_RECEIPT_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.approval, PACKET_APPROVAL_FIELDS, 'first_boot_packet_shape_invalid');
  exactKeys(packet.safety, PACKET_SAFETY_FIELDS, 'first_boot_packet_shape_invalid');
  if (!isRecord(packet) ||
      packet.ok !== true ||
      packet.mode !== 'node-image-first-boot-packet' ||
      !isRecord(packet.packet) ||
      packet.packet.readyForFirstBootApproval !== true ||
      !Array.isArray(packet.packet.blockers) ||
      packet.packet.blockers.length !== 0 ||
      typeof packet.packet.firstBootApplyAllowed !== 'boolean') {
    throw new Error('first_boot_packet_not_ready');
  }
  if (!isRecord(packet.node) || !isRecord(packet.image) ||
      !isRecord(packet.wireguard) || !isRecord(packet.controlPlane) ||
      !isRecord(packet.runtime) || !isRecord(packet.receiptGate) ||
      !isRecord(packet.safety)) {
    throw new Error('first_boot_packet_shape_invalid');
  }
  for (const [group, key] of REQUIRED_PACKET_GATES) {
    if (packet[group]?.[key] !== true) {
      throw new Error('first_boot_packet_gate_missing');
    }
  }
  if (PACKET_SAFETY_FLAGS.some((key) => packet.safety[key] !== true) ||
      JSON.stringify(packet.safety.omittedFields) !== JSON.stringify(OMITTED_FIELDS) ||
      packet.packet.approvalRequired !== !packet.approval.exactApprovalReceived ||
      packet.packet.firstBootApplyAllowed !== (
        packet.packet.readyForFirstBootApproval && packet.approval.exactApprovalReceived &&
        packet.approval.firstBootApplyApproved) ||
      PACKET_APPROVAL_FIELDS.some((key) => typeof packet.approval[key] !== 'boolean') ||
      !Array.isArray(packet.notes) || packet.notes.some((note) =>
        typeof note !== 'string' || /https?:|token=|secret|credential|password|private|customer|@/i.test(note))) {
    throw new Error('first_boot_packet_safety_not_proven');
  }
  if (packet.packet.nodeRef !== packet.node.nodeRef ||
      packet.packet.providerRef !== packet.node.providerRef ||
      packet.packet.regionRef !== packet.node.regionRef ||
      packet.packet.roleRef !== packet.node.roleRef ||
      packet.packet.channelRefCount !== packet.node.channelRefs?.length ||
      packet.packet.imageManifestRef !== packet.image.imageManifestRef ||
      packet.packet.releaseRef !== packet.image.releaseRef ||
      packet.packet.wireguardPlanRef !== packet.wireguard.planRef) {
    throw new Error('first_boot_packet_projection_mismatch');
  }
  safeD2RegistrationPlanRef(packet.node.nodeRef);
  safeD2RegistrationPlanRef(packet.node.providerRef);
  safeD2RegistrationPlanRef(packet.node.regionRef);
  safeD2RegistrationPlanRef(packet.node.roleRef);
  safeD2RegistrationPlanRef(packet.image.imageManifestRef);
  safeD2RegistrationPlanRef(packet.image.releaseRef);
  if (packet.image.artifactSha256Recorded !== true ||
      packet.image.noSecretImageConfirmed !== true ||
      typeof packet.wireguard.planRef !== 'string' ||
      !isSafeWireguardPlanRef(packet.wireguard.planRef) ||
      !Array.isArray(packet.node.channelRefs) ||
      packet.node.channelRefs.length === 0 ||
      packet.node.channelRefs.some((ref) => {
        try { safeD2RegistrationPlanRef(ref); return false; } catch { return true; }
      }) ||
      new Set(packet.node.channelRefs).size !== packet.node.channelRefs.length) {
    throw new Error('first_boot_packet_identity_invalid');
  }
  if (!Array.isArray(packet.plannedOperations) ||
      packet.plannedOperations.length !== 4 ||
      packet.plannedOperations.some((operation) => {
        try { exactKeys(operation, PACKET_OPERATION_FIELDS, 'invalid_first_boot_operation'); }
        catch { return true; }
        return operation.mutation !== false || operation.requiresRiskAGate !== true;
      })) {
    throw new Error('first_boot_packet_contains_mutating_operation');
  }
  return packet;
}

/**
 * Build the exact eleven-field E1 registration binding without writing a
 * registration record. It intentionally requires a ready first-boot summary,
 * but does NOT require firstBootApplyAllowed and does NOT open the execution
 * gate. The projection uses the same registrationBindingOf function as P7.
 */
export function buildD2RegistrationBindingCandidateFromFirstBootPacket({
  firstBootPacket, firstBootPacketRef, wireguardPublicKeyFingerprint,
  agentAuthFingerprint
} = {}) {
  const packet = requireFirstBootSummary(firstBootPacket);
  if (typeof wireguardPublicKeyFingerprint !== 'string' ||
      typeof agentAuthFingerprint !== 'string') {
    throw new Error('d2_registration_candidate_requires_identity_anchors');
  }
  const wgFingerprint = normalizeRegistrationAnchorFingerprint(
    wireguardPublicKeyFingerprint, 'wireguardPublicKeyFingerprint');
  const agentFingerprint = normalizeRegistrationAnchorFingerprint(
    agentAuthFingerprint, 'agentAuthFingerprint');
  if (!FINGERPRINT.test(wgFingerprint) || !FINGERPRINT.test(agentFingerprint)) {
    throw new Error('d2_registration_candidate_requires_identity_anchors');
  }
  const nodeRef = safeD2RegistrationPlanRef(packet.node.nodeRef);
  const candidateRecord = {
    nodeRef,
    providerRef: safeD2RegistrationPlanRef(packet.node.providerRef),
    regionRef: safeD2RegistrationPlanRef(packet.node.regionRef),
    roleRef: safeD2RegistrationPlanRef(packet.node.roleRef),
    channelRefs: packet.node.channelRefs.map(safeD2RegistrationPlanRef),
    imageManifestRef: safeD2RegistrationPlanRef(packet.image.imageManifestRef),
    releaseRef: safeD2RegistrationPlanRef(packet.image.releaseRef),
    firstBootPacketRef: safeD2RegistrationPlanRef(firstBootPacketRef || 'first_boot_' + nodeRef),
    metadata: {
      wireguardPlanRef: packet.wireguard.planRef,
      wireguardPublicKeyFingerprint: wgFingerprint,
      agentAuthFingerprint: agentFingerprint
    }
  };
  const binding = registrationBindingOf(candidateRecord);
  if (Object.keys(binding).length !== 11 ||
      Object.values(binding).some((value) => value === null || value === undefined)) {
    throw new Error('d2_registration_candidate_incomplete');
  }
  return binding;
}

/**
 * Project the existing first-boot summary and E1 registration candidate into
 * the single Node Profile consumed by both D2 renderers. runtimeProfile contains
 * only non-secret refs and channel metadata; no runtime config or private key.
 */
export function buildD2ProfileFromFirstBootPacket({
  firstBootPacket, runtimeProfile, wireguardPublicKeyFingerprint,
  agentAuthFingerprint
} = {}) {
  exactKeys(runtimeProfile, RUNTIME_PROFILE_FIELDS, 'invalid_d2_runtime_profile_shape');
  if (!Array.isArray(runtimeProfile.channels) || runtimeProfile.channels.length === 0) {
    throw new Error('invalid_d2_runtime_profile_channels');
  }
  const registrationBinding = buildD2RegistrationBindingCandidateFromFirstBootPacket({
    firstBootPacket,
    firstBootPacketRef: runtimeProfile.firstBootPacketRef,
    wireguardPublicKeyFingerprint,
    agentAuthFingerprint
  });
  const channels = runtimeProfile.channels.map((channel) => {
    exactKeys(channel, CHANNEL_FIELDS, 'invalid_d2_channel_shape');
    return { ...channel };
  });
  const channelRefs = channels.map((channel) => safeD2RegistrationPlanRef(channel.channelRef)).sort();
  if (JSON.stringify(channelRefs) !== JSON.stringify(registrationBinding.channelRefs)) {
    throw new Error('d2_profile_channel_binding_mismatch');
  }
  const profile = {
    schema: 'jp01-d2-node-profile/v1',
    nodeRef: registrationBinding.nodeRef,
    providerRef: registrationBinding.providerRef,
    regionRef: registrationBinding.regionRef,
    roleRef: registrationBinding.roleRef,
    generation: safeRef(runtimeProfile.generation),
    nodePlanRef: safeRef(runtimeProfile.nodePlanRef),
    bwhPlanRef: safeRef(runtimeProfile.bwhPlanRef),
    imageManifestRef: registrationBinding.imageManifestRef,
    releaseRef: registrationBinding.releaseRef,
    firstBootPacketRef: registrationBinding.firstBootPacketRef,
    wireguardPlanRef: registrationBinding.wireguardPlanRef,
    hostname: safeHostname(runtimeProfile.hostname),
    agentAuthFingerprint: registrationBinding.agentAuthFingerprint,
    agentEndpointRef: safeRef(runtimeProfile.agentEndpointRef),
    channels
  };
  return { profile, registrationBinding };
}
