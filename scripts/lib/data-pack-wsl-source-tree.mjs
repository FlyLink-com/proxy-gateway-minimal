import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
const fail = () => { throw Object.assign(new Error('wsl_source_tree_invalid'), { code: 'wsl_source_tree_invalid' }); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyDataPackSourceTree({ sourceRoot, manifestBytes, manifestSha256,
  expectedCommit } = {}) {
  if (!Buffer.isBuffer(manifestBytes) || manifestBytes.length > 32 * 1024 * 1024
    || hash(manifestBytes) !== manifestSha256 || realpathSync(sourceRoot) !== resolve(sourceRoot)) fail();
  let value;
  try { value = JSON.parse(manifestBytes); } catch { fail(); }
  if (value?.schemaVersion !== 1 || value.sourceCommit !== expectedCommit
    || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 100000) fail();
  const expected = new Map();
  for (const item of value.entries) {
    if (!item || typeof item.path !== 'string' || item.path.startsWith('/')
      || item.path.includes('\\') || item.path.split('/').some(part => !part || ['.', '..'].includes(part))
      || expected.has(item.path) || !['file', 'directory'].includes(item.type)
      || (item.type === 'file' && (!/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.executable !== 'boolean'))) fail();
    expected.set(item.path, item);
  }
  let count = 0, bytes = 0;
  function visit(path, relative) {
    const info = lstatSync(path), item = expected.get(relative);
    if (!item || info.isSymbolicLink() || ++count > 100000) fail();
    expected.delete(relative);
    if (item.type === 'directory') {
      if (!info.isDirectory()) fail();
      for (const name of readdirSync(path)) visit(join(path, name), `${relative}/${name}`);
    } else {
      if (!info.isFile() || (bytes += info.size) > 512 * 1024 * 1024
        || hash(readFileSync(path)) !== item.sha256
        || process.platform !== 'win32' && Boolean(info.mode & 0o100) !== item.executable) fail();
    }
  }
  if (!lstatSync(sourceRoot).isDirectory()) fail();
  for (const name of readdirSync(sourceRoot)) visit(join(sourceRoot, name), name);
  if (expected.size !== 0) fail();
  return { verified: true, entryCount: count, sizeBytes: bytes };
}
