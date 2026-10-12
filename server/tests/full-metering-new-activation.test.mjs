// Local synthetic acceptance only. No production command or rollout authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { createSqliteSubscriptionControlStore } from '../services/platform/subscription-control-db.mjs';
import { summarizeUsageSamples, usageCycleForBinding } from '../services/platform/usage-billing-cycle.mjs';
import { runFullMeteringCollection } from '../../scripts/lib/full-metering-collection.mjs';
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from '../../scripts/lib/full-metering-scope.mjs';
import { createFullMeteringSampleWriter, makeFullMeteringSample } from '../../scripts/lib/full-metering-sample-writer.mjs';
import { assertFullMeteringJournalNoPending, readFullMeteringJournal } from '../../scripts/lib/full-metering-journal.mjs';
const channels = fullMeteringChannels(LOCAL_METERING_SCOPE);
const start = '2026-10-01T00:00:00.000Z', first = '2026-10-01T00:01:00.000Z';
const resumed = '2026-10-01T02:00:00.000Z', next = '2026-10-01T02:01:00.000Z';
const generation = 'f'.repeat(64); // Constant synthetic real-reader result, never changed for recovery.
const oldContext = { scopeDigest: 'a'.repeat(64), databaseIdentityDigest: 'b'.repeat(64), meteringScope: LOCAL_METERING_SCOPE };
const newContext = { ...oldContext, scopeDigest: 'c'.repeat(64) };
const oldActivation = 'synthetic-old-local-three', newActivation = 'synthetic-new-local-three';
const rightsTables = ['platform_accounts', 'platform_entitlements', 'platform_issuance_requests',
  'platform_issued_subscription_links', 'platform_portal_access_requests', 'platform_portal_edge_credentials', 'platform_usage_counter_cursors'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function tree(directory) {
  const result = [];
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) walk(child);
      else { assert.equal(entry.isFile(), true); result.push([relative(directory, child), readFileSync(child).toString('base64')]); }
    }
  }
  walk(directory); return result;
}

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'full-metering-new-activation-'));
  const db = new Database(join(parent, 'synthetic.sqlite'));
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => {
    if (db.open) db.close();
    const target = realpathSync(parent);
    assert.ok(target.startsWith(realpathSync(tmpdir()) + sep) || target.startsWith(tmpdir() + sep));
    assert.equal(lstatSync(parent).isSymbolicLink(), false);
    rmSync(target, { recursive: true, force: false, maxRetries: 3, retryDelay: 50 });
    assert.equal(existsSync(target), false);
  });
  const plan = 'offerv_plan_30d_50gb_monthly_v1';
  const billingBinding = { plan, validFrom: start, validUntil: '2026-10-31T00:00:00.000Z' };
  store.createAccount({ id: 'synthetic-account', ownerRef: 'synthetic-owner', status: 'active', createdAt: start, updatedAt: start });
  store.createEntitlement({ id: 'synthetic-entitlement', accountId: 'synthetic-account', status: 'active',
    ...billingBinding, trafficLimitBytes: 1000000, createdAt: start, updatedAt: start });
  store.createIssuanceRequest({ id: 'synthetic-request', accountId: 'synthetic-account', entitlementId: 'synthetic-entitlement', status: 'issued',
    approvalRef: 'synthetic-approval', quantity: 1, nodeId: channels[0].channelRef, purpose: 'synthetic', requestedByRef: 'synthetic', createdAt: start, updatedAt: start });
  const bindings = channels.map((source, index) => ({ ...source, edgeCredentialRef: `synthetic-ref-${index}`,
    accountId: 'synthetic-account', entitlementId: 'synthetic-entitlement', requestId: 'synthetic-request',
    materialDigest: `sha256:${'d'.repeat(64)}`, billingBinding }));
  const f = { parent, db, store, bindings, now: start, value: 1000, sourceReads: 0, writerCalls: 0,
    oldDirectory: join(parent, 'old-journal'), newDirectory: join(parent, 'new-journal'),
    rights: () => rightsTables.map(name => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
    samples: () => db.prepare('SELECT * FROM platform_usage_samples ORDER BY id').all(),
    rollups: () => db.prepare('SELECT * FROM platform_usage_rollups ORDER BY edge_credential_ref').all(),
    summary: () => ({ samples: db.prepare('SELECT count(*) AS count, coalesce(sum(total_bytes),0) AS bytes FROM platform_usage_samples').get(),
      rollupBytes: db.prepare('SELECT coalesce(sum(total_bytes),0) AS bytes FROM platform_usage_rollups').get().bytes }),
    billingUsage() {
      const cycle = usageCycleForBinding(billingBinding, f.now);
      return summarizeUsageSamples(store.listUsageSamples({ accountId: 'synthetic-account', entitlementId: 'synthetic-entitlement',
        requestId: 'synthetic-request', observedFrom: cycle.startedAt, observedTo: cycle.endedAt })).totalBytes;
    },
    checkpoint(lane = 'old') { return readFullMeteringJournal({ directory: lane === 'old' ? f.oldDirectory : f.newDirectory, context: lane === 'old' ? oldContext : newContext }); },
    async run(lane, mode, overrides = {}) {
      const activationId = lane === 'old' ? oldActivation : newActivation;
      const writer = createFullMeteringSampleWriter({ database: db, controlStore: store,
        meteringScope: LOCAL_METERING_SCOPE, activationId, readBindings: () => ({ entries: bindings }) });
      return runFullMeteringCollection({ directory: lane === 'old' ? f.oldDirectory : f.newDirectory,
        context: lane === 'old' ? oldContext : newContext, activationId, mode, meteringScope: LOCAL_METERING_SCOPE,
        nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: [] }),
        readSources: async () => { f.sourceReads++; return channels.map((source, index) => ({ ...source, generation, observedAt: f.now,
          observations: [{ edgeCredentialRef: bindings[index].edgeCredentialRef, uploadBytes: f.value, downloadBytes: f.value,
            ...(source.mode === 'connections' ? { connectionId: 'synthetic-same-connection' } : {}) }] })); },
        readPlanSwitchProof: () => { throw new Error('unexpected_commerce_proof_for_unchanged_synthetic_bindings'); },
        applySamples: samples => { f.writerCalls++; return writer(samples); }, ...overrides });
    },
    async seed() { await f.run('old', 'initialize'); f.now = first; f.value = 1010; await f.run('old', 'collect'); }
  };
  return f;
}

// TEST-LOCAL OPERATOR GATE MODEL, NOT an existing production API:
// native initialize sees only its own new directory, not this old lane.
function operatorGuardModel(f, { oldWriterStopped, activationUnused, expectedOldTreeDigest }) {
  assert.equal(oldWriterStopped, true, 'operator_old_writer_not_stopped');
  assert.equal(activationUnused, true, 'operator_activation_not_unique');
  assertFullMeteringJournalNoPending({ directory: f.oldDirectory });
  assert.equal(existsSync(join(f.oldDirectory, 'writer.lock')), false, 'operator_old_writer_lock');
  assert.equal(digest(JSON.stringify(tree(f.oldDirectory))), expectedOldTreeDigest, 'operator_old_evidence_changed');
  assert.equal(existsSync(f.newDirectory), false, 'operator_new_journal_exists');
  assert.notEqual(resolve(f.newDirectory), resolve(f.oldDirectory));
}
const proof = f => ({ oldWriterStopped: true, activationUnused: true, expectedOldTreeDigest: digest(JSON.stringify(tree(f.oldDirectory))) });

test('same scope and generation: retain historical 60 bytes, skip 29940 paused bytes, record only 42 new bytes', async t => {
  const f = fixture(t); await f.seed();
  const oldBytes = tree(f.oldDirectory), samplesBefore = f.samples(), rollupsBefore = f.rollups(), rightsBefore = f.rights();
  assert.deepEqual(f.summary(), { samples: { count: 3, bytes: 60 }, rollupBytes: 60 });
  assert.equal(f.billingUsage(), 60);
  const oldState = f.checkpoint();
  f.now = resumed; f.value = 6000;
  operatorGuardModel(f, proof(f));
  const calls = f.writerCalls;
  const initialized = await f.run('new', 'initialize');
  assert.equal(initialized.status, 'baseline_initialized');
  assert.equal(initialized.sampleCount, 0); assert.equal(initialized.recordedBytes, 0); assert.equal(f.writerCalls, calls);
  assert.deepEqual(f.samples(), samplesBefore); assert.deepEqual(f.rollups(), rollupsBefore); assert.deepEqual(f.rights(), rightsBefore);
  assert.equal(f.billingUsage(), 60); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  const newState = f.checkpoint('new');
  assert.equal(newState.activationId, newActivation); assert.equal(newState.sequence, 0);
  assert.equal(newState.meteringScope, oldState.meteringScope);
  assert.deepEqual(newState.sources.map(source => source.counterState.generation), oldState.sources.map(source => source.counterState.generation));
  assert.equal(newState.sources.reduce((sum, source) => sum + source.counterState.entries.reduce((n,e) => n + e.usage.uploadBytes + e.usage.downloadBytes, 0), 0), 0);
  f.now = next; f.value = 6007;
  const collected = await f.run('new', 'collect');
  assert.equal(collected.sampleCount, 3); assert.equal(collected.recordedBytes, 42);
  assert.deepEqual(f.summary(), { samples: { count: 6, bytes: 102 }, rollupBytes: 102 });
  assert.equal(f.billingUsage(), 102); assert.deepEqual(f.rights(), rightsBefore); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  for (const row of samplesBefore) assert.deepEqual(f.samples().find(current => current.id === row.id), row);
  for (const row of rollupsBefore) assert.equal(f.rollups().find(current => current.edge_credential_ref === row.edge_credential_ref).total_bytes, row.total_bytes + 14);
  const newSamples = f.samples().filter(row => !samplesBefore.some(old => old.id === row.id));
  assert.ok(newSamples.every(row => row.interval_started_at === resumed && row.interval_ended_at === next && row.total_bytes === 14));
  assert.equal((await f.run('new', 'collect')).sampleCount, 0);
  assert.equal(f.billingUsage(), 102); assert.equal(f.db.pragma('integrity_check', { simple: true }), 'ok');
});

test('existing journal initialize fails without overwriting old evidence or billing state', async t => {
  const f = fixture(t); await f.seed(); const oldBytes = tree(f.oldDirectory), before = f.summary();
  f.now = resumed; f.value = 6000;
  await assert.rejects(f.run('old', 'initialize'), error => error.code === 'EEXIST');
  assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(f.summary(), before); assert.equal(f.billingUsage(), 60);
});

test('old pending is rejected by explicit operator gate; native new initialization does NOT inspect another journal', async t => {
  const f = fixture(t); await f.seed(); f.now = resumed; f.value = 1020;
  await assert.rejects(f.run('old', 'collect', { onStage(stage) { if (stage === 'pending_durable') throw new Error('synthetic_pause'); } }), /synthetic_pause/);
  assert.equal(existsSync(join(f.oldDirectory, 'pending.json')), true);
  const before = f.summary(), oldBytes = tree(f.oldDirectory), reads = f.sourceReads;
  assert.throws(() => operatorGuardModel(f, proof(f)), /full_metering_pending_recovery_required/);
  assert.equal(existsSync(f.newDirectory), false); assert.equal(f.sourceReads, reads); assert.deepEqual(f.summary(), before);
  // Deliberate local negative control: bypassing that EXTERNAL gate is possible.
  // Do not mistake native initialize success for safe production custody.
  const unguarded = await f.run('new', 'initialize');
  assert.equal(unguarded.sampleCount, 0); assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(f.summary(), before);
});

test('old writer and activation uniqueness are explicit operator obligations, not an implicit global registry', async t => {
  const f = fixture(t); await f.seed(); const before = f.summary();
  assert.throws(() => operatorGuardModel(f, { ...proof(f), oldWriterStopped: false }), /operator_old_writer_not_stopped/);
  assert.throws(() => operatorGuardModel(f, { ...proof(f), activationUnused: false }), /operator_activation_not_unique/);
  assert.equal(existsSync(f.newDirectory), false); assert.deepEqual(f.summary(), before);
});

test('activation-specific sample IDs differ and writer rejects foreign activation; this is NOT cross-lane deduplication', t => {
  const f = fixture(t);
  const input = { binding: f.bindings[0], generation, delta: { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: resumed, intervalEndedAt: next } };
  const oldSample = makeFullMeteringSample({ ...input, activationId: oldActivation });
  const newSample = makeFullMeteringSample({ ...input, activationId: newActivation });
  assert.notEqual(oldSample.record.id, newSample.record.id); assert.notEqual(oldSample.record.sampleDigest, newSample.record.sampleDigest);
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.store, meteringScope: LOCAL_METERING_SCOPE,
    activationId: newActivation, readBindings: () => ({ entries: f.bindings }) });
  assert.throws(() => writer([oldSample]), /full_metering_sample_scope_invalid/);
  assert.deepEqual(f.summary(), { samples: { count: 0, bytes: 0 }, rollupBytes: 0 });
});

test('source failure before initialization leaves new journal absent, old evidence and historical usage unchanged', async t => {
  const f = fixture(t); await f.seed(); const before = f.summary(), oldBytes = tree(f.oldDirectory), rightsBefore = f.rights();
  f.now = resumed; f.value = 6000;
  await assert.rejects(f.run('new', 'initialize', { readSources: async () => { throw new Error('synthetic_source_failed'); } }), /synthetic_source_failed/);
  assert.equal(existsSync(f.newDirectory), false); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  assert.deepEqual(f.summary(), before); assert.deepEqual(f.rights(), rightsBefore); assert.equal(f.billingUsage(), 60);
});
