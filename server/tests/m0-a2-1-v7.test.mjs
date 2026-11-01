import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseArguments,
  parseSystemdOutput,
  validateArchiveManifest,
  inspectFullMeteringExecStart,
  inspectStatusWriterExecStart,
  resolveStatusBinding,
  isExpectedFailureInvocation,
  extractFailureErrorCode,
  correlateOnFailureStop,
  inspectStopUnitExecStart,
  sameAppReleaseBinding,
  extractSingleEnvironmentValueFromChunks,
  isSafeStatusFileMetadata,
  isSafeStatusDirectoryMetadata,
  inspectOnFailure,
  isExpectedNodeVersion,
  isRootServiceIdentity
} from '../../scripts/lib/m0-a2-1-v7-diagnostic.mjs';
import { FILES } from '../../scripts/lib/m0-a2-1-v7-archive-pins.mjs';

const BASE = '/opt/proxy-gateway-minimal-candidate';
const ARCHIVE = '/opt/gccwebos-runtime/collector-plan-e834185cca07';
const CONFIG = `${BASE}/full-metering-bwh-local-20261012/config.json`;
const FULL_SERVICE = 'gccgw-full-metering-collect.service';

test('argument gate accepts one exact release label and rejects missing, malformed, or extra args', () => {
  assert.deepEqual(parseArguments(['--expected-release','control-plane-fixture']), {
    mode: 'run', expectedRelease: 'control-plane-fixture'
  });
  assert.equal(parseArguments([]).error, 'expected_release_required');
  assert.equal(parseArguments(['--expected-release']).error, 'expected_release_required');
  assert.equal(parseArguments(['--expected-release','../unsafe']).error, 'expected_release_invalid');
  assert.equal(parseArguments(['--expected-release','one','--expected-release','two']).error, 'unexpected_argument');
  assert.equal(parseArguments(['--self-test']).mode, 'self-test');
});

test('systemd parser accepts repeated EnvironmentFiles but rejects duplicate scalar and unexpected properties', () => {
  const allowed = ['LoadState','ActiveState','SubState','EnvironmentFiles'];
  const row = parseSystemdOutput(
    'LoadState=loaded\r\nActiveState=active\r\nSubState=running\r\nEnvironmentFiles=/etc/app.env\r\nEnvironmentFiles=/etc/override.env\r\n',
    allowed
  );
  assert.deepEqual(row.EnvironmentFiles, ['/etc/app.env','/etc/override.env']);
  assert.throws(() => parseSystemdOutput('LoadState=loaded\nLoadState=loaded\nActiveState=active\nSubState=running\n', allowed), e => e.safeCode === 'systemd_duplicate_property');
  assert.throws(() => parseSystemdOutput('LoadState=loaded\nActiveState=active\nSubState=running\nExecStart=secret\n', allowed), e => e.safeCode === 'systemd_unexpected_property');
  assert.throws(() => parseSystemdOutput('LoadState=loaded\nnot-a-property\n', allowed), e => e.safeCode === 'systemd_malformed_line');
  assert.throws(() => parseSystemdOutput('', allowed), e => e.safeCode === 'systemd_empty_output');
});

test('archive manifest remains an exact 49-file unique safe closure', () => {
  assert.equal(FILES.length, 49);
  assert.equal(new Set(FILES.map(([file]) => file)).size, 49);
  assert.equal(validateArchiveManifest(), true);
  assert.throws(() => validateArchiveManifest([...FILES, FILES[0]]), e => e.safeCode === 'archive_manifest_invalid');
  assert.throws(() => validateArchiveManifest([['../escape','a'.repeat(64),1], ...FILES.slice(1)]), e => e.safeCode === 'archive_manifest_invalid');
});

test('full-metering ExecStart must bind the historical 49-file root, script, config path and digest argument', () => {
  const good = `{ path=/usr/bin/node ; argv[]=/usr/bin/node ${ARCHIVE}/scripts/traffic-full-metering-collect.mjs --collect --config ${CONFIG} --config-sha256 ${'a'.repeat(64)} ; }`;
  assert.deepEqual(inspectFullMeteringExecStart(good, ARCHIVE), { matched: true, configDigestPresent: true });
  assert.equal(inspectFullMeteringExecStart(good, '/tmp/other').matched, false);
  assert.equal(inspectFullMeteringExecStart(good.replace(`${'a'.repeat(64)}`, 'not-a-digest'), ARCHIVE).matched, false);
  assert.equal(inspectFullMeteringExecStart(good.replace('--collect','--check'), ARCHIVE).matched, false);
  assert.equal(inspectFullMeteringExecStart(good.replace('path=/usr/bin/node','path=/bin/sh'), ARCHIVE).matched, false);
  assert.equal(inspectFullMeteringExecStart(good.replace(' ; }',' ; argv[]=/usr/bin/node /extra --collect ; }'), ARCHIVE).matched, false);
  assert.equal(inspectFullMeteringExecStart('raw command', ARCHIVE).matched, false);
});

test('status-writer ExecStart accepts canonical and POSIX current-symlink paths under Windows Node', () => {
  const appRoot = `${BASE}/releases/control-plane-fixture`;
  const canonical = `{ path=/usr/bin/node ; argv[]=/usr/bin/node ${appRoot}/scripts/traffic-usage-collect-once.mjs --collect ; }`;
  assert.equal(inspectStatusWriterExecStart(canonical, appRoot, appRoot), true);
  const current = `{ path=/usr/bin/node ; argv[]=/usr/bin/node ${BASE}/current/scripts/traffic-usage-collect-once.mjs --collect ; }`;
  const realpath = value => value === `${BASE}/current` ? appRoot : value;
  assert.equal(inspectStatusWriterExecStart(current, `${BASE}/current`, appRoot, realpath), true);
  assert.equal(inspectStatusWriterExecStart(canonical, '/tmp/unbound', appRoot), false);
  assert.equal(inspectStatusWriterExecStart(canonical.replace('--collect','--check'), appRoot, appRoot), false);
  assert.equal(inspectStatusWriterExecStart(canonical.replace('path=/usr/bin/node','path=/bin/sh'), appRoot, appRoot), false);
  assert.equal(inspectStatusWriterExecStart(canonical.replace(' ; }',' ; argv[]=/usr/bin/node /extra --collect ; }'), appRoot, appRoot), false);
  assert.equal(inspectStatusWriterExecStart(canonical.replace('--collect ;','--collect --unsafe ;'), appRoot, appRoot), false);
});

test('App release stability requires the same current symlink target, inode signature, release and PID', () => {
  const before = {
    appRoot: `${BASE}/releases/control-plane-fixture`,
    releaseLabel: 'control-plane-fixture',
    pid: '1234',
    currentPointer: { target: 'releases/control-plane-fixture', signature: ['dev-1','ino-1','mode','uid','gid','nlink','size','mtime','ctime'] }
  };
  assert.equal(sameAppReleaseBinding(before, structuredClone(before)), true);
  assert.equal(sameAppReleaseBinding(before, { ...before, currentPointer: { ...before.currentPointer, signature: ['dev-1','ino-2','mode','uid','gid','nlink','size','mtime','ctime'] } }), false);
  assert.equal(sameAppReleaseBinding(before, { ...before, currentPointer: { ...before.currentPointer, target: 'releases/other' } }), false);
  assert.equal(sameAppReleaseBinding(before, { ...before, appRoot: `${BASE}/releases/other` }), false);
  assert.equal(sameAppReleaseBinding(before, { ...before, pid: '5678' }), false);
});

test('stop-unit ExecStart requires the exact systemctl stop argv and rejects shell wrappers or extra arguments', () => {
  const timer = FULL_SERVICE.replace('collect.service','collect.timer');
  const good = `{ path=/usr/bin/systemctl ; argv[]=/usr/bin/systemctl stop ${timer} ; ignore_errors=no ; }`;
  assert.equal(inspectStopUnitExecStart(good), true);
  assert.equal(inspectStopUnitExecStart(good.replace('path=/usr/bin/systemctl','path=/bin/sh')), false);
  assert.equal(inspectStopUnitExecStart(good.replace(' stop ',' restart ')), false);
  assert.equal(inspectStopUnitExecStart(good.replace(`${timer} ;`, `${timer} --no-block ;`)), false);
  assert.equal(inspectStopUnitExecStart(good.replace(' ; ignore_errors=no ;',' ; argv[]=/usr/bin/systemctl start other.timer ; ignore_errors=no ;')), false);
  assert.equal(inspectStopUnitExecStart(`{ path=/bin/sh ; argv[]=/bin/sh -c "/usr/bin/systemctl stop ${timer}" ; }`), false);
  assert.equal(inspectStopUnitExecStart('raw command'), false);
});

test('status path binding compares App with the traffic-usage writer, never the full-metering unit', () => {
  const app = {
    EnvironmentFiles: [],
    Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/gccgw/traffic-status.json',
    PassEnvironment: '', UnsetEnvironment: '', User: '', Group: '', DynamicUser: 'no'
  };
  const statusWriter = { ...app };
  assert.equal(resolveStatusBinding(app, statusWriter, '/var/lib/gccgw/traffic-status.json'), true);
  assert.equal(resolveStatusBinding(app, { ...statusWriter, EnvironmentFiles: ['/etc/other.env'] }, '/var/lib/gccgw/traffic-status.json'), false);
  assert.equal(resolveStatusBinding(app, { ...statusWriter, Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/other.json' }, '/var/lib/gccgw/traffic-status.json'), false);
  assert.equal(resolveStatusBinding(app, statusWriter, '/var/lib/other.json'), false);
  assert.equal(resolveStatusBinding({ ...app, Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/gccgw/../escape.json' }, { ...statusWriter, Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/gccgw/../escape.json' }, '/var/lib/gccgw/../escape.json'), false);
  assert.equal(resolveStatusBinding(app, { ...statusWriter, UnsetEnvironment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH' }, '/var/lib/gccgw/traffic-status.json'), false);
  assert.equal(resolveStatusBinding({ ...app, Environment: `${app.Environment} EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/other.json` }, statusWriter, '/var/lib/gccgw/traffic-status.json'), false);
});

test('failed error code is extracted only from the exact service invocation and safe message shape', () => {
  const invocation = 'a'.repeat(32);
  const goodMessage = JSON.stringify({ type: 'full_metering_collection', ok: false, status: 'blocked', errorCode: 'full_metering_binding_changed' });
  const goodRow = JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: goodMessage });
  assert.equal(extractFailureErrorCode(goodRow, invocation), 'full_metering_binding_changed');
  assert.equal(extractFailureErrorCode(goodRow, 'b'.repeat(32)), 'unknown');
  assert.equal(extractFailureErrorCode(goodRow, invocation, 'other.service'), 'unknown');
  const wrongType = JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: JSON.stringify({ type: 'other', ok: false, status: 'blocked', errorCode: 'full_metering_binding_changed' }) });
  assert.equal(extractFailureErrorCode(wrongType, invocation), 'unknown');
  const secret = JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: JSON.stringify({ type: 'full_metering_collection', ok: false, status: 'blocked', errorCode: 'password=do-not-print' }) });
  assert.equal(extractFailureErrorCode(secret, invocation), 'unknown');
  const second = JSON.stringify({ _SYSTEMD_INVOCATION_ID: invocation, _SYSTEMD_UNIT: FULL_SERVICE, MESSAGE: JSON.stringify({ type: 'full_metering_collection', ok: false, status: 'blocked', errorCode: 'full_metering_payload_invalid' }) });
  assert.equal(extractFailureErrorCode(`${goodRow}\n${second}`, invocation), 'unknown');
  assert.equal(extractFailureErrorCode(`raw secret text ${'x'.repeat(50000)}`, invocation), 'unknown');
});

test('journal access gate requires the recorded 2026-10-20 start timestamp and a valid InvocationID', () => {
  const invocation = 'c'.repeat(32);
  assert.equal(isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', invocation, '2', 'exit-code'), true);
  assert.equal(isExpectedFailureInvocation('Tue Oct 20 02:15:07 UTC', invocation, '2', 'exit-code'), true);
  assert.equal(isExpectedFailureInvocation('Tue 2026-10-21 02:15:07 UTC', invocation, '2', 'exit-code'), false);
  assert.equal(isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', '0'.repeat(32), '2', 'exit-code'), false);
  assert.equal(isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', 'not-an-id', '2', 'exit-code'), false);
  assert.equal(isExpectedFailureInvocation('Tue 2026-10-20 02:15:07 UTC', invocation, '0', 'success'), false);
});

test('OnFailure stop correlation is time-bounded and never claims causality by itself', () => {
  assert.equal(correlateOnFailureStop('Tue 2026-10-20 02:15:08 UTC','Tue 2026-10-20 02:15:09 UTC'), 'matched');
  assert.equal(correlateOnFailureStop('Tue 2026-10-20 02:15:08 UTC','Tue 2026-10-20 02:16:00 UTC'), 'not_matched');
  assert.equal(correlateOnFailureStop('unknown','unknown'), 'unknown');
});

test('production branch has only fixed read commands and no systemd mutation or file-write APIs', () => {
  const source = readFileSync(new URL('../../scripts/lib/m0-a2-1-v7-diagnostic.mjs', import.meta.url), 'utf8')
    + readFileSync(new URL('../../scripts/m0-a2-1-v7.mjs', import.meta.url), 'utf8')
    + readFileSync(new URL('../../scripts/lib/m0-a2-1-v7-archive-pins.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/spawnSync\(/g) || []).length, 2);
  assert.match(source, /spawnSync\('\/usr\/bin\/systemctl'/);
  assert.match(source, /spawnSync\('\/usr\/bin\/journalctl'/);
  assert.match(source, /shell: false/g);
  assert.doesNotMatch(source, /writeFileSync|appendFileSync|unlinkSync|renameSync|chmodSync|chownSync|execSync|execFileSync/);
  assert.doesNotMatch(source, /systemctl\s+(start|stop|restart|enable|disable|reset-failed|daemon-reload)/);
  assert.match(source, /const args = \['show', unit/);
  assert.match(source, /'--no-pager','--output=json','--lines=64'/);
  const pidFormatter = source.indexOf('const pidPresent =');
  const pidFormatterUse = source.indexOf('main_pid_present=${pidPresent');
  assert.ok(pidFormatter >= 0 && pidFormatter < pidFormatterUse, 'PID formatter must be initialized before production output uses it');
  assert.doesNotMatch(source, /readFileSync\([^)]*CONFIG_PATH/);
  assert.doesNotMatch(source, /subscription-control\.sqlite|checkpoint\.json|full-metering-bwh-local-20261009\/journal/);
  assert.doesNotMatch(source, /--collect\s*(?:;|\n).*spawnSync/);
});

test('future production invocation is wrapped in an external hard timeout', () => {
  const readme = readFileSync(new URL('../../docs/runbooks/m0-a2-1-v7/README.md', import.meta.url), 'utf8');
  assert.match(readme, /sudo \/usr\/bin\/timeout --signal=TERM --kill-after=5s 45s/);
  assert.match(readme, /timeout exit (?:status|code) (?:124|137)/i);
  assert.doesNotMatch(readme, /sudo \/usr\/bin\/node scripts\/m0-a2-1-v7\.mjs --expected-release/);
});


test('status binding fails closed when EnvironmentFiles can override direct assignments or service identity is not root', () => {
  const app = {
    EnvironmentFiles: [],
    Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/gccgw/traffic-status.json',
    PassEnvironment: '', UnsetEnvironment: '', User: '', Group: '', DynamicUser: 'no'
  };
  const writer = { ...app };
  const value = '/var/lib/gccgw/traffic-status.json';
  assert.equal(resolveStatusBinding(app, writer, value), true);
  assert.equal(resolveStatusBinding({ ...app, EnvironmentFiles: ['/etc/proxy-gateway.env'] }, writer, value), false);
  assert.equal(resolveStatusBinding(app, { ...writer, EnvironmentFiles: ['/etc/proxy-gateway.env'] }, value), false);
  assert.equal(resolveStatusBinding(app, { ...writer, User: 'proxy' }, value), false);
  assert.equal(resolveStatusBinding({ ...app, UnsetEnvironment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH' }, writer, value), false);
  assert.equal(resolveStatusBinding({ ...app, PassEnvironment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH' }, writer, value), false);
  assert.equal(isRootServiceIdentity(writer), true);
  assert.equal(isRootServiceIdentity({ ...writer, DynamicUser: 'yes' }), false);
});

test('process environment scanner retains only one target value and handles chunk boundaries and duplicates', () => {
  const key = 'EDGE_USAGE_COLLECTOR_STATUS_PATH';
  const raw = Buffer.from('LANG=C\\0' + key + '=/var/lib/gccgw/traffic-status.json\\0PATH=/usr/bin\\0');
  const chunks = [raw.subarray(0, 7), raw.subarray(7, 29), raw.subarray(29, 47), raw.subarray(47)];
  assert.equal(extractSingleEnvironmentValueFromChunks(chunks, key), '/var/lib/gccgw/traffic-status.json');
  assert.equal(extractSingleEnvironmentValueFromChunks([Buffer.from(key + '=/one\\0' + key + '=/two\\0')], key), null);
  assert.equal(extractSingleEnvironmentValueFromChunks([Buffer.from('LANG=C\\0')], key), null);
  assert.throws(() => extractSingleEnvironmentValueFromChunks([Buffer.from('LANG=C')], key, 3), error => error.safeCode === 'process_environment_too_large');
});

test('status file and every parent directory require root ownership and restrictive metadata', () => {
  const file = {
    isFile: () => true, isSymbolicLink: () => false,
    uid: 0n, gid: 0n, nlink: 1n, mode: 0o100600n, size: 128n
  };
  assert.equal(isSafeStatusFileMetadata(file), true);
  assert.equal(isSafeStatusFileMetadata({ ...file, uid: 1000n }), false);
  assert.equal(isSafeStatusFileMetadata({ ...file, gid: 1000n }), false);
  assert.equal(isSafeStatusFileMetadata({ ...file, nlink: 2n }), false);
  assert.equal(isSafeStatusFileMetadata({ ...file, mode: 0o100640n }), false);
  assert.equal(isSafeStatusFileMetadata({ ...file, size: 300000n }), false);
  const directory = { isDirectory: () => true, isSymbolicLink: () => false, uid: 0n, gid: 0n, mode: 0o40755n };
  assert.equal(isSafeStatusDirectoryMetadata(directory), true);
  assert.equal(isSafeStatusDirectoryMetadata({ ...directory, uid: 1000n }), false);
  assert.equal(isSafeStatusDirectoryMetadata({ ...directory, mode: 0o40775n }), false);
  assert.equal(isSafeStatusDirectoryMetadata({ ...directory, isSymbolicLink: () => true }), false);
});

test('OnFailure reports additional handlers instead of hiding them', () => {
  const stop = 'gccgw-full-metering-collect-stop.service';
  assert.deepEqual(inspectOnFailure(stop), { status: 'linked_only', extraCount: 0 });
  assert.deepEqual(inspectOnFailure(stop + ' alert.service'), { status: 'linked_with_extras', extraCount: 1 });
  assert.deepEqual(inspectOnFailure('alert.service'), { status: 'not_linked', extraCount: 1 });
  assert.deepEqual(inspectOnFailure(stop + ' ' + stop), { status: 'unknown', extraCount: null });
  assert.deepEqual(inspectOnFailure('bad/unit'), { status: 'unknown', extraCount: null });
});

test('production runtime accepts only the exact documented Node v22.16.0', () => {
  assert.equal(isExpectedNodeVersion('22.16.0'), true);
  assert.equal(isExpectedNodeVersion('22.16.1'), false);
  assert.equal(isExpectedNodeVersion('22.17.0'), false);
  assert.equal(isExpectedNodeVersion('24.16.0'), false);
});
