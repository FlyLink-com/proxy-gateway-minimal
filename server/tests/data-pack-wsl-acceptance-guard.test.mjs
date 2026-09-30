import assert from 'node:assert/strict';
import test from 'node:test';
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
