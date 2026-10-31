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
  correlateOnFailureStop
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

test('status path binding compares App with the traffic-usage writer, never the full-metering unit', () => {
  const app = {
    EnvironmentFiles: ['/etc/proxy-gateway.env (ignore_errors=no)'],
    Environment: 'EDGE_USAGE_COLLECTOR_STATUS_PATH=/var/lib/gccgw/traffic-status.json',
    PassEnvironment: '', UnsetEnvironment: ''
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
