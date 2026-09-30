// Pure admission/receipt contracts. No process start, file access, or network IO.
export const TEST_PORTS = Object.freeze([25443, 26080, 26081, 26101, 26102, 26103]);
export const PACKAGE_FILES = Object.freeze([
  'scripts/data-pack-wsl-artifact-prep.sh',
  'scripts/data-pack-wsl-acceptance.sh',
  'scripts/data-pack-wsl-acceptance.mjs',
  'scripts/lib/data-pack-wsl-acceptance-guard.mjs',
  'scripts/lib/data-pack-wsl-source-tree.mjs',
  'scripts/lib/data-pack-physical-scenario.mjs',
  'scripts/lib/data-pack-full-metering-session.mjs',
  'scripts/lib/data-pack-hysteria-transport.mjs',
  'scripts/lib/full-metering-local-source.mjs',
  'scripts/control-plane-dependency-artifact-lib.mjs',
  'scripts/control-plane-welcome-coins-native-contract.mjs',
  'package-lock.json'
]);
const KEYS = ['kind', 'sourceCommit', 'createdAt', 'expiresAt', 'singleUse',
  'maxRunSeconds', 'maxTransferBytes', 'nodeSha256', 'hysteriaSha256',
  'dependencySha256', 'dependencyManifestSha256',
  'sourceArchiveSha256', 'sourceTreeSha256',
  'files', 'ports', 'data', 'network'];
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validateDataPackWslGate(gate, { now = new Date(), expectedCommit } = {}) {
  const created = Date.parse(gate?.createdAt), expires = Date.parse(gate?.expiresAt);
  const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (!exactKeys(gate, KEYS) || gate.kind !== 'data-pack-wsl-physical-acceptance-v1'
    || !/^[a-f0-9]{40}$/.test(gate.sourceCommit) || gate.sourceCommit !== expectedCommit
    || !Number.isFinite(created) || !Number.isFinite(expires)
    || created > now.getTime() || expires < now.getTime() + 195000 || expires - created > 6 * 3600_000
    || gate.singleUse !== true || gate.maxRunSeconds !== 180 || gate.maxTransferBytes !== 262144
    || !sha(gate.nodeSha256) || !sha(gate.hysteriaSha256)
    || !sha(gate.dependencySha256) || !sha(gate.dependencyManifestSha256)
    || !sha(gate.sourceArchiveSha256) || !sha(gate.sourceTreeSha256)
    || !exactKeys(gate.files, PACKAGE_FILES) || !Object.values(gate.files).every(sha)
    || JSON.stringify(gate.ports) !== JSON.stringify(TEST_PORTS)
    || gate.data !== 'synthetic-only' || gate.network !== 'loopback-only') {
    fail('wsl_acceptance_gate_invalid');
  }
  return structuredClone(gate);
}
export function validateDataPackNamespace({ parent, current, interfaces,
  defaultRoutes, hostMountsAccessible }) {
  const names = ['user', 'mnt', 'net', 'pid'];
  if (!names.every(name => typeof parent?.[name] === 'string'
    && typeof current?.[name] === 'string' && parent[name] !== current[name])
    || JSON.stringify(interfaces) !== '["lo"]' || defaultRoutes !== 0
    || hostMountsAccessible !== false) fail('wsl_acceptance_namespace_invalid');
  return true;
}
function physicalReceipt(value) {
  if (value === null) return null;
  const bools = (record, keys) => exactKeys(record, keys)
    && Object.values(record).every(item => typeof item === 'boolean');
  const integer = item => Number.isSafeInteger(item) && item >= 0;
  const resourceKeys = ['quotaBytes', 'seededBaselineBytes', 'collectorObservedBytes',
    'physicallyCollectedBytes', 'usedBytes'];
  const fullMetering = value?.acceptanceScope?.fullMeteringMaterialContinuation === true;
  const scopeKeys = ['syntheticControlResources', 'authenticatedPurchaseToDelivery',
    'realSubscriptionArtifactRotation', 'realControlAccountingAndReset', 'actualProtocolProcess',
    'fullMeteringMaterialContinuation', 'meteringResetReceiptValidated',
    ...(fullMetering ? ['allFiveSourcesPhysicallyObserved'] : [])];
  const rotationKeys = ['usedBytesBefore', 'usedBytesAfter', 'meteringIdentityPreserved',
    'oldCredentialAllowed', 'newCredentialAllowed', 'oldArtifactRevoked'];
  if (!exactKeys(value, ['ok', 'evidenceMode', 'acceptanceScope', 'credentialCount',
    'applyCount', 'resources', 'exhaustion', 'rotation', 'recovery', ...(fullMetering ? ['metering'] : [])])
    || value.ok !== true || !['physical_process', 'synthetic_transport'].includes(value.evidenceMode)
    || !bools(value.acceptanceScope, scopeKeys)
    || value.acceptanceScope.authenticatedPurchaseToDelivery !== false
    || !fullMetering && value.acceptanceScope.fullMeteringMaterialContinuation !== false
    || fullMetering && (value.acceptanceScope.allFiveSourcesPhysicallyObserved !== false
      || !exactKeys(value.metering, ['physicalSourceCount', 'syntheticSourceCount'])
      || value.metering.physicalSourceCount !== (value.evidenceMode === 'physical_process' ? 1 : 0)
      || value.metering.syntheticSourceCount !== (value.evidenceMode === 'physical_process' ? 4 : 5))
    || value.acceptanceScope.meteringResetReceiptValidated !== true
    || value.acceptanceScope.actualProtocolProcess !== (value.evidenceMode === 'physical_process')
    || value.credentialCount !== 3 || !integer(value.applyCount)
    || !exactKeys(value.resources, ['packA', 'packB', 'timedPlan'])
    || !Object.values(value.resources).every(record => exactKeys(record, resourceKeys)
      && Object.values(record).every(integer))
    || !exactKeys(value.exhaustion, ['crossedByCollectorDelta', 'newConnections'])
    || value.exhaustion.crossedByCollectorDelta !== true
    || !bools(value.exhaustion.newConnections, ['packA', 'packB', 'timedPlan'])
    || !exactKeys(value.rotation, rotationKeys)
    || !integer(value.rotation.usedBytesBefore) || !integer(value.rotation.usedBytesAfter)
    || !rotationKeys.slice(2).every(key => typeof value.rotation[key] === 'boolean')
    || !bools(value.recovery, ['interrupted', 'recovered', 'usageUnchanged', 'resourceCountUnchanged'])) {
    fail('wsl_acceptance_receipt_invalid');
  }
  return structuredClone(value);
}
export function validateDataPackPhysicalAcceptanceResult(value) {
  const result = physicalReceipt(value);
  if (!result || result.evidenceMode !== 'physical_process'
    || result.acceptanceScope.syntheticControlResources !== true
    || result.acceptanceScope.realSubscriptionArtifactRotation !== true
    || result.acceptanceScope.realControlAccountingAndReset !== true
    || result.acceptanceScope.fullMeteringMaterialContinuation !== true
    || result.exhaustion.newConnections.packA !== false
    || result.exhaustion.newConnections.packB !== true
    || result.exhaustion.newConnections.timedPlan !== true
    || result.rotation.usedBytesBefore !== result.rotation.usedBytesAfter
    || result.rotation.meteringIdentityPreserved !== true
    || result.rotation.oldCredentialAllowed !== false
    || result.rotation.newCredentialAllowed !== true
    || result.rotation.oldArtifactRevoked !== true
    || Object.values(result.recovery).some(item => item !== true)) {
    fail('wsl_acceptance_receipt_invalid');
  }
  return result;
}
export function acceptanceReceipt({ gate, outcome, namespaceVerified = false,
  physicalResult = null, cleanupVerified = false, errorCategory = null }) {
  // The physical driver owns a separately redacted aggregate receipt. Never
  // copy arbitrary errors, commands, config, environment, or SQLite records.
  return {
    kind: 'data-pack-wsl-physical-receipt-v1',
    sourceCommit: gate.sourceCommit, finishedAt: new Date().toISOString(),
    scope: 'synthetic-hysteria-enforcement-and-metering',
    outcome: outcome === 'passed' ? 'passed' : 'failed',
    namespaceVerified: namespaceVerified === true,
    cleanupVerified: cleanupVerified === true,
    purchaseE2eVerified: false, productionChanged: false,
    physicalResult: physicalReceipt(physicalResult),
    errorCategory: errorCategory === null ? null : 'acceptance_stopped'
  };
}
