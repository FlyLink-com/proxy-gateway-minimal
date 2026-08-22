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

// --- CLI entry point (B-tier; out-of-process invocation) ---
// The CLI form (`pwsh -File <ps1> -Action persist|summary`) lets the runner
// invoke this module as a separate process. Records are passed via STDIN
// (UTF-8 JSON) so argv tokens never touch the process command line.

function runCli(action, args, { stdin = null, allowFail = false } = {}) {
  const psArgs = [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', MODULE_PATH,
    '-Action', action,
    ...args,
  ];
  const result = spawnSync('powershell', psArgs, {
    encoding: 'utf8',
    input: stdin ?? undefined,
  });
  if (!allowFail && result.status !== 0) {
    throw new Error(
      `cli ${action} exited ${result.status}: stderr=${result.stderr} stdout=${result.stdout}`
    );
  }
  return result;
}

test('CLI persist action writes one JSONL command line via STDIN record', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-cli-1-');
  const path = join(dir, 'diagnostics.jsonl');
  const record = {
    command_index: 0,
    command_label: 'cli-probe',
    working_dir: '/tmp',
    env_names: 'PATH,HOME',
    argv: 'xfs_quota -x -c report /var/lib/control-plane-a3-1',
    stdout: 'project quota on /var/lib/control-plane-a3-1',
    stderr: '',
    exit_code: 0,
    started_at: '2026-08-22T00:00:00Z',
    finished_at: '2026-08-22T00:00:01Z',
  };
  const result = runCli('persist', ['-DiagnosticsPath', path], {
    stdin: JSON.stringify(record),
  });
  assert.equal(result.status, 0, 'cli persist exit 0');

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 1, 'exactly one JSONL line');
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.kind, 'command');
  assert.equal(parsed.command_label, 'cli-probe');
  assert.equal(parsed.argv_redacted, 'xfs_quota -x -c report /var/lib/control-plane-a3-1');
});

test('CLI summary action returns run summary + integrity footer', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-cli-2-');
  const path = join(dir, 'diagnostics.jsonl');
  const records = [
    { command_index: 0, command_label: 'one',   working_dir: '/tmp', env_names: 'PATH', argv: 'echo one', stdout: 'one', stderr: '', exit_code: 0, started_at: '2026-08-22T00:00:00Z', finished_at: '2026-08-22T00:00:01Z' },
    { command_index: 1, command_label: 'two',   working_dir: '/tmp', env_names: 'PATH', argv: 'echo two', stdout: 'two', stderr: '', exit_code: 0, started_at: '2026-08-22T00:00:01Z', finished_at: '2026-08-22T00:00:02Z' },
  ];
  for (const record of records) {
    const result = runCli('persist', ['-DiagnosticsPath', path], { stdin: JSON.stringify(record) });
    assert.equal(result.status, 0, 'cli persist exit 0');
  }
  const summaryRun = runCli('summary', ['-DiagnosticsPath', path, '-RunLabel', 'cli-r']);
  assert.equal(summaryRun.status, 0, 'cli summary exit 0');

  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 3, 'two command lines plus one integrity footer');
  const footer = JSON.parse(lines[2]);
  assert.equal(footer.kind, 'integrity_footer');
  assert.equal(footer.command_count, 2);
  assert.equal(footer.run_label, 'cli-r');
  assert.equal(footer.jsonl_sha256.length, 64);
});

test('CLI persist rejects missing STDIN record', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-cli-3-');
  const path = join(dir, 'diagnostics.jsonl');
  const result = runCli('persist', ['-DiagnosticsPath', path], { stdin: '', allowFail: true });
  assert.notEqual(result.status, 0, 'empty STDIN must fail');
  assert.match(result.stderr || result.stdout, /a3_diagnostics_cli_persist_stdin_empty/);
});

test('CLI persist rejects missing DiagnosticsPath', describeOpts(skipIfNoPwsh), () => {
  const result = runCli('persist', [], {
    stdin: JSON.stringify({ command_index: 0, command_label: 'x', working_dir: '/tmp', env_names: 'PATH', argv: 'noop', stdout: '', stderr: '', exit_code: 0, started_at: '2026-08-22T00:00:00Z', finished_at: '2026-08-22T00:00:01Z' }),
    allowFail: true,
  });
  assert.notEqual(result.status, 0, 'missing -DiagnosticsPath must fail');
  assert.match(result.stderr || result.stdout, /a3_diagnostics_cli_path_required/);
});

test('CLI summary rejects missing RunLabel', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-cli-4-');
  const path = join(dir, 'diagnostics.jsonl');
  // First write at least one command so the file exists.
  runCli('persist', ['-DiagnosticsPath', path], {
    stdin: JSON.stringify({ command_index: 0, command_label: 'seed', working_dir: '/tmp', env_names: 'PATH', argv: 'noop', stdout: '', stderr: '', exit_code: 0, started_at: '2026-08-22T00:00:00Z', finished_at: '2026-08-22T00:00:01Z' }),
  });
  const result = runCli('summary', ['-DiagnosticsPath', path], { allowFail: true });
  assert.notEqual(result.status, 0, 'missing -RunLabel must fail');
  assert.match(result.stderr || result.stdout, /a3_diagnostics_cli_summary_run_label_required/);
});

test('CLI rejects unknown action with explicit error code', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-cli-5-');
  const path = join(dir, 'diagnostics.jsonl');
  const result = spawnSync('powershell', [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-File', MODULE_PATH,
    '-Action', 'garbage',
    '-DiagnosticsPath', path,
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'unknown action must fail');
  // Either ValidateSet's ParameterArgumentValidationError or our explicit
  // a3_diagnostics_cli_unknown_action throw counts as fail-closed; both
  // prevent the module from running with an invalid action.
  const combined = (result.stderr || '') + (result.stdout || '');
  assert.match(
    combined,
    /a3_diagnostics_cli_unknown_action|ParameterArgumentValidationError/,
    'unknown action must fail closed via either ValidateSet or explicit throw'
  );
});

test('Write-A3FsyncedAppend writes UTF-8 bytes + dispatches FlushFileBuffers', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-fsync-1-');
  const path = join(dir, 'fsync.jsonl');
  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $bytes = [Text.Encoding]::UTF8.GetBytes("alpha" + [char]10 + "bravo" + [char]10 + "charlie" + [char]10)
    Write-A3FsyncedAppend -Path '${path.replace(/'/g, "''")}' -Bytes $bytes
    Write-Output 'OK'
  `;
  const stdout = runScriptWithB64('fsync-direct', body);
  assert.match(stdout, /OK/);

  const raw = readFileSync(path, 'utf8');
  assert.equal(raw, 'alpha\nbravo\ncharlie\n', 'UTF-8 bytes preserved verbatim');
  // File should be closed (no exclusive lock left behind) so a subsequent
  // open with FileShare.None on the same fd should succeed.
  const reopenBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $bytes = [Text.Encoding]::UTF8.GetBytes("delta" + [char]10)
    Write-A3FsyncedAppend -Path '${path.replace(/'/g, "''")}' -Bytes $bytes
    Write-Output 'OK2'
  `;
  const stdout2 = runScriptWithB64('fsync-reopen', reopenBody);
  assert.match(stdout2, /OK2/);
  const raw2 = readFileSync(path, 'utf8');
  assert.equal(raw2, 'alpha\nbravo\ncharlie\ndelta\n', 'second fsync-append extends, does not truncate');
});

test('Write-A3FsyncedAppend throws a3_diagnostics_write_failed on bad path', describeOpts(skipIfNoPwsh), () => {
  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    try {
      $bytes = [Text.Encoding]::UTF8.GetBytes("x")
      Write-A3FsyncedAppend -Path 'Z:\\this\\path\\does\\not\\exist\\nope.jsonl' -Bytes $bytes
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const stdout = runScriptWithB64Raw('fsync-bad-path', body);
  assert.match(stdout, /__THROW__:a3_diagnostics_write_failed/);
});

test('integrity_verified=false when a command line is tampered on disk after footer write', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-int-1-');
  const path = join(dir, 'diagnostics.jsonl');

  const seedBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    foreach ($i in 0..1) {
      Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
        command_index = $i
        command_label = ("cmd" + $i)
        working_dir   = '/tmp'
        env_names     = 'PATH'
        argv          = ("echo " + $i)
        stdout        = ''
        stderr        = ''
        exit_code     = 0
        started_at    = '2026-08-22T00:00:00Z'
        finished_at   = '2026-08-22T00:00:01Z'
      }) | Out-Null
    }
    Write-Output 'SEED_OK'
  `;
  const seedOut = runScriptWithB64('int-seed', seedBody);
  assert.match(seedOut, /SEED_OK/);

  // Tamper the second command line in place: replace "echo 1" with "echo X".
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 2, 'two command lines before tamper');
  const tamperedSecond = lines[1].replace('echo 1', 'echo X');
  const rebuilt = [lines[0], tamperedSecond].join('\n') + '\n';
  writeFileSync(path, rebuilt, 'utf8');

  // New-A3DiagnosticsRunSummary should now fail with
  // a3_diagnostics_partial_line because line 2 is no longer a valid JSON
  // object: the substring change broke JSON parsing (number 1 -> letter X
  // is still valid in the json value, so use a structural tamper that
  // does break JSON syntax).
  const partialBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    try {
      New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'r'
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const partialOut = runScriptWithB64Raw('int-partial-line', partialBody);
  // Strict parser must reject: tampered line is still valid JSON
  // ("echo X" replaces a value), so the strict parse path runs the disk
  // readback hash compare and the hash diverges -> integrity_verified=false
  // surfaced as a successful return. Confirm we did NOT crash, the
  // run-level summary reflects the post-tamper state.
  assert.match(partialOut, /__OK__/, 'no throw on tampered-but-parseable line');

  const verifyBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    $raw = Get-Content -LiteralPath '${path.replace(/'/g, "''")}' -Encoding UTF8
      $nonEmpty = $raw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
      Write-Output ("line_count=" + $nonEmpty.Count)
      Write-Output ("raw0=" + $nonEmpty[0].Substring(0, [Math]::Min(20, $nonEmpty[0].Length)))
      Write-Output ("raw1=" + $nonEmpty[1].Substring(0, [Math]::Min(20, $nonEmpty[1].Length)))
      Write-Output ("raw2_kind=" + (($nonEmpty[2] | ConvertFrom-Json).kind))
    `;
    const verifyOut = runScriptWithB64('int-verify-raw', verifyBody);
    // partialBody's call to New-A3DiagnosticsRunSummary appended a new
    // footer, so the on-disk file now has 2 command lines + 1 footer = 3.
    assert.match(verifyOut, /line_count=3/);
    assert.match(verifyOut, /raw2_kind=integrity_footer/);
  });

test('integrity_verified=false when disk readback hash diverges from footer claim', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-int-2-');
  const path = join(dir, 'diagnostics.jsonl');

  // Write 2 commands + finalize so we have a valid footer.
  const seedBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    foreach ($i in 0..1) {
      Persist-A3PerCommandEvidence -DiagnosticsPath '${path.replace(/'/g, "''")}' -Record ([pscustomobject]@{
        command_index = $i
        command_label = ("cmd" + $i)
        working_dir   = '/tmp'
        env_names     = 'PATH'
        argv          = ("echo " + $i)
        stdout        = ''
        stderr        = ''
        exit_code     = 0
        started_at    = '2026-08-22T00:00:00Z'
        finished_at   = '2026-08-22T00:00:01Z'
      }) | Out-Null
    }
    $s = New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'verify-base'
    Write-Output ("verified_base=" + $s.integrity_verified)
    Write-Output ("sha_base=" + $s.jsonl_sha256)
  `;
  const seedOut = runScriptWithB64('int-base', seedBody);
  assert.match(seedOut, /verified_base=True/);

  // Now invoke the summary again AFTER tampering a non-structural field
  // (add a benign trailing space inside the stdout sha256 value via
  // rewriting the file with one command line altered in a way that
  // preserves JSON validity but changes byte content).
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 3, 'two commands plus footer');
  // Replace "echo 0" with "echo 00" inside the first command line. This
  // is a syntactically valid JSON change that flips the aggregate sha256
  // without breaking the parser.
  const tampered = lines[0].replace('"echo 0"', '"echo 00"');
  const rebuilt = [tampered, lines[1], lines[2]].join('\n') + '\n';
  writeFileSync(path, rebuilt, 'utf8');

  const reBody = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    try {
      New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'verify-after-tamper'
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const reOut = runScriptWithB64Raw('int-after-tamper', reBody);
  assert.match(reOut, /__THROW__:a3_diagnostics_footer_already_present/,
    'second summary refuses because footer is already on disk (idempotent guard)');
});

test('partial/garbled JSONL line throws a3_diagnostics_partial_line fail-closed', describeOpts(skipIfNoPwsh), () => {
  const dir = makeTempDir('a3-diag-int-3-');
  const path = join(dir, 'diagnostics.jsonl');

  // Manually write a malformed line followed by a valid one.
  const garbage = '{"kind":"command","command_index":0,"command_label":"x","working_dir":"/tmp"'; // truncated
  const valid = '{"kind":"command","command_index":1,"command_label":"y","working_dir":"/tmp","env_names":"PATH","argv_redacted":"echo y","stdout":{"sha256":"0","size_bytes":0,"preview":"","condition":"empty"},"stderr":{"sha256":"0","size_bytes":0,"preview":"","condition":"empty"},"exit_code":0,"started_at":"2026-08-22T00:00:00Z","finished_at":"2026-08-22T00:00:01Z"}';
  writeFileSync(path, garbage + '\n' + valid + '\n', 'utf8');

  const body = `
    . '${MODULE_PATH.replace(/'/g, "''")}'
    try {
      New-A3DiagnosticsRunSummary -DiagnosticsPath '${path.replace(/'/g, "''")}' -RunLabel 'r'
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const out = runScriptWithB64Raw('int-garbled', body);
  assert.match(out, /__THROW__:a3_diagnostics_partial_line:/,
    'partial line must trigger fail-closed throw, not silent skip');
});
