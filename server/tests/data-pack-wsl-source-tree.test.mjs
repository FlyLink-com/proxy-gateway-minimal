import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyDataPackSourceTree } from '../../scripts/lib/data-pack-wsl-source-tree.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'pack-full-source-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  mkdirSync(join(sourceRoot, 'server'));
  writeFileSync(join(sourceRoot, 'server/accounting.mjs'), 'export const amount=1;', { mode: 0o600 });
  const expectedCommit = 'a'.repeat(40);
  const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, sourceCommit: expectedCommit,
    entries: [{ path: 'server', type: 'directory' }, { path: 'server/accounting.mjs', type: 'file',
      sha256: hash('export const amount=1;'), executable: false }] }));
  return { sourceRoot, expectedCommit, manifestBytes, manifestSha256: hash(manifestBytes) };
}
test('binds all source entries, including imported accounting modules', t => {
  assert.equal(verifyDataPackSourceTree(fixture(t)).entryCount, 2);
});
for (const [label, change] of [
  ['changed service', f => writeFileSync(join(f.sourceRoot, 'server/accounting.mjs'), 'export const amount=0;')],
  ['extra env', f => writeFileSync(join(f.sourceRoot, '.env'), 'synthetic')],
  ['missing service', f => rmSync(join(f.sourceRoot, 'server/accounting.mjs'))],
  ['manifest drift', f => { f.manifestSha256 = 'b'.repeat(64); }],
  ['source drift', f => { f.expectedCommit = 'b'.repeat(40); }]
]) test(`rejects ${label}`, t => {
  const f = fixture(t); change(f);
  assert.throws(() => verifyDataPackSourceTree(f), { code: 'wsl_source_tree_invalid' });
});
