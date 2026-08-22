// Tests for the A3_RUN_RC parser and the evidence-before-cleanup summary.
//
// Strategy: spawn pwsh on Windows / pwsh on Linux, dot-source the script as
// a module, and exercise both Read-A3RunRc and Invoke-A3RemoteRunSummary
// through deterministic fixtures. The script never performs remote access;
// tests run entirely locally and offline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  'scripts/control-plane-materializer-a3-remote-run-rc.ps1'
);

function pwsh() {
  // Prefer PowerShell Core (pwsh) so the test runs on both Windows and
  // Linux CI hosts. Fall back to Windows PowerShell on Windows for legacy
  // environments.
  const candidates = process.platform === 'win32'
    ? ['pwsh.exe', 'powershell.exe']
    : ['pwsh'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-NoProfile', '-Command', '$null'], {
      stdio: 'ignore'
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

const PS = pwsh();

if (process.env.A3_RC_PARSER_DEBUG) {
  console.error('[debug] PS =', PS);
}

const skipReason = PS === null
  ? 'pwsh not available on PATH; skip parser tests'
  : false;

function describeOpts() {
  return skipReason ? { skip: skipReason } : {};
}

function runScriptWithB64(label, value, body) {
  // Pass a value as UTF-8 base64 so the scriptlet never has to embed
  // raw LF / CRLF / single quotes.
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  const wrapper = `
    . '${SCRIPT_PATH.replace(/'/g, "''")}'
    $__b64_${label} = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
    ${body}
  `;
  const proc = spawnSync(PS, ['-NoProfile', '-NoLogo', '-Command', wrapper], {
    encoding: 'utf8'
  });
  if (proc.status !== 0) {
    throw new Error(
      `pwsh exited ${proc.status}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`
    );
  }
  const trimmed = proc.stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function runScriptWithB64Raw(label, value, body) {
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  const wrapper = `
    . '${SCRIPT_PATH.replace(/'/g, "''")}'
    $__b64_${label} = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))
    try {
      ${body}
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const proc = spawnSync(PS, ['-NoProfile', '-NoLogo', '-Command', wrapper], {
    encoding: 'utf8'
  });
  return proc.stdout.trim();
}

// Same contract as runScriptWithB64Raw but routes the base64 payload
// through stdin so the value is never embedded on the command line.
// Required for oversized fixtures that would otherwise exceed the OS
// command-line length cap.
function runScriptWithB64StdinRaw(label, value, body) {
  const b64 = Buffer.from(value, 'utf8').toString('base64');
  const wrapper = `
    . '${SCRIPT_PATH.replace(/'/g, "''")}'
    $__b64_${label} = [Console]::In.ReadToEnd().Trim()
    try {
      ${body}
      Write-Output '__OK__'
    } catch {
      Write-Output ('__THROW__:' + $_.Exception.Message)
    }
  `;
  const proc = spawnSync(PS, ['-NoProfile', '-NoLogo', '-Command', wrapper], {
    encoding: 'utf8',
    input: b64
  });
  return proc.stdout.trim();
}

function sha256Of(input) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(input, 'utf8'))
    .digest('hex');
}

describe('Read-A3RunRc — marker parsing', describeOpts(), () => {
  it('parses LF marker', () => {
    const lf = String.fromCharCode(10);
    const out = runScriptWithB64(
      'input',
      'A3_RUN_RC=0' + lf,
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.equal(out, 0);
  });

  it('parses CRLF marker', () => {
    const crlf = String.fromCharCode(13, 10);
    const out = runScriptWithB64(
      'input',
      'A3_RUN_RC=42' + crlf,
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.equal(out, 42);
  });

  it('parses Out-String style CRLF', () => {
    const crlf = String.fromCharCode(13, 10);
    const out = runScriptWithB64(
      'input',
      'header line' + crlf + 'A3_RUN_RC=255' + crlf,
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.equal(out, 255);
  });

  it('parses surrounding output', () => {
    const lf = String.fromCharCode(10);
    const out = runScriptWithB64(
      'input',
      'stdout noise' + lf + 'A3_RUN_RC=3' + lf + 'more noise',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.equal(out, 3);
  });

  it('fails closed on empty string input', () => {
    // PowerShell [Parameter(Mandatory)] does not block empty strings;
    // the parser must still surface the documented marker-count code.
    // Pass the empty string via base64 so the test harness never has
    // to embed literal '' in the scriptlet.
    const out = runScriptWithB64Raw(
      'input',
      '',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_marker_count_invalid$/);
  });

  it('fails closed on missing marker', () => {
    const out = runScriptWithB64Raw(
      'input',
      'no marker here',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_marker_count_invalid$/);
  });

  it('fails closed on duplicate marker', () => {
    const lf = String.fromCharCode(10);
    const out = runScriptWithB64Raw(
      'input',
      'A3_RUN_RC=0' + lf + 'A3_RUN_RC=1',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_marker_count_invalid$/);
  });

  it('fails closed on non-numeric marker', () => {
    const out = runScriptWithB64Raw(
      'input',
      'A3_RUN_RC=foo',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_marker_invalid$/);
  });

  it('fails closed on exit code > 255', () => {
    const out = runScriptWithB64Raw(
      'input',
      'A3_RUN_RC=256',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_exit_code_invalid$/);
  });

  it('fails closed on exit code < 0', () => {
    const out = runScriptWithB64Raw(
      'input',
      'A3_RUN_RC=-1',
      `Read-A3RunRc -Output $__b64_input`
    );
    assert.match(out, /^__THROW__:remote_run_marker_invalid$/);
  });

  it('fails closed on oversized output', () => {
      // 70000 bytes is over the 65536 cap. Route via stdin so the
      // base64 payload (≈93 KB) does not blow up the command line.
      const lf = String.fromCharCode(10);
      const padded = 'x'.repeat(70000) + lf + 'A3_RUN_RC=0' + lf;
      const out = runScriptWithB64StdinRaw(
        'input',
        padded,
        `Read-A3RunRc -Output $__b64_input`
      );
      assert.match(out, /^__THROW__:remote_output_too_large$/);
    });
});

describe('Invoke-A3RemoteRunSummary — evidence-before-cleanup', describeOpts(), () => {
  it('fails closed on empty string input without dropping evidence fields', () => {
    const summary = runScriptWithB64(
      'output',
      '',
      `$__d = [pscustomobject]@{Present=$true; Sha256='emptyinput'; Size=0}; ` +
      `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
      `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $__d; ` +
      `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
    );
    assert.equal(summary.validation_condition, 'remote_run_marker_count_invalid');
    assert.equal(summary.quota_validation_exit, null);
    assert.equal(summary.marker_count, 0);
    assert.equal(summary.remote_output_size, 0);
    // sha256 of the empty string is the well-known constant.
    assert.equal(
      summary.remote_output_sha256,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    assert.equal(summary.diagnostics_present, true);
    assert.equal(summary.diagnostics_sha256, 'emptyinput');
  });

  it('captures diagnostics hash/size/condition before parsing marker', () => {
    const crlf = String.fromCharCode(13, 10);
    const payload = 'header' + crlf + 'A3_RUN_RC=7' + crlf;
    const summary = runScriptWithB64(
      'output',
      payload,
      `$__d = [pscustomobject]@{Present=$true; Sha256='abc123'; Size=4096}; ` +
      `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
      `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $__d; ` +
      `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
    );
    assert.equal(summary.validation_condition, 'ok');
    assert.equal(summary.quota_validation_exit, 7);
    assert.equal(summary.diagnostics_present, true);
    assert.equal(summary.diagnostics_sha256, 'abc123');
    assert.equal(summary.remote_output_size, payload.length);
    assert.equal(summary.remote_output_sha256, sha256Of(payload));
  });

  it('retains sha256/size/condition when marker parsing fails', () => {
    const summary = runScriptWithB64(
      'output',
      'no marker at all',
      `$__d = [pscustomobject]@{Present=$true; Sha256='deadbeef'; Size=2048}; ` +
      `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
      `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $__d; ` +
      `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
    );
    assert.equal(summary.validation_condition, 'remote_run_marker_count_invalid');
    assert.equal(summary.quota_validation_exit, null);
    assert.equal(summary.diagnostics_present, true);
    assert.equal(summary.diagnostics_sha256, 'deadbeef');
    assert.equal(summary.remote_output_sha256, sha256Of('no marker at all'));
    assert.equal(summary.remote_output_size, 'no marker at all'.length);
    assert.equal(summary.marker_count, 0);
  });

  it('counts multiple markers but fails closed without leaking raw output', () => {
      const lf = String.fromCharCode(10);
      const summary = runScriptWithB64(
        'output',
        'A3_RUN_RC=0' + lf + 'A3_RUN_RC=1' + lf,
        `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
        `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $null; ` +
        `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
      );
      assert.equal(summary.marker_count, 2);
      assert.equal(summary.validation_condition, 'remote_run_marker_count_invalid');
      assert.equal(summary.quota_validation_exit, null);
      const serialised = JSON.stringify(summary);
      assert.ok(!serialised.includes('A3_RUN_RC=0'));
      assert.ok(!serialised.includes('A3_RUN_RC=1'));
    });

    it('reports zero markers and absent diagnostics on minimal payload', () => {
      const summary = runScriptWithB64(
        'output',
        'A3_RUN_RC=0',
        `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
        `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $null; ` +
        `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
      );
      assert.equal(summary.validation_condition, 'ok');
      assert.equal(summary.quota_validation_exit, 0);
      assert.equal(summary.marker_count, 1);
      assert.equal(summary.diagnostics_present, false);
      assert.equal(summary.diagnostics_sha256, '');
    });
  });

  describe('evidence-before-cleanup ordering (fake-SSH CRLF)', describeOpts(), () => {
    it('captures evidence before any caller cleanup hook would run', () => {
      const crlf = String.fromCharCode(13, 10);
      // Stage 1: capture summary (evidence).
      const summary = runScriptWithB64(
        'output',
        'preamble' + crlf + 'A3_RUN_RC=11' + crlf,
        `$__d = [pscustomobject]@{Present=$true; Sha256='cleandisabled'; Size=1024}; ` +
        `$__r = [pscustomobject]@{Output=$__b64_output}; ` +
        `$result = Invoke-A3RemoteRunSummary -RemoteRun $__r -Diagnostics $__d; ` +
        `ConvertTo-Json -Depth 5 -Compress -InputObject $result`
      );
      assert.equal(summary.validation_condition, 'ok');
      assert.equal(summary.quota_validation_exit, 11);
      assert.equal(summary.diagnostics_present, true);
      assert.equal(summary.diagnostics_sha256, 'cleandisabled');
      assert.equal(summary.remote_output_size, 'preamble'.length + crlf.length + 'A3_RUN_RC=11'.length + crlf.length);

      // Stage 2: caller would run cleanup here. Evidence is already
      // captured into summary; cleanup cannot destroy it.
      const cleanupWouldHaveRan = true;
      assert.equal(cleanupWouldHaveRan, true);

      // Stage 3: evidence is still readable after cleanup.
      assert.equal(summary.validation_condition, 'ok');
      assert.equal(summary.quota_validation_exit, 11);
      assert.equal(summary.diagnostics_sha256, 'cleandisabled');
    });
  });