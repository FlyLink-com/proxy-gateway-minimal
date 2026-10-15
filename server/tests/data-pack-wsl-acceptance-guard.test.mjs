import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as guard from '../../scripts/lib/data-pack-wsl-acceptance-guard.mjs';
import {
  validateDataPackWslGate, validateDataPackNamespace,
  acceptanceReceipt, PACKAGE_FILES, TEST_PORTS
} from '../../scripts/lib/data-pack-wsl-acceptance-guard.mjs';

const now = new Date('2026-09-29T14:00:00.000Z');
const digest = 'a'.repeat(64);
function gate() {
  return {
    kind: 'data-pack-wsl-physical-acceptance-v1',
    sourceCommit: 'b'.repeat(40), createdAt: now.toISOString(),
    expiresAt: '2026-09-29T15:00:00.000Z', singleUse: true,
    maxRunSeconds: 180, maxTransferBytes: 262144,
    nodeSha256: digest, hysteriaSha256: digest,
    dependencySha256: digest, dependencyManifestSha256: digest,
    sourceArchiveSha256: digest, sourceTreeSha256: digest,
    files: Object.fromEntries(PACKAGE_FILES.map(file => [file, digest])),
    ports: [...TEST_PORTS], data: 'synthetic-only', network: 'loopback-only'
  };
}

test('admits only a complete exact bounded synthetic gate', () => {
  const value = validateDataPackWslGate(gate(), { now, expectedCommit: 'b'.repeat(40) });
  assert.equal(value.sourceCommit, 'b'.repeat(40));
  assert.deepEqual(value.ports, TEST_PORTS);
});

for (const [label, mutate] of [
  ['wrong source', value => { value.sourceCommit = 'c'.repeat(40); }],
  ['expired', value => { value.expiresAt = now.toISOString(); }],
  ['insufficient complete execution window', value => { value.expiresAt = '2026-09-29T14:03:00.000Z'; }],
  ['future authorization', value => { value.createdAt = '2026-09-29T14:01:00.000Z'; }],
  ['oversized time window', value => { value.expiresAt = '2026-09-30T14:00:00.000Z'; }],
  ['replayable gate', value => { value.singleUse = false; }],
  ['unbounded duration', value => { value.maxRunSeconds = 181; }],
  ['oversized traffic', value => { value.maxTransferBytes = 262145; }],
  ['port drift', value => { value.ports.push(3456); }],
  ['missing file', value => { delete value.files[PACKAGE_FILES[0]]; }],
  ['extra file', value => { value.files['.env'] = digest; }],
  ['bad digest', value => { value.files[PACKAGE_FILES[0]] = 'bad'; }],
  ['unbound native dependencies', value => { delete value.dependencySha256; }],
  ['production input', value => { value.data = 'production'; }],
  ['public network', value => { value.network = 'public'; }],
  ['unknown scope', value => { value.production = true; }]
]) {
  test(`rejects ${label}`, () => {
    const value = gate(); mutate(value);
    assert.throws(() => validateDataPackWslGate(value, { now, expectedCommit: 'b'.repeat(40) }),
      error => error.code === 'wsl_acceptance_gate_invalid');
  });
}

const namespaces = { user: 'user:[1]', mnt: 'mnt:[2]', net: 'net:[3]', pid: 'pid:[4]' };
test('requires four fresh namespaces, loopback only, no default route and no host mounts', () => {
  const child = { user: 'user:[5]', mnt: 'mnt:[6]', net: 'net:[7]', pid: 'pid:[8]' };
  assert.equal(validateDataPackNamespace({ parent: namespaces, current: child,
    interfaces: ['lo'], defaultRoutes: 0, hostMountsAccessible: false }), true);
  for (const change of [
    { current: namespaces }, { interfaces: ['lo', 'eth0'] },
    { defaultRoutes: 1 }, { hostMountsAccessible: true }
  ]) {
    assert.throws(() => validateDataPackNamespace({ parent: namespaces, current: child,
      interfaces: ['lo'], defaultRoutes: 0, hostMountsAccessible: false, ...change }),
    error => error.code === 'wsl_acceptance_namespace_invalid');
  }
});

test('receipt is aggregate-only and does not claim purchase or production acceptance', () => {
  const receipt = acceptanceReceipt({ gate: gate(), outcome: 'failed',
    namespaceVerified: true, physicalResult: null, cleanupVerified: true,
    errorCategory: 'unexpected', secret: 'must-not-appear', rawConfig: 'must-not-appear' });
  assert.equal(receipt.scope, 'synthetic-hysteria-enforcement-and-metering');
  assert.equal(receipt.purchaseE2eVerified, false);
  assert.equal(receipt.productionChanged, false);
  assert.equal(receipt.cleanupVerified, true);
  assert.ok(!JSON.stringify(receipt).includes('must-not-appear'));
});

const stages = ['admission', 'namespace', 'dependency_prepare', 'dependency_move',
  'transport_import', 'transport_start', 'scenario', 'result_validation'];

test('diagnostic stages are a closed immutable vocabulary', () => {
  assert.deepEqual(guard.ACCEPTANCE_STAGES, stages);
  assert.equal(Object.isFrozen(guard.ACCEPTANCE_STAGES), true);
  for (const stage of stages) {
    assert.deepEqual(guard.acceptanceFailure(stage, new Error('must-not-appear')), {
      stage, errorCategory: 'acceptance_stopped'
    });
  }
});

test('gate binds the isolated dependency ACL implementation', () => {
  assert.ok(PACKAGE_FILES.includes('scripts/lib/data-pack-wsl-dependency-acl.mjs'));
});

test('failure diagnostics retain only explicitly known dependency and guard categories', () => {
  const cases = [
    ['dependency_prepare', { condition: 'dependency_archive_invalid' }, 'dependency_archive_invalid'],
    ['dependency_prepare', { condition: 'dependency_acl_or_capability_invalid' }, 'dependency_acl_or_capability_invalid'],
    ['dependency_prepare', { condition: 'dependency_storage_budget_unavailable' }, 'dependency_storage_budget_unavailable'],
    ['dependency_move', { condition: 'dependency_archive_cleanup_failed' }, 'dependency_archive_cleanup_failed'],
    ['dependency_prepare', { condition: 'native_module_validation_failed' }, 'dependency_native_module_invalid'],
    ['dependency_prepare', { condition: 'unsupported_platform' }, 'dependency_platform_unsupported'],
    ['admission', { code: 'wsl_acceptance_gate_invalid' }, 'admission_invalid'],
    ['admission', { code: 'wsl_source_tree_invalid' }, 'source_tree_invalid'],
    ['namespace', { code: 'wsl_acceptance_namespace_invalid' }, 'namespace_invalid'],
    ['result_validation', { code: 'wsl_acceptance_receipt_invalid' }, 'result_invalid'],
    ['scenario', { code: 'wsl_acceptance_cleanup_unverified' }, 'cleanup_unverified']
  ];
  for (const [stage, error, category] of cases) {
    const failure = guard.acceptanceFailure(stage, { ...error,
      message: 'must-not-appear', stack: 'must-not-appear', path: 'must-not-appear' });
    assert.deepEqual(failure, { stage, errorCategory: category });
  }
});

test('unknown errors and stages cannot inject free text or impersonate enum prefixes', () => {
  const errors = [null, undefined, 'must-not-appear', new Error('dependency_archive_invalid'),
    { condition: 'dependency_must-not-appear' }, { code: 'must-not-appear' },
    { code: '__proto__' }, { code: 'toString' }, { message: 'must-not-appear' },
    { condition: { toString() { throw new Error('must-not-appear'); } } },
    { get condition() { throw new Error('must-not-appear'); } }];
  for (const error of errors) {
    assert.deepEqual(guard.acceptanceFailure('must-not-appear', error), {
      stage: 'unknown', errorCategory: 'acceptance_stopped'
    });
  }
});

test('explicit unknown or unfinished stages cannot claim a passed receipt', () => {
  for (const stage of [undefined, null, '', 'unknown', 'must-not-appear', {}, ...stages.slice(0, -1)]) {
    const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', stage,
      namespaceVerified: true, cleanupVerified: true, physicalResult: hybridResult() });
    assert.equal(receipt.stage, stages.includes(stage) ? stage : 'unknown');
    assert.equal(receipt.outcome, 'failed');
    assert.equal(receipt.errorCategory, 'acceptance_stopped');
    assert.ok(!JSON.stringify(receipt).includes('must-not-appear'));
  }
  const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', stage: 'result_validation',
    namespaceVerified: true, cleanupVerified: true, physicalResult: hybridResult() });
  assert.equal(receipt.outcome, 'passed');
  assert.equal(receipt.stage, 'result_validation');
  assert.equal(receipt.errorCategory, null);
  assert.equal(receipt.primaryFailure, null);
  assert.equal(receipt.cleanupFailure, null);
  assert.equal(acceptanceReceipt({ gate: gate(), outcome: 'passed' }).outcome, 'passed');
});

test('primary and cleanup failures stay separate and cannot be overwritten by success', () => {
  const primaryFailure = { stage: 'dependency_prepare', errorCategory: 'dependency_archive_invalid' };
  const cleanupFailure = { stage: 'dependency_move', errorCategory: 'dependency_archive_cleanup_failed' };
  const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', stage: 'result_validation',
    primaryFailure, cleanupFailure, errorCategory: 'must-not-appear' });
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.errorCategory, primaryFailure.errorCategory);
  assert.deepEqual(receipt.primaryFailure, primaryFailure);
  assert.deepEqual(receipt.cleanupFailure, cleanupFailure);
  primaryFailure.errorCategory = 'must-not-appear';
  cleanupFailure.stage = 'must-not-appear';
  assert.ok(!JSON.stringify(receipt).includes('must-not-appear'));
});

test('cleanup-only failure and untrusted failure records are independently redacted', () => {
  const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', stage: 'result_validation',
    cleanupFailure: { stage: 'transport_start', errorCategory: 'must-not-appear',
      message: 'must-not-appear', condition: 'must-not-appear' } });
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.primaryFailure, null);
  assert.deepEqual(receipt.cleanupFailure, { stage: 'transport_start', errorCategory: 'acceptance_stopped' });
  assert.equal(receipt.errorCategory, 'acceptance_stopped');
  const failed = acceptanceReceipt({ gate: gate(), outcome: 'failed', stage: 'must-not-appear',
    primaryFailure: { stage: 'must-not-appear', errorCategory: 'dependency_must-not-appear' } });
  assert.deepEqual(failed.primaryFailure, { stage: 'unknown', errorCategory: 'acceptance_stopped' });
  assert.ok(!JSON.stringify([receipt, failed]).includes('must-not-appear'));
});

test('rejects arbitrary nested physical result instead of copying material into receipt', () => {
  assert.throws(() => acceptanceReceipt({ gate: gate(), outcome: 'passed',
    physicalResult: { ok: true, credential: 'must-not-appear' } }),
    error => error.code === 'wsl_acceptance_receipt_invalid');
});
test('receipt preserves the explicit reset-ack boundary without claiming five-source journal acceptance', () => {
  const resource = { quotaBytes: 100, seededBaselineBytes: 0, collectorObservedBytes: 5, physicallyCollectedBytes: 0, usedBytes: 5 };
  const result = { ok: true, evidenceMode: 'synthetic_transport',
    acceptanceScope: { syntheticControlResources: true, authenticatedPurchaseToDelivery: false,
      realSubscriptionArtifactRotation: true, realControlAccountingAndReset: true, actualProtocolProcess: false,
      fullMeteringMaterialContinuation: false, meteringResetReceiptValidated: true },
    credentialCount: 3, applyCount: 3,
    resources: { packA: resource, packB: resource, timedPlan: resource },
    exhaustion: { crossedByCollectorDelta: true, newConnections: { packA: false, packB: true, timedPlan: true } },
    rotation: { usedBytesBefore: 5, usedBytesAfter: 5, meteringIdentityPreserved: true,
      oldCredentialAllowed: false, newCredentialAllowed: true, oldArtifactRevoked: true },
    recovery: { interrupted: true, recovered: true, usageUnchanged: true, resourceCountUnchanged: true } };
  const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', physicalResult: result });
  assert.equal(receipt.physicalResult.acceptanceScope.fullMeteringMaterialContinuation, false);
  assert.equal(receipt.physicalResult.acceptanceScope.meteringResetReceiptValidated, true);
  for (const patch of [{ fullMeteringMaterialContinuation: true }, { meteringResetReceiptValidated: false }]) {
    const wrong = structuredClone(result); Object.assign(wrong.acceptanceScope, patch);
    assert.throws(() => acceptanceReceipt({ gate: gate(), outcome: 'passed', physicalResult: wrong }),
      error => error.code === 'wsl_acceptance_receipt_invalid');
  }
});

function hybridResult({ physical = true } = {}) {
  const resource = { quotaBytes: 100, seededBaselineBytes: 0, collectorObservedBytes: 5,
    physicallyCollectedBytes: physical ? 5 : 0, usedBytes: 5 };
  return { ok: true, evidenceMode: physical ? 'physical_process' : 'synthetic_transport',
    acceptanceScope: { syntheticControlResources: true, authenticatedPurchaseToDelivery: false,
      realSubscriptionArtifactRotation: true, realControlAccountingAndReset: true,
      actualProtocolProcess: physical, fullMeteringMaterialContinuation: true,
      meteringResetReceiptValidated: true, allFiveSourcesPhysicallyObserved: false },
    metering: { physicalSourceCount: physical ? 1 : 0, syntheticSourceCount: physical ? 4 : 5 },
    credentialCount: 3, applyCount: 3,
    resources: { packA: resource, packB: resource, timedPlan: resource },
    exhaustion: { crossedByCollectorDelta: true, newConnections: { packA: false, packB: true, timedPlan: true } },
    rotation: { usedBytesBefore: 5, usedBytesAfter: 5, meteringIdentityPreserved: true,
      oldCredentialAllowed: false, newCredentialAllowed: true, oldArtifactRevoked: true },
    recovery: { interrupted: true, recovered: true, usageUnchanged: true, resourceCountUnchanged: true } };
}

test('hybrid receipt distinguishes one physical Hy2 source from four synthetic sources', () => {
  for (const physical of [true, false]) {
    const result = hybridResult({ physical });
    const receipt = acceptanceReceipt({ gate: gate(), outcome: 'passed', physicalResult: result });
    assert.deepEqual(receipt.physicalResult, result);
    assert.equal(receipt.purchaseE2eVerified, false);
    assert.equal(receipt.physicalResult.acceptanceScope.allFiveSourcesPhysicallyObserved, false);
    for (const mutate of [
      value => { value.metering.physicalSourceCount = 5; },
      value => { value.metering.syntheticSourceCount = 0; },
      value => { value.acceptanceScope.allFiveSourcesPhysicallyObserved = true; },
      value => { value.metering.raw = 'must-not-appear'; },
      value => { delete value.metering; },
      value => { value.acceptanceScope.fullMeteringMaterialContinuation = false; }
    ]) {
      const wrong = structuredClone(result); mutate(wrong);
      assert.throws(() => acceptanceReceipt({ gate: gate(), outcome: 'passed', physicalResult: wrong }),
        error => error.code === 'wsl_acceptance_receipt_invalid');
    }
  }
});

test('physical entry requires actual protocol, full journal, stop, rotation and recovery invariants', () => {
  assert.equal(typeof guard.validateDataPackPhysicalAcceptanceResult, 'function');
  const result = hybridResult();
  assert.deepEqual(guard.validateDataPackPhysicalAcceptanceResult(result), result);
  for (const mutate of [
    value => Object.assign(value, hybridResult({ physical: false })),
    value => { value.acceptanceScope.realControlAccountingAndReset = false; },
    value => { value.exhaustion.newConnections.packA = true; },
    value => { value.exhaustion.newConnections.packB = false; },
    value => { value.rotation.oldCredentialAllowed = true; },
    value => { value.rotation.newCredentialAllowed = false; },
    value => { value.rotation.usedBytesAfter += 1; },
    value => { value.recovery.usageUnchanged = false; }
  ]) {
    const wrong = structuredClone(result); mutate(wrong);
    assert.throws(() => guard.validateDataPackPhysicalAcceptanceResult(wrong),
      error => error.code === 'wsl_acceptance_receipt_invalid');
  }
});

test('WSL entry wires full journal mode and independently validates the result', () => {
  const source = readFileSync(new URL('../../scripts/data-pack-wsl-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /runDataPackPhysicalScenario\(\{\s*runDir,\s*transport,\s*meteringMode:\s*['"]full_metering_journal['"]\s*\}\)/);
  assert.match(source, /validateDataPackPhysicalAcceptanceResult\(candidateResult\);\s*result = candidateResult;/);
  assert.ok(PACKAGE_FILES.includes('scripts/lib/data-pack-full-metering-session.mjs'));
  assert.ok(PACKAGE_FILES.includes('scripts/lib/full-metering-local-source.mjs'));
});
