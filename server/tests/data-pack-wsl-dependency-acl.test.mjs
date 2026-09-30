import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { posix } from 'node:path';
import test from 'node:test';

const helperUrl = new URL('../../scripts/lib/data-pack-wsl-dependency-acl.mjs', import.meta.url);
const helper = await import(helperUrl.href).catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const runDir = '/tmp/gccgw-data-pack-wsl.Ab12Cd34';
const treeRoot = `${runDir}/dependencies/node_modules`;
const entry = readFileSync(new URL('../../scripts/data-pack-wsl-acceptance.mjs', import.meta.url), 'utf8');
const driver = readFileSync(new URL('../../scripts/data-pack-wsl-acceptance.sh', import.meta.url), 'utf8');

function checkerWith(result = { status: 0, stdout: 'verified\n', stderr: '' }) {
  assert.equal(typeof helper.createDataPackDependencyAclChecker, 'function');
  const calls = [];
  const check = helper.createDataPackDependencyAclChecker(runDir, {
    spawn(command, args, options) { calls.push({ command, args, options }); return result; }
  });
  return { check, calls };
}

test('WSL dependency ancestors are inspected individually, not recursively', () => {
  const { check, calls } = checkerWith();
  for (const path of [runDir, '/tmp', '/']) assert.equal(check(path), true);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.command, '/usr/bin/python3');
    assert.deepEqual(call.args.slice(0, 3), ['-I', '-S', '-c']);
    assert.equal(call.args.at(-1), 'single');
    assert.equal(call.options.shell, false);
    assert.deepEqual(call.options.env, {});
    assert.equal(call.options.timeout, 10000);
    assert.equal(call.options.maxBuffer, 1024);
  }
});

test('only the exact extracted dependency tree receives recursive inspection', () => {
  const { check, calls } = checkerWith();
  assert.equal(check(treeRoot), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(-2), [treeRoot, 'recursive']);
});

test('ACL callback rejects sibling, parent traversal, host and alternate tree paths before inspection', () => {
  const { check, calls } = checkerWith();
  for (const path of [
    '/home', '/root', '/etc', `${runDir}/source`, `${runDir}/dependencies`,
    `${treeRoot}/child`, `${runDir}-other/dependencies/node_modules`,
    `${runDir}/../dependencies/node_modules`, `${treeRoot}/`, `${treeRoot}\n`,
    null, undefined, 1
  ]) assert.equal(check(path), false);
  assert.equal(calls.length, 0);
});

test('invalid run directory cannot construct the dependency inspector', () => {
  assert.equal(typeof helper.createDataPackDependencyAclChecker, 'function');
  for (const path of ['/tmp', '/tmp/gccgw-data-pack-wsl.short', `${runDir}/..`, null]) {
    assert.throws(() => helper.createDataPackDependencyAclChecker(path),
      error => error.code === 'wsl_acceptance_input_invalid');
  }
});

for (const [label, result] of [
  ['ACL or capability rejection', { status: 1, stdout: '', stderr: '' }],
  ['inspection unavailable', { status: null, error: new Error('private diagnostic'), stdout: '', stderr: '' }],
  ['inspection timeout', { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }],
  ['unexpected stdout', { status: 0, stdout: 'verified\nprivate detail', stderr: '' }],
  ['unexpected stderr', { status: 0, stdout: 'verified\n', stderr: 'private detail' }]
]) test(`dependency ACL fails closed for ${label}`, () => {
  const { check } = checkerWith(result);
  assert.equal(check('/tmp'), false);
  assert.equal(check(treeRoot), false);
});

test('the unchanged strict parent walk works with the exact WSL inspector and still rejects writable /tmp', () => {
  const source = readFileSync(new URL('../../scripts/control-plane-dependency-artifact-lib.mjs', import.meta.url), 'utf8');
  const functionSource = source.match(/function assertControlledDestinationParent\(root, runtime\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);
  const { check, calls } = checkerWith();
  let tmpMode = 0o755;
  // Execute the actual strict parent function with in-memory filesystem metadata;
  // no archive extraction, namespace, Python or protocol process is started.
  const validate = new Function('dirname', 'lstatSync', 'mode', 'auditAcl', 'fail',
    `${functionSource}; return assertControlledDestinationParent;`)(
    posix.dirname,
    path => ({ uid: 0, gid: 0, mode: path === '/tmp' ? tmpMode : path === runDir ? 0o700 : 0o755,
      isSymbolicLink: () => false, isDirectory: () => true }),
    value => value.mode,
    (path, runtime, recursive) => {
      assert.equal(recursive, false);
      if (runtime.checkAclCapabilities(path) !== true) throw Object.assign(new Error(), { code: 'dependency_acl_or_capability_invalid' });
    },
    code => { throw Object.assign(new Error(), { code }); }
  );
  validate(`${runDir}/dependencies`, { checkAclCapabilities: check, enforceOwnership: true });
  assert.deepEqual(calls.map(call => call.args.at(-2)), [runDir, '/tmp', '/']);
  tmpMode = 0o1777;
  assert.throws(() => validate(`${runDir}/dependencies`, { checkAclCapabilities: check }),
    error => error.code === 'dependency_archive_invalid');
});

test('namespace private tmp is non-writable by other principals and entry uses the scoped checker', () => {
  assert.match(driver, /mount -t tmpfs -o size=256m,mode=0755 tmpfs \/tmp/);
  assert.doesNotMatch(driver, /mode=1777 tmpfs \/tmp/);
  assert.match(entry, /createDataPackDependencyAclChecker\(runDir\)/);
  assert.doesNotMatch(entry, /function noAclOrCapabilities/);
});

for (const scenario of ['single', 'recursive', 'access_acl', 'default_acl', 'capability', 'unavailable', 'scan_error', 'too_many']) {
  test(`actual xattr inspector Python control flow: ${scenario}`, t => {
    const { check, calls } = checkerWith();
    check(treeRoot);
    const inspector = calls[0].args[3];
    // Execute the exact Python inspector with synthetic os metadata only. The
    // fixture replaces all filesystem inspection calls; it opens no directory.
    const fixture = `import os, sys, types, stat
scenario = sys.argv[1]
root = '/tmp/gccgw-data-pack-wsl.Ab12Cd34/dependencies/node_modules'
visited, scanned = [], []
def metadata(path):
 return types.SimpleNamespace(st_mode=(stat.S_IFLNK if path.endswith('/link') else stat.S_IFDIR if path in (root, root+'/child') else stat.S_IFREG) | 0o700)
def xattrs(path, follow_symlinks):
 if follow_symlinks is not False: raise AssertionError()
 visited.append(path)
 if scenario == 'unavailable': raise OSError()
 if path.endswith('/file'):
  return {'access_acl': ['system.posix_acl_access'], 'default_acl': ['system.posix_acl_default'], 'capability': ['security.capability']}.get(scenario, [])
 return []
class Entries:
 def __init__(self, path): self.path = path
 def __enter__(self):
  scanned.append(self.path)
  if scenario == 'single' or scenario == 'scan_error': raise AssertionError()
  if scenario == 'too_many': return (types.SimpleNamespace(path=root+'/'+str(n)) for n in range(100001))
  return iter(types.SimpleNamespace(path=path) for path in ([root+'/child', root+'/link'] if self.path == root else [root+'/child/file']))
 def __exit__(self, *args): pass
os.lstat, os.listxattr, os.scandir = metadata, xattrs, Entries
sys.argv = ['inspect', root, 'single' if scenario == 'single' else 'recursive']
exec(${JSON.stringify(inspector)})
if scenario == 'single':
 assert visited == [root] and scanned == []
else:
 assert sorted(visited) == sorted([root, root+'/child', root+'/child/file', root+'/link'])
 assert scanned == [root, root+'/child']
`;
    const result = spawnSync(process.platform === 'win32' ? 'python' : '/usr/bin/python3',
      ['-I', '-S', '-c', fixture, scenario], {
        env: {}, shell: false, encoding: 'utf8', timeout: 10000, maxBuffer: 1024
      });
    if (result.error?.code === 'ENOENT') return t.skip('Python source inspector test tool unavailable');
    assert.equal(result.status, ['single', 'recursive'].includes(scenario) ? 0 : 1);
    // The inspector's production runtime is Linux; this source fixture also
    // runs under Windows Python, whose print newline is CRLF by default.
    const verified = process.platform === 'win32' ? 'verified\r\n' : 'verified\n';
    assert.equal(result.stdout, ['single', 'recursive'].includes(scenario) ? verified : '');
    assert.equal(result.stderr, '');
  });
}
