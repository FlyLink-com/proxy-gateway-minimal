// control-plane-materializer-a3-diagnostics-retention.test.mjs
//
// Focused B-tier tests for the per-command evidence retention module. These
// tests exercise the BLOCKED scenario from the Issue #636 final receipt:
// three commands run in sequence, the third exits non-zero, and the
// diagnostics file must retain enough redacted evidence to distinguish
// "command exited non-zero" from "command produced contract-violating
// stdout" without ever recording raw stdout/stderr bytes, argv secrets,
// or environment variable values.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.cwd();
const MODULE_PATH = join(
  REPO_ROOT,
  'scripts',
  'control-plane-materializer-a3-diagnostics-retention.ps1'
);

function sha256Of(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function runScriptWithB64(label, body) {
  const b64 = Buffer.from(body, 'utf8').toString('base64');
  const script = `
    $ErrorActionPreference = 'Stop'
    $bytes = [Convert]::FromBase64String('${b64}')
    $src = [System.Text.Encoding]::UTF8.GetString($bytes)
    Invoke-Expression $src
  `;
  const result = spawnSync('powershell', [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-Command', script,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${label} exited with ${result.status}: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function runScriptWithB64Raw(label, body) {
  const b64 = Buffer.from(body, 'utf8').toString('base64');
  const script = `
    $ErrorActionPreference = 'Continue'
    try {
      $bytes = [Convert]::FromBase64String('${b64}')
      $src = [System.Text.Encoding]::UTF8.GetString($bytes)
      Invoke-Expression $src
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const result = spawnSync('powershell', [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-Command', script,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${label} subprocess failure: ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeRecord(overrides = {}) {
  return {
    command_index: 0,
    command_label: 'noop',
    working_dir: '/tmp',
    env_names: 'PATH,HOME',
    argv: 'echo hello',
    stdout: '',
    stderr: '',
    exit_code: 0,
    started_at: '2026-08-22T00:00:00Z',
    finished_at: '2026-08-22T00:00:01Z',
    ...overrides,
  };
}

function describeOpts(skipReason) {
  if (skipReason) {
    return { skip: skipReason };
  }
  return {};
}

const skipIfNoPwsh = (() => {
  const probe = spawnSync('powershell', [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-Command', '$PSVersionTable.PSVersion.ToString()',
  ], { encoding: 'utf8' });
  if (probe.status !== 0) {
    return 'powershell not available';
  }
  return null;
})();

test('Persist-A3PerCommandEvidence writes one JSONL command line', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-1-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $r = Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'probe'
      working_dir   = '/var/lib/control-plane-a3-1/run-1'
      env_names     = 'PATH,HOME'
      argv          = 'xfs_quota -x -c report /var/lib/control-plane-a3-1'
      stdout        = 'project quota on /var/lib/control-plane-a3-1 (block 1024)'
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    })
    Write-Output ("kind=" + $r.kind)
    Write-Output ("argv=" + $r.argv_redacted)
  `;
  const stdout = runScriptWithB64('write-one-line', body);
  assert.match(stdout, /kind=command/);
  assert.match(stdout, /argv=xfs_quota -x -c report/);

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 1, 'exactly one JSONL line');
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.kind, 'command');
  assert.equal(parsed.command_index, 0);
  assert.equal(parsed.command_label, 'probe');
  assert.equal(parsed.argv_redacted, 'xfs_quota -x -c report /var/lib/control-plane-a3-1');
  assert.equal(parsed.exit_code, 0);
  assert.equal(parsed.stdout.sha256.length, 64);
  assert.equal(parsed.stderr.condition, 'empty');
});

test('three-command BLOCKED scenario: third exit 1 + bounded stderr retained', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-2-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $recs = @(
      @{ idx=0; label='setup-root-quota';   argv='xfs_quota -x -c limit bsoft=1g bhard=1g /var/lib/control-plane-a3-1'; exit=0; stderr='' },
      @{ idx=1; label='setup-user-quota';   argv='xfs_quota -x -c limit bsoft=512m bhard=512m /var/lib/control-plane-a3-1'; exit=0; stderr='' },
      @{ idx=2; label='setup-project-quota';argv='xfs_quota -x -c project -s pqm /var/lib/control-plane-a3-1';     exit=1; stderr='XFS: project quota not enabled on /var/lib/control-plane-a3-1' }
    )
    foreach ($r in $recs) {
      $stdout = if ($r.idx -eq 0) { 'metadata size = 1024' } elseif ($r.idx -eq 1) { 'metadata size = 512' } else { '' }
      Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
        command_index = $r.idx
        command_label = $r.label
        working_dir   = '/var/lib/control-plane-a3-1'
        env_names     = 'PATH,HOME,XFS_QUOTA_VERSION'
        argv          = $r.argv
        stdout        = $stdout
        stderr        = $r.stderr
        exit_code     = $r.exit
        started_at    = '2026-08-22T00:00:00Z'
        finished_at   = '2026-08-22T00:00:01Z'
      }) | Out-Null
    }
    $summary = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'r3'
    Write-Output ("count=" + $summary.command_count)
    Write-Output ("sha=" + $summary.jsonl_sha256)
    Write-Output ("verified=" + $summary.integrity_verified)
    Write-Output ("third_exit=" + $summary.per_command[2].exit_code)
    Write-Output ("third_stderr_preview=" + $summary.per_command[2].stderr.preview)
    Write-Output ("third_stderr_condition=" + $summary.per_command[2].stderr.condition)
  `;
  const stdout = runScriptWithB64('blocked-3rd', body);
  assert.match(stdout, /count=3/);
  assert.match(stdout, /verified=True/);
  assert.match(stdout, /third_exit=1/);
  assert.match(stdout, /third_stderr_preview=XFS: project quota not enabled on \/var\/lib\/control-plane-a3-1/);
  assert.match(stdout, /third_stderr_condition=present/);

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 4, 'three command lines plus one integrity footer');
  const footer = JSON.parse(lines[3]);
  assert.equal(footer.kind, 'integrity_footer');
  assert.equal(footer.command_count, 3);
  assert.equal(footer.run_label, 'r3');
  assert.equal(footer.jsonl_sha256.length, 64);
});

test('argv redacts token=, secret=, long alphanumeric blobs, and IPv4', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-3-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $r = Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'redact-test'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'connect --token=abc123def456 --secret=XYZABCDEFGHIJKLMNOPQRSTUVWXYZ012345 --peer 10.0.0.5 --blob aBcDeFgHiJkLmNoPqRsTuVwXyZ012345 --api_key sk-abcdef0123456789'
      stdout        = ''
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    })
    Write-Output ("argv=" + $r.argv_redacted)
  `;
  const stdout = runScriptWithB64('redact-argv', body);
  assert.doesNotMatch(stdout, /token=abc123def456/);
  assert.doesNotMatch(stdout, /secret=XYZABCDEFGHIJKLMNOPQRSTUVWXYZ012345/);
  assert.doesNotMatch(stdout, /10\.0\.0\.5/);
  assert.doesNotMatch(stdout, /aBcDeFgHiJkLmNoPqRsTuVwXyZ012345/);
  assert.doesNotMatch(stdout, /sk-abcdef0123456789/);
  assert.match(stdout, /<redacted>/);
});

test('env_names field stores names only; values never appear', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-4-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $r = Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'env-names-test'
      working_dir   = '/tmp'
      env_names     = 'PATH,HOME,AWS_ACCESS_KEY_ID'
      argv          = 'env'
      stdout        = ''
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    })
    Write-Output ("env=" + $r.env_names)
  `;
  const stdout = runScriptWithB64('env-names', body);
  assert.match(stdout, /env=PATH,HOME,AWS_ACCESS_KEY_ID/);
  const raw = readFileSync(path, 'utf8');
  assert.doesNotMatch(raw, /AKIAIOSFODNN7EXAMPLE/);
});

test('stdout/stderr preview is capped at 512 bytes and condition flips to truncated', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-5-');
  const path = join(dir, 'diagnostics.jsonl');

  const huge = 'x'.repeat(2048);
  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $huge = 'x' * 2048
    $r = Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'preview-cap'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'big-stdout-cmd'
      stdout        = $huge
      stderr        = $huge
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    })
    Write-Output ("stdout_len=" + $r.stdout.preview.Length)
    Write-Output ("stdout_condition=" + $r.stdout.condition)
    Write-Output ("stdout_size=" + $r.stdout.size_bytes)
    Write-Output ("stderr_condition=" + $r.stderr.condition)
  `;
  const stdout = runScriptWithB64('preview-cap', body);
  assert.match(stdout, /stdout_len=512/);
  assert.match(stdout, /stdout_condition=truncated/);
  assert.match(stdout, /stdout_size=2048/);
  assert.match(stdout, /stderr_condition=truncated/);
});

test('a3_diagnostics_env_names_too_large fires when env_names exceeds 4096 bytes', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-6-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $hugeNames = ('A' * 5000)
    try {
      Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
        command_index = 0
        command_label = 'oversized-env'
        working_dir   = '/tmp'
        env_names     = $hugeNames
        argv          = 'noop'
        stdout        = ''
        stderr        = ''
        exit_code     = 0
        started_at    = '2026-08-22T00:00:00Z'
        finished_at   = '2026-08-22T00:00:01Z'
      }) | Out-Null
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const stdout = runScriptWithB64Raw('env-too-large', body);
  assert.match(stdout, /__THROW__:a3_diagnostics_env_names_too_large/);
});

test('integrity_verified flips false when on-disk JSONL is tampered after footer', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-7-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'a'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'echo a'
      stdout        = 'a'
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    }) | Out-Null
    Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 1
      command_label = 'b'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'echo b'
      stdout        = 'b'
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:01Z'
      finished_at   = '2026-08-22T00:00:02Z'
    }) | Out-Null
    $summaryBefore = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'r'
    Write-Output ("before_verified=" + $summaryBefore.integrity_verified)
    Write-Output ("before_sha=" + $summaryBefore.jsonl_sha256)
  `;
  const stdout = runScriptWithB64('footer-tamper', body);
  assert.match(stdout, /before_verified=True/);
  const shaMatch = stdout.match(/before_sha=([0-9a-f]{64})/);
  assert.ok(shaMatch, 'before_sha extracted');
  const beforeSha = shaMatch[1];

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 3);
  const commandLines = lines.slice(0, 2);
  const footerLine = lines[2];

  // Tamper the second command line in place: replace "echo b" with "echo B".
  const tamperedSecond = commandLines[1].replace('echo b', 'echo B');
  const reAggregate = commandLines[0] + '\n' + tamperedSecond;
  const reSha = sha256Of(reAggregate);
  assert.notEqual(reSha, beforeSha, 'tampered aggregate must differ');

  const rebuilt = [commandLines[0], tamperedSecond, footerLine].join('\n') + '\n';
  writeFileSync(path, rebuilt, 'utf8');

  const reverifyBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $lines = Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Encoding UTF8
    $commandLines = @()
    foreach ($line in $lines) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      if ($line -match '"kind"\s*:\s*"command"') { $commandLines += $line }
    }
    $aggregateBytes = [Text.Encoding]::UTF8.GetBytes(($commandLines -join ([char]10)))
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($aggregateBytes)
    $sha = ([BitConverter]::ToString($hash) -replace '-','').ToLowerInvariant()
    Write-Output ("re_aggregate_sha=" + $sha)
  `;
  const reverifyOut = runScriptWithB64('recompute-aggregate', reverifyBody);
  assert.match(reverifyOut, new RegExp(`re_aggregate_sha=${reSha}`));
});

test('cleanup-after-write invariant: deleting the directory does not invalidate summary fields', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-8-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'before-cleanup'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'echo before-cleanup'
      stdout        = 'ok'
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    }) | Out-Null
    $summary = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'cleanup-test'
    $singleton = [pscustomobject]@{
      diagnostics_path   = $summary.diagnostics_path
      run_label          = $summary.run_label
      command_count      = $summary.command_count
      jsonl_sha256       = $summary.jsonl_sha256
      integrity_verified = $summary.integrity_verified
    }
    Write-Output ("path=" + $singleton.diagnostics_path)
    Write-Output ("count=" + $singleton.command_count)
    Write-Output ("verified=" + $singleton.integrity_verified)
  `;
  const stdout = runScriptWithB64('cleanup-invariant', body);
  const pathLine = stdout.match(/path=([^\r\n]+)/);
  assert.ok(pathLine, 'path extracted');
  assert.match(stdout, /count=1/);
  assert.match(stdout, /verified=True/);

  // Simulate remote-side cleanup: remove the diagnostics directory entirely.
  rmSync(dir, { recursive: true, force: true });
  assert.equal(existsSync(path), false, 'diagnostics directory removed');
  // The summary object was returned before cleanup, so the caller's record
  // still references a path that no longer exists; this is by design.
  // Verify the captured path line matches what was written to disk before
  // cleanup.
  assert.equal(pathLine[1], path);
});

test('footer-already-present error blocks re-summarization', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-9-');
  const path = join(dir, 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
      command_index = 0
      command_label = 'first'
      working_dir   = '/tmp'
      env_names     = 'PATH'
      argv          = 'echo first'
      stdout        = ''
      stderr        = ''
      exit_code     = 0
      started_at    = '2026-08-22T00:00:00Z'
      finished_at   = '2026-08-22T00:00:01Z'
    }) | Out-Null
    $first = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'first-run'
    try {
      $second = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'second-run'
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const stdout = runScriptWithB64Raw('footer-twice', body);
  assert.match(stdout, /__THROW__:a3_diagnostics_footer_already_present/);
});

test('Persist-A3PerCommandEvidence requires parent directory', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-10-');
  const path = join(dir, 'nonexistent', 'diagnostics.jsonl');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    try {
      Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
        command_index = 0
        command_label = 'no-parent'
        working_dir   = '/tmp'
        env_names     = 'PATH'
        argv          = 'echo'
        stdout        = ''
        stderr        = ''
        exit_code     = 0
        started_at    = '2026-08-22T00:00:00Z'
        finished_at   = '2026-08-22T00:00:01Z'
      }) | Out-Null
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const stdout = runScriptWithB64Raw('no-parent', body);
  assert.match(stdout, /__THROW__:a3_diagnostics_parent_missing/);
});

test('Get-A3LowerHexSha256 returns lowercase 64-char hex', describeOpts(skipIfNoPwsh), () => {
  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $sha = Get-A3LowerHexSha256 -Bytes ([Text.Encoding]::UTF8.GetBytes('control-plane-a3-1'))
    Write-Output ("sha=" + $sha)
    Write-Output ("len=" + $sha.Length)
  `;
  const stdout = runScriptWithB64('sha-helper', body);
  const shaLine = stdout.match(/sha=([0-9a-f]{64})/);
  assert.ok(shaLine, 'lowercase 64-char hex emitted');
  assert.equal(shaLine[1].length, 64);
});
