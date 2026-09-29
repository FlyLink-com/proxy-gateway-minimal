import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const source = readFileSync(new URL('../../scripts/data-pack-wsl-acceptance.sh', import.meta.url), 'utf8');
const finish = source.match(/finish\(\) \{[\s\S]*?\n\}\n(?=trap finish EXIT)/)?.[0];
test('cleanup contract exists in the actual driver', () => assert.ok(finish));
test('namespace bind preserves the original directory rather than canonicalizing into masked tmp', () => {
  assert.ok(source.includes('mount --no-canonicalize --bind /proc/self/fd/3 "$1"'));
  assert.ok(source.includes('GCCGW_PARENT_RUN_ID="$RUN_ID"'));
});
for (const mode of ['healthy', 'copy_failure', 'receipt_write_failure']) {
  test('driver cleanup handles ' + mode + ' without false success', {
    skip: process.platform === 'win32' && process.env.GCCGW_WSL_SOURCE_VALIDATION !== 'true'
      ? 'explicit WSL source validation only; ordinary Windows tests require no WSL' : false
  }, () => {
    const input = [
      'set -Eeuo pipefail', 'umask 077',
      'RUN_DIR=$(mktemp -d /tmp/gccgw-data-pack-wsl.XXXXXXXX)',
      'RECEIPT_DIR=$(mktemp -d /tmp/gccgw-data-pack-wsl-receipt.XXXXXXXX)',
      'SOURCE_COMMIT=' + 'a'.repeat(40),
      'stage=physical; success=1; child_started=1',
      'printf \'{"outcome":"passed"}\' > "$RUN_DIR/physical-receipt.json"',
      mode === 'copy_failure' ? 'cp() { return 1; }' : '',
      mode === 'receipt_write_failure' ? 'mkdir "$RECEIPT_DIR/driver-receipt.json"' : '',
      finish, 'set +e', '(finish)', 'result=$?', 'set -e',
      mode === 'healthy'
        ? 'test "$result" = 0; test ! -e "$RUN_DIR"; test -f "$RECEIPT_DIR/physical-receipt.json"'
        : 'test "$result" = 1; test -d "$RUN_DIR"',
      'test "$RUN_DIR" != /tmp; test "$RECEIPT_DIR" != /tmp',
      'rm -rf -- "$RUN_DIR" "$RECEIPT_DIR"', 'printf \'cleanup_fixture_passed\\n\''
    ].join('\n') + '\n';
    const options = { input, encoding: 'utf8', timeout: 20000, maxBuffer: 16384 };
    const result = process.platform === 'win32'
      ? spawnSync('wsl.exe', ['-e', 'bash', '-s'], options)
      : spawnSync('/usr/bin/bash', ['-s'], options);
    assert.equal(result.status, 0, 'cleanup fixture failed: ' + mode);
    assert.match(result.stdout, /cleanup_fixture_passed/);
    assert.equal(result.stdout.includes('outcome=passed'), mode === 'healthy');
  });
}
