import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import test from 'node:test';
import * as guard from '../../scripts/lib/data-pack-wsl-acceptance-guard.mjs';

const source = readFileSync(new URL('../../scripts/data-pack-wsl-acceptance.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  const [mode, runDir, gatePath, expectedCommit, approvedGateSha256]');
assert.notEqual(start, -1);
let block = source.slice(start, source.lastIndexOf('\n}'));
for (const [specifier, replacement] of [
  ['./control-plane-dependency-artifact-lib.mjs', 'fixture.dependency'],
  ['./lib/data-pack-hysteria-transport.mjs', 'fixture.transportModule'],
  ['./lib/data-pack-physical-scenario.mjs', 'fixture.scenarioModule']
]) {
  const expression = `await import('${specifier}')`;
  assert.ok(block.includes(expression));
  block = block.replace(expression, replacement);
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Exercise the actual entry's control flow with fully synthetic filesystem,
// libraries, process and stdout/stderr. No entry admission, archive extraction,
// native module, namespace or protocol is executed.
const execute = new AsyncFunction('fixture', `const {
  process, admit, namespaceReadback, readFileSync, join, renameSync, writeFileSync,
  createDataPackDependencyAclChecker, acceptanceReceipt, acceptanceFailure,
  validateDataPackPhysicalAcceptanceResult
} = fixture;\n${block}`);

function injectedError(code) {
  return Object.assign(new Error('private-path / secret / raw diagnostic'), { code, condition: code });
}
function validResult() {
  const resource = { quotaBytes: 100, seededBaselineBytes: 0, collectorObservedBytes: 5,
    physicallyCollectedBytes: 5, usedBytes: 5 };
  return { ok: true, evidenceMode: 'physical_process', credentialCount: 3, applyCount: 3,
    acceptanceScope: { syntheticControlResources: true, authenticatedPurchaseToDelivery: false,
      realSubscriptionArtifactRotation: true, realControlAccountingAndReset: true,
      actualProtocolProcess: true, fullMeteringMaterialContinuation: true,
      meteringResetReceiptValidated: true, allFiveSourcesPhysicallyObserved: false },
    metering: { physicalSourceCount: 1, syntheticSourceCount: 4 },
    resources: { packA: resource, packB: resource, timedPlan: resource },
    exhaustion: { crossedByCollectorDelta: true, newConnections: { packA: false, packB: true, timedPlan: true } },
    rotation: { usedBytesBefore: 5, usedBytesAfter: 5, meteringIdentityPreserved: true,
      oldCredentialAllowed: false, newCredentialAllowed: true, oldArtifactRevoked: true },
    recovery: { interrupted: true, recovered: true, usageUnchanged: true, resourceCountUnchanged: true } };
}
async function run({ failAt, cleanupFails = false, cleanupMissing = false, resultRejected = false } = {}) {
  const receipts = [], emitted = [], stages = [];
  let closeCount = 0;
  const gate = { sourceCommit: 'a'.repeat(40) };
  const check = stage => {
    stages.push(stage);
    if (stage === failAt) throw injectedError(stage === 'dependency_prepare'
      ? 'dependency_runtime_mismatch' : 'untrusted_private_error');
  };
  const fixture = {
    process: { argv: ['node', 'entry', '--execute', '/tmp/gccgw-data-pack-wsl.Ab12Cd34',
      '/tmp/gate', gate.sourceCommit, 'b'.repeat(64)], execPath: '/private/node',
      env: { GCCGW_PARENT_NS: '{"net":"net:[1]"}' },
      stdout: { write: value => emitted.push(value) }, stderr: { write: value => emitted.push(value) } },
    admit: () => { check('admission'); return gate; },
    namespaceReadback: () => { check('namespace'); return true; },
    readFileSync: () => Buffer.from('{}'), join: posix.join,
    renameSync: () => check('dependency_move'),
    writeFileSync: (path, bytes, options) => {
      assert.equal(path, '/tmp/gccgw-data-pack-wsl.Ab12Cd34/physical-receipt.json');
      assert.deepEqual(options, { flag: 'wx', mode: 0o600 });
      receipts.push(JSON.parse(bytes));
    },
    createDataPackDependencyAclChecker: () => () => false,
    acceptanceReceipt: guard.acceptanceReceipt,
    acceptanceFailure: guard.acceptanceFailure,
    validateDataPackPhysicalAcceptanceResult: result => {
      check('result_validation');
      if (resultRejected) throw injectedError('wsl_acceptance_receipt_invalid');
      return guard.validateDataPackPhysicalAcceptanceResult(result);
    },
    dependency: { prepareDependencyArtifactTree: () => {
      check('dependency_prepare');
      return { extracted: { nodeModulesRoot: '/private/tree', cleanup() {} } };
    } },
    transportModule: { createDataPackHysteriaTransport: () => {
      check('transport_import');
      return { async start() { check('transport_start'); }, async close() {
        closeCount += 1;
        if (cleanupFails) throw injectedError('private_cleanup_failure');
        if (cleanupMissing) return null;
        return { processesStopped: true, listenersClear: true };
      } };
    } },
    scenarioModule: { runDataPackPhysicalScenario: async () => {
      check('scenario');
      // A rejected untrusted result must not reach the receipt serializer.
      return resultRejected ? { secret: 'must-not-appear' } : validResult();
    } }
  };
  await execute(fixture);
  return { receipts, emitted, stages, closeCount, exitCode: fixture.process.exitCode };
}

for (const stage of ['namespace', 'dependency_prepare', 'dependency_move', 'transport_import', 'transport_start', 'scenario', 'result_validation']) {
  test(`entry retains the failed ${stage} boundary without raw material`, async () => {
    const value = await run({ failAt: stage });
    assert.equal(value.exitCode, 1);
    assert.equal(value.receipts.length, 1);
    assert.equal(value.receipts[0].stage, stage);
    assert.equal(value.receipts[0].primaryFailure.stage, stage);
    assert.equal(value.receipts[0].primaryFailure.errorCategory,
      stage === 'dependency_prepare' ? 'dependency_runtime_mismatch' : 'acceptance_stopped');
    assert.equal(value.receipts[0].physicalResult, null);
    assert.equal(JSON.stringify(value).includes('private-path'), false);
    assert.equal(value.closeCount, ['transport_start', 'scenario', 'result_validation'].includes(stage) ? 1 : 0);
  });
}

test('entry keeps the primary scenario failure when owned transport cleanup also fails', async () => {
  const value = await run({ failAt: 'scenario', cleanupFails: true });
  const receipt = value.receipts[0];
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.primaryFailure.stage, 'scenario');
  assert.deepEqual(receipt.cleanupFailure, { stage: 'scenario', errorCategory: 'cleanup_unverified' });
  assert.equal(receipt.cleanupVerified, false);
  assert.equal(value.closeCount, 1);
});

test('entry discards rejected physical result before serializing diagnostics', async () => {
  const value = await run({ resultRejected: true });
  const receipt = value.receipts[0];
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.stage, 'result_validation');
  assert.equal(receipt.errorCategory, 'result_invalid');
  assert.equal(receipt.physicalResult, null);
  assert.equal(JSON.stringify(receipt).includes('must-not-appear'), false);
});

test('entry does not write to an unadmitted directory or continue after admission failure', async () => {
  const value = await run({ failAt: 'admission' });
  assert.equal(value.exitCode, 1);
  assert.deepEqual(value.stages, ['admission']);
  assert.equal(value.receipts.length, 0);
  assert.equal(value.closeCount, 0);
});

test('entry passes only after validated scenario and separate owned-process cleanup', async () => {
  const value = await run();
  assert.equal(value.receipts[0].outcome, 'passed');
  assert.equal(value.receipts[0].stage, 'result_validation');
  assert.equal(value.receipts[0].cleanupVerified, true);
  assert.equal(value.receipts[0].primaryFailure, null);
  assert.equal(value.receipts[0].cleanupFailure, null);
  assert.equal(value.receipts[0].errorCategory, null);
  assert.equal(value.closeCount, 1);
});

for (const cleanup of ['cleanupFails', 'cleanupMissing']) {
  test(`entry cannot report success when ${cleanup} after a valid scenario`, async () => {
    const value = await run({ [cleanup]: true });
    assert.equal(value.exitCode, 1);
    assert.equal(value.receipts[0].outcome, 'failed');
    assert.equal(value.receipts[0].primaryFailure, null);
    assert.deepEqual(value.receipts[0].cleanupFailure,
      { stage: 'result_validation', errorCategory: 'cleanup_unverified' });
    assert.equal(value.receipts[0].errorCategory, 'cleanup_unverified');
    assert.equal(value.receipts[0].cleanupVerified, false);
  });
}
